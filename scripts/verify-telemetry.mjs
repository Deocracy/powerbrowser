#!/usr/bin/env node
// scripts/verify-telemetry.mjs
//
// The telemetry gate (04-03, TEL-01/TEL-02; extended by TEL-06 in Phase 48): the manifest's
// [telemetry] reaches the sidecar as the powerbrowserTelemetry block, the error producer sends
// only the admitted set, and the batching sender's unit suite is green.
//
// WHAT IT ASSERTS. The expectations are DERIVED at check time -- from the manifest through
// scripts/generate.mjs's own resolver and emitter, or from the source tree -- never kept here.
// The one literal kept here is the TEL-06 requirement text (the admitted set and the preference
// description), because the requirement, not the tree, is the thing being pinned:
//
//  1. generated/theia-telemetry.json parses and equals what the manifest
//     emits right now (a drifted level or endpoint fails naming the key).
//     Absent fragment SKIPS this step only: generated/ is git-ignored,
//     so that is the state of every fresh clone, and a gate red on it
//     would be a gate its readers skip (generate-check's own rule).
//  2. theia/applications/browser/package.json's theia.frontend.config
//     powerbrowserTelemetry block equals that same map (a manifest at
//     level off and a block still carrying an endpoint is stale output,
//     not a clean tree). The tracked file is committed, so this step
//     always runs -- it is what pins the yarn-managed side.
//  3. The admitted set: telemetry-enrichment.ts exports ADMITTED_KEYS equal to the seven-key
//     TEL-06 set, and withEnrichment on hostile input emits only admitted keys, an os from the
//     four buckets, and the configured version and buildID.
//  4. The preference description in telemetry-preferences.ts contains the TEL-06 text byte for
//     byte.
//  5. At level off the emitted toolkit.telemetry.server is blank.
//  6. The sender compiles (tsc -b, skipped with a message where the theia
//     install is absent) and its plain-node unit suite passes: off sends
//     nothing, batches flush on size and interval, failures retry then
//     drop, runtime level changes take effect.
//
// Honestly --quick: it reads text files, imports two zero-dependency source modules, runs tsc on
// one extension and runs a dependency-free node suite. No app build, no browser, no display, no
// network.
//
// Usage:
//   node scripts/verify-telemetry.mjs
//   node scripts/verify-telemetry.mjs --self-test
//
// The self-test plants eight faults and requires each to go red, each with the unmutated control
// green first, so a red is plant-caused: the suite run against the always-send stub (the off
// assertion must fail), a drifted tracked block, a drifted fragment, an extra key in the
// enrichment, a stack field the sender forwards (the admitted-set filter removed), and a one-word
// change to the preference description. It also drives the NG-067 error reporter into the real
// sender, and the plugin error path straight into it: the sent payload carries only admitted keys,
// no message, no stack and no path beyond a base name, a hostile event never throws out of the
// listener, and a repeated error is sent once. Two further plants remove the value-shape check on
// the admitted keys, and weaken it to drop only the key: a path or message in type, source, os,
// version or buildID, or a negative or fractional line, must keep the whole report off the wire.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { emitTheiaTelemetry, mozillaEndpointPrefs, resolveConfig } from './generate.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'verify-telemetry';

const args = process.argv.slice(2);
const SELF_TEST = args.includes('--self-test');
for (const a of args) {
    if (a !== '--self-test') {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
        process.exit(2);
    }
}

const MANIFEST_REL = 'configuration.toml';
const FRAGMENT_REL = 'generated/theia-telemetry.json';
const APP_PKG_REL = 'theia/applications/browser/package.json';
const BLOCK_KEY = 'powerbrowserTelemetry';
const TEST_REL = 'theia/extensions/telemetry/test/telemetry-sender.test.mjs';
const SENDER_REL = 'theia/extensions/telemetry/src/browser/telemetry-sender.ts';
const REPORT_REL = 'theia/extensions/telemetry/src/browser/telemetry-error-report.ts';
const ENRICH_REL = 'theia/extensions/telemetry/src/browser/telemetry-enrichment.ts';
const PREFS_REL = 'theia/extensions/telemetry/src/browser/telemetry-preferences.ts';
const TSC_REL = 'theia/node_modules/typescript/bin/tsc';
const EXT_REL = 'theia/extensions/telemetry';
const RERUN_GENERATE = 'node scripts/generate.mjs';

