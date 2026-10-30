#!/usr/bin/env node
/**
 * Phase 31 (SITE-01..03): the site-identity live gate -- Task 1's
 * `identity-tls` and `identity-local` scenarios on the pb-live-probe
 * harness. (Per 31-VALIDATION.md's sampling map the `site-panel`,
 * `clear-data`, `shield` and `app-menu` scenarios land with plans 02-04,
 * so they are `SKIP *-not-landed` here, never pass, never silent.)
 *
 * Session A -- `identity-tls` (at most 4 web tabs: secure, plain,
 * mixed, idn-spoof):
 *   - `https://www.<fixture>/secure` pushes `secure` and the pill renders
 *     the lock icon, the `Connection secure` hover text and the base-domain
 *     highlight (`<strong>` around the registrable domain); the unfocused
 *     pill text has no leading `https://`, and focusing it restores the
 *     full URL (SITE-03, D-31-10);
 *   - `http://<fixture>/plain` pushes `insecure` and the pill renders the
 *     unlock icon, the `Not Secure` text, and keeps the `http://` prefix in
 *     the pill;
 *   - `https://www.<fixture>/mixed` (an `http:` `<img>`) pushes
 *     `mixed-passive` and the pill renders the warning icon; the spoof
 *     step types `https://evil.example` into the pill on the plain tab and
 *     asserts the icon AND the text are unchanged;
 *   - IDN: the mixed-script host in `localDomains` resolves to loopback and
 *     its pushed `displaySpec` equals `url.domainToASCII` punycode.
 * Session B -- `identity-local` (one tab): the served-origin tab pushes
 * `local` and the pill renders the host with no icon; an untitled editor
 * made current renders no `.pb-identity` element (D-31-09/D-31-10:
 * editor tabs show nothing).
 * Both sessions assert the pushed `securityState` (via the tab's last
 * state push) AND the DOM per case -- never one without the other.
 *
 * Session A2 -- `identity-override` (own TLS browser, fixture CA NOT trusted, one tab):
 *   the override is added in the probe profile only; the page pushes `broken`,
 *   never `secure` (CR-01), and the pill renders the warning icon.
 * Session C -- `site-panel` (own TLS browser, one tab): the panel's connection
 * and certificate block, six tri-state rows in table order, camera and
 * autoplay-media round trips with persistence across a reopen, the identity
 * box icons (three plus +1, back to none), autoplay-media read as the pref default (Firefox parity), and the origin
 * race: the panel shows origin A, the tab navigates to origin B, the write is
 * refused, and camera stays default on B.
 * Plant `perm-refused` makes the permission reply refused (expected red
 * "can't show site information"); plant `icons-stale` stops the reply from
 * refreshing the identity box (expected red "icons did not update").
 *
 * Session D -- `clear-data` (one tab on 127.0.0.1 and one on localhost): the
 * clear-data row, its confirm, the marker cookie gone, the IDE token cookie and
 * a same-origin frame request still signed in, and hasData false for localhost.
 * Session E -- `shield` (a tracker page on 127.0.0.1 and a localhost page): the
 * count line, off then on, the chrome-side exception, the box shield, and the
 * second site unchanged.
 * Plant `clear-signout` (token removed before the clear), `shield-stale` (box
 * shield not rendered), `shield-leak` (exception written on the second site).
 *
 * Session F -- `app-menu` (one served page, the stock windows): the hamburger opens the
 * per-request menu in Coding, Browsing and Organising; the rows read in the tree's
 * order, Quit enabled (plan 05); Settings, Passwords, Add-ons and Help each open
 * their stock page in one stock window, one tab on the page, with the web tab unchanged.
 * Quit's own click and Ctrl+Q are the quit-key and quit-row scenarios (plan 05), each
 * alone in its launch because a quit ends the application.
 * Plant `menu-dead-stock` makes openStockPage resolve without opening (red
 * "did not open its stock page").
 *
 * Plant `typed-lock`: re-inserts the original render-line derivation
 * (`this.inputValue.trim().startsWith('https://')` on the live
 * `AddressBar`) so the pill follows typed text; expected red
 * `lock derived from typed text` (the scenario fails naming that text
 * when the box follows typing).
 *
 * Needs the built browser and the last Theia app build; not a --quick check.
 * The fixture hosts resolve to loopback only inside the probe profile
 * (`network.dns.localDomains`), and the CA is trusted in that profile only.
 *
 * Usage:
 *   node scripts/verify-site-identity-live.mjs [--scenario identity-tls,identity-local] | --self-test
 */

