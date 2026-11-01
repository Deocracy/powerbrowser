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
//   inner-sign           jsign over the .exe and .dll files of the staged tree
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
//   secret      no secrets. reference whose name looks like an Azure credential anywhere in the file, and in
//               sign-windows no secrets. reference outside the MAR-signing step.
//   permissions sign-windows holds id-token write and contents read, never contents write; the workflow level
//               grants no id-token.
//   trust       sign-windows builds signmar from the pinned source and exports no LD_LIBRARY_PATH; the jsign
//               jar is checked against a 64-hex sha256 before use.
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
const DER_REL = 'powerbrowser/packaging/mar/mar-primary.der';
const LEGION_LABELS = ['legion', 'powerbrowser-release'];
const CHAIN = ['inner-sign', 'repackage-installer', 'setup-sign', 'repackage-mar', 'signmar-sign', 'signmar-verify'];
const GATES = ['sha_gate', 'stale_guard', 'azure_config'];
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
    if (/\bjsign\b|\$JSIGN\b/.test(run) && /\.dll\b/.test(run)) return 'inner-sign';
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
        ['schedule key', edit(c => { c.on.schedule = [{ cron: '0 3 * * 1' }]; }), RELEASE_REL, 'schedule', 'schedule'],
        ['legion job carrying secrets', edit(c => { c.jobs['build-windows'].env.PROBE = '${{ secrets.PROBE }}'; }), 'build-windows', 'legion', 'secrets'],
        ['legion job carrying an environment', edit(c => { c.jobs['build-windows'].environment = 'release'; }), 'build-windows', 'legion', 'environment'],
        ['contents write on the sign job', edit(c => { c.jobs[JOB].permissions.contents = 'write'; }), JOB, 'permissions', 'contents'],
        ['LD_LIBRARY_PATH in the sign job', edit((c, st) => { st[idx(st, 'signmar-sign')].run = String(st[idx(st, 'signmar-sign')].run).replace('"$SIGNMAR" -d', 'LD_LIBRARY_PATH=windows "$SIGNMAR" -d'); }), JOB, 'trust', 'LD_LIBRARY_PATH'],
        ['MAR verified against an untracked DER', edit((c, st) => { const v = st[idx(st, 'signmar-verify')]; v.run = String(v.run).split(DER_REL).join('scratch/other.der'); }), 'win_verify_mar', 'trust', DER_REL],
        ['jsign jar not checked against its pin', edit((c, st) => { delete st.find(s => s.id === 'jsign').env.JSIGN_SHA256; }), 'jsign', 'trust', 'sha256'],
        ['stale unsigned status after the signing validation', { releasing: signedReleasing }, PAGE_REL, 'status', 'unsigned'],
        ['stale unsigned status on the published page', { releasing: signedReleasing, page: signedPage }, liveUrl, 'status', 'unsigned'],
        ['signed status while the validation is pending', { page: signedPage }, PAGE_REL, 'status', 'pending'],
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
    console.log(`${NAME}: --self-test PASS -- two controls green and ${plants.length} planted faults went red naming their step or key`);
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
