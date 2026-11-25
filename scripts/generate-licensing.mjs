#!/usr/bin/env node
// scripts/generate-licensing.mjs
//
// The licence-notice generator (Phase 40, PKG-08). Release builds carry
// LICENSING.md and THIRD-PARTY-NOTICES.txt at the repo root. Both are
// generator output: notices typed by hand drift on every ESR, Theia or Node bump.
//
// Inputs:
//  - configuration.toml, through resolveConfig() from ./generate.mjs: the
//    product licence, copyright holder, trademark notice and the ESR tag.
//  - about:license, preprocessed from the applied upstream/ checkout with
//    Mozilla's own mozbuild preprocessor and the Linux define set
//    LINUX_LICENSE_DEFINES. This reproduces the built license.html byte for
//    byte; --check compares the two whenever an objdir exists.
//  - The Theia production closure: theia/applications/browser/package.json
//    `dependencies`, resolved recursively through node_modules the way Node
//    resolves them (dependencies and installed optionalDependencies, never
//    devDependencies). @powerbrowser/* packages are this repo's own code under
//    LICENSE, so they are walked through but not listed.
//  - The Node.js runtime LICENSE, extracted from the archive pinned in
//    powerbrowser/packaging/node-runtime.json and cached at NODE_ARCHIVE_DIR
//    (the cache package-linux.sh uses). Its sha256 is checked before use.
//  - The shipped Orca packages (orcad, web client, mobile-web), derived from the
//    bundles by scripts/lib/orca-shipped-packages.mjs. With no built orca/ the Orca
//    section is not re-derived (one SKIP line) and the tracked section is kept.
//  - The bundled extensions (BEXT-02, D-30): the Gecko add-ons pinned in
//    powerbrowser/packaging/bundled-xpi.json, their licence text read from the cached XPI
//    (.mozbuild/bundled-xpi/<id>-<version>.xpi, sha256-checked against the pin; with no cache
//    the tracked text is kept after one SKIP line), and the package each
//    bundled-extensions/*/ Theia extension carries, from its package.json and
//    package-lock.json, its licence text read from the built plugins/.user copy, else
//    orca/node_modules, else the byte-for-byte quote in the extension's own LICENSE.md
//    (one SKIP line; verify-bundled-extensions.mjs holds the quote equal to the package's file).
//
// Modes:
//   node scripts/generate-licensing.mjs              write both files (temp file + rename each);
//                                                    fetches the pinned Node archive if not cached
//   node scripts/generate-licensing.mjs --check      re-derive both in memory; fail naming the
//                                                    file and first differing line on any drift
//   node scripts/generate-licensing.mjs --check-orca re-derive only the Orca section from the built
//                                                    orca/ and compare it with the tracked one
//   node scripts/generate-licensing.mjs --write-orca rewrite only the Orca section of the notices;
//                                                    every other byte is kept (the re-pin uses this)
//   node scripts/generate-licensing.mjs --self-test  hermetic fixtures in a temp dir
//
// --check and --check-orca compare the Orca package set both ways: a shipped package
// missing from the notices is red, and an Orca notice for a package that does not ship
// is red.
//
// --check runs python over upstream/ and reads files. It runs no build, no
// browser, no display and never uses the network: without a cached Node
// archive it still asserts the Node version and prints one SKIP line for the
// Node text alone.

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
    copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync,
    renameSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveConfig } from './generate.mjs';
import { licenceText, licenseField, orcaShippedPackages } from './lib/orca-shipped-packages.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'licensing';
const RERUN = 'node scripts/generate-licensing.mjs';

// The condition names in toolkit/content/license.html that the Linux build defines
// (objdir/config.status). With exactly these the preprocessed file equals the built one.
export const LINUX_LICENSE_DEFINES = ['MOZ_JXL', 'MOZ_ZUCCHINI', 'XP_LINUX'];
export const NODE_ARCHIVE_DIR = '.mozbuild/node-dist';

const NOTICES_REL = 'THIRD-PARTY-NOTICES.txt';
const LICENSING_REL = 'LICENSING.md';
const BUILT_LICENSE_REL = 'objdir/dist/bin/browser/chrome/browser/content/browser/license.html';
const NODE_PIN_REL = 'powerbrowser/packaging/node-runtime.json';
const APP_PACKAGE_REL = 'theia/applications/browser/package.json';
const FETCH_UPSTREAM = 'bash scripts/fetch-upstream.sh && bash scripts/apply-patches.sh';
const THEIA_INSTALL = "nix develop .#theia --command bash -c 'cd theia && yarn install --frozen-lockfile'";
const NO_LICENCE_FILE = 'no licence file shipped in the package';
const RULE = '-'.repeat(79);
const XPI_PIN_REL = 'powerbrowser/packaging/bundled-xpi.json';
const LICENCE_ALLOWLIST_REL = 'inventory/licence-allowlist.json';
// packaging-prefs-network-02: the line that introduces Orca's own MIT notice in the Orca section.
export const ORCA_LICENCE_LEAD = "Orca's own copyright and permission notice (orca/LICENSE at the pin), quoted byte for byte:";
const XPI_CACHE_DIR = '.mozbuild/bundled-xpi';
const BUNDLED_EXT_DIR = 'bundled-extensions';
const USER_PLUGINS_REL = 'theia/applications/browser/plugins/.user';
// The heading bundled-extensions/<folder>/LICENSE.md quotes the carried package's LICENSE.md under.
const EXT_QUOTE_HEADING = "## The package's LICENSE.md, quoted byte for byte";

class Fail extends Error {}

// --- Gecko: about:license through Mozilla's preprocessor ---------------------

// Run with cwd = upstream/ and `python3 -I`, so no user site or PYTHONPATH is consulted.
const PREPROCESS_PY = `
import io, os, sys
sys.path.insert(0, 'python/mozbuild')
from mozbuild.preprocessor import Preprocessor
pp = Preprocessor()
pp.context.update({name: '1' for name in sys.argv[1].split(',')})
pp.context['APP_LICENSE_BLOCK'] = os.path.abspath('browser/base/content/overrides/app-license.html')
out = io.StringIO()
pp.out = out
pp.do_include('toolkit/content/license.html')
sys.stdout.buffer.write(out.getvalue().encode('utf-8'))
`;

