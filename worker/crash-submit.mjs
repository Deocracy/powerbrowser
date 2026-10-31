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
// THE DELTA FROM THE COLLECTOR, RECORDED (the policy page states the same four points).
//   1. No in-Worker throttle. The collector's rolling-window counter is per process; a per-isolate
//      counter is not a rate limit (Cloudflare runs many isolates), and a counter shared by all callers
//      lets one client make every other client's report be discarded. Phase 48 WR-02 removed the same
//      counter from the events Worker for that reason. The per-IP zone rule over /submit is the rate
//      limit (worker/wrangler-crash.toml runbook), so this file never answers the throttle rule.
//   2. Retention is the R2 lifecycle rule over CRASH_PREFIX (worker/crash-r2-lifecycle.json), not a sweep:
//      no second job and no deletion code runs here.
//   3. A wrong method on /submit answers 405 with Allow: POST, not 404 (Phase 48 IN-02).
//   4. The minidump part must be at least 32 bytes and start with the MDMP signature, or the submit answers
//      400 malformed_no_minidump and nothing is stored (Phase 57 IN-02).
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
/** Parser bounds (WR-01, WR-02): a delimiter shorter than this or longer than the RFC 2046 limit is not multipart. */
export const MIN_BOUNDARY_LENGTH = 3;
export const MAX_BOUNDARY_LENGTH = 70;
/** A part whose header block is longer than this, or whose name is longer than MAX_PART_NAME_LENGTH, is not read. */
export const MAX_HEADER_BYTES = 1024;
export const MAX_PART_NAME_LENGTH = 128;
/**
 * The only part names the stored record ever carries. Any other client string is stored as OTHER_PART_NAME,
 * so the bucket never holds client-chosen text outside the allowlisted annotation values.
 * memory_report is the part Gecko sends beside the minidump (upstream/toolkit/crashreporter/client/app/src/net/report.rs);
 * the receiver reads and drops it.
 */
export const MEMORY_REPORT_PART_NAME = 'memory_report';
export const OTHER_PART_NAME = '(other)';
/** A minidump starts with the 32-byte MINIDUMP_HEADER whose signature is "MDMP". */
export const MIN_MINIDUMP_BYTES = 32;
const MDMP_MAGIC = Uint8Array.of(0x4d, 0x44, 0x4d, 0x50);
/** R2 key prefix for every object this Worker writes. The lifecycle rule expires this prefix. */
export const CRASH_PREFIX = 'crash/';

export const RECORDABLE_PART_NAMES = Object.freeze([
    MINIDUMP_PART_NAME,
    EXTRA_PART_NAME,
    MEMORY_REPORT_PART_NAME,
    ...ANNOTATION_ALLOWLIST,
]);

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

/**
 * Split on the CRLF-anchored delimiter without copying the body. The first delimiter has no CRLF before it, so a
 * body that opens with the delimiter minus its CRLF is split at offset 0. Returns null as soon as more than
 * maxDelimiters delimiters are seen, so a body of many tiny sections allocates at most maxDelimiters + 1 views.
 */
function splitBytes(body, delimiter, maxDelimiters) {
    const out = [];
    const open = delimiter.subarray(2);
    let start = 0;
    if (indexOfBytes(body.subarray(0, open.length), open, 0) === 0) {
        out.push(body.subarray(0, 0));
        start = open.length;
    }
    for (;;) {
        if (out.length > maxDelimiters) return null;
        const at = indexOfBytes(body, delimiter, start);
        if (at === -1) break;
        out.push(body.subarray(start, at));
        start = at + delimiter.length;
    }
    out.push(body.subarray(start));
    return out;
}

/**
 * The name parameter of a part's Content-Disposition header. Parameters are read one at a time, a quoted value
 * is consumed whole (so filename="x; name=y" hides nothing), and name must be its own parameter: filename= is
 * never read as name=. Returns null for a malformed parameter list, a repeated name, or no name at all.
 */
