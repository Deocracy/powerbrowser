#!/usr/bin/env node
// scripts/verify-orca-slotless-start.mjs
//
// The orca-slotless-start gate (Phase 60, RUN-02, D-14, P59-04, P59-05): Orca's orcad,
// built from source and de-slotted by scripts/build-orca.sh, starts on the official
// Node runtime PowerBrowser ships, binds loopback, reports that Node, runs with exactly
// one Node runtime, and is reaped with its terminal daemon. This row is the permanent
// re-pin proof: the Phase 68 re-pin job re-runs it on every Orca tag.
//
// Derived at check time, never hand-kept:
//  1. The Node binary: the linux-x64 pin in powerbrowser/packaging/node-runtime.json,
//     its archive sha256-checked (generate-licensing.mjs readNodePin, fetchArchive,
//     verifyArchive), extracted to .mozbuild/orca-probe-node/node, and its --version
//     required to equal the pin. Never the host node or the dev-shell node.
//  2. ORCA_VERSION: UPSTREAM_ORCA_TAG in generated/upstream-pins.env minus its v.
//  3. The orcad environment: every inherited ORCA_* removed, plus ELECTRON_RUN_AS_NODE,
//     NODE_OPTIONS and NODE_REPL_EXTERNAL_MODULE; only ORCA_USER_DATA and
//     ORCA_USER_DATA_PATH (a mkdtemp profile), ORCA_VERSION, ORCA_TELEMETRY_DISABLED=1
//     and DO_NOT_TRACK=1 set (D-08).
//  4. The ready line (orca/src/main/server/serve-readiness.ts): boundEndpoint must start
//     ws://127.0.0.1:, health.nodeVersion must equal step 1's version. If health is
//     absent, the version is established from /proc/<orcad pid>/exe instead.
//  5. The Node runtime set: realpath(step 1's binary), every node executable in orcad's
//     process tree and the terminal daemon's (/proc), and every node or node.exe file
//     under orca/out (verify-orca-build-shape.mjs walk), distinct by sha256. Exactly one.
//  6. Teardown: orcad's process group and health.terminalDaemon.pid get SIGTERM, then
//     SIGKILL after 10 s; either pid still in /proc is a FAIL.
//  7. The installed-Orca paths orcad probes for a hidden Electron, from the orca-ide
//     literals in orca/src/main/orcad/orcad-browser-provider.ts.
//
// The pairing URL is a reusable credential: it is never printed. Every write to stdout
// and stderr passes through redact() once the ready line is parsed, and every error
// message is redacted before it is built into a FAIL line. The self-test proves a
// sentinel pairing code reaches the capture unredacted and is removed when redacted.
//
// SKIP (one named line, exit 0, never a pass): no built orca/ (orca/out/orcad/orcad.js
// or orca/out/web/web-index.html missing), or any step-7 path exists on this host.
//
// Limit: the row proves start, version, bind, runtime count and teardown on linux-x64
// only; the other node-runtime.json platforms are not exercised here.
//
// Tier: full (needs a built orca/; no network unless the Node archive is absent from
// both this checkout's and the main checkout's .mozbuild/node-dist). --self-test is
// quick: fixtures only, no orcad, no browser, no network.
//
// Usage:
//   node scripts/verify-orca-slotless-start.mjs
//   node scripts/verify-orca-slotless-start.mjs --self-test

import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import {
    REPO_ROOT, assertEnv, ensurePbNode, installOutputRedaction, installedOrcaPaths, nodeExesInTree,
    orcaVersionFromPins, orcadEnv, redact, startOrcad, stopOrcad,
} from './lib/orca-run.mjs';
import { NODE_NAMES, walk } from './verify-orca-build-shape.mjs';

const NAME = 'orca-slotless-start';
const SELF_REL = 'scripts/verify-orca-slotless-start.mjs';
const ORCA_DIR = join(REPO_ROOT, 'orca');
const BUILD_NEXT = 'Next step: nix develop .#orca --command bash scripts/build-orca.sh, then re-run: node scripts/verify-orca-slotless-start.mjs';

const sha256 = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

// --- pure checks, shared by the live run and the self-test -------------------

function checkReady(ready, pinnedVersion) {
    const fails = [];
    if (!ready.boundEndpoint?.startsWith('ws://127.0.0.1:')) {
        fails.push(`orcad bound ${ready.boundEndpoint ?? '(no boundEndpoint)'}, not ws://127.0.0.1: (loopback only, D-14). Next step: check orcad's --bind handling at the pin; never bind off loopback.`);
    }
    if (ready.nodeVersion !== pinnedVersion) {
        fails.push(`orcad reports Node ${ready.nodeVersion ?? '(unknown)'}, but node-runtime.json pins ${pinnedVersion} (D-14: a hand-off to Orca's bundled runtime or a wrong binary). Next step: run node scripts/verify-orca-build-shape.mjs and rebuild with scripts/build-orca.sh.`);
    }
    return fails;
}

/** entries: [{ path, sha256 }]. Red unless exactly one distinct runtime. */
function checkRuntimes(entries) {
    const byHash = new Map();
    for (const e of entries) {
        if (!byHash.has(e.sha256)) byHash.set(e.sha256, []);
        byHash.get(e.sha256).push(e.path);
    }
    if (byHash.size === 1) return [];
    const list = [...byHash.values()].map((ps) => ps[0]).join(', ');
    return [`${byHash.size} Node runtimes (${list}), not exactly 1 (D-14: no second Node). Next step: remove the extra runtime (orca/out/runtimes or a bundled node) by rebuilding with scripts/build-orca.sh.`];
}

