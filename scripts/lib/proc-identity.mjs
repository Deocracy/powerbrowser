// scripts/lib/proc-identity.mjs
//
// Signal a process only while it is still the process recorded earlier. A pid number is reused once its process is
// gone, so a bare `kill(pid)` after a teardown window can hit an unrelated process. The identity of a process is its
// pid plus its start time in clock ticks since boot (/proc/<pid>/stat field 22), recorded when it was started.
// Same semantics as the hidden-Electron check's startTicks/signalIdentity, which the leak leg used first; this
// module is the shared copy, free of that script's imports (audit harness-live-panels-10, handed over by lane H7).
//
// No top-level side effects.

import { readFileSync, readdirSync } from 'node:fs';

function statFields(pid) {
    try {
        const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
        return stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    } catch {
        return null;
    }
}

/** Start ticks of a live pid as a string; null when it is gone or a zombie. */
export function startTicks(pid) {
    const fields = Number.isInteger(pid) && pid > 0 ? statFields(pid) : null;
    if (!fields) return null;
    return fields[0] === 'Z' ? null : fields[19] ?? null;
}

/** Signals `pid` only while it is still the process recorded with `ticks`. Returns whether a signal was sent. */
export function signalIdentity(pid, ticks, sig) {
    if (!Number.isInteger(pid) || pid <= 0 || ticks === null || ticks === undefined || startTicks(pid) !== String(ticks)) return false;
    try { process.kill(pid, sig); return true; } catch { return false; }
}

/**
 * Signals process group `pgid` whose leader was recorded as pid `pgid` with `ticks`.
 * - The leader is still that process and still leads the group: the whole group in one kill(-pgid).
 * - The leader is gone: each remaining member of group `pgid` started no earlier than the leader, one by one through
 *   signalIdentity. A pgid cannot be reused while any member of the group is alive, so those are the group's own.
 * - The leader's pid now names another process: nothing at all (the recorded group is gone and its number reused).
 * Returns the number of signals sent.
 */
export function signalGroupIdentity(pgid, ticks, sig, procRoot = '/proc') {
    if (!Number.isInteger(pgid) || pgid <= 0 || ticks === null || ticks === undefined) return 0;
    const now = startTicks(pgid);
    if (now !== null && now !== String(ticks)) return 0;
    if (now !== null) {
        const fields = statFields(pgid);
        if (fields && Number(fields[2]) === pgid) {
            try { process.kill(-pgid, sig); return 1; } catch { return 0; }
        }
    }
    let sent = 0;
    for (const name of readdirSync(procRoot)) {
        if (!/^\d+$/.test(name)) continue;
        const pid = Number(name);
        const fields = statFields(pid);
        if (!fields || fields[0] === 'Z' || Number(fields[2]) !== pgid || Number(fields[19]) < Number(ticks)) continue;
        if (signalIdentity(pid, fields[19], sig)) sent++;
    }
    return sent;
}
