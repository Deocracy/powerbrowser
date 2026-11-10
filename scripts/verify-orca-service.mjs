#!/usr/bin/env node
// scripts/verify-orca-service.mjs
//
// RUN-03, RUN-04, RUN-05 (Phase 62, plan 62-02): the orcad supervisor
// (powerbrowser/shell/OrcaService.sys.mjs) and the pure module it is built on
// (powerbrowser/shell/OrcaEnv.sys.mjs). Everything is derived at check time:
//
//  1. Registration. The set of powerbrowser/shell/*.sys.mjs files equals the
//     set jar.mn ships, both ways. A module missing from jar.mn fails only at
//     runtime, and nothing else notices.
//  2. Boundary use. OrcaService imports only chrome://powerbrowser/content/
//     modules, spawns only through PowerBrowserProcesses.spawnProcessExact
//     (never the inheriting spawn), and spells no environment name: every name
//     of OrcaEnv's ORCAD_ENV_ALLOWLIST and ORCAD_FIXED_ENV_NAMES is searched
//     for as a string literal in it.
//  3. OrcaEnv rules, by calling the module: port 0 and out-of-range ports
//     throw, the bind host is loopback, the socket budget plus the socket
//     suffix fits the smallest socket path limit, the allowlist holds no
//     variable that steers Node or relocates orcad's data.
//  4. The powerbrowser.orca.port default in powerbrowser-sidecar.js is an
//     integer inside OrcaEnv's PORT_MIN..PORT_MAX.
//  5. Scenarios. The shipped OrcaService source is imported into Node against
//     a stub boundary (a fake ChromeUtils whose importESModule returns stub
//     PowerBrowserAPI and PowerBrowserProcesses objects and the real OrcaEnv),
//     every boundary call is recorded in order, and start() and stop() are
//     driven:
//       A  start to ready, then stop. The spawned environment's names equal
//          OrcaEnv.expectedEnvNames of the fake browser environment (which
//          holds a planted ORCA_PLANT_62 and a Node-steering name); both quit
//          hooks are registered before the spawn; a sentinel pairing value fed
//          on stdout and on stderr appears in no state, log line, diagnostics
//          row, console line or state file; stop ends orcad before the daemon.
//
// Limit: the stub boundary proves OrcaService's decisions (what it spawns,
// with what, in what order, and what it signals). It does not prove Gecko's
// Subprocess, the /proc reads or orcad itself; orca-service-live does, on a
// built PowerBrowser and a built orcad.
//
// Honestly --quick: text reads and in-process imports. No build, browser,
// display, network or child process.
//
// Usage:
//   node scripts/verify-orca-service.mjs

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'orca-service';
const SELF_REL = 'scripts/verify-orca-service.mjs';

// The smallest socket path limit orcad runs under (macOS sun_path 104, one byte for the NUL), and the
// longest suffix orcad appends to the data root: /o-<7 digit pid>-<4>.sock.
const SMALLEST_SOCKET_PATH = 103;
const SOCKET_SUFFIX_BYTES = 19;
// Names that steer Node or move orcad's data; none may be inherited.
const STEERING = ['NODE_OPTIONS', 'NODE_PATH', 'NODE_REPL_EXTERNAL_MODULE', 'ELECTRON_RUN_AS_NODE', 'XDG_DATA_HOME', 'LD_PRELOAD', 'LD_LIBRARY_PATH'];
const SENTINEL = 'PB62SENTINELpairingCODE0123456789';

/** Every input path of the check, for a tree rooted at `root`. */
export function pathsFor(root) {
    const shellDir = join(root, 'powerbrowser', 'shell');
    return {
        shellDir,
        orcaService: join(shellDir, 'OrcaService.sys.mjs'),
        orcaEnv: join(shellDir, 'OrcaEnv.sys.mjs'),
        prefs: join(shellDir, 'powerbrowser-sidecar.js'),
        jarMn: join(shellDir, 'jar.mn'),
    };
}

let importCounter = 0;
const freshImport = (path) => import(`${pathToFileURL(path).href}?v=${process.pid}-${++importCounter}`);
const read = (path) => { try { return readFileSync(path, 'utf8'); } catch { return null; } };

// ---------------------------------------------------------------------------
// The stub boundary.

