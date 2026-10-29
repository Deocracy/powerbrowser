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
 * Session C -- `site-panel` (own TLS browser, one tab): the panel's connection
 * and certificate block, six tri-state rows in table order, camera and
 * autoplay-media round trips with persistence across a reopen, the identity
 * box icons (three plus +1, back to none, autoplay icon kept), and the origin
 * race: the panel shows origin A, the tab navigates to origin B, the write is
 * refused, and camera stays default on B.
 * Plant `perm-refused` makes the permission reply refused (expected red
 * "can't show site information"); plant `icons-stale` stops the reply from
 * refreshing the identity box (expected red "icons did not update").
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
    focusTheiaFrame,
    loadedAt,
    makeCurrent,
    openWebTab,
    pushes,
    serveNavPages,
    waitForPush,
    withProbeShell,
} from './lib/pb-live-probe.mjs';
import { domainToASCII, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
            this.identityState = () => ({ state: 'secure', displaySpec: '', baseDomain: null });
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
        rows: [...panel.querySelectorAll('.pb-site-panel-row')].map(r => ({
            id: r.getAttribute('data-permission'),
            state: r.getAttribute('data-state'),
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
            await openPanel(app);
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
    // --- autoplay-media: default -> allow -> block sounds -> block all -> default.
    const autoplayCycle = [['allow', 'Allowed'], ['block-audible', 'Block sounds'], ['block-all', 'Block all'], ['default', 'Use default']];
    if (JSON.stringify(autoplay) !== JSON.stringify(['allow', 'block-audible', 'block-all', 'default'])) {
        fail(`the autoplay cycle is ${JSON.stringify(autoplay)}, want Allow, Block sounds, Block all, Use default`);
    }
    for (const [want, word] of autoplayCycle) {
        if (!await clickRow(app, 'autoplay-media')) {
            return fail(`${BROKEN} the autoplay-media row is not on screen`);
        }
        const panel = await waitFor(() => panelRead(app), p => p.present ? rowOf(p, 'autoplay-media')?.state === want : !!p.empty);
        if (panel.empty) {
            return refusedAt('autoplay-media', panel);
        }
        const row = rowOf(panel, 'autoplay-media');
        if (row?.state !== want || row?.word !== word) {
            fail(`autoplay-media row did not reach "${want}" with the copy "${word}"; saw state ${JSON.stringify(row?.state)} copy ${JSON.stringify(row?.word)}`);
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
    const afterWrite = await waitFor(() => panelRead(app), p => !!p.empty || (p.present && rowOf(p, 'camera')?.state !== 'allow'), 6000);
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
    await openPanel(app);
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
    // --- autoplay icon: block sounds, then block all, the icon stays and the copy follows.
    await openPanel(app);
    for (const [want, word] of [['block-audible', 'Block sounds'], ['block-all', 'Block all']]) {
        await clickRow(app, 'autoplay-media');
        const got = await waitFor(() => panelRead(app), p => p.present && rowOf(p, 'autoplay-media')?.state === want);
        if (rowOf(got, 'autoplay-media')?.word !== word) {
            fail(`autoplay-media must read "${word}" at "${want}"; saw state ${JSON.stringify(rowOf(got, 'autoplay-media')?.state)} copy ${JSON.stringify(rowOf(got, 'autoplay-media')?.word)}`);
        }
        await closePanel(app);
        const icon = await waitFor(() => iconRead(app), i => i.icons.includes('codicon-play'));
        if (!icon.icons.includes('codicon-play')) {
            fail(`an autoplay-media "${want}" must keep its icon in the identity box; saw ${JSON.stringify(icon)}`);
        }
        await openPanel(app);
    }
    // Reset autoplay-media to default: block all -> default is one click.
    await clickRow(app, 'autoplay-media');
    await waitFor(() => panelRead(app), p => p.present && rowOf(p, 'autoplay-media')?.state === 'default');
    await closePanel(app);
}

const SCENARIOS = { 'identity-tls': identityTls, 'identity-local': identityLocal, 'site-panel': sitePanel };

/** Later plans' scenarios: skipped until their plan lands them (never pass, never silent). */
const NOT_LANDED = ['clear-data', 'shield', 'app-menu'];

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
        }, tls ? { extraPrefs: EXTRA_PREFS, trustFixtureCA: true } : {});
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
];

async function selfTest() {
    let failed = 0;
    for (const session of [['identity-local'], ['identity-tls'], ['site-panel']]) {
        let clean;
        try {
            clean = await runSession(session, '', session[0] !== 'identity-local');
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
        for (const [name, tls] of [['identity-tls', true], ['site-panel', true], ['identity-local', false]]) {
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
