#!/usr/bin/env node
// scripts/verify-dispatch-release.mjs
//
// The dispatch-release correlation (Phase 50 review CR-01, WR-01). The release train dispatches
// release.yml with inputs.sha = the merge SHA of the newest merged bump PR, counts the runs it
// already dispatched for that SHA (so a release is dispatched once) and links the run it just made.
// A workflow_dispatch run's head_sha is the tip of the dispatched ref (main), never inputs.sha, so
// the run is found by what the dispatch controls: release.yml's run-name (display title
// `Release <sha>`), the event, the workflow path and the head repository.
//
// This row does not copy those steps into JavaScript. It reads the merged, existing, dispatch and run
// steps of the dispatch-release job from release-train.yml with js-yaml and executes that exact bash
// text, with a fake gh on PATH that answers from fixtures through the real jq (the --jq expression
// the workflow ships is what filters) and asserts the exact `gh pr list` flags. Control scenario:
// main has advanced past the merge SHA (every run's head_sha is main's tip), a newer run exists for
// another SHA, and a cross-repository PR with a higher number is merged. The count must be 1 (no
// re-dispatch), the run link must be the run titled for the merge SHA, and the lookup must choose the
// same-repository merge SHA. A fresh scenario must POST the dispatch for the merge SHA on main.
//
// --self-test plants one fault per rule in the step text (a head_sha key, a missing isCrossRepository
// select, a missing --base main, a missing repository, path or event condition) and requires each to
// go red naming it. Honestly --quick: bash, jq and node on PATH; mkdtemp; no network, no gh, no build.
//
// Usage:
//   node scripts/verify-dispatch-release.mjs
//   node scripts/verify-dispatch-release.mjs --self-test

import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadYaml, stepsOf } from './lib/release-workflow.mjs';

const NAME = 'verify-dispatch-release';
const SELF_REL = 'scripts/verify-dispatch-release.mjs';
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOW_REL = '.github/workflows/release-train.yml';
const JOB = 'dispatch-release';
const REPO = 'owner-fixture/repo-fixture';
const MERGE_SHA = '1'.repeat(40);
const OTHER_SHA = '2'.repeat(40);
const TIP_SHA = '3'.repeat(40);
const WF_PATH = '.github/workflows/release.yml';
const args = process.argv.slice(2);
const SELF_TEST = args.includes('--self-test');
if (args.length > 0 && !SELF_TEST) {
    console.error(`${NAME}: FAIL -- unknown argument '${args[0]}'. Next step: run with no argument, or with --self-test.`);
    process.exit(2);
}

const FAKE_GH = `#!/usr/bin/env node
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const die = m => { console.error('fake gh: ' + m); process.exit(1); };
const a = process.argv.slice(2);
const fx = JSON.parse(fs.readFileSync(process.env.FAKE_GH_FIXTURE, 'utf8'));
const j = a.indexOf('--jq');
const expr = j >= 0 ? a[j + 1] : '.';
const rest = j >= 0 ? a.filter((_, i) => i !== j && i !== j + 1) : a;
const jq = data => {
    const r = spawnSync('jq', ['-r', expr], { input: JSON.stringify(data), encoding: 'utf8' });
    if (r.status !== 0) die('jq rejected the workflow expression: ' + r.stderr);
    process.stdout.write(r.stdout);
};
if (rest[0] === 'pr' && rest[1] === 'list') {
    const want = ['pr', 'list', '--repo', process.env.GITHUB_REPOSITORY, '--state', 'merged', '--base', 'main', '--head', 'chore/esr-' + process.env.FAKE_GH_PIN, '--limit', '5', '--json', 'number,mergeCommit,isCrossRepository'];
    if (JSON.stringify(rest) !== JSON.stringify(want)) die('unexpected pr list argv ' + JSON.stringify(rest) + ' (want ' + JSON.stringify(want) + ')');
    jq(fx.prs);
} else if (rest[0] === 'api') {
    const ep = rest.find(x => x.startsWith('repos/'));
    if (ep === undefined) die('no endpoint in ' + JSON.stringify(rest));
    if (rest.includes('-X') && rest[rest.indexOf('-X') + 1] === 'POST') {
        fs.appendFileSync(process.env.FAKE_GH_POSTS, ep + ' ' + fs.readFileSync(0, 'utf8') + '\\n');
        process.exit(0);
    }
    const want = 'repos/' + process.env.GITHUB_REPOSITORY + '/actions/workflows/release.yml/runs?';
    if (!ep.startsWith(want) || !ep.includes('event=workflow_dispatch')) die('unexpected runs endpoint ' + ep);
    jq({ workflow_runs: fx.runs });
} else {
    die('unexpected call ' + JSON.stringify(rest));
}
`;

