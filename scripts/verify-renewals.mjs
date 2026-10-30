#!/usr/bin/env node
// scripts/verify-renewals.mjs
//
// The renewals register row (Phase 42, DOC-04, quick half). docs/RENEWALS.md is
// the one table of every renewable item the release machinery depends on. This
// row checks its structure only:
//
//  1. Table. A header row of exactly Item, Expiry, Last checked, Owner action,
//     Source, followed by a separator and pipe rows. A missing header is red. A
//     row with another column count is unparseable and red, naming the row.
//  2. Dates. Each row's Expiry cell is a whole date, a whole bare year, a whole
//     Month YYYY, blank (no expiry) or unknown (not recorded). Its Last checked cell
//     is a whole ISO date. Every date must be a real calendar date: 2026-02-31 and
//     2026-13-45 are red. A cell with extra words around a date is red.
//  3. Owner action. Each row's action cell begins with an imperative verb from
//     VERBS, so every row names what the owner does.
//  4. Items. No two rows name the same item, ignoring case and surrounding
//     space. A merged duplicate would hide a missed renewal, so both rows are named.
//  5. Floor. Every item in REQUIRED_ITEMS has a row, matched as a case-insensitive
//     prefix of the Item cell. A deleted row is red. The list is a floor, not a
//     ceiling: a new renewable item needs no entry.
//  6. Table shape. The separator has the header's column count. Once the table
//     ends, no later line may carry a pipe, so a blank line or a row without its
//     leading pipe cannot end the scan quietly and leave rows unchecked.
//  7. Vacuity. A table with no rows is red.
//
// The calendar check (a date within 30 days) is not here: it is the maintenance
// sweep's renewals-due row (Phase 48). This row reads one file and writes nothing.
// No build, browser, display or network. Failures print sorted by row number, so
// two runs over one tree print identical output. The --self-test plants each
// fault in memory through runChecks' text override.

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'renewals';
const SELF_REL = 'scripts/verify-renewals.mjs';
const REGISTER_REL = 'docs/RENEWALS.md';
const HEADER = Object.freeze(['Item', 'Expiry', 'Last checked', 'Owner action', 'Source']);
const VERBS = Object.freeze(['renew', 'rotate', 're-verify', 'replace', 'confirm', 'decide', 'ship', 'record', 'check', 'review']);
const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December';
// The committed required-items list. It holds the DOC-04 family (Domain, Apple
// Developer membership, MAR signing certificate) and every row present when it was
// written. A key matches a row whose Item cell starts with it, ignoring case. Wording
// changes to a row that keep the prefix need no edit here; a retired item is removed
// from this list in the same reviewed commit that retires its row.
const REQUIRED_ITEMS = Object.freeze([
    'Google Safe Browsing API key',
    'Domain powerbrowser.org',
    'Apple Developer membership',
    'Developer ID certificate',
    'Azure Artifact Signing identity validation',
    'App private key, powerbrowser-bot',
    'App private key, powerbrowser-clock',
    'Cachix token',
    'Cloudflare wrangler deploy token',
    'Cloudflare R2 object-write token',
    'Telemetry route shared secret',
    'Codeberg deploy token',
    'Anthropic key, fixer',
    'Anthropic key, triage',
    'winget submission credential',
    'MAR signing certificate',
    'Node 24 end of life',
    'ESR 153 final point release',
    'ESR 175 nightly train',
    'ESR 175 beta train',
    'ESR 175 release train',
]);
const WHOLE_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const WHOLE_YEAR = /^(?:19|20)\d{2}$/;
const WHOLE_MONTH_YEAR = new RegExp(`^(?:${MONTHS}) (?:19|20)\\d{2}$`);

const args = process.argv.slice(2);
for (const a of args) {
    if (a !== '--self-test') {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
        console.error(`  Next step: run: node ${SELF_REL}, or add --self-test to prove the structure check discriminates.`);
        process.exit(2);
    }
}

const show = (v) => JSON.stringify(v ?? null);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const cellsOf = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(s => s.trim());
const isPipeRow = (line) => line.trim().startsWith('|');
const isSeparator = (line) => /^\|\s*-/.test(line.trim());
// A real calendar date: the round trip through Date keeps year, month and day.
function isRealIso(cell) {
    const m = WHOLE_ISO.exec(cell);
    if (!m) return false;
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const t = new Date(Date.UTC(y, mo - 1, d));
    return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}
// Null when the Expiry cell is acceptable, else the reason it is not.
function expiryProblem(cell) {
    if (cell === '' || cell === 'unknown' || WHOLE_YEAR.test(cell) || WHOLE_MONTH_YEAR.test(cell)) return null;
    if (WHOLE_ISO.test(cell)) return isRealIso(cell) ? null : 'is not a real calendar date';
    return 'holds no whole date, bare year or Month YYYY, and is neither blank nor unknown';
}
function checkedProblem(cell) {
    if (WHOLE_ISO.test(cell)) return isRealIso(cell) ? null : 'is not a real calendar date';
    return 'holds no whole ISO date';
}

