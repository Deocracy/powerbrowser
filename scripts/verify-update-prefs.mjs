#!/usr/bin/env node
// scripts/verify-update-prefs.mjs
//
// The update-prefs gate (Phase 40, UPD-25). The branding pref file loads
// after browser/app/profile/firefox.js, so any update pref it sets overrides
// upstream's tested behaviour. Update cadence and prompting stay at upstream's
// defaults; language-pack updates are off because the release is en-US only
// (PKG-09).
//
//  1. Derivation. Select every TARGETS row whose generated path ends in
//     pref/firefox-branding.js and emit it in memory with the resolved
//     manifest and its variant. No row at all, or no row for a variant the
//     manifest declares, fails naming this instrument: a check over nothing
//     proves nothing.
//  2. Parse every pref("<name>", <value>); line (the same PREF shape
//     verify-ng-064-update-url.mjs uses) and print each variant's update-pref
//     set (names starting app.update. or app.releaseNotesURL) in emission
//     order, so two runs over one tree print identical output.
//  3. No variant may set an update pref the generator does not own. The owned
//     set is derived, never hand-kept (WR-05): the names releaseLinkPrefs(config)
//     returns plus app.update.langpack.enabled (step 4). Any other app.update.*
//     or app.releaseNotesURL* name fails naming it. extensions.update.* is a
//     different family and is not read.
//  4. app.update.langpack.enabled is false in every variant.
//  5. The four About-dialog link prefs equal releaseLinkPrefs(config), and
//     every value other than "" and about:blank parses with new URL() -- the
//     call aboutDialog-appUpdater.js makes on them.
//
// Honestly --quick: an in-memory emit and text parsing. It writes no file
// (generated/ included), and runs no build, browser, display or network.
//
// Usage:
//   node scripts/verify-update-prefs.mjs
//   node scripts/verify-update-prefs.mjs --self-test
//
// The self-test requires a green baseline, then plants update prefs the
// generator does not own (UPD-25's five cadence prefs alternating dev and
// release, plus app.update.background.enabled), a langpack line flipped to true, an unparseable
// app.update.url.manual, no emitter rows and no release row -- each must go
// red naming the pref or instrument and the variant, without the checkout
// path. An added extensions.update.autoUpdateDefault line is the control and
// must stay green. Every plant edits emitted text in memory through the
// runChecks overrides; no tracked file is touched.

import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { TARGETS, releaseLinkPrefs, resolveConfig } from './generate.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'update-prefs';
const SELF_REL = 'scripts/verify-update-prefs.mjs';

const args = process.argv.slice(2);
for (const a of args) {
    if (a !== '--self-test') {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
        console.error(`  Next step: run: node ${SELF_REL}, or add --self-test to prove the gate discriminates.`);
        process.exit(2);
    }
}

const MANIFEST_REL = 'configuration.toml';
const GENERATOR_REL = 'scripts/generate.mjs';
const RERUN_GENERATE = 'node scripts/generate.mjs';
const EMITTER_SUFFIX = 'pref/firefox-branding.js';
const LANGPACK_PREF = 'app.update.langpack.enabled';
// UPD-28 (46-04, owner decision 6): fixed false in both variants, no manifest key.
const FXA_PREF = 'identity.fxaccounts.enabled';


// Same shape as verify-ng-064-update-url.mjs's PREF.
const PREF = /(?:^|\n)\s*(?:sticky_)?pref\(\s*"([^"]+)"\s*,\s*("(?:[^"\\]|\\.)*"|[^)]*?)\s*\)\s*;/g;
const isUpdatePref = (name) => name.startsWith('app.update.') || name.startsWith('app.releaseNotesURL');

function parsePrefs(text) {
    return [...text.matchAll(PREF)].map(([, name, raw]) => {
        let value = raw;
        try {
            value = JSON.parse(raw);
        } catch {
            // Not a JSON literal; compare as written.
        }
        return { name, value };
    });
}

// Gecko keeps the last pref() for a name, so the effective value is the last one.
const lastValue = (prefs, name) => prefs.findLast(p => p.name === name);

