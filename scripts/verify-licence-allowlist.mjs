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
// Per-package rule (Phase 68, P68-24, P68-25, P68-38), separate from the tree rule and
// never checked against allowed_spdx: over the Orca shipped set that
// scripts/lib/orca-shipped-packages.mjs derives from the bundles, a package is red when
// its licence field is a refused marker, when it has no licence field and no licence
// file, or when no OR-disjunct of its SPDX expression has every AND-conjunct in
// allowed_package_spdx, unless a package_exceptions or package_rulings row names it.
// Rows are checked too (stale, licence text changed, status consequences; see the
// inventory's $comment). With no built orca/ the per-package step prints one SKIP line
// and the tracked-only steps (extension folders, PENDING lines) still run.
// Bundled-extension rule (BEXT-02, D-30): bundled_extensions row ids equal, as a set both ways, the
// add-on ids pinned in powerbrowser/packaging/bundled-xpi.json plus the <publisher>.<name> manifest
// ids of bundled-extensions/*/. A gecko-distribution row's spdx equals its pin's licence, and its
// cached XPI's licence file line 1 equals the row (one SKIP line when no XPI is cached). These rows
// are never checked against allowed_spdx.
// PENDING RULING / PENDING OWNER CHECK lines never change the exit status here;
// --rulings prints only them and exits 1 while any is open (no built orca/ needed).
//
// Tier: quick (git ls-files, small file reads, the cached Orca shipped set). The
// self-test runs check() and packageCheck() over mkdtemp fixtures, never the real inventory.
//
// Usage:
//   node scripts/verify-licence-allowlist.mjs
//   node scripts/verify-licence-allowlist.mjs --self-test
//   node scripts/verify-licence-allowlist.mjs --rulings

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { orcaShippedPackages } from './lib/orca-shipped-packages.mjs';

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

/** True when some OR-disjunct of an SPDX expression has every AND-conjunct in `allowed`; unparsable is false. */
export function spdxAllowed(expr, allowed) {
    const t = String(expr ?? '').match(/\(|\)|[^\s()]+/g) ?? [];
    let i = 0;
    const atom = () => {
        const tok = t[i++];
        if (tok === '(') { const v = or(); if (t[i++] !== ')') throw new Error('unbalanced'); return v; }
        if (!tok || tok === ')' || /^(AND|OR|WITH)$/i.test(tok)) throw new Error('unexpected token');
        if (/^WITH$/i.test(t[i] ?? '')) { i += 2; return false; } // an exception clause is never in the set
        return allowed.has(tok);
    };
    const and = () => { let v = atom(); while (/^AND$/i.test(t[i] ?? '')) { i++; v = atom() && v; } return v; };
    const or = () => { let v = and(); while (/^OR$/i.test(t[i] ?? '')) { i++; v = and() || v; } return v; };
    try { const v = or(); return i === t.length && v; } catch { return false; }
}

const EXACT_VERSION = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

function extensionCarries(repoRoot, ext, pkg) {
    if (typeof ext !== 'string' || ext === '' || ext.startsWith('/') || ext.split('/').includes('..')) return false;
    try {
        const manifest = JSON.parse(readFileSync(join(repoRoot, ext, 'package.json'), 'utf8'));
        return EXACT_VERSION.test(String(manifest?.dependencies?.[pkg] ?? ''));
    } catch { return false; }
}

function firstLine(repoRoot, p, file) {
    const f = join(repoRoot, p.dir ?? '', file ?? '');
    return file && existsSync(f) ? readFileSync(f, 'utf8').split(/\r?\n/)[0].trim() : null;
}

/**
 * The per-package rule and the ruling rows. `packages` is the Orca shipped set, or null
 * when it was not derived (no built orca/, or --rulings): then only the tracked-only
 * steps run. Returns { fails[], pending[], passCount (null when not derived) }.
 */
