#!/usr/bin/env node
// scripts/verify-orca-pane-routes.mjs
//
// orca-pane-routes (Phase 64, TAB-02/TAB-04/TAB-06/TERM-01; P64-01, P64-25,
// P64-31, P64-35; criterion 4): every Orca tab content type has exactly one
// route in @powerbrowser/orca-panes, the pb-orca: words are the documented
// ones, the loader agrees with the pane bundle it loads, and nothing in
// PowerBrowser creates an Orca terminal on the client side.
//
// Derived at check time with theia/node_modules/typescript (never by line grep):
//  a. the TabContentType union members, from the fetched orca/src/shared/tab-types.ts,
//     compared as a set with ORCA_PANE_ROUTES' keys (orca-pane-routes.ts);
//  b. each route value: a target of hosted-pane, theia-editor or pb-web-tab, or
//     pending with a requirement id of the REQUIREMENTS form; a hosted-pane row
//     carries its word;
//  c. the hosted-pane words, compared as a set with the backticked word column of
//     the "## `pb-orca:`" section of docs/URI-SCHEMES.md;
//  d. the members of OrcaPaneBundleApi (orca-panes-protocol.ts), each a named
//     export of the pane entry orca-overlay/files/src/renderer/src/pb/pb-pane-mount.tsx,
//     and ORCA_PANES_REACT_KEY equal to the KEY literal of
//     orca-overlay/files/vite.pb-panes.config.ts (SKIP for this clause only while
//     the entry is absent, lane p64-01 not merged);
//  e. the route targets the observer branches on (string literals compared with a
//     .target in orca-pane-observer.ts), compared as a set with the targets the
//     table uses, so a target added to the table without a handler is red;
//  f. every import specifier in orca-panes' sources and in orca-overlay/files: none
//     reaches Orca's terminal-tab-create, web-runtime-terminal-creation or
//     web-runtime-terminal-create-operation modules, and no such source holds
//     the client-side terminal-creation method string (A4, the mirror freeze);
//  g. ORCA_PANES_MODULE_KEY and ORCA_PANES_BOOT_EVENT of orca-pane-bundle.ts, each
//     a string literal of scripts/lib/orca-tabs-live.mjs, the live harness that
//     reaches the bundle through them (SKIP for this clause only while that file
//     is absent, lane p64-04 not merged).
// A clause that reads another lane's file is red, never SKIP, when the file is
// present but missing the item it reads.
//
// Tier: quick. One named SKIP when orca/ is not fetched or
// theia/node_modules/typescript is absent. --self-test runs the check on copies
// in a mkdtemp directory and plants faults; each must go red naming its drift.
//
// Usage:
//   node scripts/verify-orca-pane-routes.mjs
//   node scripts/verify-orca-pane-routes.mjs --self-test

import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'orca-pane-routes';
const SELF_REL = 'scripts/verify-orca-pane-routes.mjs';
const TS_DIR = join(REPO_ROOT, 'theia', 'node_modules', 'typescript');

const REL = {
    tabTypes: 'orca/src/shared/tab-types.ts',
    routes: 'theia/extensions/orca-panes/src/browser/orca-pane-routes.ts',
    protocol: 'theia/extensions/orca-panes/src/common/orca-panes-protocol.ts',
    observer: 'theia/extensions/orca-panes/src/browser/orca-pane-observer.ts',
    loader: 'theia/extensions/orca-panes/src/browser/orca-pane-bundle.ts',
    panesSrc: 'theia/extensions/orca-panes/src',
    doc: 'docs/URI-SCHEMES.md',
    entry: 'orca-overlay/files/src/renderer/src/pb/pb-pane-mount.tsx',
    viteConfig: 'orca-overlay/files/vite.pb-panes.config.ts',
    overlayFiles: 'orca-overlay/files',
    tabsLive: 'scripts/lib/orca-tabs-live.mjs',
};
const TARGETS = ['hosted-pane', 'theia-editor', 'pb-web-tab', 'pending'];
const REQUIREMENT_ID = /^[A-Z]+-\d{2}$/;
const CREATION_MODULES = ['terminal-tab-create', 'web-runtime-terminal-creation', 'web-runtime-terminal-create-operation'];
const CREATION_METHOD = ['session', 'tabs', 'createTerminal'].join('.');

