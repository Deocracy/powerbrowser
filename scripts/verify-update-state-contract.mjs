#!/usr/bin/env node
// scripts/verify-update-state-contract.mjs
//
// The update-service contract gate (Phase 46, UPD-18/19, review CR-02). The
// Gecko update service reports its state as a numeric `long` (`readonly
// attribute long currentState`, upstream/toolkit/mozapps/update/
// nsIUpdateService.idl). The boundary must compare that number against the
// named IDL constant, never against a string and never against a bare number,
// and the constant's name must exist in the IDL the tree ships.
//
// Everything is derived: the IDL is read at check time for the attribute's
// type and for the STATE_* constant names, and the shell is scanned for the
// comparisons. Nothing is hand-listed.
//
// Static on purpose: text reads only, so it runs in --quick.
//
// Usage:
//   node scripts/verify-update-state-contract.mjs
//   node scripts/verify-update-state-contract.mjs --self-test
//
// Exit 0 pass, 1 fail. --self-test plants a string compare, a bare numeric
// compare and a misspelled constant in memory and requires each to go red
// naming the drift.

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(SELF), '..');
const NAME = 'update-state-contract';
const SELF_REL = 'scripts/verify-update-state-contract.mjs';
const IDL_REL = 'upstream/toolkit/mozapps/update/nsIUpdateService.idl';
const SHELL_REL = 'powerbrowser/shell/PowerBrowserAPI.sys.mjs';

