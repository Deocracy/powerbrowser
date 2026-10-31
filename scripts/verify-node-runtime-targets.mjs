#!/usr/bin/env node
// scripts/verify-node-runtime-targets.mjs
//
// The node-runtime-targets row (Phase 54, PKG-13 target set). It reads
// powerbrowser/packaging/node-runtime.json at check time and compares its key set with the
// per-target set the tree declares, as set equality in both directions:
//
//  1. expected   the Node keys the packagers read (powerbrowser/packaging/package-*.sh:
//                ["<key>"] lookups and NODE_KEY=<key>;), plus the Windows target's declared
//                Node key (WINDOWS_TARGET.node in scripts/generate.mjs). Derived, never copied.
//  2. keys       the file's keys equal the expected set. A missing key (win32-x64 absent) and an
//                extra key are both red, naming the key.
//  3. entries    every entry carries a non-empty version, url and sha256 (64 lowercase hex), and
//                its url embeds its own version string.
//  4. vacuity    an unreadable file, or zero derived or parsed keys, is FAIL naming the cause.
//
// What it does not check: the sha256 value against nodejs.org's SHASUMS256.txt. That
// correctness is the Phase 43 detector's job, recorded in the row comment in verify-platform.sh.
//
// Honestly --quick: it reads JSON and the packager scripts. Its self-test plants each fault in
// memory through runChecks' overrides and writes nothing. It does not build, open a browser or
// display, or reach the network.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { WINDOWS_TARGET } from './generate.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'node-runtime-targets';
const SELF_REL = 'scripts/verify-node-runtime-targets.mjs';
const PIN_REL = 'powerbrowser/packaging/node-runtime.json';
const PACKAGING_REL = 'powerbrowser/packaging';
const SHA256 = /^[0-9a-f]{64}$/;

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

// The per-target Node keys the packagers read, from the tree at check time.
function packagerKeys(root) {
    const keys = new Set();
    let names;
    try {
        names = readdirSync(join(root, PACKAGING_REL)).filter(n => /^package-.*\.sh$/.test(n));
    } catch {
        return keys;
    }
    for (const n of names) {
        const text = readText(root, `${PACKAGING_REL}/${n}`) ?? '';
        for (const m of text.matchAll(/\["([a-z0-9]+-[a-z0-9]+)"\]/g)) keys.add(m[1]);
        for (const m of text.matchAll(/NODE_KEY=([a-z0-9]+-[a-z0-9]+);/g)) keys.add(m[1]);
    }
    keys.add(WINDOWS_TARGET.node);
    return keys;
}

function runChecks(root, overrides = {}) {
    const failures = [];
    const fail = (key, rule, msg) => failures.push({ file: PIN_REL, key, rule, msg });

    const expected = overrides.expected ?? packagerKeys(root);
    if (expected.size === 0) {
        fail('(file)', 'vacuity', `the packagers declare no Node key, so the target set is empty and nothing is compared. Next step: restore the package-*.sh lookups in ${PACKAGING_REL}.`);
        return { failures, keys: 0 };
    }

    const text = overrides.text !== undefined ? overrides.text : readText(root, PIN_REL);
    if (text === null) {
        fail('(file)', 'read', `${PIN_REL} could not be read. Next step: restore the pin file.`);
        return { failures, keys: 0 };
    }
    let pin;
    try {
        pin = JSON.parse(text);
    } catch (e) {
        fail('(file)', 'parse', `does not parse as JSON (${e.message}). Next step: fix the file.`);
        return { failures, keys: 0 };
    }
    if (pin === null || typeof pin !== 'object' || Array.isArray(pin)) {
        fail('(file)', 'parse', 'is not a JSON object of target keys. Next step: fix the file.');
        return { failures, keys: 0 };
    }

    const have = Object.keys(pin);
    if (have.length === 0) {
        fail('(file)', 'vacuity', `${PIN_REL} parses to zero target keys. Next step: restore the per-target entries.`);
        return { failures, keys: 0 };
    }

    for (const k of expected) {
        if (!Object.hasOwn(pin, k)) fail(k, 'keys', `is missing the per-target key '${k}' that the packagers read. Next step: add the ${k} entry with version, url and sha256.`);
    }
    for (const k of have) {
        if (!expected.has(k)) fail(k, 'keys', `carries the key '${k}', which no packager reads. Next step: remove it, or add the packager that consumes it.`);
    }

    for (const k of have) {
        const e = pin[k];
        if (e === null || typeof e !== 'object') {
            fail(k, 'entry', `entry '${k}' is not an object. Next step: give it version, url and sha256.`);
            continue;
        }
        for (const f of ['version', 'url', 'sha256']) {
            if (typeof e[f] !== 'string' || e[f] === '') fail(k, 'entry', `entry '${k}' lacks a non-empty ${f}. Next step: pin the ${f} for '${k}'.`);
        }
        if (typeof e.sha256 === 'string' && e.sha256 !== '' && !SHA256.test(e.sha256)) {
            fail(k, 'entry', `entry '${k}' carries a sha256 that is not 64 lowercase hex characters. Next step: copy the digest from nodejs.org SHASUMS256.txt.`);
        }
        if (typeof e.url === 'string' && typeof e.version === 'string' && e.version !== '' && !e.url.includes(e.version)) {
            fail(k, 'entry', `entry '${k}' has a url that does not embed its version ${e.version} (${e.url}). Next step: point the url at the same version's archive.`);
        }
    }
    return { failures, keys: have.length };
}

