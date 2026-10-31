#!/usr/bin/env node
// scripts/verify-worker-submit.mjs
//
// The crash-submit contract gate (Phase 57, TEL-07). The receiver worker/crash-submit.mjs must speak the
// collector's contract (scripts/crash-collector.mjs, docs/CRASH-POLICY.md) for every name the two share,
// and its R2 descriptors must state the retention and the no-credential, no-throttle posture the policy
// names. The gate needs no socket and no network: it drives synthetic Requests into the Worker's real
// fetch handler against an in-memory R2 stub.
//
// WHAT IT ASSERTS. Every expectation is read from the tree at check time:
//  1. Shared names are equal. Every export the Worker and the collector both declare is compared by value
//     (arrays by content). The contract names the Worker must declare are listed once here, and a missing
//     one goes red naming it.
//  2. Parser agreement. Both parsers run over one battery of multipart bodies (well-formed with a binary
//     minidump that contains the boundary bytes, wrong content type, no minidump, zero parts, too many
//     parts, one oversized part, a malformed extra). Verdicts, reasons, part names and part bytes must match.
//  3. Handler verdicts. The Worker's fetch answers the collector's status and body for each rejection,
//     stores nothing on any rejection, stores the minidump and the allowlisted record on accept, and keeps
//     both concurrent submits.
//  4. Descriptors. worker/wrangler-crash.toml keeps workers_dev and preview_urls off, binds the R2 store,
//     and schedules no job. worker/crash-r2-lifecycle.json holds exactly one rule over CRASH_PREFIX whose
//     age is RETENTION_DAYS. The Worker source has no in-Worker throttle rule and no CORS header.
//  5. No credential. No file in worker/ assigns a credential-shaped value.
//
// SELF-TEST. The unmutated tree is green first. Then each plant goes red naming its rule: a handler
// plant feeds the real fetch a faulty input and requires its named verdict; a descriptor plant rewrites a
// copy of the descriptor in a mkdtemp root and requires the named key. Every rejection plant also proves
// nothing reached the store.
//
// Honestly --quick: in-process Requests and an in-memory store. No build, no browser, no display, no network.
//
// Usage:
//   node scripts/verify-worker-submit.mjs
//   node scripts/verify-worker-submit.mjs --self-test

import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import * as collector from './crash-collector.mjs';
import worker, * as crashSubmit from '../worker/crash-submit.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'verify-worker-submit';
const args = process.argv.slice(2);
const SELF_TEST = args.includes('--self-test');
const WORKER_DIR_REL = 'worker';
const TOML_REL = 'worker/wrangler-crash.toml';
const LIFECYCLE_REL = 'worker/crash-r2-lifecycle.json';
const SOURCE_REL = 'worker/crash-submit.mjs';
const SUBMIT_URL = 'https://crash.example.org/submit';
const BOUNDARY = 'GSDCRASHSUBMITBOUNDARY';
const CONTENT_TYPE = `multipart/form-data; boundary=${BOUNDARY}`;
const NOW = 1720000000000;

/** The contract names the Worker must declare: the wire vocabulary the policy page states. */
const REQUIRED_CONTRACT_NAMES = Object.freeze([
    'SUBMIT_PATH',
    'MINIDUMP_PART_NAME',
    'EXTRA_PART_NAME',
    'REASON_WRONG_CONTENT_TYPE',
    'REASON_NO_MINIDUMP',
    'REASON_OVERSIZED',
    'REASON_STORE_UNAVAILABLE',
    'MAX_PARTS',
    'MAX_PART_MIB',
    'MAX_BODY_MIB',
    'RETENTION_DAYS',
    'ANNOTATION_ALLOWLIST',
    'MAX_ANNOTATION_BYTES',
    'MIN_BOUNDARY_LENGTH',
    'MAX_BOUNDARY_LENGTH',
    'MAX_HEADER_BYTES',
    'MAX_PART_NAME_LENGTH',
    'RECORDABLE_PART_NAMES',
    'OTHER_PART_NAME',
]);

// --- the multipart builder (the same framing both parsers read) ----------------

function buildMultipart(parts) {
    const chunks = [];
    for (const part of parts) {
        chunks.push(Buffer.from(
            `--${BOUNDARY}\r\n`
            + `Content-Disposition: ${part.disposition ?? `form-data; name="${part.name}"${part.filename ? `; filename="${part.filename}"` : ''}`}\r\n`
            + (part.extraHeader ? `${part.extraHeader}\r\n` : '')
            + `Content-Type: ${part.contentType ?? 'application/octet-stream'}\r\n\r\n`,
            'latin1',
        ));
        chunks.push(Buffer.isBuffer(part.data) ? part.data : Buffer.from(part.data));
        chunks.push(Buffer.from('\r\n', 'latin1'));
    }
    chunks.push(Buffer.from(`--${BOUNDARY}--\r\n`, 'latin1'));
    return Buffer.concat(chunks);
}

