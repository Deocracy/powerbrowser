#!/usr/bin/env node
// scripts/crash-collector.mjs
//
// The minimal Antenna-protocol crash collector (09-02, TEL-04): downstream
// ops tooling that gives a downstream its own crash endpoint while the
// native reporter stays compiled out (.mozconfig --disable-crashreporter).
// Crash pings (error events) ride the existing telemetry sender to the
// telemetry endpoint; crash REPORTS (minidumps) come here.
//
// WHAT IT SPEAKS. The Antenna submission contract (see docs/CRASH-POLICY.md,
// the reviewable source this code enforces):
//   POST /submit, Content-Type: multipart/form-data; boundary=...
//   The minidump part MUST be named `upload_file_minidump` (name, not
//   filename). Accepted: HTTP 200 + body `CrashID=<uuid>`. Soft-reject
//   (throttled): HTTP 200 + body `Discarded=<rule>` (the client may retry).
//   Malformed: HTTP 400 + body `Discarded=<reason>`. Over-cap: HTTP 413 +
//   body `Discarded=oversized_body`.
//
// DELIBERATELY ZERO-DEPENDENCY: node stdlib only (node:http,
// node:crypto, node:fs, node:path, node:url), so the contract gate
// (scripts/verify-crash-collector.mjs) and the telemetry suite import the
// pure surface straight from this file under plain node with no install.
// The pure functions (parseMultipart, buildCrashIdResponse,
// buildDiscardResponse, handleSubmit) run with no sockets; the HTTP layer
// below is a thin wrapper around handleSubmit.
//
// LOOPBACK ONLY BY CONSTRUCTION: the server binds 127.0.0.1 and there is
// no flag to change the host -- only --port and --store exist. Any network
// exposure needs token auth and is out of scope for this plan.
//
// Honestly --quick (gate only): node:crypto plus text/bytes in mkdtemp.
// No build, no browser, no display, no network.
//
// Usage:
//   node scripts/crash-collector.mjs [--port <n>] [--store <dir>]
//   node -e "import('./scripts/crash-collector.mjs').then(m => ...)"

import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'crash-collector';

// --- contract constants (the code side of docs/CRASH-POLICY.md) ------------
//
// The gate derives nothing here from the manifest -- the collector is
// downstream-ops tooling, not manifest output -- so these literals ARE the
// contract. The policy doc states them in prose; the gate pins them by
// importing these same exports, never a kept copy.

/** The only path that accepts submits. Everything else is 404. */
export const SUBMIT_PATH = '/submit';
/** Antenna contract value: the minidump part NAME (not filename). */
export const MINIDUMP_PART_NAME = 'upload_file_minidump';
/** Gecko's crash reporter sends every annotation in ONE JSON part with this name (report.rs). */
export const EXTRA_PART_NAME = 'extra';
/** Rejection vocabulary on the wire. Statuses: malformed_* -> 400, oversized_body -> 413, throttle rules -> 200. */
export const REASON_WRONG_CONTENT_TYPE = 'malformed_wrong_content_type';
export const REASON_NO_MINIDUMP = 'malformed_no_minidump';
export const REASON_OVERSIZED = 'oversized_body';
export const REASON_STORE_UNAVAILABLE = 'store_unavailable';
/** At most this many accepted submits per rolling window; excess is soft-rejected, never dropped silently. */
export const THROTTLE_RULE = 'throttled_per_minute_cap';
export const THROTTLE_WINDOW_MS = 60_000;
export const THROTTLE_MAX_SUBMITS = 60;
/** Ingestion caps: part count, bytes per part, bytes per whole body. */
export const MAX_PARTS = 16;
/** MiB-denominated cap literals the policy gate pins, so code and doc cannot drift numerically. */
export const MAX_PART_MIB = 8;
export const MAX_BODY_MIB = 20;
export const MAX_PART_BYTES = MAX_PART_MIB * 1024 * 1024;
export const MAX_BODY_BYTES = MAX_BODY_MIB * 1024 * 1024;
/** Bounded retention: records older than this are deleted on each accept. */
export const RETENTION_DAYS = 30;
/** Annotation allowlist: the ONLY submitter-supplied fields ever stored. */
export const ANNOTATION_ALLOWLIST = Object.freeze([
    'ProductName',
    'Version',
    'BuildID',
    'ReleaseChannel',
    'CrashTime',
    'StartupTime',
    'OS',
    'CPUArchitecture',
]);
/** Annotation values larger than this are not stored (paths and blobs ride the minidump, never the index). */
export const MAX_ANNOTATION_BYTES = 4096;
/** Parser bounds (WR-01, WR-02): a delimiter shorter than this or longer than the RFC 2046 limit is not multipart. */
export const MIN_BOUNDARY_LENGTH = 3;
export const MAX_BOUNDARY_LENGTH = 70;
/** A part whose header block is longer than this, or whose name is longer than MAX_PART_NAME_LENGTH, is not read. */
export const MAX_HEADER_BYTES = 1024;
export const MAX_PART_NAME_LENGTH = 128;
/** The only part names a stored record carries; any other client string is stored as OTHER_PART_NAME. */
export const MEMORY_REPORT_PART_NAME = 'memory_report';
export const OTHER_PART_NAME = '(other)';
export const RECORDABLE_PART_NAMES = Object.freeze([
    MINIDUMP_PART_NAME,
    EXTRA_PART_NAME,
    MEMORY_REPORT_PART_NAME,
    ...ANNOTATION_ALLOWLIST,
]);
/** Loopback only: the host is a constant, never a flag. */
export const LOOPBACK_HOST = '127.0.0.1';
export const DEFAULT_PORT = 8123;
export const DEFAULT_STORE_DIR = join(REPO_ROOT, '.mozbuild', 'crash-store');

