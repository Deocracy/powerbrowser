#!/usr/bin/env node
// scripts/verify-orca-terminal-keys.mjs
//
// orca-terminal-keys (Phase 64, TERM-04; D-09, D-31, P64-33; interface C10): in a
// hosted Orca terminal tab the six tab keys pass through to the terminal program,
// and only there. Every other tab, Theia's t<n> terminals included, keeps
// PowerBrowser's bindings.
//
// Ported from refs/heads/ServerDestroyer/p63-02:scripts/verify-orca-terminal-keys.mjs
// by reading it and writing it again (never merged). Kept: the PAGE_KEYS
// derivation, the both-ways comparison, the literal-ctrl clause, the
// passthrough-only clause and the plant runner. Not ported, because they belong
// to the dropped o<n> bridge (D-31): the o<n> name pattern and its single
// definition, kind 'orca' on newTerminal, the stale-o<n> open-handler branch and
// the terminal: URI doc clause.
//
// Derived at check time, parsed with theia/node_modules/typescript (never by
// line grep):
//  a. the D-09 key set, from the PAGE_KEYS array literal in
//     powerbrowser/shell/powerbrowser.js, rows with reserved: true, each mapped
//     to a Theia key string (accel to the literal ctrl, shift to shift, key
//     letters lower-cased, VK_TAB to tab, VK_PAGE_UP to pageup, VK_PAGE_DOWN to
//     pagedown);
//  b. ORCA_TERMINAL_PASSTHROUGH_KEYS, ORCA_TERMINAL_FOCUS_KEY and
//     ORCA_TERMINAL_KEYS_WHEN, from orca-panes' src/common/orca-panes-protocol.ts;
//  c. every registerKeybinding call in orca-panes' browser sources;
//  d. every createKey(ORCA_TERMINAL_FOCUS_KEY) call and the branch around it in
//     orca-pane-widget.tsx;
//  e. every string literal in orca-panes' browser sources naming terminalFocus.
// Red on: a key missing from or extra to the passthrough set, an unmapped
// keycode or modifier, the cross-platform modifier spelling, a when clause other
// than the focus key, a keybinding outside the passthrough rows, the focus key
// created other than on a createScoped(node) inside a kind === 'terminal'
// branch, an orca-panes row using terminalFocus (which would take the keys from
// Theia's own terminals), a missing constant.
//
// SKIP rule: the orca-panes half prints a named SKIP only while
// theia/extensions/orca-panes is absent (lane p64-02 not merged); the PAGE_KEYS
// derivation still runs then and must yield D-09's six keys. The directory
// present but a constant, the frontend module or the widget missing is red.
//
// The live half (the keys reaching the PTY of a hosted terminal in a running
// PowerBrowser) is orca-terminal-keys-live.
//
// Tier: quick (static; one named SKIP when typescript is absent). --self-test
// runs the check on a fixture orca-panes tree in a mkdtemp directory (C10's
// shape, so it is meaningful before the merge) and plants faults.
//
// Usage:
//   node scripts/verify-orca-terminal-keys.mjs
//   node scripts/verify-orca-terminal-keys.mjs --self-test

import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'orca-terminal-keys';
const SELF_REL = 'scripts/verify-orca-terminal-keys.mjs';
const TS_DIR = join(REPO_ROOT, 'theia', 'node_modules', 'typescript');
/** D-09: the reserved rows are the six tab keys. */
const D09_KEY_COUNT = 6;

const REL = {
    pageKeys: 'powerbrowser/shell/powerbrowser.js',
    panes: 'theia/extensions/orca-panes',
    protocol: 'theia/extensions/orca-panes/src/common/orca-panes-protocol.ts',
    browserDir: 'theia/extensions/orca-panes/src/browser',
    frontend: 'theia/extensions/orca-panes/src/browser/orca-panes-frontend-module.ts',
    widget: 'theia/extensions/orca-panes/src/browser/orca-pane-widget.tsx',
};
const MODIFIERS = { accel: 'ctrl', shift: 'shift', alt: 'alt' };
const MODIFIER_ORDER = ['ctrl', 'shift', 'alt'];
const KEYCODES = { VK_TAB: 'tab', VK_PAGE_UP: 'pageup', VK_PAGE_DOWN: 'pagedown' };

let ts;

