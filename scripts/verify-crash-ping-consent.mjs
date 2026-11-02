#!/usr/bin/env node
// scripts/verify-crash-ping-consent.mjs
//
// TEL-09 (Phase 57, plan 57-01): the native crash reporter's Glean crash-ping
// consent read fails closed. The reporter reads the consent pref from the
// profile's prefs.js only, never the installed branding default, so the
// binary-side default is what decides a fresh profile. Five steps:
//
//  1. The crash-ping host is DERIVED at check time from TELEMETRY_SERVER in
//     upstream/toolkit/crashreporter/crashping/src/lib.rs, never a literal
//     kept here. A missing or non-literal constant fails naming lib.rs.
//  2. patches/055-powerbrowser-crash-ping-consent.patch exists, names
//     glean.rs, and equals its regeneration from the applied upstream/
//     (scripts/regenerate-patches.sh --check over that one patch, so the same
//     logic the patches-regenerated row uses decides a hand edit).
//  3. In the applied upstream/ glean.rs, determine_telemetry_enabled carries
//     no `true` literal outside comments: every absent or unreadable input
//     returns false, and only an explicit `true` parsed out of prefs.js
//     enables upload. InitOptions::from_config still takes upload_enabled
//     from it.
//  4. Every branding variant (derived from powerbrowser/branding/*/) pins
//     datareporting.healthreport.uploadEnabled to false, exactly once.
//  5. powerbrowser/endpoint-allowlist.json carries the derived host exactly
//     once, with disposition deny.
//
// send_ping.rs is deliberately not patched: its `upload_enabled: true` runs
// only behind CrashManager's in-process pref check (the branding default
// false), and its --ping-cleanup path takes the value as an argument.
//
// Honestly --quick: text reads plus git plumbing over the existing upstream/
// checkout (required, as for patches-regenerated). No build, browser,
// display or network.
//
// Usage:
//   node scripts/verify-crash-ping-consent.mjs
//   node scripts/verify-crash-ping-consent.mjs --self-test
//
// The self-test runs the unmutated tree green first, then plants seven
// faults in memory (no tracked file is edited): the derivation moved to
// another host, the derivation removed, a fail-open default, the patch
// missing, a hand-edited hunk, a branding default flipped true, and the
// allowlist row widened. Each must go red naming the drifted file.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'verify-crash-ping-consent';
const SELF_REL = 'scripts/verify-crash-ping-consent.mjs';

const args = process.argv.slice(2);
for (const a of args) {
    if (a !== '--self-test') {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
        console.error(`  Next step: run: node ${SELF_REL}, or add --self-test to prove the gate discriminates.`);
        process.exit(2);
    }
}

const LIB_REL = 'upstream/toolkit/crashreporter/crashping/src/lib.rs';
const GLEAN_PATH = 'toolkit/crashreporter/client/app/src/glean.rs';
const GLEAN_REL = `upstream/${GLEAN_PATH}`;
const PATCH_NAME = '055-powerbrowser-crash-ping-consent.patch';
const PATCH_REL = `patches/${PATCH_NAME}`;
const BRANDING_DIR_REL = 'powerbrowser/branding';
const ALLOWLIST_REL = 'powerbrowser/endpoint-allowlist.json';
const REGEN_REL = 'scripts/regenerate-patches.sh';
const CONSENT_FN = 'determine_telemetry_enabled';
const BRANDING_PREF = /^pref\("datareporting\.healthreport\.uploadEnabled",\s*(\w+)\);/gm;

function readText(root, rel) {
    const p = join(root, rel);
    return existsSync(p) ? readFileSync(p, 'utf8') : null;
}

function brandingVariants(root) {
    const dir = join(root, BRANDING_DIR_REL);
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => `${BRANDING_DIR_REL}/${d.name}/pref/firefox-branding.js`)
        .sort();
}

