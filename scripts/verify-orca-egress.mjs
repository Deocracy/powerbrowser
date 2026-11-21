#!/usr/bin/env node
// scripts/verify-orca-egress.mjs
//
// The orca-egress row (audit-fix G5b, packaging-prefs-network-04, D-08). It compares the hosts the
// shipped Orca bundles name with powerbrowser/endpoint-allowlist.json, both ways. The bundles are the
// source; the allowlist is compared to them.
//
// The universe, derived from the built tree:
//   daemon  every host of an http:// or https:// literal in the top-level orca/out/orcad/*.js files
//           (orcad, orcad-server and their worker entries: the code orcad runs);
//   web     every host of a template literal in orca/out/web that interpolates into a URL
//           (`https://host/...${...}`): the request and link builders. The web client's plain URL
//           strings are dominated by documentation and agent homepage links and are not derived.
// Names reserved by RFC 2606 and RFC 6761 (example.com/.net/.org and their subdomains, .example,
// .invalid, .test, .localhost) are excluded by that rule.
//
// Clauses:
//  coverage  every universe host has an allowlist row (scripts/lib/endpoint-verdict.mjs entryFor, the
//            one matching rule). A host with no row is red, naming it.
//  shared    a universe host whose row is `allow` (contacted unattended without failing) carries
//            orca_shared: true and the Orca tag in its reason, so an allow row written for another
//            feature cannot admit Orca's request without saying so. Red names the row.
//  stale     every row whose reason carries the Orca tag, or that sets orca_shared, names a host the
//            shipped bundles (orcad top-level *.js or any out/web *.js) still contain. Red names it.
//  source    a row's orca_source names a file under orca/ that exists and contains the row's host.
//  privacy   packaging-prefs-network-03: website-staging/privacy.html marks with data-orca-host exactly
//            the hosts the allowlist derives as Orca's (user-initiated rows whose reason names Orca,
//            plus orca_shared rows), compared as a set both ways, and carries one
//            data-orca-agent-provider paragraph (what an agent reads goes to its AI provider).
//            This clause runs even when orca/ is not built.
//
// The bundle clauses print one SKIP line when orca/ is not built (no orca/out/orcad/orcad.js).
// Usage: node scripts/verify-orca-egress.mjs [--self-test]
// --self-test plants each fault in memory (a new bundle host, an untagged allow row, a stale row, a
// moved source) and requires red naming it.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { entryFor } from './lib/endpoint-verdict.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'orca-egress';
const ALLOWLIST_REL = 'powerbrowser/endpoint-allowlist.json';
const PAGE_REL = 'website-staging/privacy.html';
export const ORCA_TAG = 'packaging-prefs-network-04';

export function reserved(host) {
    return /(^|\.)example\.(com|net|org)$/.test(host) || /\.(example|invalid|test|localhost)$/.test(host) || host === 'localhost';
}

