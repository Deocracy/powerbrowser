#!/usr/bin/env node
// scripts/verify-orcad-lifecycle.mjs
//
// Audit fixes, lane G2-orcad-hosting (v1.7 code and security audit): how PowerBrowser spawns,
// supervises and ends orcad, its terminal daemon and the agents under it. Each clause goes red on the
// pre-fix code and names the drift:
//
//   watch-wired        (orcad-hosting-01) OrcaService spawns orcad with OrcaEnv.buildOrcadWatchArgs ahead of
//                      OrcaEnv.buildOrcadArgs, and once it accepts a ready line it writes
//                      OrcaEnv.orcadAcceptedLine naming that ready line's daemon to orcad's stdin. Stub boundary.
//   watch-fixture      (orcad-hosting-01, orcad-hosting-08, 62-WR-01) the watch module OrcaEnv builds, preloaded
//                      into a stand-in orcad that starts a stand-in daemon (with orcad's own Node flags, as orcad
//                      does) which starts a stand-in agent. Real processes, Linux only:
//                        a. stdin end-of-file (PowerBrowser gone) after acceptance ends orcad, the daemon and
//                           the agent;
//                        b. an orcad exit after acceptance, stdin still open, ends nothing (D-07: the next orcad
//                           adopts the daemon), and the daemon's own copy of the module stays inert although its
//                           stdin closed;
//                        c. an orcad exit before acceptance (a failed start) ends the daemon and the agent;
//                        d. a daemon named by the accepted line that is not orcad's child is ended at
//                           end-of-file;
//                        e. a process named with start ticks that are not its own is never signalled.
//   watch-orcad        the same module in the pinned, built orcad (orca/out): orcad still reports ready, and
//                      stdin end-of-file after acceptance ends orcad and its real terminal daemon. A named SKIP
//                      when orca/ is not built or the host is not Linux. Not run by --self-test.
//   restart-keeps-daemon (62-WR-04) Restart Orca from the failed state does not signal the daemon this
//                      session adopted after an orcad crash. Stub boundary.
//   failed-start       (62-WR-01, orcad-hosting-08) a start that times out ends the daemon and agent listed
//                      under that orcad; a respawn that times out keeps the adopted daemon. Stub boundary.
//   stop-during-ready  (62-WR-03, orcad-hosting-05) a stop that begins between orcad's ready line and the
//                      hand-off writes leaves no hand-off file and ends in "stopped". Stub boundary.
//   exit-handoff       (62-WR-05) an unexpected orcad exit removes the hand-off files before the respawn.
//   no-offer           (pairing-credentials-03) a ready line with no offer removes an earlier offer file.
//   start-after-quit   (62-WR-02) powerbrowser.js arms OrcaService's quit hooks before Theia's start statement,
//                      and a quit granted after arming means start() spawns nothing.
//   crash-loop         (orcad-hosting-07) orcad exiting after every ready line ends in the failed state with
//                      the repeated-exits step after giveUpAttempts exits, with a backoff between restarts.
//   theia-clears       (orcad-hosting-06) TheiaService.start() removes the hand-off files OrcaService writes
//                      (the name set derived from OrcaService's _removeHandOff) before its first spawn.
//   platform-alias     (62-WR-06) darwin links with ln -sfn and refuses a real folder; win32 makes no alias;
//                      the names OrcaEnv itself reads on win32 reach orcad's environment.
//   port-holder        (orcad-hosting-03) the holder of a busy port is a diagnostics row, from /proc/net/tcp.
//   sidecar-orca-port  (67-WR-03, lane G3b handoff) TheiaService gives the Theia backend POWERBROWSER_ORCA_PORT
//                      from OrcaService.orcadPort, the accessor orcad's own start reads, wired in powerbrowser.js
//                      before Theia starts.
//
// --self-test copies powerbrowser/shell into a mkdtemp tree, requires it green (watch-orcad skipped), then
// plants each pre-fix fault and requires red naming the clause.
//
// Tier: quick. No build, no browser, no display, no network. The fixture clause starts short-lived Node
// processes and ends every one it started by pid plus start ticks.
//
// Usage:
//   node scripts/verify-orcad-lifecycle.mjs
//   node scripts/verify-orcad-lifecycle.mjs --self-test

import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'orcad-lifecycle';
const SELF_REL = 'scripts/verify-orcad-lifecycle.mjs';
const THEIA_START = 'TheiaService.start(browserElement)';

export function pathsFor(root, { orcaDir = join(root, 'orca'), realOrcad = true } = {}) {
    const shellDir = join(root, 'powerbrowser', 'shell');
    return {
        shellDir,
        orcaService: join(shellDir, 'OrcaService.sys.mjs'),
        orcaEnv: join(shellDir, 'OrcaEnv.sys.mjs'),
        theiaService: join(shellDir, 'TheiaService.sys.mjs'),
        shellJs: join(shellDir, 'powerbrowser.js'),
        orcaDir,
        realOrcad,
    };
}