/**
 * A minidump-shaped payload: binary bytes that carry the boundary text WITHOUT the CRLF anchor. A naive
 * split on the bare boundary would mis-parse it; both parsers split only on the CRLF-anchored delimiter.
 * (A payload that carries the full CRLF-anchored delimiter is invalid multipart and is not a fixture.)
 */
function binaryDump() {
    return Buffer.concat([
        Buffer.from([0x4d, 0x44, 0x4d, 0x50, 0x00, 0xff, 0x0d, 0x0a, 0x78]),
        Buffer.from(`--${BOUNDARY}-not-a-delimiter\n`, 'latin1'),
        Buffer.alloc(256, 0x7f),
    ]);
}

const GECKO_EXTRA = JSON.stringify({
    ProductName: 'PowerBrowser',
    Version: '1.6.0',
    BuildID: '20261031000000',
    Platform: 'Linux',
    ReleaseChannel: 'release',
    CrashTime: '1761900000',
    NotAllowlisted: 'dropped',
    Nested: { a: 1 },
});

const WELL_FORMED_PARTS = () => [
    { name: crashSubmit.MINIDUMP_PART_NAME, filename: 'crash.dmp', data: binaryDump() },
    { name: crashSubmit.EXTRA_PART_NAME, filename: 'extra.json', contentType: 'application/json', data: GECKO_EXTRA },
];

// --- the shared battery both parsers run over -----------------------------------

function battery() {
    return [
        { name: 'well-formed', bytes: buildMultipart(WELL_FORMED_PARTS()), ct: CONTENT_TYPE },
        { name: 'wrong content type', bytes: buildMultipart(WELL_FORMED_PARTS()), ct: 'text/plain' },
        { name: 'no minidump', bytes: buildMultipart([WELL_FORMED_PARTS()[1]]), ct: CONTENT_TYPE },
        { name: 'zero parts', bytes: Buffer.alloc(0), ct: CONTENT_TYPE },
        {
            name: 'too many parts',
            bytes: buildMultipart([
                ...Array.from({ length: crashSubmit.MAX_PARTS }, (_, i) => ({ name: `p${i}`, data: 'x' })),
                { name: crashSubmit.MINIDUMP_PART_NAME, data: binaryDump() },
            ]),
            ct: CONTENT_TYPE,
        },
        {
            name: 'oversized part',
            bytes: buildMultipart([{ name: crashSubmit.MINIDUMP_PART_NAME, data: Buffer.alloc(crashSubmit.MAX_PART_BYTES + 1, 0x41) }]),
            ct: CONTENT_TYPE,
        },
        {
            name: 'malformed extra',
            bytes: buildMultipart([
                { name: crashSubmit.MINIDUMP_PART_NAME, data: binaryDump() },
                { name: crashSubmit.EXTRA_PART_NAME, data: '{"ProductName":"PowerBrowser",' },
            ]),
            ct: CONTENT_TYPE,
        },
        ...hostileBattery(),
    ];
}

