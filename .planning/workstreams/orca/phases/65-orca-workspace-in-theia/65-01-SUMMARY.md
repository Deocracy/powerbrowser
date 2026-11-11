---
phase: 65-orca-workspace-in-theia
plan: 01
status: complete
subsystem: orca-pane-bundle
tags: [orca, pane-bundle, mount-gate, session-only-pairing, observation-api, css-isolation]
requires:
  - "Phase 64 merged (C64-1..C64-8 at 26f72bff, prelaunch reconciliation fd1062aa)"
provides:
  - "C3-65: MOUNT_KINDS, side/page/creation/check-details mounts, subscribeOpenFiles, subscribeWorktrees, subscribeActiveView, setActiveView, subscribeActiveWorktree, subscribeOrchestrationEnabled, setOrchestrationFocus, viewTitle, repair, state().pairing, openPane editor/diff"
  - "P65-04 mount gate record (13 kinds x 2 routes)"
  - "orca-pane-entry clauses h (no EditorPanel/EditorContent), i (preset export at the pin), j (Orca*BundleApi members)"
  - "orca-pane-css-live side-panel and Add-project dialog probes"
affects: [65-02, 65-03, 65-04, 65-05, 66, 67]
tech-stack:
  added: []
  patterns:
    - "Orca surfaces mounted as Orca's shell mounts them (boundaries, lazy pages, scroll refs), never restyled"
    - "store projections with JSON-diffed subscribe, read-only except Orca's own setActiveView"
    - "source module graph walked with typescript as the bundle's module list"
key-files:
  created:
    - orca-overlay/files/src/renderer/src/pb/pb-side-mounts.tsx
    - orca-overlay/files/src/renderer/src/pb/pb-workspace-api.ts
    - orca-overlay/files/src/renderer/src/pb/pb-session-pairing.ts
  modified:
    - orca-overlay/files/src/renderer/src/pb/pb-pane-mount.tsx
    - scripts/lib/orca-pane-harness.mjs
    - scripts/verify-orca-pane-standalone-live.mjs
    - scripts/verify-orca-pane-entry.mjs
    - scripts/verify-orca-pane-css-live.mjs
decisions:
  - "Orca's Add-project dialogs (add-repo and its three handoff dialogs) are hosted in the bundle's services root, as AppRootSurfaces hosts them; without it the hosted Sidebar's Add-project button sets activeModal and nothing opens (D-18)"
  - "An unknown kind still throws inside the render naming it (Phase 64 behaviour), so mountErrors records it and the detector control keeps working"
  - "The orchestration mount's canMention follows Orca's own rule per surface: chat false (the composer is never in this mount), terminal true with Orca's own rejection toast (no terminal transport in this mount)"
  - "openPane('diff') detail takes an optional baseRef beside B-10's fields, defaulting to the base of Orca's own branch compare"
  - "The width probe steps up from 640 px when 640 px already overflows, so the narrowest width without overflow is still measured"
metrics:
  duration: "~45 min"
  completed: 2026-11-10
estimate:
  tokens: 210000
  tasks: 3
actuals:
  tokens: 27766
  tasks: 3
  commits: 3
plan_head_before: fd1062aae244299164874d87ad0a76d7c7ed02c1
plan_head_after: "the commit that adds this file (feat(65-01): entry clauses, CSS probes and lane summary)"
---

# Phase 65 Plan 01: Orca side of the Orca workspace in Theia Summary

One pane bundle now carries every Orca surface Phase 65 hosts. It adds:
- 13 new mount kinds: side panels, seven pages, creation, and check-details as CheckRunDetailsPanel alone with Orca's editor out of the module graph.
- A read-only store observation API with the CA-12 local predicate.
- Session-only pairing (session-no-ed25519 preset, refusing assertion, repair).
- Orca's resume offer and Add-project dialogs in the services root.

All of it is proven live on the standalone page and under Route A.

## Commits

