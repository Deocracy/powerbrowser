#!/usr/bin/env node
// scripts/verify-licence-allowlist.mjs
//
// The licence-allowlist gate (Phase 60, OVL-04, P60-R1): every third-party tree
// PowerBrowser builds from has a row in inventory/licence-allowlist.json, each
// row's licence is an allowed SPDX id, and each fetched tree's licence file is
// the one the row pinned.
//
// Derived at check time, never hand-kept:
//  a. the set of fetched trees: the <name> of every tracked scripts/fetch-<name>.sh
//     (git ls-files). Compared with the rows' path set both ways, so a new fetch
//     script without a row and a row without a fetch script are both red. Each
//     row's fetch_script must be exactly scripts/fetch-<path>.sh and must exist.
//  b. the sha256 of <path>/<licence_file> for every tree directory present,
//     compared with the row's licence_file_sha256.
// Red on: a missing required key, a digest that is not 64 hex, an allowed_spdx
// entry that is empty, NONE, UNLICENSED or starts SEE LICENSE, a row spdx not in
// allowed_spdx (or itself one of those refused forms), a digest mismatch, or a
// missing licence file inside a present tree.
// An absent tree prints one SKIP line for that row only; the other rows are
// still checked. Runtime-installed proprietary extensions are not rows (see the
// inventory's $comment): PowerBrowser never redistributes them.
//
// Tier: quick (git ls-files, two small file reads). The self-test runs check()
// over mkdtemp fixtures, never the real inventory.
//
// Usage:
//   node scripts/verify-licence-allowlist.mjs
//   node scripts/verify-licence-allowlist.mjs --self-test

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'licence-allowlist';
const INVENTORY_REL = 'inventory/licence-allowlist.json';
const REQUIRED = ['path', 'source', 'fetch_script', 'spdx', 'licence_file', 'licence_file_sha256', 'reason'];
const FETCH_RE = /^scripts\/fetch-([^/]+)\.sh$/;

function refusedSpdx(id) {
    const s = String(id ?? '').trim();
    return s === '' || /^(NONE|UNLICENSED)$/i.test(s) || /^SEE LICENSE/i.test(s);
}

const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

/**
 * Pure over its inputs so the self-test can plant faults in fixtures.
 * Returns { fails[], skips[], checked[], trees[] }.
 */
