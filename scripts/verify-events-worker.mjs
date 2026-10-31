#!/usr/bin/env node
// scripts/verify-events-worker.mjs
//
// The contract gate for the telemetry Worker (Phase 48, TEL-10 and TEL-11), in the shape of
// verify-crash-collector.mjs. Named events-worker in verify-platform.sh.
//
// WHAT IT ASSERTS. Every expectation is DERIVED at check time from the Worker's own exports, the
// producer's ADMITTED_KEYS, or the documents that state the same numbers -- never kept here:
//
//  1. Static cross-checks.
//     - The Worker's ADMITTED_KEYS equals the producer's, imported from
//       theia/extensions/telemetry/src/browser/telemetry-enrichment.ts (the producer is the
//       source of truth; a wider Worker set fails naming the key).
//     - website-staging/privacy.html states the Worker's RETENTION_DAYS, so the page and the
//       Worker cannot state different retention numbers.
//     - worker/schema.sql declares every column the Worker writes, in both tables.
//     - worker/wrangler.toml names the Worker, binds the D1 database, schedules the daily job,
//       states no routes key, and carries the database placeholder exactly once.
//     - No file in worker/ assigns a credential-shaped value.
//  2. Behaviour, against the Worker as written and a stub D1 that models the three statement
//     shapes the Worker issues. Each rejection is checked for the exact status and body and for an
//     empty store afterwards.
//
// Usage:
//   node scripts/verify-events-worker.mjs
//   node scripts/verify-events-worker.mjs --self-test
//
// The self-test runs the same checks on the real tree first (control green), then on a copy of the
// Worker and its documents in a temp dir with one fault planted per rule. Each planted fault must go
// red NAMING its rule. A plant that leaves the gate green would mean nothing; the control proves a
// red is plant-caused.
//
// Honestly --quick: node stdlib, text reads, and in-memory stub D1 in mkdtemp. No build, browser,
// display or network.

import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'events-worker';

const args = process.argv.slice(2);
const SELF_TEST = args.includes('--self-test');
for (const a of args) {
    if (a !== '--self-test') {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
        process.exit(2);
    }
}

const WORKER_REL = 'worker/events-worker.mjs';
const SCHEMA_REL = 'worker/schema.sql';
const WRANGLER_REL = 'worker/wrangler.toml';
const PRIVACY_REL = 'website-staging/privacy.html';
const ENRICH_REL = 'theia/extensions/telemetry/src/browser/telemetry-enrichment.ts';
const REPORT_REL = 'theia/extensions/telemetry/src/browser/telemetry-error-report.ts';
const SENDER_REL = 'theia/extensions/telemetry/src/browser/telemetry-sender.ts';
const WORKER_DIR_REL = 'worker';
const THEIA_SERVICE_REL = 'powerbrowser/shell/TheiaService.sys.mjs';
const PLACEHOLDER = 'REPLACE-WITH-OWNER-D1-ID';
const FIXED_NOW = Date.UTC(2026, 9, 31, 12, 0, 0);
const DAY = 86_400_000;

// The rule labels the self-test requires each plant to name. Each label appears in the failure text.
const RULE = Object.freeze({
    control: 'well-formed control',
    method: 'wrong method',
    path: 'wrong path',
    contentType: 'wrong content-type',
    unparseable: 'unparseable body',
    nonObjectTop: 'non-object top level',
    nonObjectEvent: 'non-object event',
    overCapBody: 'over-cap body',
    overCapBatch: 'over-cap batch',
    extraProp: 'extra-prop event',
    overLength: 'over-length string',
    noSuppress: 'one client cannot suppress another',
    unauthDownload: 'unauthenticated download-count POST',
    wrongSecret: 'wrong-secret download-count POST',
    malformedAuthed: 'malformed authenticated body',
    duplicateAssetDay: 'duplicate asset-day POST',
    synthetic: 'synthetic-marked event in the maintainer query',
    retention: 'retention window',
    admitted: 'admitted set equals the producer',
    contract: 'producer-to-Worker contract',
    cors: 'CORS preflight and origin',
    shapes: 'admitted shapes equal the producer',
    content: 'content in an admitted key',
    flat: 'old flat event shape',
    usage: 'usage event skipped',
    schemaColumn: 'schema declares every column',
    noRoutes: 'no routes key',
    workersDev: 'no workers.dev URL',
    credential: 'credential-shaped assignment in worker/',
});

// --- stub D1 -----------------------------------------------------------------
//
// Models exactly the statement shapes the Worker issues. An unknown statement throws, so a new
// statement shape fails the gate loudly instead of passing silently. The upsert keeps a stored
// column unless the SQL names it as excluded.<column>, which is how the real conflict clause works.
function makeStub() {
    const stub = { events: [], counts: new Map(), nextId: 1 };
    stub.prepare = sql => ({
        bind: (...values) => ({
            run: async () => execute(stub, sql, values),
            all: async () => execute(stub, sql, values),
        }),
        run: async () => execute(stub, sql, []),
        all: async () => execute(stub, sql, []),
    });
    return stub;
}

