// scripts/lib/live-lock.mjs
//
// The live lock (audit harness-live-security-05): every live row runs under flock on <git common dir>/pb-live.lock,
// so two sessions never launch PowerBrowser and its services against one checkout at once. This file is the one
// live-lock helper for every live row.
//
// Interface (everything else here is exported for the self-test, scripts/verify-live-harness-libs.mjs):
//
//   const locked = await holdLiveLock({ name, scriptUrl: import.meta.url, root: REPO_ROOT });
//   if (locked !== null) process.exit(locked);
//
// Call it at a live row's entry, before anything launches. `name` prefixes the messages, `root` is the checkout (the
// lock is <git common dir>/pb-live.lock, never another file), `args` defaults to process.argv.slice(2). It resolves:
//
//   null  the row holds the lock and may run now. That is so only when /proc/locks shows the lock file's inode held by
//         (i) the process PB_LIVE_LOCK_HOLDER names as <pid>:<start ticks>, with matching start ticks (the gate
//         driver's holder process; the driver exports PB_LIVE_LOCK_HELD=1 with it), or
//         (ii) an ancestor of this process (`flock <lock> node <row>`, with or without the variable).
//   1     FAIL, printed by name: PB_LIVE_LOCK_HELD=1 is set but neither (i) nor (ii) holds, so the variable is not
//         trusted (another session's lock, a stale or forged holder); or the lock could not be taken (no git common
//         dir, no flock, the bounded wait ran out).
//   n     with nothing set and no holder of its own, the row takes the lock itself: it re-runs under
//         `flock -w <PB_LIVE_LOCK_WAIT_S, default 21600> <lock>` in a process group of its own, forwards SIGINT,
//         SIGTERM and SIGHUP to that group, and resolves the re-run's exit status (77 included; 128 + the signal
//         number when the re-run ended by a signal). While it waits it names the holder's pid.
//
// --self-test modes do not call it unless they launch something. Each row's self-test asserts the call is still there
// with lockWiringFails(name, import.meta.url). No top-level side effects.

import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { constants } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const LIVE_LOCK_ENV = 'PB_LIVE_LOCK_HELD';
export const LIVE_LOCK_HOLDER_ENV = 'PB_LIVE_LOCK_HOLDER';
export const LIVE_LOCK_WAIT_ENV = 'PB_LIVE_LOCK_WAIT_S';
export const LIVE_LOCK_FILE = 'pb-live.lock';
const FORWARDED = ['SIGINT', 'SIGTERM', 'SIGHUP'];
const WAIT_TIMEOUT_EXIT = 75; // flock -E: the bounded wait ran out

