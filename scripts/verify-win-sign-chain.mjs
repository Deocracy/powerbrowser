#!/usr/bin/env node
// scripts/verify-win-sign-chain.mjs
//
// The win-sign-chain row (Phase 54, SEC-12, DIST-10). Authenticode for Windows runs in one hosted job,
// sign-windows in .github/workflows/release.yml, and its order is load-bearing: the inner program files are
// signed before the installer wraps them, and the update file is produced after the installer is signed, as
// upstream/taskcluster/kinds/repackage/kind.yml chains build-signing, repackage, repackage-signing, mar-signing.
//
// Each step of sign-windows is CLASSIFIED from its own text at check time (never by a typed list of step
// ids), and the classified sequence is compared with the chain as ordered equality, each stage exactly once:
//
//   inner-sign           jsign over the derived list of .exe and .dll files of the staged tree
//   repackage-installer  mach repackage installer
//   setup-sign           jsign over the repackaged .installer.exe
//   repackage-mar        mach repackage mar
//   signmar-sign         "$SIGNMAR" ... -s
//   signmar-verify       "$SIGNMAR" ... -v, against the tracked DER
//
// Further rules, each red naming the step or key:
//   oidc        exactly one Azure/login step, with only client-id, tenant-id and subscription-id inputs, each a
//               vars. reference; it runs after the SHA gate, the stale-approval guard and the configuration gate,
//               and before the first signature; the configuration gate names every vars.AZURE_* the job reads
//               and exits non-zero on a missing one (fail closed, nothing minted first).
//   skip        R14: with AZURE_CLIENT_ID empty the configuration gate writes signing=false to GITHUB_OUTPUT and
//               exits 0 before its fail-closed loop (a reported skip, not a failure); signing=true is written after
//               the loop; every later step carries if: steps.azure_config.outputs.signing == 'true', except an
//               always() step that only runs rm -rf (the scratch cleanup).
//   secret      no secrets. reference whose name looks like an Azure credential anywhere in the file, and in
//               sign-windows no secrets. reference outside the MAR-signing step.
//   permissions sign-windows holds id-token write and contents read, never contents write; the workflow level
//               grants no id-token.
//   trust       sign-windows builds signmar from the pinned source and exports no LD_LIBRARY_PATH; the jsign
//               jar is checked against a 64-hex sha256 before use.
//   inputs      the artifact is matched against tree-derived names: the admission step derives the zip base name
//               and top directory with scripts/win-sign-list.mjs --expected-base, compares the zip with it, and
//               refuses any entry name outside ^[A-Za-z0-9._/-]+$ and any other top directory; from the
//               artifact download on, a value written to GITHUB_OUTPUT is a tree-derived $WANT_* or a path
//               under $RUNNER_TEMP or $PKG, never an artifact-derived name.
//   sign-list   the inner files come from scripts/win-sign-list.mjs --list (the pinned package manifest compared
//               with the staged tree) in a step before the Azure sign-in; no find over the build output.
//   attest      sign-windows attests nothing and holds no attestations permission: its bytes were built on
//               legion, and a hosted provenance attestation would misname their builder.
//   independence no job on the Linux publish path waits on any Windows job, directly or transitively (G-54b, owner
//               ruling R2). Windows jobs: every job that uploads or downloads an artifact whose name contains
//               'windows'. Linux path: every other job that moves a 'linux' artifact, plus sign-publish and every
//               job after it. A Windows job may itself need sign-publish (it joins after the Linux publish).
//   schedule    no schedule event in the file.
//   legion      a job on the release runner label carries no environment and no secrets reference.
//   status      docs/RELEASING.md's "Azure Artifact Signing identity validation:" line decides the signing
//               posture (scripts/verify-win-download-copy.mjs reads the same line); the Windows line of the
//               download page source and of the published page must say unsigned while it is pending, and must
//               not once it holds a date.
//
// The published page read (one GET) is why the row is full tier; --self-test plants every fault in memory over
// the real workflow, the real docs and the real page, and writes nothing.
//
// Usage:
//   node scripts/verify-win-sign-chain.mjs
//   node scripts/verify-win-sign-chain.mjs --self-test

import { readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveConfig } from './generate.mjs';
import { loadYaml, stepsOf } from './lib/release-workflow.mjs';
import { PAGE_REL, RELEASING_REL, liveUrlOf, signingPosture } from './verify-win-download-copy.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'win-sign-chain';
const SELF_REL = 'scripts/verify-win-sign-chain.mjs';
const RELEASE_REL = '.github/workflows/release.yml';
const JOB = 'sign-windows';
const LINUX_PUBLISH = 'sign-publish';
const DER_REL = 'powerbrowser/packaging/mar/mar-primary.der';
const LEGION_LABELS = ['legion', 'powerbrowser-release'];
const CHAIN = ['inner-sign', 'repackage-installer', 'setup-sign', 'repackage-mar', 'signmar-sign', 'signmar-verify'];
const GATES = ['sha_gate', 'stale_guard', 'azure_config', 'inputs', 'sign_list'];
const LOGIN = /^azure\/login@/i;
const LOGIN_INPUTS = ['client-id', 'tenant-id', 'subscription-id'];

