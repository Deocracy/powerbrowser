#!/usr/bin/env node
// scripts/verify-orca-agent-mark-live.mjs
//
// orca-agent-mark-live (Phase 66, BRW-04; P66-30, P66-21, P66-22, Pitfall 8, CLAUDE.md
// verification rule 1; ROADMAP Phase 66 criterion 3; agent-browser-04 of the v1.7 audit): every agent
// web tab carries the chrome bar's agent mark and the title class for its whole life; while an Orca
// agent drives it the mark reads the control label; Orca's 20 s idle window clears control but not the
// mark; Stop on one agent tab stops every agent tab of the frontend and refuses new agent tabs until
// Resume; a stock browser window never shows the mark and its chrome is unchanged.
//
// Steps, in order:
//  1. A stock window opened through openStockTab (the GUI-01 command) before any agent
//     activity: its toolbar and tab-strip node set is the baseline.
//  2. CLI tab create (tab A), the agent widget made current, a CLI click: the chrome bar's
//     .pb-chrome-bar-agent element reads the control label, the title class pb-agent-controlled is
//     present and the widget records agent control (the positive read the stock check below reuses).
//  3. 21 s with no command: control is cleared, the mark stays and reads the idle label, the title
//     class stays.
//  4. A second agent tab (tab B), a CLI click on A, then a click on the mark's Stop: A records stopped,
//     its mark reads the stopped label with a Resume button, and A's next CLI command fails with
//     browser_owner_unavailable in error.message (error.code is runtime_error, Pitfall 8). B records
//     stopped and its next command fails the same way, and a CLI tab create is refused with that code.
//  5. A click on Resume: neither tab records stopped, and A's next CLI command succeeds.
//  6. Only after step 2 proved the mark: openStockTab again (the GUI-01 command puts the page
//     in the existing stock window as a tab, not in a second window, 66-06), and that stock
//     window has no mark element and a node set equal to the baseline.
// The labels are read from theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts, never spelled here.
// Each judgment is a pure exported verdict over the recorded observation.
//
// Tier: full. The row takes the live lock itself (scripts/lib/live-lock.mjs). FAIL when a merged-tree
// marker is absent; a named SKIP (exit 77) only without a built PowerBrowser, Theia app or orcad
// (scripts/lib/orca-browser-live.mjs prerequisites). --self-test is quick and hermetic.
//
// Usage:
//   node scripts/verify-orca-agent-mark-live.mjs
//   node scripts/verify-orca-agent-mark-live.mjs --self-test

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { prerequisites } from './lib/orca-browser-live.mjs';
import { holdLiveLock, lockWiringFails } from './lib/live-lock.mjs';
import { SKIP_EXIT, skipLine } from './lib/skip-verdict.mjs';
import { uncoveredMessages } from './lib/verdict-coverage.mjs';

const NAME = 'orca-agent-mark-live';
const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const COPY_REL = 'theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts';
/** Orca's ACTIVITY_IDLE_MS (20000) plus a second of margin. */
export const IDLE_WAIT_MS = 21000;
export const OWNER_CODE = 'browser_owner_unavailable';

/** The mark's labels and its button texts, from the chrome bar's copy table. Throws when one moved. */
export function markLabels(root = REPO_ROOT) {
    const src = readFileSync(join(root, COPY_REL), 'utf8');
    const out = {};
    for (const [k, key] of [['control', 'agentControlLabel'], ['idle', 'agentIdleLabel'], ['stopped', 'agentStoppedLabel'], ['stop', 'agentStopLabel'], ['resume', 'agentResumeLabel']]) {
        const m = new RegExp(`\\b${key}:\\s*'([^']+)'`).exec(src);
        if (!m) throw new Error(`source moved: no ${key} literal in ${COPY_REL}`);
        out[k] = m[1];
    }
    return out;
}

const said = (r) => `${r.code ?? ''} ${r.message ?? ''}`;

/**
 * o: { labels, order: string[] (the step names in the order they ran), driving: { mark, label, titleClass, active },
 * idle: { mark, label, titleClass, active }, stopped: { clicked, mark, label, button, stopped, active },
 * next: { ok, code, message }, other: { stopped, next }, create: { ok, code, message },
 * resumed: { clicked, stopped, otherStopped, next }, baseline: string[], stock: { mark, nodes } }.
 */
