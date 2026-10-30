import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { ApplicationShell, BaseWidget, FrontendApplicationContribution, Message, OpenHandler, OpenerOptions, Widget, WidgetManager } from '@theia/core/lib/browser';
import { Disposable, Emitter, Event as TheiaEvent } from '@theia/core/lib/common';
import URI from '@theia/core/lib/common/uri';
// Resolved through src/, not './': the build is `tsc -b` alone, which emits
// no CSS into lib/, so a lib-relative specifier would name a file that is
// never written (the organising-widget / chrome-bar precedent).
import '../../src/browser/web-tab.css';

/**
 * GUI-02 (14.1-01): the in-shell web tab -- a main-area placeholder widget
 * whose page is rendered by a chrome-owned `<xul:browser>` overlay that
 * `PowerBrowserAPI.sys.mjs` keeps aligned with this widget's node. The
 * frontend owns tab identity, the strip title and geometry; chrome owns the
 * docshell, the navigation and the tab-store row. The two halves talk over
 * the existing PowerBrowserGroup actor channel (frontend -> chrome as
 * `PowerBrowserGroupRequest` DOM events, chrome -> frontend as
 * `PowerBrowserWebTabState` events re-dispatched by the actor child).
 *
 * The widget is deliberately NOT `ExtractableWidget` (the overlay lives in
 * the shell window and cannot follow a widget into a dependent window) and
 * NOT `StatefulWidget`. UI-SPEC A12.
 *
 * Not being `StatefulWidget` is NOT what keeps a web tab out of a restored
 * layout, and the earlier claim here that the frontend origin changes every
 * launch was wrong (G-14.1.1-5). The measured truth: the origin repeats on an
 * in-session reload after a backend respawn on the pinned port
 * (`TheiaService.sys.mjs:595, :602`) and on an ephemeral-port repeat across
 * launches. The stock `ShellLayoutRestorer` describes EVERY widget that has a
 * `WidgetManager` description, `StatefulWidget` or not, and re-creates it
 * through `getOrCreateWidget(factoryId, options)` -- so it WILL try to
 * re-create last session's web tabs. What actually makes the widget
 * un-restorable is the `WEB_TAB_SESSION` discriminator below plus the
 * `WEB_TAB_FACTORY_ID` factory's refusal of any id not minted this session;
 * the restorer's own catch turns that refusal into a dropped widget, with no
 * Theia-core edit. Named setups restore tabs through the opener instead.
 */

export const WEB_TAB_FACTORY_ID = 'powerbrowser.web-tab';
/** The one non-http target chrome admits: a bare New Tab. Never shown in copy. */
export const EMPTY_PAGE_URL = 'about:blank';
export const WEB_TAB_STATE_EVENT = 'PowerBrowserWebTabState';
/** Ack budget for the requests whose reply decides UI state; matches the group channel's. */
export const WEB_TAB_ACK_TIMEOUT_MS = 5000;
export const WEB_TAB_OPEN_HANDLER_ID = 'powerbrowser.web-tab-open-handler';
/**
 * The one reply outcome that means chrome no longer holds this tab's overlay
 * (`PowerBrowserAPI.webTabOpen`'s documented `where` vocabulary). Spelled once
 * here because two separate code paths fold it into lost view.
 */
export const UNKNOWN_TAB_OUTCOME = 'unknown-tab';
/**
 * The reply outcome that means chrome declined to render the target at all
 * (`PowerBrowserAPI`'s `webTabOpen`, `webTabNavigate` and `openStockTab`
 * each return it for a non-http(s) URL). Spelled once here, beside the
 * outcome above, because `lostReply()` folds both into lost view.
 */
export const REFUSED_SCHEME_OUTCOME = 'refused-scheme';

/**
 * Wire names of the group channel. Spelled locally rather than imported for
 * the reason `browser-window-command.ts` already records: the canonical
 * exports live in `@powerbrowser/modes`, which depends on this package, so
 * importing back would close a package cycle.
 */
const GROUP_REQUEST_EVENT = 'PowerBrowserGroupRequest';
const GROUP_RESPONSE_EVENT = 'PowerBrowserGroupResponse';

/** Copywriting Contract, verbatim. Text nodes only, never markup. */
export const NEW_TAB_LABEL = 'New Tab';
const EMPTY_STATE_COPY = 'Type an address above to get started.';
const LOST_VIEW_COPY = "PowerBrowser can't show this page right now. Choose Reload to try again, or close this tab.";

/**
 * Occlusion policy (UI-SPEC A8, Research Pitfall 3). The overlay is
 * composited above the whole Theia frame, so any layer Theia portals to
 * `document.body` -- the chrome bar's suggestion dropdown, the quick input
 * / command palette, a dialog overlay, a menu -- would vanish behind the
 * page. While one of these is rendered, every visible web tab publishes
 * visible=false and shows its flat dark surface instead. `getClientRects`
 * rather than mere presence: Theia keeps some of these in the DOM hidden.
 *
 * `.lm-mod-drag-image` is the same policy applied to a drag, and it is what
 * makes drag-a-tab-to-an-edge work at all. Lumino appends that node to the
 * body for exactly the span of a drag, so listing it hides every page from
 * pointerdown-past-threshold to drop. Two things depend on that:
 *
 * - The dock's drop indicator (`.lm-DockPanel-overlay`) is a div inside the
 *   Theia document, so over a live page it would be painted underneath the
 *   thing the user is aiming at.
 * - Lumino hit-tests `document.elementFromPoint` on every pointermove. A
 *   page is a chrome-level `<xul:browser>` in a different process, so while
 *   one is on top the Theia document may stop seeing moves entirely.
 *
 * Hiding the pages removes both problems rather than working around either:
 * during a drag the frame is the topmost thing again, exactly as it is while
 * a menu is open.
 */
