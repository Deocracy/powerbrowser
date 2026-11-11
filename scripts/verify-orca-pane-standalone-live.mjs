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
// Late CLI terminal (the mirror-freeze guard, 64-MIRROR-FREEZE.md): after stage 1's mounts, a
// terminal created by the Orca CLI must become a pane record within 1000 ms of the CLI's exit.
//
// Mount gate (Phase 65, P65-04, P65-08): the kind list is the built entry's MOUNT_KINDS, read from the
// standalone page (never a hand-kept list). Stage 1 mounts the kinds it creates a tab for (terminal,
// agent-session, simulator); every other kind is mounted by the gate on the standalone page and under
// Route A (the Theia document, reached only through C64-1's boot handle on PowerBrowser's own orcad,
// pbOrcad): each mount waits up to 5 s and is a row { kind, route, attempt, mounted, threw, errorClass,
// providersAdded, importsAdded, descendantCount }. A planted throwing kind must be recorded on each route
// first. A kind in MOUNT_KINDS with no mounted row on either route is red naming it and the route.
// API clauses (Phase 65, B-2..B-10, P65-17, CA-07, CA-12, P65-22): after pairing, state().pairing reads
// session-only with session-no-ed25519; a marker localStorage key written by the page reads back (the
// control) and then orca.web.runtimeEnvironment.v1 is absent; subscribeWorktrees reports the scratch
// worktree with local true; the built CLI's file open of a scratch file yields an edit record within 1 s
// (else "files.open: unreachable from the paired client" and openPane('editor') is the driver, named);
// openPane('diff') with a branch source yields a branch diff record with both compare ids; setActiveView
// round-trips through subscribeActiveView; the services root shows no error fallback (a planted alert in
// it is detected first).
// --report <path> writes the rows (under .mozbuild/), the CA-12 hostId values of the scratch orcad's own
// worktrees and, with --width-probe settings, the narrowest Settings width with no horizontal overflow.
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
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'orca-pane-standalone-live';
const SELF = fileURLToPath(import.meta.url);
const J = JSON.stringify;

// The HTML spec reports a ResizeObserver delivery overrun as a window error event; it is the browser's
// notice that layout settled over two frames, not an exception thrown by the mount.
export const BENIGN_WINDOW_ERROR = /^ResizeObserver loop (completed with undelivered notifications|limit exceeded)/;

/** The kinds stage 1 creates an Orca tab for and mounts; MOUNT_KINDS' other kinds go through the gate. */
export const STAGE1_KINDS = ['terminal', 'agent-session', 'simulator'];
/** Phase 64's providers around every root (spike 004); a gate second attempt adds to them. */
export const PHASE64_PROVIDERS = ['I18nProvider', 'TooltipProvider', 'ConfirmationDialogProvider', 'LinkRoutingPreferenceDialogProvider'];
export const GATE_ROUTES = ['standalone', 'route-a'];

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
export function mountsVerdict(obs, kinds = STAGE1_KINDS) {
    if (!obs?.control || obs.control.recorded !== true) return 'error capture: the planted throwing child was not recorded (the detector is blind)';
    if ((obs.servicesErrors ?? []).length) return `services root (AppBackgroundServices, research A-3): ${obs.servicesErrors[0].phase} ${obs.servicesErrors[0].message}`;
    const seen = new Set((obs.mounts ?? []).map(m => m.kind));
    for (const kind of kinds) if (!seen.has(kind)) return `${kind}: not mounted`;
    for (const m of obs.mounts) {
        if ((m.reactErrors ?? []).length) return `${m.kind}: ${m.reactErrors[0].phase} ${m.reactErrors[0].message}`;
        const thrown = (m.windowErrors ?? []).filter(e => !BENIGN_WINDOW_ERROR.test(e));
        if (thrown.length) return `${m.kind}: window error ${thrown[0]}`;
        if (m.rendered !== true) return `${m.kind}: nothing rendered (${m.detail ?? 'empty root'})`;
    }
    return null;
}

/**
 * The mount gate. kinds: the built entry's MOUNT_KINDS (null when it could not be read); rows: gateRow
 * records; controls: { [route]: recorded }; routes: the routes that ran. Every kind outside STAGE1_KINDS
 * needs a mounted row on every route. Returns null (pass) or the failure naming kind and route.
 */
export function gateVerdict({ kinds, rows, controls, routes = GATE_ROUTES }) {
    if (!Array.isArray(kinds) || kinds.length === 0) return 'the kind list could not be read from the built entry (MOUNT_KINDS)';
    for (const route of routes) if (controls?.[route] !== true) return `${route}: the planted throwing kind was not recorded (the detector is blind)`;
    for (const kind of kinds.filter(k => !STAGE1_KINDS.includes(k))) {
        for (const route of routes) {
            const row = (rows ?? []).filter(r => r.kind === kind && r.route === route).pop();
            if (!row) return `${kind} (${route}): not mounted`;
            if (!row.mounted) return `${kind} (${route}): ${row.message ?? `nothing rendered (${row.descendantCount} element(s))`}`;
        }
    }
    return null;
}