// The TEL-06 pins (REQUIREMENTS.md TEL-06). The admitted set is the producer's whole wire key set;
// the description is the opt-in text, quoted byte for byte.
const ADMITTED_LITERAL = ['type', 'source', 'line', 'column', 'version', 'buildID', 'os'];
const DESCRIPTION_LITERAL = 'Send error reports to PowerBrowser. When this is on, PowerBrowser sends the error type, file name, line number, version and operating system when something goes wrong. It never sends page content or error messages. Turning this on also lets installed VS Code extensions send their own telemetry.';
const OS_BUCKETS = ['windows', 'macos', 'linux', 'unknown'];
const OS_VECTORS = [
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'windows'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)', 'macos'],
    ['Mozilla/5.0 (X11; Linux x86_64)', 'linux'],
    ['', 'unknown'],
];
// Fixture version and buildID for the producer checks. They have the release-identity shape the
// producer admits (version <ESR>, buildID v<ESR>-<revision>); a value of any other shape is omitted.
const CONTEXT_FIXTURE = Object.freeze({ version: '153.5.1', buildID: 'v153.5.1-1' });

function readBytes(root, rel) {
    const p = join(root, rel);
    if (!existsSync(p)) return null;
    return readFileSync(p);
}

function runPinChecks(root) {
    const failures = [];

    // --- 0. the manifest resolves -----------------------------------------
    const { failures: resolveFailures, config } = resolveConfig(join(root, MANIFEST_REL), undefined);
    if (resolveFailures.length > 0) {
        for (const f of resolveFailures) failures.push(`${MANIFEST_REL} is red, so the telemetry pins prove nothing: ${f}`);
        return { failures, skipped: [], expected: null };
    }
    const skipped = [];

    // The expectation both file comparisons measure against: what the
    // manifest emits right now.
    let expected;
    try {
        expected = JSON.parse(emitTheiaTelemetry(config, { id: 'dev' }));
    } catch {
        failures.push(`the emitted ${FRAGMENT_REL} is not valid JSON, so it cannot be compared. Next step: report this; ${MANIFEST_REL} is not the cause and editing it will not help.`);
        return { failures, skipped, expected: null };
    }

    // --- 1. the generated fragment -----------------------------------------
    const fragmentBytes = readBytes(root, FRAGMENT_REL);
    if (fragmentBytes === null) {
        skipped.push(`${FRAGMENT_REL} is absent (nothing generated in this copy yet) -- fragment equality unchecked; run ${RERUN_GENERATE} to cover it.`);
    } else {
        let fragment;
        try {
            fragment = JSON.parse(fragmentBytes.toString('utf8'));
        } catch {
            failures.push(`${FRAGMENT_REL} is not valid JSON, so it cannot be compared against ${MANIFEST_REL}. Next step: run ${RERUN_GENERATE} to rewrite it, then re-run this check.`);
            fragment = null;
        }
        if (fragment !== null) {
            for (const key of Object.keys(expected)) {
                if (!Object.hasOwn(fragment, key)) {
                    failures.push(`${FRAGMENT_REL} is missing ${JSON.stringify(key)} -- stale output. Next step: run ${RERUN_GENERATE}, then re-run this check.`);
                } else if (JSON.stringify(fragment[key]) !== JSON.stringify(expected[key])) {
                    failures.push(`${FRAGMENT_REL} carries ${JSON.stringify(key)} = ${JSON.stringify(fragment[key])} but ${MANIFEST_REL} emits ${JSON.stringify(expected[key])} -- stale output. Next step: run ${RERUN_GENERATE}, then re-run this check.`);
                }
            }
            for (const key of Object.keys(fragment ?? {})) {
                if (!Object.hasOwn(expected, key)) {
                    failures.push(`${FRAGMENT_REL} carries ${JSON.stringify(key)}, which ${MANIFEST_REL} no longer emits -- stale output. Next step: run ${RERUN_GENERATE}, then re-run this check.`);
                }
            }
        }
    }

    // --- 2. the application package.json block ------------------------------
    const pkgBytes = readBytes(root, APP_PKG_REL);
    if (pkgBytes === null) {
        failures.push(`${APP_PKG_REL} does not exist, so the ${BLOCK_KEY} block cannot be checked at all.`);
        return { failures, skipped, expected };
    }
    let pkg;
    try {
        pkg = JSON.parse(pkgBytes.toString('utf8'));
    } catch {
        failures.push(`${APP_PKG_REL} is not valid JSON, so the ${BLOCK_KEY} block cannot be checked at all.`);
        return { failures, skipped, expected };
    }
    const block = pkg?.theia?.frontend?.config?.[BLOCK_KEY];
    if (block === undefined) {
        failures.push(`${APP_PKG_REL}'s theia.frontend.config carries no ${BLOCK_KEY} block but ${MANIFEST_REL} emits ${JSON.stringify(expected)} -- stale output. Next step: copy the block from ${FRAGMENT_REL} (that key only; leave every sibling key byte-identical), then re-run this check.`);
    } else if (JSON.stringify(block) !== JSON.stringify(expected)) {
        failures.push(`${APP_PKG_REL}'s ${BLOCK_KEY} block is ${JSON.stringify(block)} but ${MANIFEST_REL} emits ${JSON.stringify(expected)} -- stale output. Next step: copy the block from ${FRAGMENT_REL} (that key only; leave every sibling key byte-identical), then re-run this check.`);
    }

    return { failures, skipped, expected };
}

