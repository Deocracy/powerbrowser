#!/usr/bin/env node
// scripts/verify-orca-pane-entry.mjs
//
// orca-pane-entry (Phase 64, TAB-04, TAB-06, TERM-01; P64-08, P64-09, P64-25, P64-31, D-29;
// 64-RESEARCH A2, A4): the build gate of the Orca pane bundle. Every clause is derived at check
// time from the tree and compared, never from a hand-kept list:
//   a. the build ran (orca/out/web/assets/pb-panes/pb-panes.js), else one SKIP naming build-orca.sh;
//   b. orca/'s tracked status equals the baseline build-orca-panes.sh recorded before it built
//      (.mozbuild/orca-panes/tracked-baseline.txt: the staged seam paths, not an empty status);
//   c. React: the marker rendererPackageName is in 1 or more .js files of the React-bundled
//      standalone variant (the detector, built on demand, judged first) and in none under pb-panes/;
//   d. when theia/node_modules/react exists, Orca's React resolved by orca/pnpm-lock.yaml has its
//      major.minor (while Theia is not installed this clause alone prints a SKIP; the orca-panes
//      loader's run-time reactIdentity check still guards the document);
//   e. no font, wasm or image file that Orca's own build:web emitted under out/web/assets is inlined
//      as a data: URL in pb-panes/ unless build:web inlines it too (names from the directory listing,
//      matched by the base64 of each file's first 48 bytes);
//   f. the entry's own import specifiers, and those of every overlay file it imports, reach nothing
//      under components/tab-bar/, not TabGroupPanel, and no client-side terminal creation
//      (terminal-tab-create, createNewTerminalTab, createWebRuntimeSessionTerminal; A4);
//   g. the entry's value exports equal the C3 bundle API exactly (TypeScript parse with
//      theia/node_modules/typescript; a SKIP for f and g when Theia is not installed).
//
// Tier: full; --self-test quick (mkdtemp fixtures: a tracked edit, a planted React copy, a version
// skew, an inlined font, a tab-bar import, a missing C3 export, each red naming it).
//
// Usage:
//   node scripts/verify-orca-pane-entry.mjs
//   node scripts/verify-orca-pane-entry.mjs --self-test

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'orca-pane-entry';
const SELF = fileURLToPath(import.meta.url);
export const ENTRY_REL = 'src/renderer/src/pb/pb-pane-mount.tsx';
export const C3_EXPORTS = ['bootstrap', 'subscribePanes', 'mountPane', 'closePane', 'createTerminal', 'createChat', 'openPane',
    'activeWorktree', 'setActiveWorktree', 'state', 'reactIdentity', 'PB_OVERLAY_BUILD'];
const REACT_MARKER = 'rendererPackageName';
const ASSET_RE = /\.(ttf|otf|woff2?|eot|wasm|png|jpe?g|gif|webp|avif|ico|svg)$/i;
const FORBIDDEN_IMPORT = [
    [/(^|\/)components\/tab-bar\//, 'components/tab-bar/'],
    [/(^|\/)TabGroupPanel(\.tsx?)?$/, 'TabGroupPanel'],
    [/(^|\/)terminal-tab-create(\.ts)?$/, 'client-side terminal creation (terminal-tab-create)'],
];
const FORBIDDEN_NAMES = ['TabGroupPanel', 'createNewTerminalTab', 'createWebRuntimeSessionTerminal'];

function listFiles(dir) {
    if (!existsSync(dir)) return [];
    const out = [];
    const walk = d => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else out.push(p); } };
    walk(dir);
    return out.sort();
}

/** The react version orca/pnpm-lock.yaml resolves for the root importer (any YAML document of it; pnpm 12 writes two). */
export function lockReactVersion(lockText) {
    const lines = lockText.split('\n');
    let inImporters = false, inRoot = false;
    for (let i = 0; i < lines.length; i += 1) {
        const l = lines[i];
        if (/^importers:/.test(l)) { inImporters = true; inRoot = false; continue; }
        if (/^\S/.test(l)) { inImporters = false; inRoot = false; continue; }
        if (inImporters && /^ {2}\S/.test(l)) inRoot = /^ {2}\.:\s*$/.test(l);
        if (inRoot && /^ {6}react:\s*$/.test(l)) {
            for (let j = i + 1; j < Math.min(i + 4, lines.length); j += 1) {
                const m = /^ {8}version:\s*'?(\d+\.\d+\.\d+)/.exec(lines[j]);
                if (m) return m[1];
            }
        }
    }
    return null;
}