/** Preprocessed about:license HTML as a Buffer. Throws Fail. */
function preprocessGecko(upstreamDir) {
    if (!existsSync(join(upstreamDir, 'toolkit/content/license.html'))
        || !existsSync(join(upstreamDir, 'python/mozbuild/mozbuild/preprocessor.py'))) {
        throw new Fail(`upstream/ has no applied Gecko checkout, so about:license cannot be preprocessed. Next step: run: ${FETCH_UPSTREAM}`);
    }
    const r = spawnSync('python3', ['-I', '-c', PREPROCESS_PY, LINUX_LICENSE_DEFINES.join(',')], {
        cwd: upstreamDir,
        maxBuffer: 64 * 1024 * 1024,
    });
    if (r.error) throw new Fail(`python3 could not be started (${r.error.code ?? r.error.message}). Next step: run this inside nix develop .#theia, which provides python3.`);
    if (r.status !== 0) {
        const last = r.stderr.toString().trim().split('\n').pop() ?? '';
        throw new Fail(`Mozilla's preprocessor exited ${r.status} on toolkit/content/license.html: ${last}. Next step: run: ${FETCH_UPSTREAM}, then ${RERUN}`);
    }
    return r.stdout;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', ldquo: '“', rdquo: '”' };

/** Deterministic HTML-to-text conversion for the notices file. */
export function htmlToText(html) {
    const text = html
        .replace(/\r\n?/g, '\n')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<(head|script|style)\b[\s\S]*?<\/\1\s*>/gi, '')
        .replace(/<\/(p|h[1-6]|li|pre|div|tr)\s*>/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]*>/g, '')
        .replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (m, e) => {
            if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
            return ENTITIES[e] ?? m;
        });
    return text
        .split('\n').map((l) => l.replace(/[ \t]+$/, '')).join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/^\n+/, '')
        .replace(/\n*$/, '\n');
}

// --- Theia: the production dependency closure ---------------------------------

