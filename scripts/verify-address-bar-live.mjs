#!/usr/bin/env node
/**
 * Phase 29 (BAR-01..): the live check for the address bar's search and URI
 * fixup, driven in the built shell over WebDriver BiDi.
 *
 * One session runs the selected scenarios in order and prints one line per
 * scenario: `<scenario>: PASS` or `<scenario>: FAIL -- <reason>`. A thrown
 * error is `harness: <message>` (the check could not drive the product).
 * The engine is hermetic: once per session, chrome adds a user engine whose
 * search path is a page this script serves, and makes it the default, so the
 * served page's request log is the independent observer of every search.
 *
 * Scenarios:
 *   search      Typing "hello world" in the pill and pressing Enter (at the
 *               parent) loads the default engine's results page: the served
 *               engine records one GET on its search path whose q parameter
 *               is the typed words, and a state push for that tab carries
 *               that path. Chrome's resolveTypedAddress replies kind search
 *               naming the engine, and resolves example.com to a visit of
 *               https://example.com/ (reply only, nothing loads).
 *
 * Needs the built browser and the last Theia app build; not a --quick check.
 */

import {
    BROKEN,
    focusTheiaFrame,
    inChrome,
    loadedAt,
    makeCurrent,
    openWebTab,
    pressKey,
    pushes,
    readPill,
    serveNavPages,
    waitForPush,
    withProbeShell,
} from './lib/pb-live-probe.mjs';
import { pollFor, probe } from './lib/pb-relaunch.mjs';

const NAME = 'verify-address-bar-live';
const ENTER = { key: 'Enter', code: 'Enter', keyCode: 13 };
const ENGINE_ONE = 'Probe Engine One';

const PAGES = {
    '/start': { title: 'Address Start', body: '<p>start</p>' },
    '/one/search': { title: 'Probe One Results', body: '<p>results</p>' },
};

const SESSION_ENGINE = 'harness: the hermetic search engine could not be installed';

/** Adds the served engine chrome-side and makes it the default; throws `harness:` on any failure. */
async function installEngine(app, pages) {
    const reply = await inChrome(app, `return (async () => {
        try {
            const { SearchService } = ChromeUtils.importESModule('moz-src:///toolkit/components/search/SearchService.sys.mjs');
            await SearchService.init();
            const engine = SearchService.getEngineByName(${JSON.stringify(ENGINE_ONE)})
                ?? await SearchService.addUserEngine({
                    name: ${JSON.stringify(ENGINE_ONE)},
                    url: ${JSON.stringify(`${pages.origin}/one/search?q={searchTerms}`)},
                    suggestUrl: ${JSON.stringify(`${pages.origin}/one/suggest?q={searchTerms}`)},
                });
            await SearchService.setDefault(engine, SearchService.CHANGE_REASON.USER);
            return (await SearchService.getDefault()).name;
        } catch (e) {
            return 'error: ' + e;
        }
    })();`);
    if (reply !== ENGINE_ONE) {
        throw new Error(`${SESSION_ENGINE} (${String(reply)})`);
    }
}

/** The page realm's ChromeStoreClient.resolveTypedAddress reply, or `{ error }`. */
const resolveIn = (app, text, engineName = '') => probe(app,
    `return await get('ChromeStoreClient').resolveTypedAddress(${JSON.stringify(text)}, ${JSON.stringify(engineName)});`);

/** Replaces the frontend's ChromeStoreClient.resolveTypedAddress with one resolving `reply`; `null` restores it. */
const stubResolve = (app, reply) => probe(app, reply === null
    ? `delete get('ChromeStoreClient').resolveTypedAddress; return true;`
    : `get('ChromeStoreClient').resolveTypedAddress = async () => (${JSON.stringify(reply)}); return true;`);

/**
 * Focuses the pill and types `text` the React-compatible way (native value
 * setter, then an input event). React restores the controlled value until the
 * widget re-renders, so the typed value is read back by polling.
 */
async function typeInPill(app, text) {
    if (await focusTheiaFrame(app) !== true) {
        throw new Error(`${BROKEN} the Theia frame could not be made chrome's active element`);
    }
    const typed = await app.evaluate(`(() => {
        const input = document.querySelector('.pb-chrome-bar-input');
        if (!input) return false;
        input.focus();
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(text)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
    })()`);
    const pill = typed === true ? await settle(() => readPill(app), v => v.focused && v.value === text) : null;
    if (!pill || !pill.focused || pill.value !== text) {
        throw new Error(`${BROKEN} the pill could not be focused and typed into (${JSON.stringify(pill)})`);
    }
}

