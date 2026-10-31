// worker/crash-submit.mjs
//
// The crash-report receiver (Phase 57, TEL-07). POST /submit accepts one Antenna-protocol multipart
// report from the native crash reporter and writes the minidump and its record to R2 under
// CRASH_PREFIX. The contract is the collector's (scripts/crash-collector.mjs, the reviewable source
// docs/CRASH-POLICY.md): the same part names, response bodies, rejection vocabulary, caps and annotation
// allowlist. scripts/verify-worker-submit.mjs imports the collector's exports and requires equality for
// every shared name, and runs the same multipart bodies through both parsers, so the two receivers
// cannot drift.
//
// THE DELTA FROM THE COLLECTOR, RECORDED (the policy page states the same three points).
//   1. No in-Worker throttle. The collector's rolling-window counter is per process; a per-isolate
//      counter is not a rate limit (Cloudflare runs many isolates), and a counter shared by all callers
//      lets one client make every other client's report be discarded. Phase 48 WR-02 removed the same
//      counter from the events Worker for that reason. The per-IP zone rule over /submit is the rate
//      limit (worker/wrangler-crash.toml runbook), so this file never answers the throttle rule.
//   2. Retention is the R2 lifecycle rule over CRASH_PREFIX (worker/crash-r2-lifecycle.json), not a sweep:
//      no second job and no deletion code runs here.
//   3. A wrong method on /submit answers 405 with Allow: POST, not 404 (Phase 48 IN-02).
//
// NO CORS. The sender is the native crash reporter, not a browser page, so no preflight and no
// Access-Control header applies, and none is sent.
//
// CREDENTIALLESS. No secret, token or key is read or stored. The one binding is the R2 bucket
// (env.CRASH_STORE), which the owner's deploy supplies. Object names are server-assigned random UUIDs,
// and the record carries the server receipt time only; no client-supplied identifier is stored.
//
// WRITE ORDER (the R2 analogue of Phase 48's one D1 batch). The minidump object is written first and the
// record last, so a record exists only when its minidump does. If the record write fails, the minidump
// is removed best-effort and the submit answers 500 store_unavailable with nothing stored.
//
// ZERO-DEPENDENCY. Request, Response, Uint8Array, TextDecoder and crypto.randomUUID only, no import, so
// the gate imports this file under plain node with synthetic Requests and an in-memory R2 stub.

export const SUBMIT_PATH = '/submit';
export const MINIDUMP_PART_NAME = 'upload_file_minidump';
export const EXTRA_PART_NAME = 'extra';
export const REASON_WRONG_CONTENT_TYPE = 'malformed_wrong_content_type';
export const REASON_NO_MINIDUMP = 'malformed_no_minidump';
export const REASON_OVERSIZED = 'oversized_body';
export const REASON_STORE_UNAVAILABLE = 'store_unavailable';
export const MAX_PARTS = 16;
export const MAX_PART_MIB = 8;
export const MAX_BODY_MIB = 20;
export const MAX_PART_BYTES = MAX_PART_MIB * 1024 * 1024;
export const MAX_BODY_BYTES = MAX_BODY_MIB * 1024 * 1024;
export const RETENTION_DAYS = 30;
export const ANNOTATION_ALLOWLIST = Object.freeze([
    'ProductName',
    'Version',
    'BuildID',
    'Platform',
    'ReleaseChannel',
    'CrashTime',
    'StartupTime',
]);
export const MAX_ANNOTATION_BYTES = 4096;
/** R2 key prefix for every object this Worker writes. The lifecycle rule expires this prefix. */
export const CRASH_PREFIX = 'crash/';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8');
const CRLF_CRLF = Uint8Array.of(13, 10, 13, 10);

function discard(status, reason) {
    return { status, body: `Discarded=${reason}` };
}

function empty(status) {
    return { status, body: '' };
}

/** First index of needle in hay at or after from, or -1. Binary-safe. */
function indexOfBytes(hay, needle, from) {
    const n = needle.length;
    outer: for (let i = from; i <= hay.length - n; i += 1) {
        for (let j = 0; j < n; j += 1) {
            if (hay[i + j] !== needle[j]) continue outer;
        }
        return i;
    }
    return -1;
}

