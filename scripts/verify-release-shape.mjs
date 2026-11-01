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
//     run-name   The workflow's run-name is exactly `Release ${{ inputs.sha }}`. A workflow_dispatch
//                run's head_sha is the tip of the dispatched ref, so the release train finds its run
//                by this display title (rule run-name); without it the train cannot tell runs apart.
//  3. legion     Every job on the release label set has no environment key, permissions equal
//                to exactly {contents: read} at job and workflow level, no `secrets` word in any
//                form (secrets., secrets[, toJSON(secrets)) and no token, ssh-key or private-key
//                input. The one credential-shaped mount is the Safe Browsing key directory
//                (PB_KEYDIR mounted read-only at /keys): an API key shipped inside the binary,
//                the single recorded exception; any other -v mount is red.
//  4. gates      build-linux starts with the main-dispatch refusal (GITHUB_REF and
//                GITHUB_EVENT_NAME), then the full 40-hex SHA step, the checkout, the SHA gate
//                (HEAD equals the requested SHA, merge-base --is-ancestor, the configuration.toml
//                test, the .github/workflows/ diff) and the key gate (the shared comparator, an
//                exit other than 0 or 1 is an error). Every step after the key gate carries
//                if: steps.key_gate.outputs.build == 'true'; the image build is --no-cache
//                --pull=always. None of these steps may fail open.
//  5. sign-publish  The write job takes its commit from inputs.sha (never a runner output), re-runs
//                the same SHA gate, derives the release key and compares it with the manifest,
//                builds signmar from the pinned source (the pin's tag equals configuration.toml),
//                downloads only the release-linux artifact, exports no LD_LIBRARY_PATH, holds no
//                token or secret at job level, and names the signing secrets only in sign_mar.
//  6. concurrency  One group, release, never cancelling a run.
//  7. retention  Every actions/upload-artifact step sets retention-days to 1, and the
//                file carries at least one upload step, so the rule is not vacuous. One exception,
//                derived from the YAML: an artifact downloaded by a job behind the descriptor
//                environment (that job and every job needing it) must outlive the environment's
//                wait_timer (.github/settings/environment-descriptor.json) plus two days of approval
//                and re-run slack, and may carry no tarball and no MAR, so only small data lives longer.
//  8. no-cache   No actions/cache step and no `cache` input anywhere in the file.
//
// Instrument: js-yaml from theia/ through createRequire, the same loader as the
// workflows row. A missing js-yaml, an unreadable file and a parse error are FAILs.
//
// Honestly --quick: it reads the workflow text and parses YAML. Its self-test plants
// each fault in memory through runChecks' overrides and writes nothing. It does not
// build, open a browser or display, or reach the network. The live gate reads (the
// latest Release, the key comparison) run in the workflow itself, and this row only
// proves the workflow text carries them.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveConfig } from './generate.mjs';
import { failOpenFaults, loadYaml, stepsOf } from './lib/release-workflow.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'release-shape';
const SELF_REL = 'scripts/verify-release-shape.mjs';
const RELEASE_REL = '.github/workflows/release.yml';
const LEGION_LABEL = 'powerbrowser-release';
const BUILD_JOB = 'build-linux';
const SIGN_JOB = 'sign-publish';
const PIN_REL = 'powerbrowser/packaging/signmar/SOURCES.sha256';
const DESCRIPTOR_ENV = 'descriptor';
const DESCRIPTOR_ENV_REL = `.github/settings/environment-${DESCRIPTOR_ENV}.json`;
const RUN_NAME = 'Release ${{ inputs.sha }}';
const KEY_IF = "steps.key_gate.outputs.build == 'true'";
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

    // run-name: the release train correlates its dispatch with the run by this exact display title.
    if (wf['run-name'] !== RUN_NAME) {
        fail('(workflow)', 'run-name', `run-name is ${JSON.stringify(wf['run-name'] ?? null)}, not ${JSON.stringify(RUN_NAME)}. The release train identifies the run it dispatched by that display title (head_sha is the tip of main, not inputs.sha). Next step: restore run-name: ${RUN_NAME}.`);
    }

    // 3. legion placement and least privilege
    const legionJobs = Object.keys(wf.jobs).filter(id => labelsOf(wf.jobs[id]).includes(LEGION_LABEL));
    if (!legionJobs.includes(BUILD_JOB)) {
        fail(BUILD_JOB, 'legion', `does not run on the ${LEGION_LABEL} label. Next step: put runs-on: [self-hosted, ${LEGION_LABEL}] on ${BUILD_JOB}.`);
    }
    const readOnly = p => p !== null && typeof p === 'object' && Object.keys(p).length === 1 && p.contents === 'read';
    if (!readOnly(wf.permissions)) {
        fail('(workflow)', 'legion', `workflow-level permissions are ${JSON.stringify(wf.permissions ?? null)}, not exactly {contents: read}; a write grant here reaches legion. Next step: set permissions: contents: read.`);
    }
    const wfScope = JSON.stringify({ env: wf.env ?? {}, defaults: wf.defaults ?? {} });
    for (const id of legionJobs) {
        const job = wf.jobs[id];
        if (Object.hasOwn(job, 'environment')) {
            fail(id, 'legion', `runs on ${LEGION_LABEL} and has an environment key (environment: ${JSON.stringify(job.environment)}). A legion job holds no environment. Next step: move the environment to a hosted job.`);
        }
        if (!readOnly(job.permissions)) {
            fail(id, 'legion', `runs on ${LEGION_LABEL} with permissions ${JSON.stringify(job.permissions ?? null)}, not exactly {contents: read}. Next step: set the job permissions to contents: read.`);
        }
        if (/\bsecrets\b/.test(JSON.stringify(job)) || /\bsecrets\b/.test(wfScope)) {
            fail(id, 'legion', `runs on ${LEGION_LABEL} and reaches a secrets reference (secrets., secrets[ or toJSON(secrets)). Next step: remove it; build-linux holds no secret.`);
        }
        for (const st of stepsOf(job)) {
            for (const k of ['token', 'github-token', 'ssh-key', 'private-key']) {
                if (st.with !== null && typeof st.with === 'object' && Object.hasOwn(st.with, k)) {
                    fail(id, 'legion', `step '${st.name ?? st.uses}' passes the ${k} input, which hands a credential to legion. Next step: remove it; the default read-only token is the only token.`);
                }
            }
            // The one exception: the Safe Browsing key directory, read-only, at /keys. Anything else mounted is red.
            for (const m of String(st.run ?? '').matchAll(/(?:^|\s)(?:-v|--volume)[ =]"([^"]+)"/g)) {
                const [src, dst, opts] = m[1].split(/:(?![^{]*\})/);
                const workspace = src === '$PWD' && dst === '/src' && opts === 'rw';
                const keyDir = /^\$\{PB_KEYDIR[:?][^}]*\}$/.test(src) && dst === '/keys' && opts === 'ro';
                if (!workspace && !keyDir) {
                    fail(id, 'legion', `step '${st.name}' mounts '${m[1]}'. Only the workspace ($PWD:/src:rw) and the Safe Browsing key directory (PB_KEYDIR at /keys:ro, an API key shipped in the binary) may be mounted. Next step: remove the mount.`);
                }
            }
        }
    }

    // 4. build-linux gates, in order, none failing open
    const build = wf.jobs[BUILD_JOB];
    const steps = stepsOf(build);
    const byId = id => steps.findIndex(s => s.id === id);
    const buildAt = steps.findIndex(s => BUILD_STEP.test(String(s.run ?? '')));
    const shaAt = byId('sha_gate');
    const keyAt = byId('key_gate');
    const refGuard = r => r.includes('[ "$GITHUB_EVENT_NAME" = "workflow_dispatch" ]') && r.includes('[ "$GITHUB_REF" = "refs/heads/main" ]') && /\|\| \{[^}]*exit 1/.test(r);
    if (!refGuard(String(steps[0]?.run ?? ''))) {
        fail(BUILD_JOB, 'ref-guard', `does not start with a step refusing any ref but refs/heads/main and any event but workflow_dispatch (GITHUB_REF, GITHUB_EVENT_NAME, exit 1). Next step: restore the first step; plan 49-02's runner hook remains the real control.`);
    }
    const sha40At = steps.findIndex(s => /\^\[0-9a-f\]\{40\}\$/.test(String(s.run ?? '')) && /exit 1/.test(String(s.run)));
    const checkoutAt = steps.findIndex(s => String(s.uses ?? '').startsWith('actions/checkout@'));
    if (sha40At < 0 || (checkoutAt >= 0 && sha40At > checkoutAt)) {
        fail(BUILD_JOB, 'gates', `has no full-SHA step (^[0-9a-f]{40}$ with exit 1) before the checkout. Next step: restore it, so a branch or tag name cannot resolve differently in the checkout and the gate.`);
    }
    const shaRun = String(steps[shaAt]?.run ?? '');
    if (shaAt < 0) {
        fail(BUILD_JOB, 'gates', `has no SHA-ancestor gate (a step with id sha_gate). Next step: add the step that checks the SHA is main's tip or a configuration.toml ancestor with main's workflows.`);
    } else {
        const need = [
            [/merge-base --is-ancestor/, 'a merge-base --is-ancestor check, so the SHA-ancestor gate does not hold'],
            [/SHA="\$\(git rev-parse HEAD\)"/, 'the git rev-parse HEAD read'],
            [/\[ "\$SHA" = "\$RELEASE_SHA" \] \|\| \{[^}]*exit 1/, 'the checked-out-equals-requested comparison with exit 1'],
            [/grep -x 'configuration\.toml' >\/dev\/null\s*\\\n\s*\|\| \{[^}]*exit 1/, 'the configuration.toml test with exit 1'],
            [/git diff --quiet "\$SHA" "\$TIP" -- \.github\/workflows\/\s*\\\n\s*\|\| \{[^}]*exit 1/, 'the .github/workflows/ diff against main with exit 1'],
        ];
        for (const [re, what] of need) {
            if (!re.test(shaRun)) fail(BUILD_JOB, 'gates', `sha_gate step lacks ${what}. Next step: restore it.`);
        }
        for (const f of failOpenFaults(steps[shaAt])) fail(BUILD_JOB, 'gates', `sha_gate step ${f}, so the SHA gate can pass without checking. Next step: remove it.`);
        if (buildAt >= 0 && shaAt > buildAt) {
            fail(BUILD_JOB, 'gates', `runs the SHA-ancestor gate after the build step. Next step: move the gate before the first build step.`);
        }
    }
    const keyRun = String(steps[keyAt]?.run ?? '');
    if (keyAt < 0) {
        fail(BUILD_JOB, 'gates', `has no key>tag gate (a step with id key_gate). Next step: add the step that exits without building when the release key is not newer than the latest Release.`);
    } else {
        if (!/GITHUB_OUTPUT/.test(keyRun) || !/releases/.test(keyRun)) {
            fail(BUILD_JOB, 'gates', `has a key_gate step that does not read the Releases and write build= to GITHUB_OUTPUT, so the key>tag gate does not hold. Next step: restore the Releases read and the output.`);
        }
        if (!/if \[ "\$LATEST" != "none" \]; then\s+nix develop \.#theia --command node scripts\/release-key-newer\.mjs "\$KEY" "\$LATEST" \|\| RC=\$\?/.test(keyRun)) {
            fail(BUILD_JOB, 'gates', `key_gate step does not run scripts/release-key-newer.mjs against the latest Release when one exists, so the key>tag gate does not compare. Next step: restore the comparator call.`);
        }
        if (!/0\) echo "build=true"/.test(keyRun) || !/1\)[\s\S]*?build=false/.test(keyRun) || !/\*\)[^\n]*exit 1 ;;/.test(keyRun)) {
            fail(BUILD_JOB, 'gates', `key_gate step does not map exit 0 to build=true, exit 1 to build=false and any other exit to an error (exit 1), so an unparseable tag could skip the build silently. Next step: restore the case.`);
        }
        for (const f of failOpenFaults(steps[keyAt])) fail(BUILD_JOB, 'gates', `key_gate step ${f}, so the key>tag gate can pass without comparing. Next step: remove it.`);
        if (buildAt >= 0 && keyAt > buildAt) {
            fail(BUILD_JOB, 'gates', `runs the key>tag gate after the build step. Next step: move the gate before the first build step.`);
        }
        for (const st of steps.slice(keyAt + 1)) {
            if (String(st.if ?? '') !== KEY_IF) {
                fail(BUILD_JOB, 'gates', `step '${st.name ?? st.uses}' after the key gate has if: ${JSON.stringify(st.if ?? null)}, not ${KEY_IF}, so it runs when the key is not newer. Next step: restore the if:.`);
            }
        }
    }
    const image = steps.find(st => /podman build/.test(String(st.run ?? '')));
    if (image === undefined || !/--no-cache/.test(image.run) || !/--pull=always/.test(image.run)) {
        fail(BUILD_JOB, 'gates', `image build step lacks --no-cache or --pull=always, so a cached layer on the persistent runner could reach the release. Next step: build uncached from the digest-pinned base.`);
    }

    // 5. sign-publish: nothing the runner produced decides anything
    const sign = wf.jobs[SIGN_JOB];
    const sSteps = stepsOf(sign);
    const sById = id => sSteps.findIndex(x => x.id === id);
    if (sign === undefined) {
        fail(SIGN_JOB, 'sign-trust', `is absent. Next step: restore the sign-publish job.`);
    } else {
        const sText = JSON.stringify(sign);
        if (!refGuard(String(sSteps[0]?.run ?? ''))) {
            fail(SIGN_JOB, 'ref-guard', `does not start with the main-dispatch refusal. Next step: restore the first step.`);
        }
        if (sign.env?.RELEASE_SHA !== '${{ inputs.sha }}' || /needs\.build-linux\.outputs\.sha/.test(sText)) {
            fail(SIGN_JOB, 'sign-trust', `takes its commit from ${JSON.stringify(sign.env?.RELEASE_SHA ?? null)} or a build-linux output, not the dispatch input \${{ inputs.sha }}; legion could choose the commit that runs with the write token. Next step: use inputs.sha.`);
        }
        const co = sSteps.find(x => String(x.uses ?? '').startsWith('actions/checkout@'));
        if (co?.with?.ref !== '${{ inputs.sha }}') {
            fail(SIGN_JOB, 'sign-trust', `checks out ${JSON.stringify(co?.with?.ref ?? null)}, not \${{ inputs.sha }}. Next step: check out the dispatch input.`);
        }
        const sg = sById('sha_gate');
        if (sg < 0 || String(sSteps[sg].run ?? '') !== shaRun || shaRun === '') {
            fail(SIGN_JOB, 'sign-trust', `does not re-run the SHA gate with the same body as ${BUILD_JOB}'s sha_gate. Next step: copy the gate into sign-publish, so a compromised runner cannot name a commit.`);
        } else if (sSteps.findIndex(x => String(x.uses ?? '').startsWith('actions/download-artifact@')) < sg) {
            fail(SIGN_JOB, 'sign-trust', `downloads the release artifacts before the SHA gate has run. Next step: gate first.`);
        }
        const dk = sById('derive_key');
        const dkRun = String(sSteps[dk]?.run ?? '');
        if (dk < 0 || !/releaseIdentity/.test(dkRun) || !/\^v\[0-9\]\+\(\\\.\[0-9\]\+\)\*-\[0-9\]\+\$/.test(dkRun) || !/\[ "\$MANIFEST_KEY" = "\$DERIVED" \] \|\| \{[^}]*exit 1/.test(dkRun)) {
            fail(SIGN_JOB, 'sign-trust', `has no derive_key step that derives the release key with releaseIdentity, validates the grammar and refuses a manifest release_key that differs. Next step: restore it; the tag and asset names come from the tree.`);
        }
        if (/MANIFEST_KEY|release-manifest\.json/.test(sSteps.filter(x => x.id !== 'derive_key' && x.id !== 'mar_channel_gate').map(x => String(x.run ?? '').replace(/--manifest release\/release-manifest\.json/g, '')).join('\n'))) {
            fail(SIGN_JOB, 'sign-trust', `reads the manifest outside derive_key, mar_channel_gate and the asset-set script. Next step: take the tag from steps.derive_key.outputs.tag.`);
        }
        for (const x of sSteps) {
            const uses = String(x.uses ?? '');
            if (uses.startsWith('actions/download-artifact@') && x.with?.name !== 'release-linux') {
                fail(SIGN_JOB, 'sign-trust', `downloads artifact ${JSON.stringify(x.with?.name ?? null)}; only release-linux (data) may be downloaded. Next step: remove it; nothing the runner built may be executed here.`);
            }
        }
        if (/LD_LIBRARY_PATH|signing-tools|chmod \+x/.test(sText)) {
            fail(SIGN_JOB, 'sign-trust', `references LD_LIBRARY_PATH, signing-tools or chmod +x, which is how runner-built code reaches this job. Next step: use the signmar built from the pinned source.`);
        }
        const sm = sSteps.find(x => x.id === 'signmar');
        if (!/bash scripts\/build-signmar\.sh/.test(String(sm?.run ?? '')) || sm?.env !== undefined) {
            fail(SIGN_JOB, 'sign-trust', `has no signmar step that runs scripts/build-signmar.sh with an empty environment. Next step: build signmar from the pinned source.`);
        }
        if (Object.keys(sign.env ?? {}).some(k => /TOKEN|SECRET|P12/i.test(k)) || /secrets\.|github\.token/.test(JSON.stringify(sign.env ?? {}))) {
            fail(SIGN_JOB, 'sign-trust', `holds a token or secret in job-level env, which every step then sees. Next step: move it to the step that needs it.`);
        }
        sSteps.forEach(x => {
            if (x.id !== 'sign_mar' && x.id !== 'bot' && /MAR_SIGNING_P12|BOT_APP_PRIVATE_KEY/.test(JSON.stringify(x))) {
                fail(SIGN_JOB, 'sign-trust', `step '${x.name}' names a signing or bot secret; only sign_mar and bot may. Next step: remove it.`);
            }
        });
        const pin = (overrides.read ?? (rel => readText(root, rel)))(PIN_REL);
        const { config } = resolveConfig(join(root, 'configuration.toml'));
        const pinTag = /^# tag (\S+)$/m.exec(pin ?? '')?.[1];
        if (pin === null || pinTag !== config?.upstreams?.firefox_esr_tag || !/^# commit [0-9a-f]{40}$/m.test(pin) || !/^[0-9a-f]{64}  \S+$/m.test(pin)) {
            fail(SIGN_JOB, 'sign-pin', `${PIN_REL} names tag ${JSON.stringify(pinTag ?? null)} but configuration.toml pins ${JSON.stringify(config?.upstreams?.firefox_esr_tag)}, or lacks a 40-hex commit or sha256 lines. Next step: re-pin the signmar sources for the ESR tag.`);
        }
    }

    // 6. concurrency
    if (wf.concurrency?.group !== 'release' || wf.concurrency?.['cancel-in-progress'] !== false) {
        fail('(workflow)', 'concurrency', `has concurrency ${JSON.stringify(wf.concurrency ?? null)}, not group release with cancel-in-progress: false; two dispatches could race on the runner workspace and the tag. Next step: restore the group.`);
    }

    // 7. retention and 8. no cache, over every job
    // The late jobs: the descriptor-environment job and every job that needs one, to a fixpoint.
    const late = new Set(Object.entries(wf.jobs).filter(([, j]) => (j?.environment?.name ?? j?.environment) === DESCRIPTOR_ENV).map(([id]) => id));
    for (let grew = true; grew;) {
        grew = false;
        for (const [id, j] of Object.entries(wf.jobs)) {
            if (!late.has(id) && [].concat(j?.needs ?? []).some(n => late.has(n))) { late.add(id); grew = true; }
        }
    }
    const lateArtifacts = new Set([...late].flatMap(id => stepsOf(wf.jobs[id]).filter(s => /^actions\/download-artifact@/.test(String(s.uses ?? ''))).map(s => s.with?.name)));
    let wait = null;
    try {
        wait = JSON.parse((overrides.read ?? (rel => readText(root, rel)))(DESCRIPTOR_ENV_REL)).wait_timer;
    } catch { /* reported below */ }
    const minLate = Number.isInteger(wait) && wait >= 0 ? Math.ceil(wait / 1440) + 2 : null;
    let uploads = 0;
    for (const [id, job] of Object.entries(wf.jobs)) {
        for (const s of stepsOf(job)) {
            const uses = typeof s.uses === 'string' ? s.uses : '';
            if (UPLOAD.test(uses) && lateArtifacts.has(s.with?.name)) {
                uploads += 1;
                const art = JSON.stringify(s.with.name);
                if (/\.tar\.xz|\.mar\b/.test(String(s.with?.path ?? ''))) {
                    fail(id, 'retention', `upload-artifact step '${s.name ?? uses}' puts a tarball or a MAR in artifact ${art}, which a job behind the ${DESCRIPTOR_ENV} wait downloads, so release bytes would outlive the one-day cap. Next step: upload only the data files that job reads in a separate artifact.`);
                }
                if (minLate === null) {
                    fail(id, 'retention', `artifact ${art} is read behind the ${DESCRIPTOR_ENV} wait, but ${DESCRIPTOR_ENV_REL} carries no integer wait_timer, so its minimum retention cannot be derived. Next step: restore the environment settings file.`);
                } else if (!(Number(s.with?.['retention-days']) >= minLate)) {
                    fail(id, 'retention', `artifact ${art} is read behind the ${wait}-minute ${DESCRIPTOR_ENV} wait but keeps retention-days ${JSON.stringify(s.with?.['retention-days'])}, under ${minLate} (the wait plus two days of approval slack), so it expires before that job starts. Next step: set retention-days to at least ${minLate}.`);
                }
            } else if (UPLOAD.test(uses)) {
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
    console.log(`${NAME}: PASS -- ${RELEASE_REL} dispatches on workflow_dispatch only with a required sha input; build-linux runs on ${LEGION_LABEL} with no environment and no secret; the SHA-ancestor and key>tag gates precede the build and every later step is gated on the key; legion permissions are exactly contents: read with no secrets reference; sign-publish takes its commit from inputs.sha, re-gates, derives the key and builds signmar from the pinned source; ${uploads} upload-artifact step(s) keep retention-days 1, except the data-only artifacts the jobs behind the ${DESCRIPTOR_ENV} wait read, which outlive it; no cache step or cache input.`);
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
    // fault, never a silent pass. editLast rewrites the occurrence in sign-publish.
    const edit = (from, to) => {
        if (!real.includes(from)) throw new Error(`self-test anchor '${from.trim()}' is absent from ${RELEASE_REL}`);
        return real.replace(from, to);
    };
    const editLast = (from, to) => {
        const at = real.lastIndexOf(from);
        if (at < 0) throw new Error(`self-test anchor '${from.trim()}' is absent from ${RELEASE_REL}`);
        return real.slice(0, at) + to + real.slice(at + from.length);
    };
    const RUNS_ON = '    runs-on: [self-hosted, powerbrowser-release]\n';
    const GATED = "        if: steps.key_gate.outputs.build == 'true'\n";
    const CHECKOUT_RUN = '      - name: Generate the derived build surfaces\n';
    const MOUNT_TAIL = '-w /src/upstream \\\n';
    // [name, plant, rule, text the message must carry]; a plant is a workflow text or { read } for a tree file.
    const plants = [
        ['pull_request trigger added', edit('on:\n  workflow_dispatch:', 'on:\n  pull_request:\n  workflow_dispatch:'), 'trigger', 'pull_request'],
        ['tag push trigger added', edit('on:\n  workflow_dispatch:', 'on:\n  push:\n    tags: ["v*"]\n  workflow_dispatch:'), 'trigger', 'push'],
        ['run-name removed', edit('run-name: Release ${{ inputs.sha }}\n', ''), 'run-name', 'run-name is null'],
        ['run-name without the sha', edit('run-name: Release ${{ inputs.sha }}\n', 'run-name: Release\n'), 'run-name', '"Release"'],
        ['sha input not required', edit('        required: true\n', '        required: false\n'), 'sha-input', 'required'],
        ['legion job build-linux with environment:', edit(RUNS_ON, `${RUNS_ON}    environment: release\n`), 'legion', 'environment'],
        ['legion job reaching a secrets. reference', edit('      RELEASE_SHA: ${{ inputs.sha }}\n', '      RELEASE_SHA: ${{ inputs.sha }}\n      PROBE: ${{ secrets.PROBE }}\n'), 'legion', 'secrets'],
        ['legion job reaching secrets[ ]', edit('      RELEASE_SHA: ${{ inputs.sha }}\n', "      RELEASE_SHA: ${{ inputs.sha }}\n      PROBE: ${{ secrets['PROBE'] }}\n"), 'legion', 'secrets'],
        ['legion job reaching toJSON(secrets)', edit('      RELEASE_SHA: ${{ inputs.sha }}\n', '      RELEASE_SHA: ${{ inputs.sha }}\n      PROBE: ${{ toJSON(secrets) }}\n'), 'legion', 'secrets'],
        ['legion job with contents: write', edit('    permissions:\n      contents: read\n    outputs:', '    permissions:\n      contents: write\n    outputs:'), 'legion', 'not exactly {contents: read}'],
        ['legion job with id-token: write added', edit('    permissions:\n      contents: read\n    outputs:', '    permissions:\n      contents: read\n      id-token: write\n    outputs:'), 'legion', 'not exactly {contents: read}'],
        ['workflow-level contents: write', edit('permissions:\n  contents: read\n\nconcurrency', 'permissions:\n  contents: write\n\nconcurrency'), 'legion', 'workflow-level permissions'],
        ['legion checkout handed a token', edit('          persist-credentials: false\n', '          persist-credentials: false\n          token: ${{ github.token }}\n'), 'legion', 'token input'],
        ['legion mounting a second host directory', edit(MOUNT_TAIL, `-v "$HOME/.config/powerbrowser-release:/keys2:ro" ${MOUNT_TAIL}`), 'legion', 'mounts'],
        ['upload-artifact with retention-days 5', edit('          retention-days: 1\n', '          retention-days: 5\n'), 'retention', 'retention-days 5'],
        ['descriptor-read identity artifact back to retention-days 1', edit('          retention-days: 7\n', '          retention-days: 1\n'), 'retention', '"release-linux-identity" is read behind'],
        ['descriptor downloading the tarball and MAR artifact', edit('          name: release-linux-manifest\n          path: release\n', '          name: release-linux\n          path: release\n'), 'retention', 'tarball or a MAR in artifact "release-linux"'],
        ['actions/cache step added to build-linux', edit(CHECKOUT_RUN, `      - uses: actions/cache@0000000000000000000000000000000000000000 # probe\n        with:\n          path: probe\n          key: probe\n${CHECKOUT_RUN}`), 'no-cache', 'actions/cache'],
        ['key>tag gate removed', edit('        id: key_gate\n', '        id: key_gate_removed\n'), 'gates', 'no key>tag gate'],
        ['SHA-ancestor gate removed', edit('        id: sha_gate\n', '        id: sha_gate_removed\n'), 'gates', 'no SHA-ancestor gate'],
        ['dispatch-from-main refusal removed from build-linux', edit('[ "$GITHUB_REF" = "refs/heads/main" ]', 'true'), 'ref-guard', 'main'],
        ['full-SHA requirement removed', edit('[[ "$RELEASE_SHA" =~ ^[0-9a-f]{40}$ ]]', 'true'), 'gates', 'full-SHA'],
        ['HEAD equality removed', edit('[ "$SHA" = "$RELEASE_SHA" ] ||', ': ||'), 'gates', 'checked-out-equals-requested'],
        ['workflows diff neutered', edit('git diff --quiet "$SHA" "$TIP" -- .github/workflows/', 'true'), 'gates', '.github/workflows/ diff'],
        ['configuration.toml test neutered', edit("grep -x 'configuration.toml' >/dev/null", "grep -q ''"), 'gates', 'configuration.toml test'],
        ['SHA gate continue-on-error', edit('        id: sha_gate\n', '        id: sha_gate\n        continue-on-error: true\n'), 'gates', 'continue-on-error'],
        ['image build if: removed', edit(`      - name: Build the release container image\n${GATED}`, '      - name: Build the release container image\n'), 'gates', 'Build the release container image'],
        ['mach build if: removed', edit(`      - name: Configure and build the release tree, then verify the toolchain baseline in the container\n${GATED}`, '      - name: Configure and build the release tree, then verify the toolchain baseline in the container\n'), 'gates', 'Configure and build'],
        ['--no-cache removed', edit('--pull=always --no-cache', '--pull=always'), 'gates', '--no-cache'],
        ['--pull=always removed', edit('--pull=always --no-cache', '--no-cache'), 'gates', '--pull=always'],
        ['key gate always builds (comparator skipped)', edit('if [ "$LATEST" != "none" ]; then\n            nix develop', 'if false; then\n            nix develop'), 'gates', 'does not compare'],
        ['key gate treats an unparseable tag as not newer', edit('; exit 1 ;;\n          esac', ' ;;\n          esac'), 'gates', 'unparseable'],
        ['key gate swallows the comparator failure', edit('|| RC=$?\n          fi\n          case', '|| true\n          fi\n          case'), 'gates', 'does not compare'],
        ['concurrency group removed', edit('concurrency:\n  group: release\n  cancel-in-progress: false\n\n', ''), 'concurrency', 'concurrency'],
        ['concurrency cancels in progress', edit('cancel-in-progress: false', 'cancel-in-progress: true'), 'concurrency', 'cancel-in-progress'],
        ['sign-publish takes the sha from a build output', editLast('RELEASE_SHA: ${{ inputs.sha }}', 'RELEASE_SHA: ${{ needs.build-linux.outputs.sha }}'), 'sign-trust', 'dispatch input'],
        ['sign-publish SHA gate removed', editLast('        id: sha_gate\n', '        id: sha_gate_x\n'), 'sign-trust', 'SHA gate'],
        ['sign-publish manifest key not compared with the tree', edit('[ "$MANIFEST_KEY" = "$DERIVED" ] ||', 'true ||'), 'sign-trust', 'derive_key'],
        ['sign-publish downloads the runner-built signer', edit('      - name: Derive the release key', '      - uses: actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333 # probe\n        with:\n          name: signing-tools\n          path: signing-tools\n\n      - name: Derive the release key'), 'sign-trust', 'signing-tools'],
        ['sign-publish exporting LD_LIBRARY_PATH', edit('"$SIGNMAR" -d "$WORK/db"', 'LD_LIBRARY_PATH="$PWD/lib" "$SIGNMAR" -d "$WORK/db"'), 'sign-trust', 'LD_LIBRARY_PATH'],
        ['sign-publish holding GH_TOKEN at job level', editLast('    env:\n      RELEASE_SHA: ${{ inputs.sha }}\n', '    env:\n      GH_TOKEN: ${{ github.token }}\n      RELEASE_SHA: ${{ inputs.sha }}\n'), 'sign-trust', 'job-level env'],
        ['signing secret named outside sign_mar', edit('      - name: Verify the signed MAR', '      - name: Probe\n        env:\n          P: ${{ secrets.MAR_SIGNING_P12_B64 }}\n        run: "true"\n\n      - name: Verify the signed MAR'), 'sign-trust', 'signing or bot secret'],
        ['descriptor environment with no wait_timer', { read: rel => (rel === DESCRIPTOR_ENV_REL ? '{}' : readText(REPO_ROOT, rel)) }, 'retention', 'carries no integer wait_timer'],
        ['signmar pin for another ESR tag', { read: rel => (rel === PIN_REL ? readText(REPO_ROOT, PIN_REL).replace(/^# tag .*$/m, '# tag wrong-tag') : readText(REPO_ROOT, rel)) }, 'sign-pin', 'wrong-tag'],
    ];

    let failed = 0;
    for (const [name, plant, rule, value] of plants) {
        const o = typeof plant === 'string' ? { text: plant } : { text: real, ...plant };
        const { failures } = runChecks(REPO_ROOT, o);
        const hit = failures.some(f => f.file === RELEASE_REL && f.rule === rule && f.msg.includes(value));
        if (hit) {
            console.log(`  ok  ${name} -> red, naming ${RELEASE_REL}, [${rule}] and '${value}'`);
        } else {
            console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red naming ${RELEASE_REL}, [${rule}] and '${value}'; got: ${failures.map(fmt).join(' | ') || '(no failures at all)'}`);
            failed += 1;
        }
    }

    // WR-04: a bad mar_origin must fail in generate's own config resolution, before any build. The only
    // thing written is a scratch copy of configuration.toml in the OS temp directory, removed at once.
    const scratch = mkdtempSync(join(tmpdir(), 'release-shape-'));
    try {
        const toml = readText(REPO_ROOT, 'configuration.toml');
        for (const [name, value] of [['uppercase mar_origin host', 'https://Downloads.PowerBrowser.org'], ['mar_origin with a port', 'https://downloads.powerbrowser.org:8443'], ['mar_origin with a leading hyphen', 'https://-x.powerbrowser.org']]) {
            if (!/^mar_origin = ".*"$/m.test(toml)) throw new Error("self-test anchor 'mar_origin' is absent from configuration.toml");
            const file = join(scratch, 'configuration.toml');
            writeFileSync(file, toml.replace(/^mar_origin = ".*"$/m, `mar_origin = "${value}"`));
            const { failures } = resolveConfig(file);
            if (failures.some(f => f.includes('urls.mar_origin'))) {
                console.log(`  ok  ${name} -> red in resolveConfig, naming urls.mar_origin`);
            } else {
                console.error(`${NAME}: --self-test FAIL -- '${name}' was accepted by resolveConfig; generate would fail only after the build. Next step: tighten urls.mar_origin in scripts/lib/config-schema.json.`);
                failed += 1;
            }
        }
    } finally {
        rmSync(scratch, { recursive: true, force: true });
    }
    if (failed > 0) return 1;
    console.log(`${NAME}: --self-test PASS -- the unmodified release workflow is green and ${plants.length} workflow faults and 3 mar_origin faults each went red naming the file and the fault. It writes only a scratch copy of configuration.toml in the OS temp directory, removed at once.`);
    return 0;
}

process.exit(main());
