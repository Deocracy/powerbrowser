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

/** Orca's page inventory limits (browser-client-host-protocol.ts). */
export const PAGE_INVENTORY_MAX_PAGES = 256;
export const PAGE_INVENTORY_URL_MAX = 8192;

/**
 * Orca's page inventory entries for the bound pages of the attaching host. Orca refuses the whole attach when one entry
 * names another browserHostClientId, so an entry kept from another id is left out (66-CR-03).
 */
export function inventoryOf(pages: readonly BoundPage[], browserHostClientId: string): Record<string, unknown>[] {
    return pages.filter(({ event }) => event.browserHostClientId === browserHostClientId).slice(0, PAGE_INVENTORY_MAX_PAGES).map(({ pageId, event, url }) => {
        const command = event.command as Record<string, unknown>;
        return {
            authorityRuntimeId: event.authorityRuntimeId, authorityEpoch: event.authorityEpoch,
            browserHostClientId: event.browserHostClientId, browserHostGeneration: event.browserHostGeneration,
            browserPageId: pageId, pageHostGeneration: event.pageHostGeneration,
            browserProfileId: command.browserProfileId, executionHostKey: command.executionHostKey,
            state: 'active',
            ...(url && url.length <= PAGE_INVENTORY_URL_MAX ? { currentUrl: url } : {}),
            ...(typeof command.workspaceId === 'string' ? { workspaceId: command.workspaceId } : {}),
        };
    });
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
export function agentCallTimeoutMs(params: Record<string, unknown> | undefined): number {
    const timeout = typeof params?.timeout === 'number' && Number.isFinite(params.timeout) && params.timeout > 0 ? params.timeout : 0;
    return Math.max(AGENT_CALL_MIN_TIMEOUT_MS, timeout + AGENT_CALL_MARGIN_MS);
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
