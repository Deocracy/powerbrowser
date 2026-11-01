import { injectable, postConstruct } from '@theia/core/shared/inversify';
import { Command, CommandContribution, CommandRegistry } from '@theia/core/lib/common';

/**
 * GUI-01's entry affordance: the palette-reachable command that opens a
 * stock Firefox browser window.
 *
 * Exported as a named constant so plan 01-06's GUI-02 frame-refusal escape
 * action can invoke it without duplicating the string, and so
 * `scripts/verify-gui01-command.mjs` can assert the id it looks up in the
 * live frontend's `CommandRegistry` is the same one this file registers
 * rather than a copy that could drift.
 */
export const OPEN_BROWSER_WINDOW_COMMAND_ID = 'powerbrowser.open-browser-window';

/**
 * The label is 01-UI-SPEC.md's contracted string for GUI-01's entry
 * affordance, verbatim. It is not "Open in browser window" -- that is
 * GUI-02's per-tab escape CTA, a different affordance with a different
 * label, added by plan 01-06.
 */
export const OPEN_BROWSER_WINDOW: Command = {
    id: OPEN_BROWSER_WINDOW_COMMAND_ID,
    label: 'Open Browser Window',
};

/**
 * Wire names of the PowerBrowserGroup request event, and the navigation kind
 * that rides it.
 *
 * Spelled here rather than imported: the canonical exports live in
 * `@powerbrowser/modes`' `group-actor-client.ts`, and `@powerbrowser/modes`
 * already depends on `@powerbrowser/tab-uris` -- importing back would close a
 * package cycle. The other two spellings of these strings are that file and
 * `powerbrowser/shell/GroupActorChild.sys.mjs`; the kind's third spelling is
 * `handleGroupMutation`'s `case` in `powerbrowser/shell/PowerBrowserAPI.sys.mjs`.
 * No gate compares them yet -- see this file's entry in the F9 report.
 */
const GROUP_REQUEST_EVENT = 'PowerBrowserGroupRequest';
const OPEN_STOCK_TAB_KIND = 'openStockTab';
const GROUP_RESPONSE_EVENT = 'PowerBrowserGroupResponse';
const PROBE_CHANNEL_KIND = 'probeChannel';
/** Liveness probe budget. Off the click path, so a generous bound costs nothing. */
const PROBE_TIMEOUT_MS = 5000;
/** The one non-http target chrome's openStockTab admits, used for a bare New Tab. */
const NEW_TAB_URL = 'about:newtab';

/**
 * The frontend-to-chrome channel, and what changed about it.
 *
 * ORIGINALLY (01-05, ratified from 01-SPIKE-GUI-01.md observation 7,
 * candidate A): the Theia frontend is remote web content served from
 * `http://127.0.0.1:<port>/` inside the shell's `<xul:browser remote="true">`,
 * running in its own content process, and the ratification recorded that it
 * therefore "cannot call a chrome API, reach a chrome global, or dispatch a
 * DOM event that chrome would see", leaving `window.open` as the one mechanism
 * that crossed the boundary on stock platform machinery:
 *
 *   nsWindowWatcher::OpenWindowInternal
 *     -> (the shell chrome window carries no nsIBrowserDOMWindow, so there is
 *        no tab to divert into)
 *     -> nsAppStartup::CreateChromeWindow
 *     -> AppWindow::CreateNewContentWindow, which opens BROWSER_CHROME_URL
 *
 * and since patch `020-powerbrowser-shell.patch` no longer overrides that
 * compiled define, BROWSER_CHROME_URL is stock upstream browser chrome -- with
 * its own address bar, tab strip, and in-window modal dialogs, which is exactly
 * what 01-UI-SPEC.md's GUI-01 contract asks for.
 *
 * THE THIRD CLAUSE STOPPED BEING TRUE IN 15-01. The PowerBrowserGroup
 * JSWindowActor pair -- registered by `PowerBrowserAPI.registerGroupActor`,
 * pinned by `matches` to the Theia local origin -- exists precisely so the
 * frontend can dispatch a DOM event that chrome sees. The first two clauses
 * still hold: no chrome API, no chrome global, no privileged code in this
 * file. What is now false is only "no DOM event chrome would see", and the
 * pre-approved candidate-B fallback the original note called "deliberately NOT
 * implemented" is, for navigation, implemented below.
 *
 * WHY IT HAD TO BE (F9): `window.open` opened a WHOLE NEW OS WINDOW every
 * time, because the fall-through above is unconditional -- there is no tab to
 * divert into, ever. Three navigations, three windows. This method is the
 * shared sink for New Tab, suggestion activation and typed addresses alike
 * (all of them execute this command), so the window spam was every navigation
 * the chrome bar could start.
 *
 * PHASE 36: the stock window is reached ONLY through the openStockTab actor
 * kind. A Theia-frame `window.open` still falls through to stock chrome (the
 * shell's browserDOMWindow returns null for a Theia opener), but this command
 * no longer depends on that path, and the popup fallback is deleted. Recorded
 * reduction (accepted, D-36): with the actor channel down the command throws
 * its existing actionable error instead of opening stock chrome by
 * `window.open`; the palette retry is the affordance.
 *
 * HOW AVAILABILITY IS DECIDED, AND WHY NOT AT CLICK TIME. F9 decided per click
 * by having the actor child cancel the request event and reading
 * `dispatchEvent`'s return value. Measured live against the built binary, by
 * two independent routes, that return value is still `true` with
 * `defaultPrevented` false EVEN WHEN chrome has received and acted on the
 * message -- so the caller concluded "chrome declined", ran the popup fallback
 * as well, and one click cost TWO windows. Awaiting the ack instead is not
 * available: a popup needs the user activation of the click that started it,
 * and an await spends it. So availability is decided ONCE, off the click path,
 * by `probeChannel` below; a click then either sends openStockTab or throws.
 * `gui01-browser-close-does-not-quit` and `scripts/verify-gui01-command.mjs`
 * remain the registered checks over the contract this preserves.
 */