function readJson(path) {
    return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * Every package the app ships, as [{ name, version, license, text }], text null when the
 * package carries no licence file. Throws Fail on an absent node_modules or an unresolvable
 * declared dependency.
 */
export function theiaClosure(nodeModulesRoot, appPackageJson) {
    if (!existsSync(nodeModulesRoot)) {
        throw new Fail(`theia/node_modules is absent, so the Theia dependency licences cannot be collected. Next step: run: ${THEIA_INSTALL}`);
    }
    const top = dirname(nodeModulesRoot);
    // Node resolution: <dir>/node_modules/<dep>, then each parent up to the theia/ root.
    const resolveDep = (fromDir, dep) => {
        for (let cur = fromDir; ; cur = dirname(cur)) {
            const candidate = join(cur, 'node_modules', dep);
            if (existsSync(join(candidate, 'package.json'))) return realpathSync(candidate);
            if (cur === top || cur === dirname(cur)) return undefined;
        }
    };
    const seen = new Map();
    const unresolved = [];
    const queue = [[realpathSync(dirname(appPackageJson)), readJson(appPackageJson)]];
    while (queue.length > 0) {
        const [dir, pkg] = queue.pop();
        const optional = new Set(Object.keys(pkg.optionalDependencies ?? {}));
        const deps = new Set([...Object.keys(pkg.dependencies ?? {}), ...optional]);
        for (const dep of deps) {
            const found = resolveDep(dir, dep);
            if (found === undefined) {
                if (!optional.has(dep)) unresolved.push(`${dep} (required by ${pkg.name}@${pkg.version})`);
                continue;
            }
            if (seen.has(found)) continue;
            const child = readJson(join(found, 'package.json'));
            seen.set(found, child);
            queue.push([found, child]);
        }
    }
    if (unresolved.length > 0) {
        throw new Fail(`declared dependencies are not installed, so the notices would omit them: ${[...new Set(unresolved)].sort().join(', ')}. Next step: run: ${THEIA_INSTALL}`);
    }
    const packages = new Map();
    for (const [dir, pkg] of seen) {
        if (pkg.name.startsWith('@powerbrowser/')) continue;
        const entry = { name: pkg.name, version: pkg.version, license: licenseField(pkg), text: licenceText(dir) };
        packages.set(`${entry.name}@${entry.version}\0${entry.text}`, entry);
    }
    return [...packages.values()];
}

// Group packages whose licence text is byte-identical; a licence-less package groups
// by its license field. Names and groups are in code-unit order. Used by the Theia and
// Orca sections alike.
function licenceGroups(packages) {
    const groups = new Map();
    for (const p of packages) {
        const key = p.text ?? `\0${p.license}`;
        if (!groups.has(key)) groups.set(key, { body: p.text ?? `License: ${p.license}\n${NO_LICENCE_FILE}`, names: [] });
        groups.get(key).names.push(`${p.name}@${p.version} (${p.license})`);
    }
    const list = [...groups.values()];
    for (const g of list) g.names.sort();
    const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
    return list.sort((a, b) => cmp(a.names[0], b.names[0]) || cmp(a.body, b.body));
}

// --- Node: the pinned runtime's LICENSE ---------------------------------------

export function readNodePin(path) {
    const pin = readJson(path)['linux-x64'];
    const archive = String(pin?.url ?? '').split('/').pop();
    if (!/^v\d+\.\d+\.\d+$/.test(pin?.version ?? '') || !/^[0-9a-f]{64}$/.test(pin?.sha256 ?? '') || archive !== `node-${pin.version}-linux-x64.tar.xz`) {
        throw new Fail(`${NODE_PIN_REL} has no usable linux-x64 version, url and sha256 pin. Next step: restore the pin in that file.`);
    }
    return { ...pin, archive, member: `node-${pin.version}-linux-x64/LICENSE` };
}

function sha256(path) {
    return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function verifyArchive(path, pin) {
    const got = sha256(path);
    if (got !== pin.sha256) {
        throw new Fail(`${NODE_ARCHIVE_DIR}/${pin.archive} hashes to ${got}, but ${NODE_PIN_REL} pins ${pin.sha256}. Next step: delete that archive and run: ${RERUN}`);
    }
}

// The main checkout of a git worktree, whose archive cache can be copied instead of downloaded.
function mainCheckout() {
    const r = spawnSync('git', ['-C', REPO_ROOT, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' });
    return r.status === 0 ? dirname(r.stdout.trim()) : undefined;
}

// Write mode only: copy or download into <archive>.part, verify the pin, then rename.
export async function fetchArchive(pin, archivePath) {
    mkdirSync(dirname(archivePath), { recursive: true });
    const part = `${archivePath}.part`;
    try {
        const main = mainCheckout();
        const cached = main && join(main, NODE_ARCHIVE_DIR, pin.archive);
        if (cached && cached !== archivePath && existsSync(cached)) {
            copyFileSync(cached, part);
        } else {
            const res = await fetch(pin.url);
            if (!res.ok) throw new Fail(`downloading ${pin.url} failed with HTTP ${res.status}. Next step: check the network and run: ${RERUN}`);
            writeFileSync(part, Buffer.from(await res.arrayBuffer()));
        }
        const got = sha256(part);
        if (got !== pin.sha256) throw new Fail(`the Node archive from ${pin.url} hashes to ${got}, but ${NODE_PIN_REL} pins ${pin.sha256}; it was discarded. Next step: confirm the pin against nodejs.org SHASUMS256.txt.`);
        renameSync(part, archivePath);
    } finally {
        rmSync(part, { force: true });
    }
}

function extractNodeLicence(archivePath, pin) {
    const r = spawnSync('tar', ['-xJOf', archivePath, pin.member], { maxBuffer: 64 * 1024 * 1024 });
    if (r.error || r.status !== 0) {
        const last = r.error ? r.error.message : r.stderr.toString().trim().split('\n').pop();
        throw new Fail(`extracting ${pin.member} from ${NODE_ARCHIVE_DIR}/${pin.archive} failed: ${last}. Next step: delete that archive and run: ${RERUN}`);
    }
    return r.stdout.toString('utf8');
}

const NODE_HEADER = /^== Node\.js runtime (.*) ==$/m;

function nodeHeader(version) {
    return `== Node.js runtime ${version} ==`;
}

/** The tracked notices' Node section must name the pinned version. */
export function checkNodeHeader(trackedText, version) {
    const m = NODE_HEADER.exec(trackedText);
    if (!m) return [`${NOTICES_REL} has no "${nodeHeader(version)}" section. Next step: run: ${RERUN}, then commit ${NOTICES_REL}.`];
    if (m[1] !== version) return [`${NOTICES_REL} names Node.js runtime ${m[1]}, but ${NODE_PIN_REL} pins ${version}. Next step: run: ${RERUN}, then commit ${NOTICES_REL}.`];
    return [];
}

// The Node licence text as tracked: everything after the Node section's provenance line.
function trackedNodeText(trackedText) {
    const m = NODE_HEADER.exec(trackedText);
    if (!m) return '';
    const after = trackedText.slice(m.index + m[0].length);
    const start = after.indexOf('\n\n', after.indexOf('\nFrom '));
    return start < 0 ? '' : after.slice(start + 2);
}

// --- rendering ----------------------------------------------------------------

export const ORCA_HEADING = '== Orca (orcad, web client, mobile-web) ==';

/**
 * Orca's own licence text: the trees row for orca/ in inventory/licence-allowlist.json names the
 * file and its sha256, and a text that does not hash to that digest is a Fail (a re-pin that
 * changes the notice must be reviewed there first). null when orca/ is not fetched.
 */
export function orcaLicence(root) {
    const row = readJson(join(root, LICENCE_ALLOWLIST_REL))?.trees?.find((t) => t.path === 'orca');
    if (!row?.licence_file || !row?.licence_file_sha256) throw new Fail(`${LICENCE_ALLOWLIST_REL} has no trees row for orca with licence_file and licence_file_sha256. Next step: restore that row.`);
    const path = join(root, 'orca', row.licence_file);
    if (!existsSync(path)) return null;
    const got = sha256(path);
    if (got !== row.licence_file_sha256) throw new Fail(`orca/${row.licence_file} hashes to ${got}, but ${LICENCE_ALLOWLIST_REL} records ${row.licence_file_sha256}. Next step: review the changed notice, update that row, then run: ${RERUN}`);
    return readFileSync(path, 'utf8').replace(/\r\n?/g, '\n').trimEnd();
}

/** The Orca section from its heading up to (not including) the Node heading. */
export function renderOrcaSection(packages, licence) {
    if (typeof licence !== 'string' || licence.trim() === '') throw new Fail(`the Orca section needs Orca's own licence text (orca/LICENSE). Next step: fetch orca/ with scripts/fetch-orca.sh, then run: ${RERUN}`);
    const out = [
        ORCA_HEADING,
        '',
        'Orca source: the pin in configuration.toml [upstreams] orca_tag and orca_commit. Packages are derived from what the orcad, web client and mobile-web bundles contain.',
        '',
        ORCA_LICENCE_LEAD,
        '',
        licence,
        '',
        'The third-party packages those bundles contain follow. Packages whose licence text is byte-identical share one block.',
        '',
    ];
    for (const g of licenceGroups(packages)) out.push(RULE, ...g.names, '', g.body, '');
    out.push(RULE, '', '');
    return out.join('\n');
}

/** { start, end, text } of the Orca section in a notices text, or null. */
export function orcaSectionOf(notices) {
    const start = notices.indexOf(`\n${ORCA_HEADING}\n`);
    if (start < 0) return null;
    const node = NODE_HEADER.exec(notices.slice(start + 1));
    const bundled = notices.indexOf(`\n${BUNDLED_HEADING}\n`, start + 1);
    const end = bundled >= 0 ? bundled + 1 : node ? start + 1 + node.index : notices.length;
    return { start: start + 1, end, text: notices.slice(start + 1, end) };
}

// --- bundled extensions (BEXT-02, D-30) -------------------------------------------

export const BUNDLED_HEADING = '== Bundled extensions ==';

/** The Bundled extensions section from its heading up to (not including) the Node heading, or null. */
export function bundledSectionOf(notices) {
    const start = notices.indexOf(`\n${BUNDLED_HEADING}\n`);
    if (start < 0) return null;
    const node = NODE_HEADER.exec(notices.slice(start + 1));
    const end = node ? start + 1 + node.index : notices.length;
    return { start: start + 1, end, text: notices.slice(start + 1, end) };
}

const itemHeader = (it) => `${it.name} ${it.version} (${it.licence})`;

/** The section text: one block per item, in pin order then extension folder order. */
export function renderBundledSection(items) {
    const out = [
        BUNDLED_HEADING,
        '',
        `Extensions pre-installed in every profile; the user can disable or remove each. Derived from ${XPI_PIN_REL} and ${BUNDLED_EXT_DIR}/*/.`,
        '',
    ];
    for (const it of items) out.push(RULE, itemHeader(it), `Carried as: ${it.carrier}`, `Source: ${it.source}`, '', it.text.replace(/\n*$/, ''), '');
    out.push(RULE, '', '');
    return out.join('\n');
}

/** An item's licence text as the tracked notices carry it, or null. */
export function keptBundledText(notices, item) {
    const lines = (bundledSectionOf(notices ?? '')?.text ?? '').split('\n');
    const h = lines.indexOf(itemHeader(item));
    if (h < 0) return null;
    const body = [];
    for (let i = h + 4; i < lines.length && lines[i] !== RULE; i++) body.push(lines[i]);
    return body.length ? body.join('\n') : null;
}

const PY_ZIP_READ = 'import sys,zipfile\nsys.stdout.buffer.write(zipfile.ZipFile(sys.argv[1]).read(sys.argv[2]))';

function xpiMember(xpi, member) {
    const r = spawnSync('python3', ['-I', '-c', PY_ZIP_READ, xpi, member], { maxBuffer: 64 * 1024 * 1024 });
    if (r.error || r.status !== 0) {
        const last = r.error ? r.error.message : r.stderr.toString().trim().split('\n').pop();
        throw new Fail(`reading ${member} from ${xpi} failed: ${last}. Next step: delete that file and run: bash powerbrowser/packaging/stage-bundled-xpi.sh <dir>`);
    }
    return r.stdout.toString('utf8');
}

const readIf = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null);

/**
 * The bundled extension items: { name, version, licence, carrier, source, text, kind, bundle }.
 * root and trackedNotices are parameters so the self-test can use fixtures.
 */
export function bundledItems(root, trackedNotices) {
    const items = [];
    const pinPath = join(root, XPI_PIN_REL);
    const pins = existsSync(pinPath) ? JSON.parse(readFileSync(pinPath, 'utf8')) : {};
    for (const [id, pin] of Object.entries(pins)) {
        if (id.startsWith('$')) continue;
        const it = { name: pin.name, version: pin.version, licence: pin.licence, carrier: `Gecko distribution add-on ${id}, unmodified`, source: pin.source, kind: 'gecko-distribution', bundle: id };
        const xpi = join(root, XPI_CACHE_DIR, `${id}-${pin.version}.xpi`);
        if (existsSync(xpi)) {
            const got = sha256(xpi);
            if (got !== pin.sha256) throw new Fail(`${XPI_CACHE_DIR}/${id}-${pin.version}.xpi hashes to ${got}, but ${XPI_PIN_REL} pins ${pin.sha256}. Next step: delete that file and run: bash powerbrowser/packaging/stage-bundled-xpi.sh <dir>`);
            it.text = xpiMember(xpi, 'LICENSE.txt');
        } else {
            it.text = keptBundledText(trackedNotices, it);
            if (it.text === null) throw new Fail(`no cached ${XPI_CACHE_DIR}/${id}-${pin.version}.xpi and ${NOTICES_REL} carries no text for ${itemHeader(it)}. Next step: run: bash powerbrowser/packaging/stage-bundled-xpi.sh <dir>, then ${RERUN}`);
            console.log(`${NAME}: SKIP -- ${pin.name} licence text not re-derived: ${XPI_CACHE_DIR}/${id}-${pin.version}.xpi is not cached; the tracked text is kept`);
        }
        items.push(it);
    }
    const extRoot = join(root, BUNDLED_EXT_DIR);
    const folders = existsSync(extRoot) ? readdirSync(extRoot).filter((f) => existsSync(join(extRoot, f, 'package.json'))).sort() : [];
    for (const folder of folders) {
        const m = readJson(join(extRoot, folder, 'package.json'));
        const lock = readJson(join(extRoot, folder, 'package-lock.json'));
        const extId = `${m.publisher}.${m.name}`;
        for (const dep of Object.keys(m.dependencies ?? {}).sort()) {
            const entry = lock?.packages?.[`node_modules/${dep}`];
            if (!entry?.version || !entry?.resolved) throw new Fail(`${BUNDLED_EXT_DIR}/${folder}/package-lock.json pins no version and resolved url for ${dep}. Next step: regenerate that lock.`);
            const it = { name: dep, version: entry.version, licence: entry.license ?? 'no licence field', carrier: `pre-installed Theia extension ${extId}`, source: entry.resolved, kind: 'theia-preinstalled', bundle: extId };
            // 60-WR-02: a copy is read only when its own package.json carries the version the lock pins
            // (orca/node_modules moves with every Orca re-pin, and plugins/.user can be left from an
            // earlier build), through the shared licence-file reader rather than a fixed LICENSE.md name.
            it.text = [join(root, USER_PLUGINS_REL, extId, 'extension', 'node_modules', dep), join(root, 'orca', 'node_modules', dep)]
                .filter((d) => readIf(join(d, 'package.json')) !== null && readJson(join(d, 'package.json')).version === entry.version)
                .map((d) => licenceText(d)).find((t) => t !== null) ?? null;
            if (it.text !== null) it.text = `${it.text}\n`;
            if (it.text === null) {
                const own = readIf(join(extRoot, folder, 'LICENSE.md')) ?? '';
                const at = own.indexOf(`${EXT_QUOTE_HEADING}\n\n`);
                const end = at < 0 ? -1 : own.indexOf('\n\n## ', at + EXT_QUOTE_HEADING.length + 2);
                if (end < 0) throw new Fail(`no built or Orca copy of ${dep}'s LICENSE.md, and ${BUNDLED_EXT_DIR}/${folder}/LICENSE.md has no "${EXT_QUOTE_HEADING}" quote. Next step: run yarn build in theia/, then ${RERUN}`);
                it.text = own.slice(at + EXT_QUOTE_HEADING.length + 2, end + 1);
                console.log(`${NAME}: SKIP -- ${dep} licence text read from the quote in ${BUNDLED_EXT_DIR}/${folder}/LICENSE.md: no built plugins/.user or orca/node_modules copy at the locked version ${entry.version}`);
            }
            items.push(it);
        }
    }
    return items;
}

/** LICENSING.md's paragraph for the bundled extensions. */
function bundledParagraph(product, items) {
    const parts = items.map((it) => (it.kind === 'gecko-distribution'
        ? `${it.name} ${it.version} is pre-installed as an unmodified Gecko add-on (\`${it.bundle}\`) under ${it.licence}; its source is ${it.source}.`
        : `${it.name} ${it.version} is carried by the pre-installed Theia extension \`${it.bundle}\` under its own terms (${it.licence}), not under ${product}'s licence.`));
    return `${parts.join(' ')} The user can disable or remove each. Their licence texts are in the "Bundled extensions" section of [${NOTICES_REL}](${NOTICES_REL}).`;
}

/** The name@version entries an Orca section lists: the lines after each rule up to a blank line. */
export function orcaEntriesOf(sectionText) {
    const entries = new Set();
    const lines = sectionText.split('\n');
    for (let i = 0; i < lines.length; i++) {
        if (lines[i] !== RULE) continue;
        for (let j = i + 1; j < lines.length && lines[j] !== ''; j++) {
            const m = /^(@?[^@\s]+)@(\S+) \(/.exec(lines[j]);
            if (m) entries.add(`${m[1]}@${m[2]}`);
        }
    }
    return entries;
}

/** Both-ways set comparison of the derived Orca packages with a tracked Orca section. */
export function compareOrcaSets(packages, trackedSection) {
    const derived = new Set(packages.map((p) => `${p.name}@${p.version}`));
    const tracked = orcaEntriesOf(trackedSection ?? '');
    const out = [];
    for (const e of [...derived].sort()) if (!tracked.has(e)) out.push(`shipped but missing from the notices: ${e}. Next step: run: ${RERUN} --write-orca, then commit ${NOTICES_REL}.`);
    for (const e of [...tracked].sort()) if (!derived.has(e)) out.push(`in the Orca notices but not shipped: ${e}. Next step: run: ${RERUN} --write-orca, then commit ${NOTICES_REL}.`);
    return out;
}

/** The notices text with only its Orca section replaced. */
export function replaceOrcaSection(notices, sectionText) {
    const s = orcaSectionOf(notices);
    if (!s) throw new Fail(`${NOTICES_REL} has no "${ORCA_HEADING}" section to rewrite. Next step: run: ${RERUN}, then commit ${NOTICES_REL}.`);
    return notices.slice(0, s.start) + sectionText + notices.slice(s.end);
}

/**
 * THIRD-PARTY-NOTICES.txt text, sections Gecko, Theia, Orca, Bundled extensions, Node.
 * gecko: { tag, defines, text }; packages: theiaClosure() output; orca: the Orca section text
 * (renderOrcaSection) or undefined; bundled: renderBundledSection() text or undefined;
 * node: { version, url, member, text }.
 */
export function renderNotices({ gecko, packages, orca, bundled, node }) {
    const out = [
        'THIRD-PARTY NOTICES',
        '',
        'Generated by node scripts/generate-licensing.mjs; do not edit.',
        `Gecko source: Mozilla tag ${gecko.tag}; about:license preprocessed with ${gecko.defines.join(', ')}.`,
        '',
        '== Gecko (about:license) ==',
        '',
        gecko.text,
        '== Theia application dependencies ==',
        '',
        `The production dependency closure of ${APP_PACKAGE_REL}. Packages whose licence text is byte-identical share one block.`,
        '',
    ];
    for (const g of licenceGroups(packages)) out.push(RULE, ...g.names, '', g.body, '');
    out.push(RULE, '');
    if (orca !== undefined) out.push(orca.replace(/\n\n$/, ''), '');
    if (bundled !== undefined) out.push(bundled.replace(/\n\n$/, ''), '');
    out.push(nodeHeader(node.version), '', `From ${node.member} in ${node.url}.`, '', node.text.replace(/\n*$/, '\n'));
    return out.join('\n');
}

function renderLicensing(config, bundled = []) {
    const product = config.identity.display_name;
    const { license, copyright_holder: holder, trademark_notice: trademark } = config.legal;
    return [
        '# Licensing',
        '',
        `Generated by \`${RERUN}\` from \`configuration.toml\`; do not edit.`,
        '',
        `## ${product}`,
        '',
        `${product} is licensed under the ${license} license. The full text is in [LICENSE](LICENSE).`,
        '',
        `Copyright holder: ${holder}.`,
        '',
        trademark,
        '',
        '## Gecko',
        '',
        `The browser engine is Mozilla Gecko, used under the Mozilla Public License 2.0 (MPL-2.0) and the other licences listed in the Gecko section of [${NOTICES_REL}](${NOTICES_REL}). Its source is the Mozilla tag \`${config.upstreams.firefox_esr_tag}\` plus the patches in \`patches/\` in this repository.`,
        '',
        `The about:license text in that section opens with Mozilla's statement that the Mozilla Project made the binaries available. That statement does not describe ${product} binaries; replacing it is packaging work for a later phase.`,
        '',
        '## Theia application dependencies',
        '',
        `The Eclipse Theia framework and the other npm packages the application ships are listed with their licence texts in the "Theia application dependencies" section of [${NOTICES_REL}](${NOTICES_REL}).`,
        '',
        '## Orca',
        '',
        `The npm packages that Orca's orcad server, web client and mobile-web bundle ship are listed with their licence texts in the "Orca (orcad, web client, mobile-web)" section of [${NOTICES_REL}](${NOTICES_REL}). The Orca source is the pin named by the \`configuration.toml\` keys \`upstreams.orca_tag\` and \`upstreams.orca_commit\`. Orca's own copyright and permission notice (MIT) is quoted at the head of that section and ships in the package as \`orca/LICENSE\`; its text is pinned by digest in \`${LICENCE_ALLOWLIST_REL}\`.`,
        '',
        ...(bundled.length ? ['## Bundled extensions', '', bundledParagraph(product, bundled), ''] : []),
        '## Node.js runtime',
        '',
        `The bundled Node.js runtime's licence text is in the "Node.js runtime" section of [${NOTICES_REL}](${NOTICES_REL}).`,
        '',
    ].join('\n');
}

/** Name the first differing line, or return [] when equal. */
export function checkAgainst(trackedText, derivedText, rel) {
    if (trackedText === derivedText) return [];
    const t = trackedText.split('\n');
    const d = derivedText.split('\n');
    let i = 0;
    while (i < t.length && i < d.length && t[i] === d[i]) i++;
    const show = (l) => (l === undefined ? '(end of file)' : JSON.stringify(l.length > 160 ? `${l.slice(0, 160)}...` : l));
    return [`${rel} line ${i + 1} differs from its re-derivation: tracked ${show(t[i])}, derived ${show(d[i])}. Next step: run: ${RERUN}, then commit ${rel}.`];
}

// --- the run --------------------------------------------------------------------

/**
 * The Orca section: { text, packages } derived from the bundles, or { text } kept from the
 * tracked notices after one SKIP line when orca/ is not built. derive is a parameter so the
 * self-test can pass fixture package sets.
 */
async function orcaPart(trackedNotices, derive) {
    const r = await derive();
    if (r.skip) {
        console.log(`${NAME}: SKIP -- Orca section not re-derived: ${r.skip}`);
        return { text: orcaSectionOf(trackedNotices ?? '')?.text };
    }
    return { text: renderOrcaSection(r.packages, r.licence), packages: r.packages };
}

const deriveOrca = async () => {
    const r = await orcaShippedPackages({ repoRoot: REPO_ROOT, log: (l) => console.log(`${NAME}: ${l}`) });
    return r.skip ? r : { ...r, licence: orcaLicence(REPO_ROOT) };
};
const orcaSummary = (pk) => `${pk.length} packages in ${licenceGroups(pk).length} licence groups`;

/** --check-orca (write false) and --write-orca (write true): only the Orca section, only orca/. */
export async function runOrca(write, { noticesText, derive = deriveOrca } = {}) {
    const tracked = noticesText ?? (existsSync(join(REPO_ROOT, NOTICES_REL)) ? readFileSync(join(REPO_ROOT, NOTICES_REL), 'utf8') : '');
    const r = await derive();
    if (r.skip) {
        console.log(`${NAME}: SKIP -- Orca section not re-derived: ${r.skip}`);
        return { failures: [] };
    }
    const text = renderOrcaSection(r.packages, r.licence);
    if (write) {
        const next = replaceOrcaSection(tracked, text);
        if (noticesText === undefined && next !== tracked) writeAtomic(NOTICES_REL, next);
        console.log(`${NAME}: wrote the Orca section (${orcaSummary(r.packages)})`);
        return { failures: [], text: next };
    }
    const section = orcaSectionOf(tracked);
    if (!section) return { failures: [`${NOTICES_REL} has no "${ORCA_HEADING}" section. Next step: run: ${RERUN}, then commit ${NOTICES_REL}.`] };
    const failures = [...compareOrcaSets(r.packages, section.text), ...checkAgainst(section.text, text, `${NOTICES_REL} (Orca section)`)];
    if (failures.length === 0) console.log(`${NAME}: PASS -- the Orca section of ${NOTICES_REL} equals its re-derivation (${orcaSummary(r.packages)})`);
    return { failures };
}

async function run(check) {
    const { failures, config } = resolveConfig();
    if (failures.length > 0) throw new Fail(`configuration.toml does not resolve: ${failures.join('; ')}`);
    const html = preprocessGecko(join(REPO_ROOT, 'upstream'));
    const gecko = { tag: config.upstreams.firefox_esr_tag, defines: LINUX_LICENSE_DEFINES, text: htmlToText(html.toString('utf8')) };
    const packages = theiaClosure(join(REPO_ROOT, 'theia/node_modules'), join(REPO_ROOT, APP_PACKAGE_REL));
    const pin = readNodePin(join(REPO_ROOT, NODE_PIN_REL));
    const archivePath = join(REPO_ROOT, NODE_ARCHIVE_DIR, pin.archive);
    const noticesAbs = join(REPO_ROOT, NOTICES_REL);
    const trackedNotices = existsSync(noticesAbs) ? readFileSync(noticesAbs, 'utf8') : undefined;
    const out = [];
    const orca = await orcaPart(trackedNotices, deriveOrca);
    if (check && orca.packages) out.push(...compareOrcaSets(orca.packages, orcaSectionOf(trackedNotices ?? '')?.text));
    const bundled = bundledItems(REPO_ROOT, trackedNotices);

    let nodeText;
    if (!check) {
        if (!existsSync(archivePath)) await fetchArchive(pin, archivePath);
        verifyArchive(archivePath, pin);
        nodeText = extractNodeLicence(archivePath, pin);
    } else {
        out.push(...checkNodeHeader(trackedNotices ?? '', pin.version));
        if (existsSync(archivePath)) {
            verifyArchive(archivePath, pin);
            nodeText = extractNodeLicence(archivePath, pin);
        } else {
            console.log(`${NAME}: SKIP -- Node licence text not re-derived: ${NODE_ARCHIVE_DIR}/${pin.archive} is not cached (run ${RERUN} to fetch the pinned archive)`);
            nodeText = trackedNodeText(trackedNotices ?? '');
        }
    }

    const files = [
        [LICENSING_REL, renderLicensing(config, bundled)],
        [NOTICES_REL, renderNotices({ gecko, packages, orca: orca.text, bundled: bundled.length ? renderBundledSection(bundled) : undefined, node: { ...pin, text: nodeText } })],
    ];
    const summary = `${packages.length} Theia packages in ${licenceGroups(packages).length} licence groups, ${orca.packages ? `Orca ${orcaSummary(orca.packages)}` : 'Orca section kept'}, ${bundled.length} bundled extension item(s), Node.js runtime ${pin.version}`;
    if (!check) {
        for (const [rel, text] of files) writeAtomic(rel, text);
        console.log(`${NAME}: wrote ${files.map(([rel]) => rel).join(' and ')} (${summary})`);
        return [];
    }

    const built = join(REPO_ROOT, BUILT_LICENSE_REL);
    if (existsSync(built)) {
        if (!html.equals(readFileSync(built))) {
            out.push(`about:license preprocessed with ${LINUX_LICENSE_DEFINES.join(', ')} differs from the built ${BUILT_LICENSE_REL}: the Linux define set or the patch stack changed. Next step: compare the #ifdef names in upstream/toolkit/content/license.html with objdir/config.status and update LINUX_LICENSE_DEFINES in scripts/generate-licensing.mjs.`);
        }
    } else {
        console.log(`${NAME}: SKIP -- built about:license comparison: no objdir in this checkout`);
    }
    for (const [rel, text] of files) {
        const abs = join(REPO_ROOT, rel);
        if (!existsSync(abs)) out.push(`${rel} is absent. Next step: run: ${RERUN}, then commit ${rel}.`);
        else out.push(...checkAgainst(readFileSync(abs, 'utf8'), text, rel));
    }
    if (out.length === 0) console.log(`${NAME}: PASS -- ${files.map(([rel]) => rel).join(' and ')} equal their re-derivation (${summary})`);
    return out;
}

// Both texts are complete before either file is touched; each lands by rename.
function writeAtomic(rel, text) {
    const abs = join(REPO_ROOT, rel);
    const tmp = `${abs}.tmp-${process.pid}`;
    try {
        writeFileSync(tmp, text);
        renameSync(tmp, abs);
    } finally {
        rmSync(tmp, { force: true });
    }
}

// --- self-test -----------------------------------------------------------------

const MIT = 'MIT License\n\nCopyright (c) fixture\n\nPermission is hereby granted, free of charge.\n';

function writePkg(root, rel, pkg, licence) {
    const dir = join(root, rel);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg));
    if (licence !== undefined) writeFileSync(join(dir, 'LICENSE'), licence);
}

async function selfTest() {
    const tmp = mkdtempSync(join(tmpdir(), 'licensing-self-test-'));
    let misses = 0;
    const report = (ok, label) => {
        console.log(`${NAME}: --self-test ${ok ? 'PASS' : 'FAIL'} -- ${label}`);
        if (!ok) misses++;
    };
    const failOf = (fn) => {
        try {
            fn();
            return '';
        } catch (e) {
            if (!(e instanceof Fail)) throw e;
            return e.message;
        }
    };
    try {
        const nm = join(tmp, 'theia/node_modules');
        writePkg(nm, 'a', { name: 'a', version: '1.0.0', license: 'MIT' }, MIT);
        writePkg(nm, 'b', { name: 'b', version: '2.0.0', license: 'MIT' }, MIT);
        writePkg(nm, 'c', { name: 'c', version: '3.0.0', license: 'ISC' });
        writePkg(nm, 'f', { name: 'f', version: '4.0.0', license: 'MIT' }, MIT);
        writePkg(nm, 'dev-only', { name: 'dev-only', version: '5.0.0', license: 'MIT' }, MIT);
        writePkg(nm, '@powerbrowser/ext', { name: '@powerbrowser/ext', version: '0.1.0', dependencies: { b: '2.0.0' } });
        const app = (dir, dependencies) => {
            writePkg(tmp, `theia/applications/${dir}`, { name: 'fixture-app', version: '0.0.0', dependencies, devDependencies: { 'dev-only': '5.0.0' } });
            return join(tmp, `theia/applications/${dir}/package.json`);
        };
        const base = { a: '1.0.0', c: '3.0.0', '@powerbrowser/ext': '0.1.0' };
        const pinPath = join(tmp, 'node-runtime.json');
        const pinFor = (version) => {
            writeFileSync(pinPath, JSON.stringify({ 'linux-x64': { version, url: `https://nodejs.org/dist/${version}/node-${version}-linux-x64.tar.xz`, sha256: '0'.repeat(64) } }));
            return readNodePin(pinPath);
        };
        const html = '<html><head><title>x</title></head><body><p>A &amp; B&#8212;C<br>D</p></body></html>';
        const gecko = { tag: 'FIXTURE_TAG', defines: LINUX_LICENSE_DEFINES, text: htmlToText(html) };
        const node = { ...pinFor('v24.19.0'), text: 'Node.js fixture licence\n' };
        const render = (appJson) => renderNotices({ gecko, packages: theiaClosure(nm, appJson), node });

        // Green baseline: the closure, grouping and empty-licence handling.
        const baseApp = app('browser', base);
        const baseline = render(baseApp);
        const names = theiaClosure(nm, baseApp).map((p) => `${p.name}@${p.version}`).sort().join(' ');
        report(names === 'a@1.0.0 b@2.0.0 c@3.0.0', `closure is a, b (through @powerbrowser/ext), c; no devDependency, no @powerbrowser package (got ${names})`);
        report(baseline.includes(`${RULE}\na@1.0.0 (MIT)\nb@2.0.0 (MIT)\n\n${MIT.trimEnd()}\n`), 'byte-identical MIT texts render as one block naming a and b');
        report(baseline.includes(`${RULE}\nc@3.0.0 (ISC)\n\nLicense: ISC\n${NO_LICENCE_FILE}\n`), `c, with no licence file, is listed under ISC with "${NO_LICENCE_FILE}"`);
        report(baseline === render(baseApp), 'two renders are byte-identical');
        report(checkAgainst(baseline, baseline, NOTICES_REL).length === 0 && checkNodeHeader(baseline, 'v24.19.0').length === 0, 'baseline compares green against itself');
        report(gecko.text === 'A & B—C\nD\n', `htmlToText decodes &amp;, &#8212; and <br> (got ${JSON.stringify(gecko.text)})`);

        // Reds.
        const lines = baseline.split('\n');
        const n = lines.indexOf('Node.js fixture licence');
        lines[n] = 'Node.js tampered licence';
        const tampered = checkAgainst(lines.join('\n'), baseline, NOTICES_REL).join(' ');
        report(tampered.includes(`${NOTICES_REL} line ${n + 1}`), `a tampered notice line goes red naming ${NOTICES_REL} line ${n + 1}: ${tampered}`);
        const added = checkAgainst(baseline, render(app('browser-add', { ...base, f: '4.0.0' })), NOTICES_REL).join(' ');
        report(added.includes('f@4.0.0'), `a package added to the closure goes red naming it: ${added}`);
        const { c: _c, ...withoutC } = base;
        const removed = checkAgainst(baseline, render(app('browser-remove', withoutC)), NOTICES_REL).join(' ');
        report(removed.includes('c@3.0.0'), `a package removed from the closure goes red naming it: ${removed}`);
        const version = checkNodeHeader(baseline, pinFor('v99.0.0').version).join(' ');
        report(version.includes('v24.19.0') && version.includes('v99.0.0'), `a Node header version other than the pin goes red naming both: ${version}`);
        const missing = failOf(() => theiaClosure(nm, app('browser-missing', { ...base, 'not-installed': '1.0.0' })));
        report(missing.includes('not-installed'), `an unresolvable declared dependency goes red naming it: ${missing}`);
        const absent = failOf(() => theiaClosure(join(tmp, 'nowhere/node_modules'), baseApp));
        report(absent.includes('yarn install'), `an absent node_modules goes red with the install step: ${absent}`);

        // Orca: fixture package sets stand in for the bundle derivation.
        const op = (name, version, text = MIT) => ({ name, version, license: 'MIT', text, dir: `orca/node_modules/${name}`, shippedIn: ['orcad'] });
        const shipped = [op('o-one', '1.0.0'), op('o-two', '2.0.0', 'Other licence\n')];
        const ORCA_LIC = 'MIT License\n\nCopyright (c) 2026 Fixture Holder\n\nPermission fixture.';
        const withOrca = renderNotices({ gecko, packages: theiaClosure(nm, baseApp), orca: renderOrcaSection(shipped, ORCA_LIC), node });
        // packaging-prefs-network-02: Orca's own notice heads the section, and its absence is red.
        report(orcaSectionOf(withOrca).text.includes(`${ORCA_LICENCE_LEAD}\n\n${ORCA_LIC}\n\n`), "control: Orca's own licence is quoted after its lead line at the head of the Orca section");
        report(failOf(() => renderOrcaSection(shipped)).includes('orca/LICENSE'), "plant: an Orca section rendered without Orca's own licence is a Fail naming orca/LICENSE");
        const noNotice = withOrca.replace(`${ORCA_LIC}\n`, '');
        const noNoticeRed = (await runOrca(false, { noticesText: noNotice, derive: async () => ({ packages: shipped, licence: ORCA_LIC }) })).failures.join(' ');
        report(noNoticeRed.includes('Orca section'), `plant: tracked notices without Orca's own licence go red under --check-orca: ${noNoticeRed}`);
        const lroot = join(tmp, 'orca-licence-root');
        mkdirSync(join(lroot, 'orca'), { recursive: true });
        mkdirSync(join(lroot, 'inventory'), { recursive: true });
        writeFileSync(join(lroot, 'orca/LICENSE'), `${ORCA_LIC}\n`);
        const rowFor = (digest) => writeFileSync(join(lroot, LICENCE_ALLOWLIST_REL), JSON.stringify({ trees: [{ path: 'orca', licence_file: 'LICENSE', licence_file_sha256: digest }] }));
        rowFor(sha256(join(lroot, 'orca/LICENSE')));
        report(orcaLicence(lroot) === ORCA_LIC, 'control: orcaLicence reads orca/LICENSE when it hashes to the allowlist row');
        rowFor('0'.repeat(64));
        report(failOf(() => orcaLicence(lroot)).includes('hashes to'), 'plant: an orca/LICENSE that does not hash to the allowlist row is a Fail');
        const extra = compareOrcaSets([...shipped, op('o-new', '3.0.0')], orcaSectionOf(withOrca).text).join(' ');
        report(extra.includes('shipped but missing from the notices: o-new@3.0.0'), `plant: a shipped package absent from the Orca notices goes red naming it: ${extra}`);
        const gone = compareOrcaSets(shipped.slice(1), orcaSectionOf(withOrca).text).join(' ');
        report(gone.includes('in the Orca notices but not shipped: o-one@1.0.0'), `plant: an Orca notice for a package that does not ship goes red naming it: ${gone}`);
        const written = (await runOrca(true, { noticesText: withOrca, derive: async () => ({ packages: [...shipped, op('o-new', '3.0.0')], licence: ORCA_LIC }) })).text;
        const before = orcaSectionOf(withOrca);
        const after = orcaSectionOf(written);
        report(written.slice(0, after.start) === withOrca.slice(0, before.start) && written.slice(after.end) === withOrca.slice(before.end)
            && after.text.includes('o-new@3.0.0') && compareOrcaSets([...shipped, op('o-new', '3.0.0')], after.text).length === 0,
        'control: --write-orca on a fixture notices file changes only the Orca section bytes');
        report(withOrca.slice(0, withOrca.indexOf(ORCA_HEADING)) === baseline.slice(0, baseline.indexOf('== Node.js runtime')),
            'control: the Gecko and Theia sections render byte-identically through the shared licence grouping, with or without the Orca section');
        const skipped = await runOrca(false, { noticesText: withOrca, derive: async () => ({ skip: 'fixture' }) });
        report(skipped.failures.length === 0, 'control: no built orca/ is a SKIP, not a red');

        // Bundled extensions (BEXT-02): the section sits between Orca and Node, and the Orca-only modes leave it alone.
        const items = [
            { name: 'Fixture Add-on', version: '1.0.0', licence: 'GPL-3.0-or-later', carrier: 'Gecko distribution add-on fx@example.invalid, unmodified', source: 'https://example.invalid/fx/1.0.0', text: 'GPL fixture\n\nsecond paragraph\n' },
            { name: '@fixture/sdk', version: '2.0.0', licence: 'SEE LICENSE IN README.md', carrier: 'pre-installed Theia extension fixture.sdk', source: 'https://example.invalid/sdk-2.0.0.tgz', text: 'Fixture terms.\n' },
        ];
        const withBundled = renderNotices({ gecko, packages: theiaClosure(nm, baseApp), orca: renderOrcaSection(shipped, ORCA_LIC), bundled: renderBundledSection(items), node });
        const b = bundledSectionOf(withBundled);
        report(b && withBundled.indexOf(BUNDLED_HEADING) > withBundled.indexOf(ORCA_HEADING) && withBundled.slice(b.end).startsWith('== Node.js runtime'),
            'the Bundled extensions section sits after the Orca section and before the Node.js runtime section');
        report(!orcaSectionOf(withBundled).text.includes(BUNDLED_HEADING), 'the Orca section ends at the Bundled extensions heading');
        const rewritten = (await runOrca(true, { noticesText: withBundled, derive: async () => ({ packages: [...shipped, op('o-new', '3.0.0')], licence: ORCA_LIC }) })).text;
        report(bundledSectionOf(rewritten)?.text === b.text && rewritten.includes('o-new@3.0.0'), 'control: --write-orca leaves the Bundled extensions section byte-identical');
        report(items.every((it) => keptBundledText(withBundled, it) === it.text), 'control: each bundled item\'s kept text round-trips byte for byte');
        const bumped = keptBundledText(withBundled, { ...items[0], version: '1.0.1' });
        report(bumped === null, 'a bumped pin with no cached XPI finds no kept text (so the run fails naming it)');

        // 60-WR-02: a carried package's licence copy is read only at the version its lock pins.
        const broot = join(tmp, 'bundled-root');
        const ext = join(broot, BUNDLED_EXT_DIR, 'fx');
        mkdirSync(ext, { recursive: true });
        writeFileSync(join(ext, 'package.json'), JSON.stringify({ publisher: 'fixture', name: 'fx', dependencies: { dep: '1.0.0' } }));
        writeFileSync(join(ext, 'package-lock.json'), JSON.stringify({ packages: { 'node_modules/dep': { version: '1.0.0', resolved: 'https://example.invalid/dep-1.0.0.tgz', license: 'MIT' } } }));
        writeFileSync(join(ext, 'LICENSE.md'), `# fx\n\n${EXT_QUOTE_HEADING}\n\nQuoted 1.0.0 terms.\n\n## End\n`);
        writePkg(join(broot, 'orca/node_modules'), 'dep', { name: 'dep', version: '2.0.0' });
        writeFileSync(join(broot, 'orca/node_modules/dep/LICENSE'), 'Newer 2.0.0 terms.\n');
        const depText = () => bundledItems(broot, '').find((it) => it.name === 'dep')?.text;
        report(depText() === 'Quoted 1.0.0 terms.\n', `plant: an orca/node_modules copy at another version than the lock is not read (got ${JSON.stringify(depText())})`);
        writePkg(join(broot, 'orca/node_modules'), 'dep', { name: 'dep', version: '1.0.0' });
        report(depText() === 'Newer 2.0.0 terms.\n', `control: a copy at the locked version is read, from a file named LICENSE as well as LICENSE.md (got ${JSON.stringify(depText())})`);
    } finally {
        rmSync(tmp, { recursive: true, force: true });
    }
    console.log(`${NAME}: --self-test ${misses === 0 ? 'PASS' : `FAIL -- ${misses} case(s) missed`}`);
    return misses === 0 ? 0 : 1;
}

// Exported functions are importable without running the CLI (same guard as generate.mjs).
function isEntryPoint() {
    try {
        return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
    } catch {
        return false;
    }
}

if (isEntryPoint()) {
    const args = process.argv.slice(2);
    const MODES = ['--check', '--check-orca', '--write-orca', '--self-test'];
    for (const a of args) {
        if (!MODES.includes(a)) {
            console.error(`${NAME}: FAIL -- unknown argument '${a}'. Next step: run: ${RERUN}, or add one of ${MODES.join(', ')}.`);
            process.exit(2);
        }
    }
    if (args.includes('--self-test')) process.exit(await selfTest());
    try {
        const orcaOnly = args.includes('--check-orca') || args.includes('--write-orca');
        const failures = orcaOnly ? (await runOrca(args.includes('--write-orca'))).failures : await run(args.includes('--check'));
        for (const f of failures) console.error(`${NAME}: FAIL -- ${f}`);
        process.exit(failures.length > 0 ? 1 : 0);
    } catch (e) {
        // A derivation failure (orca-shipped-packages throws Error) is a named red, not a crash.
        console.error(`${NAME}: FAIL -- ${e.message}`);
        if (!(e instanceof Fail) && process.env.LICENSING_DEBUG) console.error(e.stack);
        process.exit(1);
    }
}
