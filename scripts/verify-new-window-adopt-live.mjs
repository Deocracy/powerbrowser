#!/usr/bin/env node
/**
 * Phase 36 (PROMPT-05): the live check for a page's new windows, driven in the
 * built shell over WebDriver BiDi. A target=_blank click or a page's
 * window.open lands as a web tab directly after its opener (chrome's
 * browserDOMWindow receiver builds a pending overlay, pushes adoptTab, the
 * frontend mints the widget and acks webTabAdopt); window.open with popup
 * features stays a stock popup window; no ack in time sends the page to the
 * stock window; a bad scheme opens nothing.
 *
 * One session runs the selected scenarios in order and prints one line per
 * scenario: `<scenario>: PASS` or `<scenario>: FAIL -- <reason>`. A thrown
 * error is `harness: <message>` (the check could not drive the product). A
 * missing built binary is a harness line, never a crash.
 *
 * Instruments, all read in the same session (CLAUDE.md verification rule 1):
 *   - the push recorder in the Theia frame (scripts/lib/pb-live-probe.mjs):
 *     every adoptTab / dropAdoptedTab / state push, in order;
 *   - the BiDi browsing-context tree: content contexts (the opener and adopted
 *     pages, a stock tab) and chrome contexts (shell windows are the ones on
 *     the shell document; stock windows are the others holding a gBrowser);
 *   - Theia's strip and current title, read through page-realm probes;
 *   - chrome's active element and selection (PowerBrowserWebTabs);
 *   - a recorder wrapped around the receiver's two InFrame members in the
 *     shell window: which member Gecko called, for which URI, and whether it
 *     returned an element.
 * Clicks are trusted BiDi pointer input on the page's own context: a
 * script-dispatched click carries no user activation and a page's
 * window.open from it would be popup-blocked.
 *
 * Scenarios (registry order; a scenario whose absence assertion leans on a
 * positive control pulls that control into the session):
 *   adopt-order        Two tabs A (/opener) and B. A _blank click in A gives
 *                      one adoptTab push with openerTabId A and a tab directly
 *                      after A; the shell-window count stays 1 and no stock
 *                      window opens; the same for A's window.open button;
 *                      closing the adopted tab reselects A (Theia's own
 *                      close-reselect, application-shell.js). This is the
 *                      positive control for every absence leg below.
 *   adopt-opener       A window.open'ed adopted page has a non-null
 *                      window.opener and a postMessage round trip completes:
 *                      adopted -> opener, then opener -> adopted.
 *   adopt-popup        window.open with width/height opens a NEW stock popup
 *                      window holding the URL and no adoptTab push or web tab.
 *   adopt-focus        A background adopt (the openLinkIn path stock
 *                      middle-click takes) leaves A current and chrome-focused;
 *                      a foreground window.open makes the new tab current.
 *   adopt-fallback     With the frontend's ack dropped for one push, the page
 *                      reaches a stock window within chrome's ack timer plus a
 *                      margin (waited on the context tree, never a fixed
 *                      sleep), and no web tab or overlay keeps it.
 *   adopt-scheme       The adopt path answers refused-scheme for a javascript:
 *                      URL; a javascript: _blank link in A gives no adoptTab
 *                      push, no web tab and no overlay from the receiver (its
 *                      null hands the page to Gecko's own window), and A stays
 *                      on its page.
 *   adopt-unknown-key  An ack for pc-999999 replies unknown-tab, chrome pushes
 *                      dropAdoptedTab for the widget, and the widget is disposed.
 *
 * What each red line names (the --self-test expectations are these words):
 *   adopt-order: FAIL -- the adopted tab is not directly after its opener ...
 *   adopt-order: FAIL -- closing the adopted tab selected ..., not its opener ...
 *   adopt-opener: FAIL -- the adopted tab's window.opener is null ...
 *   adopt-popup: FAIL -- window.open with popup features opened no stock window ...
 *   adopt-focus: FAIL -- a background adopt must leave the opener current (opener keeps focus) ...
 *   adopt-fallback: FAIL -- with the ack dropped no stock window took ... (the navigation was swallowed)
 *   adopt-scheme: FAIL -- the adopt path did not answer refused-scheme ...
 *   adopt-unknown-key: FAIL -- the orphan widget ... was not dropped ...
 *
 * Usage:
 *   node scripts/verify-new-window-adopt-live.mjs [--scenario a,b]
 *   node scripts/verify-new-window-adopt-live.mjs --self-test
 *
 * --self-test runs a clean control session over every scenario (must be
 * green), then one session per planted fault, scored only on the scenario the
 * plant targets: it must print a FAIL naming the expected text, and a plant
 * whose mutation did not apply fails the self-test. Plants live in the
 * running session only (page-realm or chrome-scope patches, one pref); the
 * tree is never written.
 *
 * Needs the built browser and the last Theia app build; not a --quick check.
 * Node built-ins plus scripts/lib only.
 */

