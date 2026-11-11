#!/usr/bin/env node
// scripts/verify-orca-terminal-keys.mjs
//
// orca-terminal-keys (Phase 64, TERM-04; D-32, P64-33; interfaces C10', C13):
// in Orca and Theia terminals Ctrl+W and Ctrl+T go to the shell; Ctrl+Tab and
// Ctrl+PageUp/PageDown always switch PowerBrowser tabs, from terminals too;
// Ctrl+Shift+W closes the current tab from Theia focus; Orca's window shortcuts
// are off inside hosted Orca terminals (Orca's own 'terminal-first' policy, set in
// the hosted document's store only).
//
// Derived at check time, parsed with theia/node_modules/typescript (never by
// line grep), never hand-kept:
//  a. from the reserved PAGE_KEYS rows of powerbrowser/shell/powerbrowser.js
//     (accel to the literal ctrl): the shell keys (rows with a letter key) and
//     the switch keys (rows with a keycode), both required non-empty; the close
//     key, the closeTab row's key with shift added;
//  b. the switch pairing, from PAGE_SHORTCUTS' action bodies in
//     chrome-bar-shortcuts.ts: two switch rows whose actions are the same body
//     are twins and must be bound to the same Theia command;
//  c. ORCA_TERMINAL_PASSTHROUGH_KEYS, ORCA_TERMINAL_FOCUS_KEY and
//     ORCA_TERMINAL_KEYS_WHEN from orca-panes' protocol file, its keybinding rows
//     and the scoped focus key in orca-pane-widget.tsx;
//  d. every keybinding row naming a switch key or the close key: Theia core's
//     installed common-frontend-contribution.js (ctrl+tab, ctrl+shift+tab), the
//     chrome-bar rows (ctrl+pageup, ctrl+pagedown, ctrl+shift+w), any other
//     string-literal registration under theia/extensions/*/src or
//     theia/node_modules/@theia/*/lib/browser, and contributes.keybindings of
//     theia/plugins/*/extension/package.json when that folder exists;
//  e. the Orca half (C13), from the pinned orca/ source: the policy literal the
//     overlay entry applies, TerminalShortcutPolicy (types.ts),
//     normalizeTerminalShortcutPolicy's fallback and TUI_CONFLICT_ACTIONS
//     (effective.ts), the Linux default bindings (definitions-core-*.ts; Mod is
//     ctrl on Linux), every matches('id') and keybindingMatchesAction('id', ...)
//     literal in TerminalPane's keyboard sources (components/terminal-pane, tests
//     excluded), the actions the entry releases, and the chords Orca's xterm
//     bypass policy hard-codes (xterm-bypass-policy.ts).
// Red on: the passthrough set differing from the shell keys either way; a
// passthrough row anywhere under theia/extensions naming a switch key or the
// close key; a switch key with no binding to NEXT_TAB or PREVIOUS_TAB, with a
// when clause, or with a command different from its PAGE_SHORTCUTS twin's; the
// close key not bound to CLOSE_TAB, bound with a when clause or the ctrlcmd
// spelling; a collision (any other registration of a switch key or the close
// key); the passthrough rows' focus key, literal ctrl, passthrough-only and
// no-terminalFocus clauses; the entry's policy literal not a non-default member
// of TerminalShortcutPolicy; the entry calling an Orca settings or keybinding
// write action; an Orca terminal action active under that policy taking a D-32
// key; a released action not active in hosted terminals; and an active chord
// that sends a control character (Ctrl+letter, Ctrl+[, Ctrl+], Ctrl+\) while it
// could be released in memory (only a chord Orca's xterm bypass policy hard-codes
// cannot, and those are printed as owner items). The remaining active chords are
// printed as a note for the owner review.
//
// SKIP rules: the orca-panes half prints a named SKIP only while
// theia/extensions/orca-panes is absent; the Orca half only while orca/ is absent
// (P62-10). The directory present but a needed file missing is red.
//
// The live half is orca-terminal-keys-live.
//
// Tier: quick (static; one named SKIP when typescript is absent). --self-test
// copies the tree's files into a mkdtemp directory, adds a fixture orca-panes tree
// in C10's shape and plants faults.
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