const majorMinor = v => (v ?? '').split('.').slice(0, 2).join('.');

/** Import specifiers and named import bindings of one TS/TSX source, through the TypeScript API. */
export function importsOf(ts, file) {
    const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const specs = [], names = [];
    for (const st of sf.statements) {
        if ((ts.isImportDeclaration(st) || ts.isExportDeclaration(st)) && st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier)) {
            specs.push(st.moduleSpecifier.text);
            const b = st.importClause;
            if (b?.name) names.push(b.name.text);
            if (b?.namedBindings && ts.isNamedImports(b.namedBindings)) for (const el of b.namedBindings.elements) names.push((el.propertyName ?? el.name).text);
        }
    }
    return { specs, names };
}

/** Value exports of one TS/TSX source (type-only exports excluded). */
export function valueExportsOf(ts, file) {
    const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const out = [];
    const exported = n => (ts.getModifiers?.(n) ?? n.modifiers ?? []).some(m => m.kind === ts.SyntaxKind.ExportKeyword);
    for (const st of sf.statements) {
        if (ts.isFunctionDeclaration(st) && exported(st) && st.name) out.push(st.name.text);
        else if (ts.isClassDeclaration(st) && exported(st) && st.name) out.push(st.name.text);
        else if (ts.isVariableStatement(st) && exported(st)) for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name)) out.push(d.name.text);
        else if (ts.isExportDeclaration(st) && !st.isTypeOnly && st.exportClause && ts.isNamedExports(st.exportClause)) for (const el of st.exportClause.elements) if (!el.isTypeOnly) out.push(el.name.text);
    }
    return out.sort();
}

/**
 * The gate over one tree. paths: { orcaDir, overlayDir, standaloneDir, baselineFile, theiaDir }.
 * Returns { skip, fails, notes, counts }.
 */