export function verdictMark(o) {
    const f = [];
    const L = o.labels;
    if (!o.driving.mark) f.push('the mark is absent while the CLI drives the tab');
    else if (o.driving.label !== L.control) f.push(`the mark reads ${JSON.stringify(o.driving.label)} while the CLI drives the tab, not the control label ${JSON.stringify(L.control)}`);
    if (!o.driving.titleClass) f.push('the title class pb-agent-controlled is absent while the CLI drives the tab');
    if (!o.driving.active) f.push('the widget records no agent control while the CLI drives the tab');
    // agent-browser-04: the idle window clears control; the mark and the title class stay for the tab's whole life.
    if (o.idle.active) f.push('agent control survived the idle window');
    if (!o.idle.mark || o.idle.label !== L.idle) f.push(`the idle agent tab lost its mark (mark ${o.idle.mark}, label ${JSON.stringify(o.idle.label)}, not the idle label ${JSON.stringify(L.idle)})`);
    if (!o.idle.titleClass) f.push('the idle agent tab lost the title class pb-agent-controlled');
    if (o.stopped.clicked !== L.stop) f.push(`broken instrument: the mark's button read ${JSON.stringify(o.stopped.clicked)}, not ${JSON.stringify(L.stop)}, so Stop was not clicked`);
    else {
        if (!o.stopped.stopped || o.stopped.active || o.next.ok) f.push(`Stop did not end control (stopped ${o.stopped.stopped}, active ${o.stopped.active}, next command ok ${o.next.ok})`);
        else if (!String(o.next.message).includes(OWNER_CODE)) f.push(`the next command's error.message does not carry ${OWNER_CODE} (code ${o.next.code}, read from error.message only)`);
        if (!o.stopped.mark || o.stopped.label !== L.stopped || o.stopped.button !== L.resume) f.push(`the stopped tab's mark reads ${JSON.stringify(o.stopped.label)} with the button ${JSON.stringify(o.stopped.button)}, not ${JSON.stringify(L.stopped)} with ${JSON.stringify(L.resume)}`);
        if (!o.other.stopped || o.other.next.ok) f.push(`Stop did not reach the frontend's other agent tab (stopped ${o.other.stopped}, its next command ok ${o.other.next.ok})`);
        else if (!String(o.other.next.message).includes(OWNER_CODE)) f.push(`the other agent tab's next command does not carry ${OWNER_CODE} in error.message (code ${o.other.next.code})`);
        if (o.create.ok) f.push('a new agent tab was created while agents were stopped');
        else if (!said(o.create).includes(OWNER_CODE)) f.push(`the refused tab create does not carry ${OWNER_CODE} (${said(o.create).trim() || 'no error'})`);
        if (o.resumed.clicked !== L.resume) f.push(`broken instrument: the stopped mark's button read ${JSON.stringify(o.resumed.clicked)}, not ${JSON.stringify(L.resume)}, so Resume was not clicked`);
        else if (o.resumed.stopped || o.resumed.otherStopped || !o.resumed.next.ok) f.push(`Resume did not give control back (stopped ${o.resumed.stopped}, other tab stopped ${o.resumed.otherStopped}, next command ok ${o.resumed.next.ok})`);
    }
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
    const labels = markLabels();
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    return withBrowserSession({ log }, async (ctx) => {
        const order = [];
        await ctx.hostAttached();
        const first = await ctx.openStock();
        const baseline = (await ctx.stockChrome(first)).nodes;
        order.push('baseline');

        const create = async () => {
            const before = (await ctx.webTabs()).map((w) => w.id);
            const created = await ctx.cli('tab', 'create', '--worktree', ctx.worktree);
            const page = created.result?.browserPageId;
            const { tabs } = await ctx.newWebTab(before, created.t0);
            return { created, page, widgetId: tabs[0]?.id };
        };
        const a = await create();
        if (!a.page || !a.widgetId) throw new Error(`tab create gave no agent web tab (${a.created.error?.code ?? 'no page id'})`);
        const { page, widgetId } = a;
        await ctx.cli('goto', '--url', ctx.url('/agent'), '--page', page);
        await ctx.activate(widgetId);
        await ctx.cli('click', '--element', '#btn', '--page', page);
        const read = async (id = widgetId) => {
            const s = await ctx.markState(id);
            return { mark: s.mark, label: s.label, button: s.button, titleClass: s.titleClass && s.domTitleClass, active: !!s.control?.active, stopped: !!s.control?.stopped };
        };
        const driving = await ctx.pollFor(async () => { const s = await read(); return s.mark && s.titleClass && s.active ? s : null; }, 5000, 'the mark').catch(() => read());
        if (driving.mark) order.push('markProven');
        log(`mark while driving: ${driving.mark} (${driving.label}), title class ${driving.titleClass}, control ${driving.active}`);

        await sleep(IDLE_WAIT_MS);
        const idle = await read();
        order.push('idle');

        const b = await create();
        if (!b.page || !b.widgetId) throw new Error(`the second tab create gave no agent web tab (${b.created.error?.code ?? 'no page id'})`);
        await ctx.cli('goto', '--url', ctx.url('/agent2'), '--page', b.page);
        await ctx.activate(widgetId);
        await ctx.cli('click', '--element', '#btn', '--page', page);
        await ctx.pollFor(async () => (await read()).active || null, 5000, 'control again').catch(() => null);
        const clicked = await ctx.clickStop();
        const stopped = await ctx.pollFor(async () => { const s = await read(); return s.stopped && !s.active ? s : null; }, 5000, 'stop').catch(() => read());
        const next = await ctx.cli('click', '--element', '#btn', '--page', page);
        const other = await ctx.pollFor(async () => { const s = await read(b.widgetId); return s.stopped ? s : null; }, 5000, 'the other tab stopped').catch(() => read(b.widgetId));
        const otherNext = await ctx.cli('click', '--element', '#btn', '--page', b.page);
        const refused = await ctx.cli('tab', 'create', '--worktree', ctx.worktree);
        order.push('stop');

        await ctx.activate(widgetId);
        const resumeClicked = await ctx.clickStop();
        const resumed = await ctx.pollFor(async () => { const s = await read(); return !s.stopped ? s : null; }, 5000, 'resume').catch(() => read());
        const resumedOther = await read(b.widgetId);
        const resumedNext = await ctx.cli('click', '--element', '#btn', '--page', page);
        order.push('resume');

        const second = await ctx.openStock();
        const stock = await ctx.stockChrome(second);
        order.push('stockCheck');
        const outcome = (r) => ({ ok: r.ok, code: r.error?.code ?? null, message: r.error?.message ?? '' });
        return {
            labels, order, baseline, driving, idle,
            stopped: { clicked, mark: stopped.mark, label: stopped.label, button: stopped.button, stopped: stopped.stopped, active: stopped.active },
            next: outcome(next),
            other: { stopped: other.stopped, next: outcome(otherNext) },
            create: outcome(refused),
            resumed: { clicked: resumeClicked, stopped: resumed.stopped, otherStopped: resumedOther.stopped, next: outcome(resumedNext) },
            stock: { mark: stock.mark, nodes: stock.nodes },
        };
    });
}

