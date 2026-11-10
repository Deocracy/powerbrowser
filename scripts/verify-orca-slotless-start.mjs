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
//  8. The web-tab half (P59-04): pairing.webClientUrl opened in a PB web tab
//     (pb-live-probe.mjs withProbeShell + openWebTab), the content context found by origin
//     (the client strips the fragment), then polled up to 30 s. Paired means the #pairing
//     fragment is gone from location and document.body.innerText shows the connected-host
//     marker, built from the two {{count}} templates of connectedHostCountLabel in
//     orca/src/renderer/src/components/status-bar/ssh-status-segment-copy.ts:3 (SshStatusSegment
//     renders it; spike 003 saw "1 host"), with {{count}} a positive integer. SshStatusSegment
//     also renders two visibility:hidden reserve spans ("1 host", "99 hosts"); innerText omits
//     them (checked live 2026-11-09), so only the visible count can match. No input is sent:
//     a connected state proves pairing with no prompt.
//
// The pairing URL is a reusable credential: it is never printed. Every write to stdout
// and stderr passes through redact() once the ready line is parsed, and every error
// message is redacted before it is built into a FAIL line. The self-test proves a
// sentinel pairing code reaches the capture unredacted and is removed when redacted.
//
// SKIP (one named line, exit 0, never a pass): no built orca/ (orca/out/orcad/orcad.js
// or orca/out/web/web-index.html missing), no built PowerBrowser (objdir/dist/bin/powerbrowser,
// or PB_FIREFOX_BIN), or any step-7 path exists on this host.
//
// Limit: the row proves start, version, bind, runtime count and teardown on linux-x64
// only; the other node-runtime.json platforms are not exercised here.
//
// Tier: full (needs a built orca/ and a built PowerBrowser, headless; no network unless the Node archive is absent from
// both this checkout's and the main checkout's .mozbuild/node-dist). --self-test is
// quick: fixtures only, no orcad, no browser, no network.
//
// Usage:
//   node scripts/verify-orca-slotless-start.mjs
//   node scripts/verify-orca-slotless-start.mjs --self-test

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import {
    REPO_ROOT, assertEnv, descendants, ensurePbNode, installOutputRedaction, installedOrcaPaths, nodeExesInTree,
    orcaVersionFromPins, orcadEnv, parseReady, redact, REDACTED as REDACTED_TOKEN, startOrcad, stopOrcad,
} from './lib/orca-run.mjs';
import { NODE_NAMES, walk } from './verify-orca-build-shape.mjs';
import { FIREFOX_BIN } from './lib/firefox-bidi.mjs';

const NAME = 'orca-slotless-start';
const SELF_REL = 'scripts/verify-orca-slotless-start.mjs';
const ORCA_DIR = join(REPO_ROOT, 'orca');
const MARKER_REL = 'src/renderer/src/components/status-bar/ssh-status-segment-copy.ts';
const MARKER_FN = 'connectedHostCountLabel';
const CLIENT_TIMEOUT_MS = 30000;

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
function skipReason({ orcaDir, home, pbBin }) {
    for (const rel of ['out/orcad/orcad.js', 'out/web/web-index.html']) {
        if (!existsSync(join(orcaDir, rel))) return `no built orca/ (orca/${rel} missing; run: nix develop .#orca --command bash scripts/build-orca.sh)`;
    }
    if (!existsSync(pbBin)) return `no built PowerBrowser (${pbBin} missing; see docs/BUILD.md "Firefox half")`;
    const installed = installedOrcaPaths(orcaDir, home).filter((p) => existsSync(p));
    if (installed.length) return `an installed Orca exists at ${installed.join(', ')}; orcad would start a hidden Electron from it (Pitfall 5)`;
    return null;
}

function nodeFilesUnder(dir) {
    const out = [];
    walk(dir, (p, kind) => { if (kind === 'file' && NODE_NAMES.has(basename(p))) out.push(p); });
    return out;
}

/**
 * The connected-host marker, derived from the source-built client: the two templates of
 * connectedHostCountLabel (orca/src/renderer/src/components/status-bar/ssh-status-segment-copy.ts:3,
 * rendered by SshStatusSegment.tsx in the status bar; spike 003 saw "1 host"). {{count}} becomes a
 * positive integer, so "0 hosts" is not connected.
 */