let importCounter = 0;
const freshImport = (path) => import(`${pathToFileURL(path).href}?v=${process.pid}-${++importCounter}`);
const read = (path) => { try { return readFileSync(path, 'utf8'); } catch { return null; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Stub boundary (the shape verify-orca-service.mjs uses, kept small).

function fakeProc(pid, { stdout = [], stderr = [], exitCode = null, exitAfterReadyMs = null } = {}) {
    let resolveWait;
    const waited = new Promise((r) => { resolveWait = r; });
    const queue = { stdout: [...stdout], stderr: [...stderr] };
    const proc = {
        pid,
        exitCode: null,
        wait: () => waited,
        read: async (which) => {
            if (queue[which].length) return queue[which].shift();
            if (which === 'stdout' && exitAfterReadyMs !== null && !proc.exitArmed) { proc.exitArmed = true; setTimeout(() => proc.exit(1), exitAfterReadyMs); }
            return proc.hang ? new Promise(() => {}) : null;
        },
        exit(code) { if (proc.exitCode === null) { proc.exitCode = code; resolveWait({ exitCode: code }); } },
    };
    if (exitCode !== null) setTimeout(() => proc.exit(exitCode), 3);
    return proc;
}

export function readyLine(port, { daemonPid = 5002, offer = true } = {}) {
    return `${JSON.stringify({
        event: 'orca_server_ready',
        boundEndpoint: `ws://127.0.0.1:${port}`,
        health: { nodeVersion: 'v24.19.0', terminalDaemon: { pid: daemonPid } },
        pairing: offer
            ? { available: true, code: 'PBG2SENTINEL', webClientUrl: `http://127.0.0.1:${port}/#pairing=PBG2SENTINEL`, url: 'orca://pair?code=PBG2SENTINEL' }
            : { available: false, reason: 'device_registry_unavailable' },
    })}\n`;
}

function makeBoundary(world) {
    const calls = [];
    const rec = (name, ...args) => { calls.push({ name, args }); };
    const alive = new Map(world.alive ?? []);
    const files = new Map(Object.entries(world.files ?? {}));
    const bridge = new Set(world.bridgeFiles ?? []);
    const exists = new Set(world.exists ?? ['/o/out/orcad/orcad.js', '/o/out/web']);
    const prefs = {
        'powerbrowser.orca.root': '/o',
        'powerbrowser.orca.port': 26768,
        'powerbrowser.orca.startupTimeoutMs': 60000,
        'powerbrowser.orca.killGraceMs': 16000,
        'powerbrowser.orca.giveUpAttempts': 5,
        'powerbrowser.orca.logBufferLines': 200,
        'powerbrowser.sidecar.nodePath': '',
        ...(world.prefs ?? {}),
    };
    const pref = (name, fallback) => (name in prefs ? prefs[name] : fallback);
    const env = { PATH: '/usr/bin', HOME: '/home/u', XDG_RUNTIME_DIR: '/run/user/1000', ...(world.env ?? {}) };
    const api = {
        getStringPref: pref,
        getIntPref: pref,
        prefHasUserValue: () => false,
        getEnv: (name) => env[name] ?? '',
        getProfileDir: () => world.profileDir ?? '/p/prof',
        getAppDir: () => '',
        ensureDirectory: async () => {},
        pathExists: async (path) => exists.has(path),
        pathSearch: async (command) => `/fake/bin/${command}`,
        readStateFile: async (path) => (path === '/o/package.json' ? { version: '9.9.9' } : files.get(path) ?? null),
        writeStateFile: async (path, value) => { rec('writeStateFile', path); await world.hook?.('writeStateFile'); files.set(path, value); },
        removeStateFile: async (path) => { rec('removeStateFile', path); files.delete(path); bridge.delete(path); },
        readProcessStartTicks: async (pid) => { await world.hook?.('readProcessStartTicks', pid); return alive.has(pid) ? alive.get(pid) : null; },
        signalBarePid: (pid, signal) => {
            if (signal !== 0) rec('signalBarePid', pid, signal);
            if (!alive.has(pid)) return false;
            if (signal !== 0 && !(world.immortal ?? []).includes(pid)) alive.delete(pid);
            if (signal === 9) alive.delete(pid);
            return true;
        },
        killProcess: async (proc) => { rec('killProcess', proc.pid); alive.delete(proc.pid); proc.exit(0); },
        waitForExit: async () => true,
        readPipeChunk: async (proc, which) => {
            const chunk = await proc.read(which);
            if (which === 'stdout' && chunk !== null && chunk.includes('orca_server_ready')) rec('readyLineDelivered', proc.pid);
            return chunk;
        },
        writeStdinLine: async (proc, line) => { rec('writeStdinLine', proc.pid, line); },
        sleep: (ms) => { rec('sleep', ms); return new Promise((r) => { if (ms < 1000) setTimeout(r, 1); else setTimeout(r, 2000).unref(); }); },
        onQuitGranted: (fn) => { rec('onQuitGranted', fn); return () => rec('quitObserverOff'); },
        log: () => {},
    };
    let spawned = 0;
    const processes = {
        spawnProcessExact: async (spec) => {
            rec('spawnProcessExact', spec);
            if (spec.command.endsWith('/ln')) return fakeProc(7000, { exitCode: 0 });
            spawned += 1;
            const proc = world.orcad(spawned, spec);
            if (proc.exitCode === null) alive.set(proc.pid, world.ticksFor?.(proc.pid) ?? '111');
            return proc;
        },
        listProcessTree: async (roots) => (world.tree ?? (() => []))(roots).filter((row) => alive.has(row.pid)),
        addNamedReapBlocker: (name, fn) => { rec('addNamedReapBlocker', name, fn); },
        platform: () => world.platform ?? 'linux',
        writePrivateFile: async (dir, name) => { rec('writePrivateFile', dir, name); bridge.add(`${dir}/${name}`); },
    };
    const hosting = {
        tempDir: () => '/tmp',
        realPath: (path) => world.realPaths?.[path] ?? path,
        ...(world.hosting ?? {}),
    };
    return { api, processes, hosting, calls, alive, files, bridge, spawnedCount: () => spawned };
}

async function loadService(paths, b, env) {
    globalThis.ChromeUtils = {
        importESModule: (url) => {
            if (url === 'chrome://powerbrowser/content/PowerBrowserAPI.sys.mjs') return { PowerBrowserAPI: b.api, PowerBrowserProcesses: b.processes, PowerBrowserOrcaHosting: b.hosting };
            if (url === 'chrome://powerbrowser/content/OrcaEnv.sys.mjs') return env;
            throw new Error(`unexpected module URL ${url}`);
        },
    };
    return (await freshImport(paths.orcaService)).OrcaService;
}

const orcadSpawns = (calls) => calls.filter((c) => c.name === 'spawnProcessExact' && !c.args[0].command.endsWith('/ln'));
const signalled = (calls, pid) => calls.some((c) => c.name === 'signalBarePid' && c.args[0] === pid);
const readyOrcad = (pid, opts = {}) => fakeProc(pid, { stdout: [readyLine(26768, opts)], ...opts });
const portBusy = (pid) => fakeProc(pid, { stderr: ['[orcad] pinned_port_unavailable 127.0.0.1:26768\n'], exitCode: 1 });
const until = async (test, ms = 3000) => { for (let t = 0; t < ms && !test(); t += 5) await sleep(5); return test(); };
const tree3 = (orcadPid) => (roots) => {
    const rows = [{ pid: orcadPid, ppid: 1, startTicks: '111' }, { pid: 5002, ppid: orcadPid, startTicks: '222' }, { pid: 5003, ppid: 5002, startTicks: '333' }];
    if (roots.includes(orcadPid)) return rows;
    if (roots.includes(5002)) return rows.slice(1);
    return [];
};
const DATA_ROOT = '/p/prof/powerbrowser-orca';

// ---------------------------------------------------------------------------
// Stub-boundary clauses.

async function watchWired(paths, env) {
    const fails = [];
    const b = makeBoundary({ alive: [[5002, '222'], [5003, '333']], tree: tree3(5001), orcad: () => readyOrcad(5001) });
    const svc = await loadService(paths, b, env);
    await svc.start();
    const spawn0 = orcadSpawns(b.calls)[0]?.args[0];
    const main = '/o/out/orcad/orcad.js';
    const want = [...env.buildOrcadWatchArgs({ orcadMain: main }), ...env.buildOrcadArgs({ orcadMain: main, port: 26768, webClientRoot: '/o/out/web' })];
    if (!spawn0) fails.push('watch-wired: orcad was never spawned');
    else if (JSON.stringify(spawn0.args) !== JSON.stringify(want)) fails.push(`watch-wired: orcad was spawned with ${JSON.stringify(spawn0.args.slice(0, 2)).slice(0, 80)}..., not the parent watch (OrcaEnv.buildOrcadWatchArgs) ahead of OrcaEnv.buildOrcadArgs, so a crash of PowerBrowser leaves orcad, its daemon and the agents running`);
    const line = env.orcadAcceptedLine({ daemonPid: 5002, daemonTicks: '222' });
    const readyAt = b.calls.findIndex((c) => c.name === 'readyLineDelivered');
    const lineAt = b.calls.findIndex((c) => c.name === 'writeStdinLine' && c.args[1] === line);
    if (lineAt < 0) fails.push(`watch-wired: OrcaService never wrote the accepted line ${line} to orcad's stdin, so the watch would end the daemon on every orcad exit and could not end the adopted daemon when PowerBrowser dies`);
    else if (lineAt < readyAt) fails.push('watch-wired: the accepted line was written before the ready line was read');
    await svc.stop();
    return fails;
}

