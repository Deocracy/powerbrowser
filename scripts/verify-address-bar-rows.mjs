#!/usr/bin/env node
/**
 * Phase 29 (BAR-11): the address bar's rows module under a Node test.
 *
 * `theia/extensions/chrome-bar/src/browser/address-bar-rows.ts` is pure on
 * purpose: no import statement and only syntax Node strips natively, so this
 * script imports the .ts file itself (Node 24 type stripping) and runs the
 * behaviour cases against the tree's own code, not a copy of it. Each case
 * prints `ok <case>`; the run ends `verify-address-bar-rows: PASS` or one
 * `verify-address-bar-rows: FAIL -- <case>: <got>` line per red case. A module
 * missing any of its exports is a broken instrument, never a pass.
 *
 * --self-test: the clean module must be green; then five copies of it in a
 * mkdtemp directory, each with one planted fault (ROW_LIMIT 11, the tab-wins
 * rule inverted, the highlight wrap removed, safeIcon accepting http,
 * autofillSplice comparing case-sensitively), must
 * each go red naming the case that catches it. A plant whose text did not
 * change the module fails as "plant did not apply".
 *
 * Honestly --quick: reads one source file, writes only under mkdtemp, no
 * build, no browser, no display, no network.
 *
 * Usage:
 *   node scripts/verify-address-bar-rows.mjs
 *   node scripts/verify-address-bar-rows.mjs --self-test
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'verify-address-bar-rows';
const MODULE_REL = 'theia/extensions/chrome-bar/src/browser/address-bar-rows.ts';
const EXPORTS = ['composeRows', 'nextHighlight', 'iconFor', 'safeIcon', 'autofillSplice', 'ENGINE_ROW_LIMIT', 'PLACE_ROW_LIMIT', 'ROW_LIMIT'];

const row = (source, url, extra = {}) => ({ key: `${source}:${url}`, source, title: url, caption: '', url, ...extra });
const keysOf = rows => rows.map(r => r.key);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** The behaviour cases: each returns null when it holds, else what it got. */
function cases(m) {
    const H = row('heuristic', 'https://typed.example/', { engineName: 'E' });
    return [
        ['limits are 4 engine rows, 5 place rows, 10 in all', () =>
            m.ENGINE_ROW_LIMIT === 4 && m.PLACE_ROW_LIMIT === 5 && m.ROW_LIMIT === 10
                ? null : { ENGINE_ROW_LIMIT: m.ENGINE_ROW_LIMIT, PLACE_ROW_LIMIT: m.PLACE_ROW_LIMIT, ROW_LIMIT: m.ROW_LIMIT }],
        ['heuristic alone is one row; no heuristic and no rows is none', () => {
            const one = m.composeRows(H, [], []);
            const none = m.composeRows(null, [], []);
            return one.length === 1 && one[0] === H && none.length === 0 ? null : { one: keysOf(one), none: keysOf(none) };
        }],
        ['heuristic first, then at most 4 engine rows, then at most 5 place rows, 10 at most', () => {
            const engines = [1, 2, 3, 4, 5, 6].map(i => row('search', '', { key: `search:${i}`, title: `s${i}` }));
            const places = [1, 2, 3, 4, 5, 6, 7].map(i => row('history', `https://p${i}.example/`));
            const got = m.composeRows(H, engines, places);
            const want = [H.key, 'search:1', 'search:2', 'search:3', 'search:4',
                ...[1, 2, 3, 4, 5].map(i => `history:https://p${i}.example/`)];
            return same(keysOf(got), want) && got.length <= 10 ? null : keysOf(got);
        }],
        ['two place rows with one url keep one', () => {
            const got = m.composeRows(H, [], [row('history', 'https://a.example/'), row('bookmark', 'https://a.example/')]);
            return got.length === 2 && got[1].source === 'history' ? null : keysOf(got);
        }],
        ['an open tab wins over a history row for its url, in either order', () => {
            const tabLast = m.composeRows(H, [], [row('history', 'https://t.example/'), row('tab', 'https://t.example/')]);
            const tabFirst = m.composeRows(H, [], [row('tab', 'https://t.example/'), row('history', 'https://t.example/')]);
            const ok = r => r.length === 2 && r[1].source === 'tab';
            return ok(tabLast) && ok(tabFirst) ? null : { tabLast: keysOf(tabLast), tabFirst: keysOf(tabFirst) };
        }],
        ['a place row with the heuristic row\'s url is dropped', () => {
            const got = m.composeRows(H, [], [row('history', H.url), row('bookmark', 'https://b.example/')]);
            return same(keysOf(got), [H.key, 'bookmark:https://b.example/']) ? null : keysOf(got);
        }],
        ['highlight steps by key and wraps both ways', () => {
            const keys = ['h', 'a', 'b'];
            const got = [m.nextHighlight(keys, 'h', 1), m.nextHighlight(keys, 'b', 1), m.nextHighlight(keys, 'h', -1)];
            return same(got, ['a', 'h', 'b']) ? null : got;
        }],
        ['an unknown current key steps from the first; no rows, no highlight', () => {
            const keys = ['h', 'a', 'b'];
            const got = [m.nextHighlight(keys, 'gone', 1), m.nextHighlight(keys, undefined, 1), m.nextHighlight([], 'h', 1)];
            return same(got, ['a', 'a', undefined]) ? null : got;
        }],
        ['history, bookmark and tab rows: favicon or globe, then their type marker', () => {
            const png = 'data:image/png;base64,AA';
            const got = [
                m.iconFor(row('history', 'https://h.example/')),
                m.iconFor(row('history', 'https://h.example/', { icon: png })),
                m.iconFor(row('history', 'https://h.example/', { icon: 'http://h.example/favicon.ico' })),
                m.iconFor(row('bookmark', 'https://b.example/')),
                m.iconFor(row('tab', 'https://t.example/')),
            ];
            const want = [
                { leading: { codicon: 'codicon-globe' }, trailing: 'codicon-history' },
                { leading: { image: png }, trailing: 'codicon-history' },
                { leading: { codicon: 'codicon-globe' }, trailing: 'codicon-history' },
                { leading: { codicon: 'codicon-globe' }, trailing: 'codicon-star-full' },
                { leading: { codicon: 'codicon-globe' }, trailing: 'codicon-browser' },
            ];
            return same(got, want) ? null : got;
        }],
        ['engine rows and the heuristic row: the search glyph, an engine icon, a favicon, no marker', () => {
            const png = 'data:image/png;base64,AA';
            const got = [
                m.iconFor(row('search', '', { icon: png })),
                m.iconFor(row('heuristic', 'https://s.example/', { engineName: 'E', icon: png })),
                m.iconFor(row('heuristic', 'https://s.example/', { engineName: 'E', icon: null })),
                m.iconFor(row('heuristic', 'https://v.example/', { icon: png })),
                m.iconFor(row('heuristic', 'https://v.example/')),
            ];
            const want = [
                { leading: { codicon: 'codicon-search' }, trailing: null },
                { leading: { image: png }, trailing: null },
                { leading: { codicon: 'codicon-search' }, trailing: null },
                { leading: { image: png }, trailing: null },
                { leading: { codicon: 'codicon-globe' }, trailing: null },
            ];
            return same(got, want) ? null : got;
        }],
        ['safeIcon keeps a bounded data:image/ URI and nothing else', () => {
            const png = 'data:image/png;base64,AA';
            const got = [
                m.safeIcon(png),
                m.safeIcon('http://x/y.ico'),
                m.safeIcon('https://x/y.ico'),
                m.safeIcon('data:text/html,x'),
                m.safeIcon(`data:image/png;base64,${'A'.repeat(65536)}`),
                m.safeIcon(undefined),
                m.safeIcon(42),
            ];
            return same(got, [png, null, null, null, null, null, null]) ? null : got;
        }],
        ['autofillSplice completes a typed prefix and selects the completed part', () => {
            const got = m.autofillSplice('loc', 'localhost:8080/');
            return same(got, { value: 'localhost:8080/', start: 3, end: 15 }) ? null : { got };
        }],
        ['autofillSplice matches case-insensitively and keeps the typed case', () => {
            const got = m.autofillSplice('LoC', 'localhost/');
            return same(got, { value: 'LoCalhost/', start: 3, end: 10 }) ? null : { got };
        }],
        ['autofillSplice returns null for no match, an equal length and empty text', () => {
            const got = [m.autofillSplice('git', 'example.org/'), m.autofillSplice('a.org/', 'a.org/'), m.autofillSplice('', 'a.org/')];
            return same(got, [null, null, null]) ? null : got;
        }],
    ];
}

