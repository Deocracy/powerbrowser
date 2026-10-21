#!/usr/bin/env node
/**
 * Phase 27 (NAV-01..04, NAV-06, KEY-04): the live check for the navigation buttons and
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
 *   long-press       A 600 ms primary press on Back opens the menu; the release
 *                    does not navigate; Escape closes it and focuses Back.
 *   history-error    With the tab's history read stubbed to fail, the menu holds
 *                    one disabled item naming the configured application name.
 *   hard-reload-click  Shift+click on Reload sends no-cache; a plain click does not.
 *   stop-guard       A Reload click on the first loaded push is ignored; one
 *                    700 ms later reloads (exactly one extra GET, the late one).
 *   middle-click     Middle-click on Back opens /h1, Ctrl+click on Reload /h2,
 *                    each in a new tab after the current one, which stays current.
 *   drop             A text/uri-list http link dragged onto New Tab shows the ring
 *                    and copy cursor and opens a focused current tab; a
 *                    javascript: link gets no ring and opens nothing; plain-text
 *                    http opens with no ring during the drag.
 *   home             With default settings the bar has no Home button; turning
 *                    browser.showHomeButton on shows it right after Reload with
 *                    no reload, on one row with every button, the pill keeping
 *                    its 120px minimum; clicking it loads browser.homePage
 *                    (/home) in the current web tab.
 *   home-empty       An empty home page: Home leaves the current tab on the empty
 *                    page and focuses the pill input with its text selected.
 *   home-failure     Home page "not an address": Home shows one dropdown row
 *                    naming the configured application name, no footer, the pill
 *                    focused; Enter opens Settings searching browser.homePage; a
 *                    second failure and Escape leave no row.
 *   home-no-tab      Settings current: Home opens /home in a new current web tab.
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
    WEB_TAB_STATE_EVENT,
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
    '/hard-click': { title: 'Hard Click', body: '<p>hard</p>' },
    // Finishes 400 ms after its head, so the loading and loaded pushes are separate frames.
    '/guard': { title: 'Guard', body: '<p>guard</p>', delayMs: 400 },
    '/drop': { title: 'Dropped', body: '<p>dropped</p>' },
    '/drop-text': { title: 'Dropped Text', body: '<p>dropped text</p>' },
    '/home-start': { title: 'Home Start', body: '<p>start</p>' },
    '/home': { title: 'Home Page', body: '<p>home</p>' },
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

const appNameExpr = `(() => {
    const key = Object.getOwnPropertySymbols(window).find(k => k.description === 'FrontendApplicationConfigProvider');
    return String((key && window[key] && window[key].applicationName) || '').trim();
})()`;

const clickOn = (app, label, init = {}) => app.evaluate(`(() => {
    const b = ${navButtonExpr(label)};
    if (!b) return false;
    b.dispatchEvent(new MouseEvent(${JSON.stringify(init.type ?? 'click')}, { bubbles: true, cancelable: true, ...${JSON.stringify(init)} }));
    return true;
})()`);

const escapeMenu = app => app.evaluate(`(() => {
    const m = ${VISIBLE_MENUS}[0];
    if (!m) return false;
    m.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape', code: 'Escape', keyCode: 27 }));
    return true;
})()`);

async function longPress({ app, pages, fail }) {
    const setup = await threeStepTab(app, pages, ['/h1', '/h2']);
    if (setup.error) {
        return fail(setup.error);
    }
    const { tabId } = setup;
    const mark = (await pushes(app)).length;
    const pressed = await app.evaluate(`(() => {
        const b = ${navButtonExpr('Back')};
        document.activeElement?.blur?.();
        if (!b || document.activeElement === b) return false;
        b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, buttons: 1, isPrimary: true, pointerType: 'mouse' }));
        return true;
    })()`);
    if (pressed !== true) {
        return fail(`${BROKEN} the press on Back could not be driven from an unfocused Back`);
    }
    await sleep(600);
    const menus = await readMenus(app);
    if (menus.length !== 1 || menus[0].length !== 2) {
        return fail(`a 600 ms press on Back must open one history menu with the two entries; saw ${JSON.stringify(menus)}`);
    }
    // A real release ends in a click on the button; it must not go back.
    await app.evaluate(`(() => {
        const b = ${navButtonExpr('Back')};
        b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, button: 0, isPrimary: true, pointerType: 'mouse' }));
        b.click();
        return true;
    })()`);
    if (await escapeMenu(app) !== true) {
        return fail('the history menu closed on the release, before Escape could close it');
    }
    const left = await settle(() => readMenus(app), m => m.length === 0);
    if (left.length) {
        return fail(`Escape did not close the history menu: ${JSON.stringify(left)}`);
    }
    const focused = await settle(() => app.evaluate(`document.activeElement === ${navButtonExpr('Back')}`), v => v === true);
    if (focused !== true) {
        return fail('after Escape focus must return to the Back button that opened the menu');
    }
    await sleep(1000);
    const moved = (await pushes(app)).slice(mark).filter(p => p && p.kind === 'state' && p.tabId === tabId && !String(p.url).endsWith('/h2'));
    if (moved.length) {
        return fail(`the release after the hold, or Escape, navigated the tab to ${JSON.stringify(moved[0].url)}`);
    }
}

async function historyError({ app, pages, fail }) {
    const setup = await threeStepTab(app, pages, ['/h1', '/h2']);
    if (setup.error) {
        return fail(setup.error);
    }
    const tab = `get('ApplicationShell').mainPanel.currentTitle?.owner`;
    const stubbed = await probe(app, `const w = ${tab}; if (!w || w.tabId !== ${JSON.stringify(setup.tabId)}) return false; w.history = async () => ({ ok: false, reason: 'timeout' }); return true;`);
    if (stubbed !== true) {
        return fail(`${BROKEN} the current tab's history read could not be stubbed`);
    }
    try {
        await contextMenuOn(app, 'Back');
        const menus = await settle(() => readMenus(app), m => m.length === 1);
        const subject = (await app.evaluate(appNameExpr)) || 'The browser';
        const item = menus?.[0]?.[0];
        if (!menus || menus.length !== 1 || menus[0].length !== 1 || !item.disabled
            || !item.label.startsWith(subject) || !item.label.includes("couldn't read this tab's history")) {
            return fail(`a failed history read must open one menu holding one disabled item that starts with ${JSON.stringify(subject)}; saw ${JSON.stringify(menus)}`);
        }
        if (/timeout/i.test(item.label)) {
            return fail(`the error item carries the raw failure reason: ${JSON.stringify(item.label)}`);
        }
    } finally {
        await escapeMenu(app);
        await probe(app, `const w = ${tab}; if (w && Object.prototype.hasOwnProperty.call(w, 'history')) delete w.history; return true;`);
    }
}

async function hardReloadClick({ app, pages, fail }) {
    const tabId = await openWebTab(app, pages.url('/hard-click'));
    if (await waitForPush(app, loadedAt(tabId, '/hard-click')) < 0) {
        return fail('no loaded state push arrived for /hard-click');
    }
    await sleep(800); // clear of the post-Stop guard
    let mark = pages.requests.length;
    const pushMark = (await pushes(app)).length;
    if (await clickOn(app, 'Reload', { shiftKey: true }) !== true) {
        return fail(`${BROKEN} the Reload button is missing`);
    }
    const hardGet = await nextGet(pages, '/hard-click', mark);
    if (!hardGet || !noCache(hardGet)) {
        return fail(`Shift+click on Reload must send a GET carrying no-cache; got ${JSON.stringify(hardGet)}`);
    }
    if (await waitForPush(app, loadedAt(tabId, '/hard-click'), { from: pushMark }) < 0) {
        return fail('the Shift+click reload never settled');
    }
    await sleep(800);
    mark = pages.requests.length;
    await clickOn(app, 'Reload');
    const plainGet = await nextGet(pages, '/hard-click', mark);
    if (!plainGet || noCache(plainGet)) {
        return fail(`a plain click on Reload must send a GET without no-cache; got ${JSON.stringify(plainGet)}`);
    }
}

async function stopGuard({ app, pages, fail }) {
    const armed = await app.evaluate(`(() => {
        window.__pbGuard = { armed: true, early: 0, late: 0 };
        const reload = () => ${navButtonExpr('Reload')};
        window.addEventListener(${JSON.stringify(WEB_TAB_STATE_EVENT)}, event => {
            const d = event.detail;
            if (!window.__pbGuard.armed || !d || d.kind !== 'state' || d.loading || !String(d.url).endsWith('/guard')) return;
            window.__pbGuard.armed = false;
            window.__pbGuard.early = Date.now();
            reload()?.click();
            setTimeout(() => { window.__pbGuard.late = Date.now(); reload()?.click(); }, 700);
        });
        return true;
    })()`);
    if (armed !== true) {
        return fail(`${BROKEN} the in-page click listener could not be installed`);
    }
    const mark = pages.requests.length;
    await openWebTab(app, pages.url('/guard'));
    let guard;
    try {
        await pollFor(async () => (guard = JSON.parse(await app.evaluate('JSON.stringify(window.__pbGuard)'))).late > 0, 15000, 'both Reload clicks');
    } catch {
        return fail(`the listener never saw a loaded push for /guard, or never made the late click: ${JSON.stringify(guard)}`);
    }
    await sleep(1500);
    const gets = pages.requests.slice(mark).filter(r => r.path === '/guard');
    const extra = gets.slice(1);
    if (gets.length < 1) {
        return fail(`${BROKEN} the page server saw no GET of /guard`);
    }
    if (extra.length !== 1 || extra[0].at < guard.late) {
        return fail(`a click on Reload within 650 ms after loading ended must be ignored and one 700 ms later must reload: expected exactly one extra GET at or after the late click, saw ${extra.length} (${JSON.stringify(extra.map(r => r.at - guard.early))} ms after the early click)`);
    }
}

async function middleClick({ app, pages, fail }) {
    const setup = await threeStepTab(app, pages, ['/h1', '/h2']);
    if (setup.error) {
        return fail(setup.error);
    }
    const { tabId } = setup;
    const around = () => probe(app, `
        const panel = get('ApplicationShell').mainPanel;
        const cur = panel.currentTitle;
        const titles = panel.findTabBar(cur)?.titles ?? [];
        const next = titles[titles.indexOf(cur) + 1];
        return { current: cur?.owner?.tabId ?? null, next: next?.owner?.tabId ?? null };`);
    for (const [label, init, path] of [['Back', { type: 'auxclick', button: 1 }, '/h1'], ['Reload', { ctrlKey: true }, '/h2']]) {
        const before = await around();
        const mark = (await pushes(app)).length;
        await sleep(800); // clear of the post-Stop guard for the Reload half
        if (await clickOn(app, label, init) !== true) {
            return fail(`${BROKEN} the ${label} button is missing`);
        }
        const after = await settle(around, v => v && v.next && v.next !== before.next);
        if (!after?.next || after.next === before.next) {
            return fail(`${JSON.stringify(init)} on ${label} added no tab directly after the current one (${JSON.stringify(after)})`);
        }
        if (after.current !== tabId) {
            return fail(`${JSON.stringify(init)} on ${label} changed the current tab to ${JSON.stringify(after.current)}`);
        }
        if (await waitForPush(app, loadedAt(after.next, path), { from: mark }) < 0) {
            return fail(`the tab opened by ${JSON.stringify(init)} on ${label} never loaded ${path}`);
        }
    }
}

/**
 * Drags `{ type: value }` over New Tab and drops it, in the Theia frame.
 * Returns what the drag looked like: dragover default-prevented, its
 * dropEffect, the ring during the drag and after the drop.
 */
