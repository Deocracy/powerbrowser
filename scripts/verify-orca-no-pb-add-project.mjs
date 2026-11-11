#!/usr/bin/env node
// scripts/verify-orca-no-pb-add-project.mjs
//
// orca-no-pb-add-project (Phase 65, TAB-09; P65-15, P65-16, D-18): Orca's own
// Add-project flow is the only way to add a project. PowerBrowser adds no
// Add-project, folder-picker or project control of its own.
//
// Derived at check time, parsed with theia/node_modules/typescript (never by
// line grep), never hand-kept:
//  a. the vocabulary, from the pinned Orca source under
//     orca/src/renderer/src/components/sidebar/ (tests excluded): the default
//     string of every translate(key, default) call whose default matches
//     /add (a )?project/i, plus every translate default inside the function that
//     opens Orca's AddRepoDialog (openModal('add-repo')), the dialog's entry;
//  b. the PB set, from every .ts and .tsx under theia/extensions/*/src: the
//     string properties of registerCommand, registerMenuAction, registerItem
//     (a tab-bar toolbar item) and registerKeybinding arguments (id, label,
//     category, commandId, command, tooltip, text), and of every command object
//     literal (an object literal with string id and label); plus the title and
//     aria-label attribute strings of chrome-bar-widget.tsx, a CHROME_BAR_COPY
//     member resolved through chrome-bar-copy.ts.
// Both sides are normalised (case, whitespace, a trailing ellipsis or full
// stop). Red on: any string in both sets (naming each PB file and string); an
// empty vocabulary ("source moved"); a PB set holding no command label parsed
// from theia/extensions/orca-panes/src, where P64-21's New Orca Chat and New
// Orca Terminal are registered ("parser blind"). P65-16: those two commands
// create panes, not projects, and stay.
//
// Tier: quick (static). A named SKIP, exit 0, when typescript or orca/ is
// absent (P62-10). --self-test runs a fixture tree in mkdtemp: a green control,
// then plants, each undone after its run, each required to go red naming it.
//
// Usage:
//   node scripts/verify-orca-no-pb-add-project.mjs
//   node scripts/verify-orca-no-pb-add-project.mjs --self-test

import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'orca-no-pb-add-project';
const SELF_REL = 'scripts/verify-orca-no-pb-add-project.mjs';
const TS_DIR = join(REPO_ROOT, 'theia', 'node_modules', 'typescript');

const REL = {
    sidebar: 'orca/src/renderer/src/components/sidebar',
    extensions: 'theia/extensions',
    panesSrc: 'theia/extensions/orca-panes/src',
    chromeBar: 'theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx',
    chromeCopy: 'theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts',
};
const ADD_PROJECT = /add (a )?project/i;
const REGISTER_CALLS = new Set(['registerCommand', 'registerMenuAction', 'registerItem', 'registerKeybinding']);
const STRING_KEYS = new Set(['id', 'label', 'category', 'commandId', 'command', 'tooltip', 'text']);
const BAR_ATTRS = new Set(['title', 'aria-label']);

let ts;
function loadTypeScript() {
    try {
        ts ??= createRequire(import.meta.url)(TS_DIR);
        return true;
    } catch {
        return false;
    }
}

export function normalise(text) {
    return text.toLowerCase().replace(/\s+/g, ' ').trim().replace(/(\.\.\.|…|\.)$/, '').trim();
}

function walkFiles(dir, out = []) {
    for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name === 'lib') continue;
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walkFiles(path, out);
        else if (/\.tsx?$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name) && !name.endsWith('.d.ts')) out.push(path);
    }
    return out;
}

function parse(path) {
    return ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}

function visit(node, fn) {
    fn(node);
    ts.forEachChild(node, child => visit(child, fn));
}

const stringOf = node => node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : undefined;
const calleeName = call => ts.isPropertyAccessExpression(call.expression) ? call.expression.name.text
    : ts.isIdentifier(call.expression) ? call.expression.text : undefined;
const propName = prop => prop.name && (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)) ? prop.name.text : undefined;

/** The string-valued properties of an object literal whose key is one a contribution shows or names. */
function objectStrings(obj) {
    const out = [];
    for (const prop of obj.properties) {
        if (!ts.isPropertyAssignment(prop)) continue;
        const key = propName(prop);
        const value = stringOf(prop.initializer);
        if (key && STRING_KEYS.has(key) && value !== undefined) out.push({ key, value });
    }
    return out;
}

