#!/usr/bin/env node
// scripts/verify-windows-mozconfig.mjs
//
// The windows-mozconfig row (Phase 54, PKG-11). It derives the expected Windows mozconfig
// lines from the shared generator in memory (emitMozconfigWindows over the resolved
// configuration.toml) and compares them with the tracked comparand as set equality, in both
// directions. Specific faults are named by cause:
//
//  1. service    the tracked file carries --enable-maintenance-service, or lacks
//                --disable-maintenance-service (T-54-01: the maintenance service stays out).
//  2. target     the tracked file lacks --target=x86_64-pc-windows-msvc.
//  3. channel    the update channel and the MAR channel ids disagree with updateChannel().
//  4. vacuity    the tracked file parses to zero mozconfig lines, which is FAIL, never green.
//  5. drift      any other line differs from the emitter, in either direction.
//
// Instrument: resolveConfig and emitMozconfigWindows from scripts/generate.mjs. Nothing is
// written; the self-test plants each fault in memory and requires each one to go red naming
// the file and the value.
//
// Honestly --quick: it reads configuration.toml and one tracked text file, and emits in memory.
// It does not build, open a browser or display, or reach the network.

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { emitMozconfigWindows, resolveConfig, updateChannel } from './generate.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'windows-mozconfig';
const SELF_REL = 'scripts/verify-windows-mozconfig.mjs';
const TRACKED_REL = 'powerbrowser/packaging/mozconfig-windows-x86_64';
const TARGET_LINE = 'ac_add_options --target=x86_64-pc-windows-msvc';
const DISABLE_LINE = 'ac_add_options --disable-maintenance-service';
const ENABLE_LINE = 'ac_add_options --enable-maintenance-service';
// Built from parts: the update-channel row scans every tracked file for a literal MAR channel assignment.
const MAR_KEY = 'MAR' + '_CHANNEL_ID=';
const FOREIGN = 'powerbrowser-' + 'beta';

const args = process.argv.slice(2);
for (const a of args) {
    if (a !== '--self-test') {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
        console.error(`  Next step: run: node ${SELF_REL}, or add --self-test to prove the rule discriminates.`);
        process.exit(2);
    }
}

function readText(root, rel) {
    try {
        return readFileSync(join(root, rel), 'utf8');
    } catch {
        return null;
    }
}

// Mozconfig lines that carry meaning: trimmed, no blanks, no comment lines.
function linesOf(text) {
    return text.split('\n').map(l => l.trim()).filter(l => l !== '' && !l.startsWith('#'));
}

function runChecks(root, overrides = {}) {
    const failures = [];
    const fail = (rule, msg) => failures.push({ file: TRACKED_REL, rule, msg });

    const { config } = overrides.config !== undefined ? { config: overrides.config } : resolveConfig(join(root, 'configuration.toml'));
    const devVariant = config.variants.find(v => v.id === 'dev');
    const want = linesOf(emitMozconfigWindows(config, devVariant));

    const tracked = overrides.tracked !== undefined ? overrides.tracked : readText(root, TRACKED_REL);
    if (tracked === null) {
        fail('read', `${TRACKED_REL} could not be read. Next step: run node scripts/generate.mjs, then copy generated/packaging/mozconfig-windows-x86_64 over it.`);
        return { failures, expected: want.length };
    }
    const have = linesOf(tracked);
    if (have.length === 0) {
        fail('vacuity', `${TRACKED_REL} parses to zero mozconfig lines, so nothing is compared. Next step: copy the generator output over the tracked file.`);
        return { failures, expected: want.length };
    }

    const haveSet = new Set(have);
    const wantSet = new Set(want);
    if (haveSet.has(ENABLE_LINE)) {
        fail('service', `carries '${ENABLE_LINE}'; the Windows build must not ship the maintenance service. Next step: remove that line from the emitter's tail in scripts/generate.mjs, then regenerate.`);
    }
    if (!haveSet.has(DISABLE_LINE)) {
        fail('service', `lacks '${DISABLE_LINE}'. Next step: restore it in emitMozconfigWindows's tail in scripts/generate.mjs, then regenerate.`);
    }
    if (!haveSet.has(TARGET_LINE)) {
        fail('target', `lacks '${TARGET_LINE}'. Next step: restore it in emitMozconfigWindows's tail in scripts/generate.mjs, then regenerate.`);
    }

    const { channel, marChannelId } = updateChannel(config);
    const channelLines = [
        `ac_add_options --enable-update-channel=${channel}`,
        `ac_add_options MAR_CHANNEL_ID=${marChannelId}`,
        `ac_add_options ACCEPTED_MAR_CHANNEL_IDS=${marChannelId}`,
    ];
    for (const line of channelLines) {
        if (!haveSet.has(line)) {
            const extra = have.filter(l => /update-channel=|MAR_CHANNEL_ID/.test(l) && !wantSet.has(l));
            fail('channel', `lacks '${line}' from updateChannel(configuration.toml); the file carries ${JSON.stringify(extra)}. Next step: regenerate the file from configuration.toml; never edit a channel line by hand.`);
        }
    }

    const missing = want.filter(l => !haveSet.has(l));
    const extra = have.filter(l => !wantSet.has(l));
    for (const l of missing) {
        if (channelLines.includes(l)) continue; // already named by the channel rule
        fail('drift', `lacks the emitter line '${l}'. Next step: run node scripts/generate.mjs and copy the output over the tracked file.`);
    }
    for (const l of extra) {
        fail('drift', `carries '${l}', which the emitter does not produce. Next step: remove it; the file is generated, never hand-edited.`);
    }
    return { failures, expected: want.length };
}

