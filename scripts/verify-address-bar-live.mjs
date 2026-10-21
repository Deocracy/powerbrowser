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
 *   token-cookie  BAR-02's technical ruling: no load to a loopback port other
 *               than the sidecar's carries the Theia token cookie. With a probe
 *               cookie (pbprobe=1) added for 127.0.0.1 as the positive control,
 *               four loads to the served port must each carry pbprobe and no
 *               POWERBROWSER_TOKEN: a GUI-01 stock browser window (opened
 *               first, so when this is the session's first scenario no web
 *               tab has existed yet), an overlay page, its <img> subresource
 *               and a dedicated worker it starts. The cookie store still holds
 *               the token, and the Theia frame's credentialed health fetch
 *               passes the token gate while an uncredentialed one is refused.
 *   search      Typing "hello world" in the pill and pressing Enter (at the
 *               parent) loads the default engine's results page: the served
 *               engine records one GET on its search path whose q parameter
 *               is the typed words, and a state push for that tab carries
 *               that path. Chrome's resolveTypedAddress replies kind search
 *               naming the engine, and resolves example.com to a visit of
 *               https://example.com/ (reply only, nothing loads).
 *   refused     javascript:, file:, chrome: and about: text typed and
 *               committed shows the commit-failure row, chrome replies kind
 *               refused, and no state push for the tab carries that scheme.
 *               Scored only after search passed in the same session (its
 *               pushes prove the recorder sees this tab's navigations).
 *   no-engine   Chrome refuses an engine name outside the bar's set (kind
 *               no-engine); with the client stubbed to reply no-engine, Enter
 *               on typed words shows one row naming the configured
 *               application name and "can't search right now", and the served
 *               engine sees no GET. Scored only after search passed.
 *   dev-addresses  BAR-02: chrome resolves localhost, localhost:4000,
 *               devbox:3000, 192.168.1.10:8080 and [::1]:8080 to http visits
 *               of exactly that host and port, example.com to
 *               https://example.com/ and a single word to a search on the
 *               served engine; then 127.0.0.1:<served port>/dev typed in the
 *               pill and Enter loads /dev in the session's web tab (a GET and a
 *               state push). Scored only after search passed.
 *   default-engine  BAR-04: the placeholder and aria-label name Gecko's
 *               default (Probe Engine One); the Default Search Engine setting's
 *               options hold "", One and Two; setting it to Probe Engine Two
 *               renames the placeholder with no reload and Enter on hello
 *               searches /two/search; a name outside the set ("No Such Engine")
 *               is ignored: the placeholder names One and Enter searches
 *               /one/search. The setting is reset to "" afterwards.
 *   rows        BAR-11: with a history visit (and a cached data: favicon), a
 *               bookmark and an open web tab seeded chrome-side, typing "Row"
 *               shows the heuristic row first and highlighted ("Search with
 *               Probe Engine One"), then the history, bookmark and open-tab
 *               rows once each with their type markers; the history row's icon
 *               is a data:image/ <img> and no <img> in the dropdown has any
 *               other src; at most 10 rows, each 32px tall, under a max-height
 *               of at most 432px; the input is a combobox naming the dropdown.
 *               ArrowDown moves aria-activedescendant to the second row, a
 *               reply arriving after that does not move it, and clearing the
 *               text closes the dropdown.
 *   failure-rows  BAR-14: with the client's resolveTypedAddress stubbed to
 *               reject, typing "Row" shows a first row, highlighted, that starts
 *               with the configured application name ("The browser" when
 *               empty) and says it couldn't load suggestions; with the stub
 *               restored, Enter on that row searches /one/search for "Row".
 *   suggestions BAR-03: positive control first -- typing "hel" sends a GET on
 *               /one/suggest with q "hel" and shows "hel alpha" and "hel beta"
 *               below the heuristic row, captioned "Search with Probe Engine
 *               One". Then 127.0.0.1:<port>/x and localhost:4000 send no
 *               suggest GET, and chrome's fence answers the page realm's
 *               searchSuggestions('localhost:4000') with [] and no GET. A
 *               failing endpoint ("fail", a 500) leaves only the heuristic row
 *               with no error row. With browser.searchSuggestions off, "world"
 *               sends no suggest GET and still shows the heuristic row. Enter on
 *               "hel alpha" searches /one/search for "hel alpha".
 *   one-off     BAR-05: typing "hello" shows the strip "This time, search
 *               with:" with one button per engine chrome lists except Probe
 *               Engine One (the one in use), in chrome's order, among them
 *               "Search with Probe Engine Two"; hovering that one shows one HoverService tooltip reading
 *               "Probe Engine Two"; clicking it searches /two/search in the
 *               current tab, and Gecko's default is still Probe Engine One and
 *               the setting still ""; ArrowDown onto the button and Enter
 *               searches /two/search again; a middle-click opens /two/search in
 *               a new background tab while the session tab stays current. With
 *               every engine but Probe Engine One hidden chrome-side, no strip
 *               shows.
 *   switch-to-tab  BAR-06: with web tabs on localhost /sw-a ("Switch Alpha",
 *               its loaded push the positive control) and /sw-b, and B current,
 *               typing "Switch Alpha" shows A's open-tab row with the
 *               codicon-browser marker and "Switch to Tab"; a click on it, and
 *               then ArrowDown to it and Enter, each make A the current tab with
 *               chrome's focus in A's overlay and the pill showing A's address,
 *               with no state push with loading: true for A or B and no new GET
 *               on /sw-a.
 *   new-tab-targets  BAR-08: from the session tab, Alt+Enter (at the parent)
 *               on "localhost:<port>/nt-fg" opens a new tab on /nt-fg directly
 *               after it, current, joined to the active group (the join call is
 *               recorded), with chrome's focus in its overlay. With /nt-fg
 *               current, a Ctrl+mousedown on the heuristic row for /nt-bg, and a
 *               middle-button mousedown on a seeded /nt-mid history row, each
 *               open a new tab directly after it, joined, while /nt-fg stays
 *               current, the dropdown closes and the pill shows /nt-fg's address;
 *               a Ctrl+mousedown on /nt-fg's own open-tab row opens a second tab
 *               on /nt-fg instead of switching.
 *   autofill    BAR-07: with a visit to localhost:<port>/af seeded chrome-side
 *               and its moz_origins frecency forced and then read back above 0
 *               on the read-only Places connection (else a broken instrument),
 *               and a tab on /af current, typing "loc" key by key at the parent
 *               completes the pill to "localhost:<port>/" with the completed
 *               part selected and the heuristic row a "Visit" of
 *               http://localhost:<port>/; Tab collapses the selection with
 *               focus and the dropdown kept; Enter loads / in that tab (a GET
 *               and a push). Typing "loc" again then Backspace leaves "loc"
 *               with no completion; typing "a" completes again; "loc" set by a
 *               paste-shaped input event is not completed.
 *   canonize-drop  Ctrl+Enter and drops on the pill (BAR-13). Canonize half:
 *               the page realm's resolveTypedAddress('example', '', true)
 *               replies a visit of https://www.example.com/ and with canonize
 *               false a search. With the widget's openCommittedUrl wrapped to
 *               record its argument and load nothing (no public host is ever
 *               loaded), Ctrl+Enter (at the parent) on "example" commits
 *               https://www.example.com/ and on "example.org" (not a bare
 *               name, so plain Enter) https://example.org/. Drop half, each
 *               drag synthesised on the pill as nav-keys-live does on New
 *               Tab: a text/uri-list drag of <served>/dropped shows the ring
 *               with dropEffect copy, and dropping it loads /dropped in the
 *               session tab (a GET and a push) while the pill, sampled every
 *               frame until that push, never holds the payload; a plain-text
 *               drag gets copy with no ring, and dropping "dropped words" GETs
 *               /one/search with q "dropped words"; a javascript: uri-list
 *               drag gets no ring and dropEffect none; dropped javascript:
 *               text shows the commit-failure row and loads nothing.
 *
 * Needs the built browser and the last Theia app build; not a --quick check.
 */

import {
    appNameExpr,
    BROKEN,
    chromeActiveTabId,
    focusTheiaFrame,
    inChrome,
    loadedAt,
    makeCurrent,
    openWebTab,
    pressKey,
    pushes,
    readPill,
    serveNavPages,
    setPref,
    waitForPush,
    withProbeShell,
} from './lib/pb-live-probe.mjs';
import { pollFor, probe } from './lib/pb-relaunch.mjs';

const NAME = 'verify-address-bar-live';
const ENTER = { key: 'Enter', code: 'Enter', keyCode: 13 };
const ENGINE_ONE = 'Probe Engine One';
const ENGINE_TWO = 'Probe Engine Two';
const ENGINE_PREF = 'browser.defaultSearchEngine';

const TOKEN_COOKIE = 'POWERBROWSER_TOKEN';
const PROBE_COOKIE = 'pbprobe=1';
const API_URL = 'chrome://powerbrowser/content/PowerBrowserAPI.sys.mjs';

// The overlay page starts a dedicated worker from a Blob; the page builds the
// worker's absolute URL, since a blob worker has no base path of its own.
const COOKIE_PAGE_BODY = `<img src="/pixel"><script>
    const src = 'fetch(' + JSON.stringify(location.origin + '/cookie-worker') + ', { credentials: "include" });';
    new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
</script>`;

/** An engine suggest endpoint: two completions of q, or a 500 (undefined) for q "fail". */
const suggestPage = { json: params => {
    const q = params.get('q') ?? '';
    return q === 'fail' ? undefined : [q, [`${q} alpha`, `${q} beta`]];
} };

