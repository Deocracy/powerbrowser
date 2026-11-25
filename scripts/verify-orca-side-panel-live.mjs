#!/usr/bin/env node
// scripts/verify-orca-side-panel-live.mjs
//
// orca-side-panel-live (Phase 65, TAB-07; criterion 2; P65-09..P65-12, P65-24,
// P65-30; CA-10, CA-11; research A5): Orca's sidebar, Settings, Agents and
// right sidebar live in PowerBrowser side panels in the Orca mode and behave as
// in Orca.
//
// One PowerBrowser session through scripts/lib/orca-tabs-live.mjs (its own
// orcad and the booted pane bundle, ORCA_* scrubbed, redaction first; a plain
// probe shell boots no bundle), with MOZ_LOG=nsHostResolver:5 written to the
// scratch directory. The bundle is reached only through C3's boot handle
// (ctx.bundle); this check imports nothing of the bundle itself. The session
// starts with no project (registerRepo false, as a fresh profile does); two
// scratch repositories are registered with the built CLI after clause j's
// no-project half. Clauses, each printing one
// line "orca-side-panel-live: <clause>: PASS|FAIL -- <counts>":
//  j  fill         (debug orca-mode-fresh-profile-look, 2026-11-18) each mounted
//                  side part's node and its Orca surface (the pane root's first
//                  element child) fill the part's body, every edge within
//                  FILL_TOLERANCE px. The expectation is the body's own box, read
//                  at check time. Judged in the no-project state right after the
//                  Orca mode is selected (the store must hold 0 worktrees, else
//                  red), again with the projects and every part expanded, and
//                  at a wider side area (PART_WIDE px) where Orca's stored
//                  sidebar widths are narrower than the part.
//  k  status bar   (debug orca-mode-fresh-profile-look round 2, owner 2026-11-18:
//                  "the botom has the thiea purpel bar witch should not be
//                  there") Theia's status bar is not shown in the Orca mode:
//                  StatusBarImpl hidden, its node without height, and the side
//                  areas reaching the shell's bottom edge (Lumino reserves a
//                  hidden-by-CSS bar's row, so the reclaimed row is measured).
//                  Judged when the Orca mode is first selected and again after
//                  Coding; Coding is the control (the bar shows there with a
//                  box), else red "instrument blind".
//  l  right toggle (same debug, defect B) Orca's right-sidebar toggle works as in
//                  Orca. Its labels are derived from Orca's source (the close
//                  button in components/right-sidebar/index.tsx, RightSidebarToggle
//                  in app-shell/TitlebarMainStrip.tsx). Orca's close button in the
//                  hosted right sidebar collapses the Theia right panel; while
//                  collapsed a visible Orca toggle sits at the top right of the
//                  main area (its right edge within TOGGLE_CORNER px of the main
//                  area's, inside its first tab row) and expands the panel with
//                  Orca's right sidebar current and its content back (Orca's close
//                  button shown again). Theia's Toggle Right Panel command does the
//                  same both ways, and its reopen must bring Orca's content back.
//                  In Coding no Orca toggle shows (the control is the Orca pass).
//  m  width        (same debug, round 3, owner 2026-11-19: "after I added a few
//                  tabs I could not drag out the right slide in orca mode") each
//                  Orca side panel, set to SIDE_START px, keeps its width (within
//                  WIDTH_TOLERANCE) after WEB_TABS web tabs added with the "+"
//                  button and after a Browsing and an Organising round trip back
//                  to the Orca mode. A pointer drag of DRAG px toward the main
//                  area, started at each of three points across Orca's own grab
//                  band for that edge (derived at check time from the handle's
//                  class in Orca's source: the sidebar's straddles the border, the
//                  right sidebar's lies inside it), widens the panel by DRAG px. A
//                  drag from the edge far toward the window side stops at Orca's
//                  own minimum (MIN_WIDTH in components/sidebar/index.tsx,
//                  RIGHT_SIDEBAR_MIN_WIDTH in right-sidebar-width.ts): the drag
//                  travels to the window edge, so the panel must end within
//                  WIDTH_TOLERANCE of that minimum, neither below it nor above
//                  it, and must have narrowed (else red "instrument blind").
//                  The web tabs must really be added: the main area's widget
//                  count must grow by WEB_TABS, else red "instrument blind"
//                  (a width kept through zero tabs proves nothing). The
//                  pointer is WebDriver BiDi input.performActions on the Theia
//                  document: hit-tested and dispatched as trusted events by Gecko
//                  in that document, not OS input (a Gecko web-page overlay over
//                  the main area is outside this path).
//  a  containers   in the Orca mode the left container is in the left area and
//                  the right container in the right area; each part's host has
//                  descendants and state().mountErrors names none of its kinds.
//  b  rows         the sidebar's repository and worktree rows (attribute names
//                  derived at check time from Orca's row components) equal
//                  orca repo list --json and orca worktree list --json as sets.
//  c  setting      the experimental orchestration switch (its aria-label derived
//                  from Orca's setting component) toggled in the hosted Settings
//                  changes experimentalOrchestrationPanel in the store Orca's
//                  web client persists it to (localStorage under the key
//                  derived from web-storage.ts; the setting is not among the
//                  runtime-backed settings web-preferences-store.ts sends to
//                  orcad, so orcad's profile state never holds the change, in
//                  stock Orca's web client either), and toggling back restores
//                  it. The switch sits in Settings' Experimental section.
//                  terminalShortcutPolicy and keybindings are never touched
//                  (C64-1's hostedTerminalKeys holds them in memory).
//  d  agents       with that setting on the Agents part is in the left
//                  container within 2 s; with it off it is gone within 2 s.
//  e  worktrees    a hosted terminal in each worktree (setActiveWorktree, then
//                  New Orca Terminal, C64-6); clicking the other worktree's row
//                  activates that worktree's tab.
//  f  pages        each page entry Orca's sidebar shows (derived from
//                  SidebarNav.tsx and SidebarTaskNavButton.tsx) opens
//                  pb-orca:<view> as the active tab; closed, a second click
//                  reopens it. Every derived entry must be shown, except those
//                  Orca's own source hides by default (a shouldShow<Name>Button
//                  that returns settings?.<x> === true, read from SidebarNav.tsx
//                  at check time; a fresh profile has none of them on): an entry
//                  that is neither shown nor so allowed is red, named. Zero
//                  entries shown is red (blind).
//  g  modes        after switching to Coding and to Browsing neither container
//                  is in the left or right area (A5).
//  n  icons        in the Orca mode each side bar shows Orca's own icon and the
//                  current view's only, fully inside the bar; a revealed Theia view
//                  shows beside Orca's; Coding shows Theia's icons (the control).
//  o  gear         the sidebar's Settings gear shows a small tooltip and opens
//                  one main-area Settings tab (D-64); Back to app closes it.
//  p  theme        Orca follows a light and a dark Theia theme (D-65) and its
//                  project name contrasts with its sidebar in both.
//  q  reload       after a frontend reload the mode buttons show the mode the
//                  shell is in.
//  h  registry     TabUriRegistry resolves both container ids to a view
//                  contribution, the condition under which tab-uri-registry.ts
//                  would log its startup error (a positive read, CLAUDE.md
//                  verification rule 1).
//  i  egress       the Theia document first fetches http://pb-egress-control.invalid/
//                  and the resolver log must name that host (else "collector
//                  blind"). Two more markers bracket the one real user action, the
//                  Orca mode selection: http://pb-egress-user-action.invalid/ just
//                  before it and http://pb-egress-settled.invalid/ once it has
//                  returned and the frame is focused; the log must name both, in
//                  that order. Only a host first resolved in the parent log between
//                  the two markers passes endpoint-verdict.mjs's user-action
//                  verdict. Every other host, loopback excluded (the boot-time
//                  hosts, everything the panels resolve while they render and
//                  everything resolved in the rest of the run, and any host seen
//                  only in a child log, which cannot be ordered) must pass the
//                  unattended verdict, else red naming the host (P65-24; 65-05;
//                  audit harness-live-panels-03). The resolver log cannot see a
//                  fetch to an IP literal (no name is resolved), so socket connects
//                  are read too (MOZ_LOG nsSocketTransport, its "trying address"
//                  lines): a connection to a non-loopback address that no name's
//                  "CompleteLookup ... has <address>" line explains is red, naming
//                  the address; a control fetch to 192.0.2.1 (TEST-NET-1) must
//                  show up as such a connection first, else "collector blind"
//                  (audit harness-live-panels-14).
// Output names clauses, counts and host names only; never a path, the ready
// line, a pairing URL, an offer or a token.
//
// Tier: full. A row started without PB_LIVE_LOCK_HELD=1 takes <git common dir>/pb-live.lock itself
// (lib/live-lock.mjs) before it launches anything; inherited ORCA_* are unset. Exit 77 with one
// "SKIP -- <reason>" line (SKIP-PROTOCOL.md) while a built PowerBrowser, a built Theia app, orca/out, the pane
// bundle or typescript is absent (orca-tabs-live.mjs prerequisites). --self-test runs the pure comparators on
// fixtures and the tab-adding collector against fake pages (hermetic: no browser).
//
// Usage:
//   node scripts/verify-orca-side-panel-live.mjs
//   node scripts/verify-orca-side-panel-live.mjs --self-test

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { violations } from './lib/endpoint-verdict.mjs';
import { holdLiveLock, lockWiringFails } from './lib/live-lock.mjs';
import { FIXTURE_GIT_ARGS, fixtureGitEnv } from './lib/orca-pane-harness.mjs';
import { SKIP_EXIT, skipLine } from './lib/skip-verdict.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'orca-side-panel-live';
const SELF_REL = 'scripts/verify-orca-side-panel-live.mjs';

export const LEFT = 'powerbrowser-orca-view-container';
export const RIGHT = 'powerbrowser-orca-right-view-container';
export const PARTS = { 'powerbrowser-orca-sidebar-view': 'sidebar', 'powerbrowser-orca-right-sidebar-view': 'right-sidebar' };
export const AGENTS = 'powerbrowser-orca-agents-view';
/**
 * j: a surface edge may differ from the part body's by sub-pixel rounding only. A broken layout measures whole pixels:
 * the 2026-11-18 reproduction had a surface 106 px wider than its part (Orca's stored 350 px against a 244 px part),
 * and the self-test plants that value, a 120 px shortfall and a 271 px height shortfall.
 */
export const FILL_TOLERANCE = 1;
/** j: the side-area width of the wide pass, above Orca's stored sidebar (280) and right-sidebar (350) defaults. */
export const PART_WIDE = 460;
/**
 * l: how far the closed-state toggle's right edge may sit from the main area's right edge (Orca: the button plus its
 * mr-2). A misplaced toggle measures hundreds of pixels away (the self-test plants one at x=600, y=300, 640 px from the
 * edge), never 48 or 49.
 */
export const TOGGLE_CORNER = 48;
/** l: the main area's first tab row, Theia's --theia-private-horizontal-tab-height; a toggle below it is out of the row (planted at 300 px). */
export const TAB_ROW = 35;
/** m: the side width each run starts from, above Orca's minimum so a squeeze has room to show. */
export const SIDE_START = 320;
/** m: web tabs added with the "+" button before the width is read again. */
export const WEB_TABS = 3;
/** m: the drag distance toward the main area. */
export const DRAG = 60;
/**
 * m: a side width may differ from its expectation by sub-pixel rounding and a handle's half pixel only. A broken layout
 * measures tens of pixels: Lumino's 100 px after a round trip (220 px off), 244 px after the web tabs (76 px off), a
 * dead handle's 0 px drag (60 px off), a half drag's 30 px, a squeeze clamped at 300 px (80 px above Orca's 220 px minimum).
 * The self-test plants each of these values.
 */
export const WIDTH_TOLERANCE = 2;
/** m: Tailwind's spacing step (0.25rem at Orca's 16 px root), to read a handle's offset and width from its classes. */
export const TW_SPACING = 4;
export const CONTROL_HOST = 'pb-egress-control.invalid';
export const ACTION_HOST = 'pb-egress-user-action.invalid';
export const SETTLED_HOST = 'pb-egress-settled.invalid';
/** i: the IP-literal control, an address in TEST-NET-1 (RFC 5737): never routable, never explained by a name. */
export const LITERAL_CONTROL = '192.0.2.1';
/**
 * i: the control's port. Gecko refuses a fetch to a port on its banned list (gBadPortList in nsIOService.cpp) before any
 * socket opens, so port 9 (discard) never produced the "trying address" line the control waits for. 8081 is allowed; the
 * self-test derives that from the upstream list.
 */
export const LITERAL_PORT = 8081;
export const BANNED_PORTS_REL = 'upstream/netwerk/base/nsIOService.cpp';

/** i: the control port against the banned list; red names it. */
export function portVerdict(port, banned) {
    return banned.includes(port) ? [`the control fetches port ${port}, which Gecko bans: the fetch is refused before a socket opens, so the control line never appears`] : [];
}

/** The ports of gBadPortList in nsIOService.cpp's source text (pure). */
export function bannedPorts(text) {
    const body = /gBadPortList\[\]\s*=\s*\{([^}]*)\}/.exec(String(text))?.[1] ?? '';
    return [...body.matchAll(/^\s*(\d+)\s*,/gm)].map(m => Number(m[1]));
}
const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

const SRC = {
    sidebar: 'orca/src/renderer/src/components/sidebar',
    itemRow: 'orca/src/renderer/src/components/sidebar/worktree-list/rows/item-row.tsx',
    header: 'orca/src/renderer/src/components/sidebar/worktree-list/rows/SectionHeader.tsx',
    nav: ['orca/src/renderer/src/components/sidebar/SidebarNav.tsx', 'orca/src/renderer/src/components/sidebar/SidebarTaskNavButton.tsx'],
    toggle: 'orca/src/renderer/src/components/settings/orchestration/OrchestrationPanelExperimentalSetting.tsx',
    views: 'orca/src/shared/ui-chrome-types.ts',
    webStorage: 'orca/src/renderer/src/web/preload-api/web-storage.ts',
    webPreferences: 'orca/src/renderer/src/web/preload-api/web-preferences-store.ts',
    rightSidebar: 'orca/src/renderer/src/components/right-sidebar/index.tsx',
    titlebarStrip: 'orca/src/renderer/src/app-shell/TitlebarMainStrip.tsx',
    sidebarIndex: 'orca/src/renderer/src/components/sidebar/index.tsx',
    rightSidebarWidth: 'orca/src/renderer/src/components/right-sidebar/right-sidebar-width.ts',
};

