---
phase: 66-powerbrowser-web-tabs-as-orca-s-browser
plan: 07
subsystem: orca-overlay pane entry and browser host, @powerbrowser/orca-browser reveal tracker, checks
tags: [orca, gap-closure, d-34, brw-02, brw-03, store-row, live]
status: complete
requires:
  - 66-06 merged tree (HEAD 85c7895d) and its builds
  - D-34 (Chris 2026-11-11, "Add them from PB's side now")
provides:
  - an Orca store row per PowerBrowser agent page, added in the background when its web tab opens and dropped on closePage or a user close
  - Orca's own selection of that row brings the bound web tab forward (P66-09), with no second widget
  - orca-browser-agent-live PASS with clause (j); BRW-02 and BRW-03 complete
affects: [Phase 67 lanes (inventory/brand-tokens.json rows may need re-measuring at their merge), Phase 68 re-pin (clause 10 derives from the pin)]
tech-stack:
  added: []
  patterns:
    - "the pane entry writes the records createBrowserTab draws, in the staged client-hosted shape stageWebRuntimeBrowserTab stages, without the managed-browser gate"
    - "the browser host reaches the pane bundle through the namespace @powerbrowser/orca-panes stores under ORCA_PANES_MODULE_KEY"
key-files:
  modified:
    - orca-overlay/files/src/renderer/src/pb/pb-pane-mount.tsx
    - orca-overlay/files/src/renderer/src/pb/browser-host/pb-browser-host.ts
    - theia/extensions/orca-browser/src/common/orca-browser-dispatch.ts
    - scripts/verify-orca-browser-entry-points.mjs
    - scripts/verify-orca-browser-abilities.mjs
    - scripts/verify-orca-pane-entry.mjs
    - scripts/lib/orca-pane-harness.mjs
    - scripts/verify-orca-browser-agent-live.mjs
    - scripts/lib/orca-browser-live.mjs
    - inventory/brand-tokens.json
    - .planning/workstreams/orca/DECISIONS.md (D-34)
    - .planning/workstreams/orca/STATE.md, ROADMAP.md, REQUIREMENTS.md
decisions:
  - "D-34 recorded: the pane entry adds each agent page to Orca's store from PowerBrowser's side"
  - "createBrowserTab is not called: its managed-browser gate refuses a paired web client whose runtime lacks screencast; the entry writes the same records with Orca's builders and actions"
  - "The row's handle is staged and client-hosted, so snapshot frames never cull it and Orca's session restore drops it (no duplicate after a reload)"
  - "P66-09 restated: a creation mark ends at the page's first listed record"
  - "Clause (j)'s activation source is Orca's own focusBrowserTabInWorktree on the row: orcad's session snapshot lists no client-hosted page, so no CLI switch reaches a client store (measured)"
metrics:
  duration: about 50 minutes
  completed: 2026-11-11
estimate:
  tokens: 60000
  tasks: 2
actuals:
  tokens: 16000   # chars/4 over the added lines of this plan's diff (about 52,000 chars) plus this file
  tasks: 2
  commits: 3      # git rev-list --count 85c7895d..HEAD with this file's commit
plan_head_before: 85c7895d
plan_head_after: "the commit that adds this file"
---

# Phase 66 Plan 07: Orca store rows for PowerBrowser agent pages (D-34) Summary

Each agent page PowerBrowser's browser host opens now has a background row in the Orca pane client's store,
keyed by its browserPageId. Selecting that row in Orca's store brings the existing PowerBrowser web tab
forward within 16 ms, and the create itself never moves focus. orca-browser-agent-live passes every clause,
(j) included, so BRW-02 and BRW-03 are complete.

## The Orca store actions used

All are Orca's own exports at the pin (1.4.248). No tracked orca/ file is edited and no seam is added
(orca-overlay still reports 3).

