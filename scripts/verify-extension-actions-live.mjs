#!/usr/bin/env node
// scripts/verify-extension-actions-live.mjs
//
// Phase 38 plans 01-03 (EXT-06, EXT-07, EXT-08): live proof, on the built shell
// with patch 050 and the last Theia build, that the extension bridge reads
// action state for the selected web tab and runs a click on the page on
// screen, and that content scripts and page actions work per web tab.
//
// Each scenario runs in its own session: a fresh profile, the fixtures of
// scripts/lib/pb-extension-fixtures.mjs installed in chrome scope, and the
// shell. action and popup install as temporary add-ons. A relaunch scenario
// (content) installs the content fixture as an XPI with zero overlays open,
// quits, and runs on the relaunched shell, so the extension starts at app
// startup with no web tab. A session opens at most four web tabs on this
// script's 127.0.0.1 origin; a stock-window page comes from localhost. Every
// scenario has a PLANT that must go red naming its expected text, scored on
// the same recorder that showed the positive case in the clean session first.
//
// Scenarios:
//   popup-action -- with tab /a on screen and /b open and both fixtures pinned, the
//                   subscribe pushes both fixtures' rows; a real click on the action
//                   fixture's chrome-bar button (38-02) runs in /a: the extension's script
//                   retitles /a and its onClicked names /a, and the badge it sets
//                   on /a is pushed (patch 050's updateWindow signal; a retitle
//                   push may carry it first, so this is not a signal-only proof). A click on the popup
//                   fixture's button opens its page in chrome's native panel (the button
//                   pressed, no popup content in Theia DOM); the panel then closes by Esc,
//                   by focus moving into page /a, by a tab switch to /b and by a second
//                   click, each time with focus back in the pill. Plant wrong-page fires
//                   the stock delegate path in a GUI-01 stock window on /c instead, and
//                   must go red naming the stock tab. Plant popup-dom keeps the native
//                   panel from showing and draws the popup in Theia DOM, and must go red
//                   naming the occluded overlay.
//   buttons      -- (38-02) with the action fixture pinned, the chrome bar shows one
//                   button per pinned row of the push (at most three) and the puzzle
//                   menu one row per pushed extension, named by its pushed title (set
//                   equality with the push, which carries both fixtures). A real click
//                   on the action button runs in /a and the badge 'ok' the push then
//                   carries is drawn on the button. Plant buttons-stale freezes the
//                   frame's extensionAction pushes after the first render and must go
//                   red naming the stale badge.
//   manage       -- (38-02, D-08) Pin to Toolbar on the action fixture's puzzle row adds
//                   its button, and the pin survives a frontend reload; Manage Extension
//                   opens the Add-ons Manager; Remove Extension and the confirm row's
//                   Remove uninstall the popup fixture (its row leaves the menu, the
//                   add-on is gone); with the action fixture removed too the menu shows
//                   the empty heading and the install footer. Plant pin-lost clears the
//                   pinned pref before the reload and must go red naming the lost pin.
//   tabs-bridge  -- the action fixture's tabs.create opens /b adopted, selected and
//                   next to /a; a background create of /c then tabs.update({active})
//                   shows it; tabs.remove closes it; an extension-page create goes to a
//                   new stock window (38-04, B5), never an overlay; after the frontend
//                   reloads no orphan overlay is left.
//                   Plant create-unadopted swallows the adoptTab push in the frame
//                   and must go red naming the orphan overlay.
//   content      -- (38-03, EXT-08) the relaunched shell boots with zero overlays and the IDE
//                   focused; the console reader first sees a planted 'tab is null' throw (the
//                   positive control) and the boot shows none. The first overlay /a then opens
//                   with no new throw, then /b and a localhost page /n. The content script
//                   retitles /a and /b; each page's hello carries sender.tab equal to its
//                   overlay's extension tab id; the background's tabs.sendMessage to each id
//                   is answered by that page; webRequest gives /a's image request /a's id;
//                   the page action is shown on /a and hidden on /n. Plant sender-tab-null
//                   makes the background record every hello's tab as -1 and must go red
//                   naming the hello from /a. Plant pageaction-zero-tab runs upstream's
//                   unguarded show_matches loop at the zero-overlay boot and must go red
//                   naming the throw.
//   page-action  -- (38-03, EXT-08 SC3, B2) on the same relaunch: the subscribe at the
//                   zero-overlay boot pushes no page-action row and the pill draws no icon
//                   (scored once the icon was seen on /a); /a's push carries the page
//                   action (pageActionShown) and the pill shows its icon with the pushed
//                   title; on the localhost page /n chrome reports it hidden and the icon
//                   goes; back on /a it returns, and a real click on it runs in /a (the
//                   content script retitles the page and onClicked names /a's tab id).
//                   Plant pageaction-pill-stale freezes the frame's extensionAction pushes
//                   once the icon is drawn and must go red naming the stale icon.
//   sidebar      -- (38-04, B5) Show Sidebar on the surfaces fixture's gear row (its puzzle row is read
//                   from its sidebar action: it has no toolbar action) opens its sidebar as a
//                   Theia side-panel view titled with the sidebar title; chrome's panel browser
//                   holds the panel page (its own title read in the page) and is shown over the
//                   view's rect; Hide Sidebar closes the view and removes the panel browser. Plant
//                   sidebar-in-shell sends the open to the stock sidebar path for the shell window
//                   and must go red naming the shell window. Plant sidebar-as-tab loads the panel
//                   page in a web tab instead and must go red naming the refused scheme.
//   tab-pages    -- (38-04, B5) with a GUI-01 stock window open on a localhost page, the surfaces
//                   fixture's runtime.openOptionsPage (options_ui open_in_tab) and its tabs.create
//                   of its dashboard page each open the page as a tab of the stock window, while
//                   the shell's overlay set, read by the same reader before and after, is
//                   unchanged; its tabs.update of the web tab /a to its dashboard page is refused.
//                   Plant tabpage-in-overlay sends the dashboard page to a web tab instead and
//                   must go red naming the refused scheme.
//   commands     -- (38-04, B5 + the 2026-10-20 keys ruling) with page /a focused, the surfaces
//                   fixture's Alt+Shift+U fires its command on /a (onCommand's tab retitles
//                   /a); with the IDE focused, the same key lands in the Theia frame (a keydown
//                   recorder there sees it) and the command does not fire, scored on the same
//                   command recorder that saw the page-side fire; with /a focused again, its
//                   _execute_sidebar_action key Alt+Shift+I opens the sidebar view through the
//                   bridge. Plant commands-always-fire enables the extension keys while the IDE has
//                   focus and must go red naming the IDE focus. Plant commands-never-fire disables
//                   them while the page has focus and must go red naming the page.
//
// Modes:
//   node scripts/verify-extension-actions-live.mjs [--scenario a,b]   live sessions
//   node scripts/verify-extension-actions-live.mjs --self-test --live  a clean control, then one session per plant
//   node scripts/verify-extension-actions-live.mjs --self-test         static: every plant targets a scenario and
//                                                                      names text that scenario emits; no browser
//   node scripts/verify-extension-actions-live.mjs --static            the same static audit
//
// Node built-ins plus ./lib/pb-relaunch.mjs, ./lib/pb-live-probe.mjs and
// ./lib/pb-extension-fixtures.mjs only.

import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { crc32 } from 'node:zlib';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EXTENSION_FIXTURES, fixtureId } from './lib/pb-extension-fixtures.mjs';

const NAME = 'verify-extension-actions-live';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const verdict = (ok, detail, fail) => (ok ? { ok: true, detail, fail: null } : { ok: false, detail: null, fail });
const pathOf = u => {
  try {
    return new URL(String(u)).pathname;
  } catch {
    return String(u);
  }
};

// ---------------------------------------------------------------------------
// Scenarios. Each gets { app, plant } and returns a verdict.
// ---------------------------------------------------------------------------

