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
// pane bundle, ORCA_* scrubbed, redaction first) on the real agent (64-06, D-30):
// withOrcaTabsSession({ agent: 'real' }) puts no stub on PATH; the owner's claude
// must answer --version naming Claude Code, and orcad's environment must set the
// pre-installed SDK extension's directory holding the SDK's package.json
// (presence only, never the value). Stages f and g2 are red naming a missing
// precondition. Prompt budget: at most one fixed minimal prompt ("Reply with the
// single word OK.") per run, sent only when Orca's own client shows a chat tab
// only after a first message; two prompts are red. Stages, in order, each
// printing one line "orca-tabs-live: <stage>: PASS|FAIL -- ...":
//  a  terminal-user   New Orca Terminal with no hosted pane and no active Orca
//                     worktree (the precondition, observed first): Theia's quick
//                     pick lists state().worktrees' labels in Orca's order with
//                     the first focused (P64-37); Enter selects it, and one
//                     hosted terminal widget term<n> is added within 1000 ms of
//                     the Enter; a typed marker appears in orcad's terminal read.
//  b  terminal-cli    orca terminal create: the same within 1000 ms of the CLI's exit.
//  c  terminal-agent  orca agent launch --agent claude --surface terminal: the
//                     real claude's TUI starts in it; no prompt is sent.
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
//  g  other-views     openPane simulator and check-details each give one hosted
//                     widget; openPane conflict-review on the UU file opens one
//                     Theia merge editor (a main-area tab whose merge-editor: URI
//                     has that file as its result side) within 5000 ms, and only
//                     after that detector moved, no hosted conflict-review
//                     widget appeared (Phase 65, P65-01: lane p65-02's
//                     orca-workspace delivers it; a named SKIP for that half
//                     only while theia/extensions/orca-workspace is absent).
//  g3 tab-groups-cross-client  (driven after g, before g2; judged after k;
//                     P65-34) a CLI terminal T; the second client, reloaded
//                     once T exists (the pinned stock client takes no host
//                     frame after it opens the worktree: 64-MIRROR-FREEZE.md's
//                     echo, which only PB's own client works around), so T is
//                     in its first adoption; its Move Tab to
//                     Split > Right on T: its group strips grow by one (detector
//                     1), after k's reload T's store record holds split-right
//                     (detector 2), and only then: during the 5000 ms after
//                     detector 1, before any reload, T's record held no split
//                     mode ("live group propagation" otherwise), and T keeps its
//                     Lumino tab-bar peers across the reload (D-15, P64-12),
//                     less the panes the store dropped at it (as in k).
//  g2 tab-groups      (P65-33) stage f's New Orca Chat widget's own Split Chat
//                     Right, clicked in the Theia document, no second client and
//                     no prompt: one hosted add; the new chat's store record
//                     holds a split-right neighbour that had a hosted widget
//                     (the detector); then the new chat sits in another Lumino
//                     tab bar than chat1's and than its reference widget's
//                     (placementFor's rule: the first neighbour with a widget),
//                     to the reference's right.
//  h  organising      every hosted widget's Organising key is pb-orca:<name>.
//  i  no-tab-chrome   selectors derived from Orca's tab-bar and TabGroupPanel
//                     sources must match in Orca's own web client (the
//                     detector) and match nothing in the Theia document.
//  j  close           a Lumino close of a hosted terminal running sleep 600
//                     shows Orca's confirmation; cancel keeps widget and store
//                     row; orca terminal close disposes the widget within 1000 ms.
//  k  reload          after a frontend reload every hosted widget is back under
//                     its pb-orca: name within 5000 ms, none duplicated, and no
//                     orca.web.runtimeEnvironment.v1 key in localStorage; once
//                     the store lists the worktree again, every name addresses
//                     the pane key it addressed before, each key is in the
//                     store, and the hosted widgets' Lumino tab bars hold the
//                     same names (P65-35, the 64-TAB-GROUPS side finding).
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
/** The one fixed prompt a run may send (D-30 budget). */
export const MINIMAL_PROMPT = 'Reply with the single word OK.';
const RELOAD_MS = 5000;
const ENV_STORAGE_KEY = 'orca.web.runtimeEnvironment.v1';
const P64_01_SUMMARY_REL = '.planning/workstreams/orca/phases/64-orca-panes-as-powerbrowser-tabs/64-01-SUMMARY.md';
const TAB_BAR_DIR_REL = 'orca/src/renderer/src/components/tab-bar';
const TAB_GROUP_PANEL_REL = 'orca/src/renderer/src/components/tab-group/TabGroupPanel.tsx';
/** C7: the name word of each hosted kind. */
export const WORDS = { 'agent-session': 'chat', terminal: 'term', simulator: 'sim', 'check-details': 'checks' };
/** P65-34: the neighbour modes that come from a split (tab-after is the same group). */
const SPLIT_MODES = new Set(['split-right', 'split-left', 'split-bottom', 'split-top']);
/** Orca's paneColumnDirectionLabel fallbacks (TabWorkspaceLayoutMenuSection.tsx), the Move Tab to Split items. */
const PANE_COLUMN_LABEL = { right: 'Right', left: 'Left', down: 'Down', up: 'Up' };
/** A hosted widget's Orca key (keyOfOptions): the pane key for a terminal leaf, the tab id otherwise. */
const keyOf = (options) => options?.paneKey ?? options?.tabId ?? null;
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

/**
 * Stage a's pick (P64-37). obs: { pre: { activeWorktree, hosted }, picker: { rows: [label], focused } | null,
 * expected: [label] (state().worktrees' labels in order) }.
 */
export function pickVerdict(obs) {
    if (obs.pre?.activeWorktree !== null || obs.pre?.hosted !== 0) return [`terminal-user: precondition not met (active Orca worktree ${JSON.stringify(obs.pre?.activeWorktree)}, ${obs.pre?.hosted} hosted pane(s)), so the stage would not exercise the pick`];
    if (!obs.picker) return ['terminal-user: the worktree quick pick did not appear'];
    const fails = [];
    if (!obs.expected?.length) fails.push('terminal-user: state().worktrees listed no worktree');
    if (JSON.stringify(obs.picker.rows) !== JSON.stringify(obs.expected)) fails.push(`terminal-user: picker rows ${JSON.stringify(obs.picker.rows)} differ from Orca's order ${JSON.stringify(obs.expected)}`);
    if (obs.picker.focused !== obs.picker.rows[0]) fails.push(`terminal-user: wrong preselection: the focused row is ${JSON.stringify(obs.picker.focused)}, not the first`);
    return fails;
}