function execute(stub, sql, values) {
    const insert = /^INSERT INTO (events|download_counts) \(([^)]*)\)/.exec(sql);
    if (insert !== null) {
        const columns = insert[2].split(',').map(c => c.trim().replace(/"/g, ''));
        const row = {};
        columns.forEach((c, i) => { row[c] = values[i]; });
        if (insert[1] === 'events') {
            row.id = stub.nextId;
            stub.nextId += 1;
            stub.events.push(row);
            return { success: true, results: [] };
        }
        if (!/ON CONFLICT\("asset", "day"\) DO UPDATE SET/.test(sql)) {
            throw new Error(`stub D1: download_counts insert without the upsert clause: ${sql}`);
        }
        const key = `${row.asset}\u0000${row.day}`;
        const stored = stub.counts.get(key);
        if (stored === undefined) {
            stub.counts.set(key, row);
        } else {
            for (const m of sql.matchAll(/"(\w+)" = excluded\."\w+"/g)) stored[m[1]] = row[m[1]];
        }
        return { success: true, results: [] };
    }
    if (/^SELECT \* FROM events/.test(sql)) {
        const rows = /WHERE "synthetic" = 0/.test(sql) ? stub.events.filter(r => r.synthetic === 0) : stub.events.slice();
        return { success: true, results: rows.map(r => ({ ...r })) };
    }
    const del = /^DELETE FROM (events|download_counts) WHERE "received_at" < \?$/.exec(sql);
    if (del !== null) {
        const cutoff = values[0];
        if (del[1] === 'events') {
            stub.events = stub.events.filter(r => !(r.received_at < cutoff));
        } else {
            for (const [key, r] of [...stub.counts]) if (r.received_at < cutoff) stub.counts.delete(key);
        }
        return { success: true, results: [] };
    }
    throw new Error(`stub D1 has no statement shape for: ${sql}`);
}

function storeIsEmpty(stub) {
    return stub.events.length === 0 && stub.counts.size === 0;
}

// --- helpers -----------------------------------------------------------------

function loadModule(root, rel) {
    return import(`${pathToFileURL(join(root, rel)).href}?root=${encodeURIComponent(root)}`);
}

function readText(root, rel) {
    const p = join(root, rel);
    return existsSync(p) ? readFileSync(p, 'utf8') : null;
}

function post(path, body, headers = {}) {
    return {
        method: 'POST',
        path,
        headers: { 'content-type': 'application/json', authorization: '', ...headers },
        body: typeof body === 'string' ? body : JSON.stringify(body),
    };
}

function freshState(nowMs = FIXED_NOW) {
    return { nowMs };
}

/** One event in the sender's envelope: {kind, name, data, at}. */
function errorEvent(data, extra = {}) {
    return { kind: 'error', name: 'frontend.uncaught-error', data, at: 1, ...extra };
}

const GOOD_EVENTS = {
    events: [
        errorEvent({ type: 'TypeError', source: 'bundle.js', line: 12, column: 34, version: '153.5.1', buildID: 'v153.5.1-1', os: 'linux' }),
        errorEvent({ type: 'RangeError', source: 'other.js', line: 3, column: 4, version: '153.5.1', buildID: 'v153.5.1-1', os: 'windows' }, { name: 'frontend.unhandled-rejection' }),
        errorEvent({ type: 'TypeError', source: 'probe.js', line: 1, column: 1, version: '153.5.1', buildID: 'v153.5.1-1', os: 'unknown' }, { synthetic: true }),
    ],
};

// --- static checks -----------------------------------------------------------

async function runStatic(root, worker) {
    const failures = [];

    // 1a. the admitted set is the producer's.
    if (!existsSync(join(root, ENRICH_REL))) {
        failures.push(`${RULE.admitted}: ${ENRICH_REL} is absent, so the producer's admitted set cannot be read. Next step: restore the producer module.`);
    } else {
        const producer = await loadModule(root, ENRICH_REL);
        if (JSON.stringify([...worker.ADMITTED_KEYS]) !== JSON.stringify([...producer.ADMITTED_KEYS])) {
            failures.push(`${RULE.admitted}: the Worker's ADMITTED_KEYS is ${JSON.stringify([...worker.ADMITTED_KEYS])} but the producer exports ${JSON.stringify([...producer.ADMITTED_KEYS])}. Next step: make ${WORKER_REL} restate the producer's set exactly.`);
        }
    }

    // 1a'. the value shapes are the producer's, derived by comparing both modules.
    if (existsSync(join(root, ENRICH_REL))) {
        const producer = await loadModule(root, ENRICH_REL);
        const pairs = [
            ...Object.keys(producer.ADMITTED_SHAPES).map(k => [`${k} shape`, String(producer.ADMITTED_SHAPES[k]), String(worker.ADMITTED_SHAPES?.[k])]),
            ['os buckets', JSON.stringify([...producer.OS_BUCKETS]), JSON.stringify([...(worker.OS_BUCKETS ?? [])])],
            ['position maximum', String(producer.POSITION_MAX), String(worker.POSITION_MAX)],
            ['event name shape', String(producer.EVENT_NAME), String(worker.NAME_SHAPE)],
        ];
        for (const [what, want, got] of pairs) {
            if (want !== got) failures.push(`${RULE.shapes}: the producer's ${what} is ${want} but the Worker restates ${got}. Next step: make ${WORKER_REL} restate the producer's shape exactly.`);
        }
    }

    // 1a''. the CORS origin admits the sidecar's own origin, derived from the host TheiaService starts it on.
    const service = readText(root, THEIA_SERVICE_REL);
    const host = service === null ? null : /"--hostname",\s*"([^"]+)"/.exec(service)?.[1];
    if (host === null || host === undefined) {
        failures.push(`${RULE.cors}: ${THEIA_SERVICE_REL} states no --hostname, so the sidecar origin the Worker must allow cannot be derived. Next step: restore the sidecar start arguments or update this check.`);
    } else if (!worker.CORS_ORIGIN?.test(`http://${host}:41234`) || worker.CORS_ORIGIN.test('http://localhost:41234') || worker.CORS_ORIGIN.test('https://example.org')) {
        failures.push(`${RULE.cors}: CORS_ORIGIN does not match exactly the sidecar origin http://${host}:<port> that ${THEIA_SERVICE_REL} starts. Next step: allow that origin and no other in ${WORKER_REL}.`);
    }

    // 1b. the privacy page states the Worker's retention.
    const privacy = readText(root, PRIVACY_REL);
    if (privacy === null) {
        failures.push(`${RULE.retention}: ${PRIVACY_REL} is absent, so the retention the page states cannot be checked. Next step: restore the page.`);
    } else if (!privacy.includes(`kept for ${worker.RETENTION_DAYS} days`)) {
        failures.push(`${RULE.retention}: ${PRIVACY_REL} does not state "kept for ${worker.RETENTION_DAYS} days", but the Worker deletes after RETENTION_DAYS = ${worker.RETENTION_DAYS}. Next step: make the page and the Worker state the same number.`);
    }

    // 1c. the schema declares every column the Worker writes.
    const schema = readText(root, SCHEMA_REL);
    if (schema === null) {
        failures.push(`${RULE.schemaColumn}: ${SCHEMA_REL} is absent. Next step: restore the DDL the owner applies.`);
    } else {
        for (const [table, columns] of [['events', worker.EVENT_COLUMNS], ['download_counts', worker.DOWNLOAD_COLUMNS]]) {
            const block = new RegExp(`CREATE TABLE ${table} \\(([\\s\\S]*?)\\);`).exec(schema);
            if (block === null) {
                failures.push(`${RULE.schemaColumn}: ${SCHEMA_REL} has no CREATE TABLE ${table} statement. Next step: add the table the Worker writes.`);
                continue;
            }
            for (const column of columns) {
                if (!block[1].includes(`"${column}"`)) failures.push(`${RULE.schemaColumn}: the ${table} table in ${SCHEMA_REL} does not declare "${column}", which the Worker writes. Next step: add the column to the DDL.`);
            }
        }
        if (!schema.includes('PRIMARY KEY ("asset", "day")')) failures.push(`${RULE.schemaColumn}: download_counts has no PRIMARY KEY ("asset", "day"), so the per-day upsert has no conflict key. Next step: restore it.`);
    }

    // 1d. the deploy descriptor.
    const wrangler = readText(root, WRANGLER_REL);
    if (wrangler === null) {
        failures.push(`${RULE.noRoutes}: ${WRANGLER_REL} is absent. Next step: restore the deploy descriptor.`);
    } else {
        for (const [label, literal] of [
            ['the Worker name', 'name = "powerbrowser-events"'],
            ['the Worker entry', 'main = "events-worker.mjs"'],
            ['the D1 binding', 'binding = "DB"'],
            ['the D1 database name', 'database_name = "powerbrowser-events"'],
            ['the daily scheduled job', 'crons = ["0 3 * * *"]'],
        ]) {
            if (!wrangler.includes(literal)) failures.push(`${WRANGLER_REL} does not state ${label} (${literal}). Next step: restore it in the descriptor.`);
        }
        for (const key of ['workers_dev', 'preview_urls']) {
            if (!new RegExp(`^${key}\\s*=\\s*false\\s*$`, 'm').test(wrangler)) failures.push(`${RULE.workersDev}: ${WRANGLER_REL} does not state ${key} = false, so a workers.dev URL would bypass the zone rate-limit rule. Next step: state ${key} = false at the top level.`);
        }
        if (!/\/download-counts/.test(wrangler.split('\n').filter(l => l.startsWith('#')).join('\n'))) failures.push(`${RULE.workersDev}: the runbook in ${WRANGLER_REL} does not name /download-counts in the rate-limit rule, which is its only guess limit. Next step: cover both routes in runbook step 6.`);
        if (/^\s*routes\s*=/m.test(wrangler)) failures.push(`${RULE.noRoutes}: ${WRANGLER_REL} states a routes key, but Phase 47 attaches the events hostname. Next step: remove the routes key.`);
        const placeholders = wrangler.split(PLACEHOLDER).length - 1;
        if (placeholders !== 1) failures.push(`${WRANGLER_REL} carries the database placeholder ${placeholders} time(s), not once. Next step: keep one database_id line with the placeholder; the owner replaces it at the checkpoint.`);
    }

    // 1e. no credential-shaped assignment in the directory.
    const credentialShape = /[A-Za-z_]*(secret|token|api[_-]?key|passwd|password)[A-Za-z_]*\s*[:=]\s*["'`][^"'`\n]+["'`]/i;
    for (const name of readdirSync(join(root, WORKER_DIR_REL))) {
        const text = readText(root, join(WORKER_DIR_REL, name)) ?? '';
        const hit = text.split('\n').find(line => credentialShape.test(line));
        if (hit !== undefined) failures.push(`${RULE.credential} in ${WORKER_DIR_REL}/${name}: ${hit.trim().slice(0, 120)}. Next step: remove the value; the shared secret is read from env.DOWNLOAD_COUNT_SECRET at request time only.`);
    }

    return failures;
}

// --- behaviour checks --------------------------------------------------------

async function runBehaviour(root, worker, secret) {
    const failures = [];
    const env = (stub) => ({ DB: stub, DOWNLOAD_COUNT_SECRET: secret });
    const expectRejected = async (rule, shape, want, opts = {}) => {
        const stub = makeStub();
        let verdict;
        try {
            verdict = opts.download
                ? await worker.handleDownloadCounts(shape, env(stub), freshState())
                : await worker.handleEvents(shape, env(stub), freshState());
        } catch (err) {
            failures.push(`${rule}: the Worker threw instead of answering: ${err.message}. Next step: answer every rejection with its contract status.`);
            return;
        }
        if (verdict.status !== want.status || verdict.body !== want.body) {
            failures.push(`${rule}: the Worker answered ${verdict.status} ${JSON.stringify(verdict.body)}, but the contract requires ${want.status} ${JSON.stringify(want.body)}. Next step: restore the guard in ${WORKER_REL}.`);
        }
        if (!storeIsEmpty(stub)) failures.push(`${rule}: a rejected request left rows in the store. Next step: decide every rejection before the first write.`);
    };

    // Control: a well-formed batch is stored, the synthetic row is kept out of the maintainer query.
    {
        const stub = makeStub();
        const verdict = await worker.handleEvents(post(worker.EVENTS_PATH, GOOD_EVENTS), env(stub), freshState());
        if (verdict.status !== 200 || verdict.body !== 'ok: stored 3') failures.push(`${RULE.control}: a well-formed batch answered ${verdict.status} ${JSON.stringify(verdict.body)}, not 200 "ok: stored 3". Next step: restore the accept path.`);
        if (stub.events.length !== 3) failures.push(`${RULE.control}: the batch wrote ${stub.events.length} row(s), not 3. Next step: write one row per admitted event.`);
        const maintainer = await worker.listMaintainerEvents(stub);
        if (maintainer.length !== 2) failures.push(`${RULE.synthetic}: the maintainer query returned ${maintainer.length} row(s) for two real events and one synthetic probe; want 2. Next step: keep synthetic rows out of listMaintainerEvents.`);
        if (maintainer.some(r => r.synthetic !== 0)) failures.push(`${RULE.synthetic}: the maintainer query returned a synthetic row. Next step: filter synthetic = 0 in SQL.`);
    }

    const good = JSON.stringify(GOOD_EVENTS);
    await expectRejected(RULE.method, { ...post(worker.EVENTS_PATH, good), method: 'GET' }, { status: 404, body: '' });
    await expectRejected(RULE.path, post('/events/extra', good), { status: 404, body: '' });
    await expectRejected(RULE.contentType, post(worker.EVENTS_PATH, good, { 'content-type': 'text/plain' }), { status: 400, body: 'Discarded: malformed_body' });
    await expectRejected(RULE.unparseable, post(worker.EVENTS_PATH, '{not json'), { status: 400, body: 'Discarded: malformed_body' });
    await expectRejected(RULE.nonObjectTop, post(worker.EVENTS_PATH, '[1,2]'), { status: 400, body: 'Discarded: malformed_body' });
    await expectRejected(RULE.overCapBody, post(worker.EVENTS_PATH, { events: [errorEvent({ type: 'x'.repeat(worker.MAX_BODY_BYTES) })] }), { status: 413, body: 'Discarded: oversized_body' });
    await expectRejected(RULE.overCapBatch, post(worker.EVENTS_PATH, { events: Array.from({ length: worker.MAX_EVENTS + 1 }, () => errorEvent({ type: 'T' })) }), { status: 400, body: 'Discarded: malformed_batch' });
    await expectRejected(RULE.nonObjectEvent, post(worker.EVENTS_PATH, { events: ['not an object'] }), { status: 400, body: 'Discarded: malformed_body' });

    // The old flat shape (no envelope) is rejected whole, and a usage event is skipped, not stored.
    await expectRejected(RULE.flat, post(worker.EVENTS_PATH, { events: [{ type: 'TypeError', source: 'a.js', line: 1 }] }), { status: 400, body: 'Discarded: malformed_event' });
    await expectRejected(RULE.flat, post(worker.EVENTS_PATH, { events: [errorEvent({ type: 'T' }, { kind: 'other' })] }), { status: 400, body: 'Discarded: malformed_event' });
    await expectRejected(RULE.flat, post(worker.EVENTS_PATH, { events: [errorEvent('not an object')] }), { status: 400, body: 'Discarded: malformed_event' });
    {
        const stub = makeStub();
        const mixed = { events: [{ kind: 'usage', name: 'ui.opened', data: { path: '/home/alice/x' }, at: 1 }, errorEvent({ type: 'T' })] };
        const verdict = await worker.handleEvents(post(worker.EVENTS_PATH, mixed), env(stub), freshState());
        if (verdict.status !== 200 || verdict.body !== 'ok: stored 1' || stub.events.length !== 1 || stub.events[0].name !== 'frontend.uncaught-error') {
            failures.push(`${RULE.usage}: a batch of one usage and one error event answered ${verdict.status} ${JSON.stringify(verdict.body)} and stored ${JSON.stringify(stub.events.map(r => r.name))}, want 200 "ok: stored 1" with only the error event. Next step: skip kind usage, store kind error.`);
        }
    }

    // Extra property: accepted, and no property outside the admitted set reaches the row.
    {
        const event = errorEvent({ type: 'T', source: 's.js', line: 1, column: 2, version: '1.2', buildID: 'v1.2-1', os: 'linux', message: 'page text', stack: 'at f', url: 'https://x.invalid/' }, { message: 'page text', url: 'https://x.invalid/' });
        const stub = makeStub();
        const verdict = await worker.handleEvents(post(worker.EVENTS_PATH, { events: [event] }), env(stub), freshState());
        if (verdict.status !== 200) failures.push(`${RULE.extraProp}: an event with extra properties answered ${verdict.status}, not 200. Next step: drop unadmitted properties instead of rejecting the batch.`);
        const leaked = Object.keys(worker.admitEvent(event) ?? {}).filter(k => !worker.EVENT_COLUMNS.includes(k));
        if (leaked.length > 0) failures.push(`${RULE.extraProp}: the admitted row carries ${JSON.stringify(leaked)}, outside the stored columns. Next step: build the row from ADMITTED_KEYS only.`);
        const stored = Object.keys(stub.events[0] ?? {}).filter(k => k !== 'id' && !worker.EVENT_COLUMNS.includes(k));
        if (stored.length > 0) failures.push(`${RULE.extraProp}: the stored row carries ${JSON.stringify(stored)}. Next step: write only the admitted columns.`);
    }

    // Over-length string: a stored free string (a download-count asset) is truncated to MAX_STRING_CHARS.
    {
        const stub = makeStub();
        const authedLong = { authorization: `Bearer ${secret}` };
        const long = 'x'.repeat(300);
        const verdict = await worker.handleDownloadCounts(post(worker.DL_PATH, { asset: long, tag: 't'.repeat(300), download_count: 1 }, authedLong), { DB: stub, DOWNLOAD_COUNT_SECRET: secret }, freshState());
        const row = [...stub.counts.values()][0];
        if (verdict.status !== 200 || row === undefined) failures.push(`${RULE.overLength}: a 300-character asset answered ${verdict.status}, not 200 with truncation. Next step: truncate, do not reject.`);
        else {
            if (Array.from(row.asset).length > worker.MAX_STRING_CHARS) failures.push(`${RULE.overLength}: the stored asset is ${Array.from(row.asset).length} characters, over ${worker.MAX_STRING_CHARS}. Next step: truncate every stored free string to MAX_STRING_CHARS.`);
        }
    }

    // Content in an admitted key: the key is allowed, the value is free text. The batch is rejected whole.
    for (const data of [
        { type: "Unable to read '/home/alice/secret.txt'" },
        { type: 'T', source: 'file:///home/alice/proj/a.ts' },
        { type: 'T', source: 'a/b.js' },
        { type: 'T', source: 'C:\\x.js' },
        { type: 'T', os: 'Alice-laptop' },
        { type: 'T', version: 'x'.repeat(5000) },
        { type: 'T', version: '1.2.3.4.5' },
        { type: 'T', buildID: '/tmp/x' },
        { type: 'T', line: -1 },
        { type: 'T', line: 1.5 },
        { type: 'T', column: 1e308 },
        { type: 'T', line: '12' },
    ]) {
        await expectRejected(RULE.content, post(worker.EVENTS_PATH, { events: [errorEvent(data)] }), { status: 400, body: 'Discarded: malformed_event' });
    }
    await expectRejected(RULE.content, post(worker.EVENTS_PATH, { events: [errorEvent({ type: 'T' }, { name: 'plugin failed: /home/alice/x' })] }), { status: 400, body: 'Discarded: malformed_event' });

    // One client cannot suppress another: the Worker keeps no cross-caller counter, so a flood of POSTs
    // (well past the 60 per minute the old in-Worker window allowed) never makes it discard a later
    // caller's report. Driven through the real fetch handler, which holds the module-level state.
    {
        delete globalThis.__plantSent;
        const stub = makeStub();
        const flood = 150;
        const one = JSON.stringify({ events: [errorEvent({ type: 'T' })] });
        let last;
        for (let i = 0; i < flood; i += 1) {
            last = await worker.default.fetch(new Request(`https://events.example.invalid${worker.EVENTS_PATH}`, { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.7' }, body: one }), env(stub));
        }
        const other = await worker.default.fetch(new Request(`https://events.example.invalid${worker.EVENTS_PATH}`, { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '198.51.100.9' }, body: one }), env(stub));
        if (last.status !== 200 || other.status !== 200 || stub.events.length !== flood + 1) failures.push(`${RULE.noSuppress}: after ${flood} POSTs from one caller a second caller's POST answered ${other.status} ${JSON.stringify(await other.text())} and the store holds ${stub.events.length} of ${flood + 1} rows. Next step: keep no cross-caller counter in the Worker; the zone rule is the rate limit.`);
        delete globalThis.__plantSent;
    }

    // CORS: the preflight and the origin allowance, driven through the real fetch handler.
    {
        const origin = 'http://127.0.0.1:41234';
        const stub = makeStub();
        const e = { DB: stub, DOWNLOAD_COUNT_SECRET: secret };
        const url = `https://events.example.invalid${worker.EVENTS_PATH}`;
        const pre = await worker.default.fetch(new Request(url, { method: 'OPTIONS', headers: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' } }), e);
        const h = name => pre.headers.get(name);
        if (pre.status !== 204 || h('access-control-allow-origin') !== origin || h('access-control-allow-methods') !== 'POST' || h('access-control-allow-headers') !== 'content-type') {
            failures.push(`${RULE.cors}: OPTIONS ${worker.EVENTS_PATH} from the sidecar origin answered ${pre.status} with allow-origin ${JSON.stringify(h('access-control-allow-origin'))}, methods ${JSON.stringify(h('access-control-allow-methods'))}, headers ${JSON.stringify(h('access-control-allow-headers'))}; want 204, ${origin}, POST, content-type. Next step: answer the preflight in ${WORKER_REL}.`);
        }
        const foreign = await worker.default.fetch(new Request(url, { method: 'OPTIONS', headers: { origin: 'https://example.org', 'access-control-request-method': 'POST' } }), e);
        if (foreign.headers.get('access-control-allow-origin') !== null) failures.push(`${RULE.cors}: a preflight from https://example.org was granted allow-origin. Next step: allow only the sidecar origin.`);
        const posted = await worker.default.fetch(new Request(url, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(GOOD_EVENTS) }), e);
        if (posted.status !== 200 || posted.headers.get('access-control-allow-origin') !== origin) failures.push(`${RULE.cors}: POST ${worker.EVENTS_PATH} from the sidecar origin answered ${posted.status} with allow-origin ${JSON.stringify(posted.headers.get('access-control-allow-origin'))}, so the browser would hide the response. Next step: add allow-origin to the /events responses.`);
        const rejected = await worker.default.fetch(new Request(url, { method: 'POST', headers: { origin, 'content-type': 'text/plain' }, body: 'x' }), e);
        if (rejected.status !== 400 || rejected.headers.get('access-control-allow-origin') !== origin) failures.push(`${RULE.cors}: a rejected POST ${worker.EVENTS_PATH} answered ${rejected.status} without allow-origin. Next step: add allow-origin to every /events response.`);
        const dl = new Request(`https://events.example.invalid${worker.DL_PATH}`, { method: 'POST', headers: { origin, 'content-type': 'application/json', authorization: `Bearer ${secret}` }, body: JSON.stringify({ asset: 'a.exe', tag: 'v1.2-1', download_count: 1 }) });
        const dlResponse = await worker.default.fetch(dl, e);
        if (dlResponse.status !== 200 || dlResponse.headers.get('access-control-allow-origin') !== null) failures.push(`${RULE.cors}: POST ${worker.DL_PATH} answered ${dlResponse.status} with allow-origin ${JSON.stringify(dlResponse.headers.get('access-control-allow-origin'))}. Next step: never send CORS headers on the download-counts route.`);
        const dlPre = await worker.default.fetch(new Request(`https://events.example.invalid${worker.DL_PATH}`, { method: 'OPTIONS', headers: { origin, 'access-control-request-method': 'POST' } }), e);
        if (dlPre.headers.get('access-control-allow-origin') !== null) failures.push(`${RULE.cors}: OPTIONS ${worker.DL_PATH} was granted allow-origin. Next step: never send CORS headers on the download-counts route.`);
    }

    // Download counts: authentication first, then the shape, then the upsert.
    const dlBody = { asset: 'PowerBrowser-153.5.1.exe', tag: 'v153.5.1-1', download_count: 10 };
    const authed = { authorization: `Bearer ${secret}` };
    await expectRejected(RULE.unauthDownload, post(worker.DL_PATH, dlBody), { status: 401, body: '' }, { download: true });
    await expectRejected(RULE.wrongSecret, post(worker.DL_PATH, dlBody, { authorization: `Bearer ${secret}-x` }), { status: 401, body: '' }, { download: true });
    await expectRejected(RULE.malformedAuthed, post(worker.DL_PATH, { ...dlBody, download_count: -1 }, authed), { status: 400, body: 'Discarded: malformed_body' }, { download: true });
    {
        const stub = makeStub();
        const first = await worker.handleDownloadCounts(post(worker.DL_PATH, dlBody, authed), env(stub), freshState());
        const second = await worker.handleDownloadCounts(post(worker.DL_PATH, { ...dlBody, download_count: 25 }, authed), env(stub), freshState());
        if (first.status !== 200 || second.status !== 200 || second.body !== 'ok: PowerBrowser-153.5.1.exe') failures.push(`${RULE.duplicateAssetDay}: the authenticated POSTs answered ${first.status} then ${second.status} ${JSON.stringify(second.body)}, not 200 twice. Next step: restore the upsert.`);
        if (stub.counts.size !== 1) failures.push(`${RULE.duplicateAssetDay}: two POSTs for one asset and day left ${stub.counts.size} row(s), not 1. Next step: upsert on (asset, day).`);
        const row = [...stub.counts.values()][0];
        if (row && row.download_count !== 25) failures.push(`${RULE.duplicateAssetDay}: the stored count is ${row.download_count} after a retry that reported 25. Next step: the upsert must replace the count.`);
    }

    // Retention: rows older than RETENTION_DAYS are deleted from both tables, newer rows kept.
    {
        const stub = makeStub();
        await worker.handleEvents(post(worker.EVENTS_PATH, { events: [errorEvent({}, { name: 'old' })] }), env(stub), freshState(FIXED_NOW - (worker.RETENTION_DAYS + 1) * DAY));
        await worker.handleEvents(post(worker.EVENTS_PATH, { events: [errorEvent({}, { name: 'new' })] }), env(stub), freshState(FIXED_NOW - DAY));
        await worker.handleDownloadCounts(post(worker.DL_PATH, dlBody, authed), env(stub), freshState(FIXED_NOW - (worker.RETENTION_DAYS + 1) * DAY));
        await worker.runRetention(stub, FIXED_NOW);
        const kept = stub.events.map(r => r.name);
        if (JSON.stringify(kept) !== JSON.stringify(['new'])) failures.push(`${RULE.retention}: after the scheduled delete the events are ${JSON.stringify(kept)}, want ["new"]. Next step: delete rows older than RETENTION_DAYS from events.`);
        if (stub.counts.size !== 0) failures.push(`${RULE.retention}: a download count older than RETENTION_DAYS survived the scheduled delete. Next step: delete from download_counts too.`);
    }

    return failures;
}

// The producer's real output, driven into the Worker. The reporter and the sender are imported from
// `root` (never hand-written), a window error and an unhandled rejection go through them, and each
// POST body the sender would send is fed to handleEvents against a stub D1. Every stored row must be
// fully populated: a producer and a Worker that disagree on the envelope store all-null rows, which
// a hand-written fixture in the Worker's own shape can never show.
const CONTRACT_CONTEXT = Object.freeze({ version: '153.5.1', buildID: 'v153.5.1-1' });

async function runContract(root, worker, secret) {
    const failures = [];
    let reporterModule;
    let senderModule;
    try {
        reporterModule = await loadModule(root, REPORT_REL);
        senderModule = await loadModule(root, SENDER_REL);
    } catch (err) {
        return [`${RULE.contract}: the producer modules do not load under plain node (${err.message}). Next step: keep ${REPORT_REL} and ${SENDER_REL} importable, then re-run this check.`];
    }
    const bodies = [];
    const sender = new senderModule.PowerBrowserTelemetrySender({
        endpoint: 'https://contract.invalid/events',
        getLevel: () => 'error',
        fetchFn: (url, init) => { bodies.push(init.body); return Promise.resolve({ ok: true }); },
        flushIntervalMs: 0,
    });
    const reporter = new reporterModule.ErrorReporter({ sender, logError: (name, data) => sender.sendErrorData(name, data) }, CONTRACT_CONTEXT);
    reporter.onError({ error: new TypeError('x'), filename: 'http://127.0.0.1:3000/lib/frontend/bundle.js', lineno: 12, colno: 34 });
    reporter.onRejection({ reason: new RangeError('y') });
    await sender.flush();
    sender.dispose();
    if (bodies.length === 0) return [`${RULE.contract}: the sender posted nothing for two reports at level error. Next step: restore the sender's flush path.`];
    const stub = makeStub();
    for (const body of bodies) {
        const verdict = await worker.handleEvents(post(worker.EVENTS_PATH, body), { DB: stub, DOWNLOAD_COUNT_SECRET: secret }, freshState());
        if (verdict.status !== 200) failures.push(`${RULE.contract}: the real sender's body answered ${verdict.status} ${JSON.stringify(verdict.body)}, not 200. Next step: make ${WORKER_REL} accept the envelope ${SENDER_REL} sends.`);
    }
    const byName = new Map(stub.events.map(r => [r.name, r]));
    const want = [
        ['frontend.uncaught-error', { type: 'TypeError', basename: 'bundle.js', line: 12, column: 34, version: CONTRACT_CONTEXT.version, buildid: CONTRACT_CONTEXT.buildID }],
        ['frontend.unhandled-rejection', { type: 'RangeError', version: CONTRACT_CONTEXT.version, buildid: CONTRACT_CONTEXT.buildID }],
    ];
    for (const [name, fields] of want) {
        const row = byName.get(name);
        if (row === undefined) {
            failures.push(`${RULE.contract}: no stored row has name ${JSON.stringify(name)} (stored names: ${JSON.stringify([...byName.keys()])}). Next step: store the event name from the envelope.`);
            continue;
        }
        for (const [column, value] of Object.entries(fields)) {
            if (row[column] !== value) failures.push(`${RULE.contract}: the stored ${name} row has ${column} = ${JSON.stringify(row[column])}, but the producer sent ${JSON.stringify(value)}. Next step: read the sender's {kind, name, data, at} envelope in ${WORKER_REL}.`);
        }
        if (!['windows', 'macos', 'linux', 'unknown'].includes(row.os)) failures.push(`${RULE.contract}: the stored ${name} row has os = ${JSON.stringify(row.os)}, not one of the four buckets. Next step: store data.os.`);
    }
    return failures;
}

async function runAll(root, secret) {
    const worker = await loadModule(root, WORKER_REL);
    const failures = await runStatic(root, worker);
    failures.push(...await runBehaviour(root, worker, secret));
    failures.push(...await runContract(root, worker, secret));
    return failures;
}

// --- the main run -------------------------------------------------------------

async function main() {
    const secret = randomUUID();
    let failures;
    try {
        failures = await runAll(REPO_ROOT, secret);
    } catch (err) {
        console.error(`${NAME}: FAIL -- the Worker could not be loaded: ${err.message}. Next step: keep ${WORKER_REL} zero-import and importable under plain node.`);
        process.exit(1);
    }
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} problem(s)`);
        for (const f of failures) console.error(`  - ${f}`);
        process.exit(1);
    }
    console.log(`${NAME}: PASS -- the Worker holds the admitted set, the envelope, the retention, the caps, the secret and the schema`);
}

// --- self-test -----------------------------------------------------------------

// Stages a copy of every file the gate reads, so a plant mutates one copy and leaves the rest as written.
function stage(dir) {
    for (const rel of [WORKER_REL, SCHEMA_REL, WRANGLER_REL, PRIVACY_REL, ENRICH_REL, REPORT_REL, SENDER_REL, THEIA_SERVICE_REL]) {
        mkdirSync(dirname(join(dir, rel)), { recursive: true });
        copyFileSync(join(REPO_ROOT, rel), join(dir, rel));
    }
}

// Each plant mutates one line of the Worker or one document, and must go red naming its rule.
const PLANTS = [
    { rule: RULE.method, rel: WORKER_REL, find: "if (shape.method !== 'POST' || shape.path !== EVENTS_PATH) return empty(404);", replace: "if (shape.path !== EVENTS_PATH) return empty(404);" },
    { rule: RULE.path, rel: WORKER_REL, find: "if (shape.method !== 'POST' || shape.path !== EVENTS_PATH) return empty(404);", replace: "if (shape.method !== 'POST') return empty(404);" },
    { rule: RULE.contentType, rel: WORKER_REL, find: "    if (!isJsonType(shape.headers?.['content-type'])) return discard(400, REASON_MALFORMED);\n    if (byteLength(shape.body) > MAX_BODY_BYTES) return discard(413, REASON_OVERSIZED);\n    const top = parseJsonObject(shape.body);\n    if (top === undefined) return discard(400, REASON_MALFORMED);\n    if (!Array.isArray(top.events)", replace: "    if (byteLength(shape.body) > MAX_BODY_BYTES) return discard(413, REASON_OVERSIZED);\n    const top = parseJsonObject(shape.body);\n    if (top === undefined) return discard(400, REASON_MALFORMED);\n    if (!Array.isArray(top.events)" },
    { rule: RULE.unparseable, rel: WORKER_REL, find: "    if (top === undefined) return discard(400, REASON_MALFORMED);\n    if (!Array.isArray(top.events)", replace: "    if (!Array.isArray(top.events)" },
    { rule: RULE.nonObjectTop, rel: WORKER_REL, find: 'return isPlainObject(value) ? value : undefined;', replace: 'return value;' },
    { rule: RULE.overCapBody, rel: WORKER_REL, find: '    if (byteLength(shape.body) > MAX_BODY_BYTES) return discard(413, REASON_OVERSIZED);\n    const top = parseJsonObject(shape.body);\n    if (top === undefined) return discard(400, REASON_MALFORMED);\n    if (!Array.isArray(top.events)', replace: '    const top = parseJsonObject(shape.body);\n    if (top === undefined) return discard(400, REASON_MALFORMED);\n    if (!Array.isArray(top.events)' },
    { rule: RULE.overCapBatch, rel: WORKER_REL, find: ' || top.events.length > MAX_EVENTS', replace: '' },
    { rule: RULE.extraProp, rel: WORKER_REL, find: '    row.synthetic = event.synthetic === true ? 1 : 0;', replace: '    row.synthetic = event.synthetic === true ? 1 : 0;\n    row.message = event.message;' },
    { rule: RULE.overLength, rel: WORKER_REL, find: '    return value.length > MAX_STRING_CHARS ? value.slice(0, MAX_STRING_CHARS) : value;', replace: '    return value;' },
    { rule: RULE.noSuppress, rel: WORKER_REL, find: '    const admitted = top.events.map(admitEvent);', replace: "    globalThis.__plantSent = (globalThis.__plantSent ?? 0) + 1;\n    if (globalThis.__plantSent > 60) return discard(200, 'throttled_in_worker_cap');\n    const admitted = top.events.map(admitEvent);" },
    { rule: RULE.unauthDownload, rel: WORKER_REL, find: '    if (!authorized(shape.headers?.authorization, env)) return empty(401);', replace: '' },
    { rule: RULE.wrongSecret, rel: WORKER_REL, find: "    return constantTimeEqual(header.slice('Bearer '.length), expected);", replace: "    return header.startsWith('Bearer ');" },
    { rule: RULE.malformedAuthed, rel: WORKER_REL, find: ' || !Number.isInteger(count) || count < 0', replace: '' },
    { rule: RULE.duplicateAssetDay, rel: WORKER_REL, find: '"download_count" = excluded."download_count"', replace: '"download_count" = "download_count"' },
    { rule: RULE.synthetic, rel: WORKER_REL, find: `const SELECT_MAINTAINER = 'SELECT * FROM events WHERE "synthetic" = 0 ORDER BY "id"';`, replace: `const SELECT_MAINTAINER = 'SELECT * FROM events ORDER BY "id"';` },
    { rule: RULE.retention, rel: WORKER_REL, find: 'export const RETENTION_DAYS = 30;', replace: 'export const RETENTION_DAYS = 3650;' },
    { rule: RULE.contract, rel: WORKER_REL, find: '    const data = event.data ?? {};', replace: '    const data = event;' },
    { rule: RULE.flat, rel: WORKER_REL, find: "    if (event.kind !== 'error') return event.kind === 'usage' ? null : undefined;\n", replace: '' },
    { rule: RULE.usage, rel: WORKER_REL, find: "    if (event.kind !== 'error') return event.kind === 'usage' ? null : undefined;\n", replace: '' },
    { rule: RULE.contract, rel: SENDER_REL, find: 'this.queue.push({ kind, name, data, at: this.nowFn() });', replace: 'this.queue.push({ kind, name, ...data, at: this.nowFn() });' },
    { rule: RULE.contract, rel: SENDER_REL, find: 'this.queue.push({ kind, name, data, at: this.nowFn() });', replace: 'this.queue.push({ kind, name, payload: data, at: this.nowFn() });' },
    { rule: RULE.content, rel: WORKER_REL, find: '        if (!valueOk(wire, value)) return undefined;\n', replace: '' },
    { rule: RULE.shapes, rel: WORKER_REL, find: "    source: /^[\\w.-]{1,100}$/,", replace: '    source: /^.{1,100}$/,' },
    { rule: RULE.cors, rel: WORKER_REL, find: "        if (path === EVENTS_PATH && request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin, true) });\n", replace: '' },
    { rule: RULE.cors, rel: WORKER_REL, find: "        const cors = path === EVENTS_PATH ? corsHeaders(origin, false) : {};", replace: '        const cors = corsHeaders(origin, false);' },
    { rule: RULE.cors, rel: WORKER_REL, find: "        const cors = path === EVENTS_PATH ? corsHeaders(origin, false) : {};", replace: '        const cors = {};' },
    { rule: RULE.cors, rel: WORKER_REL, find: 'export const CORS_ORIGIN = /^http:\\/\\/127\\.0\\.0\\.1:\\d{1,5}$/;', replace: 'export const CORS_ORIGIN = /^http:\\/\\/localhost:\\d{1,5}$/;' },
    { rule: RULE.workersDev, rel: WRANGLER_REL, find: 'workers_dev = false', replace: 'workers_dev = true' },
    { rule: RULE.workersDev, rel: WRANGLER_REL, find: 'preview_urls = false\n', replace: '' },
    { rule: RULE.admitted, rel: WORKER_REL, find: "export const ADMITTED_KEYS = Object.freeze(['type', 'source', 'line', 'column', 'version', 'buildID', 'os']);", replace: "export const ADMITTED_KEYS = Object.freeze(['type', 'source', 'line', 'column', 'version', 'buildID', 'os', 'message']);" },
    { rule: RULE.schemaColumn, rel: SCHEMA_REL, find: '  "column" INTEGER,\n', replace: '' },
    { rule: RULE.noRoutes, rel: WRANGLER_REL, find: 'compatibility_date = "2026-10-31"', replace: 'compatibility_date = "2026-10-31"\nroutes = ["events.powerbrowser.org/events"]' },
    { rule: RULE.credential, rel: WORKER_REL, find: 'export const DAY_MS = 86_400_000;', replace: "export const DAY_MS = 86_400_000;\nconst DOWNLOAD_COUNT_SECRET = 'plant-value';" },
];

async function selfTest() {
    let failed = 0;
    const complain = (name, why) => {
        console.error(`${NAME}: --self-test FAIL -- '${name}' ${why}`);
        failed += 1;
    };

    const secret = randomUUID();
    const control = await runAll(REPO_ROOT, secret);
    if (control.length > 0) {
        complain(RULE.control, `is already red, so the plants below would mean nothing: ${control.join(' | ')}`);
    } else {
        console.log(`  ok  unmutated control -> the Worker holds every contract literal, the store is empty after each rejection`);
    }

    for (const plant of PLANTS) {
        const dir = mkdtempSync(join(tmpdir(), 'events-worker-selftest-'));
        try {
            stage(dir);
            const target = join(dir, plant.rel);
            const before = readFileSync(target, 'utf8');
            if (!before.includes(plant.find)) {
                complain(plant.rule, `planted no fault at all: the drift text was not found in ${plant.rel}`);
                continue;
            }
            writeFileSync(target, before.replace(plant.find, plant.replace), 'utf8');
            // The credential plant appends a value, so the directory scan is the one that must fire.
            const failures = await runAll(dir, secret);
            if (!failures.some(f => f.includes(plant.rule))) {
                complain(plant.rule, `did not go red naming '${plant.rule}'; got: ${failures.join(' | ') || '(no failures at all)'}`);
            } else {
                console.log(`  ok  ${plant.rule} -> red, naming '${plant.rule}'`);
            }
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    }

    // The privacy page states another retention: red naming the retention rule.
    {
        const dir = mkdtempSync(join(tmpdir(), 'events-worker-selftest-'));
        try {
            stage(dir);
            const target = join(dir, PRIVACY_REL);
            const before = readFileSync(target, 'utf8');
            const drifted = before.replace('kept for 30 days', 'kept for 14 days');
            if (drifted === before) {
                complain(RULE.retention, 'planted no fault at all: the privacy retention text was not found');
            } else {
                writeFileSync(target, drifted, 'utf8');
                const failures = await runAll(dir, secret);
                if (!failures.some(f => f.includes(RULE.retention) && f.includes(PRIVACY_REL))) complain(RULE.retention, `the privacy page drift did not go red naming the rule; got: ${failures.join(' | ')}`);
                else console.log(`  ok  privacy retention drift -> red, naming '${RULE.retention}'`);
            }
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    }

    if (failed > 0) return 1;
    console.log(`${NAME}: --self-test PASS -- control green and ${PLANTS.length + 1} planted faults each red naming their rule`);
    return 0;
}

if (SELF_TEST) {
    process.exit(await selfTest());
} else {
    await main();
}