const DIRECT_RUN = (() => {
    try {
        return process.argv[1] !== undefined && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
    } catch {
        return false;
    }
})();
const args = DIRECT_RUN ? process.argv.slice(2) : [];
for (const a of args) {
    if (a !== '--self-test') {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
        console.error(`  Next step: run: node ${SELF_REL}, or add --self-test to prove the gate discriminates.`);
        process.exit(2);
    }
}

/** The chain stage a step performs, read from its own run text, or null. */
export function stageOf(step) {
    const run = String(step.run ?? '');
    if (/\bjsign\b|\$JSIGN\b/.test(run) && /\.installer\.exe/.test(run)) return 'setup-sign';
    if (/\bjsign\b|\$JSIGN\b/.test(run) && /\.dll\b|sign-list\.txt/.test(run)) return 'inner-sign';
    if (/mach repackage installer\b/.test(run)) return 'repackage-installer';
    if (/mach repackage mar\b/.test(run)) return 'repackage-mar';
    if (/"\$SIGNMAR"[^\n]*\s-s\s/.test(run)) return 'signmar-sign';
    if (/"\$SIGNMAR"[^\n]*\s-v\s/.test(run)) return 'signmar-verify';
    return null;
}

const labelsOf = job => {
    const r = job?.['runs-on'];
    if (Array.isArray(r)) return r.map(String);
    if (r !== null && typeof r === 'object') return [].concat(r.labels ?? []).map(String);
    return r === undefined ? [] : [String(r)];
};
const stepName = s => s.id ?? s.name ?? '(unnamed step)';
const SKIP_IF = "steps.azure_config.outputs.signing == 'true'";
const windowsLine = page => /<li><strong>Windows:<\/strong>([\s\S]*?)<\/li>/.exec(page ?? '')?.[1]?.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() ?? null;

/**
 * inputs: { wf (parsed release.yml or null), releasing, page, live, liveUrl }. Returns { failures, evidence }
 * where evidence is the ordered list of classified steps.
 */
