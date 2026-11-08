#!/usr/bin/env node
// scripts/verify-win-matrix-record.mjs
//
// The win-matrix-record row (Phase 54, MTX-01 and UPD-31). It reads the single-writer matrix record that
// scripts/matrix/win-matrix-run.sh builds (through scripts/matrix/win-matrix-record.py) and derives the verdict
// of every cell at check time. The record SHAPE (cell names, keys, verdicts, markers) is read from
// scripts/matrix/win-matrix-schema.json, the one source the writer and this verifier share:
//
//  1. cells         every schema cell is present with exactly the schema's keys, a verdict that is PASS,
//                   and non-empty verbatim evidence. A FAIL cell is red naming the cell, unless it carries an
//                   explicit owner-approved deferral ({owner_approved: true, reason}). A missing cell, a bare
//                   verdict, an unknown verdict or a key the schema does not list is red naming the cell.
//  2. build target  the record's build_target equals the BUILD_TARGET parsed from the application.ini text the
//                   guest printed from the installed tree, never a copied string. Empty is red.
//  3. registry      the no-residue cell carries the keys the installed product wrote (registry_diff, from the
//                   guest's registry export, never empty) and the keys that survived the uninstall
//                   (registry_residue, must be empty). The expected namespace root is DERIVED from the patch
//                   stack: Software\PowerBrowser once patch 040 defines AppRegRoot, else Software\Mozilla, and
//                   the other root must not appear in the diff. Once moved, Software\Mozilla may appear only under
//                   the product's own Software\Mozilla\<binary_name>\ subkey (TaskBarIDs and the launcher subkey,
//                   which compiled readers open), binary_name read from configuration.toml at check time.
//  4. smartscreen   the launch cell's smartscreen field, which the guest filled from a UI Automation probe of
//                   the OS (printed only when the dialog was found), equals the SEC-03 block text. The guest
//                   script must not print that text itself: a line that both names it and prints is red.
//  5. background    the background-task cell (UPD-31) is either verified (task entry, backgroundupdate.moz_log
//                   and a staged apply while closed) or deferred with the exact BackgroundUpdate REASON value
//                   and the scheduler error. The maintenance service is OBSERVED in the guest and must be false;
//                   an unobserved (null) value is red.
//  6. update        the update cell's version_after is non-empty and differs from version_before.
//  7. guest script  every schema marker is printed through $M.<name>.prefix in win-matrix-guest.ps1, and the
//                   inputs volume label the driver uses appears there.
//  8. vacuity       an unreadable record or zero parsed cells is FAIL naming the cause, never green.
//
// Instrument: JSON.parse of the record. The full row reads the live record path the owner's run produces; that
// run needs the pkg-win11 guest, so the full tier FAILs naming the record when it is absent. The self-test runs
// the REAL writer (win-matrix-record.py) over synthetic guest outputs in a mkdtemp directory, so a driver and
// verifier that disagree about the record go red here; it removes the directory afterwards.
//
// Honestly: this file is full tier in the registry because the live record exists only after the owner's guest
// run; the self-test row is hermetic.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'win-matrix-record';
const SELF_REL = 'scripts/verify-win-matrix-record.mjs';
const RECORD_REL = 'scripts/matrix/win-matrix-record.json';
const SCHEMA_REL = 'scripts/matrix/win-matrix-schema.json';
const WRITER_REL = 'scripts/matrix/win-matrix-record.py';
const GUEST_REL = 'scripts/matrix/win-matrix-guest.ps1';
const PATCH_REL = 'patches/040-powerbrowser-nsis.patch';
const FORK_ROOT = 'Software\\PowerBrowser';
const UPSTREAM_ROOT = 'Software\\Mozilla';
// The product's own subkey under the upstream root, kept for compiled readers (patch 045, BLOCKED.md item 2).
// null when configuration.toml cannot be read, so the rule then fails closed on every Software\Mozilla line.
const BINARY_NAME = /^binary_name\s*=\s*"([^"]+)"/m.exec(readFileSync(join(REPO_ROOT, 'configuration.toml'), 'utf8'))?.[1] ?? null;
const KEPT_PREFIX = BINARY_NAME ? `${UPSTREAM_ROOT}\\${BINARY_NAME}\\` : null;
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

