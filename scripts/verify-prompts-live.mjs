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
 *   dialog-probe     -- (37-03, probe 1, D-06) alert, confirm, prompt, leave-page
 *                       and HTTP-auth, each shown by the stock window-modal
 *                       commonDialog (the shell has no getTabDialogBox). While
 *                       each is open: an IDE edit is typed into the Theia
 *                       editor, the shell window's input-enabled state is read
 *                       (the modal loop disables the parent widget, so a typed
 *                       edit that BiDi delivers is not enough on its own), a
 *                       traffic tab navigates and the push sequence must
 *                       advance, and a KWin screenshot is taken. Run alone
 *                       (--scenario dialog-probe) it writes
 *                       .planning/probes/prompt-probe-verdict.json and its
 *                       evidence directory, replacing a provisional verdict.
 *                       Red when the stock dialog blocks the IDE. When it does,
 *                       an adopted tab is opened and relayFeasible is measured
 *                       (relayFeasibleFrom: every host and adopted web tab has
 *                       a getTabForBrowser node, and the cross-domain auth
 *                       branch needs no stand-in widening); it can be false,
 *                       which rule (p) routes to Chris (37-REVIEW WR-05).
 *   dialog           -- (37-03 Task 4) the same five kinds: each answer resolves
 *                       the page, an IDE edit lands and the shell's input stays
 *                       enabled while it is open, and the push sequence
 *                       advances on the same recorder; screenshots are logged
 *                       for review;
 *   stop-repeat      -- (37-03 Task 4, N6) an alert loop is stopped with the
 *                       stock checkbox (ShouldPromptToBlockDialogs and
 *                       DisableDialogs, keyed by browsing-context group): the
 *                       loop finishes with no further dialog, this tab does not
 *                       prompt again, and a new tab (a new group) still prompts;
 *   beforeunload-scope -- (37-03 Task 4) a web tab's leave-page reaches the
 *                       stock dialog (the control); the Theia frame's own
 *                       dirty-editor beforeunload shows the stock leave dialog
 *                       and no dialogRequest push is recorded for it.
 *   password-save    -- (37-04, D-07) a login form submit shows the stock save
 *                       doorhanger with its fields filled by the prompter (read
 *                       chrome-side); the stock Save stores the login (read back
 *                       through Services.logins); no credential reaches a log;
 *   password-update  -- (37-04) a changed password shows the stock doorhanger and
 *                       its stock Update replaces the stored password;
 *   popup-block      -- (37-04, D-08, D-12) a gesture-less window.open is blocked
 *                       and the tab's notificationBar (blocked-popup) shows
 *                       inside the web tab widget with the page rect shrunk below
 *                       it; the bar's Allow opens the stored popup as a web tab
 *                       right after its opener (the stock unblockPopup replay of
 *                       the page's own window.open, adopted by Phase 36, so
 *                       window.opener is kept, 37-REVIEW WR-04), and no
 *                       popup permission is written, read back through the same
 *                       reader that sees a stock location grant (the control);
 *   hung-script      -- (37-04) a page loop past dom.max_script_run_time shows the
 *                       hung-script bar; Keep waiting hides it and it comes back
 *                       after the wait period; Stop script ends the loop;
 *   protocol-handler -- (37-04, N2) registerProtocolHandler shows the
 *                       protocol-handler bar; Add stores the handler (read back
 *                       through the handler service); Don't allow on a second
 *                       scheme stores nothing.
 *
 * 37-REVIEW fixes held statically (verify-permission-prompts rules (ab), (ac),
 * (ae)) and not yet a scenario here; the end-of-milestone live pass checks
 * them by hand on a built binary: an adopted tab's geolocation prompt shows
 * while that tab is current and not while a host tab is (CR-01); a bar on an
 * adopted tab clears when it navigates, and closing it drops its prompts and
 * bars (CR-01); camera live, then a location grant, and the camera mark stays
 * (CR-02); a camera report before the adoption ack lights the mark at the ack
 * (WR-01); share the camera, navigate, and every mark goes off (WR-02).
 *
 * --self-test runs a clean control session per target scenario, then one
 * session per planted fault, each required to go red naming its drift.
 * --self-test --static runs only the offline half: every plant targets a real
 * scenario and names a failure text the scenario actually emits, every scenario
 * has a plant, and the stock console line and delay pref are upstream's own.
 * --self-test --scenario a,b limits the live half to the plants targeting those
 * scenarios, so a control red under a recorded deferral does not stop the rest.
 *
 * Usage: verify-prompts-live.mjs [--scenario a,b] [--self-test [--static] [--scenario a,b]] [--help]
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { captureShell } from './lib/pb-kwin.mjs';
import { REPO_ROOT } from './lib/pb-relaunch.mjs';
import { BROKEN, WEB_TAB_STATE_EVENT, inChrome, loadedAt, makeCurrent, openWebTab, pollFor, probe, pushes, serveNavPages, waitForPush, withProbeShell } from './lib/pb-live-probe.mjs';

const NAME = 'prompts-live';
const SELF = fileURLToPath(import.meta.url);
const UPSTREAM_PN = 'upstream/toolkit/modules/PopupNotifications.sys.mjs';
/** The stock security-delay console line (PopupNotifications.sys.mjs _onButtonEvent); its presence proves the branch ran. */
const DELAY_LINE = 'Button click happened before the security delay';
const DELAY_PREF = 'security.notification_enable_delay';
const GEO_ID = 'geolocation';
/** The geolocation SitePermissions id (PermissionUI's permissionKey), which is not the notification id. */
const GEO_PERM = 'geo';
/** The stock WebRTC doorhanger's notification id (WebRTCParent.sys.mjs), the template's id without -notification. */
const WEBRTC_ID = 'webRTC-shareDevices';
const UPSTREAM_SP = 'upstream/browser/modules/SitePermissions.sys.mjs';
const XHTML = 'powerbrowser/shell/powerbrowser.xhtml';
const CHROME_BAR = 'theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx';
/** The chrome bar's sharing indicator and its codicon per kind, as chrome-bar-widget.tsx renders them (staticAudit derives both). */
const SHARING_CLASS = 'pb-chrome-bar-sharing';
const SHARING_ICONS = { 'device-camera-video': 'camera', mic: 'microphone', 'device-desktop': 'screen' };
/** 37-03: the stock dialog path. staticAudit derives each name below from upstream. */
const UPSTREAM_PROMPT_PARENT = 'upstream/browser/actors/PromptParent.sys.mjs';
const UPSTREAM_COMMON_DIALOG = 'upstream/toolkit/components/prompts/content/commonDialog.xhtml';
const UPSTREAM_PREFS = 'upstream/modules/libpref/init/StaticPrefList.yaml';
const UPSTREAM_OUTER_WINDOW = 'upstream/dom/base/nsGlobalWindowOuter.cpp';
const COMMON_DIALOG_URL = 'chrome://global/content/commonDialog.xhtml';
const DIALOG_IDS = ['commonDialog', 'infoBody', 'loginContainer', 'loginTextbox', 'password1Container', 'password1Textbox', 'checkboxContainer', 'checkbox'];
const BEFOREUNLOAD_PREF = 'dom.require_user_interaction_for_beforeunload';
/** 999.12: off, desktop capture takes the X11 capturer instead of the PipeWire portal (GTK only; staticAudit derives it). */
const PIPEWIRE_PREF = 'media.webrtc.capture.allow-pipewire';
const UPSTREAM_DESKTOP_CAPTURER = 'upstream/third_party/libwebrtc/modules/desktop_capture/desktop_capturer.cc';
const VERDICT = '.planning/probes/prompt-probe-verdict.json';
const EVIDENCE_DIR = '.planning/probes/prompt-probe';
const DIALOG_KINDS = ['alert', 'confirm', 'prompt', 'leave', 'auth'];
/** 37-04 prefs the bar and password scenarios set; staticAudit derives each from upstream. */
const CAPTURE_PREF = 'signon.userInputRequiredToCapture.enabled';
const HANG_PREF = 'dom.max_script_run_time';
const WAIT_PREF = 'browser.hangNotification.waitPeriod';
/** Test-only login values; never a real account. The log scans look for these exact strings. */
const LOGIN = { user: 'pb-login-user', pass: 'pb-login-pass-1', pass2: 'pb-login-pass-2' };
const PASSWORD_ID = 'password';
const UPSTREAM_PROMPTER = 'upstream/toolkit/components/passwordmgr/LoginManagerPrompter.sys.mjs';
const UPSTREAM_ALL_JS = 'upstream/modules/libpref/init/all.js';
const UPSTREAM_HANG_MONITOR = 'upstream/browser/modules/ProcessHangMonitor.sys.mjs';
const WEB_TAB = 'theia/extensions/tab-uris/src/browser/web-tab.ts';
const API = 'powerbrowser/shell/PowerBrowserAPI.sys.mjs';
const CREDENTIAL_LOGGED = 'credential value in log';
const FRAME_URL_OPENED = 'Allow opened a frame-supplied URL';
const BAR_COVERS = 'bar covers page content';
const NOT_NEXT = 'popup not adopted next to its opener';
const STOP_IGNORED = 'Stop script did not terminate the loop';
const STOCK_PROTOCOL = 'stock protocol bar path reached: getNotificationBox TypeError';

/**
 * OQ1 ruling (Chris 2026-11-05, 37-UAT rows 8 and 9): a default run and a full self-test leave out the scenarios
 * PROMPT-03 owns, printing "<name>: SKIPPED (PROMPT-03 deferred, 999.3)", only while REQUIREMENTS.md records the
 * deferral in both its requirement line and its traceability row (the same reader as verify-permission-prompts.mjs
 * rule (p)); WINDOWS.md carries the open ledger row. An explicit --scenario still runs them.
 */
const REQUIREMENTS = '.planning/REQUIREMENTS.md';
const PROMPT03_SCENARIOS = ['dialog-probe', 'dialog'];

