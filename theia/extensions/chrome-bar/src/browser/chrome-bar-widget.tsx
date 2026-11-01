import * as React from '@theia/core/shared/react';
import { createPortal } from '@theia/core/shared/react-dom';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import {
    ApplicationShell,
    ContextMenuRenderer,
    FrontendApplicationContribution,
    HoverService,
    ReactWidget,
    Widget,
} from '@theia/core/lib/browser';
import { CommandMenu, CommandRegistry, CompoundMenuNode, Disposable, MenuPath } from '@theia/core/lib/common';
import { PreferenceScope, PreferenceService } from '@theia/core/lib/common/preferences';
import { KeybindingRegistry } from '@theia/core/lib/browser/keybinding';
import { PerspectiveService } from '@theia/core/lib/browser/perspective-service';
import { FileDialogService } from '@theia/filesystem/lib/browser';
import { DownloadAction, WebTabChannel, WebTabDownloadRow, WebTabOpenHandler, WebTabWidget } from '@powerbrowser/tab-uris/lib/browser/web-tab';
import {
    CHROME_BAR_BACK_COMMAND_ID,
    CHROME_BAR_BOOKMARK_PAGE_COMMAND_ID,
    CHROME_BAR_CLEAR_HISTORY_COMMAND_ID,
    CHROME_BAR_DEVTOOLS_COMMAND_ID,
    CHROME_BAR_FIND_IN_PAGE_COMMAND_ID,
    CHROME_BAR_FORWARD_COMMAND_ID,
    CHROME_BAR_FULL_SCREEN_COMMAND_ID,
    CHROME_BAR_DOWNLOADS_COMMAND_ID,
    CHROME_BAR_EDIT_COPY_COMMAND_ID,
    CHROME_BAR_EDIT_CUT_COMMAND_ID,
    CHROME_BAR_EDIT_PASTE_COMMAND_ID,
    CHROME_BAR_EDIT_REDO_COMMAND_ID,
    CHROME_BAR_EDIT_SELECT_ALL_COMMAND_ID,
    CHROME_BAR_EDIT_UNDO_COMMAND_ID,
    CHROME_BAR_NEW_TAB_COMMAND_ID,
    CHROME_BAR_NEW_WINDOW_COMMAND_ID,
    CHROME_BAR_PRINT_COMMAND_ID,
    CHROME_BAR_READER_TOGGLE_COMMAND_ID,
    CHROME_BAR_RELOAD_COMMAND_ID,
    CHROME_BAR_REOPEN_CLOSED_TAB_COMMAND_ID,
    CHROME_BAR_SAVE_PAGE_COMMAND_ID,
    CHROME_BAR_SETTINGS_COMMAND_ID,
    CHROME_BAR_TOGGLE_BOOKMARKS_TOOLBAR_COMMAND_ID,
    CHROME_BAR_VIEW_SOURCE_COMMAND_ID,
    CHROME_BAR_ZOOM_IN_COMMAND_ID,
    CHROME_BAR_ZOOM_OUT_COMMAND_ID,
    CHROME_BAR_ZOOM_RESET_COMMAND_ID,
    chromeBarHasNavigableTab,
    currentWebTab,
    setCurrentWebTab,
    setChooseSaveDestination,
    setOpenClearHistory,
    setOpenDownloadsPanel,
    setOpenFindBar,
    setOpenStockPage,
    setReopenLastClosedTab,
    setToggleBookmarksToolbar,
    setToggleFullScreen,
} from './chrome-bar-commands';
import { CHROME_BAR_COPY, appSubject, downloadBytes, historyLabel } from './chrome-bar-copy';
import { HOME_PAGE_PREFERENCE, SHOW_BOOKMARKS_TOOLBAR_PREFERENCE, SHOW_HOME_BUTTON_PREFERENCE } from './chrome-bar-preferences';
import { AddressBar, DROPDOWN_MAX_HEIGHT, DropTargetDragEvent, droppedUrlOf } from './address-bar/address-bar';
import { BUTTON_SHORTCUTS, NavButton, pageKeyLabel, tooltipFor } from './chrome-bar-shortcuts';
import { MODES_ACTIVATE_COMMAND_ID } from '@powerbrowser/modes/lib/browser/modes-commands';
import { ModeService } from '@powerbrowser/modes/lib/browser/mode-service';
// The organising placeholder's own id, imported for the same const-discipline
// reason every command id here is imported: the tab count excludes that widget
// by identity, and a re-spelled string would keep counting it the day the
// widget renames.
import { OrganisingWidget } from '@powerbrowser/modes/lib/browser/organising-widget';
import { TabStripWidget } from './tab-strip-widget';
import { LayoutControlsWidget } from './layout-controls-widget';
import { BookmarkEntry, ChromeStoreClient, ClearHistoryRange, ClosedTabRow, PlaceMatch, ReopenableTab } from '@powerbrowser/tab-uris/lib/browser/chrome-store-client';
import { ProfileStorageService } from '@powerbrowser/tab-uris/lib/browser/profile-storage';
import { MENU_ORDER, MENU_PHASE } from './site-identity/site-identity-table';
import { APP_MENU_ID, AppMenuRow, AppMenuSubmenu, WIRED_MENU_IDS, buildAppMenu, withinBudget } from './site-identity/app-menu';
import { MODE_ATTRIBUTE } from '@powerbrowser/modes/lib/browser/mode-attribute';
import '../../src/browser/chrome-bar.css';

/** NAV-03: the session-history menu's path. The menu is built per request from the history reply, never registered. */
const HISTORY_MENU_PATH: MenuPath = ['powerbrowser-chrome-bar-history'];

/** Phase 31 plan 04 (MENU-01): the hamburger's per-request menu path. Built on each open, never registered. */
const APP_MENU_PATH: MenuPath = [APP_MENU_ID];

/**
 * Phase 31 plan 04 (MENU-01/02): a menu row's label from CHROME_BAR_COPY. A row
 * with no case is a table row this widget does not know, so it throws rather
 * than show an identifier.
 */
function appMenuLabel(menuId: string): string {
    switch (menuId) {
        case 'new-tab': return CHROME_BAR_COPY.menuNewTab;
        case 'new-window': return CHROME_BAR_COPY.menuNewWindow;
        case 'bookmarks': return CHROME_BAR_COPY.menuBookmarks;
        case 'history': return CHROME_BAR_COPY.menuHistory;
        case 'downloads': return CHROME_BAR_COPY.menuDownloads;
        case 'print': return CHROME_BAR_COPY.menuPrint;
        case 'save-page': return CHROME_BAR_COPY.menuSavePage;
        case 'find-in-page': return CHROME_BAR_COPY.menuFindInPage;
        case 'zoom': return CHROME_BAR_COPY.menuZoom;
        case 'edit': return CHROME_BAR_COPY.menuEdit;
        case 'full-screen': return CHROME_BAR_COPY.menuFullScreen;
        case 'settings': return CHROME_BAR_COPY.menuSettings;
        case 'passwords': return CHROME_BAR_COPY.menuPasswords;
        case 'addons': return CHROME_BAR_COPY.menuAddons;
        case 'more-tools': return CHROME_BAR_COPY.menuMoreTools;
        case 'help': return CHROME_BAR_COPY.menuHelp;
        case 'quit': return CHROME_BAR_COPY.menuQuit(appSubject());
        default: throw new Error(`no label for menu row ${menuId}`);
    }
}

/**
 * Phase 33 plan 05 (MENU-03, D-13): the hamburger rows that run a Browser command -- the same id the Actions row
 * runs, so a menu row and its Actions twin can never run two implementations. A row here dims when its command
 * is disabled (no web tab), keeping its place. New Tab keeps its Phase 31 arm.
 */
const APP_MENU_COMMANDS: Readonly<Record<string, string>> = Object.freeze({
    'new-window': CHROME_BAR_NEW_WINDOW_COMMAND_ID,
    'downloads': CHROME_BAR_DOWNLOADS_COMMAND_ID,
    'print': CHROME_BAR_PRINT_COMMAND_ID,
    'save-page': CHROME_BAR_SAVE_PAGE_COMMAND_ID,
    'find-in-page': CHROME_BAR_FIND_IN_PAGE_COMMAND_ID,
    'full-screen': CHROME_BAR_FULL_SCREEN_COMMAND_ID,
    'settings': CHROME_BAR_SETTINGS_COMMAND_ID,
});

/** PAGE-09 (33-05): the Edit submenu's commands, each with the frozen edit cmd its command sends and the page reports on. */
type EditCmd = Parameters<WebTabWidget['edit']>[0];
const EDIT_MENU_CMDS: readonly EditCmd[] = Object.freeze(['cmd_undo', 'cmd_redo', 'cmd_cut', 'cmd_copy', 'cmd_paste', 'cmd_selectAll'] as EditCmd[]);

/** NAV-03: Firefox's click-hold delay before Back/Forward open the history menu. */
const HISTORY_HOLD_MS = 500;

/** NAV-01 (27-UI-SPEC, Pitfall P7): Reload ignores clicks for 650 ms after it turns back from Stop. */
const RELOAD_GUARD_MS = 650;

/** Phase 32 plan 02 (PAGE-01): the three find toggles, held per bar session (never preferences). */
type FindOptionKey = 'highlightAll' | 'caseSensitive' | 'entireWord';

type NavGesture = 'back' | 'forward' | 'reload';
type ButtonEvent = React.MouseEvent<HTMLButtonElement>;

/** Phase 33 (BMK-04, D-04): the body attribute the mode-independent top-panel rule keys on; 'shown' adds the 28px row. */
const BOOKMARKS_TOOLBAR_ATTRIBUTE = 'data-pb-bookmarks-toolbar';

/** Phase 33 (BMK-04): the toolbar's per-request menus (overflow chevron, item right-click). Built on each open, never registered. */
const BOOKMARKS_TOOLBAR_MENU_PATH: MenuPath = ['powerbrowser-chrome-bar-bookmarks-toolbar'];

/**
 * Phase 33 (BMK-06, D-08): the hamburger History submenu's own path, distinct from
 * NAV-03's HISTORY_MENU_PATH. Built per request, never registered.
 */
const BOOKMARKS_HISTORY_MENU_PATH: MenuPath = ['powerbrowser-chrome-bar-bookmarks-history'];

/** BMK-06: each History section lists at most this many rows (closed tabs, recent pages). */
const HISTORY_MENU_ROWS = 10;

/** BMK-06: one section's read, or 'failed' when chrome refused it. */
interface HistoryMenuReads {
    closed: ClosedTabRow[] | 'failed';
    recent: PlaceMatch[] | 'failed';
}

/** BMK-05 (D-09): the picker's five ranges in 33-UI-SPEC order, keyed by the names chrome's clearHistory accepts. */
const CLEAR_HISTORY_RANGES: ReadonlyArray<{ range: ClearHistoryRange; label: () => string }> = [
    { range: 'last-hour', label: () => CHROME_BAR_COPY.clearHistoryLastHour },
    { range: 'last-2-hours', label: () => CHROME_BAR_COPY.clearHistoryLast2Hours },
    { range: 'last-4-hours', label: () => CHROME_BAR_COPY.clearHistoryLast4Hours },
    { range: 'today', label: () => CHROME_BAR_COPY.clearHistoryToday },
    { range: 'everything', label: () => CHROME_BAR_COPY.clearHistoryEverything },
];

/** BMK-05: the open picker. `opener` is where focus returns; none returns it to the current web tab's page. */
interface ClearHistoryPickerState {
    range: ClearHistoryRange;
    failed: boolean;
    busy: boolean;
    opener: HTMLElement | undefined;
}

interface ClearHistoryPickerProps {
    picker: ClearHistoryPickerState;
    top: number;
    right: number;
    onRange(range: ClearHistoryRange): void;
    onClear(): void;
    onClose(restoreFocus: boolean): void;
}

/**
 * BMK-05 (D-10): the Clear Recent History picker, the star editor's portal
 * pattern anchored under the hamburger. The panel is the confirmation: Clear
 * (and Enter) calls back to the widget's confirm handler, the only place the
 * clear is sent (rule 12). Esc and Cancel close it with focus back on the
 * opener; focus leaving the panel closes it where focus went. None of them
 * closes it while the clear is running.
 */