export function checkEntry({ orcaDir, overlayDir, standaloneDir, baselineFile, theiaDir }) {
    const panesDir = join(orcaDir, 'out', 'web', 'assets', 'pb-panes');
    if (!existsSync(join(panesDir, 'pb-panes.js'))) {
        return { skip: 'no built pane bundle (orca/out/web/assets/pb-panes/pb-panes.js; run nix develop .#orca --command bash scripts/build-orca.sh)', fails: [], notes: [] };
    }
    const fails = [], notes = [], counts = {};

    // b. tracked status against the pre-build baseline.
    if (!existsSync(baselineFile)) fails.push(`no pre-build baseline ${relative(dirname(orcaDir), baselineFile)} (build-orca-panes.sh writes it; rerun scripts/build-orca.sh --panes-only)`);
    else {
        const now = execFileSync('git', ['-C', orcaDir, 'status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).replace(/\n+$/, '');
        const was = readFileSync(baselineFile, 'utf8').replace(/\n+$/, '');
        if (now !== was) fails.push(`orca/ tracked status differs from the pre-build baseline (A1): now [${now.split('\n').join(', ')}], baseline [${was.split('\n').join(', ')}]`);
    }

    // c. React copies: the detector first.
    const markerFiles = dir => listFiles(dir).filter(f => f.endsWith('.js') && readFileSync(f, 'latin1').includes(REACT_MARKER));
    const detector = markerFiles(standaloneDir).length;
    counts.reactMarkerStandalone = detector;
    if (detector < 1) fails.push(`React detector blind: ${REACT_MARKER} is in no .js file of the React-bundled standalone variant (${relative(dirname(orcaDir), standaloneDir)}), so a 0 in pb-panes/ proves nothing`);
    else {
        const copies = markerFiles(panesDir);
        counts.reactMarkerPanes = copies.length;
        if (copies.length) fails.push(`a React copy is in pb-panes/: ${REACT_MARKER} in ${copies.map(f => relative(panesDir, f)).join(', ')} (P64-09)`);
    }

    // d. React version against Theia's.
    const theiaReact = join(theiaDir, 'node_modules', 'react', 'package.json');
    const lock = join(orcaDir, 'pnpm-lock.yaml');
    const orcaReact = existsSync(lock) ? lockReactVersion(readFileSync(lock, 'utf8')) : null;
    if (!orcaReact) fails.push('orca/pnpm-lock.yaml resolves no react version for the root importer');
    if (!existsSync(theiaReact)) notes.push(`${NAME}: SKIP -- React version clause: Theia not installed (theia/node_modules/react); the orca-panes loader checks reactIdentity at run time`);
    else if (orcaReact) {
        const t = JSON.parse(readFileSync(theiaReact, 'utf8')).version;
        counts.react = `${orcaReact}/${t}`;
        if (majorMinor(t) !== majorMinor(orcaReact)) fails.push(`React version skew: Orca resolves react ${orcaReact}, Theia ships ${t} (major.minor differ, P64-09)`);
    }

    // e. inlined assets, beyond what build:web itself inlines.
    const assetsDir = join(orcaDir, 'out', 'web', 'assets');
    const assets = listFiles(assetsDir).filter(f => !f.startsWith(panesDir + '/') && ASSET_RE.test(f));
    const textOf = files => files.filter(f => /\.(js|css)$/.test(f)).map(f => readFileSync(f, 'latin1')).join('\n');
    const panesText = textOf(listFiles(panesDir));
    const webText = textOf(listFiles(assetsDir).filter(f => !f.startsWith(panesDir + '/')));
    const inlined = [];
    for (const f of assets) {
        const bytes = readFileSync(f);
        if (bytes.length < 48) continue;
        const key = `;base64,${bytes.subarray(0, 48).toString('base64')}`;
        if (panesText.includes(key) && !webText.includes(key)) inlined.push(`${relative(assetsDir, f)} (${bytes.length} bytes)`);
    }
    counts.assets = assets.length;
    if (inlined.length) fails.push(`inlined in pb-panes/ as a data: URL, though build:web emits it as a file: ${inlined.join(', ')} (A2: lib-mode inlining)`);

    // f, g. imports and exports, through the TypeScript API.
    const tsPath = join(theiaDir, 'node_modules', 'typescript');
    const entry = join(overlayDir, 'files', ENTRY_REL);
    if (!existsSync(tsPath)) notes.push(`${NAME}: SKIP -- import and export clauses: Theia not installed (theia/node_modules/typescript)`);
    else if (!existsSync(entry)) fails.push(`the entry orca-overlay/files/${ENTRY_REL} is missing`);
    else {
        const ts = createRequire(join(theiaDir, 'package.json'))('typescript');
        const filesDir = join(overlayDir, 'files');
        const seen = new Set(), queue = [entry];
        while (queue.length) {
            const file = queue.shift();
            if (seen.has(file)) continue;
            seen.add(file);
            const { specs, names } = importsOf(ts, file);
            const where = relative(filesDir, file);
            for (const spec of specs) {
                for (const [re, label] of FORBIDDEN_IMPORT) if (re.test(spec)) fails.push(`${where} imports ${spec}: ${label} is not hosted (D-29, A4)`);
                if (spec.startsWith('.')) {
                    for (const ext of ['', '.ts', '.tsx', '.mjs', '.js']) {
                        const p = resolve(dirname(file), spec + ext);
                        if (p.startsWith(filesDir + '/') && existsSync(p) && !p.endsWith('.css')) { queue.push(p); break; }
                    }
                }
            }
            for (const n of names) if (FORBIDDEN_NAMES.includes(n)) fails.push(`${where} imports ${n} (D-29, A4)`);
        }
        counts.overlaySources = seen.size;
        const got = valueExportsOf(ts, entry);
        const want = [...C3_EXPORTS].sort();
        const missing = want.filter(n => !got.includes(n)), extra = got.filter(n => !want.includes(n));
        if (missing.length) fails.push(`the entry does not export C3 name(s): ${missing.join(', ')}`);
        if (extra.length) fails.push(`the entry exports name(s) outside C3: ${extra.join(', ')}`);
    }
    return { skip: null, fails, notes, counts };
}

function render(r) {
    if (r.skip) return { code: 0, lines: [`${NAME}: SKIP -- ${r.skip}`] };
    if (r.fails.length) return { code: 1, lines: [...r.notes, ...r.fails.map(f => `${NAME}: FAIL -- ${f}`)] };
    const c = r.counts;
    return { code: 0, lines: [...r.notes, `${NAME}: PASS -- tracked status at baseline; React marker ${c.reactMarkerStandalone} file(s) in the standalone variant, ${c.reactMarkerPanes} in pb-panes/${c.react ? `; React ${c.react}` : ''}; ${c.assets} build:web asset(s), none newly inlined${c.overlaySources ? `; ${c.overlaySources} overlay source(s) import no tab bar, TabGroupPanel or client-side terminal creation; C3 exports exact` : ''}`] };
}

function realPaths() {
    return { orcaDir: join(REPO_ROOT, 'orca'), overlayDir: join(REPO_ROOT, 'orca-overlay'), standaloneDir: join(REPO_ROOT, '.mozbuild', 'orca-panes-standalone'),
        baselineFile: join(REPO_ROOT, '.mozbuild', 'orca-panes', 'tracked-baseline.txt'), theiaDir: join(REPO_ROOT, 'theia') };
}

// ---------------------------------------------------------------- self-test

function fixture(dir, theiaTs) {
    const orca = join(dir, 'orca');
    const w = (p, t) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, t); };
    w(join(orca, 'tracked.txt'), 'pinned\n');
    w(join(orca, 'pnpm-lock.yaml'), "---\nimporters:\n\n  .:\n    packageManagerDependencies:\n      pnpm:\n        version: 12.14.0\n\npackages: {}\n---\nlockfileVersion: '9.0'\n\nimporters:\n\n  .:\n    dependencies:\n      react:\n        specifier: ~19.2.8\n        version: 19.2.8\n");
    const g = (...a) => execFileSync('git', ['-C', orca, '-c', 'user.name=t', '-c', 'user.email=t@invalid', ...a]);
    g('init', '-q'); g('add', '-A'); g('commit', '-qm', 'pin');
    const font = Buffer.alloc(9000, 7); font.write('FONTHEADER-unique-bytes-for-this-fixture-0123456789', 0);
    w(join(orca, 'out', 'web', 'assets', 'font-abc.ttf'), font);
    w(join(orca, 'out', 'web', 'assets', 'index.css'), '@font-face{src:url(./font-abc.ttf)}');
    w(join(orca, 'out', 'web', 'assets', 'pb-panes', 'pb-panes.js'), 'export {}');
    w(join(orca, 'out', 'web', 'assets', 'pb-panes', 'pb-panes.css'), '.a{}');
    w(join(dir, 'standalone', 'pb-panes.js'), `var x = { ${REACT_MARKER}: 'react-dom' }`);
    w(join(dir, 'baseline.txt'), '\n');
    w(join(dir, 'theia', 'package.json'), '{}');
    w(join(dir, 'theia', 'node_modules', 'react', 'package.json'), '{"version":"19.2.8"}');
    execFileSync('ln', ['-s', theiaTs, join(dir, 'theia', 'node_modules', 'typescript')]);
    const exports = C3_EXPORTS.map(n => `export const ${n} = 1`).join('\n');
    w(join(dir, 'overlay', 'files', ENTRY_REL), `import '../assets/main.css'\nimport { a } from './helper'\nexport type T = string\n${exports}\n`);
    w(join(dir, 'overlay', 'files', 'src/renderer/src/pb/helper.ts'), `import { useAppStore } from '../store'\nexport const a = 1\n`);
    return { orcaDir: orca, overlayDir: join(dir, 'overlay'), standaloneDir: join(dir, 'standalone'), baselineFile: join(dir, 'baseline.txt'), theiaDir: join(dir, 'theia'), font };
}

