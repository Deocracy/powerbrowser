/**
 * The values the PowerBrowser browser host puts on the wire to orcad, and the deadlines it holds, as pure functions:
 * no DOM, no Theia import, so Node can run them against Orca's own schemas (scripts/verify-orca-browser-host-wire.mjs).
 *
 * - 66-CR-02: pageMetadataOf gives every field of Orca's BrowserClientPageMetadataParams snapshot, within its caps.
 * - 66-CR-03: inventoryOf names only the pages of the attaching host id, as BrowserClientHostAttachParams requires,
 *   and reboundEvent keeps a page's authority current after orcad reclaims or restores it.
 * - 66-CR-04: agentCallTimeoutMs outlives chrome's own deadline for a command, so chrome reports its timeout.
 * - 66-WR-02: withDeadline bounds a start step that could otherwise wait forever.
 * - 66-WR-04: boundedOutcome answers failed for a completed value over Orca's result budget.
 */
import type { CommandEvent, Outcome } from './orca-browser-dispatch';

/** Orca's caps on a page metadata snapshot (browser-client-page-metadata-protocol.ts). */
export const PAGE_METADATA_URL_MAX = 8192;
export const PAGE_METADATA_TITLE_MAX = 4096;

export interface PageMetadata {
    url: string;
    title: string;
    loading: boolean;
    canGoBack: boolean;
    canGoForward: boolean;
}

/**
 * 59-WR-03 (round 3): the url and title the dispatcher adds to a browser.snapshot result, capped at Orca's page metadata
 * bounds. Chrome measures the snapshot against Orca's result budget with room reserved for exactly these caps
 * (PowerBrowserAPI.sys.mjs agentSnapshotReserve), so an uncapped tab url or title could push a result chrome passed over
 * the budget.
 */
export function pageInfoOf(url: unknown, title: unknown): { url: string; title: string } {
    return {
        url: (typeof url === 'string' ? url : '').slice(0, PAGE_METADATA_URL_MAX),
        title: (typeof title === 'string' ? title : '').slice(0, PAGE_METADATA_TITLE_MAX),
    };
}

/** One web tab state push -> the page snapshot Orca's schema takes; undefined when the push carries no url. */
export function pageMetadataOf(detail: Record<string, unknown>): PageMetadata | undefined {
    if (typeof detail.url !== 'string') {
        return undefined;
    }
    return {
        url: detail.url.slice(0, PAGE_METADATA_URL_MAX),
        title: (typeof detail.title === 'string' ? detail.title : '').slice(0, PAGE_METADATA_TITLE_MAX),
        loading: detail.loading === true,
        canGoBack: detail.canGoBack === true,
        canGoForward: detail.canGoForward === true,
    };
}

/** The command event a binding keeps: the inventory entry and the user-close selector come from its fields. */
export type BoundEvent = CommandEvent & Record<string, unknown>;

export interface BoundPage {
    pageId: string;
    event: BoundEvent;
    url?: string;
}

/**
 * Orca's page inventory limits (browser-client-host-protocol.ts): pages, the whole list's UTF-8 JSON bytes, one
 * identity's JSON bytes, and a current URL's length. Orca refuses the whole attach when any one is exceeded.
 */
export const PAGE_INVENTORY_MAX_PAGES = 256;
export const PAGE_INVENTORY_MAX_BYTES = 768 * 1024;
export const PAGE_INVENTORY_IDENTITY_MAX_JSON_BYTES = 384;
export const PAGE_INVENTORY_URL_MAX = 8192;

const jsonBytes = (value: unknown): number => new TextEncoder().encode(JSON.stringify(value)).byteLength;

export interface PageInventory {
    entries: Record<string, unknown>[];
    /** Bound pages of this host left out because an entry would break one of Orca's limits (66-CR-03 review). */
    dropped: string[];
}

/**
 * Orca's page inventory entries for the bound pages of the attaching host. Orca refuses the whole attach when one entry
 * names another browserHostClientId, so an entry kept from another id is left out (66-CR-03). The list stays inside
 * Orca's page count and byte budget: an entry that does not fit is first tried without its current URL, then left out
 * and named in dropped, so the caller can end that page rather than lose it silently.
 */