const run = (id, forSha, createdAt, over = {}) => ({
    id, head_sha: TIP_SHA, display_title: `Release ${forSha}`, path: WF_PATH, head_repository: { full_name: REPO },
    event: 'workflow_dispatch', status: 'in_progress', conclusion: null, created_at: createdAt, html_url: `https://example.invalid/actions/runs/${id}`, ...over,
});
const pr = (number, oid, cross) => ({ number, mergeCommit: { oid }, isCrossRepository: cross });
const PRS = [pr(41, MERGE_SHA, false), pr(99, OTHER_SHA, true)];

function loadSteps(text) {
    const wf = loadYaml().load(text);
    const steps = stepsOf(wf?.jobs?.[JOB]);
    const byId = Object.fromEntries(steps.filter(s => typeof s.id === 'string').map(s => [s.id, s]));
    return { steps: byId, wf };
}

function pinOf() {
    const r = spawnSync(process.execPath, [join(REPO_ROOT, 'scripts', 'detect-upstreams.mjs'), '--pin'], { cwd: REPO_ROOT, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`detect-upstreams --pin failed: ${r.stderr}`);
    return r.stdout.trim();
}

/** Run one shipped step's bash text under the fake gh. Returns { code, text, outputs, summary, posts }. */
function runStep(ctx, step, env) {
    for (const f of ['output', 'summary']) writeFileSync(join(ctx.dir, f), '');
    const r = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', String(step.run)], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        env: {
            PATH: `${ctx.bin}:${process.env.PATH}`, HOME: ctx.dir, GITHUB_REPOSITORY: REPO, GITHUB_SERVER_URL: 'https://example.invalid',
            GITHUB_OUTPUT: join(ctx.dir, 'output'), GITHUB_STEP_SUMMARY: join(ctx.dir, 'summary'), GH_TOKEN: 'fixture-token',
            FAKE_GH_FIXTURE: join(ctx.dir, 'fixture.json'), FAKE_GH_POSTS: join(ctx.dir, 'posts'), FAKE_GH_PIN: ctx.pin, ...env,
        },
    });
    const outputs = Object.fromEntries(readFileSync(join(ctx.dir, 'output'), 'utf8').split('\n').filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
    return { code: r.status, text: `${r.stdout}${r.stderr}`.trim(), outputs, summary: readFileSync(join(ctx.dir, 'summary'), 'utf8'), posts: readFileSync(join(ctx.dir, 'posts'), 'utf8') };
}

function makeCtx() {
    const dir = mkdtempSync(join(tmpdir(), 'dispatch-release-'));
    const bin = join(dir, 'bin');
    spawnSync('mkdir', ['-p', bin]);
    writeFileSync(join(bin, 'gh'), FAKE_GH);
    writeFileSync(join(bin, 'sleep'), '#!/bin/sh\nexit 0\n');
    chmodSync(join(bin, 'gh'), 0o755);
    chmodSync(join(bin, 'sleep'), 0o755);
    writeFileSync(join(dir, 'posts'), '');
    return { dir, bin, pin: pinOf(), fixture(f) { writeFileSync(join(dir, 'fixture.json'), JSON.stringify(f)); } };
}

