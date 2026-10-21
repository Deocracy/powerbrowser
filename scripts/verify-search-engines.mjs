#!/usr/bin/env node
// scripts/verify-search-engines.mjs
//
// The configured-search-engine gate (BAR-04): the [[search_engines]] table
// in configuration.toml reaches the policy engine as the exact
// SearchEngines key it declares, and no configured engine can be dropped
// in silence.
//
// WHAT IT ASSERTS. Every expectation is DERIVED at check time -- from the
// manifest through scripts/generate.mjs's own emitter, and from the pinned
// upstream's own search config -- never kept here:
//
//  1. generated/search-engines.json parses and equals what the manifest
//     emits right now. Absent fragment SKIPS this step only: generated/ is
//     gitignored, so that is the state of every fresh clone
//     (generate-check's own rule).
//  2. powerbrowser/distribution/policies.json's SearchEngines key
//     deep-equals that emission: every Add entry by name, its order, the
//     Default, and no key the emission does not carry. A tracked engine
//     outliving its manifest entry fails naming the engine. A manifest
//     with no table must leave no SearchEngines key at all.
//  3. No configured name equals, case-insensitively, the base.name of an
//     engine record in upstream/services/settings/dumps/main/
//     search-config-v2.json. Gecko refuses a second engine of the same name
//     ("duplicate-title" in SearchService #addEngineToStore) and the policy
//     engine only logs it, so a colliding entry would vanish without a
//     word. upstream/ absent prints a SKIP line, never a pass claim.
//  4. Every configured url and suggest_url, and every tracked URLTemplate
//     and SuggestURLTemplate, is https and contains {searchTerms}.
//
// A manifest that writes a [[search_engines]] header but resolves to zero
// engines is a broken reader, not a clean tree, and fails.
//
// Honestly --quick: text files off disk only. No build, no browser, no
// display, no network.
//
// Usage:
//   node scripts/verify-search-engines.mjs
//   node scripts/verify-search-engines.mjs --self-test
//
// The self-test runs the unmutated tree green first, then a synthetic
// fixture (in mkdtemp, with a synthetic shipped-engine dump) green, then
// plants four faults and requires each red naming its token: a stale
// tracked engine, a name colliding with a shipped name, a url without
// {searchTerms} (refused by generate's own validation, naming the entry),
// and an extra key in the tracked policy.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { emitSearchEngines, resolveConfig } from './generate.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'verify-search-engines';

const args = process.argv.slice(2);
const SELF_TEST = args.includes('--self-test');
for (const a of args) {
    if (a !== '--self-test') {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
        process.exit(2);
    }
}

const MANIFEST_REL = 'configuration.toml';
const FRAGMENT_REL = 'generated/search-engines.json';
const POLICY_REL = 'powerbrowser/distribution/policies.json';
const DUMP_REL = 'upstream/services/settings/dumps/main/search-config-v2.json';
const RERUN_GENERATE = 'node scripts/generate.mjs';
const COPY_STEP = `copy the key from ${FRAGMENT_REL} (that key only; leave every sibling key byte-identical), then re-run this check`;
const TEMPLATE = /^https:\/\/[^\s]*\{searchTerms\}/;

function isTable(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Key-sorted JSON, recursively; array order is kept because it is meaningful (the first entry is the default). */
function canon(value) {
    if (Array.isArray(value)) return `[${value.map(canon).join(',')}]`;
    if (isTable(value)) return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canon(value[k])}`).join(',')}}`;
    return JSON.stringify(value);
}

