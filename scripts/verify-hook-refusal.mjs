#!/usr/bin/env node
// scripts/verify-hook-refusal.mjs
//
// The hook-refusal row (Phase 49, SEC-10). The pre-job hook is the only control bound to the legion
// runner: the runner runs it before the first step of every job, so a refusal there stops a foreign
// job before it executes anything. This row proves the refusal table and the placement it depends on.
//
//  1. Derivation. The expected repo is read from configuration.toml [urls] release_notes
//     (https://github.com/<owner>/<repo>/releases). No repo literal is kept in this file.
//  2. Refusal table. The tracked hook text runs under bash with an empty environment plus only the
//     planted variables (the equivalent of env -i), fed on stdin, so nothing is written. The release
//     triple must exit 0. Each refusal row must exit non-zero and name the expected value on stderr:
//     a foreign-branch GITHUB_WORKFLOW_REF, a push event, a wrong GITHUB_REPOSITORY, a run attempt other than 1 (a re-run replays an older workflow file), an empty triple,
//     and a hostile environment (BASH_ENV, ENV, an exported function shadowing [, exit, echo or builtin).
//     The near-miss rows are derived from the expected triple: another workflow file on main, a branch
//     name with a suffix, a tag called main, an upper-case ref, a trailing space, an empty and a missing
//     variable per variable, the other event names, and the owner in another case.
//  3. Placement. Every job on the powerbrowser-release label starts with the main-and-dispatch refusal
//     (step 1) and carries the full-SHA check as step 2, before any checkout. A legion job missing
//     either is red, naming the job.
//  4. Vacuity. At least one legion job must exist, or the placement proves nothing.
//
// --self-test plants faults in memory (a dropped test, a weakened `[` test, a dropped hostile-environment
// guard and posix mode in the hook text, and a legion job without the SHA step) and requires each to
// go red naming the row it now wrongly accepts. The row itself writes nothing.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveConfig } from './generate.mjs';
import { loadYaml, stepsOf } from './lib/release-workflow.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'hook-refusal';
const SELF_REL = 'scripts/verify-hook-refusal.mjs';
const HOOK_REL = 'scripts/legion-pre-job-hook.sh';
const WORKFLOW_REL = '.github/workflows/release.yml';
const MANIFEST_REL = 'configuration.toml';
const LEGION_LABEL = 'powerbrowser-release';
const BUILD_JOB = 'build-linux';
// An arbitrary foreign repo for the wrong-repo row; it only has to differ from the derived one.
const WRONG_REPO = 'example/unrelated-repo';
const SHA_RE = /\^\[0-9a-f\]\{40\}\$/;

const args = process.argv.slice(2);
for (const a of args) {
    if (a !== '--self-test') {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
        console.error(`  Next step: run: node ${SELF_REL}, or add --self-test to prove the refusal table discriminates.`);
        process.exit(2);
    }
}

function readText(root, rel) {
    try {
        return readFileSync(join(root, rel), 'utf8');
    } catch {
        return null;
    }
}

function parseWorkflow(text) {
    return loadYaml().load(text);
}

function repoFromConfig(config) {
    const m = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\/releases$/.exec(String(config?.urls?.release_notes ?? ''));
    return m ? m[1] : null;
}

function labelsOf(job) {
    const r = job?.['runs-on'];
    if (Array.isArray(r)) return r.map(String);
    if (typeof r === 'string') return [r];
    if (r !== null && typeof r === 'object') return [].concat(r.labels ?? []).map(String);
    return [];
}

// Step 1 of every legion job: refuse any event but workflow_dispatch and any ref but refs/heads/main.
const refGuard = r => r.includes('[ "$GITHUB_EVENT_NAME" = "workflow_dispatch" ]')
    && r.includes('[ "$GITHUB_REF" = "refs/heads/main" ]')
    && /\|\| \{[^}]*exit 1/.test(r);

// Triple as a readable list for failure messages: names every variable and the value it carried.
const describeTriple = (triple) => {
    const parts = Object.entries(triple).map(([k, v]) => `${k}='${v}'`);
    return parts.length > 0 ? parts.join(', ') : 'no runner variables set';
};

// The bash that runs the hook. An absolute path, because the hook runs with no PATH at all.
const BASH = [...['/run/current-system/sw/bin', '/usr/bin', '/bin'], ...(process.env.PATH ?? '').split(':')]
    .map(d => join(d, 'bash')).find(p => existsSync(p)) ?? 'bash';

