#!/usr/bin/env node
// scripts/verify-ci-release-integrity.mjs
//
// The ci-release-integrity gate (v1.7 audit, lane G5a). It parses the workflow files and is red, naming
// the file, the job and the clause, when a fix the audit asked for is undone:
//   stage-line     (ci-supply-chain-06) rebase-orca.yml's replay step passes --stage-file, its stage step
//                  reads that file and never takes the stage from the log, and both the stage step and the
//                  release train's stop-issue step cut the stage to a bounded length of a character set with
//                  no backtick before it is published.
// Every clause derives what it compares from the parsed YAML (job and step lookups by what they run, not by
// a list kept here), so a renamed step is still found.
//
// Tier: quick (reads tracked files, parses YAML). --self-test checks the real tree green first, then plants
// each pre-fix fault on an in-memory copy of the text and requires red naming the clause; it writes nothing.
//
// Usage:
//   node scripts/verify-ci-release-integrity.mjs
//   node scripts/verify-ci-release-integrity.mjs --self-test

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadYaml, stepsOf } from './lib/release-workflow.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'ci-release-integrity';
const WF = '.github/workflows';
export const FILES = ['rebase-orca.yml', 'release-train.yml', 'release.yml'];

const runOf = st => String(st?.run ?? '');

/** True when `text` passes a value through tr -cd with a set lacking a backtick, then cut -c1-N. */
function boundedFilter(text) {
    const tr = /tr -cd (?:"([^"\n]*)"|'([^'\n]*)')/.exec(text);
    return tr !== null && !(tr[1] ?? tr[2]).includes('`') && /\bcut -c1-[0-9]+\b/.test(text.slice(tr.index));
}

export function check(texts) {
    const fails = [];
    const yaml = loadYaml();
    const docs = {};
    for (const f of FILES) {
        try { docs[f] = yaml.load(texts[f]); } catch (e) { fails.push(`${WF}/${f}: does not parse (${e.message.split('\n')[0]}). Next step: fix the file.`); }
    }
    const fail = (f, job, clause, msg) => fails.push(`${WF}/${f} job ${job} [${clause}]: ${msg}`);

    // stage-line (ci-supply-chain-06)
    {
        const job = docs['rebase-orca.yml']?.jobs?.rebase;
        const steps = stepsOf(job);
        const replay = steps.find(st => /scripts\/rebase-orca\.sh\b/.test(runOf(st)));
        const file = /--stage-file\s+("?)([^"\s]+)\1/.exec(runOf(replay))?.[2];
        if (!replay) fail('rebase-orca.yml', 'rebase', 'stage-line', 'has no step running scripts/rebase-orca.sh. Next step: restore the replay step.');
        else if (!file) fail('rebase-orca.yml', 'rebase', 'stage-line', 'runs rebase-orca.sh without --stage-file, so the stage can only be read from the log, which carries what Orca\'s build prints. Next step: pass --stage-file "$RUNNER_TEMP/stage.txt".');
        const stage = steps.find(st => st?.id === 'stage');
        const sRun = runOf(stage);
        if (!stage) fail('rebase-orca.yml', 'rebase', 'stage-line', 'has no step with id stage. Next step: restore the step that names the stage.');
        else {
            if (file && !sRun.includes(file)) fail('rebase-orca.yml', 'rebase', 'stage-line', `the stage step does not read ${file}, the file rebase-orca.sh writes its own FAIL line to. Next step: read the stage from it.`);
            if (/rebase\.log/.test(sRun)) fail('rebase-orca.yml', 'rebase', 'stage-line', 'the stage step reads the replay log, whose first FAIL line can be one Orca\'s build printed. Next step: read the --stage-file instead.');
            if (!boundedFilter(sRun)) fail('rebase-orca.yml', 'rebase', 'stage-line', 'the stage step publishes the line without tr -cd (a set with no backtick) and cut -c1-N, so it can close the issue\'s code span. Next step: filter and bound it.');
        }
        const report = docs['release-train.yml']?.jobs?.report;
        const stop = stepsOf(report).find(st => /orca-stop\.md/.test(runOf(st)) && /Stage: /.test(runOf(st)));
        if (!stop) fail('release-train.yml', 'report', 'stage-line', 'has no step writing the Orca stop issue (orca-stop.md with a Stage: line). Next step: restore it.');
        else {
            const r = runOf(stop);
            const filt = r.search(/STAGE=\$\(printf '%s' "\$STAGE_OUT" \| tr -cd /);
            const printed = r.search(/Stage: /);
            if (filt === -1 || !boundedFilter(r.slice(filt)) || filt > printed) fail('release-train.yml', 'report', 'stage-line', 'prints the rebase-orca stage into the issue without first cutting it to a bounded set with no backtick; the stage comes from the job that ran Orca\'s code. Next step: STAGE=$(printf \'%s\' "$STAGE_OUT" | tr -cd ... | cut -c1-300) before the printf.');
        }
    }

    return fails;
}

