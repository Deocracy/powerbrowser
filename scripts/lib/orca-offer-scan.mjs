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

import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

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
    if (r.blind) reasons.push(`collector blind (control not found${r.unreadable ? ', sink unreadable' : ''})`);
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
