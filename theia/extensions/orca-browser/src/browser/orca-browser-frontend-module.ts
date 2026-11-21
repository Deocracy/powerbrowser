/**
 * Phase 66 (BRW-02, BRW-03; P66-01, P66-03, P66-05, P66-07, P66-08, P66-09;
 * research A1, A3, A6, A7, A8): @powerbrowser/orca-browser, the Theia half of
 * PowerBrowser's browser host for Orca (S2).
 *
 * At frontend start, in every mode, the host waits for the pane bundle's link
 * (LINK_KEY, else the LINK_EVENT window event), takes its connection, imports
 * the host bundle pb-browser-host.js from the pane bundle's served directory,
 * attaches with its own connection and a pb-host-<uuid> id, and hands that id
 * to the link so Orca's renderer places new pages on this host (A3).
 *
 * Every page command goes through the pure dispatcher (orca-browser-dispatch):
 * createPage opens one background agent web tab and binds it, automation goes
 * to chrome as webTabAgent, closePage closes the bound tab. Nothing here mounts
 * an Orca component; orca-panes' browser route only reveals bound tabs.
 *
 * Failures are one log line naming the step, never a value: the connection
 * carries pairing material.
 *
 * Phase 67 (P67-36, D-33): attach() is the start path, callable again after a
 * failure or a detach (orca-panes' Reconnect and its re-pair after an orcad
 * restart). Each logged attach failure and each detach also sends
 * { kind: 'orcaStatus', clientReason: 'browser-host-attach-failed' } to chrome;
 * each successful attach sends the clearing form { kind: 'orcaStatus',
 * browserHost: 'attached' }. Both go through this file's own copy of tab-uris'
 * update-client.ts request(), since orca-browser cannot import orca-panes.
 */
import { ContainerModule, inject, injectable } from '@theia/core/shared/inversify';
import { Emitter, Event as TheiaEvent } from '@theia/core/lib/common/event';
import { ApplicationShell, FrontendApplicationContribution, Widget, WidgetManager } from '@theia/core/lib/browser';
import { FrontendApplicationStateService } from '@theia/core/lib/browser/frontend-application-state';
import { WEB_TAB_FACTORY_ID, WebTabChannel, WebTabOpenHandler, WebTabWidget } from '@powerbrowser/tab-uris/lib/browser/web-tab';
import { ORCA_PANE_FACTORY_ID } from '@powerbrowser/tab-uris/lib/browser/orca-scheme-coverage';
import {
    AgentReply, BrowserRecord, CommandEvent, DispatchDeps, DispatchFailure, Outcome, PageTable, createPageTable, createRevealTracker, dispatchCommand
} from '../common/orca-browser-dispatch';
import {
    BoundEvent, PageMetadata, START_STEP_DEADLINE_MS, agentCallTimeoutMs, boundedOutcome, inventoryOf, pageMetadataOf, reboundEvent, withDeadline
} from '../common/orca-browser-host-wire';

/** Host bundle interface and link global (66-01-PLAN interfaces); orca-browser-entry-points compares these with lane p66-01's sources. */
export const HOST_EXPORTS: readonly string[] = Object.freeze(['PB_BROWSER_HOST_API', 'attachBrowserHost']);
export const LINK_KEY = 'powerbrowser.orca-browser.link';
export const LINK_EVENT = 'powerbrowser-orca-browser-link';
/** The pane bundle's served directory (orca-panes' backend route); the host bundle is written beside the pane bundle. */
export const HOST_PREFIX = '/orca-panes/';
export const HOST_ENTRY = 'pb-browser-host.js';

const HOST_MODULE_KEY = 'powerbrowser.orca-browser.host-module';
const HOST_LOADED_EVENT = 'powerbrowser-orca-browser-host-module';
const LOG_PREFIX = '[@powerbrowser/orca-browser]';

/** P67-36: the client reason chrome holds for a failed or detached host, and the message that clears it (interfaces block). */
export const BROWSER_HOST_REASON = 'browser-host-attach-failed';
export type BrowserHostStatusMessage = { kind: 'orcaStatus'; clientReason: typeof BROWSER_HOST_REASON } | { kind: 'orcaStatus'; browserHost: 'attached' };
export type BrowserHostState = 'attaching' | 'attached' | 'failed';

const SHELL_REQUEST_EVENT = 'PowerBrowserGroupRequest';
const SHELL_RESPONSE_EVENT = 'PowerBrowserGroupResponse';
const SHELL_ACK_TIMEOUT_MS = 5000;