const dragOntoNewTab = (app, data) => app.evaluate(`JSON.stringify((() => {
    const b = ${navButtonExpr('New Tab')};
    if (!b) return null;
    const dt = new DataTransfer();
    for (const [type, value] of Object.entries(${JSON.stringify(data)})) dt.setData(type, value);
    const fire = type => { const e = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }); b.dispatchEvent(e); return e; };
    fire('dragenter');
    const over = fire('dragover');
    const seen = { prevented: over.defaultPrevented, dropEffect: dt.dropEffect, ring: b.classList.contains('is-drop-target') };
    fire('drop');
    seen.ringAfter = b.classList.contains('is-drop-target');
    return seen;
})())`).then(JSON.parse);

const currentAndCount = app => probe(app, `const shell = get('ApplicationShell');
    return { current: shell.mainPanel.currentTitle?.owner?.tabId ?? null, count: webTabs().length };`);

async function dropOnNewTab({ app, pages, fail }) {
    for (const [data, path, ring] of [
        [{ 'text/uri-list': `# a comment\n${pages.url('/drop')}` }, '/drop', true],
        [{ 'text/plain': `  ${pages.url('/drop-text')}  ` }, '/drop-text', false],
    ]) {
        const before = await currentAndCount(app);
        const mark = (await pushes(app)).length;
        const drag = await dragOntoNewTab(app, data);
        if (!drag) {
            return fail(`${BROKEN} the New Tab button is missing`);
        }
        if (!drag.prevented || drag.dropEffect !== 'copy' || drag.ring !== ring) {
            return fail(`dragging ${JSON.stringify(Object.keys(data))} over New Tab must be accepted with the copy cursor and ${ring ? 'the' : 'no'} ring; saw ${JSON.stringify(drag)}`);
        }
        if (drag.ringAfter) {
            return fail('the drop-target ring is still on New Tab after the drop');
        }
        const after = await settle(() => currentAndCount(app), v => v && v.current && v.current !== before.current);
        if (!after?.current || after.current === before.current || after.count !== before.count + 1) {
            return fail(`dropping ${path} on New Tab must open one new current web tab; before ${JSON.stringify(before)}, after ${JSON.stringify(after)}`);
        }
        if (await waitForPush(app, loadedAt(after.current, path), { from: mark }) < 0) {
            return fail(`the tab opened by the drop never loaded ${path}`);
        }
        const focused = await settle(() => chromeActiveTabId(app), v => v === after.current);
        if (focused !== after.current) {
            return fail(`after the drop focus must be in the new page; chrome's active overlay is ${JSON.stringify(focused)}`);
        }
        if (path === '/drop') {
            // The positive control above opened a tab; a javascript: link must open none.
            const refused = await dragOntoNewTab(app, { 'text/uri-list': 'javascript:alert(1)' });
            // Theia's document listener default-prevents every dragover, so the refusal is the dropEffect.
            if (refused.ring || refused.dropEffect !== 'none') {
                return fail(`a javascript: link over New Tab must be refused with no ring; saw ${JSON.stringify(refused)}`);
            }
            await sleep(1500);
            const still = await currentAndCount(app);
            if (still.count !== after.count || still.current !== after.current) {
                return fail(`dropping a javascript: link on New Tab opened a tab: ${JSON.stringify(still)}`);
            }
        }
    }
}