/** <git common dir>/pb-live.lock for the checkout at `root`, or null when git cannot name it. */
export function liveLockPath(root) {
    try {
        const common = execFileSync('git', ['-C', root, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        return common ? join(common, LIVE_LOCK_FILE) : null;
    } catch {
        return null;
    }
}

/** The start ticks of `pid` (/proc/<pid>/stat field 22), or null when it is not running. */
export function startTicks(pid) {
    try {
        const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
        return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19] ?? null;
    } catch {
        return null;
    }
}

const parentOf = (pid) => {
    try { const s = readFileSync(`/proc/${pid}/stat`, 'utf8'); return Number(s.slice(s.lastIndexOf(')') + 2).split(' ')[1]) || 0; } catch { return 0; }
};

/** The ancestors of `pid`, nearest first, up to init. */
export function ancestorsOf(pid = process.pid) {
    const out = [];
    for (let p = parentOf(pid); p > 1 && out.length < 256; p = parentOf(p)) out.push(p);
    return out;
}

/** The pids /proc/locks names as holding a FLOCK on `lock` (by inode; waiters, the "->" lines, excluded). */
export function lockHolders(lock, locksText = null) {
    let ino;
    try { ino = String(statSync(lock).ino); } catch { return []; }
    let text = locksText;
    if (text === null) { try { text = readFileSync('/proc/locks', 'utf8'); } catch { return []; } }
    const out = [];
    for (const line of text.split('\n')) {
        if (line.includes('->')) continue;
        const f = line.trim().split(/\s+/);
        if (f[1] !== 'FLOCK' || f[5]?.split(':').pop() !== ino) continue;
        out.push(Number(f[4]));
    }
    return [...new Set(out)];
}

/** { pid, ticks } from PB_LIVE_LOCK_HOLDER's "<pid>:<start ticks>", or null when unset or malformed. */
export function parseHolder(value) {
    const m = /^(\d+):(\d+)$/.exec(String(value ?? ''));
    return m ? { pid: Number(m[1]), ticks: m[2] } : null;
}

/**
 * The pure decision over what was observed: 'proceed', 'take' or 'fail'.
 * holders: lockHolders(lock); ancestors: ancestorsOf(); holder: parseHolder(PB_LIVE_LOCK_HOLDER); holderTicks: the
 * named pid's start ticks now; envHeld: PB_LIVE_LOCK_HELD === '1'.
 */
export function lockDecision({ lock, holders, ancestors, holder, holderTicks, envHeld }) {
    if (!lock) return 'fail';
    if (holders.some((p) => ancestors.includes(p))) return 'proceed';
    if (holder && holders.includes(holder.pid) && holderTicks !== null && String(holderTicks) === holder.ticks) return 'proceed';
    return envHeld ? 'fail' : 'take';
}

const describe = (pid) => {
    let cmd = '';
    try { cmd = readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').filter(Boolean).join(' ').slice(0, 120); } catch { /* gone */ }
    return `pid ${pid}${cmd ? ` (${cmd})` : ''}`;
};

/** See the header. Resolves null, or the exit status the caller must exit with. */
export async function holdLiveLock({ name, scriptUrl, root, args = process.argv.slice(2), env = process.env }) {
    const lock = root ? liveLockPath(root) : null;
    if (!lock) {
        console.error(`${name}: FAIL -- the live lock could not be found: git names no common dir for ${root}. Live rows never run unlocked. Next step: run the row inside the checkout`);
        return 1;
    }
    const holders = lockHolders(lock);
    const holder = parseHolder(env[LIVE_LOCK_HOLDER_ENV]);
    const envHeld = env[LIVE_LOCK_ENV] === '1';
    const decision = lockDecision({ lock, holders, ancestors: ancestorsOf(), holder, holderTicks: holder ? startTicks(holder.pid) : null, envHeld });
    if (decision === 'proceed') return null;
    if (decision === 'fail') {
        const named = env[LIVE_LOCK_HOLDER_ENV] ? `${LIVE_LOCK_HOLDER_ENV}=${env[LIVE_LOCK_HOLDER_ENV]}` : `no ${LIVE_LOCK_HOLDER_ENV}`;
        console.error(`${name}: FAIL -- ${LIVE_LOCK_ENV}=1 is set (${named}), but ${lock} is held by ${holders.length ? holders.map(describe).join(', ') : 'nobody'}, which is neither the named holder nor an ancestor of this row, so this row would run outside the live lock. Next step: unset ${LIVE_LOCK_ENV} and ${LIVE_LOCK_HOLDER_ENV} and run the row again; it then waits for the lock itself`);
        return 1;
    }
    const waitS = Number(env[LIVE_LOCK_WAIT_ENV]) > 0 ? Number(env[LIVE_LOCK_WAIT_ENV]) : 21600;
    if (holders.length) console.log(`${name}: waiting up to ${waitS} s for the live lock ${lock}, held by ${holders.map(describe).join(', ')}`);
    const childEnv = { ...env, [LIVE_LOCK_ENV]: '1' };
    delete childEnv[LIVE_LOCK_HOLDER_ENV]; // the re-run proceeds through its flock ancestor
    let child;
    try {
        child = spawn('flock', ['-w', String(waitS), '-E', String(WAIT_TIMEOUT_EXIT), lock, process.execPath, fileURLToPath(scriptUrl), ...args], { stdio: 'inherit', env: childEnv, detached: true });
    } catch (e) {
        console.error(`${name}: FAIL -- flock could not run the row under ${lock} (${e.code ?? e.message}). Next step: put flock (util-linux) on PATH`);
        return 1;
    }
    const forward = (sig) => () => { try { process.kill(-child.pid, sig); } catch { /* the group is gone */ } };
    const handlers = FORWARDED.map((sig) => [sig, forward(sig)]);
    for (const [sig, h] of handlers) process.on(sig, h);
    const status = await new Promise((resolve) => {
        child.once('error', (e) => { console.error(`${name}: FAIL -- flock could not run the row under ${lock} (${e.code ?? e.message}). Next step: put flock (util-linux) on PATH`); resolve(1); });
        child.once('exit', (code, signal) => resolve(signal ? 128 + (constants.signals[signal] ?? 0) : code ?? 1));
    });
    for (const [sig, h] of handlers) process.off(sig, h);
    if (status === WAIT_TIMEOUT_EXIT) {
        const now = lockHolders(lock);
        console.error(`${name}: FAIL -- the live lock ${lock} is still held after ${waitS} s by ${now.length ? now.map(describe).join(', ') : 'a process that has since let it go'}. Next step: wait for that run to end, or stop it`);
        return 1;
    }
    return status;
}

/** Red reasons when the script at `scriptUrl` no longer calls holdLiveLock (each owned live row's self-test asks). */
export function lockWiringFails(name, scriptUrl) {
    let src = '';
    try { src = readFileSync(fileURLToPath(scriptUrl), 'utf8'); } catch { return [`${name}: lock wiring -- the script source could not be read`]; }
    return /\bawait holdLiveLock\(\{/.test(src) ? [] : [`${name}: lock wiring -- the live path no longer awaits holdLiveLock, so the row would run outside the live lock`];
}