export const OPEN_LIMIT_MS = 1000;
const HEX_ID = /^[0-9a-f]{40}([0-9a-f]{24})?$/;

/**
 * The API clauses. obs: { pairing, markerReadBack, envKeyPresent, worktree, openFile: { driver, record, ms },
 * diff, view: { set, restored }, services: { controlDetected, fallback, errors } }. Controls are judged first.
 */
export function apiVerdict(obs) {
    if (!obs) return 'not measured';
    if (obs.markerReadBack !== true) return 'collector blind: the marker localStorage key written by the page did not read back';
    if (obs.services?.controlDetected !== true) return 'collector blind: a planted alert in the services root was not detected';
    if (obs.pairing?.sessionOnly !== true || obs.pairing?.deviceKeySupport !== 'session-no-ed25519') return `pairing is not session-only (sessionOnly ${obs.pairing?.sessionOnly}, deviceKeySupport ${obs.pairing?.deviceKeySupport})`;
    if (obs.envKeyPresent !== false) return 'the runtime-environment key orca.web.runtimeEnvironment.v1 is present in localStorage';
    if (!obs.worktree?.found) return 'subscribeWorktrees: no record for the scratch worktree path';
    if (obs.worktree.local !== true) return 'subscribeWorktrees: the scratch worktree is not local';
    const f = obs.openFile;
    if (!f?.record) return `subscribeOpenFiles: no edit record for the opened file (driver ${f?.driver ?? 'none'})`;
    if (f.record.mode !== 'edit' || f.record.pathMatches !== true || f.record.local !== true) return `subscribeOpenFiles: the opened file's record is ${JSON.stringify(f.record)}`;
    if (f.driver === 'files.open' && !(f.ms <= OPEN_LIMIT_MS)) return `files.open: the record came after ${f.ms} ms, over ${OPEN_LIMIT_MS} ms`;
    const d = obs.diff;
    if (!d?.record) return `openPane('diff'): no diff record${d?.error ? ` (${d.error})` : ''}`;
    if (d.record.mode !== 'diff' || d.record.diffSource !== 'branch' || !HEX_ID.test(d.record.branch?.mergeBase ?? '') || !HEX_ID.test(d.record.branch?.headOid ?? '')) return `openPane('diff'): the record is ${JSON.stringify(d.record)}`;
    if (obs.view?.set !== 'tasks') return `setActiveView('tasks'): subscribeActiveView reported ${obs.view?.set}`;
    if (obs.view?.restored !== 'terminal') return `setActiveView('terminal'): subscribeActiveView reported ${obs.view?.restored}`;
    if (obs.services.fallback) return 'the services root shows an Orca error fallback (resume-modal boundary)';
    if ((obs.services.errors ?? []).length) return `services root: ${obs.services.errors[0].phase} ${obs.services.errors[0].message}`;
    return null;
}

/** The width probe's clause: null when a width without horizontal overflow was found. */
export function widthVerdict(probe) {
    if (!probe) return 'the Settings width probe did not run';
    const at = probe.steps?.at(-1);
    return Number.isInteger(probe.narrowest) ? null : `Settings overflows horizontally at every width probed, last ${at?.[0] ?? '?'} px${at?.[2] ? ` (${at[2].map(([el, sw, cw]) => `${el} ${sw}/${cw}`).join('; ')})` : ''}`;
}

export const LATE_LIMIT_MS = 1000;

/** The late CLI clause: null when the record came within LATE_LIMIT_MS, else the reason. */
export function lateVerdict(ms) {
    if (ms === null) return 'a CLI terminal created after TerminalPane mounts was no tab in this client within 15 s (the mirror freeze, 64-MIRROR-FREEZE.md)';
    return ms <= LATE_LIMIT_MS ? null : `a CLI terminal created after TerminalPane mounts became a tab after ${ms} ms, over ${LATE_LIMIT_MS} ms`;
}

