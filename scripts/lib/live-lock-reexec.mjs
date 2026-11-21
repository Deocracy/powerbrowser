// scripts/lib/live-lock-reexec.mjs
//
// The live lock for a row that launches a real PowerBrowser (audit harness-live-panels-02, harness-live-tabs-14).
// scripts/verify-platform.sh takes <git common dir>/pb-live.lock before its first full-tier row and exports
// PB_LIVE_LOCK_HELD=1, so a row the driver starts runs under the lock already. A row started by hand has no
// lock: it calls takeLiveLock() before it launches anything, and the lock is held by a flock process that
// re-runs the same script with PB_LIVE_LOCK_HELD=1 until that run ends.
//
//   const r = takeLiveLock(import.meta.url);          // null: this process holds the lock, go on
//   if (r !== null) process.exit(r);                  // a re-run under the lock finished with this status
//
// flock -o closes the lock descriptor in the re-run, so a server or browser the row leaves behind cannot hold the
// lock after the row ends. The re-run's exit status (0, 1 or 77) is passed on unchanged.
//
// No top-level side effects. Node built-ins only.

import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The lock file path under the git common directory of the checkout that holds `scriptUrl`. */
export function liveLockPath(scriptUrl) {
    const repo = resolve(dirname(fileURLToPath(scriptUrl)), '..');
    const common = execFileSync('git', ['-C', repo, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).trim();
    return join(common, 'pb-live.lock');
}

/**
 * Null when this process already runs under the live lock (PB_LIVE_LOCK_HELD=1, set by the driver or by an earlier
 * call of this function). Otherwise re-runs the calling script and its arguments under flock and returns its exit
 * status; 1 with a message on stderr when flock is missing or the lock path cannot be derived.
 */
export function takeLiveLock(scriptUrl, name = 'live row', argv = process.argv.slice(2)) {
    if (process.env.PB_LIVE_LOCK_HELD === '1') return null;
    let lock;
    try { lock = liveLockPath(scriptUrl); } catch (e) {
        console.error(`${name}: FAIL -- cannot find the git common directory for the live lock (${String(e.message).split('\n')[0]}). Next step: run it inside the checkout.`);
        return 1;
    }
    const r = spawnSync('flock', ['-o', lock, process.execPath, fileURLToPath(scriptUrl), ...argv],
        { stdio: 'inherit', env: { ...process.env, PB_LIVE_LOCK_HELD: '1' } });
    if (r.error) {
        console.error(`${name}: FAIL -- the live lock needs flock (${r.error.message}). Next step: install util-linux, or run the row through scripts/verify-platform.sh, which takes the lock itself.`);
        return 1;
    }
    return r.status ?? 1;
}