// --- pure contract surface --------------------------------------------------

/** Accepted-submit body. The uuid is generated by handleSubmit, never by the caller. */
export function buildCrashIdResponse(crashId) {
    return `CrashID=${crashId}`;
}

/** Rejection body, soft (throttle, status 200) or hard (malformed/oversized). The rule names the cause. */
export function buildDiscardResponse(rule) {
    return `Discarded=${rule}`;
}

/**
 * Split a buffer on a delimiter buffer. Returns null as soon as more than maxDelimiters delimiters are
 * seen, so a body of many tiny sections allocates at most maxDelimiters + 1 slices.
 */
function splitBuffer(body, delimiter, maxDelimiters) {
    const out = [];
    let start = 0;
    for (;;) {
        const at = body.indexOf(delimiter, start);
        if (at === -1) break;
        out.push(body.slice(start, at));
        start = at + delimiter.length;
        if (out.length > maxDelimiters) return null;
    }
    out.push(body.slice(start));
    return out;
}

/**
 * The name parameter of a part's Content-Disposition header. Parameters are read one at a time, a quoted value
 * is consumed whole (so filename="x; name=y" hides nothing), and name must be its own parameter: filename= is
 * never read as name=. Returns null for a malformed parameter list, a repeated name, or no name at all.
 * worker/crash-submit.mjs carries the same function; scripts/verify-worker-submit.mjs requires them to agree.
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

/**
 * Strict multipart parser. Returns { ok: true, parts } or { ok: false,
 * reason } with reason in the wire vocabulary above. Caps are enforced
 * here so the HTTP layer and the gate share one verdict: over-cap input
 * answers the oversized rejection, non-multipart content and a missing
 * minidump part answer their named malformed reasons, and nothing is
 * written to any store on any rejection path (this function cannot write).
 */
