#!/usr/bin/env node
// scripts/verify-win-matrix-record.mjs
//
// The win-matrix-record row (Phase 54, MTX-01 and UPD-31). It reads the single-writer matrix record the
// host driver (scripts/matrix/win-matrix-run.sh) writes, and derives the verdict of every cell at check time:
//
//  1. cells         the five cells install, launch, update, uninstall and no-residue are present, each
//                   with a verdict (PASS or FAIL) and non-empty verbatim evidence. A missing cell, a bare
//                   verdict without evidence, or an unknown verdict is red naming the cell.
//  2. build target  the record's build_target equals the application.ini BUILD_TARGET the matrix built,
//                   parsed from the record's application.ini text, never a copied string. Empty is red.
//  3. registry      the no-residue diff names the fork root Software\PowerBrowser and does not touch
//                   Software\Mozilla. A diff touching Software\Mozilla is red naming the key.
//  4. smartscreen   the launch cell carries the SmartScreen block text verbatim (SEC-03 unsigned
//                   copy). Absent is red naming the cell.
//  5. background    the background-task cell (UPD-31) is either verified (task entry, backgroundupdate.moz_log
//                   and a staged apply while closed) or deferred with the exact BackgroundUpdate REASON value
//                   and the scheduler error. Deferred without a reason is red naming the cell. The maintenance
//                   service is never recorded as enabled.
//  6. vacuity       an unreadable record or zero parsed cells is FAIL naming the cause, never green.
//
// Instrument: JSON.parse of the record (the host driver writes JSON). The full row reads the live record path
// the owner's run produces; that run needs the pkg-win11 guest, so the full tier FAILs naming the record when
// it is absent. The self-test writes fixtures into a mkdtemp directory only and removes them.
//
// Honestly --quick: this file is full tier in the registry because the live record exists only after the
// owner's guest run; the self-test row is hermetic and runs over fixtures.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'win-matrix-record';
const SELF_REL = 'scripts/verify-win-matrix-record.mjs';
const RECORD_REL = 'scripts/matrix/win-matrix-record.json';
const CELLS = ['install', 'launch', 'update', 'uninstall', 'no-residue'];
const VERDICTS = new Set(['PASS', 'FAIL']);
const FORK_ROOT = 'Software\\PowerBrowser';
const UPSTREAM_ROOT = 'Software\\Mozilla';
const SMARTSCREEN = 'Windows protected your PC';
const REASONS = ['APPBASEDIR_NOT_WRITABLE', 'SERVICE_REGISTRY_KEY_MISSING', 'NO_APP_UPDATE_BACKGROUND_ENABLED'];

const args = process.argv.slice(2);
for (const a of args) {
    if (a !== '--self-test') {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
        console.error(`  Next step: run: node ${SELF_REL}, or add --self-test to prove the rule discriminates.`);
        process.exit(2);
    }
}

function readText(path) {
    try {
        return readFileSync(path, 'utf8');
    } catch {
        return null;
    }
}