/** a. Orca's Add-project vocabulary from its sidebar source. */
export function deriveVocabulary(root) {
    const vocab = [];
    for (const file of walkFiles(join(root, REL.sidebar))) {
        const sf = parse(file);
        const rel = relative(root, file);
        const entryFns = new Set();
        visit(sf, node => {
            if (ts.isCallExpression(node) && calleeName(node) === 'openModal' && stringOf(node.arguments[0]) === 'add-repo') {
                let fn = node.parent;
                while (fn && !ts.isFunctionDeclaration(fn) && !(ts.isVariableStatement(fn) && fn.parent === sf)) fn = fn.parent;
                if (fn) entryFns.add(fn);
            }
        });
        visit(sf, node => {
            if (!ts.isCallExpression(node) || calleeName(node) !== 'translate') return;
            const text = stringOf(node.arguments[1]);
            if (text === undefined) return;
            let inEntry = false;
            for (let p = node.parent; p; p = p.parent) if (entryFns.has(p)) { inEntry = true; break; }
            if (ADD_PROJECT.test(text) || inEntry) vocab.push({ text, where: `${rel}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}` });
        });
    }
    return vocab;
}

/** CHROME_BAR_COPY's string members, by name. */
function chromeCopy(root) {
    const copy = new Map();
    const file = join(root, REL.chromeCopy);
    if (!existsSync(file)) return copy;
    visit(parse(file), node => {
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'CHROME_BAR_COPY') {
            visit(node.initializer, inner => {
                if (ts.isPropertyAssignment(inner) && propName(inner) && stringOf(inner.initializer) !== undefined) copy.set(propName(inner), stringOf(inner.initializer));
            });
        }
    });
    return copy;
}

