#!/usr/bin/env node
// scripts/verify-orca-browser-agent-live.mjs
//
// orca-browser-agent-live (Phase 66, BRW-02/BRW-03; P66-30, P66-29, P66-26, P66-09, P66-03,
// A1, A3, A7; ROADMAP Phase 66 criteria 1 and 2): Orca agents drive PowerBrowser web tabs
// through PB's orcad and the client host, on the merged, built tree, through the Orca CLI.
//
// Clauses, in run order (each a pure exported verdict over recorded observations):
//  (k) no Orca pane, first in the session: zero Orca-pane widgets before and after, after a
//      positive read that the pane bundle booted and the link global is present; one CLI
//      tab create gives exactly one web tab within 1 s (the host comes up at frontend start).
//  (a) with a user web tab current, tab create makes exactly one new agent web tab, not
//      current, within 1 s measured to addWidget, bound in the page table.
//  (b) goto gives the fixture title; click raises the button's counter; type sets the input;
//      screenshot's pixel at CSS (120, 100) x DPR is the planted red, a pixel outside is not;
//      the screenshot half runs again in a second launch at layout.css.devPixelsPerPx 2.
//  (c) focus: the agent document's activeElement moves to the input on a CLI focus (the
//      positive read), then the user tab's document focus and activeElement, chrome's
//      focused overlay and the user's blur log are unchanged, and chrome's elementFromPoint
//      at the agent target is not the agent overlay (A1 parking).
//  (d) refusals: an invented page id fails with orcad's error.code; a raw webTabAgent for a
//      real user tab answers not-agent-tab and for a real stock-window tab unknown-tab.
//  (e) container (P66-26): the agent tab reads a cookie it set itself (positive), then a
//      cookie a user tab set on the same host is not visible to the agent.
//  (f) decoy (P66-29): verify-orca-hidden-electron's exported run proves both orcad-emitted
//      detectors fire on stock orcad in this invocation; then, with the decoy at
//      ~/.local/bin/orca-ide in this session's scratch HOME, tab create and goto through PB's
//      orcad give the expected title and no decoy record file in orcad's data root.
//  (g) renderer path (A3): in the Theia document, Orca's own window.api placement call
//      answers the client host, and browser.tabCreate through the pane client's own
//      connection arrives as createPage (bound in the page table), with no
//      browser_host_lease_stale; the record names the credential path (token or device-key).
//  (h) user close (A7): a Lumino close of an agent tab removes its page from tab list.
//  (j) activation (P66-09): a CLI create with a user tab current leaves the current widget
//      and the user's focus alone (after the positive read that the page is bound and
//      listed); tab switch --page must first turn the page's store record active (the
//      detector), then the bound web tab must become current within 1000 ms.
//  (i) reload, last: a frontend reload leaves no agent web tab, the host re-attaches, and
//      tab list no longer lists the old pages.
//
// Tier: full, under flock /home/chris/coding/Power-Browser/.git/pb-live.lock. A named SKIP
// (exit 0) without lane p66-03's AGENT_METHODS, lane p66-02's extension, a built PowerBrowser
// or lane p66-01's built host bundle. --self-test is quick and hermetic: the verdicts over a
// control observation set and one planted fault each.
//
// Usage:
//   node scripts/verify-orca-browser-agent-live.mjs
//   node scripts/verify-orca-browser-agent-live.mjs --self-test

import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { INSIDE, OUTSIDE, RED, prerequisites } from './lib/orca-browser-live.mjs';

const NAME = 'orca-browser-agent-live';
const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const CREATE_MS = 1000;
const REVEAL_MS = 1000;
const sameRgb = (a, b) => Array.isArray(a) && a.length >= 3 && a.slice(0, 3).every((v, i) => Math.abs(v - b[i]) <= 8);

// ---------------------------------------------------------------- verdicts

export function verdictNoPane(o) {
    if (!o.bundleBooted || !o.linkPresent) return ['detector blind: the no-pane clause ran without the booted bundle and the link global'];
    const f = [];
    if (o.paneWidgetsBefore !== 0 || o.paneWidgetsAfter !== 0) f.push(`Orca-pane widget present during the no-pane clause (${o.paneWidgetsBefore} before, ${o.paneWidgetsAfter} after)`);
    if (o.newTabs === 0) f.push('no web tab from the no-pane create');
    if (o.newTabs > 1) f.push(`two tabs for one page from the no-pane create (${o.newTabs})`);
    if (o.newTabs === 1 && !(o.ms !== null && o.ms <= CREATE_MS)) f.push(`the no-pane create was slower than ${CREATE_MS} ms (${o.ms})`);
    return f;
}