import {
    BROKEN,
    appNameExpr,
    focusTheiaFrame,
    inChrome,
    keyRoute,
    loadedAt,
    makeCurrent,
    openWebTab,
    pressKey,
    pushes,
    serveNavPages,
    waitForPush,
    withProbeShell,
} from './lib/pb-live-probe.mjs';
import { domainToASCII, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { probe } from './lib/pb-relaunch.mjs';

const NAME = 'verify-site-identity-live';
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TABLE_REL = 'theia/extensions/chrome-bar/src/browser/site-identity/site-identity-table.ts';

// The fixture hosts, derived from the README at check time -- never
// re-spelled here. The leaf covers the bare and www names; the mixed-script
// IDN maps to loopback the same way through localDomains.
const FIXTURE_HOSTS = ['pb-fixture.test', 'www.pb-fixture.test'];
const TLS_PORT = 18443;
// Mutable cell for the mixed page's plain-port subresource (see PAGES).
let currentPlainPort = 0;
const plainPortOf = () => currentPlainPort;
const setPlainPort = port => { currentPlainPort = Number(port); };
const EXTRA_PREFS = {
    'network.dns.localDomains': [...FIXTURE_HOSTS, domainToASCII('pаypal-fixture.test')].join(','),
    'security.mixed_content.upgrade_display_content': false,
};

const PAGES = {
    '/secure': { title: 'Secure Page', body: '<p>secure</p>' },
    '/plain': { title: 'Plain Page', body: '<p>plain</p>' },
    // Plan 03 (SITE-08): a page whose tracker host the bundled classifier blocks (trackertest.org); the request never resolves.
    '/tracker': { title: 'Tracker Page', body: '<p>tracker</p>', extra: () => '<img src="http://trackertest.org/t.gif">' },
    // Plan 03 (SITE-07): a page that leaves its own site data: a marker cookie set by the page's script, as real site data is.
    '/seed': { title: 'Seed Page', body: '<p>seed</p>', extra: () => "<script>document.cookie = 'pb-clear-marker=seeded; path=/; SameSite=Lax';</script>" },
    // The mixed page's http: subresource port is known only after listen,
    // so the handler closes over the mutable cell below (set in runSession).
    '/mixed': { title: 'Mixed Page', body: '<p>mixed</p>', extra: () => `<img src="http://pb-fixture.test:${plainPortOf()}/plain">` },
};

/** The identity box in the Theia frame: host HTML, icon, text and tooltip. */
const readIdentity = app => app.evaluate(`JSON.stringify((() => {
    const box = document.querySelector('.pb-identity');
    if (!box) return { present: false };
    const icon = box.querySelector('.pb-identity-icon');
    const host = box.querySelector('.pb-identity-host');
    return {
        present: true,
        host: host?.textContent ?? null,
        strong: host?.querySelector('strong')?.textContent ?? null,
        icon: icon ? [...icon.classList].filter(c => c !== 'pb-identity-icon' && c !== 'codicon').join(' ') : null,
        insecure: box.querySelector('.pb-identity-insecure')?.textContent ?? null,
        label: box.getAttribute('aria-label'),
        pill: document.querySelector('.pb-chrome-bar-input')?.value ?? null,
    };
})())`).then(JSON.parse);

/**
 * Focuses the pill, reads its text, then blurs it: the focused text is the full URL (SITE-03).
 * The Theia frame is focused first: without it the document lacks focus and Gecko never fires
 * the input's focus event, so the handler under test would not run.
 */
const focusPill = async app => {
    if (await focusTheiaFrame(app) !== true) {
        throw new Error(`${BROKEN} the Theia frame could not be made chrome's active element`);
    }
    return probe(app, `const input = document.querySelector('.pb-chrome-bar-input');
    if (!input) return null;
    input.focus();
    if (!document.hasFocus() || document.activeElement !== input) return null;
    const text = input.value;
    input.blur();
    return text;`);
};

/** The last loaded state push for `tabId`. */
const lastPush = async (app, tabId) =>
    (await pushes(app)).filter(p => p && p.kind === 'state' && p.tabId === tabId && p.loading === false).pop();

/** Hovers the identity box and reads the HoverService tooltip text. */
const hoverTip = app => probe(app, `const box = document.querySelector('.pb-identity');
    if (!box) return { shown: 0 };
    get('HoverService').cancelHover();
    box.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    if (!(await until(() => [...document.querySelectorAll('.theia-hover')].filter(h => h.matches(':popover-open') && !h.style.visibility).length > 0, 5000))) return { shown: 0 };
    const shown = [...document.querySelectorAll('.theia-hover')].filter(h => h.matches(':popover-open') && !h.style.visibility);
    const seen = { shown: shown.length, text: shown[0].textContent, ours: shown[0].classList.contains('pb-chrome-bar-hover') };
    get('HoverService').cancelHover();
    return seen;`);

async function identityTls(ctx) {
    const { app, pages, plant, fail, note } = ctx;
    // Plant `typed-lock`: re-inserts the ORIGINAL render-line derivation
    // (`this.inputValue.trim().startsWith('https://')`) on the live
    // AddressBar -- the same string the static gate's absence case pins --
    // so the box follows pill text. The spoof step then fails naming it.
    if (plant === 'typed-lock' && await probe(app, `const bar = get('AddressBar');
        const proto = Object.getPrototypeOf(bar);
        const original = proto.renderIdentityBox;
        proto.renderIdentityBox = function () {
            const secure = this.inputValue.trim().startsWith('https://');
            if (!secure) return original.call(this);
            // The pre-31 lock followed the typed text; shadow the pushed state with it.
            this.identityState = () => ({ state: 'secure', displaySpec: '', baseDomain: null, permissionIcons: [], permissionLabels: [] });
            try { return original.call(this); } finally { delete this.identityState; }
        };
        return true;`) === true) {
        note('PLANT typed-lock applied');
    }
    // --- secure: lock + hover + base-domain highlight + trim.
    const secureId = await openWebTab(app, pages.tlsUrl('/secure'));
    if (await waitForPush(app, p => p && p.kind === 'state' && p.tabId === secureId && String(p.url ?? '').endsWith('/secure') && p.loading === false) < 0) {
        return fail(`${BROKEN} no loaded state push arrived for /secure`);
    }
    if (await makeCurrent(app, secureId) !== true) {
        return fail(`${BROKEN} the secure web tab could not be made current`);
    }
    const securePush = await lastPush(app, secureId);
    if (!securePush) {
        return fail(`${BROKEN} no state push for the secure tab to compare the box against`);
    }
    if (securePush.securityState !== 'secure') {
        fail(`the secure tab pushed ${JSON.stringify(securePush.securityState)}, want "secure" (url ${JSON.stringify(securePush.url)})`);
    }
    const secureBox = await readIdentity(app);
    if (!secureBox.present) {
        fail('no .pb-identity element with the secure web tab current');
    } else {
        if (secureBox.icon === null || !String(secureBox.icon).includes('lock')) {
            fail(`the secure pill must render the lock icon; saw icon ${JSON.stringify(secureBox.icon)}`);
        }
        if (secureBox.strong !== 'pb-fixture.test') {
            fail(`the secure pill must highlight the base domain; saw strong ${JSON.stringify(secureBox.strong)} in host ${JSON.stringify(secureBox.host)}`);
        }
        // SITE-03: unfocused, the pill trims https://; focused, it holds the full URL.
        if (secureBox.pill === null || /^https:\/\//i.test(secureBox.pill)) {
            fail(`the unfocused secure pill must trim https://; saw ${JSON.stringify(secureBox.pill)}`);
        }
        const focusedPill = await focusPill(app);
        if (focusedPill === null || !/^https:\/\//i.test(String(focusedPill))) {
            fail(`the focused secure pill must hold the full URL with https://; saw ${JSON.stringify(focusedPill)}`);
        }
    }
    const tip = await hoverTip(app);
    if (tip?.shown !== 1 || tip.text !== 'Connection secure' || !tip.ours) {
        fail(`hovering the secure identity box must show one pb-chrome-bar-hover tooltip reading "Connection secure"; saw ${JSON.stringify(tip)}`);
    }
    // --- plain http: unlock + Not Secure + http:// kept.
    const plainId = await openWebTab(app, `http://pb-fixture.test:${pages.port}/plain`);
    if (await waitForPush(app, p => p && p.kind === 'state' && p.tabId === plainId && String(p.url ?? '').endsWith('/plain') && p.loading === false) < 0) {
        return fail(`${BROKEN} no loaded state push arrived for /plain`);
    }
    if (await makeCurrent(app, plainId) !== true) {
        return fail(`${BROKEN} the plain web tab could not be made current`);
    }
    const plainPush = await lastPush(app, plainId);
    if (!plainPush) {
        return fail(`${BROKEN} no state push for the plain tab to compare the box against`);
    }
    if (plainPush.securityState !== 'insecure') {
        fail(`the plain tab pushed ${JSON.stringify(plainPush.securityState)}, want "insecure" (url ${JSON.stringify(plainPush.url)})`);
    }
    const plainBox = await readIdentity(app);
    if (!plainBox.present) {
        fail('no .pb-identity element with the plain web tab current');
    } else {
        if (plainBox.icon === null || !String(plainBox.icon).includes('unlock')) {
            fail(`the insecure pill must render the unlock icon; saw icon ${JSON.stringify(plainBox.icon)}`);
        }
        if (plainBox.insecure !== 'Not Secure') {
            fail(`the insecure pill must render the Not Secure text; saw ${JSON.stringify(plainBox.insecure)}`);
        }
        if (plainBox.pill !== null && !/^http:\/\//i.test(plainBox.pill)) {
            fail(`the insecure pill must keep the http:// prefix; saw ${JSON.stringify(plainBox.pill)}`);
        }
    }
    // --- mixed: warning icon on the pushed mixed-passive state.
    const mixedId = await openWebTab(app, pages.tlsUrl('/mixed'));
    if (await waitForPush(app, p => p && p.kind === 'state' && p.tabId === mixedId && String(p.url ?? '').endsWith('/mixed') && p.loading === false) < 0) {
        return fail(`${BROKEN} no loaded state push arrived for /mixed`);
    }
    if (await makeCurrent(app, mixedId) !== true) {
        return fail(`${BROKEN} the mixed web tab could not be made current`);
    }
    const mixedPush = await lastPush(app, mixedId);
    if (!mixedPush) {
        return fail(`${BROKEN} no state push for the mixed tab to compare the box against`);
    }
    if (mixedPush.securityState !== 'mixed-passive') {
        fail(`the mixed tab pushed ${JSON.stringify(mixedPush.securityState)}, want "mixed-passive" (url ${JSON.stringify(mixedPush.url)})`);
    }
    const mixedBox = await readIdentity(app);
    if (!mixedBox.present) {
        fail('no .pb-identity element with the mixed web tab current');
    } else if (mixedBox.icon === null || !String(mixedBox.icon).split(' ').includes('codicon-warning') || !String(mixedBox.icon).split(' ').includes('is-warning')) {
        fail(`the mixed pill must render the warning icon in the warning colour (codicon-warning is-warning); saw icon ${JSON.stringify(mixedBox.icon)}`);
    }
    // --- spoof: typing https text on the plain tab moves neither icon nor text.
    if (await makeCurrent(app, plainId) !== true) {
        return fail(`${BROKEN} the plain web tab could not be made current for the spoof step`);
    }
    const before = await readIdentity(app);
    const spoofed = await app.evaluate(`JSON.stringify((() => {
        const input = document.querySelector('.pb-chrome-bar-input');
        if (!input) return { ok: false };
        input.focus();
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'https://evil.example');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return { ok: true, value: input.value };
    })())`).then(JSON.parse);
    if (!spoofed.ok || spoofed.value !== 'https://evil.example') {
        return fail(`${BROKEN} the pill could not be typed into (${JSON.stringify(spoofed)})`);
    }
    await new Promise(resolve => setTimeout(resolve, 500));
    const after = await readIdentity(app);
    if (!after.present) {
        fail('the identity box vanished after typing in the pill');
    } else if (after.icon !== before.icon || after.insecure !== before.insecure) {
        fail(`lock derived from typed text: typing https://evil.example moved the box from icon ${JSON.stringify(before.icon)} text ${JSON.stringify(before.insecure)} to icon ${JSON.stringify(after.icon)} text ${JSON.stringify(after.insecure)}`);
    }
    // --- IDN: the mixed-script host in localDomains resolves to loopback
    // and its pushed displaySpec is the url.domainToASCII punycode.
    const idnAscii = domainToASCII('pаypal-fixture.test');
    const idnId = await openWebTab(app, `http://${idnAscii}:${pages.port}/plain`);
    if (await waitForPush(app, p => p && p.kind === 'state' && p.tabId === idnId && String(p.url ?? '').includes('/plain') && p.loading === false) < 0) {
        return fail(`${BROKEN} no loaded state push arrived for the IDN tab`);
    }
    const idnPush = await lastPush(app, idnId);
    if (!idnPush) {
        return fail(`${BROKEN} no state push for the IDN tab to compare against`);
    }
    if (idnPush.displaySpec !== idnAscii) {
        fail(`the IDN tab pushed displaySpec ${JSON.stringify(idnPush.displaySpec)}, want the punycode ${JSON.stringify(idnAscii)}`);
    }
    if (await makeCurrent(app, idnId) !== true) {
        return fail(`${BROKEN} the IDN web tab could not be made current`);
    }
    const idnBox = await readIdentity(app);
    if (!idnBox.present || idnBox.host !== idnAscii) {
        fail(`the IDN pill must render the punycode host ${JSON.stringify(idnAscii)}; saw ${JSON.stringify(idnBox)}`);
    }
}

async function identityLocal(ctx) {
    const { app, pages, fail } = ctx;
    const tabId = await openWebTab(app, pages.url('/plain'));
    if (await waitForPush(app, p => p && p.kind === 'state' && p.tabId === tabId && String(p.url ?? '').endsWith('/plain') && p.loading === false) < 0) {
        return fail(`${BROKEN} no loaded state push arrived for /plain`);
    }
    if (await makeCurrent(app, tabId) !== true) {
        return fail(`${BROKEN} the served-origin web tab could not be made current`);
    }
    const pushed = await lastPush(app, tabId);
    if (!pushed) {
        return fail(`${BROKEN} no state push for the served-origin tab to compare the box against`);
    }
    if (pushed.securityState !== 'local') {
        fail(`the served-origin tab pushed ${JSON.stringify(pushed.securityState)}, want "local" (url ${JSON.stringify(pushed.url)})`);
    }
    const box = await readIdentity(app);
    if (!box.present) {
        fail('no .pb-identity element with a served-origin web tab current');
    } else if (box.icon !== null) {
        fail(`the local pill must render no icon; saw icon ${JSON.stringify(box.icon)}`);
    }
    // An editor tab shows no identity box at all.
    const editor = await probe(app, `await get('CommandRegistry').executeCommand('workbench.action.files.newUntitledFile');
        return !!get('EditorManager').currentEditor;`);
    if (editor !== true) {
        return fail(`${BROKEN} no untitled editor could be opened`);
    }
    await new Promise(resolve => setTimeout(resolve, 500));
    const onEditor = await readIdentity(app);
    if (onEditor.present) {
        fail(`an editor tab shows a .pb-identity element (host ${JSON.stringify(onEditor.host)}); editor tabs show nothing`);
    }
    await probe(app, `get('EditorManager').currentEditor?.close(); return true;`).catch(() => null);
}

/** The panel's whole read, as text: rows (id, state, label, state word), copy rows, the connection line. */
const PANEL_READ = `JSON.stringify((() => {
    const panel = document.querySelector('.pb-site-panel');
    if (!panel) return { present: false, rows: [], cert: [] };
    return {
        present: true,
        rows: [...panel.querySelectorAll('.pb-site-panel-row[data-permission]')].map(r => ({
            id: r.getAttribute('data-permission'),
            state: r.getAttribute('data-state'),
            stored: r.getAttribute('data-stored'),
            label: r.querySelector('.pb-site-panel-row-label')?.textContent ?? null,
            word: r.querySelector('.pb-site-panel-row-state')?.textContent ?? null,
        })),
        empty: panel.querySelector('.pb-site-panel-empty')?.textContent ?? null,
        noPerms: panel.querySelector('.pb-site-panel-empty-row')?.textContent ?? null,
        cert: [...panel.querySelectorAll('.pb-site-panel-cert-row')].map(c => c.textContent),
        connection: panel.querySelector('.pb-site-panel-connection')?.textContent ?? null,
    };
})())`;

/** The identity box's permission icons and the +n overflow text, from the live DOM. */
const ICON_READ = `JSON.stringify((() => {
    const box = document.querySelector('.pb-identity');
    if (!box) return { present: false, icons: [], overflow: null };
    return {
        present: true,
        icons: [...box.querySelectorAll('.pb-identity-perm')].map(i => [...i.classList].find(c => c.startsWith('codicon-') && c !== 'codicon') ?? null),
        overflow: box.querySelector('.pb-identity-overflow')?.textContent ?? null,
    };
})())`;

const panelRead = app => app.evaluate(PANEL_READ).then(JSON.parse);
const iconRead = app => app.evaluate(ICON_READ).then(JSON.parse);
const openPanel = app => app.evaluate(`(() => { const b = document.querySelector('.pb-identity'); if (!b) return false; b.click(); return true; })()`);
const closePanel = app => app.evaluate(`(() => { const c = document.querySelector('.pb-site-panel .pb-site-panel-close'); if (!c) return false; c.click(); return true; })()`);
const clickRow = (app, id) => app.evaluate(`(() => { const r = document.querySelector('.pb-site-panel [data-permission="${id}"]'); if (!r) return false; r.click(); return true; })()`);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Polls `read` until `pred` holds or the timeout ends; returns the last read either way. */
/**
 * CR-01 (upstream browser-siteIdentity.js:827, 878, 939-946): a page the user
 * loaded past a certificate error is STATE_IS_SECURE with
 * STATE_CERT_USER_OVERRIDDEN, and must not push `secure`. This session does not
 * trust the fixture CA (UNTRUSTED_TLS), so the leaf is an untrusted certificate;
 * the override is added in the probe profile only, through nsICertOverrideService.
 */
async function identityOverride(ctx) {
    const { app, pages, fail } = ctx;
    const pemPath = join(REPO_ROOT, 'scripts/fixtures/tls/pb-fixture.pem');
    const leafB64 = readFileSync(pemPath, 'utf8').split('-----END CERTIFICATE-----')[0]
        .split('-----BEGIN CERTIFICATE-----')[1].replace(/\s+/g, '');
    const url = new URL(pages.tlsUrl('/secure'));
    const added = await inChrome(app, `const C = globalThis.Cc ?? Components.classes;
        const I = globalThis.Ci ?? Components.interfaces;
        const cert = C['@mozilla.org/security/x509certdb;1'].getService(I.nsIX509CertDB).constructX509FromBase64(${JSON.stringify(leafB64)});
        C['@mozilla.org/security/certoverride;1'].getService(I.nsICertOverrideService)
            .rememberValidityOverride(${JSON.stringify(url.hostname)}, ${Number(url.port)}, {}, cert, false);
        return true;`);
    if (added !== true) {
        return fail(`${BROKEN} the certificate override could not be added in the probe profile`);
    }
    const id = await openWebTab(app, pages.tlsUrl('/secure'));
    const push = await waitForPush(app, p => p && p.kind === 'state' && p.tabId === id && String(p.url ?? '').endsWith('/secure') && p.loading === false);
    if (push < 0) {
        return fail(`${BROKEN} no loaded state push arrived for the overridden /secure page`);
    }
    const pushed = (await pushes(app))[push];
    if (pushed.securityState === 'secure') {
        fail('a user-overridden certificate pushed "secure" (CR-01: the lock would say the connection is verified)');
    } else if (pushed.securityState !== 'broken') {
        fail(`the overridden page pushed ${JSON.stringify(pushed.securityState)}, want "broken" (the warning bucket)`);
    }
    if (await makeCurrent(app, id) !== true) {
        return fail(`${BROKEN} the overridden web tab could not be made current`);
    }
    const box = await readIdentity(app);
    if (!box.present) {
        return fail('no .pb-identity element with the overridden web tab current');
    }
    if (!String(box.icon ?? '').split(' ').includes('codicon-warning')) {
        fail(`the overridden pill must render the warning icon; saw icon ${JSON.stringify(box.icon)}`);
    }
}

async function waitFor(read, pred, timeoutMs = 8000) {
    const end = Date.now() + timeoutMs;
    let last = await read();
    while (!pred(last) && Date.now() < end) {
        await sleep(150);
        last = await read();
    }
    return last;
}

const rowOf = (panel, id) => panel.rows.find(row => row.id === id);

/** Opens the panel and waits until chrome's reply has filled its rows (a click before that reads no row). */
async function openPanelReady(app, count) {
    await openPanel(app);
    return waitFor(() => panelRead(app), p => p.present && p.rows.length === count);
}

/**
 * The autoplay-media effective default, read from media.autoplay.default in
 * chrome (never assumed). Mapped the way upstream's getDefault maps the pref
 * (SitePermissions.sys.mjs:863-884): ALLOWED -> allow, BLOCKED_ALL -> block-all,
 * anything else -> block-audible. The pref values come from nsIAutoplay.idl
 * (upstream/dom/media/autoplay/nsIAutoplay.idl:13-15), parsed at check time.
 */
async function autoplayDefault(app) {
    const idl = readFileSync(join(REPO_ROOT, 'upstream/dom/media/autoplay/nsIAutoplay.idl'), 'utf8');
    const consts = Object.fromEntries([...idl.matchAll(/const uint32_t (\w+) = (\d+);/g)].map(m => [m[1], Number(m[2])]));
    if (!Number.isInteger(consts.ALLOWED) || !Number.isInteger(consts.BLOCKED_ALL)) {
        throw new Error(`${BROKEN} nsIAutoplay.idl defines no ALLOWED/BLOCKED_ALL -- broken instrument`);
    }
    const pref = await inChrome(app, `return Services.prefs.getIntPref('media.autoplay.default', 1);`);
    if (!Number.isInteger(pref)) {
        throw new Error(`${BROKEN} media.autoplay.default did not read as an integer in chrome: ${JSON.stringify(pref)}`);
    }
    const name = pref === consts.ALLOWED ? 'allow' : pref === consts.BLOCKED_ALL ? 'block-all' : 'block-audible';
    return { pref, name };
}

/** The managed IDs in table order, from the tree's table (never a copy here). */
async function tableIds() {
    const table = await import(pathToFileURL(join(REPO_ROOT, TABLE_REL)).href);
    return { ids: [...table.PERMISSION_IDS], autoplay: [...table.AUTOPLAY_PERMISSION_STATES] };
}

/**
 * Plan 02 (SITE-04..06): the site panel on a served https page. Covers the
 * certificate block, six tri-state rows in table order with persistence across
 * a reopen, the autoplay four-state cycle, the identity-box icons, and the
 * origin race: the panel shows origin A, the tab navigates to B, and the write
 * is refused, so nothing lands on B.
 */
async function sitePanel(ctx) {
    const { app, pages, plant, fail, note } = ctx;
    const { ids, autoplay } = await tableIds();
    const secureId = await openWebTab(app, pages.tlsUrl('/secure'));
    if (await waitForPush(app, loadedAt(secureId, '/secure')) < 0) {
        return fail(`${BROKEN} no loaded state push arrived for /secure`);
    }
    if (await makeCurrent(app, secureId) !== true) {
        return fail(`${BROKEN} the secure web tab could not be made current`);
    }
    const securePush = await lastPush(app, secureId);
    if (!securePush || securePush.securityState !== 'secure') {
        return fail(`${BROKEN} the secure tab pushed ${JSON.stringify(securePush?.securityState)}, want "secure"`);
    }
    // Plants: applied to the live tab's prototype, so the panel's own calls take them.
    if (plant === 'perm-refused' || plant === 'icons-stale') {
        const body = plant === 'perm-refused'
            ? "proto.setPermission = async function () { return { ok: false, reason: 'validation' }; };"
            : 'proto.refreshPermissionIcons = function () {};';
        const applied = await probe(app, `const w = get('WebTabChannel').widgetOf(${JSON.stringify(secureId)});
            if (!w) return false;
            const proto = Object.getPrototypeOf(w);
            ${body}
            return true;`);
        if (applied === true) {
            note(`PLANT ${plant} applied`);
        }
    }
    // --- open: connection, certificate, six rows in table order, all default (the empty row).
    if (!await openPanel(app)) {
        return fail(`${BROKEN} the identity box could not be clicked`);
    }
    const opened = await waitFor(() => panelRead(app), p => p.present && p.rows.length === ids.length);
    if (!opened.present || opened.rows.length !== ids.length) {
        return fail(`the site panel did not open with the managed rows; saw empty=${JSON.stringify(opened.empty)} rows=${opened.rows.length}`);
    }
    if (JSON.stringify(opened.rows.map(row => row.id)) !== JSON.stringify(ids)) {
        fail(`the permission rows are ${JSON.stringify(opened.rows.map(row => row.id))}, want the table order ${JSON.stringify(ids)}`);
    }
    if (opened.connection !== 'Connection secure') {
        fail(`the secure panel must read "Connection secure"; saw ${JSON.stringify(opened.connection)}`);
    }
    if (!opened.cert.some(text => text.startsWith('Issued to:')) || !opened.cert.some(text => text.startsWith('Issued by:'))) {
        fail(`the secure page's certificate block must show "Issued to:" and "Issued by:"; saw ${JSON.stringify(opened.cert)}`);
    }
    if (opened.noPerms !== 'No special permissions set for this site') {
        fail(`a site with no special permissions must show the empty row; saw ${JSON.stringify(opened.noPerms)}`);
    }
    // --- camera: default -> allow -> block -> default, each reply read back; allow persists across a reopen; icons follow.
    const cameraCycle = [['allow', 'Allowed'], ['block', 'Blocked'], ['default', 'Use default']];
    const refusedAt = async (label, panel) => fail(`the ${label} write was refused: the panel shows ${JSON.stringify(panel.empty)}`);
    for (const [want, word] of cameraCycle) {
        if (!await clickRow(app, 'camera')) {
            return fail(`${BROKEN} the camera row is not on screen`);
        }
        const panel = await waitFor(() => panelRead(app), p => p.present ? rowOf(p, 'camera')?.state === want : !!p.empty);
        if (panel.empty) {
            return refusedAt('camera', panel);
        }
        const row = rowOf(panel, 'camera');
        if (row?.state !== want || row?.word !== word) {
            return fail(`camera row did not reach "${want}" with the copy "${word}"; saw state ${JSON.stringify(row?.state)} copy ${JSON.stringify(row?.word)}`);
        }
        if (want === 'allow') {
            // Persistence: close, reopen, and the stored allow is read back from chrome.
            await closePanel(app);
            await openPanelReady(app, ids.length);
            const again = await waitFor(() => panelRead(app), p => p.present && rowOf(p, 'camera')?.state === 'allow');
            if (rowOf(again, 'camera')?.state !== 'allow') {
                fail(`camera "allow" did not persist across a reopen; saw ${JSON.stringify(rowOf(again, 'camera')?.state ?? again.empty)}`);
            }
            const icons = await iconRead(app);
            if (!icons.present || !icons.icons.includes('codicon-eye')) {
                fail(`icons did not update after the camera reply: ${JSON.stringify(icons)}`);
            }
        }
    }
    // --- autoplay-media (Firefox parity): the row shows the effective state, so an absent entry reads as the
    // pref's default; the cycle is stored-based (default -> allow -> block sounds -> block all -> default); the icon
    // shows only for a saved entry. Expected words and the default come from the pref, read in chrome.
    const COPY = { allow: 'Allowed', 'block-audible': 'Block sounds', 'block-all': 'Block all', default: 'Use default' };
    const auto = await autoplayDefault(app);
    if (JSON.stringify(autoplay) !== JSON.stringify(['default', 'allow', 'block-audible', 'block-all'])) {
        fail(`the autoplay cycle is ${JSON.stringify(autoplay)}, want Use default, Allow, Block sounds, Block all`);
    }
    const startRow = rowOf(opened, 'autoplay-media');
    if (startRow?.state !== auto.name || startRow?.stored !== 'default' || startRow?.word !== COPY[auto.name]) {
        fail(`with media.autoplay.default=${auto.pref} the autoplay row must read "${COPY[auto.name]}" with no saved entry; saw state ${JSON.stringify(startRow?.state)} stored ${JSON.stringify(startRow?.stored)} copy ${JSON.stringify(startRow?.word)}`);
    }
    // The default-equal state is never saved (SitePermissions.sys.mjs:575-580): stored is 'default' when the chosen name equals the pref's default.
    const storedFor = want => (want === 'default' || want === auto.name ? 'default' : want);
    for (const want of ['allow', 'block-audible', 'block-all', 'default']) {
        if (!await clickRow(app, 'autoplay-media')) {
            return fail(`${BROKEN} the autoplay-media row is not on screen`);
        }
        const effective = want === 'default' ? auto.name : want;
        const panel = await waitFor(() => panelRead(app), p => p.present ? rowOf(p, 'autoplay-media')?.stored === storedFor(want) && rowOf(p, 'autoplay-media')?.state === effective : !!p.empty);
        if (panel.empty) {
            return refusedAt('autoplay-media', panel);
        }
        const row = rowOf(panel, 'autoplay-media');
        if (row?.state !== effective || row?.stored !== storedFor(want) || row?.word !== COPY[effective]) {
            fail(`autoplay-media after "${want}" must read "${COPY[effective]}" (effective ${effective}, stored ${storedFor(want)}); saw state ${JSON.stringify(row?.state)} stored ${JSON.stringify(row?.stored)} copy ${JSON.stringify(row?.word)}`);
        }
        const icon = await waitFor(() => iconRead(app), i => i.icons.includes('codicon-play') === (storedFor(want) !== 'default'));
        if (icon.icons.includes('codicon-play') !== (storedFor(want) !== 'default')) {
            fail(`the autoplay icon after "${want}" must be ${storedFor(want) !== 'default' ? 'present' : 'absent'} (saved entry ${storedFor(want)}); saw ${JSON.stringify(icon)}`);
        }
    }
    // --- the origin race (review fix): the panel shows origin A; the tab moves to origin B; the write must be refused.
    const plainUrl = `http://pb-fixture.test:${pages.port}/plain`;
    // Origin A is on screen with camera at default; the panel keeps showing A's rows through the navigation.
    const shownA = await waitFor(() => panelRead(app), p => p.present && rowOf(p, 'camera')?.state === 'default');
    if (!shownA.present || rowOf(shownA, 'camera')?.state !== 'default') {
        return fail(`${BROKEN} the panel for origin A did not show camera at default before the origin race`);
    }
    const moved = await probe(app, `const w = get('WebTabChannel').widgetOf(${JSON.stringify(secureId)});
        const reply = await w.navigate(${JSON.stringify(plainUrl)});
        return reply && reply.ok === true;`);
    if (moved !== true) {
        return fail(`${BROKEN} the tab could not navigate to the second origin`);
    }
    if (await waitForPush(app, loadedAt(secureId, '/plain')) < 0) {
        return fail(`${BROKEN} no loaded state push arrived for /plain after the navigation`);
    }
    if (!await clickRow(app, 'camera')) {
        return fail(`${BROKEN} the camera row is not on screen after the navigation`);
    }
    const afterWrite = await waitFor(() => panelRead(app), p => !!p.empty, 6000);
    if (!afterWrite.empty) {
        fail(`the write for the origin the panel showed was not refused after the tab moved; the panel shows ${JSON.stringify(afterWrite.present ? rowOf(afterWrite, 'camera')?.state : afterWrite)}`);
    }
    // Reopen on the new origin: camera must be default there (nothing landed on B), no certificate on http, Not Secure.
    await closePanel(app);
    if (!await openPanel(app)) {
        return fail(`${BROKEN} the identity box could not be clicked after the navigation`);
    }
    const onB = await waitFor(() => panelRead(app), p => p.present && p.rows.length === ids.length);
    if (!onB.present) {
        return fail(`${BROKEN} the panel did not reopen on the new origin; saw ${JSON.stringify(onB.empty)}`);
    }
    if (rowOf(onB, 'camera')?.state !== 'default') {
        fail(`the camera permission landed on the new origin after the tab moved: state ${JSON.stringify(rowOf(onB, 'camera')?.state)}`);
    }
    if (onB.connection !== 'Connection not secure') {
        fail(`the http origin must read "Connection not secure"; saw ${JSON.stringify(onB.connection)}`);
    }
    if (onB.cert.length !== 0) {
        fail(`a page without a secure connection must show no certificate block; saw ${JSON.stringify(onB.cert)}`);
    }
    // --- icons on the new origin: four non-default -> three icons and +1; back to default -> none.
    for (const id of ['camera', 'microphone', 'geo', 'desktop-notification']) {
        if (!await clickRow(app, id)) {
            return fail(`${BROKEN} the ${id} row is not on screen`);
        }
        const got = await waitFor(() => panelRead(app), p => p.present && rowOf(p, id)?.state === 'allow');
        if (rowOf(got, id)?.state !== 'allow') {
            return fail(`${id} did not reach "allow" for the icon check; saw ${JSON.stringify(rowOf(got, id)?.state ?? got.empty)}`);
        }
    }
    await closePanel(app);
    const threeIcons = await waitFor(() => iconRead(app), i => i.icons.length === 3);
    if (threeIcons.icons.length !== 3 || threeIcons.overflow !== '+1') {
        fail(`four non-default permissions must show three icons and +1; saw ${JSON.stringify(threeIcons)}`);
    }
    await openPanelReady(app, ids.length);
    for (const id of ['camera', 'microphone', 'geo', 'desktop-notification']) {
        // allow -> block -> default: each click waits for chrome's reply before the next, so no click reads a stale state.
        for (let step = 0; step < 2; step++) {
            const before = rowOf(await panelRead(app), id)?.state;
            await clickRow(app, id);
            await waitFor(() => panelRead(app), p => p.present && rowOf(p, id)?.state !== before);
        }
        const reset = await waitFor(() => panelRead(app), p => p.present && rowOf(p, id)?.state === 'default');
        if (rowOf(reset, id)?.state !== 'default') {
            fail(`${id} did not return to "default" for the icon reset; saw ${JSON.stringify(rowOf(reset, id)?.state ?? reset.empty)}`);
        }
    }
    await closePanel(app);
    const none = await waitFor(() => iconRead(app), i => i.icons.length === 0);
    if (none.icons.length !== 0 || none.overflow !== null) {
        fail(`with every permission at default the identity box must show no icons; saw ${JSON.stringify(none)}`);
    }
}


/** Plan 03 (SITE-07): the token cookie's name, read from the boundary's literal at check time (never copied here). */
function tokenCookieName() {
    const src = readFileSync(join(REPO_ROOT, 'powerbrowser/shell/PowerBrowserAPI.sys.mjs'), 'utf8');
    const name = /\nconst TOKEN_COOKIE_NAME = "([^"]+)";/.exec(src)?.[1];
    if (!name) {
        throw new Error(`${BROKEN} PowerBrowserAPI.sys.mjs declares no TOKEN_COOKIE_NAME literal -- broken instrument`);
    }
    return name;
}

