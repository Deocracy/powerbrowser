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
/** Phase 32 plan 08 (PAGE-11, D-25c): the crashed-tab copy and its button label, verbatim. Text nodes only. */
export const CRASHED_COPY = 'This tab crashed. Reload to try again.';
export const CRASHED_RELOAD_LABEL = 'Reload tab';

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
// Phase 37 plan 04 (D-08): the notification bar host. A bar is page furniture that shrinks the page rect, never a
// blocking layer, so this class stays out of the selector below (verify-permission-prompts.mjs).
const BAR_HOST_CLASS = 'pb-web-tab-bars';
// Phase 34 plan 04 (TAB-07, D-11): the strip's hover preview card is a rule (a) layer.
const BLOCKING_LAYER_SELECTOR = '.pb-chrome-bar-dropdown, .quick-input-widget, .lm-Widget.dialogOverlay, .lm-Menu, .lm-mod-drag-image, .pb-tab-preview';

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
    /** Phase 32 plan 01 (PAGE-02): the overlay's zoom factor, 1 = 100%, pushed with url. */
    zoom: number;
    /** Phase 32 plan 01 (PAGE-01): the Finder's current match index; 0 when no find is running. */
    findCurrent: number;
    /** Phase 32 plan 01 (PAGE-01): the Finder's match total for the running find. */
    findTotal: number;
    /** Phase 32 plan 01 (PAGE-01): the last find result; null when no find is running. */
    findStatus: 'found' | 'notFound' | 'wrapped' | null;
    /** Phase 32 plan 01 (PAGE-05): the overlay's mute flag, pushed with url. */
    audioMuted: boolean;
    /** Phase 32 plan 01 (PAGE-05): audible playback from the overlay, event-driven; false while the page is silent. */
    soundPlaying: boolean;
    /** Phase 32 plan 07 (PAGE-04): the tab's icon, a data:image/ URL of at most 64 KiB; null when there is none. Never fetched. */
    favicon: string | null;
    /** Phase 32 plan 07 (PAGE-11): true after the overlay's content process crashed; false again on the next page. */
    crashed: boolean;
    /** Phase 32 plan 07 (PAGE-10): true while the overlay shows the reader (its URI is about:reader). */
    isReaderMode: boolean;
    /** Phase 32 gap closure (PAGE-10): true while the page passed the reader's readability check; false on the next page. */
    isArticle: boolean;
    /**
     * Phase 34 plan 04 (TAB-09, D-12): the background tab's title changed since it was last active. Minted
     * chrome-side in the state push and cleared there on webTabActivated; the frontend only reads it.
     */
    titleChanged: boolean;
}

/** Phase 32 plan 04 (PAGE-06): a row action, the frozen set the chrome arm accepts. */
export type DownloadAction = 'cancel' | 'launch' | 'showContainingDirectory' | 'remove' | 'retry';

/**
 * Phase 37 plan 04 (D-08): the actions each notification bar offers. The fixed enum chrome's webTabBarAction arm
 * accepts (WEB_TAB_BAR_ACTIONS in PowerBrowserAPI.sys.mjs); verify-permission-prompts.mjs compares the two as sets.
 */
export const NOTIFICATION_BAR_ACTIONS = {
    'blocked-popup': ['allow-popup', 'dismiss'],
    'hung-script': ['stop-script', 'wait-longer'],
    'protocol-handler': ['add-handler', 'deny-handler'],
} as const;
export type NotificationBarKind = keyof typeof NOTIFICATION_BAR_ACTIONS;
export type NotificationBarAction = typeof NOTIFICATION_BAR_ACTIONS[NotificationBarKind][number];

/** Phase 37 plan 04: one bar as chrome pushed it: a token naming chrome's record, and display fields only. */
export interface NotificationBar {
    token: string;
    barKind: NotificationBarKind;
    displayFields: Record<string, unknown>;
}

/** A bar's message and the label of each action it offers; an action with no label is not shown. */
export interface NotificationBarText {
    message: string;
    labels: Partial<Record<NotificationBarAction, string>>;
    /** Actions drawn in the destructive colour (UI-SPEC: hung-script stop only). */
    destructive?: NotificationBarAction[];
}

/** Phase 37 plan 02 (D-05): whether a tab shares each kind now, as chrome observed it (sharingChanged push). */
export interface WebTabSharing {
    camera: boolean;
    microphone: boolean;
    screen: boolean;
}

/**
 * Phase 32 plan 04 (PAGE-06): one Downloads row as chrome serializes it. The
 * frame never gets a path or an error text: a failed row offers Retry.
 */
export interface WebTabDownloadRow {
    id: number;
    url: string;
    filename: string;
    bytesTotal: number;
    bytesReceived: number;
    state: 'in-progress' | 'finished' | 'canceled' | 'failed';
    succeeded: boolean;
    canceled: boolean;
    error: boolean;
}

