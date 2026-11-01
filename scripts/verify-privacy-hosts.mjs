#!/usr/bin/env node
// scripts/verify-privacy-hosts.mjs
//
// The privacy-hosts row (Phase 47, WR-02). The privacy page states two lists of
// hosts, and each must equal, as a set, the hosts powerbrowser/endpoint-allowlist.json
// derives into that group. The allowlist is the source; the page is compared to it,
// never copied from it.
//
//  1. Derive. From the allowlist's hosts array, minus loopback literals:
//       unattended  -- disposition allow and no trigger: contacted without any action.
//       feature     -- disposition allow and trigger "user-feature": contacted only
//                      after the user uses a feature (an AI provider the user
//                      configured, or extension search and install).
//     An allow row with any other trigger value is a failure: it fits neither group.
//     Loopback never leaves the machine, and the page describes that traffic in prose.
//  2. Read. Every element in website-staging/privacy.html that carries
//     data-unattended-host, and every element that carries data-feature-host. The
//     attributes mark the host codes, so the error-field list on the same page is
//     never parsed as hosts.
//  3. Compare as two sets. A host on one side only is red and named, which covers an
//     addition and a removal in either direction. A host listed in the wrong group is
//     red in both groups. A group with no marked host is red: an unparseable page
//     proves nothing.
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
const FEATURE_TRIGGER = 'user-feature';

// One entry per list on the page. `derives` decides membership from an allow row.
const GROUPS = [
    {
        attr: 'data-unattended-host',
        label: 'contacted without any action',
        derives: h => h.trigger === undefined,
    },
    {
        attr: 'data-feature-host',
        label: 'contacted only after a feature is used',
        derives: h => h.trigger === FEATURE_TRIGGER,
    },
];

export function isLoopback(host) {
    return /^127\.\d+\.\d+\.\d+$/.test(host) || host === '::1';
}

/** The allow rows, loopback excluded, as the hosts array holds them. */
function allowRows(allowlist) {
    return allowlist.hosts.filter(h => h.disposition === 'allow' && !isLoopback(h.host));
}

/** The hosts a group derives from the allowlist. */
export function derivedHosts(allowlist, group) {
    return new Set(allowRows(allowlist).filter(group.derives).map(h => h.host));
}

/** The hosts the page marks with a group's attribute. */
export function pageHosts(html, attr) {
    const re = new RegExp(`${attr}="([^"]*)"`, 'g');
    return new Set([...html.matchAll(re)].map(m => m[1]));
}

