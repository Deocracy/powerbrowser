#!/usr/bin/env node
// scripts/verify-updates-repo-static.mjs
//
// The updates-repo-static row (Phase 47, DIST-03). The updates host serves one
// _redirects 200 rule over a static tree. That rule holds only while the repo
// carries no compute: a functions/ directory or a root-level _worker.js takes
// over routing and silently disables the rule.
//
//  1. Owner and repo. config.urls.release_notes in configuration.toml gives the
//     owner and the repo stem through resolveConfig; the updates repo is the
//     stem plus the updates suffix. No org or repo name is written here.
//  2. One read. A single recursive git tree listing of the updates repo's main
//     branch, fetched with a read-only `gh api` GET pinned to
//     X-GitHub-Api-Version 2022-11-28.
//  3. Absence property. A failure names every path with a directory called
//     functions at any depth, and a root-level _worker.js. No file list is kept
//     by hand; the tree decides.
//  4. Fail closed. A getter that throws, a malformed result, a non-2xx response,
//     unparseable JSON, a truncated listing, a non-array tree or an empty tree is
//     a FAIL naming the tree endpoint, never a SKIP and never a PASS.
//  5. Presence. The same tree must hold the _redirects rule and at least one
//     */update.xml descriptor. A tree with no compute that serves nothing is a FAIL.
//
// Usage:
//   node scripts/verify-updates-repo-static.mjs
//   node scripts/verify-updates-repo-static.mjs --self-test
//
// This row and its --self-test only read. The self-test serves fixture listings
// in memory, with no network and no gh, and writes nothing.

import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { resolveConfig } from './generate.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'updates-repo-static';
const SELF_REL = 'scripts/verify-updates-repo-static.mjs';
const MANIFEST_REL = 'configuration.toml';
export const API_VERSION_HEADER = 'X-GitHub-Api-Version: 2022-11-28';
const UPDATES_SUFFIX = '-updates';
const BRANCH = 'main';
const FUNCTIONS_DIR = 'functions';
const ROOT_WORKER = '_worker.js';
const REDIRECTS = '_redirects';
const DESCRIPTOR_SUFFIX = '/update.xml'; // a */update.xml: at least one directory level above it
const NEXT_AUTH = 'Next step: run gh auth status (the row needs the repo and read:org scopes); an absent or empty repo reads the same way until the static tree is pushed.';

// --- owner and repo ---------------------------------------------------------

export function loadConfig(root) {
    const resolved = resolveConfig(join(root, MANIFEST_REL));
    if (resolved.config === undefined || resolved.failures.length > 0) {
        throw new Error(`${MANIFEST_REL} does not resolve, so the owner and repo cannot be derived. Next step: run node scripts/generate.mjs -- it reports the faulty key.`);
    }
    return resolved.config;
}

export function repoSlug(root, config = loadConfig(root)) {
    const raw = config.urls?.release_notes;
    let url = null;
    try {
        url = new URL(raw);
    } catch { /* reported below */ }
    const parts = url?.pathname.split('/').filter(Boolean) ?? [];
    if (url === null || url.hostname !== 'github.com' || parts.length < 2) {
        throw new Error(`${MANIFEST_REL} [urls] release_notes is ${JSON.stringify(raw)}, which is not https://github.com/<owner>/<repo>/..., so the owner and the updates repo cannot be derived. Next step: correct it in ${MANIFEST_REL}.`);
    }
    const [owner, repo] = parts;
    return { owner, repo, updatesRepo: `${repo}${UPDATES_SUFFIX}` };
}

// --- reads ------------------------------------------------------------------

export function ghGet(path) {
    let out;
    try {
        out = execFileSync('gh', ['api', '-H', API_VERSION_HEADER, path],
            { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 });
    } catch (e) {
        const first = String(e.stderr || e.message).trim().split('\n')[0];
        return { ok: false, why: `GET ${path} could not be read (${first}). ${NEXT_AUTH}` };
    }
    try {
        return { ok: true, body: JSON.parse(out) };
    } catch {
        return { ok: false, why: `GET ${path} could not be read (the response is not JSON). ${NEXT_AUTH}` };
    }
}

