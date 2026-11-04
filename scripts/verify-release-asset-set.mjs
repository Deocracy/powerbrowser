#!/usr/bin/env node
// scripts/verify-release-asset-set.mjs
//
// The release-asset-set row (Phase 49, DIST-07). One script serves the row and the release job.
//
// Derivation, at check time, from the tree and never from a typed list:
//  - app basename           configuration.toml [identity] app_basename (resolveConfig);
//  - release key and version the tag shape v<ESR>-<revision> (releaseIdentity), where the
//                           version is the tag minus its leading v, as docs/RELEASING.md states;
//  - target token           the first Target key row of the docs/RELEASING.md asset table;
//  - no-token assets        the paragraph of docs/RELEASING.md that lists the assets attached
//                           once per Release (SHA256SUMS, release-manifest.json, the notices, the
//                           source tarball), and each notice must exist in the tree.
// The expected set (versioned and stable names for the tarball and the MAR, SHA256SUMS, the
// build manifest under its stable name, the notices, the source tarball) is compared as set
// equality. An addition and a removal are both red, naming the asset. The manifest is published
// so descriptor-monotonic and the full-tier channel-live row can read it (owner decision 2026-10-31).
//
// What the row checks in .github/workflows/release.yml, sign-publish:
//  - the draft is created with --draft, and --generate-notes appears nowhere;
//  - the set equality step runs after attestation and before the bot App token is minted;
//  - the bot App token is minted immediately before the single publish;
//  - the publish is the only step with --draft=false, and it runs after the equality step;
//  - the R2 copy (r2_copy, DIST-08) runs between the equality step and the bot token mint, fails
//    closed, calls wrangler with --remote, reads each key before the put, refuses to overwrite other
//    bytes and reads the object back and compares sha512; a Cloudflare credential appears in no other
//    step of this workflow and in no other workflow file;
//  - the assemble step (the one that reads --expected) copies every expected kind but sums, which
//    the step writes itself over every file of assets/ (so the manifest is hashed too).
//
// What the row checks for Windows (owner answer A2, 2026-11-04: Windows publishes after the Linux publish
// to the MAR origin; the Release stays immutable and Linux-only):
//  - the Windows target token is the `windows-` Target key of the asset table, and it equals WINDOWS_TOKEN
//    (scripts/lib/channel-identity.mjs), the token the descriptor emitter writes into the patch URL;
//  - publish-windows needs build-windows and sign-publish, assembles by --expected-windows, and its
//    r2_copy step meets the same write-once rules as sign-publish's; the Cloudflare credential reaches
//    those two r2_copy steps and nothing else;
//  - no job named *-windows runs gh release create, upload, edit or delete.
//
// Modes:
//  (no argument)                       the row: the workflow order and the derived expectation.
//  --expected --manifest <json>        prints one TAB-separated kind and name per expected asset;
//                                      the release job copies the assets with these names.
//  --expected-windows                  the same for the Windows files publish-windows copies to the
//                                      MAR origin; the release key comes from this tree.
//  --manifest <json> --draft <json>    the live comparison: the draft asset names from gh against
//                                      the manifest-derived set. Exit 1 names each delta.
//  --self-test                         plants faults in memory; writes nothing.
//
// Honestly --quick: the row and the self-test read the tree and parse YAML (js-yaml from theia/).
// No network and no gh call. The live mode reads files the release job already wrote.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { releaseIdentity, resolveConfig } from './generate.mjs';
import { MANIFEST_ASSET, WINDOWS_TOKEN } from './lib/channel-identity.mjs';
import { failOpenFaults, loadYaml, stepsOf } from './lib/release-workflow.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'release-asset-set';
const SELF_REL = 'scripts/verify-release-asset-set.mjs';
const RELEASE_REL = '.github/workflows/release.yml';
const DOCS_REL = 'docs/RELEASING.md';

const usage = `Next step: run: node ${SELF_REL}, or node ${SELF_REL} --expected --manifest <release-manifest.json>, or add --self-test.`;
const args = process.argv.slice(2);
const flag = name => args.indexOf(name);
const SELF = args.includes('--self-test');
const EXPECTED = args.includes('--expected');
const EXPECTED_WINDOWS = args.includes('--expected-windows');
const MANIFEST_AT = flag('--manifest');
const DRAFT_AT = flag('--draft');
const known = new Set(['--self-test', '--expected', '--expected-windows', '--manifest', '--draft']);
for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (!known.has(a)) {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
        console.error(`  ${usage}`);
        process.exit(2);
    }
    if ((a === '--manifest' || a === '--draft') && (args[i + 1] === undefined || args[i + 1].startsWith('--'))) {
        console.error(`${NAME}: FAIL -- ${a} needs a path`);
        console.error(`  ${usage}`);
        process.exit(2);
    }
    if (a === '--manifest' || a === '--draft') i += 1;
}
if ((DRAFT_AT >= 0) !== (MANIFEST_AT >= 0) && !EXPECTED && !EXPECTED_WINDOWS && !SELF) {
    console.error(`${NAME}: FAIL -- --draft is compared against --manifest; pass both`);
    console.error(`  ${usage}`);
    process.exit(2);
}

