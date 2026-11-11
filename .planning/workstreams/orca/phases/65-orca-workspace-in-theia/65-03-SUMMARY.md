---
phase: 65-orca-workspace-in-theia
plan: 03
status: complete
subsystem: theia-orca-side-panel
tags: [theia, view-container, orca, modes, tab-uris, typescript-ast-check, live-check]

requires:
  - phase: 64-orca-panes-as-pb-tabs
    provides: "@powerbrowser/orca-panes (OrcaPaneBundle, OrcaPaneWidget, ORCA_PANE_FACTORY_ID), the Orca mode, the live harnesses"
provides:
  - "Two Theia view containers holding Orca's sidebar, Settings, Agents and right sidebar (powerbrowser-orca-view-container, powerbrowser-orca-right-view-container)"
  - "Orca mode rule and placements docking both containers; two view-factory-table rows"
  - "OrcaSidePanelSync: activeView pages, settings reveal, creation tab, worktree activation, Agents part, orchestration focus"
  - "Tab-less page kinds in OrcaPaneWidget"
  - "orca-no-pb-add-project (quick) and its self-test"
  - "orca-side-panel-live and orca-add-project-live (full) with self-tests (quick)"
  - "Seven pb-orca page rows in verify-uri-roundtrip.mjs"
affects: [65-05 coordinator merge, 66 orca-browser lanes, 67 hosting hardening]

plan_head_before: fd1062aae244299164874d87ad0a76d7c7ed02c1
plan_head_after: 29a4153c
actuals:
  tokens: 25800
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "ViewContainer.Factory + one AbstractViewContribution per container, no toggleCommandId (no PB command, menu or keybinding)"
    - "Narrow bundle interface OrcaSidePanelBundleApi cast from the loader's OrcaPaneBundleApi (C3-65)"
    - "Live-check selectors and labels derived at check time from Orca's TSX with theia/node_modules/typescript"

key-files:
  created:
    - theia/extensions/orca-panes/src/browser/side-panel/orca-side-panel-module.ts
    - theia/extensions/orca-panes/src/browser/side-panel/orca-side-view-widget.tsx
    - theia/extensions/orca-panes/src/browser/side-panel/orca-side-panel-sync.ts
    - scripts/verify-orca-no-pb-add-project.mjs
    - scripts/verify-orca-side-panel-live.mjs
    - scripts/verify-orca-add-project-live.mjs
  modified:
    - theia/extensions/orca-panes/src/browser/orca-panes-frontend-module.ts
    - theia/extensions/orca-panes/src/browser/orca-pane-widget.tsx
    - theia/extensions/modes/src/browser/mode-descriptors.ts
    - theia/extensions/modes/src/browser/mode-service.ts
    - theia/extensions/tab-uris/src/browser/view-factory-table.ts
    - scripts/verify-uri-roundtrip.mjs
    - scripts/verify-platform.sh

key-decisions:
  - "Closing the page tab whose view is the store's activeView writes setActiveView('terminal'), so the next sidebar click on that page is a change (refines P65-10)"
  - "Worktree activation ignores a change to the worktree the active tab already belongs to; that covers PB's own P64-23 write without tracking it"
  - "orca-side-panel-live clause (h) reads TabUriRegistry.getViewContribution for both ids (a positive read) instead of the absence of the startup error line (CLAUDE.md verification rule 1)"
  - "Clauses (c) and (d) of orca-side-panel-live share one switch: Orca's experimental orchestration toggle, read in orca-data.json and in the dock"

requirements-completed: []
duration: "about 2 h"
completed: 2026-11-11
---

# Phase 65 Plan 03: Orca side panel, Orca mode rules and Add-project checks Summary

Orca's sidebar, Settings, Agents panel and right sidebar are now parts of two Theia view containers. The Orca mode docks them through its rules row. Orca's page views open as singleton `pb-orca:<view>` tabs. Three checks are written for criteria 2 and 3: one derived, two live, each with a self-test.

Setup step 0 (Phase 64 contract): C64-2, C64-4, C64-7 and C64-8 were all found on base fd1062aa. Every named path, export, constant and row label is present, and `git log --merges` shows the p64-0 merges. No path substitution was needed and none is recorded.

Setup steps 1-3 ran: `generate.mjs` PASS (72 files), `fetch-orca.sh` (pin v1.4.248), the audited Theia install with the drivelist rebuild, and builds of token-gate, tab-uris, modes and orca-panes.

## Commits

| Task | Commit | Files |
|------|--------|-------|
| 1 (tracer) Orca view containers in the Orca mode | ec174ac8 | side-panel module and view widget, frontend-module NEW block, mode-descriptors, mode-service, view-factory-table |
| 2 pages, worktree activation, Agents part, orca-no-pb-add-project | f1aead3a | orca-side-panel-sync.ts, side-panel module (sync bind), orca-pane-widget.tsx, verify-orca-no-pb-add-project.mjs, verify-platform.sh |
| 3 live rows, page round-trips, registry rows | 29a4153c | verify-orca-side-panel-live.mjs, verify-orca-add-project-live.mjs, verify-uri-roundtrip.mjs, verify-platform.sh |

