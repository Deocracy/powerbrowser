#!/usr/bin/env node
// scripts/verify-build-windows-shape.mjs
//
// The build-windows-shape row (Phase 54, PKG-10 static half). It parses .github/workflows/release.yml
// and checks the build-windows job against the binding constraints of the release path:
//
//  1. schedule   the file carries no schedule trigger and no schedule: key anywhere.
//  2. runner     build-windows runs on exactly [self-hosted, powerbrowser-release] (the legion label
//                set the workflows row admits on build-* jobs only).
//  3. least      its permissions are exactly {contents: read}, it has no environment key, and no
//                secrets reference, so the legion job holds no secret and no write token.
//  4. uses       every uses: value is a full 40-hex SHA pin of a GitHub-owned action.
//  5. gates      the first step refuses any ref but main and any event but a dispatch; a full-SHA
//                step precedes the checkout; sha_gate and key_gate bodies equal build-linux's
//                byte for byte; their order is sha_gate, key_gate, then the first build step; every
//                step after key_gate carries if: steps.key_gate.outputs.build == 'true'.
//  6. fail-open  no step carries continue-on-error, `|| true`, `set +e`, or a multi-line script
//                without set -euo pipefail; every piped run: step uses pipefail.
//  7. image      the podman build step carries --no-cache and --pull=always.
//  8. steps      the cross-build step repackages the installer and the complete MAR.
//  9. retention  every upload-artifact step sets retention-days 1 and fails on no files; the file
//                carries at least one, so the rule is not vacuous.
// 10. no-cache   no actions/cache step, no cache input.
// 11. independent build-windows has no needs: key, so it cannot start from a runner output.
//
// Instrument: js-yaml from theia/ through scripts/lib/release-workflow.mjs. A missing js-yaml,
// an unreadable file and a parse error are FAILs; zero jobs is a FAIL, never a pass.
//
// Honestly --quick: it reads the workflow text and parses YAML. The self-test plants each fault
// in memory through runChecks' overrides and writes nothing. It does not build, open a browser or
// display, or reach the network. The live run on legion is the owner's (54-04 checkpoint).

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { failOpenFaults, loadYaml, stepsOf } from './lib/release-workflow.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'build-windows-shape';
const SELF_REL = 'scripts/verify-build-windows-shape.mjs';
const RELEASE_REL = '.github/workflows/release.yml';
const JOB = 'build-windows';
const REF_JOB = 'build-linux';
const LEGION_LABELS = ['self-hosted', 'powerbrowser-release'];
const KEY_IF = "steps.key_gate.outputs.build == 'true'";
const UPLOAD = /^actions\/upload-artifact@/;
const CACHE = /^actions\/cache@/;
const PINNED = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@[0-9a-f]{40}$/;

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
    yaml = loadYaml();
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