const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const sameSet = (a, b) => a.length === b.length && a.every(x => b.includes(x));

// The registry namespace the product is expected to write, derived from the patch stack (BLOCKED.md item 2).
function expectedRoot(patchText) {
    const moved = patchText !== null && /^\+!define AppRegRoot\s+"Software\\\$\{BrandShortName\}"$/m.test(patchText);
    return moved ? { expected: FORK_ROOT, other: UPSTREAM_ROOT, moved, kept: KEPT_PREFIX } : { expected: UPSTREAM_ROOT, other: FORK_ROOT, moved, kept: null };
}

function runChecks(recordText, { label = RECORD_REL, schema, patchText = null, guestText = null } = {}) {
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
    const cells = isObject(rec?.cells) ? rec.cells : {};
    const names = Object.keys(cells);
    if (names.length === 0) {
        fail('(record)', 'vacuity', 'carries zero cells, so nothing is verified. Next step: rerun the matrix.');
        return { failures, cells: 0 };
    }

    // Shape: top-level keys equal the schema's, both directions.
    const topKeys = Object.keys(rec);
    if (!sameSet(topKeys, schema.recordKeys)) {
        fail('(record)', 'shape', `top-level keys ${JSON.stringify(topKeys)} differ from the schema's ${JSON.stringify(schema.recordKeys)}. Next step: write the record only with win-matrix-record.py.`);
    }

    // 1. every schema cell: exact keys, PASS (or an approved deferral), verbatim evidence
    for (const c of schema.cells) {
        const cell = cells[c];
        if (cell === undefined) {
            fail(c, 'cells', `cell '${c}' is missing from the record. Next step: rerun the matrix so every cell writes a verdict.`);
            continue;
        }
        const want = [...schema.cellKeys, ...(schema.extraCellKeys[c] ?? [])];
        const have = Object.keys(cell).filter(k => k !== 'deferral');
        if (!sameSet(have, want)) fail(c, 'shape', `cell '${c}' has keys ${JSON.stringify(have)}, not the schema's ${JSON.stringify(want)}. Next step: write the record only with win-matrix-record.py.`);
        if (!schema.verdicts.includes(cell.verdict)) fail(c, 'cells', `cell '${c}' carries verdict ${JSON.stringify(cell.verdict ?? null)}, not one of ${schema.verdicts.join(' or ')}. Next step: rerun the cell.`);
        if (typeof cell.evidence !== 'string' || cell.evidence.trim() === '') fail(c, 'cells', `cell '${c}' has no verbatim evidence. Next step: capture the guest output for the cell.`);
        if (cell.verdict !== 'PASS') {
            const d = cell.deferral;
            const approved = isObject(d) && d.owner_approved === true && typeof d.reason === 'string' && d.reason.trim() !== '';
            if (!approved) fail(c, 'cells', `cell '${c}' verdict is ${JSON.stringify(cell.verdict ?? null)}, not PASS, and carries no owner-approved deferral ({owner_approved: true, reason}). Evidence: ${String(cell.evidence ?? '').slice(0, 200)}`);
        }
    }

    // 2. build target, parsed from the application.ini text the guest printed
    const ini = typeof rec.application_ini === 'string' ? rec.application_ini : '';
    const built = /^BUILD_TARGET=(\S+)$/m.exec(ini)?.[1] ?? '';
    if (built === '') fail('(record)', 'build-target', 'has no BUILD_TARGET parsed from application.ini. Next step: capture application.ini from the installed tree.');
    if (rec.build_target !== built) fail('(record)', 'build-target', `build_target ${JSON.stringify(rec.build_target ?? null)} does not equal the BUILD_TARGET ${JSON.stringify(built)} parsed from application.ini. Next step: take it from the parse, not a copied string.`);

    // 3. registry: the expected root written, the other untouched, nothing surviving the uninstall
    const root = expectedRoot(patchText);
    const nr = cells['no-residue'] ?? {};
    const diff = typeof nr.registry_diff === 'string' ? nr.registry_diff : '';
    const residue = typeof nr.registry_residue === 'string' ? nr.registry_residue : null;
    if (diff.trim() === '') fail('no-residue', 'registry', 'registry_diff is empty, so the installed product wrote no observed key. Next step: capture the guest registry export.');
    else {
        if (!diff.includes(root.expected)) fail('no-residue', 'registry', `the registry diff does not name ${root.expected}, the root the patch stack writes (${root.moved ? 'patch 040 writes the fork root' : 'BLOCKED.md item 2 is open, so the installer still writes the upstream root'}). Next step: capture both hives.`);
        const stray = diff.split('\n').filter(l => l.includes(root.other) && !(root.kept && l.toLowerCase().includes(root.kept.toLowerCase())));
        if (stray.length > 0) fail('no-residue', 'registry', `the registry diff touches ${root.other}${root.kept ? ` outside ${root.kept}` : ''}, which must stay untouched for this namespace: ${stray.slice(0, 2).join('; ')}. Next step: move the write under ${root.expected}.`);
    }
    if (residue === null) fail('no-residue', 'registry', 'registry_residue is missing. Next step: capture the registry after the uninstall.');
    else if (residue.trim() !== '') fail('no-residue', 'registry', `registry keys survive the uninstall: ${residue.split('\n').slice(0, 3).join('; ')}. Next step: remove them in the uninstaller.`);

    // 4. SmartScreen: the observed text, from the guest's UI Automation probe
    if (String(cells.launch?.smartscreen ?? '').trim() !== SMARTSCREEN) fail('launch', 'smartscreen', `the launch cell's smartscreen field is ${JSON.stringify(cells.launch?.smartscreen ?? null)}, not the OS-observed '${SMARTSCREEN}'. Next step: capture the SEC-03 warning from the guest desktop.`);

    // 5. background task: verified, or deferred with a REASON and a scheduler error; the service observed disabled
    const bg = cells.background;
    if (bg === undefined) {
        fail('background', 'background', 'the background-task cell is missing. Next step: record it verified, or deferred with its REASON.');
    } else if (bg.state === 'verified') {
        const ev = String(bg.evidence ?? '');
        if (!/backgroundupdate\.moz_log/.test(ev) || !/tasks?\b/i.test(ev) || !/staged/i.test(ev)) {
            fail('background', 'background', 'is recorded verified without the task entry, backgroundupdate.moz_log and a staged apply while closed. Next step: record the three observables or defer with a reason.');
        }
    } else if (bg.state === 'deferred') {
        if (!REASONS.includes(bg.reason) || typeof bg.scheduler_error !== 'string' || bg.scheduler_error.trim() === '') {
            fail('background', 'background', `is deferred without an exact BackgroundUpdate REASON (${REASONS.join(', ')}) and a scheduler error. Next step: record the reason the guest reported.`);
        }
    } else {
        fail('background', 'background', `carries state ${JSON.stringify(bg.state ?? null)}, not verified or deferred. Next step: resolve the cell.`);
    }
    if (rec.maintenance_service_enabled !== false) {
        fail('(record)', 'background', `maintenance_service_enabled is ${JSON.stringify(rec.maintenance_service_enabled ?? null)}; the guest must observe the maintenance service and report it disabled (--disable-maintenance-service). Next step: rebuild without that service, or capture the observation.`);
    }

    // 6. the update cell changed the version
    const u = cells.update ?? {};
    if (typeof u.version_after !== 'string' || u.version_after === '' || u.version_after === u.version_before) {
        fail('update', 'update', `version_after ${JSON.stringify(u.version_after ?? null)} is empty or equals version_before ${JSON.stringify(u.version_before ?? null)}, so no update was observed. Next step: apply a complete MAR of a higher version.`);
    }

    // 7. the guest script prints every schema marker through the schema, and never prints the SmartScreen text itself
    if (guestText !== null) {
        for (const name of Object.keys(schema.markers)) {
            if (!guestText.includes(`$M.${name}.prefix`)) fail('(guest)', 'guest-script', `${GUEST_REL} never prints the schema marker '${name}' through $M.${name}.prefix, so the writer would never see it. Next step: emit the observation or drop the marker from the schema.`);
        }
        if (!guestText.includes(schema.inputsVolumeLabel)) fail('(guest)', 'guest-script', `${GUEST_REL} does not look up the inputs volume label '${schema.inputsVolumeLabel}'. Next step: use the label from ${SCHEMA_REL}.`);
        const printed = guestText.split('\n').filter(l => l.includes(SMARTSCREEN) && /Write-Output|Write-Host|\bPass\b|\bFail\b/.test(l));
        if (printed.length > 0) fail('(guest)', 'guest-script', `${GUEST_REL} prints the SmartScreen text from its own source (${printed[0].trim().slice(0, 80)}), so the smartscreen rule would be satisfied by the harness. Next step: print only what the UI Automation probe returned.`);
    }

    return { failures, cells: names.length };
}