/** Cookie names the jar holds for a host (chrome-scope read; no value is read). */
// The names come back joined: the chrome read wraps an array of strings in remote values, which is not a list here.
const cookieNamesFor = async (app, host) => {
    const raw = await inChrome(app, `return Services.cookies.getCookiesFromHost(${JSON.stringify(host)}, {}).map(c => c.name).join('\\n');`);
    if (typeof raw !== 'string') {
        throw new Error(`${BROKEN} the cookie read for ${host} returned ${JSON.stringify(raw)}, not names`);
    }
    return raw.split('\n').filter(Boolean);
};
/** Removes every cookie of one name for a host; returns how many went. */
const removeCookiesNamed = (app, host, name) => inChrome(app, `let n = 0;
    for (const c of Services.cookies.getCookiesFromHost(${JSON.stringify(host)}, {})) {
        if (c.name === ${JSON.stringify(name)}) { Services.cookies.remove(c.host, c.name, c.path, c.originAttributes); n++; }
    }
    return n;`);
/** The status of a same-origin request from the Theia frame: 200 only while the frame is signed in. */
const frameStatus = app => probe(app, `const r = await fetch(location.href, { cache: 'no-store', credentials: 'same-origin' }); return r.status;`);
/** Whether chrome's per-site exception holds for one overlay; null when the overlay is gone (never a pass). */
const exceptionOn = (app, tabId) => inChrome(app, `const b = overlayOf(${JSON.stringify(tabId)});
    if (!b) return null;
    return ChromeUtils.importESModule('resource://gre/modules/ContentBlockingAllowList.sys.mjs').ContentBlockingAllowList.includes(b);`);
