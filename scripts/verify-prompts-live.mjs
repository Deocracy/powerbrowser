#!/usr/bin/env node
/**
 * Phase 37 (PROMPT-01, D-01, D-04, D-11): the permission prompts, driven in the
 * built shell with the startup cache purged (MOZ_PURGE_CACHES=1).
 *
 * A prompt is answered the way a user answers it: chrome activates the stock
 * popupnotification's own Allow or Block button (and, when asked, its stock
 * Remember checkbox) inside #notification-popup, after the stock click delay.
 * No Theia path, no webTab kind and no harness-written permission takes part.
 * #notification-popup is XUL and BiDi cannot see it, so nothing here queries it
 * through BiDi: outcomes are read page-side (the page's own geolocation
 * callback) and chrome-side (the stock notification object, the panel state and
 * geometry).
 *
 * Scenarios:
 *   permission       -- the active tab's request shows the stock doorhanger with
 *                       its anchor inside the chrome bar; Allow after the delay
 *                       grants, Block in a second tab denies;
 *   answer-delay     -- an Allow click inside the delay is ignored (the stock
 *                       console line proves the branch ran) and the page waits;
 *                       Allow after the delay then grants (positive control);
 *   background-queue -- a background tab's request shows no panel, keeps its
 *                       pending push, does not show on another tab's
 *                       activation, and shows and grants once its tab is active;
 *   cancel-on-evict  -- three background requests wait; a fourth evicts the
 *                       oldest, whose page sees a denial and whose stock
 *                       notification is gone; the other three grant.
 *
 * --self-test runs a clean control session per target scenario, then one
 * session per planted fault, each required to go red naming its drift.
 * --self-test --static runs only the offline half: every plant targets a real
 * scenario and names a failure text the scenario actually emits, every scenario
 * has a plant, and the stock console line and delay pref are upstream's own.
 *
 * Usage: verify-prompts-live.mjs [--scenario a,b] [--self-test [--static]] [--help]
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT } from './lib/pb-relaunch.mjs';
import { inChrome, loadedAt, makeCurrent, openWebTab, pollFor, serveNavPages, waitForPush, withProbeShell } from './lib/pb-live-probe.mjs';

const NAME = 'prompts-live';
const SELF = fileURLToPath(import.meta.url);
const UPSTREAM_PN = 'upstream/toolkit/modules/PopupNotifications.sys.mjs';
/** The stock security-delay console line (PopupNotifications.sys.mjs _onButtonEvent); its presence proves the branch ran. */
const DELAY_LINE = 'Button click happened before the security delay';
const DELAY_PREF = 'security.notification_enable_delay';
const GEO_ID = 'geolocation';

/** A geolocation provider that answers from a data: URL, so a granted request resolves without the network. */
const PREFS = {
    'geo.provider.network.url': 'data:application/json,{"location":{"lat":51.5,"lng":-0.1},"accuracy":10}',
    'geo.provider.use_gpsd': false,
    'geo.provider.use_geoclue': false,
    'geo.prompt.open_system_prefs': false,
    // A wide delay keeps the early click inside it on a slow host; answerStock reads the pref, never a literal.
    [DELAY_PREF]: 2000,
};

const PAGES = Object.fromEntries(['a', 'b', 'c', 'd', 'e'].map(p => [`/${p}`, { title: `Prompt ${p}`, body: `<p>prompt page ${p}</p>` }]));

/** BROKEN INSTRUMENT when there is no built binary carrying the current patch 050; null when there is. */
function preflight() {
    let stamp;
    try {
        stamp = readFileSync(join(REPO_ROOT, 'objdir/.pb-050-build.sha256'), 'utf8').trim().split(/\s+/)[0];
    } catch {
        return 'BROKEN INSTRUMENT: no built binary (objdir/.pb-050-build.sha256 is missing); build the browser first';
    }
    const actual = createHash('sha256').update(readFileSync(join(REPO_ROOT, 'patches/050-extension-tab-host.patch'))).digest('hex');
    return actual === stamp ? null : `BROKEN INSTRUMENT: the binary stamp does not match patches/050-extension-tab-host.patch; rebuild first`;
}