const fmt = f => `${f.file} cell ${f.cell} [${f.rule}]: ${f.msg}`;

// Synthetic guest outputs for the REAL writer. Mutators edit the per-cell {code, out} map before it is written.
function guestOutputs(schema, patchMoved = false) {
    const m = n => schema.markers[n].prefix;
    const root = patchMoved ? FORK_ROOT : UPSTREAM_ROOT;
    const o = {
        install: { code: 0, out: [`${m('ini')} [App]`, `${m('ini')} BUILD_TARGET=WINNT_x86_64-msvc-x64`, `${m('maintenanceService')} disabled`, 'PASS install: setup.exe exited 0'].join('\n') },
        launch: { code: 0, out: [`${m('smartscreen')} ${SMARTSCREEN}`, 'PASS launch: stayed up'].join('\n') },
        update: { code: 0, out: [`${m('versionBefore')} 1.0.0`, `${m('versionAfter')} 1.0.1`, 'PASS update: applied'].join('\n') },
        uninstall: { code: 0, out: 'PASS uninstall: removed' },
        'no-residue': { code: 0, out: [`${m('regDiff')} [HKEY_LOCAL_MACHINE\\${root}\\Launcher]`,
            ...(patchMoved ? [`${m('regDiff')} [HKEY_CURRENT_USER\\${KEPT_PREFIX}TaskBarIDs]`] : []), 'PASS no-residue: clean'].join('\n') },
    };
    return o;
}

