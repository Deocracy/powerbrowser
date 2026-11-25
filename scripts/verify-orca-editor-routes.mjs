#!/usr/bin/env node
// scripts/verify-orca-editor-routes.mjs
//
// orca-editor-routes (Phase 65, TAB-05; P65-01, P65-27): every editor-type Orca
// tab has a Theia route in @powerbrowser/orca-workspace's handler table, so
// Orca's own EditorPanel is never mounted.
//
// Derived at check time from the pinned Orca source with theia/node_modules/typescript
// (never by line grep), and compared as sets with the keys of ORCA_EDITOR_ROUTES
// (theia/extensions/orca-workspace/src/browser/orca-editor-routes.ts):
//  a. the OpenFile mode union (open-file.ts): equals the mode prefixes of the keys;
//  b. the TabContentType members toVisibleTabType maps to 'editor' (tab-types.ts):
//     each is covered by a key whose mode Orca's editorTabContentTypeForMode
//     (editor-tab-content-type.ts) maps to it, so no content-type list is kept here;
//  c. the DiffSource union (editor-tab-view-types.ts): equals the diff: keys;
//  d. the GitConflictKind union (git-status-types.ts): equals the conflict-review: keys;
//  e. every value is theia-editor, theia-diff or theia-merge, except the named row
//     check-details, which is exactly hosted:check-details; no key or value names
//     EditorPanel or EditorContent;
//  f. the TopLevelView union (ui-chrome-types.ts): equals the keys of ORCA_PAGE_ROUTES
//     in theia/extensions/orca-panes/src/browser/orca-pane-routes.ts. A named SKIP of
//     this clause only while theia/extensions/orca-panes/src/browser/restore is absent
//     (lane p65-04 unmerged); red when that directory exists and the constant does not.
// A derived set of zero members is red ("source moved").
//
// Tier: quick. One named SKIP when orca/ is not fetched or theia/node_modules/typescript
// is absent. --self-test runs the check on mkdtemp copies and plants each fault; each
// must go red naming its drift, then the control is re-run green.
// --git-spec-self-test: the pb-orca-git: spec grammar and argv (orca-git-protocol.ts),
// planted refusals, and a hermetic repository read through the real argv.
//
// Usage:
//   node scripts/verify-orca-editor-routes.mjs
//   node scripts/verify-orca-editor-routes.mjs --self-test
//   node scripts/verify-orca-editor-routes.mjs --git-spec-self-test
// Limit: the TopLevelView clause compares keys only; what each page row does is
// orca-pane-routes' and the live rows' concern.

import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fixtureGitArgs, fixtureGitEnv, withHostileGitConfigAsync } from './lib/fixture-git.mjs';
import { SKIP_EXIT, skipLine } from './lib/skip-verdict.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'orca-editor-routes';
const SELF_REL = 'scripts/verify-orca-editor-routes.mjs';
const TS_DIR = join(REPO_ROOT, 'theia', 'node_modules', 'typescript');

const REL = {
    tabTypes: 'orca/src/shared/tab-types.ts',
    openFile: 'orca/src/renderer/src/store/slices/editor/types/open-file.ts',
    contentTypeForMode: 'orca/src/renderer/src/store/slices/editor/tabs/editor-tab-content-type.ts',
    viewTypes: 'orca/src/shared/editor-tab-view-types.ts',
    gitStatus: 'orca/src/shared/git-status-types.ts',
    uiChrome: 'orca/src/shared/ui-chrome-types.ts',
    routes: 'theia/extensions/orca-workspace/src/browser/orca-editor-routes.ts',
    gitProtocol: 'theia/extensions/orca-workspace/src/common/orca-git-protocol.ts',
    paneRoutes: 'theia/extensions/orca-panes/src/browser/orca-pane-routes.ts',
    restoreDir: 'theia/extensions/orca-panes/src/browser/restore',
};
const THEIA_TARGETS = ['theia-editor', 'theia-diff', 'theia-merge'];
const HOSTED_ROW = { key: 'check-details', value: 'hosted:check-details' };
const ORCA_EDITOR_NAMES = /EditorPanel|EditorContent/;

let ts;

const parse = (file, text) => ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

function walk(node, visit) {
    visit(node);
    ts.forEachChild(node, (c) => walk(c, visit));
}

const stringOf = (node) => (node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : undefined);
const nameOf = (node) => (ts.isIdentifier(node) || ts.isStringLiteral(node) ? node.text : node.getText());

function unwrap(node) {
    while (node && (ts.isCallExpression(node) || ts.isAsExpression(node) || ts.isParenthesizedExpression(node) || (ts.isSatisfiesExpression && ts.isSatisfiesExpression(node)))) {
        node = ts.isCallExpression(node) ? node.arguments[0] : node.expression;
    }
    return node;
}

const literalsOfUnion = (type) => (type && ts.isUnionTypeNode(type) ? type.types : type ? [type] : [])
    .filter((t) => ts.isLiteralTypeNode(t) && ts.isStringLiteral(t.literal)).map((t) => t.literal.text);

// ---------------------------------------------------------------- derivations (pure)