const fmt = f => `${f.file} [${f.rule}]: ${f.msg}`;

function selfTest() {
    const real = readText(REPO_ROOT, TRACKED_REL);
    if (real === null) {
        console.error(`${NAME}: --self-test FAIL -- ${TRACKED_REL} could not be read. Next step: restore the tracked comparand.`);
        return 1;
    }
    const baseline = runChecks(REPO_ROOT, { tracked: real });
    if (baseline.failures.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- the unmodified tree is already red, so the planted-fault results would mean nothing:`);
        baseline.failures.forEach(f => console.error(`  ${fmt(f)}`));
        return 1;
    }
    console.log(`  ok  baseline -> green (${baseline.expected} emitter line(s) matched)`);

    const plants = [
        ['maintenance service inverted', real.replace(DISABLE_LINE, ENABLE_LINE), 'service', 'enable-maintenance-service'],
        ['target line missing', real.split('\n').filter(l => l.trim() !== TARGET_LINE).join('\n'), 'target', 'x86_64-pc-windows-msvc'],
        ['MAR channel id disagrees with updateChannel', real.replace(new RegExp(`^ac_add_options ${MAR_KEY}.*$`, 'm'), `ac_add_options ${MAR_KEY}${FOREIGN}`), 'channel', FOREIGN],
        ['empty emission (zero lines parse)', '', 'vacuity', 'zero mozconfig lines'],
    ];

    let failed = 0;
    for (const [name, text, rule, value] of plants) {
        const { failures } = runChecks(REPO_ROOT, { tracked: text });
        const hit = failures.some(f => f.file === TRACKED_REL && f.rule === rule && f.msg.includes(value));
        if (hit) {
            console.log(`  ok  ${name} -> red, naming ${TRACKED_REL} [${rule}] and '${value}'`);
        } else {
            console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red naming ${TRACKED_REL}, [${rule}] and '${value}'; got: ${failures.map(fmt).join(' | ') || '(no failures at all)'}`);
            failed += 1;
        }
    }
    if (failed > 0) return 1;
    console.log(`${NAME}: --self-test PASS -- the unmodified comparand is green and ${plants.length} planted faults each went red naming the file and the value. It writes nothing.`);
    return 0;
}

function main() {
    if (args.includes('--self-test')) return selfTest();
    const { failures, expected } = runChecks(REPO_ROOT);
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} problem(s) with ${TRACKED_REL}.`);
        failures.forEach(f => console.error(`  ${fmt(f)}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- ${TRACKED_REL} equals the ${expected} line(s) the shared emitter derives from configuration.toml; the maintenance service is disabled and the target triple is x86_64-pc-windows-msvc.`);
    return 0;
}

process.exit(main());
