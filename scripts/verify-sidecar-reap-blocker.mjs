#!/usr/bin/env node
// scripts/verify-sidecar-reap-blocker.mjs
//
// The sidecar-reap-blocker row (Phase 54, UPD-30). The Windows updater renames files that a live
// node.exe may hold, so quit and restart must reap the sidecar first. The row derives, from the tree
// at check time, that:
//
//  1. registration  PowerBrowserAPI.addSidecarReapBlocker registers the blocker named
//                   "PowerBrowser: reap sidecar" on AsyncShutdown.quitApplicationGranted, and
//                   TheiaService.start() calls it. Quit and restart both reach quit-application-granted
//                   (restartToUpdate quits with eRestart), so one registration covers both paths.
//  2. bound         TheiaService.stopAndReap polls the sidecar pid, reads killGraceMs, compares a
//                   deadline and sleeps 100 ms per poll, so the wait is bounded and cannot hang shutdown.
//  3. catalogue     powerbrowser/INTERNAL-APIS.md has a table row naming "reap sidecar" whose File:Line
//                   cell is PowerBrowserAPI.sys.mjs:<the line of the AsyncShutdown addBlocker call>.
//  4. vacuity       an unreadable file or an absent function is FAIL naming the cause, never green.
//
// Honestly --quick: it reads three tree files as text. Its self-test plants each fault in memory and
// writes nothing. It does not build, open a browser or display, or reach the network. The live reap
// (the version flip with the sidecar running at apply time) is the matrix's update cell, not this row.

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'sidecar-reap-blocker';
const SELF_REL = 'scripts/verify-sidecar-reap-blocker.mjs';
const API_REL = 'powerbrowser/shell/PowerBrowserAPI.sys.mjs';
const THEIA_REL = 'powerbrowser/shell/TheiaService.sys.mjs';
const CATALOGUE_REL = 'powerbrowser/INTERNAL-APIS.md';
const BLOCKER_NAME = 'PowerBrowser: reap sidecar';
const REGISTER_FN = 'addSidecarReapBlocker';

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

// The text of a method body starting at `header` (a regex matching its opening line), by brace depth.
function bodyOf(text, header) {
    const m = header.exec(text);
    if (m === null) return null;
    let depth = 0;
    let started = false;
    for (let i = m.index; i < text.length; i += 1) {
        if (text[i] === '{') { depth += 1; started = true; }
        else if (text[i] === '}') {
            depth -= 1;
            if (started && depth === 0) return { body: text.slice(m.index, i + 1), line: text.slice(0, m.index).split('\n').length };
        }
    }
    return null;
}