// The overlay layer policy (Phase 27, UI-SPEC), binding on every chrome-bar
// layer later phases add:
//   rule (a): a chrome-bar-anchored layer that would overlap the page rect is
//     listed in the selector below and hides the overlay while it is open;
//     the `.lm-Menu` entry already covers the session-history menu.
//   rule (c): a hover or tooltip never extends over the page rect, so every
//     chrome-bar hover requests `position: 'top'`.
//   focus rule: a Theia popup opened by a key while a page has focus first
//     moves focus to the Theia frame, and returns it to the page on close.
const BLOCKING_LAYER_SELECTOR = '.pb-chrome-bar-dropdown, .quick-input-widget, .lm-Widget.dialogOverlay, .lm-Menu, .lm-mod-drag-image';

function blockingLayerOpen(): boolean {
    return Array.from(document.querySelectorAll(BLOCKING_LAYER_SELECTOR))
        .some(element => element.getClientRects().length > 0);
}

/** Every attached web tab, so one body observer can re-publish all of them. */
const attachedWebTabs = new Set<WebTabWidget>();
let bodyObserver: MutationObserver | undefined;

/**
 * One MutationObserver on the body for every web tab, created on first
 * attach and never disconnected. It fires on a lot -- every class/style
 * flip anywhere -- but each publish is rAF-coalesced and deduped against
 * the last message sent, so the cost is bounded at one rect read per frame
 * per widget, and hide/restore both land within one animation frame.
 */
function ensureBodyObserver(): void {
    if (bodyObserver) {
        return;
    }
    bodyObserver = new MutationObserver(() => {
        for (const widget of attachedWebTabs) {
            widget.publish();
        }
    });
    bodyObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style'],
    });
}

export interface WebTabOptions {
    /**
     * `wt-<session>-<n>`: the per-session discriminator plus the counter,
     * minted by the open handler. Lives here and never in a URI.
     */
    id: string;
    url: string;
    /**
     * NG-001: the store row this tab writes, `web:<id>`. Absent for a new tab
     * (the row key is then `web:` + `id`); set when a Panorama card reopens a
     * tab that already has a row, so the reopened tab keeps its group, place
     * and thumbnail.
     */
    key?: string;
}

export interface WebTabState {
    url: string;
    title: string;
    loading: boolean;
    canGoBack: boolean;
    canGoForward: boolean;
    /** Phase 31 (D-31-01): chrome's connection decode, pushed with `url`; 'none' until the first location change. */
    securityState?: string;
    /** Phase 31 (D-31-03): the IDN-safe host chrome derived for display. */
    displaySpec?: string;
    /** Phase 31 (D-31-03): the registrable domain, or null when it cannot be derived. */
    baseDomain?: string | null;
    /** Phase 31 (D-31-02): the content-blocking log length chrome stashed. */
    blockedTrackers?: number;
    /** Phase 31 plan 02 (SITE-06): the ids of the non-default permissions, table order. */
    permissionIcons?: string[];
    /** Phase 31 plan 02: the upstream label of each id in permissionIcons, same order. */
    permissionLabels?: string[];
    /** Phase 31 plan 03 (SITE-08): whether the site has a tracking-protection exception; the identity box's shield. */
    shieldExcepted?: boolean;
}

/**
 * The web-tab kinds chrome serves: eight in `handleGroupMutation`, and the
 * Phase 27 kinds in `handleWebTabAction` (the boundary file's end-of-file
 * section). One stable set for the bridge gate.
 */
export type WebTabMessage =
    | { kind: 'webTabOpen'; tabId: string; url: string; key: string }
    | { kind: 'webTabGeometry'; tabId: string; x: number; y: number; w: number; h: number; visible: boolean }
    | { kind: 'webTabNavigate'; tabId: string; url: string }
    | { kind: 'webTabBack'; tabId: string }
    | { kind: 'webTabForward'; tabId: string }
    | { kind: 'webTabReload'; tabId: string; bypassCache?: boolean }
    | { kind: 'webTabClose'; tabId: string }
    | { kind: 'webTabFocus'; tabId: string }
    | { kind: 'webTabStop'; tabId: string }
    | { kind: 'webTabHistory'; tabId: string }
    | { kind: 'webTabGotoIndex'; tabId: string; index: number }
    | { kind: 'webTabActivated'; tabId: string | null }
    | { kind: 'webTabSiteInfo'; tabId: string }
    | { kind: 'webTabSetPermission'; tabId: string; id: string; state: string; origin: string }
    | { kind: 'webTabClearSiteData'; tabId: string; origin: string }
    | { kind: 'webTabShieldToggle'; tabId: string; origin: string; except: boolean };

