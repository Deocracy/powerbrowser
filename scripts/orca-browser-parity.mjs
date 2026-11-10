#!/usr/bin/env node
// scripts/orca-browser-parity.mjs
//
// The Orca browser-parity check (Phase 61, BRW-01, P61-04): every ability an
// Orca browser tab has is derived from the pinned Orca source at check time and
// compared, as a set, with the hand-kept Gecko disposition table
// .planning/spikes/005-orca-browser-parity/DISPOSITIONS.md.
//
// Derived at check time, by regex over source text, never hand-kept:
//  a. the RPC ability set: every name: 'browser.<name>' in the files under
//     orca/src/main/runtime/rpc/methods/, except *.test.ts and
//     *.test-fixture.ts. A missing directory or an empty set is red.
// Compared both ways with the table rows:
//  b. a derived ability with no row is red, naming the ability;
//  c. a row with no derived ability is red, naming the row.
// The table itself is refused when its header is not exactly
// | ability | users | disposition | Gecko mechanism | tier | note |, when an
// ability appears twice, or when a disposition is not one of BiDi, BiDi+,
// actor, native, impossible.
//
// Tier: the self-test is quick and hermetic (mkdtemp fixtures, no orca/). The
// main run is full tier and needs a fetched orca/; with no orca/src it prints
// one SKIP line and exits 0.
// Limit: it proves the table covers the abilities the pin defines. It does not
// prove a disposition is right: rows whose mechanism no run has shown carry
// [ASSUMED] in their note.
//
// Usage:
//   node scripts/orca-browser-parity.mjs
//   node scripts/orca-browser-parity.mjs --self-test
//
// The self-test builds a fixture Orca tree whose abilities carry synthetic
// names that do not exist at the pin, so a green control proves the names were
// derived. The control must be green first; then each planted fault must go
// red naming the drift. A plant whose anchor is absent from its input is itself
// a FAIL. The fixture is removed and its removal is checked.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'orca-browser-parity';
const TABLE_REL = '.planning/spikes/005-orca-browser-parity/DISPOSITIONS.md';
const METHODS_REL = 'src/main/runtime/rpc/methods';
export const DISPOSITIONS = ['BiDi', 'BiDi+', 'actor', 'native', 'impossible'];
export const HEADER = '| ability | users | disposition | Gecko mechanism | tier | note |';
const ABILITY = String.raw`browser\.[A-Za-z0-9.]+`;
const NOT_SOURCE = /\.(test|test-fixture)\.tsx?$/;

/** Non-test .ts/.tsx files under dir, recursive. A missing dir yields []. */
function sourceFiles(dir) {
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { recursive: true, withFileTypes: true })
        .filter((e) => e.isFile() && /\.tsx?$/.test(e.name) && !NOT_SOURCE.test(e.name))
        .map((e) => join(e.parentPath, e.name));
}

/** The RPC ability set. Throws when the directory is missing or the set is empty. */
export function deriveRpc(orcaRoot) {
    const dir = join(orcaRoot, METHODS_REL);
    if (!existsSync(dir)) throw new Error(`rpc: ${METHODS_REL}/ not found under the Orca tree (moved upstream?)`);
    const out = new Set();
    for (const f of sourceFiles(dir)) {
        for (const m of readFileSync(f, 'utf8').matchAll(new RegExp(`name:\\s*['"](${ABILITY})['"]`, 'g'))) out.add(m[1]);
    }
    if (out.size === 0) throw new Error(`rpc: derived set is empty (no name: 'browser.*' under ${METHODS_REL}/)`);
    return out;
}

/** Rows of the disposition table, keyed by ability. Throws on a malformed table. */
export function parseDispositions(text) {
    const lines = text.split('\n');
    const at = lines.indexOf(HEADER);
    if (at < 0) throw new Error(`table: header not found, expected exactly "${HEADER}"`);
    const rows = new Map();
    for (const line of lines.slice(at + 2)) {
        if (!line.startsWith('|')) break;
        const cells = line.split('|').slice(1, -1).map((c) => c.trim());
        if (cells.length !== 6) throw new Error(`table: row does not have 6 cells: ${line}`);
        const [ability, users, disposition, mechanism, tier, note] = cells;
        if (rows.has(ability)) throw new Error(`table: duplicate row for ${ability}`);
        if (!DISPOSITIONS.includes(disposition)) throw new Error(`table: ${ability} has disposition "${disposition}", not one of ${DISPOSITIONS.join(', ')}`);
        rows.set(ability, { users, disposition, mechanism, tier, note });
    }
    return rows;
}

