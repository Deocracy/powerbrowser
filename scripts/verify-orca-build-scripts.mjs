#!/usr/bin/env node
// scripts/verify-orca-build-scripts.mjs
//
// The orca-build-scripts gate (v1.7 audit, 64-WR-05, 60-WR-01, 60-WR-03). It reads the Orca build
// scripts' text (every scripts/build-orca*.sh, listed from the tree at check time) and is red, naming
// file and line, on:
//   - eval "$(cmd)" in any of them: the status of that line is the evaluated text's, never cmd's, so a
//     failed node step evals an empty string and the `|| fail` beside it never fires (64-WR-05). Capture
//     the output into a variable under `|| fail`, then eval the variable.
//   - in scripts/build-orca.sh, a run of scripts/fetch-orca.sh that does not clear TAG and COMMIT with
//     env -u TAG -u COMMIT: fetch-orca.sh reads an exported TAG/COMMIT as a re-pin override, so a caller's
//     generic job variables would select the tree that is built (60-WR-01).
//   - in scripts/build-orca.sh, the pins fragment sourced after the first fetch-orca.sh run, or not before
//     it: the PASS line must name the pin read before the fetch, not one read after the build (60-WR-01).
//   - in scripts/build-orca.sh, the ORCA_* / NODE_OPTIONS scrub after the first line that starts a child
//     process that could read them (run_step, node, bash, git, pnpm, corepack), so the fetch, the
//     seams.json reader and apply-patches.sh would inherit Orca desktop's variables (60-WR-03).
// Comment lines are ignored. Function definition lines (name() {) are not child processes.
//
// Tier: quick (reads tracked files only). --self-test checks the real tree green first, then plants each
// pre-fix fault on an in-memory copy and requires red naming the file and the fault; it writes nothing.
//
// Usage:
//   node scripts/verify-orca-build-scripts.mjs
//   node scripts/verify-orca-build-scripts.mjs --self-test

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'orca-build-scripts';
const MAIN_REL = 'scripts/build-orca.sh';
const PINS = '"$REPO_ROOT/generated/upstream-pins.env"';

/** The Orca build scripts in the tree, as { rel: text }. */
export function readScripts(root = REPO_ROOT) {
    const out = {};
    for (const n of readdirSync(join(root, 'scripts')).filter(n => /^build-orca.*\.sh$/.test(n)).sort()) {
        out[`scripts/${n}`] = readFileSync(join(root, 'scripts', n), 'utf8');
    }
    return out;
}

