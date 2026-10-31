// worker/events-worker.mjs
//
// The telemetry Worker (Phase 48, TEL-10 and TEL-11). POST /events validates one opt-in error
// report batch and writes one D1 row per admitted event. POST /download-counts writes one
// authenticated download count per asset and UTC day. A daily scheduled job deletes rows older
// than RETENTION_DAYS from both tables.
//
// THE ADMITTED SET IS THE PRODUCER'S. ADMITTED_KEYS restates the seven-key set that
// theia/extensions/telemetry/src/browser/telemetry-enrichment.ts exports; the producer is the
// source of truth. scripts/verify-events-worker.mjs imports that module and requires equality, so
// the two cannot drift. Every other property a client sends is dropped, never stored.
//
// THE WIRE ENVELOPE IS THE SENDER'S. Each event is {kind, name, data: {<admitted keys>}, at}
// (telemetry-sender.ts). The Worker reads name and data from that envelope; kind must be 'error'
// (a 'usage' event is not collected and is skipped), and an error event whose envelope does not
// match answers 400 malformed_event for the whole batch. The gate drives the real reporter and
// sender into handleEvents, so a change to either side of the envelope goes red.
//
// CREDENTIALLESS BY CONSTRUCTION. This directory holds no secret, token, key or client identifier.
// The one shared secret is read at request time from env.DOWNLOAD_COUNT_SECRET (a Worker secret the
// owner sets), compared in constant time, and never logged or stored. The Cloudflare token that
// deploys this Worker is never in the tree. The gate scans this directory for assigned
// credential-shaped values.
//
// CAPS AND RETENTION. The privacy page states the same numbers; the gate derives both sides.
//   body       MAX_BODY_BYTES = 65536 bytes, checked before parse; over it answers 413 oversized_body
//   batch      MAX_EVENTS = 100 events per POST; over it answers 400 malformed_batch
//   string     MAX_STRING_CHARS = 256 characters per stored free string (a download-count asset or tag);
//              a longer string is truncated. Event values are shape-checked, never truncated.
//   retention  RETENTION_DAYS = 30 days, deleted by the scheduled job from both tables
//
// NO RATE LIMIT IN THE WORKER. The Worker keeps no counter. A per-instance counter is not a rate
// limit (Cloudflare runs many isolates), and a counter shared by all callers lets one noisy client
// make the Worker discard every other client's reports, which the sender never retries. The limit
// that holds is the per-IP zone rule over /events and /download-counts (wrangler.toml runbook step
// 6), which is why workers_dev is off. Upgrade to the Rate Limiting binding if a per-client budget
// is ever needed inside the Worker.
//
// WIRE VOCABULARY. 200 accepted: "ok: stored <n>" (events) or "ok: <asset>" (download counts).
// 400: "Discarded: malformed_body",
// "Discarded: malformed_batch" or "Discarded: malformed_event". 413: "Discarded: oversized_body". 500: "Discarded: store_unavailable".
// 401 and 404 answer an empty body.
//
// CORS. The sender posts application/json from the Theia page, whose origin is the loopback
// sidecar (http://127.0.0.1:<port>, the host TheiaService.sys.mjs starts it on; the port changes per
// launch), so the browser sends an OPTIONS preflight first. /events answers it with 204 and allows
// POST and the content-type header for that origin only. Access-Control-Allow-Origin is echoed only
// when the request origin matches CORS_ORIGIN (one origin cannot be a list and the port is dynamic,
// so the pattern is the narrowest correct value), and it is never sent for /download-counts, which
// is a server-to-server route.
//
// ZERO-DEPENDENCY. Request, Response, URL, TextEncoder and the D1 binding only; no import, no socket
// at import time, so the contract gate imports this file under plain node.

