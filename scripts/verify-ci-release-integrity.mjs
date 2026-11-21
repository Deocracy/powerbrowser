#!/usr/bin/env node
// scripts/verify-ci-release-integrity.mjs
//
// The ci-release-integrity gate (v1.7 audit, lane G5a). It parses the workflow files and is red, naming
// the file, the job and the clause, when a fix the audit asked for is undone:
//   stage-line     (ci-supply-chain-06) rebase-orca.yml's replay step passes --stage-file, its stage step
//                  reads that file and never takes the stage from the log, and both the stage step and the
//                  release train's stop-issue step cut the stage to a bounded length of a character set with
//                  no backtick before it is published.
//   artifact-digest (ci-supply-chain-01, ci-supply-chain-04) every artifact a secret-holding job downloads from
//                  this run and signs or commits -- in release.yml one whose producer uploads a *.complete.mar, in
//                  release-train.yml any whose producer is a job of the same file -- is bound to its producer: the
//                  producer exports a *sha256* output from a step, the consumer takes it through needs, and a run step
//                  after the download and before the first secret or App-token step compares the bytes with it
//                  (check-win-sidecar.sh check, or a != "$VAR" test). Any job of the run that obtains the run's
//                  artifact token could otherwise replace the artifact after its producer uploaded it.
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

    // artifact-digest (ci-supply-chain-01, ci-supply-chain-04)
    for (const f of ['release.yml', 'release-train.yml']) {
        const jobs = docs[f]?.jobs ?? {};
        const uploadsOf = j => stepsOf(j).filter(st => /^actions\/upload-artifact@/.test(String(st?.uses ?? '')));
        for (const [cId, c] of Object.entries(jobs)) {
            const steps = stepsOf(c);
            const holdsSecret = st => /\bsecrets\./.test(JSON.stringify(st)) || /^actions\/create-github-app-token@/.test(String(st?.uses ?? ''));
            if (!steps.some(holdsSecret)) continue;
            steps.forEach((d, di) => {
                if (!/^actions\/download-artifact@/.test(String(d?.uses ?? '')) || d.with?.['run-id'] !== undefined) return;
                const name = d.with?.name;
                const producers = Object.entries(jobs).filter(([, p]) => uploadsOf(p).some(u => u.with?.name === name));
                if (producers.length !== 1) return; // a reusable-workflow producer (rebase-orca) has no local upload
                const [pId, p] = producers[0];
                const up = uploadsOf(p).find(u => u.with?.name === name);
                if (f === 'release.yml' && !/\.complete\.mar\b/.test(String(up.with?.path ?? ''))) return;
                const out = Object.entries(p.outputs ?? {}).find(([k, v]) => /sha256/i.test(k) && /\bsteps\.[\w-]+\.outputs\.[\w-]+/.test(String(v)));
                if (!out) { fail(f, pId, 'artifact-digest', `uploads ${name}, which ${cId} downloads and holds a secret beside, but exports no *sha256* output from a step, so a copy another job of the run re-uploaded cannot be told apart. Next step: write a digest of the files and export it as a job output.`); return; }
                const ref = `needs.${pId}.outputs.${out[0]}`;
                const envs = [c.env ?? {}, ...steps.map(st => st.env ?? {})];
                const v = envs.flatMap(e => Object.entries(e)).find(([, val]) => String(val).replace(/\s+/g, '') === `\${{${ref}}}`)?.[0];
                if (!v) { fail(f, cId, 'artifact-digest', `downloads ${name} but never takes ${ref} into an env variable, so the bytes are not compared with what ${pId} uploaded. Next step: pass it in env and compare before any secret step.`); return; }
                const firstSecret = steps.findIndex(holdsSecret);
                const cmp = steps.findIndex((st, i) => i > di && (firstSecret === -1 || i < firstSecret) && new RegExp(`\\$\\{?${v}\\b`).test(runOf(st))
                    && (/check-win-sidecar\.sh check\b/.test(runOf(st)) || new RegExp(`!= "\\$\\{?${v}\\}?"`).test(runOf(st))));
                if (cmp === -1) fail(f, cId, 'artifact-digest', `downloads ${name} (step ${di}) and has no run step before its first secret or App-token step (step ${firstSecret}) that compares it with $${v} (${ref}). Next step: admit it with check-win-sidecar.sh check, or compare its digest, right after the download.`);
            });
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
        // ci-supply-chain-01, the pre-fix sign-publish: no admission of release-linux by build-linux's digest.
        ['sign-publish signs an unbound release-linux', edit('release.yml', '          bash powerbrowser/packaging/check-win-sidecar.sh check release "$SUMS_SHA256"\n', '          echo admitted\n'), 'artifact-digest', 'compares it with $SUMS_SHA256'],
        ['build-linux exports no digest', edit('release.yml', '      sums_sha256: ${{ steps.release_sums.outputs.sha256 }}\n    env:\n      RELEASE_SHA', '    env:\n      RELEASE_SHA'), 'artifact-digest', 'exports no *sha256* output'],
        ['publish-windows signs an unbound release-windows', real['release.yml'].split('bash powerbrowser/packaging/check-win-sidecar.sh check windows "$SUMS_SHA256"').length === 3
            ? { ...real, 'release.yml': real['release.yml'].replace(/(bash powerbrowser\/packaging\/check-win-sidecar\.sh check windows "\$SUMS_SHA256"[\s\S]*?)bash powerbrowser\/packaging\/check-win-sidecar\.sh check windows "\$SUMS_SHA256"/, '$1echo admitted') } : null,
            'artifact-digest', 'publish-windows [artifact-digest]: downloads release-windows'],
        // ci-supply-chain-04, the pre-fix publish job: only the file-name listing.
        ['the notices publish compares no digest', edit('release-train.yml', '[ "$GOT_SHA256" != "$NOTICES_SHA256" ]', 'false'), 'artifact-digest', 'compares it with $NOTICES_SHA256'],
        ['the notices digest not taken from the generate job', edit('release-train.yml', '      NOTICES_SHA256: ${{ needs.renovate-licensing.outputs.notices-sha256 }}\n', ''), 'artifact-digest', 'never takes needs.renovate-licensing.outputs.notices-sha256'],
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
console.log(`${NAME}: PASS -- clauses enforced: stage-line, artifact-digest`);