function splitBytes(body, delimiter) {
    const out = [];
    let start = 0;
    for (;;) {
        const at = indexOfBytes(body, delimiter, start);
        if (at === -1) break;
        out.push(body.subarray(start, at));
        start = at + delimiter.length;
    }
    out.push(body.subarray(start));
    return out;
}

/** Latin-1 text of header bytes (the header block is ASCII in practice; this keeps every byte). */
function latin1(bytes) {
    let text = '';
    for (let i = 0; i < bytes.length; i += 8192) {
        text += String.fromCharCode(...bytes.subarray(i, i + 8192));
    }
    return text;
}

/**
 * Strict multipart parser, the collector's parseMultipart restated over bytes. Same content-type
 * regex, same framing (CRLF-anchored delimiter, closing delimiter skipped), same count, size and
 * minidump checks in the same order. Returns { ok: true, parts } with each part's name and data
 * bytes, or { ok: false, reason } with a reason in the wire vocabulary above. This function cannot write.
 */
export function parseMultipart(bytes, contentType) {
    const match = /^multipart\/form-data;\s*boundary=(?:"([^"]+)"|([^\s;]+))/i.exec(contentType ?? '');
    if (!match) return { ok: false, reason: REASON_WRONG_CONTENT_TYPE };
    const boundary = match[1] ?? match[2];
    if (bytes.byteLength > MAX_BODY_BYTES) return { ok: false, reason: REASON_OVERSIZED };
    // Prepend the CRLF the first delimiter lacks, so one CRLF-anchored split covers every part.
    const framed = new Uint8Array(bytes.byteLength + 2);
    framed.set([13, 10], 0);
    framed.set(bytes, 2);
    const chunks = splitBytes(framed, encoder.encode(`\r\n--${boundary}`));
    if (chunks.length - 1 > MAX_PARTS + 1) return { ok: false, reason: REASON_OVERSIZED };
    const parts = [];
    for (let i = 1; i < chunks.length; i += 1) {
        let chunk = chunks[i];
        if (chunk[0] === 45 && chunk[1] === 45) continue; // closing delimiter
        if (chunk[0] === 13 && chunk[1] === 10) chunk = chunk.subarray(2);
        else if (chunk[0] === 10) chunk = chunk.subarray(1);
        if (chunk.length >= 2 && chunk[chunk.length - 2] === 13 && chunk[chunk.length - 1] === 10) {
            chunk = chunk.subarray(0, chunk.length - 2);
        }
        const headerEnd = indexOfBytes(chunk, CRLF_CRLF, 0);
        if (headerEnd === -1) continue;
        const headerText = latin1(chunk.subarray(0, headerEnd));
        const data = chunk.subarray(headerEnd + 4);
        const disposition = /content-disposition:\s*form-data;\s*(.*)/i.exec(headerText);
        if (!disposition) continue;
        const nameMatch = /name="([^"]*)"/i.exec(disposition[1]);
        if (!nameMatch) continue;
        parts.push({ name: nameMatch[1], data });
    }
    if (parts.length > MAX_PARTS) return { ok: false, reason: REASON_OVERSIZED };
    for (const part of parts) {
        if (part.data.byteLength > MAX_PART_BYTES) return { ok: false, reason: REASON_OVERSIZED };
    }
    if (!parts.some(part => part.name === MINIDUMP_PART_NAME)) return { ok: false, reason: REASON_NO_MINIDUMP };
    return { ok: true, parts };
}

/**
 * The annotation record from the parts: the same allowlist, scalar-only and per-value byte cap as the
 * collector's take(). Gecko's single extra part carries every annotation as one JSON object; a malformed
 * extra costs its annotations and keeps the report.
 */