/** Chrome's per-site exception write for one overlay (the leak plant's fault injection). */
const exceptionAdd = (app, tabId) => inChrome(app, `const b = overlayOf(${JSON.stringify(tabId)});
    if (!b) return null;
    ChromeUtils.importESModule('resource://gre/modules/ContentBlockingAllowList.sys.mjs').ContentBlockingAllowList.add(b);
    return true;`);

/** The shield rows of the open panel, read from the live DOM. */
const SHIELD_READ = `JSON.stringify((() => {
    const panel = document.querySelector('.pb-site-panel');
    if (!panel) return { present: false };
    const count = panel.querySelector('.pb-site-panel-shield-count');
    const toggle = panel.querySelector('[data-action="shield-toggle"]');
    return {
        present: true,
        count: count?.textContent ?? null,
        excepted: count?.getAttribute('data-shield-excepted') ?? null,
        toggle: toggle?.querySelector('.pb-site-panel-row-label')?.textContent ?? null,
    };
})())`;
const shieldRead = app => app.evaluate(SHIELD_READ).then(JSON.parse);
const shieldIconOn = app => app.evaluate(`!!document.querySelector('.pb-identity .pb-identity-shield')`);
const clickShieldToggle = app => app.evaluate(`(() => { const t = document.querySelector('.pb-site-panel [data-action="shield-toggle"]'); if (!t) return false; t.click(); return true; })()`);
const clickClearRow = app => app.evaluate(`(() => { const r = document.querySelector('.pb-site-panel [data-action="clear-site-data"]'); if (!r) return false; r.click(); return true; })()`);
/** Clicks the dialog's Clear button; the dialog is Theia's ConfirmDialog. */
const confirmClear = app => app.evaluate(`(() => {
    const dialog = document.querySelector('.dialogBlock');
    if (!dialog) return 'no-dialog';
    const button = [...dialog.querySelectorAll('button')].find(b => b.textContent.trim() === 'Clear');
    if (!button) return 'no-button';
    button.click();
    return 'clicked';
})()`);

