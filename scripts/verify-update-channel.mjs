#!/usr/bin/env node
// scripts/verify-update-channel.mjs
//
// The update-channel gate (Phase 40, UPD-11). The update channel is the
// %CHANNEL% segment of every descriptor path, and the MAR channel id is
// baked into every build and every MAR. A consumer naming a different value
// ships updates nobody is offered, or MARs the client refuses. Both values
// derive from one constant, UPDATE_CHANNEL in scripts/generate.mjs, through
// updateChannel(config).
//
//  1. Derivation. Resolve the manifest and emit the .mozconfig TARGETS row
//     in memory. Parse the update channel (--enable-update-channel=), the
//     MAR channel id (MAR_CHANNEL_ID=) and the accepted id
//     (ACCEPTED_MAR_CHANNEL_IDS=). Fail when one is missing, when the
//     accepted id differs from the MAR id, when the channel differs from
//     UPDATE_CHANNEL, or when the MAR id is not <app_basename>-<channel>.
//     The tracked .mozconfig must carry the same three values.
//  2. Consumer sweep over git ls-files minus the EXCLUDED table. Only
//     structured mentions count, each with a kind:
//       channel: --enable-update-channel=X, --channel X, and a descriptor
//                path X/<target>/update.xml
//       MAR:     MAR_CHANNEL_ID=X, ACCEPTED_MAR_CHANNEL_IDS=X,
//                --mar-channel-id X, and a backticked `<app_basename>-X`
//                where X is one of Gecko's update channel names
//     Each mention is compared, exactly and case-sensitively, with the
//     derived value of its OWN kind. A bare substring search for
//     <app_basename>-release would be wrong: that string legitimately names
//     the MAR key store directory and the release runner unit.
//  3. Zero mentions outside .mozconfig is a FAIL: an agreement over nothing
//     is vacuous.
//  4. One update URL source (UPD-12). powerbrowser/distribution/policies.json
//     must carry no AppUpdateURL key at all, whatever its value (an empty
//     string included): the enterprise policy beats application.ini, so a
//     second source could disagree with MOZ_APPUPDATE_HOST from
//     configuration.toml [urls] update. Same fact as the channel: where
//     updates come from.
//
// The consumer list prints sorted by path, then line, so two runs over one
// tree print identical output. This script and its --self-test only read
// the tree; every plant is applied in memory through runChecks' overrides.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { TARGETS, UPDATE_CHANNEL, resolveConfig } from './generate.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'update-channel';
const SELF_REL = 'scripts/verify-update-channel.mjs';

const args = process.argv.slice(2);
for (const a of args) {
    if (a !== '--self-test') {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
        console.error(`  Next step: run: node ${SELF_REL}, or add --self-test to prove the agreement discriminates.`);
        process.exit(2);
    }
}

const MANIFEST_REL = 'configuration.toml';
const MOZCONFIG_REL = '.mozconfig';
const GENERATOR_REL = 'scripts/generate.mjs';
const RERUN_GENERATE = 'node scripts/generate.mjs';
const POLICIES_REL = 'powerbrowser/distribution/policies.json';
const POLICY_KEY = 'AppUpdateURL';

// Paths the sweep does not read. Every entry carries its reason; an entry
// without one is refused at startup, so the table cannot grow silently.
const EXCLUDED = Object.freeze([
    ['.planning/', 'planning history quotes past and hypothetical channel values'],
    ['ledger/', 'ledger history quotes past channel values'],
    ['docs/non-gui/', 'imported review records and executed plans quote past values'],
    ['generated/', 'derived output; its source is checked through the in-memory emit'],
    [SELF_REL, 'self-test fixtures plant wrong values on purpose'],
]);
for (const [prefix, reason] of EXCLUDED) {
    if (typeof reason !== 'string' || reason.trim() === '') {
        console.error(`${NAME}: FAIL -- the exclusion '${prefix}' in ${SELF_REL} carries no reason.`);
        console.error(`  Next step: give the entry a one-line reason, or remove it.`);
        process.exit(2);
    }
}
const excluded = (rel) => EXCLUDED.some(([prefix]) => (prefix.endsWith('/') ? rel.startsWith(prefix) : rel === prefix));