const REL = {
    pageKeys: 'powerbrowser/shell/powerbrowser.js',
    shortcuts: 'theia/extensions/chrome-bar/src/browser/chrome-bar-shortcuts.ts',
    chromeKeys: 'theia/extensions/chrome-bar/src/browser/chrome-bar-keybindings.ts',
    extensions: 'theia/extensions',
    theiaModules: 'theia/node_modules/@theia',
    theiaCommon: 'theia/node_modules/@theia/core/lib/browser/common-frontend-contribution.js',
    plugins: 'theia/plugins',
    panes: 'theia/extensions/orca-panes',
    protocol: 'theia/extensions/orca-panes/src/common/orca-panes-protocol.ts',
    browserDir: 'theia/extensions/orca-panes/src/browser',
    frontend: 'theia/extensions/orca-panes/src/browser/orca-panes-frontend-module.ts',
    widget: 'theia/extensions/orca-panes/src/browser/orca-pane-widget.tsx',
    entry: 'orca-overlay/files/src/renderer/src/pb/pb-pane-mount.tsx',
    orca: 'orca',
    orcaTypes: 'orca/src/shared/keybindings/types.ts',
    orcaEffective: 'orca/src/shared/keybindings/effective.ts',
    orcaDefs: 'orca/src/shared/keybindings',
    orcaPane: 'orca/src/renderer/src/components/terminal-pane',
    orcaBypass: 'orca/src/renderer/src/components/terminal-pane/xterm-bypass-policy.ts',
};
const MODIFIERS = { accel: 'ctrl', shift: 'shift', alt: 'alt' };
const MODIFIER_ORDER = ['ctrl', 'shift', 'alt', 'meta'];
const KEYCODES = { VK_TAB: 'tab', VK_PAGE_UP: 'pageup', VK_PAGE_DOWN: 'pagedown' };
/** Theia tab commands by their CommonCommands member. */
const SWITCH_COMMANDS = ['NEXT_TAB', 'PREVIOUS_TAB'];
const CLOSE_COMMAND = 'CLOSE_TAB';
/** Orca's write actions for settings and keybindings: the entry may call none of them (C13). */
const ORCA_WRITE_ACTIONS = ['updateSettings', 'updateSettingsOrThrow', 'setKeybindingOverride', 'resetKeybindingOverride', 'disableKeybindingAction', 'setActiveRuntimeEnvironmentPreference'];
/** Orca key names (KeyboardEvent.code style) as Theia key names. */
const ORCA_KEY_NAMES = { bracketleft: '[', bracketright: ']', backslash: '\\', slash: '/', space: 'space', minus: '-', equal: '=' };

let ts;

/** Loads theia/node_modules/typescript; false when the Theia install is absent. */
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

function filesUnder(dir, test) {
    const out = [];
    if (!existsSync(dir)) return out;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) { if (e.name !== 'node_modules') out.push(...filesUnder(p, test)); } else if (test(e.name)) out.push(p);
    }
    return out;
}
const sourceFiles = (dir) => filesUnder(dir, (n) => /\.tsx?$/.test(n) && !n.endsWith('.d.ts'));

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

/** The string literals of an array literal (through Object.freeze(...) and `as` casts). */
function stringsOf(node) {
    const out = [];
    if (node) walk(node, (n) => { if (ts.isArrayLiteralExpression(n)) for (const e of n.elements) { const s = stringOf(e); if (s !== undefined) out.push(s); } });
    return out;
}

const callName = (call) => (ts.isPropertyAccessExpression(call.expression) ? call.expression.name.getText() : call.expression.getText());
const lineOf = (sf, n) => sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;

/** A Theia key string in one spelling: modifiers ordered ctrl, shift, alt, meta; ctrlcmd counts as ctrl (Linux). */
export function normKey(raw) {
    const parts = String(raw).toLowerCase().split('+').map((p) => p.trim());
    const base = parts.pop();
    const mods = new Set(parts.map((m) => ({ ctrlcmd: 'ctrl', cmd: 'meta', control: 'ctrl' }[m] ?? m)));
    return [...MODIFIER_ORDER.filter((m) => mods.has(m)), base].join('+');
}

/** An Orca binding ('Mod+Shift+D') as a Theia key on Linux ('ctrl+shift+d'). */
export function orcaToTheia(binding) {
    const parts = String(binding).split('+');
    const base = parts.pop().toLowerCase();
    const mods = new Set(parts.map((m) => ({ mod: 'ctrl', ctrl: 'ctrl', control: 'ctrl', shift: 'shift', alt: 'alt', option: 'alt', meta: 'meta', cmd: 'meta', super: 'meta' }[m.toLowerCase()] ?? m.toLowerCase())));
    return [...MODIFIER_ORDER.filter((m) => mods.has(m)), ORCA_KEY_NAMES[base] ?? base].join('+');
}

/** True for a chord that sends a control character to a terminal program: Ctrl alone with a letter, [, ] or \. */
export const isControlChord = (theiaKey) => /^ctrl\+([a-z]|\[|\]|\\)$/.test(theiaKey);

// ---------------------------------------------------------------- derivation

/** The reserved PAGE_KEYS rows as { id, key, kind: 'letter' | 'keycode' }; keys is the Theia key list. */
export function derivePageKeys(text) {
    const sf = parse('powerbrowser.js', text);
    const init = constInitializer(sf, 'PAGE_KEYS');
    if (!init || !ts.isArrayLiteralExpression(init)) return { fails: ['PAGE_KEYS array literal not found in powerbrowser.js'], keys: [], rows: [] };
    const fails = [];
    const rows = [];
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
        let kind;
        if (stringOf(p.key) !== undefined) { key = stringOf(p.key).toLowerCase(); kind = 'letter'; } else if (stringOf(p.keycode) !== undefined) {
            key = KEYCODES[stringOf(p.keycode)];
            kind = 'keycode';
            if (!key) fails.push(`unmapped key ${stringOf(p.keycode)} in PAGE_KEYS row ${id}`);
        } else fails.push(`PAGE_KEYS row ${id} has neither key nor keycode`);
        if (key) rows.push({ id, kind, mods, key: [...MODIFIER_ORDER.filter((m) => mods.includes(m)), key].join('+') });
    }
    return { fails, keys: rows.map((r) => r.key), rows };
}