/** Chrome's SiteDataManager.hasSiteData for a host, as 'true' | 'false' | 'error' (async, read back in a second call). */
async function hasDataFor(app, host) {
    await inChrome(app, `window.__pbHasData = 'pending';
        ChromeUtils.importESModule('resource:///modules/SiteDataManager.sys.mjs').SiteDataManager.hasSiteData(${JSON.stringify(host)})
            .then(v => { window.__pbHasData = v === true ? 'true' : 'false'; }, () => { window.__pbHasData = 'error'; });
        return true;`);
    return waitFor(() => inChrome(app, `return window.__pbHasData;`), v => v === 'true' || v === 'false' || v === 'error', 8000);
}

/** Opens the panel from the identity box and clicks its clear row, then confirms; returns the step that stopped, or 'done'. */
async function clearFromPanel(app) {
    if (!await openPanel(app)) {
        return 'the identity box could not be clicked';
    }
    const row = await waitFor(() => app.evaluate(`!!document.querySelector('.pb-site-panel [data-action="clear-site-data"]')`), v => v === true);
    if (row !== true) {
        return 'the clear-data row is not in the panel';
    }
    await clickClearRow(app);
    const dialog = await waitFor(() => app.evaluate(`!!document.querySelector('.dialogBlock')`), v => v === true);
    if (dialog !== true) {
        return 'the clear confirm did not open';
    }
    const clicked = await confirmClear(app);
    return clicked === 'clicked' ? 'done' : `the confirm button was not found (${clicked})`;
}

/**
 * Plan 03 (SITE-07, D-31-12): the clear-data row on a served 127.0.0.1 tab and a
 * localhost tab. The marker cookie goes; the token cookie stays; the frame stays
 * signed in (a same-origin request still returns 200). Plant `clear-signout`
 * removes the token just before the clear, the fault a clear without the
 * exemption would cause; the check must go red naming "signed out".
 */
async function clearData(ctx) {
    const { app, pages, plant, fail, note } = ctx;
    const token = tokenCookieName();
    const MARK = 'pb-clear-marker';
    const loopId = await openWebTab(app, pages.url('/seed'));
    if (await waitForPush(app, loadedAt(loopId, '/seed')) < 0) {
        return fail(`${BROKEN} no loaded state push arrived for the 127.0.0.1 page`);
    }
    if (await makeCurrent(app, loopId) !== true) {
        return fail(`${BROKEN} the 127.0.0.1 web tab could not be made current`);
    }
    // Positive controls: the token is in the jar and the page's marker is there, before the clear.
    if (!(await cookieNamesFor(app, '127.0.0.1')).includes(token)) {
        return fail(`${BROKEN} the token cookie is not in the jar before the clear, so nothing proves the exemption`);
    }
    if (!(await cookieNamesFor(app, '127.0.0.1')).includes(MARK)) {
        return fail(`${BROKEN} the page's marker cookie is not in the jar before the clear (the page did not set it)`);
    }
    if (plant === 'clear-signout') {
        const removed = await removeCookiesNamed(app, '127.0.0.1', token);
        note(`PLANT clear-signout applied (token cookies removed before the clear: ${removed})`);
    }
    const step = await clearFromPanel(app);
    if (step !== 'done') {
        return fail(`${BROKEN} ${step}`);
    }
    const marked = await waitFor(() => cookieNamesFor(app, '127.0.0.1'), names => !names.includes(MARK), 8000);
    if (marked.includes(MARK)) {
        fail('the clear left the planted marker cookie on 127.0.0.1: the site data was not cleared');
    }
    if (!(await cookieNamesFor(app, '127.0.0.1')).includes(token)) {
        fail('the IDE session was signed out by the clear: the token cookie is gone');
    }
    const status = await frameStatus(app);
    if (status !== 200) {
        fail(`the IDE session was signed out by the clear: a same-origin frame request returned ${JSON.stringify(status)}, want 200`);
    }
    // localhost: no token cookie on that host; the marker goes and the frame stays signed in.
    const localId = await openWebTab(app, `http://localhost:${pages.port}/seed`);
    if (await waitForPush(app, loadedAt(localId, '/seed')) < 0) {
        return fail(`${BROKEN} no loaded state push arrived for the localhost page`);
    }
    if (await makeCurrent(app, localId) !== true) {
        return fail(`${BROKEN} the localhost web tab could not be made current`);
    }
    if (!(await cookieNamesFor(app, 'localhost')).includes(MARK)) {
        return fail(`${BROKEN} the page's marker cookie is not in the jar for localhost before the clear`);
    }
    if (await hasDataFor(app, 'localhost') !== 'true') {
        return fail(`${BROKEN} localhost reports no site data before the clear (the marker is there), so hasData after it proves nothing`);
    }
    const stepLocal = await clearFromPanel(app);
    if (stepLocal !== 'done') {
        return fail(`${BROKEN} on localhost: ${stepLocal}`);
    }
    const localMarked = await waitFor(() => cookieNamesFor(app, 'localhost'), names => !names.includes(MARK), 8000);
    if (localMarked.includes(MARK)) {
        fail('the clear left the planted marker cookie on localhost: the site data was not cleared');
    }
    if (!(await cookieNamesFor(app, '127.0.0.1')).includes(token)) {
        fail('the IDE session was signed out by the clear on localhost: the token cookie is gone');
    }
    const localStatus = await frameStatus(app);
    if (localStatus !== 200) {
        fail(`the IDE session was signed out by the clear on localhost: a same-origin frame request returned ${JSON.stringify(localStatus)}, want 200`);
    }
    // hasData after the localhost clear: chrome's own probe for that host (the reply's value is not on screen).
    const hasData = await hasDataFor(app, 'localhost');
    if (hasData !== 'false') {
        fail(`the localhost site still reports site data after the clear (${JSON.stringify(hasData)}, want "false")`);
    }
    await closePanel(app).catch(() => null);
}

/** A blocked-tracker count line: the one-tracker copy or the many-trackers copy. */
const BLOCKED_COUNT = /^(1 tracker blocked|\d+ trackers blocked)$/;

/**
 * Reopens the panel until a fresh read satisfies `pred` (each open is a new
 * site-info read, so the count follows the reloaded page); returns the last read.
 */
async function reopenUntil(app, pred, timeoutMs = 10000) {
    const end = Date.now() + timeoutMs;
    let read = null;
    for (;;) {
        await closePanel(app);
        await openPanel(app);
        read = await waitFor(() => shieldRead(app), r => r.present && r.count !== null, 6000);
        if (pred(read) || Date.now() > end) {
            return read;
        }
        await sleep(300);
    }
}

/**
 * Plan 03 (SITE-08, D-31-06): the shield on a tracker page (the bundled
 * classifier blocks trackertest.org, so its count is real). Off then on, for
 * this site only: the count line, the toggle, the chrome-side exception and the
 * identity-box shield follow each change; a second site's exception stays off.
 * Plant `shield-stale` removes the box shield's render, so the icon cannot show
 * the change (red "shield icon did not update"); plant `shield-leak` puts the
 * exception on the second site (red "wrong site").
 */
