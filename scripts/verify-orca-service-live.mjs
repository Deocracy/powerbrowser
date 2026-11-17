#!/usr/bin/env node
// scripts/verify-orca-service-live.mjs
//
// RUN-03 and RUN-05 on the running product (Phase 62, plan 62-02; ROADMAP
// Phase 62 criteria 1 and 3): a launched PowerBrowser starts its own orcad
// with an exact environment, a quit ends orcad and every agent under it, and
// a killed PowerBrowser's leftovers are reaped by the next launch.
//
// Three launches of one profile, headless:
//
//  Launch 1, environment and quit.
//   - OrcaService.getState() reaches ready (read in chrome). orcad's pid is
//     cross-checked with the pid in orcad's own lock file in the data root.
//   - Environment by set equality (P62-04). The names in /proc/<orcad>/environ
//     must equal OrcaEnv.expectedEnvNames(names in /proc/<PowerBrowser>/environ),
//     both ways. The instrument is proven first: this script plants
//     ORCA_PLANT_62 in its own environment before the launch and requires it
//     in PowerBrowser's environment, so "absent from orcad" is not vacuous.
//     Values: both data-root names equal, resolving to <profile>/powerbrowser-orca
//     through the short alias (the profile path is made long on purpose),
//     telemetry off, the hidden-Electron switch 1, ORCA_VERSION equal to the
//     pin, HOME equal to PowerBrowser's, and (Phase 68, P68-38) ORCA_CLAUDE_AGENT_SDK_DIR
//     equal to OrcaEnv.claudeAgentSdkDir over the profile folder and that
//     profile's Theia backend-settings.json, read at check time.
//   - Endpoint: getState().boundEndpoint is ws://127.0.0.1:<the pref port>, and
//     every listening TCP socket orcad owns (/proc/<pid>/net/tcp and tcp6
//     joined with the socket inodes under /proc/<pid>/fd) is on loopback.
//   - Node (D-14): realpath(/proc/<orcad>/exe) equals the Theia backend's, and
//     the reported version equals powerbrowser/packaging/node-runtime.json.
//   - Recorded, not asserted: whether orcad shares PowerBrowser's process
//     group (research assumption A2) and, after 20 s idle, the established
//     non-loopback TCP peers of the orcad tree (P62-15).
//   - Quit (P62-18): a real terminal session is created through orcad's own
//     CLI (sleep 900 in a scratch repository), because an idle terminal daemon
//     retires by itself and would make the check vacuous. orcad, the daemon
//     and every descendant are recorded with their start ticks; a sleep 900
//     under the daemon is required. app.quit() must return 'exited', and
//     within 25 s none of the recorded identities may be alive.
//
//  Launch 2 and 3, reap (P62-08).
//   - Launch 2 reaches ready; PowerBrowser is then SIGKILLed. After 2 s the
//     orcad identity must still be alive (else "vacuous: nothing to reap").
//   - Launch 3, same profile: ready within 90 s, the old orcad and daemon
//     identities gone, the same port, and a new pid in orcad's lock.
//
// Signals: this script signals only identities it recorded (pid plus start
// ticks), never by name or group; a real Orca desktop on the host is never
// touched. The Orca CLI gets an environment built from scratch, never this
// shell's ORCA_* variables. Output passes through redaction, and orcad's
// stdout never reaches this script at all.
//
// Run under the live lock, headless only:
//   flock /home/chris/coding/Power-Browser/.git/pb-live.lock node scripts/verify-orca-service-live.mjs
// The script sets MOZ_PURGE_CACHES=1 itself, so edited chrome JS is what runs.
//
// SKIP (one named line, exit 0): no built PowerBrowser (objdir/dist/bin/powerbrowser
// or PB_FIREFOX_BIN) or no built orca/ (orca/out/orcad/orcad.js).
//
// Tier: full. --self-test is quick and pure: the verdict functions over fixtures.
//
// Usage:
//   node scripts/verify-orca-service-live.mjs
//   node scripts/verify-orca-service-live.mjs --self-test

