// scripts/lib/proc-tree.mjs
//
// Linux /proc helpers for the orca-slotless-start row (harness-static-structure-09):
//
//   - processTree(rootPids): the root pids and every descendant, read from /proc;
//   - listeningTcp(pids): every TCP socket in LISTEN state that one of those processes holds, from /proc/<pid>/fd and
//     /proc/net/tcp and tcp6, as { pid, address, port }. This is the independent proof of a loopback bind: orcad's own
//     ready line is the subject of the check and cannot vouch for itself;
//   - nonLoopback(listeners): the ones that are not on 127.0.0.0/8 or ::1;
//   - process identities ({ pid, start time }): scanMarked, startSampler, signalIdentity and reapIdentities find the processes a row started
//     by an environment marker, even after their parent is gone, and signal one only after re-checking its start time. reapPids signals by
//     pid alone and is kept only for callers that hold a live child.
//
// The parsers are pure and exported so a self-test can feed them fixture text. No top-level side effects.

import { existsSync, readFileSync, readdirSync, readlinkSync } from 'node:fs';

/** pid -> ppid for every process now in /proc. */
export function ppidMap() {
    const map = new Map();
    for (const name of readdirSync('/proc')) {
        if (!/^\d+$/.test(name)) continue;
        try {
            const stat = readFileSync(`/proc/${name}/stat`, 'utf8');
            map.set(Number(name), Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]));
        } catch { /* the process exited */ }
    }
    return map;
}