// Loads a source module from `root`. The query keeps two roots from sharing one module-cache
// entry, so a planted copy always loads its own bytes.
function loadModule(root, rel) {
    return import(`${pathToFileURL(join(root, rel)).href}?root=${encodeURIComponent(root)}`);
}

function admittedSetFailures(mod) {
    const failures = [];
    const keys = [...(mod.ADMITTED_KEYS ?? [])];
    if (JSON.stringify(keys) !== JSON.stringify(ADMITTED_LITERAL)) {
        failures.push(`${ENRICH_REL} exports ADMITTED_KEYS ${JSON.stringify(keys)}, but TEL-06 admits exactly ${JSON.stringify(ADMITTED_LITERAL)}. Next step: restore the seven-key set; the events Worker and this gate follow it.`);
    }
    // Hostile input: a message, a stack and an extra key must never reach the output.
    const out = mod.withEnrichment({ type: 'TypeError', source: 'bundle.js', line: 12, column: 34, message: 'Unable to read a file', stack: 'at f (x.js:1)' }, CONTEXT_FIXTURE);
    for (const key of Object.keys(out)) {
        if (!ADMITTED_LITERAL.includes(key)) {
            failures.push(`withEnrichment emits ${JSON.stringify(key)}, which is outside the admitted set. Next step: drop that key in ${ENRICH_REL}; the wire carries only ADMITTED_KEYS.`);
        }
    }
    if (!OS_BUCKETS.includes(out.os)) {
        failures.push(`withEnrichment sets os to ${JSON.stringify(out.os)}, which is not one of ${OS_BUCKETS.join(', ')}. Next step: derive os only through osBucket.`);
    }
    if (out.version !== CONTEXT_FIXTURE.version || out.buildID !== CONTEXT_FIXTURE.buildID) {
        failures.push(`withEnrichment dropped the configured version or buildID: ${JSON.stringify(out)}. Next step: carry both through from the context in ${ENRICH_REL}.`);
    }
    for (const [ua, bucket] of OS_VECTORS) {
        const got = mod.osBucket(ua);
        if (got !== bucket) failures.push(`osBucket(${JSON.stringify(ua)}) is ${JSON.stringify(got)}, not ${JSON.stringify(bucket)}.`);
    }
    return failures;
}