/** Sets a Home setting in the user scope (the profile's own config dir) and waits until it reads back. */
const setPref = (app, key, value) => probe(app, `const prefs = get('PreferenceService');
    await prefs.ready;
    await prefs.set(${JSON.stringify(key)}, ${JSON.stringify(value)}, 1);
    return await until(() => prefs.get(${JSON.stringify(key)}) === ${JSON.stringify(value)}, 10000);`);

/** The bar's button labels in order, each button's top, the toggle's top and bottom, the pill's min-width. */
const readBar = app => app.evaluate(`JSON.stringify((() => {
    const bar = document.querySelector('.pb-chrome-bar');
    if (!bar) return null;
    const buttons = [...bar.querySelectorAll(':scope > button')];
    const toggle = bar.querySelector('.pb-chrome-bar-toggle')?.getBoundingClientRect();
    return {
        labels: buttons.map(b => b.getAttribute('aria-label')),
        tops: buttons.map(b => Math.round(b.getBoundingClientRect().top)),
        bottoms: buttons.map(b => Math.round(b.getBoundingClientRect().bottom)),
        toggle: toggle ? { top: Math.round(toggle.top), bottom: Math.round(toggle.bottom) } : null,
        pillMin: getComputedStyle(bar.querySelector('.pb-chrome-bar-pill')).minWidth,
        homeDisabled: ${navButtonExpr('Home')}?.disabled ?? null,
    };
})())`).then(JSON.parse);