async function restartKeepsDaemon(paths, env) {
    const fails = [];
    let first;
    const b = makeBoundary({
        alive: [[5002, '222'], [5003, '333']],
        tree: tree3(5001),
        orcad: (n) => (n === 1 ? (first = readyOrcad(5001)) : n === 2 ? portBusy(6001) : readyOrcad(7001)),
    });
    const svc = await loadService(paths, b, env);
    await svc.start();
    first.exit(1);
    if (!(await until(() => svc.getState().state === 'failed'))) return [`restart-keeps-daemon: setup: after an orcad crash and a busy port the state is ${svc.getState().state}, not failed`];
    if (signalled(b.calls, 5002)) fails.push('restart-keeps-daemon: setup: the crash path signalled the daemon it should adopt');
    const accepted = await svc.restart();
    await svc._restartRun;
    if (!accepted) fails.push('restart-keeps-daemon: restart() in failed answered false');
    if (signalled(b.calls, 5002) || signalled(b.calls, 5003)) fails.push('restart-keeps-daemon: Restart Orca signalled the terminal daemon (pid 5002) this session adopted after the orcad crash, ending the agents the crash path kept alive (D-07)');
    if (svc.getState().state !== 'ready') fails.push(`restart-keeps-daemon: after Restart the state is ${svc.getState().state}, not ready`);
    await svc.stop();
    return fails;
}

async function failedStart(paths, env) {
    const fails = [];
    // Cold start: the only attempt times out after orcad started its daemon (tree 5001 > 5002 > 5003).
    {
        const b = makeBoundary({
            prefs: { 'powerbrowser.orca.startupTimeoutMs': 500, 'powerbrowser.orca.giveUpAttempts': 1 },
            alive: [[5002, '222'], [5003, '333']],
            immortal: [5003],
            tree: tree3(5001),
            orcad: () => fakeProc(5001, { stdout: [] }),
        });
        b.api.readPipeChunk = async () => new Promise(() => {});
        const svc = await loadService(paths, b, env);
        await svc.start();
        await svc.stop();
        if (b.alive.has(5002) || b.alive.has(5003)) fails.push(`failed-start: a start that timed out after orcad started its terminal daemon left ${[b.alive.has(5002) && 'the daemon (pid 5002)', b.alive.has(5003) && 'the agent under it (pid 5003)'].filter(Boolean).join(' and ')} running past quit, untracked`);
    }
    // Respawn after a crash: the new orcad times out; the adopted daemon (here listed under it) is kept.
    {
        let first;
        const b = makeBoundary({
            prefs: { 'powerbrowser.orca.startupTimeoutMs': 500, 'powerbrowser.orca.giveUpAttempts': 2 },
            alive: [[5002, '222'], [5003, '333']],
            tree: (roots) => (roots.includes(6001) ? [{ pid: 6001, ppid: 1, startTicks: '111' }, { pid: 5002, ppid: 6001, startTicks: '222' }, { pid: 5003, ppid: 5002, startTicks: '333' }] : tree3(5001)(roots)),
            orcad: (n) => (n === 1 ? (first = readyOrcad(5001)) : fakeProc(6001, { stdout: [] })),
        });
        const svc = await loadService(paths, b, env);
        await svc.start();
        b.api.readPipeChunk = async () => new Promise(() => {});
        first.exit(1);
        if (!(await until(() => svc.getState().state === 'failed'))) fails.push(`failed-start: setup: the respawn that times out ended in ${svc.getState().state}, not failed`);
        if (orcadSpawns(b.calls).length < 2) fails.push('failed-start: setup: no respawn followed the orcad crash');
        if (signalled(b.calls, 5002) || signalled(b.calls, 5003)) fails.push('failed-start: a respawn that timed out signalled the terminal daemon this session adopted (pid 5002); only a quit ends agents (D-07)');
        await svc.stop();
    }
    return fails;
}

async function stopDuringReady(paths, env) {
    const fails = [];
    for (const at of ['readProcessStartTicks', 'writeStateFile']) {
        let svc;
        let stopping = null;
        const world = {
            alive: [[5002, '222'], [5003, '333']],
            tree: tree3(5001),
            exists: ['/o/out/orcad/orcad.js', '/o/out/web', '/o/out/web/assets/pb-panes'],
            orcad: () => readyOrcad(5001),
            hook: async (name) => { if (name === at && !stopping) stopping = svc.stop(); },
        };
        const b = makeBoundary(world);
        svc = await loadService(paths, b, env);
        await svc.start();
        await stopping;
        await sleep(20);
        if (b.bridge.size) fails.push(`stop-during-ready (stop at ${at}): ${[...b.bridge].map((p) => p.slice(p.lastIndexOf('/') + 1)).join(', ')} stayed in the bridge folder after the stop, written after the stop removed them`);
        if (svc.getState().state !== 'stopped') fails.push(`stop-during-ready (stop at ${at}): the state ended ${svc.getState().state}, not stopped`);
    }
    return fails;
}

async function exitHandOff(paths, env) {
    const fails = [];
    let first;
    let atRespawn = null;
    const b = makeBoundary({
        alive: [[5002, '222'], [5003, '333']],
        tree: tree3(5001),
        exists: ['/o/out/orcad/orcad.js', '/o/out/web', '/o/out/web/assets/pb-panes'],
        orcad: (n) => { if (n === 2) atRespawn = [...b.bridge]; return n === 1 ? (first = readyOrcad(5001)) : portBusy(6001); },
    });
    const svc = await loadService(paths, b, env);
    await svc.start();
    if (b.bridge.size !== 3) fails.push(`exit-handoff: setup: ${b.bridge.size} hand-off files after ready, not 3`);
    first.exit(1);
    await until(() => svc.getState().state === 'failed');
    if (atRespawn === null) fails.push('exit-handoff: setup: no respawn followed the unexpected exit');
    else if (atRespawn.length) fails.push(`exit-handoff: after an unexpected orcad exit ${atRespawn.map((p) => p.slice(p.lastIndexOf('/') + 1)).join(', ')} still named the orcad that exited when the respawn began`);
    if (b.bridge.size) fails.push(`exit-handoff: with the respawns given up, ${[...b.bridge].map((p) => p.slice(p.lastIndexOf('/') + 1)).join(', ')} stayed in the bridge folder for an orcad that is gone`);
    await svc.stop();
    return fails;
}

async function noOffer(paths, env) {
    const fails = [];
    const bridgeDir = await env.bridgeDirFor(DATA_ROOT, (n) => ({ XDG_RUNTIME_DIR: '/run/user/1000', HOME: '/home/u' }[n] ?? ''), 'linux');
    const stale = env.bridgeFileFor(bridgeDir, env.ORCA_WEB_PAIRING_FILE, 'linux');
    const b = makeBoundary({ alive: [[5002, '222']], tree: tree3(5001), bridgeFiles: [stale], orcad: () => readyOrcad(5001, { offer: false }) });
    const svc = await loadService(paths, b, env);
    await svc.start();
    if (svc.getState().state !== 'ready') fails.push(`no-offer: setup: state ${svc.getState().state}, not ready`);
    if (b.bridge.has(stale)) fails.push(`no-offer: a ready line with no pairing offer left the earlier ${env.ORCA_WEB_PAIRING_FILE} file in place, served as this start's offer`);
    await svc.stop();
    return fails;
}

