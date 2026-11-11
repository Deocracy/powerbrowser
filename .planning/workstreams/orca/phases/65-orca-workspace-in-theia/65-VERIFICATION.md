---
phase: 65-orca-workspace-in-theia
verified: 2026-11-11T05:10:00Z
status: human_needed
score: 8/8 must-haves verified
covered_files:
  - ".planning/workstreams/orca/phases/65-orca-workspace-in-theia/65-01-PLAN.md"
  - ".planning/workstreams/orca/phases/65-orca-workspace-in-theia/65-01-SUMMARY.md"
  - ".planning/workstreams/orca/phases/65-orca-workspace-in-theia/65-02-PLAN.md"
  - ".planning/workstreams/orca/phases/65-orca-workspace-in-theia/65-02-SUMMARY.md"
  - ".planning/workstreams/orca/phases/65-orca-workspace-in-theia/65-03-PLAN.md"
  - ".planning/workstreams/orca/phases/65-orca-workspace-in-theia/65-03-SUMMARY.md"
  - ".planning/workstreams/orca/phases/65-orca-workspace-in-theia/65-04-PLAN.md"
  - ".planning/workstreams/orca/phases/65-orca-workspace-in-theia/65-04-SUMMARY.md"
  - ".planning/workstreams/orca/phases/65-orca-workspace-in-theia/65-05-PLAN.md"
  - ".planning/workstreams/orca/phases/65-orca-workspace-in-theia/65-05-SUMMARY.md"
  - "docs/URI-SCHEMES.md"
  - "inventory/brand-tokens.json"
  - "orca-overlay/files/src/renderer/src/pb/pb-pane-mount.tsx"
  - "orca-overlay/files/src/renderer/src/pb/pb-session-pairing.ts"
  - "orca-overlay/files/src/renderer/src/pb/pb-side-mounts.tsx"
  - "orca-overlay/files/src/renderer/src/pb/pb-workspace-api.ts"
  - "powerbrowser/endpoint-allowlist.json"
  - "scripts/lib/orca-offer-scan.mjs"
  - "scripts/lib/orca-pane-harness.mjs"
  - "scripts/lib/orca-tabs-live.mjs"
  - "scripts/verify-backend-env-readers.mjs"
  - "scripts/verify-orca-add-project-live.mjs"
  - "scripts/verify-orca-editor-routes.mjs"
  - "scripts/verify-orca-no-pb-add-project.mjs"
  - "scripts/verify-orca-offer-scan.mjs"
  - "scripts/verify-orca-pane-css-live.mjs"
  - "scripts/verify-orca-pane-entry.mjs"
  - "scripts/verify-orca-pane-routes.mjs"
  - "scripts/verify-orca-pane-standalone-live.mjs"
  - "scripts/verify-orca-relaunch-restore-live.mjs"
  - "scripts/verify-orca-side-panel-live.mjs"
  - "scripts/verify-orca-tabs-live.mjs"
  - "scripts/verify-orca-workspace-live.mjs"
  - "scripts/verify-platform.sh"
  - "scripts/verify-uri-roundtrip.mjs"
  - "theia/applications/browser/package.json"
  - "theia/extensions/modes/src/browser/mode-descriptors.ts"
  - "theia/extensions/modes/src/browser/mode-service.ts"
  - "theia/extensions/modes/src/browser/setups-service.ts"
  - "theia/extensions/orca-panes/package.json"
  - "theia/extensions/orca-panes/src/browser/orca-pane-observer.ts"
  - "theia/extensions/orca-panes/src/browser/orca-pane-routes.ts"
  - "theia/extensions/orca-panes/src/browser/orca-pane-widget.tsx"
  - "theia/extensions/orca-panes/src/browser/orca-panes-frontend-module.ts"
  - "theia/extensions/orca-panes/src/browser/restore/orca-pane-name-map.ts"
  - "theia/extensions/orca-panes/src/browser/side-panel/orca-side-panel-module.ts"
  - "theia/extensions/orca-panes/src/browser/side-panel/orca-side-panel-sync.ts"
  - "theia/extensions/orca-panes/src/browser/side-panel/orca-side-view-widget.tsx"
  - "theia/extensions/orca-workspace/package.json"
  - "theia/extensions/orca-workspace/src/browser/orca-editor-routes.ts"
  - "theia/extensions/orca-workspace/src/browser/orca-git-resource.ts"
  - "theia/extensions/orca-workspace/src/browser/orca-root-sync.ts"
  - "theia/extensions/orca-workspace/src/browser/orca-workspace-frontend-module.ts"
  - "theia/extensions/orca-workspace/src/common/orca-git-protocol.ts"
  - "theia/extensions/orca-workspace/src/node/orca-workspace-backend-module.ts"
  - "theia/extensions/orca-workspace/tsconfig.json"
  - "theia/extensions/tab-uris/src/browser/profile-storage.ts"
  - "theia/extensions/tab-uris/src/browser/view-factory-table.ts"
  - "theia/package.json"