/** The real-agent precondition for stages f and g2. pre: { claude: { found, version }, sdk: { set, packageJson } | null }. */
export function agentVerdict(stage, pre) {
    if (!pre) return [`${stage}: the session ran no real agent (stub claude)`];
    const fails = [];
    if (!pre.claude?.found) fails.push(`${stage}: no claude on the base PATH`);
    else if (!/Claude Code/.test(pre.claude.version ?? '')) fails.push(`${stage}: claude --version does not name Claude Code (${JSON.stringify(pre.claude.version)})`);
    if (!pre.sdk?.set) fails.push(`${stage}: ORCA_CLAUDE_AGENT_SDK_DIR is absent or empty in orcad's environment (the pre-installed SDK extension)`);
    else if (!pre.sdk.packageJson) fails.push(`${stage}: the SDK directory orcad was given lacks the SDK's package.json`);
    return fails;
}

/** At most one model prompt per run. */
export function promptBudgetVerdict(promptsSent) {
    return promptsSent > 1 ? [`chat: more than one prompt sent in one run (${promptsSent}; the budget is 1)`] : [];
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
        if (w.xterms !== 1) fails.push(`split: ${w.id} shows ${w.xterms} visible xterm elements (total ${w.xtermsTotal ?? '?'}), want 1`);
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
    if (obs.xterms !== 1) fails.push(`pb-split: ${obs.xterms} visible xterm elements after the move, want 1`);
    if (!obs.echo) fails.push('pb-split: the moved terminal no longer echoes');
    return fails;
}