// Every getter, real or planted, goes through this: a throw or a malformed
// result is unreadable, never green.
function safeGet(get, path) {
    let r;
    try {
        r = get(path);
    } catch (e) {
        return { ok: false, why: `GET ${path} could not be read (${String(e?.message ?? e).split('\n')[0]}). ${NEXT_AUTH}` };
    }
    if (r === null || typeof r !== 'object' || (r.ok !== true && typeof r.why !== 'string')) {
        return { ok: false, why: `GET ${path} could not be read (no result). ${NEXT_AUTH}` };
    }
    return r;
}

// --- the absence property ---------------------------------------------------

// Compute the static host must not carry. Returns the reason, or null.
export function computeReason(path) {
    const segs = path.split('/');
    if (segs.length === 1 && segs[0] === ROOT_WORKER) return 'a root-level worker file';
    if (segs.slice(0, -1).includes(FUNCTIONS_DIR)) return 'a path under a functions directory';
    return null;
}

export function runChecks(root, overrides = {}) {
    const slug = overrides.slug ?? repoSlug(root, overrides.config);
    const get = overrides.get ?? ghGet;
    const endpoint = `repos/${slug.owner}/${slug.updatesRepo}/git/trees/${BRANCH}?recursive=1`;
    const r = safeGet(get, endpoint);
    if (!r.ok) return { failures: [r.why], slug, endpoint };

    const body = r.body;
    if (body === null || typeof body !== 'object' || !Array.isArray(body.tree)) {
        return { failures: [`GET ${endpoint} returned no tree array, so the tree cannot be compared. Next step: check that ${slug.owner}/${slug.updatesRepo} exists and has a ${BRANCH} branch.`], slug, endpoint };
    }
    if (body.truncated === true) {
        return { failures: [`GET ${endpoint} returned a truncated tree listing, so the absence property cannot be proven. Next step: split the tree or add a fallback read in ${SELF_REL}.`], slug, endpoint };
    }
    if (body.tree.length === 0) {
        return { failures: [`GET ${endpoint} returned an empty tree, so the updates repo is empty or unreadable and nothing can be proven. Next step: push the static tree to ${slug.owner}/${slug.updatesRepo} ${BRANCH}.`], slug, endpoint };
    }

    const failures = [];
    for (const entry of body.tree) {
        if (typeof entry?.path !== 'string') {
            failures.push(`GET ${endpoint} returned a tree entry without a path, so it cannot be compared. Next step: re-read the listing.`);
            continue;
        }
        const reason = computeReason(entry.path);
        if (reason !== null) {
            failures.push(`${entry.path} is ${reason} in ${slug.owner}/${slug.updatesRepo}. Any compute on this host silently disables the _redirects 200 rule. Next step: remove the file from the updates repo; the tree must hold static files only.`);
        }
    }
    // Presence, read from the same listing: a rule-less or descriptor-less tree serves nothing.
    const paths = body.tree.map(entry => entry?.path).filter(p => typeof p === 'string');
    const NEXT_PUSH = `Next step: push the staged updates tree (updates-staging/) to ${slug.owner}/${slug.updatesRepo} ${BRANCH}.`;
    if (!paths.includes(REDIRECTS)) {
        failures.push(`GET ${endpoint} lists no ${REDIRECTS} in ${slug.owner}/${slug.updatesRepo}, so the 200 rule that routes the update channel is absent. ${NEXT_PUSH}`);
    }
    if (!paths.some(p => p.endsWith(DESCRIPTOR_SUFFIX))) {
        failures.push(`GET ${endpoint} lists no */update.xml descriptor in ${slug.owner}/${slug.updatesRepo}, so the channel offers no update document. ${NEXT_PUSH}`);
    }
    return { failures, compared: body.tree.length, slug, endpoint };
}

// --- main -------------------------------------------------------------------

function main() {
    const args = process.argv.slice(2);
    for (const a of args) {
        if (a !== '--self-test') {
            console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
            console.error(`  Next step: run: node ${SELF_REL}, or add --self-test to prove the absence property discriminates.`);
            return 2;
        }
    }
    if (args.includes('--self-test')) return selfTest();
    let result;
    try {
        result = runChecks(REPO_ROOT);
    } catch (e) {
        console.error(`${NAME}: FAIL -- ${e.message}`);
        return 1;
    }
    const target = `${result.slug.owner}/${result.slug.updatesRepo}`;
    if (result.failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${result.failures.length} problem(s) in the live tree of ${target} (${result.endpoint})`);
        result.failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- ${result.compared} tree path(s) of ${target} hold no functions directory and no root-level worker file, and carry ${REDIRECTS} and a */update.xml descriptor`);
    return 0;
}

