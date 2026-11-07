#!/usr/bin/env node
// scripts/verify-tab-strip-live.mjs -- Phase 34 (TAB-01..TAB-09, BMK-07): the
// tab strip on the built binary, one scenario per behaviour (twelve). Plan 34-01 lands
// the `menu` scenario; 34-02..34-05 add theirs to SCENARIOS below.
//
//   menu (TAB-01, BMK-07): with /c current, right-clicking /a's strip tab
//     opens a stock .lm-Menu whose rows are exactly the strip's tab-menu rows
//     (label and enabled state); Mute and Bookmark are enabled exactly when
//     their Phase 32/33 paths say so (read independently of the rows); Reload
//     sends webTabReload for /a and never for /c; Duplicate opens /a's URL
//     right after /a; Close Duplicate Tabs then closes that copy; /c stays
//     current throughout.
//
//   reorder (TAB-02, 34-02): a trusted pointer drag of /a past /b's midpoint
//     shows /a dimmed (is-dragging) and the 2px drop indicator before /c; on
//     release /a is after /b in both the strip and the home pane TabBar, and
//     stays there across tab switches and a Coding/Browsing round trip. With
//     the strip narrowed until it overflows, resting the drag in the right 8px
//     edge zone scrolls the row.
//
//   middle (TAB-03, 34-02): N2. Two seeded contenteditable detectors record
//     input/paste: one in the Theia frame (the document a strip click lands
//     in, focused before the click) and one in the visible page's realm. A
//     sentinel goes on the selection clipboard. Positive controls first, same
//     session, same recorders: a trusted middle-click into each editable must
//     paste (else NOT SCORED, never a pass), and the push recorder must hold
//     /b's state push. Then a trusted middle-click on /a's strip tab closes /a
//     (gone from the strip, the TabBar and the shell) while both detectors
//     stay silent and /b stays current.
//
//   double (TAB-03): a trusted double-click on the strip's empty space opens
//     a new tab on the empty page and focuses the pill; the row carries the
//     empty-strip tooltip. BiDi input is dispatched inside the frame, so it
//     cannot see chrome's window-drag handles laid over that space
//     (powerbrowser.js custom title bar); a real double-click there is the
//     desktop's title-bar action, which the end-of-milestone pass checks.
//
//   drop (TAB-08): an http(s) link dropped on /a's right half opens /d as a
//     background tab right after /a; text drops reach the pill's drop path
//     (AddressBar.openDropped) and open no tab; a javascript: link, and the
//     same as plain text, are refused with the strip's failure sentence,
//     nothing loads and the current page keeps its title.
//
//   overflow (TAB-04): with the strip narrowed until its row overflows
//     (scrollWidth > clientWidth), the List All Tabs chevron is present; its
//     menu lists exactly the strip's tabs in strip order (the TabBar's, which
//     puts pinned tabs first once 34-03 pins them); picking the tab scrolled
//     out of view makes it current and scrolls it into the row. Restoring the
//     width in the same session, the row no longer overflows and the chevron
//     is gone while the strip order still reads.
//
//   pin-restore (TAB-05, 34-03): on one kept profile with /a, /b and /b2 (a
//     second tab on /b's URL), Pin Tab on /b then /a pins both, the pinned
//     block leads the strip as /b, /a, a pinned tab is 32px wide, /b2 stays
//     unpinned under its own key, and the shell-state map holds exactly the
//     keyOf keys of /b, /a in that order. The app's own quit (withShellQuit),
//     then a relaunch on the same profile with purged caches: after the
//     strip's pin restore a tab carries each stored key, its rowKey equals
//     that key (W1 continuity), both are pinned and lead in the stored order,
//     and /b2, if restored, is not pinned.
//
//   multi (TAB-06, 34-03): with /a current, Ctrl-click /b and /d selects
//     exactly those two (is-selected) and leaves /a current; Shift-click /b
//     from the /d anchor selects /b../d; Esc clears; a plain click clears and
//     activates. Then with /b and /d selected, /b's menu offers the N-Tabs
//     rows with N = 2, and each bulk row reaches /b and /d only, through the
//     single-tab path: Move 2 Tabs to Start runs the tab-move-start command
//     for each (the strip reads /b /d /a /c); Mute 2 Tabs sends webTabMute for
//     each; Bookmark 2 Tabs calls the one bookmarkTabs callback once per tab
//     (or is disabled exactly while Phase 33's bookmarkPage is absent); Close
//     2 Tabs runs tab-close for each, /a and /c stay open, and the selection
//     is empty.
//
//   preview (TAB-07, 34-04): /a and /b open, /b current, /a's settled GUI-08
//     thumbnail loaded into the strip's cards (else NOT SCORED). A trusted
//     hover on /a opens the card after the 400 ms dwell (never before 380 ms),
//     below /a (its top at /a's bottom plus 4px), carrying the thumbnail image,
//     /a's title and URL, while chrome's overlay of /b reads hidden (the card
//     is a blocking layer); moving off closes it and the overlay reads visible
//     again. A tab on the empty page (no capture) gets the text card: title,
//     no image. Hovering the current tab /b for twice the dwell opens no card
//     while chrome's overlay of /b reads visible (positive overlay read).
//
//   attention (TAB-09, 34-04): /a and /b open, /b current. /a's own page sets
//     document.title (BiDi script.evaluate in /a's top-level context): /a
//     shows the attention dot, its tooltip is the Updated addition and its
//     accessible name the ", updated" one (the positive control for every
//     no-dot read below). A title change in the current /b marks nothing.
//     Activating /a hides the dot and chrome's next push clears the flag;
//     back in the background /a stays unmarked. Pages then try to write the
//     flag (a page-realm state event naming /a, window.titleChanged) and /a
//     stays unmarked: the flag is chrome-minted only.
//
//   bookmark-all (BMK-07, 34-05): /a, /b on localhost and /c open, /c
//     current. /a's menu shows Bookmark All Tabs enabled exactly while Phase
//     33's ChromeStoreClient.bookmarkPage exists; while it is absent the row
//     reads disabled and the scenario reports NOT SCORED, never PASS. With it
//     present: every tab read back null through readBookmarkByUrl before
//     (else NOT SCORED), choosing the row makes each tab read back as a
//     bookmark carrying its own title and URL (a positive per-tab read, never
//     a log line), /c stays current; then with bookmarkPage refusing, the row
//     shows the strip's bookmark failure sentence.
//     39-16 (34 T4): Bookmark Tab first bookmarks /c alone; Bookmark All Tabs
//     then repeats /c, and Bookmark Tab repeats /a: each URL holds exactly one
//     Places bookmark (IN-02, counted in chrome through PlacesUtils). The
//     forced failure's sentence must name the application. Plants:
//     bookmark-all-drops-tab, bookmark-repeat-duplicates (a second Places
//     entry for /a), bookmark-failure-silent (the strip's bookmark callback
//     swallows the rejection).
//
//   modes (D-02, 34-05): /a, /b on localhost and /c open in Browsing. Through
//     Coding, Organising and back to Browsing the strip stays the one
//     TabStripWidget (one .pb-tab-strip node, the same instance), its
//     visibility is what the mode contract says (the setHidden expression in
//     chrome-bar-widget.tsx, derived at check time) and measures so (painted
//     row or zero height), and its stripTabs reader and the home TabBar keep
//     the order read before the first switch; where it is shown the painted
//     strip reads that order too.
//
//   keyboard-menu (34 T13, WR-04, 39-15): browsing, /a /b /c open, /c current.
//     /a's tab focused, ArrowRight moves keyboard focus to /b; Shift+F10 and
//     then the context-menu key on the focused tab each open the tab menu
//     with its top-left within 4 px of that tab's bottom-left; Enter on /a's
//     focused tab and Space on /b's activate them; a right-click on /c's tab
//     opens the menu with its top-left within 4 px of the pointer. With
//     PB_REAL_INPUT=1 every key and the right-click are real OS input
//     (ydotool behind pb-kwin's gate); unset, keys go through TIP, which
//     never reaches GTK's context-menu-key path (nsGtkKeyUtils
//     MaybeDispatchContextMenuEvent), so the driver raises the keyboard-
//     shaped contextmenu (button 0, at 0,0) on the focused tab itself.
//
//   overflow, 39-16 (34 T8): the numbers are printed (row scroll and client
//     width, chevron rect, the picked tab's rect inside the row) and chrome's
//     .powerbrowser-drag handles are read after a scroll: none overlaps a
//     visible tab, and they equal the frontend's fresh publish.
//
//   badge-capture (34 T14, capture only, run when named with PB_CAPTURE_DIR):
//     /a pinned with its widget marked as playing sound, /b current with /c
//     and /d selected, the real pointer resting on /c; the shell is captured
//     to 34-T14-badge-and-selection.png for the owner's visual verdict.
//
// PB_CAPTURE_DIR=<dir>: the sessions run headed and captureShell (pb-kwin's
// gate) writes named PNGs there.
//
// The 34-02 scenarios run on pb-live-probe.mjs's withProbeShell (purged
// startup cache, the push recorder, chrome scope for the clipboard); `menu`
// keeps the ng-a-live shell it was written on.
//
// Positive page-side assertions only, never the absence of a log line. At
// most four same-site tabs per session (the shared-process defect);
// bookmark-all and modes put /b on localhost, a second host.
//
// --self-test plants one fault per scenario in the running page (the object
// that runs, not this file) and requires the scenario to go red naming it,
// after an unplanted run of the same scenario went green.
//
// Usage:
//   node scripts/verify-tab-strip-live.mjs [--scenario menu,keyboard-menu,reorder,middle,double,drop,overflow,pin-restore,multi,preview,attention,bookmark-all,modes[,..]] [--self-test]
//
// Full tier only: the built binary, a fresh Theia build, a headless browser.

import { newProfile, runCheck, withShell, withShellQuit } from './lib/ng-a-live.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './lib/ng-a-live.mjs';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { activeWindow, captureShell } from './lib/pb-kwin.mjs';
import { appNameExpr, focusTheiaFrame, keyRoute, osClientPointer, overlayVisibility, pointerRoute, pressKey, probe, waitForPush, withProbeShell } from './lib/pb-live-probe.mjs';

const NAME = 'tab-strip-live';

// 39-16: PB_CAPTURE_DIR=<dir> runs the sessions headed and captures the shell at named states.
const CAPTURE_DIR = process.env.PB_CAPTURE_DIR ? resolve(process.env.PB_CAPTURE_DIR) : '';
if (CAPTURE_DIR) {
    process.env.PB_LIVE_HEADED = '1';
}

/** PB_CAPTURE_DIR set: the PowerBrowser window (captureShell refuses any other active window) to <dir>/<file>. */
async function capture(file) {
    if (!CAPTURE_DIR) {
        return;
    }
    mkdirSync(CAPTURE_DIR, { recursive: true });
    const shot = await captureShell(join(CAPTURE_DIR, file));
    console.log(`${NAME}: capture ${file}: ${shot.resourceClass} ${shot.width}x${shot.height}`);
}

// Shared page helpers. No backticks inside.
const PROBES = `
    const S = window.__tabStrip = window.__tabStrip || {};
    const strip = () => A.get('TabStripWidget');
    const labelOf = w => w.title.label || w.id;
    const current = () => { const t = A.shell().mainPanel.currentTitle; return t ? t.owner : undefined; };
    const settle = async (test, n) => { for (let i = 0; i < (n || 40) && !test(); i++) await A.sleep(125); return !!test(); };
    const tabNode = w => Array.from(document.querySelectorAll('.pb-tab-strip .pb-tab:not(.pb-tab-stack)')).find(e => e.getAttribute('title') === labelOf(w));
    const menuNode = () => document.querySelector('.lm-Menu.pb-tab-menu');
    // Lumino draws each group separator as an .lm-Menu-item too (data-type separator): not a row.
    const menuRows = () => Array.from((menuNode() || document.createElement('div')).querySelectorAll('.lm-Menu-item:not([data-type="separator"])')).map(e => ({
        label: (e.querySelector('.lm-Menu-itemLabel') || e).textContent.trim(),
        enabled: !e.classList.contains('lm-mod-disabled'),
        node: e,
    }));
    const openMenu = async w => {
        const node = tabNode(w);
        if (!node) throw new Error('no strip tab for ' + labelOf(w));
        const r = node.getBoundingClientRect();
        node.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: r.left + 8, clientY: r.top + 8 }));
        await settle(() => menuRows().length > 0);
        return menuRows();
    };
    const choose = async label => {
        const row = menuRows().find(x => x.label === label);
        if (!row) throw new Error('the tab menu has no row ' + label);
        const r = row.node.getBoundingClientRect();
        const at = { bubbles: true, cancelable: true, button: 0, clientX: r.left + 4, clientY: r.top + r.height / 2 };
        row.node.dispatchEvent(new MouseEvent('mousemove', at));
        row.node.dispatchEvent(new MouseEvent('mouseup', at));
        await settle(() => !menuNode());
    };
    // A spy on the web-tab channel: delegates, and records each request's kind and tab.
    const spy = () => {
        const channel = A.get('WebTabChannel');
        if (!S.sent) {
            S.sent = [];
            const original = channel.request.bind(channel);
            channel.request = msg => { S.sent.push({ kind: msg.kind, tabId: msg.tabId }); return original(msg); };
        }
        return S.sent;
    };
`;