export function packageCheck(repoRoot, allowList, packages) {
    const fails = [];
    const pending = [];
    const allowed = new Set(Array.isArray(allowList?.allowed_package_spdx) ? allowList.allowed_package_spdx : []);
    const exceptions = Array.isArray(allowList?.package_exceptions) ? allowList.package_exceptions : [];
    const rulings = Array.isArray(allowList?.package_rulings) ? allowList.package_rulings : [];
    if (allowed.size === 0) fails.push(`${INVENTORY_REL}: allowed_package_spdx is missing or empty`);
    for (const id of allowed) if (refusedSpdx(id)) fails.push(`allowed_package_spdx contains ${JSON.stringify(id)}, which is not a licence`);

    const shipped = packages ? new Map() : null;
    for (const p of packages ?? []) shipped.set(p.name, [...(shipped.get(p.name) ?? []), p]);
    const where = (name) => [...new Set(shipped.get(name).flatMap((p) => p.shippedIn))].sort().join(', ');
    const textChanged = (row) => {
        for (const p of shipped.get(row.package)) {
            const got = firstLine(repoRoot, p, row.licence_file);
            if (got !== row.licence_first_line) fails.push(`licence text changed for ${row.package}@${p.version}: ${row.licence_file} line 1 is ${JSON.stringify(got)}, the row records ${JSON.stringify(row.licence_first_line)}; re-read it and update the row`);
        }
    };

    const named = new Set();
    for (const [i, row] of exceptions.entries()) {
        if (typeof row?.package !== 'string' || !row.licence_file || !row.licence_first_line || !row.reason) {
            fails.push(`package_exceptions[${i}]: missing required key(s) package, licence_file, licence_first_line or reason`);
            continue;
        }
        named.add(row.package);
        if (!shipped) continue;
        if (!shipped.has(row.package)) fails.push(`stale row ${row.package}: package_exceptions names a package that no longer ships; remove the row`);
        else textChanged(row);
    }
    for (const [i, row] of rulings.entries()) {
        if (typeof row?.package !== 'string' || !row.ruling || !row.status) {
            fails.push(`package_rulings[${i}]: missing required key(s) package, ruling or status`);
            continue;
        }
        named.add(row.package);
        const ships = shipped?.has(row.package);
        switch (row.status) {
        case 'pending':
            pending.push(`PENDING RULING -- ${row.package}@${row.version_seen} (${row.ruling}): ${row.reason ?? 'owner ruling open'}`);
            if (shipped && !ships) fails.push(`stale row ${row.package}: a pending ruling (${row.ruling}) for a package that no longer ships; remove the row`);
            break;
        case 'ship':
            if (shipped && !ships) fails.push(`stale row ${row.package}: ruled ship (${row.ruling}) but it no longer ships; remove the row`);
            else if (shipped) textChanged(row);
            break;
        case 'exclude':
        case 'runtime-fetch':
        case 'extension':
            // No stale-row rule here: these statuses exist so that the package no longer ships.
            if (ships) fails.push(`${row.package}: ruled ${row.status} (${row.ruling}) but still ships in ${where(row.package)}`);
            if (row.status !== 'extension') break;
            if (!extensionCarries(repoRoot, row.extension, row.package)) fails.push(`extension folder ${row.extension} absent or not carrying ${row.package} at an exact version in its package.json dependencies (${row.ruling})`);
            if (row.terms_check === 'pending') pending.push(`PENDING OWNER CHECK -- Anthropic's terms permit redistributing ${row.package} in the pre-installed extension (${row.ruling}, D-30)`);
            else if (row.terms_check !== 'confirmed') fails.push(`${row.package}: terms_check ${JSON.stringify(row.terms_check)} is neither pending nor confirmed`);
            break;
        default:
            fails.push(`${row.package}: status ${JSON.stringify(row.status)} is not one of pending, ship, exclude, runtime-fetch, extension`);
        }
    }

    let passCount = null;
    if (shipped) {
        passCount = 0;
        for (const p of packages) {
            if (named.has(p.name)) continue; // a ruled or excepted package is never counted as a pass
            const id = `${p.name}@${p.version} (${p.shippedIn.join(', ')})`;
            const lic = p.license;
            if (lic == null || lic === 'no license field') {
                fails.push(p.text ? `${id} has no licence field; add a package_exceptions row recording its licence file and line 1` : `${id} has no licence field and no licence file`);
            } else if (refusedSpdx(lic)) {
                fails.push(`${id} licence ${JSON.stringify(lic)} is not an SPDX licence (empty, NONE, UNLICENSED or SEE LICENSE ...) and no package_exceptions or package_rulings row names it`);
            } else if (!spdxAllowed(lic, allowed)) {
                fails.push(`${id} licence ${JSON.stringify(lic)} has no disjunct in allowed_package_spdx and no row names it`);
            } else passCount++;
        }
    }
    const b = allowList?.allowed_package_spdx_ruling;
    if (b?.status === 'pending') {
        pending.unshift(`PENDING RULING -- allowed_package_spdx (${b.ruling}): ${passCount === null ? 'per-package count not derived in this mode' : `${passCount} packages pass by the proposed set`}, ${exceptions.length} exception rows`);
    }
    return { fails, pending, passCount };
}