export function verdictCreate(o) {
    if (!o.ok) return [`tab create failed: ${o.code}`];
    if (o.newTabs.length === 0) return ['no web tab from tab create'];
    const f = [];
    if (o.newTabs.length > 1) f.push(`two tabs for one page (${o.newTabs.length})`);
    const [t] = o.newTabs;
    if (t.current) f.push('a tab current at create');
    if (!t.agent) f.push('the created tab is not an agent tab');
    if (!(o.ms !== null && o.ms <= CREATE_MS)) f.push(`create slower than ${CREATE_MS} ms (${o.ms}) measured to addWidget`);
    if (o.boundTab !== t.tabId) f.push('the page table does not bind the new tab');
    return f;
}

export function verdictActs(o) {
    const f = [];
    if (o.title !== o.expectedTitle) f.push(`goto gave title ${JSON.stringify(o.title)}, not ${JSON.stringify(o.expectedTitle)}`);
    if (o.clickCount !== '1') f.push(`click left the counter at ${JSON.stringify(o.clickCount)}, not "1"`);
    if (o.typed !== o.expectedTyped) f.push(`type gave input value ${JSON.stringify(o.typed)}, not ${JSON.stringify(o.expectedTyped)}`);
    return f;
}

export function verdictScreenshot(o) {
    if (o.deviceDpr !== o.dpr) return [`device check: the page's devicePixelRatio is ${o.deviceDpr}, not ${o.dpr}`];
    if (!o.ok) return [`screenshot failed: ${o.code}`];
    const f = [];
    if (o.size[0] !== Math.round(o.viewportCss[0] * o.dpr)) f.push(`screenshot pixel off by the DPR: the image is ${o.size[0]} px wide for a ${o.viewportCss[0]} CSS px viewport at DPR ${o.dpr}`);
    if (!sameRgb(o.inside, RED)) f.push(`screenshot pixel at CSS (${INSIDE.x}, ${INSIDE.y}) x DPR ${o.dpr} is ${JSON.stringify(o.inside)}, not the planted red`);
    if (sameRgb(o.outside, RED)) f.push(`screenshot pixel at CSS (${OUTSIDE.x}, ${OUTSIDE.y}) outside the target is red`);
    return f;
}

export function verdictFocus(o) {
    if (o.agentActiveAfterFocus !== 'in') return [`detector blind: a CLI focus never moved the agent document's activeElement (${JSON.stringify(o.agentActiveAfterFocus)})`];
    const f = [];
    if (o.before.chrome !== o.after.chrome) f.push(`chrome focus moved: ${o.before.chrome} -> ${o.after.chrome}`);
    if (o.before.userHasFocus !== o.after.userHasFocus || o.before.userActive !== o.after.userActive) f.push('user focus changed while the agent typed');
    if (o.userBlurs.length) f.push(`a user blur was recorded: ${o.userBlurs.join(', ')}`);
    if (o.chromeHitIsAgent) f.push('the agent overlay is under the pointer at its target in chrome (not parked)');
    return f;
}

export function verdictRefusals(o) {
    const f = [];
    if (o.invented.ok) f.push('an invented page id was served');
    else if (!o.invented.code) f.push('the invented page refusal carries no error.code');
    if (o.userTab !== 'not-agent-tab') f.push(`the user tab answered ${o.userTab}, not not-agent-tab`);
    if (o.stockTab !== 'unknown-tab') f.push(`the stock-window tab answered ${o.stockTab}, not unknown-tab`);
    return f;
}

export function verdictContainer(o) {
    if (!o.ownRead) return ['detector blind: the agent tab did not read the cookie it set itself'];
    if (!o.userCookieSet) return ['detector blind: the user tab did not hold its own cookie'];
    return o.userVisible ? ['the user cookie is visible to the agent tab'] : [];
}