/** WR-01 and WR-02: inputs that smuggle a name, a long string, a second minidump, or a delimiter flood. */
function hostileBattery() {
    const dump = { name: crashSubmit.MINIDUMP_PART_NAME, data: binaryDump() };
    return [
        {
            // filename= before name=: the real name is zzz, so there is no minidump part.
            name: 'filename before name',
            bytes: buildMultipart([{ disposition: `form-data; filename="${crashSubmit.MINIDUMP_PART_NAME}"; name="zzz"`, data: binaryDump() }, WELL_FORMED_PARTS()[1]]),
            ct: CONTENT_TYPE,
        },
        {
            // A quoted filename that contains "; name=": the name parameter after it is the real one.
            name: 'name inside a quoted filename',
            bytes: buildMultipart([{ disposition: `form-data; filename="a; name=zzz"; name="${crashSubmit.MINIDUMP_PART_NAME}"`, data: binaryDump() }]),
            ct: CONTENT_TYPE,
        },
        {
            name: 'repeated name parameter',
            bytes: buildMultipart([{ disposition: `form-data; name="${crashSubmit.MINIDUMP_PART_NAME}"; name="zzz"`, data: binaryDump() }]),
            ct: CONTENT_TYPE,
        },
        {
            name: 'x-prefixed disposition header',
            bytes: buildMultipart([{ disposition: 'form-data; name="zzz"', extraHeader: `X-Content-Disposition: form-data; name="${crashSubmit.MINIDUMP_PART_NAME}"`, data: binaryDump() }]),
            ct: CONTENT_TYPE,
        },
        {
            name: 'very long part name',
            bytes: buildMultipart([dump, { name: 'N'.repeat(100000), data: 'x' }, WELL_FORMED_PARTS()[1]]),
            ct: CONTENT_TYPE,
        },
        {
            name: 'very long header block',
            bytes: buildMultipart([dump, { name: 'ProductName', extraHeader: `X-Pad: ${'a'.repeat(5000)}`, data: 'PowerBrowser' }]),
            ct: CONTENT_TYPE,
        },
        {
            name: 'two minidump parts',
            bytes: buildMultipart([dump, { name: crashSubmit.MINIDUMP_PART_NAME, data: binaryDump() }]),
            ct: CONTENT_TYPE,
        },
        {
            name: 'one-character boundary',
            bytes: Buffer.from('\r\n--a'.repeat(100000), 'latin1'),
            ct: 'multipart/form-data; boundary=a',
        },
        {
            name: 'delimiter flood',
            bytes: Buffer.from('\r\n--abc'.repeat(100000), 'latin1'),
            ct: 'multipart/form-data; boundary=abc',
        },
        {
            name: 'boundary over the RFC limit',
            bytes: buildMultipart([dump]),
            ct: `multipart/form-data; boundary=${'b'.repeat(crashSubmit.MAX_BOUNDARY_LENGTH + 1)}`,
        },
    ];
}

/** Parser agreement over the battery: same ok, same reason, same part names, same part bytes. */
function parserDisagreements() {
    const problems = [];
    for (const item of battery()) {
        const fromCollector = collector.parseMultipart(Buffer.from(item.bytes), item.ct);
        const fromWorker = crashSubmit.parseMultipart(new Uint8Array(item.bytes), item.ct);
        if (fromCollector.ok !== fromWorker.ok) {
            problems.push(`${item.name}: collector ok=${fromCollector.ok} but Worker ok=${fromWorker.ok}`);
            continue;
        }
        if (!fromCollector.ok) {
            if (fromCollector.reason !== fromWorker.reason) {
                problems.push(`${item.name}: collector reason ${fromCollector.reason} but Worker reason ${fromWorker.reason}`);
            }
            continue;
        }
        const names = (parts) => parts.map(part => part.name).join(',');
        if (names(fromCollector.parts) !== names(fromWorker.parts)) {
            problems.push(`${item.name}: part names differ (${names(fromCollector.parts)} vs ${names(fromWorker.parts)})`);
            continue;
        }
        fromCollector.parts.forEach((part, i) => {
            if (!Buffer.from(fromWorker.parts[i].data).equals(part.data)) {
                problems.push(`${item.name}: part ${part.name} bytes differ between the parsers`);
            }
        });
    }
    return problems;
}

/** Shared names: every export both modules declare is equal by value, and every contract name is declared. */
function sharedNameDisagreements() {
    const problems = [];
    for (const name of REQUIRED_CONTRACT_NAMES) {
        if (!(name in crashSubmit)) problems.push(`the Worker does not export the contract name ${name}`);
    }
    for (const name of Object.keys(crashSubmit)) {
        if (!(name in collector)) continue;
        const a = JSON.stringify(crashSubmit[name]);
        const b = JSON.stringify(collector[name]);
        if (a !== b) problems.push(`${name}: the Worker has ${a} but the collector has ${b}`);
    }
    return problems;
}

// --- the in-memory R2 stub and the synthetic Request --------------------------------

function memoryStore({ failOn = null } = {}) {
    const objects = new Map();
    return {
        objects,
        async put(key, value) {
            if (failOn !== null && key.endsWith(failOn)) throw new Error('simulated store fault');
            objects.set(key, value instanceof Uint8Array ? value.slice() : value);
        },
        async delete(key) {
            objects.delete(key);
        },
    };
}

function submitRequest(bytes, { ct = CONTENT_TYPE, method = 'POST', path = '/submit' } = {}) {
    const init = { method, headers: { 'content-type': ct } };
    if (method !== 'GET') init.body = bytes;
    return new Request(`https://crash.example.org${path}`, init);
}

async function drive(request, store) {
    const response = await worker.fetch(request, { CRASH_STORE: store });
    return { status: response.status, body: await response.text(), allow: response.headers.get('allow') };
}

