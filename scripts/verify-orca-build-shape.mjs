#!/usr/bin/env node
// scripts/verify-orca-build-shape.mjs
//
// The orca-build-shape gate (Phase 60, RUN-01/RUN-02, P59-05, P59-11): a built
// orca/ carries no bundled-Node slot, no second Node runtime and no Electron,
// and Orca's tracked files differ from the pin in exactly the declared seams
// of orca-overlay/seams.json (P62-09, P62-10). scripts/build-orca.sh applies
// the overlay and de-slots after build:orcad (D-14); this check proves the
// result from the tree.
//
// Derived at check time, never hand-kept:
//  a. the slot marker filenames, read from the three *_FILENAME string
//     constants named in MARKER_CONSTANTS in orca/src/shared/orcad-artifacts.ts.
//     Fewer than three derived is a FAIL naming the file (the source moved).
//  b. every regular file named node or node.exe under orca/out (symlinks are
//     not followed), reported with its sha256. Expected count: zero. The one
//     Node that runs orcad is PowerBrowser's, launched by 60-03's probe.
//  c. every Electron payload under orca/, node_modules included: a regular
//     file named electron or electron.exe whose first bytes are an ELF or PE
//     header, or a node_modules/electron/dist directory. pnpm's .bin/electron
//     shell shims and scoped packages such as @x/electron/dist are not Electron
//     binaries and stay green (60-02 deviation: the plan's bare-name rule
//     matched the shims).
//  d. the modified tracked paths, from git -C orca status --porcelain
//     --untracked-files=no (last field of each line), compared as a set with
//     the declared seam paths read from orca-overlay/seams.json (absent file:
//     none).
//  e. each declared seam's content (harness-static-structure-05): `git hash-object`
//     of the file equals the blob that applying the seam's patch to the recorded
//     upstream_blob gives, derived at check time (scripts/lib/orca-seams.mjs). A
//     seam rewritten to other content after the overlay applied keeps its status
//     line and is red here.
//  f. the untracked AND ignored files of orca/ (git status --untracked-files=all
//     --ignored, with no global excludes file) equal the files of orca-overlay/files/
//     plus .pb-overlay-copied, as a set: an addition the overlay does not declare is
//     red, a declared file missing from orca/ is red, and a declared file whose
//     bytes differ from the overlay's is red. An ignore rule hides nothing: Orca's own
//     .gitignore ignores src/**/*.js, and Vite resolves a .js before its .ts, so an
//     ignored stray beside a source file is the case this clause exists for. Exempt, by
//     explicit rule and nothing else: out/ (the build output), node_modules/ at any
//     depth, .cache/, *.tsbuildinfo, src/packages/*/dist/ (the workspace packages' own
//     tsc output) and *.generated.ts (Orca's generated sources).
// Red on: a derived marker in out/orcad, out/runtimes present, any node
// executable under out/, any Electron payload, a modified tracked file that is
// not a declared seam, a declared seam that is not applied or holds other
// content than its patch gives, an undeclared untracked file. Ignored files
// (out/, node_modules/) are not covered by e or f; b and c walk them.
//
// No built orca/ (orca/out/orcad/orcad.js absent): one SKIP line and exit 77
// (SKIP-PROTOCOL.md), never a pass.
// Tier: full (walks orca/node_modules). The self-test is --quick: it runs on a
// mkdtemp fixture whose constants carry synthetic names, so a pass proves the
// marker names were derived rather than written here.
//
// Usage:
//   node scripts/verify-orca-build-shape.mjs
//   node scripts/verify-orca-build-shape.mjs --self-test

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
    closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readSync, readdirSync, realpathSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fixtureGitArgs, fixtureGitEnv, withHostileGitConfig } from './lib/fixture-git.mjs';
import { readSeamRows, seamContentFails } from './lib/orca-seams.mjs';
import { SKIP_EXIT, skipLine } from './lib/skip-verdict.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'orca-build-shape';
const ARTIFACTS_REL = 'src/shared/orcad-artifacts.ts';
const MARKER_CONSTANTS = ['ORCAD_SERVER_TARGET_FILENAME', 'ORCAD_NODE_RUNTIME_MARKER_FILENAME', 'ORCAD_VERSION_FILENAME'];
export const NODE_NAMES = new Set(['node', 'node.exe']);
const ELECTRON_NAMES = new Set(['electron', 'electron.exe']);
const ELF = Buffer.from([0x7f, 0x45, 0x4c, 0x46]);
const PE = Buffer.from('MZ');

