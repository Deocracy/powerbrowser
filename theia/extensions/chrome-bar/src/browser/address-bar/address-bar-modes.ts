import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { ApplicationShell, KeybindingRegistry } from '@theia/core/lib/browser';
import { CancellationToken, CommandRegistry } from '@theia/core/lib/common';
import { WebTabWidget } from '@powerbrowser/tab-uris/lib/browser/web-tab';
import { ChromeStoreClient } from '@powerbrowser/tab-uris/lib/browser/chrome-store-client';
import type { Row } from './address-bar-rows';
import { LOCAL_MODES, LocalModeId } from './address-bar-mode-table';
import { CHROME_BAR_COPY } from '../chrome-bar-copy';
import { CHROME_BAR_COMMAND_CATEGORY } from '../chrome-bar-commands';

/**
 * Phase 30 (D-06): one address-bar mode, contributed through
 * AddressBarModeContribution. Engines are not contributions: their modes are
 * generated from chrome's engine list (D-07). The static fields mirror
 * LOCAL_MODES in address-bar-mode-table.ts; the label comes from
 * CHROME_BAR_COPY.modeLabels.
 */
export interface AddressBarMode {
    id: LocalModeId;
    label: string;
    iconClass: string;
    restrictToken?: string;
    provide?(text: string, token: CancellationToken): Promise<Row[]>;
}

/**
 * The contribution point, bound with bindContributionProvider at module load
 * (D-50: a contribution bound after first enumeration is invisible). A mode
 * that is not contributed is absent from the menu, and a default naming it
 * falls back to Address.
 */
export const AddressBarModeContribution = Symbol('AddressBarModeContribution');

type LabelledModeId = keyof typeof CHROME_BAR_COPY.modeLabels;

/** A built-in mode's static fields, read from its LOCAL_MODES row and its modeLabels copy. */
@injectable()
abstract class BuiltInAddressBarMode implements AddressBarMode {
    abstract readonly id: LabelledModeId;

    get label(): string {
        return CHROME_BAR_COPY.modeLabels[this.id];
    }

    get iconClass(): string {
        return LOCAL_MODES.find(entry => entry.id === this.id)?.iconClass ?? 'codicon-search';
    }

    get restrictToken(): string | undefined {
        return LOCAL_MODES.find(entry => entry.id === this.id)?.restrictToken;
    }

    abstract provide(text: string, token: CancellationToken): Promise<Row[]>;
}

/** True when `text` is empty or `values` contains it, case-insensitively. */
function matches(text: string, ...values: string[]): boolean {
    const needle = text.toLocaleLowerCase();
    return !needle || values.some(value => value.toLocaleLowerCase().includes(needle));
}

/**
 * SMODE-01, Tabs: every in-shell web tab with a page except the current one,
 * most recently used first, filtered on title and URL. The order is an
 * in-memory list of activations this mode records itself from the dock's
 * current tab (the signal the pill follows: a web tab's node never takes DOM
 * focus, so the focus-derived current widget never names it); tabs not
 * activated this session follow in tab-strip order (30-RESEARCH A7). Rows
 * carry the widget id, so two tabs on one URL are two rows.
 */
@injectable()
export class TabsAddressBarMode extends BuiltInAddressBarMode {
    readonly id = 'tabs';

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    /** Widget ids, the most recently activated first. */
    protected recent: string[] = [];

    @postConstruct()
    protected init(): void {
        this.shell.mainPanel.onDidChangeCurrent(title => {
            const owner = title?.owner;
            if (owner instanceof WebTabWidget) {
                this.recent = [owner.id, ...this.recent.filter(id => id !== owner.id)];
            }
        });
    }

    async provide(text: string): Promise<Row[]> {
        const current = this.shell.mainPanel.currentTitle?.owner;
        const tabs = this.shell.getWidgets('main')
            .filter((w): w is WebTabWidget => w instanceof WebTabWidget && w.hasPage);
        this.recent = this.recent.filter(id => tabs.some(w => w.id === id));
        const rank = (w: WebTabWidget): number => {
            const at = this.recent.indexOf(w.id);
            return at < 0 ? this.recent.length + tabs.indexOf(w) : at;
        };
        return tabs
            .filter(w => w !== current && matches(text, w.title.label, w.url))
            .sort((a, b) => rank(a) - rank(b))
            .map((w): Row => ({ key: 'tab:' + w.id, source: 'tab', title: w.title.label || w.url, caption: w.url, url: w.url, widgetId: w.id }));
    }
}

/**
 * SMODE-01, Bookmarks and History: one Places source each, read chrome-side
 * through the searchPlaces kind's restrict field (searchPlacesRestricted):
 * newest first, empty text included, at most the mode's LOCAL_MODES cap. A
 * rejected read rejects, so the address bar shows the mode's failure row. A
 * bookmarked visit is a bookmark row, so Shift+Delete keeps its Phase 29 rule.
 */
@injectable()
abstract class PlacesAddressBarMode extends BuiltInAddressBarMode {
    abstract readonly restrict: 'bookmark' | 'history';

    @inject(ChromeStoreClient)
    protected readonly store: ChromeStoreClient;

    async provide(text: string): Promise<Row[]> {
        const cap = LOCAL_MODES.find(entry => entry.id === this.id)?.cap ?? 10;
        const places = await this.store.searchPlaces(text, cap, this.restrict);
        return places.map((place): Row => {
            const source = this.restrict === 'bookmark' || place.bookmarked ? 'bookmark' : 'history';
            return { key: `${source}:${place.url}`, source, title: place.title || place.url, caption: place.url, url: place.url };
        });
    }
}

@injectable()
export class BookmarksAddressBarMode extends PlacesAddressBarMode {
    readonly id = 'bookmarks';
    readonly restrict = 'bookmark';
}

@injectable()
export class HistoryAddressBarMode extends PlacesAddressBarMode {
    readonly id = 'history';
    readonly restrict = 'history';
}

/**
 * SMODE-01, Actions (D-11): the visible, enabled commands in the Browser
 * category, in registration order, as the stock palette lists them, filtered
 * on the label, each with its keybindings. These are navigation and
 * UI-opening commands; no store kind is reachable from a command (research
 * D7), so a row runs its command id and nothing else.
 */
@injectable()
export class ActionsAddressBarMode extends BuiltInAddressBarMode {
    readonly id = 'actions';

    @inject(CommandRegistry)
    protected readonly commands: CommandRegistry;

    @inject(KeybindingRegistry)
    protected readonly keybindings: KeybindingRegistry;

    async provide(text: string): Promise<Row[]> {
        return this.commands.commands
            .filter(command => command.category === CHROME_BAR_COMMAND_CATEGORY && !!command.label
                && this.commands.isVisible(command.id) && this.commands.isEnabled(command.id) && matches(text, command.label))
            .map((command): Row => ({
                key: 'action:' + command.id, source: 'action', title: command.label ?? '', caption: '', url: '',
                badges: this.keybindings.getKeybindingsForCommand(command.id).map(binding => this.keybindings.acceleratorFor(binding, '+').join(' ')),
                run: async () => {
                    await this.commands.executeCommand(command.id);
                },
            }));
    }
}
