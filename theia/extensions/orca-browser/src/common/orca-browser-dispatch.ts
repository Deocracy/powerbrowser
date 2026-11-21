/**
 * Phase 66 (BRW-02, BRW-03; P66-05, P66-12, P66-17, P66-18; research A6, A7, A8):
 * the pure core of the PowerBrowser browser host. No DOM, no Theia import, so
 * Node can transpile and run it (orca-browser-abilities, orca-browser-tab-scope).
 *
 * The page table is the first wall (the second is chrome's agent flag, P66-06):
 * one browserPageId maps to one web tab the host created, both ways. Every
 * command resolves through it; an id it does not bind is answered
 * browser_tab_not_found, and reclaimPage/restorePage never adopt a tab.
 *
 * outcomeOf maps chrome's webTabAgent reply to Orca's result by the contract's
 * client outcome table (66-02-PLAN interfaces).
 */
import { SERVED_AUTOMATION_METHODS } from './orca-browser-abilities';

export type BindResult = 'bound' | 'duplicate-page' | 'duplicate-tab';

export interface PageTable {
    bind(pageId: string, tabId: string): BindResult;
    tabOf(pageId: string): string | undefined;
    pageOf(tabId: string): string | undefined;
    /** Drops the pair; true when one existed. */
    drop(pageId: string): boolean;
    /** True when the page was bound once and has since been dropped (a user close before orcad's closePage, A7). */
    wasDropped(pageId: string): boolean;
    pages(): string[];
}

export function createPageTable(): PageTable {
    const tabByPage = new Map<string, string>();
    const pageByTab = new Map<string, string>();
    const dropped = new Set<string>();
    return {
        bind(pageId, tabId) {
            if (tabByPage.has(pageId)) {
                return 'duplicate-page';
            }
            if (pageByTab.has(tabId)) {
                return 'duplicate-tab';
            }
            tabByPage.set(pageId, tabId);
            pageByTab.set(tabId, pageId);
            dropped.delete(pageId);
            return 'bound';
        },
        tabOf: pageId => tabByPage.get(pageId),
        pageOf: tabId => pageByTab.get(tabId),
        drop(pageId) {
            const tabId = tabByPage.get(pageId);
            if (tabId === undefined) {
                return false;
            }
            tabByPage.delete(pageId);
            pageByTab.delete(tabId);
            dropped.add(pageId);
            return true;
        },
        wasDropped: pageId => dropped.has(pageId),
        pages: () => [...tabByPage.keys()],
    };
}

/** What the host returns to orcad through browser.clientHost.commandResult (host bundle interface). */
export type Outcome = { status: 'completed'; result?: unknown } | { status: 'failed'; errorCode: string };

/** Chrome's webTabAgent reply (bridge message contract). */
export interface AgentReply {
    ok?: boolean;
    where?: string;
    result?: unknown;
    code?: string;
    reason?: string;
}

const completed = (result?: unknown): Outcome => result === undefined ? { status: 'completed' } : { status: 'completed', result };
const failed = (errorCode: string): Outcome => ({ status: 'failed', errorCode });

/** The client outcome mapping (A8): every reply chrome can give, and anything else as browser_error. */
export function outcomeOf(reply: AgentReply | undefined): Outcome {
    if (!reply || reply.ok !== true) {
        return failed('browser_error'); // a validation refusal, a timeout or a malformed reply
    }
    switch (reply.where) {
        case 'done': return completed(reply.result);
        case 'unknown-tab':
        case 'not-agent-tab': return failed('browser_tab_not_found');
        case 'agent-stopped': return failed('browser_owner_unavailable');
        case 'failed': return failed(typeof reply.code === 'string' && reply.code ? reply.code : 'browser_error');
        default: return failed('browser_error');
    }
}

/** The fields dispatchCommand reads from one attach-stream command event (Orca's BrowserClientHostCommandEvent). */
export interface CommandEvent {
    browserPageId: string;
    command: {
        type: string;
        method?: string;
        params?: Record<string, unknown>;
        url?: string;
        workspaceId?: string;
        targetAuthority?: { browserPageId?: string };
    };
}

/**
 * 66-WR-06: thrown by a dep to answer the command with this error code, as openAgentTab does when chrome made no
 * overlay (browser_error) or the user has agents stopped (browser_owner_unavailable).
 */
export class DispatchFailure extends Error {
    constructor(readonly errorCode: string) {
        super(errorCode);
    }
}