function selfTest() {
    const theiaTs = join(REPO_ROOT, 'theia', 'node_modules', 'typescript');
    if (!existsSync(theiaTs)) { console.log(`${NAME} self-test: SKIP -- theia/node_modules/typescript is absent (the audited Theia install)`); return 0; }
    let failed = 0;
    const ok = (name, cond) => { console.log(`  ${cond ? 'ok ' : 'NOT OK '} ${name}`); if (!cond) failed += 1; };
    const run = (name, plant, want) => {
        const dir = mkdtempSync(join(tmpdir(), `${NAME}-`));
        try {
            const p = fixture(dir, theiaTs);
            plant?.(p);
            const r = checkEntry(p);
            if (want === null) ok(name, r.skip === null && r.fails.length === 0);
            else ok(name, r.fails.some(f => want.test(f)));
        } finally { rmSync(dir, { recursive: true, force: true }); }
    };
    const panes = p => join(p.orcaDir, 'out', 'web', 'assets', 'pb-panes');
    const entry = p => join(p.overlayDir, 'files', ENTRY_REL);
    run('control green', null, null);
    run('a tracked edit is red', p => writeFileSync(join(p.orcaDir, 'tracked.txt'), 'edited\n'), /tracked status differs from the pre-build baseline/);
    run('a planted React copy is red', p => writeFileSync(join(panes(p), 'chunk.js'), `x.${REACT_MARKER}='react-dom'`), /a React copy is in pb-panes\/: rendererPackageName in chunk\.js/);
    run('a blind React detector is red', p => writeFileSync(join(p.standaloneDir, 'pb-panes.js'), 'export {}'), /React detector blind/);
    run('a version skew is red', p => writeFileSync(join(p.theiaDir, 'node_modules', 'react', 'package.json'), '{"version":"19.3.0"}'), /React version skew: Orca resolves react 19\.2\.8, Theia ships 19\.3\.0/);
    run('an inlined font is red', p => writeFileSync(join(panes(p), 'pb-panes.css'), `@font-face{src:url(data:font/ttf;base64,${p.font.toString('base64')})}`), /inlined in pb-panes\/.*font-abc\.ttf/);
    run('a tab-bar import is red', p => writeFileSync(entry(p), readFileSync(entry(p), 'utf8') + "import X from '../components/tab-bar/TabBar'\n"), /imports \.\.\/components\/tab-bar\/TabBar: components\/tab-bar\//);
    run('a tab-bar import in an imported overlay file is red', p => writeFileSync(join(dirname(entry(p)), 'helper.ts'), "import { TabGroupPanel } from '../components/tab-group/TabGroupPanel'\nexport const a = 1\n"), /helper\.ts imports .*TabGroupPanel/);
    run('a client-side terminal creation import is red', p => writeFileSync(entry(p), readFileSync(entry(p), 'utf8') + "import { createNewTerminalTab } from '../components/terminal/terminal-tab-create'\n"), /terminal-tab-create/);
    run('a missing C3 export is red', p => writeFileSync(entry(p), readFileSync(entry(p), 'utf8').replace('export const createChat = 1', 'const createChat = 1')), /does not export C3 name\(s\): createChat/);
    run('an extra value export is red', p => writeFileSync(entry(p), readFileSync(entry(p), 'utf8') + 'export function paneRecords() {}\n'), /exports name\(s\) outside C3: paneRecords/);
    const bad = spawnSync(process.execPath, [SELF, '--nope'], { encoding: 'utf8' });
    ok('an unknown argument exits 2', bad.status === 2);
    console.log(failed ? `${NAME} self-test: FAIL -- ${failed} case(s)` : `${NAME} self-test: PASS -- every planted fault went red naming it`);
    return failed ? 1 : 0;
}

const INVOKED = process.argv[1] && resolve(process.argv[1]) === SELF;
if (INVOKED) {
    const args = process.argv.slice(2);
    if (args.some(a => a !== '--self-test')) { console.error('usage: node scripts/verify-orca-pane-entry.mjs [--self-test]'); process.exit(2); }
    if (args.includes('--self-test')) process.exit(selfTest());
    const paths = realPaths();
    // The detector is built on demand (the standalone variant is not part of build-orca.sh).
    if (existsSync(join(paths.orcaDir, 'out', 'web', 'assets', 'pb-panes', 'pb-panes.js')) && !existsSync(join(paths.standaloneDir, 'pb-panes.js'))) {
        spawnSync('bash', [join(REPO_ROOT, 'scripts', 'build-orca-panes.sh'), '--standalone'], { stdio: 'ignore' });
    }
    const out = render(checkEntry(paths));
    for (const line of out.lines) console.log(line);
    process.exit(out.code);
}
