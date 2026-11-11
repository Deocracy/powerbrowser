#!/usr/bin/env node
// scripts/verify-orca-browser-entry-points.mjs
//
// orca-browser-entry-points (Phase 66, BRW-02, criterion 1; P66-09, P66-10,
// P66-30; research A3): every way Orca's renderer could show a browser page in
// PowerBrowser routes to a PowerBrowser web tab, or is unreachable from PB's
// pane bundle, and the browser host's interface agrees across lanes.
//
// Derived at check time from the pinned source with theia/node_modules/typescript
// (never by line grep):
//  a. the page-mounting components: each .tsx module under
//     orca/src/renderer/src/components/browser-pane/ (tests excluded) that renders a
//     page surface itself or reaches, through static imports inside that directory,
//     a module that does. A page surface is written once (isPageSurface): a webview
//     element (a JSX <webview> or createElement('webview')), or a stream surface
//     (a JSX <img> or <canvas> that takes pointer input). The derived set is printed.
//  b. the callers of createBrowserTab and of createWebRuntimeSessionBrowserTab
//     under orca/src/renderer (test files excluded): every file holding a call of
//     either name; each name must have at least one caller.
//  c. the TabContentType members of orca/src/shared/tab-types.ts; browser must
//     be one of them.
//  d. the PB pane entry's import graph: a breadth-first walk from
//     orca-overlay/files/src/renderer/src/pb/pb-pane-mount.tsx over static imports,
//     re-exports and import() calls (type-only imports excluded), resolved with
//     ts.resolveModuleName and the paths of Orca's config/tsconfig.web.json; an
//     overlay file resolves at its in-tree path (orca-overlay/files/<p> stands in
//     for orca/<p>). Bare packages are not walked.
// Clauses:
//  1. the graph reaches no page-mounting component;
//  2. the orca-panes route table's browser row is { target: 'pb-web-tab' };
//  3. each caller is listed reachable ("arrives as createPage through the client
//     placement, proven live by orca-browser-agent-live") or dead with its derived
//     reason (no import path from the entry reaches it; its importers are named);
//  4. the component set, each caller set and the TabContentType set are non-empty
//     ("source moved" otherwise);
//  5. the served prefix the host bundle is imported from (HOST_PREFIX in
//     @powerbrowser/orca-browser) equals ORCA_PANES_ROUTE_PREFIX, the prefix the
//     orca-panes backend route serves (compared on every run).
// Cross-lane clauses, a named SKIP while lane p66-01's
// orca-overlay/files/src/renderer/src/pb/browser-host/pb-browser-host-link.ts is
// absent ("lane p66-01 not merged"), red when it is present and disagrees:
//  6. the pane entry imports the link module;
//  7. the link assigns prepareBrowserClientHostPlacement (A3 a);
//  8. the export names of pb-browser-host.ts equal HOST_EXPORTS;
//  9. the link holds the LINK_KEY and LINK_EVENT literals of @powerbrowser/orca-browser.
// Store-row clause 10 (66-07, D-34; compared on every run), names derived from the pinned source:
//  e. stageWebRuntimeBrowserTab (runtime/web-runtime-browser-tab-staging.ts), the web client's browser-path staging:
//     the store actions it calls (createBrowserTab, setRemoteBrowserPageHandle), the handle keys it sets to true
//     (staged, stagedClientHosted), and the exported function of that file that closes a row with reason 'cleanup'
//     (the discard);
//  f. createBrowserTab (store/slices/browser/browser-tab-actions.ts): the builders of its page and browserTab, the
//     call spread into its record write, the store action that creates its 'browser' unified tab, and the record keys
//     it writes;
//  g. the browser slice action whose second parameter is browserPageId (browser-page-focus-actions.ts), the store
//     action a tab switch --focus ends in.
//  The entry's addBrowserPage calls every e/f name except createBrowserTab (its managed-browser gate refuses a paired
//  web client without screencast, D-34), writes f's record keys, creates the unified tab with 'browser' and
//  activate: false, and sets each e handle key to true; removeBrowserPage calls e's discard; selectBrowserPage calls
//  g; pb-browser-host.ts calls addBrowserPage once and removeBrowserPage on closePage and on a user close, through
//  the key @powerbrowser/orca-panes stores the bundle under (ORCA_PANES_MODULE_KEY).
//
// Tier: quick. One named SKIP when orca/src or theia/node_modules/typescript is
// absent. Every judgment is an exported pure verdict. --self-test builds a
// hermetic fixture tree in a mkdtemp directory; the control must be green with
// the cross-lane clauses compared, then each planted fault must go red naming
// its drift.
//
// Usage:
//   node scripts/verify-orca-browser-entry-points.mjs
//   node scripts/verify-orca-browser-entry-points.mjs --self-test

import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'orca-browser-entry-points';
export const REL = {
    orca: 'orca',
    overlay: 'orca-overlay/files',
    entry: 'orca-overlay/files/src/renderer/src/pb/pb-pane-mount.tsx',
    link: 'orca-overlay/files/src/renderer/src/pb/browser-host/pb-browser-host-link.ts',
    host: 'orca-overlay/files/src/renderer/src/pb/browser-host/pb-browser-host.ts',
    browserPane: 'orca/src/renderer/src/components/browser-pane',
    renderer: 'orca/src/renderer',
    tabTypes: 'orca/src/shared/tab-types.ts',
    webTsconfig: 'orca/config/tsconfig.web.json',
    routes: 'theia/extensions/orca-panes/src/browser/orca-pane-routes.ts',
    protocol: 'theia/extensions/orca-panes/src/common/orca-panes-protocol.ts',
    backend: 'theia/extensions/orca-panes/src/node/orca-panes-backend-module.ts',
    module: 'theia/extensions/orca-browser/src/browser/orca-browser-frontend-module.ts',
    staging: 'orca/src/renderer/src/runtime/web-runtime-browser-tab-staging.ts',
    tabActions: 'orca/src/renderer/src/store/slices/browser/browser-tab-actions.ts',
    focusActions: 'orca/src/renderer/src/store/slices/browser/browser-page-focus-actions.ts',
    paneBundle: 'theia/extensions/orca-panes/src/browser/orca-pane-bundle.ts',
};
export const CREATORS = ['createBrowserTab', 'createWebRuntimeSessionBrowserTab'];
const NOT_SOURCE = /\.(test|test-fixture|spec)\.tsx?$/;
const REACHABLE = 'arrives as createPage through the client placement, proven live by orca-browser-agent-live';