async function startAfterQuit(paths, env) {
    const fails = [];
    const shell = read(paths.shellJs) ?? '';
    const startAt = shell.indexOf(THEIA_START);
    const armAt = shell.indexOf('OrcaService.armQuitHooks();');
    if (startAt < 0) fails.push('start-after-quit: powerbrowser.js has no Theia start statement to order against');
    else if (armAt < 0 || armAt > startAt) fails.push('start-after-quit: powerbrowser.js does not call OrcaService.armQuitHooks() before the Theia start statement, so a quit granted while Theia starts never reaches OrcaService and orcad is spawned during shutdown');
    const b = makeBoundary({ alive: [[5002, '222']], tree: tree3(5001), orcad: () => readyOrcad(5001) });
    const svc = await loadService(paths, b, env);
    if (typeof svc.armQuitHooks !== 'function') return [...fails, 'start-after-quit: OrcaService has no armQuitHooks()'];
    svc.armQuitHooks();
    const observer = b.calls.find((c) => c.name === 'onQuitGranted')?.args[0];
    if (!observer) return [...fails, 'start-after-quit: armQuitHooks() registered no quit observer'];
    await observer();
    await svc.start();
    if (orcadSpawns(b.calls).length) fails.push('start-after-quit: start() after a granted quit spawned orcad, which then has no stop path');
    return fails;
}

async function crashLoop(paths, env) {
    const fails = [];
    const b = makeBoundary({
        prefs: { 'powerbrowser.orca.giveUpAttempts': 3 },
        alive: [[5002, '222']],
        tree: tree3(5001),
        orcad: (n) => {
            if (n > 8) { const p = fakeProc(9000 + n); p.hang = true; return p; }
            return fakeProc(5000 + n * 10, { stdout: [readyLine(26768)], exitAfterReadyMs: 5 });
        },
    });
    const svc = await loadService(paths, b, env);
    await svc.start();
    await until(() => svc.getState().state === 'failed' || b.spawnedCount() > 8, 4000);
    const step = svc.getDiagnosticRows().find(([l]) => l === 'Orca failed step')?.[1];
    if (svc.getState().state !== 'failed') fails.push(`crash-loop: orcad exited after its ready line ${b.spawnedCount()} times and was restarted each time; the state is ${svc.getState().state}, never failed, so the failure page and its Restart never appear`);
    else if (step !== 'restarting orcad after repeated exits') fails.push(`crash-loop: the failed step is ${JSON.stringify(step)}, not the repeated-exits step`);
    if (svc.getState().state === 'failed' && b.spawnedCount() !== 3) fails.push(`crash-loop: ${b.spawnedCount()} spawns before failed, not giveUpAttempts (3)`);
    if (!b.calls.some((c) => c.name === 'sleep' && c.args[0] === 500)) fails.push('crash-loop: no backoff between restarts after ready exits; the backoff was reset by each ready line');
    await svc.stop();
    return fails;
}

async function theiaClears(paths, env) {
    const fails = [];
    const theia = read(paths.theiaService) ?? '';
    const startBody = /\n {2}async start\(browserElement\) \{([\s\S]*?)\n {2}\},\n/.exec(theia)?.[1] ?? '';
    const clearAt = startBody.indexOf('await this._clearStaleOrcaHandOff();');
    const restartAt = startBody.indexOf('await this._restart();');
    if (!startBody) return ['theia-clears: TheiaService.sys.mjs has no async start(browserElement) method to read'];
    if (clearAt < 0 || restartAt < 0 || clearAt > restartAt) fails.push("theia-clears: TheiaService.start() does not remove Orca's hand-off files before its first backend spawn, so the frontend boots on a crashed session's pairing offer");
    // The names: those OrcaService's _removeHandOff removes, from its source.
    const service = read(paths.orcaService) ?? '';
    const list = /async _removeHandOff\(\) \{[\s\S]*?\[([^\]]*)\]/.exec(service)?.[1] ?? '';
    const names = [...list.matchAll(/OrcaEnv\.(\w+)/g)].map((m) => env[m[1]]).filter(Boolean);
    if (names.length < 3) return [...fails, `theia-clears: could not derive the hand-off names from OrcaService's _removeHandOff (${names.length} found)`];
    const removed = [];
    const api = {
        getProfileDir: () => '/p/prof',
        getEnv: (n) => ({ XDG_RUNTIME_DIR: '/run/user/1000', HOME: '/home/u' }[n] ?? ''),
        removeStateFile: async (p) => { removed.push(p.slice(p.lastIndexOf('/') + 1)); },
        log: () => {},
        getIntPref: (n, d) => d,
    };
    globalThis.ChromeUtils = {
        importESModule: (url) => {
            if (url === 'chrome://powerbrowser/content/PowerBrowserAPI.sys.mjs') return { PowerBrowserAPI: api, PowerBrowserProcesses: { platform: () => 'linux' } };
            if (url === 'chrome://powerbrowser/content/OrcaEnv.sys.mjs') return env;
            return {};
        },
    };
    let TheiaService;
    try { ({ TheiaService } = await freshImport(paths.theiaService)); } catch (err) { return [...fails, `theia-clears: TheiaService.sys.mjs did not load on a stub boundary: ${err.message}`]; }
    if (typeof TheiaService?._clearStaleOrcaHandOff !== 'function') return [...fails, 'theia-clears: TheiaService has no _clearStaleOrcaHandOff()'];
    TheiaService._pushLog = () => {};
    await TheiaService._clearStaleOrcaHandOff();
    const missing = names.filter((n) => !removed.includes(n));
    if (missing.length) fails.push(`theia-clears: TheiaService's start-time clear leaves ${missing.join(', ')} from a previous session in the bridge folder`);
    return fails;
}