// --- the handler checks ---------------------------------------------------------------

/** Each entry: a name, the request, the expected verdict, and whether the store must stay empty. */
function rejectionCases() {
    const big = Buffer.alloc(crashSubmit.MAX_BODY_BYTES + 1, 0x41);
    return [
        {
            rule: 'malformed content-type',
            request: () => submitRequest(buildMultipart(WELL_FORMED_PARTS()), { ct: 'text/plain' }),
            status: 400, body: `Discarded=${crashSubmit.REASON_WRONG_CONTENT_TYPE}`,
        },
        {
            rule: 'missing minidump',
            request: () => submitRequest(buildMultipart([WELL_FORMED_PARTS()[1]])),
            status: 400, body: `Discarded=${crashSubmit.REASON_NO_MINIDUMP}`,
        },
        {
            rule: 'zero parts',
            request: () => submitRequest(Buffer.alloc(0)),
            status: 400, body: `Discarded=${crashSubmit.REASON_NO_MINIDUMP}`,
        },
        {
            rule: 'oversized body',
            request: () => submitRequest(big),
            status: 413, body: `Discarded=${crashSubmit.REASON_OVERSIZED}`,
        },
        {
            rule: 'oversized part',
            request: () => submitRequest(buildMultipart([{ name: crashSubmit.MINIDUMP_PART_NAME, data: Buffer.alloc(crashSubmit.MAX_PART_BYTES + 1, 0x41) }])),
            status: 413, body: `Discarded=${crashSubmit.REASON_OVERSIZED}`,
        },
        {
            rule: 'part count',
            request: () => submitRequest(buildMultipart([
                ...Array.from({ length: crashSubmit.MAX_PARTS + 1 }, (_, i) => ({ name: `p${i}`, data: 'x' })),
                { name: crashSubmit.MINIDUMP_PART_NAME, data: binaryDump() },
            ])),
            status: 413, body: `Discarded=${crashSubmit.REASON_OVERSIZED}`,
        },
        {
            rule: 'filename before name',
            request: () => submitRequest(buildMultipart([{ disposition: `form-data; filename="${crashSubmit.MINIDUMP_PART_NAME}"; name="zzz"`, data: binaryDump() }])),
            status: 400, body: `Discarded=${crashSubmit.REASON_NO_MINIDUMP}`,
        },
        {
            rule: 'two minidump parts',
            request: () => submitRequest(buildMultipart([
                { name: crashSubmit.MINIDUMP_PART_NAME, data: binaryDump() },
                { name: crashSubmit.MINIDUMP_PART_NAME, data: binaryDump() },
            ])),
            status: 400, body: `Discarded=${crashSubmit.REASON_NO_MINIDUMP}`,
        },
        {
            rule: 'empty minidump',
            request: () => submitRequest(buildMultipart([{ name: crashSubmit.MINIDUMP_PART_NAME, data: Buffer.alloc(0) }])),
            status: 400, body: `Discarded=${crashSubmit.REASON_NO_MINIDUMP}`,
        },
        {
            rule: 'minidump without the MDMP signature',
            request: () => submitRequest(buildMultipart([{ name: crashSubmit.MINIDUMP_PART_NAME, data: Buffer.alloc(64, 0x41) }])),
            status: 400, body: `Discarded=${crashSubmit.REASON_NO_MINIDUMP}`,
        },
        {
            rule: 'one-character boundary',
            request: () => submitRequest(Buffer.from('\r\n--a'.repeat(100000), 'latin1'), { ct: 'multipart/form-data; boundary=a' }),
            status: 400, body: `Discarded=${crashSubmit.REASON_WRONG_CONTENT_TYPE}`,
        },
        {
            rule: 'delimiter flood',
            request: () => submitRequest(Buffer.from('\r\n--abc'.repeat(100000), 'latin1'), { ct: 'multipart/form-data; boundary=abc' }),
            status: 413, body: `Discarded=${crashSubmit.REASON_OVERSIZED}`,
        },
        {
            rule: 'wrong method',
            request: () => submitRequest(null, { method: 'GET' }),
            status: 405, body: '', allow: 'POST',
        },
    ];
}