function fakeProc(pid, { stdout = [], stderr = [], exitCode = null } = {}) {
    let resolveWait;
    const waited = new Promise((r) => { resolveWait = r; });
    const queue = { stdout: [...stdout], stderr: [...stderr] };
    const proc = {
        pid,
        exitCode: null,
        wait: () => waited,
        read: async (which) => (queue[which].length ? queue[which].shift() : null),
        exit(code) { if (proc.exitCode === null) { proc.exitCode = code; resolveWait({ exitCode: code }); } },
    };
    // After the pipes have drained, as a real exit is.
    if (exitCode !== null) setTimeout(() => proc.exit(exitCode), 3);
    return proc;
}

export function readyLine(port, { host = '127.0.0.1', daemonPid = 5002, nodeVersion = 'v24.19.0' } = {}) {
    return `${JSON.stringify({
        event: 'orca_server_ready',
        boundEndpoint: `ws://${host}:${port}`,
        health: { nodeVersion, terminalDaemon: { pid: daemonPid } },
        pairing: { available: true, webClientUrl: `http://127.0.0.1:${port}/#pairing=${SENTINEL}`, url: `orca://pair?code=${SENTINEL}` },
    })}\n`;
}

/**
 * Stub PowerBrowserAPI and PowerBrowserProcesses. `world` describes the fake host: profileDir, env,
 * prefs, existing paths, JSON files, live pids with start ticks, the process tree, and spawn(command,
 * args) returning a fakeProc. Every call lands in `calls` in order.
 */
function makeBoundary(world) {
    const calls = [];
    const consoleLines = [];
    const rec = (name, ...args) => { calls.push({ name, args }); };
    const alive = new Map(world.alive ?? []);
    const files = new Map(Object.entries(world.files ?? {}));
    const exists = new Set(world.exists ?? []);
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
    const api = {
        getStringPref: pref,
        getIntPref: pref,
        prefHasUserValue: () => false,
        getEnv: (name) => world.env[name] ?? '',
        getProfileDir: () => world.profileDir,
        getAppDir: () => '',
        ensureDirectory: async (path) => { rec('ensureDirectory', path); },
        pathExists: async (path) => exists.has(path),
        pathSearch: async (command) => `/fake/bin/${command}`,
        readStateFile: async (path) => { rec('readStateFile', path); return files.get(path) ?? null; },
        writeStateFile: async (path, value) => { rec('writeStateFile', path, value); files.set(path, value); },
        removeStateFile: async (path) => { rec('removeStateFile', path); files.delete(path); },
        readProcessStartTicks: async (pid) => (alive.has(pid) ? alive.get(pid) : null),
        signalBarePid: (pid, signal) => {
            rec('signalBarePid', pid, signal);
            if (!alive.has(pid)) return false;
            if (signal !== 0 && !(world.immortal ?? []).includes(pid)) alive.delete(pid);
            return true;
        },
        killProcess: async (proc, graceMs) => { rec('killProcess', proc.pid, graceMs); alive.delete(proc.pid); proc.exit(0); },
        waitForExit: async (proc, graceMs) => { rec('waitForExit', proc.pid, graceMs); return true; },
        readPipeChunk: (proc, which) => proc.read(which),
        // Short waits collapse to a tick; long ones (timeouts that must lose their race) stay long and unref'd.
        sleep: (ms) => new Promise((r) => { if (ms < 1000) setTimeout(r, 1); else setTimeout(r, 2000).unref(); }),
        onQuitGranted: (fn) => { rec('onQuitGranted', fn); return () => rec('quitObserverOff'); },
        log: (level, message) => { consoleLines.push(String(message)); },
    };
    const processes = {
        spawnProcessExact: async (spec) => {
            rec('spawnProcessExact', spec);
            const proc = world.spawn(spec);
            if (proc.exitCode === null && !spec.command.endsWith('/ln')) alive.set(proc.pid, world.ticksFor?.(proc.pid) ?? '111');
            return proc;
        },
        listProcessTree: async (roots) => { rec('listProcessTree', roots); return (world.tree ?? (() => []))(roots).filter((row) => alive.has(row.pid)); },
        addNamedReapBlocker: (name, fn) => { rec('addNamedReapBlocker', name, fn); },
    };
    return { api, processes, calls, consoleLines, alive, files };
}

async function loadService(paths, boundary, env) {
    globalThis.ChromeUtils = {
        importESModule: (url) => {
            if (url === 'chrome://powerbrowser/content/PowerBrowserAPI.sys.mjs') return { PowerBrowserAPI: boundary.api, PowerBrowserProcesses: boundary.processes };
            if (url === 'chrome://powerbrowser/content/OrcaEnv.sys.mjs') return env;
            throw new Error(`OrcaService imported an unexpected module URL: ${url}`);
        },
    };
    const mod = await freshImport(paths.orcaService);
    if (!mod.OrcaService) throw new Error('OrcaService.sys.mjs exports no OrcaService');
    return mod.OrcaService;
}

const indexOfCall = (calls, name, test = () => true) => calls.findIndex((c) => c.name === name && test(c.args));

/** The fake host every scenario starts from: a short profile path, built Orca files, one orcad that reports ready. */
function baseWorld(overrides = {}) {
    const world = {
        profileDir: '/p/prof',
        env: { PATH: '/usr/bin', HOME: '/home/u', XDG_RUNTIME_DIR: '/run/user/1000', ORCA_PLANT_62: '1', NODE_OPTIONS: '--require /x.js', LANG: 'C.UTF-8' },
        exists: ['/o/out/orcad/orcad.js', '/o/out/web'],
        files: { '/o/package.json': { name: 'fixture', version: '9.9.9' } },
        ticksFor: (pid) => ({ 5001: '111' }[pid] ?? '111'),
        alive: [[5002, '222'], [5003, '333']],
        tree: (roots) => {
            const all = [{ pid: 5001, ppid: 1, startTicks: '111' }, { pid: 5002, ppid: 5001, startTicks: '222' }, { pid: 5003, ppid: 5002, startTicks: '333' }];
            const from = roots.includes(5001) ? 0 : roots.includes(5002) ? 1 : 3;
            return all.slice(from);
        },
        // 5003 stands for an agent that ignores the daemon's exit and has to be killed.
        immortal: [],
        ...overrides,
    };
    const port = world.prefs?.['powerbrowser.orca.port'] ?? 26768;
    const line = readyLine(port);
    world.spawn ??= () => fakeProc(5001, {
        stdout: [line.slice(0, 40), line.slice(40)],
        stderr: [`[orcad] web client at http://127.0.0.1:${port}/#pairing=${SENTINEL}\n`],
    });
    return world;
}

