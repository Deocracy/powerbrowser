/**
 * Phase 67 (RUN-06; P67-01, P67-04, P67-06, P67-07, P67-09, P67-32, P67-36):
 * the frontend's view of Orca's hosting state, shared by every hosted Orca view.
 *
 * It reaches chrome only through the shell kinds orcaStatus, orcaRestart and
 * orcaShowDiagnostics on the PowerBrowserGroupRequest / PowerBrowserGroupResponse
 * channel (request() copies tab-uris' update-client.ts) and reads only
 * { state, failureClass } from the reply; no identifier reaches the page.
 *
 * Polling (P67-07): orcaStatus once a second while at least one failure page
 * is shown, and while the pane bundle has not settled its boot (a hosted tab
 * restored before orcad is ready has no other way to learn that orcad failed).
 * After boot, a change of the Orca client's own connection state (Orca's web
 * preload, window.api.runtimeEnvironments.onStatusChanged) asks once.
 *
 * Reconnect (P67-06) re-reads the offer over OrcaPanesService.handOff (64 C6)
 * and calls the pane bundle's repair(offer) (C3-65), after firing onWillRepair
 * so the pane observer holds its tabs while Orca's store hydrates again (D-36); for
 * browser-not-attached it calls OrcaBrowserHost.attach() instead (P67-36).
 * After a chrome class of restarting, could-not-start or port-in-use returns to
 * ready, the same re-pair runs once by itself: the session-only device row died
 * with the old orcad (P65-17, A-7). The offer is passed on and dropped, never
 * stored or logged. Log lines name the kind and the reply's reason field only.
 */
import { inject, injectable } from '@theia/core/shared/inversify';
import { Emitter, Event as TheiaEvent } from '@theia/core/lib/common/event';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { OrcaBrowserHost } from '@powerbrowser/orca-browser/lib/browser/orca-browser-frontend-module';
import { OrcaPanesService } from '../../common/orca-panes-protocol';
import type { OfferHandOff } from '../../node/offer-file-policy';
import { OrcaPaneBundle } from '../orca-pane-bundle';
import { ORCA_CLIENT_REASON_CLASS, ORCA_FAILURE_COPY, OrcaFailureClass } from './orca-failure-copy';

const LOG_PREFIX = '[@powerbrowser/orca-panes]';
const SHELL_REQUEST_EVENT = 'PowerBrowserGroupRequest';
const SHELL_RESPONSE_EVENT = 'PowerBrowserGroupResponse';
const SHELL_ACK_TIMEOUT_MS = 5000;
/** P67-07 (Claude's discretion): one orcaStatus a second while a page is shown. */
export const ORCA_STATUS_POLL_MS = 1000;
/** Ready polls before a still-booting frontend asks the backend why (the loader's own hand-off backoff caps at 5 s). */
const STUCK_BOOT_POLLS = 6;
/** Chrome classes after which a return to ready re-pairs once by itself (P67-06). */
const REPAIR_AFTER: readonly OrcaFailureClass[] = ['restarting', 'could-not-start', 'port-in-use'];
/** Orca's WebRuntimeAuthFailureReason members: held until the client verifies again or a re-pair succeeds. */
const AUTH_REASONS: readonly string[] = ['unauthorized', 'device-revoked', 'device-downgraded', 'insecure-origin'];

/**
 * The messages this client sends (interfaces block, shared with lane p67-01). The clearing form
 * { kind: 'orcaStatus', browserHost: 'attached' } is sent by @powerbrowser/orca-browser's
 * OrcaBrowserHost after each successful attach (coordinator ruling at 67-03), never by this client.
 */
export type OrcaShellMessage =
    | { kind: 'orcaStatus'; clientReason?: string }
    | { kind: 'orcaStatus'; browserHost: 'attached' }
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

/** C3-65: the pane entry's re-pair, which OrcaPaneBundleApi (64 C3) does not list. */
interface RepairApi {
    repair(offer: string): Promise<void>;
}