/** Checks that a store-less accept and every rejection behave as the contract states. */
async function handlerProblems() {
    const problems = [];
    for (const item of rejectionCases()) {
        const store = memoryStore();
        const verdict = await drive(item.request(), store);
        if (verdict.status !== item.status || verdict.body !== item.body) {
            problems.push(`${item.rule}: answered ${verdict.status} ${JSON.stringify(verdict.body)}, want ${item.status} ${JSON.stringify(item.body)}`);
        }
        if (item.allow !== undefined && verdict.allow !== item.allow) {
            problems.push(`${item.rule}: Allow is ${JSON.stringify(verdict.allow)}, want ${JSON.stringify(item.allow)}`);
        }
        if (store.objects.size !== 0) problems.push(`${item.rule}: stored ${store.objects.size} object(s) on a rejection`);
    }
    const other = await drive(submitRequest(Buffer.alloc(0), { path: '/elsewhere' }), memoryStore());
    if (other.status !== 404) problems.push(`a path other than /submit answered ${other.status}, want 404`);
    return problems;
}

async function acceptProblems() {
    const problems = [];
    const store = memoryStore();
    const verdict = await drive(submitRequest(buildMultipart(WELL_FORMED_PARTS())), store);
    const match = /^CrashID=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.exec(verdict.body);
    if (verdict.status !== 200 || !match) {
        problems.push(`well-formed submit answered ${verdict.status} ${JSON.stringify(verdict.body)}, want 200 CrashID=<uuid>`);
        return problems;
    }
    const id = match[1];
    if (!store.objects.has(`${crashSubmit.CRASH_PREFIX}${id}.dmp`) || !store.objects.has(`${crashSubmit.CRASH_PREFIX}${id}.json`)) {
        problems.push(`the accept did not store both ${crashSubmit.CRASH_PREFIX}${id}.dmp and .json`);
        return problems;
    }
    const record = JSON.parse(store.objects.get(`${crashSubmit.CRASH_PREFIX}${id}.json`));
    const want = ['BuildID', 'CrashTime', 'Platform', 'ProductName', 'ReleaseChannel', 'Version'];
    if (JSON.stringify(Object.keys(record.annotations).sort()) !== JSON.stringify(want)) {
        problems.push(`the record kept annotations ${JSON.stringify(Object.keys(record.annotations).sort())}, want exactly the allowlisted scalars ${JSON.stringify(want)}`);
    }
    problems.push(...recordShapeProblems(record));
    if (record.id !== id || record.minidumpBytes !== binaryDump().length) {
        problems.push('the record id or minidump byte count does not match the accepted submit');
    }
    if (store.objects.get(`${crashSubmit.CRASH_PREFIX}${id}.dmp`).byteLength !== binaryDump().length) {
        problems.push('the stored minidump is not the bytes the part carried');
    }
    return problems;
}

/** The stored record carries only server-made fields, allowlisted annotation keys, and known part names. */
function recordShapeProblems(record) {
    const problems = [];
    const keys = Object.keys(record).sort().join(',');
    if (keys !== 'annotations,id,minidumpBytes,partNames,receivedAt') problems.push(`the record has keys ${keys}, want only annotations,id,minidumpBytes,partNames,receivedAt`);
    for (const key of Object.keys(record.annotations ?? {})) {
        if (!crashSubmit.ANNOTATION_ALLOWLIST.includes(key)) problems.push(`the record annotation ${JSON.stringify(key)} is not on the allowlist`);
    }
    for (const name of record.partNames ?? []) {
        if (!crashSubmit.RECORDABLE_PART_NAMES.includes(name) && name !== crashSubmit.OTHER_PART_NAME) problems.push(`the record stores the client part name ${JSON.stringify(String(name).slice(0, 40))}`);
    }
    return problems;
}

/** Hostile names reach the parser but never the bucket: a 100 KB part name is dropped, not stored. */
async function hostileNameProblems() {
    const problems = [];
    const store = memoryStore();
    const verdict = await drive(submitRequest(buildMultipart([
        { name: crashSubmit.MINIDUMP_PART_NAME, data: binaryDump() },
        { name: 'N'.repeat(100), data: 'x' },
        { name: 'Q'.repeat(100000), data: 'x' },
    ])), store);
    const id = /^CrashID=(.+)$/.exec(verdict.body)?.[1];
    if (verdict.status !== 200 || !id) return [`a hostile part name changed the verdict: ${verdict.status} ${JSON.stringify(verdict.body)}, want 200 CrashID=`];
    const text = store.objects.get(`${crashSubmit.CRASH_PREFIX}${id}.json`);
    if (text.length > 2048) problems.push(`the record is ${text.length} bytes after hostile part names, want it bounded`);
    problems.push(...recordShapeProblems(JSON.parse(text)));
    return problems;
}

/**
 * WR-02: peak memory of the Worker's own fetch handler on an 18 MiB body of 3-character delimiters, in a child
 * process so the peak is a clean high-water mark. The control is the same body refused at the content-type check
 * (it still reads the whole body), so the difference is what the parse itself allocates.
 */
