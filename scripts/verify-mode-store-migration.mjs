#!/usr/bin/env node
// mode-store-migration: two v1.7 audit fixes of lane G3b in @powerbrowser/modes, driven through
// the services' own code in Node (scripts/lib/ts-unit-loader.mjs). No browser, no display.
//
// Clauses:
//  shipped-name-renamed   theia-pane-hosting-04. A stored custom mode whose name a shipped mode
//                         now has (every shipped label is tried, read from mode-descriptors.ts) is
//                         kept under "<name> (custom)", reported, and written back with only its
//                         name changed; a persisted active id of the old name follows it.
//  snapshot-follows-rename theia-pane-hosting-04. A session snapshot or named Setup carrying the old
//                         id activates the renamed mode, and the Setup list names it.
//  write-order            theia-pane-hosting-04. The load-time write-back and every save share one
//                         queue, so a later save is never overwritten by the slower write-back.
//  references-unknown     theia-pane-hosting-03. SetupsService.referencedTabUris gives undefined
//                         (unknown) for an unreadable or unparsable setups.json and for an
//                         unreadable session, and a set for an absent or valid file.
//
// Tier: quick. SKIP when theia/node_modules/typescript is absent. --self-test plants each pre-fix
// fault in memory; each must go red naming its clause.
//
// Usage:
//   node scripts/verify-mode-store-migration.mjs
//   node scripts/verify-mode-store-migration.mjs --self-test

import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SKIP_EXIT, skipLine } from './lib/skip-verdict.mjs';
import { REPO_ROOT, flush, loadTs, typescript } from './lib/ts-unit-loader.mjs';

const SELF = fileURLToPath(import.meta.url);

const NAME = 'mode-store-migration';
const MODES = 'theia/extensions/modes/src/browser';
const REL = {
    service: `${MODES}/mode-service.ts`,
    descriptors: `${MODES}/mode-descriptors.ts`,
    setups: `${MODES}/setups-service.ts`,
};
/** The in-memory seam: parseModeStore is module-private, so the check exports it from its own copy. */
const SEAM = '\nexport { parseModeStore as __checkParseModeStore };\n';

const quiet = async run => {
    const saved = { info: console.info, warn: console.warn, log: console.log };
    console.info = console.warn = console.log = () => undefined;
    try {
        return await run();
    } finally {
        Object.assign(console, saved);
    }
};

function modeService(sources) {
    const text = (Object.prototype.hasOwnProperty.call(sources, REL.service) ? sources[REL.service] : readFileSync(join(REPO_ROOT, REL.service), 'utf8')) + SEAM;
    const descriptors = loadTs(REL.descriptors, { sources });
    return { module: loadTs(REL.service, { sources: { ...sources, [REL.service]: text }, overrides: { [REL.descriptors]: descriptors } }), descriptors };
}

async function clauseShippedName(sources, fail) {
    const { module, descriptors } = modeService(sources);
    const labels = (descriptors.SHIPPED_MODES ?? []).map(d => d.label).filter(l => typeof l === 'string');
    if (!labels.length) {
        fail('shipped-name-renamed', `no shipped mode label read from ${REL.descriptors}`);
        return;
    }
    const row = name => ({ name, leftVisible: true, rightVisible: false, bottomVisible: false, furniture: true, statusBar: true, views: { left: [], right: [], bottom: [] }, extra: 'kept' });
    for (const label of labels) {
        const raw = JSON.stringify({ version: 1, customs: [row(label), row('Mine')] });
        const parsed = module.__checkParseModeStore(raw);
        const kept = parsed.customs.find(c => c.name.toLowerCase().startsWith(label.toLowerCase()) && c.name.toLowerCase() !== label.toLowerCase());
        if (!kept) {
            fail('shipped-name-renamed', `a stored custom mode named "${label}" (now a shipped mode) was dropped instead of kept under a new name (theia-pane-hosting-04)`);
            continue;
        }
        if (!parsed.renamed?.some(r => r.from === label && r.to === kept.name)) {
            fail('shipped-name-renamed', `the rename of "${label}" to "${kept.name}" is not reported, so the user gets no notice`);
        }
        let migrated;
        try {
            migrated = JSON.parse(parsed.migrated ?? 'null');
        } catch {
            migrated = null;
        }
        if (!migrated || migrated.customs?.[0]?.name !== kept.name || migrated.customs?.[0]?.extra !== 'kept' || migrated.customs?.[1]?.name !== 'Mine') {
            fail('shipped-name-renamed', `the store written back for "${label}" does not change that row's name alone (theia-pane-hosting-04: the next save erased the row)`);
        }
    }

    // The service: written back once, and the persisted active id follows the rename.
    const service = new module.ModeService();
    const writes = [];
    const activated = [];
    service.fileService = { write: async (_uri, text) => { writes.push(text); } };
    service.storage = { getData: async () => ({ activePerspectiveId: module.customModeIdFor(labels[labels.length - 1]) }) };
    service.perspectives = { registerPerspective: () => undefined, getActivePerspectiveId: () => 'browsing' };
    service.flash = async () => undefined;
    service.activateMode = async id => { activated.push(id); };
    service.applyStoreText(JSON.stringify({ version: 1, customs: [row(labels[labels.length - 1])] }));
    await flush();
    if (writes.length !== 1) {
        fail('shipped-name-renamed', `the renamed store was written back ${writes.length} time(s), want once`);
    }
    const expectedId = module.customModeIdFor(module.renamedCustomModeName?.(labels[labels.length - 1], () => false) ?? '');
    if (!activated.includes(expectedId)) {
        fail('shipped-name-renamed', `a persisted active mode of the old name re-applied ${JSON.stringify(activated)}, want ${expectedId} (it fell back to Browsing)`);
    }
}

