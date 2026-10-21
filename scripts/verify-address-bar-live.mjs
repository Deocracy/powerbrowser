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
 *
 * Needs the built browser and the last Theia app build; not a --quick check.
 */

import {
    appNameExpr,
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

const PAGES = {
    '/start': { title: 'Address Start', body: '<p>start</p>' },
    '/one/search': { title: 'Probe One Results', body: '<p>results</p>' },
    '/two/search': { title: 'Probe Two Results', body: '<p>results</p>' },
    '/dev': { title: 'Dev Page', body: '<p>dev</p>' },
    '/cookie-stock': { title: 'Cookie Stock', body: '<p>stock</p>' },
    '/cookie-page': { title: 'Cookie Page', body: COOKIE_PAGE_BODY },
    '/pixel': { title: 'Pixel', body: '' },
    '/cookie-worker': { title: 'Cookie Worker', body: '' },
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

const SCENARIOS = {
    'token-cookie': tokenCookie,
    search,
    refused,
    'no-engine': noEngine,
    'dev-addresses': devAddresses,
    'default-engine': defaultEngine,
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
