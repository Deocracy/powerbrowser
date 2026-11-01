#!/usr/bin/env node
// scripts/verify-update-download-host.mjs
//
// The update-download host gate (Phase 46, WR-07 owner ruling 2026-10-25, amended
// 2026-10-29). github.com is user-initiated in powerbrowser/endpoint-allowlist.json, so an
// unattended request to it fails the verdict model (scripts/lib/endpoint-verdict.mjs).
// The update descriptor's patchURL (and servedMarUrl) names the R2 primary MAR origin,
// the mar_origin host of configuration.toml [urls], in the form <origin>/<tag>/<asset>
// (owner ruling 2026-10-29). Two forms are therefore red in update-download context: a
// github.com /releases/download/ URL, and a GitHub signed asset URL (on
// release-assets.githubusercontent.com or objects.githubusercontent.com), which expires about an hour after issue, so a static descriptor cannot
// name it. The positive check (the patch URL IS on the MAR origin) belongs to
// verify-channel-live.mjs; this row only refuses the two forbidden forms, and derives
// the origin its next step names from the manifest.
//
// The descriptor is emitted by a later phase (49/50), so this row guards every
// tracked file that could carry one: descriptor templates, generator output and
// fixtures. It reads the tracked tree (git ls-files), skips prose and binaries,
// and fails on either forbidden form that sits in update-download context: on a
// line that names a MAR or a patch, or in a file that does. A release-notes URL (no
// /releases/download/ segment) is not a download and passes. In a verifier script
// (scripts/verify-*.mjs) only the lines of its selfTest function are exempt: the
// self-test fixtures carry the forbidden forms as literals by design. The rest of a
// verifier, data files and every other script stay scanned.
//
// Usage:
//   node scripts/verify-update-download-host.mjs
//   node scripts/verify-update-download-host.mjs --self-test
//
// Exit 0 pass, 1 fail. --self-test plants a descriptor template, a generator
// output and a fixture carrying the github.com form, a descriptor template carrying
// the release-assets form, one carrying the objects.githubusercontent.com form, a non-verifier script carrying the github form, and a
// verifier script carrying it outside its selfTest function, and requires each to go
// red naming the file and the manifest's MAR origin; three controls (a release-notes
// URL, a patch URL on the MAR origin, and a verifier script carrying the github form
// inside its selfTest function) must stay green.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { marOrigin, resolveConfig } from './generate.mjs';
import { repoSlug } from './verify-repo-controls.mjs';

const SELF = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(SELF), '..');
const NAME = 'update-download-host';
const SELF_REL = 'scripts/verify-update-download-host.mjs';
const CONSTRAINT = 'the constraint is recorded in .planning/workstreams/deploy/phases/49-release-pipeline-and-legion-runner-e/49-CONTEXT.md and 46-VERIFICATION.md';

const args = process.argv.slice(2);
for (const a of args) {
    if (a !== '--self-test') {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
        console.error(`  Next step: run: node ${SELF_REL}, or add --self-test to prove the host rule discriminates.`);
        process.exit(2);
    }
}

