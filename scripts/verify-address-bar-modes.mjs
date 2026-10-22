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
 *      and the cap is 10 on bookmarks and history (30-UI-SPEC, pinned).
 *
 * Each case prints `ok <case>`; the run ends `verify-address-bar-modes: PASS`
 * or one `verify-address-bar-modes: FAIL -- <case>: <got>` line per red case.
 * A derivation that finds nothing (no MODES literal, no modeLabels) or a table
 * missing an export is a FAIL, never a pass.
 *
 * --self-test: the clean tree must be green; then eight planted copies in a
 * mkdtemp directory (the organising row removed, browsing set to history,
 * command-centre's suggestions flag set true, the fallback removed from
 * defaultModeFor, tabs and bookmarks swapped in LOCAL_MODES, one modeLabels
 * key removed, a duplicated token, the history cap dropped) must each go red naming the case that
 * catches it. A plant whose text did not change its source fails as "plant did
 * not apply".
 *
 * Honestly --quick: reads three source files, writes only under mkdtemp, no
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
const EXPORTS = ['LOCAL_MODES', 'DEFAULT_MODE_BY_UI_MODE', 'defaultModeFor', 'MODE_SENDS', 'engineModeId', 'engineNameOf'];

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

/** The cases: each returns null when it holds, else what it got. */
function cases(m, uiModes, labelKeys) {
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
        ['engineModeId and engineNameOf round-trip; a local id has no engine', () => {
            const got = [m.engineNameOf(m.engineModeId('Some Engine')), m.engineNameOf('tabs'), m.engineNameOf('address')];
            return JSON.stringify(got) === JSON.stringify(['Some Engine', null, null]) ? null : got;
        }],
    ];
}

/** Runs every case against the table at `tablePath` and the two sources' text; returns `{ oks, failures }`. */
async function runAt(tablePath, widgetSrc, copySrc) {
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
    for (const [name, run] of cases(m, deriveUiModes(widgetSrc), deriveLabelKeys(copySrc))) {
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

async function main() {
    const { oks, failures } = await runAt(join(REPO_ROOT, TABLE_REL), read(WIDGET_REL), read(COPY_REL));
    for (const name of oks) {
        console.log(`  ok  ${name}`);
    }
    if (failures.length) {
        for (const f of failures) {
            console.error(`${NAME}: FAIL -- ${f}`);
        }
        return 1;
    }
    console.log(`${NAME}: PASS -- ${oks.length} cases over ${TABLE_REL}, derived against ${WIDGET_REL} and ${COPY_REL}`);
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
];

async function selfTest() {
    let failed = 0;
    const sources = { [TABLE_REL]: read(TABLE_REL), [WIDGET_REL]: read(WIDGET_REL), [COPY_REL]: read(COPY_REL) };
    const clean = await runAt(join(REPO_ROOT, TABLE_REL), sources[WIDGET_REL], sources[COPY_REL]);
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
            const { failures } = await runAt(tablePath, planted[WIDGET_REL], planted[COPY_REL]);
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
