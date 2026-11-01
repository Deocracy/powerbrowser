#!/usr/bin/env node
// scripts/verify-theia-endpoints.mjs
//
// The endpoint-allowlist coverage gate (04-04, TEL-03): every host the
// manifest names -- the [telemetry] endpoint, the [urls] values, the
// support URL -- is present in powerbrowser/endpoint-allowlist.json, so
// verify-endpoints.sh layers 1+3 stay green for an arbitrary downstream,
// and the manifest-driven pref expects stay in sync with the allowlist.
//
// WHAT IT ASSERTS. Every expectation is DERIVED at check time -- from the
// manifest through scripts/generate.mjs's own resolver and derivation --
// never kept here:
//
//  1. generated/endpoint-hosts.json parses and equals what the manifest
//     derives right now (a drifted host list fails naming the fragment).
//     Absent fragment SKIPS this step only: generated/ is git-ignored, so
//     that is the state of every fresh clone, and a gate red on it would
//     be a gate its readers skip (generate-check's own rule).
//  2. Every derived host is PRESENT in the allowlist's `hosts` array --
//     any disposition counts as present (the shipped support and release-notes
//     hosts are `user-initiated`: prefetch is disabled, so an unattended
//     observation is a failure, yet the host is tracked). A missing host fails NAMING it: the
//     fix is to add an entry, not to edit the manifest down.
//  3. Stale marked entries fail NAMING them. An allowlist host carrying a
//     `manifest` field (the dotted manifest key it was added for, e.g.
//     "telemetry.endpoint") must equal the current host of that key: a key
//     since unset, or repointed elsewhere, makes the entry stale. Entries
//     WITHOUT the field are out of this check's scope -- they are owned by
//     the BRAND-04 product decisions (D-83..D-88) and layer 3, not by the
//     manifest. The shipped allowlist marks github.com with
//     "urls.release_notes" (UPD-13).
//  4. The allowlist's `expect` entries for the two manifest-driven prefs
//     (toolkit.telemetry.server, breakpad.reportURL) equal what the
//     manifest derives right now. This is the single-source agreement the
//     plan requires: scripts/generate.mjs owns the derivation
//     (mozillaEndpointPrefs); verify-endpoints.sh layer 1 compares the
//     INSTALLED pref files against these same `expect` values, so without
//     this step the two gates could disagree -- one reading the manifest,
//     the other a stale allowlist. A drift fails NAMING the pref.
//
// Honestly --quick: it reads text files off disk only. No build, no
// browser, no display, no network. Layer 1 itself still needs the built
// binary, which is why this gate exists: disagreement goes red here in
// seconds rather than after a tier-3 build.
//
// Usage:
//   node scripts/verify-theia-endpoints.mjs
//   node scripts/verify-theia-endpoints.mjs --self-test
//
// The self-test plants two faults and requires each to go red: a manifest
// endpoint host absent from the allowlist (naming the host -- proves the
// check reads the manifest, not a copy of the allowlist), and a marked
// allowlist entry covering no manifest host (naming the entry). Each runs
// with the unmutated control green first, so a red is plant-caused.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { emitEndpointHosts, manifestEndpointHosts, manifestEndpointSources, mozillaEndpointPrefs, resolveConfig } from './generate.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'verify-theia-endpoints';

const args = process.argv.slice(2);
const SELF_TEST = args.includes('--self-test');
for (const a of args) {
    if (a !== '--self-test') {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
        process.exit(2);
    }
}

const MANIFEST_REL = 'configuration.toml';
const FRAGMENT_REL = 'generated/endpoint-hosts.json';
const ALLOWLIST_REL = 'powerbrowser/endpoint-allowlist.json';
const RERUN_GENERATE = 'node scripts/generate.mjs';

function readJson(root, rel, failures) {
    const p = join(root, rel);
    if (!existsSync(p)) return { found: false, value: null };
    try {
        return { found: true, value: JSON.parse(readFileSync(p, 'utf8')) };
    } catch {
        failures.push(`${rel} is not valid JSON, so it cannot be compared. Next step: restore it from version control, then re-run this check.`);
        return { found: true, value: null };
    }
}

