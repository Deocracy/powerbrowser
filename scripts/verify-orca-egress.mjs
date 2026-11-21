#!/usr/bin/env node
// scripts/verify-orca-egress.mjs
//
// The orca-egress row (audit-fix G5b, packaging-prefs-network-04, D-08). It compares the hosts the
// shipped Orca bundles name with powerbrowser/endpoint-allowlist.json, both ways. The bundles are the
// source; the allowlist is compared to them.
//
// The universe, derived from the built tree:
//   daemon  every host of an http:// or https:// literal in every shipped script or HTML file under
//           orca/out/orcad, recursively: orcad, orcad-server, their worker entries, the staged
//           node_modules, out/cli and out/mobile-web (stage_orca ships all of out/orcad);
//   web     in every script or HTML file under orca/out/web, recursively: the host of each template
//           literal that interpolates into a URL (`https://host/...${...}`, the request and link
//           builders), and of each string in an array of two or more URL strings (origin lists such
//           as the native chat visuals' allowed CDNs). The web client's other plain URL strings are
//           dominated by documentation and agent homepage links and are not derived;
//   hostvar in every shipped script under orca/out: the fallback host of a template whose host is
//           a variable (`https://${x ?? 'host'}/...` or `|| 'host'`);
//   native  every native executable or addon under orca/out/orcad (ELF, Mach-O or PE by magic, never
//           executed): the hosts of http(s) URLs in its printable strings. Rust and Go binaries pack
//           strings without separators, so a host's last label is cut to the longest prefix that is a
//           top-level domain the shipped scripts' URL hosts use (the derived TLD set);
//   base    in every shipped script: the host of a URL string assigned as a base for concatenation
//           (`= 'https://host/path/'`, ending with /), such as a download mirror;
//   const   in orca/src outside tests and fixtures: string values of constants named *HOST*, *ORIGIN*
//           or *DOMAIN* (Orca's own names for host lists) that are host names with a TLD from that set
//           and that a shipped bundle also contains; a *SUFFIX* constant names the domain suffix
//           (.host). Constants named *FAVICON* are excluded: those names are sent as a parameter to
//           the icon service (the www.google.com row), not contacted.
// Names reserved by RFC 2606 and RFC 6761 (example.com/.net/.org and their subdomains, .example,
// .invalid, .test, .localhost) are excluded by that rule.
//
// Clauses:
//  coverage  every universe host has an allowlist row (scripts/lib/endpoint-verdict.mjs entryFor, the
//            one matching rule). A host with no row is red, naming it.
//  shared    a universe host whose row is `allow` (contacted unattended without failing) carries
//            orca_shared (true, or "name-only" when Orca only names the host and sends nothing) and the Orca tag in its reason, so an allow row written for another
//            feature cannot admit Orca's request without saying so. Red names the row.
//  stale     every row whose reason carries the Orca tag, or that sets orca_shared, names a host the
//            shipped bundles (orcad top-level *.js or any out/web *.js) still contain. Red names it.
//  source    a row's orca_source names a file under orca/ that exists, is not a test, fixture,
//            test harness or Markdown file, and holds the row's host in a URL or host string literal on
//            a line that is not a comment; and that literal ships: the cited file is under orca/out, or
//            the literal text (up to any interpolation) appears in a shipped bundle. A cite on a
//            comment, a test harness, a doc table or a literal the bundles do not carry is red.
//  privacy   packaging-prefs-network-03: website-staging/privacy.html marks with data-orca-host exactly
//            the hosts the allowlist derives as Orca's (user-initiated rows whose reason names Orca,
//            plus rows with orca_shared true; a name-only row is not listed), compared as a set both ways, and carries one
//            data-orca-agent-provider paragraph (what an agent reads goes to its AI provider).
//            This clause runs even when orca/ is not built.
//
// Without a built orca/ (no orca/out/orcad/orcad.js) the bundle clauses do not run and the row exits 77
// after one SKIP line (SKIP-PROTOCOL.md); the privacy clause still runs and a failure there exits 1.
// Usage: node scripts/verify-orca-egress.mjs [--self-test]
// --self-test plants each fault in memory (a new bundle host, an untagged allow row, a stale row, a
// moved source) and requires red naming it.