interface HostConnection {
    endpoint: string;
    hostPublicKeyB64: string;
    credential: unknown;
}

interface HostLink {
    connection(): Promise<HostConnection>;
    setPlacement(browserHostClientId: string | null): void;
}

interface HostSession {
    browserHostClientId: string;
    commandResult(event: CommandEvent, outcome: Outcome): unknown;
    pageMetadata(browserPageId: string, metadata: PageMetadata): unknown;
    userClosedPage(worktreeSelector: string | undefined, browserPageId: string): unknown;
    detach(): unknown;
}

interface HostModule {
    PB_BROWSER_HOST_API: number;
    attachBrowserHost(options: {
        connection: { endpoint: string; hostPublicKeyB64: string };
        credential: unknown;
        browserHostClientId: string;
        inventory(): unknown[];
        onCommand(event: CommandEvent): void;
        onDetached(reason: string): void;
    }): Promise<HostSession>;
}

/** Orca's runtime worktree selector, formed as its renderer's toRuntimeWorktreeSelector forms it (client-hosted-browser-row-close.ts). */
const worktreeSelector = (worktreeId: string): string => worktreeId.trim().startsWith('id:') ? worktreeId.trim() : `id:${worktreeId.trim()}`;

/**
 * P66-08 (66-06): the bound pages of this frontend, kept in the Theia document's sessionStorage (it survives a reload
 * of the same window, never a new launch) as browserPageId -> worktree selector. orcad keeps a reloaded frontend's pages
 * as host-absent rows, because the new host attaches with a new client id; the new host closes them after attach.
 */