| Task | Commit | Files |
|---|---|---|
| 1 Mount kinds and the P65-04 gate | 82d263ef | pb-side-mounts.tsx (new), pb-pane-mount.tsx, orca-pane-harness.mjs, verify-orca-pane-standalone-live.mjs, this SUMMARY |
| 2 Observation API, session-only pairing, resume offer | 69c0b8d0 | pb-workspace-api.ts (new), pb-session-pairing.ts (new), pb-pane-mount.tsx, orca-pane-harness.mjs, verify-orca-pane-standalone-live.mjs, this SUMMARY |
| 3 Entry clauses, CSS probes, Add-project dialogs, SUMMARY | (this commit) | verify-orca-pane-entry.mjs, verify-orca-pane-css-live.mjs, orca-pane-harness.mjs, pb-pane-mount.tsx, this SUMMARY |

Setup: Phase 64 contract check (step 0). C64-1, C64-5 and C64-7 paths, exports and row labels are all present on fd1062aa. The four `merge(64-05): lane p64-0N` merges are present. No path substitution and no BLOCKER line.

## Mount gate

P65-04 is run by `orca-pane-standalone-live --report .mozbuild/p65-01/mount-gate.json --width-probe settings`, with these conditions:
- under `flock /home/chris/coding/Power-Browser/.git/pb-live.lock`, with every inherited ORCA_* unset;
- PB_FIREFOX_BIN set to the coordinating workspace's build.

The kind list is the built entry's `MOUNT_KINDS`, read from the standalone page. Route A is the Theia document of the lane's Theia build, reached only through C64-1's boot handle with PowerBrowser's own orcad running (pbOrcad). A planted throwing kind was recorded on both routes before any row was judged. The final run was on the last bundle of this lane.

Every kind mounted on the first attempt on both routes. No provider was added. **No GATE-FAIL line.**