const fmt = f => `${f.file} key ${f.key} [${f.rule}]: ${f.msg}`;

function selfTest() {
    const real = readText(REPO_ROOT, PIN_REL);
    if (real === null) {
        console.error(`${NAME}: --self-test FAIL -- ${PIN_REL} could not be read. Next step: restore the pin file.`);
        return 1;
    }
    const baseline = runChecks(REPO_ROOT, { text: real });
    if (baseline.failures.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- the unmodified tree is already red, so the planted-fault results would mean nothing:`);
        baseline.failures.forEach(f => console.error(`  ${fmt(f)}`));
        return 1;
    }
    console.log(`  ok  baseline -> green (${baseline.keys} key(s))`);

    const mutate = fn => {
        const obj = JSON.parse(real);
        fn(obj);
        return JSON.stringify(obj, null, 2);
    };
    const plants = [
        ['win32-x64 key missing', mutate(o => { delete o['win32-x64']; }), 'win32-x64', 'keys', 'win32-x64'],
        ['extra key beside the expected set', mutate(o => { o['linux-arm64'] = { ...o['linux-x64'] }; }), 'linux-arm64', 'keys', 'linux-arm64'],
        ['win32-x64 sha256 missing', mutate(o => { delete o['win32-x64'].sha256; }), 'win32-x64', 'entry', 'sha256'],
        ['win32-x64 url not embedding its version', mutate(o => { o['win32-x64'].version = 'v24.99.0'; }), 'win32-x64', 'entry', 'v24.99.0'],
        ['empty target set (zero keys parse)', '{}', '(file)', 'vacuity', 'zero target keys'],
    ];

    let failed = 0;
    for (const [name, text, key, rule, value] of plants) {
        const { failures } = runChecks(REPO_ROOT, { text });
        const hit = failures.some(f => f.file === PIN_REL && f.key === key && f.rule === rule && f.msg.includes(value));
        if (hit) {
            console.log(`  ok  ${name} -> red, naming ${PIN_REL} key ${key} [${rule}] and '${value}'`);
        } else {
            console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red naming ${PIN_REL}, key ${key}, [${rule}] and '${value}'; got: ${failures.map(fmt).join(' | ') || '(no failures at all)'}`);
            failed += 1;
        }
    }
    // A target the packagers do not read is red as an extra key (the expected set is derived, not copied).
    {
        const { failures } = runChecks(REPO_ROOT, { text: real, expected: new Set(['linux-x64']) });
        const hit = failures.some(f => f.key === 'win32-x64' && f.rule === 'keys');
        if (hit) console.log(`  ok  derived expectation without win32-x64 -> red, naming ${PIN_REL} key win32-x64 [keys]`);
        else { console.error(`${NAME}: --self-test FAIL -- a derived expectation without win32-x64 did not name it`); failed += 1; }
    }
    if (failed > 0) return 1;
    console.log(`${NAME}: --self-test PASS -- the unmodified pin file is green and every planted fault went red naming the key and the cause. It writes nothing.`);
    return 0;
}

function main() {
    if (args.includes('--self-test')) return selfTest();
    const { failures, keys } = runChecks(REPO_ROOT);
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} problem(s) with ${PIN_REL}.`);
        failures.forEach(f => console.error(`  ${fmt(f)}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- ${PIN_REL} carries exactly the ${keys} per-target key(s) the packagers read; every entry has a version, a url embedding it, and a 64-hex sha256.`);
    return 0;
}

process.exit(main());
