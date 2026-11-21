// scripts/lib/live-lock-reexec.mjs
//
// The live lock for a row that launches a real PowerBrowser (audit harness-live-panels-02, harness-live-tabs-14, and the
// review of lane H6's version). scripts/verify-platform.sh takes <git common dir>/pb-live.lock before its first full-tier
// row and exports PB_LIVE_LOCK_HELD=1; a row started by hand has no lock and takes it here, before it launches anything:
//
//   const r = await takeLiveLock(import.meta.url, NAME);   // null: this process holds the lock, go on
//   if (r !== null) process.exit(r);                       // a re-run under the lock finished with this status
//
// What the helper decides, from the lock file itself (/proc/locks) and never from an environment variable alone:
//  - an ANCESTOR of this process holds the lock (the row was started under `flock <lock> node <row>`): go on, never wait
//    on a lock that this very run holds;
//  - PB_LIVE_LOCK_HELD=1 and the lock is held, and the run carries the driver's PB_VERIFY_ROW_TOKEN: go on (the driver's
//    holder is not an ancestor of its rows). A hand-set PB_LIVE_LOCK_HELD=1 is not trusted: with the lock free the row
//    takes it, and with the lock held by another session it waits for it;
//  - anything else: re-run the same script under `flock -o <lock>` with PB_LIVE_LOCK_HELD=1 and PB_LIVE_LOCK_PARENT=<this
//    pid and start time>, forward SIGINT, SIGTERM and SIGHUP to that run's process group and exit with its status (0,
//    1 or 77 unchanged; 128+n when a signal ended it). A re-run whose parent disappears (even by SIGKILL, which cannot be
//    forwarded) ends itself within two seconds, so a killed parent never leaves the row, its browser and its server running
//    with the lock held;
//  - no git common dir or no flock: FAIL (1), never an unlocked run and never a SKIP.
// The lock file is <git common dir>/pb-live.lock; there is no environment override (a hand-set one would let a row lock
// a file nobody else uses). Tests pass `lock` in the options.
//
// flock -o closes the lock descriptor in the re-run, so a server or browser the row leaves behind cannot hold the lock
// after the row ends.
//
// No top-level side effects. Node built-ins only.

import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PARENT_ENV = 'PB_LIVE_LOCK_PARENT';
const SIGNALS = Object.freeze({ SIGINT: 2, SIGTERM: 15, SIGHUP: 1 });

