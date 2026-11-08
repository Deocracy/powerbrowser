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
//  5b. publish-windows  The same: dispatch-main refusal first, inputs.sha for env and checkout, the
//                build-linux SHA gate body before any download, only release-windows downloaded, signmar
//                from scripts/build-signmar.sh with no env, no job-level secret, the MAR key only in
//                win_sign_mar (owner answer A2).
//  5c. descriptor-windows  Dispatch-main refusal first, inputs.sha checkout, verify-channel-live.mjs
//                --form-only before the updates_token mint, and the commit step's not-newer buildID
//                refusal exits 1; the bot key only in updates_token.
//  6. concurrency  One group, release, never cancelling a run.
//  7. retention  Every actions/upload-artifact step sets retention-days to 1, and the
//                file carries at least one upload step, so the rule is not vacuous. One exception,
//                derived from the YAML: an artifact downloaded by a job behind the descriptor
//                environment (that job and every job needing it) must outlive the environment's
//                wait_timer (.github/settings/environment-descriptor.json) plus two days of approval
//                and re-run slack, and may carry no tarball and no MAR, so only small data lives longer.
//  8. no-cache   No actions/cache step and no `cache` input anywhere in the file.
//  9. mar-emit   When build-linux uploads *.complete.mar, a packaging script that build-linux runs
//                (a powerbrowser/packaging/*.sh named in its run steps) invokes
//                tools/update-packaging/make_full_update.sh on a non-comment line (G-49a).
// 10. packaged-rows  build-linux runs scripts/verify-platform.sh --only for the packaged rows and
//                install-matrix, between the packaging step and the first upload; every label it runs is a
//                registry label (read from scripts/verify-platform.sh at check time) (G-49b).
// 11. purge      One hosted job after sign-publish succeeds, permissions exactly {actions: write}, deletes
//                every artifact whose build-linux upload carries a tarball or a MAR (derived from the upload
//                steps, set equality with its PURGE list), none a descriptor-wait job reads, and exits 1 when
//                one is still stored (G-49c, INF-04).
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
import { failOpenFaults, ifBody, loadYaml, stepsOf } from './lib/release-workflow.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'release-shape';
const SELF_REL = 'scripts/verify-release-shape.mjs';
const RELEASE_REL = '.github/workflows/release.yml';
const LEGION_LABEL = 'powerbrowser-release';
const BUILD_JOB = 'build-linux';
const SIGN_JOB = 'sign-publish';
const WIN_JOB = 'publish-windows';
const WIN_DESCRIPTOR_JOB = 'descriptor-windows';
const PIN_REL = 'powerbrowser/packaging/signmar/SOURCES.sha256';
const PKG_LINUX_REL = 'powerbrowser/packaging/package-linux.sh';
const REGISTRY_REL = 'scripts/verify-platform.sh';
// The contract, not a copy of the tree: ROADMAP Phase 49 criterion 2 (packaged-launch and install-matrix) and the
// Phase 45 packaging gates BLOCKED.md item 7 names. Labels the step adds beyond these only need to be registered.
const PACKAGED_ROWS = ['ng063-packaged-launch', 'portable-elf', 'sidecar-no-symlinks', 'package-target-natives', 'packaged-identity', 'install-matrix'];
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

    // 5b. publish-windows: the same trust rules as sign-publish, for the job that holds the MAR key and the R2 token.
    const wj = wf.jobs[WIN_JOB];
    const wSteps = stepsOf(wj);
    if (wj === undefined) {
        fail(WIN_JOB, 'win-trust', `is absent. Next step: restore the publish-windows job (owner answer A2).`);
    } else {
        const wText = JSON.stringify(wj);
        if (!refGuard(String(wSteps[0]?.run ?? ''))) {
            fail(WIN_JOB, 'win-trust', `does not start with the main-dispatch refusal. Next step: restore the first step.`);
        }
        if (wj.env?.RELEASE_SHA !== '${{ inputs.sha }}' || wSteps.find(x => String(x.uses ?? '').startsWith('actions/checkout@'))?.with?.ref !== '${{ inputs.sha }}') {
            fail(WIN_JOB, 'win-trust', `does not take its commit and its checkout from the dispatch input \${{ inputs.sha }}. Next step: use inputs.sha for both.`);
        }
        const wg = wSteps.findIndex(x => x.id === 'sha_gate');
        if (wg < 0 || String(wSteps[wg].run ?? '') !== shaRun || shaRun === '') {
            fail(WIN_JOB, 'win-trust', `does not re-run the SHA gate with the same body as ${BUILD_JOB}'s sha_gate. Next step: copy the gate into publish-windows.`);
        } else if (wSteps.findIndex(x => String(x.uses ?? '').startsWith('actions/download-artifact@')) < wg) {
            fail(WIN_JOB, 'win-trust', `downloads the Windows build before the SHA gate has run. Next step: gate first.`);
        }
        for (const x of wSteps) {
            if (String(x.uses ?? '').startsWith('actions/download-artifact@') && x.with?.name !== 'release-windows') {
                fail(WIN_JOB, 'win-trust', `downloads artifact ${JSON.stringify(x.with?.name ?? null)}; only release-windows (data) may be downloaded. Next step: remove it.`);
            }
        }
        if (/LD_LIBRARY_PATH|signing-tools|chmod \+x/.test(wText)) {
            fail(WIN_JOB, 'win-trust', `references LD_LIBRARY_PATH, signing-tools or chmod +x, which is how runner-built code reaches this job. Next step: use the signmar built from the pinned source.`);
        }
        const wsm = wSteps.find(x => x.id === 'win_signmar');
        if (!/bash scripts\/build-signmar\.sh/.test(String(wsm?.run ?? '')) || wsm?.env !== undefined) {
            fail(WIN_JOB, 'win-trust', `has no win_signmar step that runs scripts/build-signmar.sh with an empty environment. Next step: build signmar from the pinned source.`);
        }
        if (Object.keys(wj.env ?? {}).some(k => /TOKEN|SECRET|P12/i.test(k)) || /secrets\.|github\.token/.test(JSON.stringify(wj.env ?? {}))) {
            fail(WIN_JOB, 'win-trust', `holds a token or secret in job-level env, which every step then sees. Next step: move it to the step that needs it.`);
        }
        wSteps.forEach(x => {
            if (x.id !== 'win_sign_mar' && /MAR_SIGNING_P12|BOT_APP_PRIVATE_KEY/.test(JSON.stringify(x))) {
                fail(WIN_JOB, 'win-trust', `step '${x.name}' names a signing or bot secret; only win_sign_mar may name the MAR key. Next step: remove it.`);
            }
        });
    }

    // 5c. descriptor-windows: the form gate and the downgrade refusal run before the token that can commit.
    const dj = wf.jobs[WIN_DESCRIPTOR_JOB];
    const dSteps = stepsOf(dj);
    if (dj === undefined) {
        fail(WIN_DESCRIPTOR_JOB, 'win-descriptor', `is absent. Next step: restore the descriptor-windows job (owner answer A2).`);
    } else {
        if (!refGuard(String(dSteps[0]?.run ?? ''))) {
            fail(WIN_DESCRIPTOR_JOB, 'win-descriptor', `does not start with the main-dispatch refusal. Next step: restore the first step.`);
        }
        if (dSteps.find(x => String(x.uses ?? '').startsWith('actions/checkout@'))?.with?.ref !== '${{ inputs.sha }}') {
            fail(WIN_DESCRIPTOR_JOB, 'win-descriptor', `does not check out the dispatch input \${{ inputs.sha }}. Next step: check out inputs.sha.`);
        }
        const tokenAt = dSteps.findIndex(x => x.id === 'updates_token');
        const formAt = dSteps.findIndex(x => /node scripts\/verify-channel-live\.mjs --form-only /.test(String(x.run ?? '')));
        if (formAt < 0 || tokenAt < 0 || formAt > tokenAt || failOpenFaults(dSteps[formAt]).length > 0) {
            fail(WIN_DESCRIPTOR_JOB, 'win-descriptor', `does not run verify-channel-live.mjs --form-only, failing closed, before the updates_token mint, so a descriptor naming a URL off the MAR origin could be committed. Next step: restore the form gate before the token step.`);
        }
        const commit = tokenAt < 0 ? undefined : dSteps.slice(tokenAt + 1).find(x => /repos\/\$REPO\/contents\/\$REL/.test(String(x.run ?? '')));
        const downgrade = ifBody(String(commit?.run ?? ''), /if \[ -n "\$CUR_ID" \] && ! \[\[ "\$NEW_ID" > "\$CUR_ID" \]\]/);
        // Not failOpenFaults: the step's HTTP-status capture carries a deliberate `|| true`.
        const commitOpen = commit !== undefined && (Object.hasOwn(commit, 'continue-on-error') || commit.if !== undefined || !/^\s*set -euo pipefail\s*$/m.test(String(commit.run)));
        if (commit === undefined || downgrade === null || !/\bexit 1\b/.test(downgrade) || commitOpen) {
            fail(WIN_DESCRIPTOR_JOB, 'win-descriptor', `commit step does not refuse, with an exit 1, a buildID that is not newer than the committed Windows descriptor, so a downgrade could be offered. Next step: restore the buildID comparison.`);
        }
        dSteps.forEach(x => {
            if (x.id !== 'updates_token' && /BOT_APP_PRIVATE_KEY|MAR_SIGNING_P12/.test(JSON.stringify(x))) {
                fail(WIN_DESCRIPTOR_JOB, 'win-descriptor', `step '${x.name}' names a signing or bot secret; only updates_token may. Next step: remove it.`);
            }
        });
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

    // 9. mar-emit (G-49a): a build-linux upload of *.complete.mar needs the packaging script build-linux runs to
    // make one with make_full_update.sh, or the upload fails at if-no-files-found: error on the first release.
    const buildSteps = stepsOf(wf.jobs[BUILD_JOB]);
    if (buildSteps.some(s => UPLOAD.test(String(s.uses ?? '')) && /\*\.complete\.mar\b/.test(String(s.with?.path ?? '')))) {
        const scripts = [...new Set(buildSteps.flatMap(s => [...String(s.run ?? '').matchAll(/\bpowerbrowser\/packaging\/[A-Za-z0-9_-]+\.sh\b/g)].map(m => m[0])))];
        const read = overrides.read ?? (rel => readText(root, rel));
        // Comment lines are dropped first, so a script that only mentions the tool does not count.
        const invokes = rel => (read(rel) ?? '').split('\n').some(l => !/^\s*#/.test(l) && /\btools\/update-packaging\/make_full_update\.sh\b/.test(l));
        const emits = scripts.filter(invokes);
        if (emits.length === 0) {
            fail(BUILD_JOB, 'mar-emit', `uploads *.complete.mar, but no packaging script it runs (${scripts.join(', ') || 'none'}) invokes make_full_update.sh, so the upload fails with if-no-files-found: error. Next step: make the complete MAR in the packaging script, as docs/BUILD.md describes.`);
        }
    }

    // 10. packaged-rows (G-49b): build-linux runs the packaged rows and install-matrix through the registry, after
    // the packaging step and before the first upload. Labels are read from the step (a `for X in ...` list or a
    // literal --only) and must each be a registry label; the PACKAGED_ROWS contract must be among them.
    const packAt = buildSteps.findIndex(s => /\bpowerbrowser\/packaging\/[A-Za-z0-9_-]+\.sh\b/.test(String(s.run ?? '')));
    const uploadAt = buildSteps.findIndex(s => UPLOAD.test(String(s.uses ?? '')));
    const rowSteps = buildSteps.map((s, i) => [s, i]).filter(([s]) => /scripts\/verify-platform\.sh\s+--only\b/.test(String(s.run ?? '')));
    const ran = new Set();
    for (const [s] of rowSteps) {
        const run = String(s.run);
        for (const m of run.matchAll(/--only\s+([a-z0-9][a-z0-9-]*)\b/g)) ran.add(m[1]);
        for (const m of run.matchAll(/\bfor\s+(\w+)\s+in\s+([^;\n]+);\s*do\b([\s\S]*?)\bdone\b/g)) {
            if (new RegExp(`--only\\s+"?\\$\\{?${m[1]}\\b`).test(m[3])) m[2].trim().split(/\s+/).forEach(l => ran.add(l));
        }
    }
    if (rowSteps.length === 0) {
        fail(BUILD_JOB, 'packaged-rows', `runs no scripts/verify-platform.sh --only step, so the packaged rows and the install matrix never judge the package. Next step: run ${PACKAGED_ROWS.join(', ')} after the packaging step.`);
    } else {
        for (const [s, i] of rowSteps) {
            if (!(packAt >= 0 && i > packAt && (uploadAt < 0 || i < uploadAt))) {
                fail(BUILD_JOB, 'packaged-rows', `step '${s.name}' does not sit between the packaging step and the first upload, so it judges no package or judges it after the upload. Next step: move it directly after the packaging step.`);
            }
        }
        const registry = (overrides.read ?? (rel => readText(root, rel)))(REGISTRY_REL) ?? '';
        // A GATE_KNOWN_OPEN_EXCLUSIONS entry ("label|<ledger id>|reason") names a label but registers nothing.
        const labels = new Set([...registry.matchAll(/^\s*"([a-z0-9][a-z0-9-]*)\|(?!\d+\|)/gm)].map(m => m[1]));
        for (const l of ran) if (!labels.has(l)) fail(BUILD_JOB, 'packaged-rows', `runs --only ${l}, which is not a label in ${REGISTRY_REL}, so the step fails or checks nothing. Next step: register the row or correct the label.`);
        for (const l of PACKAGED_ROWS) if (!ran.has(l)) fail(BUILD_JOB, 'packaged-rows', `does not run ${l} over the built package. Next step: add it to the packaged-rows step.`);
    }

    // 11. purge (G-49c, INF-04): after sign-publish succeeds, one least-privilege hosted job deletes every artifact
    // whose build-linux upload carries a tarball or a MAR (derived from the upload steps, compared as set equality),
    // never one a job behind the descriptor wait reads, and fails when one is still stored.
    const bulky = new Set(buildSteps.filter(s => UPLOAD.test(String(s.uses ?? '')) && /\.tar\.xz|\.mar\b/.test(String(s.with?.path ?? ''))).map(s => s.with?.name));
    const purgeJobs = Object.entries(wf.jobs).filter(([, j]) => stepsOf(j).some(s => /-X DELETE\b[^\n]*\/actions\/artifacts\//.test(String(s.run ?? ''))));
    if (purgeJobs.length !== 1) {
        fail('(workflow)', 'purge', `has ${purgeJobs.length} job(s) deleting artifacts through actions/artifacts/, not one, so the per-release artifact cap rests on retention alone. Next step: restore the purge-artifacts job after ${SIGN_JOB}.`);
    } else {
        const [pid, pj] = purgeJobs[0];
        const steps = stepsOf(pj).filter(s => /-X DELETE\b/.test(String(s.run ?? '')));
        const names = new Set(String(steps[0]?.env?.PURGE ?? '').trim().split(/\s+/).filter(Boolean));
        if (![].concat(pj.needs ?? []).includes(SIGN_JOB) || pj.if !== `needs.${SIGN_JOB}.result == 'success'`) {
            fail(pid, 'purge', `does not run only after ${SIGN_JOB} succeeds (needs ${JSON.stringify(pj.needs ?? null)}, if ${JSON.stringify(pj.if ?? null)}), so it could delete the bytes before the Release holds them. Next step: needs: ${SIGN_JOB} with if: needs.${SIGN_JOB}.result == 'success'.`);
        }
        if (labelsOf(pj).includes(LEGION_LABEL) || Object.hasOwn(pj, 'environment') || JSON.stringify(pj.permissions ?? null) !== JSON.stringify({ actions: 'write' }) || /\bsecrets\s*[.[]|toJSON\(\s*secrets\s*\)/.test(JSON.stringify(pj))) {
            fail(pid, 'purge', `is not a hosted job with permissions exactly {actions: write}, no environment and no secret (permissions ${JSON.stringify(pj.permissions ?? null)}). Next step: restore the least-privilege shape.`);
        }
        const missing = [...bulky].filter(n => !names.has(n));
        const extra = [...names].filter(n => !bulky.has(n));
        if (missing.length || extra.length) {
            fail(pid, 'purge', `PURGE ${JSON.stringify([...names])} differs from the ${BUILD_JOB} artifacts that carry a tarball or a MAR ${JSON.stringify([...bulky])} (not deleted: ${JSON.stringify(missing)}; not bulky: ${JSON.stringify(extra)}). Next step: list exactly those artifacts.`);
        }
        for (const n of names) if (lateArtifacts.has(n)) fail(pid, 'purge', `deletes ${n}, which a job behind the ${DESCRIPTOR_ENV} wait reads. Next step: keep it.`);
        const run = String(steps[0]?.run ?? '');
        if (!/\blength\b[\s\S]*\[\s*"\$LEFT"\s*=\s*"0"\s*\]\s*\|\|[^\n]*exit 1/.test(run)) {
            fail(pid, 'purge', `does not fail when an artifact is still stored after the delete, so a failed delete passes silently. Next step: restore the remaining-count check that exits 1.`);
        }
        for (const f of steps[0] ? failOpenFaults(steps[0]) : []) fail(pid, 'purge', `delete step ${f}. Next step: remove it.`);
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
    console.log(`${NAME}: PASS -- ${RELEASE_REL} dispatches on workflow_dispatch only with a required sha input; build-linux runs on ${LEGION_LABEL} with no environment and no secret; the SHA-ancestor and key>tag gates precede the build and every later step is gated on the key; legion permissions are exactly contents: read with no secrets reference; sign-publish takes its commit from inputs.sha, re-gates, derives the key and builds signmar from the pinned source; publish-windows and descriptor-windows carry the same dispatch, SHA and secret-scope gates, and the Windows form gate and downgrade refusal run before the token mint; ${uploads} upload-artifact step(s) keep retention-days 1, except the data-only artifacts the jobs behind the ${DESCRIPTOR_ENV} wait read, which outlive it; no cache step or cache input.`);
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
    // The first occurrence inside one job's text: later jobs (publish-windows) repeat sign-publish's gates.
    const editIn = (job, from, to) => {
        const start = real.indexOf(`\n  ${job}:\n`);
        const next = start < 0 ? -1 : real.slice(start + 1).search(/\n  [a-z][a-z0-9-]*:\n/);
        const end = next < 0 ? real.length : start + 1 + next;
        const at = start < 0 ? -1 : real.indexOf(from, start);
        if (at < 0 || at >= end) throw new Error(`self-test anchor '${from.trim()}' is absent from ${job} in ${RELEASE_REL}`);
        return real.slice(0, at) + to + real.slice(at + from.length);
    };
    const editLast = (from, to) => editIn(SIGN_JOB, from, to);
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
        ['package-linux.sh no longer makes the complete MAR', { read: rel => (rel === PKG_LINUX_REL ? readText(REPO_ROOT, rel).split('\n').filter(l => !l.includes('make_full_update.sh')).join('\n') : readText(REPO_ROOT, rel)) }, 'mar-emit', PKG_LINUX_REL],
        ['package-linux.sh names make_full_update.sh only in a comment', { read: rel => (rel === PKG_LINUX_REL ? readText(REPO_ROOT, rel).replace(/^(.*tools\/update-packaging\/make_full_update\.sh.*)$/m, '# $1') : readText(REPO_ROOT, rel)) }, 'mar-emit', 'invokes make_full_update.sh'],
        ['packaged-rows step drops install-matrix', edit('for LABEL in ng063-packaged-launch portable-elf sidecar-no-symlinks package-target-natives packaged-identity install-matrix; do', 'for LABEL in ng063-packaged-launch portable-elf sidecar-no-symlinks package-target-natives packaged-identity; do'), 'packaged-rows', 'does not run install-matrix'],
        ['packaged-rows step runs an unregistered label', edit('for LABEL in ng063-packaged-launch portable-elf sidecar-no-symlinks package-target-natives packaged-identity install-matrix; do', 'for LABEL in ng063-packaged-launch portable-elf sidecar-no-symlinks package-target-natives packaged-identity install-matrix install-matrx; do'), 'packaged-rows', 'install-matrx'],
        ['packaged-rows step removed', edit('nix develop .#theia --command scripts/verify-platform.sh --only "$LABEL"', 'true "$LABEL"'), 'packaged-rows', 'runs no scripts/verify-platform.sh --only step'],
        ['packaged-rows step after the first upload', edit('      # G-49b (ROADMAP Phase 49 criterion 2)', "      - name: Probe\n        if: steps.key_gate.outputs.build == 'true'\n        uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # probe\n        with:\n          name: probe\n          path: probe\n          retention-days: 1\n\n      # G-49b (ROADMAP Phase 49 criterion 2)"), 'packaged-rows', 'does not sit between'],
        ['install-matrix unregistered', { read: rel => (rel === REGISTRY_REL ? readText(REPO_ROOT, rel).replace(/^\s*"install-matrix\|.*$/m, '') : readText(REPO_ROOT, rel)) }, 'packaged-rows', 'not a label'],
        ['purge-artifacts job removed', edit('              gh api -H \'X-GitHub-Api-Version: 2022-11-28\' -X DELETE', '              gh api -H \'X-GitHub-Api-Version: 2022-11-28\' -X GET'), 'purge', 'not one'],
        ['purge job granted contents: write', edit('    permissions:\n      actions: write\n', '    permissions:\n      actions: write\n      contents: write\n'), 'purge', 'exactly {actions: write}'],
        ['purge job runs whatever sign-publish did', edit("    needs: sign-publish\n    if: needs.sign-publish.result == 'success'\n    runs-on: ubuntu-latest\n    timeout-minutes: 10\n", '    needs: sign-publish\n    if: always()\n    runs-on: ubuntu-latest\n    timeout-minutes: 10\n'), 'purge', 'only after sign-publish succeeds'],
        ['purge deletes the descriptor manifest', edit('          PURGE: release-linux\n', '          PURGE: release-linux release-linux-manifest\n'), 'purge', 'behind the descriptor wait'],
        ['purge misses the tarball artifact', edit('          PURGE: release-linux\n', '          PURGE: release-windows\n'), 'purge', 'not deleted: ["release-linux"]'],
        ['purge remaining-count check removed', edit('[ "$LEFT" = "0" ] ||', 'true ||'), 'purge', 'still stored'],
        ['publish-windows ref refusal removed', editIn(WIN_JOB, '[ "$GITHUB_REF" = "refs/heads/main" ]', 'true'), 'win-trust', 'main-dispatch refusal'],
        ['publish-windows sha from a build output', editIn(WIN_JOB, 'RELEASE_SHA: ${{ inputs.sha }}', 'RELEASE_SHA: ${{ needs.build-windows.outputs.sha }}'), 'win-trust', 'dispatch input'],
        ['publish-windows SHA gate removed', editIn(WIN_JOB, '        id: sha_gate\n', '        id: sha_gate_x\n'), 'win-trust', 'SHA gate'],
        ['publish-windows SHA gate HEAD equality removed', editIn(WIN_JOB, '[ "$SHA" = "$RELEASE_SHA" ] ||', ': ||'), 'win-trust', 'SHA gate'],
        ['publish-windows downloading another artifact', editIn(WIN_JOB, '          name: release-windows\n', '          name: signing-tools\n'), 'win-trust', 'only release-windows'],
        ['publish-windows signmar handed an env', editIn(WIN_JOB, '        id: win_signmar\n', '        id: win_signmar\n        env:\n          X: y\n'), 'win-trust', 'win_signmar'],
        ['MAR key named outside win_sign_mar', editIn(WIN_JOB, '        id: win_verify_mar\n        env:\n', '        id: win_verify_mar\n        env:\n          P: ${{ secrets.MAR_SIGNING_P12_B64 }}\n'), 'win-trust', 'signing or bot secret'],
        ['descriptor-windows ref refusal removed', editIn(WIN_DESCRIPTOR_JOB, '[ "$GITHUB_REF" = "refs/heads/main" ]', 'true'), 'win-descriptor', 'main-dispatch refusal'],
        ['descriptor-windows form gate removed', editIn(WIN_DESCRIPTOR_JOB, 'node scripts/verify-channel-live.mjs --form-only ', 'true '), 'win-descriptor', '--form-only'],
        ['descriptor-windows buildID comparison removed', editIn(WIN_DESCRIPTOR_JOB, '! [[ "$NEW_ID" > "$CUR_ID" ]]', 'false'), 'win-descriptor', 'not newer'],
        ['descriptor-windows downgrade refusal no longer exits', editIn(WIN_DESCRIPTOR_JOB, 'is newer than $CUR_ID" >&2\n              exit 1\n', 'is newer than $CUR_ID" >&2\n'), 'win-descriptor', 'not newer'],
        ['signmar pin for another ESR tag',{ read: rel => (rel === PIN_REL ? readText(REPO_ROOT, PIN_REL).replace(/^# tag .*$/m, '# tag wrong-tag') : readText(REPO_ROOT, rel)) }, 'sign-pin', 'wrong-tag'],
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