// ---- pure comparators (the self-test feeds these fixtures) ----

/** Set equality; red names the side and the count, never the members' paths. */
export function setVerdict(what, shown, expected) {
    const s = new Set(shown);
    const e = new Set(expected);
    const missing = [...e].filter(x => !s.has(x)).length;
    const extra = [...s].filter(x => !e.has(x)).length;
    const fails = [];
    if (missing) fails.push(`${what}: ${missing} missing sidebar row(s) (in the CLI list, not in the sidebar)`);
    if (extra) fails.push(`${what}: ${extra} extra sidebar row(s) (in the sidebar, not in the CLI list)`);
    if (!e.size) fails.push(`${what}: the CLI list is empty, so the comparison is blind`);
    return fails;
}

/** d: the Agents part follows the setting both ways. */
export function agentsVerdict({ presentWhenOn, presentWhenOff }) {
    const fails = [];
    if (!presentWhenOn) fails.push('agents part absent with the orchestration setting on');
    if (presentWhenOff) fails.push('agents part stayed with the orchestration setting off');
    return fails;
}

/**
 * f: the views Orca's own sidebar source hides by default: each `export function shouldShow<Name>Button(settings)` of
 * SidebarNav.tsx whose body returns `settings?.<x> === true` (shown only when a setting is on; a fresh profile has it off)
 * and whose name matches a derived page view (Artifacts -> artifacts). Pure over the source text.
 */
export function hiddenByDefaultViews(navText, views) {
    const out = [];
    const re = /export function shouldShow(\w+)Button\([^)]*\)[^{]*\{\s*return [^;\n]*?===\s*true/g;
    for (const m of String(navText).matchAll(re)) {
        const name = m[1].toLowerCase();
        const view = views.find(v => v === name || v === `${name}s` || `${v}s` === name);
        if (view) out.push(view);
    }
    return out;
}

/**
 * f: derived: [{ view, label }] page entries; shown: views whose button was found in the hosted sidebar; allowed: views
 * Orca hides by default. Every derived entry must be shown or allowed; zero shown is blind.
 */
export function pagesVerdict({ derived, shown, allowed = [] }) {
    const fails = [];
    if (!shown.length) fails.push(`blind: none of the ${derived.length} derived page entries is shown in the hosted sidebar`);
    for (const { view, label } of derived) {
        if (!shown.includes(view) && !allowed.includes(view)) fails.push(`${view}: the page entry "${label}" that Orca's sidebar source derives is not shown in the hosted sidebar (shown ${shown.length} of ${derived.length}${allowed.length ? `, ${allowed.length} hidden by default by Orca's own setting` : ''})`);
    }
    return fails;
}

/**
 * j: one part's boxes ({ x, y, w, h } each, or null): the part body is the expectation; the widget node and the Orca
 * surface must each match it on every edge. Red names the part, the box and the edge.
 */
export function fillVerdict(part, { body, node, surface }) {
    if (!body || !(body.w > 0) || !(body.h > 0)) return [`${part}: the part body has no box, so the comparison is blind`];
    const fails = [];
    const edges = b => ({ left: b.x, top: b.y, right: b.x + b.w, bottom: b.y + b.h });
    const want = edges(body);
    for (const [what, box] of [['node', node], ['surface', surface]]) {
        if (!box) { fails.push(`${part}: no ${what} box`); continue; }
        const got = edges(box);
        for (const edge of ['left', 'top', 'right', 'bottom']) {
            const d = Math.round(got[edge] - want[edge]);
            if (Math.abs(d) > FILL_TOLERANCE) fails.push(`${part}: ${what} ${edge} edge ${d > 0 ? '+' : ''}${d}px from the part body's (${what} ${box.w}x${box.h}, body ${body.w}x${body.h})`);
        }
    }
    return fails;
}

/**
 * k: Theia's status bar in each judged pass. passes: [{ when, mode, hiddenFlag, barHeight, splitBottom, shellBottom }].
 * The Orca passes must show no bar and reclaim its row; the Coding pass is the control and must show it.
 */
export function statusBarVerdict(passes) {
    const fails = [];
    const orca = passes.filter(p => p.mode === 'orca');
    const coding = passes.filter(p => p.mode === 'coding');
    if (!orca.length) fails.push('no Orca pass was measured, so the comparison is blind');
    if (!coding.length) fails.push('no Coding pass was measured, so the instrument has no control');
    for (const p of coding) {
        if (p.hiddenFlag || !(p.barHeight > 0)) fails.push(`instrument blind: Theia's status bar is not shown in Coding (${p.when}: hidden ${p.hiddenFlag}, ${p.barHeight}px), so its absence in the Orca mode proves nothing`);
    }
    for (const p of orca) {
        if (!p.hiddenFlag || p.barHeight > 0) fails.push(`${p.when}: Theia's status bar shows in the Orca mode (${p.barHeight}px high, hidden flag ${p.hiddenFlag})`);
        const gap = Math.round(p.shellBottom - p.splitBottom);
        if (Math.abs(gap) > FILL_TOLERANCE) fails.push(`${p.when}: the side areas end ${gap}px above the shell's bottom edge in the Orca mode (the status bar's row stays reserved)`);
    }
    return fails;
}

/**
 * l: one Orca right-sidebar toggle run. obs: { closeBefore, afterClose, afterToggle, afterTheiaCollapse, afterTheiaExpand,
 * coding }, where each closed pass is { collapsed, toggles: [{ x, y, w, h }], main: { x, y, w, h } }, each open pass
 * { expanded, current, closeShown }, and coding is { toggles }. Red names the step.
 */
export function rightToggleVerdict(obs, right = RIGHT) {
    const fails = [];
    if (!obs?.closeBefore) return ['blind: Orca\'s own close button is not in the hosted right sidebar, so the toggle cannot be judged'];
    const closed = (what, pass) => {
        if (!pass) { fails.push(`${what}: not reached`); return; }
        if (!pass.collapsed) { fails.push(`${what}: the Theia right panel stayed expanded`); return; }
        const shown = (pass.toggles ?? []).filter(t => t.w > 0 && t.h > 0);
        if (!shown.length) { fails.push(`${what}: with the right panel collapsed no Orca toggle is shown to bring it back`); return; }
        const m = pass.main;
        const placed = shown.find(t => Math.abs((m.x + m.w) - (t.x + t.w)) <= TOGGLE_CORNER && t.y >= m.y - 1 && t.y + t.h <= m.y + TAB_ROW + 1);
        if (!placed) {
            const t = shown[0];
            fails.push(`${what}: the Orca toggle is not at the top right of the main area (toggle right edge ${Math.round(m.x + m.w - (t.x + t.w))}px from the main area's, top ${Math.round(t.y - m.y)}px below its top)`);
        }
    };
    const opened = (what, pass) => {
        if (!pass) { fails.push(`${what}: not reached`); return; }
        if (!pass.expanded) { fails.push(`${what}: the Theia right panel stayed collapsed`); return; }
        if (pass.current !== right) fails.push(`${what}: the right panel opened on ${pass.current ?? 'no view'}, not Orca's right sidebar`);
        if (!pass.closeShown) fails.push(`${what}: the right panel opened without Orca's sidebar content (Orca's close button absent: its open flag stayed off)`);
    };
    closed('Orca\'s close button', obs.afterClose);
    opened('the Orca toggle', obs.afterToggle);
    closed('Theia\'s Toggle Right Panel (collapse)', obs.afterTheiaCollapse);
    opened('Theia\'s Toggle Right Panel (expand)', obs.afterTheiaExpand);
    const leaked = (obs.coding?.toggles ?? []).filter(t => t.w > 0 && t.h > 0).length;
    if (!obs.coding) fails.push('Coding: not reached');
    else if (leaked) fails.push(`Coding: ${leaked} Orca right-sidebar toggle(s) shown outside the Orca mode`);
    return fails;
}

/**
 * m: a resize handle's grab band from its Tailwind classes, as x offsets from the panel's inner edge (the border with
 * the main area). The sidebar's handle is anchored by right-* (a negative value straddles the border), the right
 * sidebar's by left-*. Null when the classes give no anchor or no width.
 */
export function bandFromClasses(classes) {
    const tokens = String(classes ?? '').split(/\s+/);
    const step = (re) => { for (const t of tokens) { const m = re.exec(t); if (m) return (m[1] ? -1 : 1) * Number(m[2]) * TW_SPACING; } return null; };
    const w = step(/^()w-([\d.]+)$/);
    const right = step(/^(-)?right-([\d.]+)$/);
    const left = step(/^(-)?left-([\d.]+)$/);
    if (!(w > 0)) return null;
    if (right !== null) return [-right - w, -right];
    if (left !== null) return [left, left + w];
    return null;
}

/** m: three start points strictly inside a band: one pixel in from each end, and its middle. */
export function bandSamples([from, to]) {
    return [from + 1, (from + to) / 2, to - 1];
}

/**
 * m: one width run. obs: { keep: [{ when, before: { left, right }, after: { left, right }, tabs?: { added, expected } }],
 * drags: [{ side, offset, before, after }], squeeze: [{ side, before, after }] }; expect: { min: { left, right }, drag }.
 * A keep pass with `tabs` is the web-tab pass: fewer tabs added than expected is red "instrument blind" (the width
 * before and after zero tabs is the same number). Red names the side, the step and the measured width.
 */
export function widthVerdict(obs, expect) {
    const fails = [];
    const tol = WIDTH_TOLERANCE;
    if (!obs?.keep?.length) fails.push('no width was read around the web tabs or a mode round trip, so the comparison is blind');
    for (const pass of obs?.keep ?? []) {
        if (pass.tabs && !(pass.tabs.added >= pass.tabs.expected)) fails.push(`instrument blind: only ${pass.tabs.added ?? 0} of ${pass.tabs.expected} web tabs were added ${pass.when}, so the widths read around them prove nothing`);
        for (const side of ['left', 'right']) {
            const b = pass.before?.[side];
            const a = pass.after?.[side];
            if (typeof b !== 'number' || typeof a !== 'number') { fails.push(`${side} panel: not shown ${pass.when}, so its width is unread`); continue; }
            if (Math.abs(a - b) > tol) fails.push(`${side} panel ${Math.round(a)}px ${pass.when}, ${Math.round(b)}px before`);
        }
    }
    for (const side of ['left', 'right']) {
        const drags = (obs?.drags ?? []).filter(d => d.side === side);
        if (!drags.length) fails.push(`${side}: no drag was measured, so the comparison is blind`);
        for (const d of drags) {
            const moved = Math.round(d.after - d.before);
            if (Math.abs(moved - expect.drag) > tol) fails.push(`${side}: a drag started ${d.offset > 0 ? '+' : ''}${d.offset}px from the panel's edge (inside Orca's grab band) changed its width by ${moved}px, not ${expect.drag}px`);
        }
        const sq = (obs?.squeeze ?? []).find(s => s.side === side);
        const min = expect.min?.[side];
        if (!(min > 0)) fails.push(`${side}: Orca's minimum width was not derived, so the comparison is blind`);
        else if (!sq) fails.push(`${side}: no squeeze was measured, so the comparison is blind`);
        else if (!(sq.after < sq.before - tol)) fails.push(`instrument blind: the squeeze drag did not narrow the ${side} panel (${Math.round(sq.before)}px -> ${Math.round(sq.after)}px)`);
        else if (sq.after < min - tol) fails.push(`${side} panel squeezed to ${Math.round(sq.after)}px, below Orca's minimum ${min}px`);
        // The squeeze drag travels to the window edge, so the panel must reach the minimum; a clamp above it (a wrong
        // Lumino or Theia limit) stopped the drag early.
        else if (sq.after > min + tol) fails.push(`${side} panel squeezed only to ${Math.round(sq.after)}px, above Orca's minimum ${min}px, although the drag went to the window edge`);
    }
    return fails;
}

/** g: areas holding an Orca container, per mode ({ coding: ['left'], ... }). */
export function leakVerdict(areasByMode) {
    const fails = [];
    for (const [mode, byContainer] of Object.entries(areasByMode)) {
        for (const [container, area] of Object.entries(byContainer)) {
            if (area === 'left' || area === 'right') fails.push(`container ${container} leaked into ${mode} (${area} area)`);
        }
    }
    return fails;
}

/**
 * i: the control first, then each non-loopback host under its verdict. `duringAction` (when given) lists the hosts first
 * resolved between the user-action marker and the settled marker, that is, while the one user action (the Orca mode
 * selection) ran; those take the user-action verdict. Every other host, whenever it resolved, takes the unattended
 * one. Both markers must be in the resolver log, in that order (duringAction null), else the collector is blind.
 */
export function egressVerdict({ resolved, allowlist, duringAction }) {
    if (!resolved.includes(CONTROL_HOST)) return [`collector blind: the control host ${CONTROL_HOST} is not in the resolver log`];
    if (duringAction === null) return [`collector blind: ${ACTION_HOST} and ${SETTLED_HOST} are not both in the parent resolver log in that order`];
    if (duringAction !== undefined) {
        for (const marker of [ACTION_HOST, SETTLED_HOST]) if (!resolved.includes(marker)) return [`collector blind: the marker ${marker} is not in the resolver log`];
    }
    // LITERAL_CONTROL is this check's own connection; Gecko's resolver log names IP literals too, and literalVerdict judges it.
    const observed = resolved.filter(h => ![CONTROL_HOST, ACTION_HOST, SETTLED_HOST, LITERAL_CONTROL].includes(h) && !LOOPBACK.has(h));
    const during = new Set(duringAction ?? []);
    return [
        ...violations(allowlist, observed.filter(h => !during.has(h)), { userAction: false }).map(h => `unlisted host ${h} resolved outside the Orca mode selection (unattended verdict)`),
        ...violations(allowlist, observed.filter(h => during.has(h)), { userAction: true }).map(h => `unlisted host ${h} resolved while the Orca mode was selected (user-action verdict)`),
    ];
}

/** p: each read is { orca, bg, text } under one Theia theme; bg and text are luminances 0..255. */
export function themeVerdict(o) {
    const fails = [];
    for (const t of ['light', 'dark']) {
        const r = o[t];
        if (!r || r.bg === null || r.bg === undefined || r.text === null || r.text === undefined) { fails.push(`collector blind: no sidebar colours read under Theia's ${t} theme`); continue; }
        if (r.orca !== t) fails.push(`Orca is ${r.orca} under Theia's ${t} theme`);
        if (Math.abs(r.bg - r.text) < 90) fails.push(`the project name is unreadable under Theia's ${t} theme (luminance ${Math.round(r.text)} on ${Math.round(r.bg)})`);
    }
    return fails;
}

/** q: { before, reloaded, after }, each read { attr, shown: [label] }. */
export function modeReloadVerdict(o) {
    if (o.before?.attr !== 'orca' || o.before.shown?.join() !== 'Orca') return [`collector blind: before the reload the mode was ${o.before?.attr} and the buttons showed ${o.before?.shown?.join() || 'none'}`];
    if (!o.reloaded || !o.after) return ['collector blind: the frontend did not reload'];
    return o.after.attr === 'orca' && o.after.shown.join() === 'Orca' ? [] : [`after a reload the mode is ${o.after.attr} and the buttons show ${o.after.shown.join() || 'none'}`];
}

/** o: the Settings gear. tipBox is the tooltip's body-level wrapper, size the Settings tab's. */
export function gearVerdict(o) {
    if (o.error) return [`collector blind: ${o.error}`];
    const fails = [];
    if (!o.tipBox) fails.push('collector blind: no tooltip appeared over the gear');
    else if (o.tipBox.h > 100 || o.tipBox.bg !== 'rgba(0, 0, 0, 0)') fails.push(`the gear's tooltip wrapper is ${o.tipBox.w}x${o.tipBox.h} with background ${o.tipBox.bg}, want a small transparent box`);
    if (!o.size) fails.push('the gear opened no Settings tab');
    else if (o.size.w < 660 || o.size.h < 300) fails.push(`the Settings tab is ${o.size.w}x${o.size.h}, want at least 660x300`);
    if (o.count !== 1) fails.push(`a second gear click left ${o.count} Settings tabs, want 1`);
    if (!o.back) fails.push('collector blind: no Back to app button in Orca\'s Settings');
    else if (!o.closedByBack) fails.push('Back to app left the Settings tab open');
    return fails;
}

/** n: each read is { left: [id], right: [id], clipped: [id] } of the visible side icons; orca, revealed (a Theia view shown in the Orca mode) and coding. */
export function sideIconsVerdict({ orca, revealed, coding }, { left, right, theia }) {
    if (!coding?.left?.some(id => id === theia)) return [`collector blind: ${theia} shows no icon in Coding mode, so its absence in Orca mode proves nothing`];
    const fails = [];
    const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
    if (!same(orca.left, [left])) fails.push(`the left bar shows ${orca.left.join(', ') || 'no icon'} in the Orca mode, want ${left} only`);
    if (!same(orca.right, [right])) fails.push(`the right bar shows ${orca.right.join(', ') || 'no icon'} in the Orca mode, want ${right} only`);
    if (orca.clipped.length) fails.push(`an icon is cut off by its bar: ${orca.clipped.join(', ')}`);
    if (!same(revealed.left, [left, theia])) fails.push(`with ${theia} revealed the left bar shows ${revealed.left.join(', ') || 'no icon'}, want it and ${left}`);
    return fails;
}

/** The hosts of a resolver log's text in the order of their first `Resolving host [...]` line. */
export function hostOrder(text) {
    const order = [];
    for (const m of String(text).matchAll(/Resolving host \[([^\]]+)\]/g)) if (!order.includes(m[1])) order.push(m[1]);
    return order;
}

/**
 * The hosts first resolved after `from` and before `to` in an ordered host list; null when either marker is absent or
 * `to` does not come after `from` (a settled marker that precedes the action marker is a blind collector).
 */
export function hostsBetween(order, from, to) {
    const a = order.indexOf(from);
    const b = order.indexOf(to);
    if (a < 0 || b < 0 || b < a) return null;
    return order.slice(a + 1, b);
}

/** hostsBetween over the parent log <base>.moz_log; null when the log or a marker is absent. */
export function hostsBetweenMarkers(base, from, to) {
    const file = `${base}.moz_log`;
    if (!existsSync(file)) return null;
    return hostsBetween(hostOrder(readFileSync(file, 'latin1')), from, to);
}

/** The anchored `Resolving host [...]` names of <base>.moz_log and its .child-N.moz_log siblings (verify-endpoints.sh layer 3). */
export function resolvedHosts(base) {
    const dir = dirname(base);
    const stem = basename(base);
    const files = existsSync(dir) ? readdirSync(dir).filter(f => f === `${stem}.moz_log` || (f.startsWith(`${stem}.child-`) && f.endsWith('.moz_log'))) : [];
    const hosts = new Set();
    for (const f of files) for (const m of readFileSync(join(dir, f), 'latin1').matchAll(/Resolving host \[([^\]]+)\]/g)) hosts.add(m[1]);
    return [...hosts].sort();
}