const PAGES = {
    '/one/suggest': suggestPage,
    '/two/suggest': suggestPage,
    '/start': { title: 'Address Start', body: '<p>start</p>' },
    '/one/search': { title: 'Probe One Results', body: '<p>results</p>' },
    '/two/search': { title: 'Probe Two Results', body: '<p>results</p>' },
    '/dev': { title: 'Dev Page', body: '<p>dev</p>' },
    '/cookie-stock': { title: 'Cookie Stock', body: '<p>stock</p>' },
    '/cookie-page': { title: 'Cookie Page', body: COOKIE_PAGE_BODY },
    '/pixel': { title: 'Pixel', body: '' },
    '/cookie-worker': { title: 'Cookie Worker', body: '' },
    '/r-hist': { title: 'Row History Page', body: '<p>history</p>' },
    '/r-book': { title: 'Row Bookmark Page', body: '<p>bookmark</p>' },
    '/r-tab': { title: 'Row Tab Page', body: '<p>tab</p>' },
    '/sw-a': { title: 'Switch Alpha', body: '<p>alpha</p>' },
    '/sw-b': { title: 'Switch Beta', body: '<p>beta</p>' },
    '/nt-fg': { title: 'Target Foreground', body: '<p>foreground</p>' },
    '/nt-bg': { title: 'Target Background', body: '<p>background</p>' },
    '/nt-mid': { title: 'Middle Page', body: '<p>middle</p>' },
    '/': { title: 'Served Root', body: '<p>root</p>' },
    '/af': { title: 'Autofill Page', body: '<p>autofill</p>' },
    '/dropped': { title: 'Dropped Page', body: '<p>dropped</p>' },
};

const SESSION_ENGINE = 'harness: the hermetic search engine could not be installed';