export function readTexts(root = REPO_ROOT) {
    return Object.fromEntries(FILES.map(f => [f, readFileSync(join(root, WF, f), 'utf8')]));
}

function selfTest() {
    const real = readTexts();
    const base = check(real);
    if (base.length) {
        console.error(`${NAME} self-test: FAIL -- the real tree is already red, so the plants below would prove nothing:`);
        for (const f of base) console.error(`  ${f}`);
        return 1;
    }
    console.log(`  ok baseline ${FILES.join(', ')} -> green`);
    const edit = (f, from, to) => (real[f].includes(from) ? { ...real, [f]: real[f].replace(from, to) } : null);
    const plants = [
        // ci-supply-chain-06, the pre-fix stage step and stop issue.
        ['stage from the log', edit('rebase-orca.yml', `LINE=$(head -n1 "$RUNNER_TEMP/stage.txt" 2>/dev/null || true)`, `LINE=$(grep -m1 '^rebase-orca: FAIL -- ' "$RUNNER_TEMP/rebase.log" 2>/dev/null || true)`), 'stage-line', 'reads the replay log'],
        ['replay without --stage-file', edit('rebase-orca.yml', ' --stage-file "$RUNNER_TEMP/stage.txt"', ''), 'stage-line', 'without --stage-file'],
        ['stage published unfiltered', edit('rebase-orca.yml', `          LINE=$(printf '%s' "$LINE" | tr -cd "A-Za-z0-9 _./:@()'*,=<>+-" | cut -c1-300)\n`, ''), 'stage-line', 'without tr -cd'],
        ['stop issue prints the raw stage', edit('release-train.yml', `STAGE=$(printf '%s' "$STAGE_OUT" | tr -cd "A-Za-z0-9 _./:@()'*,=<>+-" | cut -c1-300)`, 'STAGE="$STAGE_OUT"'), 'stage-line', 'without first cutting it'],
        ['a backtick admitted', edit('release-train.yml', `STAGE=$(printf '%s' "$STAGE_OUT" | tr -cd "A-Za-z0-9 _./:@()'*,=<>+-" | cut -c1-300)`, `STAGE=$(printf '%s' "$STAGE_OUT" | tr -cd "A-Za-z0-9 _./:@()'*,=<>+\`-" | cut -c1-300)`), 'stage-line', 'without first cutting it'],
    ];
    let failed = 0;
    for (const [name, texts, clause, naming] of plants) {
        if (texts === null) { console.error(`${NAME} self-test: FAIL -- '${name}' planted nothing (its anchor is absent)`); failed++; continue; }
        const fails = check(texts);
        const hit = fails.find(f => f.includes(`[${clause}]`) && f.includes(naming));
        if (hit) console.log(`  ok ${name} -> red: ${hit.split('. Next step')[0]}`);
        else { console.error(`${NAME} self-test: FAIL -- '${name}' did not go red naming [${clause}] '${naming}'; got: ${fails.join(' | ') || '(green)'}`); failed++; }
    }
    if (failed) return 1;
    console.log(`${NAME} self-test: PASS -- the real tree is green and ${plants.length} planted faults each went red naming the clause`);
    return 0;
}

const args = process.argv.slice(2);
if (args.some(a => a !== '--self-test')) {
    console.error(`${NAME}: unknown argument '${args.find(a => a !== '--self-test')}' (usage: node scripts/verify-ci-release-integrity.mjs [--self-test])`);
    console.error('  Next step: run node scripts/verify-ci-release-integrity.mjs --self-test');
    process.exit(2);
}
if (args.includes('--self-test')) process.exit(selfTest());
const fails = check(readTexts());
if (fails.length) {
    console.error(`${NAME}: FAIL -- ${fails.length} problem(s):`);
    for (const f of fails) console.error(`  ${f}`);
    process.exit(1);
}
console.log(`${NAME}: PASS -- clauses enforced: stage-line`);