/** The text of <base>.moz_log and its .child-N.moz_log siblings, joined (resolution and sockets may log in a child). */
export function allLogText(base) {
    const dir = dirname(base);
    const stem = basename(base);
    const files = existsSync(dir) ? readdirSync(dir).filter(f => f === `${stem}.moz_log` || (f.startsWith(`${stem}.child-`) && f.endsWith('.moz_log'))) : [];
    return files.map(f => readFileSync(join(dir, f), 'latin1')).join('\n');
}

const isLoopbackAddress = a => a === '::1' || a === '0:0:0:0:0:0:0:1' || /^127\./.test(a) || /^::ffff:127\./i.test(a);

/**
 * The addresses the log shows connections to ("trying address: <ip>") that no name's "CompleteLookup: <host> has <ip>"
 * line explains, loopback excluded: the destinations of a fetch that skipped name resolution (an IP literal) or went
 * through a proxy. Pure over the log text.
 */
export function literalDestinations(text) {
    const explained = new Set();
    for (const m of String(text).matchAll(/CompleteLookup: \S+ has (\S+)/g)) explained.add(m[1]);
    const out = new Set();
    for (const m of String(text).matchAll(/trying address: (\S+)/g)) {
        const a = m[1].replace(/^\[|\]$/g, '');
        if (!isLoopbackAddress(a) && !explained.has(m[1]) && !explained.has(a)) out.add(a);
    }
    return [...out].sort();
}

/** i: the socket half. The control address must be among the destinations; every other one is red, naming the address. */
export function literalVerdict(destinations, control = LITERAL_CONTROL) {
    if (!destinations.includes(control)) return [`collector blind: the control connection to ${control} (an IP literal) is not in the socket log, so a call to an IP literal would go unseen`];
    return destinations.filter(a => a !== control).map(a => `a connection to the IP-literal address ${a} was made (no resolved name explains it; a hard-coded or proxied destination)`);
}

// ---- derivations from the pinned Orca source (typescript) ----

let ts;
function loadTypeScript() {
    try { ts ??= createRequire(import.meta.url)(join(REPO_ROOT, 'theia', 'node_modules', 'typescript')); return true; } catch { return false; }
}
function parse(rel) {
    const path = join(REPO_ROOT, rel);
    if (!existsSync(path)) throw new Error(`source moved: ${rel} is absent`);
    return ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}
function visit(node, fn) { fn(node); ts.forEachChild(node, c => visit(c, fn)); }
const attrName = a => a.name.getText();
const translateDefaults = node => {
    const out = [];
    visit(node, n => { if (ts.isCallExpression(n) && n.expression.getText() === 'translate' && n.arguments[1] && ts.isStringLiteral(n.arguments[1])) out.push(n.arguments[1].text); });
    return out;
};

/** The selectors and labels this check reads the hosted DOM with, derived from Orca's components. */
export function deriveSelectors() {
    if (!loadTypeScript()) throw new Error("theia/node_modules/typescript is absent");
    const fails = [];
    const attrWhose = (rel, test) => {
        let found;
        visit(parse(rel), n => { if (!found && ts.isJsxAttribute(n) && n.initializer && test(attrName(n), n.initializer.getText())) found = attrName(n); });
        return found;
    };
    const worktreeAttr = attrWhose(SRC.itemRow, (name, init) => name.startsWith('data-') && /\.worktree\.id\}$/.test(init));
    const repoAttr = attrWhose(SRC.header, (name) => /^data-repo-header-id$/.test(name));
    if (!worktreeAttr) fails.push(`source moved: no data- attribute carrying the worktree id in ${SRC.itemRow}`);
    if (!repoAttr) fails.push(`source moved: no data-repo-header-id attribute in ${SRC.header}`);
    const viewsText = readFileSync(join(REPO_ROOT, SRC.views), 'utf8');
    const views = [...(viewsText.match(/export type TopLevelView =([^]*?)(?:\n\n|\nexport|$)/)?.[1] ?? '').matchAll(/'([a-z-]+)'/g)].map(m => m[1]);
    const pages = [];
    for (const rel of SRC.nav) {
        visit(parse(rel), n => {
            if (!ts.isJsxElement(n) || n.openingElement.tagName.getText() !== 'button') return;
            const onClick = n.openingElement.attributes.properties.find(a => ts.isJsxAttribute(a) && attrName(a) === 'onClick');
            const action = onClick?.initializer?.getText().match(/open(\w+?)Page/)?.[1]?.toLowerCase();
            const view = action && views.find(v => v === action || v === action + 's');
            const label = translateDefaults(n)[0];
            if (view && label) pages.push({ view, label });
        });
    }
    if (!pages.length) fails.push(`source moved: no page entry (a button whose onClick opens a TopLevelView page) in ${SRC.nav.join(', ')}`);
    let toggleLabel;
    visit(parse(SRC.toggle), n => {
        if (!toggleLabel && ts.isJsxAttribute(n) && attrName(n) === 'ariaLabel') toggleLabel = translateDefaults(n)[0];
    });
    if (!toggleLabel) fails.push(`source moved: no ariaLabel translate default in ${SRC.toggle}`);
    // l: the aria-label of Orca's open-state close button (RightSidebar) and of its closed-state RightSidebarToggle.
    const ariaDefault = (root) => {
        let found;
        visit(root, n => { if (!found && ts.isJsxAttribute(n) && attrName(n) === 'aria-label' && n.initializer) found = translateDefaults(n)[0]; });
        return found;
    };
    const closeLabel = ariaDefault(parse(SRC.rightSidebar));
    let reopenLabel;
    visit(parse(SRC.titlebarStrip), n => { if (!reopenLabel && ts.isFunctionDeclaration(n) && n.name?.text === 'RightSidebarToggle') reopenLabel = ariaDefault(n); });
    if (!closeLabel) fails.push(`source moved: no aria-label translate default in ${SRC.rightSidebar}`);
    if (!reopenLabel) fails.push(`source moved: no RightSidebarToggle with an aria-label translate default in ${SRC.titlebarStrip}`);
    const navText = readFileSync(join(REPO_ROOT, SRC.nav[0]), 'utf8');
    const hiddenByDefault = hiddenByDefaultViews(navText, pages.map(p => p.view));
    return { fails, worktreeAttr, repoAttr, pages, hiddenByDefault, toggleLabel, closeLabel, reopenLabel };
}

/**
 * m: Orca's own minimum widths and resize-handle grab bands, and the "+" button's label, read from source at check
 * time. The handle is the element whose onMouseDown is useSidebarResize's onResizeStart; its className is a literal
 * or names a module constant holding one.
 */
export function deriveWidthRules() {
    if (!loadTypeScript()) throw new Error("theia/node_modules/typescript is absent");
    const fails = [];
    const num = (rel, re) => { const m = re.exec(readFileSync(join(REPO_ROOT, rel), 'utf8')); return m ? Number(m[1]) : null; };
    const min = {
        left: num(SRC.sidebarIndex, /\bconst MIN_WIDTH = (\d+)/),
        right: num(SRC.rightSidebarWidth, /export const RIGHT_SIDEBAR_MIN_WIDTH = (\d+)/),
    };
    if (!min.left) fails.push(`source moved: no MIN_WIDTH in ${SRC.sidebarIndex}`);
    if (!min.right) fails.push(`source moved: no RIGHT_SIDEBAR_MIN_WIDTH in ${SRC.rightSidebarWidth}`);
    const handleClasses = (rel) => {
        const root = parse(rel);
        const consts = new Map();
        visit(root, n => { if (ts.isVariableDeclaration(n) && n.initializer && (ts.isStringLiteral(n.initializer) || ts.isNoSubstitutionTemplateLiteral(n.initializer))) consts.set(n.name.getText(), n.initializer.text); });
        let found = null;
        visit(root, n => {
            if (found || !(ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n))) return;
            const attrs = n.attributes.properties.filter(ts.isJsxAttribute);
            if (!attrs.some(a => attrName(a) === 'onMouseDown' && a.initializer?.getText() === '{onResizeStart}')) return;
            const cls = attrs.find(a => attrName(a) === 'className')?.initializer;
            if (!cls) return;
            if (ts.isStringLiteral(cls)) { found = cls.text; return; }
            const parts = [];
            visit(cls, c => { if (ts.isStringLiteral(c)) parts.push(c.text); else if (ts.isIdentifier(c) && consts.has(c.text)) parts.push(consts.get(c.text)); });
            found = parts.join(' ');
        });
        return found;
    };
    const band = { left: bandFromClasses(handleClasses(SRC.sidebarIndex)), right: bandFromClasses(handleClasses(SRC.rightSidebar)) };
    if (!band.left) fails.push(`source moved: no resize handle (onMouseDown={onResizeStart}) with a readable offset and width in ${SRC.sidebarIndex}`);
    if (!band.right) fails.push(`source moved: no resize handle (onMouseDown={onResizeStart}) with a readable offset and width in ${SRC.rightSidebar}`);
    const chromeBar = 'theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx';
    const newTabLabel = /aria-label='([^']+)'\s*aria-keyshortcuts=\{BUTTON_SHORTCUTS\.newTab\.aria\}/.exec(readFileSync(join(REPO_ROOT, chromeBar), 'utf8'))?.[1];
    if (!newTabLabel) fails.push(`source moved: no New Tab button (aria-keyshortcuts BUTTON_SHORTCUTS.newTab) in ${chromeBar}`);
    return { fails, min, band, newTabLabel };
}