const URL_HOST = /https?:\/\/([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
const TEMPLATE_HOST = /`https?:\/\/([A-Za-z0-9.-]+\.[A-Za-z]{2,})[^`]*?\$\{/g;

function jsFiles(dir, recurse) {
    const out = [];
    if (!existsSync(dir)) return out;
    for (const n of readdirSync(dir).sort()) {
        const p = join(dir, n);
        const st = statSync(p);
        if (st.isDirectory()) { if (recurse) out.push(...jsFiles(p, true)); } else if (/\.(c|m)?js$/.test(n)) out.push(p);
    }
    return out;
}

/** { daemon: Map host->file, web: Map host->file, all: text blob } from the built tree. */
export function bundleHosts(orcaDir) {
    const daemon = new Map();
    const web = new Map();
    const texts = [];
    for (const f of jsFiles(join(orcaDir, 'out/orcad'), false)) {
        const t = readFileSync(f, 'utf8');
        texts.push(t);
        for (const m of t.matchAll(URL_HOST)) if (!daemon.has(m[1])) daemon.set(m[1], f.slice(orcaDir.length + 1));
    }
    for (const f of jsFiles(join(orcaDir, 'out/web'), true)) {
        const t = readFileSync(f, 'utf8');
        texts.push(t);
        for (const m of t.matchAll(TEMPLATE_HOST)) if (!web.has(m[1])) web.set(m[1], f.slice(orcaDir.length + 1));
    }
    return { daemon, web, contains: (host) => texts.some((t) => t.includes(host)) };
}

export function drift(allowlist, bundles, orcaDir) {
    const fails = [];
    const hosts = allowlist.hosts;
    const universe = new Map([...bundles.web, ...bundles.daemon]);
    for (const [host, file] of [...universe].sort()) {
        if (reserved(host)) continue;
        const row = entryFor(hosts, host);
        if (!row) { fails.push(`coverage: orca/${file} names ${host}, which has no ${ALLOWLIST_REL} row`); continue; }
        if (row.disposition === 'allow' && !(row.orca_shared === true && String(row.reason).includes(ORCA_TAG))) {
            fails.push(`shared: orca/${file} names ${host}, whose row ${row.host} is allow for another feature and does not say it also admits Orca (orca_shared and the ${ORCA_TAG} tag)`);
        }
    }
    for (const row of hosts) {
        const orcaRow = String(row.reason ?? '').includes(ORCA_TAG) || row.orca_shared === true;
        if (orcaRow && !bundles.contains(row.host.replace(/^\./, ''))) fails.push(`stale: the ${row.host} row is an Orca row, but no shipped Orca bundle names that host`);
        if (row.orca_source) {
            const p = join(orcaDir, '..', row.orca_source);
            if (!row.orca_source.startsWith('orca/') || !existsSync(p)) fails.push(`source: the ${row.host} row's orca_source ${row.orca_source} does not exist`);
            else if (!readFileSync(p, 'utf8').includes(row.host)) fails.push(`source: ${row.orca_source} no longer contains ${row.host} (the ${row.host} row's orca_source)`);
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

function selfTest(allowlist, bundles, orcaDir, html) {
    const clone = () => JSON.parse(JSON.stringify(allowlist));
    const plants = [
        { name: 'new daemon host', naming: 'coverage: orca/out/orcad/orcad-server.js names new-egress.pb-selftest.dev', run: () => drift(allowlist, { ...bundles, daemon: new Map([...bundles.daemon, ['new-egress.pb-selftest.dev', 'out/orcad/orcad-server.js']]) }, orcaDir) },
        { name: 'Orca row removed (pre-fix huggingface.co)', naming: 'names huggingface.co, which has no', run: () => { const a = clone(); a.hosts = a.hosts.filter((h) => h.host !== 'huggingface.co'); return drift(a, bundles, orcaDir); } },
        { name: 'allow row silently admits Orca (pre-fix www.google.com)', naming: 'shared: orca/', run: () => { const a = clone(); const r = a.hosts.find((h) => h.host === 'www.google.com'); delete r.orca_shared; r.reason = r.reason.split(ORCA_TAG)[0]; return drift(a, bundles, orcaDir); } },
        { name: 'stale Orca row', naming: 'stale: the gone.pb-selftest.dev row', run: () => { const a = clone(); a.hosts.push({ host: 'gone.pb-selftest.dev', disposition: 'user-initiated', reason: `${ORCA_TAG}: fixture` }); return drift(a, bundles, orcaDir); } },
        { name: 'source moved', naming: 'source: the huggingface.co row', run: () => { const a = clone(); a.hosts.find((h) => h.host === 'huggingface.co').orca_source = 'orca/src/main/speech/no-such-file.ts'; return drift(a, bundles, orcaDir); } },
        { name: 'web builder host', naming: 'coverage: orca/out/web/x.js names web-new.pb-selftest.dev', run: () => drift(allowlist, { ...bundles, web: new Map([...bundles.web, ['web-new.pb-selftest.dev', 'out/web/x.js']]) }, orcaDir) },
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
if (!built) console.log(`${NAME}: SKIP -- the bundle clauses: no built orca/ (run nix develop .#orca --command bash scripts/build-orca.sh); the privacy clause runs`);
const bundles = built ? bundleHosts(orcaDir) : null;
let ok;
if (process.argv.includes('--self-test')) ok = selfTest(allowlist, bundles, orcaDir, html);
else {
    const fails = [...(bundles ? drift(allowlist, bundles, orcaDir) : []), ...privacyDrift(allowlist, html)];
    if (fails.length) {
        console.error(`${NAME}: FAIL -- ${fails.length} problem(s)`);
        for (const f of fails) console.error(`  ${f}`);
        console.error(`  Next step: add or correct the named row in ${ALLOWLIST_REL}, citing the Orca source that makes the request, then rerun.`);
        ok = false;
    } else {
        console.log(`${NAME}: PASS -- ${bundles ? `${bundles.daemon.size} daemon and ${bundles.web.size} web-builder host(s) in the shipped Orca bundles each have an allowlist row; shared allow rows say so; no stale Orca row; ` : ''}the privacy page lists the ${orcaPageHosts(allowlist).size} derived Orca host(s) and the agent-provider statement`);
        ok = true;
    }
}
process.exit(ok ? 0 : 1);