function buildRecord(dir, schema, outputs) {
    for (const [cell, { code, out }] of Object.entries(outputs)) {
        if (code !== null) writeFileSync(join(dir, `${cell}.code`), String(code));
        writeFileSync(join(dir, `${cell}.out`), out);
    }
    const target = join(dir, 'record.json');
    const r = spawnSync('python3', ['-I', join(REPO_ROOT, WRITER_REL), '--schema', join(REPO_ROOT, SCHEMA_REL), '--dir', dir, '--out', target], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`${WRITER_REL} failed: ${r.stderr || r.stdout}`);
    const rec = JSON.parse(readFileSync(target, 'utf8'));
    // The owner records the background cell by hand after the matrix run (BLOCKED.md item 7).
    rec.cells.background = { state: 'verified', evidence: 'task entry present; backgroundupdate.moz_log written; staged update applied while closed' };
    return rec;
}

function selfTest() {
    const schema = JSON.parse(readText(join(REPO_ROOT, SCHEMA_REL)) ?? 'null');
    const guestText = readText(join(REPO_ROOT, GUEST_REL));
    if (schema === null || guestText === null) {
        console.error(`${NAME}: --self-test FAIL -- ${SCHEMA_REL} or ${GUEST_REL} could not be read. Next step: restore the matrix harness files.`);
        return 1;
    }
    const dirs = [];
    const mkdir = () => { const d = mkdtempSync(join(tmpdir(), 'win-matrix-record-selftest-')); dirs.push(d); return d; };
    try {
        const json = o => JSON.stringify(o, null, 2);
        const opts = (over = {}) => ({ schema, guestText, patchText: null, ...over });
        const fromGuest = (mutate = () => {}, patchMoved = false) => {
            const out = guestOutputs(schema, patchMoved);
            mutate(out);
            return buildRecord(mkdir(), schema, out);
        };
        const baseline = runChecks(json(fromGuest()), opts());
        if (baseline.failures.length > 0) {
            console.error(`${NAME}: --self-test FAIL -- the fixture built by the real writer is already red, so the plants would mean nothing:`);
            baseline.failures.forEach(f => console.error(`  ${fmt(f)}`));
            return 1;
        }
        console.log(`  ok  record built by ${WRITER_REL} from synthetic guest output -> green (${baseline.cells} cell(s))`);
        const mut = fn => { const o = fromGuest(); fn(o); return json(o); };
        const MOVED_PATCH = '+!define AppRegRoot            "Software\\${BrandShortName}"\n';
        const plants = [
            // guest-output level: the writer parses these, so driver and verifier agree on the shape
            ['every cell FAIL', json(fromGuest(o => { for (const c of Object.keys(o)) o[c].code = 1; })), opts(), 'cells', 'not PASS'],
            ['install FAIL with non-empty evidence', json(fromGuest(o => { o.install.code = 1; })), opts(), 'cells', 'install'],
            ['a cell that never ran', json(fromGuest(o => { o.update.code = null; })), opts(), 'cells', 'update'],
            ['SmartScreen never observed by the guest', json(fromGuest(o => { o.launch.out = 'PASS launch: stayed up'; })), opts(), 'smartscreen', SMARTSCREEN],
            ['maintenance service observed enabled', json(fromGuest(o => { o.install.out = o.install.out.replace('disabled', 'enabled'); })), opts(), 'background', 'maintenance_service_enabled'],
            ['maintenance service never observed', json(fromGuest(o => { o.install.out = o.install.out.replace(/.*MAINTENANCE_SERVICE:.*\n/, ''); })), opts(), 'background', 'maintenance_service_enabled'],
            ['no BUILD_TARGET in the printed application.ini', json(fromGuest(o => { o.install.out = o.install.out.replace(/.*BUILD_TARGET.*\n/, ''); })), opts(), 'build-target', 'BUILD_TARGET'],
            ['registry diff empty (nothing observed)', json(fromGuest(o => { o['no-residue'].out = 'PASS no-residue: clean'; })), opts(), 'registry', 'registry_diff is empty'],
            ['upstream root written after the fork root moved', json(fromGuest(() => {}, false)), opts({ patchText: MOVED_PATCH }), 'registry', FORK_ROOT],
            ['fork root written while the upstream root is expected', json(fromGuest(() => {}, true)), opts(), 'registry', UPSTREAM_ROOT],
            ['keys survive the uninstall', json(fromGuest(o => { o['no-residue'].out += `\n${schema.markers.regResidue.prefix} [HKEY_LOCAL_MACHINE\\${UPSTREAM_ROOT}\\Firefox]`; })), opts(), 'registry', 'survive'],
            ['update left the version unchanged', json(fromGuest(o => { o.update.out = o.update.out.replace('1.0.1', '1.0.0'); })), opts(), 'update', 'version_after'],
            // record level
            ['Software\\Mozilla key added when the fork root is expected', mut(o => { o.cells['no-residue'].registry_diff += `\n${UPSTREAM_ROOT}\\Run`; }), opts({ patchText: MOVED_PATCH }), 'registry', UPSTREAM_ROOT],
            ['stock Firefox subkey written when the fork root is expected', mut(o => { o.cells['no-residue'].registry_diff += `\n${UPSTREAM_ROOT}\\Firefox\\TaskBarIDs`; }), opts({ patchText: MOVED_PATCH }), 'registry', 'Firefox\\TaskBarIDs'],
            ['maintenance-service key written when the fork root is expected', mut(o => { o.cells['no-residue'].registry_diff += `\n${UPSTREAM_ROOT}\\MaintenanceService`; }), opts({ patchText: MOVED_PATCH }), 'registry', 'MaintenanceService'],
            ['the old literal-root patch form no longer counts as moved', json(fromGuest(() => {}, true)), opts({ patchText: `+  WriteRegStr HKLM "${FORK_ROOT}\\PowerBrowser" "x" "y"\n` }), 'registry', UPSTREAM_ROOT],
            ['FAIL deferral without owner approval', mut(o => { o.cells.install.verdict = 'FAIL'; o.cells.install.deferral = { reason: 'slow guest' }; }), opts(), 'cells', 'owner-approved deferral'],
            ['unknown key on a cell', mut(o => { o.cells.install.extra = 1; }), opts(), 'shape', 'install'],
            ['top-level key missing', mut(o => { delete o.maintenance_service_enabled; }), opts(), 'shape', 'top-level'],
            ['background deferred without a reason', mut(o => { o.cells.background = { state: 'deferred', scheduler_error: '0x80070005' }; }), opts(), 'background', 'REASON'],
            ['empty build target', mut(o => { o.build_target = ''; }), opts(), 'build-target', 'BUILD_TARGET'],
            // guest-script level
            ['guest script drops a marker', json(fromGuest()), opts({ guestText: guestText.split('$M.regResidue.prefix').join('$M.dropped.prefix') }), 'guest-script', 'regResidue'],
            ['guest script prints the SmartScreen text itself', json(fromGuest()), opts({ guestText: `${guestText}\nWrite-Output '${SMARTSCREEN}'\n` }), 'guest-script', 'prints the SmartScreen text'],
        ];
        let failed = 0;
        for (const [name, text, o, rule, value] of plants) {
            const { failures } = runChecks(text, o);
            const hit = failures.some(f => f.rule === rule && (f.msg.includes(value) || f.cell.includes(value)));
            if (hit) console.log(`  ok  ${name} -> red, naming [${rule}] and '${value}'`);
            else { console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red naming [${rule}] and '${value}'; got: ${failures.map(fmt).join(' | ') || '(no failures at all)'}`); failed += 1; }
        }
        // Greens that must stay green: an explicitly approved deferral, and the fork root once patch 040 writes it.
        const approved = runChecks(json((() => { const r = fromGuest(); r.cells.install.verdict = 'FAIL'; r.cells.install.deferral = { owner_approved: true, reason: 'guest licence pending' }; return r; })()), opts());
        if (approved.failures.length === 0) console.log('  ok  FAIL cell with an owner-approved deferral -> green');
        else { console.error(`${NAME}: --self-test FAIL -- an approved deferral was refused: ${approved.failures.map(fmt).join(' | ')}`); failed += 1; }
        const moved = runChecks(json(fromGuest(() => {}, true)), opts({ patchText: MOVED_PATCH }));
        if (moved.failures.length === 0) console.log('  ok  fork root written and expected once patch 040 writes it -> green');
        else { console.error(`${NAME}: --self-test FAIL -- the moved namespace was refused: ${moved.failures.map(fmt).join(' | ')}`); failed += 1; }
        const zero = runChecks('{"cells":{}}', opts());
        if (zero.failures.some(f => f.rule === 'vacuity')) console.log('  ok  zero-cell record -> red, naming [vacuity] and zero cells');
        else { console.error(`${NAME}: --self-test FAIL -- a zero-cell record was not red as vacuity`); failed += 1; }
        if (failed > 0) return 1;
        console.log(`${NAME}: --self-test PASS -- the record built by the real writer is green and ${plants.length} planted faults each went red naming the cell and the cause. It writes only mkdtemp fixtures, removed at once.`);
        return 0;
    } finally {
        for (const d of dirs) rmSync(d, { recursive: true, force: true });
    }
}

function main() {
    if (args.includes('--self-test')) return selfTest();
    const schema = JSON.parse(readText(join(REPO_ROOT, SCHEMA_REL)) ?? 'null');
    if (schema === null) {
        console.error(`${NAME}: FAIL -- ${SCHEMA_REL} could not be read. Next step: restore it.`);
        return 1;
    }
    const { failures, cells } = runChecks(readText(join(REPO_ROOT, RECORD_REL)), {
        label: RECORD_REL,
        schema,
        patchText: readText(join(REPO_ROOT, PATCH_REL)),
        guestText: readText(join(REPO_ROOT, GUEST_REL)),
    });
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} problem(s) with the matrix record.`);
        failures.forEach(f => console.error(`  ${fmt(f)}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- ${RECORD_REL} carries ${cells} cell(s), each PASS (or an owner-approved deferral) with verbatim evidence and exactly the schema's keys; the BUILD_TARGET matches the installed application.ini; the registry diff names the expected root and nothing survives the uninstall; the SmartScreen text was observed on the guest; the version changed; the maintenance service was observed disabled; the background cell is verified or deferred with its REASON.`);
    return 0;
}

process.exit(main());
