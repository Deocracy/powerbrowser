#!/usr/bin/env node
// scripts/verify-webextensions.mjs
//
// The WebExtensions declaration gate (EXT-03): every [[webextensions]]
// entry in configuration.toml reaches the policy engine as the exact
// ExtensionSettings key it declares, and nothing else does.
//
// WHAT IT ASSERTS. Every expectation is DERIVED at check time -- from the
// manifest through scripts/generate.mjs's own emitter -- never kept here:
//
//  1. generated/webextensions-settings.json parses and equals what the
//     manifest emits right now (a drifted entry fails naming the add-on
//     id). Absent fragment SKIPS this step only: generated/ is gitignored,
//     so that is the state of every fresh clone, and a gate red on it would
//     be a gate its readers skip (generate-check's own rule).
//  2. powerbrowser/distribution/policies.json's ExtensionSettings key
//     equals that same map (a manifest with entries and a key still at the
//     empty object is stale output, not a clean tree; a key outliving its
//     manifest entry fails naming the add-on id). The tracked file is
//     committed, so this step always runs -- it is what pins the
//     policy-engine side. The copy-over is surgical: set ONLY the
//     ExtensionSettings key from the fragment, leaving the two sibling
//     keys byte-identical.
//  3. Every https install_url origin the manifest declares is PRESENT in
//     powerbrowser/endpoint-allowlist.json's `hosts` array -- the policy
//     engine fetches updates from that origin at runtime, so an uncovered
//     origin fails NAMING the host. file:/// entries carry no network
//     origin and are out of this leg's scope.
//
// Honestly --quick: it reads text files off disk only. No build, no
// browser, no display, no network.
//
// INSTALL MECHANISM (EXT-03, confirmed against the pinned ESR tag -- the
// [upstreams] firefox_esr_tag this tree fetches, read from
// generated/upstream-pins.env, never restated here): self-hosted
// install_url XPIs install unsigned with
// xpinstall.signatures.required=false -- upstream/toolkit/moz.configure's
// require_signing returns `milestone.is_release_or_beta and not
// milestone.is_esr`, so MOZ_REQUIRE_SIGNING defaults off on ESR and
// AddonSettings.REQUIRE_SIGNING stays a flippable pref
// (upstream/toolkit/mozapps/extensions/internal/AddonSettings.sys.mjs)
// rather than a locked true. No AMO publication is required for
// downstream XPIs; AMO-unlisted-signed is the documented alternative only
// for stricter postures. A downstream flips the pref in its own branding
// pref file; this tree ships zero declared add-ons, so it states no such
// pref here.
//
// Usage:
//   node scripts/verify-webextensions.mjs
//   node scripts/verify-webextensions.mjs --self-test
//
// The self-test plants six faults and requires each to go red: a drifted
// tracked key (naming the add-on id -- proves the check reads the tracked
// file, not the fragment), a drifted fragment (naming the add-on id --
// proves the check reads the fragment, not the tracked file), a tracked
// key outliving its manifest entry (naming the id), a fixture
// install_url origin absent from the allowlist (naming the host), a
// fragment missing a declared id (naming the id -- proves the
// fragment-missing loop runs), and a fragment carrying an undeclared id
// (naming the id -- proves the fragment-extra loop runs). Each
// runs with the unmutated control green first, so a red is plant-caused.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { emitWebExtensionSettings, resolveConfig } from './generate.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'verify-webextensions';

const args = process.argv.slice(2);
const SELF_TEST = args.includes('--self-test');
for (const a of args) {
    if (a !== '--self-test') {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
        process.exit(2);
    }
}

const MANIFEST_REL = 'configuration.toml';
const FRAGMENT_REL = 'generated/webextensions-settings.json';
const POLICY_REL = 'powerbrowser/distribution/policies.json';
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

