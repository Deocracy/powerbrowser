#!/usr/bin/env node
// scripts/verify-telemetry-live-delivery.mjs
//
// The TEL-06 live row (Phase 48, plan 48-04, NAME tel06-error-delivery-live). Does a running sidecar deliver
// one corrected error report to an events endpoint, and does it deliver nothing at level off in the same run?
//
// THE CORRECTED PAYLOAD. The sender posts {"events": [ {kind, name, data, at} ]} as application/json, after a
// CORS preflight. Each error event's data carries only the admitted keys (type, source, line, column, version,
// buildID, os), each in its admitted shape. No message, stack, path, URL, cookie, account or identifier text
// rides the body. An uncaught error carries the position (the source basename, line, column); an unhandled
// rejection carries no position.
//
// THE MARKER. The drill's endpoint is http://127.0.0.1:<port>/pb-drill-events/events. The marker segment is in
// the rewritten tracked package.json and in the built bundle only while the drill runs. The drill restores the
// package.json byte-identical, rebuilds the bundle, and greps the built bundle for the marker: zero hits.
//
// THE SAME-RUN NEGATIVE HALF. The positive half proves the emitter fires. The level-off window that follows
// must observe zero requests. A zero-request window proves nothing alone, so the analyzer also fails when the
// positive half sent nothing.
//
// MODES.
//   node scripts/verify-telemetry-live-delivery.mjs              the full drill (tier full: a built frontend,
//                                                                 the nix theia shell, the built binary)
//   node scripts/verify-telemetry-live-delivery.mjs --self-test  the analyzer over fixtures (quick tier: no build,
//                                                                 no browser, no network). Control green first, then
//                                                                 each plant red naming its drift.
// Any other argument: FAIL, exit 2.

import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { corsHeaders, EVENTS_PATH, handleEvents } from '../worker/events-worker.mjs';
import { withFirefoxPage } from './lib/firefox-bidi.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'tel06-error-delivery-live';
const SELF_REL = 'scripts/verify-telemetry-live-delivery.mjs';
const ENRICH_REL = 'theia/extensions/telemetry/src/browser/telemetry-enrichment.ts';
const PREFS_REL = 'theia/extensions/telemetry/src/browser/telemetry-preferences.ts';
const PACKAGE_REL = 'theia/applications/browser/package.json';
const APP_REL = 'theia/applications/browser';
const BUNDLE_REL = 'theia/applications/browser/lib';
const MARKER = 'pb-drill-events';
const ENDPOINT_PATH = `/${MARKER}/events`;
const PROD_ENDPOINT = 'https://events.powerbrowser.org/events';
const UNCAUGHT = 'frontend.uncaught-error';
const REJECTION = 'frontend.unhandled-rejection';
const FORBIDDEN = Object.freeze(['message', 'stack', 'path', 'url', 'href', 'cookie', 'account', 'installid', 'useragent', 'filename', 'fullpath']);
const POSITION_KEYS = Object.freeze(['source', 'line', 'column']);
const ENVELOPE_KEYS = Object.freeze(['at', 'data', 'kind', 'name']);
const DRILL_TEXT = 'pb-drill-';

// The producer is the source of truth for the admitted keys, shapes and buckets (zero-dependency module).
const enrichment = await import(pathToFileURL(join(REPO_ROOT, ENRICH_REL)).href);
const { ADMITTED_KEYS, admittedValueOk } = enrichment;
// Derived from the producer's key set, not hand-kept: an uncaught error carries every admitted key; an unhandled
// rejection carries none of the position keys.
const UNCAUGHT_KEYS = Object.freeze([...ADMITTED_KEYS]);
const REJECTION_KEYS = Object.freeze(ADMITTED_KEYS.filter(k => !POSITION_KEYS.includes(k)));

/** A stub D1 that records the rows the Worker would store. */
function stubDb() {
    const rows = [];
    return { rows, prepare: () => ({ bind: (...values) => ({ values }) }), batch: async (statements) => { rows.push(...statements.map(x => x.values)); return []; } };
}

