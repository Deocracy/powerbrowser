#!/usr/bin/env node
/**
 * Phase 27 (NAV-01..03, NAV-06, KEY-04): the live check for the navigation buttons and
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
 *   activation       Activating tab A, then B, makes chrome's activeTabIdOf
 *                    report each; Settings current makes it null; a third
 *                    tab's coalesced load push still drives the pill.
 *   hard-reload-channel  reload(true)'s GET carries no-cache; a plain reload's
 *                    GET does not (both observed by the page server).
 *   background-open  openInBackground(url, A) puts the new tab directly after A,
 *                    A stays current, and the new tab loads /bg.
 *   history          A contextmenu on Back opens one .lm-Menu listing the three
 *                    served titles newest first with /h3 checked, the overlay
 *                    hidden; choosing /h1 in the menu's own DOM lands there,
 *                    closes the menu, shows the overlay and focuses it.
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
    inChrome,
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
    '/act-a': { title: 'Activation A', body: '<p>a</p>' },
    '/act-b': { title: 'Activation B', body: '<p>b</p>' },
    '/act-c': { title: 'Activation C', body: '<p>c</p>' },
    '/cache': { title: 'Cache', body: '<p>cache</p>' },
    '/bg-a': { title: 'Background A', body: '<p>a</p>' },
    '/bg': { title: 'Background', body: '<p>bg</p>' },
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

// Chrome's record of the selected web tab for the shell's Theia frame.
// JSON on the wire: the BiDi result reader maps a null result to undefined.
const chromeSelectedTabId = async app =>
    JSON.parse(await inChrome(app, "return JSON.stringify(W.activeTabIdOf(document.getElementById('powerbrowser-content')));"));

async function waitSelected(app, want) {
    let seen;
    try {
        await pollFor(async () => (seen = await chromeSelectedTabId(app)) === want, 5000, 'chrome to record the selection');
    } catch {
        // judged by the caller on `seen`
    }
    return seen;
}

async function activation({ app, pages, fail }) {
    const a = await openWebTab(app, pages.url('/act-a'));
    const b = await openWebTab(app, pages.url('/act-b'));
    for (const tabId of [a, b]) {
        await probe(app, `await get('ApplicationShell').activateWidget(get('WebTabChannel').widgetOf(${JSON.stringify(tabId)}).id); return true;`);
        const seen = await waitSelected(app, tabId);
        if (seen !== tabId) {
            return fail(`after activating ${tabId} chrome's activeTabIdOf reported ${JSON.stringify(seen)}`);
        }
    }
    const opened = await probe(app, `await get('CommandRegistry').executeCommand('preferences:open'); return true;`);
    if (opened !== true) {
        return fail(`${BROKEN} the stock preferences command did not run: ${JSON.stringify(opened)}`);
    }
    const afterSettings = await waitSelected(app, null);
    if (afterSettings !== null) {
        return fail(`with Settings current chrome's activeTabIdOf must be null; got ${JSON.stringify(afterSettings)}`);
    }
    const url = pages.url('/act-c');
    const c = await openWebTab(app, url);
    if (await waitForPush(app, loadedAt(c, '/act-c')) < 0) {
        return fail('no loaded state push arrived for the third tab (the coalesced push did not flush)');
    }
    let pill = '';
    try {
        await pollFor(async () => (pill = await app.evaluate(`document.querySelector('.pb-chrome-bar-pill input')?.value ?? ''`)) === url, 5000, 'the pill to show the address');
    } catch {
        // judged below
    }
    if (pill !== url) {
        return fail(`after the third tab's load push the pill must show ${url}; it shows ${JSON.stringify(pill)}`);
    }
}

// The first GET of `path` recorded at index >= `from` by the page server, or null on timeout.
async function nextGet(pages, path, from) {
    try {
        return await pollFor(async () => pages.requests.slice(from).find(r => r.path === path) ?? null, 10000, `a GET of ${path}`);
    } catch {
        return null;
    }
}

const noCache = r => /no-cache/i.test(`${r.cacheControl ?? ''} ${r.pragma ?? ''}`);

async function hardReloadChannel({ app, pages, fail }) {
    const tabId = await openWebTab(app, pages.url('/cache'));
    if (await waitForPush(app, loadedAt(tabId, '/cache')) < 0) {
        return fail('no loaded state push arrived for /cache');
    }
    let mark = pages.requests.length;
    const pushMark = (await pushes(app)).length;
    const hard = await widgetCall(app, tabId, 'reload', true);
    const hardGet = await nextGet(pages, '/cache', mark);
    if (!hardGet) {
        return fail(`reload(true) reached no GET of /cache (reply ${JSON.stringify(hard)}; GETs since: ${JSON.stringify(pages.requests.slice(mark).map(r => r.path))})`);
    }
    if (!noCache(hardGet)) {
        return fail(`the bypass-cache reload's GET carried no no-cache: ${JSON.stringify(hardGet)}`);
    }
    if (await waitForPush(app, loadedAt(tabId, '/cache'), { from: pushMark }) < 0) {
        return fail('the bypass-cache reload never settled');
    }
    mark = pages.requests.length;
    const plain = await widgetCall(app, tabId, 'reload');
    const plainGet = await nextGet(pages, '/cache', mark);
    if (!plainGet) {
        return fail(`a plain reload reached no GET of /cache (reply ${JSON.stringify(plain)})`);
    }
    if (noCache(plainGet)) {
        return fail(`a plain reload's GET carried no-cache, so the flag is not what made the difference: ${JSON.stringify(plainGet)}`);
    }
}

async function backgroundOpen({ app, pages, fail }) {
    const a = await openWebTab(app, pages.url('/bg-a'));
    if (await waitForPush(app, loadedAt(a, '/bg-a')) < 0) {
        return fail('no loaded state push arrived for tab A');
    }
    const result = await probe(app, `
        const channel = get('WebTabChannel');
        const shell = get('ApplicationShell');
        const ref = channel.widgetOf(${JSON.stringify(a)});
        const opened = await get('WebTabOpenHandler').openInBackground(${JSON.stringify(pages.url('/bg'))}, ref);
        await sleep(300);
        const titles = shell.mainPanel.findTabBar(ref.title)?.titles ?? [];
        return {
            tabId: opened.tabId,
            after: titles.indexOf(opened.title) === titles.indexOf(ref.title) + 1 && titles.indexOf(ref.title) >= 0,
            current: shell.mainPanel.currentTitle === ref.title,
        };`);
    if (!result || typeof result.tabId !== 'string') {
        return fail(`${BROKEN} openInBackground returned no tab: ${JSON.stringify(result)}`);
    }
    if (!result.after) {
        return fail('the background tab is not directly after tab A in its tab bar');
    }
    if (!result.current) {
        return fail('opening in the background changed the current tab');
    }
    if (await waitForPush(app, loadedAt(result.tabId, '/bg')) < 0) {
        return fail('no state push for the background tab ended /bg');
    }
}

// Chrome-bar and menu reads in the Theia frame.
const navButtonExpr = label => `[...document.querySelectorAll('.pb-chrome-bar button')].find(b => b.getAttribute('aria-label') === ${JSON.stringify(label)})`;
const VISIBLE_MENUS = `[...document.querySelectorAll('.lm-Menu')].filter(m => m.getClientRects().length > 0)`;
const readMenus = app => app.evaluate(`JSON.stringify(${VISIBLE_MENUS}.map(m => [...m.querySelectorAll('.lm-Menu-item')].map(i => ({
    label: i.querySelector('.lm-Menu-itemLabel')?.textContent ?? '',
    toggled: i.classList.contains('lm-mod-toggled'),
    disabled: i.classList.contains('lm-mod-disabled'),
}))))`).then(JSON.parse);
const overlayVisibility = (app, tabId) => inChrome(app, `const o = overlayOf(${JSON.stringify(tabId)}); return o ? o.style.visibility : 'gone';`);

/** Polls `read` until `ok(value)`; returns the last value read either way. */
async function settle(read, ok, timeoutMs = 5000) {
    let seen;
    try {
        await pollFor(async () => ok(seen = await read()), timeoutMs, 'a settled read');
    } catch {
        // judged by the caller on `seen`
    }
    return seen;
}