import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as OrcaEnv from '../powerbrowser/shell/OrcaEnv.sys.mjs';
import { descendants, ensurePbNode, installOutputRedaction, orcaVersionFromPins } from './lib/orca-run.mjs';
import { freePort, ppidMap, signalIdentity, startTicks } from './verify-orca-hidden-electron.mjs';
import { liveEnv, stopStrays } from './lib/firefox-bidi.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'orca-service-live';
const SELF_REL = 'scripts/verify-orca-service-live.mjs';
const PLANT = 'ORCA_PLANT_62';
const WORK_REL = '.mozbuild/orca-service-live';
const SERVICE_URL = 'chrome://powerbrowser/content/OrcaService.sys.mjs';
const THEIA_URL = 'chrome://powerbrowser/content/TheiaService.sys.mjs';
const FASTER_NEXT = 'Next step: MOZCONFIG=../.mozconfig ./mach build faster in upstream/ inside nix develop .#firefox';
const AGENT_ARGV = ['sleep', '900'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const read = (path) => { try { return readFileSync(path, 'utf8'); } catch { return null; } };

// --- pure verdicts (the self-test's subject) ---------------------------------

/**
 * The environment verdict. pb and orcad are { name: value } from /proc/<pid>/environ; real holds the
 * two resolved data-root paths; aliasPrefixes the allowed alias path prefixes. Returns red reasons.
 */
export function envVerdict({ pb, orcad, real, aliasPrefixes, orcaVersion, sdkDir }) {
    if (!(PLANT in pb)) {
        return [`instrument blind: the planted ${PLANT} is not in PowerBrowser's own environment, so its absence from orcad's would prove nothing`];
    }
    const fails = [];
    const diff = OrcaEnv.compareEnvNames(Object.keys(orcad), OrcaEnv.expectedEnvNames(Object.keys(pb)));
    for (const name of diff.extra) {
        fails.push(`orcad's environment carries ${name}, ${name in pb ? 'inherited from PowerBrowser' : 'which PowerBrowser does not even have'}; it is neither a fixed name nor on the allowlist`);
    }
    for (const name of diff.missing) fails.push(`orcad's environment lacks ${name}`);
    const root = orcad.ORCA_USER_DATA;
    if (root !== orcad.ORCA_USER_DATA_PATH) fails.push('ORCA_USER_DATA and ORCA_USER_DATA_PATH differ, so orcad and its CLI would use two data roots');
    if (real.orcadDataRoot === null || real.orcadDataRoot !== real.profileDataRoot) fails.push(`orcad's data root resolves to ${real.orcadDataRoot}, not the profile's ${real.profileDataRoot}`);
    if (typeof root === 'string' && !aliasPrefixes.some((p) => root.startsWith(p))) fails.push(`orcad's data root ${root} is not a short alias under ${aliasPrefixes.join(' or ')} although the profile path is too long for its socket`);
    for (const name of ['ORCA_TELEMETRY_DISABLED', 'DO_NOT_TRACK', OrcaEnv.ORCAD_HIDDEN_ELECTRON_SWITCH]) {
        if (name in orcad && orcad[name] !== '1') fails.push(`${name} is not 1 in orcad's environment`);
    }
    if ('ORCA_VERSION' in orcad && orcad.ORCA_VERSION !== orcaVersion) fails.push(`ORCA_VERSION is ${orcad.ORCA_VERSION} in orcad's environment, not the pinned ${orcaVersion}`);
    if (orcad.HOME !== pb.HOME) fails.push("HOME in orcad's environment is not PowerBrowser's HOME; agents need the user's own home");
    const sdkName = OrcaEnv.ORCAD_CLAUDE_AGENT_SDK_DIR_ENV;
    if (orcad[sdkName] !== sdkDir) fails.push(`${sdkName} is ${JSON.stringify(orcad[sdkName])} in orcad's environment, not ${JSON.stringify(sdkDir)} (OrcaEnv.claudeAgentSdkDir over the profile's Theia settings)`);
    return fails;
}

/**
 * The quit verdict. before: [{ pid, ticks, what, agent }] recorded while PowerBrowser ran; now: Map of
 * pid to current start ticks for the pids still alive. Returns red reasons.
 */
export function survivors(before, now) {
    if (!before.length) return ['vacuous: no orcad process was recorded before the quit'];
    if (!before.some((p) => p.agent)) return [`vacuous: no agent session (no ${AGENT_ARGV.join(' ')} under the terminal daemon), so an idle daemon retiring by itself would pass`];
    return before.filter((p) => now.get(p.pid) === p.ticks).map((p) => `${p.what} pid ${p.pid} survived the quit`);
}

/** The reap verdict after a SIGKILL of PowerBrowser and a relaunch on the same profile. */
export function reapVerdict({ survivedKill, oldOrcad, oldDaemon, now, state, prefPort, newLockPid }) {
    if (!survivedKill) return ['vacuous: nothing to reap (orcad did not outlive the SIGKILL of PowerBrowser)'];
    const fails = [];
    if (now.get(oldOrcad.pid) === oldOrcad.ticks) fails.push(`the old orcad pid ${oldOrcad.pid} is still alive after the relaunch`);
    if (oldDaemon.pid && now.get(oldDaemon.pid) === oldDaemon.ticks) fails.push(`the old terminal daemon pid ${oldDaemon.pid} is still alive after the relaunch`);
    if (state.state !== 'ready') fails.push(`orcad is '${state.state}' after the relaunch, not ready`);
    if (state.port !== prefPort || !String(state.boundEndpoint).endsWith(`:${prefPort}`)) fails.push(`the port changed across the relaunch: pref ${prefPort}, state ${state.port}, bound ${state.boundEndpoint}`);
    if (!Number.isInteger(newLockPid) || newLockPid === oldOrcad.pid) fails.push(`orcad's lock names pid ${newLockPid} after the relaunch; a new orcad must own the data root`);
    return fails;
}

const LOOPBACK_HEX = new Set(['0100007F', '00000000000000000000000001000000', '0000000000000000FFFF00000100007F']);
/** Rows of /proc/<pid>/net/tcp{,6} in `state` (hex) whose socket inode is in `inodes`: [{ local, remote, localLoopback, remoteLoopback }]. */
export function tcpRows(text, inodes, state) {
    const rows = [];
    for (const line of String(text).split('\n').slice(1)) {
        const f = line.trim().split(/\s+/);
        if (f.length < 10 || f[3] !== state || !inodes.has(f[9])) continue;
        const [la, ra] = [f[1], f[2]].map((a) => a.slice(0, a.lastIndexOf(':')).toUpperCase());
        rows.push({ local: f[1], remote: f[2], localLoopback: LOOPBACK_HEX.has(la), remoteLoopback: LOOPBACK_HEX.has(ra) });
    }
    return rows;
}

// --- /proc reads -------------------------------------------------------------

function environOf(pid) {
    const env = {};
    for (const entry of readFileSync(`/proc/${pid}/environ`, 'utf8').split('\0')) {
        const eq = entry.indexOf('=');
        if (eq > 0) env[entry.slice(0, eq)] = entry.slice(eq + 1);
    }
    return env;
}
function socketInodes(pid) {
    const out = new Set();
    try {
        for (const fd of readdirSync(`/proc/${pid}/fd`)) {
            try { const m = /^socket:\[(\d+)\]$/.exec(readlinkSync(`/proc/${pid}/fd/${fd}`)); if (m) out.add(m[1]); } catch { /* closed */ }
        }
    } catch { /* exited */ }
    return out;
}
const tcpOf = (pid, state, inodes = socketInodes(pid)) => ['tcp', 'tcp6'].flatMap((f) => tcpRows(read(`/proc/${pid}/net/${f}`) ?? '', inodes, state));
const argvOf = (pid) => (read(`/proc/${pid}/cmdline`) ?? '').split('\0').filter(Boolean);
const pgrpOf = (pid) => { const s = read(`/proc/${pid}/stat`); return s ? s.slice(s.lastIndexOf(')') + 2).split(' ')[2] : null; };
const realOrNull = (p) => { try { return realpathSync(p); } catch { return null; } };
const nowTicks = (pids) => new Map(pids.map((pid) => [pid, startTicks(pid)]).filter(([, t]) => t !== null));

// --- live run ----------------------------------------------------------------

async function chromeJson(app, expr) {
    const text = await app.evaluateIn(app.chrome, `(() => { try { return JSON.stringify(${expr}); } catch (e) { return JSON.stringify({ chromeError: String(e) }); } })()`);
    return JSON.parse(text);
}
const orcaState = (app) => chromeJson(app, `ChromeUtils.importESModule(${JSON.stringify(SERVICE_URL)}).OrcaService.getState()`);

async function waitReady(app, pollFor, what) {
    let last = null;
    try {
        return await pollFor(async () => {
            last = await orcaState(app);
            if (last.chromeError) throw new Error(`chrome could not load OrcaService.sys.mjs (${last.chromeError}). ${FASTER_NEXT}`);
            if (last.state === 'failed') throw Object.assign(new Error('failed'), { failed: true });
            return last.state === 'ready' ? last : null;
        }, 90000, `${what}: OrcaService to reach ready`);
    } catch (e) {
        if (last?.state === 'failed') {
            const rows = await chromeJson(app, `ChromeUtils.importESModule(${JSON.stringify(SERVICE_URL)}).OrcaService.getDiagnosticRows()`);
            throw new Error(`${what}: OrcaService failed to start orcad: ${JSON.stringify(rows)}`);
        }
        throw e;
    }
}

async function live() {
    const { FIREFOX_BIN, launchedBrowserPids } = await import('./lib/firefox-bidi.mjs');
    const orcaDir = join(REPO_ROOT, 'orca');
    if (!existsSync(FIREFOX_BIN)) { console.log(`${NAME}: SKIP -- no built PowerBrowser (${FIREFOX_BIN} missing; see docs/BUILD.md "Firefox half")`); return 0; }
    if (!existsSync(join(orcaDir, 'out', 'orcad', 'orcad.js'))) { console.log(`${NAME}: SKIP -- no built orca/ (orca/out/orcad/orcad.js missing; run: nix develop .#orca --command bash scripts/build-orca.sh)`); return 0; }
    if (process.env.PB_LIVE_HEADED === '1' || process.env.PB_REAL_INPUT === '1') {
        console.error(`${NAME}: FAIL -- this row runs headless only; unset PB_LIVE_HEADED and PB_REAL_INPUT`);
        return 1;
    }
    const { pollFor, withShell } = await import('./lib/pb-relaunch.mjs');

    const restoreOutput = installOutputRedaction([]);
    const savedEnv = { [PLANT]: process.env[PLANT], MOZ_PURGE_CACHES: process.env.MOZ_PURGE_CACHES, XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME };
    const fails = [];
    const recorded = new Map(); // pid -> ticks, every identity this run may have to clean up
    const record = (pid) => { const t = Number.isInteger(pid) ? startTicks(pid) : null; if (t !== null) recorded.set(pid, t); return t; };
    const notes = {};
    let profileDir = null;
    let configHome = null;
    let aliasPath = null;
    try {
        const node = await ensurePbNode();
        const orcaVersion = orcaVersionFromPins();
        const port = await freePort(OrcaEnv);
        process.env[PLANT] = '1';
        process.env.MOZ_PURGE_CACHES = '1';

        // A profile path long enough that <profile>/powerbrowser-orca cannot hold orcad's socket.
        const work = join(REPO_ROOT, WORK_REL);
        mkdirSync(work, { recursive: true });
        profileDir = mkdtempSync(join(work, `profile-${'x'.repeat(Math.max(8, OrcaEnv.ORCAD_SOCKET_ROOT_BUDGET - work.length))}-`));
        configHome = mkdtempSync(join(tmpdir(), 'pb-orca-live-config-'));
        process.env.XDG_CONFIG_HOME = configHome;
        const prefs = {
            'browser.sessionstore.resume_from_crash': false,
            'powerbrowser.sidecar.nodePath': node.path,
            'powerbrowser.orca.port': port,
            'powerbrowser.orca.root': orcaDir,
        };
        writeFileSync(join(profileDir, 'user.js'), `${Object.entries(prefs).map(([k, v]) => `user_pref(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join('\n')}\n`);
        const profile = { profileDir, configHome, dispose: async () => {} };
        const profileDataRoot = join(profileDir, OrcaEnv.ORCAD_DATA_ROOT_NAME);
        if (OrcaEnv.socketPathFits(profileDataRoot)) throw new Error(`harness: the profile data root ${profileDataRoot} is short enough for orcad's socket, so the alias would not be exercised`);
        const lockPid = () => { try { return JSON.parse(readFileSync(join(profileDataRoot, OrcaEnv.ORCAD_LOCK_FILE_NAME), 'utf8')).pid; } catch { return null; } };
        const onePbPid = () => { const p = launchedBrowserPids(); if (p.length !== 1) throw new Error(`harness: expected one launched PowerBrowser, found ${p.length}`); return p[0]; };

        // ---- Launch 1: environment, endpoint, Node, then quit with a live agent session.
        let before = [];
        let quitResult = null;
        await withShell(profile, async (app) => {
            const state = await waitReady(app, pollFor, 'launch 1');
            const pbPid = onePbPid();
            const orcadPid = state.pid;
            record(orcadPid);
            record(state.daemonPid);
            if (lockPid() !== orcadPid) fails.push(`getState() names orcad pid ${orcadPid} but orcad's own lock in the profile names ${lockPid()}`);

            const pb = environOf(pbPid);
            const orcad = environOf(orcadPid);
            aliasPath = orcad.ORCA_USER_DATA ?? null;
            const aliasPrefixes = [pb.XDG_RUNTIME_DIR && `${pb.XDG_RUNTIME_DIR.replace(/\/+$/, '')}/pb-orca-`, pb.HOME && `${pb.HOME}/.cache/pb-orca-`].filter(Boolean);
            let backendSettings = null;
            try { backendSettings = JSON.parse(readFileSync(OrcaEnv.theiaBackendSettingsPath(profileDir), 'utf8')); } catch { /* absent or malformed: null, as readStateFile returns */ }
            if (!backendSettings || typeof backendSettings !== 'object') backendSettings = null;
            fails.push(...envVerdict({
                pb, orcad, aliasPrefixes, orcaVersion,
                sdkDir: OrcaEnv.claudeAgentSdkDir({ profileDir, backendSettings }),
                real: { orcadDataRoot: aliasPath ? realOrNull(aliasPath) : null, profileDataRoot: realOrNull(profileDataRoot) },
            }));
            notes.names = Object.keys(orcad).length;

            if (state.boundEndpoint !== `ws://127.0.0.1:${port}`) fails.push(`orcad is bound to ${state.boundEndpoint}, not ws://127.0.0.1:${port}`);
            const listening = tcpOf(orcadPid, '0A');
            if (!listening.length) fails.push('instrument blind: no listening TCP socket was found for orcad in /proc, so the loopback check saw nothing');
            for (const row of listening.filter((r) => !r.localLoopback)) fails.push(`orcad listens on ${row.local} (hex address:port), which is not loopback`);

            const theia = await chromeJson(app, `ChromeUtils.importESModule(${JSON.stringify(THEIA_URL)}).TheiaService.getState()`);
            const [orcadExe, theiaExe] = [realOrNull(`/proc/${orcadPid}/exe`), realOrNull(`/proc/${theia.pid}/exe`)];
            if (!orcadExe || orcadExe !== theiaExe) fails.push(`orcad runs on ${orcadExe}, the Theia backend on ${theiaExe}; D-14 requires the same Node`);
            if (String(state.nodeVersion).replace(/^v/, '') !== node.version) fails.push(`orcad reports Node ${state.nodeVersion}, node-runtime.json pins ${node.version}`);
            notes.node = node.version;
            notes.sharedGroup = pgrpOf(orcadPid) === pgrpOf(pbPid);

            // P62-15, recorded only: does an idle orcad hold a connection to a non-loopback host?
            await sleep(20000);
            const idleTree = [...descendants(ppidMap(), [orcadPid, state.daemonPid])];
            notes.idlePeers = [...new Set(idleTree.flatMap((pid) => tcpOf(pid, '01')).filter((r) => !r.remoteLoopback).map((r) => r.remote))];

            // A real session, through orcad's own CLI, with an environment built from scratch.
            const cliEnv = { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', ORCA_USER_DATA: orcad.ORCA_USER_DATA, ORCA_USER_DATA_PATH: orcad.ORCA_USER_DATA_PATH };
            const repo = join(work, 'repo');
            rmSync(repo, { recursive: true, force: true });
            mkdirSync(repo, { recursive: true });
            writeFileSync(join(repo, 'README'), 'orca-service-live scratch repository\n');
            const git = (...a) => execFileSync('git', ['-C', repo, '-c', 'user.name=fixture', '-c', 'user.email=fixture@invalid', ...a], { env: { PATH: cliEnv.PATH, HOME: cliEnv.HOME }, stdio: ['ignore', 'pipe', 'pipe'] });
            git('init', '-q');
            git('add', '.');
            git('commit', '-q', '-m', 'fixture');
            const cli = join(orcad.ORCA_USER_DATA, 'cli', 'bin', 'orca');
            const orca = (...a) => {
                try { execFileSync(cli, a, { env: liveEnv(cliEnv), cwd: repo, timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) {
                    throw new Error(`the Orca CLI call '${a.slice(0, 2).join(' ')}' failed: ${OrcaEnv.redact(String(e.stderr ?? e.message)).trim().split('\n').pop()}`);
                }
            };
            orca('repo', 'add', '--path', repo, '--json');
            orca('terminal', 'create', '--worktree', `path:${repo}`, '--command', AGENT_ARGV.join(' '), '--json');

            // The daemon named at ready may have been replaced; take the tree under orcad as well.
            const daemonNow = (await orcaState(app)).daemonPid;
            const isAgent = (pid) => { const a = argvOf(pid); return a.length === AGENT_ARGV.length && a.every((x, i) => x === AGENT_ARGV[i]); };
            const treeOf = () => [...descendants(ppidMap(), [orcadPid, state.daemonPid, daemonNow])];
            for (let i = 0; i < 80 && !treeOf().some(isAgent); i++) await sleep(250);
            before = treeOf().map((pid) => ({
                pid,
                ticks: record(pid),
                agent: isAgent(pid),
                what: pid === orcadPid ? 'orcad' : pid === daemonNow || pid === state.daemonPid ? 'terminal daemon' : `descendant (${argvOf(pid)[0] ?? '?'})`,
            })).filter((p) => p.ticks !== null);
            notes.tree = before.length;
            quitResult = await app.quit();
        }, { keepStrays: true }); // the quit verdict below judges what outlives this launch; the harness must not stop it first
        if (quitResult !== 'exited') fails.push(`app.quit() returned '${quitResult}', not exited`);
        let quitFails = [];
        for (let i = 0; i < 100; i++) {
            quitFails = survivors(before, nowTicks(before.map((p) => p.pid)));
            if (!quitFails.length || quitFails[0].startsWith('vacuous')) break;
            await sleep(250);
        }
        fails.push(...quitFails);

        // ---- Launch 2: SIGKILL PowerBrowser; orcad must survive it, or there is nothing to reap. keepStrays: the
        // harness would otherwise stop the orphan before launch 3, the product's reap, could (gate at 2788eb05).
        if (!fails.length) {
            let oldOrcad = null;
            let oldDaemon = null;
            await withShell(profile, async (app) => {
                const state = await waitReady(app, pollFor, 'launch 2');
                oldOrcad = { pid: state.pid, ticks: record(state.pid) };
                oldDaemon = { pid: state.daemonPid, ticks: record(state.daemonPid) };
                process.kill(onePbPid(), 'SIGKILL');
            }, { keepStrays: true }).catch((e) => { if (!oldOrcad) throw e; /* the session died with the browser, as intended */ });
            await sleep(2000);
            const survivedKill = startTicks(oldOrcad.pid) === oldOrcad.ticks;

            // ---- Launch 3: the same profile reaps the leftovers and starts a new orcad on the same port.
            let state3 = { state: 'not launched' };
            let newLockPid = null;
            if (survivedKill) {
                await withShell(profile, async (app) => {
                    state3 = await waitReady(app, pollFor, 'launch 3');
                    record(state3.pid);
                    record(state3.daemonPid);
                    newLockPid = lockPid();
                    const reapNow = nowTicks([oldOrcad.pid, oldDaemon.pid].filter(Number.isInteger));
                    fails.push(...reapVerdict({ survivedKill, oldOrcad, oldDaemon, now: reapNow, state: state3, prefPort: port, newLockPid }));
                    const how = await app.quit();
                    if (how !== 'exited') fails.push(`the final app.quit() returned '${how}', not exited`);
                });
            } else {
                fails.push(...reapVerdict({ survivedKill, oldOrcad, oldDaemon, now: new Map(), state: state3, prefPort: port, newLockPid }));
            }
            notes.reap = `orcad pid ${oldOrcad.pid} survived the SIGKILL and was replaced by pid ${newLockPid} on port ${port}`;
        }

        if (fails.length) {
            for (const f of fails) console.error(`${NAME}: FAIL -- ${OrcaEnv.redact(f)}`);
            return 1;
        }
        console.log(`${NAME}: PASS -- ${notes.names} environment names equal the expected set (planted ${PLANT} absent), data root through the alias, ws://127.0.0.1:${port}, Node ${notes.node} shared with the Theia backend; quit ended a tree of ${notes.tree} processes including an agent session; ${notes.reap}. Recorded: orcad ${notes.sharedGroup ? 'shares' : 'does not share'} PowerBrowser's process group; idle non-loopback peers: ${notes.idlePeers.length ? notes.idlePeers.join(', ') : 'none'}`);
        return 0;
    } catch (e) {
        for (const f of fails) console.error(`${NAME}: FAIL -- ${OrcaEnv.redact(f)}`);
        console.error(`${NAME}: FAIL -- ${OrcaEnv.redact(e.message)}`);
        return 1;
    } finally {
        // Only identities this run recorded, and only while they are still those processes.
        await sleep(500);
        for (const [pid, ticks] of recorded) signalIdentity(pid, ticks, 'SIGKILL');
        // Launches 1 and 2 keep their strays (keepStrays); whatever this run left under its profile is stopped here.
        if (profileDir) await stopStrays(profileDir, { label: NAME });
        try { if (aliasPath && lstatSync(aliasPath).isSymbolicLink()) unlinkSync(aliasPath); } catch { /* already gone */ }
        if (profileDir) rmSync(profileDir, { recursive: true, force: true });
        if (configHome) rmSync(configHome, { recursive: true, force: true });
        for (const [k, v] of Object.entries(savedEnv)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
        restoreOutput();
    }
}

// --- self-test ---------------------------------------------------------------

function runSelfTest() {
    const SWITCH = OrcaEnv.ORCAD_HIDDEN_ELECTRON_SWITCH;
    const pb = { PATH: '/usr/bin', HOME: '/home/u', XDG_RUNTIME_DIR: '/run/user/1000', LANG: 'C.UTF-8', [PLANT]: '1', ORCA_PAIRING_CODE: 'x', NODE_OPTIONS: '--x', GH_TOKEN: 't' };
    const alias = '/run/user/1000/pb-orca-0123456789ab';
    const orcad = {
        PATH: '/usr/bin', HOME: '/home/u', XDG_RUNTIME_DIR: '/run/user/1000', LANG: 'C.UTF-8',
        ORCA_USER_DATA: alias, ORCA_USER_DATA_PATH: alias, ORCA_VERSION: '1.2.3', ORCA_TELEMETRY_DISABLED: '1', DO_NOT_TRACK: '1', [SWITCH]: '1',
        ORCA_CLAUDE_AGENT_SDK_DIR: '/prof/powerbrowser-theia/sdk',
    };
    const base = { pb, orcad, real: { orcadDataRoot: '/prof/powerbrowser-orca', profileDataRoot: '/prof/powerbrowser-orca' }, aliasPrefixes: ['/run/user/1000/pb-orca-', '/home/u/.cache/pb-orca-'], orcaVersion: '1.2.3', sdkDir: '/prof/powerbrowser-theia/sdk' };
    const without = (o, k) => { const c = { ...o }; delete c[k]; return c; };
    const tree = [
        { pid: 10, ticks: '1', what: 'orcad', agent: false },
        { pid: 11, ticks: '2', what: 'terminal daemon', agent: false },
        { pid: 12, ticks: '3', what: 'descendant (sleep)', agent: true },
    ];
    const reap = { survivedKill: true, oldOrcad: { pid: 10, ticks: '1' }, oldDaemon: { pid: 11, ticks: '2' }, now: new Map(), state: { state: 'ready', port: 26768, boundEndpoint: 'ws://127.0.0.1:26768' }, prefPort: 26768, newLockPid: 20 };
    const tcp = (rows) => `  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode\n${rows.map(([l, r, st, inode], i) => `   ${i}: ${l} ${r} ${st} 00000000:00000000 00:00000000 00000000  1000        0 ${inode} 1 0000000000000000 100 0 0 10 0`).join('\n')}\n`;
    const inodes = new Set(['777']);
    const nonLoopback = (text, state) => tcpRows(text, inodes, state).filter((r) => !(state === '0A' ? r.localLoopback : r.remoteLoopback)).map((r) => `not loopback: ${state === '0A' ? r.local : r.remote}`);

    const cases = [
        ['environment control', null, () => envVerdict(base)],
        ['planted name missing from PowerBrowser', 'instrument blind', () => envVerdict({ ...base, pb: without(pb, PLANT) })],
        ['inherited ORCA_PAIRING_CODE in orcad', 'ORCA_PAIRING_CODE', () => envVerdict({ ...base, orcad: { ...orcad, ORCA_PAIRING_CODE: 'x' } })],
        ['the planted name in orcad', PLANT, () => envVerdict({ ...base, orcad: { ...orcad, [PLANT]: '1' } })],
        ['ORCA_USER_DATA_PATH missing', 'lacks ORCA_USER_DATA_PATH', () => envVerdict({ ...base, orcad: without(orcad, 'ORCA_USER_DATA_PATH') })],
        ['a non-allowlisted name (GH_TOKEN)', 'GH_TOKEN', () => envVerdict({ ...base, orcad: { ...orcad, GH_TOKEN: 't' } })],
        ['an allowlisted name PowerBrowser has, dropped (LANG)', 'lacks LANG', () => envVerdict({ ...base, orcad: without(orcad, 'LANG') })],
        ['wrong ORCA_VERSION', 'not the pinned 1.2.3', () => envVerdict({ ...base, orcad: { ...orcad, ORCA_VERSION: '9.9.9' } })],
        ['unequal data-root names', 'differ', () => envVerdict({ ...base, orcad: { ...orcad, ORCA_USER_DATA_PATH: '/elsewhere' } })],
        ['data root resolving outside the profile', "not the profile's", () => envVerdict({ ...base, real: { orcadDataRoot: '/home/u/.config/orca', profileDataRoot: '/prof/powerbrowser-orca' } })],
        ['the switch not 1', `${SWITCH} is not 1`, () => envVerdict({ ...base, orcad: { ...orcad, [SWITCH]: '0' } })],
        ['a scratch HOME given to orcad', 'HOME', () => envVerdict({ ...base, orcad: { ...orcad, HOME: '/tmp/h' } })],
        ['the SDK path given although Theia has the extension disabled', '"/prof/powerbrowser-theia/sdk" in orcad\'s environment, not ""', () => envVerdict({ ...base, sdkDir: '' })],
        ['quit control', null, () => survivors(tree, new Map())],
        ['a reused pid is not a survivor', null, () => survivors(tree, new Map([[12, '999']]))],
        ['one survivor', 'terminal daemon pid 11 survived', () => survivors(tree, new Map([[11, '2']]))],
        ['empty before-set', 'vacuous', () => survivors([], new Map())],
        ['no agent session', 'vacuous: no agent session', () => survivors(tree.map((p) => ({ ...p, agent: false })), new Map())],
        ['reap control', null, () => reapVerdict(reap)],
        ['orcad did not survive the kill', 'vacuous: nothing to reap', () => reapVerdict({ ...reap, survivedKill: false })],
        ['old orcad still alive', 'old orcad pid 10 is still alive', () => reapVerdict({ ...reap, now: new Map([[10, '1']]) })],
        ['port changed', 'port changed', () => reapVerdict({ ...reap, state: { state: 'ready', port: 26769, boundEndpoint: 'ws://127.0.0.1:26769' } })],
        ['lock still names the old pid', "lock names pid 10", () => reapVerdict({ ...reap, newLockPid: 10 })],
        ['listener control (loopback, own inode only)', null, () => nonLoopback(tcp([['0100007F:6890', '00000000:0000', '0A', '777'], ['00000000:0050', '00000000:0000', '0A', '888']]), '0A')],
        ['listener on 0.0.0.0', 'not loopback: 00000000:6890', () => nonLoopback(tcp([['00000000:6890', '00000000:0000', '0A', '777']]), '0A')],
        ['established peer off loopback', 'not loopback: 08080808:01BB', () => nonLoopback(tcp([['0A00000F:C000', '08080808:01BB', '01', '777']]), '01')],
    ];
    let failures = 0;
    for (const [name, naming, go] of cases) {
        const fails = go();
        const text = fails.join('\n');
        if (naming === null) {
            if (fails.length) { console.error(`  FAIL ${name} -> red: ${text}`); failures++; } else console.log(`  ok ${name} -> green`);
        } else if (!fails.length) { console.error(`  FAIL ${name} -> stayed green`); failures++; }
        else if (!text.includes(naming)) { console.error(`  FAIL ${name} -> red, but not naming '${naming}': ${text}`); failures++; }
        else console.log(`  ok ${name} -> red, naming '${naming}'`);
    }
    if (failures) {
        console.error(`${NAME} self-test: FAIL -- ${failures} of ${cases.length} case(s) did not behave`);
        return 1;
    }
    console.log(`${NAME} self-test: PASS -- ${cases.length} verdict cases: controls green, each fault red naming the drift`);
    return 0;
}

const isEntryPoint = (() => {
    try { return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();
if (isEntryPoint) {
    const args = process.argv.slice(2);
    const unknown = args.find((a) => a !== '--self-test');
    if (unknown !== undefined) {
        console.error(`${NAME}: FAIL -- unknown argument '${unknown}' (usage: node ${SELF_REL} [--self-test])`);
        console.error(`  Next step: run: node ${SELF_REL}, or add --self-test to prove the verdicts discriminate.`);
        process.exit(2);
    }
    process.exit(args.includes('--self-test') ? runSelfTest() : await live());
}