export function deriveUnion(text, name) {
    let members = [];
    walk(parse(`${name}.ts`, text), (n) => { if (ts.isTypeAliasDeclaration(n) && n.name.text === name) members = literalsOfUnion(n.type); });
    return members;
}

/** The literal members of OpenFile's mode property. */
export function deriveOpenFileModes(text) {
    let members = [];
    walk(parse('open-file.ts', text), (n) => {
        if ((ts.isTypeAliasDeclaration(n) || ts.isInterfaceDeclaration(n)) && n.name.text === 'OpenFile') {
            walk(n, (m) => { if (ts.isPropertySignature(m) && nameOf(m.name) === 'mode') members = literalsOfUnion(m.type); });
        }
    });
    return members;
}

/** Literals compared with `param ===` inside an || chain. */
function comparedLiterals(expr, param) {
    const out = [];
    walk(expr, (n) => {
        if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken) {
            const [lit, other] = stringOf(n.left) !== undefined ? [n.left, n.right] : [n.right, n.left];
            if (stringOf(lit) !== undefined && other.getText() === param) out.push(stringOf(lit));
        }
    });
    return out;
}

/**
 * toVisibleTabType: the members the guarded branch returns as themselves, and the
 * literal of the final return. Returns { self: [...], fallback } or undefined.
 */
export function deriveVisibleTypeRule(text) {
    let rule;
    walk(parse('tab-types.ts', text), (n) => {
        if (!ts.isFunctionDeclaration(n) || n.name?.text !== 'toVisibleTabType' || !n.body) return;
        const param = n.parameters[0]?.name.getText();
        const ifs = n.body.statements.filter(ts.isIfStatement);
        const last = n.body.statements[n.body.statements.length - 1];
        const fallback = last && ts.isReturnStatement(last) ? stringOf(last.expression) : undefined;
        if (ifs.length !== 1 || fallback === undefined) return;
        rule = { self: comparedLiterals(ifs[0].expression, param), fallback };
    });
    return rule;
}

/** editorTabContentTypeForMode: `mode === 'a' || ... ? mode : 'editor'` gives { self: [...], fallback }. */
export function deriveModeContentRule(text) {
    let rule;
    walk(parse('editor-tab-content-type.ts', text), (n) => {
        if (!ts.isFunctionDeclaration(n) || n.name?.text !== 'editorTabContentTypeForMode' || !n.body) return;
        const param = n.parameters[0]?.name.getText();
        walk(n.body, (r) => {
            if (rule || !ts.isReturnStatement(r) || !r.expression) return;
            const e = unwrap(r.expression);
            if (ts.isConditionalExpression(e) && e.whenTrue.getText() === param && stringOf(e.whenFalse) !== undefined) {
                rule = { self: comparedLiterals(e.condition, param), fallback: stringOf(e.whenFalse) };
            }
        });
    });
    return rule;
}

function constInitializer(sf, name) {
    let found;
    walk(sf, (n) => { if (ts.isVariableDeclaration(n) && n.name.getText() === name) found = n.initializer; });
    return found;
}

/** An exported object-literal constant as { key: value-text }; undefined when absent. */
export function deriveTable(text, name, file = 'routes.ts') {
    const obj = unwrap(constInitializer(parse(file, text), name));
    if (!obj || !ts.isObjectLiteralExpression(obj)) return undefined;
    const table = {};
    for (const p of obj.properties) {
        if (ts.isPropertyAssignment(p)) table[nameOf(p.name)] = stringOf(p.initializer) ?? p.initializer.getText();
    }
    return table;
}

// ---------------------------------------------------------------- the check

const setDiff = (a, b) => [...a].filter((x) => !b.has(x));

