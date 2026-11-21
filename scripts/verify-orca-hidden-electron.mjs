#!/usr/bin/env node
// scripts/verify-orca-hidden-electron.mjs
//
// RUN-04 (Phase 62, plan 62-02, P62-14, D-10): an orcad started the way
// PowerBrowser starts it never launches an installed Orca desktop as a hidden
// Electron browser engine. orcad looks for one at every start, in the
// background, at four paths of which three are absolute; the overlay seam in
// src/main/orcad/orcad-browser-provider.ts (lane p62-01) makes that lookup
// return nothing when the switch OrcaEnv puts in every orcad environment is
// set.
//
// The proof is an absence, so the detectors are proven first (CLAUDE.md
// verification rule 1). One built orcad is run twice against an executable
// decoy at ~/.local/bin/orca-ide:
//   stock run     the switch deleted from the environment. orcad must launch
//                 the decoy, which shows as two things orcad itself emits: its
//                 sidecar profile record file in the data root, and its
//                 "Installed Electron browser provider" warning on stderr.
//                 Either one missing is FAIL "detector blind".
//   switched run  the environment exactly as OrcaEnv.buildOrcadEnv builds it.
//                 After the larger of 10 s and twice the stock latency, both
//                 detectors must be absent and orcad still running.
//
// Derived at check time, never hand-kept:
//  1. The switch name: OrcaEnv.ORCAD_HIDDEN_ELECTRON_SWITCH, the constant the
//     supervisor uses.
//  2. The seam: the row of orca-overlay/seams.json for the provider file, the
//     added lines of its patch (they must name the switch), and the built
//     orcad (some .js under orca/out/orcad must contain the switch, else the
//     build predates the seam).
//  3. The record file name: PROFILE_RECORD_FILE in
//     orca/src/main/orcad/electron-sidecar-profile.ts. The warning text: the
//     console.warn literal containing "Installed Electron browser provider" in
//     the provider file.
//  4. The installed-Orca paths (scripts/lib/orca-run.mjs installedOrcaPaths).
//     If an absolute one exists on this host the check SKIPs, because the
//     stock run would start that real application.
//  5. The Node binary: the pinned one from ensurePbNode(). The decoy is a
//     symlink to it: orcad skips a candidate that starts with #!, so a shell
//     script decoy would never be launched and the stock run would prove
//     nothing.
//
// Why a scratch HOME here: it is the harness. The decoy has to sit at
// <HOME>/.local/bin/orca-ide and must not be written into the user's real
// home. The product never changes HOME; agents need the user's own.
//
// Every orcad environment is built from scratch (PATH and the scratch HOME
// only), so nothing inherited from this shell reaches orcad. orcad's stdout
// is parsed by OrcaEnv's sink and never printed. Teardown signals only pids
// this run recorded, each re-checked against its start ticks.
//
// Tier: full (needs a built orca/ with the seam; starts orcad twice, no
// browser, no display). --self-test is quick and hermetic: a fixture Orca
// tree whose orcad is a stand-in Node script, seven cases.
//
// Usage:
//   node scripts/verify-orca-hidden-electron.mjs
//   node scripts/verify-orca-hidden-electron.mjs --self-test

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SKIP_EXIT, skipLine } from './lib/skip-verdict.mjs';

import * as RealOrcaEnv from '../powerbrowser/shell/OrcaEnv.sys.mjs';
import { BROWSER_PROVIDER_REL, descendants, ensurePbNode, installOutputRedaction, installedOrcaPaths } from './lib/orca-run.mjs';
import { liveEnv } from './lib/firefox-bidi.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'orca-hidden-electron';
const SELF_REL = 'scripts/verify-orca-hidden-electron.mjs';
const PROFILE_REL = 'src/main/orcad/electron-sidecar-profile.ts';
const WARN_PHRASE = 'Installed Electron browser provider';
const BUILD_NEXT = 'Next step: nix develop .#orca --command bash scripts/build-orca.sh';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const read = (path) => { try { return readFileSync(path, 'utf8'); } catch { return null; } };