function deriveMarker(orcaDir) {
    let text = '';
    try { text = readFileSync(join(orcaDir, MARKER_REL), 'utf8'); } catch { /* reported below */ }
    const m = new RegExp(`export function ${MARKER_FN}\\b[\\s\\S]*?translate\\(\\s*'[^']+',\\s*'([^']*\\{\\{count\\}\\}[^']*)',[\\s\\S]*?defaultValue_one:\\s*'([^']*\\{\\{count\\}\\}[^']*)'`).exec(text);
    if (!m) throw new Error(`orca/${MARKER_REL} no longer declares ${MARKER_FN} with a {{count}} template (the source moved)`);
    const line = text.slice(0, m.index).split('\n').length;
    const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace('\\{\\{count\\}\\}', '[1-9]\\d*');
    const alts = [m[1], m[2]].sort((a, b) => b.length - a.length).map(esc).join('|');
    return { re: new RegExp(`(?:^|\\s)(${alts})(?=\\s|$)`), where: `orca/${MARKER_REL}:${line}` };
}

/** Pure: the client's state from a DOM read. */
function classifyClient({ hashHasPairing, text }, marker) {
    if (hashHasPairing) return { state: 'fragment-unconsumed' };
    const m = marker.re.exec(text ?? '');
    return m ? { state: 'paired', shown: m[1] } : { state: 'not-connected' };
}

function checkClient(result, text, secrets) {
    if (result.state === 'paired') return [];
    return [`web tab ${result.state} after ${CLIENT_TIMEOUT_MS / 1000}s (no connected-host marker${result.state === 'fragment-unconsumed' ? ' and the #pairing fragment still in location' : ''}); page text: ${JSON.stringify(redact(text ?? '', secrets).slice(0, 200))}. Next step: if the client at this pin no longer pairs from webClientUrl, this is the D-04 fallback decision (60-03 Task 2).`];
}

// --- live run ----------------------------------------------------------------

async function live() {
    const started = Date.now();
    let skip;
    try { skip = skipReason({ orcaDir: ORCA_DIR, pbBin: FIREFOX_BIN }); } catch (e) {
        console.error(`${NAME}: FAIL -- ${e.message}. Next step: update installedOrcaPaths in scripts/lib/orca-run.mjs to the new source.`);
        return 1;
    }
    if (skip) { console.log(`${NAME}: SKIP -- ${skip}`); return 0; }

    let node, orcaVersion, marker;
    try {
        marker = deriveMarker(ORCA_DIR);
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
        await probeOrcad(run, { node, env, profileDir, orcaVersion, marker, fails });
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
        console.log(`${NAME}: PASS -- orcad ${orcaVersion} ready on ws://127.0.0.1:${run.port}, Node ${node.version} (node-runtime.json), 1 Node runtime, web tab paired (status bar '${run.shown}', marker from ${marker.where}), orcad and terminal daemon reaped (${secs}s)`);
        return 0;
    } finally {
        run.restore();
    }
}

// Steps 3-5 while orcad runs; every red reason goes to `fails`, teardown is the caller's.
async function probeOrcad(run, { node, env, profileDir, orcaVersion, marker, fails }) {
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
    if (!fails.length) await pairWebTab(run, { marker, fails });

    const paths = new Set([realpathSync(node.path), ...nodeExesInTree([child.pid, ready.daemonPid]), ...nodeFilesUnder(join(ORCA_DIR, 'out'))]);
    fails.push(...checkRuntimes([...paths].map((p) => ({ path: p, sha256: sha256(p) }))));
}

// P59-04: the source-built client opened from webClientUrl in a PB web tab pairs with no input.
async function pairWebTab(run, { marker, fails }) {
    const { ready } = run;
    if (!ready.webClientUrl) {
        fails.push('the ready line carries no pairing.webClientUrl (pairing unavailable). Next step: check orcad --web-client-root orca/out/web and the pairing reason at the pin.');
        return;
    }
    const { withProbeShell, openWebTab, pollFor } = await import('./lib/pb-live-probe.mjs');
    const origin = new URL(ready.webClientUrl).origin;
    const READ = `JSON.stringify({ hashHasPairing: location.hash.includes('pairing='), text: document.body ? document.body.innerText : '' })`;
    try {
        await withProbeShell(async (app) => {
            await openWebTab(app, ready.webClientUrl);
            // By origin, never by full URL: the client strips the fragment after reading it.
            const ctx = await pollFor(async () => (await app.contexts()).find((c) => c.url.startsWith(origin)), CLIENT_TIMEOUT_MS, 'a content context on the orcad origin');
            let read = { hashHasPairing: true, text: '' };
            let result = { state: 'not-connected' };
            const until = Date.now() + CLIENT_TIMEOUT_MS;
            while (Date.now() < until) {
                try { read = JSON.parse(await app.evaluateIn(ctx.context, READ)); } catch { /* still loading */ }
                result = classifyClient(read, marker);
                if (result.state === 'paired') break;
                await new Promise((r) => setTimeout(r, 500));
            }
            run.shown = result.shown;
            fails.push(...checkClient(result, read.text, ready.secrets));
        });
    } catch (e) {
        fails.push(`the PowerBrowser web tab could not be driven: ${redact(e.message, ready.secrets).slice(0, 300)}. Next step: check that objdir/dist/bin/powerbrowser and the Theia app start (docs/BUILD.md), then re-run: node scripts/verify-orca-slotless-start.mjs`);
    }
}

