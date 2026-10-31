// The batching telemetry sender (04-03, TEL-01/TEL-02).
//
// DELIBERATELY ZERO-DEPENDENCY: this file imports only its zero-dependency
// siblings telemetry-error-report.ts (typeOf, the Error-input name) and
// telemetry-enrichment.ts (the admitted keys and shapes), so the unit suite
// (test/telemetry-sender.test.mjs) imports it straight from src/ under plain
// node with no build, no browser and no install -- and so it can never drag a
// Theia module (or its side effects) into the test.
// Erasable syntax only (no enums, namespaces, parameter properties or
// decorators): node type-stripping must accept it, and tsc must compile
// it, from the same bytes.
//
// WHAT IT DOES. In-memory batch queue, size-plus-interval flush,
// exponential-backoff retry with bounded attempts and then a drop with a
// console diagnostic. Per-event live level read through getLevel: `off`
// drops before queueing (nothing enqueued, nothing sent), `crash` and
// `error` admit the error path only, `all` admits usage plus error. An
// unrecognized level fails CLOSED to off -- a hand-edited config must
// silence the sender, never arm it.
//
// WHAT IT NEVER DOES. Never throws out of a telemetry path (every entry
// point catches; the worst case is a dropped event plus a diagnostic).
// Never grows without bound (the queue caps; see maxQueueEvents).
// Never enriches: the error path carries an identifier-shaped name plus only the
// admitted keys of caller data (ADMITTED_KEYS, each value in its admitted shape),
// never a message and never a stack (stacks carry file paths). Version, buildID
// and OS are added upstream by telemetry-enrichment.ts, not here. The at
// timestamp is transport metadata, not enrichment.

import { typeOf } from './telemetry-error-report.ts';
import { EVENT_NAME, admittedErrorData } from './telemetry-enrichment.ts';

export const TELEMETRY_LEVELS = ['off', 'crash', 'error', 'all'] as const;
export type TelemetryLevel = typeof TELEMETRY_LEVELS[number];

export type TelemetryEventKind = 'usage' | 'error';

export interface TelemetryEvent {
    kind: TelemetryEventKind;
    name: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data?: Record<string, any>;
    at: number;
}

export interface TelemetryFetchResponse {
    ok: boolean;
}