export function runChecks(root, overrides = {}) {
    const text = overrides.text ?? readFileSync(join(root, REGISTER_REL), 'utf8');
    const lines = text.split('\n');
    const found = [];
    const fail = (row, text) => found.push({ row, text });

    const h = lines.findIndex(l => isPipeRow(l) && cellsOf(l).join('|') === HEADER.join('|'));
    if (h === -1) {
        fail(1, `${REGISTER_REL}: no table with the header ${HEADER.join(' | ')} was found. Next step: restore the table's header row.`);
        return { failures: found.map(f => f.text), rows: 0 };
    }

    const seen = new Map();
    let rows = 0;
    let i = h + 1;
    if (i < lines.length && isSeparator(lines[i])) {
        const cols = cellsOf(lines[i]).length;
        if (cols !== HEADER.length) fail(i + 1, `${REGISTER_REL}:${i + 1} is a separator with ${cols} columns, not ${HEADER.length}, so the table is not laid out as its header declares. Next step: restore the separator to ${HEADER.length} columns.`);
        i += 1;
    }
    for (; i < lines.length && isPipeRow(lines[i]); i += 1) {
        const n = i + 1;
        const cells = cellsOf(lines[i]);
        if (cells.length !== HEADER.length) {
            fail(n, `${REGISTER_REL}:${n} (${cells[0] ?? ''}) has ${cells.length} columns, not ${HEADER.length}, so the table is unparseable there. Next step: give the row an Item, Date, Owner action and Source cell.`);
            continue;
        }
        rows += 1;
        const [item, expiry, checked, action] = cells;
        if (item === '') {
            fail(n, `${REGISTER_REL}:${n} has no item name. Next step: name the renewable item in its first cell.`);
        } else {
            seen.set(item.toLowerCase(), [...(seen.get(item.toLowerCase()) ?? []), { n, item }]);
        }
        const expiryWhy = expiryProblem(expiry);
        if (expiryWhy !== null) {
            fail(n, `${REGISTER_REL}:${n} (${item}): the Expiry cell ${show(expiry)} ${expiryWhy}. Next step: put a real date, a bare year, Month YYYY, blank or unknown in the Expiry cell.`);
        }
        const checkedWhy = checkedProblem(checked);
        if (checkedWhy !== null) {
            fail(n, `${REGISTER_REL}:${n} (${item}): the Last checked cell ${show(checked)} ${checkedWhy}. Next step: put the ISO date this item was last checked in that cell.`);
        }
        const verb = (action.split(/\s+/)[0] ?? '').toLowerCase();
        if (!VERBS.includes(verb)) {
            fail(n, `${REGISTER_REL}:${n} (${item}): the owner action ${show(action)} does not begin with an imperative verb (${VERBS.join(', ')}). Next step: write the action as what the owner does.`);
        }
    }
    for (let k = i; k < lines.length; k += 1) {
        if (lines[k].trim() !== '' && lines[k].includes('|')) {
            fail(k + 1, `${REGISTER_REL}:${k + 1} (${cellsOf(lines[k])[0]}) sits after the table ends, so it is not checked. Next step: keep every row in one contiguous table, each starting with a pipe, with no blank line inside it.`);
        }
    }
    const present = [...seen.values()].flat().map(g => g.item.toLowerCase());
    for (const key of REQUIRED_ITEMS) {
        if (!present.some(item => item.startsWith(key.toLowerCase()))) {
            fail(h + 1, `${REGISTER_REL}: required item ${show(key)} has no row. Next step: restore its row; if the item is retired, remove it from REQUIRED_ITEMS in ${SELF_REL} in the same reviewed commit.`);
        }
    }
    for (const group of seen.values()) {
        if (group.length > 1) {
            const at = group.map(g => g.n);
            fail(at[0], `${REGISTER_REL}: rows ${at.join(' and ')} both name ${show(group[0].item)}. Next step: give each row the one item it covers, or delete the duplicate; a merged duplicate hides a missed renewal.`);
        }
    }
    if (rows === 0) {
        fail(h + 1, `${REGISTER_REL}: the table has no rows, so no renewal is registered. Next step: add the renewable items.`);
    }

    found.sort((a, b) => a.row - b.row || cmp(a.text, b.text));
    return { failures: found.map(f => f.text), rows };
}

function main() {
    const { failures, rows } = runChecks(REPO_ROOT);
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} problem(s) in ${REGISTER_REL}`);
        failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- ${rows} row(s) in ${REGISTER_REL} each carry an Expiry cell, a Last checked date and an owner action, and no item is named twice`);
    return 0;
}

// --- self-test --------------------------------------------------------------