// A github.com Releases DOWNLOAD URL (the asset path), not a releases page.
const GITHUB_DOWNLOAD = /https?:\/\/github\.com\/[^\s"'<>]+\/releases\/download\//i;
// A GitHub signed asset URL (release-assets or objects host): the redirect target, expiring about an hour after issue.
const RELEASE_ASSETS = /https?:\/\/(?:release-assets|objects)\.githubusercontent\.com\//i;
// Verifier scripts carry the forbidden forms as self-test fixtures by design, inside their selfTest function.
const VERIFIER = /^scripts\/verify-[^/]*\.mjs$/;
const SELF_TEST_START = /^(?:async\s+)?function\s+selfTest\s*\(/;
// Update-download context: a MAR, a patch, a descriptor, or the update XML.
const UPDATE_CONTEXT = /\.mar\b|patchURL|servedMarUrl|<patch\b|update\.xml/i;
// Prose, binaries and lockfiles are not descriptors, templates or fixtures.
const SKIP = [
    /^\.planning\//,
    /^docs\//,
    /^upstream\//,
    /^theia\/yarn\.lock$/,
    /\.(png|jpe?g|gif|ico|icns|svg|woff2?|ttf|otf|tar|gz|xz|zip|mar|bin)$/i,
];

function listTracked(root) {
    try {
        return execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
            .split('\n')
            .map(l => l.trim())
            .filter(l => l !== '');
    } catch {
        return null;
    }
}

function readText(root, rel) {
    try {
        return readFileSync(join(root, rel), 'utf8');
    } catch {
        return null;
    }
}

/** The write-once MAR origin of configuration.toml [urls] mar_origin, or null when the manifest does not resolve. */
function manifestMarOrigin(root) {
    try {
        const { config } = resolveConfig(join(root, 'configuration.toml'));
        return config === undefined ? null : marOrigin(config);
    } catch {
        return null;
    }
}

/** The file:line hits of a forbidden download URL (github.com or release-assets) in update-download context. */
export function githubDownloadHits(files, read) {
    const hits = [];
    for (const rel of files) {
        if (SKIP.some(re => re.test(rel))) continue;
        const text = read(rel);
        if (text === null || text === undefined) continue;
        const fileIsUpdate = UPDATE_CONTEXT.test(text);
        const verifier = VERIFIER.test(rel);
        let inSelfTest = false;
        text.split('\n').forEach((line, i) => {
            // shortcut: the selfTest region ends at the first column-0 '}', the house style; upgrade to a parser if a verifier breaks it.
            if (verifier && SELF_TEST_START.test(line)) inSelfTest = true;
            if (!inSelfTest && (GITHUB_DOWNLOAD.test(line) || RELEASE_ASSETS.test(line)) && (fileIsUpdate || UPDATE_CONTEXT.test(line))) {
                hits.push(`${rel}:${i + 1}`);
            }
            if (inSelfTest && /^}/.test(line)) inSelfTest = false;
        });
    }
    return hits;
}

export function runChecks(root, overrides = {}) {
    const files = overrides.files ?? listTracked(root);
    if (files === null) {
        return { failures: [`git ls-files could not list the tracked tree, so no descriptor, template or fixture can be proven free of a forbidden update download. Next step: run this row inside the git worktree.`] };
    }
    const read = overrides.read ?? ((rel) => readText(root, rel));
    const hits = githubDownloadHits(files, read);
    const origin = manifestMarOrigin(root) ?? 'named by configuration.toml [urls] mar_origin';
    const failures = hits.map(h => `${h} names a github.com /releases/download/ URL or a GitHub signed asset URL as an update download. github.com is user-initiated and the signed asset URL expires within an hour, so an unattended update fetch would fail. Next step: point patchURL and servedMarUrl at the R2 primary MAR origin ${origin} (configuration.toml [urls] mar_origin, owner ruling 2026-10-29), in the form <origin>/<tag>/<asset>; ${CONSTRAINT}.`);
    return { failures, files: files.length };
}

function main() {
    if (args.includes('--self-test')) return selfTest();
    const { failures, files } = runChecks(REPO_ROOT);
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} tracked line(s) name a forbidden update download.`);
        failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- no tracked descriptor, template, generator output or fixture (${files} tracked file(s) read) names a github.com /releases/download/ URL or a GitHub signed asset URL as an update download`);
    return 0;
}

