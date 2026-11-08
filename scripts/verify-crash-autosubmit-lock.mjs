#!/usr/bin/env node
// scripts/verify-crash-autosubmit-lock.mjs
//
// TEL-13 prerequisite (Phase 57, plan 57-05; BLOCKED.md B6, review WR-05): the
// stock browser can submit backlogged crash reports without the per-crash
// dialog when browser.crashReports.unsubmittedCheck.autoSubmit2 is true (the
// backlog notification's remember-my-choice and the settings checkbox both set
// it). The shipped policies lock it false. Three steps:
//
//  1. The pref name(s) are DERIVED at check time from the `get autoSubmit()`
//     getter of UnsubmittedCrashHandler in
//     upstream/browser/modules/ContentCrashHandlers.sys.mjs, never a literal
//     kept here. A getter with no browser.crashReports.unsubmittedCheck.autoSubmit*
//     string fails naming that file.
//  2. powerbrowser/distribution/policies.json (copied verbatim into every
//     package) carries policies.Preferences[<name>] = { Value: false,
//     Status: "locked" } for every derived name.
//  3. Policies.sys.mjs still lets the Preferences policy set the name (one of
//     its allowedPrefixes is a prefix of it); otherwise the engine drops the
//     entry and the lock is void.
//
// The lock lives in policies, not the branding pref file: D-84 keeps every
// branding pref unlocked, and those files are the Phase 1 comparands.
//
// Honestly --quick: text reads over the existing upstream/ checkout. No build,
// browser, display or network.
//
// Usage:
//   node scripts/verify-crash-autosubmit-lock.mjs
//   node scripts/verify-crash-autosubmit-lock.mjs --self-test

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'verify-crash-autosubmit-lock';
const SELF_REL = 'scripts/verify-crash-autosubmit-lock.mjs';

const args = process.argv.slice(2);
for (const a of args) {
    if (a !== '--self-test') {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
        console.error(`  Next step: run: node ${SELF_REL}, or add --self-test to prove the gate discriminates.`);
        process.exit(2);
    }
}

const READER_REL = 'upstream/browser/modules/ContentCrashHandlers.sys.mjs';
const ENGINE_REL = 'upstream/browser/components/enterprisepolicies/Policies.sys.mjs';
const POLICIES_REL = 'powerbrowser/distribution/policies.json';
const NAME_RE = /"(browser\.crashReports\.unsubmittedCheck\.autoSubmit\w*)"/g;

function readText(root, rel) {
    const p = join(root, rel);
    return existsSync(p) ? readFileSync(p, 'utf8') : null;
}

function runChecks(root, overrides = {}) {
    const read = overrides.read ?? (rel => readText(root, rel));
    const failures = [];

    // 1. derived names, from the getter that decides auto-submit
    const reader = read(READER_REL);
    const getter = reader?.match(/^\s*get autoSubmit\(\)\s*\{[\s\S]*?^\s*\},?$/m)?.[0] ?? '';
    const names = [...new Set([...getter.matchAll(NAME_RE)].map(m => m[1]))];
    if (names.length === 0) {
        failures.push(`${READER_REL}: no get autoSubmit() getter reading a browser.crashReports.unsubmittedCheck.autoSubmit* pref (the derivation is gone, or upstream/ is absent). Next step: bash scripts/fetch-upstream.sh && bash scripts/apply-patches.sh, or find the new auto-submit reader and update this gate.`);
    }

    // 2. each derived name is locked false in the shipped policies
    let prefs = null;
    try {
        prefs = JSON.parse(read(POLICIES_REL) ?? 'null')?.policies?.Preferences ?? {};
    } catch { /* reported below */ }
    if (prefs === null) {
        failures.push(`${POLICIES_REL}: unreadable or not JSON.`);
    } else {
        for (const n of names) {
            const e = prefs[n];
            if (e?.Value !== false || e?.Status !== 'locked') {
                failures.push(`${POLICIES_REL}: policies.Preferences["${n}"] (read by ${READER_REL}) must be { "Value": false, "Status": "locked" }; found ${JSON.stringify(e ?? null)}. Without it a user or onboarding click turns on unattended crash-report submission.`);
            }
        }
    }

    // 3. the policy engine accepts the names
    const engine = read(ENGINE_REL);
    const block = engine?.match(/let allowedPrefixes = \[([\s\S]*?)\];/)?.[1];
    if (!block) {
        failures.push(`${ENGINE_REL}: no allowedPrefixes list found for the Preferences policy, so the lock cannot be shown to apply.`);
    } else {
        const prefixes = [...block.matchAll(/"([^"]+)"/g)].map(m => m[1]);
        for (const n of names) {
            if (!prefixes.some(p => n.startsWith(p))) {
                failures.push(`${ENGINE_REL}: the Preferences policy allows no prefix of ${n}, so the engine ignores its lock in ${POLICIES_REL}.`);
            }
        }
    }

    return { failures, names, reader, engine };
}

function main() {
    if (args.includes('--self-test')) return selfTest();
    const { failures, names } = runChecks(REPO_ROOT);
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} problem(s) with the crash auto-submit lock.`);
        failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- ${POLICIES_REL} locks ${names.join(', ')} (derived from ${READER_REL}) false, and the policy engine accepts it`);
    return 0;
}

function selfTest() {
    const baseline = runChecks(REPO_ROOT);
    if (baseline.failures.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- the unmodified tree is already red, so the planted-fault results below would mean nothing:`);
        baseline.failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    const { names, reader, engine } = baseline;
    const n = names[0];
    const realRead = rel => readText(REPO_ROOT, rel);
    const swap = (file, text) => rel => (rel === file ? text : realRead(rel));
    const policies = realRead(POLICIES_REL);
    const editPolicies = f => { const j = JSON.parse(policies); f(j.policies.Preferences); return JSON.stringify(j, null, 2); };
    const renamed = `${n}x`;

    const plants = [
        ['lock-removed', POLICIES_REL, n, { read: swap(POLICIES_REL, editPolicies(p => delete p[n])) }],
        ['not-locked', POLICIES_REL, 'locked', { read: swap(POLICIES_REL, editPolicies(p => { p[n].Status = 'default'; })) }],
        ['value-true', POLICIES_REL, 'Value', { read: swap(POLICIES_REL, editPolicies(p => { p[n].Value = true; })) }],
        ['reader-renamed', POLICIES_REL, renamed, { read: swap(READER_REL, reader.replaceAll(`"${n}"`, `"${renamed}"`)) }],
        ['reader-removed', READER_REL, 'get autoSubmit()', { read: swap(READER_REL, reader.replace(/get autoSubmit\(\)/, 'get autoSubmitGone()')) }],
        ['prefix-dropped', ENGINE_REL, n, { read: swap(ENGINE_REL, engine.replace(/(let allowedPrefixes = \[[\s\S]*?)"browser\.",/, '$1')) }],
    ];

    let failed = 0;
    for (const [name, file, marker, overrides] of plants) {
        const planted = overrides.read(file) === realRead(file) && overrides.read(READER_REL) === reader;
        if (planted) {
            console.error(`${NAME}: --self-test FAIL -- '${name}' planted no fault.`);
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
