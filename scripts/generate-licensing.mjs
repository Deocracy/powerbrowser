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
//
// Modes:
//   node scripts/generate-licensing.mjs              write both files (temp file + rename each);
//                                                    fetches the pinned Node archive if not cached
//   node scripts/generate-licensing.mjs --check      re-derive both in memory; fail naming the
//                                                    file and first differing line on any drift
//   node scripts/generate-licensing.mjs --self-test  hermetic fixtures in a temp dir
//
// --check runs python over upstream/ and reads files. It runs no build, no
// browser, no display and never uses the network: without a cached Node
// archive it still asserts the Node version and prints one SKIP line for the
// Node text alone.

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
    copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync,
    renameSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveConfig } from './generate.mjs';

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

const LICENCE_FILE = /^(licen[cs]e|copying|notice)/i;

function readJson(path) {
    return JSON.parse(readFileSync(path, 'utf8'));
}

function licenseField(pkg) {
    const l = pkg.license ?? pkg.licenses;
    if (typeof l === 'string') return l;
    if (Array.isArray(l)) return l.map((x) => (typeof x === 'string' ? x : x?.type)).filter(Boolean).join(' OR ') || 'no license field';
    if (typeof l?.type === 'string') return l.type;
    return 'no license field';
}

// Licence, copying and notice files in the package root, in code-unit order, concatenated.
function licenceText(dir) {
    const texts = readdirSync(dir)
        .filter((f) => LICENCE_FILE.test(f) && statSync(join(dir, f)).isFile())
        .sort()
        .map((f) => readFileSync(join(dir, f), 'utf8').replace(/\r\n?/g, '\n').trimEnd())
        .filter((t) => t !== '');
    return texts.length > 0 ? texts.join('\n\n') : null;
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
// by its license field. Names and groups are in code-unit order.
function theiaGroups(packages) {
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

function readNodePin(path) {
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

function verifyArchive(path, pin) {
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
async function fetchArchive(pin, archivePath) {
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

/**
 * THIRD-PARTY-NOTICES.txt text, sections Gecko, Theia, Node.
 * gecko: { tag, defines, text }; packages: theiaClosure() output; node: { version, url, member, text }.
 */
export function renderNotices({ gecko, packages, node }) {
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
    for (const g of theiaGroups(packages)) out.push(RULE, ...g.names, '', g.body, '');
    out.push(RULE, '', nodeHeader(node.version), '', `From ${node.member} in ${node.url}.`, '', node.text.replace(/\n*$/, '\n'));
    return out.join('\n');
}

function renderLicensing(config) {
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
        [LICENSING_REL, renderLicensing(config)],
        [NOTICES_REL, renderNotices({ gecko, packages, node: { ...pin, text: nodeText } })],
    ];
    const summary = `${packages.length} Theia packages in ${theiaGroups(packages).length} licence groups, Node.js runtime ${pin.version}`;
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

function selfTest() {
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
    for (const a of args) {
        if (a !== '--check' && a !== '--self-test') {
            console.error(`${NAME}: FAIL -- unknown argument '${a}'. Next step: run: ${RERUN}, or add --check or --self-test.`);
            process.exit(2);
        }
    }
    if (args.includes('--self-test')) process.exit(selfTest());
    try {
        const failures = await run(args.includes('--check'));
        for (const f of failures) console.error(`${NAME}: FAIL -- ${f}`);
        process.exit(failures.length > 0 ? 1 : 0);
    } catch (e) {
        if (!(e instanceof Fail)) throw e;
        console.error(`${NAME}: FAIL -- ${e.message}`);
        process.exit(1);
    }
}
