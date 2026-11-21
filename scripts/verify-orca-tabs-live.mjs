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
//  c  terminal-agent  orca agent launch --agent claude --surface terminal: one
//                     hosted terminal widget is added and orcad's read of that
//                     terminal shows output (the agent started and did not exit
//                     at once); the check does not judge the TUI's own content;
//                     no prompt is sent.
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
//                     sources: each is counted in Orca's own web client (its
//                     detector) and in the Theia document. Any selector that
//                     matches in the Theia document is red. An absence counts
//                     as judged only for a selector its own detector matched in
//                     the client; the others are listed as unproven. A probe that
//                     returned an error object instead of counts is red.
//  j  close           a Lumino close of a hosted terminal running sleep 600
//                     shows Orca's confirmation (a dialog that was not there
//                     before the close, carrying a title read from Orca's
//                     CloseTerminalDialog source); cancel (in that dialog) keeps
//                     widget and store row; orca terminal close disposes the
//                     widget within 1000 ms.
//  k  reload          the document is proven reloaded (its time origin changed
//                     and the add recorder is gone), then every hosted widget is
//                     back under
//                     its pb-orca: name within 5000 ms, none duplicated, and no
//                     orca.web.runtimeEnvironment.v1 key in localStorage; once
//                     the store lists the worktree again, every name addresses
//                     the pane key it addressed before, each key is in the
//                     store, and the hosted widgets' Lumino tab bars hold the
//                     same names (P65-35, the 64-TAB-GROUPS side finding).
//  l  route           /orca-panes/ refuses a request without the token cookie;
//                     with it, an encoded parent path and an absolute path 404,
//                     pb-panes.js answers 200.
//  m  offer           the offer's every form (Orca's own encoders, derived from
//                     the web-pairing file's text, with its pairing input and
//                     parts) is first found by the same search in the
//                     web-pairing file (the detector), then in none of the
//                     services' logs, state, diagnostics rows, the Theia
//                     document's storage, the bridge folder's other files or
//                     orcad's log files. Each place carries its own control: the
//                     storage dumps must show a planted marker, the log buffers
//                     must be non-empty and below their cap, the state and rows
//                     must show their known fields, and the file search must
//                     find a needle in a fixture file.
// Every absence is judged only after its detector found the same thing on a
// control (CLAUDE.md verification rule 1). Every judgment is an exported pure
// verdict over an observation object.
//
// SKIP (SKIP-PROTOCOL.md): one line "orca-tabs-live: SKIP -- <reason>" and exit 77
// while a prerequisite is absent: no built PowerBrowser or Theia app, lane
// p64-02 not merged (theia/extensions/orca-panes absent), no built orca/, lane
// p64-01 not merged (orca/out/web/assets/pb-panes absent). A run that went
// through but could not run stage g's merge-editor half (theia/extensions/
// orca-workspace absent) is a partial run: it also exits 77 once every other
// stage is green. A FAIL wins over a SKIP. orca-panes present but not in the
// built app is a FAIL. The PASS of this row is the coordinator's proof on the
// merged, wired, built tree, after orca-pane-css-live (P64-15).
//
// The live lock (scripts/lib/live-lock.mjs; SKIP-PROTOCOL.md, "The live lock"): the row calls holdLiveLock before it launches anything. It goes
// on without taking the lock only when /proc/locks shows the lock held by the driver's holder (PB_LIVE_LOCK_HOLDER: pid and start ticks) or by an
// ancestor (flock <git common dir>/pb-live.lock node <row>). An inherited PB_LIVE_LOCK_HELD=1 with neither is a FAIL by name. With nothing set it
// takes the lock itself and waits, naming the holder. A run with nothing to launch (a prerequisite is absent) prints its SKIP without the lock.
//
// Tier: full. --self-test is quick and needs no browser: each verdict over a
// passing fixture and one fixture per failure, the offer search over every
// place, the fixture git over a hostile developer config, the lock probe, plus a
// child Node that imports this module and must stay silent.
//
// Usage:
//   node scripts/verify-orca-tabs-live.mjs
//   node scripts/verify-orca-tabs-live.mjs --self-test

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { request } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SKIP_EXIT, skipLine, verdictExit } from './lib/skip-verdict.mjs';

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
 * A hosted terminal keeps its tab, name and place when its layout first appears (64-WR-03: the leaf-less record is re-keyed,
 * the widget is not closed and reopened under the next name). obs: { label, id, hostedAfter: [id], addsAfter: [id] (hosted
 * adds since the start, read after the terminal was shown and typed into) }.
 */
export function keptVerdict(obs) {
    const fails = [];
    if (!(obs.hostedAfter ?? []).includes(obs.id)) fails.push(`${obs.label}: ${obs.id} was closed once its layout appeared (the tab must keep its widget and name)`);
    if ((obs.addsAfter ?? []).length > 1) fails.push(`${obs.label}: ${obs.addsAfter.length} hosted widgets were added by the time its layout appeared (${obs.addsAfter.join(', ')}), want 1: the tab was reopened`);
    return fails;
}

/** The terminal summary object with `handle` in an `orca terminal list` reply, or null. */
export function terminalEntryOf(reply, handle) {
    let found = null;
    const walk = (o) => { if (found || !o || typeof o !== 'object') return; if (o.handle === handle && typeof o.handle === 'string') { found = o; return; } for (const v of Object.values(o)) walk(v); };
    walk(reply);
    return found;
}

