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
//     *.test-fixture.ts.
//  b. the automation set: the 'browser.*' strings inside the
//     BROWSER_CLIENT_AUTOMATION_METHODS array (the client-host protocol, S2).
//  c. the provider members: the readonly browser<Name> fields of
//     class RuntimeBrowserCommands (the provider interface, S1).
//  d. the CLI set: the path: [ specs of cli/specs/browser-basic.ts and
//     browser-advanced.ts, and the quoted 'browser.*' names under src/cli/.
//  e. the users of each ability: agent and CLI when its quoted name appears
//     under src/cli/, renderer under src/renderer/, orcad under
//     src/main/orcad/, main under src/main/browser/ (the desktop client host
//     and its bridge). Each is intersected with (a), so a renderer translation
//     key of the same shape is never an ability. An ability with no user in
//     those trees is written none.
// Any of (a) to (d) being empty, or its file, constant or class having moved,
// is red: a re-pin can never pass on nothing.
// Compared both ways with the table rows:
//  f. a derived ability with no row is red, naming the ability;
//  g. a row with no derived ability is red, naming the row;
//  h. a row whose users cell differs from (e) is red, naming both sets.
// The table itself is refused when its header is not exactly
// | ability | users | disposition | Gecko mechanism | tier | note |, when an
// ability appears twice, or when a disposition is not one of BiDi, BiDi+,
// actor, native, impossible. Counts and set differences are printed, never
// asserted as literals; member-to-RPC spelling mismatches are notes.
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
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'orca-browser-parity';
const TABLE_REL = '.planning/spikes/005-orca-browser-parity/DISPOSITIONS.md';
const METHODS_REL = 'src/main/runtime/rpc/methods';
const AUTOMATION_REL = 'src/shared/browser-client-automation-protocol.ts';
const AUTOMATION_CONST = 'BROWSER_CLIENT_AUTOMATION_METHODS';
const MEMBERS_REL = 'src/main/runtime/browser/browser-commands.ts';
const MEMBERS_CLASS = 'RuntimeBrowserCommands';
const CLI_SPECS_REL = ['src/cli/specs/browser-basic.ts', 'src/cli/specs/browser-advanced.ts'];
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

const OVERLAY_FILES = join(REPO_ROOT, 'orca-overlay', 'files');

/**
 * Quoted 'browser.<name>' literals in the non-test sources under orcaRoot/rel. A file whose Orca-relative path is a
 * PowerBrowser overlay copy (the same path under orca-overlay/files/, which build-orca.sh copies in) is PB's own code,
 * not Orca's, and adds no user (66-06: the Phase 66 browser host is a renderer-tree overlay; P66-19 keeps the table).
 */
function quotedNames(orcaRoot, rel) {
    const out = new Set();
    for (const f of sourceFiles(join(orcaRoot, rel))) {
        if (existsSync(join(OVERLAY_FILES, relative(orcaRoot, f)))) continue;
        for (const m of readFileSync(f, 'utf8').matchAll(new RegExp(`['"\`](${ABILITY})['"\`]`, 'g'))) out.add(m[1]);
    }
    return out;
}

function readOrThrow(orcaRoot, rel, what) {
    try { return readFileSync(join(orcaRoot, rel), 'utf8'); } catch { throw new Error(`${what}: ${rel} not found under the Orca tree (moved upstream?)`); }
}

/** The member a provider would carry for an RPC name: browser.cookie.get -> browserCookieGet. */
const memberOf = (ability) => ability.split('.').map((p, i) => (i ? p[0].toUpperCase() + p.slice(1) : p)).join('');

/**
 * Every derived set. Throws naming the set when a source file or its constant
 * has moved or the set is empty, so a re-pin can never pass on nothing.
 * users maps each RPC name to its sorted component list.
 */