covered_digest: "v3:sha256:e1d3a01c765179f547333822c3e1243759450590627cae2b9b1b50f7dee90a3b"
behavior_unverified: 0
overrides_applied: 0
deferred:
  - truth: "CA-07: each paired launch leaves one used runtime token row in orca-devices.json"
    addressed_in: "Phase 67"
    evidence: "Phase 67 goal: 'Orca hosting ... keeps its secrets ... the pairing offer stays contained'; orca-relaunch-restore-live devices PASS asserts exactly one new row"
  - truth: "P65-06: the fixed workspace file path appears in the Theia document URL fragment (copyable surface)"
    addressed_in: "Phase 67"
    evidence: "Phase 67 criterion 2: 'scans history, session restore, logs, the address field and copyable text'"
advisory:
  - finding: "orca-tabs-live stage (k): after the kept-panes narrowing, a dropped pane re-created under a new name is filtered out of both bar lists and no clause reports it"
    category: other
    reason: "scripts/verify-orca-tabs-live.mjs:372-373 filters barsAfter by keptNames as well as barsBefore. The 65-05 run's debug log (.mozbuild/p65-05/dbg-tabs.log line 3-4) shows sim1/checks1 absent from the store 16 s after the reload and no re-created widget, so this run is clean. Fix: apply the filter to barsBefore only, or fail on any name in barsAfter that identityBefore does not hold"
    evidence_status: "no product defect observed; a gap in what the check can detect"
  - finding: "orca-relaunch-restore-live pairing-ui: the PB-document count of Orca's pairing UI is taken before restoreSetup"
    category: other
    reason: "scripts/verify-orca-relaunch-restore-live.mjs:427-428; pairing UI that a restored Orca tab renders in PB's document is not counted. The chat and terminals clauses (composer present, echo on a new PTY) would fail for an unpaired tab, so connection is still proven"
    evidence_status: "none observed"
human_verification:
  - test: "P65-01: open an Orca PR's check details from the Orca sidebar"
    expected: "It reads as an Orca-only view (CheckRunDetailsPanel alone, no Theia editor); the owner accepts it as not an editor-type tab"
    why_human: "This is a product reading of whether check-details counts as editor-type. orca-editor-routes keeps it as the one named hosted row on purpose"
  - test: "P65-09: open Orca's Settings in the Orca mode's left side panel at the default panel width"
    expected: "The owner accepts the side-panel placement, or chooses a main-area pb-orca:settings tab instead (Orca's Settings needs 660 px to avoid horizontal overflow)"
    why_human: "Owner decision on layout"
  - test: "P65-17: review session-only pairing through Orca's exported setWebDeviceKeySupportForTests"
    expected: "The owner accepts that export as the route, or asks for a declared seam"
    why_human: "Owner decision. The behaviour is proven by orca-relaunch-restore-live (state().pairing.sessionOnly true, devices PASS)"
  - test: "Use Orca's Agents (orchestration) panel and the worktree-creation surface with real content, such as a running orchestration and a pending creation"
    expected: "Both behave as in stock Orca. Live rows mounted them only empty, from Orca's own state"
    why_human: "Criterion 2 says 'behave as in Orca'. The populated state was never shown live"
  - test: "Launch PowerBrowser straight into the Orca mode with egress logging on"
    expected: "Owner rules on whether the favicon hosts (www.google.com, t1/t2/t3.gstatic.com) contacted at launch with no click are acceptable. www.google.com's allow reason names Widevine, not Orca"
    why_human: "Owner decision on egress disposition"
  - test: "In stock Orca's web client, open a simulator pane and a check-details pane, then reload the page"
    expected: "Stock Orca drops them on reload as PowerBrowser's hosted client does (orca-tabs-live note: 'Orca's store no longer holds pb-orca:sim1, pb-orca:checks1 after the reload'), so PB matches stock Orca. If stock Orca keeps them, PB loses user tabs on a frontend reload"
    why_human: "Parity with stock Orca; stage (k) was narrowed to panes the store keeps on the assumption that the drop is Orca's own"
  - test: "Remove the leftover worktree directories under ~/orca/workspaces/repo/ left by earlier orca-workspace-live runs"
    expected: "Directories removed by hand"
    why_human: "Agent cannot recursively delete outside the project"