/** D-32's three sets from the reserved PAGE_KEYS rows: { fails, shell, switch, close, rows }. */
export function deriveD32(text) {
    const d = derivePageKeys(text);
    const fails = [...d.fails];
    const shell = d.rows.filter((r) => r.kind === 'letter').map((r) => r.key);
    const switchKeys = d.rows.filter((r) => r.kind === 'keycode').map((r) => r.key);
    if (!shell.length) fails.push('no reserved PAGE_KEYS row with a letter key, so there are no shell keys');
    if (!switchKeys.length) fails.push('no reserved PAGE_KEYS row with a keycode, so there are no switch keys');
    const closeRow = d.rows.find((r) => r.id === 'closeTab');
    if (!closeRow) fails.push('no reserved closeTab row in PAGE_KEYS, so the close key cannot be derived');
    const close = closeRow ? normKey(`shift+${closeRow.key}`) : null;
    return { fails, shell, switch: switchKeys, close, rows: d.rows };
}

/** The shell, switch and close keys of a tree (the live check's source). */
export function deriveD32Keys(root = REPO_ROOT) {
    return deriveD32(readFileSync(join(root, REL.pageKeys), 'utf8'));
}

/** PAGE_SHORTCUTS' action bodies: row id -> the arrow function's body text, from the actions Map literal. */
function actionBodies(text) {
    const sf = parse('chrome-bar-shortcuts.ts', text);
    const out = {};
    walk(sf, (n) => {
        if (!ts.isNewExpression(n) || n.expression.getText() !== 'Map' || !n.arguments?.[0] || !ts.isArrayLiteralExpression(n.arguments[0])) return;
        for (const el of n.arguments[0].elements) {
            if (!ts.isArrayLiteralExpression(el) || el.elements.length !== 2) continue;
            const id = stringOf(el.elements[0]);
            const fn = el.elements[1];
            if (id !== undefined && (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))) out[id] = fn.body.getText().replace(/\s+/g, ' ');
        }
    });
    return out;
}