/** obs: { storeTab: boolean, creation } for New Orca Chat; the creation verdict otherwise. */
export function chatVerdict(obs) {
    if (!obs.storeTab) return [`chat: chat launch produced no tab (provider: ${obs.provider ?? 'claude'})`];
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

/**
 * Phase 65: the working-file path of a merge-editor: URI's result side. query is the URI's query, the JSON array
 * MergeEditorUri.encode writes ([base, side1, side2, result]); null when it is not one or the result is no file: URI.
 */
export function mergeEditorResultPath(query) {
    try {
        const result = JSON.parse(String(query))[3];
        return typeof result === 'string' && result.startsWith('file:') ? fileURLToPath(result) : null;
    } catch {
        return null;
    }
}

/**
 * Stage g's conflict-review (P65-01, C64-7). obs: { half: 'run' | 'skip', file, mergeEditors: [result path], hostedConflict }.
 * The merge editor is the detector; the hosted-widget absence is judged only once it is seen.
 */
export function conflictReviewVerdict(obs) {
    if (obs.half === 'skip') return [];
    const matching = (obs.mergeEditors ?? []).filter((p) => p === obs.file);
    if (!matching.length) return ['conflict-review: merge editor not opened (no merge-editor: tab with the conflicted file as its result side within 5000 ms)'];
    if (matching.length > 1) return [`conflict-review: ${matching.length} merge editors opened for one file, want 1`];
    return obs.hostedConflict ? [`conflict-review: hosted widget appeared (${obs.hostedConflict} hosted conflict-review widget(s))`] : [];
}

/**
 * Stage g2 (P65-33). obs: { button, added, detected, second: { tabBar, rect } | null, ref: { tabBar, rect } | null,
 * chat1: { tabBar, rect } | null }. Judged in order: the button, the add, the store detector, the reference, then the
 * Lumino placement (groupVerdict), then chat1's tab bar.
 */
export function splitChatVerdict(obs) {
    if (!obs.button) return ['tab-groups: no Split Chat Right button in the hosted chat'];
    if (!obs.added) return ['tab-groups: Split Chat Right added no hosted widget within 5000 ms'];
    if (obs.detected && !obs.ref) return ['tab-groups: the new chat\'s record names no neighbour with a hosted widget (no reference widget)'];
    const fails = groupVerdict({ detected: obs.detected, direction: 'right', second: obs.second, first: obs.ref ? [obs.ref] : [] });
    if (fails.length) return fails;
    if (obs.chat1 && obs.second.tabBar === obs.chat1.tabBar) return ['tab-groups: the new chat sits in chat1\'s tab bar'];
    return [];
}

/**
 * Sub-stage g3 (P65-34), the derived non-propagation guard. obs: { error, menu, stripsBefore, stripsAfter,
 * changedBeforeReload, detectedAfterReload, peersBefore: [name], peersAfter: [name], keptNames?: [name] }. Both
 * detectors are judged before the absence they make meaningful. As in reloadVerdict, the before-peers drop the panes
 * the store no longer holds after the reload; the after-peers are not filtered.
 */
export function crossClientVerdict(obs) {
    if (obs.error) return [`tab-groups-cross-client: ${obs.error}${obs.menu?.length ? ` (menu ${JSON.stringify(obs.menu)})` : ''}`];
    if (obs.stripsAfter !== obs.stripsBefore + 1) return [`tab-groups-cross-client: Move Tab to Split did not split the second client's group (strips ${obs.stripsBefore} -> ${obs.stripsAfter})`];
    if (!obs.detectedAfterReload) return ['tab-groups-cross-client: the split never reached PowerBrowser\'s store after the reload, so the pre-reload absence proves nothing'];
    if (obs.changedBeforeReload) return ['tab-groups-cross-client: live group propagation (PowerBrowser\'s store took another client\'s group split before a reload; revisit P64-12 re-placement)'];
    const kept = obs.keptNames ? new Set(obs.keptNames) : null;
    const before = (obs.peersBefore ?? []).filter((n) => !kept || kept.has(n)).sort().join(',');
    const after = [...(obs.peersAfter ?? [])].sort().join(',');
    if (before !== after) return [`tab-groups-cross-client: an already-shown pane was re-placed after the reload (D-15, P64-12; T's tab-bar peers ${before} -> ${after})`];
    return [];
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

/**
 * obs: { before: [names], after: [names], ms, storedEnvKey, identityBefore: { name: key }, identityAfter: { name: key },
 * storeKeysAfter: [key], barsBefore: [[name]], barsAfter: [[name]] } (the last five: P65-35).
 */
export function reloadVerdict(obs) {
    const fails = [];
    const missing = obs.before.filter((n) => !obs.after.includes(n));
    if (missing.length) fails.push(`reload: ${missing.join(', ')} not back after the reload`);
    const dup = obs.after.filter((n, i) => obs.after.indexOf(n) !== i);
    if (dup.length) fails.push(`reload: a reload duplicate (${[...new Set(dup)].join(', ')})`);
    if (obs.ms === null || obs.ms > RELOAD_MS) fails.push(`reload: the hosted tabs took ${obs.ms === null ? 'forever' : `${obs.ms} ms`} (limit ${RELOAD_MS} ms)`);
    if (obs.storedEnvKey) fails.push(`reload: a stored environment key ${ENV_STORAGE_KEY} in the Theia document's localStorage`);
    // P65-35: identity, not just the set of names.
    const after = obs.identityAfter ?? {};
    const storeKeys = new Set(obs.storeKeysAfter ?? []);
    for (const [name, key] of Object.entries(obs.identityBefore ?? {})) {
        if (!(name in after)) continue; // reported above as not back
        if (after[name] !== key) fails.push(`reload: pb-orca:${name} now addresses another pane`);
        if (!storeKeys.has(after[name])) fails.push(`reload: pb-orca:${name} addresses no pane in the store`);
    }
    // The before-bars drop the panes Orca's store no longer holds after the reload: a pane Orca itself dropped is gone in
    // Orca too (noted by the caller). The after-bars are not filtered, so a pane PB lost or moved, and a dropped pane
    // re-created under a new name (P65-35 renumbering), still change these bars.
    const kept = obs.keptNames ? new Set(obs.keptNames) : null;
    const bars = (list, keep) => JSON.stringify((list ?? []).map((bar) => [...bar].filter((n) => !keep || keep.has(n)).sort().join(',')).filter(Boolean).sort());
    if (bars(obs.barsBefore, kept) !== bars(obs.barsAfter)) fails.push(`reload: the Lumino tab bars changed across the reload (${bars(obs.barsBefore, kept)} -> ${bars(obs.barsAfter)})`);
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

async function runLive(lib, pre = {}) {
    const stages = {};
    const fail = (stage, reasons) => { stages[stage] = reasons; };
    const halfSkips = {};
    stages.halfSkips = halfSkips;
    const ownerItem = ownerItemOf(read(join(REPO_ROOT, P64_01_SUMMARY_REL)));
    let promptsSent = 0;
    await lib.withOrcaTabsSession({ log: () => {}, agent: 'real' }, async (ctx) => {
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

        // a. New Orca Terminal with no hosted pane and no active worktree: the P64-37 pick.
        await ctx.pollFor(async () => (await ctx.bundle('m.state().worktrees.length')) > 0, 30000, 'the store to list the scratch worktree').catch(() => false);
        let before = await lib.hostedIds(ctx);
        let known = handles();
        const pre = { activeWorktree: await ctx.bundle('m.activeWorktree()'), hosted: before.length };
        const expected = ((await ctx.bundle('m.state().worktrees')) ?? []).map((w) => w.label);
        // Not awaited: the command waits on the pick.
        await ctx.probe(`get('CommandService').executeCommand('powerbrowser.orca.newTerminal').catch(() => undefined); return true;`);
        const picker = await ctx.pollFor(() => ctx.probe(`const w = document.querySelector('.quick-input-widget');
            if (!w || w.style.display === 'none' || !w.getClientRects().length) return null;
            const rows = [...w.querySelectorAll('.quick-input-list .monaco-list-row')];
            if (!rows.length) return null;
            const label = r => (r.querySelector('.label-name') || r).textContent.trim();
            const focused = rows.find(r => r.classList.contains('focused'));
            return { rows: rows.map(label), focused: focused ? label(focused) : null };`), 5000, 'the worktree quick pick').catch(() => null);
        let tEnter = Date.now();
        if (picker) {
            await ctx.focusTheiaFrame();
            tEnter = Date.now();
            await ctx.pressKey({ key: 'Enter', code: 'Enter', keyCode: 13 });
        }
        const addA = picker ? await lib.waitForHostedAdd(ctx, tEnter, before, 5000) : null;
        const wA = addA ? await widgetOf(addA.id) : null;
        const hA = [...handles()].find((h) => !known.has(h)) ?? null;
        const a = { label: 'terminal-user', kind: 'terminal', t0: tEnter, added: addA ? (await ctx.addedSince(tEnter)).filter((e) => e.id.startsWith(lib.ORCA_PANE_WIDGET_PREFIX) && !before.includes(e.id)) : [], widget: wA, echo: wA && hA ? await echoes(wA.id, hA) : false };
        const pickFails = pickVerdict({ pre, picker, expected });
        fail('terminal-user', pickFails.length ? pickFails : creationVerdict(a));
        await freezeProbe('New Orca Terminal');

        // b. CLI terminal.
        const b = await viaCli(['terminal', 'create', '--worktree', ctx.worktree]);
        fail('terminal-cli', creationVerdict({ label: 'terminal-cli', kind: 'terminal', ...b, echo: b.widget && b.handle ? await echoes(b.widget.id, b.handle) : false }));

        // c. Agent-opened terminal: the real claude's TUI starts in it; nothing is typed, so no prompt is sent.
        const c = await viaCli(['agent', 'launch', '--agent', 'claude', '--surface', 'terminal', '--worktree', ctx.worktree]);
        fail('terminal-agent', creationVerdict({ label: 'terminal-agent', kind: 'terminal', ...c }));

        // e. Orca in-tab split of (b).
        if (ownerItem) fail('split', splitVerdict({ ownerItem }));
        else if (b.widget && b.handle) {
            const s = await viaCli(['terminal', 'split', '--terminal', b.handle, '--direction', 'horizontal']);
            const panes = (await ctx.probe(PANES)) ?? [];
            const rec = panes.find((p) => p.kind === 'terminal' && p.tabId === b.widget.options?.tabId && p.key !== b.widget.options?.paneKey);
            const mode = rec?.neighbours?.find((n) => n.key === b.widget.options?.paneKey)?.mode ?? 'unrecorded';
            // Each leaf widget's xterm renders after its mount; read the widgets once each shows one (or after 10 s).
            for (const id of [b.widget.id, s.widget?.id].filter(Boolean)) await ctx.pollFor(async () => ((await widgetOf(id))?.xterms ?? 0) >= 1, 10000, 'a leaf xterm').catch(() => false);
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
                const visible = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && el.offsetParent !== null; };
                return { moved: barAfter !== barBefore, remounts: mounts + (w.node.querySelector('.xterm') === xterm ? 0 : 1), xterms: [...w.node.querySelectorAll('.xterm')].filter(visible).length };`);
            const storeAfter = ((await ctx.probe(PANES)) ?? []).length;
            fail('pb-split', pbSplitVerdict({ ...moved, newStoreTabs: Math.max(0, storeAfter - storeBefore), echo: await echoes(wA.id, hA) }));
        } else fail('pb-split', ['pb-split: no hosted terminal from (a) to move']);

        // f. chat: New Orca Chat, then a second paired client, on the real claude.
        const agentFails = agentVerdict('chat', ctx.agentPrecondition);
        before = await lib.hostedIds(ctx);
        const chatCmd = await ctx.command('powerbrowser.orca.newChat');
        const storeTab = !!(await ctx.pollFor(async () => ((await ctx.probe(PANES)) ?? []).some((p) => p.kind === 'agent-session'), 5000, 'a chat store tab').catch(() => false));
        const addF = await lib.waitForHostedAdd(ctx, chatCmd.t0, before, 5000);
        const chatAdded = addF ? (await ctx.addedSince(chatCmd.t0)).filter((e) => e.id.startsWith(lib.ORCA_PANE_WIDGET_PREFIX) && !before.includes(e.id)) : [];
        const chatFails = [...agentFails, ...chatVerdict({ storeTab, provider: 'claude', creation: { label: 'chat', kind: 'agent-session', t0: chatCmd.t0, added: chatAdded, widget: addF ? await widgetOf(addF.id) : null } })];
        const chat1Id = addF?.id ?? null;
        await freezeProbe('New Orca Chat');
        const second = await openSecondClient(ctx);
        // Sends the one fixed prompt into the second client's chat composer, once per run.
        const promptOnce = async () => {
            if (promptsSent >= 1) return false;
            promptsSent += 1;
            return second.prompt(MINIMAL_PROMPT);
        };
        if (second.error) chatFails.push(`chat: second client: ${second.error}`);
        else {
            before = await lib.hostedIds(ctx);
            const t0 = Date.now();
            const made = await second.newChat(null);
            if (!made?.t) chatFails.push(`chat: second client: Orca offers no chat row; its New tab menu reads ${JSON.stringify(made?.menu ?? [])}`);
            let add = made?.t ? await lib.waitForHostedAdd(ctx, t0, before, 5000) : null;
            if (made?.t && !add && await promptOnce()) add = await lib.waitForHostedAdd(ctx, t0, before, 60000);
            const added = add ? (await ctx.addedSince(t0)).filter((e) => e.id.startsWith(lib.ORCA_PANE_WIDGET_PREFIX) && !before.includes(e.id)) : [];
            // The clock starts when the page's control was clicked; the page reports its own Date.now.
            if (made?.t) chatFails.push(...creationVerdict({ label: 'chat (second client)', kind: 'agent-session', t0: made.t, added, widget: add ? await widgetOf(add.id) : null }));
            await freezeProbe('a second-client chat');
        }
        fail('chat', [...chatFails, ...promptBudgetVerdict(promptsSent)]);
        fail('freeze-guard', freezeVerdict(freeze));

        // g. other views through Orca's own openers; conflict-review now opens Theia's merge editor (P65-01).
        const worktreeId = b.widget?.options?.worktreeId ?? wA?.options?.worktreeId ?? null;
        const otherFails = [];
        if (!worktreeId) otherFails.push('other-views: no worktree id from a hosted widget');
        else {
            makeConflict(ctx);
            for (const kind of ['simulator', 'check-details']) {
                before = await lib.hostedIds(ctx);
                const t0 = Date.now();
                const opened = await ctx.bundle(`m.openPane(${JSON.stringify(kind)}, ${JSON.stringify(worktreeId)}).then(id => ({ id }), e => ({ error: String(e && e.message || e) }))`);
                if (opened?.error) { otherFails.push(`other-views: openPane ${kind} rejected: ${opened.error}`); continue; }
                const add = await lib.waitForHostedAdd(ctx, t0, before, 5000);
                const added = add ? (await ctx.addedSince(t0)).filter((e) => e.id.startsWith(lib.ORCA_PANE_WIDGET_PREFIX) && !before.includes(e.id)) : [];
                otherFails.push(...creationVerdict({ label: `other-views ${kind}`, kind, t0, added, widget: add ? await widgetOf(add.id) : null }));
            }
            const half = pre.mergeEditor ?? { skip: null, fail: null };
            if (half.fail) otherFails.push(`other-views: conflict-review: ${half.fail}`);
            else if (half.skip) halfSkips['other-views'] = `conflict-review merge-editor half SKIP -- ${half.skip}`;
            else {
                const file = join(ctx.repo, 'README');
                const opened = await ctx.bundle(`m.openPane('conflict-review', ${JSON.stringify(worktreeId)}, 'README').then(id => ({ id }), e => ({ error: String(e && e.message || e) }))`);
                if (opened?.error) otherFails.push(`other-views: openPane conflict-review rejected: ${opened.error}`);
                else {
                    // Detector first: the merge editor whose result side is the UU file, then the hosted-widget absence.
                    // TabUriRegistry addresses no editor: a merge editor widget is read directly, as the query
                    // MergeEditorUri.encode writes from its four sides.
                    const editors = async () => ((await ctx.probe(`return get('ApplicationShell').getWidgets('main').filter(w => w.side1Pane && w.resultUri).map(w => JSON.stringify([w.baseUri, w.side1Uri, w.side2Uri, w.resultUri].map(u => u.toString())));`)) ?? []).map(mergeEditorResultPath);
                    const mergeEditors = await ctx.pollFor(async () => { const e = await editors(); return e.includes(file) ? e : null; }, 5000, 'the merge editor').catch(() => []);
                    const hostedConflict = (await ctx.hostedWidgets()).filter((w) => w.kind === 'conflict-review').length;
                    otherFails.push(...conflictReviewVerdict({ half: 'run', file, mergeEditors, hostedConflict }));
                }
            }
        }
        fail('other-views', otherFails);

        // g3. Cross-client group split on a CLI terminal T while PowerBrowser holds one group (P65-34); judged after k.
        const cross = { error: null, menu: [], stripsBefore: null, stripsAfter: null, changedBeforeReload: false, detectedAfterReload: false, peersBefore: [], peersAfter: [] };
        const T = await viaCli(['terminal', 'create', '--worktree', ctx.worktree]);
        const tKey = keyOf(T.widget?.options);
        const tRecord = async () => ((await ctx.probe(PANES)) ?? []).find((p) => p.key === tKey) ?? null;
        if (second.error || !T.widget) cross.error = second.error ? `second client: ${second.error}` : 'the CLI terminal T has no hosted widget';
        else {
            await ctx.focusTheiaFrame();
            const fronted = await second.front();
            // The stage-f client stopped taking host frames when it opened the worktree; a fresh load adopts T.
            const reloaded = await second.reload();
            const moved = reloaded ? { error: `the second client did not reconnect after its reload (${reloaded})` } : await second.moveTabToSplit(T.widget.options?.tabId, 'right');
            if (fronted?.prev) await ctx.activate(fronted.prev);
            if (!moved || moved.error) Object.assign(cross, { error: moved?.error ?? 'the second client did not answer', menu: moved?.menu ?? [] });
            else {
                Object.assign(cross, { stripsBefore: moved.stripsBefore, stripsAfter: moved.stripsAfter });
                for (const t1 = Date.now(); Date.now() - t1 < 5000; await sleep(250)) {
                    if ((await tRecord())?.neighbours?.some((n) => SPLIT_MODES.has(n.mode))) cross.changedBeforeReload = true;
                }
            }
        }

        // g2. A tab group made in PowerBrowser's own document: stage f's chat1's own Split Chat Right (P65-33).
        const groupAgentFails = agentVerdict('tab-groups', ctx.agentPrecondition);
        let groupDiag = null;
        if (!chat1Id) fail('tab-groups', [...groupAgentFails, 'tab-groups: no hosted chat from stage (f) to split']);
        else {
            await ctx.activate(chat1Id);
            const beforeWidgets = await ctx.hostedWidgets();
            before = beforeWidgets.map((w) => w.id);
            const shownKeys = new Set(beforeWidgets.filter((w) => w.options?.worktreeId === worktreeId).map((w) => keyOf(w.options)));
            const t0 = Date.now();
            const button = await ctx.probe(`const w = get('ApplicationShell').getWidgetById(${JSON.stringify(chat1Id)});
                const b = w && [...w.node.querySelectorAll('button[aria-label]')].find(e => /^split chat right$/i.test(e.getAttribute('aria-label')) && e.getClientRects().length > 0);
                if (!b) return false; b.click(); return true;`);
            const add = button ? await lib.waitForHostedAdd(ctx, t0, before, 5000) : null;
            const panes = (await ctx.probe(PANES)) ?? [];
            const all = await ctx.hostedWidgets();
            const secondW = add ? all.find((w) => w.id === add.id) ?? null : null;
            const rec = secondW ? panes.find((p) => p.key === keyOf(secondW.options)) ?? null : null;
            const detected = !!rec?.neighbours?.some((n) => n.mode === 'split-right' && shownKeys.has(n.key));
            // placementFor's rule, read from the record: the first neighbour that has a hosted widget.
            const refKey = rec?.neighbours?.find((n) => all.some((w) => w.id !== secondW?.id && keyOf(w.options) === n.key))?.key;
            const refId = all.find((w) => w.id !== secondW?.id && keyOf(w.options) === refKey)?.id ?? null;
            const shown = async (id) => { if (!id) return null; await ctx.activate(id); const w = await widgetOf(id); return w ? { tabBar: w.tabBar, rect: w.rect } : null; };
            const ref = await shown(refId);
            const chat1 = await shown(chat1Id);
            const second2 = await shown(secondW?.id);
            groupDiag = { button, added: add?.id ?? null, record: rec ? { key: rec.key, neighbours: rec.neighbours } : null, reference: refId };
            fail('tab-groups', [...groupAgentFails, ...splitChatVerdict({ button, added: !!add, detected, second: second2, ref, chat1 }), ...promptBudgetVerdict(promptsSent)]);
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
        const notes = ['busy-chat close not exercised: no prompt keeps a chat busy; end-of-milestone pass', `prompts sent: ${promptsSent} (budget 1)`];
        if (stages['tab-groups']?.length && groupDiag) notes.push(`tab-groups observation (button, added id, record, reference) ${JSON.stringify(groupDiag)}`);

        // k. Reload, with name identity (P65-35) and g3's post-reload half.
        const hostedNow = await ctx.hostedWidgets();
        const names = hostedNow.map((w) => nameOf(w.id)).sort();
        const identityOf = (list) => Object.fromEntries(list.map((w) => [nameOf(w.id), keyOf(w.options)]));
        const barsOf = (list) => Object.values(list.filter((w) => w.area === 'main' && w.tabBar >= 0).reduce((acc, w) => ({ ...acc, [w.tabBar]: [...(acc[w.tabBar] ?? []), nameOf(w.id)] }), {}));
        const peersOf = (list) => { const t = list.find((w) => keyOf(w.options) === tKey); return t && t.tabBar >= 0 ? list.filter((w) => w.area === 'main' && w.tabBar === t.tabBar).map((w) => nameOf(w.id)) : []; };
        const identityBefore = identityOf(hostedNow);
        const barsBefore = barsOf(hostedNow);
        cross.peersBefore = peersOf(hostedNow);
        await ctx.app.evaluate('setTimeout(() => location.reload(), 0), true').catch(() => undefined);
        await sleep(1000);
        await ctx.pollFor(() => ctx.probe(`return get('FrontendApplicationStateService').state === 'ready';`, 5000).catch(() => false), 120000, 'the reloaded frontend');
        const tReady = Date.now();
        const backMs = await ctx.pollFor(async () => { const now = (await lib.hostedIds(ctx)).map(nameOf); return names.every((n) => now.includes(n)) ? Date.now() - tReady : null; }, RELOAD_MS + 5000, 'the hosted tabs after reload').catch(() => null);
        const after = (await lib.hostedIds(ctx)).map(nameOf).sort();
        const storedEnvKey = await ctx.probe(`return Object.keys(localStorage).includes(${JSON.stringify(ENV_STORAGE_KEY)});`);
        // The store lists the worktree again (the observer's hold ends there), then identity, store keys and bars.
        const storeAfter = await ctx.pollFor(async () => { const p = (await ctx.probe(PANES)) ?? []; return p.some((r) => r.worktreeId === worktreeId) ? p : null; }, RELOAD_MS + 5000, 'the store after reload').catch(() => []);
        await sleep(500);
        const hostedAfter = await ctx.hostedWidgets();
        const storeKeySet = new Set(storeAfter.map((r) => r.key));
        const keptNames = Object.entries(identityBefore).filter(([, key]) => storeKeySet.has(key)).map(([name]) => name);
        const droppedByStore = Object.keys(identityBefore).filter((n) => !keptNames.includes(n));
        if (droppedByStore.length) notes.push(`reload: Orca's store no longer holds ${droppedByStore.map((n) => `pb-orca:${n}`).join(', ')} after the reload, and PowerBrowser closed ${droppedByStore.length === 1 ? 'its tab' : 'their tabs'}`);
        fail('reload', reloadVerdict({ before: names, after, ms: backMs, storedEnvKey, identityBefore, identityAfter: identityOf(hostedAfter), storeKeysAfter: storeAfter.map((r) => r.key), barsBefore, barsAfter: barsOf(hostedAfter), keptNames }));
        if (!cross.error && cross.stripsAfter === cross.stripsBefore + 1) {
            cross.detectedAfterReload = !!(await ctx.pollFor(async () => ((await tRecord())?.neighbours?.some((n) => n.mode === 'split-right') ? true : null), 5000, 'T split-right after the reload').catch(() => false));
            cross.peersAfter = peersOf(await ctx.hostedWidgets());
            cross.keptNames = keptNames;
        }
        fail('tab-groups-cross-client', crossClientVerdict(cross));

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
    // Orca's pairing field parses the offer itself, not orcad's http web-client URL (WebConnect: parseWebPairingInput).
    const input = await ctx.pairingInputFromFile();
    if (!input) return { error: 'no pairing input in the offer' };
    const error = await connect(ctx, evalIn, input);
    if (error) return { error };
    return {
        /**
         * g3: reloads the page and opens the worktree again; resolves an error string or null. The pinned stock client
         * applies no host session-tabs frame once it has opened the worktree (its own terminal attach or create draws
         * the host's double-projected echo, 64-MIRROR-FREEZE.md), so a tab made after the load reaches it only at the
         * first adoption of a new load. A stored pairing reconnects by itself; the pairing field is filled only if it shows.
         */
        reload: async () => {
            await evalIn('setTimeout(() => location.reload(), 0), true').catch(() => undefined);
            await sleep(1000);
            return connect(ctx, evalIn, input);
        },
        ...secondClientControls(ctx, base, evalIn),
    };
}

/**
 * Pairs the second client in page memory when the page shows its pairing field (a stored pairing reconnects without one),
 * then selects this session's worktree through the client's own sidebar row and waits for its tab strip's New tab control.
 * Resolves an error string, or null once the strip is there.
 */
async function connect(ctx, evalIn, input) {
    const screen = await ctx.pollFor(async () => (await evalIn(`document.getElementById('web-runtime-pairing-code') ? 'field' : document.querySelector('[role="option"][data-worktree-id]') ? 'rows' : null`).catch(() => null)), 30000, 'the pairing field or the worktree rows').catch(() => null);
    if (!screen) return 'the page showed neither the pairing field nor a worktree row';
    // Each page call stays inside one BiDi request's 20 s; the wait for the paired screen is polled from here.
    const submitted = screen === 'rows' ? 'ok' : await evalIn(`(async () => {
        const deadline = Date.now() + 15000;
        let input; while (!(input = document.getElementById('web-runtime-pairing-code')) && Date.now() < deadline) await new Promise(r => setTimeout(r, 200));
        if (!input) return 'no pairing field';
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        set.call(input, ${JSON.stringify(input)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 300));
        const btn = [...document.querySelectorAll('button')].find(b => /connect/i.test(b.textContent));
        if (!btn) return 'no connect button';
        btn.click();
        return 'ok';
    })()`).catch((e) => `evaluate failed: ${e.message}`);
    const paired = submitted !== 'ok' ? submitted
        : await ctx.pollFor(async () => (await evalIn(`!document.getElementById('web-runtime-pairing-code')`).catch(() => false)) === true ? 'ok' : null, 30000, 'the paired client').catch(() => 'still on the pairing screen');
    if (paired !== 'ok') return `pairing in page memory did not complete (${paired})`;
    // A freshly paired client shows "Select a workspace from the sidebar to begin": select this session's
    // worktree through Orca's own sidebar row, then wait for its tab strip's New tab control.
    const selected = await evalIn(`(async () => {
        const deadline = Date.now() + 15000;
        const want = ${JSON.stringify(`::${ctx.repo}`)};
        let row;
        while (Date.now() < deadline) {
            const rows = [...document.querySelectorAll('[role="option"][data-worktree-id]')];
            row = rows.find(e => e.getAttribute('data-worktree-id').endsWith(want)) ?? (rows.length === 1 ? rows[0] : null);
            if (row) break;
            await new Promise(r => setTimeout(r, 200));
        }
        if (!row) return 'no worktree row in the Orca sidebar';
        row.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); row.click();
        return 'ok';
    })()`).catch((e) => `evaluate failed: ${e.message}`);
    if (selected !== 'ok') return `selecting the worktree did not complete (${selected})`;
    const strip = await ctx.pollFor(async () => (await evalIn(`!!document.querySelector('[aria-label="New tab"], [title="New tab"]')`).catch(() => false)) === true || null, 15000, 'the worktree tab strip').catch(() => null);
    return strip ? null : 'the selected worktree shows no New tab control';
}

/** The second client's page controls. */
function secondClientControls(ctx, base, evalIn) {
    return {
        /** Brings the second client's web tab to the front (a background tab runs no animation frames, so Orca's tab
         * strip does not render new tabs) and resolves the id of the widget that was active before, to restore. */
        front: () => ctx.probe(`const shell = get('ApplicationShell'); const prev = shell.activeWidget ? shell.activeWidget.id : null;
            const w = webTabs().find(x => String(x.url || '').startsWith(${JSON.stringify(base)})); if (!w) return { error: 'no web tab' };
            await shell.activateWidget(w.id); await sleep(500); return { prev };`),
        /**
         * Clicks Orca's own New tab control (in tab group `groupIndex` when given) and its chat item; resolves { t } (the
         * page's Date.now at the click), or { t: null, menu } with the menu items' texts when Orca offers no chat row.
         */
        newChat: (groupIndex) => evalIn(`(async () => {
            const strips = [...document.querySelectorAll('[data-tab-group-strip-id]')];
            const scope = ${JSON.stringify(groupIndex)} === null ? document : (strips[${Number(groupIndex) || 0}] || document);
            const plus = scope.querySelector('[aria-label="New tab"], [title="New tab"]');
            if (!plus) return { t: null, menu: ['no New tab control'] };
            plus.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); plus.click();
            await new Promise(r => setTimeout(r, 400));
            // Orca fills the agent rows once every answer is known; until then each row is a "Loading agents" placeholder.
            for (let i = 0; i < 60 && document.querySelector('[role="menuitem"][aria-label="Loading agents"]'); i++) await new Promise(r => setTimeout(r, 200));
            // The pinned client names its chat rows in aria-label and title ("Start a chat with <agent>"); the text is the agent.
            const items = [...document.querySelectorAll('[role="menuitem"]')];
            const item = items.find(m => /chat/i.test(m.getAttribute('aria-label') || m.getAttribute('title') || m.textContent));
            // The pinned client's agent picker: a row launches the agent's default surface; its "Configure <agent>"
            // setup opens Orca's own launch panel, whose "Launch chat" button starts a chat.
            const configure = item ? null : [...document.querySelectorAll('[aria-label]')].find(e => /^configure claude$/i.test(e.getAttribute('aria-label')) && e.getClientRects().length > 0);
            if (configure) {
                configure.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); configure.click();
                configure.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
                let launch = null;
                for (let i = 0; i < 20 && !launch; i++) {
                    await new Promise(r => setTimeout(r, 150));
                    launch = [...document.querySelectorAll('button')].find(b => /^launch chat$/i.test((b.getAttribute('aria-label') || b.textContent || '').trim()) && b.getClientRects().length > 0 && !b.disabled);
                }
                if (launch) { const t = Date.now(); launch.click(); return { t, via: 'Configure Claude, Launch chat' }; }
            }
            if (!item) {
                const menu = items.map(m => [m.textContent, m.getAttribute('aria-label'), m.getAttribute('title')].filter(Boolean).join(' | ').replace(/\\s+/g, ' ').trim()).filter(t => /claude|chat|agent/i.test(t));
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                return { t: null, menu };
            }
            const t = Date.now(); item.click(); return { t };
        })()`).catch(() => null),
        /** Types `text` into the visible chat composer and submits it; resolves whether a composer took it. */
        prompt: (text) => evalIn(`(async () => {
            const box = [...document.querySelectorAll('textarea, [contenteditable="true"]')].find(e => e.getClientRects().length > 0 && !e.closest('[data-terminal-search-root]') && !e.classList.contains('xterm-helper-textarea'));
            if (!box) return false;
            box.focus();
            if (box.tagName === 'TEXTAREA') { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(box, ${JSON.stringify(text)}); box.dispatchEvent(new Event('input', { bubbles: true })); }
            else { box.textContent = ${JSON.stringify(text)}; box.dispatchEvent(new InputEvent('input', { bubbles: true })); }
            await new Promise(r => setTimeout(r, 300));
            box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
            return true;
        })()`).catch(() => false),
        /**
         * P65-34: Orca's own tab context menu on tab `tabId`, its "Move Tab to Split" sub-trigger, then the direction's
         * item (paneColumnDirectionLabel's fallback). Resolves { stripsBefore, stripsAfter } ([data-tab-group-strip-id]
         * counts around the move), or { error, menu } with the menu texts when an item is absent (the sub-trigger shows
         * only while the tab's group holds more than one server tab).
         */
        moveTabToSplit: (tabId, direction) => evalIn(`(async () => {
            const sleep = (ms) => new Promise(r => setTimeout(r, ms));
            const strips = () => document.querySelectorAll('[data-tab-group-strip-id]').length;
            const items = () => [...document.querySelectorAll('[role="menuitem"]')];
            const texts = () => items().map(m => m.textContent.replace(/\\s+/g, ' ').trim());
            const escape = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            const stripsBefore = strips();
            // T reaches the reloaded client in its first adoption (reload()); the strip renders it once that lands.
            // Time-bounded, not count-bounded: a background tab's timers are throttled to about one per second.
            let tab = null;
            for (const end = Date.now() + 8000; !tab && Date.now() < end;) { tab = document.querySelector('[data-tab-id="' + CSS.escape(${JSON.stringify(String(tabId ?? ''))}) + '"]'); if (!tab) await sleep(100); }
            if (!tab) return { error: 'the second client shows no tab for T (' + ${JSON.stringify(String(tabId ?? ''))} + ')', menu: [...document.querySelectorAll('[data-tab-id]')].map(e => e.getAttribute('data-tab-id')).slice(0, 30) };
            tab.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 }));
            await sleep(400);
            const trigger = items().find(m => m.textContent.trim().toLowerCase().startsWith('move tab to split'));
            if (!trigger) { const menu = texts(); escape(); return { error: 'no Move Tab to Split item in T\\'s tab menu', menu }; }
            trigger.focus();
            trigger.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse' }));
            trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
            const label = ${JSON.stringify(PANE_COLUMN_LABEL[direction] ?? 'Right')}.toLowerCase();
            let item = null;
            for (let i = 0; i < 20 && !item; i++) { await sleep(100); item = items().find(m => m !== trigger && m.textContent.trim().toLowerCase().startsWith(label)); }
            if (!item) { const menu = texts(); escape(); return { error: 'no ' + label + ' item in the Move Tab to Split submenu', menu }; }
            item.click();
            await sleep(800);
            return { stripsBefore, stripsAfter: strips() };
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
    try { stages = await runLive(lib, pre); } catch (err) {
        console.error(`${NAME}: FAIL -- harness: ${err.message}`);
        return 1;
    }
    const order = ['terminal-user', 'terminal-cli', 'terminal-agent', 'freeze-guard', 'split', 'pb-split', 'chat', 'other-views', 'tab-groups', 'tab-groups-cross-client', 'organising', 'no-tab-chrome', 'close', 'reload', 'route', 'offer'];
    const failed = [];
    for (const s of order) {
        const reasons = stages[s];
        if (reasons === undefined) { failed.push(s); console.log(`${NAME}: ${s}: FAIL -- not reached`); continue; }
        if (reasons.length) failed.push(s);
        const half = stages.halfSkips?.[s];
        console.log(`${NAME}: ${s}: ${reasons.length ? `FAIL -- ${reasons.join('; ')}` : `PASS${half ? ` -- ${half}` : ''}`}`);
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
const pick = (patch = {}) => ({ pre: { activeWorktree: null, hosted: 0 }, picker: { rows: ['repo', 'other'], focused: 'repo' }, expected: ['repo', 'other'], ...patch });
const agentPre = (patch = {}) => ({ claude: { found: true, version: '2.1.321 (Claude Code)' }, sdk: { set: true, packageJson: true }, ...patch });
const withWidget = (o, i, patch) => { const c = structuredClone(o); Object.assign(c.widgets[i], patch); return c; };
const conflict = (o = {}) => ({ half: 'run', file: '/scratch/repo/README', mergeEditors: ['/scratch/repo/README'], hostedConflict: 0, ...o });
const splitChat = (o = {}) => ({ button: true, added: true, detected: true, second: { tabBar: 1, rect: R(400, 0) }, ref: { tabBar: 0, rect: R(0, 0) }, chat1: { tabBar: 0, rect: R(0, 0) }, ...o });
const crossClient = (o = {}) => ({ error: null, menu: [], stripsBefore: 1, stripsAfter: 2, changedBeforeReload: false, detectedAfterReload: true, peersBefore: ['term1', 'term4'], peersAfter: ['term4', 'term1'], ...o });
const reload = (o = {}) => ({ before: ['chat1', 'term2', 'term3'], after: ['chat1', 'term2', 'term3'], ms: 900, storedEnvKey: false,
    identityBefore: { chat1: 'c1', term2: 'k2', term3: 'k3' }, identityAfter: { chat1: 'c1', term2: 'k2', term3: 'k3' }, storeKeysAfter: ['c1', 'k2', 'k3'],
    barsBefore: [['term2', 'term3'], ['chat1']], barsAfter: [['chat1'], ['term3', 'term2']], ...o });

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
        ['reload control', null, () => reloadVerdict(reload())],
        ['merge-editor result decoding', null, () => (mergeEditorResultPath(JSON.stringify(['pb-orca-git:/scratch/repo/README?:1', 'pb-orca-git:/scratch/repo/README?:2', 'pb-orca-git:/scratch/repo/README?:3', 'file:///scratch/repo/README'])) === '/scratch/repo/README' ? [] : ['the result side did not decode to the working file'])],
        ['conflict-review control', null, () => conflictReviewVerdict(conflict())],
        ['conflict-review merge-editor half skipped', null, () => conflictReviewVerdict({ half: 'skip' })],
        ['split-chat control', null, () => splitChatVerdict(splitChat())],
        ['cross-client control', null, () => crossClientVerdict(crossClient())],
        ['a hosted conflict-review widget beside the merge editor', 'conflict-review: hosted widget appeared', () => conflictReviewVerdict(conflict({ hostedConflict: 1 }))],
        ['no merge editor for the conflict review', 'conflict-review: merge editor not opened', () => conflictReviewVerdict(conflict({ mergeEditors: [] }))],
        ['no Split Chat Right button', 'tab-groups: no Split Chat Right button in the hosted chat', () => splitChatVerdict(splitChat({ button: false }))],
        ['Split Chat Right with no hosted add', 'tab-groups: Split Chat Right added no hosted widget within 5000 ms', () => splitChatVerdict(splitChat({ added: false }))],
        ['Split Chat Right with no store detection', 'tab-group split not observed', () => splitChatVerdict(splitChat({ detected: false }))],
        ['the new chat in chat1\'s tab bar', 'tab-groups: the new chat sits in chat1\'s tab bar', () => splitChatVerdict(splitChat({ ref: { tabBar: 2, rect: R(0, 0) }, chat1: { tabBar: 1, rect: R(400, 0) } }))],
        ['the new chat left of its reference', 'placed in the wrong direction', () => splitChatVerdict(splitChat({ second: { tabBar: 1, rect: R(0, 0) }, ref: { tabBar: 0, rect: R(400, 0) } }))],
        ['a strip count unchanged by Move Tab to Split', 'Move Tab to Split did not split the second client\'s group', () => crossClientVerdict(crossClient({ stripsAfter: 1 }))],
        ['no split in T\'s record after the reload', 'the pre-reload absence proves nothing', () => crossClientVerdict(crossClient({ detectedAfterReload: false }))],
        ['a split in T\'s record before the reload', 'tab-groups-cross-client: live group propagation', () => crossClientVerdict(crossClient({ changedBeforeReload: true }))],
        ['T\'s tab-bar peers changed after the reload', 'an already-shown pane was re-placed after the reload', () => crossClientVerdict(crossClient({ peersAfter: ['term4'] }))],
        ['control: a peer the store dropped leaves T\'s bar', null, () => crossClientVerdict(crossClient({ peersBefore: ['term1', 'term4', 'sim1'], keptNames: ['term1', 'term4'] }))],
        ['a kept peer moved while another was dropped', 'an already-shown pane was re-placed after the reload', () => crossClientVerdict(crossClient({ peersBefore: ['term1', 'term4', 'sim1'], peersAfter: ['term1'], keptNames: ['term1', 'term4'] }))],
        ['a dropped peer back in T\'s bar under its name', 'an already-shown pane was re-placed after the reload', () => crossClientVerdict(crossClient({ peersBefore: ['term1', 'term4', 'sim1'], peersAfter: ['term1', 'term4', 'sim1'], keptNames: ['term1', 'term4'] }))],
        ['no Move Tab to Split item', 'no Move Tab to Split item', () => crossClientVerdict(crossClient({ error: 'no Move Tab to Split item in T\'s tab menu', menu: ['Close'] }))],
        ['the side finding\'s term2/term3 swap', 'reload: pb-orca:term2 now addresses another pane', () => reloadVerdict(reload({ identityAfter: { chat1: 'c1', term2: 'k3', term3: 'k2' } }))],
        ['a key missing from the store after the reload', 'reload: pb-orca:term3 addresses no pane in the store', () => reloadVerdict(reload({ storeKeysAfter: ['c1', 'k2'] }))],
        ['a widget moved to another tab bar across the reload', 'reload: the Lumino tab bars changed across the reload', () => reloadVerdict(reload({ barsAfter: [['chat1', 'term3'], ['term2']] }))],
        ['control: a pane Orca\'s store dropped leaves its bar', null, () => reloadVerdict(reload({ after: ['chat1', 'term2', 'term3'], barsAfter: [['term2'], ['chat1']], keptNames: ['chat1', 'term2'] }))],
        ['a kept pane moved while another was dropped', 'reload: the Lumino tab bars changed across the reload', () => reloadVerdict(reload({ barsAfter: [['chat1', 'term2']], keptNames: ['chat1', 'term2'] }))],
        ['a dropped pane re-created under a new name', 'reload: the Lumino tab bars changed across the reload', () => reloadVerdict(reload({ barsAfter: [['term2', 'term4'], ['chat1']], keptNames: ['chat1', 'term2'] }))],
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
        ['a second xterm in a leaf widget', 'shows 2 visible xterm elements', () => splitVerdict(withWidget(split(), 0, { xterms: 2 }))],
        ['a leaf echoing into the other', "reached the other leaf", () => splitVerdict(withWidget(split(), 1, { otherEcho: true }))],
        ['an OWNER-ITEM line present', 'FAIL by owner item P64-32', () => splitVerdict({ ownerItem: ownerItemOf('x\nOWNER-ITEM: P64-32 split placement needs the owner\n') })],
        ['a remount after a PB-side move', 'a remount after a PB-side move', () => pbSplitVerdict({ moved: true, remounts: 1, newStoreTabs: 0, xterms: 1, echo: true })],
        ['chat launch with no store tab', 'chat launch produced no tab (provider: claude)', () => chatVerdict({ storeTab: false, provider: 'claude' })],
        ['pick control', null, () => pickVerdict(pick())],
        ['real-agent control', null, () => agentVerdict('chat', agentPre())],
        ['prompt budget 0', null, () => promptBudgetVerdict(0)],
        ['prompt budget 1', null, () => promptBudgetVerdict(1)],
        ['picker absent', 'the worktree quick pick did not appear', () => pickVerdict(pick({ picker: null }))],
        ['wrong preselection', 'wrong preselection', () => pickVerdict(pick({ picker: { rows: ['repo', 'other'], focused: 'other' } }))],
        ['picker order differs', "differ from Orca's order", () => pickVerdict(pick({ picker: { rows: ['other', 'repo'], focused: 'other' } }))],
        ['pick precondition not met', 'precondition not met', () => pickVerdict(pick({ pre: { activeWorktree: 'wt1', hosted: 0 } }))],
        ['pick precondition with a hosted pane', 'precondition not met', () => pickVerdict(pick({ pre: { activeWorktree: null, hosted: 1 } }))],
        ['an add later than 1000 ms after the Enter', 'late addWidget', () => creationVerdict(creation({ t0: 1000, added: [{ id: 'orca-pane:term1', t: 2001 }] }))],
        ['no claude on the base PATH', 'no claude on the base PATH', () => agentVerdict('chat', agentPre({ claude: { found: false, version: '' } }))],
        ['claude --version not naming Claude Code', 'does not name Claude Code', () => agentVerdict('tab-groups', agentPre({ claude: { found: true, version: '1.0.0 (stub)' } }))],
        ['the SDK variable absent', 'ORCA_CLAUDE_AGENT_SDK_DIR is absent or empty', () => agentVerdict('chat', agentPre({ sdk: { set: false, packageJson: false } }))],
        ['the SDK directory without package.json', "lacks the SDK's package.json", () => agentVerdict('chat', agentPre({ sdk: { set: true, packageJson: false } }))],
        ['a stub session', 'ran no real agent', () => agentVerdict('chat', null)],
        ['two prompts in one run', 'more than one prompt', () => promptBudgetVerdict(2)],
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