/**
 * Pure analyzer over the captured requests. captures: [{ method, url, headers, body, level }] in arrival
 * order. level is the arming level the drill held when the request arrived. Returns the failures, each with
 * a Next step. An empty list is green. Pure.
 */
export async function analyzeCapture(captures) {
    if (!Array.isArray(captures) || captures.length === 0) {
        return [`no capture at all: the drill observed no request from the sidecar. Next step: check the loopback endpoint and that the level was armed.`];
    }
    const failures = [];
    const offCount = captures.filter(c => c.level === 'off').length;
    if (offCount > 0) {
        failures.push(`${offCount} request(s) captured at level off, so telemetry left the sidecar with the level off. Next step: find the sender path that ran at level off.`);
    }
    const seenPreflight = new Set();
    const names = new Set();
    let positivePosts = 0;
    for (const c of captures) {
        if (c.method === 'OPTIONS') { seenPreflight.add(c.url); continue; }
        if (c.method !== 'POST' || c.level === 'off') continue;
        positivePosts += 1;
        if (!seenPreflight.has(c.url)) {
            failures.push(`POST to ${c.url} arrived with no CORS preflight before it. Next step: answer OPTIONS on the endpoint with the sidecar origin.`);
        }
        const contentType = String(c.headers?.['content-type'] ?? '').toLowerCase();
        if (!contentType.includes('application/json')) {
            failures.push(`POST with content-type ${JSON.stringify(contentType)}, not application/json. Next step: the sender must send application/json.`);
        }
        let body;
        try {
            body = JSON.parse(c.body);
        } catch {
            failures.push(`non-JSON body in the POST to ${c.url}. Next step: the sender must send the events envelope as JSON.`);
            continue;
        }
        if (body === null || typeof body !== 'object' || !Array.isArray(body.events)) {
            failures.push(`non-events-array body in the POST to ${c.url}: no events array. Next step: the sender must wrap the batch as {events: [...]}.`);
            continue;
        }
        for (const key of Object.keys(body)) {
            if (key !== 'events') failures.push(`top-level key ${key} in the POST body: only events may ride the envelope. Next step: drop it at the sender.`);
        }
        // The drill's own error messages must never appear anywhere in the raw body (message text is not collected).
        if (c.body.includes(DRILL_TEXT)) failures.push(`drill message text (${DRILL_TEXT}) in the POST body: error message text rides the wire. Next step: drop message text at the sender.`);
        // The captured body must be one the real Worker accepts and stores in full.
        const db = stubDb();
        const verdict = await handleEvents({ method: 'POST', path: EVENTS_PATH, headers: { 'content-type': contentType, authorization: '' }, body: c.body }, { DB: db }, { nowMs: 0 });
        if (verdict.status !== 200 || verdict.body !== `ok: stored ${body.events.length}`) {
            failures.push(`the Worker rejected or under-stored the captured body (${verdict.status} ${JSON.stringify(verdict.body)} for ${body.events.length} event(s)). Next step: the sender and the Worker disagree on the envelope.`);
        }
        for (const ev of body.events) {
            if (ev === null || typeof ev !== 'object') { failures.push('an event in the batch is not an object. Next step: the sender must send one envelope per event.'); continue; }
            for (const key of Object.keys(ev)) {
                if (!ENVELOPE_KEYS.includes(key)) failures.push(`event envelope key ${key} in event ${ev.name}: only ${ENVELOPE_KEYS.join(', ')} may ride the envelope (a message or stack outside data is still a leak). Next step: drop it at the sender.`);
            }
            for (const key of ENVELOPE_KEYS) {
                if (!(key in ev)) failures.push(`event envelope key ${key} is missing in event ${ev.name}. Next step: the sender must send {kind, name, data, at}.`);
            }
            if (ev.kind !== 'error') failures.push(`event kind ${JSON.stringify(ev.kind)} is not error; the drill sends error events only. Next step: check the sender's error path.`);
            if (typeof ev.name === 'string') names.add(ev.name);
            const data = ev.data !== null && typeof ev.data === 'object' ? ev.data : {};
            for (const key of Object.keys(data)) {
                if (FORBIDDEN.includes(key.toLowerCase())) {
                    failures.push(`forbidden field ${key} in event ${ev.name} carries message, stack, path, URL, cookie, account or identifier text. Next step: drop it at the sender.`);
                } else if (!ADMITTED_KEYS.includes(key)) {
                    failures.push(`unadmitted key ${key} in event ${ev.name}: only ${ADMITTED_KEYS.join(', ')} may ride the wire. Next step: drop it at the sender.`);
                }
            }
            if (typeof data.source === 'string' && (data.source.includes('/') || data.source.includes('\\'))) {
                failures.push(`full path in source of event ${ev.name}: ${JSON.stringify(data.source)} is not a basename. Next step: send the basename only.`);
            }
            for (const key of ADMITTED_KEYS) {
                if (data[key] === undefined) continue;
                if (!admittedValueOk(key, data[key])) {
                    const what = key === 'line' || key === 'column' ? 'non-number line or column' : `value of ${key} outside its admitted shape`;
                    failures.push(`${what} in event ${ev.name}. Next step: fix the producer's shape check.`);
                }
            }
            const required = ev.name === UNCAUGHT ? UNCAUGHT_KEYS : ev.name === REJECTION ? REJECTION_KEYS : null;
            if (ev.name === REJECTION) {
                for (const key of Object.keys(data)) {
                    if (POSITION_KEYS.includes(key)) failures.push(`position key ${key} on the unhandled rejection ${ev.name}: a rejection carries no position. Next step: drop it at the sender.`);
                }
            }
            if (required !== null) {
                for (const key of required) {
                    if (data[key] === undefined) failures.push(`event ${ev.name} lacks ${key}. Next step: the producer must enrich every report with ${key}.`);
                }
            }
        }
    }
    if (positivePosts === 0) {
        failures.push('no POST from the running sidecar at level error: the emitter did not fire. Next step: arm the level and re-run the drill.');
    } else {
        if (!names.has(UNCAUGHT)) failures.push(`no ${UNCAUGHT} event in the positive POST. Next step: check the window error listener.`);
        if (!names.has(REJECTION)) failures.push(`no ${REJECTION} event in the positive POST. Next step: check the unhandledrejection listener.`);
    }
    return failures;
}

