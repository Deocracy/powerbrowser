// scripts/lib/orca-offer-scan.mjs
//
// Phase 65 (TAB-08; P65-23, CA-09): the one offer scanner. Phase 67's RUN-07
// (P67-10) extends this file with its sinks; it never grows a second scanner.
// No CLI: imported by scripts/verify-orca-offer-scan.mjs,
// scripts/verify-orca-relaunch-restore-live.mjs and Phase 67's checks.
//
// Needles come from the hand-off text OrcaService writes to the bridge
// folder's web-pairing file: orcad's web-client URL (C64-5), whose #pairing=
// fragment carries orca://pair?code=<base64url JSON>. The offer is read out
// of it with the rule of Orca's readPairingInputFromLocation (web-pairing.ts),
// a bare offer passing through, and every form Orca's own encoders build is a
// needle (encodePairingOffer in shared/pairing.ts, createWebClientUrl in
// runtime-rpc-pairing-types.ts, decodePairingPayload in web-pairing.ts),
// plus the decoded deviceToken's percent-encoded and base64 forms. A form
// that cannot be derived is an error naming it, never a silent drop.
//
// Sinks are read by bytes. Origin storage is read for its key column only,
// through node:sqlite on a copy: values are not scanned, because Gecko may
// compress them (P67-11). The marker key a live run writes through the page
// is the key probe's positive control: an absence of the runtime-environment
// key counts only in a run that found the marker.
//
// Nothing here prints, logs or writes a needle. Results carry sink names,
// form names, origins and counts.

