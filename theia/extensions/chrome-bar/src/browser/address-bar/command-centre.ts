import { injectable, inject } from '@theia/core/shared/inversify';
import { KeybindingRegistry, QuickAccessProviderDescriptor, QuickAccessRegistry, QuickHelpService } from '@theia/core/lib/browser';
import { CancellationToken } from '@theia/core/lib/common';
import { isOSX } from '@theia/core/lib/common/os';
import { QuickInputService, QuickPickItem, QuickPicks } from '@theia/core/lib/common/quick-pick-service';
import type { Row } from './address-bar-rows';
import { BuiltInAddressBarMode } from './address-bar-modes';
import { CHROME_BAR_COPY } from '../chrome-bar-copy';
import { PAGE_SHORTCUTS } from '../chrome-bar-shortcuts';

/** What a help row needs from the pill: put this text in it and list that provider's picks. */
export interface CommandCentrePill {
    acceptText(text: string): void;
}

/**
 * SMODE-05 (D-21..D-27): Command centre, the pill's own rendering of Theia's
 * quick access. Typed text goes to the provider the registry selects for it
 * (its longest-prefix match), and that provider's picks become rows under the
 * pill; Enter or a click runs the pick's execute(). Text the registry has no
 * descriptor for (today the editor-native @ and :) is handed to Theia's stock
 * quick input; the rule is derived from the registry, never a prefix list
 * (D-22, D-23).
 *
 * Nothing here reaches chrome: no store client, no suggestion service. Typed
 * text reaches only the providers, the file provider's search included, as
 * stock Ctrl+P does (D-26, T-30-17).
 */
@injectable()
export class CommandCentreAddressBarMode extends BuiltInAddressBarMode {
    readonly id = 'command-centre';

    @inject(QuickAccessRegistry)
    protected readonly registry: QuickAccessRegistry;

    @inject(QuickInputService)
    protected readonly quickInput: QuickInputService;

    @inject(KeybindingRegistry)
    protected readonly keybindings: KeybindingRegistry;

    /** The pill that renders this mode; set by the address bar when it dispatches here. */
    protected pill: CommandCentrePill | undefined;

    attach(pill: CommandCentrePill): void {
        this.pill = pill;
    }

    /** D-25: the input's placeholder, the selected provider's own (else the default provider's), read now. */
    placeholder(text: string): string | undefined {
        return (this.descriptorFor(text) ?? this.descriptorFor(''))?.placeholder;
    }

    /**
     * Pitfall 1: a ? help row puts its provider's prefix in the pill (empty for
     * the default provider's row) and lists that provider's picks. The pick's
     * own execute() is never called: it opens the centred quick input. The
     * prefixes are the registry's help entries, so nothing is hand-kept. An
     * instance method, so a live plant can call execute() instead.
     */
    acceptHelp(pick: QuickPickItem): void {
        const prefixes = ([] as string[]).concat(...this.registry.getQuickAccessProviders()
            .map(descriptor => descriptor.helpEntries.map(entry => entry.prefix || descriptor.prefix)));
        this.pill?.acceptText(prefixes.includes(pick.label) ? pick.label : '');
    }

    /** The provider the registry selects for `text`; undefined when it has none (D-22). */
    descriptorFor(text: string): QuickAccessProviderDescriptor | undefined {
        return this.registry.getQuickAccessProvider(text);
    }

    /** True when no Theia provider takes `text`, so Theia's stock quick input must (D-23). An instance method, so a live plant can turn it off. */
    handsOff(text: string): boolean {
        return this.descriptorFor(text) === undefined;
    }

    /** The footer hint, naming the address key by the page-shortcut table's Ctrl+L row (its macOS label on macOS). */
    footer(): string {
        const row = PAGE_SHORTCUTS.find(entry => entry.id === 'focusAddressL');
        return row ? CHROME_BAR_COPY.commandCentreFooter(isOSX ? row.macLabel : row.label) : CHROME_BAR_COPY.dropdownFooter;
    }

    /** Opens Theia's stock quick input on `text`; the pill keeps its own text (D-23). */
    handOff(text: string): void {
        this.quickInput.open(text);
    }

    /**
     * The selected provider's picks for `text` as rows, in the provider's
     * order: a separator becomes a group header, an item a pick row that runs
     * its execute() when it has one. The filter is the stock rule, the text
     * after the prefix, trimmed (pickerQuickAccess). A cancelled request lists
     * nothing.
     */
    async provide(text: string, token: CancellationToken): Promise<Row[]> {
        const descriptor = this.descriptorFor(text);
        if (!descriptor) {
            return [];
        }
        const filter = text.substring(descriptor.prefix.length).trim();
        const help = descriptor.prefix === QuickHelpService.PREFIX;
        const picks: QuickPicks = await descriptor.getInstance().getPicks(filter, token);
        if (token.isCancellationRequested) {
            return [];
        }
        return picks.map((pick, index): Row => {
            if (pick.type === 'separator') {
                return { key: `group:${index}`, source: 'group', title: pick.label ?? '', caption: '', url: '' };
            }
            const execute = pick.execute;
            return {
                key: `pick:${index}`, source: 'pick', title: pick.label, caption: pick.description ?? '', url: '',
                detail: pick.detail, iconClasses: pick.iconClasses,
                badges: pick.keySequence ? [this.keybindings.acceleratorForSequence(pick.keySequence, '+').join(' ')] : undefined,
                run: help ? () => this.acceptHelp(pick) : execute ? () => execute() : undefined,
                stays: help || undefined,
            };
        });
    }
}