/**
 * Window-frame messages the same channel carries for the custom title bar:
 * `windowChrome` asks how wide chrome's window buttons are (reply `width`),
 * `windowDragRegions` reports the empty rects of the frontend's top row
 * (CSS px in the frame) and that row's height, for chrome's drag handles.
 */
export type WindowMessage =
    | { kind: 'windowChrome' }
    | { kind: 'windowDragRegions'; rects: { x: number; y: number; w: number; h: number }[]; height: number };

/** NG-001: row messages on the same channel. A user close ends the row's open life (closed-tab history). */
export type TabRowMessage = { kind: 'closeTab'; uri: string } | { kind: 'touchTab'; uri: string };

export type ShellMessage = WebTabMessage | WindowMessage | TabRowMessage;

/** NAV-03: one session-history entry, as chrome's `webTabHistory` reply carries it. */
export interface WebTabHistoryEntry {
    index: number;
    title: string;
    url: string;
}

export interface WebTabReply {
    ok: boolean;
    where?: string;
    reason?: string;
    message?: string;
    width?: number;
    /** `webTabHistory`: the current entry's index (-1 when the history is empty). */
    index?: number;
    /** `webTabHistory`: at most 15 entries around the current one, ascending. */
    entries?: WebTabHistoryEntry[];
}

/** Phase 31 plan 02: one managed permission on this tab's principal, in table order. */
export interface WebTabPermissionRow {
    id: string;
    /** The effective state the row shows: `allow`, `block`, `block-audible`, `block-all` or `default`. */
    state: string;
    /** The saved state: `default` when no entry is saved (an entry equal to the default is never saved). Drives the cycle and the identity-box icons. */
    stored: string;
    /** The upstream label (`getPermissionLabel`), or null when upstream has none. */
    label: string | null;
}

/** Phase 31 (SITE-04): `webTabSiteInfo`'s reply; `ok` false or no `permissions` means the panel cannot show. */
export interface WebTabSiteInfo extends WebTabReply {
    /** The overlay's web origin, or null for a page a permission write would refuse; the panel echoes it on a write. */
    origin?: string | null;
    securityState?: string;
    displaySpec?: string;
    baseDomain?: string | null;
    issuer?: string | null;
    subject?: string | null;
    validFrom?: string | null;
    validTo?: string | null;
    permissions?: WebTabPermissionRow[];
}

/** Phase 31 plan 03 (SITE-08): `webTabShieldToggle`'s reply; `excepted` is the exception as chrome reads it after the change. */
export interface WebTabShieldReply extends WebTabReply {
    excepted?: boolean;
}

/** Phase 31 plan 03 (SITE-07): `webTabClearSiteData`'s reply; `where` is `cleared` on success. */
export interface WebTabClearReply extends WebTabReply {
    /** Whether the host still has site data after the clear (an exempt token cookie on 127.0.0.1 counts). */
    hasData?: boolean;
}

/**
 * The frontend end of the two-way bridge. `send` is fire-and-forget (a
 * requestId is supplied so the child's reply is well-formed, but no waiter
 * is registered and every correlator drops an unmatched response);
 * `request` awaits the ack with a timeout, for the few messages whose reply
 * decides UI state. One window-level listener receives every chrome push
 * and routes it to the widget registered under its tabId.
 *
 * Never read `dispatchEvent`'s return value as "chrome took it" -- measured
 * false twice in this tree even when chrome had acted on the message.
 */
@injectable()
export class WebTabChannel {

    private seq = 0;
    private readonly widgets = new Map<string, WebTabWidget>();
    private readonly pushHandlers = new Map<string, Set<(detail: Record<string, unknown>) => void>>();

    @postConstruct()
    protected init(): void {
        window.addEventListener(WEB_TAB_STATE_EVENT, this.onState);
        this.onPush('state', detail => {
            if (typeof detail.tabId !== 'string') {
                return;
            }
            const widget = this.widgets.get(detail.tabId);
            if (!widget) {
                return;
            }
            widget.applyState({
                url: typeof detail.url === 'string' ? detail.url : widget.url,
                title: typeof detail.title === 'string' ? detail.title : '',
                loading: detail.loading === true,
                canGoBack: detail.canGoBack === true,
                canGoForward: detail.canGoForward === true,
                securityState: typeof detail.securityState === 'string' ? detail.securityState : widget.securityState,
                displaySpec: typeof detail.displaySpec === 'string' ? detail.displaySpec : widget.displaySpec,
                baseDomain: typeof detail.baseDomain === 'string' || detail.baseDomain === null
                    ? detail.baseDomain as string | null
                    : widget.baseDomain,
                blockedTrackers: typeof detail.blockedTrackers === 'number' ? detail.blockedTrackers : widget.blockedTrackers,
                permissionIcons: Array.isArray(detail.permissionIcons) ? detail.permissionIcons.filter((id): id is string => typeof id === 'string') : widget.permissionIcons,
                permissionLabels: Array.isArray(detail.permissionLabels) ? detail.permissionLabels.filter((label): label is string => typeof label === 'string') : widget.permissionLabels,
            });
        });
    }

