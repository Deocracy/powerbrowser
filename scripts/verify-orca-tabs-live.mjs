#!/usr/bin/env node
// scripts/verify-orca-tabs-live.mjs
//
// orca-tabs-live (Phase 64, TAB-01..TAB-06, TERM-01; criteria 2, 3 and 6;
// P64-10..P64-13, P64-21, P64-25, P64-28, P64-30..P64-32, P64-35, P64-36, A4,
// A6, D-15, D-29; interfaces C3, C6, C7, C9): every Orca pane becomes exactly one
// hosted PowerBrowser tab, for every way a pane is created, and nothing of
// Orca's own tab chrome comes with it.
//
// One PowerBrowser session (scripts/lib/orca-tabs-live.mjs: orcad, the booted
// pane bundle, ORCA_* scrubbed, redaction first, a stub claude on the launched
// PowerBrowser's PATH). Stages, in order, each printing one line
// "orca-tabs-live: <stage>: PASS|FAIL -- ...":
//  a  terminal-user   New Orca Terminal: one hosted terminal widget term<n>
//                     within 1000 ms (the command's start to the recorded
//                     addWidget); a typed marker appears in orcad's terminal read.
//  b  terminal-cli    orca terminal create: the same within 1000 ms of the CLI's exit.
//  c  terminal-agent  orca agent launch --agent claude --surface terminal (stub): the same.
//  d  freeze-guard    after (a) and after each PB-side chat creation, a CLI
//                     terminal still becomes a tab within 1000 ms (A4).
//  e  split           orca terminal split on (b): two hosted terminal widgets of
//                     one Orca tab in two Lumino tab bars, in the direction the
//                     store records, one xterm each, each echoing only its own
//                     leaf. An "OWNER-ITEM: P64-32" line in lane p64-01's
//                     SUMMARY makes this FAIL naming the item, never a fallback.
//  e2 pb-split        ApplicationShell moves (a) beside another main-area tab:
//                     no remount, no new store tab, one xterm, still echoes.
//  f  chat            New Orca Chat, then a chat created by a second paired
//                     client (Orca's own web client in a PB web tab, paired in
//                     page memory, never through a URL), each one hosted chat
//                     widget within 1000 ms.
//  g  other-views     openPane simulator, conflict-review (a UU file) and
//                     check-details each give one hosted widget.
//  g2 tab-groups      the second client splits (b)'s worktree into two Orca tab
//                     groups and opens a chat in the second; the detector first
//                     (the store's neighbour record), then the second group's
//                     tab sits in another Lumino tab bar, in that direction.
//  h  organising      every hosted widget's Organising key is pb-orca:<name>.
//  i  no-tab-chrome   selectors derived from Orca's tab-bar and TabGroupPanel
//                     sources must match in Orca's own web client (the
//                     detector) and match nothing in the Theia document.
//  j  close           a Lumino close of a hosted terminal running sleep 600
//                     shows Orca's confirmation; cancel keeps widget and store
//                     row; orca terminal close disposes the widget within 1000 ms.
//  k  reload          after a frontend reload every hosted widget is back under
//                     its pb-orca: name within 5000 ms, none duplicated, and no
//                     orca.web.runtimeEnvironment.v1 key in localStorage.
//  l  route           /orca-panes/ refuses a request without the token cookie;
//                     with it, an encoded parent path and an absolute path 404,
//                     pb-panes.js answers 200.
//  m  offer           the offer is first found in the web-pairing file (the
//                     detector), then in none of the services' logs, state,
//                     diagnostics rows or the Theia document's storage.
// Every absence is judged only after its detector found the same thing on a
// control (CLAUDE.md verification rule 1). Every judgment is an exported pure
// verdict over an observation object.
//
// SKIP: one line "orca-tabs-live: SKIP -- <reason>" (exit 0) while a
// prerequisite is absent: no built PowerBrowser or Theia app, lane p64-02 not
// merged (theia/extensions/orca-panes absent), no built orca/, lane p64-01 not
// merged (orca/out/web/assets/pb-panes absent). orca-panes present but not in
// the built app is a FAIL. The PASS of this row is the coordinator's proof on
// the merged, wired, built tree, after orca-pane-css-live (P64-15).
//
// Run under the live lock with this shell's ORCA_* unset:
//   flock /home/chris/coding/Power-Browser/.git/pb-live.lock node scripts/verify-orca-tabs-live.mjs
// No pairing value, cookie or token is printed.
//
// Tier: full. --self-test is quick: each verdict over a passing fixture and one
// fixture per failure, plus a child Node that imports this module and must stay
// silent.
//
// Usage:
//   node scripts/verify-orca-tabs-live.mjs
//   node scripts/verify-orca-tabs-live.mjs --self-test

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SELF = fileURLToPath(import.meta.url);
const NAME = 'orca-tabs-live';
const SELF_REL = 'scripts/verify-orca-tabs-live.mjs';
const LIMIT_MS = 1000;
const RELOAD_MS = 5000;
const ENV_STORAGE_KEY = 'orca.web.runtimeEnvironment.v1';
const P64_01_SUMMARY_REL = '.planning/workstreams/orca/phases/64-orca-panes-as-powerbrowser-tabs/64-01-SUMMARY.md';
const TAB_BAR_DIR_REL = 'orca/src/renderer/src/components/tab-bar';
const TAB_GROUP_PANEL_REL = 'orca/src/renderer/src/components/tab-group/TabGroupPanel.tsx';
/** C7: the name word of each hosted kind. */
export const WORDS = { 'agent-session': 'chat', terminal: 'term', simulator: 'sim', 'conflict-review': 'conflicts', 'check-details': 'checks' };
const read = (path) => { try { return readFileSync(path, 'utf8'); } catch { return null; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nameOf = (id) => String(id ?? '').replace(/^orca-pane:/, '');

// ---------------------------------------------------------------------------
// Derivations.

/** Tab-chrome selectors from Orca's tab-bar sources and TabGroupPanel: every data-*tab* attribute name, as [name]. */
export function deriveTabChromeSelectors(sources) {
    const names = new Set();
    for (const text of sources) for (const m of String(text).matchAll(/\s(data-[a-z-]*tab[a-z-]*)=/g)) names.add(m[1]);
    return [...names].sort().map((n) => `[${n}]`);
}

function tabChromeSources(root = REPO_ROOT) {
    const dir = join(root, TAB_BAR_DIR_REL);
    const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.tsx') && !/\.test\./.test(f)).map((f) => join(dir, f)) : [];
    return [...files, join(root, TAB_GROUP_PANEL_REL)].map((f) => read(f) ?? '');
}

/** Whether rect b lies in `mode` from rect a (b is the pane placed split-right/left/bottom/top of a). */
export function liesInDirection(a, b, mode, tol = 2) {
    const overlapsY = b.y < a.y + a.h - tol && a.y < b.y + b.h - tol;
    const overlapsX = b.x < a.x + a.w - tol && a.x < b.x + b.w - tol;
    switch (mode) {
        case 'split-right': return overlapsY && b.x >= a.x + a.w - tol;
        case 'split-left': return overlapsY && b.x + b.w <= a.x + tol;
        case 'split-bottom': return overlapsX && b.y >= a.y + a.h - tol;
        case 'split-top': return overlapsX && b.y + b.h <= a.y + tol;
        default: return false;
    }
}

/** Every value of a 'handle' key in a CLI JSON reply. */
export function handlesIn(obj, out = new Set()) {
    if (obj && typeof obj === 'object') for (const [k, v] of Object.entries(obj)) { if (k === 'handle' && typeof v === 'string') out.add(v); else handlesIn(v, out); }
    return out;
}

// ---------------------------------------------------------------------------
// Pure verdicts. Each returns red reasons.

/**
 * One creation path. obs: { label, kind, t0, added: [{ id, t }] (hosted adds since t0), widget: { id, kind } | null,
 * echo: true | false | undefined (undefined: not asked) }.
 */
export function creationVerdict(obs) {
    const fails = [];
    if (!obs.added?.length || !obs.widget) return [`${obs.label}: no hosted ${obs.kind} widget was added`];
    if (obs.added.length > 1) fails.push(`${obs.label}: ${obs.added.length} hosted widgets were added for one pane (${obs.added.map((a) => a.id).join(', ')})`);
    const ms = obs.added[0].t - obs.t0;
    if (ms > LIMIT_MS) fails.push(`${obs.label}: late addWidget, ${ms} ms after the start (limit ${LIMIT_MS} ms)`);
    if (obs.widget.kind !== obs.kind) fails.push(`${obs.label}: data-pb-orca-pane is '${obs.widget.kind}', want '${obs.kind}'`);
    if (!new RegExp(`^${WORDS[obs.kind]}\\d+$`).test(nameOf(obs.widget.id))) fails.push(`${obs.label}: name '${nameOf(obs.widget.id)}' is not ${WORDS[obs.kind]}<n>`);
    if (obs.echo === false) fails.push(`${obs.label}: the typed marker never appeared in orcad's terminal read`);
    return fails;
}

/** obs: [{ after, ms }] with ms null when no tab came. */
export function freezeVerdict(obs) {
    return obs.filter((o) => o.ms === null || o.ms > LIMIT_MS).map((o) => `freeze guard after ${o.after}: a CLI terminal became a tab ${o.ms === null ? 'never' : `in ${o.ms} ms`} (limit ${LIMIT_MS} ms)`);
}

/** obs: { ownerItem, mode, widgets: [{ id, tabBar, rect, xterms, ownEcho, otherEcho }] } (widgets[0] the neighbour). */
export function splitVerdict(obs) {
    if (obs.ownerItem) return [`split: FAIL by owner item ${obs.ownerItem} (lane p64-01's SUMMARY), never a fallback`];
    const fails = [];
    if (obs.widgets?.length !== 2) return [`split: ${obs.widgets?.length ?? 0} hosted terminal widgets for the split Orca tab, want 2`];
    const [a, b] = obs.widgets;
    if (a.tabBar === b.tabBar) fails.push('split: both leaves sit in one Lumino tab bar');
    else if (!liesInDirection(a.rect, b.rect, obs.mode)) fails.push(`split: split bars in the wrong direction, the store records ${obs.mode}`);
    for (const w of obs.widgets) {
        if (w.xterms !== 1) fails.push(`split: ${w.id} holds ${w.xterms} xterm elements, want 1`);
        if (!w.ownEcho) fails.push(`split: ${w.id}'s marker missing from its own leaf`);
        if (w.otherEcho) fails.push(`split: ${w.id}'s marker reached the other leaf`);
    }
    return fails;
}

/** obs: { moved, remounts, newStoreTabs, xterms, echo }. */
export function pbSplitVerdict(obs) {
    const fails = [];
    if (!obs.moved) fails.push('pb-split: the widget did not move to a new Lumino tab bar');
    if (obs.remounts) fails.push(`pb-split: a remount after a PB-side move (${obs.remounts} mountPane calls)`);
    if (obs.newStoreTabs) fails.push(`pb-split: ${obs.newStoreTabs} new store tab(s) after a PB-side move`);
    if (obs.xterms !== 1) fails.push(`pb-split: ${obs.xterms} xterm elements after the move, want 1`);
    if (!obs.echo) fails.push('pb-split: the moved terminal no longer echoes');
    return fails;
}

/** obs: { storeTab: boolean, creation } for New Orca Chat; the creation verdict otherwise. */
export function chatVerdict(obs) {
    if (!obs.storeTab) return ['chat: chat launch produced no tab (provider: stub claude)'];
    return creationVerdict(obs.creation);
}

/** obs: { detected, direction ('right'|'down'), second: { tabBar, rect } | null, first: [{ tabBar, rect }] }. */
export function groupVerdict(obs) {
    if (!obs.detected) return ['tab-groups: tab-group split not observed (no store record of the second group\'s tab with a first-group neighbour in the recorded direction)'];
    if (!obs.second) return ['tab-groups: the second group\'s tab has no hosted widget'];
    const fails = [];
    const mode = obs.direction === 'down' ? 'split-bottom' : 'split-right';
    if (obs.first.some((f) => f.tabBar === obs.second.tabBar)) fails.push('tab-groups: a second-group tab sits in the first group\'s tab bar');
    else if (obs.first.some((f) => !liesInDirection(f.rect, obs.second.rect, mode))) fails.push(`tab-groups: the second-group tab is placed in the wrong direction (recorded ${obs.direction})`);
    return fails;
}

/** obs: [{ id, organising }]. */
export function organisingVerdict(obs) {
    if (!obs.length) return ['organising: no hosted widget to check'];
    return obs.filter((w) => w.organising !== `pb-orca:${nameOf(w.id)}`).map((w) => `organising: missing Organising key pb-orca:${nameOf(w.id)} for ${w.id} (found ${w.organising})`);
}

/** obs: { selectors, detectorMatches, theiaMatches: { selector: count } }. */
export function chromeVerdict(obs) {
    if (!obs.selectors?.length) return ['no-tab-chrome: no selector derived from Orca\'s tab-bar sources'];
    if (!obs.detectorMatches) return ['no-tab-chrome: the detector matched nothing in Orca\'s own web client, so an absence in Theia proves nothing'];
    return Object.entries(obs.theiaMatches ?? {}).filter(([, n]) => n > 0).map(([s, n]) => `no-tab-chrome: tab-bar selector ${s} matched ${n} element(s) in the Theia document`);
}

/** obs: { dialog, afterCancel: { widget, storeRow }, disposedMs }. */
export function closeVerdict(obs) {
    const fails = [];
    if (!obs.dialog) fails.push('close: Orca\'s confirmation did not render on a Lumino close of a busy terminal');
    if (!obs.afterCancel?.widget || !obs.afterCancel?.storeRow) fails.push(`close: a close that disposed on cancel (widget ${!!obs.afterCancel?.widget}, store row ${!!obs.afterCancel?.storeRow})`);
    if (obs.disposedMs === null || obs.disposedMs > LIMIT_MS) fails.push(`close: the Orca-side close disposed the widget ${obs.disposedMs === null ? 'never' : `in ${obs.disposedMs} ms`} (limit ${LIMIT_MS} ms)`);
    return fails;
}

/** obs: { before: [names], after: [names], ms, storedEnvKey }. */
export function reloadVerdict(obs) {
    const fails = [];
    const missing = obs.before.filter((n) => !obs.after.includes(n));
    if (missing.length) fails.push(`reload: ${missing.join(', ')} not back after the reload`);
    const dup = obs.after.filter((n, i) => obs.after.indexOf(n) !== i);
    if (dup.length) fails.push(`reload: a reload duplicate (${[...new Set(dup)].join(', ')})`);
    if (obs.ms === null || obs.ms > RELOAD_MS) fails.push(`reload: the hosted tabs took ${obs.ms === null ? 'forever' : `${obs.ms} ms`} (limit ${RELOAD_MS} ms)`);
    if (obs.storedEnvKey) fails.push(`reload: a stored environment key ${ENV_STORAGE_KEY} in the Theia document's localStorage`);
    return fails;
}

/** obs: { noCookie, traversal, absolute, entry } HTTP status codes. */
export function routeVerdict(obs) {
    const fails = [];
    if (obs.noCookie === 200) fails.push('route: /orca-panes/pb-panes.js served without the cookie');
    if (obs.traversal !== 404) fails.push(`route: an encoded parent-directory path answered ${obs.traversal}, want 404`);
    if (obs.absolute !== 404) fails.push(`route: an absolute path answered ${obs.absolute}, want 404`);
    if (obs.entry !== 200) fails.push(`route: pb-panes.js answered ${obs.entry} with the cookie, want 200`);
    return fails;
}

/** obs: { detector, foundIn: [place] }. Never carries the value. */
export function offerVerdict(obs) {
    if (!obs.detector) return ['offer: the search did not find the offer in the web-pairing file itself, so its absence elsewhere proves nothing'];
    return obs.foundIn.map((p) => `offer: the offer found in ${p}`);
}

/** obs: { exitCode, stdout, stderr, timedOut, startedProcess } of a child Node that only imported this module. */
export function importSilenceVerdict(obs) {
    const what = [];
    if (obs.timedOut) what.push('did not finish within 10 s');
    if (obs.exitCode !== 0) what.push(`exited ${obs.exitCode}`);
    if (obs.stdout) what.push(`printed ${JSON.stringify(String(obs.stdout).slice(0, 80))}`);
    if (obs.stderr) what.push(`wrote ${JSON.stringify(String(obs.stderr).slice(0, 80))} to stderr`);
    if (obs.startedProcess) what.push('started a process');
    return what.length ? [`side effect on import: importing ${SELF_REL} ${what.join(', ')}`] : [];
}

/** The OWNER-ITEM line of lane p64-01's SUMMARY on this branch, or null. */
export function ownerItemOf(summaryText) {
    const m = /^OWNER-ITEM: (P64-32\b.*)$/m.exec(String(summaryText ?? ''));
    return m ? m[1].trim() : null;
}

// ---------------------------------------------------------------------------
// Live.

/** HTTP status of a raw GET to the sidecar (the path is sent as written, never normalised). */
function httpStatus(port, path, cookie) {
    return new Promise((resolveStatus) => {
        const req = request({ host: '127.0.0.1', port, path, method: 'GET', headers: cookie ? { Cookie: cookie } : {} }, (res) => { res.resume(); resolveStatus(res.statusCode); });
        req.on('error', () => resolveStatus(null));
        req.setTimeout(10000, () => { req.destroy(); resolveStatus(null); });
        req.end();
    });
}

const PANES = `const m = globalThis[Symbol.for('powerbrowser.orca-panes.module')];
    let list = null; const off = m.subscribePanes(p => { list = p; }); off(); return list;`;

async function runLive(lib) {
    const stages = {};
    const fail = (stage, reasons) => { stages[stage] = reasons; };
    const ownerItem = ownerItemOf(read(join(REPO_ROOT, P64_01_SUMMARY_REL)));
    await lib.withOrcaTabsSession({ log: () => {} }, async (ctx) => {
        const handles = () => handlesIn(ctx.orca('terminal', 'list', '--worktree', ctx.worktree));
        const echoes = async (id, handle) => {
            const marker = `pbecho${Date.now() % 1000000}`;
            await ctx.typeInto(id, `echo ${marker}\n`);
            return !!(await ctx.pollFor(async () => lib.terminalText(ctx, handle).includes(marker), 10000, 'the marker').catch(() => false));
        };
        const widgetOf = async (id) => (await ctx.hostedWidgets()).find((w) => w.id === id) ?? null;
        const viaCli = async (args) => {
            const before = await lib.hostedIds(ctx);
            const known = handles();
            // Adds are collected from the CLI's start; the clock runs from its exit (a tab before the exit is in time).
            const tStart = Date.now();
            const r = ctx.orca(...args);
            const t0 = Date.now();
            const add = await lib.waitForHostedAdd(ctx, tStart, before, 5000);
            const added = add ? (await ctx.addedSince(tStart)).filter((e) => e.id.startsWith(lib.ORCA_PANE_WIDGET_PREFIX) && !before.includes(e.id)) : [];
            const handle = [...handlesIn(r)].find((h) => !known.has(h)) ?? [...handles()].find((h) => !known.has(h)) ?? null;
            return { t0, added, widget: add ? await widgetOf(add.id) : null, handle };
        };
        const freeze = [];
        const freezeProbe = async (after) => {
            const c = await viaCli(['terminal', 'create', '--worktree', ctx.worktree]);
            freeze.push({ after, ms: c.added[0] ? c.added[0].t - c.t0 : null });
        };

        // a. New Orca Terminal.
        let before = await lib.hostedIds(ctx);
        let known = handles();
        const cmd = await ctx.command('powerbrowser.orca.newTerminal');
        const addA = await lib.waitForHostedAdd(ctx, cmd.t0, before, 5000);
        const wA = addA ? await widgetOf(addA.id) : null;
        const hA = [...handles()].find((h) => !known.has(h)) ?? null;
        const a = { label: 'terminal-user', kind: 'terminal', t0: cmd.t0, added: addA ? (await ctx.addedSince(cmd.t0)).filter((e) => e.id.startsWith(lib.ORCA_PANE_WIDGET_PREFIX) && !before.includes(e.id)) : [], widget: wA, echo: wA && hA ? await echoes(wA.id, hA) : false };
        fail('terminal-user', creationVerdict(a));
        await freezeProbe('New Orca Terminal');

        // b. CLI terminal.
        const b = await viaCli(['terminal', 'create', '--worktree', ctx.worktree]);
        fail('terminal-cli', creationVerdict({ label: 'terminal-cli', kind: 'terminal', ...b, echo: b.widget && b.handle ? await echoes(b.widget.id, b.handle) : false }));

        // c. Agent-opened terminal (stub claude).
        const c = await viaCli(['agent', 'launch', '--agent', 'claude', '--surface', 'terminal', '--worktree', ctx.worktree]);
        fail('terminal-agent', creationVerdict({ label: 'terminal-agent', kind: 'terminal', ...c }));

        // e. Orca in-tab split of (b).
        if (ownerItem) fail('split', splitVerdict({ ownerItem }));
        else if (b.widget && b.handle) {
            const s = await viaCli(['terminal', 'split', '--terminal', b.handle, '--direction', 'horizontal']);
            const panes = (await ctx.probe(PANES)) ?? [];
            const rec = panes.find((p) => p.kind === 'terminal' && p.tabId === b.widget.options?.tabId && p.key !== b.widget.options?.paneKey);
            const mode = rec?.neighbours?.find((n) => n.key === b.widget.options?.paneKey)?.mode ?? 'unrecorded';
            const pair = [await widgetOf(b.widget.id), s.widget ? await widgetOf(s.widget.id) : null].filter(Boolean);
            const widgets = [];
            for (const [w, own, other] of [[pair[0], b.handle, s.handle], [pair[1], s.handle, b.handle]]) {
                if (!w || !own) continue;
                const marker = `pbleaf${Date.now() % 1000000}`;
                await ctx.typeInto(w.id, `echo ${marker}\n`);
                const ownEcho = !!(await ctx.pollFor(async () => lib.terminalText(ctx, own).includes(marker), 10000, 'the leaf marker').catch(() => false));
                widgets.push({ ...w, ownEcho, otherEcho: other ? lib.terminalText(ctx, other).includes(marker) : false });
            }
            fail('split', splitVerdict({ ownerItem: null, mode, widgets }));
        } else fail('split', ['split: no CLI terminal from (b) to split']);

        // e2. PB-side split of (a): move it beside another main-area tab.
        if (wA && hA) {
            const storeBefore = ((await ctx.probe(PANES)) ?? []).length;
            const moved = await ctx.probe(`const shell = get('ApplicationShell');
                const w = shell.getWidgetById(${JSON.stringify(wA.id)});
                const other = shell.getWidgets('main').find(x => x.id !== w.id);
                if (!w || !other) return { moved: false };
                const m = globalThis[Symbol.for('powerbrowser.orca-panes.module')];
                let mounts = 0; const mount = m.mountPane; try { m.mountPane = (...a) => { mounts++; return mount(...a); }; } catch (e) { /* frozen namespace: remounts counted by xterm identity below */ }
                const xterm = w.node.querySelector('.xterm');
                const barBefore = [...shell.mainPanel.tabBars()].findIndex(b => b.titles.includes(w.title));
                shell.mainPanel.addWidget(w, { mode: 'split-right', ref: other });
                await sleep(500);
                const barAfter = [...shell.mainPanel.tabBars()].findIndex(b => b.titles.includes(w.title));
                return { moved: barAfter !== barBefore, remounts: mounts + (w.node.querySelector('.xterm') === xterm ? 0 : 1), xterms: w.node.querySelectorAll('.xterm').length };`);
            const storeAfter = ((await ctx.probe(PANES)) ?? []).length;
            fail('pb-split', pbSplitVerdict({ ...moved, newStoreTabs: Math.max(0, storeAfter - storeBefore), echo: await echoes(wA.id, hA) }));
        } else fail('pb-split', ['pb-split: no hosted terminal from (a) to move']);

        // f. chat: New Orca Chat, then a second paired client.
        before = await lib.hostedIds(ctx);
        const chatCmd = await ctx.command('powerbrowser.orca.newChat');
        const storeTab = !!(await ctx.pollFor(async () => ((await ctx.probe(PANES)) ?? []).some((p) => p.kind === 'agent-session'), 5000, 'a chat store tab').catch(() => false));
        const addF = await lib.waitForHostedAdd(ctx, chatCmd.t0, before, 5000);
        const chatAdded = addF ? (await ctx.addedSince(chatCmd.t0)).filter((e) => e.id.startsWith(lib.ORCA_PANE_WIDGET_PREFIX) && !before.includes(e.id)) : [];
        const chatFails = chatVerdict({ storeTab, creation: { label: 'chat', kind: 'agent-session', t0: chatCmd.t0, added: chatAdded, widget: addF ? await widgetOf(addF.id) : null } });
        await freezeProbe('New Orca Chat');
        const second = await openSecondClient(ctx);
        if (second.error) chatFails.push(`chat: second client: ${second.error}`);
        else {
            before = await lib.hostedIds(ctx);
            const t0 = Date.now();
            const made = await second.newChat(null);
            if (!made) chatFails.push('chat: second client: Orca\'s own new-chat control not found in its page');
            const add = await lib.waitForHostedAdd(ctx, t0, before, 5000);
            const added = add ? (await ctx.addedSince(t0)).filter((e) => e.id.startsWith(lib.ORCA_PANE_WIDGET_PREFIX) && !before.includes(e.id)) : [];
            // The clock starts when the page's control was clicked; the page reports its own Date.now.
            chatFails.push(...creationVerdict({ label: 'chat (second client)', kind: 'agent-session', t0: made || t0, added, widget: add ? await widgetOf(add.id) : null }));
            await freezeProbe('a second-client chat');
        }
        fail('chat', chatFails);
        fail('freeze-guard', freezeVerdict(freeze));

        // g. other views through Orca's own openers.
        const worktreeId = b.widget?.options?.worktreeId ?? wA?.options?.worktreeId ?? null;
        const otherFails = [];
        if (!worktreeId) otherFails.push('other-views: no worktree id from a hosted widget');
        else {
            makeConflict(ctx);
            for (const [kind, detail] of [['simulator', undefined], ['conflict-review', 'README'], ['check-details', undefined]]) {
                before = await lib.hostedIds(ctx);
                const t0 = Date.now();
                const opened = await ctx.bundle(`m.openPane(${JSON.stringify(kind)}, ${JSON.stringify(worktreeId)}${detail ? `, ${JSON.stringify(detail)}` : ''}).then(id => ({ id }), e => ({ error: String(e && e.message || e) }))`);
                if (opened?.error) { otherFails.push(`other-views: openPane ${kind} rejected: ${opened.error}`); continue; }
                const add = await lib.waitForHostedAdd(ctx, t0, before, 5000);
                const added = add ? (await ctx.addedSince(t0)).filter((e) => e.id.startsWith(lib.ORCA_PANE_WIDGET_PREFIX) && !before.includes(e.id)) : [];
                otherFails.push(...creationVerdict({ label: `other-views ${kind}`, kind, t0, added, widget: add ? await widgetOf(add.id) : null }));
            }
        }
        fail('other-views', otherFails);

        // g2. Orca tab groups from the second client.
        if (second.error || !b.widget) fail('tab-groups', [`tab-groups: tab-group split not observed (${second.error ?? 'no CLI terminal from (b)'})`]);
        else {
            const split = await second.splitGroup(b.widget.options?.tabId);
            before = await lib.hostedIds(ctx);
            const made = split ? await second.newChat(split.groupIndex) : null;
            const add = made ? await lib.waitForHostedAdd(ctx, made - 50, before, 5000) : null;
            const panes = (await ctx.probe(PANES)) ?? [];
            const all = await ctx.hostedWidgets();
            const secondW = add ? all.find((w) => w.id === add.id) : null;
            const rec = secondW ? panes.find((p) => p.key === (secondW.options?.paneKey ?? secondW.options?.tabId)) : null;
            const wantMode = split?.direction === 'down' ? 'split-bottom' : 'split-right';
            const firstKeys = new Set(panes.filter((p) => p.worktreeId === worktreeId && p.key !== rec?.key).map((p) => p.key));
            const detected = !!rec?.neighbours?.some((n) => firstKeys.has(n.key) && n.mode === wantMode);
            const firstW = all.filter((w) => w.id !== secondW?.id && w.options?.worktreeId === worktreeId && w.area === 'main');
            fail('tab-groups', groupVerdict({ detected, direction: split?.direction, second: secondW, first: firstW }));
        }

        // h. Organising rows.
        fail('organising', organisingVerdict(await ctx.hostedWidgets()));

        // i. No Orca tab chrome: detector in the second client, then the Theia document.
        const selectors = deriveTabChromeSelectors(tabChromeSources());
        const detectorMatches = second.error ? 0 : await second.count(selectors);
        const theiaMatches = await ctx.probe(`const out = {}; for (const s of ${JSON.stringify(selectors)}) out[s] = document.querySelectorAll(s).length; return out;`);
        fail('no-tab-chrome', chromeVerdict({ selectors, detectorMatches, theiaMatches }));

        // j. Close semantics on a busy hosted terminal.
        const busy = await viaCli(['terminal', 'create', '--worktree', ctx.worktree, '--command', 'sleep 600']);
        if (!busy.widget || !busy.handle) fail('close', ['close: no hosted terminal for the busy close']);
        else {
            await ctx.luminoClose(busy.widget.id);
            const dialog = !!(await ctx.pollFor(() => ctx.probe('return !!document.querySelector(\'body > [data-radix-popper-content-wrapper] [role="dialog"], body > [data-radix-popper-content-wrapper] [role="alertdialog"], body > [role="dialog"], body > [role="alertdialog"], body > div [role="alertdialog"]\');'), 5000, 'Orca\'s confirmation').catch(() => false));
            await ctx.probe(`const d = document.querySelector('[role="dialog"], [role="alertdialog"]'); const btn = d && [...d.querySelectorAll('button')].find(b => /cancel/i.test(b.textContent)); if (btn) btn.click(); await sleep(500); return !!btn;`);
            const afterCancel = { widget: (await lib.hostedIds(ctx)).includes(busy.widget.id), storeRow: handles().has(busy.handle) };
            ctx.orca('terminal', 'close', '--terminal', busy.handle);
            const t0 = Date.now();
            const gone = await ctx.pollFor(async () => !(await lib.hostedIds(ctx)).includes(busy.widget.id), 5000, 'the widget disposed').then(() => Date.now() - t0, () => null);
            fail('close', [...closeVerdict({ dialog, afterCancel, disposedMs: gone })]);
        }
        const notes = ['busy-chat close not exercised (the stub agent cannot hold a chat busy); end-of-milestone pass'];

        // k. Reload.
        const names = (await lib.hostedIds(ctx)).map(nameOf).sort();
        await ctx.app.evaluate('setTimeout(() => location.reload(), 0), true').catch(() => undefined);
        await sleep(1000);
        await ctx.pollFor(() => ctx.probe(`return get('FrontendApplicationStateService').state === 'ready';`, 5000).catch(() => false), 120000, 'the reloaded frontend');
        const tReady = Date.now();
        const backMs = await ctx.pollFor(async () => { const now = (await lib.hostedIds(ctx)).map(nameOf); return names.every((n) => now.includes(n)) ? Date.now() - tReady : null; }, RELOAD_MS + 5000, 'the hosted tabs after reload').catch(() => null);
        const after = (await lib.hostedIds(ctx)).map(nameOf).sort();
        const storedEnvKey = await ctx.probe(`return Object.keys(localStorage).includes(${JSON.stringify(ENV_STORAGE_KEY)});`);
        fail('reload', reloadVerdict({ before: names, after, ms: backMs, storedEnvKey }));

        // l. Route containment.
        const theiaCtx = (await ctx.app.contexts()).find((x) => x.url.includes(`127.0.0.1:${ctx.app.port}`) || x.url.includes(`localhost:${ctx.app.port}`));
        const cookies = theiaCtx ? (await ctx.app.send('storage.getCookies', { partition: { type: 'context', context: theiaCtx.context } }).catch(() => ({ cookies: [] }))).cookies ?? [] : [];
        const cookie = cookies.map((k) => `${k.name}=${k.value?.value ?? ''}`).join('; ');
        fail('route', routeVerdict({
            noCookie: await httpStatus(ctx.app.port, '/orca-panes/pb-panes.js', null),
            traversal: await httpStatus(ctx.app.port, '/orca-panes/..%2f..%2fpackage.json', cookie),
            absolute: await httpStatus(ctx.app.port, '/orca-panes//etc/passwd', cookie),
            entry: await httpStatus(ctx.app.port, '/orca-panes/pb-panes.js', cookie),
        }));

        // m. Offer containment; the value stays in this frame.
        const offer = await ctx.offerFromFile();
        const state = await ctx.orcaState();
        const bridgeFile = state.bridgeDir ? read(join(state.bridgeDir, lib.WEB_PAIRING_FILE)) : null;
        const chromeDump = await ctx.app.evaluateIn(ctx.app.chrome, `(() => { try {
            const O = ChromeUtils.importESModule('chrome://powerbrowser/content/OrcaService.sys.mjs').OrcaService;
            const T = ChromeUtils.importESModule('chrome://powerbrowser/content/TheiaService.sys.mjs').TheiaService;
            return JSON.stringify({ orcaLog: O.getRecentLog(), theiaLog: T.getRecentLog(), state: O.getState(), rows: O.getDiagnosticRows() });
        } catch (e) { return JSON.stringify({ chromeError: String(e) }); } })()`);
        const storage = await ctx.probe('return { local: JSON.stringify({ ...localStorage }), session: JSON.stringify({ ...sessionStorage }) };');
        const places = { 'PowerBrowser\'s session log': JSON.stringify([JSON.parse(chromeDump).orcaLog, JSON.parse(chromeDump).theiaLog]), 'OrcaService.getState()': JSON.stringify(JSON.parse(chromeDump).state), 'the diagnostics rows': JSON.stringify(JSON.parse(chromeDump).rows), 'the Theia document\'s localStorage': storage?.local ?? '', 'the Theia document\'s sessionStorage': storage?.session ?? '' };
        fail('offer', offerVerdict({ detector: !!offer && !!bridgeFile && bridgeFile.includes(offer), foundIn: offer ? Object.entries(places).filter(([, text]) => text.includes(offer)).map(([p]) => p) : [] }));
        stages.notes = notes;
        await second.close?.();
    });
    return stages;
}

/** A UU file in the throwaway repository: README changed on two branches and merged. */
function makeConflict(ctx) {
    const git = ctx.git;
    const readme = join(ctx.repo, 'README');
    try {
        git('checkout', '-q', '-b', 'pb-conflict');
        writeFileSync(readme, 'theirs\n');
        git('commit', '-q', '-am', 'theirs');
        git('checkout', '-q', '-');
        writeFileSync(readme, 'ours\n');
        git('commit', '-q', '-am', 'ours');
        try { git('merge', '-q', 'pb-conflict'); } catch { /* the conflict is the point */ }
    } catch { /* openPane conflict-review then reports its own rejection */ }
}

/**
 * Orca's own web client in a PB web tab: loaded from orcad's address without the pairing fragment, paired in page
 * memory by filling Orca's own pairing field and pressing its own connect button with the offer (never a URL).
 */
async function openSecondClient(ctx) {
    const offer = await ctx.offerFromFile();
    if (!offer) return { error: 'no offer in the bridge folder' };
    let base;
    try { const u = new URL(offer); base = `${u.origin}${u.pathname}`; } catch { return { error: 'the offer is not a URL' }; }
    await ctx.openWebTab(base);
    const page = await ctx.pollFor(async () => (await ctx.app.contexts()).find((x) => x.url.startsWith(base)) ?? null, 30000, 'the second client page').catch(() => null);
    if (!page) return { error: 'the second client page did not load' };
    const evalIn = (expr) => ctx.app.evaluateIn(page.context, expr);
    const paired = await evalIn(`(async () => {
        const deadline = Date.now() + 20000;
        let input; while (!(input = document.getElementById('web-runtime-pairing-code')) && Date.now() < deadline) await new Promise(r => setTimeout(r, 200));
        if (!input) return 'no pairing field';
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        set.call(input, ${JSON.stringify(offer)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 300));
        const btn = [...document.querySelectorAll('button')].find(b => /connect/i.test(b.textContent));
        if (!btn) return 'no connect button';
        btn.click();
        while (document.getElementById('web-runtime-pairing-code') && Date.now() < deadline + 20000) await new Promise(r => setTimeout(r, 300));
        return document.getElementById('web-runtime-pairing-code') ? 'still on the pairing screen' : 'ok';
    })()`).catch((e) => `evaluate failed: ${e.message}`);
    if (paired !== 'ok') return { error: `pairing in page memory did not complete (${paired})` };
    return {
        /** Clicks Orca's own New tab control (in tab group `groupIndex` when given) and its chat item; resolves the page's Date.now at the click, or null. */
        newChat: (groupIndex) => evalIn(`(async () => {
            const strips = [...document.querySelectorAll('[data-tab-group-strip-id]')];
            const scope = ${JSON.stringify(groupIndex)} === null ? document : (strips[${Number(groupIndex) || 0}] || document);
            const plus = scope.querySelector('[aria-label="New tab"], [title="New tab"]');
            if (!plus) return null;
            plus.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); plus.click();
            await new Promise(r => setTimeout(r, 400));
            const item = [...document.querySelectorAll('[role="menuitem"]')].find(m => /chat/i.test(m.textContent));
            if (!item) return null;
            const t = Date.now(); item.click(); return t;
        })()`).catch(() => null),
        /** Splits the group holding tab `tabId` through Orca's own tab context menu; resolves { direction, groupIndex } or null. */
        splitGroup: (tabId) => evalIn(`(async () => {
            const tab = document.querySelector('[data-tab-id="' + CSS.escape(${JSON.stringify(String(tabId ?? ''))}) + '"]');
            if (!tab) return null;
            tab.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 }));
            await new Promise(r => setTimeout(r, 400));
            const item = [...document.querySelectorAll('[role="menuitem"]')].find(m => /split/i.test(m.textContent) && /(right|down)/i.test(m.textContent));
            if (!item) return null;
            const direction = /down/i.test(item.textContent) ? 'down' : 'right';
            item.click();
            await new Promise(r => setTimeout(r, 800));
            return { direction, groupIndex: document.querySelectorAll('[data-tab-group-strip-id]').length - 1 };
        })()`).catch(() => null),
        count: (selectors) => evalIn(`(${JSON.stringify(selectors)}).reduce((n, s) => n + document.querySelectorAll(s).length, 0)`).catch(() => 0),
    };
}

async function main() {
    const lib = await import('./lib/orca-tabs-live.mjs');
    const pre = lib.prerequisites({ needOrca: true });
    if (pre.fail) { console.error(`${NAME}: FAIL -- ${pre.fail}`); return 1; }
    if (pre.skip) { console.log(`${NAME}: SKIP -- ${pre.skip}`); return 0; }
    let stages;
    try { stages = await runLive(lib); } catch (err) {
        console.error(`${NAME}: FAIL -- harness: ${err.message}`);
        return 1;
    }
    const order = ['terminal-user', 'terminal-cli', 'terminal-agent', 'freeze-guard', 'split', 'pb-split', 'chat', 'other-views', 'tab-groups', 'organising', 'no-tab-chrome', 'close', 'reload', 'route', 'offer'];
    const failed = [];
    for (const s of order) {
        const reasons = stages[s];
        if (reasons === undefined) { failed.push(s); console.log(`${NAME}: ${s}: FAIL -- not reached`); continue; }
        if (reasons.length) failed.push(s);
        console.log(`${NAME}: ${s}: ${reasons.length ? `FAIL -- ${reasons.join('; ')}` : 'PASS'}`);
    }
    for (const n of stages.notes ?? []) console.log(`${NAME}: note -- ${n}`);
    console.log(failed.length ? `${NAME}: FAIL -- ${failed.join(', ')}` : `${NAME}: PASS -- ${order.join(', ')}`);
    return failed.length ? 1 : 0;
}

// ---------------------------------------------------------------------------
// --self-test

/** Imports this module in a child Node and observes it. Exit 3 from the child means it had a child process. */
export function observeImport() {
    const script = `await import(${JSON.stringify(pathToFileURL(SELF).href)});
await new Promise((r) => setTimeout(r, 200));
let kids = '';
try { kids = (await import('node:fs')).readFileSync('/proc/self/task/' + process.pid + '/children', 'utf8').trim(); } catch {}
process.exit(kids ? 3 : 0);`;
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('ORCA_')));
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 10000, env, cwd: REPO_ROOT });
    return { exitCode: r.status === 3 ? 0 : r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', timedOut: r.error?.code === 'ETIMEDOUT', startedProcess: r.status === 3 };
}