import {
    BROKEN,
    chromeActiveTabId,
    focusOverlay,
    inChrome,
    loadedAt,
    makeCurrent,
    openWebTab,
    overlayVisibility,
    pushes,
    serveNavPages,
    waitForPush,
    withProbeShell,
} from './lib/pb-live-probe.mjs';
import { pollFor, probe, SHELL_DOCUMENT_URL, sourceMatch } from './lib/pb-relaunch.mjs';

const NAME = 'verify-new-window-adopt-live';
const J = JSON.stringify;

// Chrome's ack deadline, derived from the tree: the fallback leg waits this plus a margin for the stock window.
const ADOPT_ACK_TIMEOUT_MS = Number(sourceMatch('powerbrowser/shell/PowerBrowserAPI.sys.mjs', /const ADOPT_ACK_TIMEOUT_MS = (\d+);/));
// openStockTab may have to start a stock window (delayed startup) after the timer fires.
const FALLBACK_MARGIN_MS = 10000;
// How long an absence leg lets a wrong outcome arrive before it reads. Below the 5 s timer on purpose.
const QUIET_MS = 3000;
const UNKNOWN_PC_KEY = 'pc-999999';

const BLOCK = 'position:absolute;left:10px;width:200px;height:30px;display:block';
const PAGES = {
    // Every control is set by the harness before a click (window.__pbNext, the link hrefs), so one page serves every leg.
    '/opener': {
        title: 'Adopt Opener',
        body: `<a id="blank" target="_blank" href="/target" style="${BLOCK};top:10px">blank link</a>`
            + `<button id="open" style="${BLOCK};top:60px" onclick="window.__pbOpened = !!window.open(window.__pbNext || '/target')">open</button>`
            + `<button id="popup" style="${BLOCK};top:110px" onclick="window.__pbOpened = !!window.open(window.__pbNext || '/target', 'pbpopup', 'width=400,height=300')">popup</button>`
            + `<a id="js" target="_blank" href="javascript:void(0)" style="${BLOCK};top:160px">js link</a>`
            + '<script>addEventListener("message", e => { if (typeof e.data === "string" && e.data.startsWith("ping:")) {'
            + ' window.__pbPinged = e.data; e.source.postMessage("pong:" + e.data.slice(5), "*"); } });</script>',
    },
    '/target': { title: 'Adopt Target', body: '<p>target</p>' },
};

// ---------------------------------------------------------------------------
// Instruments
// ---------------------------------------------------------------------------

/** Shell windows open now: chrome contexts on the shell document. */
const shellWindows = async app => (await app.contexts('chrome')).filter(entry => entry.url === SHELL_DOCUMENT_URL).length;

/** Stock browser windows open now: every other chrome context that holds a gBrowser. */
async function stockWindows(app) {
    const ids = [];
    for (const entry of (await app.contexts('chrome')).filter(e => e.url !== SHELL_DOCUMENT_URL)) {
        const holds = await app.evaluateIn(entry.context, "typeof gBrowser === 'object' && !!gBrowser").catch(() => false);
        if (holds === true) {
            ids.push(entry.context);
        }
    }
    return ids;
}

/**
 * A stock window whose tabbrowser holds the only content context on `url`,
 * waited on the context tree; null when none appears within `timeoutMs`.
 * Same instrument as pb-relaunch.mjs stockTabOn, returning the window too.
 */
async function stockWindowOn(app, url, timeoutMs) {
    try {
        return await pollFor(async () => {
            const onUrl = (await app.contexts()).filter(entry => entry.url === url);
            if (onUrl.length !== 1) {
                return undefined;
            }
            for (const entry of (await app.contexts('chrome')).filter(e => e.url !== SHELL_DOCUMENT_URL)) {
                const holds = await app.evaluateIn(entry.context,
                    `typeof gBrowser === 'object' && gBrowser.browsers.some(b => b.currentURI.spec === ${J(url)})`).catch(() => false);
                if (holds === true) {
                    return { window: entry.context, content: onUrl[0].context };
                }
            }
            return undefined;
        }, timeoutMs, `a stock window holding ${url}`);
    } catch {
        return null;
    }
}

/** The one content context on `url`, waited for. */
const contextOn = (app, url, timeoutMs = 15000) => pollFor(async () => {
    const onUrl = (await app.contexts()).filter(entry => entry.url === url);
    return onUrl.length === 1 ? onUrl[0].context : undefined;
}, timeoutMs, `the one page context on ${url}`);