/** Opens `path` as a web tab, waits for its loaded push, and returns { tabId, ctx } with ctx the page's BiDi context. */
async function openPage(app, fx, path) {
    const url = fx.url(path);
    const tabId = await openWebTab(app, url);
    if (await waitForPush(app, loadedAt(tabId, path)) < 0) {
        throw new Error(`${path} never loaded`);
    }
    const ctx = await pollFor(async () => (await app.contexts()).find(c => c.url === url)?.context, 15000, `a BiDi context for ${path}`);
    return { tabId, ctx };
}

/** Starts a geolocation request in the page; its outcome lands on window.__pbGeo ('pending', 'granted', 'denied'). */
function startGeo(app, page) {
    return app.evaluateIn(page.ctx, `(() => {
        window.__pbGeo = 'pending';
        navigator.geolocation.getCurrentPosition(() => { window.__pbGeo = 'granted'; }, e => { window.__pbGeo = e.code === 1 ? 'denied' : 'granted'; });
        return true;
    })()`);
}

/** The page's outcome after up to `timeoutMs`: the first non-pending value, else 'pending'. */
async function geoOutcome(app, page, timeoutMs = 5000) {
    try {
        return await pollFor(async () => {
            const v = await app.evaluateIn(page.ctx, 'window.__pbGeo');
            return v !== 'pending' ? v : null;
        }, timeoutMs, 'a page outcome');
    } catch {
        return 'pending';
    }
}

/** Chrome's view of tab `tabId`'s stock notification `id`: exists, shown in the open panel. */
function promptState(app, tabId, id = GEO_ID) {
    return inChrome(app, `
        const o = overlayOf(${JSON.stringify(tabId)});
        const n = o ? window.PopupNotifications.getNotification(${JSON.stringify(id)}, o) : null;
        const panel = document.getElementById('notification-popup');
        return { has: !!n, inPanel: !!n && panel.state === 'open' && [...panel.children].some(el => el.notification === n) };`);
}

async function waitInPanel(app, tabId, timeoutMs = 15000) {
    try {
        return await pollFor(async () => ((await promptState(app, tabId)).inPanel ? true : null), timeoutMs, 'the stock doorhanger');
    } catch {
        return false;
    }
}

/**
 * Activates the stock button of tab `tabId`'s notification in chrome (D-11). Allow waits until the stock delay has
 * passed since timeShown (which a rejected click moves); `early` clicks at once; `bypass` is the delay-bypassed plant;
 * `skip` is the answer-dropped plant. Block carries disableSecurityDelay upstream, so it never waits.
 */
function answerStock(app, tabId, { which = 'allow', remember = false, early = false, bypass = false, skip = false } = {}) {
    return inChrome(app, `
        const o = overlayOf(${JSON.stringify(tabId)});
        const n = o ? window.PopupNotifications.getNotification(${JSON.stringify(GEO_ID)}, o) : null;
        const el = n && [...document.getElementById('notification-popup').children].find(e => e.notification === n);
        if (!el) return 'no stock notification element';
        window.focus();
        if (${bypass}) n.mainAction.disableSecurityDelay = true;
        const delay = Services.prefs.getIntPref(${JSON.stringify(DELAY_PREF)}, 500);
        const wait = ${JSON.stringify(which)} === 'allow' && !${early} ? Math.max(0, delay + 100 - (ChromeUtils.now() - n.timeShown)) : 0;
        return new Promise(resolve => setTimeout(() => {
            if (${remember} && !el.checkbox.checked) el.checkbox.click();
            if (!${skip}) (${JSON.stringify(which)} === 'allow' ? el.button : el.secondaryButton).click();
            resolve('clicked');
        }, wait));`);
}

function consoleHas(app, text) {
    return inChrome(app, `return Services.console.getMessageArray().some(m => String(m.message || '').includes(${JSON.stringify(text)}));`);
}