/** Start ticks of a live pid; null when it is gone or a zombie. */
export function startTicks(pid) {
    const stat = read(`/proc/${pid}/stat`);
    if (!stat) return null;
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    return fields[0] === 'Z' ? null : fields[19] ?? null;
}
export function ppidMap() {
    const map = new Map();
    for (const name of readdirSync('/proc')) {
        if (!/^\d+$/.test(name)) continue;
        const stat = read(`/proc/${name}/stat`);
        if (stat) map.set(Number(name), Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]));
    }
    return map;
}
/** Signals `pid` only while it is still the process recorded with `ticks`. */
export function signalIdentity(pid, ticks, sig) {
    if (!Number.isInteger(pid) || pid <= 0 || ticks === null || startTicks(pid) !== ticks) return false;
    try { process.kill(pid, sig); return true; } catch { return false; }
}

export async function freePort(env) {
    for (let i = 0; i < 50; i++) {
        const port = 20000 + Math.floor(Math.random() * 12000);
        if (port < env.PORT_MIN || port > env.PORT_MAX) continue;
        const ok = await new Promise((r) => {
            const s = createServer();
            s.once('error', () => r(false));
            s.listen(port, '127.0.0.1', () => s.close(() => r(true)));
        });
        if (ok) return port;
    }
    throw new Error('no free loopback port found between 20000 and 32000');
}

function jsContains(dir, needle) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules') continue;
        const p = join(dir, entry.name);
        if (entry.isDirectory()) { if (jsContains(p, needle)) return true; } else if (entry.name.endsWith('.js') && (read(p) ?? '').includes(needle)) return true;
    }
    return false;
}

/** Steps (b) and (c): the seam and the detectors, all from files. Returns { fails, recordFile, warnText }. */
function derive({ orcaDir, overlayDir, OrcaEnv }) {
    const fails = [];
    const SWITCH = OrcaEnv.ORCAD_HIDDEN_ELECTRON_SWITCH;
    let seams = null;
    try { seams = JSON.parse(readFileSync(join(overlayDir, 'seams.json'), 'utf8')).seams; } catch { /* reported as a missing row */ }
    const row = Array.isArray(seams) ? seams.find((s) => s && s.path === BROWSER_PROVIDER_REL) : null;
    if (!row) {
        fails.push(`orca-overlay/seams.json has no seam row for ${BROWSER_PROVIDER_REL} (the hidden-Electron seam of plan 62-01)`);
    } else {
        const added = (read(join(overlayDir, String(row.patch))) ?? '').split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++'));
        if (!added.some((l) => l.includes(SWITCH))) fails.push(`the seam patch orca-overlay/${row.patch} adds no line naming ${SWITCH}, the switch OrcaEnv sets`);
        else if (!jsContains(join(orcaDir, 'out', 'orcad'), SWITCH)) fails.push(`no .js under orca/out/orcad contains ${SWITCH}: the built orcad predates the seam. ${BUILD_NEXT}`);
    }
    const recordFile = /const PROFILE_RECORD_FILE = '([^']+)'/.exec(read(join(orcaDir, PROFILE_REL)) ?? '')?.[1] ?? null;
    const warnRe = new RegExp(`console\\.warn\\(\\s*'([^']*${WARN_PHRASE}[^']*)'`);
    const warnText = warnRe.exec(read(join(orcaDir, BROWSER_PROVIDER_REL)) ?? '')?.[1] ?? null;
    if (!recordFile) fails.push(`source moved: orca/${PROFILE_REL} no longer declares PROFILE_RECORD_FILE, the record orcad writes before it launches Electron`);
    if (!warnText) fails.push(`source moved: orca/${BROWSER_PROVIDER_REL} has no console.warn literal containing "${WARN_PHRASE}"`);
    return { fails, recordFile, warnText };
}

/**
 * One orcad run. Resolves { fail } or { latencyMs, seen: { record, warn }, alive }.
 * `mode` is 'stock' (switch deleted, poll until both detectors or detectTimeoutMs) or 'switched'
 * (environment as built, wait quietMs, then read the detectors once).
 */