function selfTest() {
    const original = readFileSync(join(REPO_ROOT, REGISTER_REL), 'utf8');
    const base = runChecks(REPO_ROOT, { text: original });
    if (base.failures.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- the register is not green, so the planted-fault results below would mean nothing:`);
        base.failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log(`  ok  baseline: the register is green (${base.rows} row(s))`);

    const mutate = (fn) => {
        const lines = original.split('\n');
        fn(lines);
        return { text: lines.join('\n') };
    };
    const rowAt = (lines, item) => lines.findIndex(l => isPipeRow(l) && cellsOf(l)[0] === item);
    const setCell = (item, col, value) => mutate((lines) => {
        const i = rowAt(lines, item);
        const c = cellsOf(lines[i]);
        c[col] = value;
        lines[i] = `| ${c.join(' | ')} |`;
    });
    const lastRowIndex = (lines) => lines.reduce((acc, l, idx) => (isPipeRow(l) && idx > 0 ? idx : acc), -1);

    const plants = [
        ['a row with no last-checked date', setCell('Domain powerbrowser.org', 2, 'soon'), ['Domain powerbrowser.org', 'Last checked']],
        ['an actionless row', setCell('Apple Developer membership', 3, ''), ['Apple Developer membership', 'owner action']],
        ['a non-imperative owner action', setCell('Cachix token', 3, 'The token is rotated yearly'), ['Cachix token', 'imperative verb']],
        ['a row with a missing cell', mutate((lines) => {
            const i = rowAt(lines, 'Node 24 end of life');
            lines[i] = '| Node 24 end of life | 2028-04-30 |';
        }), ['Node 24 end of life', 'columns']],
        ['a missing table header', mutate((lines) => {
            const i = lines.findIndex(l => isPipeRow(l) && cellsOf(l)[0] === 'Item');
            lines[i] = '| Item | Date | Action | Source |';
        }), ['no table', REGISTER_REL]],
        ['a duplicate item', mutate((lines) => {
            const i = rowAt(lines, 'Domain powerbrowser.org');
            lines.splice(lastRowIndex(lines) + 1, 0, lines[i]);
        }), ['both name', 'Domain powerbrowser.org']],
        ['a table with no rows', mutate((lines) => {
            const h = lines.findIndex(l => isPipeRow(l) && cellsOf(l)[0] === 'Item');
            const kept = lines.filter((l, idx) => idx <= h + 1 || !isPipeRow(l));
            lines.splice(0, lines.length, ...kept);
        }), ['no rows']],
        ['a blank line inside the table', mutate((lines) => { lines.splice(rowAt(lines, 'Apple Developer membership'), 0, ''); }), ['Apple Developer membership', 'sits after the table ends']],
        ['a row without its leading pipe after the table', mutate((lines) => {
            const i = rowAt(lines, 'ESR 175 release train');
            lines[i] = lines[i].trim().replace(/^\|\s*/, '');
        }), ['ESR 175 release train', 'sits after the table ends']],
        ['an expiry that is not a real calendar date (2026-13-45)', setCell('Domain powerbrowser.org', 1, '2026-13-45'), ['Domain powerbrowser.org', '2026-13-45', 'real calendar date']],
        ['an expiry on a day that does not exist (2026-02-31)', setCell('Apple Developer membership', 1, '2026-02-31'), ['Apple Developer membership', '2026-02-31', 'real calendar date']],
        ['an expiry with words around a year', setCell('Cachix token', 1, 'soon, see the 2026 plan'), ['Cachix token', 'soon, see the 2026 plan']],
        ['a last-checked date that is not real', setCell('Cachix token', 2, '2026-02-30'), ['Cachix token', '2026-02-30', 'real calendar date']],
        ['a deleted row', mutate((lines) => { lines.splice(rowAt(lines, 'Domain powerbrowser.org'), 1); }), ['Domain powerbrowser.org', 'has no row']],
        ['a separator with the wrong column count', mutate((lines) => { lines[lines.findIndex(isSeparator)] = '| --- | --- | --- |'; }), ['separator', '3 columns']],
    ];

    let failed = 0;
    for (const [name, overrides, needles] of plants) {
        const { failures } = runChecks(REPO_ROOT, overrides);
        if (failures.some(f => needles.every(n => f.includes(n)))) {
            console.log(`  ok  ${name} -> red, naming ${needles.map(n => `'${n}'`).join(' and ')}`);
        } else {
            console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red naming ${needles.join(' and ')}; got: ${failures.join(' | ') || '(no failures at all)'}`);
            failed += 1;
        }
    }

    const controls = [
        ['a Month YYYY deadline in the Expiry cell', setCell('Node 24 end of life', 1, 'April 2028')],
        ['a blank Expiry on a row that does not expire', setCell('App private key, powerbrowser-bot', 1, '')],
    ];
    for (const [name, overrides] of controls) {
        const { failures } = runChecks(REPO_ROOT, overrides);
        if (failures.length === 0) {
            console.log(`  ok  control: ${name} -> green`);
        } else {
            console.error(`${NAME}: --self-test FAIL -- the control '${name}' went red: ${failures.join(' | ')}`);
            failed += 1;
        }
    }

    if (failed > 0) return 1;
    console.log(`${NAME}: --self-test PASS -- ${plants.length} planted faults went red naming the row, and ${controls.length} control(s) stayed green`);
    return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    process.exit(args.includes('--self-test') ? selfTest() : main());
}
