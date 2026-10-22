import { injectable, inject } from '@theia/core/shared/inversify';
import { Command, CommandContribution, CommandRegistry } from '@theia/core/lib/common';
import { OpenerService, Widget } from '@theia/core/lib/browser';
import URI from '@theia/core/lib/common/uri';
import { EMPTY_PAGE_URL, WebTabWidget } from '@powerbrowser/tab-uris/lib/browser/web-tab';
import { GroupModel } from '@powerbrowser/modes/lib/browser/group-model';

/**
 * GUI-06 (13-03): the chrome bar's five commands -- back, forward, reload,
 * new-tab, and the keybinding-only focus-address.
 *
 * Command-per-action model (13-PATTERNS.md section 2): each id is a named
 * export so call sites (the widget, the keybindings) and the verify row in
 * `scripts/verify-chrome-bar-commands.mjs` import the const instead of
 * retyping the string. Labels are 13-UI-SPEC.md's contracted copy verbatim;
 * the focus-only command carries NO label so it stays keybinding-reachable
 * without inventing copy.
 */
export const CHROME_BAR_BACK_COMMAND_ID = 'powerbrowser.chrome-bar.back';
export const CHROME_BAR_FORWARD_COMMAND_ID = 'powerbrowser.chrome-bar.forward';
export const CHROME_BAR_RELOAD_COMMAND_ID = 'powerbrowser.chrome-bar.reload';
export const CHROME_BAR_NEW_TAB_COMMAND_ID = 'powerbrowser.chrome-bar.new-tab';
export const CHROME_BAR_FOCUS_ADDRESS_COMMAND_ID = 'powerbrowser.chrome-bar.focus-address';

/**
 * D-11 (30-03): the palette category of the four visible commands ("Browser:
 * Back" and so on), and what the address bar's Actions mode lists. The
 * focus-only command has none: it stays labelless and out of the palette.
 */
export const CHROME_BAR_COMMAND_CATEGORY = 'Browser';

export const CHROME_BAR_BACK: Command = {
    id: CHROME_BAR_BACK_COMMAND_ID,
    category: CHROME_BAR_COMMAND_CATEGORY,
    label: 'Back',
};

export const CHROME_BAR_FORWARD: Command = {
    id: CHROME_BAR_FORWARD_COMMAND_ID,
    category: CHROME_BAR_COMMAND_CATEGORY,
    label: 'Forward',
};

export const CHROME_BAR_RELOAD: Command = {
    id: CHROME_BAR_RELOAD_COMMAND_ID,
    category: CHROME_BAR_COMMAND_CATEGORY,
    label: 'Reload',
};

export const CHROME_BAR_NEW_TAB: Command = {
    id: CHROME_BAR_NEW_TAB_COMMAND_ID,
    category: CHROME_BAR_COMMAND_CATEGORY,
    label: 'New Tab',
};

/** Labelless by design: reachable through Ctrl/Cmd+L, never the palette. */
export const CHROME_BAR_FOCUS_ADDRESS: Command = {
    id: CHROME_BAR_FOCUS_ADDRESS_COMMAND_ID,
};

/** Structural class hook for the address pill input (also the style layer's target). Lives beside the command ids deliberately, so the widget, focusAddressPill, and stylesheet share one import. */
export const CHROME_BAR_INPUT_CLASS = 'pb-chrome-bar-input';

/**
 * The active web tab, or undefined when the shell's current widget is any
 * other kind. Module-level rather than a service: the command side must not
 * import the widget (the widget imports these ids -- the dependency runs one
 * way only), and the contribution that hears `shell.mainPanel.onDidChangeCurrent`
 * lives on the widget side, so it writes here and everyone else reads.
 */
let current: WebTabWidget | undefined;

export function currentWebTab(): WebTabWidget | undefined {
    return current;
}

/** Called from the chrome-bar contribution on every current-widget change; a non-web widget clears it. */
export function setCurrentWebTab(widget: Widget | undefined): void {
    current = widget instanceof WebTabWidget ? widget : undefined;
}