async function runOrcad({ mode, nodeBin, orcaDir, OrcaEnv, home, dataRoot, port, recordFile, warnText, readyTimeoutMs, detectTimeoutMs, quietMs }) {
    rmSync(dataRoot, { recursive: true, force: true });
    mkdirSync(dataRoot, { recursive: true, mode: 0o700 });
    const version = (() => { try { return JSON.parse(readFileSync(join(orcaDir, 'package.json'), 'utf8')).version; } catch { return null; } })() || '0.0.0';
    const base = { PATH: process.env.PATH ?? '', HOME: home };
    const env = OrcaEnv.buildOrcadEnv((name) => base[name] ?? '', { dataRoot, orcaVersion: version, claudeAgentSdkDir: '' });
    if (mode === 'stock') delete env[OrcaEnv.ORCAD_HIDDEN_ELECTRON_SWITCH];
    const args = OrcaEnv.buildOrcadArgs({ orcadMain: join(orcaDir, 'out', 'orcad', 'orcad.js'), port, webClientRoot: join(orcaDir, 'out', 'web') });

    const lines = [];
    const sink = OrcaEnv.createOutputSink({ pushLog: (l) => { lines.push(l); if (lines.length > 400) lines.shift(); } });
    const child = spawn(nodeBin, args, { cwd: dataRoot, env: liveEnv(env), stdio: ['ignore', 'pipe', 'pipe'] });
    let exited = null;
    const exit = new Promise((r) => {
        child.once('exit', (code, signal) => { exited = signal ?? `code ${code}`; r(); });
        child.once('error', (e) => { exited = `spawn error ${e.message}`; r(); });
    });
    child.stdout.on('data', (d) => sink.onStdout(String(d)));
    child.stderr.on('data', (d) => sink.onStderr(String(d)));
    const orcadTicks = child.pid ? startTicks(child.pid) : null;
    const tail = () => lines.slice(-5).join(' | ').slice(-500);
    let daemonPid = null;
    let daemonTicks = null;
    try {
        const ready = await Promise.race([sink.ready(), exit.then(() => null), sleep(readyTimeoutMs).then(() => null)]);
        if (!ready) return { fail: `${mode} run: orcad ${exited ? `exited (${exited})` : `printed no ready line within ${readyTimeoutMs} ms`}; stderr: ${tail()}` };
        if (!OrcaEnv.isLoopbackEndpoint(ready.boundEndpoint, port)) return { fail: `${mode} run: orcad reported ${ready.boundEndpoint}, not loopback port ${port}` };
        daemonPid = ready.daemonPid;
        daemonTicks = daemonPid ? startTicks(daemonPid) : null;

        const seen = () => ({ record: existsSync(join(dataRoot, recordFile)), warn: lines.some((l) => l.includes(warnText)) });
        const began = Date.now();
        if (mode === 'stock') {
            while (Date.now() - began < detectTimeoutMs && !(seen().record && seen().warn)) await sleep(100);
        } else {
            await sleep(quietMs);
        }
        return { latencyMs: Date.now() - began, seen: seen(), alive: exited === null, exited, tail: tail() };
    } finally {
        // By recorded pid only: orcad, its terminal daemon, then whatever of their tree is left.
        const tree = [...descendants(ppidMap(), [child.pid, daemonPid])].map((pid) => [pid, startTicks(pid)]);
        if (exited === null) {
            signalIdentity(child.pid, orcadTicks, 'SIGTERM');
            await Promise.race([exit, sleep(16000)]);
            if (exited === null) signalIdentity(child.pid, orcadTicks, 'SIGKILL');
        }
        if (signalIdentity(daemonPid, daemonTicks, 'SIGTERM')) {
            for (let i = 0; i < 30 && startTicks(daemonPid) === daemonTicks; i++) await sleep(100);
        }
        for (const [pid, ticks] of tree) signalIdentity(pid, ticks, 'SIGKILL');
        // The record file outlives orcad; the next run must start without it.
        rmSync(dataRoot, { recursive: true, force: true });
    }
}

