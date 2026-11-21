// scripts/lib/proc-tree.mjs
//
// Linux /proc helpers for the orca-slotless-start row (harness-static-structure-09):
//
//   - processTree(rootPids): the root pids and every descendant, read from /proc;
//   - listeningTcp(pids): every TCP socket in LISTEN state that one of those processes holds, from /proc/<pid>/fd and
//     /proc/net/tcp and tcp6, as { pid, address, port }. This is the independent proof of a loopback bind: orcad's own
//     ready line is the subject of the check and cannot vouch for itself;
//   - nonLoopback(listeners): the ones that are not on 127.0.0.0/8 or ::1;
//   - reapPids(pids): SIGTERM then SIGKILL pids that outlived their parent, for a daemon orcad started before it died.
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

/** SIGTERM pids, wait, SIGKILL what is left; returns the pids still alive. */
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
