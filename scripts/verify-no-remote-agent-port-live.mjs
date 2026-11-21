#!/usr/bin/env node
// scripts/verify-no-remote-agent-port-live.mjs
//
// no-remote-agent-port-live (Phase 66 plan 03, BRW-03; P66-28, D-11, ROADMAP Phase 66 criterion 2): the shipped
// PowerBrowser listens on no WebDriver BiDi (Remote Agent) port. Orca agents drive PowerBrowser web tabs through
// the chrome-side bridge, never through a debugging port, so every listening TCP socket of the shipped build's
// process tree must be one PowerBrowser itself accounts for: the Theia sidecar's port, orcad's port, or the sidecar's
// token-gated tab-store endpoint (Phase 29), whose port the backend announces in <profile>/<STORE_ACCESS_FILE_NAME>
// (the name read from tab-store-access-protocol.ts; only the url's port is read, never the token), and orcad's own
// agent-status hook listener (66-06): Orca's agent-hook server binds 127.0.0.1 on an ephemeral port and publishes it
// in <ORCA_USER_DATA>/agent-hooks[/<dev namespace>]/endpoint.env (the directory and file names read from Orca's
// server-runtime-env.ts and endpoint-publication.ts at the pin); only the ORCA_AGENT_HOOK_PORT line is read, never
// the token line, and the port is accepted only when that file names it.
//
// One run launches the built binary twice, headless, on scratch profiles, with MOZ_PURGE_CACHES=1, the inherited
// ORCA_* variables removed, no probe harness and no BiDi client:
//   1. control: with --remote-debugging-port=0, which starts the Remote Agent on an ephemeral port;
//   2. shipped: with no such argument, as a user launches it.
// For each launch it waits until the profile's sidecar state file (<profile>/powerbrowser-theia/sidecar-state-*.json)
// and orcad state file (<profile>/powerbrowser-orca/pb-orca-state.json) both name a port, derives the accepted
// ports from them at run time (never literals), maps the listening rows of /proc/<pid>/net/tcp and tcp6 to the
// socket inodes under /proc/<pid>/fd of every process in the launched tree, and prints every listening socket:
//   no-remote-agent-port-live: socket <control|shipped> <address>:<port> pid <pid> <process name> <sidecar|orcad|tab-store|unaccounted>
// before any verdict, so a reader sees every socket, not only the verdict.
//
// Verdicts (pure, exported, the self-test's subject):
//   - the control must show at least one unaccounted socket owned by the main PowerBrowser process, else
//     "detector blind: --remote-debugging-port=0 produced no unaccounted socket" (CLAUDE.md verification rule 1: the
//     absence below is judged only by a detector this same run proved can see the Remote Agent);
//   - the shipped launch must show none, naming each unaccounted socket and its owning process;
//   - each accepted port must have a listening socket in the tree, else "accounting blind".
// Processes are stopped by recorded pid and start ticks only (SIGTERM to the main process, then SIGKILL of any
// recorded identity still alive after 25 s); nothing is signalled by name or group.
//
// SKIP (one named line, exit 77): no built PowerBrowser (objdir/dist/bin/powerbrowser or PB_FIREFOX_BIN) or no built
// orca/ (orca/out/orcad/orcad.js).
//
// Accepted sockets must also be bound to loopback, the tree is sampled again after a 10 s settle, and processes
// reparented out of the tree but working under the launch's profile count as the tree's (harness-live-security-09).
//
// Tier: full, headless only; the row takes the live lock itself (scripts/lib/live-lock.mjs) when a binary exists.
// --self-test: hermetic verdict plants over fixture /proc tables (quick part), then, when the built binary exists,
// the live control launch alone, which must go red naming the Remote Agent's socket; without it a named SKIP (77).
//
// Usage:
//   node scripts/verify-no-remote-agent-port-live.mjs
//   node scripts/verify-no-remote-agent-port-live.mjs --self-test

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as OrcaEnv from '../powerbrowser/shell/OrcaEnv.sys.mjs';
import { descendants, ensurePbNode } from './lib/orca-run.mjs';
import { liveEnv, strayUnder } from './lib/firefox-bidi.mjs';
import { holdLiveLock, lockWiringFails } from './lib/live-lock.mjs';
import { SKIP_EXIT, skipLine } from './lib/skip-verdict.mjs';
import { freePort, ppidMap, signalIdentity, startTicks } from './verify-orca-hidden-electron.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'no-remote-agent-port-live';
const FIREFOX_BIN = process.env.PB_FIREFOX_BIN || join(REPO_ROOT, 'objdir', 'dist', 'bin', 'powerbrowser');
const ORCA_DIR = join(REPO_ROOT, 'orca');
const WORK_REL = '.mozbuild/no-remote-agent-port-live';
const READY_MS = 120000;
const QUIT_MS = 25000;
const SETTLE_MS = 10000;
const LISTEN = '0A';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const read = path => { try { return readFileSync(path, 'utf8'); } catch { return null; } };

