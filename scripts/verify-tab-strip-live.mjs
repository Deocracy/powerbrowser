#!/usr/bin/env node
// scripts/verify-tab-strip-live.mjs -- Phase 34 (TAB-01..TAB-09, BMK-07): the
// tab strip on the built binary, one scenario per behaviour. Plan 34-01 lands
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
// The 34-02 scenarios run on pb-live-probe.mjs's withProbeShell (purged
// startup cache, the push recorder, chrome scope for the clipboard); `menu`
// keeps the ng-a-live shell it was written on.
//
// Positive page-side assertions only, never the absence of a log line. One
// host, at most four same-site tabs per session (the shared-process defect).
//
// --self-test plants one fault per scenario in the running page (the object
// that runs, not this file) and requires the scenario to go red naming it,
// after an unplanted run of the same scenario went green.
//
// Usage:
//   node scripts/verify-tab-strip-live.mjs [--scenario menu,reorder,middle,double,drop,overflow[,..]] [--self-test]
//
// Full tier only: the built binary, a fresh Theia build, a headless browser.

import { newProfile, runCheck, withShell } from './lib/ng-a-live.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './lib/ng-a-live.mjs';
import { appNameExpr, probe, waitForPush, withProbeShell } from './lib/pb-live-probe.mjs';

const NAME = 'tab-strip-live';

// Shared page helpers. No backticks inside.
const PROBES = `
    const S = window.__tabStrip = window.__tabStrip || {};
    const strip = () => A.get('TabStripWidget');
    const labelOf = w => w.title.label || w.id;
    const current = () => { const t = A.shell().mainPanel.currentTitle; return t ? t.owner : undefined; };
    const settle = async (test, n) => { for (let i = 0; i < (n || 40) && !test(); i++) await A.sleep(125); return !!test(); };
    const tabNode = w => Array.from(document.querySelectorAll('.pb-tab-strip .pb-tab:not(.pb-tab-stack)')).find(e => e.getAttribute('title') === labelOf(w));
    const menuNode = () => document.querySelector('.lm-Menu.pb-tab-menu');
    const menuRows = () => Array.from((menuNode() || document.createElement('div')).querySelectorAll('.lm-Menu-item')).map(e => ({
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
    const match = new RegExp(`\\b${key}: (?:'([^']+)'|\\(subject: string\\) => \`([^\`]+)\`)`).exec(source);
    if (!match) {
        throw new Error(`chrome-bar-copy.ts has no ${key} row, so the expected text cannot be derived`);
    }
    return match[1] ?? match[2].replace('${subject}', subject);
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
        Object.assign(ed.style, { position: 'fixed', left: '40%', top: '60%', width: '200px', height: '40px', zIndex: '99999', background: '#fff' });
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
        return { painted, x: Math.min(last.right + 40, r.right - 12), y: r.y, tooltip: row().getAttribute('title'), count: webTabs().length };
    `);
    expect(setup.painted, 'double: setup: /a is not painted in the strip');
    expect(setup.tooltip === copyRow('emptyStripTooltip'), `double: the empty strip's tooltip is ${JSON.stringify(setup.tooltip)}`);
    const theia = await theiaContext(app);
    await pointer(app, theia, [moveTo(setup.x, setup.y), { type: 'pointerDown', button: 0 }, { type: 'pointerUp', button: 0 },
        { type: 'pointerDown', button: 0 }, { type: 'pointerUp', button: 0 }]);
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
        return { painted, overflowing, shown, tooltip: shown ? chevron().getAttribute('title') : null, hidden: hidden || null };
    `);
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
            return { rows, order, found: !!target, activated: !!current() && current().id === ${JSON.stringify(forced.hidden)}, inView: inRow(${JSON.stringify(forced.hidden)}) };
        `);
        expect(picked.rows.length > 0 && picked.rows.join(' | ') === picked.order.join(' | '),
            `overflow: List All Tabs lists [${picked.rows.join(' | ')}], not the strip order [${picked.order.join(' | ')}]`);
        expect(picked.found && picked.activated, `overflow: picking the scrolled-out tab in List All Tabs did not activate it (${JSON.stringify(picked)})`);
        expect(picked.inView, 'overflow: the picked tab was not scrolled into view in the row');
    }
    // Control, same session and recorders: no overflow, no chevron, and the order still reads.
    const control = await step(app, 'overflow: restore the width', `${listed}
        strip.node.style.maxWidth = '';
        await until(() => row().scrollWidth <= row().clientWidth, 5000);
        await until(() => !chevron(), 3000);
        return { overflowing: row().scrollWidth > row().clientWidth, chevron: !!chevron(), strip: stripIds(), bar: barIds() };
    `);
    expect(!control.overflowing, 'overflow: NOT SCORED -- the full-width strip still overflows, so the chevron-absent control proves nothing');
    expect(!control.chevron, 'overflow: the full-width strip still shows the List All Tabs chevron without overflow');
    expect(control.strip.length === 3 && control.strip.every(id => control.bar.includes(id)), `overflow: the control session read no strip order (${JSON.stringify(control)})`);
}