export function check(root) {
    const fails = [];
    const notes = { modes: [], sources: [], kinds: [], editorTypes: [], f: 'SKIP' };
    const read = (rel) => readFileSync(join(root, rel), 'utf8');
    const has = (rel) => existsSync(join(root, rel));

    const modes = deriveOpenFileModes(read(REL.openFile));
    const contentTypes = deriveUnion(read(REL.tabTypes), 'TabContentType');
    const visible = deriveVisibleTypeRule(read(REL.tabTypes));
    const modeRule = has(REL.contentTypeForMode) ? deriveModeContentRule(read(REL.contentTypeForMode)) : undefined;
    const sources = deriveUnion(read(REL.viewTypes), 'DiffSource');
    const kinds = deriveUnion(read(REL.gitStatus), 'GitConflictKind');
    Object.assign(notes, { modes, sources, kinds });
    for (const [set, what] of [[modes, `OpenFile mode union in ${REL.openFile}`], [contentTypes, `TabContentType in ${REL.tabTypes}`], [sources, `DiffSource in ${REL.viewTypes}`], [kinds, `GitConflictKind in ${REL.gitStatus}`]]) {
        if (!set.length) fails.push(`source moved: no members derived for the ${what}`);
    }
    if (!visible) fails.push(`source moved: toVisibleTabType in ${REL.tabTypes} is no longer one guarded return and a literal fallback`);
    const table = deriveTable(read(REL.routes), 'ORCA_EDITOR_ROUTES', REL.routes);
    if (!table) {
        fails.push(`ORCA_EDITOR_ROUTES object literal not found in ${REL.routes}`);
        return { fails, notes };
    }
    const keys = Object.keys(table);
    const modeOf = (k) => k.split(':')[0];

    // a. modes.
    const keyModes = new Set(keys.map(modeOf));
    if (modes.length) {
        for (const m of setDiff(new Set(modes), keyModes)) fails.push(`OpenFile mode ${m} has no route key`);
        for (const m of setDiff(keyModes, new Set(modes))) fails.push(`route key mode ${m} is not an OpenFile mode`);
    }

    // b. editor-type content types covered.
    if (visible && contentTypes.length) {
        const editorTypes = contentTypes.filter((c) => !visible.self.includes(c) && visible.fallback === 'editor');
        notes.editorTypes = editorTypes;
        if (!editorTypes.length) fails.push(`source moved: no TabContentType member maps to 'editor' in ${REL.tabTypes}`);
        const contentOfMode = (m) => (modeRule ? (modeRule.self.includes(m) ? m : modeRule.fallback) : contentTypes.includes(m) ? m : 'editor');
        const covered = new Set([...keyModes].map(contentOfMode));
        for (const c of editorTypes) if (!covered.has(c)) fails.push(`editor-type content type ${c} has no route key`);
    }

    // c, d. diff sources and conflict kinds.
    const sub = (mode) => new Set(keys.filter((k) => modeOf(k) === mode && k.includes(':')).map((k) => k.slice(mode.length + 1)));
    if (sources.length) {
        for (const s of setDiff(new Set(sources), sub('diff'))) fails.push(`DiffSource ${s} has no diff: route key`);
        for (const s of setDiff(sub('diff'), new Set(sources))) fails.push(`diff:${s} is not a DiffSource member`);
    }
    if (kinds.length) {
        for (const k of setDiff(new Set(kinds), sub('conflict-review'))) fails.push(`GitConflictKind ${k} has no conflict-review: route key`);
        for (const k of setDiff(sub('conflict-review'), new Set(kinds))) fails.push(`conflict-review:${k} is not a GitConflictKind member`);
    }

    // e. values.
    for (const [k, v] of Object.entries(table)) {
        if (ORCA_EDITOR_NAMES.test(k) || ORCA_EDITOR_NAMES.test(v)) fails.push(`route ${k} names Orca's editor (${v}): EditorPanel and EditorContent are never mounted`);
        else if (k === HOSTED_ROW.key) { if (v !== HOSTED_ROW.value) fails.push(`the named row ${k} is ${v}, not exactly ${HOSTED_ROW.value}`); }
        else if (!THEIA_TARGETS.includes(v)) fails.push(`route ${k} is ${v}, not a Theia kind (${THEIA_TARGETS.join(', ')})`);
    }

    // f. TopLevelView against the page rows. The restore directory is a tracked part of orca-panes: absent is a
    // deletion, red, not a skip (harness-static-structure-01).
    if (!has(REL.restoreDir)) fails.push(`${REL.restoreDir} is a tracked directory of this repository and is absent from the tree (the lane that added it is merged, so this is a deletion). Next step: restore it from version control.`);
    if (has(REL.restoreDir)) {
        notes.f = 'compared';
        const views = deriveUnion(read(REL.uiChrome), 'TopLevelView');
        if (!views.length) fails.push(`source moved: no TopLevelView members derived from ${REL.uiChrome}`);
        const pages = deriveTable(read(REL.paneRoutes), 'ORCA_PAGE_ROUTES', REL.paneRoutes);
        if (!pages) fails.push(`ORCA_PAGE_ROUTES not found in ${REL.paneRoutes} although ${REL.restoreDir} exists`);
        else if (views.length) {
            for (const v of setDiff(new Set(views), new Set(Object.keys(pages)))) fails.push(`TopLevelView ${v} has no ORCA_PAGE_ROUTES row`);
            for (const v of setDiff(new Set(Object.keys(pages)), new Set(views))) fails.push(`ORCA_PAGE_ROUTES row ${v} is not a TopLevelView member`);
        }
    }
    return { fails, notes };
}

// ---------------------------------------------------------------- self-test