/**
 * m: adds `count` web tabs with the "+" button and returns how many the main area really gained. `probe(body)` runs a
 * page-realm body, `click({ x, y })` presses at a point. A button that is not found, a click that adds no widget and a
 * main-area count that does not grow within 5 s each leave the count short; the caller's verdict then goes red, so a
 * layout read around zero tabs cannot pass (audit harness-live-panels-04).
 */
export async function addWebTabs({ probe, click, label, count }) {
    const mainCount = () => probe(`return get('ApplicationShell').getWidgets('main').length;`);
    const start = Number(await mainCount());
    for (let i = 0; i < count; i++) {
        const at = await probe(`const b = [...document.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === ${JSON.stringify(label)} && x.getBoundingClientRect().width > 0);
            if (!b) return null; const r = b.getBoundingClientRect(); window.__pbMainCount = get('ApplicationShell').getWidgets('main').length; return { x: r.x + r.width / 2, y: r.y + r.height / 2 };`);
        if (!at) break;
        await click(at);
        const grew = await probe(`return await until(() => get('ApplicationShell').getWidgets('main').length > window.__pbMainCount, 5000);`);
        if (grew !== true) break;
        await probe(`await sleep(300); return true;`);
    }
    const gained = Number(await mainCount()) - start;
    return Number.isFinite(gained) ? Math.max(0, gained) : 0;
}

// ---- the live run ----

const ids = (list, key) => {
    const arr = Array.isArray(list) ? list : (list?.result?.[key] ?? list?.[key] ?? []);
    return arr.map(x => x.id).filter(Boolean);
};