/** menu: TAB-01 + BMK-07 on the right-clicked tab. `plant` names a page fault for --self-test. */
async function menu({ run, pages, expect, plant }) {
    const urls = { a: pages.url('/a'), b: pages.url('/b'), c: pages.url('/c') };
    const setup = await run(`
        ${PROBES}
        await A.get('ModeService').activateMode('browsing');
        const urls = ${JSON.stringify(urls)};
        for (const name of Object.keys(urls)) S[name] = await A.open(urls[name]);
        await settle(() => ['a', 'b', 'c'].every(n => /^page /.test(labelOf(S[n]))));
        A.shell().activateWidget(S.c.id);
        await settle(() => current() === S.c && !!tabNode(S.a));
        if (${JSON.stringify(plant)} === 'menu-acts-on-current') {
            const rows = strip().tabMenuRows.bind(strip());
            strip().tabMenuRows = () => rows(current());
        }
        return { current: current() === S.c, painted: !!tabNode(S.a) };
    `);
    expect(setup.current && setup.painted, `menu: setup: /c is not current or /a is not painted (${JSON.stringify(setup)})`);

    const shown = await run(`
        ${PROBES}
        const rendered = (await openMenu(S.a)).map(r => ({ label: r.label, enabled: r.enabled }));
        const table = strip().tabMenuRows(S.a).map(r => ({ label: r.label, enabled: r.enabled }));
        const store = A.get('ChromeStoreClient');
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        if (menuNode()) menuNode().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
        await settle(() => !menuNode());
        return {
            rendered, table,
            muteExpected: !!(S.a.soundPlaying || S.a.audioMuted),
            bookmarkExpected: typeof store.bookmarkPage === 'function',
        };
    `);
    const key = rows => rows.map(r => `${r.label}:${r.enabled ? 'on' : 'off'}`).sort().join(' | ');
    expect(shown.rendered.length > 0, 'menu: right-click on /a rendered no .lm-Menu.pb-tab-menu rows');
    expect(key(shown.rendered) === key(shown.table),
        `menu: the rendered rows [${key(shown.rendered)}] are not the strip's tab-menu rows [${key(shown.table)}]`);
    const row = label => shown.rendered.find(r => r.label === label);
    expect(row('Mute Tab')?.enabled === shown.muteExpected, `menu: Mute Tab enabled ${row('Mute Tab')?.enabled}, want ${shown.muteExpected} (soundPlaying/audioMuted)`);
    for (const label of ['Bookmark Tab', 'Bookmark All Tabs']) {
        expect(row(label)?.enabled === shown.bookmarkExpected, `menu: ${label} enabled ${row(label)?.enabled}, want ${shown.bookmarkExpected} (Phase 33 bookmarkPage present)`);
    }
    expect(row('Close Duplicate Tabs')?.enabled === false, 'menu: Close Duplicate Tabs is enabled with no duplicate open');

    const acted = await run(`
        ${PROBES}
        const sent = spy();
        const from = sent.length;
        await openMenu(S.a);
        await choose('Reload');
        await settle(() => sent.slice(from).some(m => m.kind === 'webTabReload'));
        const reloads = sent.slice(from).filter(m => m.kind === 'webTabReload').map(m => m.tabId);
        const before = A.webTabs().length;
        await openMenu(S.a);
        await choose('Duplicate Tab');
        await settle(() => A.webTabs().length === before + 1);
        const titles = strip().primaryBar().titles.map(t => t.owner);
        const copy = titles[titles.indexOf(S.a) + 1];
        const duplicated = !!copy && copy !== S.a && copy.url === S.a.url;
        A.shell().activateWidget(S.c.id);
        await settle(() => current() === S.c);
        await openMenu(S.a);
        const closeDupEnabled = (menuRows().find(r => r.label === 'Close Duplicate Tabs') || {}).enabled;
        await choose('Close Duplicate Tabs');
        await settle(() => !copy || copy.isDisposed);
        return {
            reloads, a: S.a.tabId, c: S.c.tabId, duplicated, closeDupEnabled,
            closed: !!copy && copy.isDisposed, aOpen: !S.a.isDisposed, current: current() === S.c,
        };
    `);
    expect(acted.reloads.includes(acted.a), `menu: Reload on /a's menu sent no webTabReload for /a (sent for [${acted.reloads.join(', ')}])`);
    expect(!acted.reloads.includes(acted.c), 'menu: Reload on /a\'s menu reloaded the current tab /c');
    expect(acted.duplicated, 'menu: Duplicate Tab did not open /a\'s URL right after /a');
    expect(acted.closeDupEnabled === true, 'menu: Close Duplicate Tabs is not enabled with a duplicate of /a open');
    expect(acted.closed && acted.aOpen, `menu: Close Duplicate Tabs did not close the copy and keep /a (closed ${acted.closed}, /a open ${acted.aOpen})`);
    expect(acted.current, 'menu: a menu action changed the current tab away from /c');
}

// The 34-02 scenarios' helpers, for withProbeShell's probe() (get, sleep, until in scope). No backticks inside.
const STRIP_PROBES = `
    const S = window.__tabStrip = window.__tabStrip || {};
    const strip = get('TabStripWidget');
    const shell = get('ApplicationShell');
    const current = () => { const t = shell.mainPanel.currentTitle; return t ? t.owner : undefined; };
    const byId = id => shell.getWidgets('main').find(w => w.id === id);
    const tabEl = id => document.querySelector('.pb-tab-strip .pb-tab[data-pb-tab="' + CSS.escape(id) + '"]');
    const stripIds = () => Array.from(document.querySelectorAll('.pb-tab-strip .pb-tab[data-pb-tab]')).map(n => n.dataset.pbTab);
    const barIds = () => strip.primaryBar().titles.map(t => t.owner.id);
    const rect = n => { if (!n) return null; const r = n.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
    const row = () => document.querySelector('.pb-tab-strip-row');
    const openTabs = async urls => {
        for (const name of Object.keys(urls)) S[name] = (await get('WebTabOpenHandler').openUrl(urls[name])).id;
        return until(() => Object.keys(urls).every(name => tabEl(S[name])), 20000);
    };
`;

/** A probe() result, or a harness error naming the step: a page throw is never a scenario verdict. */
async function step(app, what, body) {
    const out = await probe(app, `${STRIP_PROBES}\n${body}`);
    if (out && out.error) {
        throw new Error(`${what}: ${out.error}`);
    }
    return out;
}

/** The Theia frame's BiDi browsing context id. */
async function theiaContext(app) {
    const href = await app.evaluate('location.href');
    const found = (await app.contexts()).find(c => c.url === href);
    if (!found) {
        throw new Error(`no BiDi context for the Theia frame at ${href}`);
    }
    return found.context;
}

/** Trusted pointer input (BiDi) on `context`; `release: false` keeps the buttons pressed for a mid-gesture read. */
async function pointer(app, context, actions, { release = true } = {}) {
    await app.send('input.performActions', {
        context,
        actions: [{ type: 'pointer', id: 'pb-strip-mouse', parameters: { pointerType: 'mouse' }, actions }],
    });
    if (release) {
        await app.send('input.releaseActions', { context });
    }
}

const moveTo = (x, y) => ({ type: 'pointerMove', x: Math.round(x), y: Math.round(y) });
const pointerAt = (...args) => pointer(...args);

/** keyboard-menu: WR-04's keyboard origin for the tab menu, Enter/Space activation, and a right-click at the pointer. */
async function keyboardMenu({ app, pages, expect, plant }) {
    const real = process.env.PB_REAL_INPUT === '1';
    const setup = await step(app, 'keyboard-menu: setup', `
        await get('ModeService').activateMode('browsing');
        const painted = await openTabs(${JSON.stringify({ a: pages.url('/a'), b: pages.url('/b'), c: pages.url('/c') })});
        shell.activateWidget(S.c);
        await until(() => current() && current().id === S.c, 5000);
        if (${JSON.stringify(plant)} === 'keyboard-menu-pointer-origin') {
            // The fault: the keyboard-origin test inverted, so a keyboard-raised contextmenu is read as a pointer one.
            const open = strip.openTabMenu.bind(strip);
            strip.openTabMenu = (w, e) => open(w, new Proxy(e, { get: (t, k) => k === 'button' ? 2 : k === 'clientX' ? t.clientX + 300 : k === 'clientY' ? t.clientY + 200 : typeof t[k] === 'function' ? t[k].bind(t) : t[k] }));
        }
        return { painted };
    `);
    expect(setup.painted, 'keyboard-menu: setup: /a, /b and /c are not all painted in the strip');
    const theia = await theiaContext(app);
    const ESC = { key: 'Escape', code: 'Escape', keyCode: 27 };
    const focusTab = async name => {
        expect(await focusTheiaFrame(app) === true, 'keyboard-menu: NOT SCORED -- chrome focus could not be put on the Theia frame');
        return step(app, `keyboard-menu: focus ${name}`, `
            const el = tabEl(S.${name});
            strip.tabStop = byId(S.${name});
            strip.update();
            el.focus();
            return document.activeElement === el;
        `);
    };
    const closeMenu = async () => {
        await pressKey(app, ESC);
        return step(app, 'keyboard-menu: close', "return until(() => !document.querySelector('.lm-Menu.pb-tab-menu'), 3000);");
    };
    const menuAt = () => step(app, 'keyboard-menu: menu read', `
        await until(() => document.querySelector('.lm-Menu.pb-tab-menu'), 3000);
        const m = document.querySelector('.lm-Menu.pb-tab-menu');
        return m ? { left: m.getBoundingClientRect().left, top: m.getBoundingClientRect().top } : null;
    `);
    // Keyboard focus, then the two context-menu keys on the focused tab.
    expect(await focusTab('a'), 'keyboard-menu: NOT SCORED -- /a\'s strip tab did not take focus');
    await pressKey(app, { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 });
    const roved = await step(app, 'keyboard-menu: rove', 'return document.activeElement === tabEl(S.b);');
    expect(roved, 'keyboard-menu: ArrowRight on /a\'s focused tab did not move keyboard focus to /b');
    const legs = [];
    for (const [name, spec] of [['Shift+F10', { key: 'F10', code: 'F10', keyCode: 121, modifiers: ['shift'] }], ['the context-menu key', { key: 'ContextMenu', code: 'ContextMenu', keyCode: 93 }]]) {
        expect(await focusTab('b'), `keyboard-menu: NOT SCORED -- /b's strip tab did not take focus before ${name}`);
        await pressKey(app, spec);
        if (!real) {
            await step(app, 'keyboard-menu: keyboard-shaped contextmenu', "document.activeElement.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 0, clientX: 0, clientY: 0 })); return true;");
        }
        const tab = await step(app, 'keyboard-menu: tab rect', 'return rect(tabEl(S.b));');
        const menu = await menuAt();
        const off = menu ? Math.max(Math.abs(menu.left - tab.left), Math.abs(menu.top - tab.bottom)) : null;
        expect(menu !== null && off <= 4,
            `keyboard-menu: keyboard tab menu opened away from the focused tab: ${name} on /b put the menu at ${JSON.stringify(menu)}, /b's bottom-left is ${Math.round(tab.left)},${Math.round(tab.bottom)}`);
        legs.push(`${name} ${off === null ? 'none' : `${Math.round(off * 10) / 10}px`}`);
        if (menu) {
            expect(await closeMenu(), `keyboard-menu: Escape did not close the menu ${name} opened`);
        }
    }
    // Enter and Space activate the focused tab.
    for (const [name, key] of [['a', { key: 'Enter', code: 'Enter', keyCode: 13 }], ['b', { key: ' ', code: 'Space', keyCode: 32 }]]) {
        expect(await focusTab(name), `keyboard-menu: NOT SCORED -- /${name}'s strip tab did not take focus`);
        await pressKey(app, key);
        const now = await step(app, `keyboard-menu: ${key.code}`, `return until(() => current() && current().id === S.${name}, 3000);`);
        expect(now, `keyboard-menu: ${key.code} on /${name}'s focused tab did not make /${name} current`);
    }
    // A right-click opens the menu at the pointer.
    const c = await step(app, 'keyboard-menu: /c rect', 'return rect(tabEl(S.c));');
    const at = { x: Math.round(c.left + 20), y: Math.round(c.y) };
    if (real) {
        await osClientPointer(app, theia, { ...at, button: 'right', action: 'click' });
    } else {
        await pointer(app, theia, [moveTo(at.x, at.y), { type: 'pointerDown', button: 2 }, { type: 'pointerUp', button: 2 }]);
    }
    const menu = await menuAt();
    const off = menu ? Math.max(Math.abs(menu.left - at.x), Math.abs(menu.top - at.y)) : null;
    expect(menu !== null && off <= 4, `keyboard-menu: a right-click at ${at.x},${at.y} on /c's tab put the menu at ${JSON.stringify(menu)}, not at the pointer`);
    if (menu) {
        expect(await closeMenu(), 'keyboard-menu: Escape did not close the right-click menu');
    }
    console.log(`  keyboard-menu: keys ${keyRoute.last}, pointer ${real ? `${pointerRoute.last} ${JSON.stringify(pointerRoute.calibration?.error)} after ${pointerRoute.calibration?.attempts} attempt(s)` : 'bidi'}; menu offsets ${legs.join(', ')}, right-click ${off === null ? 'none' : `${Math.round(off * 10) / 10}px`}`);
}