function runChecks(root, overrides = {}) {
    const failures = [];
    const fail = (file, rule, msg) => failures.push({ file, rule, msg });

    const api = overrides.api !== undefined ? overrides.api : readText(root, API_REL);
    const theia = overrides.theia !== undefined ? overrides.theia : readText(root, THEIA_REL);
    const catalogue = overrides.catalogue !== undefined ? overrides.catalogue : readText(root, CATALOGUE_REL);
    if (api === null) { fail(API_REL, 'vacuity', `could not be read. Next step: restore ${API_REL}.`); return { failures, line: 0 }; }
    if (theia === null) { fail(THEIA_REL, 'vacuity', `could not be read. Next step: restore ${THEIA_REL}.`); return { failures, line: 0 }; }
    if (catalogue === null) { fail(CATALOGUE_REL, 'vacuity', `could not be read. Next step: restore ${CATALOGUE_REL}.`); return { failures, line: 0 }; }

    // 1a. the registration function on the boundary, calling the named AsyncShutdown blocker
    const fnDef = bodyOf(api, new RegExp(`^  ${REGISTER_FN}\\(fn\\) \\{`, 'm'));
    if (fnDef === null) {
        fail(API_REL, 'registration', `has no ${REGISTER_FN}(fn) method. Next step: add the boundary method that registers the reap blocker on AsyncShutdown.quitApplicationGranted.`);
        return { failures, line: 0 };
    }
    const addBlockerAt = fnDef.body.indexOf('quitApplicationGranted.addBlocker(');
    if (addBlockerAt < 0 || !fnDef.body.includes(`"${BLOCKER_NAME}"`)) {
        fail(API_REL, 'registration', `${REGISTER_FN} does not register '${BLOCKER_NAME}' on quitApplicationGranted. Next step: restore the addBlocker call with that name.`);
    }
    const addBlockerLine = fnDef.line + fnDef.body.slice(0, Math.max(addBlockerAt, 0)).split('\n').length - 1;

    // 1b. TheiaService.start() calls the boundary registration
    const startBody = bodyOf(theia, /^  async start\(browserElement\) \{/m) ?? bodyOf(theia, /^  start\(browserElement\) \{/m);
    if (startBody === null || !startBody.body.includes(`PowerBrowserAPI.${REGISTER_FN}(`)) {
        fail(THEIA_REL, 'registration', `start() does not call PowerBrowserAPI.${REGISTER_FN}, so no quit or restart waits on the sidecar reap. Next step: register the blocker once in start().`);
    }

    // 2. the bounded reap
    const reap = bodyOf(theia, /^  async stopAndReap\(\) \{/m);
    if (reap === null) {
        fail(THEIA_REL, 'bound', `has no async stopAndReap() method. Next step: add the bounded reap the blocker awaits.`);
    } else {
        const b = reap.body;
        if (!b.includes('"powerbrowser.sidecar.killGraceMs"')) fail(THEIA_REL, 'bound', `stopAndReap does not read killGraceMs, so the wait has no grace bound. Next step: bound it by powerbrowser.sidecar.killGraceMs.`);
        if (!/Date\.now\(\)\s*>=\s*deadline/.test(b)) fail(THEIA_REL, 'bound', `stopAndReap has no deadline comparison, so an unkillable sidecar would hang shutdown. Next step: return once the deadline passes.`);
        if (!/sleep\(100\)/.test(b)) fail(THEIA_REL, 'bound', `stopAndReap does not poll every 100 ms (sleep(100)). Next step: poll the pid at 100 ms.`);
        if (!/PowerBrowserAPI\.signalBarePid\(pid, 0\)/.test(b)) fail(THEIA_REL, 'bound', `stopAndReap does not test the pid's liveness with signalBarePid(pid, 0). Next step: poll the liveness of the recorded pid.`);
    }

    // 3. catalogue row
    const rows = catalogue.split('\n').filter(l => l.startsWith('|') && /reap sidecar/.test(l));
    const cited = rows.some(r => r.includes(`${API_REL.split('/').pop()}:${addBlockerLine}`));
    if (rows.length === 0 || !cited) {
        fail(CATALOGUE_REL, 'catalogue', `has no table row naming "reap sidecar" with File:Line ${API_REL.split('/').pop()}:${addBlockerLine}. Next step: add the row for the AsyncShutdown addBlocker call.`);
    }
    return { failures, line: addBlockerLine };
}

const fmt = f => `${f.file} [${f.rule}]: ${f.msg}`;

function selfTest() {
    const api = readText(REPO_ROOT, API_REL);
    const theia = readText(REPO_ROOT, THEIA_REL);
    const cat = readText(REPO_ROOT, CATALOGUE_REL);
    if (api === null || theia === null || cat === null) {
        console.error(`${NAME}: --self-test FAIL -- a tree file could not be read. Next step: restore the shell and catalogue files.`);
        return 1;
    }
    const baseline = runChecks(REPO_ROOT, { api, theia, catalogue: cat });
    if (baseline.failures.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- the unmodified tree is already red, so the planted-fault results would mean nothing:`);
        baseline.failures.forEach(f => console.error(`  ${fmt(f)}`));
        return 1;
    }
    console.log(`  ok  baseline -> green (blocker addBlocker at ${API_REL.split('/').pop()} line ${baseline.line})`);

    const plants = [
        ['registration call missing from start()', { theia: theia.replace(`PowerBrowserAPI.${REGISTER_FN}(`, 'PowerBrowserAPI.noopRegistration(') }, 'registration', REGISTER_FN],
        ['unbounded reap (no deadline comparison)', { theia: theia.replace(/Date\.now\(\) >= deadline/, 'false') }, 'bound', 'deadline'],
        ['missing catalogue row', { catalogue: cat.split('\n').filter(l => !/reap sidecar/.test(l)).join('\n') }, 'catalogue', 'reap sidecar'],
    ];
    let failed = 0;
    for (const [name, o, rule, value] of plants) {
        const { failures } = runChecks(REPO_ROOT, { api, theia, catalogue: cat, ...o });
        const hit = failures.some(f => f.rule === rule && f.msg.includes(value));
        if (hit) {
            console.log(`  ok  ${name} -> red, naming [${rule}] and '${value}'`);
        } else {
            console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red naming [${rule}] and '${value}'; got: ${failures.map(fmt).join(' | ') || '(no failures at all)'}`);
            failed += 1;
        }
    }
    if (failed > 0) return 1;
    console.log(`${NAME}: --self-test PASS -- the unmodified blocker is green and ${plants.length} planted faults each went red naming the rule and the value. It writes nothing.`);
    return 0;
}

function main() {
    if (args.includes('--self-test')) return selfTest();
    const { failures, line } = runChecks(REPO_ROOT);
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} problem(s) with the sidecar reap blocker.`);
        failures.forEach(f => console.error(`  ${fmt(f)}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- ${REGISTER_FN} registers '${BLOCKER_NAME}' on AsyncShutdown.quitApplicationGranted at ${API_REL}:${line}, which quit and restart both reach; TheiaService.start() registers it; stopAndReap is bounded by killGraceMs with a 100 ms poll; ${CATALOGUE_REL} cites the registration.`);
    return 0;
}

process.exit(main());