// --- self-test --------------------------------------------------------------

const CLEAN = [
    'default/Linux_x86_64-gcc3/update.xml',
    '_redirects',
];

// A getter serving one listing in GitHub's live response shape.
const serveTree = (paths, extra = {}) => ({
    get: () => ({ ok: true, body: { sha: 'fixture', truncated: false, tree: paths.map(path => ({ path, type: 'blob', mode: '100644' })), ...extra } }),
});

function selfTest() {
    let slug;
    try {
        slug = repoSlug(REPO_ROOT);
    } catch (e) {
        console.error(`${NAME}: --self-test FAIL -- the owner and repo do not derive, so no plant would mean anything: ${e.message}`);
        return 1;
    }
    const endpoint = `repos/${slug.owner}/${slug.updatesRepo}/git/trees/${BRANCH}?recursive=1`;

    const baseline = runChecks(REPO_ROOT, { slug, ...serveTree(CLEAN) });
    if (baseline.failures.length > 0 || baseline.compared !== CLEAN.length) {
        console.error(`${NAME}: --self-test FAIL -- the clean fixture tree is not green, so the planted-fault results below would mean nothing:`);
        baseline.failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log(`  ok  baseline: the clean static tree -> green (${baseline.compared} path(s))`);

    let failed = 0;
    // Each plant must go red and name the planted path or the tree endpoint.
    const plants = [
        ['a functions hook file', serveTree([...CLEAN, 'functions/hook.js']), 'functions/hook.js'],
        ['a root-level worker file', serveTree([...CLEAN, '_worker.js']), '_worker.js'],
        ['a nested functions path', serveTree([...CLEAN, 'default/functions/route.js']), 'default/functions/route.js'],
        ['a truncated listing', serveTree(CLEAN, { truncated: true }), endpoint],
        ['a non-array tree', { get: () => ({ ok: true, body: { truncated: false, tree: 'not-a-list' } }) }, endpoint],
        ['an empty listing', serveTree([]), endpoint],
        ['a getter that throws', { get: () => { throw new Error('planted getter fault'); } }, endpoint],
        ['a malformed getter result', { get: () => undefined }, endpoint],
        ['a tree with no _redirects rule', serveTree(CLEAN.filter(p => p !== REDIRECTS)), REDIRECTS],
        ['a tree with no */update.xml descriptor', serveTree(CLEAN.filter(p => !p.endsWith(DESCRIPTOR_SUFFIX))), DESCRIPTOR_SUFFIX],
    ];
    for (const [name, serve, must] of plants) {
        const { failures } = runChecks(REPO_ROOT, { slug, ...serve });
        if (failures.length > 0 && failures.some(f => f.includes(must))) {
            console.log(`  ok  ${name} -> red naming ${must}`);
        } else {
            console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red naming ${must}; got: ${failures.join(' | ') || '(no failures)'}`);
            failed += 1;
        }
    }

    // A non-github release_notes must throw, naming the manifest key.
    try {
        repoSlug(REPO_ROOT, { urls: { release_notes: 'https://gitlab.example/owner/repo/releases' } });
        console.error(`${NAME}: --self-test FAIL -- a non-github release_notes derived a slug instead of throwing`);
        failed += 1;
    } catch (e) {
        if (String(e.message).includes('release_notes')) {
            console.log('  ok  a non-github release_notes host -> throws naming configuration.toml [urls] release_notes');
        } else {
            console.error(`${NAME}: --self-test FAIL -- the non-github throw does not name release_notes: ${e.message}`);
            failed += 1;
        }
    }

    // An unknown argument must exit 2 with a next step. Spawns this file with
    // no network and no gh: the argument guard runs before any read.
    const bogus = spawnSync(process.execPath, [join(REPO_ROOT, SELF_REL), '--bogus'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    if (bogus.status === 2 && String(bogus.stderr).includes('Next step')) {
        console.log("  ok  an unknown argument -> exit 2 with a Next step line");
    } else {
        console.error(`${NAME}: --self-test FAIL -- an unknown argument exited ${bogus.status}, not 2 with a Next step line`);
        failed += 1;
    }

    if (failed > 0) return 1;
    console.log(`${NAME}: --self-test PASS -- the clean tree stayed green and ${plants.length + 2} planted faults each went red naming their path, endpoint or key`);
    return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main());