export function parseMultipart(body, contentType) {
    const match = /^multipart\/form-data;\s*boundary=(?:"([^"]+)"|([^\s;]+))/i.exec(contentType ?? '');
    if (!match) return { ok: false, reason: REASON_WRONG_CONTENT_TYPE };
    const boundary = match[1] ?? match[2];
    if (boundary.length < MIN_BOUNDARY_LENGTH || boundary.length > MAX_BOUNDARY_LENGTH) return { ok: false, reason: REASON_WRONG_CONTENT_TYPE };
    if (body.length > MAX_BODY_BYTES) return { ok: false, reason: REASON_OVERSIZED };
    // Split on the CRLF-anchored delimiter the multipart grammar requires,
    // so minidump bytes that merely contain the boundary sequence cannot
    // mis-parse a valid report. Prepending the first delimiter's missing
    // CRLF lets it match the same split with no special case (chunks[0] is
    // the empty preamble, as before).
    // The delimiter count is capped WHILE scanning (MAX_PARTS parts plus the closing delimiter):
    // headerless sections that parse to no part must still count, or a body of many of them evades
    // MAX_PARTS, and the split itself must not allocate one slice per tiny section.
    const chunks = splitBuffer(Buffer.concat([Buffer.from('\r\n'), body]), Buffer.from(`\r\n--${boundary}`), MAX_PARTS + 1);
    if (chunks === null) return { ok: false, reason: REASON_OVERSIZED };
    const parts = [];
    for (let i = 1; i < chunks.length; i++) {
        let chunk = chunks[i];
        if (chunk.slice(0, 2).toString('latin1') === '--') continue; // closing delimiter
        if (chunk[0] === 0x0d && chunk[1] === 0x0a) chunk = chunk.slice(2);
        else if (chunk[0] === 0x0a) chunk = chunk.slice(1);
        // Nothing is stripped from the end: the CRLF before a delimiter belongs to the delimiter (RFC 2046), which the
        // split already consumed, so a part's bytes are exactly the bytes sent, even when they end in CRLF.
        const headerEnd = chunk.slice(0, MAX_HEADER_BYTES + 4).indexOf('\r\n\r\n');
        if (headerEnd === -1) continue;
        const headerText = chunk.slice(0, headerEnd).toString('latin1');
        const data = chunk.slice(headerEnd + 4);
        const name = dispositionName(headerText);
        if (name === null || name.length > MAX_PART_NAME_LENGTH) continue;
        const filenameMatch = /filename="([^"]*)"/i.exec(headerText);
        const typeMatch = /^content-type:\s*([^\r\n;]+)/im.exec(headerText);
        parts.push({
            name,
            filename: filenameMatch ? filenameMatch[1] : undefined,
            contentType: typeMatch ? typeMatch[1].trim() : undefined,
            data,
        });
    }
    if (parts.length > MAX_PARTS) return { ok: false, reason: REASON_OVERSIZED };
    for (const part of parts) {
        if (part.data.length > MAX_PART_BYTES) return { ok: false, reason: REASON_OVERSIZED };
    }
    // Exactly one minidump part: a second one is ambiguous about which bytes are the crash.
    if (parts.filter(part => part.name === MINIDUMP_PART_NAME).length !== 1) {
        return { ok: false, reason: REASON_NO_MINIDUMP };
    }
    return { ok: true, parts };
}

/** Rolling-window throttle state. The HTTP layer owns one; the gate builds its own. */
export function createThrottleState() {
    return { acceptedAt: [] };
}

/**
 * Non-mutating throttle probe: returns the throttle rule name when the
 * submit must be soft-rejected, else null. handleSubmit probes BEFORE the
 * store write and records the accept only after it succeeds, so a submit
 * that fails with 500 store_unavailable never consumes budget -- only
 * accepted submits count toward the cap (docs/CRASH-POLICY.md).
 */
export function wouldThrottle(state, nowMs) {
    // Fail closed: a non-finite clock would make the window filter drop
    // every entry and silently disable throttling, so refuse instead.
    if (!Number.isFinite(nowMs)) return THROTTLE_RULE;
    state.acceptedAt = state.acceptedAt.filter(t => t > nowMs - THROTTLE_WINDOW_MS);
    if (state.acceptedAt.length >= THROTTLE_MAX_SUBMITS) return THROTTLE_RULE;
    return null;
}

/** Record one accepted submit. Call only after the submit is durably stored. */
export function recordAccept(state, nowMs) {
    state.acceptedAt.push(nowMs);
}

/**
 * Probe-and-record in one step: returns the throttle rule name when the
 * submit must be soft-rejected, else records the acceptance and returns
 * null. nowMs is injected so the gate trips the rule deterministically
 * with no sleeps. For direct callers that store nothing (the gate's
 * throttle plant); handleSubmit uses the split form so failed writes
 * consume no budget.
 */
export function checkThrottle(state, nowMs) {
    const rule = wouldThrottle(state, nowMs);
    if (rule) return rule;
    recordAccept(state, nowMs);
    return null;
}

/** Delete store records older than the retention window. Never throws: a failed sweep is a diagnostic, not a rejected submit. */
function sweepRetention(storeDir, nowMs, onDiagnostic) {
    let names;
    try {
        names = readdirSync(storeDir);
    } catch {
        return;
    }
    const cutoff = nowMs - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    for (const name of names) {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(dmp|json)$/.test(name)) continue;
        try {
            if (statSync(join(storeDir, name)).mtimeMs < cutoff) unlinkSync(join(storeDir, name));
        } catch (err) {
            onDiagnostic(`${NAME}: retention sweep could not remove ${name}: ${err && err.message ? err.message : String(err)}`);
        }
    }
}