/** What a terminal that failed to start an agent prints: a shell or the OS saying the program is not there or died. */
const AGENT_FAILURE_TEXT = /command not found|No such file or directory|not recognized as|Permission denied|cannot execute|ENOENT|Segmentation fault|core dumped|Traceback \(most recent|panic:/i;

/**
 * Stage c: the agent's terminal. obs: { handle, text, early, late } where text is orcad's read of that terminal and early/late are the
 * terminal's entry in orcad's terminal list right after the widget was added and again a few seconds later (null when absent). A
 * running process shows no exitCause and stays connected; a read alone would pass a shell prompt, the echoed launch command, or a
 * "command not found" from an agent that exited at once.
 */
export function agentTuiVerdict(obs) {
    if (!obs.handle) return ['terminal-agent: the CLI returned no terminal handle to read'];
    const fails = [];
    for (const [when, e] of [['when its widget appeared', obs.early], ['a few seconds later', obs.late]]) {
        if (!e) fails.push(`terminal-agent: the agent terminal is not in orcad's terminal list ${when}`);
        else if (e.exitCause !== undefined || e.connected === false) fails.push(`terminal-agent: the agent's process had exited ${when} (exitCause ${JSON.stringify(e.exitCause ?? null)}, connected ${JSON.stringify(e.connected ?? null)})`);
    }
    if (!String(obs.text ?? '').trim()) fails.push('terminal-agent: orcad\'s read of the agent terminal stayed empty (the agent did not start)');
    else if (AGENT_FAILURE_TEXT.test(String(obs.text))) fails.push('terminal-agent: the agent terminal shows an error from the shell or the OS instead of the agent');
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

/** At most one model prompt per run. promptsSent counts writes to the composer (countComposerWrites), not guard passes. */
export function promptBudgetVerdict(promptsSent) {
    return promptsSent > 1 ? [`chat: more than one prompt sent in one run (${promptsSent}; the budget is 1)`] : [];
}

/** Wraps the page's composer write so every call that wrote counts, whichever code path made it. budget: { writes }. */
export function countComposerWrites(prompt, budget) {
    return async (text) => {
        const wrote = await prompt(text);
        if (wrote) budget.writes += 1;
        return wrote;
    };
}

/** obs: [{ after, ms }] with ms null when no tab came. */
export function freezeVerdict(obs) {
    return obs.filter((o) => o.ms === null || o.ms > LIMIT_MS).map((o) => `freeze guard after ${o.after}: a CLI terminal became a tab ${o.ms === null ? 'never' : `in ${o.ms} ms`} (limit ${LIMIT_MS} ms)`);
}

/**
 * obs: { ownerItem, mode, widgets: [{ id, tabBar, rect, xterms, ownEcho, otherEcho }] (widgets[0] the neighbour),
 * original: { id, hosted, rekeyed } (the tab that was split keeps its widget and name; its widget now addresses a leaf),
 * splitAdds: [id] (hosted adds by the split: only the new leaf's) }.
 */
export function splitVerdict(obs) {
    if (obs.ownerItem) return [`split: FAIL by owner item ${obs.ownerItem} (lane p64-01's SUMMARY), never a fallback`];
    const fails = [];
    if (obs.widgets?.length !== 2) return [`split: ${obs.widgets?.length ?? 0} hosted terminal widgets for the split Orca tab, want 2`];
    if (obs.original && !obs.original.hosted) fails.push(`split: ${obs.original.id} was closed by the split (the tab that was split must keep its widget and name)`);
    else if (obs.original && !obs.original.rekeyed) fails.push(`split: ${obs.original.id} addresses no leaf pane key after the split (its widget was not re-keyed to its first leaf)`);
    if (obs.splitAdds && obs.splitAdds.length !== 1) fails.push(`split: ${obs.splitAdds.length} hosted widgets were added by the split (${obs.splitAdds.join(', ')}), want only the new leaf's`);
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

const isCount = (n) => typeof n === 'number' && Number.isFinite(n);
/** The selectors a probe reply gave no count for (an error object, a null, a string): all of them when the reply is not a map. */
function uncounted(selectors, reply) {
    if (!reply || typeof reply !== 'object' || reply.error !== undefined) return [...selectors];
    return selectors.filter((s) => !isCount(reply[s]));
}

/**
 * obs: { selectors, detectorMatches: { selector: count } (Orca's own client), detectorError, theiaMatches: { selector: count } }.
 * A reply that is not a count for every selector is red (an error object read as "no match" would pass); a selector that
 * matches in Theia is red whether or not it was detected; an absence is proven for the selectors the client matched.
 */
export function chromeVerdict(obs) {
    if (!obs.selectors?.length) return ['no-tab-chrome: no selector derived from Orca\'s tab-bar sources'];
    const fails = [];
    const noTheia = uncounted(obs.selectors, obs.theiaMatches);
    if (noTheia.length) fails.push(`no-tab-chrome: the Theia document probe returned no count for ${noTheia.join(', ')} (${obs.theiaMatches?.error ?? 'not a count map'}), so their absence there proves nothing`);
    const noDetector = uncounted(obs.selectors, obs.detectorMatches);
    if (noDetector.length) fails.push(`no-tab-chrome: the detector probe in Orca's own web client returned no count for ${noDetector.length === obs.selectors.length ? 'any selector' : noDetector.join(', ')} (${obs.detectorError ?? obs.detectorMatches?.error ?? 'not a count map'}), so an absence in Theia proves nothing`);
    else if (!chromeProven(obs).length) fails.push('no-tab-chrome: the detector matched nothing in Orca\'s own web client, so an absence in Theia proves nothing');
    for (const s of obs.selectors) if (isCount(obs.theiaMatches?.[s]) && obs.theiaMatches[s] > 0) fails.push(`no-tab-chrome: tab-bar selector ${s} matched ${obs.theiaMatches[s]} element(s) in the Theia document`);
    return fails;
}

/**
 * The partial-run reason when some selector's own detector never matched in Orca's client (its absence in Theia has no control), else
 * null. An absence clause that did not get its control did not fully run: the row exits 77 (SKIP-PROTOCOL.md) if nothing failed.
 */
export function unprovenSelectorsSkip(obs) {
    const proven = chromeProven(obs);
    const unproven = (obs.selectors ?? []).filter((x) => !proven.includes(x));
    if (!unproven.length || !proven.length) return null; // none proven: chromeVerdict is already red
    return `${unproven.length} of ${obs.selectors.length} selector(s) never matched in Orca's own client (${unproven.join(', ')}), so their absence in Theia has no control (the other selectors were judged)`;
}

/** The selectors whose absence in Theia is proven: their own detector matched in Orca's client. */
export function chromeProven(obs) {
    return (obs.selectors ?? []).filter((s) => isCount(obs.detectorMatches?.[s]) && obs.detectorMatches[s] > 0);
}

/** obs: { dialog, afterCancel: { widget, storeRow }, disposedMs }. */
export function closeVerdict(obs) {
    const fails = [];
    if (!obs.dialog) fails.push('close: Orca\'s confirmation did not render on a Lumino close of a busy terminal');
    if (!obs.afterCancel?.widget || !obs.afterCancel?.storeRow) fails.push(`close: a close that disposed on cancel (widget ${!!obs.afterCancel?.widget}, store row ${!!obs.afterCancel?.storeRow})`);
    if (obs.disposedMs === null || obs.disposedMs > LIMIT_MS) fails.push(`close: the Orca-side close disposed the widget ${obs.disposedMs === null ? 'never' : `in ${obs.disposedMs} ms`} (limit ${LIMIT_MS} ms)`);
    return fails;
}

/** The frontend really reloaded: obs: { before: time origin, after: { origin, recorder, ready } | null }. */
export function reloadedVerdict(obs) {
    if (!obs.after) return [`reload: the Theia document did not reload (its time origin stayed ${obs.before} and its add recorder stayed in place), so the stages after it would compare the old document with itself`];
    const fails = [];
    if (obs.after.origin === obs.before) fails.push('reload: the document time origin did not change');
    if (obs.after.recorder) fails.push('reload: the add recorder of the old document is still in place');
    if (!obs.after.ready) fails.push('reload: the reloaded frontend never reached ready');
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

/**
 * obs: { detector, places: [{ name, control: true | string (why blind), forms: [form names] }] }. Never carries a value: only
 * the names of the forms Orca's encoders build. foundIn: [place] still names a place without forms.
 */
export function offerVerdict(obs) {
    if (!obs.detector) return ['offer: the search did not find the offer in the web-pairing file itself, so its absence elsewhere proves nothing'];
    const fails = [];
    for (const p of obs.places ?? []) {
        if (p.control !== true) fails.push(`offer: the search of ${p.name} is blind (${p.control || 'no control'}), so an absence there proves nothing`);
        if (p.forms?.length) fails.push(`offer: the offer found in ${p.name} (${p.forms.join(', ')})`);
    }
    for (const p of obs.foundIn ?? []) fails.push(`offer: the offer found in ${p}`);
    return fails;
}

/** The forms of the offer to search for: [{ form, value }], from Orca's own encoders (needlesFromOffer) plus the pairing input. */
export function offerNeedles(needles, input) {
    const out = needles.map((n) => ({ form: n.form, value: n.value }));
    if (input && !out.some((n) => n.value === input)) out.push({ form: 'pairing input', value: input });
    return out.filter((n) => typeof n.value === 'string' && n.value.length >= 8);
}

/** The forms found in a place's text (a string or a Buffer); form names only. */
export function placeMatches(text, needles) {
    const t = Buffer.isBuffer(text) ? text.toString('latin1') : String(text ?? '');
    return needles.filter((n) => t.includes(n.value)).map((n) => n.form);
}

/** Every file under `root` (at most 400, none over 8 MB, depth 6) whose relative path `accept` takes: [{ rel, bytes }]. */
export function readFilesUnder(root, accept, depth = 6) {
    const out = [];
    const walk = (dir, d) => {
        let names;
        try { names = readdirSync(dir); } catch { return; }
        for (const name of names) {
            if (out.length >= 400) return;
            const abs = join(dir, name);
            let st;
            try { st = statSync(abs); } catch { continue; }
            if (st.isDirectory()) { if (d < depth) walk(abs, d + 1); continue; }
            const rel = abs.slice(root.length + 1);
            if (!st.isFile() || st.size > 8 * 1024 * 1024 || !accept(rel)) continue;
            try { out.push({ rel, bytes: readFileSync(abs) }); } catch { /* unreadable: not a place we can search */ }
        }
    };
    walk(root, 0);
    return out;
}

/**
 * The file search's own control (no browser): a fixture folder holding a SYNTHETIC needle in a file the accept rule takes is
 * searched by the same routine; the routine must find it there and must not read a file the rule leaves out. The harness never
 * writes the real offer or any form of it: needle and write are parameters only for the self-test's recorder. Resolves red reasons.
 */
export function fileSearchControl(needle = { form: 'control', value: `pb-offer-control-${process.pid}-${Date.now()}-0123456789` }, write = writeFileSync) {
    const dir = mkdtempSync(join(tmpdir(), 'pb-offer-files-'));
    try {
        mkdirSync(join(dir, 'logs'), { recursive: true });
        write(join(dir, 'logs', 'orcad.log'), `x ${needle.value} y\n`);
        write(join(dir, 'other.bin'), needle.value);
        const files = readFilesUnder(dir, (rel) => rel.endsWith('.log'));
        const hit = files.flatMap((f) => placeMatches(f.bytes, [needle]));
        const fails = [];
        if (!hit.length) fails.push('the file search did not find a needle in a fixture log file');
        if (files.some((f) => f.rel.endsWith('other.bin'))) fails.push('the file search read a file its accept rule excludes');
        return fails;
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

/** The one orcad log file Orca's terminal daemon writes under orcad's data root (daemon-file-log), relative to it. */
export const ORCAD_KNOWN_LOG = 'logs/daemon.log';

/**
 * The control for the orcad-log-files place: a place over no file proves nothing, so the known log file must be among those read
 * (rels: relative paths read under the data root). true, or the reason the place is blind.
 */
export function orcadLogControl(rels) {
    return (rels ?? []).includes(ORCAD_KNOWN_LOG) ? true : `no ${ORCAD_KNOWN_LOG} exists under orcad's data root (${(rels ?? []).length} log file(s) read), so the search covers no log`;
}

/**
 * The control for the session-log place. OrcaService's ring (cap 200) must be non-empty and below its cap (it logs the hand-off
 * events, so lines dropped at the cap could hold what the search looks for). TheiaService's ring (cap 500) carries the sidecar's
 * stdout, which never carries the offer (it is written to the bridge folder only): it must be non-empty, and at its cap only the
 * retained tail is searched, which is a note and not a red. Resolves { control: true | reason, note: string | null }.
 */
export function sessionLogControl({ orcaLog, orcaCap, theiaLog, theiaCap }) {
    if (!Array.isArray(orcaLog) || !orcaLog.length) return { control: "OrcaService's log holds no line", note: null };
    if (orcaLog.length >= orcaCap) return { control: `OrcaService's log is at its cap of ${orcaCap} lines, so earlier lines were dropped`, note: null };
    if (!Array.isArray(theiaLog) || !theiaLog.length) return { control: "TheiaService's log holds no line", note: null };
    return { control: true, note: theiaLog.length >= theiaCap ? `TheiaService's log is at its cap of ${theiaCap} lines: its retained tail was searched` : null };
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
    const halfNotes = [];
    stages.halfSkips = halfSkips;
    const ownerItem = ownerItemOf(read(join(REPO_ROOT, P64_01_SUMMARY_REL)));
    // Writes to a chat composer, counted where the composer is written (countComposerWrites), not where a guard lets one pass.
    const budget = { writes: 0 };
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
            return { t0, tStart, before, added, widget: add ? await widgetOf(add.id) : null, handle };
        };
        // A hosted terminal keeps its tab and name when its layout first appears (64-WR-03): read after it was shown and typed into.
        const keptCheck = async (label, id, since, except) => keptVerdict({ label, id, hostedAfter: await lib.hostedIds(ctx), addsAfter: (await ctx.addedSince(since)).filter((e) => e.id.startsWith(lib.ORCA_PANE_WIDGET_PREFIX) && !except.includes(e.id)).map((e) => e.id) });
        const readAgentTerminal = async (handle) => (handle ? ctx.pollFor(async () => { try { return lib.terminalText(ctx, handle).trim() ? lib.terminalText(ctx, handle) : null; } catch { return null; } }, 30000, 'the agent terminal read').catch(() => '') : '');
        const listedTerminal = (handle) => { try { return terminalEntryOf(ctx.orca('terminal', 'list', '--worktree', ctx.worktree), handle); } catch { return null; } };
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
        fail('terminal-user', pickFails.length ? pickFails : [...creationVerdict(a), ...(wA ? await keptCheck('terminal-user', wA.id, tEnter, before) : [])]);
        await freezeProbe('New Orca Terminal');

        // b. CLI terminal.
        const b = await viaCli(['terminal', 'create', '--worktree', ctx.worktree]);
        fail('terminal-cli', [...creationVerdict({ label: 'terminal-cli', kind: 'terminal', ...b, echo: b.widget && b.handle ? await echoes(b.widget.id, b.handle) : false }), ...(b.widget ? await keptCheck('terminal-cli', b.widget.id, b.tStart, b.before) : [])]);

        // c. Agent-opened terminal: a hosted widget, and orcad's read of the terminal shows output (the agent did not exit at once);
        // nothing is typed, so no prompt is sent.
        const c = await viaCli(['agent', 'launch', '--agent', 'claude', '--surface', 'terminal', '--worktree', ctx.worktree]);
        const agentEarly = c.handle ? listedTerminal(c.handle) : null;
        const agentText = await readAgentTerminal(c.handle);
        await sleep(4000); // the process must still be running a bounded time after it started
        fail('terminal-agent', [...creationVerdict({ label: 'terminal-agent', kind: 'terminal', ...c }), ...agentTuiVerdict({ handle: c.handle, text: agentText, early: agentEarly, late: c.handle ? listedTerminal(c.handle) : null })]);

        // e. Orca in-tab split of (b).
        if (ownerItem) fail('split', splitVerdict({ ownerItem }));
        else if (b.widget && b.handle) {
            const s = await viaCli(['terminal', 'split', '--terminal', b.handle, '--direction', 'horizontal']);
            // 64-WR-03: the tab that was split keeps its widget and name; its widget takes its first leaf's pane key (re-keyed, not
            // reopened). Its options are read again now: the copy taken when it was created predates the leaf.
            const bNow = await ctx.pollFor(async () => { const w = await widgetOf(b.widget.id); return w?.options?.paneKey ? w : null; }, 15000, 'the split tab re-keyed to its first leaf').catch(() => null);
            const panes = (await ctx.probe(PANES)) ?? [];
            const bOptions = bNow?.options ?? b.widget.options;
            const rec = panes.find((p) => p.kind === 'terminal' && p.tabId === bOptions?.tabId && p.key !== bOptions?.paneKey);
            const mode = rec?.neighbours?.find((n) => n.key === bOptions?.paneKey)?.mode ?? 'unrecorded';
            const original = { id: b.widget.id, hosted: !!(await widgetOf(b.widget.id)), rekeyed: !!bNow && panes.some((p) => p.key === bNow.options.paneKey) };
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
            fail('split', splitVerdict({ ownerItem: null, mode, widgets, original, splitAdds: s.added.map((e) => e.id) }));
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
        const second = await openSecondClient(ctx, budget);
        // Sends the one fixed prompt into the second client's chat composer, once per run. The guard only decides whether to try;
        // the budget verdict reads the composer writes second.prompt counted.
        let promptTried = false;
        const promptOnce = async () => {
            if (promptTried) return false;
            promptTried = true;
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
        fail('chat', [...chatFails, ...promptBudgetVerdict(budget.writes)]);
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
            else if (half.skip) halfSkips['other-views'] = `the conflict-review merge-editor half did not run (${half.skip})`;
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
            fail('tab-groups', [...groupAgentFails, ...splitChatVerdict({ button, added: !!add, detected, second: second2, ref, chat1 }), ...promptBudgetVerdict(budget.writes)]);
        }

        // h. Organising rows.
        fail('organising', organisingVerdict(await ctx.hostedWidgets()));

        // i. No Orca tab chrome: detector in the second client, then the Theia document.
        const selectors = deriveTabChromeSelectors(tabChromeSources());
        const detectorMatches = second.error ? { error: `second client: ${second.error}` } : await second.count(selectors);
        const theiaMatches = await ctx.probe(`const out = {}; for (const s of ${JSON.stringify(selectors)}) out[s] = document.querySelectorAll(s).length; return out;`);
        const chromeObs = { selectors, detectorMatches, detectorError: second.error ?? null, theiaMatches };
        fail('no-tab-chrome', chromeVerdict(chromeObs));
        const unprovenSkip = unprovenSelectorsSkip(chromeObs);
        if (unprovenSkip) halfSkips['no-tab-chrome'] = unprovenSkip;

        // j. Close semantics on a busy hosted terminal.
        const busy = await viaCli(['terminal', 'create', '--worktree', ctx.worktree, '--command', 'sleep 600']);
        if (!busy.widget || !busy.handle) fail('close', ['close: no hosted terminal for the busy close']);
        else {
            // Any dialog already open is marked first, so only one the close raised counts, and only a close-terminal one (its title read from Orca's source).
            await ctx.probe(lib.DIALOG_BASELINE);
            await ctx.luminoClose(busy.widget.id);
            const found = await ctx.pollFor(() => ctx.probe(lib.DIALOG_NEW), 5000, 'Orca\'s confirmation').catch(() => null);
            const dialog = lib.confirmationAppeared(found, lib.closeDialogTitles());
            await ctx.probe(lib.DIALOG_CANCEL_NEW);
            const afterCancel = { widget: (await lib.hostedIds(ctx)).includes(busy.widget.id), storeRow: handles().has(busy.handle) };
            ctx.orca('terminal', 'close', '--terminal', busy.handle);
            const t0 = Date.now();
            const gone = await ctx.pollFor(async () => !(await lib.hostedIds(ctx)).includes(busy.widget.id), 5000, 'the widget disposed').then(() => Date.now() - t0, () => null);
            fail('close', [...closeVerdict({ dialog, afterCancel, disposedMs: gone })]);
        }
        const notes = ['busy-chat close not exercised: no prompt keeps a chat busy; end-of-milestone pass', `prompts sent: ${budget.writes} (budget 1)`, ...halfNotes];
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
        // The document must be proven new: its time origin changes and the add recorder installed on the old one is gone.
        // A fixed sleep and a 'ready' poll alone would read the old document if its unload were slow.
        const originBefore = await ctx.probe('return performance.timeOrigin;');
        await ctx.app.evaluate('setTimeout(() => location.reload(), 0), true').catch(() => undefined);
        await sleep(1000);
        const reloadedDoc = await ctx.pollFor(async () => {
            const r = await ctx.probe(`return { origin: performance.timeOrigin, recorder: !!window.__pbAddWidgetLog, ready: get('FrontendApplicationStateService').state === 'ready' };`, 5000).catch(() => null);
            return r && isCount(r.origin) && r.origin !== originBefore && r.ready ? r : null;
        }, 120000, 'the reloaded frontend').catch(() => null);
        const reloadedFails = reloadedVerdict({ before: originBefore, after: reloadedDoc });
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
        fail('reload', [...reloadedFails, ...reloadVerdict({ before: names, after, ms: backMs, storedEnvKey, identityBefore, identityAfter: identityOf(hostedAfter), storeKeysAfter: storeAfter.map((r) => r.key), barsBefore, barsAfter: barsOf(hostedAfter), keptNames })]);
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

        // m. Offer containment; the value stays in this frame. Every form Orca's encoders build is searched in every place, and each
        // place carries a control that its search can see something (never an absence judged from a dump that failed).
        const offer = await ctx.offerFromFile();
        const input = await ctx.pairingInputFromFile();
        const state = await ctx.orcaState();
        const bridgeDir = state.bridgeDir ?? null;
        const { needlesFromOffer } = await import('./lib/orca-offer-scan.mjs');
        let needles = [];
        let needleError = null;
        try { needles = offerNeedles(needlesFromOffer(offer).map((n) => ({ form: n.form, value: n.bytes.toString('utf8') })), input); } catch (e) { needleError = String(e.message ?? e); }
        for (const n of needles) ctx.addSecret(n.value);
        const places = [];
        const addPlace = (name, text, control) => places.push({ name, control, forms: needles.length ? placeMatches(text, needles) : [] });
        const bridgeFileBytes = bridgeDir ? (() => { try { return readFileSync(join(bridgeDir, lib.WEB_PAIRING_FILE)); } catch { return null; } })() : null;
        const planted = `pb-offer-control-${Date.now()}`;
        const chromeDump = await ctx.app.evaluateIn(ctx.app.chrome, `(() => { try {
            const O = ChromeUtils.importESModule('chrome://powerbrowser/content/OrcaService.sys.mjs').OrcaService;
            const T = ChromeUtils.importESModule('chrome://powerbrowser/content/TheiaService.sys.mjs').TheiaService;
            return JSON.stringify({ orcaLog: O.getRecentLog(), theiaLog: T.getRecentLog(), state: O.getState(), rows: O.getDiagnosticRows(),
                orcaCap: Services.prefs.getIntPref('powerbrowser.orca.logBufferLines', 200), theiaCap: Services.prefs.getIntPref('powerbrowser.sidecar.logBufferLines', 500) });
        } catch (e) { return JSON.stringify({ chromeError: String(e) }); } })()`);
        const dump = (() => { try { return JSON.parse(chromeDump); } catch { return { chromeError: 'the chrome dump was not JSON' }; } })();
        const blind = dump.chromeError ? `the chrome dump failed: ${dump.chromeError}` : null;
        // Storage: a marker is planted through the same probe, so the dump must show it; then removed.
        const storage = await ctx.probe(`const key = 'pb-offer-control'; const value = ${JSON.stringify(planted)};
            localStorage.setItem(key, value); sessionStorage.setItem(key, value);
            const out = { local: JSON.stringify({ ...localStorage }), session: JSON.stringify({ ...sessionStorage }) };
            localStorage.removeItem(key); sessionStorage.removeItem(key); return out;`);
        const storageOk = (k) => (storage && !storage.error && typeof storage[k] === 'string' ? (storage[k].includes(planted) ? true : 'the dump did not show a planted marker') : `the storage probe returned ${storage?.error ?? 'no object'}`);
        const logs = blind ? null : sessionLogControl(dump);
        if (logs?.note) notes.push(`offer: ${logs.note}`);
        addPlace("PowerBrowser's session log", blind ? '' : JSON.stringify([dump.orcaLog, dump.theiaLog]), blind ?? logs.control);
        addPlace('OrcaService.getState()', blind ? '' : JSON.stringify(dump.state), blind ?? (dump.state?.state === 'ready' ? true : 'the state does not read ready'));
        addPlace('the diagnostics rows', blind ? '' : JSON.stringify(dump.rows), blind ?? (Array.isArray(dump.rows) && dump.rows.some((r) => r?.[0] === 'Orca port') ? true : 'no Orca port row'));
        addPlace("the Theia document's localStorage", storage?.local ?? '', storageOk('local'));
        addPlace("the Theia document's sessionStorage", storage?.session ?? '', storageOk('session'));
        // Files: the bridge folder's other files and orcad's log files; the search routine's own control is a fixture folder.
        // Not scanned here: the whole profile. orca-offer-scan and orca-pairing-containment scan it with the holder exclusions (the token
        // store legitimately holds the device token, session-only state), which a plain byte scan here would report as a leak.
        const fileControl = fileSearchControl(); // a synthetic needle: the real offer is never written by the harness
        const bridgeFiles = bridgeDir ? readFilesUnder(bridgeDir, (rel) => rel !== lib.WEB_PAIRING_FILE) : [];
        const logFiles = state.effectiveRoot ? readFilesUnder(state.effectiveRoot, (rel) => /(^|\/)[^/]*\.log$/.test(rel)) : [];
        addPlace("the bridge folder's other files", Buffer.concat(bridgeFiles.map((f) => f.bytes)), fileControl.length ? fileControl.join('; ') : (bridgeDir ? true : 'no bridge folder'));
        addPlace("orcad's log files", Buffer.concat(logFiles.map((f) => f.bytes)), fileControl.length ? fileControl.join('; ') : orcadLogControl(logFiles.map((f) => f.rel)));
        notes.push(`offer: ${needles.length} form(s) searched in ${places.length} places; ${bridgeFiles.length} other bridge-folder file(s) and ${logFiles.length} orcad log file(s) read`);
        fail('offer', needleError ? [`offer: no needle form could be derived (${needleError})`] : offerVerdict({
            // The detector: the same search finds the offer's forms in the web-pairing file itself.
            detector: !!offer && !!bridgeFileBytes && placeMatches(bridgeFileBytes, needles).length > 0,
            places,
        }));
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
async function openSecondClient(ctx, budget) {
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
            // The page must be proven new (its time origin changes), as the Theia document's reload is: a slow unload would
            // otherwise leave this reading the old page, and T would reach it only through a live frame.
            const originBefore = await evalIn('performance.timeOrigin').catch(() => null);
            await evalIn('setTimeout(() => location.reload(), 0), true').catch(() => undefined);
            await sleep(1000);
            const reloaded = await ctx.pollFor(async () => { const o = await evalIn('performance.timeOrigin').catch(() => null); return isCount(o) && o !== originBefore ? true : null; }, 30000, 'the second client to reload').catch(() => null);
            if (!reloaded) return `the second client page did not reload (its time origin stayed ${originBefore})`;
            return connect(ctx, evalIn, input);
        },
        ...secondClientControls(ctx, base, evalIn, budget),
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
function secondClientControls(ctx, base, evalIn, budget) {
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
        prompt: countComposerWrites((text) => evalIn(`(async () => {
            const box = [...document.querySelectorAll('textarea, [contenteditable="true"]')].find(e => e.getClientRects().length > 0 && !e.closest('[data-terminal-search-root]') && !e.classList.contains('xterm-helper-textarea'));
            if (!box) return false;
            box.focus();
            if (box.tagName === 'TEXTAREA') { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(box, ${JSON.stringify(text)}); box.dispatchEvent(new Event('input', { bubbles: true })); }
            else { box.textContent = ${JSON.stringify(text)}; box.dispatchEvent(new InputEvent('input', { bubbles: true })); }
            await new Promise(r => setTimeout(r, 300));
            box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
            return true;
        })()`).catch(() => false), budget),
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
        /** Each selector's match count in the client's document: { selector: count }, or { error } when the page could not answer. */
        count: async (selectors) => {
            try {
                return JSON.parse(await evalIn(`(() => { try { const out = {}; for (const s of ${JSON.stringify(selectors)}) out[s] = document.querySelectorAll(s).length; return JSON.stringify(out); } catch (e) { return JSON.stringify({ error: String(e) }); } })()`));
            } catch (e) {
                return { error: `evaluate failed: ${String(e?.message ?? e).slice(0, 120)}` };
            }
        },
    };
}

async function main() {
    const lib = await import('./lib/orca-tabs-live.mjs');
    const pre = lib.prerequisites({ needOrca: true });
    if (pre.fail) { console.error(`${NAME}: FAIL -- ${pre.fail}`); return 1; }
    if (pre.skip) { console.log(skipLine(NAME, `${pre.skip}. Next step: build what that names, then run scripts/verify-platform.sh --only orca-tabs-live`)); return SKIP_EXIT; }
    // What is printed after the session ended goes through the session's own redaction (harness-live-tabs-12).
    const out = (line) => console.log(lib.redactAfterSession(line));
    const err = (line) => console.error(lib.redactAfterSession(line));
    let stages;
    try { stages = await runLive(lib, pre); } catch (e) {
        err(`${NAME}: FAIL -- harness: ${e.message}`);
        return 1;
    }
    const order = ['terminal-user', 'terminal-cli', 'terminal-agent', 'freeze-guard', 'split', 'pb-split', 'chat', 'other-views', 'tab-groups', 'tab-groups-cross-client', 'organising', 'no-tab-chrome', 'close', 'reload', 'route', 'offer'];
    const failed = [];
    for (const s of order) {
        const reasons = stages[s];
        if (reasons === undefined) { failed.push(s); out(`${NAME}: ${s}: FAIL -- not reached`); continue; }
        if (reasons.length) failed.push(s);
        const half = stages.halfSkips?.[s];
        out(`${NAME}: ${s}: ${reasons.length ? `FAIL -- ${reasons.join('; ')}` : `PASS${half ? ` -- ${half}` : ''}`}`);
    }
    for (const n of stages.notes ?? []) out(`${NAME}: note -- ${n}`);
    // A stage half that did not run (an absent input) is a partial run: SKIP unless something failed (SKIP-PROTOCOL.md).
    const skips = Object.entries(stages.halfSkips ?? {}).map(([stage, reason]) => `stage ${stage}: ${reason}`);
    if (failed.length) { out(`${NAME}: FAIL -- ${failed.join(', ')}`); return 1; }
    const code = verdictExit(NAME, [], skips.map((r) => `${r}. Next step: supply that input and run scripts/verify-platform.sh --only orca-tabs-live`));
    if (code === 0) out(`${NAME}: PASS -- ${order.join(', ')}`);
    return code;
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
const chrome = (o = {}) => ({ selectors: ['[data-tab-group-strip-id]', '[data-tab-id]', '[data-tab-strip-slot]'], detectorMatches: { '[data-tab-group-strip-id]': 2, '[data-tab-id]': 5, '[data-tab-strip-slot]': 3 }, detectorError: null, theiaMatches: { '[data-tab-group-strip-id]': 0, '[data-tab-id]': 0, '[data-tab-strip-slot]': 0 }, ...o });
const NEEDLES = [{ form: 'web-client URL', value: 'http://127.0.0.1:26768/#pairing=orca%3A%2F%2Fpair%3Fcode%3DAAAAAAAAAAAA' }, { form: 'device token', value: 'tok-aaaaaaaaaaaaaaaa' }, { form: 'pairing input', value: 'orca://pair?code=AAAAAAAAAAAA' }];
const offerObs = (o = {}) => ({ detector: true, places: ['PowerBrowser\'s session log', 'OrcaService.getState()', 'the diagnostics rows'].map((name) => ({ name, control: true, forms: [] })), ...o });
const withTempFiles = (files, fn) => {
    const dir = mkdtempSync(join(tmpdir(), 'pb-tabs-selftest-'));
    try {
        for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
        return fn(dir);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
};
/** A fixture app tree whose generated frontend holds `line`; resolves the backend main.js path inside it. */
const appFixture = (dir, line) => {
    mkdirSync(join(dir, 'app', 'lib', 'backend'), { recursive: true });
    mkdirSync(join(dir, 'app', 'src-gen', 'frontend'), { recursive: true });
    writeFileSync(join(dir, 'app', 'src-gen', 'frontend', 'index.js'), `${line}\n`);
    return join(dir, 'app', 'lib', 'backend', 'main.js');
};
/** Two calls of the wrapped prompt that both wrote: the budget reads 2 whatever guard sat in front of them. */
async function countedTwice() {
    const budget = { writes: 0 };
    const wrapped = countComposerWrites(async () => true, budget);
    await wrapped('a');
    await wrapped('b');
    return promptBudgetVerdict(budget.writes);
}
async function countedNothing() {
    const budget = { writes: 0 };
    await countComposerWrites(async () => false, budget)('a');
    return budget.writes === 0 ? [] : ['a prompt that wrote nothing was counted'];
}
/** The real main on a tree with no built PowerBrowser: exit 77 and the one SKIP line (no browser is started). */
function skipRun() {
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('ORCA_') && k !== 'PB_LIVE_LOCK_HELD' && k !== 'PB_LIVE_LOCK_HOLDER'));
    const r = spawnSync(process.execPath, [SELF], { encoding: 'utf8', timeout: 30000, cwd: REPO_ROOT, env: { ...env, PB_FIREFOX_BIN: '/nonexistent/pb-self-test/powerbrowser' } });
    const fails = [];
    if (r.status !== SKIP_EXIT) fails.push(`exit ${r.status}, want ${SKIP_EXIT} (${String(r.stdout).trim().slice(0, 120)} ${String(r.stderr).trim().slice(0, 120)})`);
    if (!new RegExp(`^${NAME}: SKIP -- .+`, 'm').test(r.stdout ?? '')) fails.push('no "<name>: SKIP -- <reason>" line on stdout');
    return fails;
}
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

async function runSelfTest() {
    const lib = await import('./lib/orca-tabs-live.mjs');
    const liveLock = await import('./lib/live-lock.mjs');
    const { redact } = await import('./lib/orca-run.mjs');
    const { fixtureGit: paneGit } = await import('./lib/orca-pane-harness.mjs');
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
        ['no-tab-chrome control', null, () => chromeVerdict(chrome())],
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
        ['offer control', null, () => offerVerdict(offerObs())],
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
        ['a tab-bar selector matching in Theia', 'tab-bar selector [data-tab-id] matched 1', () => chromeVerdict(chrome({ theiaMatches: { ...chrome().theiaMatches, '[data-tab-id]': 1 } }))],
        ['a detector that matched nothing', 'detector matched nothing', () => chromeVerdict(chrome({ detectorMatches: { '[data-tab-id]': 0, '[data-tab-strip-slot]': 0, '[data-tab-group-strip-id]': 0 } }))],
        ['no selector derived', 'no selector derived from Orca', () => chromeVerdict({ selectors: [], detectorMatches: {}, theiaMatches: {} })],
        ['the Theia probe returning an error object (harness-live-tabs-02)', 'the Theia document probe returned no count for', () => chromeVerdict(chrome({ theiaMatches: { error: 'probe threw: SyntaxError' } }))],
        ['the Theia probe returning null', 'the Theia document probe returned no count for', () => chromeVerdict(chrome({ theiaMatches: null }))],
        ['the Theia probe missing one selector', 'no count for [data-tab-group-strip-id]', () => chromeVerdict(chrome({ theiaMatches: { '[data-tab-id]': 0, '[data-tab-strip-slot]': 0 } }))],
        ['a Theia count that is a string', 'no count for [data-tab-id]', () => chromeVerdict(chrome({ theiaMatches: { ...chrome().theiaMatches, '[data-tab-id]': '3' } }))],
        ['the detector probe returning an error object', 'the detector probe in Orca\'s own web client returned no count for any selector', () => chromeVerdict(chrome({ detectorMatches: { error: 'evaluate failed: x' } }))],
        ['no second client for the detector', 'second client: the page did not load', () => chromeVerdict(chrome({ detectorMatches: { error: 'second client: the page did not load' }, detectorError: 'second client: the page did not load' }))],
        ['one selector never matched in the client is listed as unproven, not judged', null, () => (JSON.stringify(chromeProven(chrome({ detectorMatches: { '[data-tab-id]': 4, '[data-tab-strip-slot]': 0, '[data-tab-group-strip-id]': 2 } }))) === JSON.stringify(['[data-tab-group-strip-id]', '[data-tab-id]']) ? [] : ['chromeProven did not list exactly the detected selectors'])],
        ['an undetected selector present in Theia is still red', 'tab-bar selector [data-tab-strip-slot] matched 2', () => chromeVerdict(chrome({ detectorMatches: { '[data-tab-id]': 4, '[data-tab-strip-slot]': 0, '[data-tab-group-strip-id]': 2 }, theiaMatches: { '[data-tab-id]': 0, '[data-tab-strip-slot]': 2, '[data-tab-group-strip-id]': 0 } }))],
        ['a close that disposed on cancel', 'a close that disposed on cancel', () => closeVerdict({ dialog: true, afterCancel: { widget: false, storeRow: true }, disposedMs: 300 })],
        ['a close with no confirmation', 'confirmation did not render', () => closeVerdict({ dialog: false, afterCancel: { widget: true, storeRow: true }, disposedMs: 300 })],
        ['a reload duplicate', 'a reload duplicate (term1)', () => reloadVerdict({ before: ['term1'], after: ['term1', 'term1'], ms: 900, storedEnvKey: false })],
        ['a stored environment key', 'a stored environment key', () => reloadVerdict({ before: ['term1'], after: ['term1'], ms: 900, storedEnvKey: true })],
        ['an absolute path served (a security boundary)', 'an absolute path answered 200, want 404', () => routeVerdict({ noCookie: 403, traversal: 404, absolute: 200, entry: 200 })],
        ['the entry not served with the cookie', 'pb-panes.js answered 404 with the cookie, want 200', () => routeVerdict({ noCookie: 403, traversal: 404, absolute: 404, entry: 404 })],
        ['a route probe that got no answer', 'an encoded parent-directory path answered null', () => routeVerdict({ noCookie: 403, traversal: null, absolute: 404, entry: 200 })],
        ['a reload that lost a hosted name', 'reload: term1 not back after the reload', () => reloadVerdict({ before: ['term1'], after: [], ms: 900, storedEnvKey: false })],
        ['a reload that took too long', 'the hosted tabs took 6000 ms (limit 5000 ms)', () => reloadVerdict({ before: ['term1'], after: ['term1'], ms: 6000, storedEnvKey: false })],
        ['a reload that never brought the tabs back', 'took forever', () => reloadVerdict({ before: ['term1'], after: ['term1'], ms: null, storedEnvKey: false })],
        ['a close whose disposal never came', 'disposed the widget never', () => closeVerdict({ dialog: true, afterCancel: { widget: true, storeRow: true }, disposedMs: null })],
        ['a close whose disposal was late', 'disposed the widget in 2500 ms (limit 1000 ms)', () => closeVerdict({ dialog: true, afterCancel: { widget: true, storeRow: true }, disposedMs: 2500 })],
        ['a close that left no store row on cancel', 'a close that disposed on cancel (widget true, store row false)', () => closeVerdict({ dialog: true, afterCancel: { widget: true, storeRow: false }, disposedMs: 300 })],
        ['a creation with no widget', 'no hosted terminal widget was added', () => creationVerdict(creation({ widget: null }))],
        ['a creation of the wrong kind', "data-pb-orca-pane is 'agent-session', want 'terminal'", () => creationVerdict(creation({ widget: { id: 'orca-pane:term1', kind: 'agent-session' } }))],
        ['a creation under the wrong name', "name 'chat1' is not term<n>", () => creationVerdict(creation({ added: [{ id: 'orca-pane:chat1', t: 1400 }], widget: { id: 'orca-pane:chat1', kind: 'terminal' } }))],
        ['a PB-side move that did not move', 'the widget did not move to a new Lumino tab bar', () => pbSplitVerdict({ moved: false, remounts: 0, newStoreTabs: 0, xterms: 1, echo: true })],
        ['a PB-side move that made a store tab', '1 new store tab(s) after a PB-side move', () => pbSplitVerdict({ moved: true, remounts: 0, newStoreTabs: 1, xterms: 1, echo: true })],
        ['a PB-side move that left two xterms', '2 visible xterm elements after the move, want 1', () => pbSplitVerdict({ moved: true, remounts: 0, newStoreTabs: 0, xterms: 2, echo: true })],
        ['a PB-side move that stopped echoing', 'the moved terminal no longer echoes', () => pbSplitVerdict({ moved: true, remounts: 0, newStoreTabs: 0, xterms: 1, echo: false })],
        ['an organising check with no widget', 'organising: no hosted widget to check', () => organisingVerdict([])],
        ['a route served without the cookie', 'served without the cookie', () => routeVerdict({ noCookie: 200, traversal: 404, absolute: 404, entry: 200 })],
        ['a traversal served', 'encoded parent-directory path answered 200', () => routeVerdict({ noCookie: 403, traversal: 200, absolute: 404, entry: 200 })],
        ['the offer found in a log', 'the offer found in PowerBrowser\'s session log', () => offerVerdict({ detector: true, foundIn: ['PowerBrowser\'s session log'] })],
        ['an offer search with a blind detector', 'did not find the offer in the web-pairing file', () => offerVerdict(offerObs({ detector: false }))],
        ['a place found with a form name (harness-live-tabs-03)', 'the offer found in the diagnostics rows (device token)', () => offerVerdict(offerObs({ places: [{ name: 'the diagnostics rows', control: true, forms: ['device token'] }] }))],
        ['a place whose control did not show (a blind dump)', 'the search of the Theia document\'s localStorage is blind (the dump did not show a planted marker)', () => offerVerdict(offerObs({ places: [{ name: 'the Theia document\'s localStorage', control: 'the dump did not show a planted marker', forms: [] }] }))],
        ['a place with no control at all', 'the search of orcad\'s log files is blind (no control)', () => offerVerdict(offerObs({ places: [{ name: 'orcad\'s log files', control: false, forms: [] }] }))],
        ['the token alone leaked into a log (a form other than the full offer)', 'the offer found in PowerBrowser\'s session log (device token)', () => offerVerdict(offerObs({ places: [{ name: 'PowerBrowser\'s session log', control: true, forms: placeMatches(`pairing=${NEEDLES[1].value} ok`, NEEDLES) }] }))],
        ['the pairing input alone leaked into the state', 'the offer found in OrcaService.getState() (pairing input)', () => offerVerdict(offerObs({ places: [{ name: 'OrcaService.getState()', control: true, forms: placeMatches(JSON.stringify({ x: NEEDLES[2].value }), NEEDLES) }] }))],
        ['the search finds nothing in a clean place', null, () => (placeMatches('[1700000000] Orca ready on port 26768', NEEDLES).length ? ['a clean text matched a needle'] : [])],
        ['needle forms shorter than 8 characters are dropped', null, () => (offerNeedles([{ form: 'x', value: 'short' }, { form: 'y', value: 'long-enough-value' }], 'tiny').map((n) => n.form).join() === 'y' ? [] : ['a short needle was kept'])],
        ['the file search sees a needle in a fixture log file and skips an excluded file', null, () => fileSearchControl()],
        ['the file search control writes only its own synthetic needle (the real offer is never written)', null, () => { const written = []; const r = fileSearchControl(undefined, (path, text) => { written.push(String(text)); writeFileSync(path, text); }); return [...r, ...written.filter((t) => NEEDLES.some((n) => t.includes(n.value))).map(() => 'the control wrote a real needle form')]; }],
        ['a control handed a real needle is caught by the recorder (the control for the case above)', 'the control wrote a real needle form', () => { const written = []; const r = fileSearchControl(NEEDLES[1], (path, text) => { written.push(String(text)); writeFileSync(path, text); }); return [...r, ...written.filter((t) => NEEDLES.some((n) => t.includes(n.value))).map(() => 'the control wrote a real needle form')]; }],
        ['orcad log control: the known daemon log was read', null, () => (orcadLogControl(['logs/daemon.log', 'logs/other.log']) === true ? [] : ['a known log was not accepted'])],
        ['no orcad log file exists (harness-live-tabs-03)', 'the search covers no log', () => { const c = orcadLogControl([]); return c === true ? [] : [c]; }],
        ['only an unrelated log file exists', 'the search covers no log', () => { const c = orcadLogControl(['cache/x.log']); return c === true ? [] : [c]; }],
        ['session log control with both rings below their caps', null, () => (sessionLogControl({ orcaLog: ['a'], orcaCap: 200, theiaLog: ['b'], theiaCap: 500 }).control === true ? [] : ['a healthy pair of rings was refused'])],
        ['an OrcaService ring at its cap is blind', 'is at its cap of 200 lines', () => { const c = sessionLogControl({ orcaLog: new Array(200).fill('x'), orcaCap: 200, theiaLog: ['b'], theiaCap: 500 }).control; return c === true ? [] : [c]; }],
        ['an empty OrcaService ring is blind', "OrcaService's log holds no line", () => { const c = sessionLogControl({ orcaLog: [], orcaCap: 200, theiaLog: ['b'], theiaCap: 500 }).control; return c === true ? [] : [c]; }],
        ['a TheiaService ring at its cap is a note, not a blind place', null, () => { const r = sessionLogControl({ orcaLog: ['a'], orcaCap: 200, theiaLog: new Array(500).fill('x'), theiaCap: 500 }); return r.control === true && /retained tail/.test(r.note ?? '') ? [] : ['a full sidecar ring was refused or unnoted']; }],
        ['an empty TheiaService ring is blind', "TheiaService's log holds no line", () => { const c = sessionLogControl({ orcaLog: ['a'], orcaCap: 200, theiaLog: [], theiaCap: 500 }).control; return c === true ? [] : [c]; }],
        ['unproven selectors: a partial run when some were never detected (harness-live-tabs-08)', 'their absence in Theia has no control', () => { const r = unprovenSelectorsSkip(chrome({ detectorMatches: { '[data-tab-id]': 4, '[data-tab-strip-slot]': 0, '[data-tab-group-strip-id]': 2 } })); return r ? [r] : []; }],
        ['unproven selectors: none when every selector was detected', null, () => (unprovenSelectorsSkip(chrome()) === null ? [] : ['a fully detected set was reported partial'])],
        ['unproven selectors make the row exit 77 and a failure still wins', null, () => { const r = unprovenSelectorsSkip(chrome({ detectorMatches: { '[data-tab-id]': 4, '[data-tab-strip-slot]': 0, '[data-tab-group-strip-id]': 2 } })); return lib.verdictExitQuiet(NAME, [], [r]) === SKIP_EXIT && lib.verdictExitQuiet(NAME, ['x'], [r]) === 1 ? [] : ['the exit status for an unproven selector is wrong']; }],
        ['the terminal list entry is found by handle', null, () => (terminalEntryOf({ result: { terminals: [{ handle: 'a' }, { handle: 'b', connected: true }] } }, 'b')?.connected === true ? [] : ['terminalEntryOf missed the handle'])],
        ['agent liveness control', null, () => agentTuiVerdict({ handle: 'h', text: 'Welcome to Claude Code', early: { handle: 'h', connected: true }, late: { handle: 'h', connected: true } })],
        ['an agent that exited at once with output on screen (harness-live-tabs-07)', "the agent's process had exited when its widget appeared", () => agentTuiVerdict({ handle: 'h', text: '$ claude\nbye', early: { handle: 'h', exitCause: 'exited' }, late: { handle: 'h', exitCause: 'exited' } })],
        ['an agent that died after its widget appeared', "the agent's process had exited a few seconds later", () => agentTuiVerdict({ handle: 'h', text: 'Welcome', early: { handle: 'h', connected: true }, late: { handle: 'h', connected: false } })],
        ['an agent terminal missing from the list', "not in orcad's terminal list a few seconds later", () => agentTuiVerdict({ handle: 'h', text: 'Welcome', early: { handle: 'h' }, late: null })],
        ['a shell that stayed alive but could not find the agent', 'shows an error from the shell or the OS instead of the agent', () => agentTuiVerdict({ handle: 'h', text: 'bash: claude: command not found\n$ ', early: { handle: 'h', connected: true }, late: { handle: 'h', connected: true } })],
        ['close dialog titles are required when the checkout is present (harness-live-tabs-10)', 'no close-terminal dialog title read', () => withTempFiles({}, (dir) => { mkdirSync(join(dir, 'orca/src/renderer/src/components/terminal-pane'), { recursive: true }); writeFileSync(join(dir, 'orca/src/renderer/src/components/terminal-pane/CloseTerminalDialog.tsx'), 'export default function X() { return null }\n'); try { lib.closeDialogTitles(dir); return []; } catch (e) { return [String(e.message)]; } })],
        ['close dialog titles are required when the dialog file is gone', 'the file is absent', () => withTempFiles({}, (dir) => { mkdirSync(join(dir, 'orca/src'), { recursive: true }); try { lib.closeDialogTitles(dir); return []; } catch (e) { return [String(e.message)]; } })],
        ['no orca checkout gives no titles, not an error', null, () => withTempFiles({}, (dir) => (lib.closeDialogTitles(dir).length === 0 ? [] : ['titles read from nothing']))],
        ['an unreadable generated frontend is not "not wired" (harness-live-tabs-11)', 'could not be read', () => withTempFiles({}, (dir) => { const c = lib.listenerCoverage({ wired: lib.appWiresOrcaPanes(join(dir, 'app', 'lib', 'backend', 'main.js')), bundleBuilt: true, booted: false }); return c.verdict === 'red' ? [c.reason] : []; })],
        ['a stray bridge-folder file holding the token is found', 'device token', () => withTempFiles({ 'stray.txt': `x ${NEEDLES[1].value}` }, (dir) => readFilesUnder(dir, () => true).flatMap((f) => placeMatches(f.bytes, NEEDLES)))],
        ['reloaded control', null, () => reloadedVerdict({ before: 1700000000000.5, after: { origin: 1700000009999.5, recorder: false, ready: true } })],
        ['a document that never reloaded (harness-live-tabs-04)', 'the Theia document did not reload', () => reloadedVerdict({ before: 1700000000000.5, after: null })],
        ['a reload that left the same time origin', 'the document time origin did not change', () => reloadedVerdict({ before: 5, after: { origin: 5, recorder: false, ready: true } })],
        ['a reload that left the old recorder', 'the add recorder of the old document is still in place', () => reloadedVerdict({ before: 5, after: { origin: 6, recorder: true, ready: true } })],
        ['a reloaded frontend that never reached ready', 'never reached ready', () => reloadedVerdict({ before: 5, after: { origin: 6, recorder: false, ready: false } })],
        ['kept control', null, () => keptVerdict({ label: 'terminal-user', id: 'orca-pane:term1', hostedAfter: ['orca-pane:term1'], addsAfter: ['orca-pane:term1'] })],
        ['a terminal closed when its layout appeared (64-WR-03)', 'orca-pane:term1 was closed once its layout appeared', () => keptVerdict({ label: 'terminal-user', id: 'orca-pane:term1', hostedAfter: ['orca-pane:term2'], addsAfter: ['orca-pane:term1', 'orca-pane:term2'] })],
        ['a terminal reopened under the next name', '2 hosted widgets were added by the time its layout appeared', () => keptVerdict({ label: 'terminal-cli', id: 'orca-pane:term2', hostedAfter: ['orca-pane:term2', 'orca-pane:term3'], addsAfter: ['orca-pane:term2', 'orca-pane:term3'] })],
        ['split original closed by the split', 'orca-pane:term2 was closed by the split', () => splitVerdict(split({ original: { id: 'orca-pane:term2', hosted: false, rekeyed: false }, splitAdds: ['orca-pane:term3'] }))],
        ['split original not re-keyed to a leaf', 'addresses no leaf pane key after the split', () => splitVerdict(split({ original: { id: 'orca-pane:term2', hosted: true, rekeyed: false }, splitAdds: ['orca-pane:term3'] }))],
        ['a split that added two widgets (the tab reopened)', '2 hosted widgets were added by the split', () => splitVerdict(split({ original: { id: 'orca-pane:term2', hosted: true, rekeyed: true }, splitAdds: ['orca-pane:term3', 'orca-pane:term4'] }))],
        ['split control with the kept original', null, () => splitVerdict(split({ original: { id: 'orca-pane:term2', hosted: true, rekeyed: true }, splitAdds: ['orca-pane:term3'] }))],
        ['a split with one widget', '1 hosted terminal widgets for the split Orca tab, want 2', () => splitVerdict(split({ widgets: [split().widgets[0]] }))],
        ['agent terminal control', null, () => agentTuiVerdict({ handle: 'term_h1', text: 'Welcome to Claude Code', early: { handle: 'term_h1', connected: true }, late: { handle: 'term_h1', connected: true } })],
        ['an agent terminal that read empty (harness-live-tabs-07)', 'stayed empty', () => agentTuiVerdict({ handle: 'term_h1', text: '  \n ', early: { handle: 'term_h1', connected: true }, late: { handle: 'term_h1', connected: true } })],
        ['an agent terminal with no handle', 'returned no terminal handle', () => agentTuiVerdict({ handle: null, text: 'x' })],
        ['prompt budget counts composer writes, not guard passes (harness-live-tabs-08)', 'more than one prompt sent in one run (2; the budget is 1)', () => countedTwice()],
        ['a prompt that wrote nothing is not counted', null, () => countedNothing()],
        ['confirmation control', null, () => (lib.confirmationAppeared({ count: 1, text: 'Stop running command? Closing this terminal will stop the command running inside it. Cancel Stop and Close' }, ['Stop this agent?', 'Stop running command?']) ? [] : ['a close-terminal dialog was not accepted'])],
        ['no new dialog (an old one only)', 'confirmation not seen', () => (lib.confirmationAppeared(null, ['Stop running command?']) ? [] : ['confirmation not seen'])],
        ['another dialog that is not the close confirmation', 'confirmation not seen', () => (lib.confirmationAppeared({ count: 1, text: 'Rename file? OK Cancel' }, ['Stop running command?']) ? [] : ['confirmation not seen'])],
        ['the close dialog titles read from Orca\'s source', null, () => (!existsSync(join(REPO_ROOT, 'orca/src')) || lib.closeDialogTitles().includes('Stop running command?') ? [] : ['the close dialog titles were not read from the pinned source'])],
        ['output after the session is redacted (harness-live-tabs-12)', null, () => { lib.retainForOutput(redact, ['SECRET-pairing-value-1']); const out = lib.redactAfterSession('evaluate failed: SECRET-pairing-value-1 in the page'); return out.includes('SECRET-pairing') ? ['the secret survived redactAfterSession'] : []; }],
        ['output after the session without the retained list keeps the secret (the control for the case above)', null, () => (redact('evaluate failed: SECRET-pairing-value-1', []).includes('SECRET-pairing') ? [] : ['redact with an empty list removed the secret by itself'])],
        ['fixture git (the pane harness\'s) ignores a developer config with signing and hooks (harness-live-tabs-13)', null, () => lib.fixtureGitVerdict((repo, home) => paneGit(repo, home))],
        ['fixture git without the hygiene is hit by that config', 'the fixture commit failed under a developer config', () => lib.fixtureGitVerdict((repo, home) => (...a) => execFileSync('git', ['-C', repo, '-c', 'user.name=fixture', '-c', 'user.email=fixture@invalid', ...a], { env: { PATH: process.env.PATH ?? '', HOME: home }, stdio: ['ignore', 'pipe', 'pipe'] }))],
        ['every live path awaits the shared live-lock helper (harness-live-tabs-14)', null, () => liveLock.lockWiringFails(NAME, import.meta.url)],
        ['a script that no longer awaits holdLiveLock is caught', 'lock wiring', () => lib.lockWiringPlantFails(liveLock.lockWiringFails)],
        ['listener coverage: a booted bundle covers Orca\'s listeners', null, () => (lib.listenerCoverage({ wired: true, bundleBuilt: true, booted: true }).verdict === 'covered' ? [] : ['a booted bundle was not covered'])],
        ['listener coverage: an app with no orca-panes has none to cover', null, () => (lib.listenerCoverage({ wired: false, bundleBuilt: false, booted: false }).verdict === 'not-wired' ? [] : ['an unwired app was not not-wired'])],
        ['listener coverage: a built bundle that did not boot is red (harness-live-tabs-11)', 'did not boot in the Theia frame', () => { const c = lib.listenerCoverage({ wired: true, bundleBuilt: true, booted: false }); return c.verdict === 'red' ? [c.reason] : []; }],
        ['listener coverage: a wired app with no built bundle is a named skip, not a silent pass', 'Orca listeners not covered', () => { const c = lib.listenerCoverage({ wired: true, bundleBuilt: false, booted: false }); return c.verdict === 'skip' ? [c.reason] : []; }],
        ['an app wiring orca-panes is read from its generated frontend', null, () => withTempFiles({}, (dir) => { const main = appFixture(dir, "import '@powerbrowser/orca-panes/lib/browser/orca-panes-frontend-module';"); return lib.appWiresOrcaPanes(main) ? [] : ['a frontend naming orca-panes read as unwired']; })],
        ['an app that does not wire orca-panes reads as unwired', null, () => withTempFiles({}, (dir) => { const main = appFixture(dir, "import '@powerbrowser/modes/lib/browser/x';"); return lib.appWiresOrcaPanes(main) ? ['a frontend with no orca-panes read as wired'] : []; })],
        ['a skip alone exits 77', null, () => (lib.verdictExitQuiet(NAME, [], ['stage g half did not run']) === SKIP_EXIT ? [] : ['a skip did not exit 77'])],
        ['a failure wins over a skip', null, () => (lib.verdictExitQuiet(NAME, ['a stage failed'], ['stage g half did not run']) === 1 ? [] : ['a failure did not win'])],
        ['no skip and no failure exits 0', null, () => (lib.verdictExitQuiet(NAME, [], []) === 0 ? [] : ['a clean run did not exit 0'])],
        ['the real main with no built PowerBrowser exits 77 with the one SKIP line', null, () => skipRun()],
        ['an import that printed a line', 'side effect on import', () => importSilenceVerdict({ exitCode: 0, stdout: 'orca-tabs-live: SKIP\n', stderr: '', timedOut: false, startedProcess: false })],
    ];
    let failures = 0;
    let ok = 0;
    for (const [label, naming, runCase] of cases) {
        let fails;
        try { fails = await runCase(); } catch (err) { fails = [`threw ${err.message}`]; }
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
    if (args.includes('--self-test')) process.exit(await runSelfTest());
    // The live lock before anything launches (scripts/lib/live-lock.mjs). A run with nothing to launch needs none.
    const lib = await import('./lib/orca-tabs-live.mjs');
    const { holdLiveLock } = await import('./lib/live-lock.mjs');
    const mayLaunch = (() => { const pre = lib.prerequisites({ needOrca: true }); return !pre.skip && !pre.fail; })();
    const locked = mayLaunch ? await holdLiveLock({ name: NAME, scriptUrl: import.meta.url, root: REPO_ROOT }) : null;
    if (locked !== null) process.exit(locked);
    process.exit(await main());
}