    /**
     * Subscribes to one push kind on the one chrome push event. Later phases
     * add kinds by subscribing here, never by editing the router.
     */
    onPush(kind: string, handler: (detail: Record<string, unknown>) => void): Disposable {
        const handlers = this.pushHandlers.get(kind) ?? new Set();
        handlers.add(handler);
        this.pushHandlers.set(kind, handlers);
        return Disposable.create(() => handlers.delete(handler));
    }

    /** The registered widget for a chrome-pushed tab id, if this frontend still has it. */
    widgetOf(tabId: string): WebTabWidget | undefined {
        return this.widgets.get(tabId);
    }

    register(tabId: string, widget: WebTabWidget): void {
        this.widgets.set(tabId, widget);
    }

    unregister(tabId: string): void {
        this.widgets.delete(tabId);
    }

    send(msg: ShellMessage): void {
        this.dispatch(this.requestId(msg.kind), msg);
    }

    request(msg: ShellMessage): Promise<WebTabReply> {
        return new Promise<WebTabReply>(resolve => {
            const requestId = this.requestId(msg.kind);
            const settle = (reply: WebTabReply): void => {
                window.removeEventListener(GROUP_RESPONSE_EVENT, onResponse);
                window.clearTimeout(timer);
                resolve(reply);
            };
            const onResponse = (event: Event): void => {
                const detail = (event as CustomEvent).detail as
                    { requestId?: unknown; reply?: unknown } | undefined;
                if (!detail || detail.requestId !== requestId) {
                    return;
                }
                const reply = detail.reply;
                settle(reply && typeof reply === 'object'
                    ? reply as WebTabReply
                    : { ok: false, reason: 'validation', message: 'malformed reply' });
            };
            const timer = window.setTimeout(() => settle({ ok: false, reason: 'timeout' }), WEB_TAB_ACK_TIMEOUT_MS);
            window.addEventListener(GROUP_RESPONSE_EVENT, onResponse);
            this.dispatch(requestId, msg);
        });
    }

    private requestId(kind: string): string {
        return `web-tab-${kind}-${Date.now().toString(36)}-${(this.seq += 1)}`;
    }

    private dispatch(requestId: string, msg: ShellMessage): void {
        // `document` target + bubbles:true are both load-bearing: the actor
        // child's listener sits on the window root, which a non-bubbling
        // event dispatched on `window` never reaches (GUI-DEFECTS item 10).
        document.dispatchEvent(new CustomEvent(GROUP_REQUEST_EVENT, {
            bubbles: true,
            detail: { requestId, msg },
        }));
    }

    private readonly onState = (event: Event): void => {
        const detail = (event as CustomEvent).detail as Record<string, unknown> | undefined;
        if (!detail || typeof detail !== 'object' || typeof detail.kind !== 'string') {
            return;
        }
        for (const handler of this.pushHandlers.get(detail.kind) ?? []) {
            try {
                handler(detail);
            } catch (error) {
                console.error('[@powerbrowser/tab-uris] push handler failed:', detail.kind, error);
            }
        }
    };
}

/**
 * The placeholder. Its node is what Lumino lays out; chrome paints the page
 * over exactly that rect. Geometry is published on every lifecycle hook
 * that can move or resize the node, coalesced to one animation frame per
 * widget with the latest rect winning, and skipped when byte-identical to
 * the last message sent.
 */
@injectable()
export class WebTabWidget extends BaseWidget {

    tabId: string;
    /** NG-001: the tab-store row this tab writes (`WebTabOptions.key`, else `web:<id>`). */
    rowKey = '';
    url: string;
    pageTitle = '';
    loading = false;
    canGoBack = false;
    canGoForward = false;
    lostView = false;
    /** Phase 31 (D-31-01): the last pushed connection state; undefined before the first push. */
    securityState: string | undefined;
    /** Phase 31 (D-31-03): the last pushed display host. */
    displaySpec: string | undefined;
    /** Phase 31 (D-31-03): the last pushed registrable domain. */
    baseDomain: string | null | undefined;
    /** Phase 31 (D-31-02): the last pushed blocked-tracker count. */
    blockedTrackers = 0;
    /** Phase 31 plan 02 (SITE-06): the non-default permission ids, table order; the identity box's icons. */
    permissionIcons: string[] = [];
    /** Phase 31 plan 02: the labels of permissionIcons, same order; the icons' tooltip. */
    permissionLabels: string[] = [];
    /** Phase 31 plan 03 (SITE-08): the last pushed or replied exception state; the identity box's shield. */
    shieldExcepted = false;

    protected readonly stateEmitter = new Emitter<WebTabState>();
    readonly onDidChangeState: TheiaEvent<WebTabState> = this.stateEmitter.event;

    @inject(WebTabChannel)
    protected readonly channel: WebTabChannel;

    protected raf = 0;
    protected lastSent = '';
    /** A focusPage() waiting for the publish that shows the overlay. */
    protected focusWanted = false;
    protected resizeObserver: ResizeObserver | undefined;
    protected listening = false;
    protected stateNode: HTMLDivElement;

    get hasPage(): boolean {
        return this.url !== EMPTY_PAGE_URL;
    }