/** The anchor's rect inside the chrome bar's rect (both in shell-window CSS pixels, 1px tolerance). */
async function anchorInBar(app) {
    const anchor = await inChrome(app, `
        const a = document.getElementById('powerbrowser-notification-anchor');
        const f = document.getElementById('powerbrowser-content');
        if (!a || !f) return null;
        const r = a.getBoundingClientRect(); const fr = f.getBoundingClientRect();
        return { left: r.left - fr.left, top: r.top - fr.top, right: r.right - fr.left, bottom: r.bottom - fr.top };`);
    const bar = await app.evaluate(`JSON.stringify((() => { const b = document.querySelector('.pb-chrome-bar'); if (!b) return null; const r = b.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; })())`).then(JSON.parse);
    if (!anchor || !bar) {
        return `the anchor (${JSON.stringify(anchor)}) or the chrome bar (${JSON.stringify(bar)}) has no rect`;
    }
    const inside = anchor.left >= bar.left - 1 && anchor.right <= bar.right + 1 && anchor.top >= bar.top - 1 && anchor.bottom <= bar.bottom + 1;
    return inside ? null : `the doorhanger anchor ${JSON.stringify(anchor)} is outside the chrome bar ${JSON.stringify(bar)}`;
}

const isDoorhanger = (tabId, pending) => p => p && p.kind === 'doorhanger' && p.tabId === tabId && p.pending === pending;

async function scenarioPermission(app, fx, plant) {
    const page = await openPage(app, fx, '/a');
    await startGeo(app, page);
    if (!await waitInPanel(app, page.tabId)) {
        return 'no stock doorhanger in an open #notification-popup for the active tab';
    }
    if (await waitForPush(app, isDoorhanger(page.tabId, true)) < 0) {
        return 'no doorhanger push with pending true for the active tab';
    }
    const geometry = await anchorInBar(app);
    if (geometry) {
        return geometry;
    }
    await answerStock(app, page.tabId, { skip: plant === 'answer-dropped' });
    if (await geoOutcome(app, page) !== 'granted') {
        return 'stock Allow dispatched but page promise unresolved';
    }
    if (await waitForPush(app, isDoorhanger(page.tabId, false)) < 0) {
        return 'no doorhanger push with pending false after the answer';
    }
    // A second tab: the first tab's grant without Remember is temporary and scoped to that tab's browser.
    const second = await openPage(app, fx, '/b');
    await startGeo(app, second);
    if (!await waitInPanel(app, second.tabId)) {
        return 'no stock doorhanger for the second origin';
    }
    await answerStock(app, second.tabId, { which: 'block' });
    const blocked = await geoOutcome(app, second);
    return blocked === 'denied' ? null : `stock Block left the page ${blocked}, not denied`;
}

async function scenarioAnswerDelay(app, fx, plant) {
    const page = await openPage(app, fx, '/a');
    await startGeo(app, page);
    if (!await waitInPanel(app, page.tabId)) {
        return 'no stock doorhanger in an open #notification-popup for the active tab';
    }
    await answerStock(app, page.tabId, { early: true, bypass: plant === 'delay-bypassed' });
    if (await geoOutcome(app, page, 1000) !== 'pending') {
        return 'answer accepted inside the security delay';
    }
    if (!await consoleHas(app, DELAY_LINE)) {
        return `the early click left no "${DELAY_LINE}" console line, so the stock delay branch is not proven to have run`;
    }
    await answerStock(app, page.tabId);
    return await geoOutcome(app, page) === 'granted' ? null : 'Allow after the delay did not grant (the positive control is red)';
}

/** The plant shows the queued notification of `tabId` the way a broken queue would, while it is not the active tab. */
function showQueuedNow(app, tabId) {
    return inChrome(app, `
        const o = overlayOf(${JSON.stringify(tabId)});
        const pn = window.PopupNotifications;
        const list = pn.getNotificationsForBrowser(o);
        pn._update(list, new Set(list.map(n => n.anchorElement)));
        return true;`);
}

