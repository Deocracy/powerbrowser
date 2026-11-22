/**
 * GUI-08: the Panorama organising widget.
 *
 * Plain-Widget (placeholder idiom -- NOT React; drag needs direct DOM
 * transforms) owning the organising slot behind the same
 * `registerOrganisingSlot` seam. Canvas and tree are two render roots over
 * the ONE GroupModel: flipping the toggle never reloads and never loses
 * selection.
 *
 * Groups tile their cards to fill the box, then stack them behind Expand
 * once the tiles would be too small. Ungrouped tabs are loose cards on the
 * canvas, each at its own position. Card drags use pointer events, not
 * HTML5 drag and drop (no `draggable`). A group resizes from eight grips and
 * pushes its neighbours away. Esc cancels a geometry gesture with its paint
 * reverted and nothing further persisted. Zoom is a pure view transform:
 * bounds and card data are untouched, nothing persists.
 *
 * Copy: contracted 15-UI-SPEC.md strings verbatim; no placeholder copy
 * survives. Names render as textContent, never innerHTML.
 */

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import {
    ApplicationShell,
    Message,
    StatusBar,
    StatusBarAlignment,
    Widget,
} from '@theia/core/lib/browser';
import { WebTabWidget } from '@powerbrowser/tab-uris/lib/browser/web-tab';
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { GroupQueryService } from '@powerbrowser/tab-uris/lib/browser/group-query-service';
import pDebounce from 'p-debounce';
import { registerOrganisingSlot } from './mode-descriptors';
import { MODE_ATTRIBUTE } from './mode-attribute';
import { ModeService } from './mode-service';
import { GroupActorClient } from './group-actor-client';
import { GroupModel, GROUP_BOX_MIN_H, GROUP_BOX_MIN_W, GROUP_TITLE_MAX_CHARS, LiveTab, PanoramaGroup, PanoramaTab } from './group-model';
import { buildTreeSection } from './organising-tree';
import { fitTiles, TILE_ASPECT, TILE_GAP } from './organising-tiling';
import { pushAway } from './organising-geometry';
import { PANORAMA_CLOSE_GROUP_COMMAND_ID, PANORAMA_NEW_GROUP_COMMAND_ID, PANORAMA_UNDO_CLOSE_GROUP_COMMAND_ID } from './panorama-commands';
import { PanoramaCommandHandler } from './panorama-commands';
// Resolved through src/, not './', because the build is `tsc -b` alone: tsc
// emits no CSS into lib/, so a lib-relative specifier resolves to a file that
// is never written and the frontend bundle fails to build. Same form as the
// chrome-bar extension's stylesheet import, which is the working precedent.
import '../../src/browser/modes.css';

type OrganisingView = 'canvas' | 'tree';

/** Pointer travel before a card press becomes a drag rather than a click. */
const CARD_DRAG_THRESHOLD = 4;

/** Rectangle below which a canvas drag was a click on the background. */
const GROUP_DRAW_MIN = 30;

/** Cards drawn in a stack before the rest are represented by the count. */
const STACK_VISIBLE = 5;
/** Loose tabs drawn in the end-of-row pile before the count stands in. */
const PILE_VISIBLE = 4;
/** Size of a loose tab on the canvas. */
const LOOSE_W = 160;
const LOOSE_H = Math.round(LOOSE_W * TILE_ASPECT);
/** Margin kept between the auto-placed line and the canvas edges. */
const LOOSE_MARGIN = 16;
/** Marks a push-away rectangle as a loose tab rather than a group. */
const LOOSE_BOX_PREFIX = 'tab:';

/** The mode id `body[data-pb-mode]` carries while the canvas is showing. */
const ORGANISING_MODE_ID = 'organising';

/** Settle before photographing a tab, so switching quickly captures once. */
const SHELL_CAPTURE_SETTLE_MS = 700;

/** The Undo Close Group control's fade-out before its window ends; equals its CSS opacity transition. */
const UNDO_FADE_MS = 150;

/**
 * The eight resize grips, named by compass point. `n`/`w` move the box's
 * origin as well as its size -- growing upward means the top edge travels and
 * the bottom stays put -- which is why resize carries a base position now and
 * not only a base size.
 */
const BOX_EDGES = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as const;
type BoxEdge = (typeof BOX_EDGES)[number];
/** Pixels each stacked card is offset from the one in front of it. */
const STACK_OFFSET = 4;

const ZOOM_STEPS = [25, 50, 75, 100, 125, 150, 200];
const DEFAULT_ZOOM_INDEX = 3;

@injectable()
export class OrganisingWidget extends Widget {
    static readonly ID = 'powerbrowser.modes.organising';

    @inject(GroupModel)
    protected readonly model: GroupModel;

    @inject(GroupActorClient)
    protected readonly actor: GroupActorClient;

    @inject(GroupQueryService)
    protected readonly reader: GroupQueryService;

    @inject(StatusBar)
    protected readonly statusBar: StatusBar;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(ModeService)
    protected readonly modes: ModeService;

    protected view: OrganisingView = 'canvas';
    /** The group whose stack is open over the canvas, if any. */
    protected expandedGroupId: string | undefined;
    /** The group a card is hovering over, and the slot it has opened in it. */
    protected dropPreviewGroupId: string | undefined;
    protected dropPreviewIndex = 0;
    protected zoomIndex = DEFAULT_ZOOM_INDEX;
    protected editingGroupId: string | undefined;
    protected suppressRender = false;
    protected moveState: { id: string; startX: number; startY: number; baseX: number; baseY: number } | undefined;
    protected dragCard: { uri: string; fromGroup: string | null } | undefined;
    /** Invalidates trailing debounced persists (Esc cancel, gesture end). */
    protected geometrySeq = 0;

    protected readonly debouncedMove = pDebounce((id: string, x: number, y: number, seq: number) => this.persistMove(id, x, y, seq), 150);
    protected readonly debouncedResize = pDebounce((id: string, w: number, h: number, seq: number) => this.persistResize(id, w, h, seq), 150);

    protected toolbar!: HTMLElement;
    /** The toolbar as a top-panel row; see `placeToolbar`. */
    protected toolbarRow!: Widget;
    protected canvasToggle!: HTMLButtonElement;
    protected treeToggle!: HTMLButtonElement;
    protected zoomCluster!: HTMLElement;
    protected zoomReadout!: HTMLElement;
    protected loadBar!: HTMLElement;
    protected saveBar!: HTMLElement;
    protected canvasHost!: HTMLElement;
    protected canvasLayer!: HTMLElement;
    protected canvasRoot!: HTMLElement;
    protected treeRoot!: HTMLElement;
    protected expandRoot!: HTMLElement;

    constructor() {
        super();
        this.id = OrganisingWidget.ID;
        this.title.label = 'Organising';
        this.title.closable = false;
        this.addClass('pb-modes-organising');
        // Only identity and the injection-free static DOM belong here.
        // Everything reading an @inject'ed property moved to @postConstruct
        // below: inversify assigns property injections AFTER the constructor
        // returns, so `this.model` was undefined at this point and the
        // constructor threw `Cannot read properties of undefined (reading
        // 'onDidChange')`. The throw surfaced nowhere because the only caller
        // is openView(), whose promise every caller voids -- so Organising
        // mode collapsed the panels and then rendered nothing at all.
        this.buildStaticDom();
    }

    /**
     * Runs once, after inversify has satisfied every @inject above. The model
     * subscription, the first paint, and the group load all read injected
     * collaborators and therefore cannot run any earlier.
     */
    @postConstruct()
    protected init(): void {
        this.model.onDidChange(() => {
            if (!this.suppressRender) {
                this.render();
            }
        });
        // Esc closes an expanded stack, as it does every other gesture here.
        this.node.addEventListener('keydown', event => {
            if (event.key === 'Escape' && this.expandedGroupId) {
                event.stopPropagation();
                this.collapseStack();
            }
        });
        this.render();
        void this.initialize();
    }