const elfDecoy = (path, nodeBin) => symlinkSync(nodeBin, path);

/**
 * The whole check. options: orcaDir, overlayDir, nodeBin (a path, or a function resolving one, called
 * only when the run is not skipped), OrcaEnv, and for the self-test the timings and makeDecoy.
 * Resolves { skip } | { fails } | { pass: { stockMs, switchedMs, recordFile } }.
 */
export async function run(options) {
    const { orcaDir, overlayDir, OrcaEnv = RealOrcaEnv, makeDecoy = elfDecoy,
        readyTimeoutMs = 60000, detectTimeoutMs = 20000, minQuietMs = 10000 } = options;
    if (!existsSync(join(orcaDir, 'out', 'orcad', 'orcad.js'))) {
        return { skip: `no built orca/ (orca/out/orcad/orcad.js missing; run: nix develop .#orca --command bash scripts/build-orca.sh)` };
    }
    let installed;
    try { installed = installedOrcaPaths(orcaDir, '/nonexistent-home').filter((p) => !p.startsWith('/nonexistent-home/') && existsSync(p)); } catch (e) {
        return { fails: [`source moved: ${e.message}`] };
    }
    if (installed.length) return { skip: `an installed Orca exists at ${installed.join(', ')}; the stock run would start it` };

    const d = derive({ orcaDir, overlayDir, OrcaEnv });
    if (d.fails.length) return { fails: d.fails };

    const nodeBin = typeof options.nodeBin === 'function' ? await options.nodeBin() : options.nodeBin;
    const baseDir = mkdtempSync(join(process.env.XDG_RUNTIME_DIR || tmpdir(), 'pb-he-'));
    try {
        const home = join(baseDir, 'h');
        const dataRoot = join(baseDir, 'd');
        if (!OrcaEnv.socketPathFits(dataRoot)) return { fails: [`the scratch data root ${dataRoot} is too long for orcad's socket path; set XDG_RUNTIME_DIR to a short directory`] };
        mkdirSync(join(home, '.local', 'bin'), { recursive: true });
        makeDecoy(join(home, '.local', 'bin', 'orca-ide'), nodeBin);
        const common = { nodeBin, orcaDir, OrcaEnv, home, dataRoot, recordFile: d.recordFile, warnText: d.warnText, readyTimeoutMs, detectTimeoutMs };

        const stock = await runOrcad({ ...common, mode: 'stock', port: await freePort(OrcaEnv) });
        if (stock.fail) return { fails: [stock.fail] };
        const blind = [!stock.seen.record && `${d.recordFile} was not written to the data root`, !stock.seen.warn && `the "${d.warnText}" warning was not printed`].filter(Boolean);
        if (blind.length) {
            return { fails: [`detector blind: with the switch unset orcad did not show a launch of the decoy within ${detectTimeoutMs} ms (${blind.join('; ')}), so an absence with the switch set would prove nothing`] };
        }

        const quietMs = Math.max(minQuietMs, 2 * stock.latencyMs);
        const switched = await runOrcad({ ...common, mode: 'switched', port: await freePort(OrcaEnv), quietMs });
        if (switched.fail) return { fails: [switched.fail] };
        const fired = [switched.seen.record && `${d.recordFile} in the data root`, switched.seen.warn && `the "${d.warnText}" warning`].filter(Boolean);
        if (fired.length) return { fails: [`orcad launched the installed Orca with the switch set (${OrcaEnv.ORCAD_HIDDEN_ELECTRON_SWITCH}=1): ${fired.join(' and ')}`] };
        if (!switched.alive) return { fails: [`orcad exited during the switched run (${switched.exited}), so the absence of the detectors proves nothing; stderr: ${switched.tail}`] };
        return { pass: { stockMs: stock.latencyMs, switchedMs: quietMs, recordFile: d.recordFile } };
    } finally {
        rmSync(baseDir, { recursive: true, force: true });
    }
}

// --- self-test ---------------------------------------------------------------

