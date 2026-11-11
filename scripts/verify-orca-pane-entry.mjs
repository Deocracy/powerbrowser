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
//   g. the entry's value exports (re-exports with export { ... } from included) equal the C3 bundle API
//      with Phase 65's C3-65 names exactly (TypeScript parse with theia/node_modules/typescript; a SKIP
//      for f..j when Theia is not installed);
//   h. (Phase 65, D-01) the bundle's module graph, walked from the entry (overlay files read at their
//      orca/ paths) through every value import, holds no components/editor/EditorPanel*.tsx and no
//      components/editor/EditorContent.tsx: Orca's own editor is never mounted;
//   i. (P65-17, CA-07 re-pin guard) orca/src/renderer/src/web/web-device-key-support.ts at the pin
//      exports a function setWebDeviceKeySupportForTests (a named SKIP only when orca/ is absent);
//   j. (P65-27) every member of every interface named Orca<letters>BundleApi under
//      theia/extensions/*/src is a named export of the entry; a parse yielding zero entry exports is
//      red "parser blind"; a named SKIP only while no such interface exists;
//   k. (D-18, 65-05) every modal Orca's app root hosts (AppRootSurfaces.tsx: `activeModal === '<id>'` and
//      `mountedLazyModalIds.has('<id>')`) that a module of the bundle graph opens (`openModal('<id>'`) is hosted by
//      the overlay's services root under the same condition; otherwise the hosted surface's trigger opens nothing.
//      Zero root modals is red "source moved"; zero opened root modals is red "parser blind".
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

import { moduleGraph, overlayOverrides } from './lib/orca-pane-harness.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'orca-pane-entry';
const SELF = fileURLToPath(import.meta.url);
export const ENTRY_REL = 'src/renderer/src/pb/pb-pane-mount.tsx';
export const C3_EXPORTS = ['bootstrap', 'subscribePanes', 'mountPane', 'closePane', 'createTerminal', 'createChat', 'openPane',
    'activeWorktree', 'setActiveWorktree', 'state', 'reactIdentity', 'PB_OVERLAY_BUILD',
    // C3-65 (Phase 65 lane p65-01)
    'MOUNT_KINDS', 'subscribeOpenFiles', 'subscribeWorktrees', 'subscribeActiveView', 'setActiveView', 'subscribeActiveWorktree',
    'subscribeOrchestrationEnabled', 'setOrchestrationFocus', 'viewTitle', 'repair',
    // C3-66 (66-07, D-34): the store row of each browser-host page, and the checks' selection of it
    'addBrowserPage', 'removeBrowserPage', 'selectBrowserPage'];
const EDITOR_MODULE = /(^|\/)components\/editor\/(EditorPanel[^/]*|EditorContent)\.tsx$/;
const DEVICE_KEY_SUPPORT = 'src/renderer/src/web/web-device-key-support.ts';
const APP_ROOT_SURFACES = 'src/renderer/src/app-shell/AppRootSurfaces.tsx';
const HOSTED_MODAL_RE = /(?:activeModal === |mountedLazyModalIds\.has\()'([a-z][a-z-]*)'/g;
const OPEN_MODAL_RE = /openModal\(\s*['"]([a-z][a-z-]*)['"]/g;
const PRESET_EXPORT = 'setWebDeviceKeySupportForTests';
const BUNDLE_API_RE = /^Orca[A-Za-z]+BundleApi$/;
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
        else if (ts.isVariableStatement(st) && exported(st)) { for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name)) out.push(d.name.text); }
        // export { a } and export { a } from './x' (the second form is how the entry re-exports C3-65 names).
        else if (ts.isExportDeclaration(st) && !st.isTypeOnly && st.exportClause && ts.isNamedExports(st.exportClause)) for (const el of st.exportClause.elements) if (!el.isTypeOnly) out.push(el.name.text);
    }
    return out.sort();
}

/** Member names of every interface named Orca<letters>BundleApi in the .ts/.tsx files under theia/extensions/<x>/src. */
export function consumerApiMembers(ts, theiaDir) {
    const out = new Map();
    const extDir = join(theiaDir, 'extensions');
    if (!existsSync(extDir)) return out;
    for (const ext of readdirSync(extDir)) {
        for (const file of listFiles(join(extDir, ext, 'src')).filter(f => /\.tsx?$/.test(f) && !f.endsWith('.d.ts'))) {
            const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
            for (const st of sf.statements) {
                if (!ts.isInterfaceDeclaration(st) || !BUNDLE_API_RE.test(st.name.text)) continue;
                const members = st.members.filter(m => m.name && (ts.isIdentifier(m.name) || ts.isStringLiteral(m.name))).map(m => m.name.text);
                out.set(`${st.name.text} (${relative(theiaDir, file)})`, members);
            }
        }
    }
    return out;
}