    /**
     * The canvas is a view of the OPEN tabs, so it follows the dock rather
     * than being read once at construction.
     *
     * Subscribed HERE and not in `@postConstruct`, and that placement is
     * load-bearing. This widget is created by the shell's own layout
     * restorer, so at construction time `ApplicationShell` is still being
     * built -- touching it there is a dependency cycle. It went unnoticed
     * while Organising was not the restored view, and hung frontend startup
     * outright once it was: layout initialisation never finished, so the
     * workbench never appeared. By `onAfterAttach` the shell is a complete
     * object.
     */
    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        if (!this.watchingShell) {
            this.watchingShell = true;
            // The model reloads itself on add and remove (PAN-03).
            this.shell.onDidAddWidget(widget => this.holdTheMainArea(widget));
            this.shell.onDidChangeCurrentWidget(() => this.scheduleShellCapture());
        }
        // Its own flag, not isVisible: a restored widget attaches before the
        // shell does, so isVisible reads false and no onAfterShow follows.
        this.placeToolbar(!this.isHidden);
        this.scheduleReload();
    }

    protected override onBeforeDetach(msg: Message): void {
        this.placeToolbar(false);
        super.onBeforeDetach(msg);
    }

    protected override onBeforeHide(msg: Message): void {
        this.placeToolbar(false);
        super.onBeforeHide(msg);
    }

    /**
     * The toolbar is the first top-panel row while the canvas shows, above the
     * URL row, so the URL row sits second in every mode -- under the strip in
     * Browsing, the menubar in Coding, this in Organising -- and does not move
     * on a switch. Index 0 puts it above the chrome bar; the top panel stacks
     * its children in order.
     */
    protected placeToolbar(show: boolean): void {
        if (show && this.toolbarRow.parent !== this.shell.topPanel) {
            this.shell.topPanel.insertWidget(0, this.toolbarRow);
        } else if (!show && this.toolbarRow.parent) {
            this.toolbarRow.parent = null;
        }
    }

    /**
     * Re-read on every entry to Organising: a tab opened, closed or navigated
     * while another mode was showing lands here.
     */
    protected override onAfterShow(msg: Message): void {
        super.onAfterShow(msg);
        this.placeToolbar(true);
        this.scheduleReload();
    }

    protected watchingShell = false;

    /**
     * Photographs the current tab while it is still on screen, so its card has
     * a picture of how it last looked.
     *
     * Only tabs that are NOT pages. A web tab is a chrome-owned page and
     * chrome already captures it properly; everything else -- the Welcome
     * view, an editor, a terminal -- is a Theia widget drawn inside the shell
     * frame, which chrome can photograph as a rectangle of that frame.
     *
     * It has to happen while the tab is showing, which is why it rides the
     * current-widget change and not the switch INTO Organising: by the time
     * the canvas is up, the tab it would photograph is behind it. Delayed a
     * moment so a burst of tab switching does not fire a capture per tab.
     */
    protected scheduleShellCapture(): void {
        window.clearTimeout(this.captureTimer);
        this.captureTimer = window.setTimeout(() => {
            const widget = this.shell.currentWidget;
            if (!widget || widget === this || widget instanceof WebTabWidget) {
                return;
            }
            if (![...this.shell.mainPanel.widgets()].includes(widget)) {
                return;
            }
            const box = widget.node.getBoundingClientRect();
            if (box.width < 8 || box.height < 8) {
                return;
            }
            const uri = this.model.keyOf(widget);
            void this.actor.mutate({
                kind: 'captureShellRegion',
                rect: {
                    x: Math.round(box.left),
                    y: Math.round(box.top),
                    w: Math.round(box.width),
                    h: Math.round(box.height),
                },
            }).then(reply => {
                const png = (reply as { png?: unknown }).png;
                if (typeof png === 'string' && png) {
                    this.model.rememberThumbnail(uri, png);
                }
            }).catch(error => {
                // A preview is a nicety; losing one must not surface as a
                // save error, and the card keeps its text fallback.
                console.error('[@powerbrowser/modes] shell capture failed:', error);
            });
        }, SHELL_CAPTURE_SETTLE_MS);
    }

    protected captureTimer = 0;

    /**
     * Organising stays on screen when a tab is opened from inside it.
     *
     * Both the canvas and a web tab are main-area widgets, so Theia does the
     * ordinary thing and activates the newcomer -- which slid the whole
     * organising surface out from under the user the moment they pressed "+".
     * The mode was still Organising, so the shell showed a bare tab with none
     * of Organising's furniture and no way back to the canvas: the mode screen
     * looked broken because the mode had lost its screen.
     *
     * Opening a tab from the canvas means "add this to what I am arranging",
     * not "take me to it", so the canvas takes the main area back. Only while
     * Organising is the active mode -- in any other mode the newcomer is
     * exactly what the user asked to see.
     */
    protected holdTheMainArea(widget: Widget): void {
        if (widget === this || document.body.getAttribute(MODE_ATTRIBUTE) !== ORGANISING_MODE_ID) {
            return;
        }
        if (![...this.shell.mainPanel.widgets()].includes(widget)) {
            return;
        }
        // After the shell's own activation of the new widget, not before it.
        window.setTimeout(() => {
            if (document.body.getAttribute(MODE_ATTRIBUTE) === ORGANISING_MODE_ID) {
                void this.shell.activateWidget(OrganisingWidget.ID);
            }
        }, 0);
    }

    /**
     * Coalesced: opening a setup adds several widgets in one turn, and each
     * would otherwise run its own pair of round trips.
     */
    protected readonly scheduleReload = pDebounce(() => this.initialize(), 120);

    /**
     * The tabs the shell has open, in the shape `GroupModel.load` joins on.
     *
     * EVERY main-area tab, not only web tabs. Restricting this to pages with
     * an http(s) URL was the first attempt and it was wrong twice over: four
     * New Tabs sitting on the empty page were invisible, and so was the
     * Welcome page, which is a Theia widget rather than a web tab. A tab is a
     * tab -- if it has a tab in the strip it has a card on the canvas.
     *
     * Every tab is keyed by `tabKeyOf` (GroupModel.keyOf), the store's own row
     * key, so a New Tab, an editor or a terminal keeps its group and place
     * across a restart like a page does; there are no session-only keys.
     *
     * Organising itself is excluded: it lives in the main area because that is
     * where a full-window surface goes, but it is a mode, not something the
     * user opened -- the same exclusion `TabStripWidget.MODE_SURFACES` makes.
     */
    protected liveTabs(): LiveTab[] {
        // Guarded for the same reason the subscriptions moved to attach time:
        // the very first load can run while the shell is still assembling, and
        // an exception thrown out of here would take frontend startup with it.
        // An empty answer just means "no tabs yet", and the next reload fixes
        // it.
        if (!this.shell?.mainPanel) {
            return [];
        }
        return this.model.liveTabs([...this.shell.mainPanel.widgets()].filter(widget => widget !== this));
    }

    // PanoramaCommandHandler surface (delegated by the contribution below).

    async createNewGroup(at?: { x: number; y: number; w?: number; h?: number }, capture: readonly string[] = []): Promise<void> {
        try {
            const group = await this.model.createGroup(this.actor, at);
            // Tabs the drawn box enclosed come in with it. Drawing a box
            // around loose tabs IS how you group them; making the box and
            // then dragging each tab into it would be the same gesture twice.
            for (const uri of capture) {
                try {
                    await this.model.moveCard(this.actor, uri, group.id);
                } catch (error) {
                    console.error('[@powerbrowser/modes] band capture failed:', error);
                }
            }
            this.editingGroupId = group.id;
            await this.separateGroups(group.id);
            this.focusRename(group.id);
        } catch (error) {
            console.error('[@powerbrowser/modes] new-group failed:', error);
            this.render();
        }
    }

    async closeGroupById(id: string): Promise<void> {
        // PAN-06: the last visible group stays: no flash, no Undo.
        if (!this.model.canCloseGroup(id)) {
            return;
        }
        try {
            // No confirmation (22-UI-SPEC A1): the close is reversible from the Undo control,
            // and the model's timer or the quit flush writes it.
            const closed = await this.model.closeGroup(this.actor, id);
            if (closed) {
                await this.flash(`Group "${closed.name}" closed.`);
            }
            this.render();
            if (closed) {
                this.focusUndo(id);
            }
        } catch (error) {
            console.error('[@powerbrowser/modes] close-group failed:', error);
            this.render();
        }
    }

    async undoCloseGroupById(id: string): Promise<void> {
        if (!this.model.undoCloseGroup(id)) {
            return;
        }
        // The restored box keeps its bounds; anything now overlapping them moves clear.
        await this.separateGroups(id);
        const at = CSS.escape(id);
        const root = this.view === 'canvas' ? this.canvasRoot : this.treeRoot;
        (root.querySelector(`[data-g="${at}"] .pb-org-box-title, [data-g="${at}"] .pb-org-tree-title`) as HTMLElement | null)?.focus();
    }

    protected focusUndo(id: string): void {
        const root = this.view === 'canvas' ? this.canvasRoot : this.treeRoot;
        (root.querySelector(`.pb-org-undo[data-closing="${CSS.escape(id)}"]`) as HTMLElement | null)?.focus();
    }

    showCanvasView(): void {
        this.view = 'canvas';
        this.render();
    }

    showTreeView(): void {
        this.view = 'tree';
        this.render();
    }

    async retrySave(): Promise<void> {
        try {
            await this.model.retryPending(this.actor);
        } catch (error) {
            console.error('[@powerbrowser/modes] group save retry failed:', error);
        }
        this.render();
    }

    // Loading.

    protected async initialize(): Promise<void> {
        try {
            await this.model.load(this.reader, this.liveTabs());
        } catch (error) {
            console.error('[@powerbrowser/modes] group load failed:', error);
        }
        this.render();
    }

    // Rendering: one model, two roots (canvas and tree); loose cards are
    // drawn on the canvas.

    protected render(): void {
        if (this.suppressRender) {
            return;
        }
        // A rebuild drops focus; keep it on an Undo control, or send it to New Group once that window has ended.
        const active = document.activeElement;
        const undoFocus = active instanceof HTMLElement && active.classList.contains('pb-org-undo') && this.node.contains(active)
            ? active.dataset.closing
            : undefined;
        // PAN-05: a focused card keeps focus across a rebuild (a reload after a keyboard close).
        const cardFocus = active instanceof HTMLElement && active.classList.contains('pb-org-card') && this.node.contains(active)
            ? { key: active.dataset.u, expanded: !!active.closest('.pb-org-expand-cards') }
            : undefined;
        this.renderToolbar();
        this.renderBars();
        this.renderCanvas();
        this.renderTree();
        this.renderExpanded();
        const again = cardFocus?.key === undefined ? null : (cardFocus.expanded ? this.expandRoot : this.canvasRoot)
            .querySelector(`.pb-org-card[data-u="${CSS.escape(cardFocus.key)}"]`) as HTMLElement | null;
        if (again) {
            this.focusCard(again);
        }
        if (undoFocus !== undefined) {
            if (this.model.isClosing(undoFocus)) {
                this.focusUndo(undoFocus);
            } else {
                (this.toolbar.querySelector('.pb-org-new') as HTMLElement | null)?.focus();
            }
        }
    }

    protected renderToolbar(): void {
        this.canvasToggle.classList.toggle('is-active', this.view === 'canvas');
        this.canvasToggle.setAttribute('aria-pressed', this.view === 'canvas' ? 'true' : 'false');
        this.treeToggle.classList.toggle('is-active', this.view === 'tree');
        this.treeToggle.setAttribute('aria-pressed', this.view === 'tree' ? 'true' : 'false');
        this.zoomCluster.hidden = this.view !== 'canvas';
        this.zoomReadout.textContent = `${ZOOM_STEPS[this.zoomIndex]}%`;
        this.canvasHost.hidden = this.view !== 'canvas';
        this.treeRoot.hidden = this.view !== 'tree';
    }

    protected renderBars(): void {
        const loading = !this.model.isLoaded && !this.model.hasLoadFailed;
        this.loadBar.hidden = loading || !this.model.hasLoadFailed;
        this.saveBar.hidden = !this.model.hasPendingWrite;
    }

    protected renderCanvas(): void {
        this.canvasLayer.style.transform = `scale(${ZOOM_STEPS[this.zoomIndex] / 100})`;
        // The canvas is the placement surface, so it has to BE the visible
        // area: loose tabs sit on a line near its bottom, and a canvas shorter
        // than its host would put that line outside itself.
        this.canvasRoot.style.minHeight = `${Math.max(320, this.canvasInner().h)}px`;
        while (this.canvasRoot.firstChild) {
            this.canvasRoot.removeChild(this.canvasRoot.firstChild);
        }
        if (!this.model.isLoaded) {
            for (let i = 0; i < 2; i += 1) {
                const ghost = document.createElement('div');
                ghost.className = 'pb-org-skeleton';
                ghost.setAttribute('aria-hidden', 'true');
                this.canvasRoot.append(ghost);
            }
            return;
        }
        const groups = this.model.listGroups();
        if (groups.length === 0) {
            const empty = this.buildEmpty(
                'No tab groups',
                'There are no tab groups yet — choose New Group, or drag across the canvas to draw one.',
                true
            );
            this.canvasRoot.append(empty);
            this.renderUndo();
            // In a short host the bottom line would run through the in-flow panel.
            this.renderLoose(empty.offsetTop + empty.offsetHeight + LOOSE_MARGIN);
            return;
        }
        for (const group of groups) {
            this.canvasRoot.append(this.buildBox(group));
        }
        this.renderUndo();
        this.renderLoose();
        this.tileCards();
    }

    /**
     * The host's content box: clientWidth/clientHeight include its padding,
     * and the canvas sits inside that padding, so sizing the canvas from
     * them made it taller than the visible area and scrolled it.
     */
    protected canvasInner(): { w: number; h: number } {
        const style = getComputedStyle(this.canvasHost);
        return {
            w: this.canvasHost.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0),
            h: this.canvasHost.clientHeight - (parseFloat(style.paddingTop) || 0) - (parseFloat(style.paddingBottom) || 0),
        };
    }

    /**
     * Loose tabs -- the ones in no group -- drawn ON the canvas rather than in
     * a strip below it. They are canvas objects like a group box: they have a
     * position, they keep it, and nothing overlaps them.
     *
     * A tab that has never been placed has no position to keep, so the canvas
     * gives it one: a line along the bottom, filling left to right. Past what
     * fits on that line the rest pile up at its end under a count, so a
     * hundred loose tabs still occupy one line's worth of canvas instead of
     * covering it.
     */
    protected renderLoose(minTop = 0): void {
        const tabs = this.model.listUngrouped();
        if (!tabs.length) {
            return;
        }
        const inner = this.canvasInner();
        const width = Math.max(LOOSE_W + LOOSE_MARGIN * 2, inner.w);
        const height = Math.max(LOOSE_H + LOOSE_MARGIN * 2, inner.h);
        const line = Math.max(minTop, height - LOOSE_H - LOOSE_MARGIN);
        if (line + LOOSE_H + LOOSE_MARGIN > height) {
            // Pushed below the host: grow the canvas so the line is still on it (the host scrolls).
            this.canvasRoot.style.minHeight = `${line + LOOSE_H + LOOSE_MARGIN}px`;
        }
        const room = Math.max(1, Math.floor((width - LOOSE_MARGIN * 2 + TILE_GAP) / (LOOSE_W + TILE_GAP)));
        const unplaced = tabs.filter(tab => tab.x === undefined || tab.y === undefined);
        const inLine = unplaced.length <= room ? unplaced.length : Math.max(1, room - 1);
        let slot = 0;

        for (let i = 0; i < tabs.length; i += 1) {
            const tab = tabs[i];
            const card = this.buildCard(tab, null, i === 0);
            card.classList.add('is-loose');
            card.style.width = `${LOOSE_W}px`;
            card.style.height = `${LOOSE_H}px`;
            if (tab.x !== undefined && tab.y !== undefined) {
                card.style.left = `${tab.x}px`;
                card.style.top = `${tab.y}px`;
                this.canvasRoot.append(card);
                continue;
            }
            const index = slot;
            slot += 1;
            if (index < inLine) {
                card.style.left = `${LOOSE_MARGIN + index * (LOOSE_W + TILE_GAP)}px`;
                card.style.top = `${line}px`;
            } else {
                const depth = index - inLine;
                card.classList.toggle('is-piled', depth > 0);
                card.hidden = depth >= PILE_VISIBLE;
                card.style.left = `${LOOSE_MARGIN + inLine * (LOOSE_W + TILE_GAP) + depth * STACK_OFFSET}px`;
                card.style.top = `${line + depth * STACK_OFFSET}px`;
                card.style.zIndex = `${PILE_VISIBLE - depth}`;
            }
            this.canvasRoot.append(card);
        }

        if (unplaced.length > inLine) {
            const count = document.createElement('div');
            count.className = 'pb-org-pile-count';
            count.textContent = String(unplaced.length - inLine);
            count.style.left = `${LOOSE_MARGIN + inLine * (LOOSE_W + TILE_GAP) + LOOSE_W - 30}px`;
            count.style.top = `${line + LOOSE_H - 22}px`;
            count.setAttribute('aria-hidden', 'true');
            this.canvasRoot.append(count);
        }
    }

    /**
     * Panorama's `_gridArrange`: every card in a group is the same size, and
     * that size is the largest one at which they ALL fit. Resizing the group
     * re-packs them; it never produces a scrollbar.
     *
     * Before this the cards were a fixed 220px in a wrapping flex row, so a
     * group narrower than two cards became a single column that scrolled --
     * which defeats the canvas, because a scrolled group hides exactly the
     * tabs you opened it to see.
     *
     * Measured from the laid-out node rather than computed from the model's
     * w/h minus constants for padding, border, header and margin: four
     * numbers copied out of the stylesheet is four ways to drift from it.
     * This runs after the boxes are in the DOM, so the content box is real.
     *
     * The scrolling fallback survives for the one case a grid cannot serve:
     * so many cards that even the floor size overflows. Stacking is what
     * Panorama does there and it is W8, not this change.
     */
    protected tileCards(): void {
        // Every group is measured before any is written. This runs on every
        // resize and drag step, and reading the next group's size after the
        // last one's writes forced a reflow per group per step. Each box has
        // its own fixed size and its cards are out of flow once tiled, so no
        // group's writes change another group's size.
        const measured = (Array.from(this.canvasRoot.querySelectorAll('.pb-org-box-cards')) as HTMLElement[])
            .map(host => ({ host, width: host.clientWidth, height: host.clientHeight }));
        for (const { host, width, height } of measured) {
            const cards = Array.from(host.querySelectorAll('.pb-org-card')) as HTMLElement[];
            // A card hovering over this group is already counted in: the grid
            // re-packs to make room and a translucent slot shows where it
            // lands. Showing the destination beats outlining the target --
            // an outline says "here", a gap that opens says "here, like this".
            const group = (host.closest('.pb-org-box') as HTMLElement | null)?.dataset.g;
            const previewing = group !== undefined && group === this.dropPreviewGroupId;
            let slot = host.querySelector('.pb-org-drop-slot') as HTMLElement | null;
            if (!previewing) {
                slot?.remove();
                slot = null;
            } else if (!slot) {
                slot = document.createElement('div');
                slot.className = 'pb-org-drop-slot';
                slot.setAttribute('aria-hidden', 'true');
                host.append(slot);
            }
            const total = cards.length + (previewing ? 1 : 0);
            if (!total) {
                continue;
            }
            const cell = fitTiles(total, width, height);
            if (!cell) {
                slot?.remove();
                this.stackCards(host, cards, width, height);
                continue;
            }
            host.classList.remove('is-stacked');
            host.querySelector('.pb-org-stack-count')?.remove();
            host.querySelector('.pb-org-expander')?.remove();
            if (slot) {
                const index = Math.max(0, Math.min(total - 1, this.dropPreviewIndex));
                slot.style.left = `${(index % cell.cols) * (cell.w + TILE_GAP)}px`;
                slot.style.top = `${Math.floor(index / cell.cols) * (cell.h + TILE_GAP)}px`;
                slot.style.width = `${cell.w}px`;
                slot.style.height = `${cell.h}px`;
            }
            // Cards step over the slot rather than through it: everything at
            // or after the insertion point shifts one place along, which is
            // what "the tabs move to let it in" looks like.
            cards.forEach((card, position) => {
                const index = previewing && position >= Math.max(0, Math.min(total - 1, this.dropPreviewIndex))
                    ? position + 1
                    : position;
                const column = index % cell.cols;
                const row = Math.floor(index / cell.cols);
                card.classList.add('is-tiled');
                card.classList.remove('is-stacked-card');
                card.hidden = false;
                card.style.transform = '';
                card.style.zIndex = '';
                card.style.left = `${column * (cell.w + TILE_GAP)}px`;
                card.style.top = `${row * (cell.h + TILE_GAP)}px`;
                card.style.width = `${cell.w}px`;
                card.style.height = `${cell.h}px`;
            });
        }
    }

    /**
     * Panorama's `_stackArrange`: a group too small to grid its cards fans
     * them into a stack with a count and an expand control, rather than
     * clipping or scrolling them. It is the other half of "never scroll" --
     * without it the grid has to give up somewhere, and giving up meant a
     * scrollbar hiding the tabs the canvas exists to show.
     *
     * `boxW` and `boxH` are the host's client size, measured by tileCards before any write.
     */
    protected stackCards(host: HTMLElement, cards: HTMLElement[], boxW: number, boxH: number): void {
        host.classList.add('is-stacked');
        const spread = STACK_OFFSET * (Math.min(cards.length, STACK_VISIBLE) - 1);
        const w = Math.max(40, Math.min(boxW - spread - 16, Math.floor((boxH - spread - 26) / TILE_ASPECT), 170));
        const h = Math.max(30, Math.round(w * TILE_ASPECT));
        const left = Math.max(0, Math.round((boxW - w - spread) / 2));
        const top = Math.max(0, Math.round((boxH - h - spread) / 2) - 6);
        cards.forEach((card, index) => {
            card.classList.add('is-tiled');
            // Only the front card takes the pointer: the ones behind it are
            // not reachable, and letting them answer a hit test would drop a
            // drag onto a card the user cannot see.
            card.classList.toggle('is-stacked-card', index > 0);
            card.hidden = index >= STACK_VISIBLE;
            card.style.left = `${left + index * STACK_OFFSET}px`;
            card.style.top = `${top + index * STACK_OFFSET}px`;
            card.style.width = `${w}px`;
            card.style.height = `${h}px`;
            card.style.zIndex = `${STACK_VISIBLE - index}`;
        });

        // tileCards runs on every drag step and press without a rebuild, so
        // the badge and the Expand control are reused, never appended again.
        let badge = host.querySelector('.pb-org-stack-count') as HTMLElement | null;
        if (!badge) {
            badge = document.createElement('div');
            badge.className = 'pb-org-stack-count';
            badge.setAttribute('aria-hidden', 'true');
            host.append(badge);
        }
        badge.textContent = String(cards.length);
        if (host.querySelector('.pb-org-expander')) {
            return;
        }

        const expander = document.createElement('button');
        expander.type = 'button';
        expander.className = 'pb-org-expander';
        expander.textContent = 'Expand';
        const group = host.closest('.pb-org-box') as HTMLElement | null;
        expander.addEventListener('pointerdown', event => event.stopPropagation());
        expander.addEventListener('click', event => {
            event.stopPropagation();
            this.expandedGroupId = group?.dataset.g;
            this.render();
            // The render removed this button; focus goes into the overlay so
            // Esc (heard on the widget node) and Tab work there.
            (this.expandRoot.querySelector('.pb-org-expand-done') as HTMLElement | null)?.focus();
        });
        host.append(expander);
    }

    /**
     * The expanded stack: every card in the group at a readable size, over
     * the canvas. Rendered on the widget node rather than inside the canvas
     * so the zoom transform does not shrink the one view whose whole purpose
     * is being big enough to read.
     */
    protected renderExpanded(): void {
        this.expandRoot.textContent = '';
        const group = this.expandedGroupId
            ? this.model.listGroups().find(candidate => candidate.id === this.expandedGroupId)
            : undefined;
        this.expandRoot.hidden = !group;
        if (!group) {
            return;
        }
        const panel = document.createElement('div');
        panel.className = 'pb-org-expand-panel';
        const heading = document.createElement('div');
        heading.className = 'pb-org-expand-heading';
        heading.textContent = group.title;
        const done = document.createElement('button');
        done.type = 'button';
        done.className = 'pb-org-expand-done theia-button';
        done.textContent = 'Done';
        done.addEventListener('click', () => this.collapseStack());
        const cards = document.createElement('div');
        cards.className = 'pb-org-expand-cards';
        const tabs = this.model.getTabs(group.id);
        for (let i = 0; i < tabs.length; i += 1) {
            cards.append(this.buildCard(tabs[i], group.id, i === 0));
        }
        panel.append(heading, done, cards);
        this.expandRoot.append(panel);
        this.expandRoot.onclick = event => {
            if (event.target === this.expandRoot) {
                this.collapseStack();
            }
        };
    }

    protected collapseStack(): void {
        const id = this.expandedGroupId;
        this.expandedGroupId = undefined;
        this.render();
        if (id) {
            (this.canvasRoot.querySelector(`[data-g="${CSS.escape(id)}"] .pb-org-expander`) as HTMLElement | null)?.focus();
        }
    }

    protected renderTree(): void {
        while (this.treeRoot.firstChild) {
            this.treeRoot.removeChild(this.treeRoot.firstChild);
        }
        if (!this.model.isLoaded) {
            return;
        }
        const groups = this.model.listGroups();
        const closing = this.model.listClosing();
        if (groups.length === 0) {
            this.treeRoot.append(this.buildEmpty(
                'No tab groups',
                'There are no tab groups yet — choose New Group to start one.',
                true
            ));
            this.treeRoot.append(...closing.map(entry => this.buildUndo(entry)));
            return;
        }
        const sections: HTMLElement[] = groups.map(group => this.buildSection(group));
        // Each pending group's control sits in its section's place in group order.
        for (const entry of closing) {
            sections.splice(Math.min(entry.index, sections.length), 0, this.buildUndo(entry));
        }
        this.treeRoot.append(...sections);
    }

    /**
     * PAN-04: one Undo Close Group control per group in its undo window, centred in
     * the group's stored bounds on the zoomed layer. It carries no `data-g`, so it is
     * no drop target and takes no part in push-away.
     */
    protected renderUndo(): void {
        for (const entry of this.model.listClosing()) {
            const undo = this.buildUndo(entry);
            undo.style.position = 'absolute';
            undo.style.left = `${entry.group.x + entry.group.w / 2}px`;
            undo.style.top = `${entry.group.y + entry.group.h / 2}px`;
            undo.style.transform = 'translate(-50%, -50%)';
            this.canvasRoot.append(undo);
        }
    }

    /** The Undo Close Group control, one builder for canvas and tree (22-01 C1 items 1 and 2). */
    protected buildUndo(entry: { group: PanoramaGroup; deadline: number }): HTMLButtonElement {
        const id = entry.group.id;
        const undo = document.createElement('button');
        undo.type = 'button';
        undo.className = 'pb-org-undo';
        undo.dataset.command = PANORAMA_UNDO_CLOSE_GROUP_COMMAND_ID;
        undo.dataset.closing = id;
        undo.textContent = 'Undo Close Group';
        undo.title = `Undo Close Group "${entry.group.title}"`;
        undo.setAttribute('aria-label', `Undo Close Group "${entry.group.title}"`);
        // No band starts on it.
        undo.addEventListener('pointerdown', event => event.stopPropagation());
        undo.addEventListener('click', event => {
            event.stopPropagation();
            void this.undoCloseGroupById(id);
        });
        undo.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                event.stopPropagation();
                void this.undoCloseGroupById(id);
            }
        });
        const leaveIn = entry.deadline - UNDO_FADE_MS - Date.now();
        if (leaveIn > 0) {
            window.setTimeout(() => undo.classList.add('is-leaving'), leaveIn);
        } else {
            undo.classList.add('is-leaving');
        }
        return undo;
    }

    // Canvas pieces.

    protected buildBox(group: PanoramaGroup): HTMLElement {
        const box = document.createElement('div');
        box.className = `pb-org-box${group.isActive ? ' is-active' : ''}`;
        box.dataset.g = group.id;
        box.style.transform = `translate(${group.x}px, ${group.y}px)`;
        box.style.width = `${group.w}px`;
        box.style.height = `${group.h}px`;

        const header = document.createElement('div');
        header.className = 'pb-org-box-header';
        if (this.editingGroupId === group.id) {
            header.append(this.buildRename(group));
        } else {
            const title = document.createElement('span');
            title.className = 'pb-org-box-title';
            title.textContent = group.title;
            title.title = group.title;
            title.tabIndex = 0;
            title.addEventListener('dblclick', () => this.startRename(group.id));
            title.addEventListener('keydown', event => {
                if (event.key === 'Enter') {
                    this.startRename(group.id);
                }
            });
            header.append(title);
        }
        // PAN-06: the last visible group has no ×; the title widens into the space.
        if (this.model.canCloseGroup(group.id)) {
            const close = document.createElement('button');
            close.type = 'button';
            close.className = 'pb-org-box-close';
            close.dataset.command = PANORAMA_CLOSE_GROUP_COMMAND_ID;
            close.textContent = '×';
            close.title = 'Close group';
            close.setAttribute('aria-label', 'Close group');
            close.addEventListener('click', event => {
                event.stopPropagation();
                void this.closeGroupById(group.id);
            });
            header.append(close);
        }
        header.addEventListener('pointerdown', event => this.beginBoxMove(event, group));
        header.addEventListener('click', () => {
            void this.activateGroup(group.id);
        });
        // Field-background click (anywhere in the box that is not a control)
        // marks the group active too; the close button and rename input stop
        // propagation, and card dives already activate, so this is idempotent.
        box.addEventListener('click', () => {
            void this.activateGroup(group.id);
        });
        box.append(header);

        const cards = document.createElement('div');
        cards.className = 'pb-org-box-cards';
        const tabs = this.model.getTabs(group.id);
        if (tabs.length === 0) {
            const hint = document.createElement('div');
            hint.className = 'pb-org-box-empty';
            hint.textContent = 'Empty group — drag tabs here.';
            cards.append(hint);
        }
        for (let i = 0; i < tabs.length; i += 1) {
            cards.append(this.buildCard(tabs[i], group.id, i === 0));
        }
        box.append(cards);

        // Every side and every corner resizes, not just the bottom-right.
        // Reaching for the one corner meant dragging the box into position
        // first just to be able to grow it; a box you can take by any edge is
        // a box you can shape where it already is. The corner keeps the
        // visible grip, the keyboard entry point and the slider semantics --
        // the edges are invisible hit strips, as they are in every window
        // manager.
        for (const edge of BOX_EDGES) {
            const grip = document.createElement('div');
            grip.className = `pb-org-box-grip pb-org-box-grip-${edge}`;
            grip.dataset.edge = edge;
            if (edge === 'se') {
                grip.classList.add('pb-org-box-resize');
                grip.setAttribute('aria-label', 'Resize group');
                grip.title = 'Resize group';
                grip.tabIndex = 0;
                grip.setAttribute('role', 'slider');
                grip.setAttribute('aria-valuemin', String(GROUP_BOX_MIN_W));
                grip.setAttribute('aria-valuenow', String(group.w));
                grip.setAttribute('aria-valuetext', `${group.w} by ${group.h} pixels`);
                grip.addEventListener('keydown', event => this.stepBoxResize(event, group.id));
            }
            grip.addEventListener('pointerdown', event => this.beginBoxResize(event, group, edge));
            box.append(grip);
        }

        return box;
    }

    protected buildCard(tab: PanoramaTab, groupId: string | null, tabbable = true): HTMLElement {
        const card = document.createElement('div');
        card.className = 'pb-org-card';
        card.dataset.u = tab.uri;
        // No `draggable`: see beginCardDrag for why HTML5 drag cannot work here.
        card.tabIndex = tabbable ? 0 : -1;
        // A tiled card has no room for the address line, so the tooltip
        // carries it. Both are real addresses; neither is an internal key.
        card.title = tab.url ? `${tab.title}\n${tab.url}` : tab.title;
        // The preview is the card. A page you can recognise at a glance is
        // the whole reason the canvas beats a list, so it leads and the text
        // follows it.
        //
        // Not everything CAN be previewed. A thumbnail is captured from a
        // chrome-owned page, so a New Tab on the empty page has nothing to
        // capture yet, and the Welcome view -- a Theia widget rendered inside
        // the frame rather than a page in a browser element -- can never have
        // one at all. Those cards used to be a blank hatched panel, which
        // tells you nothing about which tab you are looking at. They now put
        // the tab's own name in the space the preview would have filled.
        if (tab.thumbnail) {
            const shot = document.createElement('img');
            shot.className = 'pb-org-card-thumb';
            shot.alt = '';
            shot.draggable = false;
            shot.addEventListener('error', () => {
                shot.replaceWith(this.buildBlankPreview(tab));
            });
            shot.src = tab.thumbnail;
            card.append(shot);
        } else {
            card.append(this.buildBlankPreview(tab));
        }

        const title = document.createElement('div');
        title.className = 'pb-org-card-title';
        title.textContent = tab.title;
        title.title = tab.title;
        card.append(title);
        // The address line only ever carries a real address. A tab with no
        // page of its own is keyed by an internal id, and no internal
        // identifier may appear in user-facing text (CLAUDE.md), so the line
        // is absent rather than filled with the key.
        if (tab.url) {
            const uri = document.createElement('div');
            uri.className = 'pb-org-card-uri';
            uri.textContent = tab.url;
            uri.title = tab.url;
            card.append(uri);
        }
        // A single click does NOT open the tab. Cards are things you arrange,
        // and arranging means pressing them constantly -- opening on every
        // press made the canvas hostile to the one activity it exists for.
        // Double click opens, which is the desktop idiom for "go to this".
        card.addEventListener('dblclick', () => this.dive(tab, groupId));
        card.addEventListener('keydown', event => {
            if (event.key === 'Enter') {
                this.dive(tab, groupId);
            } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                event.preventDefault();
                this.moveCardFocus(card, 1);
            } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                event.preventDefault();
                this.moveCardFocus(card, -1);
            } else if (event.key === 'Delete') {
                event.preventDefault();
                void this.closeCardFrom(card, tab, groupId, true);
            }
        });
        card.addEventListener('pointerdown', event => this.beginCardDrag(event, card, tab, groupId));
        // PAN-05 (A9): a pointer target only; Delete is the keyboard close, so each scope keeps one tab stop.
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'pb-org-card-close';
        close.tabIndex = -1;
        close.textContent = '×';
        close.title = 'Close tab';
        close.setAttribute('aria-label', 'Close tab');
        // No drag starts and no dive opens from the ×, as on the strip's close.
        close.addEventListener('pointerdown', event => event.stopPropagation());
        close.addEventListener('dblclick', event => event.stopPropagation());
        close.addEventListener('click', event => {
            event.stopPropagation();
            void this.closeCardFrom(card, tab, groupId, false);
        });
        card.append(close);
        return card;
    }

    /**
     * PAN-05: closes a card's tab (`GroupModel.closeCard`). After a keyboard
     * close focus moves to the next card in the scope, else the previous, else
     * the box title (group) or New Group (loose). The expanded-stack panel
     * closes once its last card goes.
     */
    protected async closeCardFrom(card: HTMLElement, tab: PanoramaTab, groupId: string | null, keyboard: boolean): Promise<void> {
        const scope = this.cardScope(card);
        const at = scope.indexOf(card);
        const nextKey = (scope[at + 1] ?? scope[at - 1])?.dataset.u;
        const expanded = !!card.closest('.pb-org-expand-cards');
        const loose = card.classList.contains('is-loose');
        let closed: boolean;
        try {
            closed = await this.model.closeCard(this.actor, tab);
        } catch (error) {
            console.error('[@powerbrowser/modes] closing a tab from its card failed:', error instanceof Error ? error.name : typeof error);
            this.render();
            return;
        }
        if (!closed) {
            return;
        }
        if (expanded && groupId !== null && !this.model.getTabs(groupId).length) {
            this.expandedGroupId = undefined;
        }
        this.render();
        if (!keyboard) {
            return;
        }
        const inScope = expanded ? '.pb-org-expand-cards ' : loose ? '' : `[data-g="${CSS.escape(groupId ?? '')}"] .pb-org-box-cards `;
        const next = nextKey === undefined ? null : (expanded ? this.expandRoot : this.canvasRoot)
            .querySelector(`${inScope}.pb-org-card${loose ? '.is-loose' : ''}[data-u="${CSS.escape(nextKey)}"]`) as HTMLElement | null;
        if (next) {
            this.focusCard(next);
            return;
        }
        const fallback = groupId !== null
            ? this.canvasRoot.querySelector(`[data-g="${CSS.escape(groupId)}"] .pb-org-box-title`)
            : this.toolbar.querySelector('.pb-org-new');
        (fallback as HTMLElement | null)?.focus();
    }

    /** The preview panel for a tab that has no capture: its name, plainly. */
    protected buildBlankPreview(tab: PanoramaTab): HTMLElement {
        const panel = document.createElement('div');
        panel.className = 'pb-org-card-thumb is-blank';
        const label = document.createElement('span');
        label.className = 'pb-org-card-blank-label';
        label.textContent = tab.title;
        panel.append(label);
        return panel;
    }

    /**
     * Tree sections render through the widget-owned tree module over the
     * single GroupModel: the widget supplies the data plus its own
     * callbacks, so the tree holds no fetch and no selection of its own.
     * Flipping the toggle never reloads and never loses selection.
     */
    protected buildSection(group: PanoramaGroup): HTMLElement {
        return buildTreeSection(group, this.model.getTabs(group.id), {
            renderTitle: target => this.editingGroupId === target.id
                ? this.buildRename(target)
                : this.buildTreeTitle(target),
            closeCommandId: PANORAMA_CLOSE_GROUP_COMMAND_ID,
            closable: this.model.canCloseGroup(group.id),
            activateGroup: id => {
                void this.activateGroup(id);
            },
            closeGroup: id => {
                void this.closeGroupById(id);
            },
            dive: (tab, groupId) => this.dive(tab, groupId),
        });
    }

    /** Tree group title: identical rename entry to the canvas box title. */
    protected buildTreeTitle(group: PanoramaGroup): HTMLElement {
        const title = document.createElement('span');
        title.className = 'pb-org-tree-title';
        title.textContent = group.title;
        title.title = group.title;
        title.tabIndex = 0;
        title.addEventListener('dblclick', () => this.startRename(group.id));
        title.addEventListener('keydown', event => {
            if (event.key === 'Enter') {
                this.startRename(group.id);
            }
        });
        return title;
    }

    protected buildEmpty(heading: string, body: string, withAction: boolean): HTMLElement {
        const wrap = document.createElement('div');
        wrap.className = 'pb-org-empty';
        const title = document.createElement('div');
        title.className = 'pb-org-empty-heading';
        title.textContent = heading;
        const text = document.createElement('div');
        text.className = 'pb-org-empty-body';
        text.textContent = body;
        wrap.append(title, text);
        if (withAction) {
            const action = document.createElement('button');
            action.type = 'button';
            action.className = 'pb-org-empty-action theia-button';
            action.textContent = 'New Group';
            action.addEventListener('click', () => {
                void this.createNewGroup();
            });
            wrap.append(action);
        }
        return wrap;
    }

    protected buildRename(group: PanoramaGroup): HTMLElement {
        const input = document.createElement('input');
        input.className = 'pb-org-rename';
        input.type = 'text';
        input.value = group.title;
        input.maxLength = 60;
        input.placeholder = 'Group name';
        input.setAttribute('aria-label', 'Group name');
        // Pasted overflow is cut at the cap before commit (maxLength already
        // truncates typed and pasted text natively; this covers the rest).
        input.addEventListener('input', () => {
            if (input.value.length > GROUP_TITLE_MAX_CHARS) {
                input.value = input.value.slice(0, GROUP_TITLE_MAX_CHARS);
            }
        });
        let settled = false;
        const commit = (): void => {
            if (settled) {
                return;
            }
            settled = true;
            this.editingGroupId = undefined;
            void this.model.commitTitle(this.actor, group.id, input.value).catch(error => {
                console.error('[@powerbrowser/modes] group rename failed:', error);
            }).finally(() => this.render());
        };
        const cancel = (): void => {
            if (settled) {
                return;
            }
            settled = true;
            this.editingGroupId = undefined;
            this.render();
        };
        input.addEventListener('keydown', event => {
            event.stopPropagation();
            if (event.key === 'Enter') {
                commit();
            } else if (event.key === 'Escape') {
                cancel();
            }
        });
        input.addEventListener('blur', commit);
        input.addEventListener('pointerdown', event => event.stopPropagation());
        input.addEventListener('click', event => event.stopPropagation());
        return input;
    }

    // Gestures.

    /**
     * A press somewhere else COMMITS a rename in flight. It is never a reason
     * to refuse the press.
     *
     * Drawing a group ends by opening its name field, so `editingGroupId` is
     * set after every single draw. All three canvas gestures used to bail
     * while it was set, which made the press right after drawing a group a
     * dead press -- no band, no capture, no listeners, and nothing on screen
     * to say why.
     *
     * It looked like "I have to click twice" rather than "it is broken"
     * because the dead press still un-jammed the next one, by accident: the
     * guard returned BEFORE `preventDefault`, so Gecko went on to do its
     * ordinary focus fixup, focus left the name field, `blur` fired `commit`,
     * and `commit` cleared the flag. Press one paid for press two. And since
     * press two drew a group, it re-armed the flag -- so the toll was charged
     * again on every group, forever.
     *
     * Committing here rather than relying on that accident matters now that
     * these gestures call `preventDefault`: preventing the default is exactly
     * what suppresses the focus fixup, so removing the guard alone would have
     * left the name field open and the typed name unsaved.
     */
    protected settleRename(): void {
        if (this.editingGroupId === undefined) {
            return;
        }
        const input = this.node.querySelector('.pb-org-rename');
        if (input instanceof HTMLElement) {
            // `blur` runs the field's own `commit`, which saves what was
            // typed and clears the flag synchronously. The commit's model
            // change would also repaint synchronously and replace the node
            // this press is about to capture, so the repaint is held; the
            // commit's own trailing render, or the gesture's, paints it.
            const held = this.suppressRender;
            this.suppressRender = true;
            try {
                input.blur();
            } finally {
                this.suppressRender = held;
            }
        }
        // The field was already gone -- a render dropped it -- so nothing was
        // ever going to clear the flag and every gesture would stay jammed.
        this.editingGroupId = undefined;
    }

    /**
     * Draw a group by dragging out a rectangle on empty canvas
     * (Panorama's `UI._createGroupItemOnDrag`). Until this, New Group was the
     * only way to make one, and the button always produces the same 400x300
     * box in the same corner -- so a canvas of hand-placed groups had to be
     * dragged into shape one at a time after the fact.
     *
     * Bound on the HOST rather than the canvas node: `.pb-org-canvas` is only
     * as tall as its `min-height`, so a press in the empty space below it
     * lands on the host or the zoom layer and would never reach a listener on
     * the canvas itself.
     *
     * What counts as background is stated by EXCLUSION -- anything that is not
     * a box, a card, a rename field or a button -- and that direction matters.
     * It was an allowlist of three exact nodes, which quietly meant a press
     * had to miss every decoration on the canvas to be heard at all: the
     * loading skeletons, the "No tab groups" panel sitting in the middle of an
     * empty canvas, the pile's count badge. Pressing any of those did nothing
     * whatsoever, and doing nothing is indistinguishable from a dead gesture.
     * An exclusion list fails the safe way round: something new drawn on the
     * canvas is background until it says otherwise.
     *
     * The band is appended to the canvas node so it lives in canvas
     * coordinates and scales with the zoom transform for free, and
     * `canvasPoint` divides the pointer back out of that scale -- the same
     * conversion the drop paths already use.
     */
    protected beginGroupDraw(event: PointerEvent): void {
        const target = event.target instanceof Element ? event.target : undefined;
        const onEmptyCanvas = !!target
            && this.canvasHost.contains(target)
            && !target.closest('.pb-org-box, .pb-org-card, .pb-org-rename, button');
        if (event.button !== 0 || !onEmptyCanvas) {
            return;
        }
        this.settleRename();
        event.preventDefault();
        const host = this.canvasHost;
        try {
            host.setPointerCapture(event.pointerId);
        } catch {
            return;
        }
        // Hold the canvas still for the length of the gesture, exactly as the
        // box move and box resize gestures do. The band is a child of
        // `canvasRoot`, and a render empties `canvasRoot` -- so any model
        // change arriving mid-drag (a reload finishing, a capture landing a
        // thumbnail) deletes the rectangle out from under the pointer and the
        // gesture dies with nothing on screen to say why.
        this.suppressRender = true;
        const start = this.canvasPoint(event);
        let bounds = { x: start.x, y: start.y, w: 0, h: 0 };
        const band = document.createElement('div');
        band.className = 'pb-org-band';
        band.setAttribute('aria-hidden', 'true');
        this.canvasRoot.append(band);

        const startClient = { x: event.clientX, y: event.clientY };
        let captured: string[] = [];

        const paint = (move: PointerEvent): void => {
            const at = this.canvasPoint(move);
            bounds = {
                x: Math.min(start.x, at.x),
                y: Math.min(start.y, at.y),
                w: Math.abs(at.x - start.x),
                h: Math.abs(at.y - start.y),
            };
            band.style.transform = `translate(${bounds.x}px, ${bounds.y}px)`;
            band.style.width = `${bounds.w}px`;
            band.style.height = `${bounds.h}px`;
            captured = this.markBandCapture(startClient, { x: move.clientX, y: move.clientY });
        };
        const finish = (): void => {
            host.removeEventListener('pointermove', paint);
            host.removeEventListener('pointerup', onUp);
            host.removeEventListener('pointercancel', onCancel);
            window.removeEventListener('keydown', onKey);
            band.remove();
            for (const marked of Array.from(this.node.querySelectorAll('.is-band-target'))) {
                marked.classList.remove('is-band-target');
            }
            // Whatever the canvas was told while it was held still, it hears
            // now: one render catches up every change the gesture suppressed.
            this.suppressRender = false;
            this.render();
        };
        const onUp = (up: PointerEvent): void => {
            paint(up);
            const taking = captured;
            finish();
            // Too small to be a deliberate rectangle: that was a click on the
            // background, which means nothing here.
            if (bounds.w < GROUP_DRAW_MIN && bounds.h < GROUP_DRAW_MIN) {
                return;
            }
            void this.createNewGroup(bounds, taking);
        };
        const onCancel = (): void => finish();
        const onKey = (key: KeyboardEvent): void => {
            if (key.key === 'Escape') {
                finish();
            }
        };
        host.addEventListener('pointermove', paint);
        host.addEventListener('pointerup', onUp);
        host.addEventListener('pointercancel', onCancel);
        window.addEventListener('keydown', onKey);
    }

    /**
     * Outlines every loose tab the band currently encloses, and answers which
     * they are. Drawing a box around tabs takes them in -- the outline is what
     * says so before you let go, rather than after.
     *
     * Compared in client coordinates because the band lives in the zoomed
     * canvas and the loose row does not; screen rectangles are the one space
     * both are already in. A tab counts as enclosed when its CENTRE is inside
     * the band, so a box drawn over most of a card takes it, and one that
     * merely grazes an edge does not.
     */
    protected markBandCapture(from: { x: number; y: number }, to: { x: number; y: number }): string[] {
        const left = Math.min(from.x, to.x);
        const right = Math.max(from.x, to.x);
        const top = Math.min(from.y, to.y);
        const bottom = Math.max(from.y, to.y);
        const taken: string[] = [];
        for (const card of Array.from(this.canvasRoot.querySelectorAll('.pb-org-card.is-loose')) as HTMLElement[]) {
            const uri = card.dataset.u;
            const box = card.getBoundingClientRect();
            const cx = box.left + box.width / 2;
            const cy = box.top + box.height / 2;
            const inside = !card.hidden && uri !== undefined
                && cx >= left && cx <= right && cy >= top && cy <= bottom;
            card.classList.toggle('is-band-target', inside);
            if (inside && uri) {
                taken.push(uri);
            }
        }
        return taken;
    }

    protected beginBoxMove(event: PointerEvent, group: PanoramaGroup): void {
        if (event.button !== 0) {
            return;
        }
        this.settleRename();
        const target = event.target as HTMLElement | null;
        if (target && (target.closest('button') || target.closest('input') || target.closest('.pb-org-box-resize'))) {
            return;
        }
        event.preventDefault();
        const header = event.currentTarget as HTMLElement;
        try {
            header.setPointerCapture(event.pointerId);
        } catch {
            return;
        }
        this.suppressRender = true;
        const seq = this.geometrySeq;
        const base = { x: group.x, y: group.y };
        this.moveState = { id: group.id, startX: event.clientX, startY: event.clientY, baseX: group.x, baseY: group.y };
        const box = header.closest('.pb-org-box') as HTMLElement | null;
        // Pointer travel is in screen pixels; bounds are canvas pixels, which
        // the zoom scales -- the same division canvasPoint makes.
        const zoom = ZOOM_STEPS[this.zoomIndex] / 100;
        const placed = (state: { baseX: number; baseY: number; startX: number; startY: number }, at: PointerEvent): { x: number; y: number } => ({
            x: Math.max(0, Math.floor(state.baseX + (at.clientX - state.startX) / zoom)),
            y: Math.max(0, Math.floor(state.baseY + (at.clientY - state.startY) / zoom)),
        });
        const onMove = (move: PointerEvent): void => {
            if (!this.moveState) {
                return;
            }
            const { x, y } = placed(this.moveState, move);
            if (box) {
                box.style.transform = `translate(${x}px, ${y}px)`;
            }
            void this.debouncedMove(this.moveState.id, x, y, seq).catch(error => {
                console.error('[@powerbrowser/modes] group move failed:', error);
                this.suppressRender = false;
                this.moveState = undefined;
                this.render();
            });
        };
        const finish = (): void => {
            header.removeEventListener('pointermove', onMove);
            header.removeEventListener('pointerup', onUp);
            header.removeEventListener('pointercancel', onCancel);
            window.removeEventListener('keydown', onKey);
        };
        const onUp = (up: PointerEvent): void => {
            finish();
            if (!this.moveState) {
                return;
            }
            const { id } = this.moveState;
            const { x, y } = placed(this.moveState, up);
            this.moveState = undefined;
            this.suppressRender = false;
            void this.persistMove(id, x, y, seq).catch(error => {
                console.error('[@powerbrowser/modes] group move failed:', error);
            }).finally(() => {
                this.geometrySeq += 1;
                void this.separateGroups(id);
            });
        };
        // Esc and pointercancel both cancel: invalidate the trailing debounce,
        // revert the paint, and restore persisted bounds to base -- nothing
        // new stays moved or persisted.
        const onCancel = (): void => {
            finish();
            this.geometrySeq += 1;
            const id = this.moveState?.id;
            this.moveState = undefined;
            this.suppressRender = false;
            this.render();
            if (id) {
                void this.model.moveGroup(this.actor, id, base.x, base.y).catch(error => {
                    console.error('[@powerbrowser/modes] group move cancel-restore failed:', error);
                }).finally(() => this.render());
            }
        };
        const onKey = (key: KeyboardEvent): void => {
            if (key.key === 'Escape') {
                onCancel();
            }
        };
        header.addEventListener('pointermove', onMove);
        header.addEventListener('pointerup', onUp);
        header.addEventListener('pointercancel', onCancel);
        window.addEventListener('keydown', onKey);
    }

    /**
     * Resize from any edge or corner. `edge` says which sides move: a west or
     * north drag moves the box's ORIGIN as well as its size, because growing
     * leftward means the left edge travels while the right stays where it is.
     * The floor is applied by pinning the edge that is not moving, so a box
     * squashed to its minimum stops rather than turning inside out.
     */
    protected beginBoxResize(event: PointerEvent, group: PanoramaGroup, edge: BoxEdge = 'se'): void {
        if (event.button !== 0) {
            return;
        }
        this.settleRename();
        event.preventDefault();
        event.stopPropagation();
        const grip = event.currentTarget as HTMLElement;
        try {
            grip.setPointerCapture(event.pointerId);
        } catch {
            return;
        }
        this.suppressRender = true;
        const seq = this.geometrySeq;
        const base = { x: group.x, y: group.y, w: group.w, h: group.h };
        const startX = event.clientX;
        const startY = event.clientY;
        const box = grip.closest('.pb-org-box') as HTMLElement | null;
        const west = edge.includes('w');
        const north = edge.includes('n');
        const horizontal = edge.includes('e') || west;
        const vertical = edge.includes('s') || north;
        // Screen pixels to canvas pixels, as in beginBoxMove and canvasPoint.
        const zoom = ZOOM_STEPS[this.zoomIndex] / 100;

        const apply = (clientX: number, clientY: number): { x: number; y: number; w: number; h: number } => {
            const dx = Math.round((clientX - startX) / zoom);
            const dy = Math.round((clientY - startY) / zoom);
            let { x, y, w, h } = base;
            if (horizontal) {
                w = Math.max(GROUP_BOX_MIN_W, west ? base.w - dx : base.w + dx);
                if (west) {
                    // The east edge is the fixed one, so the origin absorbs
                    // whatever the floor refused.
                    x = Math.max(0, base.x + base.w - w);
                    w = base.x + base.w - x;
                }
            }
            if (vertical) {
                h = Math.max(GROUP_BOX_MIN_H, north ? base.h - dy : base.h + dy);
                if (north) {
                    y = Math.max(0, base.y + base.h - h);
                    h = base.y + base.h - y;
                }
            }
            if (box) {
                box.style.transform = `translate(${x}px, ${y}px)`;
                box.style.width = `${w}px`;
                box.style.height = `${h}px`;
                this.tileCards();
            }
            return { x, y, w, h };
        };

        const finish = (): void => {
            grip.removeEventListener('pointermove', onMove);
            grip.removeEventListener('pointerup', onUp);
            grip.removeEventListener('pointercancel', onCancel);
            window.removeEventListener('keydown', onKey);
        };
        const onMove = (move: PointerEvent): void => {
            const at = apply(move.clientX, move.clientY);
            void this.debouncedResize(group.id, at.w, at.h, seq).catch(error => {
                console.error('[@powerbrowser/modes] group resize failed:', error);
            });
        };
        const onUp = (up: PointerEvent): void => {
            finish();
            const at = apply(up.clientX, up.clientY);
            // Rendering stays suppressed until BOTH halves have landed in the
            // model. A west or north drag changes the origin as well as the
            // size, and the two are separate writes: unsuppressing first let
            // the size write's optimistic paint trigger a re-render while the
            // model still held the old origin, so the box was rebuilt at its
            // old x with its new width -- it grew from the wrong edge.
            void (async () => {
                if (at.x !== base.x || at.y !== base.y) {
                    await this.model.moveGroup(this.actor, group.id, at.x, at.y);
                }
                await this.persistResize(group.id, at.w, at.h, seq);
            })().catch(error => {
                console.error('[@powerbrowser/modes] group resize failed:', error);
            }).finally(() => {
                this.suppressRender = false;
                this.geometrySeq += 1;
                void this.separateGroups(group.id);
            });
        };
        // Esc and pointercancel both restore the base bounds: a debounced
        // write may already have stored a mid-drag size.
        const onCancel = (): void => {
            finish();
            this.geometrySeq += 1;
            this.suppressRender = false;
            this.render();
            void this.model.resizeGroup(this.actor, group.id, base.w, base.h)
                .then(() => this.model.moveGroup(this.actor, group.id, base.x, base.y))
                .catch(error => {
                    console.error('[@powerbrowser/modes] group resize cancel-restore failed:', error);
                }).finally(() => this.render());
        };
        const onKey = (key: KeyboardEvent): void => {
            if (key.key === 'Escape') {
                onCancel();
            }
        };
        grip.addEventListener('pointermove', onMove);
        grip.addEventListener('pointerup', onUp);
        grip.addEventListener('pointercancel', onCancel);
        window.addEventListener('keydown', onKey);
    }

    protected async separate(anchorId: string): Promise<void> {
        const boxes = [
            ...this.model.listGroups().map(group => ({ id: group.id, x: group.x, y: group.y, w: group.w, h: group.h })),
            ...(Array.from(this.canvasRoot.querySelectorAll('.pb-org-card.is-loose')) as HTMLElement[])
                .flatMap(card => {
                    const uri = card.dataset.u;
                    // Piled cards overlap the pile's front card by design;
                    // separating them would scatter the pile.
                    if (!uri || card.hidden || card.classList.contains('is-piled')) {
                        return [];
                    }
                    return [{
                        id: `${LOOSE_BOX_PREFIX}${uri}`,
                        x: Math.max(0, Math.round(parseFloat(card.style.left) || 0)),
                        y: Math.max(0, Math.round(parseFloat(card.style.top) || 0)),
                        w: LOOSE_W,
                        h: LOOSE_H,
                    }];
                }),
        ];
        for (const [id, at] of pushAway(boxes, anchorId)) {
            try {
                if (id.startsWith(LOOSE_BOX_PREFIX)) {
                    await this.model.placeCard(this.actor, id.slice(LOOSE_BOX_PREFIX.length), at.x, at.y);
                } else {
                    await this.model.moveGroup(this.actor, id, at.x, at.y);
                }
            } catch (error) {
                console.error('[@powerbrowser/modes] push-away failed:', error);
            }
        }
        this.render();
    }

    protected separateGroups(anchorId: string): Promise<void> {
        return this.separate(anchorId);
    }

    protected separateLoose(uri: string): Promise<void> {
        return this.separate(`${LOOSE_BOX_PREFIX}${uri}`);
    }

    protected async persistMove(id: string, x: number, y: number, seq: number): Promise<void> {
        if (seq !== this.geometrySeq) {
            return;
        }
        try {
            await this.model.moveGroup(this.actor, id, x, y);
        } catch (error) {
            this.render();
            throw error;
        }
    }

    protected async persistResize(id: string, w: number, h: number, seq: number): Promise<void> {
        if (seq !== this.geometrySeq) {
            return;
        }
        try {
            await this.model.resizeGroup(this.actor, id, w, h);
        } catch (error) {
            this.render();
            throw error;
        }
    }

    /**
     * Keyboard resize (15-UI-REVIEW Top Fix #2): arrows step the box
     * through the same persistResize path as the pointer grip -- 8px, 32px
     * with Shift; Left/Right ride width, Up/Down ride height, floored at
     * the contracted minimum. The model change re-renders (fresh grip
     * carries fresh valuenow/valuetext), so focus is returned to the new
     * grip; a clamped no-op changes nothing and keeps focus where it is.
     */
    protected stepBoxResize(event: KeyboardEvent, id: string): void {
        const step = event.shiftKey ? 32 : 8;
        let dw = 0;
        let dh = 0;
        if (event.key === 'ArrowLeft') {
            dw = -step;
        } else if (event.key === 'ArrowRight') {
            dw = step;
        } else if (event.key === 'ArrowUp') {
            dh = -step;
        } else if (event.key === 'ArrowDown') {
            dh = step;
        } else {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        const current = this.model.listGroups().find(candidate => candidate.id === id);
        if (!current) {
            return;
        }
        const w = Math.max(GROUP_BOX_MIN_W, current.w + dw);
        const h = Math.max(GROUP_BOX_MIN_H, current.h + dh);
        if (w === current.w && h === current.h) {
            return;
        }
        // Push-away as the pointer resize does, so a box grown from the
        // keyboard does not cover its neighbours.
        void this.persistResize(id, w, h, this.geometrySeq).then(() => this.separateGroups(id)).then(() => {
            const grip = this.node.querySelector(`[data-g="${CSS.escape(id)}"] .pb-org-box-resize`) as HTMLElement | null;
            if (grip) {
                grip.focus();
            }
        }).catch(error => {
            console.error('[@powerbrowser/modes] group resize failed:', error);
        });
    }

    /**
     * Card drag, on pointer events rather than HTML5 drag-and-drop.
     *
     * HTML5 drag cannot work in this embedding, and the failure is total
     * rather than partial. The Theia frontend runs inside `<xul:browser
     * type="content" remote="true">` (powerbrowser.xhtml), and a drag session
     * started in a remote content process must be driven by the parent
     * process -- which in Firefox is tabbrowser's job. This chrome window has
     * no drag plumbing at all, so the session opens and is cancelled in the
     * same gesture. Measured in the built browser: `dragstart` fired,
     * `dragend` followed immediately, and no `dragover`, `dragenter` or
     * `drop` was dispatched anywhere in the document.
     *
     * Pointer events carry no such dependency, and this widget already proves
     * it: `beginBoxMove` and `beginBoxResize` drag group boxes with
     * `setPointerCapture` and have always worked here. Cards now use the same
     * mechanism, so the canvas has ONE drag mechanism instead of two, and the
     * one it has is the one that works in the shell we ship.
     *
     * A click still dives to the tab -- nothing happens until the pointer
     * passes CARD_DRAG_THRESHOLD, so press-and-release is untouched.
     */
    protected beginCardDrag(event: PointerEvent, card: HTMLElement, tab: PanoramaTab, groupId: string | null): void {
        if (event.button !== 0) {
            return;
        }
        // The same preventDefault beginBoxMove does, and for a sharper reason
        // here. Without it the press SELECTS the card's text, Gecko then
        // starts a NATIVE drag of that selection, and the parent chrome
        // window treats a dropped URL as "open this" -- dragging a card
        // opened the page in a stock browser window instead of moving it.
        //
        // The card is deliberately NOT focused here. Taking focus on a press
        // painted a focus ring on the very card being dragged, which is a
        // blue outline around the thing under the pointer for the whole
        // gesture. Keyboard focus still rings, through :focus-visible.
        //
        // preventDefault keeps focus in an open name field, and the drop's
        // repaint would rebuild that field from the stored title, so the
        // typed name is committed first, as every other canvas press does.
        this.settleRename();
        event.preventDefault();
        const startX = event.clientX;
        const startY = event.clientY;
        let dragging = false;

        // The dragged card sits under the pointer, so it is hidden for the
        // hit test and restored immediately -- elementFromPoint would
        // otherwise only ever name the card being dragged.
        const hitTest = (ev: PointerEvent): HTMLElement | null => {
            const prior = card.style.visibility;
            card.style.visibility = 'hidden';
            const under = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
            card.style.visibility = prior;
            return under;
        };

        // The card being dragged stays where it is -- it is still a member of
        // its group until the drop says otherwise, and moving the real node
        // would reflow the group under the pointer. What follows the pointer
        // is a copy. Without it the gesture had no visible subject: the card
        // dimmed in place and the page only changed on release, so a drag
        // looked like nothing was happening until something popped in.
        let ghost: HTMLElement | undefined;
        let grabX = 0;
        let grabY = 0;

        const onMove = (ev: PointerEvent): void => {
            if (!dragging) {
                if (Math.abs(ev.clientX - startX) < CARD_DRAG_THRESHOLD && Math.abs(ev.clientY - startY) < CARD_DRAG_THRESHOLD) {
                    return;
                }
                dragging = true;
                this.dragCard = { uri: tab.uri, fromGroup: groupId };
                card.classList.add('is-dragging');
                try {
                    // Optional now that the gesture listens on the window:
                    // capture is released the moment a re-render detaches this
                    // node, and it throws outright for a pointer the element
                    // never received. Neither can be allowed to end the drag.
                    card.setPointerCapture(ev.pointerId);
                } catch {
                    // Capture is a nicety; the window listeners are the truth.
                }
                // Sized from the rendered box, so the copy matches whatever
                // the zoom transform is currently showing. It is appended to
                // the body and positioned in viewport coordinates, which is
                // why it must NOT be inside the zoomed layer.
                const box = card.getBoundingClientRect();
                grabX = ev.clientX - box.left;
                grabY = ev.clientY - box.top;
                ghost = card.cloneNode(true) as HTMLElement;
                ghost.classList.add('pb-org-card-ghost');
                ghost.classList.remove('is-dragging', 'is-tiled', 'is-loose', 'is-piled', 'is-stacked-card');
                ghost.removeAttribute('data-u');
                ghost.setAttribute('aria-hidden', 'true');
                // The clone inherits the card's INLINE placement -- left, top
                // and z-index written by the tiling and pile layouts. Fixed
                // positioning then honours that left/top, and the transform
                // below lands on top of it, so the ghost appeared a whole
                // card-position away from the pointer. Reset the box the
                // stylesheet owns and let the transform alone place it.
                ghost.style.left = '0px';
                ghost.style.top = '0px';
                ghost.style.zIndex = '';
                ghost.style.width = `${box.width}px`;
                ghost.style.height = `${box.height}px`;
                document.body.append(ghost);
            }
            if (ghost) {
                ghost.style.transform = `translate(${ev.clientX - grabX}px, ${ev.clientY - grabY}px)`;
            }
            // The group under the pointer makes room for the card instead of
            // lighting up: the grid re-packs and a translucent slot opens
            // where it will land. An outline says "here"; a gap that opens
            // says "here, and like this".
            const host = hitTest(ev)?.closest('.pb-org-box') as HTMLElement | null;
            const over = host && host !== card ? host.dataset.g : undefined;
            const index = over && host ? this.dropIndexIn(host, ev) : 0;
            if (over !== this.dropPreviewGroupId || index !== this.dropPreviewIndex) {
                this.dropPreviewGroupId = over;
                this.dropPreviewIndex = index;
                this.tileCards();
            }
        };

        const detach = (): void => {
            this.dropPreviewGroupId = undefined;
            this.tileCards();
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', finish);
            window.removeEventListener('pointercancel', cancel);
            ghost?.remove();
            ghost = undefined;
            // Belt and braces: if an earlier gesture was orphaned, its copy is
            // still on the page and would sit over everything forever.
            for (const orphan of Array.from(document.querySelectorAll('.pb-org-card-ghost'))) {
                orphan.remove();
            }
        };

        const finish = (ev: PointerEvent): void => {
            // Read the slot BEFORE detach clears it -- it is where the card
            // goes, and the preview promised exactly this place.
            const previewGroup = this.dropPreviewGroupId;
            const previewIndex = this.dropPreviewIndex;
            detach();
            if (!dragging) {
                return;
            }
            // A drag still ends in a `click`, and the card's click handler
            // dives to the tab -- so a completed drop ALSO opened the tab,
            // in a stock window. Swallow exactly one click, in capture, so
            // the drop is the only thing the gesture does. A press without a
            // drag never reaches here, so plain clicks are untouched.
            const swallow = (event: Event): void => {
                event.stopPropagation();
                event.preventDefault();
            };
            for (const kind of ['click', 'dblclick']) {
                card.addEventListener(kind, swallow, { capture: true, once: true });
            }
            // Only this release's own click: a listener left armed would eat
            // the next double-click on the card. A mouse release fires its
            // click in the same task; a touch or pen release synthesizes it a
            // little later, so the listeners stay for a short while.
            window.setTimeout(() => {
                for (const kind of ['click', 'dblclick']) {
                    card.removeEventListener(kind, swallow, { capture: true });
                }
            }, 500);
            card.classList.remove('is-dragging');
            this.clearDropTargets();
            const under = hitTest(ev);
            const targetBox = under?.closest('.pb-org-box') as HTMLElement | null;
            const at = targetBox && targetBox.dataset.g === previewGroup
                ? previewIndex
                : undefined;
            // A group is checked first: since the cards tile to fill their
            // group, nearly every drop inside a box lands on a card rather
            // than on bare box, and that drop joins the group at the
            // previewed slot. A drop on empty canvas places the card loose
            // there. A release anywhere else changes nothing.
            if (targetBox && targetBox.dataset.g) {
                void this.dropCard(ev, targetBox.dataset.g, at);
            } else if (under?.closest('.pb-org-canvas-host')) {
                // The host, not the canvas: below 100% zoom the scaled canvas
                // covers only part of the visible field.
                void this.dropCardOnField(ev);
            } else {
                // Released outside every target: the arrangement is unchanged.
                this.dragCard = undefined;
            }
        };

        const cancel = (): void => {
            detach();
            card.classList.remove('is-dragging');
            this.clearDropTargets();
            this.dragCard = undefined;
        };

        // On WINDOW, not on the card. The card is a rendered node: any reload
        // -- a tab opening, a mutation completing, a failed write reverting --
        // rebuilds the canvas and replaces it mid-gesture. Listeners on the
        // old node then never see `pointerup`, so the drop never runs and the
        // dragged copy is left on screen forever. Measured: exactly that, one
        // orphaned copy and no drop. The window outlives every re-render.
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', finish);
        window.addEventListener('pointercancel', cancel);
    }

    /**
     * Which slot in a group's grid the pointer is over.
     *
     * Measured against the grid the group is showing WITH the preview slot in
     * it, so the answer is stable while hovering: ask about a grid of n and
     * you get an index that changes the grid to n+1, which would move the very
     * cell you just measured.
     *
     * Half a cell to the right of a card's centre counts as after it, so
     * moving across a row steps the slot at the boundaries between cards
     * rather than only when the pointer is fully inside the next one.
     */
    protected dropIndexIn(box: HTMLElement, event: PointerEvent): number {
        const host = box.querySelector('.pb-org-box-cards') as HTMLElement | null;
        const group = box.dataset.g;
        if (!host || !group) {
            return 0;
        }
        const count = this.model.getTabs(group).length;
        const cell = fitTiles(count + 1, host.clientWidth, host.clientHeight);
        if (!cell) {
            return count;
        }
        // The rect is in zoomed screen pixels and the cells in canvas pixels;
        // divide the zoom out as canvasPoint does.
        const zoom = ZOOM_STEPS[this.zoomIndex] / 100;
        const rect = host.getBoundingClientRect();
        const px = (event.clientX - rect.left) / zoom;
        const py = (event.clientY - rect.top) / zoom;
        const column = Math.floor((px + (cell.w + TILE_GAP) / 2) / (cell.w + TILE_GAP));
        const row = Math.floor(py / (cell.h + TILE_GAP));
        return Math.max(0, Math.min(count, row * cell.cols + Math.max(0, Math.min(cell.cols, column))));
    }

    protected clearDropTargets(): void {
        this.dropPreviewGroupId = undefined;
        for (const marked of Array.from(this.node.querySelectorAll('.is-drop-target, .is-band-target'))) {
            marked.classList.remove('is-drop-target', 'is-band-target');
        }
    }

    protected async dropCard(event: MouseEvent, toGroup: string | null, index?: number): Promise<void> {
        event.preventDefault();
        const drag = this.dragCard;
        this.dragCard = undefined;
        this.clearDropTargets();
        if (!drag) {
            return;
        }
        // The preview grid still counts the dragged card in its old place, and
        // moveCard inserts after removing it, so a later slot is one earlier.
        let at = index;
        if (at !== undefined && toGroup !== null && drag.fromGroup === toGroup) {
            const from = this.model.getTabs(toGroup).findIndex(tab => tab.uri === drag.uri);
            if (from >= 0 && at > from) {
                at -= 1;
            }
        }
        try {
            await this.model.moveCard(this.actor, drag.uri, toGroup, at);
            await this.dissolveEmptied(drag.fromGroup, toGroup);
        } catch (error) {
            console.error('[@powerbrowser/modes] card drop failed:', error);
        }
        this.render();
    }

    /**
     * Card dropped on bare canvas: it lands THERE, loose, at the point it was
     * dropped -- it does not draw a group around itself any more.
     *
     * Drawing a box around tabs is now how a group gets made, so a drop that
     * silently made one meant you could not simply put a tab down somewhere.
     * Loose tabs are canvas objects with positions, so "put it down here" is
     * a thing the canvas can express.
     */
    protected async dropCardOnField(event: MouseEvent): Promise<void> {
        event.preventDefault();
        const drag = this.dragCard;
        this.dragCard = undefined;
        this.clearDropTargets();
        if (!drag) {
            return;
        }
        const at = this.canvasPoint(event);
        const x = Math.max(0, at.x - Math.round(LOOSE_W / 2));
        const y = Math.max(0, at.y - Math.round(LOOSE_H / 2));
        try {
            if (drag.fromGroup !== null) {
                await this.model.moveCard(this.actor, drag.uri, null);
                await this.dissolveEmptied(drag.fromGroup, null);
            }
            await this.model.placeCard(this.actor, drag.uri, x, y);
        } catch (error) {
            console.error('[@powerbrowser/modes] card placement failed:', error);
        }
        await this.separateLoose(drag.uri);
    }

    /** Last-card-out: dissolves a source box left with zero cards. */
    protected async dissolveEmptied(fromGroup: string | null, toGroup: string | null): Promise<void> {
        if (fromGroup === null || fromGroup === toGroup
            || this.model.getTabs(fromGroup).length !== 0
            || !this.model.listGroups().some(group => group.id === fromGroup)) {
            return;
        }
        await this.model.dissolveGroup(this.actor, fromGroup);
    }

    /**
     * Drop-event client pixels into user-pixel canvas coordinates. The zoom
     * transform touches the layer only, so dividing the layer-relative point
     * by the zoom factor recovers the stored bounds space.
     */
    protected canvasPoint(event: MouseEvent): { x: number; y: number } {
        const zoom = ZOOM_STEPS[this.zoomIndex] / 100;
        try {
            const rect = this.canvasRoot.getBoundingClientRect();
            return {
                x: Math.max(0, Math.floor((event.clientX - rect.left) / zoom)),
                y: Math.max(0, Math.floor((event.clientY - rect.top) / zoom)),
            };
        } catch {
            return { x: 24, y: 24 };
        }
    }

    /**
     * Roving tabindex within one scope -- a group's card area, the
     * expanded-stack list, or the visible loose cards on the canvas: arrows
     * move focus to the next card, which takes the single tab stop. Enter
     * still opens.
     */
    protected moveCardFocus(card: HTMLElement, delta: 1 | -1): void {
        let scoped: HTMLElement[];
        if (card.classList.contains('is-loose')) {
            scoped = (Array.from(this.canvasRoot.children) as HTMLElement[])
                .filter(child => child.matches('.pb-org-card.is-loose'));
        } else {
            const scope = card.closest('.pb-org-box-cards, .pb-org-expand-cards');
            if (!scope) {
                return;
            }
            scoped = Array.from(scope.querySelectorAll('.pb-org-card')) as HTMLElement[];
        }
        const cards = scoped.filter(candidate => !candidate.hidden);
        const at = cards.indexOf(card);
        if (at < 0 || cards.length < 2) {
            return;
        }
        const next = cards[(at + delta + cards.length) % cards.length];
        for (const candidate of cards) {
            candidate.tabIndex = candidate === next ? 0 : -1;
        }
        next.focus();
    }

    /**
     * The visible cards of a card's roving scope, in order: the same rule as
     * `moveCardFocus`, whose body canvas-geometry reads for the scope selectors.
     */
    protected cardScope(card: HTMLElement): HTMLElement[] {
        let scoped: HTMLElement[];
        if (card.classList.contains('is-loose')) {
            scoped = (Array.from(this.canvasRoot.children) as HTMLElement[])
                .filter(child => child.matches('.pb-org-card.is-loose'));
        } else {
            const scope = card.closest('.pb-org-box-cards, .pb-org-expand-cards');
            scoped = scope ? Array.from(scope.querySelectorAll('.pb-org-card')) as HTMLElement[] : [];
        }
        return scoped.filter(candidate => !candidate.hidden);
    }

    /** Focuses a card and makes it its scope's one tab stop. */
    protected focusCard(card: HTMLElement): void {
        for (const candidate of this.cardScope(card)) {
            candidate.tabIndex = candidate === card ? 0 : -1;
        }
        card.focus();
    }

    /**
     * Clicking a card goes TO that tab, in this window.
     *
     * It used to call `window.open(url, '_blank')`, which has no
     * `nsIBrowserDOMWindow` to divert it and therefore opens a whole stock
     * Firefox window (CLAUDE.md hard rule 5) -- so arranging tabs and then
     * opening one threw you out of Power Browser entirely.
     *
     * A card whose tab is open activates that widget; the chrome bar follows
     * the active widget, so the address bar reads the tab's own URL without
     * being told. A card whose tab is not open (NG-008) reopens it through
     * the opener (`GroupModel.reopen`) -- docs/URI-SCHEMES.md: every opener,
     * Panorama included, resolves to the same handler -- and a reopened web
     * tab writes the card's own row, so it keeps its group, place and
     * thumbnail. Leaving Organising is part of the gesture -- it is what
     * Panorama's zoomIn does, and what "open this one" means.
     */
    protected dive(tab: PanoramaTab, groupId: string | null): void {
        if (groupId !== null) {
            void this.activateGroup(groupId);
        }
        const widget = this.widgetForTab(tab);
        // Browsing for a page, Coding for an editor or the Welcome view --
        // each tab lands in the mode that is built to show it.
        void this.modes.activateMode(tab.url ? 'browsing' : 'coding')
            .catch(error => console.error('[@powerbrowser/modes] mode switch on dive failed:', error))
            .finally(() => {
                if (widget) {
                    void this.shell.activateWidget(widget.id);
                    return;
                }
                // NG-008: the tab is not open -- reopen it through the opener.
                this.model.reopen(tab).catch(error => console.error('[@powerbrowser/modes] reopening a tab from its card failed:', error instanceof Error ? error.name : typeof error));
            });
    }

    /** The open widget a card stands for, matched on the key `liveTabs` built. */
    protected widgetForTab(tab: PanoramaTab): Widget | undefined {
        return [...this.shell.mainPanel.widgets()].find(widget => widget !== this && this.model.keyOf(widget) === tab.uri);
    }

    protected async activateGroup(id: string): Promise<void> {
        try {
            await this.model.setActiveGroup(this.actor, id);
        } catch (error) {
            console.error('[@powerbrowser/modes] set-active-group failed:', error);
            this.render();
        }
    }

    protected startRename(id: string): void {
        this.editingGroupId = id;
        this.render();
        this.focusRename(id);
    }

    protected focusRename(id: string): void {
        // The view that is showing: both roots carry the field, and the
        // hidden one cannot take focus.
        const root = this.view === 'canvas' ? this.canvasRoot : this.treeRoot;
        const input = root.querySelector(`[data-g="${CSS.escape(id)}"] .pb-org-rename`) as HTMLInputElement | null;
        if (input) {
            input.focus();
            input.select();
        }
    }

    protected async flash(text: string): Promise<void> {
        const id = 'powerbrowser.modes.panorama-notice';
        try {
            await this.statusBar.setElement(id, { text, alignment: StatusBarAlignment.RIGHT });
        } catch {
            return;
        }
        // A newer notice restarts the timer, so an older one cannot remove it early.
        window.clearTimeout(this.flashTimer);
        this.flashTimer = window.setTimeout(() => {
            void this.statusBar.removeElement(id).catch(() => undefined);
        }, 4000);
    }

    protected flashTimer = 0;

    // Static DOM (built once; roots re-render over the model).

    protected buildStaticDom(): void {
        this.toolbar = document.createElement('div');
        this.toolbar.className = 'pb-org-toolbar';

        const toggle = document.createElement('div');
        toggle.className = 'pb-org-toggle';
        toggle.setAttribute('role', 'group');
        this.canvasToggle = document.createElement('button');
        this.canvasToggle.type = 'button';
        this.canvasToggle.className = 'pb-org-toggle-segment';
        this.canvasToggle.textContent = 'Canvas';
        this.canvasToggle.addEventListener('click', () => this.showCanvasView());
        this.treeToggle = document.createElement('button');
        this.treeToggle.type = 'button';
        this.treeToggle.className = 'pb-org-toggle-segment';
        this.treeToggle.textContent = 'Tree';
        this.treeToggle.addEventListener('click', () => this.showTreeView());
        toggle.append(this.canvasToggle, this.treeToggle);

        const fresh = document.createElement('button');
        fresh.type = 'button';
        fresh.className = 'pb-org-new theia-button';
        fresh.textContent = 'New Group';
        fresh.dataset.command = PANORAMA_NEW_GROUP_COMMAND_ID;
        fresh.addEventListener('click', () => {
            void this.createNewGroup();
        });

        this.zoomCluster = document.createElement('div');
        this.zoomCluster.className = 'pb-org-zoom';
        const zoomOut = document.createElement('button');
        zoomOut.type = 'button';
        zoomOut.className = 'pb-org-zoom-step';
        zoomOut.textContent = '−';
        zoomOut.title = 'Zoom out';
        zoomOut.setAttribute('aria-label', 'Zoom out');
        zoomOut.addEventListener('click', () => this.stepZoom(-1));
        this.zoomReadout = document.createElement('span');
        this.zoomReadout.className = 'pb-org-zoom-readout';
        const zoomIn = document.createElement('button');
        zoomIn.type = 'button';
        zoomIn.className = 'pb-org-zoom-step';
        zoomIn.textContent = '+';
        zoomIn.title = 'Zoom in';
        zoomIn.setAttribute('aria-label', 'Zoom in');
        zoomIn.addEventListener('click', () => this.stepZoom(1));
        const zoomReset = document.createElement('button');
        zoomReset.type = 'button';
        zoomReset.className = 'pb-org-zoom-step';
        zoomReset.textContent = '100%';
        zoomReset.title = 'Reset zoom';
        zoomReset.setAttribute('aria-label', 'Reset zoom');
        zoomReset.addEventListener('click', () => {
            this.zoomIndex = DEFAULT_ZOOM_INDEX;
            this.render();
        });
        this.zoomCluster.append(zoomOut, this.zoomReadout, zoomIn, zoomReset);
        this.toolbar.append(toggle, fresh, this.zoomCluster);
        this.toolbarRow = new Widget({ node: this.toolbar });
        this.toolbarRow.id = 'powerbrowser.modes.organising-toolbar';

        this.loadBar = this.buildBar(
            'PowerBrowser couldn\u2019t load your tab groups. Your tabs are unchanged \u2014 choose Retry.',
            () => {
                void this.initialize();
            }
        );
        this.saveBar = this.buildBar(
            'PowerBrowser couldn\u2019t save your tab groups. The canvas shows your latest arrangement \u2014 choose Retry.',
            () => {
                void this.retrySave();
            }
        );

        this.canvasHost = document.createElement('div');
        this.canvasHost.className = 'pb-org-canvas-host';
        this.canvasHost.addEventListener('pointerdown', event => this.beginGroupDraw(event));
        this.canvasLayer = document.createElement('div');
        this.canvasLayer.className = 'pb-org-canvas-layer';
        this.canvasRoot = document.createElement('div');
        this.canvasRoot.className = 'pb-org-canvas';
        this.canvasRoot.dataset.canvas = 'true';
        this.canvasLayer.append(this.canvasRoot);
        this.canvasHost.append(this.canvasLayer);

        this.treeRoot = document.createElement('div');
        this.treeRoot.className = 'pb-org-tree';
        this.treeRoot.dataset.tree = 'true';

        this.expandRoot = document.createElement('div');
        this.expandRoot.className = 'pb-org-expand';
        this.expandRoot.hidden = true;

        this.node.append(this.loadBar, this.saveBar, this.canvasHost, this.treeRoot, this.expandRoot);
    }

    protected buildBar(text: string, onRetry: () => void): HTMLElement {
        const bar = document.createElement('div');
        bar.className = 'pb-org-errorbar';
        bar.hidden = true;
        const copy = document.createElement('span');
        copy.className = 'pb-org-errorbar-text';
        copy.textContent = text;
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'pb-org-errorbar-retry theia-button';
        retry.textContent = 'Retry';
        retry.addEventListener('click', onRetry);
        bar.append(copy, retry);
        return bar;
    }

    protected stepZoom(direction: 1 | -1): void {
        this.zoomIndex = Math.min(ZOOM_STEPS.length - 1, Math.max(0, this.zoomIndex + direction));
        this.render();
    }
}