export function verdictDecoy(o) {
    if (!o.stock?.pass) return [`detector blind: the stock decoy run did not prove both detectors (${(o.stock?.fails ?? []).join('; ') || 'no result'})`];
    const f = [];
    if (!o.createOk) f.push(`tab create through PB's orcad failed: ${o.code}`);
    if (o.title !== o.expectedTitle) f.push(`goto through PB's orcad gave ${JSON.stringify(o.title)}, not ${JSON.stringify(o.expectedTitle)}`);
    if (o.quietMs < o.minQuietMs) f.push(`judged after ${o.quietMs} ms, before the ${o.minQuietMs} ms quiet window`);
    if (o.markerPresent) f.push("a decoy marker is present: PB's orcad launched the decoy");
    return f;
}

export function verdictRenderer(o) {
    if (o.reply.code === 'browser_host_lease_stale') return ['device mismatch: the renderer create was refused with browser_host_lease_stale'];
    const f = [];
    if (o.placement.kind !== 'client') f.push(`the renderer's placement is ${o.placement.kind}, not the client host`);
    if (!o.reply.ok) f.push(`the renderer's browser.tabCreate failed: ${o.reply.code}`);
    else if (!o.createPageArrived) f.push('the renderer page did not arrive as createPage on the host');
    if (o.credential !== 'token' && o.credential !== 'device-key') f.push('the credential path was not recorded');
    return f;
}

export function verdictUserClose(o) {
    if (!o.closed) return ['the Lumino close found no agent widget'];
    return o.listedAfter ? ['the page is still listed after a user close'] : [];
}

export function verdictReload(o) {
    const f = [];
    if (o.agentWidgetsAfter > 0) f.push(`an agent widget survived a reload (${o.agentWidgetsAfter})`);
    if (!o.reattached) f.push('the host did not re-attach after the reload');
    if (o.oldListed.length) f.push(`old pages are still listed after the reload (${o.oldListed.length})`);
    return f;
}

export function verdictActivation(o) {
    if (!o.bound || !o.listed) return ['detector blind: the new page was not bound and listed before the create was judged'];
    const f = [];
    if (o.currentAfterCreate !== o.currentBefore) f.push('a tab revealed at its own create');
    if (o.userFocusAfter !== o.userFocusBefore) f.push('the user focus changed at create');
    if (!o.activationSeen) return [...f, 'detector blind: store activation not observed'];
    if (o.currentAfterActivation !== o.boundWidget || !(o.revealMs !== null && o.revealMs <= REVEAL_MS)) f.push(`the store activation revealed nothing within ${REVEAL_MS} ms`);
    return f;
}

export const VERDICTS = {
    k: verdictNoPane, a: verdictCreate, b: verdictActs, b1: verdictScreenshot, b2: verdictScreenshot, c: verdictFocus,
    d: verdictRefusals, e: verdictContainer, f: verdictDecoy, g: verdictRenderer, h: verdictUserClose, j: verdictActivation, i: verdictReload,
};

/** Every clause's fails, each prefixed by its letter; skipped clauses ({ skip }) are listed apart. */
export function judgeAll(obs) {
    const fails = [];
    const skips = [];
    for (const [k, verdict] of Object.entries(VERDICTS)) {
        if (!obs[k]) fails.push(`(${k}) broken instrument: no observation recorded`);
        else if (obs[k].skip) skips.push(`(${k}) ${obs[k].skip}`);
        else for (const s of verdict(obs[k])) fails.push(`(${k}) ${s}`);
    }
    return { fails, skips };
}

// ---------------------------------------------------------------- live run

const listIds = (r) => (r.ok ? (r.result?.tabs ?? []).map((t) => t.browserPageId) : []);
const cookieNames = (r) => (r.ok ? (r.result?.cookies ?? []).map((c) => c.name) : []);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** tab create with the addWidget clock; resolves the (a) observation plus pageId. */
async function createObserved(ctx) {
    const before = (await ctx.webTabs()).map((w) => w.id);
    const r = await ctx.cli('tab', 'create', '--worktree', ctx.worktree);
    const pageId = r.result?.browserPageId ?? null;
    const { tabs, addT } = await ctx.newWebTab(before, r.t0);
    const boundTab = pageId ? await ctx.tabOfPage(pageId) : null;
    return { ok: r.ok, code: r.error?.code ?? r.error?.message, pageId, newTabs: tabs, ms: addT === null ? null : addT - r.t0, boundTab, widgetId: tabs[0]?.id ?? null };
}