/** Loads theia/node_modules/typescript for derivePageKeys and check; false when the Theia install is absent. */
export function loadTypeScript() {
    if (!existsSync(TS_DIR) || !statSync(TS_DIR).isDirectory()) return false;
    ts ??= createRequire(import.meta.url)(TS_DIR);
    return true;
}

const parse = (file, text) => ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true,
    /\.m?js$/.test(file) ? ts.ScriptKind.JS : file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

function walk(node, visit) {
    visit(node);
    ts.forEachChild(node, (c) => walk(c, visit));
}

function sourceFiles(dir) {
    const out = [];
    if (!existsSync(dir)) return out;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) out.push(...sourceFiles(p));
        else if (/\.tsx?$/.test(e.name) && !e.name.endsWith('.d.ts')) out.push(p);
    }
    return out;
}

function stringOf(node) {
    return node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : undefined;
}

function constInitializer(sf, name) {
    let found;
    walk(sf, (n) => { if (ts.isVariableDeclaration(n) && n.name.getText() === name) found = n.initializer; });
    return found;
}

function propsOf(obj) {
    const out = {};
    for (const p of obj.properties) {
        if (ts.isPropertyAssignment(p)) out[p.name.getText().replace(/^["']|["']$/g, '')] = p.initializer;
        else if (ts.isShorthandPropertyAssignment(p)) out[p.name.getText()] = p.name;
    }
    return out;
}

const callName = (call) => (ts.isPropertyAccessExpression(call.expression) ? call.expression.name.getText() : call.expression.getText());
const lineOf = (sf, n) => sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;

// ---------------------------------------------------------------- derivation

export function derivePageKeys(text) {
    const sf = parse('powerbrowser.js', text);
    const init = constInitializer(sf, 'PAGE_KEYS');
    if (!init || !ts.isArrayLiteralExpression(init)) return { fails: ['PAGE_KEYS array literal not found in powerbrowser.js'], keys: [] };
    const fails = [];
    const keys = [];
    for (const el of init.elements) {
        if (!ts.isObjectLiteralExpression(el)) continue;
        const p = propsOf(el);
        if (!p.reserved || p.reserved.kind !== ts.SyntaxKind.TrueKeyword) continue;
        const id = stringOf(p.id) ?? '?';
        const mods = [];
        for (const m of (stringOf(p.modifiers) ?? '').split(',').filter(Boolean)) {
            if (!MODIFIERS[m]) fails.push(`unmapped modifier ${m} in PAGE_KEYS row ${id}`);
            else mods.push(MODIFIERS[m]);
        }
        let key;
        if (stringOf(p.key) !== undefined) key = stringOf(p.key).toLowerCase();
        else if (stringOf(p.keycode) !== undefined) {
            key = KEYCODES[stringOf(p.keycode)];
            if (!key) fails.push(`unmapped key ${stringOf(p.keycode)} in PAGE_KEYS row ${id}`);
        } else fails.push(`PAGE_KEYS row ${id} has neither key nor keycode`);
        if (key) keys.push([...MODIFIER_ORDER.filter((m) => mods.includes(m)), key].join('+'));
    }
    return { fails, keys };
}

function readProtocol(text) {
    const sf = parse('orca-panes-protocol.ts', text);
    const keysInit = constInitializer(sf, 'ORCA_TERMINAL_PASSTHROUGH_KEYS');
    const strings = [];
    if (keysInit) walk(keysInit, (n) => { if (ts.isArrayLiteralExpression(n)) for (const e of n.elements) { const s = stringOf(e); if (s !== undefined) strings.push(s); } });
    return {
        passthrough: keysInit ? strings : undefined,
        focusKey: stringOf(constInitializer(sf, 'ORCA_TERMINAL_FOCUS_KEY')),
        when: stringOf(constInitializer(sf, 'ORCA_TERMINAL_KEYS_WHEN')),
    };
}

/** True when `node` sits in the then-branch of an if whose condition tests kind === 'terminal'. */
function inTerminalBranch(node) {
    for (let p = node.parent, child = node; p; child = p, p = p.parent) {
        if (ts.isIfStatement(p) && p.thenStatement === child && /\bkind\s*===\s*['"]terminal['"]/.test(p.expression.getText())) return true;
    }
    return false;
}

// ---------------------------------------------------------------- the check

/** Resolves { fails, derived, panes: 'compared' | 'SKIP -- <reason>' }. */
export function check(root) {
    const fails = [];
    const read = (rel) => readFileSync(join(root, rel), 'utf8');
    const has = (rel) => existsSync(join(root, rel));

    const derived = derivePageKeys(read(REL.pageKeys));
    fails.push(...derived.fails);
    if (!has(REL.panes)) {
        if (derived.keys.length !== D09_KEY_COUNT) fails.push(`PAGE_KEYS reserved rows yield ${derived.keys.length} keys (${derived.keys.join(', ')}), D-09 names ${D09_KEY_COUNT}`);
        return { fails, derived: derived.keys, panes: 'SKIP -- lane p64-02 not merged' };
    }
    for (const rel of [REL.protocol, REL.frontend, REL.widget]) if (!has(rel)) fails.push(`${rel} is missing while ${REL.panes} is present`);
    if (fails.length) return { fails, derived: derived.keys, panes: 'compared' };

    const k = readProtocol(read(REL.protocol));
    if (!k.passthrough) fails.push(`ORCA_TERMINAL_PASSTHROUGH_KEYS not found in ${REL.protocol}`);
    if (k.focusKey === undefined) fails.push(`ORCA_TERMINAL_FOCUS_KEY not found in ${REL.protocol}`);
    if (k.when === undefined) fails.push(`ORCA_TERMINAL_KEYS_WHEN not found in ${REL.protocol}`);
    const passthrough = k.passthrough ?? [];
    for (const key of derived.keys) if (!passthrough.includes(key)) fails.push(`missing passthrough key ${key} (a reserved PAGE_KEYS row)`);
    for (const key of passthrough) if (!derived.keys.includes(key)) fails.push(`extra passthrough key ${key} (no reserved PAGE_KEYS row)`);
    for (const key of passthrough) if (/\bctrlcmd\b|\bcmd\b|\bmeta\b/.test(key)) fails.push(`passthrough key ${key} uses the cross-platform modifier spelling, not literal ctrl`);
    if (k.when !== undefined && k.focusKey !== undefined && k.when !== k.focusKey) fails.push(`ORCA_TERMINAL_KEYS_WHEN is '${k.when}', want exactly the focus key '${k.focusKey}'`);

    // c, d, e over every orca-panes browser source.
    let bindings = 0;
    let scopedTerminalKeys = 0;
    for (const file of sourceFiles(join(root, REL.browserDir))) {
        const rel = relative(root, file);
        const sf = parse(file, readFileSync(file, 'utf8'));
        walk(sf, (n) => {
            const s = stringOf(n);
            if (s !== undefined && /\bterminalFocus\b/.test(s)) fails.push(`orca-panes uses terminalFocus in ${rel}:${lineOf(sf, n)}, which would take the keys from Theia's own terminals`);
            if (!ts.isCallExpression(n)) return;
            const name = callName(n);
            const arg = n.arguments[0];
            if (name === 'registerKeybinding') {
                bindings++;
                const p = arg && ts.isObjectLiteralExpression(arg) ? propsOf(arg) : {};
                let loop = n.parent;
                while (loop && !ts.isForOfStatement(loop)) loop = loop.parent;
                const loopVar = loop && ts.isVariableDeclarationList(loop.initializer) ? loop.initializer.declarations[0].name.getText() : undefined;
                const ok = p.command?.getText() === 'KeybindingRegistry.PASSTHROUGH_PSEUDO_COMMAND'
                    && p.when?.getText() === 'ORCA_TERMINAL_KEYS_WHEN'
                    && loop && loop.expression.getText() === 'ORCA_TERMINAL_PASSTHROUGH_KEYS'
                    && p.keybinding?.getText() === loopVar;
                if (!ok) fails.push(`keybinding outside the Orca passthrough in ${rel}:${lineOf(sf, n)}`);
            }
            if (name === 'createKey' && arg?.getText() === 'ORCA_TERMINAL_FOCUS_KEY') {
                // The receiver must come from createScoped(<something>.node) declared in the same terminal-only branch.
                const receiver = ts.isPropertyAccessExpression(n.expression) ? n.expression.expression.getText() : '';
                let scopedOnNode = false;
                for (let p = n.parent; p && !scopedOnNode; p = p.parent) {
                    if (ts.isBlock(p)) {
                        walk(p, (m) => {
                            if (ts.isVariableDeclaration(m) && m.name.getText() === receiver && m.initializer && ts.isCallExpression(m.initializer)
                                && callName(m.initializer) === 'createScoped' && /\.node$/.test(m.initializer.arguments[0]?.getText() ?? '')) scopedOnNode = true;
                        });
                    }
                }
                if (rel !== REL.widget) fails.push(`the focus key is created outside ${REL.widget} (${rel}:${lineOf(sf, n)})`);
                else if (!inTerminalBranch(n)) fails.push(`the focus key is created for every kind of hosted pane in ${rel}:${lineOf(sf, n)}, not only inside a kind === 'terminal' branch`);
                else if (!scopedOnNode) fails.push(`the focus key in ${rel}:${lineOf(sf, n)} is not created on ContextKeyService.createScoped(<widget>.node)`);
                else scopedTerminalKeys++;
            }
        });
    }
    if (!bindings) fails.push('no passthrough keybinding registered by orca-panes');
    if (!scopedTerminalKeys) fails.push(`no scoped focus key created for hosted terminal widgets in ${REL.widget}`);
    return { fails, derived: derived.keys, panes: 'compared' };
}

// ---------------------------------------------------------------- self-test

/** C10's shape, as lane p64-02 wrote it: the protocol constants, the frontend rows and the widget branch. */
const FIXTURE = {
    [REL.protocol]: `export const ORCA_TERMINAL_PASSTHROUGH_KEYS: readonly string[] = Object.freeze([
    'ctrl+w', 'ctrl+t', 'ctrl+tab', 'ctrl+shift+tab', 'ctrl+pageup', 'ctrl+pagedown',
]);
export const ORCA_TERMINAL_FOCUS_KEY = 'powerbrowser.orcaTerminalFocus';
export const ORCA_TERMINAL_KEYS_WHEN = 'powerbrowser.orcaTerminalFocus';
`,
    [REL.frontend]: `import { KeybindingContribution, KeybindingRegistry } from '@theia/core/lib/browser';
import { ORCA_TERMINAL_KEYS_WHEN, ORCA_TERMINAL_PASSTHROUGH_KEYS } from '../common/orca-panes-protocol';

export class OrcaTerminalKeybindings implements KeybindingContribution {
    registerKeybindings(keybindings: KeybindingRegistry): void {
        for (const keybinding of ORCA_TERMINAL_PASSTHROUGH_KEYS) {
            keybindings.registerKeybinding({ command: KeybindingRegistry.PASSTHROUGH_PSEUDO_COMMAND, keybinding, when: ORCA_TERMINAL_KEYS_WHEN });
        }
    }
}
`,
    [REL.widget]: `import { ORCA_TERMINAL_FOCUS_KEY } from '../common/orca-panes-protocol';

export class OrcaPaneWidget {
    protected init(): void {
        this.node.setAttribute('data-pb-orca-pane', this.options.kind);
        if (this.options.kind === 'terminal') {
            const scoped = this.contextKeys.createScoped(this.node);
            scoped.createKey<boolean>(ORCA_TERMINAL_FOCUS_KEY, true);
            this.toDispose.push(scoped);
        }
        this.update();
    }
}
`,
};

export const PLANTS = [
    { name: 'reserved-row-added', naming: 'missing passthrough key ctrl+n', file: REL.pageKeys, edit: (s) => s.replace(/const PAGE_KEYS = \[\n/, (m) => `${m}      { id: "plant", key: "N", modifiers: "accel", reserved: true, landsInTheia: true },\n`) },
    { name: 'passthrough-key-removed', naming: 'missing passthrough key ctrl+w', file: REL.protocol, edit: (s) => s.replace("'ctrl+w', ", '') },
    { name: 'extra-key', naming: 'extra passthrough key ctrl+n', file: REL.protocol, edit: (s) => s.replace("'ctrl+w', ", "'ctrl+w', 'ctrl+n', ") },
    { name: 'cross-platform-spelling', naming: 'cross-platform modifier spelling', file: REL.protocol, edit: (s) => s.replace("'ctrl+w', ", "'ctrlcmd+w', ") },
    { name: 'wrong-when', naming: "ORCA_TERMINAL_KEYS_WHEN is 'terminalFocus && powerbrowser.orcaTerminalFocus'", file: REL.protocol, edit: (s) => s.replace("ORCA_TERMINAL_KEYS_WHEN = 'powerbrowser.orcaTerminalFocus'", "ORCA_TERMINAL_KEYS_WHEN = 'terminalFocus && powerbrowser.orcaTerminalFocus'") },
    { name: 'non-passthrough-keybinding', naming: 'keybinding outside the Orca passthrough', file: REL.frontend, edit: (s) => s.replace('    registerKeybindings(keybindings: KeybindingRegistry): void {\n', "    registerKeybindings(keybindings: KeybindingRegistry): void {\n        keybindings.registerKeybinding({ command: 'plant.command', keybinding: 'ctrl+k' });\n") },
    { name: 'scoped-key-for-every-kind', naming: 'created for every kind of hosted pane', file: REL.widget, edit: (s) => s.replace("if (this.options.kind === 'terminal') {", 'if (this.options.kind) {') },
    { name: 'focus-key-on-the-global-service', naming: 'not created on ContextKeyService.createScoped', file: REL.widget, edit: (s) => s.replace('const scoped = this.contextKeys.createScoped(this.node);', 'const scoped = this.contextKeys;') },
    { name: 'row-uses-terminalFocus', naming: 'orca-panes uses terminalFocus', file: REL.frontend, edit: (s) => s.replace('when: ORCA_TERMINAL_KEYS_WHEN }', "when: 'terminalFocus' }") },
    { name: 'unmapped-keycode', naming: 'unmapped key VK_INSERT', file: REL.pageKeys, edit: (s) => s.replace('keycode: "VK_PAGE_UP", modifiers: "accel", reserved: true', 'keycode: "VK_INSERT", modifiers: "accel", reserved: true') },
    { name: 'focus-key-constant-removed', naming: 'ORCA_TERMINAL_FOCUS_KEY not found', file: REL.protocol, edit: (s) => s.replace("export const ORCA_TERMINAL_FOCUS_KEY = 'powerbrowser.orcaTerminalFocus';\n", '') },
];

function runSelfTest() {
    const tmp = mkdtempSync(join(tmpdir(), `${NAME}-`));
    try {
        mkdirSync(dirname(join(tmp, REL.pageKeys)), { recursive: true });
        cpSync(join(REPO_ROOT, REL.pageKeys), join(tmp, REL.pageKeys));
        // The SKIP half first: no orca-panes directory, the derivation alone must be green and name the SKIP.
        const skipRun = check(tmp);
        if (skipRun.fails.length || !skipRun.panes.startsWith('SKIP -- lane p64-02 not merged')) {
            console.error(`${NAME} self-test: FAIL -- the pre-merge run is not a green derivation with a named SKIP: ${skipRun.fails.join(' | ') || skipRun.panes}`);
            return 1;
        }
        console.log(`${NAME} self-test: pre-merge control green -- ${skipRun.derived.length} keys derived, orca-panes ${skipRun.panes}`);
        for (const [rel, text] of Object.entries(FIXTURE)) { mkdirSync(dirname(join(tmp, rel)), { recursive: true }); writeFileSync(join(tmp, rel), text); }
        const control = check(tmp);
        if (control.fails.length || control.panes !== 'compared') { console.error(`${NAME} self-test: FAIL -- control is not green: ${control.fails.join(' | ')}`); return 1; }
        console.log(`${NAME} self-test: control green -- the tree's PAGE_KEYS and a fixture orca-panes tree in C10's shape`);
        let failures = 0;
        const originals = new Map();
        for (const p of PLANTS) {
            const file = join(tmp, p.file);
            if (!originals.has(file)) originals.set(file, readFileSync(file, 'utf8'));
            const planted = p.edit(originals.get(file));
            if (planted === originals.get(file)) { console.error(`  FAIL ${p.name} -> the plant did not apply (its anchor text moved)`); failures++; continue; }
            writeFileSync(file, planted);
            const r = check(tmp);
            writeFileSync(file, originals.get(file));
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
        process.exit(2);
    }
    if (!loadTypeScript()) { console.log(`${NAME}: SKIP -- theia/node_modules/typescript is absent; run the audited Theia install`); process.exit(0); }
    if (args[0] === '--self-test') process.exit(runSelfTest());
    const r = check(REPO_ROOT);
    if (r.fails.length) { for (const f of r.fails) console.error(`${NAME}: FAIL -- ${f}`); process.exit(1); }
    console.log(`${NAME}: PASS -- ${r.derived.length} keys derived from PAGE_KEYS reserved rows (${r.derived.join(', ')}); orca-panes rows ${r.panes}`);
    process.exit(0);
}