export function check(repoRoot, allowList, lsFiles) {
    const fails = [];
    const skips = [];
    const checked = [];
    const allowed = Array.isArray(allowList?.allowed_spdx) ? allowList.allowed_spdx : null;
    const rows = Array.isArray(allowList?.trees) ? allowList.trees : null;
    if (!allowed || allowed.length === 0) fails.push(`${INVENTORY_REL}: allowed_spdx is missing or empty`);
    if (!rows || rows.length === 0) fails.push(`${INVENTORY_REL}: trees is missing or empty -- an empty allow-list is not a clean one`);
    for (const id of allowed ?? []) {
        if (refusedSpdx(id)) fails.push(`allowed_spdx contains ${JSON.stringify(id)}, which is not a licence (empty, NONE, UNLICENSED or SEE LICENSE ...)`);
    }

    const derived = new Map();
    for (const f of lsFiles) {
        const m = FETCH_RE.exec(f);
        if (m) derived.set(m[1], f);
    }
    if (derived.size === 0) fails.push('no tracked scripts/fetch-*.sh found -- the derived tree set is empty, so a green result would prove nothing');

    const rowPaths = new Set();
    for (const [i, row] of (rows ?? []).entries()) {
        const label = row?.path ? `tree "${row.path}"` : `trees[${i}]`;
        const missing = REQUIRED.filter((k) => typeof row?.[k] !== 'string' || row[k].trim() === '');
        if (missing.length) { fails.push(`${label}: missing required key(s) ${missing.join(', ')}`); continue; }
        if (rowPaths.has(row.path)) fails.push(`${label}: duplicate row`);
        rowPaths.add(row.path);
        if (!/^[0-9a-f]{64}$/.test(row.licence_file_sha256)) fails.push(`${label}: licence_file_sha256 is not 64 lowercase hex`);
        if (refusedSpdx(row.spdx)) fails.push(`${label}: spdx ${JSON.stringify(row.spdx)} is not a licence (empty, NONE, UNLICENSED or SEE LICENSE ...)`);
        else if (allowed && !allowed.includes(row.spdx)) fails.push(`${label}: spdx ${JSON.stringify(row.spdx)} is not in allowed_spdx [${allowed.join(', ')}]`);

        const expectScript = `scripts/fetch-${row.path}.sh`;
        if (row.fetch_script !== expectScript) fails.push(`${label}: fetch_script is ${row.fetch_script}, expected ${expectScript}`);
        if (!derived.has(row.path) || !existsSync(join(repoRoot, row.fetch_script))) {
            fails.push(`${label}: its fetch script ${row.fetch_script} does not exist or is not tracked -- a row for a tree nothing fetches`);
            continue;
        }

        const treeDir = join(repoRoot, row.path);
        let isDir = false;
        try { isDir = statSync(treeDir).isDirectory(); } catch { /* absent */ }
        if (!isDir) {
            skips.push(`${NAME}: SKIP -- ${row.path}/ absent; its LICENSE digest is unchecked (run ${row.fetch_script})`);
            continue;
        }
        const licence = join(treeDir, row.licence_file);
        if (!existsSync(licence)) { fails.push(`${label}: ${row.path}/${row.licence_file} is missing from a present tree`); continue; }
        const got = sha256(licence);
        if (got !== row.licence_file_sha256) {
            fails.push(`${label}: ${row.path}/${row.licence_file} sha256 ${got} differs from the row's ${row.licence_file_sha256} -- the licence text changed; re-read it and update the row`);
        } else {
            checked.push(row.path);
        }
    }

    for (const [name, script] of derived) {
        if (!rowPaths.has(name)) fails.push(`tree "${name}" is fetched by ${script} but has no row in ${INVENTORY_REL}`);
    }
    return { fails, skips, checked, trees: [...derived.keys()].sort(), allowed: allowed ?? [] };
}

function render(r) {
    const lines = [...r.skips];
    if (r.fails.length) {
        for (const f of r.fails) lines.push(`${NAME}: FAIL -- ${f}`);
        lines.push(`${NAME}: FAIL -- ${r.fails.length} problem(s). Next step: fix the row in ${INVENTORY_REL} or the tree it names.`);
        return { code: 1, lines };
    }
    lines.push(`${NAME}: PASS -- ${r.trees.length} fetched tree(s) [${r.trees.join(', ')}] each have a row; ${r.checked.length} LICENSE digest(s) checked [${r.checked.join(', ')}]; allowed ids [${r.allowed.join(', ')}]`);
    return { code: 0, lines };
}

