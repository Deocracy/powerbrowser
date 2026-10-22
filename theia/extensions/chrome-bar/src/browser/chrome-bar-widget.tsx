import * as React from '@theia/core/shared/react';
import { createPortal } from '@theia/core/shared/react-dom';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import {
    ApplicationShell,
    CommonCommands,
    ContextMenuRenderer,
    FrontendApplicationContribution,
    HoverService,
    OpenerService,
    ReactWidget,
    Widget,
} from '@theia/core/lib/browser';
import { CommandMenu, CommandRegistry, CompoundMenuNode, Disposable, MenuPath } from '@theia/core/lib/common';
import URI from '@theia/core/lib/common/uri';
import { PreferenceSchemaService, PreferenceScope, PreferenceService } from '@theia/core/lib/common/preferences';
import { NavigatableWidget } from '@theia/core/lib/browser/navigatable-types';
import { PerspectiveService } from '@theia/core/lib/browser/perspective-service';
import { ClipboardService } from '@theia/core/lib/browser/clipboard-service';
import { ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import pDebounce from 'p-debounce';
import { MessageLoop } from '@theia/core/shared/@lumino/messaging';
import { EMPTY_PAGE_URL, WebTabChannel, WebTabOpenHandler, WebTabWidget } from '@powerbrowser/tab-uris/lib/browser/web-tab';
import { GroupModel } from '@powerbrowser/modes/lib/browser/group-model';
import { TabUriRegistry } from '@powerbrowser/tab-uris/lib/browser/tab-uri-registry';
import { ChromeStoreClient, ResolvedAddress, SearchEngineList } from '@powerbrowser/tab-uris/lib/browser/chrome-store-client';
import {
    CHROME_BAR_BACK_COMMAND_ID,
    CHROME_BAR_FORWARD_COMMAND_ID,
    CHROME_BAR_INPUT_CLASS,
    CHROME_BAR_NEW_TAB_COMMAND_ID,
    CHROME_BAR_RELOAD_COMMAND_ID,
    chromeBarHasNavigableTab,
    currentWebTab,
    focusAddressPill,
    setCurrentWebTab,
} from './chrome-bar-commands';
import { ChromeBarSuggestionService } from './chrome-bar-suggestion-service';
import type { SourcedRow } from './chrome-bar-places-suggestions';
import { PLACE_ROW_LIMIT, Row, autofillSplice, composeRows, iconFor, isCanonizable, nextHighlight, safeIcon } from './address-bar-rows';
import { CHROME_BAR_COPY, appSubject, historyLabel } from './chrome-bar-copy';
import {
    DEFAULT_SEARCH_ENGINE_PREFERENCE, DEFAULT_SEARCH_ENGINE_PROPERTY, HOME_PAGE_PREFERENCE, SEARCH_SUGGESTIONS_PREFERENCE,
    SHOW_HOME_BUTTON_PREFERENCE,
} from './chrome-bar-preferences';
import { ADDRESS_FOCUSED_CONTEXT_KEY } from './chrome-bar-keybindings';
// A cycle (chrome-bar-shortcuts imports this widget); safe because the frontend
// module loads chrome-bar-shortcuts first and these are read only at render time.
import { BUTTON_SHORTCUTS, NavButton, tooltipFor } from './chrome-bar-shortcuts';
import { MODES_ACTIVATE_COMMAND_ID } from '@powerbrowser/modes/lib/browser/modes-commands';
import { ModeService } from '@powerbrowser/modes/lib/browser/mode-service';
// The organising placeholder's own id, imported for the same const-discipline
// reason every command id here is imported: the tab count excludes that widget
// by identity, and a re-spelled string would keep counting it the day the
// widget renames.
import { OrganisingWidget } from '@powerbrowser/modes/lib/browser/organising-widget';
import { TabStripWidget } from './tab-strip-widget';
import { LayoutControlsWidget } from './layout-controls-widget';
import { MODE_ATTRIBUTE } from '@powerbrowser/modes/lib/browser/mode-attribute';
import '../../src/browser/chrome-bar.css';

/** NAV-03: the session-history menu's path. The menu is built per request from the history reply, never registered. */
const HISTORY_MENU_PATH: MenuPath = ['powerbrowser-chrome-bar-history'];
/** BAR-10: the pill's Cut/Copy/Paste menu, built per request like the history menu, never registered. */
const PILL_MENU_PATH: MenuPath = ['powerbrowser-chrome-bar-pill'];

/** NAV-03: Firefox's click-hold delay before Back/Forward open the history menu. */
const HISTORY_HOLD_MS = 500;

/** NAV-01 (27-UI-SPEC, Pitfall P7): Reload ignores clicks for 650 ms after it turns back from Stop. */
const RELOAD_GUARD_MS = 650;

type NavGesture = 'back' | 'forward' | 'reload';
type ButtonEvent = React.MouseEvent<HTMLButtonElement>;
type DropTargetDragEvent = React.DragEvent<HTMLElement>;

/** BAR-11: the heuristic row's key; the one row present for every non-empty text. */
const HEURISTIC_KEY = 'heuristic';

/** BAR-05: a one-off engine button's highlight key prefix, after the row keys. */
const ONE_OFF_KEY = 'oneoff:';

/** BAR-11: the dropdown's tallest size (29-UI-SPEC Spacing Scale); a short window caps it at its bottom less 8px. */
const DROPDOWN_MAX_HEIGHT = 432;

/** NAV-06: drag types that are links, as distinct from plain text. */
const LINK_DRAG_TYPES = ['text/uri-list', 'text/x-moz-url'];

/** The dropped payload: first non-comment uri-list line, else x-moz-url's first line, else plain text, trimmed. */
function droppedTextOf(data: DataTransfer): string {
    const uriList = data.getData('text/uri-list').split(/\r?\n/).find(line => line.trim() && !line.startsWith('#'));
    return (uriList || data.getData('text/x-moz-url').split(/\r?\n/)[0] || data.getData('text/plain')).trim();
}

/** The dropped http(s) URL, else undefined. */
function droppedUrlOf(data: DataTransfer): string | undefined {
    const value = droppedTextOf(data);
    return /^https?:\/\//i.test(value) ? value : undefined;
}

/**
 * How New Tab treats a drag while it is over the button. A real drag hides
 * its data until drop (Pitfall P10), so a link type alone shows the ring;
 * link data that is readable and not http(s) is refused now. Plain text
 * cannot be told apart from a URL until drop, so it gets no ring.
 */
function dropKindOf(data: DataTransfer): 'link' | 'text' | 'none' {
    const types = Array.from(data.types);
    if (LINK_DRAG_TYPES.some(type => types.includes(type))) {
        const readable = LINK_DRAG_TYPES.some(type => data.getData(type));
        return !readable || droppedUrlOf(data) ? 'link' : 'none';
    }
    return types.includes('text/plain') ? 'text' : 'none';
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

    @inject(OpenerService)
    protected readonly openerService: OpenerService;

    @inject(ChromeBarSuggestionService)
    protected readonly suggestions: ChromeBarSuggestionService;

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

    /** GUI-02: the widget -> URI direction, for the pill's address on non-web tabs (UI-SPEC A6). */
    @inject(TabUriRegistry)
    protected readonly tabUris: TabUriRegistry;

    /** NAV-03: renders the Back/Forward session-history menu as a stock `.lm-Menu`. */
    @inject(ContextMenuRenderer)
    protected readonly menus: ContextMenuRenderer;

    /** NAV-06: middle-click and Ctrl+click open a background tab; a dropped link a foreground one. */
    @inject(WebTabOpenHandler)
    protected readonly webTabOpener: WebTabOpenHandler;

    /** PAN-03: a tab the bar opens joins the active group, as New Tab's does. */
    @inject(GroupModel)
    protected readonly groups: GroupModel;

    /** NAV-04: the Home settings (chrome-bar-preferences.ts). */
    @inject(PreferenceService)
    protected readonly preferences: PreferenceService;

    /** NAV-05: nav-button tooltips (native title tooltips are dead in the shell until Phase 35). */
    @inject(HoverService)
    protected readonly hover: HoverService;

    @inject(ContextKeyService)
    protected readonly contextKeys: ContextKeyService;

    /** Phase 29 (BAR-01): typed text and the home page resolve chrome-side. */
    @inject(ChromeStoreClient)
    protected readonly store: ChromeStoreClient;

    /** Phase 29 (BAR-04): the Default Search Engine setting's options come from chrome's engine list. */
    @inject(PreferenceSchemaService)
    protected readonly preferenceSchema: PreferenceSchemaService;

    /** Phase 29 (BAR-10): Cut and Copy write through it; nothing here reads it (Paste reads chrome-side). */
    @inject(ClipboardService)
    protected readonly clipboard: ClipboardService;

    /** Phase 29 (BAR-04): chrome's engine list; undefined until it arrives or when it failed. */
    protected engineList: SearchEngineList | undefined;

    protected holdTimer: number | undefined;
    /** Set when a hold opened the history menu, so the release's click does not navigate. */
    protected suppressNavClick = false;
    /** performance.now() before which a Reload click is ignored (the post-Stop guard). */
    protected reloadGuardUntil = 0;

    /** The active web tab's state-push subscription; replaced on every current-widget change. */
    protected stateSubscription: Disposable | undefined;

    protected customModes: Array<{ id: string; name: string }> = [];
    protected activeCustomId: string | undefined = undefined;

    protected inputValue = '';
    protected committedAddress = '';
    /** BAR-11: the rows on screen, composed by address-bar-rows from the parts below. */
    protected rows: Row[] = [];
    protected dropdownOpen = false;
    /** BAR-11: the highlighted row, tracked by key so rows arriving late never move it. */
    protected highlightKey: string | undefined = undefined;
    /** BAR-11: the first row for the typed text; null until chrome's resolve arrives. */
    protected heuristic: Row | null = null;
    /** BAR-11: chrome found no engine for the typed words; the heuristic row is the no-search row. */
    protected heuristicNoEngine = false;
    /** BAR-03: the engine's suggestions for search-shaped text; empty for an address, a failure or the setting off. */
    protected engineRows: Row[] = [];
    /** BAR-03: an IME composition is open in the pill; nothing typed during one is sent to an engine. */
    protected compositionOpen = false;
    /** BAR-11: the pill already had focus when the current press began; only a focusing press selects all. */
    protected focusedAtPress = false;
    /** BAR-12: typed, unsubmitted text of the tabs not on screen, in memory only; never stored, pushed or logged. */
    protected readonly drafts = new WeakMap<Widget, string>();
    /** BAR-12: the widget whose address the pill currently shows; its own text lives in inputValue, not in drafts. */
    protected draftOwner: Widget | undefined;
    /** BAR-07: the pill's autofilled value and the origin it opens; cleared by any input, a commit or a close. */
    protected autofill: { value: string; url: string } | undefined;
    /** BAR-07: Backspace or Delete removed a completion; nothing autofills until the next inserting keystroke. */
    protected autofillSuppressed = false;
    /** BAR-07: the last input event may autofill; read by the debounced query it schedules. */
    protected autofillWanted = false;
    /** BAR-11: open-tab, bookmark and history rows for the typed text. */
    protected placeRows: Row[] = [];
    /** BAR-09: the row whose Shift+Delete removal failed; its failure notice shows under it until the next query. */
    protected removeFailedKey: string | undefined;
    /** BAR-11: cached favicons by page url, from chrome's Places cache only. */
    protected icons: Record<string, string> = {};
    /** The heuristic row could not be computed: the first row is the suggestions-failure row. */
    protected providerFailed = false;
    protected commitFailed = false;
    /** BAR-10: Paste or Paste & Go could not read the clipboard; one failure row shows until the next edit or close. */
    protected pasteFailed = false;
    /** Phase 29 (BAR-01): chrome found no engine for typed words; Enter retries, typing or closing clears it. */
    protected noSearch = false;
    /** NAV-04: the Home-failure row is showing; Enter or a click opens Settings on the home-page setting. */
    protected homeFailed = false;
    protected shimmer = false;
    protected mode = ChromeBarWidget.MODES[0];
    protected querySeq = 0;
    /** True from a keystroke until the dropdown is closed on user intent; a debounced query fires only while armed. */
    protected dropdownArmed = false;
    protected pillRef: HTMLDivElement | null = null;
    /** The pill input's element-local context key; see ADDRESS_FOCUSED_CONTEXT_KEY. */
    protected addressScope: Disposable | undefined;

    /** Stable, so React calls it only on mount and unmount, not on every render. */
    protected inputRef = (el: HTMLInputElement | null): void => {
        this.addressScope?.dispose();
        this.addressScope = undefined;
        if (el) {
            const scope = this.contextKeys.createScoped(el);
            scope.createKey(ADDRESS_FOCUSED_CONTEXT_KEY, true);
            this.addressScope = scope;
        }
    };

    /**
     * Re-derives the portalled dropdown geometry after a window resize
     * (every keystroke already re-renders, so only resize needs a push).
     */
    repositionDropdown(): void {
        if (this.dropdownOpen) {
            this.update();
        }
    }

    /** Debounced pill queries over the RPC proxy (in-tree p-debounce pin, 150ms precedent). */
    protected readonly debouncedQuery = pDebounce((prefix: string) => this.runQuery(prefix), 150);

    @postConstruct()
    protected init(): void {
        // NAV-04: toggling either Home setting updates the bar live, with no reload.
        this.toDispose.push(this.preferences.onPreferenceChanged(change => {
            if (change.preferenceName === SHOW_HOME_BUTTON_PREFERENCE || change.preferenceName === HOME_PAGE_PREFERENCE) {
                this.update();
            }
            if (change.preferenceName === DEFAULT_SEARCH_ENGINE_PREFERENCE) {
                void this.refreshEngines();
            }
        }));
        void this.refreshEngines();
    }

    /**
     * BAR-04: re-reads chrome's engines and fills the setting's options; the
     * empty option is labelled with the configured default's name.
     */
    protected async refreshEngines(): Promise<void> {
        try {
            this.engineList = await this.store.listSearchEngines();
        } catch (error) {
            this.engineList = undefined;
            console.error('[@powerbrowser/chrome-bar] reading the search engines failed:', error instanceof Error ? error.name : typeof error);
        }
        if (this.engineList) {
            const names = this.engineList.engines.map(engine => engine.name);
            this.preferenceSchema.updateSchemaProperty(DEFAULT_SEARCH_ENGINE_PREFERENCE, {
                ...DEFAULT_SEARCH_ENGINE_PROPERTY,
                enum: ['', ...names],
                enumItemLabels: [this.engineList.defaultName, ...names],
            });
        }
        this.update();
    }

    /** BAR-04: the User-scope engine choice when chrome lists it, else '' (chrome's default). */
    protected engineNameForRequest(): string {
        const chosen = String(this.userPreference(DEFAULT_SEARCH_ENGINE_PREFERENCE, ''));
        return chosen && this.engineList?.engines.some(engine => engine.name === chosen) ? chosen : '';
    }

    /** BAR-04: the engine searches actually go to, for the placeholder; undefined before the list arrives. */
    protected effectiveEngine(): string | undefined {
        return this.engineNameForRequest() || this.engineList?.defaultName || undefined;
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
        await this.joinActiveGroup(widget);
    }

    /** NAV-06, BAR-13: dragenter/dragover on New Tab and the pill; anything but a link or text is refused (no preventDefault). */
    protected onDropTargetDragOver = (e: DropTargetDragEvent): void => {
        const kind = dropKindOf(e.dataTransfer);
        e.currentTarget.classList.toggle('is-drop-target', kind === 'link');
        if (kind === 'none') {
            e.dataTransfer.dropEffect = 'none';
            return;
        }
        e.preventDefault();
        // Theia's document-level listener sets dropEffect 'none' on every drag
        // (frontend-application.js, file drops); stopping here keeps the copy.
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
    };

    protected onDropTargetDragLeave = (e: DropTargetDragEvent): void => {
        e.currentTarget.classList.remove('is-drop-target');
    };

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
        await this.joinActiveGroup(widget);
        widget.focusPage();
    };

    /**
     * BAR-13: a link or text dropped on the pill loads in the current tab, as
     * in Firefox: through chrome's resolve wall, so an address loads, other
     * text searches the bar's engine and anything refused shows the
     * commit-failure row. The payload is never put in the pill for editing.
     */
    protected onPillDrop = async (e: DropTargetDragEvent): Promise<void> => {
        e.currentTarget.classList.remove('is-drop-target');
        e.preventDefault();
        e.stopPropagation();
        const payload = droppedTextOf(e.dataTransfer);
        if (!payload) {
            return;
        }
        let resolved: ResolvedAddress | undefined;
        try {
            // Over 2048 characters chrome refuses it; it is never cut short into another address.
            resolved = payload.length <= 2048 ? await this.store.resolveTypedAddress(payload, this.engineNameForRequest()) : undefined;
        } catch {
            resolved = undefined;
        }
        if (!resolved || (resolved.kind !== 'visit' && resolved.kind !== 'search') || !resolved.url) {
            this.showCommitFailure();
            return;
        }
        // Drops any typed text, so the load's state push can update the pill.
        this.inputValue = this.committedAddress;
        this.commitFailed = false;
        this.closeDropdown();
        this.update();
        try {
            await this.openCommittedUrl(resolved.url);
        } catch {
            this.showCommitFailure();
        }
    };

    protected async joinActiveGroup(widget: Widget): Promise<void> {
        try {
            await this.groups.joinActiveGroup(widget);
        } catch (error) {
            console.error('[@powerbrowser/chrome-bar] joining the active group failed:', error instanceof Error ? error.name : typeof error);
        }
    }

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

    /** BAR-10: right-click, the context-menu key and Shift+F10 on the pill open its menu instead of the native one. */
    protected onPillContextMenu = (e: React.MouseEvent<HTMLInputElement>): void => {
        e.preventDefault();
        const rect = e.currentTarget.getBoundingClientRect();
        const keyboard = e.button !== 2 || (e.clientX === 0 && e.clientY === 0);
        void this.openPillMenu(keyboard ? { x: rect.left, y: rect.bottom } : { x: e.clientX, y: e.clientY });
    };

    /**
     * BAR-10: Cut, Copy, Paste, Paste & Go, a separator, Select All, as a
     * stock `.lm-Menu` built per request. Enablement reads only the input:
     * Paste and Paste & Go are always enabled, so opening the menu never reads
     * the clipboard; it is read only when one of them is chosen. Focus returns
     * to the pill on close, except after Paste & Go, which moves it to the page.
     * A prototype method, so a live plant can replace it per instance.
     */
    protected async openPillMenu(anchor: { x: number; y: number }): Promise<void> {
        const input = this.pillRef?.querySelector('input');
        if (!input) {
            return;
        }
        const start = input.selectionStart ?? input.value.length;
        const end = input.selectionEnd ?? start;
        let went = false;
        const item = (id: string, label: string, sortString: string, enabled: boolean, run: () => Promise<void>): CommandMenu => ({
            id: `pill-${id}`, label, sortString, isVisible: () => true, isEnabled: () => enabled, isToggled: () => false, run,
        });
        const group = (id: string, sortString: string, children: CommandMenu[]): CompoundMenuNode => ({
            id, sortString, children, isVisible: () => true, isEmpty: () => false,
        });
        const menu: CompoundMenuNode = {
            id: 'pill', sortString: '0', isVisible: () => true, isEmpty: () => false, children: [
                group('pill-edit', '0', [
                    item('cut', CHROME_BAR_COPY.cut, '0', start !== end, () => this.cutSelection(input, start, end)),
                    item('copy', CHROME_BAR_COPY.copy, '1', start !== end, async () => {
                        await this.clipboard.writeText(input.value.slice(start, end));
                    }),
                    item('paste', CHROME_BAR_COPY.paste, '2', true, () => this.pasteClipboard(input, start, end)),
                    item('paste-and-go', CHROME_BAR_COPY.pasteAndGo, '3', true, () => {
                        went = true;
                        return this.pasteAndGo();
                    }),
                ]),
                group('pill-select', '1', [
                    item('select-all', CHROME_BAR_COPY.selectAll, '0', input.value !== '', async () => input.select()),
                ]),
            ],
        };
        this.menus.render({
            menuPath: PILL_MENU_PATH,
            menu,
            anchor,
            context: input,
            includeAnchorArg: false,
            // Deferred past the stock focus restore, as the history menu does.
            onHide: () => setTimeout(() => {
                if (!went) {
                    input.focus();
                }
            }),
        });
    }

    /** BAR-10: Cut removes the selection only once the clipboard took it, so a failed write loses no text. */
    protected async cutSelection(input: HTMLInputElement, start: number, end: number): Promise<void> {
        let written = !this.clipboard.onDidWriteText;
        const listener = this.clipboard.onDidWriteText?.(() => { written = true; });
        try {
            await this.clipboard.writeText(input.value.slice(start, end));
        } finally {
            listener?.dispose();
        }
        if (written) {
            input.setRangeText('', start, end, 'end');
            this.textEdited(input.value, false);
        }
    }

    /** BAR-10: inserts the clipboard text at the selection as typing does (suggestions refresh, no autofill). */
    protected async pasteClipboard(input: HTMLInputElement, start: number, end: number): Promise<void> {
        let text: string;
        try {
            text = await this.store.readClipboardText();
        } catch {
            this.showPasteFailure();
            return;
        }
        if (typeof text !== 'string' || !text) {
            return;
        }
        input.setRangeText(text, start, end, 'end');
        this.textEdited(input.value, false);
    }

    /** BAR-10: replaces the text with the clipboard text and commits it as Enter would, then focuses the page. */
    protected async pasteAndGo(): Promise<void> {
        let text: string;
        try {
            text = await this.store.readClipboardText();
        } catch {
            this.showPasteFailure();
            return;
        }
        if (typeof text !== 'string' || !text.trim()) {
            return;
        }
        await this.commitText(text);
        const tab = currentWebTab();
        if (tab && !this.commitFailed && !this.noSearch) {
            this.focusPageWhenLoaded(tab);
        }
    }

    /**
     * BAR-10: moves focus to `tab`'s page once the load just started has
     * finished, if the pill still has focus and no new edit. A focus given
     * earlier is lost when the navigation commits into a new browsing context
     * (measured live: the page took focus, then dropped it 32ms later).
     */
    protected focusPageWhenLoaded(tab: WebTabWidget): void {
        let started = false;
        const done = (): void => {
            subscription.dispose();
            clearTimeout(timer);
        };
        const subscription = tab.onDidChangeState(state => {
            started = started || state.loading;
            if (started && !state.loading) {
                done();
                if (document.activeElement === this.pillRef?.querySelector('input') && this.inputValue === this.committedAddress) {
                    tab.focusPage();
                }
            }
        });
        // A load that never reports back does not hold a later load's focus hostage.
        const timer = setTimeout(done, 30000);
    }

    /** BAR-10: the clipboard could not be read: one failure row under the pill. */
    protected showPasteFailure(): void {
        this.pasteFailed = true;
        this.dropdownOpen = true;
        this.highlightKey = undefined;
        this.update();
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
     * Closes the dropdown on user intent (commit, Escape, blur) AND
     * invalidates any query still in flight. Without the bump, a query
     * started by the last keystroke and still outstanding at Enter would
     * finish after the commit and re-open the dropdown over the page --
     * measured live by 14.1-03's web-tab check, where the reopened
     * dropdown counted as a blocking layer and the overlay stayed hidden.
     */
    protected closeDropdown(): void {
        this.querySeq += 1;
        this.dropdownArmed = false;
        this.dropdownOpen = false;
        this.highlightKey = undefined;
        this.homeFailed = false;
        this.noSearch = false;
        this.engineRows = [];
        // Rows kept here would come back under a later failure or paste row, or be chosen unseen.
        this.rows = [];
        this.heuristic = null;
        this.placeRows = [];
        this.autofill = undefined;
        this.removeFailedKey = undefined;
        this.pasteFailed = false;
    }

    protected async runQuery(prefix: string): Promise<void> {
        // Only text typed since the last close may open the dropdown. The
        // debounce delays this call, so a query scheduled by the last
        // keystroke BEFORE Enter still arrives here AFTER the commit; the
        // sequence bump in closeDropdown cannot see it because the sequence
        // is taken below. Without this guard that late query re-opened the
        // dropdown over the committed page.
        if (!this.dropdownArmed) {
            return;
        }
        const seq = ++this.querySeq;
        // Each reply re-checks both guards on arrival (29-RESEARCH Pitfall 9).
        const current = (): boolean => this.dropdownArmed && this.querySeq === seq;
        // Row-level shimmer only past the contracted delay: local matches
        // paint synchronously with no spinner; the shimmer row appears only
        // when a request is still outstanding after 150ms.
        const timer = setTimeout(() => {
            if (current()) {
                this.shimmer = true;
                this.dropdownOpen = true;
                this.update();
            }
        }, 150);
        const heuristic = this.store.resolveTypedAddress(prefix, this.engineNameForRequest()).then(
            resolved => {
                if (current()) {
                    this.setHeuristic(prefix, resolved);
                    return this.fetchEngineRows(prefix, resolved, current);
                }
            },
            () => {
                if (current()) {
                    this.setHeuristic(prefix, undefined);
                }
            }
        );
        if (this.autofillWanted) {
            void this.requestAutofill(prefix, current);
        }
        const places = this.suggestions.searchByPrefix(prefix, PLACE_ROW_LIMIT).then(
            rows => {
                if (current()) {
                    this.placeRows = this.placeRowsOf(rows as SourcedRow[]);
                    this.showComposedRows(seq);
                }
            },
            () => {
                // Places and open tabs are an addition: their failure is silent, as in Firefox.
                if (current()) {
                    this.placeRows = [];
                    this.showComposedRows(seq);
                }
            }
        );
        await Promise.all([heuristic, places]);
        clearTimeout(timer);
        if (current()) {
            this.shimmer = false;
            this.update();
        }
    }

    /**
     * BAR-07: completes the typed text inline to chrome's best visited origin,
     * under the query's guards and only while the pill still holds `prefix`.
     * The completed part is selected at once, so the next keystroke replaces
     * it; the heuristic row becomes a visit of the origin.
     */
    protected async requestAutofill(prefix: string, current: () => boolean): Promise<void> {
        let completion: { text: string; url: string } | null;
        try {
            completion = await this.store.autofillOrigin(prefix);
        } catch {
            return;
        }
        if (!completion || !current() || this.autofillSuppressed || this.inputValue !== prefix
            || typeof completion.url !== 'string' || !/^https?:\/\//i.test(completion.url)) {
            return;
        }
        const input = this.pillRef?.querySelector('input');
        const splice = typeof completion.text === 'string' ? autofillSplice(prefix, completion.text) : null;
        if (!splice || !input || input.value !== prefix) {
            return;
        }
        this.inputValue = splice.value;
        this.autofill = { value: splice.value, url: completion.url };
        // Set on the element now, not after the render: a keystroke landing in between would append to the completion.
        input.value = splice.value;
        input.setSelectionRange(splice.start, splice.end);
        this.heuristic = this.autofillRow(completion.url);
        this.showComposedRows(this.querySeq);
    }

    /** BAR-07: the heuristic row for an autofilled origin. */
    protected autofillRow(url: string): Row {
        return { key: HEURISTIC_KEY, source: 'heuristic', title: url, caption: CHROME_BAR_COPY.visit, url };
    }

    /**
     * BAR-07: only typed characters autofill: an insertText input with the
     * caret at the end, no space, no composition and no suppression. A paste
     * never does. An instance-replaceable method, so a live plant can widen it.
     */
    protected autofillEligible(e: React.ChangeEvent<HTMLInputElement>): boolean {
        const native = e.nativeEvent as InputEvent;
        const input = e.target;
        return native.inputType === 'insertText' && native.isComposing !== true && !this.autofillSuppressed
            && input.selectionStart === input.value.length && input.selectionEnd === input.value.length
            && !/\s/.test(input.value);
    }

    /** BAR-07: the autofilled completion is still selected in `input`. */
    protected autofillSelected(input: HTMLInputElement): boolean {
        return !!this.autofill && input.value === this.autofill.value
            && input.selectionStart !== null && input.selectionStart < input.value.length && input.selectionEnd === input.value.length;
    }

    /** BAR-03: the User-scope Search Suggestions setting; on unless the user turned it off. */
    protected suggestionsOn(): boolean {
        return this.userPreference(SEARCH_SUGGESTIONS_PREFERENCE, true) === true;
    }

    /**
     * BAR-03: the engine's suggestions, only when chrome resolved the text as
     * a search, the setting is on and no composition is open; chrome
     * re-resolves and refuses an address itself. A failure is silent.
     */
    protected async fetchEngineRows(prefix: string, resolved: ResolvedAddress, current: () => boolean): Promise<void> {
        if (resolved.kind !== 'search' || !this.suggestionsOn() || this.compositionOpen) {
            return;
        }
        let values: string[];
        try {
            values = await this.store.searchSuggestions(prefix, this.engineNameForRequest());
        } catch {
            return;
        }
        if (!current() || !Array.isArray(values)) {
            return;
        }
        const caption = CHROME_BAR_COPY.searchWith(resolved.engineName ?? '');
        this.engineRows = Array.from(new Set(values.filter(value => typeof value === 'string' && value)))
            .map((value): Row => ({ key: 'search:' + value, source: 'search', title: value, caption, url: '' }));
        this.showComposedRows(this.querySeq);
    }

    /** BAR-11: the heuristic row from chrome's resolve of the typed text; undefined when the resolve failed. */
    protected setHeuristic(text: string, resolved: ResolvedAddress | undefined): void {
        this.providerFailed = !resolved;
        this.heuristicNoEngine = resolved?.kind === 'no-engine';
        const row: Row = { key: HEURISTIC_KEY, source: 'heuristic', title: text, caption: CHROME_BAR_COPY.visit, url: '' };
        if (resolved?.kind === 'search' && resolved.url) {
            const engine = resolved.engineName ?? '';
            row.caption = CHROME_BAR_COPY.searchWith(engine);
            row.url = resolved.url;
            row.engineName = engine;
            row.icon = this.engineList?.engines.find(e => e.name === engine)?.icon ?? null;
        } else if (resolved?.kind === 'visit' && resolved.url) {
            row.title = resolved.url;
            row.url = resolved.url;
        }
        // BAR-07: an autofilled origin keeps the heuristic row on that origin.
        this.heuristic = this.autofill && this.inputValue === this.autofill.value ? this.autofillRow(this.autofill.url) : row;
        this.showComposedRows(this.querySeq);
    }

    /**
     * BAR-11: sourced service rows as dropdown rows. An open-tab row is kept
     * only while a web tab in the shell shows that address (a closed tab's
     * store row is dropped); a row with no title shows its address.
     */
    protected placeRowsOf(rows: SourcedRow[]): Row[] {
        const open = new Set(this.shell.getWidgets('main')
            .filter((w): w is WebTabWidget => w instanceof WebTabWidget && w.hasPage)
            .map(w => w.url));
        return rows
            .filter(row => row.source !== 'tab' || open.has(row.url))
            .map(row => ({ key: `${row.source}:${row.url}`, source: row.source, title: row.title || row.url, caption: row.url, url: row.url }));
    }

    /** BAR-11: the one composition path, through address-bar-rows; cached icons ride along. */
    protected composeVisibleRows(): Row[] {
        const withIcon = (row: Row): Row => row.engineName ? row : { ...row, icon: this.icons[row.url] ?? null };
        return composeRows(this.heuristic && withIcon(this.heuristic), this.engineRows, this.placeRows.map(withIcon));
    }

    /** Rebuilds the rows, keeps the highlighted row by key (else the heuristic row), then asks for missing favicons. */
    protected showComposedRows(seq: number): void {
        this.rows = this.composeVisibleRows();
        if (!this.highlightKeys().includes(this.highlightKey ?? '')) {
            this.highlightKey = HEURISTIC_KEY;
        }
        this.dropdownOpen = true;
        this.update();
        void this.requestIcons(seq);
    }

    /** BAR-11: favicons for the rows' addresses from chrome's Places cache, under the same guards as the query. */
    protected async requestIcons(seq: number): Promise<void> {
        const urls = this.rows
            .filter(row => row.url && !row.engineName && this.icons[row.url] === undefined)
            .map(row => row.url);
        if (!urls.length) {
            return;
        }
        let icons: Record<string, string>;
        try {
            icons = await this.store.placesFavicons(urls);
        } catch {
            return;
        }
        if (!this.dropdownArmed || this.querySeq !== seq) {
            return;
        }
        const found = Object.keys(icons).filter(url => typeof icons[url] === 'string');
        if (!found.length) {
            return;
        }
        for (const url of found) {
            this.icons[url] = icons[url];
        }
        this.rows = this.composeVisibleRows();
        this.update();
    }

    protected onInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
        if ((e.nativeEvent as InputEvent).inputType === 'insertText') {
            this.autofillSuppressed = false;
        }
        this.textEdited(e.target.value, this.autofillEligible(e), this.composing(e));
    };

    /**
     * BAR-11: an IME composition is open for this event. An instance-replaceable
     * method, so a live plant can turn the guard off.
     */
    protected composing(e: { nativeEvent: Event; keyCode?: number }): boolean {
        return (e.nativeEvent as KeyboardEvent).isComposing === true || e.keyCode === 229;
    }

    /** BAR-11: the composed text is queried once, now (never autofilled: it is not an insertText input). */
    protected onCompositionEnd = (e: React.CompositionEvent<HTMLInputElement>): void => {
        this.textEdited(e.currentTarget.value, false);
    };

    /** BAR-11: records whether this press found the pill focused (in a focused document). */
    protected onInputMouseDown = (e: React.MouseEvent<HTMLInputElement>): void => {
        this.focusedAtPress = document.hasFocus() && document.activeElement === e.currentTarget;
    };

    /** BAR-11: a primary click that gave the pill focus selects it all; a drag's range and later clicks stay stock. */
    protected onInputMouseUp = (e: React.MouseEvent<HTMLInputElement>): void => {
        const input = e.currentTarget;
        if (e.button === 0 && !this.focusedAtPress && input.selectionStart === input.selectionEnd) {
            input.select();
        }
        this.focusedAtPress = true;
    };

    /** New pill text, from a keystroke or from the pill menu's Cut and Paste (which never autofill). */
    protected textEdited(value: string, autofillWanted: boolean, composing = false): void {
        // Replies still in flight describe the old text; the debounced query takes a new sequence later.
        this.querySeq += 1;
        this.inputValue = value;
        this.autofill = undefined;
        this.autofillWanted = autofillWanted;
        this.commitFailed = false;
        this.pasteFailed = false;
        this.noSearch = false;
        this.homeFailed = false;
        // New text: the old rows describe other text, and the highlight returns to the heuristic row.
        this.heuristic = null;
        this.heuristicNoEngine = false;
        this.providerFailed = false;
        this.placeRows = [];
        this.engineRows = [];
        this.rows = [];
        this.highlightKey = undefined;
        this.removeFailedKey = undefined;
        // BAR-03: text typed while an IME composition is open is never queried (onCompositionEnd queries it).
        this.compositionOpen = composing;
        if (this.compositionOpen) {
            this.renderNow();
            return;
        }
        if (!this.inputValue.trim()) {
            // Empty text opens no dropdown.
            this.closeDropdown();
            this.renderNow();
            return;
        }
        this.dropdownArmed = true;
        this.renderNow();
        void this.debouncedQuery(this.inputValue);
    }

    /**
     * Renders inside the current handler. React puts a controlled input's old
     * value back after onChange unless it re-rendered in the handler, and
     * Theia's update() renders a frame later; during an IME composition that
     * write ends the composition (measured live: compositionend straight
     * after the first input event, the pill back on the old address).
     */
    protected renderNow(): void {
        MessageLoop.sendMessage(this, Widget.Msg.UpdateRequest);
    }

    /**
     * Opens a committed URL on the GUI-02 routing: http and https navigate
     * the active in-shell web tab, or open a new one when the active tab is
     * not a web tab (navigateWebTab below); every other scheme (view:,
     * settings:) keeps the existing two-step opener routing (getOpener plus
     * handler open), which already navigates in-Theia views correctly. No
     * path from here reaches the stock window: that survives only behind
     * the GUI-01 palette command.
     */
    protected openCommittedUrl = async (url: string): Promise<void> => {
        if (/^https?:\/\//i.test(url)) {
            await this.navigateWebTab(url);
        } else {
            const uri = new URI(url);
            const handler = await this.openerService.getOpener(uri);
            await handler.open(uri);
        }
    };

    /**
     * The one http(s) route. With an active web tab, navigates it in place
     * and turns a refused or unacknowledged reply into a throw so the
     * caller's catch surfaces the carried in-bar failure row (no new copy);
     * without one, the two-step opener resolves to WebTabOpenHandler at
     * priority 1000 and opens a new web tab.
     */
    protected async navigateWebTab(url: string, tab = currentWebTab()): Promise<void> {
        if (tab) {
            const reply = await tab.navigate(url);
            if (!reply.ok) {
                throw new Error('web tab did not acknowledge the navigation');
            }
            return;
        }
        const uri = new URI(url);
        const handler = await this.openerService.getOpener(uri);
        await handler.open(uri);
    }

    /**
     * NAV-04: opens the home page in `tab` (the active web tab for a click,
     * the pushed tab for 27-06's Alt+Home), or in a new web tab without one.
     * A non-empty value resolves through chrome's resolveTypedAddress kind and
     * opens only as a visit: a search result is never a home page. Empty opens the empty page and focuses the
     * pill, as New Tab does; a rejected or unacknowledged value shows the
     * Home-failure row.
     */
    /**
     * The Home settings are read from user settings only: a workspace's own
     * settings file must not be able to point Home at a page of its choosing.
     */
    protected userPreference<T extends string | boolean>(name: string, fallback: T): T {
        return this.preferences.inspectInScope<T>(name, PreferenceScope.User) ?? fallback;
    }

    async goHome(tab: WebTabWidget | undefined): Promise<'opened' | 'empty' | 'failed'> {
        const page = String(this.userPreference(HOME_PAGE_PREFERENCE, '')).trim();
        if (!page) {
            if (tab) {
                await tab.navigate(EMPTY_PAGE_URL);
            } else {
                await this.commands.executeCommand(CHROME_BAR_NEW_TAB_COMMAND_ID);
            }
            focusAddressPill();
            return 'empty';
        }
        try {
            const resolved = await this.store.resolveTypedAddress(page, this.engineNameForRequest());
            if (resolved.kind !== 'visit' || !resolved.url) {
                throw new Error('the home page is not an address');
            }
            await this.navigateWebTab(resolved.url, tab);
            return 'opened';
        } catch {
            this.commitFailed = false;
            this.homeFailed = true;
            this.dropdownOpen = true;
            this.highlightKey = undefined;
            this.update();
            focusAddressPill();
            return 'failed';
        }
    }

    /** NAV-04: the Home-failure affordance -- Settings filtered to the home-page setting. */
    protected openHomeSettings = async (): Promise<void> => {
        this.closeDropdown();
        this.update();
        try {
            await this.commands.executeCommand(CommonCommands.OPEN_PREFERENCES.id, HOME_PAGE_PREFERENCE);
        } catch (error) {
            console.error('[@powerbrowser/chrome-bar] opening Settings failed:', error instanceof Error ? error.name : typeof error);
        }
    };

    /** Surfaces a commit failure in-bar per the copy contract: one failure row, Enter retries. */
    protected showCommitFailure(): void {
        this.commitFailed = true;
        this.dropdownOpen = true;
        this.highlightKey = undefined;
        this.update();
    }

    /** Phase 29 (BAR-01): chrome has no engine for typed words: one no-search row, Enter retries. */
    protected showNoSearch(): void {
        this.noSearch = true;
        this.dropdownOpen = true;
        this.highlightKey = undefined;
        this.update();
    }

    /**
     * Activates a suggestion row through its url field, never its opaque
     * uri key: the key is a store identity (kept as the React list key
     * below), not an address any opener could route.
     */
    protected commitRow = async (row: Row): Promise<void> => {
        if (row.source === 'search') {
            // An engine suggestion commits its text through the same resolve path as typed text.
            return this.commitText(row.title);
        }
        const url = row.url;
        this.committedAddress = url;
        this.inputValue = url;
        this.commitFailed = false;
        this.closeDropdown();
        this.update();
        try {
            await this.openCommittedUrl(url);
        } catch {
            this.showCommitFailure();
        }
    };

    /** BAR-06: the live web tab showing an open-tab row's address (the match placeRowsOf keeps tab rows by). */
    protected liveTabFor(row: Row): WebTabWidget | undefined {
        return this.shell.getWidgets('main')
            .find((w): w is WebTabWidget => w instanceof WebTabWidget && w.hasPage && w.url === row.url);
    }

    /**
     * BAR-06: shows the tab an open-tab row names, as a tab-strip click does.
     * Nothing navigates, so the page keeps its state; the pill re-syncs from
     * the activation. A tab closed since the query commits the row's address.
     * A prototype method, so a live plant can replace it per instance.
     */
    protected async switchToTab(row: Row): Promise<void> {
        const widget = this.liveTabFor(row);
        if (!widget) {
            return this.commitRow(row);
        }
        // Drops the typed text so the activation's sync is not held off as an edit in progress.
        this.inputValue = this.committedAddress;
        this.closeDropdown();
        this.update();
        await this.shell.activateWidget(widget.id);
        widget.focusPage();
    }

    /**
     * BAR-08: the address a row opens in a new tab. Tab, bookmark and history
     * rows carry theirs; the typed text (no row, or the heuristic row) and an
     * engine row's text go through chrome's resolve wall, and only a visit or
     * search reply gives an address. The text is read before the first await.
     */
    protected async urlForRow(row: Row | undefined): Promise<string | undefined> {
        if (row && row.source !== 'heuristic' && row.source !== 'search') {
            return row.url;
        }
        const text = (row?.source === 'search' ? row.title : this.inputValue).trim();
        if (!text) {
            return undefined;
        }
        try {
            const resolved = await this.store.resolveTypedAddress(text, this.engineNameForRequest());
            return (resolved.kind === 'visit' || resolved.kind === 'search') && resolved.url ? resolved.url : undefined;
        } catch {
            return undefined;
        }
    }

    /**
     * BAR-08: opens a row (undefined: the typed text) in a new web tab
     * directly after the current one, joined to the active group. Foreground
     * (Alt+Enter) activates it with focus in its page; background (Ctrl+click,
     * middle-click) leaves the current tab selected. Either way the dropdown
     * closes and the pill reverts to the committed address. An open-tab row
     * opens its address again rather than switching. With no current widget
     * to open after, the tab is appended (and so selected).
     */
    protected async openRowInNewTab(row: Row | undefined, foreground: boolean): Promise<void> {
        const url = await this.urlForRow(row);
        if (!url || !/^https?:\/\//i.test(url)) {
            this.showCommitFailure();
            return;
        }
        const ref = currentWebTab() ?? this.shell.currentWidget;
        this.inputValue = this.committedAddress;
        this.commitFailed = false;
        this.closeDropdown();
        this.update();
        let widget: WebTabWidget;
        try {
            widget = ref ? await this.webTabOpener.openInBackground(url, ref) : await this.webTabOpener.openUrl(url);
        } catch (error) {
            console.error('[@powerbrowser/chrome-bar] opening a row in a new tab failed:', error instanceof Error ? error.name : typeof error);
            this.showCommitFailure();
            return;
        }
        await this.joinActiveGroup(widget);
        if (foreground) {
            await this.shell.activateWidget(widget.id);
            widget.focusPage();
        }
    }

    /** Choosing a row by plain click or Enter: the heuristic commits the typed text, an open tab switches, the rest commit their address. */
    protected chooseRow(row: Row): Promise<void> {
        if (row.source === 'heuristic') {
            return this.commitTyped();
        }
        return row.source === 'tab' ? this.switchToTab(row) : this.commitRow(row);
    }

    /** BAR-07: an autofilled value opens the completed origin; any other text commits as typed. */
    protected commitTyped(): Promise<void> {
        return this.autofill && this.inputValue === this.autofill.value
            ? this.commitRow(this.autofillRow(this.autofill.url))
            : this.commitText(this.inputValue);
    }

    /**
     * Commits typed text: typed text resolves chrome-side; search URLs are
     * minted only by chrome's resolveTypedAddress. A visit or search reply
     * opens on the web-tab route; no-engine shows the no-search row; anything
     * else (refused, no reply) surfaces the contracted in-bar failure row. This widget keeps no address rule
     * of its own. Empty commits are no-ops.
     */
    protected commitText = async (raw: string, { canonize = false }: { canonize?: boolean } = {}): Promise<void> => {
        const text = raw.trim();
        if (!text) {
            return;
        }
        this.committedAddress = text;
        this.inputValue = text;
        this.commitFailed = false;
        this.closeDropdown();
        this.update();
        let resolved: ResolvedAddress | undefined;
        try {
            resolved = await this.store.resolveTypedAddress(text, this.engineNameForRequest(), canonize);
        } catch {
            resolved = undefined;
        }
        if (resolved?.kind === 'no-engine') {
            this.showNoSearch();
            return;
        }
        if (!resolved || (resolved.kind !== 'visit' && resolved.kind !== 'search') || !resolved.url) {
            this.showCommitFailure();
            return;
        }
        try {
            await this.openCommittedUrl(resolved.url);
        } catch {
            this.showCommitFailure();
        }
    };

    protected onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
        if (this.composing(e)) {
            // BAR-11: the IME owns every key while a composition is open; nothing commits or moves early.
            return;
        }
        if (e.key === 'F6' && !e.ctrlKey && !e.altKey && !e.metaKey) {
            // The pill is chrome, not an editor: F6 and Shift+F6 go back to the page.
            e.preventDefault();
            this.closeDropdown();
            this.update();
            const tab = currentWebTab();
            if (tab?.hasPage) {
                tab.focusPage();
            }
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (!this.dropdownOpen || this.rows.length === 0) {
                return;
            }
            this.highlightKey = nextHighlight(this.highlightKeys(), this.highlightKey, e.key === 'ArrowDown' ? 1 : -1);
            this.update();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (this.homeFailed) {
                void this.openHomeSettings();
                return;
            }
            if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
                // BAR-08: Alt+Enter opens the highlighted row (by default the typed text) in a new foreground tab.
                if (this.dropdownOpen && this.highlightKey?.startsWith(ONE_OFF_KEY)) {
                    void this.runOneOff(this.highlightKey.slice(ONE_OFF_KEY.length), 'foreground');
                    return;
                }
                const row = this.dropdownOpen ? this.rows.find(r => r.key === this.highlightKey) : undefined;
                void this.openRowInNewTab(row, true);
                return;
            }
            if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && isCanonizable(this.inputValue.trim())) {
                // BAR-13: Ctrl+Enter completes a bare name to www.name.com in the current tab; other text is plain Enter.
                void this.commitText(this.inputValue, { canonize: true });
                return;
            }
            if (this.commitFailed || this.noSearch) {
                // Retry affordance: Enter re-commits the typed text.
                this.commitFailed = false;
                this.noSearch = false;
                void this.commitText(this.inputValue);
                return;
            }
            // The heuristic row (and Enter before any row arrived) commits the typed text through a
            // fresh resolve, never the cached heuristic; any other row commits its own address.
            if (this.dropdownOpen && this.highlightKey?.startsWith(ONE_OFF_KEY)) {
                void this.runOneOff(this.highlightKey.slice(ONE_OFF_KEY.length), 'current');
                return;
            }
            const highlighted = this.dropdownOpen ? this.rows.find(row => row.key === this.highlightKey) : undefined;
            void (highlighted ? this.chooseRow(highlighted) : this.commitTyped());
        } else if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && this.autofillSelected(e.currentTarget)) {
            // BAR-07: Tab accepts the completion; focus and the dropdown stay. Without one, Tab moves focus as usual.
            e.preventDefault();
            const end = e.currentTarget.value.length;
            e.currentTarget.setSelectionRange(end, end);
        } else if (e.key === 'Delete' && e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && this.removableHighlighted()) {
            // BAR-09: Shift+Delete removes a highlighted history row; on any other row, or none, it keeps its default.
            e.preventDefault();
            void this.removeHighlightedRow();
        } else if ((e.key === 'Backspace' || e.key === 'Delete') && this.autofillSelected(e.currentTarget)) {
            // BAR-07: the default action removes the selected completion; the re-query must not complete it again.
            this.autofillSuppressed = true;
        } else if (e.key === 'Escape') {
            // Staged dismissal: close the dropdown, then restore the committed
            // address, then (NAV-01) stop a loading page.
            if (this.dropdownOpen) {
                this.closeDropdown();
                this.update();
            } else if (this.inputValue !== this.committedAddress) {
                this.inputValue = this.committedAddress;
                this.update();
            } else if (currentWebTab()?.loading) {
                currentWebTab()?.stop();
            }
        }
    };

    /** BAR-09: the highlighted row when Shift+Delete may remove it, else undefined. */
    protected removableHighlighted(): Row | undefined {
        const row = this.dropdownOpen ? this.rows.find(r => r.key === this.highlightKey) : undefined;
        return row && this.removableRow(row) ? row : undefined;
    }

    /**
     * BAR-09: only a history row is removable. A bookmark row's page keeps its
     * visits, and open-tab, engine and heuristic rows are not history entries.
     * An instance-replaceable method, so a live plant can widen it.
     */
    protected removableRow(row: Row): boolean {
        return row.source === 'history';
    }

    /**
     * BAR-09: removes a history row's page from Places through chrome (the
     * only caller of the privileged kind). On success the row goes and the
     * highlight moves to the row that followed it, else the one before; on
     * failure the row stays with the failure notice under it.
     */
    protected async removeHighlightedRow(): Promise<void> {
        const row = this.removableHighlighted();
        if (!row) {
            return;
        }
        this.removeFailedKey = undefined;
        try {
            await this.store.removeHistoryEntry(row.url);
        } catch {
            if (this.rows.some(r => r.key === row.key)) {
                this.removeFailedKey = row.key;
                this.update();
            }
            return;
        }
        const keys = this.rows.map(r => r.key);
        const at = keys.indexOf(row.key);
        if (at < 0) {
            return;
        }
        this.placeRows = this.placeRows.filter(r => r.key !== row.key);
        this.rows = this.composeVisibleRows();
        this.highlightKey = keys[at + 1] ?? keys[at - 1];
        this.showComposedRows(this.querySeq);
    }

    /** BAR-05: the visible engines except the one in use, in chrome's order. */
    protected oneOffEngines(): Array<{ name: string; icon: string | null }> {
        if (!this.inputValue.trim()) {
            return [];
        }
        const inUse = this.effectiveEngine();
        return (this.engineList?.engines ?? []).filter(engine => engine.name !== inUse);
    }

    /** BAR-05: the row keys, then one key per one-off button: the arrow keys' one wrap-around list. */
    protected highlightKeys(): string[] {
        return this.rows.map(row => row.key).concat(this.oneOffEngines().map(engine => ONE_OFF_KEY + engine.name));
    }

    /**
     * BAR-05: searches the typed text with `name` this time only. The engine
     * name rides this one request; Gecko's default and the setting are never
     * written. 'current' searches in the current tab; 'background' opens a new
     * background tab, the current tab stays selected and the pill reverts;
     * 'foreground' (Alt+Enter) opens the new tab and selects it.
     */
    protected async runOneOff(name: string, target: 'current' | 'background' | 'foreground'): Promise<void> {
        const text = this.inputValue.trim();
        if (!text) {
            return;
        }
        if (target === 'current') {
            this.committedAddress = text;
            this.inputValue = text;
        } else {
            this.inputValue = this.committedAddress;
        }
        this.commitFailed = false;
        this.closeDropdown();
        this.update();
        let resolved: ResolvedAddress | undefined;
        try {
            resolved = await this.store.resolveTypedAddress(text, name);
        } catch {
            resolved = undefined;
        }
        if (resolved?.kind !== 'search' || !resolved.url) {
            this.showNoSearch();
            return;
        }
        // With no tab to open after, a new-tab one-off searches in place.
        const ref = target !== 'current' ? currentWebTab() ?? this.shell.currentWidget : undefined;
        if (!ref) {
            try {
                await this.openCommittedUrl(resolved.url);
            } catch {
                this.showCommitFailure();
            }
            return;
        }
        let widget: WebTabWidget;
        try {
            widget = await this.webTabOpener.openInBackground(resolved.url, ref);
        } catch (error) {
            console.error('[@powerbrowser/chrome-bar] opening a background tab failed:', error instanceof Error ? error.name : typeof error);
            return;
        }
        await this.joinActiveGroup(widget);
        if (target === 'foreground') {
            // BAR-08: Alt+Enter on a highlighted one-off.
            await this.shell.activateWidget(widget.id);
            widget.focusPage();
        }
    }

    /** BAR-05: the one-off strip above the footer; absent for empty text or a single engine. */
    protected renderOneOffs(): React.ReactNode {
        const engines = this.oneOffEngines();
        if (!engines.length) {
            return undefined;
        }
        return <div className='pb-chrome-bar-oneoffs'>
            <span className='pb-chrome-bar-oneoffs-label'>{CHROME_BAR_COPY.oneOffLabel}</span>
            {engines.map((engine, index) => {
                const icon = safeIcon(engine.icon);
                const highlighted = this.highlightKey === ONE_OFF_KEY + engine.name;
                return <button
                    key={engine.name}
                    id={this.oneOffId(index)}
                    type='button'
                    className={'pb-chrome-bar-oneoff' + (highlighted ? ' is-highlighted' : '')}
                    aria-label={CHROME_BAR_COPY.searchWith(engine.name)}
                    onPointerEnter={e => this.hover.requestHover({
                        content: engine.name,
                        target: e.currentTarget,
                        position: 'top',
                        cssClasses: ['pb-chrome-bar-hover'],
                    })}
                    onMouseDown={e => e.preventDefault()}
                    onClick={e => void this.runOneOff(engine.name, e.ctrlKey || e.metaKey ? 'background' : 'current')}
                    onAuxClick={e => {
                        if (e.button === 1) {
                            void this.runOneOff(engine.name, 'background');
                        }
                    }}
                >
                    {icon
                        ? <img className='pb-chrome-bar-row-icon' src={icon} alt='' />
                        : <span className='pb-chrome-bar-row-icon codicon codicon-search' aria-hidden='true' />}
                </button>;
            })}
        </div>;
    }

    /** The DOM id of a one-off button, for the input's aria-activedescendant. */
    protected oneOffId(index: number): string {
        return `pb-chrome-bar-oneoff-${index}`;
    }

    protected onInputBlur = (): void => {
        this.closeDropdown();
        this.update();
    };

    /** BAR-04: engines can change after startup (added in a stock window), so focus re-reads them. */
    protected onInputFocus = (): void => {
        void this.refreshEngines();
    };

    /**
     * The address the pill shows for a widget (UI-SPEC "The address pill,
     * bound to the active tab"): a web tab's live page URL when it has one;
     * any other tab's registry URI string; the empty string for a page-less
     * web tab, a widget with no registry URI, a mode surface such as
     * Organising (a mode, not a tab: it has no address), or no widget at
     * all. The empty-page URL, factory ids and tab counters never reach here.
     */
    protected addressOf(widget: Widget | undefined): string {
        if (!widget || TabStripWidget.MODE_SURFACES.includes(widget.id)) {
            return '';
        }
        if (widget instanceof WebTabWidget) {
            return widget.hasPage ? widget.url : '';
        }
        // Editors are Theia Navigatables addressed by their own resource
        // URI (docs/URI-SCHEMES.md), not registry rows -- fall back to it so
        // a file tab shows its path (found live 2026-09-07: empty pill).
        return this.tabUris.uriOf(widget)?.toString(true)
            ?? NavigatableWidget.getUri(widget)?.toString(true)
            ?? '';
    }

    /**
     * Re-derives the pill from a widget. BAR-12: while the pill carries an
     * uncommitted edit, focused or not, a state push only updates the
     * committed address (so a page-initiated navigation keeps the typed text,
     * and Esc's restore step shows the new address). The guard is the edit,
     * not focus: after Enter the value equals the committed text, and that is
     * exactly when chrome's canonical URL must replace it. `keepEdit` false
     * (a tab switch) always syncs.
     */
    protected syncAddressFromWidget(widget: Widget | undefined, keepEdit = true): void {
        const address = this.addressOf(widget);
        if (keepEdit && this.inputValue !== this.committedAddress) {
            this.committedAddress = address;
            return;
        }
        this.inputValue = address;
        this.committedAddress = address;
        if (this.commitFailed || this.noSearch) {
            // The failure row described the old text; it closes with it.
            this.closeDropdown();
        }
        this.commitFailed = false;
        this.update();
    }

    /**
     * Current-widget change from the contribution: follows the new widget's
     * state pushes when it is a web tab (dropping the previous
     * subscription), then syncs the pill and re-renders nav enablement.
     */
    onCurrentWidgetChanged(widget: Widget | undefined): void {
        this.saveDraft();
        this.closeDropdown();
        this.draftOwner = widget;
        this.stateSubscription?.dispose();
        this.stateSubscription = undefined;
        if (widget instanceof WebTabWidget) {
            let wasLoading = widget.loading;
            this.stateSubscription = widget.onDidChangeState(state => {
                if (wasLoading && !state.loading) {
                    this.reloadGuardUntil = performance.now() + RELOAD_GUARD_MS;
                }
                wasLoading = state.loading;
                this.syncAddressFromWidget(widget);
                this.update();
            });
        }
        const draft = widget && this.drafts.get(widget);
        if (widget && draft !== undefined) {
            // BAR-12: the tab's own typed text comes back; setting the value puts the caret at its end, focus stays put.
            this.drafts.delete(widget);
            this.committedAddress = this.addressOf(widget);
            this.inputValue = draft;
            this.commitFailed = false;
        } else {
            this.syncAddressFromWidget(widget, false);
        }
        this.update();
    }

    /**
     * BAR-12: keeps the outgoing widget's uncommitted text for its return.
     * Every commit path and Esc's restore leave the value equal to the
     * committed address, so nothing is kept for them. An instance-replaceable
     * method, so a live plant can drop drafts.
     */
    protected saveDraft(): void {
        const owner = this.draftOwner;
        if (owner && !owner.isDisposed && this.inputValue !== this.committedAddress) {
            this.drafts.set(owner, this.inputValue);
        }
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
        this.update();
    }

    protected renderDropdown(): React.ReactNode {
        if (!this.dropdownOpen) {
            return undefined;
        }
        const body = this.dropdownBody();
        // Body portal: the bar lives under a PerfectScrollbar `.ps` wrapper
        // with overflow hidden, which clips any in-tree dropdown at the
        // 40px bar edge (rows render in DOM but are neither visible nor
        // hittable). Portalling to body with fixed geometry escapes the
        // clipping ancestor; no ancestor carries transform/filter, so fixed
        // positions against the viewport. Geometry re-derives on every
        // render (each keystroke re-renders) plus on window resize.
        const pill = this.pillRef?.getBoundingClientRect();
        const top = pill ? Math.round(pill.bottom + 4) : 0;
        const style: React.CSSProperties | undefined = pill ? {
            position: 'fixed',
            top,
            left: Math.round(pill.left),
            width: Math.round(pill.width),
            // A short window caps the panel at its bottom less 8px; the panel scrolls inside.
            maxHeight: Math.max(0, Math.min(DROPDOWN_MAX_HEIGHT, window.innerHeight - top - 8)),
        } : undefined;
        return createPortal(
            <div className='pb-chrome-bar-dropdown' role='listbox' id='pb-chrome-bar-dropdown' aria-label='Suggestions' style={style}>
                {body}
            </div>,
            document.body
        );
    }

    protected dropdownBody(): React.ReactNode {
        if (this.homeFailed) {
            return <div
                role='option'
                aria-selected={true}
                className='pb-chrome-bar-row is-highlighted'
                onMouseDown={e => {
                    e.preventDefault();
                    void this.openHomeSettings();
                }}
            >
                {CHROME_BAR_COPY.homeFailed(appSubject())}
            </div>;
        }
        if (this.noSearch) {
            return <>
                <div className='pb-chrome-bar-row is-message'>{CHROME_BAR_COPY.noSearch(appSubject())}</div>
                <div className='pb-chrome-bar-dropdown-footer'>{CHROME_BAR_COPY.dropdownFooter}</div>
            </>;
        }
        if (this.pasteFailed) {
            return <>
                <div className='pb-chrome-bar-row is-message'>{CHROME_BAR_COPY.pasteFailed(appSubject())}</div>
                <div className='pb-chrome-bar-dropdown-footer'>{CHROME_BAR_COPY.dropdownFooter}</div>
            </>;
        }
        if (this.commitFailed) {
            return <>
                <div className='pb-chrome-bar-row is-message'>{CHROME_BAR_COPY.commitFailed(appSubject())}</div>
                <div className='pb-chrome-bar-dropdown-footer'>{CHROME_BAR_COPY.dropdownFooter}</div>
            </>;
        }
        return <>
            {this.rows.map((row, index) => <React.Fragment key={row.key}>
                {this.renderRow(row, index)}
                {row.key === this.removeFailedKey && <div className='pb-chrome-bar-row is-message'>{CHROME_BAR_COPY.removeFailed(appSubject())}</div>}
            </React.Fragment>)}
            {this.shimmer && <div className='pb-chrome-bar-row is-shimmer' aria-hidden='true' />}
            {this.renderOneOffs()}
            <div className='pb-chrome-bar-dropdown-footer'>{CHROME_BAR_COPY.dropdownFooter}</div>
        </>;
    }

    /** The DOM id of a row, for the input's aria-activedescendant. */
    protected rowId(index: number): string {
        return `pb-chrome-bar-row-${index}`;
    }

    /**
     * BAR-11: one single-line row -- a 16px leading icon (a cached favicon or
     * engine icon as a data:image/ URI, else a codicon), the title, the
     * caption, then the muted type marker. Titles and captions render as React
     * text nodes only (T-29-18). An open-tab row ends with the Switch to Tab
     * caption (BAR-06); choosing a row goes through chooseRow.
     */
    protected renderRow(row: Row, index: number): React.ReactNode {
        const highlighted = row.key === this.highlightKey;
        const message = row.source === 'heuristic' && (this.providerFailed || this.heuristicNoEngine);
        const icon = iconFor(row);
        return <div
            key={row.key}
            id={this.rowId(index)}
            role='option'
            aria-selected={highlighted}
            className={'pb-chrome-bar-row' + (highlighted ? ' is-highlighted' : '') + (message ? ' is-message' : '')}
            onMouseDown={e => {
                // preventDefault keeps focus in the pill and stops a middle-button autoscroll.
                e.preventDefault();
                if (e.button === 1 || (e.button === 0 && (e.ctrlKey || e.metaKey))) {
                    void this.openRowInNewTab(row, false);
                } else {
                    void this.chooseRow(row);
                }
            }}
        >
            {this.providerFailed && row.source === 'heuristic' ? (
                <div className='pb-chrome-bar-row-title'>{CHROME_BAR_COPY.suggestionsFailed(appSubject())}</div>
            ) : message ? (
                <div className='pb-chrome-bar-row-title'>{CHROME_BAR_COPY.noSearch(appSubject())}</div>
            ) : <>
                {'image' in icon.leading
                    ? <img className='pb-chrome-bar-row-icon' src={icon.leading.image} alt='' />
                    : <span className={`pb-chrome-bar-row-icon codicon ${icon.leading.codicon}`} aria-hidden='true' />}
                <div className='pb-chrome-bar-row-title' title={row.title}>{row.title}</div>
                <div className='pb-chrome-bar-row-caption' title={row.caption}>{row.caption}</div>
                {icon.trailing && <span className={`pb-chrome-bar-row-type codicon ${icon.trailing}`} aria-hidden='true' />}
                {row.source === 'tab' && <span className='pb-chrome-bar-row-switch'>{CHROME_BAR_COPY.switchToTab}</span>}
            </>}
        </div>;
    }

    protected render(): React.ReactNode {
        // One shared navigable-tab predicate (GUI-02-owned) narrowed by the
        // active web tab's last state push: all three controls dim with
        // their contracted tooltips retained and the layout never shifts.
        const canNavigate = chromeBarHasNavigableTab();
        const tab = currentWebTab();
        const stopping = !!tab?.loading;
        const secure = this.inputValue.trim().startsWith('https://');
        const engine = this.effectiveEngine();
        const addressLabel = engine ? CHROME_BAR_COPY.searchPlaceholder(engine) : CHROME_BAR_COPY.searchOrEnterAddress;
        const activeIndex = this.dropdownOpen ? this.rows.findIndex(row => row.key === this.highlightKey) : -1;
        const oneOffIndex = this.dropdownOpen ? this.oneOffEngines().findIndex(engine => ONE_OFF_KEY + engine.name === this.highlightKey) : -1;
        const activeId = activeIndex >= 0 ? this.rowId(activeIndex) : oneOffIndex >= 0 ? this.oneOffId(oneOffIndex) : undefined;
        return <div className='pb-chrome-bar'>
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
            {this.userPreference(SHOW_HOME_BUTTON_PREFERENCE, false) && (
                <button
                    className='pb-chrome-bar-button'
                    aria-label='Home'
                    aria-keyshortcuts={BUTTON_SHORTCUTS.home.aria}
                    onPointerEnter={this.onNavHover('home')}
                    onClick={() => this.goHome(currentWebTab())}
                >
                    <span className='codicon codicon-home' />
                </button>
            )}
            <div
                className='pb-chrome-bar-pill'
                ref={el => { this.pillRef = el; }}
                onDragEnter={this.onDropTargetDragOver}
                onDragOver={this.onDropTargetDragOver}
                onDragLeave={this.onDropTargetDragLeave}
                onDrop={this.onPillDrop}
            >
                {secure && <span className='codicon codicon-lock pb-chrome-bar-lock' aria-hidden='true' />}
                <input
                    className={CHROME_BAR_INPUT_CLASS}
                    placeholder={addressLabel}
                    aria-label={addressLabel}
                    role='combobox'
                    aria-expanded={this.dropdownOpen}
                    aria-controls='pb-chrome-bar-dropdown'
                    aria-autocomplete='both'
                    aria-activedescendant={activeId}
                    spellCheck={false}
                    value={this.inputValue}
                    onChange={this.onInputChange}
                    ref={this.inputRef}
                    onKeyDown={this.onInputKeyDown}
                    onCompositionEnd={this.onCompositionEnd}
                    onMouseDown={this.onInputMouseDown}
                    onMouseUp={this.onInputMouseUp}
                    onContextMenu={this.onPillContextMenu}
                    onBlur={this.onInputBlur}
                    onFocus={this.onInputFocus}
                />
            </div>
            {this.renderDropdown()}
            <button
                className='pb-chrome-bar-button'
                aria-label='New Tab'
                aria-keyshortcuts={BUTTON_SHORTCUTS.newTab.aria}
                onPointerEnter={this.onNavHover('newTab')}
                onClick={this.runCommand(CHROME_BAR_NEW_TAB_COMMAND_ID)}
                onDragEnter={this.onDropTargetDragOver}
                onDragOver={this.onDropTargetDragOver}
                onDragLeave={this.onDropTargetDragLeave}
                onDrop={this.onNewTabDrop}
            >
                <span className='codicon codicon-plus' />
            </button>
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
        </div>;
    }
}

@injectable()
export class ChromeBarContribution implements FrontendApplicationContribution {

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(ChromeBarWidget)
    protected readonly barWidget: ChromeBarWidget;

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
        window.addEventListener('resize', () => this.barWidget.repositionDropdown());
    }
}