function deriveMarkers(orcaRoot) {
    let text = '';
    try { text = readFileSync(join(orcaRoot, ARTIFACTS_REL), 'utf8'); } catch { /* every constant counts as missing */ }
    const names = {};
    const missing = [];
    for (const c of MARKER_CONSTANTS) {
        const m = text.match(new RegExp(`^export const ${c} = ['"]([^'"\\n]+)['"]`, 'm'));
        if (m) names[c] = m[1]; else missing.push(c);
    }
    return { names, missing };
}

function isNativeBinary(path) {
    const buf = Buffer.alloc(4);
    let fd;
    try {
        fd = openSync(path, 'r');
        const n = readSync(fd, buf, 0, 4, 0);
        return (n >= 4 && buf.equals(ELF)) || (n >= 2 && buf.subarray(0, 2).equals(PE));
    } catch {
        return false;
    } finally {
        if (fd !== undefined) closeSync(fd);
    }
}

// Depth-first over real directories; symlinks are neither followed nor reported.
// Exported for 60-03's orca-slotless-start, which counts node executables under orca/out the same way.
export function walk(root, visit, skipTop = new Set()) {
    const stack = [root];
    while (stack.length) {
        const dir = stack.pop();
        let entries;
        try { entries = readdirSync(dir, { withFileTypes: true }); } catch { continue; }
        for (const e of entries) {
            if (dir === root && skipTop.has(e.name)) continue;
            const p = join(dir, e.name);
            if (e.isDirectory()) { visit(p, 'dir'); stack.push(p); } else if (e.isFile()) visit(p, 'file');
        }
    }
}

function sha256(path) {
    return createHash('sha256').update(readFileSync(path)).digest('hex');
}