---

# Phase 65: Orca workspace in Theia Verification Report

**Phase goal:** Orca's workspace works inside PowerBrowser's Theia: files and diffs open in Theia's editor with worktrees as workspace folders, Orca's sidebar, settings and orchestration panel live in a side panel, Orca's own Add-project flow is kept, and a restored Setup brings Orca tabs back connected.
**Verified:** 2026-11-11T05:10:00Z (local 2026-11-10 21:10 PST)
**Status:** human_needed. No code gaps; owner items are listed below for the end-of-milestone pass (D-18, "verification at the end").
**Re-verification:** No. This is the initial verification.

Method: I read the delivered source for every criterion. I ran each Phase 65 quick row with `scripts/verify-platform.sh --only <label>` inside `nix develop .#theia`, plus the static full row `orca-pane-entry` and the guard rows. I read the coordinator's live logs under `.mozbuild/p65-05/` and matched their timestamps against the commit times. I started no live run and no build.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1: Opening an Orca file or diff opens it in Theia's editor, diff editor or merge editor. Each local Orca worktree is a Theia workspace folder. Every editor-type content type routes to Theia, so Orca's own editor is never mounted | VERIFIED | `orca-editor-routes.ts:28-47` routes every mode, diff source and conflict kind. `orca-pane-routes.ts` sends editor, diff and conflict-review to `theia-editor`, and `planPanes` skips those rows. `orca-root-sync.ts:62-100,178-210` handles the roots. I ran `orca-editor-routes` (keys derived from the pinned Orca source and compared as a set), `-self-test` and `orca-pane-routes`: PASS. `orca-pane-entry`: PASS (8659 modules, no EditorPanel or EditorContent). Live at 20:22, after the last product fix: `orca-workspace-live: PASS -- clauses e, a, b (5 diff sources, a merge and a one-sided conflict), c, d and f`. Clause c takes a positive control first: the Monaco selector must match in a Theia editor before its absence is checked in Orca pane roots |
| 2 | SC2: Orca's worktree sidebar, Settings, Agents panel and right sidebar open in PB side panels and behave as in Orca. The overlay gate is green and every change is additive | VERIFIED (populated orchestration state goes to a human item) | `orca-side-panel-module.ts:21-95` defines two ViewContainers through Theia's own pattern and registers no command or toolbar item. `mode-descriptors.ts` and `SHIPPED_MODE_RULES.orca` dock them. I ran `orca-overlay`, `orca-side-panel-live-self-test` and `gui07-mode-toggle-commands`: PASS. Live: `orca-side-panel-live: PASS -- 9 clauses`, then `orca-pane-css-live: PASS` (0 of 217 Theia values and 0 of 126 pane values changed, controls registered) |
| 3 | SC3: Orca's Add-project flow adds a project and the sidebar remove removes it. A check over PB's commands and toolbar items finds no PB Add-project control | VERIFIED | I ran `orca-no-pb-add-project: PASS -- vocabulary 15 Add-project strings from Orca's sidebar; PB set 111 contribution strings; intersection empty`. Its self-test plants 6 faults, including a source move (empty vocabulary) and a blind parser, and each goes red. Live: `orca-add-project-live: PASS`, with the stock standalone page run first as the control |
| 4 | SC4: After quit and relaunch, restoring a Setup reopens its Orca tabs in their modes and splits, connected to the new orcad pairing with no user step. The stored Setup holds no offer, and the scan's self-test plants one and goes red | VERIFIED | `orca-pane-name-map.ts` covers the persisted name map, tombstones, the launch prune and the restore opener at canHandle 1001. `setups-service.ts:944-952` addresses a diff editor by its `diff:` URI. The router waits for `sessionRestored`, which resolves in a `.finally`, so it cannot hang. Live: `orca-relaunch-restore-live: PASS -- dock, modes, chat, terminals, identity, pairing-ui, not-gone, devices, offer-scan`. I ran `orca-offer-scan-self-test`: 19 plants red, covering every encoder form, a blind collector, zero sinks read and the runtime key |
| 5 | The pb-orca-git backend is a trust boundary: it validates root, path and rev itself and reads with no shell and no inherited GIT_* | VERIFIED | `orca-workspace-backend-module.ts:55-66` runs `specRefusal` and then `validateRoot` before every read. `orca-git-protocol.ts:24-79` defines the rev grammar: 40/64 lower-case hex, `:0`-`:3`, or empty. Paths with a leading `/` or `-`, a backslash, NUL/CR/LF, or `.`/`..`/empty segments are refused. The root must be absolute, equal to its own realpath and equal to `--show-toplevel`. The read uses execFile, `--` before the spec, `core.fsmonitor=false`, `withoutGitVars`, a 50 MB cap and a 10 s timeout, and it logs the reason only. `resolveHead` lets only an object id into a URI. The frontend (`orca-git-resource.ts:55-71`) also limits reads to PB-owned or live store roots. I ran `orca-git-spec-self-test`: 17 refusals, a subdirectory root refused, and hermetic bytes equal to `git cat-file` with GIT_DIR planted |
| 6 | P65-35: restored hosted widgets keep their names and panes across a frontend reload (the renumbering fix) | VERIFIED | `orca-pane-routes.ts` `planPanes` holds restored keys per worktree until a list names that worktree or `hydrated` is set. `orca-pane-observer.ts` recomputes `restoredWidgets()` on every list and sets a 15 s `ORCA_RESTORE_HOLD_MS` timer from the first list. `orca-pane-routes` placement case 7 (hold) has its own plant: `placement-hold-removed -> red`. The orca-tabs-live self-test plants the term2/term3 swap. Live stage (k) `reload: PASS` |
| 7 | The 65-05 detach fix: Orca's containers stay out of Coding and Browsing, and Coding's own Explorer stays docked | VERIFIED | `mode-service.ts:344,428-440` detaches only views that some shipped row docks and that are not Coding's IDE views (parent = null, not disposed). Live, all after 57aa1658: `orca-side-panel-live` clause g, `verify-uri-roundtrip: 34/34 rows PASS` (the row that caught the Explorer regression) and `gui07-mode-switch-tabs-live: PASS` |
| 8 | Hosted dialogs: every AppRootSurfaces modal that a bundle module opens is hosted in the services root | VERIFIED | `pb-pane-mount.tsx:224-294` hosts 13 modals. I ran the full row `orca-pane-entry`: PASS (`13 app-root dialog(s) the bundle opens all hosted`). Clause k is derived from the bundle graph, and the self-test plants an unhosted dialog, a lazily mounted one, a moved source and a blind parser, all red |