async function scenarioPopupAction({ app, plant }) {
  const A = await openTab(app, '/a');
  const B = await openTab(app, '/b');
  await live.makeCurrent(app, A);
  await waitForSelected(app, A, '/a');
  await setPinned(app, Object.keys(EXTENSION_FIXTURES).map(fixtureId));
  const from = (await live.pushes(app)).length;
  await live.probe(app, "await get('ChromeStoreClient').extensionActionsSubscribe(); return true;");
  const ids = Object.keys(EXTENSION_FIXTURES).map(fixtureId);
  const pushAt = await live.waitForPush(app, p => p.kind === 'extensionAction' && ids.every(id => p.actions.some(r => r.extensionId === id)), { from });
  if (pushAt < 0) {
    return verdict(false, null, 'no extensionAction push carried both fixtures after the subscribe');
  }
  const rows = (await live.pushes(app))[pushAt].actions;
  const actionRow = rows.find(r => r.extensionId === fixtureId('action'));
  const popupRow = rows.find(r => r.extensionId === fixtureId('popup'));
  if (actionRow.hasPopup || !popupRow.hasPopup || !actionRow.enabled || (actionRow.icon !== null && !actionRow.icon.startsWith('data:image/'))) {
    return verdict(false, null, `the pushed rows misreport the fixtures: ${JSON.stringify({ actionRow, popupRow })}`);
  }
  const logFrom = session.logs.length;
  if (plant?.name === 'wrong-page') {
    await stockActionClick(app, fixtureId('action'));
  } else {
    await pollUntil(() => barButtons(app), b => b.length === 2, 10000);
    await clickInFrame(app, actionButton('action'));
  }
  const clicked = await waitSince(logFrom, r => r.kind === 'clicked');
  if (!clicked) {
    return verdict(false, null, 'the action fixture never heard its click');
  }
  if (pathOf(clicked.url) !== '/a' || clicked.title !== 'pb-ext-acted /a') {
    const place = String(clicked.url).includes('localhost') ? `the stock tab ${pathOf(clicked.url)}` : pathOf(clicked.url);
    return verdict(false, null, `the action ran in ${place}, not the overlay on screen /a (title ${JSON.stringify(clicked.title)}, error ${clicked.err})`);
  }
  const overlayTitle = await live.inChrome(app, `const o = overlayOf(${JSON.stringify(A)}); return o ? o.contentTitle : null;`);
  if (overlayTitle !== 'pb-ext-acted /a') {
    return verdict(false, null, `overlay /a shows ${JSON.stringify(overlayTitle)} after the click, not the extension's title`);
  }
  const badgeAt = await live.waitForPush(app, p => p.kind === 'extensionAction' && p.actions.some(r => r.extensionId === fixtureId('action') && r.badgeText === 'ok'), { from });
  if (badgeAt < 0) {
    return verdict(false, null, "no extensionAction push carried the badge 'ok' the action fixture set on /a");
  }
  if (plant?.name === 'popup-dom') {
    // The native panel never shows; the popup is drawn in Theia DOM under the button instead.
    await live.inChrome(app, "document.addEventListener('popupshowing', e => { if (e.target.classList.contains('browser-extension-panel')) e.preventDefault(); }, true); return true;");
    await app.evaluate(`(() => { const b = document.querySelector(${JSON.stringify(actionButton('popup'))}).getBoundingClientRect();
      const d = document.createElement('div'); d.className = 'pb-chrome-bar-dropdown pb-ext-popup-dom'; d.textContent = 'popup';
      Object.assign(d.style, { position: 'fixed', top: b.bottom + 'px', left: b.left + 'px', width: '320px', height: '400px' });
      document.body.appendChild(d); return true; })()`);
  }
  // Each close way: [name, how]. A popup is opened by a real click on the popup fixture's button first.
  const closeWays = [
    ['Esc', () => live.pressKey(app, { key: 'Escape', code: 'Escape', keyCode: 27 })],
    ['focus into page /a', () => live.focusOverlay(app, A)],
    ['tab switch to /b', () => live.makeCurrent(app, B)],
    ['second click', () => clickInFrame(app, actionButton('popup'))],
  ];
  const closed = [];
  for (const [way, how] of closeWays) {
    await clickInFrame(app, actionButton('popup'));
    const shown = await pollUntil(() => popupState(app), p => p.panel === 'open' && p.pressed, 10000);
    if (!shown) {
      const state = await popupState(app);
      if (state.inTheiaDom) {
        return verdict(false, null, `the occluded overlay: the popup was drawn in Theia DOM, under the page overlay that covers it, and no native panel opened (${JSON.stringify(state)})`);
      }
      return verdict(false, null, `the popup fixture's button did not open its page in the native panel, pressed (before the ${way} close): ${JSON.stringify(state)}`);
    }
    if (!String(shown.url).endsWith('/popup.html') || shown.inTheiaDom) {
      return verdict(false, null, `the native panel shows ${JSON.stringify(shown.url)} with Theia DOM popup content ${shown.inTheiaDom}, not the fixture's popup page alone`);
    }
    await how();
    const after = await pollUntil(() => popupState(app), p => p.panel !== 'open' && !p.pressed && p.pillFocused, 10000);
    if (!after) {
      return verdict(false, null, `the ${way} close left ${JSON.stringify(await popupState(app))}; the panel must close with focus back in the pill`);
    }
    closed.push(way);
    if (way === 'tab switch to /b') {
      await live.makeCurrent(app, A);
      await waitForSelected(app, A, '/a');
    }
  }
  return verdict(true, `the subscribe pushed both fixtures (popup flag, enabled, data: icon); the action button's click ran in the overlay on screen /a (retitled to ${overlayTitle}) and its badge 'ok' was pushed; the popup button opened its page in the native panel and it closed by ${closed.join(', ')}, focus back in the pill each time`, null);
}

// 38-02 (EXT-06): the buttons and puzzle rows equal the set the push carries, and a pushed badge reaches the button.
async function scenarioButtons({ app, plant }) {
  const A = await openTab(app, '/a');
  await live.makeCurrent(app, A);
  await waitForSelected(app, A, '/a');
  await setPinned(app, [fixtureId('action')]);
  const from = (await live.pushes(app)).length;
  await live.probe(app, "await get('ChromeStoreClient').extensionActionsSubscribe(); return true;");
  const ids = Object.keys(EXTENSION_FIXTURES).map(fixtureId);
  const pushAt = await live.waitForPush(app, p => p.kind === 'extensionAction' && ids.every(id => p.actions.some(r => r.extensionId === id)) && p.actions.some(r => r.pinned), { from });
  if (pushAt < 0) {
    return verdict(false, null, 'no extensionAction push carried both fixtures with the action fixture pinned');
  }
  const rows = (await live.pushes(app))[pushAt].actions;
  const wantButtons = rows.filter(r => r.pinned).slice(0, 3).map(r => r.extensionId);
  const buttons = await pollUntil(() => barButtons(app), b => sameSet(b.map(x => x.id), wantButtons), 10000);
  if (!buttons) {
    return verdict(false, null, `the bar's extension buttons ${JSON.stringify(await barButtons(app))} differ from the pushed pinned set ${JSON.stringify(wantButtons)}`);
  }
  await clickInFrame(app, '.pb-ext-puzzle');
  const menuRows = await pollUntil(() => puzzleRows(app), r => sameSet(r.map(x => x.id), rows.map(x => x.extensionId)), 10000);
  if (!menuRows || menuRows.some(m => m.name !== rows.find(r => r.extensionId === m.id).title)) {
    return verdict(false, null, `the puzzle rows ${JSON.stringify(menuRows ?? await puzzleRows(app))} differ from the pushed set ${JSON.stringify(rows.map(r => ({ id: r.extensionId, name: r.title })))}`);
  }
  await clickInFrame(app, '.pb-ext-puzzle');
  if (plant?.name === 'buttons-stale') {
    // The frame stops hearing extensionAction pushes; the recorder, installed first, still records them.
    await app.evaluate(`(() => { window.addEventListener(${JSON.stringify(live.WEB_TAB_STATE_EVENT)}, e => { if (e.detail && e.detail.kind === 'extensionAction') e.stopImmediatePropagation(); }, true); return true; })()`);
  }
  const logFrom = session.logs.length;
  const pushFrom = (await live.pushes(app)).length;
  await clickInFrame(app, `.pb-ext-action[data-extension-id=${JSON.stringify(fixtureId('action'))}]`);
  const clicked = await waitSince(logFrom, r => r.kind === 'clicked');
  if (!clicked || pathOf(clicked.url) !== '/a') {
    return verdict(false, null, `the action button's click did not run in /a: ${JSON.stringify(clicked ?? null)}`);
  }
  const badgeAt = await live.waitForPush(app, p => p.kind === 'extensionAction' && p.actions.some(r => r.extensionId === fixtureId('action') && r.badgeText === 'ok'), { from: pushFrom });
  if (badgeAt < 0) {
    return verdict(false, null, "no extensionAction push carried the badge 'ok' after the button's click");
  }
  const drawn = await pollUntil(() => barButtons(app), b => b.some(x => x.id === fixtureId('action') && x.badge === 'ok'), 5000);
  if (!drawn) {
    const shown = (await barButtons(app)).find(x => x.id === fixtureId('action'));
    return verdict(false, null, `the button shows a stale badge ${JSON.stringify(shown ? shown.badge : null)} where the push carried 'ok'`);
  }
  return verdict(true, `the bar showed buttons ${JSON.stringify(wantButtons)} and puzzle rows ${JSON.stringify(menuRows.map(m => m.name))} equal to the push; the action button's click ran in /a and its pushed badge 'ok' was drawn`, null);
}