/** Re-reads `read()` until `ok` holds or `timeoutMs` passes; returns the last value. */
async function settle(read, ok, timeoutMs = 5000) {
    const end = Date.now() + timeoutMs;
    let value = await read();
    while (!ok(value) && Date.now() < end) {
        await new Promise(resolve => setTimeout(resolve, 100));
        value = await read();
    }
    return value;
}

/** The first GET on `path` at index >= `from` matching `pred`, or null after `timeoutMs`. */
async function nextGet(pages, path, from, pred = () => true, timeoutMs = 15000) {
    try {
        return await pollFor(() => pages.requests.slice(from).find(r => r.path === path && pred(r)) ?? null, timeoutMs, `a GET on ${path}`);
    } catch {
        return null;
    }
}

const queryOf = r => new URLSearchParams(r.search ?? '').get('q');
const pathOf = url => { try { return new URL(url).pathname; } catch { return ''; } };

/** The session's web tab on /start, opened once and made current. */
async function sessionTab(ctx) {
    if (!ctx.shared.tabId) {
        const tabId = await openWebTab(ctx.app, ctx.pages.url('/start'));
        if (await waitForPush(ctx.app, loadedAt(tabId, '/start')) < 0) {
            throw new Error(`${BROKEN} no loaded state push arrived for /start`);
        }
        ctx.shared.tabId = tabId;
    }
    if (await makeCurrent(ctx.app, ctx.shared.tabId) !== true) {
        throw new Error(`${BROKEN} the session's web tab could not be made current`);
    }
    return ctx.shared.tabId;
}

async function search(ctx) {
    const { app, pages, plant, fail, note } = ctx;
    const tabId = await sessionTab(ctx);
    if (plant === 'resolve-bypassed') {
        await stubResolve(app, { kind: 'refused' });
        note('PLANT resolve-bypassed applied');
    }
    const mark = (await pushes(app)).length;
    const getMark = pages.requests.length;
    await typeInPill(app, 'hello world');
    await pressKey(app, ENTER);
    const got = await nextGet(pages, '/one/search', getMark, r => queryOf(r) === 'hello world');
    if (!got) {
        fail(`no GET on /one/search with q "hello world" after Enter; requests since the mark: ${JSON.stringify(pages.requests.slice(getMark).map(r => r.path + r.search))}; pill ${JSON.stringify(await readPill(app))}`);
    }
    if (await waitForPush(app, p => p && p.kind === 'state' && p.tabId === tabId && pathOf(p.url) === '/one/search', { from: mark, timeoutMs: got ? 15000 : 1000 }) < 0) {
        fail('no state push for the tab carried the engine results URL (/one/search)');
    }
    const words = await resolveIn(app, 'hello world');
    if (words?.kind !== 'search' || words.engineName !== ENGINE_ONE || !String(words.url).startsWith(`${pages.origin}/one/search`)) {
        fail(`resolveTypedAddress('hello world') must reply kind search from ${JSON.stringify(ENGINE_ONE)} on the served origin; got ${JSON.stringify(words)}`);
    }
    const host = await resolveIn(app, 'example.com');
    if (host?.kind !== 'visit' || host.url !== 'https://example.com/') {
        fail(`resolveTypedAddress('example.com') must reply a visit of https://example.com/; got ${JSON.stringify(host)}`);
    }
}

const SCENARIOS = {
    search,
};

/** The scenario each not-scored-capable scenario takes as its positive control. */
const CONTROL_OF = {};

/** One session over `names`; returns `[{ name, failures, notes, notScored }]` or throws. */
async function runSession(names, plant = '') {
    const pages = await serveNavPages(PAGES);
    try {
        return await withProbeShell(async app => {
            await installEngine(app, pages);
            const results = [];
            const shared = {};
            for (const name of names) {
                const result = { name, failures: [], notes: [], notScored: false };
                const ctx = {
                    app, pages, plant, results, shared,
                    fail: reason => { result.failures.push(reason); },
                    note: text => { result.notes.push(text); },
                };
                try {
                    if (await SCENARIOS[name](ctx) === 'not-scored') {
                        result.notScored = true;
                    }
                } catch (error) {
                    result.failures.push(`harness: ${error.message}`);
                }
                results.push(result);
            }
            return results;
        });
    } finally {
        await pages.close();
    }
}

