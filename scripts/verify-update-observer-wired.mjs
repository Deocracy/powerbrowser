#!/usr/bin/env node
// scripts/verify-update-observer-wired.mjs
//
// The update-observer wiring gate (Phase 46, UPD-18, review CR-01). The
// observer is defined in powerbrowser/shell/PowerBrowserAPI.sys.mjs
// (startUpdateObserver), but a definition that nothing calls pushes nothing.
// This row derives the start and stop touchpoints from the tree at check
// time and requires:
//   1. at least one call to PowerBrowserAPI.startUpdateObserver outside its
//      own definition, in the shell;
//   2. the call's return value is stored on a field of the consumer
//      (TheiaService), and that field is invoked (the stop function) in the
//      consumer's stop path.
// Nothing is hand-listed: the field name comes from the assignment itself.
//
// Static on purpose: text reads only, no build, no browser, so it runs in
// --quick.
//
// Usage:
//   node scripts/verify-update-observer-wired.mjs
//   node scripts/verify-update-observer-wired.mjs --self-test
//
// Exit 0 pass, 1 fail. --self-test plants a removed call site, a dropped stop
// call and a definition-only tree in memory, and requires each to go red
// naming the touchpoint.

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(SELF), '..');
const NAME = 'update-observer-wired';
const SELF_REL = 'scripts/verify-update-observer-wired.mjs';
const SHELL_DIR = 'powerbrowser/shell';
const DEFINER_REL = 'powerbrowser/shell/PowerBrowserAPI.sys.mjs';
const CONSUMER_REL = 'powerbrowser/shell/TheiaService.sys.mjs';
const CALL = 'PowerBrowserAPI.startUpdateObserver(';

const args = process.argv.slice(2);
for (const a of args) {
    if (a !== '--self-test') {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
        console.error(`  Next step: run: node ${SELF_REL}, or add --self-test to prove the wiring check discriminates.`);
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

function shellFiles(root) {
    try {
        return readdirSync(join(root, SHELL_DIR)).filter(f => f.endsWith('.sys.mjs')).map(f => `${SHELL_DIR}/${f}`);
    } catch {
        return [];
    }
}

/** The stop-function field the consumer stores the call's return value on. */
function storedField(consumerSrc) {
    const m = consumerSrc.match(/this\.(\w+)\s*=\s*PowerBrowserAPI\.startUpdateObserver\(/);
    return m ? m[1] : null;
}

export function runChecks(root, overrides = {}) {
    const failures = [];
    const read = overrides.read ?? ((rel) => readText(root, rel));
    const files = overrides.files ?? shellFiles(root);

    const definer = read(DEFINER_REL);
    if (definer === null || !/startUpdateObserver\(\s*theiaBrowser\s*\)\s*\{/.test(definer)) {
        failures.push(`${DEFINER_REL} no longer defines startUpdateObserver, so the observer touchpoint is unproven. Next step: restore the definition or update this row to the new name.`);
    }

    let callSites = 0;
    for (const rel of files) {
        const src = read(rel);
        if (src === null) continue;
        callSites += src.split(CALL).length - 1;
    }
    if (callSites === 0) {
        failures.push(`no call to ${CALL.slice(0, -1)} exists outside its definition in ${SHELL_DIR}/ -- the observer is never started, so no appUpdate push is ever sent (CR-01). Next step: start it from the real startup path in ${CONSUMER_REL} (_swap) and keep the stop function.`);
        return { failures, callSites };
    }

    const consumer = read(CONSUMER_REL);
    if (consumer === null) {
        failures.push(`${CONSUMER_REL} could not be read, so the start path is unproven. Next step: restore it.`);
        return { failures, callSites };
    }
    const field = storedField(consumer);
    if (field === null) {
        failures.push(`${CONSUMER_REL} calls ${CALL.slice(0, -1)} but does not store its stop function on a field (this.<field> = ...), so the observer cannot be detached on shutdown. Next step: assign the return value to a field and invoke it in stop().`);
        return { failures, callSites };
    }
    const invoked = new RegExp(`this\\.${field}\\(\\)`).test(consumer);
    if (!invoked) {
        failures.push(`${CONSUMER_REL} never invokes this.${field}() -- the update observers are not removed on shutdown. Next step: call the stored stop function in stop().`);
    }
    return { failures, callSites };
}

function main() {
    if (args.includes('--self-test')) return selfTest();
    const { failures, callSites } = runChecks(REPO_ROOT);
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} problem(s) with the observer wiring.`);
        failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- startUpdateObserver has ${callSites} call site(s) in the shell and its stop function is invoked on shutdown`);
    return 0;
}

function selfTest() {
    const cache = new Map();
    const realRead = (rel) => {
        if (!cache.has(rel)) cache.set(rel, readText(REPO_ROOT, rel));
        return cache.get(rel);
    };
    const realFiles = shellFiles(REPO_ROOT);
    const baseline = runChecks(REPO_ROOT, { read: realRead, files: realFiles });
    if (baseline.failures.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- the unmodified tree is already red:`);
        baseline.failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log(`  ok  baseline -> green (${baseline.callSites} call site(s))`);

    let failed = 0;
    const plants = [
        ['removed call site (observer never started)', {
            read: (rel) => (rel === CONSUMER_REL ? realRead(rel).replace('PowerBrowserAPI.startUpdateObserver(this._browserElement)', 'null') : realRead(rel)),
            files: realFiles,
        }, 'startUpdateObserver'],
        ['stop function dropped from stop()', {
            read: (rel) => (rel === CONSUMER_REL ? realRead(rel).replace(/this\._updateObserverOff\(\);/, '') : realRead(rel)),
            files: realFiles,
        }, '_updateObserverOff'],
        ['call only in the definer (no consumer)', {
            read: (rel) => (rel === CONSUMER_REL ? realRead(rel).replace(/PowerBrowserAPI\.startUpdateObserver\(/g, 'PowerBrowserAPI.startTabStoreTriggers(') : realRead(rel)),
            files: realFiles,
        }, 'startUpdateObserver'],
    ];
    for (const [name, overrides, needle] of plants) {
        const { failures } = runChecks(REPO_ROOT, overrides);
        if (failures.some(f => f.includes(needle))) {
            console.log(`  ok  ${name} -> red naming '${needle}'`);
        } else {
            console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red naming '${needle}'; got: ${failures.join(' | ') || '(no failures)'}`);
            failed += 1;
        }
    }

    if (failed > 0) return 1;
    console.log(`${NAME}: --self-test PASS -- ${plants.length} planted faults went red naming their touchpoint, and the control stayed green`);
    return 0;
}

process.exit(main());