function ClearHistoryPicker(props: ClearHistoryPickerProps): React.ReactElement {
    const { picker, top, right, onRange, onClear } = props;
    // WR-05: while a clear runs the panel stays up, so a refusal always reaches the failure row.
    const onClose = (restoreFocus: boolean): void => { if (!picker.busy) { props.onClose(restoreFocus); } };
    const panelRef = React.useRef<HTMLDivElement>(null);
    // Mount only: focus the chosen range, so arrows move between ranges and Enter clears.
    React.useEffect(() => {
        panelRef.current?.querySelector<HTMLInputElement>('input:checked')?.focus();
    }, []);
    const heading = CHROME_BAR_COPY.clearHistoryHeading;
    return createPortal(
        <div
            ref={panelRef}
            className='pb-chrome-bar-dropdown pb-clear-history'
            role='dialog'
            aria-label={heading}
            tabIndex={-1}
            style={{ position: 'fixed', top, right, maxHeight: Math.max(0, Math.min(DROPDOWN_MAX_HEIGHT, window.innerHeight - top - 8)) }}
            onKeyDown={e => {
                if (e.key === 'Escape') {
                    e.stopPropagation();
                    e.preventDefault();
                    onClose(true);
                } else if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) {
                    e.preventDefault();
                    onClear();
                }
            }}
            onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) { onClose(false); } }}
        >
            <div className='pb-clear-history-heading'>{heading}</div>
            {picker.failed && <div className='pb-clear-history-failure' role='alert'>{CHROME_BAR_COPY.clearHistoryFailed(appSubject())}</div>}
            <div className='pb-clear-history-ranges' role='radiogroup' aria-label={heading}>
                {CLEAR_HISTORY_RANGES.map(({ range, label }) => <label key={range} className='pb-clear-history-range'>
                    <input type='radio' name='pb-clear-history-range' checked={picker.range === range} onChange={() => onRange(range)} />
                    <span>{label()}</span>
                </label>)}
            </div>
            <div className='pb-clear-history-footnote'>{CHROME_BAR_COPY.clearHistoryFootnote(appSubject())}</div>
            <div className='pb-clear-history-footer'>
                <span className='pb-clear-history-spacer' />
                <button type='button' className='pb-clear-history-button' onClick={() => onClose(true)}>{CHROME_BAR_COPY.clearHistoryCancel}</button>
                {/* Never disabled while busy: disabling the focused button would blur the panel and close it. */}
                <button type='button' className='pb-clear-history-clear' onClick={onClear}>{CHROME_BAR_COPY.clearHistoryConfirm}</button>
            </div>
        </div>,
        document.body
    );
}

/** Where a bookmark or a recent page opens (the Phase 29 targets): the current tab, or a new background or foreground tab. */
type OpenTarget = 'current' | 'background' | 'foreground';

interface BookmarksToolbarProps {
    items: BookmarkEntry[] | 'failed';
    icons: Readonly<Record<string, string>>;
    onOpen(item: BookmarkEntry, target: OpenTarget): void;
    onItemMenu(item: BookmarkEntry, anchor: HTMLElement): void;
    onItemHover(item: BookmarkEntry, anchor: HTMLElement): void;
    onOverflow(hidden: BookmarkEntry[], anchor: HTMLElement): void;
}

/** The chevron's 24px plus the 4px gap before it, kept clear at the row's right end once anything overflows. */
const TOOLBAR_CHEVRON_ROOM = 28;

/**
 * BMK-04: the 28px bookmarks toolbar row. Items never wrap and the row never
 * scrolls: an item past the right edge stays in place, hidden, and the
 * pinned-right chevron lists it. Measured after every layout and on every
 * resize; the row is the items' offset parent (position: relative).
 */