const PLANTS = [
    { name: 'mode-added', naming: 'OpenFile mode planted-mode has no route key', file: REL.openFile, edit: (s) => s.replace("mode: 'edit' | 'diff'", "mode: 'edit' | 'planted-mode' | 'diff'") },
    { name: 'diff-source-added', naming: 'DiffSource planted-source has no diff: route key', file: REL.viewTypes, edit: (s) => s.replace("export type DiffSource =\n  | 'unstaged'", "export type DiffSource =\n  | 'planted-source'\n  | 'unstaged'") },
    { name: 'conflict-kind-added', naming: 'GitConflictKind planted_kind has no conflict-review: route key', file: REL.gitStatus, edit: (s) => s.replace("export type GitConflictKind =\n  | 'both_modified'", "export type GitConflictKind =\n  | 'planted_kind'\n  | 'both_modified'") },
    { name: 'editor-content-type-added', naming: 'editor-type content type planted-type has no route key', file: REL.tabTypes, edit: (s) => s.replace("export type TabContentType =\n  | 'terminal'", "export type TabContentType =\n  | 'planted-type'\n  | 'terminal'") },
    { name: 'top-level-view-added', naming: 'TopLevelView planted-view has no ORCA_PAGE_ROUTES row', file: REL.uiChrome, edit: (s) => s.replace("export type TopLevelView =\n  | 'terminal'", "export type TopLevelView =\n  | 'planted-view'\n  | 'terminal'") },
    { name: 'value-names-editor-panel', naming: 'names Orca\'s editor (EditorPanel)', file: REL.routes, edit: (s) => s.replace("'edit': 'theia-editor',", "'edit': 'EditorPanel',") },
    { name: 'check-details-as-theia-kind', naming: 'the named row check-details is theia-editor', file: REL.routes, edit: (s) => s.replace("'check-details': 'hosted:check-details',", "'check-details': 'theia-editor',") },
    { name: 'zero-member-parse', naming: 'source moved', file: REL.gitStatus, edit: (s) => s.replace(/export type GitConflictKind =[\s\S]*?\n\n/, 'export type GitConflictKind = string\n\n') },
];

function runSelfTest() {
    const tmp = mkdtempSync(join(tmpdir(), `${NAME}-`));
    try {
        const put = (rel, text) => { mkdirSync(dirname(join(tmp, rel)), { recursive: true }); writeFileSync(join(tmp, rel), text); };
        for (const rel of [REL.tabTypes, REL.openFile, REL.contentTypeForMode, REL.viewTypes, REL.gitStatus, REL.uiChrome, REL.routes, REL.paneRoutes]) {
            mkdirSync(dirname(join(tmp, rel)), { recursive: true });
            cpSync(join(REPO_ROOT, rel), join(tmp, rel));
        }
        // Clause f compares only with lane p65-04's restore directory present: the fixture supplies it, and
        // ORCA_PAGE_ROUTES derived from TopLevelView when the copied route file does not carry it yet.
        const fixtures = [];
        mkdirSync(join(tmp, REL.restoreDir), { recursive: true });
        if (!deriveTable(readFileSync(join(tmp, REL.paneRoutes), 'utf8'), 'ORCA_PAGE_ROUTES')) {
            const views = deriveUnion(readFileSync(join(tmp, REL.uiChrome), 'utf8'), 'TopLevelView');
            put(REL.paneRoutes, `${readFileSync(join(tmp, REL.paneRoutes), 'utf8')}\nexport const ORCA_PAGE_ROUTES = Object.freeze({ ${views.map((v) => `'${v}': { target: 'fixture' }`).join(', ')} });\n`);
            fixtures.push('ORCA_PAGE_ROUTES');
        }
        const control = () => check(tmp);
        const first = control();
        if (first.fails.length || first.notes.f !== 'compared') { console.error(`${NAME} self-test: FAIL -- control is not green with clause f compared: ${first.fails.join(' | ')}`); return 1; }
        console.log(`${NAME} self-test: control green -- copies of the tree's files and a fixture restore directory${fixtures.length ? `, fixture ${fixtures.join(', ')}` : ''}; clause f compared`);
        let failures = 0;
        {
            rmSync(join(tmp, REL.restoreDir), { recursive: true, force: true });
            const r = check(tmp);
            mkdirSync(join(tmp, REL.restoreDir), { recursive: true });
            const want = `${REL.restoreDir} is a tracked directory of this repository and is absent`;
            if (r.fails.some((f) => f.includes(want))) console.log(`  ok restore directory removed -> red, naming '${want}'`);
            else { console.error(`  FAIL restore directory removed -> ${r.fails.join(' | ') || 'stayed green'}`); failures++; }
        }
        for (const p of PLANTS) {
            const file = join(tmp, p.file);
            const original = readFileSync(file, 'utf8');
            const planted = p.edit(original);
            if (planted === original) { console.error(`  FAIL ${p.name} -> the plant did not apply (its anchor text moved)`); failures++; continue; }
            writeFileSync(file, planted);
            const r = check(tmp);
            writeFileSync(file, original);
            const text = r.fails.join('\n');
            if (!r.fails.length) { console.error(`  FAIL ${p.name} -> stayed green`); failures++; }
            else if (!text.includes(p.naming)) { console.error(`  FAIL ${p.name} -> red, but not naming '${p.naming}': ${text}`); failures++; }
            else console.log(`  ok ${p.name} -> red, naming '${p.naming}'`);
            const again = control();
            if (again.fails.length) { console.error(`  FAIL ${p.name} -> the control did not return to green after the undo: ${again.fails.join(' | ')}`); failures++; }
        }
        if (failures) { console.error(`${NAME} self-test: FAIL -- ${failures} problem(s) across ${PLANTS.length} plants`); return 1; }
        console.log(`${NAME} self-test: PASS -- ${PLANTS.length} planted faults each went red naming the drift; the control re-ran green after each undo`);
        return runRouteSelfTest();
    } finally {
        rmSync(tmp, { recursive: true, force: true });
    }
}

