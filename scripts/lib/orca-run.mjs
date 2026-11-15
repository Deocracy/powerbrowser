// scripts/lib/orca-run.mjs
//
// Phase 60 (RUN-02, D-14, D-07, D-08): start Orca's orcad, built from source and
// de-slotted by scripts/build-orca.sh, on the official Node runtime PowerBrowser
// ships (powerbrowser/packaging/node-runtime.json), read its ready line, keep the
// pairing credential out of every output, and reap orcad and its terminal daemon.
// Used by scripts/verify-orca-slotless-start.mjs.
//
// Source facts this module relies on (orca/ at the pin):
//  - src/main/server/serve-readiness.ts: with --json, stdout carries one JSON line
//    { type: 'orca_server_ready', boundEndpoint, pairing: { url, webClientUrl, ... }, health? }.
//  - src/main/orcad/orcad-health.ts: health.nodeVersion is process.versions.node (no
//    leading v); health.terminalDaemon.pid is number | null.
//  - src/main/orcad/orcad-app-paths.ts reads ORCA_USER_DATA; the Orca CLI reads
//    ORCA_USER_DATA_PATH. Both point at the probe profile.
//  - src/main/orcad/orcad-host-adapters.ts: ORCA_VERSION, else '0.0.0-orcad'.
//  - src/main/orcad/orcad-browser-provider.ts: the installed-Orca paths orcad probes
//    for a hidden Electron (installedOrcaPaths derives them).
//  - The terminal daemon outlives orcad (spike 003 finding 8), so stopOrcad kills it
//    by pid as well as orcad's process group.
//
// No top-level side effects. Node built-ins plus generate-licensing.mjs's Node pin helpers.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { liveEnv } from './firefox-bidi.mjs';
import { fileURLToPath } from 'node:url';

import { NODE_ARCHIVE_DIR, fetchArchive, readNodePin, verifyArchive } from '../generate-licensing.mjs';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const NODE_PIN_REL = 'powerbrowser/packaging/node-runtime.json';
export const PROBE_NODE_DIR_REL = '.mozbuild/orca-probe-node';
export const PINS_REL = 'generated/upstream-pins.env';
export const BROWSER_PROVIDER_REL = 'src/main/orcad/orcad-browser-provider.ts';
export const REDACTED = '<redacted-pairing>';
const NODE_NAMES = new Set(['node', 'node.exe']);

/**
 * The official Node binary from node-runtime.json (linux-x64), sha256-checked, extracted to
 * .mozbuild/orca-probe-node/node. Never process.execPath, never PATH. Returns { path, version }
 * with version lacking the leading v.
 */
export async function ensurePbNode(repoRoot = REPO_ROOT) {
    const pin = readNodePin(join(repoRoot, NODE_PIN_REL));
    const archivePath = join(repoRoot, NODE_ARCHIVE_DIR, pin.archive);
    if (existsSync(archivePath)) verifyArchive(archivePath, pin);
    else await fetchArchive(pin, archivePath);
    const dir = join(repoRoot, PROBE_NODE_DIR_REL);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const member = `node-${pin.version}-linux-x64/bin/node`;
    const x = spawnSync('tar', ['-xJf', archivePath, '-C', dir, '--strip-components=2', member], { encoding: 'utf8' });
    if (x.error || x.status !== 0) {
        throw new Error(`extracting ${member} from ${NODE_ARCHIVE_DIR}/${pin.archive} failed: ${x.error?.message ?? x.stderr.trim().split('\n').pop()}`);
    }
    const path = join(dir, 'node');
    const v = spawnSync(path, ['--version'], { encoding: 'utf8' });
    const got = (v.stdout ?? '').trim();
    if (got !== pin.version) {
        throw new Error(`${PROBE_NODE_DIR_REL}/node --version printed '${got || v.error?.message}', but ${NODE_PIN_REL} pins ${pin.version}`);
    }
    return { path, version: pin.version.replace(/^v/, '') };
}

/** ORCA_VERSION for orcad: UPSTREAM_ORCA_TAG from the generated fragment minus its leading v (Pitfall 9). */
export function orcaVersionFromPins(repoRoot = REPO_ROOT) {
    let text = '';
    try { text = readFileSync(join(repoRoot, PINS_REL), 'utf8'); } catch { /* reported below */ }
    const m = text.match(/^UPSTREAM_ORCA_TAG=v?(\S+)$/m);
    if (!m) throw new Error(`${PINS_REL} has no UPSTREAM_ORCA_TAG. Next step: run: node scripts/generate.mjs`);
    return m[1];
}

/** The names orcadEnv sets; any other ORCA_ name in an orcad environment is drift. */
export const ORCAD_ENV_NAMES = ['ORCA_USER_DATA', 'ORCA_USER_DATA_PATH', 'ORCA_VERSION', 'ORCA_TELEMETRY_DISABLED'];
const STRIPPED = ['ELECTRON_RUN_AS_NODE', 'NODE_OPTIONS', 'NODE_REPL_EXTERNAL_MODULE'];

