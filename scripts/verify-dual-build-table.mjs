#!/usr/bin/env node
// scripts/verify-dual-build-table.mjs
//
// dual-build-table (Phase 58, UPS-03): the shape gate for the dual-objdir measurement table in
// docs/BUILD.md ("### Dual-build window (UPS-03)").
//
// Everything is DERIVED from the table itself at check time; no expectation list is kept here.
//   - The tuple column and the verdict column are found in the header by name. The identity
//     columns are the first two (line, objdir); every other column is a measurement column.
//   - A row is FILLED when any measurement cell or its verdict is non-empty. An empty row is the
//     honest "not measured yet" state and is green, so the table can ship as a shell.
//   - A FILLED row must carry a tuple (a 40-hex tree commit, a cite of toolchain-baseline, an
//     ISO date) and a verdict. Unless the verdict is "spills to hosted", every measurement cell
//     must be filled too. A "spills to hosted" verdict must carry the hosted-build evidence link.
//   - There must be at least two rows, one of them on objdir-175, and no two rows may share an
//     objdir (the live objdir is never reused to prove the new line).
//
// This checks the SHAPE only. It cannot tell a real measurement from an invented one; the
// numbers are copied verbatim from the owner's run and quoted in the phase summary.
//
// Usage:
//   node scripts/verify-dual-build-table.mjs
//   node scripts/verify-dual-build-table.mjs --self-test
//
// Reads one file and writes nothing. The --self-test plants each fault in memory and requires
// each to go red naming the cause, with clean controls (empty shell, fully filled, hosted spill)
// proving the red is plant-caused.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'dual-build-table';
const SELF_REL = 'scripts/verify-dual-build-table.mjs';
const DOC_REL = 'docs/BUILD.md';
const HEADING = '### Dual-build window (UPS-03)';
const SPILL = 'spills to hosted';
const HOSTED_LINK = 'INF-04';

const cells = (line) => line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());