/** reorder: TAB-02 by a trusted drag in the strip. `plant` names a page fault for --self-test. */
async function reorder({ app, pages, expect, plant }) {
    const urls = { a: pages.url('/a'), b: pages.url('/b'), c: pages.url('/c') };
    const setup = await step(app, 'reorder: setup', `
        await get('ModeService').activateMode('browsing');
        const painted = await openTabs(${JSON.stringify(urls)});
        if (${JSON.stringify(plant)} === 'reorder-noop') strip.reorderTo = () => undefined;
        return { painted, a: rect(tabEl(S.a)), b: rect(tabEl(S.b)), c: rect(tabEl(S.c)) };
    `);
    expect(setup.painted, 'reorder: setup: /a, /b and /c are not all painted in the strip');
    const theia = await theiaContext(app);
    // Press /a, move past the 5px start, then rest past /b's midpoint and short of /c's.
    await pointer(app, theia, [moveTo(setup.a.x, setup.a.y), { type: 'pointerDown', button: 0 }, moveTo(setup.a.x + 10, setup.a.y),
        moveTo(setup.b.right - 4, setup.b.y)], { release: false });
    const mid = await step(app, 'reorder: mid-drag', `
        const a = tabEl(S.a), c = tabEl(S.c);
        return {
            dragging: !!a && a.classList.contains('is-dragging'),
            opacity: a ? getComputedStyle(a).opacity : null,
            indicator: !!c && c.classList.contains('is-drop-before'),
            indicatorWidth: c ? getComputedStyle(c, '::before').width : null,
        };
    `);
    await pointer(app, theia, [{ type: 'pointerUp', button: 0 }]);
    expect(mid.dragging && mid.opacity === '0.6', `reorder: the dragged /a is not dimmed to 0.6 mid-drag (${JSON.stringify(mid)})`);
    expect(mid.indicator && mid.indicatorWidth === '2px', `reorder: no 2px drop indicator before /c mid-drag (${JSON.stringify(mid)})`);

    const after = `
        const order = ids => ({ a: ids.indexOf(S.a), b: ids.indexOf(S.b) });
        const read = () => ({ strip: order(stripIds()), bar: order(barIds()) });
        const landed = r => r.strip.a > r.strip.b && r.bar.a > r.bar.b && r.strip.b >= 0 && r.bar.b >= 0;
    `;
    const dropped = await step(app, 'reorder: after the drop', `${after}
        await until(() => landed(read()), 3000);
        const dropped = read();
        shell.activateWidget(S.c);
        await until(() => current() && current().id === S.c, 5000);
        shell.activateWidget(S.a);
        await until(() => current() && current().id === S.a, 5000);
        const switched = read();
        await get('ModeService').activateMode('coding');
        await sleep(500);
        await get('ModeService').activateMode('browsing');
        await until(() => !!tabEl(S.a), 5000);
        return { dropped, switched, moded: read(), landed: [dropped, switched, read()].map(landed) };
    `);
    expect(dropped.landed[0], `reorder: after the drop, /a did not land after /b in the strip and the TabBar (${JSON.stringify(dropped.dropped)})`);
    expect(dropped.landed[1], `reorder: the order did not survive switching tabs (${JSON.stringify(dropped.switched)})`);
    expect(dropped.landed[2], `reorder: the order did not survive a Coding/Browsing round trip (${JSON.stringify(dropped.moded)})`);

    // Edge auto-scroll: narrow the strip until the row overflows, rest the drag in the right edge zone.
    const narrow = await step(app, 'reorder: narrow the strip', `
        strip.node.style.maxWidth = '280px';
        const overflowing = await until(() => row().scrollWidth > row().clientWidth, 5000);
        row().scrollLeft = 0;
        const first = stripIds()[0];
        return { overflowing, first: rect(tabEl(first)), row: rect(row()) };
    `);
    expect(narrow.overflowing, 'reorder: the narrowed strip row never overflowed, so the edge zone cannot be read');
    if (narrow.overflowing) {
        await pointer(app, theia, [moveTo(narrow.first.x, narrow.first.y), { type: 'pointerDown', button: 0 },
            moveTo(narrow.first.x + 10, narrow.first.y), moveTo(narrow.row.right - 3, narrow.first.y), { type: 'pause', duration: 700 }], { release: false });
        const scrolled = await step(app, 'reorder: edge zone', 'return { scrollLeft: row().scrollLeft };');
        await pointer(app, theia, [{ type: 'pointerUp', button: 0 }]);
        expect(scrolled.scrollLeft > 0, `reorder: resting in the right 8px edge zone did not scroll the row (scrollLeft ${scrolled.scrollLeft})`);
    }
    await step(app, 'reorder: restore the strip width', "strip.node.style.maxWidth = ''; return true;");
}

/** A copy row's text, derived from chrome-bar-copy.ts at check time; a function row's `${subject}` becomes `subject`. */
function copyRow(key, subject = '') {
    const source = readFileSync(join(REPO_ROOT, 'theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts'), 'utf8');
    const match = new RegExp(`\\b${key}: (?:'([^']+)'|\\((\\w+): string\\) => \`([^\`]+)\`)`).exec(source);
    if (!match) {
        throw new Error(`chrome-bar-copy.ts has no ${key} row, so the expected text cannot be derived`);
    }
    return match[1] ?? match[3].replace(`\${${match[2]}}`, subject);
}

/** The sentence subject the copy uses: the configured application name, else the copy's noAppName. */
async function subjectOf(app) {
    return (await app.evaluate(appNameExpr)) || copyRow('noAppName');
}

/** Chrome scope: puts `text` on the selection clipboard (the middle-click paste source); 'ok' or 'error: ...'. */
const setSelection = (app, text) => app.evaluateIn(app.chrome, `(() => {
    try {
        Cc['@mozilla.org/widget/clipboardhelper;1'].getService(Ci.nsIClipboardHelper)
            .copyStringToClipboard(${JSON.stringify(text)}, Ci.nsIClipboard.kSelectionClipboard);
        return 'ok';
    } catch (e) {
        return 'error: ' + e;
    }
})()`);

const middleClick = (x, y) => [moveTo(x, y), { type: 'pointerDown', button: 1 }, { type: 'pointerUp', button: 1 }, { type: 'pause', duration: 300 }];

/** middle: TAB-03 middle-click close with the N2 paste detectors. */
async function middle({ app, pages, expect, plant }) {
    const urls = { a: pages.url('/a'), b: pages.url('/b') };
    const setup = await step(app, 'middle: setup', `
        await get('ModeService').activateMode('browsing');
        const painted = await openTabs(${JSON.stringify(urls)});
        shell.activateWidget(S.b);
        await until(() => current() && current().id === S.b && current().isVisible, 5000);
        if (${JSON.stringify(plant)} === 'middle-not-closing') strip.onTabAuxClick = () => undefined;
        const ed = document.createElement('div');
        ed.id = 'pb-paste-frame';
        ed.contentEditable = 'true';
        // Real input (39-15): the page overlay covers the main area and the strip's gaps are chrome drag handles, so the
        // Theia-frame editable sits over /b's strip tab, Theia DOM a real pointer reaches.
        const bTab = rect(tabEl(S.b));
        Object.assign(ed.style, ${JSON.stringify(process.env.PB_REAL_INPUT === '1')}
            ? { position: 'fixed', left: bTab.left + 'px', top: bTab.top + 'px', width: (bTab.right - bTab.left) + 'px', height: (bTab.bottom - bTab.top) + 'px', zIndex: '99999', background: '#fff' }
            : { position: 'fixed', left: '40%', top: '60%', width: '200px', height: '40px', zIndex: '99999', background: '#fff' });
        document.body.appendChild(ed);
        S.framePaste = [];
        for (const type of ['input', 'paste']) ed.addEventListener(type, () => S.framePaste.push(type));
        return { painted, a: rect(tabEl(S.a)), editable: rect(ed), bTab: byId(S.b).tabId };
    `);
    expect(setup.painted, 'middle: setup: /a and /b are not both painted in the strip');
    // The recorder's own positive control: it saw /b's state push.
    expect(await waitForPush(app, push => push && push.tabId === setup.bTab) >= 0, 'middle: NOT SCORED -- the push recorder holds no push for /b, so it is not recording');
    const overlay = (await app.contexts()).find(c => c.url === urls.b)?.context;
    expect(!!overlay, `middle: NOT SCORED -- no BiDi context carries /b's page (${urls.b})`);
    if (!overlay) {
        return;
    }
    const pageEditable = JSON.parse(await app.evaluateIn(overlay, `(() => {
        const ed = document.createElement('div');
        ed.contentEditable = 'true';
        Object.assign(ed.style, { position: 'fixed', left: '20px', top: '20px', width: '200px', height: '40px', background: '#fff' });
        document.body.appendChild(ed);
        window.__pbPaste = [];
        for (const type of ['input', 'paste']) ed.addEventListener(type, () => window.__pbPaste.push(type));
        const r = ed.getBoundingClientRect();
        return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    })()`));
    const pagePaste = async () => JSON.parse(await app.evaluateIn(overlay, 'JSON.stringify(window.__pbPaste || [])'));
    const theia = await theiaContext(app);
    const real = process.env.PB_REAL_INPUT === '1';
    // 39-15: with PB_REAL_INPUT=1 every middle-click is a real OS button press, calibrated in the document it lands in.
    const pointer = real
        ? (app, context, actions) => osClientPointer(app, context, { x: actions[0].x, y: actions[0].y, button: 'middle', action: 'click' }).then(() => new Promise(r => setTimeout(r, 300)))
        : pointerAt;

    // Positive controls: a real middle-click paste into each seeded editable is caught.
    const sentinel = `pb-strip-sentinel-${Date.now()}`;
    const clip = await setSelection(app, sentinel);
    expect(clip === 'ok', `middle: NOT SCORED -- the selection clipboard could not be written (${clip})`);
    await pointer(app, theia, middleClick(setup.editable.x, setup.editable.y));
    await pointer(app, overlay, middleClick(pageEditable.x, pageEditable.y));
    const controls = await step(app, 'middle: positive controls', 'return { frame: S.framePaste.slice() };');
    const pageControl = await pagePaste();
    expect(controls.frame.length > 0, 'middle: NOT SCORED -- the Theia-frame detector caught no paste from a real middle-click into its editable');
    expect(pageControl.length > 0, 'middle: NOT SCORED -- the page-realm detector caught no paste from a real middle-click into its editable');

    // The claim: middle-click on /a's strip tab closes /a and pastes nowhere.
    await setSelection(app, sentinel);
    await app.evaluateIn(overlay, 'window.__pbPaste = []; true');
    // 34 T6 (real input): text selected in the page behind, and the page's text read before and after the tab middle-click.
    const pageText = () => app.evaluateIn(overlay, 'document.body.textContent');
    const textBefore = real ? await app.evaluateIn(overlay, 'getSelection().selectAllChildren(document.body.firstElementChild || document.body); document.body.textContent') : null;
    await step(app, 'middle: reset', "S.framePaste = []; document.getElementById('pb-paste-frame').focus(); return true;");
    await pointer(app, theia, middleClick(setup.a.x, setup.a.y));
    const closed = await step(app, 'middle: after the tab middle-click', `
        await until(() => !byId(S.a), 5000);
        return {
            closed: !byId(S.a) && !stripIds().includes(S.a) && !barIds().includes(S.a),
            frame: S.framePaste.slice(),
            current: !!current() && current().id === S.b,
        };
    `);
    const pageAfter = await pagePaste();
    expect(closed.closed, 'middle: a middle-click on /a\'s strip tab did not close /a (still in the shell, strip or TabBar)');
    if (controls.frame.length > 0 && pageControl.length > 0) {
        expect(closed.frame.length === 0, `middle: the tab middle-click pasted into the Theia frame (${closed.frame.join(', ')})`);
        expect(pageAfter.length === 0, `middle: the tab middle-click pasted into the page (${pageAfter.join(', ')})`);
    }
    expect(closed.current, 'middle: closing /a by middle-click changed the current tab away from /b');
    if (real) {
        const textAfter = await pageText();
        expect(textAfter === textBefore, `middle: with text selected in the page, the tab middle-click changed the page text (${JSON.stringify(textBefore)} -> ${JSON.stringify(textAfter)})`);
        console.log(`  middle: pointer ${pointerRoute.last} ${JSON.stringify(pointerRoute.calibration?.error)} after ${pointerRoute.calibration?.attempts} attempt(s); controls frame ${controls.frame.length} page ${pageControl.length}; page text unchanged ${textAfter === textBefore}`);
    }
}