/** The part of Orca's RuntimeHostStatusSnapshot (shared/runtime-host-status.ts) this client reads. */
interface ClientStatus {
    verification?: string;
    blockedReason?: string;
    transport?: string;
}

interface ClientStatusApi {
    onStatusChanged(listener: (snapshot: ClientStatus) => void): () => void;
    getStatusSnapshots?(): Promise<ClientStatus[]>;
}

const isFailureClass = (value: unknown): value is OrcaFailureClass =>
    typeof value === 'string' && Object.prototype.hasOwnProperty.call(ORCA_FAILURE_COPY, value);

@injectable()
export class OrcaHostingStatus implements FrontendApplicationContribution {

    @inject(OrcaPaneBundle)
    protected readonly bundle: OrcaPaneBundle;

    @inject(OrcaPanesService)
    protected readonly service: OrcaPanesService;

    @inject(OrcaBrowserHost)
    protected readonly browserHost: OrcaBrowserHost;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    /** Fires when the effective class may have changed. */
    readonly onDidChange: TheiaEvent<void> = this.onDidChangeEmitter.event;

    protected readonly onWillRepairEmitter = new Emitter<void>();
    /** D-36: fires immediately before each repair(offer). */
    readonly onWillRepair: TheiaEvent<void> = this.onWillRepairEmitter.event;

    /** The last orcaStatus reply: chrome's state and class. */
    protected chrome: { state: string | null; failureClass: OrcaFailureClass | null } = { state: null, failureClass: null };
    /** A client failure this frontend saw (a key of ORCA_CLIENT_REASON_CLASS); frontend-only. */
    protected clientReason: string | undefined;
    /** The chrome class kept on the page while the automatic re-pair after it runs. */
    protected held: OrcaFailureClass | null = null;
    protected api: RepairApi | undefined;
    protected readonly pages = new Set<object>();
    protected timer: number | undefined;
    protected bootSettled = false;
    protected readyPollsBeforeBoot = 0;
    protected seq = 0;
    protected polling: Promise<void> | undefined;
    protected reconnecting: Promise<void> | undefined;
    protected readonly logged = new Set<string>();

    onStart(): void {
        const settle = () => {
            this.bootSettled = true;
            this.schedule();
        };
        this.bundle.ready().then(api => {
            this.api = api as unknown as RepairApi;
            this.watchClient();
            settle();
        }, settle);
        this.browserHost.onDidChangeState(() => this.onDidChangeEmitter.fire());
        this.schedule();
        void this.poll();
    }