// --- pure parts ----------------------------------------------------------------

/** The dotted or colon address of a /proc/net/tcp{,6} hex address (kernel little-endian per 32-bit word). */
export function hexAddress(hex) {
    const words = hex.match(/.{8}/g) ?? [];
    const bytes = words.flatMap(w => w.match(/../g).reverse().map(b => parseInt(b, 16)));
    if (bytes.length === 4) return bytes.join('.');
    if (bytes.slice(0, 10).every(b => b === 0) && bytes[10] === 0xff && bytes[11] === 0xff) return `::ffff:${bytes.slice(12).join('.')}`;
    const groups = [];
    for (let i = 0; i < 16; i += 2) groups.push(((bytes[i] << 8) | bytes[i + 1]).toString(16));
    return `[${groups.join(':').replace(/(^|:)0(:0)+(:|$)/, '::')}]`;
}

/** Listening rows of one /proc/<pid>/net/tcp{,6} text: [{ address, port, inode }]. */
export function listeningRows(text) {
    const rows = [];
    for (const line of String(text).split('\n').slice(1)) {
        const f = line.trim().split(/\s+/);
        if (f.length < 10 || f[3] !== LISTEN) continue;
        const colon = f[1].lastIndexOf(':');
        rows.push({ address: hexAddress(f[1].slice(0, colon)), port: parseInt(f[1].slice(colon + 1), 16), inode: f[9] });
    }
    return rows;
}

/** True for a loopback address as hexAddress prints it: 127.0.0.0/8, [::1] and ::ffff:127.x.x.x. */
export function isLoopback(address) {
    return /^127\./.test(address) || address === '[::1]' || /^::ffff:127\./.test(address);
}

/**
 * The listening sockets of a process tree: procs is [{ pid, name, inodes: Set, tcp: string }] (tcp = net/tcp and
 * tcp6 texts joined). Each socket is attributed to the first process in the tree holding its inode; a listening row
 * whose inode no tree process holds belongs to another process and is ignored.
 */
export function treeSockets(procs, accepted) {
    const seen = new Set();
    const out = [];
    for (const proc of procs) {
        for (const row of listeningRows(proc.tcp)) {
            if (seen.has(row.inode) || !proc.inodes.has(row.inode)) continue;
            seen.add(row.inode);
            const owner = Object.entries(accepted).find(([, port]) => port === row.port)?.[0] ?? 'unaccounted';
            out.push({ ...row, pid: proc.pid, name: proc.name, owner, loopback: isLoopback(row.address) });
        }
    }
    return out;
}

export const socketLine = (launch, s) => `${NAME}: socket ${launch} ${s.address}:${s.port} pid ${s.pid} ${s.name} ${s.owner}`;

/** Accounting: each accepted port must have a listener, or the comparison proves nothing. */
export function accountingVerdict(launch, sockets, accepted) {
    const fails = [];
    for (const [what, port] of Object.entries(accepted)) {
        if (!Number.isInteger(port) || !sockets.some(s => s.port === port)) {
            fails.push(`accounting blind: the ${launch} launch's ${what} port ${port} has no listening socket in the PowerBrowser process tree`);
        }
    }
    return fails;
}

