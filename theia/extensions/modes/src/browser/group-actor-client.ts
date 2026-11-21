/**
 * GUI-08 (15-01): Theia-side half of the PowerBrowserGroup mutation channel.
 *
 * The frontend is unprivileged web content -- it cannot touch the actor --
 * so each mutation goes out as a `PowerBrowserGroupRequest` DOM CustomEvent
 * carrying { requestId, msg }, and the chrome-side child answers with a
 * `PowerBrowserGroupResponse` event carrying { requestId, reply }. This
 * correlator matches answers to callers by requestId with a 5s ack timeout
 * (15-RESEARCH.md OQ1); a nack or timeout rejects, and the GroupModel turns
 * that into the contracted save-error bar with Retry. With no chrome host
 * (plain Theia dev), every mutation times out rather than hanging -- the
 * same bar, honestly.
 */

import { injectable } from '@theia/core/shared/inversify';

/** Wire event names shared with `GroupActorChild.sys.mjs` (chrome side). */
export const GROUP_REQUEST_EVENT = 'PowerBrowserGroupRequest';
export const GROUP_RESPONSE_EVENT = 'PowerBrowserGroupResponse';

/** Ack timeout per mutation: matches the sidecar health-timeout scale. */
export const GROUP_ACTOR_ACK_TIMEOUT_MS = 5000;

/** The message kinds the parent dispatch (handleGroupMutation) serves for groups and tab rows. */
export type GroupMutation =
    | { kind: 'createGroup'; id: string; title?: string; x?: number; y?: number; w?: number; h?: number; isActive?: boolean }
    | { kind: 'setTabGroup'; uri: string; groupId: string | null }
    | { kind: 'setTabPosition'; uri: string; x: number | null; y: number | null }
    | { kind: 'setGroupOrder'; groupId: string; uris: string[] }
    | { kind: 'captureShellRegion'; rect: { x: number; y: number; w: number; h: number } }
    | { kind: 'moveGroup'; id: string; x: number; y: number }
    | { kind: 'resizeGroup'; id: string; w: number; h: number }
    | { kind: 'renameGroup'; id: string; title: string }
    | { kind: 'dissolveGroup'; id: string }
    | { kind: 'closeGroup'; id: string }
    | { kind: 'setActiveGroup'; id: string }
    | { kind: 'trackTab'; uri: string; url: string; title: string }
    | { kind: 'closeTab'; uri: string }
    | { kind: 'touchTab'; uri: string };

/** Parent ack shape: `{ ok: true, ...echo } | { ok: false, reason }`. */
export interface GroupReply {
    ok: boolean;
    reason?: 'validation' | 'store';
    message?: string;
    [key: string]: unknown;
}

/** Rejection when a mutation is nacked or the ack never arrives. */
export class GroupWriteError extends Error {
    constructor(
        message: string,
        readonly reason: 'validation' | 'store' | 'timeout'
    ) {
        super(message);
        this.name = 'GroupWriteError';
    }
}

@injectable()
export class GroupActorClient {
    private seq = 0;
    private readonly pending = new Map<string, { resolve: (reply: GroupReply) => void; reject: (err: Error) => void; timer: number }>();
    private listening = false;

    /**
     * Sends one mutation and resolves with the parent ack. Rejects with
     * GroupWriteError on nack or after the ack timeout -- never hangs, never
     * throws synchronously.
     */
    mutate(msg: GroupMutation): Promise<GroupReply> {
        this.ensureListening();
        const requestId = `group-${Date.now().toString(36)}-${(this.seq += 1)}`;
        // The waiter is registered before the dispatch: when sendQuery throws,
        // the actor child answers inside this dispatch (IN-10), and a reply that
        // finds no waiter is dropped, leaving the caller to wait out the timeout.
        const reply = new Promise<GroupReply>((resolve, reject) => {
            const timer = window.setTimeout(() => {
                this.pending.delete(requestId);
                reject(new GroupWriteError(`GroupActorClient: ack timeout for ${msg.kind}`, 'timeout'));
            }, GROUP_ACTOR_ACK_TIMEOUT_MS);
            this.pending.set(requestId, { resolve, reject, timer });
        });
        // Dispatch on `document`, bubbling. Both halves are load-bearing and
        // 15-01 had neither, which is why this channel never once worked.
        //
        // JSWindowActor `events` listeners are installed on the WINDOW ROOT
        // (JSActorService::RegisterChromeEventTarget -> RegisterListenersFor,
        // "Register event listeners on the newly added Window Root"). An event
        // dispatched on `window` with the default bubbles:false has a
        // propagation path that never reaches that root, so the actor child was
        // never instantiated and every mutation waited out the full 5s ack
        // timeout into the contracted save-error bar.
        //
        // `document` + bubbles:true is exactly the shape upstream uses for the
        // same job -- see aboutLogins.mjs:296,
        // `document.dispatchEvent(new CustomEvent("AboutLoginsInit", { bubbles: true }))`.
        // Keep both; dropping either silently kills the channel again, and the
        // failure looks like a store error rather than a transport one.
        document.dispatchEvent(
            new CustomEvent(GROUP_REQUEST_EVENT, { detail: { requestId, msg }, bubbles: true })
        );
        return reply;
    }

    private ensureListening(): void {
        if (this.listening) {
            return;
        }
        this.listening = true;
        window.addEventListener(GROUP_RESPONSE_EVENT, this.onResponse);
    }

    private readonly onResponse = (event: Event): void => {
        try {
            const detail = (event as CustomEvent).detail as { requestId?: unknown; reply?: unknown } | undefined;
            const requestId = detail?.requestId;
            const reply = detail?.reply as GroupReply | undefined;
            if (typeof requestId !== 'string' || !reply || typeof reply !== 'object') {
                return;
            }
            const waiter = this.pending.get(requestId);
            if (!waiter) {
                return;
            }
            this.pending.delete(requestId);
            window.clearTimeout(waiter.timer);
            if (reply.ok) {
                waiter.resolve(reply);
            } else {
                waiter.reject(new GroupWriteError(
                    typeof reply.message === 'string' && reply.message ? reply.message : `group write rejected (${reply.reason ?? 'store'})`,
                    reply.reason === 'validation' ? 'validation' : 'store'
                ));
            }
        } catch (error) {
            console.error('[@powerbrowser/modes] group response dispatch failed:', error);
        }
    };
}