/** The phase PROMPT-03 is deferred to, when its requirement line and traceability row agree; else null. */
function prompt03DeferredTo(requirements = '') {
    const line = /^- \[ \] \*\*PROMPT-03\*\*:.*\(deferred to Phase (\S+?),/m.exec(requirements);
    const row = /^\| PROMPT-03 \| Phase (\S+) \| Deferred \|$/m.exec(requirements);
    return line && row && line[1] === row[1] ? line[1] : null;
}

/** name -> the SKIPPED reason for each PROMPT-03 scenario a run without --scenario leaves out; empty without a recorded deferral. */
function deferredSkips(requirements) {
    const to = prompt03DeferredTo(requirements);
    return to ? new Map(PROMPT03_SCENARIOS.map(name => [name, `SKIPPED (PROMPT-03 deferred, ${to})`])) : new Map();
}

const readRequirements = () => readFileSync(join(REPO_ROOT, REQUIREMENTS), 'utf8');

/** Test-only Basic credentials for the harness's own 401 server; never a real account. */
const AUTH = { user: 'pb-probe', pass: 'pb-probe-pass' };
/** Set by main() for a live `--scenario dialog-probe` run only; self-test sessions never write the verdict. */
let writeVerdict = false;

/** A geolocation provider that answers from a data: URL, so a granted request resolves without the network. */
const PREFS = {
    // The Remote Agent's recommended prefs unblock popups unless the profile already sets this one.
    'dom.disable_open_during_load': true,
    'geo.provider.network.url': 'data:application/json,{"location":{"lat":51.5,"lng":-0.1},"accuracy":10}',
    'geo.provider.use_gpsd': false,
    'geo.provider.use_geoclue': false,
    'geo.prompt.open_system_prefs': false,
    // A wide delay keeps the early click inside it on a slow host; answerStock reads the pref, never a literal.
    [DELAY_PREF]: 2000,
    // cancel-on-evict asks four distinct stock prompts from one tab: notifications without a gesture, a fake camera.
    'dom.webnotifications.requireuserinteraction': false,
    'media.navigator.streams.fake': true,
    // 37-02 sharing: a fake camera or microphone counts as captured, so webrtcUI sees the stream, only with this
    // (MediaManager.cpp DeviceListener::CapturingSource), as upstream's own webrtc tests set it.
    'media.navigator.permission.fake': true,
    'media.navigator.permission.disabled': false,
    // 37-03: a page's beforeunload shows the leave dialog without a prior user gesture, so the leave kind is reproducible.
    [BEFOREUNLOAD_PREF]: false,
    // 37-04: a scripted submit is captured (no typed input), a gesture-less window.open is blocked and announced, a loop
    // is reported hung after three seconds without waiting for input, and Keep waiting holds for three seconds.
    'signon.rememberSignons': true,
    [CAPTURE_PREF]: false,
    'dom.disable_open_during_load': true,
    'privacy.popups.showBrowserMessage': true,
    [HANG_PREF]: 3,
    'dom.max_script_run_time.require_critical_input': false,
    [WAIT_PREF]: 3000,
    // The Remote Agent's recommended prefs turn hang reports and the dialog-abuse window off unless the profile sets them:
    // hung-script needs the report, and stop-repeat needs upstream's default window for the stock stop checkbox.
    'dom.ipc.reportProcessHangs': true,
    'dom.successive_dialog_time_limit': 3,
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

const PAGES = {
    ...Object.fromEntries(['a', 'b', 'c', 'd', 'e'].map(p => [`/${p}`, { title: `Prompt ${p}`, body: `<p>prompt page ${p}</p>` }])),
    // 37-04: a login form (GET, so the fixture server serves the submit target) and plain pages the bar scenarios drive.
    '/login': { title: 'Login', body: '<form id="f" action="/a" method="get"><input id="u" name="u" autocomplete="username"><input id="p" name="p" type="password" autocomplete="current-password"><button>Sign in</button></form>' },
    '/opener': { title: 'Opener', body: '<p>popup opener</p>' },
    '/hang': { title: 'Hang', body: '<p>hang page</p>' },
    '/proto': { title: 'Protocol', body: '<p>protocol page</p>' },
    '/handler': { title: 'Handler', body: '<p>handler</p>' },
};

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
    const expression = `(() => {
        window.__pbOut = window.__pbOut || {};
        window.__pbOut[${key}] = 'pending';
        const done = v => { window.__pbOut[${key}] = v; };
        ${REQUESTS[kind].start};
        return true;
    })()`;
    // getDisplayMedia rejects without transient activation (MediaDevices.cpp GetDisplayMedia); BiDi grants it per evaluate.
    return kind === 'screen'
        ? app.send('script.evaluate', { expression, target: { context: page.ctx }, awaitPromise: true, userActivation: true })
        : app.evaluateIn(page.ctx, expression);
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
        return JSON.stringify({ left: r.left - fr.left, top: r.top - fr.top, right: r.right - fr.left, bottom: r.bottom - fr.top });`).then(JSON.parse);
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

/**
 * The plant shows the queued notification of `tabId` the way a broken queue would, while it is not the active tab.
 * The stock panel opens asynchronously (_showPanel waits on _hidePanel), so the plant reads inPanel back: true only once
 * the queued record is really in the open panel (999.13).
 */
async function showQueuedNow(app, tabId) {
    await inChrome(app, `
        const o = overlayOf(${JSON.stringify(tabId)});
        const pn = window.PopupNotifications;
        const list = pn.getNotificationsForBrowser(o);
        pn._update(list, new Set(list.map(n => n.anchorElement)));
        return true;`);
    return waitInPanel(app, tabId, GEO_ID, 5000);
}

async function scenarioBackgroundQueue(app, fx, plant) {
    const back = await openPage(app, fx, '/a');
    const other = await openPage(app, fx, '/b');
    await makeCurrent(app, other.tabId);
    await startGeo(app, back);
    if (await waitForPush(app, isDoorhanger(back.tabId, true)) < 0) {
        return 'no doorhanger push with pending true for the backgrounded tab';
    }
    if (plant === 'queue-shown-early' && !await showQueuedNow(app, back.tabId)) {
        return `${BROKEN} the queue-shown-early plant never got the queued record into the open panel`;
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
    if (plant === 'activation-wrong-tab' && !await showQueuedNow(app, back.tabId)) {
        return `${BROKEN} the activation-wrong-tab plant never got the queued record into the open panel`;
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
        const p = o ? SitePermissions.getAllForBrowser(o).find(x => x.id === ${JSON.stringify(GEO_PERM)}) : null;
        if (!p) return 'no geolocation entry';
        return p.state === SitePermissions.ALLOW && p.scope === SitePermissions.SCOPE_PERSISTENT ? 'persistent allow' : 'state ' + p.state + ', scope ' + p.scope;`);
}