/** The control launch (--remote-debugging-port=0) must show an unaccounted socket of the main process. */
export function controlVerdict(sockets, mainPid) {
    const remote = sockets.filter(s => s.owner === 'unaccounted' && s.pid === mainPid);
    return remote.length ? { fails: [], remote } : { fails: ['detector blind: --remote-debugging-port=0 produced no unaccounted socket owned by the main PowerBrowser process'], remote };
}

/**
 * The shipped launch must show no unaccounted socket at all, and (harness-live-security-09) every accounted one bound to
 * loopback: a sidecar or tab-store endpoint on 0.0.0.0 or [::] is reachable from the network whatever its port.
 */
export function shippedVerdict(sockets) {
    return [
        ...sockets.filter(s => s.owner === 'unaccounted').map(s => `the shipped build listens on ${s.address}:${s.port}, owned by pid ${s.pid} (${s.name}), which is not a port PowerBrowser accounts for (sidecar, orcad, tab-store, orcad-agent-hooks)`),
        ...sockets.filter(s => s.owner !== 'unaccounted' && s.loopback === false).map(s => `the shipped build's ${s.owner} listens on ${s.address}:${s.port} (pid ${s.pid}, ${s.name}), which is not a loopback address`),
    ];
}

/** Sockets of several samples joined by inode, the first sighting kept: a listener opened after the first one counts. */
export function mergeSamples(samples) {
    const seen = new Map();
    for (const sample of samples) for (const s of sample) if (!seen.has(s.inode)) seen.set(s.inode, s);
    return [...seen.values()];
}

/** The port line of Orca's agent-hook endpoint file text, or null; no other line (the token) is ever returned. */
export function agentHookPortFrom(text) {
    const port = Number(/^(?:set )?ORCA_AGENT_HOOK_PORT=(\d+)\r?$/m.exec(String(text ?? ''))?.[1]);
    return Number.isInteger(port) && port > 0 && port < 65536 ? port : null;
}

// --- live --------------------------------------------------------------------

function socketInodes(pid) {
    const out = new Set();
    try {
        for (const fd of readdirSync(`/proc/${pid}/fd`)) {
            try { const m = /^socket:\[(\d+)\]$/.exec(readlinkSync(`/proc/${pid}/fd/${fd}`)); if (m) out.add(m[1]); } catch { /* closed */ }
        }
    } catch { /* exited */ }
    return out;
}

/** The pids, other than this process, whose argv or working folder lies under `root` (a reparented orcad tree). */
function pidsUnder(root) {
    if (!root) return [];
    let names = [];
    try { names = readdirSync('/proc').filter(n => /^\d+$/.test(n) && Number(n) !== process.pid); } catch { return []; }
    const procs = names.map(n => ({ pid: Number(n), argv: (read(`/proc/${n}/cmdline`) ?? '').split('\0').filter(Boolean), cwd: (() => { try { return readlinkSync(`/proc/${n}/cwd`); } catch { return ''; } })() }));
    return strayUnder(root, procs).map(p => p.pid);
}

function treeProcs(rootPid, profileDir = null) {
    // harness-live-security-09: a process reparented to init leaves the descendant tree; the ones working under this
    // launch's profile are this launch's too.
    const pids = [...new Set([...descendants(ppidMap(), [rootPid]), ...pidsUnder(profileDir)])].sort((a, b) => (a === rootPid ? -1 : b === rootPid ? 1 : a - b));
    return pids.map(pid => ({
        pid,
        ticks: startTicks(pid),
        name: (read(`/proc/${pid}/comm`) ?? '?').trim().replace(/\s+/g, '_'),
        inodes: socketInodes(pid),
        tcp: `${read(`/proc/${pid}/net/tcp`) ?? ''}\n${(read(`/proc/${pid}/net/tcp6`) ?? '').split('\n').slice(1).join('\n')}`,
    }));
}