/** The lock file path under the git common directory of the checkout that holds `scriptUrl`; throws when git cannot say. */
export function liveLockPath(scriptUrl) {
    const repo = resolve(dirname(fileURLToPath(scriptUrl)), '..');
    const common = execFileSync('git', ['-C', repo, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return join(common, 'pb-live.lock');
}

/** Pids holding a flock on inode `ino`, from the text of /proc/locks (pure). */
export function holdersOf(procLocks, ino) {
    const out = [];
    for (const line of String(procLocks).split('\n')) {
        const f = line.trim().split(/\s+/);
        if (f[1] !== 'FLOCK' || line.includes('->')) continue;
        if (String(f[5] ?? '').split(':').pop() === String(ino)) out.push(Number(f[4]));
    }
    return out;
}

/** The parent pid in the text of /proc/<pid>/stat (pure; the command name may hold spaces and parentheses). */
export function parentOfStat(stat) {
    const m = /\)\s+\S+\s+(\d+)/.exec(String(stat));
    return m ? Number(m[1]) : null;
}

/** The start time (clock ticks) in the text of /proc/<pid>/stat, field 22 (pure). */
export function startTicksOfStat(stat) {
    const rest = String(stat).slice(String(stat).lastIndexOf(')') + 2).split(' ');
    return rest[19] ?? null;
}

const readStat = (pid) => { try { return readFileSync(`/proc/${pid}/stat`, 'utf8'); } catch { return null; } };

/** This process's ancestors, nearest first (stops at pid 1 or an unreadable entry). */
export function ancestorsOf(pid = process.pid, stat = readStat) {
    const out = [];
    let p = pid;
    for (let i = 0; i < 64; i += 1) {
        const parent = parentOfStat(stat(p));
        if (!parent || parent <= 1) break;
        out.push(parent);
        p = parent;
    }
    return out;
}

/** Whether some process holds a flock on `lock`: true, false, or null when /proc/locks or the file cannot be read. */
export function lockHolders(lock, read = (f) => readFileSync(f, 'utf8')) {
    try { return holdersOf(read('/proc/locks'), statSync(lock).ino); } catch { return null; }
}

/**
 * The pure decision: 'proceed', 'take' (re-run under flock) or 'fail'. holders: pids holding the lock (null: unreadable);
 * ancestors: this process's ancestor pids; envHeld: PB_LIVE_LOCK_HELD === '1'; driverRow: the run carries the driver's
 * row token.
 */
export function lockDecision({ lock, holders, ancestors, envHeld, driverRow }) {
    if (!lock || holders === null) return 'fail';
    if (holders.some((h) => ancestors.includes(h))) return 'proceed';
    if (envHeld && driverRow && holders.length > 0) return 'proceed';
    return 'take';
}

/** Whether the pid and start time recorded in PB_LIVE_LOCK_PARENT still name a live process. */
export function parentAlive(value, stat = readStat) {
    const m = /^(\d+):(\d+)$/.exec(String(value ?? ''));
    if (!m) return true;
    const s = stat(Number(m[1]));
    return s !== null && startTicksOfStat(s) === m[2];
}

/** In a re-run: ends this process when the parent that started it is gone (a SIGKILL cannot be forwarded). */
export function watchParent(env = process.env, { every = 1000, kill = (sig) => process.kill(process.pid, sig) } = {}) {
    const value = env[PARENT_ENV];
    if (!value) return null;
    const timer = setInterval(() => { if (!parentAlive(value)) { clearInterval(timer); kill('SIGTERM'); } }, every);
    timer.unref();
    return timer;
}

/**
 * Call first in a live row's entry. Resolves null when the row may run now, else the exit status the caller must exit with.
 * opts.lock: the lock file (tests only); opts.env: the environment to read.
 */
export async function takeLiveLock(scriptUrl, name = 'live row', argv = process.argv.slice(2), { lock: given, env = process.env } = {}) {
    let lock = given ?? null;
    if (!lock) {
        try { lock = liveLockPath(scriptUrl); } catch (e) {
            console.error(`${name}: FAIL -- cannot find the git common directory for the live lock (${String(e.message).split('\n')[0]}). Live rows never run unlocked. Next step: run it inside the checkout.`);
            return 1;
        }
    }
    if (spawnSync('flock', ['--version'], { stdio: 'ignore' }).error) {
        console.error(`${name}: FAIL -- the live lock needs flock, which is not installed. Live rows never run unlocked. Next step: install util-linux, or run the row through scripts/verify-platform.sh, which takes the lock itself.`);
        return 1;
    }
    try { appendFileSync(lock, ''); } catch { /* lockHolders then reports the file unreadable */ }
    const decision = lockDecision({ lock, holders: lockHolders(lock), ancestors: ancestorsOf(), envHeld: env.PB_LIVE_LOCK_HELD === '1', driverRow: Boolean(env.PB_VERIFY_ROW_TOKEN) });
    if (decision === 'fail') {
        console.error(`${name}: FAIL -- the live lock file could not be inspected (/proc/locks or the lock file is unreadable). Live rows never run unlocked.`);
        return 1;
    }
    if (decision === 'proceed') { watchParent(env); return null; }
    if (env.PB_LIVE_LOCK_HELD === '1') console.log(`${name}: note -- PB_LIVE_LOCK_HELD=1 is set but no caller of this run holds the lock; taking it`);
    const start = startTicksOfStat(readStat(process.pid) ?? '');
    const child = spawn('flock', ['-o', lock, process.execPath, fileURLToPath(scriptUrl), ...argv], {
        stdio: 'inherit', detached: true,
        env: { ...env, PB_LIVE_LOCK_HELD: '1', [PARENT_ENV]: `${process.pid}:${start}` },
    });
    const forward = (sig) => { try { process.kill(-child.pid, sig); } catch { /* already gone */ } };
    const handlers = Object.keys(SIGNALS).map((sig) => { const h = () => forward(sig); process.on(sig, h); return [sig, h]; });
    return await new Promise((done) => {
        child.on('error', (e) => { console.error(`${name}: FAIL -- flock could not run the row (${e.code ?? e.message})`); done(1); });
        child.on('exit', (code, signal) => {
            for (const [sig, h] of handlers) process.off(sig, h);
            done(code ?? (signal ? 128 + (SIGNALS[signal] ?? 15) : 1));
        });
    });
}