// 38-02 (D-08): Pin to Toolbar persists, Manage opens the Add-ons Manager, Remove uninstalls, and the empty state renders.
async function scenarioManage({ app, plant }) {
  const A = await openTab(app, '/a');
  await live.makeCurrent(app, A);
  await waitForSelected(app, A, '/a');
  await setPinned(app, []);
  await live.probe(app, "await get('ChromeStoreClient').extensionActionsSubscribe(); return true;");
  await clickInFrame(app, '.pb-ext-puzzle');
  if (!(await pollUntil(() => puzzleRows(app), r => r.length === 2, 10000))) {
    return verdict(false, null, `the puzzle menu does not list both fixtures before any pin: ${JSON.stringify(await puzzleRows(app))}`);
  }
  await puzzleRowMenu(app, 'action', 'Pin to Toolbar');
  if (!(await pollUntil(() => barButtons(app), b => b.some(x => x.id === fixtureId('action')), 10000))) {
    return verdict(false, null, `Pin to Toolbar did not add the action fixture's button: ${JSON.stringify(await barButtons(app))}`);
  }
  if (plant?.name === 'pin-lost') {
    await setPinned(app, []);
  }
  await app.evaluateIn(app.chrome, "(() => { document.getElementById('powerbrowser-content').reload(); return true; })()");
  const kept = await pollUntil(() => barButtons(app).catch(() => []), b => b.some(x => x.id === fixtureId('action')), 45000);
  if (!kept) {
    return verdict(false, null, 'the pin did not persist across the frontend reload: no action fixture button after it');
  }
  await clickInFrame(app, '.pb-ext-puzzle');
  await puzzleRowMenu(app, 'action', 'Manage Extension');
  if (!(await live.stockTabOn(app, 'about:addons', 30000).catch(() => null))) {
    return verdict(false, null, 'Manage Extension did not open the Add-ons Manager in a stock tab');
  }
  for (const name of ['popup', 'action']) {
    await clickInFrame(app, '.pb-ext-puzzle');
    await puzzleRowMenu(app, name, 'Remove Extension');
    await clickInFrame(app, '.pb-ext-menu .pb-ext-confirm-remove');
    const gone = await pollUntil(() => addonGone(app, fixtureId(name)), g => g, 15000);
    if (!gone) {
      return verdict(false, null, `the confirm row's Remove did not uninstall the ${name} fixture`);
    }
  }
  await clickInFrame(app, '.pb-ext-puzzle');
  const empty = await pollUntil(() => app.evaluate(`JSON.stringify({ heading: document.querySelector('.pb-ext-menu .pb-ext-menu-heading')?.textContent ?? null,
    footer: !!document.querySelector('.pb-ext-menu .pb-ext-menu-footer'), rows: document.querySelectorAll('.pb-ext-menu .pb-ext-row').length })`).then(JSON.parse),
    e => e.rows === 0 && e.footer && e.heading === 'No extensions installed', 10000);
  if (!empty) {
    return verdict(false, null, 'the puzzle menu with no extension left does not show the empty heading and the install footer');
  }
  return verdict(true, 'Pin to Toolbar added the action button and it survived the frontend reload; Manage Extension opened about:addons; Remove with its confirm row uninstalled both fixtures; the empty menu showed its heading and install footer', null);
}

// tabs.create (active, next to its opener, adopted), tabs.create in the background then tabs.update({active}),
// tabs.remove, an extension-page create sent stock-side (38-04), and no orphan overlay once the frontend reloads.
async function scenarioTabsBridge({ app, plant, command }) {
  const A = await openTab(app, '/a');
  await live.makeCurrent(app, A);
  await waitForSelected(app, A, '/a');
  if (plant?.name === 'create-unadopted') {
    // The frontend never hears the adoptTab push, so nothing claims the overlay chrome made.
    await app.evaluate(`(() => { window.addEventListener(${JSON.stringify(live.WEB_TAB_STATE_EVENT)}, e => { if (e.detail && e.detail.kind === 'adoptTab') e.stopImmediatePropagation(); }, true); return true; })()`);
  }
  const created = await command('create', { props: { url: `${ORIGIN}/b`, active: true } });
  if (!created.ok) {
    return verdict(false, null, `tabs.create of /b was rejected: ${created.error}`);
  }
  const B = await pollUntil(() => overlayOfExtTab(app, created.result.id), o => o.tabId !== null, 10000);
  if (!B) {
    return verdict(false, null, 'the created tab /b was never adopted: an orphan overlay no frontend tab owns');
  }
  const order = await live.probe(app, "return { ids: get('ApplicationShell').getWidgets('main').map(w => w.tabId), current: get('ApplicationShell').currentWidget?.tabId ?? null };");
  if (!B.selected || order.current !== B.tabId || order.ids.indexOf(B.tabId) !== order.ids.indexOf(A) + 1) {
    return verdict(false, null, `the created tab /b is adopted but not the selected tab next to /a: ${JSON.stringify({ selected: B.selected, order })}`);
  }
  const bg = await command('create', { props: { url: `${ORIGIN}/c`, active: false } });
  const C = bg.ok ? await pollUntil(() => overlayOfExtTab(app, bg.result.id), o => o.tabId !== null, 10000) : null;
  if (!C || C.selected) {
    return verdict(false, null, `the background tabs.create of /c did not land adopted and unselected: ${JSON.stringify(bg.ok ? C : bg.error)}`);
  }
  const act = await command('activate', { tabId: bg.result.id });
  if (!act.ok) {
    return verdict(false, null, `tabs.update({active}) on /c was rejected: ${act.error}`);
  }
  const shown = await pollUntil(async () => ({ chrome: await overlayOfExtTab(app, bg.result.id), current: (await live.probe(app, "return { id: get('ApplicationShell').currentWidget?.tabId ?? null };")).id }), v => v.chrome.selected && v.current === C.tabId, 10000);
  if (!shown) {
    return verdict(false, null, 'tabs.update({active}) on /c did not select it in chrome and show it in the frontend');
  }
  const rm = await command('remove', { tabId: bg.result.id });
  const gone = rm.ok ? await pollUntil(() => overlayOfExtTab(app, bg.result.id), o => !o.present, 10000) : null;
  if (!gone) {
    return verdict(false, null, `tabs.remove of /c did not close its overlay: ${rm.ok ? 'still present' : rm.error}`);
  }
  const ext = await command('create', { props: { url: 'page.html' } });
  // 38-04 (B5): with no stock window open the page opens in a new one and no tab comes back (the tab-pages scenario
  // covers the stock window that is already open).
  if (ext.ok || !/new browser window/.test(String(ext.error))) {
    return verdict(false, null, `tabs.create of an extension page did not go to a new stock window: ${JSON.stringify(ext)}`);
  }
  await app.evaluateIn(app.chrome, "(() => { document.getElementById('powerbrowser-content').reload(); return true; })()");
  const settled = await pollUntil(() => orphanCount(app), n => n === 0, 45000, 3);
  if (settled === null) {
    return verdict(false, null, `an orphan overlay outlived the frontend reload (${await orphanCount(app)} overlay(s) with no frontend tab)`);
  }
  return verdict(true, `tabs.create /b landed adopted, selected and next to /a; /c landed in the background, tabs.update({active}) showed it and tabs.remove closed it; an extension page went to a new stock window (${ext.error}); no orphan overlay after the frontend reload`, null);
}

