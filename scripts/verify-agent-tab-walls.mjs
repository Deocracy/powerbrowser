#!/usr/bin/env node
// scripts/verify-agent-tab-walls.mjs
//
// agent-tab-walls (v1.7 audit-fix lane G1a-chrome-shell): the chrome shell's agent-tab and page-menu fixes, each as a
// clause that reads the shipped tree and goes red when its fix is undone. Where a clause needs behaviour it runs the
// SHIPPED chrome source over the stub boundary verify-orca-browser-tab-scope.mjs already builds (its sliceSource and
// makeWorld), never a copy of the rules.
//
// Clauses (audit item in brackets):
//  scroll        [59-WR-02]  every scrollIntoView call in GroupActorChild.sys.mjs passes behavior "instant".
//
// Tier: quick (text reads and node:vm). --self-test plants each pre-fix fault in an in-memory copy of the tree and
// requires the clause to go red naming it.
//
// Usage:
//   node scripts/verify-agent-tab-walls.mjs
//   node scripts/verify-agent-tab-walls.mjs --self-test

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'agent-tab-walls';
const FILES = {
    api: 'powerbrowser/shell/PowerBrowserAPI.sys.mjs',
    child: 'powerbrowser/shell/GroupActorChild.sys.mjs',
};

function stripComments(text) {
    return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'`\\])\/\/.*$/gm, '$1');
}

/** The argument text of every `<name>(` call in code, balanced on parentheses. */
function callArgs(code, name) {
    const out = [];
    const re = new RegExp(`\\.${name}\\(`, 'g');
    for (let m = re.exec(code); m; m = re.exec(code)) {
        let depth = 1;
        let i = m.index + m[0].length;
        const start = i;
        for (; i < code.length && depth > 0; i += 1) {
            if (code[i] === '(') depth += 1;
            if (code[i] === ')') depth -= 1;
        }
        out.push(code.slice(start, i - 1));
    }
    return out;
}

// ---------------------------------------------------------------------------
// Clauses. Each takes the texts and returns failure strings.

function scrollClause(texts) {
    const calls = callArgs(stripComments(texts.child), 'scrollIntoView');
    if (!calls.length) {
        return [`scroll: broken instrument: no scrollIntoView call found in ${FILES.child}`];
    }
    return calls.filter(args => !/\bbehavior:\s*"instant"/.test(args))
        .map(args => `scroll: scrollIntoView(${args.trim()}) in ${FILES.child} lacks behavior "instant", so a page with scroll-behavior: smooth reads the box before the scroll lands (59-WR-02)`);
}

const CLAUSES = [scrollClause];

export async function checkTexts(texts) {
    const failures = [];
    for (const clause of CLAUSES) {
        try {
            failures.push(...await clause(texts));
        } catch (err) {
            failures.push(`${clause.name}: broken instrument: threw ${err && err.message}`);
        }
    }
    return failures;
}

function readTree() {
    return Object.fromEntries(Object.entries(FILES).map(([key, path]) => [key, readFileSync(join(REPO_ROOT, path), 'utf8')]));
}

// ---------------------------------------------------------------------------
// Self-test: each plant reverts one fix in memory; its clause must go red naming the drift.

function replaceOnce(text, from, to, what) {
    const at = text.indexOf(from);
    if (at === -1) throw new Error(`plant anchor not found: ${what}`);
    return text.slice(0, at) + to + text.slice(at + from.length);
}

const PLANTS = [
    {
        name: '59-WR-02: agentCentre scrolls with the default behavior',
        plant: t => ({ ...t, child: replaceOnce(t.child, 'element.scrollIntoView({ block: "center", inline: "center", behavior: "instant" })', 'element.scrollIntoView({ block: "center", inline: "center" })', 'agentCentre scroll') }),
        expect: 'lacks behavior "instant"',
    },
    {
        name: '59-WR-02: the browser.scrollIntoView row scrolls with the default behavior',
        plant: t => ({ ...t, child: replaceOnce(t.child, '.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });\n    return', '.scrollIntoView({ block: "center", inline: "center" });\n    return', 'scrollIntoView row') }),
        expect: 'lacks behavior "instant"',
    },
];

async function selfTest() {
    const tree = readTree();
    const green = await checkTexts(tree);
    if (green.length) {
        console.error(`${NAME} self-test: FAIL -- the unplanted tree is not green: ${green.join(' | ')}`);
        return 1;
    }
    let failed = 0;
    for (const { name, plant, expect } of PLANTS) {
        let failures;
        try {
            failures = await checkTexts(plant(tree));
        } catch (err) {
            console.error(`${NAME} self-test: FAIL -- '${name}' could not be planted (${err.message})`);
            failed += 1;
            continue;
        }
        if (failures.some(f => f.includes(expect))) {
            console.log(`  red as required: ${name}`);
        } else {
            console.error(`${NAME} self-test: FAIL -- '${name}' did not go red naming '${expect}'; got: ${failures.join(' | ') || '(green)'}`);
            failed += 1;
        }
    }
    if (failed) return 1;
    console.log(`${NAME} self-test: PASS -- ${PLANTS.length} planted faults each went red naming the drift`);
    return 0;
}

async function main() {
    if (process.argv.includes('--self-test')) return selfTest();
    const failures = await checkTexts(readTree());
    if (failures.length) {
        console.error(`${NAME}: FAIL -- an agent-tab or page-menu wall is undone:`);
        failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- ${CLAUSES.length} clauses hold (${CLAUSES.map(c => c.name.replace(/Clause$/, '')).join(', ')})`);
    return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    process.exit(await main());
}