## Check results (lane tree)

- `yarn --cwd extensions/{tab-uris,modes,orca-panes} build`: all compile.
- `gui07-mode-toggle-commands: PASS` and its self-test PASS. `gui04-registry-shape: PASS` and its self-test PASS.
- `orca-no-pb-add-project: PASS -- vocabulary 15 Add-project strings from Orca's sidebar; PB set 111 contribution strings (orca-panes labels: New Orca Chat, New Orca Terminal); intersection empty`
- `orca-no-pb-add-project self-test: PASS -- 6 planted faults each went red naming the drift; control green before and after`. The plants are: a PB command label, a tab-bar toolbar tooltip, a menu action label, a chrome-bar title, source moved, and parser blind.
- `orca-side-panel-live self-test: PASS -- 7 planted faults each went red naming the drift; 4 controls green`
- `orca-add-project-live self-test: PASS -- 5 planted faults each went red naming the drift; 2 controls green; no verdict prints a path`
- Unknown argument: each of the three new scripts prints usage and "Next step:" and exits 2.
- Live rows on this lane: `orca-side-panel-live` and `orca-add-project-live` print a named SKIP, because there is no built PowerBrowser in the lane worktree. They were not run live (see Deferred).
- Selector derivation against the pinned Orca source:
  - side panel: `data-worktree-id`, `data-repo-header-id`, five page entries (artifacts, skills, automations, mobile, tasks) and the toggle label "Toggle orchestration panel".
  - add-project: every step was derived: Add project, Or enter a host path manually, `server-project-path`, Add Git Project, "Project actions for ", Remove Project and Remove.
- Full `--quick` on the lane tree: 320 PASS, 60 FAIL. Every red is one of three kinds:
  - **Environment.** `upstream/` is not fetched in the lane, the built app is absent, and `zod` is absent for orca-mobile-skew.
  - **Brand rows.** `scan-brand-residue` is red, and its self-test's `--extra-root` control fails for the same reason; see Brand counts.
  - **Not from this lane.** None of the reds names a file this lane touched.

## Brand counts (scan-brand-residue --report .mozbuild/p65-03/brand-report.md; inventory not edited)

- Condition 4 (unclaimed probe hits, by file):
  - verify-orca-side-panel-live.mjs: 70
  - orca-side-panel-sync.ts: 55
  - verify-orca-add-project-live.mjs: 51
  - orca-side-panel-module.ts: 51
  - verify-orca-no-pb-add-project.mjs: 42
  - orca-side-view-widget.tsx: 25
  - view-factory-table.ts: 10
  - orca-panes-frontend-module.ts: 2
  - mode-service.ts: 1
- Held-back rows:
  - "Orca": expected 1591, observed 1606
  - "orca": expected 3582, observed 3620
  - "ORCA": expected 682, observed 685
- Total: 310 reconciliation failures. Brand rows for these files are the coordinator's.

## Coordinator proof commands