// 38-03 (EXT-08): content scripts and the page action's show_matches on the 31.1 identity, after a zero-overlay boot.
async function scenarioContent({ app, plant, command }) {
  const hostTabs = await live.inChrome(app, 'return window.gBrowser.tabs.length;');
  if (hostTabs !== 0) {
    return verdict(false, null, `the relaunch did not boot with zero overlays (${hostTabs} host tab(s))`);
  }
  if (!(await live.focusTheiaFrame(app))) throw new Error('BROKEN INSTRUMENT: the IDE frame could not take focus');
  if (plant?.name === 'pageaction-zero-tab') {
    // Upstream's onManifestEntry loop before patch 050's guard: isShownForTab on a window whose selectedTab is null.
    await pageActionThrow(app, 'for (const w of ExtensionParent.apiManager.global.windowTracker.browserWindows()) action.isShownForTab(w.gBrowser.selectedTab);');
  }
  const boot = await tabNullErrors(app);
  const control = await pageActionThrow(app, 'action.isShownForTab(null);');
  const seen = await tabNullErrors(app);
  if (!control || seen.length !== boot.length + 1) {
    throw new Error(`BROKEN INSTRUMENT: the console reader did not see the control throw (${control}; ${boot.length} then ${seen.length})`);
  }
  if (boot.length) {
    return verdict(false, null, `the zero-overlay startup threw: ${boot[0]}`);
  }
  if (plant?.name === 'sender-tab-null') {
    await command('forget-tabs');
  }
  const A = await openTab(app, '/a');
  const first = await tabNullErrors(app);
  if (first.length !== seen.length) {
    return verdict(false, null, `the first overlay, opened while the host had no selected tab, threw: ${first[first.length - 1]}`);
  }
  const B = await openTab(app, '/b');
  const N = await live.openWebTab(app, `${STOCK_ORIGIN}/n`);
  const ids = { '/a': await extTabIdOf(app, A), '/b': await extTabIdOf(app, B), '/n': await extTabIdOf(app, N) };
  if (Object.values(ids).some(id => !(id >= 0))) throw new Error(`BROKEN INSTRUMENT: an overlay has no extension tab id: ${JSON.stringify(ids)}`);
  for (const [path, tabId] of [['/a', A], ['/b', B]]) {
    const title = await pollUntil(() => live.inChrome(app, `const o = overlayOf(${JSON.stringify(tabId)}); return o ? o.contentTitle : null;`), t => t === `pb-content ${path}`, 15000);
    if (!title) {
      return verdict(false, null, `the content script did not run in overlay ${path}: its title is not the script's marker`);
    }
    const hello = (await waitSince(0, r => r.kind === 'hello' && r.path === path)) ?? null;
    if (!hello || hello.senderTabId !== ids[path]) {
      return verdict(false, null, `the hello from ${path} carried sender.tab ${hello ? hello.senderTabId : 'none'}, not the overlay's tab ${ids[path]}`);
    }
    const ping = await command('ping', { tabId: ids[path] });
    if (!ping.ok || ping.result?.path !== path) {
      return verdict(false, null, `tabs.sendMessage(${ids[path]}) was answered by ${JSON.stringify(ping.ok ? ping.result : ping.error)}, not page ${path}`);
    }
  }
  // The positive control is the record itself: the observer saw /a's image request before its tab id is read.
  const request = await waitSince(0, r => r.kind === 'request' && pathOf(r.url) === '/img/a.png');
  if (!request) {
    return verdict(false, null, "webRequest.onBeforeRequest never saw overlay /a's image request");
  }
  if (request.tabId !== ids['/a']) {
    return verdict(false, null, `webRequest gave /a's image request tab ${request.tabId}, not the overlay's tab ${ids['/a']}`);
  }
  const shownA = await command('isShown', { tabId: ids['/a'] });
  const shownN = await command('isShown', { tabId: ids['/n'] });
  if (shownA.result !== true || shownN.result !== false) {
    return verdict(false, null, `the page action is ${JSON.stringify(shownA.result ?? shownA.error)} on /a and ${JSON.stringify(shownN.result ?? shownN.error)} on /n; show_matches shows it on the 127.0.0.1 page only`);
  }
  return verdict(true, `zero-overlay boot with no throw (the control throw was seen); the first overlay opened clean; the content script ran in /a and /b; sender.tab was ${ids['/a']} and ${ids['/b']}; tabs.sendMessage reached each page; /a's image request carried tab ${ids['/a']}; the page action is shown on /a and hidden on /n (tab ${ids['/n']})`, null);
}

// 38-03 (EXT-08 SC3, B2): the pill's page-action icon follows the pushed shown state per tab, and its click runs in the
// overlay on screen through the toolbar buttons' path.
async function scenarioPageAction({ app, plant, command }) {
  const id = fixtureId('content');
  const isPage = r => r.extensionId === id && r.pageActionShown === true;
  const pillIcons = async () => JSON.parse(await app.evaluate(`JSON.stringify([...document.querySelectorAll('.pb-chrome-bar-pill .pb-page-action')].map(b => ({ id: b.dataset.extensionId, title: b.title })))`));
  const from = (await live.pushes(app)).length;
  await live.probe(app, "await get('ChromeStoreClient').extensionActionsSubscribe(); return true;");
  const bootAt = await live.waitForPush(app, p => p.kind === 'extensionAction', { from });
  if (bootAt < 0) {
    return verdict(false, null, 'no extensionAction push answered the subscribe at the zero-overlay boot');
  }
  const bootRows = (await live.pushes(app))[bootAt].actions;
  const bootIcons = await pillIcons();
  const A = await openTab(app, '/a');
  await waitForSelected(app, A, '/a');
  const shownAt = await live.waitForPush(app, p => p.kind === 'extensionAction' && p.actions.some(isPage), { from });
  if (shownAt < 0) {
    return verdict(false, null, 'no extensionAction push carried the page action shown on /a');
  }
  const row = (await live.pushes(app))[shownAt].actions.find(isPage);
  const shown = await pollUntil(pillIcons, icons => icons.some(i => i.id === id), 10000);
  if (!shown || shown.find(i => i.id === id).title !== row.title) {
    return verdict(false, null, `the pill does not show the page action pushed for /a (${JSON.stringify(row.title)}): ${JSON.stringify(shown ?? await pillIcons())}`);
  }
  // The icon reader has now seen an icon, so the boot reading taken before it is scored.
  if (bootRows.some(isPage) || bootIcons.length) {
    return verdict(false, null, `the zero-overlay boot showed a page action: push ${JSON.stringify(bootRows.filter(isPage))}, pill ${JSON.stringify(bootIcons)}`);
  }
  if (plant?.name === 'pageaction-pill-stale') {
    // The frame stops hearing extensionAction pushes after the icon was drawn.
    await app.evaluate(`(() => { window.addEventListener(${JSON.stringify(live.WEB_TAB_STATE_EVENT)}, e => { if (e.detail && e.detail.kind === 'extensionAction') e.stopImmediatePropagation(); }, true); return true; })()`);
  }
  const N = await live.openWebTab(app, `${STOCK_ORIGIN}/n`);
  await waitForSelected(app, N, '/n');
  const hiddenN = await command('isShown', { tabId: await extTabIdOf(app, N) });
  if (hiddenN.result !== false) throw new Error(`BROKEN INSTRUMENT: the page action is not hidden on /n in chrome: ${JSON.stringify(hiddenN)}`);
  if (!(await pollUntil(pillIcons, icons => !icons.some(i => i.id === id), 5000))) {
    return verdict(false, null, 'the stale icon: the pill still shows the page action on /n, where chrome reports it hidden');
  }
  await live.makeCurrent(app, A);
  await waitForSelected(app, A, '/a');
  if (!(await pollUntil(pillIcons, icons => icons.some(i => i.id === id), 10000))) {
    return verdict(false, null, 'the pill did not show the page action again back on /a');
  }
  const logFrom = session.logs.length;
  await clickInFrame(app, `.pb-page-action[data-extension-id=${JSON.stringify(id)}]`);
  const clicked = await waitSince(logFrom, r => r.kind === 'page-clicked');
  const tabA = await extTabIdOf(app, A);
  if (!clicked || clicked.tabId !== tabA || clicked.title !== 'pb-page-acted /a') {
    return verdict(false, null, `the pill icon's click did not run in /a (tab ${tabA}): ${JSON.stringify(clicked ?? null)}`);
  }
  const overlayTitle = await live.inChrome(app, `const o = overlayOf(${JSON.stringify(A)}); return o ? o.contentTitle : null;`);
  if (overlayTitle !== 'pb-page-acted /a') {
    return verdict(false, null, `overlay /a shows ${JSON.stringify(overlayTitle)} after the pill icon's click, not the extension's title`);
  }
  return verdict(true, `the zero-overlay boot pushed and drew no page action; /a's push carried it and the pill drew ${JSON.stringify(row.title)}; on /n it was hidden and the icon went; back on /a its click ran in tab ${tabA} (retitled to ${overlayTitle})`, null);
}

