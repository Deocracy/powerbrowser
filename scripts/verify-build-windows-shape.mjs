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
//  8. steps      the job runs `./mach build`, then powerbrowser/packaging/package-windows.sh (the sidecar and
//                Node staging, the zip rewrite and the repackage calls) before it uploads; no step calls
//                get_vs.py or sets WINSYSROOT (--enable-bootstrap fetches the pinned vs toolchain).
//  8b. repackage package-windows.sh passes every REQUIRED argument of `mach repackage installer` and
//                `mach repackage mar`, derived at check time from the pinned tree's mach_commands.py
//                (required=True); the upload paths sit under the directory it writes to and end in the
//                suffixes of the files it names.
//  9. retention  every upload-artifact step sets retention-days 1 and fails on no files; the file
//                carries at least one, so the rule is not vacuous. The one exception (54-11) is the identity
//                upload: exactly <objdir>/config.status and <objdir>/dist/bin/application.ini, the files
//                scripts/build-update-xml.mjs reads, which descriptor-windows reads behind the descriptor wait;
//                release-shape judges its retention against that wait and refuses a MAR in it.
// 10. no-cache   no actions/cache step, no cache input.
// 11. independent build-windows needs exactly the hosted producers (PRODUCERS: windows-sidecar, G-54a, and
//                windows-orca, P68-03) and reads only their sums_sha256 outputs. For each producer: the staging
//                step reads its digest variable only from needs.<producer>.outputs.sums_sha256 (never vars.) and
//                passes it and the producer's _DIR variable (/src/<producer>) into the container; the producer's
//                artifact is downloaded into a path equal to its name before package-windows.sh. The producer
//                runs on exactly windows-latest with exactly contents: read, no environment, secret or needs,
//                SHA-pinned actions/ uses, refuses any ref but main first, writes BUILD_ROOT, hashes SHA256SUMS in
//                its sums step after the check-win-sidecar.sh check and purge on its own output, and uploads one
//                artifact named after itself with retention-days 1 and if-no-files-found error.
//                The join with package-windows.sh: the shell variable assigned from the producer's _DIR variable
//                must be admitted by a check-win-sidecar.sh check whose second argument names the producer's
//                digest variable, before the first cp from that variable. The job graph and the script's
//                admission order are proven together; each red names the producer.
// 12. node pin    the `run:` text of the Node-pin step is EXECUTED (with a nix shim, in a temp directory)
//                against the real node-runtime.json, which it must accept, and against fixtures with a wrong
//                version, a missing win32-x64 key and a bad digest, which it must each refuse.
//
// Instrument: js-yaml from theia/ through scripts/lib/release-workflow.mjs. A missing js-yaml,
// an unreadable file and a parse error are FAILs; zero jobs is a FAIL, never a pass.
//
// Honestly --quick: it reads the workflow text and parses YAML, and rule 12 runs the Node-pin step's
// shell text in a mkdtemp directory it removes. The self-test plants each fault in memory through
// runChecks' overrides. It does not build, open a browser or display, or reach the network. The live run on legion is the owner's (54-04 checkpoint).

import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
// The build identity the descriptor emitter reads, relative to the objdir (scripts/build-update-xml.mjs APP_INI_REL,
// CONFIG_STATUS_REL; not imported, because that script runs its CLI on import).
const IDENTITY_FILES = Object.freeze(['config.status', 'dist/bin/application.ini']);
const pathsOf = st => String(st.with?.path ?? '').split('\n').map(x => x.trim()).filter(Boolean);
const isIdentityUpload = (st, objdir) => {
    const paths = pathsOf(st);
    return objdir !== undefined && paths.length === IDENTITY_FILES.length && IDENTITY_FILES.every(f => paths.includes(`${objdir}/${f}`));
};
const CACHE = /^actions\/cache@/;
const PINNED = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@[0-9a-f]{40}$/;
const PACKAGE_REL = 'powerbrowser/packaging/package-windows.sh';
const MACH_REL = 'upstream/python/mozbuild/mozbuild/mach_commands.py';
const PIN_REL = 'powerbrowser/packaging/node-runtime.json';
const PIN_KEY = 'win32-x64';
// The hosted producers build-windows needs, each with the digest and directory variables package-windows.sh reads.
const PRODUCERS = Object.freeze([
    Object.freeze({ name: 'windows-sidecar', digestEnv: 'PB_WIN_SIDECAR_SUMS_SHA256', dirEnv: 'PB_WIN_SIDECAR_DIR' }),
    Object.freeze({ name: 'windows-orca', digestEnv: 'PB_WIN_ORCA_SUMS_SHA256', dirEnv: 'PB_WIN_ORCA_DIR' }),
]);
const PRODUCER_LABEL = 'windows-latest';
const DOWNLOAD = /^actions\/download-artifact@/;
const digestRef = p => `\${{ needs.${p.name}.outputs.sums_sha256 }}`;
const PRODUCER_OUTPUT = '${{ steps.sums.outputs.sha256 }}';

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

// The required long flags (and their short aliases) of `mach repackage <sub>`, parsed from the pinned tree.
function requiredFlags(machText, sub) {
    const start = machText.search(new RegExp(`@SubCommand\\(\\s*"repackage",\\s*"${sub}"`));
    if (start < 0) return null;
    const end = machText.indexOf('\ndef ', start);
    const block = machText.slice(start, end < 0 ? undefined : end);
    const out = [];
    for (const m of block.matchAll(/@CommandArgument\(([^\n]*)\)$|@CommandArgument\(\n([\s\S]*?)\n\)/gm)) {
        const body = m[1] ?? m[2];
        if (!/required\s*=\s*True/.test(body)) continue;
        const names = [...body.matchAll(/"(-{1,2}[A-Za-z_-]+)"/g)].map(x => x[1]);
        const long = names.find(n => n.startsWith('--'));
        if (long) out.push({ long, aliases: names });
    }
    return out;
}

