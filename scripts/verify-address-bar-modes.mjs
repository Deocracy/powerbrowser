#!/usr/bin/env node
/**
 * Phase 30 (SMODE-01..03): the address bar's mode table under a Node test.
 *
 * `theia/extensions/chrome-bar/src/browser/address-bar/address-bar-mode-table.ts`
 * is pure on purpose (no import statement, only syntax Node strips natively),
 * so this script imports the .ts file itself and checks the tree's own table.
 * Two more sources are read as text and the table is compared against what
 * they derive (D-33, CLAUDE.md "derive from the tree"):
 *
 *   1. the keys of DEFAULT_MODE_BY_UI_MODE equal, as a set, the lowercased
 *      MODES literal of chrome-bar-widget.tsx (the ids the bar sends);
 *   2. the decided defaults hold: coding is command-centre (Chris,
 *      2026-10-20), browsing is address (D-01), organising is tabs (D-02).
 *      These are contract pins, like EXPECTED_NAV_COPY: editing them is how
 *      Chris's answer changes;
 *   3. every default is address or a LOCAL_MODES id;
 *   4. defaultModeFor returns the table value when it is available, address
 *      when it is not, and address for an unknown or custom id (D-17);
 *   5. the keys of MODE_SENDS equal address, engine and the LOCAL_MODES ids;
 *      every row has exactly the four flags; command-centre is all false
 *      (D-26);
 *   6. the LOCAL_MODES ids equal the keys of CHROME_BAR_COPY.modeLabels in
 *      chrome-bar-copy.ts; LOCAL_MODES is in D-08 order (command-centre,
 *      bookmarks, tabs, history, actions); restrict tokens are unique single
 *      characters; the trailing search row is on bookmarks, tabs and history
 *      and the cap is 10 on bookmarks and history (30-UI-SPEC, pinned);
 *   7. D-26: the body of AddressBar.runQuery (address-bar/address-bar.tsx,
 *      comments stripped) begins with a return guarded by the active mode's
 *      resolve flag (this.modeSends().resolve), so no path reaches its
 *      chrome requests in a mode that may not resolve;
 *  7a. D-26 (CR-01, WR-04): in onInputKeyDown's Enter branch (Enter,
 *      Alt+Enter and Ctrl+Enter), a guard on a variable assigned
 *      this.localMode() and on this.queryText() returns through
 *      enterLocalRow, and no typed-text commit (commitText, commitTyped,
 *      urlForRow, resolveTypedAddress, runOneOff, openRowInNewTab) comes
 *      before it or inside it; the positive control is that commits follow
 *      it; the Ctrl+Enter canonize condition negates that variable; and
 *      enterLocalRow calls no typed-text commit and opens only its row;
 *   8. D-26: address-bar/command-centre.ts references no chrome store
 *      client, none of the four typed-text kinds (resolveTypedAddress,
 *      searchSuggestions, autofillOrigin, searchPlaces) and not the
 *      suggestion service; the positive control is that the same scan finds
 *      every one of those names in address-bar.tsx and address-bar-modes.ts,
 *      so a scan that matches nothing is a broken instrument, never a pass;
 *   9. D-26: the Command centre contribution's id, derived from
 *      command-centre.ts, is the MODE_SENDS key whose row is all false;
 *  10. SMODE-04 (D-18): tokenise's planted cases -- `* foo` is Bookmarks and
 *      "foo", `% ` Tabs and empty text, `^ x` History, `> x` Actions outside
 *      Command centre and text inside it, `? x` the default engine's mode
 *      outside and text inside, `@two x` (case-insensitive) the aliased
 *      engine, `@nope x` text, `@two x` text in Command centre, `* x`
 *      Bookmarks in Command centre too;
 *  11. a token without a following space (`*foo`, `@two`, ...) stays text;
 *  12. derived: over every printable ASCII character c, the set whose "c x"
 *      switches mode outside Command centre equals the LOCAL_MODES restrict
 *      tokens plus `?`, and inside it (Command centre keeping > and ?, a stub
 *      for the registry) that set minus the kept tokens;
 *  13. D-19: cycleOrder for two engines with every mode contributed is the
 *      UI-SPEC's cycle (Address, the engines, Bookmarks, Tabs, History,
 *      Actions, Command centre; a contract pin), and without Actions the same
 *      minus Actions;
 *  14. nextMode wraps from Command centre to Address and back, and steps
 *      once each way in the middle;
 *  15. MENU-03 (W4): the app-menu entry list of ROADMAP.md's Phase 33 success
 *      criterion 5, parsed at check time (never a hand-kept copy), is rendered
 *      by the hamburger as wired rows, in that order: each entry equals the
 *      label (CHROME_BAR_COPY via the widget's appMenuLabel switch, a trailing
 *      "…" dropped) of a row of MENU_ORDER at or below MENU_PHASE that
 *      WIRED_MENU_IDS wires; a missing entry fails naming it;
 *  16. SMODE-07: the same criterion's Actions list (print, downloads, clear
 *      history, settings) each names a labelled Browser-category command;
 *  17. MENU-03 (D-13, T-33-05): every hamburger row that runs an action runs
 *      a Browser-category command id that chrome-bar-commands.ts registers --
 *      the id the Actions row for it runs -- (APP_MENU_COMMANDS, each
 *      commandLeaf, New Tab's arm), and no submenu row runs its own
 *      implementation (a row is a commandLeaf, a disabled information row, a
 *      page open or a stock-page open);
 *  18. SMODE-07 (D-13): ActionsAddressBarMode lists the Browser-category
 *      commands the registry holds at enumeration time and each row runs
 *      `executeCommand(command.id)` and nothing else: no id literal, no id
 *      const, no store client, no typed-text kind in its body. Command
 *      centre's silence is cases 5, 8 and 9 (MODE_SENDS all-false and the
 *      call-site scan); this phase adds no exception.
 *
 * Each case prints `ok <case>`; the run ends `verify-address-bar-modes: PASS`
 * or one `verify-address-bar-modes: FAIL -- <case>: <got>` line per red case.
 * A derivation that finds nothing (no MODES literal, no modeLabels) or a table
 * missing an export is a FAIL, never a pass.
 *
 * --self-test: the clean tree must be green; then twenty-three planted copies in a
 * mkdtemp directory (the organising row removed, browsing set to history,
 * command-centre's suggestions flag set true, the fallback removed from
 * defaultModeFor, tabs and bookmarks swapped in LOCAL_MODES, one modeLabels
 * key removed, a duplicated token, the history cap dropped, the runQuery
 * guard removed, CR-01's canonize branch moved above the local-mode guard, the
 * guard narrowed to Command centre, canonize without the local-mode test,
 * enterLocalRow falling back to the typed text, a resolve call added to
 * command-centre.ts, the contribution
 * id changed to address, tokenise accepting a token without a space,
 * nextMode not wrapping; Phase 33 plan 05: removed-command, reordered-menu,
 * resolve:true, ROADMAP-entry-missing, twin-implementation, actions-store)
 * must each go red naming the case that
 * catches it. A plant whose text did not change its source fails as "plant did
 * not apply".
 *
 * Honestly --quick: reads ten source files, writes only under mkdtemp, no
 * build, no browser, no display, no network.
 *
 * Usage:
 *   node scripts/verify-address-bar-modes.mjs
 *   node scripts/verify-address-bar-modes.mjs --self-test
 */