/** The first adoptTab push for `url` at or after `mark`, or null. */
async function awaitAdopt(app, url, mark, timeoutMs = 15000) {
    const i = await waitForPush(app, p => p && p.kind === 'adoptTab' && p.url === url, { from: mark, timeoutMs });
    return i < 0 ? null : (await pushes(app))[i];
}

/** adoptTab pushes recorded since `mark`. */
const adoptsSince = async (app, mark) => (await pushes(app)).slice(mark).filter(p => p && p.kind === 'adoptTab');

/** The tab id of the attached web tab on `url`, waited for; null when none attaches. */
const attachedTabOn = (app, url, timeoutMs = 10000) => probe(app, `
    const on = () => webTabs().find(w => w.url === ${J(url)} && w.isAttached);
    return await until(() => !!on(), ${timeoutMs}) ? on().tabId : null;`);

/** Web tabs (attached or not) the channel holds on `url`. */
const webTabsOn = (app, url) => probe(app, `
    return webTabs().filter(w => w.url === ${J(url)}).map(w => w.tabId);`);

/** The strip `tabId` sits in (tab ids in order) and the current tab. */
const strip = (app, tabId) => probe(app, `
    const shell = get('ApplicationShell');
    const w = get('WebTabChannel').widgetOf(${J(tabId)});
    if (!w) return null;
    const titles = shell.mainPanel.findTabBar(w.title)?.titles ?? [];
    return { order: titles.map(t => t.owner?.tabId ?? t.owner?.id ?? '?'), current: shell.mainPanel.currentTitle?.owner?.tabId ?? null };`);

/** The current main-area tab id, or null. */
const currentTabId = app => probe(app, `return get('ApplicationShell').mainPanel.currentTitle?.owner?.tabId ?? null;`);

/** Waits until the current tab is `want` (bounded); returns what it last saw. */
async function waitCurrent(app, want, timeoutMs = 5000) {
    let seen = null;
    try {
        await pollFor(async () => (seen = await currentTabId(app)) === want, timeoutMs, `${want} to be current`);
    } catch {
        // judged by the caller on `seen`
    }
    return seen;
}

/** Chrome's recorded selection for the shell's frontend. */
const chromeSelectedTabId = async app =>
    JSON.parse(await inChrome(app, "return JSON.stringify(W.activeTabIdOf(document.getElementById('powerbrowser-content')));"));

/**
 * Wraps the receiver's two InFrame members in the shell window with a
 * recorder (member, URI, where, element-or-null), once per session. A plant
 * flag (window.__pbPlantInFrame) strips the opener's window info on the way
 * in. Throws when the receiver is missing or the wrap did not take: without it
 * the scheme leg cannot say what Gecko asked.
 */
async function installReceiverRecorder(app) {
    // window.browserDOMWindow reads back as an XPConnect wrapper with read-only native members; wrappedJSObject is the
    // receiver object installNewWindowReceivers assigned, whose members Gecko looks up on every call.
    const state = await inChrome(app, `
        const r = window.browserDOMWindow?.wrappedJSObject;
        if (!r || typeof r.createContentWindowInFrame !== 'function') return 'no receiver on the shell window';
        if (!window.__pbInFrame) {
            window.__pbInFrame = [];
            for (const member of ['createContentWindowInFrame', 'openURIInFrame']) {
                const original = r[member];
                const wrapped = function (aURI, params, aWhere, aFlags, aName) {
                    let p = params;
                    if (window.__pbPlantInFrame === 'opener-null') {
                        window.__pbPlantRan = true;
                        p = { openerBrowser: params.openerBrowser, openWindowInfo: null };
                    }
                    const out = original.call(this, aURI, p, aWhere, aFlags, aName);
                    window.__pbInFrame.push({ member, spec: aURI ? aURI.spec : null, where: aWhere, returned: out ? 'element' : 'null' });
                    return out;
                };
                wrapped.__pbRecorder = true;
                r[member] = wrapped;
            }
        }
        return r.createContentWindowInFrame.__pbRecorder === true ? 'ok' : 'the receiver did not take the recorder';`);
    if (state !== 'ok') {
        throw new Error(`the receiver recorder could not be installed: ${state}`);
    }
}

const receiverCalls = async app => JSON.parse(await inChrome(app, 'return JSON.stringify(window.__pbInFrame || []);'));

/** Whether a plant's patch actually ran: `where` is 'page' (the Theia frame) or 'chrome' (the shell window). */
const plantRan = async (app, where) => (where === 'page'
    ? await app.evaluate('window.__pbPlantRan === true')
    : await inChrome(app, 'return window.__pbPlantRan === true;')) === true;

// ---------------------------------------------------------------------------
// Driving the opener page
// ---------------------------------------------------------------------------