function runChecks(root) {
    const failures = [];
    const skipped = [];

    // --- 0. the manifest resolves -----------------------------------------
    const { failures: resolveFailures, config } = resolveConfig(join(root, MANIFEST_REL), undefined);
    if (resolveFailures.length > 0) {
        for (const f of resolveFailures) failures.push(`${MANIFEST_REL} is red, so the endpoint coverage proves nothing: ${f}`);
        return { failures, skipped };
    }
    const expectedHosts = manifestEndpointHosts(config);
    const sources = manifestEndpointSources(config);
    const hostOfPath = new Map(sources.map(s => [s.path, s.host]));

    // --- 1. the generated fragment -----------------------------------------
    const fragmentBytes = join(root, FRAGMENT_REL);
    if (!existsSync(fragmentBytes)) {
        skipped.push(`${FRAGMENT_REL} is absent (nothing generated in this copy yet) -- fragment equality unchecked; run ${RERUN_GENERATE} to cover it.`);
    } else {
        let fragment;
        try {
            fragment = JSON.parse(readFileSync(fragmentBytes, 'utf8'));
        } catch {
            failures.push(`${FRAGMENT_REL} is not valid JSON, so it cannot be compared against ${MANIFEST_REL}. Next step: run ${RERUN_GENERATE} to rewrite it, then re-run this check.`);
            fragment = null;
        }
        if (fragment !== null && JSON.stringify(fragment) !== JSON.stringify(expectedHosts)) {
            failures.push(`${FRAGMENT_REL} is ${JSON.stringify(fragment)} but ${MANIFEST_REL} derives ${JSON.stringify(expectedHosts)} -- stale output. Next step: run ${RERUN_GENERATE}, then re-run this check.`);
        }
    }

    // --- the allowlist parses ------------------------------------------------
    const allowRead = readJson(root, ALLOWLIST_REL, failures);
    if (!allowRead.found) {
        failures.push(`${ALLOWLIST_REL} does not exist, so endpoint coverage cannot be checked at all.`);
        return { failures, skipped };
    }
    if (allowRead.value === null) return { failures, skipped };
    const allowHosts = Array.isArray(allowRead.value.hosts) ? allowRead.value.hosts : null;
    const allowPrefs = Array.isArray(allowRead.value.prefs) ? allowRead.value.prefs : null;
    if (allowHosts === null) {
        failures.push(`${ALLOWLIST_REL} carries no hosts array, so endpoint coverage cannot be checked at all.`);
        return { failures, skipped };
    }
    if (allowPrefs === null) {
        failures.push(`${ALLOWLIST_REL} carries no prefs array, so pref agreement cannot be checked at all.`);
        return { failures, skipped };
    }
    const listed = new Set(allowHosts.map(h => h?.host).filter(h => typeof h === 'string'));

    // --- 2. every manifest host is covered -----------------------------------
    for (const host of expectedHosts) {
        if (!listed.has(host)) {
            failures.push(
                `${host} is named by ${MANIFEST_REL} but present in no ${ALLOWLIST_REL} entry -- the build would contact a host no gate tracks. `
                + `Next step: add a hosts entry for it (with a hand-authored reason and, where it is manifest-derived, a "manifest" field naming the dotted key), then re-run this check.`,
            );
        }
    }

    // --- 3. marked entries still cover their manifest key --------------------
    for (const entry of allowHosts) {
        if (entry === null || typeof entry !== 'object' || typeof entry.manifest !== 'string') continue;
        const current = hostOfPath.get(entry.manifest);
        if (current === undefined) {
            failures.push(
                `${ALLOWLIST_REL} entry ${JSON.stringify(entry.host)} is marked for manifest key ${JSON.stringify(entry.manifest)}, but ${MANIFEST_REL} no longer states that key -- stale coverage. `
                + `Next step: remove the entry or repoint the manifest key, then re-run this check.`,
            );
        } else if (entry.host !== current) {
            failures.push(
                `${ALLOWLIST_REL} entry ${JSON.stringify(entry.host)} is marked for manifest key ${JSON.stringify(entry.manifest)}, but that key now names ${JSON.stringify(current)} -- stale coverage. `
                + `Next step: update the entry to the current host, then re-run this check.`,
            );
        }
    }

    // --- 4. the manifest-driven pref expects agree ---------------------------
    for (const { name, value } of mozillaEndpointPrefs(config)) {
        const entry = allowPrefs.find(p => p?.name === name);
        if (entry === undefined) {
            failures.push(
                `${ALLOWLIST_REL} carries no prefs entry for ${JSON.stringify(name)}, but ${MANIFEST_REL} drives that pref -- layer 1 would stop asserting it. `
                + `Next step: add the entry with the derived expect, then re-run this check.`,
            );
        } else if (JSON.stringify(entry.expect) !== JSON.stringify(value)) {
            failures.push(
                `${ALLOWLIST_REL} expects ${JSON.stringify(name)} = ${JSON.stringify(entry.expect)} but ${MANIFEST_REL} derives ${JSON.stringify(value)} -- the two endpoint gates disagree. `
                + `Next step: update the expect to the derived value (it tracks the manifest; the derivation lives in scripts/generate.mjs), then re-run this check.`,
            );
        }
    }

    return { failures, skipped };
}