    /** Reload enablement (UI-SPEC A7 + A10): a page to reload, or a lost view whose open Reload re-issues. */
    get canReload(): boolean {
        return this.hasPage || this.lostView;
    }

    init(options: WebTabOptions): void {
        // The Theia widget id -- an internal identifier, never shown.
        this.id = `${WEB_TAB_FACTORY_ID}:${options.id}`;
        this.tabId = options.id;
        this.rowKey = options.key ?? `web:${options.id}`;
        this.url = options.url;
        this.title.closable = true;
        this.title.iconClass = 'codicon codicon-globe';
        this.node.tabIndex = 0;
        this.addClass('pb-web-tab');
        // The one child: the empty-state / lost-view line, a text node
        // only. Live so a screen reader hears the state when it changes.
        this.stateNode = document.createElement('div');
        this.stateNode.className = 'pb-web-tab-state';
        this.stateNode.setAttribute('aria-live', 'polite');
        this.node.appendChild(this.stateNode);
        // Keyboard entry into the page (UI-SPEC A14): Enter or Space on the
        // focused placeholder hands focus to the overlay; leaving it again
        // is a page-scoped focus row (Alt+D, Ctrl+L, F6, Shift+F6) through the shortcut relay.
        this.node.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                this.focusPage();
            }
        });
        this.channel.register(this.tabId, this);
        this.refreshTitle();
        this.renderState();
    }

    /** The body text state. Fixed literals; the tab counter, empty-page URL, kinds and error text never reach it. */
    protected renderState(): void {
        if (this.lostView) {
            this.stateNode.textContent = LOST_VIEW_COPY;
            this.stateNode.classList.add('is-lost');
        } else if (!this.hasPage) {
            this.stateNode.textContent = EMPTY_STATE_COPY;
            this.stateNode.classList.remove('is-lost');
        } else {
            this.stateNode.textContent = '';
            this.stateNode.classList.remove('is-lost');
        }
    }

    protected setLostView(lost: boolean): void {
        if (this.lostView === lost) {
            return;
        }
        this.lostView = lost;
        this.renderState();
    }

    /** A reply that means chrome no longer renders (or never rendered) this tab. */
    protected static lostReply(reply: WebTabReply): boolean {
        return reply.ok !== true || reply.where === UNKNOWN_TAB_OUTCOME || reply.where === REFUSED_SCHEME_OUTCOME;
    }

    /** Label: page title -> page URL -> "New Tab". Caption: URL or "New Tab". Text values only, never markup. */
    protected refreshTitle(): void {
        this.title.label = this.pageTitle || (this.hasPage ? this.url : NEW_TAB_LABEL);
        this.title.caption = this.hasPage ? this.url : NEW_TAB_LABEL;
        this.node.setAttribute('aria-label', this.title.label);
    }

    protected onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        attachedWebTabs.add(this);
        ensureBodyObserver();
        // Lost-view detection (UI-SPEC A10/A11): the open is awaited, and a
        // refusal, a nack or silence (timeout included) marks the view lost.
        void this.channel.request({ kind: 'webTabOpen', tabId: this.tabId, url: this.url, key: this.rowKey })
            .then(reply => this.setLostView(WebTabWidget.lostReply(reply)));
        this.publish();
        if (!this.listening) {
            this.listening = true;
            this.resizeObserver = new ResizeObserver(() => this.publish());
            this.resizeObserver.observe(this.node);
            const onWindowResize = (): void => this.publish();
            window.addEventListener('resize', onWindowResize);
            this.toDispose.push({ dispose: () => window.removeEventListener('resize', onWindowResize) });
        }
    }

    protected onResize(msg: Widget.ResizeMessage): void {
        super.onResize(msg);
        this.publish();
    }

    protected onAfterShow(msg: Message): void {
        super.onAfterShow(msg);
        this.publish();
    }

    protected onBeforeHide(msg: Message): void {
        super.onBeforeHide(msg);
        this.publish();
    }

    protected onBeforeDetach(msg: Message): void {
        super.onBeforeDetach(msg);
        this.publish();
    }

    protected onCloseRequest(msg: Message): void {
        // NG-005: a close the user asked for marks the row closed; an overlay
        // dropped by a reload or the quit does not (it never passes here).
        this.channel.send({ kind: 'closeTab', uri: this.rowKey });
        this.channel.send({ kind: 'webTabClose', tabId: this.tabId });
        this.channel.unregister(this.tabId);
        super.onCloseRequest(msg);
    }

    protected onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        // NG-009: the tab's row records when it was last looked at.
        this.channel.send({ kind: 'touchTab', uri: this.rowKey });
    }

    dispose(): void {
        if (this.isDisposed) {
            return;
        }
        attachedWebTabs.delete(this);
        cancelAnimationFrame(this.raf);
        this.resizeObserver?.disconnect();
        this.resizeObserver = undefined;
        this.channel.unregister(this.tabId);
        // The window resize listener is on toDispose; the body observer is
        // shared and lives for the session.
        super.dispose();
    }

    /**
     * Coalesced geometry publish: one rAF per widget, latest rect wins,
     * identical messages skipped.
     *
     * The reply IS read (G-14.1.1-4). Geometry is the one message chrome
     * answers on every layout change, and the only one sent while the user is
     * idle, so its outcome is the only evidence available that the overlay is
     * gone before the user touches anything. Only the unknown-tab outcome
     * counts: `lostReply()`'s `ok !== true` arm is deliberately NOT reused
     * here, because a slow frame's `timeout` reply would then blank a live
     * page -- a worse defect than the one this closes.
     */
    publish(): void {
        cancelAnimationFrame(this.raf);
        this.raf = requestAnimationFrame(() => {
            if (this.isDisposed) {
                return;
            }
            const r = this.node.getBoundingClientRect();
            const showable = this.isAttached && this.isVisible && this.hasPage;
            const msg: WebTabMessage = {
                kind: 'webTabGeometry',
                tabId: this.tabId,
                x: Math.round(r.left),
                y: Math.round(r.top),
                w: Math.round(r.width),
                h: Math.round(r.height),
                visible: showable && !blockingLayerOpen(),
            };
            const key = JSON.stringify(msg);
            if (key !== this.lastSent) {
                this.lastSent = key;
                // Not awaited: `publish()` stays synchronous for its many callers.
                // The rAF coalescing and the `lastSent` dedupe above are what bound
                // the number of outstanding requests during a splitter drag, and
                // each request drops its listener on settle or at the ack timeout.
                void this.channel.request(msg).then(reply => {
                    if (this.isDisposed) {
                        return;
                    }
                    if (reply.where === UNKNOWN_TAB_OUTCOME) {
                        this.setLostView(true);
                    }
                });
            }
            // After the geometry: chrome applies messages in order. Held while
            // only a blocking layer hides the page; dropped if the tab cannot show.
            if (this.focusWanted && (msg.visible || !showable)) {
                this.focusWanted = false;
                if (msg.visible) {
                    this.channel.send({ kind: 'webTabFocus', tabId: this.tabId });
                }
            }
        });
    }

    async navigate(url: string): Promise<WebTabReply> {
        this.url = url;
        this.refreshTitle();
        this.renderState();
        // The tab now has a page, so the overlay becomes visible.
        this.publish();
        return this.settle(await this.channel.request({ kind: 'webTabNavigate', tabId: this.tabId, url }));
    }

    async back(): Promise<WebTabReply> {
        return this.settle(await this.channel.request({ kind: 'webTabBack', tabId: this.tabId }));
    }

    async forward(): Promise<WebTabReply> {
        return this.settle(await this.channel.request({ kind: 'webTabForward', tabId: this.tabId }));
    }

    /** NAV-03: the tab's windowed session history (reply `index` and `entries`). */
    async history(): Promise<WebTabReply> {
        return this.settleUnknownTab(await this.channel.request({ kind: 'webTabHistory', tabId: this.tabId }));
    }

    /** NAV-03: moves the tab to session-history entry `index`; chrome refuses an out-of-range one. */
    async gotoIndex(index: number): Promise<WebTabReply> {
        return this.settleUnknownTab(await this.channel.request({ kind: 'webTabGotoIndex', tabId: this.tabId, index }));
    }

    /**
     * Reload; on a lost view this re-issues the open for the current URL
     * instead (the contracted "Choose Reload to try again" affordance), and
     * republishes geometry from scratch so the re-created overlay gets a
     * rect the dedupe would otherwise have skipped. `bypassCache` (NAV-02) is
     * Firefox's hard reload; the lost-view reopen ignores it.
     */
    async reload(bypassCache = false): Promise<WebTabReply> {
        if (this.lostView) {
            return this.reopen();
        }
        const reply = this.settle(await this.channel.request({ kind: 'webTabReload', tabId: this.tabId, ...(bypassCache ? { bypassCache: true } : {}) }));
        // "One Reload, not two" (G-14.1.1-4). The overlay was dropped between
        // the last geometry publish and this click, so `publish()`'s reply
        // handler had nothing to observe; `settle()` has only just marked the
        // view lost. Re-issue the open in the SAME click rather than making the
        // user press Reload a second time to get the page back.
        if (this.lostView) {
            return this.reopen();
        }
        return reply;
    }

    /**
     * Re-issues the open for the current URL and republishes geometry from
     * scratch, so the re-created overlay gets a rect the dedupe would
     * otherwise have skipped. Both Reload arms above end here.
     */
    protected async reopen(): Promise<WebTabReply> {
        const reply = await this.channel.request({ kind: 'webTabOpen', tabId: this.tabId, url: this.url, key: this.rowKey });
        // One reading of "chrome no longer renders this tab" (G-14.1.1-48):
        // every site that folds an open-or-navigate reply -- onAfterAttach,
        // this reopen, and settle() -- reaches lost-view state through
        // `lostReply()`. publish()'s narrower unknown-tab-only arm (and
        // settleUnknownTab(), its twin for the history kinds) is the one
        // deliberate exception, for the reason its own doc comment gives: a
        // slow frame's timeout reply must not blank a live page. The `lost-reply`
        // assertions in scripts/verify-web-tab-bridge.mjs guard both halves
        // (`scripts/verify-platform.sh --only gui02-web-tab-bridge`): each
        // setLostView call-site argument must be the predicate call or a bare
        // identifier/boolean, and each exported outcome constant must appear
        // inside lostReply(). Not covered: a reading spelled as an `if` guard
        // around a bare boolean is invisible to the call-site pattern, and
        // publish() and settleUnknownTab() are the only instances of that shape here.
        this.setLostView(WebTabWidget.lostReply(reply));
        this.lastSent = '';
        this.publish();
        return reply;
    }

    /**
     * The history read and jump fold only unknown-tab, like publish(): their
     * validation refusal (an out-of-range index) and a timeout are answers
     * about the request, not evidence that the page is gone.
     */
    protected settleUnknownTab(reply: WebTabReply): WebTabReply {
        if (reply.where === UNKNOWN_TAB_OUTCOME) {
            this.setLostView(true);
        }
        return reply;
    }

    /** Folds a navigation reply into the lost-view state and hands it back. */
    protected settle(reply: WebTabReply): WebTabReply {
        this.setLostView(WebTabWidget.lostReply(reply));
        return reply;
    }

    /**
     * Gives the page keyboard focus. Gecko cannot focus a hidden <browser>,
     * and chrome shows the overlay only when a geometry publish says so, a
     * frame or more after a menu or dropdown closes or the tab is shown. So
     * the focus rides the next publish and reaches chrome after the geometry
     * that shows the page, never before it.
     */
    focusPage(): void {
        this.focusWanted = true;
        this.publish();
    }

    /** NAV-01: stops the page's load; the next state push turns Stop back into Reload. */
    stop(): void {
        this.channel.send({ kind: 'webTabStop', tabId: this.tabId });
    }

    /** Phase 31 (D-31-05): this tab's site information, keyed chrome-side by the overlay's own principal. */
    siteInfo(): Promise<WebTabSiteInfo> {
        return this.channel.request({ kind: 'webTabSiteInfo', tabId: this.tabId }) as Promise<WebTabSiteInfo>;
    }

    /**
     * Phase 31 plan 02 (D-31-05/D-31-06): one managed permission for this tab's
     * principal. Called only from the site panel's row handler. Chrome writes
     * only while the tab still shows `origin` (the one the panel displayed) and
     * the principal is a web page; the principal itself is chrome's, never sent.
     */
    setPermission(id: string, state: string, origin: string): Promise<WebTabSiteInfo> {
        return this.channel.request({ kind: 'webTabSetPermission', tabId: this.tabId, id, state, origin })
            .then(reply => {
                this.refreshPermissionIcons(reply as WebTabSiteInfo);
                return reply as WebTabSiteInfo;
            }) as Promise<WebTabSiteInfo>;
    }

    /**
     * Phase 31 plan 03 (SITE-07, D-31-12): clears this tab's site data (cookies
     * except the token, then non-cookie storage). Called only from the site
     * panel's confirm accept handler; chrome clears only while the tab still
     * shows `origin`, the origin the panel displayed.
     */
    clearSiteData(origin: string): Promise<WebTabClearReply> {
        return this.channel.request({ kind: 'webTabClearSiteData', tabId: this.tabId, origin }) as Promise<WebTabClearReply>;
    }

    /**
     * Phase 31 plan 03 (SITE-08, D-31-06): this site's tracking-protection
     * exception. Called only from the site panel's shield row handler; chrome
     * changes only the tab the panel showed (`origin` echo) and reloads it.
     */
    shieldToggle(origin: string, except: boolean): Promise<WebTabShieldReply> {
        return this.channel.request({ kind: 'webTabShieldToggle', tabId: this.tabId, origin, except })
            .then(reply => {
                this.refreshShield(reply as WebTabShieldReply);
                return reply as WebTabShieldReply;
            }) as Promise<WebTabShieldReply>;
    }

    /** Phase 31 plan 03 (SITE-08): the identity box's shield follows a shield reply without waiting for the next push. */
    protected refreshShield(reply: WebTabShieldReply): void {
        if (reply.ok === true && reply.where === 'applied' && typeof reply.excepted === 'boolean') {
            this.shieldExcepted = reply.excepted;
        }
    }

    /**
     * Phase 31 plan 02 (SITE-06): the identity box's icons follow a permission
     * reply without waiting for the next state push. The rows are chrome's own
     * (the reply's `permissions`); a refused or unanswered write changes nothing.
     */
    protected refreshPermissionIcons(reply: WebTabSiteInfo): void {
        if (reply.ok !== true || reply.where !== 'applied' || !Array.isArray(reply.permissions)) {
            return;
        }
        const shown = reply.permissions.filter(row => row.stored !== 'default');
        this.permissionIcons = shown.map(row => row.id);
        this.permissionLabels = shown.map(row => row.label ?? '');
    }

    applyState(state: WebTabState): void {
        this.url = state.url;
        this.pageTitle = state.title;
        this.loading = state.loading;
        this.canGoBack = state.canGoBack;
        this.canGoForward = state.canGoForward;
        if (state.securityState !== undefined) {
            this.securityState = state.securityState;
        }
        if (state.displaySpec !== undefined) {
            this.displaySpec = state.displaySpec;
        }
        if (state.baseDomain !== undefined) {
            this.baseDomain = state.baseDomain;
        }
        if (state.blockedTrackers !== undefined) {
            this.blockedTrackers = state.blockedTrackers;
        }
        if (state.permissionIcons !== undefined) {
            this.permissionIcons = state.permissionIcons;
        }
        if (state.permissionLabels !== undefined) {
            this.permissionLabels = state.permissionLabels;
        }
        if (state.shieldExcepted !== undefined) {
            this.shieldExcepted = state.shieldExcepted;
        }
        if (this.loading) {
            const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            this.title.iconClass = reduced ? 'codicon codicon-loading' : 'codicon codicon-loading codicon-modifier-spin';
        } else {
            this.title.iconClass = 'codicon codicon-globe';
        }
        this.refreshTitle();
        this.renderState();
        this.stateEmitter.fire(state);
    }
}