async function home({ app, pages, fail }) {
    const before = await readBar(app);
    if (!before) {
        return fail(`${BROKEN} the chrome bar is missing`);
    }
    // Counts only because the same session then shows the button (positive control below).
    if (before.labels.includes('Home')) {
        return fail(`with default settings the bar must show no Home button; saw ${JSON.stringify(before.labels)}`);
    }
    if (await setPref(app, 'browser.showHomeButton', true) !== true) {
        return fail(`${BROKEN} browser.showHomeButton could not be set to true`);
    }
    const bar = await settle(() => readBar(app), v => v && v.labels.includes('Home'));
    if (!bar?.labels.includes('Home')) {
        return fail(`turning browser.showHomeButton on must show the Home button without a reload; saw ${JSON.stringify(bar?.labels)}`);
    }
    const reload = bar.labels.findIndex(l => l === 'Reload' || l === 'Stop');
    if (bar.labels[reload + 1] !== 'Home') {
        return fail(`Home must sit directly after Reload; saw ${JSON.stringify(bar.labels)}`);
    }
    if (bar.homeDisabled !== false) {
        return fail(`Home must never be disabled; disabled is ${JSON.stringify(bar.homeDisabled)}`);
    }
    if (new Set(bar.tops).size !== 1 || !bar.toggle || bar.toggle.top >= bar.bottoms[0] || bar.toggle.bottom <= bar.tops[0]) {
        return fail(`every bar button and the mode toggle must share one row; tops ${JSON.stringify(bar.tops)}, toggle ${JSON.stringify(bar.toggle)}`);
    }
    if (bar.pillMin !== '120px') {
        return fail(`the address pill's min-width must stay 120px with Home shown; it is ${JSON.stringify(bar.pillMin)}`);
    }
    if (await setPref(app, 'browser.homePage', pages.url('/home')) !== true) {
        return fail(`${BROKEN} browser.homePage could not be set`);
    }
    const tabId = await openWebTab(app, pages.url('/home-start'));
    if (await waitForPush(app, loadedAt(tabId, '/home-start')) < 0) {
        return fail('no loaded state push arrived for /home-start');
    }
    const mark = (await pushes(app)).length;
    if (await clickOn(app, 'Home') !== true) {
        return fail(`${BROKEN} the Home button vanished before it could be clicked`);
    }
    if (await waitForPush(app, loadedAt(tabId, '/home'), { from: mark }) < 0) {
        return fail('clicking Home produced no state push for the current tab ending /home');
    }
}