async function screenshotObserved(ctx, pageId) {
    await ctx.cli('goto', '--url', ctx.url('/agent'), '--page', pageId);
    const [w, h, deviceDpr] = (await ctx.inPage('/agent', '[innerWidth, innerHeight, devicePixelRatio]')) ?? [0, 0, null];
    const r = await ctx.cli('screenshot', '--page', pageId);
    const base = { dpr: ctx.dpr, deviceDpr, ok: r.ok && !!r.result?.path, code: r.error?.code ?? r.error?.message, viewportCss: [w, h] };
    if (!base.ok) return { ...base, size: [0, 0], inside: null, outside: null };
    const at = (p) => ({ x: Math.round(p.x * ctx.dpr), y: Math.round(p.y * ctx.dpr) });
    const { size, px } = await ctx.pixels(r.result.path, [at(INSIDE), at(OUTSIDE)]);
    return { ...base, size, inside: px[0], outside: px[1] };
}

const userFocus = (ctx) => ctx.inPage('/user', '({ hasFocus: document.hasFocus(), active: document.activeElement && (document.activeElement.id || document.activeElement.nodeName), blurs: __log.filter(e => e.type === "blur").map(e => e.target) })');

async function liveRun(log) {
    const { withBrowserSession, decoyRecordFile } = await import('./lib/orca-browser-live.mjs');
    const { ensurePbNode } = await import('./lib/orca-run.mjs');
    const { run: hiddenElectronRun } = await import('./verify-orca-hidden-electron.mjs');
    const obs = {};
    const nodeBin = (await ensurePbNode()).path;

    // (f), first half: both detectors proven on stock orcad in this invocation.
    const stock = await hiddenElectronRun({ orcaDir: join(REPO_ROOT, 'orca'), overlayDir: join(REPO_ROOT, 'orca-overlay'), nodeBin });
    log(`(f) stock decoy half: ${stock.pass ? `detectors proven (${stock.pass.stockMs} ms)` : stock.skip ? `SKIP ${stock.skip}` : stock.fails.join('; ')}`);
    const recordFile = decoyRecordFile(REPO_ROOT);
    const home = mkdtempSync(join(tmpdir(), 'pb-agent-home-'));
    mkdirSync(join(home, '.local', 'bin'), { recursive: true });
    symlinkSync(nodeBin, join(home, '.local', 'bin', 'orca-ide'));
    try {
        await withBrowserSession({ log, home }, async (ctx) => {
            const W = ctx.worktree;
            const readyAt = Date.now();
            // (k) first: no Orca pane widget, a booted bundle, the link.
            const bundleBooted = (await ctx.bundle('m.state().booted')) === true;
            const linkPresent = await ctx.linkPresent();
            await ctx.hostAttached();
            const paneWidgetsBefore = await ctx.paneWidgetCount();
            const k = await createObserved(ctx);
            obs.k = { bundleBooted, linkPresent, paneWidgetsBefore, paneWidgetsAfter: await ctx.paneWidgetCount(), newTabs: k.newTabs.length, ms: k.ms };

            // (a) with a user tab current.
            const userTab = await ctx.openWebTab(ctx.url('/user'));
            const userWidget = (await ctx.webTabs()).find((w) => w.tabId === userTab)?.id;
            await ctx.activate(userWidget);
            const a = await createObserved(ctx);
            obs.a = a;
            const page = a.pageId;

            // (c) focus, with the user's page focused first.
            await ctx.focusOverlay(userTab);
            await ctx.inPage('/user', '(document.getElementById("in").focus(), __log.length = 0, true)');
            await ctx.cli('goto', '--url', ctx.url('/agent'), '--page', page);
            const before = { chrome: await ctx.chromeActiveTabId(), ...(await userFocus(ctx)) };
            await ctx.cli('focus', '--element', '#in', '--page', page);
            const agentActiveAfterFocus = await ctx.inPage('/agent', 'document.activeElement && document.activeElement.id');
            await ctx.cli('type', '--input', 'pb-typed', '--page', page);
            const after = { chrome: await ctx.chromeActiveTabId(), ...(await userFocus(ctx)) };
            const agentTabId = a.boundTab;
            const chromeHitIsAgent = await ctx.inChrome(`const o = overlayOf(${JSON.stringify(agentTabId)}); if (!o) return false; const r = o.getBoundingClientRect();
                const e = document.elementFromPoint(r.x + ${INSIDE.x}, r.y + ${INSIDE.y}); return W.tabIdOfBrowser(e) === ${JSON.stringify(agentTabId)};`);
            obs.c = { agentActiveAfterFocus, before: { chrome: before.chrome, userHasFocus: before.hasFocus, userActive: before.active }, after: { chrome: after.chrome, userHasFocus: after.hasFocus, userActive: after.active }, userBlurs: after.blurs ?? [], chromeHitIsAgent };

            // (b) goto, click, type; (b1) screenshot at DPR 1.
            const g = await ctx.cli('goto', '--url', ctx.url('/agent'), '--page', page);
            await ctx.cli('click', '--element', '#btn', '--page', page);
            const clickCount = await ctx.inPage('/agent', 'document.getElementById("btn").dataset.count || "0"');
            await ctx.cli('focus', '--element', '#in', '--page', page);
            await ctx.cli('type', '--input', 'pb-typed', '--page', page);
            obs.b = { title: g.result?.title ?? null, expectedTitle: 'PB agent fixture', clickCount, typed: await ctx.inPage('/agent', 'document.getElementById("in").value'), expectedTyped: 'pb-typed' };
            obs.b1 = await screenshotObserved(ctx, page);

            // (d) refusals, naming a real user tab and a real stock-window tab.
            const invented = await ctx.cli('goto', '--url', ctx.url('/agent2'), '--page', 'pb-invented-page');
            const stockContext = await ctx.openStock();
            const stockBrowserId = (await ctx.stockChrome(stockContext)).browserId;
            obs.d = {
                invented: { ok: invented.ok, code: invented.error?.code ?? null },
                userTab: (await ctx.agentRaw(userTab, 'browser.cookie.get', {}))?.where ?? 'no reply',
                stockTab: (await ctx.agentRaw(`stock-${stockBrowserId}`, 'browser.cookie.get', {}))?.where ?? 'no reply',
            };

            // (e) container: own cookie first, then the user's.
            await ctx.cli('cookie', 'set', '--name', 'pbagent', '--value', '1', '--page', page);
            const ownRead = cookieNames(await ctx.cli('cookie', 'get', '--page', page)).includes('pbagent');
            await ctx.probe(`return await get('WebTabChannel').widgetOf(${JSON.stringify(userTab)}).navigate(${JSON.stringify(ctx.url('/cookie'))});`);
            await ctx.pollFor(() => ctx.inPage('/cookie', 'document.readyState === "complete"'), 10000, 'the cookie page').catch(() => null);
            const userCookieSet = String(await ctx.inPage('/cookie', 'document.cookie')).includes('pbuser=1');
            obs.e = { ownRead, userCookieSet, userVisible: cookieNames(await ctx.cli('cookie', 'get', '--page', page)).includes('pbuser') };

            // (f) second half, in the scratch HOME holding the decoy.
            if (stock.skip) obs.f = { skip: stock.skip };
            else {
                const fCreate = await ctx.cli('tab', 'create', '--worktree', W);
                const fPage = fCreate.result?.browserPageId;
                const fGoto = fPage ? await ctx.cli('goto', '--url', ctx.url('/agent2'), '--page', fPage) : { result: null };
                const minQuietMs = Math.max(10000, 2 * (stock.pass?.stockMs ?? 0));
                const waited = Date.now() - readyAt;
                if (waited < minQuietMs) await sleep(minQuietMs - waited);
                const roots = [ctx.state.dataRoot, ctx.state.effectiveRoot].filter(Boolean);
                obs.f = { stock, createOk: fCreate.ok, code: fCreate.error?.code, title: fGoto.result?.title ?? null, expectedTitle: 'PB agent fixture two', quietMs: Date.now() - readyAt, minQuietMs, markerPresent: roots.some((r) => existsSync(join(r, recordFile))) };
            }

            // (g) the renderer path through the pane client's own connection.
            obs.g = await ctx.probe(`const api = window.api && window.api.runtimeEnvironments;
                const link = globalThis[Symbol.for('powerbrowser.orca-browser.link')];
                if (!api || !link) return { placement: { kind: 'none' }, reply: { ok: false, code: 'no window.api or link' }, createPageArrived: false, credential: null };
                const placement = await api.prepareBrowserClientHostPlacement({ selector: 'active' });
                let credential = null;
                try { credential = (await link.connection()).credential.kind; } catch (e) { credential = null; }
                const r = await api.call({ selector: 'active', method: 'browser.tabCreate', params: { worktree: ${JSON.stringify(W)}, ...(placement.kind === 'client' ? { placement } : {}), navigation: 'caller', waitForRegistration: false }, timeoutMs: 15000 });
                const pageId = r && r.ok && r.result ? r.result.browserPageId : null;
                const arrived = pageId ? await until(() => !!get('OrcaBrowserPages').tabOf(pageId), 5000) : false;
                return { placement: { kind: placement.kind }, reply: { ok: !!(r && r.ok), code: r && r.error ? r.error.code : null }, createPageArrived: arrived, credential };`, 60000);

            // (h) user close of the (a) tab.
            const closed = a.widgetId ? await ctx.luminoClose(a.widgetId) : false;
            let listedAfter = true;
            for (let i = 0; i < 20 && listedAfter; i++) { await sleep(250); listedAfter = listIds(await ctx.cli('tab', 'list', '--worktree', W)).includes(page); }
            obs.h = { closed, listedAfter };

            // (j) activation: create with the user tab current, then a store activation.
            await ctx.activate(userWidget);
            await ctx.focusOverlay(userTab);
            const currentBefore = await ctx.currentId();
            const userFocusBefore = JSON.stringify(await ctx.inPage('/cookie', 'document.hasFocus()'));
            const j = await createObserved(ctx);
            const listed = listIds(await ctx.cli('tab', 'list', '--worktree', W)).includes(j.pageId);
            const currentAfterCreate = await ctx.currentId();
            const userFocusAfter = JSON.stringify(await ctx.inPage('/cookie', 'document.hasFocus()'));
            const tSwitch = Date.now();
            await ctx.cli('tab', 'switch', '--page', j.pageId, '--worktree', W);
            let tAct = null;
            for (let i = 0; i < 40 && tAct === null; i++) {
                const hit = (await ctx.paneLog(tSwitch)).find((e) => e.browser.some((r) => r.id === j.pageId && r.active));
                if (hit) tAct = hit.t; else await sleep(125);
            }
            let currentAfterActivation = null;
            let revealMs = null;
            if (tAct !== null) {
                for (let i = 0; i < 12 && currentAfterActivation !== j.widgetId; i++) { currentAfterActivation = await ctx.currentId(); if (currentAfterActivation !== j.widgetId) await sleep(100); }
                if (currentAfterActivation === j.widgetId) revealMs = Date.now() - tAct;
            }
            obs.j = { bound: !!j.boundTab, listed, currentBefore, currentAfterCreate, userFocusBefore, userFocusAfter, activationSeen: tAct !== null, boundWidget: j.widgetId, currentAfterActivation, revealMs };

            // (i) reload, last.
            const oldPages = listIds(await ctx.cli('tab', 'list', '--worktree', W));
            await ctx.app.evaluate('(location.reload(), true)').catch(() => undefined);
            await sleep(2000);
            const reattached = await ctx.pollFor(async () => { try { return await ctx.hostAttached(); } catch { return null; } }, 180000, 'the host to re-attach').catch(() => false);
            let oldListed = oldPages;
            for (let i = 0; i < 40 && oldListed.length; i++) { await sleep(250); const now = listIds(await ctx.cli('tab', 'list', '--worktree', W)); oldListed = oldPages.filter((p) => now.includes(p)); }
            obs.i = { agentWidgetsAfter: (await ctx.webTabs()).filter((w) => w.agent).length, reattached: reattached === true, oldListed };
        });
        // (b2) the screenshot half in a second launch at DPR 2.
        await withBrowserSession({ log, dpr: 2 }, async (ctx) => {
            await ctx.hostAttached();
            const c = await createObserved(ctx);
            obs.b2 = c.pageId ? await screenshotObserved(ctx, c.pageId) : { dpr: 2, deviceDpr: 2, ok: false, code: c.code, size: [0, 0], viewportCss: [0, 0] };
        });
    } finally {
        rmSync(home, { recursive: true, force: true });
    }
    return obs;
}