const XPI_PIN_REL = 'powerbrowser/packaging/bundled-xpi.json';
const BUNDLED_EXT_DIR = 'bundled-extensions';
const PY_ZIP_READ = 'import sys,zipfile\nsys.stdout.buffer.write(zipfile.ZipFile(sys.argv[1]).read(sys.argv[2]))';

/** The tree's bundled extensions: { pins: {id: pin}, manifests: [id] } (absent inputs are empty). */
export function bundledInputs(repoRoot) {
    const pinPath = join(repoRoot, XPI_PIN_REL);
    const pins = existsSync(pinPath)
        ? Object.fromEntries(Object.entries(JSON.parse(readFileSync(pinPath, 'utf8'))).filter(([k]) => !k.startsWith('$')))
        : {};
    const root = join(repoRoot, BUNDLED_EXT_DIR);
    const manifests = (existsSync(root) ? readdirSync(root) : []).sort()
        .filter((f) => existsSync(join(root, f, 'package.json')))
        .map((f) => { const m = JSON.parse(readFileSync(join(root, f, 'package.json'), 'utf8')); return `${m.publisher}.${m.name}`; });
    return { pins, manifests };
}

/** Line 1 of `member` inside the cached XPI for a pin, or null when no XPI is cached. */
export function cachedXpiFirstLine(repoRoot, id, pin, member) {
    const xpi = join(repoRoot, '.mozbuild', 'bundled-xpi', `${id}-${pin.version}.xpi`);
    if (!existsSync(xpi)) return null;
    const text = execFileSync('python3', ['-I', '-c', PY_ZIP_READ, xpi, member], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    return text.split(/\r?\n/)[0].trim();
}

/**
 * The bundled_extensions rows against the tree. firstLine(id, pin, member) returns the cached
 * XPI's licence line 1 or null (not cached). Returns { fails[], skips[], count }.
 */
export function bundledCheck(allowList, { pins, manifests }, firstLine) {
    const fails = [];
    const skips = [];
    const rows = Array.isArray(allowList?.bundled_extensions) ? allowList.bundled_extensions : [];
    const want = new Map([...Object.keys(pins).map((id) => [id, 'gecko-distribution']), ...manifests.map((id) => [id, 'theia-preinstalled'])]);
    if (want.size && !Array.isArray(allowList?.bundled_extensions)) fails.push(`${INVENTORY_REL}: bundled_extensions is missing while the tree pre-installs ${[...want.keys()].join(', ')}`);
    const seen = new Set();
    for (const [i, row] of rows.entries()) {
        const label = row?.id ? `bundled extension "${row.id}"` : `bundled_extensions[${i}]`;
        const keys = row?.kind === 'gecko-distribution' ? ['id', 'kind', 'spdx', 'ruling', 'licence_file', 'licence_first_line', 'reason'] : ['id', 'kind', 'carries', 'ruling', 'reason'];
        const missing = keys.filter((k) => typeof row?.[k] !== 'string' || row[k].trim() === '');
        if (missing.length) { fails.push(`${label}: missing required key(s) ${missing.join(', ')}`); continue; }
        if (seen.has(row.id)) fails.push(`${label}: duplicate row`);
        seen.add(row.id);
        if (!want.has(row.id)) { fails.push(`stale bundled_extensions row ${row.id}: neither ${XPI_PIN_REL} nor ${BUNDLED_EXT_DIR}/*/ names it; remove the row`); continue; }
        if (row.kind !== want.get(row.id)) { fails.push(`${label}: kind ${row.kind}, but the tree carries it as ${want.get(row.id)}`); continue; }
        if (row.kind !== 'gecko-distribution') continue;
        const pin = pins[row.id];
        if (row.spdx !== pin.licence) fails.push(`${label}: spdx ${row.spdx} differs from the pin's licence ${pin.licence} in ${XPI_PIN_REL}`);
        const got = firstLine(row.id, pin, row.licence_file);
        if (got === null) skips.push(`${NAME}: SKIP -- ${row.id} ${pin.version} is not cached in .mozbuild/bundled-xpi/; its ${row.licence_file} line 1 is unchecked (run bash powerbrowser/packaging/stage-bundled-xpi.sh <dir>)`);
        else if (got !== row.licence_first_line) fails.push(`licence text changed for ${row.id} ${pin.version}: ${row.licence_file} line 1 is ${JSON.stringify(got)}, the row records ${JSON.stringify(row.licence_first_line)}; re-read it and update the row`);
    }
    for (const [id, kind] of want) {
        if (!seen.has(id)) fails.push(kind === 'gecko-distribution' ? `pinned XPI ${id} has no bundled_extensions row in ${INVENTORY_REL}` : `bundled extension ${id} (${BUNDLED_EXT_DIR}/*/) has no bundled_extensions row in ${INVENTORY_REL}`);
    }
    return { fails, skips, count: seen.size };
}

function render(r, pr) {
    const lines = [...r.skips, ...pr.skips, ...(pr.bundled?.skips ?? [])];
    const fails = [...r.fails, ...pr.fails, ...(pr.bundled?.fails ?? [])];
    if (fails.length) {
        for (const f of fails) lines.push(`${NAME}: FAIL -- ${f}`);
        // No FAIL token here, so the count of FAIL lines is the count of problems.
        lines.push(`${NAME}: ${fails.length} problem(s) above. Next step: fix the row in ${INVENTORY_REL} or the tree or package it names.`);
        return { code: 1, lines: [...lines, ...pr.pending] };
    }
    lines.push(`${NAME}: PASS -- ${r.trees.length} fetched tree(s) [${r.trees.join(', ')}] each have a row; ${r.checked.length} LICENSE digest(s) checked [${r.checked.join(', ')}]; allowed ids [${r.allowed.join(', ')}]`);
    if (pr.bundled) lines.push(`${NAME}: PASS -- ${pr.bundled.count} bundled_extensions row(s) equal the pinned XPIs and ${BUNDLED_EXT_DIR}/*/ as a set`);
    if (pr.passCount !== null) lines.push(`${NAME}: PASS -- ${pr.passCount} shipped Orca package(s) pass by allowed_package_spdx; the rest are named by package_exceptions or package_rulings rows`);
    return { code: 0, lines: [...lines, ...pr.pending] };
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

        // Per-package rule and ruling rows over fixture package sets.
        put('pk/mit/LICENSE', licenceText);
        put('ext/sdk/package.json', JSON.stringify({ dependencies: { 'p-sdk': '1.2.3' } }));
        const pbase = (o = {}) => ({
            allowed_package_spdx: ['MIT', 'BSD-3-Clause'], allowed_package_spdx_ruling: { ruling: '68-B', status: 'ruled' },
            package_exceptions: [], package_rulings: [], ...o,
        });
        const pkg = (name, license, o = {}) => ({ name, version: '1.0.0', license, text: licenceText, dir: 'pk/mit', shippedIn: ['orcad'], ...o });
        const pkgs = (...more) => [pkg('p-mit', 'MIT'), ...more];
        const extRow = (o = {}) => ({ package: 'p-sdk', version_seen: '1.2.3', ruling: '68-A', status: 'extension', extension: 'ext/sdk', terms_check: 'confirmed', ...o });
        const pending = (o) => ({ package: 'p-pend', version_seen: '1.0.0', ruling: '68-X', status: 'pending', ...o });
        const pcontrol = packageCheck(tmp, pbase(), pkgs());
        if (pcontrol.fails.length || pcontrol.passCount !== 1 || pcontrol.pending.length) {
            console.error(`${NAME} self-test: FAIL -- the clean package fixture is not green with one pass (${pcontrol.fails.join(' | ')})`);
            return 1;
        }
        const red = (naming, allow, packages) => () => {
            const text = packageCheck(tmp, allow, packages).fails.join('\n');
            return [text.includes(naming), text ? `red: ${text}` : 'stayed green'];
        };
        const pplants = [
            { name: 'see-licence-package-without-row', test: red('p-see@1.0.0 (orcad) licence "SEE LICENSE IN README.md"', pbase(), pkgs(pkg('p-see', 'SEE LICENSE IN README.md'))) },
            { name: 'no-field-no-file', test: red('p-bare@1.0.0 (orcad) has no licence field and no licence file', pbase(), pkgs(pkg('p-bare', 'no license field', { text: null }))) },
            { name: 'gpl-expression', test: red('licence "GPL-2.0-only" has no disjunct', pbase(), pkgs(pkg('p-gpl', 'GPL-2.0-only'))) },
            { name: 'stale-pending-row', test: red('stale row p-pend', pbase({ package_rulings: [pending()] }), pkgs()) },
            { name: 'exception-text-changed', test: red('licence text changed for p-mit@1.0.0', pbase({ package_exceptions: [{ package: 'p-mit', licence_file: 'LICENSE', licence_first_line: 'Other licence', reason: 'fixture' }] }), pkgs()) },
            { name: 'exclude-row-still-ships', test: red('ruled exclude (68-A) but still ships in orcad', pbase({ package_rulings: [{ package: 'p-ex', ruling: '68-A', status: 'exclude' }] }), pkgs(pkg('p-ex', 'SEE LICENSE IN x'))) },
            { name: 'extension-row-still-ships', test: red('ruled extension (68-A) but still ships in orcad', pbase({ package_rulings: [extRow()] }), pkgs(pkg('p-sdk', 'SEE LICENSE IN README.md'))) },
            { name: 'extension-folder-absent', test: red('extension folder ext/missing absent', pbase({ package_rulings: [extRow({ extension: 'ext/missing' })] }), pkgs()) },
            { name: 'pending-row-counted-as-pass', test: () => {
                const r = packageCheck(tmp, pbase({ allowed_package_spdx_ruling: { ruling: '68-B', status: 'pending' }, package_rulings: [pending()] }), pkgs(pkg('p-pend', 'SEE LICENSE IN x')));
                const ok = r.fails.length === 0 && r.passCount === 1 && r.pending.some((l) => l.startsWith('PENDING RULING -- p-pend@1.0.0 (68-X)'))
                    && r.pending.some((l) => l.startsWith('PENDING RULING -- allowed_package_spdx (68-B): 1 packages pass'));
                return [ok, `passCount ${r.passCount}, pending [${r.pending.join(' | ')}], fails [${r.fails.join(' | ')}]`];
            } },
            { name: 'terms-check-pending-lets-rulings-exit-0', test: () => {
                const p = packageCheck(tmp, pbase({ package_rulings: [extRow({ terms_check: 'pending' })] }), null).pending;
                return [p.length > 0 && p[0].startsWith('PENDING OWNER CHECK -- ') && p[0].includes('p-sdk'), `--rulings would print [${p.join(' | ')}]`];
            } },
            // Controls: these must be green.
            { name: 'control-rulings-nothing-open', test: () => { const p = packageCheck(tmp, pbase({ package_rulings: [extRow()] }), null).pending; return [p.length === 0, `pending [${p.join(' | ')}]`]; } },
            { name: 'control-extension-row-done', test: () => { const f = packageCheck(tmp, pbase({ package_rulings: [extRow()] }), pkgs()).fails; return [f.length === 0, `fails [${f.join(' | ')}]`]; } },
            { name: 'control-bsd-or-gpl', test: () => { const r = packageCheck(tmp, pbase(), pkgs(pkg('p-dual', '(BSD-3-Clause OR GPL-2.0)'))); return [r.fails.length === 0 && r.passCount === 2, `fails [${r.fails.join(' | ')}]`]; } },
        ];
        for (const p of pplants) {
            const [ok, detail] = p.test();
            if (ok) console.log(`  ok ${p.name}`);
            else { console.error(`  FAIL ${p.name} -> ${detail}`); failures++; }
        }
        // Bundled-extension rows over fixture inputs: a pinned XPI, one extension folder, a stub first-line reader.
        const bin = { pins: { 'x@fixture': { licence: 'GPL-3.0-or-later', version: '1.0.0' } }, manifests: ['pub.ext'] };
        const brows = () => [
            { id: 'x@fixture', kind: 'gecko-distribution', spdx: 'GPL-3.0-or-later', ruling: 'BEXT-02', licence_file: 'LICENSE.txt', licence_first_line: 'GNU GENERAL PUBLIC LICENSE', reason: 'fixture' },
            { id: 'pub.ext', kind: 'theia-preinstalled', carries: 'p-sdk', ruling: '68-A', reason: 'fixture' },
        ];
        const line1 = (l) => () => l;
        const bcontrol = bundledCheck({ bundled_extensions: brows() }, bin, line1('GNU GENERAL PUBLIC LICENSE'));
        const bskip = bundledCheck({ bundled_extensions: brows() }, bin, line1(null));
        if (bcontrol.fails.length || bcontrol.count !== 2 || bskip.fails.length || bskip.skips.length !== 1) {
            console.error(`${NAME} self-test: FAIL -- the clean bundled fixture is not green with one SKIP when uncached (${[...bcontrol.fails, ...bskip.fails].join(' | ')})`);
            return 1;
        }
        const bred = (naming, allow, inputs, l = 'GNU GENERAL PUBLIC LICENSE') => () => {
            const text = bundledCheck(allow, inputs, line1(l)).fails.join('\n');
            return [text.includes(naming), text ? `red: ${text}` : 'stayed green'];
        };
        const bplants = [
            { name: 'pinned-xpi-without-row', test: bred('pinned XPI y@fixture has no bundled_extensions row', { bundled_extensions: brows() }, { ...bin, pins: { ...bin.pins, 'y@fixture': { licence: 'MIT', version: '2.0.0' } } }) },
            { name: 'stale-bundled-row', test: bred('stale bundled_extensions row z@fixture', { bundled_extensions: [...brows(), { ...brows()[0], id: 'z@fixture' }] }, bin) },
            { name: 'xpi-licence-first-line-changed', test: bred('licence text changed for x@fixture 1.0.0', { bundled_extensions: brows() }, bin, 'Some other licence') },
        ];
        for (const p of bplants) {
            const [ok, detail] = p.test();
            if (ok) console.log(`  ok ${p.name}`);
            else { console.error(`  FAIL ${p.name} -> ${detail}`); failures++; }
        }
        const total = plants.length + pplants.length + bplants.length;
        if (failures) {
            console.error(`${NAME} self-test: FAIL -- ${failures} of ${total} plant(s) and control(s) did not hold`);
            return 1;
        }
        console.log(`${NAME} self-test: PASS -- ${total - 3} planted faults each went red naming the drift; 3 controls green`);
        return 0;
    } finally {
        rmSync(tmp, { recursive: true, force: true });
    }
}