/** Whether `file` exports a function named `name` (a declaration or an export of a local function). */
export function exportsFunction(ts, file, name) {
    const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const exported = n => (ts.getModifiers?.(n) ?? n.modifiers ?? []).some(m => m.kind === ts.SyntaxKind.ExportKeyword);
    return sf.statements.some(st => ts.isFunctionDeclaration(st) && exported(st) && st.name?.text === name);
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

        // h. Orca's editor out of the bundle's module graph (D-01).
        const rendererSrc = join(orcaDir, 'src', 'renderer', 'src');
        const overrides = overlayOverrides(filesDir, orcaDir);
        const start = join(rendererSrc, 'pb', 'pb-pane-mount.tsx');
        const graph = moduleGraph(ts, [start], overrides, rendererSrc);
        counts.modules = graph.size;
        if (graph.size < 2) fails.push(`module graph blind: the walk from the entry reached ${graph.size} module(s)`);
        for (const [mod] of graph) {
            if (!EDITOR_MODULE.test(mod)) continue;
            const chain = [];
            for (let at = mod; at; at = graph.get(at)) chain.push(relative(orcaDir, at));
            fails.push(`Orca's editor in the pane bundle (D-01): ${chain.slice(0, 6).join(' <- ')}`);
        }

        // k. every app-root modal a bundle module opens is hosted by the overlay (D-18).
        const rootFile = join(orcaDir, APP_ROOT_SURFACES);
        const rootModals = existsSync(rootFile) ? new Set([...readFileSync(rootFile, 'utf8').matchAll(HOSTED_MODAL_RE)].map(m => m[1])) : new Set();
        if (rootModals.size === 0) fails.push(`source moved: orca/${APP_ROOT_SURFACES} hosts zero modals by activeModal or mountedLazyModalIds`);
        else {
            const opened = new Map();
            for (const [mod] of graph) {
                const text = overrides.get(mod) ?? readFileSync(mod, 'utf8');
                for (const m of text.matchAll(OPEN_MODAL_RE)) if (rootModals.has(m[1]) && !opened.has(m[1])) opened.set(m[1], mod);
            }
            const overlayText = [...overrides.values()].join('\n');
            const hosted = new Set([...overlayText.matchAll(HOSTED_MODAL_RE)].map(m => m[1]));
            if (opened.size === 0) fails.push('parser blind: no module of the bundle graph opens a modal the app root hosts');
            for (const [id, mod] of opened) if (!hosted.has(id)) fails.push(`root dialog not hosted (D-18): ${id}, opened in ${relative(orcaDir, mod)}, has no services-root mount in the overlay`);
            counts.rootDialogs = opened.size;
        }

        // i. the preset export Orca's session-only pairing relies on (P65-17, CA-07).
        const support = join(orcaDir, DEVICE_KEY_SUPPORT);
        if (!existsSync(support)) notes.push(`${NAME}: SKIP -- preset-export clause: orca/${DEVICE_KEY_SUPPORT} is absent (run scripts/fetch-orca.sh)`);
        else if (!exportsFunction(ts, support, PRESET_EXPORT)) fails.push(`source moved: ${PRESET_EXPORT} (P65-17) is no longer an exported function of orca/${DEVICE_KEY_SUPPORT}`);
        else counts.preset = true;

        // j. every consumer Orca*BundleApi member is a named export of the entry (P65-27).
        const consumers = consumerApiMembers(ts, theiaDir);
        if (got.length === 0) fails.push('parser blind: the entry parse yielded zero exports');
        else if (consumers.size === 0) notes.push(`${NAME}: SKIP -- consumer-API clause: no interface named Orca<letters>BundleApi under theia/extensions/*/src`);
        else {
            const exported = new Set(got);
            for (const [iface, members] of consumers) for (const m of members) if (!exported.has(m)) fails.push(`bundle API drift: ${m} (${iface}) is not a named export of the entry`);
            counts.consumers = [...consumers.keys()].map(k => k.split(' ')[0]);
        }
    }
    return { skip: null, fails, notes, counts };
}