export function runChecks({ wf, releasing, page, live, liveUrl = 'the published download page' }) {
    const failures = [];
    const fail = (where, rule, msg) => failures.push({ where, rule, msg });
    const evidence = [];
    if (wf === null || typeof wf !== 'object') {
        fail(RELEASE_REL, 'vacuity', `is unreadable or does not parse, so the Windows signing chain is unproven. Next step: restore the file.`);
        return { failures, evidence };
    }
    const text = JSON.stringify(wf);

    // schedule
    const on = wf.on ?? wf.true;
    const events = typeof on === 'string' ? [on] : Array.isArray(on) ? on.map(String) : Object.keys(on ?? {});
    if (events.includes('schedule')) fail(RELEASE_REL, 'schedule', `carries a schedule: key, so a release could start without a dispatch. Next step: remove it; the release runs only on workflow_dispatch.`);

    // legion jobs
    for (const [id, job] of Object.entries(wf.jobs ?? {})) {
        if (!labelsOf(job).some(l => LEGION_LABELS.includes(l))) continue;
        if (Object.hasOwn(job, 'environment')) fail(id, 'legion', `runs on legion and carries environment ${JSON.stringify(job.environment)}, so an environment secret could reach the build host. Next step: remove the environment key.`);
        if (/\bsecrets\b/.test(JSON.stringify(job))) fail(id, 'legion', `runs on legion and reaches a secrets reference. Next step: move the secret to a hosted job.`);
    }

    // Azure credentials anywhere in the file
    for (const m of text.matchAll(/secrets\.([A-Za-z0-9_]+)/g)) {
        if (/AZURE|ARM_|\bAZ_|CLIENT_SECRET/i.test(m[1])) fail(RELEASE_REL, 'secret', `names the stored secret ${m[1]}; Azure is reached over OIDC only and no Azure secret may exist. Next step: remove it and sign in with Azure/login over OIDC.`);
    }
    if (/id-token/.test(JSON.stringify(wf.permissions ?? {}))) fail(RELEASE_REL, 'permissions', `grants id-token at the workflow level; only ${JOB} may mint an OIDC token. Next step: move it to the job.`);

    // independence: the Linux publish path never waits on Windows signing (owner ruling 2026-11-01: Linux ships alone)
    const jobs = wf.jobs ?? {};
    const needsOf = id => [jobs[id]?.needs ?? []].flat().map(String);
    const ancestors = (id, seen = new Set()) => {
        for (const n of needsOf(id)) if (!seen.has(n)) { seen.add(n); ancestors(n, seen); }
        return seen;
    };
    // G-54b (owner ruling R2): every Windows job, not only the sign job. Both sets are derived from the artifact
    // names each job uploads or downloads, so a new Windows job is covered without editing this file.
    const artifactsOf = id => stepsOf(jobs[id]).filter(s => /^actions\/(upload|download)-artifact@/.test(String(s.uses ?? ''))).map(s => String(s.with?.name ?? ''));
    const windowsJobs = new Set(Object.keys(jobs).filter(id => artifactsOf(id).some(n => /windows/.test(n))));
    if (!Object.hasOwn(jobs, LINUX_PUBLISH)) {
        fail(LINUX_PUBLISH, 'independence', `is absent, so the Linux publish path cannot be proven independent of ${JOB}. Next step: restore the ${LINUX_PUBLISH} job.`);
    } else if (!windowsJobs.has(JOB)) {
        fail(JOB, 'independence', `is not found among the jobs that move a Windows artifact (${[...windowsJobs].join(', ') || 'none'}), so the Windows job set is not derivable. Next step: restore its release-windows download.`);
    } else {
        // The Linux path: jobs that move a Linux artifact, plus sign-publish and every job after it, minus Windows jobs.
        const linuxJobs = Object.keys(jobs).filter(id => !windowsJobs.has(id)
            && (id === LINUX_PUBLISH || ancestors(id).has(LINUX_PUBLISH) || artifactsOf(id).some(n => /linux/.test(n))));
        for (const id of linuxJobs) {
            const win = [...ancestors(id)].filter(a => windowsJobs.has(a)).sort();
            if (win.length > 0) fail(id, 'independence', `is on the Linux publish path and waits on the Windows job(s) ${win.join(', ')}, so a Windows build or signing failure would stop the Linux release. Next step: remove them from its needs; Windows joins the Release on its own path.`);
        }
    }

    const job = wf.jobs?.[JOB];
    const steps = stepsOf(job);
    if (job === undefined || steps.length === 0) {
        fail(JOB, 'vacuity', `is absent or has no steps, so no Windows file is signed. Next step: restore the ${JOB} job.`);
        return { failures, evidence };
    }
    const perms = job.permissions ?? {};
    if (perms['id-token'] !== 'write') fail(JOB, 'permissions', `does not hold id-token: write, so the Azure OIDC sign-in cannot run. Next step: grant it on this job only.`);
    if (perms.contents !== 'read') fail(JOB, 'permissions', `holds contents ${JSON.stringify(perms.contents ?? null)}, not read; the sign job publishes nothing. Next step: set contents: read.`);

    // the chain, as ordered equality
    const staged = steps.map((s, i) => ({ i, stage: stageOf(s), name: stepName(s) })).filter(x => x.stage !== null);
    for (const x of staged) evidence.push(`${x.stage} (${x.name})`);
    for (const stage of CHAIN) {
        const n = staged.filter(x => x.stage === stage).length;
        if (n !== 1) fail(JOB, 'order', `has ${n} ${stage} step(s), not exactly one. Next step: keep the chain ${CHAIN.join(', ')}.`);
    }
    const seq = staged.map(x => x.stage);
    if (seq.join(',') !== CHAIN.join(',') && failures.every(f => f.rule !== 'order')) {
        const at = seq.findIndex((s, k) => s !== CHAIN[k]);
        fail(JOB, 'order', `runs ${staged[at].stage} (${staged[at].name}) where the chain expects ${CHAIN[at]}; the order must be ${CHAIN.join(', ')}. Next step: sign the inner files before the installer is built, and produce the update file after the installer is signed.`);
    }

    // OIDC: one login, plain ids, after the gates, before the first signature
    const logins = steps.map((s, i) => ({ s, i })).filter(x => LOGIN.test(String(x.s.uses ?? '')));
    if (logins.length !== 1) {
        fail(JOB, 'oidc', `has ${logins.length} Azure/login step(s), not exactly one. Next step: sign in once, over OIDC, directly before the first signature.`);
    } else {
        const { s: login, i: at } = logins[0];
        for (const [k, v] of Object.entries(login.with ?? {})) {
            if (!LOGIN_INPUTS.includes(k)) fail(stepName(login), 'secret', `passes the input ${k} to Azure/login; only ${LOGIN_INPUTS.join(', ')} may be given (OIDC, no stored credential). Next step: remove ${k}.`);
            else if (!/^\$\{\{\s*vars\.[A-Z0-9_]+\s*\}\}$/.test(String(v))) fail(stepName(login), 'secret', `passes ${k} as ${JSON.stringify(v)}, not a vars. reference. Next step: keep the id in a release-environment variable.`);
        }
        for (const g of GATES) {
            const gi = steps.findIndex(s => s.id === g);
            if (gi < 0) fail(JOB, 'oidc', `has no ${g} step, so the Azure sign-in is not behind it. Next step: restore the gate.`);
            else if (gi > at) fail(JOB, 'oidc', `runs the Azure sign-in before ${g}; nothing may be minted before every gate passes. Next step: move the sign-in after it.`);
        }
        const first = staged[0];
        if (first !== undefined && first.i < at) fail(JOB, 'oidc', `runs ${first.stage} before the Azure sign-in. Next step: sign in first.`);
    }
    const cfg = steps.find(s => s.id === 'azure_config');
    if (cfg !== undefined) {
        const used = new Set([...JSON.stringify(steps.filter(s => s !== cfg)).matchAll(/vars\.(AZURE_[A-Z0-9_]+)/g)].map(m => m[1]));
        const checked = new Set(Object.keys(cfg.env ?? {}).filter(k => String(cfg.env[k]).includes(`vars.${k}`)));
        for (const v of used) if (!checked.has(v)) fail('azure_config', 'oidc', `does not check ${v}, which a later step reads, so a missing value would fail open or late. Next step: add it to the configuration gate.`);
        if (!/exit 1/.test(String(cfg.run ?? '')) || cfg['continue-on-error']) fail('azure_config', 'oidc', `does not fail closed on a missing value. Next step: exit 1 naming the missing variable.`);

        // skip (R14): no Azure account is a reported skip, not a failure; a partial account still fails closed.
        const run = String(cfg.run ?? '');
        const skipAt = run.search(/if \[ -z "\$AZURE_CLIENT_ID" \]; then\n(?:(?!\n\s*fi\b)[\s\S])*?signing=false"? >> "\$GITHUB_OUTPUT"(?:(?!\n\s*fi\b)[\s\S])*?\bexit 0\s*\n\s*fi\b/);
        const loopAt = run.search(/\bfor V in AZURE_CLIENT_ID\b/);
        if (skipAt < 0 || loopAt < 0 || skipAt > loopAt) fail('azure_config', 'skip', `does not report Windows signing as skipped (signing=false to GITHUB_OUTPUT, then exit 0) when AZURE_CLIENT_ID is empty, before the fail-closed loop, so an absent account fails every release. Next step: restore the skip branch.`);
        if (!(loopAt >= 0 && run.lastIndexOf('signing=true') > loopAt)) fail('azure_config', 'skip', `does not write signing=true after the fail-closed loop, so a configured account would sign nothing, or an unchecked one would sign. Next step: write it as the last line of the gate.`);
        for (const s of steps.slice(steps.indexOf(cfg) + 1)) {
            const cleanup = s.if === 'always()' && s.uses === undefined && /^\s*rm -rf [^\n;&|]*\s*$/.test(String(s.run ?? ''));
            if (s.if !== SKIP_IF && !cleanup) fail(stepName(s), 'skip', `carries if: ${JSON.stringify(s.if ?? null)}, not ${SKIP_IF}, so it runs when Windows signing was skipped. Next step: gate it on the configuration gate's output.`);
        }
    }

    // secrets in the sign job only where the MAR is signed
    for (const s of steps) {
        if (s.id !== 'win_sign_mar' && /secrets\./.test(JSON.stringify(s))) fail(stepName(s), 'secret', `reaches a secrets. reference; in ${JOB} only the MAR-signing step may. Next step: remove it.`);
    }
    if (/secrets\./.test(JSON.stringify(job.env ?? {}))) fail(JOB, 'secret', `sets a secrets. reference at job level. Next step: remove it.`);

    // trust: pinned signmar, no runner-built code, pinned jsign
    const jobText = JSON.stringify(job);
    if (/LD_LIBRARY_PATH/.test(jobText)) fail(JOB, 'trust', `references LD_LIBRARY_PATH, which is how a runner-built library reaches this job. Next step: use the signmar built from the pinned source.`);
    if (!steps.some(s => /scripts\/build-signmar\.sh/.test(String(s.run ?? '')))) fail(JOB, 'trust', `does not build signmar from the pinned source (scripts/build-signmar.sh). Next step: restore that step.`);
    const verify = steps.find(s => stageOf(s) === 'signmar-verify');
    if (verify !== undefined && !String(verify.run ?? '').includes(DER_REL)) fail(stepName(verify), 'trust', `does not verify the signed MAR against the tracked ${DER_REL}. Next step: verify against that file.`);
    const jsignFetch = steps.find(s => /jsign[^\n]*\.jar/.test(String(s.run ?? '')) && /\bcurl\b|gh release download/.test(String(s.run ?? '')));
    if (jsignFetch === undefined || !/sha256sum -c/.test(String(jsignFetch.run ?? '')) || !/^[0-9a-f]{64}$/.test(String(jsignFetch.env?.JSIGN_SHA256 ?? ''))) {
        fail(jsignFetch === undefined ? JOB : stepName(jsignFetch), 'trust', `does not check the jsign jar against a pinned 64-hex sha256 before use. Next step: pin JSIGN_SHA256 and check it with sha256sum -c.`);
    }

    // inputs: tree-derived names only, validated entries, no artifact name in GITHUB_OUTPUT
    const adm = steps.find(s => s.id === 'inputs');
    const admRun = String(adm?.run ?? '');
    if (adm === undefined || !/win-sign-list\.mjs --expected-base/.test(admRun) || !admRun.includes('"windows/$WANT_BASE.zip"')) {
        fail('inputs', 'inputs', `does not compare the artifact's zip with the name derived from this tree (win-sign-list.mjs --expected-base), so legion would choose the package name. Next step: derive it and require equality.`);
    }
    if (adm !== undefined && (!admRun.includes("r'^[A-Za-z0-9._/-]+$'") || !admRun.includes("r'^[A-Za-z0-9._-]+$'") || !admRun.includes('want_top'))) {
        fail('inputs', 'inputs', `does not refuse zip entry names outside ^[A-Za-z0-9._/-]+$ or a top directory other than the derived one. Next step: restore both checks.`);
    }
    const dl = steps.findIndex(s => /^actions\/download-artifact@/.test(String(s.uses ?? '')));
    for (const s of steps.slice(Math.max(dl, 0))) {
        const run = String(s.run ?? '');
        if (!run.includes('GITHUB_OUTPUT')) continue;
        for (const m of run.matchAll(/echo "([a-z_]+)=([^"]*)"/g)) {
            if (!/^(\$WANT_[A-Z_]+|\$PKG|\$RUNNER_TEMP\/[A-Za-z0-9._/-]+|\$DERIVED)$/.test(m[2])) {
                fail(stepName(s), 'inputs', `writes ${m[1]}=${m[2]} to GITHUB_OUTPUT, a value that is not derived from the tree; an artifact-chosen name could inject into later steps. Next step: write only the tree-derived names.`);
            }
        }
    }

    // sign-list: derived from the manifest, before the sign-in; never a find over legion's output
    const inner = steps.find(s => stageOf(s) === 'inner-sign');
    const listAt = steps.findIndex(s => s.id === 'sign_list');
    if (listAt < 0 || !/win-sign-list\.mjs --list/.test(String(steps[listAt].run ?? ''))) fail(JOB, 'sign-list', `has no sign_list step deriving the files to sign from the package manifest (win-sign-list.mjs --list). Next step: restore it before the Azure sign-in.`);
    if (inner !== undefined && (/\bfind\b/.test(String(inner.run ?? '')) || !String(inner.run ?? '').includes('sign-list.txt'))) {
        fail(stepName(inner), 'sign-list', `chooses the files to sign itself (a find over the build output) instead of reading the derived sign-list.txt, so legion decides what is signed. Next step: sign only the derived list.`);
    }

    // attest: the hosted job cannot claim to have built legion's bytes
    for (const s of steps) if (/^actions\/attest/.test(String(s.uses ?? ''))) fail(stepName(s), 'attest', `attests the signed Windows files as built by this hosted job, but they were built on legion. Next step: remove the attestation.`);
    if (perms.attestations !== undefined) fail(JOB, 'attest', `holds attestations ${JSON.stringify(perms.attestations)}; the job attests nothing. Next step: remove the permission.`);

    // status: the posture decides what the Windows line may say
    const posture = signingPosture(releasing);
    if (posture === null) {
        fail(RELEASING_REL, 'status', `has no "- Azure Artifact Signing identity validation:" line, so the signing posture is unknown. Next step: restore the line.`);
    } else {
        for (const [where, pageText] of [[PAGE_REL, page], [liveUrl, live]]) {
            if (pageText === null) {
                fail(where, 'vacuity', `is unreadable, so its Windows signing status is unproven. Next step: restore it${where === liveUrl ? ' (publish the site, or check the network)' : ''}.`);
                continue;
            }
            const line = windowsLine(pageText);
            if (line === null) fail(where, 'status', `carries no "Windows:" signing-status line. Next step: restore the Signing status list.`);
            else if (posture.state === 'signed' && /\bunsigned\b|not yet code-signed/i.test(line)) fail(where, 'status', `still states the Windows build is unsigned ("${line}") although ${RELEASING_REL} records the signing validation on ${posture.date}. Next step: update the Windows status line to the signed status.`);
            else if (posture.state === 'unsigned' && !/\bunsigned\b/i.test(line)) fail(where, 'status', `does not state the Windows build is unsigned ("${line}") while ${RELEASING_REL} records the signing validation as pending. Next step: state that it is unsigned until the validation is recorded.`);
        }
    }
    return { failures, evidence };
}