/** Every difference between `actual` and the emitted `expected`, each naming the engine or key. */
function diffKey(where, actual, expected) {
    const out = [];
    if (!isTable(actual)) return [`${where} is ${JSON.stringify(actual)}, not an object`];
    for (const k of Object.keys(actual)) {
        if (!Object.hasOwn(expected, k)) out.push(`${where} carries the key ${JSON.stringify(k)}, which ${MANIFEST_REL} does not emit`);
    }
    for (const k of Object.keys(expected)) {
        if (!Object.hasOwn(actual, k)) out.push(`${where} is missing the key ${JSON.stringify(k)}`);
    }
    if (Object.hasOwn(expected, 'Default') && Object.hasOwn(actual, 'Default') && actual.Default !== expected.Default) {
        out.push(`${where} names the default engine ${JSON.stringify(actual.Default)} but ${MANIFEST_REL} makes ${JSON.stringify(expected.Default)} the default (its first entry)`);
    }
    const wantAdd = Array.isArray(expected.Add) ? expected.Add : [];
    if (Object.hasOwn(actual, 'Add') && !Array.isArray(actual.Add)) {
        out.push(`${where}'s Add is not a list`);
    } else if (Array.isArray(actual.Add)) {
        const byName = new Map(wantAdd.map(e => [e.Name, e]));
        const haveNames = actual.Add.map(e => e?.Name);
        for (const e of actual.Add) {
            if (!byName.has(e?.Name)) {
                out.push(`${where} carries the engine ${JSON.stringify(e?.Name)}, which ${MANIFEST_REL} no longer declares -- a stale entry the policy engine would still add`);
            } else if (canon(e) !== canon(byName.get(e.Name))) {
                out.push(`${where} carries ${JSON.stringify(e)} for the engine ${JSON.stringify(e.Name)} but ${MANIFEST_REL} emits ${JSON.stringify(byName.get(e.Name))}`);
            }
        }
        for (const e of wantAdd) {
            if (!haveNames.includes(e.Name)) out.push(`${where} is missing the engine ${JSON.stringify(e.Name)}`);
        }
        if (out.length === 0 && canon(actual.Add) !== canon(wantAdd)) {
            out.push(`${where} lists the engines in the order ${JSON.stringify(haveNames)} but ${MANIFEST_REL} declares ${JSON.stringify(wantAdd.map(e => e.Name))}`);
        }
    }
    return out;
}