/**
 * GUI-02-owned navigable-tab predicate (13-04, flipped in 14.1-02): back,
 * forward, and reload all read enablement from this one export, and so do
 * the widget's three nav buttons, so the three controls can never disagree
 * about whether a navigable tab exists.
 *
 * True exactly when the shell's current widget is an in-shell web tab. Each
 * command then narrows further on the tab's own last state push (history
 * behind, history ahead, a page to reload); the buttons stay disabled-not-
 * removed with their contracted tooltips per the 13-UI-SPEC.md buttons
 * contract, so the layout never shifts.
 */
export function chromeBarHasNavigableTab(): boolean {
    return current !== undefined;
}

/**
 * Focuses the address pill and selects its content. A DOM lookup, not a
 * widget reference: the command side must not import the widget (the
 * widget imports these ids -- the dependency runs one way only).
 */
export function focusAddressPill(): void {
    const input = document.querySelector<HTMLInputElement>(`.${CHROME_BAR_INPUT_CLASS}`);
    if (input) {
        input.focus();
        input.select();
    }
}

@injectable()
export class ChromeBarCommandContribution implements CommandContribution {

    @inject(CommandRegistry)
    protected readonly commands: CommandRegistry;

    @inject(OpenerService)
    protected readonly openerService: OpenerService;

    @inject(GroupModel)
    protected readonly groups: GroupModel;

    registerCommands(commands: CommandRegistry): void {
        // Disabled-not-removed (13-UI-SPEC.md): visibility stays true while
        // enablement follows the shared navigable-tab predicate narrowed by
        // the active tab's last state push, so the buttons dim with their
        // tooltips retained and the layout never shifts. Each execute acts on
        // the active web tab only and is a no-op without one.
        commands.registerCommand(CHROME_BAR_BACK, {
            execute: () => currentWebTab()?.back(),
            isEnabled: () => {
                const tab = currentWebTab();
                return !!tab && tab.canGoBack;
            },
            isVisible: () => true,
        });
        commands.registerCommand(CHROME_BAR_FORWARD, {
            execute: () => currentWebTab()?.forward(),
            isEnabled: () => {
                const tab = currentWebTab();
                return !!tab && tab.canGoForward;
            },
            isVisible: () => true,
        });
        // Reload (UI-SPEC A7 + A10): enabled only for a web tab that has a
        // page, or one in the lost-view state whose Reload re-issues the open.
        commands.registerCommand(CHROME_BAR_RELOAD, {
            execute: () => currentWebTab()?.reload(),
            isEnabled: () => {
                const tab = currentWebTab();
                return !!tab && tab.canReload;
            },
            isVisible: () => true,
        });
        // GUI-02: New Tab opens the empty page as an in-shell web tab through
        // the opener service (two-step routing -- OpenerService has no open()
        // in 1.74.1 -- resolving to WebTabOpenHandler at priority 1000) and
        // hands focus to the pill, which is the affordance for the empty tab.
        // No command id is re-spelled and no popup is issued: the stock
        // window survives only behind the GUI-01 palette command.
        // PAN-03 (22-UI-SPEC A7): the new tab joins the active group, if any;
        // a failed join leaves it open and loose behind the save-error bar.
        commands.registerCommand(CHROME_BAR_NEW_TAB, {
            execute: async () => {
                const uri = new URI(EMPTY_PAGE_URL);
                const handler = await this.openerService.getOpener(uri);
                const widget = await handler.open(uri);
                if (widget instanceof Widget) {
                    try {
                        await this.groups.joinActiveGroup(widget);
                    } catch (error) {
                        console.error('[@powerbrowser/chrome-bar] joining the active group failed:', error instanceof Error ? error.name : typeof error);
                    }
                }
                focusAddressPill();
            },
        });
        commands.registerCommand(CHROME_BAR_FOCUS_ADDRESS, {
            execute: () => focusAddressPill(),
        });
    }
}