function sidecarPort(profileDir) {
    const dir = join(profileDir, 'powerbrowser-theia');
    for (const name of existsSync(dir) ? readdirSync(dir) : []) {
        if (!/^sidecar-state-.*\.json$/.test(name)) continue;
        try { const port = JSON.parse(read(join(dir, name))).port; if (Number.isInteger(port)) return port; } catch { /* half written */ }
    }
    return null;
}

const STORE_PROTOCOL = 'theia/extensions/tab-uris/src/browser/tab-store-access-protocol.ts';
function storeAccessPort(profileDir) {
    const name = /export const STORE_ACCESS_FILE_NAME = '([^']+)'/.exec(read(join(REPO_ROOT, STORE_PROTOCOL)) ?? '')?.[1];
    if (!name) throw new Error(`broken instrument: STORE_ACCESS_FILE_NAME was not found in ${STORE_PROTOCOL}`);
    try {
        const port = Number(new URL(JSON.parse(read(join(profileDir, name))).url).port);
        return Number.isInteger(port) && port > 0 ? port : null;
    } catch {
        return null;
    }
}

const HOOK_ENV_SRC = 'orca/src/main/agent-hooks/server/server-runtime-env.ts';
const HOOK_FILE_SRC = 'orca/src/shared/agent-hook-listener/endpoint-publication.ts';
/** orcad's agent-hook listener port from Orca's own endpoint file under the orcad data root, or null. */
function agentHookPort(profileDir) {
    const dirName = /join\(userDataPath, '([^']+)'\)/.exec(read(join(REPO_ROOT, HOOK_ENV_SRC)) ?? '')?.[1];
    const fileName = /: '(endpoint\.[a-z]+)'/.exec(read(join(REPO_ROOT, HOOK_FILE_SRC)) ?? '')?.[1];
    if (!dirName || !fileName) throw new Error(`broken instrument: the agent-hook endpoint directory or file name was not found in ${HOOK_ENV_SRC} / ${HOOK_FILE_SRC}`);
    const dir = join(OrcaEnv.dataRootFor(profileDir), dirName);
    const namespaced = existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => join(dir, d.name, fileName)) : [];
    for (const file of [join(dir, fileName), ...namespaced]) {
        const port = agentHookPortFrom(read(file));
        if (port) return port;
    }
    return null;
}

function orcadPort(profileDir) {
    try {
        const port = JSON.parse(read(join(OrcaEnv.dataRootFor(profileDir), OrcaEnv.ORCAD_STATE_FILE_NAME))).port;
        return Number.isInteger(port) ? port : null;
    } catch {
        return null;
    }
}