let ts;

const parse = (file, text) => ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true,
    /\.(m|c)?js$/.test(file) ? ts.ScriptKind.JS : file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

function walk(node, visit) {
    visit(node);
    ts.forEachChild(node, (c) => walk(c, visit));
}

function sourceFiles(dir, pattern) {
    const out = [];
    if (!existsSync(dir)) return out;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) out.push(...sourceFiles(p, pattern));
        else if (pattern.test(e.name) && !e.name.endsWith('.d.ts')) out.push(p);
    }
    return out;
}

const stringOf = (node) => (node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : undefined);
const nameOf = (node) => (ts.isIdentifier(node) || ts.isStringLiteral(node) ? node.text : node.getText());

function constInitializer(sf, name) {
    let found;
    walk(sf, (n) => { if (ts.isVariableDeclaration(n) && n.name.getText() === name) found = n.initializer; });
    return found;
}

function unwrap(node) {
    while (node && (ts.isCallExpression(node) || ts.isAsExpression(node) || ts.isParenthesizedExpression(node) || (ts.isSatisfiesExpression && ts.isSatisfiesExpression(node)))) {
        node = ts.isCallExpression(node) ? node.arguments[0] : node.expression;
    }
    return node;
}

// ---------------------------------------------------------------- derivations (pure)

export function deriveContentTypes(text) {
    const sf = parse('tab-types.ts', text);
    let members = [];
    walk(sf, (n) => {
        if (!ts.isTypeAliasDeclaration(n) || n.name.text !== 'TabContentType') return;
        const types = ts.isUnionTypeNode(n.type) ? n.type.types : [n.type];
        members = types.filter((t) => ts.isLiteralTypeNode(t) && ts.isStringLiteral(t.literal)).map((t) => t.literal.text);
    });
    return members;
}

export function deriveRoutes(text) {
    const obj = unwrap(constInitializer(parse('orca-pane-routes.ts', text), 'ORCA_PANE_ROUTES'));
    if (!obj || !ts.isObjectLiteralExpression(obj)) return undefined;
    const routes = {};
    for (const p of obj.properties) {
        if (!ts.isPropertyAssignment(p)) continue;
        const value = {};
        if (ts.isObjectLiteralExpression(p.initializer)) {
            for (const q of p.initializer.properties) if (ts.isPropertyAssignment(q)) value[nameOf(q.name)] = stringOf(q.initializer);
        }
        routes[nameOf(p.name)] = value;
    }
    return routes;
}