**Score:** 8/8 truths verified (0 present but behavior-unverified)

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | CA-07: one used runtime token row per paired launch in orca-devices.json | Phase 67 | Goal "keeps its secrets"; criterion 2 covers offer containment |
| 2 | P65-06: the fixed workspace-file path in the Theia document URL fragment | Phase 67 | Criterion 2 covers "copyable text" |

### The two clause changes recorded by 65-05

1. **orca-relaunch-restore-live `no-input` removed (ee05cfbe). This does not weaken a guarantee.** The clause read `inputLogVerdict(session.inputLog, ...)`, and only the harness wrote to that log, so no product behaviour could turn it red (CLAUDE.md verification rule 1). "No user step" still holds by the structure of the code. In launch 2, `connected()` is the first call (`verify-orca-relaunch-restore-live.mjs:424-426`). It only reads `OrcaService.getState()`, waits for the bundle boot, and requires `state().pairing.sessionOnly === true`, so pairing is reached before the harness sends any input. The chat (store key plus a visible composer) and terminals (echo on a new PTY under the old name) clauses also fail on any unpaired restored tab. One small hole remains: the pairing-UI count in PB's document is taken before `restoreSetup` (lines 427-428). It is listed as an advisory.
2. **orca-tabs-live stage (k) bars compared over kept panes only (102b9367). PB-owned guarantees stay intact, with one detection gap.** A pane that PB loses or moves while the store still holds it still goes red, and the self-test has the plant "a kept pane moved while another was dropped". The narrowing covers panes that Orca's store no longer holds after the reload. The debug log confirms that sim1 and checks1 were missing from the store 16 s after the reload, past the 15 s hold, and that nothing re-created them, so this is not a hydration race. The gap: `scripts/verify-orca-tabs-live.mjs:372-373` filters `barsAfter` as well as `barsBefore`, so a dropped pane re-created under a new name (the P65-35 renumbering defect, for a late-hydrating pane) would be filtered out and not reported. It is advisory: this run was clean, and the fix is a one-line change. Whether stock Orca also drops these panes on reload is a human item.

