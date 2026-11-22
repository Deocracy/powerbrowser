#!/usr/bin/env node
// Shifts every `<shell file>:<line>` reference in powerbrowser/INTERNAL-APIS.md by the exact
// offsets of `git diff -U0 <base> -- powerbrowser/shell/<file>`, for each shell file that changed.
// A reference whose old line lies inside a changed hunk cannot be mapped exactly: it is moved to
// the matching offset inside the new hunk and listed, so each one is checked by hand.
// scripts/verify-ng-040-internals-catalogue-lines.mjs (without --fix) is the confirmation.
//
// usage (repository root): node .planning/workstreams/orca/refactor/restamp-catalogue.mjs <base> [--write]
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const [base, flag] = process.argv.slice(2);
if (!base) {
    console.error('usage: restamp-catalogue.mjs <base> [--write]');
    process.exit(2);
}
const CATALOGUE = 'powerbrowser/INTERNAL-APIS.md';
const SHELL = 'powerbrowser/shell/';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 28 });

const changed = git('diff', '--name-only', base, '--', SHELL).split('\n').filter(Boolean);
const hunksByFile = new Map();
for (const path of changed) {
    const hunks = [];
    for (const line of git('diff', '-U0', base, '--', path).split('\n')) {
        const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
        if (m) {
            hunks.push({ a: Number(m[1]), b: m[2] === undefined ? 1 : Number(m[2]), c: Number(m[3]), d: m[4] === undefined ? 1 : Number(m[4]) });
        }
    }
    hunksByFile.set(path.slice(SHELL.length), hunks);
}

// Maps an old line number to { line, inside }.
function mapLine(hunks, old) {
    let shift = 0;
    for (const { a, b, c, d } of hunks) {
        if (b === 0) {
            // Pure insertion after old line `a`.
            if (old > a) { shift += d; }
            continue;
        }
        if (old < a) { break; }
        if (old <= a + b - 1) {
            const within = d === 0 ? c : Math.min(c + (old - a), c + d - 1);
            return { line: within, inside: true };
        }
        shift += d - b;
    }
    return { line: old + shift, inside: false };
}

const before = readFileSync(CATALOGUE, 'utf8');
const flagged = [];
let moved = 0;
const after = before.split('\n').map((text, index) => text.replace(
    /([A-Za-z][\w-]*\.(?:sys\.mjs|js|xhtml|css)):(\d+)(?:-(\d+))?/g,
    (whole, file, first, last) => {
        const hunks = hunksByFile.get(file);
        if (!hunks) { return whole; }
        const from = mapLine(hunks, Number(first));
        const to = last === undefined ? null : mapLine(hunks, Number(last));
        if (from.inside || to?.inside) {
            flagged.push(`${CATALOGUE}:${index + 1}  ${whole} -> ${file}:${from.line}${to ? `-${to.line}` : ''}`);
        }
        const next = `${file}:${from.line}${to ? `-${to.line}` : ''}`;
        if (next !== whole) { moved += 1; }
        return next;
    },
)).join('\n');

console.log(`restamp-catalogue: ${changed.length} shell file(s) changed since ${base}; ${moved} reference(s) move; ${flagged.length} inside a changed hunk`);
for (const line of flagged) { console.log(`  check by hand: ${line}`); }
if (flag === '--write') {
    writeFileSync(CATALOGUE, after);
    console.log(`restamp-catalogue: wrote ${CATALOGUE}`);
} else {
    console.log('restamp-catalogue: dry run; pass --write to apply');
}
