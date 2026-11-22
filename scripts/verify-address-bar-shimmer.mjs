#!/usr/bin/env node
/**
 * The address bar's shimmer row (BAR-11, SMODE-01): "the shimmer row only
 * past the contracted delay, while the list is still outstanding".
 *
 * A query (runQuery, runLocalQuery) shows the shimmer row from a 150ms timer
 * and clears it only when it finishes while still current. A member that
 * invalidates the query in flight (`this.querySeq += 1`: closeDropdown,
 * textEdited) makes that finish non-current, so the old query can no longer
 * clear the row. The rule, per exit of every such member:
 *
 *   - an exit that starts no new query (`this.debouncedQuery(` or
 *     `this.debouncedLocalQuery(` not on its path) must clear the shimmer on
 *     its path, by `this.shimmer = false` or `this.closeDropdown()`;
 *     before the fix, Escape or "@" alone after a slow query left a shimmer
 *     row with nothing outstanding;
 *   - an exit that starts a new query must NOT clear it on its path, so the
 *     row stays up across keystrokes until that query finishes as current
 *     (clearing there makes the loading row blink on every keystroke).
 *
 * Derived from the tree: the members and their exits (each `return` and the
 * member's end) are read from address-bar.tsx; an exit's path is the text of
 * its own block and of each enclosing block up to it, sibling blocks
 * excluded. No member or exit list is kept here. The run ends
 * `verify-address-bar-shimmer: PASS` or one FAIL line per drifted exit naming
 * the member and its line. No invalidating member, or no member that sets
 * the shimmer, is a broken instrument, never a pass.
 *
 * --self-test: the clean source must be green; then each planted fault must
 * go red naming its member: closeDropdown without its clear, textEdited's
 * composition exit and alias exit without theirs, and textEdited clearing
 * before its query starts (the blinking row). A source with no shimmer set is
 * a broken instrument.
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
const CLEARS = /this\.shimmer\s*=\s*false\b|this\.closeDropdown\(\)/;
const STARTS = /this\.debounced(?:Local)?Query\(/;
const SETS = /this\.shimmer\s*=\s*true\b/;
const MEMBER_HEAD = /^ {4}(?:(?:protected|public|private|static|readonly|async)\s+)*([A-Za-z_$][\w$]*)\s*[(<=:]/;

/** Comments blanked with their line breaks kept, so a line number stays the file's. */
const blankComments = src => src
    .replace(/\/\*[\s\S]*?\*\//g, c => c.replace(/[^\n]/g, ''))
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

/** The class members as { name, line, code }: each runs from its declaration line at member indent to the next one. */
function members(src) {
    const out = [];
    blankComments(src).split('\n').forEach((text, index) => {
        const m = MEMBER_HEAD.exec(text);
        if (m) {
            out.push({ name: m[1], line: index + 1, code: text });
        } else if (out.length) {
            out[out.length - 1].code += '\n' + text;
        }
    });
    return out;
}

/** The index of the member body's opening brace: the first `{` after the parameter list closes. */
function bodyStart(code) {
    let depth = 0;
    let opened = false;
    for (let i = 0; i < code.length; i++) {
        if (code[i] === '(') {
            depth++;
            opened = true;
        } else if (code[i] === ')') {
            depth--;
        } else if (code[i] === '{' && opened && depth === 0) {
            return i;
        }
    }
    return -1;
}

/**
 * The exits of a member body: each `return` and the body's end, with the path
 * text leading to it (its own block's and each enclosing block's text so far,
 * blocks nested before it excluded) and its line offset in `code`.
 */
function exits(code) {
    const start = bodyStart(code);
    if (start < 0) {
        return [];
    }
    const frames = [{ own: '' }];
    const out = [];
    let quote = null;
    for (let i = start + 1; i < code.length; i++) {
        const ch = code[i];
        const frame = frames[frames.length - 1];
        if (quote) {
            frame.own += ch;
            if (ch === '\\') {
                frame.own += code[++i] ?? '';
            } else if (ch === quote) {
                quote = null;
            }
            continue;
        }
        if (ch === '\'' || ch === '"' || ch === '`') {
            quote = ch;
            frame.own += ch;
        } else if (ch === '{') {
            frames.push({ own: '' });
        } else if (ch === '}') {
            if (frames.length === 1) {
                out.push({ path: frames.map(f => f.own).join('\n'), at: i, kind: 'end' });
                return out;
            }
            frames.pop();
        } else {
            frame.own += ch;
            if (frame.own.endsWith('return') && !/[\w$]/.test(frame.own[frame.own.length - 7] ?? '') && !/[\w$]/.test(code[i + 1] ?? '')) {
                const end = code.indexOf(';', i);
                const statement = code.slice(i + 1, end < 0 ? i + 1 : end + 1);
                out.push({ path: frames.map(f => f.own).join('\n') + statement, at: i, kind: 'return' });
            }
        }
    }
    return out;
}

/** The result over `src`: a broken-instrument string, the drifted exits, or the members checked. */
function check(src) {
    const all = members(src);
    if (!all.some(member => SETS.test(member.code))) {
        return { broken: `no member of ${ADDRESS_BAR_REL} sets this.shimmer = true -- broken instrument` };
    }
    const invalidating = all.filter(member => INVALIDATES.test(member.code));
    if (!invalidating.length) {
        return { broken: `no member of ${ADDRESS_BAR_REL} contains this.querySeq += 1 -- broken instrument` };
    }
    const drift = [];
    const checked = [];
    for (const member of invalidating) {
        const found = exits(member.code);
        if (!found.length) {
            return { broken: `${member.name} has no readable body in ${ADDRESS_BAR_REL} -- broken instrument` };
        }
        for (const exit of found) {
            const line = member.line + (member.code.slice(0, exit.at).match(/\n/g) ?? []).length;
            const where = `${member.name} (${exit.kind} at ${ADDRESS_BAR_REL}:${line})`;
            const starts = STARTS.test(exit.path);
            const clears = CLEARS.test(exit.path);
            if (starts && clears) {
                drift.push({ member: member.name, why: `${where} clears the shimmer before it starts a query: the loading row blinks on every keystroke` });
            } else if (!starts && !clears) {
                drift.push({ member: member.name, why: `${where} invalidates the query in flight and starts none, but leaves this.shimmer as it was` });
            } else {
                checked.push(`${member.name}:${line}:${starts ? 'keeps' : 'clears'}`);
            }
        }
    }
    return drift.length ? { drift } : { ok: invalidating.map(member => member.name), checked };
}

function report(result) {
    if (result.broken) {
        console.log(`${NAME}: FAIL -- ${result.broken}`);
        return 1;
    }
    if (result.drift) {
        for (const d of result.drift) {
            console.log(`${NAME}: FAIL -- ${d.why}`);
        }
        return 1;
    }
    for (const exit of result.checked) {
        console.log(`  ok  ${exit}`);
    }
    console.log(`${NAME}: PASS -- ${result.checked.length} exits of ${result.ok.join(', ')}: each that starts no query clears the shimmer, each that starts one keeps it`);
    return 0;
}

const read = () => readFileSync(join(REPO_ROOT, ADDRESS_BAR_REL), 'utf8');

/** One planted fault: `from` replaced by `to` once in the source, then red naming `member`. */
const PLANTS = [
    { name: 'closeDropdown without its clear', member: 'closeDropdown', from: /\n\s*this\.shimmer = false;(?=\n\s*this\.highlightKey = undefined;\n\s*this\.homeFailed = false;)/ },
    { name: 'the composition exit without its clear', member: 'textEdited', from: /(if \(this\.compositionOpen\) \{)\n\s*this\.shimmer = false;/, to: '$1' },
    { name: 'the alias exit without its clear', member: 'textEdited', from: /(this\.dropdownArmed = false;)\n\s*this\.shimmer = false;(?=\n\s*this\.rows = aliasRows;)/, to: '$1' },
    { name: 'textEdited clears before its query starts (the blinking row)', member: 'textEdited', from: /(this\.querySeq \+= 1;)(\n\s*this\.inputValue = value;)/, to: '$1\n        this.shimmer = false;$2' },
];

function selfTest() {
    const src = read();
    const clean = check(src);
    if (!clean.ok) {
        console.log(`${NAME} --self-test: FAIL -- the clean source is not green: ${JSON.stringify(clean)}`);
        return 1;
    }
    console.log(`  ok  clean source -> green (${clean.checked.length} exits of ${clean.ok.join(', ')})`);
    let failed = 0;
    for (const plant of PLANTS) {
        const planted = src.replace(plant.from, plant.to ?? '');
        if (planted === src) {
            console.log(`  FAIL  plant "${plant.name}" did not apply`);
            failed++;
            continue;
        }
        const got = check(planted);
        const named = got.drift?.filter(d => d.member === plant.member).map(d => d.why) ?? [];
        if (named.length) {
            console.log(`  ok  ${plant.name} -> red: ${named.join('; ')}`);
        } else {
            console.log(`  FAIL  ${plant.name} did not go red naming ${plant.member}: ${JSON.stringify(got)}`);
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
    console.log(`${NAME} --self-test: PASS -- the clean source is green and ${PLANTS.length + 1} planted faults went red: ${PLANTS.map(p => p.name).join(', ')}, no shimmer set`);
    return 0;
}

process.exit(process.argv.includes('--self-test') ? selfTest() : report(check(read())));