/** A ModeService that has loaded a store whose custom mode carries the given shipped label (renamed on load). */
async function renamedModeService(sources, label) {
    const { module } = modeService(sources);
    const service = new module.ModeService();
    const activated = [];
    service.fileService = { write: async () => undefined };
    service.storage = { getData: async () => undefined };
    service.perspectives = { registerPerspective: () => undefined, getActivePerspectiveId: () => 'browsing' };
    service.flash = async () => undefined;
    service.activateMode = async id => { activated.push(id); };
    service.applyStoreText(JSON.stringify({ version: 1, customs: [{ name: label, leftVisible: true, rightVisible: false, bottomVisible: false }] }));
    await flush();
    activated.length = 0;
    return { module, service, activated };
}

async function clauseSnapshotFollowsRename(sources, fail) {
    const descriptors = loadTs(REL.descriptors, { sources });
    const label = (descriptors.SHIPPED_MODES ?? []).map(d => d.label).filter(l => typeof l === 'string').pop();
    if (!label) {
        fail('snapshot-follows-rename', `no shipped mode label read from ${REL.descriptors}`);
        return;
    }
    const { module, service, activated } = await renamedModeService(sources, label);
    const oldId = module.customModeIdFor(label);
    const newId = service.getCustomModes()[0]?.id;
    const { SetupsService } = loadTs(REL.setups, { sources, overrides: { [REL.descriptors]: descriptors } });
    const setups = new SetupsService();
    setups.modes = service;
    setups.applyGeometry = () => undefined;
    setups.placeTabs = async () => 0;
    setups.reassertDockSizes = () => undefined;
    setups.flash = async () => undefined;
    setups.waitForCustomModes = async () => undefined;
    for (const notify of [false, true]) {
        activated.length = 0;
        await setups.applySnapshot({ modeId: oldId, windows: [{ modeId: oldId, tabs: [], activeTab: null, x: 0, y: 0, width: 1, height: 1 }] }, notify);
        if (!activated.includes(newId)) {
            fail('snapshot-follows-rename', `a ${notify ? 'named Setup' : 'session snapshot'} saved in the "${label}" custom mode activated ${JSON.stringify(activated)}, want the renamed mode ${newId} (theia-pane-hosting-04)`);
        }
    }
    const shown = setups.modeLabelFor(oldId);
    if (shown !== service.getCustomModes()[0]?.name) {
        fail('snapshot-follows-rename', `a Setup saved in the "${label}" custom mode is listed with mode "${shown}", want the renamed mode's name (theia-pane-hosting-04)`);
    }
}

async function clauseWriteOrder(sources, fail) {
    const { module, descriptors } = modeService(sources);
    const label = (descriptors.SHIPPED_MODES ?? []).map(d => d.label).filter(l => typeof l === 'string').pop();
    const service = new module.ModeService();
    let stored = null;
    let calls = 0;
    // The first write (the load-time write-back) is slow; a later save is fast. The later one must win.
    service.fileService = {
        write: (_uri, text) => {
            calls += 1;
            const wait = calls === 1 ? 40 : 0;
            return new Promise(resolve => setTimeout(() => { stored = text; resolve(); }, wait));
        },
    };
    service.storage = { getData: async () => undefined };
    service.perspectives = { registerPerspective: () => undefined, getActivePerspectiveId: () => 'browsing' };
    service.flash = async () => undefined;
    service.activateMode = async () => undefined;
    service.applyStoreText(JSON.stringify({ version: 1, customs: [{ name: label, leftVisible: true, rightVisible: false, bottomVisible: false }] }));
    if (typeof service.writeStore !== 'function') {
        fail('write-order', 'mode-service.ts has no writeStore queue; the load-time write-back races a later save (theia-pane-hosting-04)');
        return;
    }
    await service.writeStore('LATER-SAVE');
    await new Promise(resolve => setTimeout(resolve, 80));
    if (stored !== 'LATER-SAVE') {
        fail('write-order', 'the load-time write-back of a renamed mode landed after a later save and overwrote it (theia-pane-hosting-04)');
    }
    // Derived from the tree: every modes.json write in mode-service.ts goes through writeStore.
    const text = Object.prototype.hasOwnProperty.call(sources, REL.service) ? sources[REL.service] : readFileSync(join(REPO_ROOT, REL.service), 'utf8');
    const direct = text.split('this.fileService.write(this.modesUri').length - 1;
    if (direct !== 1) {
        fail('write-order', `mode-service.ts writes modes.json directly ${direct} time(s); want exactly once, inside writeStore, so every write is queued`);
    }
}