async function main() {
    const pre = prerequisites(REPO_ROOT);
    if (pre.skip) { console.log(`${NAME}: SKIP -- ${pre.skip}`); return 0; }
    if (pre.fail) { console.error(`${NAME}: FAIL -- ${pre.fail}`); return 1; }
    const log = (s) => console.log(`${NAME}: ${s}`);
    let obs;
    try { obs = await liveRun(log); } catch (e) { console.error(`${NAME}: FAIL -- harness: ${String(e?.message ?? e).split('\n')[0]}`); return 1; }
    const { fails, skips } = judgeAll(obs);
    for (const s of skips) console.log(`${NAME}: SKIP ${s}`);
    if (fails.length) { for (const f of fails) console.error(`${NAME}: FAIL -- ${f}`); return 1; }
    const g = obs.g.credential;
    console.log(`${NAME}: PASS -- (k) no-pane create one tab in ${obs.k.ms} ms; (a) one background agent tab in ${obs.a.ms} ms; (b) goto, click, type, screenshot at DPR 1 and 2; (c) parked focus held; (d) refusals; (e) container; (f) ${obs.f.skip ? 'SKIP' : 'no decoy'}; (g) renderer createPage over ${g}; (h) user close; (j) reveal in ${obs.j.revealMs} ms after store activation; (i) reload`);
    return 0;
}