/**
 * Tells chrome which web tab is SELECTED in the main area (not merely
 * visible), or null when a non-web widget is current: one `webTabActivated`
 * per change of `mainPanel`'s current title, deduped against the last value
 * sent. Chrome keys the answer by this frame's own embedder element.
 */
@injectable()
export class WebTabActivationContribution implements FrontendApplicationContribution {

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(WebTabChannel)
    protected readonly channel: WebTabChannel;

    protected lastSent: string | null | undefined;

    onStart(): void {
        this.shell.mainPanel.onDidChangeCurrent(() => this.sync());
        this.sync();
    }

    protected sync(): void {
        const owner = this.shell.mainPanel.currentTitle?.owner;
        const tabId = owner instanceof WebTabWidget ? owner.tabId : null;
        if (tabId === this.lastSent) {
            return;
        }
        this.lastSent = tabId;
        this.channel.send({ kind: 'webTabActivated', tabId });
    }
}

/** Per-session tab counter; lives only in widget construction options, never in a URI (docs/URI-SCHEMES.md). */
let nextTabSeq = 0;

/**
 * A per-session discriminator, minted once at module load, carried in every
 * tab id this frontend session mints (G-14.1.1-5). Its only job is to make an
 * id from a persisted layout distinguishable from one minted now, so the
 * counter restarting at 0 can never collide with a described tab.
 *
 * It is NOT a security token and grants nothing: authorisation for a group
 * channel request is the chrome-side origin wall in `PowerBrowserAPI.sys.mjs`.
 * Like the counter it accompanies, it is a non-user-chosen discriminator, so
 * it lives in widget construction options and never in a URI
 * (docs/URI-SCHEMES.md:37-40).
 */