function runChecks(root, overrides = {}) {
    const failures = [];
    const fail = (step, rule, msg) => failures.push({ file: RELEASE_REL, job: JOB, step, rule, msg });

    const text = overrides.text !== undefined ? overrides.text : readText(root, RELEASE_REL);
    if (text === null) {
        fail('(workflow)', 'parse', `${RELEASE_REL} could not be read. Next step: restore the release workflow.`);
        return { failures, steps: 0 };
    }
    let wf;
    try {
        wf = yaml.load(text);
    } catch (e) {
        fail('(workflow)', 'parse', `does not parse as YAML 1.2 (${e.message.split('\n')[0]}). Next step: fix the file.`);
        return { failures, steps: 0 };
    }
    if (wf === null || typeof wf !== 'object' || wf.jobs === null || typeof wf.jobs !== 'object') {
        fail('(workflow)', 'parse', 'carries no jobs map. Next step: fix the file.');
        return { failures, steps: 0 };
    }

    // 1. schedule
    if (/^\s*schedule\s*:/m.test(text) || (wf.on !== null && typeof wf.on === 'object' && Object.hasOwn(wf.on, 'schedule'))) {
        fail('(workflow)', 'schedule', `carries a schedule trigger (schedule:). The release runs on workflow_dispatch only. Next step: remove the schedule.`);
    }

    const job = wf.jobs[JOB];
    if (job === undefined || job === null || typeof job !== 'object') {
        fail('(job)', 'job', `has no ${JOB} job. Next step: restore the Windows cross-build job.`);
        return { failures, steps: 0 };
    }
    const ref = wf.jobs[REF_JOB];
    const steps = stepsOf(job);
    const refSteps = stepsOf(ref);

    // 2. runner
    if (JSON.stringify(labelsOf(job)) !== JSON.stringify(LEGION_LABELS)) {
        fail('(job)', 'runner', `runs-on ${JSON.stringify(labelsOf(job))}, not exactly [${LEGION_LABELS.join(', ')}]. Next step: set runs-on: [self-hosted, powerbrowser-release].`);
    }

    // 3. least privilege and no secret
    const readOnly = p => p !== null && typeof p === 'object' && Object.keys(p).length === 1 && p.contents === 'read';
    if (!readOnly(job.permissions)) {
        fail('(job)', 'permissions', `permissions are ${JSON.stringify(job.permissions ?? null)}, not exactly {contents: read}. Next step: set permissions: contents: read.`);
    }
    if (Object.hasOwn(job, 'environment')) {
        fail('(job)', 'environment', `has an environment key (${JSON.stringify(job.environment)}). A legion job holds no environment. Next step: remove it.`);
    }
    if (/\bsecrets\b/.test(JSON.stringify(job))) {
        fail('(job)', 'secrets', `reaches a secrets reference. build-windows holds no secret. Next step: remove it.`);
    }
    if (Object.hasOwn(job, 'needs')) {
        fail('(job)', 'independent', `declares needs (${JSON.stringify(job.needs)}). build-windows must not wait on a runner output. Next step: remove needs.`);
    }

    // 4. uses are SHA-pinned GitHub-owned actions
    for (const st of steps) {
        const uses = typeof st.uses === 'string' ? st.uses : null;
        if (uses === null) continue;
        if (!PINNED.test(uses)) {
            fail(st.name ?? uses, 'uses', `uses ${uses}, which is not a full 40-hex SHA pin of owner/name. Next step: pin it to the SHA the other release jobs use.`);
        } else if (!uses.startsWith('actions/')) {
            fail(st.name ?? uses, 'uses', `uses ${uses}, which is not GitHub-owned and so not admitted for build-windows. Next step: use an actions/ action.`);
        }
    }

    // 5. gates: ref guard, full SHA, checkout, order, bodies equal to build-linux, if: after the key gate
    const refGuard = r => r.includes('[ "$GITHUB_EVENT_NAME" = "workflow_dispatch" ]') && r.includes('[ "$GITHUB_REF" = "refs/heads/main" ]') && /\|\| \{[^}]*exit 1/.test(r);
    if (!refGuard(String(steps[0]?.run ?? ''))) {
        fail(steps[0]?.name ?? '(first step)', 'gates', `the first step does not refuse any ref but refs/heads/main and any event but workflow_dispatch. Next step: restore it as the first step.`);
    }
    const sha40At = steps.findIndex(s => /\^\[0-9a-f\]\{40\}\$/.test(String(s.run ?? '')) && /exit 1/.test(String(s.run)));
    const checkoutAt = steps.findIndex(s => String(s.uses ?? '').startsWith('actions/checkout@'));
    if (sha40At < 0 || checkoutAt < 0 || sha40At > checkoutAt) {
        fail('(job)', 'gates', `has no full-SHA step (^[0-9a-f]{40}$ with exit 1) before the checkout. Next step: restore it.`);
    }
    const idOf = (list, id) => list.findIndex(s => s.id === id);
    const shaAt = idOf(steps, 'sha_gate');
    const keyAt = idOf(steps, 'key_gate');
    for (const id of ['sha_gate', 'key_gate']) {
        const here = steps[idOf(steps, id)];
        const there = refSteps[idOf(refSteps, id)];
        if (here === undefined || there === undefined) {
            fail(id, 'gates', `has no ${id} step in ${JOB} or ${REF_JOB}. Next step: restore the gate.`);
        } else if (String(here.run ?? '') !== String(there.run ?? '')) {
            fail(id, 'gates', `the ${id} body differs from ${REF_JOB}'s ${id}. The two gates must be identical so the Windows build cannot pass a commit the Linux gate refuses. Next step: copy the ${REF_JOB} body byte for byte.`);
        }
    }
    const buildAt = steps.findIndex(s => /podman run|podman build|\.\/mach\b/.test(String(s.run ?? '')));
    if (shaAt < 0 || keyAt < 0 || buildAt < 0 || !(shaAt < keyAt && keyAt < buildAt)) {
        fail('(job)', 'gates', `does not run sha_gate, then key_gate, then the first build step, in that order. Next step: reorder the steps.`);
    }
    steps.forEach((st, i) => {
        if (keyAt >= 0 && i > keyAt && String(st.if ?? '') !== KEY_IF) {
            fail(st.name ?? '(step)', 'gates', `step '${st.name ?? st.uses}' after key_gate has if: ${JSON.stringify(st.if ?? null)}, not ${KEY_IF}. Next step: restore the if:.`);
        }
        // 6. fail-open: the allowed if: is the key gate's for every step after it, none before
        for (const f of failOpenFaults(st, keyAt >= 0 && i > keyAt ? KEY_IF : undefined)) {
            fail(st.name ?? '(step)', 'gates', `step '${st.name ?? st.uses}' ${f}. Next step: remove it; a step that can fail open can report green while the guard did nothing.`);
        }
        const run = String(st.run ?? '');
        if (/[^|]\|[^|]/.test(run) && !/set -euo pipefail/.test(run)) {
            fail(st.name ?? '(step)', 'gates', `step '${st.name ?? st.uses}' pipes in a run: step without set -euo pipefail. Next step: add set -euo pipefail to the step.`);
        }
    });

    // 7. image build flags
    const image = steps.find(st => /podman build/.test(String(st.run ?? '')));
    if (image === undefined || !/--no-cache/.test(image.run) || !/--pull=always/.test(image.run)) {
        fail('(job)', 'image', `the podman build step lacks --no-cache or --pull=always, so a cached layer on the persistent runner could reach the release. Next step: build uncached from the digest-pinned base.`);
    }

    // 8. repackage
    if (!steps.some(st => /mach repackage installer/.test(String(st.run ?? '')) && /mach repackage mar/.test(String(st.run ?? '')))) {
        fail('(job)', 'steps', `no step runs both mach repackage installer and mach repackage mar, so no setup.exe or complete MAR is produced. Next step: add the repackage calls to the cross-build step.`);
    }

    // 9. retention, 10. no cache, over the job
    let uploads = 0;
    for (const st of steps) {
        const uses = typeof st.uses === 'string' ? st.uses : '';
        if (UPLOAD.test(uses)) {
            uploads += 1;
            if (Number(st.with?.['retention-days']) !== 1) {
                fail(st.name ?? uses, 'retention', `upload-artifact step sets retention-days ${JSON.stringify(st.with?.['retention-days'])}, not 1. Next step: set retention-days: 1.`);
            }
            if (st.with?.['if-no-files-found'] !== 'error') {
                fail(st.name ?? uses, 'retention', `upload-artifact step does not fail on no files (if-no-files-found: error). Next step: set it, so an empty upload cannot pass.`);
            }
        }
        if (CACHE.test(uses) || (st.with !== null && typeof st.with === 'object' && Object.hasOwn(st.with, 'cache'))) {
            fail(st.name ?? uses, 'no-cache', `step carries a cache (${uses || 'cache input'}); a cache restored into release bytes can be poisoned. Next step: remove it.`);
        }
    }
    if (uploads === 0) {
        fail('(job)', 'retention', `carries no upload-artifact step, so the retention rule would hold over nothing. Next step: upload the setup.exe and the complete MAR with retention-days: 1.`);
    }
    return { failures, steps: steps.length };
}

