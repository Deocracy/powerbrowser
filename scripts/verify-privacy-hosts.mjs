#!/usr/bin/env node
// scripts/verify-privacy-hosts.mjs
//
// The privacy-hosts row (Phase 47, WR-02). The privacy page states the hosts the
// browser may contact without a click. That list must equal, as a set, the hosts
// powerbrowser/endpoint-allowlist.json marks allow (may be contacted unattended).
// The allowlist is the source; the page is compared to it, never copied from it.
//
//  1. Derive. The hosts whose disposition is `allow` in the allowlist's hosts array,
//     minus loopback literals. Loopback never leaves the machine, and the page
//     describes that traffic in prose ("a service on this computer").
//  2. Read. Every element in website-staging/privacy.html that carries a
//     data-unattended-host attribute. The attribute marks the host codes, so the
//     error-field list on the same page is never parsed as hosts.
//  3. Compare as sets. A host on one side only is red and named. A page with no
//     marked host is red: an unparseable page proves nothing.
//
// Usage:
//   node scripts/verify-privacy-hosts.mjs
//   node scripts/verify-privacy-hosts.mjs --self-test
//
// Honestly --quick: two text reads. No build, browser, display or network. The
// self-test plants in memory and writes nothing.

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'privacy-hosts';
const ALLOWLIST_REL = 'powerbrowser/endpoint-allowlist.json';
const PAGE_REL = 'website-staging/privacy.html';
const ATTR = 'data-unattended-host';
const ATTR_RE = new RegExp(`${ATTR}="([^"]*)"`, 'g');

export function isLoopback(host) {
    return /^127\.\d+\.\d+\.\d+$/.test(host) || host === '::1';
}

/** The allow-dispositioned hosts, loopback excluded. */
export function derivedHosts(allowlist) {
    return new Set(allowlist.hosts
        .filter(h => h.disposition === 'allow' && !isLoopback(h.host))
        .map(h => h.host));
}

/** The hosts the page marks with the attribute. */
export function pageHosts(html) {
    return new Set([...html.matchAll(ATTR_RE)].map(m => m[1]));
}

/** The failures naming every host on one side only, and the counts compared. */
export function drift(allowlist, html) {
    const want = derivedHosts(allowlist);
    const got = pageHosts(html);
    const failures = [];
    if (got.size === 0) {
        failures.push(`${PAGE_REL} carries no ${ATTR} attribute, so it states no host list to compare. Next step: restore the attribute on each host code in the unattended-hosts list.`);
    }
    for (const host of [...want].filter(h => !got.has(h)).sort()) {
        failures.push(`${host} is allowed unattended in ${ALLOWLIST_REL} but ${PAGE_REL} does not list it. Next step: add it to the unattended-hosts list in ${PAGE_REL}, or correct its disposition in the allowlist.`);
    }
    for (const host of [...got].filter(h => !want.has(h)).sort()) {
        failures.push(`${PAGE_REL} lists ${host} as contacted without a click, but ${ALLOWLIST_REL} does not allow it unattended. Next step: remove it from the list in ${PAGE_REL}, or correct the allowlist disposition.`);
    }
    return { failures, want: want.size, got: got.size };
}

function readAllowlist(root) {
    return JSON.parse(readFileSync(join(root, ALLOWLIST_REL), 'utf8'));
}

function main() {
    const args = process.argv.slice(2);
    for (const a of args) {
        if (a !== '--self-test') {
            console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
            console.error(`  Next step: run: node scripts/verify-privacy-hosts.mjs, or add --self-test.`);
            return 2;
        }
    }
    if (args.includes('--self-test')) return selfTest();
    let allowlist;
    let html;
    try {
        allowlist = readAllowlist(REPO_ROOT);
        html = readFileSync(join(REPO_ROOT, PAGE_REL), 'utf8');
    } catch (e) {
        console.error(`${NAME}: FAIL -- could not read ${ALLOWLIST_REL} or ${PAGE_REL} (${e.code ?? e.message}). Next step: run this from the project root.`);
        return 1;
    }
    const { failures, want, got } = drift(allowlist, html);
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} difference(s) between ${ALLOWLIST_REL} and ${PAGE_REL}`);
        failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- the ${want} unattended host(s) allowed in ${ALLOWLIST_REL} match the ${got} listed in ${PAGE_REL}`);
    return 0;
}

function selfTest() {
    let allowlist;
    try {
        allowlist = readAllowlist(REPO_ROOT);
    } catch (e) {
        console.error(`${NAME}: --self-test FAIL -- could not read ${ALLOWLIST_REL} (${e.code ?? e.message}), so no plant would mean anything`);
        return 1;
    }
    // The fixture page lists exactly the derived hosts, so the baseline is green by
    // construction. Whether the real page agrees today is the row's job, not this
    // self-test's: a self-test that went red on real drift would hide the planted faults.
    const html = [...derivedHosts(allowlist)].sort()
        .map(h => `<code ${ATTR}="${h}">${h}</code>`).join('\n');
    const baseline = drift(allowlist, html);
    if (baseline.failures.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- the fixture page built from the allowlist is not green, so the planted-fault results would mean nothing:`);
        baseline.failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log(`  ok  baseline: a fixture page listing the derived hosts -> green (${baseline.want} host(s))`);

    const EXTRA = 'planted-extra.example.net';
    const firstHost = [...derivedHosts(allowlist)].sort()[0];
    // Each plant edits one value in memory. A page plant that does not change the
    // fixture is itself a failure, because its red would not be plant-caused.
    const withExtra = `${html}\n<code ${ATTR}="${EXTRA}">${EXTRA}</code>`;
    const withoutFirst = html.replace(`${ATTR}="${firstHost}"`, 'data-planted-away=""');
    const withoutAttr = html.replaceAll(`${ATTR}=`, 'data-planted-away=');
    const plants = [
        // [name, page edited?, page text, verdict, host or attribute the red must name]
        ['an extra host on the page', true, withExtra, drift(allowlist, withExtra), EXTRA],
        ['a missing host on the page', true, withoutFirst, drift(allowlist, withoutFirst), firstHost],
        ['an allowlist addition the page does not list', false, html,
            drift({ hosts: [...allowlist.hosts, { host: EXTRA, disposition: 'allow', reason: 'planted' }] }, html), EXTRA],
        ['an allowlist removal the page still lists', false, html,
            drift({ hosts: allowlist.hosts.filter(h => h.host !== firstHost) }, html), firstHost],
        ['a page with no marked host', true, withoutAttr, drift(allowlist, withoutAttr), ATTR],
    ];

    let failed = 0;
    for (const [name, pageEdited, planted, result, must] of plants) {
        if (pageEdited && planted === html) {
            console.error(`${NAME}: --self-test FAIL -- the '${name}' plant did not change the fixture page, so it proves nothing`);
            failed += 1;
        } else if (result.failures.length > 0 && result.failures.some(f => f.includes(must))) {
            console.log(`  ok  ${name} -> red naming ${must}`);
        } else {
            console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red naming ${must}; got: ${result.failures.join(' | ') || '(no failures)'}`);
            failed += 1;
        }
    }
    if (failed > 0) return 1;
    console.log(`${NAME}: --self-test PASS -- the fixture baseline stayed green and ${plants.length} planted faults each went red naming their host or attribute`);
    return 0;
}

process.exit(main());