/** b. Every PB contribution string. */
export function derivePbSet(root) {
    const pb = [];
    const extRoot = join(root, REL.extensions);
    const srcDirs = existsSync(extRoot) ? readdirSync(extRoot).map(name => join(extRoot, name, 'src')).filter(existsSync) : [];
    for (const file of srcDirs.flatMap(dir => walkFiles(dir))) {
        const sf = parse(file);
        const rel = relative(root, file);
        const add = (node, kind, key, value) => pb.push({ text: value, kind, key, where: `${rel}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}` });
        const seen = new Set();
        visit(sf, node => {
            if (ts.isCallExpression(node) && REGISTER_CALLS.has(calleeName(node))) {
                for (const arg of node.arguments) {
                    if (ts.isObjectLiteralExpression(arg)) {
                        seen.add(arg);
                        for (const { key, value } of objectStrings(arg)) add(arg, calleeName(node), key, value);
                    }
                }
            }
        });
        visit(sf, node => {
            if (!ts.isObjectLiteralExpression(node) || seen.has(node)) return;
            const strings = objectStrings(node);
            if (strings.some(s => s.key === 'id') && strings.some(s => s.key === 'label')) {
                for (const { key, value } of strings.filter(s => ['id', 'label', 'category'].includes(s.key))) add(node, 'command', key, value);
            }
        });
    }
    const bar = join(root, REL.chromeBar);
    if (existsSync(bar)) {
        const copy = chromeCopy(root);
        const sf = parse(bar);
        visit(sf, node => {
            if (!ts.isJsxAttribute(node) || !BAR_ATTRS.has(node.name.getText(sf)) || !node.initializer) return;
            const where = `${REL.chromeBar}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
            visit(node.initializer, inner => {
                const literal = stringOf(inner);
                if (literal !== undefined) pb.push({ text: literal, kind: 'chrome-bar', key: node.name.getText(sf), where });
                if (ts.isPropertyAccessExpression(inner) && inner.expression.getText(sf) === 'CHROME_BAR_COPY' && copy.has(inner.name.text)) {
                    pb.push({ text: copy.get(inner.name.text), kind: 'chrome-bar', key: node.name.getText(sf), where });
                }
            });
        });
    }
    return pb;
}

export function check(root) {
    if (!loadTypeScript()) throw new Error("theia/node_modules/typescript is absent");
    const fails = [];
    const vocab = deriveVocabulary(root);
    const pb = derivePbSet(root);
    if (!vocab.length) fails.push(`source moved: no Add-project string was derived from ${REL.sidebar} (no translate default matching ${ADD_PROJECT} and no openModal('add-repo') entry). Next step: re-read Orca's sidebar at the pin and update the derivation.`);
    const panesLabels = pb.filter(p => p.key === 'label' && p.where.startsWith(REL.panesSrc + '/'));
    if (!panesLabels.length) fails.push(`parser blind: no command label was parsed from ${REL.panesSrc}, where New Orca Chat and New Orca Terminal are registered (P64-21). Next step: fix the PB-set parser for the registration shape used there.`);
    const vocabByNorm = new Map();
    for (const v of vocab) if (!vocabByNorm.has(normalise(v.text))) vocabByNorm.set(normalise(v.text), v);
    for (const p of pb) {
        const v = vocabByNorm.get(normalise(p.text));
        if (v) fails.push(`PB ${p.kind} ${p.key} '${p.text}' at ${p.where} matches Orca's Add-project string at ${v.where}. Next step: remove the PB control; Orca's own Add-project flow is the only one (D-18).`);
    }
    return { fails, vocab, pb, panesLabels };
}

// ---- self-test ----

const FIXTURE = {
    'orca/src/renderer/src/components/sidebar/sidebar-header-actions.tsx': [
        "import { translate } from '@/i18n/i18n'",
        'function AddProjectButton() {',
        "  const label = translate('auto.components.sidebar.SidebarHeader.addProject', 'Add project')",
        "  return <button aria-label={label} onClick={() => openModal('add-repo')} />",
        '}',
        'function NewWorkspaceButton() {',
        "  return <button>{translate('auto.components.sidebar.SidebarHeader.92154beb7e', 'New workspace')}</button>",
        '}',
        '',
    ].join('\n'),
    'orca/src/renderer/src/components/sidebar/AddRepoStartSteps.tsx': [
        "export const Heading = () => <h2>{translate('auto.components.sidebar.AddRepoStartSteps.d13757911c', 'Add a project')}</h2>",
        '',
    ].join('\n'),
    'theia/extensions/orca-panes/src/browser/orca-panes-frontend-module.ts': [
        'export class OrcaPaneCommands {',
        '    registerCommands(commands) {',
        "        commands.registerCommand({ id: 'powerbrowser.orca.newChat', label: 'New Orca Chat' }, { execute: () => undefined });",
        "        commands.registerCommand({ id: 'powerbrowser.orca.newTerminal', label: 'New Orca Terminal' }, { execute: () => undefined });",
        '    }',
        '}',
        '',
    ].join('\n'),
    'theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts': "export const CHROME_BAR_COPY = Object.freeze({ appMenu: 'Application menu' });\n",
    'theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx': [
        "export const Bar = () => <div><button aria-label='Back' title='Back' /><button title={CHROME_BAR_COPY.appMenu} aria-label={CHROME_BAR_COPY.appMenu} /></div>;",
        '',
    ].join('\n'),
};

const PLANTS = [
    {
        name: 'a PB command labelled with an Orca Add-project string',
        file: 'theia/extensions/planted/src/browser/planted-commands.ts',
        edit: () => "commands.registerCommand({ id: 'powerbrowser.planted.addProject', label: 'Add Project' }, { execute: () => undefined });\n",
        naming: "label 'Add Project'",
    },
    {
        name: 'a tab-bar toolbar item with that tooltip',
        file: 'theia/extensions/planted/src/browser/planted-toolbar.ts',
        edit: () => "registry.registerItem({ id: 'powerbrowser.planted.item', command: 'powerbrowser.planted.run', tooltip: 'Add a project...' });\n",
        naming: "tooltip 'Add a project...'",
    },
    {
        name: 'a menu action with that label',
        file: 'theia/extensions/planted/src/browser/planted-menu.ts',
        edit: () => "menus.registerMenuAction(['menubar'], { commandId: 'powerbrowser.planted.run', label: 'add  project' });\n",
        naming: "label 'add  project'",
    },
    {
        name: 'a chrome-bar button title with it',
        file: REL.chromeBar,
        edit: text => text.replace("title='Back'", "title='Add project'"),
        naming: "chrome-bar title 'Add project'",
    },
    {
        name: 'source moved: an empty vocabulary',
        file: 'orca/src/renderer/src/components/sidebar/sidebar-header-actions.tsx',
        edit: text => text.replace("'Add project'", "'Open folder'").replace("openModal('add-repo')", "openModal('open-folder')"),
        extra: { file: 'orca/src/renderer/src/components/sidebar/AddRepoStartSteps.tsx', edit: text => text.replace("'Add a project'", "'Get started'") },
        naming: 'source moved',
    },
    {
        name: 'parser blind: no command label parsed from orca-panes',
        file: 'theia/extensions/orca-panes/src/browser/orca-panes-frontend-module.ts',
        edit: text => text.replace(/commands\.registerCommand\(\{[^}]*\}, \{[^}]*\}\);\n/g, ''),
        naming: 'parser blind',
    },
];

function runSelfTest() {
    const tmp = mkdtempSync(join(tmpdir(), `${NAME}-`));
    try {
        for (const [rel, text] of Object.entries(FIXTURE)) { mkdirSync(dirname(join(tmp, rel)), { recursive: true }); writeFileSync(join(tmp, rel), text); }
        const control = check(tmp);
        if (control.fails.length) { console.error(`${NAME} self-test: FAIL -- control is not green: ${control.fails.join(' | ')}`); return 1; }
        console.log(`${NAME} self-test: control green -- vocabulary ${control.vocab.length}, PB set ${control.pb.length}, orca-panes labels ${control.panesLabels.length}`);
        let failures = 0;
        for (const p of PLANTS) {
            const edits = [{ file: p.file, edit: p.edit }, ...(p.extra ? [p.extra] : [])];
            const originals = edits.map(({ file, edit }) => {
                const path = join(tmp, file);
                const original = existsSync(path) ? readFileSync(path, 'utf8') : null;
                const planted = edit(original ?? '');
                mkdirSync(dirname(path), { recursive: true });
                writeFileSync(path, planted);
                return { path, original, applied: planted !== original };
            });
            let r;
            try { r = check(tmp); } finally {
                for (const { path, original } of originals) { if (original === null) rmSync(path); else writeFileSync(path, original); }
            }
            const text = r.fails.join('\n');
            if (originals.some(o => !o.applied)) { console.error(`  FAIL ${p.name} -> the plant did not apply (its anchor text moved)`); failures++; } else if (!r.fails.length) {
                console.error(`  FAIL ${p.name} -> stayed green`); failures++;
            } else if (!text.includes(p.naming)) {
                console.error(`  FAIL ${p.name} -> red, but not naming '${p.naming}': ${text}`); failures++;
            } else console.log(`  ok ${p.name} -> red, naming '${p.naming}'`);
        }
        const after = check(tmp);
        if (after.fails.length) { console.error(`${NAME} self-test: FAIL -- the control is not green again after the plants: ${after.fails.join(' | ')}`); return 1; }
        if (failures) { console.error(`${NAME} self-test: FAIL -- ${failures} of ${PLANTS.length} plant(s) did not go red naming the drift`); return 1; }
        console.log(`${NAME} self-test: PASS -- ${PLANTS.length} planted faults each went red naming the drift; control green before and after`);
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
        console.error(`${NAME}: unknown argument ${args[0] === '--self-test' ? args[1] : args[0]}`);
        console.error(`Usage: node ${SELF_REL} [--self-test]`);
        console.error('Next step: run it with no argument, or with --self-test.');
        process.exit(2);
    }
    if (!loadTypeScript()) { console.log(`${NAME}: SKIP -- theia/node_modules/typescript is absent; run the audited Theia install`); process.exit(0); }
    if (args[0] === '--self-test') process.exit(runSelfTest());
    if (!existsSync(join(REPO_ROOT, REL.sidebar))) { console.log(`${NAME}: SKIP -- orca/ is absent (P62-10); run bash scripts/fetch-orca.sh`); process.exit(0); }
    const r = check(REPO_ROOT);
    if (r.fails.length) { for (const f of r.fails) console.error(`${NAME}: FAIL -- ${f}`); process.exit(1); }
    console.log(`${NAME}: PASS -- vocabulary ${new Set(r.vocab.map(v => normalise(v.text))).size} Add-project strings from Orca's sidebar; PB set ${new Set(r.pb.map(p => normalise(p.text))).size} contribution strings (orca-panes labels: ${r.panesLabels.map(p => p.text).join(', ')}); intersection empty`);
    process.exit(0);
}