/** A: start to ready with an exact environment and no credential in any output; stop ends orcad, then the daemon. */
async function scenarioA(paths, env) {
    const fails = [];
    const world = baseWorld();
    const b = makeBoundary(world);
    const svc = await loadService(paths, b, env);
    await svc.start();
    const state = svc.getState();
    if (state.state !== 'ready') {
        return [`scenario A: start() ended in state '${state.state}', not ready: ${JSON.stringify(svc.getDiagnosticRows())}`];
    }
    const spawnAt = indexOfCall(b.calls, 'spawnProcessExact');
    const spec = b.calls[spawnAt].args[0];
    const dataRoot = `${world.profileDir}/${env.ORCAD_DATA_ROOT_NAME}`;

    const diff = env.compareEnvNames(Object.keys(spec.environment), env.expectedEnvNames(Object.keys(world.env)));
    for (const name of diff.extra) fails.push(`scenario A: the spawned environment carries ${name}, which is neither a fixed name nor an allowlisted name PowerBrowser has`);
    for (const name of diff.missing) fails.push(`scenario A: the spawned environment lacks ${name}`);
    if (spec.environment[env.ORCAD_HIDDEN_ELECTRON_SWITCH] !== '1') fails.push(`scenario A: ${env.ORCAD_HIDDEN_ELECTRON_SWITCH} is not 1 in the spawned environment`);
    if (spec.environment.ORCA_USER_DATA !== dataRoot || spec.environment.ORCA_USER_DATA_PATH !== dataRoot) {
        fails.push(`scenario A: the data root names are not both ${dataRoot}`);
    }
    if (spec.command !== '/fake/bin/node') fails.push(`scenario A: orcad was spawned on ${spec.command}, not the resolved Node`);
    const args = spec.args;
    if (args[args.indexOf('--bind') + 1] !== '127.0.0.1' || !args.includes('--bind')) fails.push('scenario A: orcad was not started with --bind 127.0.0.1 (loopback)');
    if (args[args.indexOf('--port') + 1] !== '26768' || !args.includes('--port')) fails.push('scenario A: orcad was not started with --port 26768');
    if (!args.includes('--json')) fails.push('scenario A: orcad was not started with --json');

    const observerAt = indexOfCall(b.calls, 'onQuitGranted');
    const blockerAt = indexOfCall(b.calls, 'addNamedReapBlocker', (a) => a[0] === env.ORCAD_REAP_BLOCKER_NAME);
    if (observerAt < 0 || observerAt > spawnAt) fails.push('scenario A: the quit observer is not registered before the spawn');
    if (blockerAt < 0 || blockerAt > spawnAt) fails.push(`scenario A: the reap blocker '${env.ORCAD_REAP_BLOCKER_NAME}' is not registered before the spawn (quit observer and blocker come first)`);

    const log = svc.getRecentLog().join('\n');
    if (!log.includes('[orcad] web client') || !log.includes('[redacted]')) fails.push('scenario A: the stderr line did not reach the log redacted, so the sentinel search below proves nothing');
    const outputs = {
        'getState()': JSON.stringify(state),
        'getRecentLog()': log,
        'getDiagnosticRows()': JSON.stringify(svc.getDiagnosticRows()),
        'the console mirror': b.consoleLines.join('\n'),
        'the state file': JSON.stringify([...b.files.values()]),
    };
    for (const [where, text] of Object.entries(outputs)) {
        if (text.includes(SENTINEL)) fails.push(`scenario A: the pairing sentinel reached ${where}`);
    }

    await svc.stop();
    const killAt = indexOfCall(b.calls, 'killProcess', (a) => a[0] === 5001);
    const daemonAt = indexOfCall(b.calls, 'signalBarePid', (a) => a[0] === 5002 && a[1] === 15);
    if (killAt < 0) fails.push('scenario A: stop() did not end orcad through its process handle');
    if (daemonAt < 0) fails.push('scenario A: stop() never signalled the terminal daemon');
    else if (killAt > daemonAt) fails.push('scenario A: stop() signalled the terminal daemon before ending orcad');
    if (svc.getState().state !== 'stopped') fails.push(`scenario A: state after stop() is '${svc.getState().state}'`);
    return fails;
}

