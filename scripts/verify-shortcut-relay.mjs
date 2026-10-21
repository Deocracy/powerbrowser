#!/usr/bin/env node
/**
 * KEY-01/KEY-03's table gate (27-06): the page-scoped browser keys are one
 * table split across two files, and this gate holds the halves together.
 *
 * Everything is DERIVED at check time, comments stripped first:
 *   - chrome rows: the `PAGE_KEYS` array literal in powerbrowser.js;
 *   - frontend rows and the relay's action ids: `PAGE_SHORTCUTS` and the
 *     `actions` Map in chrome-bar-shortcuts.ts;
 *   - Firefox's own key rows: browser-sets.inc.xhtml evaluated for the Linux
 *     build (XP_UNIX and XP_GNOME defined, XP_MACOSX and XP_WIN not; the
 *     file's own #define/#expand honoured), letters for `data-l10n-id` keys
 *     read from the `.key` attribute in browserSets.ftl.
 * A derivation that yields nothing is a broken instrument, never a pass.
 *
 * Rules: (1) chrome ids = frontend ids = action ids, set equality naming
 * each drift; (2) per id, key, keycode and modifiers agree on both sides;
 * (3) each label and macLabel equals this file's formatter output for the
 * row (the formatters are exported so a live check derives tooltip text
 * from the same functions); (4) a reserved row names a Firefox key carrying
 * reserved="true" or sits in RESERVED_EXCEPTIONS with its reason, and an
 * exception that is not a reserved row is stale; (5) a row's `firefox` id
 * names an upstream key with the same key or keycode and modifiers; (6) no
 * row binds F11, Ctrl+P or Ctrl+K (KEY-04 names them); (7) the row-creation
 * loop skips `via: "replyListener"` rows and writes disabled="true"
 * unconditionally on every row it creates; (8) a `via: "replyListener"` row is
 * never reserved and names no Firefox key, and the reply listener reads its
 * rows from PAGE_KEYS through the `via` field.
 *
 * Honestly --quick: reads text sources only. No build, no browser, no
 * display, no network.
 *
 * Usage:
 *   node scripts/verify-shortcut-relay.mjs
 *   node scripts/verify-shortcut-relay.mjs --self-test
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'verify-shortcut-relay';

const CHROME_REL = 'powerbrowser/shell/powerbrowser.js';
const FRONTEND_REL = 'theia/extensions/chrome-bar/src/browser/chrome-bar-shortcuts.ts';
const SETS_REL = 'upstream/browser/base/content/browser-sets.inc.xhtml';
const FTL_REL = 'upstream/browser/locales/en-US/browser/browserSets.ftl';

/**
 * The one hand-kept list: reserved rows with no upstream <key> to point at.
 * Editing it is how a deliberate reservation is made; it shows in review.
 */
export const RESERVED_EXCEPTIONS = new Map([
    ['nextTab', 'tabbox.js:120-168 handles Ctrl+Tab in keydown because "tab navigation should always work"; no <key> row exists'],
    ['prevTab', 'tabbox.js:120-168 handles Ctrl+Shift+Tab in keydown; no <key> row exists'],
    ['nextTabPage', 'tabbox.js:120-168 handles Ctrl+Page Down in keydown; no <key> row exists'],
    ['prevTabPage', 'tabbox.js:120-168 handles Ctrl+Page Up in keydown; no <key> row exists'],
]);

const KEY_NAMES = {
    VK_LEFT: ['Left Arrow', '←'],
    VK_RIGHT: ['Right Arrow', '→'],
    VK_HOME: ['Home', '↖'],
    VK_ESCAPE: ['Esc', '⎋'],
    VK_TAB: ['Tab', '⇥'],
    VK_PAGE_UP: ['Page Up', '⇞'],
    VK_PAGE_DOWN: ['Page Down', '⇟'],
};

const mods = row => new Set(String(row.modifiers ?? '').split(',').map(m => m.trim()).filter(Boolean));

