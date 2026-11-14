#!/usr/bin/env node
// scripts/verify-pan03-strip-group-live.mjs -- PAN-03 (Phase 22): in Browsing
// the tab strip paints the active group's tabs, the loose tabs and the
// current tab, in dock order, and "+" opens a tab inside the active group.
// It proves, on the built binary:
//   (a) with no group, "+" opens a loose tab and the strip paints every home tab;
//   (b) with groups A and B, a loose tab and A active, the strip paints exactly
//       the set derived from GroupModel's membership reads, and B's tab is absent;
//   (c) activating B's tab paints it as the current tab, and A stays active;
//   (d) "+" with A active writes a tabs.sqlite row whose group_id is A's, and
//       the strip keeps painting it once it is no longer current;
//   (e) in Coding every main-area tab's dock-bar tab is displayed (D2);
//   (f) after a real quit and relaunch, before Organising ever opens, the
//       model is loaded, A is active and the strip is filtered.
//
// The expected strip is derived from membership reads (getTabs, listUngrouped,
// the current tab), never from showsInStrip, the predicate under test.
//
// Full tier only: the built binary, a Theia build and a headless browser.
// Like the other ng-a-live rows it has no --self-test. In-run probe controls
// stand in for one: each plants a page fault (showsInStrip stubbed to true,
// joinActiveGroup stubbed to a no-op) and requires the probe that passed to go
// red, so every probe is shown able to fail.

import { newProfile, runCheck, show, tabsOf, waitUntil, withShell, withShellQuit } from './lib/ng-a-live.mjs';

const NAME = 'pan03-strip-group-live';
const NEW_TAB = 'powerbrowser.chrome-bar.new-tab';

// Shared by the real assertions and the probe controls. No backticks inside.
const PROBES = `
    const S = window.__pan03 = window.__pan03 || {};
    // A DI singleton inside the chrome bar, not a shell-area widget, so getWidgetById cannot see it.
    const strip = () => A.get('TabStripWidget');
    const labelOf = w => w.title.label || w.id;
    const current = () => { const t = A.shell().mainPanel.currentTitle; return t ? t.owner : undefined; };
    const keyOf = w => A.model().keyOf(w);
    const byKey = k => A.mainWidgets().find(w => keyOf(w) === k);
    const painted = () => Array.from(document.querySelectorAll('.pb-tab-strip .pb-tab:not(.pb-tab-stack)')).map(e => e.getAttribute('title'));
    // The home pane's strip tabs, unfiltered: what the strip would paint with no group.
    const home = () => strip().mainTabs();
    // The expected strip, from membership reads only.
    const derived = () => {
        const m = A.model();
        const active = m.getActiveGroupId();
        const cur = current();
        const members = new Set(active ? m.getTabs(active).map(t => t.uri) : []);
        const loose = new Set(m.listUngrouped().map(t => t.uri));
        return home().filter(w => w === cur || members.has(keyOf(w)) || loose.has(keyOf(w))).map(labelOf);
    };
    const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
    const settle = async (test, n) => { for (let i = 0; i < (n || 40) && !test(); i++) await A.sleep(125); return !!test(); };
    const stripMatches = async () => {
        const ok = await settle(() => same(painted(), derived()));
        return { ok, painted: painted(), derived: derived() };
    };
    const newTab = async () => {
        const before = A.webTabs();
        await A.get('CommandRegistry').executeCommand('${NEW_TAB}');
        const opened = A.webTabs().filter(w => !before.includes(w));
        if (opened.length !== 1) throw new Error('the New Tab command opened ' + opened.length + ' web tab(s), want 1');
        return opened[0];
    };
`;