// vars is the whole environment of the hook process: nothing is inherited, so the hook sees exactly the
// planted variables (env -i plus those variables).
function runHook(hookText, vars) {
    const r = spawnSync(BASH, ['--noprofile', '--norc', '-s'], { input: hookText, env: vars, encoding: 'utf8', timeout: 10000 });
    return { status: r.status, stderr: r.stderr ?? '', error: r.error };
}

function refusalTable(expected) {
    const release = { GITHUB_REPOSITORY: expected.repo, GITHUB_WORKFLOW_REF: expected.ref, GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_RUN_ATTEMPT: '1' };
    const foreign = { GITHUB_REPOSITORY: WRONG_REPO, GITHUB_WORKFLOW_REF: `${WRONG_REPO}/${WORKFLOW_REL}@refs/heads/feature-branch`, GITHUB_EVENT_NAME: 'push' };
    const foreignRef = `${expected.repo}/${WORKFLOW_REL}@refs/heads/feature-branch`;
    const [owner, repoName] = expected.repo.split('/');
    // A function exported into the environment is how a hostile job would replace a test or an exit.
    const fn = (fname, body) => ({ [`BASH_FUNC_${fname}%%`]: `() { ${body}; }` });
    return [
        { name: 'release triple', triple: release, accept: true },
        { name: 'foreign-branch workflow ref', triple: { ...release, GITHUB_WORKFLOW_REF: foreignRef }, expect: expected.ref },
        { name: 'push event', triple: { ...release, GITHUB_EVENT_NAME: 'push' }, expect: 'workflow_dispatch' },
        { name: 'wrong repo', triple: { ...release, GITHUB_REPOSITORY: WRONG_REPO }, expect: expected.repo },
        { name: 'empty triple', triple: {}, expect: expected.repo },
        // Rows derived from the expected triple, so a loosened test (a glob, a prefix, a case-fold, a trim)
        // accepts one of them and goes red. Nothing here is a hand-kept list of literals.
        { name: 'other workflow file on main', triple: { ...release, GITHUB_WORKFLOW_REF: expected.ref.replace(/[^/]+@/, 'ci.yml@') }, expect: expected.ref },
        { name: 'ref with a suffix on the main branch name', triple: { ...release, GITHUB_WORKFLOW_REF: `${expected.ref}-x` }, expect: expected.ref },
        { name: 'ref naming a tag called main', triple: { ...release, GITHUB_WORKFLOW_REF: expected.ref.replace('refs/heads/', 'refs/tags/') }, expect: expected.ref },
        { name: 'ref in upper case', triple: { ...release, GITHUB_WORKFLOW_REF: expected.ref.toUpperCase() }, expect: expected.ref },
        ...Object.entries(release).flatMap(([k, v]) => [
            { name: `${k} with a trailing space`, triple: { ...release, [k]: `${v} ` }, expect: v },
            { name: `${k} empty`, triple: { ...release, [k]: '' }, expect: v },
            { name: `${k} missing`, triple: Object.fromEntries(Object.entries(release).filter(([n]) => n !== k)), expect: v },
        ]),
        ...['pull_request', 'workflow_call', 'schedule', 'Workflow_Dispatch', 'workflow_dispatch_x'].map(e => (
            { name: `${e} event`, triple: { ...release, GITHUB_EVENT_NAME: e }, expect: 'workflow_dispatch' })),
        ...[owner.toUpperCase(), owner.toLowerCase()].filter(o => o !== owner).map(o => (
            { name: `repo owner as ${o}`, triple: { ...release, GITHUB_REPOSITORY: `${o}/${repoName}` }, expect: expected.repo })),
        ...['2', '10', '01', '0'].map(n => (
            { name: `run attempt ${n}`, triple: { ...release, GITHUB_RUN_ATTEMPT: n }, expect: "GITHUB_RUN_ATTEMPT must be '1'" })),
        { name: 'BASH_ENV set with the release triple', triple: { ...release, BASH_ENV: '/dev/null' }, expect: 'BASH_ENV' },
        { name: 'empty BASH_ENV with the release triple', triple: { ...release, BASH_ENV: '' }, expect: 'BASH_ENV' },
        { name: 'ENV set with the release triple', triple: { ...release, ENV: '/dev/null' }, expect: 'ENV' },
        { name: 'exported function [ with the release triple', triple: { ...release, ...fn('[', 'return 0') }, expect: 'exported shell function' },
        { name: 'exported function [ shadowing the tests', triple: { ...foreign, ...fn('[', 'return 0') }, expect: 'exported shell function' },
        { name: 'exported function exit shadowing the refusal', triple: { ...foreign, ...fn('exit', 'builtin exit 0') }, expect: 'exported shell function' },
        { name: 'exported function echo shadowing the message', triple: { ...foreign, ...fn('echo', ':') }, expect: 'exported shell function' },
        { name: 'exported function builtin shadowing the builtin prefix', triple: { ...foreign, ...fn('builtin', 'exit 0') }, expect: expected.repo },
    ];
}