async function shield(ctx) {
    const { app, pages, plant, fail, note } = ctx;
    const trackId = await openWebTab(app, pages.url('/tracker'));
    if (await waitForPush(app, loadedAt(trackId, '/tracker')) < 0) {
        return fail(`${BROKEN} no loaded state push arrived for the tracker page`);
    }
    if (await makeCurrent(app, trackId) !== true) {
        return fail(`${BROKEN} the tracker web tab could not be made current`);
    }
    const seen = await waitFor(() => lastPush(app, trackId), p => !!p && p.blockedTrackers >= 1, 8000);
    if (!seen || !(seen.blockedTrackers >= 1)) {
        return fail(`${BROKEN} the tracker page reported blockedTrackers ${JSON.stringify(seen?.blockedTrackers ?? null)}; the bundled classifier did not block its tracker host`);
    }
    const secondId = await openWebTab(app, `http://localhost:${pages.port}/plain`);
    if (await waitForPush(app, loadedAt(secondId, '/plain')) < 0) {
        return fail(`${BROKEN} no loaded state push arrived for the second site`);
    }
    if (await makeCurrent(app, trackId) !== true) {
        return fail(`${BROKEN} the tracker web tab could not be made current again`);
    }
    if (await exceptionOn(app, trackId) !== false || await exceptionOn(app, secondId) !== false) {
        return fail(`${BROKEN} an exception was already set before the first toggle (the profile is not clean)`);
    }
    if (plant === 'shield-stale') {
        const applied = await probe(app, `const ab = get('AddressBar'); if (!ab) return false;
            Object.getPrototypeOf(ab).renderShieldIcon = function () { return undefined; };
            return true;`);
        if (applied === true) {
            note('PLANT shield-stale applied (the box shield is never rendered)');
        }
    }
    // Opening the panel: the count line shows the blocked count, and the toggle offers "off".
    if (!await openPanel(app)) {
        return fail(`${BROKEN} the identity box could not be clicked`);
    }
    const onCount = await waitFor(() => shieldRead(app), r => r.present && r.count !== null && BLOCKED_COUNT.test(r.count));
    if (!BLOCKED_COUNT.test(onCount.count ?? '')) {
        fail(`the protected tracker page must show its blocked count; saw ${JSON.stringify(onCount.count)}`);
    }
    if (onCount.toggle !== 'Turn off protection for this site') {
        fail(`the blocked page's toggle must read "Turn off protection for this site"; saw ${JSON.stringify(onCount.toggle)}`);
    }
    // Off: an applied change closes the panel (the tab reloads); the box shield follows the reply.
    if (!await clickShieldToggle(app)) {
        return fail(`${BROKEN} the shield toggle is not in the panel`);
    }
    const closedOff = await waitFor(() => app.evaluate(`!!document.querySelector('.pb-site-panel')`), v => v === false, 8000);
    if (closedOff !== false) {
        fail('the panel stayed open after the shield change; the tab reloads, so the panel must close (upstream closes its popup here)');
    }
    const icon = await waitFor(() => shieldIconOn(app), v => v === true, 8000);
    if (icon !== true) {
        fail('shield icon did not update after the toggle: the identity box shows no shield for the excepted site');
    }
    if (await exceptionOn(app, trackId) !== true) {
        fail('chrome does not hold the exception for the tracker page after the toggle');
    }
    if (plant === 'shield-leak') {
        const leaked = await exceptionAdd(app, secondId);
        note(`PLANT shield-leak applied (the second site's exception written: ${leaked})`);
    }
    if (await exceptionOn(app, secondId) !== false) {
        fail('wrong site: the second site has a tracking-protection exception after the tracker page was excepted');
    }
    // Reopened on the excepted page: the count line reads the excepted copy and the toggle offers "back on".
    const excepted = await reopenUntil(app, r => r.excepted === 'true');
    if (excepted.excepted !== 'true' || excepted.count !== 'Tracking protection is off for this site') {
        fail(`with protection off the count line must read "Tracking protection is off for this site"; saw ${JSON.stringify(excepted.count)} excepted ${JSON.stringify(excepted.excepted)}`);
    }
    if (excepted.toggle !== 'Turn protection back on') {
        fail(`with protection off the row must read "Turn protection back on"; saw ${JSON.stringify(excepted.toggle)}`);
    }
    // On again: the exception goes; the page reloads and counts its tracker again; the box shield goes.
    if (!await clickShieldToggle(app)) {
        return fail(`${BROKEN} the shield toggle is not in the panel on the second open`);
    }
    const closedOn = await waitFor(() => app.evaluate(`!!document.querySelector('.pb-site-panel')`), v => v === false, 8000);
    if (closedOn !== false) {
        fail('the panel stayed open after protection came back on; it must close with the reload');
    }
    const iconGone = await waitFor(() => shieldIconOn(app), v => v === false, 8000);
    if (iconGone !== false) {
        fail('the box shield stayed after protection came back on');
    }
    if (await exceptionOn(app, trackId) !== false) {
        fail('chrome still holds the exception for the tracker page after protection came back on');
    }
    const counted = await reopenUntil(app, r => BLOCKED_COUNT.test(r.count ?? ''));
    if (!BLOCKED_COUNT.test(counted.count ?? '')) {
        fail(`after protection came back on the blocked count must return; saw ${JSON.stringify(counted.count)} excepted ${JSON.stringify(counted.excepted)}`);
    }
    await closePanel(app);
    if (await exceptionOn(app, secondId) !== false) {
        fail('wrong site: the second site has a tracking-protection exception at the end of the run');
    }

}

// ---------------------------------------------------------------------------
// Plan 04 (MENU-01/02): the application menu. The rows, their order, their separator
// groups, their labels and their wiring are read from the tree (the table, app-menu.ts,
// the widget's label switch and CHROME_BAR_COPY); nothing here copies them.
// ---------------------------------------------------------------------------
const APP_MENU_REL = 'theia/extensions/chrome-bar/src/browser/site-identity/app-menu.ts';
const MENU_WIDGET_REL = 'theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx';
const COPY_REL = 'theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts';
const APP_MENU_MODES = ['Coding', 'Browsing', 'Organising'];
/** The stock page each stock row opens; the about: addresses are what the stock pages load. */
const STOCK_ROW_PAGES = [['Settings', 'about:preferences'], ['Passwords', 'about:logins'], ['Add-ons', 'about:addons'], ['Help', 'about:support']];

/** The raw copy template of a CHROME_BAR_COPY key (its interpolations left as ${...}). */
function copyTemplate(copySrc, key) {
    const plain = new RegExp(`^\\s*${key}: '([^']*)',`, 'm').exec(copySrc);
    if (plain) {
        return plain[1];
    }
    const template = new RegExp(`^\\s*${key}: \\([^)]*\\) => \`([^\`]*)\`,`, 'm').exec(copySrc);
    if (!template) {
        throw new Error(`${BROKEN} no CHROME_BAR_COPY entry for ${key} in ${COPY_REL}`);
    }
    return template[1];
}

/**
 * The menu this tree should show in this phase: the table rows of this phase in table
 * order, each with its label (the widget's switch names the copy key, the configured name
 * fills {App}) and whether it is unwired (then captioned Coming soon). The separator count
 * is the number of groups less one.
 */
async function expectedAppMenu(app) {
    const copy = readFileSync(join(REPO_ROOT, COPY_REL), 'utf8');
    const widget = readFileSync(join(REPO_ROOT, MENU_WIDGET_REL), 'utf8');
    const fn = /function appMenuLabel\([^)]*\)[^{]*\{([\s\S]*?)\n\}/.exec(widget)?.[1];
    if (!fn) {
        throw new Error(`${BROKEN} no appMenuLabel switch in ${MENU_WIDGET_REL}`);
    }
    const keys = new Map([...fn.matchAll(/case '([a-z-]+)': return CHROME_BAR_COPY\.([A-Za-z]+)/g)].map(x => [x[1], x[2]]));
    const subject = await app.evaluate(appNameExpr);
    if (typeof subject !== 'string' || !subject) {
        throw new Error(`${BROKEN} the configured application name is not readable, so the labels prove nothing`);
    }
    const table = await import(pathToFileURL(join(REPO_ROOT, TABLE_REL)).href);
    const menu = await import(pathToFileURL(join(REPO_ROOT, APP_MENU_REL)).href);
    const rows = table.MENU_ORDER.filter(entry => entry.minPhase <= table.MENU_PHASE);
    const labelOf = id => {
        const key = keys.get(id);
        if (!key) {
            throw new Error(`${BROKEN} no label for menu row ${id}`);
        }
        return copyTemplate(copy, key).replace(/\$\{[^}]+\}/g, subject);
    };
    const caption = copyTemplate(copy, 'comingSoonRow');
    const menuRows = rows.map(row => {
        const enabled = menu.WIRED_MENU_IDS.includes(row.menuId);
        const label = labelOf(row.menuId);
        return { id: row.menuId, group: row.group, label: enabled ? label : caption.replace(/\$\{label\}/g, label), disabled: !enabled };
    });
    // The drawn sequence: a separator wherever the group changes, none before the first row or after the last.
    const sequence = menuRows.flatMap((row, i) => (i > 0 && menuRows[i - 1].group !== row.group ? ['|', row.label] : [row.label]));
    return { rows: menuRows, sequence, separators: new Set(rows.map(row => row.group)).size - 1 };
}

/** The visible application menu (the last shown one: a closed menu may stay in the DOM). */
const VISIBLE_APP_MENU = `[...document.querySelectorAll('.lm-Menu.pb-app-menu')].filter(m => m.getClientRects().length > 0).pop()`;
/** The menu as drawn: its rows (label, disabled) and its label-less items (the separators). */
const readAppMenu = app => app.evaluate(`JSON.stringify((() => {
    const menu = ${VISIBLE_APP_MENU};
    if (!menu) return { present: false, rows: [], separators: 0 };
    const items = [...menu.querySelectorAll('.lm-Menu-item')];
    const text = i => (i.querySelector('.lm-Menu-itemLabel')?.textContent ?? '').trim();
    const rows = items.filter(i => text(i) !== '').map(i => ({ label: text(i), disabled: i.classList.contains('lm-mod-disabled') }));
    // A separator is an item with no label text; the sequence keeps both, in drawn order.
    const sequence = items.map(i => (text(i) === '' ? '|' : text(i)));
    return { present: true, rows, sequence, separators: items.length - rows.length };
})())`).then(JSON.parse);
const hamburgerOpen = app => app.evaluate(`(() => { const b = document.querySelector('.pb-chrome-bar button[aria-label="Application menu"]'); if (!b) return false; b.click(); return true; })()`);
const selectMode = (app, mode) => app.evaluate(`(() => { const b = [...document.querySelectorAll('.pb-chrome-bar-segment')].find(x => x.textContent.trim() === ${JSON.stringify(mode)}); if (!b) return false; b.click(); return true; })()`);
const modeActive = (app, mode) => app.evaluate(`(() => { const b = [...document.querySelectorAll('.pb-chrome-bar-segment')].find(x => x.textContent.trim() === ${JSON.stringify(mode)}); return !!b && b.getAttribute('aria-pressed') === 'true'; })()`);
/** Activates a row the way a pointer does: move, then mouse-up on the row. A disabled row ignores it. */
const clickMenuRow = (app, label) => app.evaluate(`(() => {
    const menu = ${VISIBLE_APP_MENU};
    const item = menu && [...menu.querySelectorAll('.lm-Menu-item')].find(i => i.querySelector('.lm-Menu-itemLabel')?.textContent.trim() === ${JSON.stringify(label)});
    if (!item) return 'no-row';
    const r = item.getBoundingClientRect();
    const at = { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    item.dispatchEvent(new MouseEvent('mousemove', at));
    item.dispatchEvent(new MouseEvent('mouseup', { ...at, button: 0 }));
    return 'clicked';
})()`);
const closeMenu = app => app.evaluate(`(() => {
    const menu = ${VISIBLE_APP_MENU};
    if (menu) menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
    return true;
})()`);
/** The stock windows, each as the addresses of its tabs (a chrome read of addresses only; no title or content). */
const stockWindows = app => inChrome(app, `const out = [];
    for (const w of Services.wm.getEnumerator('navigator:browser')) {
        if (w.gBrowser) out.push([...w.gBrowser.tabs].map(t => t.linkedBrowser.currentURI.spec));
    }
    return JSON.stringify(out);`).then(raw => JSON.parse(String(raw)));