async function main() {
    const pre = prerequisites(REPO_ROOT);
    if (pre.fail) { console.error(`${NAME}: FAIL -- ${pre.fail}`); return 1; }
    if (pre.skip) { console.log(skipLine(NAME, pre.skip)); return SKIP_EXIT; }
    let o;
    try { o = await liveRun((s) => console.log(`${NAME}: ${s}`)); } catch (e) { console.error(`${NAME}: FAIL -- harness: ${String(e?.message ?? e).split('\n')[0]}`); return 1; }
    const fails = verdictMark(o);
    if (fails.length) { for (const f of fails) console.error(`${NAME}: FAIL -- ${f}`); return 1; }
    console.log(`${NAME}: PASS -- mark "${o.labels.control}" and title class while driving; after ${IDLE_WAIT_MS} ms idle control cleared and the mark kept "${o.labels.idle}"; Stop stopped both agent tabs (${OWNER_CODE} in error.message) and refused a new one, Resume gave control back; stock window unmarked with chrome equal to the baseline (${o.baseline.length} nodes)`);
    return 0;
}

// ---------------------------------------------------------------- self-test

const OK = { ok: true, code: null, message: '' };
const REFUSED = { ok: false, code: 'runtime_error', message: OWNER_CODE };
const LABELS = { control: 'Agent in control', idle: 'Agent tab', stopped: 'Agents stopped', stop: 'Stop', resume: 'Resume' };
const CONTROL = {
    labels: LABELS,
    order: ['baseline', 'markProven', 'idle', 'stop', 'resume', 'stockCheck'],
    driving: { mark: true, label: LABELS.control, titleClass: true, active: true },
    idle: { mark: true, label: LABELS.idle, titleClass: true, active: false },
    stopped: { clicked: LABELS.stop, mark: true, label: LABELS.stopped, button: LABELS.resume, stopped: true, active: false },
    next: REFUSED,
    other: { stopped: true, next: REFUSED },
    create: REFUSED,
    resumed: { clicked: LABELS.resume, stopped: false, otherStopped: false, next: OK },
    baseline: ['toolbar#nav-bar', 'toolbar#TabsToolbar'],
    stock: { mark: false, nodes: ['toolbar#nav-bar', 'toolbar#TabsToolbar'] },
};