function readProtocol(text) {
    const sf = parse('orca-panes-protocol.ts', text);
    const keysInit = constInitializer(sf, 'ORCA_TERMINAL_PASSTHROUGH_KEYS');
    return {
        passthrough: keysInit ? stringsOf(keysInit) : undefined,
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

/**
 * Every keybinding row in a source: each object literal with a `keybinding` property, the key a string literal or
 * the variable of an enclosing for-of over an array literal (or over ORCA_TERMINAL_PASSTHROUGH_KEYS, whose values
 * are `passthroughKeys`). Resolves [{ raw, norm, command, when, passthrough, line }]; command is the CommonCommands
 * member for a CommonCommands.X.id row, else the command's source text.
 */
function keybindingRows(sf, passthroughKeys = []) {
    const rows = [];
    walk(sf, (n) => {
        if (!ts.isObjectLiteralExpression(n)) return;
        const p = propsOf(n);
        if (!p.keybinding) return;
        let raws = [];
        const lit = stringOf(p.keybinding);
        if (lit !== undefined) raws = [lit];
        else if (ts.isIdentifier(p.keybinding)) {
            for (let up = n.parent; up; up = up.parent) {
                if (ts.isForOfStatement(up) && ts.isVariableDeclarationList(up.initializer) && up.initializer.declarations[0].name.getText() === p.keybinding.getText()) {
                    raws = up.expression.getText() === 'ORCA_TERMINAL_PASSTHROUGH_KEYS' ? passthroughKeys : stringsOf(up.expression);
                    break;
                }
            }
        }
        const commandText = p.command?.getText() ?? '';
        const member = /CommonCommands\.(\w+)\.id$/.exec(commandText)?.[1];
        for (const raw of raws) {
            rows.push({
                raw, norm: normKey(raw), command: member ?? commandText, when: p.when ? p.when.getText() : undefined,
                passthrough: /PASSTHROUGH_PSEUDO_COMMAND$/.test(commandText), line: lineOf(sf, n),
            });
        }
    });
    return rows;
}

// ---------------------------------------------------------------- the Orca half (C13)

/** Linux default bindings by Orca action id, with scope and allowInTerminal, from definitions-core-*.ts. */
function orcaDefinitions(root) {
    const defs = new Map();
    const dir = join(root, REL.orcaDefs);
    for (const name of readdirSync(dir).filter((n) => /^definitions-core-\d+\.ts$/.test(n)).sort()) {
        const sf = parse(name, readFileSync(join(dir, name), 'utf8'));
        const linuxOf = (node) => {
            if (!node) return null;
            if (ts.isIdentifier(node)) return linuxOf(constInitializer(sf, node.getText()));
            if (ts.isArrayLiteralExpression(node)) return stringsOf(node);
            if (ts.isCallExpression(node) && callName(node) === 'platformBindings') return linuxOf(node.arguments[0]);
            if (ts.isObjectLiteralExpression(node)) return linuxOf(propsOf(node).linux);
            if (ts.isAsExpression?.(node) || ts.isParenthesizedExpression(node)) return linuxOf(node.expression);
            return null;
        };
        walk(sf, (n) => {
            if (!ts.isObjectLiteralExpression(n)) return;
            const p = propsOf(n);
            const id = stringOf(p.id);
            if (id === undefined || !p.defaultBindings) return;
            defs.set(id, {
                scope: stringOf(p.scope), allowInTerminal: p.allowInTerminal?.kind === ts.SyntaxKind.TrueKeyword,
                linux: linuxOf(p.defaultBindings), file: `${REL.orcaDefs}/${name}`,
            });
        });
    }
    return defs;
}

/** Every matches('id') and keybindingMatchesAction('id', ...) literal in TerminalPane's keyboard sources (tests excluded). */
function terminalPaneActions(root) {
    const ids = new Map();
    const files = filesUnder(join(root, REL.orcaPane), (n) => /\.tsx?$/.test(n) && !/\.(test|spec)\.tsx?$/.test(n) && !/fixture|test-harness/.test(n));
    for (const file of files) {
        const text = readFileSync(file, 'utf8');
        if (!/matches|keybindingMatchesAction/.test(text)) continue;
        const sf = parse(file, text);
        walk(sf, (n) => {
            if (!ts.isCallExpression(n) || !['matches', 'keybindingMatchesAction'].includes(n.expression.getText())) return;
            const id = stringOf(n.arguments[0]);
            if (id !== undefined && !ids.has(id)) ids.set(id, relative(root, file));
        });
    }
    return ids;
}

/** Resolves { fails, policy, active: [{ id, keys }], ownerItems: [{ key, id }], released }. */
function orcaHalf(root, d32) {
    const fails = [];
    const read = (rel) => readFileSync(join(root, rel), 'utf8');
    for (const rel of [REL.orcaTypes, REL.orcaEffective, REL.orcaBypass, REL.entry]) if (!existsSync(join(root, rel))) fails.push(`${rel} is missing while ${REL.orca}/ is present`);
    if (fails.length) return { fails, active: [], ownerItems: [], released: [] };

    // The entry: the policy literal and the released actions, and no Orca write action.
    const entrySf = parse(REL.entry, read(REL.entry));
    const policy = stringOf(constInitializer(entrySf, 'HOSTED_TERMINAL_SHORTCUT_POLICY'));
    const releasedInit = constInitializer(entrySf, 'HOSTED_TERMINAL_RELEASED_ACTIONS');
    const released = releasedInit ? stringsOf(releasedInit) : [];
    if (policy === undefined) fails.push(`HOSTED_TERMINAL_SHORTCUT_POLICY (a string literal) not found in ${REL.entry}`);
    if (!releasedInit) fails.push(`HOSTED_TERMINAL_RELEASED_ACTIONS not found in ${REL.entry}`);
    walk(entrySf, (n) => {
        if (ts.isCallExpression(n) && ORCA_WRITE_ACTIONS.includes(callName(n))) fails.push(`${REL.entry}:${lineOf(entrySf, n)} calls Orca's ${callName(n)}, which writes orcad's persisted settings or keybindings (C13 sets the policy in memory only)`);
        if (ts.isPropertyAccessExpression(n) && /^window\.api\.(settings|keybindings)$/.test(n.getText())) fails.push(`${REL.entry}:${lineOf(entrySf, n)} reaches ${n.getText()}, the host's persisted settings or keybindings`);
    });

    // Orca's policy vocabulary.
    const typesSf = parse(REL.orcaTypes, read(REL.orcaTypes));
    let members = null;
    walk(typesSf, (n) => {
        if (ts.isTypeAliasDeclaration(n) && n.name.getText() === 'TerminalShortcutPolicy') {
            members = ts.isUnionTypeNode(n.type) ? n.type.types.map((t) => (ts.isLiteralTypeNode(t) ? stringOf(t.literal) : undefined)).filter((x) => x !== undefined) : [];
        }
    });
    const effSf = parse(REL.orcaEffective, read(REL.orcaEffective));
    let fallback;
    walk(effSf, (n) => {
        if (ts.isFunctionDeclaration(n) && n.name?.getText() === 'normalizeTerminalShortcutPolicy') walk(n, (m) => { if (ts.isConditionalExpression(m)) fallback = stringOf(m.whenFalse); });
    });
    if (!members?.length) fails.push(`TerminalShortcutPolicy union not found in ${REL.orcaTypes}`);
    if (fallback === undefined) fails.push(`normalizeTerminalShortcutPolicy's fallback not found in ${REL.orcaEffective}`);
    if (policy !== undefined && members?.length && !members.includes(policy)) fails.push(`the entry's policy '${policy}' is not a member of TerminalShortcutPolicy (${members.join(', ')})`);
    if (policy !== undefined && fallback !== undefined && policy === fallback) fails.push(`the entry's policy '${policy}' is Orca's default (normalizeTerminalShortcutPolicy's fallback), so Orca's window shortcuts stay on in hosted terminals`);
    const tuiInit = constInitializer(effSf, 'TUI_CONFLICT_ACTIONS');
    const tui = new Set(tuiInit ? stringsOf(tuiInit) : []);
    if (!tui.size) fails.push(`TUI_CONFLICT_ACTIONS not found in ${REL.orcaEffective}`);
    if (fails.length) return { fails, policy, active: [], ownerItems: [], released };

    // The actions TerminalPane matches, filtered to those active under the policy, less the released ones.
    const defs = orcaDefinitions(root);
    const matched = terminalPaneActions(root);
    const activeUnderPolicy = [...matched.keys()].filter((id) => {
        const def = defs.get(id);
        return def && (def.scope === 'terminal' || def.allowInTerminal) && !tui.has(id);
    });
    for (const id of released) {
        if (!defs.has(id)) fails.push(`the entry releases '${id}', which is no Orca keybinding definition`);
        else if (!activeUnderPolicy.includes(id)) fails.push(`the entry releases '${id}', which is not active in hosted terminals under '${policy}' (a stale release)`);
    }
    const d32Keys = new Map([...d32.shell.map((k) => [k, 'shell key']), ...d32.switch.map((k) => [k, 'switch key']), ...(d32.close ? [[d32.close, 'close key']] : [])]);
    const bypassSf = parse(REL.orcaBypass, read(REL.orcaBypass));
    const hardCoded = new Set();
    walk(bypassSf, (n) => { if (ts.isCallExpression(n) && callName(n) === 'matchesClipboardBinding' && stringOf(n.arguments[2]) === 'linux') hardCoded.add(orcaToTheia(stringOf(n.arguments[0]))); });
    const active = [];
    const ownerItems = [];
    for (const id of activeUnderPolicy.filter((x) => !released.includes(x))) {
        const def = defs.get(id);
        if (def.linux === null) { fails.push(`Orca action ${id} (${def.file}) has Linux bindings this check cannot read`); continue; }
        const keys = def.linux.map(orcaToTheia);
        for (const key of keys) {
            if (d32Keys.has(key)) fails.push(`Orca action ${id}, active in hosted terminals under '${policy}', takes the D-32 ${d32Keys.get(key)} ${key}`);
            else if (isControlChord(key) && !hardCoded.has(key)) fails.push(`Orca action ${id}, active in hosted terminals under '${policy}', takes ${key}, a control character a terminal program reads, and it can be released in memory (add it to HOSTED_TERMINAL_RELEASED_ACTIONS)`);
            else if (isControlChord(key)) ownerItems.push({ key, id });
        }
        if (keys.length) active.push({ id, keys });
    }
    return { fails, policy, active, ownerItems, released };
}

// ---------------------------------------------------------------- the check

/** Resolves { fails, d32, panes, orca, note }. */
export function check(root) {
    const fails = [];
    const read = (rel) => readFileSync(join(root, rel), 'utf8');
    const has = (rel) => existsSync(join(root, rel));

    const d32 = deriveD32(read(REL.pageKeys));
    fails.push(...d32.fails);
    const out = { fails, d32, panes: 'compared', orca: 'compared', note: '' };

    // Switch and close keys: bindings, twins and collisions, from Theia core, chrome-bar and every other source.
    for (const rel of [REL.shortcuts, REL.chromeKeys, REL.theiaCommon]) if (!has(rel)) fails.push(`${rel} is missing`);
    if (fails.length) return out;
    const panesPresent = has(REL.panes);
    const k = panesPresent && has(REL.protocol) ? readProtocol(read(REL.protocol)) : { passthrough: undefined };
    const all = [];
    const add = (rel, rows) => { for (const r of rows) all.push({ ...r, rel }); };
    for (const file of sourceFiles(join(root, REL.extensions)).filter((f) => /\/src\//.test(f))) {
        const text = readFileSync(file, 'utf8');
        if (!/keybinding/.test(text)) continue;
        add(relative(root, file), keybindingRows(parse(file, text), k.passthrough ?? []));
    }
    for (const pkg of existsSync(join(root, REL.theiaModules)) ? readdirSync(join(root, REL.theiaModules)) : []) {
        for (const file of filesUnder(join(root, REL.theiaModules, pkg, 'lib', 'browser'), (n) => n.endsWith('.js'))) {
            const text = readFileSync(file, 'utf8');
            if (!/keybinding/.test(text) || !/tab['"]|page(up|down)|\+w['"]/i.test(text)) continue;
            add(relative(root, file), keybindingRows(parse(file, text)));
        }
    }
    for (const dir of existsSync(join(root, REL.plugins)) ? readdirSync(join(root, REL.plugins)) : []) {
        const rel = `${REL.plugins}/${dir}/extension/package.json`;
        if (!has(rel)) continue;
        let kb = [];
        try { kb = JSON.parse(read(rel))?.contributes?.keybindings ?? []; } catch { fails.push(`${rel} is not JSON`); }
        for (const row of [].concat(kb)) for (const raw of [row?.key, row?.linux].filter(Boolean)) all.push({ raw, norm: normKey(raw), command: row.command, when: row.when, passthrough: false, line: 0, rel });
    }
    const bodies = actionBodies(read(REL.shortcuts));
    const rowOfKey = new Map(d32.rows.map((r) => [r.key, r]));
    const tabCommand = {};
    for (const key of d32.switch) {
        const bound = all.filter((r) => r.norm === key && SWITCH_COMMANDS.includes(r.command) && [REL.theiaCommon, REL.chromeKeys].includes(r.rel));
        if (!bound.length) { fails.push(`switch key ${key} has no binding to NEXT_TAB or PREVIOUS_TAB (Theia core's common-frontend-contribution.js or ${REL.chromeKeys})`); continue; }
        for (const r of bound) {
            if (r.when !== undefined) fails.push(`switch key ${key} is bound with a when clause (${r.when}) in ${r.rel}:${r.line}; D-32 switch keys work from every tab`);
            if (/ctrlcmd/.test(r.raw)) fails.push(`switch key ${key} is bound as '${r.raw}' in ${r.rel}:${r.line}, not with the literal ctrl`);
        }
        tabCommand[key] = [...new Set(bound.map((r) => r.command))].join('/');
    }
    for (const key of d32.switch) {
        const id = rowOfKey.get(key)?.id;
        const twins = d32.switch.filter((other) => other !== key && bodies[rowOfKey.get(other)?.id] !== undefined && bodies[rowOfKey.get(other).id] === bodies[id]);
        if (bodies[id] === undefined) fails.push(`PAGE_SHORTCUTS has no action for the switch row ${id} (${key})`);
        else if (!twins.length) fails.push(`switch key ${key} (${id}) has no PAGE_SHORTCUTS twin with the same action body`);
        for (const twin of twins) {
            if (tabCommand[key] && tabCommand[twin] && tabCommand[key] !== tabCommand[twin]) fails.push(`switch key ${key} is bound to ${tabCommand[key]}, but its PAGE_SHORTCUTS twin ${twin} (the same action) is bound to ${tabCommand[twin]}`);
        }
    }
    if (d32.close) {
        const bound = all.filter((r) => r.norm === d32.close && r.command === CLOSE_COMMAND && r.rel === REL.chromeKeys);
        if (!bound.length) fails.push(`the close key ${d32.close} is not bound to CLOSE_TAB in ${REL.chromeKeys}`);
        for (const r of bound) {
            if (r.when !== undefined) fails.push(`the close key ${d32.close} is bound with a when clause (${r.when}) in ${r.rel}:${r.line}`);
            if (/ctrlcmd/.test(r.raw)) fails.push(`the close key is bound as '${r.raw}' in ${r.rel}:${r.line}: the ctrlcmd spelling, not the literal ctrl`);
        }
    }
    const tabKeys = new Set([...d32.switch, ...(d32.close ? [d32.close] : [])]);
    for (const r of all.filter((x) => tabKeys.has(x.norm))) {
        const kind = r.norm === d32.close ? 'close key' : 'switch key';
        if (r.passthrough) { fails.push(`a passthrough row names the ${kind} ${r.norm} in ${r.rel}:${r.line}; D-32 keeps it PowerBrowser's in every tab`); continue; }
        const expected = kind === 'switch key'
            ? SWITCH_COMMANDS.includes(r.command) && [REL.theiaCommon, REL.chromeKeys].includes(r.rel)
            : r.command === CLOSE_COMMAND && r.rel === REL.chromeKeys;
        if (!expected) fails.push(`collision: ${r.rel}:${r.line} registers the ${kind} ${r.norm} ('${r.raw}') to ${r.command || 'a command'}`);
    }

    // The orca-panes half: the passthrough set is the shell keys, and its rows stay scoped.
    if (!panesPresent) out.panes = 'SKIP -- theia/extensions/orca-panes is absent';
    else {
        for (const rel of [REL.protocol, REL.frontend, REL.widget]) if (!has(rel)) fails.push(`${rel} is missing while ${REL.panes} is present`);
        if (!fails.length) panesHalf(root, k, d32, fails);
    }

    // The Orca half (C13).
    if (!has(REL.orca) || !has(join(REL.orca, 'src'))) out.orca = 'SKIP -- orca/ is absent (P62-10)';
    else {
        const o = orcaHalf(root, d32);
        fails.push(...o.fails);
        out.orcaPolicy = o.policy;
        out.released = o.released;
        out.note = o.active.map((a) => `${a.id} ${a.keys.join('/')}`).join(', ');
        out.ownerItems = o.ownerItems;
    }
    return out;
}

function panesHalf(root, k, d32, fails) {
    if (!k.passthrough) fails.push(`ORCA_TERMINAL_PASSTHROUGH_KEYS not found in ${REL.protocol}`);
    if (k.focusKey === undefined) fails.push(`ORCA_TERMINAL_FOCUS_KEY not found in ${REL.protocol}`);
    if (k.when === undefined) fails.push(`ORCA_TERMINAL_KEYS_WHEN not found in ${REL.protocol}`);
    const passthrough = k.passthrough ?? [];
    for (const key of d32.shell) if (!passthrough.includes(key)) fails.push(`missing passthrough key ${key} (a shell key: a reserved PAGE_KEYS row with a letter key)`);
    for (const key of passthrough) if (!d32.shell.includes(normKey(key))) fails.push(`extra passthrough key ${key} (not a shell key)`);
    for (const key of passthrough) if (/\bctrlcmd\b|\bcmd\b|\bmeta\b/.test(key)) fails.push(`passthrough key ${key} uses the cross-platform modifier spelling, not literal ctrl`);
    if (k.when !== undefined && k.focusKey !== undefined && k.when !== k.focusKey) fails.push(`ORCA_TERMINAL_KEYS_WHEN is '${k.when}', want exactly the focus key '${k.focusKey}'`);

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
}

// ---------------------------------------------------------------- self-test

/** C10's shape, as lane p64-02 wrote it, with D-32's shell keys. */
const FIXTURE = {
    [REL.protocol]: `export const ORCA_TERMINAL_PASSTHROUGH_KEYS: readonly string[] = Object.freeze([
    'ctrl+w', 'ctrl+t',
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

/** The tree's own files the self-test copies (the Orca sources at the pin, the chrome-bar rows, Theia core's rows). */
const COPIED = [REL.pageKeys, REL.shortcuts, REL.chromeKeys, REL.theiaCommon, REL.entry, REL.orcaTypes, REL.orcaEffective, REL.orcaDefs, REL.orcaPane];
const OTHER_EXTENSION = 'theia/extensions/plant-ext/src/browser/plant-keybindings.ts';
const CORE3 = `${REL.orcaDefs}/definitions-core-3.ts`;

export const PLANTS = [
    // Kept from D-09's check, still meaningful under D-32.
    { name: 'reserved-row-added', naming: 'missing passthrough key ctrl+n', file: REL.pageKeys, edit: (s) => s.replace(/const PAGE_KEYS = \[\n/, (m) => `${m}      { id: "plant", key: "N", modifiers: "accel", reserved: true, landsInTheia: true },\n`) },
    { name: 'extra-key', naming: 'extra passthrough key ctrl+n', file: REL.protocol, edit: (s) => s.replace("'ctrl+w', ", "'ctrl+w', 'ctrl+n', ") },
    { name: 'cross-platform-spelling', naming: 'cross-platform modifier spelling', file: REL.protocol, edit: (s) => s.replace("'ctrl+w', ", "'ctrlcmd+w', ") },
    { name: 'wrong-when', naming: "ORCA_TERMINAL_KEYS_WHEN is 'terminalFocus && powerbrowser.orcaTerminalFocus'", file: REL.protocol, edit: (s) => s.replace("ORCA_TERMINAL_KEYS_WHEN = 'powerbrowser.orcaTerminalFocus'", "ORCA_TERMINAL_KEYS_WHEN = 'terminalFocus && powerbrowser.orcaTerminalFocus'") },
    { name: 'non-passthrough-keybinding', naming: 'keybinding outside the Orca passthrough', file: REL.frontend, edit: (s) => s.replace('    registerKeybindings(keybindings: KeybindingRegistry): void {\n', "    registerKeybindings(keybindings: KeybindingRegistry): void {\n        keybindings.registerKeybinding({ command: 'plant.command', keybinding: 'ctrl+k' });\n") },
    { name: 'scoped-key-for-every-kind', naming: 'created for every kind of hosted pane', file: REL.widget, edit: (s) => s.replace("if (this.options.kind === 'terminal') {", 'if (this.options.kind) {') },
    { name: 'focus-key-on-the-global-service', naming: 'not created on ContextKeyService.createScoped', file: REL.widget, edit: (s) => s.replace('const scoped = this.contextKeys.createScoped(this.node);', 'const scoped = this.contextKeys;') },
    { name: 'row-uses-terminalFocus', naming: 'orca-panes uses terminalFocus', file: REL.frontend, edit: (s) => s.replace('when: ORCA_TERMINAL_KEYS_WHEN }', "when: 'terminalFocus' }") },
    { name: 'unmapped-keycode', naming: 'unmapped key VK_INSERT', file: REL.pageKeys, edit: (s) => s.replace('keycode: "VK_PAGE_UP", modifiers: "accel", reserved: true', 'keycode: "VK_INSERT", modifiers: "accel", reserved: true') },
    { name: 'focus-key-constant-removed', naming: 'ORCA_TERMINAL_FOCUS_KEY not found', file: REL.protocol, edit: (s) => s.replace("export const ORCA_TERMINAL_FOCUS_KEY = 'powerbrowser.orcaTerminalFocus';\n", '') },
    // D-32.
    { name: 'ctrl+tab passthrough row in orca-panes', naming: 'a passthrough row names the switch key ctrl+tab', file: REL.protocol, edit: (s) => s.replace("'ctrl+w', 'ctrl+t',", "'ctrl+w', 'ctrl+t', 'ctrl+tab',") },
    { name: 'ctrl+w removed from the passthrough set', naming: 'missing passthrough key ctrl+w', file: REL.protocol, edit: (s) => s.replace("'ctrl+w', ", '') },
    { name: 'chrome-bar ctrl+pagedown row removed', naming: 'switch key ctrl+pagedown has no binding to NEXT_TAB or PREVIOUS_TAB', file: REL.chromeKeys, edit: (s) => s.replace(/\n[^\n]*keybinding: 'ctrl\+pagedown'[^\n]*/, '') },
    { name: 'a when clause on the ctrl+pageup row', naming: 'switch key ctrl+pageup is bound with a when clause', file: REL.chromeKeys, edit: (s) => s.replace("keybinding: 'ctrl+pageup' }", "keybinding: 'ctrl+pageup', when: '!terminalFocus' }") },
    { name: 'ctrlcmd+shift+w', naming: 'the ctrlcmd spelling', file: REL.chromeKeys, edit: (s) => s.replace("keybinding: 'ctrl+shift+w'", "keybinding: 'ctrlcmd+shift+w'") },
    { name: 'ctrl+pageup bound to NEXT_TAB', naming: 'its PAGE_SHORTCUTS twin ctrl+shift+tab (the same action) is bound to PREVIOUS_TAB', file: REL.chromeKeys, edit: (s) => s.replace("CommonCommands.PREVIOUS_TAB.id, keybinding: 'ctrl+pageup'", "CommonCommands.NEXT_TAB.id, keybinding: 'ctrl+pageup'") },
    { name: 'an extra ctrl+shift+w registration in another extension', naming: 'collision: theia/extensions/plant-ext', file: OTHER_EXTENSION, edit: () => "export const r = (k: any) => k.registerKeybinding({ command: 'plant.close', keybinding: 'ctrl+shift+w' });\n" },
    { name: "the entry's literal set to 'orca-first'", naming: "is Orca's default", file: REL.entry, edit: (s) => s.replace("HOSTED_TERMINAL_SHORTCUT_POLICY: TerminalShortcutPolicy = 'terminal-first'", "HOSTED_TERMINAL_SHORTCUT_POLICY: TerminalShortcutPolicy = 'orca-first'") },
    { name: 'terminal.closePane removed from TUI_CONFLICT_ACTIONS', naming: 'Orca action terminal.closePane, active in hosted terminals', file: REL.orcaEffective, edit: (s) => s.replace("  'terminal.closePane',\n", '') },
    { name: 'a terminal-scope Orca definition binding Ctrl+Tab', naming: 'takes the D-32 switch key ctrl+tab', file: CORE3, edit: (s) => s.replace("platformBindings(['Mod+Shift+Enter'])", "platformBindings(['Ctrl+Tab'])") },
    // The released control chords (Ctrl+[ is Escape in vim).
    { name: 'Ctrl+[ no longer released by the entry', naming: 'takes ctrl+[, a control character', file: REL.entry, edit: (s) => s.replace("['terminal.focusPreviousPane', 'terminal.focusNextPane']", "['terminal.focusNextPane']") },
    { name: 'a released action Orca does not match in terminals', naming: "releases 'tab.close', which is not active in hosted terminals", file: REL.entry, edit: (s) => s.replace("['terminal.focusPreviousPane', 'terminal.focusNextPane']", "['terminal.focusPreviousPane', 'terminal.focusNextPane', 'tab.close']") },
    { name: 'the entry persists the policy through Orca', naming: 'calls Orca\'s updateSettings', file: REL.entry, edit: (s) => s.replace('  apply(useAppStore.getState())\n', "  apply(useAppStore.getState())\n  void useAppStore.getState().updateSettings({ terminalShortcutPolicy: 'terminal-first' })\n") },
];

function runSelfTest() {
    const tmp = mkdtempSync(join(tmpdir(), `${NAME}-`));
    try {
        for (const rel of COPIED) {
            mkdirSync(dirname(join(tmp, rel)), { recursive: true });
            cpSync(join(REPO_ROOT, rel), join(tmp, rel), { recursive: true, filter: (src) => !/\.(test|spec)\.tsx?$/.test(src) });
        }
        // The SKIP half first: no orca-panes directory, the rest green with a named SKIP.
        const skipRun = check(tmp);
        if (skipRun.fails.length || !skipRun.panes.startsWith('SKIP')) {
            console.error(`${NAME} self-test: FAIL -- the run without orca-panes is not green with a named SKIP: ${skipRun.fails.join(' | ') || skipRun.panes}`);
            return 1;
        }
        console.log(`${NAME} self-test: control without orca-panes green -- orca-panes ${skipRun.panes}`);
        for (const [rel, text] of Object.entries(FIXTURE)) { mkdirSync(dirname(join(tmp, rel)), { recursive: true }); writeFileSync(join(tmp, rel), text); }
        const control = check(tmp);
        if (control.fails.length || control.panes !== 'compared' || control.orca !== 'compared') { console.error(`${NAME} self-test: FAIL -- control is not green: ${control.fails.join(' | ')}`); return 1; }
        console.log(`${NAME} self-test: control green -- the tree's PAGE_KEYS, chrome-bar rows, Theia core rows and Orca sources, and a fixture orca-panes tree in C10's shape`);
        let failures = 0;
        for (const p of PLANTS) {
            const file = join(tmp, p.file);
            const original = existsSync(file) ? readFileSync(file, 'utf8') : null;
            const planted = p.edit(original ?? '');
            if (planted === original) { console.error(`  FAIL ${p.name} -> the plant did not apply (its anchor text moved)`); failures++; continue; }
            mkdirSync(dirname(file), { recursive: true });
            writeFileSync(file, planted);
            let r;
            try { r = check(tmp); } finally { if (original === null) rmSync(file); else writeFileSync(file, original); }
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
    if (r.orca === 'compared') {
        console.log(`${NAME}: note -- Orca chords still active in hosted terminals under '${r.orcaPolicy}' (released in memory: ${r.released.join(', ')}): ${r.note || 'none'}`);
        for (const o of r.ownerItems) console.log(`${NAME}: note -- owner item: ${o.key} stays ${o.id} (Orca's xterm bypass policy hard-codes it; no in-memory release)`);
    }
    console.log(`${NAME}: PASS -- shell keys ${r.d32.shell.join(', ')}; switch keys ${r.d32.switch.join(', ')}; close key ${r.d32.close}; derived from PAGE_KEYS reserved rows; orca-panes rows ${r.panes}; switch and close bindings, twins and collisions compared; Orca terminal-first half ${r.orca}`);
    process.exit(0);
}