/** The pill input's focus and selection, and the dropdown's rows and footers, in the Theia frame. */
const readPill = app => app.evaluate(`JSON.stringify((() => {
    const input = document.querySelector('.pb-chrome-bar-input');
    const dropdown = document.querySelector('.pb-chrome-bar-dropdown');
    return {
        focused: !!input && document.activeElement === input,
        value: input ? input.value : null,
        selected: !!input && input.selectionStart === 0 && input.selectionEnd === input.value.length,
        rows: dropdown ? [...dropdown.querySelectorAll('.pb-chrome-bar-row')].map(r => r.textContent) : [],
        footers: dropdown ? dropdown.querySelectorAll('.pb-chrome-bar-dropdown-footer').length : 0,
    };
})())`).then(JSON.parse);

/** Dispatches a keydown on the pill input (React's root listener sees it bubble). */
const pillKey = (app, key) => app.evaluate(`(() => {
    const input = document.querySelector('.pb-chrome-bar-input');
    if (!input) return false;
    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: ${JSON.stringify(key)} }));
    return true;
})()`);

const currentWidget = app => probe(app, `const owner = get('ApplicationShell').mainPanel.currentTitle?.owner;
    return { id: owner?.id ?? null, tabId: owner?.tabId ?? null, count: webTabs().length };`);