const ENDED_PAGES_KEY = 'powerbrowser.orca-browser.bound-pages';
const readBoundPages = (): Record<string, string | null> => {
    try {
        const value = JSON.parse(window.sessionStorage.getItem(ENDED_PAGES_KEY) ?? '{}');
        return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch {
        return {};
    }
};
const writeBoundPages = (pages: Record<string, string | null>): void => {
    try {
        window.sessionStorage.setItem(ENDED_PAGES_KEY, JSON.stringify(pages));
    } catch {
        // storage unavailable: a reload then leaves host-absent rows, as before
    }
};

/** Orca's page id -> web tab table, shared by the host and orca-panes' browser route (P66-05, P66-09). */
@injectable()
export class OrcaBrowserPages {

    @inject(WebTabChannel)
    protected readonly channel: WebTabChannel;

    readonly table: PageTable = createPageTable();
    readonly tracker = createRevealTracker();

    /** The web tab id bound to an Orca page, if any. */
    tabOf(browserPageId: string): string | undefined {
        return this.table.tabOf(browserPageId);
    }

    /** One pane list's browser records -> the bound web tabs to activate (P66-09 rule; never a tab at its own createPage). */
    reveal(records: readonly BrowserRecord[]): WebTabWidget[] {
        return this.tracker.next(records, this.table).flatMap(pageId => {
            const widget = this.channel.widgetOf(this.table.tabOf(pageId) ?? '');
            return widget && !widget.isDisposed ? [widget] : [];
        });
    }
}

@injectable()
export class OrcaBrowserHost implements FrontendApplicationContribution {

    @inject(OrcaBrowserPages)
    protected readonly pages: OrcaBrowserPages;

    @inject(WebTabChannel)
    protected readonly channel: WebTabChannel;

    @inject(WebTabOpenHandler)
    protected readonly openHandler: WebTabOpenHandler;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    @inject(FrontendApplicationStateService)
    protected readonly appState: FrontendApplicationStateService;

    /** createPage events of bound pages, by browserPageId. */
    protected readonly bound = new Map<string, BoundEvent>();
    /** Activation order of widgets, for the new tab's place (P66-07). */
    protected readonly activated = new WeakMap<Widget, number>();
    protected activations = 0;
    /**
     * 66-CR-03: one host id for this frontend's life, as Orca's desktop host keeps one. Every attach (the first, and each
     * Reconnect after a detach) uses it, so the inventory of the pages still bound matches the attaching id and Orca's
     * reconciliation retains, reclaims or closes them; a new id per attach made Orca refuse the attach outright.
     */
    protected readonly browserHostClientId = `pb-host-${crypto.randomUUID()}`;
    protected session: HostSession | undefined;
    protected readonly sentMetadata = new Map<string, string>();
    protected prepared: Promise<void> | undefined;
    protected attaching: Promise<boolean> | undefined;
    protected attempts = 0;
    protected seq = 0;
    protected hostState: BrowserHostState = 'attaching';
    protected readonly onDidChangeStateEmitter = new Emitter<BrowserHostState>();
    /** P67-36: fires on every attach outcome and detach; orca-panes' failure page reads it. */
    readonly onDidChangeState: TheiaEvent<BrowserHostState> = this.onDidChangeStateEmitter.event;

    get state(): BrowserHostState {
        return this.hostState;
    }

    onStart(): void {
        this.shell.onDidChangeActiveWidget(({ newValue }) => {
            if (newValue) {
                this.activated.set(newValue, ++this.activations);
            }
        });
        void this.attach();
    }

    /** Attaches the host unless it is attached already; concurrent calls share one attempt. Resolves true when attached. */
    attach(): Promise<boolean> {
        if (this.session) {
            return Promise.resolve(true);
        }
        return this.attaching ??= this.run().finally(() => { this.attaching = undefined; });
    }

    /** Once per frontend: the layout and the metadata push. */
    protected prepare(): Promise<void> {
        return this.prepared ??= (async () => {
            await this.appState.reachedState('initialized_layout');
            this.channel.onPush('state', detail => this.reportMetadata(detail));
        })();
    }

    protected setState(state: BrowserHostState): void {
        this.hostState = state;
        this.onDidChangeStateEmitter.fire(state);
        void this.request(state === 'attached'
            ? { kind: 'orcaStatus', browserHost: 'attached' }
            : { kind: 'orcaStatus', clientReason: BROWSER_HOST_REASON });
    }

    protected async run(): Promise<boolean> {
        let step = 'layout';
        this.hostState = 'attaching';
        try {
            await this.prepare();
            // 66-WR-02: the link and its connection each have a deadline, so a pane bundle that never evaluates or never
            // becomes ready ends in the logged failure and the failed state Reconnect retries from.
            step = 'link';
            const link = await this.waitForLink(START_STEP_DEADLINE_MS);
            step = 'connection';
            let expired = false;
            const connection = await withDeadline(this.connectionWhenReady(link, () => expired), START_STEP_DEADLINE_MS, () => { expired = true; });
            step = 'host bundle';
            const host = await this.loadHost();
            if (host?.PB_BROWSER_HOST_API !== 1 || HOST_EXPORTS.some(name => !(name in host))) {
                throw new Error('unexpected host interface');
            }
            step = 'attach';
            const browserHostClientId = this.browserHostClientId;
            let attached: (session: HostSession) => void = () => undefined;
            const sessionReady = new Promise<HostSession>(resolve => attached = resolve);
            const session = await host.attachBrowserHost({
                connection: { endpoint: connection.endpoint, hostPublicKeyB64: connection.hostPublicKeyB64 },
                credential: connection.credential,
                browserHostClientId,
                inventory: () => this.inventory(browserHostClientId),
                onCommand: event => void sessionReady.then(s => this.serve(s, event)),
                onDetached: reason => {
                    this.session = undefined;
                    link.setPlacement(null);
                    console.warn(`${LOG_PREFIX} the browser host detached: ${reason}`);
                    this.setState('failed');
                },
            });
            this.session = session;
            attached(session);
            link.setPlacement(browserHostClientId);
            this.closeEndedPages(session);
            this.setState('attached');
            return true;
        } catch {
            console.error(`${LOG_PREFIX} the browser host did not attach at the ${step} step`);
            this.setState('failed');
            return false;
        }
    }

    /** tab-uris' update-client.ts request(), copied: own id prefix, 5 s acknowledgement, nothing off 127.0.0.1. Replies are not read. */
    protected request(msg: BrowserHostStatusMessage): Promise<void> {
        if (location.protocol !== 'http:' || location.hostname !== '127.0.0.1') {
            return Promise.resolve();
        }
        return this.shellRequest(msg, SHELL_ACK_TIMEOUT_MS).then(() => undefined);
    }

    /**
     * 66-CR-04: one agent command to chrome (webTabAgent), answered when chrome replies or after agentCallTimeoutMs.
     * WebTabChannel.request settles every message at its 5 s acknowledgement timeout, which cut off waits, evals,
     * screenshots and PDFs chrome was still running; a local timeout here replies { ok: false, reason: 'timeout' },
     * which outcomeOf answers as browser_timeout.
     */
    protected agentRequest(msg: { kind: 'webTabAgent'; tabId: string; method: string; params: Record<string, unknown> }): Promise<AgentReply> {
        return this.shellRequest(msg, agentCallTimeoutMs(msg.params)).then(reply =>
            reply && typeof reply === 'object' ? reply as AgentReply : { ok: false, reason: 'validation' });
    }

    /** One request on the shell bridge, as WebTabChannel.request sends it, with this call's own deadline. */
    protected shellRequest(msg: Record<string, unknown> & { kind: string }, timeoutMs: number): Promise<unknown> {
        return new Promise<unknown>(resolve => {
            const requestId = `orca-browser-${msg.kind}-${Date.now().toString(36)}-${(this.seq += 1)}`;
            const settle = (reply: unknown): void => {
                window.removeEventListener(SHELL_RESPONSE_EVENT, onResponse);
                window.clearTimeout(timer);
                resolve(reply);
            };
            const onResponse = (event: Event): void => {
                const detail = (event as CustomEvent).detail as { requestId?: unknown; reply?: unknown } | undefined;
                if (detail?.requestId === requestId) {
                    settle(detail.reply);
                }
            };
            const timer = window.setTimeout(() => settle({ ok: false, reason: 'timeout' }), timeoutMs);
            window.addEventListener(SHELL_RESPONSE_EVENT, onResponse);
            try {
                document.dispatchEvent(new CustomEvent(SHELL_REQUEST_EVENT, { bubbles: true, detail: { requestId, msg } }));
            } catch {
                settle({ ok: false, reason: 'validation' });
            }
        });
    }

    /** The pane bundle's link, or a rejection after deadlineMs (66-WR-02). */
    protected waitForLink(deadlineMs: number): Promise<HostLink> {
        const read = () => (globalThis as Record<symbol, unknown>)[Symbol.for(LINK_KEY)] as HostLink | undefined;
        return new Promise<HostLink>((resolve, reject) => {
            const present = read();
            if (present) {
                resolve(present);
                return;
            }
            const onLink = () => {
                const link = read();
                if (link) {
                    window.removeEventListener(LINK_EVENT, onLink);
                    window.clearTimeout(timer);
                    resolve(link);
                }
            };
            const timer = window.setTimeout(() => {
                window.removeEventListener(LINK_EVENT, onLink);
                reject(new Error('deadline'));
            }, deadlineMs);
            window.addEventListener(LINK_EVENT, onLink);
        });
    }

    /**
     * The link is defined when the pane bundle evaluates, but its connection() rejects with link_not_ready until the
     * pane client's first status call has completed (then the link fires LINK_EVENT once). Retries on that event, or
     * after a second if the event fired before the listener was added; any other rejection is a failure. Stops once
     * expired() is true (the caller's deadline has passed).
     */
    protected async connectionWhenReady(link: HostLink, expired: () => boolean = () => false): Promise<HostConnection> {
        while (!expired()) {
            try {
                return await link.connection();
            } catch (error) {
                if (!(error instanceof Error && error.message === 'link_not_ready')) {
                    throw error;
                }
            }
            await new Promise<void>(resolve => {
                const timer = window.setTimeout(resolve, 1000);
                window.addEventListener(LINK_EVENT, () => { window.clearTimeout(timer); resolve(); }, { once: true });
            });
        }
        throw new Error('deadline');
    }

    /** The host bundle, imported by a module script as orca-panes' loader imports the pane bundle (its import() is page text, which the commonjs emit cannot rewrite). */
    protected loadHost(): Promise<HostModule> {
        const key = Symbol.for(HOST_MODULE_KEY);
        const loaded = (globalThis as Record<symbol, unknown>)[key] as HostModule | undefined;
        if (loaded) {
            return Promise.resolve(loaded);
        }
        const failedEvent = HOST_LOADED_EVENT + '-failed';
        // A retry after a failed load asks for a new URL, so the document's module map cannot answer with the old failure.
        const attempt = (this.attempts += 1);
        return new Promise<HostModule>((resolve, reject) => {
            const onLoaded = () => {
                window.removeEventListener(failedEvent, onFailed);
                resolve((globalThis as Record<symbol, unknown>)[key] as HostModule);
            };
            const onFailed = () => {
                window.removeEventListener(HOST_LOADED_EVENT, onLoaded);
                reject(new Error('the host bundle did not load'));
            };
            window.addEventListener(HOST_LOADED_EVENT, onLoaded, { once: true });
            window.addEventListener(failedEvent, onFailed, { once: true });
            const url = new URL(HOST_PREFIX + HOST_ENTRY + (attempt > 1 ? `?attempt=${attempt}` : ''), document.baseURI).href;
            const script = document.createElement('script');
            script.type = 'module';
            script.textContent = [
                `import(${JSON.stringify(url)}).then(m => {`,
                `  globalThis[Symbol.for(${JSON.stringify(HOST_MODULE_KEY)})] = m;`,
                `  window.dispatchEvent(new Event(${JSON.stringify(HOST_LOADED_EVENT)}));`,
                `}, () => window.dispatchEvent(new Event(${JSON.stringify(failedEvent)})));`,
            ].join('\n');
            document.head.appendChild(script);
        });
    }

    protected async serve(session: HostSession, event: CommandEvent): Promise<void> {
        // 66-WR-04: a completed value over Orca's result budget is answered failed rather than refused unanswered.
        const outcome = boundedOutcome(await dispatchCommand(event, this.deps(event)));
        const previous = this.bound.get(event.browserPageId);
        if (outcome.status === 'completed' && previous) {
            this.bound.set(event.browserPageId, reboundEvent(previous, event as BoundEvent)); // 66-CR-03
        }
        try {
            await session.commandResult(event, outcome);
            return;
        } catch {
            // refused or not delivered; an automation result is retried once as a failure, so orcad's command ends
        }
        if (outcome.status === 'completed' && event.command?.type === 'automation') {
            try {
                await session.commandResult(event, { status: 'failed', errorCode: 'browser_error' });
                return;
            } catch {
                // logged below
            }
        }
        console.warn(`${LOG_PREFIX} a ${event.command?.type ?? 'page'} command result was not delivered`);
    }

    protected deps(event: CommandEvent): DispatchDeps {
        return {
            table: this.pages.table,
            openAgentTab: async () => {
                const widget = await this.openHandler.openAgentTab(this.placementRef(event.command.workspaceId));
                // 66-WR-06: createPage completes only once chrome has made the overlay; otherwise the tab closes
                // (no close handler is connected before recordBound, so no user close is reported) and createPage fails.
                const reply = widget.isAttached ? await widget.opened : { ok: false };
                if (reply.ok !== true || (reply.where !== 'opened' && reply.where !== 'loading')) {
                    widget.close();
                    throw new DispatchFailure(reply.where === 'agent-stopped' ? 'browser_owner_unavailable' : 'browser_error');
                }
                return widget.tabId;
            },
            recordBound: tabId => this.recordBound(event, tabId),
            closeTab: tabId => this.channel.widgetOf(tabId)?.close(),
            // agent-browser-04 / 66-CR-01: Orca's navigate goes through chrome's agent wall as browser.goto, never the
            // user's webTabNavigate, so a stopped tab or a tab that is not an agent tab is never driven, and the mark lights.
            navigate: (tabId, url) => this.agentRequest({ kind: 'webTabAgent', tabId, method: 'browser.goto', params: { url } }),
            agentsStopped: () => (this.widgetManager.getWidgets(WEB_TAB_FACTORY_ID) as WebTabWidget[])
                .some(widget => widget.agent && !widget.isDisposed && widget.agentControl.stopped),
            agentCall: (tabId, method, params) => this.agentRequest({ kind: 'webTabAgent', tabId, method, params }),
            pageInfo: tabId => {
                const widget = this.channel.widgetOf(tabId);
                return { url: widget?.url ?? '', title: widget?.pageTitle ?? '' };
            },
        };
    }

    /**
     * 66-WR-05: the records of a page the table has just bound to this tab, written only after the bind, so a losing
     * duplicate createPage tab (closed unbound) never reaches onTabClosed and never touches the winner's records.
     */
    protected recordBound(event: CommandEvent, tabId: string): void {
        const pageId = event.browserPageId;
        this.bound.set(pageId, event as BoundEvent);
        const workspaceId = event.command.workspaceId;
        writeBoundPages({ ...readBoundPages(), [pageId]: workspaceId ? worktreeSelector(workspaceId) : null });
        this.pages.tracker.noteCreated(pageId);
        const widget = this.channel.widgetOf(tabId);
        if (!widget || widget.isDisposed) {
            this.onTabClosed(pageId, tabId); // closed by the user between chrome's reply and the bind
            return;
        }
        widget.disposed.connect(() => this.onTabClosed(pageId, tabId));
    }

    /**
     * A7: a user's close of a bound tab is Orca's page close. Only the tab the table bound reaches here (recordBound).
     * A close caused by closePage finds the pair already dropped: its records go and nothing is sent. 66-WR-03: a user
     * close keeps the page's sessionStorage entry until userClosedPage resolves, so a close while the host is detached,
     * or one orcad did not take, is sent by closeEndedPages after the next attach.
     */
    protected onTabClosed(pageId: string, tabId: string): void {
        const event = this.bound.get(pageId);
        this.sentMetadata.delete(pageId);
        if (this.pages.table.tabOf(pageId) !== tabId) {
            if (this.pages.table.tabOf(pageId) === undefined) {
                this.bound.delete(pageId);
                this.forgetBoundPage(pageId);
            }
            return;
        }
        this.pages.table.drop(pageId);
        this.bound.delete(pageId);
        const session = this.session;
        if (!session) {
            return;
        }
        const workspaceId = event?.command.workspaceId;
        void Promise.resolve(session.userClosedPage(workspaceId ? worktreeSelector(workspaceId) : undefined, pageId))
            .then(() => this.forgetBoundPage(pageId), () => console.warn(`${LOG_PREFIX} a user close was not reported`));
    }

    protected forgetBoundPage(pageId: string): void {
        const { [pageId]: _closed, ...stillBound } = readBoundPages();
        writeBoundPages(stillBound);
    }

    /**
     * P66-08: pages a previous frontend of this window bound end with it, as do pages the user closed while the host
     * was detached (66-WR-03); each is closed as a user close would be, and its entry goes once orcad has taken it.
     */
    protected closeEndedPages(session: HostSession): void {
        const ended = Object.entries(readBoundPages()).filter(([pageId]) => this.pages.table.tabOf(pageId) === undefined);
        for (const [pageId, selector] of ended) {
            void Promise.resolve(session.userClosedPage(selector ?? undefined, pageId))
                .then(() => this.forgetBoundPage(pageId), () => console.warn(`${LOG_PREFIX} a closed page was not reported`));
        }
    }

    /**
     * 66-CR-02: the page's snapshot to orcad when a bound tab's state push changes it. Orca's schema takes url, title,
     * loading, canGoBack and canGoForward, all required, within its caps; a refusal is one log line with no value.
     */
    protected reportMetadata(detail: Record<string, unknown>): void {
        const pageId = typeof detail.tabId === 'string' ? this.pages.table.pageOf(detail.tabId) : undefined;
        const metadata = pageMetadataOf(detail);
        if (!pageId || !this.session || !metadata) {
            return;
        }
        const key = JSON.stringify(metadata);
        if (this.sentMetadata.get(pageId) !== key) {
            this.sentMetadata.set(pageId, key);
            void Promise.resolve(this.session.pageMetadata(pageId, metadata))
                .catch(() => console.warn(`${LOG_PREFIX} a page metadata update was not taken`));
        }
    }

    /** P66-07: after the most recently active Orca pane of the page's worktree, else after the current main-area widget, else at the end. */
    protected placementRef(workspaceId: string | undefined): Widget | undefined {
        const panes = workspaceId ? this.widgetManager.getWidgets(ORCA_PANE_FACTORY_ID).filter(w =>
            !w.isDisposed && w.isAttached && this.shell.getAreaFor(w) === 'main'
            && (w as unknown as { options?: { worktreeId?: string } }).options?.worktreeId === workspaceId) : [];
        const latest = panes.sort((a, b) => (this.activated.get(b) ?? 0) - (this.activated.get(a) ?? 0))[0];
        return latest ?? this.shell.getCurrentWidget('main');
    }

    /** Orca's page inventory entries for the bound pages of the attaching host id (empty at a first attach). */
    protected inventory(browserHostClientId: string): unknown[] {
        return inventoryOf(this.pages.table.pages().flatMap(pageId => {
            const event = this.bound.get(pageId);
            const tabId = this.pages.table.tabOf(pageId);
            return event && tabId ? [{ pageId, event, url: this.channel.widgetOf(tabId)?.url }] : [];
        }), browserHostClientId);
    }
}

export default new ContainerModule(bind => {
    bind(OrcaBrowserPages).toSelf().inSingletonScope();
    bind(OrcaBrowserHost).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(OrcaBrowserHost);
});
