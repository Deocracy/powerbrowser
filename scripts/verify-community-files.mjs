#!/usr/bin/env node
// scripts/verify-community-files.mjs
//
// community-files (Phase 42, GH-14): the persistent gate for the community surface.
//
// 1. The community file set is DERIVED from the tree at check time: SECURITY.md,
//    CONTRIBUTING.md and CODE_OF_CONDUCT.md at the root when present, and every
//    file in .github/ISSUE_TEMPLATE/ and org-github/.
// 2. The derived set is compared as a set with the COMMITTED list below, and two
//    faults go red: a REQUIRED file missing from the derived set (deleted or moved),
//    and a derived file the committed list does not name (added without review).
//    Why the list is committed: a glob cannot see a file that was deleted, so the
//    set that must exist is written here, where a removal shows up as a diff. The
//    derived set supplies the additions.
// 3. Every derived file is visitor text. It is scanned for internal identifiers
//    with the two shapes verify-shell-error-copy.mjs applies (ALL_CAPS_TOKEN and
//    DOTTED_KEY). That file does not export them, so the same two patterns are
//    repeated here, and a change to one should be made to both.
//
// OPTIONAL names files that may or may not exist. CONTRIBUTING.md at the root is
// optional by design. The root CODE_OF_CONDUCT.md is published at the 42-04 owner
// checkpoint, after Phase 47 mail routing delivers a test message and the 41-04
// apply (WR-05), so its absence today is not a fault. Once it exists it is checked
// like the rest.
//
// Usage:
//   node scripts/verify-community-files.mjs
//   node scripts/verify-community-files.mjs --self-test
//
// Reads files only and writes nothing. The --self-test plants each fault in memory
// (a deleted file, a planted identifier, an added file) and requires each to go red
// naming the file.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'community-files';
const SELF_REL = 'scripts/verify-community-files.mjs';

// The committed list. A file here must exist; a derived file not here is a fault.
const REQUIRED = Object.freeze([
    'SECURITY.md',
    '.github/ISSUE_TEMPLATE/bug.yml',
    '.github/ISSUE_TEMPLATE/feature.yml',
    '.github/ISSUE_TEMPLATE/config.yml',
    'org-github/SECURITY.md',
    'org-github/CONTRIBUTING.md',
    'org-github/CODE_OF_CONDUCT.md',
]);
const OPTIONAL = Object.freeze(['CONTRIBUTING.md', 'CODE_OF_CONDUCT.md']);
const ROOT_FILES = Object.freeze(['SECURITY.md', 'CONTRIBUTING.md', 'CODE_OF_CONDUCT.md']);
const DIRS = Object.freeze(['.github/ISSUE_TEMPLATE', 'org-github']);

// An ALL-CAPS underscored token, and a dotted key of three or more segments. The
// same shapes as verify-shell-error-copy.mjs.
const ALL_CAPS_TOKEN = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g;
const DOTTED_KEY = /\b[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*){2,}\b/g;

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const show = (v) => JSON.stringify(v ?? null);

// The tree this row reads: the real files, with overrides for the self-test.
// overrides.hidden lists paths the tree omits; overrides.extra maps a path to the
// text that replaces or adds that file.
function tree(root, overrides = {}) {
    const hidden = overrides.hidden ?? [];
    const extra = overrides.extra ?? {};
    const isHidden = (rel) => hidden.includes(rel);
    const onDisk = (dir) => {
        try {
            return readdirSync(join(root, dir), { withFileTypes: true }).filter(d => d.isFile()).map(d => d.name);
        } catch {
            return []; // an absent directory lists as empty; the required-file check reports it
        }
    };
    return {
        exists(rel) {
            return !isHidden(rel) && (Object.hasOwn(extra, rel) || existsSync(join(root, rel)));
        },
        list(dir) {
            const prefix = `${dir}/`;
            const added = Object.keys(extra).filter(p => p.startsWith(prefix) && !p.slice(prefix.length).includes('/')).map(p => p.slice(prefix.length));
            return [...new Set([...onDisk(dir), ...added])].filter(n => !isHidden(`${dir}/${n}`)).sort(cmp);
        },
        read(rel) {
            return Object.hasOwn(extra, rel) ? extra[rel] : readFileSync(join(root, rel), 'utf8');
        },
    };
}

function derive(t) {
    const files = ROOT_FILES.filter(f => t.exists(f));
    for (const d of DIRS) for (const f of t.list(d)) files.push(`${d}/${f}`);
    return [...new Set(files)].sort(cmp);
}

export function runChecks(root, overrides = {}) {
    const t = tree(root, overrides);
    const derived = derive(t);
    const found = [];
    const fail = (file, text) => found.push({ file, text });
    const allowed = new Set([...REQUIRED, ...OPTIONAL]);

    for (const f of REQUIRED) {
        if (!derived.includes(f)) {
            fail(f, `${f} is missing. The committed list in ${SELF_REL} requires it. Next step: restore it from git, or change the list in a reviewed commit.`);
        }
    }
    for (const f of derived) {
        if (!allowed.has(f)) {
            fail(f, `${f} is not in the committed list in ${SELF_REL}. Next step: add it to the list in a reviewed commit, after its text is checked.`);
        }
    }
    for (const f of derived) {
        let text;
        try {
            text = t.read(f);
        } catch (e) {
            fail(f, `${f} could not be read (${String(e?.message ?? e).split('\n')[0]}). Next step: fix the file.`);
            continue;
        }
        const tokens = new Set([...(text.match(ALL_CAPS_TOKEN) ?? []), ...(text.match(DOTTED_KEY) ?? [])]);
        for (const tok of [...tokens].sort(cmp)) {
            fail(f, `${f}: ${show(tok)} is an internal identifier in visitor text. Next step: reword it in plain PowerBrowser language, or take it out of the visitor file.`);
        }
    }

    found.sort((a, b) => cmp(a.file, b.file) || cmp(a.text, b.text));
    return { failures: found.map(f => f.text), derived };
}

function main() {
    const { failures, derived } = runChecks(REPO_ROOT);
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} problem(s) in the community files`);
        failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- ${derived.length} community file(s) match the committed list and carry no internal identifier`);
    return 0;
}

// --- self-test --------------------------------------------------------------

const readTree = (rel) => readFileSync(join(REPO_ROOT, rel), 'utf8');

function selfTest() {
    const base = runChecks(REPO_ROOT);
    if (base.failures.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- the tree is not green, so the planted-fault results below would mean nothing:`);
        base.failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log(`  ok  baseline: the community files match the committed list -> green (${base.derived.length} file(s))`);

    const plants = [
        ['a required file deleted', { hidden: ['SECURITY.md'] }, ['SECURITY.md', 'missing']],
        ['an internal identifier planted in a visitor file', { extra: { 'SECURITY.md': `${readTree('SECURITY.md')}\nPlanted: POWERBROWSER_BACKEND_READY.\n` } }, ['SECURITY.md', 'POWERBROWSER_BACKEND_READY']],
        ['a file added outside the committed list', { extra: { 'org-github/PLANTED.md': 'Planted text.\n' } }, ['org-github/PLANTED.md', 'not in the committed list']],
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

    if (failed > 0) return 1;
    console.log(`${NAME}: --self-test PASS -- ${plants.length} planted faults went red naming the file, and the community files stayed green`);
    return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const args = process.argv.slice(2);
    for (const a of args) {
        if (a !== '--self-test') {
            console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
            console.error(`  Next step: run: node ${SELF_REL}, or add --self-test to prove the check discriminates.`);
            process.exit(2);
        }
    }
    process.exit(args.includes('--self-test') ? selfTest() : main());
}
