#!/usr/bin/env node
// scripts/verify-ci-fetches.mjs
//
// Hosted CI must provide every input a --quick row can skip on before it runs the --quick table (audit
// harness-driver-03, harness-other-05). A quick row whose input is absent SKIPs (exit 77) those clauses, so a CI table
// without the input is green without asserting them. Both sets are derived from the tree:
//   - every scripts/fetch-<name>.sh (a pinned third-party checkout, such as upstream/);
//   - every powerbrowser/packaging/stage-<name>.sh whose cache folder (its CACHE="$ROOT/<folder>" line) is read by a
//     script a --quick registry row runs (the bundled add-on cache .mozbuild/bundled-xpi/, read by
//     verify-bundled-xpi.mjs and verify-licence-allowlist.mjs). A stager no quick row reads is not required.
// .github/workflows/verify.yml must run each one in a step (not a comment) before the step that runs
// scripts/verify-platform.sh --quick.
//
//   node scripts/verify-ci-fetches.mjs
//   node scripts/verify-ci-fetches.mjs --self-test

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const NAME = 'ci-fetches';
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOW = '.github/workflows/verify.yml';
const REGISTRY = 'scripts/verify-platform.sh';
const STAGERS_DIR = 'powerbrowser/packaging';
const TABLE = /scripts\/verify-platform\.sh\s+--quick\b/;

/** Every scripts/fetch-<name>.sh in the tree, sorted. */
export function fetchScripts(names) {
    return names.filter((n) => /^fetch-[a-z0-9-]+\.sh$/.test(n)).map((n) => `scripts/${n}`).sort();
}