let ts;
function loadTypescript() {
    try { ts ??= createRequire(join(REPO_ROOT, 'theia', 'package.json'))('typescript'); } catch { ts = undefined; }
    return ts;
}

const parse = (file, text) => ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
function walk(node, visit) { visit(node); ts.forEachChild(node, (c) => walk(c, visit)); }
const stringOf = (n) => n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) ? n.text : undefined;

function sourceFiles(dir) {
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { recursive: true, withFileTypes: true })
        .filter((e) => e.isFile() && /\.tsx?$/.test(e.name) && !NOT_SOURCE.test(e.name) && !e.parentPath.split('/').includes('__tests__'))
        .map((e) => join(e.parentPath, e.name));
}

// ---------------------------------------------------------------- derivations (pure over text)

/** The page-surface rule, written once: a webview element, or an img/canvas that takes pointer input (a stream surface). */
export function isPageSurface(text, file) {
    let found = false;
    walk(parse(file, text), (n) => {
        if (found) return;
        if (ts.isCallExpression(n) && /(^|\.)createElement$/.test(n.expression.getText()) && stringOf(n.arguments[0]) === 'webview') found = true;
        const el = ts.isJsxElement(n) ? n.openingElement : ts.isJsxSelfClosingElement(n) ? n : undefined;
        if (el) {
            const tag = el.tagName.getText();
            if (tag === 'webview') found = true;
            if ((tag === 'img' || tag === 'canvas') && el.attributes.properties.some((p) => ts.isJsxAttribute(p) && /^onPointer/.test(p.name.getText()))) found = true;
        }
    });
    return found;
}

/** Module specifiers a file loads at run time: imports, re-exports and import() calls; type-only ones excluded. */
export function deriveSpecifiers(text, file) {
    const specs = [];
    walk(parse(file, text), (n) => {
        if (ts.isImportDeclaration(n) && !n.importClause?.isTypeOnly) specs.push(stringOf(n.moduleSpecifier));
        if (ts.isExportDeclaration(n) && n.moduleSpecifier && !n.isTypeOnly) specs.push(stringOf(n.moduleSpecifier));
        if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword) specs.push(stringOf(n.arguments[0]));
    });
    return specs.filter((s) => s !== undefined);
}

/** Files holding a call of `name` (an identifier or a property access ending in it). */
export function callsOf(text, file, name) {
    if (!text.includes(name)) return false;
    let found = false;
    walk(parse(file, text), (n) => {
        if (!found && ts.isCallExpression(n)) {
            const callee = n.expression;
            if ((ts.isIdentifier(callee) && callee.text === name) || (ts.isPropertyAccessExpression(callee) && callee.name.text === name)) found = true;
        }
    });
    return found;
}

/** Members of `export type TabContentType = ...` as string literals. */
export function deriveTabContentTypes(text) {
    const out = [];
    walk(parse('tab-types.ts', text), (n) => {
        if (ts.isTypeAliasDeclaration(n) && n.name.text === 'TabContentType') {
            const types = ts.isUnionTypeNode(n.type) ? n.type.types : [n.type];
            for (const t of types) if (ts.isLiteralTypeNode(t) && stringOf(t.literal) !== undefined) out.push(stringOf(t.literal));
        }
    });
    return out;
}