// ---------------------------------------------------------------- module loading for the behaviour self-tests

const transpile = (rel, module) => ts.transpileModule(readFileSync(join(REPO_ROOT, rel), 'utf8'), {
    compilerOptions: { module, target: ts.ScriptTarget.ES2020, experimentalDecorators: true, emitDecoratorMetadata: false, esModuleInterop: false },
}).outputText;

/** The common protocol has no import, so it loads as an ES module from a data: URL. */
const loadProtocol = () => import(`data:text/javascript;base64,${Buffer.from(transpile(REL.gitProtocol, ts.ModuleKind.ESNext)).toString('base64')}`);

/** orca-editor-routes as CommonJS: its Theia imports become inert decorator stubs; the protocol is the real one. */
async function loadRoutes() {
    const protocol = await loadProtocol();
    const decorator = () => () => undefined;
    const stub = new Proxy({}, { get: () => decorator });
    const mod = { exports: {} };
    const requireFn = (id) => (id === '../common/orca-git-protocol' ? protocol : stub);
    new Function('require', 'module', 'exports', transpile(REL.routes, ts.ModuleKind.CommonJS))(requireFn, mod, mod.exports);
    return mod.exports;
}

const plain = (v) => JSON.parse(JSON.stringify(v));
const same = (a, b) => JSON.stringify(plain(a)) === JSON.stringify(plain(b));

// ---------------------------------------------------------------- route self-test (folded into --self-test)

const OID = { head: 'a'.repeat(40), base: 'b'.repeat(40), tip: 'c'.repeat(64), parent: 'd'.repeat(40), commit: 'e'.repeat(40) };
const FILE = { id: 'f1', tabId: 't1', worktreeId: 'w1', worktreePath: '/w', filePath: '/w/src/a.ts', relativePath: 'src/a.ts', isPreview: false, active: false, local: true };
const conflictFile = (selectedPath, entries) => ({ ...FILE, mode: 'conflict-review', filePath: '/w', relativePath: '', conflicts: { selectedPath, entries } });
const ENTRIES = [{ relativePath: 'src/x.ts', conflictKind: 'deleted_by_them' }, { relativePath: 'src/c.ts', conflictKind: 'both_modified' }, { relativePath: 'src/n.ts', conflictKind: 'both_added' }];

