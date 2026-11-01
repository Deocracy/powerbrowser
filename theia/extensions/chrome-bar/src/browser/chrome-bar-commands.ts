import { injectable, inject } from '@theia/core/shared/inversify';
import { Command, CommandContribution, CommandRegistry } from '@theia/core/lib/common';
import { OpenerService, Widget } from '@theia/core/lib/browser';
import URI from '@theia/core/lib/common/uri';
import { EMPTY_PAGE_URL, WebTabWidget } from '@powerbrowser/tab-uris/lib/browser/web-tab';
import { GroupModel } from '@powerbrowser/modes/lib/browser/group-model';
import { PreferenceScope, PreferenceService } from '@theia/core/lib/common/preferences';
import { SHOW_BOOKMARKS_TOOLBAR_PREFERENCE } from './chrome-bar-preferences';

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
export const CHROME_BAR_DOWNLOADS_COMMAND_ID = 'powerbrowser.chrome-bar.downloads';
export const CHROME_BAR_FOCUS_ADDRESS_COMMAND_ID = 'powerbrowser.chrome-bar.focus-address';
// Phase 32 plan 06 (PAGE-09): the Edit items. Each sends one frozen cmd through WebTabWidget.edit; keys stay content-native.
export const CHROME_BAR_EDIT_UNDO_COMMAND_ID = 'powerbrowser.chrome-bar.edit-undo';
export const CHROME_BAR_EDIT_CUT_COMMAND_ID = 'powerbrowser.chrome-bar.edit-cut';
export const CHROME_BAR_EDIT_COPY_COMMAND_ID = 'powerbrowser.chrome-bar.edit-copy';
export const CHROME_BAR_EDIT_PASTE_COMMAND_ID = 'powerbrowser.chrome-bar.edit-paste';
export const CHROME_BAR_VIEW_SOURCE_COMMAND_ID = 'powerbrowser.chrome-bar.view-source';
export const CHROME_BAR_READER_TOGGLE_COMMAND_ID = 'powerbrowser.chrome-bar.reader-toggle';
// Phase 33 plan 02 (BMK-01): opens the star path; the pill's handler does the bookmark write, never this command.
export const CHROME_BAR_BOOKMARK_PAGE_COMMAND_ID = 'powerbrowser.chrome-bar.bookmark-page';
// Phase 33 plan 03 (BMK-03, BMK-04): reopen runs the widget's reopen path; the toggle flips the toolbar setting only.
export const CHROME_BAR_REOPEN_CLOSED_TAB_COMMAND_ID = 'powerbrowser.chrome-bar.reopen-closed-tab';
export const CHROME_BAR_TOGGLE_BOOKMARKS_TOOLBAR_COMMAND_ID = 'powerbrowser.chrome-bar.toggle-bookmarks-toolbar';

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

export const CHROME_BAR_DOWNLOADS: Command = {
    id: CHROME_BAR_DOWNLOADS_COMMAND_ID,
    category: CHROME_BAR_COMMAND_CATEGORY,
    label: 'Downloads',
};

// Stock labels (UI-SPEC: Edit menu, page focused). Disabled-not-removed follows the page's enabled reply at execute time.
export const CHROME_BAR_EDIT_UNDO: Command = { id: CHROME_BAR_EDIT_UNDO_COMMAND_ID, category: CHROME_BAR_COMMAND_CATEGORY, label: 'Undo' };
export const CHROME_BAR_EDIT_CUT: Command = { id: CHROME_BAR_EDIT_CUT_COMMAND_ID, category: CHROME_BAR_COMMAND_CATEGORY, label: 'Cut' };
export const CHROME_BAR_EDIT_COPY: Command = { id: CHROME_BAR_EDIT_COPY_COMMAND_ID, category: CHROME_BAR_COMMAND_CATEGORY, label: 'Copy' };
export const CHROME_BAR_EDIT_PASTE: Command = { id: CHROME_BAR_EDIT_PASTE_COMMAND_ID, category: CHROME_BAR_COMMAND_CATEGORY, label: 'Paste' };