// The `mach repackage <sub>` command in a shell script, continuation lines joined, as its tokens.
function commandTokens(script, sub) {
    const joined = script.replace(/\\\n/g, ' ');
    const line = joined.split('\n').find(l => new RegExp(`mach repackage ${sub}\\b`).test(l) && !l.trim().startsWith('#'));
    return line === undefined ? null : line.split(/\s+/);
}

// Runs the Node-pin step's text against a node-runtime.json in a temp dir; nix is a shim that execs the command.
function runPinStep(runText, pinText) {
    const dir = mkdtempSync(join(tmpdir(), 'build-windows-shape-pin-'));
    try {
        mkdirSync(join(dir, 'powerbrowser', 'packaging'), { recursive: true });
        mkdirSync(join(dir, 'bin'));
        writeFileSync(join(dir, PIN_REL), pinText);
        const shim = join(dir, 'bin', 'nix');
        writeFileSync(shim, '#!/bin/sh\n[ "$1" = develop ] && [ "$2" = .#theia ] && [ "$3" = --command ] || exit 97\nshift 3\nexec "$@"\n');
        chmodSync(shim, 0o755);
        const r = spawnSync('bash', ['-c', runText], { cwd: dir, encoding: 'utf8', env: { ...process.env, PATH: `${join(dir, 'bin')}:${process.env.PATH}` } });
        return { status: r.status, out: `${r.stdout}${r.stderr}` };
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

// The join with package-windows.sh: the variable assigned from the producer's _DIR variable is admitted by a
// check-win-sidecar.sh check naming the producer's digest variable before the first cp from it. Returns a fault or null.
function admissionFault(script, p) {
    const assign = new RegExp(`^([A-Za-z_][A-Za-z0-9_]*)="\\$\\{${p.dirEnv}:-\\}"`, 'm').exec(script);
    if (assign === null) return `assigns no shell variable from ${p.dirEnv}, so the ${p.name} directory is never read. Next step: restore NAME="\${${p.dirEnv}:-}".`;
    const v = assign[1];
    const lines = script.split('\n');
    const live = l => !l.trim().startsWith('#');
    const checkAt = lines.findIndex(l => live(l) && new RegExp(`check-win-sidecar\\.sh"?\\s+check\\s+"\\$${v}"\\s+"[^"]*\\b${p.digestEnv}\\b`).test(l));
    const cpAt = lines.findIndex(l => live(l) && new RegExp(`^\\s*cp\\b.*"\\$${v}[/"]`).test(l));
    if (cpAt < 0) return `never copies from "$${v}" (${p.dirEnv}), so nothing from ${p.name} is staged and the admission order proves nothing. Next step: stage the artifact.`;
    if (checkAt < 0 || checkAt > cpAt) return `copies from "$${v}" (${p.dirEnv}) at line ${cpAt + 1} before its check-win-sidecar.sh check against ${p.digestEnv}${checkAt < 0 ? ' (no such check)' : ` (line ${checkAt + 1})`}, so an unadmitted ${p.name} tree reaches the stage. Next step: admit it first.`;
    return null;
}

// Rule 11, per producer (G-54a, P68-03): the hosted job, the one value build-windows reads from it, its download,
// the container env, and package-windows.sh's admission of its directory. Every red is rule <producer>.
function producerChecks(wf, job, text, script, p, fail) {
    const rule = p.name;
    const where = `(${p.name})`;
    const ref = digestRef(p);
    const steps = stepsOf(job);
    const runOf = st => String(st.run ?? '');
    const stage = steps.find(st => /package-windows\.sh/.test(runOf(st)));
    const env = stage?.env?.[p.digestEnv];
    if (env !== ref) fail('(job)', rule, `the staging step reads ${p.digestEnv} from ${JSON.stringify(env ?? null)}, not ${ref}. The digest must be the producer's job output, recorded outside the artifact. Next step: set it from that output.`);
    if (new RegExp(`vars\\.${p.digestEnv}\\b`).test(text)) fail('(workflow)', rule, `reads vars.${p.digestEnv}; a repository variable cannot carry the per-run digest. Next step: read ${ref}.`);
    const other = [...JSON.stringify(job).matchAll(new RegExp(`needs\\.${p.name}\\.[A-Za-z0-9_.-]+`, 'g'))].map(m => m[0]).filter(r => `\${{ ${r} }}` !== ref);
    if (other.length > 0) fail('(job)', rule, `reads ${other[0]}; the only ${p.name} value build-windows may read is ${ref}. Next step: remove it.`);
    if (stage !== undefined && !(runOf(stage).includes(`-e ${p.dirEnv}=/src/${p.name} `) && new RegExp(`-e ${p.digestEnv}(\\s|$)`).test(runOf(stage)))) {
        fail('(job)', rule, `the staging step does not pass -e ${p.dirEnv}=/src/${p.name} and -e ${p.digestEnv} into the container, so package-windows.sh cannot find or admit the ${p.name} artifact. Next step: pass both.`);
    }
    const packAt = steps.findIndex(st => /powerbrowser\/packaging\/package-windows\.sh/.test(runOf(st)));
    const dlAt = steps.findIndex(st => DOWNLOAD.test(String(st.uses ?? '')) && st.with?.name === p.name);
    if (dlAt < 0) fail('(job)', rule, `has no download-artifact step for ${p.name}, so package-windows.sh finds no ${p.name} tree. Next step: download it before the staging step.`);
    else if (steps[dlAt].with?.path !== p.name || !(packAt < 0 || dlAt < packAt)) fail('(job)', rule, `downloads ${p.name} to path ${JSON.stringify(steps[dlAt].with?.path ?? null)} or after the staging step; it must land in path ${p.name} before it. Next step: fix the step.`);
    if (script !== null) {
        const fault = admissionFault(script, p);
        if (fault !== null) fail(PACKAGE_REL, rule, `${PACKAGE_REL} ${fault}`);
    }

    const pj = wf.jobs[p.name];
    if (pj === undefined || pj === null || typeof pj !== 'object') {
        fail(where, rule, `the ${p.name} job is absent, so no ${p.name} artifact and no digest exist. Next step: restore it.`);
        return;
    }
    const ps = stepsOf(pj);
    if (JSON.stringify(labelsOf(pj)) !== JSON.stringify([PRODUCER_LABEL])) fail(where, rule, `runs-on ${JSON.stringify(labelsOf(pj))}, not exactly [${PRODUCER_LABEL}]; ${p.name} is built on a GitHub-hosted Windows runner, never on legion. Next step: set runs-on: ${PRODUCER_LABEL}.`);
    if (!(pj.permissions && Object.keys(pj.permissions).length === 1 && pj.permissions.contents === 'read')) fail(where, rule, `permissions are ${JSON.stringify(pj.permissions ?? null)}, not exactly {contents: read}. Next step: set permissions: contents: read.`);
    if (Object.hasOwn(pj, 'environment')) fail(where, rule, `has an environment key; the producer holds no environment. Next step: remove it.`);
    if (/\bsecrets\b/.test(JSON.stringify(pj))) fail(where, rule, `reaches a secrets reference; the producer holds no secret. Next step: remove it.`);
    if (Object.hasOwn(pj, 'needs')) fail(where, rule, `declares needs ${JSON.stringify(pj.needs)}; the producer starts from inputs.sha alone. Next step: remove needs.`);
    if (pj.outputs?.sums_sha256 !== PRODUCER_OUTPUT) fail(where, rule, `declares output sums_sha256 as ${JSON.stringify(pj.outputs?.sums_sha256 ?? null)}, not ${PRODUCER_OUTPUT}. Next step: restore it.`);
    const sums = ps.find(st => st.id === 'sums');
    if (!sums || !/sha256sum "\$OUT\/SHA256SUMS"/.test(runOf(sums)) || !/check-win-sidecar\.sh check\b/.test(runOf(sums)) || !/check-win-sidecar\.sh purge\b/.test(runOf(sums)) || !/sha256=\$SUMS"? >> "\$GITHUB_OUTPUT"/.test(runOf(sums))) {
        fail(where, rule, `the sums step does not hash SHA256SUMS, run the check-win-sidecar.sh check and purge on its own output, and write sha256= to GITHUB_OUTPUT. Next step: restore it.`);
    }
    if (!ps.some(st => /> "\$OUT\/BUILD_ROOT"/.test(runOf(st)))) fail(where, rule, `writes no BUILD_ROOT, so the checkout-path purge has no root to look for. Next step: write $GITHUB_WORKSPACE to BUILD_ROOT.`);
    if (!refGuardOf(String(ps[0]?.run ?? ''))) fail(where, rule, `the first step does not refuse any ref but refs/heads/main and any event but workflow_dispatch. Next step: restore it.`);
    const ups = ps.filter(st => UPLOAD.test(String(st.uses ?? '')));
    if (ups.length !== 1 || ups[0].with?.name !== p.name || Number(ups[0].with?.['retention-days']) !== 1 || ups[0].with?.['if-no-files-found'] !== 'error') {
        fail(where, rule, `must upload exactly one artifact named ${p.name} with retention-days 1 and if-no-files-found error (got ${JSON.stringify(ups.map(u => u.with ?? null))}). Next step: restore the upload step.`);
    }
    for (const st of ps) {
        const uses = typeof st.uses === 'string' ? st.uses : null;
        if (uses !== null && !(PINNED.test(uses) && uses.startsWith('actions/'))) fail(where, rule, `uses ${uses}, which is not a SHA-pinned GitHub-owned action. Next step: pin it.`);
        if (CACHE.test(uses ?? '')) fail(where, rule, `carries a cache step. Next step: remove it.`);
        for (const f of failOpenFaults(st, undefined)) fail(where, rule, `step '${st.name ?? st.uses}' ${f}. Next step: remove it.`);
    }
}

const refGuardOf = r => r.includes('[ "$GITHUB_EVENT_NAME" = "workflow_dispatch" ]') && r.includes('[ "$GITHUB_REF" = "refs/heads/main" ]') && /\|\| \{[^}]*exit 1/.test(r);

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
    // 11. the needs edges: exactly the hosted producers, and only their digest outputs are read
    const names = PRODUCERS.map(p => p.name);
    const needs = [].concat(job.needs ?? []).map(String);
    if (JSON.stringify([...needs].sort()) !== JSON.stringify([...names].sort()) || new Set(needs).size !== needs.length) {
        fail('(job)', 'independent', `declares needs ${JSON.stringify(needs)}, not exactly [${names.join(', ')}]. build-windows may wait only on the hosted producers, never on a legion output. Next step: set needs: [${names.join(', ')}].`);
    }
    const foreign = [...JSON.stringify(job).matchAll(/needs\.([A-Za-z0-9_-]+)/g)].map(m => m[1]).filter(n => !names.includes(n));
    if (foreign.length > 0) fail('(job)', 'independent', `reads needs.${foreign[0]}, which is not a hosted producer. Next step: remove it.`);
    const script = overrides.script !== undefined ? overrides.script : readText(root, PACKAGE_REL);
    for (const p of PRODUCERS) producerChecks(wf, job, text, script, p, fail);

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
    // 6a. rulings (P68-21, harness-other-04): no Windows release carries Orca's shipped closure while an owner licence
    // ruling is pending. The step must exist, run once the key gate has passed, and come before the first build step; it is
    // a step after key_gate, so the fail-open loop below also refuses continue-on-error, `|| true` and `set +e` on it.
    const rulingsAt = steps.map((st, i) => [st, i]).filter(([st]) => /\bscripts\/verify-licence-allowlist\.mjs --rulings\b/.test(String(st.run ?? ''))).map(([, i]) => i);
    if (rulingsAt.length === 0) {
        fail('(job)', 'rulings', `has no step running scripts/verify-licence-allowlist.mjs --rulings, so a Windows release could carry Orca's closure while an owner licence ruling is pending (P68-21). Next step: restore the guard before the first build step, the way ${REF_JOB} has it.`);
    } else if (keyAt >= 0 && rulingsAt[0] < keyAt) {
        fail(steps[rulingsAt[0]].name ?? '(step)', 'rulings', `runs the --rulings guard before key_gate, so it runs on a commit the key gate has not admitted. Next step: move it after key_gate.`);
    } else if (buildAt >= 0 && rulingsAt[0] > buildAt) {
        fail(steps[rulingsAt[0]].name ?? '(step)', 'rulings', `runs the --rulings guard after the first build step (step ${buildAt}), so the build has already started while a licence ruling may be pending. Next step: move it before the first build step.`);
    }
    // The guard may be called through scripts/run-no-skip.sh (a check that did not run is a failure there). The wrapper is not
    // a way to hide one: --allow-skip names a pattern for a documented normal skip, and --rulings has none (it exits 0 or 1),
    // so any --allow-skip on this call is red, whatever its pattern; `|| true` and continue-on-error are refused by the
    // fail-open loop below like for every step.
    if (rulingsAt.length > 0) {
        for (const line of String(steps[rulingsAt[0]].run ?? '').split('\n').filter(l => /\bverify-licence-allowlist\.mjs --rulings\b/.test(l))) {
            if (/\brun-no-skip\.sh\b/.test(line) && /--allow-skip\b/.test(line)) {
                fail(steps[rulingsAt[0]].name ?? '(step)', 'rulings', `calls the --rulings guard through run-no-skip.sh with --allow-skip (${line.trim()}), which lets a skipped guard pass. The guard has no normal skip. Next step: remove --allow-skip.`);
            }
        }
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

    // 8. the build, then package-windows.sh, before the upload; no hand-fetched sysroot
    const runOf = st => String(st.run ?? '');
    const machAt = steps.findIndex(st => /\.\/mach build\b/.test(runOf(st)));
    const packAt = steps.findIndex(st => /powerbrowser\/packaging\/package-windows\.sh/.test(runOf(st)) && !runOf(st).trim().startsWith('#'));
    const uploadAt = steps.findIndex(st => UPLOAD.test(String(st.uses ?? '')));
    if (machAt < 0) fail('(job)', 'steps', 'no step runs ./mach build, so nothing is built. Next step: restore the cross-build step.');
    if (packAt < 0) fail('(job)', 'steps', `no step runs ${PACKAGE_REL}, so the sidecar, the Node runtime, the installer and the complete MAR are never produced from the staged tree. Next step: add the staging step between ./mach build and the upload.`);
    else if (!(machAt >= 0 && machAt < packAt && (uploadAt < 0 || packAt < uploadAt))) fail('(job)', 'steps', `runs ${PACKAGE_REL} out of order; it must follow ./mach build and precede the upload. Next step: reorder the steps.`);
    for (const st of steps) {
        const m = /get_vs\.py|WINSYSROOT/.exec(runOf(st) + JSON.stringify(st.env ?? {}));
        if (m) fail(st.name ?? '(step)', 'steps', `step '${st.name}' uses ${m[0]}. --enable-bootstrap fetches the pinned vs toolchain; a hand-fetched sysroot is unpinned. Next step: remove it.`);
    }

    // 8b. package-windows.sh passes every required repackage argument (derived from the pinned tree); the upload matches its outputs
    const mach = overrides.mach !== undefined ? overrides.mach : readText(root, MACH_REL);
    if (script === null) fail(PACKAGE_REL, 'repackage', `could not be read. Next step: restore ${PACKAGE_REL}.`);
    else if (mach === null) fail(MACH_REL, 'repackage', `could not be read, so the required repackage arguments cannot be derived. Next step: run scripts/fetch-upstream.sh.`);
    else {
        for (const sub of ['installer', 'mar']) {
            const need = requiredFlags(mach, sub);
            const tokens = commandTokens(script, sub);
            if (need === null || need.length === 0) fail(MACH_REL, 'repackage', `defines no required argument for mach repackage ${sub}; the derivation found nothing. Next step: fix the row's parser.`);
            else if (tokens === null) fail(PACKAGE_REL, 'repackage', `has no mach repackage ${sub} command. Next step: add it with its required arguments.`);
            else {
                for (const f of need) {
                    if (!f.aliases.some(a => tokens.includes(a))) fail(PACKAGE_REL, 'repackage', `mach repackage ${sub} lacks the required ${f.long} (${MACH_REL}). Next step: pass it.`);
                }
            }
        }
        const outDir = /^OBJ="\$ROOT\/([^"]+)"/m.exec(script)?.[1];
        const outSub = /^OUT="\$OBJ\/([^"]+)"/m.exec(script)?.[1];
        const suffixes = [...script.matchAll(/--output "\$OUT\/\$BASE(\.[A-Za-z.]+)"/g)].map(m => m[1]);
        const uploads = steps.filter(st => UPLOAD.test(String(st.uses ?? '')) && !isIdentityUpload(st, outDir)).flatMap(pathsOf);
        if (!outDir || !outSub || suffixes.length < 2) fail(PACKAGE_REL, 'repackage', 'does not name its output directory (OBJ=, OUT=) and the two output suffixes the row compares the upload with. Next step: restore them.');
        else {
            const dir = `${outDir}/${outSub}`;
            for (const u of uploads) {
                if (!u.startsWith(`${dir}/`)) fail('(upload)', 'repackage', `upload path '${u}' is not under ${dir}/, the directory ${PACKAGE_REL} writes to, so it would match nothing. Next step: upload from there.`);
            }
            for (const suf of suffixes) {
                if (!uploads.some(u => u.endsWith(`*${suf}`))) fail('(upload)', 'repackage', `no upload path ends in *${suf}, a file ${PACKAGE_REL} writes. Next step: add the glob.`);
            }
        }
    }

    // 12. the Node-pin step is executed against the real pin and against fixtures
    const pinStep = steps.find(st => runOf(st).includes(PIN_REL));
    const pinReal = readText(root, PIN_REL);
    if (pinStep === undefined) fail('(job)', 'node-pin', `has no step that checks ${PIN_REL}. Next step: restore the Node-pin step.`);
    else if (pinReal === null) fail(PIN_REL, 'node-pin', `could not be read. Next step: restore ${PIN_REL}.`);
    else {
        const real = JSON.parse(pinReal);
        const entry = real[PIN_KEY];
        const variants = [
            ['the real pin', pinReal, 0],
            ['a url naming another version', JSON.stringify({ ...real, [PIN_KEY]: { ...entry, version: 'v0.0.1' } }), 1],
            ['a missing win32-x64 key', JSON.stringify(Object.fromEntries(Object.entries(real).filter(([k]) => k !== PIN_KEY))), 1],
            ['a malformed digest', JSON.stringify({ ...real, [PIN_KEY]: { ...entry, sha256: 'xyz' } }), 1],
        ];
        for (const [what, text, wantStatus] of variants) {
            const r = runPinStep(runOf(pinStep), text);
            const ok = wantStatus === 0 ? r.status === 0 : r.status !== null && r.status !== 0;
            if (!ok) fail(pinStep.name ?? '(step)', 'node-pin', `the Node-pin step's own text exits ${r.status} for ${what}, expected ${wantStatus === 0 ? '0' : 'non-zero'}: ${r.out.trim().slice(0, 160)}. Next step: fix the filter in release.yml.`);
        }
    }

    // 9. retention, 10. no cache, over the job
    const objdir = script === null ? undefined : /^OBJ="\$ROOT\/([^"]+)"/m.exec(script)?.[1];
    let uploads = 0;
    for (const st of steps) {
        const uses = typeof st.uses === 'string' ? st.uses : '';
        if (UPLOAD.test(uses)) {
            uploads += 1;
            if (!isIdentityUpload(st, objdir) && Number(st.with?.['retention-days']) !== 1) {
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
    // Producer plants edit one producer job only: the slice from its header to the next job header.
    const bounds = {};
    for (const { name } of PRODUCERS) {
        const ph = real.indexOf(`\n  ${name}:\n`);
        const next = /\n  [A-Za-z0-9_-]+:\n/g;
        next.lastIndex = ph + 1;
        const m = ph < 0 ? null : next.exec(real);
        if (ph < 0 || ph > h || m === null) {
            console.error(`${NAME}: --self-test FAIL -- the ${name} job does not precede ${JOB} in ${RELEASE_REL}; the producer plants cannot be placed.`);
            return 1;
        }
        bounds[name] = [ph, m.index];
    }
    const prodEdit = (name, from, to) => {
        const [ph, pe] = bounds[name];
        const prodSlice = real.slice(ph, pe);
        if (!prodSlice.includes(from)) throw new Error(`self-test anchor '${from.trim().split('\n')[0]}' is absent from the ${name} job`);
        return real.slice(0, ph) + prodSlice.replace(from, to) + real.slice(pe);
    };
    const removeJob = name => real.slice(0, bounds[name][0]) + real.slice(bounds[name][1]);
    const [SIDECAR, ORCA] = PRODUCERS;
    const NEEDS = `    needs: [${SIDECAR.name}, ${ORCA.name}]\n`;
    const EXACT = `not exactly [${SIDECAR.name}, ${ORCA.name}]`;
    const download = p => `      - name: Download the hosted Windows ${p === SIDECAR ? 'sidecar into windows-sidecar/' : 'Orca tree into windows-orca/'} (data, admitted by its digest before staging)\n        if: steps.key_gate.outputs.build == 'true'\n        uses: actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333 # v8.0.2\n        with:\n          name: ${p.name}\n          path: ${p.name}\n`;
    // The Orca rulings guard step, found by what it is (the step of this job that runs the licence-allowlist rulings check, through
    // run-no-skip.sh or directly), never by a quoted line: a rewording of the step or its call must not break the plants.
    const stepStarts = [...slice.matchAll(/^ {6}- /gm)].map(m => m.index);
    const stepBlocks = stepStarts.map((at, i) => ({ at, end: i + 1 < stepStarts.length ? stepStarts[i + 1] : slice.length }));
    const blockOf = re => {
        const hit = stepBlocks.filter(b => re.test(slice.slice(b.at, b.end)));
        if (hit.length === 0) throw new Error(`self-test: no step of the ${JOB} job matches ${re}`);
        return hit[0];
    };
    const RULINGS_LINE = /^( *)[^\n]*\bverify-licence-allowlist\.mjs --rulings\b[^\n]*$/m;
    const RULINGS_CMD = 'nix develop .#theia --command node scripts/verify-licence-allowlist.mjs --rulings';
    const rulingsBlock = () => blockOf(/\bverify-licence-allowlist\.mjs --rulings\b/);
    const withRulings = (mutate, allowSame = false) => {
        const blk = rulingsBlock();
        const text = slice.slice(blk.at, blk.end);
        const out = mutate(text);
        if (out === text && !allowSame) throw new Error('self-test: a rulings-guard plant changed nothing');
        return real.slice(0, h) + slice.slice(0, blk.at) + out + slice.slice(blk.end) + real.slice(t);
    };
    // Rewrites the one command line of the step. The line plants use a fixed wrapped call, so they do not depend on how the
    // step is written today.
    const rulingsLine = (to, allowSame = false) => withRulings(text => text.replace(RULINGS_LINE, (_m, indent) => `${indent}${to}`), allowSame);
    const WRAPPED = `bash scripts/run-no-skip.sh -- ${RULINGS_CMD}`;
    const rulingsMoved = () => {
        const blk = rulingsBlock();
        const text = slice.slice(blk.at, blk.end);
        const without = slice.slice(0, blk.at) + slice.slice(blk.end);
        const build = (() => {
            const hit = [...without.matchAll(/^ {6}- /gm)].map(m => m.index);
            const idx = hit.findIndex((at, i) => /\.\/mach build/.test(without.slice(at, i + 1 < hit.length ? hit[i + 1] : without.length)));
            if (idx < 0) throw new Error('self-test: no build step found');
            return idx + 1 < hit.length ? hit[idx + 1] : without.length;
        })();
        return real.slice(0, h) + without.slice(0, build) + text + without.slice(build) + real.slice(t);
    };
    const plants = [
        ['runner moved to a hosted label', sliceEdit('    runs-on: [self-hosted, powerbrowser-release]', '    runs-on: ubuntu-latest'), 'runner', 'runs-on'],
        ['secrets reference added', sliceEdit('    env:\n      RELEASE_SHA: ${{ inputs.sha }}\n', '    env:\n      RELEASE_SHA: ${{ inputs.sha }}\n      PROBE: ${{ secrets.PROBE }}\n'), 'secrets', 'secrets'],
        ['write permission added', sliceEdit('    permissions:\n      contents: read\n', '    permissions:\n      contents: write\n'), 'permissions', 'not exactly {contents: read}'],
        ['schedule trigger added', real.replace('on:\n  workflow_dispatch:', 'on:\n  schedule:\n    - cron: "0 3 * * *"\n  workflow_dispatch:'), 'schedule', 'schedule'],
        ['checkout unpinned', sliceEdit('actions/checkout@11d5960a326750d5838078e36cf38b85af677262', 'actions/checkout@v4'), 'uses', 'actions/checkout@v4'],
        ['package-windows.sh call removed', sliceEdit('bash powerbrowser/packaging/package-windows.sh', 'true'), 'steps', 'package-windows.sh'],
        ['mach build removed', sliceEdit("MOZCONFIG=/src/generated/packaging/mozconfig-windows-x86_64 ./mach build'", "MOZCONFIG=/src/generated/packaging/mozconfig-windows-x86_64 true'"), 'steps', './mach build'],
        ['get_vs.py reintroduced', sliceEdit("MOZCONFIG=/src/generated/packaging/mozconfig-windows-x86_64 ./mach build'", "python3 /src/upstream/build/vs/get_vs.py /opt/winsysroot; MOZCONFIG=/src/generated/packaging/mozconfig-windows-x86_64 ./mach build'"), 'steps', 'get_vs.py'],
        ['WINSYSROOT exported', sliceEdit("MOZCONFIG=/src/generated/packaging/mozconfig-windows-x86_64 ./mach build'", "export WINSYSROOT=/opt/winsysroot; MOZCONFIG=/src/generated/packaging/mozconfig-windows-x86_64 ./mach build'"), 'steps', 'WINSYSROOT'],
        ['upload globs match nothing', sliceEdit('objdir-windows-x86_64/dist/release-windows/*.installer.exe', 'objdir-windows-x86_64/dist/*.exe'), 'repackage', 'release-windows'],
        ['upload no longer carries the MAR', sliceEdit('            objdir-windows-x86_64/dist/release-windows/*.complete.mar\n', ''), 'repackage', '.complete.mar'],
        ['Node-pin filter reads a property of the url string', sliceEdit('e.url.includes(e.version)', 'e.url.includes(e.url.version.x)'), 'node-pin', 'the real pin'],
        ['Node-pin filter accepts every entry', sliceEdit('process.exit(1);', 'process.exit(0);'), 'node-pin', 'malformed digest'],
        ['key gate if removed from the Firefox fetch', sliceEdit("      - name: Fetch the pinned Firefox source and apply the patch stack\n        if: steps.key_gate.outputs.build == 'true'\n", '      - name: Fetch the pinned Firefox source and apply the patch stack\n'), 'gates', 'Fetch the pinned Firefox'],
        ['sha gate body drifts from build-linux', sliceEdit('echo "validated $SHA"', 'echo "validated $SHA again"'), 'gates', 'sha_gate'],
        ['pipefail removed from the cross-build step', sliceEdit('          set -euo pipefail\n          mkdir -p "$PWD/.mozbuild/release-state" && podman run --rm', '          mkdir -p "$PWD/.mozbuild/release-state" && podman run --rm'), 'gates', 'pipefail'],
        ['identity upload carrying the MAR', sliceEdit('            objdir-windows-x86_64/dist/bin/application.ini\n', '            objdir-windows-x86_64/dist/bin/application.ini\n            objdir-windows-x86_64/dist/release-windows/*.complete.mar\n'), 'retention', 'retention-days 7'],
        ['upload retention raised', sliceEdit('          retention-days: 1\n          overwrite: true', '          retention-days: 5\n          overwrite: true'), 'retention', 'retention-days 5'],
        // harness-other-04: the licence-rulings guard (P68-21), found structurally; the wrapped plants use run-no-skip.sh whatever the step says today
        ['rulings guard removed', rulingsLine('true'), 'rulings', 'no step running scripts/verify-licence-allowlist.mjs --rulings'],
        ['rulings guard moved after the first build step', rulingsMoved(), 'rulings', 'after the first build step'],
        ['rulings guard fails open (continue-on-error)', withRulings(text => text.replace(/^( *if: [^\n]*)$/m, '$1\n        continue-on-error: true')), 'gates', 'continue-on-error'],
        ['rulings guard swallows a failure (|| true)', rulingsLine(`${RULINGS_CMD} || true`), 'gates', '|| true'],
        ['rulings guard gated by another if:', withRulings(text => text.replace(/^( *if: [^\n]*)$/m, '$1 && false')), 'gates', 'has if:'],
        ['rulings guard through run-no-skip.sh with an allow-skip pattern that matches everything', rulingsLine(`bash scripts/run-no-skip.sh --allow-skip '.*' -- ${RULINGS_CMD}`), 'rulings', '--allow-skip'],
        ['rulings guard through run-no-skip.sh followed by || true', rulingsLine(`${WRAPPED} || true`), 'gates', '|| true'],
        ['rulings guard through run-no-skip.sh with continue-on-error', withRulings(text => text.replace(RULINGS_LINE, (_m, indent) => `${indent}${WRAPPED}`).replace(/^( *if: [^\n]*)$/m, '$1\n        continue-on-error: true')), 'gates', 'continue-on-error'],
        ['image build without --no-cache', sliceEdit('--pull=always --no-cache -t pb-gecko-build', '--pull=always -t pb-gecko-build'), 'image', '--no-cache'],
        // rule 11 (G-54a, P68-03): the needs edges are exactly the hosted producers
        ['a third needs edge', sliceEdit(NEEDS, `    needs: [${SIDECAR.name}, ${ORCA.name}, build-linux]\n`), 'independent', EXACT],
        ['needs removed', sliceEdit(NEEDS, ''), 'independent', EXACT],
        ['needs drops windows-orca', sliceEdit(NEEDS, `    needs: ${SIDECAR.name}\n`), 'independent', EXACT],
        // per producer: digest route, download path, container env, and the producer job's trust shape
        ...PRODUCERS.flatMap(p => [
            [`${p.name}: digest read from a repository variable`, sliceEdit(digestRef(p), `\${{ vars.${p.digestEnv} }}`), p.name, p.digestEnv],
            [`${p.name}: another needs value read`, sliceEdit('      RELEASE_SHA: ${{ inputs.sha }}\n', `      RELEASE_SHA: \${{ inputs.sha }}\n      OTHER: \${{ needs.${p.name}.outputs.other }}\n`), p.name, `needs.${p.name}.outputs.other`],
            [`${p.name}: download removed`, sliceEdit(download(p), ''), p.name, 'no download-artifact step'],
            [`${p.name}: downloaded elsewhere`, sliceEdit(`          name: ${p.name}\n          path: ${p.name}\n`, `          name: ${p.name}\n          path: elsewhere\n`), p.name, '"elsewhere"'],
            [`${p.name}: directory not passed into the container`, sliceEdit(`-e ${p.dirEnv}=/src/${p.name} `, ''), p.name, p.dirEnv],
            [`${p.name}: moved to legion`, prodEdit(p.name, '    runs-on: windows-latest\n', '    runs-on: [self-hosted, powerbrowser-release]\n'), p.name, PRODUCER_LABEL],
            [`${p.name}: holds a secret`, prodEdit(p.name, '    env:\n      RELEASE_SHA: ${{ inputs.sha }}\n', '    env:\n      RELEASE_SHA: ${{ inputs.sha }}\n      PROBE: ${{ secrets.PROBE }}\n'), p.name, 'secrets'],
            [`${p.name}: holds an environment`, prodEdit(p.name, '    runs-on: windows-latest\n', '    runs-on: windows-latest\n    environment: release\n'), p.name, 'environment'],
            [`${p.name}: granted contents write`, prodEdit(p.name, '    permissions:\n      contents: read\n', '    permissions:\n      contents: write\n'), p.name, '{contents: read}'],
            [`${p.name}: waits on a legion job`, prodEdit(p.name, '    runs-on: windows-latest\n', '    needs: build-linux\n    runs-on: windows-latest\n'), p.name, 'declares needs'],
            [`${p.name}: digest output removed`, prodEdit(p.name, '      sums_sha256: ${{ steps.sums.outputs.sha256 }}\n', '      other: ${{ steps.sums.outputs.sha256 }}\n'), p.name, 'sums_sha256'],
            [`${p.name}: skips its own admission check`, prodEdit(p.name, 'bash powerbrowser/packaging/check-win-sidecar.sh check', 'echo skipped'), p.name, 'check and purge'],
            [`${p.name}: writes no BUILD_ROOT`, prodEdit(p.name, `printf '%s\\n' "$GITHUB_WORKSPACE" > "$OUT/BUILD_ROOT"`, 'echo none'), p.name, 'BUILD_ROOT'],
            [`${p.name}: upload retention raised`, prodEdit(p.name, '          retention-days: 1\n', '          retention-days: 5\n'), p.name, 'retention-days 1'],
            [`${p.name}: action unpinned`, prodEdit(p.name, 'actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1', 'actions/setup-node@v7'), p.name, 'actions/setup-node@v7'],
            [`${p.name}: job removed`, removeJob(p.name), p.name, 'is absent'],
        ]),
    ];

    // Plants on package-windows.sh's text: each required `mach repackage` argument, removed in turn.
    const script = readText(REPO_ROOT, PACKAGE_REL);
    const scriptPlants = [];
    if (script === null) {
        console.error(`${NAME}: --self-test FAIL -- ${PACKAGE_REL} could not be read. Next step: restore it.`);
        return 1;
    }
    for (const [label, from, value] of [
        ['installer without --sfx-stub', '    --sfx-stub other-licenses/7zstub/firefox/7zSD.Win32.sfx \\\n', '--sfx-stub'],
        ['installer without --setupexe', ' --setupexe "$SETUPEXE" \\\n', '--setupexe'],
        ['installer without --tag', '    --tag "$ROOT/generated/installer/release/app.tag"', '--tag'],
        ['mar without --arch', ' --arch x86_64', '--arch'],
        ['mar without --mar', ' --mar "$MARBIN"', '--mar'],
    ]) {
        if (!script.includes(from)) throw new Error(`self-test anchor for '${label}' is absent from ${PACKAGE_REL}`);
        scriptPlants.push([label, { script: script.replace(from, from.endsWith('\\\n') ? '\\\n' : ''), text: real }, 'repackage', value]);
    }
    const outDirBroken = script.replace('OUT="$OBJ/dist/release-windows"', 'OUT="$OBJ/dist/elsewhere"');
    scriptPlants.push(['package-windows.sh writes somewhere else than the upload reads', { script: outDirBroken, text: real }, 'repackage', 'elsewhere']);
    // The producer-to-script join: a copy from a producer's directory before its admission, or an admission
    // against another producer's digest, is red naming the producer.
    for (const [label, from, to, p, value] of [
        ['package-windows.sh copies from the Orca directory before admitting it', 'ORCA_DIR="${PB_WIN_ORCA_DIR:-}"\n', 'ORCA_DIR="${PB_WIN_ORCA_DIR:-}"\ncp -a "$ORCA_DIR/package.json" "$ROOT/early-package.json"\n', ORCA, 'before its check-win-sidecar.sh check against PB_WIN_ORCA_SUMS_SHA256'],
        ['package-windows.sh copies from the sidecar directory before admitting it', 'SIDECAR_DIR="${PB_WIN_SIDECAR_DIR:-}"\n', 'SIDECAR_DIR="${PB_WIN_SIDECAR_DIR:-}"\ncp -a "$SIDECAR_DIR/." "$ROOT/early-theia/"\n', SIDECAR, 'before its check-win-sidecar.sh check against PB_WIN_SIDECAR_SUMS_SHA256'],
        ['package-windows.sh admits the Orca directory against the sidecar digest', 'check "$ORCA_DIR" "${PB_WIN_ORCA_SUMS_SHA256:-}"', 'check "$ORCA_DIR" "${PB_WIN_SIDECAR_SUMS_SHA256:-}"', ORCA, '(no such check)'],
    ]) {
        if (!script.includes(from)) throw new Error(`self-test anchor for '${label}' is absent from ${PACKAGE_REL}`);
        scriptPlants.push([label, { script: script.split(from).join(to), text: real }, p.name, value]);
    }
    const noOrcaCopy = script.split('\n').filter(l => !/^\s*cp\b.*"\$ORCA_DIR[/"]/.test(l)).join('\n');
    scriptPlants.push(['package-windows.sh never copies from the Orca directory (vacuous admission order)', { script: noOrcaCopy, text: real }, ORCA.name, 'never copies']);

    let failed = 0;
    // Control: the guard through run-no-skip.sh, written as the plants write it, is green (the wrapper is accepted).
    {
        const { failures } = runChecks(REPO_ROOT, { text: rulingsLine(WRAPPED, true) });
        if (failures.length === 0) console.log('  ok  control: the rulings guard through run-no-skip.sh is green');
        else { console.error(`${NAME}: --self-test FAIL -- the wrapped rulings guard went red: ${failures.map(fmt).join(' | ')}`); failed += 1; }
    }
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
    for (const [name, o, rule, value] of scriptPlants) {
        const { failures } = runChecks(REPO_ROOT, o);
        const hit = failures.some(f => f.rule === rule && (f.msg.includes(value) || f.step.includes(value)));
        if (hit) console.log(`  ok  ${name} -> red, naming ${PACKAGE_REL} [${rule}] and '${value}'`);
        else { console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red naming [${rule}] and '${value}'; got: ${failures.map(fmt).join(' | ') || '(no failures at all)'}`); failed += 1; }
    }
    if (failed > 0) return 1;
    console.log(`${NAME}: --self-test PASS -- the unmodified ${JOB} job is green and ${plants.length + scriptPlants.length} planted faults each went red naming the file, the job and the cause. It writes only mkdtemp directories, removed at once.`);
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
    console.log(`${NAME}: PASS -- ${RELEASE_REL} ${JOB} runs on [${LEGION_LABELS.join(', ')}] with exactly contents: read and no secret or environment; no schedule anywhere; every uses: is a SHA-pinned GitHub-owned action; the ref and event refusal, full-SHA step, sha_gate and key_gate (identical to ${REF_JOB}) precede the build and every later step is gated on the key; no step fails open; the job builds, then runs package-windows.sh, which passes every required mach repackage argument derived from the pinned tree; the upload paths match its outputs; the Node-pin step's own text was executed against the real pin and three bad fixtures; the needs edges are exactly the hosted producers ${PRODUCERS.map(p => p.name).join(' and ')}, each digest output is the only value read from its producer and reaches the container beside the producer's directory, and package-windows.sh admits each producer's directory against that digest before its first copy from it; uploads keep retention-days 1 (${steps} step(s) checked).`);
    return 0;
}

process.exit(main());
