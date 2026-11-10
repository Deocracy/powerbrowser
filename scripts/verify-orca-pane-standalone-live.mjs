#!/usr/bin/env node
// scripts/verify-orca-pane-standalone-live.mjs
//
// orca-pane-standalone-live (Phase 64, TAB-04, TAB-06, TERM-01; P64-03, P64-25, P64-32, spike 004
// condition 4): the Orca pane bundle mounted on a standalone page, in a PowerBrowser web tab, with
// a scratch orcad behind it (scripts/lib/orca-pane-harness.mjs). The page runs the React-bundled
// standalone variant (.mozbuild/orca-panes-standalone/, built on demand); every mount host carries
// data-pb-orca-pane, as a Lumino node does (C4).
//
// Stage 0, run first (P64-32, the unproven isolated per-leaf mount): a terminal created by the
// Orca CLI is split by the CLI; subscribePanes must report two records of that tab with two pane
// keys and a neighbour relation; two React roots each mount TerminalPane with one leaf's pane key.
// Each root must show exactly one xterm (visible; the total is recorded), a marker typed into each
// root must reach its own leaf's PTY (orca terminal read) and not the other's, the CLI's terminal
// handle count must not change, and mountErrors must stay empty. One retry after a fresh split.
//
// Stage 1: a planted throwing child mounted through mountPane's own error capture must be recorded
// (the detector moves first), then each hosted type mounts: terminal (one leaf, created through the
// bundle's createTerminal, i.e. terminal.create), agent-session (createChat when it yields a tab,
// else a synthetic id; which one is printed), simulator, conflict-review (the UU file of the
// throwaway repo) and check-details (openPane). Each must render, record no React or window error
// and leave mountErrors empty; a thrown mount is red naming the kind and the message.
//
// Every judgment is an exported pure verdict; --self-test feeds fixture observations to them and
// checks that importing this module prints and starts nothing.
//
// Tier: full (live); run under flock /home/chris/coding/Power-Browser/.git/pb-live.lock with every
// inherited ORCA_* unset. --self-test is quick and hermetic. Prints a named SKIP when no built
// PowerBrowser, no orca/out/web/assets/pb-panes or no Orca CLI exists.
//
// Usage:
//   node scripts/verify-orca-pane-standalone-live.mjs
//   node scripts/verify-orca-pane-standalone-live.mjs --self-test

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'orca-pane-standalone-live';
const SELF = fileURLToPath(import.meta.url);
const J = JSON.stringify;

// The HTML spec reports a ResizeObserver delivery overrun as a window error event; it is the browser's
// notice that layout settled over two frames, not an exception thrown by the mount.
export const BENIGN_WINDOW_ERROR = /^ResizeObserver loop (completed with undelivered notifications|limit exceeded)/;

export const HOSTED_KINDS = ['terminal', 'agent-session', 'simulator', 'conflict-review', 'check-details'];

// ---------------------------------------------------------------- pure verdicts

/**
 * Stage 0. obs: { records, paneKeys, neighbours, roots: [{ xtermsVisible, xtermsTotal, ownMarker,
 * otherMarker }], handlesBefore, handlesAfter, mountErrors }. Returns null (pass) or the clause.
 */
export function isolatedVerdict(obs) {
    if (!obs || typeof obs !== 'object') return 'no observation';
    if (obs.records !== 2 || new Set(obs.paneKeys ?? []).size !== 2) return `split records: ${obs.records} record(s), ${new Set(obs.paneKeys ?? []).size} distinct pane key(s), expected 2 and 2`;
    if (obs.neighbours !== true) return 'split records: the two leaves do not name each other as neighbours';
    if (!Array.isArray(obs.roots) || obs.roots.length !== 2) return `roots: ${obs.roots?.length ?? 0} measured, expected 2`;
    for (const [i, root] of obs.roots.entries()) {
        const label = i === 0 ? 'root A' : 'root B';
        if (root.xtermsVisible !== 1) return `${label} shows ${root.xtermsVisible} xterm(s) (total ${root.xtermsTotal}), expected exactly 1`;
        if (root.ownMarker !== true) return `${label}: the typed marker did not reach its own leaf's PTY`;
        if (root.otherMarker !== false) return `${label}: the typed marker reached the other leaf's PTY`;
    }
    if (J(obs.handlesBefore) !== J(obs.handlesAfter)) return `terminal handle count changed: ${obs.handlesBefore?.length} before, ${obs.handlesAfter?.length} after`;
    if ((obs.mountErrors ?? []).length) return `mountErrors: ${obs.mountErrors.map(e => `${e.kind}/${e.phase}: ${e.message}`).join('; ')}`;
    return null;
}