async function homeEmpty({ app, pages, fail }) {
    if (await setPref(app, 'browser.showHomeButton', true) !== true || await setPref(app, 'browser.homePage', '') !== true) {
        return fail(`${BROKEN} the Home settings could not be set`);
    }
    const tabId = await openWebTab(app, pages.url('/home-start'));
    if (await waitForPush(app, loadedAt(tabId, '/home-start')) < 0) {
        return fail('no loaded state push arrived for /home-start');
    }
    if (await settle(() => app.evaluate(`!!${navButtonExpr('Home')}`), v => v === true) !== true || await clickOn(app, 'Home') !== true) {
        return fail(`${BROKEN} the Home button is missing`);
    }
    const spec = await settle(() => inChrome(app, `const o = overlayOf(${JSON.stringify(tabId)}); return o ? o.currentURI.spec : 'gone';`), v => v === 'about:blank');
    if (spec !== 'about:blank') {
        return fail(`with an empty home page Home must leave the current tab on the empty page; it is on ${JSON.stringify(spec)}`);
    }
    const pill = await settle(() => readPill(app), v => v.focused && v.selected);
    if (!pill.focused || !pill.selected) {
        return fail(`with an empty home page Home must focus the pill with its whole text selected; saw ${JSON.stringify(pill)}`);
    }
    const current = await currentWidget(app);
    if (current.tabId !== tabId) {
        return fail(`an empty home page with a web tab current must not open another tab; current is ${JSON.stringify(current)}`);
    }
}