const isCode = l => l.trim() !== '' && !/^\s*#/.test(l);
const isDef = l => /^\s*[A-Za-z_][\w-]*\(\)\s*\{/.test(l);

export function check(files) {
    const fails = [];
    if (!files[MAIN_REL]) fails.push(`${MAIN_REL}: absent, so the Orca build has no entry script. Next step: restore it.`);
    for (const [rel, text] of Object.entries(files)) {
        text.split('\n').forEach((l, i) => {
            if (isCode(l) && /\beval\s+"\$\(/.test(l)) {
                fails.push(`${rel}:${i + 1}: eval "$(...)" takes the evaluated text's status, so a failed command substitution evals "" and passes. Next step: capture it with var="$(...)" || fail ..., then eval "$var".`);
            }
        });
    }
    const text = files[MAIN_REL];
    if (!text) return fails;
    const lines = text.split('\n');
    const fetchAt = [];
    let sourceAt = -1;
    let scrubAt = -1;
    let childAt = -1;
    lines.forEach((l, i) => {
        if (!isCode(l)) return;
        if (/scripts\/fetch-orca\.sh\b/.test(l) && /\b(?:bash|run_step)\b/.test(l)) {
            fetchAt.push(i);
            if (!/\benv -u TAG -u COMMIT\b/.test(l)) fails.push(`${MAIN_REL}:${i + 1}: runs scripts/fetch-orca.sh without env -u TAG -u COMMIT, so an inherited TAG/COMMIT re-pins the tree that is built while the PASS line names configuration.toml's pin. Next step: run it as env -u TAG -u COMMIT bash "$REPO_ROOT/scripts/fetch-orca.sh".`);
        }
        const src = /^\s*(?:\.|source)\s+(\S+)/.exec(l);
        if (src && src[1] === PINS) {
            if (sourceAt !== -1) fails.push(`${MAIN_REL}:${i + 1}: sources ${PINS} a second time, so the pin it reports may not be the one read before the fetch. Next step: source it once, before the fetch, and report the values read there.`);
            else sourceAt = i;
        }
        if (/^\s*unset\b[^\n]*\bNODE_OPTIONS\b/.test(l) && scrubAt === -1) scrubAt = i;
        if (childAt === -1 && !isDef(l) && /(^|[\s;(&|])(run_step|node|bash|git|pnpm|corepack)\s/.test(l.replace(/"[^"]*"/g, '""'))) childAt = i;
    });
    if (fetchAt.length === 0) fails.push(`${MAIN_REL}: runs scripts/fetch-orca.sh nowhere, so the tree is never verified at the pin. Next step: restore the fetch-verify step.`);
    if (sourceAt === -1) fails.push(`${MAIN_REL}: sources no ${PINS}, so it reports no pin. Next step: source it before the fetch.`);
    else if (fetchAt.length && sourceAt > fetchAt[0]) fails.push(`${MAIN_REL}:${sourceAt + 1}: sources ${PINS} after the first fetch-orca.sh run (line ${fetchAt[0] + 1}), so the pin it reports is read after the build, not the one the fetch verified. Next step: source it before the fetch.`);
    if (scrubAt === -1) fails.push(`${MAIN_REL}: has no unset ... NODE_OPTIONS scrub. Next step: restore the scrub before step 1.`);
    else if (childAt !== -1 && scrubAt > childAt) fails.push(`${MAIN_REL}:${scrubAt + 1}: scrubs ORCA_* and NODE_OPTIONS after line ${childAt + 1} starts a child process, so that process inherits Orca desktop's variables. Next step: move the scrub before step 1.`);
    return fails;
}

function selfTest() {
    const real = readScripts();
    const base = check(real);
    if (base.length) {
        console.error(`${NAME} self-test: FAIL -- the real scripts are already red, so the plants below would prove nothing:`);
        for (const f of base) console.error(`  ${f}`);
        return 1;
    }
    console.log(`  ok baseline ${Object.keys(real).join(', ')} -> green`);
    const main = real[MAIN_REL];
    const edit = (rel, from, to) => (real[rel]?.includes(from) ? { ...real, [rel]: real[rel].replace(from, to) } : null);
    const scrub = 'for name in "${!ORCA_@}"; do unset "$name"; done\nunset ELECTRON_RUN_AS_NODE NODE_OPTIONS NODE_REPL_EXTERNAL_MODULE\n';
    const sourceLine = main.split('\n').find(l => l.startsWith(`. ${PINS}`)) ?? '';
    const passLine = main.split('\n').find(l => l.startsWith('echo "build-orca: PASS -- built')) ?? '';
    const plants = [
        // 64-WR-05, the pre-fix form: eval of the substitution with || fail on the eval line.
        ['eval of a command substitution', edit('scripts/build-orca-panes.sh', 'build_env="$(node --input-type=module -e \'', 'eval "$(node --input-type=module -e \''), 'scripts/build-orca-panes.sh', 'eval "$(...)"'],
        // 60-WR-01, the pre-fix fetch: the caller's TAG/COMMIT reach fetch-orca.sh.
        ['fetch without env -u TAG -u COMMIT', edit(MAIN_REL, 'run_step fetch-verify env -u TAG -u COMMIT bash', 'run_step fetch-verify bash'), MAIN_REL, 'without env -u TAG -u COMMIT'],
        // 60-WR-01, the pre-fix report: the fragment sourced after the build, just before the PASS line.
        ['pins sourced after the build', sourceLine && passLine ? { ...real, [MAIN_REL]: main.replace(`${sourceLine}\n`, '').replace(passLine, `. ${PINS}\n${passLine}`) } : null, MAIN_REL, 'after the first fetch-orca.sh run'],
        // 60-WR-03, the pre-fix order: the scrub after the fetch and overlay steps.
        ['scrub after the fetch', main.includes(scrub) && main.includes('run_step overlay apply_overlay\n') ? { ...real, [MAIN_REL]: main.replace(scrub, '').replace('run_step overlay apply_overlay\n', `run_step overlay apply_overlay\n${scrub}`) } : null, MAIN_REL, 'after line'],
    ];
    let failed = 0;
    for (const [name, files, rel, naming] of plants) {
        if (files === null) { console.error(`${NAME} self-test: FAIL -- '${name}' planted nothing (its anchor is absent)`); failed++; continue; }
        const fails = check(files);
        const hit = fails.find(f => f.startsWith(`${rel}:`) && f.includes(naming));
        if (hit) console.log(`  ok ${name} -> red: ${hit.split(', so')[0]}`);
        else { console.error(`${NAME} self-test: FAIL -- '${name}' did not go red naming '${naming}'; got: ${fails.join(' | ') || '(green)'}`); failed++; }
    }
    if (failed) return 1;
    console.log(`${NAME} self-test: PASS -- the real scripts are green and ${plants.length} planted faults each went red naming the file and the line`);
    return 0;
}

const args = process.argv.slice(2);
if (args.some(a => a !== '--self-test')) {
    console.error(`${NAME}: unknown argument '${args.find(a => a !== '--self-test')}' (usage: node scripts/verify-orca-build-scripts.mjs [--self-test])`);
    console.error('  Next step: run node scripts/verify-orca-build-scripts.mjs --self-test');
    process.exit(2);
}
if (args.includes('--self-test')) process.exit(selfTest());
const files = readScripts();
const fails = check(files);
if (fails.length) {
    console.error(`${NAME}: FAIL -- ${fails.length} problem(s):`);
    for (const f of fails) console.error(`  ${f}`);
    process.exit(1);
}
console.log(`${NAME}: PASS -- ${Object.keys(files).length} Orca build script(s) eval no command substitution; ${MAIN_REL} scrubs before its first child process, reads the pin before the fetch and fetches with env -u TAG -u COMMIT`);
