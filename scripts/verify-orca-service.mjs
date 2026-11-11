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
//     variable that steers Node or relocates orcad's data. After D-31 orcad's
//     environment is Phase 62's: no fixed name and no buildOrcadEnv option
//     spells a PTY (the "pty switch" plant).
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
//       B  reap. A leftover orcad and daemon named by the state file, and an
//          orcad named by orcad's own lock, are signalled when their start
//          ticks match and never when they differ (a recycled pid); orcad's
//          lock file is never removed.
//       C  stop order: orcad through its handle with a grace of at least
//          16000 ms, the wait, the daemon's SIGTERM, then SIGKILL for a
//          snapshot descendant that stayed alive; no negative (group) pid.
//       D  busy port: orcad exits with the pinned-port code; one spawn only,
//          state failed, a diagnostics row naming the code.
//       E  a ready line naming a non-loopback address: orcad is ended, state
//          failed.
//       F  a profile path too long for orcad's socket: ln -sfnT makes an
//          alias under the runtime directory with a search-path-only
//          environment and orcad is given the alias; a short path spawns no ln.
//       H  (Phase 63) no bridge folder can be chosen (no runtime directory, HOME
//          under /tmp): state still reaches ready, nothing is written through
//          writePrivateFile, and the "Orca bridge folder" row reads "not available".
//       I  (Phase 68, D-30, P68-38) Theia's backend-settings.json lists the Claude agent
//          SDK extension as disabled: orcad's ORCA_CLAUDE_AGENT_SDK_DIR is the empty string.
//          Scenario A (no settings file) requires the extension's SDK path instead.
//     Scenario A also checks (Phase 63, D-31, P63-26, P63-35) that orcad-data-root
//     is written through PowerBrowserProcesses.writePrivateFile into the bridge
//     folder OrcaEnv.bridgeDirFor derives, only after the ready line, with the
//     effective root and a newline, that getState().bridgeDir and the "Orca bridge
//     folder" row name it, and that stop removes the file.
//  6. Wiring (powerbrowser.js): the Theia start statement is byte-identical
//     to its pre-62 text and continues with .finally(() => OrcaService.start()
//     .catch(...)); the diagnostics rows spread OrcaService.getDiagnosticRows().
//  7. No user-facing copy (P62-13): the name of TheiaService's user-message
//     table and the names of the functions powerbrowser.js defines on window
//     are derived from those files, and none appears in OrcaService.
//  8. Egress: exactly one endpoint-allowlist.json host ends with onorca.dev,
//     it is the suffix row .onorca.dev, and its disposition is user-initiated.
//  9. Pinned source, when orca/ is a git checkout (else a printed SKIP for
//     these clauses only): the port default differs from Orca's own
//     DEFAULT_WS_PORT, and both failure codes OrcaEnv matches on appear under
//     orca/src/main.
// 11. Hand-off files (Phase 64, P64-06, P64-07, P64-34, interface C5). Scenario J
//     (hand-off files): a ready line whose pairing offer is a canary built at run
//     time, with the pane bundle folder present: web-pairing (the offer and a
//     newline) and orca-panes-dir (the folder and a newline) are written through
//     writePrivateFile into the bridge folder after the ready line and after
//     orcad-data-root; the canary reaches no log line, console line, getState(),
//     diagnostics row or parseReadyLine result; stop removes both, and (64-06)
//     every removal of orcad-data-root, web-pairing and orca-panes-dir during stop
//     precedes the killProcess call for orcad. Scenario J-b:
//     the bundle folder absent, no orca-panes-dir write and the "Orca tabs bundle"
//     row reads "not built". Cross-lane clauses: OrcaEnv's two file names equal
//     WEB_PAIRING_FILE and PANES_DIR_FILE in theia/extensions/orca-panes'
//     protocol (SKIP only while that directory is absent, lane p64-02), and
//     out/web/<ORCA_PANES_DIR_REL> equals the outDir literal of
//     orca-overlay/files/vite.pb-panes.config.ts (SKIP only while that file is
//     absent, lane p64-01). Present without the literal is red.
// 12. Failure classes (Phase 67, RUN-06, P67-02..P67-05, P67-36). Scenario G (failure
//     classes): the busy port of D reads failureClass port-in-use; a ready line whose
//     pairing is unavailable (reason device_registry_unavailable plus a sentinel field)
//     reads pairing-lost with the row "Orca pairing failure", and the sentinel reaches no
//     getState(), log line or diagnostics row; an unexpected exit reads restarting while
//     the supervisor starts orcad again; from ready, reportClientFailure of the
//     browser-host reason reads browser-not-attached with the row "Orca browser host", and
//     an unknown reason is refused. Static: the orcaStatus arm of handleOrcaShellMessage in
//     PowerBrowserAPI.sys.mjs spreads OrcaEnv.orcaStatusReply(OrcaService.getState()) and
//     names no other getState field, and orcaStatusReply over a full state has exactly the
//     keys state and failureClass.
//     Scenario K (restart, plan 67-01's H): restart() in ready and in starting answers
//     false and spawns nothing; in failed (D's busy port) it answers true and spawns
//     exactly once more.
//     Scenario L (RUN-09 refusal, plan 67-01's J): with the stub's TmpD at /scratch/tmpd,
//     a profile under it, a profile under $TMPDIR, and a long profile whose alias
//     resolves under TmpD each fail with failureClass temporary-profile and the row "Orca
//     temporary folder", spawn no orcad and read no reap record; a profile outside every
//     root with the plaintext override at its trigger value fails with plaintext-setting
//     and the row "Orca setting"; with another value orcad starts. Every run carries the
//     "Orca credential key folder" row (HOME/.orca).
// 10. Bridge folder key (Phase 63, D-31, P63-35): the POWERBROWSER_ORCA_* key
//     TheiaService.sys.mjs sets is derived from it, and TheiaService computes
//     its value through OrcaEnv.bridgeDirFor and OrcaEnv.dataRootFor. When
//     theia/extensions/orca-agents exists, the POWERBROWSER_* keys its
//     src/node/orca-agents-backend-module.ts reads from POWERBROWSER_ENV are
//     derived and must include that key. While the extension directory is
//     absent (lane p63-03 not merged) that comparison alone prints a SKIP; the
//     directory present with the backend module missing is red.
//
// Limit: the stub boundary proves OrcaService's decisions (what it spawns,
// with what, in what order, and what it signals). It does not prove Gecko's
// Subprocess, the /proc reads or orcad itself; orca-service-live does, on a
// built PowerBrowser and a built orcad.
//
// --self-test copies the inputs and a fixture Orca source tree into a mkdtemp
// directory, runs the same check on the copies as a green control, then plants
// each fault, requires red naming it, undoes it and requires green again.
//
// Honestly --quick: text reads, in-process imports and git grep over the
// fetched orca/ checkout. No build, browser, display or network.
//
// Usage:
//   node scripts/verify-orca-service.mjs
//   node scripts/verify-orca-service.mjs --self-test

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
const WS_PORT_REL = 'src/main/runtime/runtime-rpc/runtime-rpc-pairing-types.ts';
const THEIA_START = 'TheiaService.start(browserElement).catch(err => TheiaService.reportUnexpectedFailure(err))';

/** Every input path of the check, for a tree rooted at `root`. */
export function pathsFor(root) {
    const shellDir = join(root, 'powerbrowser', 'shell');
    return {
        shellDir,
        orcaService: join(shellDir, 'OrcaService.sys.mjs'),
        orcaEnv: join(shellDir, 'OrcaEnv.sys.mjs'),
        api: join(shellDir, 'PowerBrowserAPI.sys.mjs'),
        theiaService: join(shellDir, 'TheiaService.sys.mjs'),
        shellJs: join(shellDir, 'powerbrowser.js'),
        prefs: join(shellDir, 'powerbrowser-sidecar.js'),
        jarMn: join(shellDir, 'jar.mn'),
        allowlist: join(root, 'powerbrowser', 'endpoint-allowlist.json'),
        orcaDir: join(root, 'orca'),
        orcaAgentsDir: join(root, 'theia', 'extensions', 'orca-agents'),
        orcaAgentsBackend: join(root, 'theia', 'extensions', 'orca-agents', 'src', 'node', 'orca-agents-backend-module.ts'),
        orcaPanesDir: join(root, 'theia', 'extensions', 'orca-panes'),
        orcaPanesProtocol: join(root, 'theia', 'extensions', 'orca-panes', 'src', 'common', 'orca-panes-protocol.ts'),
        panesViteConfig: join(root, 'orca-overlay', 'files', 'vite.pb-panes.config.ts'),
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
        // The bare code is a form redact() has no pattern for: only never logging stdout keeps it out.
        pairing: { available: true, code: SENTINEL, webClientUrl: `http://127.0.0.1:${port}/#pairing=${SENTINEL}`, url: `orca://pair?code=${SENTINEL}` },
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
        // Records the moment the whole ready line has been handed to OrcaService, so writes can be ordered after it.
        readPipeChunk: async (proc, which) => {
            const chunk = await proc.read(which);
            if (which === 'stdout' && chunk !== null) {
                proc.stdoutSeen = (proc.stdoutSeen ?? '') + chunk;
                if (proc.stdoutSeen.includes('orca_server_ready') && proc.stdoutSeen.includes('\n') && !proc.readySeen) { proc.readySeen = true; rec('readyLineDelivered', proc.pid); }
            }
            return chunk;
        },
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
        platform: () => world.platform ?? 'linux',
        writePrivateFile: async (dir, name, text) => { rec('writePrivateFile', dir, name, text); },
    };
    // Phase 67 (P67-16): Gecko's TmpD and nsIFile normalize(), from the world's tmpD and realPaths.
    const hosting = {
        getTempDir: () => { rec('getTempDir'); return world.tmpD ?? '/tmp'; },
        realPath: (path) => { rec('realPath', path); return world.realPaths?.[path] ?? path; },
    };
    return { api, processes, hosting, calls, consoleLines, alive, files };
}