// 38-04 (B5): the sidebar view. One session, surfaces fixture only.
async function scenarioSidebar({ app, plant, command }) {
  const A = await openTab(app, '/a');
  await live.makeCurrent(app, A);
  await waitForSelected(app, A, '/a');
  await live.probe(app, "await get('ChromeStoreClient').extensionActionsSubscribe(); return true;");
  const panelUrl = (await command('url', { path: 'panel.html' })).result;
  if (plant?.name === 'sidebar-in-shell') {
    // The stock route: the sidebar action asked to open in the shell window, which patch 050 keeps it out of.
    await live.inChrome(app, `const { ExtensionParent } = ChromeUtils.importESModule('resource://gre/modules/ExtensionParent.sys.mjs');
      const ext = ExtensionParent.GlobalManager.extensionMap.get(${JSON.stringify(fixtureId('surfaces'))});
      ExtensionParent.apiManager.global.sidebarActionFor(ext).open(window); return true;`);
  } else if (plant?.name === 'sidebar-as-tab') {
    const where = await live.probe(app, `const w = await get('WebTabOpenHandler').openUrl(${JSON.stringify(panelUrl)}); return { lost: !!(w && w.lostView) };`).catch(e => ({ error: String(e) }));
    return verdict(false, null, `the panel page was sent to a web tab, where the shell refuses its scheme (refused-scheme): ${JSON.stringify(where)}`);
  } else {
    await clickInFrame(app, '.pb-ext-puzzle');
    if (!(await pollUntil(() => puzzleRows(app), r => r.some(x => x.id === fixtureId('surfaces') && x.name === 'PB sidebar probe'), 10000))) {
      return verdict(false, null, `the puzzle menu has no row for the sidebar-only fixture: ${JSON.stringify(await puzzleRows(app))}`);
    }
    await puzzleRowMenu(app, 'surfaces', 'Show Sidebar');
  }
  const opened = await pollUntil(async () => ({ view: await sidebarView(app), frame: await sidebarFrame(app) }),
    s => s.view.attached && s.view.visible && s.view.label === 'PB sidebar probe' && s.frame.present && s.frame.visibility === 'visible'
      && s.frame.url === panelUrl && s.frame.title === 'pb-sidebar-panel' && Math.abs(s.frame.width - s.view.width) <= 1, 20000);
  if (!opened) {
    const now = { view: await sidebarView(app), frame: await sidebarFrame(app) };
    return verdict(false, null, now.view.attached
      ? `the Theia sidebar view opened but chrome's panel browser does not show the panel page over it: ${JSON.stringify(now)}`
      : `no Theia side-panel view opened: the sidebar went to the shell window, which shows none (${JSON.stringify(now)})`);
  }
  await clickInFrame(app, '.pb-ext-puzzle');
  await puzzleRowMenu(app, 'surfaces', 'Hide Sidebar');
  const closed = await pollUntil(async () => ({ view: await sidebarView(app), frame: await sidebarFrame(app) }), s => !s.view.attached && !s.frame.present, 10000);
  if (!closed) {
    return verdict(false, null, `Hide Sidebar did not close the view and remove the panel browser: ${JSON.stringify({ view: await sidebarView(app), frame: await sidebarFrame(app) })}`);
  }
  return verdict(true, `Show Sidebar opened the Theia view 'PB sidebar probe' with chrome's panel browser on ${pathOf(panelUrl)} (page title pb-sidebar-panel) shown over its rect; Hide Sidebar closed both`, null);
}

// 38-04 (B5): extension tab pages open stock-side. One session, surfaces fixture only.
async function scenarioTabPages({ app, plant, command }) {
  const A = await openTab(app, '/a');
  await live.makeCurrent(app, A);
  await waitForSelected(app, A, '/a');
  const stockUrl = `${STOCK_ORIGIN}/c`;
  await live.probe(app, `await get('CommandRegistry').executeCommand('powerbrowser.open-browser-window', ${JSON.stringify(stockUrl)}); return true;`);
  await live.stockTabOn(app, stockUrl, 30000);
  const before = await overlayIds(app);
  if (!before.includes(A)) {
    return verdict(false, null, `BROKEN INSTRUMENT: the overlay reader does not see /a (${JSON.stringify(before)})`);
  }
  const dashboardUrl = (await command('url', { path: 'dashboard.html' })).result;
  if (plant?.name === 'tabpage-in-overlay') {
    const where = await live.probe(app, `const w = await get('WebTabOpenHandler').openUrl(${JSON.stringify(dashboardUrl)}); return { lost: !!(w && w.lostView) };`).catch(e => ({ error: String(e) }));
    return verdict(false, null, `the tab page was sent to a web tab, where the shell refuses its scheme (refused-scheme): ${JSON.stringify(where)}`);
  }
  const optionsUrl = (await command('url', { path: 'options.html' })).result;
  const options = await command('options');
  if (!options.ok || !(await live.stockTabOn(app, optionsUrl, 20000).catch(() => null))) {
    return verdict(false, null, `runtime.openOptionsPage did not open the options page in the stock window: ${JSON.stringify(options)}`);
  }
  const dashboard = await command('dashboard');
  if (!dashboard.ok || !(await live.stockTabOn(app, dashboardUrl, 20000).catch(() => null))) {
    return verdict(false, null, `tabs.create of the dashboard page did not open it in the stock window: ${JSON.stringify(dashboard)}`);
  }
  const after = await overlayIds(app);
  if (!sameSet(after, before)) {
    return verdict(false, null, `a tab page changed the shell's overlay set: ${JSON.stringify({ before, after })}`);
  }
  const nav = await command('overlay-nav', { url: `${ORIGIN}/a` });
  if (nav.ok || !/Illegal URL/.test(String(nav.error))) {
    return verdict(false, null, `tabs.update of the web tab /a to an extension page was not refused: ${JSON.stringify(nav)}`);
  }
  return verdict(true, `runtime.openOptionsPage and tabs.create opened ${pathOf(optionsUrl)} and ${pathOf(dashboardUrl)} as stock-window tabs; the overlay set stayed ${JSON.stringify(before)}; tabs.update of /a to an extension page was refused (${nav.error})`, null);
}

// 38-04 (B5): commands shortcuts with page focus, Theia's keys otherwise. One session, surfaces fixture only.
async function scenarioCommands({ app, plant }) {
  const A = await openTab(app, '/a');
  await live.makeCurrent(app, A);
  await waitForSelected(app, A, '/a');
  await live.probe(app, "await get('ChromeStoreClient').extensionActionsSubscribe(); return true;");
  await app.evaluate("(() => { window.__pbKeys = 0; window.addEventListener('keydown', e => { if (e.code === 'KeyU' && e.altKey && e.shiftKey) window.__pbKeys++; }, true); return true; })()");
  const altShiftU = { key: 'U', code: 'KeyU', keyCode: 85, modifiers: ['alt', 'shift'] };
  const setExtensionKeys = enabled => live.inChrome(app, `document.querySelectorAll('keyset[id^="ext-keyset-id-"] key').forEach(k => ${enabled} ? k.removeAttribute('disabled') : k.setAttribute('disabled', 'true')); return true;`);
  if (!(await live.focusOverlay(app, A))) {
    return verdict(false, null, 'BROKEN INSTRUMENT: page /a could not be focused');
  }
  if (plant?.name === 'commands-never-fire') {
    await setExtensionKeys(false);
  }
  const from = session.logs.length;
  await live.pressKey(app, altShiftU);
  const fired = await waitSince(from, r => r.kind === 'command' && r.name === 'pb-probe', 10000);
  if (!fired) {
    return verdict(false, null, `the shortcut did not fire with the page /a focused (key route ${live.keyRoute.last})`);
  }
  if (pathOf(fired.url) !== '/a' || fired.title !== 'pb-command /a') {
    return verdict(false, null, `the shortcut fired on the wrong tab: ${JSON.stringify(fired)}`);
  }
  if (!(await live.focusTheiaFrame(app))) {
    return verdict(false, null, 'BROKEN INSTRUMENT: the Theia frame could not be focused');
  }
  if (plant?.name === 'commands-always-fire') {
    await setExtensionKeys(true);
  }
  const keysBefore = await app.evaluate('window.__pbKeys');
  const fromIde = session.logs.length;
  await live.pressKey(app, altShiftU);
  await sleep(1500);
  const keysAfter = await app.evaluate('window.__pbKeys');
  const ideFired = session.logs.slice(fromIde).find(r => r.kind === 'command');
  if (ideFired) {
    return verdict(false, null, `the extension command fired with the IDE focused: ${JSON.stringify(ideFired)}`);
  }
  if (keysAfter !== keysBefore + 1) {
    return verdict(false, null, `with the IDE focused the key did not reach the Theia frame (${keysBefore} -> ${keysAfter})`);
  }
  if (!(await live.focusOverlay(app, A))) {
    return verdict(false, null, 'BROKEN INSTRUMENT: page /a could not be focused again');
  }
  await live.pressKey(app, { key: 'I', code: 'KeyI', keyCode: 73, modifiers: ['alt', 'shift'] });
  if (!(await pollUntil(() => sidebarView(app), v => v.attached && v.label === 'PB sidebar probe', 10000))) {
    return verdict(false, null, `the _execute_sidebar_action key did not open the sidebar view: ${JSON.stringify(await sidebarView(app))}`);
  }
  return verdict(true, `Alt+Shift+U fired pb-probe on /a (title ${fired.title}); with the IDE focused it reached the Theia frame and fired nothing; Alt+Shift+I opened the sidebar view`, null);
}

const SCENARIOS_TABLE = {
  'popup-action': scenarioPopupAction,
  buttons: scenarioButtons,
  manage: scenarioManage,
  'tabs-bridge': scenarioTabsBridge,
  content: scenarioContent,
  'page-action': scenarioPageAction,
  sidebar: scenarioSidebar,
  'tab-pages': scenarioTabPages,
  commands: scenarioCommands,
};
// Scenarios that run on a relaunched shell after the content fixture's XPI install (no temporary fixture).
const RELAUNCH_SCENARIOS = new Set(['content', 'page-action']);
// 38-04 (B5): scenarios that install the surfaces fixture alone, so its background is the only reader of /cmd.
const B5_SCENARIOS = new Set(['sidebar', 'tab-pages', 'commands']);