export function deriveAll(orcaRoot) {
    const rpc = deriveRpc(orcaRoot);

    const autoText = readOrThrow(orcaRoot, AUTOMATION_REL, 'automation');
    const body = new RegExp(`export const ${AUTOMATION_CONST} = \\[([\\s\\S]*?)\\] as const`).exec(autoText)?.[1];
    if (body === undefined) throw new Error(`automation: constant ${AUTOMATION_CONST} not found in ${AUTOMATION_REL}`);
    const automation = new Set([...body.matchAll(new RegExp(`['"](${ABILITY})['"]`, 'g'))].map((m) => m[1]));
    if (automation.size === 0) throw new Error(`automation: ${AUTOMATION_CONST} is empty in ${AUTOMATION_REL}`);

    const memberText = readOrThrow(orcaRoot, MEMBERS_REL, 'members');
    const classAt = memberText.search(new RegExp(`\\bclass ${MEMBERS_CLASS}\\b`));
    if (classAt < 0) throw new Error(`members: class ${MEMBERS_CLASS} not found in ${MEMBERS_REL}`);
    const members = new Set([...memberText.slice(classAt).matchAll(/^\s*readonly (browser[A-Za-z0-9]+)\b/gm)].map((m) => m[1]));
    if (members.size === 0) throw new Error(`members: class ${MEMBERS_CLASS} has no readonly browser* member (empty) in ${MEMBERS_REL}`);

    let specs = 0;
    for (const rel of CLI_SPECS_REL) specs += (readOrThrow(orcaRoot, rel, 'cli').match(/\bpath:\s*\[/g) ?? []).length;
    const cliNames = quotedNames(orcaRoot, 'src/cli');
    if (specs === 0 || cliNames.size === 0) throw new Error(`cli: ${specs === 0 ? `no path: [ spec in ${CLI_SPECS_REL.join(' or ')}` : "no quoted 'browser.*' name under src/cli/"} (empty)`);

    // Intersected with rpc below, so renderer translation keys that share the
    // browser.<x> shape never count as abilities.
    const where = {
        agent: cliNames,
        CLI: cliNames,
        renderer: quotedNames(orcaRoot, 'src/renderer'),
        orcad: quotedNames(orcaRoot, 'src/main/orcad'),
        main: quotedNames(orcaRoot, 'src/main/browser'),
    };
    const users = new Map();
    for (const a of rpc) users.set(a, Object.keys(where).filter((c) => where[c].has(a)).sort());
    return { rpc, automation, members, cli: { specs, names: cliNames }, users };
}

const cell = (list) => (list.length ? list.join(', ') : 'none');

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

/** Pure over its inputs so the self-test can plant faults. Returns { fails, skips, lines, notes, summary, derived }. */
export function check(orcaRoot, dispositionsText) {
    const fails = [];
    const lines = [];
    const notes = [];
    if (!existsSync(join(orcaRoot, 'src'))) return { fails, skips: ['no fetched Orca tree (orca/src absent); run scripts/fetch-orca.sh'], lines, notes };
    let d;
    let rows;
    try { d = deriveAll(orcaRoot); } catch (err) { fails.push(err.message); }
    try { rows = parseDispositions(dispositionsText); } catch (err) { fails.push(err.message); }
    if (!d || !rows) return { fails, skips: [], lines, notes };
    for (const a of [...d.rpc].sort()) {
        const row = rows.get(a);
        if (!row) { fails.push(`ability ${a} is derived from the Orca tree and has no row in the table`); continue; }
        const derived = cell(d.users.get(a));
        const kept = cell(row.users.split(',').map((u) => u.trim()).filter(Boolean).sort());
        if (kept !== derived) fails.push(`row ${a} lists users [${kept}], the Orca tree gives [${derived}]`);
        lines.push(`${a} | ${derived} | ${row.disposition}`);
    }
    for (const a of rows.keys()) if (!d.rpc.has(a)) fails.push(`row ${a} has no derived ability in the Orca tree`);

    const minus = (x, y) => [...x].filter((v) => !y.has(v)).sort();
    const rpcOnly = minus(d.rpc, d.automation);
    const autoOnly = minus(d.automation, d.rpc);
    const rpcMembers = new Set([...d.rpc].map(memberOf));
    const membersOnly = minus(d.members, rpcMembers);
    const noMember = [...d.rpc].filter((a) => !d.members.has(memberOf(a))).sort();
    notes.push(`derived counts: ${d.automation.size} automation methods, ${d.rpc.size} RPC abilities, ${d.members.size} provider members, ${d.cli.specs} CLI specs (${d.cli.names.size} names used under src/cli/)`);
    notes.push(`RPC minus automation (${rpcOnly.length}): ${rpcOnly.join(' ') || '-'}`);
    notes.push(`automation minus RPC (${autoOnly.length}): ${autoOnly.join(' ') || '-'}`);
    notes.push(`note: provider members with no RPC name of the same spelling (${membersOnly.length}): ${membersOnly.join(' ') || '-'}`);
    notes.push(`note: RPC abilities with no provider member of the same spelling (${noMember.length}): ${noMember.join(' ') || '-'}`);
    const by = {};
    for (const a of d.rpc) if (rows.has(a)) by[rows.get(a).disposition] = (by[rows.get(a).disposition] ?? 0) + 1;
    notes.push(`dispositions: ${DISPOSITIONS.map((k) => `${k} ${by[k] ?? 0}`).join(', ')}`);
    return {
        fails, skips: [], lines, notes, derived: d,
        summary: `${d.automation.size} automation, ${d.rpc.size} RPC, ${d.members.size} provider members, ${d.cli.specs} CLI specs; ${rows.size} rows`,
    };
}

function runSelfTest() {
    const tmp = mkdtempSync(join(tmpdir(), `${NAME}-`));
    const root = join(tmp, 'orca');
    const put = (rel, body) => { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), body); };
    const row = (ability, users) => `| ${ability} | ${users} | BiDi | fixture | 1 | fixture |`;
    const beta = row('browser.fixtureBeta.gamma', 'renderer');
    const table = [HEADER, '|---|---|---|---|---|---|', row('browser.fixtureAlpha', 'CLI, agent, orcad'), beta, ''].join('\n');
    let passed = 0;
    try {
        const skip = check(root, table);
        if (skip.fails.length || skip.skips.length !== 1) {
            console.error(`${NAME} self-test: FAIL -- a fixture with no orca/src did not produce exactly one SKIP and no FAIL`);
            return 1;
        }
        put(`${METHODS_REL}/fixture-core.ts`, "export const A = { name: 'browser.fixtureAlpha' }\nexport const B = { name: 'browser.fixtureBeta.gamma' }\n");
        // Must not be derived: test files are not abilities.
        put(`${METHODS_REL}/fixture-core.test.ts`, "export const T = { name: 'browser.fixtureTestOnly' }\n");
        put(AUTOMATION_REL, `export const ${AUTOMATION_CONST} = [\n  'browser.fixtureAlpha',\n] as const\n`);
        put(MEMBERS_REL, `export class ${MEMBERS_CLASS} {\n  readonly browserFixtureAlpha: unknown\n  readonly browserFixtureBetaGamma: unknown\n}\n`);
        put(CLI_SPECS_REL[0], "export const S = [{ path: ['fixture', 'alpha'] }, { path: ['fixture', 'beta'] }]\n");
        put(CLI_SPECS_REL[1], 'export const S = []\n');
        put('src/cli/browser/fixture.ts', "client.call('browser.fixtureAlpha')\n");
        put('src/main/orcad/fixture.ts', "route('browser.fixtureAlpha')\n");
        // The second name is a translation key, not an ability: it must add no renderer user.
        put('src/renderer/src/fixture.tsx', "call('browser.fixtureBeta.gamma'); t('browser.fixtureI18n.title')\n");
        // A PB overlay copy (a path that exists under orca-overlay/files/) is not Orca's code: it must add no renderer user.
        put('src/renderer/src/pb/browser-host/pb-browser-host.ts', "call('browser.fixtureAlpha')\n");
        const control = check(root, table);
        const i18nUser = control.derived?.users.has('browser.fixtureI18n.title');
        if (control.fails.length || control.lines.length !== 2 || i18nUser) {
            console.error(`${NAME} self-test: FAIL -- the clean fixture is not green (${control.fails.join(' | ') || (i18nUser ? 'a translation key became an ability user' : `${control.lines.length} abilities, expected 2`)}), so the plant results below would be meaningless`);
            return 1;
        }
        console.log(`${NAME} self-test: clean control green (2 synthetic abilities derived with their users; the test-file name, the renderer translation key and a PB overlay copy ignored)`);
        console.log(`${NAME} self-test: SKIP case -> a fixture with no orca/src gives one SKIP and no FAIL`);

        // A tree plant rewrites one fixture file and returns its undo; null means the anchor was absent.
        const edit = (rel, from, to) => () => {
            const before = readFileSync(join(root, rel), 'utf8');
            const after = before.replace(from, to);
            if (after === before) return null;
            writeFileSync(join(root, rel), after);
            return () => writeFileSync(join(root, rel), before);
        };
        const remove = (rel) => () => {
            const before = readFileSync(join(root, rel), 'utf8');
            rmSync(join(root, rel));
            return () => writeFileSync(join(root, rel), before);
        };
        const plants = [
            { name: 'orphan-row', naming: ['row browser.fixtureGhost'], table: (t) => t.replace(/\n$/, `\n${row('browser.fixtureGhost', 'renderer')}\n`) },
            { name: 'missing-row', naming: ['ability browser.fixtureBeta.gamma'], table: (t) => t.replace(`${beta}\n`, '') },
            { name: 'empty-derivation', naming: ['automation', 'empty'], tree: edit(AUTOMATION_REL, "  'browser.fixtureAlpha',\n", '') },
            { name: 'moved-constant', naming: [AUTOMATION_CONST, 'not found'], tree: edit(AUTOMATION_REL, AUTOMATION_CONST, 'BROWSER_FIXTURE_RENAMED') },
            { name: 'moved-file', naming: [AUTOMATION_REL], tree: remove(AUTOMATION_REL) },
            { name: 'renamed-provider-class', naming: [MEMBERS_CLASS, 'not found'], tree: edit(MEMBERS_REL, MEMBERS_CLASS, 'FixtureRenamed') },
            { name: 'empty-cli-specs', naming: ['cli', 'empty'], tree: edit(CLI_SPECS_REL[0], /path:/g, 'x:') },
            { name: 'wrong-component-set', naming: ['browser.fixtureBeta.gamma', '[orcad]', '[renderer]'], table: (t) => t.replace(beta, row('browser.fixtureBeta.gamma', 'orcad')) },
            { name: 'i18n-key-row', naming: ['row browser.fixtureI18n.title'], table: (t) => t.replace(/\n$/, `\n${row('browser.fixtureI18n.title', 'renderer')}\n`) },
        ];
        let failures = 0;
        for (const p of plants) {
            const planted = p.table ? p.table(table) : table;
            const undo = p.tree ? p.tree() : undefined;
            try {
                if ((p.table && planted === table) || undo === null) { console.error(`  FAIL ${p.name} -> the plant's anchor is absent from its input`); failures++; continue; }
                const text = check(root, planted).fails.join('\n');
                const unnamed = p.naming.filter((n) => !text.includes(n));
                if (!text) { console.error(`  FAIL ${p.name} -> stayed green`); failures++; }
                else if (unnamed.length) { console.error(`  FAIL ${p.name} -> red, but not naming '${unnamed.join("', '")}': ${text}`); failures++; }
                else console.log(`  ok ${p.name} -> red, naming '${p.naming.join("', '")}'`);
            } finally {
                undo?.();
            }
            const after = check(root, table);
            if (after.fails.length) { console.error(`${NAME} self-test: FAIL -- plant ${p.name} did not clean up: ${after.fails.join(' | ')}`); return 1; }
        }
        if (failures) {
            console.error(`${NAME} self-test: FAIL -- ${failures} of ${plants.length} plant(s) did not go red naming the drift`);
            return 1;
        }
        passed = plants.length;
    } finally {
        rmSync(tmp, { recursive: true, force: true });
    }
    if (existsSync(tmp)) { console.error(`${NAME} self-test: FAIL -- the fixture ${tmp} was not removed`); return 1; }
    console.log(`${NAME} self-test: PASS -- ${passed} planted faults each went red naming the drift`);
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
    for (const l of r.notes) console.log(l);
    if (r.skips.length) { for (const s of r.skips) console.log(`${NAME}: SKIP -- ${s}`); process.exit(0); }
    if (r.fails.length) { for (const f of r.fails) console.error(`${NAME}: FAIL -- ${f}`); process.exit(1); }
    console.log(`${NAME}: PASS -- ${r.summary}; abilities and users compared both ways (${TABLE_REL})`);
}