function runChecks(recordText, { label = RECORD_REL } = {}) {
    const failures = [];
    const fail = (cell, rule, msg) => failures.push({ file: label, cell, rule, msg });
    if (recordText === null) {
        fail('(record)', 'vacuity', `${label} is absent. Next step: run the matrix at the 54-04 owner checkpoint: scripts/matrix/win-matrix-run.sh.`);
        return { failures, cells: 0 };
    }
    let rec;
    try {
        rec = JSON.parse(recordText);
    } catch (e) {
        fail('(record)', 'vacuity', `does not parse as JSON (${e.message}). Next step: regenerate the record with win-matrix-run.sh.`);
        return { failures, cells: 0 };
    }
    const cells = rec && typeof rec.cells === 'object' ? rec.cells : {};
    const names = Object.keys(cells);
    if (names.length === 0) {
        fail('(record)', 'vacuity', `carries zero cells, so nothing is verified. Next step: rerun the matrix.`);
        return { failures, cells: 0 };
    }

    // 1. the five cells, each with a verdict and verbatim evidence
    for (const c of CELLS) {
        const cell = cells[c];
        if (cell === undefined) {
            fail(c, 'cells', `cell '${c}' is missing from the record. Next step: rerun the matrix so every cell writes a verdict.`);
            continue;
        }
        if (!VERDICTS.has(cell.verdict)) fail(c, 'cells', `cell '${c}' carries verdict ${JSON.stringify(cell.verdict ?? null)}, not PASS or FAIL. Next step: rerun the cell.`);
        if (typeof cell.evidence !== 'string' || cell.evidence.trim() === '') fail(c, 'cells', `cell '${c}' has no verbatim evidence. Next step: capture the guest output for the cell.`);
    }

    // 2. build target, parsed from the application.ini text the matrix captured
    const ini = typeof rec.application_ini === 'string' ? rec.application_ini : '';
    const built = /^BUILD_TARGET=(\S+)$/m.exec(ini)?.[1] ?? '';
    if (built === '') fail('(record)', 'build-target', `has no BUILD_TARGET parsed from application.ini. Next step: capture application.ini from the built tree.`);
    if (rec.build_target !== built) fail('(record)', 'build-target', `build_target ${JSON.stringify(rec.build_target ?? null)} does not equal the BUILD_TARGET ${JSON.stringify(built)} parsed from application.ini. Next step: take it from the parse, not a copied string.`);

    // 3. registry diff: fork root named, upstream root untouched
    const diff = typeof cells['no-residue']?.registry_diff === 'string' ? cells['no-residue'].registry_diff : '';
    if (!diff.includes(FORK_ROOT)) fail('no-residue', 'registry', `the registry diff does not name the fork root ${FORK_ROOT}. Next step: capture both hives in the no-residue cell.`);
    if (diff.includes(UPSTREAM_ROOT)) fail('no-residue', 'registry', `the registry diff touches ${UPSTREAM_ROOT}, which must stay untouched. Next step: move the write under ${FORK_ROOT}.`);

    // 4. SmartScreen block present verbatim in the launch cell
    if (!String(cells.launch?.evidence ?? '').includes(SMARTSCREEN)) fail('launch', 'smartscreen', `the launch cell lacks the SmartScreen block text '${SMARTSCREEN}' verbatim. Next step: capture the SEC-03 warning from the guest.`);

    // 5. background task: verified, or deferred with a REASON and a scheduler error
    const bg = cells.background;
    if (bg === undefined) {
        fail('background', 'background', `the background-task cell is missing. Next step: record it verified, or deferred with its REASON.`);
    } else if (bg.state === 'verified') {
        const ev = String(bg.evidence ?? '');
        if (!/backgroundupdate\.moz_log/.test(ev) || !/tasks?\b/i.test(ev) || !/staged/i.test(ev)) {
            fail('background', 'background', `is recorded verified without the task entry, backgroundupdate.moz_log and a staged apply while closed. Next step: record the three observables or defer with a reason.`);
        }
    } else if (bg.state === 'deferred') {
        if (!REASONS.includes(bg.reason) || typeof bg.scheduler_error !== 'string' || bg.scheduler_error.trim() === '') {
            fail('background', 'background', `is deferred without an exact BackgroundUpdate REASON (${REASONS.join(', ')}) and a scheduler error. Next step: record the reason the guest reported.`);
        }
    } else {
        fail('background', 'background', `carries state ${JSON.stringify(bg.state ?? null)}, not verified or deferred. Next step: resolve the cell.`);
    }
    if (rec.maintenance_service_enabled === true) fail('(record)', 'background', `records the maintenance service as enabled. It must stay disabled (--disable-maintenance-service). Next step: rebuild without that service.`);

    return { failures, cells: names.length };
}

const fmt = f => `${f.file} cell ${f.cell} [${f.rule}]: ${f.msg}`;