export function inventoryOf(pages: readonly BoundPage[], browserHostClientId: string): PageInventory {
    const entries: Record<string, unknown>[] = [];
    const dropped: string[] = [];
    let bytes = 2; // the brackets of the JSON array
    for (const { pageId, event, url } of pages) {
        if (event.browserHostClientId !== browserHostClientId) {
            continue;
        }
        const command = event.command as Record<string, unknown>;
        const entry: Record<string, unknown> = {
            authorityRuntimeId: event.authorityRuntimeId, authorityEpoch: event.authorityEpoch,
            browserHostClientId: event.browserHostClientId, browserHostGeneration: event.browserHostGeneration,
            browserPageId: pageId, pageHostGeneration: event.pageHostGeneration,
            browserProfileId: command.browserProfileId, executionHostKey: command.executionHostKey,
            state: 'active',
            ...(typeof command.workspaceId === 'string' ? { workspaceId: command.workspaceId } : {}),
        };
        const identities = ['authorityRuntimeId', 'authorityEpoch', 'browserHostClientId', 'browserPageId', 'browserProfileId', 'executionHostKey', 'workspaceId'];
        const separator = entries.length ? 1 : 0;
        const withUrl = url && url.length <= PAGE_INVENTORY_URL_MAX ? { ...entry, currentUrl: url } : entry;
        const fits = (candidate: Record<string, unknown>) => bytes + separator + jsonBytes(candidate) <= PAGE_INVENTORY_MAX_BYTES;
        const chosen = fits(withUrl) ? withUrl : fits(entry) ? entry : undefined;
        if (!chosen || entries.length >= PAGE_INVENTORY_MAX_PAGES
            || identities.some(key => typeof entry[key] === 'string' && jsonBytes(entry[key]) > PAGE_INVENTORY_IDENTITY_MAX_JSON_BYTES)) {
            dropped.push(pageId);
            continue;
        }
        bytes += separator + jsonBytes(chosen);
        entries.push(chosen);
    }
    return { entries, dropped };
}

/**
 * 66-CR-03: a completed reclaimPage or restorePage moves the page to the new lease's authority, which the next
 * inventory must name; the profile, execution host and workspace stay those of the page.
 */
export function reboundEvent(previous: BoundEvent, event: BoundEvent): BoundEvent {
    if (event.command.type !== 'reclaimPage' && event.command.type !== 'restorePage') {
        return previous;
    }
    return { ...event, command: { ...previous.command, ...event.command } } as BoundEvent;
}

/** Orca's budget for a completed automation value, in UTF-8 JSON bytes (browser-client-automation-protocol.ts). */
export const AUTOMATION_RESULT_MAX_BYTES = 768 * 1024;

/** 66-WR-04: a completed value Orca's schema would refuse is answered failed, so the command never goes unanswered. */
export function boundedOutcome(outcome: Outcome): Outcome {
    if (outcome.status !== 'completed' || outcome.result === undefined) {
        return outcome;
    }
    let bytes = Number.POSITIVE_INFINITY;
    try {
        bytes = new TextEncoder().encode(JSON.stringify(outcome.result)).byteLength;
    } catch {
        // an unserialisable value is over budget
    }
    return bytes > AUTOMATION_RESULT_MAX_BYTES ? { status: 'failed', errorCode: 'browser_error' } : outcome;
}

/**
 * 66-CR-04: how long the host waits for chrome's reply to one agent command. Chrome's own deadline is the command's
 * timeout (30 s when none is given) plus up to about 3 s of settle; Orca's forwarding hop waits at least 60 s or the
 * timeout plus 30 s. This sits between them, so chrome reports its own browser_timeout and orcad hears an answer.
 */
export const AGENT_CALL_MIN_TIMEOUT_MS = 35_000;
export const AGENT_CALL_MARGIN_MS = 5_000;
/**
 * 66-CR-04 review: the longest timeout an agent command may ask chrome for, 10 minutes. The agent supplies the value,
 * so without a cap a value past the 32-bit timer limit (2^31 - 1 ms) makes the deadline timer fire at once, and a value
 * just below it holds a listener and orcad's command open for weeks. agentParams lowers a larger timeout to this one
 * before chrome sees it, so chrome's own wait ends at it too.
 */
export const AGENT_CALL_MAX_TIMEOUT_MS = 600_000;
const timeoutOf = (params: Record<string, unknown> | undefined): number =>
    typeof params?.timeout === 'number' && Number.isFinite(params.timeout) && params.timeout > 0 ? Math.min(params.timeout, AGENT_CALL_MAX_TIMEOUT_MS) : 0;
export function agentCallTimeoutMs(params: Record<string, unknown> | undefined): number {
    return Math.max(AGENT_CALL_MIN_TIMEOUT_MS, timeoutOf(params) + AGENT_CALL_MARGIN_MS);
}
/** The params sent to chrome: a timeout above AGENT_CALL_MAX_TIMEOUT_MS is lowered to it; anything else is unchanged. */
export function agentParams(params: Record<string, unknown>): Record<string, unknown> {
    return typeof params.timeout === 'number' && params.timeout > AGENT_CALL_MAX_TIMEOUT_MS ? { ...params, timeout: AGENT_CALL_MAX_TIMEOUT_MS } : params;
}

/** 66-WR-02: how long one start step (the link, its connection) may take before the attach is logged as failed. */
export const START_STEP_DEADLINE_MS = 60_000;

/** Settles as the promise does, or rejects with 'deadline' after ms; onExpiry runs once at the deadline. */
export function withDeadline<T>(promise: Promise<T>, ms: number, onExpiry?: () => void): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
            try {
                onExpiry?.();
            } finally {
                reject(new Error('deadline'));
            }
        }, ms);
        promise.then(
            value => { clearTimeout(timer); resolve(value); },
            error => { clearTimeout(timer); reject(error); },
        );
    });
}