const STANDIN = (obeysSwitch, exitsSwitched = false) => `// Stand-in orcad for ${SELF_REL} --self-test.
const fs = require('fs');
const path = require('path');
const SWITCH = 'ORCA_DISABLE_INSTALLED_ELECTRON_BROWSER';
const port = process.argv[process.argv.indexOf('--port') + 1];
console.log(JSON.stringify({ type: 'orca_server_ready', boundEndpoint: 'ws://127.0.0.1:' + port, health: { nodeVersion: process.versions.node, terminalDaemon: { pid: null } } }));
if (${obeysSwitch ? "process.env[SWITCH] !== '1'" : 'true'}) {
    try {
        const decoy = path.join(process.env.HOME, '.local', 'bin', 'orca-ide');
        fs.accessSync(decoy, fs.constants.X_OK);
        const head = fs.readFileSync(fs.realpathSync(decoy)).subarray(0, 2).toString('latin1');
        if (head !== '#!') {
            fs.writeFileSync(path.join(process.env.ORCA_USER_DATA, '.fixture-record.json'), '{}');
            console.warn('[fixture] Installed Electron browser provider unavailable:', 'fixture');
        }
    } catch { /* no decoy */ }
}
${exitsSwitched ? "if (process.env[SWITCH] === '1') setTimeout(() => process.exit(7), 200);\n" : ''}process.on('SIGTERM', () => process.exit(0));
setInterval(() => {}, 1000);
`;

const FIXTURE_PROVIDER = `export function installedElectronCandidates(platform, homePath, environment) {
  if (environment.ORCA_DISABLE_INSTALLED_ELECTRON_BROWSER === '1') return []
  return [
    joinPath(homePath, '.local', 'bin', 'orca-ide'),
    '/fixture-absent/local/bin/orca-ide',
    '/fixture-absent/bin/orca-ide',
    '/fixture-absent/opt/orca-ide'
  ]
}
console.warn('[fixture] Installed Electron browser provider unavailable:', error)
`;