export function dispositionName(headerText) {
    const line = /^content-disposition:[ \t]*form-data[ \t]*;(.*)$/im.exec(headerText);
    if (!line) return null;
    const params = line[1].trim();
    const PARAM = /\s*([A-Za-z0-9*_-]+)\s*=\s*(?:"([^"]*)"|([^\s;"]*))\s*(?:;|$)/y;
    let name = null;
    let at = 0;
    while (at < params.length) {
        PARAM.lastIndex = at;
        const m = PARAM.exec(params);
        if (!m) return null;
        if (m[1].toLowerCase() === 'name') {
            if (name !== null) return null;
            name = m[2] ?? m[3];
        }
        at = PARAM.lastIndex;
    }
    return name;
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
    if (boundary.length < MIN_BOUNDARY_LENGTH || boundary.length > MAX_BOUNDARY_LENGTH) return { ok: false, reason: REASON_WRONG_CONTENT_TYPE };
    if (bytes.byteLength > MAX_BODY_BYTES) return { ok: false, reason: REASON_OVERSIZED };
    // The delimiter count is capped while scanning (MAX_PARTS parts plus the closing delimiter), before any
    // per-section work, so the body size is not the bound on what the split allocates.
    const chunks = splitBytes(bytes, encoder.encode(`\r\n--${boundary}`), MAX_PARTS + 1);
    if (chunks === null) return { ok: false, reason: REASON_OVERSIZED };
    const parts = [];
    for (let i = 1; i < chunks.length; i += 1) {
        let chunk = chunks[i];
        if (chunk[0] === 45 && chunk[1] === 45) continue; // closing delimiter
        if (chunk[0] === 13 && chunk[1] === 10) chunk = chunk.subarray(2);
        else if (chunk[0] === 10) chunk = chunk.subarray(1);
        if (chunk.length >= 2 && chunk[chunk.length - 2] === 13 && chunk[chunk.length - 1] === 10) {
            chunk = chunk.subarray(0, chunk.length - 2);
        }
        const headerEnd = indexOfBytes(chunk.subarray(0, MAX_HEADER_BYTES + 4), CRLF_CRLF, 0);
        if (headerEnd === -1) continue;
        const name = dispositionName(latin1(chunk.subarray(0, headerEnd)));
        if (name === null || name.length > MAX_PART_NAME_LENGTH) continue;
        parts.push({ name, data: chunk.subarray(headerEnd + 4) });
    }
    if (parts.length > MAX_PARTS) return { ok: false, reason: REASON_OVERSIZED };
    for (const part of parts) {
        if (part.data.byteLength > MAX_PART_BYTES) return { ok: false, reason: REASON_OVERSIZED };
    }
    // Exactly one minidump part: a second one is ambiguous about which bytes are the crash.
    if (parts.filter(part => part.name === MINIDUMP_PART_NAME).length !== 1) return { ok: false, reason: REASON_NO_MINIDUMP };
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
    const minidump = parsed.parts.find(part => part.name === MINIDUMP_PART_NAME);
    // IN-02: an empty or non-minidump part is not stored. The collector (loopback, scripts/crash-collector.mjs)
    // keeps accepting any bytes because scripts/verify-ng-068-crash-extra-part.mjs posts a random-bytes dump to it.
    if (minidump.data.byteLength < MIN_MINIDUMP_BYTES || !MDMP_MAGIC.every((byte, i) => minidump.data[i] === byte)) {
        return discard(400, REASON_NO_MINIDUMP);
    }
    const crashId = crypto.randomUUID();
    const record = `${JSON.stringify({
        id: crashId,
        receivedAt: new Date(nowMs).toISOString(),
        annotations: takeAnnotations(parsed.parts),
        minidumpBytes: minidump.data.byteLength,
        partNames: parsed.parts.map(part => (RECORDABLE_PART_NAMES.includes(part.name) ? part.name : OTHER_PART_NAME)),
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

/**
 * Read the request body as bytes, refusing more than cap. A declared Content-Length is used only to refuse a
 * declared size over the cap before the body is touched; it is never trusted for an allocation, because a
 * caller can claim the cap and send a few bytes. The buffer starts at READ_INITIAL_BYTES and grows
 * geometrically as bytes actually arrive, never beyond the cap, and the read stops the moment the received
 * bytes exceed the cap.
 */
/** First read buffer size, whatever Content-Length claims. */
export const READ_INITIAL_BYTES = 64 * 1024;

export async function readCappedBytes(request, cap) {
    const declared = Number(request.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > cap) return undefined;
    if (request.body === null) return new Uint8Array(0);
    const reader = request.body.getReader();
    let buffer = new Uint8Array(READ_INITIAL_BYTES);
    let total = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (total + value.byteLength > cap) {
            await reader.cancel();
            return undefined;
        }
        if (total + value.byteLength > buffer.byteLength) {
            const grown = new Uint8Array(Math.min(cap, Math.max(buffer.byteLength * 2, total + value.byteLength)));
            grown.set(buffer.subarray(0, total));
            buffer = grown;
        }
        buffer.set(value, total);
        total += value.byteLength;
    }
    return buffer.subarray(0, total);
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