async function clauseReferences(sources, fail) {
    const descriptors = loadTs(REL.descriptors, { sources });
    const { SetupsService } = loadTs(REL.setups, { sources, overrides: { [REL.descriptors]: descriptors } });
    const run = async ({ exists = true, read, session = async () => undefined }) => {
        const service = new SetupsService();
        service.setupsUri = 'setups.json';
        service.fileService = { exists: async () => exists, read: async () => ({ value: await read() }) };
        service.profileStorage = { getData: session };
        return service.referencedTabUris();
    };
    const cases = [
        ['an unreadable setups.json', { read: async () => { throw new Error('mid-save'); } }, 'unknown'],
        ['an unparsable setups.json', { read: async () => '{"version": 1, "setups": [' }, 'unknown'],
        ['a setups.json whose setups is not a list', { read: async () => '{"version": 1, "setups": {}}' }, 'unknown'],
        ['an unreadable session', { read: async () => '{"version": 1, "setups": []}', session: async () => { throw new Error('io'); } }, 'unknown'],
        ['no setups.json', { exists: false, read: async () => { throw new Error('absent'); } }, 'set'],
        ['a valid empty setups.json', { read: async () => '{"version": 1, "setups": []}' }, 'set'],
    ];
    for (const [label, input, want] of cases) {
        let got;
        try {
            const result = await run(input);
            got = result === undefined ? 'unknown' : result instanceof Set ? 'set' : typeof result;
        } catch (err) {
            got = `threw ${err?.message ?? err}`;
        }
        if (got !== want) {
            fail('references-unknown', `${label}: referencedTabUris gave ${got}, want ${want === 'unknown' ? 'undefined (unknown, so no tombstone is pruned)' : 'a set'} (theia-pane-hosting-03)`);
        }
    }
}

const CLAUSES = [clauseShippedName, clauseSnapshotFollowsRename, clauseWriteOrder, clauseReferences];

export async function check(sources = {}) {
    const failures = [];
    const fail = (clause, message) => failures.push({ clause, message });
    await quiet(async () => {
        for (const clause of CLAUSES) {
            try {
                await clause(sources, fail);
            } catch (err) {
                fail(clause.name, `threw: ${err?.message ?? err}`);
            }
        }
    });
    return { failures };
}

export const PLANTS = [
    {
        name: 'a shipped-colliding row is dropped (pre-fix theia-pane-hosting-04)', naming: 'shipped-name-renamed', file: REL.service,
        edits: [['        if (isShippedLabel(name)) {\n', '        if (isShippedLabel(name)) {\n            continue;\n        }\n        if (false) {\n']],
    },
    {
        name: 'the renamed store is not written back', naming: 'shipped-name-renamed', file: REL.service,
        edits: [['if (parsed.migrated !== undefined) {', 'if (false) {']],
    },
    {
        name: 'the persisted id does not follow the rename', naming: 'shipped-name-renamed', file: REL.service,
        edits: [['await this.reapplyMode(this.resolveModeId(persistedId));', 'await this.reapplyMode(persistedId);']],
    },
    {
        name: 'the write-back is fire-and-forget beside later saves', naming: 'write-order', file: REL.service,
        edits: [['this.writeStore(parsed.migrated).catch(', 'this.fileService.write(this.modesUri, parsed.migrated).catch(']],
    },
    {
        name: 'a save bypasses the write queue', naming: 'write-order', file: REL.service,
        edits: [['await this.writeStore(JSON.stringify(', 'await this.fileService.write(this.modesUri, JSON.stringify(']],
    },
    {
        name: 'a snapshot carrying the old mode id opens Browsing', naming: 'snapshot-follows-rename', file: REL.setups,
        edits: [['const modeId = shippedKnown ? storedModeId : this.modes.resolveModeId(storedModeId);', 'const modeId = storedModeId;']],
    },
    {
        name: 'a Setup saved in the old mode is listed as Browsing', naming: 'snapshot-follows-rename', file: REL.setups,
        edits: [['const resolved = this.modes.resolveModeId(modeId);', 'const resolved = modeId;']],
    },
    {
        name: 'an unparsable setups.json names nothing (pre-fix theia-pane-hosting-03)', naming: 'references-unknown', file: REL.setups,
        edits: [['                if (!parsed.ok) {', '                if (false) {']],
    },
    {
        name: 'an unreadable setups.json names nothing (pre-fix theia-pane-hosting-03)', naming: 'references-unknown', file: REL.setups,
        edits: [["no saved setups read; the referenced tab list is not known');\n            return undefined;", "no saved setups read; the referenced tab list is not known');"]],
    },
];