@injectable()
export class OrganisingContribution extends AbstractViewContribution<OrganisingWidget> {
    constructor() {
        super({
            widgetId: OrganisingWidget.ID,
            widgetName: 'Organising',
            defaultWidgetOptions: { area: 'main' },
        });
    }

    onStart(): void {
        registerOrganisingSlot({
            open: () => {
                void this.openView({ activate: false, reveal: true });
            },
            close: () => {
                void this.closeView();
            },
        });
    }
}

@injectable()
export class OrganisingCommandHandler implements PanoramaCommandHandler {
    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(ModeService)
    protected readonly modes: ModeService;

    protected widget(): OrganisingWidget | undefined {
        const found = this.shell.getWidgetById(OrganisingWidget.ID);
        return found instanceof OrganisingWidget ? found : undefined;
    }

    async newGroup(): Promise<void> {
        await this.widget()?.createNewGroup();
    }

    async closeGroup(id: string): Promise<void> {
        if (id) {
            await this.widget()?.closeGroupById(id);
        }
    }

    async undoCloseGroup(id: string): Promise<void> {
        if (id) {
            await this.widget()?.undoCloseGroupById(id);
        }
    }

    showCanvas(): void {
        this.widget()?.showCanvasView();
    }

    showTree(): void {
        this.widget()?.showTreeView();
    }

    async retrySave(): Promise<void> {
        await this.widget()?.retrySave();
    }
}
