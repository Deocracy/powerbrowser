---
phase: 65-orca-workspace-in-theia
plan: 01
status: in-progress
---

# Phase 65 Plan 01: Orca side of the Orca workspace in Theia Summary

## Mount gate

P65-04, run by `orca-pane-standalone-live` with `--report .mozbuild/p65-01/mount-gate.json --width-probe settings`
under `flock /home/chris/coding/Power-Browser/.git/pb-live.lock`, every inherited ORCA_* unset,
PB_FIREFOX_BIN = the coordinating workspace's build. The kind list is the built entry's `MOUNT_KINDS`, read from
the standalone page. Route A is the Theia document of the lane's Theia build, reached only through C64-1's boot
handle with PowerBrowser's own orcad running (pbOrcad). A planted throwing kind was recorded on both routes
before any row was judged.

Every kind mounted on the first attempt on both routes. No provider was added. No GATE-FAIL line.

| Kind | Standalone (elements) | Route A (elements) | Attempts | Providers added | Imports added (beyond the entry's own) |
|---|---|---|---|---|---|
| sidebar | yes (183) | yes (183) | 1 | none | components/Sidebar.tsx, components/error-boundaries/RecoverableRenderErrorBoundary.tsx, i18n/i18n.ts |
| settings | yes (625) | yes (625) | 1 | none | components/error-boundaries/RecoverableRenderErrorBoundary.tsx, components/settings/Settings.tsx, i18n/i18n.ts, lib/lazy-with-retry.ts |
| orchestration | yes (0, empty by Orca state) | yes (0, empty by Orca state) | 1 | none | sonner, components/orchestration-crew/LazyOrchestrationCrewPanel.tsx, NativeChatCrewPanel.tsx, use-orchestration-panel-enabled.ts, use-terminal-crew-identity.ts, i18n/i18n.ts |
| right-sidebar | yes (130) | yes (130) | 1 | none | components/error-boundaries/RecoverableRenderErrorBoundary.tsx, components/right-sidebar/index.tsx, i18n/i18n.ts |
| check-details | yes (25) | yes (25) | 1 | none | components/editor/CheckRunDetailsPanel.tsx, i18n/i18n.ts |
| page:tasks | yes (84) | yes (84) | 1 | none | RecoverableRenderErrorBoundary.tsx, components/task-page/TaskPage.tsx, i18n/i18n.ts, lib/lazy-with-retry.ts |
| page:activity | yes (59) | yes (59) | 1 | none | components/activity/ActivityPrototypePage.tsx (+ boundary, i18n, lazy-with-retry) |
| page:automations | yes (59) | yes (59) | 1 | none | components/automations/AutomationsPage.tsx (+ boundary, i18n, lazy-with-retry) |
| page:space | yes (23) | yes (23) | 1 | none | components/workspace-space/WorkspaceSpacePage.tsx (+ boundary, i18n, lazy-with-retry) |
| page:skills | yes (2356) | yes (2356) | 1 | none | components/skills/SkillsPage.tsx (+ boundary, i18n, lazy-with-retry) |
| page:artifacts | yes (17) | yes (17) | 1 | none | components/artifacts/ArtifactsPage.tsx (+ boundary, i18n, lazy-with-retry) |
| page:mobile | yes (422) | yes (422) | 1 | none | components/mobile/MobilePage.tsx (+ boundary, i18n, lazy-with-retry) |
| page:creation | yes (0, empty by Orca state) | yes (0, empty by Orca state) | 1 | none | components/worktree-creation/PendingNativeChatCreation.tsx, WorktreeCreationPanel.tsx, lib/pending-worktree-creation.ts (+ boundary, i18n, lazy-with-retry) |

"Imports added" is spike 004 Question 3's import list, derived by `kindImports` in the harness from the overlay
source: the Orca modules each kind's `SideMountBody` branch pulls in, minus the modules the entry already imports.

Two kinds rendered no element, and the row records why rather than counting them as mounted surfaces.
- orchestration: Orca mounts no crew panel while `experimentalOrchestrationPanel` is off, and the setting is off on a scratch orcad. The gate cannot turn it on without writing Orca's settings.
- page:creation: no worktree creation was pending.

Both mounted with no throw, no React error, no window error and no error-boundary fallback. Their populated
state is unproven live.

Measurements:
- Settings width (P65-09): the narrowest host width at which Orca's Settings has no horizontal overflow is **660 px**. At 640 px, the content scroller `div.min-h-0.flex-1.overflow-y-auto.scrollbar-sleek` is 367 px wide inside a 354 px client area. The probe steps up from 640 px by 20 px in that case; see Deviations.
- CA-12 (A4): `orca worktree list --json` on headless orcad reports hostId values `["local"]` and executionHostId values `["local"]` for its own worktrees.
- check-details mounts CheckRunDetailsPanel alone, with no EditorPanel and no EditorContent, and renders Orca's check report (25 elements on both routes).

## Store observation API, session-only pairing, resume offer (Task 2)

Standalone row, built bundle, same lock and environment as the gate:
- `orca-pane-standalone-live: API PASS -- session-only pairing (session-no-ed25519, no runtime-environment key), local worktree, open-file and branch-diff records, setActiveView round trip, resume offer mounted without fallback`
- Session-only proof: `state().pairing` reads `{ sessionOnly: true, deviceKeySupport: 'session-no-ed25519' }`. A marker localStorage key written by the page read back first, as the control. Then `orca.web.runtimeEnvironment.v1` was absent.
- files.open driver: **files.open**. `orca file open <scratch file> --worktree path:<repo>` on headless orcad reached the paired hosted client as an edit-mode `subscribeOpenFiles` record with `local: true`, within the 1000 ms limit (measured 1 ms after the CLI returned). The `openPane('editor')` fallback was not needed.
- `openPane('diff', '{"source":"branch","relativePath":"README.md","baseRef":"side"}')` gave one record with mode diff, diffSource branch, and 40-hex mergeBase and headOid.
- Resume offer (P65-22, CA-14): NativeChatResumeOnRestartModal is mounted in the hidden services root inside `OverlayBoundary` with boundaryId `overlay.native-chat-resume-on-restart`. No error fallback appeared, and a planted alert in that root was detected first. The offer is delivered as a mounted surface; no "resume offer not delivered" line.
- Route A booted with the preset on PowerBrowser's own orcad: every Route A gate row above ran on that boot.