/** Adds the two served engines chrome-side and makes One the default; throws `harness:` on any failure. */
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
            SearchService.getEngineByName(${JSON.stringify(ENGINE_TWO)})
                ?? await SearchService.addUserEngine({
                    name: ${JSON.stringify(ENGINE_TWO)},
                    url: ${JSON.stringify(`${pages.origin}/two/search?q={searchTerms}`)},
                    suggestUrl: ${JSON.stringify(`${pages.origin}/two/suggest?q={searchTerms}`)},
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

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// The four loads to the served (non-sidecar) loopback port, in report order.
const COOKIE_LOADS = [
    ['stock-window', '/cookie-stock'],
    ['overlay', '/cookie-page'],
    ['subresource', '/pixel'],
    ['worker', '/cookie-worker'],
];

/** Chrome scope: true when the cookie store holds `name` for 127.0.0.1. */
const storeHolds = (app, name) => inChrome(app,
    `return Services.cookies.getCookiesFromHost('127.0.0.1', {}).some(c => c.name === ${JSON.stringify(name)});`);

/** The Theia frame's health fetch status with `credentials`, or -1 on a network error. */
const healthStatus = (app, credentials) => app.evaluate(
    `fetch(location.origin + '/powerbrowser/health', { credentials: ${JSON.stringify(credentials)} }).then(r => r.status, () => -1)`);

async function tokenCookie(ctx) {
    const { app, pages, plant, fail, note, passNote, results } = ctx;
    const firstScenario = results.length === 0 && !ctx.shared.tabId
        && await inChrome(app, `return ![...document.querySelectorAll('browser')].some(b => W.tabIdOfBrowser(b) !== null);`) === true;
    const added = await inChrome(app, `try {
        const v = Services.cookies.add('127.0.0.1', '/', 'pbprobe', '1', false, false, true, Date.now() + 86400000, {},
            Ci.nsICookie.SAMESITE_LAX, Ci.nsICookie.SCHEME_HTTP, false);
        return !v || v.result === Ci.nsICookieValidation.eOK;
    } catch (e) { return String(e); }`);
    if (added !== true) {
        return fail(`${BROKEN} the probe cookie could not be added for 127.0.0.1 (${String(added)})`);
    }
    if (plant === 'token-strip-off') {
        const removed = await inChrome(app, `const T = ChromeUtils.importESModule(${JSON.stringify(API_URL)}).PowerBrowserTokenCookie;
            Services.obs.removeObserver(T.observer, T.topic); return true;`);
        if (removed === true) {
            note('PLANT token-strip-off applied');
        }
    }
    const mark = pages.requests.length;
    // (a) The GUI-01 stock window, before this scenario opens any web tab.
    const opened = await app.evaluate(`(() => {
        try { window.__pbCookieWindow = window.open(${JSON.stringify(pages.url('/cookie-stock'))}, '_blank'); return !!window.__pbCookieWindow; }
        catch (e) { return String(e); }
    })()`);
    try {
        if (opened !== true) {
            return fail(`${BROKEN} window.open from the Theia frame returned no window (${String(opened)})`);
        }
        await nextGet(pages, '/cookie-stock', mark);
    } finally {
        await app.evaluate(`(() => { try { window.__pbCookieWindow && window.__pbCookieWindow.close(); } catch (e) {} return true; })()`);
    }
    // (b) The overlay page and its subresource; (c) the worker it starts.
    const tabId = await openWebTab(app, pages.url('/cookie-page'));
    if (await waitForPush(app, loadedAt(tabId, '/cookie-page')) < 0) {
        fail(`${BROKEN} no loaded state push arrived for /cookie-page`);
    }
    await nextGet(pages, '/pixel', mark);
    await nextGet(pages, '/cookie-worker', mark, () => true, 10000);
    const seen = pages.requests.slice(mark);
    const carried = [];
    for (const [label, path] of COOKIE_LOADS) {
        const request = seen.find(r => r.path === path);
        if (!request) {
            fail(`${BROKEN} no GET on ${path} (${label}) reached the served port${label === 'worker' ? ' within 10 s: the worker never ran' : ''}`);
            continue;
        }
        const cookies = String(request.cookie ?? '').split(';').map(c => c.trim());
        if (!cookies.includes(PROBE_COOKIE)) {
            fail(`${BROKEN} the ${label} request (${path}) did not carry ${PROBE_COOKIE}, so the request log cannot see its cookies`);
        }
        if (cookies.some(c => c.startsWith(`${TOKEN_COOKIE}=`))) {
            carried.push(label);
        }
    }
    if (carried.length) {
        fail(`carried ${TOKEN_COOKIE}: ${carried.join(', ')}`);
    }
    if (await storeHolds(app, TOKEN_COOKIE) !== true) {
        fail(`the cookie store no longer holds ${TOKEN_COOKIE} for 127.0.0.1 (the strip must edit headers, never the store)`);
    }
    const withToken = await healthStatus(app, 'include');
    if (withToken !== 200) {
        fail(`the Theia frame's credentialed fetch of its own health route returned ${withToken}, not 200 (the strip took the token from the Theia frame)`);
    }
    const without = await healthStatus(app, 'omit');
    if (without === 200) {
        fail(`${BROKEN} the uncredentialed health fetch also returned 200, so the token gate is off and the credentialed fetch proves nothing`);
    }
    if (firstScenario) {
        passNote('stock window before any web tab');
    }
}

/** True when `name`'s positive control passed earlier in this session. */
const controlPassed = (results, name) => {
    const control = results.find(r => r.name === CONTROL_OF[name]);
    return !!control && !control.failures.length && !control.notScored;
};

const REFUSED_TEXTS = [
    ['javascript:alert(1)', 'javascript:'],
    ['file:///etc/hostname', 'file:'],
    ['chrome://browser/content/browser.xhtml', 'chrome:'],
    ['about:config', 'about:'],
];

async function refused(ctx) {
    const { app, fail, results } = ctx;
    if (!controlPassed(results, 'refused')) {
        return 'not-scored';
    }
    const tabId = await sessionTab(ctx);
    for (const [text, scheme] of REFUSED_TEXTS) {
        const mark = (await pushes(app)).length;
        await typeInPill(app, text);
        await pressKey(app, ENTER);
        const pill = await settle(() => readPill(app), v => v.rows.length === 1 && v.rows[0].includes("couldn't open that address"));
        if (pill.rows.length !== 1 || !pill.rows[0].includes("couldn't open that address")) {
            fail(`${text}: Enter must show the one commit-failure row; saw ${JSON.stringify(pill)}`);
        }
        await sleep(1500);
        const loaded = (await pushes(app)).slice(mark).filter(p => p && p.kind === 'state' && p.tabId === tabId && String(p.url).toLowerCase().startsWith(scheme));
        if (loaded.length) {
            fail(`${text}: the tab navigated to ${JSON.stringify(loaded[0].url)}`);
        }
        const reply = await resolveIn(app, text);
        if (reply?.kind !== 'refused') {
            fail(`${text}: resolveTypedAddress must reply kind refused; got ${JSON.stringify(reply)}`);
        }
    }
}

async function noEngine(ctx) {
    const { app, pages, fail, results } = ctx;
    if (!controlPassed(results, 'no-engine')) {
        return 'not-scored';
    }
    const named = await resolveIn(app, 'hello world', 'No Such Engine');
    if (named?.kind !== 'no-engine') {
        fail(`resolveTypedAddress('hello world', 'No Such Engine') must reply kind no-engine; got ${JSON.stringify(named)}`);
    }
    await sessionTab(ctx);
    const subject = (await app.evaluate(appNameExpr)) || 'The browser';
    if (await stubResolve(app, { kind: 'no-engine' }) !== true) {
        return fail(`${BROKEN} the client's resolveTypedAddress could not be stubbed`);
    }
    try {
        const getMark = pages.requests.length;
        await typeInPill(app, 'hello world');
        await pressKey(app, ENTER);
        const pill = await settle(() => readPill(app), v => v.rows.length === 1 && v.rows[0].includes("can't search right now"));
        if (pill.rows.length !== 1 || !pill.rows[0].startsWith(subject) || !pill.rows[0].includes("can't search right now")) {
            fail(`a no-engine reply must show one row starting with ${JSON.stringify(subject)} saying it can't search right now; saw ${JSON.stringify(pill)}`);
        }
        await sleep(1500);
        const searched = pages.requests.slice(getMark).filter(r => r.path === '/one/search');
        if (searched.length) {
            fail(`a no-engine reply loaded the engine anyway: ${JSON.stringify(searched.map(r => r.path + r.search))}`);
        }
    } finally {
        await stubResolve(app, null);
    }
}

// Typed text and the visit URL Gecko's URI fixup must resolve it to.
const DEV_VISITS = [
    ['localhost', 'http://localhost/'],
    ['localhost:4000', 'http://localhost:4000/'],
    ['devbox:3000', 'http://devbox:3000/'],
    ['192.168.1.10:8080', 'http://192.168.1.10:8080/'],
    ['[::1]:8080', 'http://[::1]:8080/'],
    ['example.com', 'https://example.com/'],
];

async function devAddresses(ctx) {
    const { app, pages, fail, results } = ctx;
    if (!controlPassed(results, 'dev-addresses')) {
        return 'not-scored';
    }
    for (const [text, url] of DEV_VISITS) {
        const reply = await resolveIn(app, text);
        if (reply?.kind !== 'visit' || reply.url !== url) {
            fail(`resolveTypedAddress(${JSON.stringify(text)}) must reply a visit of ${url}; got ${JSON.stringify(reply)}`);
        }
    }
    const word = await resolveIn(app, 'hello');
    if (word?.kind !== 'search' || word.engineName !== ENGINE_ONE || !String(word.url).startsWith(`${pages.origin}/one/search`)) {
        fail(`resolveTypedAddress('hello') must reply kind search from ${JSON.stringify(ENGINE_ONE)} on the served origin; got ${JSON.stringify(word)}`);
    }
    const tabId = await sessionTab(ctx);
    const mark = (await pushes(app)).length;
    const getMark = pages.requests.length;
    await typeInPill(app, `${new URL(pages.origin).host}/dev`);
    await pressKey(app, ENTER);
    const got = await nextGet(pages, '/dev', getMark);
    if (!got) {
        fail(`no GET on /dev after Enter on ${new URL(pages.origin).host}/dev; pill ${JSON.stringify(await readPill(app))}`);
    }
    if (await waitForPush(app, loadedAt(tabId, '/dev'), { from: mark, timeoutMs: got ? 15000 : 1000 }) < 0) {
        fail('no loaded state push for the session tab ended /dev');
    }
}

/** The pill input's placeholder and aria-label. */
const readAddressLabel = app => app.evaluate(`JSON.stringify((() => {
    const input = document.querySelector('.pb-chrome-bar-input');
    return input ? { placeholder: input.placeholder, aria: input.getAttribute('aria-label') } : null;
})())`).then(JSON.parse);

const labelFor = engine => `Search with ${engine} or enter address`;
const labelIs = text => v => !!v && v.placeholder === text && v.aria === text;

/** Types `text`, presses Enter, and returns the first GET on `path` with q === text, or null. */
async function searchVia(ctx, text, path) {
    const getMark = ctx.pages.requests.length;
    await typeInPill(ctx.app, text);
    await pressKey(ctx.app, ENTER);
    return nextGet(ctx.pages, path, getMark, r => queryOf(r) === text);
}

async function defaultEngine(ctx) {
    const { app, plant, fail, note } = ctx;
    await sessionTab(ctx);
    // Focus re-reads chrome's engines: the harness added its engines after startup.
    if (await focusTheiaFrame(app) !== true || await app.evaluate(`(() => { const i = document.querySelector('.pb-chrome-bar-input'); if (!i) return false; i.focus(); return true; })()`) !== true) {
        throw new Error(`${BROKEN} the pill could not be focused`);
    }
    const first = await settle(() => readAddressLabel(app), labelIs(labelFor(ENGINE_ONE)));
    if (!labelIs(labelFor(ENGINE_ONE))(first)) {
        fail(`the placeholder and aria-label must read ${JSON.stringify(labelFor(ENGINE_ONE))}; got ${JSON.stringify(first)}`);
    }
    const options = await probe(app, `return get('PreferenceSchemaService').getSchemaProperty(${JSON.stringify(ENGINE_PREF)})?.enum ?? null;`);
    for (const option of ['', ENGINE_ONE, ENGINE_TWO]) {
        if (!Array.isArray(options) || !options.includes(option)) {
            fail(`the ${ENGINE_PREF} setting's options must include ${JSON.stringify(option)}; got ${JSON.stringify(options)}`);
        }
    }
    if (plant === 'engine-name-dropped') {
        const wrapped = await probe(app, `const c = get('ChromeStoreClient');
            const original = Object.getPrototypeOf(c).resolveTypedAddress.bind(c);
            c.resolveTypedAddress = text => original(text, '');
            return true;`);
        if (wrapped === true) {
            note('PLANT engine-name-dropped applied');
        }
    }
    try {
        if (await setPref(app, ENGINE_PREF, ENGINE_TWO) !== true) {
            return fail(`${BROKEN} the ${ENGINE_PREF} setting could not be set`);
        }
        const two = await settle(() => readAddressLabel(app), labelIs(labelFor(ENGINE_TWO)));
        if (!labelIs(labelFor(ENGINE_TWO))(two)) {
            fail(`with the setting on ${ENGINE_TWO} the placeholder must read ${JSON.stringify(labelFor(ENGINE_TWO))} with no reload; got ${JSON.stringify(two)}`);
        }
        if (!await searchVia(ctx, 'hello', '/two/search')) {
            fail(`no GET on /two/search with q "hello" after Enter with the setting on ${ENGINE_TWO}`);
        }
        if (await setPref(app, ENGINE_PREF, 'No Such Engine') !== true) {
            return fail(`${BROKEN} the ${ENGINE_PREF} setting could not be set to an unknown name`);
        }
        const unknown = await settle(() => readAddressLabel(app), labelIs(labelFor(ENGINE_ONE)));
        if (!labelIs(labelFor(ENGINE_ONE))(unknown)) {
            fail(`an unknown engine name must leave the placeholder naming ${ENGINE_ONE}; got ${JSON.stringify(unknown)}`);
        }
        if (!await searchVia(ctx, 'hello', '/one/search')) {
            fail('no GET on /one/search with q "hello" after Enter with an unknown engine name in the setting');
        }
    } finally {
        await setPref(app, ENGINE_PREF, '');
        if (plant === 'engine-name-dropped') {
            await stubResolve(app, null);
        }
    }
}

// A 1x1 PNG, stored as the history row's cached favicon.
const PNG_DATA = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const ARROW_DOWN = { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 };
const HEURISTIC_CAPTION = `Search with ${ENGINE_ONE}`;
// The seeded rows: path, the caption suffix that names the row, and its type marker.
const SEEDED_ROWS = [
    ['/r-hist', 'codicon-history'],
    ['/r-book', 'codicon-star-full'],
    ['/r-tab', 'codicon-browser'],
];

/** Seeds Places chrome-side: visits to r-hist and r-tab, a bookmark on r-book and a favicon for r-hist. */
const seedRowPlaces = (app, pages) => inChrome(app, `return (async () => {
    try {
        const { PlacesUtils } = ChromeUtils.importESModule('resource://gre/modules/PlacesUtils.sys.mjs');
        const hist = ${JSON.stringify(pages.url('/r-hist'))};
        await PlacesUtils.history.insert({ url: hist, title: 'Row History Page', visits: [{ date: new Date() }] });
        await PlacesUtils.history.insert({ url: ${JSON.stringify(pages.url('/r-tab'))}, title: 'Row Tab Page', visits: [{ date: new Date() }] });
        await PlacesUtils.bookmarks.insert({ parentGuid: PlacesUtils.bookmarks.unfiledGuid, url: ${JSON.stringify(pages.url('/r-book'))}, title: 'Row Bookmark Page' });
        await PlacesUtils.favicons.setFaviconForPage(Services.io.newURI(hist), Services.io.newURI(hist + '/favicon.png'), Services.io.newURI(${JSON.stringify(PNG_DATA)}));
        const icon = await PlacesUtils.favicons.getFaviconForPage(Services.io.newURI(hist), 16);
        return icon && icon.dataURI && icon.dataURI.spec.startsWith('data:image/') ? 'ok' : 'no favicon stored';
    } catch (e) {
        return 'error: ' + e;
    }
})();`);

/** The dropdown as the user sees it: one record per row, the <img> sources, the panel cap and the combobox attributes. */
const readRows = app => app.evaluate(`JSON.stringify((() => {
    const input = document.querySelector('.pb-chrome-bar-input');
    const dd = document.querySelector('.pb-chrome-bar-dropdown');
    const attrs = input ? { role: input.getAttribute('role'), expanded: input.getAttribute('aria-expanded'),
        controls: input.getAttribute('aria-controls'), autocomplete: input.getAttribute('aria-autocomplete'),
        active: input.getAttribute('aria-activedescendant') } : null;
    if (!dd) return { open: false, attrs, rows: [], imgs: [] };
    const rows = [...dd.querySelectorAll('.pb-chrome-bar-row:not(.is-shimmer)')].map(r => {
        const type = r.querySelector('.pb-chrome-bar-row-type');
        const img = r.querySelector('img.pb-chrome-bar-row-icon');
        return {
            id: r.id,
            selected: r.getAttribute('aria-selected') === 'true',
            title: (r.querySelector('.pb-chrome-bar-row-title') || {}).textContent || '',
            caption: (r.querySelector('.pb-chrome-bar-row-caption') || {}).textContent || '',
            type: type ? [...type.classList].find(c => c.startsWith('codicon-') && c !== 'codicon') || null : null,
            switchText: (r.querySelector('.pb-chrome-bar-row-switch') || {}).textContent || '',
            img: img ? img.getAttribute('src') : null,
            height: r.getBoundingClientRect().height,
        };
    });
    return { open: true, id: dd.id, attrs, rows, imgs: [...dd.querySelectorAll('img')].map(i => i.getAttribute('src')),
        maxHeight: getComputedStyle(dd).maxHeight };
})())`).then(JSON.parse);

const rowFor = (view, pages, path) => view.rows.filter(r => r.caption === pages.url(path));

async function rows(ctx) {
    const { app, pages, plant, fail, note } = ctx;
    const seeded = await seedRowPlaces(app, pages);
    if (seeded !== 'ok') {
        return fail(`${BROKEN} Places could not be seeded (${String(seeded)})`);
    }
    const tabId = await openWebTab(app, pages.url('/r-tab'));
    if (await waitForPush(app, loadedAt(tabId, '/r-tab')) < 0) {
        return fail(`${BROKEN} no loaded state push arrived for /r-tab`);
    }
    if (plant === 'dedupe-off') {
        const planted = await probe(app, `const w = get('ChromeBarWidget');
            w.composeVisibleRows = function () {
                const places = this.placeRows;
                return (this.heuristic ? [this.heuristic] : []).concat(places, places.length ? [{ ...places[0], key: places[0].key + '#copy' }] : []);
            };
            return true;`);
        if (planted === true) {
            note('PLANT dedupe-off applied');
        }
    }
    const ready = v => v.open && v.rows[0]?.caption === HEURISTIC_CAPTION
        && SEEDED_ROWS.every(([path, type]) => rowFor(v, pages, path).some(r => r.type === type))
        && rowFor(v, pages, '/r-hist').some(r => r.img);
    let view;
    // The open tab reaches the tab store a moment after its load; retype until every seeded row shows.
    const end = Date.now() + 20000;
    do {
        // Clearing first: React ignores an input event that leaves the value unchanged.
        await typeInPill(app, '');
        await typeInPill(app, 'Row');
        view = await settle(() => readRows(app), ready, 4000);
    } while (!ready(view) && Date.now() < end);
    const first = view.rows[0];
    if (!first || first.caption !== HEURISTIC_CAPTION || !first.selected || view.attrs?.active !== first.id) {
        fail(`the first row must be the heuristic row, highlighted, captioned ${JSON.stringify(HEURISTIC_CAPTION)}; saw ${JSON.stringify(view)}`);
    }
    // Engine suggestions (BAR-03) share the heuristic caption; the dedupe is over the url-captioned rows.
    const captions = view.rows.slice(1).map(r => r.caption).filter(c => c !== HEURISTIC_CAPTION);
    const repeated = captions.filter((c, i) => captions.indexOf(c) !== i);
    if (repeated.length) {
        fail(`two rows for one url: ${JSON.stringify([...new Set(repeated)])}`);
    }
    for (const [path, type] of SEEDED_ROWS) {
        const found = rowFor(view, pages, path);
        if (found.length !== 1 || found[0].type !== type) {
            fail(`the ${path} row must appear once with the ${type} marker; saw ${JSON.stringify(found)}`);
        }
    }
    const hist = rowFor(view, pages, '/r-hist')[0];
    if (!hist || !String(hist.img).startsWith('data:image/')) {
        fail(`${BROKEN} the /r-hist row's leading slot is not a data:image/ <img> (the positive control for the icon check); saw ${JSON.stringify(hist)}`);
    }
    const foreign = view.imgs.filter(src => !String(src).startsWith('data:image/'));
    if (foreign.length) {
        fail(`an <img> in the dropdown has a src that is not data:image/: ${JSON.stringify(foreign)}`);
    }
    if (view.rows.length > 10) {
        fail(`the dropdown shows ${view.rows.length} rows; at most 10`);
    }
    const tall = view.rows.filter(r => Math.round(r.height) !== 32);
    if (tall.length) {
        fail(`every row must be 32px tall; saw ${JSON.stringify(tall.map(r => [r.caption || r.title, r.height]))}`);
    }
    if (!(parseFloat(view.maxHeight) <= 432)) {
        fail(`the dropdown's max-height must be at most 432px; saw ${JSON.stringify(view.maxHeight)}`);
    }
    const a = view.attrs ?? {};
    if (a.role !== 'combobox' || a.expanded !== 'true' || a.controls !== view.id || view.id !== 'pb-chrome-bar-dropdown' || a.autocomplete !== 'both') {
        fail(`the pill must be a combobox (aria-expanded, aria-controls naming the dropdown, aria-autocomplete both); saw ${JSON.stringify({ attrs: a, id: view.id })}`);
    }
    await pressKey(app, ARROW_DOWN);
    const moved = await settle(() => readRows(app), v => v.rows[1]?.selected && v.attrs?.active === v.rows[1].id);
    const second = moved.rows[1];
    if (!second || !second.selected || moved.attrs?.active !== second.id) {
        fail(`ArrowDown must move aria-activedescendant to the second row; saw ${JSON.stringify(moved.attrs)} over ${JSON.stringify(moved.rows.map(r => r.id))}`);
    } else {
        // A reply that arrives after the move: the same query again, with chrome's resolve held back.
        const late = await probe(app, `const c = get('ChromeStoreClient');
            const original = Object.getPrototypeOf(c).resolveTypedAddress.bind(c);
            c.resolveTypedAddress = (...a) => sleep(800).then(() => original(...a));
            try { await get('ChromeBarWidget').runQuery('Row'); } finally { delete c.resolveTypedAddress; }
            return true;`);
        if (late !== true) {
            fail(`${BROKEN} the late reply could not be driven (${JSON.stringify(late)})`);
        }
        const after = await readRows(app);
        const now = after.rows.find(r => r.selected);
        if (!now || now.caption !== second.caption || now.title !== second.title || after.attrs?.active !== now.id) {
            fail(`a reply arriving after ArrowDown moved the highlight from ${JSON.stringify(second.title)} to ${JSON.stringify(now ?? null)}`);
        }
    }
    await typeInPill(app, '');
    const cleared = await settle(() => readRows(app), v => !v.open);
    if (cleared.open) {
        fail(`clearing the text must close the dropdown; ${cleared.rows.length} row(s) still showing`);
    }
}

async function failureRows(ctx) {
    const { app, pages, fail } = ctx;
    await sessionTab(ctx);
    const subject = (await app.evaluate(appNameExpr)) || 'The browser';
    const stubbed = await probe(app, `get('ChromeStoreClient').resolveTypedAddress = async () => { throw new Error('stubbed rejection'); }; return true;`);
    if (stubbed !== true) {
        return fail(`${BROKEN} the client's resolveTypedAddress could not be stubbed to reject`);
    }
    let restored = false;
    try {
        await typeInPill(app, 'Row');
        const failed = v => (v.rows[0]?.title ?? '').includes("couldn't load suggestions");
        const view = await settle(() => readRows(app), failed);
        const first = view.rows[0];
        if (!first || !failed(view) || !first.title.startsWith(subject) || !first.selected) {
            fail(`a rejected resolve must make the first row, highlighted, start with ${JSON.stringify(subject)} and say it couldn't load suggestions; saw ${JSON.stringify(view.rows)}`);
        }
        await stubResolve(app, null);
        restored = true;
        const getMark = pages.requests.length;
        await pressKey(app, ENTER);
        if (!await nextGet(pages, '/one/search', getMark, r => queryOf(r) === 'Row')) {
            fail(`Enter on the suggestions-failure row must still search: no GET on /one/search with q "Row"; pill ${JSON.stringify(await readPill(app))}`);
        }
    } finally {
        if (!restored) {
            await stubResolve(app, null);
        }
    }
}

const SUGGEST_PREF = 'browser.searchSuggestions';

/** The /one/suggest GETs at index >= `from`. */
const suggestGets = (pages, from) => pages.requests.slice(from).filter(r => r.path === '/one/suggest');

/** The rows below the heuristic row that are engine suggestions (captioned like a heuristic search). */
const engineRowsOf = view => view.rows.slice(1).filter(r => r.caption === HEURISTIC_CAPTION);

async function suggestions(ctx) {
    const { app, pages, plant, fail, note } = ctx;
    await sessionTab(ctx);
    if (plant === 'setting-ignored') {
        if (await probe(app, `get('ChromeBarWidget').suggestionsOn = () => true; return true;`) === true) {
            note('PLANT setting-ignored applied');
        }
    }
    // Positive control: the request log sees this engine's suggest GETs in this session.
    let mark = pages.requests.length;
    await typeInPill(app, 'hel');
    const shows = v => v.rows[0]?.title === 'hel' && v.rows[1]?.title === 'hel alpha' && v.rows[2]?.title === 'hel beta';
    const view = await settle(() => readRows(app), shows, 8000);
    const asked = await nextGet(pages, '/one/suggest', mark, r => queryOf(r) === 'hel', 5000);
    if (!asked || !shows(view) || view.rows[0].caption !== HEURISTIC_CAPTION || engineRowsOf(view).length !== 2) {
        return fail(`typing "hel" must send a GET on /one/suggest with q "hel" (${asked ? 'sent' : 'none'}) and show "hel alpha" and "hel beta" below the heuristic row, captioned ${JSON.stringify(HEURISTIC_CAPTION)}; saw ${JSON.stringify(view.rows)}`);
    }
    mark = pages.requests.length;
    for (const text of [`${new URL(pages.origin).host}/x`, 'localhost:4000']) {
        await typeInPill(app, text);
        await sleep(1650);
    }
    const fenced = await probe(app, `return await get('ChromeStoreClient').searchSuggestions('localhost:4000');`);
    await sleep(500);
    if (!Array.isArray(fenced) || fenced.length) {
        fail(`chrome must answer searchSuggestions('localhost:4000') with []; got ${JSON.stringify(fenced)}`);
    }
    if (suggestGets(pages, mark).length) {
        fail(`address-shaped text reached the engine: ${JSON.stringify(suggestGets(pages, mark).map(r => r.search))}`);
    }
    mark = pages.requests.length;
    await typeInPill(app, 'fail');
    const failedGet = await nextGet(pages, '/one/suggest', mark, r => queryOf(r) === 'fail', 5000);
    await sleep(800);
    const failed = await readRows(app);
    if (!failedGet) {
        fail(`${BROKEN} typing "fail" sent no GET on /one/suggest, so the failure path was never exercised`);
    } else if (failed.rows[0]?.title !== 'fail' || engineRowsOf(failed).length || failed.rows.some(r => r.title.includes("couldn't"))) {
        fail(`a failing suggest endpoint must leave the heuristic row with no engine rows and no error row; saw ${JSON.stringify(failed.rows)}`);
    }
    try {
        if (await setPref(app, SUGGEST_PREF, false) !== true) {
            return fail(`${BROKEN} the ${SUGGEST_PREF} setting could not be turned off`);
        }
        mark = pages.requests.length;
        await typeInPill(app, 'world');
        const off = await settle(() => readRows(app), v => v.rows[0]?.title === 'world');
        await sleep(1500);
        if (suggestGets(pages, mark).length) {
            fail(`suggest request while the setting was off: ${JSON.stringify(suggestGets(pages, mark).map(r => r.search))}`);
        }
        if (off.rows[0]?.title !== 'world' || off.rows[0].caption !== HEURISTIC_CAPTION) {
            fail(`with the setting off the heuristic row must still show for "world"; saw ${JSON.stringify(off.rows)}`);
        }
    } finally {
        await setPref(app, SUGGEST_PREF, true);
    }
    await typeInPill(app, 'hel');
    await settle(() => readRows(app), shows, 8000);
    await pressKey(app, ARROW_DOWN);
    const moved = await settle(() => readRows(app), v => v.rows[1]?.selected);
    if (moved.rows[1]?.title !== 'hel alpha' || !moved.rows[1].selected) {
        return fail(`ArrowDown must highlight "hel alpha"; saw ${JSON.stringify(moved.rows)}`);
    }
    const getMark = pages.requests.length;
    await pressKey(app, ENTER);
    if (!await nextGet(pages, '/one/search', getMark, r => queryOf(r) === 'hel alpha')) {
        fail(`Enter on "hel alpha" must search it: no GET on /one/search with q "hel alpha"; pill ${JSON.stringify(await readPill(app))}`);
    }
}

const ONE_OFF_LABEL = 'This time, search with:';
const SEARCH_SERVICE = `ChromeUtils.importESModule('moz-src:///toolkit/components/search/SearchService.sys.mjs').SearchService`;

/** The open dropdown's one-off strip (its label and buttons), or null when there is none. */
const readOneOffs = app => app.evaluate(`JSON.stringify((() => {
    const strip = document.querySelector('.pb-chrome-bar-dropdown .pb-chrome-bar-oneoffs');
    if (!strip) return null;
    const label = strip.querySelector('.pb-chrome-bar-oneoffs-label');
    return { label: label ? label.textContent : null, buttons: [...strip.querySelectorAll('button.pb-chrome-bar-oneoff')]
        .map(b => ({ aria: b.getAttribute('aria-label'), highlighted: b.classList.contains('is-highlighted') })) };
})())`).then(JSON.parse);

const TWO_BUTTON = `[...document.querySelectorAll('.pb-chrome-bar-dropdown .pb-chrome-bar-oneoff')].find(b => b.getAttribute('aria-label') === ${JSON.stringify(`Search with ${ENGINE_TWO}`)})`;

/** Dispatches a mouse event `type` on Probe Engine Two's one-off button (React listens at its root). */
const fireOneOff = (app, type, init = {}) => app.evaluate(`(() => {
    const b = ${TWO_BUTTON};
    if (!b) return false;
    b.dispatchEvent(new MouseEvent(${JSON.stringify(type)}, { bubbles: true, cancelable: true, ...${JSON.stringify(init)} }));
    return true;
})()`);

/** Types "hello" afresh (clearing first: React ignores an unchanged value) and waits for a strip with a button. */
async function typeForOneOffs(app) {
    await typeInPill(app, '');
    await typeInPill(app, 'hello');
    return settle(() => readOneOffs(app), v => !!v && v.buttons.length > 0, 8000);
}

/** Chrome-side: sets `hidden` on each named engine, then has the widget re-read the engines. */
async function setEnginesHidden(app, names, hidden) {
    const done = await inChrome(app, `return (async () => {
        const S = ${SEARCH_SERVICE};
        for (const name of ${JSON.stringify(names)}) S.getEngineByName(name).hidden = ${hidden};
        return true;
    })();`);
    return done === true && await probe(app, `await get('ChromeBarWidget').refreshEngines(); return true;`) === true;
}

async function oneOff(ctx) {
    const { app, pages, plant, fail, note } = ctx;
    const tabId = await sessionTab(ctx);
    if (plant === 'oneoff-default') {
        const planted = await probe(app, `const w = get('ChromeBarWidget');
            const original = Object.getPrototypeOf(w).runOneOff;
            w.runOneOff = function (name, target) { return original.call(this, '', target); };
            return true;`);
        if (planted === true) {
            note('PLANT oneoff-default applied');
        }
    }
    // Derived from chrome's list, compared in order: every engine but the one in use.
    const listed = await probe(app, `return (await get('ChromeStoreClient').listSearchEngines()).engines.map(e => e.name);`);
    if (!Array.isArray(listed) || !listed.includes(ENGINE_ONE) || !listed.includes(ENGINE_TWO)) {
        return fail(`${BROKEN} chrome's engine list lacks the probe engines: ${JSON.stringify(listed)}`);
    }
    const want = listed.filter(name => name !== ENGINE_ONE).map(name => `Search with ${name}`);
    const strip = await typeForOneOffs(app);
    if (!strip || strip.label !== ONE_OFF_LABEL || JSON.stringify(strip.buttons.map(b => b.aria)) !== JSON.stringify(want)) {
        return fail(`typing "hello" must show the strip ${JSON.stringify(ONE_OFF_LABEL)} with the buttons ${JSON.stringify(want)}; saw ${JSON.stringify(strip)}`);
    }
    const twoAt = want.indexOf(`Search with ${ENGINE_TWO}`);
    const tip = await probe(app, `const b = ${TWO_BUTTON};
        get('HoverService').cancelHover();
        b.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
        const shown = () => [...document.querySelectorAll('.theia-hover')].filter(h => h.matches(':popover-open') && !h.style.visibility);
        if (!(await until(() => shown().length > 0, 5000))) return { shown: 0 };
        const seen = { shown: shown().length, text: shown()[0].textContent, ours: shown()[0].classList.contains('pb-chrome-bar-hover') };
        get('HoverService').cancelHover();
        return seen;`);
    if (tip?.shown !== 1 || tip.text !== ENGINE_TWO || !tip.ours) {
        fail(`hovering the one-off must show one pb-chrome-bar-hover tooltip reading ${JSON.stringify(ENGINE_TWO)}; saw ${JSON.stringify(tip)}`);
    }
    let mark = pages.requests.length;
    let pushMark = (await pushes(app)).length;
    await fireOneOff(app, 'click');
    const clicked = await nextGet(pages, '/two/search', mark, r => queryOf(r) === 'hello');
    if (!clicked) {
        fail(`no GET on /two/search with q "hello" after clicking the one-off; requests since the mark: ${JSON.stringify(pages.requests.slice(mark).map(r => r.path + r.search))}`);
    } else if (await waitForPush(app, p => p && p.kind === 'state' && p.tabId === tabId && pathOf(p.url) === '/two/search', { from: pushMark }) < 0) {
        fail('clicking the one-off did not search in the current tab (no state push for it on /two/search)');
    }
    const def = await inChrome(app, `return (async () => { const S = ${SEARCH_SERVICE}; return (await S.getDefault()).name; })();`);
    const pref = await probe(app, `return get('PreferenceService').get(${JSON.stringify(ENGINE_PREF)});`);
    if (def !== ENGINE_ONE || pref !== '') {
        fail(`a one-off must change neither Gecko's default nor the setting; default ${JSON.stringify(def)}, ${ENGINE_PREF} ${JSON.stringify(pref)}`);
    }
    if (!await typeForOneOffs(app)) {
        return fail('typing "hello" again showed no one-off strip');
    }
    let highlighted = false;
    for (let i = 0; i < 12 + want.length && !highlighted; i++) {
        await pressKey(app, ARROW_DOWN);
        highlighted = !!(await readOneOffs(app))?.buttons[twoAt]?.highlighted;
    }
    if (!highlighted) {
        return fail(`ArrowDown past the last row never highlighted the ${ENGINE_TWO} one-off`);
    }
    mark = pages.requests.length;
    await pressKey(app, ENTER);
    if (!await nextGet(pages, '/two/search', mark, r => queryOf(r) === 'hello')) {
        fail(`no GET on /two/search with q "hello" after Enter on the highlighted one-off; requests since the mark: ${JSON.stringify(pages.requests.slice(mark).map(r => r.path + r.search))}; pill ${JSON.stringify(await readPill(app))}; one-offs ${JSON.stringify(await readOneOffs(app))}`);
    }
    if (!await typeForOneOffs(app)) {
        return fail('typing "hello" a third time showed no one-off strip');
    }
    pushMark = (await pushes(app)).length;
    await fireOneOff(app, 'auxclick', { button: 1 });
    const bg = await waitForPush(app, p => p && p.kind === 'state' && p.tabId !== tabId && pathOf(p.url) === '/two/search', { from: pushMark });
    if (bg < 0) {
        fail('a middle-click on the one-off opened no new tab on /two/search');
    }
    const stayed = await probe(app, `return get('ApplicationShell').mainPanel.currentTitle?.owner === get('WebTabChannel').widgetOf(${JSON.stringify(tabId)});`);
    if (stayed !== true) {
        fail('a middle-click on the one-off changed the current tab (it must open in the background)');
    }
    const others = listed.filter(name => name !== ENGINE_ONE);
    try {
        if (!await setEnginesHidden(app, others, true)) {
            return fail(`${BROKEN} the engines other than ${ENGINE_ONE} could not be hidden chrome-side`);
        }
        await typeInPill(app, '');
        await typeInPill(app, 'hello');
        const one = await settle(() => readRows(app), v => v.rows[0]?.title === 'hello');
        if (!one.open || one.rows[0]?.title !== 'hello') {
            fail(`${BROKEN} with one engine the dropdown did not open for "hello"; saw ${JSON.stringify(one)}`);
        } else if (await readOneOffs(app)) {
            fail('with one engine the one-off strip must be hidden');
        }
    } finally {
        await setEnginesHidden(app, others, false);
    }
}

/**
 * The served origin under the name localhost: a second site, so this plan's
 * tabs stay clear of the four-tab budget on 127.0.0.1 (Phase 27's deferred
 * same-process reload defect).
 */
const localUrl = (pages, path) => pages.url(path).replace('//127.0.0.1:', '//localhost:');

/** Dispatches a mousedown on the dropdown row `id` (React listens at its root); primary button unless `init` says otherwise. */
const rowMouseDown = (app, id, init = {}) => app.evaluate(`(() => {
    const r = document.getElementById(${JSON.stringify(id)});
    if (!r) return false;
    r.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, ...${JSON.stringify(init)} }));
    return true;
})()`);

/** The tab id of the main area's current tab, or null. */
const mainTabId = app => probe(app, `return get('ApplicationShell').mainPanel.currentTitle?.owner?.tabId ?? null;`);

/** Clears and retypes `text` until a row matching `pred` shows (the tab store catches up a moment after a load). */
async function typeUntilRow(app, text, pred, timeoutMs = 20000) {
    let view;
    const end = Date.now() + timeoutMs;
    do {
        await typeInPill(app, '');
        await typeInPill(app, text);
        view = await settle(() => readRows(app), v => v.rows.some(pred), 4000);
    } while (!view.rows.some(pred) && Date.now() < end);
    return view;
}

async function switchToTab(ctx) {
    const { app, pages, plant, fail, note } = ctx;
    const urlA = localUrl(pages, '/sw-a');
    const tabA = await openWebTab(app, urlA);
    // The positive control for the no-load check below: the recorder sees A's loads.
    if (await waitForPush(app, loadedAt(tabA, '/sw-a')) < 0) {
        return fail(`${BROKEN} no loaded state push arrived for /sw-a`);
    }
    const tabB = await openWebTab(app, localUrl(pages, '/sw-b'));
    if (await waitForPush(app, loadedAt(tabB, '/sw-b')) < 0) {
        return fail(`${BROKEN} no loaded state push arrived for /sw-b`);
    }
    if (plant === 'tab-row-navigates') {
        const planted = await probe(app, `const w = get('ChromeBarWidget');
            w.switchToTab = function (row) { return this.commitRow(row); };
            return true;`);
        if (planted === true) {
            note('PLANT tab-row-navigates applied');
        }
    }
    const isTabRow = r => r.caption === urlA && r.type === 'codicon-browser';
    for (const how of ['click', 'Enter']) {
        if (await makeCurrent(app, tabB) !== true) {
            return fail(`${BROKEN} the /sw-b tab could not be made current`);
        }
        const view = await typeUntilRow(app, 'Switch Alpha', isTabRow);
        const row = view.rows.find(isTabRow);
        if (!row || row.switchText !== 'Switch to Tab') {
            return fail(`${how}: typing "Switch Alpha" must show the /sw-a open-tab row with the codicon-browser marker and "Switch to Tab"; saw ${JSON.stringify(view.rows)}`);
        }
        if (how === 'Enter') {
            let on = false;
            for (let i = 0; i < 12 && !on; i++) {
                await pressKey(app, ARROW_DOWN);
                on = !!(await readRows(app)).rows.find(isTabRow)?.selected;
            }
            if (!on) {
                return fail('ArrowDown never highlighted the /sw-a open-tab row');
            }
        }
        const mark = (await pushes(app)).length;
        const getMark = pages.requests.length;
        if (how === 'click') {
            await rowMouseDown(app, row.id);
        } else {
            await pressKey(app, ENTER);
        }
        const current = await settle(() => mainTabId(app), id => id === tabA);
        if (current !== tabA) {
            fail(`${how}: choosing the open-tab row must make /sw-a's tab current; the current tab is ${JSON.stringify(current)} (A ${tabA}, B ${tabB})`);
        }
        const focused = await settle(() => chromeActiveTabId(app), id => id === tabA);
        if (focused !== tabA) {
            fail(`${how}: chrome's active element must be /sw-a's overlay after the switch; it is ${JSON.stringify(focused)}`);
        }
        const pill = await settle(() => readPill(app), v => v.value === urlA);
        if (pill.value !== urlA) {
            fail(`${how}: the pill must show /sw-a's address after the switch; it shows ${JSON.stringify(pill.value)}`);
        }
        // Long enough for a load the choice started to push its start.
        await sleep(1500);
        const loads = (await pushes(app)).slice(mark)
            .filter(p => p && p.kind === 'state' && p.loading === true && (p.tabId === tabA || p.tabId === tabB));
        if (loads.length) {
            fail(`${how}: a state push with loading: true arrived after choosing the open-tab row (switching must not load): ${JSON.stringify(loads.map(p => [p.tabId === tabA ? 'A' : 'B', pathOf(p.url)]))}`);
        }
        const gets = pages.requests.slice(getMark).filter(r => r.path === '/sw-a');
        if (gets.length) {
            fail(`${how}: choosing the open-tab row sent ${gets.length} new GET(s) on /sw-a`);
        }
    }
}

/** The index of web tab `tabId` in its main-area tab bar, or -1. */
const tabIndex = (app, tabId) => probe(app, `const w = get('WebTabChannel').widgetOf(${JSON.stringify(tabId)});
    const bar = w && get('ApplicationShell').getTabBarFor(w);
    return bar ? bar.titles.indexOf(w.title) : -1;`);

/** Records, page-realm, the tab id of every widget the active group is asked to take (the join call itself). */
const recordJoins = app => probe(app, `const g = get('GroupModel');
    window.__pbJoined = [];
    if (!g.__pbJoinSpy) {
        const original = Object.getPrototypeOf(g).joinActiveGroup;
        g.joinActiveGroup = function (widget) { window.__pbJoined.push(widget.tabId ?? widget.id); return original.call(this, widget); };
        g.__pbJoinSpy = true;
    }
    return true;`);
const joined = app => app.evaluate('JSON.stringify(window.__pbJoined || [])').then(JSON.parse);

const ALT_ENTER = { ...ENTER, modifiers: ['alt'] };

async function newTabTargets(ctx) {
    const { app, pages, fail } = ctx;
    const startId = await sessionTab(ctx);
    if (await recordJoins(app) !== true) {
        return fail(`${BROKEN} the active-group join could not be recorded`);
    }
    const port = new URL(pages.origin).port;
    const known = new Set([startId]);
    /** The id of the first tab not seen before whose state push ends `path`, at or after push `from`; null on timeout. */
    const newTabOn = async (path, from) => {
        const at = await waitForPush(app, p => p && p.kind === 'state' && !known.has(p.tabId) && pathOf(p.url) === path, { from });
        if (at < 0) {
            return null;
        }
        const id = (await pushes(app))[at].tabId;
        known.add(id);
        return id;
    };
    /** Shared checks for a new tab `id` on `path` opened after `refId`. */
    const placed = async (how, id, path, refId, foreground) => {
        const want = await tabIndex(app, refId) + 1;
        const at = await tabIndex(app, id);
        if (at !== want) {
            fail(`${how}: the new ${path} tab must sit directly after the current one (index ${want}); it is at ${at}`);
        }
        if (!(await joined(app)).includes(id)) {
            fail(`${how}: the new ${path} tab was not joined to the active group (joins recorded: ${JSON.stringify(await joined(app))})`);
        }
        const currentWant = foreground ? id : refId;
        // A background tab must not take over: give a late activation time to land.
        const current = foreground ? await settle(() => mainTabId(app), v => v === id) : (await sleep(1000), await mainTabId(app));
        if (current !== currentWant) {
            fail(`${how}: the current tab must be ${foreground ? 'the new' : 'the previous'} one (${currentWant}); it is ${JSON.stringify(current)}`);
        }
    };

    // Alt+Enter on typed text: a new foreground tab.
    let mark = (await pushes(app)).length;
    await typeInPill(app, `localhost:${port}/nt-fg`);
    await pressKey(app, ALT_ENTER);
    const fgId = await newTabOn('/nt-fg', mark);
    if (!fgId) {
        return fail(`Alt+Enter on "localhost:${port}/nt-fg" opened no new tab on /nt-fg; pill ${JSON.stringify(await readPill(app))}`);
    }
    await placed('Alt+Enter', fgId, '/nt-fg', startId, true);
    const focused = await settle(() => chromeActiveTabId(app), id => id === fgId);
    if (focused !== fgId) {
        fail(`Alt+Enter: chrome's active element must be the new tab's overlay; it is ${JSON.stringify(focused)}`);
    }
    if (await makeCurrent(app, fgId) !== true) {
        return fail(`${BROKEN} the /nt-fg tab could not be made current`);
    }
    const committed = localUrl(pages, '/nt-fg');
    /** After a background gesture: no dropdown, and the pill back on the current tab's address. */
    const reverted = async how => {
        const view = await settle(() => readRows(app), v => !v.open);
        if (view.open) {
            fail(`${how}: the dropdown must close; ${view.rows.length} row(s) still showing`);
        }
        const pill = await settle(() => readPill(app), v => v.value === committed);
        if (pill.value !== committed) {
            fail(`${how}: the pill must revert to the committed address ${JSON.stringify(committed)}; it shows ${JSON.stringify(pill.value)}`);
        }
    };

    // Ctrl+click on the heuristic row: a new background tab.
    await typeInPill(app, `localhost:${port}/nt-bg`);
    const typed = await settle(() => readRows(app), v => v.open && v.rows.length > 0);
    if (!typed.rows[0]) {
        return fail(`${BROKEN} typing "localhost:${port}/nt-bg" showed no heuristic row`);
    }
    mark = (await pushes(app)).length;
    await rowMouseDown(app, typed.rows[0].id, { ctrlKey: true });
    const bgId = await newTabOn('/nt-bg', mark);
    if (!bgId) {
        fail('Ctrl+click on the heuristic row opened no new tab on /nt-bg');
    } else {
        await placed('Ctrl+click', bgId, '/nt-bg', fgId, false);
        await reverted('Ctrl+click');
    }

    // Middle-click on a history row: a new background tab.
    const urlMid = localUrl(pages, '/nt-mid');
    const seeded = await inChrome(app, `return (async () => {
        try {
            const { PlacesUtils } = ChromeUtils.importESModule('resource://gre/modules/PlacesUtils.sys.mjs');
            await PlacesUtils.history.insert({ url: ${JSON.stringify(urlMid)}, title: 'Middle Page', visits: [{ date: new Date() }] });
            return 'ok';
        } catch (e) {
            return 'error: ' + e;
        }
    })();`);
    if (seeded !== 'ok') {
        return fail(`${BROKEN} the /nt-mid history visit could not be seeded (${String(seeded)})`);
    }
    const isMid = r => r.caption === urlMid && r.type === 'codicon-history';
    const midView = await typeUntilRow(app, 'Middle Page', isMid);
    const midRow = midView.rows.find(isMid);
    if (!midRow) {
        return fail(`typing "Middle Page" must show the /nt-mid history row; saw ${JSON.stringify(midView.rows)}`);
    }
    mark = (await pushes(app)).length;
    await rowMouseDown(app, midRow.id, { button: 1, buttons: 4 });
    const midId = await newTabOn('/nt-mid', mark);
    if (!midId) {
        fail('a middle-click on the history row opened no new tab on /nt-mid');
    } else {
        await placed('middle-click', midId, '/nt-mid', fgId, false);
        await reverted('middle-click');
    }

    // Ctrl+click on an open-tab row opens its address again rather than switching.
    const isOpenTab = r => r.caption === committed && r.type === 'codicon-browser';
    const tabView = await typeUntilRow(app, 'Target Foreground', isOpenTab);
    const tabRow = tabView.rows.find(isOpenTab);
    if (!tabRow) {
        return fail(`typing "Target Foreground" must show the /nt-fg open-tab row; saw ${JSON.stringify(tabView.rows)}`);
    }
    mark = (await pushes(app)).length;
    await rowMouseDown(app, tabRow.id, { ctrlKey: true });
    const dupId = await newTabOn('/nt-fg', mark);
    if (!dupId) {
        fail('Ctrl+click on the open-tab row opened no new tab on /nt-fg (it must open the address again, not switch)');
    } else {
        await placed('Ctrl+click on an open-tab row', dupId, '/nt-fg', fgId, false);
        const copies = await probe(app, `return webTabs().filter(w => w.url === ${JSON.stringify(committed)}).length;`);
        if (copies !== 2) {
            fail(`Ctrl+click on the open-tab row must leave two tabs on /nt-fg; there are ${JSON.stringify(copies)}`);
        }
    }
}

/** The pill's value, selection and focus. */
const readSel = app => app.evaluate(`JSON.stringify((() => {
    const input = document.querySelector('.pb-chrome-bar-input');
    return input ? { value: input.value, start: input.selectionStart, end: input.selectionEnd, focused: document.activeElement === input } : null;
})())`).then(JSON.parse);

/** Focuses the pill, selects its text, then types `text` one key at a time at the parent (trusted insertText). */
async function typeKeys(app, text, { selectAll = true } = {}) {
    if (await focusTheiaFrame(app) !== true) {
        throw new Error(`${BROKEN} the Theia frame could not be made chrome's active element`);
    }
    const ready = await app.evaluate(`(() => {
        const input = document.querySelector('.pb-chrome-bar-input');
        if (!input) return false;
        input.focus();
        if (${selectAll}) input.select();
        return document.activeElement === input;
    })()`);
    if (ready !== true) {
        throw new Error(`${BROKEN} the pill could not be focused for typing`);
    }
    for (const ch of text) {
        const upper = ch.toUpperCase();
        await pressKey(app, { key: ch, code: `Key${upper}`, keyCode: upper.charCodeAt(0) });
    }
}

const TAB_KEY = { key: 'Tab', code: 'Tab', keyCode: 9 };
const BACKSPACE = { key: 'Backspace', code: 'Backspace', keyCode: 8 };

/** Chrome scope: seeds a visit to `url` and waits until its origin's frecency is above 0 on the read-only connection. */
const seedOrigin = (app, url, host) => inChrome(app, `return (async () => {
    try {
        const { PlacesUtils } = ChromeUtils.importESModule('resource://gre/modules/PlacesUtils.sys.mjs');
        await PlacesUtils.history.insert({ url: ${JSON.stringify(url)}, title: 'Autofill Page', visits: [{ date: new Date() }] });
        // A new origin row arrives with recalc_frecency = 1; the recalculator fills its frecency in on a deferred task.
        await Cc['@mozilla.org/places/frecency-recalculator;1'].getService(Ci.nsIObserver).wrappedJSObject.recalculateAnyOutdatedFrecencies();
        const db = await PlacesUtils.promiseDBConnection();
        for (let i = 0; i < 50; i++) {
            const rows = await db.execute("SELECT frecency FROM moz_origins WHERE prefix = 'http://' AND host = :host", { host: ${JSON.stringify(host)} });
            if (rows.length && rows[0].getResultByName('frecency') > 0) return 'ok';
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        return 'never';
    } catch (e) {
        return 'error: ' + e;
    }
})();`);

async function autofill(ctx) {
    const { app, pages, plant, fail, note } = ctx;
    const port = new URL(pages.origin).port;
    const host = `localhost:${port}`;
    const origin = `http://${host}/`;
    const completed = `${host}/`;
    const seeded = await seedOrigin(app, localUrl(pages, '/af'), host);
    if (seeded !== 'ok') {
        return fail(`${BROKEN} the seeded origin never reached frecency > 0 on the read-only Places connection (${String(seeded)})`);
    }
    // A tab on the same site, so Enter navigates it without a process switch (Phase 27's reload defect).
    const tabId = await openWebTab(app, localUrl(pages, '/af'));
    if (await waitForPush(app, loadedAt(tabId, '/af')) < 0 || await makeCurrent(app, tabId) !== true) {
        return fail(`${BROKEN} no current web tab on localhost /af`);
    }
    const completes = (typedLength, v) => v && v.value === completed && v.start === typedLength && v.end === completed.length;

    await typeKeys(app, 'loc');
    const filled = await settle(() => readSel(app), v => completes(3, v));
    if (!completes(3, filled)) {
        const reply = await probe(app, `return await get('ChromeStoreClient').autofillOrigin('loc');`);
        return fail(`typing "loc" must complete the pill to ${JSON.stringify(completed)} with characters 3..${completed.length} selected; saw ${JSON.stringify(filled)}; chrome's autofillOrigin('loc') replies ${JSON.stringify(reply)}`);
    }
    const view = await settle(() => readRows(app), v => v.rows[0]?.title === origin);
    if (view.rows[0]?.title !== origin || view.rows[0]?.caption !== 'Visit') {
        fail(`the heuristic row must be a "Visit" of ${origin}; saw ${JSON.stringify(view.rows[0])}`);
    }
    await pressKey(app, TAB_KEY);
    const tabbed = await settle(() => readSel(app), v => v && v.start === v.end);
    const open = (await readRows(app)).open;
    if (!tabbed || tabbed.value !== completed || tabbed.start !== completed.length || tabbed.end !== completed.length || !tabbed.focused || !open) {
        fail(`Tab must accept the completion: the selection collapsed at the end, focus in the pill and the dropdown open; saw ${JSON.stringify({ ...tabbed, open })}`);
    }
    const mark = (await pushes(app)).length;
    const getMark = pages.requests.length;
    await pressKey(app, ENTER);
    const got = await nextGet(pages, '/', getMark);
    if (!got) {
        fail(`Enter on the completion sent no GET on / of the served origin; pill ${JSON.stringify(await readSel(app))}`);
    }
    if (await waitForPush(app, p => p && p.kind === 'state' && p.tabId === tabId && p.url === origin, { from: mark, timeoutMs: got ? 15000 : 1000 }) < 0) {
        fail(`no state push for the tab carried ${origin} after Enter`);
    }

    await typeKeys(app, 'loc');
    const again = await settle(() => readSel(app), v => completes(3, v));
    if (!completes(3, again)) {
        return fail(`typing "loc" a second time did not complete (the positive control for Backspace); saw ${JSON.stringify(again)}`);
    }
    await pressKey(app, BACKSPACE);
    const removed = await settle(() => readSel(app), v => v && v.value === 'loc');
    // Past the debounced re-query the Backspace started: it must not complete again.
    await sleep(1200);
    const later = await readSel(app);
    if (removed?.value !== 'loc' || later?.value !== 'loc' || later.start !== 3 || later.end !== 3) {
        fail(`Backspace must remove the completion and leave "loc" with no selection; saw ${JSON.stringify(removed)}, then ${JSON.stringify(later)}`);
    }
    await typeKeys(app, 'a', { selectAll: false });
    const back = await settle(() => readSel(app), v => completes(4, v));
    if (!completes(4, back)) {
        fail(`typing "a" after Backspace must complete again; saw ${JSON.stringify(back)}`);
    }

    if (plant === 'autofill-on-paste') {
        const planted = await probe(app, `const w = get('ChromeBarWidget');
            w.autofillEligible = function (e) { const i = e.target; return !this.autofillSuppressed && i.selectionStart === i.value.length && !/\\s/.test(i.value); };
            return true;`);
        if (planted === true) {
            note('PLANT autofill-on-paste applied');
        }
    }
    const pasted = await app.evaluate(`(() => {
        const input = document.querySelector('.pb-chrome-bar-input');
        if (!input) return false;
        input.focus();
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'loc');
        input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste', data: 'loc' }));
        return true;
    })()`);
    if (pasted !== true) {
        return fail(`${BROKEN} the paste-shaped input event could not be dispatched`);
    }
    // The query the paste started has answered once the heuristic row describes "loc".
    const answered = await settle(() => readRows(app), v => v.rows[0]?.title === 'loc', 8000);
    if (answered.rows[0]?.title !== 'loc') {
        const seen = await readSel(app);
        return fail(seen?.value === 'loc'
            ? `${BROKEN} the query for the pasted "loc" never answered; rows ${JSON.stringify(answered.rows)}`
            : `autofilled a paste: the pill reads ${JSON.stringify(seen)}`);
    }
    await sleep(1000);
    const after = await readSel(app);
    if (after?.value !== 'loc') {
        fail(`autofilled a paste: the pill reads ${JSON.stringify(after)}`);
    }
}

const CTRL_ENTER = { ...ENTER, modifiers: ['control'] };

/** The URLs the wrapped openCommittedUrl recorded. */
const committedUrls = app => app.evaluate('JSON.stringify(window.__pbCommitted || [])').then(JSON.parse);

async function canonizeDrop(ctx) {
    const { app, fail } = ctx;
    await sessionTab(ctx);
    const canon = await probe(app, `return await get('ChromeStoreClient').resolveTypedAddress('example', '', true);`);
    if (canon?.kind !== 'visit' || canon.url !== 'https://www.example.com/') {
        fail(`resolveTypedAddress('example', '', true) must reply a visit of https://www.example.com/; got ${JSON.stringify(canon)}`);
    }
    const plain = await probe(app, `return await get('ChromeStoreClient').resolveTypedAddress('example', '', false);`);
    if (plain?.kind !== 'search') {
        fail(`resolveTypedAddress('example', '', false) must reply kind search; got ${JSON.stringify(plain)}`);
    }
    // The UI half records the commit instead of loading it: www.example.com is a public host.
    const wrapped = await probe(app, `const w = get('ChromeBarWidget');
        window.__pbCommitted = [];
        w.__pbOpenCommitted = w.openCommittedUrl;
        w.openCommittedUrl = async url => { window.__pbCommitted.push(url); };
        return true;`);
    if (wrapped !== true) {
        return fail(`${BROKEN} the widget's openCommittedUrl could not be wrapped`);
    }
    try {
        for (const [text, want] of [['example', 'https://www.example.com/'], ['example.org', 'https://example.org/']]) {
            await app.evaluate('window.__pbCommitted = []; true');
            await typeInPill(app, text);
            await pressKey(app, CTRL_ENTER);
            const got = await settle(() => committedUrls(app), v => v.length > 0, 8000);
            if (got.length !== 1 || got[0] !== want) {
                fail(`Ctrl+Enter on "${text}" must commit ${want}; the commit recorded ${JSON.stringify(got)}`);
            }
        }
    } finally {
        await probe(app, `const w = get('ChromeBarWidget');
            if (w.__pbOpenCommitted) { w.openCommittedUrl = w.__pbOpenCommitted; delete w.__pbOpenCommitted; }
            return true;`);
    }
    await dropOnPill(ctx);
}

/**
 * Synthesises dragenter, dragover and (unless `drop` is false) drop on the
 * pill with `data`; returns the dragover's verdict. After a drop the pill's
 * value is sampled every frame into window.__pbPillSeen until a recorded push
 * at index >= `pushMark` ends `path` (or 15 s pass); a sample taken after that
 * push could show the pushed address, so none is.
 */
const dragOntoPill = (app, data, { drop = true, path = '', pushMark = 0 } = {}) => app.evaluate(`JSON.stringify((() => {
    const pill = document.querySelector('.pb-chrome-bar-pill');
    const input = document.querySelector('.pb-chrome-bar-input');
    if (!pill || !input) return null;
    const dt = new DataTransfer();
    for (const [type, value] of Object.entries(${JSON.stringify(data)})) dt.setData(type, value);
    const fire = type => { const e = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }); input.dispatchEvent(e); return e; };
    fire('dragenter');
    const over = fire('dragover');
    const seen = { prevented: over.defaultPrevented, dropEffect: dt.dropEffect, ring: pill.classList.contains('is-drop-target') };
    if (${drop}) {
        window.__pbPillSeen = [input.value];
        const path = ${JSON.stringify(path)};
        const end = performance.now() + 15000;
        // A push carrying the path may set the pill itself, so sampling stops before reading past one.
        const sample = () => {
            const pushed = path && (window.__pbPushes || []).slice(${pushMark}).some(p => p && p.kind === 'state' && String(p.url).endsWith(path));
            if (pushed || performance.now() >= end) return;
            window.__pbPillSeen.push(input.value);
            requestAnimationFrame(sample);
        };
        fire('drop');
        seen.valueAfterDrop = input.value;
        seen.ringAfter = pill.classList.contains('is-drop-target');
        requestAnimationFrame(sample);
    }
    return seen;
})())`).then(JSON.parse);

async function dropOnPill(ctx) {
    const { app, pages, fail } = ctx;
    const tabId = await sessionTab(ctx);
    const payload = pages.url('/dropped');

    let mark = (await pushes(app)).length;
    let getMark = pages.requests.length;
    const link = await dragOntoPill(app, { 'text/uri-list': `# a comment\n${payload}` }, { path: '/dropped', pushMark: mark });
    if (!link) {
        return fail(`${BROKEN} the pill is missing`);
    }
    if (!link.prevented || link.dropEffect !== 'copy' || !link.ring || link.ringAfter) {
        fail(`a link dragged over the pill must show the ring with dropEffect copy, and the ring must go at the drop; saw ${JSON.stringify(link)}`);
    }
    const linkGet = await nextGet(pages, '/dropped', getMark);
    if (!linkGet) {
        fail(`dropping a link on the pill sent no GET on /dropped; pill ${JSON.stringify(await readPill(app))}`);
    }
    if (await waitForPush(app, loadedAt(tabId, '/dropped'), { from: mark, timeoutMs: linkGet ? 15000 : 1000 }) < 0) {
        fail('dropping a link on the pill did not load /dropped in the current tab (no loaded push for the session tab)');
    }
    const sampled = await app.evaluate('JSON.stringify(window.__pbPillSeen || [])').then(JSON.parse);
    if (!sampled.length) {
        fail(`${BROKEN} the pill was never sampled after the drop`);
    } else if (sampled.includes(payload)) {
        fail(`the dropped payload was put in the pill before the load's push (sampled ${JSON.stringify(sampled.slice(0, 8))})`);
    }

    mark = (await pushes(app)).length;
    getMark = pages.requests.length;
    const text = await dragOntoPill(app, { 'text/plain': 'dropped words' }, { path: '/one/search', pushMark: mark });
    if (!text?.prevented || text.dropEffect !== 'copy' || text.ring) {
        fail(`plain text dragged over the pill must get dropEffect copy and no ring; saw ${JSON.stringify(text)}`);
    }
    const searched = await nextGet(pages, '/one/search', getMark, r => queryOf(r) === 'dropped words');
    if (!searched) {
        fail(`dropping "dropped words" on the pill sent no GET on /one/search with q "dropped words"; requests ${JSON.stringify(pages.requests.slice(getMark).map(r => r.path + r.search))}`);
    }

    const refusedLink = await dragOntoPill(app, { 'text/uri-list': 'javascript:alert(1)' }, { drop: false });
    if (refusedLink?.ring || refusedLink?.dropEffect !== 'none') {
        fail(`a javascript: link over the pill must be refused with no ring and dropEffect none; saw ${JSON.stringify(refusedLink)}`);
    }
    mark = (await pushes(app)).length;
    await dragOntoPill(app, { 'text/plain': 'javascript:alert(1)' }, { path: 'never', pushMark: mark });
    const pill = await settle(() => readPill(app), v => v.rows.length === 1 && v.rows[0].includes("couldn't open that address"));
    if (pill.rows.length !== 1 || !pill.rows[0].includes("couldn't open that address")) {
        fail(`dropped javascript: text must show the one commit-failure row; saw ${JSON.stringify(pill)}`);
    }
    await sleep(1000);
    const loads = (await pushes(app)).slice(mark).filter(p => p && p.kind === 'state' && p.tabId === tabId && String(p.url).startsWith('javascript:'));
    if (loads.length) {
        fail(`dropped javascript: text reached the tab: ${JSON.stringify(loads)}`);
    }
}

const SCENARIOS = {
    'token-cookie': tokenCookie,
    search,
    refused,
    'no-engine': noEngine,
    'dev-addresses': devAddresses,
    'default-engine': defaultEngine,
    rows,
    'failure-rows': failureRows,
    suggestions,
    'one-off': oneOff,
    'switch-to-tab': switchToTab,
    'new-tab-targets': newTabTargets,
    autofill,
    'canonize-drop': canonizeDrop,
};

/** The scenario each not-scored-capable scenario takes as its positive control. */
const CONTROL_OF = { refused: 'search', 'no-engine': 'search', 'dev-addresses': 'search' };

/** One session over `names`; returns `[{ name, failures, notes, notScored }]` or throws. */
async function runSession(names, plant = '') {
    const pages = await serveNavPages(PAGES);
    try {
        return await withProbeShell(async app => {
            await installEngine(app, pages);
            const results = [];
            const shared = {};
            for (const name of names) {
                const result = { name, failures: [], notes: [], notScored: false, passNotes: [] };
                const ctx = {
                    app, pages, plant, results, shared,
                    fail: reason => { result.failures.push(reason); },
                    note: text => { result.notes.push(text); },
                    passNote: text => { result.passNotes.push(text); },
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
            console.log(`${r.name}: PASS${r.passNotes.length ? ` (${r.passNotes.join('; ')})` : ''}`);
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
    { plant: 'engine-name-dropped', target: 'default-engine', run: ['default-engine'], expect: 'no GET on /two/search' },
    { plant: 'token-strip-off', target: 'token-cookie', run: ['token-cookie'], expect: `carried ${TOKEN_COOKIE}: stock-window, overlay, subresource, worker` },
    { plant: 'dedupe-off', target: 'rows', run: ['rows'], expect: 'two rows for one url' },
    { plant: 'setting-ignored', target: 'suggestions', run: ['suggestions'], expect: 'suggest request while the setting was off' },
    { plant: 'oneoff-default', target: 'one-off', run: ['one-off'], expect: 'no GET on /two/search' },
    { plant: 'tab-row-navigates', target: 'switch-to-tab', run: ['switch-to-tab'], expect: 'loading: true' },
    { plant: 'autofill-on-paste', target: 'autofill', run: ['autofill'], expect: 'autofilled a paste' },
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