/** double: TAB-03 double-click on the empty strip. */
async function double({ app, pages, expect, plant }) {
    const setup = await step(app, 'double: setup', `
        await get('ModeService').activateMode('browsing');
        const painted = await openTabs({ a: ${JSON.stringify(pages.url('/a'))} });
        if (${JSON.stringify(plant)} === 'double-noop') strip.onStripDoubleClick = () => undefined;
        const ids = stripIds();
        const last = rect(tabEl(ids[ids.length - 1]));
        const r = rect(row());
        return { painted, x: Math.min(last.right + 40, r.right - 12), y: r.y, tab: rect(tabEl(S.a)), tooltip: row().getAttribute('title'), count: webTabs().length };
    `);
    expect(setup.painted, 'double: setup: /a is not painted in the strip');
    expect(setup.tooltip === copyRow('emptyStripTooltip'), `double: the empty strip's tooltip is ${JSON.stringify(setup.tooltip)}`);
    const theia = await theiaContext(app);
    const real = process.env.PB_REAL_INPUT === '1';
    let frameBefore;
    if (real) {
        // 34 T1: a native double-click on the strip row, which publishDragRegions sends as a window-drag handle.
        // The strip's gaps are chrome-side drag handles over the Theia frame, so no mousemove reaches it there:
        // calibrate on /a's tab (Theia DOM) and act on the gap through the same mapping.
        const calibrateAt = { x: Math.round(setup.tab.x), y: Math.round(setup.tab.y) };
        await osClientPointer(app, theia, { x: Math.round(setup.x), y: Math.round(setup.y), calibrateAt, action: 'move' });
        frameBefore = activeWindow();
        await osClientPointer(app, theia, { x: Math.round(setup.x), y: Math.round(setup.y), calibrateAt, button: 'left', action: 'double' });
    } else {
        await pointer(app, theia, [moveTo(setup.x, setup.y), { type: 'pointerDown', button: 0 }, { type: 'pointerUp', button: 0 },
            { type: 'pointerDown', button: 0 }, { type: 'pointerUp', button: 0 }]);
    }
    const opened = await step(app, 'double: after the double-click', `
        const grew = await until(() => webTabs().length === ${setup.count} + 1, 5000);
        await until(() => document.activeElement && document.activeElement.classList.contains('pb-chrome-bar-input'), 3000);
        const now = current();
        return {
            grew,
            emptyPage: !!now && now.url === ${JSON.stringify('about:blank')} && now.id !== S.a,
            pillFocused: !!document.activeElement && document.activeElement.classList.contains('pb-chrome-bar-input'),
        };
    `);
    expect(opened.grew && opened.emptyPage, `double: a double-click on the empty strip opened no new tab on the empty page (${JSON.stringify(opened)})`);
    expect(opened.pillFocused, 'double: the new tab from the empty strip did not focus the pill');
    if (real) {
        await new Promise(r => setTimeout(r, 1000));
        const frameAfter = activeWindow();
        const geometry = w => w && `${w.x},${w.y} ${w.width}x${w.height}`;
        expect(geometry(frameAfter) === geometry(frameBefore),
            `double: the native double-click on the strip moved or resized the window (maximize toggle): ${geometry(frameBefore)} -> ${geometry(frameAfter)}`);
        console.log(`  double: pointer ${pointerRoute.last} ${JSON.stringify(pointerRoute.calibration?.error)} after ${pointerRoute.calibration?.attempts} attempt(s); window ${geometry(frameBefore)} -> ${geometry(frameAfter)}`);
    }
}

/** drop: TAB-08 link, text and refused drops on the strip. */
async function drop({ app, pages, expect, plant }) {
    const urls = { a: pages.url('/a'), b: pages.url('/b') };
    const linkUrl = pages.url('/d');
    const evil = 'javascript:document.title="pb-pwned"';
    const setup = await step(app, 'drop: setup', `
        await get('ModeService').activateMode('browsing');
        const painted = await openTabs(${JSON.stringify(urls)});
        shell.activateWidget(S.b);
        await until(() => current() && current().id === S.b, 5000);
        // The pill's drop path, recorded and not followed: a real search would leave the fixture host.
        S.searched = [];
        get('AddressBar').openDropped = async text => { S.searched.push(text); };
        if (${JSON.stringify(plant)} === 'drop-link-noop') strip.openDroppedLink = async () => undefined;
        return { painted, a: rect(tabEl(S.a)), b: rect(tabEl(S.b)) };
    `);
    expect(setup.painted, 'drop: setup: /a and /b are not both painted in the strip');
    const drops = `
        const dropAt = (x, y, data) => {
            const dt = new DataTransfer();
            for (const type of Object.keys(data)) dt.setData(type, data[type]);
            const target = document.elementFromPoint(x, y) || row();
            for (const type of ['dragenter', 'dragover', 'drop']) {
                target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: dt }));
            }
        };
        const notice = () => { const n = document.querySelector('.pb-tab-strip-notice'); return n ? n.textContent : ''; };
        const page = () => ({ count: webTabs().length, current: current() && current().id, url: byId(S.b).url, title: byId(S.b).title.label });
    `;
    const link = await step(app, 'drop: link', `${drops}
        const before = webTabs().length;
        dropAt(${Math.round(setup.a.right - 3)}, ${Math.round(setup.a.y)}, { 'text/uri-list': ${JSON.stringify(linkUrl)} });
        await until(() => webTabs().some(w => w.url === ${JSON.stringify(linkUrl)}), 5000);
        await sleep(300);
        const opened = webTabs().find(w => w.url === ${JSON.stringify(linkUrl)});
        const ids = barIds();
        return { grew: webTabs().length === before + 1, opened: !!opened, afterA: !!opened && ids.indexOf(opened.id) === ids.indexOf(S.a) + 1, current: current() && current().id === S.b };
    `);
    expect(link.grew && link.opened, `drop: an http(s) link dropped on the strip did not open /d as a new tab (${JSON.stringify(link)})`);
    expect(link.afterA, 'drop: the dropped link did not open next to the drop position (right after /a)');
    expect(link.current, 'drop: the dropped link did not open in the background (the current tab changed)');

    const text = await step(app, 'drop: text', `${drops}
        const before = page();
        dropAt(${Math.round(setup.b.x)}, ${Math.round(setup.b.y)}, { 'text/plain': 'pb strip drop words' });
        await until(() => S.searched.length > 0, 3000);
        return { searched: S.searched.slice(), same: page().count === before.count };
    `);
    expect(text.searched.length === 1 && text.searched[0] === 'pb strip drop words', `drop: text dropped on the strip did not reach the pill's drop path (${JSON.stringify(text.searched)})`);
    expect(text.same, 'drop: text dropped on the strip opened a tab');

    const sentence = copyRow('dropTabFailed', await subjectOf(app));
    for (const [label, data] of [['a javascript: link', { 'text/uri-list': evil }], ['javascript: as plain text', { 'text/plain': evil }]]) {
        const refused = await step(app, `drop: ${label}`, `${drops}
            const before = page();
            S.searched = [];
            dropAt(${Math.round(setup.b.x)}, ${Math.round(setup.b.y)}, ${JSON.stringify(data)});
            await until(() => notice() !== '', 3000);
            await sleep(500);
            const after = page();
            return { notice: notice(), same: after.count === before.count && after.url === before.url && after.current === before.current, title: after.title, searched: S.searched.length };
        `);
        expect(refused.notice === sentence, `drop: ${label} was not refused with the failure sentence (notice ${JSON.stringify(refused.notice)}, want ${JSON.stringify(sentence)})`);
        expect(refused.same && refused.title !== 'pb-pwned' && refused.searched === 0, `drop: ${label} loaded, opened or searched something (${JSON.stringify(refused)})`);
    }
}