export const WEB_TAB_SESSION = Math.random().toString(36).slice(2, 8);

/** True only for an id minted by THIS frontend session. The factory's admission test. */
export function isCurrentSessionTabId(id: string): boolean {
    return typeof id === 'string' && id.startsWith(`wt-${WEB_TAB_SESSION}-`);
}

/** NG-008: opener options a Panorama card passes to reopen a web tab on the row it already has. */
export interface WebTabOpenerOptions extends OpenerOptions {
    rowKey?: string;
}

/**
 * Opens `http:`/`https:` URIs (and the empty page) as in-shell web tabs.
 * Priority 1000 clears stock `HttpOpenHandler` at 500 -- whose `open()`
 * hands the URI to `windowService.openNewWindow(..., { external: true })`,
 * i.e. an OS window -- while staying under `defaultHandlerPriority`, the
 * same reasoning as `view-open-handler.ts`. Every opener in the tree
 * (chrome bar, setups restore, Panorama dive, a link) reaches this through
 * `OpenerService`; none of them needs to know a web tab exists.
 */
@injectable()
export class WebTabOpenHandler implements OpenHandler {

    readonly id = WEB_TAB_OPEN_HANDLER_ID;

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    canHandle(uri: URI): number {
        return /^https?$/.test(uri.scheme) || uri.toString(true) === EMPTY_PAGE_URL ? 1000 : 0;
    }