function isTable(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Canonical form for one ExtensionSettings entry ({installation_mode,
 * install_url}). JSON.stringify is insertion-order sensitive, so any
 * key-sorting formatter applied to policies.json would red this gate on
 * semantically identical content -- sort one level before comparing.
 */
function canonEntry(value) {
    if (!isTable(value)) return JSON.stringify(value);
    return JSON.stringify(Object.keys(value).sort().reduce((acc, k) => ((acc[k] = value[k]), acc), {}));
}

function runChecks(root) {
    const failures = [];
    const skipped = [];

    // --- 0. the manifest resolves -----------------------------------------
    const { failures: resolveFailures, config } = resolveConfig(join(root, MANIFEST_REL), undefined);
    if (resolveFailures.length > 0) {
        for (const f of resolveFailures) failures.push(`${MANIFEST_REL} is red, so the webextensions pins prove nothing: ${f}`);
        return { failures, skipped };
    }
    const entries = config.webextensions ?? [];
    let expected;
    try {
        expected = JSON.parse(emitWebExtensionSettings(config, { id: 'dev' }));
    } catch {
        failures.push(`the emitted ${FRAGMENT_REL} is not valid JSON, so it cannot be compared. Next step: report this; ${MANIFEST_REL} is not the cause and editing it will not help.`);
        return { failures, skipped };
    }

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
        if (fragment !== null) {
            for (const id of Object.keys(expected)) {
                if (!Object.hasOwn(fragment, id)) {
                    failures.push(
                        `${FRAGMENT_REL} is missing the [[webextensions]] entry with id ${JSON.stringify(id)} -- stale output. `
                        + `Next step: run ${RERUN_GENERATE}, then re-run this check.`,
                    );
                } else if (canonEntry(fragment[id]) !== canonEntry(expected[id])) {
                    failures.push(
                        `${FRAGMENT_REL} carries ${JSON.stringify(fragment[id])} for the entry with id ${JSON.stringify(id)} `
                        + `but ${MANIFEST_REL} emits ${JSON.stringify(expected[id])} -- stale output. `
                        + `Next step: run ${RERUN_GENERATE}, then re-run this check.`,
                    );
                }
            }
            for (const id of Object.keys(fragment ?? {})) {
                if (!Object.hasOwn(expected, id)) {
                    failures.push(
                        `${FRAGMENT_REL} carries an entry with id ${JSON.stringify(id)} that ${MANIFEST_REL} no longer declares -- `
                        + `stale output left behind by a removed entry. Next step: run ${RERUN_GENERATE}, then re-run this check.`,
                    );
                }
            }
        }
    }

    // --- 2. the tracked policies.json key -----------------------------------
    const policyRead = readJson(root, POLICY_REL, failures);
    if (!policyRead.found) {
        failures.push(`${POLICY_REL} does not exist, so the ExtensionSettings key cannot be checked at all.`);
        return { failures, skipped };
    }
    if (policyRead.value !== null) {
        const policies = policyRead.value?.policies;
        if (!isTable(policies)) {
            failures.push(`${POLICY_REL} carries no policies object, so the ExtensionSettings key cannot be checked at all.`);
        } else if (!isTable(policies.ExtensionSettings)) {
            failures.push(
                `${POLICY_REL} carries no ExtensionSettings key but ${MANIFEST_REL} emits ${JSON.stringify(expected)} -- stale output. `
                + `Next step: copy the key from ${FRAGMENT_REL} (that key only; leave every sibling key byte-identical), then re-run this check.`,
            );
        } else {
            const tracked = policies.ExtensionSettings;
            for (const id of Object.keys(expected)) {
                if (!Object.hasOwn(tracked, id)) {
                    failures.push(
                        `${POLICY_REL}'s ExtensionSettings key is missing the [[webextensions]] entry with id ${JSON.stringify(id)} -- `
                        + `stale output. Next step: copy the key from ${FRAGMENT_REL} (that key only; leave every sibling key byte-identical), `
                        + `then re-run this check.`,
                    );
                } else if (canonEntry(tracked[id]) !== canonEntry(expected[id])) {
                    failures.push(
                        `${POLICY_REL}'s ExtensionSettings key carries ${JSON.stringify(tracked[id])} for the entry with id `
                        + `${JSON.stringify(id)} but ${MANIFEST_REL} emits ${JSON.stringify(expected[id])} -- stale output. `
                        + `Next step: copy the key from ${FRAGMENT_REL} (that key only; leave every sibling key byte-identical), `
                        + `then re-run this check.`,
                    );
                }
            }
            for (const id of Object.keys(tracked)) {
                if (!Object.hasOwn(expected, id)) {
                    failures.push(
                        `${POLICY_REL}'s ExtensionSettings key carries an entry with id ${JSON.stringify(id)} that ${MANIFEST_REL} no longer `
                        + `declares -- stale key outliving its manifest entry, and the policy engine would still install it. `
                        + `Next step: remove that key (that key only; leave every sibling key byte-identical), then re-run this check.`,
                    );
                }
            }
        }
    }

    // --- 3. every https install_url origin is allowlisted --------------------
    const allowRead = readJson(root, ALLOWLIST_REL, failures);
    if (!allowRead.found) {
        failures.push(`${ALLOWLIST_REL} does not exist, so install_url origin coverage cannot be checked at all.`);
        return { failures, skipped };
    }
    if (allowRead.value !== null) {
        const allowHosts = Array.isArray(allowRead.value.hosts) ? allowRead.value.hosts : null;
        if (allowHosts === null) {
            failures.push(`${ALLOWLIST_REL} carries no hosts array, so install_url origin coverage cannot be checked at all.`);
            return { failures, skipped };
        }
        const listed = new Set(allowHosts.map(h => h?.host).filter(h => typeof h === 'string'));
        for (const entry of entries) {
            const url = entry?.install_url;
            if (typeof url !== 'string' || !url.startsWith('https://')) continue;
            let host;
            try {
                host = new URL(url).hostname;
            } catch {
                failures.push(
                    `the [[webextensions]] entry with id ${JSON.stringify(entry?.id)} carries install_url ${JSON.stringify(url)}, `
                    + `which names no host to cover in the endpoint allowlist. Next step: correct it in ${MANIFEST_REL}, then re-run this check.`,
                );
                continue;
            }
            if (host === '' || !listed.has(host)) {
                failures.push(
                    `${host === '' ? '(no host)' : host} is named by a [[webextensions]] install_url for the entry with id `
                    + `${JSON.stringify(entry?.id)} but present in no ${ALLOWLIST_REL} entry -- the policy engine would fetch an update source `
                    + `no gate tracks. Next step: add a hosts entry for it (with a hand-authored reason), then re-run this check.`,
                );
            }
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
    console.log(`${NAME}: PASS -- tracked key, derived fragment, and origin coverage agree`);
}

function copyInto(root, rel) {
    const dest = join(root, rel);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(join(REPO_ROOT, rel), dest);
}

// A fully synthetic fixture: no network, no real add-ons. Two Acme
// entries (one https, one file) whose fragment and tracked key are both
// emitted from the resolved manifest, and a copied allowlist carrying a
// plant-only covering entry for the https origin -- so the unmutated
// fixture is green and every plant below breaks exactly one thing.
const FIXTURE_ENTRY_A = ['id = "acme-tool@example.org"', 'installation_mode = "force_installed"', 'install_url = "https://addons.example.org/acme-tool-1.2.3.xpi"'];
const FIXTURE_ENTRY_B = ['id = "acme-helper@example.org"', 'installation_mode = "normal_installed"', 'install_url = "file:///opt/downstream/extensions/acme-helper.xpi"'];

function fixtureManifest(extra) {
    return `${readFileSync(join(REPO_ROOT, MANIFEST_REL), 'utf8')}\n${extra}\n`;
}

function writeManifest(dir, text) {
    writeFileSync(join(dir, MANIFEST_REL), text, 'utf8');
}

function webextensionsBlock(entryLines) {
    return entryLines.map(lines => `[[webextensions]]\n${lines.join('\n')}`).join('\n\n');
}

function setupFixture(dir, manifestText, coverHosts) {
    writeManifest(dir, manifestText);
    copyInto(dir, ALLOWLIST_REL);
    const { failures: resolveFailures, config } = resolveConfig(join(dir, MANIFEST_REL), undefined);
    if (resolveFailures.length > 0) {
        return { error: `the fixture manifest is red for an unrelated reason: ${resolveFailures.join(' | ')}` };
    }
    mkdirSync(join(dir, 'generated'), { recursive: true });
    writeFileSync(join(dir, FRAGMENT_REL), emitWebExtensionSettings(config, { id: 'dev' }), 'utf8');
    copyInto(dir, POLICY_REL);
    const policy = JSON.parse(readFileSync(join(dir, POLICY_REL), 'utf8'));
    policy.policies.ExtensionSettings = JSON.parse(emitWebExtensionSettings(config, { id: 'dev' }));
    writeFileSync(join(dir, POLICY_REL), `${JSON.stringify(policy, null, 2)}\n`, 'utf8');
    if (coverHosts.length > 0) {
        const allow = JSON.parse(readFileSync(join(dir, ALLOWLIST_REL), 'utf8'));
        for (const host of coverHosts) {
            allow.hosts.push({
                host,
                disposition: 'allow',
                reason: 'Self-test plant only: covers the synthetic fixture install_url origin.',
            });
        }
        writeFileSync(join(dir, ALLOWLIST_REL), `${JSON.stringify(allow, null, 2)}\n`, 'utf8');
    }
    return { config };
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
        console.log(`  ok  unmutated control -> agreement green`);
    }

    const bothEntries = webextensionsBlock([FIXTURE_ENTRY_A, FIXTURE_ENTRY_B]);

    // Plant 1: a drifted TRACKED key must go red naming the add-on id --
    // proves the check reads the tracked file, not the fragment. The
    // fragment stays emitted, so only the tracked half can fire.
    {
        const dir = mkdtempSync(join(tmpdir(), 'webextensions-selftest-'));
        try {
            const setup = setupFixture(dir, fixtureManifest(bothEntries), ['addons.example.org']);
            if (setup.error) {
                complain('drifted tracked key', setup.error);
            } else {
                const target = join(dir, POLICY_REL);
                const before = readFileSync(target, 'utf8');
                const policy = JSON.parse(before);
                policy.policies.ExtensionSettings['acme-tool@example.org'].install_url = 'https://addons.example.org/acme-tool-9.9.9.xpi';
                writeFileSync(target, `${JSON.stringify(policy, null, 2)}\n`, 'utf8');
                if (readFileSync(target, 'utf8') === before) {
                    complain('drifted tracked key', 'planted no fault at all: the drift did not land');
                } else {
                    const { failures } = runChecks(dir);
                    if (!failures.some(f => f.includes('acme-tool@example.org') && f.includes(POLICY_REL))) {
                        complain('drifted tracked key', `did not go red naming 'acme-tool@example.org'; got: ${failures.join(' | ') || '(no failures at all)'}`);
                    } else {
                        console.log(`  ok  drifted tracked key -> red, naming 'acme-tool@example.org'`);
                    }
                }
            }
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    }

    // Plant 2: a drifted FRAGMENT must go red naming the add-on id --
    // proves the check reads the fragment, not the tracked file. The
    // tracked key stays emitted, so only the fragment half can fire.
    {
        const dir = mkdtempSync(join(tmpdir(), 'webextensions-selftest-'));
        try {
            const setup = setupFixture(dir, fixtureManifest(bothEntries), ['addons.example.org']);
            if (setup.error) {
                complain('drifted fragment', setup.error);
            } else {
                const target = join(dir, FRAGMENT_REL);
                const before = readFileSync(target, 'utf8');
                const fragment = JSON.parse(before);
                fragment['acme-helper@example.org'].install_url = 'file:///opt/downstream/extensions/acme-helper-9.9.9.xpi';
                writeFileSync(target, `${JSON.stringify(fragment, null, 2)}\n`, 'utf8');
                if (readFileSync(target, 'utf8') === before) {
                    complain('drifted fragment', 'planted no fault at all: the drift did not land');
                } else {
                    const { failures } = runChecks(dir);
                    if (!failures.some(f => f.includes('acme-helper@example.org') && f.includes(FRAGMENT_REL))) {
                        complain('drifted fragment', `did not go red naming 'acme-helper@example.org'; got: ${failures.join(' | ') || '(no failures at all)'}`);
                    } else {
                        console.log(`  ok  drifted fragment -> red, naming 'acme-helper@example.org'`);
                    }
                }
            }
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    }

    // Plant 3: a tracked key outliving its manifest entry must go red
    // naming the id -- the policy engine would still install it. The
    // fixture manifest declares only the first entry while the tracked
    // key carries both.
    {
        const dir = mkdtempSync(join(tmpdir(), 'webextensions-selftest-'));
        try {
            const setup = setupFixture(dir, fixtureManifest(webextensionsBlock([FIXTURE_ENTRY_A])), ['addons.example.org']);
            if (setup.error) {
                complain('stale tracked key', setup.error);
            } else {
                const target = join(dir, POLICY_REL);
                const policy = JSON.parse(readFileSync(target, 'utf8'));
                policy.policies.ExtensionSettings['acme-helper@example.org'] = {
                    installation_mode: 'normal_installed',
                    install_url: 'file:///opt/downstream/extensions/acme-helper.xpi',
                };
                writeFileSync(target, `${JSON.stringify(policy, null, 2)}\n`, 'utf8');
                const { failures } = runChecks(dir);
                if (!failures.some(f => f.includes('acme-helper@example.org') && f.includes('no longer'))) {
                    complain('stale tracked key', `did not go red naming 'acme-helper@example.org'; got: ${failures.join(' | ') || '(no failures at all)'}`);
                } else {
                    console.log(`  ok  stale tracked key -> red, naming 'acme-helper@example.org'`);
                }
            }
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    }

    // Plant 4: a fixture install_url origin absent from the allowlist must
    // go red naming the host. Fragment and tracked key stay emitted, so
    // only the coverage leg can fire.
    {
        const dir = mkdtempSync(join(tmpdir(), 'webextensions-selftest-'));
        try {
            const uncovered = ['id = "acme-remote@example.org"', 'installation_mode = "force_installed"', 'install_url = "https://uncovered-plant.example.org/acme-remote-1.0.0.xpi"'];
            const setup = setupFixture(dir, fixtureManifest(webextensionsBlock([FIXTURE_ENTRY_A, uncovered])), ['addons.example.org']);
            if (setup.error) {
                complain('uncovered install_url origin', setup.error);
            } else {
                const { failures } = runChecks(dir);
                if (!failures.some(f => f.includes('uncovered-plant.example.org'))) {
                    complain('uncovered install_url origin', `did not go red naming 'uncovered-plant.example.org'; got: ${failures.join(' | ') || '(no failures at all)'}`);
                } else {
                    console.log(`  ok  uncovered install_url origin -> red, naming 'uncovered-plant.example.org'`);
                }
            }
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    }

    // Plant 5: a fragment missing a declared id must go red naming the
    // id -- proves the fragment-missing loop runs. The tracked key stays
    // emitted, so only the fragment half can fire.
    {
        const dir = mkdtempSync(join(tmpdir(), 'webextensions-selftest-'));
        try {
            const setup = setupFixture(dir, fixtureManifest(bothEntries), ['addons.example.org']);
            if (setup.error) {
                complain('fragment missing id', setup.error);
            } else {
                const target = join(dir, FRAGMENT_REL);
                const fragment = JSON.parse(readFileSync(target, 'utf8'));
                delete fragment['acme-helper@example.org'];
                writeFileSync(target, `${JSON.stringify(fragment, null, 2)}\n`, 'utf8');
                const { failures } = runChecks(dir);
                if (!failures.some(f => f.includes('acme-helper@example.org') && f.includes(FRAGMENT_REL))) {
                    complain('fragment missing id', `did not go red naming 'acme-helper@example.org'; got: ${failures.join(' | ') || '(no failures at all)'}`);
                } else {
                    console.log(`  ok  fragment missing id -> red, naming 'acme-helper@example.org'`);
                }
            }
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    }

    // Plant 6: a fragment carrying an id the manifest no longer declares
    // must go red naming the id -- proves the fragment-extra loop runs
    // (the stale-output direction of step 1, mirroring plant 3's tracked
    // direction of step 2).
    {
        const dir = mkdtempSync(join(tmpdir(), 'webextensions-selftest-'));
        try {
            const setup = setupFixture(dir, fixtureManifest(bothEntries), ['addons.example.org']);
            if (setup.error) {
                complain('fragment extra id', setup.error);
            } else {
                const target = join(dir, FRAGMENT_REL);
                const fragment = JSON.parse(readFileSync(target, 'utf8'));
                fragment['ghost-plant@example.org'] = {
                    installation_mode: 'normal_installed',
                    install_url: 'file:///opt/downstream/extensions/ghost-plant.xpi',
                };
                writeFileSync(target, `${JSON.stringify(fragment, null, 2)}\n`, 'utf8');
                const { failures } = runChecks(dir);
                if (!failures.some(f => f.includes('ghost-plant@example.org') && f.includes(FRAGMENT_REL))) {
                    complain('fragment extra id', `did not go red naming 'ghost-plant@example.org'; got: ${failures.join(' | ') || '(no failures at all)'}`);
                } else {
                    console.log(`  ok  fragment extra id -> red, naming 'ghost-plant@example.org'`);
                }
            }
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    }

    if (failed > 0) return 1;
    console.log(`${NAME}: --self-test PASS -- 6 planted faults all behaved as pinned`);
    return 0;
}

if (SELF_TEST) {
    process.exit(selfTest());
} else if (args.length === 0) {
    main();
}
