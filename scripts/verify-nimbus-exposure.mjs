#!/usr/bin/env node
// scripts/verify-nimbus-exposure.mjs
//
// The Nimbus exposure probe (Phase 46, UPD-27). With MOZ_NORMANDY compiled
// out (powerbrowser/identity.configure.comparand carries
// imply_option("MOZ_NORMANDY", False)), UpdateListener's two
// NimbusFeatures.updatePrompt.recordExposureEvent({ once: true }) calls
// (UpdateListener.sys.mjs, on the available and manual paths) must neither
// throw nor make a network request.
//
// HOW IT ASSERTS. The full-tier run launches the built shell through the same
// harness every other full row uses (scripts/lib/pb-relaunch.mjs withShell and
// runCheck). Inside the shell's chrome document it calls the two
// UpdateListener notification paths with a fixture update carrying detailsURL
// (the unsupported-notification guard requires it), then reads the resolver
// capture written during that probe window only. The window is bounded by a
// byte snapshot of the MOZ_LOG files taken immediately before the probe call,
// so browser startup traffic is not charged to the probe. Passing requires
// both paths to return and the derived contacted set (the `Resolving host
// [...]` lines in the window) to be empty.
//
// Where no built browser exists the full row FAILs naming the missing
// evidence. The quick static checks (comparand, the two call sites) and the
// --self-test doubles run in memory with no build, browser or network.
//
// Usage:
//   node scripts/verify-nimbus-exposure.mjs              (full: needs a built browser)
//   node scripts/verify-nimbus-exposure.mjs --self-test  (quick, in memory)
//
// Exit 0 pass, 1 fail. --self-test plants every fault and requires each to go
// red naming the drift; a check that can only go green is not a check.

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIREFOX_BIN } from './lib/firefox-bidi.mjs';
import { runCheck, withShell } from './lib/pb-relaunch.mjs';

const SELF = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(SELF), '..');
const NAME = 'nimbus-exposure';
const SELF_REL = 'scripts/verify-nimbus-exposure.mjs';

const args = process.argv.slice(2);
for (const a of args) {
    if (a !== '--self-test') {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
        console.error(`  Next step: run: node ${SELF_REL}, or add --self-test to prove the probe discriminates.`);
        process.exit(2);
    }
}

const COMPARAND_REL = 'powerbrowser/identity.configure.comparand';
const LISTENER_REL = 'upstream/toolkit/mozapps/update/UpdateListener.sys.mjs';

// The resolver capture: MOZ_LOG=nsHostResolver:5 with MOZ_LOG_FILE=<base>
// writes <base>.moz_log (and <base>.child-N.moz_log per content process).
const LOG_DIR = join(REPO_ROOT, '.mozbuild', 'nimbus-probe');
const LOG_BASE = join(LOG_DIR, 'probe');
const LOG_NAME_RE = /^probe(?:\.child-\d+)?\.moz_log$/;

// Runs in the shell's chrome document. The fixture update is the minimum the
// notification paths read; a throw is reported per path, never swallowed.
const PROBE_EXPRESSION = `(async () => {
    const { UpdateListener } = ChromeUtils.importESModule("resource://gre/modules/UpdateListener.sys.mjs");
    const update = {
        name: "nimbus-probe", displayVersion: "999.0", appVersion: "999.0", buildID: "20991231000000",
        detailsURL: "https://example.invalid/release-notes", type: "minor", isOSUpdate: false,
        showPrompt: true, promptWaitTime: 0, patchCount: 0, selectedPatch: null,
    };
    const out = {};
    for (const [path, method] of [["available", "showUpdateAvailableNotification"], ["manual", "showManualUpdateNotification"]]) {
        try { UpdateListener[method](update, true); out[path] = "returned"; }
        catch (e) { out[path] = "threw: " + (e && e.name ? e.name : "error"); }
    }
    return JSON.stringify(out);
})()`;

/** The anchored resolver-log sift (verify-endpoints.sh layer-3 shape). */
export function siftResolverHosts(logText) {
    const out = [];
    for (const line of String(logText).split('\n')) {
        const m = line.match(/Resolving host \[([^\]]+)\]/);
        if (m) out.push(m[1]);
    }
    return [...new Set(out)];
}

/**
 * The in-process probe over a fixture double (self-test): drive
 * recordExposureEvent and sift the resolver capture. Returns failures (empty
 * when the call returned silently and the derived contacted set is empty).
 */