// The patch through the real regeneration check, alone in a scratch patches/
// directory. Returns '' when it equals its regeneration, else the output.
function regenCheck(root, patchText) {
    const dir = mkdtempSync(join(tmpdir(), `${NAME}-`));
    try {
        writeFileSync(join(dir, PATCH_NAME), patchText);
        execFileSync('bash', [join(root, REGEN_REL), '--check', '--upstream', join(root, 'upstream'), '--patches', dir],
            { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
        return '';
    } catch (err) {
        return `${err.stdout ?? ''}${err.stderr ?? ''}`.trim().replaceAll(dir, '<scratch>').replaceAll(root, '.') || String(err.message);
    }
}

// The function body from its signature to the first closing brace in
// column 0, with // comments removed.
function fnBody(text, fn) {
    const start = text.search(new RegExp(`^pub fn ${fn}\\b`, 'm'));
    if (start < 0) return null;
    const end = text.indexOf('\n}', start);
    if (end < 0) return null;
    return text.slice(start, end + 2).replace(/\/\/.*$/gm, '');
}

function runChecks(root, overrides = {}) {
    const read = overrides.read ?? (rel => readText(root, rel));
    const regen = overrides.regen ?? (text => regenCheck(root, text));
    const failures = [];

    // 1. derived host
    let host = null;
    const lib = read(LIB_REL);
    const m = lib?.match(/^const TELEMETRY_SERVER: &str = "https:\/\/([A-Za-z0-9.-]+)\/?";/m);
    if (!m) {
        failures.push(`${LIB_REL}: no literal TELEMETRY_SERVER constant to derive the crash-ping host from (the derivation is gone, or upstream/ is absent). Next step: bash scripts/fetch-upstream.sh && bash scripts/apply-patches.sh, or update this gate to the new upstream source.`);
    } else {
        host = m[1];
    }

    // 2. patch exists, names glean.rs, equals its regeneration
    const patch = read(PATCH_REL);
    if (patch === null) {
        failures.push(`${PATCH_REL}: missing, so the crash-ping consent read is upstream's fail-open default. Next step: restore the patch from git and run bash scripts/apply-patches.sh.`);
    } else if (!patch.includes(`diff --git a/${GLEAN_PATH} b/${GLEAN_PATH}`)) {
        failures.push(`${PATCH_REL}: names no diff for ${GLEAN_PATH}, where the consent read lives.`);
    } else {
        const out = regen(patch);
        if (out) failures.push(`${PATCH_REL}: differs from its regeneration from upstream/ (a hand-edited hunk, or upstream/ not replayed). Next step: bash scripts/apply-patches.sh, then bash ${REGEN_REL}. Output: ${out}`);
    }

    // 3. the applied consent read fails closed
    const glean = read(GLEAN_REL);
    const body = glean === null ? null : fnBody(glean, CONSENT_FN);
    if (body === null) {
        failures.push(`${GLEAN_REL}: no ${CONSENT_FN} function found, so the consent read cannot be checked.`);
    } else {
        if (/\btrue\b/.test(body)) {
            failures.push(`${GLEAN_REL}: ${CONSENT_FN} carries a true literal, so an absent or unreadable consent input enables upload (fail-open default). Next step: bash scripts/apply-patches.sh; if it is applied, ${PATCH_REL} no longer fails closed.`);
        }
        if (!/upload_enabled = determine_telemetry_enabled\(/.test(glean)) {
            failures.push(`${GLEAN_REL}: InitOptions::from_config no longer takes upload_enabled from ${CONSENT_FN}, so the gate above no longer decides upload.`);
        }
    }

    // 4. branding defaults
    const variants = overrides.variants ?? brandingVariants(root);
    if (variants.length === 0) failures.push(`${BRANDING_DIR_REL}: no branding variants found.`);
    for (const rel of variants) {
        const values = [...(read(rel) ?? '').matchAll(BRANDING_PREF)].map(x => x[1]);
        if (values.length !== 1 || values[0] !== 'false') {
            failures.push(`${rel}: datareporting.healthreport.uploadEnabled must be pinned false exactly once; found ${values.length ? values.join(', ') : 'none'}.`);
        }
    }

    // 5. allowlist denies the derived host
    if (host !== null) {
        let rows = null;
        try {
            rows = JSON.parse(read(ALLOWLIST_REL) ?? 'null')?.hosts;
        } catch { /* reported below */ }
        if (!Array.isArray(rows)) {
            failures.push(`${ALLOWLIST_REL}: unreadable or has no hosts array.`);
        } else {
            const hits = rows.filter(r => r.host === host);
            if (hits.length !== 1 || hits[0].disposition !== 'deny') {
                failures.push(`${ALLOWLIST_REL}: the crash-ping host ${host} (derived from ${LIB_REL}) must appear once with disposition deny; found ${hits.map(r => r.disposition).join(', ') || 'no row'}.`);
            }
        }
    }

    return { failures, host, patch, glean, lib, variants };
}

function main() {
    if (args.includes('--self-test')) return selfTest();
    const { failures, host } = runChecks(REPO_ROOT);
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} problem(s) with the crash-ping consent gate.`);
        failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- ${PATCH_REL} equals its regeneration and the applied consent read fails closed; every branding variant pins uploadEnabled false; the derived crash-ping host ${host} is denied`);
    return 0;
}

function selfTest() {
    const baseline = runChecks(REPO_ROOT);
    if (baseline.failures.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- the unmodified tree is already red, so the planted-fault results below would mean nothing:`);
        baseline.failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    const { host, patch, glean, lib, variants } = baseline;
    const movedHost = `moved.${host}`;
    const realRead = rel => readText(REPO_ROOT, rel);
    const swap = (file, text) => rel => (rel === file ? text : realRead(rel));
    const allowlist = JSON.parse(realRead(ALLOWLIST_REL));
    allowlist.hosts = allowlist.hosts.map(r => (r.host === host ? { ...r, disposition: 'allow' } : r));
    const handEdited = patch.replace(/^\+(\s*)return false;$/m, '+$1return false; // edited by hand');
    const failOpen = glean.replace('unwrap_or(false)', 'unwrap_or(true)');

    const plants = [
        ['derivation', LIB_REL, movedHost, { read: swap(LIB_REL, lib.replace(`https://${host}`, `https://${movedHost}`)) }],
        ['derivation-removed', LIB_REL, 'TELEMETRY_SERVER', { read: swap(LIB_REL, lib.replace(/^const TELEMETRY_SERVER.*$/m, '')) }],
        ['fail-open-default', GLEAN_REL, 'fail-open', { read: swap(GLEAN_REL, failOpen) }],
        ['patch-missing', PATCH_REL, 'missing', { read: swap(PATCH_REL, null) }],
        ['hand-edit', PATCH_REL, 'regeneration', { read: swap(PATCH_REL, handEdited) }],
        ['branding-default', variants.at(-1), 'uploadEnabled', { read: swap(variants.at(-1), realRead(variants.at(-1)).replace(/(uploadEnabled",\s*)false/, '$1true')) }],
        ['allowlist-widening', ALLOWLIST_REL, host, { read: swap(ALLOWLIST_REL, JSON.stringify(allowlist)) }],
    ];

    let failed = 0;
    for (const [name, file, marker, overrides] of plants) {
        const planted = overrides.read(file);
        if (planted === realRead(file)) {
            console.error(`${NAME}: --self-test FAIL -- '${name}' planted no fault: ${file} is unchanged.`);
            failed += 1;
            continue;
        }
        const { failures } = runChecks(REPO_ROOT, overrides);
        const text = failures.join(' | ');
        if (failures.some(f => f.includes(file) && f.includes(marker)) && !text.includes(REPO_ROOT)) {
            console.log(`  ok  ${name} -> red, naming '${file}'`);
        } else {
            console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red naming '${file}' and '${marker}'; got: ${text || '(no failures at all)'}`);
            failed += 1;
        }
    }

    if (failed > 0) return 1;
    console.log(`${NAME}: --self-test PASS -- ${plants.length} planted faults went red naming the drifted file, with the unmodified tree green first`);
    return 0;
}

process.exit(main());