export function takeAnnotations(parts) {
    const annotations = {};
    const take = (key, value) => {
        if (!ANNOTATION_ALLOWLIST.includes(key)) return;
        if (value === null || typeof value === 'object') return;
        const text = typeof value === 'string' ? value : JSON.stringify(value);
        if (encoder.encode(text).byteLength > MAX_ANNOTATION_BYTES) return;
        annotations[key] = text;
    };
    for (const part of parts) {
        if (part.name === MINIDUMP_PART_NAME) continue;
        if (part.name === EXTRA_PART_NAME) {
            let extra = null;
            try { extra = JSON.parse(decoder.decode(part.data)); } catch { extra = null; }
            if (extra && typeof extra === 'object' && !Array.isArray(extra)) {
                for (const [key, value] of Object.entries(extra)) take(key, value);
            }
            continue;
        }
        if (part.data.byteLength > MAX_ANNOTATION_BYTES) continue;
        take(part.name, decoder.decode(part.data));
    }
    return annotations;
}

/**
 * POST /submit, the whole verdict: route, method, parse, store. A rejection is decided before the first
 * write. The minidump object lands before the record, and a failed record write removes the minidump.
 */
export async function handleCrashSubmit(shape, env, nowMs) {
    if (shape.path !== SUBMIT_PATH) return empty(404);
    if (shape.method !== 'POST') return { status: 405, body: '', allow: 'POST' };
    const parsed = parseMultipart(shape.bytes, shape.contentType);
    if (!parsed.ok) return discard(parsed.reason === REASON_OVERSIZED ? 413 : 400, parsed.reason);
    const crashId = crypto.randomUUID();
    const minidump = parsed.parts.find(part => part.name === MINIDUMP_PART_NAME);
    const record = `${JSON.stringify({
        id: crashId,
        receivedAt: new Date(nowMs).toISOString(),
        annotations: takeAnnotations(parsed.parts),
        minidumpBytes: minidump.data.byteLength,
        partNames: parsed.parts.map(part => part.name),
    }, null, 2)}\n`;
    const dumpKey = `${CRASH_PREFIX}${crashId}.dmp`;
    const recordKey = `${CRASH_PREFIX}${crashId}.json`;
    try {
        await env.CRASH_STORE.put(dumpKey, minidump.data.slice());
    } catch {
        return discard(500, REASON_STORE_UNAVAILABLE);
    }
    try {
        await env.CRASH_STORE.put(recordKey, record);
    } catch {
        try {
            await env.CRASH_STORE.delete(dumpKey);
        } catch {
            // Best-effort: the orphaned minidump expires with the lifecycle rule.
        }
        return discard(500, REASON_STORE_UNAVAILABLE);
    }
    return { status: 200, body: `CrashID=${crashId}` };
}

/** Read the request body as bytes, refusing more than cap. A declared Content-Length over the cap is refused before the body is touched. */
export async function readCappedBytes(request, cap) {
    const declared = Number(request.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > cap) return undefined;
    if (request.body === null) return new Uint8Array(0);
    const reader = request.body.getReader();
    const chunks = [];
    let total = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > cap) {
            await reader.cancel();
            return undefined;
        }
        chunks.push(value);
    }
    const out = new Uint8Array(total);
    let at = 0;
    for (const chunk of chunks) {
        out.set(chunk, at);
        at += chunk.byteLength;
    }
    return out;
}

function toResponse(verdict) {
    const headers = { 'content-type': 'text/plain; charset=utf-8' };
    if (verdict.allow) headers.allow = verdict.allow;
    return new Response(verdict.body, { status: verdict.status, headers });
}

export default {
    async fetch(request, env) {
        const path = new URL(request.url).pathname;
        if (path !== SUBMIT_PATH) return toResponse(empty(404));
        if (request.method !== 'POST') return toResponse(await handleCrashSubmit({ path, method: request.method }, env, Date.now()));
        // Body cap is applied before any parse: an oversized upload is cut off at the cap, never buffered whole.
        const bytes = await readCappedBytes(request, MAX_BODY_BYTES);
        if (bytes === undefined) return toResponse(discard(413, REASON_OVERSIZED));
        const verdict = await handleCrashSubmit({
            path,
            method: 'POST',
            contentType: request.headers.get('content-type') ?? '',
            bytes,
        }, env, Date.now());
        return toResponse(verdict);
    },
};