async function homeFailure({ app, pages, fail }) {
    if (await setPref(app, 'browser.showHomeButton', true) !== true || await setPref(app, 'browser.homePage', 'not an address') !== true) {
        return fail(`${BROKEN} the Home settings could not be set`);
    }
    const tabId = await openWebTab(app, pages.url('/home-start'));
    if (await waitForPush(app, loadedAt(tabId, '/home-start')) < 0) {
        return fail('no loaded state push arrived for /home-start');
    }
    if (await settle(() => app.evaluate(`!!${navButtonExpr('Home')}`), v => v === true) !== true || await clickOn(app, 'Home') !== true) {
        return fail(`${BROKEN} the Home button is missing`);
    }
    const subject = (await app.evaluate(appNameExpr)) || 'The browser';
    const pill = await settle(() => readPill(app), v => v.rows.length > 0 && v.focused);
    if (pill.rows.length !== 1 || !pill.rows[0].startsWith(subject) || !pill.rows[0].includes("can't open your home page") || pill.footers !== 0) {
        return fail(`a rejected home page must show one row starting with ${JSON.stringify(subject)} and no footer; saw ${JSON.stringify(pill)}`);
    }
    if (/browser\.homePage|not an address/.test(pill.rows[0])) {
        return fail(`the Home-failure row carries the setting key or its value: ${JSON.stringify(pill.rows[0])}`);
    }
    if (!pill.focused) {
        return fail('the Home-failure row must move focus to the pill');
    }
    await pillKey(app, 'Enter');
    const settings = await settle(() => probe(app, `const owner = get('ApplicationShell').mainPanel.currentTitle?.owner;
        return { id: owner?.id ?? null, search: document.querySelector('#preference-searchbar')?.value ?? null };`),
        v => v && v.id === 'settings_widget' && v.search === 'browser.homePage', 10000);
    if (settings?.id !== 'settings_widget' || settings.search !== 'browser.homePage') {
        return fail(`Enter on the Home-failure row must open Settings searching browser.homePage; saw ${JSON.stringify(settings)}`);
    }
    if ((await readPill(app)).rows.length) {
        return fail('the Home-failure row stayed open after Enter opened Settings');
    }
    // Settings is current now (no web tab): a second failure, then Escape.
    await clickOn(app, 'Home');
    const again = await settle(() => readPill(app), v => v.rows.length === 1);
    if (again.rows.length !== 1) {
        return fail(`a second Home click must show the row again (the control for Escape); saw ${JSON.stringify(again)}`);
    }
    await pillKey(app, 'Escape');
    const closed = await settle(() => readPill(app), v => v.rows.length === 0);
    if (closed.rows.length) {
        return fail(`Escape must close the Home-failure row; saw ${JSON.stringify(closed)}`);
    }
}

async function homeNoTab({ app, pages, fail }) {
    if (await setPref(app, 'browser.showHomeButton', true) !== true || await setPref(app, 'browser.homePage', pages.url('/home')) !== true) {
        return fail(`${BROKEN} the Home settings could not be set`);
    }
    await probe(app, `await get('CommandRegistry').executeCommand('preferences:open'); return true;`);
    const before = await settle(() => currentWidget(app), v => v.id === 'settings_widget');
    if (before.id !== 'settings_widget') {
        return fail(`${BROKEN} Settings could not be made current; current is ${JSON.stringify(before)}`);
    }
    const mark = (await pushes(app)).length;
    if (await clickOn(app, 'Home') !== true) {
        return fail(`${BROKEN} the Home button is missing`);
    }
    const after = await settle(() => currentWidget(app), v => v.tabId && v.count === before.count + 1);
    if (!after.tabId || after.count !== before.count + 1) {
        return fail(`Home with no web tab current must open one new current web tab; before ${JSON.stringify(before)}, after ${JSON.stringify(after)}`);
    }
    if (await waitForPush(app, loadedAt(after.tabId, '/home'), { from: mark }) < 0) {
        return fail('the tab Home opened never pushed /home');
    }
}

// The reload scenarios run first, on the session's first web tabs: a reload of a
// tab that shares a content process with an earlier same-site tab (Firefox's
// webIsolated process count is 4) is switched to remoteType "web" at
// about:blank, a GUI-02 defect independent of the flag under test
// (27-02-SUMMARY, deferred-items.md). Run later, it would score that defect.
const SCENARIOS = {
    'hard-reload-channel': hardReloadChannel,
    'hard-reload-click': hardReloadClick,
    'stop-guard': stopGuard,
    'esc-stop': escStop,
    'theia-keeps-esc': theiaKeepsEsc,
    'stop-button': stopButton,
    'history-channel': historyChannel,
    activation,
    'background-open': backgroundOpen,
    history: historyMenu,
    'long-press': longPress,
    'history-error': historyError,
    'middle-click': middleClick,
    drop: dropOnNewTab,
    home,
    'home-empty': homeEmpty,
    'home-failure': homeFailure,
    'home-no-tab': homeNoTab,
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
    // Registry order, whatever order was asked for: it is load-bearing (the
    // reload scenarios first, theia-keeps-esc after its control).
    return Object.keys(SCENARIOS).filter(n => names.includes(n));
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