// Gecko's update channel names: a fixed external vocabulary, so a backticked
// `<app_basename>-<word>` such as the updates repository name never counts.
const GECKO_CHANNELS = Object.freeze(['default', 'release', 'esr', 'beta', 'aurora', 'nightly']);
const VALUE = String.raw`([^\s'"\x60\\/(),;\[\]]+)`;
const PLACEHOLDER = /^[$<%{]/;

function mentionPatterns(appBasename) {
    const app = appBasename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return [
        { kind: 'channel', re: new RegExp(String.raw`--enable-update-channel=${VALUE}`, 'g') },
        { kind: 'channel', re: new RegExp(String.raw`--channel[ =]${VALUE}`, 'g') },
        { kind: 'channel', re: new RegExp(String.raw`(?:^|(?<=[\s'"\x60(/]))${VALUE}/[A-Za-z0-9]+_[A-Za-z0-9_.-]+/update\.xml`, 'g') },
        { kind: 'mar', re: new RegExp(String.raw`(?<![A-Za-z_])MAR_CHANNEL_ID=${VALUE}`, 'g') },
        { kind: 'mar', re: new RegExp(String.raw`ACCEPTED_MAR_CHANNEL_IDS=${VALUE}`, 'g') },
        { kind: 'mar', re: new RegExp(String.raw`--mar-channel-id[ =]${VALUE}`, 'g') },
        { kind: 'mar', re: new RegExp(`\x60(${app}-(?:${GECKO_CHANNELS.join('|')}))\x60`, 'g') },
    ];
}

const KIND_LABEL = Object.freeze({ channel: 'update channel', mar: 'MAR channel id' });

function mentionsIn(text, patterns) {
    const found = [];
    text.split('\n').forEach((line, i) => {
        for (const { kind, re } of patterns) {
            for (const m of line.matchAll(re)) {
                const value = m[1].replace(/[.:]+$/, '');
                if (value === '' || PLACEHOLDER.test(value)) continue;
                found.push({ line: i + 1, kind, value });
            }
        }
    });
    return found;
}

function readText(root, rel) {
    try {
        return readFileSync(join(root, rel), 'utf8');
    } catch {
        return null;
    }
}

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

function mozconfigValues(text) {
    const pick = (re) => text.match(re)?.[1] ?? null;
    return {
        channel: pick(/^ac_add_options --enable-update-channel=(\S+)$/m),
        mar: pick(/^ac_add_options MAR_CHANNEL_ID=(\S+)$/m),
        accepted: pick(/^ac_add_options ACCEPTED_MAR_CHANNEL_IDS=(\S+)$/m),
    };
}

function runChecks(root, overrides = {}) {
    const failures = [];
    const consumers = [];
    const read = overrides.read ?? ((rel) => readText(root, rel));

    // --- 1. derivation -----------------------------------------------------
    const resolved = resolveConfig(join(root, MANIFEST_REL));
    if (resolved.config === undefined || resolved.failures.length > 0) {
        failures.push(`${MANIFEST_REL} does not resolve, so no channel can be derived. Next step: run ${RERUN_GENERATE} -- it reports the faulty key.`);
        return { failures, consumers, expected: null };
    }
    const config = resolved.config;
    const appBasename = config.identity.app_basename;
    const target = TARGETS.find(t => t.generated === MOZCONFIG_REL);
    let emitted = overrides.mozconfig;
    if (emitted === undefined) {
        const variant = (config.variants ?? []).find(v => v.id === target?.variant);
        emitted = target ? target.emit(config, variant) : '';
    }
    const derived = mozconfigValues(emitted);
    for (const [key, opt] of [['channel', '--enable-update-channel='], ['mar', 'MAR_CHANNEL_ID='], ['accepted', 'ACCEPTED_MAR_CHANNEL_IDS=']]) {
        if (derived[key] === null) failures.push(`${GENERATOR_REL}'s ${MOZCONFIG_REL} emission carries no ${opt} line, so that value has no source. Next step: restore the line in emitMozconfig.`);
    }
    if (failures.length > 0) return { failures, consumers, expected: null };
    if (derived.channel !== UPDATE_CHANNEL) {
        failures.push(`${GENERATOR_REL}'s ${MOZCONFIG_REL} emission names update channel '${derived.channel}' but UPDATE_CHANNEL is '${UPDATE_CHANNEL}'. Next step: build the line from updateChannel(config) in emitMozconfig.`);
    }
    if (derived.accepted !== derived.mar) {
        failures.push(`${GENERATOR_REL}'s ${MOZCONFIG_REL} emission accepts MAR channel '${derived.accepted}' but stamps '${derived.mar}'; the client would refuse its own MARs. Next step: build both lines from updateChannel(config).marChannelId.`);
    }
    if (derived.mar !== `${appBasename}-${derived.channel}`) {
        failures.push(`${GENERATOR_REL}'s ${MOZCONFIG_REL} emission names MAR channel id '${derived.mar}', not '${appBasename}-${derived.channel}'. Next step: build it from updateChannel(config).marChannelId.`);
    }
    const expected = { channel: derived.channel, mar: derived.mar };

    const tracked = read(MOZCONFIG_REL);
    if (tracked === null) {
        failures.push(`${MOZCONFIG_REL} could not be read. Next step: run ${RERUN_GENERATE} and copy generated/${MOZCONFIG_REL} over it.`);
    } else {
        const got = mozconfigValues(tracked);
        for (const key of ['channel', 'mar', 'accepted']) {
            if (got[key] !== derived[key]) {
                failures.push(`${MOZCONFIG_REL} carries ${key === 'channel' ? 'update channel' : key === 'mar' ? 'MAR channel id' : 'accepted MAR channel id'} '${got[key] ?? '(none)'}' but the emission derives '${derived[key]}'. Next step: run ${RERUN_GENERATE} and copy generated/${MOZCONFIG_REL} over it.`);
            }
        }
    }

    // --- 2. consumer sweep --------------------------------------------------
    const files = overrides.files ?? listTracked(root);
    if (files === null) {
        failures.push(`git ls-files failed, so the consumer set could not be derived. Next step: run this check inside the repository.`);
        return { failures, consumers, expected };
    }
    const patterns = mentionPatterns(appBasename);
    for (const rel of files) {
        if (excluded(rel)) continue;
        const text = read(rel);
        if (text === null || text.includes('\u0000')) continue;
        for (const m of mentionsIn(text, patterns)) {
            consumers.push({ rel, ...m });
            if (m.value !== expected[m.kind]) {
                failures.push(`${rel}:${m.line} names ${KIND_LABEL[m.kind]} '${m.value}' but the derived ${KIND_LABEL[m.kind]} is '${expected[m.kind]}'. Next step: change it to '${expected[m.kind]}' (UPDATE_CHANNEL in ${GENERATOR_REL} is the one source).`);
            }
        }
    }
    consumers.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : a.line - b.line));

    // --- 3. vacuity ---------------------------------------------------------
    if (!consumers.some(c => c.rel !== MOZCONFIG_REL)) {
        failures.push(`${NAME} found no channel mention outside ${MOZCONFIG_REL} -- an agreement over nothing proves nothing. Next step: check the instrument (${SELF_REL}: its exclusion table and mention patterns) and that git ls-files lists the tree.`);
    }

    // --- 4. one update URL source (UPD-12) ---------------------------------
    const policiesText = read(POLICIES_REL);
    if (policiesText === null) {
        failures.push(`${POLICIES_REL} could not be read, so the update URL source is unproven. Next step: restore it.`);
    } else {
        let policies = null;
        try {
            policies = JSON.parse(policiesText)?.policies ?? {};
        } catch {
            failures.push(`${POLICIES_REL} is not valid JSON. Next step: fix the file.`);
        }
        if (policies !== null && Object.hasOwn(policies, POLICY_KEY)) {
            failures.push(`${POLICIES_REL} carries the ${POLICY_KEY} policy (value ${JSON.stringify(policies[POLICY_KEY])}); MOZ_APPUPDATE_HOST from configuration.toml [urls] update must be the only update URL source (UPD-12). Next step: delete the key.`);
        }
    }

    return { failures, consumers, expected, appBasename };
}