export const EVENTS_PATH = '/events';
export const DL_PATH = '/download-counts';
export const RETENTION_DAYS = 30;
export const MAX_BODY_BYTES = 65536;
export const MAX_EVENTS = 100;
export const MAX_STRING_CHARS = 256;
export const REASON_MALFORMED = 'malformed_body';
export const REASON_BATCH = 'malformed_batch';
export const REASON_EVENT = 'malformed_event';
export const REASON_OVERSIZED = 'oversized_body';
export const REASON_STORE = 'store_unavailable';
export const DAY_MS = 86_400_000;

/** The producer's wire key set, in order (telemetry-enrichment.ts is the source of truth). */
export const ADMITTED_KEYS = Object.freeze(['type', 'source', 'line', 'column', 'version', 'buildID', 'os']);
/** Wire key to D1 column. source is stored as basename; buildID as buildid. */
const COLUMN_FOR = Object.freeze({ type: 'type', source: 'basename', line: 'line', column: 'column', version: 'version', buildID: 'buildid', os: 'os' });

/**
 * The shape of every admitted value, restated from the producer (telemetry-enrichment.ts is the
 * source of truth; the gate requires equality). A value that fails its shape is free text, so the
 * batch is rejected rather than trimmed: nothing that is not an identifier, a bare file name, a
 * release version, a bucket or a small integer is ever stored. The sender enforces the same shapes
 * before anything leaves the machine; this is the second wall, for a hostile or old client.
 */
export const ADMITTED_SHAPES = Object.freeze({
    type: /^[A-Za-z_$][\w$]{0,63}$/,
    source: /^[\w.-]{1,100}$/,
    version: /^\d{1,4}\.\d{1,4}(?:\.\d{1,4})?$/,
    buildID: /^v\d{1,4}\.\d{1,4}(?:\.\d{1,4})?-\d{1,6}$/,
});
export const OS_BUCKETS = Object.freeze(['windows', 'macos', 'linux', 'unknown']);
export const POSITION_MAX = 2147483647;
/** The event name shape (the sender's EVENT_NAME). */
export const NAME_SHAPE = /^[A-Za-z0-9._-]{1,100}$/;

function valueOk(wire, value) {
    if (wire === 'line' || wire === 'column') return Number.isSafeInteger(value) && value >= 0 && value <= POSITION_MAX;
    if (wire === 'os') return typeof value === 'string' && OS_BUCKETS.includes(value);
    return typeof value === 'string' && ADMITTED_SHAPES[wire]?.test(value) === true;
}
/** The events table, in insert order. received_at is server time; synthetic is the control flag. */
export const EVENT_COLUMNS = Object.freeze(['received_at', 'name', 'type', 'basename', 'line', 'column', 'version', 'buildid', 'os', 'synthetic']);
export const DOWNLOAD_COLUMNS = Object.freeze(['asset', 'tag', 'day', 'download_count', 'received_at']);

const INSERT_EVENT = `INSERT INTO events (${EVENT_COLUMNS.map(c => `"${c}"`).join(', ')}) VALUES (${EVENT_COLUMNS.map(() => '?').join(', ')})`;
const UPSERT_DOWNLOAD = 'INSERT INTO download_counts ("asset", "tag", "day", "download_count", "received_at") VALUES (?, ?, ?, ?, ?) '
    + 'ON CONFLICT("asset", "day") DO UPDATE SET "tag" = excluded."tag", "download_count" = excluded."download_count", "received_at" = excluded."received_at"';
const SELECT_MAINTAINER = 'SELECT * FROM events WHERE "synthetic" = 0 ORDER BY "id"';
const DELETE_EVENTS_OLDER = 'DELETE FROM events WHERE "received_at" < ?';
const DELETE_COUNTS_OLDER = 'DELETE FROM download_counts WHERE "received_at" < ?';

/** The only origin a browser page may post /events from: the loopback sidecar, any port. */
export const CORS_ORIGIN = /^http:\/\/127\.0\.0\.1:\d{1,5}$/;
export const CORS_MAX_AGE_SECONDS = 86400;

/**
 * The CORS response headers for /events. Nothing but Vary for an origin that is not the sidecar's
 * own, so the browser blocks the cross-origin read and the POST. The preflight adds the allowed
 * method, header and cache lifetime.
 */
