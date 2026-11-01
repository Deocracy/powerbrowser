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
 *   cancel-on-evict  -- one background tab asks three distinct prompts; a
 *                       fourth from the same tab evicts that tab's oldest,
 *                       whose page sees a denial and whose stock notification
 *                       is gone; another background tab's prompt survives
 *                       (the cap is per tab); the remaining prompts grant.
 *   remember         -- (37-02) an Allow without Remember leaves a fresh tab on the
 *                       same origin prompting again (the control half); an Allow
 *                       with the stock Remember checkbox leaves a fresh tab
 *                       granted with no panel, and getAllForBrowser reports a
 *                       persistent allow. Teardown removes the grant harness-side;
 *   sharing          -- (37-02) live camera, microphone and screen tracks bring a
 *                       sharingChanged push and the chrome bar's indicator;
 *                       stopping them brings the clear push and hides it; a
 *                       forged frame message carrying sharing: true shows nothing;
 *   camera-doorhanger -- (37-02) a camera request shows the stock
 *                       webRTC-shareDevices doorhanger with its device menulist
 *                       populated, and the stock Allow resolves the page promise.
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
import { inChrome, loadedAt, makeCurrent, openWebTab, pollFor, probe, pushes, serveNavPages, waitForPush, withProbeShell } from './lib/pb-live-probe.mjs';

const NAME = 'prompts-live';
const SELF = fileURLToPath(import.meta.url);
const UPSTREAM_PN = 'upstream/toolkit/modules/PopupNotifications.sys.mjs';
/** The stock security-delay console line (PopupNotifications.sys.mjs _onButtonEvent); its presence proves the branch ran. */
const DELAY_LINE = 'Button click happened before the security delay';
const DELAY_PREF = 'security.notification_enable_delay';
const GEO_ID = 'geolocation';
/** The stock WebRTC doorhanger's notification id (WebRTCParent.sys.mjs), the template's id without -notification. */
const WEBRTC_ID = 'webRTC-shareDevices';
const UPSTREAM_SP = 'upstream/browser/modules/SitePermissions.sys.mjs';
const XHTML = 'powerbrowser/shell/powerbrowser.xhtml';
const CHROME_BAR = 'theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx';
/** The chrome bar's sharing indicator and its codicon per kind, as chrome-bar-widget.tsx renders them (staticAudit derives both). */
const SHARING_CLASS = 'pb-chrome-bar-sharing';
const SHARING_ICONS = { 'device-camera-video': 'camera', mic: 'microphone', 'device-desktop': 'screen' };

/** A geolocation provider that answers from a data: URL, so a granted request resolves without the network. */
const PREFS = {
    'geo.provider.network.url': 'data:application/json,{"location":{"lat":51.5,"lng":-0.1},"accuracy":10}',
    'geo.provider.use_gpsd': false,
    'geo.provider.use_geoclue': false,
    'geo.prompt.open_system_prefs': false,
    // A wide delay keeps the early click inside it on a slow host; answerStock reads the pref, never a literal.
    [DELAY_PREF]: 2000,
    // cancel-on-evict asks four distinct stock prompts from one tab: notifications without a gesture, a fake camera.
    'dom.webnotifications.requireuserinteraction': false,
    'media.navigator.streams.fake': true,
    'media.navigator.permission.disabled': false,
};

