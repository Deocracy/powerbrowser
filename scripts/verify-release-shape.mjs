#!/usr/bin/env node
// scripts/verify-release-shape.mjs
//
// The release-shape row (Phase 49, DIST-02). It reads .github/workflows/release.yml
// and checks the properties the release path depends on that the workflows row
// (GH-12 trust boundary) does not cover:
//
//  1. trigger    The only event is workflow_dispatch. A pull-request, tag, branch or
//                timed trigger is red naming the event.
//  2. sha-input  on.workflow_dispatch.inputs.sha exists, is type string, is required,
//                and carries no default, so a dispatch must name the commit.
//  3. legion     build-linux runs on the release label set with no environment key and
//                no secrets. reference in the job or the workflow-level env.
//  4. gates      build-linux holds two named steps before the first build step: the
//                SHA gate (id sha_gate, a merge-base --is-ancestor check) and the
//                key>tag gate (id key_gate, a Releases read that writes build= to
//                GITHUB_OUTPUT). A missing gate, or one placed after the build, is red.
//  5. retention  Every actions/upload-artifact step sets retention-days to 1, and the
//                file carries at least one upload step, so the rule is not vacuous.
//  6. no-cache   No actions/cache step and no `cache` input anywhere in the file.
//
// Instrument: js-yaml from theia/ through createRequire, the same loader as the
// workflows row. A missing js-yaml, an unreadable file and a parse error are FAILs.
//
// Honestly --quick: it reads the workflow text and parses YAML. Its self-test plants
// each fault in memory through runChecks' overrides and writes nothing. It does not
// build, open a browser or display, or reach the network. The live gate reads (the
// latest Release, the key comparison) run in the workflow itself, and this row only
// proves the workflow text carries them.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'release-shape';
const SELF_REL = 'scripts/verify-release-shape.mjs';
const RELEASE_REL = '.github/workflows/release.yml';
const LEGION_LABEL = 'powerbrowser-release';
const BUILD_JOB = 'build-linux';
const UPLOAD = /^actions\/upload-artifact@/;
const CACHE = /^actions\/cache@/;
const BUILD_STEP = /podman\s|\.\/mach\b/;

const args = process.argv.slice(2);
for (const a of args) {
    if (a !== '--self-test') {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
        console.error(`  Next step: run: node ${SELF_REL}, or add --self-test to prove the shape rules discriminate.`);
        process.exit(2);
    }
}

let yaml;
try {
    yaml = createRequire(join(REPO_ROOT, 'theia', 'package.json'))('js-yaml');
} catch {
    console.error(`${NAME}: FAIL -- broken instrument: js-yaml is not installed in theia/. Next step: run yarn install in theia/ first.`);
    process.exit(1);
}

function readText(root, rel) {
    try {
        return readFileSync(join(root, rel), 'utf8');
    } catch {
        return null;
    }
}

function labelsOf(job) {
    const r = job?.['runs-on'];
    if (Array.isArray(r)) return r.map(String);
    if (r !== null && typeof r === 'object') return [].concat(r.labels ?? []).map(String);
    return r === undefined ? [] : [String(r)];
}

function stepsOf(job) {
    return Array.isArray(job?.steps) ? job.steps.filter(s => s !== null && typeof s === 'object') : [];
}