/**
 * Stage 1. obs: { control: { recorded }, mounts: [{ kind, rendered, reactErrors, windowErrors }] }.
 * Returns null (pass) or the failure "<kind>: <message>".
 */
export function mountsVerdict(obs) {
    if (!obs?.control || obs.control.recorded !== true) return 'error capture: the planted throwing child was not recorded (the detector is blind)';
    if ((obs.servicesErrors ?? []).length) return `services root (AppBackgroundServices, research A-3): ${obs.servicesErrors[0].phase} ${obs.servicesErrors[0].message}`;
    const seen = new Set((obs.mounts ?? []).map(m => m.kind));
    for (const kind of HOSTED_KINDS) if (!seen.has(kind)) return `${kind}: not mounted`;
    for (const m of obs.mounts) {
        if ((m.reactErrors ?? []).length) return `${m.kind}: ${m.reactErrors[0].phase} ${m.reactErrors[0].message}`;
        const thrown = (m.windowErrors ?? []).filter(e => !BENIGN_WINDOW_ERROR.test(e));
        if (thrown.length) return `${m.kind}: window error ${thrown[0]}`;
        if (m.rendered !== true) return `${m.kind}: nothing rendered (${m.detail ?? 'empty root'})`;
    }
    return null;
}

/** The output lines and exit code for both stages (null stage = not reached). */
export function render({ isolated, isolatedDetail, mounts, kinds, chatSource, harness }) {
    const lines = [];
    if (isolated !== undefined) lines.push(isolated === null ? `${NAME}: isolated per-leaf mount PASS -- ${isolatedDetail}` : `${NAME}: isolated per-leaf mount FAIL -- ${isolated}`);
    if (mounts !== undefined) lines.push(mounts === null ? `${NAME}: mounts PASS -- ${kinds.join(', ')} (agent-session from ${chatSource})` : `${NAME}: mounts FAIL -- ${mounts}`);
    const ok = isolated === null && mounts === null && !harness;
    if (harness) lines.push(`${NAME}: FAIL -- harness: ${harness}`);
    else lines.push(ok ? `${NAME}: PASS -- isolated per-leaf mount and ${kinds.length} hosted type(s) mounted` : `${NAME}: FAIL -- ${isolated !== null ? 'isolated per-leaf mount' : 'mounts'}`);
    return { code: ok ? 0 : 1, lines };
}

// ---------------------------------------------------------------- live

const READ_ROOT = id => `JSON.stringify((() => {
    const host = document.getElementById('pb-host-' + ${J(id)});
    if (!host) return null;
    const visible = el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && el.offsetParent !== null; };
    const xterms = [...host.querySelectorAll('.xterm')];
    const root = host.firstElementChild;
    return { xtermsTotal: xterms.length, xtermsVisible: xterms.filter(visible).length, elements: host.querySelectorAll('*').length,
        waiting: !!host.querySelector('[data-pb-orca-waiting]'), text: (host.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 160),
        children: root ? root.querySelectorAll('[data-pb-orca-pane-root] > *').length : 0 };
})())`;

const handleIn = result => /"(term_[A-Za-z0-9_-]+)"/.exec(J(result))?.[1] ?? null;
const tailText = result => J(result?.result?.terminal?.tail ?? result?.terminal?.tail ?? result ?? '');