async function scenarioBackgroundQueue(app, fx, plant) {
    const back = await openPage(app, fx, '/a');
    const other = await openPage(app, fx, '/b');
    await makeCurrent(app, other.tabId);
    await startGeo(app, back);
    if (await waitForPush(app, isDoorhanger(back.tabId, true)) < 0) {
        return 'no doorhanger push with pending true for the backgrounded tab';
    }
    if (plant === 'queue-shown-early') {
        await showQueuedNow(app, back.tabId);
    }
    let state = await promptState(app, back.tabId);
    if (!state.has) {
        return 'the backgrounded request has no stock notification (it was dropped, not queued)';
    }
    if (state.inPanel) {
        return 'panel shown for a backgrounded tab';
    }
    const third = await openPage(app, fx, '/c');
    await makeCurrent(app, third.tabId);
    if (plant === 'activation-wrong-tab') {
        await showQueuedNow(app, back.tabId);
    }
    state = await promptState(app, back.tabId);
    if (state.inPanel) {
        return 'queued record shown for the wrong tab';
    }
    await makeCurrent(app, back.tabId);
    if (!await waitInPanel(app, back.tabId)) {
        return 'the queued doorhanger did not show when its tab was activated';
    }
    await answerStock(app, back.tabId);
    return await geoOutcome(app, back) === 'granted' ? null : 'Allow after activation did not grant (the positive control is red)';
}

async function scenarioCancelOnEvict(app, fx, plant) {
    const pages = [];
    for (const path of ['/a', '/b', '/c', '/d', '/e']) {
        pages.push(await openPage(app, fx, path));
    }
    const [oldest, ...rest] = pages.slice(0, 4);
    await makeCurrent(app, pages[4].tabId);
    for (const page of [oldest, rest[0], rest[1]]) {
        await startGeo(app, page);
        if (await waitForPush(app, isDoorhanger(page.tabId, true)) < 0) {
            return `no doorhanger push with pending true for a queued tab`;
        }
    }
    if (plant === 'evict-hangs') {
        // Suppresses the stock removal callback, so the eviction cannot reach PermissionUI's cancel().
        await inChrome(app, `const n = window.PopupNotifications.getNotification(${JSON.stringify(GEO_ID)}, overlayOf(${JSON.stringify(oldest.tabId)})); n.options.eventCallback = () => false; return true;`);
    }
    await startGeo(app, rest[2]);
    if (await geoOutcome(app, oldest) !== 'denied') {
        return 'evicted page promise pending, not cancelled';
    }
    if ((await promptState(app, oldest.tabId)).has) {
        return 'the evicted request still has a stock notification';
    }
    for (const page of rest) {
        await makeCurrent(app, page.tabId);
        if (!await waitInPanel(app, page.tabId)) {
            return 'a remaining queued doorhanger did not show on activation';
        }
        await answerStock(app, page.tabId);
        if (await geoOutcome(app, page) !== 'granted') {
            return 'a remaining queued request did not grant after activation (the positive control is red)';
        }
    }
    return null;
}

const SCENARIOS = {
    permission: scenarioPermission,
    'answer-delay': scenarioAnswerDelay,
    'background-queue': scenarioBackgroundQueue,
    'cancel-on-evict': scenarioCancelOnEvict,
};

/** Each plant runs its target scenario with one thing wrong and must go red naming `expect`. */
const PLANTS = [
    { plant: 'answer-dropped', target: 'permission', expect: 'stock Allow dispatched but page promise unresolved' },
    { plant: 'delay-bypassed', target: 'answer-delay', expect: 'answer accepted inside the security delay' },
    { plant: 'queue-shown-early', target: 'background-queue', expect: 'panel shown for a backgrounded tab' },
    { plant: 'activation-wrong-tab', target: 'background-queue', expect: 'queued record shown for the wrong tab' },
    { plant: 'evict-hangs', target: 'cancel-on-evict', expect: 'evicted page promise pending, not cancelled' },
];

async function runSession(name, plant) {
    const fx = await serveNavPages(PAGES);
    try {
        return await withProbeShell(app => SCENARIOS[name](app, fx, plant), { extraPrefs: PREFS });
    } finally {
        await fx.close();
    }
}

