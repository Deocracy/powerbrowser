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
// Positive page-side assertions only, never the absence of a log line. One
// host, at most four same-site tabs per session (the shared-process defect).
//
// --self-test plants one fault per scenario in the running page (the object
// that runs, not this file) and requires the scenario to go red naming it,
// after an unplanted run of the same scenario went green.
//
// Usage:
//   node scripts/verify-tab-strip-live.mjs [--scenario menu[,..]] [--self-test]
//
// Full tier only: the built binary, a fresh Theia build, a headless browser.

import { newProfile, runCheck, withShell } from './lib/ng-a-live.mjs';

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

/** Each scenario and the page fault its --self-test plants, with the text its red line must carry. */
const SCENARIOS = {
    menu: { run: menu, plant: 'menu-acts-on-current', expect: 'reloaded the current tab' },
};

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
        await withShell(newProfile(`tab-strip-${name}`), ({ run }) => scenario.run({ run, pages, expect }));
        if (!selfTest || failures.length) {
            if (!failures.length) {
                console.log(`${NAME}: ${name}: PASS`);
            }
            continue;
        }
        // The unplanted run above is the positive control; the planted run must go red naming the fault.
        const planted = [];
        const plantedExpect = (ok, message) => { if (!ok) planted.push(message); };
        await withShell(newProfile(`tab-strip-${name}-plant`), ({ run }) => scenario.run({ run, pages, expect: plantedExpect, plant: scenario.plant }));
        expect(planted.some(line => line.includes(scenario.expect)),
            `${name}: plant ${scenario.plant} did not go red naming "${scenario.expect}" (got ${planted.length ? planted.join(' | ') : 'green'})`);
        if (!failures.length) {
            console.log(`${NAME}: ${name}: plant ${scenario.plant} went red: ${planted.find(line => line.includes(scenario.expect))}`);
        }
    }
});