function runChecks(root) {
    const failures = [];
    const skipped = [];

    // --- 0. the manifest resolves -----------------------------------------
    const manifestPath = join(root, MANIFEST_REL);
    const { failures: resolveFailures, config } = resolveConfig(manifestPath, undefined);
    if (resolveFailures.length > 0) {
        for (const f of resolveFailures) failures.push(`${MANIFEST_REL} is red, so the search-engine pins prove nothing: ${f}`);
        return { failures, skipped };
    }
    const engines = config.search_engines ?? [];
    if (engines.length === 0 && /^\s*\[\[\s*search_engines\s*\]\]/m.test(readFileSync(manifestPath, 'utf8'))) {
        failures.push(`${MANIFEST_REL} writes a [[search_engines]] section but resolves to zero engines -- the reader is broken, so nothing below would mean anything. Next step: report this.`);
        return { failures, skipped };
    }
    const expected = JSON.parse(emitSearchEngines(config, { id: 'dev' }));
    const stated = Object.keys(expected).length > 0;

    // --- 1. the generated fragment -----------------------------------------
    const fragmentPath = join(root, FRAGMENT_REL);
    if (!existsSync(fragmentPath)) {
        skipped.push(`${FRAGMENT_REL} is absent (nothing generated in this copy yet) -- fragment equality unchecked; run ${RERUN_GENERATE} to cover it.`);
    } else {
        let fragment = null;
        try {
            fragment = JSON.parse(readFileSync(fragmentPath, 'utf8'));
        } catch {
            failures.push(`${FRAGMENT_REL} is not valid JSON. Next step: run ${RERUN_GENERATE} to rewrite it, then re-run this check.`);
        }
        if (fragment !== null) {
            for (const d of diffKey(FRAGMENT_REL, fragment, expected)) {
                failures.push(`${d} -- stale output. Next step: run ${RERUN_GENERATE}, then re-run this check.`);
            }
        }
    }

    // --- 2. the tracked policies.json key -----------------------------------
    const policyPath = join(root, POLICY_REL);
    let tracked;
    if (!existsSync(policyPath)) {
        failures.push(`${POLICY_REL} does not exist, so the SearchEngines key cannot be checked at all.`);
        return { failures, skipped };
    }
    try {
        tracked = JSON.parse(readFileSync(policyPath, 'utf8'))?.policies;
    } catch {
        failures.push(`${POLICY_REL} is not valid JSON. Next step: restore it from version control, then re-run this check.`);
        return { failures, skipped };
    }
    if (!isTable(tracked)) {
        failures.push(`${POLICY_REL} carries no policies object, so the SearchEngines key cannot be checked at all.`);
        return { failures, skipped };
    }
    const where = `${POLICY_REL}'s SearchEngines key`;
    if (!Object.hasOwn(tracked, 'SearchEngines')) {
        if (stated) failures.push(`${POLICY_REL} carries no SearchEngines key but ${MANIFEST_REL} emits ${JSON.stringify(expected)} -- stale output. Next step: ${COPY_STEP}.`);
    } else if (!stated) {
        failures.push(`${where} is present but ${MANIFEST_REL} declares no [[search_engines]] -- a stale key outliving its manifest table. Next step: remove that key (that key only), then re-run this check.`);
    } else {
        for (const d of diffKey(where, tracked.SearchEngines, expected)) failures.push(`${d} -- stale output. Next step: ${COPY_STEP}.`);
    }

    // --- 3. no configured name collides with a shipped one -------------------
    const dumpPath = join(root, DUMP_REL);
    if (!existsSync(dumpPath)) {
        if (engines.length > 0) skipped.push(`${DUMP_REL} is absent (upstream/ not fetched) -- shipped-name collision unchecked; run scripts/fetch-upstream.sh to cover it.`);
    } else {
        let shipped = null;
        try {
            const dump = JSON.parse(readFileSync(dumpPath, 'utf8'));
            const records = Array.isArray(dump?.data) ? dump.data : null;
            if (records !== null) {
                shipped = new Map(records
                    .filter(r => r?.recordType === 'engine' && typeof r?.base?.name === 'string')
                    .map(r => [r.base.name.toLowerCase(), r.base.name]));
            }
        } catch {
            shipped = null;
        }
        if (shipped === null || shipped.size === 0) {
            failures.push(`${DUMP_REL} carries no engine records with a name, so shipped-name collision cannot be checked -- the dump's shape changed. Next step: re-derive where this check reads engine names.`);
        } else {
            for (const e of engines) {
                const hit = typeof e?.name === 'string' ? shipped.get(e.name.toLowerCase()) : undefined;
                if (hit !== undefined) {
                    failures.push(`the [[search_engines]] entry named ${JSON.stringify(e.name)} has the same name as the engine ${JSON.stringify(hit)} Firefox ships, and the browser drops a second engine of the same name without a word. Next step: give it a name of its own in ${MANIFEST_REL}, then run ${RERUN_GENERATE}.`);
                }
            }
        }
    }

    // --- 4. every template is https and holds {searchTerms} ------------------
    const templates = [];
    for (const e of engines) {
        templates.push([`the [[search_engines]] entry named ${JSON.stringify(e?.name)}: url`, e?.url]);
        if (e?.suggest_url !== undefined) templates.push([`the [[search_engines]] entry named ${JSON.stringify(e?.name)}: suggest_url`, e.suggest_url]);
    }
    for (const e of Array.isArray(tracked.SearchEngines?.Add) ? tracked.SearchEngines.Add : []) {
        templates.push([`${where}, engine ${JSON.stringify(e?.Name)}: URLTemplate`, e?.URLTemplate]);
        if (e?.SuggestURLTemplate !== undefined) templates.push([`${where}, engine ${JSON.stringify(e?.Name)}: SuggestURLTemplate`, e.SuggestURLTemplate]);
    }
    for (const [label, value] of templates) {
        if (typeof value !== 'string' || !TEMPLATE.test(value)) {
            failures.push(`${label} is ${JSON.stringify(value)}, which is not an https address containing {searchTerms}. Next step: correct it in ${MANIFEST_REL}, run ${RERUN_GENERATE}, then ${COPY_STEP}.`);
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
    console.log(`${NAME}: PASS -- tracked key, derived fragment, shipped-name collision and templates agree`);
}

// ---------------------------------------------------------------- self-test

// Synthetic fixture: the shipped manifest with its [[search_engines]]
// sections removed and Acme entries appended, plus a synthetic shipped-engine
// dump, so no plant depends on upstream/ or on the shipped engine choice.
const ENGINE_A = ['name = "Acme Search"', 'url = "https://search.example.org/?q={searchTerms}"', 'suggest_url = "https://search.example.org/suggest?q={searchTerms}"'];
const ENGINE_B = ['name = "Acme Wiki"', 'url = "https://wiki.example.org/find?term={searchTerms}"'];
const SHIPPED_PLANT = 'Acme Shipped';

function enginesBlock(entries) {
    return entries.map(lines => `[[search_engines]]\n${lines.join('\n')}`).join('\n\n');
}

function fixtureManifest(entries) {
    const base = readFileSync(join(REPO_ROOT, MANIFEST_REL), 'utf8').replace(/^\[\[search_engines\]\]\n(?:[^[\n].*\n)*/gm, '');
    return `${base}\n${enginesBlock(entries)}\n`;
}

function setupFixture(dir, entries) {
    writeFileSync(join(dir, MANIFEST_REL), fixtureManifest(entries), 'utf8');
    mkdirSync(dirname(join(dir, DUMP_REL)), { recursive: true });
    writeFileSync(join(dir, DUMP_REL), `${JSON.stringify({ data: [{ recordType: 'engine', identifier: 'acme-shipped', base: { name: SHIPPED_PLANT } }] })}\n`, 'utf8');
    mkdirSync(dirname(join(dir, POLICY_REL)), { recursive: true });
    copyFileSync(join(REPO_ROOT, POLICY_REL), join(dir, POLICY_REL));
    const { failures, config } = resolveConfig(join(dir, MANIFEST_REL), undefined);
    if (failures.length > 0) return { resolveFailures: failures };
    const fragment = emitSearchEngines(config, { id: 'dev' });
    mkdirSync(join(dir, 'generated'), { recursive: true });
    writeFileSync(join(dir, FRAGMENT_REL), fragment, 'utf8');
    const policy = JSON.parse(readFileSync(join(dir, POLICY_REL), 'utf8'));
    policy.policies.SearchEngines = JSON.parse(fragment);
    writeFileSync(join(dir, POLICY_REL), `${JSON.stringify(policy, null, 2)}\n`, 'utf8');
    return { resolveFailures: [] };
}

function mutatePolicy(dir, fn) {
    const p = join(dir, POLICY_REL);
    const policy = JSON.parse(readFileSync(p, 'utf8'));
    fn(policy.policies.SearchEngines);
    writeFileSync(p, `${JSON.stringify(policy, null, 2)}\n`, 'utf8');
}

function selfTest() {
    let failed = 0;
    const complain = (name, why) => {
        console.error(`${NAME}: --self-test FAIL -- '${name}' ${why}`);
        failed += 1;
    };
    const withFixture = (name, entries, plant, token, extra = () => true) => {
        const dir = mkdtempSync(join(tmpdir(), 'search-engines-selftest-'));
        try {
            const setup = setupFixture(dir, entries);
            let failures;
            if (plant === null) {
                failures = setup.resolveFailures.length > 0
                    ? setup.resolveFailures.map(f => `${MANIFEST_REL} is red: ${f}`)
                    : runChecks(dir).failures;
                if (token === null) {
                    if (failures.length > 0) complain(name, `is red, so the plants below would mean nothing: ${failures.join(' | ')}`);
                    else console.log(`  ok  ${name} -> green`);
                    return;
                }
            } else {
                if (setup.resolveFailures.length > 0) {
                    complain(name, `fixture is red for an unrelated reason: ${setup.resolveFailures.join(' | ')}`);
                    return;
                }
                plant(dir);
                failures = runChecks(dir).failures;
            }
            if (!failures.some(f => f.includes(token) && extra(f))) {
                complain(name, `did not go red naming ${JSON.stringify(token)}; got: ${failures.join(' | ') || '(no failures at all)'}`);
            } else {
                console.log(`  ok  ${name} -> red, naming ${JSON.stringify(token)}`);
            }
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    };

    const control = runChecks(REPO_ROOT);
    if (control.failures.length > 0) complain('unmutated control', `is already red: ${control.failures.join(' | ')}`);
    else console.log('  ok  unmutated control -> green');

    withFixture('unmutated fixture', [ENGINE_A, ENGINE_B], null, null);

    // Plant 1: a tracked engine outliving its manifest entry.
    withFixture('stale tracked engine', [ENGINE_A], dir => mutatePolicy(dir, se => se.Add.push({
        Name: 'Acme Gone', URLTemplate: 'https://gone.example.org/?q={searchTerms}',
    })), 'Acme Gone', f => f.includes('no longer declares'));

    // Plant 2: a configured name equal (case aside) to a shipped name.
    withFixture('shipped-name collision', [ENGINE_A, ['name = "acme shipped"', 'url = "https://shipped.example.org/?q={searchTerms}"']],
        () => {}, SHIPPED_PLANT, f => f.includes('Firefox ships'));

    // Plant 3: a url without {searchTerms} -- generate's own validation
    // refuses it naming the entry, so the gate's step 0 goes red.
    withFixture('url without {searchTerms}', [ENGINE_A, ['name = "Acme Broken"', 'url = "https://broken.example.org/?q=fixed"']],
        null, 'Acme Broken', f => f.includes('{searchTerms}'));

    // Plant 4: a key the emission does not carry, in the tracked policy.
    withFixture('extra policy key', [ENGINE_A, ENGINE_B], dir => mutatePolicy(dir, se => { se.Remove = ['Acme Other']; }),
        '"Remove"', f => f.includes(POLICY_REL));

    if (failed > 0) return 1;
    console.log(`${NAME}: --self-test PASS -- 4 planted faults all went red, controls green`);
    return 0;
}

if (SELF_TEST) {
    process.exit(selfTest());
} else {
    main();
}