export const ROUTE_CASES = [
    { name: 'edit opens the file in the Theia editor', file: { ...FILE, mode: 'edit' }, want: { open: 'editor', path: '/w/src/a.ts', preview: false } },
    { name: 'isPreview maps to the preview mode', file: { ...FILE, mode: 'edit', isPreview: true }, want: { open: 'editor', path: '/w/src/a.ts', preview: true } },
    { name: 'markdown-preview opens the source file with a note naming the mode', file: { ...FILE, mode: 'markdown-preview' }, test: (r) => r.open === 'editor' && r.path === '/w/src/a.ts' && /markdown-preview/.test(r.note ?? '') },
    { name: 'a remote tab opens nothing and names remote host', file: { ...FILE, mode: 'edit', local: false }, test: (r) => r.open === 'log' && /remote host/.test(r.line) && /edit/.test(r.line) },
    { name: 'check-details is the hosted row', file: { ...FILE, mode: 'check-details' }, want: { open: 'hosted' } },
    { name: 'unstaged: :0 vs the working file', file: { ...FILE, mode: 'diff', diffSource: 'unstaged' }, test: (r) => r.open === 'diff' && same(r.left, { path: '/w/src/a.ts', rev: ':0' }) && same(r.right, { path: '/w/src/a.ts' }) },
    { name: 'staged: HEAD oid at oldPath vs :0 at path', file: { ...FILE, mode: 'diff', diffSource: 'staged', oldPath: 'src/old.ts' }, helpers: { headOid: OID.head }, test: (r) => r.open === 'diff' && same(r.left, { path: '/w/src/old.ts', rev: OID.head }) && same(r.right, { path: '/w/src/a.ts', rev: ':0' }) },
    { name: 'staged on an unborn HEAD: the left side is empty', file: { ...FILE, mode: 'diff', diffSource: 'staged' }, helpers: { headOid: null }, test: (r) => r.open === 'diff' && same(r.left, { path: '/w/src/a.ts', rev: '' }) },
    { name: 'branch: mergeBase at oldPath vs headOid at path, never the working file', file: { ...FILE, mode: 'diff', diffSource: 'branch', oldPath: 'src/old.ts', branch: { mergeBase: OID.base, headOid: OID.tip } }, test: (r) => r.open === 'diff' && same(r.left, { path: '/w/src/old.ts', rev: OID.base }) && same(r.right, { path: '/w/src/a.ts', rev: OID.tip }) },
    { name: 'branch with a null merge base: the left side is empty', file: { ...FILE, mode: 'diff', diffSource: 'branch', branch: { mergeBase: null, headOid: OID.tip } }, test: (r) => r.open === 'diff' && r.left.rev === '' && r.right.rev === OID.tip },
    { name: 'commit: parentOid vs commitOid', file: { ...FILE, mode: 'diff', diffSource: 'commit', commit: { parentOid: OID.parent, commitOid: OID.commit } }, test: (r) => r.open === 'diff' && same(r.left, { path: '/w/src/a.ts', rev: OID.parent }) && same(r.right, { path: '/w/src/a.ts', rev: OID.commit }) },
    { name: 'commit with no parent: the left side is empty', file: { ...FILE, mode: 'diff', diffSource: 'commit', commit: { parentOid: null, commitOid: OID.commit } }, test: (r) => r.open === 'diff' && r.left.rev === '' },
    { name: 'combined-branch: the first entry by the branch rule', file: { ...FILE, mode: 'diff', diffSource: 'combined-branch', branch: { mergeBase: OID.base, headOid: OID.tip }, combinedFirst: { relativePath: 'src/b.ts' } }, test: (r) => r.open === 'diff' && same(r.left, { path: '/w/src/b.ts', rev: OID.base }) && same(r.right, { path: '/w/src/b.ts', rev: OID.tip }) },
    { name: 'combined-commit: the first entry by the commit rule', file: { ...FILE, mode: 'diff', diffSource: 'combined-commit', commit: { parentOid: OID.parent, commitOid: OID.commit }, combinedFirst: { relativePath: 'src/b.ts', oldPath: 'src/o.ts' } }, test: (r) => r.open === 'diff' && same(r.left, { path: '/w/src/o.ts', rev: OID.parent }) && same(r.right, { path: '/w/src/b.ts', rev: OID.commit }) },
    { name: 'combined-uncommitted, area staged: the staged rule', file: { ...FILE, mode: 'diff', diffSource: 'combined-uncommitted', combinedFirst: { relativePath: 'src/b.ts', area: 'staged' } }, helpers: { headOid: OID.head }, test: (r) => r.open === 'diff' && same(r.left, { path: '/w/src/b.ts', rev: OID.head }) && same(r.right, { path: '/w/src/b.ts', rev: ':0' }) },
    { name: 'combined-all, area unstaged: the unstaged rule', file: { ...FILE, mode: 'diff', diffSource: 'combined-all', combinedFirst: { relativePath: 'src/b.ts', area: 'unstaged' } }, test: (r) => r.open === 'diff' && same(r.left, { path: '/w/src/b.ts', rev: ':0' }) && same(r.right, { path: '/w/src/b.ts' }) },
    { name: 'combined-all, area untracked: an empty left side', file: { ...FILE, mode: 'diff', diffSource: 'combined-all', combinedFirst: { relativePath: 'src/u.ts', area: 'untracked' } }, test: (r) => r.open === 'diff' && same(r.left, { path: '/w/src/u.ts', rev: '' }) && same(r.right, { path: '/w/src/u.ts' }) },
    { name: 'conflict both_modified on the selected entry: stages 1, 2, 3 and the working file', file: conflictFile('src/c.ts', ENTRIES), want: { open: 'merge', base: { path: '/w/src/c.ts', rev: ':1' }, side1: { path: '/w/src/c.ts', rev: ':2' }, side2: { path: '/w/src/c.ts', rev: ':3' }, result: { path: '/w/src/c.ts' } } },
    { name: 'conflict both_added: an empty base (no stage 1)', file: conflictFile('src/n.ts', ENTRIES), test: (r) => r.open === 'merge' && same(r.base, { path: '/w/src/n.ts', rev: '' }) && r.side1.rev === ':2' && r.side2.rev === ':3' },
    { name: 'conflict with no selection: the first entry (deleted_by_them opens the working file)', file: conflictFile(undefined, ENTRIES), helpers: { workingFileExists: true }, want: { open: 'editor', path: '/w/src/x.ts', preview: false } },
    { name: 'deleted_by_them with no working file: one line naming the mode and the kind', file: conflictFile('src/x.ts', ENTRIES), helpers: { workingFileExists: false }, test: (r) => r.open === 'log' && /conflict-review/.test(r.line) && /deleted_by_them/.test(r.line) },
];

async function runRouteSelfTest() {
    if (!existsSync(join(REPO_ROOT, REL.gitProtocol))) { console.error(`${NAME} route self-test: FAIL -- ${REL.gitProtocol} is absent`); return 1; }
    const { routeOpenFile } = await loadRoutes();
    if (typeof routeOpenFile !== 'function') { console.error(`${NAME} route self-test: FAIL -- routeOpenFile is not exported by ${REL.routes}`); return 1; }
    let failures = 0;
    for (const c of ROUTE_CASES) {
        let r;
        try { r = routeOpenFile(c.file, c.helpers ?? {}); } catch (e) { r = { threw: String(e?.message ?? e) }; }
        const good = c.want ? same(r, c.want) : (() => { try { return c.test(r); } catch { return false; } })();
        if (good) console.log(`  ok route ${c.name}`);
        else { console.error(`  FAIL route ${c.name} -> ${JSON.stringify(r)}`); failures++; }
    }
    if (failures) { console.error(`${NAME} route self-test: FAIL -- ${failures} of ${ROUTE_CASES.length} routes wrong`); return 1; }
    console.log(`${NAME} route self-test: PASS -- ${ROUTE_CASES.length} routes match CA-01..CA-03`);
    return 0;
}