export function corsHeaders(origin, preflight) {
    const headers = { vary: 'origin' };
    if (typeof origin !== 'string' || !CORS_ORIGIN.test(origin)) return headers;
    headers['access-control-allow-origin'] = origin;
    if (preflight) {
        headers['access-control-allow-methods'] = 'POST';
        headers['access-control-allow-headers'] = 'content-type';
        headers['access-control-max-age'] = String(CORS_MAX_AGE_SECONDS);
    }
    return headers;
}

const encoder = new TextEncoder();

function byteLength(text) {
    return encoder.encode(text).byteLength;
}

function truncate(value) {
    return value.length > MAX_STRING_CHARS ? value.slice(0, MAX_STRING_CHARS) : value;
}

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isJsonType(contentType) {
    return typeof contentType === 'string' && contentType.toLowerCase().includes('application/json');
}

function parseJsonObject(text) {
    try {
        const value = JSON.parse(text);
        return isPlainObject(value) ? value : undefined;
    } catch {
        return undefined;
    }
}

function discard(status, reason) {
    return { status, body: `Discarded: ${reason}` };
}

function empty(status) {
    return { status, body: '' };
}

/** Constant-time string equality. Length difference and every character position feed one accumulator. */
function constantTimeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const n = Math.max(a.length, b.length);
    let diff = a.length ^ b.length;
    for (let i = 0; i < n; i += 1) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
    return diff === 0;
}

/** Fail-closed: no configured secret, or no Bearer header, is unauthorized. */
function authorized(header, env) {
    const expected = env?.DOWNLOAD_COUNT_SECRET;
    if (typeof expected !== 'string' || expected === '') return false;
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) return false;
    return constantTimeEqual(header.slice('Bearer '.length), expected);
}

/**
 * Reduce one client event, in the sender's envelope {kind, name, data, at}, to the stored row. Only
 * name and the ADMITTED_KEYS of data are read, each in its admitted shape; a value that fails its
 * shape makes the event malformed. synthetic is a control flag read as a boolean, never stored as
 * payload text. Returns null for an event that is not an error report (skipped, not stored) and
 * undefined for an error event whose envelope does not match (the batch is rejected).
 */
export function admitEvent(event) {
    if (event.kind !== 'error') return event.kind === 'usage' ? null : undefined;
    if (typeof event.name !== 'string' || !NAME_SHAPE.test(event.name)) return undefined;
    if (event.data !== undefined && !isPlainObject(event.data)) return undefined;
    const data = event.data ?? {};
    const row = { name: event.name };
    for (const wire of ADMITTED_KEYS) {
        const value = data[wire];
        if (value === undefined) continue;
        if (!valueOk(wire, value)) return undefined;
        row[COLUMN_FOR[wire]] = value;
    }
    row.synthetic = event.synthetic === true ? 1 : 0;
    return row;
}

function eventValues(row, receivedAt) {
    return EVENT_COLUMNS.map(column => {
        if (column === 'received_at') return receivedAt;
        if (column === 'synthetic') return row.synthetic;
        return row[column] ?? null;
    });
}

/**
 * POST /events. Contract order: route, content type, size, parse, shape, store. Every
 * rejection is decided before the first write, so a rejected batch stores nothing, and the write is
 * one D1 batch, so a storage fault stores nothing either.
 */