export function deriveDocWords(doc) {
    const start = doc.indexOf('## `pb-orca:`');
    if (start < 0) return undefined;
    const end = doc.indexOf('\n## ', start + 1);
    const section = doc.slice(start, end < 0 ? undefined : end);
    return section.split('\n').map((l) => /^\|\s*`([^`]+)`\s*\|/.exec(l)?.[1]).filter(Boolean);
}

export function deriveInterfaceMembers(text, name) {
    let members;
    walk(parse('protocol.ts', text), (n) => {
        if (ts.isInterfaceDeclaration(n) && n.name.text === name) members = n.members.filter((m) => m.name).map((m) => nameOf(m.name));
    });
    return members;
}

export function deriveNamedExports(text, file = 'entry.tsx') {
    const sf = parse(file, text);
    const names = [];
    const exported = (n) => (ts.getCombinedModifierFlags ? (ts.getCombinedModifierFlags(n) & ts.ModifierFlags.Export) !== 0 : false);
    for (const s of sf.statements) {
        if ((ts.isFunctionDeclaration(s) || ts.isClassDeclaration(s)) && s.name && exported(s)) names.push(s.name.text);
        if (ts.isVariableStatement(s) && (s.modifiers ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
            for (const d of s.declarationList.declarations) if (ts.isIdentifier(d.name)) names.push(d.name.text);
        }
        if (ts.isExportDeclaration(s) && s.exportClause && ts.isNamedExports(s.exportClause)) {
            for (const e of s.exportClause.elements) names.push(e.name.text);
        }
    }
    return names;
}

export function deriveObserverTargets(text) {
    const found = new Set();
    walk(parse('orca-pane-observer.ts', text), (n) => {
        if (ts.isBinaryExpression(n) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(n.operatorToken.kind)) {
            const [lit, other] = stringOf(n.left) !== undefined ? [n.left, n.right] : [n.right, n.left];
            if (stringOf(lit) !== undefined && /\.target$/.test(other.getText())) found.add(stringOf(lit));
        }
        if (ts.isCaseClause(n) && /\.target$/.test(n.parent.parent.expression.getText()) && stringOf(n.expression) !== undefined) found.add(stringOf(n.expression));
    });
    return [...found];
}

export function deriveSpecifiers(text, file) {
    const specs = [];
    walk(parse(file, text), (n) => {
        if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier) specs.push(stringOf(n.moduleSpecifier));
        if (ts.isCallExpression(n) && (n.expression.kind === ts.SyntaxKind.ImportKeyword || n.expression.getText() === 'require') && stringOf(n.arguments[0]) !== undefined) {
            specs.push(stringOf(n.arguments[0]));
        }
        if (ts.isImportTypeNode(n) && ts.isLiteralTypeNode(n.argument)) specs.push(stringOf(n.argument.literal));
    });
    return specs.filter((s) => s !== undefined);
}

export function deriveStringLiterals(text, file) {
    const out = new Set();
    walk(parse(file, text), (n) => { const s = stringOf(n); if (s !== undefined) out.add(s); });
    return out;
}

// ---------------------------------------------------------------- the check

const setDiff = (a, b) => [...a].filter((x) => !b.has(x));

export function check(root) {
    const fails = [];
    const notes = { members: [], targets: [], words: [], d: 'SKIP', g: 'SKIP' };
    const read = (rel) => readFileSync(join(root, rel), 'utf8');
    const has = (rel) => existsSync(join(root, rel));

    // a. content types against the table's keys.
    const members = deriveContentTypes(read(REL.tabTypes));
    notes.members = members;
    if (!members.length) fails.push(`source moved: no TabContentType members derived from ${REL.tabTypes}`);
    const routes = deriveRoutes(read(REL.routes));
    if (!routes) {
        fails.push(`ORCA_PANE_ROUTES object literal not found in ${REL.routes}`);
        return { fails, notes };
    }
    if (members.length) {
        for (const m of setDiff(new Set(members), new Set(Object.keys(routes)))) fails.push(`added content type ${m}: TabContentType member with no route in ORCA_PANE_ROUTES`);
        for (const k of setDiff(new Set(Object.keys(routes)), new Set(members))) fails.push(`removed content type ${k}: route for a kind TabContentType no longer has`);
    }

    // b. each value's target.
    const words = [];
    const tableTargets = new Set();
    for (const [kind, v] of Object.entries(routes)) {
        if (!TARGETS.includes(v.target)) { fails.push(`unknown target kind ${v.target} for ${kind}`); continue; }
        tableTargets.add(v.target);
        if (v.target === 'pending' && !REQUIREMENT_ID.test(v.requirement ?? '')) fails.push(`pending route ${kind} has no requirement id`);
        if (v.target === 'hosted-pane') {
            if (!/^[a-z]+$/.test(v.word ?? '')) fails.push(`hosted route ${kind} has no lowercase word`);
            else words.push(v.word);
        }
    }
    notes.targets = [...tableTargets];
    notes.words = words;

    // c. words against the doc.
    const docWords = deriveDocWords(read(REL.doc));
    if (!docWords) fails.push(`${REL.doc} has no "## \`pb-orca:\`" section`);
    else {
        for (const w of setDiff(new Set(words), new Set(docWords))) fails.push(`word ${w} missing from the doc's pb-orca: word column`);
        for (const w of setDiff(new Set(docWords), new Set(words))) fails.push(`doc word ${w} has no hosted route`);
    }

    // d. the bundle API and the hand-off key against lane p64-01's entry and config.
    const protocol = read(REL.protocol);
    const apiMembers = deriveInterfaceMembers(protocol, 'OrcaPaneBundleApi');
    if (!apiMembers?.length) fails.push(`OrcaPaneBundleApi not found in ${REL.protocol}`);
    if (has(REL.entry)) {
        notes.d = 'compared';
        const exports = new Set(deriveNamedExports(read(REL.entry), REL.entry));
        for (const m of apiMembers ?? []) if (!exports.has(m)) fails.push(`bundle API member ${m} is not a named export of ${REL.entry}`);
        const handOff = stringOf(constInitializer(parse(REL.protocol, protocol), 'ORCA_PANES_REACT_KEY'));
        const viteKey = has(REL.viteConfig) ? stringOf(constInitializer(parse(REL.viteConfig, read(REL.viteConfig)), 'KEY')) : undefined;
        if (handOff === undefined || handOff !== viteKey) fails.push(`hand-off key mismatch: ORCA_PANES_REACT_KEY '${handOff}', ${REL.viteConfig} KEY '${viteKey}'`);
    }

    // e. the observer handles every target the table uses.
    const observed = new Set(deriveObserverTargets(read(REL.observer)));
    for (const t of setDiff(tableTargets, observed)) fails.push(`table target ${t} has no observer branch in ${REL.observer}`);
    for (const t of setDiff(observed, tableTargets)) fails.push(`observer branches on target ${t} that no table row uses`);

    // f. no client-side terminal creation (A4).
    const scanned = [
        ...sourceFiles(join(root, REL.panesSrc), /\.tsx?$/),
        ...sourceFiles(join(root, REL.overlayFiles), /\.(tsx?|jsx?|mjs|cjs)$/),
    ];
    for (const file of scanned) {
        const rel = relative(root, file);
        const text = readFileSync(file, 'utf8');
        for (const spec of deriveSpecifiers(text, file)) {
            const base = spec.split('/').pop().replace(/\.(tsx?|jsx?|mjs|cjs)$/, '');
            if (CREATION_MODULES.includes(base)) fails.push(`client-side terminal creation: ${rel} imports ${spec}`);
        }
        if (text.includes(CREATION_METHOD)) fails.push(`client-side terminal creation: ${rel} holds the ${CREATION_METHOD} method string`);
    }
    if (!scanned.length) fails.push(`no orca-panes source found under ${REL.panesSrc}`);

    // g. the loader's boot handle against lane p64-04's live harness.
    const loaderSf = parse(REL.loader, read(REL.loader));
    const moduleKey = stringOf(constInitializer(loaderSf, 'ORCA_PANES_MODULE_KEY'));
    const bootEvent = stringOf(constInitializer(loaderSf, 'ORCA_PANES_BOOT_EVENT'));
    if (moduleKey === undefined || bootEvent === undefined) fails.push(`ORCA_PANES_MODULE_KEY or ORCA_PANES_BOOT_EVENT not found in ${REL.loader}`);
    else if (has(REL.tabsLive)) {
        notes.g = 'compared';
        const literals = deriveStringLiterals(read(REL.tabsLive), REL.tabsLive);
        if (!literals.has(moduleKey)) fails.push(`module key '${moduleKey}' of the loader is not a literal of ${REL.tabsLive}`);
        if (!literals.has(bootEvent)) fails.push(`boot event '${bootEvent}' of the loader is not a literal of ${REL.tabsLive}`);
    }
    notes.apiMembers = apiMembers ?? [];
    return { fails, notes };
}

