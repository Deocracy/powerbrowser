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

export interface DispatchDeps {
    table: PageTable;
    /** Opens one new background agent web tab for a createPage event; resolves to its tab id. */
    openAgentTab(event: CommandEvent): Promise<string>;
    closeTab(tabId: string): void;
    navigate(tabId: string, url: string): Promise<unknown>;
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
    } catch {
        return failed('browser_error');
    }
}
