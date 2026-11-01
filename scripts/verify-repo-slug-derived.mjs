#!/usr/bin/env node
// scripts/verify-repo-slug-derived.mjs
//
// The repository-slug gate (workstream deploy, 2026-10-31). The live GitHub organisation is the
// owner named by configuration.toml [urls] release_notes. A second organisation also holds a
// powerbrowser repository, so a hand-typed owner silently points at the wrong one. Every tracked
// code file, workflow and generated output must either derive the owner (repoSlug, or
// ${{ github.repository }} in a workflow) or carry exactly the derived one.
//
// Scope: every tracked file (git ls-files) except prose (*.md), the brand inventory (the one file
// that may name any token), and the historical records (.planning/, ledger/), which hold evidence
// URLs as they were at the time and are never edited by hand. Binaries are skipped. A slug is a
// github.com/<owner>/<repo>... or repos/<owner>/<repo>... reference whose repo is the derived repo
// (or a repo named after it, such as the updates repo); a placeholder owner (${OWNER}, {owner},
// <owner>) is not a literal and is not matched.
//
// The expectation is derived at check time (repoSlug over configuration.toml), never kept in a list.
//
// Usage:
//   node scripts/verify-repo-slug-derived.mjs
//   node scripts/verify-repo-slug-derived.mjs --self-test
//
// Exit 0 pass, 1 fail. --self-test requires the real tree green first, then plants wrong-owner
// literals (a script, a workflow API path, a generated pref, an updates-repo link) and a manifest
// that names the other organisation, and requires each to go red naming the file and the literal;
// controls (the derived owner, a placeholder owner, prose, the inventory) must stay green.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { repoSlug } from './verify-repo-controls.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'repo-slug-derived';
const EXEMPT = rel => rel.endsWith('.md') || rel === 'inventory/brand-tokens.json'
    || rel.startsWith('.planning/') || rel.startsWith('ledger/');
const NEXT_STEP = 'Next step: take the repository from configuration.toml in a script or generator (and regenerate its output), or from the workflow\'s own repository context in a workflow, instead of writing the owner out.';
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function listTracked(root) {
    return execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
        .split('\n').filter(l => l !== '');
}

function readText(root, rel) {
    let buf;
    try {
        buf = readFileSync(join(root, rel));
    } catch {
        return null; // a tracked path deleted in the working tree, or a directory symlink
    }
    return buf.includes(0) ? null : buf.toString('utf8');
}

/** Pure over its inputs: every wrong-owner slug literal in the scoped files, each a failure line. */
export function runChecks({ files, read, slug }) {
    const re = new RegExp(`(?:github\\.com/|\\brepos/)([A-Za-z0-9][A-Za-z0-9-]*)/${escape(slug.repo)}\\b[A-Za-z0-9_./-]*`, 'g');
    const failures = [];
    let scanned = 0;
    for (const rel of files) {
        if (EXEMPT(rel)) continue;
        const text = read(rel);
        if (text === null) continue;
        scanned++;
        text.split('\n').forEach((line, i) => {
            for (const m of line.matchAll(re)) {
                if (m[1] === slug.owner) continue;
                failures.push(`${rel}:${i + 1} carries ${m[0]}, whose owner ${m[1]} is not ${slug.owner}, the owner configuration.toml names for ${slug.owner}/${slug.repo}. ${NEXT_STEP}`);
            }
        });
    }
    return { failures, scanned };
}

function main() {
    const slug = repoSlug(REPO_ROOT);
    const { failures, scanned } = runChecks({ files: listTracked(REPO_ROOT), read: rel => readText(REPO_ROOT, rel), slug });
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} hand-typed repository owner(s) differ from configuration.toml:`);
        failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- every github.com repository reference in ${scanned} tracked code, workflow and generated file(s) names ${slug.owner}/${slug.repo}, the repository configuration.toml names`);
    return 0;
}