/** The value object of `name: { ... }` inside the object literal initialising `constName`, as { key: string }. */
export function deriveRouteRow(text, constName, key) {
    let row;
    walk(parse('routes.ts', text), (n) => {
        if (ts.isVariableDeclaration(n) && n.name.getText() === constName && n.initializer) {
            walk(n.initializer, (m) => {
                if (ts.isPropertyAssignment(m) && (stringOf(m.name) ?? m.name.getText()) === key && ts.isObjectLiteralExpression(m.initializer)) {
                    row = Object.fromEntries(m.initializer.properties.filter(ts.isPropertyAssignment).map((p) => [p.name.getText().replace(/['"]/g, ''), stringOf(p.initializer)]));
                }
            });
        }
    });
    return row;
}

/** The string (or frozen string array) a top-level `const name` is initialised with. */
export function constValue(text, file, name) {
    let value;
    walk(parse(file, text), (n) => {
        if (ts.isVariableDeclaration(n) && n.name.getText() === name && n.initializer) {
            let init = n.initializer;
            if (ts.isCallExpression(init) && /Object\.freeze$/.test(init.expression.getText())) init = init.arguments[0];
            value = ts.isArrayLiteralExpression(init) ? init.elements.map(stringOf) : stringOf(init);
        }
    });
    return value;
}

export function deriveNamedExports(text, file) {
    const names = [];
    const exported = (s) => (s.modifiers ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    for (const s of parse(file, text).statements) {
        if ((ts.isFunctionDeclaration(s) || ts.isClassDeclaration(s)) && s.name && exported(s)) names.push(s.name.text);
        if (ts.isVariableStatement(s) && exported(s)) for (const d of s.declarationList.declarations) if (ts.isIdentifier(d.name)) names.push(d.name.text);
        if (ts.isExportDeclaration(s) && !s.isTypeOnly && s.exportClause && ts.isNamedExports(s.exportClause)) for (const e of s.exportClause.elements) if (!e.isTypeOnly) names.push(e.name.text);
    }
    return names;
}

/** True when some `X.prepareBrowserClientHostPlacement = ...` assignment is in the text. */
export function assignsPlacement(text, file) {
    let found = false;
    walk(parse(file, text), (n) => {
        if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken && /\.prepareBrowserClientHostPlacement$/.test(n.left.getText())) found = true;
    });
    return found;
}

// ---------------------------------------------------------------- store-row derivations (clause 10)

/** The body node of a function named `name`: a function declaration, a const arrow, or an object property arrow. */
export function functionNamed(text, file, name) {
    let found;
    walk(parse(file, text), (n) => {
        if (found) return;
        if (ts.isFunctionDeclaration(n) && n.name?.text === name) found = n;
        else if ((ts.isVariableDeclaration(n) || ts.isPropertyAssignment(n)) && n.name.getText() === name && n.initializer && (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer))) found = n.initializer;
    });
    return found;
}

const calleeName = (call) => ts.isIdentifier(call.expression) ? call.expression.text : ts.isPropertyAccessExpression(call.expression) ? call.expression.name.text : undefined;

/** Calls under a node: [{ name, call }]. */
export function callsUnder(node) {
    const out = [];
    if (node) walk(node, (n) => { if (ts.isCallExpression(n)) { const name = calleeName(n); if (name) out.push({ name, call: n }); } });
    return out;
}

/** Keys set to the literal true in object literals under a node. */
function trueKeysUnder(node) {
    const out = new Set();
    walk(node, (n) => { if (ts.isPropertyAssignment(n) && n.initializer.kind === ts.SyntaxKind.TrueKeyword) out.add(n.name.getText()); });
    return out;
}

/** e, f, g from the pinned source; every member is empty when the source moved. */
export function deriveStoreRow(read) {
    const staging = read(REL.staging);
    const stage = functionNamed(staging, REL.staging, 'stageWebRuntimeBrowserTab');
    // A store action: a method called on the store state (`state.x(...)` or `useAppStore.getState().x(...)`).
    const onStore = (e) => ts.isIdentifier(e) ? e.text === 'state' : ts.isCallExpression(e) && calleeName(e) === 'getState';
    const storeCalls = callsUnder(stage).filter((c) => ts.isPropertyAccessExpression(c.call.expression) && onStore(c.call.expression.expression));
    const actions = [...new Set(storeCalls.map((c) => c.name))];
    const handleKeys = new Set();
    // The handle: the keys set to true by the store actions other than the creator (CREATORS[0]).
    for (const c of storeCalls.filter((x) => x.name !== CREATORS[0])) for (const k of trueKeysUnder(c.call)) handleKeys.add(k);
    let discard;
    for (const st of parse(REL.staging, staging).statements) {
        if (ts.isFunctionDeclaration(st) && st.name && (st.modifiers ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
            && callsUnder(st).some((c) => c.name === 'closeBrowserTab' && c.call.arguments.some((a) => ts.isObjectLiteralExpression(a) && a.properties.some((p) => ts.isPropertyAssignment(p) && p.name.getText() === 'reason' && stringOf(p.initializer) === 'cleanup')))) discard = st.name.text;
    }
    const tabActions = read(REL.tabActions);
    const create = functionNamed(tabActions, REL.tabActions, CREATORS[0]);
    const builders = [];
    const recordKeys = new Set();
    let spread;
    let unifiedAction;
    if (create) walk(create, (n) => {
        if (ts.isVariableDeclaration(n) && ['page', 'browserTab'].includes(n.name.getText()) && n.initializer && ts.isCallExpression(n.initializer)) builders.push(calleeName(n.initializer));
        if (ts.isCallExpression(n) && calleeName(n) && n.arguments.some((a) => stringOf(a) === 'browser') && ts.isPropertyAccessExpression(n.expression)) unifiedAction ??= calleeName(n);
        if (ts.isObjectLiteralExpression(n) && n.properties.some((p) => ts.isSpreadAssignment(p) && ts.isCallExpression(p.expression))) {
            for (const p of n.properties) {
                if (ts.isSpreadAssignment(p) && ts.isCallExpression(p.expression)) spread ??= calleeName(p.expression);
                if (ts.isPropertyAssignment(p) && /^browser/.test(p.name.getText())) recordKeys.add(p.name.getText());
            }
        }
    });
    const focusText = read(REL.focusActions);
    let focus;
    walk(parse(REL.focusActions, focusText), (n) => {
        if (!focus && ts.isPropertyAssignment(n) && n.initializer && ts.isArrowFunction(n.initializer) && n.initializer.parameters[1]?.name.getText() === 'browserPageId') focus = n.name.getText();
    });
    return { actions, handleKeys: [...handleKeys], discard, builders: builders.filter(Boolean), spread, unifiedAction, recordKeys: [...recordKeys], focus };
}

/** Clause 10 against the entry and host texts; returns failure lines. */
export function storeRowFailures(d, entryText, hostText, panesKey) {
    const fails = [];
    const moved = [];
    if (!d.actions.includes(CREATORS[0]) || d.actions.length < 2) moved.push(`stageWebRuntimeBrowserTab calls [${d.actions.join(', ')}]`);
    if (!d.handleKeys.length) moved.push('no handle key set to true');
    if (!d.discard) moved.push('no exported cleanup discard');
    if (d.builders.length !== 2 || !d.spread || !d.unifiedAction || !d.recordKeys.length) moved.push(`createBrowserTab's builders [${d.builders.join(', ')}], spread ${d.spread}, unified action ${d.unifiedAction}, record keys [${d.recordKeys.join(', ')}]`);
    if (!d.focus) moved.push('no browser slice action takes browserPageId second');
    if (moved.length) return [`source moved: store-row derivation (${moved.join('; ')})`];
    const add = functionNamed(entryText, REL.entry, 'addBrowserPage');
    const remove = functionNamed(entryText, REL.entry, 'removeBrowserPage');
    const select = functionNamed(entryText, REL.entry, 'selectBrowserPage');
    if (!add || !remove || !select) return [`the pane entry lacks ${[!add && 'addBrowserPage', !remove && 'removeBrowserPage', !select && 'selectBrowserPage'].filter(Boolean).join(', ')} (D-34)`];
    const addCalls = callsUnder(add);
    const want = [...d.builders, d.spread, d.unifiedAction, ...d.actions.filter((a) => a !== CREATORS[0])];
    for (const name of want) if (!addCalls.some((c) => c.name === name)) fails.push(`addBrowserPage does not call Orca's ${name} (D-34)`);
    const written = new Set();
    walk(add, (n) => { if (ts.isPropertyAssignment(n)) written.add(n.name.getText()); });
    for (const k of d.recordKeys) if (!written.has(k)) fails.push(`addBrowserPage does not write the record key ${k}`);
    const unified = addCalls.find((c) => c.name === d.unifiedAction);
    if (unified && !(unified.call.arguments.some((a) => stringOf(a) === 'browser') && unified.call.arguments.some((a) => ts.isObjectLiteralExpression(a) && a.properties.some((p) => ts.isPropertyAssignment(p) && p.name.getText() === 'activate' && p.initializer.kind === ts.SyntaxKind.FalseKeyword)))) {
        fails.push(`addBrowserPage's ${d.unifiedAction} is not a 'browser' tab with activate: false (P66-07)`);
    }
    const handle = addCalls.find((c) => c.name !== CREATORS[0] && d.actions.includes(c.name));
    const keys = handle ? trueKeysUnder(handle.call) : new Set();
    for (const k of d.handleKeys) if (handle && !keys.has(k)) fails.push(`addBrowserPage's handle does not set ${k}: true`);
    if (!callsUnder(remove).some((c) => c.name === d.discard)) fails.push(`removeBrowserPage does not call Orca's ${d.discard}`);
    if (!callsUnder(select).some((c) => c.name === d.focus)) fails.push(`selectBrowserPage does not call Orca's ${d.focus}`);
    const hostCalls = hostText ? callsUnder(parse(REL.host, hostText)) : [];
    const count = (n) => hostCalls.filter((c) => c.name === n).length;
    if (count('addBrowserPage') !== 1 || count('removeBrowserPage') < 2) fails.push(`pb-browser-host.ts calls addBrowserPage ${count('addBrowserPage')} time(s) and removeBrowserPage ${count('removeBrowserPage')} (want 1 and closePage plus a user close)`);
    const hostLiterals = new Set();
    if (hostText) walk(parse(REL.host, hostText), (n) => { const v = stringOf(n); if (v !== undefined) hostLiterals.add(v); });
    if (!panesKey || !hostLiterals.has(panesKey)) fails.push(`pb-browser-host.ts does not reach the bundle through ORCA_PANES_MODULE_KEY '${panesKey}'`);
    return fails;
}

// ---------------------------------------------------------------- module graph

/** A resolver over the Orca tree with overlay files standing in at their in-tree paths. */
export function makeResolver(root) {
    const orca = join(root, REL.orca);
    const overlay = join(root, REL.overlay);
    const overlayOf = (p) => (p.startsWith(orca + '/') ? join(overlay, relative(orca, p)) : undefined);
    const real = (p) => { const o = overlayOf(p); return o && existsSync(o) ? o : p; };
    const host = {
        fileExists: (p) => existsSync(real(p)),
        readFile: (p) => { try { return readFileSync(real(p), 'utf8'); } catch { return undefined; } },
        directoryExists: (p) => existsSync(p) || existsSync(overlayOf(p) ?? '\0'),
    };
    let paths = {};
    try { paths = JSON.parse(readFileSync(join(root, REL.webTsconfig), 'utf8')).compilerOptions?.paths ?? {}; } catch { /* no paths */ }
    const options = {
        moduleResolution: ts.ModuleResolutionKind.Bundler, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX,
        allowJs: true, resolveJsonModule: true, baseUrl: join(orca, 'config'), paths,
    };
    /** In-tree path of a file (an overlay file maps to its orca/ path). */
    const inTree = (p) => (p.startsWith(overlay + '/') ? join(orca, relative(overlay, p)) : p);
    return {
        inTree, real,
        resolve(spec, fromInTree) {
            const r = ts.resolveModuleName(spec, fromInTree, options, host).resolvedModule;
            if (!r || r.isExternalLibraryImport || !r.resolvedFileName.startsWith(orca + '/src/') || /\.d\.ts$/.test(r.resolvedFileName)) return undefined;
            return r.resolvedFileName;
        },
    };
}

/** Breadth-first import graph from the entry: Map<inTreePath, parentInTreePath|null>. */
export function walkGraph(root, resolver, entryRel) {
    const start = resolver.inTree(join(root, entryRel));
    const parent = new Map([[start, null]]);
    const queue = [start];
    while (queue.length) {
        const file = queue.shift();
        let text;
        try { text = readFileSync(resolver.real(file), 'utf8'); } catch { continue; }
        for (const spec of deriveSpecifiers(text, file)) {
            const target = resolver.resolve(spec, file);
            if (target && !parent.has(target)) { parent.set(target, file); queue.push(target); }
        }
    }
    return parent;
}

/** The page-mounting components (rule a), as in-tree absolute paths. */
export function derivePageMounting(root, resolver) {
    const dir = join(root, REL.browserPane);
    const files = sourceFiles(dir);
    const text = new Map(files.map((f) => [f, readFileSync(f, 'utf8')]));
    const surfaces = new Set(files.filter((f) => isPageSurface(text.get(f), f)));
    const edges = new Map(files.map((f) => [f, deriveSpecifiers(text.get(f), f).map((s) => resolver.resolve(s, f)).filter((t) => t && t.startsWith(dir + '/'))]));
    const reaches = new Map();
    const visit = (f, seen = new Set()) => {
        if (reaches.has(f)) return reaches.get(f);
        if (seen.has(f)) return false;
        seen.add(f);
        const r = surfaces.has(f) || (edges.get(f) ?? []).some((t) => visit(t, seen));
        reaches.set(f, r);
        return r;
    };
    return { surfaces, mounting: files.filter((f) => f.endsWith('.tsx') && visit(f)).sort() };
}

export function deriveCallers(root) {
    const out = Object.fromEntries(CREATORS.map((c) => [c, []]));
    for (const f of sourceFiles(join(root, REL.renderer))) {
        const text = readFileSync(f, 'utf8');
        for (const c of CREATORS) if (callsOf(text, f, c)) out[c].push(f);
    }
    return out;
}

/** Direct importers of `target` among renderer files (text-filtered on its base name, then resolved). */
function importersOf(root, resolver, target) {
    const base = target.replace(/^.*\//, '').replace(/\.tsx?$/, '');
    return sourceFiles(join(root, REL.renderer)).filter((f) => {
        const text = readFileSync(f, 'utf8');
        return text.includes(base) && deriveSpecifiers(text, f).some((s) => resolver.resolve(s, f) === target);
    });
}

// ---------------------------------------------------------------- the check

export function check(root = REPO_ROOT) {
    const fails = [];
    const skips = [];
    const lines = [];
    const notes = {};
    if (!loadTypescript()) return { fails, skips: ['theia/node_modules/typescript is not installed (yarn install in theia/)'], lines, notes };
    if (!existsSync(join(root, REL.orca, 'src'))) return { fails, skips: ['no fetched Orca tree (orca/src absent); run scripts/fetch-orca.sh'], lines, notes };
    const read = (rel) => readFileSync(join(root, rel), 'utf8');
    const rel = (p) => relative(root, p);
    const resolver = makeResolver(root);

    // a, d, clause 1.
    const { mounting } = derivePageMounting(root, resolver);
    if (!mounting.length) fails.push(`source moved: no page-mounting component derived under ${REL.browserPane}/`);
    if (!existsSync(join(root, REL.entry))) return { fails: [...fails, `the pane entry ${REL.entry} is absent`], skips, lines, notes };
    const graph = walkGraph(root, resolver, REL.entry);
    const chain = (f) => { const out = []; for (let p = f; p; p = graph.get(p)) out.unshift(rel(p)); return out.join(' -> '); };
    for (const m of mounting) if (graph.has(m)) fails.push(`the pane entry reaches page-mounting component ${rel(m)} (${chain(m)})`);
    notes.graph = graph.size;
    notes.mounting = mounting.map(rel);

    // c, clause 4.
    const members = deriveTabContentTypes(read(REL.tabTypes));
    if (!members.length) fails.push(`source moved: TabContentType in ${REL.tabTypes} parsed to zero members`);
    else if (!members.includes('browser')) fails.push(`TabContentType has no browser member (${members.join(', ')})`);

    // clause 2.
    const row = deriveRouteRow(read(REL.routes), 'ORCA_PANE_ROUTES', 'browser');
    if (row?.target !== 'pb-web-tab') fails.push(`the orca-panes browser route targets ${row?.target ?? 'nothing'}, not pb-web-tab (${REL.routes})`);

    // b, clause 3.
    const callers = deriveCallers(root);
    notes.callers = {};
    for (const c of CREATORS) {
        if (!callers[c].length) fails.push(`source moved: no caller of ${c} under ${REL.renderer}/`);
        notes.callers[c] = callers[c].length;
        for (const f of callers[c]) {
            if (graph.has(f)) lines.push(`${c}: reachable ${rel(f)} -- ${REACHABLE}`);
            else {
                const importers = importersOf(root, resolver, f).map(rel);
                lines.push(`${c}: dead ${rel(f)} -- no import path from the pane entry reaches it; importers ${importers.length ? importers.slice(0, 3).join(', ') + (importers.length > 3 ? `, +${importers.length - 3}` : '') : 'none'}, none in the graph`);
            }
        }
    }
    notes.reachable = lines.filter((l) => l.includes(': reachable ')).length;
    notes.dead = lines.filter((l) => l.includes(': dead ')).length;

    // clause 5: the served prefix.
    const module = read(REL.module);
    const hostPrefix = constValue(module, REL.module, 'HOST_PREFIX');
    const routePrefix = constValue(read(REL.protocol), REL.protocol, 'ORCA_PANES_ROUTE_PREFIX');
    if (!hostPrefix || hostPrefix !== routePrefix) fails.push(`served prefix mismatch: HOST_PREFIX '${hostPrefix}' in ${REL.module}, ORCA_PANES_ROUTE_PREFIX '${routePrefix}' in ${REL.protocol}`);
    if (!/app\.use\(\s*ORCA_PANES_ROUTE_PREFIX\b/.test(read(REL.backend))) fails.push(`served prefix: ${REL.backend} does not serve ORCA_PANES_ROUTE_PREFIX`);

    // Clause 10: the entry's store row (D-34).
    const storeRow = deriveStoreRow(read);
    notes.storeRow = storeRow;
    fails.push(...storeRowFailures(storeRow, read(REL.entry), existsSync(join(root, REL.host)) ? read(REL.host) : '', constValue(read(REL.paneBundle), REL.paneBundle, 'ORCA_PANES_MODULE_KEY')));

    // Cross-lane clauses 6-9.
    if (!existsSync(join(root, REL.link))) {
        notes.crossLane = 'skip';
    } else {
        notes.crossLane = 'compared';
        const linkInTree = resolver.inTree(join(root, REL.link));
        if (!deriveSpecifiers(read(REL.entry), REL.entry).some((s) => resolver.resolve(s, resolver.inTree(join(root, REL.entry))) === linkInTree)) {
            fails.push(`the pane entry ${REL.entry} does not import the browser host link ${REL.link}`);
        }
        const link = read(REL.link);
        if (!assignsPlacement(link, REL.link)) fails.push(`the browser host link does not assign prepareBrowserClientHostPlacement (A3 a)`);
        const hostExports = constValue(module, REL.module, 'HOST_EXPORTS');
        const exported = existsSync(join(root, REL.host)) ? deriveNamedExports(read(REL.host), REL.host) : [];
        const want = new Set(hostExports ?? []);
        const got = new Set(exported);
        if (!want.size || [...want].some((n) => !got.has(n)) || [...got].some((n) => !want.has(n))) {
            fails.push(`host export names [${[...got].sort().join(', ')}] in ${REL.host} differ from HOST_EXPORTS [${[...want].sort().join(', ')}]`);
        }
        const literals = new Set();
        walk(parse(REL.link, link), (n) => { const s = stringOf(n); if (s !== undefined) literals.add(s); });
        for (const key of ['LINK_KEY', 'LINK_EVENT']) {
            const v = constValue(module, REL.module, key);
            if (!v || !literals.has(v)) fails.push(`${key === 'LINK_KEY' ? 'link key' : 'link event'} '${v}' of ${REL.module} is not a literal of ${REL.link}`);
        }
    }
    return { fails, skips, lines, notes };
}

// ---------------------------------------------------------------- self-test

const FIX_STORE_ROW = {
    staging: [
        "import { useAppStore } from '../store'",
        'export function stageWebRuntimeBrowserTab(args: any) {',
        '  const state = useAppStore.getState()',
        "  const workspace = state.createBrowserTab(args.worktreeId, 'about:blank', { activate: args.activate })",
        '  const pageId = useAppStore.getState().browserPagesByWorkspace[workspace.id]?.find(() => true)?.id',
        '  useAppStore.getState().setRemoteBrowserPageHandle(pageId, { environmentId: args.environmentId, remotePageId: args.remotePageId, staged: true, ...(args.clientHosted ? { stagedClientHosted: true } : {}) })',
        '  console.warn(pageId)',
        '}',
        'export function discardStagedWebRuntimeBrowserTab(staged: any) {',
        "  useAppStore.getState().closeBrowserTab(staged.workspaceId, { reason: 'cleanup' })",
        '}',
        '',
    ].join('\n'),
    tabActions: [
        'export function createBrowserTabActions(set: any, get: any) {',
        '  return {',
        '    createBrowserTab: (worktreeId: string, url: string, options: any) => {',
        '      const page = buildBrowserPage(worktreeId, url)',
        '      const browserTab = buildWorkspaceFromPage(worktreeId, page)',
        '      set((s: any) => ({ browserTabsByWorktree: { [worktreeId]: [browserTab] }, browserPagesByWorkspace: { [browserTab.id]: [page] }, ...browserTabOpenView(s, worktreeId, browserTab, page, options) }))',
        "      const state = get()",
        "      state.createUnifiedTab(worktreeId, 'browser', { entityId: browserTab.id, activate: options?.activate ?? true })",
        '      return browserTab',
        '    }',
        '  }',
        '}',
        '',
    ].join('\n'),
    focusActions: 'export const focus = (set: any, get: any) => ({\n  focusBrowserTabInWorktree: (worktreeId: string, browserPageId: string) => { get().activateTab(browserPageId) }\n})\n',
    entry: [
        'export function addBrowserPage(worktreeId: string, browserPageId: string) {',
        '  const page = buildBrowserPage(worktreeId, browserPageId)',
        '  const workspace = buildWorkspaceFromPage(worktreeId, page)',
        '  useAppStore.setState((s: any) => ({ browserTabsByWorktree: { [worktreeId]: [workspace] }, browserPagesByWorkspace: { [workspace.id]: [page] }, ...browserTabOpenView(s, worktreeId, workspace, page, { activate: false }) }))',
        '  const state = useAppStore.getState()',
        '  state.setRemoteBrowserPageHandle(page.id, { environmentId: "e", remotePageId: browserPageId, staged: true, stagedClientHosted: true })',
        "  state.createUnifiedTab(worktreeId, 'browser', { entityId: workspace.id, activate: false })",
        '  return true',
        '}',
        'export function removeBrowserPage(browserPageId: string) { discardStagedWebRuntimeBrowserTab({ workspaceId: browserPageId }) }',
        'export function selectBrowserPage(browserPageId: string) { useAppStore.getState().focusBrowserTabInWorktree("w", browserPageId); return true }',
        '',
    ].join('\n'),
    host: [
        "const PANES_MODULE_KEY = Symbol.for('powerbrowser.orca-panes.module')",
        'const rows = (): any => (globalThis as any)[PANES_MODULE_KEY]',
        "function followRow(event: any) { if (event.command.type === 'createPage') rows()?.addBrowserPage?.(event.command.workspaceId, event.browserPageId); else rows()?.removeBrowserPage?.(event.browserPageId) }",
        'function userClosed(id: string) { rows()?.removeBrowserPage?.(id) }',
        '',
    ].join('\n'),
};

const FIX = {
    paneDir: `${REL.browserPane}`,
    entryImports: ["import { openBrowser } from '@/runtime/open-browser'", "import './browser-host/pb-browser-host-link'", "import { Bar } from '@/components/browser-pane/BrowserAddressBar'"],
};

function buildFixture(tmp) {
    const put = (rel, body) => { mkdirSync(dirname(join(tmp, rel)), { recursive: true }); writeFileSync(join(tmp, rel), body); };
    const copy = (rel) => put(rel, readFileSync(join(REPO_ROOT, rel), 'utf8'));
    put(REL.tabTypes, "export type TabContentType =\n  | 'terminal'\n  | 'browser'\n\nexport const x = 1\n");
    put(REL.webTsconfig, JSON.stringify({ compilerOptions: { paths: { '@renderer/*': ['../src/renderer/src/*'], '@/*': ['../src/renderer/src/*'] } } }));
    const pane = (p, body) => put(`${FIX.paneDir}/${p}`, body);
    pane('host-guest/browser-page-webview.ts', "export function guest() { return document.createElement('webview') }\n");
    pane('BrowserPane.tsx', "import { guest } from './host-guest/browser-page-webview'\nexport default function BrowserPane() { guest(); return <div /> }\n");
    pane('ClientHostedBrowserPagePane.tsx', 'export function ClientHostedBrowserPagePane() { return <webview /> }\n');
    pane('stream-remote/remote-browser-page-viewport.tsx', 'export function Viewport({ f }: { f: () => void }) { return <img onPointerDown={f} /> }\n');
    pane('stream-remote/remote-browser-page-pane.tsx', "import { Viewport } from './remote-browser-page-viewport'\nexport function RemotePane() { return <Viewport f={() => {}} /> }\n");
    pane('BrowserAddressBar.tsx', 'export function Bar() { return <input /> }\n');
    put(`${REL.renderer}/src/store/browser-tab-actions.ts`, 'export const createBrowserTab = (url: string) => url\n');
    put(`${REL.renderer}/src/components/tab-bar/new-browser-tab.ts`, "import { createBrowserTab } from '@/store/browser-tab-actions'\nexport const plus = () => createBrowserTab('about:blank')\n");
    put(`${REL.renderer}/src/runtime/web-runtime-browser-creation.ts`, 'export async function createWebRuntimeSessionBrowserTab(url: string) { return url }\n');
    put(`${REL.renderer}/src/runtime/open-browser.ts`, "import { createWebRuntimeSessionBrowserTab } from './web-runtime-browser-creation'\nexport const openBrowser = () => createWebRuntimeSessionBrowserTab('https://x.test')\n");
    put(REL.entry, `${FIX.entryImports.join('\n')}\nexport const PANE = [openBrowser, Bar]\n${FIX_STORE_ROW.entry}`);
    put(REL.link, "const LINK = Symbol.for('powerbrowser.orca-browser.link')\nexport function link(id: string) {\n  ;(window as any).api.runtimeEnvironments.prepareBrowserClientHostPlacement = () => ({ kind: 'client', browserHostClientId: id })\n  window.dispatchEvent(new Event('powerbrowser-orca-browser-link'))\n  return LINK\n}\n");
    put(REL.host, `export const PB_BROWSER_HOST_API = 1\nexport async function attachBrowserHost() { return undefined }\n${FIX_STORE_ROW.host}`);
    put(REL.staging, FIX_STORE_ROW.staging);
    put(REL.tabActions, FIX_STORE_ROW.tabActions);
    put(REL.focusActions, FIX_STORE_ROW.focusActions);
    for (const r of [REL.routes, REL.protocol, REL.backend, REL.module, REL.paneBundle]) copy(r);
}

const sub = (from, to) => (s) => { const out = s.replace(from, to); return out; };
export const PLANTS = [
    { name: 'new-page-mounting-component-reached', naming: 'reaches page-mounting component orca/src/renderer/src/components/browser-pane/PlantedSurface.tsx', file: REL.entry, edit: (s) => `import { Planted } from '@/components/browser-pane/PlantedSurface'\n${s}`, extra: { rel: `${REL.browserPane}/PlantedSurface.tsx`, body: 'export function Planted() { return <webview /> }\n' } },
    { name: 'screencast-pane-imported', naming: 'reaches page-mounting component orca/src/renderer/src/components/browser-pane/stream-remote/remote-browser-page-pane.tsx', file: REL.entry, edit: (s) => `import '@/components/browser-pane/stream-remote/remote-browser-page-pane'\n${s}` },
    { name: 'browser-route-hosted-pane', naming: 'browser route targets hosted-pane', file: REL.routes, edit: sub("'browser': { target: 'pb-web-tab' }", "'browser': { target: 'hosted-pane', word: 'web' }") },
    { name: 'tab-content-type-empty', naming: 'source moved: TabContentType', file: REL.tabTypes, edit: () => 'export type TabContentType = string\n' },
    { name: 'session-creator-left-out', naming: 'no caller of createWebRuntimeSessionBrowserTab', file: `${REL.renderer}/src/runtime/open-browser.ts`, edit: (s) => s.replaceAll('createWebRuntimeSessionBrowserTab', 'createRenamedBrowserTab') },
    { name: 'link-import-missing', naming: 'does not import the browser host link', file: REL.entry, edit: sub(`${FIX.entryImports[1]}\n`, '') },
    { name: 'link-without-placement', naming: 'does not assign prepareBrowserClientHostPlacement', file: REL.link, edit: sub('.prepareBrowserClientHostPlacement = ', '.otherPlacement = ') },
    { name: 'host-export-differs', naming: 'differ from HOST_EXPORTS', file: REL.host, edit: sub('export async function attachBrowserHost', 'export async function attachHost') },
    { name: 'prefix-mismatch', naming: 'served prefix mismatch', file: REL.module, edit: sub("export const HOST_PREFIX = '/orca-panes/';", "export const HOST_PREFIX = '/orca-browser/';") },
    { name: 'link-key-differs', naming: 'link key', file: REL.link, edit: sub("Symbol.for('powerbrowser.orca-browser.link')", "Symbol.for('powerbrowser.orca-browser.planted')") },
    { name: 'row-without-handle', naming: "addBrowserPage does not call Orca's setRemoteBrowserPageHandle", file: REL.entry, edit: sub('  state.setRemoteBrowserPageHandle(', '  state.otherHandle(') },
    { name: 'row-activated-at-create', naming: "is not a 'browser' tab with activate: false", file: REL.entry, edit: sub("'browser', { entityId: workspace.id, activate: false }", "'browser', { entityId: workspace.id, activate: true }") },
    { name: 'row-not-client-hosted', naming: 'does not set stagedClientHosted: true', file: REL.entry, edit: sub(', stagedClientHosted: true })', ' })') },
    { name: 'row-record-key-missing', naming: 'does not write the record key browserPagesByWorkspace', file: REL.entry, edit: sub(' browserPagesByWorkspace: { [workspace.id]: [page] },', '') },
    { name: 'row-spread-missing', naming: "does not call Orca's browserTabOpenView", file: REL.entry, edit: sub(', ...browserTabOpenView(s, worktreeId, workspace, page, { activate: false })', '') },
    { name: 'remove-without-discard', naming: "does not call Orca's discardStagedWebRuntimeBrowserTab", file: REL.entry, edit: sub('{ discardStagedWebRuntimeBrowserTab(', '{ keepRow(') },
    { name: 'select-without-focus', naming: "does not call Orca's focusBrowserTabInWorktree", file: REL.entry, edit: sub('.focusBrowserTabInWorktree("w"', '.activateTab("w"') },
    { name: 'entry-without-select', naming: 'lacks selectBrowserPage', file: REL.entry, edit: sub('export function selectBrowserPage(', 'export function chooseBrowserPage(') },
    { name: 'host-user-close-keeps-row', naming: 'removeBrowserPage 1', file: REL.host, edit: sub('{ rows()?.removeBrowserPage?.(id) }', '{ return id }') },
    { name: 'host-key-differs', naming: 'ORCA_PANES_MODULE_KEY', file: REL.host, edit: sub("Symbol.for('powerbrowser.orca-panes.module')", "Symbol.for('powerbrowser.orca-panes.planted')") },
    { name: 'pinned-handle-action-renamed', naming: "does not call Orca's setRemoteBrowserPageHandleV2", file: REL.staging, edit: (s) => s.replace('getState().setRemoteBrowserPageHandle(', 'getState().setRemoteBrowserPageHandleV2(') },
    { name: 'staging-source-moved', naming: 'source moved: store-row derivation', file: REL.staging, edit: sub('export function stageWebRuntimeBrowserTab(', 'export function stageBrowserTab(') },
    { name: 'link-event-differs', naming: 'link event', file: REL.link, edit: sub("new Event('powerbrowser-orca-browser-link')", "new Event('powerbrowser-orca-browser-planted')") },
];

function runSelfTest() {
    if (!loadTypescript()) { console.log(`${NAME} self-test: SKIP -- theia/node_modules/typescript is not installed`); return 0; }
    const tmp = mkdtempSync(join(tmpdir(), `${NAME}-`));
    try {
        buildFixture(tmp);
        const control = check(tmp);
        const deadOk = control.lines.some((l) => l.includes('createBrowserTab: dead'));
        const liveOk = control.lines.some((l) => l.includes('createWebRuntimeSessionBrowserTab: reachable'));
        if (control.fails.length || control.skips.length || control.notes.crossLane !== 'compared' || !deadOk || !liveOk) {
            console.error(`${NAME} self-test: FAIL -- control is not green with the cross-lane clauses compared and one dead and one reachable caller: ${[...control.fails, ...control.skips, ...control.lines].join(' | ')}`);
            return 1;
        }
        console.log(`${NAME} self-test: control green -- ${control.notes.mounting.length} page-mounting components, ${control.notes.graph} modules in the entry graph, one dead and one reachable caller, cross-lane clauses compared`);
        let failures = 0;
        for (const p of PLANTS) {
            const file = join(tmp, p.file);
            const original = readFileSync(file, 'utf8');
            const planted = p.edit(original);
            if (planted === original) { console.error(`  FAIL ${p.name} -> the plant did not apply (its anchor text moved)`); failures++; continue; }
            writeFileSync(file, planted);
            if (p.extra) { mkdirSync(dirname(join(tmp, p.extra.rel)), { recursive: true }); writeFileSync(join(tmp, p.extra.rel), p.extra.body); }
            const r = check(tmp);
            writeFileSync(file, original);
            if (p.extra) rmSync(join(tmp, p.extra.rel));
            const text = r.fails.join('\n');
            if (!r.fails.length) { console.error(`  FAIL ${p.name} -> stayed green`); failures++; } else if (!text.includes(p.naming)) {
                console.error(`  FAIL ${p.name} -> red, but not naming '${p.naming}': ${text}`); failures++;
            } else console.log(`  ok ${p.name} -> red, naming '${p.naming}'`);
        }
        // The link absent is the named SKIP of clauses 6-9 only; with the link present and the entry import gone it is red (plant link-import-missing).
        rmSync(join(tmp, REL.link));
        const skipped = check(tmp);
        if (skipped.fails.length || skipped.notes.crossLane !== 'skip') { console.error(`  FAIL cross-lane-skip -> ${skipped.fails.join(' | ') || skipped.notes.crossLane}`); failures++; } else console.log("  ok cross-lane-skip -> clauses 6-9 SKIP with lane p66-01's link absent");
        if (failures) { console.error(`${NAME} self-test: FAIL -- ${failures} case(s) did not behave`); return 1; }
        console.log(`${NAME} self-test: PASS -- ${PLANTS.length} planted faults each went red naming the drift`);
        return 0;
    } finally {
        rmSync(tmp, { recursive: true, force: true });
    }
}

function main() {
    const r = check();
    if (r.skips.length) { console.log(`${NAME}: SKIP -- ${r.skips.join('; ')}`); return 0; }
    console.log(`${NAME}: page-mounting components (${r.notes.mounting?.length ?? 0}): ${(r.notes.mounting ?? []).join(', ')}`);
    r.lines.forEach((l) => console.log(`  ${l}`));
    if (r.fails.length) { console.error(`${NAME}: FAIL`); r.fails.forEach((f) => console.error(`  ${f}`)); return 1; }
    const callers = CREATORS.map((c) => `${r.notes.callers[c]} ${c}`).join(', ');
    const row = r.notes.storeRow;
    console.log(`${NAME}: store row (D-34): addBrowserPage runs ${[...row.builders, row.spread, row.unifiedAction, ...row.actions.filter((a) => a !== CREATORS[0])].join(', ')} with ${row.handleKeys.join(', ')}; removeBrowserPage runs ${row.discard}; selectBrowserPage runs ${row.focus} (derived from the pin)`);
    console.log(`${NAME}: PASS -- the pane entry's graph (${r.notes.graph} modules) reaches none of the ${r.notes.mounting.length} page-mounting components; browser routes to pb-web-tab; callers ${callers}: ${r.notes.reachable} reachable, ${r.notes.dead} dead; served prefix equals the orca-panes route; cross-lane clauses ${r.notes.crossLane === 'compared' ? 'compared' : 'SKIP ("lane p66-01 not merged")'}`);
    return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const arg = process.argv[2];
    if (arg && arg !== '--self-test') { console.error('usage: node scripts/verify-orca-browser-entry-points.mjs [--self-test]'); process.exit(2); }
    process.exit(arg === '--self-test' ? runSelfTest() : main());
}