/** The offline half of the self-test; failures name the drift. */
function staticAudit() {
    const failures = [];
    const own = readFileSync(SELF, 'utf8');
    const body = own.slice(0, own.indexOf('const PLANTS = ['));
    for (const p of PLANTS) {
        if (!(p.target in SCENARIOS)) {
            failures.push(`plant ${p.plant} targets the unknown scenario ${p.target}`);
        }
        if (!body.includes(`'${p.expect}'`)) {
            failures.push(`plant ${p.plant} expects '${p.expect}', which no scenario emits`);
        }
        if (!body.includes(`plant === '${p.plant}'`)) {
            failures.push(`plant ${p.plant} is never applied by its scenario`);
        }
    }
    for (const name of Object.keys(SCENARIOS)) {
        if (!PLANTS.some(p => p.target === name)) {
            failures.push(`scenario ${name} has no plant, so its green proves nothing`);
        }
    }
    const upstream = readFileSync(join(REPO_ROOT, UPSTREAM_PN), 'utf8');
    if (!upstream.includes(`"Button click happened before the security delay: "`)) {
        failures.push(`${UPSTREAM_PN} no longer logs "${DELAY_LINE}"; the answer-delay proof reads a line upstream does not emit`);
    }
    if (!upstream.includes(`"${DELAY_PREF}"`)) {
        failures.push(`${UPSTREAM_PN} no longer reads ${DELAY_PREF}`);
    }
    return failures;
}

async function selfTest() {
    const failures = staticAudit();
    if (failures.length) {
        failures.forEach(f => console.error(`${NAME} --self-test: FAIL -- ${f}`));
        return 1;
    }
    console.log(`  ok  static: ${PLANTS.length} plants each target a scenario, name an emitted failure and are applied; every scenario has a plant; the delay line and pref are upstream's`);
    if (process.argv.includes('--static')) {
        console.log(`${NAME} --self-test --static: PASS -- the live control and plant sessions were not run (--static)`);
        return 0;
    }
    const reason = preflight();
    if (reason) {
        console.error(`${NAME} --self-test: ${reason}`);
        return 1;
    }
    for (const target of new Set(PLANTS.map(p => p.target))) {
        const control = await runSession(target, null);
        if (control !== null) {
            console.error(`${NAME} --self-test: FAIL -- the clean control for ${target} is red: ${control}`);
            return 1;
        }
        console.log(`  ok  clean control for ${target} -> green`);
    }
    let failed = 0;
    for (const p of PLANTS) {
        const got = await runSession(p.target, p.plant);
        if (!got || !got.includes(p.expect)) {
            console.error(`${NAME} --self-test: FAIL -- '${p.plant}' did not go red naming '${p.expect}'; got: ${got ?? '(green)'}`);
            failed++;
        } else {
            console.log(`  ok  ${p.plant} -> red, naming '${p.expect}'`);
        }
    }
    if (failed) {
        return 1;
    }
    console.log(`${NAME} --self-test: PASS -- clean controls green, ${PLANTS.length} planted faults went red`);
    return 0;
}

async function main() {
    if (process.argv.includes('--help')) {
        console.log(`usage: verify-prompts-live.mjs [--scenario a,b] [--self-test [--static]]\nscenarios: ${Object.keys(SCENARIOS).join(', ')}`);
        return 0;
    }
    if (process.argv.includes('--self-test')) {
        return selfTest();
    }
    const reason = preflight();
    if (reason) {
        console.error(`${NAME}: ${reason}`);
        return 1;
    }
    const flag = process.argv.indexOf('--scenario');
    const selected = flag === -1 ? Object.keys(SCENARIOS) : process.argv[flag + 1].split(',');
    const unknown = selected.filter(name => !(name in SCENARIOS));
    if (unknown.length) {
        console.error(`${NAME}: unknown scenario(s): ${unknown.join(', ')}`);
        return 1;
    }
    let failed = 0;
    for (const name of selected) {
        try {
            const why = await runSession(name, null);
            console.log(why ? `${name}: FAIL -- ${why}` : `${name}: PASS`);
            failed += why ? 1 : 0;
        } catch (err) {
            failed++;
            console.log(`${name}: NOT SCORED -- harness: ${err && err.message ? err.message : err}`);
        }
    }
    return failed ? 1 : 0;
}

process.exit(await main());
