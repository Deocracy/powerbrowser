---
phase: 65-orca-workspace-in-theia
plan: 05
status: complete
subsystem: phase coordinator (merge, build, live proofs, egress, brand rows, tracking)
tags: [orca, coordinator, TAB-05, TAB-07, TAB-08, TAB-09, TAB-04, live-proofs, egress, brand-rows]
requires:
  - "lanes p65-01 (50b6fb78), p65-02 (c6d2e976), p65-03 (43a32b95), p65-04 (2ae7f8fc), each SUMMARY committed"
  - "prelaunch reconciliation fd1062aa and the 65-04 tab-group amendment 29e2021e"
provides:
  - "Phase 65 merged into ServerDestroyer/v1.7-Orca-integration, built and proven live"
  - "TAB-05, TAB-07, TAB-08 and TAB-09 complete on recorded PASS lines"
  - "orca-pane-entry clause (k): every app-root dialog the pane bundle opens is hosted"
  - "measured egress rows t1/t2/t3.gstatic.com (user-initiated) and re-measured Orca-family brand rows"
affects: [66, 67, 68, end-of-milestone pass]
tech-stack:
  added: []
  patterns:
    - "a live row's first run on the merged tree treated as a measurement: each red traced to harness or product, fixed at its root, never by loosening a clause"
    - "egress split at a resolved user-action marker host: later hosts take the user-action verdict"
    - "brand rows measured by the scanner's own matcher with the family rows' only_in lifted"
key-files:
  created:
    - .planning/workstreams/orca/phases/65-orca-workspace-in-theia/65-05-SUMMARY.md
  modified:
    - orca-overlay/files/src/renderer/src/pb/pb-pane-mount.tsx
    - theia/extensions/modes/src/browser/mode-service.ts
    - theia/extensions/modes/src/browser/setups-service.ts
    - theia/extensions/orca-workspace/src/browser/orca-editor-routes.ts
    - theia/extensions/orca-workspace/package.json
    - scripts/verify-orca-pane-entry.mjs
    - scripts/verify-orca-workspace-live.mjs
    - scripts/verify-orca-side-panel-live.mjs
    - scripts/verify-orca-add-project-live.mjs
    - scripts/verify-orca-relaunch-restore-live.mjs
    - scripts/verify-orca-tabs-live.mjs
    - scripts/verify-backend-env-readers.mjs
    - scripts/verify-platform.sh
    - powerbrowser/endpoint-allowlist.json
    - inventory/brand-tokens.json
    - .planning/workstreams/orca/ROADMAP.md
    - .planning/workstreams/orca/REQUIREMENTS.md
    - .planning/workstreams/orca/STATE.md
decisions:
  - "Research A5 was false: a first visit to a mode only adds side views, so activateMode detaches the views another shipped mode's row alone docks (the Orca containers), the way stock detaches strays; Coding's own views (the stock IDE layout) stay"
  - "Orca's web client keeps experimentalOrchestrationPanel in its own localStorage store (not runtime-backed), so the hosted switch is judged there, as in stock Orca's web client"
  - "Setups address a diff editor by its diff: URI, and the orca-workspace router waits for the session restore and reveals an already-open editor or diff instead of opening a second"
  - "Hosted Orca surfaces get every AppRootSurfaces modal a module of the bundle opens (13), derived by orca-pane-entry clause (k); workspace-cleanup and feature-tips are not opened by any bundle module and are not hosted"
  - "Egress from Orca's side panel: Google's favicon redirect hosts t1/t2/t3.gstatic.com are user-initiated (first resolved after the Orca mode was selected); one row per measured host, t0 unmeasured and unlisted"
metrics:
  duration: "about 5 h"
  completed: 2026-11-11
estimate:
  tokens: 170000
  tasks: 3
actuals:
  tokens: 51300  # chars/4 over the coordinator diff bb6a64bd..ffc48715 (205336 chars); lanes not included
  tasks: 3
  commits: 34  # git rev-list --count 29e2021e..ffc48715: 4 merges, 15 lane commits, 15 coordinator commits (19 first-parent); the SUMMARY/tracking commit follows
plan_head_before: 29e2021ef4d87ffc43c8111d0eefd8f7640b3673
plan_head_after: ffc487155e5c54750cbe0c69890d182b083d9dec
requirements-completed: [TAB-05, TAB-07, TAB-08, TAB-09]
---