const DOWNLOAD_STATES: readonly string[] = ['in-progress', 'finished', 'canceled', 'failed'];

/** Phase 32 plan 04 (PAGE-06): the rows of one downloadsChanged push; a malformed row is dropped, never rendered. */
export function downloadRowsOf(detail: Record<string, unknown>): WebTabDownloadRow[] {
    if (!Array.isArray(detail.rows)) {
        return [];
    }
    return detail.rows.filter((row): row is WebTabDownloadRow => !!row && typeof row === 'object'
        && typeof (row as WebTabDownloadRow).id === 'number'
        && typeof (row as WebTabDownloadRow).filename === 'string'
        && DOWNLOAD_STATES.includes((row as WebTabDownloadRow).state));
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
    | { kind: 'webTabShieldToggle'; tabId: string; origin: string; except: boolean }
    // Phase 32 plan 01 (PAGE-01/02): find and zoom. Counts and status return in the state push, not in these replies.
    | { kind: 'webTabFind'; tabId: string; query: string; caseSensitive?: boolean; entireWord?: boolean; highlightAll?: boolean }
    | { kind: 'webTabFindNext'; tabId: string; backwards?: boolean }
    | { kind: 'webTabFindClose'; tabId: string }
    | { kind: 'webTabZoomIn'; tabId: string }
    | { kind: 'webTabZoomOut'; tabId: string }
    | { kind: 'webTabZoomReset'; tabId: string }
    // Phase 32 plan 04 (PAGE-06): the Downloads view. Rows arrive in downloadsChanged pushes; the replies carry only the outcome.
    | { kind: 'webTabDownloadsSubscribe'; tabId: string }
    | { kind: 'webTabDownloadsAction'; tabId: string; id: number; action: DownloadAction }
    // Phase 32 plan 01 (PAGE-05): mute is an explicit flag, never a toggle.
    | { kind: 'webTabMute'; tabId: string; muted: boolean }
    // Phase 32 plan 03 (PAGE-03): the system-dialog print of this tab's page; the options are booleans only.
    | { kind: 'webTabPrint'; tabId: string; selectionOnly?: boolean }
    // Phase 32 plan 05 (PAGE-08): picker-split save. Pick proposes a file name and writes nothing; export copies the minted page to the picked path.
    | { kind: 'webTabSavePick'; tabId: string }
    | { kind: 'webTabSaveExport'; tabId: string; path: string }
    // Phase 32 plan 06 (PAGE-09): the chrome-help edit set the edit-today probe recorded. Keys never send this kind;
    // only a Theia-initiated Edit item does. checkOnly reads enablement and runs nothing.
    | { kind: 'webTabEdit'; tabId: string; cmd: 'cmd_undo' | 'cmd_redo' | 'cmd_cut' | 'cmd_copy' | 'cmd_paste' | 'cmd_selectAll' | 'cmd_delete'; checkOnly?: boolean }
    // Phase 32 plan 07 (PAGE-10): reader enter/leave (same overlay), view source (the inner page is the overlay's own; the
    // source URL is minted chrome-side, never sent by the frame) and DevTools (the stock toolbox window for this tab, minted chrome-side).
    | { kind: 'webTabReader'; tabId: string; enter: boolean }
    | { kind: 'webTabViewSource'; tabId: string; inNewTab?: boolean }
    | { kind: 'webTabDevtools'; tabId: string }
    // Phase 36 (PROMPT-05): the ack for a page's new window chrome adopted; pcKey is chrome's correlator, never shown.
    | { kind: 'webTabAdopt'; tabId: string; pcKey: string }
    // Phase 37 plan 04 (D-08): a notification bar's button; the token names chrome's record, the action is the fixed enum.
    | { kind: 'webTabBarAction'; tabId: string; token: string; action: NotificationBarAction };

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
    /** `webTabSavePick`: the proposed file name (a page title, bounded, with an .html suffix). */
    suggestedName?: string;
}