/** The scenarios over a workflow text. Returns failure strings; empty means every property holds. */
function scenarios(ctx, text) {
    const failures = [];
    const { steps } = loadSteps(text);
    for (const id of ['merged', 'existing', 'dispatch', 'run']) {
        if (steps[id] === undefined) return [`${WORKFLOW_REL} job ${JOB} has no step with id ${id}. Next step: restore it.`];
    }
    if (!/steps\.existing\.outputs\.count == '0'/.test(String(steps.dispatch.if ?? ''))) {
        failures.push(`the dispatch step is not gated on steps.existing.outputs.count == '0' (if: ${JSON.stringify(steps.dispatch.if ?? null)}), so a release could be dispatched twice`);
    }
    const lookup = (prs) => { ctx.fixture({ prs, runs: [] }); return runStep(ctx, steps.merged, {}); };
    const count = (runs, sha = MERGE_SHA) => { ctx.fixture({ prs: [], runs }); return runStep(ctx, steps.existing, { SHA: sha }); };

    // Control: main advanced past the merge SHA (all head_sha are the tip), another SHA's run is newer.
    const advanced = [run(100, OTHER_SHA, '2026-10-31T12:00:00Z'), run(101, MERGE_SHA, '2026-10-31T10:00:00Z')];
    const merged = lookup(PRS);
    if (merged.code !== 0) failures.push(`the merged-PR lookup step failed: ${merged.text}`);
    else if (merged.outputs.sha !== MERGE_SHA) failures.push(`the merged-PR lookup chose '${merged.outputs.sha}', expected ${MERGE_SHA}: a cross-repository PR with a higher number must be ignored`);
    const counted = count(advanced);
    if (counted.code !== 0) failures.push(`the existing-run count step failed: ${counted.text}`);
    else if (counted.outputs.count !== '1') failures.push(`with main advanced past the merge SHA the existing-run count is ${counted.outputs.count}, expected 1, so the train would dispatch again every tick`);
    ctx.fixture({ prs: [], runs: advanced });
    const linked = runStep(ctx, steps.run, { SHA: MERGE_SHA });
    if (linked.code !== 0) failures.push(`the run-link step failed: ${linked.text}`);
    else if (linked.outputs.url !== 'https://example.invalid/actions/runs/101') failures.push(`with main advanced past the merge SHA the run link is '${linked.outputs.url ?? ''}', expected the run titled for the merge SHA (not linked, or the newer run of another SHA)`);

    // Decoys: each carries the right title and is wrong in exactly one attribute; none may be counted.
    const decoys = [
        ['another repository', { head_repository: { full_name: 'fork-fixture/repo-fixture' } }],
        ['another workflow path', { path: '.github/workflows/verify.yml' }],
        ['another event', { event: 'push' }],
    ];
    for (const [label, over] of decoys) {
        const c = count([run(110, MERGE_SHA, '2026-10-31T10:00:00Z', over)]);
        if (c.code !== 0 || c.outputs.count !== '0') failures.push(`the existing-run count included a run from ${label} (count ${c.outputs.count ?? 'none'}, step exit ${c.code}), so the train would treat it as the release run`);
    }

    // Fresh: nothing dispatched for the merge SHA yet. The dispatch is a POST of the merge SHA on main.
    const fresh = count([run(100, OTHER_SHA, '2026-10-31T12:00:00Z')]);
    if (fresh.outputs.count !== '0') failures.push(`a run for another SHA made the count ${fresh.outputs.count}, expected 0`);
    ctx.fixture({ prs: [], runs: [] });
    writeFileSync(join(ctx.dir, 'posts'), '');
    const posted = runStep(ctx, steps.dispatch, { SHA: MERGE_SHA });
    let body = null;
    try { body = JSON.parse(posted.posts.split('\n')[0].split(' ').slice(1).join(' ')); } catch { /* reported below */ }
    if (posted.code !== 0 || body?.ref !== 'main' || body?.inputs?.sha !== MERGE_SHA || !posted.posts.startsWith(`repos/${REPO}/actions/workflows/release.yml/dispatches `)) {
        failures.push(`the dispatch step did not POST ref main with inputs.sha ${MERGE_SHA} to release.yml (exit ${posted.code}, posted ${JSON.stringify(posted.posts)})`);
    }
    const waiting = runStep(ctx, steps.run, { SHA: MERGE_SHA });
    if (waiting.code !== 0 || !waiting.summary.includes('not yet visible')) failures.push(`with no run visible the run-link step must end green and say so in the summary (exit ${waiting.code})`);
    return failures;
}