function selfTest() {
    const real = listTracked(REPO_ROOT);
    if (real === null) {
        console.error(`${NAME}: --self-test FAIL -- git ls-files failed, so the control is unproven.`);
        return 1;
    }
    const cache = new Map();
    const realRead = (rel) => {
        if (!cache.has(rel)) cache.set(rel, readText(REPO_ROOT, rel));
        return cache.get(rel);
    };
    const baseline = runChecks(REPO_ROOT, { files: real, read: realRead });
    if (baseline.failures.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- the unmodified tree is already red:`);
        baseline.failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log(`  ok  baseline -> green (${baseline.files} tracked file(s))`);

    // In-memory synthetic files: nothing is written to the tree. The repo is configuration.toml's (repoSlug), never a literal.
    const { owner, repo } = repoSlug(REPO_ROOT);
    const R = `${owner}/${repo}`;
    const fixtures = {
        'theia/extensions/tab-uris/fixtures/update.xml.tmpl': `<updates><update appVersion="{{v}}"><patch type="complete" URL="https://github.com/${R}/releases/download/{{tag}}/powerbrowser.mar"/></update></updates>\n`,
        'scripts/generated-update-descriptor.json': `{\n  "servedMarUrl": "https://github.com/${R}/releases/download/v1.0.0/powerbrowser-1.0.0.mar"\n}\n`,
        'powerbrowser/branding/release/fixtures/patch-manifest.json': `{ "patchURL": "https://github.com/${R}/releases/download/v1.0.0/x.mar" }\n`,
        'powerbrowser/packaging/update-xml.tmpl': '<updates><update><patch URL="https://release-assets.githubusercontent.com/github-production-release-asset/1/x.mar"/></update></updates>\n',
        'powerbrowser/packaging/update-objects.xml.tmpl': '<updates><update><patch URL="https://objects.githubusercontent.com/github-production-release-asset-2e65be/1/x.mar"/></update></updates>\n',
        'control/release-notes-link.json': `{ "app.releaseNotesURL": "https://github.com/${R}/releases" }\n`,
        'control/mar-origin-patch.xml': `<updates><update><patch URL="${manifestMarOrigin(REPO_ROOT)}/v1.0.0-1/x.mar"/></update></updates>\n`,
        'scripts/build-planted-descriptor.mjs': `const patchURL = 'https://github.com/${R}/releases/download/v1.0.0/x.mar';\n`,
        'scripts/verify-planted-outside.mjs': `const BAD = 'patchURL https://github.com/${R}/releases/download/v1.0.0/x.mar';\nfunction selfTest() {\n    return 0;\n}\n`,
        'scripts/verify-planted-fixture.mjs': `export const servedMarUrl = 'https://downloads.example.invalid/x.mar';\nfunction selfTest() {\n    const BAD = 'patchURL https://github.com/${R}/releases/download/v1.0.0/x.mar';\n    return BAD;\n}\n`,
    };
    const planted = (rels) => ({ files: [...real, ...rels], read: (rel) => (rel in fixtures ? fixtures[rel] : realRead(rel)) });

    let failed = 0;
    const plants = [
        ['descriptor template names the github.com download', 'theia/extensions/tab-uris/fixtures/update.xml.tmpl'],
        ['generator output names the github.com download', 'scripts/generated-update-descriptor.json'],
        ['fixture names the github.com download as patchURL', 'powerbrowser/branding/release/fixtures/patch-manifest.json'],
        ['descriptor template names a release-assets download', 'powerbrowser/packaging/update-xml.tmpl'],
        ['descriptor template names an objects.githubusercontent.com download', 'powerbrowser/packaging/update-objects.xml.tmpl'],
        ['non-verifier script names the github.com download as patchURL', 'scripts/build-planted-descriptor.mjs'],
        ['verifier script names the github.com download outside its selfTest function', 'scripts/verify-planted-outside.mjs'],
    ];
    for (const [name, rel] of plants) {
        const { failures } = runChecks(REPO_ROOT, planted([rel]));
        // The guidance must send the reader to the manifest's MAR origin, never to the release-assets host.
        const origin = manifestMarOrigin(REPO_ROOT);
        const hit = failures.find(f => f.includes(rel));
        if (hit !== undefined && origin !== null && hit.includes(origin) && !hit.includes('release-assets.')) {
            console.log(`  ok  ${name} -> red naming ${rel} and the MAR origin ${origin}`);
        } else {
            console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red naming ${rel}; got: ${failures.join(' | ') || '(no failures)'}`);
            failed += 1;
        }
    }
    const controls = ['control/release-notes-link.json', 'control/mar-origin-patch.xml', 'scripts/verify-planted-fixture.mjs'];
    for (const rel of controls) {
        const { failures } = runChecks(REPO_ROOT, planted([rel]));
        if (failures.length === 0) {
            console.log(`  ok  control ${rel} -> green`);
        } else {
            console.error(`${NAME}: --self-test FAIL -- control ${rel} went red: ${failures.join(' | ')}`);
            failed += 1;
        }
    }

    if (failed > 0) return 1;
    console.log(`${NAME}: --self-test PASS -- ${plants.length} planted forbidden download(s) went red naming their file, and ${controls.length} controls stayed green`);
    return 0;
}

process.exit(main());