// Each plant names its scenario and the red text that scenario must print. A plant is a different driver, not a
// patched product: the scenario reads `plant.name`.
const PLANTS_TABLE = {
  'wrong-page': { scenario: 'popup-action', expect: 'the action ran in the stock tab' },
  'popup-dom': { scenario: 'popup-action', expect: 'the occluded overlay' },
  'create-unadopted': { scenario: 'tabs-bridge', expect: 'never adopted: an orphan overlay' },
  'buttons-stale': { scenario: 'buttons', expect: 'the button shows a stale badge' },
  'pin-lost': { scenario: 'manage', expect: 'the pin did not persist' },
  'sender-tab-null': { scenario: 'content', expect: 'the hello from /a carried sender.tab -1' },
  'pageaction-zero-tab': { scenario: 'content', expect: 'the zero-overlay startup threw' },
  'pageaction-pill-stale': { scenario: 'page-action', expect: 'the stale icon: the pill still shows' },
  'sidebar-in-shell': { scenario: 'sidebar', expect: 'no Theia side-panel view opened: the sidebar went to the shell window' },
  'sidebar-as-tab': { scenario: 'sidebar', expect: 'the panel page was sent to a web tab, where the shell refuses its scheme (refused-scheme)' },
  'tabpage-in-overlay': { scenario: 'tab-pages', expect: 'the tab page was sent to a web tab, where the shell refuses its scheme (refused-scheme)' },
  'commands-always-fire': { scenario: 'commands', expect: 'the extension command fired with the IDE focused' },
  'commands-never-fire': { scenario: 'commands', expect: 'the shortcut did not fire with the page /a focused' },
};
const SCENARIOS = SCENARIOS_TABLE;
const PLANTS = PLANTS_TABLE;

// The static audit's own plants: each must make staticAudit report the named drift.
const AUDIT_PLANTS = [
  { name: 'unknown scenario', plants: { stray: { scenario: 'no-such-scenario', expect: 'x' } }, expect: 'targets the unknown scenario no-such-scenario' },
  { name: 'unemitted expect', plants: { ...PLANTS_TABLE, 'wrong-page': { ...PLANTS_TABLE['wrong-page'], expect: 'zz never printed' } }, expect: "emits no text starting 'zz never printed'" },
  { name: 'scenario without a plant', plants: {}, expect: 'has no plant' },
];

// ---------------------------------------------------------------------------
// The static audit (--static, --self-test): no browser.
// ---------------------------------------------------------------------------

function staticAudit(PLANTS = PLANTS_TABLE, SCENARIOS = SCENARIOS_TABLE) {
  const failures = [];
  for (const [name, plant] of Object.entries(PLANTS)) {
    const fn = SCENARIOS[plant.scenario];
    if (!fn) {
      failures.push(`plant ${name} targets the unknown scenario ${plant.scenario}`);
      continue;
    }
    if (!fn.toString().includes(plant.expect.split(' ').slice(0, 3).join(' '))) {
      failures.push(`plant ${name}: scenario ${plant.scenario} emits no text starting '${plant.expect}'`);
    }
    if (!fn.toString().includes(`'${name}'`)) {
      failures.push(`plant ${name}: scenario ${plant.scenario} never reads it, so the plant would not apply`);
    }
  }
  for (const name of Object.keys(SCENARIOS)) {
    if (!Object.values(PLANTS).some(p => p.scenario === name)) failures.push(`scenario ${name} has no plant`);
  }
  return failures;
}

// ---------------------------------------------------------------------------
// The live harness. Loaded only for a live run, so the static modes start no server and launch nothing.
// ---------------------------------------------------------------------------

let live = null;
let server = null;
let ORIGIN = '';
let STOCK_ORIGIN = '';
let session = { logs: [], queue: [] };
let opSeq = 0;
const sessionDirs = [];

async function startHarness() {
  live = { ...(await import('./lib/pb-live-probe.mjs')), ...(await import('./lib/pb-relaunch.mjs')) };
  server = createServer((req, res) => {
    const path = new URL(req.url, 'http://x').pathname;
    if (req.method === 'POST' && path === '/log') {
      let body = '';
      req.on('data', chunk => {
        body += chunk;
      });
      req.on('end', () => {
        try {
          session.logs.push(JSON.parse(body));
        } catch {
          session.logs.push({ kind: 'bad-log', body });
        }
        res.writeHead(204, { 'access-control-allow-origin': '*' });
        res.end();
      });
      return;
    }
    if (path === '/cmd') {
      res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
      res.end(JSON.stringify(session.queue));
      session.queue = [];
      return;
    }
    if (/^\/[a-z]$/.test(path)) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html><title>page ${path}</title><body>live page ${path}<img src="/img${path}.png" alt=""></body>`);
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  ORIGIN = `http://127.0.0.1:${server.address().port}`;
  STOCK_ORIGIN = `http://localhost:${server.address().port}`;
}

async function waitSince(from, pred, timeoutMs = 15000) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const hit = session.logs.slice(from).find(pred);
    if (hit) return hit;
    if (Date.now() > end) return undefined;
    await sleep(150);
  }
}

// One command for the action fixture's background page: queued on /cmd, answered on /log.
async function command(op, args = {}) {
  const opId = `op${++opSeq}`;
  session.queue.push({ op, opId, ...args });
  const rec = await waitSince(0, r => r.kind === 'result' && r.opId === opId, 20000);
  if (!rec) throw new Error(`timed out waiting for the ${op} answer`);
  return rec;
}

async function openTab(app, path) {
  return live.openWebTab(app, `${ORIGIN}${path}`);
}

// Waits until the 31.1 host's selected tab is the overlay of `tabId` and has loaded `path`.
async function waitForSelected(app, tabId, path) {
  const end = Date.now() + 20000;
  for (;;) {
    const at = await live.inChrome(app, `const o = overlayOf(${JSON.stringify(tabId)}); const s = window.gBrowser.selectedTab;
      return o && s && s.linkedBrowser === o ? o.currentURI.spec : null;`);
    if (at && pathOf(at) === path) return;
    if (Date.now() > end) throw new Error(`BROKEN INSTRUMENT: the host never selected ${path}`);
    await sleep(200);
  }
}

// Polls `read` until `pred` holds `times` reads in a row; the last value, or null on timeout.
async function pollUntil(read, pred, timeoutMs, times = 1) {
  const end = Date.now() + timeoutMs;
  let streak = 0;
  for (;;) {
    const value = await read();
    streak = pred(value) ? streak + 1 : 0;
    if (streak >= times) return value;
    if (Date.now() > end) return null;
    await sleep(300);
  }
}

// The overlay behind an extension tab id, read in chrome: whether it is still in the shell, its frontend tab id
// (null while it waits for its adoption ack) and whether the 31.1 host has it selected.
async function overlayOfExtTab(app, extTabId) {
  return JSON.parse(await app.evaluateIn(app.chrome, `JSON.stringify((() => {
    const { ExtensionParent } = ChromeUtils.importESModule('resource://gre/modules/ExtensionParent.sys.mjs');
    const W = ChromeUtils.importESModule('chrome://powerbrowser/content/PowerBrowserAPI.sys.mjs').PowerBrowserWebTabs;
    let tab = null;
    try { tab = ExtensionParent.apiManager.global.tabTracker.getTab(${Number(extTabId)}); } catch (e) { return { present: false, tabId: null, selected: false }; }
    const b = tab.linkedBrowser;
    return { present: Boolean(b && b.isConnected), tabId: b ? W.tabIdOfBrowser(b) : null, selected: window.gBrowser.selectedTab === tab };
  })())`));
}

// Overlays in the shell that no frontend tab owns, or that the host strip does not hold.
async function orphanCount(app) {
  return Number(await live.inChrome(app, `const overlays = [...document.querySelectorAll('browser[messagemanagergroup="browsers"]')];
    return overlays.filter(o => W.tabIdOfBrowser(o) === null).length + Math.abs(window.gBrowser.tabs.length - overlays.length);`));
}

const sameSet = (a, b) => a.length === b.length && new Set(a).size === a.length && b.every(x => a.includes(x));

// D-08: the pinned set is chrome's pref; a scenario that is not about pinning sets it directly.
async function setPinned(app, ids) {
  await live.inChrome(app, `Services.prefs.setStringPref('powerbrowser.extensions.pinned', ${JSON.stringify(JSON.stringify(ids))}); return true;`);
}