/** The output lines and exit code for both stages and the late clause (undefined = not reached). */
export function render({ isolated, isolatedDetail, mounts, kinds, chatSource, harness, late, lateMs, gate, gateDetail, width, widthDetail, api }) {
    const lines = [];
    if (isolated !== undefined) lines.push(isolated === null ? `${NAME}: isolated per-leaf mount PASS -- ${isolatedDetail}` : `${NAME}: isolated per-leaf mount FAIL -- ${isolated}`);
    if (mounts !== undefined) lines.push(mounts === null ? `${NAME}: mounts PASS -- ${kinds.join(', ')} (agent-session from ${chatSource})` : `${NAME}: mounts FAIL -- ${mounts}`);
    if (late !== undefined) lines.push(late === null ? `${NAME}: late CLI terminal PASS -- a tab in ${lateMs} ms (limit ${LATE_LIMIT_MS} ms)` : `${NAME}: late CLI terminal FAIL -- ${late}`);
    if (gate !== undefined) lines.push(gate === null ? `${NAME}: mount gate PASS -- ${gateDetail}` : `${NAME}: mount gate FAIL -- ${gate}`);
    if (width !== undefined) lines.push(width === null ? `${NAME}: width probe PASS -- ${widthDetail}` : `${NAME}: width probe FAIL -- ${width}`);
    if (api !== undefined) lines.push(api === null ? `${NAME}: API PASS -- session-only pairing (session-no-ed25519, no runtime-environment key), local worktree, open-file and branch-diff records, setActiveView round trip, resume offer mounted without fallback` : `${NAME}: API FAIL -- ${api}`);
    const failed = [[isolated, 'isolated per-leaf mount'], [mounts, 'mounts'], [late, 'late CLI terminal'], [gate, 'mount gate'], [width, 'width probe'], [api, 'API']]
        .filter(([v]) => v !== null && v !== undefined).map(([, name]) => name);
    const missing = [isolated, mounts, late, api].some(v => v === undefined);
    const ok = !failed.length && !missing && !harness;
    if (harness) lines.push(`${NAME}: FAIL -- harness: ${harness}`);
    else lines.push(ok ? `${NAME}: PASS -- isolated per-leaf mount, ${kinds.length} hosted type(s) mounted, late CLI terminal in ${lateMs} ms${gate === null ? `, mount gate ${gateDetail}` : ''}` : `${NAME}: FAIL -- ${failed[0] ?? 'not reached'}`);
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
 * Before any pane mounts: a terminal through the bundle's createTerminal (terminal.create). The
 * mirror freeze that once forced this order is fixed in the entry (64-MIRROR-FREEZE.md) and judged
 * by the late CLI clause; the order is harmless and kept.
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

/** The late CLI clause's measurement: ms from the CLI's exit until the new tab is a record, null after 15 s. */
async function lateCliTerminal(s, ctxId) {
    const records = async () => JSON.parse(await s.evalIn(ctxId, 'JSON.stringify(window.__pbPanes || [])'));
    const known = new Set((await records()).map(r => r.tabId));
    s.orca('terminal', 'create', '--worktree', `path:${s.repoDir}`);
    const t0 = Date.now();
    try { await s.lib.pollFor(async () => (await records()).some(r => r.kind === 'terminal' && !known.has(r.tabId)), 15000, 'late'); return Date.now() - t0; } catch { return null; }
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

    for (const [kind, detail] of [['simulator']]) {
        const opened = await ev(`window.PbPanes.openPane(${J(kind)}, ${J(worktreeId)}${detail ? `, ${J(detail)}` : ''}).then(id => ({ id }), e => ({ error: String(e && e.message || e).slice(0, 200) }))`);
        if (!opened?.id) { out.mounts.push({ kind, rendered: false, reactErrors: [], windowErrors: [], detail: `openPane: ${opened?.error}` }); continue; }
        out.mounts.push(await mountOne(s, ctxId, { kind, worktreeId, tabId: opened.id, paneKey: null }, kind));
    }
    return out;
}

/** The distinct hostId and executionHostId values anywhere in `orca worktree list --json` (CA-12, A4). */
export function hostIdValues(listed) {
    const out = { hostId: new Set(), executionHostId: new Set() };
    const walk = v => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { if (k in out && (typeof x === 'string' || x === null)) out[k].add(x); else walk(x); } };
    walk(listed);
    return { hostId: [...out.hostId].sort(), executionHostId: [...out.executionHostId].sort() };
}