// Returns the list of failure strings for one document text; empty means green.
export function check(text) {
    const lines = text.split('\n');
    const start = lines.findIndex((l) => l.trim() === HEADING);
    if (start < 0) return [`the dual-build table heading is missing from ${DOC_REL}; restore the section "${HEADING}"`];
    const rows = [];
    for (let i = start + 1; i < lines.length && !/^#{1,6}\s/.test(lines[i]); i++) {
        if (/^\s*\|/.test(lines[i])) rows.push(cells(lines[i]));
    }
    if (rows.length < 2) return [`the dual-build table has no header and separator rows; rebuild it under "${HEADING}"`];
    const header = rows[0].map((h) => h.toLowerCase());
    const data = rows.slice(2);
    const tupleCol = header.findIndex((h) => h.includes('tuple'));
    const verdictCol = header.findIndex((h) => h.includes('verdict'));
    const failures = [];
    if (tupleCol < 0) failures.push('the table has no build-tuple column; add the column back so every measurement names the tree, host, toolchain and date it came from');
    if (verdictCol < 0) failures.push('the table has no verdict column; add it back so each line records whether the two objdirs fit');
    if (failures.length) return failures;
    const measureCols = header.map((_, i) => i).filter((i) => i > 1 && i !== tupleCol && i !== verdictCol);

    if (data.length < 2) failures.push('the table needs one row per line (live and objdir-175); add the missing row');
    if (!data.some((r) => (r[1] ?? '').includes('objdir-175'))) failures.push('no row names objdir-175; the new line must build in its own objdir, add that row');
    const seen = new Set();
    for (const r of data) {
        const objdir = (r[1] ?? '').replace(/`/g, '').trim();
        if (objdir && seen.has(objdir)) failures.push(`two rows share the objdir "${objdir}"; the live objdir must never be reused, give each line its own`);
        seen.add(objdir);
    }

    for (const r of data) {
        const label = r[0] || '(unnamed row)';
        const tuple = r[tupleCol] ?? '';
        const verdict = r[verdictCol] ?? '';
        const filled = verdict !== '' || measureCols.some((i) => (r[i] ?? '') !== '');
        if (!filled) continue;
        const spill = verdict.toLowerCase().includes(SPILL);
        if (!/\b[0-9a-f]{40}\b/.test(tuple)) failures.push(`row "${label}" is filled but its tuple has no full tree commit; add the output of git rev-parse HEAD from the measured tree`);
        if (!tuple.includes('toolchain-baseline')) failures.push(`row "${label}" is filled but its tuple does not cite toolchain-baseline; name the baseline file the measured build used`);
        if (!/\b\d{4}-\d{2}-\d{2}\b/.test(tuple)) failures.push(`row "${label}" is filled but its tuple has no date; add the date of the measurement as YYYY-MM-DD`);
        if (verdict === '') failures.push(`row "${label}" has measurements but no verdict; record whether both objdirs fit, or "${SPILL}"`);
        if (spill && !verdict.includes(HOSTED_LINK)) failures.push(`row "${label}" spills to hosted but gives no hosted-build evidence link; add the link next to the verdict`);
        if (!spill) {
            const empty = measureCols.filter((i) => (r[i] ?? '') === '').map((i) => rows[0][i]);
            if (empty.length) failures.push(`row "${label}" is only partly filled (empty: ${empty.join(', ')}); fill every measurement column from the run, or leave the whole row empty`);
        }
    }
    return failures;
}

function main() {
    const failures = check(readFileSync(resolve(REPO_ROOT, DOC_REL), 'utf8'));
    if (failures.length) {
        for (const f of failures) console.error(`${NAME}: FAIL -- ${f}`);
        return 1;
    }
    console.log(`${NAME}: PASS -- the dual-build table is a well-formed shell or a fully recorded measurement`);
    return 0;
}

// --- self-test --------------------------------------------------------------
const HEAD = '| line | objdir | du before | du after | df before | df after | mach wall time | D-73 tuple | verdict |\n|---|---|---|---|---|---|---|---|---|\n';
const TUPLE = `${'a'.repeat(40)} + legion + toolchain-baseline.txt + 2026-11-02`;
const table = (...rows) => `## Earlier\n\n${HEADING}\n\nprose\n\n${HEAD}${rows.join('\n')}\n\n## Later\n`;
const EMPTY153 = '| 153 line (live) | `objdir/` | | | | | | | |';
const EMPTY175 = '| 175 line (objdir-175) | `objdir-175/` | | | | | | | |';
const FULL = (line, dir) => `| ${line} | \`${dir}\` | 13G | 13G | 418G | 418G | 2388s | ${TUPLE} | fits |`;
const SPILLED = `| 175 line (objdir-175) | \`objdir-175/\` | | | | | | ${TUPLE} | ${SPILL} (INF-04: evidence link) |`;

function selfTest() {
    const controls = [
        ['empty shell', table(EMPTY153, EMPTY175)],
        ['both rows filled', table(FULL('153 line (live)', 'objdir/'), FULL('175 line (objdir-175)', 'objdir-175/'))],
        ['one row filled, one empty', table(EMPTY153, FULL('175 line (objdir-175)', 'objdir-175/'))],
        ['hosted spill with link', table(EMPTY153, SPILLED)],
    ];
    for (const [name, doc] of controls) {
        const f = check(doc);
        if (f.length) {
            console.error(`${NAME}: --self-test FAIL -- control '${name}' is not green, so the planted-fault results would mean nothing: ${f.join(' | ')}`);
            return 1;
        }
    }
    const noTupleCol = `${HEADING}\n\n| line | objdir | du before | verdict |\n|---|---|---|---|\n| a | \`objdir/\` | | |\n| b | \`objdir-175/\` | | |\n`;
    const plants = [
        ['heading removed', table(EMPTY153, EMPTY175).replace(HEADING, '### Something else'), 'heading is missing'],
        ['tuple column removed', noTupleCol, 'no build-tuple column'],
        ['verdict column removed', noTupleCol.replace('| verdict |', '| tuple |'), 'no verdict column'],
        ['objdir-175 row missing', table(EMPTY153, '| 175 line | `objdir-other/` | | | | | | | |'), 'no row names objdir-175'],
        ['one row only', table(EMPTY175), 'needs one row per line'],
        ['live objdir reused', table(EMPTY153, EMPTY175.replace('`objdir-175/`', '`objdir/`')), 'share the objdir'],
        ['filled row without tuple', table(EMPTY153, FULL('175 line (objdir-175)', 'objdir-175/').replace(TUPLE, '')), 'no full tree commit'],
        ['tuple without baseline cite', table(EMPTY153, FULL('175 line (objdir-175)', 'objdir-175/').replace('toolchain-baseline.txt', 'legion')), 'does not cite toolchain-baseline'],
        ['tuple without date', table(EMPTY153, FULL('175 line (objdir-175)', 'objdir-175/').replace('2026-11-02', 'today')), 'has no date'],
        ['measurements without verdict', table(EMPTY153, FULL('175 line (objdir-175)', 'objdir-175/').replace('| fits |', '| |')), 'no verdict'],
        ['half-filled row', table(EMPTY153, FULL('175 line (objdir-175)', 'objdir-175/').replace('| 2388s |', '| |')), 'only partly filled'],
        ['spill without link', table(EMPTY153, SPILLED.replace('INF-04', 'see notes')), 'no hosted-build evidence link'],
    ];
    for (const [name, doc, needle] of plants) {
        const f = check(doc);
        if (!f.some((m) => m.includes(needle))) {
            console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red naming '${needle}'; got: ${f.join(' | ') || '(no failures at all)'}`);
            return 1;
        }
    }
    console.log(`${NAME}: --self-test PASS -- ${plants.length} planted faults went red naming the cause, and ${controls.length} clean controls stayed green`);
    return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const args = process.argv.slice(2);
    for (const a of args) {
        if (a !== '--self-test') {
            console.error(`${NAME}: unknown argument ${a}`);
            console.error(`  Next step: run: node ${SELF_REL}, or add --self-test to prove the check discriminates.`);
            process.exit(2);
        }
    }
    process.exit(args.includes('--self-test') ? selfTest() : main());
}