/** Closes every stock window; true when none is left. The shell stays up (GUI-01). */
async function closeStockWindows(app) {
    await inChrome(app, `for (const w of [...Services.wm.getEnumerator('navigator:browser')]) { w.close(); } return true;`);
    const left = await waitFor(() => stockWindows(app), w => w.length === 0, 8000);
    return left.length === 0;
}

/**
 * Plan 04 (MENU-01/02), plan 05 (MENU-04): the hamburger in each mode, the rows and separators
 * against the tree, the four stock rows (one stock window, one tab on the page, the web tab
 * unchanged), and the Quit row enabled. Plant `menu-dead-stock` makes the store call resolve
 * without opening.
 */
async function appMenu(ctx) {
    const { app, pages, plant, fail, note } = ctx;
    const want = await expectedAppMenu(app);
    const webId = await openWebTab(app, pages.url('/plain'));
    if (await waitForPush(app, loadedAt(webId, '/plain')) < 0) {
        return fail(`${BROKEN} no loaded state push arrived for the web page`);
    }
    if (await makeCurrent(app, webId) !== true) {
        return fail(`${BROKEN} the web tab could not be made current`);
    }
    const pageUrl = (await lastPush(app, webId))?.url;
    if (typeof pageUrl !== 'string' || !pageUrl) {
        return fail(`${BROKEN} the web tab pushed no url, so the no-navigation check would prove nothing`);
    }
    if (plant === 'menu-dead-stock') {
        const applied = await probe(app, `const store = get('ChromeStoreClient'); if (!store) return false;
            Object.getPrototypeOf(store).openStockPage = async () => 'opened';
            return true;`);
        if (applied === true) {
            note('PLANT menu-dead-stock applied (openStockPage resolves without opening a page)');
        }
    }
    const wantLabels = want.rows.map(row => row.label);
    const wantDisabled = want.rows.map(row => row.disabled);
    // 1. The hamburger in every mode, and the rows, their disabled state and the separators.
    for (const mode of APP_MENU_MODES) {
        if (await selectMode(app, mode) !== true) {
            return fail(`${BROKEN} the ${mode} mode segment is not in the chrome bar`);
        }
        if (await waitFor(() => modeActive(app, mode), v => v === true, 6000) !== true) {
            fail(`the ${mode} mode did not become the pressed segment`);
        }
        if (await hamburgerOpen(app) !== true) {
            return fail(`${BROKEN} the application menu button is not in the ${mode} chrome bar`);
        }
        const menu = await waitFor(() => readAppMenu(app), r => r.present && r.rows.length > 0, 6000);
        if (!menu.present || menu.rows.length === 0) {
            fail(`the application menu did not open in ${mode}`);
            continue;
        }
        const labels = menu.rows.map(row => row.label);
        if (JSON.stringify(labels) !== JSON.stringify(wantLabels)) {
            fail(`the ${mode} menu rows are ${JSON.stringify(labels)}, want ${JSON.stringify(wantLabels)} (Firefox order, this phase's rows)`);
        }
        const disabled = menu.rows.map(row => row.disabled);
        if (JSON.stringify(disabled) !== JSON.stringify(wantDisabled)) {
            fail(`the ${mode} menu disabled rows are ${JSON.stringify(disabled)}, want ${JSON.stringify(wantDisabled)}`);
        }
        if (JSON.stringify(menu.sequence) !== JSON.stringify(want.sequence)) {
            fail(`the ${mode} menu draws ${JSON.stringify(menu.sequence)}, want ${JSON.stringify(want.sequence)} (a separator only between groups)`);
        }
        await closeMenu(app);
        await waitFor(() => app.evaluate(`!(${VISIBLE_APP_MENU})`), v => v === true, 3000);
    }
    // 2. Each stock row: no stock window before, then one stock window with one tab on the page.
    for (const [label, url] of STOCK_ROW_PAGES) {
        if (await closeStockWindows(app) !== true) {
            return fail(`${BROKEN} the stock windows could not be closed before the ${label} row`);
        }
        if (await hamburgerOpen(app) !== true) {
            return fail(`${BROKEN} the application menu button is not in the chrome bar (${label})`);
        }
        await waitFor(() => readAppMenu(app), r => r.present && r.rows.length > 0, 6000);
        if (await clickMenuRow(app, label) !== 'clicked') {
            return fail(`${BROKEN} the ${label} row is not in the open menu`);
        }
        const shown = await waitFor(() => stockWindows(app), w => w.some(tabs => tabs.includes(url)), 10000);
        if (!shown.some(tabs => tabs.includes(url))) {
            fail(`the ${label} row did not open its stock page (no stock window shows ${url})`);
            await closeMenu(app);
            continue;
        }
        if (shown.length !== 1) {
            fail(`the ${label} row opened ${shown.length} stock windows, want one`);
        }
        const onPage = shown.flat().filter(tab => tab === url).length;
        if (onPage !== 1) {
            fail(`the ${label} row left ${onPage} tabs on ${url}, want one`);
        }
        const after = (await lastPush(app, webId))?.url;
        if (after !== pageUrl) {
            fail(`the ${label} row navigated the web tab (${JSON.stringify(after)}, was ${JSON.stringify(pageUrl)})`);
        }
    }
    // 3. Quit is wired (plan 05): its row reads enabled. A click on it quits the application, so the
    //    click itself is checked alone in its own launch (quit-row); this scenario only reads the row.
    const quit = want.rows.find(row => row.id === 'quit');
    if (!quit) {
        return fail(`${BROKEN} the menu has no Quit row`);
    }
    if (await hamburgerOpen(app) !== true) {
        return fail(`${BROKEN} the application menu button is not in the chrome bar (Quit row)`);
    }
    const quitMenu = await waitFor(() => readAppMenu(app), r => r.present && r.rows.length > 0, 6000);
    const quitRow = quitMenu.rows.find(row => row.label === quit.label);
    if (!quitRow || quitRow.disabled !== false) {
        fail(`the ${quit.label} row is not read as enabled (${JSON.stringify(quitRow ?? null)})`);
    }
    await closeMenu(app);
}

// ---------------------------------------------------------------------------
// Plan 05 (MENU-04, D-31-13): quit. A quit ends the application, so each quit scenario runs alone
// in its own launch (its own session; see main and selfTest). The quit path's own mark is the quit
// flush: quit-application-granted writes the web-tab history file into the profile
// (PowerBrowserAPI.saveWebTabHistories). A fresh profile holds no such file before the quit, so the
// file after the exit proves the flush ran, and the exit status comes from the browser process.
// ---------------------------------------------------------------------------
const QUIT_BOUNDARY_REL = 'powerbrowser/shell/PowerBrowserAPI.sys.mjs';

/** The history file's name, read from the boundary (WEB_TAB_HISTORY_FILE_NAME), never spelled here. */
function quitHistoryFileName() {
    const name = /const WEB_TAB_HISTORY_FILE_NAME = "([^"]+)";/.exec(readFileSync(join(REPO_ROOT, QUIT_BOUNDARY_REL), 'utf8'))?.[1];
    if (!name) {
        throw new Error(`${BROKEN} WEB_TAB_HISTORY_FILE_NAME is not in ${QUIT_BOUNDARY_REL}`);
    }
    return name;
}

/** The dirty-editor fixture: an untitled editor with an unsaved change. Returns 'dirty' or what Theia reads. */
const openDirtyEditor = app => probe(app, `await get('CommandRegistry').executeCommand('workbench.action.files.newUntitledFile');
    const widget = get('EditorManager').currentEditor;
    if (!widget) return 'no-editor';
    widget.editor.getControl().getModel().setValue('unsaved change');
    await new Promise(resolve => setTimeout(resolve, 500));
    return widget.editor.document.dirty === true ? 'dirty' : 'clean';`);

/** A served web tab with two loads (its back/forward history is what the quit flush saves). True when both loaded. */
async function quitWebTab(app, pages) {
    const webId = await openWebTab(app, pages.url('/plain'));
    if (await waitForPush(app, loadedAt(webId, '/plain')) < 0) {
        return false;
    }
    const moved = await probe(app, `const w = get('WebTabChannel').widgetOf(${JSON.stringify(webId)});
        const reply = await w.navigate(${JSON.stringify(pages.url('/seed'))});
        return reply && reply.ok === true;`);
    return moved === true && await waitForPush(app, loadedAt(webId, '/seed')) >= 0;
}

/** Before a quit: the fresh profile holds no history file yet, so the file read after the exit can only be the quit's own. */
function freshProfileForQuit(app) {
    return !existsSync(join(app.profileDir, quitHistoryFileName()));
}

/** The checks after a quit was requested: the exit, its status, and the flush file. */
async function afterQuit(ctx, what) {
    const { app, fail } = ctx;
    const file = join(app.profileDir, quitHistoryFileName());
    const exit = await app.awaitExit(15000);
    if (exit !== 'exited') {
        return fail(`${what}: quit did not exit within 15 s (the browser still answers)`);
    }
    const code = await waitFor(() => app.exitCode(), c => c !== null, 8000);
    if (code !== 0) {
        fail(`${what}: the browser exited with ${JSON.stringify(code)}, want 0`);
    }
    if (!existsSync(file)) {
        return fail(`${what}: the quit flush did not run (no ${quitHistoryFileName()} in the profile)`);
    }
    let saved = null;
    try {
        saved = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
        return fail(`${what}: the flushed history file is not JSON`);
    }
    if (!saved || typeof saved !== 'object' || Array.isArray(saved) || Object.keys(saved).length === 0) {
        fail(`${what}: the flushed history holds no web tab (the tab had two loads)`);
    }
}