function checkRows(hookText, expected, failures) {
    for (const row of refusalTable(expected)) {
        const r = runHook(hookText, row.triple);
        if (r.error) {
            failures.push(`${HOOK_REL}: bash could not run the hook for the ${row.name} row (${r.error.message}). Next step: install bash, or run the row where it is installed.`);
            continue;
        }
        if (row.accept) {
            if (r.status !== 0) {
                failures.push(`${HOOK_REL}: refused the ${row.name} (exit ${r.status}; ${describeTriple(row.triple)}; stderr: ${r.stderr.trim() || 'none'}). Next step: restore the release triple in ${HOOK_REL}: GITHUB_REPOSITORY '${expected.repo}', GITHUB_WORKFLOW_REF '${expected.ref}', GITHUB_EVENT_NAME 'workflow_dispatch', GITHUB_RUN_ATTEMPT '1'.`);
            }
            continue;
        }
        if (r.status === 0) {
            failures.push(`${HOOK_REL}: accepted the ${row.name} (exit 0; ${describeTriple(row.triple)}). Next step: restore the refusal in ${HOOK_REL}; it must refuse every triple but the release triple for ${expected.repo}.`);
        } else if (!r.stderr.includes(row.expect)) {
            failures.push(`${HOOK_REL}: refused the ${row.name} (exit ${r.status}) without naming the expected value '${row.expect}'. Next step: make the refusal message name it.`);
        }
    }
}

function placement(wf) {
    const failures = [];
    const jobs = wf?.jobs ?? {};
    const legion = Object.keys(jobs).filter(id => labelsOf(jobs[id]).includes(LEGION_LABEL));
    if (legion.length === 0) {
        failures.push(`${WORKFLOW_REL} has no job on the ${LEGION_LABEL} label, so the placement is unproven. Next step: restore runs-on: [self-hosted, ${LEGION_LABEL}] on ${BUILD_JOB}.`);
    }
    for (const id of legion) {
        const steps = stepsOf(jobs[id]);
        if (!refGuard(String(steps[0]?.run ?? ''))) {
            failures.push(`${WORKFLOW_REL} job '${id}' does not start with the main-and-dispatch refusal (step 1 must refuse any event but workflow_dispatch and any ref but refs/heads/main). Next step: restore it as the first step.`);
        }
        const sha = steps[1];
        if (!(sha && SHA_RE.test(String(sha.run ?? '')) && /exit 1/.test(String(sha.run ?? '')))) {
            failures.push(`${WORKFLOW_REL} job '${id}' has no full-SHA check as its second step (^[0-9a-f]{40}$ with exit 1, before the checkout). Next step: restore the SHA step directly after the refusal, so a branch or tag name cannot reach the checkout.`);
        }
    }
    return { failures, legionCount: legion.length };
}