function main() {
    const { failures, skipped } = runChecks(REPO_ROOT);
    for (const s of skipped) console.log(`${NAME}: SKIP -- ${s}`);
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} problem(s)`);
        for (const f of failures) console.error(`  - ${f}`);
        process.exit(1);
    }
    console.log(`${NAME}: PASS -- every manifest host is allowlisted and the driven prefs agree`);
}

function copyInto(root, rel) {
    const dest = join(root, rel);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(join(REPO_ROOT, rel), dest);
}

function selfTest() {
    let failed = 0;
    const complain = (name, why) => {
        console.error(`${NAME}: --self-test FAIL -- '${name}' ${why}`);
        failed += 1;
    };

    // Green control first: the unmutated tree proves nothing if red.
    const control = runChecks(REPO_ROOT);
    if (control.failures.length > 0) {
        complain('unmutated control', `is already red, so the plants below would mean nothing: ${control.failures.join(' | ')}`);
    } else {
        console.log(`  ok  unmutated control -> coverage green`);
    }

    // Plant 1: a manifest endpoint host absent from the allowlist must go
    // red NAMING the host -- proves the check reads the manifest, not a
    // copy of the allowlist. The fixture fragment is written from the
    // derivation so the fragment half stays green and only the coverage
    // half fires.
    {
        const dir = mkdtempSync(join(tmpdir(), 'theia-endpoints-selftest-'));
        try {
            copyInto(dir, ALLOWLIST_REL);
            // The manifest states the events endpoint at level off (TEL-06), so the plant swaps that host.
            const manifestText = readFileSync(join(REPO_ROOT, MANIFEST_REL), 'utf8')
                .replace('endpoint = "https://events.powerbrowser.org/events"', 'endpoint = "https://absent.example.org/v1/events"');
            if (manifestText === readFileSync(join(REPO_ROOT, MANIFEST_REL), 'utf8')) {
                complain('absent endpoint host', 'planted no fault at all: the manifest edit did not land');
            } else {
                writeFileSync(join(dir, MANIFEST_REL), manifestText, 'utf8');
                const { failures: resolveFailures, config } = resolveConfig(join(dir, MANIFEST_REL), undefined);
                if (resolveFailures.length > 0) {
                    complain('absent endpoint host', `the fixture manifest is red for an unrelated reason: ${resolveFailures.join(' | ')}`);
                } else {
                    mkdirSync(join(dir, 'generated'), { recursive: true });
                    writeFileSync(join(dir, FRAGMENT_REL), emitEndpointHosts(config, { id: 'dev' }), 'utf8');
                    const { failures } = runChecks(dir);
                    if (!failures.some(f => f.includes('absent.example.org'))) {
                        complain('absent endpoint host', `did not go red naming 'absent.example.org'; got: ${failures.join(' | ') || '(no failures at all)'}`);
                    } else {
                        console.log(`  ok  absent endpoint host -> red, naming 'absent.example.org'`);
                    }
                }
            }
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    }

    // Plant 2: a marked allowlist entry covering no manifest host must go
    // red NAMING the entry. The fixture manifest is the shipped one (no
    // crash_report), so the marked entry is stale by construction.
    {
        const dir = mkdtempSync(join(tmpdir(), 'theia-endpoints-selftest-'));
        try {
            copyInto(dir, MANIFEST_REL);
            copyInto(dir, FRAGMENT_REL);
            copyInto(dir, ALLOWLIST_REL);
            const allow = JSON.parse(readFileSync(join(dir, ALLOWLIST_REL), 'utf8'));
            allow.hosts.push({
                host: 'stale.example.org',
                disposition: 'deny',
                reason: 'Self-test plant only: marked for a manifest key the fixture does not state.',
                manifest: 'urls.crash_report',
            });
            writeFileSync(join(dir, ALLOWLIST_REL), JSON.stringify(allow, null, 2), 'utf8');
            const { failures } = runChecks(dir);
            if (!failures.some(f => f.includes('stale.example.org'))) {
                complain('stale marked entry', `did not go red naming 'stale.example.org'; got: ${failures.join(' | ') || '(no failures at all)'}`);
            } else {
                console.log(`  ok  stale marked entry -> red, naming 'stale.example.org'`);
            }
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    }

    // Plants 3 and 4 (TEL-07, 57-02): a STATED [urls].crash_report is one key with two consumers.
    // The fixture states the key inside [urls]; the fragment is derived from that fixture through the
    // same resolver, so only the named half can fire. Plant 3: the crash host has no allowlist row,
    // so an unattended resolution must go red NAMING it. Plant 4: the row is present, so coverage is
    // green and the breakpad.reportURL expect (still blank) must go red NAMING the pref.
    const statedCrashManifest = readFileSync(join(REPO_ROOT, MANIFEST_REL), 'utf8')
        .replace(/^\[urls\]\s*$/m, '[urls]\ncrash_report = "https://crash.example.org/report"');
    const crashPlant = (label, needle, addAllowRow) => {
        const dir = mkdtempSync(join(tmpdir(), 'theia-endpoints-selftest-'));
        try {
            copyInto(dir, ALLOWLIST_REL);
            if (statedCrashManifest === readFileSync(join(REPO_ROOT, MANIFEST_REL), 'utf8')) {
                complain(label, 'planted no fault at all: the [urls] insertion did not land');
                return;
            }
            writeFileSync(join(dir, MANIFEST_REL), statedCrashManifest, 'utf8');
            if (addAllowRow) {
                const allow = JSON.parse(readFileSync(join(dir, ALLOWLIST_REL), 'utf8'));
                allow.hosts.push({
                    host: 'crash.example.org',
                    disposition: 'user-initiated',
                    reason: 'Self-test plant only: covers the stated crash host so coverage stays green.',
                });
                writeFileSync(join(dir, ALLOWLIST_REL), JSON.stringify(allow, null, 2), 'utf8');
            }
            const { failures: resolveFailures, config } = resolveConfig(join(dir, MANIFEST_REL), undefined);
            if (resolveFailures.length > 0) {
                complain(label, `the fixture manifest is red for an unrelated reason: ${resolveFailures.join(' | ')}`);
                return;
            }
            mkdirSync(join(dir, 'generated'), { recursive: true });
            writeFileSync(join(dir, FRAGMENT_REL), emitEndpointHosts(config, { id: 'dev' }), 'utf8');
            const { failures } = runChecks(dir);
            if (!failures.some(f => f.includes(needle))) {
                complain(label, `did not go red naming '${needle}'; got: ${failures.join(' | ') || '(no failures at all)'}`);
            } else {
                console.log(`  ok  ${label} -> red, naming '${needle}'`);
            }
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    };
    crashPlant('unattended crash host', 'crash.example.org', false);
    crashPlant('stated crash_report disagrees with breakpad.reportURL expect', 'breakpad.reportURL', true);

    if (failed > 0) return 1;
    console.log(`${NAME}: --self-test PASS -- 4 planted faults all behaved as pinned`);
    return 0;
}

if (SELF_TEST) {
    process.exit(selfTest());
} else if (args.length === 0) {
    main();
}