/** Harness-side teardown only (never in powerbrowser/shell): drops the persistent grant so the next run starts clean. */
function forgetGrant(app, tabId) {
    return inChrome(app, `
        const { SitePermissions } = ChromeUtils.importESModule('resource:///modules/SitePermissions.sys.mjs');
        const o = overlayOf(${JSON.stringify(tabId)});
        if (o) SitePermissions.removeFromPrincipal(o.contentPrincipal, ${JSON.stringify(GEO_PERM)});
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
            if (item.localName === 'menuitem' && item.value !== '-1' && !item.disabled) { item.doCommand(); return true; }
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
    // Without the stock template PopupNotifications shows an ad-hoc popupnotification under the same id, so the panel
    // opening is not enough: the panel's element must carry the template's own markup (its device menulist, empty or
    // not), checked before the menulist's items are read (999.13).
    const templated = () => inChrome(app, `const t = document.getElementById(${JSON.stringify(`${WEBRTC_ID}-notification`)});
        return !!t && t.parentNode === document.getElementById('notification-popup') && !!t.querySelector('#webRTC-selectCamera-menulist');`);
    if (!await waitInPanel(app, page.tabId, WEBRTC_ID, 10000) || !await templated()) {
        return 'camera template missing: request never resolved';
    }
    const devices = await inChrome(app, `const m = document.getElementById('webRTC-selectCamera-menulist'); return m ? m.itemCount : -1;`);
    if (!(devices > 0)) {
        return `the camera device menulist has ${devices} items; listDevices populated nothing`;
    }
    await answerStock(app, page.tabId, { id: WEBRTC_ID });
    return await outcome(app, page, 'camera') === 'granted' ? null : 'stock Allow on the camera doorhanger did not resolve the page promise';
}

// ---- 37-03: the stock dialog path (PromptParent's window-modal fallback, PromptParent.sys.mjs:295-307) ----

/** Chrome-scope expression: the open stock commonDialog window, or null. It is XUL and BiDi cannot see it. */
const DIALOG_WINDOW = `(() => { const en = Services.wm.getEnumerator(null); while (en.hasMoreElements()) { const w = en.getNext(); if (!w.closed && String(w.location && w.location.href) === ${JSON.stringify(COMMON_DIALOG_URL)} && w.document.readyState === 'complete') return w; } return null; })()`;

/** What the open dialog shows, or null when none is open. */
function dialogState(app) {
    return inChrome(app, `const w = ${DIALOG_WINDOW};
        if (!w) return null;
        const d = w.document;
        const shown = id => { const e = d.getElementById(id); return !!e && !e.closest('[hidden]'); };
        return JSON.stringify({ body: (d.getElementById('infoBody')?.textContent ?? '').trim().slice(0, 200), login: shown('loginContainer'), password: shown('password1Container'), checkbox: shown('checkboxContainer') });`).then(JSON.parse);
}

async function waitDialog(app, timeoutMs = 10000) {
    try {
        return await pollFor(() => dialogState(app), timeoutMs, 'a stock commonDialog');
    } catch {
        return null;
    }
}

/** Answers the open stock dialog through its own controls: text fields, the stock stop checkbox, then accept or cancel. */
function answerDialog(app, { accept = true, text = null, user = null, pass = null, stop = false } = {}) {
    return inChrome(app, `const w = ${DIALOG_WINDOW};
        if (!w) return 'no dialog window';
        const d = w.document;
        const fill = (id, v) => { if (v === null) return; const e = d.getElementById(id); e.value = v; e.dispatchEvent(new w.Event('input', { bubbles: true })); };
        fill('loginTextbox', ${JSON.stringify(user ?? text)});
        fill('password1Textbox', ${JSON.stringify(pass)});
        if (${stop}) { const c = d.getElementById('checkbox'); if (!c.checked) c.click(); }
        const dlg = d.getElementById('commonDialog');
        if (${accept}) dlg.acceptDialog(); else dlg.cancelDialog();
        return 'answered';`);
}

/** The shell window's widget enabled state. AppWindow::ShowModal disables the parent widget (EnableParent(false)). */
function shellInputEnabled(app) {
    return inChrome(app, `const I = typeof Ci !== 'undefined' ? Ci : Components.interfaces;
        return window.docShell.treeOwner.QueryInterface(I.nsIBaseWindow).enabled;`);
}

/**
 * 37-REVIEW WR-05: the facts a tab-dialog relay would depend on, read live. PromptParent's tab branch (:222-260) keys the
 * dialog on gBrowser.getTabForBrowser(browser), so every web tab, a host tab and an adopted one alike, must have a node;
 * with privacy.authPromptSpoofingProtection on, a cross-domain auth prompt also reads gURLBar.setURI and
 * setTabLabelForAuthPrompts, which the stand-in may not grow without the Pitfall-2 widening.
 */
async function tabBranchFacts(app) {
    const tabs = await probe(app, `return get('ApplicationShell').getWidgets('main').filter(w => typeof w.tabId === 'string').map(w => ({ tabId: w.tabId, adopted: !!w.adopted }));`);
    return inChrome(app, `const g = window.gBrowser;
        const tabs = ${JSON.stringify(tabs ?? [])}.map(t => ({ ...t, tabbed: !!(g && overlayOf(t.tabId) && g.getTabForBrowser(overlayOf(t.tabId))) }));
        return JSON.stringify({
            tabs,
            selectedBrowser: !!g && 'selectedBrowser' in g,
            authSpoof: Services.prefs.getBoolPref('privacy.authPromptSpoofingProtection', false),
            authMembers: !!g && typeof g.setTabLabelForAuthPrompts === 'function' && typeof window.gURLBar?.setURI === 'function',
        });`).then(JSON.parse);
}

/** WR-05: the relay verdict from those facts. Every term can be false; `why` names each that is. */
function relayFeasibleFrom(facts) {
    const tabs = facts?.tabs ?? [];
    const why = [
        !tabs.some(t => !t.adopted) && 'no host tab measured',
        !tabs.some(t => t.adopted) && 'no adopted tab measured',
        ...tabs.filter(t => !t.tabbed).map(t => `getTabForBrowser has no node for ${t.adopted ? 'adopted' : 'host'} tab ${t.tabId}`),
        !facts?.selectedBrowser && 'the stand-in has no selectedBrowser',
        facts?.authSpoof && !facts?.authMembers && 'cross-domain auth needs gURLBar.setURI and setTabLabelForAuthPrompts (a Pitfall-2 widening)',
    ].filter(Boolean);
    return { feasible: why.length === 0, why };
}

/** WR-05: an adopted tab for the relay measurement, made by the blocked-popup Allow (the stock replay, adopted by Phase 36). */
async function openAdoptedTab(app, fx) {
    const opener = await openPage(app, fx, '/opener');
    const from = (await pushes(app)).length;
    await app.evaluateIn(opener.ctx, `(() => { window.open(${JSON.stringify(fx.url('/b'))}); return true; })()`);
    if (await waitForPush(app, isBar(opener.tabId, 'blocked-popup', true), { from }) < 0 || await clickBar(app, opener.tabId, 'blocked-popup', 'allow-popup') !== 'clicked') {
        return false;
    }
    return pollFor(async () => ((await mainOrder(app)).find(w => String(w.url).endsWith('/b')) ? true : null), 8000, 'the adopted tab').catch(() => false);
}

/** Opens an untitled editor in the Theia frame; returns the Theia document's BiDi context id, or a BROKEN reason. */
async function openIdeEditor(app, fx) {
    const tree = await app.send('browsingContext.getTree', {});
    const theia = (tree.contexts || []).find(c => /^http:\/\/127\.0\.0\.1:\d+\/$/.test(c.url) && !c.url.startsWith(fx.origin));
    if (!theia) {
        return `${BROKEN} no Theia browsing context in the tree`;
    }
    const opened = await probe(app, `await get('CommandRegistry').executeCommand('workbench.action.files.newUntitledFile');
        return get('EditorManager').currentEditor ? 'opened' : 'no-editor';`);
    return opened === 'opened' ? theia.context : `${BROKEN} the untitled editor did not open (${JSON.stringify(opened)})`;
}

/** Types `marker` into the IDE editor through the Theia frame; true when the editor's text then holds it. */
async function ideEdit(app, theiaCtx, marker) {
    await probe(app, `const w = get('EditorManager').currentEditor; if (w) w.editor.focus(); return true;`);
    await app.send('input.performActions', { context: theiaCtx, actions: [{ type: 'key', id: 'pb-type', actions: [...marker].flatMap(ch => [{ type: 'keyDown', value: ch }, { type: 'keyUp', value: ch }]) }] });
    const text = await probe(app, `await new Promise(resolve => setTimeout(resolve, 400));
        const w = get('EditorManager').currentEditor;
        return w ? w.editor.document.getText() : null;`);
    return typeof text === 'string' && text.includes(marker);
}

/**
 * 999.14: captures the PowerBrowser window through pb-kwin's captureShell (raise, active-window gate, spectacle -a);
 * the path, or null when the capture is refused or the PNG is not the active window's frame size times its output
 * scale (2 px), in which case
 * the file is deleted so a capture of anything else never reaches the evidence directory.
 */
async function kwinShot(out) {
    if (process.env.PB_LIVE_HEADED !== '1') {
        return null; // a headless session has no window, and the raise must not pick up a PowerBrowser the owner has open
    }
    let shot;
    try {
        shot = await captureShell(out);
    } catch {
        return null; // refused (the shell never became active) or spectacle failed; the BROKEN lines report the null
    }
    // PNG IHDR: width and height are the big-endian words at bytes 16 and 20.
    const png = readFileSync(out);
    const scale = shot.scale || 1;
    if (Math.abs(png.readUInt32BE(16) - shot.width * scale) <= 2 && Math.abs(png.readUInt32BE(20) - shot.height * scale) <= 2) {
        return out;
    }
    rmSync(out, { force: true });
    return null;
}

/** A 401 Basic challenge until the request carries AUTH; then a page titled "authed". */
async function serveAuth() {
    const want = `Basic ${Buffer.from(`${AUTH.user}:${AUTH.pass}`).toString('base64')}`;
    const server = createServer((request, response) => {
        if (request.headers.authorization === want) {
            response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
            response.end('<!doctype html><html><head><title>authed</title></head><body>authed</body></html>');
            return;
        }
        response.writeHead(401, { 'www-authenticate': 'Basic realm="pb-probe"', 'content-type': 'text/html; charset=utf-8' });
        response.end('<!doctype html><html><head><title>denied</title></head><body>denied</body></html>');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    return {
        url: `http://127.0.0.1:${server.address().port}/auth`,
        close: () => new Promise(resolve => { server.closeAllConnections?.(); server.close(() => resolve()); }),
    };
}

/** Page-side starts, each deferred so the BiDi evaluate returns before the dialog blocks the page. */
const DIALOG_START = {
    alert: "window.__pbDlg.alert = (alert('pb alert'), 'answered')",
    confirm: "window.__pbDlg.confirm = confirm('pb confirm')",
    prompt: "window.__pbDlg.prompt = prompt('pb prompt', '')",
    leave: "window.onbeforeunload = e => { e.preventDefault(); e.returnValue = ''; }; location.href = '/b'",
};
const DIALOG_ANSWER = { alert: {}, confirm: {}, prompt: { text: 'pb-answer' }, leave: {}, auth: { user: AUTH.user, pass: AUTH.pass } };

/** Whether the answered dialog resolved the page: its return value, the leave navigation, or the authenticated load. */
async function dialogResolved(app, page, kind) {
    const want = { alert: 'answered', confirm: true, prompt: 'pb-answer' };
    try {
        if (kind in want) {
            return await pollFor(async () => (await app.evaluateIn(page.ctx, `(window.__pbDlg || {})[${JSON.stringify(kind)}]`)) === want[kind] || null, 5000, `the ${kind} return value`);
        }
        if (kind === 'leave') {
            return await waitForPush(app, loadedAt(page.tabId, '/b'), { timeoutMs: 8000 }) >= 0;
        }
        return await pollFor(async () => (await app.evaluateIn(page.ctx, 'document.title')) === 'authed' || null, 8000, 'the authenticated load');
    } catch {
        return false;
    }
}

/**
 * Probe 1's measurement, shared by dialog-probe and dialog. For each kind in order: start it, wait for the stock dialog,
 * then while it is open type an IDE edit, read the shell's input-enabled state, navigate the traffic tab and require
 * the push sequence to advance on the same recorder, and take a KWin screenshot into `shotDir`; then answer it and read
 * the page's resolution. Returns { rows } or { broken } (a dialog never appeared, or the IDE could not be set up).
 */
async function driveDialogs(app, fx, plant, shotDir) {
    const auth = await serveAuth();
    try {
        const theiaCtx = await openIdeEditor(app, fx);
        if (theiaCtx.startsWith(BROKEN)) {
            return { broken: theiaCtx };
        }
        const traffic = await openPage(app, fx, '/c');
        const page = await openPage(app, fx, '/a');
        mkdirSync(shotDir, { recursive: true });
        const rows = [];
        for (const [i, kind] of DIALOG_KINDS.entries()) {
            const start = kind === 'auth' ? `location.href = ${JSON.stringify(auth.url)}` : DIALOG_START[kind];
            await app.evaluateIn(page.ctx, `(() => { window.__pbDlg = window.__pbDlg || {}; setTimeout(() => { ${start}; }, 0); return true; })()`);
            const shown = await waitDialog(app);
            if (!shown) {
                return { broken: `${BROKEN} the ${kind} dialog never appeared as a stock commonDialog (if a WebDriver BiDi prompt handler closed it, the session needs unhandledPromptBehavior ignore)` };
            }
            const marker = `pb${kind}${i}`;
            const landed = plant === 'probe-edit-blocked' ? false : await ideEdit(app, theiaCtx, marker);
            const inputEnabled = await shellInputEnabled(app);
            if (plant === 'push-traffic-frozen' && i === 0) {
                // What a stalled push path looks like from the recorder: nothing new is recorded while the dialog is open.
                await app.evaluate('(window.__pbPushes.push = () => 0, true)');
            }
            const from = (await pushes(app)).length;
            const next = `/d?n=${i}`;
            await app.send('browsingContext.navigate', { context: traffic.ctx, url: fx.url(next), wait: 'none' });
            const at = await waitForPush(app, loadedAt(traffic.tabId, next), { from, timeoutMs: 8000 });
            const shot = await kwinShot(join(shotDir, `dialog-${kind}.png`));
            const answered = await answerDialog(app, DIALOG_ANSWER[kind]);
            const resolved = answered === 'answered' && await dialogResolved(app, page, kind);
            rows.push({ kind, body: shown.body, landed, inputEnabled, pushFrom: from, pushAt: at, advanced: at >= from, shot, resolved });
        }
        return { rows };
    } finally {
        await auth.close();
    }
}

/** The kinds a row set shows the IDE blocked for, with why. Empty means the stock dialog kept the IDE usable. */
function blockedKinds(rows) {
    return rows.flatMap(r => {
        const why = [!r.landed && 'edit did not land', r.inputEnabled !== true && 'shell input disabled', !r.advanced && 'pushes stalled'].filter(Boolean);
        return why.length ? [`${r.kind} (${why.join(', ')})`] : [];
    });
}