export interface TelemetrySenderOptions {
    /** Fixed at construction from the powerbrowserTelemetry fragment. */
    endpoint: string | undefined;
    /** Live read per event: the telemetry.telemetryLevel preference with the manifest level as default. */
    getLevel: () => string;
    fetchFn?: (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<TelemetryFetchResponse>;
    setTimeoutFn?: (cb: () => void, ms: number) => unknown;
    clearTimeoutFn?: (handle: unknown) => void;
    setIntervalFn?: (cb: () => void, ms: number) => unknown;
    clearIntervalFn?: (handle: unknown) => void;
    nowFn?: () => number;
    /** Events per POST. Default 20. */
    maxBatchSize?: number;
    /** Interval flush period. Default 30000. Zero or negative disables the timer. */
    flushIntervalMs?: number;
    /** Total tries per batch including the first. Default 3. */
    maxAttempts?: number;
    /** First retry delay; doubles per attempt. Default 1000. */
    baseDelayMs?: number;
    /** Queued (not yet taken for send) events cap; incoming drops past it. Default 500. */
    maxQueueEvents?: number;
    onDiagnostic?: (message: string) => void;
}

interface InFlight {
    payload: TelemetryEvent[];
    attempts: number;
}

function normalizeLevel(raw: unknown): TelemetryLevel {
    return (TELEMETRY_LEVELS as readonly string[]).includes(raw as string) ? (raw as TelemetryLevel) : 'off';
}

export function levelAllowsEvent(level: TelemetryLevel, kind: TelemetryEventKind): boolean {
    if (level === 'off') return false;
    if (kind === 'error') return true;
    return level === 'all';
}

// The error path names an event by identifier shape only (EVENT_NAME): text spoken as a name (a
// message, a path) is dropped to 'unknown' rather than sent. Its data goes through admittedErrorData:
// only the TEL-06 admitted keys, each value checked against its shape, and a report with a value that
// fails its shape is dropped whole. A plugin's own error data can never widen the wire set or put
// free text in an admitted key.

export class PowerBrowserTelemetrySender {
    protected readonly endpoint: string | undefined;
    protected readonly getLevel: () => string;
    protected readonly fetchFn: ((url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<TelemetryFetchResponse>) | undefined;
    protected readonly setTimeoutFn: (cb: () => void, ms: number) => unknown;
    protected readonly clearTimeoutFn: (handle: unknown) => void;
    protected readonly setIntervalFn: (cb: () => void, ms: number) => unknown;
    protected readonly clearIntervalFn: (handle: unknown) => void;
    protected readonly nowFn: () => number;
    protected readonly maxBatchSize: number;
    protected readonly flushIntervalMs: number;
    protected readonly maxAttempts: number;
    protected readonly baseDelayMs: number;
    protected readonly maxQueueEvents: number;
    protected readonly onDiagnostic: (message: string) => void;

    protected queue: TelemetryEvent[] = [];
    protected inflight: InFlight | null = null;
    protected retryTimer: unknown = null;
    protected flushTimer: unknown = null;
    protected endpointWarned = false;

    constructor(options: TelemetrySenderOptions) {
        this.endpoint = options.endpoint;
        this.getLevel = options.getLevel;
        const g = globalThis as { fetch?: typeof fetch };
        this.fetchFn = options.fetchFn ?? (typeof g.fetch === 'function'
            ? ((url: string, init: { method: string; headers: Record<string, string>; body: string }) =>
                (g.fetch as typeof fetch)(url, init).then(
                    res => ({ ok: res.ok }),
                    () => ({ ok: false }),
                ))
            : undefined);
        this.setTimeoutFn = options.setTimeoutFn ?? setTimeout;
        this.clearTimeoutFn = options.clearTimeoutFn ?? clearTimeout;
        this.setIntervalFn = options.setIntervalFn ?? setInterval;
        this.clearIntervalFn = options.clearIntervalFn ?? clearInterval;
        this.nowFn = options.nowFn ?? Date.now;
        this.maxBatchSize = options.maxBatchSize ?? 20;
        this.flushIntervalMs = options.flushIntervalMs ?? 30000;
        this.maxAttempts = options.maxAttempts ?? 3;
        this.baseDelayMs = options.baseDelayMs ?? 1000;
        this.maxQueueEvents = options.maxQueueEvents ?? 500;
        this.onDiagnostic = options.onDiagnostic ?? ((message: string) => console.warn(message));
        if (this.flushIntervalMs > 0) {
            try {
                this.flushTimer = this.setIntervalFn(() => { void this.flush().catch(() => undefined); }, this.flushIntervalMs);
            } catch {
                this.flushTimer = null;
            }
        }
    }

    /** Usage path: admitted only at level `all`. Never throws. */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sendEventData(eventName: string, data?: Record<string, any>): void {
        try {
            this.enqueue('usage', eventName, data);
        } catch {
            // Never a throw out of a telemetry path.
        }
    }

    /** Error path: admitted at every level but `off`. Never throws. */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sendErrorData(error: Error | string, data?: Record<string, any>): void {
        try {
            const raw = typeof error === 'string' ? error : typeOf(error);
            const clean = admittedErrorData(data);
            if (clean === null) return;
            this.enqueue('error', EVENT_NAME.test(raw) ? raw : 'unknown', clean);
        } catch {
            // Never a throw out of a telemetry path.
        }
    }

    /** Send whatever is queued now. Never throws; failures schedule a bounded retry. */
    async flush(): Promise<void> {
        try {
            await this.sendNext();
        } catch {
            // Never a throw out of a telemetry path.
        }
    }

    /** Clear timers and drop everything not yet delivered. */
    dispose(): void {
        try {
            if (this.flushTimer !== null) { try { this.clearIntervalFn(this.flushTimer); } catch { /* ignore */ } this.flushTimer = null; }
            if (this.retryTimer !== null) { try { this.clearTimeoutFn(this.retryTimer); } catch { /* ignore */ } this.retryTimer = null; }
            this.queue = [];
            this.inflight = null;
        } catch {
            // Never a throw out of a telemetry path.
        }
    }

    /** Whether the live level admits this kind of event now. Never throws; an unreadable level is off. */
    admits(kind: TelemetryEventKind): boolean {
        try {
            return levelAllowsEvent(normalizeLevel(this.getLevel()), kind);
        } catch {
            return false;
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected enqueue(kind: TelemetryEventKind, name: string, data: Record<string, any> | undefined): void {
        if (!this.admits(kind)) return;
        if (this.endpoint === undefined || this.endpoint === '') {
            if (!this.endpointWarned) {
                this.endpointWarned = true;
                this.diagnostic('[@powerbrowser/telemetry] event dropped: telemetry is enabled but no endpoint is configured.');
            }
            return;
        }
        if (this.queue.length >= this.maxQueueEvents) {
            this.diagnostic('[@powerbrowser/telemetry] event dropped: the queue is full.');
            return;
        }
        this.queue.push({ kind, name, data, at: this.nowFn() });
        if (this.queue.length >= this.maxBatchSize) {
            void this.flush().catch(() => undefined);
        }
    }

    protected async sendInflight(): Promise<void> {
        const current = this.inflight;
        if (current === null) return;
        current.attempts += 1;
        let ok = false;
        try {
            if (this.fetchFn === undefined) {
                ok = false;
            } else {
                const response = await this.fetchFn(this.endpoint as string, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ events: current.payload }),
                });
                ok = !!response && response.ok === true;
            }
        } catch {
            ok = false;
        }
        if (this.inflight !== current) return;
        if (ok) {
            this.inflight = null;
            if (this.queue.length > 0) await this.sendNext();
            return;
        }
        if (current.attempts >= this.maxAttempts) {
            this.diagnostic(`[@powerbrowser/telemetry] dropping ${current.payload.length} event(s) after ${current.attempts} failed deliverie(s).`);
            this.inflight = null;
            if (this.queue.length > 0) await this.sendNext();
            return;
        }
        const delay = this.baseDelayMs * 2 ** (current.attempts - 1);
        try {
            this.retryTimer = this.setTimeoutFn(() => {
                this.retryTimer = null;
                void this.sendInflight().catch(() => undefined);
            }, delay);
        } catch {
            this.retryTimer = null;
            this.diagnostic(`[@powerbrowser/telemetry] dropping ${current.payload.length} event(s): no retry timer available.`);
            this.inflight = null;
        }
    }

    protected async sendNext(): Promise<void> {
        if (this.inflight !== null || this.queue.length === 0) return;
        const batch = this.queue.splice(0, this.maxBatchSize);
        this.inflight = { payload: batch, attempts: 0 };
        await this.sendInflight();
    }

    protected diagnostic(message: string): void {
        try {
            this.onDiagnostic(message);
        } catch {
            // A diagnostic must never become a second failure.
        }
    }
}