/** 67-WR-03 (from lane G3b): the Theia backend is given the port OrcaService starts orcad on, from the one accessor. */
async function sidecarOrcaPort(paths, env) {
    const fails = [];
    const b = makeBoundary({ prefs: { 'powerbrowser.orca.port': 23456 }, alive: [[5002, '222']], tree: tree3(5001), orcad: () => fakeProc(5001, { stdout: [readyLine(23456)] }) });
    const svc = await loadService(paths, b, env);
    if (typeof svc.orcadPort !== 'function') return ['sidecar-orca-port: OrcaService has no orcadPort() accessor'];
    await svc.start();
    const spawnArgs = orcadSpawns(b.calls)[0]?.args[0].args ?? [];
    const spawnedPort = Number(spawnArgs[spawnArgs.indexOf('--port') + 1]);
    if (svc.orcadPort() !== 23456 || spawnedPort !== 23456) fails.push(`sidecar-orca-port: orcadPort() answers ${svc.orcadPort()} and orcad was started on ${spawnedPort}, with the pref at 23456`);
    await svc.stop();
    const theia = read(paths.theiaService) ?? '';
    const spawnBody = /\n {2}async _spawnAndGate\(beforeFirstSwap\) \{([\s\S]*?)\n {2}\},\n/.exec(theia)?.[1] ?? '';
    const key = /POWERBROWSER_ORCA_PORT:\s*String\((\w+)\)/.exec(spawnBody);
    if (!key || !new RegExp(`const ${key[1]} = this\\._orcaPort\\(\\);`).test(spawnBody)) fails.push("sidecar-orca-port: TheiaService's backend environment carries no POWERBROWSER_ORCA_PORT from _orcaPort(), so the backend refuses every pairing offer");
    const shell = read(paths.shellJs) ?? '';
    const wireAt = shell.indexOf('TheiaService.setOrcaPortSource(() => OrcaService.orcadPort());');
    if (wireAt < 0 || wireAt > shell.indexOf(THEIA_START)) fails.push('sidecar-orca-port: powerbrowser.js does not hand OrcaService.orcadPort to TheiaService before the Theia start statement');
    globalThis.ChromeUtils = {
        importESModule: (url) => (url === 'chrome://powerbrowser/content/OrcaEnv.sys.mjs' ? env : { PowerBrowserAPI: { log: () => {} }, PowerBrowserProcesses: {} }),
    };
    const { TheiaService } = await freshImport(paths.theiaService);
    TheiaService.setOrcaPortSource?.(() => svc.orcadPort());
    if (TheiaService._orcaPort?.() !== 23456) fails.push(`sidecar-orca-port: TheiaService._orcaPort() answers ${TheiaService._orcaPort?.()}, not OrcaService's port 23456`);
    return fails;
}