/** The API clauses on the standalone page (pairing, storage, worktrees, open files, diff, view, services root). */
async function apiClauses(s, ctxId, harness) {
    const ev = expr => s.evalIn(ctxId, expr);
    const { pollFor, sleep } = s.lib;
    const obs = {};
    obs.pairing = JSON.parse(await ev('JSON.stringify(window.PbPanes.state().pairing)'));
    const marker = `pb-orca-pane-marker-${Date.now().toString(36)}`;
    obs.markerReadBack = await ev(`(() => { localStorage.setItem(${J(marker)}, 'x'); const ok = localStorage.getItem(${J(marker)}) === 'x'; localStorage.removeItem(${J(marker)}); return ok; })()`);
    obs.envKeyPresent = await ev(`localStorage.getItem('orca.web.runtimeEnvironment.v1') !== null`);
    await ev(`(() => { window.__pbWs = null; window.__pbFiles = []; window.__pbView = null;
        window.PbPanes.subscribeWorktrees(w => { window.__pbWs = w; }); window.PbPanes.subscribeOpenFiles(f => { window.__pbFiles = f; });
        window.PbPanes.subscribeActiveView(v => { window.__pbView = v; }); return true; })()`);
    const ws = await pollFor(async () => JSON.parse(await ev('JSON.stringify(window.__pbWs)')), 10000, 'subscribeWorktrees');
    const wt = (ws?.worktrees ?? []).find(w => w.path === s.repoDir);
    obs.worktree = { found: !!wt, local: wt?.local };
    // files.open through the built CLI on a scratch file; the paired hosted client must receive the tab.
    const name = `pb-open-${Date.now().toString(36)}.txt`;
    (await import('node:fs')).writeFileSync(join(s.repoDir, name), 'pb\n');
    const abs = join(s.repoDir, name);
    const findRecord = async () => JSON.parse(await ev(`JSON.stringify(window.__pbFiles.find(f => f.filePath === ${J(abs)} && f.mode === 'edit') || null)`));
    let driver = 'files.open', record = null, ms = null;
    try {
        s.orca('file', 'open', abs, '--worktree', `path:${s.repoDir}`);
        const t0 = Date.now();
        try { record = await pollFor(findRecord, 5000, 'the files.open record'); ms = Date.now() - t0; } catch { record = null; }
    } catch { record = null; }
    if (!record) {
        console.log(`${NAME}: files.open: unreachable from the paired client`);
        driver = "openPane('editor')";
        await ev(`window.PbPanes.openPane('editor', ${J(ws.worktrees.find(w => w.path === s.repoDir)?.id ?? '')}, ${J(name)}).then(() => true, () => false)`);
        try { record = await pollFor(findRecord, 5000, 'the openPane editor record'); } catch { record = null; }
    }
    console.log(`${NAME}: files.open driver -- ${driver}${ms !== null ? ` (record in ${ms} ms)` : ''}`);
    obs.openFile = { driver, ms, record: record ? { mode: record.mode, pathMatches: record.filePath === abs, local: record.local } : null };
    // A branch diff of README.md against the side branch.
    const wtId = wt?.id ?? '';
    const opened = JSON.parse(await ev(`window.PbPanes.openPane('diff', ${J(wtId)}, ${J(J({ source: 'branch', relativePath: 'README.md', baseRef: 'side' }))}).then(id => JSON.stringify({ id }), e => JSON.stringify({ error: String(e && e.message || e).slice(0, 200) }))`));
    let diff = null;
    if (opened.id) try { diff = await pollFor(async () => JSON.parse(await ev(`JSON.stringify(window.__pbFiles.find(f => f.mode === 'diff' && f.diffSource === 'branch' && f.relativePath === 'README.md') || null)`)), 5000, 'the diff record'); } catch { diff = null; }
    obs.diff = { record: diff ? { mode: diff.mode, diffSource: diff.diffSource, branch: diff.branch, local: diff.local } : null, error: opened.error };
    // setActiveView round trip.
    await ev(`(() => { window.PbPanes.setActiveView('tasks'); return true; })()`);
    await sleep(300);
    const set = JSON.parse(await ev('JSON.stringify(window.__pbView)'))?.view;
    await ev(`(() => { window.PbPanes.setActiveView('terminal'); return true; })()`);
    await sleep(300);
    obs.view = { set, restored: JSON.parse(await ev('JSON.stringify(window.__pbView)'))?.view };
    // The services root: a planted alert is detected first, then Orca's own fallback must be absent.
    const servicesQuery = `document.querySelector('[data-pb-orca-services] [role="alert"]') !== null`;
    const controlDetected = await ev(`(() => { const host = document.querySelector('[data-pb-orca-services]'); if (!host) return false; const a = document.createElement('div'); a.setAttribute('role', 'alert'); a.id = 'pb-services-control'; host.appendChild(a);
        const seen = ${servicesQuery}; a.remove(); return seen; })()`);
    obs.services = { controlDetected, fallback: await ev(servicesQuery), errors: JSON.parse(await ev("JSON.stringify(window.PbPanes.state().mountErrors.filter(e => e.kind === 'services'))")) };
    return obs;
}

/**
 * The gate on one route: the planted throwing kind first (the detector), then every gate kind. ev evaluates in
 * the route's document; worktreeId is a worktree of the orcad that route is paired with (check-details' tab).
 */