async function live() {
    const lib = await import('./lib/orca-tabs-live.mjs');
    const pre = lib.prerequisites({ needOrca: true });
    if (pre.skip) { console.log(skipLine(NAME, pre.skip)); return SKIP_EXIT; }
    if (pre.fail) { console.error(`${NAME}: FAIL -- ${pre.fail}`); return 1; }
    if (!loadTypeScript()) { console.log(skipLine(NAME, 'theia/node_modules/typescript is absent; run the audited Theia install in theia/')); return SKIP_EXIT; }
    // Nothing is launched before this: a row started by hand takes the live lock itself (harness-live-panels-02).
    const held = await holdLiveLock({ name: NAME, scriptUrl: import.meta.url, root: REPO_ROOT });
    if (held !== null) return held;
    const sel = deriveSelectors();
    if (sel.fails.length) { for (const f of sel.fails) console.error(`${NAME}: FAIL -- ${f}`); return 1; }
    const widthRules = deriveWidthRules();
    if (widthRules.fails.length) { for (const f of widthRules.fails) console.error(`${NAME}: FAIL -- ${f}`); return 1; }
    // l: the id of Theia's own Toggle Right Panel command, read from the installed @theia/core.
    const toggleRight = /TOGGLE_RIGHT_PANEL\s*=[^{]*\{\s*id:\s*'([^']+)'/.exec(readFileSync(join(REPO_ROOT, 'theia/node_modules/@theia/core/lib/browser/common-commands.js'), 'utf8'))?.[1];
    if (!toggleRight) { console.error(`${NAME}: FAIL -- source moved: no TOGGLE_RIGHT_PANEL id in @theia/core common-commands.js`); return 1; }
    const logDir = join(REPO_ROOT, '.mozbuild', NAME);
    mkdirSync(logDir, { recursive: true });
    const logBase = join(logDir, `resolver-${process.pid}`);
    process.env.MOZ_LOG = 'nsHostResolver:5,nsSocketTransport:5';
    process.env.MOZ_LOG_FILE = logBase;
    const results = [];
    const clause = (name, fails, counts) => { results.push({ name, fails }); console.log(`${NAME}: ${name}: ${fails.length ? 'FAIL' : 'PASS'} -- ${fails.length ? fails.join('; ') : counts}`); };
    const J = JSON.stringify;
    try {
        await lib.withOrcaTabsSession({ log: () => {}, registerRepo: false }, async (ctx) => {
            // i (control first): a resolution the collector must see before any absence is judged.
            await ctx.probe(`try { await fetch('http://${CONTROL_HOST}/', { mode: 'no-cors' }); } catch (e) { /* NXDOMAIN expected */ } return true;`);
            const pairing = await ctx.bundle('m.state().pairing');
            if (!pairing?.sessionOnly) throw new Error('the bundle is not paired session-only (C3-65 state().pairing)');
            // i (the one user action): only hosts first resolved between these two markers take the user-action verdict.
            // The panels' own rendering after the settled marker, and the whole run after it, is judged unattended.
            // i (IP-literal control): a connection to an address no name resolved to must show up in the socket log.
            await ctx.probe(`try { await fetch('http://${LITERAL_CONTROL}:${LITERAL_PORT}/', { mode: 'no-cors', signal: AbortSignal.timeout(1500) }); } catch (e) { /* unroutable: expected */ } return true;`);
            const marker = (host) => ctx.probe(`try { await fetch('http://${host}/', { mode: 'no-cors' }); } catch (e) { /* NXDOMAIN expected */ } return true;`);
            await marker(ACTION_HOST);
            await ctx.probe(`await get('ModeService').activateMode('orca'); return true;`);
            // The shell's active widget follows document focus; the automated window starts without it.
            await ctx.focusTheiaFrame();
            await marker(SETTLED_HOST);

            // k: Theia's status bar and the row it would reserve, measured per pass.
            const kPasses = [];
            const statusPass = async (when, mode) => kPasses.push({ when, mode, ...(await ctx.probe(`const shell = get('ApplicationShell');
                await sleep(500);
                const bar = document.getElementById('theia-statusBar');
                const split = document.getElementById('theia-left-right-split-panel');
                return { hiddenFlag: get('StatusBarImpl').isHidden, barHeight: bar ? bar.getBoundingClientRect().height : 0,
                         splitBottom: split ? split.getBoundingClientRect().bottom : null, shellBottom: shell.node.getBoundingClientRect().bottom };`)) });
            await statusPass('Orca selected', 'orca');
            // l: the closed-state toggles (Orca's RightSidebarToggle label, outside the right panel) wherever they are.
            const VISIBLE_REOPEN = `[...document.querySelectorAll('button[aria-label=${J(sel.reopenLabel)}]')]
                .filter(b => !get('ApplicationShell').rightPanelHandler.container.node.contains(b))
                .map(b => { const r = b.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })
                .filter(t => t.w > 0 && t.h > 0)`;

            // j: every visible part's body box against its node and its Orca surface.
            const jFails = [];
            const jCounts = [];
            const fill = async (when) => {
                const boxes = await ctx.probe(`const wm = get('WidgetManager');
                    const box = e => { if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
                    const mounted = await until(() => ${J([...Object.keys(PARTS)])}.every(id => { const w = wm.tryGetWidget(id); return w && w.node.querySelector('[data-pb-orca-pane-root] > *'); }), 20000);
                    if (!mounted) return { timedOut: true };
                    await sleep(500);
                    const out = {};
                    for (const [id, kind] of Object.entries(${J({ ...PARTS, [AGENTS]: 'orchestration' })})) {
                        const w = wm.tryGetWidget(id);
                        if (!w || !w.isAttached || !w.isVisible) continue;
                        const root = w.node.querySelector('[data-pb-orca-pane-root]');
                        out[kind] = { body: box(w.node.parentElement), node: box(w.node), surface: box(root && root.firstElementChild) };
                    }
                    return out;`);
                if (boxes?.timedOut) { jFails.push(`${when}: the sidebar and right sidebar did not mount within 20 s, so the comparison is blind`); jCounts.push(`${when}: 0 part(s)`); return; }
                const kinds = Object.keys(boxes ?? {});
                if (!kinds.includes('sidebar') || !kinds.includes('right-sidebar')) jFails.push(`${when}: ${['sidebar', 'right-sidebar'].filter(k => !kinds.includes(k)).join(' and ')} not shown, so the comparison is blind`);
                for (const kind of kinds) jFails.push(...fillVerdict(`${when} ${kind}`, boxes[kind]));
                jCounts.push(`${when}: ${kinds.length} part(s)`);
            };
            const worktreesBefore = await ctx.bundle('m.state().worktrees');
            if (!Array.isArray(worktreesBefore) || worktreesBefore.length) jFails.push(`the no-project state was not reached (${Array.isArray(worktreesBefore) ? worktreesBefore.length : 'no'} worktree(s) in the store)`);
            await fill('no project');

            // The projects: the session's own repository and a second one.
            ctx.orca('repo', 'add', '--path', ctx.repo);
            const repo2 = join(ctx.scratch, 'repo-two');
            mkdirSync(repo2, { recursive: true });
            // No global or system git config, no hooks, no signing, and the scratch folder as HOME (as the harness's fixtures).
            const git = (...a) => execFileSync('git', ['-C', repo2, ...FIXTURE_GIT_ARGS, ...a], { env: fixtureGitEnv(ctx.scratch), stdio: ['ignore', 'pipe', 'pipe'] });
            git('init', '-q');
            git('commit', '-q', '--allow-empty', '-m', 'fixture');
            ctx.orca('repo', 'add', '--path', repo2);

            // a: a collapsed part mounts when shown (C64-4), so each is expanded first, as a user opens it.
            const panel = await ctx.probe(`const wm = get('WidgetManager'); const shell = get('ApplicationShell');
                for (const id of [${J(LEFT)}, ${J(RIGHT)}]) { const c = wm.tryGetWidget(id); if (c) for (const part of c.getParts()) part.collapsed = false; }
                await until(() => ${J(Object.keys(PARTS))}.every(id => { const w = wm.tryGetWidget(id); return w && w.node.querySelector('.pb-orca-pane-host *'); }), 20000);
                const area = id => { const w = wm.tryGetWidget(id); return w && w.isAttached ? shell.getAreaFor(w) : null; };
                const parts = Object.fromEntries(${J(Object.keys(PARTS))}.map(id => { const w = wm.tryGetWidget(id); return [id, !!(w && w.node.querySelector('.pb-orca-pane-host *'))]; }));
                return { left: area(${J(LEFT)}), right: area(${J(RIGHT)}), parts };`);
            const mountState = (await ctx.bundle('m.state()')) ?? {};
            const mountErrors = mountState.mountErrors ?? [];
            const aFails = [];
            // G3a: state() keeps the newest 50 errors and counts them all in mountErrorsTotal; a build without it, or errors
            // that fell out of the 50, mean the list below is not the whole record.
            if (typeof mountState.mountErrorsTotal !== 'number') aFails.push('state() has no mountErrorsTotal (the bundle build predates the cursor)');
            else if (mountState.mountErrorsTotal > mountErrors.length) aFails.push(`${mountState.mountErrorsTotal - mountErrors.length} mount error(s) fell out of the ${mountErrors.length} state() keeps, so they were not read`);
            if (panel.left !== 'left') aFails.push(`left container in ${panel.left ?? 'no'} area`);
            if (panel.right !== 'right') aFails.push(`right container in ${panel.right ?? 'no'} area`);
            for (const [id, mounted] of Object.entries(panel.parts)) if (!mounted) aFails.push(`${PARTS[id]} part has no mounted content`);
            for (const e of mountErrors) if (Object.values(PARTS).includes(e.kind)) aFails.push(`mount error for ${e.kind} at ${e.phase}`);
            clause('a containers', aFails, `left and right containers docked, ${Object.keys(PARTS).length} parts mounted`);

            // b
            const rows = await ctx.probe(`const node = get('WidgetManager').tryGetWidget('powerbrowser-orca-sidebar-view').node;
                await until(() => node.querySelectorAll('[${sel.worktreeAttr}]').length >= 2, 15000);
                return { worktrees: [...node.querySelectorAll('[${sel.worktreeAttr}]')].map(e => e.getAttribute(${J(sel.worktreeAttr)})),
                         repos: [...node.querySelectorAll('[${sel.repoAttr}]')].map(e => e.getAttribute(${J(sel.repoAttr)})).filter(Boolean) };`);
            const cliRepos = ids(ctx.orca('repo', 'list'), 'repos');
            const cliWorktrees = ids(ctx.orca('worktree', 'list'), 'worktrees');
            clause('b rows', [...setVerdict('repositories', rows.repos, cliRepos), ...setVerdict('worktrees', rows.worktrees, cliWorktrees)],
                `${new Set(rows.repos).size} repository and ${new Set(rows.worktrees).size} worktree rows equal the CLI lists`);

            // j (with projects, every part expanded by clause a), then at the wide side-area width.
            await fill('projects');
            await ctx.probe(`const shell = get('ApplicationShell'); shell.resize(${PART_WIDE}, 'left'); shell.resize(${PART_WIDE}, 'right'); await sleep(800); return true;`);
            await fill(`wide ${PART_WIDE}px`);
            clause('j fill', jFails, `every shown part's node and Orca surface fill its body (${jCounts.join('; ')})`);

            // l: Orca's close button, the closed-state toggle, then Theia's own toggle command both ways.
            const rightState = (want) => ctx.probe(`const shell = get('ApplicationShell'); const rh = shell.rightPanelHandler;
                const collapsed = () => rh.tabBar.currentTitle === null && rh.dockPanel.isHidden;
                const expanded = () => rh.tabBar.currentTitle !== null && !rh.dockPanel.isHidden;
                ${want === 'collapsed' ? 'await until(collapsed, 2000);' : want === 'expanded' ? 'await until(expanded, 2000);' : ''}
                await sleep(400);
                const part = get('WidgetManager').tryGetWidget('powerbrowser-orca-right-sidebar-view');
                const close = part && part.isVisible ? [...part.node.querySelectorAll('button[aria-label=${J(sel.closeLabel)}]')].find(b => b.getBoundingClientRect().width > 0) : null;
                const m = shell.mainPanel.node.getBoundingClientRect();
                return { collapsed: collapsed(), expanded: expanded(), current: rh.tabBar.currentTitle ? rh.tabBar.currentTitle.owner.id : null,
                         closeShown: !!close, toggles: ${VISIBLE_REOPEN}, main: { x: m.x, y: m.y, w: m.width, h: m.height } };`);
            const lObs = {};
            lObs.closeBefore = (await rightState('expanded')).closeShown;
            if (lObs.closeBefore) {
                await ctx.probe(`const part = get('WidgetManager').tryGetWidget('powerbrowser-orca-right-sidebar-view');
                    const b = [...part.node.querySelectorAll('button[aria-label=${J(sel.closeLabel)}]')].find(x => x.getBoundingClientRect().width > 0);
                    if (b) b.click(); return !!b;`);
                lObs.afterClose = await rightState('collapsed');
                const clicked = await ctx.probe(`const shown = [...document.querySelectorAll('button[aria-label=${J(sel.reopenLabel)}]')]
                    .filter(b => !get('ApplicationShell').rightPanelHandler.container.node.contains(b) && b.getBoundingClientRect().width > 0);
                    if (shown[0]) shown[0].click(); return shown.length > 0;`);
                if (clicked) lObs.afterToggle = await rightState('expanded');
                // Theia's command toggles: from an open panel it collapses, so open it first when the steps above left it closed.
                if (!(await rightState('none')).expanded) { await ctx.command(toggleRight); await rightState('expanded'); }
                await ctx.command(toggleRight);
                lObs.afterTheiaCollapse = await rightState('collapsed');
                await ctx.command(toggleRight);
                lObs.afterTheiaExpand = await rightState('expanded');
            }

            // c and d: one switch, read in Orca's web settings store and in the dock.
            // Orca's web client keeps this setting in its own localStorage store (derived key); it is not runtime-backed.
            const storageKey = /export const SETTINGS_STORAGE_KEY = '([^']+)'/.exec(readFileSync(join(REPO_ROOT, SRC.webStorage), 'utf8'))?.[1];
            const runtimeBacked = /runtimeUpdates\.experimentalOrchestrationPanel\b/.test(readFileSync(join(REPO_ROOT, SRC.webPreferences), 'utf8'));
            const judgeable = !!storageKey && !runtimeBacked;
            const readStored = () => ctx.probe(`try { const v = JSON.parse(localStorage.getItem(${J(storageKey)}) || '{}').experimentalOrchestrationPanel; return typeof v === 'boolean' ? v : null; } catch (e) { return null; }`);
            const pollStored = (want, what) => ctx.pollFor(async () => (await readStored()) === want, 10000, what);
            const toggle = () => ctx.probe(`const part = await (async () => { document.querySelector('.pb-orca-side-view button[aria-label="Settings"]').click();
                const tab = () => get('ApplicationShell').getWidgets('main').find(w => w.id === 'orca-pane:settings'); await until(tab, 10000); return tab(); })();
                if (!part) return { error: 'tab not opened by the gear' };
                await get('ApplicationShell').activateWidget(part.id);
                const find = () => part.node.querySelector('[aria-label=${J(sel.toggleLabel)}]');
                // Orca's Settings shows one section at a time; the switch is in its Experimental section.
                if (!find()) { await until(() => [...part.node.querySelectorAll('button, a')].some(e => e.textContent.trim() === 'Experimental'), 10000);
                    const nav = [...part.node.querySelectorAll('button, a')].find(e => e.textContent.trim() === 'Experimental'); nav && nav.click(); }
                await until(find, 10000);
                const sw = find();
                if (!sw) return { error: 'switch not found' };
                sw.click(); return { ok: true };`);
            const agentsIn = () => ctx.probe(`const c = get('WidgetManager').tryGetWidget(${J(LEFT)}); const a = get('WidgetManager').tryGetWidget(${J(AGENTS)});
                return !!(c && a && c.getPartFor(a));`);
            const waitAgents = (want) => ctx.probe(`const wm = get('WidgetManager');
                return await until(() => { const c = wm.tryGetWidget(${J(LEFT)}); const a = wm.tryGetWidget(${J(AGENTS)}); return !!(c && a && c.getPartFor(a)) === ${want}; }, 2000);`);
            const cFails = [];
            const before = judgeable ? await readStored() : null;
            if (!judgeable) cFails.push(runtimeBacked ? `source moved: experimentalOrchestrationPanel is now runtime-backed in ${SRC.webPreferences}; judge orcad's profile state` : `source moved: no SETTINGS_STORAGE_KEY in ${SRC.webStorage}`);
            if (before === true) { await toggle(); await pollStored(false, 'the setting off').catch(() => undefined); }
            const on = await toggle();
            if (on?.error) cFails.push(`settings ${on.error} (aria-label derived from ${SRC.toggle})`);
            const storedOn = await pollStored(true, 'the setting on in Orca\'s web settings store').then(() => true, () => false);
            if (!storedOn) cFails.push('the hosted switch did not set the setting in Orca\'s web settings store');
            await waitAgents(true);
            const presentWhenOn = await agentsIn();
            await toggle();
            const storedOff = await pollStored(false, 'the setting off in Orca\'s web settings store').then(() => true, () => false);
            if (!storedOff) cFails.push('toggling back did not restore the setting in Orca\'s web settings store');
            await waitAgents(false);
            const presentWhenOff = await agentsIn();
            clause('c setting', cFails, 'the hosted switch round-tripped through Orca\'s web settings store');
            clause('d agents', agentsVerdict({ presentWhenOn, presentWhenOff }), 'agents part added with the setting on and removed with it off, each within 2 s');

            // e
            const worktrees = (await ctx.bundle('m.state().worktrees')) ?? [];
            const eFails = [];
            const tabs = {};
            for (const w of worktrees.slice(0, 2)) {
                await ctx.bundle(`m.setActiveWorktree(${J(w.id)})`);
                const t0 = Date.now();
                await ctx.command('powerbrowser.orca.newTerminal');
                const added = await lib.waitForHostedAdd(ctx, t0, Object.values(tabs), 10000);
                if (added) tabs[w.id] = added.id; else eFails.push('a worktree\'s New Orca Terminal gave no hosted tab');
            }
            if (worktrees.length < 2) eFails.push(`${worktrees.length} worktree(s) in the store, 2 needed`);
            if (!eFails.length) {
                const [first, second] = worktrees.slice(0, 2).map(w => w.id);
                await ctx.activate(tabs[first]);
                await ctx.probe(`const row = get('WidgetManager').tryGetWidget('powerbrowser-orca-sidebar-view').node.querySelector('[${sel.worktreeAttr}=' + CSS.escape(${J(second)}) + ']');
                    if (!row) return false; const t = row.querySelector('[data-worktree-card-surface]') || row;
                    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) t.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 }));
                    t.click(); return true;`);
                const active = await ctx.probe(`return await until(() => { const a = get('ApplicationShell').activeWidget; return !!a && a.id === ${J(tabs[second])}; }, 5000);`);
                if (active !== true) eFails.push('a sidebar worktree click did not activate that worktree\'s tab');
            }
            clause('e worktrees', eFails, 'a sidebar worktree click activated that worktree\'s hosted tab');

            // f
            const fFails = [];
            const shownViews = [];
            for (const { view, label } of sel.pages) {
                const click = () => ctx.probe(`const node = get('WidgetManager').tryGetWidget('powerbrowser-orca-sidebar-view').node;
                    const buttons = [...node.querySelectorAll('button')];
                    const b = buttons.find(x => x.textContent.trim() === ${J(label)}) || buttons.find(x => x.textContent.trim().startsWith(${J(label)}));
                    if (!b) return false; b.click(); return true;`);
                if (!(await click())) continue;
                shownViews.push(view);
                const want = `pb-orca:${view}`;
                const activeUri = () => ctx.probe(`const shell = get('ApplicationShell');
                    const at = () => { const a = shell.activeWidget; const u = a && get('TabUriRegistry').uriOf(a); return u && u.toString(true) === ${J(want)} ? a.id : null; };
                    await until(at, 5000); return at();`);
                const id = await activeUri();
                if (!id) { fFails.push(`${view}: the entry did not open ${want}`); continue; }
                await ctx.luminoClose(id);
                await click();
                if (!(await activeUri())) fFails.push(`${view}: after closing, a second click did not reopen ${want}`);
            }
            fFails.push(...pagesVerdict({ derived: sel.pages, shown: shownViews, allowed: sel.hiddenByDefault }));
            clause('f pages', fFails, `${shownViews.length} page entr${shownViews.length === 1 ? 'y' : 'ies'} opened, closed and reopened their pb-orca: tab (all ${sel.pages.length} derived entries shown${sel.hiddenByDefault.length ? ` but ${sel.hiddenByDefault.length} that Orca hides by default` : ''})`);

            // g
            const areasByMode = {};
            for (const mode of ['coding', 'browsing']) {
                areasByMode[mode] = await ctx.probe(`await get('ModeService').activateMode(${J(mode)}); await sleep(500);
                    const wm = get('WidgetManager'); const shell = get('ApplicationShell');
                    const area = id => { const w = wm.tryGetWidget(id); return w && w.isAttached ? shell.getAreaFor(w) : null; };
                    return { [${J(LEFT)}]: area(${J(LEFT)}), [${J(RIGHT)}]: area(${J(RIGHT)}) };`);
                if (mode === 'coding') {
                    await statusPass('Coding', 'coding');
                    lObs.coding = { toggles: await ctx.probe(`await sleep(300); return ${VISIBLE_REOPEN};`) };
                }
            }
            clause('g modes', leakVerdict(areasByMode), 'neither container in the left or right area in Coding or Browsing');

            // k, the second Orca pass: back from Coding and Browsing.
            await ctx.probe(`await get('ModeService').activateMode('orca'); return true;`);
            await statusPass('Orca after Coding and Browsing', 'orca');
            clause('k status bar', statusBarVerdict(kPasses), `Theia's status bar hidden and its row reclaimed in ${kPasses.filter(p => p.mode === 'orca').length} Orca pass(es); shown in Coding (control)`);
            clause('l right toggle', rightToggleVerdict(lObs), 'Orca\'s close button collapsed the right panel, Orca\'s toggle at the main area\'s top right reopened it with Orca\'s content, Theia\'s Toggle Right Panel kept Orca\'s flag in step both ways, no toggle in Coding');

            // m: widths through web tabs and mode round trips, drags across Orca's grab band, and Orca's minimum.
            // The pointer is BiDi input on the Theia document (hit-tested and dispatched there as trusted events).
            const theiaContext = async () => {
                const href = await ctx.app.evaluate('location.href');
                const found = (await ctx.app.contexts()).find(c => c.url === href);
                if (!found) throw new Error('no BiDi context for the Theia frame');
                return found.context;
            };
            const pointer = async (actions) => {
                const context = await theiaContext();
                await ctx.app.send('input.performActions', { context, actions: [{ type: 'pointer', id: 'pb-side-width-mouse', parameters: { pointerType: 'mouse' }, actions }] });
                await ctx.app.send('input.releaseActions', { context });
            };
            const dragFrom = (x, y, dx) => {
                const steps = [];
                for (let i = 1; i <= 10; i++) steps.push({ type: 'pointerMove', x: Math.round(x + dx * i / 10), y: Math.round(y), duration: 20 });
                return pointer([{ type: 'pointerMove', x: Math.round(x), y: Math.round(y) }, { type: 'pointerDown', button: 0 }, ...steps, { type: 'pointerUp', button: 0 }]);
            };
            const widths = () => ctx.probe(`const shell = get('ApplicationShell'); const out = { inner: [innerWidth, innerHeight] };
                for (const side of ['left', 'right']) {
                    const h = shell[side + 'PanelHandler']; const r = h.container.node.getBoundingClientRect();
                    const shown = !h.container.isHidden && !h.dockPanel.isHidden;
                    out[side] = shown ? { size: r.width, edge: side === 'left' ? r.right : r.left } : null;
                }
                return out;`);
            const sizesOf = (w) => ({ left: w.left?.size, right: w.right?.size });
            // Fixture, not under test: both sides to SIDE_START through Theia's own API, Orca's containers current.
            const setStart = () => ctx.probe(`const shell = get('ApplicationShell');
                shell.leftPanelHandler.expand(${J(LEFT)}); shell.rightPanelHandler.expand(${J(RIGHT)}); await sleep(300);
                shell.resize(${SIDE_START}, 'left'); shell.resize(${SIDE_START}, 'right'); await sleep(600); return true;`);
            const mObs = { keep: [], drags: [], squeeze: [] };
            await setStart();
            const mBefore0 = sizesOf(await widths());
            const tabsAdded = await addWebTabs({
                probe: (body) => ctx.probe(body),
                click: (at) => pointer([{ type: 'pointerMove', x: Math.round(at.x), y: Math.round(at.y) }, { type: 'pointerDown', button: 0 }, { type: 'pointerUp', button: 0 }]),
                label: widthRules.newTabLabel, count: WEB_TABS,
            });
            mObs.keep.push({ when: `after ${WEB_TABS} web tabs from the "+" button`, before: mBefore0, after: sizesOf(await widths()), tabs: { added: tabsAdded, expected: WEB_TABS } });
            let mBefore;
            for (const [away, when] of [['browsing', 'after a Browsing round trip'], ['organising', 'after an Organising round trip']]) {
                await setStart();
                mBefore = sizesOf(await widths());
                await ctx.probe(`await get('ModeService').activateMode(${J(away)}); await sleep(500); await get('ModeService').activateMode('orca'); await sleep(900); return true;`);
                mObs.keep.push({ when, before: mBefore, after: sizesOf(await widths()) });
            }
            for (const side of ['left', 'right']) {
                for (const offset of bandSamples(widthRules.band[side])) {
                    await setStart();
                    const w = await widths();
                    if (!w[side]) continue;
                    await dragFrom(w[side].edge + offset, w.inner[1] / 2, side === 'left' ? DRAG : -DRAG);
                    await ctx.probe(`await sleep(400); return true;`);
                    mObs.drags.push({ side, offset, before: w[side].size, after: (await widths())[side]?.size ?? 0 });
                }
                await setStart();
                const w = await widths();
                if (!w[side]) continue;
                // From the edge itself to two pixels inside the window's outer side.
                await dragFrom(w[side].edge, w.inner[1] / 2, side === 'left' ? 2 - w[side].edge : (w.inner[0] - 2) - w[side].edge);
                await ctx.probe(`await sleep(400); return true;`);
                mObs.squeeze.push({ side, before: w[side].size, after: (await widths())[side]?.size ?? 0 });
            }
            clause('m width', widthVerdict(mObs, { min: widthRules.min, drag: DRAG }),
                `each side kept its width through ${WEB_TABS} web tabs and a Browsing and an Organising round trip; drags from ${mObs.drags.length} points across Orca's grab bands (left ${widthRules.band.left.join('..')}px, right ${widthRules.band.right.join('..')}px from the edge) moved the panel ${DRAG}px; squeezes stopped at Orca's minimum (left ${widthRules.min.left}px, right ${widthRules.min.right}px); BiDi pointer input`);

            // n
            const THEIA_VIEW = 'explorer-view-container';
            const icons = () => ctx.probe(`await sleep(700); const out = { clipped: [] };
                for (const side of ['left', 'right']) {
                    const bar = document.querySelector('#theia-' + side + '-content-panel .pb-side-header .lm-TabBar');
                    const box = bar ? bar.getBoundingClientRect() : null;
                    out[side] = bar ? [...bar.querySelectorAll('.lm-TabBar-content > .lm-TabBar-tab')].filter(t => t.getClientRects().length).map(t => {
                        const id = t.id.replace(/^shell-tab-/, ''), b = t.getBoundingClientRect();
                        if (b.left < box.left - 1 || b.right > box.right + 1) out.clipped.push(id);
                        return id;
                    }) : [];
                }
                return out;`);
            const iconObs = {};
            await ctx.probe(`await get('ModeService').activateMode('coding'); await sleep(500); await get('ApplicationShell').revealWidget(${J(THEIA_VIEW)}); return true;`);
            iconObs.coding = await icons();
            await ctx.probe(`await get('ModeService').activateMode('orca'); return true;`);
            iconObs.orca = await icons();
            await ctx.probe(`await get('ApplicationShell').revealWidget(${J(THEIA_VIEW)}); return true;`);
            iconObs.revealed = await icons();
            await ctx.probe(`await get('ApplicationShell').revealWidget(${J(LEFT)}); return true;`);
            clause('n icons', sideIconsVerdict(iconObs, { left: LEFT, right: RIGHT, theia: THEIA_VIEW }), 'only the Orca icon shows on each side in the Orca mode, a revealed Theia view shows beside it, Coding shows Theia\'s icons');
            // o
            const gearObs = await ctx.probe(`const gear = document.querySelector('.pb-orca-side-view button[aria-label="Settings"]');
                if (!gear) return { error: 'no Settings gear in the hosted sidebar' };
                const shell = get('ApplicationShell'); const tab = () => shell.getWidgets('main').find(w => w.id === 'orca-pane:settings');
                tab()?.close(); await sleep(800);
                const r = gear.getBoundingClientRect();
                gear.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: r.x + 4, clientY: r.y + 4, pointerType: 'mouse' }));
                const tipOf = () => document.querySelector('body > [data-radix-popper-content-wrapper]'); await until(tipOf, 3000); const tip = tipOf();
                const tipBox = tip ? { w: tip.offsetWidth, h: tip.offsetHeight, bg: getComputedStyle(tip).backgroundColor } : null;
                gear.click(); await until(() => tab()?.isVisible, 8000); await sleep(800);
                const first = tab(); const size = first ? { w: first.node.clientWidth, h: first.node.clientHeight } : null;
                gear.click(); await sleep(800);
                const count = shell.getWidgets('main').filter(w => w.id === 'orca-pane:settings').length;
                const back = first && [...first.node.querySelectorAll('button')].find(b => /Back to app/.test(b.textContent)); if (back) back.click();
                await until(() => !tab(), 5000);
                return { tipBox, size, count, back: !!back, closedByBack: !tab() };`);
            clause('o gear', gearVerdict(gearObs), 'the gear shows a small tooltip, opens one Settings tab wide enough for Orca\'s Settings, and Back to app closes it');
            // h
            const reg = await ctx.probe(`const r = get('TabUriRegistry'); return [${J(LEFT)}, ${J(RIGHT)}].filter(id => !r.getViewContribution(id));`);
            clause('h registry', reg.map(id => `TabUriRegistry has no view contribution for ${id} (its startup error would fire)`), 'both container ids resolve to a view contribution');
            // p
            const themeObs = {};
            for (const t of ['light', 'dark']) themeObs[t] = await ctx.probe(`get('ThemeService').setCurrentTheme('${t}'); await sleep(1500);
                const bg = document.querySelector('.pb-orca-side-view .bg-worktree-sidebar'); const name = [...document.querySelectorAll('.pb-orca-side-view *')].find(x => !x.children.length && x.textContent.trim() === ${J(ctx.repo.split('/').pop())});
                const lum = c => { const m = /rgba?\\((\\d+), (\\d+), (\\d+)/.exec(c); return m ? (0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3]) : null; };
                return { orca: document.documentElement.classList.contains('dark') ? 'dark' : 'light', bg: bg && lum(getComputedStyle(bg).backgroundColor), text: name && lum(getComputedStyle(name).color) };`);
            clause('p theme', themeVerdict(themeObs), 'Orca follows a light and a dark Theia theme, and its project name contrasts with its sidebar in both');
            // q
            const modeRead = () => ctx.probe(`return { attr: document.body.getAttribute('data-pb-mode'), shown: [...document.querySelectorAll('[aria-pressed="true"]')].map(e => e.textContent.trim()).filter(t => ['Coding', 'Browsing', 'Organising', 'Orca'].includes(t)) };`);
            await ctx.probe(`await get('ModeService').activateMode('orca'); await sleep(800); return true;`);
            const beforeReload = await modeRead();
            const origin = await ctx.probe('return performance.timeOrigin;');
            await ctx.app.evaluate('setTimeout(() => location.reload(), 0), true').catch(() => undefined);
            const reloaded = await ctx.pollFor(async () => { const o = await ctx.probe(`return get('FrontendApplicationStateService').state === 'ready' ? performance.timeOrigin : null;`, 5000).catch(() => null); return o && o !== origin ? true : null; }, 90000, 'the reloaded frontend').catch(() => false);
            const readAfter = async () => { const r = await modeRead().catch(() => null); return r?.shown ? r : null; };
            const settled = reloaded ? await ctx.pollFor(readAfter, 30000, 'the mode buttons after the reload').catch(() => null) : null;
            await new Promise(r => setTimeout(r, settled ? 4000 : 0));
            clause('q reload', modeReloadVerdict({ before: beforeReload, reloaded, after: settled ? await ctx.pollFor(readAfter, 15000, 'the settled mode buttons').catch(() => null) : null }), 'after a reload the mode buttons show the Orca mode the shell is in');
        });
    } catch (err) {
        console.error(`${NAME}: FAIL -- the session did not complete: ${String(err?.message ?? err).split('\n')[0]}`);
        return 1;
    } finally {
        delete process.env.MOZ_LOG;
        delete process.env.MOZ_LOG_FILE;
    }
    // i, after the browser has exited and flushed its logs.
    const { hosts } = JSON.parse(readFileSync(join(REPO_ROOT, 'powerbrowser', 'endpoint-allowlist.json'), 'utf8'));
    const resolved = resolvedHosts(logBase);
    const duringAction = hostsBetweenMarkers(logBase, ACTION_HOST, SETTLED_HOST);
    const others = resolved.filter(h => ![CONTROL_HOST, ACTION_HOST, SETTLED_HOST].includes(h) && !LOOPBACK.has(h));
    const nDuring = others.filter(h => (duringAction ?? []).includes(h)).length;
    const literal = literalVerdict(literalDestinations(allLogText(logBase)));
    clause('i egress', [...egressVerdict({ resolved, allowlist: hosts, duringAction }), ...literal], `control and both markers seen; ${others.length - nDuring} host(s) pass the unattended verdict, ${nDuring} first resolved during the Orca mode selection pass the user-action verdict`);
    const failed = results.filter(r => r.fails.length).map(r => r.name);
    if (failed.length) { console.error(`${NAME}: FAIL -- ${failed.join(', ')}`); return 1; }
    console.log(`${NAME}: PASS -- ${results.length} clauses`);
    return 0;
}