const R = (x, y, w = 400, h = 300) => ({ x, y, w, h });
const creation = (o = {}) => ({ label: 'terminal-user', kind: 'terminal', t0: 1000, added: [{ id: 'orca-pane:term1', t: 1400 }], widget: { id: 'orca-pane:term1', kind: 'terminal' }, echo: true, ...o });
const split = (o = {}) => ({ ownerItem: null, mode: 'split-right', widgets: [{ id: 'orca-pane:term2', tabBar: 0, rect: R(0, 0), xterms: 1, ownEcho: true, otherEcho: false }, { id: 'orca-pane:term3', tabBar: 1, rect: R(400, 0), xterms: 1, ownEcho: true, otherEcho: false }], ...o });
const group = (o = {}) => ({ detected: true, direction: 'right', second: { tabBar: 2, rect: R(400, 0) }, first: [{ tabBar: 0, rect: R(0, 0) }], ...o });
const withWidget = (o, i, patch) => { const c = structuredClone(o); Object.assign(c.widgets[i], patch); return c; };

function runSelfTest() {
    const sources = [`<div data-tab-id={tab.id} data-tab-strip-slot={id} className="x" />`, `<section data-tab-group-strip-id={groupId} data-testid="g" />`];
    const cases = [
        ['creation control', null, () => creationVerdict(creation())],
        ['freeze control', null, () => freezeVerdict([{ after: 'New Orca Terminal', ms: 300 }])],
        ['split control', null, () => splitVerdict(split())],
        ['split control stacked', null, () => splitVerdict(split({ mode: 'split-bottom', widgets: [{ ...split().widgets[0] }, { ...split().widgets[1], rect: R(0, 300) }] }))],
        ['pb-split control', null, () => pbSplitVerdict({ moved: true, remounts: 0, newStoreTabs: 0, xterms: 1, echo: true })],
        ['chat control', null, () => chatVerdict({ storeTab: true, creation: creation({ label: 'chat', kind: 'agent-session', added: [{ id: 'orca-pane:chat1', t: 1200 }], widget: { id: 'orca-pane:chat1', kind: 'agent-session' } }) })],
        ['tab-groups control', null, () => groupVerdict(group())],
        ['organising control', null, () => organisingVerdict([{ id: 'orca-pane:term1', organising: 'pb-orca:term1' }])],
        ['no-tab-chrome control', null, () => chromeVerdict({ selectors: deriveTabChromeSelectors(sources), detectorMatches: 5, theiaMatches: { '[data-tab-id]': 0 } })],
        ['close control', null, () => closeVerdict({ dialog: true, afterCancel: { widget: true, storeRow: true }, disposedMs: 300 })],
        ['reload control', null, () => reloadVerdict({ before: ['chat1', 'term1'], after: ['chat1', 'term1'], ms: 900, storedEnvKey: false })],
        ['route control', null, () => routeVerdict({ noCookie: 403, traversal: 404, absolute: 404, entry: 200 })],
        ['offer control', null, () => offerVerdict({ detector: true, foundIn: [] })],
        ['selector derivation', null, () => (JSON.stringify(deriveTabChromeSelectors(sources)) === JSON.stringify(['[data-tab-group-strip-id]', '[data-tab-id]', '[data-tab-strip-slot]']) ? [] : [`derived ${JSON.stringify(deriveTabChromeSelectors(sources))}`])],
        ['owner item absent', null, () => (ownerItemOf('# 64-01\nno owner items\n') === null ? [] : ['an OWNER-ITEM was read from a summary without one'])],
        ['real module import (child Node, 10 s)', null, () => importSilenceVerdict(observeImport())],
        ['late addWidget', 'late addWidget', () => creationVerdict(creation({ added: [{ id: 'orca-pane:term1', t: 2100 }] }))],
        ['a second widget for one pane', '2 hosted widgets were added for one pane', () => creationVerdict(creation({ added: [{ id: 'orca-pane:term1', t: 1100 }, { id: 'orca-pane:term2', t: 1150 }] }))],
        ['a missing echo', 'marker never appeared', () => creationVerdict(creation({ echo: false }))],
        ['a CLI tab after a freeze', 'freeze guard after New Orca Chat', () => freezeVerdict([{ after: 'New Orca Chat', ms: null }])],
        ['split bars in the wrong direction', 'split bars in the wrong direction', () => splitVerdict(split({ mode: 'split-bottom' }))],
        ['split leaves in one tab bar', 'both leaves sit in one Lumino tab bar', () => splitVerdict(withWidget(split(), 1, { tabBar: 0 }))],
        ['a second xterm in a leaf widget', 'holds 2 xterm elements', () => splitVerdict(withWidget(split(), 0, { xterms: 2 }))],
        ['a leaf echoing into the other', "reached the other leaf", () => splitVerdict(withWidget(split(), 1, { otherEcho: true }))],
        ['an OWNER-ITEM line present', 'FAIL by owner item P64-32', () => splitVerdict({ ownerItem: ownerItemOf('x\nOWNER-ITEM: P64-32 split placement needs the owner\n') })],
        ['a remount after a PB-side move', 'a remount after a PB-side move', () => pbSplitVerdict({ moved: true, remounts: 1, newStoreTabs: 0, xterms: 1, echo: true })],
        ['chat launch with no store tab', 'chat launch produced no tab (provider: stub claude)', () => chatVerdict({ storeTab: false })],
        ['a second-group tab in the first group\'s tab bar', 'second-group tab sits in the first group\'s tab bar', () => groupVerdict(group({ second: { tabBar: 0, rect: R(400, 0) } }))],
        ['a second-group tab placed in the wrong direction', 'placed in the wrong direction', () => groupVerdict(group({ direction: 'down' }))],
        ['a tab-group split the detector did not observe', 'tab-group split not observed', () => groupVerdict(group({ detected: false }))],
        ['a missing Organising key', 'missing Organising key pb-orca:term1', () => organisingVerdict([{ id: 'orca-pane:term1', organising: 'widget:orca-pane:term1' }])],
        ['a tab-bar selector matching in Theia', 'tab-bar selector [data-tab-id] matched 1', () => chromeVerdict({ selectors: ['[data-tab-id]'], detectorMatches: 4, theiaMatches: { '[data-tab-id]': 1 } })],
        ['a detector that matched nothing', 'detector matched nothing', () => chromeVerdict({ selectors: ['[data-tab-id]'], detectorMatches: 0, theiaMatches: { '[data-tab-id]': 0 } })],
        ['a close that disposed on cancel', 'a close that disposed on cancel', () => closeVerdict({ dialog: true, afterCancel: { widget: false, storeRow: true }, disposedMs: 300 })],
        ['a close with no confirmation', 'confirmation did not render', () => closeVerdict({ dialog: false, afterCancel: { widget: true, storeRow: true }, disposedMs: 300 })],
        ['a reload duplicate', 'a reload duplicate (term1)', () => reloadVerdict({ before: ['term1'], after: ['term1', 'term1'], ms: 900, storedEnvKey: false })],
        ['a stored environment key', 'a stored environment key', () => reloadVerdict({ before: ['term1'], after: ['term1'], ms: 900, storedEnvKey: true })],
        ['a route served without the cookie', 'served without the cookie', () => routeVerdict({ noCookie: 200, traversal: 404, absolute: 404, entry: 200 })],
        ['a traversal served', 'encoded parent-directory path answered 200', () => routeVerdict({ noCookie: 403, traversal: 200, absolute: 404, entry: 200 })],
        ['the offer found in a log', 'the offer found in PowerBrowser\'s session log', () => offerVerdict({ detector: true, foundIn: ['PowerBrowser\'s session log'] })],
        ['an offer search with a blind detector', 'did not find the offer in the web-pairing file', () => offerVerdict({ detector: false, foundIn: [] })],
        ['an import that printed a line', 'side effect on import', () => importSilenceVerdict({ exitCode: 0, stdout: 'orca-tabs-live: SKIP\n', stderr: '', timedOut: false, startedProcess: false })],
    ];
    let failures = 0;
    let ok = 0;
    for (const [label, naming, runCase] of cases) {
        let fails;
        try { fails = runCase(); } catch (err) { fails = [`threw ${err.message}`]; }
        const text = fails.join('\n');
        if (naming === null) {
            if (fails.length) { console.error(`  FAIL ${label} -> not green: ${text}`); failures++; } else console.log(`  control ${label} -> green`);
        } else if (!fails.length) { console.error(`  FAIL ${label} -> stayed green`); failures++; }
        else if (!text.includes(naming)) { console.error(`  FAIL ${label} -> red, but not naming '${naming}': ${text}`); failures++; }
        else { console.log(`  ok ${label} -> red, naming '${naming}'`); ok++; }
    }
    if (failures) { console.error(`${NAME} self-test: FAIL -- ${failures} case(s) did not behave`); return 1; }
    console.log(`${NAME} self-test: PASS -- ${ok} planted faults each went red naming the drift`);
    return 0;
}

const isEntryPoint = (() => {
    try { return realpathSync(resolve(process.argv[1])) === realpathSync(SELF); } catch { return false; }
})();
if (isEntryPoint) {
    const args = process.argv.slice(2);
    const unknown = args.find((a) => a !== '--self-test');
    if (unknown !== undefined) {
        console.error(`${NAME}: FAIL -- unknown argument '${unknown}' (usage: node ${SELF_REL} [--self-test])`);
        process.exit(2);
    }
    process.exit(args.includes('--self-test') ? runSelfTest() : await main());
}