/** Pure. Every inherited ORCA_* and Node-steering variable removed; only Orca's documented names set (D-08). */
export function orcadEnv(baseEnv, { profileDir, orcaVersion }) {
    const env = { ...baseEnv };
    for (const k of Object.keys(env)) if (k.startsWith('ORCA_') || STRIPPED.includes(k)) delete env[k];
    return {
        ...env,
        ORCA_USER_DATA: profileDir,
        ORCA_USER_DATA_PATH: profileDir,
        ORCA_VERSION: orcaVersion,
        ORCA_TELEMETRY_DISABLED: '1',
        DO_NOT_TRACK: '1',
    };
}

/** Red reasons for an orcad environment: a stray ORCA_ name, a Node-steering name, or a wrong value. */
export function assertEnv(env, { profileDir, orcaVersion }) {
    const fails = [];
    for (const k of Object.keys(env)) {
        if (k.startsWith('ORCA_') && !ORCAD_ENV_NAMES.includes(k)) fails.push(`orcad environment carries inherited ${k}`);
        if (STRIPPED.includes(k)) fails.push(`orcad environment carries ${k}`);
    }
    const want = { ORCA_USER_DATA: profileDir, ORCA_USER_DATA_PATH: profileDir, ORCA_VERSION: orcaVersion, ORCA_TELEMETRY_DISABLED: '1', DO_NOT_TRACK: '1' };
    for (const [k, v] of Object.entries(want)) if (env[k] !== v) fails.push(`orcad environment ${k} is not the probe value`);
    return fails;
}