import { closeSync, existsSync, lstatSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, readSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { entryFor } from './lib/endpoint-verdict.mjs';
import { verdictExit } from './lib/skip-verdict.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'orca-egress';
const ALLOWLIST_REL = 'powerbrowser/endpoint-allowlist.json';
const PAGE_REL = 'website-staging/privacy.html';
export const ORCA_TAG = 'packaging-prefs-network-04';

export function reserved(host) {
    return /(^|\.)example\.(com|net|org)$/.test(host) || /\.(example|invalid|test|localhost)$/.test(host) || host === 'localhost';
}

const URL_HOST = /https?:\/\/([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
const HOSTVAR = /`https?:\/\/\$\{[^}`]*?(?:\?\?|\|\|)\s*["'`]((?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,})["'`]/g;
const URL_BASE = /=\s*["'`]https?:\/\/([A-Za-z0-9.-]+\.[A-Za-z]{2,})\/[^"'`\s$]*\/["'`]/g;
const TEMPLATE_HOST = /`https?:\/\/([A-Za-z0-9.-]+\.[A-Za-z]{2,})[^`]*?\$\{/g;
const Q = '["\'`]';
const URL_STR = `${Q}https?:\\/\\/[A-Za-z0-9.-]+\\.[A-Za-z]{2,}[^"'\`]*${Q}`;
const URL_ARRAY = new RegExp(`\\[\\s*${URL_STR}(?:\\s*,\\s*${URL_STR})+\\s*,?\\s*\\]`, 'g');

function jsFiles(dir, recurse) {
    const out = [];
    if (!existsSync(dir)) return out;
    for (const n of readdirSync(dir).sort()) {
        const p = join(dir, n);
        const st = statSync(p);
        if (st.isDirectory()) { if (recurse) out.push(...jsFiles(p, true)); } else if (/\.((c|m)?js|html)$/.test(n)) out.push(p);
    }
    return out;
}

/** The host of every URL in an array of two or more URL strings. */
export function arrayHosts(text) {
    const out = [];
    for (const a of text.matchAll(URL_ARRAY)) for (const m of a[0].matchAll(URL_HOST)) out.push(m[1]);
    return out;
}

/** True when some line naming host is code, not a comment. */
export function namedInCode(text, host) {
    return text.split('\n').some((l) => l.includes(host) && !/^\s*(\/\/|\/\*|\*|#)/.test(l));
}

export const NOT_SHIPPED_SOURCE = /(\.|-)(test|spec)\.[cm]?[jt]sx?$|__tests__|__fixtures__|fixture|test-harness|\.md$/i;

/** The URL or host string literals (quote stripped, cut at an interpolation) naming host on code lines. */
export function hostLiterals(text, host) {
    const esc = host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`["'\`]((?:https?:\\/\\/)?${esc}(?:[/:?#][^"'\`$]*)?)(?:["'\`]|\\$\\{)`, 'g');
    const out = [];
    for (const l of text.split('\n')) {
        if (/^\s*(\/\/|\/\*|\*|#)/.test(l)) continue;
        const code = l.replace(/\s\/\/\s.*$/, '');
        for (const m of code.matchAll(re)) out.push(m[1]);
    }
    return out;
}

/** Printable ASCII runs of at least min bytes in a binary buffer (the `strings` rule, no execution). */
export function printableRuns(buf, min = 6) {
    const out = [];
    let start = -1;
    for (let i = 0; i <= buf.length; i++) {
        const b = i < buf.length ? buf[i] : 0;
        if (b >= 0x20 && b < 0x7f) { if (start < 0) start = i; } else if (start >= 0) { if (i - start >= min) out.push(buf.toString('latin1', start, i)); start = -1; }
    }
    return out;
}

const NATIVE_MAGIC = [Buffer.from([0x7f, 0x45, 0x4c, 0x46]), Buffer.from([0xcf, 0xfa, 0xed, 0xfe]), Buffer.from([0xca, 0xfe, 0xba, 0xbe]), Buffer.from('MZ')];
function isNative(path) {
    const st = statSync(path);
    if (st.size < 64) return false;
    const head = Buffer.alloc(4);
    const fd = openSync(path, 'r');
    try { readSync(fd, head, 0, 4, 0); } finally { closeSync(fd); }
    return NATIVE_MAGIC.some((m) => head.subarray(0, m.length).equals(m));
}

function allFiles(dir) {
    const out = [];
    if (!existsSync(dir)) return out;
    for (const n of readdirSync(dir).sort()) {
        const p = join(dir, n);
        const st = lstatSync(p);
        if (st.isDirectory()) out.push(...allFiles(p)); else if (st.isFile()) out.push(p);
    }
    return out;
}

/** A packed host from a binary, its last label cut to the longest prefix in the TLD set; null if none. */
export function trimHost(raw, tlds) {
    const labels = raw.toLowerCase().split('.');
    const last = labels.pop();
    for (let n = last.length; n >= 2; n--) if (tlds.has(last.slice(0, n))) return [...labels, last.slice(0, n)].join('.');
    return null;
}

/** Host-named constants in orca/src (non-test): Map host -> 'orca/src/...:line'. */
export function sourceConstHosts(orcaDir, tlds) {
    const out = new Map();
    const DECL = /const ([A-Z0-9_]*(?:HOST|ORIGIN|DOMAIN)[A-Z0-9_]*)\b[^=\n]*=\s*/g;
    for (const f of allFiles(join(orcaDir, 'src'))) {
        const rel = f.slice(orcaDir.length + 1);
        if (!/\.tsx?$/.test(f) || NOT_SHIPPED_SOURCE.test(rel) || /node_modules|\.d\.ts$/.test(rel)) continue;
        const t = readFileSync(f, 'utf8');
        for (const m of t.matchAll(DECL)) {
            if (/FAVICON/.test(m[1])) continue;
            const rest = t.slice(m.index + m[0].length);
            const end = rest.search(/\n(?:const|export|function|type|interface|\/\/)/);
            const val = rest.slice(0, end < 0 ? 400 : Math.min(end, 600));
            const line = t.slice(0, m.index).split('\n').length;
            for (const v of val.matchAll(/['"`]([^'"`$]+)['"`]/g)) {
                const h = v[1].replace(/^https?:\/\//, '').replace(/[/:?#].*$/, '').replace(/^\./, '').toLowerCase();
                if (!/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/.test(h) || !tlds.has(h.split('.').pop())) continue;
                const key = /SUFFIX/.test(m[1]) ? `.${h}` : h;
                if (!out.has(key)) out.set(key, `${rel}:${line}`);
            }
        }
    }
    return out;
}

/** { daemon: Map host->file, web: Map host->file, all: text blob } from the built tree. */
export function bundleHosts(orcaDir) {
    const daemon = new Map();
    const web = new Map();
    const texts = [];
    for (const f of jsFiles(join(orcaDir, 'out/orcad'), true)) {
        const t = readFileSync(f, 'utf8');
        texts.push(t);
        for (const m of t.matchAll(URL_HOST)) if (!daemon.has(m[1])) daemon.set(m[1], f.slice(orcaDir.length + 1));
    }
    for (const f of jsFiles(join(orcaDir, 'out/web'), true)) {
        const t = readFileSync(f, 'utf8');
        texts.push(t);
        for (const m of t.matchAll(TEMPLATE_HOST)) if (!web.has(m[1])) web.set(m[1], f.slice(orcaDir.length + 1));
        for (const h of arrayHosts(t)) if (!web.has(h)) web.set(h, f.slice(orcaDir.length + 1));
    }
    const tlds = new Set();
    for (const t of texts) for (const m of t.matchAll(URL_HOST)) tlds.add(m[1].split('.').pop().toLowerCase());
    // hostvar: the fallback host of a template whose host is a variable.
    const hostvar = new Map();
    const files = [...jsFiles(join(orcaDir, 'out/orcad'), true), ...jsFiles(join(orcaDir, 'out/web'), true)];
    files.forEach((f, i) => { for (const m of texts[i].matchAll(HOSTVAR)) if (!hostvar.has(m[1])) hostvar.set(m[1], f.slice(orcaDir.length + 1)); });
    // native: printable strings of every native file under out/orcad.
    const native = new Map();
    for (const f of allFiles(join(orcaDir, 'out/orcad'))) {
        if (/\.((c|m)?js|html|json|map|md|txt|css)$/.test(f) || !isNative(f)) continue;
        const runs = printableRuns(readFileSync(f));
        texts.push(runs.join('\n'));
        for (const r of runs) for (const m of r.matchAll(/https?:\/\/((?:[A-Za-z0-9-]+\.)+[a-z]+)/g)) {
            const h = trimHost(m[1], tlds);
            if (h && !native.has(h)) native.set(h, f.slice(orcaDir.length + 1));
        }
    }
    const contains = (host) => texts.some((t) => t.includes(host));
    // const: host-named constants in the pinned source that a shipped bundle carries.
    const consts = new Map();
    const quoted = (h) => ['"', "'", '`'].some((q) => contains(`${q}${h}${q}`));
    if (existsSync(join(orcaDir, 'src'))) for (const [h, at] of sourceConstHosts(orcaDir, tlds)) if (quoted(h.replace(/^\./, ''))) consts.set(h, at);
    // base: a URL string assigned as a base for concatenation (it ends with /).
    const base = new Map();
    files.forEach((f, i) => { for (const m of texts[i].matchAll(URL_BASE)) if (!base.has(m[1])) base.set(m[1], f.slice(orcaDir.length + 1)); });
    return { daemon, web, hostvar, native, consts, base, tlds, contains };
}

export function drift(allowlist, bundles, orcaDir) {
    const fails = [];
    const hosts = allowlist.hosts;
    const universe = new Map([...(bundles.base ?? []), ...(bundles.consts ?? []), ...(bundles.native ?? []), ...(bundles.hostvar ?? []), ...bundles.web, ...bundles.daemon]);
    for (const [host, file] of [...universe].sort()) {
        if (reserved(host)) continue;
        const row = host.startsWith('.') ? hosts.find((h) => h.host === host) : entryFor(hosts, host);
        if (!row) { fails.push(`coverage: orca/${file} names ${host}, which has no ${ALLOWLIST_REL} row`); continue; }
        if (row.disposition === 'allow' && !((row.orca_shared === true || row.orca_shared === 'name-only') && String(row.reason).includes(ORCA_TAG))) {
            fails.push(`shared: orca/${file} names ${host}, whose row ${row.host} is allow for another feature and does not say it also admits Orca (orca_shared and the ${ORCA_TAG} tag)`);
        }
    }
    for (const row of hosts) {
        const orcaRow = String(row.reason ?? '').includes(ORCA_TAG) || row.orca_shared !== undefined;
        if (orcaRow && !bundles.contains(row.host.replace(/^\./, ''))) fails.push(`stale: the ${row.host} row is an Orca row, but no shipped Orca bundle names that host`);
        if (row.orca_source) {
            const p = join(orcaDir, '..', row.orca_source);
            const bare = row.host.replace(/^\./, '');
            if (!row.orca_source.startsWith('orca/') || !existsSync(p)) fails.push(`source: the ${row.host} row's orca_source ${row.orca_source} does not exist`);
            else if (NOT_SHIPPED_SOURCE.test(row.orca_source)) fails.push(`source: the ${row.host} row cites ${row.orca_source}, a test, fixture or document, which makes no shipped request`);
            else if (!readFileSync(p, 'utf8').includes(bare)) fails.push(`source: ${row.orca_source} no longer contains ${bare} (the ${row.host} row's orca_source)`);
            else if (!namedInCode(readFileSync(p, 'utf8'), bare)) fails.push(`source: ${row.orca_source} names ${bare} only on comment lines (the ${row.host} row's orca_source); cite the code that makes the request`);
            else {
                const lits = hostLiterals(readFileSync(p, 'utf8'), bare);
                if (!lits.length) fails.push(`source: ${row.orca_source} names ${bare} in no URL or host string literal (the ${row.host} row's orca_source)`);
                else if (!row.orca_source.startsWith('orca/out/') && !lits.some((l) => bundles.contains(l))) fails.push(`source: no shipped bundle carries the literal ${lits[0]} that ${row.orca_source} names (the ${row.host} row's orca_source)`);
            }
        }
    }
    return fails;
}

/** The hosts the page must mark: user-initiated rows whose reason names Orca, and orca_shared rows. */
export function orcaPageHosts(allowlist) {
    return new Set(allowlist.hosts.filter((h) => (h.disposition === 'user-initiated' && /\bOrca\b/.test(String(h.reason))) || h.orca_shared === true).map((h) => h.host));
}

export function privacyDrift(allowlist, html) {
    const fails = [];
    const derived = orcaPageHosts(allowlist);
    const page = new Set([...html.matchAll(/data-orca-host="([^"]*)"/g)].map((m) => m[1]));
    for (const h of [...derived].sort()) if (!page.has(h)) fails.push(`privacy: ${PAGE_REL} does not list ${h}, which ${ALLOWLIST_REL} derives as an Orca host`);
    for (const h of [...page].sort()) if (!derived.has(h)) fails.push(`privacy: ${PAGE_REL} lists ${h} as an Orca host, which ${ALLOWLIST_REL} does not derive as one`);
    const n = (html.match(/data-orca-agent-provider/g) ?? []).length;
    if (n !== 1) fails.push(`privacy: ${PAGE_REL} has ${n} data-orca-agent-provider paragraph(s), not one: the page must say that what an agent reads goes to its AI provider`);
    return fails;
}

/** Runs fn on a temp orca-shaped directory holding files ({ rel: text }), then removes it. */
function withFixture(files, fn) {
    const d = mkdtempSync(join(tmpdir(), 'orca-egress-'));
    try {
        for (const [rel, text] of Object.entries(files)) { mkdirSync(dirname(join(d, rel)), { recursive: true }); writeFileSync(join(d, rel), text); }
        return fn(d);
    } finally { rmSync(d, { recursive: true, force: true }); }
}

function selfTest(allowlist, bundles, orcaDir, html) {
    const clone = () => JSON.parse(JSON.stringify(allowlist));
    const plants = [
        { name: 'new daemon host', naming: 'coverage: orca/out/orcad/orcad-server.js names new-egress.pb-selftest.dev', run: () => drift(allowlist, { ...bundles, daemon: new Map([...bundles.daemon, ['new-egress.pb-selftest.dev', 'out/orcad/orcad-server.js']]) }, orcaDir) },
        { name: 'Orca row removed (pre-fix huggingface.co)', naming: 'names huggingface.co, which has no', run: () => { const a = clone(); a.hosts = a.hosts.filter((h) => h.host !== 'huggingface.co'); return drift(a, bundles, orcaDir); } },
        { name: 'allow row silently admits Orca (pre-fix www.google.com)', naming: 'shared: orca/', run: () => { const a = clone(); const r = a.hosts.find((h) => h.host === 'www.google.com'); delete r.orca_shared; r.reason = r.reason.split(ORCA_TAG)[0]; return drift(a, bundles, orcaDir); } },
        { name: 'stale Orca row', naming: 'stale: the gone.pb-selftest.dev row', run: () => { const a = clone(); a.hosts.push({ host: 'gone.pb-selftest.dev', disposition: 'user-initiated', reason: `${ORCA_TAG}: fixture` }); return drift(a, bundles, orcaDir); } },
        { name: 'source moved', naming: 'source: the huggingface.co row', run: () => { const a = clone(); a.hosts.find((h) => h.host === 'huggingface.co').orca_source = 'orca/src/main/speech/no-such-file.ts'; return drift(a, bundles, orcaDir); } },
        { name: 'web builder host', naming: 'coverage: orca/out/web/x.js names web-new.pb-selftest.dev', run: () => drift(allowlist, { ...bundles, web: new Map([...bundles.web, ['web-new.pb-selftest.dev', 'out/web/x.js']]) }, orcaDir) },
        { name: 'cite on a comment line (review: linear.app)', naming: 'only on comment lines', run: () => { const a = clone(); a.hosts.find((h) => h.host === 'linear.app').orca_source = 'orca/src/main/linear/linear-issue-comments.ts'; return drift(a, bundles, orcaDir); } },
        { name: 'host only in a nested bundle (scanned, not hand-fed)', naming: 'names nested-egress.pb-selftest.dev', run: () => withFixture({ 'out/orcad/orcad.js': '//\n', 'out/orcad/node_modules/pkg/lib/deep.js': 'fetch("https://nested-egress.pb-selftest.dev/x")\n' }, (d) => drift(allowlist, bundleHosts(d), orcaDir)) },
        { name: 'host only in a web URL array (review: chat-visual CDNs)', naming: 'names array-b.pb-selftest.dev', run: () => withFixture({ 'out/orcad/orcad.js': '//\n', 'out/web/assets/v.js': 'var o=["https://array-a.pb-selftest.dev","https://array-b.pb-selftest.dev"];\n' }, (d) => drift(allowlist, bundleHosts(d), orcaDir)) },
        { name: 'Linear API row removed (review)', naming: 'names api.linear.app, which has no', run: () => { const a = clone(); a.hosts = a.hosts.filter((h) => h.host !== 'api.linear.app'); return drift(a, bundles, orcaDir); } },
        // Round 3: one plant per new derivation, each scanned from a fixture tree, never hand-fed.
        { name: 'host-variable template fallback (review 5: github.com avatars)', naming: 'names hv.pb-selftest.dev', run: () => withFixture({ 'out/orcad/orcad.js': '//\n', 'out/web/assets/a.js': 'const u=`https://${h??\'hv.pb-selftest.dev\'}/x.png`;\n' }, (d) => drift(allowlist, bundleHosts(d), orcaDir)) },
        { name: 'URL base constant (review 5: npmmirror.com)', naming: 'names base.pb-selftest.dev', run: () => withFixture({ 'out/orcad/orcad.js': '//\n', 'out/web/assets/b.js': 'var m=`https://base.pb-selftest.dev/mirrors/node/`;\n' }, (d) => drift(allowlist, bundleHosts(d), orcaDir)) },
        { name: 'packed host in a native binary (review 5: agent-browser)', naming: 'names native-a.pb-selftest.dev', run: () => withFixture({ 'out/orcad/orcad.js': 'x("https://tld.pb-selftest.dev/")\n', 'out/orcad/tool-linux-x64': Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46]), Buffer.alloc(80), Buffer.from('xxhttps://native-a.pb-selftest.devdeltaStable\0')]) }, (d) => drift(allowlist, bundleHosts(d), orcaDir)) },
        { name: 'bare host constant in the pinned source (review 5: uploads.linear.app)', naming: 'names const.pb-selftest.dev', run: () => withFixture({ 'out/orcad/orcad.js': 'x("https://tld.pb-selftest.dev/");var L="const.pb-selftest.dev";\n', 'src/shared/x.ts': "const UPLOAD_HOST = 'const.pb-selftest.dev'\n" }, (d) => drift(allowlist, bundleHosts(d), orcaDir)) },
        { name: 'cite in a test harness (review 6)', naming: 'a test, fixture or document', run: () => { const a = clone(); a.hosts.find((h) => h.host === 'api.openai.com').orca_source = 'orca/src/main/codex-accounts/runtime-home-service-test-harness.ts'; return drift(a, bundles, orcaDir); } },
        { name: 'cite in a Markdown file (review 6)', naming: 'a test, fixture or document', run: () => { const a = clone(); a.hosts.find((h) => h.host === 'huggingface.co').orca_source = 'orca/README.md'; return drift(a, bundles, orcaDir); } },
        { name: 'cite whose literal does not ship (review 6)', naming: 'no shipped bundle carries the literal', run: () => withFixture({ 'out/orcad/orcad.js': '//\n' }, (d) => drift(allowlist, bundleHosts(d), orcaDir)) },
    ].filter(() => bundles !== null);
    plants.push(
        { name: 'privacy page misses a host (pre-fix)', naming: 'does not list huggingface.co', run: () => privacyDrift(allowlist, html.replace('data-orca-host="huggingface.co"', 'data-x="huggingface.co"')) },
        { name: 'privacy page lists an underived host', naming: 'lists extra.pb-selftest.dev as an Orca host', run: () => privacyDrift(allowlist, `${html}<code data-orca-host="extra.pb-selftest.dev"></code>`) },
        { name: 'provider statement removed (pre-fix)', naming: '0 data-orca-agent-provider', run: () => privacyDrift(allowlist, html.replace('data-orca-agent-provider', '')) },
    );
    let ok = true;
    const base = [...(bundles ? drift(allowlist, bundles, orcaDir) : []), ...privacyDrift(allowlist, html)];
    if (base.length) { console.error(`${NAME}: self-test FAIL -- the real tree is not clean: ${base.join('; ')}`); ok = false; }
    if (!reserved('example.com') || !reserved('a.example.invalid') || reserved('example.dev')) { console.error(`${NAME}: self-test FAIL -- the reserved-name rule is wrong`); ok = false; }
    for (const p of plants) {
        const f = p.run();
        if (!f.some((x) => x.includes(p.naming))) { console.error(`${NAME}: self-test FAIL -- plant '${p.name}' was not red naming '${p.naming}' (got: ${f.join('; ') || 'PASS'})`); ok = false; }
    }
    if (ok) console.log(`${NAME}: self-test PASS -- the real tree is green, ${plants.length} plants each red naming the drift`);
    return ok;
}

const orcaDir = join(REPO_ROOT, 'orca');
const allowlist = JSON.parse(readFileSync(join(REPO_ROOT, ALLOWLIST_REL), 'utf8'));
const html = readFileSync(join(REPO_ROOT, PAGE_REL), 'utf8');
const built = existsSync(join(orcaDir, 'out/orcad/orcad.js'));
const bundles = built ? bundleHosts(orcaDir) : null;
// SKIP-PROTOCOL.md: the privacy clause always runs; without a built orca/ the bundle clauses did not, so the
// row is a SKIP (exit 77) unless something failed.
const skips = built ? [] : ['the bundle clauses did not run: no built orca/. Next step: nix develop .#orca --command bash scripts/build-orca.sh'];
let code;
if (process.argv.includes('--self-test')) {
    const ok = selfTest(allowlist, bundles, orcaDir, html);
    code = ok ? verdictExit(`${NAME} self-test`, [], skips) : 1;
} else {
    const fails = [...(bundles ? drift(allowlist, bundles, orcaDir) : []), ...privacyDrift(allowlist, html)];
    if (fails.length) {
        console.error(`${NAME}: FAIL -- ${fails.length} problem(s)`);
        for (const f of fails) console.error(`  ${f}`);
        console.error(`  Next step: add or correct the named row in ${ALLOWLIST_REL}, citing the Orca source that makes the request, then rerun.`);
    }
    code = verdictExit(NAME, fails, skips);
    if (code === 0) console.log(`${NAME}: PASS -- ${bundles.daemon.size} daemon, ${bundles.web.size} web-builder, ${bundles.hostvar.size} host-variable, ${bundles.base.size} base-URL, ${bundles.native.size} native-binary and ${bundles.consts.size} source-constant host(s) in the shipped Orca tree each have an allowlist row; shared allow rows say so; no stale Orca row; the privacy page lists the ${orcaPageHosts(allowlist).size} derived Orca host(s) and the agent-provider statement`);
}
process.exit(code);
