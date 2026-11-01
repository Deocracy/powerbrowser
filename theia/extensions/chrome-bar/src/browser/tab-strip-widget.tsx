import * as React from '@theia/core/shared/react';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { ApplicationShell, ContextMenuRenderer, ReactWidget, Widget } from '@theia/core/lib/browser';
import { CommandMenu, CommandRegistry, CompoundMenuNode, MenuPath } from '@theia/core/lib/common';
import { DisposableCollection } from '@theia/core/lib/common/disposable';
import { Drag } from '@theia/core/shared/@lumino/dragdrop';
import { MimeData } from '@theia/core/shared/@lumino/coreutils';
import { Message } from '@theia/core/shared/@lumino/messaging';
import { DockPanel, TabBar } from '@theia/core/shared/@lumino/widgets';
import { GroupModel } from '@powerbrowser/modes/lib/browser/group-model';
import { MODE_ATTRIBUTE } from '@powerbrowser/modes/lib/browser/mode-attribute';
import { SetupsService } from '@powerbrowser/modes/lib/browser/setups-service';
import { PinnedTab, ProfileStorageService } from '@powerbrowser/tab-uris/lib/browser/profile-storage';
import { CRASHED_COPY, WebTabChannel, WebTabOpenHandler, WebTabReply, WebTabWidget } from '@powerbrowser/tab-uris/lib/browser/web-tab';
import { CHROME_BAR_COPY, appSubject } from './chrome-bar-copy';
import {
    CHROME_BAR_TAB_CLOSE_COMMAND_ID, CHROME_BAR_TAB_CLOSE_DUPLICATES_COMMAND_ID, CHROME_BAR_TAB_CLOSE_LEFT_COMMAND_ID,
    CHROME_BAR_TAB_CLOSE_OTHERS_COMMAND_ID, CHROME_BAR_TAB_CLOSE_RIGHT_COMMAND_ID, CHROME_BAR_TAB_DUPLICATE_COMMAND_ID,
    CHROME_BAR_TAB_MOVE_END_COMMAND_ID, CHROME_BAR_TAB_MOVE_START_COMMAND_ID, CHROME_BAR_TAB_MUTE_COMMAND_ID,
    CHROME_BAR_NEW_TAB_COMMAND_ID, CHROME_BAR_TAB_RELOAD_COMMAND_ID, setTabActions,
} from './chrome-bar-commands';
import { LINK_DRAG_TYPES, droppedTextOf, safeIcon } from './address-bar/address-bar-rows';

/** Marks a home-pane tab that the strip lists, so the pane's own bar does not. */
const STRIP_ONLY_CLASS = 'pb-strip-only';

/** TAB-07 (34-04, D-10): the hover dwell before a tab's preview card opens (Firefox parity). */
const PREVIEW_DWELL_MS = 400;

/** TAB-01 (34-01): the tab menu's path; the menu itself is built fresh per right-click (D-03). */
const TAB_MENU_PATH: MenuPath = ['powerbrowser-tab-strip-menu'];

/**
 * TAB-01 (34-01, D-04): one tab-menu row, built per request for the right-clicked tab. `contract` names the
 * ROADMAP Phase 34 criterion-1 item the row satisfies (scripts/verify-tab-strip.mjs compares that set as set
 * equality); `group` is the separator group; `enabled` is the predicate, evaluated when the menu opens.
 */
interface TabMenuRow {
    id: string;
    contract?: string;
    label: string;
    icon?: string;
    group: number;
    /** The single-tab command the row runs through (34-03's bulk rows call it per tab); absent for the Bookmark rows. */
    command?: string;
    enabled: boolean;
    /** The row's failure sentence (34-UI-SPEC: one per verb), shown in the strip when its action fails. */
    failed?: (subject: string) => string;
    run(): Promise<void>;
}

/** TAB-04: runs `run` after every commit of the strip's render, when the row's widths are final. */
function AfterRender({ run }: { run: () => void }): null {
    React.useLayoutEffect(run);
    return null;
}

/** A refused web-tab reply is a failed action, not a silent one. */
function settled(reply: WebTabReply): void {
    if (!reply.ok) {
        throw new Error('refused');
    }
}

const isHttp = (url: string): boolean => /^https?:\/\//i.test(url);

/** TAB-08: drag types the strip takes from outside: a link, a file, or plain text. */
const DROP_TYPES = [...LINK_DRAG_TYPES, 'Files', 'text/plain'];

/**
 * TAB-08: plain text that is one address with a scheme (javascript:, file:, mailto: ...) is a link, refused unless
 * http(s); a host and port (localhost:3000) is not a scheme and goes to the pill like other text.
 */
const SCHEME_ADDRESS = /^[a-z][a-z0-9+.-]*:(?!\d)\S*$/i;

/** PAN-04 (A3): a tab of a group in its undo window, hidden in every tab bar. */
const GROUP_CLOSING_CLASS = 'pb-group-closing';

/**
 * The only mime type the main dock will accept a drop for. Its payload is a
 * zero-argument factory returning the widget to move (Lumino `DockPanel`
 * `_evtDrop`); anything else is answered with dropAction 'none'.
 */
const WIDGET_FACTORY_MIME = 'application/vnd.lumino.widget-factory';

/**
 * Pointer travel, in px, before a press on a tab becomes a drag rather than a
 * click. Small on purpose: Lumino's tab bar makes you pull 20px clear of the
 * bar before it will start a dock drag, which is the wrong feel for a strip
 * that is already outside the thing you are dropping into. TAB-02 (34-02): a
 * drag that stays in the strip row reorders; one that leaves the row is handed
 * to the dock, so the 5px start serves both.
 */
const DRAG_THRESHOLD = 5;

/** TAB-02 (34-UI-SPEC Drag): the row's edge zone, in px, where a reorder drag auto-scrolls, and the step per frame. */
const EDGE_ZONE = 8;
const EDGE_STEP = 8;

/**
 * GUI-07: the tab strip's Browsing home — the very top of the window, above
 * the URL row, where Firefox and Chrome put it (14-UI-SPEC per-mode shell map,
 * amended 2026-09-08; sketch 003).
 *
 * ## Why this is a second view and not the strip itself moved
 *
 * The stock strip is a Lumino `TabBar` owned by the main `DockPanel`. It is
 * `position: absolute` with left/top/width the dock's layout recomputes on
 * every pass (measured live: `top: 0; left: 0; width: 1609px; height: 35px`
 * inside `#theia-main-content-panel`). Reparenting that node into the top
 * panel does not move a widget between shell areas the way 13-01's spike
 * moved a content widget — it hands one node to two layouts, and the dock
 * wins every pass. So the top-panel home renders the same model instead, and
 * the dock's own bar is hidden while this one is showing.
 *
 * That hiding is Lumino's own supported path, not surgery: `DockPanel` hides
 * generated tab bars itself in `single-document` mode, and the layout
 * accounts for a hidden bar. Measured live: with the dock's bar hidden the
 * current content moved from y=107 to y=72 and returned on show, so the 35px
 * is genuinely reclaimed rather than left as a gap.
 *
 * ## Why it fits without resizing anything
 *
 * The top panel is pinned at 72px — `fit()` on the panel and on the shell
 * both leave it there. It does not need to change: in Browsing the menubar
 * (30px) hides, the box layout reflows the URL row to y=0, and the freed
 * space at the bottom is where this strip goes. `[strip][URL row]` occupies
 * the same 72px `[menubar][URL row]` did.
 *
 * ## What this is NOT
 *
 * Not the unified chrome+Theia tab strip. That is GUI-04, it is a later
 * milestone by CLAUDE.md hard rule 3, and it requires the chrome-owned tab
 * model in `@powerbrowser/browser-bridge`. This widget reads Theia's main
 * dock and nothing else; it adds no tab model of its own, so it cannot
 * become a second source of truth that the bridge would later have to
 * reconcile.
 *
 * PAN-03 (Phase 22): in Browsing it paints only the active group's tabs, the
 * loose tabs and the current tab. It reads GroupModel for that membership and
 * still keeps no tab model of its own.
 */
@injectable()
export class TabStripWidget extends ReactWidget {

    static readonly ID = 'powerbrowser.tab-strip';

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(GroupModel)
    protected readonly groups: GroupModel;

    @inject(WebTabChannel)
    protected readonly channel: WebTabChannel;

    /** TAB-01 (34-01): renders the tab menu as a stock `.lm-Menu`, which the overlay's blocking-layer selector already lists. */
    @inject(ContextMenuRenderer)
    protected readonly menus: ContextMenuRenderer;

    @inject(CommandRegistry)
    protected readonly commands: CommandRegistry;

    /** TAB-01 Duplicate: the NAV-06 opener (http(s)-only wall, new tab right after the source). */
    @inject(WebTabOpenHandler)
    protected readonly opener: WebTabOpenHandler;

    /** TAB-05 (34-03): the shell-state map the pins persist in. */
    @inject(ProfileStorageService)
    protected readonly storage: ProfileStorageService;

    /** TAB-05: the launch restore, which the pin restore waits for so it reopens only what that restore did not. */
    @inject(SetupsService)
    protected readonly setups: SetupsService;

    /**
     * BMK-07 (34-01): set at startup by the chrome-bar contribution to the one Phase 33 bookmarkPage call site in
     * chrome-bar-widget.tsx; undefined while that store method is absent, which renders both Bookmark rows disabled.
     */
    bookmarkTabs: ((tabs: WebTabWidget[]) => Promise<void>) | undefined;