/** rootPids plus every descendant, now. */
export function processTree(rootPids, map = ppidMap()) {
    const kids = new Map();
    for (const [pid, ppid] of map) {
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

/** The address text of one /proc/net/tcp or tcp6 hex address. IPv4: 4 hex bytes little-endian; IPv6: four little-endian words. */
export function decodeAddress(hex) {
    if (/^[0-9A-Fa-f]{8}$/.test(hex)) return [3, 2, 1, 0].map((i) => parseInt(hex.slice(i * 2, i * 2 + 2), 16)).join('.');
    if (!/^[0-9A-Fa-f]{32}$/.test(hex)) return `unparsed:${hex}`;
    const bytes = [];
    for (let w = 0; w < 4; w++) for (const i of [3, 2, 1, 0]) bytes.push(parseInt(hex.slice(w * 8 + i * 2, w * 8 + i * 2 + 2), 16));
    const groups = [];
    for (let g = 0; g < 8; g++) groups.push(((bytes[g * 2] << 8) | bytes[g * 2 + 1]).toString(16));
    if (groups.slice(0, 5).every((x) => x === '0') && groups[5] === 'ffff') return `::ffff:${bytes.slice(12).join('.')}`;
    if (groups.slice(0, 7).every((x) => x === '0')) return groups[7] === '1' ? '::1' : groups[7] === '0' ? '::' : `::${groups[7]}`;
    return groups.join(':');
}

/** Pure: the LISTEN rows of one /proc/net/tcp or tcp6 text, as { address, port, inode }. */
export function parseListening(text) {
    const out = [];
    for (const line of text.split('\n').slice(1)) {
        const f = line.trim().split(/\s+/);
        if (f.length < 10 || f[3] !== '0A') continue;
        const [addr, port] = f[1].split(':');
        out.push({ address: decodeAddress(addr), port: parseInt(port, 16), inode: f[9] });
    }
    return out;
}

/** Pure: is this a loopback address (127.0.0.0/8, ::1, or an IPv4-mapped 127.x)? */
export function isLoopback(address) {
    if (address === '::1') return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(address);
    const v4 = mapped ? mapped[1] : address;
    return /^127\.\d+\.\d+\.\d+$/.test(v4);
}

/** The socket inodes a process holds open. */
function socketInodes(pid) {
    const inodes = new Set();
    let fds = [];
    try { fds = readdirSync(`/proc/${pid}/fd`); } catch { return inodes; }
    for (const fd of fds) {
        try {
            const m = /^socket:\[(\d+)\]$/.exec(readlinkSync(`/proc/${pid}/fd/${fd}`));
            if (m) inodes.add(m[1]);
        } catch { /* closed meanwhile */ }
    }
    return inodes;
}

/** Every TCP LISTEN socket held by one of pids, as { pid, address, port }. */
export function listeningTcp(pids) {
    const table = new Map();
    for (const f of ['/proc/net/tcp', '/proc/net/tcp6']) {
        if (!existsSync(f)) continue;
        for (const row of parseListening(readFileSync(f, 'utf8'))) table.set(row.inode, row);
    }
    const out = [];
    for (const pid of pids) {
        for (const inode of socketInodes(pid)) {
            const row = table.get(inode);
            if (row) out.push({ pid, address: row.address, port: row.port });
        }
    }
    return out;
}

/** Pure: the listeners that are not loopback. */
export const nonLoopback = (listeners) => listeners.filter((l) => !isLoopback(l.address));

const alive = (pid) => {
    if (!existsSync(`/proc/${pid}`)) return false;
    try {
        const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
        return !stat.slice(stat.lastIndexOf(')') + 2).startsWith('Z');
    } catch { return false; }
};

/** SIGTERM pids, wait, SIGKILL what is left; returns the pids still alive. By pid alone: use identities for anything that outlives its parent. */
export async function reapPids(pids, { graceMs = 3000 } = {}) {
    const mine = [...pids].filter((p) => Number.isInteger(p) && p > 1 && p !== process.pid);
    for (const p of mine) { try { process.kill(p, 'SIGTERM'); } catch { /* gone */ } }
    const until = Date.now() + graceMs;
    while (Date.now() < until && mine.some(alive)) await new Promise((r) => setTimeout(r, 100));
    for (const p of mine.filter(alive)) { try { process.kill(p, 'SIGKILL'); } catch { /* gone */ } }
    const settle = Date.now() + 2000;
    while (Date.now() < settle && mine.some(alive)) await new Promise((r) => setTimeout(r, 100));
    return mine.filter(alive);
}

export { alive as pidAlive };

// ---- process identities (harness-static-structure-09) ----------------------------------------------------------------
//
// A pid alone names whichever process holds it now. A daemon that outlives its parent is reparented, so a tree walk after the
// parent is gone does not find it, and its pid can be reused during a teardown window. The row therefore (1) marks every process
// it starts with an environment variable that children inherit (the terminal daemon is spawned from process.env), (2) records
// each marked process as an identity { pid, startTicks } while it runs, and (3) re-checks the start time before every signal.

/** The kernel start time of a pid (field 22 of /proc/<pid>/stat, in clock ticks since boot), or null. */
export function startTicks(pid) {
    try {
        const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
        return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19] ?? null;
    } catch { return null; }
}

/** Is this identity still the same live process (same pid, same start time, not a zombie)? */
export const sameProcess = (id) => alive(id.pid) && startTicks(id.pid) === id.startTicks;

/** The identities of every process of this user whose environment carries NAME=value. */
export function scanMarked(name, value) {
    const needle = `${name}=${value}`;
    const out = [];
    let names = [];
    try { names = readdirSync('/proc'); } catch { return out; }
    for (const n of names) {
        if (!/^\d+$/.test(n)) continue;
        let env;
        try { env = readFileSync(`/proc/${n}/environ`, 'latin1'); } catch { continue; }
        if (env.split('\0').includes(needle)) {
            const t = startTicks(n);
            if (t !== null) out.push({ pid: Number(n), startTicks: t });
        }
    }
    return out;
}

/** Records marked processes (and their descendants, as they appear) every intervalMs until finish(), which returns every identity seen. */
export function startSampler(name, value, { intervalMs = 50 } = {}) {
    const seen = new Map();
    const note = (id) => { if (!seen.has(`${id.pid}:${id.startTicks}`)) seen.set(`${id.pid}:${id.startTicks}`, id); };
    const sample = () => {
        const marked = scanMarked(name, value);
        marked.forEach(note);
        if (marked.length) for (const pid of processTree(marked.map((m) => m.pid))) { const t = startTicks(pid); if (t !== null) note({ pid, startTicks: t }); }
    };
    const timer = setInterval(sample, intervalMs);
    timer.unref();
    sample();
    return { finish: () => { clearInterval(timer); sample(); return [...seen.values()]; } };
}

/** SIGTERM an identity if, and only if, it is still the same process. Returns whether a signal was sent. */
export function signalIdentity(id, sig) {
    if (!sameProcess(id)) return false;
    try { process.kill(id.pid, sig); return true; } catch { return false; }
}

/** SIGTERM identities, wait up to graceMs, SIGKILL the survivors (each time only if it is still the same process); returns the identities still alive. */
export async function reapIdentities(ids, { graceMs = 3000 } = {}) {
    const mine = ids.filter((i) => i.pid > 1 && i.pid !== process.pid);
    for (const i of mine) signalIdentity(i, 'SIGTERM');
    const until = Date.now() + graceMs;
    while (Date.now() < until && mine.some(sameProcess)) await new Promise((r) => setTimeout(r, 100));
    for (const i of mine) signalIdentity(i, 'SIGKILL');
    const settle = Date.now() + 2000;
    while (Date.now() < settle && mine.some(sameProcess)) await new Promise((r) => setTimeout(r, 100));
    return mine.filter(sameProcess);
}