| Step | Orca symbol | Source at the pin |
|------|-------------|-------------------|
| page record | `buildBrowserPage` (page id = browserPageId) | store/slices/browser-page-records.ts |
| tab record | `buildWorkspaceFromPage` | store/slices/browser-page-records.ts |
| records written | `browserTabsByWorktree`, `browserPagesByWorkspace`, plus `browserTabOpenView(..., { activate: false })` | what createBrowserTab's drawHere writes (store/slices/browser/browser-tab-actions.ts) |
| handle | `setRemoteBrowserPageHandle(page.id, { environmentId, remotePageId, staged: true, stagedClientHosted: true })` | the handle stageWebRuntimeBrowserTab writes (runtime/web-runtime-browser-tab-staging.ts) |
| unified tab | `createUnifiedTab(worktreeId, 'browser', { entityId, label, executionHostId, activate: false })` | store/slices/tabs/tabs-create-actions.ts |
| removal | `discardStagedWebRuntimeBrowserTab` (handle first, then `closeBrowserTab` with reason `cleanup`, so no second browser.tabClose) | runtime/web-runtime-browser-tab-staging.ts |
| selection (checks only) | `focusBrowserTabInWorktree(worktreeId, browserPageId)`, the store action a `tab switch --focus` ends in on Orca's desktop | store/slices/browser/browser-page-focus-actions.ts |

Why not `createBrowserTab` itself: its `assertManagedBrowserMaterializationAllowed` gate refuses a paired web
client whose runtime lacks the screencast capability. Measured on the first attempt, which used
`stageWebRuntimeBrowserTab` directly: `[web-runtime-session] failed to stage browser tab: Managed browser tabs
are unavailable because the paired runtime does not support browser streaming.` PowerBrowser's orcad has no
browser engine, and the page is PowerBrowser's own, so the gate protects nothing here. The entry writes the
same records the action would write.

Wiring: `pb-browser-host.ts` calls `addBrowserPage` when the frontend reports a completed createPage that names a
workspaceId. It calls `removeBrowserPage` on a completed closePage and in `userClosedPage`. It reaches the bundle
through `globalThis[Symbol.for('powerbrowser.orca-panes.module')]`; when that is absent (the Node probe of
orca-browser-host-bundle) it does nothing. A row failure never touches the command result.

## Measured facts (66-07 probes, scratch sessions under the live lock)

- orcad's `session.tabs.list` for the worktree listed no browser tab after CLI `tab create`, and none after
  `tab switch --page` with or without `--focus`. This held with and without a hosted terminal in the worktree.
  So no CLI switch can reach any client store. This matches Orca's own rule (`BROWSER_TAB_SWITCH_PUBLICATION_RULES`:
  "Registry selection reaches clients only through republished snapshots").