const fmt = f => `${f.file} job ${f.job} [${f.rule}] ${f.step}: ${f.msg}`;

function selfTest() {
    const real = readText(REPO_ROOT, RELEASE_REL);
    if (real === null) {
        console.error(`${NAME}: --self-test FAIL -- ${RELEASE_REL} could not be read. Next step: restore the release workflow.`);
        return 1;
    }
    const baseline = runChecks(REPO_ROOT, { text: real });
    if (baseline.failures.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- the unmodified tree is already red, so the planted-fault results would mean nothing:`);
        baseline.failures.forEach(f => console.error(`  ${fmt(f)}`));
        return 1;
    }
    console.log(`  ok  baseline -> green (${baseline.steps} step(s) in ${JOB})`);

    // Every plant edits the build-windows job's text only: the slice between its header and sign-publish.
    const HEAD = `\n  ${JOB}:\n`;
    const TAIL = '\n  sign-publish:\n';
    const h = real.indexOf(HEAD);
    const t = real.indexOf(TAIL);
    if (h < 0 || t < 0 || t < h) {
        console.error(`${NAME}: --self-test FAIL -- the ${JOB} job boundaries are absent from ${RELEASE_REL}; the plants cannot be placed.`);
        return 1;
    }
    const slice = real.slice(h, t);
    const sliceEdit = (from, to) => {
        if (!slice.includes(from)) throw new Error(`self-test anchor '${from.trim().split('\n')[0]}' is absent from the ${JOB} job`);
        return real.slice(0, h) + slice.replace(from, to) + real.slice(t);
    };
    const plants = [
        ['runner moved to a hosted label', sliceEdit('    runs-on: [self-hosted, powerbrowser-release]', '    runs-on: ubuntu-latest'), 'runner', 'runs-on'],
        ['secrets reference added', sliceEdit('    env:\n      RELEASE_SHA: ${{ inputs.sha }}\n', '    env:\n      RELEASE_SHA: ${{ inputs.sha }}\n      PROBE: ${{ secrets.PROBE }}\n'), 'secrets', 'secrets'],
        ['write permission added', sliceEdit('    permissions:\n      contents: read\n', '    permissions:\n      contents: write\n'), 'permissions', 'not exactly {contents: read}'],
        ['schedule trigger added', real.replace('on:\n  workflow_dispatch:', 'on:\n  schedule:\n    - cron: "0 3 * * *"\n  workflow_dispatch:'), 'schedule', 'schedule'],
        ['checkout unpinned', sliceEdit('actions/checkout@11d5960a326750d5838078e36cf38b85af677262', 'actions/checkout@v4'), 'uses', 'actions/checkout@v4'],
        ['repackage calls removed', sliceEdit('./mach repackage installer && ./mach repackage mar', './mach package'), 'steps', 'repackage'],
        ['key gate if removed from the Firefox fetch', sliceEdit("      - name: Fetch the pinned Firefox source and apply the patch stack\n        if: steps.key_gate.outputs.build == 'true'\n", '      - name: Fetch the pinned Firefox source and apply the patch stack\n'), 'gates', 'Fetch the pinned Firefox'],
        ['sha gate body drifts from build-linux', sliceEdit('echo "validated $SHA"', 'echo "validated $SHA again"'), 'gates', 'sha_gate'],
        ['pipefail removed from the cross-build step', sliceEdit('          set -euo pipefail\n          podman run --rm', '          podman run --rm'), 'gates', 'pipefail'],
        ['upload retention raised', sliceEdit('          retention-days: 1\n          overwrite: true', '          retention-days: 5\n          overwrite: true'), 'retention', 'retention-days 5'],
        ['image build without --no-cache', sliceEdit('--pull=always --no-cache -t pb-gecko-build', '--pull=always -t pb-gecko-build'), 'image', '--no-cache'],
    ];

    let failed = 0;
    for (const [name, text, rule, value] of plants) {
        const { failures } = runChecks(REPO_ROOT, { text });
        const hit = failures.some(f => f.file === RELEASE_REL && f.job === JOB && f.rule === rule && (f.msg.includes(value) || f.step.includes(value)));
        if (hit) {
            console.log(`  ok  ${name} -> red, naming ${RELEASE_REL} job ${JOB} [${rule}] and '${value}'`);
        } else {
            console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red naming ${RELEASE_REL}, job ${JOB}, [${rule}] and '${value}'; got: ${failures.map(fmt).join(' | ') || '(no failures at all)'}`);
            failed += 1;
        }
    }
    if (failed > 0) return 1;
    console.log(`${NAME}: --self-test PASS -- the unmodified ${JOB} job is green and ${plants.length} planted faults each went red naming the file, the job and the cause. It writes nothing.`);
    return 0;
}

function main() {
    if (args.includes('--self-test')) return selfTest();
    const { failures, steps } = runChecks(REPO_ROOT);
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} problem(s) with the ${JOB} job.`);
        failures.forEach(f => console.error(`  ${fmt(f)}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- ${RELEASE_REL} ${JOB} runs on [${LEGION_LABELS.join(', ')}] with exactly contents: read and no secret or environment; no schedule anywhere; every uses: is a SHA-pinned GitHub-owned action; the ref and event refusal, full-SHA step, sha_gate and key_gate (identical to ${REF_JOB}) precede the build and every later step is gated on the key; no step fails open; the cross-build repackages the installer and the complete MAR; uploads keep retention-days 1 (${steps} step(s) checked).`);
    return 0;
}

process.exit(main());