/** overflow: TAB-04 scroll, chevron and List All Tabs. */
async function overflow({ app, pages, expect, plant }) {
    const urls = { a: pages.url('/a'), b: pages.url('/b'), c: pages.url('/c') };
    const listed = `
        const listMenu = () => document.querySelector('.lm-Menu.pb-tab-list-menu');
        const listRows = () => Array.from((listMenu() || document.createElement('div')).querySelectorAll('.lm-Menu-item'))
            .map(e => ({ label: (e.querySelector('.lm-Menu-itemLabel') || e).textContent.trim(), node: e }));
        const chevron = () => document.querySelector('.pb-tab-strip-chevron');
        const labels = () => stripIds().map(id => byId(id).title.label || id);
        const inRow = id => { const t = rect(tabEl(id)), r = rect(row()); return !!t && t.left >= r.left - 1 && t.right <= r.right + 1; };
    `;
    const forced = await step(app, 'overflow: force the overflow', `${listed}
        await get('ModeService').activateMode('browsing');
        const painted = await openTabs(${JSON.stringify(urls)});
        if (${JSON.stringify(plant)} === 'overflow-unmeasured') strip.measureOverflow = () => undefined;
        shell.activateWidget(S.a);
        await until(() => current() && current().id === S.a, 5000);
        strip.node.style.maxWidth = '300px';
        const overflowing = await until(() => row().scrollWidth > row().clientWidth, 5000);
        const shown = await until(() => !!chevron(), 3000);
        row().scrollLeft = 0;
        await sleep(100);
        const hidden = stripIds().find(id => !inRow(id));
        return { painted, overflowing, shown, tooltip: shown ? chevron().getAttribute('title') : null, hidden: hidden || null,
            scrollWidth: row().scrollWidth, clientWidth: row().clientWidth, chevronRect: shown ? rect(chevron()) : null };
    `);
    console.log(`${NAME}: overflow: row scrollWidth ${forced.scrollWidth} clientWidth ${forced.clientWidth}; chevron ${JSON.stringify(forced.chevronRect)}`);
    expect(forced.painted, 'overflow: setup: /a, /b and /c are not all painted in the strip');
    expect(forced.overflowing, 'overflow: NOT SCORED -- the narrowed strip row never overflowed');
    expect(forced.shown, 'overflow: the overflowing strip shows no List All Tabs chevron');
    expect(!forced.shown || forced.tooltip === copyRow('listAllTabs'), `overflow: the chevron's tooltip is ${JSON.stringify(forced.tooltip)}`);
    expect(!!forced.hidden, 'overflow: NOT SCORED -- every tab is in view, so picking one cannot show scrollIntoView');
    if (forced.shown && forced.hidden) {
        const picked = await step(app, 'overflow: List All Tabs', `${listed}
            chevron().click();
            await until(() => listRows().length > 0, 3000);
            const rows = listRows().map(r => r.label);
            const order = labels();
            const target = listRows().find(r => r.label === (byId(${JSON.stringify(forced.hidden)}).title.label || ${JSON.stringify(forced.hidden)}));
            if (target) {
                const r = target.node.getBoundingClientRect();
                const at = { bubbles: true, cancelable: true, button: 0, clientX: r.left + 4, clientY: r.top + r.height / 2 };
                target.node.dispatchEvent(new MouseEvent('mousemove', at));
                target.node.dispatchEvent(new MouseEvent('mouseup', at));
            }
            await until(() => current() && current().id === ${JSON.stringify(forced.hidden)} && inRow(${JSON.stringify(forced.hidden)}), 5000);
            return { rows, order, found: !!target, activated: !!current() && current().id === ${JSON.stringify(forced.hidden)}, inView: inRow(${JSON.stringify(forced.hidden)}),
                tab: rect(tabEl(${JSON.stringify(forced.hidden)})), row: rect(row()) };
        `);
        expect(picked.rows.length > 0 && picked.rows.join(' | ') === picked.order.join(' | '),
            `overflow: List All Tabs lists [${picked.rows.join(' | ')}], not the strip order [${picked.order.join(' | ')}]`);
        expect(picked.found && picked.activated, `overflow: picking the scrolled-out tab in List All Tabs did not activate it (${JSON.stringify(picked)})`);
        expect(picked.inView, 'overflow: the picked tab was not scrolled into view in the row');
        console.log(`${NAME}: overflow: picked tab ${JSON.stringify(picked.tab)} inside row ${JSON.stringify(picked.row)}`);
        // 34 T8: chrome's drag handles after a scroll overlap no visible tab and equal the frontend's fresh publish.
        const handles = async () => JSON.parse(await app.evaluateIn(app.chrome,
            "JSON.stringify([...document.querySelectorAll('.powerbrowser-drag')].map(h => [h.style.left, h.style.top, h.style.width, h.style.height].map(parseFloat)))"));
        const scrolled = await step(app, 'overflow: scroll the row', `${listed}
            row().scrollLeft = 0;
            await sleep(300);
            row().scrollLeft = row().scrollWidth;
            await sleep(600);
            const r = rect(row());
            const tabs = stripIds().map(id => rect(tabEl(id))).filter(Boolean)
                .map(t => ({ left: Math.max(t.left, r.left), right: Math.min(t.right, r.right), top: t.top, bottom: t.bottom })).filter(t => t.right - t.left > 1);
            return { scrollLeft: row().scrollLeft, tabs };
        `);
        const natural = await handles();
        await step(app, 'overflow: fresh drag-region publish', `
            const bar = get('ChromeBarContribution');
            if (!bar || typeof bar.publishDragRegions !== 'function') return { error: 'no ChromeBarContribution.publishDragRegions to compare against' };
            bar.lastDragRegions = '';
            bar.publishDragRegions();
            await sleep(400);
            return true;
        `);
        const fresh = await handles();
        const overlapping = natural.filter(([x, y, w, h]) => scrolled.tabs.some(t => x < t.right - 1 && x + w > t.left + 1 && y < t.bottom - 1 && y + h > t.top + 1));
        console.log(`${NAME}: overflow: after scrollLeft ${scrolled.scrollLeft}, ${natural.length} drag handle(s) ${JSON.stringify(natural)}; fresh publish ${JSON.stringify(fresh)}`);
        expect(natural.length > 0, 'overflow: NOT SCORED -- chrome holds no window-drag handles, so their staleness cannot be read');
        expect(overlapping.length === 0, `overflow: a window-drag handle overlaps a visible tab after the row scrolled: ${JSON.stringify(overlapping)}`);
        expect(JSON.stringify(natural) === JSON.stringify(fresh), `overflow: the window-drag handles after a scroll ${JSON.stringify(natural)} are stale against a fresh publish ${JSON.stringify(fresh)}`);
    }
    // Control, same session and recorders: no overflow, no chevron, and the order still reads.
    const control = await step(app, 'overflow: restore the width', `${listed}
        strip.node.style.maxWidth = '';
        await until(() => row().scrollWidth <= row().clientWidth, 5000);
        await until(() => !chevron(), 3000);
        return { overflowing: row().scrollWidth > row().clientWidth, chevron: !!chevron(), strip: stripIds(), bar: barIds(), ours: ['a', 'b', 'c'].every(n => stripIds().includes(S[n])) };
    `);
    expect(!control.overflowing, 'overflow: NOT SCORED -- the full-width strip still overflows, so the chevron-absent control proves nothing');
    expect(!control.chevron, 'overflow: the full-width strip still shows the List All Tabs chevron without overflow');
    // The fresh profile's welcome tab shares the strip, so the count is not 3: /a, /b and /c must all read.
    expect(control.ours && control.strip.every(id => control.bar.includes(id)), `overflow: the control session read no strip order (${JSON.stringify(control)})`);
}

/**
 * pin-restore: TAB-05 across the app's own quit and a relaunch on the same profile (two launches, so the scenario
 * runs its own shells). /b and a second tab on /b's URL (/b2) prove that duplicates pin independently; pinning /b
 * then /a proves the pinned order is kept. The plant stubs the strip's pin writer in the running page.
 */
async function pinRestore({ pages, expect, plant, profileName }) {
    const profile = newProfile(`tab-strip-${profileName}`);
    const urls = { a: pages.url('/a'), b: pages.url('/b'), b2: pages.url('/b') };
    // -purgecaches in its environment form: chrome-side shell scripts must run as built (pb-live-probe.mjs).
    process.env.MOZ_PURGE_CACHES = '1';
    const first = await withShellQuit(profile, ({ run }) => run(`
        ${PROBES}
        await strip().pinRestore;
        await A.get('ModeService').activateMode('browsing');
        const urls = ${JSON.stringify(urls)};
        for (const name of Object.keys(urls)) S[name] = await A.open(urls[name]);
        await settle(() => ['a', 'b', 'b2'].every(n => /^page /.test(labelOf(S[n]))));
        A.shell().activateWidget(S.a.id);
        await settle(() => current() === S.a && !!tabNode(S.b));
        if (${JSON.stringify(plant)} === 'pin-not-stored') strip().savePins = async () => undefined;
        // tabNode finds a tab by its title, which /b and /b2 share; the strip's own node lookup tells them apart.
        const pin = async w => {
            const node = strip().tabNode(w);
            const r = node.getBoundingClientRect();
            node.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: r.left + 8, clientY: r.top + 8 }));
            await settle(() => menuRows().length > 0);
            await choose('Pin Tab');
            await settle(() => strip().isPinned(w));
        };
        await pin(S.b);
        await pin(S.a);
        await A.sleep(1000);
        const keyOf = w => strip().groups.keyOf(w);
        const stored = await A.get('ProfileStorageService').readPinnedIds();
        const order = strip().stripTabs(current()).map(w => w.id);
        const node = strip().tabNode(S.b);
        return {
            pinnedB: strip().isPinned(S.b), pinnedA: strip().isPinned(S.a), pinnedB2: strip().isPinned(S.b2),
            keys: { a: keyOf(S.a), b: keyOf(S.b), b2: keyOf(S.b2) }, rowKeys: { a: S.a.rowKey, b: S.b.rowKey },
            stored, lead: order.slice(0, 2).join(',') === [S.b.id, S.a.id].join(','),
            width: node ? Math.round(node.getBoundingClientRect().width) : 0,
        };
    `));
    expect(first.pinnedB && first.pinnedA, `pin-restore: Pin Tab did not pin /b and /a (b ${first.pinnedB}, a ${first.pinnedA})`);
    expect(first.keys.b !== first.keys.b2 && !first.pinnedB2, `pin-restore: /b2, on /b's URL, did not stay unpinned under its own key (keys ${JSON.stringify(first.keys)}, b2 pinned ${first.pinnedB2})`);
    expect(first.lead, 'pin-restore: the pinned tabs /b, /a do not lead the strip in pin order');
    expect(first.width === 32, `pin-restore: the pinned tab is ${first.width}px wide, want 32`);
    expect(first.keys.b === first.rowKeys.b && first.keys.a === first.rowKeys.a, `pin-restore: a pinned web tab's keyOf key is not its rowKey (${JSON.stringify(first)})`);
    expect(first.stored.map(entry => entry.key).join(',') === [first.keys.b, first.keys.a].join(','),
        `pin-restore: the shell-state map holds [${first.stored.map(entry => entry.key)}], want the keyOf keys of /b, /a in pin order`);
    const second = await withShell(profile, ({ run }) => run(`
        ${PROBES}
        await strip().pinRestore;
        const keys = ${JSON.stringify(first.keys)};
        const find = key => A.mainWidgets().find(w => strip().groups.keyOf(w) === key);
        const tabs = { a: find(keys.a), b: find(keys.b), b2: find(keys.b2) };
        const order = strip().stripTabs(current()).map(w => w.id);
        const read = t => (t ? { rowKey: t.rowKey, pinned: strip().isPinned(t) } : null);
        return { a: read(tabs.a), b: read(tabs.b), b2: read(tabs.b2), lead: !!tabs.a && !!tabs.b && order.slice(0, 2).join(',') === [tabs.b.id, tabs.a.id].join(',') };
    `));
    for (const name of ['b', 'a']) {
        const tab = second[name];
        expect(!!tab, `pin-restore: after the relaunch no tab carries /${name}'s stored key ${first.keys[name]}`);
        expect(!tab || tab.rowKey === first.keys[name], `pin-restore: the reopened /${name}'s rowKey ${tab?.rowKey} is not the stored key ${first.keys[name]} (W1 continuity)`);
        expect(!!tab?.pinned, `pin-restore: /${name} was not pinned after the relaunch`);
    }
    expect(second.lead, 'pin-restore: the restored pins do not lead the strip in their stored order /b, /a');
    expect(!second.b2 || !second.b2.pinned, 'pin-restore: /b2, never pinned, came back pinned (a URL-keyed restore)');
}

/**
 * multi: TAB-06 selection gestures and bulk delegation (ng-a-live shell). Spies record every command the strip runs
 * and every web-tab request, each with the tab it names. The plant widens the running strip's bulk delegation to
 * every shown tab, so the bulk rows reach /a and /c.
 */