// 33-UI-SPEC command table: Firefox's casing.
export const CHROME_BAR_BOOKMARK_PAGE: Command = { id: CHROME_BAR_BOOKMARK_PAGE_COMMAND_ID, category: CHROME_BAR_COMMAND_CATEGORY, label: 'Bookmark This Page' };
export const CHROME_BAR_REOPEN_CLOSED_TAB: Command = { id: CHROME_BAR_REOPEN_CLOSED_TAB_COMMAND_ID, category: CHROME_BAR_COMMAND_CATEGORY, label: 'Reopen Closed Tab' };
export const CHROME_BAR_TOGGLE_BOOKMARKS_TOOLBAR: Command = { id: CHROME_BAR_TOGGLE_BOOKMARKS_TOOLBAR_COMMAND_ID, category: CHROME_BAR_COMMAND_CATEGORY, label: 'Show Bookmarks Toolbar' };

// PAGE-10 (32-08): labelless and categorised by neither, like Focus Address; Phase 33 owns the palette and menu rows.
// Each one acts on the active web tab.
export const CHROME_BAR_VIEW_SOURCE: Command = { id: CHROME_BAR_VIEW_SOURCE_COMMAND_ID };
export const CHROME_BAR_READER_TOGGLE: Command = { id: CHROME_BAR_READER_TOGGLE_COMMAND_ID };

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

let openDownloadsPanel: (() => void) | undefined;

/** Set by the chrome bar widget, which owns the panel; the Downloads command opens it through this. */
export function setOpenDownloadsPanel(open: (() => void) | undefined): void {
    openDownloadsPanel = open;
}

let openFindBar: ((tab: WebTabWidget) => void) | undefined;

/** Set by the chrome bar widget, which owns the find bar; the page relay's find key opens it for the pushed tab through this. */
export function setOpenFindBar(open: ((tab: WebTabWidget) => void) | undefined): void {
    openFindBar = open;
}

/** Opens the find bar for `tab`. A no-op until the widget registers its opener. */
export function openFindBarFor(tab: WebTabWidget): void {
    openFindBar?.(tab);
}

let chooseSaveDestinationDialog: ((suggestedName: string) => Promise<string | undefined>) | undefined;

/** Set by the chrome bar widget, which owns the Theia save dialog; the save relay row picks its destination through this. */
export function setChooseSaveDestination(choose: ((suggestedName: string) => Promise<string | undefined>) | undefined): void {
    chooseSaveDestinationDialog = choose;
}

/** PAGE-08: the path the user picked, or undefined on cancel. Fails closed: with no dialog registered, nothing is saved. */
export function chooseSaveDestination(suggestedName: string): Promise<string | undefined> {
    return chooseSaveDestinationDialog ? chooseSaveDestinationDialog(suggestedName) : Promise.resolve(undefined);
}

/**
 * BMK-01: the page the star can bookmark -- the active web tab's http(s)
 * page URL, or '' (no web tab, no page, or another scheme), so the star's
 * disabled state and the command's enablement never disagree.
 */
export function bookmarkablePageUrl(tab: WebTabWidget | undefined = current): string {
    return tab && tab.hasPage && /^https?:\/\//i.test(tab.url) ? tab.url : '';
}

let openBookmarkStarPath: (() => void) | undefined;

/** Set by the address bar, which owns the star and its editor; the command and the page relay's Ctrl+D open them through this. */
export function setOpenBookmarkStar(open: (() => void) | undefined): void {
    openBookmarkStarPath = open;
}

/** BMK-01: the star's own click path. A no-op until the address bar registers it. */
export function openBookmarkStar(): void {
    openBookmarkStarPath?.();
}

let reopenClosedTabPath: (() => void) | undefined;

/** Set by the chrome bar widget, which owns the closed-tab read and the reopen; the command and the page relay reach it here. */
export function setReopenLastClosedTab(open: (() => void) | undefined): void {
    reopenClosedTabPath = open;
}

/** BMK-03: reopens the most recently closed tab with its history; a no-op with none closed or before the widget registers. */
export function reopenLastClosedTab(): void {
    reopenClosedTabPath?.();
}

let toggleBookmarksToolbarPath: (() => void) | undefined;

/** Set by the chrome bar widget, which owns the toolbar; it flips the setting and the toolbar follows the setting. */
export function setToggleBookmarksToolbar(toggle: (() => void) | undefined): void {
    toggleBookmarksToolbarPath = toggle;
}