async function stage0(s, ctxId, worktreeIdOut) {
    const { orca, evalIn, repoDir } = s;
    const ev = expr => evalIn(ctxId, expr);
    const { pollFor, sleep, handlesOf } = s.lib;
    const records = async () => JSON.parse(await ev('JSON.stringify(window.__pbPanes || [])'));
    const known = new Set((await records()).map(r => r.tabId));
    const created = orca('terminal', 'create', '--worktree', `path:${repoDir}`);
    const h1 = handleIn(created);
    if (!h1) throw new Error(`orca terminal create returned no handle: ${J(created).slice(0, 200)}`);
    const first = await pollFor(async () => (await records()).find(r => r.kind === 'terminal' && !known.has(r.tabId)), 20000, 'the CLI terminal to become a pane record');
    worktreeIdOut.id = first.worktreeId;
    const split = orca('terminal', 'split', '--terminal', h1, '--direction', 'vertical');
    const h2 = handleIn(split);
    if (!h2 || h2 === h1) throw new Error(`orca terminal split returned no new handle: ${J(split).slice(0, 200)}`);
    let pair = [];
    try {
        pair = await pollFor(async () => { const r = (await records()).filter(x => x.tabId === first.tabId); return r.length >= 2 && r.every(x => x.paneKey) ? r : null; }, 20000, 'two leaf records');
    } catch { pair = (await records()).filter(x => x.tabId === first.tabId); }
    const obs = { records: pair.length, paneKeys: pair.map(r => r.paneKey) };
    obs.neighbours = pair.length === 2 && pair[0].neighbours.some(n => n.key === pair[1].key) && pair[1].neighbours.some(n => n.key === pair[0].key);
    obs.modes = pair.map(r => r.neighbours[0]?.mode ?? null);
    if (pair.length !== 2) return obs;
    await sleep(1500);
    obs.handlesBefore = handlesOf(orca('terminal', 'list', '--worktree', `path:${repoDir}`));
    const tag = Date.now().toString(36);
    await ev(`(() => { for (const id of ['a' + ${J(tag)}, 'b' + ${J(tag)}]) document.getElementById('pb-host-' + id)?.remove();
        const a = window.__pbHost('terminal', 'a' + ${J(tag)}, [0, 0, 560, 420]); const b = window.__pbHost('terminal', 'b' + ${J(tag)}, [580, 0, 560, 420]);
        window.__pbErrorsBefore = window.PbPanes.state().mountErrors.length;
        window.__pbUnmount0 = [window.PbPanes.mountPane(a, ${J({ kind: 'terminal', worktreeId: pair[0].worktreeId, tabId: pair[0].tabId, paneKey: pair[0].paneKey })}),
            window.PbPanes.mountPane(b, ${J({ kind: 'terminal', worktreeId: pair[1].worktreeId, tabId: pair[1].tabId, paneKey: pair[1].paneKey })})]; return true; })()`);
    const ids = ['a' + tag, 'b' + tag];
    try { await pollFor(async () => { const r = await Promise.all(ids.map(id => ev(READ_ROOT(id)).then(JSON.parse))); return r.every(x => x?.xtermsVisible > 0); }, 30000, 'both roots to show an xterm'); } catch { /* measured below */ }
    await sleep(2500);
    obs.roots = [];
    const handles = [h1, h2];
    for (const [i, id] of ids.entries()) {
        const root = JSON.parse(await ev(READ_ROOT(id)));
        const marker = `pbleaf${i}${tag}`;
        const focused = await ev(`(() => { const host = document.getElementById('pb-host-' + ${J(id)});
            const vis = [...host.querySelectorAll('.xterm')].find(x => x.getBoundingClientRect().width > 0) || host.querySelector('.xterm');
            const ta = vis && vis.querySelector('.xterm-helper-textarea'); if (!ta) return false; ta.focus(); return document.activeElement === ta; })()`);
        if (focused) await s.typeIn(ctxId, `echo ${marker}`);
        let own = false;
        try { own = await pollFor(async () => tailText(orca('terminal', 'read', '--terminal', handles[i])).includes(marker), 10000, 'the marker in its own leaf'); } catch { /* recorded */ }
        const other = tailText(orca('terminal', 'read', '--terminal', handles[1 - i])).includes(marker);
        obs.roots.push({ xtermsTotal: root?.xtermsTotal ?? 0, xtermsVisible: root?.xtermsVisible ?? 0, focused, ownMarker: own === true, otherMarker: other });
    }
    obs.handlesAfter = handlesOf(orca('terminal', 'list', '--worktree', `path:${repoDir}`));
    obs.mountErrors = JSON.parse(await ev('JSON.stringify(window.PbPanes.state().mountErrors.slice(window.__pbErrorsBefore))'));
    await ev('(() => { for (const u of window.__pbUnmount0 || []) u(); return true; })()');
    return obs;
}