const FLOOD_PROBE = `
import { pathToFileURL } from 'node:url';
const worker = (await import(pathToFileURL(process.argv[1]).href)).default;
const boundary = process.argv[2];
const delim = Buffer.from('\\r\\n--abc');
const body = Buffer.alloc(18 * 1024 * 1024);
for (let i = 0; i + delim.length <= body.length; i += delim.length) delim.copy(body, i);
const store = { async put() {}, async delete() {} };
const res = await worker.fetch(new Request('https://crash.example.org/submit', { method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=' + boundary }, body }), { CRASH_STORE: store });
console.log(JSON.stringify({ status: res.status, maxRssMiB: Math.round(process.resourceUsage().maxRSS / 1024) }));
`;
export const FLOOD_BUDGET_MIB = 32;
function floodRun(workerPath, boundary) {
    const run = spawnSync(process.execPath, ['--input-type=module', '-e', FLOOD_PROBE, workerPath, boundary], { encoding: 'utf8' });
    if (run.status !== 0) return { error: `the probe exited ${run.status}: ${(run.stderr || '').trim().split('\n').pop()}` };
    return JSON.parse(run.stdout.trim().split('\n').pop());
}
function floodProblems(workerPath) {
    const flood = floodRun(workerPath, 'abc');
    const control = floodRun(workerPath, 'a');
    if (flood.error || control.error) return [`delimiter flood memory probe failed: ${flood.error ?? control.error}`];
    const problems = [];
    if (flood.status !== 413) problems.push(`an 18 MiB body of 3-character delimiters answered ${flood.status}, want 413`);
    if (flood.maxRssMiB - control.maxRssMiB > FLOOD_BUDGET_MIB) {
        problems.push(`an 18 MiB delimiter flood grew peak memory by ${flood.maxRssMiB - control.maxRssMiB} MiB over the same body refused up front (${flood.maxRssMiB} vs ${control.maxRssMiB} MiB), want at most ${FLOOD_BUDGET_MIB} MiB: the part-count cap must apply while scanning`);
    }
    return problems;
}

/** Store fault: the dump lands and the record write fails, so the dump is removed and nothing is stored. */
async function storeFaultProblems() {
    const problems = [];
    const store = memoryStore({ failOn: '.json' });
    const verdict = await drive(submitRequest(buildMultipart(WELL_FORMED_PARTS())), store);
    if (verdict.status !== 500 || verdict.body !== `Discarded=${crashSubmit.REASON_STORE_UNAVAILABLE}`) {
        problems.push(`a record write fault answered ${verdict.status} ${JSON.stringify(verdict.body)}, want 500 store_unavailable`);
    }
    if (store.objects.size !== 0) problems.push(`a record write fault left ${store.objects.size} orphaned object(s)`);
    return problems;
}

/** Concurrency and the no-throttle posture: two concurrent accepts keep distinct ids, and 61 in a row all accept. */
async function concurrencyProblems() {
    const problems = [];
    const store = memoryStore();
    const [a, b] = await Promise.all([
        drive(submitRequest(buildMultipart(WELL_FORMED_PARTS())), store),
        drive(submitRequest(buildMultipart(WELL_FORMED_PARTS())), store),
    ]);
    if (a.status !== 200 || b.status !== 200 || a.body === b.body) {
        problems.push(`two concurrent submits answered ${a.status}/${b.status} with ids ${a.body} and ${b.body}, want two distinct accepts`);
    }
    if (store.objects.size !== 4) problems.push(`two concurrent submits stored ${store.objects.size} object(s), want 4`);
    const burst = memoryStore();
    for (let i = 0; i < 61; i += 1) {
        const verdict = await drive(submitRequest(buildMultipart(WELL_FORMED_PARTS())), burst);
        if (verdict.status !== 200) {
            problems.push(`submit ${i + 1} in one minute answered ${verdict.status}; the Worker must not throttle in-process (the zone rule does)`);
            break;
        }
    }
    return problems;
}

// --- the descriptor checks (read from a root, so the self-test can plant a copy) ------