/** Each scenario and the page fault its --self-test plants, with the text its red line must carry. `probe` scenarios run on withProbeShell. */
const SCENARIOS = {
    menu: { run: menu, plant: 'menu-acts-on-current', expect: 'reloaded the current tab' },
    reorder: { run: reorder, probe: true, plant: 'reorder-noop', expect: 'did not land after /b' },
    middle: { run: middle, probe: true, prefs: { 'middlemouse.paste': true }, plant: 'middle-not-closing', expect: 'did not close /a' },
    double: { run: double, probe: true, plant: 'double-noop', expect: 'opened no new tab' },
    drop: { run: drop, probe: true, plant: 'drop-link-noop', expect: 'did not open /d' },
    overflow: { run: overflow, probe: true, plant: 'overflow-unmeasured', expect: 'shows no List All Tabs chevron' },
};

/** One fresh shell for one scenario run: withProbeShell (and its prefs) for a `probe` scenario, else ng-a-live's. */
function launch(scenario, profileName, context) {
    return scenario.probe
        ? withProbeShell(app => scenario.run({ app, ...context }), { extraPrefs: scenario.prefs ?? {} })
        : withShell(newProfile(`tab-strip-${profileName}`), ({ run }) => scenario.run({ run, ...context }));
}

const args = process.argv.slice(2);
const selfTest = args.includes('--self-test');
const at = args.indexOf('--scenario');
const chosen = at >= 0 ? (args[at + 1] ?? '').split(',').filter(Boolean) : Object.keys(SCENARIOS);
const unknown = chosen.filter(name => !SCENARIOS[name]);
if (unknown.length || chosen.length === 0) {
    console.error(`verify-${NAME}: unknown scenario(s) ${unknown.join(', ') || '(none given)'}; known: ${Object.keys(SCENARIOS).join(', ')}`);
    process.exit(2);
}

await runCheck(`verify-${NAME}${selfTest ? ' --self-test' : ''}`, async ({ pages, expect, failures }) => {
    for (const name of chosen) {
        const scenario = SCENARIOS[name];
        await launch(scenario, name, { pages, expect });
        if (!selfTest || failures.length) {
            if (!failures.length) {
                console.log(`${NAME}: ${name}: PASS`);
            }
            continue;
        }
        // The unplanted run above is the positive control; the planted run must go red naming the fault.
        const planted = [];
        const plantedExpect = (ok, message) => { if (!ok) planted.push(message); };
        await launch(scenario, `${name}-plant`, { pages, expect: plantedExpect, plant: scenario.plant });
        expect(planted.some(line => line.includes(scenario.expect)),
            `${name}: plant ${scenario.plant} did not go red naming "${scenario.expect}" (got ${planted.length ? planted.join(' | ') : 'green'})`);
        if (!failures.length) {
            console.log(`${NAME}: ${name}: plant ${scenario.plant} went red: ${planted.find(line => line.includes(scenario.expect))}`);
        }
    }
});
