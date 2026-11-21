#!/usr/bin/env node
// scripts/verify-tab-store-offline.mjs -- the tab-store writer, offline (non-GUI
// wave A, ruling T2-R4).
//
// Loads the REAL powerbrowser/shell/PowerBrowserAPI.sys.mjs in node and drives
// its store code: node:sqlite stands in for mozStorage, and SessionStore, the
// stock windows, IOUtils and Sqlite.sys.mjs's shutdown client are fakes
// (scripts/lib/tab-store-fakes.mjs). The fake connection enforces the rules Sqlite.sys.mjs and mozStorage enforce and
// node:sqlite does not -- an unbound LIKE is refused (isInvalidBoundLikeQuery,
// the rule that rolled the v5 migration back live), a named parameter the
// statement lacks, an array or an undefined value is refused, and a nested
// executeTransaction is an error -- so that class of defect goes red here in
// seconds instead of only in a live launch. The run also plants an unbound
// LIKE into a copy of the writer and requires the guard to refuse it.
//
// Covers: the migration from every shipped version (v1-v4, the phase-11
// fixture, and the real profile's store when PB_REAL_PROFILE_FIXTURE names it,
// decisions.md R7 -- counts only, never a value); the key rule and row
// lifecycle (NG-001..NG-005); stock keys across navigation, Duplicate Tab,
// restore and a move between windows; the sweep's restore gate (F4); the
// quarantine rebuild at head (NG-014); and the store's close at shutdown
// (NG-085). It proves the writer's SQL and control flow, not Firefox's timing:
// the live NG rows own that.
//
// Honestly --quick: a mkdtemp stage, no build, no browser, no network.

import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT, buildStore, columnsOf, newStage, readStore, schemaHead, setUserVersion, tamperBodyPage } from './lib/tab-store-fixtures.mjs';
import { LIKE_SQL_REGEX, SessionStore, closeAll, env, freshApi, report } from './lib/tab-store-fakes.mjs';

const NAME = 'verify-tab-store-offline';
const API = join(REPO_ROOT, 'powerbrowser/shell/PowerBrowserAPI.sys.mjs');
const PHASE11_FIXTURE = join(REPO_ROOT, '.planning/milestones/v1.2-phases/11-sql-store-design/fixtures/tabs-v1.sqlite');
const UPSTREAM_SQLITE = join(REPO_ROOT, 'upstream/toolkit/modules/Sqlite.sys.mjs');
const KEY = 'powerbrowser-tab-key';

// The Sqlite.sys.mjs rules and the fakes live in scripts/lib/tab-store-fakes.mjs.

