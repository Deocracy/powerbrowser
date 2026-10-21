import * as React from '@theia/core/shared/react';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { ApplicationShell, ReactWidget, Widget } from '@theia/core/lib/browser';
import { DisposableCollection } from '@theia/core/lib/common/disposable';
import { Drag } from '@theia/core/shared/@lumino/dragdrop';
import { MimeData } from '@theia/core/shared/@lumino/coreutils';
import { Message } from '@theia/core/shared/@lumino/messaging';
import { DockPanel, TabBar } from '@theia/core/shared/@lumino/widgets';
import { GroupModel } from '@powerbrowser/modes/lib/browser/group-model';
import { MODE_ATTRIBUTE } from '@powerbrowser/modes/lib/browser/mode-attribute';

/** Marks a home-pane tab that the strip lists, so the pane's own bar does not. */
const STRIP_ONLY_CLASS = 'pb-strip-only';

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
 * click. Small on purpose: this strip sits in the top panel with nothing to
 * reorder within itself, so unlike Lumino's own tab bar there is no in-bar
 * reorder phase to get through first -- every drag here is heading for the
 * dock. Lumino's tab bar makes you pull 20px clear of the bar before it will
 * start a drag at all, which is the wrong feel for a strip that is already
 * outside the thing you are dropping into.
 */
const DRAG_THRESHOLD = 5;

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
        ]);
        this.shell.mainPanel.onDidChangeCurrent(() => this.update());
        // A split moves a tab between panes without adding or removing it,
        // and which pane a tab is in is exactly what this strip now shows.
        this.shell.mainPanel.layoutModified.connect(() => this.update());
        this.update();
    }

    override dispose(): void {
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
    }

    protected override onBeforeDetach(msg: Message): void {
        this.node.removeEventListener('lm-dragenter', this.onDragEnter);
        this.node.removeEventListener('lm-dragover', this.onDragOver);
        this.node.removeEventListener('lm-dragleave', this.onDragLeave);
        this.node.removeEventListener('lm-drop', this.onDrop);
        this.shell.mainPanel.node.removeEventListener('lm-drop', this.onDockDrop);
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

        const stop = () => {
            window.removeEventListener('pointermove', move, true);
            window.removeEventListener('pointerup', stop, true);
        };
        const move = (moved: PointerEvent) => {
            if (Math.abs(moved.clientX - startX) < DRAG_THRESHOLD
                && Math.abs(moved.clientY - startY) < DRAG_THRESHOLD) {
                return;
            }
            stop();
            this.startWidgetDrag(widget, tab, box, moved);
        };
        window.addEventListener('pointermove', move, true);
        window.addEventListener('pointerup', stop, true);
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
        return this.mainTabs().filter(widget => this.groups.showsInStrip(widget, current));
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
        return <div className='pb-tab-strip-row' role='tablist'>
            {tabs.map(widget => this.renderTab(widget, widget === current))}
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
        </div>;
    }

    protected renderTab(widget: Widget, active: boolean): React.ReactNode {
        const label = widget.title.label || widget.id;
        return <div
            key={widget.id}
            role='tab'
            aria-selected={active}
            title={label}
            className={'pb-tab' + (active ? ' is-active' : '')}
            onClick={() => this.activateTab(widget)}
            onPointerDown={event => this.beginDrag(widget, event)}
        >
            <span className='pb-tab-title'>{label}</span>
            {widget.title.closable && <span
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
