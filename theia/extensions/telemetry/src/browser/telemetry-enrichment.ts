// TEL-06 enrichment. DELIBERATELY ZERO-DEPENDENCY, like the sender and the reporter: this file
// imports nothing, so the telemetry self-test and gate (scripts/verify-telemetry.mjs) import it
// straight from src/ under plain node. Erasable syntax only.
//
// WHAT IT ADDS. version and buildID, read from the powerbrowserTelemetry fragment (baked at
// generate time from releaseIdentity), and os, a four-value bucket of the user agent. Nothing
// else. ADMITTED_KEYS is the whole wire key set for an error report, and withEnrichment copies
// only those keys, so no caller-supplied key can widen it.
//
// WHAT IT NEVER ADDS. The raw user-agent string, a message, a stack, a path, a URL, an account
// or an install identifier. osBucket returns one of four literals and nothing derived from the
// input text.

export const ADMITTED_KEYS: readonly string[] = Object.freeze(['type', 'source', 'line', 'column', 'version', 'buildID', 'os']);

export type OsBucket = 'windows' | 'macos' | 'linux' | 'unknown';

export const OS_BUCKETS: readonly OsBucket[] = Object.freeze(['windows', 'macos', 'linux', 'unknown'] as OsBucket[]);

// THE SHAPE OF EVERY ADMITTED VALUE. A value that fails its shape drops the whole report (see
// admittedErrorData), because a value that is not an identifier, a bare file name, a release version
// or a bucket is free text, and free text is where a message or a path would travel. The events
// Worker restates these (worker/events-worker.mjs ADMITTED_SHAPES) and the gate requires equality.
// type: an identifier. source: a bare file name, no slash, backslash, colon or scheme.
// version: the ESR version (two or three numeric groups). buildID: v<version>-<revision>.
export const ADMITTED_SHAPES: { readonly type: RegExp; readonly source: RegExp; readonly version: RegExp; readonly buildID: RegExp } = Object.freeze({
    type: /^[A-Za-z_$][\w$]{0,63}$/,
    source: /^[\w.-]{1,100}$/,
    version: /^\d{1,4}\.\d{1,4}(?:\.\d{1,4})?$/,
    buildID: /^v\d{1,4}\.\d{1,4}(?:\.\d{1,4})?-\d{1,6}$/,
});
/** line and column: a non-negative integer no larger than this (a 32-bit signed maximum). */
export const POSITION_MAX = 2147483647;
/** The name an error event is sent under. */
export const EVENT_NAME: RegExp = /^[A-Za-z0-9._-]{1,100}$/;

function isPosition(value: unknown): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= POSITION_MAX;
}

/** True when `value` has the shape its admitted `key` requires. */
export function admittedValueOk(key: string, value: unknown): boolean {
    if (key === 'line' || key === 'column') return isPosition(value);
    if (key === 'os') return typeof value === 'string' && (OS_BUCKETS as readonly string[]).includes(value);
    const shape = (ADMITTED_SHAPES as Record<string, RegExp>)[key];
    return shape !== undefined && typeof value === 'string' && shape.test(value);
}

/**
 * Reduce caller data to the admitted keys with shape-valid values. Keys outside ADMITTED_KEYS are
 * dropped (a message or stack never rides along). A present admitted key whose value fails its shape
 * drops the WHOLE report (null), never just the key: the report carried text where a name or a number
 * belongs, so none of it is trusted. undefined means there was nothing admitted to send.
 */
export function admittedErrorData(data: unknown): Record<string, string | number> | null | undefined {
    if (data === undefined || data === null || typeof data !== 'object') return undefined;
    const out: Record<string, string | number> = {};
    for (const key of ADMITTED_KEYS) {
        const value = (data as Record<string, unknown>)[key];
        if (value === undefined) continue;
        if (!admittedValueOk(key, value)) return null;
        out[key] = value as string | number;
    }
    return Object.keys(out).length > 0 ? out : undefined;
}

export type EnrichableData = {
    type: string;
    source?: string;
    line?: number;
    column?: number;
};

export type EnrichmentContext = {
    version?: unknown;
    buildID?: unknown;
};

export type EnrichedData = EnrichableData & {
    version?: string;
    buildID?: string;
    os: OsBucket;
};

// Any value that does not have the release-identity shape is omitted, never coerced.
export function readTelemetryVersion(value: unknown): string | undefined {
    return admittedValueOk('version', value) ? value as string : undefined;
}

export function readTelemetryBuildID(value: unknown): string | undefined {
    return admittedValueOk('buildID', value) ? value as string : undefined;
}

export function osBucket(userAgent: unknown): OsBucket {
    try {
        if (typeof userAgent !== 'string') return 'unknown';
        if (userAgent.includes('Windows')) return 'windows';
        if (userAgent.includes('Macintosh') || userAgent.includes('Mac OS')) return 'macos';
        if (userAgent.includes('Linux')) return 'linux';
        return 'unknown';
    } catch {
        return 'unknown';
    }
}

function userAgent(): unknown {
    try {
        return (globalThis as { navigator?: { userAgent?: unknown } }).navigator?.userAgent;
    } catch {
        return undefined;
    }
}

export function withEnrichment(data: EnrichableData, context: EnrichmentContext): EnrichedData {
    const out: EnrichedData = { type: data.type, os: osBucket(userAgent()) };
    if (data.source !== undefined) out.source = data.source;
    if (isPosition(data.line)) out.line = data.line;
    if (isPosition(data.column)) out.column = data.column;
    const version = readTelemetryVersion(context.version);
    if (version !== undefined) out.version = version;
    const buildID = readTelemetryBuildID(context.buildID);
    if (buildID !== undefined) out.buildID = buildID;
    return out;
}