const args = process.argv.slice(2);
for (const a of args) {
    if (a !== '--self-test') {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
        console.error(`  Next step: run: node ${SELF_REL}, or add --self-test to prove the contract check discriminates.`);
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

/** The IDL's STATE_* constant names, derived (never hand-kept). */
function deriveStateConstants(idl) {
    const names = new Set();
    for (const m of idl.matchAll(/const\s+long\s+(STATE_[A-Z_]+)\s*=\s*\d+\s*;/g)) names.add(m[1]);
    return names;
}

export function runChecks(root, overrides = {}) {
    const failures = [];
    const read = overrides.read ?? ((rel) => readText(root, rel));

    const idl = read(IDL_REL);
    if (idl === null) {
        failures.push(`${IDL_REL} could not be read, so the currentState contract is unproven. Next step: restore the upstream IDL (never edit upstream/ by hand).`);
        return { failures };
    }
    if (!/readonly\s+attribute\s+long\s+currentState\s*;/.test(idl)) {
        failures.push(`${IDL_REL} no longer declares 'readonly attribute long currentState', so the numeric-state contract is unproven. Next step: re-derive the state mapping from the shipped IDL.`);
    }
    const constants = deriveStateConstants(idl);

    const shell = read(SHELL_REL);
    if (shell === null) {
        failures.push(`${SHELL_REL} could not be read, so the state mapping is unproven. Next step: restore it.`);
        return { failures };
    }

    // The boundary must never compare currentState to a string or a bare number.
    const stringCompare = shell.match(/currentState\s*(?:===|!==|==|!=)\s*['"`]/);
    if (stringCompare) {
        failures.push(`${SHELL_REL} compares currentState to a string literal -- Gecko's currentState is a numeric long, so the compare is always false. Next step: compare against Ci.nsIApplicationUpdateService.STATE_PENDING and map to the contract string at the boundary.`);
    }
    const numericCompare = shell.match(/currentState\s*(?:===|!==|==|!=)\s*\d/);
    if (numericCompare) {
        failures.push(`${SHELL_REL} compares currentState to a bare number -- the value must come from the named IDL constant, not a hand-copied literal. Next step: use Ci.nsIApplicationUpdateService.<STATE_*>.`);
    }

    // Every named state the shell reads must exist in the shipped IDL.
    const referenced = [...shell.matchAll(/nsIApplicationUpdateService\.(STATE_[A-Z_]+)/g)].map(m => m[1]);
    if (!referenced.includes('STATE_PENDING')) {
        failures.push(`${SHELL_REL} does not compare currentState against nsIApplicationUpdateService.STATE_PENDING, so the pending seed cannot render. Next step: restore the constant compare in readUpdateState.`);
    }
    for (const name of new Set(referenced)) {
        if (!constants.has(name)) {
            failures.push(`${SHELL_REL} reads nsIApplicationUpdateService.${name}, which ${IDL_REL} does not declare. Next step: use a STATE_* constant the shipped IDL defines.`);
        }
    }

    // CR-03: the service interface has no readyUpdate attribute. The ready
    // update is read from the update manager's getReadyUpdate(), which the IDL
    // declares on nsIUpdateManager.
    if (/\b(?:svc|service|updateService\(\))\.readyUpdate\b/.test(shell)) {
        failures.push(`${SHELL_REL} reads readyUpdate off the update service -- nsIApplicationUpdateService has no readyUpdate attribute, so the read is always undefined. Next step: read it from nsIUpdateManager.getReadyUpdate().`);
    }
    const managerIface = /interface\s+nsIUpdateManager\s*:[^{]*\{[\s\S]*?Promise\s+getReadyUpdate\s*\(\s*\)\s*;/.test(idl);
    if (!managerIface) {
        failures.push(`${IDL_REL} no longer declares nsIUpdateManager.getReadyUpdate(), so the ready-update read is unproven. Next step: re-derive the read from the shipped IDL.`);
    }
    if (!/nsIUpdateManager\b/.test(shell) || !/\.getReadyUpdate\(\)/.test(shell)) {
        failures.push(`${SHELL_REL} does not read the ready update through nsIUpdateManager.getReadyUpdate(), so the pull path yields no version. Next step: restore readyUpdate() in the update manager.`);
    }

    return { failures, constants: [...constants] };
}

function main() {
    if (args.includes('--self-test')) return selfTest();
    const { failures } = runChecks(REPO_ROOT);
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} problem(s) with the currentState contract.`);
        failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- currentState is compared numerically against IDL-declared STATE_* constants, never a string or a bare number`);
    return 0;
}

function selfTest() {
    const cache = new Map();
    const realRead = (rel) => {
        if (!cache.has(rel)) cache.set(rel, readText(REPO_ROOT, rel));
        return cache.get(rel);
    };
    const baseline = runChecks(REPO_ROOT, { read: realRead });
    if (baseline.failures.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- the unmodified tree is already red:`);
        baseline.failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log(`  ok  baseline -> green (${baseline.constants.length} STATE_* constants derived from the IDL)`);

    const onShell = (fn) => ({ read: (rel) => (rel === SHELL_REL ? fn(realRead(rel)) : realRead(rel)) });
    const plants = [
        ['string compare of currentState', onShell(t => t.replace(/currentState\s*!==\s*Ci\.nsIApplicationUpdateService\.STATE_PENDING/, 'currentState !== "pending"')), 'string literal'],
        ['bare numeric compare of currentState', onShell(t => t.replace(/currentState\s*!==\s*Ci\.nsIApplicationUpdateService\.STATE_PENDING/, 'currentState !== 5')), 'bare number'],
        ['misspelled IDL constant', onShell(t => t.replace('STATE_PENDING', 'STATE_PENDNG')), 'STATE_PENDNG'],
        ['readyUpdate read off the service (the always-undefined read)', onShell(t => t.replace('const ready = await PowerBrowserAPI.readyUpdate();', 'const ready = svc.readyUpdate;')), 'readyUpdate'],
        ['manager read replaced by the attribute form', onShell(t => t.replace('um.getReadyUpdate()', 'um.readyUpdate')), 'getReadyUpdate'],
    ];
    let failed = 0;
    for (const [name, overrides, needle] of plants) {
        // A plant whose search text no longer matches changes nothing and would
        // stay green for the wrong reason: require the planted tree to differ.
        if (overrides.read(SHELL_REL) === realRead(SHELL_REL)) {
            console.error(`${NAME}: --self-test FAIL -- '${name}' did not apply (its search text is gone); the plant proves nothing.`);
            failed += 1;
            continue;
        }
        const { failures } = runChecks(REPO_ROOT, overrides);
        if (failures.some(f => f.includes(needle))) {
            console.log(`  ok  ${name} -> red naming '${needle}'`);
        } else {
            console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red naming '${needle}'; got: ${failures.join(' | ') || '(no failures)'}`);
            failed += 1;
        }
    }

    if (failed > 0) return 1;
    console.log(`${NAME}: --self-test PASS -- ${plants.length} planted faults went red naming their drift, and the control stayed green`);
    return 0;
}

process.exit(main());