const STOCK_BLOCKS = 'stock dialog blocks the IDE';
const PUSH_FROZEN = 'IDE push traffic stopped while dialog open';
const LEAKED = 'suppression leaked across tabs';
const THEIA_RELAYED = 'Theia-frame beforeunload relayed';
const REPEAT_COUNT = 20;

/** Probe 1 (Task 1). Writes the verdict only on a live `--scenario dialog-probe` run. */
async function scenarioDialogProbe(app, fx, plant) {
    const shotDir = writeVerdict ? join(REPO_ROOT, EVIDENCE_DIR) : mkdtempSync(join(tmpdir(), 'pb-dialog-probe-'));
    const run = await driveDialogs(app, fx, plant, shotDir);
    if (run.broken) {
        return run.broken;
    }
    const missingShots = run.rows.filter(r => !r.shot).map(r => r.kind);
    if (missingShots.length) {
        return `${BROKEN} no KWin screenshot for ${missingShots.join(', ')} (run headed (PB_LIVE_HEADED=1) with the sandbox off: captureShell needs the session DBus and a shell window); no verdict written`;
    }
    const blocked = blockedKinds(run.rows);
    let relay = null;
    if (blocked.length) {
        if (!await openAdoptedTab(app, fx)) {
            return `${BROKEN} no adopted tab could be opened, so the relay's getTabForBrowser precondition was not measured; no verdict written`;
        }
        relay = relayFeasibleFrom(await tabBranchFacts(app));
    }
    if (writeVerdict) {
        const pushLog = join(EVIDENCE_DIR, 'push-log.json');
        writeFileSync(join(REPO_ROOT, pushLog), `${JSON.stringify({ rows: run.rows, pushes: await pushes(app) }, null, 2)}\n`);
        const bundle = join(REPO_ROOT, 'theia/applications/browser/lib/frontend/bundle.js');
        const binary = join(REPO_ROOT, 'objdir/dist/bin/powerbrowser');
        const verdict = {
            outcome: blocked.length ? 'stock-blocks-ide' : 'stock-keeps-ide-usable',
            provisional: false,
            source: 'live probe 1 (verify-prompts-live.mjs --scenario dialog-probe)',
            relayFeasible: relay ? relay.feasible : null,
            evidence: {
                relayWhy: relay ? relay.why : null,
                screenshots: run.rows.map(r => r.shot.slice(REPO_ROOT.length + 1)),
                pushLog,
                ideEditOk: run.rows.every(r => r.landed && r.inputEnabled === true),
                blocked,
            },
            date: new Date().toISOString().slice(0, 10),
            build: {
                theiaBundleSha256: existsSync(bundle) ? createHash('sha256').update(readFileSync(bundle)).digest('hex') : null,
                binaryMtime: existsSync(binary) ? statSync(binary).mtime.toISOString() : null,
            },
        };
        writeFileSync(join(REPO_ROOT, VERDICT), `${JSON.stringify(verdict, null, 2)}\n`);
        console.log(`dialog-probe: wrote ${VERDICT} (outcome ${verdict.outcome}); stage it and ${EVIDENCE_DIR}/ by explicit path`);
    }
    return blocked.length ? `${STOCK_BLOCKS}: ${blocked.join('; ')}` : null;
}

/** Task 4: every kind appears, its answer resolves the page, and the IDE stays usable while it is open. */
async function scenarioDialog(app, fx, plant) {
    const run = await driveDialogs(app, fx, plant, mkdtempSync(join(tmpdir(), 'pb-dialog-')));
    if (run.broken) {
        return run.broken;
    }
    for (const r of run.rows) {
        if (!r.advanced) {
            return `${PUSH_FROZEN} (${r.kind}: no push recorded after index ${r.pushFrom})`;
        }
        if (!r.resolved) {
            return `the ${r.kind} answer did not resolve the page`;
        }
        if (!r.landed || r.inputEnabled !== true) {
            return `${STOCK_BLOCKS}: ${blockedKinds([r]).join('; ')}`;
        }
        if (!r.shot) {
            return `${BROKEN} no KWin screenshot for ${r.kind} (run headed, PB_LIVE_HEADED=1, with the sandbox off: captureShell needs the session DBus and a shell window)`;
        }
    }
    console.log(`dialog: screenshots for review (the IDE must look interactive): ${run.rows.map(r => r.shot).join(', ')}`);
    return null;
}

/** Task 4 (N6): the stock stop checkbox ends a loop for this tab's browsing-context group only. */
async function scenarioStopRepeat(app, fx, plant) {
    const a = await openPage(app, fx, '/a');
    await app.evaluateIn(a.ctx, `(() => { window.__pbAlerts = 0; setTimeout(() => { for (let i = 0; i < ${REPEAT_COUNT}; i++) { alert('pb repeat ' + i); window.__pbAlerts = i + 1; } }, 0); return true; })()`);
    if (!await waitDialog(app)) {
        return `${BROKEN} the first alert of the loop never appeared`;
    }
    await answerDialog(app);
    const second = await waitDialog(app);
    if (!second) {
        return `${BROKEN} the second alert of the loop never appeared`;
    }
    if (!second.checkbox) {
        return 'the stock stop checkbox is not offered on a repeated alert';
    }
    await answerDialog(app, { stop: true });
    // The page is blocked while a dialog is open, so the dialog is checked before the page is read.
    await new Promise(resolve => setTimeout(resolve, 1500));
    if (await dialogState(app)) {
        await answerDialog(app, { stop: true });
        return 'the alert loop kept prompting after the stock stop checkbox';
    }
    if (await app.evaluateIn(a.ctx, 'window.__pbAlerts') !== REPEAT_COUNT) {
        return 'the alert loop did not finish after the stock stop checkbox';
    }
    await app.evaluateIn(a.ctx, "(() => { setTimeout(() => { alert('pb late'); }, 0); return true; })()");
    await new Promise(resolve => setTimeout(resolve, 1500));
    if (await dialogState(app)) {
        await answerDialog(app);
        return 'this tab prompted again after the stock stop checkbox';
    }
    // A new web tab is a new top-level browser, so a new browsing-context group with its own dialog state.
    const b = await openPage(app, fx, '/b');
    if (plant === 'cross-tab-leak') {
        // What a leak looks like from the new tab: its alert shows nothing, as if the first tab's block covered its group.
        await app.evaluateIn(b.ctx, '(window.alert = () => undefined, true)');
    }
    await app.evaluateIn(b.ctx, "(() => { setTimeout(() => { alert('pb other tab'); }, 0); return true; })()");
    if (!await waitDialog(app, 8000)) {
        return `${LEAKED}: a new tab in a new browsing-context group did not prompt`;
    }
    await answerDialog(app);
    return null;
}

/** Task 4: the Theia frame's own beforeunload keeps the stock path and is never routed to a tab relay. */
async function scenarioBeforeunloadScope(app, fx, plant) {
    const page = await openPage(app, fx, '/a');
    await app.evaluateIn(page.ctx, `(() => { setTimeout(() => { ${DIALOG_START.leave}; }, 0); return true; })()`);
    if (!await waitDialog(app)) {
        return 'a web-tab leave-page never reached the stock dialog path';
    }
    await answerDialog(app, { accept: false });
    // The page stayed with the control's handler, and the recorder control below navigates it, which would prompt again.
    await app.evaluateIn(page.ctx, '(window.onbeforeunload = null, true)');
    const theiaCtx = await openIdeEditor(app, fx);
    if (theiaCtx.startsWith(BROKEN)) {
        return theiaCtx;
    }
    if (!await ideEdit(app, theiaCtx, 'pbdirty')) {
        return `${BROKEN} typing did not reach the IDE editor, so the frame has no dirty editor`;
    }
    const from = (await pushes(app)).length;
    if (plant === 'theia-beforeunload-relayed') {
        // What a relay of the frame's own beforeunload would record: a dialogRequest push.
        await app.evaluate(`(window.dispatchEvent(new CustomEvent(${JSON.stringify(WEB_TAB_STATE_EVENT)}, { detail: { kind: 'dialogRequest', tabId: null } })), true)`);
    }
    await app.evaluate('(setTimeout(() => location.reload(), 0), true)');
    if (!await waitDialog(app)) {
        return "the Theia frame's dirty-editor beforeunload did not reach the stock leave dialog";
    }
    // Stay: the IDE keeps its unsaved editor and its push recorder.
    await answerDialog(app, { accept: false });
    // Same-session recorder control: a web-tab load after the dialog is recorded at or after `from`.
    await app.send('browsingContext.navigate', { context: page.ctx, url: fx.url('/c'), wait: 'none' });
    if (await waitForPush(app, loadedAt(page.tabId, '/c'), { from, timeoutMs: 8000 }) < 0) {
        return `${BROKEN} the push recorder recorded nothing after the Theia leave dialog, so the absence below proves nothing`;
    }
    const relayed = (await pushes(app)).slice(from).filter(p => p && p.kind === 'dialogRequest');
    return relayed.length ? `${THEIA_RELAYED}: ${JSON.stringify(relayed[0])}` : null;
}

/** The action order each bar kind renders its buttons in, derived from web-tab.ts at load (never hand-kept). */
const BAR_ACTIONS = Object.fromEntries([...(/export const NOTIFICATION_BAR_ACTIONS = \{([\s\S]*?)\} as const;/.exec(readFileSync(join(REPO_ROOT, WEB_TAB), 'utf8'))?.[1] ?? '')
    .matchAll(/'([\w-]+)':\s*\[([^\]]*)\]/g)].map(m => [m[1], [...m[2].matchAll(/'([\w-]+)'/g)].map(a => a[1])]));

const isBar = (tabId, barKind, visible) => p => p && p.kind === 'notificationBar' && p.tabId === tabId && p.barKind === barKind && p.visible === visible;

/** Theia's view of tab `tabId`'s bars: kind, fields and button labels, from the widget the frontend renders. */
function barView(app, tabId) {
    return probe(app, `const w = get('WebTabChannel').widgetOf(${JSON.stringify(tabId)});
        if (!w) return null;
        return [...w.node.querySelectorAll('.pb-web-tab-bar')].map((row, i) => ({ barKind: [...w.notificationBars.values()][i]?.barKind ?? null, buttons: [...row.querySelectorAll('button')].map(b => b.textContent) }));`);
}