    /** TAB-08 (34-02): set at startup to the pill's drop path (AddressBar.openDropped); non-URL text dropped here searches there. */
    searchDropped: ((text: string) => Promise<void>) | undefined;

    /** A failed tab action's sentence, shown at the strip's end until the next tab menu opens. */
    protected notice: string | undefined;

    /**
     * TAB-02 (34-02): an in-strip reorder drag in flight: the dragged tab and where it would land, before `before`
     * or, with no `before`, after the strip's last tab. `moves` is false where the drop would change nothing.
     * Presentation only; the order itself is the home pane TabBar's.
     */
    protected reorder: { widget: Widget; before: Widget | undefined; moves: boolean } | undefined;

    /** TAB-04 (D-07): whether the strip row overflows; written only by measureOverflow, and the List All Tabs chevron shows iff true. */
    protected overflowing = false;

    /** TAB-04: re-measures the overflow when the strip's width changes (window resize, mode switch showing the strip). */
    protected readonly resizes = new ResizeObserver(() => this.measureOverflow());

    /**
     * TAB-05 (D-08): the pinned tabs, by GroupModel.keyOf and nothing else (never a tab id, never a URL), so two
     * tabs on one URL pin independently. Strip-local state, persisted in the shell-state map by savePins.
     */
    protected readonly pinnedIds = new Set<string>();

    /**
     * TAB-06 (D-09): the selected tabs, by GroupModel.keyOf only, and the Shift-click range's anchor. Strip-local:
     * Lumino's TabBar has no multiselect. The selection is the only input a bulk row acts on (T-34-06).
     */
    protected selectedIds = new Set<string>();
    protected anchorKey: string | undefined;

    /** TAB-05: false until the stored pins are restored; before then nothing may overwrite the stored list. */
    protected pinsRestored = false;

    /** TAB-05: the pin restore, settled when the stored pins are back (the live pin-restore scenario awaits it). */
    pinRestore: Promise<void> = Promise.resolve();

    /**
     * TAB-07 (34-04, D-10/D-11): the open preview card: the hovered tab, its fixed position (the tab's bottom-left
     * plus 4px), whether its image is still resolving, and the page to refocus on close (set only when that page
     * had focus when the card hid it).
     */
    protected preview: { widget: Widget; left: number; top: number; resolving: boolean; refocus: WebTabWidget | undefined } | undefined;
    protected previewTimer: number | undefined;

    /** TAB-07: the tab id of the page chrome last reported focused (the pageFocus push), for the focus rule. */
    protected focusedPageTabId: string | undefined;

    protected readonly toDispose = new DisposableCollection();

    @postConstruct()
    protected init(): void {
        this.id = TabStripWidget.ID;
        this.addClass('pb-tab-strip');
        // Hidden until a mode asks for it. Browsing is the launch default, so
        // the mode service shows it on the launch switch like any other.
        this.setHidden(true);
        // Every shell event that can change WHICH tabs exist or which one is
        // current. The dock's own tab bar redraws itself on these; this view
        // has to be told.
        this.toDispose.pushAll([
            this.shell.onDidAddWidget(() => this.update()),
            this.shell.onDidRemoveWidget(() => this.update()),
            this.shell.onDidChangeCurrentWidget(() => this.update()),
            this.groups.onDidChange(() => this.update()),
            // Phase 32 plan 08 (PAGE-04, PAGE-11): a pushed favicon or crash flag repaints the row's icon and mark.
            this.channel.onDidChangeTabStatus(() => this.update()),
            this.channel.onPush('pageFocus', detail => {
                this.focusedPageTabId = typeof detail.tabId === 'string' ? detail.tabId : undefined;
            }),
        ]);
        // TAB-01: each single-tab command runs the same row the menu shows, for the tab it is handed.
        setTabActions({
            isEnabled: (id, widget) => !!this.tabMenuRows(widget).find(row => row.command === id)?.enabled,
            run: async (id, widget) => {
                const row = this.tabMenuRows(widget).find(candidate => candidate.command === id);
                if (row?.enabled) {
                    await this.runRow(row);
                }
            },
        });
        // TAB-05: pins come back after the launch restore, and the quit flush writes them with each tab's last URL.
        this.pinRestore = this.setups.sessionRestored.then(() => this.restorePins());
        this.toDispose.push(this.storage.onWillFlush(event => event.waitUntil(this.savePins())));
        this.shell.mainPanel.onDidChangeCurrent(() => {
            // TAB-07: a tab switch closes the preview; the switched-to tab takes focus, not the page the card hid.
            this.closePreview(false);
            this.update();
        });
        // A split moves a tab between panes without adding or removing it,
        // and which pane a tab is in is exactly what this strip now shows.
        this.shell.mainPanel.layoutModified.connect(() => this.update());
        this.update();
    }

    override dispose(): void {
        window.clearTimeout(this.previewTimer);
        this.toDispose.dispose();
        super.dispose();
    }

