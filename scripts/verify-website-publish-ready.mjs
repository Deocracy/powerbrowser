#!/usr/bin/env node
// scripts/verify-website-publish-ready.mjs
//
// The website-publish-ready row (Phase 47, WR-04). The staged site pages in
// website-staging/ carry deliberate placeholders until publication: a postal
// address reads OWNER TO FILL, and a block is marked class="pending". This row
// is red while any page carries either marker. It is a FULL-tier row, not --quick,
// because the placeholders are intentional until the owner fills them. It must be
// green before the website push (docs/RELEASING.md).
//
//  1. Read every *.html page directly in website-staging/. Zero pages is red: an
//     absent site proves nothing.
//  2. A page is red for each line carrying OWNER TO FILL or the literal attribute
//     class="pending", naming the file and the line. A CSS selector such as
//     .pending { ... } is not the attribute and is not flagged.
//
// Usage:
//   node scripts/verify-website-publish-ready.mjs
//   node scripts/verify-website-publish-ready.mjs --self-test
//
// The self-test plants in memory and writes nothing.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'website-publish-ready';
const SITE_REL = 'website-staging';
const MARKERS = ['OWNER TO FILL', 'class="pending"'];

/** One finding per marker occurrence, with the file name and line number. */
export function placeholders(pages) {
    const found = [];
    for (const [name, text] of Object.entries(pages)) {
        text.split('\n').forEach((line, i) => {
            for (const marker of MARKERS) {
                if (line.includes(marker)) found.push({ name, line: i + 1, marker });
            }
        });
    }
    return found;
}

/** The failure lines for a {fileName: text} map of staged pages. */
export function failuresFor(pages) {
    if (Object.keys(pages).length === 0) {
        return [`${SITE_REL}/ holds no .html page, so nothing can be proven publish-ready. Next step: stage the site pages in ${SITE_REL}/.`];
    }
    return placeholders(pages).map(({ name, line, marker }) =>
        `${SITE_REL}/${name}:${line} carries '${marker}', a placeholder for the owner to fill. Next step: fill it with the real value and remove the marker before the website push.`);
}

function readPages(root) {
    const pages = {};
    for (const entry of readdirSync(join(root, SITE_REL)).filter(f => f.endsWith('.html')).sort()) {
        pages[entry] = readFileSync(join(root, SITE_REL, entry), 'utf8');
    }
    return pages;
}

function main() {
    const args = process.argv.slice(2);
    for (const a of args) {
        if (a !== '--self-test') {
            console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
            console.error('  Next step: run: node scripts/verify-website-publish-ready.mjs, or add --self-test.');
            return 2;
        }
    }
    if (args.includes('--self-test')) return selfTest();
    let pages;
    try {
        pages = readPages(REPO_ROOT);
    } catch (e) {
        console.error(`${NAME}: FAIL -- could not read ${SITE_REL}/ (${e.code ?? e.message}). Next step: run this from the project root.`);
        return 1;
    }
    const failures = failuresFor(pages);
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} placeholder(s) remain in ${SITE_REL}/ (the website push must wait for them)`);
        failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- ${Object.keys(pages).length} staged page(s) in ${SITE_REL}/ carry no placeholder marker`);
    return 0;
}

function selfTest() {
    // The clean fixture carries a CSS .pending selector on purpose: it must stay green.
    const clean = {
        'index.html': '<style>.pending { color: #fbfbfe; }</style>\n<p>Real text.</p>',
        'legal.html': '<p>Real text.</p>',
    };
    const plants = [
        ['an OWNER TO FILL placeholder', { ...clean, 'privacy.html': '<p>Postal address: [OWNER TO FILL BEFORE PUBLICATION]</p>' }, 'privacy.html', 'OWNER TO FILL'],
        ['a class="pending" block', { ...clean, 'download.html': '<p class="pending">Pending.</p>' }, 'download.html', 'class="pending"'],
        ['no staged page at all', {}, 'holds no .html page', 'holds no .html page'],
    ];

    const baseline = failuresFor(clean);
    if (baseline.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- the clean fixture is not green, so the planted-fault results would mean nothing:`);
        baseline.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log(`  ok  baseline: a clean fixture, with a CSS .pending selector, -> green`);

    let failed = 0;
    for (const [name, pages, must, token] of plants) {
        const failures = failuresFor(pages);
        if (failures.some(f => f.includes(must) && f.includes(token))) {
            console.log(`  ok  ${name} -> red naming ${must}`);
        } else {
            console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red naming ${must}; got: ${failures.join(' | ') || '(no failures)'}`);
            failed += 1;
        }
    }
    if (failed > 0) return 1;
    console.log(`${NAME}: --self-test PASS -- the clean fixture stayed green and ${plants.length} planted faults each went red naming their file or marker`);
    return 0;
}

process.exit(main());