async function platformAlias(paths, env) {
    const fails = [];
    const longProfile = `/p/${'x'.repeat(100)}`;
    // darwin: -sfn, and a real folder at the alias is refused before ln runs.
    {
        const b = makeBoundary({ platform: 'macosx', profileDir: longProfile, alive: [[5002, '222']], tree: tree3(5001), orcad: () => readyOrcad(5001) });
        const svc = await loadService(paths, b, env);
        await svc.start();
        const ln = b.calls.find((c) => c.name === 'spawnProcessExact' && c.args[0].command.endsWith('/ln'))?.args[0];
        if (!ln) fails.push('platform-alias: on darwin a long profile path ran no ln');
        else if (ln.args[0] !== '-sfn') fails.push(`platform-alias: on darwin ln runs with ${ln.args[0]}; BSD ln has no -T, so Orca never starts there`);
        await svc.stop();
    }
    {
        const alias = await env.aliasPathFor(`${longProfile}/powerbrowser-orca`, (n) => ({ XDG_RUNTIME_DIR: '/run/user/1000', HOME: '/home/u' }[n] ?? ''));
        const b = makeBoundary({ platform: 'macosx', profileDir: longProfile, exists: ['/o/out/orcad/orcad.js', '/o/out/web', alias], alive: [[5002, '222']], tree: tree3(5001), orcad: () => readyOrcad(5001) });
        const svc = await loadService(paths, b, env);
        await svc.start();
        if (b.calls.some((c) => c.name === 'spawnProcessExact' && c.args[0].command.endsWith('/ln'))) fails.push('platform-alias: on darwin ln -sfn ran over a real folder at the alias path, which it writes into');
        await svc.stop();
    }
    // win32: no alias at all.
    {
        const b = makeBoundary({ platform: 'win', profileDir: longProfile, env: { LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local' }, alive: [[5002, '222']], tree: tree3(5001), orcad: () => readyOrcad(5001) });
        const svc = await loadService(paths, b, env);
        await svc.start();
        if (b.calls.some((c) => c.name === 'spawnProcessExact' && c.args[0].command.endsWith('/ln'))) fails.push('platform-alias: on win32 a long profile path ran ln, which Windows has not, for a socket path orcad does not use there');
        if (svc.getState().effectiveRoot !== `${longProfile}/powerbrowser-orca`) fails.push(`platform-alias: on win32 orcad was given ${svc.getState().effectiveRoot}, not its data root`);
        await svc.stop();
    }
    // The names OrcaEnv reads on win32 for orcad's own folders reach orcad.
    const readNames = new Set();
    const recorder = (n) => { readNames.add(n); return 'C:\\x'; };
    env.credentialKeyFolderFor(recorder, 'win32');
    await env.bridgeDirFor(DATA_ROOT, recorder, 'win32');
    for (const n of env.ORCA_TEMP_ENV_NAMES.win32) readNames.add(n);
    const missing = [...readNames].filter((n) => !env.ORCAD_ENV_ALLOWLIST.includes(n));
    if (missing.length) fails.push(`platform-alias: ${missing.join(', ')}, read by OrcaEnv on win32, never reach orcad's environment (ORCAD_ENV_ALLOWLIST)`);
    return fails;
}

async function portHolder(paths, env) {
    const fails = [];
    const hex = (26768).toString(16).toUpperCase().padStart(4, '0');
    const head = '  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode';
    const row = (addr, st, uid) => `   0: ${addr}:${hex} 00000000:0000 ${st} 00000000:00000000 00:00000000 00000000  ${uid}        0 1 1 0000000000000000 100 0 0 10 0`;
    const tcp = [head, row('0100007F', '01', 4321), row('0100007F', '0A', 1001), ''].join('\n');
    if (env.portHolderUidOf?.(tcp, 26768) !== 1001) fails.push(`port-holder: portHolderUidOf read uid ${env.portHolderUidOf?.(tcp, 26768)} from a /proc/net/tcp LISTEN row of uid 1001`);
    const b = makeBoundary({
        alive: [[5002, '222']],
        tree: tree3(5001),
        hosting: { readLoopbackSocketTable: async () => ({ tcp, uid: 1000 }) },
        orcad: () => portBusy(5001),
    });
    const svc = await loadService(paths, b, env);
    await svc.start();
    const value = svc.getDiagnosticRows().find(([l]) => l === 'Orca port holder')?.[1];
    if (value !== 'another user (uid 1001)') fails.push(`port-holder: a port held by uid 1001 shows the port-holder row ${JSON.stringify(value)}, so a squatter cannot be told from a leftover`);
    await svc.stop();
    return fails;
}

// ---------------------------------------------------------------------------
// Real processes: the watch module in a stand-in orcad.

function startTicks(pid) {
    const stat = read(`/proc/${pid}/stat`);
    if (!stat) return null;
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    return fields[0] === 'Z' ? null : fields[19] ?? null;
}
const isAlive = (pid, ticks) => Number.isInteger(pid) && ticks !== null && startTicks(pid) === ticks;
function killIdentity(pid, ticks) { if (isAlive(pid, ticks)) { try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } } }
const waitGone = async (ids, ms) => { for (let t = 0; t < ms; t += 50) { if (ids.every(([p, k]) => !isAlive(p, k))) return true; await sleep(50); } return ids.every(([p, k]) => !isAlive(p, k)); };

const FIXTURE_ORCAD = `import { spawn } from 'node:child_process';
const daemon = spawn(process.execPath, [...process.execArgv, process.env.PB_FIXTURE_DAEMON], { stdio: ['pipe', 'ignore', 'ignore'] });
daemon.stdin.end();
process.on('SIGTERM', () => setTimeout(() => process.exit(0), 100));
process.on('SIGUSR2', () => process.exit(3));
setInterval(() => {}, 1000);
process.stdout.write(JSON.stringify({ ready: true, daemonPid: daemon.pid }) + '\\n');
`;
const FIXTURE_DAEMON = `import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const agent = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
writeFileSync(process.env.PB_FIXTURE_DIR + '/agent-' + process.pid, String(agent.pid));
setInterval(() => {}, 1000);
`;

async function runFixture(env, dir, { accept, then, named = null }) {
    const main = join(dir, 'orcad.js');
    const child = spawn(process.execPath, [...env.buildOrcadWatchArgs({ orcadMain: main }), main], {
        cwd: dir,
        env: { PATH: process.env.PATH ?? '', PB_FIXTURE_DAEMON: join(dir, 'daemon.mjs'), PB_FIXTURE_DIR: dir },
        stdio: ['pipe', 'pipe', 'pipe'],
    });
    const started = [];
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    try {
        const orcad = [child.pid, startTicks(child.pid)];
        started.push(orcad);
        for (let t = 0; t < 5000 && !out.includes('\n'); t += 20) await sleep(20);
        const ready = (() => { try { return JSON.parse(out.split('\n')[0]); } catch { return null; } })();
        if (!ready) return { fail: `the stand-in orcad printed no ready line (stderr: ${err.slice(-300)})` };
        const daemon = [ready.daemonPid, startTicks(ready.daemonPid)];
        started.push(daemon);
        const agentFile = join(dir, `agent-${ready.daemonPid}`);
        for (let t = 0; t < 5000 && !existsSync(agentFile); t += 20) await sleep(20);
        const agentPid = Number(read(agentFile));
        const agent = [agentPid, startTicks(agentPid)];
        started.push(agent);
        if (named) started.push(named.identity);
        if (!isAlive(...daemon) || !isAlive(...agent)) return { fail: `the stand-in daemon or agent was not running before the case began (the daemon's copy of the watch may have armed); stderr: ${err.slice(-300)}` };
        if (accept) {
            const line = env.orcadAcceptedLine(named ? { daemonPid: named.identity[0], daemonTicks: named.ticks } : { daemonPid: daemon[0], daemonTicks: daemon[1] });
            child.stdin.write(`${line}\n`);
            await sleep(150);
        }
        return await then({ child, orcad, daemon, agent });
    } finally {
        for (const [pid, ticks] of started.reverse()) killIdentity(pid, ticks);
        try { child.stdin.destroy(); } catch { /* closed */ }
    }
}

async function watchFixture(env) {
    if (process.platform !== 'linux') return { skip: 'watch-fixture: SKIP -- not Linux; the watch reads /proc' };
    const fails = [];
    const dir = mkdtempSync(join(process.env.XDG_RUNTIME_DIR && existsSync(process.env.XDG_RUNTIME_DIR) ? process.env.XDG_RUNTIME_DIR : tmpdir(), 'pb-g2-'));
    try {
        writeFileSync(join(dir, 'orcad.js'), FIXTURE_ORCAD);
        writeFileSync(join(dir, 'package.json'), '{ "type": "module" }');
        writeFileSync(join(dir, 'daemon.mjs'), FIXTURE_DAEMON);
        const name = (s) => s;
        const bound = 6000;
        const record = (label, r) => { if (r?.fail) fails.push(`watch-fixture (${label}): ${r.fail}`); };

        record('a. PowerBrowser gone after acceptance', await runFixture(env, dir, {
            accept: true,
            then: async ({ child, orcad, daemon, agent }) => {
                child.stdin.end();
                if (!(await waitGone([orcad, daemon, agent], bound))) {
                    return { fail: `stdin end-of-file left ${[isAlive(...orcad) && `orcad (pid ${orcad[0]})`, isAlive(...daemon) && `the daemon (pid ${daemon[0]})`, isAlive(...agent) && `the agent (pid ${agent[0]})`].filter(Boolean).join(', ')} running ${bound} ms later: a PowerBrowser crash leaves them with nothing to stop them` };
                }
                return null;
            },
        }));
        record('b. orcad exit after acceptance', await runFixture(env, dir, {
            accept: true,
            then: async ({ child, orcad, daemon, agent }) => {
                process.kill(orcad[0], 'SIGUSR2');
                await waitGone([orcad], bound);
                await sleep(800);
                const lost = [!isAlive(...daemon) && `the daemon (pid ${daemon[0]})`, !isAlive(...agent) && `the agent (pid ${agent[0]})`].filter(Boolean);
                if (lost.length) return { fail: `an orcad exit after acceptance, PowerBrowser still running, ended ${lost.join(' and ')}; the next orcad must adopt them (D-07), or the daemon's own copy of the watch armed` };
                void child;
                return null;
            },
        }));
        record('c. orcad exit before acceptance', await runFixture(env, dir, {
            accept: false,
            then: async ({ orcad, daemon, agent }) => {
                process.kill(orcad[0], 'SIGUSR2');
                if (!(await waitGone([daemon, agent], bound))) return { fail: `a failed start (orcad exiting before its ready line was accepted) left ${[isAlive(...daemon) && 'the daemon', isAlive(...agent) && 'the agent'].filter(Boolean).join(' and ')} running, untracked` };
                return null;
            },
        }));
        for (const [label, wrongTicks] of [['d. adopted daemon named by the line', false], ['e. wrong start ticks', true]]) {
            const other = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
            await sleep(100);
            const identity = [other.pid, startTicks(other.pid)];
            record(label, await runFixture(env, dir, {
                accept: true,
                named: { identity, ticks: wrongTicks ? '1' : identity[1] },
                then: async ({ child, orcad }) => {
                    child.stdin.end();
                    await waitGone([orcad], bound);
                    if (!wrongTicks && !(await waitGone([identity], bound))) return { fail: `the daemon named by the accepted line (pid ${identity[0]}, not orcad's child) survived stdin end-of-file` };
                    if (wrongTicks) {
                        await sleep(300);
                        if (!isAlive(...identity)) return { fail: `pid ${identity[0]}, named with start ticks that are not its own, was signalled: a recycled pid would be killed` };
                    }
                    return null;
                },
            }));
            killIdentity(...identity);
            void name;
        }
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
    return { fails };
}

async function freePort(env) {
    for (let i = 0; i < 50; i++) {
        const port = 20000 + Math.floor(Math.random() * 12000);
        if (port < env.PORT_MIN || port > env.PORT_MAX) continue;
        const ok = await new Promise((r) => { const s = createServer(); s.once('error', () => r(false)); s.listen(port, '127.0.0.1', () => s.close(() => r(true))); });
        if (ok) return port;
    }
    throw new Error('no free port');
}

async function watchOrcad(paths, env) {
    const main = join(paths.orcaDir, 'out', 'orcad', 'orcad.js');
    if (!paths.realOrcad) return { skip: 'watch-orcad: SKIP -- not run by the self-test' };
    if (process.platform !== 'linux') return { skip: 'watch-orcad: SKIP -- not Linux' };
    if (!existsSync(main)) return { skip: `watch-orcad: SKIP -- no built orca/ (${main} missing)` };
    const major = Number(/^v(\d+)/.exec(process.version)?.[1]);
    if (!(major >= 24)) return { skip: `watch-orcad: SKIP -- this Node is ${process.version}; orcad needs 24 or newer` };
    const base = mkdtempSync(join(process.env.XDG_RUNTIME_DIR && existsSync(process.env.XDG_RUNTIME_DIR) ? process.env.XDG_RUNTIME_DIR : tmpdir(), 'pb-g2o-'));
    const started = [];
    try {
        const home = join(base, 'h');
        const dataRoot = join(base, 'd');
        mkdirSync(home, { recursive: true });
        mkdirSync(dataRoot, { recursive: true, mode: 0o700 });
        if (!env.socketPathFits(dataRoot)) return { skip: `watch-orcad: SKIP -- scratch data root ${dataRoot} is too long for orcad's socket path` };
        const version = JSON.parse(read(join(paths.orcaDir, 'package.json')) ?? '{}').version || '0.0.0';
        const inherited = { PATH: process.env.PATH ?? '', HOME: home };
        const orcadEnv = env.buildOrcadEnv((n) => inherited[n] ?? '', { dataRoot, orcaVersion: version, claudeAgentSdkDir: '' });
        const port = await freePort(env);
        const args = [...env.buildOrcadWatchArgs({ orcadMain: main }), ...env.buildOrcadArgs({ orcadMain: main, port, webClientRoot: join(paths.orcaDir, 'out', 'web') })];
        const child = spawn(process.execPath, args, { cwd: dataRoot, env: orcadEnv, stdio: ['pipe', 'pipe', 'pipe'] });
        const orcad = [child.pid, startTicks(child.pid)];
        started.push(orcad);
        const lines = [];
        const sink = env.createOutputSink({ pushLog: (l) => { lines.push(l); if (lines.length > 50) lines.shift(); } });
        child.stdout.on('data', (d) => sink.onStdout(String(d)));
        child.stderr.on('data', (d) => sink.onStderr(String(d)));
        const exited = new Promise((r) => child.once('exit', (c, s) => r(s ?? `code ${c}`)));
        const ready = await Promise.race([sink.ready(), exited.then(() => null), sleep(60000).then(() => null)]);
        if (!ready) return { fails: [`watch-orcad: orcad with the watch preloaded printed no ready line (stderr: ${lines.slice(-4).join(' | ').slice(-400)})`] };
        if (!ready.daemonPid) return { skip: 'watch-orcad: SKIP -- orcad reported no terminal daemon on this host, so the daemon half cannot be observed' };
        const daemon = [ready.daemonPid, startTicks(ready.daemonPid)];
        started.push(daemon);
        child.stdin.write(`${env.orcadAcceptedLine({ daemonPid: daemon[0], daemonTicks: daemon[1] })}\n`);
        await sleep(1500);
        if (!isAlive(...orcad) || !isAlive(...daemon)) return { fails: [`watch-orcad: orcad or its daemon ended while PowerBrowser's stand-in was still running (orcad ${isAlive(...orcad)}, daemon ${isAlive(...daemon)})`] };
        child.stdin.end();
        if (!(await waitGone([orcad, daemon], 30000))) {
            return { fails: [`watch-orcad: stdin end-of-file left ${[isAlive(...orcad) && `orcad (pid ${orcad[0]})`, isAlive(...daemon) && `its terminal daemon (pid ${daemon[0]})`].filter(Boolean).join(' and ')} running 30 s later`] };
        }
        return { pass: `watch-orcad: the pinned orcad reported ready with the watch preloaded, and stdin end-of-file ended it and its terminal daemon (pid ${daemon[0]})` };
    } finally {
        for (const [pid, ticks] of started.reverse()) killIdentity(pid, ticks);
        rmSync(base, { recursive: true, force: true });
    }
}

// ---------------------------------------------------------------------------

export async function check(paths, { fixture = true } = {}) {
    const env = await freshImport(paths.orcaEnv);
    const fails = [];
    const notes = [];
    const clauses = [
        ['watch-wired', watchWired], ['restart-keeps-daemon', restartKeepsDaemon], ['failed-start', failedStart],
        ['stop-during-ready', stopDuringReady], ['exit-handoff', exitHandOff], ['no-offer', noOffer],
        ['start-after-quit', startAfterQuit], ['crash-loop', crashLoop], ['theia-clears', theiaClears],
        ['platform-alias', platformAlias], ['port-holder', portHolder], ['sidecar-orca-port', sidecarOrcaPort],
    ];
    for (const [label, fn] of clauses) {
        try { fails.push(...(await fn(paths, env))); } catch (err) { fails.push(`${label}: threw ${err && err.stack ? err.stack.split('\n').slice(0, 2).join(' ') : err}`); }
    }
    for (const fn of fixture ? [() => watchFixture(env), () => watchOrcad(paths, env)] : []) {
        try {
            const r = await fn();
            if (r.skip) notes.push(r.skip);
            if (r.pass) notes.push(r.pass);
            fails.push(...(r.fails ?? []));
        } catch (err) { fails.push(`watch: threw ${err && err.message ? err.message : err}`); }
    }
    return { fails, notes };
}

// ---------------------------------------------------------------------------
// Self-test.

function plants() {
    const swap = (a, b) => (t) => { if (!t.includes(a)) throw new Error(`plant target not found: ${a.slice(0, 70)}`); return t.split(a).join(b); };
    const S = 'OrcaService.sys.mjs';
    const E = 'OrcaEnv.sys.mjs';
    return [
        { name: 'no watch ahead of orcad', naming: 'watch-wired', file: S, edit: swap('      ...OrcaEnv.buildOrcadWatchArgs({ orcadMain: this._orcadMain }),\n', '') },
        { name: 'no accepted line', naming: 'watch-wired', file: S, edit: swap('await PowerBrowserAPI.writeStdinLine(proc, ', 'void (proc, ') },
        { fixture: true, name: 'watch ignores end-of-file', naming: 'a. PowerBrowser gone', file: E, edit: swap('  process.stdin.on("end", gone);\n', '') },
        { fixture: true, name: 'watch arms in every process', naming: 'b. orcad exit after acceptance', file: E, edit: swap('isMainThread && process.argv[1] === resolve(MAIN) && (stdin.isFIFO() || stdin.isSocket())', 'isMainThread') },
        { fixture: true, name: 'watch ends nothing on a failed start', naming: 'c. orcad exit before acceptance', file: E, edit: swap('if (parentGone || !accepted) {', 'if (parentGone) {') },
        { fixture: true, name: 'watch ignores the named daemon', naming: 'd. adopted daemon', file: E, edit: swap('      roots.push(daemon.pid);\n', '') },
        { fixture: true, name: 'watch takes the named daemon without its start ticks', naming: 'e. wrong start ticks', file: E, edit: swap('if (daemon && rows.get(daemon.pid)?.ticks === daemon.ticks) {', 'if (daemon && rows.has(daemon.pid)) {') },
        { name: 'restart reaps the adopted daemon', naming: 'restart-keeps-daemon', file: S, edit: swap('if (own && includeDaemon && !adopted) {', 'if (own && includeDaemon) {') },
        { name: 'timeout ends orcad by its handle only', naming: 'failed-start', file: S, edit: swap('    if (outcome.timeout) {\n      await this._endFailedStart(proc, endOwn);', '    if (outcome.timeout) {\n      await endOwn();') },
        { name: 'failed start ends the adopted daemon', naming: 'failed-start', file: S, edit: swap('const kept = new Set((await this._sameIdentity(this._daemonPid, this._daemonTicks)) ? [this._daemonPid] : []);', 'const kept = new Set();') },
        {
            name: 'writes after ready ignore a stop', naming: 'stop-during-ready', file: S,
            edit: (t) => swap('    // Audit fix 62-WR-03: again, for a ready line that resolved while this stop ran.\n    await this._removeHandOff();\n', '')(
                swap('    if (!this._shuttingDown) {\n      await this._writeHandOff(offer);\n    }\n', '    await this._writeHandOff(offer);\n')(
                    t.replace(/\n {4}if \(this\._shuttingDown\) \{\n {6}await endOwn\(\);\n {6}return \{ ok: false, recoverable: false, step: "stopping", rows: \[\] \};\n {4}\}\n(?= {4}(this\._pid = proc\.pid|\/\/ Phase 63|this\._state = "ready"))/g, '\n'))),
        },
        { name: 'unexpected exit keeps the hand-off files', naming: 'exit-handoff', file: S, edit: swap('      // exited; the next ready writes them again.\n      await this._removeHandOff();\n', '      // exited; the next ready writes them again.\n') },
        { name: 'no-offer ready keeps the old offer', naming: 'no-offer', file: S, edit: swap('      await this._removeBridgeFile(OrcaEnv.ORCA_WEB_PAIRING_FILE);\n', '') },
        { name: 'quit hooks armed only by start()', naming: 'start-after-quit', file: 'powerbrowser.js', edit: swap('    OrcaService.armQuitHooks();\n', '') },
        { name: 'exits after ready never counted', naming: 'crash-loop', file: S, edit: swap('if (exits >= PowerBrowserAPI.getIntPref("powerbrowser.orca.giveUpAttempts", 5)) {', 'if (false) {') },
        { name: 'Theia start keeps stale hand-off files', naming: 'theia-clears', file: 'TheiaService.sys.mjs', edit: swap('    await this._clearStaleOrcaHandOff();\n', '') },
        { name: 'darwin ln with -T', naming: 'platform-alias', file: E, edit: swap('platform === "darwin" ? "-sfn" : "-sfnT"', '"-sfnT"') },
        { name: 'alias made on win32', naming: 'platform-alias', file: E, edit: swap('return platform !== "win32" && !socketPathFits(root);', 'return !socketPathFits(root);') },
        { name: 'USERPROFILE not passed to orcad', naming: 'USERPROFILE', file: E, edit: swap('  "USERPROFILE",\n', '') },
        { name: 'Theia backend not given the orcad port', naming: 'sidecar-orca-port', file: 'TheiaService.sys.mjs', edit: swap('      ...(orcaPort ? { POWERBROWSER_ORCA_PORT: String(orcaPort) } : {}),\n', '') },
        { name: 'Theia reads its own port default', naming: 'sidecar-orca-port', file: 'TheiaService.sys.mjs', edit: swap('const port = this._orcaPortSource ? this._orcaPortSource() : null;', 'const port = 26768;') },
        { name: 'port source not wired before Theia starts', naming: 'sidecar-orca-port', file: 'powerbrowser.js', edit: swap('      TheiaService.setOrcaPortSource(() => OrcaService.orcadPort());\n', '') },
        { name: 'port holder row dropped', naming: 'port-holder', file: S, edit: swap('...rows, ...holder]', '...rows]') },
    ];
}

async function runSelfTest() {
    const tmp = mkdtempSync(join(tmpdir(), 'pb-g2-self-'));
    try {
        cpSync(join(REPO_ROOT, 'powerbrowser', 'shell'), join(tmp, 'powerbrowser', 'shell'), { recursive: true });
        const paths = pathsFor(tmp, { orcaDir: join(REPO_ROOT, 'orca'), realOrcad: false });
        const clean = await check(paths);
        if (clean.fails.length) {
            for (const f of clean.fails) console.error(`${NAME} self-test: control FAIL -- ${f}`);
            return 1;
        }
        console.log(`  ok control is green${clean.notes.length ? ` (${clean.notes.join('; ')})` : ''}`);
        let bad = 0;
        for (const plant of plants()) {
            const file = join(paths.shellDir, plant.file);
            const original = readFileSync(file, 'utf8');
            try {
                writeFileSync(file, plant.edit(original));
                const r = await check(paths, { fixture: plant.fixture === true });
                const named = r.fails.some((f) => f.includes(plant.naming));
                if (named) console.log(`  ok ${plant.name} -> red, naming '${plant.naming}'`);
                else { bad += 1; console.error(`  FAIL ${plant.name} -> ${r.fails.length ? `red but not naming '${plant.naming}': ${r.fails[0]}` : 'stayed green'}`); }
            } catch (err) {
                bad += 1;
                console.error(`  FAIL ${plant.name} -> ${err.message}`);
            } finally {
                writeFileSync(file, original);
            }
        }
        if (bad) { console.error(`${NAME} self-test: FAIL -- ${bad} plant(s) did not go red naming the drift`); return 1; }
        console.log(`${NAME} self-test: PASS -- ${plants().length} planted faults each went red naming the drift`);
        return 0;
    } finally {
        rmSync(tmp, { recursive: true, force: true });
    }
}

const isEntryPoint = (() => { try { return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })();
if (isEntryPoint) {
    const args = process.argv.slice(2);
    const unknown = args.find((a) => a !== '--self-test');
    if (unknown !== undefined) {
        console.error(`${NAME}: FAIL -- unknown argument '${unknown}' (usage: node ${SELF_REL} [--self-test])`);
        process.exit(2);
    }
    if (args.includes('--self-test')) process.exit(await runSelfTest());
    const r = await check(pathsFor(REPO_ROOT));
    for (const n of r.notes) console.log(`${NAME}: ${n}`);
    if (r.fails.length) {
        for (const f of r.fails) console.error(`${NAME}: FAIL -- ${f}`);
        process.exit(1);
    }
    console.log(`${NAME}: PASS -- orcad carries the parent watch and is told when its start is accepted; the watch ends orcad, its daemon and the agents when PowerBrowser is gone and after a failed start, keeps them after an accepted orcad's exit, ends a named daemon and never a pid whose start ticks differ; Restart keeps the adopted daemon; a failed start ends the daemon under it; no hand-off file outlives a stop, an unexpected exit or a ready line with no offer, and Theia's start clears a crashed session's; a start after quit spawns nothing; exits after ready end in failed with a backoff; darwin and win32 aliasing; the port holder row`);
    process.exit(0);
}