function selfTest() {
    const slug = repoSlug(REPO_ROOT);
    const real = listTracked(REPO_ROOT);
    const realRead = rel => readText(REPO_ROOT, rel);
    const baseline = runChecks({ files: real, read: realRead, slug });
    if (baseline.failures.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- the unmodified tree is already red:`);
        baseline.failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log(`  ok  baseline -> green (${baseline.scanned} file(s))`);

    // Built from parts so this file carries no wrong-owner literal of its own.
    const W = 'Planted-Other-Org';
    const R = slug.repo;
    const plants = [
        ['a script with a hand-typed owner', 'scripts/planted-release.mjs', `const URL = 'https://github.com/${W}/${R}/releases';\n`, `github.com/${W}/${R}/releases`],
        ['a workflow API path with a hand-typed owner', '.github/workflows/planted.yml', `      - run: gh api repos/${W}/${R}/actions/runs\n`, `repos/${W}/${R}/actions/runs`],
        ['a generated pref with a hand-typed owner', 'powerbrowser/branding/planted/pref/firefox-branding.js', `pref("app.releaseNotesURL", "https://github.com/${W}/${R}/releases");\n`, `github.com/${W}/${R}/releases`],
        ['an updates-repo link with a hand-typed owner', 'website-staging/planted.html', `<a href="https://github.com/${W}/${R}-updates">x</a>\n`, `github.com/${W}/${R}-updates`],
        ['a workflow staged under docs/ with a hand-typed owner', 'docs/planted.yml', `url: https://github.com/${W}/${R}\n`, `github.com/${W}/${R}`],
    ];
    const controls = [
        ['the derived owner', 'scripts/planted-control.mjs', `const URL = 'https://github.com/${slug.owner}/${R}/releases';\n`],
        ['a placeholder owner', 'scripts/planted-placeholder.mjs', 'const URL = `https://github.com/${OWNER}/' + R + '/releases`; // {owner} <owner>\n'],
        ['prose naming another owner', 'docs/planted.md', `See https://github.com/${W}/${R}.\n`],
        ['the brand inventory naming another owner', 'inventory/brand-tokens.json', `{ "token": "github.com/${W}/${R}" }\n`],
        ['a different repository under another owner', 'scripts/planted-other.mjs', `const URL = 'https://github.com/${W}/${R}x-unrelated';\n`],
    ];
    const planted = (rel, text) => ({
        files: [...real.filter(r => r !== rel), rel],
        read: r => (r === rel ? text : realRead(r)),
        slug,
    });
    let failed = 0;
    for (const [name, rel, text, literal] of plants) {
        const { failures } = runChecks(planted(rel, text));
        const hit = failures.find(f => f.startsWith(`${rel}:`) && f.includes(literal) && f.includes('Next step:'));
        if (failures.length === 1 && hit) console.log(`  ok  ${name} -> red, naming ${rel} and ${literal}`);
        else { failed++; console.error(`  FAIL  ${name}: expected one red naming ${rel} and ${literal}, got ${JSON.stringify(failures)}`); }
    }
    for (const [name, rel, text] of controls) {
        const { failures } = runChecks(planted(rel, text));
        if (failures.length === 0) console.log(`  ok  control ${name} -> green`);
        else { failed++; console.error(`  FAIL  control ${name} went red: ${JSON.stringify(failures)}`); }
    }
    // Derived, not hand-kept: a manifest naming another owner turns the tree's own literals red.
    const moved = runChecks({ files: real, read: realRead, slug: { ...slug, owner: W } });
    if (moved.failures.length > 0 && moved.failures.every(f => f.includes(`owner ${slug.owner} is not ${W}`))) {
        console.log(`  ok  a manifest naming another owner -> red (${moved.failures.length} tree literal(s))`);
    } else { failed++; console.error(`  FAIL  a manifest naming another owner did not turn the tree red: ${JSON.stringify(moved.failures.slice(0, 3))}`); }

    if (failed > 0) {
        console.error(`${NAME}: --self-test FAIL -- ${failed} case(s) did not behave`);
        return 1;
    }
    console.log(`${NAME}: --self-test PASS -- ${plants.length + 1} planted wrong owner(s) went red naming the file and the literal, and ${controls.length} controls stayed green`);
    return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    let rc;
    try {
        rc = process.argv.includes('--self-test') ? selfTest() : main();
    } catch (e) {
        console.error(`${NAME}: FAIL -- broken instrument: ${e.message}`);
        rc = 1;
    }
    process.exit(rc);
}