/** Clicks the button for `action` on tab `tabId`'s `barKind` bar: the real widget path, which sends webTabBarAction. */
function clickBar(app, tabId, barKind, action) {
    return probe(app, `const w = get('WebTabChannel').widgetOf(${JSON.stringify(tabId)});
        const bars = w ? [...w.notificationBars.values()] : [];
        const at = bars.findIndex(b => b.barKind === ${JSON.stringify(barKind)});
        const row = at === -1 ? null : w.node.querySelectorAll('.pb-web-tab-bar')[at];
        const labels = ${JSON.stringify(BAR_ACTIONS[barKind] ?? [])};
        const shown = row ? [...row.querySelectorAll('button')] : [];
        // Buttons render in table order, skipping an action the copy leaves unlabelled (Allow with no popup left).
        const offered = labels.filter((a, i) => a !== 'allow-popup' || shown.length === labels.length);
        const button = shown[offered.indexOf(${JSON.stringify(action)})];
        if (!button) return 'no ' + ${JSON.stringify(action)} + ' button on the ' + ${JSON.stringify(barKind)} + ' bar';
        button.click();
        return 'clicked';`);
}

/** The bar host height and how far below the widget's top the overlay starts (both shell-window CSS pixels). */
async function barGeometry(app, tabId) {
    const theia = await probe(app, `const w = get('WebTabChannel').widgetOf(${JSON.stringify(tabId)});
        if (!w) return null;
        const host = w.node.querySelector('.pb-web-tab-bars');
        return { nodeTop: w.node.getBoundingClientRect().top, bars: host ? host.offsetHeight : 0 };`);
    const overlay = await inChrome(app, `const o = overlayOf(${JSON.stringify(tabId)}); const f = document.getElementById('powerbrowser-content');
        if (!o || !f) return null;
        return { top: o.getBoundingClientRect().top - f.getBoundingClientRect().top };`);
    return theia && overlay ? { bars: theia.bars, delta: Math.round(overlay.top - theia.nodeTop) } : null;
}

/** Any console message carrying a test credential: a credential reached a log. */
function credentialLogged(app) {
    return inChrome(app, `return Services.console.getMessageArray().some(m => { const t = String(m.message || m.errorMessage || ''); return ${JSON.stringify([LOGIN.user, LOGIN.pass, LOGIN.pass2])}.some(v => t.includes(v)); });`);
}

/** The stored logins for the fixture origin, username and password per row (harness-side read-back only). */
function storedLogins(app, origin) {
    return inChrome(app, `return Services.logins.getAllLogins().then(all => all.filter(l => l.origin === ${JSON.stringify(origin)}).map(l => ({ u: l.username, p: l.password })));`);
}

/** Harness-side teardown: the fixture origin's logins go, so the next run starts clean. */
function forgetLogins(app, origin) {
    return inChrome(app, `return Services.logins.getAllLogins().then(all => { for (const l of all) { if (l.origin === ${JSON.stringify(origin)}) Services.logins.removeLogin(l); } return true; });`).catch(() => false);
}

/** Fills the fixture form page-side and submits it with a script submit (the capture pref allows it without typing). */
function submitLogin(app, page, pass) {
    return app.evaluateIn(page.ctx, `(() => { document.getElementById('u').value = ${JSON.stringify(LOGIN.user)}; document.getElementById('p').value = ${JSON.stringify(pass)}; document.getElementById('f').requestSubmit(); return true; })()`);
}

/** The stock password template's field values as the prompter wrote them, read chrome-side; only whether they match. */
function templateFilled(app, pass) {
    return inChrome(app, `const u = document.getElementById('password-notification-username'); const p = document.getElementById('password-notification-password');
        return { user: !!u && u.value === ${JSON.stringify(LOGIN.user)}, pass: !!p && p.value === ${JSON.stringify(pass)}, editable: !!u && !u.hasAttribute('readonly') && !!p && !p.hasAttribute('readonly') };`);
}

async function scenarioPasswordSave(app, fx, plant) {
    const origin = fx.origin;
    try {
        const page = await openPage(app, fx, '/login');
        await submitLogin(app, page, LOGIN.pass);
        if (!await waitInPanel(app, page.tabId, PASSWORD_ID)) {
            return 'no stock password doorhanger after the login submit';
        }
        const filled = await templateFilled(app, LOGIN.pass);
        if (!filled.user || !filled.pass || !filled.editable) {
            return `the stock template fields are not prefilled and editable (${JSON.stringify(filled)})`;
        }
        if (plant === 'credential-leak') {
            // The plant: a username reaching the chrome log, as a leaking log call would.
            await inChrome(app, `Services.console.logStringMessage('[pw] saved ' + ${JSON.stringify(LOGIN.user)}); return true;`);
        }
        await answerStock(app, page.tabId, { id: PASSWORD_ID });
        const stored = await pollFor(async () => ((await storedLogins(app, origin)).some(l => l.u === LOGIN.user && l.p === LOGIN.pass) ? true : null), 8000, 'the saved login').catch(() => false);
        if (!stored) {
            return 'stock Save did not store the login (Services.logins read-back)';
        }
        return await credentialLogged(app) ? CREDENTIAL_LOGGED : null;
    } finally {
        await forgetLogins(app, origin);
    }
}

async function scenarioPasswordUpdate(app, fx, plant) {
    const origin = fx.origin;
    try {
        // The stored login the update replaces, written harness-side.
        await inChrome(app, `const info = Cc['@mozilla.org/login-manager/loginInfo;1'].createInstance(Ci.nsILoginInfo);
            info.init(${JSON.stringify(origin)}, ${JSON.stringify(origin)}, null, ${JSON.stringify(LOGIN.user)}, ${JSON.stringify(LOGIN.pass)}, 'u', 'p');
            return Services.logins.addLoginAsync(info).then(() => true);`);
        const page = await openPage(app, fx, '/login');
        await submitLogin(app, page, LOGIN.pass2);
        if (!await waitInPanel(app, page.tabId, PASSWORD_ID)) {
            return 'no stock password doorhanger after a changed password';
        }
        await answerStock(app, page.tabId, { id: PASSWORD_ID, skip: plant === 'update-dropped' });
        const updated = await pollFor(async () => {
            const rows = await storedLogins(app, origin);
            return rows.length === 1 && rows[0].p === LOGIN.pass2 ? true : null;
        }, 8000, 'the updated login').catch(() => false);
        if (!updated) {
            return 'stock Update did not replace the stored password';
        }
        return await credentialLogged(app) ? CREDENTIAL_LOGGED : null;
    } finally {
        await forgetLogins(app, origin);
    }
}

/** Index of each web tab widget in the main area, by tab id, in the order the user sees them. */
function mainOrder(app) {
    return probe(app, `return get('ApplicationShell').getWidgets('main').filter(w => typeof w.tabId === 'string').map(w => ({ tabId: w.tabId, url: w.url }));`);
}

async function scenarioPopupBlock(app, fx, plant) {
    const opener = await openPage(app, fx, '/opener');
    const from = (await pushes(app)).length;
    await app.evaluateIn(opener.ctx, `(() => { window.__pbPopup = window.open(${JSON.stringify(fx.url('/b'))}); return true; })()`);
    if (await waitForPush(app, isBar(opener.tabId, 'blocked-popup', true), { from }) < 0) {
        return 'no notificationBar push (blocked-popup) for a blocked window.open';
    }
    const view = await pollFor(async () => ((await barView(app, opener.tabId)) ?? []).find(b => b.barKind === 'blocked-popup') ?? null, 5000, 'the blocked-popup bar').catch(() => null);
    if (!view) {
        return 'the blocked-popup bar is not rendered inside the web tab widget';
    }
    if (plant === 'bar-covers-page') {
        // The plant: an unmeasured bar host (display: contents has no box), so publish() cannot shrink the page rect.
        await probe(app, `const w = get('WebTabChannel').widgetOf(${JSON.stringify(opener.tabId)}); w.node.querySelector('.pb-web-tab-bars').style.display = 'contents'; w.publish(); return true;`);
    }
    await new Promise(resolve => setTimeout(resolve, 300));
    const geometry = await barGeometry(app, opener.tabId);
    if (!geometry || geometry.delta <= 0 || Math.abs(geometry.delta - geometry.bars) > 1) {
        return `${BAR_COVERS} (${JSON.stringify(geometry)})`;
    }
    // The control for the D-12 reader: a stock location grant written through the stock doorhanger is visible to it.
    await startGeo(app, opener);
    if (!await waitInPanel(app, opener.tabId)) {
        return 'no stock location doorhanger (the permission reader control)';
    }
    await answerStock(app, opener.tabId, { remember: true });
    const reader = `const { SitePermissions } = ChromeUtils.importESModule('resource:///modules/SitePermissions.sys.mjs');
        const o = overlayOf(${JSON.stringify(opener.tabId)});
        return { ids: SitePermissions.getAllForBrowser(o).map(p => p.id), popup: Services.perms.testPermissionFromPrincipal(o.contentPrincipal, 'popup') === Services.perms.ALLOW_ACTION };`;
    const before = await inChrome(app, reader);
    if (!before.ids.includes(GEO_PERM)) {
        return `${BROKEN} the permission reader does not see a stock location grant, so an empty popup entry would prove nothing`;
    }
    if (plant === 'allow-loads-frame-url') {
        // 37-REVIEW WR-07: a fault in the path the Allow runs. The opener's own blocker answers the replay by opening another
        // URL in a fresh tab instead of re-running the page's window.open, as an Allow that took a URL of its own would.
        await inChrome(app, `const o = overlayOf(${JSON.stringify(opener.tabId)});
            o.popupAndRedirectBlocker.unblockPopup = () => window.openLinkIn(${JSON.stringify(fx.url('/e'))}, 'tab', { openerBrowser: o, triggeringPrincipal: Services.scriptSecurityManager.createNullPrincipal({}) });
            return true;`);
    }
    if (plant === 'adopt-next-to-opener-failed') {
        // 37-REVIEW WR-07: a fault in the adoption's placement. The frontend's addWidget drops the tab-after reference
        // the adopt path passes, with another tab already after the opener, so the adopted tab lands at the end.
        await openWebTab(app, fx.url('/c'));
        await probe(app, `const shell = get('ApplicationShell'); const add = shell.addWidget.bind(shell);
            shell.addWidget = (w, o) => add(w, o && o.mode === 'tab-after' ? { area: 'main' } : o);
            return true;`);
    }
    const clicked = await clickBar(app, opener.tabId, 'blocked-popup', 'allow-popup');
    if (clicked !== 'clicked') {
        return clicked;
    }
    const opened = await pollFor(async () => ((await mainOrder(app)).find(w => /\/(?:b|e)$/.test(String(w.url))) ? true : null), 8000, 'the adopted popup').catch(() => false);
    if (!opened) {
        return 'the bar Allow opened no web tab for the stored popup';
    }
    const order = await mainOrder(app);
    if (order.some(w => String(w.url).endsWith('/e'))) {
        return FRAME_URL_OPENED;
    }
    // WR-04: the replay keeps window.opener, which a fresh load would drop.
    const popupTab = order.find(w => String(w.url).endsWith('/b'));
    if (popupTab && !(await inChrome(app, `const o = overlayOf(${JSON.stringify(popupTab.tabId)}); return !!o && !!o.browsingContext && !!o.browsingContext.opener;`))) {
        return 'the allowed popup has no window.opener';
    }
    const at = order.findIndex(w => w.tabId === opener.tabId);
    if (!String(order[at + 1]?.url ?? '').endsWith('/b')) {
        return `${NOT_NEXT} (${order.map(w => w.url).join(', ')})`;
    }
    const after = await inChrome(app, reader);
    try {
        await forgetGrant(app, opener.tabId);
    } catch { /* teardown */ }
    return after.popup || after.ids.includes('popup') ? 'the bar Allow wrote a popup permission' : null;
}