function main() {
    const real = readFileSync(join(REPO_ROOT, WORKFLOW_REL), 'utf8');
    const ctx = makeCtx();
    try {
        if (SELF_TEST) return selfTest(ctx, real);
        const failures = scenarios(ctx, real);
        if (failures.length > 0) {
            console.error(`${NAME}: FAIL -- ${failures.length} problem(s) in ${WORKFLOW_REL} job ${JOB}`);
            failures.forEach(f => console.error(`  ${f}`));
            return 1;
        }
        console.log(`${NAME}: PASS -- the shipped dispatch-release steps count one run and link the run titled for the merge SHA when main has advanced past it, ignore a cross-repository PR and runs from another repository, workflow path or event, and POST the merge SHA on main when none exists`);
        return 0;
    } finally {
        rmSync(ctx.dir, { recursive: true, force: true });
    }
}

function selfTest(ctx, real) {
    const baseline = scenarios(ctx, real);
    if (baseline.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- the unmodified workflow is already red, so the planted-fault results would mean nothing:`);
        baseline.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log('  ok  baseline -> green');
    // Each plant rewrites one anchor of the real text; an absent anchor is a self-test fault.
    const edit = (from, to) => {
        if (!real.includes(from)) throw new Error(`self-test anchor '${from}' is absent from ${WORKFLOW_REL}`);
        return real.split(from).join(to);
    };
    const TITLE = '.display_title == "Release " + env.SHA';
    const plants = [
        ['runs matched on head_sha instead of the display title', edit(TITLE, '.head_sha == env.SHA'), 'dispatch again every tick'],
        ['run link matched on head_sha too (same edit reaches the link step)', edit(TITLE, '.head_sha == env.SHA'), 'the run link is'],
        ['merged lookup without the isCrossRepository select', edit('[.[] | select(.isCrossRepository == false)] | ', ''), 'cross-repository PR'],
        ['merged lookup without --base main', edit('--state merged --base main', '--state merged'), 'unexpected pr list argv'],
        ['runs counted from another repository', edit(' and .head_repository.full_name == env.GITHUB_REPOSITORY', ''), 'run from another repository'],
        ['runs counted from another workflow path', edit(' and ((.path // "") | split("@")[0]) == ".github/workflows/release.yml"', ''), 'run from another workflow path'],
        ['runs counted from another event', edit('select(.event == "workflow_dispatch" and ', 'select('), 'run from another event'],
        ['dispatch no longer gated on a zero count', edit("steps.existing.outputs.count == '0'", "steps.existing.outputs.count != ''"), 'dispatched twice'],
    ];
    let failed = 0;
    for (const [name, plant, expect] of plants) {
        const failures = scenarios(ctx, plant);
        if (failures.some(f => f.includes(expect))) {
            console.log(`  ok  ${name} -> red, naming '${expect}'`);
        } else {
            console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red naming '${expect}'; got: ${failures.join(' | ') || '(no failures)'}`);
            failed += 1;
        }
    }
    if (failed > 0) return 1;
    console.log(`${NAME}: --self-test PASS -- the unmodified workflow is green and ${plants.length} planted faults each went red naming their drift`);
    return 0;
}

process.exit(main());
