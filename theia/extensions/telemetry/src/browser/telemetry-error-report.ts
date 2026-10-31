// NG-067 error reports. DELIBERATELY ZERO-DEPENDENCY, like the sender: this file imports
// nothing, so the telemetry self-test (scripts/verify-telemetry.mjs --self-test) imports it
// straight from src/ under plain node. Erasable syntax only.
//
// WHAT IS SENT. The event name, the thrown value's type (its constructor name, e.g.
// TypeError, or typeof for a value that is not an Error), the script's base name, and the
// line and column, then the version, buildID and OS bucket that telemetry-enrichment.ts
// derives. Never the message and never a stack: Theia's file service puts full
// home-directory paths into error messages, page errors carry URLs, and stacks carry both.
//
// WHAT IS SKIPPED. A repeat of an (event, type, source, line) key already admitted this
// session, so an error thrown on every render is sent once. A key is recorded only when the
// level admits error events: at off nothing is queued, so there is nothing to flood, and an
// error first seen at off is still sent once the level is raised.
//
// Every read of the event is guarded: a throwing getter, a null-prototype value or a
// non-string name gives 'unknown' or an omitted field, never a throw out of the listener.

import type { EnrichmentContext } from './telemetry-enrichment.ts';
import { ADMITTED_SHAPES, withEnrichment } from './telemetry-enrichment.ts';

export const UNCAUGHT_ERROR_EVENT = 'frontend.uncaught-error';
export const UNHANDLED_REJECTION_EVENT = 'frontend.unhandled-rejection';

export interface ErrorReportLogger {
    logError(eventName: string, data?: Record<string, unknown>): void;
    readonly sender: { admits(kind: 'error'): boolean };
}

// A type alias, not an interface, so it is assignable to the logger's Record parameter.
// version, buildID and os are filled by withEnrichment, never by the event handlers.
export type ErrorReport = {
    type: string;
    source?: string;
    line?: number;
    column?: number;
    version?: string;
    buildID?: string;
    os?: string;
};

// A runtime-assigned constructor name could carry any text; an identifier cannot carry a path.
const IDENTIFIER = ADMITTED_SHAPES.type;
// Only a script loaded from a URL has a file name; a data: or eval source's last segment is code.
const SCRIPT_URL = /^(https?|file):\/\//i;
const FILE_NAME = ADMITTED_SHAPES.source;

function read(target: unknown, key: string): unknown {
    try {
        return (target as Record<string, unknown>)[key];
    } catch {
        return undefined;
    }
}

export function typeOf(value: unknown): string {
    try {
        if (value === null) return 'null';
        if (!(value instanceof Error)) return typeof value;
        const name = read(read(value, 'constructor'), 'name');
        return typeof name === 'string' && IDENTIFIER.test(name) ? name : 'unknown';
    } catch {
        return 'unknown';
    }
}

export function baseName(url: unknown): string | undefined {
    if (typeof url !== 'string' || !SCRIPT_URL.test(url)) return undefined;
    const name = url.split(/[?#]/)[0].split(/[\\/]/).pop() ?? '';
    return FILE_NAME.test(name) ? name : undefined;
}

function position(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export class ErrorReporter {
    protected readonly logger: ErrorReportLogger;
    protected readonly context: EnrichmentContext;
    // ponytail: unbounded per session; distinct error sites are few. Cap it if a source mints keys.
    protected readonly admitted = new Set<string>();

    constructor(logger: ErrorReportLogger, context: EnrichmentContext = {}) {
        this.logger = logger;
        this.context = context;
    }

    readonly onError = (event: unknown): void => {
        this.report(UNCAUGHT_ERROR_EVENT, {
            type: typeOf(read(event, 'error')),
            source: baseName(read(event, 'filename')),
            line: position(read(event, 'lineno')),
            column: position(read(event, 'colno')),
        });
    };

    readonly onRejection = (event: unknown): void => {
        this.report(UNHANDLED_REJECTION_EVENT, { type: typeOf(read(event, 'reason')) });
    };

    protected report(eventName: string, data: ErrorReport): void {
        try {
            const enriched = withEnrichment(data, this.context);
            const key = [eventName, enriched.type, enriched.source, enriched.line].join('|');
            if (this.admitted.has(key)) return;
            if (this.logger.sender.admits('error')) this.admitted.add(key);
            this.logger.logError(eventName, enriched);
        } catch {
            // Never a throw out of an error listener.
        }
    }
}