function report(fails) {
    for (const f of fails) console.error(`${NAME}: FAIL -- ${f}`);
    return 1;
}

// --- self-test ---------------------------------------------------------------

const SENTINEL = 'SENTINEL-PAIRING-60';

function fixtureReadyLine({ boundEndpoint, nodeVersion }) {
    const offer = `orca://pair?code=${SENTINEL}`;
    return JSON.stringify({
        type: 'orca_server_ready', schemaVersion: 1, runtimeId: 'fixture', boundEndpoint,
        pairing: { available: true, url: offer, webClientUrl: `http://127.0.0.1:41000/web-index.html#pairing=${encodeURIComponent(offer)}` },
        health: { nodeVersion, terminalDaemon: { pid: 4242 } },
    });
}

// Captures what report() writes to stderr, with or without the live run's output redaction.
function captureReport(fails, secrets) {
    let buf = '';
    const write = process.stderr.write;
    process.stderr.write = (chunk) => { buf += String(chunk); return true; };
    const restore = secrets ? installOutputRedaction(secrets) : () => {};
    try { report(fails); } finally { restore(); process.stderr.write = write; }
    return buf;
}

function selfTest() {
    const tmp = mkdtempSync(join(tmpdir(), 'orca-slotless-selftest-'));
    let misses = 0;
    const ok = (label) => console.log(`  ok ${label}`);
    const miss = (label, why) => { misses++; console.error(`  MISS ${label}: ${why}`); };
    const red = (label, fails, naming) => {
        const text = fails.join(' | ');
        if (fails.length && text.includes(naming)) ok(`${label} -> red, naming '${naming}'`);
        else miss(label, fails.length ? `red without naming '${naming}': ${text}` : 'stayed green');
    };
    try {
        // Fixture orca/: entry points, a marker source with synthetic templates (a pass proves
        // the marker was derived, not written here) and a browser-provider source.
        const orcaDir = join(tmp, 'orca');
        const home = join(tmp, 'home');
        for (const rel of ['out/orcad/orcad.js', 'out/web/web-index.html']) {
            mkdirSync(join(orcaDir, rel, '..'), { recursive: true });
            writeFileSync(join(orcaDir, rel), '');
        }
        mkdirSync(join(orcaDir, MARKER_REL, '..'), { recursive: true });
        writeFileSync(join(orcaDir, MARKER_REL), `import { translate } from '@/i18n/i18n'\n\nexport function ${MARKER_FN}(count: number): string {\n  return translate(\n    'fixture.key',\n    '{{count}} fixture-runtimes',\n    { count, defaultValue_one: '{{count}} fixture-runtime' }\n  )\n}\n`);
        const providerRel = 'src/main/orcad/orcad-browser-provider.ts';
        const installed = join(tmp, 'opt', 'Orca', 'orca-ide');
        mkdirSync(join(orcaDir, providerRel, '..'), { recursive: true });
        writeFileSync(join(orcaDir, providerRel), `  return [\n    joinPath(homePath, '.local', 'bin', 'orca-ide'),\n    '${installed}'\n  ]\n`);

        const pinned = JSON.parse(readFileSync(join(REPO_ROOT, 'powerbrowser/packaging/node-runtime.json'), 'utf8'))['linux-x64'].version.replace(/^v/, '');
        const good = parseReady(fixtureReadyLine({ boundEndpoint: 'ws://127.0.0.1:41000', nodeVersion: pinned }));
        const marker = deriveMarker(orcaDir);
        const profileDir = join(tmp, 'profile');
        const base = { PATH: '/bin', ORCA_PAIRING_CODE: 'x', ORCA_USER_DATA_PATH: '/real/profile', NODE_OPTIONS: '--require=/x.js' };
        const env = orcadEnv(base, { profileDir, orcaVersion: '0.0.0-fixture' });
        const runtimeA = { path: '/a/node', sha256: 'a'.repeat(64) };

        // Green control: every check passes on the good fixture.
        const control = [
            ...checkReady(good, pinned),
            ...checkRuntimes([runtimeA, { path: '/a/link/node', sha256: runtimeA.sha256 }]),
            ...checkSurvivors([], { orcadPid: 4241, daemonPid: 4242 }),
            ...assertEnv(env, { profileDir, orcaVersion: '0.0.0-fixture' }),
            ...checkClient(classifyClient({ hashHasPairing: false, text: 'repo  1 fixture-runtime  main' }, marker), '', good.secrets),
        ];
        if (good.daemonPid !== 4242) control.push(`parseReady daemonPid ${good.daemonPid}`);
        if (!(good.secrets.length && good.secrets.includes(SENTINEL))) control.push('parseReady did not list the pairing code as a secret');
        if ([...descendants(new Map([[2, 1], [3, 2], [4, 9]]), [1])].sort().join() !== '1,2,3') control.push('descendants walk');
        const skipped = skipReason({ orcaDir, home, pbBin: join(orcaDir, 'out/web/web-index.html') });
        if (skipped) control.push(`clean fixture skipped: ${skipped}`);
        if (control.length) miss('control', control.join(' | ')); else ok('control -> green');

        red('bind 0.0.0.0', checkReady({ ...good, boundEndpoint: 'ws://0.0.0.0:6768' }, pinned), '0.0.0.0');
        red('bundled Node version', checkReady({ ...good, nodeVersion: '24.22.1' }, pinned), '24.22.1');
        red('second runtime', checkRuntimes([runtimeA, { path: '/orca/out/runtimes/node', sha256: 'b'.repeat(64) }]), '2 Node runtimes');
        red('inherited ORCA_PAIRING_CODE', assertEnv({ ...env, ORCA_PAIRING_CODE: 'x' }, { profileDir, orcaVersion: '0.0.0-fixture' }), 'ORCA_PAIRING_CODE');
        red('fragment unconsumed', checkClient(classifyClient({ hashHasPairing: true, text: '1 fixture-runtime' }, marker), '', good.secrets), 'fragment-unconsumed');
        red('no connected marker', checkClient(classifyClient({ hashHasPairing: false, text: 'repo  0 fixture-runtimes' }, marker), '', good.secrets), 'not-connected');
        red('daemon survivor', checkSurvivors([4242], { orcadPid: 4241, daemonPid: 4242 }), 'terminal daemon 4242 survived');

        // Leak plant: a forced failure carrying the fixture URL through report().
        const leak = [`opening the web tab failed for ${good.webClientUrl}. Next step: none (fixture).`];
        const off = captureReport(leak, null);
        if (off.includes(SENTINEL)) ok(`leak, redaction off -> capture sees ${SENTINEL}`);
        else miss('leak, redaction off', 'the capture did not see the sentinel, so the redaction-on case proves nothing');
        const on = captureReport(leak, good.secrets) + redact(`orca://pair?code=${SENTINEL.toLowerCase()}`, []);
        if (!on.toUpperCase().includes(SENTINEL) && on.includes(REDACTED_TOKEN)) ok(`leak, redaction on -> red, naming '${REDACTED_TOKEN}'`);
        else miss('leak, redaction on', 'the sentinel survived redaction');

        mkdirSync(join(installed, '..'), { recursive: true });
        writeFileSync(installed, '');
        const skip = skipReason({ orcaDir, home, pbBin: join(orcaDir, 'out/web/web-index.html') });
        if (skip && skip.includes(installed)) ok('installed Orca -> SKIP');
        else miss('installed Orca', skip ? `SKIP without naming the path: ${skip}` : 'did not SKIP');
    } catch (e) {
        miss('self-test', e.message);
    } finally {
        rmSync(tmp, { recursive: true, force: true });
    }
    console.log(`${NAME} self-test: ${misses === 0 ? 'PASS -- every planted fault went red naming the drift' : `FAIL -- ${misses} case(s) missed`}`);
    return misses === 0 ? 0 : 1;
}

const args = process.argv.slice(2);
for (const a of args) {
    if (a !== '--self-test') {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'. Next step: run: node ${SELF_REL}, or add --self-test.`);
        process.exit(2);
    }
}
process.exit(args.includes('--self-test') ? selfTest() : await live());
