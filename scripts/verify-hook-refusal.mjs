#!/usr/bin/env node
// scripts/verify-hook-refusal.mjs
//
// The hook-refusal row (Phase 49, SEC-10). The pre-job hook is the only control bound to the legion
// runner: the runner runs it before the first step of every job, so a refusal there stops a foreign
// job before it executes anything. This row proves the refusal table and the placement it depends on.
//
//  1. Derivation. The expected repo is read from configuration.toml [urls] release_notes
//     (https://github.com/<owner>/<repo>/releases). No repo literal is kept in this file.
//  2. Refusal table. The tracked hook text runs under bash with only the three runner variables set,
//     fed on stdin, so nothing is written. The release triple must exit 0. Each refusal row must exit
//     non-zero and name the expected value on stderr: a foreign-branch GITHUB_WORKFLOW_REF, a push
//     event, a wrong GITHUB_REPOSITORY, and an empty triple.
//  3. Placement. Every job on the powerbrowser-release label starts with the main-and-dispatch refusal
//     (step 1) and carries the full-SHA check as step 2, before any checkout. A legion job missing
//     either is red, naming the job.
//  4. Vacuity. At least one legion job must exist, or the placement proves nothing.
//
// --self-test plants four faults in memory (the foreign-branch ref, the push event and the wrong repo
// in the hook text, and a legion job without the SHA step) and requires each to go red naming the
// drift. The row itself writes nothing.

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
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

function runHook(hookText, triple) {
    const env = { PATH: process.env.PATH ?? '/usr/bin:/bin' };
    for (const [k, v] of Object.entries(triple)) env[k] = v;
    const r = spawnSync('bash', ['-s'], { input: hookText, env, encoding: 'utf8', timeout: 10000 });
    return { status: r.status, stderr: r.stderr ?? '', error: r.error };
}

function refusalTable(expected) {
    const release = { GITHUB_REPOSITORY: expected.repo, GITHUB_WORKFLOW_REF: expected.ref, GITHUB_EVENT_NAME: 'workflow_dispatch' };
    const foreignRef = `${expected.repo}/${WORKFLOW_REL}@refs/heads/feature-branch`;
    return [
        { name: 'release triple', triple: release, accept: true },
        { name: 'foreign-branch workflow ref', triple: { ...release, GITHUB_WORKFLOW_REF: foreignRef }, expect: expected.ref },
        { name: 'push event', triple: { ...release, GITHUB_EVENT_NAME: 'push' }, expect: 'workflow_dispatch' },
        { name: 'wrong repo', triple: { ...release, GITHUB_REPOSITORY: WRONG_REPO }, expect: expected.repo },
        { name: 'empty triple', triple: {}, expect: expected.repo },
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
                failures.push(`${HOOK_REL}: refused the ${row.name} (exit ${r.status}; ${describeTriple(row.triple)}; stderr: ${r.stderr.trim() || 'none'}). Next step: restore the release triple in ${HOOK_REL}: GITHUB_REPOSITORY '${expected.repo}', GITHUB_WORKFLOW_REF '${expected.ref}', GITHUB_EVENT_NAME 'workflow_dispatch'.`);
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
    console.log(`${NAME}: PASS -- ${HOOK_REL} accepts only the release triple for ${expected.repo} and refuses a foreign branch ref, a push event, a wrong repo and an empty triple, naming the expected value; ${legionCount} ${LEGION_LABEL} job(s) start with the main-and-dispatch refusal and carry the full-SHA check second, before any checkout.`);
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

    // Each hook plant drops the one line that carries the named variable's test. The anchor must match
    // exactly one line, so an edit that renames the variable goes red here, not silently.
    const hookWithoutLine = (marker) => (rel) => {
        if (rel !== HOOK_REL) return realRead(rel);
        const lines = realRead(HOOK_REL).split('\n');
        const hits = lines.filter(l => l.includes(marker));
        if (hits.length !== 1) throw new Error(`self-test anchor '${marker}' matches ${hits.length} line(s) in ${HOOK_REL}`);
        return lines.filter(l => !l.includes(marker)).join('\n');
    };

    const withoutShaStep = () => {
        const wf = structuredClone(parseWorkflow(realRead(WORKFLOW_REL)));
        const job = wf.jobs[BUILD_JOB];
        const at = job.steps.findIndex(s => SHA_RE.test(String(s?.run ?? '')));
        if (at < 0) throw new Error(`self-test anchor 'full-SHA step' is absent from ${WORKFLOW_REL} job ${BUILD_JOB}`);
        job.steps.splice(at, 1);
        return wf;
    };

    // Each plant: [name, overrides, file, needle one, needle two]. Red must name the file, the drifted
    // variable or job, and the value or check that drifted.
    const plants = [
        ['foreign-branch GITHUB_WORKFLOW_REF accepted', { read: hookWithoutLine('"$ref" = ') }, HOOK_REL, 'GITHUB_WORKFLOW_REF', `${repo}/${WORKFLOW_REL}@refs/heads/feature-branch`],
        ['push event accepted', { read: hookWithoutLine('"$event" = ') }, HOOK_REL, 'GITHUB_EVENT_NAME', "GITHUB_EVENT_NAME='push'"],
        ['wrong repo accepted', { read: hookWithoutLine('"$repo" = ') }, HOOK_REL, 'GITHUB_REPOSITORY', WRONG_REPO],
        ['legion job without the SHA step', { workflow: withoutShaStep() }, WORKFLOW_REL, BUILD_JOB, 'full-SHA'],
    ];

    let failed = 0;
    for (const [name, overrides, file, variable, value] of plants) {
        const { failures } = runChecks(REPO_ROOT, { read: realRead, ...overrides });
        const hit = failures.some(f => f.includes(file) && f.includes(variable) && f.includes(value));
        if (hit) {
            console.log(`  ok  ${name} -> red, naming '${file}', '${variable}' and '${value}'`);
        } else {
            console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red naming '${file}', '${variable}' and '${value}'; got: ${failures.join(' | ') || '(no failures at all)'}`);
            failed += 1;
        }
    }

    if (failed > 0) return 1;
    console.log(`${NAME}: --self-test PASS -- the unmodified hook and release.yml are green and ${plants.length} planted faults went red naming the file, the variable or job, and the value. It writes nothing: the hook runs on stdin.`);
    return 0;
}

process.exit(main());