function render(r) {
    if (r.skip) return { code: 0, lines: [`${NAME}: SKIP -- ${r.skip}`] };
    if (r.fails.length) return { code: 1, lines: [...r.notes, ...r.fails.map(f => `${NAME}: FAIL -- ${f}`)] };
    const c = r.counts;
    return { code: 0, lines: [...r.notes, `${NAME}: PASS -- tracked status at baseline; React marker ${c.reactMarkerStandalone} file(s) in the standalone variant, ${c.reactMarkerPanes} in pb-panes/${c.react ? `; React ${c.react}` : ''}; ${c.assets} build:web asset(s), none newly inlined${c.overlaySources ? `; ${c.overlaySources} overlay source(s) import no tab bar, TabGroupPanel or client-side terminal creation; C3 exports exact (C3-65 included)` : ''}${c.modules ? `; ${c.modules} module(s) in the bundle graph, no EditorPanel or EditorContent` : ''}${c.rootDialogs ? `; ${c.rootDialogs} app-root dialog(s) the bundle opens all hosted` : ''}${c.preset ? `; ${PRESET_EXPORT} exported at the pin` : ''}${c.consumers ? `; consumer API ${c.consumers.join(', ')} covered` : ''}`] };
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
    w(join(dir, 'overlay', 'files', ENTRY_REL), `import '../assets/main.css'\nimport { a } from './helper'\nimport { del } from '../components/sidebar/delete-flow'\nexport type T = string\n${exports}\nconst host = (activeModal) => activeModal === 'delete-worktree'\n`);
    w(join(dir, 'overlay', 'files', 'src/renderer/src/pb/helper.ts'), `import { useAppStore } from '../store'\nexport const a = 1\n`);
    w(join(orca, 'src/renderer/src/store/index.ts'), `export const useAppStore = 1\n`);
    w(join(orca, 'src/renderer/src/components/editor/EditorPanel.tsx'), `export default 1\n`);
    w(join(orca, APP_ROOT_SURFACES), `{activeModal === 'delete-worktree' ? <D /> : null}{mountedLazyModalIds.has('quick-open') ? <Q /> : null}\n`);
    w(join(orca, 'src/renderer/src/components/sidebar/delete-flow.ts'), `export const del = (s) => s.openModal('delete-worktree')\nexport const own = (s) => s.openModal('edit-meta')\n`);
    w(join(orca, DEVICE_KEY_SUPPORT), `export function ${PRESET_EXPORT}(support: string | null): void {}\n`);
    w(join(dir, 'theia', 'extensions', 'orca-panes', 'src', 'common', 'protocol.ts'), `export interface OrcaPaneBundleApi {\n    bootstrap(options: { pairing: string }): Promise<void>;\n    reactIdentity: unknown;\n}\n`);
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
    run("Orca's editor in the module graph is red", p => writeFileSync(entry(p), readFileSync(entry(p), 'utf8') + "import EditorPanel from '../components/editor/EditorPanel'\n"), /^Orca's editor in the pane bundle \(D-01\): src\/renderer\/src\/components\/editor\/EditorPanel\.tsx <- src\/renderer\/src\/pb\/pb-pane-mount\.tsx/);
    run("Orca's editor reached through a dynamic import in an overlay file is red", p => writeFileSync(join(dirname(entry(p)), 'helper.ts'), "export const a = () => import('@/components/editor/EditorPanel')\n"), /^Orca's editor in the pane bundle \(D-01\): .*EditorPanel\.tsx <- .*helper\.ts/);
    run('a renamed preset export is red', p => writeFileSync(join(p.orcaDir, DEVICE_KEY_SUPPORT), 'export function setWebDeviceKeySupportForTesting(support: string | null): void {}\n'), /^source moved: setWebDeviceKeySupportForTests \(P65-17\)/);
    run('a consumer interface member the entry lacks is red', p => writeFileSync(join(p.theiaDir, 'extensions', 'orca-panes', 'src', 'common', 'protocol.ts'), 'export interface OrcaSidePanelBundleApi {\n    subscribeLayout(cb: () => void): () => void;\n}\n'), /^bundle API drift: subscribeLayout \(OrcaSidePanelBundleApi/);
    run('a re-exported name counts as an export', p => { writeFileSync(entry(p), readFileSync(entry(p), 'utf8').replace('export const viewTitle = 1', "export { viewTitle } from './helper'")); writeFileSync(join(dirname(entry(p)), 'helper.ts'), 'export const a = 1\nexport const viewTitle = 1\n'); }, null);
    run('an entry with no exports is red "parser blind"', p => writeFileSync(entry(p), "import '../assets/main.css'\n"), /^parser blind/);
    run('an extra value export is red', p => writeFileSync(entry(p), readFileSync(entry(p), 'utf8') + 'export function paneRecords() {}\n'), /exports name\(s\) outside C3: paneRecords/);
    run('an opened app-root dialog the overlay does not host is red', p => writeFileSync(entry(p), readFileSync(entry(p), 'utf8').replace("activeModal === 'delete-worktree'", "activeModal === 'add-repo'")), /^root dialog not hosted \(D-18\): delete-worktree, opened in src\/renderer\/src\/components\/sidebar\/delete-flow\.ts/);
    run('a lazily mounted root dialog opened in the graph is red until hosted', p => writeFileSync(join(p.orcaDir, 'src/renderer/src/components/sidebar/delete-flow.ts'), "export const del = (s) => s.openModal('delete-worktree')\nexport const q = (s) => s.openModal('quick-open')\n"), /^root dialog not hosted \(D-18\): quick-open/);
    run('an app root with no modals is red "source moved"', p => writeFileSync(join(p.orcaDir, APP_ROOT_SURFACES), 'export {}\n'), /^source moved: orca\/src\/renderer\/src\/app-shell\/AppRootSurfaces\.tsx hosts zero modals/);
    run('a graph that opens no root modal is red "parser blind"', p => writeFileSync(join(p.orcaDir, 'src/renderer/src/components/sidebar/delete-flow.ts'), "export const del = 1\n"), /^parser blind: no module of the bundle graph opens a modal/);
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