const readRel = rel => {
    try {
        return readFileSync(join(REPO_ROOT, rel), 'utf8');
    } catch {
        return null;
    }
};
const fmt = f => `[${f.rule}] ${f.where}: ${f.msg}`;

function parse(yaml, text) {
    try {
        return yaml.load(text);
    } catch {
        return null;
    }
}

// --- self-test ---------------------------------------------------------------------------------------

function selfTest(yaml) {
    const wfText = readRel(RELEASE_REL);
    const releasing = readRel(RELEASING_REL);
    const page = readRel(PAGE_REL);
    const wf = wfText === null ? null : parse(yaml, wfText);
    if (wf === null || releasing === null || page === null) {
        console.error(`${NAME}: --self-test FAIL -- the real workflow, docs or page is unreadable, so no fixture can be built`);
        return 1;
    }
    const liveUrl = 'https://download-page.invalid/download.html';
    const base = { wf, releasing, page, live: page, liveUrl };
    const control = runChecks(base);
    if (control.failures.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- the green control is already red: ${control.failures.map(fmt).join(' | ')}`);
        return 1;
    }
    if (JSON.stringify(runChecks(base)) !== JSON.stringify(control)) {
        console.error(`${NAME}: --self-test FAIL -- two runs over the same tree gave different verdicts or evidence`);
        return 1;
    }
    console.log(`  ok  control: the real workflow, docs and page -> green, evidence ${control.evidence.length} step(s), identical on re-run`);

    const swap = (t, from, to) => {
        if (!t.includes(from)) throw new Error(`self-test fixture: ${JSON.stringify(from.slice(0, 60))} is not in the text, so the plant would test nothing`);
        return t.split(from).join(to);
    };
    const signedReleasing = swap(releasing, 'identity validation: pending.', 'identity validation: 2027-01-15.');
    const signedPage = swap(page, /<li><strong>Windows:<\/strong>[^<]*<\/li>/.exec(page)[0], '<li><strong>Windows:</strong> the installer and every program file in it are signed with an Authenticode certificate.</li>');
    const signed = runChecks({ ...base, releasing: signedReleasing, page: signedPage, live: signedPage });
    if (signed.failures.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- the signed control is red: ${signed.failures.map(fmt).join(' | ')}`);
        return 1;
    }
    console.log('  ok  signed control: validation dated and the Windows line updated -> green');

    const edit = fn => {
        const c = structuredClone(wf);
        fn(c, stepsOf(c.jobs[JOB]));
        return { wf: c };
    };
    // A Windows publish job after the Linux publish: the shape the independence rule must keep admitting.
    const winPublish = () => ({ needs: ['build-windows', LINUX_PUBLISH], 'runs-on': 'ubuntu-latest', steps: [{ uses: 'actions/download-artifact@' + '0'.repeat(40), with: { name: 'release-windows', path: 'w' } }] });
    const later = runChecks({ ...base, ...edit(c => { c.jobs['publish-windows'] = winPublish(); }) });
    if (later.failures.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- a Windows publish job that needs ${LINUX_PUBLISH} and build-windows was refused: ${later.failures.map(fmt).join(' | ')}`);
        return 1;
    }
    console.log(`  ok  Windows-publish control: a job needing build-windows and ${LINUX_PUBLISH} that no Linux job needs -> green`);
    const idx = (steps, stage) => steps.findIndex(s => stageOf(s) === stage);
    const move = (steps, from, to) => steps.splice(to, 0, ...steps.splice(from, 1));
    const plants = [
        ['out-of-order: installer signed before the inner files', edit((c, st) => { const a = idx(st, 'inner-sign'); const b = idx(st, 'setup-sign'); [st[a], st[b]] = [st[b], st[a]]; c.jobs[JOB].steps = st; }), JOB, 'order', 'setup-sign'],
        ['out-of-order: update file produced before the installer is signed', edit((c, st) => { move(st, idx(st, 'repackage-mar'), idx(st, 'setup-sign')); c.jobs[JOB].steps = st; }), JOB, 'order', 'repackage-mar'],
        ['a chain stage removed (no MAR signature verify)', edit((c, st) => { st.splice(idx(st, 'signmar-verify'), 1); c.jobs[JOB].steps = st; }), JOB, 'order', 'signmar-verify'],
        ['stored Azure secret in a sign step', edit((c, st) => { st[idx(st, 'inner-sign')].env.AZURE_CLIENT_SECRET = '${{ secrets.AZURE_CLIENT_SECRET }}'; }), RELEASE_REL, 'secret', 'AZURE_CLIENT_SECRET'],
        ['stored credential input on Azure/login', edit((c, st) => { st.find(s => LOGIN.test(String(s.uses ?? ''))).with.creds = '${{ vars.AZURE_CREDENTIALS }}'; }), 'azure_login', 'secret', 'creds'],
        ['Azure sign-in before the configuration gate', edit((c, st) => { move(st, st.findIndex(s => s.id === 'azure_login'), st.findIndex(s => s.id === 'azure_config')); c.jobs[JOB].steps = st; }), JOB, 'oidc', 'azure_config'],
        ['configuration gate missing a variable the signer reads', edit((c, st) => { delete st.find(s => s.id === 'azure_config').env.AZURE_SIGNING_PROFILE; }), 'azure_config', 'oidc', 'AZURE_SIGNING_PROFILE'],
        ['Azure sign-in not gated on the skip', edit((c, st) => { delete st.find(s => s.id === 'azure_login').if; }), 'azure_login', 'skip', 'not steps.azure_config.outputs.signing'],
        ['skip branch removed', edit((c, st) => { const g = st.find(s => s.id === 'azure_config'); g.run = g.run.replace(/if \[ -z "\$AZURE_CLIENT_ID" \]; then\n[\s\S]*?\n\s*fi\n/, ''); }), 'azure_config', 'skip', 'does not report Windows signing as skipped'],
        ['skip branch fails instead', edit((c, st) => { const g = st.find(s => s.id === 'azure_config'); g.run = g.run.replace(/exit 0\n/, 'exit 1\n'); }), 'azure_config', 'skip', 'does not report Windows signing as skipped'],
        ['signing=true written before the fail-closed loop', edit((c, st) => { const g = st.find(s => s.id === 'azure_config'); g.run = g.run.replace(/\n\s*echo "signing=true" >> "\$GITHUB_OUTPUT"\s*$/, '\n').replace('for V in AZURE_CLIENT_ID', 'echo "signing=true" >> "$GITHUB_OUTPUT"\nfor V in AZURE_CLIENT_ID'); }), 'azure_config', 'skip', 'signing=true after the fail-closed loop'],
        ['cleanup step widened beyond rm -rf', edit((c, st) => { const g = st.find(s => s.if === 'always()'); g.run = `${g.run.trim()} && ls`; }), 'Remove the signing scratch databases', 'skip', 'runs when Windows signing was skipped'],
        ['schedule key', edit(c => { c.on.schedule = [{ cron: '0 3 * * 1' }]; }), RELEASE_REL, 'schedule', 'schedule'],
        ['legion job carrying secrets', edit(c => { c.jobs['build-windows'].env.PROBE = '${{ secrets.PROBE }}'; }), 'build-windows', 'legion', 'secrets'],
        ['legion job carrying an environment', edit(c => { c.jobs['build-windows'].environment = 'release'; }), 'build-windows', 'legion', 'environment'],
        ['contents write on the sign job', edit(c => { c.jobs[JOB].permissions.contents = 'write'; }), JOB, 'permissions', 'contents'],
        ['LD_LIBRARY_PATH in the sign job', edit((c, st) => { st[idx(st, 'signmar-sign')].run = String(st[idx(st, 'signmar-sign')].run).replace('"$SIGNMAR" -d', 'LD_LIBRARY_PATH=windows "$SIGNMAR" -d'); }), JOB, 'trust', 'LD_LIBRARY_PATH'],
        ['MAR verified against an untracked DER', edit((c, st) => { const v = st[idx(st, 'signmar-verify')]; v.run = String(v.run).split(DER_REL).join('scratch/other.der'); }), 'win_verify_mar', 'trust', DER_REL],
        ['artifact-derived zip name written to GITHUB_OUTPUT', edit((c, st) => { const a = st.find(s => s.id === 'inputs'); a.run = String(a.run).replace('echo "base=$WANT_BASE"', 'echo "base=$(basename "${ZIPS[0]}" .zip)"'); }), 'inputs', 'inputs', 'base='],
        ['zip not compared with the tree-derived name', edit((c, st) => { const a = st.find(s => s.id === 'inputs'); a.run = String(a.run).split('"windows/$WANT_BASE.zip"').join('"${ZIPS[0]}"'); }), 'inputs', 'inputs', 'derived from this tree'],
        ['zip entry name check removed', edit((c, st) => { const a = st.find(s => s.id === 'inputs'); a.run = String(a.run).replace("r'^[A-Za-z0-9._/-]+$'", "r'^.*$'"); }), 'inputs', 'inputs', 'A-Za-z0-9._/-'],
        ['inner files chosen by a find over the build output', edit((c, st) => { const v = st[idx(st, 'inner-sign')]; v.run = String(v.run).replace('mapfile -t REL < "$RUNNER_TEMP/sign-list.txt"', 'mapfile -t REL < <(find "$PKG" -iname "*.dll")'); }), 'inner_sign', 'sign-list', 'find'],
        ['derived sign list removed', edit((c, st) => { st.splice(st.findIndex(s => s.id === 'sign_list'), 1); c.jobs[JOB].steps = st; }), JOB, 'sign-list', 'sign_list'],
        ['hosted attestation of legion-built bytes', edit((c, st) => { st.push({ name: 'Attest', uses: 'actions/attest-build-provenance@' + '0'.repeat(40), with: { 'subject-path': 'x' } }); c.jobs[JOB].steps = st; c.jobs[JOB].permissions.attestations = 'write'; }), 'Attest', 'attest', 'legion'],
        ['jsign jar not checked against its pin', edit((c, st) => { delete st.find(s => s.id === 'jsign').env.JSIGN_SHA256; }), 'jsign', 'trust', 'sha256'],
        ['stale unsigned status after the signing validation', { releasing: signedReleasing }, PAGE_REL, 'status', 'unsigned'],
        ['stale unsigned status on the published page', { releasing: signedReleasing, page: signedPage }, liveUrl, 'status', 'unsigned'],
        ['signed status while the validation is pending', { page: signedPage }, PAGE_REL, 'status', 'pending'],
        ['Linux publish waits on Windows signing', edit(c => { c.jobs[LINUX_PUBLISH].needs = [c.jobs[LINUX_PUBLISH].needs, JOB].flat(); }), LINUX_PUBLISH, 'independence', JOB],
        ['a job after the Linux publish waits on Windows signing', edit(c => { c.jobs.descriptor.needs = [c.jobs.descriptor.needs, JOB].flat(); }), 'descriptor', 'independence', JOB],
        ['Linux publish job removed', edit(c => { delete c.jobs[LINUX_PUBLISH]; }), LINUX_PUBLISH, 'independence', 'absent'],
        // G-54b: every Windows job, derived from its artifact names
        ['descriptor waits on the Windows build', edit(c => { c.jobs.descriptor.needs = [c.jobs.descriptor.needs, 'build-windows'].flat(); }), 'descriptor', 'independence', 'build-windows'],
        ['channel-live waits on the Windows sidecar job', edit(c => { c.jobs['channel-live'].needs = [c.jobs['channel-live'].needs, 'windows-sidecar'].flat(); }), 'channel-live', 'independence', 'windows-sidecar'],
        ['build-linux waits on the Windows sidecar job', edit(c => { c.jobs['build-linux'].needs = 'windows-sidecar'; }), 'build-linux', 'independence', 'windows-sidecar'],
        ['Linux publish waits on the Windows build through a job that moves no artifact', edit(c => { c.jobs.bridge = { needs: 'build-windows', 'runs-on': 'ubuntu-latest', steps: [{ run: 'echo bridge' }] }; c.jobs[LINUX_PUBLISH].needs = [c.jobs[LINUX_PUBLISH].needs, 'bridge'].flat(); }), LINUX_PUBLISH, 'independence', 'build-windows'],
        ['descriptor waits on a new Windows publish job', edit(c => { c.jobs['publish-windows'] = winPublish(); c.jobs.descriptor.needs = [c.jobs.descriptor.needs, 'publish-windows'].flat(); }), 'descriptor', 'independence', 'publish-windows'],
        ['the sign job no longer moves a Windows artifact', edit(c => { for (const s of stepsOf(c.jobs[JOB])) if (s.with?.name) s.with.name = String(s.with.name).replace('windows', 'w'); }), JOB, 'independence', 'not found among'],
        ['sign job removed (zero steps)', edit(c => { delete c.jobs[JOB]; }), JOB, 'vacuity', 'absent'],
        ['unreadable workflow', { wf: null }, RELEASE_REL, 'vacuity', 'unreadable'],
    ];
    let failed = 0;
    for (const [name, change, where, rule, value] of plants) {
        const { failures } = runChecks({ ...base, ...change });
        if (failures.some(f => f.where === where && f.rule === rule && f.msg.includes(value))) {
            console.log(`  ok  ${name} -> red, naming ${where} [${rule}] ${value}`);
        } else {
            console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red naming ${where} [${rule}] ${value}; got: ${failures.map(fmt).join(' | ') || '(no failures)'}`);
            failed += 1;
        }
    }
    if (failed > 0) return 1;
    console.log(`${NAME}: --self-test PASS -- three controls green (unsigned, signed, a Windows publish job after the Linux publish) and ${plants.length} planted faults went red naming their step or key`);
    return 0;
}