// ---- self-test ----

/** k fixture: two Orca passes and the Coding control at 1280x768; `over` replaces fields of the orca or coding passes. */
function kFixture(over = {}) {
    return [
        { when: 'Orca selected', mode: 'orca', hiddenFlag: true, barHeight: 0, splitBottom: 768, shellBottom: 768, ...over.orca },
        { when: 'Coding', mode: 'coding', hiddenFlag: false, barHeight: 22, splitBottom: 746, shellBottom: 768, ...over.coding },
        { when: 'Orca after Coding', mode: 'orca', hiddenFlag: true, barHeight: 0, splitBottom: 768, shellBottom: 768 },
    ];
}

/** l fixture: a passing run (main area 0..1280 from y=72, the toggle at its top right); `over` merges into each step. */
function lFixture(over = {}) {
    const main = { x: 244, y: 72, w: 1036, h: 674 };
    const closed = { collapsed: true, toggles: [{ x: 1240, y: 77.5, w: 32, h: 24 }], main };
    const open = { expanded: true, current: RIGHT, closeShown: true };
    const merge = (base, key) => (key in over ? (over[key] === undefined ? undefined : { ...base, ...over[key] }) : base);
    return {
        closeBefore: 'closeBefore' in over ? over.closeBefore : true,
        afterClose: merge(closed, 'afterClose'),
        afterToggle: merge(open, 'afterToggle'),
        afterTheiaCollapse: merge(closed, 'afterTheiaCollapse'),
        afterTheiaExpand: merge(open, 'afterTheiaExpand'),
        coding: merge({ toggles: [] }, 'coding'),
    };
}

/**
 * m fixture: a passing run at SIDE_START (the round-3 measurements: 320 px sides, a 60 px drag moving 60 px, a squeeze
 * stopping at 220). `over.keep` replaces the keep passes, `over.drag` and `over.squeeze` map each entry.
 */
function mFixture(over = {}) {
    const s = { left: SIDE_START, right: SIDE_START };
    const keep = over.keep ?? [
        { when: `after ${WEB_TABS} web tabs from the "+" button`, before: s, after: s, tabs: { added: WEB_TABS, expected: WEB_TABS } },
        { when: 'after a Browsing round trip', before: s, after: s },
        { when: 'after an Organising round trip', before: s, after: s },
    ];
    const drags = [];
    for (const side of ['left', 'right']) for (const offset of bandSamples(side === 'left' ? [-6, 6] : [0, 4])) drags.push({ side, offset, before: SIDE_START, after: SIDE_START + DRAG });
    const squeeze = [{ side: 'left', before: SIDE_START, after: 220 }, { side: 'right', before: SIDE_START, after: 220 }];
    return {
        obs: { keep, drags: drags.map(over.drag ?? (d => d)).filter(Boolean), squeeze: squeeze.map(over.squeeze ?? (q => q)).filter(Boolean) },
        expect: { min: over.min ?? { left: 220, right: 220 }, drag: DRAG },
    };
}
const mRun = (over) => { const { obs, expect } = mFixture(over); return widthVerdict(obs, expect); };

/**
 * A fake Theia page for addWebTabs: a main-area widget count, a "+" button that is present or not, and clicks that add a
 * widget or not (`addUntil`: the click count after which clicks stop adding one).
 */