# Phase 65 Plan 05: Phase 65 coordinator Summary

The four Phase 65 lanes are merged, Orca and Theia rebuilt, and Orca's workspace is proven live in PowerBrowser's
Theia on the merged tree: Orca files, diffs and conflicts open in Theia's editors with worktrees as workspace folders;
Orca's sidebar, Settings, Agents panel and right sidebar live in the Orca mode's side panels; Orca's own Add-project
flow adds and removes a project; and a relaunch restores a Setup's Orca tabs connected with no offer in any sink.
Every live row was red on its first merged-tree run; each red was traced and fixed at its root (harness or product),
recorded below. TAB-05, TAB-07, TAB-08 and TAB-09 are complete. TAB-04 stays pending: stage g2 passes, g3 does not.

Task 2: not reached. No lane SUMMARY carried a BLOCKER or GATE-FAIL line; every side-panel kind mounted under
Route A; the only new egress hosts were first resolved after a user action; Orca tab ids survived the relaunch
(identity and not-gone PASS).

## Prelaunch reconciliation

Run at 26f72bff before the lanes launched and committed at fd1062aa (65-PATTERNS.md "Prelaunch reconciliation";
copied here as the plan intended).

**Step (1), Phase 64 merged:** the four `merge(64-05): lane p64-0N` commits 277cceb6, 0ce4107e, d1d04e4b and
36527207; the coordinator SUMMARY at b775f938 and the 64-06 gap closure ending at 26f72bff;
`scripts/verify-platform.sh --only orca-pane-routes` PASS.

**Step (2), names.** Every C64 path, export, constant and row label was checked; every Phase 64 path in the four lane
plans' files_modified exists under its planned name, so no path substitution was needed. Differences against the
Phase 64 plans as revised at 04d37a87, each replaced in the lane plans:

| Row | Planned (04d37a87) | Merged (26f72bff) |
|---|---|---|
| C64-1 `state()` | `worktrees` a count | `worktrees` is `[{ id, label, path }]` in Orca's empty-query order (C3', 64-06) |
| C64-1 `bootstrap` | parses the offer handed off | reads the offer from orcad's web-client URL; wraps the runtime-environment subscribe against the mirror freeze; terminal-first and released Ctrl+[ / Ctrl+] in memory (D-32); once per document |
| C64-1 `openPane` | conflict-review detail = path | the path is recorded as `both_modified`; B-10 and C3-65 gain a JSON `{ relativePath, conflictKind }` detail |
| C64-1 build | `build-orca.sh` (also `--panes-only`) | the standalone variant is built only by `build-orca-panes.sh --standalone` |
| C64-2 package | after modes, chrome-bar, orca-agents | the same and before bundled-extensions; observer target literals `'hosted-pane'`, `'pending'`; last bind `OrcaTerminalKeybindings` |
| C64-3 `planPanes` | `planPanes(state, records)` | `PlanState { known, restored, loggedPending? }`; places only at creation |
| C64-4 widget | mounts on first show | also mounts on attach when attached visible (1f46dba0) |
| C64-5 offer | web-pairing holds the offer | web-pairing holds orcad's web-client URL; data-root, web-pairing and panes-dir files removed before orcad is signalled |
| C64-6 commands | command palette only | with no active worktree a quick pick of `state().worktrees` (P64-37) |
| C64-7 rows | the split driver in orca-tabs-live.mjs | the CLI's `terminal split` in stage (e); `withOrcaTabsSession({ agent })`; Orca's pinned web client as second client; `C3_EXPORTS` hand-kept |
| C64-8 modes | the orca descriptor and rules row | the descriptor carries `chromeOptions.collapseAreas ['left','right','bottom']`; quick anchor line 3999, full `)` line 6659 |

Confirmed unchanged: `mintName` and `planPanes` exported; the observer's `.target` literals; `OrcaPaneOpenHandler`
(canHandle 1000) in `orca-panes-frontend-module.ts`; the boot-handle key and event; `OrcaPaneBundleApi` matches
`Orca<letters>BundleApi`. Plan fixes not caused by Phase 64: 65-04's `restoreDock` line ranges; the restore opener is
folded into `orca-pane-name-map.ts`. The owner-requested drag-driven g2 was superseded after 64-TAB-GROUPS.md by
P65-33..P65-38 (29e2021e).

## Lanes

