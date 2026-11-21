#!/usr/bin/env node
// orca-pane-groups (Phase 64, TAB-04 "Orca's tab groups appear as Lumino splits";
// 64-VERIFICATION gap "a pure fixture test for paneRecords' group branch plus
// planPanes/placementFor").
//
// Static, no browser, no Orca daemon. The functions leavesOf, groupLeavesOf,
// neighboursIn and paneRecords are taken out of the overlay's
// pb-pane-mount.tsx by name with the TypeScript AST (never by line number),
// transpiled in memory and run against fixture stores. Their output is then fed
// to planPanes from orca-pane-routes.ts (loaded the way orca-pane-routes loads
// it). The expectation is derived from the fixture layout, not from a list:
// for each tab, its same-group tabs come first as tab-after, then every tab of
// the other group as the split mode its position in the layout gives, and a new
// pane in a second group is planned as a Lumino split on the first group's
// widget.
//
// This does not observe that the pinned Orca daemon publishes a second client's group
// layout to PB's store (orca-tabs-live stage g3, WINDOWS 55, owner pass).
//
// --self-test plants faults in copies of the two sources and requires each to
// go red naming the drift. When theia/node_modules/typescript is absent the row
// (self-test included) exits 77 with the one SKIP line (SKIP-PROTOCOL.md); an
// absent overlay source is a red, not a skip.

import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SKIP_EXIT, skipLine } from './lib/skip-verdict.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'orca-pane-groups';
const TS_DIR = join(REPO_ROOT, 'theia', 'node_modules', 'typescript');
const MOUNT = 'orca-overlay/files/src/renderer/src/pb/pb-pane-mount.tsx';
const ROUTES = 'theia/extensions/orca-panes/src/browser/orca-pane-routes.ts';
const WANTED = ['leavesOf', 'groupLeavesOf', 'neighboursIn', 'paneRecords'];
let ts;

/** The named top-level functions of the mount source, transpiled and run with stubs for its Orca imports. */
export function loadPaneRecords(text) {
    const sf = ts.createSourceFile('m.tsx', text, ts.ScriptTarget.ES2020, true, ts.ScriptKind.TSX);
    const found = new Map();
    for (const st of sf.statements) if (ts.isFunctionDeclaration(st) && st.name && WANTED.includes(st.name.text)) found.set(st.name.text, st.getText(sf));
    const missing = WANTED.filter((n) => !found.has(n));
    if (missing.length) return { error: `${MOUNT} no longer declares ${missing.join(', ')}` };
    const src = [...found.values()].join('\n') + '\nmodule.exports = { paneRecords, neighboursIn };';
    const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React } }).outputText;
    const module = { exports: {} };
    const stubs = { makePaneKey: (tab, leaf) => `${tab}#${leaf}`, worktreeOf: () => null, tabTitle: (_s, tab) => tab.label };
    try {
        new Function('module', ...Object.keys(stubs), js)(module, ...Object.values(stubs));
    } catch (err) {
        return { error: `${MOUNT}'s pane functions did not load: ${err.message}` };
    }
    return { module: module.exports };
}

// A worktree with group G1 (tabs a, b) and G2 (tab c), laid out by `direction`.
function store(direction, swap = false) {
    const tab = (id, groupId) => ({ id, entityId: id, groupId, contentType: 'agent-session', label: id, worktreeId: 'w' });
    const leaf = (groupId) => ({ type: 'leaf', groupId });
    const [first, second] = swap ? ['G2', 'G1'] : ['G1', 'G2'];
    return {
        unifiedTabsByWorktree: { w: [tab('a', 'G1'), tab('b', 'G1'), tab('c', 'G2')] },
        groupsByWorktree: { w: [{ id: 'G1', tabOrder: ['a', 'b'], activeTabId: 'a' }, { id: 'G2', tabOrder: ['c'], activeTabId: 'c' }] },
        layoutByWorktree: { w: { type: 'split', direction, first: leaf(first), second: leaf(second) } },
    };
}

/** Red reasons over the fixtures; empty when every case holds. */
export function fixtures(mount, routes) {
    const fails = [];
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    // [direction, G1 first?, mode c gets relative to G1, mode a/b get relative to G2]
    const layouts = [['horizontal', false, 'split-right', 'split-left'], ['horizontal', true, 'split-left', 'split-right'],
        ['vertical', false, 'split-bottom', 'split-top'], ['vertical', true, 'split-top', 'split-bottom']];
    for (const [direction, swap, cMode, abMode] of layouts) {
        const label = `${direction} layout with ${swap ? 'G2' : 'G1'} first`;
        let recs;
        try { recs = mount.paneRecords(store(direction, swap)); } catch (err) { fails.push(`paneRecords threw on the ${label}: ${err.message}`); continue; }
        const by = new Map(recs.map((r) => [r.key, r.neighbours]));
        const expect = {
            a: [{ key: 'b', mode: 'tab-after' }, { key: 'c', mode: abMode }],
            b: [{ key: 'a', mode: 'tab-after' }, { key: 'c', mode: abMode }],
            c: [{ key: 'a', mode: cMode }, { key: 'b', mode: cMode }],
        };
        for (const [key, want] of Object.entries(expect)) {
            if (!same(by.get(key), want)) fails.push(`group neighbours of ${key} on the ${label}: got ${JSON.stringify(by.get(key))}, expected ${JSON.stringify(want)}`);
        }
        // planPanes: a and b known in G1's Lumino area; c is new and must split beside a.
        const W = (n) => `orca-pane:${n}`;
        const known = new Map([['a', { name: 'chat1', title: 'a', widgetId: W('chat1') }], ['b', { name: 'chat2', title: 'b', widgetId: W('chat2') }]]);
        const plan = routes.planPanes({ known, restored: [] }, recs);
        const created = plan.create.find((c) => c.record.key === 'c');
        if (!created || !same(created.placement, { mode: cMode, ref: W('chat1') })) {
            fails.push(`planPanes placement of the second group's pane on the ${label}: got ${JSON.stringify(created?.placement)}, expected ${cMode} on ${W('chat1')}`);
        }
    }
    return fails;
}