/** Page-side requests: each lands on window.__pbOut[kind] ('pending', 'granted', 'denied'); `id` is its stock notification id. */
const REQUESTS = {
    geo: { id: GEO_ID, start: "navigator.geolocation.getCurrentPosition(() => done('granted'), e => done(e.code === 1 ? 'denied' : 'granted'))" },
    notify: { id: 'web-notifications', start: "Notification.requestPermission().then(r => done(r === 'granted' ? 'granted' : 'denied'))" },
    storage: { id: 'persistent-storage', start: "navigator.storage.persist().then(b => done(b ? 'granted' : 'denied'))" },
    camera: { id: 'webRTC-shareDevices', start: "navigator.mediaDevices.getUserMedia({ video: true }).then(() => done('granted'), e => done(e.name === 'NotAllowedError' ? 'denied' : 'granted'))" },
    // 37-02 sharing: the streams are kept on the page so the scenario can stop their tracks.
    av: { id: WEBRTC_ID, start: "navigator.mediaDevices.getUserMedia({ audio: true, video: true }).then(s => { (window.__pbStreams = window.__pbStreams || []).push(s); done('granted'); }, e => done(e.name === 'NotAllowedError' ? 'denied' : 'failed: ' + e.name))" },
    screen: { id: WEBRTC_ID, start: "navigator.mediaDevices.getDisplayMedia({ video: true }).then(s => { (window.__pbStreams = window.__pbStreams || []).push(s); done('granted'); }, e => done(e.name === 'NotAllowedError' ? 'denied' : 'failed: ' + e.name))" },
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

/** Starts one REQUESTS kind in the page. */
function startRequest(app, page, kind) {
    const key = JSON.stringify(kind);
    return app.evaluateIn(page.ctx, `(() => {
        window.__pbOut = window.__pbOut || {};
        window.__pbOut[${key}] = 'pending';
        const done = v => { window.__pbOut[${key}] = v; };
        ${REQUESTS[kind].start};
        return true;
    })()`);
}

/** The page's outcome for `kind` after up to `timeoutMs`: the first non-pending value, else 'pending'. */
async function outcome(app, page, kind, timeoutMs = 5000) {
    try {
        return await pollFor(async () => {
            const v = await app.evaluateIn(page.ctx, `(window.__pbOut || {})[${JSON.stringify(kind)}]`);
            return v !== 'pending' ? v : null;
        }, timeoutMs, 'a page outcome');
    } catch {
        return 'pending';
    }
}

const startGeo = (app, page) => startRequest(app, page, 'geo');
const geoOutcome = (app, page, timeoutMs) => outcome(app, page, 'geo', timeoutMs);

/** Chrome's view of tab `tabId`'s stock notification `id`: exists, shown in the open panel. */
function promptState(app, tabId, id = GEO_ID) {
    return inChrome(app, `
        const o = overlayOf(${JSON.stringify(tabId)});
        const n = o ? window.PopupNotifications.getNotification(${JSON.stringify(id)}, o) : null;
        const panel = document.getElementById('notification-popup');
        return { has: !!n, inPanel: !!n && panel.state === 'open' && [...panel.children].some(el => el.notification === n) };`);
}

async function waitInPanel(app, tabId, id = GEO_ID, timeoutMs = 15000) {
    try {
        return await pollFor(async () => ((await promptState(app, tabId, id)).inPanel ? true : null), timeoutMs, 'the stock doorhanger');
    } catch {
        return false;
    }
}

/**
 * Activates the stock button of tab `tabId`'s notification in chrome (D-11). Allow waits until the stock delay has
 * passed since timeShown (which a rejected click moves); `early` clicks at once; `bypass` is the delay-bypassed plant;
 * `skip` is the answer-dropped plant. Block carries disableSecurityDelay upstream, so it never waits.
 */
function answerStock(app, tabId, { id = GEO_ID, which = 'allow', remember = false, early = false, bypass = false, skip = false } = {}) {
    return inChrome(app, `
        const o = overlayOf(${JSON.stringify(tabId)});
        const n = o ? window.PopupNotifications.getNotification(${JSON.stringify(id)}, o) : null;
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

/**
 * D-04 per tab: one tab asks three distinct stock prompts while backgrounded (stock keeps one per id per tab), then a
 * fourth evicts that tab's oldest; another background tab's prompt must survive the flood.
 */
async function scenarioCancelOnEvict(app, fx, plant) {
    const other = await openPage(app, fx, '/a');
    const flood = await openPage(app, fx, '/b');
    const front = await openPage(app, fx, '/c');
    await makeCurrent(app, front.tabId);
    await startRequest(app, other, 'geo');
    if (await waitForPush(app, isDoorhanger(other.tabId, true)) < 0) {
        return 'no doorhanger push with pending true for a queued tab';
    }
    for (const kind of ['geo', 'notify', 'storage']) {
        const from = (await pushes(app)).length;
        await startRequest(app, flood, kind);
        if (await waitForPush(app, p => isDoorhanger(flood.tabId, true)(p) && p.permission === REQUESTS[kind].id, { from }) < 0) {
            return `no doorhanger push with pending true for the queued ${kind} request`;
        }
    }
    if (plant === 'evict-hangs') {
        // Suppresses the stock removal callback, so the eviction cannot reach PermissionUI's cancel().
        await inChrome(app, `const n = window.PopupNotifications.getNotification(${JSON.stringify(GEO_ID)}, overlayOf(${JSON.stringify(flood.tabId)})); n.options.eventCallback = () => false; return true;`);
    }
    if (plant === 'evict-cross-tab') {
        // What a window-wide cap does: the flood removes the other tab's oldest prompt.
        await inChrome(app, `const pn = window.PopupNotifications; pn.remove(pn.getNotification(${JSON.stringify(GEO_ID)}, overlayOf(${JSON.stringify(other.tabId)})), true); return true;`);
    }
    await startRequest(app, flood, 'camera');
    if (await outcome(app, flood, 'geo') !== 'denied') {
        return 'evicted page promise pending, not cancelled';
    }
    if ((await promptState(app, flood.tabId, GEO_ID)).has) {
        return 'the evicted request still has a stock notification';
    }
    if (!(await promptState(app, other.tabId, GEO_ID)).has || await outcome(app, other, 'geo', 1000) !== 'pending') {
        return 'a prompt of another tab was evicted by requests from this tab';
    }
    if (!(await promptState(app, flood.tabId, REQUESTS.camera.id)).has) {
        return 'the newest request of the flooding tab was not queued';
    }
    // The camera prompt is answered in 37-02, which installs its stock template; the two PermissionUI prompts grant here.
    await makeCurrent(app, flood.tabId);
    for (const kind of ['notify', 'storage']) {
        if (!await waitInPanel(app, flood.tabId, REQUESTS[kind].id)) {
            return 'a remaining queued doorhanger did not show on activation';
        }
        await answerStock(app, flood.tabId, { id: REQUESTS[kind].id });
        if (await outcome(app, flood, kind) !== 'granted') {
            return 'a remaining queued request did not grant after activation (the positive control is red)';
        }
    }
    return null;
}

/** Chrome's read-back of tab `tabId`'s geolocation entry through the same stock call the Phase 31 site panel uses. */
function rememberedGrant(app, tabId) {
    return inChrome(app, `
        const { SitePermissions } = ChromeUtils.importESModule('resource:///modules/SitePermissions.sys.mjs');
        const o = overlayOf(${JSON.stringify(tabId)});
        const p = o ? SitePermissions.getAllForBrowser(o).find(x => x.id === ${JSON.stringify(GEO_ID)}) : null;
        if (!p) return 'no geolocation entry';
        return p.state === SitePermissions.ALLOW && p.scope === SitePermissions.SCOPE_PERSISTENT ? 'persistent allow' : 'state ' + p.state + ', scope ' + p.scope;`);
}

/** Harness-side teardown only (never in powerbrowser/shell): drops the persistent grant so the next run starts clean. */
function forgetGrant(app, tabId) {
    return inChrome(app, `
        const { SitePermissions } = ChromeUtils.importESModule('resource:///modules/SitePermissions.sys.mjs');
        const o = overlayOf(${JSON.stringify(tabId)});
        if (o) SitePermissions.removeFromPrincipal(o.contentPrincipal, ${JSON.stringify(GEO_ID)});
        return true;`).catch(() => false);
}

/** PROMPT-01's Remember half, through the stock checkbox only. Both halves are needed for a pass. */
async function scenarioRemember(app, fx, plant) {
    let remembered = null;
    try {
        // Half one, the control: an answer without Remember is a temporary grant bound to that tab's browser.
        const a = await openPage(app, fx, '/a');
        await startGeo(app, a);
        if (!await waitInPanel(app, a.tabId)) {
            return 'no stock doorhanger for the first tab';
        }
        await answerStock(app, a.tabId);
        if (await geoOutcome(app, a) !== 'granted') {
            return 'stock Allow without Remember did not grant';
        }
        const b = await openPage(app, fx, '/b');
        await startGeo(app, b);
        if (!await waitInPanel(app, b.tabId)) {
            return 'control half: a fresh tab on the same origin did not prompt after an answer without Remember';
        }
        await answerStock(app, b.tabId, { which: 'block' });
        // Half two: the stock Remember checkbox, clicked in chrome, makes the stock PermissionUI write a persistent grant.
        const c = await openPage(app, fx, '/c');
        remembered = c.tabId;
        await startGeo(app, c);
        if (!await waitInPanel(app, c.tabId)) {
            return 'no stock doorhanger for the Remember tab';
        }
        // The plant leaves the stock checkbox unchecked, as a dropped Remember click would.
        const dropped = plant === 'remember-checkbox-dropped';
        await answerStock(app, c.tabId, { remember: !dropped });
        if (await geoOutcome(app, c) !== 'granted') {
            return 'stock Allow with Remember did not grant';
        }
        const stored = await rememberedGrant(app, c.tabId);
        const d = await openPage(app, fx, '/d');
        await startGeo(app, d);
        if (await waitInPanel(app, d.tabId, GEO_ID, 3000)) {
            return 'remember half: site prompted again after Remember';
        }
        if (await geoOutcome(app, d) !== 'granted') {
            return 'remember half: the fresh tab was not granted from the remembered decision';
        }
        return stored === 'persistent allow' ? null : `remember half: getAllForBrowser reports ${stored}, not a persistent allow`;
    } finally {
        if (remembered) {
            await forgetGrant(app, remembered);
        }
    }
}

const isSharing = (tabId, want) => p => p && p.kind === 'sharingChanged' && p.tabId === tabId && Object.entries(want).every(([k, v]) => p[k] === v);

/** The kinds the chrome bar's sharing indicator shows now, read from the Theia DOM (Theia is not XUL, so BiDi sees it). */
async function indicatorKinds(app) {
    const icons = JSON.parse(await app.evaluate(`JSON.stringify([...document.querySelectorAll(${JSON.stringify(`.${SHARING_CLASS} .codicon`)})].map(e => [...e.classList].find(c => c.startsWith('codicon-')) || ''))`));
    return icons.map(c => SHARING_ICONS[c.slice('codicon-'.length)] ?? c).sort();
}

/** Picks the first real window or screen in the stock doorhanger, as upstream's own screen-share tests do (doCommand). */
function pickFirstScreen(app) {
    return inChrome(app, `
        const m = document.getElementById('webRTC-selectWindow-menulist');
        if (!m) return false;
        for (let i = 0; i < m.itemCount; i++) {
            const item = m.getItemAtIndex(i);
            if (item.value !== '-1' && !item.disabled) { item.doCommand(); return true; }
        }
        return false;`);
}

function stopTracks(app, page) {
    return app.evaluateIn(page.ctx, '(window.__pbStreams || []).forEach(s => s.getTracks().forEach(t => t.stop())), true');
}

/** D-05: the indicator follows chrome-observed webrtcUI state and nothing else. */
async function scenarioSharing(app, fx, plant) {
    const page = await openPage(app, fx, '/e');
    await startRequest(app, page, 'av');
    if (!await waitInPanel(app, page.tabId, WEBRTC_ID)) {
        return 'no stock webRTC-shareDevices doorhanger for camera and microphone';
    }
    await answerStock(app, page.tabId, { id: WEBRTC_ID });
    if (await outcome(app, page, 'av') !== 'granted') {
        return 'camera and microphone were not granted through the stock Allow';
    }
    if (await waitForPush(app, isSharing(page.tabId, { camera: true, microphone: true })) < 0) {
        return 'no sharingChanged push with camera and microphone live';
    }
    let kinds = await pollFor(async () => {
        const k = await indicatorKinds(app);
        return k.includes('camera') && k.includes('microphone') ? k : null;
    }, 5000, 'the camera and microphone marks').catch(() => null);
    if (!kinds) {
        return 'the chrome bar shows no camera and microphone marks while both tracks are live';
    }
    await startRequest(app, page, 'screen');
    if (!await waitInPanel(app, page.tabId, WEBRTC_ID) || !await pickFirstScreen(app)) {
        return 'screen share could not be started: no stock doorhanger with a window or screen to pick';
    }
    await answerStock(app, page.tabId, { id: WEBRTC_ID });
    if (await outcome(app, page, 'screen', 15000) !== 'granted') {
        return 'screen share was not granted through the stock Allow';
    }
    if (await waitForPush(app, isSharing(page.tabId, { screen: true })) < 0) {
        return 'no sharingChanged push with the screen live';
    }
    if (plant === 'sharing-stuck-on') {
        // What a broken observer does: the clear report never reaches the push.
        await inChrome(app, `
            const g = window.gBrowser, real = g.updateBrowserSharing;
            g.updateBrowserSharing = (b, s) => { const w = (s && s.webRTC) || {}; if (w.camera || w.microphone || w.screen) real.call(g, b, s); };
            return true;`);
    }
    const from = (await pushes(app)).length;
    await stopTracks(app, page);
    await waitForPush(app, isSharing(page.tabId, { camera: false, microphone: false, screen: false }), { from, timeoutMs: 8000 });
    kinds = await indicatorKinds(app);
    if (kinds.length) {
        return 'indicator still shown after track end';
    }
    // A forged frame message: nothing live, sharing: true. The widget must not honour it.
    if (plant === 'frame-flag-accepted') {
        await probe(app, `const w = get('WebTabChannel').widgetOf(${JSON.stringify(page.tabId)});
            window.addEventListener('message', e => { if (e.data && e.data.sharing) { w.sharing = { camera: true, microphone: true, screen: true }; get('WebTabChannel').tabStatusEmitter.fire(w); } });
            return true;`);
    }
    await app.evaluate(`(window.postMessage({ kind: 'sharingChanged', tabId: ${JSON.stringify(page.tabId)}, sharing: true, camera: true }, '*'), true)`);
    await new Promise(resolve => setTimeout(resolve, 750));
    return (await indicatorKinds(app)).length ? 'indicator driven from a frame flag' : null;
}

/** B2: the camera request resolves only because the stock template is installed. */
async function scenarioCameraDoorhanger(app, fx, plant) {
    const page = await openPage(app, fx, '/a');
    if (plant === 'camera-template-missing') {
        await inChrome(app, `const t = document.getElementById(${JSON.stringify(`${WEBRTC_ID}-notification`)}); if (t) t.remove(); return true;`);
    }
    await startRequest(app, page, 'camera');
    if (!await waitInPanel(app, page.tabId, WEBRTC_ID, 10000)) {
        return 'camera template missing: request never resolved';
    }
    const devices = await inChrome(app, `const m = document.getElementById('webRTC-selectCamera-menulist'); return m ? m.itemCount : -1;`);
    if (!(devices > 0)) {
        return `the camera device menulist has ${devices} items; listDevices populated nothing`;
    }
    await answerStock(app, page.tabId, { id: WEBRTC_ID });
    return await outcome(app, page, 'camera') === 'granted' ? null : 'stock Allow on the camera doorhanger did not resolve the page promise';
}

const SCENARIOS = {
    permission: scenarioPermission,
    'answer-delay': scenarioAnswerDelay,
    'background-queue': scenarioBackgroundQueue,
    'cancel-on-evict': scenarioCancelOnEvict,
    remember: scenarioRemember,
    sharing: scenarioSharing,
    'camera-doorhanger': scenarioCameraDoorhanger,
};

/** Each plant runs its target scenario with one thing wrong and must go red naming `expect`. */
const PLANTS = [
    { plant: 'answer-dropped', target: 'permission', expect: 'stock Allow dispatched but page promise unresolved' },
    { plant: 'delay-bypassed', target: 'answer-delay', expect: 'answer accepted inside the security delay' },
    { plant: 'queue-shown-early', target: 'background-queue', expect: 'panel shown for a backgrounded tab' },
    { plant: 'activation-wrong-tab', target: 'background-queue', expect: 'queued record shown for the wrong tab' },
    { plant: 'evict-hangs', target: 'cancel-on-evict', expect: 'evicted page promise pending, not cancelled' },
    { plant: 'evict-cross-tab', target: 'cancel-on-evict', expect: 'a prompt of another tab was evicted by requests from this tab' },
    { plant: 'remember-checkbox-dropped', target: 'remember', expect: 'remember half: site prompted again after Remember' },
    { plant: 'sharing-stuck-on', target: 'sharing', expect: 'indicator still shown after track end' },
    { plant: 'frame-flag-accepted', target: 'sharing', expect: 'indicator driven from a frame flag' },
    { plant: 'camera-template-missing', target: 'camera-doorhanger', expect: 'camera template missing: request never resolved' },
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
    // 37-02: every name the new scenarios read is derived here from the tree, so a rename goes red offline.
    const sp = readFileSync(join(REPO_ROOT, UPSTREAM_SP), 'utf8');
    for (const name of ['getAllForBrowser(', 'removeFromPrincipal(', 'SCOPE_PERSISTENT']) {
        if (!sp.includes(name)) {
            failures.push(`${UPSTREAM_SP} no longer has ${name.replace('(', '')}; the remember read-back or teardown reads a name upstream lacks`);
        }
    }
    const markup = readFileSync(join(REPO_ROOT, XHTML), 'utf8');
    for (const id of [`${WEBRTC_ID}-notification`, 'webRTC-selectCamera-menulist', 'webRTC-selectWindow-menulist']) {
        if (!markup.includes(`id="${id}"`)) {
            failures.push(`${XHTML} has no #${id}; the camera and sharing scenarios read an element the shell lacks`);
        }
    }
    const bar = readFileSync(join(REPO_ROOT, CHROME_BAR), 'utf8');
    if (!bar.includes(`className='${SHARING_CLASS}'`)) {
        failures.push(`${CHROME_BAR} renders no .${SHARING_CLASS}; the sharing scenario reads an indicator that does not exist`);
    }
    for (const icon of Object.keys(SHARING_ICONS)) {
        if (!bar.includes(`'${icon}'`)) {
            failures.push(`${CHROME_BAR} has no '${icon}' codicon; the sharing scenario cannot name that kind`);
        }
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
