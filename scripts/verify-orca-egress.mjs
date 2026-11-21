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
//
// SKIP (exit 0, one line) when orca/ is not built (no orca/out/orcad/orcad.js).
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

function selfTest(allowlist, bundles, orcaDir) {
    const clone = () => JSON.parse(JSON.stringify(allowlist));
    const plants = [
        { name: 'new daemon host', naming: 'coverage: orca/out/orcad/orcad-server.js names new-egress.pb-selftest.dev', run: () => drift(allowlist, { ...bundles, daemon: new Map([...bundles.daemon, ['new-egress.pb-selftest.dev', 'out/orcad/orcad-server.js']]) }, orcaDir) },
        { name: 'Orca row removed (pre-fix huggingface.co)', naming: 'names huggingface.co, which has no', run: () => { const a = clone(); a.hosts = a.hosts.filter((h) => h.host !== 'huggingface.co'); return drift(a, bundles, orcaDir); } },
        { name: 'allow row silently admits Orca (pre-fix www.google.com)', naming: 'shared: orca/', run: () => { const a = clone(); const r = a.hosts.find((h) => h.host === 'www.google.com'); delete r.orca_shared; r.reason = r.reason.split(ORCA_TAG)[0]; return drift(a, bundles, orcaDir); } },
        { name: 'stale Orca row', naming: 'stale: the gone.pb-selftest.dev row', run: () => { const a = clone(); a.hosts.push({ host: 'gone.pb-selftest.dev', disposition: 'user-initiated', reason: `${ORCA_TAG}: fixture` }); return drift(a, bundles, orcaDir); } },
        { name: 'source moved', naming: 'source: the huggingface.co row', run: () => { const a = clone(); a.hosts.find((h) => h.host === 'huggingface.co').orca_source = 'orca/src/main/speech/no-such-file.ts'; return drift(a, bundles, orcaDir); } },
        { name: 'web builder host', naming: 'coverage: orca/out/web/x.js names web-new.pb-selftest.dev', run: () => drift(allowlist, { ...bundles, web: new Map([...bundles.web, ['web-new.pb-selftest.dev', 'out/web/x.js']]) }, orcaDir) },
    ];
    let ok = true;
    const base = drift(allowlist, bundles, orcaDir);
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
if (!existsSync(join(orcaDir, 'out/orcad/orcad.js'))) {
    console.log(`${NAME}: SKIP -- no built orca/ (run nix develop .#orca --command bash scripts/build-orca.sh)`);
    process.exit(0);
}
const allowlist = JSON.parse(readFileSync(join(REPO_ROOT, ALLOWLIST_REL), 'utf8'));
const bundles = bundleHosts(orcaDir);
let ok;
if (process.argv.includes('--self-test')) ok = selfTest(allowlist, bundles, orcaDir);
else {
    const fails = drift(allowlist, bundles, orcaDir);
    if (fails.length) {
        console.error(`${NAME}: FAIL -- ${fails.length} problem(s)`);
        for (const f of fails) console.error(`  ${f}`);
        console.error(`  Next step: add or correct the named row in ${ALLOWLIST_REL}, citing the Orca source that makes the request, then rerun.`);
        ok = false;
    } else {
        console.log(`${NAME}: PASS -- ${bundles.daemon.size} daemon and ${bundles.web.size} web-builder host(s) in the shipped Orca bundles each have an allowlist row; shared allow rows say so; no stale Orca row`);
        ok = true;
    }
}
process.exit(ok ? 0 : 1);