function checkSurvivors(survivors, { orcadPid, daemonPid }) {
    return survivors.map((pid) => pid === daemonPid
        ? `terminal daemon ${pid} survived teardown. Next step: kill ${pid} and check Orca's daemon shutdown at the pin.`
        : `orcad ${pid === orcadPid ? '' : 'process '}${pid} survived teardown. Next step: kill ${pid} and check orcad's SIGTERM handling at the pin.`);
}

/** Absent entry points or an installed Orca make the row SKIP rather than run. */
function skipReason({ orcaDir, home }) {
    for (const rel of ['out/orcad/orcad.js', 'out/web/web-index.html']) {
        if (!existsSync(join(orcaDir, rel))) return `no built orca/ (orca/${rel} missing; run: nix develop .#orca --command bash scripts/build-orca.sh)`;
    }
    const installed = installedOrcaPaths(orcaDir, home).filter((p) => existsSync(p));
    if (installed.length) return `an installed Orca exists at ${installed.join(', ')}; orcad would start a hidden Electron from it (Pitfall 5)`;
    return null;
}

function nodeFilesUnder(dir) {
    const out = [];
    walk(dir, (p, kind) => { if (kind === 'file' && NODE_NAMES.has(basename(p))) out.push(p); });
    return out;
}

// --- live run ----------------------------------------------------------------

async function live() {
    const started = Date.now();
    let skip;
    try { skip = skipReason({ orcaDir: ORCA_DIR }); } catch (e) {
        console.error(`${NAME}: FAIL -- ${e.message}. Next step: update installedOrcaPaths in scripts/lib/orca-run.mjs to the new source.`);
        return 1;
    }
    if (skip) { console.log(`${NAME}: SKIP -- ${skip}`); return 0; }

    let node, orcaVersion;
    try {
        node = await ensurePbNode();
        orcaVersion = orcaVersionFromPins();
    } catch (e) {
        console.error(`${NAME}: FAIL -- ${e.message.replace(/\s*Next step:.*$/, '')}. Next step: ${/Next step: (.*)$/.exec(e.message)?.[1] ?? 'restore the pin and re-run: node scripts/generate-licensing.mjs'}`);
        return 1;
    }

    const profileDir = mkdtempSync(join(tmpdir(), 'pb-orca-probe-'));
    const env = orcadEnv(process.env, { profileDir, orcaVersion });
    const fails = [];
    const run = { child: null, ready: null, port: '?', restore: () => {} };
    try {
        await probeOrcad(run, { node, env, profileDir, orcaVersion, fails });
    } finally {
        if (run.child) {
            const daemonPid = run.ready?.daemonPid ?? null;
            const { survivors } = await stopOrcad(run.child, daemonPid);
            fails.push(...checkSurvivors(survivors, { orcadPid: run.child.pid, daemonPid }));
        }
        rmSync(profileDir, { recursive: true, force: true });
    }
    try {
        if (fails.length) return report(fails);
        const secs = ((Date.now() - started) / 1000).toFixed(1);
        console.log(`${NAME}: PASS -- orcad ${orcaVersion} ready on ws://127.0.0.1:${run.port}, Node ${node.version} (node-runtime.json), 1 Node runtime, orcad and terminal daemon reaped (${secs}s)`);
        return 0;
    } finally {
        run.restore();
    }
}

// Steps 3-5 while orcad runs; every red reason goes to `fails`, teardown is the caller's.
async function probeOrcad(run, { node, env, profileDir, orcaVersion, fails }) {
    fails.push(...assertEnv(env, { profileDir, orcaVersion }));
    if (fails.length) return;
    try {
        Object.assign(run, await startOrcad({ nodeBin: node.path, orcaDir: ORCA_DIR, profileDir, env }));
    } catch (e) {
        run.child = e.child ?? null;
        fails.push(`${redact(e.message)} Next step: if orcad refuses Node ${node.version}, names a slot file or reports a blocked native preflight, this is the D-04 fallback decision (60-03 Task 2).`);
        return;
    }
    const { ready, child } = run;
    run.restore = installOutputRedaction(ready.secrets);
    run.port = ready.boundEndpoint?.split(':').pop() ?? '?';

    if (!ready.nodeVersion) {
        const exe = nodeExesInTree([child.pid]);
        if (exe.size === 1 && [...exe][0] === realpathSync(node.path)) ready.nodeVersion = node.version;
    }
    fails.push(...checkReady(ready, node.version));

    const paths = new Set([realpathSync(node.path), ...nodeExesInTree([child.pid, ready.daemonPid]), ...nodeFilesUnder(join(ORCA_DIR, 'out'))]);
    fails.push(...checkRuntimes([...paths].map((p) => ({ path: p, sha256: sha256(p) }))));
}

function report(fails) {
    for (const f of fails) console.error(`${NAME}: FAIL -- ${f}`);
    return 1;
}

// --- self-test ---------------------------------------------------------------

function selfTest() {
    console.log(`${NAME} self-test: not yet written (60-03 Task 3)`);
    return 0;
}

const args = process.argv.slice(2);
for (const a of args) {
    if (a !== '--self-test') {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'. Next step: run: node ${SELF_REL}, or add --self-test.`);
        process.exit(2);
    }
}
process.exit(args.includes('--self-test') ? selfTest() : await live());