// Source-tree checks that need an import or a text read rather than the manifest alone.
async function runSourceChecks(root) {
    const failures = [];

    // --- 3. the admitted set ----------------------------------------------
    if (!existsSync(join(root, ENRICH_REL))) {
        failures.push(`${ENRICH_REL} does not exist, so the TEL-06 admitted set cannot be checked at all.`);
    } else {
        let mod;
        try {
            mod = await loadModule(root, ENRICH_REL);
        } catch (err) {
            failures.push(`${ENRICH_REL} does not load under plain node (${err.message}). Next step: keep the module zero-import and erasable-syntax only, then re-run this check.`);
        }
        if (mod !== undefined) failures.push(...admittedSetFailures(mod));
    }

    // --- 4. the preference description, byte for byte ----------------------
    const prefsBytes = readBytes(root, PREFS_REL);
    if (prefsBytes === null) {
        failures.push(`${PREFS_REL} does not exist, so the TEL-06 description cannot be checked at all.`);
    } else if (!prefsBytes.toString('utf8').includes(`description: '${DESCRIPTION_LITERAL}',`)) {
        failures.push(`${PREFS_REL} does not carry the TEL-06 preference description byte for byte. Next step: restore the description to the TEL-06 text in REQUIREMENTS.md, then re-run this check.`);
    }

    // --- 5. level off leaves the Gecko server pref blank -------------------
    const { failures: resolveFailures, config } = resolveConfig(join(root, MANIFEST_REL), undefined);
    if (resolveFailures.length === 0) {
        const level = config.telemetry?.level ?? 'off';
        const server = mozillaEndpointPrefs(config).find(p => p.name === 'toolkit.telemetry.server')?.value;
        if (level === 'off' && server !== '') {
            failures.push(`${MANIFEST_REL} is level off but toolkit.telemetry.server derives ${JSON.stringify(server)}, not the blank value. Next step: blank the server at level off in scripts/generate.mjs mozillaEndpointPrefs, then re-run this check.`);
        }
    }

    return failures;
}

async function runAllPinChecks(root) {
    const { failures, skipped } = runPinChecks(root);
    failures.push(...await runSourceChecks(root));
    return { failures, skipped };
}

function runChild(label, cmd, argv, env) {
    const child = spawnSync(cmd, argv, { cwd: REPO_ROOT, encoding: 'utf8', env: env ?? process.env });
    const output = `${child.stdout ?? ''}${child.stderr ?? ''}`;
    return { status: child.status ?? 1, output, label };
}

function runBuildChecks() {
    const failures = [];
    const skipped = [];

    // --- 6. the extension compiles ------------------------------------------
    if (!existsSync(join(REPO_ROOT, TSC_REL))) {
        skipped.push(`the theia install is absent (${TSC_REL} not found) -- tsc proof unchecked; run the audited theia install, then re-run this check.`);
    } else {
        const tsc = runChild('tsc', process.execPath, [TSC_REL, '-b', EXT_REL]);
        if (tsc.status !== 0) {
            failures.push(`${EXT_REL} does not compile cleanly:\n${tsc.output.split('\n').filter(l => l.trim() !== '').slice(0, 20).join('\n')}`);
        }
    }

    // --- 7. the unit suite ----------------------------------------------------
    // Dependency-free: the sender imports nothing, so this runs on a bare
    // node with no install and no build.
    const suite = runChild('suite', process.execPath, [TEST_REL]);
    if (suite.status !== 0) {
        failures.push(`the telemetry unit suite is red:\n${suite.output.split('\n').filter(l => l.trim() !== '' && !l.includes('MODULE_TYPELESS_PACKAGE_JSON') && !l.includes('trace-warnings')).join('\n')}`);
    }

    return { failures, skipped };
}