// A click on the first element matching `selector` in the Theia frame; a missing element is a broken instrument.
async function clickInFrame(app, selector) {
  const hit = await app.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.click(); return true; })()`);
  if (hit !== true) throw new Error(`BROKEN INSTRUMENT: no ${selector} in the Theia frame`);
}

// The chrome bar's extension buttons: id, badge text (null when none) and whether the popup is shown as open.
async function barButtons(app) {
  return JSON.parse(await app.evaluate(`JSON.stringify([...document.querySelectorAll('.pb-ext-action')].map(b => ({
    id: b.dataset.extensionId, badge: b.querySelector('.pb-ext-badge')?.textContent ?? null, open: b.classList.contains('is-open') })))`));
}

const actionButton = name => `.pb-ext-action[data-extension-id=${JSON.stringify(fixtureId(name))}]`;

// The popup's state: chrome's native panel (state and loaded URL), the button's pressed class, whether a popup is drawn
// in Theia DOM instead, and whether focus is in the pill (chrome focus on the Theia frame, frame focus on the pill input).
async function popupState(app) {
  const chrome = JSON.parse(await live.inChrome(app, `const p = document.querySelector('panel.browser-extension-panel');
    const b = p && p.querySelector('browser');
    return JSON.stringify({ panel: p ? p.state : 'none', url: b && b.currentURI ? b.currentURI.spec : null, frameFocused: document.activeElement === document.getElementById('powerbrowser-content') });`));
  const frame = JSON.parse(await app.evaluate(`JSON.stringify({
    pressed: !!document.querySelector(${JSON.stringify(actionButton('popup'))} + '.is-open'),
    inTheiaDom: !!document.querySelector('iframe, .pb-chrome-bar-dropdown:not(.pb-ext-menu)'),
    pill: document.activeElement && document.activeElement.classList.contains('pb-chrome-bar-input') })`));
  return { panel: chrome.panel, url: chrome.url, pressed: frame.pressed, inTheiaDom: frame.inTheiaDom, pillFocused: chrome.frameFocused && frame.pill };
}

// Opens a puzzle row's gear menu and activates the row labelled `label` the way a pointer does (move, then mouse-up).
async function puzzleRowMenu(app, name, label) {
  await clickInFrame(app, `.pb-ext-menu .pb-ext-row[data-extension-id=${JSON.stringify(fixtureId(name))}] .pb-ext-row-menu`);
  const done = await pollUntil(() => app.evaluate(`(() => {
    const item = [...document.querySelectorAll('.lm-Menu .lm-Menu-item')].find(i => i.querySelector('.lm-Menu-itemLabel')?.textContent.trim() === ${JSON.stringify(label)});
    if (!item) return false;
    const r = item.getBoundingClientRect();
    const at = { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    item.dispatchEvent(new MouseEvent('mousemove', at));
    item.dispatchEvent(new MouseEvent('mouseup', { ...at, button: 0 }));
    return true;
  })()`), hit => hit === true, 5000);
  if (!done) throw new Error(`BROKEN INSTRUMENT: no ${label} row in the ${name} fixture's menu`);
}

// 38-04 (B5): the frontend tab ids of every overlay in the shell.
async function overlayIds(app) {
  return JSON.parse(await live.inChrome(app, `return JSON.stringify([...document.querySelectorAll('browser[messagemanagergroup="browsers"]')].map(o => W.tabIdOfBrowser(o)));`));
}

// 38-04 (B5): the Theia sidebar view, read in the frontend.
async function sidebarView(app) {
  return live.probe(app, `const w = get('ApplicationShell').getWidgets('right').find(x => x.id === 'powerbrowser.extension-sidebar');
    return { attached: !!(w && w.isAttached), visible: !!(w && w.isVisible), label: w ? w.title.label : null, width: w ? Math.round(w.node.getBoundingClientRect().width) : 0 };`);
}

// 38-04 (B5): chrome's sidebar panel browser and the extension page inside it.
async function sidebarFrame(app) {
  return JSON.parse(await live.inChrome(app, `const f = [...document.querySelectorAll('browser')].find(b => b.getAttribute('src') === 'chrome://browser/content/webext-panels.xhtml');
    const inner = f && f.contentDocument ? f.contentDocument.getElementById('webext-panels-browser') : null;
    return JSON.stringify({ present: !!f, visibility: f ? f.style.visibility : null, width: f ? Math.round(parseFloat(f.style.width)) : 0,
      url: inner && inner.currentURI ? inner.currentURI.spec : null, title: inner ? inner.contentTitle : null });`));
}

// Whether the add-on is no longer installed, read in chrome.
async function addonGone(app, id) {
  return (await app.evaluateIn(app.chrome, `(async () => {
    const { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
    return !(await AddonManager.getAddonByID(${JSON.stringify(id)}));
  })()`)) === true;
}

// The open puzzle menu's extension rows: id and shown name.
async function puzzleRows(app) {
  return JSON.parse(await app.evaluate(`JSON.stringify([...document.querySelectorAll('.pb-ext-menu .pb-ext-row')].map(r => ({
    id: r.dataset.extensionId, name: r.querySelector('.pb-ext-row-name')?.textContent ?? null })))`));
}

// A zip of `files` (name -> text) with every entry stored, which is all an XPI needs.
function storedZip(files) {
  const local = [];
  const central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text);
    const nameBytes = Buffer.from(name);
    const sum = crc32(data);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(0x21, 12); // 1980-01-01, the first valid DOS date
    head.writeUInt32LE(sum, 14);
    head.writeUInt32LE(data.length, 18);
    head.writeUInt32LE(data.length, 22);
    head.writeUInt16LE(nameBytes.length, 26);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x21, 14);
    entry.writeUInt32LE(sum, 16);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(nameBytes.length, 28);
    entry.writeUInt32LE(offset, 42);
    local.push(head, nameBytes, data);
    central.push(entry, nameBytes);
    offset += head.length + nameBytes.length + data.length;
  }
  const size = central.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(central.length / 2, 8);
  end.writeUInt16LE(central.length / 2, 10);
  end.writeUInt32LE(size, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, end]);
}

// The static self-check of storedZip: each central entry names its file and points at a local header whose stored
// bytes are that file's text with the CRC the entry carries.
function zipRoundTrip(files) {
  const zip = storedZip(files);
  const end = zip.length - 22;
  const out = {};
  let at = zip.readUInt32LE(end + 16);
  for (let i = 0; i < zip.readUInt16LE(end + 10); i++) {
    const name = zip.toString('utf8', at + 46, at + 46 + zip.readUInt16LE(at + 28));
    const local = zip.readUInt32LE(at + 42);
    const start = local + 30 + zip.readUInt16LE(local + 26);
    const data = zip.subarray(start, start + zip.readUInt32LE(local + 18));
    if (zip.readUInt32LE(local) !== 0x04034b50 || crc32(data) !== zip.readUInt32LE(at + 16)) return null;
    out[name] = data.toString('utf8');
    at += 46 + name.length;
  }
  return out;
}

// The content fixture survives a relaunch, so it installs as an XPI; the others install as temporary add-ons.
const XPI_FIXTURES = new Set(['content']);

// Writes a fixture into a fresh directory and installs it.
async function installFixture(app, name) {
  const fixture = EXTENSION_FIXTURES[name];
  const dir = await mkdtemp(join(tmpdir(), 'pb-ext-actions-fixture-'));
  sessionDirs.push(dir);
  const files = { 'manifest.json': JSON.stringify(fixture.manifest) };
  for (const [file, body] of Object.entries(fixture.files)) {
    files[file] = body.replace('__ORIGIN__', JSON.stringify(ORIGIN));
  }
  let target = dir;
  if (XPI_FIXTURES.has(name)) {
    target = join(dir, `${name}.xpi`);
    await writeFile(target, storedZip(files));
  } else {
    for (const [file, body] of Object.entries(files)) await writeFile(join(dir, file), body);
  }
  const installed = JSON.parse(await app.evaluateIn(app.chrome, `(async () => {
    try {
      const { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
      const f = Cc['@mozilla.org/file/local;1'].createInstance(Ci.nsIFile);
      f.initWithPath(${JSON.stringify(target)});
      const addon = ${XPI_FIXTURES.has(name)} ? await (await AddonManager.getInstallForFile(f)).install() : await AddonManager.installTemporaryAddon(f);
      return JSON.stringify({ id: addon.id, isActive: addon.isActive });
    } catch (e) { return JSON.stringify({ error: String(e) }); }
  })()`));
  if (installed.error || installed.id !== fixtureId(name)) {
    throw new Error(`BROKEN INSTRUMENT: the ${name} fixture did not install: ${JSON.stringify(installed)}`);
  }
}