// js-yaml lives in theia/node_modules, which the hosted release job does not install: load it
// only for the row, never for --expected or --draft.
function yamlOrExit() {
    try {
        return loadYaml();
    } catch {
        console.error(`${NAME}: FAIL -- broken instrument: js-yaml is not installed in theia/. Next step: run yarn install in theia/ first.`);
        process.exit(1);
    }
}

function readText(root, rel) {
    try {
        return readFileSync(join(root, rel), 'utf8');
    } catch {
        return null;
    }
}

// The "## Release asset names" section of docs/RELEASING.md, up to the next level-2 heading.
// Both derivations read this section only, so a backticked key elsewhere in the file never matches.
export function assetSection(docs) {
    const m = docs?.match(/^## Release asset names\n([\s\S]*?)(?=^## |(?![\s\S]))/m);
    return m ? m[1] : null;
}

// The target token: the first backticked Target key of the asset table in that section.
export function targetToken(docs) {
    const section = assetSection(docs);
    const m = section?.match(/^\| `([a-z0-9]+(?:-[a-z0-9_]+)+)` \|/m);
    return m ? m[1] : null;
}

// The Windows target token: the backticked Target key of the asset table that starts with windows-.
export function windowsToken(docs) {
    return assetSection(docs)?.match(/^\| `(windows-[a-z0-9_]+)` \|/m)?.[1] ?? null;
}

// The assets attached once per Release: the backticked names of the paragraph that lists them.
export function noTokenAssets(docs) {
    const m = assetSection(docs)?.match(/Assets that carry no target token[^:]*:([\s\S]*?)the source tarball\./);
    if (!m) return null;
    return [...m[1].matchAll(/`([^`]+)`/g)].map(x => x[1]);
}

// The release key grammar, anchored: v<esr groups>-<revision>. Everything derived from it (tag,
// asset names, the TAB-separated list the release job copies by) is refused outside it.
export const RELEASE_KEY = /^v\d+(?:\.\d+)*-\d+$/;
// A name safe to use as a file name and as a line of the TSV protocol.
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

// The expected set as [kind, name] pairs. The version is the tag minus its leading v. Throws on a
// release key, token or name outside the grammar, so a hostile manifest cannot write outside assets/.
export function expectedAssets({ app, releaseKey, token, noToken }) {
    if (typeof releaseKey !== 'string' || !RELEASE_KEY.test(releaseKey)) throw new Error(`release key ${JSON.stringify(releaseKey)} is not v<esr>-<revision>`);
    if (typeof token !== 'string' || noToken === null || noToken === undefined) throw new Error('the target token or the no-token asset list is not derivable from docs/RELEASING.md');
    const version = releaseKey.replace(/^v/, '');
    const notices = noToken.filter(n => n !== 'SHA256SUMS' && n !== MANIFEST_ASSET);
    const set = [
        ['versioned-tarball', `${app}-${version}.${token}.tar.xz`],
        ['stable-tarball', `${app}-${token}.tar.xz`],
        ['versioned-mar', `${app}-${version}.${token}.complete.mar`],
        ['stable-mar', `${app}-${token}.complete.mar`],
        ['sums', 'SHA256SUMS'],
        ['manifest', MANIFEST_ASSET],
        ...notices.map(n => ['notice', n]),
        ['source', `${app}-${version}.source.tar.gz`],
    ];
    for (const [, name] of set) {
        if (!SAFE_NAME.test(name) || name.includes('..')) throw new Error(`asset name ${JSON.stringify(name)} is outside [A-Za-z0-9._-]`);
    }
    return set;
}

// The Windows files publish-windows copies write-once to <mar_origin>/<tag>/, never to the Release (A2).
export function expectedWindowsAssets({ app, releaseKey, token }) {
    if (typeof releaseKey !== 'string' || !RELEASE_KEY.test(releaseKey)) throw new Error(`release key ${JSON.stringify(releaseKey)} is not v<esr>-<revision>`);
    if (typeof token !== 'string') throw new Error('the Windows target token is not derivable from docs/RELEASING.md');
    const version = releaseKey.replace(/^v/, '');
    const set = [
        ['versioned-installer', `${app}-${version}.${token}.installer.exe`],
        ['versioned-mar', `${app}-${version}.${token}.complete.mar`],
        ['sums', 'SHA256SUMS'],
    ];
    for (const [, name] of set) {
        if (!SAFE_NAME.test(name) || name.includes('..')) throw new Error(`asset name ${JSON.stringify(name)} is outside [A-Za-z0-9._-]`);
    }
    return set;
}

// The write-once copy rules of one r2_copy step (sign-publish's and publish-windows's). Pure.
function r2CopyProblems(jobId, step) {
    const out = [];
    const run = String(step.run ?? '');
    for (const f of failOpenFaults(step)) out.push(['fail-open', `${jobId} r2_copy step ${f}, so a Release could publish with the origin unfilled. Next step: remove it.`]);
    for (const l of run.split('\n').filter(x => /\bwrangler r2 object (get|put)\b/.test(x) && !/\s--remote(\s|$)/.test(x))) {
        out.push(['r2-copy', `${jobId} r2_copy runs '${l.trim()}' without --remote, so wrangler uses local storage and the origin is never read or written. Next step: add --remote.`]);
    }
    const putAt = run.indexOf('wrangler r2 object put');
    const getAt = run.indexOf('wrangler r2 object get');
    const backAt = putAt < 0 ? -1 : run.indexOf('wrangler r2 object get', putAt);
    if (putAt < 0 || getAt < 0 || getAt > putAt || !/refusing to overwrite/.test(run) || backAt < 0 || !/sha512sum/.test(run.slice(backAt))) {
        out.push(['r2-copy', `${jobId} r2_copy does not read each key before the put, refuse to overwrite other bytes, and read the object back and compare sha512 after the put, so the write-once origin is not proven. Next step: restore the write-once copy.`]);
    }
    if (step.env?.TAG !== '${{ steps.derive_key.outputs.tag }}') {
        out.push(['order', `${jobId} r2_copy step takes its tag from ${JSON.stringify(step.env?.TAG ?? null)}, not steps.derive_key.outputs.tag, so a runner-written value could choose the origin key. Next step: use the tree-derived tag.`]);
    }
    return out;
}

// Set equality: a missing asset and an extra asset are both failures, each naming the asset.
export function compareDraft(expected, draft) {
    const want = new Set(expected.map(([, n]) => n));
    const got = new Set(draft);
    const out = [];
    for (const n of want) {
        if (!got.has(n)) out.push(`asset ${n} is missing from the draft Release, so the publish would ship without it`);
    }
    for (const n of got) {
        if (!want.has(n)) out.push(`asset ${n} is on the draft Release but not in the manifest-derived set, so the publish would ship an unchecked file`);
    }
    return out;
}

function runChecks(root, overrides = {}) {
    const failures = [];
    const fail = (file, rule, msg) => failures.push({ file, rule, msg });
    const read = overrides.read ?? (rel => readText(root, rel));

    const { config, failures: cfgFailures } = resolveConfig(join(root, 'configuration.toml'));
    if (cfgFailures.length > 0) {
        fail('configuration.toml', 'derive', `does not resolve (${cfgFailures[0]}). Next step: fix the manifest.`);
        return { failures, expected: [] };
    }
    const app = config.identity.app_basename;
    const releaseKey = overrides.releaseKey ?? releaseIdentity(config).releaseKey;

    const docs = read(DOCS_REL);
    const token = targetToken(docs);
    const noToken = noTokenAssets(docs);
    if (token === null) fail(DOCS_REL, 'derive', `has no Target key row in the Release asset names table, so no target token is derivable. Next step: fill the table row.`);
    if (noToken === null) fail(DOCS_REL, 'derive', `has no paragraph that lists the assets attached once per Release. Next step: restore that sentence.`);
    if (token === null || noToken === null) return { failures, expected: [] };

    let expected;
    try {
        expected = expectedAssets({ app, releaseKey, token, noToken });
    } catch (e) {
        fail(DOCS_REL, 'derive', `${e.message}. Next step: fix the key, the table row or the notice names.`);
        return { failures, expected: [] };
    }
    const winToken = windowsToken(docs);
    if (winToken !== WINDOWS_TOKEN) {
        fail(DOCS_REL, 'derive', `names the Windows Target key ${JSON.stringify(winToken)} in the Release asset names table, not ${JSON.stringify(WINDOWS_TOKEN)} (scripts/lib/channel-identity.mjs WINDOWS_TOKEN, the token the descriptor patch URL carries), so the published Windows MAR and its descriptor would disagree. Next step: make the row and the constant agree.`);
    }
    for (const [kind, name] of expected) {
        if (kind === 'notice' && read(name) === null) {
            fail(name, 'derive', `is listed as a no-token asset in ${DOCS_REL} but is not in the tree, so the publish has nothing to attach. Next step: restore the file.`);
        }
    }

    if (overrides.draft !== undefined) {
        for (const msg of compareDraft(expected, overrides.draft)) {
            const name = msg.match(/asset (\S+) is/)?.[1] ?? '(unnamed)';
            fail(RELEASE_REL, 'set-equality', `${msg} (${name}). Next step: rebuild the draft from the expected set.`);
        }
    }

    if (overrides.skipWorkflow) return { failures, expected };

    // The workflow order and the publish gate.
    const text = overrides.text ?? read(RELEASE_REL);
    if (text === null || text === undefined) {
        fail(RELEASE_REL, 'parse', `could not be read. Next step: restore the release workflow.`);
        return { failures, expected };
    }
    if (/--generate-notes/.test(text)) {
        fail(RELEASE_REL, 'notes', `uses --generate-notes; the notes are derived from the tree, never generated. Next step: remove the flag.`);
    }
    let wf;
    try {
        wf = yamlOrExit().load(text);
    } catch (e) {
        fail(RELEASE_REL, 'parse', `does not parse as YAML 1.2 (${e.message.split('\n')[0]}). Next step: fix the file.`);
        return { failures, expected };
    }
    const steps = stepsOf(wf?.jobs?.['sign-publish']);
    const at = id => steps.findIndex(s => s.id === id);
    // Every expected kind but sums needs a case arm in the assemble step, else that asset never reaches the draft.
    const assemble = steps.find(s => /verify-release-asset-set\.mjs --expected/.test(String(s.run ?? '')));
    if (assemble === undefined) fail(RELEASE_REL, 'assemble', `sign-publish has no step that copies the assets by the --expected list. Next step: restore the assemble step.`);
    for (const kind of new Set(expected.map(([k]) => k).filter(k => k !== 'sums'))) {
        if (assemble !== undefined && !new RegExp(`^\\s*(?:[a-z-]+\\|)*${kind}(?:\\|[a-z-]+)*\\)`, 'm').test(String(assemble.run))) {
            fail(RELEASE_REL, 'assemble', `the assemble step has no case arm for kind ${kind}, so that asset never reaches the draft. Next step: copy the ${kind} asset into assets/ by its --expected name.`);
        }
    }
    const attestAt = steps.findIndex(s => String(s.uses ?? '').startsWith('actions/attest-build-provenance@'));
    const draftAt = at('draft_release');
    const equalAt = at('asset_set');
    const botAt = at('bot');
    const publishAt = at('publish');
    for (const [id, i] of [['draft_release', draftAt], ['asset_set', equalAt], ['bot', botAt], ['publish', publishAt]]) {
        if (i < 0) fail(RELEASE_REL, 'order', `sign-publish has no step with id ${id}. Next step: restore the step, so the draft, the equality check, the token and the publish are all present.`);
    }
    if (attestAt < 0) fail(RELEASE_REL, 'order', `sign-publish has no attest-build-provenance step. Next step: attest the assets before the draft.`);
    if (draftAt < 0 || equalAt < 0 || botAt < 0 || publishAt < 0) return { failures, expected };

    const draftRun = String(steps[draftAt].run ?? '');
    const publishRun = String(steps[publishAt].run ?? '');
    if (!/gh release create[^\n]*--draft/.test(draftRun)) {
        fail(RELEASE_REL, 'order', `the draft_release step does not create the Release with --draft. Next step: create a draft with every asset in one call.`);
    }
    if (/--draft=false/.test(draftRun)) {
        fail(RELEASE_REL, 'order', `the draft_release step publishes with --draft=false. Next step: publish only in the publish step, after the equality check.`);
    }
    if (!/--draft=false/.test(publishRun)) {
        fail(RELEASE_REL, 'order', `the publish step does not publish the draft with --draft=false. Next step: publish once with gh release edit --draft=false.`);
    }
    if (!(attestAt < draftAt)) {
        fail(RELEASE_REL, 'order', `the draft is created before the assets are attested. Next step: attest before the draft.`);
    }
    if (!(equalAt < publishAt)) {
        fail(RELEASE_REL, 'order', `the publish runs before the asset-set equality check, so an unchecked asset set could be published. Next step: move the equality check before the publish.`);
    }
    if (!(botAt === publishAt - 1)) {
        fail(RELEASE_REL, 'order', `the bot App token is not minted immediately before the publish. Next step: mint it in the step directly before the publish.`);
    }
    if (String(steps[botAt].uses ?? '').indexOf('actions/create-github-app-token@') !== 0) {
        fail(RELEASE_REL, 'order', `the bot step is not actions/create-github-app-token. Next step: mint the bot App token with that action.`);
    }

    // The stale-approval guard runs before the MAR channel gate and before any signing step reads the key.
    const guardAt = at('newer_guard');
    const signAts = ['mar_channel_gate', 'sign_mar'].map(at).filter(i => i >= 0);
    if (guardAt < 0 || signAts.some(i => guardAt > i)) {
        fail(RELEASE_REL, 'order', `the stale-approval guard (newer_guard) is missing or runs after the MAR channel gate or the signing step, so the signing key could be read for a stale approval. Next step: refuse a Release at or above this key before the MAR channel gate.`);
    }
    // The publish chain fails closed: no step may swallow a failure, and none may be conditional.
    const finalAt = at('newer_guard_final');
    if (finalAt < 0 || finalAt !== botAt - 1) {
        fail(RELEASE_REL, 'order', `the stale-approval re-check (newer_guard_final) is not the step directly before the bot token mint. Next step: re-check for a newer Release immediately before minting.`);
    }
    for (const [id, i] of [['draft_release', draftAt], ['asset_set', equalAt], ['newer_guard', guardAt], ['newer_guard_final', finalAt], ['publish', publishAt]]) {
        if (i < 0) continue;
        for (const f of failOpenFaults(steps[i])) fail(RELEASE_REL, 'fail-open', `${id} step ${f}, so the draft, the equality check or the publish can pass without doing its work. Next step: remove it.`);
    }
    for (const f of failOpenFaults(steps[botAt])) fail(RELEASE_REL, 'fail-open', `bot step ${f}. Next step: remove it.`);
    // DIST-08: the R2 copy of each signed MAR sits between the equality check and the bot token mint, so the
    // primary MAR origin holds the signed bytes before any Release is public.
    const r2At = at('r2_copy');
    if (r2At < 0 || r2At < equalAt || r2At > botAt) {
        fail(RELEASE_REL, 'order', `sign-publish has no r2_copy step between the equality check and the bot token mint, so a Release could publish before the primary MAR origin holds its bytes (DIST-08). Next step: restore the R2 copy step before the token mint.`);
    } else {
        for (const [rule, msg] of r2CopyProblems('sign-publish', steps[r2At])) fail(RELEASE_REL, rule, msg);
    }
    // A2: Windows publishes to the MAR origin after the Linux publish, never to the immutable Release.
    const win = wf?.jobs?.['publish-windows'];
    const winSteps = stepsOf(win);
    const winR2 = winSteps.find(s => s.id === 'r2_copy');
    if (win === undefined) {
        fail(RELEASE_REL, 'windows', `has no publish-windows job, so the Windows row of ${DOCS_REL} is never published. Next step: restore it (owner answer A2).`);
    } else {
        const needs = [win.needs ?? []].flat().map(String);
        for (const n of ['build-windows', 'sign-publish']) {
            if (!needs.includes(n)) fail(RELEASE_REL, 'windows', `publish-windows does not need ${n}, so it could copy Windows files before ${n === 'sign-publish' ? 'the Linux Release is published' : 'the Windows build exists'}. Next step: add ${n} to its needs.`);
        }
        if (!winSteps.some(s => /verify-release-asset-set\.mjs --expected-windows\b/.test(String(s.run ?? '')))) {
            fail(RELEASE_REL, 'assemble', `publish-windows has no step that names the Windows files by the --expected-windows list. Next step: restore the assemble step.`);
        }
        if (winR2 === undefined) fail(RELEASE_REL, 'order', `publish-windows has no r2_copy step, so the Windows files never reach the MAR origin. Next step: restore it.`);
        else for (const [rule, msg] of r2CopyProblems('publish-windows', winR2)) fail(RELEASE_REL, rule, msg);
    }
    for (const [jobId, job] of Object.entries(wf?.jobs ?? {})) {
        if (!/-windows$/.test(jobId)) continue;
        for (const s of stepsOf(job)) {
            const m = /\bgh release (create|upload|edit|delete)\b/.exec(String(s.run ?? ''));
            if (m) fail(RELEASE_REL, 'windows', `${jobId} step '${s.name ?? s.id}' runs gh release ${m[1]}, but the Release is immutable and Linux-only (owner answer A2), so the call is refused or rewrites a published Release. Next step: publish the Windows files to the MAR origin only.`);
        }
    }
    // A Cloudflare credential reaches the R2 copy step and nothing else, in this workflow or any other.
    const r2Secret = /secrets\.([A-Za-z0-9_]+)/.exec(String(steps[r2At]?.env?.CLOUDFLARE_API_TOKEN ?? ''))?.[1];
    const cf = new RegExp(`CLOUDFLARE_${r2Secret === undefined ? '' : `|\\b${r2Secret}\\b`}`);
    const scopes = [['(workflow)', { env: wf?.env, defaults: wf?.defaults }]];
    for (const [jobId, job] of Object.entries(wf?.jobs ?? {})) {
        const { steps: jobSteps, ...rest } = job ?? {};
        scopes.push([jobId, rest]);
        stepsOf(job).forEach((s, i) => {
            if (!((jobId === 'sign-publish' || jobId === 'publish-windows') && s.id === 'r2_copy')) scopes.push([`${jobId} step '${s.name ?? s.id ?? i}'`, s]);
        });
    }
    for (const [where, v] of scopes) {
        if (cf.test(JSON.stringify(v ?? {}))) fail(RELEASE_REL, 'cloudflare-scope', `${where} names a Cloudflare credential; only the r2_copy steps of sign-publish and publish-windows may. Next step: remove it.`);
    }
    const others = overrides.otherWorkflows ?? Object.fromEntries(readdirSync(join(root, '.github/workflows'))
        .filter(n => /\.ya?ml$/.test(n) && `.github/workflows/${n}` !== RELEASE_REL)
        .map(n => [`.github/workflows/${n}`, read(`.github/workflows/${n}`) ?? '']));
    for (const [rel, t] of Object.entries(others)) {
        if (cf.test(t)) fail(rel, 'cloudflare-scope', `names a Cloudflare credential; only release.yml's two r2_copy steps may hold one, and the sweep writes download counts through the telemetry Worker. Next step: remove it.`);
    }
    // The tag and the manifest-free names: every gh call uses the tree-derived tag.
    for (const [id, i] of [['draft_release', draftAt], ['asset_set', equalAt], ['publish', publishAt], ['newer_guard', guardAt], ['newer_guard_final', finalAt]]) {
        if (i >= 0 && steps[i].env?.TAG !== '${{ steps.derive_key.outputs.tag }}') {
            fail(RELEASE_REL, 'order', `${id} step takes its tag from ${JSON.stringify(steps[i].env?.TAG ?? null)}, not steps.derive_key.outputs.tag, so the runner-written manifest could choose the public tag. Next step: use the tree-derived tag.`);
        }
    }

    failures.sort((a, b) => (a.rule < b.rule ? -1 : a.rule > b.rule ? 1 : a.msg < b.msg ? -1 : 1));
    return { failures, expected };
}