async function main() {
    const { failures: pinFailures, skipped: pinSkipped } = await runAllPinChecks(REPO_ROOT);
    const { failures: buildFailures, skipped: buildSkipped } = runBuildChecks();
    for (const s of [...pinSkipped, ...buildSkipped]) console.log(`${NAME}: SKIP -- ${s}`);
    const failures = [...pinFailures, ...buildFailures];
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} problem(s)`);
        for (const f of failures) console.error(`  - ${f}`);
        process.exit(1);
    }
    console.log(`${NAME}: PASS -- telemetry fragment, block, admitted set, description, compile and suite all green`);
}

function copyInto(root, rel) {
    const dest = join(root, rel);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(join(REPO_ROOT, rel), dest);
}

// The producer, driven end to end: a reporter over the real sender, with the stub logger the NG-067
// case always used. Returns the problems found in what was sent. Loads from `root`, so a planted
// copy of any of the three modules is exercised as written.
async function driveErrorReport(root) {
    const { ErrorReporter } = await loadModule(root, REPORT_REL);
    const { PowerBrowserTelemetrySender } = await loadModule(root, SENDER_REL);
    const bodies = [];
    const sender = new PowerBrowserTelemetrySender({
        endpoint: 'https://self-test.invalid/collect',
        getLevel: () => 'error',
        fetchFn: (url, init) => { bodies.push(init.body); return Promise.resolve({ ok: true }); },
        flushIntervalMs: 0,
    });
    const reporter = new ErrorReporter({ sender, logError: (name, data) => sender.sendErrorData(name, data) }, CONTEXT_FIXTURE);
    const secret = '/home/self-test/private/notes.txt';
    // M-3: a runtime-assigned constructor name carrying a path. The
    // IDENTIFIER guard in typeOf() must sanitize this to 'unknown';
    // deleting the guard sends the path as the event type.
    class X extends Error {}
    Object.defineProperty(X, 'name', { value: '/home/self-test/x' });
    const thrown = {
        error: new TypeError(`Unable to read file '${secret}'`),
        message: `Uncaught TypeError: Unable to read file '${secret}'`,
        filename: 'http://127.0.0.1:3000/lib/frontend/bundle.js?v=1#top',
        lineno: 12,
        colno: 34,
    };
    const escaped = [];
    for (const call of [
        () => reporter.onError(thrown),
        () => reporter.onError(thrown),
        () => reporter.onRejection({ reason: new RangeError(secret) }),
        () => reporter.onError({ get error() { throw new Error(secret); }, filename: `data:text/javascript,${secret}`, lineno: '12' }),
        () => reporter.onRejection({ reason: Object.create(null) }),
        () => reporter.onRejection(null),
        () => reporter.onError({ error: new X('planted'), filename: 'http://127.0.0.1:3000/lib/frontend/other.js', lineno: 7, colno: 9 }),
        // M-3: non-finite positions. The Number.isFinite guard in
        // position() must omit them; deleting the guard sends NaN (JSON
        // null) and trips the numeric assert below.
        () => reporter.onError({ error: new TypeError('planted'), filename: 'http://127.0.0.1:3000/lib/frontend/nonfinite.js', lineno: NaN, colno: Infinity }),
    ]) {
        try { call(); } catch (e) { escaped.push(String(e)); }
    }
    // A plugin's own error path (plugin-ext mints loggers through this sender): its data carries a
    // message and a stack, and its name is free text. Neither may reach the wire.
    sender.sendErrorData('plugin.error', { type: 'PluginError', message: secret, stack: `at f (${secret})` });
    sender.sendErrorData(`plugin failed: ${secret}`);
    sender.sendErrorData(new TypeError(secret));
    // Content in an admitted key (the review's CR-04): the key is allowed, the value is free text. Each
    // call has its own event name, so a report that reaches the wire with a key merely trimmed away
    // is seen too. The whole report must be dropped.
    const hostile = [
        { type: `Unable to read '${secret}'` },
        { type: 'T', source: 'file:///home/alice/proj/a.ts' },
        { type: 'T', source: 'a/b.js' },
        { type: 'T', source: 'C:\\x.js' },
        { type: 'T', os: 'Alice-laptop' },
        { type: 'T', version: 'x'.repeat(5000) },
        { type: 'T', buildID: '/tmp/x' },
        { type: 'T', line: -1 },
        { type: 'T', line: 1.5 },
        { type: 'T', column: 2 ** 40 },
        { type: 'T', line: '12' },
    ];
    hostile.forEach((data, i) => sender.sendErrorData(`plugin.hostile.${i}`, data));
    await sender.flush();
    const text = bodies.join('\n');
    const events = bodies.flatMap(b => JSON.parse(b).events);
    const repeated = events.filter(e => e.data?.source === 'bundle.js');
    const problems = [];
    if (escaped.length > 0) problems.push(`a hostile event threw out of the listener: ${escaped.join(' | ')}`);
    if (repeated.length !== 1) {
        problems.push(`the repeated error was sent ${repeated.length} time(s), not once`);
    } else {
        // Every key but os is the caller's or the fixture's; os is checked separately below.
        const { os, ...rest } = repeated[0].data;
        if (JSON.stringify(rest) !== JSON.stringify({ type: 'TypeError', source: 'bundle.js', line: 12, column: 34, ...CONTEXT_FIXTURE })) {
            problems.push(`the uncaught-error payload is ${JSON.stringify(repeated[0].data)}`);
        }
    }
    if (!events.some(e => e.name === 'frontend.unhandled-rejection' && e.data?.type === 'RangeError')) problems.push('the rejection was not sent with its type');
    for (const e of events.filter(e => e.name.startsWith('plugin.hostile.'))) {
        problems.push(`content in an admitted key reached the wire on '${e.name}': ${JSON.stringify(e.data)}`);
    }
    if (events.length !== 10) problems.push(`expected 10 events (seven distinct reporter errors, three plugin-path calls), got ${events.length}`);
    // The plugin path: only the admitted type survives, a message-shaped name becomes 'unknown', and
    // an Error input is named by its type with no data.
    const plugin = events.find(e => e.name === 'plugin.error');
    if (plugin === undefined || JSON.stringify(plugin.data) !== JSON.stringify({ type: 'PluginError' })) problems.push(`the plugin error carried ${JSON.stringify(plugin?.data)}, want only { type: "PluginError" }`);
    if (!events.some(e => e.name === 'unknown')) problems.push('a message-shaped event name was not dropped to unknown');
    if (!events.some(e => e.name === 'TypeError' && e.data === undefined)) problems.push('an Error input was not named by its type with no data');
    if (/message|stack|Unable|self-test|notes|\//.test(text)) problems.push(`the sent bodies carry message text, a stack or a path: ${text}`);
    // M-3: pin the two privacy guards. A path-carrying constructor name
    // must arrive as 'unknown' (IDENTIFIER guard), and every sent line
    // and column must be a number (Number.isFinite guard in position()).
    if (events.some(e => e.data?.type === '/home/self-test/x')) problems.push(`the path-carrying constructor name was sent as a type: ${text}`);
    if (!events.some(e => e.data?.source === 'other.js' && e.data?.type === 'unknown')) problems.push(`the path-named error was not sanitized to type 'unknown': ${text}`);
    if (!events.some(e => e.data?.source === 'nonfinite.js' && !('line' in (e.data ?? {})) && !('column' in (e.data ?? {})))) problems.push(`the non-finite positions were not omitted: ${text}`);
    for (const e of events) {
        for (const key of ['line', 'column']) {
            if (key in (e.data ?? {}) && typeof e.data[key] !== 'number') problems.push(`event '${e.name}' carries non-number ${key}: ${JSON.stringify(e.data)}`);
        }
        // TEL-06: only admitted keys leave the producer, os is one bucket, and every uncaught report carries the configured build.
        for (const key of Object.keys(e.data ?? {})) {
            if (!ADMITTED_LITERAL.includes(key)) problems.push(`the sender shipped the key ${JSON.stringify(key)} on '${e.name}', which is outside the admitted set`);
        }
        // os is the producer's enrichment: every frontend report carries it, the plugin path never does.
        if (e.name.startsWith('frontend.') && !OS_BUCKETS.includes(e.data?.os)) problems.push(`event '${e.name}' carries os ${JSON.stringify(e.data?.os)}, not one of ${OS_BUCKETS.join(', ')}`);
        if (e.name === 'frontend.uncaught-error' && (e.data?.version !== CONTEXT_FIXTURE.version || e.data?.buildID !== CONTEXT_FIXTURE.buildID)) {
            problems.push(`uncaught-error event lacks the configured version or buildID: ${JSON.stringify(e.data)}`);
        }
    }
    return { problems };
}

// Copies the four producer-side files the checks read, so a plant can mutate one and leave the rest as written.
function stageControlTree(dir) {
    for (const rel of [MANIFEST_REL, FRAGMENT_REL, APP_PKG_REL, ENRICH_REL, PREFS_REL]) copyInto(dir, rel);
}

async function selfTest() {
    let failed = 0;
    const complain = (name, why) => {
        console.error(`${NAME}: --self-test FAIL -- '${name}' ${why}`);
        failed += 1;
    };

    // Green control first: the unmutated tree proves nothing if red.
    const control = await runAllPinChecks(REPO_ROOT);
    if (control.failures.length > 0) {
        complain('unmutated control', `is already red, so the plants below would mean nothing: ${control.failures.join(' | ')}`);
    } else {
        console.log(`  ok  unmutated control -> pin checks green`);
    }
    const suiteControl = runChild('suite', process.execPath, [TEST_REL]);
    if (suiteControl.status !== 0) {
        complain('unmutated suite', `is already red, so the stub plant below would mean nothing: ${suiteControl.output}`);
    } else {
        console.log(`  ok  unmutated suite -> green`);
    }
    // The error-report case: no message, stack or path, hostile events contained, a repeat sent once,
    // and only admitted keys leave with os bucketed and the configured version and buildID.
    const errorControl = await driveErrorReport(REPO_ROOT);
    if (errorControl.problems.length > 0) {
        complain('error report', `is already red, so the producer plants below would mean nothing: ${errorControl.problems.join(' | ')}`);
    } else {
        console.log(`  ok  error report -> no message, stack or path; hostile events contained; a repeat sent once; admitted keys only`);
    }

    // Plant 1: the suite against the always-send stub must go red ON THE
    // OFF ASSERTION -- this is the discrimination proof Task 2 requires.
    {
        const stubbed = runChild('stubbed-suite', process.execPath, [TEST_REL], { ...process.env, TELEMETRY_TEST_STUB: 'always-send' });
        if (stubbed.status === 0) {
            complain('always-send stub', 'planted no fault at all: the suite stayed green against a sender that ignores the level');
        } else if (!stubbed.output.includes('not ok - off sends nothing')) {
            complain('always-send stub', `went red, but not on the off assertion: ${stubbed.output}`);
        } else {
            console.log(`  ok  always-send stub -> red, naming 'not ok - off sends nothing'`);
        }
    }

    // Plants 2-5: a drifted tracked block, a drifted fragment, an extra key in the enrichment, and a
    // one-word change to the preference description must each go red naming the drift.
    for (const plant of [
        { name: 'drifted tracked block', rel: APP_PKG_REL, drift: text => text.replace('"level": "off"', '"level": "all"'), expect: BLOCK_KEY },
        { name: 'drifted fragment', rel: FRAGMENT_REL, drift: text => text.replace('"level": "off"', '"level": "error"'), expect: FRAGMENT_REL },
        {
            name: 'extra enrichment key',
            rel: ENRICH_REL,
            drift: text => text.replace('    if (buildID !== undefined) out.buildID = buildID;', "    if (buildID !== undefined) out.buildID = buildID;\n    Object.assign(out, { extra: 'leaked' });"),
            expect: '"extra"',
        },
        {
            name: 'one-word description change',
            rel: PREFS_REL,
            drift: text => text.replace('Send error reports to PowerBrowser.', 'Send error logs to PowerBrowser.'),
            expect: PREFS_REL,
        },
    ]) {
        const dir = mkdtempSync(join(tmpdir(), 'telemetry-selftest-'));
        try {
            stageControlTree(dir);
            const target = join(dir, plant.rel);
            const before = readFileSync(target, 'utf8');
            const drifted = plant.drift(before);
            if (drifted === before) {
                complain(plant.name, 'planted no fault at all: the drift did not land');
                continue;
            }
            writeFileSync(target, drifted, 'utf8');
            const { failures } = await runAllPinChecks(dir);
            if (!failures.some(f => f.includes(plant.expect))) {
                complain(plant.name, `did not go red naming '${plant.expect}'; got: ${failures.join(' | ') || '(no failures at all)'}`);
            } else {
                console.log(`  ok  ${plant.name} -> red, naming '${plant.expect}'`);
            }
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    }

    // Plant 6: the sender stops enforcing the admitted set, so the plugin path's stack field goes
    // out. Must go red naming the key. The producer copies are staged together so the planted
    // sender loads its own error-report and enrichment modules.
    {
        const dir = mkdtempSync(join(tmpdir(), 'telemetry-selftest-'));
        try {
            for (const rel of [ENRICH_REL, REPORT_REL, SENDER_REL]) copyInto(dir, rel);
            const target = join(dir, SENDER_REL);
            const before = readFileSync(target, 'utf8');
            const drifted = before.replace(', clean);', ', data);');
            if (drifted === before) {
                complain('stack field', 'planted no fault at all: the drift did not land');
            } else {
                writeFileSync(target, drifted, 'utf8');
                const { problems } = await driveErrorReport(dir);
                if (!problems.some(p => p.includes('"stack"'))) {
                    complain('stack field', `did not go red naming '"stack"'; got: ${problems.join(' | ') || '(no problems at all)'}`);
                } else {
                    console.log(`  ok  stack field -> red, naming '"stack"'`);
                }
            }
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    }

    // Plants 7 and 8: the shape check on admitted values is removed, then weakened to drop only the
    // key. A path or message in type, source or os must still keep the whole report off the wire.
    for (const plant of [
        { name: 'content in an admitted key', find: 'if (!admittedValueOk(key, value)) return null;', replace: '' },
        { name: 'key-only drop', find: 'if (!admittedValueOk(key, value)) return null;', replace: 'if (!admittedValueOk(key, value)) continue;' },
    ]) {
        const dir = mkdtempSync(join(tmpdir(), 'telemetry-selftest-'));
        try {
            for (const rel of [ENRICH_REL, REPORT_REL, SENDER_REL]) copyInto(dir, rel);
            const target = join(dir, ENRICH_REL);
            const before = readFileSync(target, 'utf8');
            const drifted = before.replace(plant.find, plant.replace);
            if (drifted === before) {
                complain(plant.name, 'planted no fault at all: the drift did not land');
                continue;
            }
            writeFileSync(target, drifted, 'utf8');
            const { problems } = await driveErrorReport(dir);
            if (!problems.some(p => p.includes('content in an admitted key'))) {
                complain(plant.name, `did not go red naming 'content in an admitted key'; got: ${problems.join(' | ') || '(no problems at all)'}`);
            } else {
                console.log(`  ok  ${plant.name} -> red, naming 'content in an admitted key'`);
            }
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    }

    if (failed > 0) return 1;
    console.log(`${NAME}: --self-test PASS -- 8 planted faults and the error-report case all behaved as pinned`);
    return 0;
}

if (SELF_TEST) {
    process.exit(await selfTest());
} else if (args.length === 0) {
    await main();
}