// The wrong-page plant's driver: the stock delegate path, fired in a GUI-01 stock window on a localhost page.
async function stockActionClick(app, extId) {
  const stockUrl = `${STOCK_ORIGIN}/c`;
  await live.probe(app, `await get('CommandRegistry').executeCommand('powerbrowser.open-browser-window', ${JSON.stringify(stockUrl)}); return true;`);
  await live.stockTabOn(app, stockUrl, 30000);
  const stock = (await app.contexts('chrome')).find(entry => entry.url.startsWith('chrome://browser/content/browser.xhtml'));
  if (!stock) throw new Error('BROKEN INSTRUMENT: no stock browser window context after the GUI-01 open');
  await app.evaluateIn(stock.context, `(() => {
    const { ExtensionParent } = ChromeUtils.importESModule('resource://gre/modules/ExtensionParent.sys.mjs');
    ExtensionParent.apiManager.global.browserActionFor(WebExtensionPolicy.getByID(${JSON.stringify(extId)}).extension).triggerAction(window);
    return true;
  })()`);
}

// The extension tab id of the overlay of frontend tab `tabId`, from the extension tab tracker; -1 when it has none.
async function extTabIdOf(app, tabId) {
  return Number(await live.inChrome(app, `const { ExtensionParent } = ChromeUtils.importESModule('resource://gre/modules/ExtensionParent.sys.mjs');
    const o = overlayOf(${JSON.stringify(tabId)});
    const t = o && window.gBrowser.getTabForBrowser(o);
    return t ? ExtensionParent.apiManager.global.tabTracker.getId(t) : -1;`));
}

// Every console message so far naming a null tab: the text the unguarded page-action and TabOpen paths throw.
async function tabNullErrors(app) {
  return JSON.parse(await live.inChrome(app, `return JSON.stringify(Services.console.getMessageArray()
    .map(m => String(m.errorMessage || m.message || '')).filter(t => /tab is null/.test(t)));`));
}

// Runs `body` with `action` bound to the content fixture's page action and reports its throw to the console, as an
// unguarded startup path would; the thrown text, or null when nothing threw.
async function pageActionThrow(app, body) {
  return live.inChrome(app, `const { ExtensionParent } = ChromeUtils.importESModule('resource://gre/modules/ExtensionParent.sys.mjs');
    const action = ExtensionParent.apiManager.global.pageActionFor(WebExtensionPolicy.getByID(${JSON.stringify(fixtureId('content'))}).extension).action;
    try { ${body} } catch (e) { Cu.reportError(e); return String(e); }
    return null;`);
}

async function stampCheck() {
  const digest = createHash('sha256').update(await readFile(join(live.REPO_ROOT, 'patches/050-extension-tab-host.patch'))).digest('hex');
  const stamp = (await readFile(join(live.REPO_ROOT, 'objdir/.pb-050-build.sha256'), 'utf8')).trim().split(/\s+/)[0];
  if (digest !== stamp) {
    throw new Error(`BROKEN INSTRUMENT: patches/050 hashes to ${digest}, the build stamp is ${stamp}; rebuild before a live run`);
  }
}

const SESSION_PREFS = {
  'xpinstall.signatures.required': false,
  // The content fixture is MV3: its background must not be suspended between the harness's commands.
  'extensions.background.idle.timeout': 3600000,
};

// A relaunch scenario: the content XPI installs with zero overlays, the shell quits, and the scenario runs on the
// relaunched shell (same profile) once the fixture's background has started again.
async function runRelaunchSession(scenarioName, plant) {
  const profile = await live.makeProfile(SESSION_PREFS);
  process.env.MOZ_PURGE_CACHES = '1';
  try {
    await live.withShell(profile, async app => {
      await installFixture(app, 'content');
      if (!(await waitSince(0, r => r.kind === 'content-started'))) throw new Error('BROKEN INSTRUMENT: the content fixture never started');
      if ((await app.quit()) !== 'exited') throw new Error('BROKEN INSTRUMENT: the shell did not quit after the install');
    });
    session = { logs: [], queue: [] };
    return await live.withShell(profile, async app => {
      await live.installPushRecorder(app);
      if (!(await waitSince(0, r => r.kind === 'content-started', 30000))) throw new Error('BROKEN INSTRUMENT: the content fixture did not start again after the relaunch');
      return await SCENARIOS[scenarioName]({ app, plant, command });
    });
  } finally {
    await profile.dispose();
  }
}

// One scenario in one session, with every fixture installed and started first.
async function runSession(scenarioName, plantName = null) {
  session = { logs: [], queue: [] };
  try {
    if (RELAUNCH_SCENARIOS.has(scenarioName)) {
      return await runRelaunchSession(scenarioName, plantName ? { name: plantName, ...PLANTS[plantName] } : null);
    }
    if (B5_SCENARIOS.has(scenarioName)) {
      return await live.withProbeShell(
        async app => {
          await installFixture(app, 'surfaces');
          if (!(await waitSince(0, r => r.kind === 'surfaces-started'))) throw new Error('BROKEN INSTRUMENT: the surfaces fixture background page never started');
          return await SCENARIOS[scenarioName]({ app, plant: plantName ? { name: plantName, ...PLANTS[plantName] } : null, command });
        },
        { extraPrefs: SESSION_PREFS }
      );
    }
    return await live.withProbeShell(
      async app => {
        await installFixture(app, 'action');
        await installFixture(app, 'popup');
        if (!(await waitSince(0, r => r.kind === 'started')) || !(await waitSince(0, r => r.kind === 'popup-started'))) {
          throw new Error('BROKEN INSTRUMENT: a fixture background page never started');
        }
        return await SCENARIOS[scenarioName]({ app, plant: plantName ? { name: plantName, ...PLANTS[plantName] } : null, command });
      },
      { extraPrefs: SESSION_PREFS }
    );
  } catch (error) {
    const text = error && error.message ? error.message : String(error);
    return { ok: false, broken: text.startsWith('BROKEN INSTRUMENT'), detail: null, fail: text };
  } finally {
    for (const dir of sessionDirs.splice(0)) await rm(dir, { recursive: true, force: true });
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const failures = staticAudit();
  if (argv.includes('--static') || (argv.includes('--self-test') && !argv.includes('--live'))) {
    const files = { 'manifest.json': '{}', 'a/b.js': 'x'.repeat(300) };
    if (JSON.stringify(zipRoundTrip(files)) !== JSON.stringify(files)) failures.push('the XPI writer (storedZip) does not round-trip its files');
    if (argv.includes('--self-test')) {
      for (const plant of AUDIT_PLANTS) {
        const hit = staticAudit(plant.plants).find(f => f.includes(plant.expect));
        if (hit) console.log(`  ok  audit plant ${plant.name} -> red: ${hit}`);
        else failures.push(`audit plant ${plant.name} did not go red naming '${plant.expect}'`);
      }
    }
    failures.forEach(f => console.log(`FAIL -- ${f}`));
    if (failures.length) process.exit(1);
    console.log(`${NAME} ${argv.includes('--self-test') ? '--self-test' : '--static'}: PASS -- ${Object.keys(PLANTS).length} plant(s) each target a scenario, name text it emits and are read by it; every scenario has a plant (the live control and plant sessions were not run)`);
    process.exit(0);
  }
  if (failures.length) {
    failures.forEach(f => console.log(`harness: ${f}`));
    process.exit(1);
  }
  const at = argv.indexOf('--scenario');
  const selected = at === -1 ? Object.keys(SCENARIOS) : argv[at + 1].split(',');
  for (const name of selected) {
    if (!SCENARIOS[name]) throw new Error(`unknown scenario ${name}; known: ${Object.keys(SCENARIOS).join(', ')}`);
  }
  await startHarness();
  await stampCheck();
  let failed = 0;
  if (!argv.includes('--self-test')) {
    for (const name of selected) {
      const r = await runSession(name);
      console.log(r.ok ? `${name}: PASS -- ${r.detail}` : `${name}: FAIL -- ${r.fail}`);
      if (!r.ok) failed++;
      if (r.broken) break;
    }
  } else {
    for (const [plantName, plant] of Object.entries(PLANTS)) {
      if (!selected.includes(plant.scenario)) continue;
      const control = await runSession(plant.scenario);
      if (!control.ok) {
        failed++;
        console.log(`${NAME} --self-test: control ${plant.scenario} FAIL -- ${control.fail}`);
        continue;
      }
      console.log(`  control ${plant.scenario}: PASS -- the clean run is green before the plant`);
      const red = await runSession(plant.scenario, plantName);
      if (!red.ok && !red.broken && red.fail.includes(plant.expect)) {
        console.log(`  ok  plant ${plantName} -> red, naming '${plant.expect}': ${red.fail}`);
      } else {
        failed++;
        console.log(`${NAME} --self-test: FAIL -- plant ${plantName} did not go red naming '${plant.expect}': ${red.fail}`);
      }
    }
    if (!failed) console.log(`${NAME} --self-test: PASS -- every control was green and every plant went red naming its drift`);
  }
  server.close();
  process.exit(failed ? 1 : 0);
}

await main();