/** Failures for both groups, the allow rows with an unknown trigger, and the counts. */
export function drift(allowlist, html) {
    const failures = [];
    for (const h of allowRows(allowlist)) {
        if (h.trigger !== undefined && h.trigger !== FEATURE_TRIGGER) {
            failures.push(`${ALLOWLIST_REL} row ${h.host} has trigger ${JSON.stringify(h.trigger)}, which fits neither privacy list. Next step: use "${FEATURE_TRIGGER}" or remove the key.`);
        }
    }
    let wantTotal = 0;
    let gotTotal = 0;
    for (const group of GROUPS) {
        const want = derivedHosts(allowlist, group);
        const got = pageHosts(html, group.attr);
        wantTotal += want.size;
        gotTotal += got.size;
        if (got.size === 0) {
            failures.push(`${PAGE_REL} carries no ${group.attr} attribute, so the list of hosts ${group.label} is not stated. Next step: restore the attribute on each host code in that list.`);
        }
        for (const host of [...want].filter(h => !got.has(h)).sort()) {
            failures.push(`${host} is ${group.label} in ${ALLOWLIST_REL}, but ${PAGE_REL} does not list it under ${group.attr}. Next step: add it to that list in ${PAGE_REL}, or correct its allowlist row.`);
        }
        for (const host of [...got].filter(h => !want.has(h)).sort()) {
            failures.push(`${PAGE_REL} lists ${host} under ${group.attr}, but ${ALLOWLIST_REL} does not place it in the group "${group.label}". Next step: move it to the right list in ${PAGE_REL}, or correct its allowlist row.`);
        }
    }
    return { failures, want: wantTotal, got: gotTotal };
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
    console.log(`${NAME}: PASS -- the ${want} host(s) derived from ${ALLOWLIST_REL} match the ${got} listed in ${PAGE_REL}, in both lists`);
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
    // The fixture page lists exactly the derived hosts in each group, so the baseline is
    // green by construction. Whether the real page agrees today is the row's job, not this
    // self-test's: a self-test that went red on real drift would hide the planted faults.
    const [unattendedGroup, featureGroup] = GROUPS;
    const unattended = [...derivedHosts(allowlist, unattendedGroup)].sort();
    const feature = [...derivedHosts(allowlist, featureGroup)].sort();
    const fixtureLines = (attr, hosts) => hosts.map(h => `<code ${attr}="${h}">${h}</code>`).join('\n');
    const html = `${fixtureLines(unattendedGroup.attr, unattended)}\n${fixtureLines(featureGroup.attr, feature)}`;
    const baseline = drift(allowlist, html);
    if (baseline.failures.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- the fixture page built from the allowlist is not green, so the planted-fault results would mean nothing:`);
        baseline.failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log(`  ok  baseline: a fixture page listing the derived hosts in both groups -> green (${baseline.want} host(s))`);

    const EXTRA_U = 'planted-extra.example.net';
    const EXTRA_F = 'planted-feature.example.net';
    const firstU = unattended[0];
    const firstF = feature[0];
    const withExtraU = `${html}\n<code ${unattendedGroup.attr}="${EXTRA_U}">${EXTRA_U}</code>`;
    const withExtraF = `${html}\n<code ${featureGroup.attr}="${EXTRA_F}">${EXTRA_F}</code>`;
    const withoutU = html.replace(`${unattendedGroup.attr}="${firstU}"`, 'data-planted-away=""');
    const withoutF = html.replace(`${featureGroup.attr}="${firstF}"`, 'data-planted-away=""');
    const wrongGroup = html.replace(`${featureGroup.attr}="${firstF}"`, `${unattendedGroup.attr}="${firstF}"`);
    const noMarkedU = html.replaceAll(`${unattendedGroup.attr}=`, 'data-planted-away=');
    const withRowU = (row) => ({ hosts: [...allowlist.hosts, row] });
    const dropRow = host => ({ hosts: allowlist.hosts.filter(h => h.host !== host) });

    // [name, page edited?, page text, verdict, host or attribute the red must name]
    const plants = [
        ['an extra host on the unattended list', true, withExtraU, drift(allowlist, withExtraU), EXTRA_U],
        ['a missing host on the unattended list', true, withoutU, drift(allowlist, withoutU), firstU],
        ['an unattended allowlist addition the list omits', false, html,
            drift(withRowU({ host: EXTRA_U, disposition: 'allow', reason: 'planted' }), html), EXTRA_U],
        ['an unattended allowlist removal the list still shows', false, html, drift(dropRow(firstU), html), firstU],
        ['an extra host on the feature list', true, withExtraF, drift(allowlist, withExtraF), EXTRA_F],
        ['a missing host on the feature list', true, withoutF, drift(allowlist, withoutF), firstF],
        ['a feature allowlist addition the list omits', false, html,
            drift(withRowU({ host: EXTRA_F, disposition: 'allow', trigger: FEATURE_TRIGGER, reason: 'planted' }), html), EXTRA_F],
        ['a feature allowlist removal the list still shows', false, html, drift(dropRow(firstF), html), firstF],
        ['a feature-triggered host listed in the unattended list', true, wrongGroup, drift(allowlist, wrongGroup), firstF],
        ['an allow row with an unknown trigger', false, html,
            drift({ hosts: allowlist.hosts.map(h => (h.host === firstU ? { ...h, trigger: 'planted-trigger' } : h)) }, html), firstU],
        ['a page with no unattended-marked host', true, noMarkedU, drift(allowlist, noMarkedU), unattendedGroup.attr],
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
    console.log(`${NAME}: --self-test PASS -- the fixture baseline stayed green and ${plants.length} planted faults each went red naming their host, attribute or trigger`);
    return 0;
}

process.exit(main());