| Lane | Branch (full ref) | Head | Scope check (derived) |
|---|---|---|---|
| p65-01 | refs/heads/ServerDestroyer/p65-01 | 50b6fb78 | 9 changed, all in files_modified; no BLOCKER/GATE-FAIL |
| p65-02 | refs/heads/ServerDestroyer/p65-02 | c6d2e976 | 15 changed, all in files_modified |
| p65-03 | refs/heads/ServerDestroyer/p65-03 | 43a32b95 | 14 changed, all in files_modified |
| p65-04 | refs/heads/ServerDestroyer/p65-04 | 2ae7f8fc | 15 changed, all in files_modified |

The scope check read each lane plan's frontmatter files_modified, added any "Path substitution:" line of its SUMMARY
(none), and compared `git diff --name-only $(git merge-base HEAD <ref>)..<ref>`.

## Pre-merge baseline

Pre-merge commit 29e2021ef4d87ffc43c8111d0eefd8f7640b3673.
`nix develop .#theia --command scripts/verify-platform.sh --quick` on it: exit 0, `verify-platform: PASS -- all checks
passed`. Red rows: none.

## Merge commits

| Order | Commit | Conflicts and resolution |
|---|---|---|
| 1 | f4e050cc merge p65-01 | none; `orca-overlay` PASS |
| 2 | d5b71a7b merge p65-02 | none; orca-editor-routes (+ self-test), orca-git-spec-self-test, orca-workspace-live-self-test PASS |
| 3 | 45430c09 merge p65-03 | verify-platform.sh at both anchors: kept 65-02's block then 65-03's, byte for byte; orca-no-pb-add-project (+ self-test), orca-side-panel-live-self-test, orca-add-project-live-self-test, gui07-mode-toggle-commands PASS |
| 4 | bb6a64bd merge p65-04 | verify-platform.sh (65-04 block last at both anchors) and orca-panes-frontend-module.ts (import lines and the `// NEW (65-03)` then `// NEW (65-04)` blocks), byte for byte; orca-offer-scan-self-test, orca-relaunch-restore-live-self-test, orca-pane-routes (+ self-test), orca-tabs-live-self-test PASS; orca-editor-routes ran its TopLevelView clause (no SKIP) |

p65-01 and p65-04 were merged in the same pass. `grep -n '# NEW (65-0' scripts/verify-platform.sh` lists 65-02, 65-03,
65-04 at the quick anchor (3999, 4013, 4022) and again at the full anchor (6688, 6693, 6700).
`grep -c '// NEW (65-03)\|// NEW (65-04)'` on the frontend module prints 3, not the plan's 2: lane p65-04 also marked
its import line `// NEW (65-04)`.

## Fix commits

Each quotes the failing line. Files outside the lanes' files_modified are marked (outside); the caller's brief named
them.

1. **38ddba56** `scripts/verify-backend-env-readers.mjs` (outside; not ledger-locked: no ledger test_ref names it).
   Failing: `UNGATED ENV TOUCHER: theia/extensions/orca-workspace/src/node/orca-workspace-backend-module.ts reads the
   live process environment but is not on EXPECTED_ENV_TOUCHERS`. Added 65-02's exact row.
2. **ba87524a** `pb-pane-mount.tsx`, `verify-orca-pane-entry.mjs` (lane 01). The hosted Sidebar's triggers set
   `activeModal` for dialogs only AppRootSurfaces hosts. The services root now hosts every AppRootSurfaces modal a
   module of the bundle graph opens: new-workspace-composer, agent-session-history, node-dist-mirror, diagram-viewer,
   quick-open, worktree-palette, setup-guide, feature-wall, delete-worktree, preserved-branch-review, beside the
   Add-project family (13 in all). workspace-cleanup and feature-tips are opened by no bundle module (status bar,
   scan toast, onboarding) and are not hosted. New clause (k): `root dialog not hosted (D-18): <id>, opened in
   <module>`, with four plants (unhosted, lazily mounted, source moved, parser blind). The graph stays free of
   EditorPanel/EditorContent (clause h).
3. **9b1dc321** `verify-orca-tabs-live.mjs` (lane 04). `.replace(/\s+/g, ' ')` inside the page template reached the
   page as `/s+/g`; now `\\s`. A scan of every backtick page script in the Orca live rows finds no other
   single-backslash escape. (The brief named `scripts/lib/orca-tabs-live.mjs`; the line is in the verify script.)