    async open(uri: URI, options?: WebTabOpenerOptions): Promise<WebTabWidget> {
        return this.openUrl(uri.toString(true), options?.rowKey);
    }

    async openUrl(url: string, rowKey?: string): Promise<WebTabWidget> {
        const widget = await this.createWidget(url, rowKey);
        if (!widget.isAttached) {
            this.shell.addWidget(widget, { area: 'main' });
        }
        await this.shell.activateWidget(widget.id);
        return widget;
    }

    /** NAV-06: a new web tab directly after `ref`; the current tab stays current. */
    async openInBackground(url: string, ref: Widget): Promise<WebTabWidget> {
        if (!/^https?:\/\//i.test(url)) {
            throw new Error('@powerbrowser/tab-uris: openInBackground takes an http(s) URL only');
        }
        const widget = await this.createWidget(url);
        this.shell.addWidget(widget, { area: 'main', ref, mode: 'tab-after' });
        return widget;
    }

    protected createWidget(url: string, rowKey?: string): Promise<WebTabWidget> {
        const options: WebTabOptions = { id: `wt-${WEB_TAB_SESSION}-${++nextTabSeq}`, url, ...(rowKey ? { key: rowKey } : {}) };
        return this.widgetManager.getOrCreateWidget<WebTabWidget>(WEB_TAB_FACTORY_ID, options);
    }
}