/**
 * Before any pane mounts: a terminal through the bundle's createTerminal (terminal.create). Measured
 * (2026-11-10): once a TerminalPane has mounted in a client, later host terminals (CLI or
 * terminal.create) stop becoming tabs in that client for at least 30 s, so this tab is made first.
 */
async function preCreateTerminal(s, ctxId) {
    const ev = expr => s.evalIn(ctxId, expr);
    const records = async () => JSON.parse(await ev('JSON.stringify(window.__pbPanes || [])'));
    const anchor = s.orca('terminal', 'create', '--worktree', `path:${s.repoDir}`);
    const first = await s.lib.pollFor(async () => (await records()).find(r => r.kind === 'terminal'), 20000, 'a CLI terminal to become a pane record');
    const known = new Set((await records()).map(r => r.key));
    const handlesBefore = s.lib.handlesOf(s.orca('terminal', 'list', '--worktree', `path:${s.repoDir}`));
    const created = await ev(`window.PbPanes.createTerminal(${J(first.worktreeId)}).then(() => 'ok', e => 'failed: ' + String(e && e.message || e).slice(0, 200))`);
    try {
        const term = await s.lib.pollFor(async () => (await records()).find(r => r.kind === 'terminal' && !known.has(r.key)), 20000, 'the createTerminal tab');
        return { worktreeId: first.worktreeId, term, anchor: !!anchor };
    } catch {
        const handlesAfter = s.lib.handlesOf(s.orca('terminal', 'list', '--worktree', `path:${s.repoDir}`));
        return { worktreeId: first.worktreeId, term: null, detail: `createTerminal (${created}) gave no pane record in 20 s; host handles ${handlesBefore.length} -> ${handlesAfter.length}` };
    }
}

/** Informational: does a CLI terminal created now (after mounts) become a tab within 15 s? */
async function lateCliTerminal(s, ctxId) {
    const records = async () => JSON.parse(await s.evalIn(ctxId, 'JSON.stringify(window.__pbPanes || [])'));
    const known = new Set((await records()).map(r => r.tabId));
    s.orca('terminal', 'create', '--worktree', `path:${s.repoDir}`);
    try { await s.lib.pollFor(async () => (await records()).some(r => r.kind === 'terminal' && !known.has(r.tabId)), 15000, 'late'); return 'yes'; } catch { return 'no (15 s)'; }
}

async function mountOne(s, ctxId, pick, slot, settleMs = 7000) {
    const ev = expr => s.evalIn(ctxId, expr);
    const id = `k${slot}`;
    await ev(`(() => { window.__pbWinErrBefore = window.__pbErrors.length; window.__pbErrorsBefore = window.PbPanes.state().mountErrors.length;
        const root = window.__pbHost(${J(pick.kind)}, ${J(id)}, [0, 440, 1100, 520]);
        window.__pbUnmountK = window.PbPanes.mountPane(root, ${J(pick)}); return true; })()`);
    await s.lib.sleep(settleMs);
    const read = JSON.parse(await ev(READ_ROOT(id)));
    const reactErrors = JSON.parse(await ev('JSON.stringify(window.PbPanes.state().mountErrors.slice(window.__pbErrorsBefore))'));
    const windowErrors = JSON.parse(await ev('JSON.stringify(window.__pbErrors.slice(window.__pbWinErrBefore))'));
    await ev(`(() => { window.__pbUnmountK(); document.getElementById('pb-host-' + ${J(id)}).remove(); return true; })()`);
    const rendered = !!read && !read.waiting && read.children > 0 && read.elements > 2;
    return { kind: pick.kind, rendered, reactErrors, windowErrors, detail: read ? `${read.elements} element(s)${read.waiting ? ', waiting state' : ''}` : 'no host', text: read?.text ?? '' };
}