import { copyFileSync, existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { decodeMozLz4 } from './mozlz4.mjs';
import { isLoopbackEndpoint } from '../../powerbrowser/shell/OrcaEnv.sys.mjs';

/** P65-17: the web client's stored-environment key, which session-only pairing removes. */
export const RUNTIME_ENV_KEY = 'orca.web.runtimeEnvironment.v1';

/**
 * The byte sinks of Phase 65 (P65-23), relative to the profile directory: setups.json in Theia's user storage
 * (THEIA_CONFIG_DIR is <profile>/powerbrowser-theia, TheiaService._resolveConfigDir; SetupsService's setupsUri is
 * UserStorageUri.resolve('setups.json') under it) and ProfileStorageService's shell-state file.
 */
export const SINKS = Object.freeze([
    Object.freeze({ name: 'setups.json', rel: join('powerbrowser-theia', 'setups.json') }),
    Object.freeze({ name: 'powerbrowser-shell-state.json', rel: 'powerbrowser-shell-state.json' }),
]);

const PAIRING_KEYS = ['pairing', 'pair', 'code', 'token'];

const notDerivable = (form, why) => new Error(`needle form not derivable: ${form} (${why})`);

/** readPairingInputFromLocation's rule over a whole text: query keys, then the fragment; a bare offer passes through. */
export function pairingInputOf(text) {
    const trimmed = String(text ?? '').trim();
    let url;
    try { url = new URL(trimmed); } catch { return trimmed || null; }
    for (const key of PAIRING_KEYS) {
        const value = url.searchParams.get(key);
        if (value?.trim()) return value.trim();
    }
    const hash = url.hash.replace(/^#/, '').trim();
    if (!hash) return null;
    if (hash.startsWith('orca://pair')) return hash;
    const params = new URLSearchParams(hash);
    for (const key of PAIRING_KEYS) {
        const value = params.get(key);
        if (value?.trim()) return value.trim();
    }
    return hash;
}

/** The base64url code of a pairing input: an orca://pair URL's code (or fragment), else the input itself. */
function codeOf(input) {
    if (!input.toLowerCase().startsWith('orca://')) return input;
    const url = new URL(input);
    return url.searchParams.get('code') || url.hash.slice(1) || null;
}

/**
 * Named byte needles of one hand-off text: [{ form, bytes }], deduplicated by bytes (the first form keeps a value).
 * Throws "needle form not derivable: <form>" when Orca's rules do not yield a form.
 */
export function needlesFromOffer(handOffText) {
    const text = String(handOffText ?? '').trim();
    if (!text) throw notDerivable('web-client URL', 'empty hand-off text');
    const input = pairingInputOf(text);
    if (!input) throw notDerivable('raw code', 'no pairing input in the hand-off text');
    let code;
    try { code = codeOf(input); } catch { code = null; }
    if (!code) throw notDerivable('raw code', 'the pairing input carries no code');
    let token;
    try {
        token = JSON.parse(Buffer.from(code.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')).deviceToken;
    } catch { token = undefined; }
    if (typeof token !== 'string' || !token) throw notDerivable('device token', 'the code does not decode to a pairing offer with a deviceToken');
    const pairingUrl = `orca://pair?code=${code}`;
    const forms = [
        ['web-client URL', text],
        ['raw code', code],
        ['URL-encoded code', encodeURIComponent(code)],
        ['orca://pair? form', pairingUrl],
        ['URL-encoded pairing URL', encodeURIComponent(pairingUrl)],
        ['#pairing= fragment', `#pairing=${encodeURIComponent(pairingUrl)}`],
        ['device token', token],
        ['percent-encoded token', encodeURIComponent(token)],
        ['base64 token', Buffer.from(token, 'utf8').toString('base64')],
        ['base64url token', Buffer.from(token, 'utf8').toString('base64url')],
    ];
    const seen = new Set();
    const needles = [];
    for (const [form, value] of forms) {
        if (seen.has(value)) continue;
        seen.add(value);
        needles.push({ form, bytes: Buffer.from(value, 'utf8') });
    }
    return needles;
}

/** The byte sinks present in a profile: [{ name, read, bytes }] (bytes null when unreadable). */
export function collectSinks(profileDir) {
    return SINKS.map((sink) => {
        try { return { name: sink.name, read: true, bytes: readFileSync(join(profileDir, sink.rel)) }; } catch { return { name: sink.name, read: false, bytes: null }; }
    });
}

/** How often `needle` occurs in `bytes`. */
function occurrences(bytes, needle) {
    let n = 0;
    for (let at = bytes.indexOf(needle); at !== -1; at = bytes.indexOf(needle, at + needle.length)) n++;
    return n;
}

/**
 * Each 127.0.0.1 origin's localStorage keys, read from storage/default/http+++127.0.0.1+<port>/ls/data.sqlite through
 * node:sqlite on a temporary copy (with its -wal file when present): [{ origin, read, hasMarker, hasRuntimeKey }].
 */
export function readOriginKeys(profileDir, markerKey) {
    const base = join(profileDir, 'storage', 'default');
    const dirs = existsSync(base) ? readdirSync(base).filter((d) => /^https?\+\+\+127\.0\.0\.1(\+\d+)?$/.test(d)) : [];
    const out = [];
    for (const dir of dirs) {
        const origin = dir.replace(/^(https?)\+\+\+/, '$1://').replace(/\+(\d+)$/, ':$1');
        const db = join(base, dir, 'ls', 'data.sqlite');
        if (!existsSync(db)) { out.push({ origin, read: false, hasMarker: false, hasRuntimeKey: false }); continue; }
        const tmp = mkdtempSync(join(tmpdir(), 'orca-offer-scan-ls-'));
        try {
            copyFileSync(db, join(tmp, 'data.sqlite'));
            if (existsSync(`${db}-wal`)) copyFileSync(`${db}-wal`, join(tmp, 'data.sqlite-wal'));
            const conn = new DatabaseSync(join(tmp, 'data.sqlite'));
            let keys;
            try { keys = conn.prepare('SELECT key FROM data').all().map((row) => (typeof row.key === 'string' ? row.key : Buffer.from(row.key ?? '').toString('utf8'))); } finally { conn.close(); }
            out.push({ origin, read: true, hasMarker: !!markerKey && keys.includes(markerKey), hasRuntimeKey: keys.includes(RUNTIME_ENV_KEY) });
        } catch {
            out.push({ origin, read: false, hasMarker: false, hasRuntimeKey: false });
        } finally {
            rmSync(tmp, { recursive: true, force: true });
        }
    }
    return out;
}

/**
 * One scan of a profile against the offers of one or more launches. Returns { sinks: [{ name, read, matches, forms }],
 * origins: [{ origin, read, hasMarker, hasRuntimeKey }], verdicts: [red reason] }; no needle anywhere in it.
 * With markerKey, an origin storage that never shows the marker is red "collector blind".
 */
export function scanProfile({ profileDir, offers, markerKey }) {
    const needles = (offers ?? []).flatMap((offer) => needlesFromOffer(offer));
    if (!needles.length) throw notDerivable('every form', 'no offer given');
    const sinks = collectSinks(profileDir).map(({ name, read, bytes }) => {
        const forms = {};
        let matches = 0;
        if (bytes) {
            for (const { form, bytes: needle } of needles) {
                const n = occurrences(bytes, needle);
                if (n) { forms[form] = (forms[form] ?? 0) + n; matches += n; }
            }
        }
        return { name, read, matches, forms };
    });
    const origins = readOriginKeys(profileDir, markerKey);
    const verdicts = [];
    if (!sinks.some((s) => s.read)) verdicts.push('zero sinks read: no byte sink was readable in the profile, so an absence proves nothing');
    for (const s of sinks.filter((x) => x.matches)) {
        verdicts.push(`offer found in ${s.name} (${s.matches} match${s.matches === 1 ? '' : 'es'}: ${Object.entries(s.forms).map(([f, n]) => `${f} ${n}`).join(', ')})`);
    }
    if (markerKey && !origins.some((o) => o.hasMarker)) verdicts.push(`collector blind: no 127.0.0.1 origin's localStorage holds the marker key (${origins.length} origin(s) read)`);
    for (const o of origins.filter((x) => x.hasRuntimeKey)) verdicts.push(`${RUNTIME_ENV_KEY} present in ${o.origin}'s localStorage`);
    return { sinks, origins, verdicts };
}

/** Output lines for a scan: sink names, counts and origin verdicts only. */
export function formatScan(result) {
    const lines = [];
    for (const s of result.sinks ?? []) lines.push(`sink ${s.name}: ${s.read ? `${s.matches} match(es)` : 'not read'}`);
    for (const o of result.origins ?? []) lines.push(`origin ${o.origin}: ${o.read ? `marker ${o.hasMarker ? 'found' : 'absent'}, ${RUNTIME_ENV_KEY} ${o.hasRuntimeKey ? 'present' : 'absent'}` : 'not read'}`);
    return lines;
}

// ---------------------------------------------------------------------------
// Phase 67 (RUN-07; P67-08, P67-10, P67-11): collectors, one per sink, on the needles above. A collector is
// { sink, control, read }: control(ctx) is true when the sink's harmless marker travelled the same path and was
// found, read(ctx) returns { chunks, faults } (chunks: Buffers or strings scanned for needles; faults: named
// findings that are not a needle, such as a folder mode). runCollector never judges an absence without its
// control: a collector whose control was not found is "collector blind", never green (CLAUDE.md rule 1).

/** Needle occurrences over a list of Buffers or strings. */
export function countMatches(chunks, needles) {
    let n = 0;
    for (const chunk of chunks ?? []) {
        if (chunk === null || chunk === undefined) continue;
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), 'utf8');
        for (const { bytes: needle } of needles) n += occurrences(bytes, needle);
    }
    return n;
}

/** { sink, blind, matches, faults, unreadable }: counts and names only, never a needle or a read value. */
export function runCollector(collector, ctx) {
    let control = false;
    let got = { chunks: [], faults: [] };
    let unreadable = false;
    try { control = collector.control(ctx) === true; } catch { control = false; unreadable = true; }
    try { got = collector.read(ctx) ?? got; } catch { unreadable = true; }
    return { sink: collector.sink, blind: !control, matches: countMatches(got.chunks, ctx.needles ?? []), faults: got.faults ?? [], unreadable };
}

/** One output line per collector result and whether it is red. */
export function collectorLine(r) {
    const reasons = [];
    // An unread sink is never green (harness-static-hosting-03): a read() that threw discarded every needle and
    // fault it was building, so it is red even when the control was found.
    if (r.blind) reasons.push(`collector blind (control not found${r.unreadable ? ', sink unreadable' : ''})`);
    else if (r.unreadable) reasons.push('sink unreadable (the collector could not read the sink, so an absence proves nothing)');
    if (r.matches) reasons.push(`offer found (${r.matches} match${r.matches === 1 ? '' : 'es'})`);
    for (const f of r.faults) reasons.push(f);
    return reasons.length
        ? { red: true, line: `sink ${r.sink}: FAIL -- ${reasons.join('; ')}` }
        : { red: false, line: `sink ${r.sink}: control found, 0 matches` };
}

/** A scratch copy of a SQLite file and its -wal, removed after fn(path, walBytes) returns. */
function withDbCopy(db, fn) {
    const tmp = mkdtempSync(join(tmpdir(), 'orca-offer-scan-db-'));
    try {
        const copy = join(tmp, 'copy.sqlite');
        copyFileSync(db, copy);
        const wal = existsSync(`${db}-wal`) ? readFileSync(`${db}-wal`) : null;
        if (wal) copyFileSync(`${db}-wal`, `${copy}-wal`);
        return fn(copy, wal);
    } finally {
        rmSync(tmp, { recursive: true, force: true });
    }
}

/** places.sqlite's moz_places url and title texts (read through node:sqlite on a copy) and the raw -wal bytes. */
export function readHistory(profileDir) {
    return withDbCopy(join(profileDir, 'places.sqlite'), (copy, wal) => {
        const conn = new DatabaseSync(copy, { readOnly: true });
        let rows;
        try { rows = conn.prepare('SELECT url, title FROM moz_places').all(); } finally { conn.close(); }
        return { texts: rows.flatMap((r) => [r.url, r.title]).filter((x) => typeof x === 'string'), wal };
    });
}

/** History (P67-10): moz_places through node:sqlite plus the raw WAL; control: the marker URL in a moz_places row. */
export const historyCollector = Object.freeze({
    sink: 'history',
    control: (ctx) => !!ctx.marker && readHistory(ctx.profileDir).texts.some((t) => t.includes(ctx.marker)),
    read: (ctx) => { const h = readHistory(ctx.profileDir); return { chunks: [...h.texts, h.wal], faults: [] }; },
});

/** Every regular file under `dir` as [relative path, absolute path], skipping each relative path `skip` accepts. */
function walkFiles(dir, skip = () => false, rel = '') {
    let names;
    try { names = readdirSync(join(dir, rel)); } catch { return []; }
    const out = [];
    for (const name of names) {
        const r = rel ? `${rel}/${name}` : name;
        if (skip(r)) continue;
        let st;
        try { st = lstatSync(join(dir, r)); } catch { continue; }
        if (st.isDirectory()) out.push(...walkFiles(dir, skip, r));
        else if (st.isFile()) out.push([r, join(dir, r)]); // sockets, links and devices are not file content
    }
    return out;
}

const readOrNull = (path) => { try { return readFileSync(path); } catch { return null; } };

/**
 * Holder 5 (P67-08, A-8): orcad's registry file set, derived from the Orca source at the pin under `orcaRoot`:
 * DEVICE_REGISTRY_FILENAME and MOBILE_PAIRING_USERDATA_FILES (mobile-pairing-files.ts), the keypair name
 * (runtime-e2ee-keypair-file.ts), the durable-write temporary (durableWriteTempPath, durable-file-write.ts) and the
 * quarantine copy (corruptCopyPrefix, device-registry-corruption.ts). Returns { registry, keypair, isHolder(rel) };
 * throws "source moved: <file> ..." when a site no longer reads as expected.
 */
export function registryFilesFromPin(orcaRoot) {
    const src = (rel) => {
        const text = readOrNull(join(orcaRoot, rel))?.toString('utf8');
        if (text === undefined) throw new Error(`source moved: ${rel} is absent at the pin`);
        return [rel, text];
    };
    const need = ([rel, text], re, what) => {
        const m = re.exec(text);
        if (!m) throw new Error(`source moved: ${rel} no longer declares ${what}`);
        return m;
    };
    const files = src('src/main/runtime/mobile-pairing-files.ts');
    const registry = need(files, /\bDEVICE_REGISTRY_FILENAME\s*=\s*'([^']+)'/, 'DEVICE_REGISTRY_FILENAME')[1];
    const list = need(files, /\bMOBILE_PAIRING_USERDATA_FILES\s*=\s*\[([^\]]*)\]/, 'MOBILE_PAIRING_USERDATA_FILES')[1];
    if (!/\bDEVICE_REGISTRY_FILENAME\b/.test(list) || !/\bE2EE_KEYPAIR_FILENAME\b/.test(list)) throw new Error('source moved: MOBILE_PAIRING_USERDATA_FILES no longer lists the registry and the keypair');
    const keypair = need(src('src/shared/runtime-e2ee-keypair-file.ts'), /\bE2EE_KEYPAIR_FILENAME\s*=\s*'([^']+)'/, 'E2EE_KEYPAIR_FILENAME')[1];
    const durable = src('src/main/filesystem/durable-file-write.ts');
    const tempTail = need(durable, /function durableWriteTempPath\([^)]*\)[^{]*\{[\s\S]{0,400}?return `\$\{finalPath\}([^`]+)`/, 'durableWriteTempPath')[1];
    const ownerSuffix = need(durable, /\bownerSuffix\s*=\s*owner === undefined \? '' : `([^`]+)`/, 'the durable-write owner suffix')[1];
    const corruptSuffix = need(src('src/main/runtime/device-registry-corruption.ts'), /return `\$\{basename\(registryPath\)\}([^`$]+)`/, 'corruptCopyPrefix')[1];
    // A template literal as a pattern: each ${...} matches one name segment, ${ownerSuffix} its own template or nothing.
    const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const toPattern = (tpl) => tpl.split(/(\$\{[^}]*\})/).map((part) => (part === '${ownerSuffix}' ? `(?:${toPattern(ownerSuffix)})?` : part.startsWith('${') ? '[^/]+?' : esc(part))).join('');
    const temp = new RegExp(`^${esc(registry)}${toPattern(tempTail)}$`);
    const isHolder = (rel) => !rel.includes('/') && (rel === registry || rel === keypair || temp.test(rel) || rel.startsWith(`${registry}${corruptSuffix}`));
    return { registry, keypair, isHolder };
}

/** The decoded offer's endpoint (decodePairingPayload's field), or null. */
export function offerEndpoint(handOffText) {
    try {
        const code = codeOf(pairingInputOf(handOffText));
        const endpoint = JSON.parse(Buffer.from(code.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')).endpoint;
        return typeof endpoint === 'string' ? endpoint : null;
    } catch { return null; }
}

/** True for a /proc/net/tcp or tcp6 local address on loopback (127/8, ::1, ::ffff:127/104). */
export function isLoopbackProcAddress(hex) {
    const h = String(hex).toUpperCase();
    if (h.length === 8) return h.endsWith('7F'); // IPv4 in host byte order: the first octet is the last byte
    if (h === '00000000000000000000000001000000') return true;
    return h.length === 32 && h.startsWith('0000000000000000FFFF0000') && h.endsWith('7F');
}

/**
 * `roots` and every live descendant of them (harness-static-hosting-08), from a ppid walk over <procRoot>/<pid>/stat:
 * the stat line's fourth field, read after the last ')' so a command name holding spaces or parentheses parses.
 */
export function withDescendants(roots, procRoot = '/proc') {
    const children = new Map();
    let entries = [];
    try { entries = readdirSync(procRoot).filter((d) => /^\d+$/.test(d)); } catch { /* no proc tree: the roots only */ }
    for (const d of entries) {
        const stat = readOrNull(join(procRoot, d, 'stat'))?.toString('utf8');
        if (!stat) continue;
        const ppid = Number(stat.slice(stat.lastIndexOf(')') + 1).trim().split(/\s+/)[1]);
        if (!Number.isInteger(ppid)) continue;
        if (!children.has(ppid)) children.set(ppid, []);
        children.get(ppid).push(Number(d));
    }
    const out = new Set();
    const queue = roots.filter((p) => Number.isInteger(p) && p > 0);
    while (queue.length) {
        const pid = queue.shift();
        if (out.has(pid)) continue;
        out.add(pid);
        queue.push(...(children.get(pid) ?? []));
    }
    return [...out];
}

/** LISTEN sockets owned by `pids`: [{ pid, address, loopback }], joining <procRoot>/net/tcp{,6} with each pid's fd inodes. */
export function listenSockets(pids, procRoot = '/proc') {
    const listening = new Map();
    for (const table of ['tcp', 'tcp6']) {
        const text = readOrNull(join(procRoot, 'net', table))?.toString('utf8') ?? '';
        for (const line of text.split('\n').slice(1)) {
            const f = line.trim().split(/\s+/);
            if (f.length > 9 && f[3] === '0A') listening.set(f[9], f[1].split(':')[0]);
        }
    }
    const out = [];
    for (const pid of pids.filter((p) => Number.isInteger(p) && p > 0)) {
        let fds = [];
        try { fds = readdirSync(join(procRoot, String(pid), 'fd')); } catch { continue; }
        for (const fd of fds) {
            let target;
            try { target = readlinkSync(join(procRoot, String(pid), 'fd', fd)); } catch { continue; }
            const inode = /socket:\[(\d+)\]/.exec(target)?.[1];
            if (inode && listening.has(inode)) out.push({ pid, address: listening.get(inode), loopback: isLoopbackProcAddress(listening.get(inode)) });
        }
    }
    return out;
}

const textsOf = (list) => (list ?? []).map((x) => (typeof x === 'string' ? x : x?.text)).filter((x) => typeof x === 'string');

/** sessionstore.jsonlz4 and every file in sessionstore-backups/, mozlz4 files decoded, others as bytes. */
export function readSessionFiles(profileDir) {
    const paths = [join(profileDir, 'sessionstore.jsonlz4'), ...walkFiles(join(profileDir, 'sessionstore-backups')).map(([, abs]) => abs)];
    return paths.map(readOrNull).filter(Boolean).map((b) => (b.subarray(0, 7).toString('latin1') === 'mozLz40' ? decodeMozLz4(b) : b));
}

/** The profile's files minus the Theia origin's storage folder (holder 4) and the data root's registry set (holder 5). */
function profileFiles(ctx) {
    const theia = ctx.theiaOriginDir ? `storage/default/${ctx.theiaOriginDir}` : null;
    const root = ctx.dataRootName ?? 'powerbrowser-orca';
    return walkFiles(ctx.profileDir, (rel) => rel === theia || (rel.startsWith(`${root}/`) && ctx.holder5.isHolder(rel.slice(root.length + 1))));
}

/** Session restore (P67-10): the decoded session files; control: the marker URL in their text. */
export const sessionRestoreCollector = Object.freeze({
    sink: 'session restore',
    control: (ctx) => !!ctx.marker && readSessionFiles(ctx.profileDir).some((b) => b.includes(ctx.marker)),
    read: (ctx) => ({ chunks: readSessionFiles(ctx.profileDir), faults: [] }),
});

/** Setups and shell state (Phase 65's byte sinks); control: every sink read and the saved Setup's name in setups.json. */
export const setupsCollector = Object.freeze({
    sink: 'setups and shell state',
    control: (ctx) => {
        const sinks = collectSinks(ctx.profileDir);
        return !!ctx.setupName && sinks.every((s) => s.read) && sinks.find((s) => s.name === 'setups.json').bytes.includes(ctx.setupName);
    },
    read: (ctx) => ({ chunks: collectSinks(ctx.profileDir).map((s) => s.bytes), faults: [] }),
});

/**
 * Each captured output stream travelled its own path and was read (harness-static-hosting-05): ctx.captures is
 * [{ stream, text, control }], text null when the capture file is absent or unreadable, control a line the stream
 * always carries (null: the file's existence is the control). An empty list, a missing file or a stream without
 * its control leaves the collector blind.
 */
export function capturesControlled(captures) {
    return Array.isArray(captures) && captures.length > 0
        && captures.every((c) => typeof c?.text === 'string' && (!c.control || c.text.includes(c.control)));
}

/**
 * Logs: PB stdout and stderr, the OrcaService and TheiaService log lines, orcad's data root minus holder 5; control:
 * the ready line in the service log texts, and each captured stream's own control (capturesControlled).
 */
export const logsCollector = Object.freeze({
    sink: 'logs',
    control: (ctx) => !!ctx.logControl && textsOf(ctx.logTexts).some((t) => t.includes(ctx.logControl)) && capturesControlled(ctx.captures),
    read: (ctx) => ({ chunks: [...textsOf(ctx.logTexts), ...textsOf(ctx.captures), ...walkFiles(ctx.dataRoot, (rel) => ctx.holder5.isHolder(rel)).map(([, abs]) => readOrNull(abs))], faults: [] }),
});

/** Address field: every Orca tab's and the control web tab's address text; control: the marker in a control text. */
export const addressFieldCollector = Object.freeze({
    sink: 'address field',
    control: (ctx) => !!ctx.marker && (ctx.addressTexts ?? []).some((a) => a.kind === 'control' && String(a.text).includes(ctx.marker)),
    read: (ctx) => ({ chunks: textsOf(ctx.addressTexts), faults: [] }),
});

/** Copyable text: the diagnostics rows and log as Copy diagnostics joins them, and each Orca tab's address copy; control: the Orca port row. */
export const copyableTextCollector = Object.freeze({
    sink: 'copyable text',
    control: (ctx) => (ctx.copyable?.rows ?? []).some((r) => /^Orca port: \d+$/.test(r)),
    read: (ctx) => ({ chunks: [[...(ctx.copyable?.rows ?? []), ctx.copyable?.log ?? ''].join('\n'), ...textsOf(ctx.copyable?.tabAddresses)], faults: [] }),
});

/** Whole profile: a byte scan of every file but holders 4 and 5; control: the marker URL bytes in places.sqlite or its WAL. */
export const wholeProfileCollector = Object.freeze({
    sink: 'whole profile',
    control: (ctx) => !!ctx.marker && ['places.sqlite', 'places.sqlite-wal'].some((f) => readOrNull(join(ctx.profileDir, f))?.includes(ctx.marker)),
    read: (ctx) => ({ chunks: profileFiles(ctx).map(([, abs]) => readOrNull(abs)), faults: [] }),
});

/** Bridge folder: 0700 folder and 0600 files owned by this user, no needle outside the offer file; control: the offer found in it. */
export const bridgeFolderCollector = Object.freeze({
    sink: 'bridge folder',
    control: (ctx) => {
        const bytes = ctx.bridgeDir ? readOrNull(join(ctx.bridgeDir, ctx.offerFile ?? 'web-pairing')) : null;
        return !!bytes && countMatches([bytes], ctx.needles) > 0;
    },
    read: (ctx) => {
        const uid = process.getuid?.();
        const offerFile = ctx.offerFile ?? 'web-pairing';
        const st = lstatSync(ctx.bridgeDir);
        let badModes = st.isDirectory() && (st.mode & 0o777) === 0o700 && st.uid === uid ? 0 : 1;
        const strays = [];
        // harness-static-hosting-03: an entry that vanishes between readdir and lstat, or a stray this user cannot
        // read (0200 passes the mode test), is a named fault; it never throws away the faults already found.
        let unreadEntries = 0;
        for (const name of readdirSync(ctx.bridgeDir)) {
            let f;
            try { f = lstatSync(join(ctx.bridgeDir, name)); } catch { unreadEntries++; continue; }
            // The offer file exactly 0600; every other entry a private regular file (Phase 63's claude-wrapper launcher
            // is 0700 because it is executed): owned by this user, no group or other bits.
            const mode = f.mode & 0o777;
            if (!(f.isFile() && f.uid === uid && (name === offerFile ? mode === 0o600 : (mode & 0o077) === 0))) badModes++;
            if (name !== offerFile && f.isFile()) {
                try { strays.push(readFileSync(join(ctx.bridgeDir, name))); } catch { unreadEntries++; }
            }
        }
        const strayHits = strays.filter((b) => countMatches([b], ctx.needles) > 0).length;
        const faults = [];
        if (badModes) faults.push(`bridge folder mode (${badModes} entr${badModes === 1 ? 'y is' : 'ies are'} not 0700/0600 or not owned by this user)`);
        if (strayHits) faults.push(`stray copy (${strayHits} file${strayHits === 1 ? '' : 's'} other than ${offerFile} hold${strayHits === 1 ? 's' : ''} a needle)`);
        if (unreadEntries) faults.push(`bridge folder entry unreadable (${unreadEntries} entr${unreadEntries === 1 ? 'y' : 'ies'} could not be listed or read, so a copy in ${unreadEntries === 1 ? 'it' : 'them'} is not ruled out)`);
        return { chunks: strays, faults };
    },
});

/**
 * Non-loopback peer: the decoded endpoint is ws://127.0.0.1:<orca port>, and every LISTEN socket of orcad, the terminal
 * daemon, the Theia backend and every descendant of them (plugin hosts, helpers) is on loopback; control: one orcad
 * LISTEN row. ctx.pids.orcad lists orcad and its terminal daemon.
 */
export const nonLoopbackPeerCollector = Object.freeze({
    sink: 'non-loopback peer',
    control: (ctx) => listenSockets(ctx.pids?.orcad ?? [], ctx.procRoot).length > 0,
    read: (ctx) => {
        const faults = [];
        if (!isLoopbackEndpoint(ctx.endpoint, ctx.orcaPort)) faults.push('non-loopback peer: the decoded endpoint is not ws://127.0.0.1:<orca port>');
        const scanned = withDescendants([...(ctx.pids?.orcad ?? []), ...(ctx.pids?.theia ?? [])], ctx.procRoot ?? '/proc');
        const off = listenSockets(scanned, ctx.procRoot).filter((s) => !s.loopback).length;
        if (off) faults.push(`non-loopback peer: ${off} listening socket(s) off loopback`);
        return { chunks: [], faults };
    },
});

/** Every Phase 67 collector, in output order. */
export const COLLECTORS = Object.freeze([
    historyCollector, sessionRestoreCollector, setupsCollector, logsCollector, addressFieldCollector,
    copyableTextCollector, wholeProfileCollector, bridgeFolderCollector, nonLoopbackPeerCollector,
]);