/** The key part of a label; null for a keycode this formatter does not know. */
function keyName(row, mac) {
    if (row.key) {
        return row.key;
    }
    if (KEY_NAMES[row.keycode]) {
        return KEY_NAMES[row.keycode][mac ? 1 : 0];
    }
    const fn = /^VK_(F\d{1,2})$/.exec(row.keycode ?? '');
    return fn ? fn[1] : null;
}

/** Linux and Windows rendering: Ctrl, Alt, Shift joined by "+", then the key. */
export function formatLabel(row) {
    const key = keyName(row, false);
    if (key === null) {
        return null;
    }
    const m = mods(row);
    const parts = [];
    if (m.has('accel') || m.has('control')) {
        parts.push('Ctrl');
    }
    if (m.has('alt')) {
        parts.push('Alt');
    }
    if (m.has('shift')) {
        parts.push('Shift');
    }
    return [...parts, key].join('+');
}

/** macOS rendering: ⌃⌥⇧⌘ for control, alt, shift, accel in that order, no separator, then the key. */
export function formatMacLabel(row) {
    const key = keyName(row, true);
    if (key === null) {
        return null;
    }
    const m = mods(row);
    return `${m.has('control') ? '⌃' : ''}${m.has('alt') ? '⌥' : ''}${m.has('shift') ? '⇧' : ''}${m.has('accel') ? '⌘' : ''}${key}`;
}

/** Removes // and block comments outside string literals. */
function stripComments(src) {
    let out = '';
    for (let i = 0; i < src.length; i++) {
        const c = src[i];
        if (c === '"' || c === "'" || c === '`') {
            let j = i + 1;
            while (j < src.length && src[j] !== c) {
                j += src[j] === '\\' ? 2 : 1;
            }
            out += src.slice(i, j + 1);
            i = j;
        } else if (c === '/' && src[i + 1] === '/') {
            while (i < src.length && src[i] !== '\n') {
                i++;
            }
            out += '\n';
        } else if (c === '/' && src[i + 1] === '*') {
            const end = src.indexOf('*/', i + 2);
            i = end < 0 ? src.length : end + 1;
        } else {
            out += c;
        }
    }
    return out;
}

const OPEN = { '[': ']', '(': ')', '{': '}' };

/** The text between the bracket at `at` and its match, skipping strings; null when unbalanced. */
function balanced(src, at) {
    const stack = [];
    for (let i = at; i < src.length; i++) {
        const c = src[i];
        if (c === '"' || c === "'" || c === '`') {
            let j = i + 1;
            while (j < src.length && src[j] !== c) {
                j += src[j] === '\\' ? 2 : 1;
            }
            i = j;
        } else if (OPEN[c]) {
            stack.push(OPEN[c]);
        } else if (c === stack[stack.length - 1]) {
            stack.pop();
            if (!stack.length) {
                return src.slice(at + 1, i);
            }
        }
    }
    return null;
}

/** The contents of the first `[` after `marker` (a regex ending just before it). */
function arrayAfter(src, marker) {
    const m = marker.exec(src);
    if (!m) {
        return null;
    }
    const at = src.indexOf('[', m.index + m[0].length);
    return at < 0 ? null : balanced(src, at);
}

/** Top-level comma-separated elements of an array body. */
function elements(body) {
    const out = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < body.length; i++) {
        const c = body[i];
        if (c === '"' || c === "'" || c === '`') {
            let j = i + 1;
            while (j < body.length && body[j] !== c) {
                j += body[j] === '\\' ? 2 : 1;
            }
            i = j;
        } else if (OPEN[c]) {
            depth++;
        } else if (c === ']' || c === ')' || c === '}') {
            depth--;
        } else if (c === ',' && depth === 0) {
            out.push(body.slice(start, i).trim());
            start = i + 1;
        }
    }
    out.push(body.slice(start).trim());
    return out.filter(Boolean);
}