function descriptorProblems(root) {
    const problems = [];
    const toml = readFileSync(join(root, TOML_REL), 'utf8');
    if (!/^workers_dev\s*=\s*false\s*$/m.test(toml)) problems.push(`${TOML_REL} must state workers_dev = false (the zone rule cannot cover a workers.dev URL)`);
    if (!/^preview_urls\s*=\s*false\s*$/m.test(toml)) problems.push(`${TOML_REL} must state preview_urls = false`);
    if (!/binding\s*=\s*"CRASH_STORE"/.test(toml)) problems.push(`${TOML_REL} must bind the R2 store as CRASH_STORE`);
    if (/^\s*crons\s*=/m.test(toml) || /\[triggers\]/.test(toml)) problems.push(`${TOML_REL} schedules a job; retention is the R2 lifecycle rule, not a second job (crons)`);
    let lifecycle;
    try {
        lifecycle = JSON.parse(readFileSync(join(root, LIFECYCLE_REL), 'utf8'));
    } catch (err) {
        problems.push(`${LIFECYCLE_REL} does not parse: ${err && err.message}`);
        return problems;
    }
    const rules = Array.isArray(lifecycle.rules) ? lifecycle.rules : [];
    const rule = rules.find(r => r.prefix === crashSubmit.CRASH_PREFIX);
    if (rules.length !== 1 || !rule) problems.push(`${LIFECYCLE_REL} must hold exactly one rule over the ${crashSubmit.CRASH_PREFIX} prefix`);
    else if (rule.expire_days !== crashSubmit.RETENTION_DAYS || rule.enabled !== true) {
        problems.push(`${LIFECYCLE_REL} expire_days is ${JSON.stringify(rule.expire_days)}, want ${crashSubmit.RETENTION_DAYS} (RETENTION_DAYS) and enabled`);
    }
    const source = readFileSync(join(root, SOURCE_REL), 'utf8');
    if (source.includes('throttled_per_minute_cap')) problems.push(`${SOURCE_REL} names the throttle rule throttled_per_minute_cap in-process; the rate limit is the zone rule (Phase 48 WR-02)`);
    if (/access-control-|Access-Control-/i.test(source)) problems.push(`${SOURCE_REL} sends CORS headers; the sender is native, not a browser page`);
    for (const name of readdirSync(join(root, WORKER_DIR_REL))) {
        const text = readFileSync(join(root, WORKER_DIR_REL, name), 'utf8');
        if (/\b(secret|token|api[_-]?key|password|credential)\w*\s*[:=]\s*['"][^'"]+['"]/i.test(text)) {
            problems.push(`${WORKER_DIR_REL}/${name} assigns a credential-shaped value`);
        }
    }
    return problems;
}

async function runChecks(root) {
    const problems = [
        ...sharedNameDisagreements(),
        ...parserDisagreements(),
        ...(await handlerProblems()),
        ...(await acceptProblems()),
        ...(await hostileNameProblems()),
        ...floodProblems(resolve(root, SOURCE_REL)),
        ...(await storeFaultProblems()),
        ...(await concurrencyProblems()),
        ...descriptorProblems(root),
    ];
    return problems;
}

// --- main and self-test ------------------------------------------------------------------

async function main() {
    const problems = await runChecks(REPO_ROOT);
    if (problems.length > 0) {
        for (const p of problems) console.error(`${NAME}: FAIL -- ${p}`);
        console.error(`${NAME}: FAIL -- ${problems.length} problem(s). Next step: make the Worker and the collector speak one contract, then re-run this check.`);
        process.exit(1);
    }
    console.log(`${NAME}: PASS -- the Worker speaks the collector's contract, its verdicts and its descriptors hold`);
    process.exit(0);
}

