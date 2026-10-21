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
 *   page-keys        With a page focused (served from localhost, a separate
 *                    site, so its reloads avoid the shared-process defect in
 *                    deferred-items.md): Ctrl+R and F5 add one GET without
 *                    no-cache, Ctrl+Shift+R and Ctrl+F5 one with it; Alt+Left
 *                    and Alt+Right go back and forward; Alt+Home loads
 *                    browser.homePage with focus left in the page; Alt+D and
 *                    Ctrl+L focus the pill with its text selected; Ctrl+T opens
 *                    a current empty tab with the pill focused; Ctrl+W in a
 *                    second tab closes it and lands focus in the first tab's page.
 *   page-prevented   A page that preventDefault()s every keydown keeps F5 and
 *                    Alt+Left (no GET, no navigation) while Ctrl+T and Ctrl+W
 *                    still act. Scored only after page-keys passed in the same
 *                    session (its positive control for F5 and Alt+Left).
 *   tab-keys         Browsing, three tabs: Ctrl+Tab, Ctrl+Shift+Tab,
 *                    Ctrl+PageDown/Up step with wrap in strip order, Alt+1 and
 *                    Alt+9 pick the first and last, Alt+5 changes nothing, and
 *                    focus lands in each target's page; in Coding Ctrl+Tab
 *                    follows the tab bar holding the current tab.
 *   close-split      Coding, B alone in a split pane and current only through
 *                    its page focus, never activated: Ctrl+W in B's page closes it,
 *                    makes A current and lands focus in A's page.
 *   focus-keys       F6 in a focused page puts focus on the pill with its text
 *                    selected (chrome's active element the Theia frame); F6 in
 *                    the pill puts chrome's focus back on the page's overlay;
 *                    Shift+F6 makes the same two moves.
 *   focus-keys-prevented  A page that preventDefault()s F6 keeps it: chrome's
 *                    focus stays on its overlay and no shortcut push arrives
 *                    within 1500 ms. Scored only after focus-keys passed.
 *   focus-keys-debug With a stand-in running debug session (inDebugMode set,
 *                    the session state Running, so @theia/debug's F6 Pause
 *                    binding is live), F6 in the pill still puts chrome's
 *                    focus back on the page's overlay.
 *   mouse-buttons    Tab at /m2 with /m1 behind it: a mouseover on its overlay,
 *                    then an AppCommand Back on the shell window, lands on /m1;
 *                    Forward lands on /m2; after a mouseover on the Theia frame
 *                    element, Back changes nothing within 1500 ms.
 *   pill-esc         A slow page loading, the pill focused with no dropdown
 *                    and no edit: Escape stops the load (a loading: false push)
 *                    with no shortcut push.
 *   theia-keeps-keys In an untitled editor F5, F6, F11, Ctrl+P, Ctrl+K,
 *                    Ctrl+Tab, Alt+Left, Ctrl+R and Ctrl+L, and in a terminal
 *                    Ctrl+R and Ctrl+W, all reach the Theia frame with no
 *                    shortcut push; Ctrl+L in the editor leaves the pill
 *                    unfocused, while Ctrl+L outside an editor and a terminal
 *                    focuses it. Scored only after page-keys passed.
 *   tooltips         Coding, a web tab current: hovering Back shows one
 *                    HoverService tooltip whose text is the table's Back row
 *                    through the gate's formatter, one line, its bottom edge at
 *                    or above the button's top and clear of the page rect.
 *   tooltips-all     In Coding, Browsing and Organising with Home on and a web
 *                    tab current: Back and Forward (both disabled on the fresh
 *                    tab), Reload, Home, New Tab, and Stop while a slow page
 *                    loads, each show their table text the same way. Where the
 *                    bar has no room above it (Organising: the bar is at the
 *                    window's top edge) the tooltip may sit below the button,
 *                    still clear of the page rect.
 *   page-focus-reload  The page-focus context key is true with a page focused;
 *                    after a frontend reload it is false, turns true when a
 *                    page of the new frontend takes focus and false again with
 *                    the Theia frame focused. Runs last: the reload drops every tab.
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
    installPushRecorder,
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
import { buttonShortcuts, formatTooltip } from './verify-shortcut-relay.mjs';

const NEW_TAB_COMMAND_ID = sourceConst('theia/extensions/chrome-bar/src/browser/chrome-bar-commands.ts', 'CHROME_BAR_NEW_TAB_COMMAND_ID');
const MODES_ACTIVATE_COMMAND_ID = sourceConst('theia/extensions/modes/src/browser/modes-commands.ts', 'MODES_ACTIVATE_COMMAND_ID');

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
    '/k1': { title: 'Keys One', body: '<p>k1</p>' },
    '/k2': { title: 'Keys Two', body: '<p>k2</p>' },
    '/kb': { title: 'Keys B', body: '<p>kb</p>' },
    '/kp0': { title: 'Keys Plain', body: '<p>kp0</p>' },
    // Consumes every key it sees; the reserved rows must act anyway.
    '/kp': { title: 'Keys Prevented', body: '<p>kp</p><script>addEventListener("keydown", e => e.preventDefault(), true);</script>' },
    '/t1': { title: 'Tab One', body: '<p>t1</p>' },
    '/t2': { title: 'Tab Two', body: '<p>t2</p>' },
    '/t3': { title: 'Tab Three', body: '<p>t3</p>' },
    '/f6': { title: 'Focus Keys', body: '<p>f6</p>' },
    '/s1': { title: 'Split One', body: '<p>s1</p>' },
    '/s2': { title: 'Split Two', body: '<p>s2</p>' },
    '/m1': { title: 'Mouse One', body: '<p>m1</p>' },
    '/m2': { title: 'Mouse Two', body: '<p>m2</p>' },
    '/slow-pill': { title: 'Slow Pill', body: '<p>still loading</p>', slow: true },
    '/pf1': { title: 'Focus Before Reload', body: '<p>pf1</p>' },
    '/pf2': { title: 'Focus After Reload', body: '<p>pf2</p>' },
    '/tip': { title: 'Tooltip', body: '<p>tip</p>' },
    '/tip-coding': { title: 'Tooltip Coding', body: '<p>coding</p>' },
    '/tip-browsing': { title: 'Tooltip Browsing', body: '<p>browsing</p>' },
    '/tip-organising': { title: 'Tooltip Organising', body: '<p>organising</p>' },
    '/slow-tip-coding': { title: 'Slow Tip Coding', body: '<p>still loading</p>', slow: true },
    '/slow-tip-browsing': { title: 'Slow Tip Browsing', body: '<p>still loading</p>', slow: true },
    '/slow-tip-organising': { title: 'Slow Tip Organising', body: '<p>still loading</p>', slow: true },
    '/f6p': { title: 'Focus Kept', body: '<p>f6p</p><script>addEventListener("keydown", e => { if (e.key === "F6") e.preventDefault(); }, true);</script>' },
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
    // Each wait includes the served title, so the session-history entry has its title before the next navigation.
    const titled = (path, title) => p => loadedAt(tabId, path)(p) && p.title === title;
    const tabId = await openWebTab(app, pages.url('/h1'));
    if (await waitForPush(app, titled('/h1', 'History One')) < 0) {
        return fail('no loaded state push for /h1 with its title arrived');
    }
    for (const [path, title] of [['/h2', 'History Two'], ['/h3', 'History Three']]) {
        const mark = (await pushes(app)).length;
        await widgetCall(app, tabId, 'navigate', pages.url(path));
        if (await waitForPush(app, titled(path, title), { from: mark }) < 0) {
            return fail(`navigating to ${path} produced no loaded state push with its title`);
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

// Keys as the parent sees them (pb-live-probe's pressKey).
const KEY = {
    ctrlR: { key: 'r', code: 'KeyR', keyCode: 82, modifiers: ['accel'] },
    f5: { key: 'F5', code: 'F5', keyCode: 116 },
    ctrlShiftR: { key: 'R', code: 'KeyR', keyCode: 82, modifiers: ['accel', 'shift'] },
    ctrlF5: { key: 'F5', code: 'F5', keyCode: 116, modifiers: ['accel'] },
    altLeft: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37, modifiers: ['alt'] },
    altRight: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39, modifiers: ['alt'] },
    altHome: { key: 'Home', code: 'Home', keyCode: 36, modifiers: ['alt'] },
    altD: { key: 'd', code: 'KeyD', keyCode: 68, modifiers: ['alt'] },
    ctrlL: { key: 'l', code: 'KeyL', keyCode: 76, modifiers: ['accel'] },
    ctrlT: { key: 't', code: 'KeyT', keyCode: 84, modifiers: ['accel'] },
    ctrlW: { key: 'w', code: 'KeyW', keyCode: 87, modifiers: ['accel'] },
    ctrlTab: { key: 'Tab', code: 'Tab', keyCode: 9, modifiers: ['accel'] },
    ctrlShiftTab: { key: 'Tab', code: 'Tab', keyCode: 9, modifiers: ['accel', 'shift'] },
    ctrlPageDown: { key: 'PageDown', code: 'PageDown', keyCode: 34, modifiers: ['accel'] },
    ctrlPageUp: { key: 'PageUp', code: 'PageUp', keyCode: 33, modifiers: ['accel'] },
    alt: n => ({ key: String(n), code: `Digit${n}`, keyCode: 48 + n, modifiers: ['alt'] }),
    f6: { key: 'F6', code: 'F6', keyCode: 117 },
    shiftF6: { key: 'F6', code: 'F6', keyCode: 117, modifiers: ['shift'] },
    f11: { key: 'F11', code: 'F11', keyCode: 122 },
    ctrlP: { key: 'p', code: 'KeyP', keyCode: 80, modifiers: ['accel'] },
    ctrlK: { key: 'k', code: 'KeyK', keyCode: 75, modifiers: ['accel'] },
};

/** True when chrome's active element is the Theia frame's <browser>. */
const chromeOnTheiaFrame = app => inChrome(app, `return document.activeElement === document.getElementById('powerbrowser-content');`);

/** A served URL on localhost: another site than 127.0.0.1, so these tabs get their own content processes. */
const otherSite = (pages, path) => pages.url(path).replace('//127.0.0.1:', '//localhost:');

/** Focuses `tabId`'s page and presses `spec` there; throws a broken-instrument error when the page cannot be focused. */
async function keyInPage(app, tabId, spec) {
    if (await focusOverlay(app, tabId) !== true) {
        const seen = await inChrome(app, `const o = overlayOf(${JSON.stringify(tabId)}); return { exists: !!o, visibility: o?.style.visibility ?? null, active: W.tabIdOfBrowser(document.activeElement) ?? document.activeElement?.id ?? null };`);
        throw new Error(`${BROKEN} the overlay of ${tabId} could not be focused (${JSON.stringify(seen)}, current ${JSON.stringify(await currentTab(app))})`);
    }
    await pressKey(app, spec);
}

/** The current main-area widget's tab id, URL and the web-tab count. */
const currentTab = app => probe(app, `const owner = get('ApplicationShell').mainPanel.currentTitle?.owner;
    return { tabId: owner?.tabId ?? null, url: owner?.url ?? null, count: webTabs().length };`);

/** A web tab on `paths` in turn (interacted with before each navigation, so Back counts the entries). */
async function tabThrough(app, urls) {
    const tabId = await openWebTab(app, urls[0]);
    if (await waitForPush(app, p => isState(tabId, false)(p) && p.url === urls[0]) < 0) {
        return { error: `no loaded state push for ${urls[0]} arrived` };
    }
    for (const url of urls.slice(1)) {
        await interactWith(app, tabId);
        const mark = (await pushes(app)).length;
        await widgetCall(app, tabId, 'navigate', url);
        if (await waitForPush(app, p => isState(tabId, false)(p) && p.url === url, { from: mark }) < 0) {
            return { error: `navigating to ${url} produced no loaded state push` };
        }
    }
    return { tabId };
}

async function pageKeys({ app, pages, fail, note }) {
    const k2 = otherSite(pages, '/k2');
    const setup = await tabThrough(app, [otherSite(pages, '/k1'), k2]);
    if (setup.error) {
        return fail(setup.error);
    }
    const a = setup.tabId;
    if (await focusOverlay(app, a) !== true || await pageKeyDisabled(app, 'reload') !== false) {
        return fail(`${BROKEN} the reload row is missing or stayed disabled with the page focused`);
    }
    for (const [name, spec, hard] of [['Ctrl+R', KEY.ctrlR, false], ['F5', KEY.f5, false], ['Ctrl+Shift+R', KEY.ctrlShiftR, true], ['Ctrl+F5', KEY.ctrlF5, true]]) {
        const mark = pages.requests.length;
        const pushMark = (await pushes(app)).length;
        await keyInPage(app, a, spec);
        const got = await nextGet(pages, '/k2', mark);
        if (!got) {
            return fail(`${name} with the page focused reached no GET of /k2`);
        }
        if (noCache(got) !== hard) {
            return fail(`${name}'s GET ${hard ? 'carried no' : 'carried'} no-cache: ${JSON.stringify(got)}`);
        }
        if (await waitForPush(app, p => isState(a, false)(p) && p.url === k2, { from: pushMark }) < 0) {
            return fail(`the reload from ${name} never settled`);
        }
        await sleep(300);
        const gets = pages.requests.slice(mark).filter(r => r.path === '/k2').length;
        if (gets !== 1) {
            return fail(`${name} must add exactly one GET of /k2; it added ${gets}`);
        }
    }
    note(`keys: ${keyRoute.last}`);
    for (const [name, spec, path] of [['Alt+Left', KEY.altLeft, '/k1'], ['Alt+Right', KEY.altRight, '/k2']]) {
        const mark = (await pushes(app)).length;
        await keyInPage(app, a, spec);
        if (await waitForPush(app, p => isState(a, false)(p) && String(p.url).endsWith(path), { from: mark }) < 0) {
            return fail(`${name} with the page focused produced no push ending ${path}`);
        }
        await sleep(300);
    }
    if (await setPref(app, 'browser.homePage', otherSite(pages, '/home')) !== true) {
        return fail(`${BROKEN} browser.homePage could not be set`);
    }
    let mark = (await pushes(app)).length;
    await keyInPage(app, a, KEY.altHome);
    if (await waitForPush(app, p => isState(a, false)(p) && String(p.url).endsWith('/home'), { from: mark }) < 0) {
        return fail('Alt+Home with the page focused produced no push ending /home');
    }
    const active = await settle(() => chromeActiveTabId(app), v => v === a);
    if (active !== a) {
        return fail(`after Alt+Home focus must stay in the page; chrome's active overlay is ${JSON.stringify(active)}`);
    }
    for (const [name, spec] of [['Alt+D', KEY.altD], ['Ctrl+L', KEY.ctrlL]]) {
        await keyInPage(app, a, spec);
        const pill = await settle(() => readPill(app), v => v.focused && v.selected);
        if (!pill.focused || !pill.selected) {
            return fail(`${name} with the page focused must focus the pill with its whole text selected; saw ${JSON.stringify(pill)}`);
        }
    }
    const before = await currentTab(app);
    await keyInPage(app, a, KEY.ctrlT);
    const opened = await settle(() => currentTab(app), v => v.tabId && v.tabId !== a && v.count === before.count + 1);
    if (!opened.tabId || opened.tabId === a || opened.count !== before.count + 1 || opened.url !== 'about:blank') {
        return fail(`Ctrl+T with the page focused must open one current tab on the empty page; before ${JSON.stringify(before)}, after ${JSON.stringify(opened)}`);
    }
    const pill = await settle(() => readPill(app), v => v.focused);
    if (!pill.focused) {
        return fail(`after Ctrl+T the pill input must have focus; saw ${JSON.stringify(pill)}`);
    }
    // Close the empty tab and open B from A, so A is the tab Theia returns to.
    await widgetCall(app, opened.tabId, 'close');
    await focusOverlay(app, a);
    const b = await openWebTab(app, otherSite(pages, '/kb'));
    if (await waitForPush(app, p => isState(b, false)(p) && String(p.url).endsWith('/kb')) < 0) {
        return fail('no loaded state push arrived for tab B');
    }
    await keyInPage(app, b, KEY.ctrlW);
    const after = await settle(() => currentTab(app), v => v.tabId === a);
    const gone = await probe(app, `return !get('WebTabChannel').widgetOf(${JSON.stringify(b)});`);
    if (gone !== true || after.tabId !== a) {
        return fail(`Ctrl+W in tab B's page must close B and make A current; B gone ${gone}, current ${JSON.stringify(after)}`);
    }
    const landed = await settle(() => chromeActiveTabId(app), v => v === a);
    if (landed !== a) {
        return fail(`after Ctrl+W focus must land in A's page; chrome's active overlay is ${JSON.stringify(landed)}`);
    }
}

async function pagePrevented({ app, pages, fail, results }) {
    const control = results.find(r => r.name === 'page-keys');
    if (!control || control.failures.length) {
        return 'not-scored';
    }
    const kp = otherSite(pages, '/kp');
    const setup = await tabThrough(app, [otherSite(pages, '/kp0'), kp]);
    if (setup.error) {
        return fail(setup.error);
    }
    const p = setup.tabId;
    const back = await settle(() => probe(app, `return get('WebTabChannel').widgetOf(${JSON.stringify(p)}).canGoBack;`), v => v === true);
    if (back !== true) {
        return fail(`${BROKEN} the preventing page has no history to go back to, so Alt+Left would mean nothing`);
    }
    let mark = pages.requests.length;
    await keyInPage(app, p, KEY.f5);
    await sleep(1500);
    const gets = pages.requests.slice(mark).filter(r => r.path === '/kp');
    if (gets.length) {
        return fail(`a page that consumed F5 was reloaded anyway (${gets.length} GET of /kp)`);
    }
    const pushMark = (await pushes(app)).length;
    await keyInPage(app, p, KEY.altLeft);
    await sleep(1500);
    const moved = (await pushes(app)).slice(pushMark).filter(x => x && x.kind === 'state' && x.tabId === p && x.url !== kp);
    if (moved.length) {
        return fail(`a page that consumed Alt+Left went back anyway, to ${JSON.stringify(moved[0].url)}`);
    }
    const before = await currentTab(app);
    await keyInPage(app, p, KEY.ctrlT);
    const opened = await settle(() => currentTab(app), v => v.count === before.count + 1 && v.tabId !== p);
    if (opened.count !== before.count + 1) {
        return fail(`Ctrl+T from a page that consumes every key must still open a tab; before ${JSON.stringify(before)}, after ${JSON.stringify(opened)}`);
    }
    // Ctrl+T left the new tab current, and a hidden overlay cannot take focus.
    await probe(app, `await get('ApplicationShell').activateWidget(get('WebTabChannel').widgetOf(${JSON.stringify(p)}).id); return true;`);
    if (await settle(() => focusOverlay(app, p), v => v === true) !== true) {
        return fail(`${BROKEN} the preventing page could not be made current and focused again`);
    }
    await keyInPage(app, p, KEY.ctrlW);
    const gone = await settle(() => probe(app, `return !get('WebTabChannel').widgetOf(${JSON.stringify(p)});`), v => v === true);
    if (gone !== true) {
        return fail('Ctrl+W from a page that consumes every key must still close it');
    }
}

async function tabKeys({ app, pages, plant, fail, note }) {
    const browsing = await probe(app, `
        for (const w of [...get('ApplicationShell').mainPanel.widgets()]) {
            if (w.id !== 'powerbrowser.modes.organising') { w.close(); }
        }
        await get('CommandRegistry').executeCommand(${JSON.stringify(MODES_ACTIVATE_COMMAND_ID)}, 'browsing');
        return await until(() => document.body.getAttribute('data-pb-mode') === 'browsing' && webTabs().length === 0, 10000);`);
    if (browsing !== true) {
        return fail(`${BROKEN} Browsing with no tabs could not be reached`);
    }
    const ids = [];
    for (const path of ['/t1', '/t2', '/t3']) {
        const id = await openWebTab(app, pages.url(path));
        if (await waitForPush(app, loadedAt(id, path)) < 0) {
            return fail(`no loaded state push arrived for ${path}`);
        }
        ids.push(id);
    }
    const name = id => (ids.indexOf(id) >= 0 ? `T${ids.indexOf(id) + 1}` : JSON.stringify(id));
    if (plant === 'tab-order-reversed') {
        const planted = await probe(app, `const strip = get('TabStripWidget');
            const original = strip.switchOrder.bind(strip);
            strip.switchOrder = anchor => original(anchor).slice().reverse();
            return true;`);
        if (planted === true) {
            note('PLANT tab-order-reversed applied');
        }
    }
    const strip = await probe(app, `const strip = get('TabStripWidget');
        return strip.switchOrder(get('WebTabChannel').widgetOf(${JSON.stringify(ids[0])})).map(w => w.tabId ?? w.id);`);
    if (!Array.isArray(strip) || strip.length !== 3) {
        return fail(`${BROKEN} the strip must list exactly the three tabs; it lists ${JSON.stringify(strip)}`);
    }
    // Only the current tab's overlay is shown, and a hidden one cannot take focus.
    const activate = id => probe(app, `await get('ApplicationShell').activateWidget(get('WebTabChannel').widgetOf(${JSON.stringify(id)}).id); return true;`);
    await activate(ids[0]);
    if (await settle(() => focusOverlay(app, ids[0]), v => v === true) !== true) {
        return fail(`${BROKEN} T1's page could not be focused`);
    }
    const steps = [
        ['Ctrl+Tab', KEY.ctrlTab, 1], ['Ctrl+Tab', KEY.ctrlTab, 2], ['Ctrl+Tab', KEY.ctrlTab, 0],
        ['Ctrl+Shift+Tab', KEY.ctrlShiftTab, 2], ['Ctrl+PageDown', KEY.ctrlPageDown, 0], ['Ctrl+PageUp', KEY.ctrlPageUp, 2],
        ['Alt+1', KEY.alt(1), 0], ['Alt+9', KEY.alt(9), 2],
    ];
    let from = ids[0];
    for (const [key, spec, want] of steps) {
        await keyInPage(app, from, spec);
        const target = ids[want];
        const current = await settle(() => currentTab(app), v => v.tabId === target);
        const active = await settle(() => chromeActiveTabId(app), v => v === target);
        if (current.tabId !== target || active !== target) {
            return fail(`${key} from ${name(from)}: expected ${name(target)}, got current ${name(current.tabId)} with focus in ${name(active)}`);
        }
        from = target;
    }
    // Alt+9 just moved to T3 (the control for this absence).
    await keyInPage(app, from, KEY.alt(5));
    await sleep(1000);
    const still = await currentTab(app);
    if (still.tabId !== from || await chromeActiveTabId(app) !== from) {
        return fail(`Alt+5 with three tabs must change nothing; current is ${name(still.tabId)}`);
    }
    const coding = await probe(app, `await get('CommandRegistry').executeCommand(${JSON.stringify(MODES_ACTIVATE_COMMAND_ID)}, 'coding');
        return await until(() => document.body.getAttribute('data-pb-mode') === 'coding', 10000);`);
    if (coding !== true) {
        return fail(`${BROKEN} Coding could not be activated`);
    }
    const bar = await probe(app, `const shell = get('ApplicationShell');
        const t1 = get('WebTabChannel').widgetOf(${JSON.stringify(ids[0])});
        return (shell.mainPanel.findTabBar(t1.title)?.titles ?? []).map(t => t.owner.tabId ?? t.owner.id);`);
    const at = Array.isArray(bar) ? bar.indexOf(ids[0]) : -1;
    if (at < 0 || bar.length < 2) {
        return fail(`${BROKEN} T1's tab bar in Coding lists ${JSON.stringify(bar)}`);
    }
    const want = bar[(at + 1) % bar.length];
    await activate(ids[0]);
    await settle(() => focusOverlay(app, ids[0]), v => v === true);
    await keyInPage(app, ids[0], KEY.ctrlTab);
    const current = await settle(() => currentTab(app), v => v.tabId === want);
    if (current.tabId !== want) {
        return fail(`Ctrl+Tab from T1 in Coding: expected ${name(want)} (T1's tab bar order), got ${name(current.tabId)}`);
    }
    await probe(app, `await get('CommandRegistry').executeCommand(${JSON.stringify(MODES_ACTIVATE_COMMAND_ID)}, 'browsing'); return true;`);
}

/**
 * WR-03: Coding, A in one pane and B alone in a split pane, B not Theia's
 * active widget and current only through a click into its page (markAsCurrent).
 * Ctrl+W in B's page must make A current and land focus in A's page.
 */
async function closeSplit({ app, pages, plant, fail, note }) {
    const coding = await probe(app, `await get('CommandRegistry').executeCommand(${JSON.stringify(MODES_ACTIVATE_COMMAND_ID)}, 'coding');
        return await until(() => document.body.getAttribute('data-pb-mode') === 'coding', 10000);`);
    if (coding !== true) {
        return fail(`${BROKEN} Coding could not be activated`);
    }
    try {
        const a = await openWebTab(app, pages.url('/s1'));
        const b = await openWebTab(app, pages.url('/s2'));
        if (await waitForPush(app, loadedAt(a, '/s1')) < 0 || await waitForPush(app, loadedAt(b, '/s2')) < 0) {
            return fail('no loaded state push arrived for /s1 and /s2');
        }
        const split = await probe(app, `const shell = get('ApplicationShell');
            const ch = get('WebTabChannel');
            const wa = ch.widgetOf(${JSON.stringify(a)});
            const wb = ch.widgetOf(${JSON.stringify(b)});
            shell.mainPanel.addWidget(wb, { mode: 'split-right', ref: wa });
            await shell.activateWidget(wa.id);
            const bar = shell.mainPanel.findTabBar(wb.title);
            // B must not be Theia's active widget: only the active one gets Theia's own close fallback.
            return { alone: !!bar && bar.titles.length === 1 && bar !== shell.mainPanel.findTabBar(wa.title), bActive: shell.activeWidget === wb };`);
        if (!split || split.alone !== true || split.bActive !== false) {
            return fail(`${BROKEN} B could not be put alone in a split pane without being Theia's active widget: ${JSON.stringify(split)}`);
        }
        if (plant === 'close-fallback-removed') {
            const replaced = await probe(app, `const relay = get('ChromeBarShortcutRelay');
                relay.closeTab = async tab => {
                    await relay.shell.closeWidget(tab.id);
                    const next = relay.shell.mainPanel.currentTitle?.owner;
                    if (next) await relay.switchTo(next, tab);
                };
                return true;`);
            if (replaced === true) {
                note('PLANT close-fallback-removed applied');
            }
        }
        await keyInPage(app, b, KEY.ctrlW);
        const after = await settle(() => currentTab(app), v => v.tabId === a);
        const gone = await probe(app, `return !get('WebTabChannel').widgetOf(${JSON.stringify(b)});`);
        if (gone !== true || after.tabId !== a) {
            return fail(`Ctrl+W on the only tab of a split pane must close it and make the other pane's tab current; B gone ${gone}, current ${JSON.stringify(after)}`);
        }
        const landed = await settle(() => chromeActiveTabId(app), v => v === a);
        if (landed !== a) {
            return fail(`after Ctrl+W on a split pane's only tab focus must land in A's page; chrome's active overlay is ${JSON.stringify(landed)}`);
        }
    } finally {
        await probe(app, `await get('CommandRegistry').executeCommand(${JSON.stringify(MODES_ACTIVATE_COMMAND_ID)}, 'browsing'); return true;`);
    }
}

async function focusKeys({ app, pages, fail, note }) {
    const tabId = await openWebTab(app, pages.url('/f6'));
    if (await waitForPush(app, loadedAt(tabId, '/f6')) < 0) {
        return fail('no loaded state push arrived for /f6');
    }
    for (const [name, spec, id] of [['F6', KEY.f6, 'focusAddressF6'], ['Shift+F6', KEY.shiftF6, 'focusAddressShiftF6']]) {
        const mark = (await pushes(app)).length;
        await keyInPage(app, tabId, spec);
        if (await waitForPush(app, p => p && p.kind === 'shortcut' && p.id === id && p.tabId === tabId, { from: mark, timeoutMs: 5000 }) < 0) {
            return fail(`${name} in a focused page produced no ${id} shortcut push (the reply listener did not relay it)`);
        }
        const pill = await settle(() => readPill(app), v => v.focused && v.selected);
        const onFrame = await settle(() => chromeOnTheiaFrame(app), v => v === true);
        if (!pill.focused || !pill.selected || onFrame !== true) {
            return fail(`${name} in a focused page must focus the pill with its whole text selected and chrome's focus on the Theia frame; pill ${JSON.stringify(pill)}, chrome on the Theia frame ${onFrame}`);
        }
        await pressKey(app, spec);
        const back = await settle(() => chromeActiveTabId(app), v => v === tabId);
        if (back !== tabId) {
            return fail(`${name} in the pill must put chrome's focus back on the page's overlay; chrome's active overlay is ${JSON.stringify(back)}`);
        }
    }
    note(`keys: ${keyRoute.last}`);
}

async function focusKeysPrevented({ app, pages, fail, results }) {
    const control = results.find(r => r.name === 'focus-keys');
    if (!control || control.failures.length) {
        return 'not-scored';
    }
    const tabId = await openWebTab(app, pages.url('/f6p'));
    if (await waitForPush(app, loadedAt(tabId, '/f6p')) < 0) {
        return fail('no loaded state push arrived for /f6p');
    }
    const mark = (await pushes(app)).length;
    await keyInPage(app, tabId, KEY.f6);
    await sleep(1500);
    const relayed = (await pushes(app)).slice(mark).filter(p => p && p.kind === 'shortcut');
    const active = await chromeActiveTabId(app);
    if (relayed.length || active !== tabId) {
        return fail(`a page that consumed F6 must keep it; shortcut pushes ${JSON.stringify(relayed)}, chrome's active overlay ${JSON.stringify(active)}`);
    }
}

/**
 * WR-02: during a running debug session @theia/debug binds F6 to Pause
 * (`inDebugMode`, enabled while the session state is Running) in Theia's
 * capture-phase dispatch, ahead of the pill's own keydown handler. The
 * pill-scoped passthrough binding must still let F6 in the pill reach the
 * page. The session is stood in for: inDebugMode set and the manager's state
 * read as Running (Pause then runs against no thread, a no-op).
 */
async function focusKeysDebug({ app, pages, plant, fail, note }) {
    const tabId = await openWebTab(app, pages.url('/f6'));
    if (await waitForPush(app, loadedAt(tabId, '/f6')) < 0) {
        return fail('no loaded state push arrived for /f6');
    }
    const mark = (await pushes(app)).length;
    await keyInPage(app, tabId, KEY.f6);
    if (await waitForPush(app, p => p && p.kind === 'shortcut' && p.id === 'focusAddressF6' && p.tabId === tabId, { from: mark, timeoutMs: 5000 }) < 0) {
        return fail(`${BROKEN} F6 in the page did not reach the pill, so there was no pill to press F6 in`);
    }
    if (!(await settle(() => readPill(app), v => v.focused)).focused) {
        return fail(`${BROKEN} the pill did not take focus after F6 in the page`);
    }
    const debugOn = await probe(app, `const keys = get('ContextKeyService');
        keys.setContext('inDebugMode', true);
        Object.defineProperty(get('DebugSessionManager'), 'state', { get: () => 2, configurable: true });
        return keys.match('inDebugMode') && get('CommandRegistry').isEnabled('workbench.action.debug.pause');`);
    try {
        if (debugOn !== true) {
            return fail(`${BROKEN} the stand-in debug session did not make the debugger's Pause command live (got ${JSON.stringify(debugOn)})`);
        }
        if (plant === 'pill-scope-removed') {
            const removed = await probe(app, `const w = get('ChromeBarWidget'); if (!w.addressScope) return false; w.addressScope.dispose(); w.addressScope = undefined; return true;`);
            if (removed === true) {
                note('PLANT pill-scope-removed applied');
            }
        }
        await pressKey(app, KEY.f6);
        const back = await settle(() => chromeActiveTabId(app), v => v === tabId);
        if (back !== tabId) {
            return fail(`F6 in the pill during a debug session must put chrome's focus back on the page's overlay (the debugger's F6 took it); chrome's active overlay is ${JSON.stringify(back)}`);
        }
    } finally {
        await probe(app, `get('ContextKeyService').setContext('inDebugMode', false); delete get('DebugSessionManager').state; return true;`);
    }
    note(`keys: ${keyRoute.last}`);
}

/** Dispatches a mouseover on `target` ('overlay' of `tabId`, or 'frame'), then an AppCommand `command` on the shell window. */
const appCommand = (app, tabId, target, command) => inChrome(app, `
    const el = ${JSON.stringify(target)} === 'frame' ? document.getElementById('powerbrowser-content') : overlayOf(${JSON.stringify(tabId)});
    if (!el) return false;
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    window.dispatchEvent(new CommandEvent('AppCommand', { command: ${JSON.stringify(command)}, bubbles: true, cancelable: true }));
    return true;`);

async function mouseButtons({ app, pages, plant, fail, note }) {
    const setup = await tabThrough(app, [pages.url('/m1'), pages.url('/m2')]);
    if (setup.error) {
        return fail(setup.error);
    }
    const tabId = setup.tabId;
    if (await settle(() => probe(app, `return get('WebTabChannel').widgetOf(${JSON.stringify(tabId)}).canGoBack;`), v => v === true) !== true) {
        return fail(`${BROKEN} the tab has no history to go back to`);
    }
    // A5 evidence only: does chrome see a trusted mouseover with the overlay as target?
    const a5Started = await inChrome(app, `const o = overlayOf(${JSON.stringify(tabId)}); if (!o) return 'no overlay';
        try {
            window.__pbA5 = null;
            window.__pbA5Rec = e => { if (e.isTrusted && W.tabIdOfBrowser(e.target) !== null) window.__pbA5 = true; };
            document.addEventListener('mouseover', window.__pbA5Rec, true);
            const r = o.getBoundingClientRect();
            window.synthesizeMouseEvent('mousemove', r.left + r.width / 2, r.top + r.height / 2);
            return true;
        } catch (e) { return 'threw ' + e; }`);
    await sleep(500);
    const a5 = await inChrome(app, `document.removeEventListener('mouseover', window.__pbA5Rec, true); return window.__pbA5;`);
    note(`A5 trusted mouseover on an overlay: ${a5Started === true ? JSON.stringify(a5) : a5Started}`);
    for (const [command, path, target] of [['Back', '/m1', 'overlay'], ['Forward', '/m2', 'overlay']]) {
        const mark = (await pushes(app)).length;
        // The plant: the pointer moves onto the Theia frame just before the first Back.
        const over = plant === 'hover-elsewhere' && command === 'Back' ? 'frame' : target;
        if (over !== target) {
            note('PLANT hover-elsewhere applied');
        }
        if (await appCommand(app, tabId, over, command) !== true) {
            return fail(`${BROKEN} the overlay of ${tabId} is missing`);
        }
        if (await waitForPush(app, p => isState(tabId, false)(p) && String(p.url).endsWith(path), { from: mark, timeoutMs: 5000 }) < 0) {
            return fail(`AppCommand ${command} over the page produced no push ending ${path}`);
        }
        await sleep(300);
    }
    const mark = (await pushes(app)).length;
    await appCommand(app, tabId, 'frame', 'Back');
    await sleep(1500);
    const moved = (await pushes(app)).slice(mark).filter(p => p && p.kind === 'state' && p.tabId === tabId && !String(p.url).endsWith('/m2'));
    if (moved.length) {
        return fail(`AppCommand Back with the pointer over the Theia frame navigated the page, to ${JSON.stringify(moved[0].url)}`);
    }
}

async function pillEsc({ app, pages, fail }) {
    const tabId = await openWebTab(app, pages.url('/slow-pill'));
    if (await waitForPush(app, isState(tabId, true)) < 0) {
        return fail('no state push with loading: true arrived for the slow page');
    }
    if (await focusTheiaFrame(app) !== true) {
        return fail(`${BROKEN} the Theia frame could not be made chrome's active element`);
    }
    await app.evaluate(`(() => { const i = document.querySelector('.pb-chrome-bar-input'); i.focus(); return true; })()`);
    const pill = await settle(() => readPill(app), v => v.focused);
    if (!pill.focused || pill.rows.length) {
        return fail(`${BROKEN} the pill must be focused with no dropdown before Escape; saw ${JSON.stringify(pill)}`);
    }
    const mark = (await pushes(app)).length;
    await pressKey(app, ESCAPE);
    if (await waitForPush(app, isState(tabId, false), { from: mark, timeoutMs: 5000 }) < 0) {
        return fail('Escape in the pill with nothing to close or restore did not stop the loading page (no loading: false push)');
    }
    const relayed = (await pushes(app)).slice(mark).filter(p => p && p.kind === 'shortcut');
    if (relayed.length) {
        return fail(`Escape in the pill must stop the load from the pill, not the chrome row; shortcut pushes ${JSON.stringify(relayed)}`);
    }
}

/** Presses `spec` with `focus()` re-established first; returns { recorded, pushed } for that press. */
async function keyInTheia(app, spec, focus) {
    await focus();
    const mark = (await pushes(app)).length;
    const keyMark = await app.evaluate('window.__pbKeys.length');
    await pressKey(app, spec);
    await sleep(250);
    const keys = JSON.parse(await app.evaluate(`JSON.stringify(window.__pbKeys.slice(${keyMark}))`));
    const recorded = keys.some(k => k.code === spec.code && k.ctrl === (spec.modifiers ?? []).includes('accel') && k.alt === (spec.modifiers ?? []).includes('alt'));
    const pushed = (await pushes(app)).slice(mark).filter(p => p && p.kind === 'shortcut');
    return { recorded, pushed };
}

async function theiaKeepsKeys({ app, fail, results }) {
    const control = results.find(r => r.name === 'page-keys');
    if (!control || control.failures.length) {
        return 'not-scored';
    }
    if (await focusTheiaFrame(app) !== true) {
        return fail(`${BROKEN} the Theia frame could not be made chrome's active element`);
    }
    await app.evaluate(`(() => {
        if (!window.__pbKeys) {
            window.__pbKeys = [];
            document.addEventListener('keydown', e => window.__pbKeys.push({ code: e.code, ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey }), true);
        }
        return true;
    })()`);
    const opened = await probe(app, `await get('CommandRegistry').executeCommand('workbench.action.files.newUntitledFile');
        return await until(() => !!get('EditorManager').currentEditor, 10000);`);
    if (opened !== true) {
        return fail(`${BROKEN} no untitled editor opened`);
    }
    const focusEditor = async () => {
        await focusTheiaFrame(app);
        await probe(app, `const ed = get('EditorManager').currentEditor; await get('ApplicationShell').activateWidget(ed.id); ed.editor.focus(); return true;`);
        const focused = await settle(() => probe(app, `return get('ContextKeyService').match('editorFocus');`), v => v === true);
        if (focused !== true) {
            const seen = await probe(app, `const ed = get('EditorManager').currentEditor; return { active: document.activeElement?.className ?? null, visible: ed?.isVisible ?? null, editor: ed?.id ?? null, hasFocus: document.hasFocus() };`);
            throw new Error(`${BROKEN} the untitled editor could not be focused (editorFocus false; ${JSON.stringify(seen)})`);
        }
    };
    const editorKeys = [['F5', KEY.f5], ['F6', KEY.f6], ['F11', KEY.f11], ['Ctrl+P', KEY.ctrlP], ['Ctrl+K', KEY.ctrlK],
        ['Ctrl+Tab', KEY.ctrlTab], ['Alt+Left', KEY.altLeft], ['Ctrl+R', KEY.ctrlR], ['Ctrl+L', KEY.ctrlL]];
    for (const [name, spec] of editorKeys) {
        const { recorded, pushed } = await keyInTheia(app, spec, focusEditor);
        if (!recorded || pushed.length) {
            return fail(`${name} in an editor must reach the Theia frame with no shortcut push; recorded ${recorded}, pushes ${JSON.stringify(pushed)}`);
        }
        if (name === 'Ctrl+L' && (await readPill(app)).focused) {
            return fail('Ctrl+L in an editor focused the pill');
        }
        await pressKey(app, ESCAPE);
        await sleep(200);
    }
    await probe(app, `get('EditorManager').currentEditor?.close(); return true;`);
    const term = await probe(app, `await get('CommandRegistry').executeCommand('terminal:new');
        return await until(() => get('ContextKeyService').match('terminalFocus'), 15000);`);
    if (term !== true) {
        return fail(`${BROKEN} the new terminal never took focus (terminalFocus false)`);
    }
    const focusTerminal = async () => {
        await focusTheiaFrame(app);
        await probe(app, `const t = get('ApplicationShell').currentWidget; t?.activate?.(); return true;`);
        const focused = await settle(() => probe(app, `return get('ContextKeyService').match('terminalFocus');`), v => v === true);
        if (focused !== true) {
            throw new Error(`${BROKEN} the terminal could not be focused (terminalFocus false)`);
        }
    };
    for (const [name, spec] of [['Ctrl+R', KEY.ctrlR], ['Ctrl+W', KEY.ctrlW]]) {
        const { recorded, pushed } = await keyInTheia(app, spec, focusTerminal);
        if (!recorded || pushed.length) {
            return fail(`${name} in a terminal must reach the Theia frame with no shortcut push; recorded ${recorded}, pushes ${JSON.stringify(pushed)}`);
        }
    }
    await probe(app, `const t = get('ApplicationShell').currentWidget; if (t && /terminal/i.test(t.id)) { t.dispose(); } return true;`);
    // Positive control for the Ctrl+L absence: outside an editor and a terminal it focuses the pill.
    await focusTheiaFrame(app);
    await app.evaluate(`(() => { document.activeElement?.blur?.(); return true; })()`);
    const plain = await settle(() => probe(app, `const c = get('ContextKeyService'); return !c.match('editorFocus') && !c.match('terminalFocus');`), v => v === true);
    if (plain !== true) {
        return fail(`${BROKEN} focus could not be moved outside an editor and a terminal`);
    }
    await pressKey(app, KEY.ctrlL);
    const pill = await settle(() => readPill(app), v => v.focused);
    if (!pill.focused) {
        return fail(`${BROKEN} the positive control failed: Ctrl+L outside an editor and a terminal did not focus the pill`);
    }
}

const PAGE_FOCUS_KEY = sourceConst('theia/extensions/chrome-bar/src/browser/chrome-bar-shortcuts.ts', 'PAGE_FOCUS_CONTEXT_KEY');
const pageFocusKey = app => probe(app, `return get('ContextKeyService').match(${JSON.stringify(PAGE_FOCUS_KEY)});`);

async function pageFocusReload({ app, pages, fail }) {
    const a = await openWebTab(app, pages.url('/pf1'));
    if (await waitForPush(app, loadedAt(a, '/pf1')) < 0) {
        return fail('no loaded state push arrived for /pf1');
    }
    if (await focusOverlay(app, a) !== true || await settle(() => pageFocusKey(app), v => v === true) !== true) {
        return fail(`${BROKEN} the page-focus key never turned true with a page focused before the reload`);
    }
    await app.evaluate('(() => { setTimeout(() => location.reload(), 50); return true; })()');
    await sleep(2000);
    await pollFor(() => probe(app, `return get('FrontendApplicationStateService').state === 'ready';`).then(v => v === true, () => false), 90000, 'the reloaded frontend');
    await installPushRecorder(app);
    if (await pageFocusKey(app) !== false) {
        return fail('the reloaded frontend started with the page-focus key true');
    }
    const b = await openWebTab(app, pages.url('/pf2'));
    if (await waitForPush(app, loadedAt(b, '/pf2')) < 0) {
        return fail('no loaded state push arrived for /pf2 after the reload');
    }
    if (await focusOverlay(app, b) !== true) {
        return fail(`${BROKEN} the new frontend's page could not be focused`);
    }
    if (await settle(() => pageFocusKey(app), v => v === true) !== true) {
        return fail('after a frontend reload, focusing a page left the page-focus key false');
    }
    await focusTheiaFrame(app);
    if (await settle(() => pageFocusKey(app), v => v === false) !== false) {
        return fail('after a frontend reload, focusing the Theia frame left the page-focus key true');
    }
}

// The reload scenarios run first, on the session's first web tabs: a reload of a
// tab that shares a content process with an earlier same-site tab (Firefox's
// webIsolated process count is 4) is switched to remoteType "web" at
// about:blank, a GUI-02 defect independent of the flag under test
// (27-02-SUMMARY, deferred-items.md). Run later, it would score that defect.
// NAV-05: the tooltip text each button must show, derived from BUTTON_SHORTCUTS and PAGE_SHORTCUTS with the gate's formatter.
const TOOLTIPS = Object.fromEntries(buttonShortcuts().map(b => [b.button, { verb: b.verb, text: formatTooltip(b.verb, b.rows[0]) }]));

/**
 * Hovers the nav button labelled `label` (a pointerover: React builds
 * onPointerEnter from it) and reads the tooltip once HoverService shows it,
 * with the button's box and the web tab placeholder's box while it is visible.
 */
const readTooltip = (app, label, tabId) => probe(app, `
    const button = ${navButtonExpr(label)};
    if (!button) return { missing: true };
    get('HoverService').cancelHover();
    button.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    const shown = () => [...document.querySelectorAll('.theia-hover')].find(h => h.matches(':popover-open') && !h.style.visibility);
    if (!(await until(() => !!shown(), 5000))) return { shown: false, disabled: button.disabled };
    const box = el => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; };
    const hover = shown();
    const cs = getComputedStyle(hover);
    const widget = get('WebTabChannel').widgetOf(${JSON.stringify(tabId)});
    return {
        shown: true,
        text: hover.textContent,
        ours: hover.classList.contains('pb-chrome-bar-hover'),
        lines: Math.round((hover.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)) / parseFloat(cs.lineHeight)),
        hover: box(hover),
        button: box(button),
        page: widget && widget.isVisible ? box(widget.node) : null,
        disabled: button.disabled,
    };`);

/** Fails unless the `button` tooltip, hovered on `label`, reads the table text above the button and clear of the page. */
async function checkTooltip(app, fail, { button, label, tabId, where }) {
    const want = TOOLTIPS[button]?.text;
    if (!want) {
        return fail(`${BROKEN} no tooltip text derived for ${button} from BUTTON_SHORTCUTS`);
    }
    const seen = await readTooltip(app, label ?? TOOLTIPS[button].verb, tabId);
    if (seen.missing) {
        return fail(`${BROKEN} ${where}: no nav button labelled ${JSON.stringify(label ?? TOOLTIPS[button].verb)}`);
    }
    if (!seen.shown) {
        return fail(`${where}: hovering ${button} (disabled ${seen.disabled}) showed no tooltip within 5 s`);
    }
    const { hover, page } = seen;
    if (seen.text !== want || !seen.ours || seen.lines !== 1) {
        return fail(`${where}: ${button}'s tooltip must read ${JSON.stringify(want)} on one line with the chrome-bar hover class; saw ${JSON.stringify({ text: seen.text, ours: seen.ours, lines: seen.lines })}`);
    }
    if (page && !(hover.bottom <= page.top || hover.top >= page.bottom || hover.right <= page.left || hover.left >= page.right)) {
        return fail(`${where}: ${button}'s tooltip box intersects the page rect: tooltip ${JSON.stringify(hover)}, page ${JSON.stringify(page)}`);
    }
    // Organising puts the bar at the window's top edge, so HoverService flips the
    // hover below it, onto the toolbar row between the bar and the page.
    const roomAbove = seen.button.top >= hover.bottom - hover.top + 5;
    if (roomAbove && hover.bottom > seen.button.top) {
        return fail(`${where}: ${button}'s tooltip bottom ${hover.bottom} is below the button's top ${seen.button.top} (it is not above the bar)`);
    }
    if (!roomAbove && hover.top < seen.button.bottom) {
        return fail(`${where}: with no room above the bar, ${button}'s tooltip top ${hover.top} must be below the button's bottom ${seen.button.bottom}`);
    }
    return seen;
}

async function tooltips({ app, pages, fail }) {
    const coding = await probe(app, `await get('CommandRegistry').executeCommand(${JSON.stringify(MODES_ACTIVATE_COMMAND_ID)}, 'coding');
        return await until(() => document.body.getAttribute('data-pb-mode') === 'coding', 10000);`);
    if (coding !== true) {
        return fail(`${BROKEN} Coding could not be reached`);
    }
    const tabId = await openWebTab(app, pages.url('/tip'));
    if (await waitForPush(app, loadedAt(tabId, '/tip')) < 0) {
        return fail('no loaded state push arrived for /tip');
    }
    const seen = await checkTooltip(app, fail, { button: 'back', tabId, where: 'Coding' });
    if (seen && !seen.page) {
        return fail(`${BROKEN} the web tab's placeholder is not visible, so the page-rect check proved nothing`);
    }
}

const makeCurrent = (app, tabId) => probe(app, `const shell = get('ApplicationShell');
    const w = get('WebTabChannel').widgetOf(${JSON.stringify(tabId)});
    await shell.activateWidget(w.id);
    return await until(() => shell.mainPanel.currentTitle?.owner === w && w.isVisible, 5000);`);

async function tooltipsAll({ app, pages, plant, fail, note }) {
    if (await setPref(app, 'browser.showHomeButton', true) !== true) {
        return fail(`${BROKEN} browser.showHomeButton could not be set to true`);
    }
    try {
        await tooltipModes({ app, pages, plant, fail, note });
    } finally {
        // Later scenarios expect Coding: Organising opens a web tab behind its own widget.
        await probe(app, `await get('CommandRegistry').executeCommand(${JSON.stringify(MODES_ACTIVATE_COMMAND_ID)}, 'coding'); return true;`);
    }
}

async function tooltipModes({ app, pages, plant, fail, note }) {
    if (plant === 'hover-below') {
        const planted = await probe(app, `const hover = get('HoverService');
            const original = hover.requestHover.bind(hover);
            hover.requestHover = request => original({ ...request, position: 'bottom' });
            return true;`);
        if (planted === true) {
            note('PLANT hover-below applied');
        }
    }
    const disabledShown = new Set();
    modes: for (const mode of ['coding', 'browsing', 'organising']) {
        const reached = await probe(app, `await get('CommandRegistry').executeCommand(${JSON.stringify(MODES_ACTIVATE_COMMAND_ID)}, ${JSON.stringify(mode)});
            return await until(() => document.body.getAttribute('data-pb-mode') === ${JSON.stringify(mode)}, 10000);`);
        if (reached !== true) {
            return fail(`${BROKEN} mode ${mode} could not be reached`);
        }
        // Earlier tabs closed first: a fifth same-site tab sharing a content process
        // can blank (deferred-items.md), which would enable Back on a fresh tab.
        if (await probe(app, `for (const w of webTabs()) { w.close(); } return await until(() => webTabs().length === 0, 10000);`) !== true) {
            return fail(`${BROKEN} ${mode}: the earlier web tabs could not be closed`);
        }
        const tabId = await openWebTab(app, pages.url(`/tip-${mode}`));
        if (await waitForPush(app, loadedAt(tabId, `/tip-${mode}`)) < 0) {
            return fail(`${mode}: no loaded state push arrived for /tip-${mode}`);
        }
        // Organising opens a web tab behind its own widget; make it current there too.
        if (await makeCurrent(app, tabId) !== true) {
            return fail(`${BROKEN} ${mode}: the web tab could not be made current`);
        }
        let pageSeen = false;
        const states = [];
        for (const [button, label, disabled] of [['back', 'Back', true], ['forward', 'Forward', true], ['reload', 'Reload', false], ['home', 'Home', false], ['newTab', 'New Tab', false]]) {
            const seen = await checkTooltip(app, fail, { button, label, tabId, where: mode });
            if (!seen) {
                continue modes;
            }
            if (disabled && seen.disabled === true) {
                disabledShown.add(button);
            }
            states.push(`${label} ${seen.disabled ? 'disabled' : 'enabled'}`);
            pageSeen ||= !!seen.page;
        }
        const slowId = await openWebTab(app, pages.url(`/slow-tip-${mode}`));
        if (await waitForPush(app, isState(slowId, true)) < 0) {
            return fail(`${mode}: no state push with loading: true arrived for the slow page`);
        }
        if (await makeCurrent(app, slowId) !== true) {
            return fail(`${BROKEN} ${mode}: the slow web tab could not be made current`);
        }
        if (await settle(() => app.evaluate(`!!${navButtonExpr('Stop')}`), v => v === true) !== true) {
            return fail(`${BROKEN} ${mode}: the bar never showed Stop for the loading page`);
        }
        const stop = await checkTooltip(app, fail, { button: 'stop', label: 'Stop', tabId: slowId, where: mode });
        await widgetCall(app, slowId, 'stop');
        if (!stop) {
            continue;
        }
        note(`${mode}: tooltips clear of the page rect (${pageSeen || stop.page ? 'visible' : 'not visible'}); ${states.join(', ')}`);
    }
    // Disabled keeps its tooltip: Back and Forward are disabled on a fresh tab, at least in Coding and Browsing.
    for (const button of ['back', 'forward']) {
        if (!disabledShown.has(button)) {
            fail(`${BROKEN} ${button} was never hovered while disabled, so disabled-keeps-tooltip went unchecked`);
        }
    }
}

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
    'page-keys': pageKeys,
    'page-prevented': pagePrevented,
    'tab-keys': tabKeys,
    'close-split': closeSplit,
    'focus-keys': focusKeys,
    'focus-keys-prevented': focusKeysPrevented,
    'focus-keys-debug': focusKeysDebug,
    'mouse-buttons': mouseButtons,
    'pill-esc': pillEsc,
    'theia-keeps-keys': theiaKeepsKeys,
    tooltips,
    'tooltips-all': tooltipsAll,
    'page-focus-reload': pageFocusReload,
};

/** The scenario each not-scored-capable scenario takes as its positive control. */
const CONTROL_OF = { 'theia-keeps-esc': 'esc-stop', 'page-prevented': 'page-keys', 'focus-keys-prevented': 'focus-keys', 'theia-keeps-keys': 'page-keys' };

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
    // Registry order, whatever order was asked for: it is load-bearing (the
    // reload scenarios first, theia-keeps-esc after its control).
    return Object.keys(SCENARIOS).filter(n => names.includes(n));
}

const PLANTS = [
    { plant: 'second-stop-element', target: 'stop-button', run: ['stop-button'], expect: 'exactly one' },
    { plant: 'row-enabled-under-theia', target: 'theia-keeps-esc', run: ['esc-stop', 'theia-keeps-esc'], expect: 'while the Theia frame had focus' },
    { plant: 'relay-row-removed', target: 'esc-stop', run: ['esc-stop'], expect: 'loading: false' },
    { plant: 'tab-order-reversed', target: 'tab-keys', run: ['tab-keys'], expect: 'expected T2' },
    { plant: 'hover-elsewhere', target: 'mouse-buttons', run: ['mouse-buttons'], expect: '/m1' },
    { plant: 'close-fallback-removed', target: 'close-split', run: ['close-split'], expect: "the other pane's tab current" },
    { plant: 'pill-scope-removed', target: 'focus-keys-debug', run: ['focus-keys-debug'], expect: "the debugger's F6 took it" },
    { plant: 'hover-below', target: 'tooltips-all', run: ['tooltips-all'], expect: 'intersects' },
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
