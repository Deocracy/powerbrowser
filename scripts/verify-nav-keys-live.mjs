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
 *   stop-button      While a page loads the bar shows ONE Stop button (close
 *                    glyph); clicking it stops the load and the same node turns
 *                    back into Reload (refresh glyph). With the empty page
 *                    current, Reload is disabled.
 *   history-channel  After /h1 -> /h2 -> /h3, history() replies the three
 *                    entries with index 2; gotoIndex(0) lands on /h1;
 *                    gotoIndex(99) is refused and moves nothing.
 *
 * Usage:
 *   node scripts/verify-nav-keys-live.mjs [--scenario a,b]
 *   node scripts/verify-nav-keys-live.mjs --self-test
 *
 * --self-test runs a clean control session over every scenario (must be
 * green), then one session per planted fault, scored only on the scenario
 * the plant targets: it must print a FAIL naming the expected text, and a
 * plant whose mutation did not apply fails the self-test.
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
import { pollFor, probe, sourceConst } from './lib/pb-relaunch.mjs';

const NEW_TAB_COMMAND_ID = sourceConst('theia/extensions/chrome-bar/src/browser/chrome-bar-commands.ts', 'CHROME_BAR_NEW_TAB_COMMAND_ID');

const NAME = 'verify-nav-keys-live';
const BROKEN = 'broken instrument:';
const ESCAPE = { key: 'Escape', code: 'Escape', keyCode: 27 };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const PAGES = {
    '/slow-esc': { title: 'Slow Esc', body: '<p>still loading</p>', slow: true },
    '/slow-button': { title: 'Slow Button', body: '<p>still loading</p>', slow: true },
    '/h1': { title: 'History One', body: '<p>one</p>' },
    '/h2': { title: 'History Two', body: '<p>two</p>' },
    '/h3': { title: 'History Three', body: '<p>three</p>' },
};

const isState = (tabId, loading) => p => p && p.kind === 'state' && p.tabId === tabId && p.loading === loading;
const loadedAt = (tabId, path) => p => isState(tabId, false)(p) && String(p.url).endsWith(path);

/** Calls `method(...args)` on the registered widget of `tabId` in the Theia frame; returns its reply. */
const widgetCall = (app, tabId, method, ...args) =>
    probe(app, `return await get('WebTabChannel').widgetOf(${JSON.stringify(tabId)}).${method}(${args.map(a => JSON.stringify(a)).join(', ')});`);