const set = (k, patch) => (o) => ({ ...o, [k]: { ...o[k], ...patch } });
const PLANTS = [
    ['mark-absent-while-driving', set('driving', { mark: false }), 'the mark is absent while the CLI drives'],
    ['mark-reads-idle-while-driving', set('driving', { label: LABELS.idle }), 'not the control label'],
    ['title-class-absent', set('driving', { titleClass: false }), 'the title class pb-agent-controlled is absent'],
    ['no-control-while-driving', set('driving', { active: false }), 'records no agent control while the CLI drives'],
    ['control-survives-idle', set('idle', { active: true }), 'agent control survived the idle window'],
    // The pre-agent-browser-04 behaviour: the mark left the tab after the idle window.
    ['mark-cleared-at-idle', set('idle', { mark: false, label: null }), 'the idle agent tab lost its mark'],
    ['title-class-cleared-at-idle', set('idle', { titleClass: false }), 'the idle agent tab lost the title class'],
    ['stop-button-missing', set('stopped', { clicked: null }), 'so Stop was not clicked'],
    ['stop-not-ending-control', (o) => ({ ...o, next: OK }), 'Stop did not end control'],
    ['code-read-from-error-code', (o) => ({ ...o, next: { ok: false, code: OWNER_CODE, message: 'runtime_error' } }), 'read from error.message only'],
    ['stopped-mark-without-resume', set('stopped', { label: LABELS.idle, button: LABELS.stop }), "the stopped tab's mark reads"],
    // The pre-agent-browser-04 behaviour: Stop ended control of the one tab only.
    ['stop-on-one-tab-only', (o) => ({ ...o, other: { stopped: false, next: OK } }), "Stop did not reach the frontend's other agent tab"],
    ['other-tab-refused-with-another-code', (o) => ({ ...o, other: { stopped: true, next: { ok: false, code: 'runtime_error', message: 'browser_error' } } }), "the other agent tab's next command does not carry"],
    ['create-while-stopped', (o) => ({ ...o, create: OK }), 'a new agent tab was created while agents were stopped'],
    ['create-refused-with-another-code', (o) => ({ ...o, create: { ok: false, code: 'runtime_error', message: 'browser_error' } }), 'the refused tab create does not carry'],
    ['resume-button-missing', set('resumed', { clicked: null }), 'so Resume was not clicked'],
    ['resume-left-stopped', set('resumed', { next: REFUSED, stopped: true }), 'Resume did not give control back'],
    ['stock-check-before-mark', (o) => ({ ...o, order: ['baseline', 'stockCheck', 'markProven', 'idle', 'stop'] }), 'absence before detector'],
    ['stock-chrome-differs', set('stock', { nodes: ['toolbar#nav-bar', 'toolbar#TabsToolbar', 'toolbar#pb-extra'] }), 'the stock window chrome differs from the baseline'],
    ['stock-shows-mark', set('stock', { mark: true }), 'the stock window shows the agent mark'],
    ['empty-baseline', (o) => ({ ...o, baseline: [], stock: { mark: false, nodes: [] } }), 'the baseline stock chrome has no nodes'],
];

export function runSelfTest() {
    const control = verdictMark(CONTROL);
    if (control.length) { console.error(`${NAME} self-test: FAIL -- control is not green: ${control.join(' | ')}`); return 1; }
    console.log(`${NAME} self-test: control green -- driving, idle, Stop over two tabs, Resume and the stock window`);
    let failures = 0;
    const planted = [];
    for (const [name, plant, naming] of PLANTS) {
        const r = verdictMark(plant(CONTROL));
        planted.push(r);
        if (!r.some((s) => s.includes(naming))) { console.error(`  FAIL ${name} -> ${r.join(' | ') || 'green'} (expected '${naming}')`); failures++; } else console.log(`  ok ${name} -> red, naming '${naming}'`);
    }
    // Every fail message of the verdict is reached by a plant (derived from the verdict's own source).
    for (const m of uncoveredMessages([verdictMark], planted)) { console.error(`  FAIL coverage -> no plant reaches "${m.text}"`); failures++; }
    try {
        const labels = markLabels();
        if (Object.values(labels).some((v) => !v)) throw new Error('an empty label');
        console.log(`  ok labels read from ${COPY_REL}`);
    } catch (e) { console.error(`  FAIL labels -> ${e.message}`); failures++; }
    for (const f of lockWiringFails(NAME, import.meta.url)) { console.error(`  FAIL ${f}`); failures++; }
    if (failures) { console.error(`${NAME} self-test: FAIL -- ${failures} case(s) did not behave`); return 1; }
    console.log(`${NAME} self-test: PASS -- ${PLANTS.length} planted faults each went red naming the drift; every fail message is planted; the live path takes the live lock`);
    return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const arg = process.argv[2];
    if (arg && arg !== '--self-test') { console.error('usage: node scripts/verify-orca-agent-mark-live.mjs [--self-test]'); process.exit(2); }
    if (arg === '--self-test') process.exit(runSelfTest());
    const locked = await holdLiveLock({ name: NAME, scriptUrl: import.meta.url, root: REPO_ROOT });
    if (locked !== null) process.exit(locked);
    process.exit(await main());
}