### TAB-04 (carried from Phase 64; not a Phase 65 requirement)

From the 20:16 log, stages g (other-views), g2 (tab-groups), k (reload), terminal-*, split, pb-split, chat, organising, no-tab-chrome and close all PASS, and `gui07-mode-switch-tabs-live` PASS. That proves the following TAB-04 clauses live:
- every pane is a tab that moves between modes and appears as an Organising row;
- in-tab splits are flattened;
- a group made in PB (Split Chat Right) is placed at once;
- names and panes survive a reload.

**Not proven:** the cross-client clause, meaning a group that another paired client made being placed when PB next adopts the layout, and later regrouping not being mirrored. Stage g3 fails before its drive: `the second client shows no tab for T (web-terminal-8fa299ad-...)`. Both halves of g3 (the 5000 ms absence and `detectedAfterReload`) never ran. The only coverage is the pure fixtures in `orca-pane-routes` clause h: "a regrouped known key getting no placement" and "a restored key adopted, not placed". The red points at the stock second client, not at PB code: its tab list stays frozen at the 7 tabs it had when it paired. No PB defect is shown. REQUIREMENTS.md correctly keeps TAB-04 pending, and no later roadmap phase owns it, so it stays with the end-of-milestone pass.

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `theia/extensions/orca-workspace/` (router, git scheme, root sync, backend) | VERIFIED | 1049 lines, built into the app (src-gen names it), and the backend sits on the env-toucher list |
| `orca-panes/src/browser/side-panel/*` | VERIFIED | Bound by `bindOrcaSidePanel` in `orca-panes-frontend-module.ts` |
| `orca-panes/src/browser/restore/orca-pane-name-map.ts` | VERIFIED | Bound by `bindOrcaRestore`, and the observer injects `OrcaPaneNameMap` |
| `modes` mode-service, descriptors, setups-service | VERIFIED | Covered by the `gui07-mode-toggle-commands` derive-and-compare |
| Overlay `pb-*.ts(x)` | VERIFIED | `orca-overlay` PASS, and seams 010/070/080 are declared |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| OrcaEditorRouter | bundle `subscribeOpenFiles` | `narrowWorkspaceApi`, after `bundle.ready()` and `sessionRestored` | WIRED |
| OrcaGitResourceResolver | backend `OrcaGitServiceImpl` | `WebSocketConnectionProvider.createProxy` at `ORCA_GIT_SERVICE_PATH` / `JsonRpcConnectionHandler` | WIRED |
| OrcaRootSync | `WorkspaceService.spliceRoots/removeRoots/save` | `subscribeWorktrees`, with a 750 ms settle | WIRED |
| OrcaPaneObserver | OrcaPaneNameMap | `namesByKey`, `reservedNames`, `record`, `markGone` | WIRED |
| OrcaPaneNameMapContribution | `SetupsService.referencedTabUris` | prune at start | WIRED |
| ModeService.activateMode | `detachOtherModesViews` | `mode-service.ts:344` | WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|----------|------|--------|-----------|--------|
| Theia diff and merge editors | blob text | `git cat-file blob` via backend | Yes (hermetic bytes compare) | FLOWING |
| Workspace roots | worktree paths | Orca store via `subscribeWorktrees` | Yes (live clause f compares with the store's local worktrees) | FLOWING |
| Side-panel rows | repositories and worktrees | Orca store | Yes (live clause b equals the CLI lists) | FLOWING |

### Behavioral Spot-Checks (run by me, no live runs)

| Row | Result |
|-----|--------|
| orca-editor-routes, -self-test, orca-git-spec-self-test, orca-workspace-live-self-test | PASS |
| orca-no-pb-add-project, -self-test, orca-side-panel-live-self-test, orca-add-project-live-self-test | PASS |
| orca-offer-scan-self-test, orca-relaunch-restore-live-self-test, orca-tabs-live-self-test | PASS |
| orca-pane-entry (full, static), orca-pane-entry-self-test, orca-pane-routes, -self-test | PASS |
| gui07-mode-toggle-commands, backend-env-readers, orca-overlay | PASS |
| diff-theia-core, scan-brand-residue, internals-boundary, gui04-registry-shape, shell-error-copy-no-internals | PASS |

Can each check go red? Every Phase 65 row I read has a self-test that plants faults and requires a red naming the drift. Each absence is preceded by its detector: the Monaco control in a Theia editor, the pairing-UI detector on Orca's own page, the offer-scan marker, the egress `.invalid` control host and the CSS controls. The routes, Add-project vocabulary, dialog list, page words and TopLevelView set are all derived from the pinned source and compared as sets.

Evidence timing: orca-relaunch-restore-live (20:01), orca-offer-scan (19:47) and orca-add-project-live (19:47) ran before 57aa1658 (20:08). That commit only narrows the detach so Coding's Explorer is spared, so the risk to those rows is low, and the SUMMARY discloses it. orca-workspace-live (20:22) and orca-tabs-live (20:16) ran on the final product code.

### Requirements Coverage

| Requirement | Status | Evidence |
|-------------|--------|----------|
| TAB-05 | SATISFIED | Truths 1 and 5 |
| TAB-07 | SATISFIED | Truths 2 and 7; populated orchestration goes to a human item |
| TAB-08 | SATISFIED | Truths 4 and 6 |
| TAB-09 | SATISFIED | Truth 3 |
| TAB-04 (carried) | PENDING (not this phase's) | See the TAB-04 section |

No orphaned requirements: REQUIREMENTS.md maps only TAB-05, TAB-07, TAB-08 and TAB-09 to Phase 65.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `scripts/verify-orca-tabs-live.mjs` | 372-373 | kept-name filter applied to `barsAfter` | Warning (advisory) | A renumbered dropped pane cannot go red |
| `scripts/verify-orca-relaunch-restore-live.mjs` | 427-428 | PB-document pairing-UI count taken before the restore | Info | Pairing UI that appears after the restore is not counted |
| `theia/extensions/modes/src/browser/mode-service.ts` | 402-428 | The new JSDoc for `detachOtherModesViews` was inserted after `ensureInArea`'s doc block, so `ensureInArea` (line 442) has lost its doc and the "additive by construction" text now sits above a method that detaches | Info | Misleading doc placement only |
| `theia/extensions/orca-workspace/src/node/orca-workspace-backend-module.ts` | 46-47 | `rev-parse --show-toplevel` runs without `-c core.fsmonitor=false` | Info | `rev-parse --show-toplevel` does not refresh the index, so fsmonitor does not run. Add the flag for consistency |
| `theia/extensions/orca-workspace/src/common/orca-git-protocol.ts` | 66-75 | The realpath rule (symlinked root refused) has no plant in the git-spec self-test | Info | A regression in the realpath rule would not go red |

No TBD, FIXME, XXX, TODO or HACK markers appear in the phase's product files.

On the trust boundary: the backend accepts any absolute repository toplevel on disk, not only Orca worktrees. It sits behind Theia's authenticated websocket, which already exposes Theia's own file service, so this grants no new read capability. I am not filing it as a gap.

### Human Verification Required (deferred to the end-of-milestone pass)

These items go to the end-of-milestone pass under D-18 and the owner's "verification at the end" ruling. None of them blocks Phase 66.

1. **P65-01 check-details reading.** Open check details from Orca and confirm that it reads as an Orca-only view.
2. **P65-09 Settings width.** Orca's Settings needs 660 px. Keep it in the side panel or move it to a main-area `pb-orca:settings` tab (owner decision).
3. **P65-17 session-only pairing route.** Accept `setWebDeviceKeySupportForTests` or ask for a declared seam (owner decision).
4. **Populated orchestration and creation surfaces.** Exercise them with real content. They were only mounted empty.
5. **Egress at launch straight into the Orca mode.** Rule on the favicon hosts and on the www.google.com reason (owner decision).
6. **Stock Orca reload parity for simulator and check-details panes.** This is what the stage (k) narrowing assumes.
7. **TAB-04 g3.** Drive with a second client that receives host frames, for example one opened or re-paired after T exists.
8. **Cleanup.** Remove the leftover worktree directories under ~/orca/workspaces/repo/ by hand.

### Gaps Summary

There are no code gaps for Phase 65's four requirements or its criteria. Every criterion has a derived, self-tested static check and a live PASS line from the coordinator, timed after (or, for one narrowing commit, unaffected by) the last product fix. The two clause changes do not weaken a PB-owned guarantee. The stage (k) narrowing leaves one detection gap, which is a one-line fix and is recorded as advisory. TAB-04 stays pending because its cross-client clause has no live evidence. That is a Phase 64 requirement carried forward, not a Phase 65 gap.

---

_Verified: 2026-11-11T05:10:00Z_
_Verifier: Claude (gsd-verifier)_
