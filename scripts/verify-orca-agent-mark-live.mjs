#!/usr/bin/env node
// scripts/verify-orca-agent-mark-live.mjs
//
// orca-agent-mark-live (Phase 66, BRW-04; P66-30, P66-21, P66-22, Pitfall 8, CLAUDE.md
// verification rule 1; ROADMAP Phase 66 criterion 3): while an Orca agent drives a web tab
// the chrome bar shows the mark and the tab title carries its class; the mark clears after
// Orca's 20 s idle window; Stop ends control for the tab's lifetime; a stock browser window
// never shows the mark and its chrome is unchanged.
//
// Steps, in order:
//  1. A stock window opened through openStockTab (the GUI-01 command) before any agent
//     activity: its toolbar and tab-strip node set is the baseline.
//  2. CLI tab create, the agent widget made current, a CLI click: the chrome bar's
//     .pb-chrome-bar-agent element and the title class pb-agent-controlled are present
//     (the positive read of the detector the absence below reuses).
//  3. 21 s with no command: both gone.
//  4. A CLI click again, then a click on the chrome bar's Stop: the mark is gone, the
//     widget records stopped, and the next CLI command fails with browser_owner_unavailable
//     in error.message (error.code is runtime_error, Pitfall 8).
//  5. Only after step 2 proved the mark: openStockTab again (the GUI-01 command puts the page
//     in the existing stock window as a tab, not in a second window, 66-06), and that stock
//     window has no mark element and a node set equal to the baseline.
// Each judgment is a pure exported verdict over the recorded observation.
//
// Tier: full, under flock /home/chris/coding/Power-Browser/.git/pb-live.lock; the same named
// SKIP rule as orca-browser-agent-live (scripts/lib/orca-browser-live.mjs prerequisites).
// --self-test is quick and hermetic.
//
// Usage:
//   node scripts/verify-orca-agent-mark-live.mjs
//   node scripts/verify-orca-agent-mark-live.mjs --self-test

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { prerequisites } from './lib/orca-browser-live.mjs';

const NAME = 'orca-agent-mark-live';
const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
/** Orca's ACTIVITY_IDLE_MS (20000) plus a second of margin. */
export const IDLE_WAIT_MS = 21000;
export const OWNER_CODE = 'browser_owner_unavailable';

/**
 * o: { order: string[] (the step names in the order they ran), driving: { mark, titleClass },
 * idle: { mark, titleClass }, stopped: { clicked, mark, stopped }, next: { ok, code, message },
 * baseline: string[], stock: { mark, nodes } }.
 */
export function verdictMark(o) {
    const f = [];
    if (!o.driving.mark) f.push('the mark is absent while the CLI drives the tab');
    if (!o.driving.titleClass) f.push('the title class pb-agent-controlled is absent while the CLI drives the tab');
    if (o.idle.mark || o.idle.titleClass) f.push(`the mark survived the idle window (mark ${o.idle.mark}, title class ${o.idle.titleClass})`);
    if (!o.stopped.clicked) f.push('broken instrument: the Stop button was not on screen to click');
    if (o.stopped.mark || !o.stopped.stopped || o.next.ok) f.push(`Stop did not end control (mark ${o.stopped.mark}, stopped ${o.stopped.stopped}, next command ok ${o.next.ok})`);
    else if (!String(o.next.message).includes(OWNER_CODE)) f.push(`the next command's error.message does not carry ${OWNER_CODE} (code ${o.next.code}, read from error.message only)`);
    const proven = o.order.indexOf('markProven');
    const checked = o.order.indexOf('stockCheck');
    if (proven < 0 || checked < 0 || checked < proven) f.push('absence before detector: the stock window was judged before the mark was proven present in this run');
    if (o.stock.mark) f.push('the stock window shows the agent mark');
    if (JSON.stringify(o.stock.nodes) !== JSON.stringify(o.baseline)) f.push(`the stock window chrome differs from the baseline (${o.stock.nodes.length} nodes vs ${o.baseline.length})`);
    if (o.baseline.length === 0) f.push('broken instrument: the baseline stock chrome has no nodes');
    return f;
}