function runChecks(root, overrides = {}) {
    const failures = [];
    const fail = (job, rule, msg) => failures.push({ file: RELEASE_REL, job, rule, msg });

    const text = overrides.text ?? readText(root, RELEASE_REL);
    if (text === null) {
        fail('(workflow)', 'parse', `${RELEASE_REL} could not be read. Next step: restore the release workflow.`);
        return { failures };
    }
    let wf;
    try {
        wf = yaml.load(text);
    } catch (e) {
        fail('(workflow)', 'parse', `does not parse as YAML 1.2 (${e.message.split('\n')[0]}). Next step: fix the file; a duplicate key is refused on purpose.`);
        return { failures };
    }
    if (wf === null || typeof wf !== 'object' || wf.jobs === null || typeof wf.jobs !== 'object') {
        fail('(workflow)', 'parse', 'carries no jobs map. Next step: fix the file.');
        return { failures };
    }

    // 1. trigger
    const on = wf.on;
    const events = typeof on === 'string' ? [on] : Array.isArray(on) ? on.map(String) : on && typeof on === 'object' ? Object.keys(on) : [];
    for (const ev of events) {
        if (ev !== 'workflow_dispatch') {
            fail('(workflow)', 'trigger', `is triggered by '${ev}'. The release runs on workflow_dispatch only. Next step: remove the '${ev}' trigger.`);
        }
    }
    if (!events.includes('workflow_dispatch')) {
        fail('(workflow)', 'trigger', `has no workflow_dispatch trigger. Next step: restore on: workflow_dispatch with the sha input.`);
    }

    // 2. sha input
    const sha = on?.workflow_dispatch?.inputs?.sha;
    if (sha === undefined || sha === null || typeof sha !== 'object') {
        fail('(workflow)', 'sha-input', `has no sha input under workflow_dispatch. Next step: add inputs.sha, required, type string, no default.`);
    } else {
        if (sha.required !== true) fail('(workflow)', 'sha-input', `sha input is not required (required: ${JSON.stringify(sha.required)}). Next step: set required: true.`);
        if (sha.type !== 'string') fail('(workflow)', 'sha-input', `sha input has type ${JSON.stringify(sha.type)}. Next step: set type: string.`);
        if (Object.hasOwn(sha, 'default')) fail('(workflow)', 'sha-input', `sha input carries a default. Next step: remove it; a dispatch must name the commit.`);
    }

    // 3. legion placement
    const legionJobs = Object.keys(wf.jobs).filter(id => labelsOf(wf.jobs[id]).includes(LEGION_LABEL));
    if (!legionJobs.includes(BUILD_JOB)) {
        fail(BUILD_JOB, 'legion', `does not run on the ${LEGION_LABEL} label. Next step: put runs-on: [self-hosted, ${LEGION_LABEL}] on ${BUILD_JOB}.`);
    }
    const wfEnvText = JSON.stringify(wf.env ?? {});
    for (const id of legionJobs) {
        const job = wf.jobs[id];
        if (Object.hasOwn(job, 'environment')) {
            fail(id, 'legion', `runs on ${LEGION_LABEL} and has an environment key (environment: ${JSON.stringify(job.environment)}). A legion job holds no environment. Next step: move the environment to a hosted job.`);
        }
        if (JSON.stringify(job).includes('secrets.') || wfEnvText.includes('secrets.')) {
            fail(id, 'legion', `runs on ${LEGION_LABEL} and reaches a secrets. reference. Next step: remove it; build-linux holds no secret.`);
        }
    }

    // 4. gates, present before the first build step
    const build = wf.jobs[BUILD_JOB];
    const steps = stepsOf(build);
    const byId = id => steps.findIndex(s => s.id === id);
    const buildAt = steps.findIndex(s => BUILD_STEP.test(String(s.run ?? '')));
    const shaAt = byId('sha_gate');
    const keyAt = byId('key_gate');
    if (shaAt < 0) {
        fail(BUILD_JOB, 'gates', `has no SHA-ancestor gate (a step with id sha_gate). Next step: add the step that checks the SHA is main's tip or a configuration.toml ancestor with main's workflows.`);
    } else if (!/merge-base --is-ancestor/.test(String(steps[shaAt].run ?? ''))) {
        fail(BUILD_JOB, 'gates', `has a sha_gate step with no merge-base --is-ancestor check, so the SHA-ancestor gate does not hold. Next step: restore the ancestor check.`);
    } else if (buildAt >= 0 && shaAt > buildAt) {
        fail(BUILD_JOB, 'gates', `runs the SHA-ancestor gate after the build step. Next step: move the gate before the first build step.`);
    }
    if (keyAt < 0) {
        fail(BUILD_JOB, 'gates', `has no key>tag gate (a step with id key_gate). Next step: add the step that exits without building when the release key is not newer than the latest Release.`);
    } else if (!/GITHUB_OUTPUT/.test(String(steps[keyAt].run ?? '')) || !/releases/.test(String(steps[keyAt].run ?? ''))) {
        fail(BUILD_JOB, 'gates', `has a key_gate step that does not read the Releases and write build= to GITHUB_OUTPUT, so the key>tag gate does not hold. Next step: restore the Releases read and the output.`);
    } else if (buildAt >= 0 && keyAt > buildAt) {
        fail(BUILD_JOB, 'gates', `runs the key>tag gate after the build step. Next step: move the gate before the first build step.`);
    }

    // 5. retention and 6. no cache, over every job
    let uploads = 0;
    for (const [id, job] of Object.entries(wf.jobs)) {
        for (const s of stepsOf(job)) {
            const uses = typeof s.uses === 'string' ? s.uses : '';
            if (UPLOAD.test(uses)) {
                uploads += 1;
                if (Number(s.with?.['retention-days']) !== 1) {
                    fail(id, 'retention', `upload-artifact step '${s.name ?? uses}' sets retention-days ${JSON.stringify(s.with?.['retention-days'])}, not 1. Next step: set retention-days: 1 so the artifact cap holds.`);
                }
            }
            if (CACHE.test(uses)) {
                fail(id, 'no-cache', `step '${s.name ?? uses}' uses ${uses}; a cache restored into release bytes can be poisoned. Next step: remove the actions/cache step.`);
            }
            if (s.with !== null && typeof s.with === 'object' && Object.hasOwn(s.with, 'cache')) {
                fail(id, 'no-cache', `step '${s.name ?? uses}' sets a cache input; a cache restored into release bytes can be poisoned. Next step: remove the cache input.`);
            }
        }
    }
    if (uploads === 0) {
        fail('(workflow)', 'retention', `carries no upload-artifact step, so the retention rule would hold over nothing. Next step: upload the tarball, the MAR and the manifest with retention-days: 1.`);
    }

    const key = f => [f.file, f.job, f.rule, f.msg];
    failures.sort((a, b) => {
        const ka = key(a), kb = key(b);
        for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] < kb[i] ? -1 : 1;
        return 0;
    });
    return { failures, uploads };
}

