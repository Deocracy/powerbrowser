#!/usr/bin/env node
// scripts/verify-no-build-date-pin.mjs
//
// The build-date pin gate (Phase 44, UPD-26, threat T-44-13). Gecko takes the BuildID from
// MOZ_BUILD_DATE when it is set and from the build time otherwise. A pinned value (a constant, or
// one derived from the ESR tag) freezes the BuildID, so two builds of one appVersion share it and
// descriptor-monotonic refuses every later descriptor while the build looks reproducible.
// SOURCE_DATE_EPOCH is the second route to a frozen build date. Reproducibility belongs to the
// Phase 45 container build, never to a date pin.
//
//  1. Scanned set, derived at check time: every tracked file (git ls-files) outside .planning/
//     (planning prose discusses the rule) and except this script, plus every file under the
//     git-ignored generated/ tree when it exists on disk.
//  2. Any line naming either variable is a FAIL naming the file, the line and the variable.
//  3. Coverage floor. Each REQUIRED surface (the emitter, the descriptor CLI, .mozconfig, the tree
//     inputs, the workflows, the patch stack, brand/ and the shell scripts) must contribute at least
//     one scanned file. A missing surface is a FAIL: an assert over a path that is not there is
//     vacuous. generated/ is the one exception: it is git-ignored, so a fresh clone has none, and
//     it is a pure function of the scanned emitter and inputs; its absence prints a named note
//     (the generate-check precedent), never a silent pass.
//
// Honest tier: quick. Text reads over the tree, no build, network or write. --self-test applies
// every plant in memory through runChecks' overrides.
//
// Usage:
//   node scripts/verify-no-build-date-pin.mjs
//   node scripts/verify-no-build-date-pin.mjs --self-test

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'no-build-date-pin';
const SELF_REL = 'scripts/verify-no-build-date-pin.mjs';
const GENERATED = 'generated/';
const EXCLUDED_PREFIX = '.planning/';
// Exported so verify-toolchain-container.mjs refuses the same pin without spelling the token.
export const PIN_VARIABLES = Object.freeze(['MOZ_BUILD_DATE', 'SOURCE_DATE_EPOCH']);
export const PIN = new RegExp(`\\b(${PIN_VARIABLES.join('|')})\\b`);
const NEXT_PIN = 'Next step: remove the pin and let the BuildID come from the build time; if the value is derived per build, never from the tag or a constant, record why in this row before narrowing it.';

/** The surfaces the assert must cover, each with the test that places a path on it. */
export const REQUIRED = Object.freeze([
    ['scripts/generate.mjs', p => p === 'scripts/generate.mjs'],
    ['scripts/build-update-xml.mjs', p => p === 'scripts/build-update-xml.mjs'],
    ['.mozconfig', p => p === '.mozconfig'],
    ['configuration.toml', p => p === 'configuration.toml'],
    ['powerbrowser/', p => p.startsWith('powerbrowser/')],
    ['.github/', p => p.startsWith('.github/')],
    ['patches/', p => p.startsWith('patches/')],
    ['brand/', p => p.startsWith('brand/')],
    ['scripts/*.sh', p => /^scripts\/[^/]+\.sh$/.test(p)],
    [GENERATED, p => p.startsWith(GENERATED)],
]);

const DIRECT_RUN = (() => {
    try {
        return process.argv[1] !== undefined
            && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
    } catch {
        return false;
    }
})();
const args = DIRECT_RUN ? process.argv.slice(2) : [];
for (const a of args) {
    if (a !== '--self-test') {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
        console.error(`  Next step: run: node ${SELF_REL}, or add --self-test to prove the assert discriminates.`);
        process.exit(2);
    }
}

