/**
 * Phase 67 (RUN-06; P67-01, P67-04, P67-07, P67-32, P67-36): the frontend's
 * view of Orca's hosting state, shared by every hosted Orca view.
 *
 * It reaches chrome only through the shell kinds orcaStatus, orcaRestart and
 * orcaShowDiagnostics on the PowerBrowserGroupRequest / PowerBrowserGroupResponse
 * channel (request() copies tab-uris' update-client.ts) and reads only
 * { state, failureClass } from the reply; no identifier reaches the page.
 *
 * Polling (P67-07): orcaStatus once a second while at least one failure page
 * is shown, and while the pane bundle has not settled its boot (a hosted tab
 * restored before orcad is ready has no other way to learn that orcad failed).
 * Log lines name the kind and the reply's reason field only.
 */
import { inject, injectable } from '@theia/core/shared/inversify';
import { Emitter, Event as TheiaEvent } from '@theia/core/lib/common/event';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { OrcaPaneBundle } from '../orca-pane-bundle';
import { ORCA_CLIENT_REASON_CLASS, ORCA_FAILURE_COPY, OrcaFailureClass } from './orca-failure-copy';

const LOG_PREFIX = '[@powerbrowser/orca-panes]';
const SHELL_REQUEST_EVENT = 'PowerBrowserGroupRequest';
const SHELL_RESPONSE_EVENT = 'PowerBrowserGroupResponse';
const SHELL_ACK_TIMEOUT_MS = 5000;
/** P67-07 (Claude's discretion): one orcaStatus a second while a page is shown. */
export const ORCA_STATUS_POLL_MS = 1000;

/** The messages this client sends (interfaces block, shared with lane p67-01). */
export type OrcaShellMessage =
    | { kind: 'orcaStatus'; clientReason?: string }
    | { kind: 'orcaRestart' }
    | { kind: 'orcaShowDiagnostics' };

interface ShellReply {
    ok: boolean;
    kind?: string;
    state?: unknown;
    failureClass?: unknown;
    accepted?: unknown;
    reason?: string;
}

type ShellOutcome = ShellReply | 'no-chrome';

const isFailureClass = (value: unknown): value is OrcaFailureClass =>
    typeof value === 'string' && Object.prototype.hasOwnProperty.call(ORCA_FAILURE_COPY, value);

@injectable()
export class OrcaHostingStatus implements FrontendApplicationContribution {

    @inject(OrcaPaneBundle)
    protected readonly bundle: OrcaPaneBundle;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    /** Fires when the effective class may have changed. */
    readonly onDidChange: TheiaEvent<void> = this.onDidChangeEmitter.event;

    /** The last orcaStatus reply: chrome's state and class. */
    protected chrome: { state: string | null; failureClass: OrcaFailureClass | null } = { state: null, failureClass: null };
    /** A client failure this frontend saw (a key of ORCA_CLIENT_REASON_CLASS); frontend-only. */
    protected clientReason: string | undefined;
    protected readonly pages = new Set<object>();
    protected timer: number | undefined;
    protected bootSettled = false;
    protected seq = 0;
    protected polling: Promise<void> | undefined;
    protected readonly logged = new Set<string>();

    onStart(): void {
        const settle = () => {
            this.bootSettled = true;
            this.schedule();
        };
        this.bundle.ready().then(settle, settle);
        this.schedule();
        void this.poll();
    }

    /** The class every hosted view shows: chrome's when set, else the client's, else none. */
    get failureClass(): OrcaFailureClass | null {
        return this.chrome.failureClass ?? (this.clientReason ? ORCA_CLIENT_REASON_CLASS[this.clientReason] ?? null : null);
    }

    /** A failure page appeared (handle: any object the page keeps until hide). */
    show(handle: object): void {
        this.pages.add(handle);
        this.schedule();
    }

    hide(handle: object): void {
        this.pages.delete(handle);
        this.schedule();
    }

    restart(): Promise<void> {
        return this.send({ kind: 'orcaRestart' }).then(() => this.poll());
    }