async function escStop({ app, pages, plant, fail, note }) {
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
    if (plant === 'relay-row-removed') {
        const removed = await probe(app, `return get('ChromeBarShortcutRelay').actions.delete('stop');`);
        if (removed === true) {
            note('PLANT relay-row-removed applied');
        }
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

async function theiaKeepsEsc({ app, plant, fail, note, results }) {
    const control = results.find(r => r.name === 'esc-stop');
    if (!control || control.failures.length) {
        return 'not-scored';
    }
    if (await focusTheiaFrame(app) !== true) {
        return fail(`${BROKEN} the Theia frame could not be made chrome's active element`);
    }
    if (plant === 'row-enabled-under-theia') {
        const enabled = await app.evaluateIn(app.chrome, `(() => {
            const k = document.getElementById('powerbrowser-page-key-stop');
            if (!k || !k.hasAttribute('disabled')) return false;
            k.removeAttribute('disabled');
            return true;
        })()`);
        if (enabled === true) {
            note('PLANT row-enabled-under-theia applied');
        }
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

// The bar's Stop-or-Reload buttons, read in the Theia frame.
const NAV_BUTTONS = `[...document.querySelectorAll('.pb-chrome-bar button')].filter(b => ['Stop', 'Reload'].includes(b.getAttribute('aria-label')))`;
const readNavButton = app => app.evaluate(`JSON.stringify((() => {
    const found = ${NAV_BUTTONS};
    return found.map(b => ({
        label: b.getAttribute('aria-label'),
        close: !!b.querySelector('.codicon-close'),
        refresh: !!b.querySelector('.codicon-refresh'),
        disabled: b.disabled,
        marked: b.__pbStopMark === true,
    }));
})())`).then(JSON.parse);

async function stopButton({ app, pages, plant, fail, note }) {
    const tabId = await openWebTab(app, pages.url('/slow-button'));
    if (await waitForPush(app, isState(tabId, true)) < 0) {
        return fail('no state push with loading: true arrived for the slow page, so there was no load to stop');
    }
    if (plant === 'second-stop-element') {
        const planted = await app.evaluate(`(() => {
            const bar = document.querySelector('.pb-chrome-bar');
            if (!bar) return false;
            const extra = document.createElement('button');
            extra.className = 'pb-chrome-bar-button';
            extra.setAttribute('aria-label', 'Stop');
            bar.appendChild(extra);
            return true;
        })()`);
        if (planted === true) {
            note('PLANT second-stop-element applied');
        }
    }
    let seen = [];
    try {
        await pollFor(async () => {
            seen = await readNavButton(app);
            return seen.some(b => b.label === 'Stop');
        }, 5000, 'the bar to show Stop');
    } catch {
        // judged below on what was last seen
    }
    if (seen.length !== 1 || seen[0].label !== 'Stop' || !seen[0].close) {
        return fail(`while loading the bar must show exactly one Stop-or-Reload button, labelled Stop with the close glyph; saw ${JSON.stringify(seen)}`);
    }
    const mark = (await pushes(app)).length;
    await app.evaluate(`(() => { const b = ${NAV_BUTTONS}[0]; b.__pbStopMark = true; b.click(); return true; })()`);
    if (await waitForPush(app, isState(tabId, false), { from: mark }) < 0) {
        return fail('clicking Stop produced no state push with loading: false for the tab (the load was not stopped)');
    }
    try {
        await pollFor(async () => {
            seen = await readNavButton(app);
            return seen.length === 1 && seen[0].label === 'Reload';
        }, 5000, 'the bar to show Reload');
    } catch {
        // judged below
    }
    if (seen.length !== 1 || seen[0].label !== 'Reload' || !seen[0].refresh) {
        return fail(`after the stop the bar must show exactly one button, labelled Reload with the refresh glyph; saw ${JSON.stringify(seen)}`);
    }
    if (!seen[0].marked) {
        return fail('the Reload button after the stop is a different node from the Stop button that was clicked (it was re-mounted, so keyboard focus on it would be lost)');
    }
    const opened = await probe(app, `await get('CommandRegistry').executeCommand(${JSON.stringify(NEW_TAB_COMMAND_ID)}); return true;`);
    if (opened !== true) {
        return fail(`${BROKEN} the New Tab command did not run: ${JSON.stringify(opened)}`);
    }
    try {
        await pollFor(async () => {
            seen = await readNavButton(app);
            return seen.length === 1 && seen[0].label === 'Reload' && seen[0].disabled;
        }, 5000, 'Reload to be disabled on the empty page');
    } catch {
        // judged below
    }
    if (seen.length !== 1 || seen[0].label !== 'Reload' || !seen[0].disabled) {
        return fail(`with the empty page current the single Reload button must be disabled; saw ${JSON.stringify(seen)}`);
    }
}

async function historyChannel({ app, pages, fail }) {
    const tabId = await openWebTab(app, pages.url('/h1'));
    if (await waitForPush(app, loadedAt(tabId, '/h1')) < 0) {
        return fail('no loaded state push for /h1 arrived');
    }
    for (const path of ['/h2', '/h3']) {
        const mark = (await pushes(app)).length;
        await widgetCall(app, tabId, 'navigate', pages.url(path));
        if (await waitForPush(app, loadedAt(tabId, path), { from: mark }) < 0) {
            return fail(`navigating to ${path} produced no loaded state push`);
        }
    }
    const history = await widgetCall(app, tabId, 'history');
    const entries = Array.isArray(history?.entries) ? history.entries : [];
    const want = [['/h1', 'History One'], ['/h2', 'History Two'], ['/h3', 'History Three']];
    const matches = entries.length === 3 && want.every(([path, title], i) =>
        entries[i].index === i && String(entries[i].url).endsWith(path) && entries[i].title === title);
    if (history?.where !== 'done' || history.index !== 2 || !matches) {
        return fail(`history() must reply where "done", index 2 and the three served entries in order; got ${JSON.stringify(history)}`);
    }
    let mark = (await pushes(app)).length;
    const jump = await widgetCall(app, tabId, 'gotoIndex', 0);
    if (jump?.ok !== true || await waitForPush(app, p => p && p.kind === 'state' && p.tabId === tabId && String(p.url).endsWith('/h1'), { from: mark }) < 0) {
        return fail(`gotoIndex(0) produced no state push for /h1 (reply ${JSON.stringify(jump)})`);
    }
    // The gotoIndex(0) push above is the positive control for the absence below.
    await sleep(500);
    mark = (await pushes(app)).length;
    const refused = await widgetCall(app, tabId, 'gotoIndex', 99);
    if (refused?.ok !== false || refused.reason !== 'validation') {
        return fail(`gotoIndex(99) must be refused with reason "validation"; got ${JSON.stringify(refused)}`);
    }
    await sleep(1500);
    const moved = (await pushes(app)).slice(mark).filter(p => p && p.kind === 'state' && p.tabId === tabId && !String(p.url).endsWith('/h1'));
    if (moved.length) {
        return fail(`gotoIndex(99) was refused but the tab navigated anyway: ${JSON.stringify(moved[0].url)}`);
    }
}

const SCENARIOS = {
    'esc-stop': escStop,
    'theia-keeps-esc': theiaKeepsEsc,
    'stop-button': stopButton,
    'history-channel': historyChannel,
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

const PLANTS = [
    { plant: 'second-stop-element', target: 'stop-button', run: ['stop-button'], expect: 'exactly one' },
    { plant: 'row-enabled-under-theia', target: 'theia-keeps-esc', run: ['esc-stop', 'theia-keeps-esc'], expect: 'while the Theia frame had focus' },
    { plant: 'relay-row-removed', target: 'esc-stop', run: ['esc-stop'], expect: 'loading: false' },
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
        console.error(`harness: ${error.message}`);
        return 1;
    }
}

const args = process.argv.slice(2);
if (args.includes('--help')) {
    console.log(`Usage: node scripts/${NAME}.mjs [--scenario ${Object.keys(SCENARIOS).join(',')}] | --self-test`);
    process.exit(0);
}
process.exit(args.includes('--self-test') ? await selfTest() : await main(args));