/**
 * The whole submit verdict in one importable function: parse, throttle,
 * store, respond. Returns { status, body, crashId } where crashId is set
 * only on accept. Rejections never touch the store dir. options.storeDir
 * scopes every write (filenames are generated uuids, never submitter
 * input); options.onDiagnostic defaults to a no-op so gates stay quiet.
 */
export function handleSubmit({ body, contentType, storeDir, throttle, nowMs, onDiagnostic }) {
    const diagnose = onDiagnostic ?? (() => undefined);
    // The clock is injected, so default and validate it here: an undefined
    // or non-finite clock would silently disable throttling (every window
    // comparison is false against NaN) and throw out of the accept path.
    // Refuse loud rather than accept unthrottled.
    const at = nowMs ?? Date.now();
    if (!Number.isFinite(at)) {
        diagnose(`${NAME}: submit refused -- the injected clock is not finite (${String(nowMs)}), so throttling cannot be enforced. Next step: pass Date.now() or a fixed test clock.`);
        return { status: 500, body: buildDiscardResponse(REASON_STORE_UNAVAILABLE), crashId: null };
    }
    const parsed = parseMultipart(body, contentType);
    if (!parsed.ok) {
        const status = parsed.reason === REASON_OVERSIZED ? 413 : 400;
        return { status, body: buildDiscardResponse(parsed.reason), crashId: null };
    }
    const rule = wouldThrottle(throttle, at);
    if (rule) {
        return { status: 200, body: buildDiscardResponse(rule), crashId: null };
    }
    const crashId = randomUUID();
    const minidump = parsed.parts.find(part => part.name === MINIDUMP_PART_NAME);
    const annotations = {};
    const take = (key, value) => {
        if (!ANNOTATION_ALLOWLIST.includes(key)) return;
        // Allowlisted fields are scalars. A nested value is dropped before any
        // stringify: JSON.stringify overflows the stack on a deep nest that
        // JSON.parse accepted, which would lose the whole report.
        if (value === null || typeof value === 'object') return;
        const text = typeof value === 'string' ? value : JSON.stringify(value);
        if (Buffer.byteLength(text, 'utf8') > MAX_ANNOTATION_BYTES) return;
        annotations[key] = text;
    };
    for (const part of parsed.parts) {
        if (part.name === MINIDUMP_PART_NAME) continue;
        if (part.name === EXTRA_PART_NAME) {
            // Gecko's shape (NG-068): one JSON object carries every annotation. The same
            // allowlist and size cap apply per key. A malformed extra part costs its
            // annotations, never the report.
            let extra = null;
            try { extra = JSON.parse(part.data.toString('utf8')); } catch { extra = null; }
            if (extra && typeof extra === 'object' && !Array.isArray(extra)) {
                for (const [key, value] of Object.entries(extra)) take(key, value);
            } else {
                diagnose(`${NAME}: the extra part is not a JSON object -- its annotations were dropped, the report was kept`);
            }
            continue;
        }
        if (part.data.length > MAX_ANNOTATION_BYTES) continue;
        take(part.name, part.data.toString('utf8'));
    }
    const record = {
        id: crashId,
        receivedAt: new Date(at).toISOString(),
        annotations,
        minidumpBytes: minidump.data.length,
        partNames: parsed.parts.map(part => (RECORDABLE_PART_NAMES.includes(part.name) ? part.name : OTHER_PART_NAME)),
    };
    try {
        mkdirSync(storeDir, { recursive: true });
        writeFileSync(join(storeDir, `${crashId}.dmp`), minidump.data);
        writeFileSync(join(storeDir, `${crashId}.json`), `${JSON.stringify(record, null, 2)}\n`);
    } catch (err) {
        diagnose(`${NAME}: store write failed in ${storeDir}: ${err && err.message ? err.message : String(err)}`);
        return { status: 500, body: buildDiscardResponse(REASON_STORE_UNAVAILABLE), crashId: null };
    }
    sweepRetention(storeDir, at, diagnose);
    recordAccept(throttle, at);
    return { status: 200, body: buildCrashIdResponse(crashId), crashId };
}

// --- thin HTTP layer (loopback only) ----------------------------------------