async function stage1(s, ctxId, worktreeId, pre) {
    const ev = expr => s.evalIn(ctxId, expr);
    const { pollFor } = s.lib;
    const records = async () => JSON.parse(await ev('JSON.stringify(window.__pbPanes || [])'));
    const out = { mounts: [] };
    // The detector: a kind with no hosted mount throws inside mountPane's root (PaneBody's last line).
    const anyTab = (await records()).find(r => r.kind === 'terminal');
    const control = await mountOne(s, ctxId, { kind: 'pb-planted-throw', worktreeId: anyTab.worktreeId, tabId: anyTab.tabId, paneKey: null }, 'ctl', 1500);
    out.control = { recorded: control.reactErrors.some(e => e.kind === 'pb-planted-throw' && /no hosted mount/.test(e.message)) };
    out.servicesErrors = JSON.parse(await ev("JSON.stringify(window.PbPanes.state().mountErrors.filter(e => e.kind === 'services'))"));
    if (!out.control.recorded) return out;

    // terminal, one leaf: the tab createTerminal (terminal.create) made before any pane mounted.
    if (pre.term) {
        out.mounts.push(await mountOne(s, ctxId, { kind: 'terminal', worktreeId, tabId: pre.term.tabId, paneKey: pre.term.paneKey }, 'term'));
    } else {
        out.mounts.push({ kind: 'terminal', rendered: false, reactErrors: [], windowErrors: [], detail: pre.detail });
    }
    // A8: git-status polling follows the store's active worktree (the product widget sets it on activation).
    await ev(`(() => { window.PbPanes.setActiveWorktree(${J(worktreeId)}); return true; })()`);

    // agent-session: Orca's own chat launch, else a synthetic id (recorded).
    const knownChats = new Set((await records()).filter(r => r.kind === 'agent-session').map(r => r.key));
    const launched = await ev(`window.PbPanes.createChat(${J(worktreeId)}).then(() => 'ok', e => 'failed: ' + String(e && e.message || e).slice(0, 200))`);
    let chat = null;
    try { chat = await pollFor(async () => (await records()).find(r => r.kind === 'agent-session' && !knownChats.has(r.key)), 15000, 'a chat tab'); } catch { /* synthetic below */ }
    out.chatSource = chat ? 'createChat' : `synthetic id (createChat ${launched})`;
    out.mounts.push(await mountOne(s, ctxId, { kind: 'agent-session', worktreeId, tabId: chat?.tabId ?? 'pb-synthetic-chat-tab', paneKey: null }, 'chat'));

    for (const [kind, detail] of [['simulator'], ['conflict-review', 'README.md'], ['check-details', 'pb-orca-pane-check']]) {
        const opened = await ev(`window.PbPanes.openPane(${J(kind)}, ${J(worktreeId)}${detail ? `, ${J(detail)}` : ''}).then(id => ({ id }), e => ({ error: String(e && e.message || e).slice(0, 200) }))`);
        if (!opened?.id) { out.mounts.push({ kind, rendered: false, reactErrors: [], windowErrors: [], detail: `openPane: ${opened?.error}` }); continue; }
        out.mounts.push(await mountOne(s, ctxId, { kind, worktreeId, tabId: opened.id, paneKey: null }, kind));
    }
    return out;
}