async function gateRoute(s, harness, route, ev, kinds, worktreeId, imports) {
    const rows = [];
    const control = await harness.gateMount(ev, route, { kind: 'pb-planted-throw', worktreeId, tabId: 'pb-planted', paneKey: null }, { waitMs: 1500 });
    await harness.gateUnmount(ev, control.hostId);
    const recorded = control.reactErrors.some(e => e.kind === 'pb-planted-throw' && /no hosted mount/.test(e.message));
    const providersAdded = [];
    for (const kind of kinds) {
        let pick = { kind, worktreeId: '', tabId: '', paneKey: null };
        if (kind === 'check-details') {
            const M = harness.ROUTE_ENTRY[route];
            const opened = JSON.parse(await ev(`${M}.openPane('check-details', ${J(worktreeId)}, 'pb-orca-gate-check').then(id => JSON.stringify({ id }), e => JSON.stringify({ error: String(e && e.message || e).slice(0, 200) }))`));
            if (!opened.id) { rows.push(harness.gateRow({ kind, route, threw: `openPane: ${opened.error}`, descendantCount: 0 })); continue; }
            pick = { kind, worktreeId, tabId: opened.id, paneKey: null };
        }
        const obs = await harness.gateMount(ev, route, pick);
        await harness.gateUnmount(ev, obs.hostId);
        rows.push(harness.gateRow({ ...obs, attempt: 1, providersAdded, importsAdded: imports[kind] ?? [] }));
    }
    return { rows, recorded };
}

async function live(opts = {}) {
    const harness = await import('./lib/orca-pane-harness.mjs');
    const skips = harness.skipReasons();
    if (skips.length) { console.log(`${NAME}: SKIP -- ${skips.join('; ')}`); return 0; }
    if (!existsSync(join(harness.STANDALONE_DIR, 'pb-panes.js'))) {
        const b = spawnSync('bash', [join(REPO_ROOT, 'scripts', 'build-orca-panes.sh'), '--standalone'], { encoding: 'utf8' });
        if (b.status !== 0) { console.log(`${NAME}: FAIL -- harness: build-orca-panes.sh --standalone: ${(b.stdout ?? '').trim().split('\n').pop()}`); return 1; }
    }
    const { pollFor } = await import('./lib/pb-live-probe.mjs');
    // Route A runs in the Theia document on PowerBrowser's own orcad (C64-7), whenever orca-panes is in the tree.
    const routeA = existsSync(join(REPO_ROOT, 'theia', 'extensions', 'orca-panes'));
    const result = { kinds: [] };
    const report = { rows: [], routes: routeA ? GATE_ROUTES : ['standalone'] };
    try {
        await harness.withOrcaPaneSession({ log: line => console.log(line), pbOrcad: routeA }, async s => {
            s.lib = { pollFor, sleep: harness.sleep, handlesOf: harness.handlesOf };
            const ctxId = await s.openStandalone();
            const mountKinds = JSON.parse(await s.evalIn(ctxId, 'JSON.stringify(Array.isArray(window.PbPanes.MOUNT_KINDS) ? window.PbPanes.MOUNT_KINDS : null)'));
            report.mountKinds = mountKinds;
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
            const stage1Kinds = (mountKinds ?? []).filter(k => STAGE1_KINDS.includes(k));
            result.conflictText = (m.mounts ?? []).find(x => x.kind === 'conflict-review')?.text ?? '';
            result.lateMs = await lateCliTerminal(s, ctxId);
            result.late = lateVerdict(result.lateMs);
            result.mounts = mountsVerdict(m, stage1Kinds.length ? stage1Kinds : STAGE1_KINDS);
            result.kinds = (m.mounts ?? []).map(x => x.kind);
            result.chatSource = m.chatSource ?? 'not reached';
            if (process.env.PB_ORCA_PANE_DEBUG === '1') console.log(`debug: ${J(m).slice(0, 3000)}`);

            result.api = apiVerdict(await apiClauses(s, ctxId, harness));

            // CA-12 (A4): the hostId values headless orcad reports for its own worktrees; field values only.
            report.hostIds = hostIdValues(s.orca('worktree', 'list'));
            console.log(`${NAME}: CA-12 -- orca worktree list hostId values ${J(report.hostIds.hostId)}, executionHostId values ${J(report.hostIds.executionHostId)}`);

            // The mount gate, standalone page first, then Route A.
            const gateKinds = (mountKinds ?? []).filter(k => !STAGE1_KINDS.includes(k));
            const imports = harness.kindImports(gateKinds);
            const controls = {};
            if (mountKinds) {
                const ev = expr => s.evalIn(ctxId, expr);
                const st = await gateRoute(s, harness, 'standalone', ev, gateKinds, wt.id, imports);
                report.rows.push(...st.rows); controls.standalone = st.recorded;
                if (opts.widthProbe === 'settings') {
                    const obs = await harness.gateMount(ev, 'standalone', { kind: 'settings', worktreeId: '', tabId: '', paneKey: null }, { waitMs: 8000, box: [0, 0, 640, 700] });
                    report.settingsWidth = obs.descendantCount > 0 ? await harness.widthProbe(ev, obs.hostId) : null;
                    await harness.gateUnmount(ev, obs.hostId);
                    result.width = widthVerdict(report.settingsWidth);
                    result.widthDetail = `Settings' narrowest width without horizontal overflow is ${report.settingsWidth?.narrowest} px (stepped ${report.settingsWidth?.direction} from 640 px by 20 px)`;
                }
                if (routeA) {
                    const evA = expr => s.app.evaluate(expr);
                    const M = harness.ROUTE_ENTRY['route-a'];
                    await s.startPbOrcad();
                    await pollFor(async () => (await evA(`!!${M} && ${M}.state().booted`)) === true, 120000, 'the orca-panes bundle to boot in the Theia document');
                    const wtA = await pollFor(async () => evA(`${M}.state().worktrees[0]?.id ?? null`), 60000, "PowerBrowser's orcad worktree in the Theia document's store");
                    await evA(`(() => { ${M}.setActiveWorktree(${J(wtA)}); return true; })()`);
                    const ra = await gateRoute(s, harness, 'route-a', evA, gateKinds, wtA, imports);
                    report.rows.push(...ra.rows); controls['route-a'] = ra.recorded;
                }
            }
            result.gate = gateVerdict({ kinds: mountKinds, rows: report.rows, controls, routes: report.routes });
            const mounted = report.rows.filter(r => r.mounted).length;
            result.gateDetail = `${gateKinds.length} gate kind(s) x ${report.routes.length} route(s) [${report.routes.join(', ')}], ${mounted} row(s) mounted, ${report.rows.filter(r => r.empty).length} empty by Orca's own state, controls recorded`;
            for (const r of report.rows) console.log(`${NAME}: gate ${r.route} ${r.kind} -- ${r.mounted ? 'mounted' : 'NOT mounted'}, ${r.descendantCount} element(s)${r.empty ? ', empty: ' + r.empty : ''}${r.message ? ', ' + r.message.slice(0, 120) : ''}`);
        });
    } catch (error) {
        result.harness = String(error?.message ?? error).slice(0, 500);
    }
    if (opts.report) {
        mkdirSync(dirname(opts.report), { recursive: true });
        writeFileSync(opts.report, `${J({ ...report, verdict: result.gate ?? null }, null, 2)}\n`);
        console.log(`${NAME}: report -- ${relative(REPO_ROOT, opts.report)}`);
    }
    const out = render(result);
    if (result.conflictText) console.log(`${NAME}: note -- hosted conflict review reads: ${result.conflictText.slice(0, 120)}`);
    for (const line of out.lines.slice(result.isolated !== undefined ? 1 : 0)) console.log(line);
    return out.code;
}

