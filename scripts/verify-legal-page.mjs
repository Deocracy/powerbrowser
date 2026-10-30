#!/usr/bin/env node
// scripts/verify-legal-page.mjs
//
// The legal-page-verbatim row (Phase 47, WR-05). The staged legal page states the
// license, the copyright holder and the trademark notice in its own words. Each
// value must appear in website-staging/legal.html verbatim as configuration.toml
// [legal] states it. The values are read through scripts/generate.mjs
// resolveConfig, never by a regex over the TOML.
//
//  1. Derive. config.legal.license, config.legal.copyright_holder and
//     config.legal.trademark_notice, as resolveConfig returns them. The vendor
//     named in the row's title is the [legal] copyright_holder.
//  2. Compare. Each value must be a substring of the page. An absent value names
//     its key. Substring matching cannot tell a copyright_holder that appears only
//     inside the trademark sentence; that limit is recorded in the report, not hidden.
//
// Usage:
//   node scripts/verify-legal-page.mjs
//   node scripts/verify-legal-page.mjs --self-test
//
// Honestly --quick: one manifest resolution and one text read. The self-test plants
// in memory and writes nothing.

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveConfig } from './generate.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'legal-page-verbatim';
const MANIFEST_REL = 'configuration.toml';
const PAGE_REL = 'website-staging/legal.html';
const KEYS = ['license', 'copyright_holder', 'trademark_notice'];

/** The [legal] values, keyed by manifest key. */
export function legalValues(config) {
    const legal = config?.legal ?? {};
    return Object.fromEntries(KEYS.map(k => [k, legal[k]]));
}

/** One failure per key whose value is missing from the manifest or absent from the page. */
export function failuresFor(values, html) {
    const failures = [];
    for (const key of KEYS) {
        const value = values[key];
        if (typeof value !== 'string' || value === '') {
            failures.push(`${MANIFEST_REL} [legal] ${key} is ${JSON.stringify(value)}, so there is no value to compare. Next step: set it in ${MANIFEST_REL}.`);
        } else if (!html.includes(value)) {
            failures.push(`${PAGE_REL} does not carry the ${MANIFEST_REL} [legal] ${key} value ${JSON.stringify(value)} verbatim. Next step: copy the value into ${PAGE_REL} exactly as ${MANIFEST_REL} states it.`);
        }
    }
    return failures;
}

function loadValues(root) {
    const { failures, config } = resolveConfig(join(root, MANIFEST_REL));
    if (failures.length > 0 || config === undefined) {
        throw new Error(`${MANIFEST_REL} does not resolve (${failures.join('; ') || 'no config'}). Next step: run node scripts/generate.mjs -- it reports the faulty key.`);
    }
    return legalValues(config);
}

function main() {
    const args = process.argv.slice(2);
    for (const a of args) {
        if (a !== '--self-test') {
            console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
            console.error('  Next step: run: node scripts/verify-legal-page.mjs, or add --self-test.');
            return 2;
        }
    }
    if (args.includes('--self-test')) return selfTest();
    let values;
    let html;
    try {
        values = loadValues(REPO_ROOT);
        html = readFileSync(join(REPO_ROOT, PAGE_REL), 'utf8');
    } catch (e) {
        console.error(`${NAME}: FAIL -- ${e.message}`);
        return 1;
    }
    const failures = failuresFor(values, html);
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} [legal] value(s) differ from ${PAGE_REL}`);
        failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- the ${KEYS.length} [legal] values of ${MANIFEST_REL} appear verbatim in ${PAGE_REL} (${KEYS.join(', ')})`);
    return 0;
}

function selfTest() {
    let values;
    try {
        values = loadValues(REPO_ROOT);
    } catch (e) {
        console.error(`${NAME}: --self-test FAIL -- ${e.message}`);
        return 1;
    }
    // The fixture carries each real value verbatim on its own line, so the baseline is
    // green by construction; the real page is the row's job, not this self-test's.
    const fixture = [
        `License: ${values.license}`,
        `Copyright holder: ${values.copyright_holder}`,
        values.trademark_notice,
    ].join('\n');
    const baseline = failuresFor(values, fixture);
    if (baseline.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- the fixture is not green, so the planted-fault results would mean nothing:`);
        baseline.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log('  ok  baseline: a fixture carrying each [legal] value verbatim -> green');

    // Each plant edits one value on the page. The edit replaces the value's last character,
    // so the original text is no longer a substring of the page (appending text would not be).
    // An edit that does not change the fixture proves nothing.
    const lastCharEdited = v => `${v.slice(0, -1)}X`;
    const plants = [
        ['an edited license value', values.license, lastCharEdited(values.license), 'license'],
        ['an edited copyright holder', values.copyright_holder, 'Someone Else Holdings', 'copyright_holder'],
        ['an edited trademark notice', values.trademark_notice, lastCharEdited(values.trademark_notice), 'trademark_notice'],
    ];
    let failed = 0;
    for (const [name, from, to, key] of plants) {
        const planted = fixture.replaceAll(from, to);
        if (planted === fixture) {
            console.error(`${NAME}: --self-test FAIL -- the '${name}' plant did not change the fixture, so it proves nothing`);
            failed += 1;
            continue;
        }
        const failures = failuresFor(values, planted);
        if (failures.some(f => f.includes(`[legal] ${key} `))) {
            console.log(`  ok  ${name} -> red naming ${key}`);
        } else {
            console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red naming ${key}; got: ${failures.join(' | ') || '(no failures)'}`);
            failed += 1;
        }
    }
    if (failed > 0) return 1;
    console.log(`${NAME}: --self-test PASS -- the fixture stayed green and ${plants.length} planted edits each went red naming their [legal] key`);
    return 0;
}

process.exit(main());