function printConsumers(consumers) {
    console.log(`${NAME}: ${consumers.length} consumer mention(s), sorted by path then line:`);
    for (const c of consumers) console.log(`  ${c.rel}:${c.line} ${c.kind} ${c.value}`);
}

function main() {
    if (args.includes('--self-test')) return selfTest();
    const { failures, consumers, expected } = runChecks(REPO_ROOT);
    printConsumers(consumers);
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} problem(s) with the update channel agreement.`);
        failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- update channel '${expected.channel}' and MAR channel id '${expected.mar}' derive from UPDATE_CHANNEL and every structured mention agrees with the value of its own kind; ${POLICIES_REL} carries no update URL`);
    return 0;
}

function selfTest() {
    const cache = new Map();
    const realRead = (rel) => {
        if (!cache.has(rel)) cache.set(rel, readText(REPO_ROOT, rel));
        return cache.get(rel);
    };
    const files = listTracked(REPO_ROOT);
    const baseline = runChecks(REPO_ROOT, { read: realRead, files });
    if (baseline.failures.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- the unmodified tree is already red, so the planted-fault results below would mean nothing:`);
        baseline.failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log(`  ok  baseline -> green`);
    const app = baseline.appBasename;
    const withLine = (target, line) => (rel) => (rel === target ? `${realRead(rel)}\n${line}\n` : realRead(rel));
    const replaced = (target, from, to) => (rel) => (rel === target ? realRead(rel).replace(from, to) : realRead(rel));

    // Key presence is the fault, so the value is free: an https URL and an empty string.
    const withPolicy = (value) => (rel) => {
        if (rel !== POLICIES_REL) return realRead(rel);
        const doc = JSON.parse(realRead(rel));
        doc.policies = { [POLICY_KEY]: value, ...doc.policies };
        return JSON.stringify(doc, null, 2);
    };
    const RELEASING = 'docs/RELEASING.md';
    const BUILD = 'docs/BUILD.md';
    // The plant channel is a literal: `release` is the realistic wrong value.
    const plants = [
        ['descriptor path with channel release', { read: withLine(RELEASING, '`release/Linux_x86_64-gcc3/update.xml`') }, RELEASING, 'release'],
        [`backticked MAR id ${app}-release`, { read: withLine(RELEASING, `The MAR channel id is \`${app}-release\`.`) }, RELEASING, `${app}-release`],
        ['tracked .mozconfig channel release', { read: replaced(MOZCONFIG_REL, '--enable-update-channel=default', '--enable-update-channel=release') }, MOZCONFIG_REL, 'release'],
        [`MAR_CHANNEL_ID=${app}-release in a doc`, { read: withLine(BUILD, `MAR_CHANNEL_ID=${app}-release`) }, BUILD, `${app}-release`],
        ['MAR id under the channel kind (adjacency)', { read: withLine(RELEASING, `--channel ${baseline.expected.mar}`) }, RELEASING, baseline.expected.mar],
        ['letter case: Default is a mismatch', { read: withLine(RELEASING, '`Default/Linux_x86_64-gcc3/update.xml`') }, RELEASING, 'Default'],
        ['emitter names channel release', { read: realRead, mozconfig: realRead(MOZCONFIG_REL).replace('--enable-update-channel=default', '--enable-update-channel=release') }, GENERATOR_REL, 'release'],
        ['no mention outside .mozconfig', { read: realRead, files: [MOZCONFIG_REL] }, NAME, 'no channel mention'],
        ['update-URL policy with an https value', { read: withPolicy(`https://updates.${app}.org/update.xml`) }, POLICIES_REL, POLICY_KEY],
        ['update-URL policy with an empty value', { read: withPolicy('') }, POLICIES_REL, POLICY_KEY],
    ];

    let failed = 0;
    for (const [name, overrides, file, value] of plants) {
        const { failures } = runChecks(REPO_ROOT, { files, ...overrides });
        // A value is named in quotes; the vacuity and policy plants name it in prose.
        const needle = (name === 'no mention outside .mozconfig' || file === POLICIES_REL) ? value : `'${value}'`;
        const hit = failures.some(f => f.includes(file) && f.includes(needle));
        if (hit) {
            console.log(`  ok  ${name} -> red, naming '${file}' and '${value}'`);
        } else {
            console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red naming '${file}' and '${value}'; got: ${failures.join(' | ') || '(no failures at all)'}`);
            failed += 1;
        }
    }

    // Control: the MAR key store and the release runner unit legitimately
    // contain <app_basename>-release and must stay green.
    {
        const control = withLine(RELEASING, `Keys live in \`~/.config/${app}-release/mar-key/\`; the runner is \`github-runner-${app}-release.service\`.`);
        const { failures } = runChecks(REPO_ROOT, { files, read: control });
        if (failures.length === 0) {
            console.log(`  ok  control: MAR key store and runner unit names -> green`);
        } else {
            console.error(`${NAME}: --self-test FAIL -- the control went red: ${failures.join(' | ')}`);
            failed += 1;
        }
    }

    if (failed > 0) return 1;
    console.log(`${NAME}: --self-test PASS -- ${plants.length} planted faults went red naming the drifted file, and the control stayed green`);
    return 0;
}

process.exit(main());