const fmt = f => `${f.file} job ${f.job} [${f.rule}]: ${f.msg}`;

function main() {
    if (args.includes('--self-test')) return selfTest();
    const { failures, uploads } = runChecks(REPO_ROOT);
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} problem(s) with the release workflow shape.`);
        failures.forEach(f => console.error(`  ${fmt(f)}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- ${RELEASE_REL} dispatches on workflow_dispatch only with a required sha input; build-linux runs on ${LEGION_LABEL} with no environment and no secret; the SHA-ancestor and key>tag gates precede the build; ${uploads} upload-artifact step(s) keep retention-days 1; no cache step or cache input.`);
    return 0;
}

function selfTest() {
    const real = readText(REPO_ROOT, RELEASE_REL);
    if (real === null) {
        console.error(`${NAME}: --self-test FAIL -- ${RELEASE_REL} could not be read. Next step: restore the release workflow.`);
        return 1;
    }
    const baseline = runChecks(REPO_ROOT, { text: real });
    if (baseline.failures.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- the unmodified tree is already red, so the planted-fault results below would mean nothing:`);
        baseline.failures.forEach(f => console.error(`  ${fmt(f)}`));
        return 1;
    }
    console.log(`  ok  baseline -> green`);

    // Each plant rewrites one anchor of the real text; an absent anchor is a self-test
    // fault, never a silent pass.
    const edit = (from, to) => {
        if (!real.includes(from)) throw new Error(`self-test anchor '${from.trim()}' is absent from ${RELEASE_REL}`);
        return real.replace(from, to);
    };
    const RUNS_ON = '    runs-on: [self-hosted, powerbrowser-release]\n';
    const CHECKOUT_RUN = '      - name: Generate the derived build surfaces\n';
    const plants = [
        ['pull_request trigger added', edit('on:\n  workflow_dispatch:', 'on:\n  pull_request:\n  workflow_dispatch:'), 'pull_request'],
        ['tag push trigger added', edit('on:\n  workflow_dispatch:', 'on:\n  push:\n    tags: ["v*"]\n  workflow_dispatch:'), 'push'],
        ['sha input not required', edit('        required: true\n', '        required: false\n'), 'required'],
        ['legion job build-linux with environment:', edit(RUNS_ON, `${RUNS_ON}    environment: release\n`), 'environment'],
        ['legion job build-linux reaching a secrets. reference', edit('      RELEASE_SHA: ${{ inputs.sha }}\n', '      RELEASE_SHA: ${{ inputs.sha }}\n      PROBE: ${{ secrets.PROBE }}\n'), 'secrets.'],
        ['upload-artifact with retention-days 5', edit('          retention-days: 1\n', '          retention-days: 5\n'), 'retention-days 5'],
        ['actions/cache step added to build-linux', edit(CHECKOUT_RUN, `      - uses: actions/cache@0000000000000000000000000000000000000000 # probe\n        with:\n          path: probe\n          key: probe\n${CHECKOUT_RUN}`), 'actions/cache'],
        ['key>tag gate removed', edit('        id: key_gate\n', '        id: key_gate_removed\n'), 'no key>tag gate'],
        ['SHA-ancestor gate removed', edit('        id: sha_gate\n', '        id: sha_gate_removed\n'), 'no SHA-ancestor gate'],
    ];

    let failed = 0;
    for (const [name, text, value] of plants) {
        const { failures } = runChecks(REPO_ROOT, { text });
        const hit = failures.some(f => f.file === RELEASE_REL && f.msg.includes(value));
        if (hit) {
            console.log(`  ok  ${name} -> red, naming ${RELEASE_REL} and '${value}'`);
        } else {
            console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red naming ${RELEASE_REL} and '${value}'; got: ${failures.map(fmt).join(' | ') || '(no failures at all)'}`);
            failed += 1;
        }
    }
    if (failed > 0) return 1;
    console.log(`${NAME}: --self-test PASS -- the unmodified release workflow is green and ${plants.length} planted faults each went red naming the file and the fault. It writes nothing.`);
    return 0;
}

process.exit(main());