function BookmarksToolbar(props: BookmarksToolbarProps): React.ReactElement {
    const rowRef = React.useRef<HTMLDivElement>(null);
    const [fits, setFits] = React.useState(Number.MAX_SAFE_INTEGER);
    const items = props.items === 'failed' ? [] : props.items;
    React.useLayoutEffect(() => {
        const row = rowRef.current;
        if (!row) {
            return undefined;
        }
        const measure = (): void => {
            const nodes = Array.from(row.querySelectorAll<HTMLElement>('.pb-bookmarks-toolbar-item'));
            const edge = row.clientWidth - parseFloat(getComputedStyle(row).paddingRight || '0');
            const past = (limit: number): number => nodes.findIndex(node => node.offsetLeft + node.offsetWidth > limit);
            const first = past(edge) < 0 ? -1 : past(edge - TOOLBAR_CHEVRON_ROOM);
            setFits(first < 0 ? nodes.length : first);
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(row);
        return () => observer.disconnect();
    }, [props.items]);
    return <div ref={rowRef} className='pb-bookmarks-toolbar' role='toolbar' aria-label={CHROME_BAR_COPY.bookmarksToolbar}>
        {props.items === 'failed' && <div className='pb-bookmarks-toolbar-failed' aria-disabled='true'>{CHROME_BAR_COPY.bookmarksToolbarFailed(appSubject())}</div>}
        {items.map((item, index) => {
            const hidden = index >= fits;
            const icon = props.icons[item.url];
            return <button
                key={item.guid || `${index}`}
                type='button'
                className={'pb-bookmarks-toolbar-item' + (hidden ? ' is-overflow' : '')}
                tabIndex={hidden ? -1 : undefined}
                aria-hidden={hidden || undefined}
                onClick={e => props.onOpen(item, e.ctrlKey || e.metaKey ? 'background' : 'current')}
                onAuxClick={e => {
                    if (e.button === 1) {
                        e.preventDefault();
                        props.onOpen(item, 'background');
                    }
                }}
                onKeyDown={e => {
                    if (e.key === 'Enter' && e.altKey) {
                        e.preventDefault();
                        props.onOpen(item, 'foreground');
                    }
                }}
                onContextMenu={e => {
                    e.preventDefault();
                    props.onItemMenu(item, e.currentTarget);
                }}
                onPointerEnter={e => props.onItemHover(item, e.currentTarget)}
            >
                {icon
                    ? <img className='pb-bookmarks-toolbar-icon' src={icon} alt='' />
                    : <span className='codicon codicon-globe' />}
                <span className='pb-bookmarks-toolbar-label'>{item.title || item.url}</span>
            </button>;
        })}
        {fits < items.length && <button
            type='button'
            className='pb-bookmarks-toolbar-chevron'
            aria-label={CHROME_BAR_COPY.bookmarksToolbarMore}
            aria-haspopup='menu'
            onClick={e => props.onOverflow(items.slice(fits), e.currentTarget)}
        ><span aria-hidden='true'>{'»'}</span></button>}
    </div>;
}

/**
 * GUI-06 (13-03): the chrome bar widget -- nav buttons, address pill with
 * suggestions, new-tab, and the mode toggle.
 *
 * A React contribution added once at startup to the top shell area -- the
 * plain Lumino panel above the main dock, so no core patch and no dock
 * surgery (13-RESEARCH.md Pattern 1). Ratified Variant-A order is menubar,
 * chrome bar, tab strip, workarea, status bar (13-UI-SPEC.md Bar placement
 * and order). Structural class hooks below are the
 * style layer's contract (chrome-bar.css targets them verbatim): bar,
 * buttons, pill, input, dropdown, rows, toggle, segments, tab count.
 *
 * Menu-visibility coupling (13-RESEARCH.md Pitfall 1): the whole top panel
 * hides with `window.menuBarVisibility`, so this bar vanishes with the
 * menu. The menu stays visible by default and no check ever asserts bar
 * visibility while the menu is hidden.
 *
 * Threat notes (13-03 threat model): suggestion titles and captions render
 * as React text nodes only, never markup (T-13-03-01); address commits
 * resolve chrome-side through the resolveTypedAddress store kind (URI
 * fixup, the bar engine's submission, the http(s) wall on the result), with
 * empty as a no-op and no evaluation surface (T-13-03-03, Phase 29); the toggle is selection state only and
 * never touches a tab, with the before/after countTabs comparison in
 * selectMode asserting the invariant on every
 * switch (T-13-03-04); a refused or unacknowledged web-tab navigation takes
 * the same throw-and-catch path a blocked popup once did, with no new dialog
 * authored (T-13-03-05).
 *
 * GUI-02 (14.1-02): http(s) commits, suggestion rows and "+" all land in an
 * in-shell web tab (navigateWebTab below and the New Tab command); the pill
 * is bound to the shell's current widget and to the active web tab's state
 * pushes; nav enablement follows those pushes. No path from this file reaches
 * the stock window -- that survives only behind the GUI-01 palette command.
 *
 * No chrome-side command is registered and nothing opens at startup: the
 * bar only issues commands through the registry on user gestures (a
 * startup-opened window would break the stock chrome per the candidate-A
 * constraint).
 */
@injectable()
export class ChromeBarWidget extends ReactWidget {

    static readonly ID = 'powerbrowser.chrome-bar';

    /** The three shipped mode defaults, in contracted order. */
    static readonly MODES = ['Coding', 'Browsing', 'Organising'];

    @inject(CommandRegistry)
    protected readonly commands: CommandRegistry;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;


    // No PerspectiveService here by design: every mode switch this widget
    // issues -- shipped segment and custom row alike -- goes through the mode
    // command, which owns the stock switch plus the contracted panel work.
    // The contribution below still holds the service, to LISTEN for the stock
    // perspective event and to read the live id at startup; it never switches.

    /**
     * GUI-07 (14-02): custom modes listed beside the shipped defaults. The
     * shipped MODES literal above stays the fallback behind customs: customs
     * append as menu rows after the shipped segments, truncated by ellipsis
     * at row width with full names in tooltips, the active row carrying the
     * inherited selected-row marker. Shipped rows are never mutated.
     */
    @inject(ModeService)
    protected readonly modes: ModeService;

    /** NAV-03: renders the Back/Forward session-history menu as a stock `.lm-Menu`. */
    @inject(ContextMenuRenderer)
    protected readonly menus: ContextMenuRenderer;

    /** Phase 31 plan 04 (MENU-02): the stock-page store kind, sent only from the app menu's row handler. */
    @inject(ChromeStoreClient)
    protected readonly store: ChromeStoreClient;

    /** NAV-06: middle-click and Ctrl+click open a background tab; a dropped link a foreground one. */
    @inject(WebTabOpenHandler)
    protected readonly webTabOpener: WebTabOpenHandler;

    /** NAV-04: the Home settings (chrome-bar-preferences.ts). */
    @inject(PreferenceService)
    protected readonly preferences: PreferenceService;

    /** NAV-05: nav-button tooltips (native title tooltips are dead in the shell until Phase 35). */
    @inject(HoverService)
    protected readonly hover: HoverService;

    /** 30-01 (D-04): the address pill, rendered in its slot between Home and New Tab. */
    @inject(AddressBar)
    protected readonly addressBar: AddressBar;

    @inject(WebTabChannel)
    protected readonly webTabs: WebTabChannel;

    /** BMK-03 (D-07): arms a closed tab's saved back/forward history before its reopen. */
    @inject(ProfileStorageService)
    protected readonly profileStorage: ProfileStorageService;

    /** BMK-06: the History submenu's reopen row shows the command's own key. */
    @inject(KeybindingRegistry)
    protected readonly keybindings: KeybindingRegistry;

    /** PAGE-08: the Theia file dialog that picks where a saved page goes. */
    @inject(FileDialogService)
    protected readonly fileDialogs: FileDialogService;

    protected downloadRows: WebTabDownloadRow[] = [];
    protected downloadsOpen = false;
    protected readonly downloadsRead = new Set<number>();

    /** Phase 32 plan 02 (PAGE-01): whether the find bar is open for the current web tab. */
    protected findOpen = false;
    /** Phase 32 plan 02 (PAGE-01): the find toggles; they re-run the find when changed. */
    protected findOptions: Record<FindOptionKey, boolean> = { highlightAll: false, caseSensitive: false, entireWord: false };

    protected holdTimer: number | undefined;
    /** Set when a hold opened the history menu, so the release's click does not navigate. */
    protected suppressNavClick = false;
    /** performance.now() before which a Reload click is ignored (the post-Stop guard). */
    protected reloadGuardUntil = 0;

    /** The active web tab's state-push subscription; replaced on every current-widget change. */
    protected stateSubscription: Disposable | undefined;

    protected customModes: Array<{ id: string; name: string }> = [];
    protected activeCustomId: string | undefined = undefined;

    protected mode = ChromeBarWidget.MODES[0];

    /** BMK-04: the toolbar folder's web bookmarks in Places order, or 'failed' after a refused read (never stale rows). */
    protected toolbarItems: BookmarkEntry[] | 'failed' = [];
    /** BMK-04: cached favicons of the toolbar items, by url; an item without one shows the globe. */
    protected toolbarIcons: Record<string, string> = {};
    /** Drops a toolbar read that a newer one overtook. */
    protected toolbarSeq = 0;
    /** How the last key or click inside an open bar menu asked a row to open: Alt foreground, Ctrl background. */
    protected menuTarget: OpenTarget = 'current';
    /** BMK-05: the Clear Recent History picker while it is open. */
    protected clearHistoryPicker: ClearHistoryPickerState | undefined;
    /** WR-06: the hamburger's reads are pending, so another click does not open a second menu. */
    protected appMenuOpening = false;
    /** The Phase 31 hamburger button: the picker's anchor and the History row's focus return. */
    protected appMenuButton: HTMLButtonElement | null = null;
    /** Stable, so React calls it only on mount and unmount. */
    protected appMenuButtonRef = (el: HTMLButtonElement | null): void => {
        this.appMenuButton = el;
    };

    @postConstruct()
    protected init(): void {
        this.addressBar.attach(this);
        setOpenDownloadsPanel(() => this.toggleDownloads());
        setOpenFindBar(tab => this.openFind(tab));
        setChooseSaveDestination(suggestedName => this.chooseSaveDestination(suggestedName));
        setReopenLastClosedTab(() => void this.reopenClosedTabRow());
        setToggleBookmarksToolbar(() => void this.toggleBookmarksToolbar());
        setOpenClearHistory(() => this.openClearHistoryPicker());
        setToggleFullScreen(() => void this.toggleFullScreenRow());
        setOpenStockPage(page => void this.openStockPageRow(page));
        this.toDispose.push(this.webTabs.onDidChangeDownloads(rows => {
            this.downloadRows = rows;
            this.update();
        }));
        // NAV-04: toggling either Home setting updates the bar live, with no reload.
        this.toDispose.push(this.preferences.onPreferenceChanged(change => {
            if (change.preferenceName === SHOW_HOME_BUTTON_PREFERENCE || change.preferenceName === HOME_PAGE_PREFERENCE) {
                this.update();
            }
            if (change.preferenceName === SHOW_BOOKMARKS_TOOLBAR_PREFERENCE) {
                this.syncBookmarksToolbar();
            }
        }));
        // BMK-04 (D-05): chrome's Places observer sends the `bookmarks-changed` push; the toolbar re-reads its folder.
        this.toDispose.push(this.webTabs.onDidChangeBookmarks(() => void this.refreshBookmarksToolbar()));
        void this.preferences.ready.then(() => this.syncBookmarksToolbar());
    }

    /** BMK-04: flips the setting; syncBookmarksToolbar follows the change, so every toggle path shows the same toolbar. */
    protected async toggleBookmarksToolbar(): Promise<void> {
        try {
            await this.preferences.set(SHOW_BOOKMARKS_TOOLBAR_PREFERENCE, !this.bookmarksToolbarShown(), PreferenceScope.User);
        } catch (error) {
            console.error('[@powerbrowser/chrome-bar] toggling the bookmarks toolbar failed:', error instanceof Error ? error.name : typeof error);
        }
    }

    /**
     * BMK-03 (D-07, T-33-02): reopens a closed tabs.sqlite row (the most recent
     * one without `uri`) in a new web tab on its own row key. When chrome kept
     * the row's back/forward history, it is armed first, so webTabOpen restores
     * that history instead of loading the address: the 27-02 restore path, never
     * a fabricated history. Nothing closed is a no-op.
     */
    protected async reopenClosedTabRow(uri?: string): Promise<void> {
        let tab: ReopenableTab | null;
        try {
            tab = await this.store.reopenClosedTab(uri);
        } catch (error) {
            console.error('[@powerbrowser/chrome-bar] reading the closed tab failed:', error instanceof Error ? error.name : typeof error);
            return;
        }
        if (!tab || !/^https?:\/\//i.test(tab.url)) {
            return;
        }
        try {
            if (tab.withHistory && tab.key) {
                await this.profileStorage.armWebTabHistory(tab.key);
            }
            const widget = await this.webTabOpener.openUrl(tab.url, tab.key ?? undefined);
            await this.addressBar.joinActiveGroup(widget);
            widget.focusPage();
        } catch (error) {
            console.error('[@powerbrowser/chrome-bar] reopening a closed tab failed:', error instanceof Error ? error.name : typeof error);
        }
    }

    /** BMK-06: both History sections' reads, in parallel; one refused read fails only its own section. */
    protected async readHistoryMenu(): Promise<HistoryMenuReads> {
        const [closed, recent] = await Promise.all([
            withinBudget(this.store.listClosedTabs(HISTORY_MENU_ROWS), 'failed'),
            withinBudget(this.store.searchPlaces('', HISTORY_MENU_ROWS, 'history'), 'failed'),
        ]);
        return { closed, recent };
    }

    /** The first key bound to `command`, as the menu's shortcut hint (Theia's own accelerator form). */
    protected acceleratorOf(command: string): string[] {
        const binding = this.keybindings.getKeybindingsForCommand(command)[0];
        return binding ? this.keybindings.acceleratorFor(binding, '+') : [];
    }

    /**
     * BMK-06 (D-08, 33-UI-SPEC order): Reopen Closed Tab with its key, then the
     * Recently closed tabs section (newest first), then the Recent pages section,
     * each behind a separator with a header row. A closed row reopens with its
     * history; a recent page loads in the current tab, or a new tab with Ctrl or
     * Alt. An empty section shows its disabled "No ..." row, a refused read the
     * failure row. Nothing closed disables the reopen row.
     */
    protected historyMenuChildren(reads: HistoryMenuReads): (CommandMenu | CompoundMenuNode)[] {
        const failed = (id: string): CommandMenu => this.menuLeaf(id, CHROME_BAR_COPY.historyMenuFailed(appSubject()), () => undefined, false);
        const section = (id: string, header: string, rows: CommandMenu[]): CompoundMenuNode =>
            this.menuGroup(id, [this.menuLeaf(`${id}-header`, header, () => undefined, false), ...rows]);
        const { closed, recent } = reads;
        const closedRows = closed === 'failed'
            ? [failed('closed-failed')]
            : closed.length
                ? closed.map((closedTab, index) => this.menuLeaf(`closed-${index}`, historyLabel({ index, url: closedTab.url, title: closedTab.title }),
                    // The closed row's key is the reopen lookup chrome resolves; the tab opens on the url chrome returns.
                    () => this.reopenClosedTabRow(closedTab.uri)))
                : [this.menuLeaf('closed-empty', CHROME_BAR_COPY.noClosedTabs, () => undefined, false)];
        const recentRows = recent === 'failed'
            ? [failed('recent-failed')]
            : recent.length
                ? recent.map((page, index) => this.menuLeaf(`recent-${index}`, historyLabel({ index, url: page.url, title: page.title }), () => this.openPlace(page.url, this.menuTarget)))
                : [this.menuLeaf('recent-empty', CHROME_BAR_COPY.noRecentPages, () => undefined, false)];
        const children: (CommandMenu | CompoundMenuNode)[] = [
            this.menuLeaf('reopen', CHROME_BAR_COPY.reopenClosedTab, () => this.reopenClosedTabRow(), closed !== 'failed' && closed.length > 0,
                this.acceleratorOf(CHROME_BAR_REOPEN_CLOSED_TAB_COMMAND_ID)),
            section('closed', CHROME_BAR_COPY.recentlyClosedTabs, closedRows),
            section('recent', CHROME_BAR_COPY.recentPages, recentRows),
            // BMK-05 (D-10): opens the picker anchored to the hamburger; the row never clears.
            this.menuGroup('clear', [this.menuLeaf('clear-history', CHROME_BAR_COPY.clearRecentHistoryRow,
                () => this.openClearHistoryPicker(this.appMenuButton ?? undefined), true, this.acceleratorOf(CHROME_BAR_CLEAR_HISTORY_COMMAND_ID))]),
        ];
        return children.map((child, index) => ({ ...child, sortString: String(index).padStart(2, '0') }));
    }

    /**
     * BMK-05 (D-10): opens the Clear Recent History picker with Last hour chosen.
     * Focus returns to `opener`, else to the element focused now, else (a page
     * had focus) to the current web tab's page. Never clears.
     */
    protected openClearHistoryPicker(opener?: HTMLElement): void {
        if (this.clearHistoryPicker) {
            return;
        }
        const active = document.activeElement;
        const focused = active instanceof HTMLElement && active !== document.body && !active.closest('.lm-Menu') ? active : undefined;
        this.clearHistoryPicker = { range: 'last-hour', failed: false, busy: false, opener: opener ?? focused };
        this.update();
    }

    protected closeClearHistoryPicker = (restoreFocus: boolean): void => {
        const picker = this.clearHistoryPicker;
        if (!picker) {
            return;
        }
        this.clearHistoryPicker = undefined;
        this.update();
        if (restoreFocus) {
            setTimeout(() => (picker.opener?.isConnected ? picker.opener.focus() : currentWebTab()?.focusPage()));
        }
    };

    /**
     * BMK-05 (D-09, T-33-04, rule 12): the one place the clear is sent, from the
     * picker's Clear or Enter with the chosen range. Success closes the panel and
     * drops what the clear removed: the History submenu re-reads on every open,
     * the toolbar and the pill's history rows re-read now. A refusal keeps the
     * panel with the failure row; Enter tries again.
     */
    protected async confirmClearHistory(): Promise<void> {
        const picker = this.clearHistoryPicker;
        if (!picker || picker.busy) {
            return;
        }
        picker.busy = true;
        try {
            await this.store.clearHistory(picker.range);
        } catch (error) {
            console.error('[@powerbrowser/chrome-bar] clearing history failed:', error instanceof Error ? error.name : typeof error);
            picker.busy = false;
            picker.failed = true;
            this.update();
            return;
        }
        if (this.clearHistoryPicker === picker) {
            // WR-05: focus the user moved elsewhere while the clear ran stays where it is.
            const active = document.activeElement;
            this.closeClearHistoryPicker(!active || active === document.body || !!active.closest('.pb-clear-history'));
        }
        this.addressBar.forgetHistoryRows();
        void this.refreshBookmarksToolbar();
    }

    /** BMK-05 (33-UI-SPEC geometry): 4px under the hamburger, the panel's right edge on the button's. */
    protected renderClearHistoryPicker(): React.ReactNode {
        const picker = this.clearHistoryPicker;
        if (!picker) {
            return undefined;
        }
        const anchor = this.appMenuButton?.getBoundingClientRect();
        return <ClearHistoryPicker
            picker={picker}
            top={Math.round((anchor?.bottom ?? 0) + 4)}
            right={Math.round(window.innerWidth - (anchor?.right ?? window.innerWidth))}
            onRange={range => { picker.range = range; this.update(); }}
            onClear={() => void this.confirmClearHistory()}
            onClose={this.closeClearHistoryPicker}
        />;
    }

    /** BMK-04: the toolbar setting, read from user settings only (the Home settings rule). */
    protected bookmarksToolbarShown(): boolean {
        return this.addressBar.userPreference<boolean>(SHOW_BOOKMARKS_TOOLBAR_PREFERENCE, false) === true;
    }

    /**
     * BMK-04 (D-04): shows or hides the toolbar in every mode from the setting.
     * The body attribute grows the top panel by the 28px row, and the shell
     * re-measures it so the page rect shrinks rather than being covered.
     * Turning the toolbar on always re-reads it.
     */
    protected syncBookmarksToolbar(): void {
        const shown = this.bookmarksToolbarShown();
        if ((document.body.getAttribute(BOOKMARKS_TOOLBAR_ATTRIBUTE) === 'shown') !== shown) {
            document.body.setAttribute(BOOKMARKS_TOOLBAR_ATTRIBUTE, shown ? 'shown' : 'hidden');
            this.shell.fit();
        }
        if (shown) {
            void this.refreshBookmarksToolbar();
        } else {
            this.toolbarSeq++;
            this.toolbarItems = [];
            this.toolbarIcons = {};
        }
        this.update();
    }

    /**
     * BMK-04 (D-05, T-33-03): re-reads listBookmarkFolder('toolbar'). Rows come
     * from the read only, never from the push. A refused read replaces the items
     * with the failure row. Only web bookmarks are items: folders and other
     * schemes are skipped.
     */
    protected async refreshBookmarksToolbar(): Promise<void> {
        if (!this.bookmarksToolbarShown()) {
            return;
        }
        const seq = ++this.toolbarSeq;
        let items: BookmarkEntry[] | 'failed';
        try {
            items = (await this.store.listBookmarkFolder('toolbar')).filter(row => /^https?:\/\//i.test(row.url));
        } catch (error) {
            console.error('[@powerbrowser/chrome-bar] reading the bookmarks toolbar failed:', error instanceof Error ? error.name : typeof error);
            items = 'failed';
        }
        if (seq !== this.toolbarSeq) {
            return;
        }
        this.toolbarItems = items;
        this.update();
        if (items === 'failed') {
            return;
        }
        // placesFavicons takes at most 10 urls per request.
        const icons: Record<string, string> = {};
        for (let at = 0; at < items.length; at += 10) {
            Object.assign(icons, await this.store.placesFavicons(items.slice(at, at + 10).map(row => row.url)).catch(() => ({})));
        }
        if (seq === this.toolbarSeq) {
            this.toolbarIcons = icons;
            this.update();
        }
    }

    /**
     * BMK-04 / BMK-06: opens a bookmark or a recent page. 'current' navigates the
     * active web tab (a new foreground tab without one); a new tab opens after the
     * current one, joined to the active group, and only a foreground one is selected.
     */
    protected async openPlace(url: string, target: OpenTarget): Promise<void> {
        if (!/^https?:\/\//i.test(url)) {
            return;
        }
        const tab = currentWebTab();
        try {
            if (target === 'current' && tab) {
                await tab.navigate(url);
                tab.focusPage();
                return;
            }
            const ref = tab ?? this.shell.currentWidget;
            const widget = ref ? await this.webTabOpener.openInBackground(url, ref) : await this.webTabOpener.openUrl(url);
            await this.addressBar.joinActiveGroup(widget);
            if (target !== 'background') {
                await this.shell.activateWidget(widget.id);
                widget.focusPage();
            }
        } catch (error) {
            console.error('[@powerbrowser/chrome-bar] opening a page failed:', error instanceof Error ? error.name : typeof error);
        }
    }

    /** One per-request menu row; a disabled row runs nothing. */
    protected menuLeaf(id: string, label: string, run: () => unknown, enabled = true, accelerator: string[] = []): CommandMenu {
        return {
            id,
            label,
            sortString: '',
            isVisible: () => true,
            isEnabled: () => enabled,
            isToggled: () => false,
            run: async () => {
                if (enabled) {
                    await run();
                }
            },
            ...(accelerator.length ? { getAccelerator: () => accelerator } : {}),
        } as CommandMenu;
    }

    /** An unlabelled group (Theia draws a separator on either side), children ordered as given. */
    protected menuGroup(id: string, children: (CommandMenu | CompoundMenuNode)[]): CompoundMenuNode {
        return {
            id,
            sortString: '',
            isVisible: () => true,
            isEmpty: () => children.length === 0,
            children: children.map((child, index) => ({ ...child, sortString: String(index).padStart(2, '0') })),
        };
    }

    /**
     * A per-request stock `.lm-Menu` under `anchor`. While it is open the last
     * key or click records its modifiers, so a row's run can follow the Phase
     * 29 targets (Alt+Enter foreground, Ctrl+click background).
     */
    protected renderBarMenu(menuPath: MenuPath, menu: CompoundMenuNode, anchor: HTMLElement): void {
        this.menuTarget = 'current';
        const track = (e: KeyboardEvent | MouseEvent): void => {
            this.menuTarget = e.altKey ? 'foreground' : e.ctrlKey || e.metaKey ? 'background' : 'current';
        };
        document.addEventListener('keydown', track, true);
        document.addEventListener('mouseup', track, true);
        const rect = anchor.getBoundingClientRect();
        this.menus.render({
            menuPath,
            menu,
            anchor: { x: rect.left, y: rect.bottom },
            context: anchor,
            includeAnchorArg: false,
            onHide: () => {
                document.removeEventListener('keydown', track, true);
                document.removeEventListener('mouseup', track, true);
            },
        });
    }

    /** BMK-04: the hidden toolbar items, in order, as menu rows. */
    protected openBookmarksOverflow = (hidden: BookmarkEntry[], anchor: HTMLElement): void => {
        const rows = hidden.map((item, index) =>
            this.menuLeaf(`bookmark-${index}`, historyLabel({ index, url: item.url, title: item.title }), () => this.openPlace(item.url, this.menuTarget)));
        this.renderBarMenu(BOOKMARKS_TOOLBAR_MENU_PATH, this.menuGroup('bookmarks-overflow', rows), anchor);
    };

    /** BMK-04: an item's right-click menu. Remove is the editor's remove path: removeBookmark from this handler, then the push re-reads. */
    protected openBookmarkItemMenu = (item: BookmarkEntry, anchor: HTMLElement): void => {
        this.renderBarMenu(BOOKMARKS_TOOLBAR_MENU_PATH, this.menuGroup('bookmark-item', [
            this.menuLeaf('open', CHROME_BAR_COPY.bookmarkOpen, () => this.openPlace(item.url, 'current')),
            this.menuLeaf('open-new-tab', CHROME_BAR_COPY.bookmarkOpenInNewTab, () => this.openPlace(item.url, 'foreground')),
            this.menuLeaf('remove', CHROME_BAR_COPY.removeBookmark, () => this.removeToolbarBookmark(item)),
        ]), anchor);
    };

    protected async removeToolbarBookmark(item: BookmarkEntry): Promise<void> {
        try {
            await this.store.removeBookmark(item.guid || item.url);
        } catch (error) {
            console.error('[@powerbrowser/chrome-bar] removing a bookmark failed:', error instanceof Error ? error.name : typeof error);
        }
    }

    /** BMK-04: an item's tooltip is its title, or its address when it has none (above the row, like the nav buttons). */
    protected onBookmarkHover = (item: BookmarkEntry, anchor: HTMLElement): void => {
        this.hover.requestHover({ content: item.title || item.url, target: anchor, position: 'top', cssClasses: ['pb-chrome-bar-hover'] });
    };

    protected renderBookmarksToolbar(): React.ReactNode {
        if (!this.bookmarksToolbarShown()) {
            return undefined;
        }
        return <BookmarksToolbar
            items={this.toolbarItems}
            icons={this.toolbarIcons}
            onOpen={(item, target) => void this.openPlace(item.url, target)}
            onItemMenu={this.openBookmarkItemMenu}
            onItemHover={this.onBookmarkHover}
            onOverflow={this.openBookmarksOverflow}
        />;
    }

    constructor() {
        super();
        // ReactWidget's constructor opts every subclass into perfect-scrollbar.
        // On a fixed-height bar that is actively harmful: it set overflow:hidden
        // on a node the shell had sized to the 32px menubar row while the bar
        // itself is 40px, so 8px was clipped and the bar drifted to y=-4 as the
        // hidden scroll position moved. The bar is one fixed row and scrolls in
        // no direction, so it takes no scrollbar.
        this.scrollOptions = undefined;
        this.id = ChromeBarWidget.ID;
        this.title.label = 'Chrome Bar';
        this.title.caption = 'Chrome Bar';
        this.title.closable = false;
    }

    /**
     * NAV-01/NAV-02: Stop while the active web tab loads; otherwise Reload,
     * ignored inside the post-Stop guard, Shift for a hard reload, Ctrl for a
     * duplicate in a background tab.
     */
    protected onReloadClick = async (e: ButtonEvent): Promise<void> => {
        const tab = currentWebTab();
        if (tab?.loading) {
            tab.stop();
            this.update();
            return;
        }
        if (performance.now() < this.reloadGuardUntil) {
            return;
        }
        if (e.ctrlKey || e.metaKey) {
            await this.openInNewTab('reload');
            return;
        }
        if (e.shiftKey && tab) {
            await tab.reload(true);
            this.update();
            return;
        }
        await this.runCommand(CHROME_BAR_RELOAD_COMMAND_ID)();
    };

    /** Back/Forward click: one step, a background tab with Ctrl, nothing for the release after a hold. */
    protected onNavClick = (which: 'back' | 'forward') => async (e: ButtonEvent): Promise<void> => {
        if (this.suppressNavClick) {
            this.suppressNavClick = false;
            return;
        }
        if (e.ctrlKey || e.metaKey) {
            await this.openInNewTab(which);
            return;
        }
        await this.runCommand(which === 'back' ? CHROME_BAR_BACK_COMMAND_ID : CHROME_BAR_FORWARD_COMMAND_ID)();
    };

    /** NAV-06: middle-click; nothing on the Stop state. */
    protected onNavAuxClick = (which: NavGesture) => (e: ButtonEvent): void => {
        if (e.button !== 1 || (which === 'reload' && currentWebTab()?.loading)) {
            return;
        }
        e.preventDefault();
        this.openInNewTab(which);
    };

    /** NAV-03: a 500 ms primary-button hold on Back or Forward opens the history menu. */
    protected onNavPointerDown = (e: React.PointerEvent<HTMLButtonElement>): void => {
        if (e.button !== 0) {
            return;
        }
        const button = e.currentTarget;
        this.suppressNavClick = false;
        this.clearHold();
        this.holdTimer = window.setTimeout(() => {
            this.holdTimer = undefined;
            this.suppressNavClick = true;
            // One-shot: only the release that ends this hold is swallowed. Cleared
            // after that release's click, wherever it lands, so a later keyboard
            // Enter/Space (a click with no pointerdown) is never eaten. A hold
            // ended by pointercancel delivers no pointerup, so that clears it too.
            const done = (): void => {
                window.removeEventListener('pointerup', done, true);
                window.removeEventListener('pointercancel', done, true);
                setTimeout(() => { this.suppressNavClick = false; });
            };
            window.addEventListener('pointerup', done, true);
            window.addEventListener('pointercancel', done, true);
            this.openHistoryMenu(button);
        }, HISTORY_HOLD_MS);
    };

    /**
     * NAV-05: the tooltip names the button's shortcut from the one table, at
     * 'top' so it sits over the row above the bar and never over the page.
     * Pointer, not mouse, enter: React drops onMouseEnter on a disabled button,
     * and a disabled button keeps its tooltip.
     */
    protected onNavHover = (button: NavButton) => (e: React.PointerEvent<HTMLButtonElement>): void => {
        this.hover.requestHover({
            content: tooltipFor(button),
            target: e.currentTarget,
            position: 'top',
            cssClasses: ['pb-chrome-bar-hover'],
        });
    };

    protected clearHold = (): void => {
        if (this.holdTimer !== undefined) {
            window.clearTimeout(this.holdTimer);
            this.holdTimer = undefined;
        }
    };

    /**
     * NAV-06 (Open Question 6: a URL-only duplicate): Back/Forward open the
     * adjacent history entry, Reload the current page, in a new background tab
     * after the current one, which stays selected and focused.
     */
    protected async openInNewTab(which: NavGesture): Promise<void> {
        const tab = currentWebTab();
        if (!tab) {
            return;
        }
        let url: string | undefined = tab.url;
        if (which !== 'reload') {
            const reply = await tab.history().catch(() => undefined);
            const target = (reply?.index ?? -2) + (which === 'back' ? -1 : 1);
            url = reply?.ok ? reply.entries?.find(entry => entry.index === target)?.url : undefined;
        }
        if (!url || !/^https?:\/\//i.test(url)) {
            return;
        }
        let widget: WebTabWidget;
        try {
            widget = await this.webTabOpener.openInBackground(url, tab);
        } catch (error) {
            console.error('[@powerbrowser/chrome-bar] opening a background tab failed:', error instanceof Error ? error.name : typeof error);
            return;
        }
        await this.addressBar.joinActiveGroup(widget);
    }

    /** NAV-06: an http(s) link dropped on New Tab opens in a new foreground tab with focus in the page. */
    protected onNewTabDrop = async (e: DropTargetDragEvent): Promise<void> => {
        e.currentTarget.classList.remove('is-drop-target');
        e.preventDefault();
        const url = droppedUrlOf(e.dataTransfer);
        if (!url) {
            return;
        }
        let widget: WebTabWidget;
        try {
            widget = await this.webTabOpener.openUrl(url);
        } catch (error) {
            console.error('[@powerbrowser/chrome-bar] opening a dropped link failed:', error instanceof Error ? error.name : typeof error);
            return;
        }
        await this.addressBar.joinActiveGroup(widget);
        widget.focusPage();
    };

    /**
     * NAV-03: the active tab's session history as a stock `.lm-Menu` at the
     * button's bottom-left, newest entry at the top and the current one
     * checked. It opens when the reply arrives (no spinner); a failed read
     * shows the one disabled error item. `.lm-Menu` is in the overlay's
     * blocking-layer selector, so the page hides while it is open.
     */
    protected async openHistoryMenu(button: HTMLElement): Promise<void> {
        const tab = currentWebTab();
        if (!tab) {
            return;
        }
        const reply = await tab.history().catch(() => undefined);
        const entries = reply?.ok && reply.where === 'done' ? reply.entries ?? [] : [];
        let chosen = false;
        const children: CommandMenu[] = entries.length
            ? [...entries].reverse().map((entry, position) => ({
                id: `history-entry-${entry.index}`,
                label: historyLabel(entry),
                sortString: String(position).padStart(2, '0'),
                isVisible: () => true,
                isEnabled: () => true,
                isToggled: () => entry.index === reply?.index,
                run: async () => {
                    if (entry.index === reply?.index) {
                        return;
                    }
                    chosen = true;
                    await tab.gotoIndex(entry.index);
                    tab.focusPage();
                },
            }))
            : [{
                id: 'history-error',
                label: CHROME_BAR_COPY.historyReadFailed(appSubject()),
                sortString: '00',
                isVisible: () => true,
                isEnabled: () => false,
                isToggled: () => false,
                run: async () => undefined,
            }];
        const menu: CompoundMenuNode = { id: 'history', sortString: '0', children, isVisible: () => true, isEmpty: () => false };
        const rect = button.getBoundingClientRect();
        this.menus.render({
            menuPath: HISTORY_MENU_PATH,
            menu,
            anchor: { x: rect.left, y: rect.bottom },
            context: button,
            includeAnchorArg: false,
            // Deferred past the stock focus restore, which runs on the same close
            // signal; an entry that ran has already sent focus to the page.
            onHide: () => setTimeout(() => {
                if (!chosen) {
                    button.focus();
                }
            }),
        });
    }

    /** Right-click, the context-menu key and Shift+F10 all arrive as `contextmenu`. */
    protected onHistoryContextMenu = (e: ButtonEvent): void => {
        e.preventDefault();
        this.openHistoryMenu(e.currentTarget);
    };

    /** Phase 31 plan 04 (MENU-01): the hamburger opens the per-request application menu under the button. */
    protected onAppMenuClick = (e: ButtonEvent): void => {
        void this.openAppMenu(e.currentTarget);
    };

    /**
     * Phase 33 plan 03 (BMK-06): the History row is a submenu built from this
     * open's reads, so the menu opens when both replies arrive (no spinner, the
     * NAV-03 rule).
     */
    protected async openAppMenu(button: HTMLElement): Promise<void> {
        // WR-06: a click while the reads are pending would draw a second menu.
        if (this.appMenuOpening) {
            return;
        }
        this.appMenuOpening = true;
        let reads: [HistoryMenuReads, PlaceMatch[] | 'failed', Partial<Record<EditCmd, boolean>>];
        try {
            reads = await Promise.all([
                this.readHistoryMenu(),
                withinBudget(this.store.searchPlaces('', HISTORY_MENU_ROWS, 'bookmark'), 'failed'),
                withinBudget(this.readEditState(), {}),
            ]);
        } finally {
            this.appMenuOpening = false;
        }
        const [history, bookmarks, editState] = reads;
        const menu = buildAppMenu(MENU_ORDER, WIRED_MENU_IDS, MENU_PHASE, {
            label: (menuId, enabled) => (enabled ? appMenuLabel(menuId) : CHROME_BAR_COPY.comingSoonRow(appMenuLabel(menuId))),
            run: row => this.runAppMenuRow(row),
            isEnabled: menuId => APP_MENU_COMMANDS[menuId] === undefined || this.commands.isEnabled(APP_MENU_COMMANDS[menuId]),
            submenu: menuId => (menuId === 'history' ? { menuPath: BOOKMARKS_HISTORY_MENU_PATH, children: this.historyMenuChildren(history) as unknown as AppMenuSubmenu['children'] }
                : this.appSubmenu(menuId, bookmarks, editState)),
        });
        const before = new Set(Array.from(document.querySelectorAll('.lm-Menu')));
        this.renderBarMenu(APP_MENU_PATH, menu as CompoundMenuNode, button);
        // The renderer takes no class; the menu it just drew is marked so the sheet can size it (MENU-01, UI-SPEC 280px).
        for (const element of Array.from(document.querySelectorAll('.lm-Menu'))) {
            if (!before.has(element)) {
                element.classList.add('pb-app-menu');
            }
        }
    }

    /** A per-request row that runs a Browser command id (D-13), dimmed while the command is disabled (or `enabled` is false). */
    protected commandLeaf(id: string, label: string, command: string, accelerator: string[] = [], enabled = this.commands.isEnabled(command)): CommandMenu {
        return this.menuLeaf(id, label, () => this.runCommand(command)(), enabled, accelerator);
    }

    /**
     * PAGE-09 (33-05): whether the focused page has each Edit row's command enabled now, read before the menu opens
     * (the NAV-03 no-spinner rule). checkOnly asks chrome, which asks the page's own docShell, so a collapsed selection
     * greys Cut and Copy. No web tab, or a refused read, reads as disabled.
     */
    protected async readEditState(): Promise<Partial<Record<EditCmd, boolean>>> {
        const tab = currentWebTab();
        if (!tab) {
            return {};
        }
        const replies = await Promise.all(EDIT_MENU_CMDS.map(cmd => tab.edit(cmd, true).then(reply => reply.enabled === true, () => false)));
        return Object.fromEntries(EDIT_MENU_CMDS.map((cmd, index) => [cmd, replies[index]]));
    }

    /**
     * Phase 33 plan 05 (MENU-03, 33-UI-SPEC "Full menu"): the Bookmarks, Zoom, More Tools and Help submenus, built
     * per open. Every row that does what a Browser command does runs that command's id; Get Help and About open
     * their stock pages through the Phase 31 row handler. Undefined keeps a row a plain row.
     */
    protected appSubmenu(menuId: string, bookmarks: PlaceMatch[] | 'failed', editState: Partial<Record<EditCmd, boolean>> = {}): AppMenuSubmenu | undefined {
        const ordered = (children: (CommandMenu | CompoundMenuNode)[]): AppMenuSubmenu => ({
            children: children.map((child, index) => ({ ...child, sortString: String(index).padStart(2, '0') })) as unknown as AppMenuSubmenu['children'],
        });
        switch (menuId) {
            case 'bookmarks': {
                const toolbarRow = {
                    ...this.commandLeaf('bookmarks-toolbar', CHROME_BAR_COPY.showBookmarksToolbarRow, CHROME_BAR_TOGGLE_BOOKMARKS_TOOLBAR_COMMAND_ID,
                        this.acceleratorOf(CHROME_BAR_TOGGLE_BOOKMARKS_TOOLBAR_COMMAND_ID)),
                    isToggled: () => this.commands.isToggled(CHROME_BAR_TOGGLE_BOOKMARKS_TOOLBAR_COMMAND_ID),
                };
                const recent = bookmarks === 'failed'
                    ? [this.menuLeaf('bookmarks-failed', CHROME_BAR_COPY.bookmarksMenuFailed(appSubject()), () => undefined, false)]
                    : bookmarks.map((page, index) => this.menuLeaf(`bookmark-${index}`, historyLabel({ index, url: page.url, title: page.title }),
                        () => this.openPlace(page.url, this.menuTarget)));
                return ordered([
                    this.commandLeaf('bookmark-page', CHROME_BAR_COPY.bookmarkThisPageRow, CHROME_BAR_BOOKMARK_PAGE_COMMAND_ID, pageKeyLabel('bookmarkPage')),
                    this.menuGroup('bookmarks-toolbar-group', [toolbarRow]),
                    ...(recent.length ? [this.menuGroup('bookmarks-recent', recent)] : []),
                ]);
            }
            case 'zoom': {
                const percent = Math.round((currentWebTab()?.zoom ?? 1) * 100);
                return ordered([
                    this.commandLeaf('zoom-in', CHROME_BAR_COPY.zoomInRow, CHROME_BAR_ZOOM_IN_COMMAND_ID, pageKeyLabel('zoomIn')),
                    this.commandLeaf('zoom-out', CHROME_BAR_COPY.zoomOutRow, CHROME_BAR_ZOOM_OUT_COMMAND_ID, pageKeyLabel('zoomOut')),
                    this.commandLeaf('zoom-reset', CHROME_BAR_COPY.zoomResetRow, CHROME_BAR_ZOOM_RESET_COMMAND_ID, pageKeyLabel('zoomReset')),
                    this.menuGroup('zoom-level', [this.menuLeaf('zoom-level-row', CHROME_BAR_COPY.zoomLevelRow(percent), () => undefined, false)]),
                ]);
            }
            case 'edit': {
                // PAGE-09: each row runs its Edit command id and greys from the page's live reply, never the command's own predicate.
                const live = (cmd: EditCmd): boolean => editState[cmd] === true;
                return ordered([
                    this.commandLeaf('edit-undo', CHROME_BAR_COPY.editUndoRow, CHROME_BAR_EDIT_UNDO_COMMAND_ID, [], live('cmd_undo')),
                    this.commandLeaf('edit-redo', CHROME_BAR_COPY.editRedoRow, CHROME_BAR_EDIT_REDO_COMMAND_ID, [], live('cmd_redo')),
                    this.menuGroup('edit-clipboard', [
                        this.commandLeaf('edit-cut', CHROME_BAR_COPY.editCutRow, CHROME_BAR_EDIT_CUT_COMMAND_ID, [], live('cmd_cut')),
                        this.commandLeaf('edit-copy', CHROME_BAR_COPY.editCopyRow, CHROME_BAR_EDIT_COPY_COMMAND_ID, [], live('cmd_copy')),
                        this.commandLeaf('edit-paste', CHROME_BAR_COPY.editPasteRow, CHROME_BAR_EDIT_PASTE_COMMAND_ID, [], live('cmd_paste')),
                    ]),
                    this.commandLeaf('edit-select-all', CHROME_BAR_COPY.editSelectAllRow, CHROME_BAR_EDIT_SELECT_ALL_COMMAND_ID, [], live('cmd_selectAll')),
                ]);
            }
            case 'more-tools':
                return ordered([
                    this.commandLeaf('page-source', CHROME_BAR_COPY.pageSourceRow, CHROME_BAR_VIEW_SOURCE_COMMAND_ID, pageKeyLabel('viewSource')),
                    this.commandLeaf('reader-view', CHROME_BAR_COPY.readerViewRow, CHROME_BAR_READER_TOGGLE_COMMAND_ID),
                    this.commandLeaf('page-devtools', CHROME_BAR_COPY.pageDevToolsRow, CHROME_BAR_DEVTOOLS_COMMAND_ID, pageKeyLabel('devtoolsOpen')),
                ]);
            case 'help':
                return ordered([
                    this.menuLeaf('get-help', CHROME_BAR_COPY.getHelpRow, () => this.openStockPageRow('support')),
                    this.menuGroup('help-about', [this.menuLeaf('about', CHROME_BAR_COPY.aboutAppRow(appSubject()), () => this.openStockPageRow('about'))]),
                ]);
            default:
                return undefined;
        }
    }

    /** MENU-03 (D-14/D-14b): the Full Screen row's and command's handler, the one sender of the window-chrome kind. */
    protected async toggleFullScreenRow(): Promise<void> {
        try {
            await this.store.fullScreen();
        } catch (error) {
            console.error('[@powerbrowser/chrome-bar] toggling full screen failed:', error instanceof Error ? error.name : typeof error);
        }
    }

    /** Phase 31 plan 04: a wired row's action. The builder never calls this for a disabled row. */
    protected runAppMenuRow(row: AppMenuRow): void {
        if (row.menuId === 'new-tab') {
            void this.runCommand(CHROME_BAR_NEW_TAB_COMMAND_ID)();
            return;
        }
        // MENU-03 (D-13): a command row runs the id its Actions row runs.
        const command = APP_MENU_COMMANDS[row.menuId];
        if (command) {
            void this.runCommand(command)();
            return;
        }
        if (row.menuId === 'quit') {
            void this.quitApplicationRow();
            return;
        }
        if (row.stockPage) {
            void this.openStockPageRow(row.stockPage);
        }
    }

    /**
     * Phase 31 plan 05 (MENU-04, D-31-13): the Quit row sends the quitRequest store kind; chrome calls the one
     * quit path. The Theia side holds no quit implementation. A cancelled quit is an answer, not a failure.
     */
    protected async quitApplicationRow(): Promise<void> {
        try {
            await this.store.quitRequest();
        } catch (error) {
            console.error('[@powerbrowser/chrome-bar] quitting failed:', error instanceof Error ? error.name : typeof error);
        }
    }

    /** Phase 31 plan 04 (MENU-02): opens one stock page by its enum name; a failure is logged by error name only. */
    protected async openStockPageRow(page: string): Promise<void> {
        try {
            await this.store.openStockPage(page);
        } catch (error) {
            console.error('[@powerbrowser/chrome-bar] opening a stock page failed:', error instanceof Error ? error.name : typeof error);
        }
    }

    protected runCommand = (id: string) => async (): Promise<void> => {
        try {
            await this.commands.executeCommand(id);
        } catch (error) {
            console.error('[@powerbrowser/chrome-bar] command failed:', id, error);
        }
        this.update();
    };

    /**
     * Current-widget change from the contribution: follows the new widget's
     * state pushes when it is a web tab (dropping the previous
     * subscription), then hands the address and draft half to the address
     * bar and re-renders nav enablement.
     */
    onCurrentWidgetChanged(widget: Widget | undefined): void {
        this.stateSubscription?.dispose();
        this.stateSubscription = undefined;
        // The find bar belongs to the tab it was opened on; the query stays in that tab.
        this.findOpen = false;
        if (widget instanceof WebTabWidget) {
            let wasLoading = widget.loading;
            this.stateSubscription = widget.onDidChangeState(state => {
                if (wasLoading && !state.loading) {
                    this.reloadGuardUntil = performance.now() + RELOAD_GUARD_MS;
                }
                wasLoading = state.loading;
                this.addressBar.syncAddressFromWidget(widget);
                this.update();
            });
        }
        this.addressBar.onCurrentWidgetChanged(widget);
        this.update();
    }

    /**
     * The MAIN-AREA tab count, and only that. `allTabBars` is
     * mainAreaTabBars plus bottomAreaTabBars plus the left and right panel
     * tab bars, so counting it folded in exactly the surfaces a mode switch
     * is contracted to change: Browsing and Organising collapse all three
     * side areas, Coding expands the left one. The before/after comparison
     * in selectMode was therefore false-red by construction -- it reported
     * the contracted panel reshape as a broken tabs invariant on every
     * switch, which is permanent noise in the one log used to diagnose a
     * real tab loss.
     *
     * The organising placeholder is excluded one hop further down for the
     * same reason: the Organising slot opens exactly one main-area widget on
     * entry and closes it on exit, so counting it would move the number by
     * one on each of the two switches that cross the Organising boundary --
     * again a contracted change, not a lost tab.
     */
    protected countTabs(): number {
        return this.shell.mainAreaTabBars.reduce(
            (total, tabBar) => total + tabBar.titles.filter(title => title.owner.id !== OrganisingWidget.ID).length,
            0
        );
    }

    /**
     * Segment selection activates the matching shipped mode through the
     * imported mode command const -- the identical channel selectCustomMode
     * uses below, never a re-spelled string.
     *
     * The three shipped segments used to call the stock perspective service
     * directly, one hop shallower, and that was the whole reason a shipped
     * mode reshaped nothing: the contracted per-mode panel map, the panel
     * expand/collapse flags, and the organising slot all live behind the
     * mode command, so a direct stock switch skipped every one of them.
     * Coding switched perspective and then showed no Theia view. Custom rows
     * never had the bug because they always routed through the command.
     *
     * The toggle stays selection state only: the segment is set and
     * repainted even when activation throws, and a tab-count mismatch is
     * logged, never thrown. Segment labels map to mode ids by lowercasing --
     * the shipped-mode defaults gate asserts that rule, so a label that stops
     * mapping fails the gate instead of silently switching nothing. The
     * repaint path is unchanged: the stock perspective event still fires at
     * the end of the switch (one hop deeper now, inside the command), and
     * the contribution's onDidChangePerspective subscription re-asserts the
     * toggle from it.
     */
    protected selectMode = (next: string) => async (): Promise<void> => {
        if (this.mode === next && this.activeCustomId === undefined) {
            return;
        }
        const before = this.countTabs();
        this.mode = next;
        this.activeCustomId = undefined;
        try {
            await this.commands.executeCommand(MODES_ACTIVATE_COMMAND_ID, next.toLowerCase());
        } catch (error) {
            console.error('[@powerbrowser/chrome-bar] mode activation failed:', next, error);
        }
        const after = this.countTabs();
        if (before !== after) {
            console.error(
                `[@powerbrowser/chrome-bar] tabs invariant broken by a mode switch: ${before} tabs before, ${after} after`
            );
        }
        this.update();
    };

    /**
     * GUI-07 (14-02): custom-mode activation routes through the imported mode
     * command const (never a re-spelled string) so panel flags, the
     * placeholder slot re-assert run the same switch path as
     * shipped segments. The stock perspective event repaints the toggle.
     */
    protected selectCustomMode = (id: string) => async (): Promise<void> => {
        try {
            await this.commands.executeCommand(MODES_ACTIVATE_COMMAND_ID, id);
        } catch (error) {
            console.error('[@powerbrowser/chrome-bar] custom mode activation failed:', id, error);
        }
        this.update();
    };

    protected refreshCustomModes(): void {
        let customs: Array<{ id: string; name: string }> = [];
        try {
            customs = this.modes.getCustomModes();
        } catch {
            customs = [];
        }
        this.customModes = customs;
        if (this.activeCustomId !== undefined && !customs.some(row => row.id === this.activeCustomId)) {
            this.activeCustomId = undefined;
        }
    }

    /**
     * Stock perspective changes from anywhere else (commands, palette,
     * layout restore) re-assert the toggle. Unknown ids leave
     * the shipped selection untouched and still re-assert the count.
     */
    syncModeFromPerspective(id: string): void {
        this.refreshCustomModes();
        const label = ChromeBarWidget.MODES.find(candidate => candidate.toLowerCase() === id);
        if (label !== undefined) {
            this.mode = label;
            this.activeCustomId = undefined;
        } else if (this.modes.hasCustomMode(id)) {
            this.activeCustomId = id;
        } else {
            this.activeCustomId = undefined;
        }
        // D-15: every PowerBrowser-mode change, startup included, returns the pill to that mode's default.
        this.addressBar.uiModeChanged(id);
        this.update();
    }

    /** PAGE-01: opens the find bar for `tab` (the page relay's find key) and focuses its field. */
    protected openFind(tab: WebTabWidget): void {
        if (currentWebTab() !== tab) {
            return;
        }
        this.findOpen = true;
        this.update();
        setTimeout(() => {
            const input = document.getElementById('pb-chrome-bar-find-input') as HTMLInputElement | null;
            input?.focus();
            input?.select();
        });
    }

    /** PAGE-01: closes the bar and clears the page selection; Esc and the close button return focus to the page. */
    protected closeFind(restoreFocus: boolean): void {
        const tab = currentWebTab();
        this.findOpen = false;
        this.update();
        void tab?.findClose();
        if (restoreFocus) {
            tab?.focusPage();
        }
    }

    /** PAGE-01: typing runs the find; an emptied field clears the page's matches and the stored query. */
    protected onFindChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
        const tab = currentWebTab();
        if (!tab) {
            return;
        }
        const query = e.currentTarget.value;
        if (query.length === 0) {
            tab.findQuery = '';
            void tab.findClose();
            return;
        }
        void tab.find(query, this.findOptions);
    };

    /** PAGE-01: Enter steps next, Shift+Enter and Shift+F3 step previous, F3 steps next, Esc closes. */
    protected onFindKeyDown = (e: React.KeyboardEvent<HTMLElement>): void => {
        if (e.key === 'Escape') {
            e.preventDefault();
            this.closeFind(true);
            return;
        }
        if (e.key === 'Enter' || e.key === 'F3') {
            e.preventDefault();
            void currentWebTab()?.findNext(e.shiftKey);
        }
    };

    /** PAGE-01: a toggle flips its option and re-runs the stored query, so the matches follow at once. */
    protected toggleFindOption(key: FindOptionKey): void {
        this.findOptions = { ...this.findOptions, [key]: !this.findOptions[key] };
        const tab = currentWebTab();
        if (tab && tab.findQuery.length > 0) {
            void tab.find(tab.findQuery, this.findOptions);
        }
        this.update();
    }

    /** PAGE-03: the notice for a print whose dialog did not open; the next print clears it. */
    protected renderPrintNotice(): React.ReactNode {
        const tab = currentWebTab();
        if (!tab || !tab.printFailed) {
            return undefined;
        }
        return <div className='pb-chrome-bar-notice' role='status'>{CHROME_BAR_COPY.printFailed(appSubject())}</div>;
    }

    /** PAGE-08: the Theia save dialog for a page copy; resolves to the picked file's path, or undefined on cancel. */
    protected async chooseSaveDestination(suggestedName: string): Promise<string | undefined> {
        const uri = await this.fileDialogs.showSaveDialog({
            title: CHROME_BAR_COPY.savePageTitle,
            inputValue: suggestedName,
            filters: { 'Web page': ['html', 'htm'] },
        });
        return uri ? uri.path.fsPath() : undefined;
    }

    /** PAGE-08: the notice for a save that did not complete; the next save clears it. */
    protected renderSaveNotice(): React.ReactNode {
        const tab = currentWebTab();
        if (!tab || !tab.saveFailed) {
            return undefined;
        }
        return <div className='pb-chrome-bar-notice' role='status'>{CHROME_BAR_COPY.saveFailed(appSubject())}</div>;
    }

    /** PAGE-01: the find strip. The count renders from the pushed match index and total, never from the query. */
    protected renderFind(): React.ReactNode {
        const tab = currentWebTab();
        if (!this.findOpen || !tab) {
            return undefined;
        }
        const count = tab.findTotal > 0
            ? CHROME_BAR_COPY.findCount(tab.findCurrent, tab.findTotal)
            : tab.findStatus === 'notFound' ? CHROME_BAR_COPY.findNotFound : '';
        const toggle = (key: FindOptionKey, label: string): React.ReactNode => <button
            type='button'
            className={'pb-chrome-bar-find-toggle' + (this.findOptions[key] ? ' is-active' : '')}
            aria-pressed={this.findOptions[key]}
            title={label}
            onClick={() => this.toggleFindOption(key)}
        >{label}</button>;
        return <div className='pb-chrome-bar-find' role='search' aria-label={CHROME_BAR_COPY.findLabel}>
            <input
                id='pb-chrome-bar-find-input'
                type='text'
                className='pb-chrome-bar-find-input'
                aria-label={CHROME_BAR_COPY.findLabel}
                placeholder={CHROME_BAR_COPY.findLabel}
                defaultValue={tab.findQuery}
                onChange={this.onFindChange}
                onKeyDown={this.onFindKeyDown}
            />
            <span className='pb-chrome-bar-find-count' aria-live='polite'>{count}</span>
            {toggle('highlightAll', CHROME_BAR_COPY.findHighlightAll)}
            {toggle('caseSensitive', CHROME_BAR_COPY.findMatchCase)}
            {toggle('entireWord', CHROME_BAR_COPY.findWholeWords)}
            <button type='button' className='pb-chrome-bar-button' aria-label={CHROME_BAR_COPY.findPreviousMatch} title={CHROME_BAR_COPY.findPreviousMatch} onClick={() => void tab.findNext(true)}>
                <span className='codicon codicon-arrow-up' />
            </button>
            <button type='button' className='pb-chrome-bar-button' aria-label={CHROME_BAR_COPY.findNextMatch} title={CHROME_BAR_COPY.findNextMatch} onClick={() => void tab.findNext(false)}>
                <span className='codicon codicon-arrow-down' />
            </button>
            <button type='button' className='pb-chrome-bar-button' aria-label={CHROME_BAR_COPY.findClose} title={CHROME_BAR_COPY.findClose} onClick={() => this.closeFind(true)}>
                <span className='codicon codicon-close' />
            </button>
        </div>;
    }

    /**
     * PAGE-10 (32-08): the reader toggle beside the pill. Disabled, not removed, on a non-web tab (the 13-UI-SPEC layout
     * stability rule); enabled only where the tab's own canToggleReader says so. It acts in the same tab.
     */
    protected renderReaderToggle(): React.ReactNode {
        const tab = currentWebTab();
        const inReader = tab?.isReaderMode === true;
        const title = inReader ? CHROME_BAR_COPY.exitReaderView
            : tab?.hasPage && tab.canToggleReader ? CHROME_BAR_COPY.readerView
            : CHROME_BAR_COPY.readerUnavailable;
        return <button
            type='button'
            className='pb-chrome-bar-button pb-chrome-bar-reader'
            aria-label={title}
            aria-pressed={inReader}
            title={title}
            disabled={!tab || !(inReader || tab.canToggleReader)}
            onClick={() => void tab?.setReader(!inReader)}
        >
            <span className='codicon codicon-book' />
        </button>;
    }

    /** PAGE-02: the zoom chip, shown only while the pushed level is not 100%; one click resets it. */
    protected renderZoomChip(): React.ReactNode {
        const tab = currentWebTab();
        if (!tab || Math.abs(tab.zoom - 1) < 0.001) {
            return undefined;
        }
        return <button
            type='button'
            className='pb-chrome-bar-zoom-chip'
            aria-label={CHROME_BAR_COPY.zoomChipTooltip}
            title={CHROME_BAR_COPY.zoomChipTooltip}
            onClick={() => void tab.zoomReset()}
        >
            <span className='codicon codicon-zoom-in' />
            <span>{CHROME_BAR_COPY.zoomPercent(Math.round(tab.zoom * 100))}</span>
        </button>;
    }

    protected downloadsBadge(): number {
        return this.downloadRows.filter(row => row.state === 'in-progress' || (row.state === 'finished' && !this.downloadsRead.has(row.id))).length;
    }

    protected toggleDownloads(): void {
        if (this.downloadsOpen) {
            this.closeDownloads(true);
            return;
        }
        const tab = currentWebTab();
        if (!tab) {
            return;
        }
        for (const row of this.downloadRows) {
            if (row.state === 'finished') {
                this.downloadsRead.add(row.id);
            }
        }
        this.downloadsOpen = true;
        void tab.downloadsSubscribe();
        this.update();
        setTimeout(() => document.getElementById('pb-chrome-bar-downloads')?.focus());
    }

    protected closeDownloads(restoreFocus: boolean): void {
        this.downloadsOpen = false;
        this.update();
        if (restoreFocus) {
            currentWebTab()?.focusPage();
        }
    }

    protected onDownloadsKeyDown = (e: React.KeyboardEvent<HTMLElement>): void => {
        if (e.key === 'Escape') {
            e.preventDefault();
            this.closeDownloads(true);
            return;
        }
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') {
            return;
        }
        const rows = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="option"]'));
        if (rows.length === 0) {
            return;
        }
        e.preventDefault();
        const at = rows.indexOf(document.activeElement as HTMLElement);
        const step = e.key === 'ArrowDown' ? 1 : -1;
        rows[at < 0 ? (step > 0 ? 0 : rows.length - 1) : (at + step + rows.length) % rows.length].focus();
    };

    protected downloadAction(row: WebTabDownloadRow, action: DownloadAction): void {
        void currentWebTab()?.downloadAction(row.id, action);
    }

    protected downloadCaption(row: WebTabDownloadRow): string {
        if (row.state === 'in-progress') {
            const percent = row.bytesTotal > 0 ? Math.floor((row.bytesReceived * 100) / row.bytesTotal) : 0;
            return CHROME_BAR_COPY.downloadProgress(percent, downloadBytes(row.bytesReceived));
        }
        return row.state === 'failed' ? CHROME_BAR_COPY.downloadFailed : '';
    }

    protected renderDownloads(): React.ReactNode {
        const count = this.downloadsBadge();
        const hasBadge = count > 0;
        return <div className='pb-chrome-bar-downloads'>
            <button
                className='pb-chrome-bar-button'
                title={CHROME_BAR_COPY.downloads}
                aria-label={count > 0 ? CHROME_BAR_COPY.downloadsCount(count) : CHROME_BAR_COPY.downloads}
                aria-haspopup='listbox'
                aria-expanded={this.downloadsOpen}
                disabled={!currentWebTab()}
                onClick={this.runCommand(CHROME_BAR_DOWNLOADS_COMMAND_ID)}
            >
                <span className='codicon codicon-cloud-download' />
                {hasBadge && <span className='pb-chrome-bar-download-badge'>{count}</span>}
            </button>
            {this.downloadsOpen && this.renderDownloadsPanel()}
        </div>;
    }

    protected renderDownloadsPanel(): React.ReactNode {
        return <div
            className='pb-chrome-bar-dropdown pb-chrome-bar-downloads-panel'
            id='pb-chrome-bar-downloads'
            role='listbox'
            aria-label={CHROME_BAR_COPY.downloads}
            tabIndex={-1}
            onKeyDown={this.onDownloadsKeyDown}
        >
            <div className='pb-chrome-bar-download-heading'>{CHROME_BAR_COPY.downloads}</div>
            {this.downloadRows.length === 0 && <div className='pb-chrome-bar-download-empty'>
                <div>{CHROME_BAR_COPY.noDownloads}</div>
                <div className='pb-chrome-bar-download-hint'>{CHROME_BAR_COPY.noDownloadsHint}</div>
            </div>}
            {this.downloadRows.map(row => this.renderDownloadRow(row))}
        </div>;
    }

    protected renderDownloadRow(row: WebTabDownloadRow): React.ReactNode {
        const actions: [DownloadAction, string][] = row.state === 'finished'
            ? [['launch', CHROME_BAR_COPY.openDownload], ['showContainingDirectory', CHROME_BAR_COPY.showInFolder]]
            : row.state === 'in-progress'
                ? [['cancel', CHROME_BAR_COPY.cancelDownload]]
                : [['retry', CHROME_BAR_COPY.retryDownload]];
        const onRowKey = (e: React.KeyboardEvent<HTMLElement>): void => {
            if (e.key !== 'Enter' || e.target !== e.currentTarget) {
                return;
            }
            e.preventDefault();
            this.downloadAction(row, row.state === 'finished' ? 'launch' : row.state === 'in-progress' ? 'cancel' : 'retry');
        };
        return <div key={row.id} role='option' aria-selected={false} tabIndex={-1} className='pb-chrome-bar-download-row' data-state={row.state} onKeyDown={onRowKey}>
            <span className='codicon codicon-file' />
            <span className='pb-chrome-bar-download-title'>{row.filename}</span>
            <span className='pb-chrome-bar-download-caption'>{this.downloadCaption(row)}</span>
            {actions.map(([action, label]) => <button key={action} type='button' tabIndex={-1} className='pb-chrome-bar-download-action' onClick={() => this.downloadAction(row, action)}>{label}</button>)}
        </div>;
    }

    protected render(): React.ReactNode {
        // One shared navigable-tab predicate (GUI-02-owned) narrowed by the
        // active web tab's last state push: all three controls dim with
        // their contracted tooltips retained and the layout never shifts.
        const canNavigate = chromeBarHasNavigableTab();
        const tab = currentWebTab();
        const stopping = !!tab?.loading;
        // Phase 32 plan 02: the find strip sits under the 40px bar inside a host, so the page rect shrinks by its height.
        // Phase 33 (BMK-04): the 28px bookmarks toolbar sits between them while the setting is on.
        return <div className='pb-chrome-bar-host'>
        <div className='pb-chrome-bar'>
            <button
                className='pb-chrome-bar-button'
                aria-label='Back'
                aria-keyshortcuts={BUTTON_SHORTCUTS.back.aria}
                onPointerEnter={this.onNavHover('back')}
                disabled={!canNavigate || !tab?.canGoBack}
                onClick={this.onNavClick('back')}
                onAuxClick={this.onNavAuxClick('back')}
                onContextMenu={this.onHistoryContextMenu}
                onPointerDown={this.onNavPointerDown}
                onPointerUp={this.clearHold}
                onPointerLeave={this.clearHold}
                onPointerCancel={this.clearHold}
            >
                <span className='codicon codicon-chevron-left' />
            </button>
            <button
                className='pb-chrome-bar-button'
                aria-label='Forward'
                aria-keyshortcuts={BUTTON_SHORTCUTS.forward.aria}
                onPointerEnter={this.onNavHover('forward')}
                disabled={!canNavigate || !tab?.canGoForward}
                onClick={this.onNavClick('forward')}
                onAuxClick={this.onNavAuxClick('forward')}
                onContextMenu={this.onHistoryContextMenu}
                onPointerDown={this.onNavPointerDown}
                onPointerUp={this.clearHold}
                onPointerLeave={this.clearHold}
                onPointerCancel={this.clearHold}
            >
                <span className='codicon codicon-chevron-right' />
            </button>
            {/* NAV-01: ONE element is Reload or Stop by the pushed loading flag, so
                keyboard focus on it survives every load (no remount, no key change). */}
            <button
                className='pb-chrome-bar-button'
                aria-label={stopping ? 'Stop' : 'Reload'}
                aria-keyshortcuts={BUTTON_SHORTCUTS[stopping ? 'stop' : 'reload'].aria}
                onPointerEnter={this.onNavHover(stopping ? 'stop' : 'reload')}
                disabled={!stopping && (!canNavigate || !tab?.canReload)}
                onClick={this.onReloadClick}
                onAuxClick={this.onNavAuxClick('reload')}
            >
                <span className={stopping ? 'codicon codicon-close' : 'codicon codicon-refresh'} />
            </button>
            {this.addressBar.userPreference(SHOW_HOME_BUTTON_PREFERENCE, false) && (
                <button
                    className='pb-chrome-bar-button'
                    aria-label='Home'
                    aria-keyshortcuts={BUTTON_SHORTCUTS.home.aria}
                    onPointerEnter={this.onNavHover('home')}
                    onClick={() => this.addressBar.goHome(currentWebTab())}
                >
                    <span className='codicon codicon-home' />
                </button>
            )}
            {this.addressBar.render()}
            {this.renderReaderToggle()}
            {this.renderZoomChip()}
            <button
                className='pb-chrome-bar-button'
                aria-label='New Tab'
                aria-keyshortcuts={BUTTON_SHORTCUTS.newTab.aria}
                onPointerEnter={this.onNavHover('newTab')}
                onClick={this.runCommand(CHROME_BAR_NEW_TAB_COMMAND_ID)}
                onDragEnter={this.addressBar.onDropTargetDragOver}
                onDragOver={this.addressBar.onDropTargetDragOver}
                onDragLeave={this.addressBar.onDropTargetDragLeave}
                onDrop={this.onNewTabDrop}
            >
                <span className='codicon codicon-plus' />
            </button>
            <button
                ref={this.appMenuButtonRef}
                className='pb-chrome-bar-button'
                aria-label={CHROME_BAR_COPY.appMenu}
                title={CHROME_BAR_COPY.appMenu}
                aria-haspopup='menu'
                onClick={this.onAppMenuClick}
            >
                <span className='codicon codicon-menu' />
            </button>
            {this.renderDownloads()}
            <div className='pb-chrome-bar-toggle' role='group' aria-label='Mode'>
                {ChromeBarWidget.MODES.map(name => (
                    <button
                        key={name}
                        type='button'
                        className={'pb-chrome-bar-segment' + (this.mode === name && this.activeCustomId === undefined ? ' is-active' : '')}
                        aria-pressed={this.mode === name && this.activeCustomId === undefined}
                        onClick={this.selectMode(name)}
                    >
                        {name}
                    </button>
                ))}
                {this.customModes.length > 0 && (
                    <div className='pb-modes-custom-menu'>
                        {this.customModes.map(row => (
                            <button
                                key={row.id}
                                type='button'
                                className={'pb-chrome-bar-segment pb-modes-custom-row' + (this.activeCustomId === row.id ? ' is-active' : '')}
                                aria-pressed={this.activeCustomId === row.id}
                                title={row.name}
                                onClick={this.selectCustomMode(row.id)}
                            >
                                {row.name}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
        {this.renderBookmarksToolbar()}
        {this.renderFind()}
        {this.renderPrintNotice()}
        {this.renderSaveNotice()}
        {this.renderClearHistoryPicker()}
        </div>;
    }
}

@injectable()
export class ChromeBarContribution implements FrontendApplicationContribution {

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(ChromeBarWidget)
    protected readonly barWidget: ChromeBarWidget;

    @inject(AddressBar)
    protected readonly addressBar: AddressBar;

    @inject(TabStripWidget)
    protected readonly tabStrip: TabStripWidget;

    @inject(LayoutControlsWidget)
    protected readonly layoutControls: LayoutControlsWidget;

    /**
     * Top-panel widgets that belong to the IDE dress and not the browser one,
     * by their stock ids. Browsing hides them; the strip takes the space.
     */
    static readonly IDE_TOP_FURNITURE: readonly string[] = ['theia:menubar', 'theia:icon'];

    @inject(PerspectiveService)
    protected readonly perspectives: PerspectiveService;

    /** GUI-02: the frontend end of the web-tab bridge, for the window-chrome and drag-region messages. */
    @inject(WebTabChannel)
    protected readonly webTabs: WebTabChannel;

    /**
     * One current-widget sync for the subscription and the startup seed:
     * the shared navigable-tab predicate and the pill's address both
     * follow the shell's current widget.
     */
    protected syncCurrentWidget(widget: Widget | undefined): void {
        setCurrentWebTab(widget);
        this.barWidget.onCurrentWidgetChanged(widget);
        if (widget instanceof WebTabWidget) {
            void widget.downloadsSubscribe();
        }
    }

    /**
     * GUI-07 strip relocation: put the tabs in the home this mode contracts.
     *
     * Browsing shows the top-panel strip, hides the menubar whose 30px it
     * occupies, and hides the dock's own tab bar. Every other mode is the
     * reverse. 14-UI-SPEC per-mode shell map, amended 2026-09-08.
     *
     * This lives here rather than in `ModeService.activateMode` with the rest
     * of the per-mode shell work, and the reason is a dependency cycle, not
     * taste: `@powerbrowser/chrome-bar` already imports `@powerbrowser/modes`
     * (the activate command, ModeService, OrganisingWidget), so the mode
     * service cannot import the strip back. Reaching it by
     * `shell.getWidgetById` instead does not work either -- Theia's
     * `addWidget` only tracks main/bottom/left/right, `case 'top'` is a bare
     * `topPanel.addWidget`, so no top-panel widget is ever in the registry.
     * That was not theory: the first cut hid the dock's bar and left the
     * strip hidden with it, showing no tabs at all in Browsing.
     *
     * Driven by `body[data-pb-mode]`, which `ModeService.activateMode`
     * writes at the end of EVERY switch including the launch one. The
     * perspective event was the obvious hook and is the wrong one: stock
     * `switchPerspective` returns silently for an already-active id, so
     * arriving in Browsing when Browsing is already the perspective fires
     * nothing, and the launch seed lost the same race the toggle's own seed
     * exists to work around. Live, that showed as a correct strip after any
     * real switch and no strip at all on a fresh page.
     *
     * An attribute the mode service already publishes has neither problem:
     * it is set once per activation, it is set last, and reading it here
     * needs no import that would close the cycle.
     */
    protected observeMode(): void {
        const apply = () => {
            this.applyStripHome(document.body.getAttribute(MODE_ATTRIBUTE) ?? '');
            this.scheduleDragRegions();
        };
        new MutationObserver(apply).observe(document.body, { attributeFilter: [MODE_ATTRIBUTE] });
        // Re-assert on every shell add and remove, not only on a mode change.
        // The dock creates its tab bars as it needs them, and a bar that
        // appears after the switch has never been told which mode it is in --
        // it takes Lumino's default, which is visible. Reported live as tabs
        // vanishing in Coding after opening a tab in Browsing, and it is a
        // race, not a wrong flag: the same switch is correct when the dock
        // happens to settle first. Re-applying is idempotent, so the cure is
        // to stop depending on the order at all.
        this.shell.onDidAddWidget(() => apply());
        this.shell.onDidRemoveWidget(() => apply());
        // And on every dock layout change. A split or an un-split is neither
        // an add nor a remove -- the widget is the same, only its pane moved
        // -- but it changes how many tab bars exist, which is what decides
        // whether Browsing shows them.
        this.shell.mainPanel.layoutModified.connect(() => apply());
        // The launch activation may have landed before this ran, in which
        // case no mutation is coming and the attribute is already correct.
        apply();
    }

    protected applyStripHome(modeId: string): void {
        // An unknown mode arranges NOTHING. Every rule below is phrased by
        // exclusion -- not coding, not browsing -- so an empty id used to
        // satisfy both and hide the dock bar AND the strip, leaving no tabs
        // anywhere. That is not hypothetical: it fired 22 times during
        // startup before the attribute existed, and once on every tab open
        // and close whose re-assert read the attribute mid-transition. It is
        // the "tabs vanish after switching back and forth" report, and the
        // earlier re-assert fix made it easier to hit rather than causing it.
        //
        // Leaving the shell alone is the only safe reading of "I do not know
        // which mode this is": the arrangement already on screen was applied
        // by a mode that did know.
        if (!modeId) {
            return;
        }
        // One rule, phrased by exclusion: Coding wears the IDE dress, every
        // other mode wears the browser one. The same rule the rails and the
        // status bar already follow in ModeService, so a mode cannot end up
        // half-dressed -- and a future mode gets the browser shell unless it
        // asks for the IDE, rather than inheriting the IDE from a list nobody
        // updated.
        //
        // Organising is why this is not `=== 'browsing'`. It had the menubar
        // and no strip, which was both wrong to look at and geometrically
        // stuck: the top panel is pinned at 72px, so hiding the menubar with
        // nothing to take its place leaves 32px of dead space above the
        // canvas. Showing the strip there fills exactly that, and the tabs
        // stay reachable while their cards are being arranged below.
        const ideDress = modeId === 'coding';
        // The strip is Browsing's home only. Organising's tabs are the cards
        // on its canvas, so a strip there would be the same tabs twice -- it
        // was carried there briefly only to fill the space the menubar left,
        // which the per-mode top-panel height in chrome-bar.css now removes
        // the need for.
        this.tabStrip.setHidden(modeId !== 'browsing');
        this.layoutControls.setHidden(!ideDress);
        // The mode just opened or closed panels; the toggles show that state.
        this.layoutControls.update();
        for (const widget of this.shell.topPanel.widgets) {
            if (ChromeBarContribution.IDE_TOP_FURNITURE.includes(widget.id)) {
                widget.setHidden(!ideDress);
            }
        }
        // The dock's own tab bars, one per pane.
        //
        // Unsplit, Browsing hides the single bar: the strip above the URL row
        // shows the same tabs, and showing both is the same list twice. Split,
        // the bars come back, because they are the only thing on screen that
        // says which tabs are in WHICH pane -- the strip is one flat row over
        // the whole dock and cannot. Each bar sits under the URL row, holds
        // its pane's tabs with the current one lit, and is a drop target for
        // the next tab, so parking one tab on the left is what makes the
        // right side grow a place to put another. The strip stays as the
        // master list to drag from, in either direction.
        //
        // The leftmost pane is the exception in both cases: the strip IS its
        // tab bar (TabStripWidget.primaryBar), so its own bar stays hidden
        // and a tab is listed exactly once. Every other pane shows its bar.
        //
        // Read fresh, in layout order, every time this runs: the dock
        // creates and removes bars as the layout changes, and which one is
        // first is a fact about the layout, not a flag to keep in step.
        //
        // Split, every pane shows its own bar with its own tabs, the leftmost
        // included -- the user is in a tab and expects to see it in the bar
        // under the URL row, whichever side it is on (2026-09-10, with a
        // screenshot of a blank left bar circled). The strip above still
        // lists the leftmost pane's tabs as the row to drag from and back to;
        // that one pane's tabs therefore appear in both places while split,
        // and that is the Theia arrangement the user asked for by name.
        // The home bar shows while the window is split OR while tabs are
        // stacked on the home side with no other pane left -- closing the
        // last tab of the other pane must not make the stacked ones vanish
        // (they are not in the strip either; reported 2026-09-10).
        const bars = [...this.shell.mainPanel.tabBars()];
        const showHome = bars.length > 1 || this.tabStrip.hasStack();
        const home = this.tabStrip.primaryBar();
        for (const bar of bars) {
            bar.setHidden(!ideDress && bar === home && !showHome);
        }
        // The two 48px icon rails, re-asserted here for the same reason the
        // tab bars are: the mode service hides them once, on the switch, and
        // anything that shows them afterwards wins by default.
        //
        // Dragging a tab is exactly such a thing. The shell reveals its side
        // panels while a widget drag is in flight, because in an IDE they are
        // places you might drop it -- so dragging a tab toward either edge of
        // a Browsing window pops out a strip of IDE icons, and they stay out
        // after the drop. Reported live 2026-09-09 with a screenshot of both
        // rails standing in a browser window.
        //
        // Re-asserting rather than suppressing the reveal: the drag is stock
        // shell behaviour reached through stock APIs, and this widget already
        // owns "what furniture does this mode keep". A drop fires
        // onDidAddWidget, which is what runs this.
        // A collapsed side stays hidden even in Coding: its icons are across
        // its own top, so there is no rail to leave standing.
        this.shell.leftPanelHandler.container.setHidden(!ideDress || this.shell.leftPanelHandler.dockPanel.isHidden);
        this.shell.rightPanelHandler.container.setHidden(!ideDress || this.shell.rightPanelHandler.dockPanel.isHidden);
        // Showing a tab bar changes its class; it does not, on its own, make
        // the dock re-run its layout. Without this the dock kept allocating
        // the content as if the bar were still hidden, so the page was drawn
        // at the bar's own y and the bar was underneath it -- present,
        // not hidden, and invisible. That is the "tab bar disappears" report,
        // and the geometry log is what identified it: in Coding the web tab's
        // content node was at y=72, the bar's position, instead of the 107 a
        // 35px bar puts it at.
        //
        // fit() re-measures, update() repaints. Cheap, and only on a mode
        // switch or a tab add/remove.
        this.shell.mainPanel.fit();
        this.shell.mainPanel.update();
    }

    /**
     * Ends a Lumino drag whose release never arrived.
     *
     * Lumino finishes a drag on the document's `pointerup`. In the shipped
     * shell that event has been observed not to arrive: a tab dragged out of
     * the strip and released stayed in flight -- ghost still on screen, the
     * strip tab still dimmed, the drop never made (2026-09-10, with a
     * screenshot). Every variant of the same gesture completes in a stock
     * Chromium build of the same frontend, so this is about how the release
     * reaches a remote Gecko frame, not about the drag.
     *
     * The next move tells the truth regardless: a `pointermove` with no
     * button held while a drag image is still attached means the button was
     * released somewhere this document did not hear. Dispatching the missing
     * `pointerup` at that point is enough -- Lumino's own handler takes it
     * from there, hit-tests the current target and completes the drop
     * exactly as it would have. It applies to every Lumino drag in the
     * shell, the dock's own tab bars included, which matters because a dock
     * whose drag never ended refuses to start another.
     *
     * ponytail: papers over a release the frame did not see; the real fix is
     * finding why Gecko withheld it and belongs in the chrome layer.
     */
    protected armDragRelease(): void {
        window.addEventListener('pointermove', event => {
            // Trusted moves only. `Drag.start()` dispatches a synthetic
            // pointermove of its own, with no buttons, the instant the drag
            // image is attached -- reacting to that ended every drag inside
            // its own start() call, which then returned null (2026-09-10,
            // from the shell's console: "drag.start(...) is null").
            if (!event.isTrusted || event.buttons !== 0 || !document.querySelector('.lm-mod-drag-image')) {
                return;
            }
            console.warn('[@powerbrowser/chrome-bar] drag still in flight with no button held; ending it');
            document.dispatchEvent(new PointerEvent('pointerup', {
                bubbles: true,
                cancelable: true,
                button: 0,
                buttons: 0,
                clientX: event.clientX,
                clientY: event.clientY,
                pointerId: event.pointerId,
                pointerType: event.pointerType,
                isPrimary: event.isPrimary,
            }));
        }, true);
    }

    /**
     * Custom title bar. The shell window draws no OS title bar, so the
     * window moves by the empty parts of its top rows: the strip and the
     * URL row in Browsing, the menubar and the URL row in Coding, the
     * toolbar and the URL row in Organising -- as a Firefox toolbar does, every
     * pixel that is not a control. Dragging is
     * chrome-only in Gecko, so this measures the rects and chrome lays
     * invisible handles over them. Chrome's own window buttons overlay the
     * top-right corner; `windowChrome` answers how wide they are, and
     * `--pb-window-controls` keeps the first row clear of them.
     *
     * Re-measured on every mode/layout re-assert, on resize, and on any
     * change inside the strip (a tab's title growing moves the tail), all
     * coalesced to one frame and sent only when different.
     */
    protected dragFrame: number | undefined;
    protected lastDragRegions = '';

    protected scheduleDragRegions(): void {
        if (this.dragFrame !== undefined) {
            return;
        }
        this.dragFrame = window.requestAnimationFrame(() => {
            this.dragFrame = undefined;
            this.publishDragRegions();
        });
    }

    protected publishDragRegions(): void {
        const mode = document.body.getAttribute(MODE_ATTRIBUTE);
        const controls = parseFloat(getComputedStyle(document.body).getPropertyValue('--pb-window-controls')) || 0;
        // Every row the mode shows at the top, first row first, with the
        // things on it that must stay clickable. What is left of each row is
        // where the window moves -- the same rule as a Firefox toolbar.
        const rows: { row: Element; items: Element[] }[] = [];
        const bar = this.barWidget.node.querySelector('.pb-chrome-bar');
        const menubar = this.shell.topPanel.widgets.find(w => w.id === 'theia:menubar')?.node;
        const toolbar = document.querySelector('.pb-org-toolbar');
        if (mode === 'browsing') {
            rows.push({ row: this.tabStrip.node, items: Array.from(this.tabStrip.node.querySelectorAll('.pb-tab')) });
        } else if (mode === 'coding' && menubar) {
            rows.push({
                row: menubar,
                items: [...Array.from(menubar.querySelectorAll('.lm-MenuBar-item')), ...Array.from(this.layoutControls.node.children)],
            });
        } else if (mode === 'organising' && toolbar) {
            rows.push({ row: toolbar, items: Array.from(toolbar.children) });
        }
        if (bar) {
            rows.push({ row: bar, items: Array.from(bar.children) });
        }
        // Chrome's window buttons overlay the first row's right end only.
        // The first row spans the whole panel, not just its element: the
        // menubar is only as wide as its menus, so measured alone everything
        // right of "Help" (and the logo's margin left of "File") was not a
        // handle (reported 2026-10-20).
        const panel = this.shell.topPanel.node.getBoundingClientRect();
        const limit = panel.right - controls;
        const rects = rows.flatMap(({ row, items }, index) => {
            const r = row.getBoundingClientRect();
            if (r.height === 0) {
                return [];
            }
            const right = index === 0 ? limit : r.right;
            const spans = items.map(el => el.getBoundingClientRect()).filter(s => s.width > 0).sort((a, b) => a.left - b.left);
            const out: { x: number; y: number; w: number; h: number }[] = [];
            let x = index === 0 ? panel.left : r.left;
            for (const s of spans) {
                if (s.left - x > 4) {
                    out.push({ x, y: r.top, w: s.left - x, h: r.height });
                }
                x = Math.max(x, s.right);
            }
            if (right - x > 4) {
                out.push({ x, y: r.top, w: right - x, h: r.height });
            }
            return out;
        });
        const height = rows[0]?.row.getBoundingClientRect().height ?? 0;
        const key = JSON.stringify([rects, height]);
        if (key === this.lastDragRegions) {
            return;
        }
        this.lastDragRegions = key;
        this.webTabs.send({ kind: 'windowDragRegions', rects, height });
    }

    async onStart(): Promise<void> {
        this.armDragRelease();
        window.addEventListener('resize', () => this.scheduleDragRegions());
        new MutationObserver(() => this.scheduleDragRegions())
            .observe(this.tabStrip.node, { childList: true, subtree: true, characterData: true, attributes: true });
        void this.webTabs.request({ kind: 'windowChrome' }).then(reply => {
            if (reply.ok && typeof reply.width === 'number') {
                document.body.style.setProperty('--pb-window-controls', `${reply.width}px`);
            }
            this.scheduleDragRegions();
        });
        if (!this.shell.getWidgetById(ChromeBarWidget.ID)) {
            await this.shell.addWidget(this.barWidget, { area: 'top' });
        }
        // Two calls, both load-bearing. `addWidget` is what REGISTERS the
        // widget with the shell, so `getWidgetById` can find it -- the mode
        // service reaches the strip that way, because importing the class
        // there would close a dependency cycle (chrome-bar already imports
        // @powerbrowser/modes). Registering via topPanel.insertWidget alone
        // looked right and was not: the strip rendered, `getWidgetById`
        // returned undefined, the mode service's `strip?.setHidden` no-opped,
        // and Browsing hid the dock's bar with nothing put in its place.
        //
        // `insertWidget(0, ...)` then HOISTS it, because addWidget appends and
        // the top panel is a BoxPanel that stacks in child order -- appended,
        // the strip would sit under the URL row instead of above it. Moving an
        // already-parented child is what Panel.insertWidget does.
        if (!this.shell.getWidgetById(TabStripWidget.ID)) {
            await this.shell.addWidget(this.tabStrip, { area: 'top' });
            this.shell.topPanel.insertWidget(0, this.tabStrip);
        }
        // Right after the menubar, so it shares the menubar's row and the
        // chrome bar (full basis) still wraps below both.
        if (!this.shell.getWidgetById(LayoutControlsWidget.ID)) {
            await this.shell.addWidget(this.layoutControls, { area: 'top' });
            const menubar = this.shell.topPanel.widgets.findIndex(w => w.id === 'theia:menubar');
            if (menubar >= 0) {
                this.shell.topPanel.insertWidget(menubar + 1, this.layoutControls);
            }
        }
        this.perspectives.onDidChangePerspective(id => {
            this.barWidget.syncModeFromPerspective(id);
        });
        // The toggle's opening selection is the LIVE perspective, never the
        // first shipped label. Mode activation and this contribution are both
        // FrontendApplicationContributions with no ordering guarantee between
        // them, so a perspective activated before this subscription fires no
        // event we can hear -- and the toggle would keep asserting Coding
        // while the shell sat in the Browsing launch default. That
        // disagreement was not cosmetic: activateMode() early-returns when the
        // requested mode is already selected, so clicking the segment the
        // toggle already claimed was a no-op and Coding was unreachable until
        // the user round-tripped through another mode.
        this.observeMode();
        const activePerspective = this.perspectives.getActivePerspectiveId();
        if (activePerspective !== undefined) {
            this.barWidget.syncModeFromPerspective(activePerspective);
        }
        // GUI-02: the SELECTED MAIN-AREA TAB drives the navigable-tab
        // predicate and the pill -- the dock's current title, not the
        // focus-derived shell.currentWidget. A web tab's body is covered by
        // the chrome overlay, so its placeholder node never receives DOM
        // focus in real use ("+" focuses the pill, a click lands in the
        // overlay): keyed on focus, the bar never subscribed to the tab's
        // state pushes and the pill stayed on the typed text (found live
        // 2026-09-07). Seeded once because an activation can precede this
        // subscription (the perspective seed above exists for the same
        // ordering hazard).
        this.shell.mainPanel.onDidChangeCurrent(title => this.syncCurrentWidget(title?.owner));
        this.syncCurrentWidget(this.shell.mainPanel.currentTitle?.owner);
        // The portalled dropdown positions against the viewport, so a
        // window resize re-derives its geometry while open.
        window.addEventListener('resize', () => this.addressBar.repositionDropdown());
    }
}