// ---------------------------------------------------------------- pb-orca-git: spec self-test

const REFUSED = [
    ['a ".." segment', 'src/../a.ts', ':0'],
    ['a leading ".." segment', '../a.ts', ':0'],
    ['a "." segment', 'src/./a.ts', ':0'],
    ['a leading "./"', './a.ts', ':0'],
    ['an empty segment', 'src//a.ts', ':0'],
    ['an empty path', '', ':0'],
    ['a leading "/"', '/etc/passwd', ':0'],
    ['a backslash', 'src\\a.ts', ':0'],
    ['a NUL', 'src/a\0.ts', ':0'],
    ['a newline', 'src/a\n.ts', ':0'],
    ['an option-shaped path', '-x', ':0'],
    ['HEAD as a rev', 'a.ts', 'HEAD'],
    ['upper-case hex', 'a.ts', 'A'.repeat(40)],
    ['39 hex', 'a.ts', 'a'.repeat(39)],
    ['stage :4', 'a.ts', ':4'],
    ['an option-shaped rev', 'a.ts', '-x'],
    ['a ref name', 'a.ts', 'main'],
];

async function runGitSpecSelfTest() {
    const label = 'orca-git-spec self-test';
    if (!existsSync(join(REPO_ROOT, REL.gitProtocol))) { console.error(`${label}: FAIL -- ${REL.gitProtocol} is absent`); return 1; }
    const p = await loadProtocol();
    const { execFile, execFileSync } = await import('node:child_process');
    const { realpath } = await import('node:fs/promises');
    let failures = 0;
    const ok = (good, text) => { if (good) console.log(`  ok ${text}`); else { console.error(`  FAIL ${text}`); failures++; } };
    const builds = (rev, rel) => { try { p.catFileArgs('/r', rev, rel); return true; } catch { return false; } };

    // Controls: the argv shape.
    ok(same(p.catFileArgs('/r', ':0', 'src/a.ts'), ['-c', 'core.fsmonitor=false', '-C', '/r', 'cat-file', 'blob', '--', ':0:src/a.ts']), 'catFileArgs for :0 is git -c core.fsmonitor=false -C <root> cat-file blob -- :0:<path>');
    ok(same(p.catFileArgs('/r', OID.head, 'src/a.ts').slice(-2), ['--', `${OID.head}:src/a.ts`]), 'a 40-hex object id gives <oid>:<path> after --');
    ok(p.specRefusal('src/a.ts', OID.tip) === undefined && builds(OID.tip, 'src/a.ts'), 'a 64-hex object id is accepted');
    ok(p.specRefusal('src/a.ts', ':3') === undefined && p.specRefusal('src/a.ts', '') === undefined, 'stage :3 and the empty side are accepted');
    ok(!builds('', 'a.ts'), 'the empty side builds no git argv (nothing is run for it)');
    ok(same(Object.keys(p.withoutGitVars({ PATH: '/bin', GIT_DIR: '/x', git_work_tree: '/y', HOME: '/h' })).sort(), ['HOME', 'PATH']), 'withoutGitVars drops every GIT_* name, any case');
    const uri = p.orcaGitUri('/w/a b#c.ts', ':2');
    ok(uri.startsWith(`${p.ORCA_GIT_SCHEME}:/w/`) && !uri.includes(' ') && !uri.includes('#') && decodeURIComponent(uri.split('?')[1]) === ':2', 'orcaGitUri escapes the path and carries the rev as the query');

    // Plants: each refused spec must be refused by both the validator and the argv builder.
    for (const [what, rel, rev] of REFUSED) ok(p.specRefusal(rel, rev) !== undefined && !builds(rev, rel), `refused: ${what}`);

    // Hermetic repository: one commit, one staged change, a subdirectory.
    const tmp = realpathSync(mkdtempSync(join(tmpdir(), `${NAME}-git-`)));
    const link = `${tmp}-link`;
    try {
        // No signing, no hooks, no global or system config for the fixture repository (harness-static-structure-11).
        const env = fixtureGitEnv(p.withoutGitVars(process.env));
        const git = (...a) => execFileSync('git', [...fixtureGitArgs(), '-C', tmp, '-c', 'user.name=fixture', '-c', 'user.email=fixture@invalid', ...a], { env, stdio: ['ignore', 'pipe', 'pipe'] });
        git('init', '-q');
        mkdirSync(join(tmp, 'sub'));
        writeFileSync(join(tmp, 'sub', 'a.txt'), 'committed bytes\né\n');
        git('add', '.');
        git('commit', '-q', '-m', 'fixture');
        writeFileSync(join(tmp, 'sub', 'a.txt'), 'staged bytes\n');
        git('add', 'sub/a.txt');
        writeFileSync(join(tmp, 'sub', 'a.txt'), 'working bytes\n');
        const commit = git('rev-parse', 'HEAD').toString().trim();
        const deps = {
            realpath: (path) => realpath(path),
            toplevel: (root) => new Promise((done) => execFile('git', ['-c', 'core.fsmonitor=false', '-C', root, 'rev-parse', '--show-toplevel'], { env, timeout: p.ORCA_GIT_TIMEOUT_MS }, (err, out) => done(err ? undefined : String(out).trim()))),
        };
        // A GIT_DIR inherited by the reader would redirect the read; the reader's environment must drop it.
        const hostile = { ...process.env, GIT_DIR: join(tmp, 'nowhere') };
        const read = (rev, rel) => new Promise((done) => execFile('git', p.catFileArgs(tmp, rev, rel), { env: p.withoutGitVars(hostile), encoding: 'buffer', maxBuffer: p.ORCA_GIT_MAX_BYTES, timeout: p.ORCA_GIT_TIMEOUT_MS }, (err, out) => done(err ? undefined : out)));
        ok(await p.validateRoot(tmp, deps) === undefined, 'the repository toplevel is accepted as a root');
        ok(await p.validateRoot(join(tmp, 'sub'), deps) !== undefined, 'refused: a root that is a subdirectory of a repository, not its toplevel');
        ok(await p.validateRoot('relative/root', deps) !== undefined, 'refused: a relative root');
        symlinkSync(tmp, link);
        ok(await p.validateRoot(link, deps) === 'root-realpath', 'refused by the realpath rule: a symlink to the repository toplevel');
        const byCommit = await read(commit, 'sub/a.txt');
        ok(byCommit !== undefined && byCommit.equals(execFileSync('git', ['-C', tmp, 'cat-file', 'blob', `${commit}:sub/a.txt`], { env })), 'the object-id read equals git cat-file blob <commit>:<path>, with GIT_DIR planted in the environment');
        const byStage = await read(':0', 'sub/a.txt');
        ok(byStage !== undefined && byStage.equals(execFileSync('git', ['-C', tmp, 'cat-file', 'blob', ':0:sub/a.txt'], { env })) && byStage.toString() === 'staged bytes\n', 'the :0 read equals git cat-file blob :0:<path> (the staged bytes)');
    } finally {
        rmSync(tmp, { recursive: true, force: true });
        rmSync(link, { force: true });
    }
    if (failures) { console.error(`${label}: FAIL -- ${failures} case(s) wrong`); return 1; }
    console.log(`${label}: PASS -- the argv, ${REFUSED.length} planted refusals, the toplevel and realpath root rules and the hermetic bytes`);
    return 0;
}