| Kind | Standalone (elements) | Route A (elements) | Attempts | Providers added | Imports added (beyond the entry's own) |
|---|---|---|---|---|---|
| sidebar | yes (183) | yes (183) | 1 | none | components/Sidebar.tsx, components/error-boundaries/RecoverableRenderErrorBoundary.tsx, i18n/i18n.ts |
| settings | yes (625) | yes (625) | 1 | none | components/settings/Settings.tsx (+ boundary, i18n, lib/lazy-with-retry.ts) |
| orchestration | yes (0, empty by Orca state) | yes (0, empty by Orca state) | 1 | none | sonner, orchestration-crew/LazyOrchestrationCrewPanel.tsx, NativeChatCrewPanel.tsx, use-orchestration-panel-enabled.ts, use-terminal-crew-identity.ts, i18n/i18n.ts |
| right-sidebar | yes (130) | yes (130) | 1 | none | components/right-sidebar/index.tsx (+ boundary, i18n) |
| check-details | yes (25) | yes (25) | 1 | none | components/editor/CheckRunDetailsPanel.tsx, i18n/i18n.ts |
| page:tasks | yes (84) | yes (84) | 1 | none | components/task-page/TaskPage.tsx (+ boundary, i18n, lazy-with-retry) |
| page:activity | yes (59) | yes (59) | 1 | none | components/activity/ActivityPrototypePage.tsx (+ boundary, i18n, lazy-with-retry) |
| page:automations | yes (59) | yes (59) | 1 | none | components/automations/AutomationsPage.tsx (+ boundary, i18n, lazy-with-retry) |
| page:space | yes (23) | yes (23) | 1 | none | components/workspace-space/WorkspaceSpacePage.tsx (+ boundary, i18n, lazy-with-retry) |
| page:skills | yes (2356) | yes (2356) | 1 | none | components/skills/SkillsPage.tsx (+ boundary, i18n, lazy-with-retry) |
| page:artifacts | yes (17) | yes (17) | 1 | none | components/artifacts/ArtifactsPage.tsx (+ boundary, i18n, lazy-with-retry) |
| page:mobile | yes (422) | yes (422) | 1 | none | components/mobile/MobilePage.tsx (+ boundary, i18n, lazy-with-retry) |
| page:creation | yes (0, empty by Orca state) | yes (0, empty by Orca state) | 1 | none | worktree-creation/PendingNativeChatCreation.tsx, WorktreeCreationPanel.tsx, lib/pending-worktree-creation.ts (+ boundary, i18n, lazy-with-retry) |

"Imports added" is spike 004 Question 3's import list, derived by `kindImports` in the harness from the overlay source: the Orca modules each kind's `SideMountBody` branch pulls in, minus the modules the entry already imports.

Two kinds rendered no element, and the row records why rather than counting them as populated.
- orchestration: Orca mounts no crew panel while `experimentalOrchestrationPanel` is off, and the setting is off on a scratch orcad. The gate cannot turn it on without writing Orca's settings.
- page:creation: no worktree creation was pending.

Both mounted with no throw, no React error, no window error and no error-boundary fallback. **Their populated state is unproven live.**

Measurements:
- **Settings width (P65-09): 660 px.** This is the narrowest host width at which Orca's Settings has no horizontal overflow. At 640 px, the content scroller `div.min-h-0.flex-1.overflow-y-auto.scrollbar-sleek` is 367 px wide inside a 354 px client area.
- **CA-12 (A4):** `orca worktree list --json` on headless orcad reports hostId values `["local"]` and executionHostId values `["local"]` for its own worktrees.
- **check-details** mounts CheckRunDetailsPanel alone and renders Orca's check report (25 elements on both routes). The bundle's module graph (8345 modules) holds no EditorPanel*.tsx and no EditorContent.tsx (orca-pane-entry clause h).

## files.open answer

files.open driver: **files.open**. `orca file open <scratch file> --worktree path:<repo>` on headless orcad reached the paired hosted client as an edit-mode `subscribeOpenFiles` record with `local: true`. It arrived 1-2 ms after the CLI returned, against a 1000 ms limit. The `openPane('editor')` fallback was not needed. Standalone row line: `orca-pane-standalone-live: files.open driver -- files.open (record in 2 ms)`.

## Session-only proof

- `state().pairing` reads `{ sessionOnly: true, deviceKeySupport: 'session-no-ed25519' }` after bootstrap. bootstrap calls `presetSessionOnly()` immediately before Orca's `initWebDeviceKeySupport`, and rejects with `session-only pairing unavailable` unless `assertSessionOnly()` holds.
- A marker localStorage key written by the page read back first, as the control. Then `orca.web.runtimeEnvironment.v1` was absent.
- Route A booted with the preset on PowerBrowser's own orcad: every Route A gate row ran on that boot.
- `repair(offer)` re-pairs session-only from an offer or orcad's web-client URL and re-asserts. It repeats none of bootstrap's once-per-document steps. Its errors carry reason words only. **It is not exercised live:** no live row reconnects.

## Resume-modal outcome

NativeChatResumeOnRestartModal is mounted in the hidden services root inside `OverlayBoundary` with boundaryId `overlay.native-chat-resume-on-restart`, as AppRootSurfaces mounts it. The services root showed no error fallback, and a planted alert in that root was detected first. No "resume offer not delivered" line.

## Check results

- `orca-pane-standalone-live: PASS -- isolated per-leaf mount, 3 hosted type(s) mounted, late CLI terminal in 2 ms, mount gate 13 gate kind(s) x 2 route(s) [standalone, route-a], 26 row(s) mounted, 4 empty by Orca's own state, controls recorded`
  - `width probe PASS -- Settings' narrowest width without horizontal overflow is 660 px (stepped up from 640 px by 20 px)`
  - `API PASS -- session-only pairing (session-no-ed25519, no runtime-environment key), local worktree, open-file and branch-diff records, setActiveView round trip, resume offer mounted without fallback`
- `orca-pane-entry: PASS -- tracked status at baseline; React marker 1 file(s) in the standalone variant, 0 in pb-panes/; React 19.2.8/19.2.8; 75 build:web asset(s), none newly inlined; 4 overlay source(s) import no tab bar, TabGroupPanel or client-side terminal creation; C3 exports exact (C3-65 included); 8345 module(s) in the bundle graph, no EditorPanel or EditorContent; setWebDeviceKeySupportForTests exported at the pin; consumer API OrcaPaneBundleApi covered`
- `orca-pane-entry self-test: PASS`. The new plants are "Orca's editor in the pane bundle (D-01)" (static and dynamic import), "source moved: setWebDeviceKeySupportForTests (P65-17)", "bundle API drift: subscribeLayout", "parser blind", and a re-exported name that counts as an export.
- `orca-pane-css-live: PASS -- real-widget mode; Theia 0 of 217 and pane 0 of 126 values changed with both controls registered; portal probe 0 of 72; Orca's <html> writes (1 class(es), 2 custom propert(y/ies)) read by no Theia rule; side-panel and Add-project dialog probes 0 changed with their controls registered`
  - `probes -- side-panel: Theia 0, pane 0 of 90, portal 0 of 18 changed (control 4); Add-project dialog: Theia 0, pane 0 of 90, portal 0 of 54 changed (control 2) [slot-dialog-overlay, slot-dialog-content]`
- `orca-pane-css-live self-test: PASS` (10 new probe cases), `orca-pane-standalone-live self-test: PASS` (gate, width and API cases).
- `orca-overlay: PASS -- 3 seam(s) ...`. `orca-overlay-built: PASS -- 6 overlay file(s), each with its marker literal in a .js file under out/web or out/orcad`.
- `orca-pane-css-self-test`, `orca-pane-routes`, `orca-terminal-keys`, `theia-build-order`, `gui04-registry-shape`: PASS.
- `orca-overlay/seams.json` and `orca-overlay/patches` are unchanged. `git -C orca status` lists exactly the three seam paths (010, 070, 080).
- `verify-platform.sh --quick` exits 1 in this lane, for two reasons:
  - Every red other than `scan-brand-residue` reads `upstream/`, which this lane never fetches (no PowerBrowser build). These include the ext-tab-host rows, crash-*, site-identity, licensing, patches-regenerated, release-symbols, installer-schema, build-windows-shape, mac-entitlements and update-*.
  - `scan-brand-residue` is red only on this lane's new Orca-family occurrences (below).

## Brand report (coordinator's rows; inventory/brand-tokens.json not edited)

From `node scripts/scan-brand-residue.mjs --report .mozbuild/p65-01/brand-report.md`, run after staging. Held-back row counts, expected to observed:

| Row | Expected | Observed | Delta |
|---|---|---|---|
| "Orca" (title/coincidental) | 1591 | 1635 | +44 |
| "orca" (lower/coincidental) | 3582 | 3633 | +51 |
| "ORCA" (upper/coincidental) | 682 | 690 | +8 |
| "orcad" (lower/coincidental) | 1184 | 1190 | +6 |

Condition-4 occurrences no row claims (59), by file:
- pb-session-pairing.ts: Orca 6, orca 6
- pb-side-mounts.tsx: Orca 9, orca 5
- pb-workspace-api.ts: Orca 18, orca 3
- scripts/lib/orca-pane-harness.mjs: Orca 4
- scripts/verify-orca-pane-standalone-live.mjs: Orca 3

## Owner items for the deferred list

- **P65-09:** Settings in the side panel at the measured width. Orca's Settings needs **660 px** for no horizontal overflow, which is wider than a typical side panel. The owner decides whether the side panel hosts it at that width or opens it as a page.
- **P65-01:** check-details is read as an Orca-only view (CheckRunDetailsPanel alone, no Theia editor).
- **CA-07 (to Phase 67):** each paired launch leaves one used runtime token row.
- **New, found by this lane:** the hosted Sidebar can open Orca modals that AppRootSurfaces hosts and the pane bundle does not. Examples are delete-worktree, new-workspace-composer, workspace-cleanup, preserved-branch-review, worktree-palette, quick-open, agent-session-history and node-dist-mirror. These open nothing in PowerBrowser. This lane hosts only the Add-project family (D-18). Whether to host the rest is the owner's call.
- **Populated orchestration and creation surfaces are unproven live.** Showing them needs `experimentalOrchestrationPanel` on and a pending worktree creation, which the gate cannot set without writing Orca's settings or driving a creation.

## Merge note for the coordinator

- **Rebuild Orca after the merge.** The pane bundle carries the new kinds, the API and the services-root dialogs. Run `nix develop .#orca --command bash scripts/build-orca.sh`, then `build-orca-panes.sh --standalone`. The CLI (`orca/out/cli/index.js`) is built by `ORCA_CLI_BUILD_COMPILER=tsrs node config/scripts/build-cli.mjs`, as 60-EXT01-RECORD.md says. orca-pane-standalone-live SKIPs without it.
- **Run orca-pane-css-live before any other live row** (P64-15).
- **The entry's consumer-API clause (j)** compares OrcaPaneBundleApi from the lane base. On the merged tree it also compares the Theia lanes' Orca*BundleApi interfaces. A member those lanes declare that is not in C3-65 goes red as "bundle API drift".
- **mountPane no longer mounts conflict-review.** It now throws in the render naming the kind, as for any non-kind. Until lane p65-04's route change, which retires the word conflicts, merges:
  - a Theia `pb-orca:conflicts<n>` widget shows that error;
  - orca-tabs-live stage (g) is red on conflict-review.
  Merge p65-04 in the same pass.
- **Phase 66** starts only after this phase's coordinator merge (order 64, 65, 66). Its lane p66-01 adds one import line to pb-pane-mount.tsx on top of this lane's version and keeps every C3-65 line (66-06 merge rule (6)).
- **Brand rows** for the three new overlay files and the deltas above are the coordinator's. No WINDOWS.md ids.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The plan's build verify expected seam 010 alone in orca/'s tracked status**
- Found during Setup step 2 and Task 1.
- The merged base also carries seams 070 and 080 (Phase 68, in `orca-overlay/seams.json`), so the literal `= src/main/orcad/orcad-browser-provider.ts` comparison cannot hold.
- The check ran as the set of `git -C orca status` paths equal to the seams.json paths, and passed.

**2. [Rule 3 - Blocking] The Orca CLI is not built by build-orca.sh**
- Found during the first live run: `orca-pane-standalone-live: SKIP -- no Orca CLI`.
- Built it as 60-EXT01-RECORD.md records. orca/ is untracked; no tracked Orca file changed.

**3. [Rule 1 - Bug] The width probe could not measure Settings**
- The first gate run failed: `width probe FAIL -- Settings overflows horizontally already at 640 px (div.min-h-0.flex-1.overflow-y-auto.scrollbar-sleek 367/354)`.
- The probe now steps up from 640 px when 640 px overflows, and reports the overflowing elements.

**4. [Rule 1 - Bug] verify-orca-pane-entry's export parse ignored every `export { ... }` declaration**
- Cause: a dangling `else` attached to the variable-declaration loop.
- Clause (g) went red with `the entry does not export C3 name(s): repair, setActiveView, ...` once the entry re-exported them.
- Fixed with braces. A self-test plant now proves a re-exported name counts.

**5. [Rule 3 - Blocking] Orca's Add-project dialog is not mounted by the hosted Sidebar**
- The Add-project dialog probe needs the dialog, and D-18 needs the flow. AppRootSurfaces hosts the dialog.
- The services root now hosts AddRepoDialog, NonGitFolderDialog, AddProjectFromFolderDialog and ProjectAddedDialog, lazily, inside the same ModalBoundary ids and under the same conditions as AppRootSurfaces.

**6. [Rule 1 - Bug] The Add-project dialog probe compared the wrong portal**
- The first CSS run failed: `Add-project dialog probe: 2 portal value(s) differ from the standalone page, first slot-dialog-content>text|font-size`.
- The standalone page still held the earlier probe's "Stop running command?" dialog.
- The probe now measures only portal nodes that appear after its own click.

**7. Unknown kinds**
- B-1 says an unknown kind "rejects with an Error naming it". The entry throws inside the render (recorded in mountErrors), not synchronously.
- This keeps the standalone row's detector control and the Theia widget's mount path unchanged.

### Notes

- `repair(offer)` and `setOrchestrationFocus` are built, typed and exported. Neither is exercised by a live row in this lane.
- The diff detail accepts an optional `baseRef`. Without it, the base of Orca's own branch compare is used.

## Self-Check: PASSED

- Files exist: pb-side-mounts.tsx, pb-workspace-api.ts, pb-session-pairing.ts, .mozbuild/p65-01/mount-gate.json, .mozbuild/p65-01/brand-report.md.
- Commits 82d263ef and 69c0b8d0 are ancestors of HEAD. The Task 3 commit adds this file.
- The lane diff against the merge base lists only files_modified paths.