/** Runs every case against the module at `path`; returns `{ oks, failures }`. */
async function runAt(path) {
    let m;
    try {
        m = await import(pathToFileURL(path).href);
    } catch (error) {
        return { oks: [], failures: [`import: the rows module could not be loaded (${error.message})`] };
    }
    const missing = EXPORTS.filter(name => m[name] === undefined);
    if (missing.length) {
        return { oks: [], failures: [`exports: the rows module exports no ${missing.join(', ')} -- broken instrument, nothing was tested`] };
    }
    const oks = [];
    const failures = [];
    for (const [name, run] of cases(m)) {
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

async function main() {
    const { oks, failures } = await runAt(join(REPO_ROOT, MODULE_REL));
    for (const name of oks) {
        console.log(`  ok  ${name}`);
    }
    if (failures.length) {
        for (const f of failures) {
            console.error(`${NAME}: FAIL -- ${f}`);
        }
        return 1;
    }
    console.log(`${NAME}: PASS -- ${oks.length} cases over ${MODULE_REL}`);
    return 0;
}

const PLANTS = [
    { name: 'ROW_LIMIT 11', from: 'export const ROW_LIMIT = 10;', to: 'export const ROW_LIMIT = 11;', expect: 'limits are' },
    {
        name: 'tab-wins rule inverted',
        from: "(row.source === 'tab' && held.source !== 'tab')",
        to: "(held.source === 'tab' && row.source !== 'tab')",
        expect: 'an open tab wins',
    },
    {
        name: 'highlight wrap removed',
        from: '(from + step + keys.length) % keys.length',
        to: 'Math.min(Math.max(from + step, 0), keys.length - 1)',
        expect: 'highlight steps by key',
    },
    {
        name: 'safeIcon accepting http',
        from: "src.startsWith('data:image/')",
        to: "(src.startsWith('data:image/') || src.startsWith('http'))",
        expect: 'safeIcon keeps',
    },
    {
        name: 'autofillSplice case-sensitive',
        from: '!completion.toLowerCase().startsWith(typed.toLowerCase())',
        to: '!completion.startsWith(typed)',
        expect: 'autofillSplice matches case-insensitively',
    },
];

async function selfTest() {
    let failed = 0;
    const clean = await runAt(join(REPO_ROOT, MODULE_REL));
    if (clean.failures.length) {
        console.error(`${NAME} --self-test: FAIL -- the clean module is not green: ${clean.failures.join(' | ')}`);
        return 1;
    }
    console.log(`  ok  clean module -> green (${clean.oks.length} cases)`);
    const source = readFileSync(join(REPO_ROOT, MODULE_REL), 'utf8');
    const dir = mkdtempSync(join(tmpdir(), 'pb-rows-'));
    try {
        for (const [i, plant] of PLANTS.entries()) {
            const mutated = source.split(plant.from).join(plant.to);
            if (mutated === source) {
                failed++;
                console.error(`${NAME} --self-test: FAIL -- '${plant.name}': plant did not apply (its anchor drifted)`);
                continue;
            }
            const path = join(dir, `rows-${i}.ts`);
            writeFileSync(path, mutated);
            const { failures } = await runAt(path);
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
    console.log(`${NAME} --self-test: PASS -- the clean module is green and all ${PLANTS.length} planted faults went red: ${PLANTS.map(p => p.name).join(', ')}`);
    return 0;
}

process.exit(process.argv.includes('--self-test') ? await selfTest() : await main());
