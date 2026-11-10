#!/usr/bin/env node
// scripts/verify-build-orca-portable.mjs
//
// The build-orca-portable gate (Phase 68, PLAT-01, P68-30, P68-31): scripts/build-orca.sh runs unchanged
// on every target's own runner -- legion's nix develop .#orca, and the hosted macos-15, macos-15-intel and
// windows-latest Orca jobs, whose bash is not GNU findutils' and which carry no objdump. It reads the
// script's text and is red, naming file and line, on:
//   - an objdump requirement outside a branch conditioned on process.platform being linux (Orca uses
//     objdump only in linuxSlotRecord). The platform variable is derived from the script: the one
//     assigned from node -p 'process.platform'.
//   - any find ... -printf (GNU only; BSD find on macOS has no -printf).
//   - a sourced file other than "$REPO_ROOT/generated/upstream-pins.env", or no sourced pins fragment:
//     the hosted jobs write that path with the generator's emitUpstreamPins before running the script.
// Comment lines are ignored, so a comment that names objdump or -printf is never a failure.
//
// Tier: quick (reads one tracked file). --self-test checks the real text green first, then plants each
// fault on an in-memory copy and requires red naming the file and the fault; it writes nothing.
//
// Usage:
//   node scripts/verify-build-orca-portable.mjs
//   node scripts/verify-build-orca-portable.mjs --self-test

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'build-orca-portable';
const SCRIPT_REL = 'scripts/build-orca.sh';
const PINS = '"$REPO_ROOT/generated/upstream-pins.env"';

export function check(text) {
    const fails = [];
    const lines = text.split('\n');
    const at = (i, msg) => fails.push(`${SCRIPT_REL}:${i + 1}: ${msg}`);
    const code = (l) => !/^\s*#/.test(l);
    const platformVar = lines.map((l) => /^\s*(\w+)="\$\(node -p ['"]process\.platform['"]/.exec(l)?.[1]).find(Boolean);
    const linuxTest = platformVar ? new RegExp(`"\\$\\{?${platformVar}\\}?"\\s*==?\\s*"?linux"?`) : null;

    // Open if-blocks as [headLine, inElseBranch]; an objdump line counts as conditioned when the innermost
    // open block's head is the linux test and the line is not in its else/elif branch.
    const stack = [];
    let sources = 0;
    lines.forEach((l, i) => {
        if (!code(l)) return;
        if (/^\s*if\b/.test(l) && !/\bfi\s*$/.test(l)) stack.push([l, false]);
        else if (/^\s*(else|elif)\b/.test(l) && stack.length) stack[stack.length - 1][1] = true;
        else if (/^\s*fi\b/.test(l)) stack.pop();
        if (/\bobjdump\b/.test(l)) {
            const top = stack[stack.length - 1];
            const sameLine = linuxTest && linuxTest.test(l.slice(0, l.indexOf('objdump')));
            const inBlock = top && !top[1] && linuxTest && linuxTest.test(top[0]);
            if (!sameLine && !inBlock) {
                at(i, `objdump is required outside a branch on ${platformVar ? `"$${platformVar}" = "linux"` : 'process.platform (no variable is assigned from node -p process.platform)'}, so the hosted macOS and Windows Orca jobs stop at the shell entry. Next step: require objdump only when node -p process.platform prints linux.`);
            }
        }
        if (/\bfind\b[^\n]*-printf\b/.test(l)) {
            at(i, 'find -printf is GNU-only; BSD find on the hosted macOS runners refuses it. Next step: use find . -type f | sed \'s|^\\./||\'.');
        }
        const src = /^\s*(?:\.|source)\s+(\S+)/.exec(l);
        if (src) {
            if (src[1] === PINS) sources++;
            else at(i, `sources ${src[1]}, not ${PINS}, the path the hosted jobs write with emitUpstreamPins. Next step: source ${PINS}.`);
        }
    });
    if (sources === 0) fails.push(`${SCRIPT_REL}: sources no ${PINS}, so the pin it reports is not the one fetch-orca.sh verified. Next step: source it.`);
    return fails;
}

function selfTest() {
    const real = readFileSync(join(REPO_ROOT, SCRIPT_REL), 'utf8');
    const base = check(real);
    if (base.length) {
        console.error(`${NAME} self-test: FAIL -- the real ${SCRIPT_REL} is already red, so the plants below would prove nothing:`);
        for (const f of base) console.error(`  ${f}`);
        return 1;
    }
    console.log(`  ok baseline ${SCRIPT_REL} -> green`);
    const edit = (from, to) => (real.includes(from) ? real.replace(from, to) : null);
    const plants = [
        ['objdump required on every platform', edit('# 2. Shell entry.', '# 2. Shell entry.\ncommand -v objdump >/dev/null || fail "need objdump"'), 'objdump is required outside'],
        ['objdump branch tests darwin', real.replace(/(= ")linux(" \])/, '$1darwin$2'), 'objdump is required outside'],
        ['find -printf', edit("find . -type f | sed 's|^\\./||'", "find . -type f -printf '%P\\n'"), 'find -printf is GNU-only'],
        ['pins fragment at another path', edit(PINS, '"$REPO_ROOT/upstream-pins.env"'), 'sources "$REPO_ROOT/upstream-pins.env"'],
    ];
    let failed = 0;
    for (const [name, text, naming] of plants) {
        if (text === null || text === real) { console.error(`${NAME} self-test: FAIL -- '${name}' planted nothing (its anchor is absent from ${SCRIPT_REL})`); failed++; continue; }
        const fails = check(text);
        const hit = fails.find((f) => f.startsWith(`${SCRIPT_REL}:`) && f.includes(naming));
        if (hit) console.log(`  ok ${name} -> red: ${hit.split(', so')[0]}`);
        else { console.error(`${NAME} self-test: FAIL -- '${name}' did not go red naming '${naming}'; got: ${fails.join(' | ') || '(green)'}`); failed++; }
    }
    if (failed) return 1;
    console.log(`${NAME} self-test: PASS -- the real script is green and ${plants.length} planted faults each went red naming ${SCRIPT_REL} and the line`);
    return 0;
}

const args = process.argv.slice(2);
if (args.some((a) => a !== '--self-test')) {
    console.error(`${NAME}: unknown argument '${args.find((a) => a !== '--self-test')}' (usage: node scripts/verify-build-orca-portable.mjs [--self-test])`);
    console.error('  Next step: run node scripts/verify-build-orca-portable.mjs --self-test');
    process.exit(2);
}
if (args.includes('--self-test')) process.exit(selfTest());
const fails = check(readFileSync(join(REPO_ROOT, SCRIPT_REL), 'utf8'));
if (fails.length) {
    console.error(`${NAME}: FAIL -- ${fails.length} problem(s):`);
    for (const f of fails) console.error(`  ${f}`);
    process.exit(1);
}
console.log(`${NAME}: PASS -- ${SCRIPT_REL} requires objdump only on Linux, uses no find -printf and sources ${PINS}`);