/** Every credential-bearing form of a pairing URL: the URL, its fragment, the decoded offer and its code. */
function pairingSecrets(pairing) {
    const out = new Set();
    for (const u of [pairing?.webClientUrl, pairing?.url]) {
        if (typeof u !== 'string' || !u) continue;
        out.add(u);
        const hash = u.indexOf('#');
        if (hash >= 0) {
            const frag = u.slice(hash + 1);
            out.add(frag);
            const value = frag.replace(/^pairing=/, '');
            out.add(value);
            let decoded = value;
            try { decoded = decodeURIComponent(value); } catch { /* keep the raw form */ }
            out.add(decoded);
            const code = decoded.match(/[?&]code=([^&]+)/);
            if (code) out.add(code[1]);
        }
        const code = u.match(/[?&]code=([^&#]+)/);
        if (code) out.add(code[1]);
    }
    return [...out].filter((s) => s.length >= 8).sort((a, b) => b.length - a.length);
}

/** Parses the orca_server_ready line. Never returns or logs the raw line. */
export function parseReady(stdoutText) {
    const line = stdoutText.split('\n').find((l) => l.startsWith('{') && l.includes('"orca_server_ready"'));
    if (!line) return null;
    let r;
    try { r = JSON.parse(line); } catch { throw new Error('the orca_server_ready line is not JSON'); }
    const pairing = r.pairing?.available ? r.pairing : null;
    return {
        boundEndpoint: typeof r.boundEndpoint === 'string' ? r.boundEndpoint : null,
        nodeVersion: r.health?.nodeVersion ?? null,
        daemonPid: r.health?.terminalDaemon?.pid ?? null,
        webClientUrl: pairing?.webClientUrl ?? null,
        secrets: pairingSecrets(r.pairing),
    };
}

/** Replaces each secret, then any #pairing=, orca://pair? or pair%3F run, so an unlisted form is caught too. */
export function redact(text, secrets = []) {
    let s = String(text);
    for (const secret of secrets) if (secret) s = s.split(secret).join(REDACTED);
    return s
        .replace(/#pairing=[^\s"'<>]*/g, `#${REDACTED}`)
        .replace(/orca:\/\/pair\?[^\s"'<>]*/g, REDACTED)
        .replace(/pair%3F[^\s"'<>]*/gi, REDACTED);
}

/** Routes every write to stdout and stderr through redact; returns the restore function. */
export function installOutputRedaction(secrets) {
    const saved = [];
    for (const stream of [process.stdout, process.stderr]) {
        const write = stream.write;
        saved.push([stream, write]);
        stream.write = function redacted(chunk, ...rest) {
            const text = typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
            return write.call(stream, redact(text, secrets), ...rest);
        };
    }
    return () => { for (const [stream, write] of saved) stream.write = write; };
}

/**
 * Spawns orcad.js on nodeBin, loopback only, in its own process group. stdout and stderr stay in
 * memory. Resolves { child, ready } once the ready line parses; rejects with a redacted Error on
 * exit or timeout.
 */
export function startOrcad({ nodeBin, orcaDir, profileDir, env, timeoutMs = 60000 }) {
    const args = [join(orcaDir, 'out', 'orcad', 'orcad.js'), '--bind', '127.0.0.1', '--port', '0', '--json',
        '--web-client-root', join(orcaDir, 'out', 'web')];
    const child = spawn(nodeBin, args, { cwd: profileDir, env: liveEnv(env), detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    return new Promise((resolveP, rejectP) => {
        let done = false;
        const tail = () => err.trim().split('\n').slice(-6).join(' | ').slice(-600);
        const finish = (fn, v) => { if (!done) { done = true; clearTimeout(timer); fn(v); } };
        const fail = (msg) => finish(rejectP, Object.assign(new Error(redact(msg)), { child, stderrTail: redact(tail()) }));
        const timer = setTimeout(() => fail(`orcad printed no orca_server_ready line within ${timeoutMs} ms; stderr: ${tail()}`), timeoutMs);
        child.stdout.on('data', (d) => {
            out += d;
            try {
                const ready = parseReady(out);
                if (ready) finish(resolveP, { child, ready, stderr: () => err });
            } catch (e) { fail(e.message); }
        });
        child.stderr.on('data', (d) => { err += d; if (err.length > 1 << 20) err = err.slice(-(1 << 19)); });
        child.on('error', (e) => fail(`orcad could not be spawned: ${e.message}`));
        child.on('exit', (code, signal) => fail(`orcad exited (${signal ?? `code ${code}`}) before its ready line; stderr: ${tail()}`));
    });
}

/** Pure: rootPids plus every descendant, given a pid -> ppid map. */
export function descendants(ppidMap, rootPids) {
    const kids = new Map();
    for (const [pid, ppid] of ppidMap) {
        if (!kids.has(ppid)) kids.set(ppid, []);
        kids.get(ppid).push(pid);
    }
    const seen = new Set();
    const stack = rootPids.filter((p) => Number.isInteger(p) && p > 0);
    while (stack.length) {
        const p = stack.pop();
        if (seen.has(p)) continue;
        seen.add(p);
        for (const c of kids.get(p) ?? []) stack.push(c);
    }
    return seen;
}

function ppidMap() {
    const map = new Map();
    for (const name of readdirSync('/proc')) {
        if (!/^\d+$/.test(name)) continue;
        try {
            const stat = readFileSync(`/proc/${name}/stat`, 'utf8');
            const ppid = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]);
            map.set(Number(name), ppid);
        } catch { /* the process exited */ }
    }
    return map;
}

/** The realpaths of every node executable running as rootPids or any descendant of them. */
export function nodeExesInTree(rootPids) {
    const exes = new Set();
    for (const pid of descendants(ppidMap(), rootPids)) {
        try {
            const exe = realpathSync(`/proc/${pid}/exe`);
            if (NODE_NAMES.has(basename(exe))) exes.add(exe);
        } catch { /* exited or not ours */ }
    }
    return exes;
}

const alive = (pid) => Number.isInteger(pid) && pid > 0 && existsSync(`/proc/${pid}`) && !isZombie(pid);
function isZombie(pid) {
    try {
        const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
        return stat.slice(stat.lastIndexOf(')') + 2).startsWith('Z');
    } catch { return false; }
}
function signal(pid, sig, group = false) {
    try { process.kill(group ? -pid : pid, sig); } catch { /* already gone */ }
}

/** SIGTERM orcad's process group and the terminal daemon, SIGKILL leftovers after 10 s; returns { survivors }. */
export async function stopOrcad(child, daemonPid, { graceMs = 10000 } = {}) {
    const pids = [child?.pid, daemonPid].filter((p) => Number.isInteger(p) && p > 0);
    if (child?.pid) signal(child.pid, 'SIGTERM', true);
    if (daemonPid) signal(daemonPid, 'SIGTERM');
    const until = Date.now() + graceMs;
    while (Date.now() < until && pids.some(alive)) await new Promise((r) => setTimeout(r, 200));
    for (const p of pids.filter(alive)) {
        if (p === child?.pid) signal(p, 'SIGKILL', true);
        signal(p, 'SIGKILL');
    }
    const settle = Date.now() + 2000;
    while (Date.now() < settle && pids.some(alive)) await new Promise((r) => setTimeout(r, 100));
    return { survivors: pids.filter(alive) };
}

/**
 * The installed-Orca paths orcad probes for a hidden Electron, derived from the string literals
 * containing orca-ide in orcad-browser-provider.ts. A line that joins homePath expands it with
 * `home`. Zero derived throws naming the file (the source moved).
 */
export function installedOrcaPaths(orcaDir, home = homedir()) {
    const rel = BROWSER_PROVIDER_REL;
    let text = '';
    try { text = readFileSync(join(orcaDir, rel), 'utf8'); } catch { /* zero derived, below */ }
    const paths = [];
    for (const line of text.split('\n')) {
        const lits = [...line.matchAll(/'([^'\n]*)'|"([^"\n]*)"/g)].map((m) => m[1] ?? m[2]);
        if (!lits.some((l) => l.includes('orca-ide'))) continue;
        if (/\bhome\w*\s*,/i.test(line)) paths.push(join(home, ...lits));
        else for (const l of lits) if (l.startsWith('/') && l.includes('orca-ide')) paths.push(l);
    }
    if (!paths.length) throw new Error(`orca/${rel} yields no installed-Orca path (the source moved)`);
    return paths;
}