function runChecks(root, overrides = {}) {
    const failures = [];
    const sets = [];

    const resolved = resolveConfig(join(root, MANIFEST_REL));
    if (resolved.config === undefined || resolved.failures.length > 0) {
        failures.push(`${MANIFEST_REL} does not resolve, so no branding pref file can be emitted. Next step: run ${RERUN_GENERATE} -- it reports the faulty key.`);
        return { failures, sets };
    }
    const config = resolved.config;
    const textFor = overrides.textFor ?? ((row, cfg, variant) => row.emit(cfg, variant));

    // --- 1. derivation -----------------------------------------------------
    const rows = (overrides.rows ?? TARGETS).filter(t => t.generated.endsWith(EMITTER_SUFFIX));
    if (rows.length === 0) {
        failures.push(`${NAME} found no TARGETS row emitting ${EMITTER_SUFFIX}, so no update pref was checked. Next step: check the instrument (${SELF_REL}: its emitter selection) against the TARGETS table in ${GENERATOR_REL}.`);
        return { failures, sets };
    }
    for (const v of config.variants ?? []) {
        if (!rows.some(r => r.variant === v.id)) {
            failures.push(`${NAME} found no ${EMITTER_SUFFIX} emitter for variant '${v.id}', which ${MANIFEST_REL} declares, so that variant's update prefs are unchecked. Next step: check the instrument (${SELF_REL}) and the TARGETS table in ${GENERATOR_REL}.`);
        }
    }

    const expectedLinks = releaseLinkPrefs(config);
    const owned = new Set([...expectedLinks.map(p => p.name), LANGPACK_PREF, FXA_PREF]);
    for (const row of rows) {
        const variant = (config.variants ?? []).find(v => v.id === row.variant);
        if (variant === undefined) {
            failures.push(`${GENERATOR_REL} has a ${row.generated} emitter for variant '${row.variant}', which ${MANIFEST_REL} does not declare. Next step: declare the variant or remove the row.`);
            continue;
        }
        const prefs = parsePrefs(String(textFor(row, config, variant)));
        sets.push({ variant: variant.id, prefs: prefs.filter(p => isUpdatePref(p.name)) });

        // --- 3. no update pref the generator does not own ----------------------
        for (const p of prefs) {
            if (isUpdatePref(p.name) && !owned.has(p.name)) {
                failures.push(`variant '${variant.id}' sets ${p.name} to ${JSON.stringify(p.value)} in ${row.generated}; only the generator's own update prefs (${[...owned].join(', ')}) may be set, and everything else stays at upstream's defaults (UPD-25). Next step: remove that line from the emitter in ${GENERATOR_REL}.`);
            }
        }

        // --- 4. language-pack updates off -----------------------------------
        const langpack = lastValue(prefs, LANGPACK_PREF);
        if (langpack?.value !== false) {
            failures.push(`variant '${variant.id}' sets ${LANGPACK_PREF} to ${langpack === undefined ? '(unset, upstream default true)' : JSON.stringify(langpack.value)} in ${row.generated}; it must be false because the release is en-US only (PKG-09). Next step: restore pref("${LANGPACK_PREF}", false); in FIREFOX_BRANDING_BASE_LINES.`);
        }

        // --- 4b. Firefox Accounts and Sync off (UPD-28) ----------------------
        const fxa = lastValue(prefs, FXA_PREF);
        if (fxa?.value !== false) {
            failures.push(`variant '${variant.id}' sets ${FXA_PREF} to ${fxa === undefined ? '(unset, upstream default true)' : JSON.stringify(fxa.value)} in ${row.generated}; it must be false (owner decision 6: no Firefox Accounts or Sync). Next step: restore pref("${FXA_PREF}", false); in FIREFOX_BRANDING_BASE_LINES.`);
        }

        // --- 5. About-dialog links -------------------------------------------
        for (const { name, value } of expectedLinks) {
            const got = lastValue(prefs, name);
            if (got === undefined || got.value !== value) {
                failures.push(`variant '${variant.id}' sets ${name} to ${got === undefined ? '(unset)' : JSON.stringify(got.value)} in ${row.generated} but releaseLinkPrefs derives ${JSON.stringify(value)} from ${MANIFEST_REL} [urls]. Next step: let the RELEASE_LINK_ANCHOR splice in ${GENERATOR_REL} emit it.`);
            }
            if (got === undefined || got.value === '' || got.value === 'about:blank') continue;
            let parses = typeof got.value === 'string';
            if (parses) {
                try {
                    new URL(got.value);
                } catch {
                    parses = false;
                }
            }
            if (!parses) {
                failures.push(`variant '${variant.id}' sets ${name} to ${JSON.stringify(got.value)}, which does not parse as a URL, so the About dialog cannot open it. Next step: write a full https address in ${MANIFEST_REL} [urls].`);
            }
        }
    }
    return { failures, sets };
}