/**
 * A trusted key in the page, so its session-history entry counts as
 * user-interacted. browser.navigation.requireUserInteraction (default on)
 * makes canGoBack skip entries nobody interacted with, so without this a
 * scripted /h1 -> /h2 -> /h3 leaves Back disabled, as it would in Firefox.
 */
async function interactWith(app, tabId) {
    if (await focusOverlay(app, tabId) !== true) {
        throw new Error(`${BROKEN} the overlay of ${tabId} could not be focused to interact with it`);
    }
    await pressKey(app, { key: 'a', code: 'KeyA', keyCode: 65 });
    await sleep(200);
}

/** A tab on /h1 -> /h2 -> /h3, current, with Back enabled; returns its tab id or a failure string. */
async function threeStepTab(app, pages, paths = ['/h1', '/h2', '/h3']) {
    const tabId = await openWebTab(app, pages.url(paths[0]));
    if (await waitForPush(app, loadedAt(tabId, paths[0])) < 0) {
        return { error: `no loaded state push for ${paths[0]} arrived` };
    }
    for (const path of paths.slice(1)) {
        await interactWith(app, tabId);
        const mark = (await pushes(app)).length;
        await widgetCall(app, tabId, 'navigate', pages.url(path));
        if (await waitForPush(app, loadedAt(tabId, path), { from: mark }) < 0) {
            return { error: `navigating to ${path} produced no loaded state push` };
        }
    }
    const enabled = await settle(() => app.evaluate(`!(${navButtonExpr('Back')})?.disabled`), v => v === true);
    if (enabled !== true) {
        return { error: `${BROKEN} Back never became enabled after ${paths.length} loads` };
    }
    return { tabId };
}