// ---------------------------------------------------------------- entry

const MODES = { '--self-test': 'self-test', '--git-spec-self-test': 'git-spec' };

const isEntryPoint = (() => {
    try { return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();
if (isEntryPoint) {
    const args = process.argv.slice(2);
    if (args.length > 1 || (args.length === 1 && !MODES[args[0]])) {
        console.error(`${NAME}: unknown argument ${args.find((a) => !MODES[a]) ?? args[1]} (usage: node ${SELF_REL} [--self-test | --git-spec-self-test])`);
        console.error(`Next step: run node ${SELF_REL} for the check, --self-test for the planted-fault run, or --git-spec-self-test for the pb-orca-git: grammar.`);
        process.exit(2);
    }
    const mode = MODES[args[0]] ?? 'check';
    // Not run is SKIP (exit 77 with the one SKIP line), never a pass (SKIP-PROTOCOL.md).
    if (!existsSync(TS_DIR) || !statSync(TS_DIR).isDirectory()) { console.log(skipLine(NAME, 'theia/node_modules/typescript is absent. Next step: run the audited Theia install (docs/BUILD.md "Theia half")')); process.exit(SKIP_EXIT); }
    ts = createRequire(import.meta.url)(TS_DIR);
    if (mode !== 'git-spec' && !existsSync(join(REPO_ROOT, REL.openFile))) { console.log(skipLine(NAME, `orca/ is not fetched (${REL.openFile} absent), so neither the check nor its self-test ran. Next step: bash scripts/fetch-orca.sh`)); process.exit(SKIP_EXIT); }
    if (mode === 'self-test') process.exit(await runSelfTest());
    if (mode === 'git-spec') process.exit(await withHostileGitConfigAsync(runGitSpecSelfTest));
    const r = check(REPO_ROOT);
    if (r.fails.length) { for (const f of r.fails) console.error(`${NAME}: FAIL -- ${f}`); process.exit(1); }
    const n = r.notes;
    console.log(`${NAME}: PASS -- ${n.modes.length} modes (${n.modes.join(', ')}), ${n.sources.length} diff sources and ${n.kinds.length} conflict kinds equal ORCA_EDITOR_ROUTES' keys; editor-type content types ${n.editorTypes.join(', ')} each covered; every value a Theia kind except the named row ${HOSTED_ROW.key}; (f) TopLevelView compared with ORCA_PAGE_ROUTES`);
    process.exit(0);
}