function planted(plant) {
    let text = readFileSync(join(REPO_ROOT, plant.file), 'utf8');
    for (const [from, to] of plant.edits) {
        const next = text.replace(from, to);
        if (next === text) {
            return { error: `the plant '${plant.name}' did not apply: its anchor is not in ${plant.file}` };
        }
        text = next;
    }
    return { sources: { [plant.file]: text } };
}

/**
 * SKIP control (SKIP-PROTOCOL.md): the main mode, run as a child with its output captured, from a copy of this script
 * and its two helpers in a tree with no theia/ (the loader resolves typescript from the tree it sits in), must exit 77
 * with the SKIP line last and no PASS line. Returns a problem, or null.
 */
function skipControl() {
    const root = mkdtempSync(join(tmpdir(), `${NAME}-root-`));
    try {
        mkdirSync(join(root, 'scripts', 'lib'), { recursive: true });
        copyFileSync(SELF, join(root, 'scripts', 'verify-mode-store-migration.mjs'));
        for (const lib of ['ts-unit-loader.mjs', 'skip-verdict.mjs']) copyFileSync(join(REPO_ROOT, 'scripts', 'lib', lib), join(root, 'scripts', 'lib', lib));
        const r = spawnSync(process.execPath, [join(root, 'scripts', 'verify-mode-store-migration.mjs')], { encoding: 'utf8' });
        const lines = (r.stdout ?? '').split('\n').filter(l => l.trim() !== '');
        const last = lines[lines.length - 1] ?? '';
        if (r.status !== SKIP_EXIT || !last.startsWith(`${NAME}: SKIP -- theia/node_modules/typescript is not installed`)
            || lines.some(l => l.includes(`${NAME}: PASS`)) || /: SKIP/.test(r.stderr ?? '')) {
            return `control: a tree without typescript did not exit 77 with the SKIP line last and no PASS line (status ${r.status}, last line ${JSON.stringify(last)}, stderr ${JSON.stringify((r.stderr ?? '').slice(0, 300))})`;
        }
        console.log(`${NAME}: self-test ok -- control: a tree without typescript exits 77 with the SKIP line last`);
        return null;
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
}

async function selfTest() {
    const problems = [];
    const skipProblem = skipControl();
    if (skipProblem) problems.push(skipProblem);
    const control = await check();
    if (control.failures.length) {
        problems.push(`control run is red: ${control.failures.map(f => `${f.clause}: ${f.message}`).join('; ')}`);
    }
    for (const plant of PLANTS) {
        const { sources, error } = planted(plant);
        if (error) {
            problems.push(error);
            continue;
        }
        const run = await check(sources);
        if (!run.failures.some(f => f.clause === plant.naming)) {
            problems.push(`plant '${plant.name}' stayed green in ${plant.naming}`);
        } else {
            console.log(`${NAME}: self-test ok -- '${plant.name}' goes red in ${plant.naming}`);
        }
    }
    if (problems.length) {
        for (const p of problems) console.log(`${NAME}: SELF-TEST FAIL -- ${p}`);
        process.exit(1);
    }
    console.log(`${NAME}: SELF-TEST PASS (${PLANTS.length} plants, each red in its clause; control green)`);
}

async function main() {
    // No typescript: nothing ran, so exit 77 with the SKIP line (SKIP-PROTOCOL.md); a self-test cannot run its plants.
    if (!typescript()) {
        const who = process.argv.includes('--self-test') ? `${NAME} self-test` : NAME;
        console.log(skipLine(who, 'theia/node_modules/typescript is not installed. Next step: run the audited Theia install (docs/BUILD.md "Theia half")'));
        process.exit(SKIP_EXIT);
    }
    if (process.argv.includes('--self-test')) {
        await selfTest();
        return;
    }
    const { failures } = await check();
    if (failures.length) {
        for (const f of failures) console.log(`${NAME}: FAIL -- ${f.clause}: ${f.message}`);
        process.exit(1);
    }
    console.log(`${NAME}: PASS (${CLAUSES.length} clause groups)`);
}

await main();