4. **ee05cfbe** `verify-orca-relaunch-restore-live.mjs` (lane 04). The `no-input` clause judged the harness's own
   input log (CLAUDE.md verification rule 1). No product-side input observation exists, so the clause, its
   comparator, plants and log were removed; launch 2 still performs only reads until `connected()`, and "no user
   step" rests on `connected()` (session-only pairing reached with no input) and `pairing-ui` (detector first).
5. **c58d7625** ROADMAP Phase 64 criterion 2 re-worded to TAB-04's tab-group clause (64-TAB-GROUPS.md, P65-37).
6. **ac987f8d** `verify-orca-workspace-live.mjs` (lane 02). First run: `orca-workspace-live: FAIL -- harness: the
   Orca CLI call 'file open-changed' failed`, then `(b) openPane diff failed: ... a branch diff needs baseRef`,
   `(b) diff:unstaged a.txt: no Theia diff editor with the CA-03 sides`, `(b) both_modified conflict.txt opened no
   Theia merge editor`, `(c) blind detector`, `(d) dirty editor closed`. Causes, all harness: headless orcad refuses
   `open-changed` (unstaged and staged now drive through `openPane('diff')`); the branch diff needs an explicit
   `baseRef` (Orca's default comes from a source-control compare that never ran); the worktree is selected first so
   the combined diff snapshots a loaded git status; the probe classified diff editors by `getResourceUri()`, the
   modified side (now the editor's own `diff:` URI); the fixture's side commit lacked `-a`, so no both_modified
   conflict existed; the merge editor is read before the next conflict replaces Orca's single Conflict Review tab;
   (c) reads the shown editor and opens a hosted terminal so the absence scan has a pane root (zero roots now red);
   (d) Theia's browser default `files.autoSave: afterDelay` saved the dirty fixture clean before the removal (now
   off for the fixture, reverted before quit). Cleanup: the second created worktree is removed through Orca.
7. **4abedff5** `mode-service.ts`, `verify-orca-side-panel-live.mjs` (lane 03). First run: `a containers: FAIL --
   settings part has no mounted content`, `c setting: FAIL -- orca-data.json not found ...`, `d agents: FAIL`,
   `e worktrees: FAIL`, `f pages: FAIL -- automations: the entry did not open pb-orca:automations ...`,
   `g modes: FAIL -- container powerbrowser-orca-view-container leaked into coding (left area) ...`,
   `i egress: FAIL -- unlisted host t2.gstatic.com`. Product fix (g): research A5 was false; a first visit to a
   mode has no saved perspective layout and stock's `applyViewPlacements` only adds, so `activateMode` now detaches
   the side views another shipped mode's row docks (parent = null, as stock detaches strays); the mode-switch
   invariant gate stays green. Harness fixes: parts expanded before the mount judgement (a collapsed part mounts
   when shown, C64-4); the Theia frame focused (the shell's active widget follows document focus, which the
   automated window lacks); (c) reads the store Orca's web client persists the setting to (derived
   `SETTINGS_STORAGE_KEY`; the setting is not runtime-backed in `web-preferences-store.ts`, and orca-data.json does
   not exist at the pin; settings live in `profiles/<id>/profile-state.db`, which the web client never updates for
   this key) after opening Settings' Experimental section; (i) a user-action marker host is resolved just before
   the Orca mode is selected and later hosts take the user-action verdict (four self-test cases).
8. **73ea33b9, c0408c6d** `powerbrowser/endpoint-allowlist.json`: t2, then t3 and t1.gstatic.com (see Egress).
9. **817dda2e** `verify-orca-add-project-live.mjs` (lane 03). Failing: `standalone add: no server-path step in the
   Add-project dialog`. In a web client the dialog opens on its start step; Browse opens the server-path step with
   Orca's host file browser in front; its Cancel shows the path field. Both labels derived from Orca's source.
10. **cfcfcf5c** `verify-orca-relaunch-restore-live.mjs` (lane 04). Failing: `the Orca CLI call 'file open-changed'
    failed: This Orca server has no app window, so it cannot open files as tabs.` The diff step now uses
    `openPane('diff', ...)` (65-04 merge note 7); the editor-and-diff wait reads each editor widget's own URI
    (TabUriRegistry addresses no editor).