// The ignored build outputs clause f exempts, by explicit rule (see the header). Anything else ignored is a stray.
const BUILD_OUTPUT = [/^out\//, /(^|\/)node_modules\//, /^\.cache\//, /\.tsbuildinfo$/, /^src\/packages\/[^/]+\/dist\//, /\.generated\.ts$/];

// Every regular file under root, as slash-separated relative paths.
function listAll(root) {
    const out = [];
    walk(root, (p, kind) => { if (kind === 'file') out.push(relative(root, p).split('\\').join('/')); });
    return out.sort();
}

// extra: { overlayDir } turns on clauses e and f (seam content, untracked files) against that overlay.
export function check(orcaRoot, seamPaths = [], extra = {}) {
    const outDir = join(orcaRoot, 'out');
    if (!existsSync(join(outDir, 'orcad', 'orcad.js'))) {
        return { skip: 'no built orca/ (run nix develop .#orca --command bash scripts/build-orca.sh)', fails: [] };
    }
    const fails = [];
    const rel = (p) => relative(orcaRoot, p);

    const { names, missing } = deriveMarkers(orcaRoot);
    if (missing.length) {
        fails.push(`${ARTIFACTS_REL}: derived ${MARKER_CONSTANTS.length - missing.length} of ${MARKER_CONSTANTS.length} slot marker names; missing ${missing.join(', ')} (the source moved)`);
    }
    let markers = 0;
    for (const [c, n] of Object.entries(names)) {
        if (existsSync(join(outDir, 'orcad', n))) { markers++; fails.push(`slot marker out/orcad/${n} present (${c})`); }
    }
    if (existsSync(join(outDir, 'runtimes'))) fails.push('out/runtimes present (build:orcad\'s bundled Node directory was not removed)');

    let nodes = 0;
    walk(outDir, (p, kind) => {
        if (kind === 'file' && NODE_NAMES.has(basename(p))) { nodes++; fails.push(`Node runtime ${rel(p)} (sha256 ${sha256(p)})`); }
    });

    let electrons = 0;
    walk(orcaRoot, (p, kind) => {
        if (kind === 'file' && ELECTRON_NAMES.has(basename(p)) && isNativeBinary(p)) {
            electrons++; fails.push(`Electron binary ${rel(p)}`);
        } else if (kind === 'dir' && basename(p) === 'dist' && basename(dirname(p)) === 'electron'
            && basename(dirname(dirname(p))) === 'node_modules') {
            electrons++; fails.push(`Electron distribution ${rel(p)}/ (node_modules/electron/dist)`);
        }
    }, new Set(['.git']));

    let modified = 0;
    try {
        const status = execFileSync('git', ['-C', orcaRoot, 'status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' });
        const seen = new Set();
        for (const line of status.split('\n').filter(Boolean)) {
            const path = line.trim().split(/\s+/).pop();
            seen.add(path);
            if (seamPaths.includes(path)) modified++; else fails.push(`modified tracked file in orca/: ${line.trim()}`);
        }
        for (const path of seamPaths) {
            if (!seen.has(path)) fails.push(`seam not applied: ${path} (the build predates the overlay; run nix develop .#orca --command bash scripts/build-orca.sh)`);
        }
    } catch (err) {
        fails.push(`git -C orca status failed: ${err.message.split('\n')[0]}`);
    }

    // e, f. the seams' content and the undeclared untracked files, against the overlay.
    let content = 0;
    let untracked = 0;
    if (extra.overlayDir) {
        fails.push(...seamContentFails({ orcaDir: orcaRoot, overlayDir: extra.overlayDir }));
        content = (readSeamRows(extra.overlayDir) ?? []).length;
        try {
            const status = execFileSync('git', ['-c', 'core.excludesFile=/dev/null', '-C', orcaRoot, 'status', '--porcelain', '--untracked-files=all', '--ignored'], { encoding: 'utf8', env: fixtureGitEnv(), maxBuffer: 256 * 1024 * 1024 });
            const overlayFiles = listAll(join(extra.overlayDir, 'files'));
            const declared = new Set([...overlayFiles, '.pb-overlay-copied']);
            for (const line of status.split('\n').filter((l) => l.startsWith('?? ') || l.startsWith('!! '))) {
                const path = line.slice(3);
                if (declared.has(path)) untracked++;
                else if (line.startsWith('!! ') && BUILD_OUTPUT.some((re) => re.test(path))) continue;
                else fails.push(`${line.startsWith('!! ') ? 'ignored' : 'untracked'} file in orca/ that orca-overlay/files/ does not declare: ${path}`);
            }
            // The other direction: every declared file is in orca/, byte-equal to the overlay's.
            for (const rel of overlayFiles) {
                const there = join(orcaRoot, rel);
                if (!existsSync(there)) fails.push(`declared overlay file ${rel} is missing from orca/ (run scripts/build-orca.sh)`);
                else if (!readFileSync(there).equals(readFileSync(join(extra.overlayDir, 'files', rel)))) fails.push(`orca/${rel} differs from orca-overlay/files/${rel} (run scripts/build-orca.sh)`);
            }
        } catch (err) {
            fails.push(`git -C orca status --untracked-files=all failed: ${err.message.split('\n')[0]}`);
        }
    }
    return { fails, counts: { markers, nodes, electrons, modified, content, untracked }, names, seamPaths };
}

function render(r) {
    if (r.skip) return { code: SKIP_EXIT, lines: [skipLine(NAME, r.skip)] };
    if (r.fails.length) return { code: 1, lines: r.fails.map((f) => `${NAME}: FAIL -- ${f}`) };
    const c = r.counts;
    return {
        code: 0,
        lines: [`${NAME}: PASS -- ${c.markers} slot markers, ${c.nodes} Node runtimes in out/, ${c.electrons} Electron binaries, ${c.modified} modified tracked file(s) (${c.content} seam(s) holding their patch result, ${c.untracked} declared untracked file(s)), equal to the declared seams of orca-overlay/seams.json${r.seamPaths.length ? ` (${r.seamPaths.join(', ')})` : ''} (markers derived from orca/${ARTIFACTS_REL}: ${Object.values(r.names).join(', ')})`],
    };
}

function runSelfTest() {
    // Every fixture commit runs under a global git config that fails signing and hooks (harness-static-structure-11).
    return withHostileGitConfig(runSelfTestBody);
}

function runSelfTestBody() {
    const tmp = mkdtempSync(join(tmpdir(), `${NAME}-`));
    const root = join(tmp, 'orca');
    const put = (relPath, body) => { mkdirSync(dirname(join(root, relPath)), { recursive: true }); writeFileSync(join(root, relPath), body); };
    const git = (...a) => execFileSync('git', [...fixtureGitArgs(), '-C', root, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: fixtureGitEnv() });
    const elf = Buffer.concat([ELF, Buffer.alloc(60)]);
    const constants = [
        "export const ORCAD_SERVER_TARGET_FILENAME = '.fixture-target'",
        "export const ORCAD_NODE_RUNTIME_MARKER_FILENAME = '.fixture-runtime'",
        "export const ORCAD_VERSION_FILENAME = '.fixture-version'",
    ];
    try {
        mkdirSync(root, { recursive: true });
        git('init', '-q');
        put(ARTIFACTS_REL, `${constants.join('\n')}\n`);
        put('package.json', '{ "name": "fixture" }\n');
        put('.gitignore', '/out/\n/node_modules/\nsrc/**/*.js\nsrc/packages/*/dist/\n*.generated.ts\n');
        git('add', '.');
        git('-c', 'user.name=fixture', '-c', 'user.email=fixture@invalid', 'commit', '-q', '-m', 'fixture');

        const skip = check(root);
        if (!skip.skip || render(skip).code !== SKIP_EXIT || !render(skip).lines[0].startsWith(`${NAME}: SKIP -- `)) { console.error(`${NAME} self-test: FAIL -- a fixture with no out/orcad/orcad.js did not render exit ${SKIP_EXIT} with a SKIP line`); return 1; }
        console.log(`${NAME} self-test: control (no built tree) SKIPs with exit ${SKIP_EXIT}`);

        put('out/orcad/orcad.js', '// fixture\n');
        // Must stay green: pnpm's shell shim and a scoped package's dist named electron/dist.
        put('node_modules/.bin/electron', '#!/bin/sh\nexec node "$0/../electron/cli.js" "$@"\n');
        put('node_modules/@scope/electron/dist/index.js', 'module.exports = {}\n');
        const base = check(root);
        if (base.skip || base.fails.length) {
            console.error(`${NAME} self-test: FAIL -- the clean fixture is not green: ${base.skip ?? base.fails.join(' | ')}`);
            return 1;
        }
        console.log(`${NAME} self-test: clean control green (synthetic markers, .bin/electron shim, @scope/electron/dist)`);

        const plantFile = (relPath, body) => () => { put(relPath, body); return () => rmSync(join(root, relPath), { force: true }); };
        const plantTree = (relPath, body, top) => () => { put(relPath, body); return () => rmSync(join(root, top), { recursive: true, force: true }); };
        const editTracked = (relPath, body) => () => { writeFileSync(join(root, relPath), body); return () => git('checkout', '--', relPath); };
        // Must stay green: a declared seam that is modified is the one difference the pin allows.
        const undoSeam = editTracked('package.json', '{ "name": "seam" }\n')();
        const seamed = check(root, ['package.json']);
        undoSeam();
        if (seamed.fails.length || seamed.counts.modified !== 1) {
            console.error(`${NAME} self-test: FAIL -- control declared-seam-modified is not green: ${seamed.fails.join(' | ')}`);
            return 1;
        }
        console.log(`${NAME} self-test: control declared-seam-modified green (package.json declared and modified)`);

        // A fixture overlay: one seam whose patch is a real diff of package.json, and one PB-added file (clauses e and f).
        const overlay = join(tmp, 'orca-overlay');
        const SEAMED = '{ "name": "seam" }\n';
        const seamBlob = git('rev-parse', 'HEAD:package.json').trim();
        const undoDiff = editTracked('package.json', SEAMED)();
        const patchText = git('diff', '--no-color', '--', 'package.json');
        undoDiff();
        mkdirSync(join(overlay, 'patches'), { recursive: true });
        writeFileSync(join(overlay, 'patches', '010-fixture.patch'), patchText);
        writeFileSync(join(overlay, 'seams.json'), `${JSON.stringify({ seams: [{ path: 'package.json', patch: 'patches/010-fixture.patch', upstream_blob: seamBlob, reason: 'fixture', upstream: { class: 'pb-only', pr: null } }] })}\n`);
        mkdirSync(join(overlay, 'files', 'pbx'), { recursive: true });
        writeFileSync(join(overlay, 'files', 'pbx', 'added.ts'), 'export const a = 1\n');
        const applyOverlay = () => { put('package.json', SEAMED); put('pbx/added.ts', 'export const a = 1\n'); put('.pb-overlay-copied', 'pbx/added.ts\n'); };
        const undoOverlay = () => { git('checkout', '--', 'package.json'); rmSync(join(root, 'pbx'), { recursive: true, force: true }); rmSync(join(root, '.pb-overlay-copied'), { force: true }); };
        applyOverlay();
        const withOverlay = check(root, ['package.json'], { overlayDir: overlay });
        undoOverlay();
        if (withOverlay.fails.length || withOverlay.counts.content !== 1 || withOverlay.counts.untracked !== 2) {
            console.error(`${NAME} self-test: FAIL -- control overlay-applied is not green: ${withOverlay.fails.join(' | ')}`);
            return 1;
        }
        console.log(`${NAME} self-test: control overlay-applied green (the seam holds its patch result, the PB-added file and .pb-overlay-copied are declared)`);
        // Ignored build outputs stay green: a workspace package's dist and a generated source.
        applyOverlay();
        put('src/packages/p/dist/y.js', 'export {}\n');
        put('src/gen.generated.ts', 'export {}\n');
        const withOutputs = check(root, ['package.json'], { overlayDir: overlay });
        rmSync(join(root, 'src/packages'), { recursive: true, force: true });
        rmSync(join(root, 'src/gen.generated.ts'), { force: true });
        undoOverlay();
        if (withOutputs.fails.length) { console.error(`${NAME} self-test: FAIL -- ignored build outputs (src/packages/*/dist, *.generated.ts) are not exempt: ${withOutputs.fails.join(' | ')}`); return 1; }
        console.log(`${NAME} self-test: control ignored build outputs green (src/packages/p/dist, *.generated.ts)`);

        const hex = 'a'.repeat(64);
        const plants = [
            { name: 'marker-slot-target', naming: '.fixture-target', apply: plantFile('out/orcad/.fixture-target', 'linux-x64\n') },
            { name: 'marker-node-runtime', naming: '.fixture-runtime', apply: plantFile('out/orcad/.fixture-runtime', 'node\n') },
            { name: 'marker-version', naming: '.fixture-version', apply: plantFile('out/orcad/.fixture-version', '0.0.0\n') },
            { name: 'runtimes-node', naming: 'out/runtimes', apply: plantTree(`out/runtimes/node-${hex}/bin/node`, elf, 'out/runtimes') },
            { name: 'stray-node-in-orcad', naming: 'out/orcad/node', apply: plantFile('out/orcad/node', elf) },
            { name: 'electron-dist', naming: 'node_modules/electron/dist', apply: plantTree('node_modules/electron/dist/version', '43.0.0\n', 'node_modules/electron') },
            { name: 'electron-elf', naming: 'Electron binary', apply: plantTree('node_modules/.pnpm/electron@0.0.0/node_modules/electron/electron', elf, 'node_modules/.pnpm') },
            { name: 'modified-tracked-file', naming: 'modified tracked file in orca/: M package.json', apply: editTracked('package.json', '{ "name": "drifted" }\n') },
            { name: 'seam-not-applied', naming: 'seam not applied: package.json', seams: ['package.json'], apply: () => () => {} },
            { name: 'marker-constant-removed', naming: 'ORCAD_VERSION_FILENAME', apply: editTracked(ARTIFACTS_REL, `${constants.slice(0, 2).join('\n')}\n`) },
            // Clauses e and f: the status lines are the ones the overlay allows, only the content or the extra file differs.
            { name: 'seam-rewritten-to-other-content', naming: `seam package.json holds blob`, seams: ['package.json'], extra: { overlayDir: overlay }, apply: () => { applyOverlay(); put('package.json', '{ "name": "rewritten by a postinstall" }\n'); return undoOverlay; } },
            { name: 'seam-rewritten-to-the-pinned-content', naming: 'seam package.json holds blob', seams: ['package.json'], extra: { overlayDir: overlay }, apply: () => { applyOverlay(); git('checkout', '--', 'package.json'); put('package.json', '{ "name": "fixture" }\n'); return undoOverlay; } },
            { name: 'undeclared-untracked-file', naming: 'untracked file in orca/ that orca-overlay/files/ does not declare: pbx/stray.js', seams: ['package.json'], extra: { overlayDir: overlay }, apply: () => { applyOverlay(); put('pbx/stray.js', 'export {}\n'); return undoOverlay; } },
            // Clause f both ways, and under an ignore rule: the fixture's .gitignore ignores src/**/*.js like Orca's does.
            { name: 'ignored-stray-js-beside-a-source-file', naming: 'ignored file in orca/ that orca-overlay/files/ does not declare: src/main/x.js', seams: ['package.json'], extra: { overlayDir: overlay }, apply: () => { applyOverlay(); put('src/main/x.ts', 'export {}\n'); put('src/main/x.js', 'export {}\n'); return () => { undoOverlay(); rmSync(join(root, 'src/main'), { recursive: true, force: true }); }; } },
            { name: 'declared-overlay-file-missing', naming: 'declared overlay file pbx/added.ts is missing from orca/', seams: ['package.json'], extra: { overlayDir: overlay }, apply: () => { applyOverlay(); rmSync(join(root, 'pbx/added.ts')); return undoOverlay; } },
            { name: 'declared-overlay-file-edited', naming: 'orca/pbx/added.ts differs from orca-overlay/files/pbx/added.ts', seams: ['package.json'], extra: { overlayDir: overlay }, apply: () => { applyOverlay(); put('pbx/added.ts', 'export const a = 2\n'); return undoOverlay; } },
            { name: 'overlay-patch-missing', naming: 'patches/010-fixture.patch of seam package.json is absent', seams: ['package.json'], extra: { overlayDir: overlay }, apply: () => { applyOverlay(); rmSync(join(overlay, 'patches', '010-fixture.patch')); return () => { undoOverlay(); writeFileSync(join(overlay, 'patches', '010-fixture.patch'), patchText); }; } },
        ];

        let failures = 0;
        for (const p of plants) {
            const undo = p.apply();
            try {
                const r = check(root, p.seams ?? [], p.extra ?? {});
                const text = r.fails.join('\n');
                if (r.skip || !r.fails.length) {
                    console.error(`  FAIL ${p.name} -> stayed ${r.skip ? 'SKIP' : 'green'}`); failures++;
                } else if (!text.includes(p.naming)) {
                    console.error(`  FAIL ${p.name} -> red, but not naming '${p.naming}': ${text}`); failures++;
                } else {
                    console.log(`  ok ${p.name} -> red, naming '${p.naming}'`);
                }
            } finally {
                undo();
            }
            const after = check(root, [], {});
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

// The CLI below runs only when this file is the entry point, so 60-03's probe can import walk.
const isEntryPoint = (() => {
    try { return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();
const args = isEntryPoint ? process.argv.slice(2) : [];
const unknown = args.filter((a) => a !== '--self-test');
if (unknown.length) {
    console.error(`${NAME}: unknown argument ${unknown[0]} (usage: node scripts/verify-orca-build-shape.mjs [--self-test])`);
    process.exit(2);
}
if (isEntryPoint) {
    if (args.includes('--self-test')) process.exit(runSelfTest());
    const seamsFile = join(REPO_ROOT, 'orca-overlay', 'seams.json');
    const seamPaths = existsSync(seamsFile) ? JSON.parse(readFileSync(seamsFile, 'utf8')).seams.map((s) => s.path) : [];
    const { code, lines } = render(check(join(REPO_ROOT, 'orca'), seamPaths, { overlayDir: join(REPO_ROOT, 'orca-overlay') }));
    for (const l of lines) (code ? console.error : console.log)(l);
    process.exit(code);
}
