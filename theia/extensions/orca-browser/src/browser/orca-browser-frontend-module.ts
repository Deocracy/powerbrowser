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
 */
import { ContainerModule, inject, injectable } from '@theia/core/shared/inversify';
import { ApplicationShell, FrontendApplicationContribution, Widget, WidgetManager } from '@theia/core/lib/browser';
import { FrontendApplicationStateService } from '@theia/core/lib/browser/frontend-application-state';
import { WebTabChannel, WebTabOpenHandler } from '@powerbrowser/tab-uris/lib/browser/web-tab';
import { ORCA_PANE_FACTORY_ID } from '@powerbrowser/tab-uris/lib/browser/orca-scheme-coverage';
import { CommandEvent, DispatchDeps, Outcome, PageTable, createPageTable, dispatchCommand } from '../common/orca-browser-dispatch';

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
    pageMetadata(browserPageId: string, metadata: { url: string; title: string }): unknown;
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

/** The createPage event's fields kept with a binding: the inventory entry and the user-close selector come from them. */
type BoundEvent = CommandEvent & Record<string, unknown>;

/** The page table, shared by the host and orca-panes' browser route. */
@injectable()
export class OrcaBrowserPages {

    @inject(WebTabChannel)
    protected readonly channel: WebTabChannel;

    readonly table: PageTable = createPageTable();

    /** The web tab id bound to an Orca page, if any. */
    tabOf(browserPageId: string): string | undefined {
        return this.table.tabOf(browserPageId);
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
    protected session: HostSession | undefined;

    onStart(): void {
        this.shell.onDidChangeActiveWidget(({ newValue }) => {
            if (newValue) {
                this.activated.set(newValue, ++this.activations);
            }
        });
        void this.run();
    }

    protected async run(): Promise<void> {
        let step = 'layout';
        try {
            await this.appState.reachedState('initialized_layout');
            step = 'link';
            const link = await this.waitForLink();
            step = 'connection';
            const connection = await link.connection();
            step = 'host bundle';
            const host = await this.loadHost();
            if (host?.PB_BROWSER_HOST_API !== 1 || HOST_EXPORTS.some(name => !(name in host))) {
                throw new Error('unexpected host interface');
            }
            step = 'attach';
            const browserHostClientId = `pb-host-${crypto.randomUUID()}`;
            let attached: (session: HostSession) => void = () => undefined;
            const sessionReady = new Promise<HostSession>(resolve => attached = resolve);
            const session = await host.attachBrowserHost({
                connection: { endpoint: connection.endpoint, hostPublicKeyB64: connection.hostPublicKeyB64 },
                credential: connection.credential,
                browserHostClientId,
                inventory: () => this.inventory(),
                onCommand: event => void sessionReady.then(s => this.serve(s, event)),
                onDetached: reason => {
                    this.session = undefined;
                    link.setPlacement(null);
                    console.warn(`${LOG_PREFIX} the browser host detached: ${reason}`);
                },
            });
            this.session = session;
            attached(session);
            link.setPlacement(browserHostClientId);
        } catch {
            console.error(`${LOG_PREFIX} the browser host did not attach at the ${step} step`);
        }
    }

    protected waitForLink(): Promise<HostLink> {
        const read = () => (globalThis as Record<symbol, unknown>)[Symbol.for(LINK_KEY)] as HostLink | undefined;
        return new Promise<HostLink>(resolve => {
            const present = read();
            if (present) {
                resolve(present);
                return;
            }
            const onLink = () => {
                const link = read();
                if (link) {
                    window.removeEventListener(LINK_EVENT, onLink);
                    resolve(link);
                }
            };
            window.addEventListener(LINK_EVENT, onLink);
        });
    }

    /** The host bundle, imported by a module script as orca-panes' loader imports the pane bundle (its import() is page text, which the commonjs emit cannot rewrite). */
    protected loadHost(): Promise<HostModule> {
        const key = Symbol.for(HOST_MODULE_KEY);
        const failedEvent = HOST_LOADED_EVENT + '-failed';
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
            const url = new URL(HOST_PREFIX + HOST_ENTRY, document.baseURI).href;
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
        try {
            const outcome = await dispatchCommand(event, this.deps(event));
            await session.commandResult(event, outcome);
        } catch {
            console.warn(`${LOG_PREFIX} a ${event.command?.type ?? 'page'} command result was not delivered`);
        }
    }

    protected deps(event: CommandEvent): DispatchDeps {
        return {
            table: this.pages.table,
            openAgentTab: async () => {
                const widget = await this.openHandler.openAgentTab(this.placementRef(event.command.workspaceId));
                this.bound.set(event.browserPageId, event as BoundEvent);
                return widget.tabId;
            },
            closeTab: tabId => this.channel.widgetOf(tabId)?.close(),
            navigate: (tabId, url) => this.channel.widgetOf(tabId)?.navigate(url) ?? Promise.resolve(undefined),
            agentCall: (tabId, method, params) => this.channel.request({ kind: 'webTabAgent', tabId, method, params }),
            pageInfo: tabId => {
                const widget = this.channel.widgetOf(tabId);
                return { url: widget?.url ?? '', title: widget?.pageTitle ?? '' };
            },
        };
    }

    /** P66-07: after the most recently active Orca pane of the page's worktree, else after the current main-area widget, else at the end. */
    protected placementRef(workspaceId: string | undefined): Widget | undefined {
        const panes = workspaceId ? this.widgetManager.getWidgets(ORCA_PANE_FACTORY_ID).filter(w =>
            !w.isDisposed && w.isAttached && this.shell.getAreaFor(w) === 'main'
            && (w as unknown as { options?: { worktreeId?: string } }).options?.worktreeId === workspaceId) : [];
        const latest = panes.sort((a, b) => (this.activated.get(b) ?? 0) - (this.activated.get(a) ?? 0))[0];
        return latest ?? this.shell.getCurrentWidget('main');
    }

    /** Orca's page inventory entries for the bound pages (empty at a first attach). */
    protected inventory(): unknown[] {
        return this.pages.table.pages().flatMap(pageId => {
            const event = this.bound.get(pageId);
            const tabId = this.pages.table.tabOf(pageId);
            if (!event || !tabId) {
                return [];
            }
            const command = event.command as Record<string, unknown>;
            const url = this.channel.widgetOf(tabId)?.url;
            return [{
                authorityRuntimeId: event.authorityRuntimeId, authorityEpoch: event.authorityEpoch,
                browserHostClientId: event.browserHostClientId, browserHostGeneration: event.browserHostGeneration,
                browserPageId: pageId, pageHostGeneration: event.pageHostGeneration,
                browserProfileId: command.browserProfileId, executionHostKey: command.executionHostKey,
                state: 'active',
                ...(url && url.length <= 8192 ? { currentUrl: url } : {}),
                ...(typeof command.workspaceId === 'string' ? { workspaceId: command.workspaceId } : {}),
            }];
        });
    }
}

export default new ContainerModule(bind => {
    bind(OrcaBrowserPages).toSelf().inSingletonScope();
    bind(OrcaBrowserHost).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(OrcaBrowserHost);
});