export interface DispatchDeps {
    table: PageTable;
    /**
     * Opens one new background agent web tab for a createPage event; resolves to its tab id once chrome has made its
     * overlay, else throws a DispatchFailure (66-WR-06).
     */
    openAgentTab(event: CommandEvent): Promise<string>;
    closeTab(tabId: string): void;
    /**
     * The bound tab's navigate. agent-browser-04 / 66-CR-01: the host sends it as the agent's browser.goto, so chrome's
     * agent wall (agent tab, agent container, not stopped) applies and the mark lights; the reply is chrome's
     * webTabAgent reply. A reply that is only { ok: true } counts as done.
     */
    navigate(tabId: string, url: string): Promise<unknown>;
    /** agent-browser-04: true while the user has agents stopped, so createPage opens nothing (chrome refuses it too). */
    agentsStopped?(): boolean;
    agentCall(tabId: string, method: string, params: Record<string, unknown>): Promise<AgentReply>;
    pageInfo(tabId: string): { url: string; title: string };
}

/** One page command to its outcome. Never throws: an unexpected error answers browser_error. */
export async function dispatchCommand(event: CommandEvent, deps: DispatchDeps): Promise<Outcome> {
    const { table } = deps;
    const command = event.command;
    const pageId = event.browserPageId;
    try {
        if (command.type === 'createPage') {
            if (table.tabOf(pageId) !== undefined) {
                return failed('browser_error'); // a bound id never gets a second tab
            }
            if (deps.agentsStopped?.()) {
                return failed('browser_owner_unavailable'); // agent-browser-04: Stop refuses new pages until Resume
            }
            const tabId = await deps.openAgentTab(event);
            const bound = table.bind(pageId, tabId);
            if (bound === 'duplicate-page') {
                deps.closeTab(tabId); // a concurrent createPage bound the id first; this new tab is unbound
            }
            return bound === 'bound' ? completed() : failed('browser_error');
        }
        if (command.type === 'closePage') {
            const target = command.targetAuthority?.browserPageId ?? pageId;
            const tabId = table.tabOf(target);
            if (tabId === undefined) {
                return table.wasDropped(target) ? completed() : failed('browser_tab_not_found');
            }
            table.drop(target); // first, so the widget's disposed handler sends no user close
            deps.closeTab(tabId);
            return completed();
        }
        const tabId = table.tabOf(pageId);
        if (tabId === undefined) {
            return failed('browser_tab_not_found');
        }
        if (command.type === 'navigate') {
            const reply = await deps.navigate(tabId, command.url || 'about:blank') as AgentReply | undefined;
            const outcome = reply?.ok === true && reply.where === undefined ? completed() : outcomeOf(reply);
            return outcome.status === 'completed' ? completed() : outcome;
        }
        if (command.type === 'reclaimPage' || command.type === 'restorePage') {
            return completed(); // the id is bound to a tab this host created; nothing is adopted
        }
        if (command.type === 'automation') {
            const method = command.method ?? '';
            if (!SERVED_AUTOMATION_METHODS.includes(method)) {
                return failed('browser_command_unavailable');
            }
            const outcome = outcomeOf(await deps.agentCall(tabId, method, command.params ?? {}));
            if (method === 'browser.snapshot' && outcome.status === 'completed') {
                // A5: Orca's desktop host adds the page's identity to agent-browser's snapshot.
                const result = typeof outcome.result === 'object' && outcome.result !== null ? outcome.result : {};
                return completed({ ...result, browserPageId: pageId, ...deps.pageInfo(tabId) });
            }
            return outcome;
        }
        return failed('browser_command_unavailable');
    } catch (error) {
        return failed(error instanceof DispatchFailure ? error.errorCode : 'browser_error');
    }
}

/** The fields of one Orca store record the reveal tracker reads (orca-panes' OrcaPaneRecord, Phase 64 C3). */
export interface BrowserRecord {
    browserPageId?: string | null;
    active: boolean;
}

export interface RevealTracker {
    /** Marks a page whose createPage this host served: the activation that follows it is not a reveal. */
    noteCreated(pageId: string): void;
    /** One subscribePanes list's browser records -> the pages whose bound web tab is to be revealed. */
    next(records: readonly BrowserRecord[], table: Pick<PageTable, 'tabOf'>): string[];
}

/**
 * P66-09 activation rule: a page is revealed only when its record turns active while the same record was present
 * and inactive in the previous list, the page was bound before this list, and noteCreated has not marked it. A
 * mark is cleared without a reveal by the page's first listed record: D-34's row is PowerBrowser's own, added in the
 * background after the createPage it served, so no creation activation follows it and the next activation is a
 * selection.
 */
export function createRevealTracker(): RevealTracker {
    let previous = new Map<string, boolean>();
    const created = new Set<string>();
    return {
        noteCreated(pageId) {
            created.add(pageId);
        },
        next(records, table) {
            const current = new Map<string, boolean>();
            for (const record of records) {
                if (record.browserPageId) {
                    current.set(record.browserPageId, current.get(record.browserPageId) === true || record.active === true);
                }
            }
            const reveal: string[] = [];
            for (const [pageId, active] of current) {
                if (created.delete(pageId)) {
                    continue;
                }
                if (active && previous.get(pageId) === false && table.tabOf(pageId) !== undefined) {
                    reveal.push(pageId);
                }
            }
            previous = current;
            return reveal;
        },
    };
}