function runSelfTest() {
    const tmp = mkdtempSync(join(tmpdir(), 'licence-allowlist-'));
    try {
        const put = (rel, body) => { mkdirSync(dirname(join(tmp, rel)), { recursive: true }); writeFileSync(join(tmp, rel), body); };
        const licenceText = 'MIT License\n\nCopyright (c) fixture\n';
        put('scripts/fetch-alpha.sh', '#!/bin/sh\n');
        put('alpha/LICENSE', licenceText);
        const baseLs = ['scripts/fetch-alpha.sh', 'scripts/other.sh'];
        const pinned = sha256(join(tmp, 'alpha/LICENSE'));
        const base = () => ({
            allowed_spdx: ['MIT'],
            trees: [{
                path: 'alpha', source: 'https://example.invalid/alpha', fetch_script: 'scripts/fetch-alpha.sh',
                spdx: 'MIT', licence_file: 'LICENSE', licence_file_sha256: pinned, reason: 'fixture',
            }],
        });

        const control = check(tmp, base(), baseLs);
        if (control.fails.length || control.checked.length !== 1) {
            console.error(`${NAME} self-test: FAIL -- the clean fixture is not green (${control.fails.join(' | ') || 'no digest checked'}), so the plant results below would be meaningless`);
            return 1;
        }
        rmSync(join(tmp, 'alpha'), { recursive: true });
        const absent = check(tmp, base(), baseLs);
        put('alpha/LICENSE', licenceText);
        if (absent.fails.length || absent.skips.length !== 1 || !absent.skips[0].includes('alpha/ absent')) {
            console.error(`${NAME} self-test: FAIL -- an absent tree did not produce exactly one SKIP and no FAIL`);
            return 1;
        }
        console.log(`${NAME} self-test: clean control green (one digest checked); absent tree SKIPs that row only`);

        const plants = [
            { name: 'altered-licence-text', naming: 'alpha/LICENSE sha256',
                apply: () => { put('alpha/LICENSE', `${licenceText}extra clause\n`); return [base(), baseLs, () => put('alpha/LICENSE', licenceText)]; } },
            { name: 'spdx-not-allowed', naming: 'GPL-3.0-only',
                apply: () => { const a = base(); a.trees[0].spdx = 'GPL-3.0-only'; return [a, baseLs]; } },
            { name: 'spdx-see-licence', naming: 'SEE LICENSE IN README.md',
                apply: () => { const a = base(); a.trees[0].spdx = 'SEE LICENSE IN README.md'; return [a, baseLs]; } },
            { name: 'allowed-spdx-none', naming: 'NONE',
                apply: () => { const a = base(); a.allowed_spdx.push('NONE'); return [a, baseLs]; } },
            { name: 'fetched-tree-without-row', naming: 'extra',
                apply: () => { put('scripts/fetch-extra.sh', '#!/bin/sh\n'); return [base(), [...baseLs, 'scripts/fetch-extra.sh'], () => rmSync(join(tmp, 'scripts/fetch-extra.sh'))]; } },
            { name: 'row-without-fetch-script', naming: 'scripts/fetch-ghost.sh',
                apply: () => { const a = base(); a.trees.push({ ...a.trees[0], path: 'ghost', fetch_script: 'scripts/fetch-ghost.sh' }); return [a, baseLs]; } },
        ];

        let failures = 0;
        for (const p of plants) {
            const [allow, ls, undo] = p.apply();
            try {
                const r = check(tmp, allow, ls);
                const text = r.fails.join('\n');
                if (!r.fails.length) { console.error(`  FAIL ${p.name} -> stayed green`); failures++; }
                else if (!text.includes(p.naming)) { console.error(`  FAIL ${p.name} -> red, but not naming '${p.naming}': ${text}`); failures++; }
                else console.log(`  ok ${p.name} -> red, naming '${p.naming}'`);
            } finally {
                undo?.();
            }
            const after = check(tmp, base(), baseLs);
            if (after.fails.length) { console.error(`${NAME} self-test: FAIL -- plant ${p.name} did not clean up: ${after.fails.join(' | ')}`); return 1; }
        }
        if (failures) {
            console.error(`${NAME} self-test: FAIL -- ${failures} of ${plants.length} plant(s) did not go red naming the drift`);
            return 1;
        }
        console.log(`${NAME} self-test: PASS -- ${plants.length} planted faults each went red naming the drift`);
        return 0;
    } finally {
        rmSync(tmp, { recursive: true, force: true });
    }
}

const args = process.argv.slice(2);
const unknown = args.filter((a) => a !== '--self-test');
if (unknown.length) {
    console.error(`${NAME}: FAIL -- unknown argument ${unknown[0]} (usage: node scripts/verify-licence-allowlist.mjs [--self-test])`);
    process.exit(2);
}
if (args.includes('--self-test')) process.exit(runSelfTest());
let allowList;
try {
    allowList = JSON.parse(readFileSync(join(REPO_ROOT, INVENTORY_REL), 'utf8'));
} catch (err) {
    console.error(`${NAME}: FAIL -- cannot read ${INVENTORY_REL}: ${err.message}`);
    process.exit(1);
}
const lsFiles = execFileSync('git', ['-C', REPO_ROOT, 'ls-files', '--', 'scripts/fetch-*.sh'], { encoding: 'utf8' }).split('\n').filter(Boolean);
const { code, lines } = render(check(REPO_ROOT, allowList, lsFiles));
for (const l of lines) (code ? console.error : console.log)(l);
process.exit(code);