// ---------------------------------------------------------------- self-test

async function selfTest() {
    const { gateRow: gateRowOf } = await import('./lib/orca-pane-harness.mjs');
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
    const mo = (o = {}) => ({ control: { recorded: true }, mounts: STAGE1_KINDS.map(k => mount(k)), ...o });
    ok('mounts control green', mountsVerdict(mo()) === null);
    ok('a throwing-child control that did not register is red', /detector is blind/.test(mountsVerdict(mo({ control: { recorded: false } })) ?? ''));
    ok('a services-root error is red naming AppBackgroundServices', /^services root \(AppBackgroundServices/.test(mountsVerdict(mo({ servicesErrors: [{ kind: 'services', phase: 'uncaught', message: 'no provider' }] })) ?? ''));
    ok('a thrown mount is red naming kind and message', mountsVerdict(mo({ mounts: STAGE1_KINDS.map(k => mount(k, k === 'simulator' ? { reactErrors: [{ phase: 'uncaught', message: 'no provider X' }] } : {})) })) === 'simulator: uncaught no provider X');
    ok('a missing render is red', /^simulator: nothing rendered/.test(mountsVerdict(mo({ mounts: STAGE1_KINDS.map(k => mount(k, k === 'simulator' ? { rendered: false } : {})) })) ?? ''));
    ok('an unmounted kind is red', mountsVerdict(mo({ mounts: STAGE1_KINDS.filter(k => k !== 'agent-session').map(k => mount(k)) })) === 'agent-session: not mounted');
    ok('a ResizeObserver delivery notice alone stays green', mountsVerdict(mo({ mounts: STAGE1_KINDS.map(k => mount(k, k === 'terminal' ? { windowErrors: ['ResizeObserver loop completed with undelivered notifications.'] } : {})) })) === null);
    ok('a window error is red', /^terminal: window error x/.test(mountsVerdict(mo({ mounts: STAGE1_KINDS.map(k => mount(k, k === 'terminal' ? { windowErrors: ['x'] } : {})) })) ?? ''));
    // The mount gate (P65-04): rows through the harness's own gateRow, so the row rule is tested too.
    const kinds = [...STAGE1_KINDS, 'sidebar', 'orchestration', 'check-details'];
    const raw = (kind, route, o = {}) => ({ kind, route, descendantCount: 12, reactErrors: [], windowErrors: [], fallback: false, threw: null, ...o });
    const rowsOf = (over = {}) => GATE_ROUTES.flatMap(route => ['sidebar', 'orchestration', 'check-details'].map(k => gateRowOf(raw(k, route, over[`${k}@${route}`] ?? {}))));
    const ctl = { standalone: true, 'route-a': true };
    ok('gate control green', gateVerdict({ kinds, rows: rowsOf(), controls: ctl }) === null);
    ok('a kind list that could not be read is red', /could not be read from the built entry/.test(gateVerdict({ kinds: null, rows: rowsOf(), controls: ctl }) ?? ''));
    ok('a gate control that did not register is red naming the route', /^route-a: the planted throwing kind was not recorded/.test(gateVerdict({ kinds, rows: rowsOf(), controls: { standalone: true, 'route-a': false } }) ?? ''));
    ok('a MOUNT_KINDS kind with no row is red naming it and the route', gateVerdict({ kinds: [...kinds, 'page:tasks'], rows: rowsOf(), controls: ctl }) === 'page:tasks (standalone): not mounted');
    ok('a thrown gate mount is red naming kind, route and message', /^sidebar \(route-a\): no provider Q/.test(gateVerdict({ kinds, rows: rowsOf({ 'sidebar@route-a': { reactErrors: [{ kind: 'sidebar', phase: 'uncaught', message: 'no provider Q' }] } }), controls: ctl }) ?? ''));
    ok("an Orca error-boundary fallback is red", /^check-details \(standalone\): Orca error-boundary fallback/.test(gateVerdict({ kinds, rows: rowsOf({ 'check-details@standalone': { fallback: true } }), controls: ctl }) ?? ''));
    ok('an empty sidebar is red', /^sidebar \(standalone\): nothing rendered \(0 element/.test(gateVerdict({ kinds, rows: rowsOf({ 'sidebar@standalone': { descendantCount: 0 } }), controls: ctl }) ?? ''));
    ok("an empty orchestration mount is green and recorded as Orca's own state", gateVerdict({ kinds, rows: rowsOf({ 'orchestration@standalone': { descendantCount: 0 } }), controls: ctl }) === null
        && /experimentalOrchestrationPanel/.test(gateRowOf(raw('orchestration', 'standalone', { descendantCount: 0 })).empty ?? ''));
    ok('a window error in a gate mount is red', /^sidebar \(standalone\): boom/.test(gateVerdict({ kinds, rows: rowsOf({ 'sidebar@standalone': { windowErrors: ['boom'] } }), controls: ctl }) ?? ''));
    ok('width probe: a width found is green, none is red', widthVerdict({ narrowest: 380, steps: [[640, false]] }) === null && /overflows horizontally at every width probed, last 1600 px/.test(widthVerdict({ narrowest: null, steps: [[640, true], [1600, true]] }) ?? ''));
    ok('CA-12: hostId values are collected from any depth', J(hostIdValues({ result: { worktrees: [{ hostId: 'local', x: { executionHostId: 'local' } }, { hostId: null }] } })) === J({ hostId: ['local', null], executionHostId: ['local'] }));
    // API clauses (B-2..B-10, P65-17, CA-07, CA-12, P65-22).
    const H = 'a'.repeat(40);
    const api = (o = {}) => ({ pairing: { sessionOnly: true, deviceKeySupport: 'session-no-ed25519' }, markerReadBack: true, envKeyPresent: false, worktree: { found: true, local: true },
        openFile: { driver: 'files.open', ms: 120, record: { mode: 'edit', pathMatches: true, local: true } }, diff: { record: { mode: 'diff', diffSource: 'branch', branch: { mergeBase: H, headOid: H } } },
        view: { set: 'tasks', restored: 'terminal' }, services: { controlDetected: true, fallback: false, errors: [] }, ...o });
    ok('API control green', apiVerdict(api()) === null);
    ok('API: the openPane editor fallback driver is green', apiVerdict(api({ openFile: { driver: "openPane('editor')", ms: null, record: { mode: 'edit', pathMatches: true, local: true } } })) === null);
    ok('API: a marker that did not read back is red "collector blind"', /^collector blind: the marker/.test(apiVerdict(api({ markerReadBack: false })) ?? ''));
    ok('API: an undetected planted services alert is red', /^collector blind: a planted alert/.test(apiVerdict(api({ services: { controlDetected: false, fallback: false, errors: [] } })) ?? ''));
    ok('API: a persistent device key is red', /pairing is not session-only/.test(apiVerdict(api({ pairing: { sessionOnly: true, deviceKeySupport: 'persistent' } })) ?? ''));
    ok('API: the runtime-environment key present is red', /orca\.web\.runtimeEnvironment\.v1 is present/.test(apiVerdict(api({ envKeyPresent: true })) ?? ''));
    ok('API: a non-local worktree is red', /not local/.test(apiVerdict(api({ worktree: { found: true, local: false } })) ?? ''));
    ok('API: a missing open-file record is red', /no edit record/.test(apiVerdict(api({ openFile: { driver: 'files.open', record: null } })) ?? ''));
    ok('API: a slow files.open is red', /after 1500 ms/.test(apiVerdict(api({ openFile: { driver: 'files.open', ms: 1500, record: { mode: 'edit', pathMatches: true, local: true } } })) ?? ''));
    ok('API: a diff record without compare ids is red', /openPane\('diff'\)/.test(apiVerdict(api({ diff: { record: { mode: 'diff', diffSource: 'branch', branch: { mergeBase: null, headOid: H } } } })) ?? ''));
    ok('API: setActiveView not round-tripping is red', /setActiveView\('terminal'\)/.test(apiVerdict(api({ view: { set: 'tasks', restored: 'tasks' } })) ?? ''));
    ok('API: a resume-modal fallback is red', /error fallback/.test(apiVerdict(api({ services: { controlDetected: true, fallback: true, errors: [] } })) ?? ''));
    ok('late CLI terminal within the limit is green', lateVerdict(172) === null && lateVerdict(LATE_LIMIT_MS) === null);
    ok('late CLI terminal over the limit is red naming the time', /after 1200 ms, over 1000 ms/.test(lateVerdict(1200) ?? ''));
    ok('late CLI terminal never recorded is red naming the freeze', /within 15 s \(the mirror freeze/.test(lateVerdict(null) ?? ''));
    const r = render({ isolated: null, isolatedDetail: 'd', mounts: 'simulator: x', kinds: STAGE1_KINDS, chatSource: 'createChat', late: null, lateMs: 172 });
    ok('render: isolated line precedes mounts line, last line FAIL', r.code === 1 && /isolated per-leaf mount PASS/.test(r.lines[0]) && /mounts FAIL/.test(r.lines[1]) && /: FAIL -- mounts$/.test(r.lines[3]));
    const g = render({ isolated: null, isolatedDetail: 'd', mounts: null, kinds: STAGE1_KINDS, chatSource: 'createChat', late: null, lateMs: 172, api: null });
    ok('render: an API clause never reached is red', render({ isolated: null, isolatedDetail: 'd', mounts: null, kinds: STAGE1_KINDS, chatSource: 'createChat', late: null, lateMs: 172 }).code === 1);
    ok('render: all clauses green gives PASS naming the late time', g.code === 0 && /late CLI terminal in 172 ms$/.test(g.lines.at(-1)));
    const f = render({ isolated: null, isolatedDetail: 'd', mounts: null, kinds: STAGE1_KINDS, chatSource: 'createChat', late: lateVerdict(null), lateMs: null, api: null });
    ok('render: a late CLI terminal miss alone is red', f.code === 1 && /late CLI terminal FAIL/.test(f.lines[2]) && /: FAIL -- late CLI terminal$/.test(f.lines.at(-1)));
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${J(SELF)})`], { encoding: 'utf8', timeout: 30000 });
    ok('importing the module prints and starts nothing', child.status === 0 && child.stdout === '' && child.stderr === '');
    console.log(failed ? `${NAME} self-test: FAIL -- ${failed} case(s)` : `${NAME} self-test: PASS -- every planted fault went red naming it`);
    return failed ? 1 : 0;
}

const INVOKED = process.argv[1] && resolve(process.argv[1]) === SELF;
if (INVOKED) {
    const args = process.argv.slice(2);
    const opts = {};
    for (let i = 0; i < args.length; i += 1) {
        if (args[i] === '--self-test') opts.selfTest = true;
        else if (args[i] === '--report' && args[i + 1]) opts.report = resolve(args[++i]);
        else if (args[i] === '--width-probe' && args[i + 1] === 'settings') opts.widthProbe = args[++i];
        else { console.error('usage: node scripts/verify-orca-pane-standalone-live.mjs [--self-test] [--report <path under .mozbuild/>] [--width-probe settings]'); process.exit(2); }
    }
    if (opts.report && !opts.report.startsWith(join(REPO_ROOT, '.mozbuild') + '/')) { console.error(`${NAME}: --report must name a path under .mozbuild/`); process.exit(2); }
    process.exit(opts.selfTest ? await selfTest() : await live(opts));
}