await runCheck(`verify-${NAME}`, async ({ pages, expect, failures }) => {
    const detail = line => console.log(`${NAME}: ${line}`);
    const profile = newProfile('pan03');
    const urls = { a: pages.url('/a'), b: pages.url('/b'), c: pages.url('/c'), l: pages.url('/l') };
    const rowOf = key => tabsOf(profile).find(r => r.uri === key);
    // The join probe, shared with its control: the row carries the group within 10 s.
    const joined = (key, groupId) => waitUntil(() => rowOf(key)?.group_id === groupId, 10000);

    const first = await withShellQuit(profile, async ({ run }) => {
        // (a) no group: "+" is loose and the strip paints every home tab.
        const a = await run(`
            ${PROBES}
            await A.get('ModeService').activateMode('browsing');
            const loaded = await settle(() => A.model().isLoaded, 160);
            const groups = A.model().listGroups().length;
            const w = await newTab();
            const key = keyOf(w);
            const loose = await settle(() => A.model().listUngrouped().some(t => t.uri === key));
            const all = await settle(() => same(painted(), home().map(labelOf)));
            return { loaded, groups, key, loose, all, painted: painted(), home: home().map(labelOf) };
        `);
        if (a.groups !== 0) {
            failures.push(`(a) a fresh profile starts with ${a.groups} group(s), want 0`);
            return undefined;
        }
        expect(a.loaded, '(a) the group model never loaded in Browsing');
        expect(a.loose, `(a) the New Tab ${a.key} is not loose in the model with no group`);
        expect(a.all, `(a) with no group the strip paints [${a.painted.join(' | ')}], want every home tab [${a.home.join(' | ')}]`);
        const aRow = await waitUntil(() => rowOf(a.key), 10000);
        expect(aRow && aRow.group_id == null, `(a) the New Tab's row is ${aRow ? show([aRow]) : 'missing'}, want group_id null`);
        detail(`(a) no group: "+" opened ${a.key}, loose in the model and its row (group_id ${aRow ? aRow.group_id : 'no row'}); the strip paints all ${a.home.length} home tabs`);

        // (b) groups A (/a, /b) and B (/c), /l loose, A active, /a current.
        const opened = await run(`
            ${PROBES}
            const urls = ${JSON.stringify(urls)};
            for (const name of Object.keys(urls)) S[name] = await A.open(urls[name]);
            const labels = () => Object.keys(urls).map(n => labelOf(S[n]));
            await settle(() => new Set(labels()).size === 4 && labels().every(l => /^page /.test(l)));
            return { keys: Object.fromEntries(Object.keys(urls).map(n => [n, keyOf(S[n])])), labels: labels() };
        `);
        if (new Set(opened.labels).size !== 4) {
            failures.push(`(b) setup: the four test tabs do not have distinct labels: [${opened.labels.join(' | ')}]`);
            return undefined;
        }
        const keys = opened.keys;
        const rows = await waitUntil(() => Object.values(keys).every(k => rowOf(k)), 15000);
        if (!rows) {
            failures.push(`(b) setup: not every test tab has a row within 15 s: ${show(tabsOf(profile))}`);
            return undefined;
        }
        const b = await run(`
            ${PROBES}
            const keys = ${JSON.stringify(keys)};
            const m = A.model();
            await settle(() => Object.values(keys).every(k => m.listUngrouped().some(t => t.uri === k)));
            const ga = await m.createGroup(A.actor(), { x: 40, y: 40 });
            await m.moveCard(A.actor(), keys.a, ga.id);
            await m.moveCard(A.actor(), keys.b, ga.id);
            const gb = await m.createGroup(A.actor(), { x: 420, y: 40 });
            await m.moveCard(A.actor(), keys.c, gb.id);
            await m.setActiveGroup(A.actor(), ga.id);
            A.shell().activateWidget(S.a.id);
            S.ga = ga.id; S.gb = gb.id;
            const match = await stripMatches();
            return {
                ga: ga.id, gb: gb.id,
                active: m.getActiveGroupId(),
                membersA: m.getTabs(ga.id).map(t => t.uri),
                membersB: m.getTabs(gb.id).map(t => t.uri),
                match,
                labelC: labelOf(S.c), labelL: labelOf(S.l),
                home: home().map(labelOf),
            };
        `);
        expect(b.active === b.ga, `(b) group A ${b.ga} is not active (active ${b.active})`);
        expect(b.membersA.includes(keys.a) && b.membersA.includes(keys.b) && b.membersB.includes(keys.c),
            `(b) setup: membership did not land: A [${b.membersA.join(', ')}], B [${b.membersB.join(', ')}]`);
        expect(b.match.ok, `(b) the strip paints [${b.match.painted.join(' | ')}], want the derived set [${b.match.derived.join(' | ')}]`);
        expect(!b.match.painted.includes(b.labelC), `(b) group B's tab "${b.labelC}" is painted while A is active`);
        expect(b.match.painted.includes(b.labelL), `(b) the loose tab "${b.labelL}" is not painted`);
        detail(`(b) A active, /a current: the strip paints [${b.match.painted.join(' | ')}] = the derived set, of ${b.home.length} home tabs; B's "${b.labelC}" absent`);

        // (c) activating B's tab paints it as the current tab; A stays active.
        const c = await run(`
            ${PROBES}
            A.shell().activateWidget(S.c.id);
            const shown = await settle(() => painted().includes(labelOf(S.c)));
            const match = await stripMatches();
            return { shown, active: A.model().getActiveGroupId(), current: current() === S.c, match };
        `);
        expect(c.current, '(c) activating B\'s tab through the shell did not make it current');
        expect(c.shown, '(c) B\'s tab is not painted while it is the current tab (A5)');
        expect(c.active === b.ga, `(c) activating B's tab changed the active group to ${c.active}, want A ${b.ga}`);
        expect(c.match.ok, `(c) the strip paints [${c.match.painted.join(' | ')}], want the derived set [${c.match.derived.join(' | ')}]`);
        detail(`(c) B's tab current: painted as the current tab, A still active; strip [${c.match.painted.join(' | ')}]`);

        // (d) "+" with A active joins A: no sleep between the open and the join.
        const d = await run(`
            ${PROBES}
            A.shell().activateWidget(S.a.id);
            const w = await newTab();
            S.d = w;
            return { key: keyOf(w), label: labelOf(w) };
        `);
        const dRow = await joined(d.key, b.ga);
        expect(dRow, `(d) the "+" tab's row did not carry group A ${b.ga} within 10 s: ${show(tabsOf(profile).filter(r => r.uri === d.key))}`);
        const d2 = await run(`
            ${PROBES}
            const listed = await settle(() => A.model().getTabs(S.ga).some(t => t.uri === ${JSON.stringify(d.key)}));
            A.shell().activateWidget(S.a.id);
            await settle(() => current() === S.a);
            const match = await stripMatches();
            const homeIndex = home().indexOf(S.d);
            return { listed, match, paintedAt: match.painted.indexOf(${JSON.stringify(d.label)}), homeIndex, members: A.model().getTabs(S.ga).map(t => t.uri) };
        `);
        expect(d2.listed, `(d) getTabs(A) does not list the "+" tab ${d.key}: [${d2.members.join(', ')}]`);
        expect(d2.match.ok, `(d) the strip paints [${d2.match.painted.join(' | ')}], want the derived set [${d2.match.derived.join(' | ')}]`);
        expect(d2.homeIndex >= 0 && d2.paintedAt >= 0, `(d) the "+" tab "${d.label}" is not painted once /a is current again`);
        detail(`(d) "+" with A active: row ${d.key} has group_id ${b.ga}, getTabs(A) lists it, and the strip paints it with /a current`);

        // Probe controls, each restored afterwards.
        const p1 = await run(`
            ${PROBES}
            const m = A.model();
            let shown;
            try {
                m.showsInStrip = () => true;
                strip().update();
                shown = await settle(() => painted().includes(labelOf(S.c)));
            } finally {
                delete m.showsInStrip;
                strip().update();
            }
            const restored = await stripMatches();
            return { shown, restored: restored.ok && !restored.painted.includes(labelOf(S.c)) };
        `);
        const p2 = await run(`
            ${PROBES}
            const m = A.model();
            let w;
            try {
                m.joinActiveGroup = async () => {};
                w = await newTab();
            } finally {
                delete m.joinActiveGroup;
            }
            A.shell().activateWidget(S.a.id);
            return { key: keyOf(w) };
        `);
        const p2Row = await waitUntil(() => rowOf(p2.key), 10000);
        const p2Joined = await joined(p2.key, b.ga);
        const controls = [
            ['showsInStrip stubbed to true', p1.shown, `B's tab painted ${p1.shown}`],
            ['joinActiveGroup stubbed to a no-op', !!p2Row && !p2Joined && p2Row.group_id == null, `row ${p2Row ? show([p2Row]) : 'missing'}`],
        ];
        for (const [name, red, seen] of controls) {
            expect(red, `probe control ${name} did not go red -- the probe cannot see that fault (${seen})`);
        }
        expect(p1.restored, 'probe control showsInStrip was not restored: the strip no longer matches the derived set');

        // (e) Coding: every main-area tab is displayed in its dock bar (D2).
        const e = await run(`
            ${PROBES}
            await A.get('ModeService').activateMode('coding');
            const hidden = () => {
                const out = [];
                const seen = new Set();
                for (const bar of Array.from(A.shell().mainPanel.tabBars())) {
                    const barShown = getComputedStyle(bar.node).display !== 'none';
                    bar.titles.forEach((t, i) => {
                        seen.add(t.owner);
                        const el = bar.contentNode.children[i];
                        if (!el || !barShown || getComputedStyle(el).display === 'none') out.push(labelOf(t.owner));
                    });
                }
                for (const w of A.mainWidgets()) if (!seen.has(w)) out.push(labelOf(w) + ' (no dock tab)');
                return out;
            };
            await settle(() => document.body.dataset.pbMode === 'coding' && hidden().length === 0);
            const out = { mode: document.body.dataset.pbMode, hidden: hidden(), count: A.mainWidgets().length, active: A.model().getActiveGroupId() };
            await A.get('ModeService').activateMode('browsing');
            A.shell().activateWidget(S.a.id);
            out.back = await stripMatches();
            return out;
        `);
        expect(e.mode === 'coding', `(e) the body mode is ${e.mode}, want coding`);
        expect(e.active === b.ga, `(e) group A is not active in Coding (active ${e.active}), so the scope check proves nothing`);
        expect(e.hidden.length === 0, `(e) in Coding these main-area tabs are not displayed in their dock bar: ${e.hidden.join(' | ')}`);
        expect(e.back.ok, `(e) back in Browsing the strip paints [${e.back.painted.join(' | ')}], want [${e.back.derived.join(' | ')}]`);
        detail(`(e) Coding with A active: all ${e.count} main-area tabs displayed in their dock bars; back in Browsing the strip is filtered again`);
        return { ga: b.ga, keys, labelC: b.labelC, labels: Object.fromEntries(Object.keys(keys).map((n, i) => [n, opened.labels[i]])) };
    });
    if (!first || failures.length) {
        return;
    }

    // (f) relaunch on the same profile: the model loads before Organising opens.
    await withShell(profile, async ({ run }) => {
        const f = await run(`
            ${PROBES}
            const t0 = Date.now();
            const loaded = await settle(() => A.model().isLoaded, 160);
            const loadedMs = Date.now() - t0;
            const keys = ${JSON.stringify(first.keys)};
            const reopened = await settle(() => Object.values(keys).every(k => byKey(k)), 160);
            // A restored tab paints 'New Tab' or its URL until its page title loads (WINDOWS 56):
            // wait for every test tab to carry the label it had before the quit, then read the strip.
            const labels = ${JSON.stringify(first.labels)};
            const unlabelled = () => Object.keys(keys).filter(n => !byKey(keys[n]) || labelOf(byKey(keys[n])) !== labels[n]);
            const titled = await settle(() => !unlabelled().length, 160);
            const match = await stripMatches();
            return {
                loaded, loadedMs, reopened, titled,
                untitled: unlabelled().map(n => labels[n] + ' reads ' + (byKey(keys[n]) ? labelOf(byKey(keys[n])) : 'no tab')),
                open: Object.values(keys).filter(k => byKey(k)),
                organising: !!A.shell().getWidgetById('powerbrowser.modes.organising'),
                mode: document.body.dataset.pbMode,
                active: A.model().getActiveGroupId(),
                match,
                home: home().map(labelOf),
            };
        `);
        expect(f.loaded, '(f) after the relaunch the group model never loaded without Organising');
        expect(!f.organising, '(f) the Organising surface is attached, so the load cannot be credited to the model');
        expect(f.mode === 'browsing', `(f) the relaunch opened in ${f.mode}, want browsing`);
        expect(f.reopened, `(f) the restore did not reopen every test tab: open [${f.open.join(', ')}]`);
        expect(f.titled, `(f) a restored tab never got back its title within 20 s: ${f.untitled.join('; ')}`);
        expect(f.active === first.ga, `(f) after the relaunch the active group is ${f.active}, want A ${first.ga}`);
        expect(f.match.ok, `(f) the strip paints [${f.match.painted.join(' | ')}], want the derived set [${f.match.derived.join(' | ')}]`);
        expect(f.home.includes(first.labelC) && !f.match.painted.includes(first.labelC),
            `(f) the strip is not filtered: B's "${first.labelC}" is ${f.home.includes(first.labelC) ? 'painted' : 'not open'}`);
        detail(`(f) relaunch: model loaded in ${f.loadedMs} ms with Organising never opened; A active; strip [${f.match.painted.join(' | ')}] of ${f.home.length} home tabs, B's tab filtered out`);
    });
    if (!failures.length) {
        detail('probe controls: 2 planted page faults each turned their probe red');
    }
});