async function live() {
    const harness = await import('./lib/orca-pane-harness.mjs');
    const skips = harness.skipReasons();
    if (skips.length) { console.log(`${NAME}: SKIP -- ${skips.join('; ')}`); return 0; }
    if (!existsSync(join(harness.STANDALONE_DIR, 'pb-panes.js'))) {
        const b = spawnSync('bash', [join(REPO_ROOT, 'scripts', 'build-orca-panes.sh'), '--standalone'], { encoding: 'utf8' });
        if (b.status !== 0) { console.log(`${NAME}: FAIL -- harness: build-orca-panes.sh --standalone: ${(b.stdout ?? '').trim().split('\n').pop()}`); return 1; }
    }
    const { pollFor } = await import('./lib/pb-live-probe.mjs');
    const result = { kinds: [] };
    try {
        await harness.withOrcaPaneSession({ log: line => console.log(line) }, async s => {
            s.lib = { pollFor, sleep: harness.sleep, handlesOf: harness.handlesOf };
            const ctxId = await s.openStandalone();
            await s.evalIn(ctxId, '(() => { window.__pbPanes = []; window.PbPanes.subscribePanes(list => { window.__pbPanes = list; }); return true; })()');
            const pre = await preCreateTerminal(s, ctxId);
            const wt = { id: pre.worktreeId };
            let obs = await stage0(s, ctxId, wt);
            let verdict = isolatedVerdict(obs);
            if (verdict) {
                const first = verdict;
                obs = await stage0(s, ctxId, wt);
                verdict = isolatedVerdict(obs);
                if (verdict) verdict = `${verdict} (first attempt: ${first}); measured ${J({ roots: obs.roots, records: obs.records, handles: [obs.handlesBefore?.length, obs.handlesAfter?.length] })}`;
            }
            result.isolated = verdict;
            result.isolatedDetail = `2 leaf records (${(obs.modes ?? []).join('/')}), 1 visible xterm per root (totals ${(obs.roots ?? []).map(r => r.xtermsTotal).join('/')}), markers own-leaf only, ${obs.handlesAfter?.length ?? '?'} handle(s) unchanged`;
            console.log(render({ isolated: result.isolated, isolatedDetail: result.isolatedDetail }).lines[0]);
            const m = await stage1(s, ctxId, wt.id, pre);
            result.conflictText = (m.mounts ?? []).find(x => x.kind === 'conflict-review')?.text ?? '';
            result.late = await lateCliTerminal(s, ctxId);
            result.mounts = mountsVerdict(m);
            result.kinds = (m.mounts ?? []).map(x => x.kind);
            result.chatSource = m.chatSource ?? 'not reached';
            if (process.env.PB_ORCA_PANE_DEBUG === '1') console.log(`debug: ${J(m).slice(0, 3000)}`);
        });
    } catch (error) {
        result.harness = String(error?.message ?? error).slice(0, 500);
    }
    const out = render(result);
    if (result.late) console.log(`${NAME}: note -- a CLI terminal created after TerminalPane mounts became a tab in this client: ${result.late}`);
    if (result.conflictText) console.log(`${NAME}: note -- hosted conflict review reads: ${result.conflictText.slice(0, 120)}`);
    for (const line of out.lines.slice(result.isolated !== undefined ? 1 : 0)) console.log(line);
    return out.code;
}

// ---------------------------------------------------------------- self-test