import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'verify-address-bar-modes';
const TABLE_REL = 'theia/extensions/chrome-bar/src/browser/address-bar/address-bar-mode-table.ts';
const WIDGET_REL = 'theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx';
const COPY_REL = 'theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts';
const ADDRESS_BAR_REL = 'theia/extensions/chrome-bar/src/browser/address-bar/address-bar.tsx';
const MODES_REL = 'theia/extensions/chrome-bar/src/browser/address-bar/address-bar-modes.ts';
const CENTRE_REL = 'theia/extensions/chrome-bar/src/browser/address-bar/command-centre.ts';
// Phase 33 plan 05 (MENU-03, SMODE-07): the hamburger table, its builder, the command registry and the ROADMAP criterion.
const CMD_REL = 'theia/extensions/chrome-bar/src/browser/chrome-bar-commands.ts';
const MENU_TABLE_REL = 'theia/extensions/chrome-bar/src/browser/site-identity/site-identity-table.ts';
const APP_MENU_REL = 'theia/extensions/chrome-bar/src/browser/site-identity/app-menu.ts';
const ROADMAP_REL = '.planning/ROADMAP.md';
/** D-26: the names a mode reaches chrome or an engine through while typing. */
const TYPED_TEXT_SENDERS = ['ChromeStoreClient', 'resolveTypedAddress', 'searchSuggestions', 'autofillOrigin', 'searchPlaces', 'ChromeBarSuggestionService'];
const EXPORTS = ['LOCAL_MODES', 'DEFAULT_MODE_BY_UI_MODE', 'defaultModeFor', 'MODE_SENDS', 'engineModeId', 'engineNameOf', 'tokenise', 'cycleOrder', 'nextMode'];
/** 30-UI-SPEC "Tokens and keys": the Accel+Up/Down cycle for two engines with every mode contributed (a contract pin). */
const CYCLE_PIN = ['address', 'engine:A', 'engine:B', 'bookmarks', 'tabs', 'history', 'actions', 'command-centre'];
/** SMODE-04: the token context of the planted cases -- one alias, a default engine, and Command centre keeping > and ? (a stub for the registry). */
const TOKEN_CONTEXT = { aliases: [['@two', 'Engine Two']], defaultEngine: 'Engine One', keepInCommandCentre: token => token === '>' || token === '?' };

/** The decided defaults (contract pins). */
const DECIDED = { coding: 'command-centre', browsing: 'address', organising: 'tabs' };
/** D-08's menu order of the local modes. */
const MENU_ORDER = ['command-centre', 'bookmarks', 'tabs', 'history', 'actions'];
const FLAGS = ['resolve', 'suggestions', 'autofill', 'places'];
/** 30-UI-SPEC "Result lists by mode": which local modes add the trailing search row, and their caps (contract pins). */
const SEARCH_ROWS_AND_CAPS = {
    'command-centre': { searchRow: false, cap: null },
    bookmarks: { searchRow: true, cap: 10 },
    tabs: { searchRow: true, cap: null },
    history: { searchRow: true, cap: 10 },
    actions: { searchRow: false, cap: null },
};

const sameSet = (a, b) => a.length === b.length && new Set(a).size === a.length && a.every(x => b.includes(x));
const sorted = a => [...a].sort();

/** The widget's MODES literal, lowercased; null when the literal is gone or empty. */
function deriveUiModes(widgetSrc) {
    const body = /static readonly MODES\s*=\s*\[([^\]]*)\]/.exec(widgetSrc)?.[1];
    const ids = body ? [...body.matchAll(/'([^']+)'/g)].map(m => m[1].toLowerCase()) : [];
    return ids.length ? ids : null;
}

/** The keys of CHROME_BAR_COPY.modeLabels; null when the object is gone or empty. */
function deriveLabelKeys(copySrc) {
    const body = /modeLabels:\s*Object\.freeze\(\{([\s\S]*?)\}\)/.exec(copySrc)?.[1];
    const keys = body ? [...body.matchAll(/(?:'([^']+)'|([A-Za-z_$][\w$]*))\s*:/g)].map(m => m[1] ?? m[2]) : [];
    return keys.length ? keys : null;
}

/** Source text without its block and line comments (a URL's // inside a string is not in these files' code). */
const stripComments = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** The body of the method declared by `head` (its first brace to the matching one); null when the method is gone. */
function methodBody(src, head) {
    const at = src.indexOf(head);
    if (at < 0) {
        return null;
    }
    const open = src.indexOf('{', at + head.length);
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        depth += src[i] === '{' ? 1 : src[i] === '}' ? -1 : 0;
        if (depth === 0) {
            return src.slice(open + 1, i);
        }
    }
    return null;
}

