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
//   node scripts/verify-tab-strip-live.mjs [--scenario menu,reorder[,..]] [--self-test]
//
// Full tier only: the built binary, a fresh Theia build, a headless browser.

import { newProfile, runCheck, withShell } from './lib/ng-a-live.mjs';
import { probe, withProbeShell } from './lib/pb-live-probe.mjs';

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

/** Each scenario and the page fault its --self-test plants, with the text its red line must carry. `probe` scenarios run on withProbeShell. */
const SCENARIOS = {
    menu: { run: menu, plant: 'menu-acts-on-current', expect: 'reloaded the current tab' },
    reorder: { run: reorder, probe: true, plant: 'reorder-noop', expect: 'did not land after /b' },
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