export async function handleEvents(shape, env, state) {
    if (shape.method !== 'POST' || shape.path !== EVENTS_PATH) return empty(404);
    if (!isJsonType(shape.headers?.['content-type'])) return discard(400, REASON_MALFORMED);
    if (byteLength(shape.body) > MAX_BODY_BYTES) return discard(413, REASON_OVERSIZED);
    const top = parseJsonObject(shape.body);
    if (top === undefined) return discard(400, REASON_MALFORMED);
    if (!Array.isArray(top.events) || top.events.length > MAX_EVENTS) return discard(400, REASON_BATCH);
    if (!top.events.every(isPlainObject)) return discard(400, REASON_MALFORMED);
    const admitted = top.events.map(admitEvent);
    if (admitted.includes(undefined)) return discard(400, REASON_EVENT);
    const rows = admitted.filter(row => row !== null);
    try {
        // One batch is one transaction in D1: a failed insert stores none of them, so the sender's retry of
        // the whole batch cannot duplicate rows that did land.
        if (rows.length > 0) await env.DB.batch(rows.map(row => env.DB.prepare(INSERT_EVENT).bind(...eventValues(row, state.nowMs))));
    } catch {
        return discard(500, REASON_STORE);
    }
    return { status: 200, body: `ok: stored ${rows.length}` };
}

/**
 * POST /download-counts. Contract order: route, Bearer secret, content type, size, parse, shape,
 * upsert. The secret is checked before the body is sized or parsed, so an unauthenticated caller
 * reaches no parser.
 */
export async function handleDownloadCounts(shape, env, state) {
    if (shape.method !== 'POST' || shape.path !== DL_PATH) return empty(404);
    if (!authorized(shape.headers?.authorization, env)) return empty(401);
    if (!isJsonType(shape.headers?.['content-type'])) return discard(400, REASON_MALFORMED);
    if (byteLength(shape.body) > MAX_BODY_BYTES) return discard(413, REASON_OVERSIZED);
    const top = parseJsonObject(shape.body);
    if (top === undefined) return discard(400, REASON_MALFORMED);
    const asset = typeof top.asset === 'string' && top.asset !== '' ? truncate(top.asset) : undefined;
    const tag = typeof top.tag === 'string' ? truncate(top.tag) : undefined;
    const count = top.download_count;
    if (asset === undefined || tag === undefined || !Number.isInteger(count) || count < 0) return discard(400, REASON_MALFORMED);
    const day = new Date(state.nowMs).toISOString().slice(0, 10);
    try {
        await env.DB.prepare(UPSERT_DOWNLOAD).bind(asset, tag, day, count, state.nowMs).run();
    } catch {
        return discard(500, REASON_STORE);
    }
    return { status: 200, body: `ok: ${asset}` };
}

/** The maintainer view: every stored event except synthetic probe rows. */
export async function listMaintainerEvents(db) {
    const result = await db.prepare(SELECT_MAINTAINER).all();
    return result?.results ?? [];
}

/** Delete rows received before the retention window, from both tables. */
export async function runRetention(db, nowMs) {
    const cutoff = nowMs - RETENTION_DAYS * DAY_MS;
    await db.prepare(DELETE_EVENTS_OLDER).bind(cutoff).run();
    await db.prepare(DELETE_COUNTS_OLDER).bind(cutoff).run();
}

export async function scheduled(controller, env) {
    await runRetention(env.DB, Date.now());
}

function toResponse(verdict, extraHeaders = {}) {
    return new Response(verdict.body, { status: verdict.status, headers: { 'content-type': 'text/plain; charset=utf-8', ...extraHeaders } });
}

export default {
    async fetch(request, env) {
        const path = new URL(request.url).pathname;
        if (path !== EVENTS_PATH && path !== DL_PATH) return toResponse(empty(404));
        const origin = request.headers.get('origin');
        if (path === EVENTS_PATH && request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin, true) });
        const cors = path === EVENTS_PATH ? corsHeaders(origin, false) : {};
        const shape = {
            method: request.method,
            path,
            headers: {
                'content-type': request.headers.get('content-type') ?? '',
                authorization: request.headers.get('authorization') ?? '',
            },
            // shortcut: the body is read whole before the 64 KiB check; upgrade to a streamed read if abuse shows up.
            body: request.method === 'POST' ? await request.text() : '',
        };
        const state = { nowMs: Date.now() };
        const verdict = path === EVENTS_PATH
            ? await handleEvents(shape, env, state)
            : await handleDownloadCounts(shape, env, state);
        return toResponse(verdict, cors);
    },
    scheduled,
};