/** Opens the history menu on `label` by a bubbling cancelable contextmenu; true when the event was default-prevented. */
const contextMenuOn = (app, label) => app.evaluate(`(() => {
    const b = ${navButtonExpr(label)};
    if (!b) return 'no button';
    const r = b.getBoundingClientRect();
    return !b.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: r.left + 4, clientY: r.top + 4 }));
})()`);

async function historyMenu({ app, pages, fail }) {
    const setup = await threeStepTab(app, pages);
    if (setup.error) {
        return fail(setup.error);
    }
    const { tabId } = setup;
    // Focus starts outside the page, so the final focus read measures the entry's focusPage.
    if (await focusTheiaFrame(app) !== true || await chromeActiveTabId(app) === tabId) {
        return fail(`${BROKEN} focus could not be moved off the page before opening the menu`);
    }
    const prevented = await contextMenuOn(app, 'Back');
    if (prevented !== true) {
        return fail(`the contextmenu on Back was not default-prevented (${JSON.stringify(prevented)}), so the browser's own menu would show`);
    }
    const menus = await settle(() => readMenus(app), m => m.length === 1 && m[0].length > 0);
    const want = ['History Three', 'History Two', 'History One'];
    if (!menus || menus.length !== 1 || JSON.stringify(menus[0].map(i => i.label)) !== JSON.stringify(want)) {
        return fail(`right-click on Back must open one menu listing ${JSON.stringify(want)} newest first; saw ${JSON.stringify(menus)}`);
    }
    if (JSON.stringify(menus[0].map(i => i.toggled)) !== '[true,false,false]') {
        return fail(`only the current entry (/h3) may be check-marked; saw ${JSON.stringify(menus[0])}`);
    }
    const hidden = await settle(() => overlayVisibility(app, tabId), v => v === 'hidden');
    if (hidden !== 'hidden') {
        return fail(`the page overlay must be hidden while the history menu is open; its visibility is ${JSON.stringify(hidden)}`);
    }
    const mark = (await pushes(app)).length;
    const chose = await app.evaluate(`(() => {
        const menu = ${VISIBLE_MENUS}[0];
        const item = [...menu.querySelectorAll('.lm-Menu-item')][2];
        const r = item.getBoundingClientRect();
        const at = { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
        item.dispatchEvent(new MouseEvent('mousemove', at));
        item.dispatchEvent(new MouseEvent('mouseup', { ...at, button: 0 }));
        return true;
    })()`);
    if (chose !== true) {
        return fail(`${BROKEN} the /h1 menu item could not be driven`);
    }
    if (await waitForPush(app, p => p && p.kind === 'state' && p.tabId === tabId && String(p.url).endsWith('/h1'), { from: mark }) < 0) {
        return fail('choosing the /h1 entry produced no state push for /h1');
    }
    const left = await settle(() => readMenus(app), m => m.length === 0);
    if (left.length) {
        return fail(`the menu is still open after choosing an entry: ${JSON.stringify(left)}`);
    }
    const shown = await settle(() => overlayVisibility(app, tabId), v => v === 'visible');
    if (shown !== 'visible') {
        return fail(`after the menu closed the page overlay must be visible again; its visibility is ${JSON.stringify(shown)}`);
    }
    const focused = await settle(() => chromeActiveTabId(app), v => v === tabId);
    if (focused !== tabId) {
        return fail(`choosing an entry must put focus in the page; chrome's active overlay is ${JSON.stringify(focused)}`);
    }
}

// hard-reload-channel runs first, on the session's first web tab: a reload of a
// tab that shares a content process with an earlier same-site tab (Firefox's
// webIsolated process count is 4) is switched to remoteType "web" at
// about:blank, a GUI-02 defect independent of the flag under test
// (27-02-SUMMARY, deferred-items.md). Run later, it would score that defect.
const SCENARIOS = {
    'hard-reload-channel': hardReloadChannel,
    'esc-stop': escStop,
    'theia-keeps-esc': theiaKeepsEsc,
    'stop-button': stopButton,
    'history-channel': historyChannel,
    activation,
    'background-open': backgroundOpen,
    history: historyMenu,
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