function runChecks(root, overrides = {}) {
    const failures = [];
    const read = overrides.read ?? ((rel) => readText(root, rel));

    // --- 1. derivation -----------------------------------------------------
    const resolved = resolveConfig(join(root, MANIFEST_REL));
    if (resolved.config === undefined || resolved.failures.length > 0) {
        failures.push(`${MANIFEST_REL} does not resolve, so the hook's expected repo cannot be derived. Next step: run node scripts/generate.mjs -- it reports the faulty key.`);
        return { failures, expected: null, legionCount: 0 };
    }
    const repo = repoFromConfig(resolved.config);
    if (repo === null) {
        failures.push(`${MANIFEST_REL} [urls] release_notes does not name a GitHub repo, so the hook's expected repo cannot be derived. Next step: set release_notes to https://github.com/<owner>/<repo>/releases.`);
        return { failures, expected: null, legionCount: 0 };
    }
    const expected = { repo, ref: `${repo}/${WORKFLOW_REL}@refs/heads/main` };

    // --- 2. refusal table over the tracked hook text ------------------------
    const hook = read(HOOK_REL);
    if (hook === null) {
        failures.push(`${HOOK_REL} could not be read. Next step: restore the tracked hook.`);
    } else {
        checkRows(hook, expected, failures);
    }

    // --- 3. placement in release.yml (or the parsed object a plant supplies) -
    let wf = overrides.workflow;
    if (wf === undefined) {
        const text = read(WORKFLOW_REL);
        if (text === null) {
            failures.push(`${WORKFLOW_REL} could not be read. Next step: restore the release workflow.`);
        } else {
            try {
                wf = parseWorkflow(text);
            } catch (e) {
                failures.push(`${WORKFLOW_REL} does not parse as YAML (${e.message.split('\n')[0]}). Next step: fix the file.`);
            }
        }
    }
    let legionCount = 0;
    if (wf !== undefined) {
        const p = placement(wf);
        failures.push(...p.failures);
        legionCount = p.legionCount;
    }

    return { failures, expected, legionCount };
}

function main() {
    if (args.includes('--self-test')) return selfTest();
    const { failures, expected, legionCount } = runChecks(REPO_ROOT);
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} problem(s) with the pre-job hook or its placement.`);
        failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- ${HOOK_REL} accepts only the release triple for ${expected.repo} and refuses a foreign branch ref, a push event, a wrong repo, a re-run attempt, an empty triple and a hostile environment (BASH_ENV, ENV, an exported function shadowing [, exit, echo or builtin), naming the expected value; ${legionCount} ${LEGION_LABEL} job(s) start with the main-and-dispatch refusal and carry the full-SHA check second, before any checkout.`);
    return 0;
}