function fixtureCaptures() {
    const origin = 'http://127.0.0.1:4000';
    const events = [
        { kind: 'error', name: UNCAUGHT, data: { type: 'Error', source: 'app.js', line: 12, column: 3, version: '153.5.1', buildID: 'v153.5.1-1', os: 'linux' }, at: 1 },
        { kind: 'error', name: REJECTION, data: { type: 'TypeError', version: '153.5.1', buildID: 'v153.5.1-1', os: 'linux' }, at: 2 },
    ];
    return {
        valid: [
            { method: 'OPTIONS', url: ENDPOINT_PATH, headers: { origin, 'access-control-request-method': 'POST' }, body: '', level: 'error' },
            { method: 'POST', url: ENDPOINT_PATH, headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ events }), level: 'error' },
        ],
        withEvents: events,
        origin,
    };
}

function withEventsBody(events) {
    const f = fixtureCaptures();
    return [f.valid[0], { ...f.valid[1], body: JSON.stringify({ events }) }];
}

function selfTest() {
    return selfTestAsync();
}

async function selfTestAsync() {
    const f = fixtureCaptures();
    const control = await analyzeCapture(f.valid);
    if (control.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- the unmutated control is already red, so the planted results would mean nothing:`);
        control.forEach(x => console.error(`  ${x}`));
        return 1;
    }
    console.log('  ok  control: one preflight and one POST carrying both corrected events -> green');
    const clone = () => JSON.parse(JSON.stringify(f.withEvents));
    const withData = (mutate, index = 0) => { const evs = clone(); mutate(evs[index].data); return withEventsBody(evs); };
    const withEvent = (mutate, index = 0) => { const evs = clone(); mutate(evs[index]); return withEventsBody(evs); };
    const withRawBody = (raw) => [f.valid[0], { ...f.valid[1], body: raw }];
    const withEnvelope = (mutate) => { const env = { events: clone() }; mutate(env); return withRawBody(JSON.stringify(env)); };
    const plants = [
        { name: 'a sidecar that sent no POST', captures: [f.valid[0]], expect: 'no POST from the running sidecar' },
        { name: 'a POST with no CORS preflight before it', captures: [f.valid[1]], expect: 'no CORS preflight' },
        { name: 'a text/plain content type', captures: [f.valid[0], { ...f.valid[1], headers: { ...f.valid[1].headers, 'content-type': 'text/plain' } }], expect: 'not application/json' },
        { name: 'a body that is not JSON', captures: withRawBody('not json'), expect: 'non-JSON body' },
        { name: 'a body with no events array', captures: withRawBody(JSON.stringify({ events: 'x' })), expect: 'non-events-array body' },
        { name: 'a top-level message beside the events', captures: withEnvelope(env => { env.message = 'pb-leak'; }), expect: 'top-level key message' },
        { name: 'a message beside data on the event envelope', captures: withEvent(ev => { ev.message = 'Error: x'; }), expect: 'event envelope key message' },
        { name: 'a stack beside data on the event envelope', captures: withEvent(ev => { ev.stack = 'at /home/chris/app.js:1:1'; }), expect: 'event envelope key stack' },
        { name: 'an event with no at', captures: withEvent(ev => { delete ev.at; }), expect: 'event envelope key at is missing' },
        { name: 'an event that is not an object', captures: withEnvelope(env => { env.events.push(7); }), expect: 'is not an object' },
        { name: 'a usage event in the error batch', captures: withEvent(ev => { ev.kind = 'usage'; }), expect: 'is not error' },
        { name: 'a stack field on the uncaught error', captures: withData(d => { d.stack = 'Error: x\n at /home/chris/app.js:12:3'; }), expect: 'forbidden field stack' },
        { name: 'a message field on the uncaught error', captures: withData(d => { d.message = 'boom'; }), expect: 'forbidden field message' },
        { name: 'an unadmitted key on the uncaught error', captures: withData(d => { d.extra = 'x'; }), expect: 'unadmitted key extra' },
        { name: 'a full path in the source field', captures: withData(d => { d.source = '/home/chris/Vibe Coding/app.js'; }), expect: 'full path in source' },
        { name: 'the drill message text in an admitted field', captures: withData(d => { d.source = 'pb-drill-uncaught.js'; }), expect: 'drill message text' },
        { name: 'a line sent as a string', captures: withData(d => { d.line = '12'; }), expect: 'non-number line or column' },
        { name: 'a version outside its admitted shape', captures: withData(d => { d.version = '1.2.3.4.5'; }), expect: 'outside its admitted shape' },
        { name: 'an uncaught error missing buildID', captures: withData(d => { delete d.buildID; }), expect: `event ${UNCAUGHT} lacks buildID` },
        { name: 'an unhandled rejection missing os', captures: withData(d => { delete d.os; }, 1), expect: `event ${REJECTION} lacks os` },
        { name: 'a position on the unhandled rejection', captures: withData(d => { d.line = 3; }, 1), expect: 'position key line on the unhandled rejection' },
        { name: 'a batch with only the uncaught error', captures: withEnvelope(env => { env.events.pop(); }), expect: `no ${REJECTION} event` },
        { name: 'a batch with only the unhandled rejection', captures: withEnvelope(env => { env.events.shift(); }), expect: `no ${UNCAUGHT} event` },
        { name: 'an event name the Worker rejects', captures: withEnvelope(env => { env.events.push({ kind: 'error', name: 'bad name!', data: {}, at: 3 }); }), expect: 'the Worker rejected or under-stored' },
        { name: 'an empty capture', captures: [], expect: 'no capture at all' },
        { name: 'a request captured at level off', captures: [...f.valid, { method: 'POST', url: ENDPOINT_PATH, headers: { origin: f.origin, 'content-type': 'application/json' }, body: JSON.stringify({ events: f.withEvents }), level: 'off' }], expect: 'captured at level off' },
    ];
    // The drill's own safety helpers: each runs the real function. The dirty-tree and stale-bundle faults are inputs the
    // helper must refuse; the restore faults are failures the drill must survive.
    const scratch = mkdtempSync(join(tmpdir(), 'telemetry-drill-'));
    const tracked = join(scratch, 'package.json');
    const original = '{"powerbrowserTelemetry": {"endpoint": "https://events.powerbrowser.org/events"}}\n';
    const bundle = join(scratch, 'lib');
    const safetyPlants = [
        { name: 'a dirty working tree', run: () => treeFailures(() => ' M theia/applications/browser/package.json\n'), expect: 'working tree is dirty' },
        { name: 'a stale bundle without the loopback marker', run: () => { writeBundle(bundle, 'var endpoint = "https://events.powerbrowser.org/events";'); return bundleFailures(bundle); }, expect: 'does not carry the loopback marker' },
    ];
    const safetyControls = [
        { name: 'control: a clean working tree is accepted', run: () => (treeFailures(() => '').length === 0 ? [] : ['a clean tree was refused']) },
        { name: 'control: a bundle carrying the marker is accepted', run: () => { writeBundle(bundle, `var endpoint = "http://127.0.0.1:1/${MARKER}/events";`); return bundleFailures(bundle); } },
        { name: 'control: the rewritten file is restored after a failure in the drill body', run: async () => {
            writeFileSync(tracked, original);
            try {
                await withRewrittenFile(tracked, 'rewritten\n', async () => { throw new Error('boom'); });
            } catch { /* the drill reports it */ }
            return readFileSync(tracked, 'utf8') === original ? [] : ['the tracked file was left rewritten after a failure'];
        } },
        { name: 'control: SIGINT and SIGTERM restore the rewritten file and exit non-zero', run: () => {
            const failures = [];
            for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143]]) {
                writeFileSync(tracked, original);
                let exited = null;
                const guard = armRewrite(tracked, 'rewritten\n', c => { exited = c; }, () => {});
                if (readFileSync(tracked, 'utf8') !== 'rewritten\n') failures.push('the rewrite was not applied');
                guard.onSignal(signal);
                if (readFileSync(tracked, 'utf8') !== original) failures.push(`the tracked file was left rewritten after ${signal}`);
                if (exited !== code) failures.push(`${signal} exited ${exited}, not ${code}`);
                guard.disarm();
            }
            return failures;
        } },
        { name: 'control: a normal drill leaves the file byte-identical and the handlers removed', run: async () => {
            writeFileSync(tracked, original);
            const before = process.listenerCount('SIGINT') + process.listenerCount('SIGTERM');
            await withRewrittenFile(tracked, 'rewritten\n', async () => { if (readFileSync(tracked, 'utf8') !== 'rewritten\n') throw new Error('not rewritten'); });
            const failures = [];
            if (readFileSync(tracked, 'utf8') !== original) failures.push('the tracked file differs after a normal drill');
            if (process.listenerCount('SIGINT') + process.listenerCount('SIGTERM') !== before) failures.push('signal handlers were leaked');
            return failures;
        } },
    ];
    let failed = 0;
    try {
        for (const c of safetyControls) {
            const failures = await c.run();
            if (failures.length === 0) console.log(`  ok  ${c.name} -> green`);
            else { console.error(`${NAME}: --self-test FAIL -- '${c.name}' went red: ${failures.join(' | ')}`); failed += 1; }
        }
        for (const p of safetyPlants) {
            const failures = await p.run();
            if (failures.some(x => x.includes(p.expect))) console.log(`  ok  ${p.name} -> red, naming '${p.expect}'`);
            else { console.error(`${NAME}: --self-test FAIL -- '${p.name}' did not go red naming '${p.expect}'; got: ${failures.join(' | ') || '(nothing)'}`); failed += 1; }
        }
    } finally {
        rmSync(scratch, { recursive: true, force: true });
    }
    for (const p of plants) {
        const failures = await analyzeCapture(p.captures);
        if (failures.some(x => x.includes(p.expect))) {
            console.log(`  ok  ${p.name} -> red, naming '${p.expect}'`);
        } else {
            console.error(`${NAME}: --self-test FAIL -- '${p.name}' did not go red naming '${p.expect}'; got: ${failures.join(' | ') || '(nothing)'}`);
            failed += 1;
        }
    }
    if (failed > 0) {
        console.error(`${NAME}: --self-test FAIL -- ${failed} case(s) did not go red or green as required`);
        return 1;
    }
    console.log(`${NAME}: --self-test PASS -- ${plants.length} analyzer plants and ${safetyPlants.length} drill-safety plants went red naming their drift, with the controls green first`);
    return 0;
}

// ---------------------------------------------------------------------------------------------
// The full drill. Tier full: needs the nix theia shell, the built frontend and the built binary.
// ---------------------------------------------------------------------------------------------

const GET_BY_NAME = `
function __getByName(container, name) {
    let found;
    container._bindingDictionary.traverse(key => {
        if (found) return;
        const keyStr = typeof key === 'symbol' ? key.toString() : (key && key.name) || String(key);
        if (keyStr === 'Symbol(' + name + ')' || keyStr === name) found = key;
    });
    if (!found) throw new Error('DI binding not found: ' + name);
    return container.get(found);
}`;

/** The working-tree guard: tracked files must be unmodified before the drill rewrites one. git: () => porcelain text. */
export function treeFailures(git = () => execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: REPO_ROOT, encoding: 'utf8' })) {
    const dirty = git().split('\n').filter(l => l.trim() !== '');
    return dirty.length === 0 ? [] : [`the working tree is dirty (${dirty.length} tracked change(s), first: ${dirty[0].trim()}); the drill rewrites a tracked file and rebuilds over the tree. Next step: commit or restore your changes, then re-run.`];
}

/** The built bundle must carry the loopback marker before the page is driven, so a stale bundle never posts to production. */
export function bundleFailures(dir) {
    return markerHits(dir) > 0 ? [] : [`the built bundle does not carry the loopback marker ${MARKER}, so the page would post to the production endpoint. Next step: rebuild the frontend with the rewritten package.json.`];
}

function writeBundle(dir, content) {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'frontend.js'), content);
}

/**
 * Rewrite a tracked file and promise to put the original bytes back: on a signal (SIGINT, SIGTERM), on process exit and
 * on disarm. The restore is synchronous, so a Ctrl-C in the middle of a multi-minute build cannot leave the loopback
 * endpoint in a file that can be committed. exit is injectable for the self-test.
 */
export function armRewrite(path, rewritten, exit = code => process.exit(code), log = console.error) {
    const original = readFileSync(path);
    let armed = true;
    const restore = () => { writeFileSync(path, original); };
    const onSignal = (signal) => {
        restore();
        log(`${NAME}: interrupted by ${signal}; ${path} was restored. The built bundle still carries the loopback endpoint: rebuild the frontend before using it.`);
        exit(signal === 'SIGINT' ? 130 : 143);
    };
    const sigint = () => onSignal('SIGINT');
    const sigterm = () => onSignal('SIGTERM');
    const onExit = () => { if (armed) restore(); };
    process.on('SIGINT', sigint);
    process.on('SIGTERM', sigterm);
    process.on('exit', onExit);
    writeFileSync(path, rewritten);
    return {
        onSignal,
        disarm() {
            if (armed) restore();
            armed = false;
            process.off('SIGINT', sigint);
            process.off('SIGTERM', sigterm);
            process.off('exit', onExit);
        },
    };
}

/** Run body with the file rewritten; the original bytes are back when it returns, throws or is interrupted. */
export async function withRewrittenFile(path, rewritten, body) {
    const guard = armRewrite(path, rewritten);
    try {
        return await body();
    } finally {
        guard.disarm();
    }
}

function buildFrontend() {
    execFileSync('nix', ['develop', '.#theia', '--command', 'bash', '-c', `cd "${join(REPO_ROOT, APP_REL)}" && yarn -s theia build --app-target=browser --mode development`], { cwd: REPO_ROOT, stdio: 'inherit' });
}

function markerHits(dir) {
    let hits = 0;
    for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) { hits += markerHits(path); continue; }
        if (!/\.(js|html|json|map|css)$/.test(entry)) continue;
        hits += readFileSync(path, 'utf8').split(MARKER).length - 1;
    }
    return hits;
}

function startLoopback(captures, state) {
    return new Promise((resolvePromise, reject) => {
        const server = createServer((req, res) => {
            const chunks = [];
            req.on('data', c => chunks.push(c));
            req.on('end', () => {
                if (req.url !== ENDPOINT_PATH) { res.writeHead(404); res.end(); return; }
                const origin = req.headers.origin;
                const body = Buffer.concat(chunks).toString('utf8');
                const headers = { ...req.headers };
                if (req.method === 'OPTIONS') {
                    captures.push({ method: 'OPTIONS', url: req.url, headers, body, level: state.level });
                    res.writeHead(204, corsHeaders(origin, true));
                    res.end();
                    return;
                }
                if (req.method === 'POST') {
                    captures.push({ method: 'POST', url: req.url, headers, body, level: state.level });
                    res.writeHead(200, { ...corsHeaders(origin, false), 'content-type': 'text/plain; charset=utf-8' });
                    res.end('ok');
                    return;
                }
                res.writeHead(405, { allow: 'POST, OPTIONS' });
                res.end();
            });
        });
        server.on('error', reject);
        server.listen(0, '127.0.0.1', () => resolvePromise({ port: server.address().port, close: () => server.close() }));
    });
}

async function pollUntil(predicate, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (predicate()) return true;
        await new Promise(r => setTimeout(r, 100));
    }
    return predicate();
}

async function fullDrill() {
    const failures = [];
    const dirty = treeFailures();
    if (dirty.length > 0) return { failures: dirty, captures: [] };
    const packagePath = join(REPO_ROOT, PACKAGE_REL);
    const original = readFileSync(packagePath);
    const text = original.toString('utf8');
    const levelKey = /TELEMETRY_LEVEL_PREFERENCE\s*=\s*'([^']+)'/.exec(readFileSync(join(REPO_ROOT, PREFS_REL), 'utf8'))?.[1];
    if (!levelKey) return { failures: ['broken instrument: TELEMETRY_LEVEL_PREFERENCE not found in telemetry-preferences.ts'], captures: [] };
    const captures = [];
    const state = { level: 'off' };
    let server;
    try {
        server = await startLoopback(captures, state);
        const copies = text.split(PROD_ENDPOINT).length - 1;
        if (copies !== 1) throw new Error(`the tracked package.json carries ${copies} copies of the production endpoint, not one. Next step: check the powerbrowserTelemetry block.`);
        // The rewrite is restored on a failure, on process exit and on SIGINT/SIGTERM (armRewrite), not only in a finally.
        await withRewrittenFile(packagePath, text.replace(PROD_ENDPOINT, `http://127.0.0.1:${server.port}${ENDPOINT_PATH}`), async () => {
            buildFrontend();
            // A bundle that did not pick up the rewrite would send the drill's errors to the production endpoint.
            const stale = bundleFailures(join(REPO_ROOT, BUNDLE_REL));
            if (stale.length > 0) throw new Error(stale[0]);
            await withFirefoxPage('', async ({ evaluate, waitFor }) => {
                await waitFor('window.theia && window.theia.container ? true : false', { timeoutMs: 90000 });
                await waitFor('!!document.querySelector("#theia-app-shell")', { timeoutMs: 60000 });
                await evaluate(`(() => { ${GET_BY_NAME}
                    const c = window.theia.container;
                    window.__pbDrill = { prefs: __getByName(c, 'PreferenceService'), sender: __getByName(c, 'PowerBrowserTelemetrySender') };
                    window.__pbDrill.sender.maxBatchSize = 2;
                    return 'ok'; })()`);
                const setLevel = async (level) => {
                    await evaluate(`window.__pbDrill.levelSet = false; window.__pbDrill.prefs.set(${JSON.stringify(levelKey)}, ${JSON.stringify(level)}).then(() => { window.__pbDrill.levelSet = true; }); 'ok'`);
                    await waitFor('window.__pbDrill.levelSet === true', { timeoutMs: 10000 });
                };
                // Positive half: level error, one uncaught error and one unhandled rejection, flushed by batch size 2.
                state.level = 'error';
                await setLevel('error');
                await evaluate(`setTimeout(() => { throw new Error('pb-drill-uncaught'); }, 0); Promise.reject(new Error('pb-drill-rejected')); 'ok'`);
                const delivered = await pollUntil(() => captures.some(c => c.method === 'POST' && c.level === 'error'), 20000);
                if (!delivered) failures.push('the positive half sent no POST at level error. Next step: check the arming and the batch flush.');
                // Negative half, same run: level off, the same budget of errors, zero requests.
                state.level = 'off';
                await setLevel('off');
                await evaluate(`setTimeout(() => { throw new Error('pb-drill-off-uncaught'); }, 0); Promise.reject(new Error('pb-drill-off-rejected')); 'ok'`);
                await new Promise(r => setTimeout(r, 5000));
            });
        });
    } catch (e) {
        failures.push(`the drill did not complete (${e.message}). Next step: check the nix shell, the built frontend and the built binary.`);
    } finally {
        if (server) server.close();
    }
    if (!readFileSync(packagePath).equals(original)) failures.push(`the tracked ${PACKAGE_REL} is not byte-identical to its original after the drill. Next step: restore it from git.`);
    try {
        buildFrontend();
        const hits = markerHits(join(REPO_ROOT, BUNDLE_REL));
        if (hits !== 0) failures.push(`the built bundle carries ${hits} hit(s) for ${MARKER} after the restore. Next step: rebuild the frontend after the restore.`);
    } catch (e) {
        failures.push(`the restore rebuild or the marker grep did not run (${e.message}). Next step: rebuild the frontend and grep the bundle for ${MARKER}.`);
    }
    failures.push(...await analyzeCapture(captures));
    return { failures, captures };
}

const args = process.argv.slice(2);
const isEntry = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntry) {
    if (args.length === 1 && args[0] === '--self-test') process.exit(await selfTest());
    if (args.length === 0) {
        const { failures, captures } = await fullDrill();
        if (failures.length > 0) {
            failures.forEach(x => console.error(`${NAME}: FAIL -- ${x}`));
            process.exit(1);
        }
        console.log(`${NAME}: PASS -- ${captures.filter(c => c.method === 'POST').length} positive POST(s) carried both corrected events, zero requests at level off, and the marker is absent from the restored bundle`);
        process.exit(0);
    }
    console.error(`${NAME}: FAIL -- unknown argument '${args.join(' ')}'`);
    console.error(`  Next step: run: node ${SELF_REL}, or add --self-test to prove the analyzer discriminates.`);
    process.exit(2);
}