/** BMK-04: shows or hides the bookmarks toolbar (the command, the page relay's key and the menu rows). */
export function toggleBookmarksToolbar(): void {
    toggleBookmarksToolbarPath?.();
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
 * D-28 (SMODE-06): the address bar's own focus path, which also puts the pill
 * in Address mode. Registered by the address bar, in the same one-way pattern
 * as the current web tab above: the command side never imports the widget.
 */
let addressFocus: (() => void) | undefined;

export function setAddressFocus(focus: (() => void) | undefined): void {
    addressFocus = focus;
}

/**
 * Focuses the address pill in Address mode and selects its content: the
 * focus command (Ctrl/Cmd+L, Alt+D), New Tab and the page relay's address
 * keys all come here. Before the address bar registers its focus path, a DOM
 * lookup focuses and selects only.
 */
export function focusAddressPill(): void {
    if (addressFocus) {
        addressFocus();
        return;
    }
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

    @inject(PreferenceService)
    protected readonly preferences: PreferenceService;

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
        commands.registerCommand(CHROME_BAR_DOWNLOADS, {
            execute: () => openDownloadsPanel?.(),
            isEnabled: () => !!currentWebTab(),
            isVisible: () => true,
        });
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
        // PAGE-09 (32-06): the Edit items run through the widget's edit(); the page's own reply reports enablement.
        // Each execute acts on the active web tab only, and never sends the kind itself.
        commands.registerCommand(CHROME_BAR_EDIT_UNDO, {
            execute: () => currentWebTab()?.edit('cmd_undo'),
            isEnabled: () => !!currentWebTab(),
            isVisible: () => true,
        });
        commands.registerCommand(CHROME_BAR_EDIT_CUT, {
            execute: () => currentWebTab()?.edit('cmd_cut'),
            isEnabled: () => !!currentWebTab(),
            isVisible: () => true,
        });
        commands.registerCommand(CHROME_BAR_EDIT_COPY, {
            execute: () => currentWebTab()?.edit('cmd_copy'),
            isEnabled: () => !!currentWebTab(),
            isVisible: () => true,
        });
        commands.registerCommand(CHROME_BAR_EDIT_PASTE, {
            execute: () => currentWebTab()?.edit('cmd_paste'),
            isEnabled: () => !!currentWebTab(),
            isVisible: () => true,
        });
        // BMK-01 (rule 12): opens the star path only; the store write runs in the pill's handler.
        commands.registerCommand(CHROME_BAR_BOOKMARK_PAGE, {
            execute: () => openBookmarkStar(),
            isEnabled: () => bookmarkablePageUrl() !== '',
            isVisible: () => true,
        });
        // BMK-03 (D-07): needs no web tab; with nothing closed the widget's reopen is a no-op.
        commands.registerCommand(CHROME_BAR_REOPEN_CLOSED_TAB, {
            execute: () => reopenLastClosedTab(),
            isVisible: () => true,
        });
        // BMK-04: one setting behind the key, the menu check row and the Actions row; checked while the toolbar shows.
        commands.registerCommand(CHROME_BAR_TOGGLE_BOOKMARKS_TOOLBAR, {
            execute: () => toggleBookmarksToolbar(),
            isToggled: () => this.preferences.inspectInScope<boolean>(SHOW_BOOKMARKS_TOOLBAR_PREFERENCE, PreferenceScope.User) === true,
            isVisible: () => true,
        });
        commands.registerCommand(CHROME_BAR_FOCUS_ADDRESS, {
            execute: () => focusAddressPill(),
        });
        // PAGE-10 (32-08): each execute is the widget method on the active tab, never a kind sent from here.
        commands.registerCommand(CHROME_BAR_VIEW_SOURCE, {
            execute: () => currentWebTab()?.viewSource(),
            isEnabled: () => !!currentWebTab()?.hasPage,
        });
        commands.registerCommand(CHROME_BAR_READER_TOGGLE, {
            execute: () => {
                const tab = currentWebTab();
                return tab?.setReader(!tab.isReaderMode);
            },
            isEnabled: () => {
                const tab = currentWebTab();
                return !!tab && (tab.isReaderMode || tab.canToggleReader);
            },
        });
    }
}