/** Start the collector. Resolves with { server, url } once bound. Binds LOOPBACK_HOST always. */
export function startCollector({ port = DEFAULT_PORT, storeDir = DEFAULT_STORE_DIR, onDiagnostic } = {}) {
    const throttle = createThrottleState();
    const diagnose = onDiagnostic ?? ((message) => console.warn(message));
    const server = createServer((req, res) => {
        if (req.url !== SUBMIT_PATH || req.method !== 'POST') {
            res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
            res.end('PowerBrowser crash collector: only POST /submit accepts crash reports. Start here: run the collector and submit a report.\n');
            return;
        }
        const chunks = [];
        let received = 0;
        let rejected = false;
        req.on('data', (chunk) => {
            if (rejected) return;
            received += chunk.length;
            if (received > MAX_BODY_BYTES) {
                rejected = true;
                res.writeHead(413, { 'content-type': 'text/plain; charset=utf-8' });
                res.end(buildDiscardResponse(REASON_OVERSIZED));
                req.resume();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => {
            if (rejected) return;
            let verdict;
            try {
                verdict = handleSubmit({
                    body: Buffer.concat(chunks),
                    contentType: req.headers['content-type'],
                    storeDir,
                    throttle,
                    nowMs: Date.now(),
                    onDiagnostic: diagnose,
                });
            } catch (err) {
                diagnose(`${NAME}: submit handling failed: ${err && err.message ? err.message : String(err)}`);
                verdict = { status: 500, body: buildDiscardResponse(REASON_STORE_UNAVAILABLE), crashId: null };
            }
            res.writeHead(verdict.status, { 'content-type': 'text/plain; charset=utf-8' });
            res.end(verdict.body);
        });
    });
    return new Promise((res, rej) => {
        server.on('error', rej);
        server.listen(port, LOOPBACK_HOST, () => {
            const address = server.address();
            const boundPort = typeof address === 'object' && address !== null ? address.port : port;
            res({ server, url: `http://${LOOPBACK_HOST}:${boundPort}${SUBMIT_PATH}` });
        });
    });
}

// --- CLI --------------------------------------------------------------------

function printHelp() {
    console.log(`${NAME}: the PowerBrowser crash collector -- a downstream's own Antenna-protocol crash endpoint.

Usage: node scripts/crash-collector.mjs [--port <n>] [--store <dir>]

  --port <n>     Loopback port to bind (default ${DEFAULT_PORT}).
  --store <dir>  Directory for crash records (default ${DEFAULT_STORE_DIR}).
  --help         Show this text.

The server binds ${LOOPBACK_HOST} only -- there is no flag to expose it.
Submit a multipart POST to /submit with the minidump part named
${MINIDUMP_PART_NAME}; see docs/CRASH-POLICY.md for the retention,
throttle, and privacy rules this enforces.`);
}

// Import guard: importing this module (gate, suite) must not bind a port.
// Direct invocation still serves.
const INVOKED_DIRECTLY = (() => {
    try {
        return process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
    } catch {
        return false;
    }
})();
if (INVOKED_DIRECTLY) {
    const argv = process.argv.slice(2);
    if (argv.includes('--help') || argv.includes('-h')) {
        printHelp();
        process.exit(0);
    }
    let port = DEFAULT_PORT;
    let storeDir = DEFAULT_STORE_DIR;
    let bad = null;
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--port' && argv[i + 1] !== undefined) {
            port = Number(argv[++i]);
            if (!Number.isInteger(port) || port < 1 || port > 65535) bad = `--port carries ${JSON.stringify(argv[i])}, want an integer port 1-65535`;
        } else if (argv[i] === '--store' && argv[i + 1] !== undefined) {
            storeDir = resolve(argv[++i]);
        } else {
            bad = `unknown argument ${JSON.stringify(argv[i])}`;
        }
    }
    if (bad) {
        console.error(`${NAME}: FAIL -- ${bad}. Next step: run with --help and retry with a valid flag.`);
        process.exit(2);
    }
    if (!existsSync(storeDir)) mkdirSync(storeDir, { recursive: true });
    startCollector({ port, storeDir }).then(({ url }) => {
        console.log(`${NAME}: PowerBrowser crash collector listening at ${url} -- records land in ${storeDir}. Stop with Ctrl-C.`);
    }).catch((err) => {
        console.error(`${NAME}: FAIL -- could not bind ${LOOPBACK_HOST}:${port}: ${err && err.message ? err.message : String(err)}. Next step: free the port or pass --port.`);
        process.exit(1);
    });
}