/** `{ id: "x", reserved: true, ... }` as an object; null when not an object literal. */
function objectRow(text) {
    if (!text.startsWith('{')) {
        return null;
    }
    const row = {};
    for (const m of text.matchAll(/(\w+)\s*:\s*(?:"([^"]*)"|'([^']*)'|(true|false)\b)/g)) {
        row[m[1]] = m[4] !== undefined ? m[4] === 'true' : (m[2] ?? m[3]);
    }
    return row;
}

function rowsOf(src, marker, rel, failures) {
    const body = arrayAfter(src, marker);
    if (body === null) {
        failures.push(`${rel}: broken instrument -- the table array literal was not found`);
        return [];
    }
    const rows = [];
    for (const element of elements(body)) {
        const row = objectRow(element);
        if (!row || !row.id) {
            failures.push(`${rel}: a table element is not a row literal with an id: ${element.slice(0, 60)}`);
        } else {
            rows.push(row);
        }
    }
    if (!rows.length) {
        failures.push(`${rel}: broken instrument -- derived ZERO rows`);
    }
    return rows;
}

/** The relay's action ids: `['id', fn]` entries and `...[1, 2].map(n => [`prefix${n}`, fn])` spreads. */
function actionIdsOf(src, failures) {
    const body = arrayAfter(src, /readonly actions\s*=\s*new Map[\s\S]*?>\(\s*(?=\[)/);
    if (body === null) {
        failures.push(`${FRONTEND_REL}: broken instrument -- the relay's actions Map was not found`);
        return [];
    }
    const ids = [];
    for (const element of elements(body)) {
        const plain = /^\[\s*'([A-Za-z0-9]+)'\s*,/.exec(element);
        const spread = /^\.\.\.\[([\d,\s]+)\]\.map\(\s*\(?(\w+)\)?[\s\S]*?`(\w*)\$\{(\w+)\}(\w*)`/.exec(element);
        if (plain) {
            ids.push(plain[1]);
        } else if (spread && spread[2] === spread[4]) {
            for (const n of spread[1].split(',').map(s => s.trim()).filter(Boolean)) {
                ids.push(`${spread[3]}${n}${spread[5]}`);
            }
        } else {
            failures.push(`${FRONTEND_REL}: an actions entry this gate cannot read: ${element.slice(0, 60)}`);
        }
    }
    if (!ids.length) {
        failures.push(`${FRONTEND_REL}: broken instrument -- derived ZERO action ids`);
    }
    return ids;
}

/** `.key` attribute of each message in a Fluent file. */
function ftlKeys(src) {
    const keys = new Map();
    let current = null;
    for (const line of src.split('\n')) {
        const id = /^([a-z][\w-]*)\s*=/.exec(line);
        if (id) {
            current = id[1];
            continue;
        }
        const attr = /^\s+\.key\s*=\s*(\S+)/.exec(line);
        if (attr && current) {
            keys.set(current, attr[1]);
        } else if (line.trim() && !/^\s/.test(line)) {
            current = null;
        }
    }
    return keys;
}

/** Firefox's <key id> rows for the Linux build: id -> { key, keycode, modifiers, reserved }. */
function upstreamKeys(sets, ftl, failures) {
    const defines = new Map([['XP_UNIX', '1'], ['XP_GNOME', '1']]);
    const stack = [];
    const active = () => stack.every(Boolean);
    const kept = [];
    for (const line of sets.split('\n')) {
        const d = /^#(\w*)\s*(.*)$/.exec(line);
        if (!d) {
            if (active()) {
                kept.push(line);
            }
            continue;
        }
        const [, directive, rest] = d;
        const arg = rest.trim().split(/\s+/)[0];
        if (directive === 'ifdef' || directive === 'ifndef') {
            stack.push(defines.has(arg) === (directive === 'ifdef'));
        } else if (directive === 'else') {
            stack.push(!stack.pop());
        } else if (directive === 'endif') {
            stack.pop();
        } else if (directive === 'define') {
            if (active()) {
                defines.set(arg, rest.trim().slice(arg.length).trim() || '1');
            }
        } else if (directive === 'expand') {
            if (active()) {
                kept.push(rest.replace(/__(\w+)__/g, (all, name) => (defines.has(name) ? defines.get(name) : all)));
            }
        } else if (directive !== '' && directive !== 'include') {
            failures.push(`${SETS_REL}: broken instrument -- unsupported preprocessor directive #${directive}`);
        }
    }
    const letters = ftlKeys(ftl);
    const keys = new Map();
    const text = kept.join('\n').replace(/<!--[\s\S]*?-->/g, '');
    for (const m of text.matchAll(/<key\b([^>]*?)\/?>/g)) {
        const attrs = Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(a => [a[1], a[2]]));
        if (!attrs.id || keys.has(attrs.id)) {
            continue;
        }
        if (/__\w+__/.test(attrs.modifiers ?? '')) {
            failures.push(`${SETS_REL}: broken instrument -- ${attrs.id} kept an unexpanded macro: ${attrs.modifiers}`);
        }
        keys.set(attrs.id, {
            key: attrs.key ?? (attrs['data-l10n-id'] ? letters.get(attrs['data-l10n-id']) : undefined),
            keycode: attrs.keycode,
            modifiers: attrs.modifiers ?? '',
            reserved: attrs.reserved === 'true',
        });
    }
    if (!keys.size) {
        failures.push(`${SETS_REL}: broken instrument -- derived ZERO upstream key rows`);
    }
    return keys;
}

const sameMods = (a, b) => [...mods(a)].sort().join(',') === [...mods(b)].sort().join(',');
const sameKey = (a, b) => String(a.key ?? '').toUpperCase() === String(b.key ?? '').toUpperCase() && (a.keycode ?? '') === (b.keycode ?? '');
const describe = row => `${row.modifiers ? `${row.modifiers}+` : ''}${row.key ?? row.keycode}`;

function diffNamed(a, b, message, failures) {
    const bs = new Set(b);
    for (const id of new Set(a)) {
        if (!bs.has(id)) {
            failures.push(`${id}: ${message}`);
        }
    }
}

/** @returns {{ failures: string[], counts: object }} -- no failures means the gate holds. */
export function check(sources, exceptions = RESERVED_EXCEPTIONS) {
    const failures = [];
    const chromeSrc = stripComments(sources[CHROME_REL] ?? '');
    const frontendSrc = stripComments(sources[FRONTEND_REL] ?? '');
    const chrome = rowsOf(chromeSrc, /const PAGE_KEYS\s*=\s*/, CHROME_REL, failures);
    const frontend = rowsOf(frontendSrc, /PAGE_SHORTCUTS\b[^=]*=\s*/, FRONTEND_REL, failures);
    const actionIds = actionIdsOf(frontendSrc, failures);
    const upstream = upstreamKeys(sources[SETS_REL] ?? '', sources[FTL_REL] ?? '', failures);

    // (1) one id set across the chrome table, the frontend table and the actions.
    for (const [rows, rel] of [[chrome, CHROME_REL], [frontend, FRONTEND_REL]]) {
        const ids = rows.map(r => r.id);
        for (const id of new Set(ids.filter((x, i) => ids.indexOf(x) !== i))) {
            failures.push(`${id}: duplicated row id in ${rel}`);
        }
    }
    diffNamed(chrome.map(r => r.id), frontend.map(r => r.id), `a chrome row with no PAGE_SHORTCUTS row in ${FRONTEND_REL}`, failures);
    diffNamed(frontend.map(r => r.id), chrome.map(r => r.id), `a PAGE_SHORTCUTS row with no chrome row in ${CHROME_REL}`, failures);
    diffNamed(chrome.map(r => r.id), actionIds, 'a chrome row with no relay action (the key would do nothing)', failures);
    diffNamed(actionIds, chrome.map(r => r.id), 'a relay action no chrome row can fire', failures);

    const frontendById = new Map(frontend.map(r => [r.id, r]));
    for (const row of chrome) {
        const twin = frontendById.get(row.id);
        // (2) the two halves describe the same key.
        if (twin && (!sameKey(row, twin) || !sameMods(row, twin))) {
            failures.push(`${row.id}: key or modifiers drift between the sides: chrome ${describe(row)}, frontend ${describe(twin)}`);
        }
        // (4) a reservation is Firefox's own or a reasoned exception.
        if (row.reserved === true) {
            const fx = row.firefox ? upstream.get(row.firefox) : undefined;
            if (!(fx && fx.reserved) && !exceptions.has(row.id)) {
                failures.push(`${row.id}: reserved, but ${row.firefox ? `Firefox's ${row.firefox} is not reserved="true"` : 'it names no Firefox key'} and RESERVED_EXCEPTIONS has no reason for it`);
            }
        }
        // (5) the upstream key it claims to mirror.
        if (row.firefox) {
            const fx = upstream.get(row.firefox);
            if (!fx) {
                failures.push(`${row.id}: names Firefox key ${row.firefox}, which the Linux build of ${SETS_REL} does not define`);
            } else if (!sameKey(row, fx) || !sameMods(row, fx)) {
                failures.push(`${row.id}: key or modifiers differ from Firefox's ${row.firefox}: row ${describe(row)}, Firefox ${describe(fx)}`);
            }
        }
    }
    for (const id of exceptions.keys()) {
        if (!chrome.some(r => r.id === id && r.reserved === true)) {
            failures.push(`${id}: stale RESERVED_EXCEPTIONS entry -- no reserved row has this id`);
        }
    }
    // (3) labels, and (6) the keys KEY-04 leaves to Theia, on both sides.
    for (const row of frontend) {
        for (const [field, format] of [['label', formatLabel], ['macLabel', formatMacLabel]]) {
            const want = format(row);
            if (want === null || row[field] !== want) {
                failures.push(`${row.id}: ${field} ${JSON.stringify(row[field])} is not the formatter's ${JSON.stringify(want)}`);
            }
        }
    }
    for (const [rows, rel] of [[chrome, CHROME_REL], [frontend, FRONTEND_REL]]) {
        for (const row of rows) {
            const letter = String(row.key ?? '').toUpperCase();
            if (row.keycode === 'VK_F11' || (mods(row).has('accel') && (letter === 'P' || letter === 'K'))) {
                failures.push(`${row.id}: binds ${describe(row)} in ${rel}, a key KEY-04 leaves to Theia (F11, Ctrl+P, Ctrl+K)`);
            }
        }
    }
    // (8) reply-listener rows: page-blockable by construction, so never reserved, and no <key> to mirror.
    const replyRows = chrome.filter(r => r.via === 'replyListener');
    for (const row of replyRows) {
        if (row.reserved !== false) {
            failures.push(`${row.id}: a replyListener row must be reserved: false (a page keeps a key it prevents)`);
        }
        if (row.firefox) {
            failures.push(`${row.id}: a replyListener row names Firefox key ${row.firefox}; it has no <key> row to mirror`);
        }
    }
    if (replyRows.length && !/PAGE_KEYS\.filter\(\s*(\w+)\s*=>\s*\1\.via\s*===\s*"replyListener"\s*\)/.test(chromeSrc)) {
        failures.push(`${CHROME_REL}: the reply listener does not read its rows from PAGE_KEYS through the via field`);
    }
    // (7) every <key> row is created disabled, outside any branch, and reply rows get no <key>.
    const loopAt = /PAGE_KEYS(\.filter\(\s*(\w+)\s*=>\s*\2\.via\s*!==\s*"replyListener"\s*\))?\.map\(\s*\(?\w+\)?\s*=>\s*(?=\{)/.exec(chromeSrc);
    const loop = loopAt ? balanced(chromeSrc, loopAt.index + loopAt[0].length) : null;
    if (loop === null) {
        failures.push(`${CHROME_REL}: broken instrument -- the PAGE_KEYS row-creation loop was not found`);
    } else {
        if (replyRows.length && !loopAt[1]) {
            failures.push(`${CHROME_REL}: the PAGE_KEYS row-creation loop does not skip replyListener rows (${replyRows.map(r => r.id).join(', ')} would get a <key>)`);
        }
        let top = '';
        let depth = 0;
        // The loop body with every nested block collapsed to `{}`: what is left runs on every row.
        for (const c of loop) {
            depth += c === '{' ? 1 : c === '}' ? -1 : 0;
            top += depth === 0 ? (c === '}' ? '{}' : c) : '';
        }
        if (!/(^|[;{}]|\))\s*\w+\.setAttribute\(\s*"disabled"\s*,\s*"true"\s*\)\s*;/.test(top) || /\bif\s*\([^)]*\)\s*\w+\.setAttribute\(\s*"disabled"/.test(top)) {
            failures.push(`${CHROME_REL}: the PAGE_KEYS row-creation loop does not set disabled="true" unconditionally, so a row could act while the Theia frame has focus`);
        }
    }
    return { failures, counts: { rows: chrome.length, actions: actionIds.length, upstream: upstream.size, reserved: chrome.filter(r => r.reserved === true).length, reply: replyRows.length } };
}

function readSources() {
    return Object.fromEntries([CHROME_REL, FRONTEND_REL, SETS_REL, FTL_REL].map(rel => [rel, readFileSync(join(REPO_ROOT, rel), 'utf8')]));
}

function main() {
    const { failures, counts } = check(readSources());
    if (failures.length) {
        for (const f of failures) {
            console.error(`${NAME}: FAIL -- ${f}`);
        }
        return 1;
    }
    console.log(`${NAME}: PASS -- ${counts.rows} rows agree across chrome, frontend and ${counts.actions} relay actions; labels match the formatters; ${counts.reserved} reserved rows are Firefox's own or reasoned exceptions; Firefox ids match ${SETS_REL} (Linux, ${counts.upstream} keys); no F11/Ctrl+P/Ctrl+K row; every <key> row created disabled; ${counts.reply} reply-listener rows unreserved`);
    return 0;
}

/** Each plant: the file, the text it replaces and with what, and the text the red must name. */
const PLANTS = [
    { name: 'chrome-only id', rel: CHROME_REL, from: '    const PAGE_KEYS = [\n', to: '    const PAGE_KEYS = [\n      { id: "plantChromeOnly", key: "J", modifiers: "accel,alt", reserved: false, landsInTheia: false },\n', expect: 'plantChromeOnly' },
    { name: 'frontend-only id', rel: FRONTEND_REL, from: "export const PAGE_SHORTCUTS: readonly PageShortcut[] = [\n", to: "export const PAGE_SHORTCUTS: readonly PageShortcut[] = [\n    { id: 'plantFrontendOnly', key: 'J', modifiers: 'accel,alt', label: 'Ctrl+Alt+J', macLabel: '⌥⌘J' },\n", expect: 'plantFrontendOnly' },
    { name: 'missing action', rel: FRONTEND_REL, from: "        ['reload', tab => tab.reload()],\n", to: '', expect: 'reload: a chrome row with no relay action' },
    { name: 'modifier drift between the sides', rel: FRONTEND_REL, from: "{ id: 'hardReload', key: 'R', modifiers: 'accel,shift'", to: "{ id: 'hardReload', key: 'R', modifiers: 'accel'", expect: 'hardReload: key or modifiers drift between the sides' },
    { name: 'label drift', rel: FRONTEND_REL, from: "label: 'Alt+Left Arrow'", to: "label: 'Alt+Left'", expect: 'back: label' },
    { name: 'reload made reserved', rel: CHROME_REL, from: '{ id: "reload", key: "R", modifiers: "accel", reserved: false', to: '{ id: "reload", key: "R", modifiers: "accel", reserved: true', expect: 'reload: reserved' },
    { name: 'stale exception', exceptions: new Map([...RESERVED_EXCEPTIONS, ['reload', 'planted']]), expect: 'reload: stale RESERVED_EXCEPTIONS' },
    {
        name: 'accel+P row on both sides',
        edits: [
            { rel: CHROME_REL, from: '    const PAGE_KEYS = [\n', to: '    const PAGE_KEYS = [\n      { id: "plantPrint", key: "P", modifiers: "accel", reserved: false, landsInTheia: false },\n' },
            { rel: FRONTEND_REL, from: "export const PAGE_SHORTCUTS: readonly PageShortcut[] = [\n", to: "export const PAGE_SHORTCUTS: readonly PageShortcut[] = [\n    { id: 'plantPrint', key: 'P', modifiers: 'accel', label: 'Ctrl+P', macLabel: '⌘P' },\n" },
            { rel: FRONTEND_REL, from: "        ['reload', tab => tab.reload()],\n", to: "        ['reload', tab => tab.reload()],\n        ['plantPrint', tab => tab.reload()],\n" },
        ],
        expect: 'plantPrint: binds accel+P',
    },
    { name: 'firefox id with other modifiers', rel: CHROME_REL, from: 'firefox: "key_reload_skip_cache" }', to: 'firefox: "key_reload" }', expect: "hardReload: key or modifiers differ from Firefox's key_reload" },
    { name: 'reply row marked reserved', rel: CHROME_REL, from: '{ id: "focusAddressF6", keycode: "VK_F6", modifiers: "", reserved: false', to: '{ id: "focusAddressF6", keycode: "VK_F6", modifiers: "", reserved: true', expect: 'focusAddressF6: a replyListener row must be reserved: false' },
    { name: 'creation loop without the disabled write', rel: CHROME_REL, from: '      key.setAttribute("disabled", "true");\n', to: '', expect: 'does not set disabled="true" unconditionally' },
];

function selfTest() {
    const clean = readSources();
    let failed = 0;
    const control = check(clean);
    if (control.failures.length) {
        console.error(`${NAME} --self-test: FAIL -- the clean tree is not green: ${control.failures.join(' | ')}`);
        return 1;
    }
    console.log('  ok  clean tree -> green');
    for (const plant of PLANTS) {
        const sources = { ...clean };
        const edits = plant.edits ?? (plant.rel ? [plant] : []);
        let landed = !!plant.exceptions || edits.length > 0;
        for (const edit of edits) {
            const next = sources[edit.rel].replace(edit.from, edit.to);
            landed = landed && next !== sources[edit.rel];
            sources[edit.rel] = next;
        }
        if (!landed) {
            failed++;
            console.error(`${NAME} --self-test: FAIL -- plant '${plant.name}' did not land (its site drifted), so its result would mean nothing`);
            continue;
        }
        const { failures } = check(sources, plant.exceptions);
        const hit = failures.find(f => f.includes(plant.expect));
        if (hit) {
            console.log(`  ok  ${plant.name} -> red: ${hit}`);
        } else {
            failed++;
            console.error(`${NAME} --self-test: FAIL -- plant '${plant.name}' did not go red naming '${plant.expect}'; got: ${failures.join(' | ') || '(green)'}`);
        }
    }
    if (failed) {
        console.error(`${NAME} --self-test: FAIL -- ${failed} plant(s) did not behave as required`);
        return 1;
    }
    console.log(`${NAME} --self-test: PASS -- the clean tree is green and all ${PLANTS.length} plants went red: ${PLANTS.map(p => p.name).join(', ')}`);
    return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    process.exit(process.argv.includes('--self-test') ? selfTest() : main());
}