async function main() {
    let yaml;
    try {
        yaml = loadYaml();
    } catch {
        console.error(`${NAME}: FAIL -- broken instrument: js-yaml is not installed in theia/. Next step: run yarn install in theia/ first.`);
        return 1;
    }
    if (args.includes('--self-test')) return selfTest(yaml);
    const { config, failures: cf } = resolveConfig(join(REPO_ROOT, 'configuration.toml'));
    if (cf.length > 0 || config === undefined) {
        console.error(`${NAME}: FAIL -- configuration.toml does not resolve, so the published page has no address. Next step: run node scripts/generate.mjs; it names the faulty key.`);
        return 1;
    }
    const liveUrl = liveUrlOf(config);
    let live = null;
    let why = null;
    try {
        const res = await fetch(liveUrl, { signal: AbortSignal.timeout(15000) });
        if (res.status === 200) live = await res.text();
        else why = `HTTP ${res.status}`;
    } catch (e) {
        why = e.message;
    }
    const wfText = readRel(RELEASE_REL);
    const { failures, evidence } = runChecks({ wf: wfText === null ? null : parse(yaml, wfText), releasing: readRel(RELEASING_REL), page: readRel(PAGE_REL), live, liveUrl });
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} problem(s) with the Windows signing chain${why ? ` (${liveUrl}: ${why})` : ''}.`);
        failures.forEach(f => console.error(`  ${fmt(f)}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- ${JOB} signs in order: ${evidence.join(' -> ')}; Azure over OIDC only, behind every gate, no stored Azure secret; the Windows status on ${PAGE_REL} and ${liveUrl} matches the recorded signing posture.`);
    return 0;
}

if (DIRECT_RUN) process.exit(await main());