11. **a99dceaf** `orca-editor-routes.ts`, `orca-workspace/package.json` (lane 02), `setups-service.ts` (lane 04).
    Failing: `dock: tab area main.0 holds ["file:///…/README", …] after the restore, [...] when saved`. Product
    cause: Setups addressed a diff editor by `getResourceUri()` (its modified file), so the saved dock held the file
    twice and no diff, and on relaunch the router reopened Orca's restored diff in the active tab area. Setups now
    address a diff editor by its `diff:` URI; the router waits for `SetupsService.sessionRestored` and reveals an
    editor or diff already open in any tab bar by its counter (stock reuses one only in the target tab bar).
    orca-workspace gains the `@powerbrowser/modes` dependency; `theia/yarn.lock` is unchanged under the
    frozen-lockfile install.
12. **57aa1658** `mode-service.ts` (lane 03). Failing: `verify-uri-roundtrip: FAIL view:explorer-view-container --
    widget.isAttached stayed false for 3000ms`. Fix 7's detach also took Coding's Explorer out of Browsing; Coding's
    row views (the stock IDE layout's own) are now spared.
13. **102b9367** `verify-orca-tabs-live.mjs` (lane 04). Failing: `other-views: FAIL -- conflict-review: merge editor
    not opened`, `tab-groups-cross-client: FAIL -- the second client shows no tab for T`, `reload: FAIL -- reload:
    the Lumino tab bars changed across the reload`. (g) the merge-editor detector read TabUriRegistry, which
    addresses no editor; it reads merge editor widgets now: PASS. (k) Orca's store no longer holds the simulator and
    check-details panes after a reload and PowerBrowser closes their tabs; the bars clause compares the panes the
    store still holds (a pane PB lost or moved while the store kept it still goes red; two self-test cases) and
    names the dropped panes in a note: PASS. (g3) the second client is fronted and T awaited for 8 s by the clock;
    still red (see Still red).
14. **ffc48715** `inventory/brand-tokens.json`: measured brand rows (see Brand rows).

## Build record

- Orca: `nix develop .#orca --command bash scripts/build-orca.sh` with ORCA_* unset, PASS in 29 s; newest log
  `.mozbuild/orca-build/build-20261111T031352Z.log` holds `build-orca: overlay applied` for seams 010, 070 and 080,
  `build-orca: overlay copied` for pb-pane-mount.tsx, pb-session-pairing.ts, pb-side-mounts.tsx, pb-workspace-api.ts
  (and pb-css-scope.mjs, vite.pb-panes.config.ts), and `build-orca: PASS`. `git -C orca status --porcelain
  --untracked-files=no` lists the three declared seam paths (010, 070, 080; Phase 68's seams are on the base, as lane
  p65-01 recorded). `build-orca-panes.sh --standalone` PASS (1303 files); the Orca CLI built with
  `ORCA_CLI_BUILD_COMPILER=tsrs node config/scripts/build-cli.mjs`.
- Theia inside `nix develop .#theia`: `yarn install --ignore-scripts --frozen-lockfile`, the drivelist rebuild,
  `yarn build`; `git diff --quiet -- theia/yarn.lock` holds; `src-gen/frontend/index.js` and
  `src-gen/backend/server.js` name orca-workspace; build:extensions orders modes (11), orca-panes (17),
  orca-workspace (19). Rebuilt after each product fix (modes, orca-panes, orca-workspace, then the app); the audited
  install re-run after the orca-workspace dependency, yarn.lock unchanged.
- PowerBrowser: no powerbrowser/ file changed since the pre-merge commit; `./mach build faster` run anyway as the
  brief asked (exit 0, 2.3 s); the live harnesses set `MOZ_PURGE_CACHES=1`.

## Live and full rows

Every row ran under `flock /home/chris/coding/Power-Browser/.git/pb-live.lock` with every inherited ORCA_* unset, in
the plan's order, orca-pane-css-live first. Nothing printed holds orcad's ready line, a pairing URL, an offer or a
token. Final lines:

- `orca-pane-css-live: PASS -- real-widget mode; Theia 0 of 217 and pane 0 of 126 values changed with both controls registered; portal probe 0 of 72; Orca's <html> writes (1 class(es), 2 custom propert(y/ies)) read by no Theia rule; side-panel and Add-project dialog probes 0 changed with their controls registered`
- `orca-pane-standalone-live: PASS -- isolated per-leaf mount, 3 hosted type(s) mounted, late CLI terminal in 2 ms, mount gate 13 gate kind(s) x 2 route(s) [standalone, route-a], 26 row(s) mounted, 4 empty by Orca's own state, controls recorded`
- `orca-workspace-live: PASS -- clauses e, a, b (5 diff sources, a merge and a one-sided conflict), c, d and f` (notes: 1 Orca pane root scanned; 1 PB-owned root compared with the store's local worktrees). files.open driver: `orca file open` (the CLI's files.open) for (a) and the root-sync files; every diff and conflict through the bundle's check-only `openPane`.
- `orca-side-panel-live: PASS -- 9 clauses` (a containers, b rows 2 repositories and 2 worktrees equal the CLI lists, c the hosted switch round-tripped through Orca's web settings store, d agents part within 2 s both ways, e worktree click, f 3 page entries opened/closed/reopened, g no container in Coding or Browsing, h registry, i `control and user-action marker seen; 3 host(s) pass the unattended verdict, 2 first resolved after the Orca mode was selected pass the user-action verdict`)
- `orca-add-project-live: PASS -- after-add lists equal (2 repositories, scratch repository present), after-remove lists equal (1, scratch repository gone); PB-owned root added and removed`
- `orca-offer-scan: PASS -- 2 sinks and 1 origin(s) read; no needle of the launch's offer found; marker found; no orca.web.runtimeEnvironment.v1`
- `orca-relaunch-restore-live: PASS -- dock, modes, chat, terminals, identity, pairing-ui, not-gone, devices, offer-scan` (both origins' markers found, runtime key absent; sinks setups.json and powerbrowser-shell-state.json 0 matches)
- `verify-uri-roundtrip: 34/34 rows PASS`
- `gui07-mode-switch-tabs-live: PASS`
- `orca-tabs-live: FAIL -- tab-groups-cross-client` (every other stage PASS: terminal-user, terminal-cli, terminal-agent, freeze-guard, split, pb-split, chat, other-views, tab-groups (g2), organising, no-tab-chrome, close, reload (k), route, offer; prompts sent 0 of 1)
- Phase 63/64/68 rows on shared files: `orca-service-live: PASS`, `orca-hidden-electron: PASS`, `orca-agent-hooks: PASS`, `bundled-extensions-live: PASS`, `orca-terminal-keys-live: PASS -- D-32 control in t<n> and the web tab; stage 2 PASS`
- Full rows: `orca-pane-entry: PASS -- ... 8659 module(s) in the bundle graph, no EditorPanel or EditorContent; 13 app-root dialog(s) the bundle opens all hosted; setWebDeviceKeySupportForTests exported at the pin; consumer API OrcaSidePanelBundleApi, OrcaPaneBundleApi, OrcaWorkspaceBundleApi covered` (the consumer-API clause compared, no SKIP), `orca-overlay-built: PASS -- 6 overlay file(s)`, `orca-build-shape: PASS`, `diff-theia-core: PASS -- zero changes inside @theia/*`, `verify-endpoints: PASS`, `verify-branding-identity-dev: PASS`

## Egress

Measured by orca-side-panel-live (MOZ_LOG nsHostResolver, parent log order) with the Orca panels open. Hosts first
resolved after the user-action marker (just before the Orca mode is selected): `www.google.com` (already `allow`,
D-86) and one of `t1`, `t2`, `t3.gstatic.com` per run. Source: Orca's agent and repository icons load
`https://www.google.com/s2/favicons?...` (`orca/src/renderer/src/lib/agent-catalog.tsx`, `orca/src/shared/repo-icon.ts`),
which redirects to a `tN.gstatic.com` host. Rows added, disposition `user-initiated`, one per measured host:
t1.gstatic.com, t2.gstatic.com, t3.gstatic.com. `generate.mjs` re-run (generated/ unchanged); theia-endpoints,
privacy-hosts, generated-byte-identity, allowlist-schema PASS. No host was resolved unattended at launch, so no
owner decision was needed (Task 2 not reached). t0.gstatic.com was not measured and is not listed; a run that draws
it goes red naming it.

## Brand rows changed

Measured with `scan-brand-residue.mjs`'s own matcher (each Orca-family coincidental row's only_in lifted, the scan
run on the staged merged tree, counts and files read back); no new exclude entry. `node scripts/scan-brand-residue.mjs`
and `--self-test` exit 0 (`PASS -- no residual brand occurrence in 791 scanned file(s)`).

| Row | Old | New | Files |
|---|---|---|---|
| Orca (title) | 1591 | 2108 | 115 -> 137 (the three new overlay files, orca-workspace's six sources, the side-panel and restore sources, mode-service.ts, the new and changed live scripts) |
| orca (lower) | 3582 | 4199 | 117 -> 142 (as above plus orca-workspace/package.json, view-factory-table.ts, setups-service.ts, verify-backend-env-readers.mjs) |
| ORCA (upper) | 682 | 846 | 78 -> 94 |
| orcad (lower) | 1184 | 1218 | 79 -> 87 |
| withOrca (literal) | 21 | 27 | 9 -> 14 |
| pbOrca (literal) | 15 | 24 | 3 -> 5 |
| PbOrca (literal) | 8 | 10 | 3 -> 5 |
| needOrca (literal) | 10 | 13 | 3 -> 6 |
| bindOrca (literal, new) | - | 6 | 3 (bindOrcaSidePanel, bindOrcaRestore) |
| resolveOrca (literal, new) | - | 4 | 1 (resolveOrcaImport in orca-pane-harness.mjs) |
| -PLAN.md (frozen) | 67 | 68 | + pb-workspace-api.ts |

## --quick against the baseline

`nix develop .#theia --command scripts/verify-platform.sh --quick` on ffc48715 with ORCA_* unset: exit 0,
`verify-platform: PASS -- all checks passed`, 385 rows PASS (baseline 375; the ten new Phase 65 quick rows). Red
rows: none, matching the baseline. shell-error-copy-no-internals, gui04-registry-shape, gui07-mode-toggle-commands,
backend-env-readers, orca-pane-entry-self-test and scan-brand-residue are among the PASS rows.

## Tracking

- ROADMAP: Phase 65 plan list (Wave 1 lanes 65-01..65-04, Wave 2 coordinator 65-05) and progress row through
  `roadmap.update-plan-progress 65 --ws orca`; Phase 64 criterion 2 re-worded (c58d7625).
- REQUIREMENTS: TAB-05 (orca-workspace-live), TAB-07 (orca-side-panel-live, orca-pane-css-live), TAB-08
  (orca-offer-scan, orca-relaunch-restore-live), TAB-09 (orca-add-project-live, orca-no-pb-add-project) marked
  complete through `requirements.mark-complete --ws orca`. TAB-04 stays pending: g2 PASS, g3 red.
- STATE.md: decisions P65-06, P65-09, P65-17, P65-18 and this plan's A5/egress/Setups findings; the owner items;
  the Deferred Verification row for Phase 65. No `state.advance-plan`, no `phase complete` (verify-work follows).
- WINDOWS.md untouched (no live row re-dated). Ledger untouched. Nothing pushed.

## Still red

`orca-tabs-live` stage g3 (tab-groups-cross-client):
`orca-tabs-live: tab-groups-cross-client: FAIL -- tab-groups-cross-client: the second client shows no tab for T (web-terminal-8fa299ad-…) (menu ["web-terminal-32d9dfc6-…", … 5 terminals and 2 chats])`.
Orca's pinned web client, opened as the second client at stage (f), keeps showing the 7 tabs that existed when it
paired and never shows T, which the CLI created later, even fronted and awaited for 8 s. The likely cause is the
pinned host's navigation-echo freeze (64-MIRROR-FREEZE.md): PowerBrowser's hosted client works around it in its own
document (`staleNavigationEchoes`), but a stock second client has no such workaround and drops later host frames.
Not proven; TAB-04 stays pending. Next step: a g3 drive that opens (or reloads and re-pairs) the second client after
T exists, or a second client that receives host frames; decide in the end-of-milestone pass.

## Deferred Verification

From 65-CONTEXT's table, for the end-of-milestone pass (D-18; no human check ran in this phase):

| Item | State |
|---|---|
| P65-01 check-details read as an Orca-only view (CheckRunDetailsPanel alone, no Theia editor) | owner reading |
| P65-09 Settings in the left side panel: Orca's Settings needs 660 px for no horizontal overflow (lane p65-01's measurement), wider than a typical side panel; alternative a main-area `pb-orca:settings` tab | owner decision |
| CA-07 each paired launch leaves one used runtime token row in orca-devices.json (orca-relaunch-restore-live devices PASS asserts exactly one) | to Phase 67 |
| P65-06 the fixed workspace file `<profile>/powerbrowser-theia/workspaces/powerbrowser.theia-workspace`, and its path in the Theia document URL fragment | to Phase 67 (copyable-surface list) |
| P65-17 session-only pairing through Orca's plain export `setWebDeviceKeySupportForTests`; alternative a declared seam | owner decision |
| Populated orchestration and creation surfaces (both mounted empty by Orca's own state) | unproven live |
| TAB-04 g3 cross-client guard | red, see Still red |
| Egress when launching straight into the Orca mode: the sidebar renders at launch, so the favicon hosts may then be contacted without a click; `www.google.com`'s `allow` reason names Widevine, not Orca | owner decision |
| Orca's store drops the simulator and check-details panes on a frontend reload (orca-tabs-live note); whether stock Orca's web client does the same was not checked | owner look |
| Cleanup: earlier orca-workspace-live runs left worktree directories under the host's `~/orca/workspaces/repo/` (Orca's default workspaceDir); the row now removes both worktrees it creates, but the leftovers need removing by hand (recursive delete outside the project is blocked for this agent) | owner action |

## Deferred ideas carried

- Remote-host worktrees.
- Orca editor features without a Theia equivalent.
- The editor and telemetry Settings divergences.
- Resume offer: delivered (lane p65-01 hosts NativeChatResumeOnRestartModal; no "not delivered" line).

## Corrections for later phases

- Phase 67 RUN-07 extends `scripts/lib/orca-offer-scan.mjs` (append sinks or collectors; no second scanner).
- Phase 67 RUN-06's failure state covers the side-panel views.
- The Theia document URL's workspace-file fragment joins Phase 67's copyable-surface list.
- Phase 66 launches its lanes only after this plan's merges and SUMMARY are committed (order 64, 65, 66), may add
  views to the two containers, and edits pb-pane-mount.tsx, orca-pane-routes.ts, orca-pane-observer.ts,
  orca-panes/package.json, theia/package.json and the browser app's package.json on top of Phase 65's lines (66-06
  merge rule (6); build:extensions then reads modes, ..., orca-browser, orca-panes, orca-workspace). Phase 66 also
  rebases on this plan's product fixes in mode-service.ts (detachOtherModesViews), setups-service.ts (diff tab
  addressing) and orca-editor-routes.ts (session wait, reveal by counter).
- Any new hosted surface that opens an AppRootSurfaces modal is caught by orca-pane-entry clause (k).
- A live row that judges the shell's active widget must focus the Theia frame first; a row that reads editors must
  read the widgets (TabUriRegistry addresses no editor).

## Deviations from Plan

- **[Rule 1 - Bug]** Every live row's first merged-tree red, fixed at its root (fix commits 6, 7, 9-13). Two were
  product defects found by the rows: Orca containers leaking into other modes (A5) and duplicate editor/diff tabs
  after a relaunch restore.
- **[Rule 2 - Correctness]** orca-workspace-live (c) now requires a pane root to scan, and its cleanup removes the
  worktrees it creates.
- **[Scope]** Two fix commits touch files outside the lanes' files_modified, both named in the brief:
  `scripts/verify-backend-env-readers.mjs` (fix 1) and `powerbrowser/endpoint-allowlist.json` (plan-owned).
  Fix 2 and fix 11 each touch two lane files in one commit, not one.
- **[Clause change]** orca-relaunch-restore-live's `no-input` clause was removed (rule 1); orca-tabs-live (k) compares
  bars over store-held panes. Neither loses detection of a PowerBrowser defect; both are recorded for the verifier.
- **[Plan acceptance]** The frontend module's NEW-marker count is 3, not 2 (lane p65-04's marked import line).
- The relaunch, offer-scan and add-project rows were run before the last mode-service narrowing (57aa1658), which
  touches only Coding's Explorer; orca-side-panel-live, verify-uri-roundtrip and gui07-mode-switch-tabs-live were
  re-run after it.

## Self-Check: PASSED

- Commits f4e050cc, d5b71a7b, 45430c09, bb6a64bd (merges) and 38ddba56, ba87524a, 9b1dc321, ee05cfbe, c58d7625,
  ac987f8d, 4abedff5, 73ea33b9, 817dda2e, cfcfcf5c, a99dceaf, 57aa1658, c0408c6d, 102b9367, ffc48715 are ancestors
  of HEAD.
- Logs: .mozbuild/p65-05/ (baseline-quick.log, final-quick.log, live-<row>.log, brand-report.md,
  brand-report-after.md, brand-measure.json, build-orca.out, theia-build.log, mach-faster.log).