@injectable()
export class BrowserWindowCommandContribution implements CommandContribution {

    /** Per-frontend request counter; only ever paired with a timestamp. */
    private seq = 0;

    /**
     * Whether the chrome channel answered a liveness probe. `undefined` until
     * the probe settles; only `true` sends, so an unknown channel throws the
     * actionable error rather than sending speculatively.
     */
    private channelAlive: boolean | undefined;

    @postConstruct()
    protected initChannelProbe(): void {
        // Off the click path deliberately: this costs a round trip a click
        // should not wait on.
        void this.probeChannel();
    }

    /**
     * Asks chrome once whether this channel is available, and remembers the
     * answer. Never throws and never rejects: any failure -- no chrome host,
     * an actor child that did not load, a nack, or silence -- settles
     * `channelAlive` false, which makes every click throw the actionable error.
     */
    protected probeChannel(): Promise<void> {
        return new Promise<void>(resolve => {
            const requestId = `probe-channel-${Date.now().toString(36)}-${(this.seq += 1)}`;
            const settle = (alive: boolean): void => {
                window.removeEventListener(GROUP_RESPONSE_EVENT, onResponse);
                window.clearTimeout(timer);
                this.channelAlive = alive;
                resolve();
            };
            const onResponse = (event: Event): void => {
                const detail = (event as CustomEvent).detail as
                    { requestId?: unknown; reply?: { ok?: unknown } } | undefined;
                if (!detail || detail.requestId !== requestId) {
                    return;
                }
                settle(detail.reply?.ok === true);
            };
            const timer = window.setTimeout(() => settle(false), PROBE_TIMEOUT_MS);
            window.addEventListener(GROUP_RESPONSE_EVENT, onResponse);
            document.dispatchEvent(new CustomEvent(GROUP_REQUEST_EVENT, {
                bubbles: true,
                detail: { requestId, msg: { kind: PROBE_CHANNEL_KIND } },
            }));
        });
    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(OPEN_BROWSER_WINDOW, {
            execute: (url?: string) => this.openBrowserWindow(url),
        });
    }

    /**
     * `url` is optional: with none, the stock window opens a New Tab, where
     * the stock address bar is the affordance. Callers that have a URL (plan
     * 01-06's escape action) pass it straight through.
     *
     * Phase 36: the openStockTab actor kind is the only route. With the
     * channel not known alive, or a non-web target, nothing would open, so
     * the call throws an error naming this contribution and what to do
     * instead rather than leaving the user staring at nothing.
     */
    protected openBrowserWindow(url?: string): void {
        const target = url ?? '';
        if (this.channelAlive === true && (!target || /^https?:\/\//i.test(target))) {
            this.requestStockTab(target || NEW_TAB_URL);
            return;
        }
        throw new Error(
            `${OPEN_BROWSER_WINDOW_COMMAND_ID}: the browser window was blocked and did not open -- ` +
            'invoke the command directly from the command palette (a keypress or click carries the ' +
            'user activation a popup needs) rather than from a script or a delayed handler'
        );
    }

    /**
     * Asks chrome to put `url` in the one stock browser window, and reports
     * whether chrome took the request.
     *
     * The boolean is the dispatch's return value, kept for diagnostics only.
     * It is NOT the fallback signal -- see the class note: chrome's cancel is
     * not visible to the content-side dispatch, so reading it as "chrome
     * declined" double-opened. Callers gate on `channelAlive` instead.
     *
     * The scheme test is a routing decision, not the security wall -- chrome
     * re-applies its own, and chrome's is the one that counts. This one keeps
     * a non-web scheme off a channel that would refuse it silently.
     */
    protected requestStockTab(url: string): boolean {
        if (url && !/^https?:\/\//i.test(url)) {
            return false;
        }
        const request = new CustomEvent(GROUP_REQUEST_EVENT, {
            cancelable: true,
            // `bubbles` and the `document` target below are as load-bearing as
            // `cancelable`. JSWindowActor `events` listeners are installed on
            // the WINDOW ROOT (JSActorService::RegisterChromeEventTarget ->
            // RegisterListenersFor), and an event dispatched on `window` with
            // the default bubbles:false has a propagation path that never
            // reaches it. Dispatching there left the actor child un-run, so
            // the event came back un-cancelled and this returned false --
            // and the caller then ALSO opened a window.open window, costing
            // two windows per click instead of one.
            //
            // Same shape as GroupActorClient.mutate and as upstream's own
            // aboutLogins.mjs:296. Keep target, bubbles and cancelable
            // together: drop any one and this silently reverts to the
            // double-window behaviour.
            bubbles: true,
            detail: {
                requestId: `open-browser-window-${Date.now().toString(36)}-${(this.seq += 1)}`,
                msg: { kind: OPEN_STOCK_TAB_KIND, url },
            },
        });
        return !document.dispatchEvent(request);
    }
}