/** Starts a page loop past the hang threshold; it ends on its own after 60 s or when its script is terminated. */
function startHang(app, page) {
    return app.evaluateIn(page.ctx, `(() => { setTimeout(() => { window.__pbHang = 'running'; const end = Date.now() + 60000; while (Date.now() < end) { /* hung */ } window.__pbHang = 'finished'; }, 0); return true; })()`);
}

async function scenarioHungScript(app, fx, plant) {
    const page = await openPage(app, fx, '/hang');
    let from = (await pushes(app)).length;
    await startHang(app, page);
    if (await waitForPush(app, isBar(page.tabId, 'hung-script', true), { from, timeoutMs: 30000 }) < 0) {
        return 'no notificationBar push (hung-script) for a page past the hang threshold';
    }
    from = (await pushes(app)).length;
    if (await clickBar(app, page.tabId, 'hung-script', 'wait-longer') !== 'clicked') {
        return 'no Keep waiting button on the hung-script bar';
    }
    if (await waitForPush(app, isBar(page.tabId, 'hung-script', false), { from }) < 0) {
        return 'Keep waiting did not hide the hung-script bar';
    }
    if (await waitForPush(app, isBar(page.tabId, 'hung-script', true), { from, timeoutMs: 20000 }) < 0) {
        return 'the hung-script bar did not come back after the wait period (Keep waiting did not re-arm)';
    }
    if (plant === 'hung-stop-ignored') {
        // Simulated symptom: a Stop whose terminateScript never runs (a stale token chrome answers unknown-bar for).
        await probe(app, `const w = get('WebTabChannel').widgetOf(${JSON.stringify(page.tabId)}); await w.barAction('bar-0', 'stop-script'); return true;`);
    } else if (await clickBar(app, page.tabId, 'hung-script', 'stop-script') !== 'clicked') {
        return 'no Stop script button on the hung-script bar';
    }
    const ended = await pollFor(async () => {
        // A still-hung page never answers, so each read gives up after a second instead of blocking the poll.
        const v = await Promise.race([app.evaluateIn(page.ctx, 'window.__pbHang').catch(() => null), new Promise(resolve => setTimeout(() => resolve(null), 1000))]);
        return v === 'running' ? true : null;
    }, 8000, 'a responsive page after Stop').catch(() => false);
    return ended ? null : STOP_IGNORED;
}

/** The web handlers stored for `scheme` (uriTemplate per row), read through the stock handler service. */
function storedHandlers(app, scheme) {
    return inChrome(app, `const info = Cc['@mozilla.org/uriloader/external-protocol-service;1'].getService(Ci.nsIExternalProtocolService).getProtocolHandlerInfo(${JSON.stringify(scheme)});
        const out = []; const apps = info.possibleApplicationHandlers;
        for (let i = 0; i < apps.length; i++) { const a = apps.queryElementAt(i, Ci.nsIHandlerApp); if (a instanceof Ci.nsIWebHandlerApp) out.push(a.uriTemplate); }
        return out;`);
}

/** Harness-side teardown: the fixture's handlers go from the handler service. */
function forgetHandlers(app, schemes) {
    return inChrome(app, `const eps = Cc['@mozilla.org/uriloader/external-protocol-service;1'].getService(Ci.nsIExternalProtocolService);
        const hs = Cc['@mozilla.org/uriloader/handler-service;1'].getService(Ci.nsIHandlerService);
        for (const s of ${JSON.stringify(schemes)}) { const info = eps.getProtocolHandlerInfo(s); if (hs.exists(info)) hs.remove(info); }
        return true;`).catch(() => false);
}

async function scenarioProtocolHandler(app, fx, plant) {
    const schemes = ['web+pbadd', 'web+pbdeny'];
    try {
        const page = await openPage(app, fx, '/proto');
        if (plant === 'protocol-stock-path-unhooked') {
            // The plant: the registrar wrap is put back to the stock method, so the stock notification-box path runs.
            await inChrome(app, `const proto = ChromeUtils.importESModule('resource:///modules/WebProtocolHandlerRegistrar.sys.mjs').WebProtocolHandlerRegistrar.prototype;
                if (proto.registerProtocolHandler.stock) proto.registerProtocolHandler = proto.registerProtocolHandler.stock; return true;`);
        }
        const register = scheme => app.evaluateIn(page.ctx, `(() => { navigator.registerProtocolHandler(${JSON.stringify(scheme)}, location.origin + '/handler?u=%s'); return true; })()`);
        let from = (await pushes(app)).length;
        await register(schemes[0]);
        if (await waitForPush(app, isBar(page.tabId, 'protocol-handler', true), { from, timeoutMs: plant ? 4000 : 15000 }) < 0) {
            if (await consoleHas(app, 'getNotificationBox')) {
                return STOCK_PROTOCOL;
            }
            return 'no notificationBar push (protocol-handler) for registerProtocolHandler';
        }
        if (await clickBar(app, page.tabId, 'protocol-handler', 'add-handler') !== 'clicked') {
            return 'no Add button on the protocol-handler bar';
        }
        const added = await pollFor(async () => ((await storedHandlers(app, schemes[0])).some(t => t.startsWith(fx.origin)) ? true : null), 5000, 'the stored handler').catch(() => false);
        if (!added) {
            return 'Add did not store the handler (handler service read-back)';
        }
        from = (await pushes(app)).length;
        await register(schemes[1]);
        if (await waitForPush(app, isBar(page.tabId, 'protocol-handler', true), { from }) < 0) {
            return 'no protocol-handler bar for the second scheme';
        }
        await clickBar(app, page.tabId, 'protocol-handler', 'deny-handler');
        await new Promise(resolve => setTimeout(resolve, 500));
        return (await storedHandlers(app, schemes[1])).length ? "Don't allow stored a handler" : null;
    } finally {
        await forgetHandlers(app, schemes);
    }
}

// ---- 37-REVIEW CR-01: adopted tabs (Phase 36's page-opened tabs) are tab-host nodes like any other ----

const ADOPTED_HIDDEN = 'adopted tab prompt hidden while it is current';
const ADOPTED_SHOWN = 'adopted tab prompt shown while another tab is current';
const OTHER_OVER_ADOPTED = "another tab's prompt shown over the adopted tab";
const BAR_SURVIVED = 'adopted tab bar survived navigation';
const CLOSE_MARK = 'closing the adopted tab left a pending mark';

/** The page's own window.open under a user gesture (BiDi userActivation), adopted next to its opener: { tabId, ctx } or null. */
async function openAdopted(app, fx, opener, path) {
    const url = fx.url(path);
    const before = new Set((await mainOrder(app)).map(w => w.tabId));
    await app.send('script.evaluate', { expression: `(window.open(${JSON.stringify(url)}), true)`, target: { context: opener.ctx }, awaitPromise: false, userActivation: true });
    const tab = await pollFor(async () => (await mainOrder(app)).find(w => !before.has(w.tabId) && String(w.url).endsWith(path)) ?? null, 10000, 'the adopted tab').catch(() => null);
    if (!tab || await waitForPush(app, loadedAt(tab.tabId, path)) < 0) {
        return null;
    }
    if (!await probe(app, `return !!get('WebTabChannel').widgetOf(${JSON.stringify(tab.tabId)})?.adopted;`)) {
        return null;
    }
    const ctx = await pollFor(async () => (await app.contexts()).find(c => c.url === url)?.context, 15000, `a BiDi context for ${path}`).catch(() => null);
    return ctx ? { tabId: tab.tabId, ctx } : null;
}

/** True once tab `tabId`'s notification `id` is no longer in the open panel (the stock hide is asynchronous). */
async function leavesPanel(app, tabId, id = GEO_ID, timeoutMs = 3000) {
    try {
        return await pollFor(async () => (!(await promptState(app, tabId, id)).inPanel ? true : null), timeoutMs, 'the panel to leave');
    } catch {
        return false;
    }
}

/** Makes an IDE widget (a main-area widget that is not a web tab) current; true when it is. */
function makeIdeCurrent(app) {
    return probe(app, `const shell = get('ApplicationShell');
        let w = shell.getWidgets('main').find(x => typeof x.tabId !== 'string');
        if (!w) { await get('CommandRegistry').executeCommand('workbench.action.files.newUntitledFile'); w = get('EditorManager').currentEditor; }
        if (!w) return false;
        await shell.activateWidget(w.id);
        return await until(() => shell.mainPanel.currentTitle?.owner === w, 5000);`);
}

/** The user's close of web tab `tabId` through its widget. */
function closeTab(app, tabId) {
    return probe(app, `const w = get('WebTabChannel').widgetOf(${JSON.stringify(tabId)}); if (!w) return false; w.close(); return true;`);
}

