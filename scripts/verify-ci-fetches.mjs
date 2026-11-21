#!/usr/bin/env node
// scripts/verify-ci-fetches.mjs
//
// Hosted CI must fetch every pinned third-party checkout before it runs the --quick table (audit harness-driver-03).
// The quick rows that derive their expectation from such a tree SKIP those clauses when it is absent, so a CI table
// without the fetch is green without asserting them. The set of checkouts is derived from the tree: every
// scripts/fetch-<name>.sh. .github/workflows/verify.yml must run each one in a step (not a comment) before the step
// that runs scripts/verify-platform.sh --quick.
//
//   node scripts/verify-ci-fetches.mjs
//   node scripts/verify-ci-fetches.mjs --self-test

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const NAME = 'ci-fetches';
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOW = '.github/workflows/verify.yml';
const TABLE = /scripts\/verify-platform\.sh\s+--quick\b/;

/** Every scripts/fetch-<name>.sh in the tree, sorted. */
export function fetchScripts(names) {
    return names.filter((n) => /^fetch-[a-z0-9-]+\.sh$/.test(n)).map((n) => `scripts/${n}`).sort();
}

/** Failure lines for workflow text `yml` against the fetch scripts `fetches`. Comment lines are not steps. */
export function judge(yml, fetches) {
    const lines = yml.split('\n').map((l) => l.replace(/^\s*#.*$/, ''));
    const tableAt = lines.findIndex((l) => TABLE.test(l));
    if (tableAt < 0) return [`${WORKFLOW} runs no scripts/verify-platform.sh --quick step, so there is no table to fetch for`];
    if (!fetches.length) return ['no scripts/fetch-*.sh exists, so the derivation found nothing to require (the tree moved)'];
    const fails = [];
    for (const f of fetches) {
        const at = lines.findIndex((l) => l.includes(f));
        if (at < 0) fails.push(`${WORKFLOW} never runs ${f}, so the quick rows that read its checkout SKIP those clauses in CI. Next step: add a step running bash ${f} before the table`);
        else if (at > tableAt) fails.push(`${WORKFLOW} runs ${f} only after the --quick table (line ${at + 1} after line ${tableAt + 1}). Next step: move that step before the table`);
    }
    return fails;
}

function selfTest() {
    const yml = readFileSync(join(REPO_ROOT, WORKFLOW), 'utf8');
    const fetches = fetchScripts(readdirSync(join(REPO_ROOT, 'scripts')));
    const last = fetches[fetches.length - 1];
    const stepWith = (f) => yml.split('\n').find((l) => !/^\s*#/.test(l) && l.includes(f));
    const cases = [
        ['control: the tracked workflow', yml, fetches, null],
        // The finding's own state: the workflow before the fix ran no fetch of one checkout.
        ...fetches.map((f) => [`plant: the ${f} step removed`, yml.split('\n').filter((l) => l !== stepWith(f)).join('\n'), fetches, `never runs ${f}`]),
        [`plant: the ${last} step only in a comment`, yml.split(stepWith(last)).join(`      # ${stepWith(last)?.trim()}`), fetches, `never runs ${last}`],
        [`plant: the ${last} step moved after the table`, `${yml.split('\n').filter((l) => l !== stepWith(last)).join('\n')}\n      - run: bash ${last}\n`, fetches, 'only after the --quick table'],
        ['plant: a new fetch script the workflow does not run', yml, fetchScripts([...fetches.map((f) => f.slice('scripts/'.length)), 'fetch-planted.sh']), 'never runs scripts/fetch-planted.sh'],
        ['plant: no table step', yml.split('\n').filter((l) => !TABLE.test(l)).join('\n'), fetches, 'runs no scripts/verify-platform.sh --quick step'],
    ];
    let misses = 0;
    for (const [name, text, f, want] of cases) {
        const got = judge(text, f);
        const ok = want === null ? got.length === 0 : got.some((g) => g.includes(want));
        if (!ok) misses++;
        console.log(`  ${ok ? 'ok ' : 'MISS'} ${name} -> ${got.length ? `red: ${got.join(' | ')}` : 'green'}`);
    }
    if (!stepWith(last)) { misses++; console.log(`  MISS the tracked workflow has no step line naming ${last} to plant on`); }
    if (misses) { console.error(`${NAME} --self-test: FAIL -- ${misses} case(s) missed`); return 1; }
    console.log(`${NAME} --self-test: PASS -- control green, ${cases.length - 1} planted faults each red naming the drift`);
    return 0;
}

const args = process.argv.slice(2);
if (args[0] === '--self-test') process.exit(selfTest());
if (args.length) { console.error(`${NAME}: FAIL -- usage: node scripts/verify-ci-fetches.mjs [--self-test]`); process.exit(2); }
const fetches = fetchScripts(readdirSync(join(REPO_ROOT, 'scripts')));
const fails = judge(readFileSync(join(REPO_ROOT, WORKFLOW), 'utf8'), fetches);
for (const f of fails) console.error(`${NAME}: FAIL -- ${f}`);
if (fails.length) process.exit(1);
console.log(`${NAME}: PASS -- ${WORKFLOW} runs ${fetches.join(', ')} before the --quick table`);