async function multi({ run, pages, expect, plant }) {
    const urls = { a: pages.url('/a'), b: pages.url('/b'), c: pages.url('/c'), d: pages.url('/d') };
    const MULTI = `
        const click = (w, mods) => {
            const node = tabNode(w);
            if (!node) throw new Error('no strip tab for ' + labelOf(w));
            const r = node.getBoundingClientRect();
            node.dispatchEvent(new MouseEvent('click', Object.assign({ bubbles: true, cancelable: true, button: 0, clientX: r.left + 8, clientY: r.top + 8 }, mods || {})));
        };
        const selected = () => ['a', 'b', 'c', 'd'].filter(n => S[n] && !S[n].isDisposed && tabNode(S[n]) && tabNode(S[n]).classList.contains('is-selected'));
        const commandSpy = () => {
            const registry = A.get('CommandRegistry');
            if (!S.ran) {
                S.ran = [];
                const original = registry.executeCommand.bind(registry);
                registry.executeCommand = (id, ...args) => { S.ran.push({ id, tab: args[0] && args[0].id }); return original(id, ...args); };
            }
            return S.ran;
        };
        const nameOf = id => ['a', 'b', 'c', 'd'].find(n => S[n] && S[n].id === id) || id;
    `;
    const setup = await run(`
        ${PROBES}${MULTI}
        await A.get('ModeService').activateMode('browsing');
        const urls = ${JSON.stringify(urls)};
        for (const name of Object.keys(urls)) S[name] = await A.open(urls[name]);
        await settle(() => ['a', 'b', 'c', 'd'].every(n => /^page /.test(labelOf(S[n]))));
        A.shell().activateWidget(S.a.id);
        await settle(() => current() === S.a && ['a', 'b', 'c', 'd'].every(n => !!tabNode(S[n])));
        if (${JSON.stringify(plant)} === 'multi-touches-unselected') {
            const each = strip().runOnEach.bind(strip());
            strip().runOnEach = (tabs, id) => each(strip().shownTabs(), id);
        }
        click(S.b, { ctrlKey: true });
        click(S.d, { ctrlKey: true });
        await settle(() => selected().length === 2);
        const toggled = selected();
        const stillCurrent = current() === S.a;
        click(S.b, { shiftKey: true });
        await settle(() => selected().length === 3);
        const ranged = selected();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await settle(() => selected().length === 0);
        const escaped = selected();
        click(S.b, { ctrlKey: true });
        await settle(() => selected().length === 1);
        click(S.c);
        // The is-selected class repaints a frame after the strip's state; current() turns true at once.
        await settle(() => current() === S.c && selected().length === 0);
        return { toggled, stillCurrent, ranged, escaped, plainCleared: selected().length === 0, plainActivated: current() === S.c };
    `);
    expect(setup.toggled.join(',') === 'b,d', `multi: Ctrl-click /b and /d selected [${setup.toggled}], want b,d`);
    expect(setup.stillCurrent, 'multi: a Ctrl-click changed the current tab away from /a');
    expect(setup.ranged.join(',') === 'b,c,d', `multi: Shift-click /b from the /d anchor selected [${setup.ranged}], want b,c,d`);
    expect(setup.escaped.length === 0, `multi: Esc left [${setup.escaped}] selected`);
    expect(setup.plainCleared && setup.plainActivated, `multi: a plain click did not clear the selection and activate /c (${JSON.stringify(setup)})`);

    const bulk = await run(`
        ${PROBES}${MULTI}
        const ran = commandSpy();
        const sent = spy();
        const store = A.get('ChromeStoreClient');
        const bookmarked = [];
        if (strip().bookmarkTabs) {
            const original = strip().bookmarkTabs;
            strip().bookmarkTabs = tabs => { bookmarked.push(tabs.map(t => nameOf(t.id))); return original(tabs); };
        }
        A.shell().activateWidget(S.a.id);
        await settle(() => current() === S.a);
        click(S.b, { ctrlKey: true });
        click(S.d, { ctrlKey: true });
        await settle(() => selected().length === 2);
        const rows = (await openMenu(S.b)).map(r => ({ label: r.label, enabled: r.enabled }));
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        if (menuNode()) menuNode().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
        await settle(() => !menuNode());
        // Esc cleared the selection along with the menu; select again for each bulk row. Always: the painted
        // is-selected class lags the strip's state by a frame, so it can still read b,d once Esc has cleared it.
        const reselect = async () => {
            strip().clearSelection();
            click(S.b, { ctrlKey: true });
            click(S.d, { ctrlKey: true });
            await settle(() => selected().join(',') === 'b,d');
        };
        const act = async label => {
            await reselect();
            const from = ran.length, sentFrom = sent.length;
            await openMenu(S.b);
            await choose(label);
            await A.sleep(750);
            return { ran: ran.slice(from).map(r => ({ id: r.id, tab: nameOf(r.tab) })), sent: sent.slice(sentFrom).map(m => ({ kind: m.kind, tab: ['a', 'b', 'c', 'd'].find(n => S[n] && S[n].tabId === m.tabId) || m.tabId })) };
        };
        const moved = await act('Move 2 Tabs to Start');
        const order = strip().shownTabs().map(w => nameOf(w.id));
        // Phase 32's mute is offered for a tab that plays sound; mark /b and /d as playing so the row is enabled.
        S.b.soundPlaying = true; S.d.soundPlaying = true;
        const muted = await act('Mute 2 Tabs');
        let bookmark = { skipped: typeof store.bookmarkPage !== 'function' };
        if (!bookmark.skipped) bookmark = Object.assign(await act('Bookmark 2 Tabs'), { calls: bookmarked });
        const closed = await act('Close 2 Tabs');
        await settle(() => S.b.isDisposed && S.d.isDisposed);
        return {
            rows, moved, order, muted, bookmark, closed,
            bookmarkPresent: typeof store.bookmarkPage === 'function',
            open: ['a', 'b', 'c', 'd'].filter(n => !S[n].isDisposed), selection: strip().selectedIds.size,
        };
    `);
    const row = label => bulk.rows.find(r => r.label === label);
    for (const label of ['Close 2 Tabs', 'Move 2 Tabs to Start', 'Move 2 Tabs to End', 'Mute 2 Tabs', 'Bookmark 2 Tabs']) {
        expect(!!row(label), `multi: /b's menu with /b and /d selected has no "${label}" row (rows: ${bulk.rows.map(r => r.label).join(' | ')})`);
    }
    expect(row('Bookmark 2 Tabs')?.enabled === bulk.bookmarkPresent, `multi: Bookmark 2 Tabs enabled ${row('Bookmark 2 Tabs')?.enabled}, want ${bulk.bookmarkPresent} (Phase 33 bookmarkPage present)`);
    const only = (label, list, field, value) => {
        const hits = list.filter(entry => entry[field] === value);
        expect(hits.length > 0, `multi: ${label} ran no ${value} at all`);
        const strays = hits.filter(entry => entry.tab !== 'b' && entry.tab !== 'd');
        expect(strays.length === 0, `multi: ${label} touched an unselected tab (${strays.map(entry => entry.tab).join(', ')})`);
        expect(['b', 'd'].every(n => hits.some(entry => entry.tab === n)), `multi: ${label} did not reach both /b and /d (${hits.map(entry => entry.tab).join(', ')})`);
    };
    only('Move 2 Tabs to Start', bulk.moved.ran, 'id', 'powerbrowser.chrome-bar.tab-move-start');
    // The fresh profile's welcome tab shares the strip: /b, /d lead it, and /a, /c keep their order after them.
    expect(bulk.order.slice(0, 2).join(',') === 'b,d' && bulk.order.filter(n => n === 'a' || n === 'c').join(',') === 'a,c',
        `multi: after Move 2 Tabs to Start the strip reads [${bulk.order}], want b,d first and then a,c`);
    only('Mute 2 Tabs', bulk.muted.ran, 'id', 'powerbrowser.chrome-bar.tab-mute');
    only('Mute 2 Tabs (webTabMute)', bulk.muted.sent, 'kind', 'webTabMute');
    if (!bulk.bookmark.skipped) {
        const calls = bulk.bookmark.calls;
        expect(calls.length === 2 && calls.every(call => call.length === 1), `multi: Bookmark 2 Tabs did not call bookmarkTabs once per tab (${JSON.stringify(calls)})`);
        const strays = calls.flat().filter(n => n !== 'b' && n !== 'd');
        expect(strays.length === 0, `multi: Bookmark 2 Tabs touched an unselected tab (${strays.join(', ')})`);
    }
    only('Close 2 Tabs', bulk.closed.ran, 'id', 'powerbrowser.chrome-bar.tab-close');
    expect(bulk.open.join(',') === 'a,c', `multi: after Close 2 Tabs the open tabs are [${bulk.open}], want a,c (an unselected tab was touched or a selected one survived)`);
    expect(bulk.selection === 0, `multi: the selection still holds ${bulk.selection} key(s) after every selected tab closed`);
}

/** preview: TAB-07 dwell, settled image and text fallback, below-tab anchor, occlusion, active-tab suppression. */
async function preview({ app, pages, expect, plant }) {
    const card = `
        const cardEl = () => document.querySelector('.pb-tab-preview');
        const cardRead = () => { const c = cardEl(); if (!c) return null; const img = c.querySelector('img.pb-tab-preview-image');
            return { top: c.getBoundingClientRect().top, image: img ? img.getAttribute('src') : null, shimmer: !!c.querySelector('.is-shimmer'),
                title: (c.querySelector('.pb-tab-preview-title') || {}).textContent || null, url: (c.querySelector('.pb-tab-preview-url') || {}).textContent || null,
                hidden: c.getAttribute('aria-hidden') }; };
    `;
    const setup = await step(app, 'preview: setup', `${card}
        await get('ModeService').activateMode('browsing');
        const painted = await openTabs(${JSON.stringify({ a: pages.url('/a'), b: pages.url('/b') })});
        if (${JSON.stringify(plant)} === 'preview-never-opens') strip.openPreview = () => undefined;
        shell.activateWidget(S.b);
        await until(() => current() && current().id === S.b, 5000);
        const groups = get('GroupModel');
        // /a was hidden after its load settled, so GUI-08 captured it; the strip reads it from the reloaded cards.
        const settledImage = await until(async () => { await groups.scheduleReload(); return typeof strip.previewImage(byId(S.a)) === 'string'; }, 30000);
        return { painted, settledImage, a: rect(tabEl(S.a)), b: rect(tabEl(S.b)), aLabel: byId(S.a).title.label, aUrl: byId(S.a).url, bTab: byId(S.b).tabId };
    `);
    expect(setup.painted, 'preview: setup: /a and /b are not painted in the strip');
    expect(setup.settledImage, 'preview: NOT SCORED -- /a never got a settled GUI-08 thumbnail, so the image card cannot be read');
    expect(await overlayVisibility(app, setup.bTab) === 'visible', 'preview: NOT SCORED -- /b\'s overlay is not visible before the hover, so the occlusion read proves nothing');
    const theia = await theiaContext(app);
    const hoverAt = Date.now();
    await pointer(app, theia, [moveTo(setup.a.x, setup.a.y)], { release: false });
    const opened = await step(app, 'preview: dwell on /a', `${card}
        const t0 = Date.now();
        await until(() => !!cardEl(), 3000);
        return { card: cardRead(), waited: Date.now() - t0 };
    `);
    const dwell = Date.now() - hoverAt;
    expect(!!opened.card, 'preview: hovering /a opened no preview card');
    if (opened.card) {
        expect(dwell >= 380, `preview: the card opened ${dwell} ms after the hover, before the 400 ms dwell`);
        expect(opened.card.top >= setup.a.bottom + 3 && opened.card.top <= setup.a.bottom + 5, `preview: the card's top ${opened.card.top} is not 4px below /a's bottom ${setup.a.bottom}`);
        expect(typeof opened.card.image === 'string' && opened.card.image.startsWith('data:image/'), 'preview: the card for /a carries no settled thumbnail image');
        expect(opened.card.title === setup.aLabel && opened.card.url === setup.aUrl, `preview: the card reads ${JSON.stringify([opened.card.title, opened.card.url])}, not /a's title and URL`);
        expect(opened.card.hidden === 'true', 'preview: the card is not aria-hidden');
        expect(await overlayVisibility(app, setup.bTab) === 'hidden', 'preview: chrome\'s overlay of /b is still visible behind the open card (not a blocking layer)');
    }
    await pointer(app, theia, [moveTo(4, 4), { type: 'pause', duration: 300 }]);
    const closed = await step(app, 'preview: pointer leaves /a', `${card} return { gone: await until(() => !cardEl(), 3000) };`);
    expect(closed.gone, 'preview: the card stayed open after the pointer left /a');
    expect(await overlayVisibility(app, setup.bTab) === 'visible', 'preview: /b\'s overlay did not come back after the card closed');

    // Text fallback: a new tab on the empty page is never captured.
    const blank = await step(app, 'preview: an empty-page tab', `
        await get('CommandRegistry').executeCommand('powerbrowser.chrome-bar.new-tab');
        await until(() => current() && current().id !== S.b && current().url === 'about:blank', 5000);
        S.blank = current().id;
        shell.activateWidget(S.b);
        await until(() => current() && current().id === S.b, 5000);
        await sleep(200);
        return { at: rect(tabEl(S.blank)), label: byId(S.blank).title.label };
    `);
    await pointer(app, theia, [moveTo(blank.at.x, blank.at.y)], { release: false });
    const text = await step(app, 'preview: dwell on the empty-page tab', `${card}
        await until(() => !!cardEl() && !cardEl().querySelector('.is-shimmer'), 5000);
        return { card: cardRead() };
    `);
    expect(!!text.card && text.card.image === null && !text.card.shimmer && text.card.title === blank.label,
        `preview: the empty-page tab's card is not the text card (title, no image): ${JSON.stringify(text.card)}`);
    await pointer(app, theia, [moveTo(4, 4), { type: 'pause', duration: 300 }]);

    // Active tab: twice the dwell on /b, then a positive overlay read.
    await pointer(app, theia, [moveTo(setup.b.x, setup.b.y), { type: 'pause', duration: 800 }], { release: false });
    const active = await step(app, 'preview: dwell on the current tab', `${card} return { current: current() && current().id === S.b, card: !!cardEl() };`);
    const bShown = await overlayVisibility(app, setup.bTab);
    expect(active.current && bShown === 'visible', `preview: NOT SCORED -- /b is not current with its overlay visible (${bShown})`);
    expect(!active.card, 'preview: hovering the current tab opened a preview card over its visible page');
    await pointer(app, theia, [moveTo(4, 4)]);
}

/** The BiDi context of the one top-level page on `url` (an overlay); a harness error otherwise. */
async function pageContext(app, url) {
    const found = (await app.contexts()).filter(c => c.url === url);
    if (found.length !== 1) {
        throw new Error(`expected one top-level browsing context on ${url}, saw ${found.length}`);
    }
    return found[0].context;
}