/** Ctrl+Q with the Theia frame focused and a dirty editor open: the reserved chrome key quits, and the flush runs. */
async function quitKey(ctx) {
    const { app, pages, fail, note } = ctx;
    if (await quitWebTab(app, pages) !== true) {
        return fail(`${BROKEN} the served page did not load twice`);
    }
    const dirty = await openDirtyEditor(app);
    if (dirty !== 'dirty') {
        return fail(`${BROKEN} the editor fixture reads ${JSON.stringify(dirty)}, not dirty, so the quit proves nothing about unsaved work`);
    }
    if (await focusTheiaFrame(app) !== true) {
        return fail(`${BROKEN} the Theia frame did not take focus before the key`);
    }
    if (!freshProfileForQuit(app)) {
        return fail(`${BROKEN} the fresh profile already holds the history file, so the flush check proves nothing`);
    }
    await pressKey(app, { key: 'q', code: 'KeyQ', keyCode: 81, modifiers: ['accel'] });
    note(`Ctrl+Q pressed (route ${keyRoute.last})`);
    await afterQuit(ctx, 'Ctrl+Q');
}

/** The Quit row: enabled in the menu, and its click quits through the same path. Plant `quit-dead-row`: the row sends nothing. */
async function quitRow(ctx) {
    const { app, pages, plant, fail, note } = ctx;
    const want = await expectedAppMenu(app);
    const quit = want.rows.find(row => row.id === 'quit');
    if (!quit) {
        return fail(`${BROKEN} the menu has no Quit row`);
    }
    if (await quitWebTab(app, pages) !== true) {
        return fail(`${BROKEN} the served page did not load twice`);
    }
    const dirty = await openDirtyEditor(app);
    if (dirty !== 'dirty') {
        return fail(`${BROKEN} the editor fixture reads ${JSON.stringify(dirty)}, not dirty, so the quit proves nothing about unsaved work`);
    }
    if (plant === 'quit-dead-row') {
        const applied = await probe(app, `const store = get('ChromeStoreClient'); if (!store) return false;
            Object.getPrototypeOf(store).quitRequest = async () => 'applied';
            return true;`);
        if (applied === true) {
            note('PLANT quit-dead-row applied (quitRequest resolves without quitting)');
        }
    }
    if (!freshProfileForQuit(app)) {
        return fail(`${BROKEN} the fresh profile already holds the history file, so the flush check proves nothing`);
    }
    if (await hamburgerOpen(app) !== true) {
        return fail(`${BROKEN} the application menu button is not in the chrome bar`);
    }
    const menu = await waitFor(() => readAppMenu(app), r => r.present && r.rows.length > 0, 6000);
    const row = menu.rows.find(r => r.label === quit.label);
    if (!row || row.disabled !== false) {
        return fail(`the ${quit.label} row is not read as enabled (${JSON.stringify(row ?? null)})`);
    }
    if (await clickMenuRow(app, quit.label) !== 'clicked') {
        return fail(`${BROKEN} the ${quit.label} row is not in the open menu`);
    }
    note(`clicked ${quit.label}`);
    await afterQuit(ctx, `the ${quit.label} row`);
}

/** Scenarios whose TLS session serves the fixture leaf without trusting its CA. */
const UNTRUSTED_TLS = ['identity-override'];

const SCENARIOS = { 'identity-tls': identityTls, 'identity-override': identityOverride, 'identity-local': identityLocal, 'site-panel': sitePanel, 'clear-data': clearData, shield, 'app-menu': appMenu, 'quit-key': quitKey, 'quit-row': quitRow };

/** Later plans' scenarios: skipped until their plan lands them (never pass, never silent). */
const NOT_LANDED = [];

/** Plan 03 (SITE-08): the shield session runs with tracking protection on, so the fixture's tracker is blocked. */
const SCENARIO_PREFS = { shield: { 'privacy.trackingprotection.enabled': true } };

/** The profile prefs for one session: the scenarios' own, then the fixture prefs for a TLS session. */
function sessionPrefs(names, tls) {
    return Object.assign({}, ...names.map(name => SCENARIO_PREFS[name] ?? {}), tls ? EXTRA_PREFS : {});
}

/**
 * One session over `names`; returns `[{ name, failures, notes, notScored }]`
 * or throws. `tls` selects the fixture session (CA trust + https twin);
 * each session opens at most four web tabs.
 */
async function runSession(names, plant = '', tls = false) {
    const pages = await serveNavPages(PAGES, tls ? { tls: { port: TLS_PORT } } : {});
    pages.port = new URL(pages.origin).port;
    setPlainPort(pages.port);
    const shared = { cleanups: [] };
    try {
        return await withProbeShell(async app => {
            const results = [];
            for (const name of names) {
                const result = { name, failures: [], notes: [], notScored: false, passNotes: [] };
                if (NOT_LANDED.includes(name)) {
                    result.notes.push(`SKIP ${name}-not-landed`);
                    results.push(result);
                    continue;
                }
                const ctx = {
                    app, pages, plant, results, shared,
                    fail: reason => { result.failures.push(reason); },
                    note: text => { result.notes.push(text); },
                    passNote: text => { result.passNotes.push(text); },
                };
                try {
                    await SCENARIOS[name](ctx);
                } catch (error) {
                    result.failures.push(`harness: ${error.message}`);
                }
                results.push(result);
            }
            return results;
        }, { extraPrefs: sessionPrefs(names, tls), trustFixtureCA: tls && !names.some(n => UNTRUSTED_TLS.includes(n)) });
    } finally {
        await pages.close();
        for (const cleanup of shared.cleanups) {
            cleanup();
        }
    }
}

function report(results) {
    let failed = 0;
    for (const r of results) {
        for (const n of r.notes) {
            console.log(`  ${r.name}: ${n}`);
        }
        if (r.failures.length) {
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
        return [...Object.keys(SCENARIOS), ...NOT_LANDED];
    }
    const names = String(args[i + 1] ?? '').split(',').filter(Boolean);
    const known = [...Object.keys(SCENARIOS), ...NOT_LANDED];
    const unknown = names.filter(n => !known.includes(n));
    if (!names.length || unknown.length) {
        throw new Error(`unknown or empty --scenario list (${unknown.join(', ') || 'none given'}); known: ${known.join(',')}`);
    }
    return [...Object.keys(SCENARIOS), ...NOT_LANDED].filter(n => names.includes(n));
}

const PLANTS = [
    { plant: 'typed-lock', target: 'identity-tls', run: ['identity-tls'], expect: 'lock derived from typed text', tls: true },
    // The panel's write comes back refused: the panel shows the unavailable copy, which names the refusal.
    { plant: 'perm-refused', target: 'site-panel', run: ['site-panel'], expect: "can't show site information", tls: true },
    // The permission reply does not refresh the identity box: the icons stay stale.
    { plant: 'icons-stale', target: 'site-panel', run: ['site-panel'], expect: 'icons did not update', tls: true },
    // The token cookie is gone before the clear: the signed-in checks must name it.
    { plant: 'clear-signout', target: 'clear-data', run: ['clear-data'], expect: 'signed out', tls: false },
    // The box shield is never rendered: the change cannot reach the identity box.
    { plant: 'shield-stale', target: 'shield', run: ['shield'], expect: 'shield icon did not update', tls: false },
    // The exception is also written on the second site: the isolation check names it.
    { plant: 'shield-leak', target: 'shield', run: ['shield'], expect: 'wrong site', tls: false },
    // Plan 04 (MENU-02): the Settings row never opens its stock page; the stock-page check names it.
    { plant: 'menu-dead-stock', target: 'app-menu', run: ['app-menu'], expect: 'did not open its stock page', tls: false },
    // Plan 05 (MENU-04): the Quit row sends nothing, so the browser never exits and the exit check names it.
    { plant: 'quit-dead-row', target: 'quit-row', run: ['quit-row'], expect: 'quit did not exit', tls: false },
];

async function selfTest() {
    let failed = 0;
    // A quit ends its launch, so each quit scenario is alone in its session (no TLS fixture).
    const ALONE = ['identity-local', 'app-menu', 'quit-key', 'quit-row'];
    for (const session of [['identity-local'], ['identity-tls'], ['site-panel'], ['clear-data'], ['shield'], ['app-menu'], ['quit-key'], ['quit-row']]) {
        let clean;
        try {
            clean = await runSession(session, '', !ALONE.includes(session[0]));
        } catch (error) {
            console.error(`${NAME} --self-test: FAIL -- harness: the clean control could not be driven: ${error.message}`);
            return 1;
        }
        const red = clean.filter(r => r.failures.length);
        if (red.length) {
            failed++;
            console.error(`${NAME} --self-test: FAIL -- the clean control is not green: ${red.map(r => `${r.name}: ${r.failures.join(' | ')}`).join('; ')}`);
        } else {
            console.log(`  ok  clean control (${session[0]}, no plant) -> green`);
        }
    }
    for (const c of PLANTS) {
        let results;
        try {
            results = await runSession(c.run, c.plant, c.tls);
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
        const names = selectedScenarios(args);
        // One session per scenario group (4-tab limit): the TLS identity session,
        // the site-panel session (its own TLS browser), then the local session.
        const results = [];
        // quit-key and quit-row each end their own launch, so each runs in a session of its own.
        for (const [name, tls] of [['identity-tls', true], ['identity-override', true], ['site-panel', true], ['identity-local', false], ['clear-data', false], ['shield', false], ['app-menu', false], ['quit-key', false], ['quit-row', false]]) {
            if (names.includes(name)) {
                results.push(...await runSession([name], '', tls));
            }
        }
        return report(results);
    } catch (error) {
        console.error(error.message.startsWith('harness:') ? error.message : `harness: ${error.message}`);
        return 1;
    }
}

const args = process.argv.slice(2);
if (args.includes('--help')) {
    console.log(`Usage: node scripts/${NAME}.mjs [--scenario ${[...Object.keys(SCENARIOS), ...NOT_LANDED].join(',')}] | --self-test`);
    process.exit(0);
}
// No .planning/ literals: the harness serves its own pages, never the plan tree.
process.exit(args.includes('--self-test') ? await selfTest() : await main(args));