// ---------------------------------------------------------------------------
// Static clauses.

function staticClauses(paths, env) {
    const fails = [];
    const service = read(paths.orcaService);
    const jar = read(paths.jarMn);
    const prefs = read(paths.prefs);
    if (service === null) return [`${paths.orcaService} is missing`];
    if (jar === null) return [`${paths.jarMn} is missing`];
    if (prefs === null) return [`${paths.prefs} is missing`];

    // 1. jar.mn ships exactly the shell's .sys.mjs files.
    const onDisk = new Set(readdirSync(paths.shellDir).filter((f) => f.endsWith('.sys.mjs')));
    const shipped = new Set([...jar.matchAll(/^\s+content\/powerbrowser\/(\S+\.sys\.mjs)\s+\((\S+)\)\s*$/gm)].map((m) => m[2]));
    for (const f of onDisk) if (!shipped.has(f)) fails.push(`jar.mn does not ship powerbrowser/shell/${f}`);
    for (const f of shipped) if (!onDisk.has(f)) fails.push(`jar.mn ships ${f}, which powerbrowser/shell does not contain`);

    // 2. Boundary use.
    const urls = [...service.matchAll(/importESModule\(\s*["']([^"']+)["']/g)].map((m) => m[1]);
    if (urls.length < 2) fails.push('OrcaService.sys.mjs does not import the boundary and OrcaEnv through ChromeUtils.importESModule');
    for (const url of urls) if (!url.startsWith('chrome://powerbrowser/content/')) fails.push(`OrcaService.sys.mjs imports ${url}, which is not a chrome://powerbrowser/content/ module`);
    if (/^\s*import\s/m.test(service)) fails.push('OrcaService.sys.mjs has a static import');
    if (!service.includes('PowerBrowserProcesses.spawnProcessExact(')) fails.push('OrcaService.sys.mjs does not spawn through PowerBrowserProcesses.spawnProcessExact');
    if (/\.spawnProcess\(/.test(service)) fails.push('OrcaService.sys.mjs calls the inheriting spawnProcess; orcad must get an exact environment');
    for (const name of [...env.ORCAD_ENV_ALLOWLIST, ...env.ORCAD_FIXED_ENV_NAMES]) {
        if (new RegExp(`(["'\`])${name}\\1`).test(service)) fails.push(`environment name ${name} is spelled as a literal in OrcaService.sys.mjs, outside OrcaEnv`);
    }

    // 3. OrcaEnv rules.
    const throws = (port) => { try { env.buildOrcadArgs({ orcadMain: 'o', port, webClientRoot: 'w' }); return false; } catch { return true; } };
    if (!throws(0)) fails.push('OrcaEnv.buildOrcadArgs accepts port 0; the product never lets the kernel pick the port');
    for (const port of [env.PORT_MIN - 1, env.PORT_MAX + 1, 26768.5, '26768']) {
        if (!throws(port)) fails.push(`OrcaEnv.buildOrcadArgs accepts port ${JSON.stringify(port)}, outside ${env.PORT_MIN}..${env.PORT_MAX}`);
    }
    if (env.PORT_MIN !== 1024 || env.PORT_MAX !== 32767) fails.push(`OrcaEnv's port range is ${env.PORT_MIN}..${env.PORT_MAX}, not 1024..32767 (privileged ports below, ephemeral ports above)`);
    if (env.ORCAD_BIND_HOST !== '127.0.0.1') fails.push(`OrcaEnv.ORCAD_BIND_HOST is ${env.ORCAD_BIND_HOST}, not loopback 127.0.0.1`);
    if (env.isLoopbackEndpoint('ws://0.0.0.0:26768', 26768) || !env.isLoopbackEndpoint('ws://127.0.0.1:26768', 26768)) fails.push('OrcaEnv.isLoopbackEndpoint does not hold orcad to loopback');
    if (env.ORCAD_SOCKET_ROOT_BUDGET + SOCKET_SUFFIX_BYTES > SMALLEST_SOCKET_PATH || env.socketPathFits('/'.repeat(env.ORCAD_SOCKET_ROOT_BUDGET + 1))) {
        fails.push(`OrcaEnv's socket path budget (${env.ORCAD_SOCKET_ROOT_BUDGET}) plus the ${SOCKET_SUFFIX_BYTES}-byte socket name exceeds the ${SMALLEST_SOCKET_PATH}-byte socket path limit`);
    }
    for (const name of env.ORCAD_ENV_ALLOWLIST) {
        if (STEERING.includes(name) || /^(ORCA|CLAUDE|NODE|ELECTRON)_/.test(name)) fails.push(`OrcaEnv.ORCAD_ENV_ALLOWLIST inherits ${name}, a steering variable`);
    }

    // 4. The port default.
    const m = prefs.match(/^pref\("powerbrowser\.orca\.port",\s*(-?\d+)\);$/m);
    if (!m) fails.push('powerbrowser-sidecar.js has no integer powerbrowser.orca.port default');
    else if (Number(m[1]) < env.PORT_MIN || Number(m[1]) > env.PORT_MAX) fails.push(`the powerbrowser.orca.port default ${m[1]} is outside 1024..32767 (above it is the ephemeral range)`);
    return fails;
}

/** Runs every clause and scenario over `paths`. Resolves { fails, scenarios }. */
export async function check(paths) {
    for (const key of ['orcaService', 'orcaEnv']) {
        if (!existsSync(paths[key])) return { fails: [`${paths[key]} is missing`], scenarios: [] };
    }
    let env;
    try { env = await freshImport(paths.orcaEnv); } catch (err) { return { fails: [`OrcaEnv.sys.mjs does not import in Node: ${err.message}`], scenarios: [] }; }
    const fails = staticClauses(paths, env);
    const scenarios = { A: scenarioA };
    const saved = globalThis.ChromeUtils;
    try {
        for (const [label, run] of Object.entries(scenarios)) {
            try { fails.push(...(await run(paths, env))); } catch (err) { fails.push(`scenario ${label} threw: ${err.message}`); }
        }
    } finally {
        if (saved === undefined) delete globalThis.ChromeUtils; else globalThis.ChromeUtils = saved;
    }
    return { fails, scenarios: Object.keys(scenarios) };
}

const isEntryPoint = (() => {
    try { return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();
if (isEntryPoint) {
    const args = process.argv.slice(2);
    if (args.length) {
        console.error(`${NAME}: FAIL -- unknown argument '${args[0]}' (usage: node ${SELF_REL})`);
        console.error(`  Next step: run: node ${SELF_REL}`);
        process.exit(2);
    }
    const r = await check(pathsFor(REPO_ROOT));
    if (r.fails.length) {
        for (const f of r.fails) console.error(`${NAME}: FAIL -- ${f}`);
        process.exit(1);
    }
    console.log(`${NAME}: PASS -- jar.mn ships every shell module, OrcaService spawns only through the exact-environment boundary and spells no environment name, OrcaEnv refuses port 0 and non-loopback; stub-boundary scenarios run: ${r.scenarios.join(', ')}`);
    process.exit(0);
}