/** Case 7's reading: the first statement of runQuery is `if (<cond>) { return; }`; returns the condition, else null. */
function runQueryGuard(addressBarSrc) {
    const body = methodBody(stripComments(addressBarSrc), 'protected async runQuery(');
    return body === null ? null : /^\s*if\s*\(([^{};]*)\)\s*\{\s*return;\s*\}/.exec(body)?.[1] ?? '';
}

/** D-26 (CR-01): the calls that can carry the pill's typed text to chrome's resolve or an engine. */
const TEXT_COMMITS = /\b(commitText|commitTyped|urlForRow|resolveTypedAddress|runOneOff|openRowInNewTab)\s*\(/g;

/**
 * Case 8's reading of onInputKeyDown's Enter branch (Enter, Alt+Enter and
 * Ctrl+Enter all live in it): the local-mode guard (a variable assigned
 * this.localMode(), tested with this.queryText(), whose block returns), the
 * typed-text commits before and after it, the canonize branch's condition and
 * enterLocalRow's commits; null fields when a piece is gone.
 */
function enterBranch(addressBarSrc) {
    const src = stripComments(addressBarSrc);
    const keyDown = methodBody(src, 'protected onInputKeyDown = (');
    const body = keyDown === null ? null : methodBody(keyDown, "else if (e.key === 'Enter')");
    if (body === null) {
        return null;
    }
    const guard = /const (\w+) = this\.localMode\(\);\s*if \(\1 && this\.queryText\(\)\) \{([^{}]*)\}/.exec(body);
    const commits = [...body.matchAll(TEXT_COMMITS)].map(m => ({ name: m[1], at: m.index }));
    const guardEnd = guard ? guard.index + guard[0].length : -1;
    const canonize = /if \(([^{}]*)\) \{\s*void this\.commitText\(\w+, \{ canonize: true \}\);/.exec(body)?.[1] ?? null;
    const local = methodBody(src, 'protected async enterLocalRow(');
    return {
        guard: guard ? { variable: guard[1], block: guard[2] } : null,
        before: guard ? commits.filter(c => c.at < guard.index).map(c => c.name) : null,
        inGuard: guard ? [...guard[2].matchAll(TEXT_COMMITS)].map(m => m[1]).filter(name => name !== 'openRowInNewTab') : null,
        after: commits.filter(c => c.at > guardEnd).map(c => c.name),
        canonize,
        enterLocalRow: local === null ? null : {
            commits: [...local.matchAll(TEXT_COMMITS)].map(m => m[1]).filter(name => name !== 'openRowInNewTab'),
            rowlessOpens: [...local.matchAll(/\bopenRowInNewTab\(\s*(?!row\b)/g)].length,
        },
    };
}

/** The TYPED_TEXT_SENDERS names `src` references outside comments. */
const sendersIn = src => TYPED_TEXT_SENDERS.filter(name => new RegExp(`\\b${name}\\b`).test(stripComments(src)));

/** The id the Command centre class declares; null when the class or its id is gone. */
function centreId(centreSrc) {
    const body = methodBody(centreSrc, 'export class CommandCentreAddressBarMode');
    return body === null ? null : /readonly id = '([^']+)'/.exec(body)?.[1] ?? null;
}

/** The cases: each returns null when it holds, else what it got. */
function cases(m, uiModes, labelKeys, srcs) {
    const localIds = m.LOCAL_MODES.map(entry => entry.id);
    return [
        ['default table keys equal the widget\'s MODES ids', () =>
            uiModes && sameSet(Object.keys(m.DEFAULT_MODE_BY_UI_MODE), uiModes)
                ? null : { table: sorted(Object.keys(m.DEFAULT_MODE_BY_UI_MODE)), widget: uiModes ?? `no MODES literal in ${WIDGET_REL}` }],
        ['decided defaults hold (coding command-centre, browsing address, organising tabs)', () =>
            Object.entries(DECIDED).every(([ui, mode]) => m.DEFAULT_MODE_BY_UI_MODE[ui] === mode)
                ? null : { ...m.DEFAULT_MODE_BY_UI_MODE }],
        ['every default is address or a LOCAL_MODES id', () => {
            const bad = Object.entries(m.DEFAULT_MODE_BY_UI_MODE).filter(([, mode]) => mode !== 'address' && !localIds.includes(mode));
            return bad.length ? bad : null;
        }],
        ['defaultModeFor: table value when available, address when not, address for an unknown or custom id', () => {
            const all = () => true;
            const none = () => false;
            const got = {
                coding: m.defaultModeFor('coding', all),
                codingUnavailable: m.defaultModeFor('coding', none),
                browsingUnavailable: m.defaultModeFor('browsing', none),
                unknown: m.defaultModeFor('no-such-mode', all),
                proto: m.defaultModeFor('constructor', all),
                custom: m.defaultModeFor('my custom mode', all),
            };
            const want = { coding: m.DEFAULT_MODE_BY_UI_MODE.coding, codingUnavailable: 'address', browsingUnavailable: 'address', unknown: 'address', proto: 'address', custom: 'address' };
            return JSON.stringify(got) === JSON.stringify(want) ? null : got;
        }],
        ['MODE_SENDS keys are address, engine and the LOCAL_MODES ids; four flags each; command-centre all false', () => {
            const keys = Object.keys(m.MODE_SENDS);
            const want = ['address', 'engine', ...localIds];
            const badRows = keys.filter(k => !sameSet(Object.keys(m.MODE_SENDS[k]), FLAGS) || FLAGS.some(f => typeof m.MODE_SENDS[k][f] !== 'boolean'));
            const cc = m.MODE_SENDS['command-centre'];
            const ccSends = cc ? FLAGS.filter(f => cc[f] !== false) : ['no command-centre row'];
            return sameSet(keys, want) && !badRows.length && !ccSends.length ? null : { keys: sorted(keys), want: sorted(want), badRows, commandCentreSends: ccSends };
        }],
        ['LOCAL_MODES ids equal the modeLabels keys', () =>
            labelKeys && sameSet(localIds, labelKeys)
                ? null : { localModes: sorted(localIds), modeLabels: labelKeys ? sorted(labelKeys) : `no modeLabels in ${COPY_REL}` }],
        ['LOCAL_MODES search rows and caps are the UI-SPEC\'s (search row on bookmarks, tabs, history; cap 10 on bookmarks and history)', () => {
            const got = Object.fromEntries(m.LOCAL_MODES.map(entry => [entry.id, { searchRow: entry.searchRow === true, cap: entry.cap ?? null }]));
            return JSON.stringify(got) === JSON.stringify(SEARCH_ROWS_AND_CAPS) ? null : got;
        }],
        ['LOCAL_MODES order is D-08\'s', () =>
            JSON.stringify(localIds) === JSON.stringify(MENU_ORDER) ? null : localIds],
        ['restrict tokens are unique single characters', () => {
            const tokens = m.LOCAL_MODES.map(entry => entry.restrictToken).filter(token => token !== undefined);
            return tokens.every(token => typeof token === 'string' && token.length === 1) && new Set(tokens).size === tokens.length ? null : tokens;
        }],
        ['runQuery begins with a return guarded by this.modeSends().resolve (D-26)', () => {
            const guard = runQueryGuard(srcs[ADDRESS_BAR_REL]);
            return guard !== null && /!this\.modeSends\(\)\.resolve\b/.test(guard)
                ? null : { guard: guard ?? `no runQuery in ${ADDRESS_BAR_REL}` };
        }],
        ['Enter, Alt+Enter and Ctrl+Enter: a local mode with typed text returns through enterLocalRow before any typed-text commit (D-26, CR-01)', () => {
            const enter = enterBranch(srcs[ADDRESS_BAR_REL]);
            if (!enter) {
                return { brokenInstrument: `no onInputKeyDown Enter branch in ${ADDRESS_BAR_REL}` };
            }
            if (!enter.after.length) {
                return { brokenInstrument: 'the scan found no typed-text commit after the guard, so it matches nothing', enter };
            }
            const ok = enter.guard && /\breturn;/.test(enter.guard.block) && /this\.enterLocalRow\(/.test(enter.guard.block)
                && !enter.before.length && !enter.inGuard.length;
            return ok ? null : { guard: enter.guard ?? 'no `const x = this.localMode(); if (x && this.queryText())` guard', commitsBeforeGuard: enter.before, commitsInGuard: enter.inGuard };
        }],
        ['Ctrl+Enter canonizes only outside a local mode (D-26, CR-01)', () => {
            const enter = enterBranch(srcs[ADDRESS_BAR_REL]);
            const variable = enter?.guard?.variable;
            return variable && enter.canonize && new RegExp(`!${variable}\\b`).test(enter.canonize)
                ? null : { canonize: enter?.canonize ?? 'no canonize branch', localVariable: variable ?? null };
        }],
        ['enterLocalRow acts only on the highlighted row, never on the typed text (D-26, WR-02)', () => {
            const local = enterBranch(srcs[ADDRESS_BAR_REL])?.enterLocalRow;
            return local && !local.commits.length && !local.rowlessOpens ? null : local ?? { enterLocalRow: `no enterLocalRow in ${ADDRESS_BAR_REL}` };
        }],
        ['command-centre.ts sends nothing typed to chrome (no store client, typed-text kind or suggestion service)', () => {
            const control = sendersIn(srcs[ADDRESS_BAR_REL] + '\n' + srcs[MODES_REL]);
            if (control.length !== TYPED_TEXT_SENDERS.length) {
                return { brokenInstrument: `the scan found only ${JSON.stringify(control)} of ${JSON.stringify(TYPED_TEXT_SENDERS)} in ${ADDRESS_BAR_REL} and ${MODES_REL}` };
            }
            const found = sendersIn(srcs[CENTRE_REL]);
            return found.length ? { commandCentreReferences: found } : null;
        }],
        ['the Command centre contribution id is the MODE_SENDS key whose row is all false', () => {
            const id = centreId(srcs[CENTRE_REL]);
            const row = id !== null ? m.MODE_SENDS[id] : undefined;
            return row && FLAGS.every(f => row[f] === false) ? null : { id: id ?? `no CommandCentreAddressBarMode id in ${CENTRE_REL}`, row: row ?? null };
        }],
        ['tokenise: a token and a space enter its mode, consumed; Command centre keeps > and ? and @ (D-18)', () => {
            const t = (text, mode = 'address') => m.tokenise(text, mode, TOKEN_CONTEXT);
            const got = {
                star: t('* foo'), percent: t('% '), caret: t('^ x'), actions: t('> x'), actionsInCentre: t('> x', 'command-centre'),
                engine: t('? x'), engineInCentre: t('? x', 'command-centre'), alias: t('@two x'), aliasCased: t('@TWO x'),
                unknownAlias: t('@nope x'), aliasInCentre: t('@two x', 'command-centre'), starInCentre: t('* x', 'command-centre'),
            };
            const want = {
                star: { mode: 'bookmarks', text: 'foo' }, percent: { mode: 'tabs', text: '' }, caret: { mode: 'history', text: 'x' },
                actions: { mode: 'actions', text: 'x' }, actionsInCentre: null, engine: { mode: m.engineModeId('Engine One'), text: 'x' },
                engineInCentre: null, alias: { mode: m.engineModeId('Engine Two'), text: 'x' }, aliasCased: { mode: m.engineModeId('Engine Two'), text: 'x' },
                unknownAlias: null, aliasInCentre: null, starInCentre: { mode: 'bookmarks', text: 'x' },
            };
            return JSON.stringify(got) === JSON.stringify(want) ? null : got;
        }],
        ['tokenise: a token without a following space stays text', () => {
            const got = ['*foo', '%', '^x', '>x', '?x', '@two', '@twox', ' * x'].map(text => [text, m.tokenise(text, 'address', TOKEN_CONTEXT)]).filter(([, r]) => r !== null);
            return got.length ? got : null;
        }],
        ['tokenise: the characters whose token switches are the restrict tokens and ?, minus those Command centre keeps (derived over printable ASCII)', () => {
            const restrict = m.LOCAL_MODES.map(entry => entry.restrictToken).filter(token => token !== undefined);
            const printable = Array.from({ length: 0x7f - 0x21 }, (_, i) => String.fromCharCode(0x21 + i));
            const switching = mode => printable.filter(c => m.tokenise(`${c} x`, mode, TOKEN_CONTEXT) !== null);
            const outside = switching('address');
            const inside = switching('command-centre');
            const wantOutside = [...restrict, '?'];
            const wantInside = wantOutside.filter(c => !TOKEN_CONTEXT.keepInCommandCentre(c));
            return restrict.length && sameSet(outside, wantOutside) && sameSet(inside, wantInside)
                ? null : { outside: sorted(outside), wantOutside: sorted(wantOutside), inside: sorted(inside), wantInside: sorted(wantInside) };
        }],
        ['cycleOrder: Address, the engines in order, the local modes, Command centre; an uncontributed mode left out (D-19)', () => {
            const all = m.cycleOrder(['A', 'B'], () => true);
            const noActions = m.cycleOrder(['A', 'B'], id => id !== 'actions');
            const wantNoActions = CYCLE_PIN.filter(id => id !== 'actions');
            return JSON.stringify(all) === JSON.stringify(CYCLE_PIN) && JSON.stringify(noActions) === JSON.stringify(wantNoActions)
                ? null : { all, noActions };
        }],
        ['nextMode wraps both ways', () => {
            const got = [
                m.nextMode(CYCLE_PIN, 'command-centre', 1), m.nextMode(CYCLE_PIN, 'address', -1),
                m.nextMode(CYCLE_PIN, 'address', 1), m.nextMode(CYCLE_PIN, 'tabs', -1),
            ];
            const want = ['address', 'command-centre', 'engine:A', 'bookmarks'];
            return JSON.stringify(got) === JSON.stringify(want) ? null : got;
        }],
        ['MENU-03 (W4): the ROADMAP Phase 33 app-menu entries are wired hamburger rows, in ROADMAP order (derived at check time)', () => {
            const roadmap = deriveRoadmapMenu(srcs[ROADMAP_REL]);
            const rows = deriveMenuRows(srcs);
            if (!roadmap || !roadmap.menu.length || !rows) {
                return { brokenInstrument: `ROADMAP entries ${JSON.stringify(roadmap)} or hamburger rows ${JSON.stringify(rows)} did not derive from ${ROADMAP_REL} / the menu sources` };
            }
            const labels = rows.map(row => row.label);
            const missing = roadmap.menu.filter(name => !labels.includes(name));
            if (missing.length) {
                return { roadmapEntriesMissingFromTheMenu: missing };
            }
            const order = labels.filter(label => roadmap.menu.includes(label));
            return JSON.stringify(order) === JSON.stringify(roadmap.menu) ? null : { menuOrder: order, roadmapOrder: roadmap.menu };
        }],
        ['SMODE-07: the ROADMAP Phase 33 Actions entries each name a labelled Browser-category command', () => {
            const roadmap = deriveRoadmapMenu(srcs[ROADMAP_REL]);
            const browser = deriveBrowserCommands(srcs[CMD_REL]);
            if (!roadmap || !roadmap.actions.length || !browser) {
                return { brokenInstrument: `ROADMAP Actions entries ${JSON.stringify(roadmap?.actions)} or Browser commands did not derive` };
            }
            const labels = [...browser.values()].map(label => label.toLowerCase());
            const missing = roadmap.actions.filter(entry => !labels.some(label => entry.toLowerCase().split(/\s+/).every(word => label.includes(word))));
            return missing.length ? { actionsEntriesWithNoBrowserCommand: missing } : null;
        }],
        ['MENU-03 (D-13): every hamburger row that runs an action runs a registered Browser-category command id, and no submenu row runs its own implementation', () => {
            const browser = deriveBrowserCommands(srcs[CMD_REL]);
            const menuIds = deriveMenuCommandIds(srcs[WIDGET_REL]);
            if (!browser || !menuIds) {
                return { brokenInstrument: `Browser commands (${browser?.size ?? 0}) or menu command ids (${menuIds?.length ?? 0}) did not derive` };
            }
            const notBrowser = menuIds.filter(id => !browser.has(id));
            const submenu = /protected appSubmenu\([\s\S]*?\n {4}\}\n/.exec(srcs[WIDGET_REL])?.[0] ?? '';
            if (!submenu) {
                return { brokenInstrument: `no appSubmenu in ${WIDGET_REL}` };
            }
            const ownRows = [...submenu.matchAll(/this\.menuLeaf\(([^\n]*)/g)].map(x => x[1])
                .filter(call => !/\(\) => undefined, false\)/.test(call) && !/\(\) => this\.(openPlace|openStockPageRow)\(/.test(call) && !/^`bookmark-\$\{index\}`/.test(call));
            return notBrowser.length || ownRows.length ? { menuIdsNotBrowserCommands: notBrowser, submenuRowsRunningTheirOwnImplementation: ownRows } : null;
        }],
        ['SMODE-07 (D-13): Actions rows are the Browser-category enumeration at check time and run the command id only', () => {
            const body = methodBody(srcs[MODES_REL], 'export class ActionsAddressBarMode');
            if (!body) {
                return { brokenInstrument: `no ActionsAddressBarMode class in ${MODES_REL}` };
            }
            const enumerates = /command\.category === CHROME_BAR_COMMAND_CATEGORY/.test(body) && /await this\.commands\.executeCommand\(command\.id\);/.test(body);
            const reaches = [...sendersIn(body), ...(/'powerbrowser\.|_COMMAND_ID\b|this\.store\b/.test(stripComments(body)) ? ['an id literal, an id const or the store'] : [])];
            return enumerates && !reaches.length ? null : { enumeratesTheBrowserCategory: enumerates, actionsRowReaches: reaches };
        }],
        ['engineModeId and engineNameOf round-trip; a local id has no engine', () => {
            const got = [m.engineNameOf(m.engineModeId('Some Engine')), m.engineNameOf('tabs'), m.engineNameOf('address')];
            return JSON.stringify(got) === JSON.stringify(['Some Engine', null, null]) ? null : got;
        }],
    ];
}

/** ROADMAP.md's Phase 33 success criterion 5: its app-menu entries and its Actions entries; null when the line is gone. */
function deriveRoadmapMenu(roadmapSrc) {
    const start = roadmapSrc.indexOf('### Phase 33:');
    const end = roadmapSrc.indexOf('\n### ', start + 1);
    const section = start < 0 ? '' : roadmapSrc.slice(start, end < 0 ? undefined : end);
    const line = /The app menu reaches (.+?); Actions mode runs (.+?) and the other browser actions/.exec(section);
    if (!line) {
        return null;
    }
    const split = text => text.split(/,\s*|\s+and\s+/).map(x => x.trim()).filter(Boolean);
    return { menu: split(line[1]), actions: split(line[2]) };
}

/** A CHROME_BAR_COPY value by key: a plain literal, or a template whose interpolation reads as {App}. */
function copyValue(copySrc, key) {
    const plain = new RegExp(`^\\s*${key}: '([^']*)',`, 'm').exec(copySrc);
    if (plain) {
        return plain[1];
    }
    const template = new RegExp(`^\\s*${key}: \\([^)]*\\) => \`([^\`]*)\`,`, 'm').exec(copySrc);
    return template ? template[1].replace(/\$\{[^}]+\}/g, '{App}') : null;
}

/** The hamburger rows this tree renders as wired rows, in table order, each with its label; null when a derivation is empty. */
function deriveMenuRows(srcs) {
    const phase = Number(/export const MENU_PHASE = (\d+);/.exec(srcs[MENU_TABLE_REL])?.[1]);
    const table = [...srcs[MENU_TABLE_REL].matchAll(/\{ menuId: '([a-z-]+)',(?: stockPage: '[a-z]+',)? minPhase: (\d+), group: \d+ \}/g)].map(x => ({ id: x[1], minPhase: Number(x[2]) }));
    const wiredBody = /export const WIRED_MENU_IDS[^=]*= Object\.freeze\(\[([\s\S]*?)\]\);/.exec(srcs[APP_MENU_REL])?.[1] ?? '';
    const wired = [...wiredBody.matchAll(/'([a-z-]+)'/g)].map(x => x[1]);
    const labelSwitch = /function appMenuLabel\([^)]*\)[^{]*\{([\s\S]*?)\n\}/.exec(srcs[WIDGET_REL])?.[1] ?? '';
    const labels = new Map([...labelSwitch.matchAll(/case '([a-z-]+)': return CHROME_BAR_COPY\.([A-Za-z]+)/g)].map(x => [x[1], copyValue(srcs[COPY_REL], x[2])]));
    if (!phase || !table.length || !wired.length || !labels.size) {
        return null;
    }
    return table.filter(row => row.minPhase <= phase && wired.includes(row.id))
        .map(row => ({ id: row.id, label: (labels.get(row.id) ?? '').replace(/…$/, '').replace(/ \(Ctrl\+[A-Z]\)$/, '') }));
}

/** The labelled Browser-category commands chrome-bar-commands.ts registers: id const -> label; null when none derive. */
function deriveBrowserCommands(commandsSrc) {
    const out = new Map();
    for (const [, name, body] of commandsSrc.matchAll(/export const (CHROME_BAR_\w+): Command = \{([^}]*)\}/g)) {
        const id = /id: (CHROME_BAR_[A-Z_]+_COMMAND_ID)/.exec(body)?.[1];
        const label = /label: '([^']+)'/.exec(body)?.[1];
        if (id && label && /category: CHROME_BAR_COMMAND_CATEGORY\b/.test(body) && commandsSrc.includes(`commands.registerCommand(${name}, {`)) {
            out.set(id, label);
        }
    }
    return out.size ? out : null;
}

/** The command id consts the hamburger runs: APP_MENU_COMMANDS, each commandLeaf, New Tab's arm; null when none derive. */
function deriveMenuCommandIds(widgetSrc) {
    const map = /const APP_MENU_COMMANDS[^=]*= Object\.freeze\(\{([\s\S]*?)\}\);/.exec(widgetSrc)?.[1] ?? '';
    const ids = [
        ...[...map.matchAll(/'[a-z-]+': (CHROME_BAR_[A-Z_]+_COMMAND_ID)/g)].map(x => x[1]),
        ...[...widgetSrc.matchAll(/this\.commandLeaf\('[a-z-]+', CHROME_BAR_COPY\.[A-Za-z]+, (CHROME_BAR_[A-Z_]+_COMMAND_ID)/g)].map(x => x[1]),
        ...[...widgetSrc.matchAll(/row\.menuId === 'new-tab'\) \{\s*void this\.runCommand\((CHROME_BAR_[A-Z_]+_COMMAND_ID)\)/g)].map(x => x[1]),
    ];
    return ids.length ? ids : null;
}

/** Runs every case against the table at `tablePath` and the sources' text (by rel path); returns `{ oks, failures }`. */
async function runAt(tablePath, srcs) {
    let m;
    try {
        m = await import(pathToFileURL(tablePath).href);
    } catch (error) {
        return { oks: [], failures: [`import: the mode table could not be loaded (${error.message})`] };
    }
    const missing = EXPORTS.filter(name => m[name] === undefined);
    if (missing.length) {
        return { oks: [], failures: [`exports: the mode table exports no ${missing.join(', ')} -- broken instrument, nothing was tested`] };
    }
    const oks = [];
    const failures = [];
    for (const [name, run] of cases(m, deriveUiModes(srcs[WIDGET_REL]), deriveLabelKeys(srcs[COPY_REL]), srcs)) {
        let got;
        try {
            got = run();
        } catch (error) {
            got = `threw ${error.message}`;
        }
        if (got === null) {
            oks.push(name);
        } else {
            failures.push(`${name}: ${JSON.stringify(got)}`);
        }
    }
    return { oks, failures };
}

const read = rel => readFileSync(join(REPO_ROOT, rel), 'utf8');
const SOURCES = [TABLE_REL, WIDGET_REL, COPY_REL, ADDRESS_BAR_REL, MODES_REL, CENTRE_REL, CMD_REL, MENU_TABLE_REL, APP_MENU_REL, ROADMAP_REL];
/** ROADMAP.md first, then the archived milestone roadmaps: the Phase 33 criterion moves to `.planning/milestones/vX.Y-ROADMAP.md` when its milestone closes. */
const MILESTONES_REL = '.planning/milestones';
function readRoadmapWithCriterion() {
    const archived = existsSync(join(REPO_ROOT, MILESTONES_REL))
        ? readdirSync(join(REPO_ROOT, MILESTONES_REL)).filter(f => f.endsWith('-ROADMAP.md')).sort().reverse().map(f => `${MILESTONES_REL}/${f}`)
        : [];
    return [ROADMAP_REL, ...archived]
        .map(rel => (existsSync(join(REPO_ROOT, rel)) ? readFileSync(join(REPO_ROOT, rel), 'utf8') : ''))
        .find(text => deriveRoadmapMenu(text)) ?? read(ROADMAP_REL);
}
const readSources = () => Object.fromEntries(SOURCES.map(rel => [rel, rel === ROADMAP_REL ? readRoadmapWithCriterion() : read(rel)]));

async function main() {
    const { oks, failures } = await runAt(join(REPO_ROOT, TABLE_REL), readSources());
    for (const name of oks) {
        console.log(`  ok  ${name}`);
    }
    if (failures.length) {
        for (const f of failures) {
            console.error(`${NAME}: FAIL -- ${f}`);
        }
        return 1;
    }
    console.log(`${NAME}: PASS -- ${oks.length} cases over ${TABLE_REL}, derived against ${SOURCES.slice(1).join(', ')}`);
    return 0;
}

const PLANTS = [
    {
        name: 'organising row removed',
        rel: TABLE_REL,
        from: "    organising: 'tabs',",
        to: '',
        expect: 'default table keys equal',
    },
    { name: 'browsing set to history', rel: TABLE_REL, from: "browsing: 'address',", to: "browsing: 'history',", expect: 'decided defaults hold' },
    {
        name: 'command-centre suggestions flag set true',
        rel: TABLE_REL,
        from: "'command-centre': { resolve: false, suggestions: false,",
        to: "'command-centre': { resolve: false, suggestions: true,",
        expect: 'MODE_SENDS keys',
    },
    {
        name: 'fallback removed from defaultModeFor',
        rel: TABLE_REL,
        from: "available(value)) ? value : 'address';",
        to: "available(value)) ? value : value as LocalModeId;",
        expect: 'defaultModeFor:',
    },
    {
        name: 'tabs and bookmarks swapped in LOCAL_MODES',
        rel: TABLE_REL,
        from: "    { id: 'bookmarks', iconClass: 'codicon-star-full', restrictToken: '*', group: 'local', searchRow: true, cap: 10 },\n    { id: 'tabs', iconClass: 'codicon-browser', restrictToken: '%', group: 'local', searchRow: true },",
        to: "    { id: 'tabs', iconClass: 'codicon-browser', restrictToken: '%', group: 'local', searchRow: true },\n    { id: 'bookmarks', iconClass: 'codicon-star-full', restrictToken: '*', group: 'local', searchRow: true, cap: 10 },",
        expect: 'LOCAL_MODES order',
    },
    { name: 'one modeLabels key removed', rel: COPY_REL, from: "        history: 'History',\n", to: '', expect: 'LOCAL_MODES ids equal the modeLabels keys' },
    { name: 'a duplicated token', rel: TABLE_REL, from: "restrictToken: '^'", to: "restrictToken: '%'", expect: 'restrict tokens are unique' },
    { name: 'the history cap dropped', rel: TABLE_REL, from: "restrictToken: '^', group: 'local', searchRow: true, cap: 10", to: "restrictToken: '^', group: 'local', searchRow: true", expect: 'LOCAL_MODES search rows and caps' },
    {
        name: 'the runQuery guard removed',
        rel: ADDRESS_BAR_REL,
        from: 'if (!this.dropdownArmed || !this.modeSends().resolve) {',
        to: 'if (!this.dropdownArmed) {',
        expect: 'runQuery begins with a return guarded',
    },
    {
        name: 'CR-01: the canonize branch above the local-mode guard',
        rel: ADDRESS_BAR_REL,
        from: 'const local = this.localMode();\n            if (local && this.queryText()) {',
        to: 'if ((e.ctrlKey || e.metaKey) && isCanonizable(this.inputValue.trim())) {\n                void this.commitText(this.inputValue, { canonize: true });\n                return;\n            }\n            const local = this.localMode();\n            if (local && this.queryText()) {',
        expect: 'Enter, Alt+Enter and Ctrl+Enter: a local mode',
    },
    {
        name: 'CR-01: the guard narrowed to Command centre',
        rel: ADDRESS_BAR_REL,
        from: 'const local = this.localMode();\n            if (local && this.queryText()) {',
        to: 'const local = this.commandCentre();\n            if (local && this.queryText()) {',
        expect: 'Enter, Alt+Enter and Ctrl+Enter: a local mode',
    },
    { name: 'CR-01: canonize without the local-mode test', rel: ADDRESS_BAR_REL, from: '&& !local && isCanonizable(', to: '&& isCanonizable(', expect: 'Ctrl+Enter canonizes only outside' },
    {
        name: 'WR-02: enterLocalRow falls back to the typed text',
        rel: ADDRESS_BAR_REL,
        from: '        const row = this.highlightedRow();\n',
        to: '        const row = this.highlightedRow();\n        if (!row) {\n            return this.commitTyped();\n        }\n',
        expect: 'enterLocalRow acts only',
    },
    {
        name: 'a resolve call added to command-centre.ts',
        rel: CENTRE_REL,
        from: '    descriptorFor(text: string)',
        to: '    planted(store: { resolveTypedAddress(text: string): unknown }): unknown {\n        return store.resolveTypedAddress(\'typed\');\n    }\n\n    descriptorFor(text: string)',
        expect: 'command-centre.ts sends nothing typed',
    },
    { name: 'the contribution id changed to address', rel: CENTRE_REL, from: "readonly id = 'command-centre';", to: "readonly id = 'address';", expect: 'the Command centre contribution id' },
    {
        name: 'tokenise accepts a token without a space',
        rel: TABLE_REL,
        from: "    const space = text.indexOf(' ');\n",
        to: "    const space = text.indexOf(' ') < 0 ? 1 : text.indexOf(' ');\n",
        expect: 'tokenise: a token without a following space stays text',
    },
    {
        name: 'removed-command: the Print row runs a command that is no longer registered',
        rel: CMD_REL,
        from: '        commands.registerCommand(CHROME_BAR_PRINT, {',
        to: '        commands.registerCommand({ id: \'planted-unregistered\' }, {',
        expect: 'MENU-03 (D-13): every hamburger row',
    },
    {
        name: 'reordered-menu: Find in Page listed after Zoom',
        rel: MENU_TABLE_REL,
        from: "    { menuId: 'find-in-page', minPhase: 33, group: 6 },\n    { menuId: 'zoom', minPhase: 33, group: 6 },\n",
        to: "    { menuId: 'zoom', minPhase: 33, group: 6 },\n    { menuId: 'find-in-page', minPhase: 33, group: 6 },\n",
        expect: 'MENU-03 (W4): the ROADMAP Phase 33 app-menu entries',
    },
    {
        name: 'resolve:true: Command centre may resolve typed text',
        rel: TABLE_REL,
        from: "'command-centre': { resolve: false,",
        to: "'command-centre': { resolve: true,",
        expect: 'MODE_SENDS keys',
    },
    {
        name: 'ROADMAP-entry-missing: the Zoom row is gone from the menu',
        rel: MENU_TABLE_REL,
        from: "    { menuId: 'zoom', minPhase: 33, group: 6 },\n",
        to: '',
        expect: 'MENU-03 (W4): the ROADMAP Phase 33 app-menu entries',
    },
    {
        name: 'twin-implementation: the Zoom In row calls the tab instead of its command id',
        rel: WIDGET_REL,
        from: "this.commandLeaf('zoom-in', CHROME_BAR_COPY.zoomInRow, CHROME_BAR_ZOOM_IN_COMMAND_ID, pageKeyLabel('zoomIn')),",
        to: "this.menuLeaf('zoom-in', CHROME_BAR_COPY.zoomInRow, () => currentWebTab()?.zoomIn()),",
        expect: 'MENU-03 (D-13): every hamburger row',
    },
    {
        name: 'actions-store: an Actions row reaches the store',
        rel: MODES_REL,
        from: '                    await this.commands.executeCommand(command.id);',
        to: '                    await this.commands.executeCommand(command.id);\n                    await this.store.searchPlaces(text, 1);',
        expect: 'SMODE-07 (D-13): Actions rows',
    },
    {
        name: 'nextMode does not wrap',
        rel: TABLE_REL,
        from: 'return order[(from + step + order.length) % order.length];',
        to: 'return order[Math.min(Math.max(from + step, 0), order.length - 1)];',
        expect: 'nextMode wraps both ways',
    },
];

async function selfTest() {
    let failed = 0;
    const sources = readSources();
    const clean = await runAt(join(REPO_ROOT, TABLE_REL), sources);
    if (clean.failures.length) {
        console.error(`${NAME} --self-test: FAIL -- the clean tree is not green: ${clean.failures.join(' | ')}`);
        return 1;
    }
    console.log(`  ok  clean tree -> green (${clean.oks.length} cases)`);
    const dir = mkdtempSync(join(tmpdir(), 'pb-modes-'));
    try {
        for (const [i, plant] of PLANTS.entries()) {
            const mutated = sources[plant.rel].split(plant.from).join(plant.to);
            if (mutated === sources[plant.rel]) {
                failed++;
                console.error(`${NAME} --self-test: FAIL -- '${plant.name}': plant did not apply (its anchor drifted)`);
                continue;
            }
            const planted = { ...sources, [plant.rel]: mutated };
            const tablePath = join(dir, `mode-table-${i}.ts`);
            writeFileSync(tablePath, planted[TABLE_REL]);
            const { failures } = await runAt(tablePath, planted);
            const named = failures.find(f => f.startsWith(plant.expect));
            if (named) {
                console.log(`  ok  ${plant.name} -> red: ${named}`);
            } else {
                failed++;
                console.error(`${NAME} --self-test: FAIL -- '${plant.name}' stayed green or went red for another reason; got: ${failures.join(' | ') || '(no failures at all)'}`);
            }
        }
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
    if (failed) {
        console.error(`${NAME} --self-test: FAIL -- ${failed} plant(s) did not behave as required`);
        return 1;
    }
    console.log(`${NAME} --self-test: PASS -- the clean tree is green and all ${PLANTS.length} planted faults went red: ${PLANTS.map(p => p.name).join(', ')}`);
    return 0;
}

process.exit(process.argv.includes('--self-test') ? await selfTest() : await main());