function printSets(sets) {
    for (const { variant, prefs } of sets) {
        console.log(`${NAME}: variant '${variant}', ${prefs.length} update pref(s) in emission order:`);
        for (const p of prefs) console.log(`  ${p.name} = ${JSON.stringify(p.value)}`);
    }
}

function main() {
    if (args.includes('--self-test')) return selfTest();
    const { failures, sets } = runChecks(REPO_ROOT);
    printSets(sets);
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} problem(s) with the branding update prefs.`);
        failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- ${sets.length} variant(s) set no update pref outside the generator's own; ${LANGPACK_PREF} and ${FXA_PREF} are false and the About-dialog links equal releaseLinkPrefs in each`);
    return 0;
}

function selfTest() {
    const baseline = runChecks(REPO_ROOT);
    if (baseline.failures.length > 0 || baseline.sets.length === 0) {
        console.error(`${NAME}: --self-test FAIL -- the unmodified tree is already red, so the planted-fault results below would mean nothing:`);
        baseline.failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log(`  ok  baseline -> green`);

    // Edit the emitted text of one variant in memory; the other variant emits as-is.
    const edit = (variantId, fn) => ({
        textFor: (row, config, variant) => {
            const text = row.emit(config, variant);
            return row.variant === variantId ? fn(text) : text;
        },
    });
    const append = (variantId, line) => edit(variantId, text => `${text}${line}\n`);
    const replaced = (variantId, from, to) => edit(variantId, text => text.replace(from, to));
    const prefRows = TARGETS.filter(t => t.generated.endsWith(EMITTER_SUFFIX));

    const plants = [
        // Not owned by the generator: UPD-25's five cadence prefs and one the old hand list missed.
        ...['app.update.auto', 'app.update.staging.enabled', 'app.update.interval', 'app.update.promptWaitTime', 'app.update.badgeWaitTime', 'app.update.background.enabled'].map((pref, i) => {
            const variant = i % 2 === 0 ? 'dev' : 'release';
            return [`${pref} planted in ${variant}`, append(variant, `pref("${pref}", true);`), pref, variant];
        }),
        ['langpack flipped to true in release', replaced('release', `pref("${LANGPACK_PREF}", false);`, `pref("${LANGPACK_PREF}", true);`), LANGPACK_PREF, 'release'],
        ['fxa flipped to true in dev', replaced('dev', `pref("${FXA_PREF}", false);`, `pref("${FXA_PREF}", true);`), FXA_PREF, 'dev'],
        ['fxa line absent in release', replaced('release', `pref("${FXA_PREF}", false);\n`, ''), FXA_PREF, 'release'],
        ['app.update.url.manual is not a url in dev', replaced('dev', /pref\("app\.update\.url\.manual", "[^"]*"\);/, 'pref("app.update.url.manual", "not a url");'), 'app.update.url.manual to "not a url", which does not parse as a URL', 'dev'],
        ['no firefox-branding emitter rows', { rows: [] }, SELF_REL, NAME],
        ['no release emitter row', { rows: prefRows.filter(r => r.variant !== 'release') }, SELF_REL, 'release'],
    ];

    let failed = 0;
    for (const [name, overrides, marker, variant] of plants) {
        const { failures } = runChecks(REPO_ROOT, overrides);
        const hit = failures.find(f => f.includes(marker) && f.includes(variant === NAME ? NAME : `'${variant}'`));
        if (hit === undefined) {
            console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red naming '${marker}' and '${variant}'; got: ${failures.join(' | ') || '(no failures at all)'}`);
            failed += 1;
        } else if (failures.some(f => f.includes(REPO_ROOT))) {
            console.error(`${NAME}: --self-test FAIL -- '${name}' leaked this checkout's path into its output: ${failures.join(' | ')}`);
            failed += 1;
        } else {
            console.log(`  ok  ${name} -> red, naming '${marker}' and '${variant}'`);
        }
    }

    // Control: exact-name matching -- extensions.update.autoUpdateDefault is not app.update.auto.
    {
        const { failures } = runChecks(REPO_ROOT, append('dev', 'pref("extensions.update.autoUpdateDefault", false);'));
        if (failures.length === 0) {
            console.log(`  ok  control: added extensions.update.autoUpdateDefault in dev -> green`);
        } else {
            console.error(`${NAME}: --self-test FAIL -- the extensions.update.autoUpdateDefault control went red: ${failures.join(' | ')}`);
            failed += 1;
        }
    }

    if (failed > 0) return 1;
    console.log(`${NAME}: --self-test PASS -- ${plants.length} planted faults went red naming the pref or instrument and the variant, and the control stayed green`);
    return 0;
}

process.exit(main());