/** Opens tab A on /opener?s=<scenario>, waits for its load and makes it current. */
async function openerTab(app, pages, scenario) {
    const path = `/opener?s=${scenario}`;
    const url = pages.url(path);
    const tabId = await openWebTab(app, url);
    if (await waitForPush(app, loadedAt(tabId, path)) < 0) {
        throw new Error(`the opener page never loaded in tab ${tabId}`);
    }
    await makeCurrent(app, tabId);
    return { tabId, url, ctx: await contextOn(app, url) };
}

/** Points every control of the opener page at `path`. */
const aimAt = (app, opener, path) => app.evaluateIn(opener.ctx, `(() => {
    window.__pbNext = ${J(path)};
    document.getElementById('blank').href = ${J(path)};
    return true;
})()`);

/** A trusted pointer click on `selector` in the opener's page, with the opener current and shown. */
async function clickIn(app, opener, selector, button = 0) {
    await makeCurrent(app, opener.tabId);
    await pollFor(async () => await overlayVisibility(app, opener.tabId) === 'visible', 5000, 'the opener page to be shown');
    const at = JSON.parse(await app.evaluateIn(opener.ctx, `JSON.stringify((() => {
        const r = document.querySelector(${J(selector)})?.getBoundingClientRect();
        return r ? { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) } : null;
    })())`));
    if (!at) {
        throw new Error(`the opener page has no ${selector}`);
    }
    await app.send('input.performActions', {
        context: opener.ctx,
        actions: [{
            type: 'pointer', id: 'pb-adopt-mouse', parameters: { pointerType: 'mouse' },
            actions: [{ type: 'pointerMove', x: at.x, y: at.y }, { type: 'pointerDown', button }, { type: 'pointerUp', button }],
        }],
    });
    await app.send('input.releaseActions', { context: opener.ctx });
}