// ---------------------------------------------------------------- self-test

// Fixtures for the other lanes' files when they are absent, derived from this tree's own
// literals so the control is green; when present, the real files are copied instead.
function fixtureEntry(root) {
    const members = deriveInterfaceMembers(readFileSync(join(root, REL.protocol), 'utf8'), 'OrcaPaneBundleApi') ?? [];
    return members.map((m) => `export const ${m} = undefined;`).join('\n') + '\n';
}
function fixtureViteConfig(root) {
    const key = stringOf(constInitializer(parse(REL.protocol, readFileSync(join(root, REL.protocol), 'utf8')), 'ORCA_PANES_REACT_KEY'));
    return `const KEY = ${JSON.stringify(key)}\nexport default { KEY }\n`;
}
function fixtureTabsLive(root) {
    const sf = parse(REL.loader, readFileSync(join(root, REL.loader), 'utf8'));
    return `export const MODULE_KEY = ${JSON.stringify(stringOf(constInitializer(sf, 'ORCA_PANES_MODULE_KEY')))};\n`
        + `export const BOOT_EVENT = ${JSON.stringify(stringOf(constInitializer(sf, 'ORCA_PANES_BOOT_EVENT')))};\n`;
}

const PLANT_FILE = 'orca-overlay/files/src/renderer/src/pb/pb-plant.ts';