    showDetails(): Promise<void> {
        return this.send({ kind: 'orcaShowDiagnostics' }).then(() => undefined);
    }

    /** A client failure from the closed set: held here (pairing-lost) and reported to chrome for its diagnostics row. */
    reportClientReason(reason: string): Promise<void> {
        if (!Object.prototype.hasOwnProperty.call(ORCA_CLIENT_REASON_CLASS, reason)) {
            return Promise.resolve();
        }
        this.setClientReason(reason);
        return this.send({ kind: 'orcaStatus', clientReason: reason }).then(reply => this.take(reply));
    }

    protected setClientReason(reason: string | undefined): void {
        const before = this.failureClass;
        this.clientReason = reason;
        if (this.failureClass !== before) {
            this.onDidChangeEmitter.fire();
        }
    }

    protected schedule(): void {
        const wanted = this.pages.size > 0 || !this.bootSettled;
        if (wanted && this.timer === undefined) {
            this.timer = window.setInterval(() => void this.poll(), ORCA_STATUS_POLL_MS);
        } else if (!wanted && this.timer !== undefined) {
            window.clearInterval(this.timer);
            this.timer = undefined;
        }
    }

    /** One orcaStatus round trip; overlapping calls share it. */
    poll(): Promise<void> {
        return this.polling ??= this.send({ kind: 'orcaStatus' })
            .then(reply => this.take(reply))
            .finally(() => { this.polling = undefined; });
    }

    protected take(reply: ShellOutcome): void {
        if (reply === 'no-chrome' || !reply.ok || reply.kind !== 'orcaStatus') {
            return;
        }
        const next = {
            state: typeof reply.state === 'string' ? reply.state : null,
            failureClass: isFailureClass(reply.failureClass) ? reply.failureClass : null,
        };
        const before = this.failureClass;
        this.chrome = next;
        if (this.failureClass !== before) {
            this.onDidChangeEmitter.fire();
        }
    }

    protected async send(msg: OrcaShellMessage): Promise<ShellOutcome> {
        const reply = await this.request(msg);
        if (reply !== 'no-chrome' && !reply.ok) {
            const line = `${msg.kind} was not answered: ${reply.reason ?? 'no reason'}`;
            if (!this.logged.has(line)) {
                this.logged.add(line);
                console.warn(`${LOG_PREFIX} ${line}`);
            }
        }
        return reply;
    }

    /** update-client.ts's request(): own id prefix, 5 s acknowledgement, 'no-chrome' off 127.0.0.1. */
    protected request(msg: OrcaShellMessage): Promise<ShellOutcome> {
        if (location.protocol !== 'http:' || location.hostname !== '127.0.0.1') {
            return Promise.resolve('no-chrome');
        }
        return new Promise<ShellOutcome>(resolve => {
            const requestId = `orca-${msg.kind}-${Date.now().toString(36)}-${(this.seq += 1)}`;
            const settle = (reply: ShellOutcome): void => {
                window.removeEventListener(SHELL_RESPONSE_EVENT, onResponse);
                window.clearTimeout(timer);
                resolve(reply);
            };
            const onResponse = (event: Event): void => {
                const detail = (event as CustomEvent).detail as { requestId?: unknown; reply?: unknown } | undefined;
                if (!detail || detail.requestId !== requestId) {
                    return;
                }
                settle(detail.reply && typeof detail.reply === 'object'
                    ? detail.reply as ShellReply
                    : { ok: false, reason: 'validation' });
            };
            const timer = window.setTimeout(() => settle({ ok: false, reason: 'timeout' }), SHELL_ACK_TIMEOUT_MS);
            window.addEventListener(SHELL_RESPONSE_EVENT, onResponse);
            try {
                document.dispatchEvent(new CustomEvent(SHELL_REQUEST_EVENT, { bubbles: true, detail: { requestId, msg } }));
            } catch {
                settle('no-chrome');
            }
        });
    }
}