    /**
     * The strip is a drop target: a tab dragged here goes back into the
     * leftmost pane, which is the pane the strip stands for.
     *
     * Lumino's protocol, in its own order. `lm-dragenter` must be cancelled
     * to receive anything further; `lm-dragover` must be cancelled AND name
     * a drop action or `lm-drop` never comes; `lm-drop` reports the action
     * taken. Registered on the node in the bubbling phase, after the
     * shell's document-level capture listeners have seen the event -- those
     * only track state for the side-panel reveal and consume nothing.
     */
    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.node.addEventListener('lm-dragenter', this.onDragEnter);
        this.node.addEventListener('lm-dragover', this.onDragOver);
        this.node.addEventListener('lm-dragleave', this.onDragLeave);
        this.node.addEventListener('lm-drop', this.onDrop);
        // A drop into the dock while the stack is open: if the tab ends up in
        // the home pane, it was dropped onto the blank row (or into that
        // pane), which is how a tab joins the stack on the home side.
        this.shell.mainPanel.node.addEventListener('lm-drop', this.onDockDrop);
        this.resizes.observe(this.node);
        window.addEventListener('keydown', this.onKeyDown);
    }

    protected override onBeforeDetach(msg: Message): void {
        this.node.removeEventListener('lm-dragenter', this.onDragEnter);
        this.node.removeEventListener('lm-dragover', this.onDragOver);
        this.node.removeEventListener('lm-dragleave', this.onDragLeave);
        this.node.removeEventListener('lm-drop', this.onDrop);
        this.shell.mainPanel.node.removeEventListener('lm-drop', this.onDockDrop);
        this.resizes.disconnect();
        window.removeEventListener('keydown', this.onKeyDown);
        super.onBeforeDetach(msg);
    }

    protected readonly onDockDrop = (event: Event): void => {
        const widget = this.draggedWidget(event);
        if (!widget || !(this.isSplit() || this.hasStack())) {
            return;
        }
        // After the dock has placed it, not before.
        window.setTimeout(() => {
            if (this.homeWidgets().includes(widget)) {
                this.stacked.add(widget);
                this.update();
            }
        }, 0);
    };

    /** The widget a drag carries, if it carries one the dock would take. */
    protected draggedWidget(event: Event): Widget | undefined {
        const drag = event as Drag.Event;
        const factory = drag.mimeData?.getData(WIDGET_FACTORY_MIME);
        const widget = typeof factory === 'function' ? factory() : undefined;
        return widget instanceof Widget ? widget : undefined;
    }

    protected readonly onDragEnter = (event: Event): void => {
        if (!this.draggedWidget(event)) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        this.addClass('is-drop-target');
    };

    protected readonly onDragOver = (event: Event): void => {
        if (!this.draggedWidget(event)) {
            return;
        }
        (event as Drag.Event).dropAction = 'move';
        event.preventDefault();
        event.stopPropagation();
    };

    protected readonly onDragLeave = (event: Event): void => {
        event.preventDefault();
        event.stopPropagation();
        this.removeClass('is-drop-target');
    };

    protected readonly onDrop = (event: Event): void => {
        this.removeClass('is-drop-target');
        const widget = this.draggedWidget(event);
        if (!widget) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        (event as Drag.Event).dropAction = 'move';
        const target = event.target instanceof Element ? event.target : undefined;
        const ontoStack = !!target?.closest('.pb-tab-stack');
        if (ontoStack) {
            this.addToStack(widget);
        } else {
            this.moveHome(widget, false);
        }
        void this.shell.activateWidget(widget.id);
    };

    /**
     * Puts a tab in the home pane, as a strip tab or as a stacked one. A tab
     * already there just changes which of the two it is.
     */
    protected moveHome(widget: Widget, stack: boolean): void {
        if (stack) {
            this.stacked.add(widget);
        } else {
            this.stacked.delete(widget);
        }
        const home = this.homeWidgets();
        if (home.includes(widget)) {
            this.update();
            return;
        }
        const anchor = home[home.length - 1];
        if (anchor) {
            this.shell.mainPanel.addWidget(widget, { mode: 'tab-after', ref: anchor });
        } else {
            this.shell.mainPanel.addWidget(widget);
        }
    }

    /** A drop on the stack entry: into the stack's leftmost bar, the home one. */
    protected addToStack(widget: Widget): void {
        if (this.collapsed) {
            this.expand();
        }
        this.moveHome(widget, true);
    }

    /**
     * The main dock's widgets in dock order, minus the surfaces that are a
     * MODE rather than a tab. Read on every render rather than cached: the
     * dock is the model, and a cached copy here would be the second source of
     * truth this widget exists to avoid.
     *
     * Organising's canvas lives in the main area because that is where a
     * full-window surface goes, but it is not something the user opened and
     * cannot be closed or switched away from like a page -- listing it put
     * "Organising" in the strip beside the real tabs, which is what Chris saw
     * on 2026-09-08 and described as the mode thinking it is a tab.
     *
     * Spelled rather than imported for the same reason as the strip id in
     * ModeService: @powerbrowser/chrome-bar already imports
     * @powerbrowser/modes, and OrganisingWidget is exported from there, but
     * this list is about presentation in THIS view and naming it here keeps
     * the exclusion visible where the rendering happens.
     */
    static readonly MODE_SURFACES: readonly string[] = ['powerbrowser.modes.organising'];

    /**
     * The pane this strip stands for: the leftmost one, the dock's first tab
     * bar in layout order.
     *
     * With one pane, that is every tab and the strip is simply the tab bar,
     * relocated. With more than one, the strip shows only this pane's tabs
     * and the OTHER panes show their own bars -- so a tab is listed in
     * exactly one place, and where it is listed is where it is. Listing the
     * whole dock here while a pane bar also listed it showed the same tab
     * twice, and gave the user no way to tell that dragging it to a pane had
     * moved it, or anywhere to drag it back to (reported 2026-09-09, with a
     * screenshot of the duplicate).
     *
     * The pane the user started with, remembered, not the leftmost one. The
     * dock keeps a pane's tab bar instance across a split -- it makes a NEW
     * bar for the new pane -- so holding on to the bar is holding on to the
     * pane. "Leftmost" was tried first and was wrong the moment a tab was
     * dropped on the left: the one dropped tab became the strip's whole list
     * and every other tab appeared in a bar on the right, which read as a
     * bunch of tabs having moved when one had (2026-09-10).
     *
     * Only when that pane is gone -- its last tab moved out and the dock
     * removed the bar -- does the strip adopt whichever pane is first.
     */
    protected home: TabBar<Widget> | undefined;

    primaryBar(): TabBar<Widget> | undefined {
        const bars = [...this.shell.mainPanel.tabBars()];
        if (!this.home || !bars.includes(this.home)) {
            this.home = bars[0];
        }
        return this.home;
    }

    /** Every tab in the home pane, strip and stacked alike. */
    protected homeWidgets(): Widget[] {
        const bar = this.primaryBar();
        return (bar ? bar.titles.map(title => title.owner) : [])
            .filter(widget => !TabStripWidget.MODE_SURFACES.includes(widget.id));
    }

    /** The strip's own tabs: the home pane's, minus those stacked into its bar. */
    protected mainTabs(): Widget[] {
        return this.homeWidgets().filter(widget => !this.stacked.has(widget));
    }

    // The stack.
    //
    // A split is a STACK: the tabs that were dragged down into panes, and the
    // arrangement they were dragged into. While you are in it, it is on
    // screen -- the home pane's bar shows the tabs stacked on that side, the
    // other panes show theirs. Click a strip tab and the stack folds up into
    // one entry in the strip, its panes gone, its tabs detached but kept;
    // click the entry and it comes back exactly as it was. Drop a tab on the
    // entry to add it, drag a tab out of the entry to free it.
    //
    // Two facts make one stack: `stacked`, which home-pane tabs sit in the
    // home bar rather than the strip (a tab in any OTHER pane is stacked by
    // where it is), and `collapsed`, the saved arrangement plus its tabs
    // while the stack is folded up.

    protected readonly stacked = new Set<Widget>();
    protected collapsed: { widgets: Widget[]; layout: DockPanel.ILayoutConfig; anchor?: Widget } | undefined;

    protected isSplit(): boolean {
        return [...this.shell.mainPanel.tabBars()].length > 1;
    }

    /**
     * Whether a stack is on screen. Not the same as split: close the last
     * tab on one side and the dock removes that pane, but the tabs stacked
     * on the other side are still a stack -- one bar the full width, still
     * the pill in the strip -- until the user says otherwise.
     */
    hasStack(): boolean {
        return !this.collapsed && this.stackWidgets().length > 0;
    }

    /** Exit split view: every stacked tab back to the strip, in order. */
    dissolve(): void {
        if (this.collapsed) {
            this.expand();
        }
        for (const widget of this.stackWidgets()) {
            this.moveHome(widget, false);
        }
        this.update();
    }

    /** The stack's tabs, on screen or folded, in dock order. */
    protected stackWidgets(): Widget[] {
        if (this.collapsed) {
            return this.collapsed.widgets.filter(widget => !widget.isDisposed);
        }
        const home = this.homeWidgets();
        return [...this.shell.mainPanel.widgets()]
            .filter(widget => !TabStripWidget.MODE_SURFACES.includes(widget.id))
            .filter(widget => !home.includes(widget) || this.stacked.has(widget));
    }

    protected activateTab(widget: Widget): void {
        // Leaving the stack for a strip tab is what folds the stack up.
        if (!this.collapsed && !this.stackWidgets().includes(widget)) {
            this.collapse();
        }
        void this.shell.activateWidget(widget.id);
    }

    protected activateStack(): void {
        if (this.collapsed) {
            this.expand();
        }
        const first = this.stackWidgets()[0];
        if (first) {
            void this.shell.activateWidget(first.id);
        }
    }

    /**
     * Folds the stack up: remembers the dock's arrangement and detaches the
     * stack's tabs from it. Detached, not closed -- a web tab keeps its page
     * (it publishes hidden and comes back on attach), an editor keeps its
     * buffer. The dock collapses the emptied panes on its own.
     */
    protected collapse(): void {
        const widgets = this.stackWidgets();
        if (!widgets.length) {
            return;
        }
        const layout = this.shell.mainPanel.saveLayout();
        // A strip tab that stays in the dock: the way back to the home pane
        // after restore, since restore rebuilds every tab bar.
        const anchor = this.mainTabs()[0];
        this.collapsed = { widgets, layout, anchor };
        for (const widget of widgets) {
            widget.parent = null;  // eslint-disable-line no-null/no-null
        }
        this.update();
    }

    /**
     * Brings the stack back. Restore is whole-dock, so the saved arrangement
     * is pruned of tabs closed since, and tabs opened since -- which restore
     * would otherwise detach -- are put back into the home pane afterwards.
     */
    protected expand(): void {
        const folded = this.collapsed;
        if (!folded) {
            return;
        }
        this.collapsed = undefined;
        const kept = new Set<Widget>();
        const layout = { main: folded.layout.main ? prune(folded.layout.main, kept) : null };
        const extra = [...this.shell.mainPanel.widgets()].filter(widget => !kept.has(widget));
        this.shell.mainPanel.restoreLayout(layout);
        const bars = [...this.shell.mainPanel.tabBars()];
        this.home = bars.find(bar => bar.titles.some(title => title.owner === folded.anchor)) ?? bars[0];
        for (const widget of extra) {
            this.moveHome(widget, this.stacked.has(widget));
        }
        this.update();
    }

    // No "a stack of one dissolves" rule, deliberately. The first drop makes
    // exactly that -- one tab in a new pane, Frame 1 of the agreed design --
    // and a rule that undid it on the next layout tick un-split the window
    // the instant it split (measured 2026-09-10: one hidden bar, five tabs,
    // a pill of one). A stack ends when its last tab leaves; the dock drops
    // the empty pane itself.

    protected closeTab(widget: Widget, event: React.MouseEvent): void {
        // Stop the click reaching the tab body, which would activate the tab
        // being closed and fight the dock's own removeBehavior.
        event.stopPropagation();
        void this.shell.closeWidget(widget.id);
    }

    /**
     * TAB-01 (34-01, D-04): the tab menu's rows for `widget`, the right-clicked tab and the only tab any row
     * acts on (never the current widget). Built per request, so every predicate is read when the menu opens.
     */
    protected tabMenuRows(widget: Widget): TabMenuRow[] {
        const COPY = CHROME_BAR_COPY.tabMenu;
        const web = widget instanceof WebTabWidget ? widget : undefined;
        const page = web && isHttp(web.url) ? web : undefined;
        const tabs = this.shownTabs();
        const at = tabs.indexOf(widget);
        const closable = (list: Widget[]) => list.filter(tab => tab.title.closable);
        // TAB-05 (D-08): the range closes leave pinned tabs open, unless the user selected them (TAB-06).
        const ranged = (list: Widget[]) => closable(list).filter(tab => !this.isPinned(tab) || this.selectedIds.has(this.tabKey(tab)));
        const others = ranged(tabs.filter(tab => tab !== widget));
        const left = ranged(at < 0 ? [] : tabs.slice(0, at));
        const right = ranged(at < 0 ? [] : tabs.slice(at + 1));
        // TAB-05: pinned and unpinned tabs each move within their own block; the pinned block leads.
        const pinned = this.isPinned(widget);
        const block = tabs.filter(tab => this.isPinned(tab) === pinned);
        const place = block.indexOf(widget);
        const duplicates = closable(tabs.filter(tab => tab !== widget && tab instanceof WebTabWidget && tab.url === web?.url));
        const pages = tabs.filter((tab): tab is WebTabWidget => tab instanceof WebTabWidget && isHttp(tab.url));
        const bookmark = this.bookmarkTabs;
        return [
            {
                id: 'reload', contract: 'Reload', label: COPY.reload, icon: 'codicon codicon-refresh', group: 0,
                command: CHROME_BAR_TAB_RELOAD_COMMAND_ID, enabled: !!web?.canReload, failed: CHROME_BAR_COPY.reloadTabFailed,
                run: async () => settled(await web!.reload()),
            },
            {
                // Phase 32's path: setMuted sends webTabMute. Offered while the tab plays sound, or is muted so it can be unmuted.
                id: 'mute', contract: 'Mute', label: web?.audioMuted ? COPY.unmute : COPY.mute,
                icon: web?.audioMuted ? 'codicon codicon-unmute' : 'codicon codicon-mute', group: 0,
                command: CHROME_BAR_TAB_MUTE_COMMAND_ID, enabled: !!web && (web.soundPlaying || web.audioMuted),
                failed: CHROME_BAR_COPY.muteTabFailed,
                run: async () => settled(await web!.setMuted(!web!.audioMuted)),
            },
            {
                // TAB-05 (34-03): toggles the tab's keyOf key in pinnedIds; strip-local, so no command and no kind.
                id: 'pin', contract: 'Pin', label: pinned ? COPY.unpin : COPY.pin,
                icon: pinned ? 'codicon codicon-pinned' : 'codicon codicon-pin', group: 0,
                enabled: at >= 0,
                run: async () => this.togglePin(widget),
            },
            {
                id: 'duplicate', contract: 'Duplicate', label: COPY.duplicate, group: 0,
                command: CHROME_BAR_TAB_DUPLICATE_COMMAND_ID, enabled: !!page, failed: CHROME_BAR_COPY.duplicateTabFailed,
                run: async () => {
                    const copy = await this.opener.openInBackground(page!.url, widget);
                    await this.groups.joinActiveGroup(copy);
                },
            },
            {
                id: 'bookmark', contract: 'Bookmark', label: COPY.bookmark, icon: 'codicon codicon-star-empty', group: 1,
                enabled: !!bookmark && !!page, failed: CHROME_BAR_COPY.bookmarkTabFailed,
                run: () => bookmark!([page!]),
            },
            {
                id: 'bookmark-all', contract: 'Bookmark All Tabs', label: COPY.bookmarkAll, icon: 'codicon codicon-star-full', group: 1,
                enabled: !!bookmark && pages.length > 0, failed: CHROME_BAR_COPY.bookmarkTabFailed,
                run: () => bookmark!(pages),
            },
            {
                id: 'move-start', contract: 'Move', label: COPY.moveToStart, icon: 'codicon codicon-arrow-left', group: 2,
                command: CHROME_BAR_TAB_MOVE_START_COMMAND_ID, enabled: place > 0,
                run: async () => this.reorderTo(widget, block[0]),
            },
            {
                id: 'move-end', contract: 'Move', label: COPY.moveToEnd, icon: 'codicon codicon-arrow-right', group: 2,
                command: CHROME_BAR_TAB_MOVE_END_COMMAND_ID, enabled: place >= 0 && place < block.length - 1,
                run: async () => this.reorderTo(widget, pinned ? tabs.find(tab => !this.isPinned(tab)) : undefined),
            },
            {
                id: 'close-others', contract: 'Close Others', label: COPY.closeOthers, group: 3,
                command: CHROME_BAR_TAB_CLOSE_OTHERS_COMMAND_ID, enabled: others.length > 0, failed: CHROME_BAR_COPY.closeTabFailed,
                run: () => this.closeTabs(others),
            },
            {
                id: 'close-left', contract: 'Close Tabs to the Left', label: COPY.closeLeft, group: 3,
                command: CHROME_BAR_TAB_CLOSE_LEFT_COMMAND_ID, enabled: left.length > 0, failed: CHROME_BAR_COPY.closeTabFailed,
                run: () => this.closeTabs(left),
            },
            {
                id: 'close-right', contract: 'Close Tabs to the Right', label: COPY.closeRight, group: 3,
                command: CHROME_BAR_TAB_CLOSE_RIGHT_COMMAND_ID, enabled: right.length > 0, failed: CHROME_BAR_COPY.closeTabFailed,
                run: () => this.closeTabs(right),
            },
            {
                id: 'close-duplicates', contract: 'Close Duplicates', label: COPY.closeDuplicates, group: 3,
                command: CHROME_BAR_TAB_CLOSE_DUPLICATES_COMMAND_ID, enabled: duplicates.length > 0, failed: CHROME_BAR_COPY.closeTabFailed,
                run: () => this.closeTabs(duplicates),
            },
            {
                // Firefox parity, beyond the ROADMAP list: the tab's own close.
                id: 'close', label: COPY.close, icon: 'codicon codicon-close', group: 3,
                command: CHROME_BAR_TAB_CLOSE_COMMAND_ID, enabled: widget.title.closable, failed: CHROME_BAR_COPY.closeTabFailed,
                run: () => this.closeTabs([widget]),
            },
        ];
    }

    /**
     * TAB-06 (D-09, 34-UI-SPEC Bulk): the N-Tabs rows, offered when the right-clicked tab is in a selection of two or
     * more. Each runs every selected tab's own single-tab row (runOnEach), never a second close, move, mute or
     * bookmark path; a row is enabled when that single row is enabled for at least one selected tab.
     */
    protected bulkMenuRows(widget: Widget): TabMenuRow[] {
        const selected = this.selectedTabs();
        if (selected.length < 2 || !selected.includes(widget)) {
            return [];
        }
        const COPY = CHROME_BAR_COPY.tabMenu;
        const count = selected.length;
        const can = (id: string, tabs: Widget[]) => tabs.some(tab => this.tabMenuRows(tab).find(row => row.id === id)?.enabled);
        // Mute N Tabs mutes the unmuted ones; once every selected web tab is muted the row is Unmute N Tabs.
        const webs = selected.filter((tab): tab is WebTabWidget => tab instanceof WebTabWidget);
        const unmute = webs.length > 0 && webs.every(tab => tab.audioMuted);
        const audible = webs.filter(tab => tab.audioMuted === unmute);
        // Moved one at a time, last first to the start and first first to the end, so the selection keeps its order.
        const backwards = [...selected].reverse();
        return [
            {
                id: 'close-n', label: COPY.closeN(count), icon: 'codicon codicon-close', group: 4,
                enabled: can('close', selected), failed: CHROME_BAR_COPY.closeTabFailed,
                run: () => this.runOnEach(selected, 'close'),
            },
            {
                id: 'move-start-n', label: COPY.moveNToStart(count), icon: 'codicon codicon-arrow-left', group: 4,
                enabled: can('move-start', selected),
                run: () => this.runOnEach(backwards, 'move-start'),
            },
            {
                id: 'move-end-n', label: COPY.moveNToEnd(count), icon: 'codicon codicon-arrow-right', group: 4,
                enabled: can('move-end', selected),
                run: () => this.runOnEach(selected, 'move-end'),
            },
            {
                id: 'mute-n', label: unmute ? COPY.unmuteN(count) : COPY.muteN(count),
                icon: unmute ? 'codicon codicon-unmute' : 'codicon codicon-mute', group: 4,
                enabled: can('mute', audible), failed: CHROME_BAR_COPY.muteTabFailed,
                run: () => this.runOnEach(audible, 'mute'),
            },
            {
                id: 'bookmark-n', label: COPY.bookmarkN(count), icon: 'codicon codicon-star-empty', group: 4,
                enabled: can('bookmark', selected), failed: CHROME_BAR_COPY.bookmarkTabFailed,
                run: () => this.runOnEach(selected, 'bookmark'),
            },
        ];
    }

    /**
     * TAB-06 (C-03): one bulk action as each tab's own single-tab row, in turn: the row's command when it has one
     * (the 34-01 tab commands), else the row itself (the Bookmark row's one bookmarkTabs callback). Each row is
     * rebuilt per tab, so its predicate reads the strip as the earlier tabs left it.
     */
    protected async runOnEach(tabs: Widget[], id: string): Promise<void> {
        for (const tab of tabs) {
            const row = this.tabMenuRows(tab).find(candidate => candidate.id === id);
            if (row) {
                await this.runTabRow(row, tab);
            }
        }
    }

    /** A tab-menu row for `widget`, through its single-tab command when it has one; a disabled row does nothing. */
    protected async runTabRow(row: TabMenuRow, widget: Widget): Promise<void> {
        if (!row.enabled) {
            return;
        }
        if (row.command) {
            await this.commands.executeCommand(row.command, widget);
        } else {
            await this.runRow(row);
        }
    }

    /** TAB-06: the selected tabs the strip shows, in strip order. */
    protected selectedTabs(): Widget[] {
        return this.shownTabs().filter(tab => this.selectedIds.has(this.tabKey(tab)));
    }

    protected clearSelection(): void {
        if (this.selectedIds.size || this.anchorKey) {
            this.selectedIds.clear();
            this.anchorKey = undefined;
            this.update();
        }
    }

    /**
     * TAB-06 (D-09): Ctrl/Cmd-click toggles the tab in the selection and makes it the anchor; Shift-click selects the
     * strip-order range from the anchor (the current tab when there is none) to the tab; a plain click clears the
     * selection and activates the tab.
     */
    protected onTabClick(widget: Widget, event: React.MouseEvent): void {
        if (event.ctrlKey || event.metaKey) {
            if (!this.selectedIds.delete(this.tabKey(widget))) {
                this.selectedIds.add(this.tabKey(widget));
                this.watch(widget);
            }
            this.anchorKey = this.tabKey(widget);
            this.update();
            return;
        }
        if (event.shiftKey) {
            const tabs = this.shownTabs();
            const from = tabs.findIndex(tab => this.tabKey(tab) === this.anchorKey);
            const anchor = from >= 0 ? from : Math.max(0, tabs.indexOf(this.shell.mainPanel.currentTitle?.owner as Widget));
            const to = tabs.indexOf(widget);
            const range = tabs.slice(Math.min(anchor, to), Math.max(anchor, to) + 1);
            range.forEach(tab => this.watch(tab));
            this.selectedIds = new Set(range.map(tab => this.tabKey(tab)));
            this.anchorKey = tabs[anchor] ? this.tabKey(tabs[anchor]) : undefined;
            this.update();
            return;
        }
        this.clearSelection();
        this.activateTab(widget);
    }

    /** TAB-06: Esc clears the selection. Not consumed: Esc keeps every other meaning it has. */
    protected readonly onKeyDown = (event: KeyboardEvent): void => {
        if (event.key === 'Escape') {
            this.clearSelection();
        }
    };

    /** Runs one row; a failure shows the row's sentence in the strip and logs the action and error name only (T-34-04). */
    protected async runRow(row: TabMenuRow): Promise<void> {
        try {
            await row.run();
        } catch (error) {
            console.error('[@powerbrowser/chrome-bar] a tab action failed:', row.id, error instanceof Error ? error.name : typeof error);
            this.notice = row.failed?.(appSubject());
            this.update();
        }
    }

    /**
     * The Move rows' order helper, which 34-02's drop index reuses: puts `widget` at `index` in the home pane's
     * TabBar order, which is the strip's order. Lumino clamps the index, so Infinity is the end.
     */
    protected moveInBar(widget: Widget, index: number): void {
        const bar = this.primaryBar();
        if (bar && bar.titles.includes(widget.title)) {
            bar.insertTab(index, widget.title);
            this.update();
        }
    }

    /** TAB-05 (D-08, C-01): a tab's identity in strip state. GroupModel.keyOf only: never a tab id, never a URL. */
    protected tabKey(widget: Widget): string {
        return this.groups.keyOf(widget);
    }

    /** TAB-05: whether `widget` is pinned. */
    isPinned(widget: Widget): boolean {
        return this.pinnedIds.has(this.tabKey(widget));
    }

    /** Every open main-area tab, including those folded into a collapsed stack (detached, not closed). */
    protected openTabs(): Widget[] {
        const folded = this.collapsed?.widgets.filter(widget => !widget.isDisposed) ?? [];
        return [...this.shell.mainPanel.widgets(), ...folded]
            .filter(widget => !TabStripWidget.MODE_SURFACES.includes(widget.id));
    }

    /**
     * A closed tab leaves the strip state: its pin (the pin store stays bounded by open tabs, T-34-05) and its
     * selection, which clears once every selected tab has closed.
     */
    protected readonly forgetTab = (widget: Widget): void => {
        this.pinnedIds.delete(this.tabKey(widget));
        this.selectedIds.delete(this.tabKey(widget));
        if (!this.selectedIds.size) {
            this.anchorKey = undefined;
        }
        void this.savePins();
        this.update();
    };

    /** Forgets `widget` when it closes. Lumino connects a slot once, so watching twice is harmless. */
    protected watch(widget: Widget): void {
        widget.disposed.connect(this.forgetTab);
    }

    /**
     * TAB-05 (34-UI-SPEC): Pin puts the tab last in the pinned block, Unpin puts it first after the block (Firefox).
     * The block's order is the home pane TabBar's, so the pins lead the bar and List All Tabs and reorder see them first.
     */
    protected togglePin(widget: Widget): void {
        if (this.pinnedIds.delete(this.tabKey(widget))) {
            this.reorderTo(widget, this.shownTabs().find(tab => tab !== widget && !this.isPinned(tab)));
        } else {
            this.pinnedIds.add(this.tabKey(widget));
            this.watch(widget);
            this.reorderTo(widget, this.shownTabs().find(tab => !this.isPinned(tab)));
        }
        void this.savePins();
        this.update();
    }

    /**
     * TAB-05 (D-08): writes the pins, in strip order, to the shell-state map. Built from the open tabs, never from
     * pinnedIds alone, so the store holds only open tabs (T-34-05); a web tab carries its current page for reopening.
     */
    protected async savePins(): Promise<void> {
        if (!this.pinsRestored) {
            return;
        }
        const pinnedIds: PinnedTab[] = this.openTabs().filter(widget => this.pinnedIds.has(this.tabKey(widget)))
            .map(widget => ({ key: this.tabKey(widget), ...(widget instanceof WebTabWidget ? { url: widget.url } : {}) }));
        await this.storage.writePinnedIds(pinnedIds);
    }

    /**
     * TAB-05 (D-08, W1): after the launch restore, each stored pin re-pins the open tab whose own key it is. A web
     * tab that restore did not bring back reopens on its stored row key (WebTabOpenHandler.openUrl(url, rowKey), so
     * its rowKey and keyOf equal the stored key). A stored key no open tab carries is dropped. The pins then lead
     * the bar in stored order, and the tab that was current stays current.
     */
    protected async restorePins(): Promise<void> {
        const current = this.shell.mainPanel.currentTitle?.owner;
        const restored: Widget[] = [];
        try {
            for (const entry of await this.storage.readPinnedIds()) {
                let widget = this.openTabs().find(tab => this.tabKey(tab) === entry.key);
                if (!widget && entry.url && isHttp(entry.url)) {
                    widget = await this.opener.openUrl(entry.url, entry.key).catch(() => undefined);
                }
                if (widget && this.tabKey(widget) === entry.key && !restored.includes(widget)) {
                    this.pinnedIds.add(this.tabKey(widget));
                    this.watch(widget);
                    restored.push(widget);
                }
            }
            restored.forEach((widget, index) => this.moveInBar(widget, index));
            if (current && !current.isDisposed && restored.length) {
                await this.shell.activateWidget(current.id);
            }
        } catch (error) {
            console.error('[@powerbrowser/chrome-bar] restoring pinned tabs failed:', error instanceof Error ? error.name : typeof error);
        } finally {
            this.pinsRestored = true;
            void this.savePins();
            this.update();
        }
    }

    /** Closes each tab through the shell's own close path (D-14: no confirm; Phase 33's reopen is the undo). */
    protected async closeTabs(tabs: Widget[]): Promise<void> {
        for (const tab of tabs) {
            await this.shell.closeWidget(tab.id);
        }
    }

    /**
     * TAB-01 (34-01, D-03): right-click on a tab opens its menu at the pointer: one fresh CompoundMenuNode per
     * request, through the same ContextMenuRenderer path as the NAV-03 history menu. Theia draws a separator
     * around every group node, so the first group's rows sit at the root (the app-menu shape).
     */
    protected openTabMenu(widget: Widget, event: React.MouseEvent): void {
        event.preventDefault();
        event.stopPropagation();
        const groups: CommandMenu[][] = [];
        this.notice = undefined;
        // TAB-06: right-clicking a tab outside the selection drops the selection, as a plain click does.
        if (!this.selectedIds.has(this.tabKey(widget))) {
            this.selectedIds.clear();
            this.anchorKey = undefined;
        }
        this.update();
        for (const row of [...this.tabMenuRows(widget), ...this.bulkMenuRows(widget)]) {
            (groups[row.group] ??= []).push({
                id: `tab-menu-${row.id}`,
                label: row.label,
                icon: row.icon,
                sortString: String(groups[row.group].length).padStart(2, '0'),
                isVisible: () => true,
                isEnabled: () => row.enabled,
                isToggled: () => false,
                run: () => this.runTabRow(row, widget),
            });
        }
        const [first = [], ...rest] = groups.filter(group => group);
        const menu: CompoundMenuNode = {
            id: 'tab-menu',
            sortString: '0',
            isVisible: () => true,
            isEmpty: () => false,
            children: [
                ...first,
                ...rest.map((children, index): CompoundMenuNode => ({
                    id: `tab-menu-group-${index + 1}`,
                    sortString: String(index + 1).padStart(2, '0'),
                    isVisible: () => true,
                    isEmpty: () => children.length === 0,
                    children,
                })),
            ],
        };
        this.showMenu(menu, { x: event.clientX, y: event.clientY }, event.currentTarget as HTMLElement);
    }

    /**
     * One per-request menu through ContextMenuRenderer, a stock `.lm-Menu` (in the overlay's blocking-layer selector).
     * The renderer takes no class; the menu it just drew is marked so the sheet can size its rows.
     */
    protected showMenu(menu: CompoundMenuNode, anchor: { x: number; y: number }, context: HTMLElement, marks = 'pb-tab-menu'): void {
        const before = new Set(Array.from(document.querySelectorAll('.lm-Menu')));
        this.menus.render({ menuPath: TAB_MENU_PATH, menu, anchor, context, includeAnchorArg: false });
        for (const element of Array.from(document.querySelectorAll('.lm-Menu'))) {
            if (!before.has(element)) {
                element.classList.add(...marks.split(' '));
            }
        }
    }

    /** TAB-04 (D-07): the chevron iff the row's content is wider than the row; re-renders only on a change. */
    protected measureOverflow(): void {
        const row = this.node.querySelector<HTMLElement>('.pb-tab-strip-row');
        const overflowing = !!row && row.scrollWidth > row.clientWidth;
        if (overflowing !== this.overflowing) {
            this.overflowing = overflowing;
            this.update();
        }
    }

    /**
     * TAB-04 (D-07): List All Tabs, a second per-request menu under the chevron: every strip tab in strip order (the
     * TabBar's, so pinned tabs lead once 34-03 pins them), the current one checked. Picking a row activates that
     * tab and scrolls it into view. A row for a background tab whose title changed carries the Updated addition
     * (TAB-09): a stock menu row has no slot for the dot itself.
     */
    protected openListAllMenu(event: React.MouseEvent<HTMLElement>): void {
        event.preventDefault();
        event.stopPropagation();
        const current = this.shell.mainPanel.currentTitle?.owner;
        const children: CommandMenu[] = this.stripTabs(current).map((widget, index) => ({
            id: `tab-list-${index}`,
            label: this.isUpdated(widget, widget === current)
                ? CHROME_BAR_COPY.updatedTabTooltip(widget.title.label || widget.id)
                : widget.title.label || widget.id,
            icon: widget instanceof WebTabWidget ? `codicon ${widget.crashed ? 'codicon-warning' : 'codicon-globe'}` : widget.title.iconClass || undefined,
            sortString: String(index).padStart(4, '0'),
            isVisible: () => true,
            isEnabled: () => true,
            isToggled: () => widget === current,
            run: async () => {
                this.activateTab(widget);
                requestAnimationFrame(() => this.tabNode(widget)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
            },
        }));
        const box = event.currentTarget.getBoundingClientRect();
        this.showMenu(
            { id: 'tab-list-menu', sortString: '0', isVisible: () => true, isEmpty: () => children.length === 0, children },
            { x: box.left, y: box.bottom }, event.currentTarget, 'pb-tab-menu pb-tab-list-menu');
    }

    /**
     * TAB-03 (D-06): middle-click closes the tab through its close row (the shell's close path, with the close
     * failure sentence). Consumed: an unconsumed middle click runs Gecko's middle-click paste on the mouseup
     * (upstream EventStateManager::PostHandleMouseUp, dom/events/EventStateManager.cpp:6375-6407). The pill does the
     * same on its own middle press.
     */
    protected onTabAuxClick(widget: Widget, event: React.MouseEvent): void {
        if (event.button !== 1) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        const close = this.tabMenuRows(widget).find(row => row.id === 'close');
        if (close?.enabled) {
            void this.runRow(close);
        }
    }

    /** TAB-03 (D-06): a double-click on the strip's empty space opens a new tab; the New Tab command focuses the pill. */
    protected onStripDoubleClick(event: React.MouseEvent): void {
        if (event.target instanceof Element && event.target.closest('.pb-tab, .pb-tab-strip-notice')) {
            return;
        }
        void this.commands.executeCommand(CHROME_BAR_NEW_TAB_COMMAND_ID);
    }

    /** TAB-08: a link, file or text over the strip is taken; stopping here keeps Theia's document listener from refusing it. */
    protected onStripDragOver(event: React.DragEvent<HTMLElement>): void {
        if (!Array.from(event.dataTransfer.types).some(type => DROP_TYPES.includes(type))) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'copy';
    }

    /**
     * TAB-08 (D-06): an http(s) link dropped on the strip opens as a background tab at the drop position (the
     * midpoint rule). Other text searches through the pill, never a new tab. A file, or any other scheme
     * (javascript: included), is refused with the strip's failure sentence before anything loads.
     */
    protected async onStripDrop(event: React.DragEvent<HTMLElement>): Promise<void> {
        const types = Array.from(event.dataTransfer.types);
        if (!types.some(type => DROP_TYPES.includes(type))) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        this.notice = undefined;
        const payload = droppedTextOf(event.dataTransfer);
        const before = this.dropBefore(event.clientX);
        const link = types.includes('Files') || LINK_DRAG_TYPES.some(type => types.includes(type)) || SCHEME_ADDRESS.test(payload);
        if (isHttp(payload)) {
            await this.openDroppedLink(payload, before);
        } else if (!link && payload && this.searchDropped) {
            await this.searchDropped(payload);
        } else if (payload || link) {
            this.refuseDrop();
        }
    }

    /** TAB-08: the dropped http(s) link as a background tab, then moved to land before `before` (or last). */
    protected async openDroppedLink(url: string, before: Widget | undefined): Promise<void> {
        const tabs = this.shownTabs();
        const ref = before ?? tabs[tabs.length - 1];
        try {
            const widget = ref ? await this.opener.openInBackground(url, ref) : await this.opener.openUrl(url);
            await this.groups.joinActiveGroup(widget);
            this.reorderTo(widget, before);
        } catch (error) {
            console.error('[@powerbrowser/chrome-bar] opening a dropped link failed:', error instanceof Error ? error.name : typeof error);
            this.refuseDrop();
        }
    }

    protected refuseDrop(): void {
        this.notice = CHROME_BAR_COPY.dropTabFailed(appSubject());
        this.update();
    }

    /**
     * Press-and-move on a tab, up to the moment it becomes a drag.
     *
     * The gesture is pointer events rather than HTML5 drag-and-drop for the
     * reason the Organising canvas found on 2026-09-09: the whole Theia
     * frontend runs inside a remote content `<xul:browser>` and this chrome
     * window has no drag plumbing, so `dragstart` is followed immediately by
     * `dragend` and no `dragover` is ever dispatched -- everywhere in the
     * shell, not only over web content.
     *
     * Listeners go on `window`, not on the tab: any shell event re-renders
     * this widget and replaces the tab node mid-gesture, which would strand
     * the drag on a detached element.
     */
    /**
     * TAB-07 (D-10): the settled GUI-08 thumbnail of a tab: the tabs.thumbnail column as GroupModel's cards carry it
     * (projectSessionStoreTabs rows, with rememberThumbnail's session memory folded in). null when the tab has none
     * (a web tab on the empty page is never captured), undefined while no card for it is loaded. Never a capture
     * and never a TabPlacesRow: that row carries no thumbnail.
     */
    protected previewImage(widget: Widget): string | null | undefined {
        if (widget instanceof WebTabWidget && !widget.hasPage) {
            return null;
        }
        const key = this.tabKey(widget);
        const card = [...this.groups.listUngrouped(), ...this.groups.listGroups().flatMap(group => this.groups.getTabs(group.id))]
            .find(candidate => candidate.uri === key);
        if (!card) {
            return undefined;
        }
        return typeof card.thumbnail === 'string' && card.thumbnail.startsWith('data:image/') ? card.thumbnail : null;
    }

    /** TAB-07: hover starts the dwell. Never for a tab on screen: the active tab's page is already visible. */
    protected schedulePreview(widget: Widget, node: HTMLElement): void {
        this.closePreview();
        if (widget.isVisible) {
            return;
        }
        this.previewTimer = window.setTimeout(() => this.openPreview(widget, node), PREVIEW_DWELL_MS);
    }

    /**
     * TAB-07 (D-11): opens the card below the tab. The card is in BLOCKING_LAYER_SELECTOR (web-tab.ts), so the
     * overlay hides while it is open and never paints over it. Fixed, not absolute: the scrolling row clips its
     * children, so the anchor is the tab's own rect (its bottom plus 4px, the sheet's calc(100% + 4px)).
     */
    protected openPreview(widget: Widget, node: HTMLElement): void {
        this.previewTimer = undefined;
        if (!node.isConnected || widget.isVisible) {
            return;
        }
        const box = node.getBoundingClientRect();
        const current = this.shell.mainPanel.currentTitle?.owner;
        const refocus = current instanceof WebTabWidget && current.tabId === this.focusedPageTabId ? current : undefined;
        const resolving = this.previewImage(widget) === undefined;
        this.preview = { widget, left: Math.max(0, Math.min(box.left, window.innerWidth - 288)), top: box.bottom + 4, resolving, refocus };
        if (resolving) {
            // The tab may be newer than the loaded cards: one reload, then the image or the text card.
            void this.groups.scheduleReload().finally(() => {
                if (this.preview?.widget === widget) {
                    this.preview.resolving = false;
                    this.update();
                }
            });
        }
        this.update();
    }

    /** TAB-07: closes the card (pointer-leave, press, scroll, tab switch); the page gets focus back when it had it. */
    protected closePreview(refocus = true): void {
        window.clearTimeout(this.previewTimer);
        this.previewTimer = undefined;
        const open = this.preview;
        if (!open) {
            return;
        }
        this.preview = undefined;
        this.update();
        if (refocus) {
            open.refocus?.focusPage();
        }
    }

    /** TAB-07 (D-10): image (or the skeleton while it resolves) plus title plus URL; aria-hidden, a tooltip equivalent. */
    protected renderPreview(preview: NonNullable<TabStripWidget['preview']>): React.ReactNode {
        const { widget } = preview;
        const image = this.previewImage(widget);
        const url = widget instanceof WebTabWidget && widget.hasPage ? widget.url : undefined;
        return <div className='pb-tab-preview' aria-hidden='true' style={{ left: preview.left, top: preview.top }}>
            {image
                ? <img className='pb-tab-preview-image' src={image} alt='' />
                : preview.resolving && <div className='pb-tab-preview-image is-shimmer' />}
            <div className='pb-tab-preview-title'>{widget.title.label || widget.id}</div>
            {url && <div className='pb-tab-preview-url'>{url}</div>}
        </div>;
    }

    protected beginDrag(widget: Widget, event: React.PointerEvent): void {
        if (event.button !== 0) {
            return;
        }
        // Without this the press starts a native text selection that runs
        // from the tab label across the strip and on into the page, so a drag
        // left a trail of highlighted tab titles and page text behind it.
        // Worse than untidy: Gecko will then drag the SELECTION, and the
        // parent chrome window treats a dropped URL as "open this", so the
        // gesture could open a page in a stock browser window instead of
        // splitting the pane. The Organising canvas carries the same
        // preventDefault on its card presses for the same two reasons.
        //
        // Safe for the click: preventing a pointerdown's default suppresses
        // the compatibility mouse events, not `click` -- so single click to
        // activate a tab still works.
        event.preventDefault();
        const tab = event.currentTarget as HTMLElement;
        const box = tab.getBoundingClientRect();
        const startX = event.clientX;
        const startY = event.clientY;
        // TAB-02 (D-05): a strip tab (not a stacked one) first reorders within the row; leaving the row hands the
        // same gesture to the dock drag below, unchanged.
        const row = this.mainTabs().includes(widget) ? tab.closest<HTMLElement>('.pb-tab-strip-row') : null;
        let reordering = false;
        let pointerX = startX;
        let edge = 0;
        let frame = 0;

        // A reorder still ends in a pointerup over some tab; the click that follows would activate it.
        const swallowClick = (click: MouseEvent) => {
            click.stopPropagation();
            click.preventDefault();
        };
        const stop = () => {
            window.removeEventListener('pointermove', move, true);
            window.removeEventListener('pointerup', up, true);
            window.removeEventListener('pointercancel', stop, true);
            cancelAnimationFrame(frame);
            if (reordering) {
                window.setTimeout(() => window.removeEventListener('click', swallowClick, true), 0);
                this.reorder = undefined;
                this.update();
            }
        };
        // 8px edge zones scroll the row while the pointer rests there, re-aiming the drop as the tabs pass under it.
        const scroll = () => {
            frame = 0;
            if (row && reordering && edge) {
                row.scrollLeft += edge * EDGE_STEP;
                this.aimReorder(widget, pointerX);
                frame = requestAnimationFrame(scroll);
            }
        };
        const move = (moved: PointerEvent) => {
            if (!reordering && Math.abs(moved.clientX - startX) < DRAG_THRESHOLD
                && Math.abs(moved.clientY - startY) < DRAG_THRESHOLD) {
                return;
            }
            const bounds = row?.getBoundingClientRect();
            if (!row || !bounds || moved.clientY < bounds.top || moved.clientY > bounds.bottom) {
                stop();
                this.startWidgetDrag(widget, tab, box, moved);
                return;
            }
            if (!reordering) {
                reordering = true;
                window.addEventListener('click', swallowClick, true);
            }
            pointerX = moved.clientX;
            edge = pointerX < bounds.left + EDGE_ZONE ? -1 : pointerX > bounds.right - EDGE_ZONE ? 1 : 0;
            this.aimReorder(widget, pointerX);
            if (edge && !frame) {
                frame = requestAnimationFrame(scroll);
            }
        };
        const up = () => {
            const aim = this.reorder;
            stop();
            if (aim?.moves) {
                this.reorderTo(aim.widget, aim.before);
            }
        };
        window.addEventListener('pointermove', move, true);
        window.addEventListener('pointerup', up, true);
        window.addEventListener('pointercancel', stop, true);
    }

    /** A strip tab's node, by the widget id it is rendered with. */
    protected tabNode(widget: Widget): HTMLElement | undefined {
        return Array.from(this.node.querySelectorAll<HTMLElement>('.pb-tab[data-pb-tab]'))
            .find(node => node.dataset.pbTab === widget.id);
    }

    /**
     * TAB-02 (D-05): the midpoint rule. The drop lands before the first strip tab whose horizontal midpoint is past
     * `x`; past every midpoint, it lands after the last tab (undefined).
     */
    protected dropBefore(x: number): Widget | undefined {
        return this.shownTabs().find(tab => {
            const box = this.tabNode(tab)?.getBoundingClientRect();
            return !!box && box.left + box.width / 2 > x;
        });
    }

    /** TAB-02: aims the in-flight reorder at the pointer and repaints the 2px drop indicator. */
    protected aimReorder(widget: Widget, x: number): void {
        const before = this.dropBefore(x);
        const tabs = this.shownTabs();
        const at = tabs.indexOf(widget);
        // Before itself or before its right neighbour, or after the last tab when it is the last: nowhere new.
        const moves = before ? before !== widget && tabs[at + 1] !== before : at !== tabs.length - 1;
        if (this.reorder?.widget !== widget || this.reorder.before !== before || this.reorder.moves !== moves) {
            this.reorder = { widget, before, moves };
            this.update();
        }
    }

    /**
     * TAB-02 (D-05): puts `widget` before `before` in the strip, or after the strip's last tab, by moving its title
     * in the home pane TabBar (insertTab through moveInBar). The strip may hide some of that bar's tabs (PAN-03,
     * the stack), so the index is the bar's, not the strip's. Never touches the dock's layout.
     */
    protected reorderTo(widget: Widget, before: Widget | undefined): void {
        const titles = this.primaryBar()?.titles ?? [];
        const from = titles.indexOf(widget.title);
        const tabs = this.shownTabs();
        const anchor = before ?? tabs[tabs.length - 1];
        if (from < 0 || !anchor) {
            return;
        }
        const target = titles.indexOf(anchor.title);
        // Lumino moves the title to exactly the index given, so the index shifts by the slot the title vacates.
        this.moveInBar(widget, before ? (from < target ? target - 1 : target) : (from > target ? target + 1 : target));
    }

    /**
     * Hand the gesture to Lumino and let the dock do the rest.
     *
     * Everything from here -- the drop-zone hit testing, the edge thirds that
     * mean split-left/right/top/bottom, the overlay that previews where the
     * pane will land, the actual `addWidget(widget, {mode, ref})` -- is
     * `DockPanel`'s own machinery, reached by starting the same `Drag` its
     * tab bars start. This is deliberately not a reimplementation: the dock
     * accepts one mime type and we speak it, so split behaviour here is by
     * construction the same behaviour Coding mode's real tab bars have.
     *
     * The drag image is a clone rather than the tab itself for the usual
     * reason -- the original stays in place, and a re-render is free to
     * replace it without touching what the user is dragging.
     */
    protected startWidgetDrag(widget: Widget, tab: HTMLElement, box: DOMRect, event: PointerEvent): void {
        const mimeData = new MimeData();
        mimeData.setData(WIDGET_FACTORY_MIME, () => widget);

        const dragImage = tab.cloneNode(true) as HTMLElement;
        // Lumino positions the image with a fixed-position translate to the
        // pointer, so these offsets are what keep the grab point under the
        // cursor instead of pinning the tab's top-left to it.
        dragImage.style.top = `-${event.clientY - box.top}px`;
        dragImage.style.left = `-${event.clientX - box.left}px`;
        dragImage.style.width = `${box.width}px`;

        const drag = new Drag({
            document,
            mimeData,
            dragImage,
            proposedAction: 'move',
            supportedActions: 'move',
            source: this,
        });

        // A completed drag still ends in a pointerup over some tab, and the
        // click that follows would activate whatever it landed on. One-shot,
        // capture phase, cleared on the next turn of the loop so a genuine
        // click after the drag still works.
        const swallowClick = (click: MouseEvent) => {
            click.stopPropagation();
            click.preventDefault();
        };
        window.addEventListener('click', swallowClick, true);

        tab.classList.add('is-dragging');
        // Wrapped so a drag that is ended before start() returns -- which
        // leaves it holding null -- still runs the cleanup below instead of
        // throwing and leaving the tab dimmed and the click swallowed.
        void Promise.resolve(drag.start(event.clientX, event.clientY)).then(() => {
            tab.classList.remove('is-dragging');
            window.setTimeout(() => window.removeEventListener('click', swallowClick, true), 0);
            this.update();
        });
    }

    /** The tabs the strip shows, in order, given the current widget. */
    protected stripTabs(current: Widget | undefined): Widget[] {
        const tabs = this.mainTabs().filter(widget => this.groups.showsInStrip(widget, current));
        // TAB-05: the pinned block leads, whatever a drag did to the bar order.
        return [...tabs.filter(tab => this.isPinned(tab)), ...tabs.filter(tab => !this.isPinned(tab))];
    }

    /** The tabs the strip shows right now. The current widget decides membership (PAN-03), never a menu's target. */
    protected shownTabs(): Widget[] {
        return this.stripTabs(this.shell.mainPanel.currentTitle?.owner);
    }

    /**
     * KEY-03: the order the tab-switching keys walk, which is the order the
     * user sees: the strip in Browsing when it lists `anchor`, otherwise the
     * main-area tab bar holding `anchor`.
     */
    switchOrder(anchor: Widget): Widget[] {
        if (document.body.getAttribute(MODE_ATTRIBUTE) === 'browsing') {
            const tabs = this.stripTabs(this.shell.mainPanel.currentTitle?.owner);
            if (tabs.includes(anchor)) {
                return tabs;
            }
        }
        const bar = this.shell.mainPanel.findTabBar(anchor.title);
        return (bar ? bar.titles.map(title => title.owner) : [])
            .filter(widget => !TabStripWidget.MODE_SURFACES.includes(widget.id));
    }

    protected render(): React.ReactNode {
        const current = this.shell.mainPanel.currentTitle?.owner;
        const tabs = this.stripTabs(current);
        const stack = this.stackWidgets();
        // The home bar shows only stacked tabs; the rest are the strip's.
        // Said on the title, which the bar renders as a class on its tab.
        // Walked over EVERY main-area tab, not just the home pane's: the
        // class has to come off a tab the moment it is dragged into another
        // pane, or that pane's bar hides it too -- the pill listed three
        // stacked tabs while the right pane showed none (2026-09-10).
        // Only this strip's two classes are toggled: Theia keeps its own
        // state (theia-mod-dirty, -pinned, -active) in the same string.
        const home = this.homeWidgets();
        for (const widget of this.shell.mainPanel.widgets()) {
            const kept = widget.title.className.split(' ')
                .filter(c => c && c !== STRIP_ONLY_CLASS && c !== GROUP_CLOSING_CLASS);
            if (home.includes(widget) && !this.stacked.has(widget)) {
                kept.push(STRIP_ONLY_CLASS);
            }
            if (this.groups.isClosingKey(this.groups.keyOf(widget))) {
                kept.push(GROUP_CLOSING_CLASS);
            }
            widget.title.className = kept.join(' ');
        }
        return <>{<div
            className='pb-tab-strip-row'
            role='tablist'
            aria-multiselectable={true}
            title={CHROME_BAR_COPY.emptyStripTooltip}
            onDoubleClick={event => this.onStripDoubleClick(event)}
            onDragEnter={event => this.onStripDragOver(event)}
            onDragOver={event => this.onStripDragOver(event)}
            onDrop={event => { void this.onStripDrop(event); }}
            onScroll={() => this.closePreview()}
        >
            {/* TAB-05: the pinned block, sticky at the row's start with a separator after it, so pins never scroll away. */}
            {tabs.some(tab => this.isPinned(tab)) && <div className='pb-tab-pinned-block' role='presentation'>
                {tabs.filter(tab => this.isPinned(tab)).map(widget => this.renderTab(widget, widget === current, widget === tabs[tabs.length - 1]))}
            </div>}
            {tabs.filter(tab => !this.isPinned(tab)).map(widget => this.renderTab(widget, widget === current, widget === tabs[tabs.length - 1]))}
            {stack.length > 0 && <div
                role='tab'
                aria-selected={!this.collapsed}
                title={stack.map(widget => widget.title.label || widget.id).join(' · ')}
                className={'pb-tab pb-tab-stack' + (this.collapsed ? '' : ' is-active')}
                onClick={() => this.activateStack()}
            >
                <span className='pb-tab-stack-glyph' aria-hidden='true'>⧉</span>
                {stack.map(widget => <span
                    key={widget.id}
                    className='pb-tab-stack-item'
                    title={widget.title.label || widget.id}
                    onPointerDown={event => this.beginDrag(widget, event)}
                >{widget.title.label || widget.id}</span>)}
                <span
                    className='pb-tab-close pb-tab-stack-exit'
                    role='button'
                    aria-label='Close split view'
                    title='Close split view'
                    onClick={event => { event.stopPropagation(); this.dissolve(); }}
                    onPointerDown={event => event.stopPropagation()}
                >✕</span>
            </div>}
            {this.notice && <span className='pb-tab-strip-notice' role='status'>{this.notice}</span>}
        </div>}
        {this.overflowing && <button
            className='pb-tab-strip-chevron codicon codicon-list-selection'
            type='button'
            title={CHROME_BAR_COPY.listAllTabs}
            aria-label={CHROME_BAR_COPY.listAllTabs}
            onClick={event => this.openListAllMenu(event)}
            onPointerDown={event => event.stopPropagation()}
        />}
        {this.preview && this.renderPreview(this.preview)}
        <AfterRender run={() => this.measureOverflow()} />
        </>;
    }

    /**
     * Phase 32 plan 08 (PAGE-04, PAGE-11): a crashed web tab shows the crash mark; otherwise its pushed favicon
     * (a bounded data: icon, never fetched), else the globe. Showing an icon never touches the network.
     */
    protected renderTabIcon(widget: WebTabWidget): React.ReactNode {
        if (widget.crashed) {
            return <span className='codicon codicon-warning pb-tab-crashed' role='img' aria-label={CRASHED_COPY} title={CRASHED_COPY} />;
        }
        const image = safeIcon(widget.favicon);
        return image
            ? <img className='pb-tab-favicon' src={image} alt='' />
            : <span className='codicon codicon-globe pb-tab-favicon' aria-hidden='true' />;
    }

    /** TAB-09 (D-12): chrome's attention flag, shown only on a background tab; activating the tab hides it at once. */
    protected isUpdated(widget: Widget, active: boolean): boolean {
        return widget instanceof WebTabWidget && widget.titleChanged && !active;
    }

    protected renderTab(widget: Widget, active: boolean, last: boolean): React.ReactNode {
        const label = widget.title.label || widget.id;
        const pinned = this.isPinned(widget);
        const updated = this.isUpdated(widget, active);
        const name = pinned ? CHROME_BAR_COPY.pinnedTabLabel(label) : label;
        const selected = this.selectedIds.has(this.tabKey(widget));
        // TAB-02: the reorder's dragged tab, and the 2px drop indicator before the target or after the last tab.
        const aim = this.reorder;
        const drag = aim?.widget === widget ? ' is-dragging' : '';
        const drop = !aim?.moves ? '' : aim.before === widget ? ' is-drop-before' : !aim.before && last ? ' is-drop-after' : '';
        return <div
            key={widget.id}
            role='tab'
            aria-selected={active || selected}
            title={updated ? CHROME_BAR_COPY.updatedTabTooltip(label) : label}
            aria-label={updated ? CHROME_BAR_COPY.updatedTabLabel(name) : pinned ? name : undefined}
            data-pb-tab={widget.id}
            className={'pb-tab' + (active ? ' is-active' : '') + (pinned ? ' is-pinned' : '') + (selected ? ' is-selected' : '') + drag + drop}
            onClick={event => this.onTabClick(widget, event)}
            onPointerDown={event => { this.closePreview(false); this.beginDrag(widget, event); }}
            onPointerEnter={event => this.schedulePreview(widget, event.currentTarget)}
            onPointerLeave={() => this.closePreview()}
            onMouseDown={event => { if (event.button === 1) { event.preventDefault(); } }}
            onAuxClick={event => this.onTabAuxClick(widget, event)}
            onContextMenu={event => this.openTabMenu(widget, event)}
        >
            {widget instanceof WebTabWidget
                ? this.renderTabIcon(widget)
                : pinned && <span className={'pb-tab-favicon ' + (widget.title.iconClass || 'codicon codicon-file')} aria-hidden='true' />}
            <span className='pb-tab-title'>{label}</span>
            {/* TAB-09: the 6px accent attention dot; its words are in the tooltip and the accessible name. */}
            {updated && <span className='pb-tab-attention' aria-hidden='true' />}
            {/* Phase 32 plan 02 (PAGE-05): the audio mark. Muted-ink when muted; its click is the one tab mute affordance. */}
            {widget instanceof WebTabWidget && (widget.soundPlaying || widget.audioMuted) && <span
                className={'pb-tab-audio' + (widget.audioMuted ? ' is-muted' : '')}
                role='button'
                aria-label={widget.audioMuted ? CHROME_BAR_COPY.unmuteTab : CHROME_BAR_COPY.muteTab}
                title={widget.audioMuted ? CHROME_BAR_COPY.unmuteTab : CHROME_BAR_COPY.muteTab}
                onClick={event => {
                    event.stopPropagation();
                    void widget.setMuted(!widget.audioMuted);
                }}
                onPointerDown={event => event.stopPropagation()}
            >
                <span className={'codicon ' + (widget.audioMuted ? 'codicon-mute' : 'codicon-unmute')} />
            </span>}
            {widget.title.closable && !pinned && <span
                className='pb-tab-close'
                role='button'
                aria-label={`Close ${label}`}
                onClick={event => this.closeTab(widget, event)}
                // Otherwise the press bubbles to the tab and a slip of
                // the hand on Close starts dragging the tab instead.
                onPointerDown={event => event.stopPropagation()}
            >✕</span>}
        </div>;
    }
}

/**
 * A saved dock arrangement minus the tabs closed since it was saved, with the
 * survivors collected. Restore would otherwise be handed disposed widgets.
 */
function prune(area: DockPanel.ILayoutConfig['main'], kept: Set<Widget>): DockPanel.ILayoutConfig['main'] {
    if (!area) {
        return null;  // eslint-disable-line no-null/no-null
    }
    if (area.type === 'tab-area') {
        const widgets = area.widgets.filter(widget => !widget.isDisposed);
        if (!widgets.length) {
            return null;  // eslint-disable-line no-null/no-null
        }
        widgets.forEach(widget => kept.add(widget));
        return { ...area, widgets, currentIndex: Math.min(area.currentIndex, widgets.length - 1) };
    }
    const pairs = area.children
        .map((child, index) => ({ child: prune(child, kept), size: area.sizes[index] }))
        .filter(pair => pair.child);
    if (!pairs.length) {
        return null;  // eslint-disable-line no-null/no-null
    }
    if (pairs.length === 1) {
        return pairs[0].child;
    }
    return { ...area, children: pairs.map(pair => pair.child!), sizes: pairs.map(pair => pair.size) };
}
