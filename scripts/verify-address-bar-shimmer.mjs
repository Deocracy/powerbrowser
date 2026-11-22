#!/usr/bin/env node
/**
 * The address bar's shimmer row (BAR-11, SMODE-01): "the shimmer row only
 * past the contracted delay, while the list is still outstanding".
 *
 * A query shows the shimmer row from a 150ms timer and clears it only when it
 * finishes while still current. A method that invalidates the query in flight
 * (`this.querySeq += 1`: closeDropdown, textEdited) makes that finish
 * non-current, so the query can no longer clear the row; the invalidating
 * method must clear it itself. Before the fix, Escape over a slow query left
 * `shimmer` true, and the next dropdown ("@" alone, or the next query's first
 * rows) showed a shimmer row with nothing outstanding.
 *
 * Derived from the tree: the AddressBar members that contain
 * `this.querySeq += 1` are read from address-bar.tsx, and each must also
 * assign `this.shimmer = false`. No member list is kept here. The run ends
 * `verify-address-bar-shimmer: PASS` or one FAIL line naming each member that
 * invalidates without clearing. No invalidating member, or no member that sets
 * the shimmer, is a broken instrument, never a pass.
 *
 * --self-test: the clean source must be green; then one copy per
 * invalidating member with its clear removed must go red naming that member.
 *
 * Honestly --quick: reads one source file, writes nothing, no build, no
 * browser, no display, no network.
 *
 * Usage:
 *   node scripts/verify-address-bar-shimmer.mjs
 *   node scripts/verify-address-bar-shimmer.mjs --self-test
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'verify-address-bar-shimmer';
const ADDRESS_BAR_REL = 'theia/extensions/chrome-bar/src/browser/address-bar/address-bar.tsx';

const INVALIDATES = /this\.querySeq\s*\+=\s*1\b/;
const CLEARS = /this\.shimmer\s*=\s*false\b/g;
const SETS = /this\.shimmer\s*=\s*true\b/;

/** Source text without its block and line comments. */
const stripComments = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** The class members of `src` as { name, code }: each runs from its declaration line at member indent to the next one. */
function members(src) {
    const lines = stripComments(src).split('\n');
    const head = /^ {4}(?:(?:protected|public|private|static|readonly|async)\s+)*([A-Za-z_$][\w$]*)\s*[(<=:]/;
    const out = [];
    for (const line of lines) {
        const m = head.exec(line);
        if (m) {
            out.push({ name: m[1], code: line });
        } else if (out.length) {
            out[out.length - 1].code += '\n' + line;
        }
    }
    return out;
}

/** null when every invalidating member clears the shimmer; a broken-instrument string or the drifted names otherwise. */
function check(src) {
    const all = members(src);
    if (!all.some(member => SETS.test(member.code))) {
        return { broken: `no member of ${ADDRESS_BAR_REL} sets this.shimmer = true -- broken instrument` };
    }
    const invalidating = all.filter(member => INVALIDATES.test(member.code));
    if (!invalidating.length) {
        return { broken: `no member of ${ADDRESS_BAR_REL} contains this.querySeq += 1 -- broken instrument` };
    }
    const drift = invalidating.filter(member => !member.code.match(CLEARS)).map(member => member.name);
    return drift.length ? { drift, invalidating: invalidating.map(member => member.name) } : { ok: invalidating.map(member => member.name) };
}

function report(result) {
    if (result.broken) {
        console.log(`${NAME}: FAIL -- ${result.broken}`);
        return 1;
    }
    if (result.drift) {
        for (const name of result.drift) {
            console.log(`${NAME}: FAIL -- ${name} invalidates the query in flight (this.querySeq += 1) and does not clear this.shimmer`);
        }
        return 1;
    }
    console.log(`${NAME}: PASS -- every invalidating member clears the shimmer row: ${result.ok.join(', ')}`);
    return 0;
}

function main() {
    return report(check(readFileSync(join(REPO_ROOT, ADDRESS_BAR_REL), 'utf8')));
}

/** The source with the first `this.shimmer = false` inside `name`'s member removed; null when there is none. */
function plantWithout(src, name) {
    const lines = src.split('\n');
    const head = new RegExp(`^ {4}(?:(?:protected|public|private|static|readonly|async)\\s+)*${name}\\s*[(<=:]`);
    const start = lines.findIndex(line => head.test(line));
    if (start < 0) {
        return null;
    }
    for (let i = start + 1; i < lines.length; i++) {
        if (/^ {4}(?:(?:protected|public|private|static|readonly|async)\s+)*[A-Za-z_$][\w$]*\s*[(<=:]/.test(lines[i])) {
            return null;
        }
        if (/^\s*this\.shimmer\s*=\s*false;\s*$/.test(lines[i])) {
            return [...lines.slice(0, i), ...lines.slice(i + 1)].join('\n');
        }
    }
    return null;
}

function selfTest() {
    const src = readFileSync(join(REPO_ROOT, ADDRESS_BAR_REL), 'utf8');
    const clean = check(src);
    if (!clean.ok) {
        console.log(`${NAME} --self-test: FAIL -- the clean source is not green: ${JSON.stringify(clean)}`);
        return 1;
    }
    console.log(`  ok  clean source -> green (${clean.ok.join(', ')})`);
    let failed = 0;
    for (const name of clean.ok) {
        const planted = plantWithout(src, name);
        if (planted === null || planted === src) {
            console.log(`  FAIL  plant "${name} without its clear" did not apply`);
            failed++;
            continue;
        }
        const got = check(planted);
        if (got.drift && got.drift.includes(name)) {
            console.log(`  ok  ${name} without its clear -> red: ${got.drift.join(', ')}`);
        } else {
            console.log(`  FAIL  ${name} without its clear stayed green: ${JSON.stringify(got)}`);
            failed++;
        }
    }
    const unset = check(src.replace(/this\.shimmer\s*=\s*true\b/g, 'this.shimmer = !!true'));
    if (unset.broken) {
        console.log('  ok  no shimmer set -> broken instrument');
    } else {
        console.log(`  FAIL  no shimmer set was not a broken instrument: ${JSON.stringify(unset)}`);
        failed++;
    }
    if (failed) {
        console.log(`${NAME} --self-test: FAIL -- ${failed} plant(s) did not go red`);
        return 1;
    }
    console.log(`${NAME} --self-test: PASS -- the clean source is green and ${clean.ok.length + 1} planted faults went red`);
    return 0;
}

process.exit(process.argv.includes('--self-test') ? selfTest() : main());
