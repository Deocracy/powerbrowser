#!/usr/bin/env node
/**
 * Phase 27 (NAV-01, KEY-04): the live check for the navigation buttons and
 * the page-focus keys, driven in the built shell over WebDriver BiDi.
 *
 * One session runs the selected scenarios in order and prints one line per
 * scenario: `<scenario>: PASS` or `<scenario>: FAIL -- <reason>`. A thrown
 * error is `harness: <message>` (the check could not drive the product).
 * Keys are synthesised at the parent (scripts/lib/pb-live-probe.mjs), so the
 * chrome <key> rows and the content reply path both see them.
 *
 * Scenarios:
 *   esc-stop         Esc with a loading page focused stops it: a shortcut push
 *                    for the stop row, then a state push with loading false.
 *   theia-keeps-esc  With the Theia frame focused the stop row is disabled and
 *                    Esc produces no shortcut push. Scored only after esc-stop
 *                    passed in the same session (its positive control).
 *
 * Usage:
 *   node scripts/verify-nav-keys-live.mjs [--scenario a,b]
 *
 * Needs the built browser and the last Theia app build; not a --quick check.
 */

import {
    chromeActiveTabId,
    focusOverlay,
    focusTheiaFrame,
    keyRoute,
    openWebTab,
    pageKeyDisabled,
    pressKey,
    pushes,
    serveNavPages,
    waitForPush,
    withProbeShell,
} from './lib/pb-live-probe.mjs';

const NAME = 'verify-nav-keys-live';
const BROKEN = 'broken instrument:';
const ESCAPE = { key: 'Escape', code: 'Escape', keyCode: 27 };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const PAGES = {
    '/slow-esc': { title: 'Slow Esc', body: '<p>still loading</p>', slow: true },
};

const isState = (tabId, loading) => p => p && p.kind === 'state' && p.tabId === tabId && p.loading === loading;

async function escStop({ app, pages, fail, note }) {
    const tabId = await openWebTab(app, pages.url('/slow-esc'));
    if (await waitForPush(app, isState(tabId, true)) < 0) {
        return fail('no state push with loading: true arrived for the slow page, so there was no load to stop');
    }
    if (await focusOverlay(app, tabId) !== true || await chromeActiveTabId(app) !== tabId) {
        return fail(`${BROKEN} the page's overlay could not be made chrome's active element`);
    }
    const disabled = await pageKeyDisabled(app, 'stop');
    if (disabled === null) {
        return fail(`${BROKEN} the stop row element is missing from the shell document`);
    }
    if (disabled !== false) {
        return fail('the stop row stayed disabled while the page had focus (the focus tracker did not enable it)');
    }
    const mark = (await pushes(app)).length;
    await pressKey(app, ESCAPE);
    note(`keys: ${keyRoute.last}`);
    const shortcut = await waitForPush(app, p => p && p.kind === 'shortcut' && p.id === 'stop' && p.tabId === tabId, { from: mark });
    if (shortcut < 0) {
        return fail('Esc with the page focused produced no shortcut push for the stop row');
    }
    if (await waitForPush(app, isState(tabId, false), { from: shortcut + 1 }) < 0) {
        return fail('after the shortcut push no state push with loading: false arrived for the tab (the load was not stopped)');
    }
}

async function theiaKeepsEsc({ app, fail, results }) {
    const control = results.find(r => r.name === 'esc-stop');
    if (!control || control.failures.length) {
        return 'not-scored';
    }
    if (await focusTheiaFrame(app) !== true) {
        return fail(`${BROKEN} the Theia frame could not be made chrome's active element`);
    }
    const disabled = await pageKeyDisabled(app, 'stop');
    if (disabled === null) {
        return fail(`${BROKEN} the stop row element is missing from the shell document`);
    }
    if (disabled !== true) {
        return fail('the stop row carried no disabled attribute while the Theia frame had focus');
    }
    const mark = (await pushes(app)).length;
    await pressKey(app, ESCAPE);
    await sleep(1500);
    const late = (await pushes(app)).slice(mark).filter(p => p && p.kind === 'shortcut');
    if (late.length) {
        return fail(`a shortcut push arrived while the Theia frame had focus: ${JSON.stringify(late[0])}`);
    }
}

const SCENARIOS = {
    'esc-stop': escStop,
    'theia-keeps-esc': theiaKeepsEsc,
};

/** One session over `names`; returns `[{ name, failures, notes, notScored }]` or throws. */
async function runSession(names, plant = '') {
    const pages = await serveNavPages(PAGES);
    try {
        return await withProbeShell(async app => {
            const results = [];
            for (const name of names) {
                const result = { name, failures: [], notes: [], notScored: false };
                const ctx = {
                    app, pages, plant, results,
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
            console.log(`${r.name}: NOT SCORED -- its positive control (esc-stop) did not pass in this session`);
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
    return names;
}

async function main(args) {
    try {
        return report(await runSession(selectedScenarios(args)));
    } catch (error) {
        console.error(`harness: ${error.message}`);
        return 1;
    }
}

const args = process.argv.slice(2);
if (args.includes('--help')) {
    console.log(`Usage: node scripts/${NAME}.mjs [--scenario ${Object.keys(SCENARIOS).join(',')}]`);
    process.exit(0);
}
process.exit(await main(args));