    /**
     * The class every hosted view shows: chrome's when set, then the class held during an automatic
     * re-pair, then this frontend's client reason, then its own browser host's failure. A chrome
     * browser-not-attached gives way to this frontend's own attached host: chrome holds that reason
     * until it receives the clearing form, and this frontend's state is the fresher one.
     */
    get failureClass(): OrcaFailureClass | null {
        let chrome = this.chrome.failureClass;
        if (chrome === 'browser-not-attached' && this.browserHost.state === 'attached') {
            chrome = null;
        }
        const client = this.clientReason ? ORCA_CLIENT_REASON_CLASS[this.clientReason] ?? null : null;
        const host: OrcaFailureClass | null = this.browserHost.state === 'failed' ? 'browser-not-attached' : null;
        return chrome ?? this.held ?? client ?? host;
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

    /** Reconnect: one attempt at a time. */
    reconnect(): Promise<void> {
        return this.reconnecting ??= this.runReconnect().finally(() => { this.reconnecting = undefined; });
    }

    protected async runReconnect(): Promise<void> {
        if (this.failureClass === 'browser-not-attached') {
            await this.browserHost.attach(); // its outcome fires onDidChangeState
            return;
        }
        const result = await (this.service.handOff() as Promise<OfferHandOff>).catch(() => undefined);
        if (!result) {
            // No offer while orcad is ready means it is missing; otherwise orcad is not up and the poll says so.
            if (this.chrome.state === 'ready') {
                await this.reportClientReason('offer-missing');
            }
            return;
        }
        if ('refused' in result) {
            await this.reportClientReason(result.refused);
            return;
        }
        if (this.api) {
            try {
                this.onWillRepairEmitter.fire();
                await this.api.repair(result.pairing);
            } catch {
                await this.reportClientReason('unauthorized');
                return;
            }
        }
        // Not booted yet: the loader's own hand-off loop pairs with this offer.
        this.setClientReason(undefined);
        if (this.browserHost.state === 'failed') {
            void this.browserHost.attach();
        }
    }

    /** A client failure from the closed set: held here and reported to chrome for its diagnostics row. */
    reportClientReason(reason: string): Promise<void> {
        if (!Object.prototype.hasOwnProperty.call(ORCA_CLIENT_REASON_CLASS, reason)) {
            return Promise.resolve();
        }
        this.setClientReason(reason);
        return this.send({ kind: 'orcaStatus', clientReason: reason }).then(reply => this.take(reply));
    }

    protected change(mutate: () => void): void {
        const before = this.failureClass;
        mutate();
        if (this.failureClass !== before) {
            this.onDidChangeEmitter.fire();
        }
    }

    protected setClientReason(reason: string | undefined): void {
        this.change(() => { this.clientReason = reason; });
    }

    /** Orca's client connection state, from Orca's web preload in this document (66-01). */
    protected watchClient(): void {
        const environments = (window as unknown as { api?: { runtimeEnvironments?: ClientStatusApi } }).api?.runtimeEnvironments;
        if (typeof environments?.onStatusChanged !== 'function') {
            console.warn(`${LOG_PREFIX} the Orca client's connection state is not exposed; client failures are not reported`);
            return;
        }
        environments.onStatusChanged(snapshot => this.onClientStatus(snapshot));
        environments.getStatusSnapshots?.().then(list => list.forEach(s => this.onClientStatus(s)), () => undefined);
    }

    /**
     * A refused client is held at verification 'blocked' with blockedReason 'access-revoked' (Orca's status owner:
     * authenticationRejected); the snapshot carries no finer reason, so it is reported as 'unauthorized'. A host with
     * an unreadable registry answers registry_unavailable, which the client retries and never reports (A-12).
     */
    protected onClientStatus(snapshot: ClientStatus): void {
        if (snapshot?.verification === 'blocked' && snapshot.blockedReason === 'access-revoked') {
            if (this.clientReason !== 'unauthorized') {
                void this.reportClientReason('unauthorized');
            }
        } else if (snapshot?.transport !== 'ready') {
            void this.poll(); // the client lost orcad: ask chrome why
        } else if (snapshot.verification === 'verified' && this.clientReason && AUTH_REASONS.includes(this.clientReason)) {
            this.setClientReason(undefined);
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
        const before = this.chrome.failureClass;
        const recovered = before !== null && REPAIR_AFTER.includes(before) && next.state === 'ready' && next.failureClass === null;
        this.change(() => {
            this.chrome = next;
            if (recovered) {
                this.held = before;
            }
        });
        if (recovered) {
            void this.reconnect().finally(() => this.change(() => { this.held = null; }));
        }
        this.readyPollsBeforeBoot = !this.bootSettled && next.state === 'ready' ? this.readyPollsBeforeBoot + 1 : 0;
        if (this.readyPollsBeforeBoot >= STUCK_BOOT_POLLS) {
            void this.checkStuckOffer();
        }
    }

    /** orcad is ready but the loader still has no offer: a refused hand-off is the reason, shown as pairing-lost (P67-09). */
    protected async checkStuckOffer(): Promise<void> {
        const result = await (this.service.handOff() as Promise<OfferHandOff>).catch(() => undefined);
        if (result && 'refused' in result) {
            if (this.clientReason !== result.refused) {
                await this.reportClientReason(result.refused);
            }
        } else if (result && this.clientReason?.startsWith('offer-')) {
            this.setClientReason(undefined); // the file is good again; the loader boots with it
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