async function liveRun(log) {
    const { withBrowserSession } = await import('./lib/orca-browser-live.mjs');
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    return withBrowserSession({ log }, async (ctx) => {
        const order = [];
        await ctx.hostAttached();
        const first = await ctx.openStock();
        const baseline = (await ctx.stockChrome(first)).nodes;
        order.push('baseline');

        const before = (await ctx.webTabs()).map((w) => w.id);
        const created = await ctx.cli('tab', 'create', '--worktree', ctx.worktree);
        const page = created.result?.browserPageId;
        const { tabs } = await ctx.newWebTab(before, created.t0);
        const widgetId = tabs[0]?.id;
        if (!page || !widgetId) throw new Error(`tab create gave no agent web tab (${created.error?.code ?? 'no page id'})`);
        await ctx.cli('goto', '--url', ctx.url('/agent'), '--page', page);
        await ctx.activate(widgetId);
        await ctx.cli('click', '--element', '#btn', '--page', page);
        const read = async () => { const s = await ctx.markState(widgetId); return { mark: s.mark, titleClass: s.titleClass && s.domTitleClass, stopped: !!s.control?.stopped }; };
        const driving = await ctx.pollFor(async () => { const s = await read(); return s.mark && s.titleClass ? s : null; }, 5000, 'the mark').catch(() => read());
        if (driving.mark) order.push('markProven');
        log(`mark while driving: ${driving.mark}, title class ${driving.titleClass}`);

        await sleep(IDLE_WAIT_MS);
        const idle = await read();
        order.push('idle');

        await ctx.cli('click', '--element', '#btn', '--page', page);
        await ctx.pollFor(async () => (await read()).mark || null, 5000, 'the mark again').catch(() => null);
        const clicked = await ctx.clickStop();
        const stoppedState = await ctx.pollFor(async () => { const s = await read(); return s.stopped && !s.mark ? s : null; }, 5000, 'stop').catch(() => read());
        const next = await ctx.cli('click', '--element', '#btn', '--page', page);
        order.push('stop');

        const second = await ctx.openStock();
        const stock = await ctx.stockChrome(second);
        order.push('stockCheck');
        return {
            order, baseline, driving, idle,
            stopped: { clicked, mark: stoppedState.mark, stopped: stoppedState.stopped },
            next: { ok: next.ok, code: next.error?.code ?? null, message: next.error?.message ?? '' },
            stock: { mark: stock.mark, nodes: stock.nodes },
        };
    });
}

async function main() {
    const pre = prerequisites(REPO_ROOT);
    if (pre.skip) { console.log(`${NAME}: SKIP -- ${pre.skip}`); return 0; }
    if (pre.fail) { console.error(`${NAME}: FAIL -- ${pre.fail}`); return 1; }
    let o;
    try { o = await liveRun((s) => console.log(`${NAME}: ${s}`)); } catch (e) { console.error(`${NAME}: FAIL -- harness: ${String(e?.message ?? e).split('\n')[0]}`); return 1; }
    const fails = verdictMark(o);
    if (fails.length) { for (const f of fails) console.error(`${NAME}: FAIL -- ${f}`); return 1; }
    console.log(`${NAME}: PASS -- mark and title class while driving, cleared after ${IDLE_WAIT_MS} ms idle, Stop ended control (${OWNER_CODE} in error.message), stock window unmarked with chrome equal to the baseline (${o.baseline.length} nodes)`);
    return 0;
}

// ---------------------------------------------------------------- self-test

const CONTROL = {
    order: ['baseline', 'markProven', 'idle', 'stop', 'stockCheck'],
    driving: { mark: true, titleClass: true },
    idle: { mark: false, titleClass: false },
    stopped: { clicked: true, mark: false, stopped: true },
    next: { ok: false, code: 'runtime_error', message: OWNER_CODE },
    baseline: ['toolbar#nav-bar', 'toolbar#TabsToolbar'],
    stock: { mark: false, nodes: ['toolbar#nav-bar', 'toolbar#TabsToolbar'] },
};

const PLANTS = [
    ['mark-absent-while-driving', (o) => ({ ...o, driving: { mark: false, titleClass: true } }), 'the mark is absent while the CLI drives'],
    ['title-class-absent', (o) => ({ ...o, driving: { mark: true, titleClass: false } }), 'the title class pb-agent-controlled is absent'],
    ['mark-survives-idle', (o) => ({ ...o, idle: { mark: true, titleClass: false } }), 'the mark survived the idle window'],
    ['stop-not-ending-control', (o) => ({ ...o, next: { ok: true, code: null, message: '' } }), 'Stop did not end control'],
    ['code-read-from-error-code', (o) => ({ ...o, next: { ok: false, code: OWNER_CODE, message: 'runtime_error' } }), 'read from error.message only'],
    ['stock-check-before-mark', (o) => ({ ...o, order: ['baseline', 'stockCheck', 'markProven', 'idle', 'stop'] }), 'absence before detector'],
    ['stock-chrome-differs', (o) => ({ ...o, stock: { mark: false, nodes: ['toolbar#nav-bar', 'toolbar#TabsToolbar', 'toolbar#pb-extra'] } }), 'the stock window chrome differs from the baseline'],
    ['stock-shows-mark', (o) => ({ ...o, stock: { ...o.stock, mark: true } }), 'the stock window shows the agent mark'],
];

export function runSelfTest() {
    const control = verdictMark(CONTROL);
    if (control.length) { console.error(`${NAME} self-test: FAIL -- control is not green: ${control.join(' | ')}`); return 1; }
    console.log(`${NAME} self-test: control green -- driving, idle, Stop and the stock window`);
    let failures = 0;
    for (const [name, plant, naming] of PLANTS) {
        const r = verdictMark(plant(CONTROL));
        if (!r.some((s) => s.includes(naming))) { console.error(`  FAIL ${name} -> ${r.join(' | ') || 'green'} (expected '${naming}')`); failures++; } else console.log(`  ok ${name} -> red, naming '${naming}'`);
    }
    if (failures) { console.error(`${NAME} self-test: FAIL -- ${failures} plant(s) did not go red naming the drift`); return 1; }
    console.log(`${NAME} self-test: PASS -- ${PLANTS.length} planted faults each went red naming the drift`);
    return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const arg = process.argv[2];
    if (arg && arg !== '--self-test') { console.error('usage: node scripts/verify-orca-agent-mark-live.mjs [--self-test]'); process.exit(2); }
    process.exit(arg === '--self-test' ? runSelfTest() : await main());
}