/** Pure over its inputs so the self-test can plant faults. Returns { fails, skips, lines }. */
export function check(orcaRoot, dispositionsText) {
    const fails = [];
    const lines = [];
    if (!existsSync(join(orcaRoot, 'src'))) return { fails, skips: ['no fetched Orca tree (orca/src absent); run scripts/fetch-orca.sh'], lines };
    let rpc;
    let rows;
    try { rpc = deriveRpc(orcaRoot); } catch (err) { fails.push(err.message); }
    try { rows = parseDispositions(dispositionsText); } catch (err) { fails.push(err.message); }
    if (!rpc || !rows) return { fails, skips: [], lines };
    for (const a of [...rpc].sort()) {
        const row = rows.get(a);
        if (!row) { fails.push(`ability ${a} is derived from the Orca tree and has no row in the table`); continue; }
        lines.push(`${a} | ${row.users} | ${row.disposition}`);
    }
    for (const a of rows.keys()) if (!rpc.has(a)) fails.push(`row ${a} has no derived ability in the Orca tree`);
    return { fails, skips: [], lines, summary: `${rpc.size} RPC abilities, ${rows.size} rows` };
}

function runSelfTest() {
    const tmp = mkdtempSync(join(tmpdir(), `${NAME}-`));
    const root = join(tmp, 'orca');
    const put = (rel, body) => { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), body); };
    const row = (ability) => `| ${ability} |  | BiDi | fixture | 1 | fixture |`;
    const table = [HEADER, '|---|---|---|---|---|---|', row('browser.fixtureAlpha'), row('browser.fixtureBeta.gamma'), ''].join('\n');
    let code = 1;
    try {
        const skip = check(root, table);
        if (skip.fails.length || skip.skips.length !== 1) {
            console.error(`${NAME} self-test: FAIL -- a fixture with no orca/src did not produce exactly one SKIP and no FAIL`);
            return 1;
        }
        put(`${METHODS_REL}/fixture-core.ts`, "export const A = { name: 'browser.fixtureAlpha' }\nexport const B = { name: 'browser.fixtureBeta.gamma' }\n");
        // Must not be derived: test files are not abilities.
        put(`${METHODS_REL}/fixture-core.test.ts`, "export const T = { name: 'browser.fixtureTestOnly' }\n");
        const control = check(root, table);
        if (control.fails.length || control.lines.length !== 2) {
            console.error(`${NAME} self-test: FAIL -- the clean fixture is not green (${control.fails.join(' | ') || `${control.lines.length} abilities, expected 2`}), so the plant results below would be meaningless`);
            return 1;
        }
        console.log(`${NAME} self-test: clean control green (2 synthetic abilities derived, the test-file name ignored)`);
        console.log(`${NAME} self-test: SKIP case -> a fixture with no orca/src gives one SKIP and no FAIL`);

        const plants = [
            { name: 'orphan-row', naming: 'row browser.fixtureGhost', table: (t) => t.replace(/\n$/, `\n${row('browser.fixtureGhost')}\n`) },
            { name: 'missing-row', naming: 'ability browser.fixtureBeta.gamma', table: (t) => t.replace(`${row('browser.fixtureBeta.gamma')}\n`, '') },
        ];
        let failures = 0;
        for (const p of plants) {
            const planted = p.table(table);
            if (planted === table) { console.error(`  FAIL ${p.name} -> the plant's anchor is absent from its input`); failures++; continue; }
            const text = check(root, planted).fails.join('\n');
            if (!text) { console.error(`  FAIL ${p.name} -> stayed green`); failures++; }
            else if (!text.includes(p.naming)) { console.error(`  FAIL ${p.name} -> red, but not naming '${p.naming}': ${text}`); failures++; }
            else console.log(`  ok ${p.name} -> red, naming '${p.naming}'`);
        }
        if (failures) {
            console.error(`${NAME} self-test: FAIL -- ${failures} of ${plants.length} plant(s) did not go red naming the drift`);
            return 1;
        }
        code = plants.length;
    } finally {
        rmSync(tmp, { recursive: true, force: true });
    }
    if (existsSync(tmp)) { console.error(`${NAME} self-test: FAIL -- the fixture ${tmp} was not removed`); return 1; }
    console.log(`${NAME} self-test: PASS -- ${code} planted faults each went red naming the drift`);
    return 0;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
    const args = process.argv.slice(2);
    const unknown = args.filter((a) => a !== '--self-test');
    if (unknown.length) {
        console.error(`${NAME}: FAIL -- unknown argument ${unknown[0]} (usage: node scripts/orca-browser-parity.mjs [--self-test])`);
        process.exit(2);
    }
    if (args.includes('--self-test')) process.exit(runSelfTest());
    let text = '';
    try { text = readFileSync(join(REPO_ROOT, TABLE_REL), 'utf8'); } catch { /* an unreadable table fails in check() as a missing header */ }
    const r = check(join(REPO_ROOT, 'orca'), text);
    for (const l of r.lines) console.log(l);
    if (r.skips.length) { for (const s of r.skips) console.log(`${NAME}: SKIP -- ${s}`); process.exit(0); }
    if (r.fails.length) { for (const f of r.fails) console.error(`${NAME}: FAIL -- ${f}`); process.exit(1); }
    console.log(`${NAME}: PASS -- ${r.summary}, compared both ways (${TABLE_REL})`);
}