export function probeExposure(double, resolverLog) {
    const failures = [];
    let returned = false;
    try {
        double.recordExposureEvent({ once: true });
        returned = true;
    } catch (err) {
        failures.push(`recordExposureEvent threw (${err && err.name ? err.name : 'error'}) -- with MOZ_NORMANDY out the exposure call must be inert. Next step: check the NimbusFeatures wiring.`);
    }
    if (returned) {
        const hosts = siftResolverHosts(resolverLog ?? '');
        if (hosts.length > 0) {
            failures.push(`recordExposureEvent requested network during the probe window: ${hosts.join(', ')} -- with MOZ_NORMANDY out the exposure call must make no request. Next step: check the NimbusFeatures wiring.`);
        }
    }
    return { failures, returned };
}

/**
 * The live verdict (full tier): the in-shell outcome for both paths plus the
 * probe-window resolver slice. Pure, so the self-test drives it directly.
 */
export function probeFailures(outcome, resolverSlice) {
    const failures = [];
    if (!outcome || typeof outcome !== 'object') {
        failures.push('the in-Gecko probe returned no outcome. Next step: check that the shell chrome document runs the probe expression and that UpdateListener imports.');
        return failures;
    }
    for (const path of ['available', 'manual']) {
        const result = outcome[path];
        if (result !== 'returned') {
            failures.push(`recordExposureEvent on the ${path} path: ${result === undefined ? 'the path was not reached' : result}. Next step: check the NimbusFeatures wiring and the fixture update the probe passes.`);
        }
    }
    const hosts = siftResolverHosts(resolverSlice ?? '');
    if (hosts.length > 0) {
        failures.push(`the probe window requested network: ${hosts.join(', ')} -- with MOZ_NORMANDY out the exposure call must make no request. Next step: check the NimbusFeatures wiring, then the capture for the host.`);
    }
    return failures;
}

function readText(root, rel) {
    try {
        return readFileSync(join(root, rel), 'utf8');
    } catch {
        return null;
    }
}

export function runChecks(root, overrides = {}) {
    const failures = [];
    const read = overrides.read ?? ((rel) => readText(root, rel));

    // --- 1. MOZ_NORMANDY is compiled out (the inert basis) ---
    const comparand = read(COMPARAND_REL);
    if (comparand === null) {
        failures.push(`${COMPARAND_REL} could not be read, so the compiled-out basis is unproven. Next step: restore it.`);
    } else if (!comparand.includes('imply_option("MOZ_NORMANDY", False)')) {
        failures.push(`${COMPARAND_REL} does not carry imply_option("MOZ_NORMANDY", False) -- the exposure call's inert basis is unproven. Next step: restore the imply_option.`);
    }

    // --- 2. the two recordExposureEvent calls are the ones probed ---
    const listener = read(LISTENER_REL);
    if (listener === null) {
        failures.push(`${LISTENER_REL} could not be read, so the probed call sites are unproven. Next step: restore the upstream file (never edit it).`);
    } else {
        const hits = [...listener.matchAll(/recordExposureEvent\(\{ once: true \}\)/g)].length;
        if (hits !== 2) {
            failures.push(`${LISTENER_REL} carries ${hits} recordExposureEvent({ once: true }) calls but the probe covers 2 (available + manual paths); a moved call site is a call site this probe does not cover. Next step: check the instrument (${SELF_REL}) against UpdateListener.sys.mjs.`);
        }
    }
    return { failures };
}

/** Byte sizes of the probe's resolver logs, keyed by file name. */
function snapshotLogs() {
    const sizes = new Map();
    if (!existsSync(LOG_DIR)) return sizes;
    for (const name of readdirSync(LOG_DIR)) {
        if (LOG_NAME_RE.test(name)) sizes.set(name, statSync(join(LOG_DIR, name)).size);
    }
    return sizes;
}

/** The resolver text appended to any probe log since `before`. */
function sliceLogsSince(before) {
    let text = '';
    for (const name of readdirSync(LOG_DIR)) {
        if (!LOG_NAME_RE.test(name)) continue;
        const buf = readFileSync(join(LOG_DIR, name));
        text += buf.subarray(before.get(name) ?? 0).toString('utf8');
    }
    return text;
}

