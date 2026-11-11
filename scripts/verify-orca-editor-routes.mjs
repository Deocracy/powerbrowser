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

import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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

    // f. TopLevelView against lane p65-04's page rows.
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
        return 0;
    } finally {
        rmSync(tmp, { recursive: true, force: true });
    }
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
    if (!existsSync(TS_DIR) || !statSync(TS_DIR).isDirectory()) { console.log(`${NAME}: SKIP -- theia/node_modules/typescript is absent; run the audited Theia install (docs/BUILD.md "Theia half")`); process.exit(0); }
    ts = createRequire(import.meta.url)(TS_DIR);
    if (mode !== 'git-spec' && !existsSync(join(REPO_ROOT, REL.openFile))) { console.log(`${NAME}: SKIP -- orca/ is not fetched (${REL.openFile} absent); run bash scripts/fetch-orca.sh`); process.exit(0); }
    if (mode === 'self-test') process.exit(runSelfTest());
    if (mode === 'git-spec') process.exit(await runGitSpecSelfTest());
    const r = check(REPO_ROOT);
    if (r.fails.length) { for (const f of r.fails) console.error(`${NAME}: FAIL -- ${f}`); process.exit(1); }
    const n = r.notes;
    console.log(`${NAME}: PASS -- ${n.modes.length} modes (${n.modes.join(', ')}), ${n.sources.length} diff sources and ${n.kinds.length} conflict kinds equal ORCA_EDITOR_ROUTES' keys; editor-type content types ${n.editorTypes.join(', ')} each covered; every value a Theia kind except the named row ${HOSTED_ROW.key}; (f) TopLevelView ${n.f === 'compared' ? 'compared with ORCA_PAGE_ROUTES' : 'SKIP (lane p65-04 restore directory absent)'}`);
    process.exit(0);
}

async function runGitSpecSelfTest() {
    console.error(`${NAME}: git-spec self-test: FAIL -- ${REL.gitProtocol} is not written yet`);
    return 1;
}