export const PLANTS = [
    { name: 'content-type-added', naming: 'added content type planted-kind', file: REL.tabTypes, edit: (s) => s.replace("export type TabContentType =\n  | 'terminal'", "export type TabContentType =\n  | 'planted-kind'\n  | 'terminal'") },
    { name: 'content-type-removed', naming: 'removed content type simulator', file: REL.tabTypes, edit: (s) => s.replace(/(export type TabContentType =[\s\S]*?)\n {2}\| 'simulator'/, '$1') },
    { name: 'unknown-target', naming: 'unknown target kind pb-window', file: REL.routes, edit: (s) => s.replace("'browser': { target: 'pending', requirement: 'BRW-02' }", "'browser': { target: 'pb-window', requirement: 'BRW-02' }") },
    { name: 'pending-without-requirement', naming: 'pending route browser has no requirement id', file: REL.routes, edit: (s) => s.replace("'browser': { target: 'pending', requirement: 'BRW-02' }", "'browser': { target: 'pending' }") },
    { name: 'word-missing-from-doc', naming: 'word sim missing from the doc', file: REL.doc, edit: (s) => s.replace(/\n\| `sim` \|[^\n]*/, '') },
    { name: 'extra-doc-word', naming: 'doc word remote has no hosted route', file: REL.doc, edit: (s) => s.replace('| `checks` |', '| `remote` | `terminal` on another host |\n| `checks` |') },
    { name: 'api-member-not-exported', naming: 'bundle API member plantedMember is not a named export', file: REL.protocol, edit: (s) => s.replace('export interface OrcaPaneBundleApi {\n', 'export interface OrcaPaneBundleApi {\n    plantedMember(): void;\n') },
    { name: 'hand-off-key-mismatch', naming: 'hand-off key mismatch', file: REL.viteConfig, edit: (s) => s.replace(/const KEY = (['"])powerbrowser\.orca-panes\.react\1/, "const KEY = 'powerbrowser.orca-panes.planted'") },
    { name: 'target-without-observer-branch', naming: 'table target pb-web-tab has no observer branch', file: REL.routes, edit: (s) => s.replace("'browser': { target: 'pending', requirement: 'BRW-02' }", "'browser': { target: 'pb-web-tab' }") },
    { name: 'creation-import-in-overlay', naming: 'imports ../components/terminal/terminal-tab-create', file: PLANT_FILE, edit: () => "import { createNewTerminalTab } from '../components/terminal/terminal-tab-create'\nexport const plant = createNewTerminalTab\n" },
    { name: 'creation-method-in-orca-panes', naming: `holds the ${CREATION_METHOD} method string`, file: REL.observer, edit: (s) => `${s}\nexport const PLANTED_METHOD = '${CREATION_METHOD}';\n` },
    { name: 'module-key-mismatch', naming: 'module key', file: REL.tabsLive, edit: (s) => s.replace(/powerbrowser\.orca-panes\.module/g, 'powerbrowser.orca-panes.planted') },
    { name: 'empty-union', naming: 'source moved', file: REL.tabTypes, edit: (s) => s.replace(/export type TabContentType =[\s\S]*?\n\n/, 'export type TabContentType = string\n\n') },
];

function runSelfTest() {
    const tmp = mkdtempSync(join(tmpdir(), `${NAME}-`));
    try {
        const put = (rel, text) => { mkdirSync(dirname(join(tmp, rel)), { recursive: true }); writeFileSync(join(tmp, rel), text); };
        const copy = (rel) => { mkdirSync(dirname(join(tmp, rel)), { recursive: true }); cpSync(join(REPO_ROOT, rel), join(tmp, rel), { recursive: true }); };
        for (const rel of [REL.tabTypes, REL.panesSrc, REL.doc]) copy(rel);
        if (existsSync(join(REPO_ROOT, REL.overlayFiles))) copy(REL.overlayFiles);
        const fixtures = [];
        if (!existsSync(join(tmp, REL.entry))) { put(REL.entry, fixtureEntry(tmp)); fixtures.push('entry'); }
        if (!existsSync(join(tmp, REL.viteConfig))) { put(REL.viteConfig, fixtureViteConfig(tmp)); fixtures.push('vite config'); }
        if (existsSync(join(REPO_ROOT, REL.tabsLive))) copy(REL.tabsLive);
        else { put(REL.tabsLive, fixtureTabsLive(tmp)); fixtures.push('orca-tabs-live'); }
        const control = check(tmp);
        if (control.fails.length) { console.error(`${NAME} self-test: FAIL -- control is not green: ${control.fails.join(' | ')}`); return 1; }
        if (control.notes.d !== 'compared' || control.notes.g !== 'compared') { console.error(`${NAME} self-test: FAIL -- control did not compare clauses (d) and (g)`); return 1; }
        console.log(`${NAME} self-test: control green -- copies of the tree's files${fixtures.length ? `, fixtures for the absent ${fixtures.join(', ')}` : ''}; clauses (d) and (g) compared`);
        let failures = 0;
        for (const p of PLANTS) {
            const file = join(tmp, p.file);
            const original = existsSync(file) ? readFileSync(file, 'utf8') : undefined;
            const planted = p.edit(original ?? '');
            if (planted === original) { console.error(`  FAIL ${p.name} -> the plant did not apply (its anchor text moved)`); failures++; continue; }
            put(p.file, planted);
            const r = check(tmp);
            if (original === undefined) rmSync(file); else writeFileSync(file, original);
            const text = r.fails.join('\n');
            if (!r.fails.length) { console.error(`  FAIL ${p.name} -> stayed green`); failures++; } else if (!text.includes(p.naming)) {
                console.error(`  FAIL ${p.name} -> red, but not naming '${p.naming}': ${text}`); failures++;
            } else console.log(`  ok ${p.name} -> red, naming '${p.naming}'`);
        }
        if (failures) { console.error(`${NAME} self-test: FAIL -- ${failures} of ${PLANTS.length} plant(s) did not go red naming the drift`); return 1; }
        console.log(`${NAME} self-test: PASS -- ${PLANTS.length} planted faults each went red naming the drift`);
        return 0;
    } finally {
        rmSync(tmp, { recursive: true, force: true });
    }
}

const isEntryPoint = (() => {
    try { return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();
if (isEntryPoint) {
    const args = process.argv.slice(2);
    if (args.length > 1 || (args.length === 1 && args[0] !== '--self-test')) {
        console.error(`${NAME}: unknown argument ${args[0] === '--self-test' ? args[1] : args[0]} (usage: node ${SELF_REL} [--self-test])`);
        console.error(`Next step: run node ${SELF_REL} for the check, or add --self-test for the planted-fault run.`);
        process.exit(2);
    }
    if (!existsSync(TS_DIR) || !statSync(TS_DIR).isDirectory()) { console.log(`${NAME}: SKIP -- theia/node_modules/typescript is absent; run the audited Theia install`); process.exit(0); }
    if (!existsSync(join(REPO_ROOT, REL.tabTypes))) { console.log(`${NAME}: SKIP -- orca/ is not fetched (${REL.tabTypes} absent); run bash scripts/fetch-orca.sh`); process.exit(0); }
    ts = createRequire(import.meta.url)(TS_DIR);
    if (args[0] === '--self-test') process.exit(runSelfTest());
    const r = check(REPO_ROOT);
    if (r.fails.length) { for (const f of r.fails) console.error(`${NAME}: FAIL -- ${f}`); process.exit(1); }
    const n = r.notes;
    console.log(`${NAME}: PASS -- ${n.members.length} TabContentType members (${n.members.join(', ')}) equal ORCA_PANE_ROUTES' keys; targets ${n.targets.join(', ')}, each with an observer branch; words ${n.words.join(', ')} equal the doc's; no client-side terminal creation; (d) bundle API and hand-off key ${n.d === 'compared' ? 'compared' : 'SKIP (lane p64-01 entry absent)'}; (g) module key and boot event ${n.g === 'compared' ? 'compared' : 'SKIP (lane p64-04 not merged)'}`);
    process.exit(0);
}