async function runLive() {
    if (!existsSync(FIREFOX_BIN)) {
        console.error(`${NAME}: FAIL -- no built browser at ${FIREFOX_BIN}, so the probe window cannot be driven and no resolver capture exists. Next step: build the product (docs/BUILD.md, tier 3), then rerun node ${SELF_REL}.`);
        process.exit(1);
    }
    rmSync(LOG_DIR, { recursive: true, force: true });
    mkdirSync(LOG_DIR, { recursive: true });
    // Children inherit the environment: the capture is written by the browser.
    process.env.MOZ_LOG = 'nsHostResolver:5';
    process.env.MOZ_LOG_FILE = LOG_BASE;
    await runCheck(NAME, async ({ profile, fail }) => {
        const slice = await withShell(profile, async app => {
            const before = snapshotLogs();
            const text = await app.evaluateIn(app.chrome, PROBE_EXPRESSION);
            // The window is closed after the probe returns; the logs flush on
            // the browser's own schedule, so the slice is read after a short settle.
            await new Promise(resolve => setTimeout(resolve, 2000));
            let outcome = null;
            try {
                outcome = JSON.parse(text);
            } catch {
                outcome = null;
            }
            return { outcome, resolver: sliceLogsSince(before) };
        });
        for (const reason of probeFailures(slice.outcome, slice.resolver)) fail(reason);
    });
}

async function main() {
    if (args.includes('--self-test')) return selfTest();
    const { failures } = runChecks(REPO_ROOT);
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} problem(s) with the Nimbus exposure probe.`);
        failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    await runLive();
    return 0;
}

function selfTest() {
    const cache = new Map();
    const realRead = (rel) => {
        if (!cache.has(rel)) cache.set(rel, readText(REPO_ROOT, rel));
        return cache.get(rel);
    };
    const baseline = runChecks(REPO_ROOT, { read: realRead });
    if (baseline.failures.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- the unmodified tree is already red:`);
        baseline.failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    // Control: a silent double with an empty capture, and a complete live
    // outcome with an empty slice, are both green.
    const silent = { recordExposureEvent() {} };
    const control = probeExposure(silent, '');
    const liveControl = probeFailures({ available: 'returned', manual: 'returned' }, '');
    if (control.failures.length !== 0 || liveControl.length !== 0) {
        console.error(`${NAME}: --self-test FAIL -- the control is already red: ${[...control.failures, ...liveControl].join(' | ')}`);
        return 1;
    }
    console.log(`  ok  baseline -> static checks green; control -> silent double and complete live outcome green`);

    let failed = 0;
    const expect = (name, failures, needle) => {
        if (failures.some(f => f.includes(needle))) {
            console.log(`  ok  ${name} -> red naming '${needle}'`);
        } else {
            console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red naming '${needle}'; got: ${failures.join(' | ') || '(no failures)'}`);
            failed += 1;
        }
    };
    // Plant 1: a throwing double is red naming the throw.
    expect('throwing double', probeExposure({ recordExposureEvent() { throw new Error('boom'); } }, '').failures, 'threw');
    // Plant 2: a recording double (resolver observation non-empty) is red naming the host.
    expect('recording double', probeExposure({ recordExposureEvent() {} }, '[Parent 100: Socket Thread]: D/nsHostResolver Resolving host [telemetry.example.test] <Address family 0>.').failures, 'telemetry.example.test');
    // Plant 3: comparand without the imply_option line is red naming the comparand.
    expect('comparand-missing plant', runChecks(REPO_ROOT, {
        read: (rel) => (rel === COMPARAND_REL ? realRead(rel).replace('imply_option("MOZ_NORMANDY", False)', 'imply_option("MOZ_NORMANDY", True)') : realRead(rel)),
    }).failures, COMPARAND_REL);
    // Plant 4: a moved call site (one of the two recordExposureEvent calls removed) is red.
    expect('one probed call site removed', runChecks(REPO_ROOT, {
        read: (rel) => (rel === LISTENER_REL ? realRead(rel).replace('recordExposureEvent({ once: true })', 'noop()') : realRead(rel)),
    }).failures, 'recordExposureEvent({ once: true }) calls');
    // Plant 5: the live manual path never returns -- red naming the path.
    expect('live manual path threw', probeFailures({ available: 'returned', manual: 'threw: TypeError' }, ''), 'manual');
    // Plant 6: the live outcome is missing entirely -- red naming the probe.
    expect('no live outcome', probeFailures(null, ''), 'no outcome');
    // Plant 7: a host inside the probe window is red naming the host.
    expect('live window requested network', probeFailures({ available: 'returned', manual: 'returned' }, '[Parent 1: Socket Thread]: D/nsHostResolver Resolving host [telemetry.example.test] <Address family 0>.'), 'telemetry.example.test');

    if (failed > 0) return 1;
    console.log(`${NAME}: --self-test PASS -- seven planted faults went red naming their signal, and the control stayed green`);
    return 0;
}

const exitCode = await main();
if (exitCode !== undefined) process.exit(exitCode);