function selfTest() {
    const cache = new Map();
    const realRead = (rel) => {
        if (!cache.has(rel)) cache.set(rel, readText(REPO_ROOT, rel));
        return cache.get(rel);
    };
    const baseline = runChecks(REPO_ROOT, { read: realRead });
    if (baseline.failures.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- the unmodified tree is already red, so the planted-fault results below would mean nothing:`);
        baseline.failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log(`  ok  baseline -> green`);
    const repo = baseline.expected.repo;

    // A hook plant edits the real hook text. Its anchor must match exactly one line, so an edit that
    // renames the variable goes red here, not silently. edit returns the replacement line, or null to drop it.
    const hookEdit = (test, edit) => (rel) => {
        if (rel !== HOOK_REL) return realRead(rel);
        const lines = realRead(HOOK_REL).split('\n');
        const hits = lines.filter(test);
        if (hits.length !== 1) throw new Error(`self-test anchor ${test} matches ${hits.length} line(s) in ${HOOK_REL}`);
        const out = lines.map(l => (test(l) ? edit(l) : l));
        if (out.some((l, i) => l === lines[i] && test(lines[i]))) throw new Error(`self-test edit of ${test} changed nothing in ${HOOK_REL}`);
        return out.filter(l => l !== null).join('\n');
    };
    // A loosening keeps the test but weakens it: edit rewrites the variable's operand or pattern.
    const loosen = (variable, edit) => hookEdit(l => l.startsWith(`[[ "$${variable}" == `), edit);
    const [owner] = repo.split('/');
    const withoutLine = (marker) => hookEdit(l => l.includes(marker), () => null);
    const withoutPosixMode = hookEdit(l => l === 'POSIXLY_CORRECT=1', () => null);
    // The first hook of this plan: single-bracket tests and no exported-function guard.
    const singleBracketNoGuard = (rel) => {
        if (rel !== HOOK_REL) return realRead(rel);
        const text = realRead(HOOK_REL);
        const weak = text.replace(/^\[\[ "\$(\w+)" == ('[^']*') \]\]/gm, '[ "$$$1" = $2 ]').split('\n').filter(l => !l.includes('export -f)')).join('\n');
        if (weak === text || !weak.includes('[ "$ref" = ')) throw new Error(`self-test anchor 'single-bracket tests' does not apply to ${HOOK_REL}`);
        return weak;
    };

    const withoutShaStep = () => {
        const wf = structuredClone(parseWorkflow(realRead(WORKFLOW_REL)));
        const job = wf.jobs[BUILD_JOB];
        const at = job.steps.findIndex(s => SHA_RE.test(String(s?.run ?? '')));
        if (at < 0) throw new Error(`self-test anchor 'full-SHA step' is absent from ${WORKFLOW_REL} job ${BUILD_JOB}`);
        job.steps.splice(at, 1);
        return wf;
    };

    // Each plant: [name, overrides, ...needles]. Red must carry every needle in one failure: the file, the
    // drifted variable or job, and the value, or the name of the row the weakened hook now wrongly accepts.
    const plants = [
        ['foreign-branch GITHUB_WORKFLOW_REF accepted', { read: withoutLine('"$ref" == ') }, HOOK_REL, 'GITHUB_WORKFLOW_REF', `${repo}/${WORKFLOW_REL}@refs/heads/feature-branch`],
        ['push event accepted', { read: withoutLine('"$event" == ') }, HOOK_REL, 'GITHUB_EVENT_NAME', "GITHUB_EVENT_NAME='push'"],
        ['wrong repo accepted', { read: withoutLine('"$repo" == ') }, HOOK_REL, 'GITHUB_REPOSITORY', WRONG_REPO],
        ['ref test loosened to a suffix glob', { read: loosen('ref', () => '[[ "$ref" == *@refs/heads/main ]] || exit 1') }, HOOK_REL, 'accepted the other workflow file on main'],
        ['ref test loosened to a prefix glob', { read: loosen('ref', l => l.replace("' ]]", "'* ]]")) }, HOOK_REL, 'accepted the ref with a suffix on the main branch name'],
        ['ref test loosened to match a tag called main', { read: loosen('ref', l => l.replace('refs/heads/main', "refs/'*'/main")) }, HOOK_REL, 'accepted the ref naming a tag called main'],
        ['event test loosened to a glob', { read: loosen('event', l => l.replace("'workflow_dispatch'", 'workflow_*')) }, HOOK_REL, 'accepted the workflow_call event'],
        ['event test case-folded', { read: loosen('event', l => l.replace('"$event"', '"${event,,}"')) }, HOOK_REL, 'accepted the Workflow_Dispatch event'],
        ['event test trimming a trailing space', { read: loosen('event', l => l.replace('"$event"', '"${event% }"')) }, HOOK_REL, 'accepted the GITHUB_EVENT_NAME with a trailing space'],
        ['repo test case-folded', { read: loosen('repo', l => l.replace('"$repo"', '"${repo,,}"').replace(`'${repo}'`, `'${repo.toLowerCase()}'`)) }, HOOK_REL, `accepted the repo owner as ${owner.toUpperCase()}`],
        ['re-run attempt accepted', { read: withoutLine('"$attempt" == ') }, HOOK_REL, 'accepted the run attempt 2'],
        ['exported-function guard dropped', { read: withoutLine('export -f)') }, HOOK_REL, 'accepted the exported function [ with the release triple'],
        ['BASH_ENV guard dropped', { read: withoutLine('[[ ! -v BASH_ENV') }, HOOK_REL, 'accepted the BASH_ENV set with the release triple'],
        ['posix mode dropped', { read: withoutPosixMode }, HOOK_REL, 'accepted the exported function exit shadowing the refusal'],
        ['single-bracket tests without the function guard', { read: singleBracketNoGuard }, HOOK_REL, 'accepted the exported function [ shadowing the tests'],
        ['legion job without the SHA step', { workflow: withoutShaStep() }, WORKFLOW_REL, BUILD_JOB, 'full-SHA'],
    ];

    let failed = 0;
    for (const [name, overrides, ...needles] of plants) {
        const { failures } = runChecks(REPO_ROOT, { read: realRead, ...overrides });
        const hit = failures.some(f => needles.every(n => f.includes(n)));
        const named = needles.map(n => `'${n}'`).join(' and ');
        if (hit) {
            console.log(`  ok  ${name} -> red, naming ${named}`);
        } else {
            console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red naming ${named}; got: ${failures.join(' | ') || '(no failures at all)'}`);
            failed += 1;
        }
    }

    if (failed > 0) return 1;
    console.log(`${NAME}: --self-test PASS -- the unmodified hook and release.yml are green and ${plants.length} planted faults went red naming the file, the variable or job, the value or the row now wrongly accepted. It writes nothing: the hook runs on stdin.`);
    return 0;
}

process.exit(main());