function selfTest() {
    let failed = 0;
    const ok = (name, cond) => { console.log(`  ${cond ? 'ok ' : 'NOT OK '} ${name}`); if (!cond) failed += 1; };
    const root = (o = {}) => ({ xtermsTotal: 2, xtermsVisible: 1, ownMarker: true, otherMarker: false, ...o });
    const iso = (o = {}) => ({ records: 2, paneKeys: ['t:a', 't:b'], neighbours: true, roots: [root(), root()], handlesBefore: ['term_1', 'term_2'], handlesAfter: ['term_1', 'term_2'], mountErrors: [], ...o });
    ok('isolated control green', isolatedVerdict(iso()) === null);
    ok('a second xterm in an isolated root is red', /root A shows 2 xterm/.test(isolatedVerdict(iso({ roots: [root({ xtermsVisible: 2 }), root()] })) ?? ''));
    ok('a marker reaching the other leaf is red', /reached the other leaf/.test(isolatedVerdict(iso({ roots: [root(), root({ otherMarker: true })] })) ?? ''));
    ok('a marker missing from its own leaf is red', /did not reach its own leaf/.test(isolatedVerdict(iso({ roots: [root({ ownMarker: false }), root()] })) ?? ''));
    ok('a grown handle count is red', /handle count changed: 2 before, 3 after/.test(isolatedVerdict(iso({ handlesAfter: ['term_1', 'term_2', 'term_3'] })) ?? ''));
    ok('one leaf record is red', /1 record/.test(isolatedVerdict(iso({ records: 1, paneKeys: ['t:a'] })) ?? ''));
    ok('a mount error in stage 0 is red', /mountErrors: terminal\/uncaught: boom/.test(isolatedVerdict(iso({ mountErrors: [{ kind: 'terminal', phase: 'uncaught', message: 'boom' }] })) ?? ''));
    const mount = (kind, o = {}) => ({ kind, rendered: true, reactErrors: [], windowErrors: [], ...o });
    const mo = (o = {}) => ({ control: { recorded: true }, mounts: HOSTED_KINDS.map(k => mount(k)), ...o });
    ok('mounts control green', mountsVerdict(mo()) === null);
    ok('a throwing-child control that did not register is red', /detector is blind/.test(mountsVerdict(mo({ control: { recorded: false } })) ?? ''));
    ok('a services-root error is red naming AppBackgroundServices', /^services root \(AppBackgroundServices/.test(mountsVerdict(mo({ servicesErrors: [{ kind: 'services', phase: 'uncaught', message: 'no provider' }] })) ?? ''));
    ok('a thrown mount is red naming kind and message', mountsVerdict(mo({ mounts: HOSTED_KINDS.map(k => mount(k, k === 'simulator' ? { reactErrors: [{ phase: 'uncaught', message: 'no provider X' }] } : {})) })) === 'simulator: uncaught no provider X');
    ok('a missing render is red', /^check-details: nothing rendered/.test(mountsVerdict(mo({ mounts: HOSTED_KINDS.map(k => mount(k, k === 'check-details' ? { rendered: false } : {})) })) ?? ''));
    ok('an unmounted kind is red', mountsVerdict(mo({ mounts: HOSTED_KINDS.filter(k => k !== 'agent-session').map(k => mount(k)) })) === 'agent-session: not mounted');
    ok('a ResizeObserver delivery notice alone stays green', mountsVerdict(mo({ mounts: HOSTED_KINDS.map(k => mount(k, k === 'terminal' ? { windowErrors: ['ResizeObserver loop completed with undelivered notifications.'] } : {})) })) === null);
    ok('a window error is red', /^terminal: window error x/.test(mountsVerdict(mo({ mounts: HOSTED_KINDS.map(k => mount(k, k === 'terminal' ? { windowErrors: ['x'] } : {})) })) ?? ''));
    const r = render({ isolated: null, isolatedDetail: 'd', mounts: 'simulator: x', kinds: HOSTED_KINDS, chatSource: 'createChat' });
    ok('render: isolated line precedes mounts line, last line FAIL', r.code === 1 && /isolated per-leaf mount PASS/.test(r.lines[0]) && /mounts FAIL/.test(r.lines[1]) && /: FAIL -- mounts$/.test(r.lines[2]));
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${J(SELF)})`], { encoding: 'utf8', timeout: 30000 });
    ok('importing the module prints and starts nothing', child.status === 0 && child.stdout === '' && child.stderr === '');
    console.log(failed ? `${NAME} self-test: FAIL -- ${failed} case(s)` : `${NAME} self-test: PASS -- every planted fault went red naming it`);
    return failed ? 1 : 0;
}

const INVOKED = process.argv[1] && resolve(process.argv[1]) === SELF;
if (INVOKED) {
    const args = process.argv.slice(2);
    if (args.some(a => a !== '--self-test')) { console.error(`usage: node scripts/verify-orca-pane-standalone-live.mjs [--self-test]`); process.exit(2); }
    process.exit(args.includes('--self-test') ? selfTest() : await live());
}