// ---------------------------------------------------------------- self-test

const CONTROL = {
    k: { bundleBooted: true, linkPresent: true, paneWidgetsBefore: 0, paneWidgetsAfter: 0, newTabs: 1, ms: 180 },
    a: { ok: true, code: null, pageId: 'p1', newTabs: [{ tabId: 't1', agent: true, current: false }], ms: 170, boundTab: 't1' },
    b: { title: 'PB agent fixture', expectedTitle: 'PB agent fixture', clickCount: '1', typed: 'pb-typed', expectedTyped: 'pb-typed' },
    b1: { dpr: 1, deviceDpr: 1, ok: true, size: [800, 600], viewportCss: [800, 600], inside: [255, 0, 0], outside: [255, 255, 255] },
    b2: { dpr: 2, deviceDpr: 2, ok: true, size: [1600, 1200], viewportCss: [800, 600], inside: [255, 0, 0], outside: [255, 255, 255] },
    c: { agentActiveAfterFocus: 'in', before: { chrome: 'u', userHasFocus: true, userActive: 'in' }, after: { chrome: 'u', userHasFocus: true, userActive: 'in' }, userBlurs: [], chromeHitIsAgent: false },
    d: { invented: { ok: false, code: 'browser_unavailable' }, userTab: 'not-agent-tab', stockTab: 'unknown-tab' },
    e: { ownRead: true, userCookieSet: true, userVisible: false },
    f: { stock: { pass: { stockMs: 900 } }, createOk: true, title: 'PB agent fixture two', expectedTitle: 'PB agent fixture two', quietMs: 30000, minQuietMs: 10000, markerPresent: false },
    g: { placement: { kind: 'client' }, reply: { ok: true, code: null }, createPageArrived: true, credential: 'device-key' },
    h: { closed: true, listedAfter: false },
    j: { bound: true, listed: true, currentBefore: 'u', currentAfterCreate: 'u', userFocusBefore: 'true', userFocusAfter: 'true', activationSeen: true, boundWidget: 'w2', currentAfterActivation: 'w2', revealMs: 140 },
    i: { agentWidgetsAfter: 0, reattached: true, oldListed: [] },
};

