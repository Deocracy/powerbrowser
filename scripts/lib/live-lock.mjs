// scripts/lib/live-lock.mjs
//
// The live lock (audit harness-live-security-05): every live row runs under flock on <git common dir>/pb-live.lock,
// so two sessions never launch PowerBrowser and its services against one checkout at once. The rule for the rows
// lane H5 owns, and the one the other live lanes can follow:
//
//   A live row takes the lock itself. At entry, before anything else runs, it calls holdLiveLock(). That returns null
//   when this process may go on (PB_LIVE_LOCK_HELD=1 is set AND the lock is in fact held, by the driver's holder or
//   by a flock ancestor). Otherwise the row re-runs itself under `flock <lock>` with PB_LIVE_LOCK_HELD=1 and exits
//   with that run's status (77 passes through unchanged). PB_LIVE_LOCK_HELD=1 with the lock free is not trusted: the
//   row takes the lock. When the lock cannot be taken at all (no git common dir, no flock), the row FAILs, never runs
//   unlocked, and never SKIPs.
//
// Self-test, --self-test modes and quick verdict plants do not take the lock: they launch nothing.
//
// No top-level side effects.

import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const LIVE_LOCK_ENV = 'PB_LIVE_LOCK_HELD';
export const LIVE_LOCK_FILE = 'pb-live.lock';

/** <git common dir>/pb-live.lock for the checkout at `root`, or null when git cannot name it. */
export function liveLockPath(root) {
    try {
        const common = execFileSync('git', ['-C', root, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        return common ? join(common, LIVE_LOCK_FILE) : null;
    } catch {
        return null;
    }
}

/** 'held' when some process holds `lock` (flock -n cannot take it), 'free' when it can, 'error' when flock did not run. */
export function lockState(lock) {
    const r = spawnSync('flock', ['-n', lock, 'true'], { stdio: 'ignore' });
    if (r.error) return 'error';
    return r.status === 0 ? 'free' : r.status === 1 ? 'held' : 'error';
}

/**
 * The pure decision: 'proceed' (the caller holds the lock), 'take' (re-run under flock), or 'fail' (cannot lock).
 * envHeld: PB_LIVE_LOCK_HELD === '1'; state: lockState(lock); lock: the path or null.
 */
export function lockDecision({ envHeld, state, lock }) {
    if (!lock) return 'fail';
    if (state === 'error') return 'fail';
    if (envHeld && state === 'held') return 'proceed';
    return 'take';
}

/**
 * Call first in a live row's entry. Returns null when the row may run now, else the exit status the caller must exit
 * with (the locked re-run's status, or 1 when the lock could not be taken).
 */
export function holdLiveLock({ name, scriptUrl, args = process.argv.slice(2), root, env = process.env }) {
    const lock = root ? liveLockPath(root) : null;
    const envHeld = env[LIVE_LOCK_ENV] === '1';
    const state = lock ? lockState(lock) : 'error';
    const decision = lockDecision({ envHeld, state, lock });
    if (decision === 'proceed') return null;
    if (decision === 'fail') {
        console.error(`${name}: FAIL -- the live lock could not be taken (${lock ? `${lock}: flock did not run` : 'git names no common dir for this checkout'}). Live rows never run unlocked. Next step: run inside the checkout with flock on PATH (util-linux).`);
        return 1;
    }
    if (envHeld) console.log(`${name}: note -- ${LIVE_LOCK_ENV}=1 is set but ${lock} is free; taking the lock`);
    const r = spawnSync('flock', [lock, process.execPath, fileURLToPath(scriptUrl), ...args], { stdio: 'inherit', env: { ...env, [LIVE_LOCK_ENV]: '1' } });
    if (r.error) {
        console.error(`${name}: FAIL -- flock could not run the row under ${lock} (${r.error.code ?? r.error.message})`);
        return 1;
    }
    return r.status ?? 1;
}

/** Red reasons when the script at `scriptUrl` no longer calls holdLiveLock (each owned live row's self-test asks). */
export function lockWiringFails(name, scriptUrl) {
    let src = '';
    try { src = readFileSync(fileURLToPath(scriptUrl), 'utf8'); } catch { return [`${name}: lock wiring -- the script source could not be read`]; }
    return /\bholdLiveLock\(\{/.test(src) ? [] : [`${name}: lock wiring -- the live path no longer calls holdLiveLock, so the row would run outside the live lock`];
}