async function runSelfTest() {
    const tmp = mkdtempSync(join(tmpdir(), `${NAME}-`));
    const orcaDir = join(tmp, 'orca');
    const overlayDir = join(tmp, 'orca-overlay');
    const put = (path, body) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, body); };
    const provider = join(orcaDir, BROWSER_PROVIDER_REL);
    const seams = join(overlayDir, 'seams.json');
    const standin = join(orcaDir, 'out', 'orcad', 'orcad.js');
    const seamRow = { path: BROWSER_PROVIDER_REL, upstream_blob: '0'.repeat(40), patch: 'patches/010-installed-electron-switch.patch', reason: 'fixture' };
    try {
        put(join(orcaDir, 'package.json'), '{ "name": "fixture", "version": "0.0.1" }\n');
        put(join(orcaDir, PROFILE_REL), "const PROFILE_RECORD_FILE = '.fixture-record.json'\n");
        put(provider, FIXTURE_PROVIDER);
        put(standin, STANDIN(true));
        mkdirSync(join(orcaDir, 'out', 'web'), { recursive: true });
        put(seams, JSON.stringify({ seams: [seamRow] }));
        put(join(overlayDir, seamRow.patch), `--- a/${BROWSER_PROVIDER_REL}\n+++ b/${BROWSER_PROVIDER_REL}\n@@ -1,1 +1,2 @@\n+  if (environment.ORCA_DISABLE_INSTALLED_ELECTRON_BROWSER === '1') return []\n`);

        const base = { orcaDir, overlayDir, nodeBin: process.execPath, readyTimeoutMs: 15000, detectTimeoutMs: 2500, minQuietMs: 700 };
        const scriptDecoy = (path) => writeFileSync(path, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
        const withFile = (path, body, fn) => async () => { const saved = readFileSync(path, 'utf8'); writeFileSync(path, body); try { return await fn(); } finally { writeFileSync(path, saved); } };
        const cases = [
            { name: 'control: stock run launches the decoy, switched run does not', naming: null, go: () => run(base) },
            { name: 'a stand-in orcad that ignores the switch', naming: 'with the switch set', go: withFile(standin, STANDIN(false), () => run(base)) },
            { name: 'a stand-in orcad that exits after ready with the switch set', naming: 'exited during the switched run (code 7)', go: withFile(standin, STANDIN(true, true), () => run(base)) },
            { name: 'the switch name misspelled in OrcaEnv', naming: 'adds no line naming', go: () => run({ ...base, OrcaEnv: { ...RealOrcaEnv, ORCAD_HIDDEN_ELECTRON_SWITCH: 'ORCA_DISABLE_INSTALED_ELECTRON_BROWSER' } }) },
            { name: 'a #! script decoy (never launched, so the stock run is silent)', naming: 'detector blind', go: () => run({ ...base, makeDecoy: scriptDecoy }) },
            { name: 'a provider source with no candidate literal', naming: 'source moved', go: withFile(provider, "console.warn('[fixture] Installed Electron browser provider unavailable:', error)\n", () => run(base)) },
            { name: 'seams.json without the provider row', naming: 'no seam row', go: withFile(seams, JSON.stringify({ seams: [] }), () => run(base)) },
        ];
        let failures = 0;
        for (const c of cases) {
            const r = await c.go();
            const text = r.skip ? `SKIP ${r.skip}` : (r.fails ?? []).join('\n');
            if (c.naming === null) {
                if (r.pass) console.log(`  ok ${c.name} (detectors after ${r.pass.stockMs} ms, quiet for ${r.pass.switchedMs} ms)`);
                else { console.error(`  FAIL ${c.name} -> ${text}`); failures++; }
            } else if (r.pass || r.skip) {
                console.error(`  FAIL ${c.name} -> stayed ${r.pass ? 'green' : 'SKIP'}`); failures++;
            } else if (!text.includes(c.naming)) {
                console.error(`  FAIL ${c.name} -> red, but not naming '${c.naming}': ${text}`); failures++;
            } else {
                console.log(`  ok ${c.name} -> red, naming '${c.naming}'`);
            }
        }
        if (failures) {
            console.error(`${NAME} self-test: FAIL -- ${failures} of ${cases.length} case(s) did not behave`);
            return 1;
        }
        console.log(`${NAME} self-test: PASS -- control green, ${cases.length - 1} planted faults each went red naming the drift`);
        return 0;
    } finally {
        rmSync(tmp, { recursive: true, force: true });
    }
}

const isEntryPoint = (() => {
    try { return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();
if (isEntryPoint) {
    const args = process.argv.slice(2);
    const unknown = args.find((a) => a !== '--self-test');
    if (unknown !== undefined) {
        console.error(`${NAME}: FAIL -- unknown argument '${unknown}' (usage: node ${SELF_REL} [--self-test])`);
        console.error(`  Next step: run: node ${SELF_REL}, or add --self-test to prove the gate discriminates.`);
        process.exit(2);
    }
    if (args.includes('--self-test')) process.exit(await runSelfTest());
    const restore = installOutputRedaction([]);
    let code = 0;
    try {
        const r = await run({ orcaDir: join(REPO_ROOT, 'orca'), overlayDir: join(REPO_ROOT, 'orca-overlay'), nodeBin: async () => (await ensurePbNode()).path });
        if (r.skip) { console.log(skipLine(NAME, r.skip)); code = SKIP_EXIT; } else if (r.fails) { for (const f of r.fails) console.error(`${NAME}: FAIL -- ${f}`); code = 1; }
        else console.log(`${NAME}: PASS -- stock orcad launched the decoy (${r.pass.recordFile} and the provider warning after ${r.pass.stockMs} ms); with ${RealOrcaEnv.ORCAD_HIDDEN_ELECTRON_SWITCH}=1 neither appeared in ${r.pass.switchedMs} ms and orcad kept running`);
    } catch (e) {
        console.error(`${NAME}: FAIL -- ${RealOrcaEnv.redact(e.message)}`);
        code = 1;
    } finally {
        restore();
    }
    process.exit(code);
}