async function selfTest() {
    let failed = 0;
    const complain = (rule, why) => {
        console.error(`${NAME}: --self-test FAIL -- '${rule}' ${why}`);
        failed += 1;
    };

    const control = await runChecks(REPO_ROOT);
    if (control.length > 0) {
        complain('unmutated control', `is already red, so the plants below would mean nothing: ${control.join(' | ')}`);
        process.exit(1);
    }
    console.log('  ok  unmutated control -> the Worker and the collector agree and every verdict holds');

    // Handler plants: each feeds the real fetch a faulty input and requires its named verdict. The rule
    // names are the contract's; a Worker that regressed on any one of them goes red naming it here.
    const plants = [
        ['malformed content-type', async () => {
            const v = await drive(submitRequest(buildMultipart(WELL_FORMED_PARTS()), { ct: 'text/plain' }), memoryStore());
            return v.status === 400 && v.body === `Discarded=${crashSubmit.REASON_WRONG_CONTENT_TYPE}`;
        }],
        ['missing minidump', async () => {
            const store = memoryStore();
            const v = await drive(submitRequest(buildMultipart([WELL_FORMED_PARTS()[1]])), store);
            return v.status === 400 && v.body === `Discarded=${crashSubmit.REASON_NO_MINIDUMP}` && store.objects.size === 0;
        }],
        ['oversized body', async () => {
            const store = memoryStore();
            const v = await drive(submitRequest(Buffer.alloc(crashSubmit.MAX_BODY_BYTES + 1, 0x41)), store);
            return v.status === 413 && v.body === `Discarded=${crashSubmit.REASON_OVERSIZED}` && store.objects.size === 0;
        }],
        ['non-allowlisted key dropped', async () => {
            const store = memoryStore();
            const v = await drive(submitRequest(buildMultipart(WELL_FORMED_PARTS())), store);
            const id = /^CrashID=(.+)$/.exec(v.body)?.[1];
            const record = id ? JSON.parse(store.objects.get(`${crashSubmit.CRASH_PREFIX}${id}.json`)) : null;
            return v.status === 200 && record !== null && record.annotations.NotAllowlisted === undefined && record.annotations.Nested === undefined;
        }],
        ['malformed extra kept', async () => {
            const store = memoryStore();
            const v = await drive(submitRequest(buildMultipart([
                { name: crashSubmit.MINIDUMP_PART_NAME, data: binaryDump() },
                { name: crashSubmit.EXTRA_PART_NAME, data: '{"ProductName":' },
            ])), store);
            const id = /^CrashID=(.+)$/.exec(v.body)?.[1];
            const record = id ? JSON.parse(store.objects.get(`${crashSubmit.CRASH_PREFIX}${id}.json`)) : null;
            return v.status === 200 && record !== null && Object.keys(record.annotations).length === 0 && store.objects.has(`${crashSubmit.CRASH_PREFIX}${id}.dmp`);
        }],
        ['store fault leaves nothing', async () => {
            const problems = await storeFaultProblems();
            return problems.length === 0;
        }],
    ];
    for (const [rule, probe] of plants) {
        const ok = await probe();
        if (!ok) complain(rule, 'did not hold: the Worker answered a faulty input with the wrong verdict or left a stored object');
        else console.log(`  ok  ${rule} -> the named verdict holds and nothing is stored`);
    }

    // Descriptor plants: a copy of the tree's worker descriptors, one fault each, must go red naming its key.
    const descriptorPlants = [
        ['workers_dev enabled', TOML_REL, text => text.replace('workers_dev = false', 'workers_dev = true'), 'workers_dev'],
        ['lifecycle age drifted', LIFECYCLE_REL, text => text.replace('"expire_days": 30', '"expire_days": 90'), 'expire_days'],
        ['second job scheduled', TOML_REL, text => `${text}\n[triggers]\ncrons = ["0 3 * * *"]\n`, 'crons'],
        ['in-process throttle answered', SOURCE_REL, text => `${text}\nconst THROTTLE = 'throttled_per_minute_cap';\n`, 'throttled_per_minute_cap'],
        ['credential assigned in worker/', SOURCE_REL, text => `${text}\nconst token = "abcdef0123456789";\n`, 'credential-shaped'],
    ];
    for (const [rule, rel, mutate, needle] of descriptorPlants) {
        const dir = mkdtempSync(join(tmpdir(), 'verify-worker-submit-selftest-'));
        try {
            for (const file of [TOML_REL, LIFECYCLE_REL, SOURCE_REL]) {
                mkdirSync(dirname(join(dir, file)), { recursive: true });
                copyFileSync(join(REPO_ROOT, file), join(dir, file));
            }
            const original = readFileSync(join(dir, rel), 'utf8');
            const mutated = mutate(original);
            if (mutated === original) {
                complain(rule, 'planted no fault at all: the mutation did not land');
                continue;
            }
            writeFileSync(join(dir, rel), mutated, 'utf8');
            const problems = descriptorProblems(dir);
            if (!problems.some(p => p.includes(needle))) complain(rule, `did not go red naming '${needle}'; got: ${problems.join(' | ') || '(no failures)'}`);
            else console.log(`  ok  ${rule} -> red, naming '${needle}'`);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    }

    if (failed > 0) {
        console.error(`${NAME}: --self-test FAIL -- ${failed} plant(s) did not behave as pinned`);
        process.exit(1);
    }
    console.log(`${NAME}: --self-test PASS -- control green first, then every planted fault went red naming its rule`);
    process.exit(0);
}

if (SELF_TEST) {
    await selfTest();
} else if (args.length === 0) {
    await main();
} else {
    console.error(`${NAME}: FAIL -- unknown argument ${JSON.stringify(args[0])}. Next step: run with no argument or --self-test.`);
    process.exit(2);
}