function report(results) {
    let failed = 0;
    for (const r of results) {
        for (const n of r.notes) {
            console.log(`  ${r.name}: ${n}`);
        }
        if (r.notScored) {
            console.log(`${r.name}: NOT SCORED -- its positive control (${CONTROL_OF[r.name]}) did not pass in this session`);
        } else if (r.failures.length) {
            failed++;
            for (const f of r.failures) {
                console.error(`${r.name}: FAIL -- ${f}`);
            }
        } else {
            console.log(`${r.name}: PASS`);
        }
    }
    return failed ? 1 : 0;
}

function selectedScenarios(args) {
    const i = args.indexOf('--scenario');
    if (i < 0) {
        return Object.keys(SCENARIOS);
    }
    const names = String(args[i + 1] ?? '').split(',').filter(Boolean);
    const unknown = names.filter(n => !SCENARIOS[n]);
    if (!names.length || unknown.length) {
        throw new Error(`unknown or empty --scenario list (${unknown.join(', ') || 'none given'}); known: ${Object.keys(SCENARIOS).join(', ')}`);
    }
    // Registry order, whatever order was asked for: a scenario runs after its control.
    return Object.keys(SCENARIOS).filter(n => names.includes(n));
}

const PLANTS = [
    { plant: 'resolve-bypassed', target: 'search', run: ['search'], expect: 'no GET on /one/search' },
];

async function selfTest() {
    let failed = 0;
    try {
        const clean = await runSession(Object.keys(SCENARIOS));
        const red = clean.filter(r => r.failures.length || r.notScored);
        if (red.length) {
            failed++;
            console.error(`${NAME} --self-test: FAIL -- the clean control is not green: ${red.map(r => `${r.name}: ${r.failures.join(' | ') || 'not scored'}`).join('; ')}`);
        } else {
            console.log('  ok  clean control (no plant) -> green');
        }
    } catch (error) {
        console.error(`${NAME} --self-test: FAIL -- harness: the clean control could not be driven: ${error.message}`);
        return 1;
    }
    for (const c of PLANTS) {
        let results;
        try {
            results = await runSession(c.run, c.plant);
        } catch (error) {
            failed++;
            console.error(`${NAME} --self-test: FAIL -- harness: '${c.plant}' could not be driven: ${error.message}`);
            continue;
        }
        const target = results.find(r => r.name === c.target);
        if (!target || !target.notes.some(n => n.startsWith('PLANT'))) {
            failed++;
            console.error(`${NAME} --self-test: FAIL -- '${c.plant}' never applied its fault (the plant site drifted), so a red or green here would mean nothing`);
            continue;
        }
        const scored = target.failures.filter(f => f.includes(c.expect) && !f.includes(BROKEN) && !f.startsWith('harness:'));
        if (scored.length) {
            console.log(`  ok  ${c.plant} -> red on ${c.target}, naming '${c.expect}'`);
            console.log(`      ${c.target}: FAIL -- ${scored[0]}`);
        } else {
            failed++;
            console.error(`${NAME} --self-test: FAIL -- '${c.plant}' stayed green on ${c.target} or went red for another reason; got: ${target.failures.join(' | ') || '(no failures at all)'}`);
        }
    }
    if (failed) {
        console.error(`${NAME} --self-test: FAIL -- ${failed} case(s) did not behave as required`);
        return 1;
    }
    console.log(`${NAME} --self-test: PASS -- the clean control is green and all ${PLANTS.length} planted faults went red: ${PLANTS.map(c => c.plant).join(', ')}`);
    return 0;
}

async function main(args) {
    try {
        return report(await runSession(selectedScenarios(args)));
    } catch (error) {
        console.error(error.message.startsWith('harness:') ? error.message : `harness: ${error.message}`);
        return 1;
    }
}

const args = process.argv.slice(2);
if (args.includes('--help')) {
    console.log(`Usage: node scripts/${NAME}.mjs [--scenario ${Object.keys(SCENARIOS).join(',')}] | --self-test`);
    process.exit(0);
}
process.exit(args.includes('--self-test') ? await selfTest() : await main(args));