const failures = [];
const notes = [];
const expect = (ok, message) => {
    if (!ok) {
        failures.push(message);
    }
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function section(name, fn) {
    try {
        await fn();
    } catch (error) {
        failures.push(`${name}: threw ${error && error.message ? error.message : error}`);
    }
}

// ---- fixtures ---------------------------------------------------------------------
const SEED = {
    groups: [{ id: 'g-res', title: 'Research', x: 12, y: 34, w: 400, h: 300, is_active: 1 }],
    tabs: [
        { uri: 'webview:https://stock.example/one', url: 'https://stock.example/one', title: 'Stock one', last_active: 1000, thumbnail: 'data:image/png;base64,AAAA' },
        { uri: 'https://web.example/grouped', url: 'https://web.example/grouped', title: 'Grouped', last_active: 2000, group_id: 'g-res', ord: 1, thumbnail: 'data:image/png;base64,BBBB' },
        { uri: 'https://web.example/placed', url: 'https://web.example/placed', title: 'Placed', last_active: 3000, x: 120, y: 240 },
        { uri: 'terminal:build', url: '', title: 'It\'s a "build" shell — ünïcödé ✓', last_active: 4000, group_id: 'g-res', ord: 0 },
        { uri: 'view:explorer-view-container', url: '', title: 'Explorer', last_active: 5000 },
    ],
};
/** docs/TAB-STORE.md, "v5": the key an older build's row carries at the head. */
function expectedKey(oldKey, rowId) {
    if (oldKey.startsWith('webview:')) {
        return `stock:legacy-${rowId}`;
    }
    return /^https?:\/\//i.test(oldKey) ? `web:legacy-${rowId}` : oldKey;
}
function copyStore(from, to) {
    for (const suffix of ['', '-wal', '-shm']) {
        if (existsSync(`${from}${suffix}`)) {
            copyFileSync(`${from}${suffix}`, `${to}${suffix}`);
        }
    }
    return to;
}

const stage = newStage('tab-store-offline');
let dirs = 0;
const newProfile = () => {
    const dir = join(stage, `profile-${(dirs += 1)}`);
    mkdirSync(dir);
    return dir;
};

try {
    // ---- the LIKE pin against upstream ------------------------------------------
    if (existsSync(UPSTREAM_SQLITE)) {
        const m = /var likeSqlRegex = \/(.+)\/([a-z]*);/.exec(readFileSync(UPSTREAM_SQLITE, 'utf8'));
        expect(m && m[1] === LIKE_SQL_REGEX.source && m[2] === LIKE_SQL_REGEX.flags,
            `the pinned LIKE rule ${LIKE_SQL_REGEX} is not upstream Sqlite.sys.mjs's likeSqlRegex (${m ? `/${m[1]}/${m[2]}` : 'not found'})`);
    } else {
        notes.push('upstream/ is absent, so the pinned LIKE rule was not compared with Sqlite.sys.mjs');
    }

    // ---- A. migration from every shipped version (NG-015's own expectations) ------
    const migrate = async (label, fixture, { privateData = false } = {}) => {
        const before = readStore(fixture);
        const profile = newProfile();
        copyStore(fixture, join(profile, 'tabs.sqlite'));
        const api = await freshApi(profile);
        let state = '';
        await section(`${label}: startup`, async () => {
            state = await api.ensureTabStore();
            env.restored.resolve();
            await api.sweepTabStoreFromSessionStore();
        });
        await closeAll();
        const path = join(profile, 'tabs.sqlite');
        const after = readStore(path);
        expect(state === 'ready', `${label}: ensureTabStore answered ${state || '(threw)'}, want ready`);
        expect(after.version === schemaHead(), `${label}: the store is at version ${after.version} after startup, want ${schemaHead()}`);
        let lost = 0;
        for (const old of before.tabs) {
            const now = after.tabs.find(r => r.row_id === old.row_id);
            const broken = !now || now.uri !== expectedKey(old.uri, old.row_id)
                || ['url', 'title', 'group_id', 'thumbnail', 'x', 'y', 'ord'].some(col => col in old && now[col] !== old[col]);
            if (broken) {
                lost += 1;
                if (!privateData) {
                    failures.push(`${label}: row ${old.row_id} (${old.uri}) did not arrive under ${expectedKey(old.uri, old.row_id)} with every column: ${JSON.stringify(now ?? null)}`);
                }
            }
        }
        expect(!privateData || lost === 0, `${label}: ${lost} of ${before.tabs.length} rows did not arrive under the head key rule with every column (values not printed)`);
        expect(JSON.stringify(after.groups) === JSON.stringify(before.groups), `${label}: the groups changed across the migration`);
        expect(Object.keys(after.settings).length === 5 && after.settings.closed_retention_days === '7', `${label}: the settings table is not seeded with its five rows`);
        expect(columnsOf(path, 'tabs').length === 12, `${label}: the tabs table has ${columnsOf(path, 'tabs').length} columns, want 12`);
        expect(JSON.stringify(columnsOf(path, 'saved_pages')) === JSON.stringify(['tab_uri', 'dir', 'url', 'title', 'saved_at', 'bytes']), `${label}: the saved_pages table is not at its v6 shape: ${JSON.stringify(columnsOf(path, 'saved_pages'))}`);
        rmSync(profile, { recursive: true, force: true });
    };
    for (const version of [1, 2, 3, 4]) {
        const path = join(stage, `tabs-v${version}.sqlite`);
        buildStore(path, version, SEED);
        await migrate(`v${version}`, path);
    }
    await migrate('phase-11 tabs-v1.sqlite', copyStore(PHASE11_FIXTURE, join(stage, 'phase11.sqlite')));
    const real = process.env.PB_REAL_PROFILE_FIXTURE;
    if (real && existsSync(real)) {
        await migrate('real profile', copyStore(real, join(stage, 'real.sqlite')), { privateData: true });
        for (const suffix of ['', '-wal', '-shm']) {
            rmSync(join(stage, `real.sqlite${suffix}`), { force: true });
        }
    } else {
        notes.push('PB_REAL_PROFILE_FIXTURE is not set; the real-profile store was skipped (decisions.md R7)');
    }
    await section('re-run', async () => {
        const path = join(stage, 'redo.sqlite');
        buildStore(path, 5, { ...SEED, tabs: SEED.tabs.map((t, i) => ({ ...t, uri: expectedKey(t.uri, i + 1) })) });
        setUserVersion(path, 4);
        const before = readStore(path);
        const profile = newProfile();
        copyStore(path, join(profile, 'tabs.sqlite'));
        const api = await freshApi(profile);
        await api.openTabStore();
        await closeAll();
        const after = readStore(join(profile, 'tabs.sqlite'));
        expect(after.version === schemaHead() && JSON.stringify(after.tabs) === JSON.stringify(before.tabs), 'a v5-shaped store stamped 4 did not re-run as a no-op that stamps the head');
    });
    await section('newer than head', async () => {
        const path = join(stage, 'v99.sqlite');
        buildStore(path, 5, SEED);
        setUserVersion(path, 99);
        const profile = newProfile();
        copyStore(path, join(profile, 'tabs.sqlite'));
        const api = await freshApi(profile);
        const refusal = await api.openTabStore().then(() => '', e => e.message);
        expect(/refusing downgrade/.test(refusal) && readStore(join(profile, 'tabs.sqlite')).version === 99, `a store newer than the head was not refused and left at 99: ${refusal}`);
        await closeAll();
    });

    // ---- B. key rule and lifecycle (NG-001..NG-005) --------------------------------
    await section('lifecycle', async () => {
        const profile = newProfile();
        const api = await freshApi(profile);
        await api.ensureTabStore();
        // NG-038: the sender wall admits only the shell's own frame on the sidecar's port, as TheiaService._swap sets it.
        api.setGroupSenderPort(3000);
        const shellFrame = { id: 'powerbrowser-content', ownerDocument: { documentURI: 'chrome://powerbrowser/content/powerbrowser.xhtml' }, getAttribute: () => 'true' };
        const theia = { browsingContext: { currentWindowGlobal: { documentURI: { spec: 'http://127.0.0.1:3000/', port: 3000 } }, top: { embedderElement: shellFrame } } };
        const mutate = data => api.handleGroupMutation(data, theia);
        const conn = await api.openTabStore();
        const get = async uri => {
            const rows = await conn.execute('SELECT uri, url, title, group_id, x, y, ord, thumbnail, created_at, closed_at FROM tabs WHERE uri = :uri', { uri });
            return rows.length ? Object.fromEntries(['uri', 'url', 'title', 'group_id', 'x', 'y', 'ord', 'thumbnail', 'created_at', 'closed_at'].map((c, i) => [c, rows[0].getResultByIndex(i)])) : undefined;
        };
        await api.writeTabRow({ uri: 'web:wt-a-1', url: '', title: '' });
        await mutate({ kind: 'createGroup', id: 'g1', title: 'G' });
        for (const data of [
            { kind: 'setTabGroup', uri: 'web:wt-a-1', groupId: 'g1' },
            { kind: 'setGroupOrder', groupId: 'g1', uris: ['web:wt-a-1'] },
            { kind: 'setTabPosition', uri: 'web:wt-a-1', x: 120, y: 80 },
        ]) {
            const reply = await mutate(data);
            expect(reply.ok, `NG-004: ${data.kind} on a New Tab's row (url '') was refused: ${reply.message}`);
        }
        for (const data of [
            { kind: 'setTabPosition', uri: 'web:missing', x: 1, y: 1 },
            { kind: 'setGroupOrder', groupId: 'g1', uris: ['web:missing'] },
            { kind: 'setTabGroup', uri: 'web:missing', groupId: 'g1' },
        ]) {
            const reply = await mutate(data);
            expect(!reply.ok && reply.reason === 'validation' && /unknown tab/i.test(reply.message), `NG-004: ${data.kind} on a key with no row answered ${JSON.stringify(reply)}`);
        }
        for (const bad of ['stock:x-1', 'web:x', 'webview:v/1', 'https://a.example/', 'http://a.example/', `terminal:${'x'.repeat(2050)}`]) {
            const reply = await mutate({ kind: 'trackTab', uri: bad, url: '', title: '' });
            expect(!reply.ok && reply.reason === 'validation', `NG-001: trackTab accepted the key ${bad.slice(0, 24)}`);
        }
        for (const bad of ['stock:x-1', `web:${'x'.repeat(2050)}`]) {
            const reply = await mutate({ kind: 'closeTab', uri: bad });
            expect(!reply.ok && reply.reason === 'validation', `closeTab accepted the key ${bad.slice(0, 24)}`);
        }
        expect((await mutate({ kind: 'webTabOpen', tabId: 'wt-a-2', url: 'about:blank', key: 'web:../../x' })).ok === false, 'webTabOpen accepted a malformed row key');
        expect((await mutate({ kind: 'trackTab', uri: 'terminal:t1', url: '', title: 'T1' })).ok, 'NG-001: trackTab refused a terminal address');
        expect((await mutate({ kind: 'closeTab', uri: 'terminal:t1' })).ok && (await get('terminal:t1')).closed_at > 0, 'NG-005: closeTab did not mark the row closed');
        await api.writeTabRow({ uri: 'terminal:t1', url: '', title: '' });
        let row = await get('terminal:t1');
        expect(row.closed_at === null && row.title === 'T1' && row.created_at > 0, `an upsert did not reopen the row keeping its title and created_at: ${JSON.stringify(row)}`);
        // A reopened Theia tab is a new tab: a closed row's group and place do not come back (T2-R3).
        await mutate({ kind: 'setTabGroup', uri: 'terminal:t1', groupId: 'g1' });
        await mutate({ kind: 'setTabPosition', uri: 'terminal:t1', x: 5, y: 6 });
        await mutate({ kind: 'trackTab', uri: 'terminal:t1', url: '', title: 'T1' });
        row = await get('terminal:t1');
        expect(row.group_id === 'g1' && row.x === 5, `trackTab on an OPEN row dropped its group or place: ${JSON.stringify(row)}`);
        await mutate({ kind: 'closeTab', uri: 'terminal:t1' });
        await mutate({ kind: 'trackTab', uri: 'terminal:t1', url: '', title: 'T1' });
        row = await get('terminal:t1');
        expect(row.closed_at === null && row.group_id === null && row.x === null && row.y === null && row.ord === null, `a reopened Theia tab brought back its closed row's group or place: ${JSON.stringify(row)}`);
        // NG-002: a navigation updates the row in place.
        await conn.execute("UPDATE tabs SET thumbnail = 'data:image/png;base64,Q' WHERE uri = 'web:wt-a-1'");
        await api.writeTabRow({ uri: 'web:wt-a-1', url: 'https://b.example/', title: 'B' });
        row = await get('web:wt-a-1');
        expect(row.group_id === 'g1' && row.x === 120 && row.ord === 0 && row.thumbnail && row.url === 'https://b.example/', `NG-002: a navigation did not update the row in place: ${JSON.stringify(row)}`);
        // NG-003: two tabs on one URL are two rows.
        await api.writeTabRow({ uri: 'web:wt-a-3', url: 'https://b.example/', title: 'B' });
        expect((await conn.execute("SELECT 1 FROM tabs WHERE url = 'https://b.example/'")).length === 2, 'NG-003: two tabs on one URL are not two rows');
        await api.removeTabRow('web:wt-a-3');
        expect((await get('web:wt-a-3'))?.closed_at === null, 'removeTabRow (the overlay dropped) closed or deleted the row');
        // NG-005: the prune deletes only old closed rows.
        await conn.execute("INSERT INTO tabs (uri, url, title, last_active, closed_at) VALUES ('stock:old-1', 'https://o.example/', '', 1, 5)");
        await conn.execute("INSERT INTO tabs (uri, url, title, last_active) VALUES ('stock:open-1', 'https://p.example/', '', 1)");
        await api.pruneClosedTabRows(Date.now() - 7 * 86400000);
        expect(!(await get('stock:old-1')) && (await get('stock:open-1')), 'NG-005: the prune deleted an open row or kept an old closed one');
        await conn.execute("INSERT INTO tabs (uri, url, title, last_active) VALUES ('stock:live-1', 'https://l.example/', '', 1)");
        await api.closeAbsentStockRows(['stock:live-1']);
        expect((await get('stock:open-1')).closed_at > 0 && (await get('stock:live-1')).closed_at === null && (await get('web:wt-a-3')).closed_at === null, 'closeAbsentStockRows closed the wrong rows');
        await api.closeEndedWebRows();
        expect((await get('web:wt-a-3')).closed_at > 0 && (await get('web:wt-a-1')).closed_at === null, 'closeEndedWebRows did not close only the ungrouped, unplaced web row');
        await closeAll();
    });

    // ---- C. stock keys and triggers (F4, F6, adoption) -------------------------------
    await section('stock keys', async () => {
        const profile = newProfile();
        const api = await freshApi(profile);
        await api.ensureTabStore();
        const makeWindow = priv => {
            const listeners = {};
            // windowListeners holds what the triggers add on the window itself (its unload); `removed` counts the
            // tab container's removeEventListener calls, which is how the stop function is seen to reach it or not.
            const win = { private: priv, listeners, windowListeners: {}, removed: 0, addEventListener: (n, f) => { win.windowListeners[n] = f; }, removeEventListener() {} };
            win.gBrowser = { tabs: [], tabContainer: { addEventListener: (n, f) => { listeners[n] = f; }, removeEventListener: () => { win.removed += 1; } } };
            return win;
        };
        const makeTab = (win, url) => {
            const tab = { linkedBrowser: { currentURI: { spec: url } }, ownerDocument: { defaultView: win }, label: url, closing: false };
            win.gBrowser.tabs.push(tab);
            return tab;
        };
        const fire = (win, type, target, detail) => win.listeners[type]({ type, target, detail });
        const win = makeWindow(false);
        const t1 = makeTab(win, 'https://s.example/1');
        const pwin = makeWindow(true);
        const pt = makeTab(pwin, 'https://secret.example/');
        const stopTabStoreTriggers = [];
        try {
            env.windows = [win, pwin];
            stopTabStoreTriggers.push(api.startTabStoreTriggers());
            await sleep(30);
            const conn = await api.openTabStore();
            const rows = async () => (await conn.execute('SELECT uri, url, closed_at FROM tabs ORDER BY rowid')).map(r => ({ uri: r.getString(0), url: r.getString(1), closed_at: r.getString(2) }));
            const k1 = SessionStore.getCustomTabValue(t1, KEY);
            expect(/^stock:[a-z0-9]+-1$/.test(k1) && (await rows()).some(r => r.uri === k1), `a tab already in the window when the triggers attached was not keyed and written: ${k1}`);
            expect(SessionStore.getCustomTabValue(pt, KEY) === '' && !(await rows()).some(r => r.url === 'https://secret.example/'), 'a private window tab got a key or a row');
            t1.linkedBrowser.currentURI.spec = 'https://s.example/2';
            fire(win, 'TabAttrModified', t1);
            await sleep(20);
            expect(api.stockTabKey(t1) === k1 && (await rows()).some(r => r.uri === k1 && r.url === 'https://s.example/2'), 'NG-002: a stock navigation changed the key or did not update its row');
            // F6: Duplicate Tab copies the custom value into a tab keyed at TabOpen.
            const dup = makeTab(win, 'https://s.example/2');
            fire(win, 'TabOpen', dup, {});
            const dupOwn = SessionStore.getCustomTabValue(dup, KEY);
            SessionStore.setCustomTabValue(dup, KEY, k1);
            fire(win, 'TabSelect', t1);
            fire(win, 'TabAttrModified', dup);
            await sleep(20);
            expect(api.stockTabKey(t1) === k1 && api.stockTabKey(dup) === dupOwn && dupOwn !== k1, 'F6: a duplicated tab shares its original\'s key');
            // A move to another window: sessionstore moves the value, the old tab closes adopted.
            const win2 = makeWindow(false);
            env.windows = [win, pwin, win2];
            stopTabStoreTriggers.push(api.startTabStoreTriggers());
            const moved = makeTab(win2, 'https://s.example/2');
            SessionStore.moveCustomTabValue(t1, moved);
            fire(win2, 'TabOpen', moved, { adoptedTab: t1 });
            t1.closing = true;
            win.gBrowser.tabs.splice(win.gBrowser.tabs.indexOf(t1), 1);
            fire(win, 'TabClose', t1, { adoptedBy: moved });
            await sleep(20);
            expect(api.stockTabKey(moved) === k1 && (await rows()).find(r => r.uri === k1)?.closed_at === null, 'a stock tab moved to another window lost its key or had its row closed');
            // Restore: a key minted at TabOpen is replaced by the saved one.
            const rt = makeTab(win, 'https://r.example/');
            fire(win, 'TabOpen', rt, {});
            const orphan = SessionStore.getCustomTabValue(rt, KEY);
            SessionStore.setCustomTabValue(rt, KEY, 'stock:saved-7');
            fire(win, 'TabAttrModified', rt);
            await sleep(20);
            expect(api.stockTabKey(rt) === 'stock:saved-7', 'a restored tab did not claim its saved key');
            const tabState = t => ({ entries: [{ url: t.linkedBrowser.currentURI.spec, title: '' }], index: 1, extData: { [KEY]: SessionStore.getCustomTabValue(t, KEY) } });
            env.state = { windows: [{ tabs: [dup, rt].map(tabState) }, { tabs: [moved].map(tabState) }, { isPrivate: true, tabs: [tabState(pt)] }] };
            await api.sweepTabStoreFromSessionStore();
            expect((await rows()).find(r => r.uri === orphan)?.closed_at === null, 'F4: the sweep closed a stock row before sessionstore restored its windows');
            env.restored.resolve();
            await sleep(10);
            await api.sweepTabStoreFromSessionStore();
            const after = await rows();
            expect(after.find(r => r.uri === orphan)?.closed_at !== null && after.find(r => r.uri === 'stock:saved-7')?.closed_at === null && after.find(r => r.uri === k1)?.closed_at === null, 'after the restore the sweep did not close exactly the orphan row');
            fire(win, 'TabClose', dup, {});
            await sleep(20);
            expect((await rows()).find(r => r.uri === dupOwn)?.closed_at !== null, 'NG-005: TabClose did not keep the row as closed history');
            expect(api.findStockTabBrowser(k1)?.tab === moved, 'findStockTabBrowser did not find the tab by its key');
            // A closed stock window's tab container leaves the attach list at its unload, so it is not held until quit:
            // the stop function reaches the container of the window still open and not the closed one's.
            const gone = makeWindow(false);
            const kept = makeWindow(false);
            env.windows = [gone, kept];
            const stopBoth = api.startTabStoreTriggers();
            await sleep(10);
            expect(typeof gone.windowListeners.unload === 'function', 'the triggers add no unload listener to a stock window, so a closed window stays in the attach list');
            gone.windowListeners.unload?.();
            stopBoth();
            expect(gone.removed === 0 && kept.removed > 0, `a closed stock window's tab container was still held when the triggers stopped (closed window: ${gone.removed} removals, open window: ${kept.removed})`);
            await closeAll();
        } finally {
            for (const stop of stopTabStoreTriggers.splice(0)) {
                try { stop(); } catch { /* stop is best-effort */ }
            }
        }
    });

    // ---- D. quarantine rebuild at head (NG-014) ---------------------------------------
    await section('quarantine', async () => {
        const profile = newProfile();
        const path = join(profile, 'tabs.sqlite');
        buildStore(path, 5, { tabs: [{ uri: 'terminal:ng014', url: '', title: 't', last_active: 5 }] });
        tamperBodyPage(path);
        const api = await freshApi(profile);
        env.state = { windows: [{ tabs: [{ entries: [{ url: 'https://q.example/', title: 'Q' }], index: 1, extData: { [KEY]: 'stock:q-1' } }] }] };
        const state = await api.ensureTabStore();
        await closeAll();
        const after = readStore(path);
        expect(state === 'rebuilt' && existsSync(`${path}.corrupt-1`), `NG-014: a tampered store was not quarantined (state ${state})`);
        expect(after.version === schemaHead() && columnsOf(path, 'tabs').length === 12 && Object.keys(after.settings).length === 5, 'NG-014: the rebuilt store is not at the head with every column and the settings');
        expect(JSON.stringify(columnsOf(path, 'saved_pages')) === JSON.stringify(['tab_uri', 'dir', 'url', 'title', 'saved_at', 'bytes']), `NG-014: the rebuilt store lacks the v6 saved_pages table with its columns: ${JSON.stringify(columnsOf(path, 'saved_pages'))}`);
        const restored = after.tabs.find(r => r.uri === 'stock:q-1');
        expect(restored && restored.created_at > 0, `the rebuild's restored row has no created_at: ${JSON.stringify(restored ?? null)}`);
    });

    // ---- E. NG-085: the connection closes in Sqlite's shutdown barrier -------------------
    await section('shutdown', async () => {
        const profile = newProfile();
        const api = await freshApi(profile);
        env.blockerThrows = 1;
        const first = await api.openTabStore().then(() => 'opened', e => e.message);
        expect(/too late/.test(first) && env.conns.length === 0, `a failed blocker registration still opened a connection: ${first}`);
        await api.ensureTabStore();
        const conn = env.conns.at(-1);
        await api.openTabStore();
        expect(env.blockers.length === 1, `want one Sqlite.shutdown blocker after a retry and a reopen, got ${env.blockers.length}`);
        await env.blockers[0].fn();
        expect(conn.isClosed(), 'NG-085: the shutdown blocker did not close the open connection');
        const late = await api.writeTabRow({ uri: 'web:x-1', url: '', title: '' }).then(() => 'wrote', e => e.message);
        expect(/closed for shutdown/.test(late), `NG-085: a write after the blocker opened a connection instead of failing: ${late}`);
        await closeAll();
    });

    // ---- F. the guard itself: a planted unbound LIKE is refused ---------------------------
    await section('guard', async () => {
        const planted = join(stage, 'planted.sys.mjs');
        const source = readFileSync(API, 'utf8');
        const mutated = source.replace("uri GLOB 'stock:*'", "uri LIKE 'stock:%'");
        expect(mutated !== source, "the plant did not land: no uri GLOB 'stock:*' in the writer");
        writeFileSync(planted, mutated);
        const profile = newProfile();
        const api = await freshApi(profile, planted);
        await api.ensureTabStore();
        const refusal = await api.closeAbsentStockRows([]).then(() => '', e => e.message);
        expect(/LIKE clause with bindings/.test(refusal), 'the guard let an unbound LIKE through, so it would not catch the defect it exists for');
        await closeAll();
    });
} finally {
    await closeAll().catch(() => undefined);
    rmSync(stage, { recursive: true, force: true });
}

notes.forEach(note => console.log(`${NAME}: notice -- ${note}`));
if (failures.length) {
    report(`${NAME}: FAIL`);
    failures.forEach(f => report(`  ${f}`));
    process.exit(1);
}
console.log(`${NAME}: PASS -- the writer's migration, key rule, lifecycle, quarantine and shutdown close hold offline under Sqlite.sys.mjs's rules`);