async function loadService(paths, boundary, env) {
    globalThis.ChromeUtils = {
        importESModule: (url) => {
            if (url === 'chrome://powerbrowser/content/PowerBrowserAPI.sys.mjs') return { PowerBrowserAPI: boundary.api, PowerBrowserProcesses: boundary.processes, PowerBrowserOrcaHosting: boundary.hosting };
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
    world.orcad ??= () => fakeProc(5001, {
        stdout: [line.slice(0, 40), line.slice(40)],
        stderr: [`[orcad] web client at http://127.0.0.1:${port}/#pairing=${SENTINEL}\n`],
    });
    world.spawn = (spec) => (spec.command.endsWith('/ln') ? fakeProc(7000, { exitCode: 0 }) : world.orcad(spec));
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
    const sdkDir = env.claudeAgentSdkDir({ profileDir: world.profileDir, backendSettings: null });
    if (!sdkDir || spec.environment[env.ORCAD_CLAUDE_AGENT_SDK_DIR_ENV] !== sdkDir) fails.push(`scenario A: with no Theia settings file ${env.ORCAD_CLAUDE_AGENT_SDK_DIR_ENV} is ${JSON.stringify(spec.environment[env.ORCAD_CLAUDE_AGENT_SDK_DIR_ENV])}, not the extension's SDK path ${sdkDir}`);
    if (spec.environment.ORCA_USER_DATA !== dataRoot || spec.environment.ORCA_USER_DATA_PATH !== dataRoot) {
        fails.push(`scenario A: the data root names are not both ${dataRoot}`);
    }
    if (spec.command !== '/fake/bin/node') fails.push(`scenario A: orcad was spawned on ${spec.command}, not the resolved Node`);
    const args = spec.args;
    if (args[args.indexOf('--bind') + 1] !== '127.0.0.1' || !args.includes('--bind')) fails.push('scenario A: orcad was not started with --bind 127.0.0.1 (loopback)');
    if (args[args.indexOf('--port') + 1] !== '26768' || !args.includes('--port')) fails.push('scenario A: orcad was not started with --port 26768');
    if (!args.includes('--json')) fails.push('scenario A: orcad was not started with --json');

    // Phase 63: the bridge folder, derived through the Node-imported OrcaEnv from the fake host.
    const bridgeDir = await env.bridgeDirFor(dataRoot, (n) => world.env[n] ?? '', 'linux');
    if (state.bridgeDir !== bridgeDir) fails.push(`scenario A: getState().bridgeDir is ${state.bridgeDir}, not ${bridgeDir}`);
    if (!svc.getDiagnosticRows().some(([label, value]) => label === 'Orca bridge folder' && value === bridgeDir)) fails.push('scenario A: no diagnostics row names the Orca bridge folder');
    const readyAt = indexOfCall(b.calls, 'readyLineDelivered');
    const rootWrites = b.calls.map((c, i) => ({ c, i })).filter(({ c }) => c.name === 'writePrivateFile' && c.args[1] === env.ORCAD_DATA_ROOT_FILE);
    if (!rootWrites.length) fails.push(`scenario A: ${env.ORCAD_DATA_ROOT_FILE} was never written through writePrivateFile`);
    for (const { c, i } of rootWrites) {
        if (readyAt < 0 || i < readyAt) fails.push(`scenario A: ${env.ORCAD_DATA_ROOT_FILE} was written before ready (call ${i}, ready line at ${readyAt})`);
        if (c.args[0] !== bridgeDir || c.args[2] !== `${dataRoot}\n`) fails.push(`scenario A: ${env.ORCAD_DATA_ROOT_FILE} was written as ${JSON.stringify(c.args)}, not (${bridgeDir}, the effective root and a newline)`);
    }

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
    if (indexOfCall(b.calls, 'removeStateFile', (a) => a[0] === env.bridgeFileFor(bridgeDir, env.ORCAD_DATA_ROOT_FILE, 'linux')) < 0) fails.push(`scenario A: ${env.ORCAD_DATA_ROOT_FILE} was not removed on stop()`);
    return fails;
}

const orcadSpawns = (calls) => calls.filter((c) => c.name === 'spawnProcessExact' && !c.args[0].command.endsWith('/ln'));
const signalsTo = (calls, pid) => calls.filter((c) => c.name === 'signalBarePid' && c.args[0] === pid && c.args[1] !== 0).map((c) => c.args[1]);

/** B: reap by pid plus start ticks; a recycled pid is never signalled; orcad's lock is never removed. */
async function scenarioB(paths, env) {
    const fails = [];
    const dataRoot = `/p/prof/${env.ORCAD_DATA_ROOT_NAME}`;
    const statePath = `${dataRoot}/${env.ORCAD_STATE_FILE_NAME}`;
    const lockPath = `${dataRoot}/${env.ORCAD_LOCK_FILE_NAME}`;
    const files = {
        '/o/package.json': { version: '9.9.9' },
        [statePath]: { orcadPid: 4242, orcadTicks: '100', daemonPid: 4243, daemonTicks: '200', port: 26768 },
        // orcad writes its ticks as a number; the comparison is by string.
        [lockPath]: { pid: 4244, linuxStartTicks: 300 },
    };
    for (const [label, observed, expectSignal] of [['matching ticks', '100', true], ['differing ticks', '999', false]]) {
        const b = makeBoundary(baseWorld({ files: { ...files }, alive: [[4242, observed], [4243, '200'], [4244, '300'], [5002, '222']] }));
        const svc = await loadService(paths, b, env);
        await svc.start();
        const spawnAt = indexOfCall(b.calls, 'spawnProcessExact');
        const termAt = indexOfCall(b.calls, 'signalBarePid', (a) => a[0] === 4242 && a[1] !== 0);
        if (expectSignal) {
            if (termAt < 0 || termAt > spawnAt || b.calls[termAt].args[1] !== 15) fails.push(`scenario B (${label}): the leftover orcad pid 4242 was not sent SIGTERM before the spawn`);
            if (!signalsTo(b.calls, 4243).includes(15)) fails.push(`scenario B (${label}): the leftover terminal daemon pid 4243 was not sent SIGTERM`);
            if (!signalsTo(b.calls, 4244).includes(15)) fails.push(`scenario B (${label}): the orcad named by orcad's own lock (pid 4244) was not sent SIGTERM`);
        } else if (termAt >= 0) {
            fails.push(`scenario B (${label}): recycled pid 4242 was signalled although its start ticks differ from the record`);
        }
        if (b.calls.some((c) => c.name === 'removeStateFile' && c.args[0] !== statePath)) fails.push(`scenario B (${label}): removeStateFile was called on a file other than ${env.ORCAD_STATE_FILE_NAME} (orcad's lock and sockets are orcad's)`);
        if (svc.getState().state !== 'ready') fails.push(`scenario B (${label}): start() after the reap ended in state '${svc.getState().state}'`);
        await svc.stop();
    }
    return fails;
}

/** C: the order of a stop, with one agent process that outlives the daemon's SIGTERM. */
async function scenarioC(paths, env) {
    const fails = [];
    const b = makeBoundary(baseWorld({ immortal: [5003] }));
    const svc = await loadService(paths, b, env);
    await svc.start();
    const before = b.calls.length;
    await svc.stopAndReap();
    const calls = b.calls.slice(before);
    const at = {
        kill: indexOfCall(calls, 'killProcess', (a) => a[0] === 5001),
        wait: indexOfCall(calls, 'waitForExit', (a) => a[0] === 5001),
        daemon: indexOfCall(calls, 'signalBarePid', (a) => a[0] === 5002 && a[1] === 15),
        leftover: indexOfCall(calls, 'signalBarePid', (a) => a[0] === 5003 && a[1] === 9),
    };
    if (at.kill < 0) fails.push('scenario C: stop did not end orcad through its process handle');
    else if (calls[at.kill].args[1] < 16000) fails.push(`scenario C: orcad was given a grace of ${calls[at.kill].args[1]} ms; its own stop deadline is 15 s, so the grace must be at least 16000`);
    if (at.wait < at.kill) fails.push('scenario C: stop did not wait for orcad to exit after signalling it');
    if (at.daemon < 0) fails.push('scenario C: stop never sent SIGTERM to the terminal daemon, so agents outlive the browser');
    else if (at.daemon < at.wait) fails.push('scenario C: the terminal daemon was signalled before orcad had exited');
    if (at.leftover < 0) fails.push('scenario C: a descendant that outlived the terminal daemon was not killed');
    else if (at.leftover < at.daemon) fails.push('scenario C: a descendant was killed before the terminal daemon was asked to stop');
    if (b.calls.some((c) => c.name === 'signalBarePid' && !(c.args[0] > 0))) fails.push('scenario C: a signal was sent to a non-positive pid (a process group)');
    if (!calls.some((c) => c.name === 'removeStateFile')) fails.push('scenario C: stop left the state file behind');
    if (!calls.some((c) => c.name === 'quitObserverOff')) fails.push('scenario C: stop did not detach the quit observer');
    return fails;
}

/** D: the pinned port is busy. One spawn, no retry, a row naming the code. */
async function scenarioD(paths, env) {
    const fails = [];
    const b = makeBoundary(baseWorld({
        orcad: () => fakeProc(5001, { stderr: [`PinnedPortUnavailableError: Port 26768 on 127.0.0.1 is unavailable (EADDRINUSE) { code: '${env.ORCAD_PINNED_PORT_CODE}' }\n`], exitCode: 1 }),
    }));
    const svc = await loadService(paths, b, env);
    await svc.start();
    const rows = JSON.stringify(svc.getDiagnosticRows());
    if (svc.getState().state !== 'failed') fails.push(`scenario D: a busy port left state '${svc.getState().state}', not failed`);
    if (orcadSpawns(b.calls).length !== 1) fails.push(`scenario D: a busy port led to ${orcadSpawns(b.calls).length} spawns; it is unrecoverable, so exactly one`);
    if (!rows.includes(env.ORCAD_PINNED_PORT_CODE) || !rows.includes('26768')) fails.push(`scenario D: no diagnostics row names ${env.ORCAD_PINNED_PORT_CODE} and the port`);
    await svc.stop();
    return fails;
}

/** E: orcad reports a bind that is not loopback on the configured port. */
async function scenarioE(paths, env) {
    const fails = [];
    const b = makeBoundary(baseWorld({ orcad: () => fakeProc(5001, { stdout: [readyLine(26768, { host: '0.0.0.0' })] }) }));
    const svc = await loadService(paths, b, env);
    await svc.start();
    if (svc.getState().state !== 'failed') fails.push(`scenario E: a non-loopback ready line left state '${svc.getState().state}', not failed`);
    if (indexOfCall(b.calls, 'killProcess', (a) => a[0] === 5001) < 0) fails.push('scenario E: an orcad bound off loopback was not ended');
    if (orcadSpawns(b.calls).length !== 1) fails.push('scenario E: a non-loopback bind was retried');
    await svc.stop();
    return fails;
}

/** F: the data-root alias for a profile path too long for orcad's socket. */
async function scenarioF(paths, env) {
    const fails = [];
    const profileDir = `/${'p'.repeat(99)}`;
    const dataRoot = `${profileDir}/${env.ORCAD_DATA_ROOT_NAME}`;
    const b = makeBoundary(baseWorld({ profileDir }));
    const svc = await loadService(paths, b, env);
    await svc.start();
    const ln = b.calls.find((c) => c.name === 'spawnProcessExact' && c.args[0].command.endsWith('/ln'))?.args[0];
    const orcad = orcadSpawns(b.calls)[0]?.args[0];
    if (!ln) {
        fails.push('scenario F: a 100-byte profile path spawned no ln, so orcad was given a data root too long for its socket path');
    } else {
        const [flags, target, alias] = ln.args;
        if (flags !== '-sfnT' || target !== dataRoot) fails.push(`scenario F: ln was run as ${JSON.stringify(ln.args)}, not -sfnT <data root> <alias>`);
        if (!String(alias).startsWith('/run/user/1000/pb-orca-') || !env.socketPathFits(alias)) fails.push(`scenario F: the alias ${alias} is not a short path under the runtime directory`);
        if (Object.keys(ln.environment).join() !== 'PATH') fails.push(`scenario F: ln was given the environment names ${Object.keys(ln.environment).join(', ')}, not the search path alone`);
        if (!orcad) fails.push(`scenario F: orcad was not spawned: ${JSON.stringify(svc.getDiagnosticRows())}`);
        else if (orcad.environment.ORCA_USER_DATA !== alias || orcad.environment.ORCA_USER_DATA_PATH !== alias) fails.push('scenario F: orcad was not given the alias as its data root (socket path too long)');
    }
    await svc.stop();

    const short = makeBoundary(baseWorld());
    const svc2 = await loadService(paths, short, env);
    await svc2.start();
    if (short.calls.some((c) => c.name === 'spawnProcessExact' && c.args[0].command.endsWith('/ln'))) fails.push('scenario F: a short profile path was aliased');
    await svc2.stop();
    return fails;
}

/** H: no bridge folder can be chosen (Phase 63, P63-35): orcad still reaches ready, nothing is written, the row says so. */
async function scenarioH(paths, env) {
    const fails = [];
    const b = makeBoundary(baseWorld({ env: { PATH: '/usr/bin', HOME: '/tmp/u', LANG: 'C.UTF-8' } }));
    const svc = await loadService(paths, b, env);
    await svc.start();
    const state = svc.getState();
    if (state.state !== 'ready') fails.push(`scenario H: null folder fatal -- with no bridge folder the state is '${state.state}', not ready: ${JSON.stringify(svc.getDiagnosticRows())}`);
    if (state.bridgeDir !== null) fails.push(`scenario H: getState().bridgeDir is ${state.bridgeDir} with no usable runtime directory or home, not null`);
    if (b.calls.some((c) => c.name === 'writePrivateFile')) fails.push('scenario H: writePrivateFile was called with no bridge folder');
    if (!svc.getDiagnosticRows().some(([label, value]) => label === 'Orca bridge folder' && value === 'not available')) fails.push('scenario H: the "Orca bridge folder" row does not read "not available"');
    await svc.stop();
    if (svc.getState().state !== 'stopped') fails.push(`scenario H: state after stop() is '${svc.getState().state}'`);
    return fails;
}

/** I: Theia has the Claude agent SDK extension disabled (Phase 68, P68-38): orcad gets the name with value "". */
async function scenarioI(paths, env) {
    const fails = [];
    const world = baseWorld();
    const settings = env.theiaBackendSettingsPath(world.profileDir);
    world.files = { ...world.files, [settings]: { 'installedPlugins.disabledPlugins': JSON.stringify([env.CLAUDE_AGENT_SDK_EXTENSION_ID]) } };
    const b = makeBoundary(world);
    const svc = await loadService(paths, b, env);
    await svc.start();
    const spawn = b.calls.find((c) => c.name === 'spawnProcessExact' && !c.args[0].command.endsWith('/ln'));
    if (!spawn) fails.push(`scenario I: orcad was not spawned: ${JSON.stringify(svc.getDiagnosticRows())}`);
    else if (spawn.args[0].environment[env.ORCAD_CLAUDE_AGENT_SDK_DIR_ENV] !== '') fails.push(`scenario I: SDK extension disabled in Theia, yet ${env.ORCAD_CLAUDE_AGENT_SDK_DIR_ENV} is ${JSON.stringify(spawn.args[0].environment[env.ORCAD_CLAUDE_AGENT_SDK_DIR_ENV])}, not ""`);
    if (indexOfCall(b.calls, 'readStateFile', (a) => a[0] === settings) < 0) fails.push(`scenario I: Theia's settings file ${settings} was never read`);
    await svc.stop();
    return fails;
}

/** The bridge-folder writes of one file name, with their call index. */
const writesOf = (calls, name) => calls.map((c, i) => ({ c, i })).filter(({ c }) => c.name === 'writePrivateFile' && c.args[1] === name);

/** One started service whose orcad offers `offer`, with the bundle folder present or not. */
async function handOffRun(paths, env, offer, bundlePresent) {
    const port = 26768;
    const line = `${JSON.stringify({ event: 'orca_server_ready', boundEndpoint: `ws://127.0.0.1:${port}`, health: { nodeVersion: 'v24.19.0', terminalDaemon: { pid: 5002 } }, pairing: { available: true, webClientUrl: offer } })}\n`;
    const panesDir = `/o/out/web/${env.ORCA_PANES_DIR_REL}`;
    const world = baseWorld({
        exists: ['/o/out/orcad/orcad.js', '/o/out/web', ...(bundlePresent ? [panesDir] : [])],
        orcad: () => fakeProc(5001, { stdout: [line.slice(0, 50), line.slice(50)] }),
    });
    const b = makeBoundary(world);
    const svc = await loadService(paths, b, env);
    await svc.start();
    const bridgeDir = await env.bridgeDirFor(`${world.profileDir}/${env.ORCAD_DATA_ROOT_NAME}`, (n) => world.env[n] ?? '', 'linux');
    return { b, svc, line, panesDir, bridgeDir };
}

/** J (hand-off files): the offer and the bundle folder reach the bridge folder after ready, and nowhere else. */
async function scenarioJ(paths, env) {
    const fails = [];
    // A form redact() has no pattern for, so only never logging the offer keeps it out of the log.
    const canary = `http://127.0.0.1:26768/PB64CANARY${process.pid}x${Date.now().toString(36)}`;
    const { b, svc, line, panesDir, bridgeDir } = await handOffRun(paths, env, canary, true);
    if (svc.getState().state !== 'ready') return [`scenario J: start() ended in state '${svc.getState().state}', not ready`];
    const readyAt = indexOfCall(b.calls, 'readyLineDelivered');
    const rootAt = writesOf(b.calls, env.ORCAD_DATA_ROOT_FILE)[0]?.i ?? -1;
    for (const [name, text] of [[env.ORCA_WEB_PAIRING_FILE, `${canary}\n`], [env.ORCA_PANES_DIR_FILE, `${panesDir}\n`]]) {
        const writes = writesOf(b.calls, name);
        if (writes.length !== 1) fails.push(`scenario J: ${name} was written ${writes.length} times through writePrivateFile, not once`);
        for (const { c, i } of writes) {
            if (readyAt < 0 || i < readyAt) fails.push(`scenario J: offer before ready -- ${name} was written at call ${i}, the ready line at ${readyAt}`);
            if (rootAt < 0 || i < rootAt) fails.push(`scenario J: ${name} was written before orcad-data-root (call ${i}, data root at ${rootAt})`);
            if (c.args[0] !== bridgeDir || c.args[2] !== text) fails.push(`scenario J: ${name} was written to ${c.args[0]} with other content than ${name === env.ORCA_WEB_PAIRING_FILE ? 'the offer' : 'the bundle folder'} and a newline`);
        }
    }
    if (!svc.getDiagnosticRows().some(([label, value]) => label === 'Orca tabs bundle' && value === panesDir)) fails.push('scenario J: the "Orca tabs bundle" row does not name the bundle folder');
    const token = canary.slice(canary.indexOf('PB64CANARY'));
    if (env.redact(canary) !== canary) fails.push('scenario J: redact() rewrites the canary, so the log search below proves nothing');
    const surfaces = {
        'offer in log': [svc.getRecentLog().join('\n'), b.consoleLines.join('\n')],
        'offer in state': [JSON.stringify(svc.getState())],
        'offer in diagnostics': [JSON.stringify(svc.getDiagnosticRows())],
        'offer in parseReadyLine': [JSON.stringify(env.parseReadyLine(line))],
    };
    for (const [what, texts] of Object.entries(surfaces)) {
        if (texts.some((t) => t.includes(token))) fails.push(`scenario J: ${what} -- the pairing canary reached it`);
    }
    const stopFrom = b.calls.length;
    await svc.stop();
    const stopCalls = b.calls.slice(stopFrom);
    const killAt = indexOfCall(stopCalls, 'killProcess');
    for (const name of [env.ORCAD_DATA_ROOT_FILE, env.ORCA_WEB_PAIRING_FILE, env.ORCA_PANES_DIR_FILE]) {
        const at = indexOfCall(stopCalls, 'removeStateFile', (a) => a[0] === env.bridgeFileFor(bridgeDir, name, 'linux'));
        if (at < 0) fails.push(`scenario J: not removed -- ${name} was left in the bridge folder after stop()`);
        else if (killAt < 0) fails.push('scenario J: stop() did not end orcad through its process handle, so the removal order cannot be judged');
        else if (at > killAt) fails.push(`scenario J: bridge files removed after orcad is signalled -- ${name} at stop call ${at}, orcad's kill at ${killAt}; a quit can end the process during the kill waits and leave it behind`);
    }
    return fails;
}

/** J-b: the bundle folder is not built: no orca-panes-dir file, the row says so, the offer is still written. */
async function scenarioJb(paths, env) {
    const fails = [];
    const { b, svc } = await handOffRun(paths, env, 'http://127.0.0.1:26768/#pairing=PB64IB', false);
    if (svc.getState().state !== 'ready') fails.push(`scenario J-b: a missing bundle folder left state '${svc.getState().state}', not ready`);
    if (writesOf(b.calls, env.ORCA_PANES_DIR_FILE).length) fails.push(`scenario J-b: bundle folder absent, yet ${env.ORCA_PANES_DIR_FILE} was written`);
    if (writesOf(b.calls, env.ORCA_WEB_PAIRING_FILE).length !== 1) fails.push(`scenario J-b: ${env.ORCA_WEB_PAIRING_FILE} was not written once without the bundle folder`);
    if (!svc.getDiagnosticRows().some(([label, value]) => label === 'Orca tabs bundle' && value === 'not built')) fails.push('scenario J-b: the "Orca tabs bundle" row does not read "not built"');
    await svc.stop();
    return fails;
}

const rowValue = (svc, label) => (svc.getDiagnosticRows().find(([l]) => l === label) ?? [])[1];

/** G (failure classes, Phase 67): one class per cause, and no pairing field on any surface. */
async function scenarioG(paths, env) {
    const fails = [];
    // The busy port of D.
    const busy = makeBoundary(baseWorld({
        orcad: () => fakeProc(5001, { stderr: [`PinnedPortUnavailableError: { code: '${env.ORCAD_PINNED_PORT_CODE}' }\n`], exitCode: 1 }),
    }));
    const svc1 = await loadService(paths, busy, env);
    await svc1.start();
    if (svc1.getState().failureClass !== 'port-in-use') fails.push(`scenario G: a busy port reads failureClass ${JSON.stringify(svc1.getState().failureClass)}, not port-in-use`);
    await svc1.stop();

    // Pairing unavailable at orcad start, with a sentinel field beside the reason.
    const sentinel = `PB67SENTINEL${process.pid}x${Date.now().toString(36)}`;
    const line = `${JSON.stringify({ event: 'orca_server_ready', boundEndpoint: 'ws://127.0.0.1:26768', health: { nodeVersion: 'v24.19.0', terminalDaemon: { pid: 5002 } }, pairing: { available: false, reason: 'device_registry_unavailable', guidance: sentinel, extra: sentinel } })}\n`;
    const unavailable = makeBoundary(baseWorld({ orcad: () => fakeProc(5001, { stdout: [line.slice(0, 30), line.slice(30)] }) }));
    const svc2 = await loadService(paths, unavailable, env);
    await svc2.start();
    if (svc2.getState().state !== 'ready') fails.push(`scenario G: an unavailable pairing offer left state '${svc2.getState().state}', not ready`);
    if (svc2.getState().failureClass !== 'pairing-lost') fails.push(`scenario G: an unavailable pairing offer reads failureClass ${JSON.stringify(svc2.getState().failureClass)}, not pairing-lost`);
    if (rowValue(svc2, 'Orca pairing failure') !== 'device_registry_unavailable') fails.push('scenario G: no "Orca pairing failure" row reads device_registry_unavailable');
    for (const [where, text] of [['getState', JSON.stringify(svc2.getState())], ['the log', `${svc2.getRecentLog().join('\n')}\n${unavailable.consoleLines.join('\n')}`], ['the diagnostics rows', JSON.stringify(svc2.getDiagnosticRows())]]) {
        if (text.includes(sentinel)) fails.push(`scenario G: a pairing field beside the reason reached ${where}`);
    }

    // From ready: the browser host could not attach (P67-36); an unknown reason is refused.
    if (svc2.reportClientFailure('not-a-reason') !== false) fails.push('scenario G: reportClientFailure accepted a reason outside ORCA_CLIENT_REASONS');
    if (svc2.getRecentLog().some((l) => l.includes('not-a-reason'))) fails.push('scenario G: the refused client reason was echoed into the log');
    await svc2.stop();
    const attach = makeBoundary(baseWorld());
    const svc3 = await loadService(paths, attach, env);
    await svc3.start();
    svc3.reportClientFailure(env.ORCA_BROWSER_HOST_REASON);
    if (svc3.getState().failureClass !== 'browser-not-attached') fails.push(`scenario G: a held browser-host reason reads failureClass ${JSON.stringify(svc3.getState().failureClass)}, not browser-not-attached`);
    if (rowValue(svc3, 'Orca browser host') !== env.ORCA_BROWSER_HOST_REASON) fails.push('scenario G: no "Orca browser host" row reads the browser-host reason');
    if (rowValue(svc3, 'Orca restart count') !== 0) fails.push('scenario G: no "Orca restart count" row');

    // An unexpected exit: the class while the supervisor starts orcad again. The second orcad never
    // reports ready, so the state is read at its spawn.
    let first = null;
    let seen = null;
    const world = baseWorld();
    const readyOrcad = world.orcad;
    world.orcad = (spec) => {
        if (!first) { first = readyOrcad(spec); return first; }
        seen = { state: svc4.getState().state, failureClass: svc4.getState().failureClass };
        return fakeProc(5011);
    };
    const exiting = makeBoundary(world);
    const svc4 = await loadService(paths, exiting, env);
    await svc4.start();
    await svc3.stop();
    first.exit(1);
    for (let i = 0; i < 200 && !seen; i++) await new Promise((r) => setTimeout(r, 2));
    if (!seen) fails.push('scenario G: orcad was not started again after an unexpected exit');
    else if (seen.state !== 'starting' || seen.failureClass !== 'restarting') fails.push(`scenario G: while the supervisor restarts orcad the state is ${seen.state} with failureClass ${JSON.stringify(seen.failureClass)}, not starting with restarting`);
    await svc4.stop();
    return fails;
}

/** K (restart, Phase 67 P67-06): restart() acts only in the failed state. */
async function scenarioK(paths, env) {
    const fails = [];
    const ready = makeBoundary(baseWorld());
    const svc1 = await loadService(paths, ready, env);
    await svc1.start();
    const before = orcadSpawns(ready.calls).length;
    if ((await svc1.restart()) !== false) fails.push('scenario K: restart outside failed -- restart() in ready answered true');
    await svc1._restartRun;
    if (orcadSpawns(ready.calls).length !== before) fails.push('scenario K: restart outside failed -- restart() in ready spawned orcad again');
    await svc1.stop();

    const slow = makeBoundary(baseWorld({ orcad: () => fakeProc(5001) }));
    const svc2 = await loadService(paths, slow, env);
    const started = svc2.start();
    for (let i = 0; i < 200 && !orcadSpawns(slow.calls).length; i++) await new Promise((r) => setTimeout(r, 2));
    if (svc2.getState().state !== 'starting') fails.push(`scenario K: the slow orcad left state '${svc2.getState().state}', not starting`);
    if ((await svc2.restart()) !== false) fails.push('scenario K: restart outside failed -- restart() in starting answered true');
    if (orcadSpawns(slow.calls).length !== 1) fails.push('scenario K: restart outside failed -- restart() in starting spawned orcad again');
    await svc2.stop();
    await started;

    const busy = makeBoundary(baseWorld({
        orcad: () => fakeProc(5001, { stderr: [`{ code: '${env.ORCAD_PINNED_PORT_CODE}' }\n`], exitCode: 1 }),
    }));
    const svc3 = await loadService(paths, busy, env);
    await svc3.start();
    if (svc3.getState().state !== 'failed') fails.push(`scenario K: the busy port left state '${svc3.getState().state}', not failed`);
    const accepted = await svc3.restart();
    await svc3._restartRun;
    if (accepted !== true) fails.push('scenario K: restart() in failed answered false');
    if (orcadSpawns(busy.calls).length !== 2) fails.push(`scenario K: restart() in failed led to ${orcadSpawns(busy.calls).length} spawns in all, not 2`);
    await svc3.stop();
    return fails;
}

/** L (RUN-09 refusal, Phase 67 P67-16, P67-17): nothing is spawned or reaped for a refused start. */
async function scenarioL(paths, env) {
    const fails = [];
    const tmpD = '/scratch/tmpd';
    const longProfile = `/${'q'.repeat(99)}`;
    const alias = await env.aliasPathFor(`${longProfile}/${env.ORCAD_DATA_ROOT_NAME}`, (n) => ({ XDG_RUNTIME_DIR: '/run/user/1000', HOME: '/home/u' })[n] ?? '');
    const base = { PATH: '/usr/bin', HOME: '/home/u', XDG_RUNTIME_DIR: '/run/user/1000', LANG: 'C.UTF-8' };
    const { name, value } = env.ORCA_PLAINTEXT_OVERRIDE;
    const cases = [
        { label: 'a profile under TmpD', world: { tmpD, profileDir: `${tmpD}/prof` }, cls: 'temporary-profile', row: 'Orca temporary folder' },
        { label: 'a profile under $TMPDIR', world: { tmpD, profileDir: '/data/t/prof', env: { ...base, TMPDIR: '/data/t/' } }, cls: 'temporary-profile', row: 'Orca temporary folder' },
        // The data root's own realpath call fails (returns its input); only the alias resolves into TmpD.
        { label: 'a long profile whose alias resolves under TmpD', world: { tmpD, profileDir: longProfile, realPaths: { [alias]: `${tmpD}/real` } }, cls: 'temporary-profile', row: 'Orca temporary folder', naming: 'alias not resolved' },
        { label: 'the plaintext override', world: { tmpD, env: { ...base, [name]: value } }, cls: 'plaintext-setting', row: 'Orca setting' },
        { label: 'another override value', world: { tmpD, env: { ...base, [name]: 'keyring' } }, cls: null },
    ];
    for (const c of cases) {
        const b = makeBoundary(baseWorld({ env: base, ...c.world }));
        const svc = await loadService(paths, b, env);
        await svc.start();
        const state = svc.getState();
        const spawns = orcadSpawns(b.calls).length;
        const tag = `scenario L (${c.label})`;
        if (c.cls === null) {
            if (state.state !== 'ready' || spawns !== 1) fails.push(`${tag}: orcad did not start (state ${state.state}, ${spawns} spawns): ${JSON.stringify(svc.getDiagnosticRows())}`);
            if (!svc.getRecentLog().some((l) => l.includes(name) && l.includes('ignores'))) fails.push(`${tag}: no log line says the other value is ignored`);
        } else {
            if (state.failureClass !== c.cls) fails.push(`${tag}: ${c.naming ? `${c.naming} -- ` : ''}failureClass is ${JSON.stringify(state.failureClass)}, not ${c.cls}`);
            if (spawns) fails.push(`${tag}: refusal after spawn -- orcad was spawned ${spawns} time(s)`);
            if (indexOfCall(b.calls, 'readStateFile', (a) => String(a[0]).endsWith(env.ORCAD_STATE_FILE_NAME)) >= 0) fails.push(`${tag}: refusal after spawn -- the reap record was read`);
            if (!rowValue(svc, c.row)) fails.push(`${tag}: no "${c.row}" diagnostics row`);
        }
        if (rowValue(svc, 'Orca credential key folder') !== '/home/u/.orca') fails.push(`${tag}: the "Orca credential key folder" row is not /home/u/.orca`);
        await svc.stop();
    }
    return fails;
}

/** Clause 12's static half: the orcaStatus reply is built by OrcaEnv.orcaStatusReply alone. */
function orcaStatusClauses(paths, env) {
    const fails = [];
    const api = read(paths.api);
    if (api === null) return [`${paths.api} is missing`];
    const at = api.indexOf('async function handleOrcaShellMessage(');
    const armAt = at < 0 ? -1 : api.indexOf('case "orcaStatus":', at);
    if (armAt < 0) return ['PowerBrowserAPI.sys.mjs has no orcaStatus arm in handleOrcaShellMessage'];
    const rest = api.slice(armAt + 1);
    const end = rest.search(/\n\s*(case "|default:)/);
    const arm = rest.slice(0, end < 0 ? undefined : end);
    if (!arm.includes('...OrcaEnv.orcaStatusReply(OrcaService.getState())')) fails.push('the orcaStatus arm does not spread OrcaEnv.orcaStatusReply(OrcaService.getState())');
    const bare = arm.replaceAll('OrcaEnv.orcaStatusReply(OrcaService.getState())', '');
    if (/getState\(\)/.test(bare)) fails.push('the orcaStatus arm spreads getState or reads a getState field beside orcaStatusReply');
    const full = { state: 'failed', failureClass: 'port-in-use', port: 26768, pid: 5001, daemonPid: 5002, boundEndpoint: 'ws://127.0.0.1:26768', nodeVersion: 'v24.19.0', restartCount: 1, dataRoot: '/p', effectiveRoot: '/p', bridgeDir: '/b', orcaVersion: '9.9.9' };
    const keys = Object.keys(env.orcaStatusReply(full)).sort().join();
    if (keys !== 'failureClass,state') fails.push(`orcaStatusReply's keys over a full state are ${keys}: reply carries more than the class`);
    return fails;
}

/** Clause 11's cross-lane comparisons. Returns { fails, notes, panes, vite } with 'compared' or a SKIP text each. */
function handOffClauses(paths, env) {
    const fails = [];
    const notes = [];
    // Interface C5 spells these three; the orca-panes backend and the pane build read the same ones.
    for (const [constant, want] of [['ORCA_WEB_PAIRING_FILE', 'web-pairing'], ['ORCA_PANES_DIR_FILE', 'orca-panes-dir'], ['ORCA_PANES_DIR_REL', 'assets/pb-panes']]) {
        if (env[constant] !== want) fails.push(`OrcaEnv.${constant} is ${JSON.stringify(env[constant])}, not '${want}' (interface C5)`);
    }
    let panes = 'SKIP (lane p64-02 not merged)';
    if (!existsSync(paths.orcaPanesDir)) {
        notes.push('SKIP of the orca-panes file-name comparison only -- lane p64-02 not merged (theia/extensions/orca-panes is absent)');
    } else {
        panes = 'compared';
        const protocol = read(paths.orcaPanesProtocol) ?? '';
        for (const [constant, theirs] of [['ORCA_WEB_PAIRING_FILE', 'WEB_PAIRING_FILE'], ['ORCA_PANES_DIR_FILE', 'PANES_DIR_FILE']]) {
            const m = new RegExp(`export const ${theirs}\\b[^=]*=\\s*['"\`]([^'"\`]+)['"\`]`).exec(protocol);
            if (!m) fails.push(`theia/extensions/orca-panes exists but src/common/orca-panes-protocol.ts has no ${theirs} literal, so OrcaEnv.${constant} cannot be compared`);
            else if (m[1] !== env[constant]) fails.push(`orca-panes-protocol.ts ${theirs} is '${m[1]}' but OrcaEnv.${constant} is '${env[constant]}': chrome writes a file the Theia backend never reads`);
        }
    }
    let vite = 'SKIP (lane p64-01 not merged)';
    const config = read(paths.panesViteConfig);
    if (config === null) {
        notes.push('SKIP of the bundle-folder comparison only -- lane p64-01 not merged (orca-overlay/files/vite.pb-panes.config.ts is absent)');
    } else {
        vite = 'compared';
        const outLine = /\boutDir\s*:([^\n]*)/.exec(config);
        const literal = outLine ? [...outLine[1].matchAll(/['"`]([^'"`]+)['"`]/g)].pop()?.[1] : undefined;
        if (!literal) fails.push('vite.pb-panes.config.ts has no outDir literal, so the bundle folder OrcaEnv names cannot be compared');
        else if (literal.replace(/^\.\//, '') !== `out/web/${env.ORCA_PANES_DIR_REL}`) fails.push(`vite.pb-panes.config.ts builds the bundle into '${literal}' but OrcaService looks in out/web/${env.ORCA_PANES_DIR_REL}`);
    }
    return { fails, notes, panes, vite };
}

// ---------------------------------------------------------------------------
// Static clauses.

function staticClauses(paths, env, notes) {
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
    // D-31: Orca's terminals run on Orca's own engine, so orcad's environment stays Phase 62's.
    for (const name of env.ORCAD_FIXED_ENV_NAMES) {
        if (/PTY/i.test(name)) fails.push(`OrcaEnv.ORCAD_FIXED_ENV_NAMES carries ${name}: a pty switch reached orcad's environment, which D-31 keeps as Phase 62 left it`);
    }
    if (/pty/i.test(String(env.buildOrcadEnv))) fails.push("OrcaEnv.buildOrcadEnv mentions a PTY endpoint: a pty switch reached orcad's environment, which D-31 keeps as Phase 62 left it");
    for (const name of env.ORCAD_ENV_ALLOWLIST) {
        if (STEERING.includes(name) || /^(ORCA|CLAUDE|NODE|ELECTRON)_/.test(name)) fails.push(`OrcaEnv.ORCAD_ENV_ALLOWLIST inherits ${name}, a steering variable`);
    }

    // 4. The port default.
    const m = prefs.match(/^pref\("powerbrowser\.orca\.port",\s*(-?\d+)\);$/m);
    if (!m) fails.push('powerbrowser-sidecar.js has no integer powerbrowser.orca.port default');
    else if (Number(m[1]) < env.PORT_MIN || Number(m[1]) > env.PORT_MAX) fails.push(`the powerbrowser.orca.port default ${m[1]} is outside 1024..32767 (above it is the ephemeral range)`);
    const portDefault = m ? Number(m[1]) : null;

    // 6. Wiring.
    const shell = read(paths.shellJs) ?? '';
    const startAt = shell.indexOf(THEIA_START);
    const statement = startAt < 0 ? '' : shell.slice(startAt + THEIA_START.length, shell.indexOf(';', startAt));
    if (startAt < 0) fails.push('powerbrowser.js no longer carries the Theia start statement byte for byte');
    else if (!/^\.finally\(\(\) => OrcaService\.start\(\)\.catch\(/.test(statement)) fails.push('powerbrowser.js does not chain .finally(() => OrcaService.start().catch(...)) on the Theia start statement, so orcad is not started at launch or its rejection is unhandled');
    const rowsAt = shell.indexOf('const rows = [');
    if (rowsAt < 0 || !shell.slice(rowsAt, shell.indexOf('];', rowsAt)).includes('...OrcaService.getDiagnosticRows()')) fails.push('powerbrowser.js does not spread OrcaService.getDiagnosticRows() into the diagnostics rows');

    // 7. No user-facing copy.
    const theia = read(paths.theiaService) ?? '';
    const tables = new Set([...theia.matchAll(/\bmessage:\s*([A-Z][A-Z0-9_]*)\.\w+/g)].map((x) => x[1]));
    const windowFns = new Set([...shell.matchAll(/\bwindow\.(powerbrowser\w+)\s*=/g)].map((x) => x[1]));
    if (!tables.size || !windowFns.size) fails.push('could not derive the user-message table name from TheiaService.sys.mjs or the window functions from powerbrowser.js; the no-user-copy clause would pass vacuously');
    for (const id of [...tables, ...windowFns]) {
        if (new RegExp(`\\b${id}\\b`).test(service)) fails.push(`OrcaService.sys.mjs names ${id}: user-facing copy (P62-13) waits for Phase 67`);
    }

    // 8. Egress.
    let hosts = null;
    try { hosts = JSON.parse(read(paths.allowlist)).hosts; } catch { /* reported below */ }
    if (!Array.isArray(hosts)) {
        fails.push(`${paths.allowlist} is not readable as an allowlist`);
    } else {
        const orcaHosts = hosts.filter((h) => typeof h.host === 'string' && h.host.endsWith('onorca.dev'));
        const row = orcaHosts.find((h) => h.host === '.onorca.dev');
        if (!row) fails.push('endpoint-allowlist.json has no .onorca.dev row');
        else if (row.disposition !== 'user-initiated') fails.push(`the .onorca.dev row has disposition ${row.disposition}, not user-initiated`);
        for (const h of orcaHosts) if (h !== row) fails.push(`endpoint-allowlist.json has a second Orca host row ${h.host}; .onorca.dev is the only one`);
    }

    // 9. Pinned source.
    if (!existsSync(join(paths.orcaDir, '.git'))) {
        notes.push('SKIP of the pinned-source clauses only -- orca/ is not fetched (bash scripts/fetch-orca.sh)');
    } else {
        const own = (read(join(paths.orcaDir, WS_PORT_REL)) ?? '').match(/^export const DEFAULT_WS_PORT = (\d+)\s*;?$/m);
        if (!own) fails.push(`orca/${WS_PORT_REL} has no DEFAULT_WS_PORT (the pinned source moved)`);
        else if (portDefault === Number(own[1])) fails.push(`the powerbrowser.orca.port default ${portDefault} is Orca's own default, which a running Orca desktop holds`);
        for (const [constant, code] of [['ORCAD_PINNED_PORT_CODE', env.ORCAD_PINNED_PORT_CODE], ['ORCAD_LOCK_HELD_CODE', env.ORCAD_LOCK_HELD_CODE]]) {
            let found = '';
            try { found = execFileSync('git', ['-C', paths.orcaDir, 'grep', '-l', '-F', '-e', String(code), '--', 'src/main'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { /* exit 1: no match */ }
            if (!found.trim()) fails.push(`OrcaEnv.${constant} '${code}' does not appear in the pinned source (orca/src/main)`);
        }
    }
    return fails;
}

/**
 * The POWERBROWSER_* keys a backend source reads from POWERBROWSER_ENV: a quoted key, a dotted key, or
 * an identifier bound to a quoted POWERBROWSER_* string in the same source.
 */
export function backendEnvKeys(source) {
    const consts = new Map([...source.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::\s*[^=]+)?=\s*['"`](POWERBROWSER_[A-Z0-9_]+)['"`]/g)].map((m) => [m[1], m[2]]));
    const keys = new Set();
    for (const m of source.matchAll(/POWERBROWSER_ENV\s*(?:\[\s*(?:['"`](POWERBROWSER_[A-Z0-9_]+)['"`]|([A-Za-z_$][\w$]*))\s*\]|\.(POWERBROWSER_[A-Z0-9_]+))/g)) {
        const key = m[1] ?? m[3] ?? consts.get(m[2]);
        if (key) keys.add(key);
    }
    return [...keys];
}

/** Clause 10. Returns { fails, comparison } where comparison is 'compared' or a SKIP text. */
function bridgeKeyClause(paths) {
    const fails = [];
    const theia = read(paths.theiaService) ?? '';
    const set = [...new Set([...theia.matchAll(/\b(POWERBROWSER_ORCA_[A-Z0-9_]+)\s*:/g)].map((m) => m[1]))];
    if (set.length !== 1) {
        return { fails: [`TheiaService.sys.mjs sets ${set.length ? set.join(', ') : 'no POWERBROWSER_ORCA_* key'}; it must set exactly one, POWERBROWSER_ORCA_BRIDGE_DIR, the bridge folder`], comparison: 'not derived' };
    }
    const key = set[0];
    for (const fn of ['bridgeDirFor', 'dataRootFor']) {
        if (!theia.includes(`OrcaEnv.${fn}(`)) fails.push(`TheiaService.sys.mjs does not compute ${key} through OrcaEnv.${fn}, so chrome and the Theia backend can get two folders`);
    }
    if (!existsSync(paths.orcaAgentsDir)) return { fails, comparison: 'SKIP (lane p63-03 not merged)' };
    const backend = read(paths.orcaAgentsBackend);
    if (backend === null) {
        fails.push(`theia/extensions/orca-agents exists but src/node/orca-agents-backend-module.ts is missing, so the ${key} the backend reads cannot be compared`);
    } else {
        const keysRead = backendEnvKeys(backend);
        if (!keysRead.includes(key)) fails.push(`orca-agents-backend-module.ts reads ${keysRead.length ? keysRead.join(', ') : 'no POWERBROWSER_* key'} from POWERBROWSER_ENV, not ${key}, the key TheiaService sets`);
    }
    return { fails, comparison: 'compared' };
}

/** Runs every clause and scenario over `paths`. Resolves { fails, scenarios, notes, bridgeKeyComparison }. */
export async function check(paths) {
    for (const key of ['orcaService', 'orcaEnv']) {
        if (!existsSync(paths[key])) return { fails: [`${paths[key]} is missing`], scenarios: [], notes: [] };
    }
    let env;
    try { env = await freshImport(paths.orcaEnv); } catch (err) { return { fails: [`OrcaEnv.sys.mjs does not import in Node: ${err.message}`], scenarios: [], notes: [] }; }
    const notes = [];
    const fails = staticClauses(paths, env, notes);
    const bridgeKey = bridgeKeyClause(paths);
    fails.push(...bridgeKey.fails);
    if (bridgeKey.comparison.startsWith('SKIP')) notes.push('SKIP of the POWERBROWSER_ORCA_BRIDGE_DIR comparison only -- lane p63-03 not merged (theia/extensions/orca-agents is absent)');
    const handOff = handOffClauses(paths, env);
    fails.push(...handOff.fails);
    notes.push(...handOff.notes);
    fails.push(...orcaStatusClauses(paths, env));
    const scenarios = { A: scenarioA, B: scenarioB, C: scenarioC, D: scenarioD, E: scenarioE, F: scenarioF, G: scenarioG, H: scenarioH, I: scenarioI, J: scenarioJ, 'J-b': scenarioJb, K: scenarioK, L: scenarioL };
    const saved = globalThis.ChromeUtils;
    try {
        for (const [label, run] of Object.entries(scenarios)) {
            try { fails.push(...(await run(paths, env))); } catch (err) { fails.push(`scenario ${label} threw: ${err.message}`); }
        }
    } finally {
        if (saved === undefined) delete globalThis.ChromeUtils; else globalThis.ChromeUtils = saved;
    }
    return { fails, scenarios: Object.keys(scenarios), notes, bridgeKeyComparison: bridgeKey.comparison, handOff };
}

// ---------------------------------------------------------------------------
// --self-test

async function runSelfTest() {
    const tmp = mkdtempSync(join(tmpdir(), `${NAME}-`));
    try {
        const paths = pathsFor(tmp);
        mkdirSync(join(tmp, 'powerbrowser'), { recursive: true });
        cpSync(join(REPO_ROOT, 'powerbrowser', 'shell'), paths.shellDir, { recursive: true });
        cpSync(join(REPO_ROOT, 'powerbrowser', 'endpoint-allowlist.json'), paths.allowlist);
        // A fixture Orca source tree with a synthetic default port, so green proves the port is derived.
        const fixtureCodes = join(paths.orcaDir, 'src', 'main', 'orcad', 'fixture-codes.ts');
        mkdirSync(dirname(join(paths.orcaDir, WS_PORT_REL)), { recursive: true });
        mkdirSync(dirname(fixtureCodes), { recursive: true });
        writeFileSync(join(paths.orcaDir, WS_PORT_REL), 'export const DEFAULT_WS_PORT = 7777\n');
        writeFileSync(fixtureCodes, "export const CODES = ['pinned_port_unavailable', 'orcad_instance_lock_held']\n");
        const git = (...a) => execFileSync('git', ['-C', paths.orcaDir, ...a], { stdio: ['ignore', 'pipe', 'pipe'] });
        // A fixture orca-agents backend, so the control compares the bridge folder key instead of skipping it.
        mkdirSync(dirname(paths.orcaAgentsBackend), { recursive: true });
        writeFileSync(paths.orcaAgentsBackend, "import { POWERBROWSER_ENV } from '@powerbrowser/token-gate/lib/node/powerbrowser-env';\nconst BRIDGE_DIR_KEY = 'POWERBROWSER_ORCA_BRIDGE_DIR';\nexport const bridgeDir = POWERBROWSER_ENV[BRIDGE_DIR_KEY] ?? '';\n");
        // Fixture orca-panes protocol and pane build config, so the control compares clause 11 instead of skipping it.
        mkdirSync(dirname(paths.orcaPanesProtocol), { recursive: true });
        writeFileSync(paths.orcaPanesProtocol, "export const WEB_PAIRING_FILE = 'web-pairing';\nexport const PANES_DIR_FILE = 'orca-panes-dir';\n");
        mkdirSync(dirname(paths.panesViteConfig), { recursive: true });
        writeFileSync(paths.panesViteConfig, "export default { build: { outDir: resolve(process.env.PB_PANES_OUT || 'out/web/assets/pb-panes') } };\n");
        git('init', '-q');
        git('add', '.');
        git('-c', 'user.name=fixture', '-c', 'user.email=fixture@invalid', 'commit', '-q', '-m', 'fixture');

        const control = await check(paths);
        if (control.fails.length || control.notes.length) {
            console.error(`${NAME} self-test: FAIL -- the unmodified copies are not green: ${[...control.fails, ...control.notes].join(' | ')}`);
            return 1;
        }
        console.log(`${NAME} self-test: control green on copies (scenarios ${control.scenarios.join(', ')}, fixture Orca default port 7777)`);

        const swap = (a, b) => (text) => { if (!text.includes(a)) throw new Error(`plant target not found: ${a.slice(0, 60)}`); return text.replace(a, b); };
        const then = (...fns) => (text) => fns.reduce((t, fn) => fn(t), text);
        const hosts = (fn) => (text) => { const j = JSON.parse(text); j.hosts = fn(j.hosts); return JSON.stringify(j, null, 2); };
        const orcaRow = (h) => h.host === '.onorca.dev';
        const OBSERVER = 'this._quitObserverOff = PowerBrowserAPI.onQuitGranted(() => this.stop());';
        const plants = [
            { name: 'jar.mn line removed', naming: 'jar.mn', file: paths.jarMn, edit: (t) => swap('   content/powerbrowser/OrcaService.sys.mjs     (OrcaService.sys.mjs)\n', '')(t) },
            { name: 'port guard removed', naming: 'port 0', file: paths.orcaEnv, edit: swap('port < PORT_MIN || ', '') },
            { name: 'bind host 0.0.0.0', naming: 'loopback', file: paths.orcaEnv, edit: swap('ORCAD_BIND_HOST = "127.0.0.1"', 'ORCAD_BIND_HOST = "0.0.0.0"') },
            { name: 'port default 40000', naming: '1024..32767', file: paths.prefs, edit: swap('pref("powerbrowser.orca.port", 26768);', 'pref("powerbrowser.orca.port", 40000);') },
            { name: 'port default 7777 (the fixture Orca default)', naming: "Orca's own default", file: paths.prefs, edit: swap('pref("powerbrowser.orca.port", 26768);', 'pref("powerbrowser.orca.port", 7777);') },
            { name: '.onorca.dev row removed', naming: 'no .onorca.dev row', file: paths.allowlist, edit: hosts((h) => h.filter((x) => !orcaRow(x))) },
            { name: '.onorca.dev disposition allow', naming: 'not user-initiated', file: paths.allowlist, edit: hosts((h) => h.map((x) => (orcaRow(x) ? { ...x, disposition: 'allow' } : x))) },
            { name: 'extra api.onorca.dev row', naming: 'api.onorca.dev', file: paths.allowlist, edit: hosts((h) => [...h, { host: 'api.onorca.dev', disposition: 'user-initiated', reason: 'plant' }]) },
            { name: 'socket budget 200', naming: 'socket path', file: paths.orcaEnv, edit: swap('ORCAD_SOCKET_ROOT_BUDGET = 84', 'ORCAD_SOCKET_ROOT_BUDGET = 200') },
            { name: 'sink logs stdout', naming: 'pairing', file: paths.orcaEnv, edit: swap('      buffer += String(chunk);\n', '      buffer += String(chunk);\n      pushLog(String(chunk));\n') },
            { name: 'user-message table in OrcaService', naming: 'user-facing copy (P62-13)', file: paths.orcaService, edit: (t) => `${t}\nconst USER_MESSAGE = { orcaFailed: "PowerBrowser couldn't start Orca. Choose Retry." };\n` },
            { name: 'start statement loses its .catch(', naming: 'powerbrowser.js', file: paths.shellJs, edit: swap('.finally(() => OrcaService.start().catch(err => OrcaService.reportUnexpectedFailure(err)))', '.finally(() => OrcaService.start())') },
            { name: 'quit observer registered after the spawn', naming: 'quit observer', file: paths.orcaService, edit: then(swap(OBSERVER, 'void 0;'), swap('    this._proc = proc;\n', `    this._proc = proc;\n    ${OBSERVER}\n`)) },
            { name: 'reap signals on a ticks mismatch', naming: 'recycled pid', file: paths.orcaService, edit: swap('observed === null || String(observed) !== String(ticks)', 'false') },
            { name: 'stop skips the daemon', naming: 'terminal daemon', file: paths.orcaService, edit: swap('    await this._endDaemon(this._daemonPid, this._daemonTicks, tree.filter(row => row.pid !== orcadPid));\n', '') },
            { name: 'environment name literal in OrcaService', naming: 'outside OrcaEnv', file: paths.orcaService, edit: (t) => `${t}\nconst HOME_NAME = "HOME";\n` },
            { name: 'NODE_OPTIONS in the allowlist', naming: 'steering variable', file: paths.orcaEnv, edit: swap('  "PATH",\n  "HOME",', '  "PATH",\n  "NODE_OPTIONS",\n  "HOME",') },
            { name: 'switch removed from the fixed names', naming: 'ORCA_DISABLE_INSTALLED_ELECTRON_BROWSER', file: paths.orcaEnv, edit: swap('  ORCAD_HIDDEN_ELECTRON_SWITCH,\n  ORCAD_CLAUDE_AGENT_SDK_DIR_ENV,\n]);', '  ORCAD_CLAUDE_AGENT_SDK_DIR_ENV,\n]);') },
            { name: 'orcad-data-root written before ready', naming: 'before ready', file: paths.orcaService, edit: swap('    let proc;\n', '    await PowerBrowserProcesses.writePrivateFile(this._bridgeDir, OrcaEnv.ORCAD_DATA_ROOT_FILE, `${this._effectiveRoot}\\n`);\n    let proc;\n') },
            { name: 'orcad-data-root not removed on stop', naming: 'not removed', file: paths.orcaService, edit: swap('[OrcaEnv.ORCAD_DATA_ROOT_FILE, OrcaEnv.ORCA_WEB_PAIRING_FILE', '[OrcaEnv.ORCA_WEB_PAIRING_FILE') },
            { name: 'bridge files removed after orcad is signalled', naming: 'orcad-data-root at stop call', file: paths.orcaService, edit: then(swap('[OrcaEnv.ORCAD_DATA_ROOT_FILE, OrcaEnv.ORCA_WEB_PAIRING_FILE', '[OrcaEnv.ORCA_WEB_PAIRING_FILE'), swap('    this._state = "stopped";\n    this._pid = null;', '    if (this._bridgeDir) {\n      try {\n        await PowerBrowserAPI.removeStateFile(OrcaEnv.bridgeFileFor(this._bridgeDir, OrcaEnv.ORCAD_DATA_ROOT_FILE, this._bridgePlatform));\n      } catch {\n        // Best-effort.\n      }\n    }\n    this._state = "stopped";\n    this._pid = null;')) },
            { name: 'a null bridge folder fails the start', naming: 'null folder fatal', file: paths.orcaService, edit: swap('    if (!this._bridgeDir) {\n', '    if (!this._bridgeDir) {\n      return this._fail("choosing the Orca bridge folder", []);\n') },
            { name: 'a PTY switch back in the fixed names', naming: 'pty switch', file: paths.orcaEnv, edit: swap('  ORCAD_CLAUDE_AGENT_SDK_DIR_ENV,\n]);', '  ORCAD_CLAUDE_AGENT_SDK_DIR_ENV,\n  "ORCA_EXTERNAL_PTY_ENDPOINT",\n]);') },
            { name: 'a ptyEndpoint option back in buildOrcadEnv', naming: 'pty switch', file: paths.orcaEnv, edit: swap('export function buildOrcadEnv(getEnv, { dataRoot, orcaVersion, claudeAgentSdkDir } = {}) {', 'export function buildOrcadEnv(getEnv, { dataRoot, orcaVersion, claudeAgentSdkDir, ptyEndpoint } = {}) {') },
            { name: 'orca-agents backend reads a different key', naming: 'POWERBROWSER_ORCA_BRIDGE_DIR', file: paths.orcaAgentsBackend, edit: swap("'POWERBROWSER_ORCA_BRIDGE_DIR'", "'POWERBROWSER_ORCA_BRIDGE_FOLDER'") },
            { name: 'orca-agents backend module deleted while the extension exists (red, not SKIP)', naming: 'orca-agents-backend-module.ts is missing', file: paths.orcaAgentsBackend, edit: () => null },
            { name: 'TheiaService builds the folder without bridgeDirFor', naming: 'OrcaEnv.bridgeDirFor', file: paths.theiaService, edit: swap('return await OrcaEnv.bridgeDirFor(dataRoot, name => PowerBrowserAPI.getEnv(name), OrcaEnv.nodePlatform(PowerBrowserProcesses.platform()));', 'return `${PowerBrowserAPI.getEnv("HOME")}/.cache/pb-orca-bridge`;') },
            { name: 'offer copied to pushLog', naming: 'offer in log', file: paths.orcaService, edit: swap('  async _writeHandOff(offer) {\n', '  async _writeHandOff(offer) {\n    this._pushLog(`offer ${offer}`);\n') },
            { name: 'offer written before ready', naming: 'offer before ready', file: paths.orcaService, edit: swap('    let proc;\n', '    await PowerBrowserProcesses.writePrivateFile(this._bridgeDir, OrcaEnv.ORCA_WEB_PAIRING_FILE, "stale\\n");\n    let proc;\n') },
            { name: 'offer placed in getState', naming: 'offer in state', file: paths.orcaService, edit: then(swap('        offer = value;\n', '        offer = value;\n        this._lastOffer = value;\n'), swap('      bridgeDir: this._bridgeDir,\n', '      bridgeDir: this._bridgeDir,\n      lastOffer: this._lastOffer,\n')) },
            { name: 'orca-panes-dir written with the bundle folder absent', naming: 'bundle folder absent', file: paths.orcaService, edit: swap('    if (!(await PowerBrowserAPI.pathExists(panesDir))) {', '    if (false) {') },
            { name: 'hand-off files not removed on stop', naming: 'not removed', file: paths.orcaService, edit: swap('[OrcaEnv.ORCAD_DATA_ROOT_FILE, OrcaEnv.ORCA_WEB_PAIRING_FILE, OrcaEnv.ORCA_PANES_DIR_FILE] : []', '[] : []') },
            { name: 'orca-panes protocol spells another pairing file', naming: 'chrome writes a file the Theia backend never reads', file: paths.orcaPanesProtocol, edit: swap("WEB_PAIRING_FILE = 'web-pairing'", "WEB_PAIRING_FILE = 'pairing-offer'") },
            { name: 'pane build writes another folder', naming: 'OrcaService looks in', file: paths.panesViteConfig, edit: swap("'out/web/assets/pb-panes'", "'out/web/pb-panes'") },
            { name: 'orcaStatusReply returns a third key', naming: 'reply carries more than the class', file: paths.orcaEnv, edit: swap('  return { state: state.state, failureClass: state.failureClass };', '  return { state: state.state, failureClass: state.failureClass, port: state.port };') },
            { name: 'the orcaStatus arm spreads getState() itself', naming: 'spreads getState', file: paths.api, edit: swap('...OrcaEnv.orcaStatusReply(OrcaService.getState()) };', '...OrcaEnv.orcaStatusReply(OrcaService.getState()), ...OrcaService.getState() };') },
            { name: 'restart() acts in ready', naming: 'restart outside failed', file: paths.orcaService, edit: swap('    if (this._state !== "failed" || this._shuttingDown) {', '    if (this._shuttingDown) {') },
            { name: 'the preflight moved after the spawn', naming: 'refusal after spawn', file: paths.orcaService, edit: then(swap('    if (!(await this._preflight())) {\n      return;\n    }\n    await this._reapLeftover({ includeDaemon: true });\n    await this._launch();\n', '    await this._reapLeftover({ includeDaemon: true });\n    await this._launch();\n    await this._preflight();\n')) },
            { name: "the effective root's realPath skipped", naming: 'alias not resolved', file: paths.orcaService, edit: swap('[this._dataRoot, this._effectiveRoot].flatMap(path => [path, real(path)])', '[this._dataRoot, real(this._dataRoot), this._effectiveRoot]') },
            { name: 'lock code absent from the fixture source', naming: 'pinned source', file: fixtureCodes, edit: swap('orcad_instance_lock_held', 'orcad_lock_renamed') },
        ];

        let failures = 0;
        for (const p of plants) {
            const original = readFileSync(p.file, 'utf8');
            try {
                const edited = p.edit(original);
                if (edited === null) rmSync(p.file); else writeFileSync(p.file, edited);
                const r = await check(paths);
                const text = r.fails.join('\n');
                if (!r.fails.length) { console.error(`  FAIL ${p.name} -> stayed green`); failures++; }
                else if (!text.includes(p.naming)) { console.error(`  FAIL ${p.name} -> red, but not naming '${p.naming}': ${text}`); failures++; }
                else console.log(`  ok ${p.name} -> red, naming '${p.naming}'`);
            } catch (err) {
                console.error(`  FAIL ${p.name} -> ${err.message}`); failures++;
            } finally {
                writeFileSync(p.file, original);
            }
            const after = await check(paths);
            if (after.fails.length) { console.error(`${NAME} self-test: FAIL -- plant '${p.name}' did not clean up: ${after.fails.join(' | ')}`); return 1; }
        }
        if (failures) {
            console.error(`${NAME} self-test: FAIL -- ${failures} of ${plants.length} plant(s) did not go red naming the drift`);
            return 1;
        }
        console.log(`${NAME} self-test: PASS -- ${plants.length} planted faults each went red naming the drift`);
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
    const r = await check(pathsFor(REPO_ROOT));
    for (const n of r.notes) console.log(`${NAME}: ${n}`);
    if (r.fails.length) {
        for (const f of r.fails) console.error(`${NAME}: FAIL -- ${f}`);
        process.exit(1);
    }
    console.log(`${NAME}: PASS -- jar.mn ships every shell module; OrcaService spawns only through the exact-environment boundary, spells no environment name and carries no user-facing copy; launch wiring and the .onorca.dev row hold; POWERBROWSER_ORCA_BRIDGE_DIR comparison ${r.bridgeKeyComparison}; stub-boundary scenarios ${r.scenarios.map((s) => ({ J: 'J (hand-off files)', 'J-b': 'J-b (no bundle folder)', G: 'G (failure classes)', K: 'K (restart)', L: 'L (RUN-09 refusal)' }[s] ?? s)).join(', ')} (start with orcad-data-root after ready, reap, stop order, busy port, non-loopback, alias, failure classes, no bridge folder, SDK extension disabled, offer and bundle folder after ready, restart only when failed, temp folder and plaintext override refused before any spawn); the orcaStatus reply is the state and the class only; orca-panes file names ${r.handOff.panes}; bundle folder ${r.handOff.vite}`);
    process.exit(0);
}