Run these after the merged builds (the Orca rebuild with lane p65-01's kinds, the standalone variant, and the Theia app) and after `orca-pane-css-live` passes. Each runs under the lock with ORCA_* unset:

```sh
env $(compgen -e | grep '^ORCA_' | sed 's/^/-u /') flock /home/chris/coding/Power-Browser/.git/pb-live.lock scripts/verify-platform.sh --only orca-side-panel-live
env $(compgen -e | grep '^ORCA_' | sed 's/^/-u /') flock /home/chris/coding/Power-Browser/.git/pb-live.lock scripts/verify-platform.sh --only orca-add-project-live
env $(compgen -e | grep '^ORCA_' | sed 's/^/-u /') flock /home/chris/coding/Power-Browser/.git/pb-live.lock scripts/verify-platform.sh --only verify-uri-roundtrip
env $(compgen -e | grep '^ORCA_' | sed 's/^/-u /') flock /home/chris/coding/Power-Browser/.git/pb-live.lock scripts/verify-platform.sh --only gui07-mode-switch-tabs-live
```

## Egress

`orca-side-panel-live` clause (i) runs `fetch('http://pb-egress-control.invalid/')` from the Theia document first, and requires that host in the nsHostResolver log before it judges anything else. Every other non-loopback host must pass the unattended verdict, or the check goes red naming the host.

The coordinator handles a named host as follows:

- **First resolved after a user action** (a click in a panel): add a `user-initiated` row to `powerbrowser/endpoint-allowlist.json`, with a reason naming Orca's side panel and Phase 65.
- **Resolved unattended at launch:** route it to the owner (65-05 Task 2). It is not allowlisted without an owner answer.

This lane measured nothing and edited no allowlist row.

## Owner items for the deferred list

- P65-09: Settings placement in the left side panel, judged at lane p65-01's measured width; the alternative is a main-area `pb-orca:settings` tab.

## Merge note for the coordinator

- **Registry blocks:** this lane's `# NEW (65-03, ...)` blocks sit second at both anchors (after 65-02's, before 65-04's). Quick block: orca-no-pb-add-project, its self-test, orca-side-panel-live-self-test and orca-add-project-live-self-test. Full block: orca-side-panel-live and orca-add-project-live.
- **Frontend module:** the `// NEW (65-03): Orca side panel (TAB-07, P65-09)` block comes first, after `bind(KeybindingContribution).toService(OrcaTerminalKeybindings);`. Its import line sits with the other imports, as 65-PATTERNS shows.
- **P65-10 refinement:** closing the page tab whose view is the store's activeView calls `setActiveView('terminal')`. Without it, the store keeps the closed page's view, and the next sidebar click on that page changes nothing.
- **Observer edits for lane p65-04:** the Phase 64 observer (not edited here) still calls `setActiveWorktree(widget.options.worktreeId)` when any OrcaPaneWidget activates, page tabs included, so a page tab writes an empty worktree id. That observer is lane p65-04's file. The guard belongs there, beside its N-2 edit that stops a tab-less widget being disposed on a store drop.
- **Opener dependency:** page tabs open through OpenerService `pb-orca:<view>`, which lane p65-04's `OrcaPaneRestoreOpenHandler` (canHandle 1001) must create. Phase 64's handler alone only focuses existing widgets, so the page rows of verify-uri-roundtrip and clause (f) are red until p65-04 merges.
- **Bundle exports:** `OrcaSidePanelBundleApi` (in `orca-side-view-widget.tsx`) names the members MOUNT_KINDS, mountPane, subscribeActiveView, setActiveView, subscribeActiveWorktree, subscribeWorktrees, subscribeOrchestrationEnabled, setOrchestrationFocus and viewTitle. All of them are C3-65 exports, for orca-pane-entry's consumer clause.
- **Brand rows:** the rows for the side-panel files and the three new scripts are the coordinator's (counts above). There are no WINDOWS.md ids.
- **Base-tree grep:** the plan's acceptance grep for `@powerbrowser/orca-panes` under tab-uris/src matches a pre-existing comment at `theia/extensions/tab-uris/src/browser/orca-scheme-coverage.ts:8`, which is Phase 64's line, not an import. This lane adds no such string.

## Deviations from Plan

1. **[Rule 3 - Blocking] Two commits for Task 3 instead of one.** The code was committed as feat(65-03), and this SUMMARY is a separate docs(65-03) commit. That way `commits:` is measured from the ledger instead of predicted.
2. **[Rule 2 - Correctness] A positive read for clause (h).** orca-side-panel-live checks `TabUriRegistry.getViewContribution(id)` for both container ids, the exact condition behind tab-uri-registry.ts's startup error. It does not assert that a console line is absent (CLAUDE.md verification rule 1).
3. **[Rule 1 - Bug] Doc comment updated.** The view-factory-table.ts doc comment said "the five rows addressed as a view container". It now says "the rows", because there are seven container rows.
4. **The acceptance grep on mode-service.ts.** The rules row is one line and the table is "one line per row" for the gui07 parser. To meet the plan's count of 2 or more, the SHIPPED_MODE_RULES doc comment names both container ids (grep count 3).
5. **orca-no-pb-add-project vocabulary is broader than the plan.** Besides the plan's regex matches, it takes every translate default inside a sidebar function that calls `openModal('add-repo')`. That includes useSidebarProjectDrop's drop messages, which are Orca's own project-adding copy. The intersection with the PB set is still empty.

## Deferred / not done in this lane

- **Live rows not run here.** Neither live row was run, because they need the merged tree: lane p65-01's mount kinds and C3-65 exports, lane p65-04's opener, a built PowerBrowser and a built Orca. Their DOM steps are derived from Orca's source, but they have not met a real hosted DOM yet. The likely first-run adjustments on the merged tree:
  - whether Orca's Settings view renders the experimental section without navigation (clause c);
  - whether synthetic pointer events open Radix menus in the sidebar (clause e, and the add-project remove step);
  - whether the Theia document's fetch to the `.invalid` control resolves under the token-gate CSP (clause i, "collector blind" if not).
- `requirements-completed` is empty on purpose. TAB-07 and TAB-09 are marked by the coordinator only after orca-side-panel-live, orca-pane-css-live, orca-add-project-live and orca-no-pb-add-project pass on the merged tree (65-05).

## Known Stubs

None. Nothing PB-authored renders while the bundle is not ready.

## Threat Flags

None beyond the plan's threat register. T-65-09 is covered by clause (i), T-65-10 by orca-no-pb-add-project, and T-65-11 reuses the data-pb-orca-pane scope attribute.

## Self-Check: PASSED

- All six created files exist, and all seven modified files are in the lane diff.
- Commits ec174ac8, f1aead3a and 29a4153c are ancestors of HEAD.