const set = (clause, patch) => (o) => ({ ...o, [clause]: { ...o[clause], ...patch } });
const PLANTS = [
    ['two-tabs-one-page', set('a', { newTabs: [{ tabId: 't1', agent: true, current: false }, { tabId: 't9', agent: true, current: false }] }), 'two tabs for one page'],
    ['tab-current-at-create', set('a', { newTabs: [{ tabId: 't1', agent: true, current: true }] }), 'a tab current at create'],
    ['create-slower-than-1s', set('a', { ms: 1400 }), 'create slower than 1000 ms'],
    ['screenshot-off-by-dpr', set('b2', { size: [800, 600], inside: [255, 255, 255] }), 'screenshot pixel off by the DPR'],
    ['user-blur-recorded', set('c', { userBlurs: ['in'] }), 'a user blur was recorded'],
    ['chrome-focus-change', set('c', { after: { chrome: 'a', userHasFocus: true, userActive: 'in' } }), 'chrome focus moved'],
    ['focus-detector-blind', set('c', { agentActiveAfterFocus: 'BODY', userBlurs: [] }), 'detector blind'],
    ['user-tab-answers-done', set('d', { userTab: 'done' }), 'the user tab answered done'],
    ['user-cookie-visible', set('e', { userVisible: true }), 'the user cookie is visible'],
    ['own-cookie-unread', set('e', { ownRead: false, userVisible: false }), 'detector blind'],
    ['decoy-without-detectors', set('f', { stock: { fails: ['the warning was not printed'] } }), 'detector blind'],
    ['decoy-marker-present', set('f', { markerPresent: true }), 'a decoy marker is present'],
    ['device-mismatch-lease-stale', set('g', { reply: { ok: false, code: 'browser_host_lease_stale' } }), 'browser_host_lease_stale'],
    ['page-listed-after-close', set('h', { listedAfter: true }), 'still listed after a user close'],
    ['agent-widget-survives-reload', set('i', { agentWidgetsAfter: 1 }), 'an agent widget survived a reload'],
    ['tab-revealed-at-create', set('j', { currentAfterCreate: 'w2' }), 'a tab revealed at its own create'],
    ['activation-revealed-nothing', set('j', { currentAfterActivation: 'u', revealMs: null }), 'revealed nothing'],
    ['activation-detector-blind', set('j', { activationSeen: false, currentAfterActivation: 'w2', revealMs: 10 }), 'store activation not observed'],
    ['orca-pane-during-no-pane', set('k', { paneWidgetsAfter: 1 }), 'Orca-pane widget present'],
    ['no-web-tab-from-no-pane', set('k', { newTabs: 0, ms: null }), 'no web tab from the no-pane create'],
    ['stock-tab-not-unknown', set('d', { stockTab: 'not-agent-tab' }), 'the stock-window tab answered'],
    ['invented-page-served', set('d', { invented: { ok: true, code: null } }), 'an invented page id was served'],
    ['no-pane-detector-blind', set('k', { linkPresent: false }), 'detector blind'],
];