const fmt = f => `${f.file} [${f.rule}]: ${f.msg}`;

function readJson(path) {
    try {
        return JSON.parse(readFileSync(path, 'utf8'));
    } catch (e) {
        console.error(`${NAME}: FAIL -- ${path} could not be read as JSON (${e.message.split('\n')[0]}). Next step: check the file the release job wrote.`);
        process.exit(1);
    }
}

function main() {
    if (SELF) return selfTest();
    if (EXPECTED_WINDOWS) {
        const { config } = resolveConfig(join(REPO_ROOT, 'configuration.toml'));
        let expected;
        try {
            expected = expectedWindowsAssets({ app: config.identity.app_basename, releaseKey: releaseIdentity(config).releaseKey, token: windowsToken(readText(REPO_ROOT, DOCS_REL)) });
        } catch (e) {
            console.error(`${NAME}: FAIL -- ${e.message}. Next step: nothing is copied; check configuration.toml and docs/RELEASING.md.`);
            return 1;
        }
        for (const [kind, name] of expected) console.log(`${kind}\t${name}`);
        return 0;
    }
    if (EXPECTED) {
        if (MANIFEST_AT < 0) {
            console.error(`${NAME}: FAIL -- --expected needs --manifest <release-manifest.json>`);
            console.error(`  ${usage}`);
            return 2;
        }
        const manifest = readJson(args[MANIFEST_AT + 1]);
        const { config } = resolveConfig(join(REPO_ROOT, 'configuration.toml'));
        const docs = readText(REPO_ROOT, DOCS_REL);
        let expected;
        try {
            expected = expectedAssets({
                app: config.identity.app_basename,
                releaseKey: manifest.release_key,
                token: targetToken(docs),
                noToken: noTokenAssets(docs),
            });
        } catch (e) {
            console.error(`${NAME}: FAIL -- ${e.message}. Next step: nothing is copied; check the manifest and docs/RELEASING.md.`);
            return 1;
        }
        for (const [kind, name] of expected) console.log(`${kind}\t${name}`);
        return 0;
    }
    if (DRAFT_AT >= 0) {
        const manifest = readJson(args[MANIFEST_AT + 1]);
        const draft = readJson(args[DRAFT_AT + 1]);
        const { failures, expected } = runChecks(REPO_ROOT, { releaseKey: manifest.release_key, draft, skipWorkflow: true });
        if (failures.length > 0) {
            console.error(`${NAME}: FAIL -- ${failures.length} problem(s): the draft asset set does not equal the manifest-derived set.`);
            failures.forEach(f => console.error(`  ${fmt(f)}`));
            return 1;
        }
        console.log(`${NAME}: PASS -- the draft carries exactly the ${expected.length} manifest-derived assets for ${manifest.release_key}; the publish may run.`);
        return 0;
    }
    const { failures, expected } = runChecks(REPO_ROOT);
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} problem(s) with the draft, the equality check and the publish order.`);
        failures.forEach(f => console.error(`  ${fmt(f)}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- sign-publish creates a draft with every asset, checks it against ${expected.length} derived names (versioned and stable tarball and MAR, SHA256SUMS, ${MANIFEST_ASSET}, notices, source tarball) before the bot App token is minted and the single publish; the assemble step copies every expected kind.`);
    return 0;
}

function selfTest() {
    const real = readText(REPO_ROOT, RELEASE_REL);
    if (real === null) {
        console.error(`${NAME}: --self-test FAIL -- ${RELEASE_REL} could not be read. Next step: restore the release workflow.`);
        return 1;
    }
    const { config } = resolveConfig(join(REPO_ROOT, 'configuration.toml'));
    const docs = readText(REPO_ROOT, DOCS_REL);
    const expected = expectedAssets({
        app: config.identity.app_basename,
        releaseKey: releaseIdentity(config).releaseKey,
        token: targetToken(docs),
        noToken: noTokenAssets(docs),
    });
    const names = expected.map(([, n]) => n);
    const good = [...names];

    const baseline = runChecks(REPO_ROOT, { text: real, draft: good });
    if (baseline.failures.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- the unmodified tree is already red, so the planted-fault results below would mean nothing:`);
        baseline.failures.forEach(f => console.error(`  ${fmt(f)}`));
        return 1;
    }
    console.log(`  ok  baseline -> green`);

    const edit = (from, to) => {
        if (!real.includes(from)) throw new Error(`self-test anchor '${from}' is absent from ${RELEASE_REL}`);
        return real.replace(from, to);
    };
    // Swaps two steps of the workflow text by line range: a step runs from its `      - ` line to
    // the next step or the next job-level key, so the job below sign-publish is never moved.
    const swapStepBlocks = (a, b) => {
        const lines = real.split('\n');
        const blockOf = id => {
            const at = lines.findIndex(l => l === `        id: ${id}`);
            if (at < 0) throw new Error(`self-test anchor ${id} is absent from ${RELEASE_REL}`);
            let start = at;
            while (start > 0 && !/^ {6}- /.test(lines[start])) start -= 1;
            let end = at + 1;
            while (end < lines.length && !/^( {6}- |\s{0,5}\S)/.test(lines[end])) end += 1;
            return [start, end];
        };
        const [a1, a2] = blockOf(a);
        const [b1, b2] = blockOf(b);
        const [[f1, f2], [s1, s2]] = a1 < b1 ? [[a1, a2], [b1, b2]] : [[b1, b2], [a1, a2]];
        return [...lines.slice(0, f1), ...lines.slice(s1, s2), ...lines.slice(f2, s1), ...lines.slice(f1, f2), ...lines.slice(s2)].join('\n');
    };
    // The first occurrence inside one job's text, so a plant reaches publish-windows and not sign-publish.
    const editIn = (job, from, to) => {
        const start = real.indexOf(`\n  ${job}:\n`);
        const next = start < 0 ? -1 : real.slice(start + 1).search(/\n  [a-z][a-z0-9-]*:\n/);
        const end = next < 0 ? real.length : start + 1 + next;
        const at = start < 0 ? -1 : real.indexOf(from, start);
        if (at < 0 || at >= end) throw new Error(`self-test anchor '${from.trim()}' is absent from ${job} in ${RELEASE_REL}`);
        return real.slice(0, at) + to + real.slice(at + from.length);
    };
    const docsWith = (from, to) => rel => (rel === DOCS_REL ? docs.replace(from, to) : readText(REPO_ROOT, rel));
    const stableTar = expected.find(([k]) => k === 'stable-tarball')[1];
    const versionedTar = expected.find(([k]) => k === 'versioned-tarball')[1];
    const plants = [
        ['dropped asset (LICENSING.md)', { draft: good.filter(n => n !== 'LICENSING.md') }, 'LICENSING.md'],
        [`dropped asset (${MANIFEST_ASSET})`, { draft: good.filter(n => n !== MANIFEST_ASSET) }, MANIFEST_ASSET],
        ['assemble step without the manifest arm', { text: edit('              manifest) ', '              manifest-x) ') }, 'no case arm for kind manifest'],
        ['assemble step without the notice arm', { text: edit('              notice) ', '              notice-x) ') }, 'no case arm for kind notice'],
        ['extra asset (stray.zip)', { draft: [...good, 'stray.zip'] }, 'stray.zip'],
        ['stable-name drift', { draft: good.map(n => (n === stableTar ? 'powerbrowser-linux-x86.tar.xz' : n)) }, stableTar],
        ['versioned-name drift', { draft: good.map(n => (n === versionedTar ? versionedTar.replace(/-\d+\.linux/, '-99.linux') : n)) }, versionedTar],
        ['publish before the asset-set equality', { text: swapStepBlocks('asset_set', 'publish') }, 'publish runs before the asset-set equality'],
        ['continue-on-error on the publish', { text: edit('        id: publish\n', '        id: publish\n        continue-on-error: true\n') }, 'continue-on-error'],
        ['|| true after the equality check', { text: edit('--draft "$RUNNER_TEMP/draft.json"', '--draft "$RUNNER_TEMP/draft.json" || true') }, '|| true'],
        ['if: always() on the draft step', { text: edit('        id: draft_release\n', "        id: draft_release\n        if: always()\n") }, 'if:'],
        ['R2 copy removed', { text: edit('        id: r2_copy\n', '        id: r2_copy_x\n') }, 'no r2_copy step'],
        ['R2 copy moved after the publish', { text: swapStepBlocks('r2_copy', 'publish') }, 'no r2_copy step'],
        ['continue-on-error on the R2 copy', { text: edit('        id: r2_copy\n', '        id: r2_copy\n        continue-on-error: true\n') }, 'r2_copy step carries continue-on-error'],
        ['R2 put without --remote', { text: edit('wrangler r2 object put "$R2_MAR_BUCKET/$KEY" --remote ', 'wrangler r2 object put "$R2_MAR_BUCKET/$KEY" ') }, 'without --remote'],
        ['R2 read-back removed', { text: edit('            wrangler r2 object get "$R2_MAR_BUCKET/$KEY" --remote --file readback.bin\n', '') }, 'write-once origin is not proven'],
        ['R2 overwrite refusal removed', { text: edit('refusing to overwrite', 'declining') }, 'write-once origin is not proven'],
        ['R2 token in another step', { text: edit('        id: newer_guard_final\n        env:\n', '        id: newer_guard_final\n        env:\n          CF: ${{ secrets.R2_MAR_WRITE_TOKEN }}\n') }, "Re-check that no newer Release"],
        ['Cloudflare credential in another workflow', { otherWorkflows: { '.github/workflows/sweep-probe.yml': 'env:\n  CLOUDFLARE_API_TOKEN: x\n' } }, 'Cloudflare credential; only'],
        ['publish takes the tag from the manifest', { text: edit('        id: publish\n        env:\n          GH_TOKEN: ${{ steps.bot.outputs.token }}\n          TAG: ${{ steps.derive_key.outputs.tag }}', '        id: publish\n        env:\n          GH_TOKEN: ${{ steps.bot.outputs.token }}\n          TAG: ${{ fromJSON(needs.build-linux.outputs.tag) }}') }, 'tree-derived tag'],
        ['stale-approval re-check removed', { text: edit('        id: newer_guard_final\n', '        id: newer_guard_final_x\n') }, 'newer_guard_final'],
        ['stale-approval guard removed from before the signing steps', { text: edit('        id: newer_guard\n', '        id: newer_guard_x\n') }, 'the stale-approval guard (newer_guard) is missing or runs after'],
        ['stale-approval guard moved after the signing step', { text: swapStepBlocks('newer_guard', 'sign_mar') }, 'runs after the MAR channel gate or the signing step'],
        ['continue-on-error on the stale-approval guard', { text: edit('        id: newer_guard\n', '        id: newer_guard\n        continue-on-error: true\n') }, 'newer_guard step'],
        ['publish-windows removed', { text: real.replace('\n  publish-windows:\n', '\n  publish-windows-x:\n') }, 'has no publish-windows job'],
        ['publish-windows not waiting on sign-publish', { text: editIn('publish-windows', '    needs: [build-windows, sign-publish]\n', '    needs: [build-windows]\n') }, 'publish-windows does not need sign-publish'],
        ['publish-windows uploading to the Release', { text: editIn('publish-windows', '          cat assets/SHA256SUMS\n', '          cat assets/SHA256SUMS\n          gh release upload "$TAG" assets/*\n') }, 'runs gh release upload'],
        ['descriptor-windows editing the Release', { text: editIn('descriptor-windows', '          echo "mar=published/$NAME" >> "$GITHUB_OUTPUT"\n', '          gh release edit "$TAG" --notes x\n          echo "mar=published/$NAME" >> "$GITHUB_OUTPUT"\n') }, 'descriptor-windows step'],
        ['publish-windows assembling without --expected-windows', { text: editIn('publish-windows', 'verify-release-asset-set.mjs --expected-windows >', 'verify-release-asset-set.mjs --listed >') }, 'publish-windows has no step that names the Windows files'],
        ['publish-windows R2 put without --remote', { text: editIn('publish-windows', 'wrangler r2 object put "$R2_MAR_BUCKET/$KEY" --remote ', 'wrangler r2 object put "$R2_MAR_BUCKET/$KEY" ') }, 'publish-windows r2_copy runs'],
        ['publish-windows R2 read-back removed', { text: editIn('publish-windows', '            wrangler r2 object get "$R2_MAR_BUCKET/$KEY" --remote --file readback.bin\n', '') }, 'publish-windows r2_copy does not read each key'],
        ['publish-windows R2 copy keyed by a runner value', { text: editIn('publish-windows', '        id: r2_copy\n        env:\n          TAG: ${{ steps.derive_key.outputs.tag }}', '        id: r2_copy\n        env:\n          TAG: ${{ needs.build-windows.outputs.build }}') }, 'publish-windows r2_copy step takes its tag'],
        ['Cloudflare token in descriptor-windows', { text: editIn('descriptor-windows', '          TAG: ${{ steps.derive_key.outputs.tag }}\n', '          TAG: ${{ steps.derive_key.outputs.tag }}\n          CF: ${{ secrets.R2_MAR_WRITE_TOKEN }}\n') }, "descriptor-windows step 'Download the signed Windows MAR"],
        ['Windows Target key drifted from WINDOWS_TOKEN', { read: docsWith('| `windows-x86_64` |', '| `windows-x64` |') }, '"windows-x64"'],
        ['release key with a path separator', { releaseKey: 'v153.5.1-1/../../x' }, 'is not v<esr>-<revision>'],
        ['release key with a newline', { releaseKey: 'v153.5.1-1\nsource\tx' }, 'is not v<esr>-<revision>'],
        ['release key with a pre-release suffix', { releaseKey: 'v153.5.1-rc1' }, 'is not v<esr>-<revision>'],
    ];

    let failed = 0;
    for (const [name, overrides, value] of plants) {
        const { failures } = runChecks(REPO_ROOT, { text: real, draft: good, ...overrides });
        const hit = failures.some(f => f.file.length > 0 && f.msg.includes(value));
        if (hit) {
            console.log(`  ok  ${name} -> red, naming '${value}'`);
        } else {
            console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red naming '${value}'; got: ${failures.map(fmt).join(' | ') || '(no failures at all)'}`);
            failed += 1;
        }
    }
    if (failed > 0) return 1;
    console.log(`${NAME}: --self-test PASS -- the unmodified draft and publish order are green and ${plants.length} planted faults each went red naming the asset or the step. It writes nothing.`);
    return 0;
}

process.exit(main());