/** attention: TAB-09 chrome-minted titleChanged, clear on activation, never page-settable. */
async function attention({ app, pages, expect, plant }) {
    const marks = `
        const dotOf = id => { const t = tabEl(id); return !!t && !!t.querySelector('.pb-tab-attention'); };
        const read = id => { const t = tabEl(id); return { dot: dotOf(id), flag: byId(id).titleChanged, tip: t ? t.getAttribute('title') : null,
            name: t ? t.getAttribute('aria-label') : null, label: byId(id).title.label }; };
    `;
    const setup = await step(app, 'attention: setup', `${marks}
        await get('ModeService').activateMode('browsing');
        const painted = await openTabs(${JSON.stringify({ a: pages.url('/a'), b: pages.url('/b') })});
        if (${JSON.stringify(plant)} === 'attention-flag-dropped') {
            const a = byId(S.a), apply = a.applyState.bind(a);
            a.applyState = state => apply({ ...state, titleChanged: false });
        }
        shell.activateWidget(S.b);
        await until(() => current() && current().id === S.b, 5000);
        const settled = await until(() => !byId(S.a).loading && !byId(S.b).loading && !byId(S.a).titleChanged, 10000);
        return { painted, settled, aUrl: byId(S.a).url, bUrl: byId(S.b).url, aTab: byId(S.a).tabId };
    `);
    expect(setup.painted && setup.settled, `attention: setup: /a and /b are not painted and settled (${JSON.stringify(setup)})`);
    const pageA = await pageContext(app, setup.aUrl);
    const pageB = await pageContext(app, setup.bUrl);
    await app.evaluateIn(pageA, "(() => { document.title = 'Attention A'; return true; })()");
    const marked = await step(app, 'attention: /a retitled in the background', `${marks}
        await until(() => dotOf(S.a) && byId(S.a).title.label === 'Attention A', 10000);
        return read(S.a);
    `);
    expect(marked.dot && marked.flag, `attention: /a showed no attention dot after its title changed in the background (${JSON.stringify(marked)})`);
    expect(marked.tip === copyRow('updatedTabTooltip', marked.label), `attention: /a's tooltip is ${JSON.stringify(marked.tip)}, not the Updated addition`);
    expect(marked.name === copyRow('updatedTabLabel', marked.label), `attention: /a's accessible name is ${JSON.stringify(marked.name)}`);
    await app.evaluateIn(pageB, "(() => { document.title = 'Attention B'; return true; })()");
    const own = await step(app, 'attention: the current /b retitled', `${marks}
        const seen = await until(() => byId(S.b).title.label === 'Attention B', 10000);
        return { seen, b: read(S.b) };
    `);
    expect(own.seen, 'attention: NOT SCORED -- /b\'s new title never reached the strip');
    expect(!own.b.dot && !own.b.flag, 'attention: a title change in the current tab marked it');
    const cleared = await step(app, 'attention: activate /a, then /b again', `${marks}
        shell.activateWidget(S.a);
        await until(() => current() && current().id === S.a, 5000);
        // The strip repaints a frame after the activation that current() already reads.
        const hidden = await until(() => !dotOf(S.a), 3000);
        const flagCleared = await until(() => byId(S.a).titleChanged === false, 5000);
        shell.activateWidget(S.b);
        await until(() => current() && current().id === S.b, 5000);
        await sleep(500);
        return { hidden, flagCleared, after: read(S.a) };
    `);
    expect(cleared.hidden && cleared.flagCleared, `attention: activating /a did not clear its attention mark (${JSON.stringify(cleared)})`);
    expect(!cleared.after.dot && !cleared.after.flag, 'attention: the attention dot survived activation (/a is marked again in the background)');
    const spoof = `(() => {
        const detail = { kind: 'state', tabId: ${JSON.stringify(setup.aTab)}, titleChanged: true };
        window.titleChanged = true;
        window.dispatchEvent(new CustomEvent('PowerBrowserWebTabState', { detail }));
        document.dispatchEvent(new CustomEvent('PowerBrowserWebTabState', { detail }));
        return true;
    })()`;
    await app.evaluateIn(pageA, spoof);
    await app.evaluateIn(pageB, spoof);
    const spoofed = await step(app, 'attention: page-side writes', `${marks} await sleep(1000); return read(S.a);`);
    expect(!spoofed.dot && !spoofed.flag, 'attention: a page-side titleChanged write marked /a (the flag must be chrome-minted only)');
}

/** A served URL on localhost: another site than 127.0.0.1, so one session holds distinct hosts (the shared-process defect). */
const otherSite = (pages, path) => pages.url(path).replace('//127.0.0.1:', '//localhost:');

/** The tab menu inside a probe() page: open it on a strip tab, read its rows, choose one, close it. No backticks inside. */
const MENU_PROBES = `
    const menuNode = () => document.querySelector('.lm-Menu.pb-tab-menu');
    const menuRows = () => Array.from((menuNode() || document.createElement('div')).querySelectorAll('.lm-Menu-item')).map(e => ({
        label: (e.querySelector('.lm-Menu-itemLabel') || e).textContent.trim(), enabled: !e.classList.contains('lm-mod-disabled'), node: e }));
    const openMenu = async id => {
        const node = tabEl(id);
        if (!node) throw new Error('no strip tab for ' + id);
        const r = node.getBoundingClientRect();
        node.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: r.left + 8, clientY: r.top + 8 }));
        await until(() => menuRows().length > 0, 3000);
        return menuRows().map(x => ({ label: x.label, enabled: x.enabled }));
    };
    const closeMenu = async () => {
        if (menuNode()) menuNode().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
        await until(() => !menuNode(), 3000);
    };
    const choose = async label => {
        const found = menuRows().find(x => x.label === label);
        if (!found) throw new Error('the tab menu has no row ' + label);
        const r = found.node.getBoundingClientRect();
        const at = { bubbles: true, cancelable: true, button: 0, clientX: r.left + 4, clientY: r.top + r.height / 2 };
        found.node.dispatchEvent(new MouseEvent('mousemove', at));
        found.node.dispatchEvent(new MouseEvent('mouseup', at));
        await until(() => !menuNode(), 3000);
    };
    const notice = () => { const n = document.querySelector('.pb-tab-strip-notice'); return n ? n.textContent : ''; };
`;

/**
 * bookmark-all: BMK-07 through Phase 33's bookmarkPage (the one bookmarkTabs callback the chrome bar hands the strip).
 * While that client method is absent the row must read disabled and the scenario is NOT SCORED, never a pass.
 */
async function bookmarkAll({ app, pages, expect, plant }) {
    const urls = { a: pages.url('/a'), b: otherSite(pages, '/b'), c: pages.url('/c') };
    const names = Object.keys(urls);
    const allLabel = copyRow('bookmarkAll');
    const setup = await step(app, 'bookmark-all: setup', `
        await get('ModeService').activateMode('browsing');
        const painted = await openTabs(${JSON.stringify(urls)});
        const named = await until(() => ${JSON.stringify(names)}.every(n => /^page /.test(byId(S[n]).title.label)), 15000);
        shell.activateWidget(S.c);
        await until(() => current() && current().id === S.c, 5000);
        const store = get('ChromeStoreClient');
        if (${JSON.stringify(plant)} === 'bookmark-all-drops-tab' && typeof strip.bookmarkTabs === 'function') {
            const original = strip.bookmarkTabs;
            strip.bookmarkTabs = tabs => original(tabs.slice(0, -1));
        }
        if (${JSON.stringify(plant)} === 'bookmark-failure-silent' && typeof strip.bookmarkTabs === 'function') {
            const original = strip.bookmarkTabs;
            strip.bookmarkTabs = async tabs => { try { await original(tabs); } catch (e) { /* the planted fault: swallowed */ } };
        }
        const tabs = {};
        for (const n of ${JSON.stringify(names)}) {
            const w = byId(S[n]);
            tabs[n] = { url: w.url, label: w.title.label, before: await store.readBookmarkByUrl(w.url) };
        }
        return { painted, named: !!named, current: !!current() && current().id === S.c,
            present: typeof store.bookmarkPage === 'function', wired: typeof strip.bookmarkTabs === 'function', tabs };
    `);
    expect(setup.painted && setup.named && setup.current, `bookmark-all: setup: /a, /b (localhost) and /c are not painted and named with /c current (${JSON.stringify(setup)})`);
    expect(setup.wired === setup.present,
        `bookmark-all: the strip's bookmarkTabs callback is ${setup.wired ? 'set' : 'unset'} while Phase 33's ChromeStoreClient.bookmarkPage is ${setup.present ? 'present' : 'absent'}`);
    const rows = await step(app, 'bookmark-all: /a\'s menu', `${MENU_PROBES} const rows = await openMenu(S.a); await closeMenu(); return rows;`);
    const all = rows.find(r => r.label === allLabel);
    expect(!!all, `bookmark-all: /a's menu has no "${allLabel}" row (rows: ${rows.map(r => r.label).join(' | ')})`);
    expect(all?.enabled === setup.present, `bookmark-all: "${allLabel}" enabled ${all?.enabled}, want ${setup.present} (Phase 33 bookmarkPage ${setup.present ? 'present' : 'absent'})`);
    if (!setup.present) {
        expect(false, `bookmark-all: NOT SCORED -- Phase 33's ChromeStoreClient.bookmarkPage is absent from this build, so "${allLabel}" is disabled and no tab's bookmark can be read back`);
        return;
    }
    const stale = names.filter(n => setup.tabs[n].before !== null);
    expect(stale.length === 0, `bookmark-all: NOT SCORED -- ${stale.map(n => '/' + n).join(', ')} already bookmarked on a fresh profile, so a read-back proves nothing`);

    // 34 T4: Bookmark Tab bookmarks /c alone, so Bookmark All Tabs below repeats /c.
    const tabLabel = copyRow('bookmark');
    const single = await step(app, 'bookmark-all: Bookmark Tab on /c', `${MENU_PROBES}
        await openMenu(S.c);
        await choose(${JSON.stringify(tabLabel)});
        const store = get('ChromeStoreClient');
        await until(async () => !!(await store.readBookmarkByUrl(byId(S.c).url)), 10000);
        return { c: await store.readBookmarkByUrl(byId(S.c).url), a: await store.readBookmarkByUrl(byId(S.a).url) };
    `);
    expect(!!single.c && single.c.url === setup.tabs.c.url && single.c.title === setup.tabs.c.label,
        `bookmark-all: "${tabLabel}" on /c did not bookmark it with its title and URL (${JSON.stringify(single.c)})`);
    expect(single.a === null, `bookmark-all: "${tabLabel}" on /c also bookmarked /a (${JSON.stringify(single.a)})`);

    const done = await step(app, 'bookmark-all: choose the row', `${MENU_PROBES}
        await openMenu(S.a);
        await choose(${JSON.stringify(allLabel)});
        const store = get('ChromeStoreClient');
        const urls = ${JSON.stringify(names)}.map(n => byId(S[n]).url);
        const read = () => Promise.all(urls.map(u => store.readBookmarkByUrl(u)));
        await until(async () => (await read()).every(Boolean), 10000);
        return { after: await read(), notice: notice(), current: !!current() && current().id === S.c };
    `);
    names.forEach((n, i) => {
        const got = done.after[i];
        expect(!!got, `bookmark-all: /${n} (${new URL(setup.tabs[n].url).hostname}) was not bookmarked by "${allLabel}" (readBookmarkByUrl returned null)`);
        if (got) {
            expect(got.url === setup.tabs[n].url && got.title === setup.tabs[n].label,
                `bookmark-all: /${n}'s bookmark reads ${JSON.stringify([got.title, got.url])}, not its title and URL ${JSON.stringify([setup.tabs[n].label, setup.tabs[n].url])}`);
        }
    });
    expect(done.notice === '', `bookmark-all: a successful "${allLabel}" showed the strip notice ${JSON.stringify(done.notice)}`);
    expect(done.current, `bookmark-all: "${allLabel}" changed the current tab away from /c`);

    // IN-02: a repeat leaves exactly one Places bookmark per URL (/c through Bookmark All Tabs, /a through Bookmark Tab).
    const placesCount = url => app.evaluateIn(app.chrome, `(async () => {
        const { PlacesUtils } = ChromeUtils.importESModule('resource://gre/modules/PlacesUtils.sys.mjs');
        let n = 0;
        await PlacesUtils.bookmarks.fetch({ url: ${JSON.stringify(url)} }, () => { n += 1; });
        return n;
    })()`);
    await step(app, 'bookmark-all: Bookmark Tab on /a again', `${MENU_PROBES}
        await openMenu(S.a);
        await choose(${JSON.stringify(tabLabel)});
        await sleep(1500);
        return true;
    `);
    if (plant === 'bookmark-repeat-duplicates') {
        await app.evaluateIn(app.chrome, `(async () => {
            const { PlacesUtils } = ChromeUtils.importESModule('resource://gre/modules/PlacesUtils.sys.mjs');
            await PlacesUtils.bookmarks.insert({ parentGuid: PlacesUtils.bookmarks.unfiledGuid, url: ${JSON.stringify(setup.tabs.a.url)}, title: 'planted' });
            return true;
        })()`);
    }
    const counts = { a: await placesCount(setup.tabs.a.url), c: await placesCount(setup.tabs.c.url) };
    console.log(`${NAME}: bookmark-all: Places bookmarks after the repeats: /a ${counts.a}, /c ${counts.c}`);
    for (const n of ['a', 'c']) {
        expect(counts[n] === 1, `bookmark-all: a repeated bookmark created a second entry: /${n} has ${counts[n]} Places bookmarks for its URL`);
    }

    // Failure copy: bookmarkPage refusing must show the strip's bookmark failure sentence, naming the application.
    const appName = await app.evaluate(appNameExpr);
    const sentence = copyRow('bookmarkTabFailed', await subjectOf(app));
    expect(!!appName && sentence.includes(appName), `bookmark-all: the failure sentence ${JSON.stringify(sentence)} does not name the application (${JSON.stringify(appName)})`);
    const refused = await step(app, 'bookmark-all: a refused bookmarkPage', `${MENU_PROBES}
        const store = get('ChromeStoreClient');
        const original = store.bookmarkPage;
        store.bookmarkPage = async () => { throw new Error('refused by the check'); };
        try {
            await openMenu(S.b);
            await choose(${JSON.stringify(allLabel)});
            await until(() => notice() !== '', 3000);
        } finally {
            store.bookmarkPage = original;
        }
        return { notice: notice() };
    `);
    expect(refused.notice !== '', 'bookmark-all: a failed bookmark was silent: a refused bookmarkPage showed no strip notice');
    expect(refused.notice === '' || refused.notice === sentence,
        `bookmark-all: a refused bookmarkPage was not reported with the failure sentence (notice ${JSON.stringify(refused.notice)}, want ${JSON.stringify(sentence)})`);
}