/** The scripts the --quick rows run: every $REPO_ROOT/<path> in the registry's base CHECKS array (before quick_rows). */
export function quickRowScripts(registryText) {
    const start = registryText.indexOf('local -a CHECKS=(');
    const end = registryText.indexOf('local quick_rows=', start);
    if (start < 0 || end < 0) return null;
    return [...new Set([...registryText.slice(start, end).matchAll(/"[^"|]+\|(?:node|bash) \$REPO_ROOT\/([^\s"]+)/g)].map((m) => m[1]))].sort();
}

/**
 * The stagers CI must run: each stager (rel -> text) whose CACHE folder some quick-row script (rel -> text) names.
 * Returns [{ stager, cache, readers }].
 */
export function requiredStagers(stagers, quickScripts) {
    const out = [];
    for (const [rel, text] of Object.entries(stagers)) {
        const cache = /^CACHE="\$ROOT\/([^"]+)"/m.exec(text)?.[1];
        if (!cache) continue;
        const readers = Object.entries(quickScripts).filter(([, t]) => t.includes(cache)).map(([r]) => r);
        if (readers.length) out.push({ stager: rel, cache, readers });
    }
    return out.sort((a, b) => a.stager.localeCompare(b.stager));
}

/** Failure lines for workflow text `yml` against the required inputs `required` ([{ path, why }]). Comments are not steps. */
export function judge(yml, required) {
    const lines = yml.split('\n').map((l) => l.replace(/^\s*#.*$/, ''));
    const tableAt = lines.findIndex((l) => TABLE.test(l));
    if (tableAt < 0) return [`${WORKFLOW} runs no scripts/verify-platform.sh --quick step, so there is no table to provide inputs for`];
    if (!required.some((r) => r.path.startsWith('scripts/fetch-'))) return ['no scripts/fetch-*.sh exists, so the derivation found nothing to require (the tree moved)'];
    const fails = [];
    for (const { path, why } of required) {
        const at = lines.findIndex((l) => l.includes(path));
        if (at < 0) fails.push(`${WORKFLOW} never runs ${path}, so ${why} SKIP in CI. Next step: add a step running bash ${path} before the table`);
        else if (at > tableAt) fails.push(`${WORKFLOW} runs ${path} only after the --quick table (line ${at + 1} after line ${tableAt + 1}). Next step: move that step before the table`);
    }
    return fails;
}

/** The required inputs derived from the tree at `root`. */
export function deriveRequired(root = REPO_ROOT) {
    const fetches = fetchScripts(readdirSync(join(root, 'scripts'))).map((path) => ({ path, why: 'the quick rows that read its checkout' }));
    const scripts = quickRowScripts(readFileSync(join(root, REGISTRY), 'utf8')) ?? [];
    const quickTexts = Object.fromEntries(scripts.filter((r) => existsSync(join(root, r))).map((r) => [r, readFileSync(join(root, r), 'utf8')]));
    const stagerNames = readdirSync(join(root, STAGERS_DIR)).filter((n) => /^stage-[a-z0-9-]+\.sh$/.test(n));
    const stagers = Object.fromEntries(stagerNames.map((n) => [`${STAGERS_DIR}/${n}`, readFileSync(join(root, STAGERS_DIR, n), 'utf8')]));
    const staged = requiredStagers(stagers, quickTexts).map(({ stager, cache, readers }) => ({ path: stager, why: `the quick rows that read ${cache}/ (${readers.join(', ')})` }));
    return { required: [...fetches, ...staged], scripts, stagers, quickTexts };
}

function selfTest() {
    const yml = readFileSync(join(REPO_ROOT, WORKFLOW), 'utf8');
    const { required, scripts, stagers, quickTexts } = deriveRequired();
    const stepWith = (p) => yml.split('\n').find((l) => !/^\s*#/.test(l) && l.includes(p));
    const last = required.filter((r) => r.path.startsWith('scripts/fetch-')).pop().path;
    const xpi = required.find((r) => r.path.startsWith(`${STAGERS_DIR}/`));
    const cases = [
        ['control: the tracked workflow', yml, required, null],
        // The findings' own states: the workflow before each fix ran no step for one input.
        ...required.map((r) => [`plant: the ${r.path} step removed`, yml.split('\n').filter((l) => l !== stepWith(r.path)).join('\n'), required, `never runs ${r.path}`]),
        [`plant: the ${last} step only in a comment`, yml.split(stepWith(last)).join(`      # ${stepWith(last)?.trim()}`), required, `never runs ${last}`],
        [`plant: the ${last} step moved after the table`, `${yml.split('\n').filter((l) => l !== stepWith(last)).join('\n')}\n      - run: bash ${last}\n`, required, 'only after the --quick table'],
        ['plant: a new fetch script the workflow does not run', yml, [...required, { path: 'scripts/fetch-planted.sh', why: 'planted' }], 'never runs scripts/fetch-planted.sh'],
        ['plant: no table step', yml.split('\n').filter((l) => !TABLE.test(l)).join('\n'), required, 'runs no scripts/verify-platform.sh --quick step'],
    ];
    let misses = 0;
    const note = (ok, name, detail) => { if (!ok) misses++; console.log(`  ${ok ? 'ok ' : 'MISS'} ${name}${detail ? ` -> ${detail}` : ''}`); };
    for (const [name, text, req, want] of cases) {
        const got = judge(text, req);
        note(want === null ? got.length === 0 : got.some((g) => g.includes(want)), name, got.length ? `red: ${got.join(' | ')}` : 'green');
    }
    // The stager derivation itself: the tree's quick rows read the XPI cache; a stager whose cache no quick row reads
    // is not required, and one a quick row starts reading is.
    note(scripts.length > 0, 'control: the registry yields quick-row scripts', `${scripts.length} scripts`);
    note(Boolean(xpi), 'control: the bundled add-on stager is required (a quick row reads its cache)', xpi ? xpi.why : 'not derived');
    // Built at run time: this script is itself a quick row, so a literal folder name here would count as read.
    const planted = ['.mozbuild', `vpd-${process.pid}-${Date.now()}`].join('/');
    const unread = requiredStagers({ 'powerbrowser/packaging/stage-planted.sh': `CACHE="$ROOT/${planted}"\n` }, quickTexts);
    note(unread.length === 0, 'control: a stager whose cache no quick row reads is not required', unread.length ? 'required' : 'not required');
    const read = requiredStagers({ 'powerbrowser/packaging/stage-planted.sh': `CACHE="$ROOT/${planted}"\n` }, { ...quickTexts, 'scripts/verify-planted.mjs': `const c = '${planted}';` });
    note(read.length === 1, 'plant: a quick row that starts reading a stager\'s cache makes it required', read.length ? `required: ${read[0].stager}` : 'not required');
    note(quickRowScripts('no registry here') === null, 'plant: a registry with no quick block derives nothing (null, not an empty pass)');
    if (!stepWith(last)) note(false, `the tracked workflow has a step line naming ${last} to plant on`);
    void stagers;
    if (misses) { console.error(`${NAME} --self-test: FAIL -- ${misses} case(s) missed`); return 1; }
    console.log(`${NAME} --self-test: PASS -- controls green, every planted fault red naming the drift`);
    return 0;
}

const args = process.argv.slice(2);
if (args[0] === '--self-test') process.exit(selfTest());
if (args.length) { console.error(`${NAME}: FAIL -- usage: node scripts/verify-ci-fetches.mjs [--self-test]`); process.exit(2); }
const { required, scripts } = deriveRequired();
if (!scripts.length) { console.error(`${NAME}: FAIL -- ${REGISTRY} yields no quick-row script, so the stager derivation has nothing to read (the registry moved)`); process.exit(1); }
const fails = judge(readFileSync(join(REPO_ROOT, WORKFLOW), 'utf8'), required);
for (const f of fails) console.error(`${NAME}: FAIL -- ${f}`);
if (fails.length) process.exit(1);
console.log(`${NAME}: PASS -- ${WORKFLOW} runs ${required.map((r) => r.path).join(', ')} before the --quick table`);