export function runSelfTest() {
    const control = judgeAll(CONTROL);
    if (control.fails.length || control.skips.length) { console.error(`${NAME} self-test: FAIL -- control is not green: ${[...control.fails, ...control.skips].join(' | ')}`); return 1; }
    console.log(`${NAME} self-test: control green -- ${Object.keys(VERDICTS).length} clause observations`);
    let failures = 0;
    for (const [name, plant, naming] of PLANTS) {
        const r = judgeAll(plant(CONTROL));
        if (!r.fails.some((s) => s.includes(naming))) { console.error(`  FAIL ${name} -> ${r.fails.join(' | ') || 'green'} (expected '${naming}')`); failures++; } else console.log(`  ok ${name} -> red, naming '${naming}'`);
    }
    // The (f) clause with a skipped stock half is a named SKIP, never a PASS of the absence.
    const skipped = judgeAll({ ...CONTROL, f: { skip: 'an installed Orca exists' } });
    if (skipped.fails.length || skipped.skips.length !== 1) { console.error('  FAIL decoy-skip -> the skipped decoy clause was not reported as a SKIP'); failures++; } else console.log('  ok decoy-skip -> (f) reported as a named SKIP');
    if (failures) { console.error(`${NAME} self-test: FAIL -- ${failures} case(s) did not behave`); return 1; }
    console.log(`${NAME} self-test: PASS -- ${PLANTS.length} planted faults each went red naming the drift`);
    return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const arg = process.argv[2];
    if (arg && arg !== '--self-test') { console.error('usage: node scripts/verify-orca-browser-agent-live.mjs [--self-test]'); process.exit(2); }
    process.exit(arg === '--self-test' ? runSelfTest() : await main());
}