/** Phase 31 plan 02: one managed permission on this tab's principal, in table order. */
export interface WebTabPermissionRow {
    /** WR-05: the state name the permission reads as with no saved entry (the default). */
    defaultState?: string;
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
    /** Phase 31 plan 03 (SITE-07): whether the site still has site data. */
    hasData?: boolean;
    /** Phase 31 plan 03 (SITE-08): the blocked-tracker count and whether the site has an exception. */
    shield?: { count: number; excepted: boolean };
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
            const iconBefore = widget.favicon;
            const crashedBefore = widget.crashed;
            // 32-REVIEW WR-11: the strip's audio mark follows the mute and playback state too.
            const audioBefore = `${widget.audioMuted}/${widget.soundPlaying}`;
            const titleChangedBefore = widget.titleChanged;
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
                // CR-02 / O-31-A: chrome pushes this on every state push, so a navigation resets it with the page.
                shieldExcepted: typeof detail.shieldExcepted === 'boolean' ? detail.shieldExcepted : widget.shieldExcepted,
                // Phase 32 plan 01: zoom and find counts ride the push of url; primitives only.
                zoom: typeof detail.zoom === 'number' ? detail.zoom : widget.zoom,
                findCurrent: typeof detail.findCurrent === 'number' ? detail.findCurrent : widget.findCurrent,
                findTotal: typeof detail.findTotal === 'number' ? detail.findTotal : widget.findTotal,
                findStatus: detail.findStatus === 'found' || detail.findStatus === 'notFound' || detail.findStatus === 'wrapped'
                    ? detail.findStatus
                    : detail.findStatus === null ? null : widget.findStatus,
                audioMuted: typeof detail.audioMuted === 'boolean' ? detail.audioMuted : widget.audioMuted,
                soundPlaying: typeof detail.soundPlaying === 'boolean' ? detail.soundPlaying : widget.soundPlaying,
                // Phase 32 plan 07: favicon, crash and reader state ride the same push; primitives or a bounded data: icon only.
                favicon: typeof detail.favicon === 'string' || detail.favicon === null ? detail.favicon as string | null : widget.favicon,
                crashed: typeof detail.crashed === 'boolean' ? detail.crashed : widget.crashed,
                isReaderMode: typeof detail.isReaderMode === 'boolean' ? detail.isReaderMode : widget.isReaderMode,
                isArticle: typeof detail.isArticle === 'boolean' ? detail.isArticle : widget.isArticle,
                // Phase 34 plan 04 (TAB-09): chrome mints the flag on every state push; anything but true reads false.
                titleChanged: detail.titleChanged === true,
            });
            if (iconBefore !== widget.favicon || crashedBefore !== widget.crashed || audioBefore !== `${widget.audioMuted}/${widget.soundPlaying}`
                || titleChangedBefore !== widget.titleChanged) {
                this.tabStatusEmitter.fire(widget);
            }
        });
        // Phase 32 plan 04 (PAGE-06): the Downloads rows arrive whole in each push; the bar reads them through onDidChangeDownloads.
        this.onPush('downloadsChanged', detail => {
            this.downloadRows = downloadRowsOf(detail);
            this.downloadsEmitter.fire(this.downloadRows);
        });
        // Phase 37 plan 01 (D-11): where a stock prompt is, never its answer. Display-only: the strip marks the tab while
        // any of its prompts waits, and nothing here sends a message back.
        this.onPush('doorhanger', detail => {
            const widget = typeof detail.tabId === 'string' ? this.widgets.get(detail.tabId) : undefined;
            if (!widget || typeof detail.token !== 'string') {
                return;
            }
            const before = widget.pendingPrompt;
            if (detail.pending === true) {
                widget.pendingPrompts.add(detail.token);
            } else {
                widget.pendingPrompts.delete(detail.token);
            }
            if (before !== widget.pendingPrompt) {
                this.tabStatusEmitter.fire(widget);
            }
        });
        // Phase 37 plan 02 (D-05): what a tab shares, as chrome read it from webrtcUI. Display-only: nothing is sent back,
        // and an unknown tab is ignored, so no indicator shows for it.
        this.onPush('sharingChanged', detail => {
            const widget = typeof detail.tabId === 'string' ? this.widgets.get(detail.tabId) : undefined;
            if (!widget) {
                return;
            }
            widget.sharing = { camera: detail.camera === true, microphone: detail.microphone === true, screen: detail.screen === true };
            this.tabStatusEmitter.fire(widget);
        });
        // Phase 37 plan 04 (D-08): a tab's notification bar appears, changes or goes. Only a known bar kind is kept, and
        // only display fields: the record the bar's buttons act on stays in chrome.
        this.onPush('notificationBar', detail => {
            const widget = typeof detail.tabId === 'string' ? this.widgets.get(detail.tabId) : undefined;
            const barKind = detail.barKind;
            if (!widget || typeof detail.token !== 'string' || typeof barKind !== 'string' || !Object.prototype.hasOwnProperty.call(NOTIFICATION_BAR_ACTIONS, barKind)) {
                return;
            }
            const fields = detail.displayFields;
            widget.setNotificationBar(barKind as NotificationBarKind, detail.visible === true
                ? { token: detail.token, barKind: barKind as NotificationBarKind, displayFields: typeof fields === 'object' && fields !== null ? fields as Record<string, unknown> : {} }
                : undefined);
        });
    }

    /** Phase 37 plan 04: the bar copy, supplied by chrome-bar (which owns CHROME_BAR_COPY and depends on this package). */
    barCopy: ((bar: NotificationBar) => NotificationBarText | undefined) | undefined;

    setBarCopy(copy: (bar: NotificationBar) => NotificationBarText | undefined): void {
        this.barCopy = copy;
        this.widgets.forEach(widget => widget.renderBars());
    }

    /** Phase 32 plan 04 (PAGE-06): the last Downloads rows chrome pushed, newest first. */
    downloadRows: WebTabDownloadRow[] = [];
    private readonly downloadsEmitter = new Emitter<WebTabDownloadRow[]>();
    readonly onDidChangeDownloads: TheiaEvent<WebTabDownloadRow[]> = this.downloadsEmitter.event;

    /** Phase 32 plan 08 (PAGE-04, PAGE-11): fires when a web tab's pushed favicon, crash flag or (34-04) attention flag changes, so the strip redraws. */
    private readonly tabStatusEmitter = new Emitter<WebTabWidget>();
    readonly onDidChangeTabStatus: TheiaEvent<WebTabWidget> = this.tabStatusEmitter.event;

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
    /** 36-REVIEW WR-04: a page's new window chrome adopted; set by markAdopted() only. Never restored. */
    protected adopted = false;
    /** Phase 31 (D-31-01): the last pushed connection state; undefined before the first push. */
    securityState: string | undefined;
    /** Phase 31 (D-31-03): the last pushed display host. */
    displaySpec: string | undefined;
    /** Phase 31 (D-31-03): the last pushed registrable domain. */
    baseDomain: string | null | undefined;
    /** Phase 31 (D-31-02): the last pushed blocked-tracker count. */
    blockedTrackers = 0;
    /** Phase 32 plan 01 (PAGE-02): the last pushed zoom factor, 1 = 100%. */
    zoom = 1;
    /** Phase 32 plan 01 (PAGE-01): the last pushed find match index. */
    findCurrent = 0;
    /** Phase 32 plan 01 (PAGE-01): the last pushed find match total. */
    findTotal = 0;
    /** Phase 32 plan 01 (PAGE-01): the last pushed find result, null when no find is running. */
    findStatus: WebTabState['findStatus'] = null;

    /** PAGE-03: true after a print could not open its dialog; the bar shows the notice until the next print. Never pushed. */
    printFailed = false;
    /** PAGE-08: true after a save could not complete; the bar shows the notice until the next save. Never pushed. */
    saveFailed = false;
    /** Phase 32 plan 01 (PAGE-05): the last pushed mute flag. */
    audioMuted = false;
    /** Phase 32 plan 01 (PAGE-05): the last pushed audible-playback flag. */
    soundPlaying = false;
    /** Phase 32 plan 07 (PAGE-04): the last pushed tab icon (a bounded data: URL), or null. */
    favicon: string | null = null;
    /** Phase 32 plan 07 (PAGE-11): the last pushed crash flag. */
    crashed = false;
    /** Phase 32 plan 07 (PAGE-10): the last pushed reader flag. */
    isReaderMode = false;
    /** Phase 32 gap closure (PAGE-10): the last pushed readability signal; the reader toggle is enabled by it or by reader view. */
    isArticle = false;
    /** Phase 34 plan 04 (TAB-09): the last pushed attention flag; written only by applyState from the state push. */
    titleChanged = false;
    /** Phase 31 plan 02 (SITE-06): the non-default permission ids, table order; the identity box's icons. */
    permissionIcons: string[] = [];
    /** Phase 31 plan 02: the labels of permissionIcons, same order; the icons' tooltip. */
    permissionLabels: string[] = [];
    /** Phase 31 plan 03 (SITE-08): the last pushed or replied exception state; the identity box's shield. */
    shieldExcepted = false;
    /** Phase 37 plan 01 (D-11): the tokens of this tab's waiting stock prompts, from the display-only doorhanger push. */
    readonly pendingPrompts = new Set<string>();

    /** Phase 37 plan 01: true while any stock prompt of this tab waits for its answer; the strip's pending mark. */
    get pendingPrompt(): boolean {
        return this.pendingPrompts.size > 0;
    }

    /** Phase 37 plan 02 (D-05): the kinds this tab shares now, only from chrome's sharingChanged push; all false until one arrives. */
    sharing: WebTabSharing = { camera: false, microphone: false, screen: false };

    /** Phase 37 plan 04 (D-08): this tab's notification bars, one per kind, from chrome's notificationBar push. */
    readonly notificationBars = new Map<NotificationBarKind, NotificationBar>();
    /** The bar host: inside this widget, above the page; the page rect published below it shrinks by its height. */
    protected barsNode: HTMLDivElement;

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

    /**
     * An adopted about:blank counts as a page (36-REVIEW WR-04): its opener's script may write it, so it is shown,
     * titled and captioned "about:blank" and given the pushed identity, never presented as a trusted New Tab.
     */
    get hasPage(): boolean {
        return this.url !== EMPTY_PAGE_URL || this.adopted;
    }

    /** 36-REVIEW WR-04: the ack landed; from here on this tab is page content, on about:blank included. */
    markAdopted(): void {
        this.adopted = true;
        this.refreshTitle();
        this.renderState();
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
        // The state text: the empty-state or lost-view line (text only), or
        // the crash copy with its Reload button (PAGE-11). Live so a screen
        // reader hears the state when it changes.
        this.stateNode = document.createElement('div');
        this.stateNode.className = 'pb-web-tab-state';
        this.stateNode.setAttribute('aria-live', 'polite');
        this.node.appendChild(this.stateNode);
        this.barsNode = document.createElement('div');
        this.barsNode.className = BAR_HOST_CLASS;
        this.barsNode.setAttribute('aria-live', 'polite');
        this.node.appendChild(this.barsNode);
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
        if (this.crashed) {
            // PAGE-11 (32-08): the crash UI is this placeholder; publish() hides the overlay while the tab is crashed.
            // Built once per crash: a repeat render would drop keyboard focus from the Reload button.
            if (!this.stateNode.classList.contains('is-crashed')) {
                this.renderCrashed();
            }
            this.stateNode.classList.remove('is-lost');
            return;
        }
        this.stateNode.classList.remove('is-crashed');
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

    /** PAGE-11 (32-08): the contracted crash copy and its Reload button, which runs the existing reload path. */
    protected renderCrashed(): void {
        const text = document.createElement('span');
        text.className = 'pb-web-tab-crash-copy';
        text.textContent = CRASHED_COPY;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'pb-web-tab-reload';
        button.textContent = CRASHED_RELOAD_LABEL;
        button.addEventListener('click', () => void this.reload());
        // The placeholder's Enter and Space handler hands focus to the page; the button keeps its own activation.
        button.addEventListener('keydown', event => event.stopPropagation());
        this.stateNode.replaceChildren(text, button);
        this.stateNode.classList.add('is-crashed');
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
            // D-08: the notification bars sit at the top of this node, so the page starts below them and never under them.
            const bars = Math.min(this.barsNode.offsetHeight, r.height);
            // A crashed tab is not showable: the overlay hides and the placeholder carries the crash UI (PAGE-11, 32-08).
            const showable = this.isAttached && this.isVisible && this.hasPage && !this.crashed;
            const msg: WebTabMessage = {
                kind: 'webTabGeometry',
                tabId: this.tabId,
                x: Math.round(r.left),
                y: Math.round(r.top + bars),
                w: Math.round(r.width),
                h: Math.round(r.height - bars),
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

    /** Phase 37 plan 04: shows, replaces or (undefined) removes this tab's bar of one kind. */
    setNotificationBar(barKind: NotificationBarKind, bar: NotificationBar | undefined): void {
        if (bar) {
            this.notificationBars.set(barKind, bar);
        } else {
            this.notificationBars.delete(barKind);
        }
        this.renderBars();
    }

    /** The bars, text values only; then the geometry, so the page rect follows the bar height in the same frame. */
    renderBars(): void {
        const copy = this.channel.barCopy;
        const rows: HTMLElement[] = [];
        for (const bar of this.notificationBars.values()) {
            const text = copy?.(bar);
            if (!text) {
                continue;
            }
            const row = document.createElement('div');
            row.className = 'pb-web-tab-bar';
            row.setAttribute('role', 'status');
            const message = document.createElement('span');
            message.className = 'pb-web-tab-bar-message';
            message.textContent = text.message;
            row.appendChild(message);
            for (const action of NOTIFICATION_BAR_ACTIONS[bar.barKind] as readonly NotificationBarAction[]) {
                const label = text.labels[action];
                if (!label) {
                    continue;
                }
                const button = document.createElement('button');
                button.type = 'button';
                button.className = text.destructive?.includes(action) ? 'theia-button pb-web-tab-bar-destructive' : 'theia-button';
                button.textContent = label;
                button.addEventListener('click', () => void this.barAction(bar.token, action));
                // The placeholder's Enter and Space handler hands focus to the page; the button keeps its own activation.
                button.addEventListener('keydown', event => event.stopPropagation());
                row.appendChild(button);
            }
            rows.push(row);
        }
        this.barsNode.replaceChildren(...rows);
        this.publish();
    }

    /** A bar button: the token and one action of its bar's fixed set. Chrome resolves the record and pushes the result. */
    async barAction(token: string, action: NotificationBarAction): Promise<WebTabReply> {
        return this.settleUnknownTab(await this.channel.request({ kind: 'webTabBarAction', tabId: this.tabId, token, action }));
    }

    async navigate(url: string): Promise<WebTabReply> {
        this.url = url;
        this.refreshTitle();
        this.renderState();
        // 32-REVIEW WR-08: a crashed overlay cannot load, so it is recreated at the new URL; chrome restores its kept
        // history first and then goes there.
        if (this.crashed) {
            return this.recreate();
        }
        // The tab now has a page, so the overlay becomes visible.
        this.publish();
        return this.settle(await this.channel.request({ kind: 'webTabNavigate', tabId: this.tabId, url }));
    }

    async back(): Promise<WebTabReply> {
        if (this.crashed) {
            return this.recreate();
        }
        return this.settle(await this.channel.request({ kind: 'webTabBack', tabId: this.tabId }));
    }

    async forward(): Promise<WebTabReply> {
        if (this.crashed) {
            return this.recreate();
        }
        return this.settle(await this.channel.request({ kind: 'webTabForward', tabId: this.tabId }));
    }

    /** NAV-03: the tab's windowed session history (reply `index` and `entries`). */
    /** Phase 32 plan 04 (PAGE-06): subscribes this frame to the Downloads view; repeated calls only re-point the push. */
    async downloadsSubscribe(): Promise<WebTabReply> {
        return this.settleUnknownTab(await this.channel.request({ kind: 'webTabDownloadsSubscribe', tabId: this.tabId }));
    }

    /** Phase 32 plan 04 (PAGE-06): one row action by the chrome-assigned row id; the row changes arrive as a push. */
    async downloadAction(id: number, action: DownloadAction): Promise<WebTabReply> {
        return this.settleUnknownTab(await this.channel.request({ kind: 'webTabDownloadsAction', tabId: this.tabId, id, action }));
    }

    async history(): Promise<WebTabReply> {
        return this.settleUnknownTab(await this.channel.request({ kind: 'webTabHistory', tabId: this.tabId }));
    }

    /** NAV-03: moves the tab to session-history entry `index`; chrome refuses an out-of-range one. */
    async gotoIndex(index: number): Promise<WebTabReply> {
        if (this.crashed) {
            return this.recreate();
        }
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
        if (this.crashed) {
            return this.recreate();
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
     * PAGE-11 (32-08): a crashed overlay has no remote tab, so webTabReload and a
     * history jump both fail on it (live, 32-08). Its overlay is closed and opened
     * again at the same URL with the same tab id instead. Chrome keeps the crashed
     * overlay's session history across the close and restores it on the open, so
     * Back and Forward still hold the page's entries.
     */
    protected async recreate(): Promise<WebTabReply> {
        await this.channel.request({ kind: 'webTabClose', tabId: this.tabId });
        return this.reopen();
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

    /** Phase 32 plan 02 (PAGE-01): the query last run in this tab; kept in memory only, never logged and never pushed. */
    findQuery = '';

    /** PAGE-01: runs the find in the page. Counts and status return in the state push, not in this reply. */
    async find(query: string, options: { caseSensitive?: boolean; entireWord?: boolean; highlightAll?: boolean } = {}): Promise<WebTabReply> {
        this.findQuery = query;
        this.findOptions = options;
        return this.settleUnknownTab(await this.channel.request({ kind: 'webTabFind', tabId: this.tabId, query, ...options }));
    }

    protected findOptions: { caseSensitive?: boolean; entireWord?: boolean; highlightAll?: boolean } = {};

    /**
     * PAGE-01: steps to the next match of the last query, or to the previous one with `backwards`. A new page resets
     * chrome's query while the bar still shows this one, so `no-query` re-runs it (32-REVIEW WR-06).
     */
    async findNext(backwards = false): Promise<WebTabReply> {
        const reply = this.settleUnknownTab(await this.channel.request({ kind: 'webTabFindNext', tabId: this.tabId, backwards }));
        return reply.ok && reply.where === 'no-query' && this.findQuery.length > 0 ? this.find(this.findQuery, this.findOptions) : reply;
    }

    /** PAGE-01: ends the find and clears the page selection. The stored query stays for the next open. */
    async findClose(): Promise<WebTabReply> {
        return this.settleUnknownTab(await this.channel.request({ kind: 'webTabFindClose', tabId: this.tabId }));
    }

    /** PAGE-02: one zoom step in; the new level arrives in the state push. */
    async zoomIn(): Promise<WebTabReply> {
        return this.settleUnknownTab(await this.channel.request({ kind: 'webTabZoomIn', tabId: this.tabId }));
    }

    /** PAGE-02: one zoom step out. */
    async zoomOut(): Promise<WebTabReply> {
        return this.settleUnknownTab(await this.channel.request({ kind: 'webTabZoomOut', tabId: this.tabId }));
    }

    /** PAGE-02: back to 100%. */
    async zoomReset(): Promise<WebTabReply> {
        return this.settleUnknownTab(await this.channel.request({ kind: 'webTabZoomReset', tabId: this.tabId }));
    }

    /**
     * PAGE-10 (32-08): the reader toggle is enabled on an article page (the pushed readability signal), or while the page
     * is already in reader view (so Exit stays reachable). An ordinary page has the toggle disabled.
     */
    get canToggleReader(): boolean {
        return this.isReaderMode || this.isArticle;
    }

    /**
     * PAGE-10 (32-08): enters or leaves reader view in this same tab, so Back and Forward keep the page's history.
     * A refusal is a validation answer about the page, not a lost view, so it never blanks the tab.
     */
    async setReader(enter: boolean): Promise<WebTabReply> {
        return this.settleUnknownTab(await this.channel.request({ kind: 'webTabReader', tabId: this.tabId, enter }));
    }

    /**
     * PAGE-10 (32-08): loads this page's source in this same tab. Chrome mints the source URL itself; this widget
     * sends only the tab id, so no view-source URL is ever held here.
     */
    async viewSource(): Promise<WebTabReply> {
        return this.settleUnknownTab(await this.channel.request({ kind: 'webTabViewSource', tabId: this.tabId }));
    }

    /**
     * PAGE-10 (32-07 gap closure): opens the stock DevTools toolbox window for this tab's page. Chrome opens it; this widget
     * sends only the tab id. A second call raises the same toolbox. Closing the tab closes the toolbox.
     */
    async openDevtools(): Promise<WebTabReply> {
        return this.settleUnknownTab(await this.channel.request({ kind: 'webTabDevtools', tabId: this.tabId }));
    }

    /** PAGE-05: mutes or unmutes this tab. The flag is explicit, never a toggle; the reply reads `audioMuted` back. */
    async setMuted(muted: boolean): Promise<WebTabReply> {
        return this.settleUnknownTab(await this.channel.request({ kind: 'webTabMute', tabId: this.tabId, muted }));
    }

    /** PAGE-03: opens the system print dialog for this tab's page. A cancel is a clean no-op; a failed open sets the bar's notice. */
    async print(selectionOnly = false): Promise<WebTabReply> {
        const reply = this.settleUnknownTab(await this.channel.request({ kind: 'webTabPrint', tabId: this.tabId, ...(selectionOnly ? { selectionOnly } : {}) }));
        const failed = reply.ok !== true;
        if (this.printFailed !== failed) {
            this.printFailed = failed;
            this.renderState();
        }
        return reply;
    }

    /** PAGE-09: a Theia-initiated Edit item runs `cmd` on this tab's page; checkOnly reads enablement and runs nothing. */
    async edit(cmd: Extract<WebTabMessage, { kind: 'webTabEdit' }>['cmd'], checkOnly = false): Promise<WebTabReply> {
        return this.settleUnknownTab(await this.channel.request({ kind: 'webTabEdit', tabId: this.tabId, cmd, ...(checkOnly ? { checkOnly } : {}) }));
    }

    /**
     * PAGE-08: saves this tab's page to a file the user picks. `choose` shows the save dialog and resolves to the picked
     * path, or undefined on cancel. Pick and export are separate kinds; chrome writes the copy, and a failure sets the notice.
     */
    async savePage(choose: (suggestedName: string) => Promise<string | undefined>): Promise<WebTabReply> {
        const picked = this.settleUnknownTab(await this.channel.request({ kind: 'webTabSavePick', tabId: this.tabId }));
        let reply: WebTabReply = picked;
        if (picked.ok === true && picked.where === 'ready') {
            let path: string | undefined;
            try {
                path = await choose(picked.suggestedName ?? 'page.html');
            } catch {
                return this.settleSave({ ok: false, reason: 'unavailable', message: 'the save dialog did not open' });
            }
            reply = path === undefined
                ? { ok: true, where: 'cancelled' }
                : this.settleUnknownTab(await this.channel.request({ kind: 'webTabSaveExport', tabId: this.tabId, path }));
        }
        return this.settleSave(reply);
    }

    /** PAGE-08: sets the save notice from a reply. A success or a cancel clears it; any other outcome shows it. */
    protected settleSave(reply: WebTabReply): WebTabReply {
        const failed = reply.ok !== true;
        if (this.saveFailed !== failed) {
            this.saveFailed = failed;
            this.renderState();
        }
        return reply;
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
        // A crashed overlay has no remote tab to step (32-REVIEW WR-08); Reload tab is the affordance.
        this.canGoBack = state.canGoBack && !state.crashed;
        this.canGoForward = state.canGoForward && !state.crashed;
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
        this.zoom = state.zoom;
        this.findCurrent = state.findCurrent;
        this.findTotal = state.findTotal;
        this.findStatus = state.findStatus;
        this.audioMuted = state.audioMuted;
        this.soundPlaying = state.soundPlaying;
        this.favicon = state.favicon;
        const crashChanged = this.crashed !== state.crashed;
        this.crashed = state.crashed;
        this.isReaderMode = state.isReaderMode;
        this.isArticle = state.isArticle;
        this.titleChanged = state.titleChanged;
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
        if (crashChanged) {
            // The overlay shows or hides with the crash flag, so the geometry must be republished.
            this.publish();
        }
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
export class WebTabOpenHandler implements OpenHandler, FrontendApplicationContribution {

    readonly id = WEB_TAB_OPEN_HANDLER_ID;

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(WebTabChannel)
    protected readonly channel: WebTabChannel;

    /** Phase 36 (PROMPT-05): a page's new window, which chrome already holds, lands as a web tab next to its opener. */
    onStart(): void {
        // adopt() is async, so the router's synchronous try/catch cannot see its rejection; log the kind only.
        this.channel.onPush('adoptTab', detail => void this.adopt(detail).catch(() => console.error('[@powerbrowser/tab-uris] adopt failed:', 'adoptTab')));
        this.channel.onPush('dropAdoptedTab', detail => this.dropAdopted(detail.tabId));
        this.channel.onPush('closeAdoptedTab', detail => this.closeAdopted(detail.tabId));
    }

    /**
     * The ack goes BEFORE the widget attaches: chrome moves its pending overlay
     * to this widget's id, so the widget's own webTabOpen on attach finds it
     * "already-open" instead of building a second overlay. A refusal means
     * chrome no longer holds it (its 5 s fallback opened the page in the
     * stock window), so the widget is dropped unshown. A timeout is not a
     * refusal: chrome is asked whether it holds the overlay before anything
     * is dropped.
     */
    async adopt(detail: Record<string, unknown>): Promise<void> {
        const { pcKey, openerTabId, url, background } = detail;
        if (typeof pcKey !== 'string' || typeof openerTabId !== 'string' || typeof url !== 'string' || typeof background !== 'boolean') {
            console.warn('[@powerbrowser/tab-uris] adopt dropped:', 'adoptTab');
            return;
        }
        const widget = await this.createWidget(url);
        // webTabClose releases the overlay and its row if chrome holds them, and answers unknown-tab otherwise.
        const dropUnshown = (): void => {
            this.channel.send({ kind: 'webTabClose', tabId: widget.tabId });
            widget.dispose();
        };
        // tabId, never widget.id: chrome's webTabIdIsValid refuses the factory-prefixed widget id.
        let reply = await this.channel.request({ kind: 'webTabAdopt', tabId: widget.tabId, pcKey });
        if (reply.ok !== true && reply.reason === 'timeout' && !widget.isDisposed) {
            // 36-REVIEW WR-02: chrome answers in order, so a read sent after a late ack says who owns the page: an
            // overlay held under tabId means chrome adopted it (keep the tab); unknown-tab means its fallback took it.
            const held = await this.channel.request({ kind: 'webTabHistory', tabId: widget.tabId });
            reply = held.ok === true && held.where !== UNKNOWN_TAB_OUTCOME ? { ok: true } : held;
        }
        if (reply.ok !== true || widget.isDisposed) {
            // A second silence: the close queues behind the ack, so chrome and this frontend still agree no tab exists.
            dropUnshown();
            return;
        }
        widget.markAdopted();
        // An opener closed meanwhile: the tab still lands, at the end, rather than being dropped.
        const opener = this.channel.widgetOf(openerTabId);
        try {
            this.shell.addWidget(widget, opener ? { area: 'main', ref: opener, mode: 'tab-after' } : { area: 'main' });
            if (!background) {
                await this.shell.activateWidget(widget.id);
            }
        } catch (err) {
            // 36-REVIEW WR-01: chrome holds the overlay and its row from the ack on, so a widget that never attached releases both.
            if (!widget.isAttached) {
                dropUnshown();
            }
            throw err;
        }
    }

    /** Chrome's sweep for a widget whose overlay it no longer holds (an ack that arrived after the fallback). */
    dropAdopted(tabId: unknown): void {
        const widget = typeof tabId === 'string' ? this.channel.widgetOf(tabId) : undefined;
        if (widget) {
            widget.dispose();
        }
    }

    /** 36-REVIEW WR-03: the adopted page called window.close(); the tab closes as a user's close does (row closed, overlay released). */
    closeAdopted(tabId: unknown): void {
        const widget = typeof tabId === 'string' ? this.channel.widgetOf(tabId) : undefined;
        widget?.close();
    }

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