- With the entry's rows: two CLI creates gave two `browser` records carrying their browserPageIds. The first
  was active as the only tab in its group, and the second was inactive. A CLI `tab close` removed its row.
  After a frontend reload the pane list held no row (Orca's restore drops staged rows), and a new create gave
  exactly one row.
- In this session the shell's focus-tracker `currentWidget` stayed null even after `ctx.activate`, because no
  Theia node takes DOM focus (a web tab's page is a chrome overlay). `getCurrentWidget('main')` moved from the
  user tab to the bound agent tab 14 ms after the selection.

## Checks changed (each with plants)

- **orca-browser-entry-points, clause 10 (new).** It derives from the pinned source the store actions
  stageWebRuntimeBrowserTab calls, the handle keys it sets to true, the exported cleanup discard,
  createBrowserTab's builders, spread call, unified-tab action and record keys, and the browser slice action
  whose second parameter is browserPageId. It proves the entry's three functions and the host use them. Plants:
  12, including a renamed pinned handle action, which turns the entry red naming the new name. It prints:
  `orca-browser-entry-points: store row (D-34): addBrowserPage runs buildBrowserPage, buildWorkspaceFromPage, browserTabOpenView, createUnifiedTab, setRemoteBrowserPageHandle with staged, stagedClientHosted; removeBrowserPage runs discardStagedWebRuntimeBrowserTab; selectBrowserPage runs focusBrowserTabInWorktree (derived from the pin)`.
  Self-test: 23 planted faults each went red.
- **orca-browser-abilities trace.**
  - Trace A is restated to D-34: a background row listed inactive and then selected is revealed once.
  - New trace E: a row listed before its createPage and activated by that create is not revealed. The existing
    creation-guard plant is re-anchored on E.
  - New plant: restoring the 66-02 two-list window goes red naming 'trace a store selection after the create
    is revealed'.
  - Self-test: 17 planted faults each went red.
- **orca-pane-entry.** C3_EXPORTS gains `addBrowserPage`, `removeBrowserPage`, `selectBrowserPage` (C3-66).
- **orca-browser-agent-live (j).**
  - Positive read first: the main area's current tab is the user tab.
  - The page's store row is listed and inactive after the create.
  - The activation source is the bundle's `selectBrowserPage`.
  - Then the reveal within 1000 ms, with the web tab count unchanged.
  - `ctx.currentId` reads `getCurrentWidget('main')`.
  - New plants: no store row, a row active at create, a second web tab, and the user tab not current.
  - Self-test: 41 planted faults each went red.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The P66-09 creation window swallowed the first selection.** Found during Task 1 design.
In the 66-02 rule, a noteCreated mark stayed set until a record turned active or stayed inactive for two
lists. PowerBrowser's row emits one inactive list at its create, so the user's first selection would have been
cleared without a reveal. Fix: the mark ends at the page's first listed record. Files:
orca-browser-dispatch.ts and the abilities trace. Commit 44a0dde5.

**2. [Rule 3 - Blocking] orca-pane-entry crashed with `Error: EISDIR: illegal operation on a directory, read`
at `overlayOverrides (scripts/lib/orca-pane-harness.mjs:419)`.** The cause was `pb/browser-host/`, a
subdirectory since 66-01. The full row had not run since then; 66-06 ran only its self-test. Fix: the harness
reads `pb/` recursively. Commit 44a0dde5.

**3. [Rule 1 - Check defect] Clause (j) read the focus tracker.** Its first full run on the rebuilt tree
failed: `orca-browser-agent-live: FAIL -- (j) the store activation revealed nothing within 1000 ms`. The
tracker's `currentWidget` stays null when no Theia node takes DOM focus. The probe showed the reveal happened
(`activateWidget` was called with the bound tab, and the main area's current tab changed). `currentId` now reads
`getCurrentWidget('main')`. A detector-blind guard requires the user tab to be current before the create, so the
clause cannot pass on a null-equals-null reading. Commit 44a0dde5.

**4. [Plan wording] Implementation path.** The task asked for "the exact action WebRuntimeClient's browser path
uses". That action is `createBrowserTab`, reached through `stageWebRuntimeBrowserTab`, and its gate refuses
this client (quoted above). The entry uses the same builders, records, handle and unified-tab action, and the
check names `createBrowserTab` as the one action the entry does not call.

## Builds

- `nix develop .#orca --command bash scripts/build-orca.sh --panes-only` (ORCA_* unset), last run:
  `build-orca-browser-host: PASS -- 308690 bytes` and `build-orca: PASS -- panes only in 9s`.
- Theia, audited: `yarn install --ignore-scripts --frozen-lockfile`, the drivelist node-gyp rebuild, then
  `yarn build`: `[build/browser] Finished with 0 errors`. `theia/yarn.lock` is unchanged.
- No chrome JS changed, so there was no `./mach build`. `git ls-files -- orca` prints nothing.

## Live results (under flock /home/chris/coding/Power-Browser/.git/pb-live.lock, ORCA_* unset, PB_LIVE_LOCK_HELD=1, MOZ_PURGE_CACHES=1)

orca-browser-agent-live, final run (`.mozbuild/p66-07/agent-live-2.txt`):
```
orca-browser-agent-live: clause (k) ok (137 ms)
orca-browser-agent-live: clause (a) ok (133 ms)
orca-browser-agent-live: clause (b) ok
orca-browser-agent-live: clause (b1) ok (DPR 1, 1280x695 px)
orca-browser-agent-live: clause (b2) ok (DPR 2, 1280x622 px)
orca-browser-agent-live: clause (c) ok
orca-browser-agent-live: clause (d) ok
orca-browser-agent-live: clause (e) ok
orca-browser-agent-live: clause (e2) ok (userContextId 6)
orca-browser-agent-live: clause (l) ok
orca-browser-agent-live: clause (m) ok (promptUserAndPass)
orca-browser-agent-live: clause (c2) ok
orca-browser-agent-live: clause (f) ok
orca-browser-agent-live: clause (g) ok (credential device-key, placement client)
orca-browser-agent-live: clause (h) ok
orca-browser-agent-live: clause (j) ok (reveal 16 ms)
orca-browser-agent-live: clause (i) ok
orca-browser-agent-live: PASS -- (k) no-pane create one tab in 137 ms; (a) one background agent tab in 133 ms; (b) goto, click, type, screenshot at DPR 1 and 2; (c) parked focus held; (d) refusals; (e) container; (e2) agent container 6; (l) saved login filled for the user only, no LoginManager actor or capture in the agent tab; (m) HTTP auth (promptUserAndPass) refused to the agent; (c2) typing kept while the parked page called focus(); (f) no decoy; (g) renderer createPage over device-key; (h) user close; (j) reveal in 16 ms after store activation; (i) reload
```

The batch was run in this order (`.mozbuild/p66-07/<row>.txt`):

| Row | Result line |
|-----|-------------|
| orca-pane-css-live | `PASS -- real-widget mode; Theia 0 of 217 and pane 0 of 126 values changed with both controls registered; portal probe 0 of 72; Orca's <html> writes (1 class(es), 2 custom propert(y/ies)) read by no Theia rule; side-panel and Add-project dialog probes 0 changed with their controls registered` |
| orca-pane-standalone-live | `PASS -- isolated per-leaf mount, 3 hosted type(s) mounted, late CLI terminal in 2 ms, mount gate 13 gate kind(s) x 2 route(s) [standalone, route-a], 26 row(s) mounted, 4 empty by Orca's own state, controls recorded` |
| orca-tabs-live | `FAIL -- tab-groups-cross-client`: the stage line is `the second client shows no tab for T`. This is the red recorded before Phase 66 (STATE Phase 65 row, TAB-04, and 66-06). Every other stage passed: terminal-user, terminal-cli, terminal-agent, freeze-guard, split, pb-split, chat, other-views, tab-groups, organising, no-tab-chrome, close, reload, route, offer |
| orca-browser-snapshot-live | `PASS -- 2 fixture(s), 28 ref'd nodes matched; 7 click(s) on refs landed on their nodes; a removed node's ref answered browser_stale_ref` |
| orca-agent-mark-live | `PASS -- mark and title class while driving, cleared after 21000 ms idle, Stop ended control (browser_owner_unavailable in error.message), stock window unmarked with chrome equal to the baseline (286 nodes)` |
| orca-browser-host-bundle | `PASS -- attach accepted, createPage in 153 ms, user close reported, 308690 bytes; static clauses green over 124 modules and 1157 Orca assets (redaction 0 matches)` |

## Quick gate and brand rows

- `nix develop .#theia --command scripts/verify-platform.sh --quick` on the committed tree with the brand rows
  staged: `verify-platform: PASS -- all checks passed`, 398 rows PASS, 0 red (`.mozbuild/p66-07/quick.txt`).
- Brand rows were re-measured with the scanner's own reconciliation over the staged tree. Counts only changed,
  with the same files, no exclude entry and no new row:

| Row | Old | New |
|-----|-----|-----|
| Orca (title, coincidental) | 2305 | 2322 |
| orca (lower, coincidental) | 4740 | 4751 |
| ORCA (upper, coincidental) | 942 | 946 |
| orcad (lower, coincidental) | 1327 | 1330 |

`scan-brand-residue: PASS -- no residual brand occurrence in 817 scanned file(s)`.

## Requirement outcomes

BRW-02: PASS (orca-browser-agent-live, every clause including (j); orca-browser-entry-points)
BRW-03: PASS (orca-browser-agent-live; orca-browser-host-bundle; orca-browser-snapshot-live)

Both were marked complete with `requirements.mark-complete BRW-02 BRW-03 --ws orca`. BRW-04 and BRW-05 were
already complete (66-06).

## Known limits (not stubs)

- The row's title stays "New Tab" (the about:blank title Orca derives): the host's pageMetadata updates orcad,
  not the row. PowerBrowser creates no widget from a browser record, so nothing in PowerBrowser shows it. Orca
  views that list tabs would show "New Tab". This is recorded in the STATE Phase 66 Deferred Verification row.
- The selection export is used by checks only (the P64-10 rule). A user selects a row through Orca's own views.

## Known Stubs

None.

## Threat Flags

None. The host reads one bundle namespace in the same document. The row carries the page id, the worktree id
and about:blank only. No output line here carries the ready line, a pairing URL, the offer, a token or a
password: a grep of agent-live-2.txt for token or pairing assignments found 0 matches.

## Concurrency

Phase 67 lanes 67-01, 67-02 and 67-04 run in their own worktrees. None of their files was touched. Their merge
may need the four brand rows re-measured again, because they count over the whole tree.

## Self-Check: PASSED

- Files: pb-pane-mount.tsx, pb-browser-host.ts, orca-browser-dispatch.ts, verify-orca-browser-entry-points.mjs, 66-07-PLAN.md FOUND.
- Commits: 874335db, 44a0dde5 are ancestors of HEAD.