function trackedFiles(root) {
    return execFileSync('git', ['-C', root, 'ls-files', '-z'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
        .split('\0').filter(Boolean);
}

/** Every file under generated/ on disk, or null when the tree was never generated. */
function generatedFiles(root) {
    const base = join(root, GENERATED);
    if (!existsSync(base)) return null;
    const out = [];
    const walk = rel => {
        for (const e of readdirSync(join(root, rel), { withFileTypes: true })) {
            const child = `${rel}${e.name}`;
            if (statSync(join(root, child)).isDirectory()) walk(`${child}/`);
            else out.push(child);
        }
    };
    walk(GENERATED);
    return out.sort();
}

function diskRead(root) {
    return rel => {
        try {
            return readFileSync(join(root, rel), 'utf8');
        } catch {
            return null;
        }
    };
}

/**
 * Returns { failures, notes, scanned }. overrides.tracked and overrides.generated replace the two
 * file lists (generated null means absent); overrides.read replaces the file reader.
 */
export function runChecks(root, overrides = {}) {
    const failures = [];
    const notes = [];
    const tracked = (overrides.tracked ?? trackedFiles(root))
        .filter(p => !p.startsWith(EXCLUDED_PREFIX) && p !== SELF_REL && !p.startsWith(GENERATED));
    const generated = 'generated' in overrides ? overrides.generated : generatedFiles(root);
    const read = overrides.read ?? diskRead(root);
    const scanned = [...tracked, ...(generated ?? [])];

    for (const [label, on] of REQUIRED) {
        if (scanned.some(on)) continue;
        if (label === GENERATED && generated === null) {
            notes.push(`${GENERATED} absent (never generated): its emitter and inputs are scanned instead`);
            continue;
        }
        failures.push(`${label} has no file in the scanned set, so the assert over it is vacuous. Next step: restore ${label}, or update REQUIRED in ${SELF_REL} if the surface moved.`);
    }

    for (const rel of scanned) {
        const text = read(rel);
        if (text === null) {
            // A tracked path that is a directory (a submodule) or unreadable cannot be shown clean.
            if (!overrides.read && existsSync(join(root, rel)) && statSync(join(root, rel)).isDirectory()) continue;
            failures.push(`${rel} could not be read, so it cannot be shown free of a build-date pin. Next step: restore the file, or git rm it if it was deleted.`);
            continue;
        }
        text.split('\n').forEach((line, i) => {
            const m = PIN.exec(line);
            if (m) failures.push(`${rel}:${i + 1} names ${m[1]}, a build-date pin that freezes the BuildID. ${NEXT_PIN}`);
        });
    }
    return { failures, notes, scanned };
}

function main() {
    const { failures, notes, scanned } = runChecks(REPO_ROOT);
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} problem(s).`);
        failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    const tail = notes.length > 0 ? `; ${notes.join('; ')}` : '';
    console.log(`${NAME}: PASS -- ${scanned.length} file(s) across ${REQUIRED.length} required surfaces name no build-date pin${tail}`);
    return 0;
}

// --- self-test ---------------------------------------------------------------

function selfTest() {
    const clean = 'line one\nline two\n';
    const baseFiles = () => ({
        'scripts/generate.mjs': clean,
        'scripts/build-update-xml.mjs': clean,
        '.mozconfig': clean,
        'configuration.toml': clean,
        'powerbrowser/shell/a.sys.mjs': clean,
        '.github/workflows/release.yml': clean,
        'patches/010-x.patch': clean,
        'brand/mark.svg': clean,
        'scripts/fetch-upstream.sh': clean,
        '.planning/notes.md': 'never pin MOZ_BUILD_DATE\n',
        [SELF_REL]: 'const PIN = /MOZ_BUILD_DATE/;\n',
    });
    const baseGenerated = () => ({ 'generated/identity.configure': clean });
    const run = (files, gen) => runChecks(REPO_ROOT, {
        tracked: Object.keys(files),
        generated: gen === null ? null : Object.keys(gen),
        read: rel => (rel in files ? files[rel] : gen && rel in gen ? gen[rel] : null),
    });

    const control = run(baseFiles(), baseGenerated());
    if (control.failures.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- the green control went red: ${control.failures.join(' | ')}`);
        return 1;
    }
    console.log('  ok  control: every surface present, the token only in .planning/ and this script -> green');
    const absent = run(baseFiles(), null);
    if (absent.failures.length > 0 || !absent.notes.some(n => n.includes(GENERATED))) {
        console.error(`${NAME}: --self-test FAIL -- an absent ${GENERATED} did not stay green with a named note: ${absent.failures.join(' | ') || absent.notes.join(' | ') || '(no note)'}`);
        return 1;
    }
    console.log(`  ok  control: ${GENERATED} absent -> green with a named note`);

    const withFile = (rel, text) => ({ ...baseFiles(), [rel]: text });
    const without = prefix => Object.fromEntries(Object.entries(baseFiles()).filter(([k]) => !k.startsWith(prefix)));
    const plants = [
        ['.mozconfig pins the build date', withFile('.mozconfig', 'x\nexport MOZ_BUILD_DATE=20261020000000\n'), baseGenerated(), ['.mozconfig:2', 'MOZ_BUILD_DATE']],
        ['a workflow sets the source epoch', withFile('.github/workflows/release.yml', 'env:\n  SOURCE_DATE_EPOCH: 1700000000\n'), baseGenerated(), ['.github/workflows/release.yml:2', 'SOURCE_DATE_EPOCH']],
        ['a patch adds the pin', withFile('patches/010-x.patch', '+MOZ_BUILD_DATE = "20260101000000"\n'), baseGenerated(), ['patches/010-x.patch:1', 'MOZ_BUILD_DATE']],
        ['a shell script exports the pin', withFile('scripts/fetch-upstream.sh', 'export SOURCE_DATE_EPOCH=0\n'), baseGenerated(), ['scripts/fetch-upstream.sh:1', 'SOURCE_DATE_EPOCH']],
        ['generated/ carries the pin', baseFiles(), { 'generated/identity.configure': 'MOZ_BUILD_DATE=1\n' }, ['generated/identity.configure:1', 'MOZ_BUILD_DATE']],
        ['the patch stack is missing', without('patches/'), baseGenerated(), ['patches/', 'vacuous']],
        ['.mozconfig is missing', without('.mozconfig'), baseGenerated(), ['.mozconfig', 'vacuous']],
        ['generated/ exists but is empty', baseFiles(), {}, [GENERATED, 'vacuous']],
        ['a tracked file is unreadable', { ...baseFiles(), 'powerbrowser/gone.js': null }, baseGenerated(), ['powerbrowser/gone.js', 'could not be read']],
    ];
    let failed = 0;
    for (const [name, files, gen, needles] of plants) {
        const { failures } = run(files, gen);
        if (failures.some(f => needles.every(n => f.includes(n)))) {
            console.log(`  ok  ${name} -> red, naming ${needles.map(n => `'${n}'`).join(', ')}`);
        } else {
            console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red naming ${needles.join(', ')}; got: ${failures.join(' | ') || '(no failures at all)'}`);
            failed += 1;
        }
    }
    if (failed > 0) return 1;
    console.log(`${NAME}: --self-test PASS -- controls green first; ${plants.length} planted faults went red naming the file and line or the missing surface`);
    return 0;
}

if (DIRECT_RUN) process.exit(args.includes('--self-test') ? selfTest() : main());