function fakeTabPage({ button = true, addUntil = Infinity }) {
    const page = { main: 2, mark: 0, clicks: 0 };
    return {
        probe: async (body) => {
            if (/aria-label/.test(body)) { if (!button) return null; page.mark = page.main; return { x: 10, y: 10 }; }
            if (/until\(/.test(body)) return page.main > page.mark;
            if (/sleep\(/.test(body)) return true;
            return page.main;
        },
        click: async () => { page.clicks += 1; if (page.clicks <= addUntil) page.main += 1; },
        label: 'New Tab', count: WEB_TABS,
    };
}
const PAGES6 = ['tasks', 'automations', 'mobile', 'artifacts', 'skills', 'plugins'].map(view => ({ view, label: view[0].toUpperCase() + view.slice(1) }));
const NAV_FIXTURE = `export function shouldShowMobileButton(settings: Partial<Pick<GlobalSettings, 'showMobileButton'>> | null | undefined): boolean {
  return settings?.showMobileButton !== false
}
export function shouldShowArtifactsButton(settings: Partial<Pick<GlobalSettings, 'showArtifactsButton'>> | null | undefined): boolean {
  return settings?.showArtifactsButton === true
}
export function shouldShowSkillsButton(settings: Partial<Pick<GlobalSettings, 'showSkillsButton'>> | null | undefined): boolean {
  return settings?.showSkillsButton === true
}
export function shouldShowAgentDashboardButton(settings: Partial<Pick<GlobalSettings, 'x'>> | null | undefined): boolean {
  return settings?.experimentalAgentDashboardPopout === true
}`;
/** A resolver-and-socket log fixture: each address is connected to; 104.18.1.1 is the address a name resolved to. */
const SOCKET_LOG = (addrs) => ['D/nsHostResolver CompleteLookup: api.github.com has 104.18.1.1', ...addrs.map(a => `D/nsSocketTransport   trying address: ${a}`)].join('\n');
/** The m verdict for a run whose tab-adding collector ran against `fake`. */
const tabRun = async (fake) => mRun({ keep: [{ when: `after ${WEB_TABS} web tabs from the "+" button`, before: { left: 320, right: 320 }, after: { left: 320, right: 320 }, tabs: { added: await addWebTabs(fake), expected: WEB_TABS } }] });

/** Self-test cases that could not run because a fetched checkout is absent (the self-test then ends SKIP, 77). */
const selfTestSkips = [];

async function selfTest() {
    const allow = [{ host: 'api.github.com', disposition: 'allow' }, { host: 'example.org', disposition: 'user-initiated' }];
    const cases = [
        ['control: rows equal', () => setVerdict('worktrees', ['a', 'b'], ['b', 'a']), null],
        ['control: agents follow the setting', () => agentsVerdict({ presentWhenOn: true, presentWhenOff: false }), null],
        ['control: no container in Coding', () => leakVerdict({ coding: { [LEFT]: null, [RIGHT]: null } }), null],
        ['control: theme', () => themeVerdict({ light: { orca: 'light', bg: 245, text: 10 }, dark: { orca: 'dark', bg: 42, text: 240 }, ...{} }), null],
        ['Orca light in a dark window', () => themeVerdict({ light: { orca: 'light', bg: 245, text: 10 }, dark: { orca: 'dark', bg: 42, text: 240 }, ...{ dark: { orca: 'light', bg: 245, text: 10 } } }), "Orca is light under Theia's dark theme"],
        ['an unreadable name', () => themeVerdict({ light: { orca: 'light', bg: 245, text: 10 }, dark: { orca: 'dark', bg: 42, text: 240 }, ...{ dark: { orca: 'dark', bg: 42, text: 60 } } }), 'the project name is unreadable'],
        ['no colours', () => themeVerdict({ light: { orca: 'light', bg: 245, text: 10 }, dark: { orca: 'dark', bg: 42, text: 240 }, ...{ light: null } }), 'no sidebar colours read'],
        ['control: reload', () => modeReloadVerdict({ before: { attr: 'orca', shown: ['Orca'] }, reloaded: true, after: { attr: 'orca', shown: ['Orca'] }, ...{} }), null],
        ['Coding shown after a reload', () => modeReloadVerdict({ before: { attr: 'orca', shown: ['Orca'] }, reloaded: true, after: { attr: 'orca', shown: ['Orca'] }, ...{ after: { attr: 'orca', shown: ['Coding'] } } }), 'the buttons show Coding'],
        ['no reload', () => modeReloadVerdict({ before: { attr: 'orca', shown: ['Orca'] }, reloaded: true, after: { attr: 'orca', shown: ['Orca'] }, ...{ reloaded: false } }), 'did not reload'],
        ['not in Orca before', () => modeReloadVerdict({ before: { attr: 'orca', shown: ['Orca'] }, reloaded: true, after: { attr: 'orca', shown: ['Orca'] }, ...{ before: { attr: 'coding', shown: ['Coding'] } } }), 'before the reload the mode was coding'],
        ['control: gear', () => gearVerdict({ tipBox: { w: 71, h: 28, bg: 'rgba(0, 0, 0, 0)' }, size: { w: 791, h: 661 }, count: 1, back: true, closedByBack: true, ...{} }), null],
        ['a viewport-tall tooltip', () => gearVerdict({ tipBox: { w: 71, h: 28, bg: 'rgba(0, 0, 0, 0)' }, size: { w: 791, h: 661 }, count: 1, back: true, closedByBack: true, ...{ tipBox: { w: 71, h: 768, bg: 'rgb(0, 0, 0)' } } }), 'tooltip wrapper is 71x768'],
        ['no tooltip', () => gearVerdict({ tipBox: { w: 71, h: 28, bg: 'rgba(0, 0, 0, 0)' }, size: { w: 791, h: 661 }, count: 1, back: true, closedByBack: true, ...{ tipBox: null } }), 'no tooltip appeared'],
        ['no Settings tab', () => gearVerdict({ tipBox: { w: 71, h: 28, bg: 'rgba(0, 0, 0, 0)' }, size: { w: 791, h: 661 }, count: 1, back: true, closedByBack: true, ...{ size: null } }), 'opened no Settings tab'],
        ['a squeezed Settings', () => gearVerdict({ tipBox: { w: 71, h: 28, bg: 'rgba(0, 0, 0, 0)' }, size: { w: 791, h: 661 }, count: 1, back: true, closedByBack: true, ...{ size: { w: 244, h: 50 } } }), 'the Settings tab is 244x50'],
        ['two Settings tabs', () => gearVerdict({ tipBox: { w: 71, h: 28, bg: 'rgba(0, 0, 0, 0)' }, size: { w: 791, h: 661 }, count: 1, back: true, closedByBack: true, ...{ count: 2 } }), 'left 2 Settings tabs'],
        ['Back to app ignored', () => gearVerdict({ tipBox: { w: 71, h: 28, bg: 'rgba(0, 0, 0, 0)' }, size: { w: 791, h: 661 }, count: 1, back: true, closedByBack: true, ...{ closedByBack: false } }), 'Back to app left'],
        ['no Back to app', () => gearVerdict({ tipBox: { w: 71, h: 28, bg: 'rgba(0, 0, 0, 0)' }, size: { w: 791, h: 661 }, count: 1, back: true, closedByBack: true, ...{ back: false } }), 'no Back to app button'],
        ['no gear', () => gearVerdict({ tipBox: { w: 71, h: 28, bg: 'rgba(0, 0, 0, 0)' }, size: { w: 791, h: 661 }, count: 1, back: true, closedByBack: true, ...{ error: 'no Settings gear' } }), 'collector blind: no Settings gear'],
        ['control: side icons', () => sideIconsVerdict({ orca: { left: ['L'], right: ['R'], clipped: [] }, revealed: { left: ['T', 'L'], right: ['R'], clipped: [] }, coding: { left: ['T'], right: [], clipped: [] }, ...{} }, { left: 'L', right: 'R', theia: 'T' }), null],
        ['a Theia icon in the Orca mode', () => sideIconsVerdict({ orca: { left: ['L'], right: ['R'], clipped: [] }, revealed: { left: ['T', 'L'], right: ['R'], clipped: [] }, coding: { left: ['T'], right: [], clipped: [] }, ...{ orca: { left: ['T', 'L'], right: ['R'], clipped: [] } } }, { left: 'L', right: 'R', theia: 'T' }), 'the left bar shows T, L'],
        ['a Theia icon on the right', () => sideIconsVerdict({ orca: { left: ['L'], right: ['R'], clipped: [] }, revealed: { left: ['T', 'L'], right: ['R'], clipped: [] }, coding: { left: ['T'], right: [], clipped: [] }, ...{ orca: { left: ['L'], right: ['X', 'R'], clipped: [] } } }, { left: 'L', right: 'R', theia: 'T' }), 'the right bar shows X, R'],
        ['the Orca icon cut off', () => sideIconsVerdict({ orca: { left: ['L'], right: ['R'], clipped: [] }, revealed: { left: ['T', 'L'], right: ['R'], clipped: [] }, coding: { left: ['T'], right: [], clipped: [] }, ...{ orca: { left: ['L'], right: ['R'], clipped: ['L'] } } }, { left: 'L', right: 'R', theia: 'T' }), 'cut off by its bar: L'],
        ['a revealed view with no icon', () => sideIconsVerdict({ orca: { left: ['L'], right: ['R'], clipped: [] }, revealed: { left: ['T', 'L'], right: ['R'], clipped: [] }, coding: { left: ['T'], right: [], clipped: [] }, ...{ revealed: { left: ['L'], right: ['R'], clipped: [] } } }, { left: 'L', right: 'R', theia: 'T' }), 'with T revealed'],
        ['no Theia icon in Coding', () => sideIconsVerdict({ orca: { left: ['L'], right: ['R'], clipped: [] }, revealed: { left: ['T', 'L'], right: ['R'], clipped: [] }, coding: { left: ['T'], right: [], clipped: [] }, ...{ coding: { left: [], right: [], clipped: [] } } }, { left: 'L', right: 'R', theia: 'T' }), 'collector blind'],
        ['control: control seen, listed host', () => egressVerdict({ resolved: [CONTROL_HOST, 'api.github.com', 'localhost'], allowlist: allow }), null],
        ['a missing sidebar row', () => setVerdict('worktrees', ['a'], ['a', 'b']), 'missing sidebar row'],
        ['an extra sidebar row', () => setVerdict('repositories', ['a', 'b', 'c'], ['a', 'b']), 'extra sidebar row'],
        ['an agents part that stayed', () => agentsVerdict({ presentWhenOn: true, presentWhenOff: true }), 'agents part stayed'],
        ['a container leaked into Coding', () => leakVerdict({ coding: { [LEFT]: 'left', [RIGHT]: null } }), `container ${LEFT} leaked into coding`],
        ['control: the IP-literal control in the resolver log', () => egressVerdict({ resolved: [CONTROL_HOST, LITERAL_CONTROL, 'api.github.com'], allowlist: allow }), null],
        ['another IP literal in the resolver log', () => egressVerdict({ resolved: [CONTROL_HOST, '203.0.113.9'], allowlist: allow }), 'unlisted host 203.0.113.9'],
        ['a control host absent', () => egressVerdict({ resolved: ['api.github.com'], allowlist: allow }), 'collector blind'],
        ['an unlisted host', () => egressVerdict({ resolved: [CONTROL_HOST, 'tracker.example.net'], allowlist: allow }), 'unlisted host tracker.example.net'],
        ['a user-initiated host resolved unattended', () => egressVerdict({ resolved: [CONTROL_HOST, 'example.org'], allowlist: allow }), 'unlisted host example.org'],
        // i (harness-live-panels-03): only the hosts resolved between the two markers, during the Orca mode selection, take the
        // user-action verdict; a user-initiated host the panels resolve while they render, after the settled marker, is red.
        ['control: a user-initiated host while the Orca mode was selected', () => egressVerdict({ resolved: [CONTROL_HOST, ACTION_HOST, 'example.org', SETTLED_HOST], allowlist: allow, duringAction: ['example.org'] }), null],
        ['a user-initiated host resolved after the settled marker (the panels rendering)', () => egressVerdict({ resolved: [CONTROL_HOST, ACTION_HOST, SETTLED_HOST, 'example.org'], allowlist: allow, duringAction: [] }), 'unlisted host example.org resolved outside the Orca mode selection (unattended verdict)'],
        ['an unlisted host while the Orca mode was selected', () => egressVerdict({ resolved: [CONTROL_HOST, ACTION_HOST, 'tracker.example.net', SETTLED_HOST], allowlist: allow, duringAction: ['tracker.example.net'] }), 'unlisted host tracker.example.net resolved while the Orca mode was selected'],
        ['the user-action marker absent', () => egressVerdict({ resolved: [CONTROL_HOST, SETTLED_HOST, 'example.org'], allowlist: allow, duringAction: [] }), `collector blind: the marker ${ACTION_HOST}`],
        ['the settled marker absent', () => egressVerdict({ resolved: [CONTROL_HOST, ACTION_HOST, 'example.org'], allowlist: allow, duringAction: [] }), `collector blind: the marker ${SETTLED_HOST}`],
        ['the markers out of order', () => egressVerdict({ resolved: [CONTROL_HOST, ACTION_HOST, SETTLED_HOST], allowlist: allow, duringAction: hostsBetween([SETTLED_HOST, 'example.org', ACTION_HOST], ACTION_HOST, SETTLED_HOST) }), 'not both in the parent resolver log in that order'],
        ['a resolver log whose panel host follows the settled marker', () => {
            const log = [CONTROL_HOST, 'api.github.com', ACTION_HOST, SETTLED_HOST, 'example.org'].map(h => `D/nsHostResolver Resolving host [${h}]<>`).join('\n');
            const order = hostOrder(log);
            return egressVerdict({ resolved: order, allowlist: allow, duringAction: hostsBetween(order, ACTION_HOST, SETTLED_HOST) });
        }, 'unlisted host example.org resolved outside the Orca mode selection'],
        ['control: a resolver log whose only user-initiated host sits between the markers', () => {
            const log = [CONTROL_HOST, 'api.github.com', ACTION_HOST, 'example.org', SETTLED_HOST].map(h => `D/nsHostResolver Resolving host [${h}]<>`).join('\n');
            const order = hostOrder(log);
            return egressVerdict({ resolved: order, allowlist: allow, duringAction: hostsBetween(order, ACTION_HOST, SETTLED_HOST) });
        }, null],
        // j, the boxes measured in the 2026-11-18 reproduction (a 244 px part at 1280x768, the owner's wider part).
        ['control: node and surface fill the part body', () => fillVerdict('sidebar', { body: { x: 0, y: 131, w: 244, h: 591 }, node: { x: 0, y: 131, w: 244, h: 591.4 }, surface: { x: 0, y: 131, w: 244, h: 591 } }), null],
        ['a surface wider than the part (Orca\'s stored width)', () => fillVerdict('right-sidebar', { body: { x: 1036, y: 107, w: 244, h: 615 }, node: { x: 1036, y: 107, w: 244, h: 615 }, surface: { x: 1036, y: 107, w: 350, h: 615 } }), 'surface right edge +106px'],
        ['a surface narrower than the part', () => fillVerdict('sidebar', { body: { x: 0, y: 131, w: 400, h: 591 }, node: { x: 0, y: 131, w: 400, h: 591 }, surface: { x: 0, y: 131, w: 280, h: 591 } }), 'surface right edge -120px'],
        ['a surface of content height', () => fillVerdict('sidebar', { body: { x: 0, y: 131, w: 244, h: 591 }, node: { x: 0, y: 131, w: 244, h: 591 }, surface: { x: 0, y: 131, w: 244, h: 320 } }), 'surface bottom edge -271px'],
        ['a node a viewport tall (Orca\'s body rule on the pane attribute)', () => fillVerdict('sidebar', { body: { x: 0, y: 131, w: 244, h: 591 }, node: { x: 0, y: 131, w: 244, h: 768 }, surface: { x: 0, y: 131, w: 244, h: 591 } }), 'node bottom edge +177px'],
        ['no surface box', () => fillVerdict('settings', { body: { x: 0, y: 131, w: 244, h: 300 }, node: { x: 0, y: 131, w: 244, h: 300 }, surface: null }), 'settings: no surface box'],
        ['a part body with no box', () => fillVerdict('sidebar', { body: { x: 0, y: 0, w: 0, h: 0 }, node: null, surface: null }), 'the comparison is blind'],
        // k, the bars measured in the round-2 reproduction (1280x768: the bar 22 px at y=746, the side areas ending there).
        ['control: no bar in the Orca mode, shown in Coding', () => statusBarVerdict(kFixture()), null],
        ['Theia\'s status bar in the Orca mode', () => statusBarVerdict(kFixture({ orca: { hiddenFlag: false, barHeight: 22, splitBottom: 746 } })), 'Theia\'s status bar shows in the Orca mode (22px high'],
        ['a bar hidden by CSS whose row stays reserved', () => statusBarVerdict(kFixture({ orca: { hiddenFlag: true, barHeight: 0, splitBottom: 746 } })), 'the side areas end 22px above the shell\'s bottom edge'],
        ['the Coding control not showing the bar', () => statusBarVerdict(kFixture({ coding: { hiddenFlag: true, barHeight: 0, splitBottom: 768 } })), 'instrument blind'],
        ['no Orca pass measured', () => statusBarVerdict(kFixture().filter(p => p.mode !== 'orca')), 'no Orca pass was measured'],
        // l, the round-2 reproduction: Orca's close left the panel open, no toggle anywhere, Theia's reopen came back empty.
        ['control: the toggle works both ways', () => rightToggleVerdict(lFixture()), null],
        ['Orca\'s close leaves the panel expanded', () => rightToggleVerdict(lFixture({ afterClose: { collapsed: false } })), 'Orca\'s close button: the Theia right panel stayed expanded'],
        ['no toggle while collapsed', () => rightToggleVerdict(lFixture({ afterClose: { toggles: [] } })), 'no Orca toggle is shown to bring it back'],
        ['a toggle away from the top right', () => rightToggleVerdict(lFixture({ afterClose: { toggles: [{ x: 600, y: 300, w: 32, h: 24 }] } })), 'not at the top right of the main area'],
        ['the toggle never clicked', () => rightToggleVerdict(lFixture({ afterToggle: undefined })), 'the Orca toggle: not reached'],
        ['a reopen on another view', () => rightToggleVerdict(lFixture({ afterToggle: { current: 'chat-view' } })), 'opened on chat-view'],
        ['Theia\'s reopen without Orca\'s content', () => rightToggleVerdict(lFixture({ afterTheiaExpand: { closeShown: false } })), 'Theia\'s Toggle Right Panel (expand): the right panel opened without Orca\'s sidebar content'],
        ['a toggle shown in Coding', () => rightToggleVerdict(lFixture({ coding: { toggles: [{ x: 1240, y: 72, w: 32, h: 24 }] } })), 'Coding: 1 Orca right-sidebar toggle'],
        ['no close button to start from', () => rightToggleVerdict(lFixture({ closeBefore: false })), 'blind: Orca\'s own close button'],
        // m, the round-3 reproduction: Browsing -> Orca left the left side at Lumino's 100 px; a drag inside Orca's band
        // landed on Orca's handle and moved nothing; a squeeze went to 100.
        ['control: widths kept, band drags move, squeeze stops at the minimum', () => mRun(), null],
        ['control: the band parser reads Orca\'s sidebar handle', () => (bandFromClasses('group absolute -right-1.5 top-0 z-10 flex h-full w-3 cursor-col-resize').join() === '-6,6' ? [] : ['wrong band']), null],
        ['control: the band parser reads Orca\'s right-sidebar handle', () => (bandFromClasses('absolute top-0 left-0 w-1 h-full cursor-col-resize').join() === '0,4' ? [] : ['wrong band']), null],
        ['a left side at 100 px after a Browsing round trip', () => mRun({ keep: [{ when: 'after a Browsing round trip', before: { left: 320, right: 320 }, after: { left: 100, right: 320 } }] }), 'left panel 100px after a Browsing round trip, 320px before'],
        ['a right side narrowed by web tabs', () => mRun({ keep: [{ when: 'after 3 web tabs from the "+" button', before: { left: 320, right: 320 }, after: { left: 320, right: 244 } }] }), 'right panel 244px after 3 web tabs'],
        ['a side hidden after a round trip', () => mRun({ keep: [{ when: 'after an Organising round trip', before: { left: 320, right: 320 }, after: { left: undefined, right: 320 } }] }), 'left panel: not shown after an Organising round trip'],
        ['no width read at all', () => mRun({ keep: [] }), 'comparison is blind'],
        ['a drag inside Orca\'s band that moved nothing (Orca\'s dead handle)', () => mRun({ drag: d => (d.side === 'left' && d.offset === -5 ? { ...d, after: d.before } : d) }), 'left: a drag started -5px from the panel\'s edge (inside Orca\'s grab band) changed its width by 0px, not 60px'],
        ['a right drag that moved half the distance', () => mRun({ drag: d => (d.side === 'right' && d.offset === 3 ? { ...d, after: d.before + 30 } : d) }), 'right: a drag started +3px from the panel\'s edge (inside Orca\'s grab band) changed its width by 30px'],
        ['no right drag measured', () => mRun({ drag: d => (d.side === 'right' ? null : d) }), 'right: no drag was measured'],
        ['a squeeze to Lumino\'s 100 px', () => mRun({ squeeze: q => (q.side === 'left' ? { ...q, after: 100 } : q) }), 'left panel squeezed to 100px, below Orca\'s minimum 220px'],
        ['a squeeze that never moved the edge', () => mRun({ squeeze: q => (q.side === 'right' ? { ...q, after: q.before } : q) }), 'instrument blind: the squeeze drag did not narrow the right panel'],
        ['the live path awaits holdLiveLock before it launches anything', () => lockWiringFails(NAME, import.meta.url), null],
        // f (harness-live-panels-06): the shown set is compared with the derived set.
        ['control: every derived entry shown', () => pagesVerdict({ derived: PAGES6, shown: PAGES6.map(p => p.view) }), null],
        ['one of six derived entries shown', () => pagesVerdict({ derived: PAGES6, shown: ['tasks'] }), 'automations: the page entry "Automations" that Orca\'s sidebar source derives is not shown'],
        ['control: the entries Orca hides by default may be absent', () => pagesVerdict({ derived: PAGES6, shown: ['tasks', 'automations', 'mobile', 'plugins'], allowed: ['artifacts', 'skills'] }), null],
        ['an entry hidden although Orca shows it by default', () => pagesVerdict({ derived: PAGES6, shown: ['tasks', 'mobile', 'plugins'], allowed: ['artifacts', 'skills'] }), 'automations: the page entry'],
        ['no entry shown', () => pagesVerdict({ derived: PAGES6, shown: [] }), 'blind: none of the 6 derived page entries'],
        ['control: the default-hidden views are read from the source text', () => (hiddenByDefaultViews(NAV_FIXTURE, PAGES6.map(p => p.view)).sort().join() === 'artifacts,skills' ? [] : ['wrong set']), null],
        ['the default-hidden views of the real SidebarNav.tsx include the opt-in entries', () => {
            const rel = join(REPO_ROOT, SRC.nav[0]);
            // The fetched checkout absent is a SKIP (the self-test ends 77); present without this file it is a FAIL, not a pass.
            if (!existsSync(join(REPO_ROOT, 'orca', 'src'))) { selfTestSkips.push('the orca/ checkout is absent, so the real SidebarNav.tsx case did not run; run scripts/fetch-orca.sh'); return []; }
            if (!existsSync(rel)) return [`source moved: ${SRC.nav[0]} is absent from the orca/ checkout`];
            const got = hiddenByDefaultViews(readFileSync(rel, 'utf8'), PAGES6.map(p => p.view));
            return got.includes('artifacts') && got.includes('skills') && !got.includes('automations') ? [] : [`got ${got.join()}`];
        }, null],
        // i (harness-live-panels-14): the control's port must be one Gecko allows; derived from upstream's own list.
        ['control: the banned-port parser reads a gBadPortList', () => (bannedPorts('int16_t gBadPortList[] = {\n    1,      // tcpmux\n    9,      // discard\n    0};').join() === '1,9' ? [] : ['wrong ports']), null],
        ['the old control port 9 against a banned list that holds it', () => portVerdict(9, [1, 7, 9, 11]), 'the control fetches port 9, which Gecko bans'],
        ['control: port 8081 against that list', () => portVerdict(8081, [1, 7, 9, 11]), null],
        ['the control port is not on Gecko\'s banned list (upstream/netwerk/base/nsIOService.cpp)', () => {
            const f = join(REPO_ROOT, BANNED_PORTS_REL);
            if (!existsSync(f)) { selfTestSkips.push(`${BANNED_PORTS_REL} is absent, so the control port was not checked against Gecko's banned list; run scripts/fetch-upstream.sh`); return []; }
            const ports = bannedPorts(readFileSync(f, 'utf8'));
            if (!ports.includes(9) || ports.length < 20) return [`the banned list could not be read from ${BANNED_PORTS_REL} (${ports.length} ports)`];
            return portVerdict(LITERAL_PORT, ports);
        }, null],
        // i (harness-live-panels-14): an IP-literal or proxied destination is seen through the socket log.
        ['control: the literal control connection seen, loopback and a name-explained address ignored', () => literalVerdict(literalDestinations(SOCKET_LOG(['192.0.2.1', '127.0.0.1', '104.18.1.1', '::1']))), null],
        ['a hard-coded callout to 203.0.113.9', () => literalVerdict(literalDestinations(SOCKET_LOG(['192.0.2.1', '203.0.113.9']))), 'a connection to the IP-literal address 203.0.113.9'],
        ['the control connection absent from the socket log', () => literalVerdict(literalDestinations(SOCKET_LOG(['104.18.1.1']))), 'collector blind: the control connection to 192.0.2.1'],
        ['an IPv6 literal callout', () => literalVerdict(literalDestinations(SOCKET_LOG(['192.0.2.1', '2001:db8::1']))), 'IP-literal address 2001:db8::1'],
        // m (harness-live-panels-04): the tab-adding collector run against fake pages; zero or short tab counts are red.
        ['control: three web tabs added', () => mRun(), null],
        ['no web tab added (the "+" button not found)', () => mRun({ keep: [{ when: 'after 3 web tabs from the "+" button', before: { left: 320, right: 320 }, after: { left: 320, right: 320 }, tabs: { added: 0, expected: WEB_TABS } }] }), 'instrument blind: only 0 of 3 web tabs were added after 3 web tabs'],
        ['two of three web tabs added', () => mRun({ keep: [{ when: 'after 3 web tabs from the "+" button', before: { left: 320, right: 320 }, after: { left: 320, right: 320 }, tabs: { added: 2, expected: WEB_TABS } }] }), 'only 2 of 3 web tabs'],
        // m (harness-live-panels-05): a squeeze clamped above Orca's minimum.
        ['a squeeze clamped at 300 px (Orca\'s minimum is 220)', () => mRun({ squeeze: q => (q.side === 'left' ? { ...q, after: 300 } : q) }), 'left panel squeezed only to 300px, above Orca\'s minimum 220px'],
        ['control: a squeeze within the tolerance of the minimum', () => mRun({ squeeze: q => (q.side === 'left' ? { ...q, after: 220 + WIDTH_TOLERANCE } : q) }), null],
        // The collector itself: a "+" button that is missing, or clicks that add nothing, must read as zero tabs and go red.
        ['control: the tab collector counts three added tabs', () => tabRun(fakeTabPage({})), null],
        ['the tab collector against a page with no "+" button', () => tabRun(fakeTabPage({ button: false })), 'only 0 of 3 web tabs'],
        ['the tab collector against clicks that add no tab', () => tabRun(fakeTabPage({ addUntil: 0 })), 'only 0 of 3 web tabs'],
        ['the tab collector against clicks that stop adding after one', () => tabRun(fakeTabPage({ addUntil: 1 })), 'only 1 of 3 web tabs'],
        ['Orca\'s minimum not derived', () => mRun({ min: { left: 220, right: null } }), 'right: Orca\'s minimum width was not derived'],
    ];
    let failures = 0;
    for (const [name, run, naming] of cases) {
        const fails = await run();
        const text = fails.join('\n');
        if (naming === null ? fails.length : !text.includes(naming)) {
            console.error(`  FAIL ${name} -> ${naming === null ? `control red: ${text}` : fails.length ? `red, but not naming '${naming}': ${text}` : 'stayed green'}`);
            failures++;
        } else console.log(`  ok ${name} -> ${naming === null ? 'green' : `red, naming '${naming}'`}`);
    }
    const plants = cases.filter(c => c[2] !== null).length;
    if (failures) { console.error(`${NAME} self-test: FAIL -- ${failures} case(s) wrong`); return 1; }
    if (selfTestSkips.length) {
        console.log(`${NAME} self-test: ${plants} planted faults each went red naming the drift; ${cases.length - plants} controls green; ${selfTestSkips.length} case(s) did not run`);
        console.log(skipLine(NAME, selfTestSkips.join('; ')));
        return SKIP_EXIT;
    }
    console.log(`${NAME} self-test: PASS -- ${plants} planted faults each went red naming the drift; ${cases.length - plants} controls green`);
    return 0;
}

const isEntryPoint = (() => {
    try { return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();
if (isEntryPoint) {
    const args = process.argv.slice(2);
    if (args.length > 1 || (args.length === 1 && args[0] !== '--self-test')) {
        console.error(`${NAME}: unknown argument ${args[0] === '--self-test' ? args[1] : args[0]}`);
        console.error(`Usage: node ${SELF_REL} [--self-test]`);
        console.error('Next step: run it with no argument, or with --self-test.');
        process.exit(2);
    }
    process.exit(args[0] === '--self-test' ? await selfTest() : await live());
}