// A fixture record: every cell PASS, the background cell verified, the fork-root diff only.
function goodRecord() {
    return {
        build_target: 'x86_64-pc-windows-msvc',
        application_ini: '[App]\nBUILD_TARGET=x86_64-pc-windows-msvc\n',
        maintenance_service_enabled: false,
        cells: {
            install: { verdict: 'PASS', evidence: 'setup.exe exited 0; PowerBrowser.exe present' },
            launch: { verdict: 'PASS', evidence: 'Windows protected your PC\nprobe window opened' },
            update: { verdict: 'PASS', evidence: 'version N+1 with the sidecar running at apply time; no tobedeleted residue' },
            uninstall: { verdict: 'PASS', evidence: 'uninstall exited 0' },
            'no-residue': { verdict: 'PASS', evidence: 'diff clean', registry_diff: `+ ${FORK_ROOT}\\PowerBrowser\\Launcher` },
            background: { state: 'verified', evidence: 'task entry present; backgroundupdate.moz_log written; staged update applied while closed' },
        },
    };
}

function selfTest() {
    const dir = mkdtempSync(join(tmpdir(), 'win-matrix-record-selftest-'));
    try {
        const json = o => JSON.stringify(o, null, 2);
        const good = json(goodRecord());
        const baseline = runChecks(good);
        if (baseline.failures.length > 0) {
            console.error(`${NAME}: --self-test FAIL -- the good fixture is already red, so the plants would mean nothing:`);
            baseline.failures.forEach(f => console.error(`  ${fmt(f)}`));
            return 1;
        }
        console.log(`  ok  good fixture -> green (${baseline.cells} cell(s))`);
        const mut = fn => { const o = goodRecord(); fn(o); return json(o); };
        const plants = [
            ['update cell missing', mut(o => { delete o.cells.update; }), 'cells', 'update'],
            ['empty build target', mut(o => { o.build_target = ''; }), 'build-target', 'BUILD_TARGET'],
            ['Software\\Mozilla touched', mut(o => { o.cells['no-residue'].registry_diff += `\n+ ${UPSTREAM_ROOT}\\Run`; }), 'registry', UPSTREAM_ROOT],
            ['SmartScreen block absent', mut(o => { o.cells.launch.evidence = 'probe window opened'; }), 'smartscreen', SMARTSCREEN],
            ['background deferred without a reason', mut(o => { o.cells.background = { state: 'deferred', scheduler_error: '0x80070005' }; }), 'background', 'REASON'],
            ['bare RED verdict without evidence', mut(o => { o.cells.install = { verdict: 'FAIL', evidence: '' }; }), 'cells', 'install'],
            ['maintenance service recorded enabled', mut(o => { o.maintenance_service_enabled = true; }), 'background', 'maintenance service'],
        ];
        let failed = 0;
        for (const [name, text, rule, value] of plants) {
            const { failures } = runChecks(text);
            const hit = failures.some(f => f.rule === rule && (f.msg.includes(value) || f.cell.includes(value)));
            if (hit) console.log(`  ok  ${name} -> red, naming [${rule}] and '${value}'`);
            else { console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red naming [${rule}] and '${value}'; got: ${failures.map(fmt).join(' | ') || '(no failures at all)'}`); failed += 1; }
        }
        // Fixture-only: a five-cell record from a directory the self-test owns; a stale lock is refused by the driver, not here.
        writeFileSync(join(dir, 'empty.json'), '{"cells":{}}');
        const zero = runChecks(readText(join(dir, 'empty.json')));
        if (zero.failures.some(f => f.rule === 'vacuity')) console.log('  ok  zero-cell record -> red, naming [vacuity] and zero cells');
        else { console.error(`${NAME}: --self-test FAIL -- a zero-cell record was not red as vacuity`); failed += 1; }
        if (failed > 0) return 1;
        console.log(`${NAME}: --self-test PASS -- the good fixture is green and every planted fault went red naming the cell and the cause. It writes only mkdtemp fixtures, removed at once.`);
        return 0;
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

function main() {
    if (args.includes('--self-test')) return selfTest();
    const path = join(REPO_ROOT, RECORD_REL);
    const { failures, cells } = runChecks(readText(path), { label: RECORD_REL });
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} problem(s) with the matrix record.`);
        failures.forEach(f => console.error(`  ${fmt(f)}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- ${RECORD_REL} carries ${cells} cell(s), each with a verdict and verbatim evidence; the BUILD_TARGET matches the built application.ini; the registry diff names ${FORK_ROOT} and leaves ${UPSTREAM_ROOT} untouched; the SmartScreen block is present; the background cell is verified or deferred with its REASON.`);
    return 0;
}

process.exit(main());