/** CR-01a: an adopted tab's prompt follows the current tab, between host tabs and the IDE, and no other tab's shows over it. */
async function scenarioAdoptedPrompt(app, fx, plant) {
    const host = await openPage(app, fx, '/opener');
    const adopted = await openAdopted(app, fx, host, '/b');
    if (!adopted) {
        return `${BROKEN} the page's own window.open produced no adopted tab`;
    }
    await makeCurrent(app, adopted.tabId);
    if (plant === 'adopted-selection-stale') {
        // CR-01 as reviewed: the prompt facade's selection stays on the host tab while the adopted tab is current.
        const applied = await inChrome(app, `const f = window.PopupNotifications.tabbrowser;
            const real = Object.getOwnPropertyDescriptor(f, 'selectedBrowser').get;
            const a = overlayOf(${JSON.stringify(adopted.tabId)}), h = overlayOf(${JSON.stringify(host.tabId)});
            Object.defineProperty(f, 'selectedBrowser', { configurable: true, get() { const b = real.call(f); return b === a ? h : b; } });
            return f.selectedBrowser === h;`);
        if (!applied) {
            return `${BROKEN} the adopted-selection-stale plant did not take`;
        }
    }
    await startGeo(app, adopted);
    if (!await waitInPanel(app, adopted.tabId, GEO_ID, 8000)) {
        return ADOPTED_HIDDEN;
    }
    await makeCurrent(app, host.tabId);
    if (!await leavesPanel(app, adopted.tabId)) {
        return `${ADOPTED_SHOWN} (a host tab)`;
    }
    await startGeo(app, host);
    if (!await waitInPanel(app, host.tabId, GEO_ID, 8000)) {
        return 'the host tab prompt did not show while it is current (the control is red)';
    }
    await makeCurrent(app, adopted.tabId);
    if (!await waitInPanel(app, adopted.tabId, GEO_ID, 8000)) {
        return `${ADOPTED_HIDDEN} (back from a host tab)`;
    }
    if ((await promptState(app, host.tabId)).inPanel) {
        return OTHER_OVER_ADOPTED;
    }
    if (!await makeIdeCurrent(app)) {
        return `${BROKEN} no IDE widget could be made current`;
    }
    if (!await leavesPanel(app, adopted.tabId)) {
        return `${ADOPTED_SHOWN} (the IDE)`;
    }
    await makeCurrent(app, adopted.tabId);
    if (!await waitInPanel(app, adopted.tabId, GEO_ID, 8000)) {
        return `${ADOPTED_HIDDEN} (back from the IDE)`;
    }
    await answerStock(app, adopted.tabId);
    return await geoOutcome(app, adopted) === 'granted' ? null : 'stock Allow on the adopted tab did not grant (the positive control is red)';
}

/** CR-01b: an adopted tab's bar clears on navigation; closing it drops its prompts (pending:false) and leaves no mark. */
async function scenarioAdoptedBarNavigate(app, fx, plant) {
    const host = await openPage(app, fx, '/opener');
    const adopted = await openAdopted(app, fx, host, '/b');
    if (!adopted) {
        return `${BROKEN} the page's own window.open produced no adopted tab`;
    }
    await makeCurrent(app, adopted.tabId);
    const blockPopup = () => app.evaluateIn(adopted.ctx, `(() => { window.open(${JSON.stringify(fx.url('/c'))}); return true; })()`);
    let from = (await pushes(app)).length;
    await blockPopup();
    if (await waitForPush(app, isBar(adopted.tabId, 'blocked-popup', true), { from }) < 0) {
        return 'no blocked-popup bar on the adopted tab';
    }
    from = (await pushes(app)).length;
    await app.send('browsingContext.navigate', { context: adopted.ctx, url: fx.url('/d'), wait: 'none' });
    if (await waitForPush(app, loadedAt(adopted.tabId, '/d'), { from }) < 0) {
        return `${BROKEN} the adopted tab never loaded /d`;
    }
    const cleared = await waitForPush(app, isBar(adopted.tabId, 'blocked-popup', false), { from, timeoutMs: 3000 }) >= 0;
    const left = (await barView(app, adopted.tabId)) ?? [];
    if (!cleared || left.length) {
        return `${BAR_SURVIVED} (${JSON.stringify(left)})`;
    }
    // The close half: a waiting prompt and a bar on the adopted tab, then the user's close.
    from = (await pushes(app)).length;
    await blockPopup();
    if (await waitForPush(app, isBar(adopted.tabId, 'blocked-popup', true), { from }) < 0) {
        return `${BROKEN} no second blocked-popup bar on the adopted tab`;
    }
    await makeCurrent(app, host.tabId);
    await startGeo(app, adopted);
    if (await waitForPush(app, isDoorhanger(adopted.tabId, true), { from }) < 0) {
        return `${BROKEN} the backgrounded adopted tab's prompt sent no pending push`;
    }
    const marked = await pollFor(async () => (await app.evaluate("document.querySelectorAll('.pb-tab-prompt-pending').length")) > 0 || null, 5000, 'the pending mark').catch(() => false);
    if (!marked) {
        return `${BROKEN} the strip shows no pending mark for the waiting prompt, so its absence after the close proves nothing`;
    }
    await inChrome(app, `window.__pbClosedOverlay = overlayOf(${JSON.stringify(adopted.tabId)}); return true;`);
    if (plant === 'adopted-close-cleanup-skipped') {
        // CR-01 as reviewed: no TabClose reaches the strip's listeners for the adopted tab, so its close is never cleaned up.
        const applied = await inChrome(app, `const a = window.__pbClosedOverlay;
            window.__pbStopClose = e => { if (e.target && e.target.linkedBrowser === a) e.stopImmediatePropagation(); };
            window.addEventListener('TabClose', window.__pbStopClose, true);
            return !!a && typeof window.__pbStopClose === 'function';`);
        if (!applied) {
            return `${BROKEN} the adopted-close-cleanup-skipped plant did not take`;
        }
    }
    from = (await pushes(app)).length;
    if (!await closeTab(app, adopted.tabId)) {
        return `${BROKEN} the adopted tab has no widget to close`;
    }
    // The stock TabClose handler fires each notification's removed callback (and so the pending:false push); it leaves the
    // list on the closed browser, which goes with it, so the push and the strip are what is read.
    const dropped = await waitForPush(app, isDoorhanger(adopted.tabId, false), { from, timeoutMs: 5000 }) >= 0;
    const marks = await app.evaluate("document.querySelectorAll('.pb-tab-prompt-pending').length");
    return dropped && marks === 0 ? null : `${CLOSE_MARK} (pending:false pushed ${dropped}, strip marks ${marks})`;
}

const SCENARIOS = {
    permission: scenarioPermission,
    'answer-delay': scenarioAnswerDelay,
    'background-queue': scenarioBackgroundQueue,
    'cancel-on-evict': scenarioCancelOnEvict,
    remember: scenarioRemember,
    sharing: scenarioSharing,
    'camera-doorhanger': scenarioCameraDoorhanger,
    'dialog-probe': scenarioDialogProbe,
    dialog: scenarioDialog,
    'stop-repeat': scenarioStopRepeat,
    'beforeunload-scope': scenarioBeforeunloadScope,
    'password-save': scenarioPasswordSave,
    'password-update': scenarioPasswordUpdate,
    'popup-block': scenarioPopupBlock,
    'adopted-prompt': scenarioAdoptedPrompt,
    'adopted-bar-navigate': scenarioAdoptedBarNavigate,
    'hung-script': scenarioHungScript,
    'protocol-handler': scenarioProtocolHandler,
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
    { plant: 'probe-edit-blocked', target: 'dialog-probe', expect: 'stock dialog blocks the IDE' },
    { plant: 'push-traffic-frozen', target: 'dialog', expect: 'IDE push traffic stopped while dialog open' },
    { plant: 'cross-tab-leak', target: 'stop-repeat', expect: 'suppression leaked across tabs' },
    { plant: 'theia-beforeunload-relayed', target: 'beforeunload-scope', expect: 'Theia-frame beforeunload relayed' },
    { plant: 'credential-leak', target: 'password-save', expect: 'credential value in log' },
    { plant: 'update-dropped', target: 'password-update', expect: 'stock Update did not replace the stored password' },
    { plant: 'allow-loads-frame-url', target: 'popup-block', expect: 'Allow opened a frame-supplied URL' },
    { plant: 'bar-covers-page', target: 'popup-block', expect: 'bar covers page content' },
    { plant: 'adopt-next-to-opener-failed', target: 'popup-block', expect: 'popup not adopted next to its opener' },
    { plant: 'adopted-selection-stale', target: 'adopted-prompt', expect: 'adopted tab prompt hidden while it is current' },
    { plant: 'adopted-close-cleanup-skipped', target: 'adopted-bar-navigate', expect: 'closing the adopted tab left a pending mark' },
    { plant: 'hung-stop-ignored', target: 'hung-script', expect: 'Stop script did not terminate the loop' },
    { plant: 'protocol-stock-path-unhooked', target: 'protocol-handler', expect: 'stock protocol bar path reached: getNotificationBox TypeError' },
];

// WebDriver's default unhandledPromptBehavior dismisses every dialog; the scenarios need Firefox's own to stay open.
const KEEP_PROMPTS = { alwaysMatch: { unhandledPromptBehavior: { default: 'ignore' } } };

/**
 * 999.12, a harness route only: the sharing session runs as an X11 client of XWayland with PipeWire capture off, so
 * getDisplayMedia uses the X11 capturer, the stock doorhanger lists the X11 screen, and no KDE portal chooser opens. The
 * pref alone is not enough: libwebrtc creates the X11 screen capturer only when DesktopCapturer::IsRunningUnderWayland()
 * is false, which reads XDG_SESSION_TYPE (screen_capturer_linux.cc, desktop_capturer.cc). The product's PipeWire portal
 * path is checked by hand (human checklist row "37 T6 portal click").
 */
const X11_CAPTURE = { prefs: { [PIPEWIRE_PREF]: false }, env: { MOZ_ENABLE_WAYLAND: '0', GDK_BACKEND: 'x11', XDG_SESSION_TYPE: 'x11' } };