/**
 * The strip's visibility contract per mode, derived at check time from the one expression ChromeBarContribution hands
 * tabStrip.setHidden(...). A harness error when that call is missing, repeated or not one modeId comparison.
 */
function stripHiddenContract() {
    const source = readFileSync(join(REPO_ROOT, 'theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx'), 'utf8');
    const found = [...source.matchAll(/this\.tabStrip\.setHidden\(([^;]+)\);/g)].map(m => m[1].trim());
    const parsed = found.length === 1 ? /^modeId\s*(!==|===)\s*'([\w-]+)'$/.exec(found[0]) : null;
    if (!parsed) {
        throw new Error(`chrome-bar-widget.tsx: expected one tabStrip.setHidden(modeId !==|=== '<mode>') call, found ${JSON.stringify(found)}`);
    }
    const [, op, mode] = parsed;
    return { expr: found[0], hidden: id => (op === '!==' ? id !== mode : id === mode) };
}

/** modes: D-02, one strip (the same TabStripWidget and stripTabs reader) in Coding, Organising and Browsing; order survives. */
async function modes({ app, pages, expect, plant }) {
    const contract = stripHiddenContract();
    const urls = { a: pages.url('/a'), b: otherSite(pages, '/b'), c: pages.url('/c') };
    const names = JSON.stringify(Object.keys(urls));
    const reads = `
        const ours = ids => ids.map(id => ${names}.find(n => S[n] === id)).filter(Boolean);
        const read = () => {
            const box = strip.node.getBoundingClientRect();
            return {
                mode: document.body.getAttribute('data-pb-mode'),
                nodes: document.querySelectorAll('.pb-tab-strip').length,
                same: strip === S.modesStrip && strip.node.isConnected,
                hidden: strip.isHidden,
                width: box.width, height: box.height,
                reader: ours(strip.shownTabs().map(w => w.id)),
                bar: ours(barIds()),
                dom: ours(stripIds()),
            };
        };
    `;
    const setup = await step(app, 'modes: setup', `${reads}
        await get('ModeService').activateMode('browsing');
        const painted = await openTabs(${JSON.stringify(urls)});
        S.modesStrip = strip;
        if (${JSON.stringify(plant)} === 'modes-order-lost') {
            const service = get('ModeService'), activate = service.activateMode.bind(service);
            service.activateMode = async id => {
                const out = await activate(id);
                const bar = strip.primaryBar(), moved = bar && bar.titles.find(t => t.owner.id === S.a);
                if (moved) bar.insertTab(bar.titles.length - 1, moved);
                return out;
            };
        }
        await sleep(300);
        return { painted, base: read() };
    `);
    const order = setup.base.reader.join(',');
    expect(setup.painted && setup.base.reader.length === 3, `modes: setup: /a, /b (localhost) and /c are not all in the strip's reader (${JSON.stringify(setup.base)})`);
    expect(!contract.hidden('browsing') && !setup.base.hidden && setup.base.height > 0, `modes: NOT SCORED -- the strip is not painted in Browsing before any switch (${JSON.stringify(setup.base)})`);
    expect(setup.base.dom.join(',') === order && setup.base.bar.join(',') === order,
        `modes: setup: the painted strip [${setup.base.dom}] and the TabBar [${setup.base.bar}] do not read the reader's order [${order}]`);
    for (const mode of ['coding', 'organising', 'browsing']) {
        const seen = await step(app, `modes: switch to ${mode}`, `${reads}
            await get('ModeService').activateMode(${JSON.stringify(mode)});
            const switched = await until(() => document.body.getAttribute('data-pb-mode') === ${JSON.stringify(mode)}, 5000);
            await sleep(400);
            return Object.assign({ switched: !!switched }, read());
        `);
        expect(seen.switched, `modes: NOT SCORED -- the shell never entered ${mode} (data-pb-mode reads ${seen.mode})`);
        expect(seen.nodes === 1 && seen.same, `modes: in ${mode} the strip is not the one TabStripWidget (${seen.nodes} strip nodes, same instance ${seen.same}): a per-mode strip variant`);
        const hidden = contract.hidden(mode);
        expect(seen.hidden === hidden, `modes: in ${mode} the strip is ${seen.hidden ? 'hidden' : 'shown'}, but the mode contract setHidden(${contract.expr}) says ${hidden ? 'hidden' : 'shown'}`);
        expect(hidden ? seen.height === 0 : seen.height > 0 && seen.width > 0,
            `modes: in ${mode} the strip measures ${seen.width}x${seen.height}, want ${hidden ? 'zero height (hidden by the contract)' : 'a painted row'}`);
        expect(seen.reader.join(',') === order && seen.bar.join(',') === order,
            `modes: the strip order did not survive the switch to ${mode} (reader [${seen.reader}], TabBar [${seen.bar}], want [${order}])`);
        if (!hidden) {
            expect(seen.dom.join(',') === order, `modes: in ${mode} the painted strip reads [${seen.dom}], not its reader's order [${order}]`);
        }
    }
}

/**
 * badge-capture (34 T14, capture only): a pinned /a marked as playing sound, /b current, /c and /d selected, the pointer
 * resting on /c, captured for the owner. soundPlaying is set on the widget by the harness (the fixture pages are silent).
 */
async function badgeCapture({ app, pages, expect }) {
    expect(!!CAPTURE_DIR, 'badge-capture: run it with PB_CAPTURE_DIR set (capture only)');
    if (!CAPTURE_DIR) {
        return;
    }
    const urls = { a: pages.url('/a'), b: otherSite(pages, '/b'), c: pages.url('/c'), d: otherSite(pages, '/d') };
    const set = await step(app, 'badge-capture: setup', `${MENU_PROBES}
        await get('ModeService').activateMode('browsing');
        const painted = await openTabs(${JSON.stringify(urls)});
        shell.activateWidget(S.b);
        await until(() => current() && current().id === S.b, 5000);
        await openMenu(S.a);
        await choose('Pin Tab');
        await until(() => strip.isPinned(byId(S.a)), 5000);
        byId(S.a).soundPlaying = true;
        byId(S.a).update();
        strip.update();
        const click = (id, mods) => { const n = tabEl(id), r = n.getBoundingClientRect();
            n.dispatchEvent(new MouseEvent('click', Object.assign({ bubbles: true, cancelable: true, button: 0, clientX: r.left + 8, clientY: r.top + 8 }, mods))); };
        click(S.c, { ctrlKey: true });
        click(S.d, { ctrlKey: true });
        await sleep(500);
        return { painted, pinned: strip.isPinned(byId(S.a)), selected: ['b', 'c', 'd'].filter(n => tabEl(S[n]).classList.contains('is-selected')), c: rect(tabEl(S.c)) };
    `);
    console.log(`${NAME}: badge-capture: ${JSON.stringify(set)}`);
    expect(set.painted && set.pinned, `badge-capture: setup failed (${JSON.stringify(set)})`);
    const theia = await theiaContext(app);
    await pointer(app, theia, [moveTo(set.c.x, set.c.y)], { release: false });
    await new Promise(r => setTimeout(r, 400));
    await capture('34-T14-badge-and-selection.png');
}

/** Each scenario and the page fault its --self-test plants, with the text its red line must carry. `probe` scenarios run on withProbeShell. */
const SCENARIOS = {
    menu: { run: menu, plant: 'menu-acts-on-current', expect: 'reloaded the current tab' },
    'keyboard-menu': { run: keyboardMenu, probe: true, plant: 'keyboard-menu-pointer-origin', expect: 'keyboard tab menu opened away from the focused tab' },
    reorder: { run: reorder, probe: true, plant: 'reorder-noop', expect: 'did not land after /b' },
    middle: { run: middle, probe: true, prefs: { 'middlemouse.paste': true }, plant: 'middle-not-closing', expect: 'did not close /a' },
    double: { run: double, probe: true, plant: 'double-noop', expect: 'opened no new tab' },
    drop: { run: drop, probe: true, plant: 'drop-link-noop', expect: 'did not open /d' },
    overflow: { run: overflow, probe: true, plant: 'overflow-unmeasured', expect: 'shows no List All Tabs chevron' },
    'pin-restore': { run: pinRestore, own: true, plant: 'pin-not-stored', expect: 'was not pinned after the relaunch' },
    multi: { run: multi, plant: 'multi-touches-unselected', expect: 'touched an unselected tab' },
    preview: { run: preview, probe: true, plant: 'preview-never-opens', expect: 'opened no preview card' },
    attention: { run: attention, probe: true, plant: 'attention-flag-dropped', expect: 'showed no attention dot' },
    'bookmark-all': { run: bookmarkAll, probe: true, plants: [
        { plant: 'bookmark-all-drops-tab', expect: 'was not bookmarked' },
        { plant: 'bookmark-repeat-duplicates', expect: 'a repeated bookmark created a second entry' },
        { plant: 'bookmark-failure-silent', expect: 'a failed bookmark was silent' },
    ] },
    modes: { run: modes, probe: true, plant: 'modes-order-lost', expect: 'did not survive the switch' },
    'badge-capture': { run: badgeCapture, probe: true, captureOnly: true },
};

/** One fresh shell for one scenario run: withProbeShell (and its prefs) for a `probe` scenario, else ng-a-live's. */
function launch(scenario, profileName, context) {
    if (scenario.own) {
        return scenario.run({ ...context, profileName });
    }
    return scenario.probe
        ? withProbeShell(app => scenario.run({ app, ...context }), { extraPrefs: scenario.prefs ?? {} })
        : withShell(newProfile(`tab-strip-${profileName}`), ({ run }) => scenario.run({ run, ...context }));
}

const args = process.argv.slice(2);
const selfTest = args.includes('--self-test');
const at = args.indexOf('--scenario');
const chosen = at >= 0 ? (args[at + 1] ?? '').split(',').filter(Boolean) : Object.keys(SCENARIOS).filter(name => !SCENARIOS[name].captureOnly);
const unknown = chosen.filter(name => !SCENARIOS[name]);
if (unknown.length || chosen.length === 0) {
    console.error(`verify-${NAME}: unknown scenario(s) ${unknown.join(', ') || '(none given)'}; known: ${Object.keys(SCENARIOS).join(', ')}`);
    process.exit(2);
}

await runCheck(`verify-${NAME}${selfTest ? ' --self-test' : ''}`, async ({ pages, expect, failures }) => {
    for (const name of chosen) {
        const scenario = SCENARIOS[name];
        await launch(scenario, name, { pages, expect });
        if (!selfTest || failures.length || scenario.captureOnly) {
            if (!failures.length) {
                console.log(`${NAME}: ${name}: PASS`);
            }
            continue;
        }
        // The unplanted run above is the positive control; each planted run must go red naming its fault.
        for (const { plant, expect: want } of scenario.plants ?? [{ plant: scenario.plant, expect: scenario.expect }]) {
            const planted = [];
            const plantedExpect = (ok, message) => { if (!ok) planted.push(message); };
            await launch(scenario, `${name}-${plant}`, { pages, expect: plantedExpect, plant });
            expect(planted.some(line => line.includes(want)),
                `${name}: plant ${plant} did not go red naming "${want}" (got ${planted.length ? planted.join(' | ') : 'green'})`);
            if (!failures.length) {
                console.log(`${NAME}: ${name}: plant ${plant} went red: ${planted.find(line => line.includes(want))}`);
            }
        }
    }
});
