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
 *      for the registry) that set minus the kept tokens.
 *
 * Each case prints `ok <case>`; the run ends `verify-address-bar-modes: PASS`
 * or one `verify-address-bar-modes: FAIL -- <case>: <got>` line per red case.
 * A derivation that finds nothing (no MODES literal, no modeLabels) or a table
 * missing an export is a FAIL, never a pass.
 *
 * --self-test: the clean tree must be green; then twelve planted copies in a
 * mkdtemp directory (the organising row removed, browsing set to history,
 * command-centre's suggestions flag set true, the fallback removed from
 * defaultModeFor, tabs and bookmarks swapped in LOCAL_MODES, one modeLabels
 * key removed, a duplicated token, the history cap dropped, the runQuery
 * guard removed, a resolve call added to command-centre.ts, the contribution
 * id changed to address, tokenise accepting a token without a space) must
 * each go red naming the case that
 * catches it. A plant whose text did not change its source fails as "plant did
 * not apply".
 *
 * Honestly --quick: reads six source files, writes only under mkdtemp, no
 * build, no browser, no display, no network.
 *
 * Usage:
 *   node scripts/verify-address-bar-modes.mjs
 *   node scripts/verify-address-bar-modes.mjs --self-test
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
/** D-26: the names a mode reaches chrome or an engine through while typing. */
const TYPED_TEXT_SENDERS = ['ChromeStoreClient', 'resolveTypedAddress', 'searchSuggestions', 'autofillOrigin', 'searchPlaces', 'ChromeBarSuggestionService'];
const EXPORTS = ['LOCAL_MODES', 'DEFAULT_MODE_BY_UI_MODE', 'defaultModeFor', 'MODE_SENDS', 'engineModeId', 'engineNameOf', 'tokenise'];
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
        ['engineModeId and engineNameOf round-trip; a local id has no engine', () => {
            const got = [m.engineNameOf(m.engineModeId('Some Engine')), m.engineNameOf('tabs'), m.engineNameOf('address')];
            return JSON.stringify(got) === JSON.stringify(['Some Engine', null, null]) ? null : got;
        }],
    ];
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
const SOURCES = [TABLE_REL, WIDGET_REL, COPY_REL, ADDRESS_BAR_REL, MODES_REL, CENTRE_REL];
const readSources = () => Object.fromEntries(SOURCES.map(rel => [rel, read(rel)]));

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