// The same in-memory load orca-pane-routes uses (its loader reads that module's own ts binding).
function loadRoutesModule(text) {
    const js = ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    const module = { exports: {} };
    try {
        new Function('exports', 'require', 'module', js)(module.exports, (spec) => { throw new Error(`${ROUTES} imports ${spec} at run time`); }, module);
    } catch (err) {
        return { error: err.message };
    }
    return { module: module.exports };
}

function check(mountText, routesText) {
    const m = loadPaneRecords(mountText);
    if (m.error) return [m.error];
    const r = loadRoutesModule(routesText);
    if (r.error) return [r.error];
    return fixtures(m.module, r.module);
}

const PLANTS = [
    { name: 'group branch dropped', naming: 'group neighbours of c', file: 'mount', edit: (s) => s.replace("for (const { leaf, mode } of neighboursIn(layout as never, tab.groupId, groupLeavesOf, 'horizontal')) {", "for (const { leaf, mode } of [] as Array<{ leaf: string; mode: NeighbourMode }>) {") },
    { name: 'group row direction swapped', naming: 'group neighbours of', file: 'mount', edit: (s) => s.replace("groupLeavesOf, 'horizontal')", "groupLeavesOf, 'vertical')") },
    { name: 'split side inverted', naming: 'split-right', file: 'mount', edit: (s) => s.replace("side === 'second' ? 'split-right' : 'split-left'", "side === 'second' ? 'split-left' : 'split-right'") },
    { name: 'same group as split', naming: 'group neighbours of a', file: 'mount', edit: (s) => s.replace("mode: 'tab-after' })", "mode: 'split-right' })") },
    { name: 'paneRecords renamed', naming: 'no longer declares paneRecords', file: 'mount', edit: (s) => s.replace('function paneRecords(', 'function paneRecordsX(') },
    { name: 'placement ignored', naming: 'planPanes placement', file: 'routes', edit: (s) => s.replace('return { mode: neighbour.mode, ref };', 'return undefined;') },
];

function runSelfTest() {
    const base = { mount: readFileSync(join(REPO_ROOT, MOUNT), 'utf8'), routes: readFileSync(join(REPO_ROOT, ROUTES), 'utf8') };
    let failures = 0;
    const control = check(base.mount, base.routes);
    if (control.length) { console.error(`  FAIL control -> red on the unplanted tree: ${control.join('; ')}`); failures++; } else console.log('  ok control -> green');
    for (const p of PLANTS) {
        const t = { ...base, [p.file]: p.edit(base[p.file]) };
        if (t[p.file] === base[p.file]) { console.error(`  FAIL ${p.name} -> the plant did not apply (its anchor text moved)`); failures++; continue; }
        const text = check(t.mount, t.routes).join('\n');
        if (!text) { console.error(`  FAIL ${p.name} -> stayed green`); failures++; } else if (!text.includes(p.naming)) {
            console.error(`  FAIL ${p.name} -> red, but not naming '${p.naming}': ${text}`); failures++;
        } else console.log(`  ok ${p.name} -> red, naming '${p.naming}'`);
    }
    if (failures) { console.error(`${NAME} self-test: FAIL -- ${failures} case(s) did not behave`); return 1; }
    console.log(`${NAME} self-test: PASS -- control green, ${PLANTS.length} planted faults each went red naming the drift`);
    return 0;
}

const isEntryPoint = (() => {
    try { return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();
if (isEntryPoint) {
    const args = process.argv.slice(2);
    if (args.length > 1 || (args.length === 1 && args[0] !== '--self-test')) {
        console.error(`${NAME}: unknown argument ${args[0]} (usage: node scripts/verify-orca-pane-groups.mjs [--self-test])`);
        process.exit(2);
    }
    if (!existsSync(TS_DIR) || !statSync(TS_DIR).isDirectory()) { console.log(skipLine(NAME, 'theia/node_modules/typescript is absent, so neither the check nor its self-test ran. Next step: run the audited Theia install')); process.exit(SKIP_EXIT); }
    ts = createRequire(import.meta.url)(TS_DIR);
    if (args[0] === '--self-test') process.exit(runSelfTest());
    const fails = check(readFileSync(join(REPO_ROOT, MOUNT), 'utf8'), readFileSync(join(REPO_ROOT, ROUTES), 'utf8'));
    if (fails.length) { for (const f of fails) console.error(`${NAME}: FAIL -- ${f}`); process.exit(1); }
    console.log(`${NAME}: PASS -- paneRecords' tab-group neighbours (same group tab-after, other group by layout side) hold on 4 two-group layouts, and planPanes places the second group's new pane as that Lumino split; cross-client group publication is orca-tabs-live g3's, not this check's`);
    process.exit(0);
}