/** One adopt from the opener: aims, clicks, waits for the push and the attached tab. */
async function adoptFrom(app, pages, opener, selector, path) {
    const url = pages.url(path);
    await aimAt(app, opener, path);
    const mark = (await pushes(app)).length;
    await clickIn(app, opener, selector);
    const push = await awaitAdopt(app, url, mark);
    if (!push) {
        return { error: `the ${selector} control in the opener gave no adoptTab push for ${path}` };
    }
    if (push.openerTabId !== opener.tabId) {
        return { error: `the adoptTab push for ${path} named opener ${J(push.openerTabId)}, not ${opener.tabId}` };
    }
    const tabId = await attachedTabOn(app, url);
    if (!tabId) {
        return { error: `the adoptTab push for ${path} arrived but no web tab attached on it` };
    }
    return { url, push, tabId, mark };
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

async function adoptOrder({ app, pages, plant, fail, note }) {
    const a = await openerTab(app, pages, 'order');
    const b = await openWebTab(app, pages.url('/target?s=order-b'));
    if (await waitForPush(app, loadedAt(b, '/target?s=order-b')) < 0) {
        return fail(`${BROKEN} tab B never loaded`);
    }
    const shellsBefore = await shellWindows(app);
    const stocksBefore = await stockWindows(app);
    if (shellsBefore !== 1) {
        return fail(`${BROKEN} expected one shell window before any adopt, saw ${shellsBefore}`);
    }
    if (plant === 'adopt-append-at-end') {
        // Not an unknown opener: Theia's addWidget with no ref lands after the current tab, which is A at the click.
        // B is the strip's last tab, so naming it as the opener puts the adopted tab at the end.
        await probe(app, `const h = get('WebTabOpenHandler'); const original = h.adopt;
            h.adopt = function (d) { window.__pbPlantRan = true; return original.call(h, { ...d, openerTabId: ${J(b)} }); };
            return true;`);
    }
    for (const [selector, path] of [['#blank', '/target?leg=blank'], ['#open', '/target?leg=open']]) {
        const adopted = await adoptFrom(app, pages, a, selector, path);
        if (plant === 'adopt-append-at-end' && await plantRan(app, 'page')) {
            note('PLANT adopt-append-at-end applied');
        }
        if (adopted.error) {
            return fail(adopted.error);
        }
        const seen = await strip(app, adopted.tabId);
        const ai = seen ? seen.order.indexOf(a.tabId) : -1;
        if (!seen || ai < 0 || seen.order.indexOf(adopted.tabId) !== ai + 1) {
            return fail(`the adopted tab is not directly after its opener after the ${selector} click (strip ${J(seen?.order)}, opener ${a.tabId}, adopted ${adopted.tabId})`);
        }
        const shells = await shellWindows(app);
        if (shells !== 1) {
            return fail(`the ${selector} adopt changed the shell-window count to ${shells}`);
        }
        const stocks = await stockWindows(app);
        if (stocks.some(id => !stocksBefore.includes(id))) {
            return fail(`the ${selector} adopt also opened a stock window`);
        }
        note(`${selector}: adopted ${adopted.tabId} directly after ${a.tabId}; shell windows 1; no stock window`);
        if (selector === '#open') {
            // The reselect leg: A was current when this tab activated, so closing it must go back to A.
            if (await waitCurrent(app, adopted.tabId) !== adopted.tabId) {
                return fail(`the foreground window.open adopt did not make ${adopted.tabId} current, so the reselect leg has no start`);
            }
            if (plant === 'reselect-opener-off') {
                const cleared = await probe(app, `const w = get('WebTabChannel').widgetOf(${J(adopted.tabId)});
                    const bar = get('ApplicationShell').mainPanel.findTabBar(w.title);
                    if (!bar || !bar._previousTitle) return false;
                    bar._previousTitle = null;
                    return true;`);
                if (cleared === true) {
                    note('PLANT reselect-opener-off applied');
                }
            }
            const after = await probe(app, `const ch = get('WebTabChannel');
                ch.widgetOf(${J(adopted.tabId)}).close();
                if (!await until(() => !ch.widgetOf(${J(adopted.tabId)}), 5000)) return { closed: false };
                const panel = get('ApplicationShell').mainPanel;
                await until(() => panel.currentTitle?.owner?.tabId === ${J(a.tabId)}, ${QUIET_MS});
                return { closed: true, current: panel.currentTitle?.owner?.tabId ?? null };`);
            if (!after?.closed) {
                return fail(`${BROKEN} the adopted tab ${adopted.tabId} did not close`);
            }
            if (after.current !== a.tabId) {
                return fail(`closing the adopted tab selected ${J(after.current)}, not its opener ${a.tabId}`);
            }
        }
    }
}

async function adoptOpener({ app, pages, plant, fail, note }) {
    const a = await openerTab(app, pages, 'opener');
    if (plant === 'opener-null') {
        await installReceiverRecorder(app);
        await inChrome(app, "window.__pbPlantInFrame = 'opener-null'; return true;");
    }
    const adopted = await adoptFrom(app, pages, a, '#open', '/target?leg=opener');
    if (plant === 'opener-null' && await plantRan(app, 'chrome')) {
        note('PLANT opener-null applied');
    }
    if (adopted.error) {
        return fail(`${adopted.error} (no adopted tab to read window.opener in)`);
    }
    if (await app.evaluateIn(a.ctx, 'window.__pbOpened === true') !== true) {
        return fail("the opener's window.open returned no window object to the opener page");
    }
    const ctx = await contextOn(app, adopted.url);
    if (await app.evaluateIn(ctx, 'window.opener !== null') !== true) {
        return fail(`the adopted tab's window.opener is null (${adopted.tabId})`);
    }
    const token = `t${Date.now()}`;
    // Bounded inside the page: the reply is an event, waited with a 4 s ceiling, never a fixed sleep.
    const pong = await app.evaluateIn(ctx, `new Promise(resolve => {
        const timer = setTimeout(() => resolve('timeout'), 4000);
        addEventListener('message', e => { if (e.data === ${J(`pong:${token}`)}) { clearTimeout(timer); resolve('pong'); } });
        window.opener.postMessage(${J(`ping:${token}`)}, '*');
    })`);
    if (await app.evaluateIn(a.ctx, `window.__pbPinged === ${J(`ping:${token}`)}`) !== true) {
        return fail("the opener never received the adopted tab's postMessage (adopted -> opener leg)");
    }
    if (pong !== 'pong') {
        return fail(`the adopted tab never received the opener's reply (opener -> adopted leg: ${pong})`);
    }
    note(`window.opener round trip completed between ${adopted.tabId} and ${a.tabId}`);
}

async function adoptPopup({ app, pages, plant, fail, note }) {
    const a = await openerTab(app, pages, 'popup');
    const path = '/target?leg=popup';
    const url = pages.url(path);
    const stocksBefore = await stockWindows(app);
    if (plant === 'popup-becomes-tab') {
        const set = await inChrome(app, `Services.prefs.setIntPref('browser.link.open_newwindow.restriction', 0);
            return Services.prefs.getIntPref('browser.link.open_newwindow.restriction');`);
        if (set === 0) {
            note('PLANT popup-becomes-tab applied');
        }
    }
    await aimAt(app, a, path);
    const mark = (await pushes(app)).length;
    await clickIn(app, a, '#popup');
    const found = await stockWindowOn(app, url, 15000);
    if (!found) {
        return fail(`window.open with popup features opened no stock window holding ${path}`);
    }
    if (stocksBefore.includes(found.window)) {
        return fail(`window.open with popup features put ${path} in an existing stock window, not a new popup window`);
    }
    // Absence, paired with adopt-order's push in this session from this recorder.
    const adopts = (await adoptsSince(app, mark)).filter(p => p.url === url);
    const tabs = await webTabsOn(app, url);
    if (adopts.length || tabs.length) {
        return fail(`the popup also became a web tab (${adopts.length} adoptTab push(es), web tabs ${J(tabs)})`);
    }
    if (await shellWindows(app) !== 1) {
        return fail('the popup changed the shell-window count');
    }
    note(`popup opened as stock window ${found.window}`);
    // Best-effort close: a script-opened window may close itself.
    await app.evaluateIn(found.content, 'window.close(); true').catch(() => undefined);
}

async function adoptFocus({ app, pages, plant, fail, note }) {
    const a = await openerTab(app, pages, 'focus');
    if (await focusOverlay(app, a.tabId) !== true) {
        return fail(`${BROKEN} the opener's overlay could not be made chrome's active element`);
    }
    if (plant === 'background-activates') {
        await probe(app, `const h = get('WebTabOpenHandler'); const original = h.adopt;
            h.adopt = function (d) { if (d && d.background === true) window.__pbPlantRan = true; return original.call(h, { ...d, background: false }); };
            return true;`);
    }
    // Background: the openLinkIn path stock middle-click takes (ClickHandlerParent -> openLinkIn(url, 'tab', { inBackground })).
    const bgPath = '/target?leg=bg';
    const bgUrl = pages.url(bgPath);
    const mark = (await pushes(app)).length;
    const out = await inChrome(app, `const o = overlayOf(${J(a.tabId)});
        const out = window.openLinkIn(${J(bgUrl)}, 'tab', { openerBrowser: o, inBackground: true });
        return typeof out === 'string' ? out : (out ? 'element' : 'null');`);
    if (out !== 'element') {
        return fail(`the background openLinkIn adopt created no pending tab (it answered ${J(out)})`);
    }
    const push = await awaitAdopt(app, bgUrl, mark);
    if (!push) {
        return fail('the background openLinkIn adopt gave no adoptTab push');
    }
    if (push.background !== true) {
        return fail(`the background open was pushed with background ${J(push.background)}`);
    }
    const bg = await attachedTabOn(app, bgUrl);
    if (!bg) {
        return fail('the background adopt attached no web tab');
    }
    if (plant === 'background-activates' && await plantRan(app, 'page')) {
        note('PLANT background-activates applied');
    }
    // By the tab's loaded push any activation adopt() would make has happened.
    await waitForPush(app, loadedAt(bg, bgPath), { from: mark });
    const current = await currentTabId(app);
    if (current !== a.tabId) {
        return fail(`a background adopt must leave the opener current (opener keeps focus); the current tab is ${J(current)}`);
    }
    const selected = await chromeSelectedTabId(app);
    const active = await chromeActiveTabId(app);
    if (selected !== a.tabId || active !== a.tabId) {
        return fail(`a background adopt must leave the opener focused in chrome (opener keeps focus); selected ${J(selected)}, active element ${J(active)}`);
    }
    note(`background adopt ${bg}: ${a.tabId} stayed current and chrome-focused`);
    // Foreground: the page's own window.open, no features.
    const fg = await adoptFrom(app, pages, a, '#open', '/target?leg=fg');
    if (fg.error) {
        return fail(fg.error);
    }
    if (fg.push.background !== false) {
        return fail(`the foreground window.open was pushed with background ${J(fg.push.background)}`);
    }
    const now = await waitCurrent(app, fg.tabId);
    if (now !== fg.tabId) {
        return fail(`a foreground adopt must make the new tab current; the current tab is ${J(now)}`);
    }
    let seen;
    try {
        await pollFor(async () => (seen = await chromeSelectedTabId(app)) === fg.tabId, 5000, 'chrome to record the selection');
    } catch {
        return fail(`after a foreground adopt chrome's selection is ${J(seen)}, not ${fg.tabId}`);
    }
}

async function adoptFallback({ app, pages, plant, fail, note }) {
    const a = await openerTab(app, pages, 'fallback');
    const path = '/target?leg=fallback';
    const url = pages.url(path);
    // One-shot: the next adoptTab push reaches the recorder but not the frontend's adopt (no widget, no ack).
    // The fallback-off plant also consumes the pending key with an ack for a widget that never attaches,
    // which disarms chrome's fallback: a swallowed navigation.
    await probe(app, `const h = get('WebTabOpenHandler'); const original = h.adopt;
        h.adopt = async function (d) {
            h.adopt = original;
            ${plant === 'fallback-off'
        ? "window.__pbPlantRan = true; await get('WebTabChannel').request({ kind: 'webTabAdopt', tabId: 'wt-planted-swallow', pcKey: d.pcKey });"
        : ''}
        };
        return true;`);
    await aimAt(app, a, path);
    const mark = (await pushes(app)).length;
    await clickIn(app, a, '#blank');
    const push = await awaitAdopt(app, url, mark);
    if (plant === 'fallback-off' && await plantRan(app, 'page')) {
        note('PLANT fallback-off applied');
    }
    if (!push) {
        return fail('the _blank click gave no adoptTab push, so there was no ack to drop');
    }
    const t0 = Date.now();
    const found = await stockWindowOn(app, url, ADOPT_ACK_TIMEOUT_MS + FALLBACK_MARGIN_MS);
    if (!found) {
        return fail(`with the ack dropped no stock window took ${path} within ${ADOPT_ACK_TIMEOUT_MS + FALLBACK_MARGIN_MS} ms (the navigation was swallowed)`);
    }
    note(`fallback: stock window held ${path} ${Date.now() - t0} ms after the push`);
    const tabs = await webTabsOn(app, url);
    if (tabs.length) {
        return fail(`the fallback page also has web tab(s) ${J(tabs)}`);
    }
    const overlays = await inChrome(app, `return [...document.querySelectorAll('browser')].filter(b => b.currentURI?.spec === ${J(url)}).length;`);
    if (overlays !== 0) {
        return fail(`the pending overlay outlived the fallback (${overlays} overlay(s) on ${path} in the shell)`);
    }
}

async function adoptScheme({ app, pages, plant, fail, note }) {
    const a = await openerTab(app, pages, 'scheme');
    await installReceiverRecorder(app);
    const jsUrl = 'javascript:void(0)';
    if (plant === 'adopt-javascript') {
        // The wall's fault: a javascript: URL handed on as if it were a page.
        await inChrome(app, `const original = window.openLinkIn;
            window.openLinkIn = (url, where, params) => {
                if (/^javascript:/i.test(url)) { window.__pbPlantRan = true; window.openLinkIn = original; return original('about:blank', where, params); }
                return original(url, where, params);
            };
            return true;`);
    }
    // Leg 1: the adopt path itself surfaces the refusal.
    const mark = (await pushes(app)).length;
    const answer = await inChrome(app, `const out = window.openLinkIn(${J(jsUrl)}, 'tab', { openerBrowser: overlayOf(${J(a.tabId)}), inBackground: false });
        return typeof out === 'string' ? out : (out ? 'element' : 'null');`);
    if (plant === 'adopt-javascript' && await plantRan(app, 'chrome')) {
        note('PLANT adopt-javascript applied');
    }
    if (answer !== 'refused-scheme') {
        return fail(`the adopt path did not answer refused-scheme for ${jsUrl} (it answered ${J(answer)})`);
    }
    // Leg 2: a javascript: _blank link in the page. Absences, paired with adopt-order's positives.
    const callsBefore = (await receiverCalls(app)).length;
    await clickIn(app, a, '#js');
    try {
        await pollFor(async () => (await receiverCalls(app)).length > callsBefore, QUIET_MS, 'a receiver call');
    } catch {
        // Gecko may never ask the receiver for a javascript: link; the reads below judge the outcome.
    }
    const calls = (await receiverCalls(app)).slice(callsBefore);
    note(`receiver calls for the javascript: link: ${J(calls)}`);
    // The InFrame wall answers null, so Gecko's own new window takes the page (36-01): a stock window is the design.
    if (calls.some(c => c.returned !== 'null')) {
        return fail(`a javascript: link was not refused: the receiver returned an overlay for ${J(calls.map(c => c.spec))}`);
    }
    const adopts = await adoptsSince(app, mark);
    if (adopts.length) {
        return fail(`a javascript: link was not refused: it gave adoptTab push(es) for ${J(adopts.map(p => p.url))}`);
    }
    const jsTabs = await probe(app, `return webTabs().filter(w => /^javascript:/i.test(w.url)).map(w => w.tabId);`);
    if (jsTabs.length) {
        return fail(`a javascript: link was not refused: web tab(s) ${J(jsTabs)}`);
    }
    const stillOn = await app.evaluateIn(a.ctx, 'location.href');
    if (stillOn !== a.url) {
        return fail(`a javascript: link navigated the opener to ${J(stillOn)}`);
    }
}

async function adoptUnknownKey({ app, pages, plant, fail, note }) {
    const url = pages.url('/target?leg=unknown');
    if (plant === 'unknown-key-keeps-widget') {
        await probe(app, `const h = get('WebTabOpenHandler');
            h.dropAdopted = function () { window.__pbPlantRan = true; };
            return true;`);
    }
    const mark = (await pushes(app)).length;
    // A widget minted but never attached, acked with a key chrome never issued: the orphan shape.
    const sent = await probe(app, `const h = get('WebTabOpenHandler');
        const ch = get('WebTabChannel');
        const w = await h.createWidget(${J(url)});
        window.__pbOrphan = w;
        const registered = ch.widgetOf(w.tabId) === w;
        const reply = await ch.request({ kind: 'webTabAdopt', tabId: w.tabId, pcKey: ${J(UNKNOWN_PC_KEY)} });
        return { tabId: w.tabId, registered, reply };`);
    if (!sent || typeof sent.tabId !== 'string') {
        return fail(`${BROKEN} the orphan widget could not be minted: ${J(sent)}`);
    }
    if (!sent.registered) {
        return fail(`${BROKEN} the minted widget is not registered on the channel, so a drop could not be seen`);
    }
    if (sent.reply?.ok !== false || sent.reply?.reason !== 'unknown-tab') {
        return fail(`an ack for unknown key ${UNKNOWN_PC_KEY} must reply unknown-tab; it replied ${J(sent.reply)}`);
    }
    if (await waitForPush(app, p => p && p.kind === 'dropAdoptedTab' && p.tabId === sent.tabId, { from: mark }) < 0) {
        return fail(`chrome pushed no dropAdoptedTab for ${sent.tabId} after unknown-tab`);
    }
    const gone = await probe(app, `return await until(() => window.__pbOrphan.isDisposed && !get('WebTabChannel').widgetOf(${J(sent.tabId)}), 5000);`);
    if (plant === 'unknown-key-keeps-widget' && await plantRan(app, 'page')) {
        note('PLANT unknown-key-keeps-widget applied');
    }
    if (gone !== true) {
        return fail(`the orphan widget ${sent.tabId} was not dropped after unknown-tab and dropAdoptedTab`);
    }
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

const SCENARIOS = {
    'adopt-order': adoptOrder,
    'adopt-opener': adoptOpener,
    'adopt-popup': adoptPopup,
    'adopt-focus': adoptFocus,
    'adopt-fallback': adoptFallback,
    'adopt-scheme': adoptScheme,
    'adopt-unknown-key': adoptUnknownKey,
};

/** The positive control each absence-asserting scenario needs green earlier in the same session. */
const CONTROL_OF = { 'adopt-popup': 'adopt-order', 'adopt-fallback': 'adopt-order', 'adopt-scheme': 'adopt-order' };

/** One session over `names`; returns `[{ name, failures, notes, notScored }]` or throws. */
async function runSession(names, plant = '') {
    const pages = await serveNavPages(PAGES);
    try {
        return await withProbeShell(async app => {
            const results = [];
            for (const name of names) {
                const result = { name, failures: [], notes: [], notScored: false };
                results.push(result);
                const control = CONTROL_OF[name];
                if (control && !results.some(r => r.name === control && !r.failures.length && !r.notScored)) {
                    result.notScored = true;
                    continue;
                }
                const ctx = {
                    app, pages, plant, results,
                    fail: reason => { result.failures.push(reason); },
                    note: text => { result.notes.push(text); },
                };
                try {
                    await SCENARIOS[name](ctx);
                } catch (error) {
                    result.failures.push(`harness: ${error.message}`);
                }
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
            failed++;
            console.error(`${r.name}: NOT SCORED -- its positive control (${CONTROL_OF[r.name]}) did not pass in this session`);
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

/** The asked scenarios plus their positive controls, in registry order. */
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
    const wanted = new Set(names.flatMap(n => (CONTROL_OF[n] ? [CONTROL_OF[n], n] : [n])));
    return Object.keys(SCENARIOS).filter(n => wanted.has(n));
}

const PLANTS = [
    { plant: 'adopt-append-at-end', target: 'adopt-order', run: ['adopt-order'], expect: 'directly after' },
    { plant: 'reselect-opener-off', target: 'adopt-order', run: ['adopt-order'], expect: 'opener' },
    { plant: 'opener-null', target: 'adopt-opener', run: ['adopt-opener'], expect: 'opener' },
    { plant: 'popup-becomes-tab', target: 'adopt-popup', run: ['adopt-order', 'adopt-popup'], expect: 'stock window' },
    { plant: 'background-activates', target: 'adopt-focus', run: ['adopt-focus'], expect: 'opener keeps focus' },
    { plant: 'fallback-off', target: 'adopt-fallback', run: ['adopt-order', 'adopt-fallback'], expect: 'stock window' },
    { plant: 'adopt-javascript', target: 'adopt-scheme', run: ['adopt-order', 'adopt-scheme'], expect: 'refused' },
    { plant: 'unknown-key-keeps-widget', target: 'adopt-unknown-key', run: ['adopt-unknown-key'], expect: 'dropped' },
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