const args = process.argv.slice(2);
const unknown = args.filter((a) => a !== '--self-test' && a !== '--rulings');
if (unknown.length) {
    console.error(`${NAME}: FAIL -- unknown argument ${unknown[0]} (usage: node scripts/verify-licence-allowlist.mjs [--self-test | --rulings])`);
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
if (args.includes('--rulings')) {
    const open = packageCheck(REPO_ROOT, allowList, null).pending;
    for (const l of open) console.log(l);
    if (!open.length) console.log(`${NAME}: --rulings PASS -- no owner licence item is open`);
    process.exit(open.length ? 1 : 0);
}
const lsFiles = execFileSync('git', ['-C', REPO_ROOT, 'ls-files', '--', 'scripts/fetch-*.sh'], { encoding: 'utf8' }).split('\n').filter(Boolean);
const pr = { skips: [], fails: [] };
let packages = null;
try {
    const d = await orcaShippedPackages({ repoRoot: REPO_ROOT, log: (l) => console.log(`${NAME}: ${l}`) });
    if (d.skip) pr.skips.push(`${NAME}: SKIP -- per-package rule not run: ${d.skip}`);
    else packages = d.packages;
} catch (err) {
    pr.fails.push(`the Orca shipped package set could not be derived: ${err.message}`);
}
const p = packageCheck(REPO_ROOT, allowList, packages);
const bundled = bundledCheck(allowList, bundledInputs(REPO_ROOT), (id, pin, member) => cachedXpiFirstLine(REPO_ROOT, id, pin, member));
const { code, lines } = render(check(REPO_ROOT, allowList, lsFiles), { ...p, skips: pr.skips, fails: [...pr.fails, ...p.fails], bundled });
for (const l of lines) (code && !l.startsWith('PENDING') ? console.error : console.log)(l);
process.exit(code);