async function runSession(name, plant) {
    const route = name === 'sharing' ? X11_CAPTURE : { prefs: {}, env: {} };
    // firefox-bidi spawns the browser with process.env, so the route's env is set for this session and restored after.
    const saved = Object.fromEntries(Object.keys(route.env).map(k => [k, process.env[k]]));
    Object.assign(process.env, route.env);
    const fx = await serveNavPages(PAGES);
    try {
        return await withProbeShell(app => SCENARIOS[name](app, fx, plant), { extraPrefs: { ...PREFS, ...route.prefs }, capabilities: KEEP_PROMPTS });
    } finally {
        await fx.close();
        for (const [k, v] of Object.entries(saved)) {
            if (v === undefined) {
                delete process.env[k];
            } else {
                process.env[k] = v;
            }
        }
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
    if (!sp.includes(`\n    ${GEO_PERM}: {`)) {
        failures.push(`${UPSTREAM_SP} has no ${GEO_PERM} permission; the remember and popup-block readers look for an id upstream does not use`);
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
    // 37-03: the stock dialog path the dialog scenarios drive, derived from upstream.
    const promptParent = readFileSync(join(REPO_ROOT, UPSTREAM_PROMPT_PARENT), 'utf8');
    if (!promptParent.includes(`const COMMON_DIALOG = "${COMMON_DIALOG_URL}"`)) {
        failures.push(`${UPSTREAM_PROMPT_PARENT} no longer opens ${COMMON_DIALOG_URL}; the dialog scenarios look for a window upstream does not open`);
    }
    if (!promptParent.includes('win?.gBrowser?.getTabDialogBox') || !promptParent.includes('"centerscreen,chrome,modal,titlebar"')) {
        failures.push(`${UPSTREAM_PROMPT_PARENT} no longer feature-detects getTabDialogBox with a window-modal fallback; probe 1 measures a path upstream does not take`);
    }
    const dialogMarkup = readFileSync(join(REPO_ROOT, UPSTREAM_COMMON_DIALOG), 'utf8');
    for (const id of DIALOG_IDS) {
        if (!dialogMarkup.includes(`id="${id}"`)) {
            failures.push(`${UPSTREAM_COMMON_DIALOG} has no #${id}; the dialog scenarios read or answer an element upstream lacks`);
        }
    }
    if (!readFileSync(join(REPO_ROOT, UPSTREAM_PREFS), 'utf8').includes(`- name: ${BEFOREUNLOAD_PREF}\n`)) {
        failures.push(`${UPSTREAM_PREFS} has no ${BEFOREUNLOAD_PREF}; the leave kind sets a pref upstream does not read`);
    }
    // Task 4: the native stop is upstream's own, keyed by browsing-context group.
    const outer = readFileSync(join(REPO_ROOT, UPSTREAM_OUTER_WINDOW), 'utf8');
    if (!outer.includes('bool nsGlobalWindowOuter::ShouldPromptToBlockDialogs()') || (outer.match(/if \(disallowDialog\) \{\s*DisableDialogs\(\);/g) ?? []).length < 2) {
        failures.push(`${UPSTREAM_OUTER_WINDOW} no longer offers the stop checkbox through ShouldPromptToBlockDialogs and DisableDialogs; stop-repeat ticks a checkbox upstream does not honour`);
    }
    if (!/group->SetAreDialogsEnabled\(false\)/.test(outer)) {
        failures.push(`${UPSTREAM_OUTER_WINDOW} no longer disables dialogs per browsing-context group; stop-repeat's new-group control assumes a scope upstream does not use`);
    }
    // 37-04: the names the password and bar scenarios read, derived from the tree and upstream.
    const prompter = readFileSync(join(REPO_ROOT, UPSTREAM_PROMPTER), 'utf8');
    if (!prompter.includes(`const notificationID = "${PASSWORD_ID}";`)) {
        failures.push(`${UPSTREAM_PROMPTER} no longer shows its doorhanger as "${PASSWORD_ID}"; the password scenarios wait for a notification upstream does not show`);
    }
    for (const id of ['password-notification-username', 'password-notification-password']) {
        if (!markup.includes(`id="${id}"`) || !prompter.includes(`"${id}"`)) {
            failures.push(`#${id} is missing from ${XHTML} or no longer read by ${UPSTREAM_PROMPTER}; templateFilled reads a field the prompter does not fill`);
        }
    }
    if (!readFileSync(join(REPO_ROOT, UPSTREAM_ALL_JS), 'utf8').includes(`pref("${CAPTURE_PREF}", true);`)) {
        failures.push(`${UPSTREAM_ALL_JS} no longer defaults ${CAPTURE_PREF}; the scripted login submit relies on turning it off`);
    }
    const prefList = readFileSync(join(REPO_ROOT, UPSTREAM_PREFS), 'utf8');
    for (const name of [HANG_PREF, 'dom.max_script_run_time.require_critical_input', 'dom.disable_open_during_load', 'dom.ipc.reportProcessHangs']) {
        if (!prefList.includes(`- name: ${name}\n`)) {
            failures.push(`${UPSTREAM_PREFS} has no ${name}; a bar scenario sets a pref upstream does not read`);
        }
    }
    if (!prefList.includes(`- name: ${PIPEWIRE_PREF}\n`)) {
        failures.push(`${UPSTREAM_PREFS} has no ${PIPEWIRE_PREF}; the sharing session's X11 capture route turns off a pref upstream does not read`);
    }
    if (!readFileSync(join(REPO_ROOT, UPSTREAM_DESKTOP_CAPTURER), 'utf8').includes(`getenv("XDG_SESSION_TYPE")`) || X11_CAPTURE.env.XDG_SESSION_TYPE !== 'x11') {
        failures.push(`${UPSTREAM_DESKTOP_CAPTURER} no longer decides Wayland from XDG_SESSION_TYPE, or the X11 route does not set it to x11; the sharing session would reach the portal chooser`);
    }
    if (!readFileSync(join(REPO_ROOT, UPSTREAM_HANG_MONITOR), 'utf8').includes(`"${WAIT_PREF}"`)) {
        failures.push(`${UPSTREAM_HANG_MONITOR} no longer reads ${WAIT_PREF}; the Keep waiting re-arm timing is not the stock one`);
    }
    const api = readFileSync(join(REPO_ROOT, API), 'utf8');
    if (!api.includes(`"${WAIT_PREF}"`)) {
        failures.push(`${API} does not read ${WAIT_PREF}; Keep waiting does not use the stock wait period`);
    }
    if (!/wrapped\.stock = stock;/.test(api)) {
        failures.push(`${API} no longer keeps the stock registrar method on the wrap; the protocol-stock-path-unhooked plant cannot apply`);
    }
    for (const barKind of ['blocked-popup', 'hung-script', 'protocol-handler']) {
        if (!BAR_ACTIONS[barKind]) {
            failures.push(`${WEB_TAB} NOTIFICATION_BAR_ACTIONS has no ${barKind}; clickBar cannot find that bar's buttons`);
        }
    }
    if (!(PREFS[BEFOREUNLOAD_PREF] === false)) {
        failures.push(`PREFS does not turn ${BEFOREUNLOAD_PREF} off; the leave kind needs a gesture the harness never gives`);
    }
    // WR-05: the relay measurement can return false. A clean fact set is feasible, and each planted fault is not.
    const cleanFacts = { tabs: [{ tabId: 'wt-h', adopted: false, tabbed: true }, { tabId: 'wt-a', adopted: true, tabbed: true }], selectedBrowser: true, authSpoof: true, authMembers: true };
    if (!relayFeasibleFrom(cleanFacts).feasible) {
        failures.push(`relayFeasibleFrom refuses a clean fact set (${relayFeasibleFrom(cleanFacts).why.join('; ')}) (broken instrument)`);
    }
    const relayPlants = [
        ['adopted tab without a node', { ...cleanFacts, tabs: [cleanFacts.tabs[0], { ...cleanFacts.tabs[1], tabbed: false }] }, 'no node for adopted tab'],
        ['no adopted tab measured', { ...cleanFacts, tabs: [cleanFacts.tabs[0]] }, 'no adopted tab measured'],
        ['auth branch needs a widening', { ...cleanFacts, authMembers: false }, 'Pitfall-2 widening'],
    ];
    for (const [label, facts, expect] of relayPlants) {
        const got = relayFeasibleFrom(facts);
        if (got.feasible || !got.why.some(w => w.includes(expect))) {
            failures.push(`relay plant '${label}' did not make relayFeasible false naming '${expect}' (got ${JSON.stringify(got)})`);
        }
    }
    if (!/relayFeasible: relay \? relay\.feasible : null/.test(own)) {
        failures.push('probe 1 does not write relayFeasible from relayFeasibleFrom; the route-to-Chris branch of rule (p) is unreachable');
    }
    // OQ1: the PROMPT-03 skip is derived from the deferral record, so it must stop the moment either half of it goes.
    const requirements = readRequirements();
    if (prompt03DeferredTo(requirements) && deferredSkips(requirements).size !== PROMPT03_SCENARIOS.length) {
        failures.push(`${REQUIREMENTS} records the PROMPT-03 deferral but the skip did not apply (broken instrument)`);
    }
    const deferralPlants = [
        ['deferral-record-removed', requirements.replace(/ \(deferred to Phase [^\n]*/, '')],
        ['deferral-row-removed', requirements.replace(/^\| PROMPT-03 \| Phase (\S+) \| Deferred \|$/m, '| PROMPT-03 | Phase $1 | Pending |')],
    ];
    for (const [plant, text] of deferralPlants) {
        if (prompt03DeferredTo(requirements) && text === requirements) {
            failures.push(`static plant ${plant} changed nothing in ${REQUIREMENTS} (broken instrument)`);
        } else if (deferredSkips(text).size) {
            failures.push(`static plant ${plant}: skip applied without a recorded deferral`);
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
    console.log('  ok  static: deferral-record-removed and deferral-row-removed -> the PROMPT-03 skip no longer applies');
    if (process.argv.includes('--static')) {
        console.log(`${NAME} --self-test --static: PASS -- the live control and plant sessions were not run (--static)`);
        return 0;
    }
    const flag = process.argv.indexOf('--scenario');
    const only = flag === -1 ? null : (process.argv[flag + 1] ?? '').split(',');
    const unknown = (only ?? []).filter(name => !(name in SCENARIOS));
    if (unknown.length || (only && !only.length)) {
        console.error(`${NAME} --self-test: unknown scenario(s): ${unknown.join(', ') || '(none given)'}`);
        return 1;
    }
    // OQ1: a full self-test drops the plants of the deferred PROMPT-03 scenarios; an explicit --scenario keeps them.
    const skips = only ? new Map() : deferredSkips(readRequirements());
    skips.forEach((why, name) => console.log(`${name}: ${why}`));
    const plants = (only ? PLANTS.filter(p => only.includes(p.target)) : PLANTS).filter(p => !skips.has(p.target));
    const reason = preflight();
    if (reason) {
        console.error(`${NAME} --self-test: ${reason}`);
        return 1;
    }
    for (const target of new Set(plants.map(p => p.target))) {
        const control = await runSession(target, null);
        if (control !== null) {
            console.error(`${NAME} --self-test: FAIL -- the clean control for ${target} is red: ${control}`);
            return 1;
        }
        console.log(`  ok  clean control for ${target} -> green`);
    }
    let failed = 0;
    for (const p of plants) {
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
    console.log(`${NAME} --self-test: PASS -- clean controls green, ${plants.length} planted faults went red${only ? ` (live half limited to ${only.join(',')}; ${PLANTS.length - plants.length} plant(s) not run)` : skips.size ? ` (${PLANTS.length - plants.length} plant(s) of ${[...skips.keys()].join(', ')} not run: PROMPT-03 deferred)` : ''}`);
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
    // OQ1: a default run leaves out the deferred PROMPT-03 scenarios while the deferral is recorded.
    const skips = flag === -1 ? deferredSkips(readRequirements()) : new Map();
    skips.forEach((why, name) => console.log(`${name}: ${why}`));
    const selected = flag === -1 ? Object.keys(SCENARIOS).filter(name => !skips.has(name)) : process.argv[flag + 1].split(',');
    const unknown = selected.filter(name => !(name in SCENARIOS));
    if (unknown.length) {
        console.error(`${NAME}: unknown scenario(s): ${unknown.join(', ')}`);
        return 1;
    }
    // Probe 1's verdict is written only by its own live run, never by a self-test session.
    writeVerdict = selected.includes('dialog-probe');
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
