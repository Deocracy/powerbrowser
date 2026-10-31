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

// Any value that is not a non-empty string is omitted, never coerced.
function nonEmptyString(value: unknown): string | undefined {
    return typeof value === 'string' && value !== '' ? value : undefined;
}

export function readTelemetryVersion(value: unknown): string | undefined {
    return nonEmptyString(value);
}

export function readTelemetryBuildID(value: unknown): string | undefined {
    return nonEmptyString(value);
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
    if (typeof data.line === 'number' && Number.isFinite(data.line)) out.line = data.line;
    if (typeof data.column === 'number' && Number.isFinite(data.column)) out.column = data.column;
    const version = readTelemetryVersion(context.version);
    if (version !== undefined) out.version = version;
    const buildID = readTelemetryBuildID(context.buildID);
    if (buildID !== undefined) out.buildID = buildID;
    return out;
}