async function launch(label, extraArgs, node) {
    const work = join(REPO_ROOT, WORK_REL);
    mkdirSync(work, { recursive: true });
    const profileDir = mkdtempSync(join(work, `${label}-`));
    const configHome = mkdtempSync(join(tmpdir(), `pb-no-remote-${label}-`));
    const prefs = {
        'browser.sessionstore.resume_from_crash': false,
        'powerbrowser.sidecar.nodePath': node.path,
        'powerbrowser.orca.port': await freePort(OrcaEnv),
        'powerbrowser.orca.root': ORCA_DIR,
    };
    writeFileSync(join(profileDir, 'user.js'), `${Object.entries(prefs).map(([k, v]) => `user_pref(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join('\n')}\n`);
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('ORCA_')));
    Object.assign(env, { MOZ_PURGE_CACHES: '1', MOZ_HEADLESS: '1', XDG_CONFIG_HOME: configHome });
    delete env.PB_LIVE_HEADED;
    delete env.PB_REAL_INPUT;
    // stdout and stderr are discarded unread: orcad's ready line and any pairing text never reach this script.
    const child = spawn(FIREFOX_BIN, ['-no-remote', '-profile', profileDir, '-purgecaches', ...extraArgs], { env: liveEnv(env), stdio: 'ignore' });
    const mainPid = child.pid;
    const exited = new Promise(r => child.once('exit', r));
    const recorded = new Map();
    const stop = async () => {
        for (const p of treeProcs(mainPid, profileDir)) if (p.ticks !== null) recorded.set(p.pid, p.ticks);
        signalIdentity(mainPid, recorded.get(mainPid) ?? startTicks(mainPid), 'SIGTERM');
        await Promise.race([exited, sleep(QUIT_MS)]);
        const deadline = Date.now() + QUIT_MS;
        while (Date.now() < deadline && [...recorded].some(([pid, t]) => startTicks(pid) === t)) await sleep(250);
        for (const [pid, ticks] of recorded) signalIdentity(pid, ticks, 'SIGKILL');
        rmSync(configHome, { recursive: true, force: true });
        rmSync(profileDir, { recursive: true, force: true });
    };
    try {
        const deadline = Date.now() + READY_MS;
        let accepted = null;
        while (Date.now() < deadline) {
            const sidecar = sidecarPort(profileDir);
            const orcad = orcadPort(profileDir);
            const store = storeAccessPort(profileDir);
            if (sidecar && orcad && store) { accepted = { sidecar, orcad, 'tab-store': store }; break; }
            if (child.exitCode !== null) throw new Error(`${label}: PowerBrowser exited (code ${child.exitCode}) before both state files named a port`);
            await sleep(500);
        }
        if (!accepted) throw new Error(`${label}: the sidecar state, orcad state and tab-store access files did not all name a port within ${READY_MS} ms`);
        // Listeners settle after ready (the Remote Agent binds during startup, the sidecar before its state file).
        let first = [];
        for (let i = 0; i < 20; i++) {
            const hooks = agentHookPort(profileDir);
            if (hooks) accepted['orcad-agent-hooks'] = hooks;
            first = treeSockets(treeProcs(mainPid, profileDir), accepted);
            if (accountingVerdict(label, first, accepted).length === 0) break;
            await sleep(500);
        }
        // harness-live-security-09: one startup snapshot misses a listener opened later, so the tree is sampled again
        // after a settle; the judged set is every socket either sample saw.
        await sleep(SETTLE_MS);
        const hooks = agentHookPort(profileDir);
        if (hooks) accepted['orcad-agent-hooks'] = hooks;
        const sockets = mergeSamples([first, treeSockets(treeProcs(mainPid, profileDir), accepted)]);
        return { mainPid, accepted, sockets };
    } finally {
        await stop();
    }
}

function skipReason() {
    if (!existsSync(FIREFOX_BIN)) return `no built PowerBrowser (${FIREFOX_BIN} missing; see docs/BUILD.md "Firefox half")`;
    if (!existsSync(join(ORCA_DIR, 'out', 'orcad', 'orcad.js'))) return 'no built orca/ (orca/out/orcad/orcad.js missing; run: nix develop .#orca --command bash scripts/build-orca.sh)';
    return null;
}

async function liveControl(node) {
    const control = await launch('control', ['--remote-debugging-port=0'], node);
    control.sockets.forEach(s => console.log(socketLine('control', s)));
    const verdict = controlVerdict(control.sockets, control.mainPid);
    return { control, fails: [...accountingVerdict('control', control.sockets, control.accepted), ...verdict.fails], remote: verdict.remote };
}

async function live() {
    const skip = skipReason();
    if (skip) { console.log(skipLine(NAME, skip)); return SKIP_EXIT; }
    const node = await ensurePbNode();
    const { fails } = await liveControl(node);
    if (fails.length) {
        console.error(`${NAME}: FAIL -- the detector was not proven, so the shipped launch is not judged:`);
        fails.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    const shipped = await launch('shipped', [], node);
    shipped.sockets.forEach(s => console.log(socketLine('shipped', s)));
    const shippedFails = [...accountingVerdict('shipped', shipped.sockets, shipped.accepted), ...shippedVerdict(shipped.sockets)];
    if (shippedFails.length) {
        console.error(`${NAME}: FAIL -- the shipped build listens on a port PowerBrowser does not account for:`);
        shippedFails.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    const hooks = shipped.accepted['orcad-agent-hooks'] ? `, orcad's agent-hook endpoint port ${shipped.accepted['orcad-agent-hooks']}` : '';
    console.log(`${NAME}: PASS -- the control launch's Remote Agent socket was seen on the main process, and the shipped launch listens only on the sidecar's port ${shipped.accepted.sidecar}, orcad's port ${shipped.accepted.orcad}${hooks} and the tab-store endpoint's port ${shipped.accepted['tab-store']} (${shipped.sockets.length} listening socket(s))`);
    return 0;
}

// --- self-test -----------------------------------------------------------------

const fixtureRow = (i, port, inode, addr = '0100007F') => `   ${i}: ${addr}:${port.toString(16).toUpperCase().padStart(4, '0')} 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 ${inode} 1 0000000000000000 100 0 0 10 0`;
const fixtureTcp = rows => `  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode\n${rows.join('\n')}`;

async function selfTest() {
    const accepted = { sidecar: 41000, orcad: 41001, 'tab-store': 41002 };
    const table = fixtureTcp([fixtureRow(0, 41000, '100'), fixtureRow(1, 41001, '101'), fixtureRow(2, 43555, '102'), fixtureRow(3, 45000, '999'), fixtureRow(4, 41002, '103')]);
    const base = [
        { pid: 10, name: 'powerbrowser', inodes: new Set(), tcp: table },
        { pid: 11, name: 'node', inodes: new Set(['100', '103']), tcp: table },
        { pid: 12, name: 'node', inodes: new Set(['101']), tcp: table },
    ];
    const withRemote = [{ ...base[0], inodes: new Set(['102']) }, base[1], base[2]];
    let failed = 0;
    const expect = (name, got, want) => {
        const text = got.join(' | ');
        if (want === null ? got.length === 0 : got.some(f => f.includes(want))) console.log(`  ok  ${name} -> ${want === null ? 'green' : `red, naming '${want}'`}`);
        else { console.error(`${NAME} self-test: FAIL -- '${name}' expected ${want === null ? 'green' : `red naming '${want}'`}; got: ${text || '(green)'}`); failed++; }
    };
    const clean = treeSockets(base, accepted);
    expect('control: a clean shipped tree accounted (sidecar and orcad listening)', [...accountingVerdict('shipped', clean, accepted), ...shippedVerdict(clean)], null);
    expect('an extra socket owned by the main process', shippedVerdict(treeSockets(withRemote, accepted)), 'listens on 127.0.0.1:43555, owned by pid 10 (powerbrowser)');
    expect('a socket owned by an unrelated pid is ignored', clean.some(s => s.port === 45000) ? ['the unrelated socket 45000 was attributed to the tree'] : [], null);
    expect('an accepted port with no listener', accountingVerdict('shipped', treeSockets([base[0], base[1]], accepted), accepted), 'accounting blind: the shipped launch\'s orcad port 41001');
    expect('the tab-store endpoint not announced (its port unaccounted)', shippedVerdict(treeSockets(base, { sidecar: 41000, orcad: 41001 })), 'listens on 127.0.0.1:41002, owned by pid 11 (node)');
    expect('a control with no extra socket', controlVerdict(clean, 10).fails, 'detector blind: --remote-debugging-port=0 produced no unaccounted socket');
    expect('a control whose extra socket belongs to a child process, not the main one', controlVerdict(treeSockets([base[0], { ...base[1], inodes: new Set(['100', '102']) }, base[2]], accepted), 10).fails, 'detector blind');
    expect('control: a control with the Remote Agent on the main process', controlVerdict(treeSockets(withRemote, accepted), 10).fails, null);
    // 66-06: orcad's agent-hook listener is accepted only from Orca's endpoint file, and only its port line is read.
    const hookAccepted = { ...accepted, 'orcad-agent-hooks': 43555 };
    const hookTree = [base[0], base[1], { ...base[2], inodes: new Set(['101', '102']) }];
    expect('control: orcad\'s agent-hook socket accounted when its endpoint file names the port', shippedVerdict(treeSockets(hookTree, hookAccepted)), null);
    expect('orcad\'s agent-hook socket with no endpoint file', shippedVerdict(treeSockets(hookTree, accepted)), 'listens on 127.0.0.1:43555, owned by pid 12 (node)');
    const endpointText = ['ORCA_AGENT_HOOK_PORT=43555', 'ORCA_AGENT_HOOK_TOKEN=00000000-planted', 'ORCA_AGENT_HOOK_ENV=production', ''].join('\n');
    expect('control: the endpoint file\'s port line read', agentHookPortFrom(endpointText) === 43555 ? [] : [`read ${agentHookPortFrom(endpointText)}`], null);
    expect('an endpoint file with no port line', agentHookPortFrom('ORCA_AGENT_HOOK_TOKEN=43555\n') === null ? ['no port'] : [], 'no port');
    // harness-live-security-09: an accepted port bound to 0.0.0.0 or [::] is red; a later listener counts.
    const wildTable = fixtureTcp([fixtureRow(0, 41000, '100', '00000000'), fixtureRow(1, 41001, '101'), fixtureRow(4, 41002, '103')]);
    const wild = [{ ...base[0], tcp: wildTable }, { ...base[1], tcp: wildTable }, { ...base[2], tcp: wildTable }];
    expect('a sidecar bound to 0.0.0.0', shippedVerdict(treeSockets(wild, accepted)), "the shipped build's sidecar listens on 0.0.0.0:41000");
    const v6wild = fixtureTcp([fixtureRow(0, 41002, '103', '00000000000000000000000000000000'), fixtureRow(1, 41000, '100'), fixtureRow(2, 41001, '101')]);
    expect('a tab-store endpoint bound to [::]', shippedVerdict(treeSockets([base[0], { ...base[1], tcp: v6wild }, { ...base[2], tcp: v6wild }], accepted)), "the shipped build's tab-store listens on [::]");
    expect('control: ::ffff:127.0.0.1 is loopback', isLoopback('::ffff:127.0.0.1') && isLoopback('127.0.0.1') && isLoopback('[::1]') && !isLoopback('0.0.0.0') ? [] : ['loopback misread'], null);
    const later = mergeSamples([clean, treeSockets(withRemote, accepted)]);
    expect('a listener opened after the first sample', shippedVerdict(later), 'listens on 127.0.0.1:43555');
    expect('the live path takes the live lock', lockWiringFails(NAME, import.meta.url), null);
    const v6 = hexAddress('00000000000000000000000001000000');
    if (v6 !== '[::1]') { console.error(`${NAME} self-test: FAIL -- the IPv6 loopback decoded as ${v6}, not [::1]`); failed++; } else console.log('  ok  IPv6 loopback decodes as [::1]');
    if (failed) return 1;

    const skip = skipReason();
    if (skip) {
        // harness-live-security-03: the live half did not run, so this is a SKIP (exit 77), not a PASS.
        console.log(`${NAME} self-test: verdict plants each went red naming the drift`);
        console.log(skipLine(`${NAME} self-test`, `the live Remote Agent control did not run: ${skip}`));
        return SKIP_EXIT;
    }
    // ROADMAP criterion 2: the self-test enables the Remote Agent and the detector goes red naming its socket.
    const node = await ensurePbNode();
    const { control, fails, remote } = await liveControl(node);
    const red = shippedVerdict(control.sockets);
    if (fails.length || !red.length) {
        console.error(`${NAME} self-test: FAIL -- the live control launch with --remote-debugging-port=0 did not go red naming the Remote Agent's socket: ${[...fails, ...red].join(' | ') || '(green)'}`);
        return 1;
    }
    console.log(`  ok  live control (--remote-debugging-port=0) -> red, naming ${remote.map(s => `${s.address}:${s.port} pid ${s.pid} (${s.name})`).join(', ')}`);
    console.log(`${NAME} self-test: PASS -- verdict plants each went red naming the drift, and the live Remote Agent control went red naming its socket`);
    return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    // Both modes may launch the built binary (the self-test's live half is the Remote Agent control), so both take the
    // live lock when a binary is there to launch.
    if (!skipReason()) {
        const locked = holdLiveLock({ name: NAME, scriptUrl: import.meta.url, root: REPO_ROOT });
        if (locked !== null) process.exit(locked);
    }
    process.exit(process.argv.includes('--self-test') ? await selfTest() : await live());
}
