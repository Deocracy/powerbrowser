import { injectable, inject } from '@theia/core/shared/inversify';
import { QuickAccessProviderDescriptor, QuickAccessRegistry } from '@theia/core/lib/browser';
import { CancellationToken } from '@theia/core/lib/common';
import { isOSX } from '@theia/core/lib/common/os';
import { QuickInputService, QuickPicks } from '@theia/core/lib/common/quick-pick-service';
import type { Row } from './address-bar-rows';
import { BuiltInAddressBarMode } from './address-bar-modes';
import { CHROME_BAR_COPY } from '../chrome-bar-copy';
import { PAGE_SHORTCUTS } from '../chrome-bar-shortcuts';

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
                run: execute ? () => execute() : undefined,
            };
        });
    }
}
