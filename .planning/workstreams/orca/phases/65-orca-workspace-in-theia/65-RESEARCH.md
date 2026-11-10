# Phase 65: Orca workspace in Theia - Research

**Researched:** 2026-11-10
**Domain:** Theia 1.76 workspace, editor, diff and merge-editor services; Theia view containers; Orca v1.4.248 web-client pairing, device registry and store shapes; restore across a relaunch
**Confidence:** HIGH on tree facts (every answer below is read from source at file:line this session). MEDIUM on the live behaviour the plan must still measure (mounts of the new hosted kinds, Gecko storage layout). No live PowerBrowser run was made; Phase 64's research (`64-RESEARCH.md`) was not committed when this was written, so every **[P64 research]** pick is answered from source here and marked as a dependency.

<user_constraints>
## User Constraints (from 65-CONTEXT.md, copied verbatim)

### Locked Decisions (Claude's auto-mode picks P65-01..P65-28; Chris may override) and Claude's Discretion

### Files and diffs in Theia's editor (TAB-05, criterion 1)
- **P65-01 (Claude's pick): the four editor-type content types all leave Orca's `EditorPanel`; this amends P64-01's `editor`, `diff`, `conflict-review` and `check-details` rows.** Orca maps exactly these four to the visible type `editor` (`orca/src/shared/tab-types.ts:18-26`, `toVisibleTabType` at `:37-46`), and all four render through `EditorPanel` → `EditorContent` (`orca/src/renderer/src/components/editor/EditorContent.tsx:134` check-details, `:166` conflict-review, the combined-diff branch after it). The rows become:

  | Content type / `OpenFile.mode` / `diffSource` | Route | Theia mechanism |
  |---|---|---|
  | `editor`, mode `edit` | Theia editor | `EditorManager.open(file URI)`; `isPreview` → `@theia/editor-preview`'s preview mode (installed, `theia/applications/browser/package.json:67`) |
  | `editor`, mode `markdown-preview` | Theia editor on the source file | no markdown preview package is installed; one log line names the mode |
  | `diff`, `unstaged` / `staged` / `branch` / `commit` | Theia diff editor | `DiffUris.encode(left, right)` (`theia/node_modules/@theia/core/lib/browser/diff-uris.js:26-45`), left and right from P65-03 |
  | `diff`, `combined-*` (4 sources) | one Theia diff editor for the revealed entry, else the first entry of the snapshot | Theia 1.76 has no multi-diff editor; this is Theia's own workaround for `_workbench.openMultiDiffEditor` (`@theia/plugin-ext-vscode/lib/browser/plugin-vscode-commands-contribution.js:979-1000`) |
  | `conflict-review` | Theia merge editor for the active conflicted file, else the first | `MergeEditorUri.encode({ baseUri, side1Uri, side2Uri, resultUri })` (`@theia/scm/lib/browser/merge-editor/merge-editor.js:31-46`), base/ours/theirs from index stages 1/2/3 (P65-03), result the working file |
  | `check-details` | hosted pane: `CheckRunDetailsPanel` alone, `pb-orca:checks<n>` | a CI-run report, not a file editor: an Orca-only view (TAB-06); `EditorPanel` is not mounted |

  Reason: criterion 1 says every editor-type content type is routed so that Orca's own editor is never mounted; Theia ships an editor, a diff editor and a 3-way merge editor that cover the file-bearing modes, and the one mode with no file (`check-details`) keeps Orca's own report component without Orca's editor around it. The `check-details` row is the reading of "routes every editor-type content type to Theia" that keeps D-01's "other Orca-only views open as their own PB tab"; see Owner decisions open. — **Reversibility:** cheap; a row is one route-table value.
- **P65-02 (Claude's pick): the join is observed from Orca's store, one Theia editor per resource, close synchronised in both directions, local host only.** The pane bundle gains `subscribeOpenFiles(callback)`, which reports each editor-type tab with the `OpenFile` fields the route needs (`id`, `worktreeId`, `filePath`, `mode`, `diffSource`, `branchCompare`/`commitCompare` object ids, `conflict`, `isPreview`; `orca/src/renderer/src/store/slices/editor/types/open-file.ts:36-94`). Two Orca tabs naming the same resource map to the one Theia widget `EditorManager` returns. A Theia-side close calls Orca's close for every mapped Orca tab through P64-11's entry point. An Orca-side close disposes the Theia widget only when it is not dirty; a dirty editor stays open as a plain Theia editor, so no unsaved text is lost. Orca's open selection (`EditorTabSelection`: `focus`, `background`, `none`, `open-file.ts:119`) maps to Theia's `activate`, `reveal`, `open`. A file the user opens in Theia directly creates no Orca tab (PB never writes tabs into Orca, P64-10). A tab whose worktree is not on the local host (`Worktree.hostId`, `orca/src/shared/worktree/types.ts:91-170`; `OpenFile.externalSshTargetId`, `runtimeEnvironmentId`) opens nothing and logs one line naming the content type and "remote host", the P64-01 rule for an undelivered route. Reason: Theia's backend reads only this machine's file system, and P63-24 found no remote stack in the pinned orcad.
- **P65-03 (Claude's pick): the left side of a diff and the three merge sides come from a read-only `pb-orca-git:` resource scheme served by the Theia backend running `git show`, addressed by object id.** A frontend `ResourceResolver` in the new extension (P65-28 lane p65-02) asks a backend service, which runs `git -C <worktree> show <spec>` with `execFile` (no shell). Inputs are validated at that boundary: the worktree must be a current PB-owned root (P65-05); `spec` must match a 40- or 64-hex object id plus a relative path, or an index stage `:0:`..`:3:` plus a relative path; a path containing `..` or starting with `/` is refused. Sources: `unstaged` = stage 0 vs working file; `staged` = `HEAD` blob (resolved to an id at open) vs stage 0; `branch` = `mergeBase` vs working file or `headOid`; `commit` = `parentOid` vs `commitOid` (all from `BranchCompareSnapshot`/`CommitCompareSnapshot`, `orca/src/shared/editor-tab-view-types.ts`). The URI carries no secret and no ref name, so a diff tab stored by a Setup reopens to the same content after a relaunch. `docs/URI-SCHEMES.md` gains a `pb-orca-git:` section stating that it is a content scheme inside `diff:` and `merge-editor:` URIs, never a tab address; `TabUriRegistry` is unchanged. Reason: PB ships no git provider (no `@theia/git`, no `vscode.git` plugin in `theia/applications/browser/package.json`); reading through orcad's `git.*` RPC would need a credential holder in the Theia backend, which P63-24 ruled out.
- **P65-04 (Claude's pick): research gate before the plan is fixed: `/gsd-plan-phase 65` research mounts every new hosted kind with the spike harness and answers the open questions below.** Kinds: `CheckRunDetailsPanel` alone, Orca's `Sidebar` (as `AppWorkspaceShell.tsx:68` mounts it, with its two scroll refs), `Settings` (`:92`), `OrchestrationCrewPanel` (`components/orchestration-crew/OrchestrationCrewPanel.tsx:113`), `RightSidebar` (`components/right-sidebar/index.tsx`), each top-level page of P65-10, and `NativeChatResumeOnRestartModal` (`app-shell/AppRootSurfaces.tsx:290`). For each it records the providers and the import list it adds (spike 004 Question 3 method). It also answers: whether `addRoot` with no workspace open reloads the frontend (P65-06); the host action that respawns a persisted terminal leaf after an orcad restart (P65-20, with P64-22's answer); whether a session-only client can pair from the same offer twice and whether offer rows accumulate in orcad's device registry across launches (P65-17); which browse branch stock web Add-project takes for the local host (P65-14). A kind that does not mount under Route A after two attempts follows P64-03's rule (Route B' for that kind only, recorded in the route table). **[P64 research: P64-03]**

### Worktrees as workspace folders (TAB-05, criterion 1)
- **P65-05 (Claude's pick): the PB-owned roots are exactly the store's non-archived local-host worktrees plus local-host folder workspaces, kept in sync through Theia's public `WorkspaceService`.** The bundle gains `subscribeWorktrees(callback)`, reading `worktreesByRepo` (`Worktree` = identity fields `& GitWorktreeInfo` with `path`, `isMainWorktree`, `isArchived`, `hostId`; `orca/src/shared/worktree/types.ts:50-65,91-170`) and the folder workspaces (`FolderWorkspace.folderPath`, `executionHostId`; `orca/src/shared/folder-workspace-types.ts:21-33`). The extension computes the wanted set and applies the difference with `spliceRoots`/`removeRoots` (`@theia/workspace/lib/browser/workspace-service.js:427-470`). The set of roots PB added is kept in `ProfileStorageService` (not workspace-prefixed); PB removes only roots in that set and never a root the user added. Archived worktrees are not roots, as Orca's own Add-project finalisation filters them (`components/sidebar/add-repo-skip-finalization.ts:25`). Reason: criterion 1 says each Orca worktree is a folder; roots let Theia's Explorer, search and VS Code extensions (D-06, EXT-01) see the worktrees, while a file opens in Theia's editor with or without a root.
- **P65-06 (Claude's pick, unsure): with no workspace open, PB opens one fixed workspace file, `<theia config dir>/workspaces/powerbrowser.theia-workspace`, and copies every `_global_:`-prefixed key to the new prefix first; with a workspace open, PB adds its roots to that workspace.** Facts: `spliceRoots` on no workspace creates an untitled workspace file (`workspace-service.js:444-450`), and `WorkspaceStorageService` keys every stored value by workspace (`_global_` when none, `workspace-storage-service.js:48-53`), re-keyed live on `onWorkspaceLocationChanged`. PB's per-mode layouts and the active mode are workspace-scoped through that prefix (`theia/extensions/tab-uris/src/browser/tab-uris-frontend-module.ts:187-197`), so the first Orca worktree would otherwise empty every mode's saved layout at the next launch. A fixed file name keeps the prefix stable across launches (Theia reopens the most recently used workspace). Converting a user's single-folder workspace into a multi-root one is Theia's own behaviour and is kept. Research confirms there is no reload (P65-04). — **Reversibility:** costly after release: a second migration would be needed to move the prefix again.
- **P65-07 (Claude's pick): when Orca removes a worktree or a project, the store drop removes the PB-owned roots under it, closes clean Theia editor, diff and merge tabs whose resources lie under it, and keeps dirty ones open.** Orca's own delete and remove dialogs (`components/sidebar/delete-worktree-dialog-copy.ts`, `RemoveFolderDialog.tsx`) are the only prompts; PB adds none. The roots are removed after the store reports the drop, not on the delete request, so a cancelled or failed delete (`Worktree.removalError`) changes nothing. Reason: a dirty buffer is user data (never cut data-loss handling); Theia keeps a deleted file's editor open in its deleted state.

### Orca side panel (TAB-07, criterion 2)
- **P65-08 (Claude's pick): the side-panel content is Route A, mounted by the same pane bundle (one store, one pairing) with new mount kinds, and styled by P64-14's scoping step.** New kinds: `sidebar`, `settings`, `orchestration`, `right-sidebar`, `page:<TopLevelView>` and `check-details`. Each view is a Theia `ReactWidget` whose root carries the pane-root attribute, so the scoped stylesheet applies unchanged; Orca dialogs the sidebar opens (Add project, remove, delete) portal to `document.body` and are covered by P64-14's portal selectors. The CSS live row of Phase 64 gains probes for the sidebar view and for the Add-project dialog. Reason: one bundle keeps every Orca surface on one `useAppStore` and one pairing; a second client per view would double the pairing and the memory (spike 004: 112.4 MB for the first client). **[P64 research: P64-03, P64-14]**
- **P65-09 (Claude's pick, Settings placement unsure): two view containers and a mode change, no activation hook.** Left: `powerbrowser-orca-view-container`, holding the Orca sidebar view, an Agents view (the orchestration panel, P65-12) and the Settings view. Right: `powerbrowser-orca-right-view-container`, holding one view that mounts Orca's `RightSidebar` (explorer, vault, workspaces, PR checks, source control, checks, ports and plugin panels, `orca/src/shared/ui-chrome-types.ts:96-107`), placed on the right as Orca places it. The Orca descriptor in `mode-descriptors.ts` gains `viewPlacements` for both containers, and its `SHIPPED_MODE_RULES` row becomes `left: 'open'`, `right: 'open'` with both container ids in `views` (the Coding row's shape, `mode-service.ts:113`), so the existing `ensureInArea` path docks them; P64-18's "no `onActivate`" stands. Each container gets a row in `POWERBROWSER_VIEW_FACTORY_IDS` (`theia/extensions/tab-uris/src/browser/view-factory-table.ts:33`, the `welcome` row is the in-tree precedent for a PB-owned id). Settings sits in the side panel because TAB-07 places it there; Orca's settings page is designed for the main area, and research records the narrowest usable width. The right sidebar is included because D-02 keeps "the rest of Orca's GUI" as Orca's and it holds Orca's own file and change lists, which are the user's in-Orca way to open the files and diffs of P65-01. — **Reversibility:** cheap; a view moves between containers or to a main-area `pb-orca:settings` tab by changing its registration.
- **P65-10 (Claude's pick): Orca's top-level views follow the store's `activeView`.** `TopLevelView` has 9 members (`ui-chrome-types.ts:120-129`). `terminal` (the workspace view) does nothing; `settings` reveals the Settings view; each of the other seven (`tasks`, `activity`, `automations`, `space`, `skills`, `artifacts`, `mobile`) opens or focuses one hosted main-area tab `pb-orca:<word>` (a singleton per view, minted as in P64-16, mounted by `page:<view>`), because each is an Orca-only page (D-01, TAB-06) that Orca's sidebar opens. PB writes `activeView` back only on Theia-side activation of such a tab, so the sidebar's highlighted entry follows the dock. The route table gains these rows and the route check derives the union (P65-27). Reason: Orca's sidebar opens these pages by setting `activeView` (`app-shell/AppWorkspaceShell.tsx:88-110`); without a target the sidebar's buttons would do nothing.
- **P65-11 (Claude's pick): a worktree selected in the hosted sidebar runs Orca's own store action, and PB then activates the most recently active PB tab of that worktree.** Any tab Orca's action creates (for example a first terminal of a worktree with none) becomes a PB tab through Phase 64's mapping; PB creates nothing itself. The reverse direction is P64-23's (PB sets the store's active worktree when an Orca tab is activated), so the two never loop: both write the same value. **[P64 research: P64-23]**
- **P65-12 (Claude's pick): the Agents view hosts Orca's `OrchestrationCrewPanel` for the focused Orca agent tab, and exists only while Orca's experimental setting is on.** Orca gates every orchestration mount on `settings.experimentalOrchestrationPanel` (`components/orchestration-crew/use-orchestration-panel-enabled.ts:4-5`); PB registers the view while the store reports it true and removes it otherwise, so a disabled panel is absent as in Orca and PB writes no empty-state copy. The panel's `target` and `party` come from the focused tab: a hosted chat by its session id (`NativeChatCrewPanel.tsx`, `formatOrcaSessionAddress`); a local `o<n>` terminal by its pane key (P64-02) through Orca's `useTerminalCrewIdentity`. Mention inserts into a focused hosted chat's composer through a bundle call; for a terminal target `canMention` is false, because Orca's terminal mention writes through `TerminalPane`'s transport, which PB does not mount for local terminals (`TerminalCrewPortals.tsx:54-80`). The in-chat crew overlay that `NativeChatView` renders stays as Orca renders it (removing it would be a modification).
- **P65-13 (Claude's pick): Orca's Settings is mounted unchanged; no section is hidden or rewritten.** Sections that act on things PB owns (terminal appearance, now Theia terminals; the editor, now Theia's; telemetry, forced off by `ORCA_TELEMETRY_DISABLED`, P62-04) are recorded in Deferred Ideas as known divergences, not edited. Reason: TAB-07 says "behave as in Orca"; hiding a section is a modification without a requirement.

### Orca's Add-project flow (TAB-09, criterion 3)
- **P65-14 (Claude's pick): Orca's Add-project and remove flows run unchanged in the hosted sidebar, and "as in stock Orca" means as in Orca's own web client at the pin.** The live expectation is derived from the standalone page of spike 004 (`--route standalone`), which runs stock Orca's renderer unmodified: the same steps, run there and in PB's side panel, must give the same `orca repo list` result and the same sidebar rows. The web build's native pickers return nothing (`orca/src/renderer/src/web/preload-api/web-repositories-api.ts:48-50`); whatever the stock web client offers instead (typed path, runtime browse, clone, create), PB offers the same and adds no folder picker of its own. A new project's worktrees then become roots through P65-05. Reason: D-18, Orca's own flow unchanged and no PB button. **[P64 research: P64-14, dialog portals]**
- **P65-15 (Claude's pick): the "no PB Add-project control" check derives its vocabulary from Orca's source and compares it with every PB contribution.** Vocabulary: the default strings of Orca's sidebar Add-project affordances (`translate(...)` calls whose default matches `add (a )?project` in `components/sidebar/`, at the pin `SidebarHeader.addProject`, `SidebarFilter`, `AddRepoStartSteps`) and the `AddRepoDialog` entry. PB contributions: every command id and label, menu action, tab-bar toolbar item and keybinding registered in `theia/extensions/*/src`, plus the chrome bar's button `title`/`aria-label` strings, parsed with `theia/node_modules/typescript` (P63-27's parser rule). The intersection must be empty, and a vocabulary of zero strings is red ("source moved"). Stock Theia contributions (for example `workspace:addFolder`) are out of the PB set by construction.
- **P65-16 (Claude's pick): P64-21's "New Orca Chat" and "New Orca Terminal" commands are kept.** They create panes, not projects, so P65-15 does not match them; Orca's tab bar, the only in-pane creation surface, is still not rendered (D-29).

### Setups restore and re-pairing (TAB-08, criterion 4)
- **P65-17 (Claude's pick, unsure): the hosted client pairs session-only, again at every document start, from the offer file P64-07 hands over.** Before Orca's start-up, the PB entry presets Orca's device-key support to `session-no-ed25519` through Orca's exported `setWebDeviceKeySupportForTests` (`orca/src/renderer/src/web/web-device-key-support.ts:20`; `initWebDeviceKeySupport` keeps a preset value). Effects at the pin: the paired environment lives in memory and the `orca.web.runtimeEnvironment.v1` localStorage key is removed (`web-runtime-environment.ts:34,84-90`); the device row is an in-memory `ephemeral` row that is not persisted, never expires while connected, and is dropped on an orcad restart (`orca/src/main/runtime/device-entry.ts:37-38`, `ephemeral-device-rows.ts:3-26`); Orca's "pairing lasts only while this tab is open" notice is rendered only by `WebConnect.tsx:37` and `web/main.tsx:83`, neither of which PB mounts. Reasons: the Theia origin changes on almost every launch (port 0, `powerbrowser/shell/TheiaService.sys.mjs:818-819`; `theia/extensions/tab-uris/src/browser/profile-storage.ts:13-15`), so a persisted pairing is unreachable at the next launch anyway, and a persisted device key left in a dead `http://127.0.0.1:<port>` origin's storage stays valid in orcad's on-disk registry (`device-registry.ts:53-54`) for any later page served on that port. A frontend reload within one orcad lifetime re-pairs from the same offer file. Research confirms the offer can seed more than one session pairing and whether each start's offer row (`server/serve-pairing-readiness.ts:19-30`) accumulates in the registry; if rows accumulate, `OrcaService` revokes the previous start's offer row by its non-secret device id at the next start (a research-named orcad command), and never logs a token. — **Reversibility:** cheap until release; the alternative is a declared seam that makes the web client's storage choice an option.
- **P65-18 (Claude's pick): the `pb-orca:` name map survives a relaunch, and a name is never reissued while a saved Setup or the session snapshot names it; this amends P64-16's minting rule.** The map name → `{ kind, worktreeId, orcaTabId }` is kept in `ProfileStorageService` (not workspace-prefixed), written on mint. When Orca drops a tab the entry becomes a tombstone; tombstones are pruned at launch against the URIs in `setups.json` and the session snapshot (`SESSION_STORAGE_KEY`, `theia/extensions/modes/src/browser/setups-service.ts:86`), read through the modes extension's exported reader. Minting takes the lowest index free of live entries and tombstones. Orca tab ids are persisted with Orca's workspace session in its data root and stay the same across orcad restarts (research confirms). Reason: a Setup stores only the URI (`setups-service.ts:915-937`); without the map a Setup saved days ago cannot find its tab, and with plain lowest-free reuse it could open a different tab under the old name.
- **P65-19 (Claude's pick): during a restore the `pb-orca:` opener returns a widget at once, which waits for the store and then attaches or disposes itself.** The opener resolves the name through P65-18's map and returns an `OrcaPaneWidget` in its waiting state, as P64-28's layout-restore path already creates one, so `restoreDock` places it in its saved split and tab area (`setups-service.ts:1075-1125`). After the store hydrates the widget mounts its pane; if the Orca tab is gone it disposes itself, logs one line and adds a diagnostics row. A name with no map entry returns `null`, the existing "dropped" path with its notice. Reason: the restore runs at the shell's `ready` state (`setups-service.ts:518-521`), before orcad and the pairing are guaranteed ready; an opener that waited would stall the whole restore, and one that failed fast would drop every Orca tab.
- **P65-20 (Claude's pick): a local Orca terminal comes back under its old `o<n>` name, attached to a new PTY in its restored widget.** After a relaunch the restored `o<n>` widgets are dead by design (P63-28: `kind: 'orca'`, a failed attach returns -1 instead of a fresh shell), and the agent that ran in them ended at quit (D-07). Orca's persisted terminal leaf is respawned once through the host action research names (P64-22's question); the frontend keeps a map pane key → `o<n>` in `ProfileStorageService` and hands it to the bridge when the bridge connects, and the bridge's allocator gives the respawned PTY the recorded name for its `ORCA_PANE_KEY` (P64-02) instead of the lowest free one, so the restored widget attaches in place and keeps its dock position, Organising row and Setup address. Fallback, if the widget cannot attach a second process: dispose it and open the new one with `addWidget(..., { ref })` at the same position. The PTY shows a fresh shell, not the old agent; Orca's own resume offer covers agents (P65-22). **[P64 research: P64-22, P64-02]**
- **P65-21 (Claude's pick): Theia editor, diff and merge tabs restore through Theia's own URIs with no Orca step.** `file:` tabs restore natively; `diff:` and `merge-editor:` tabs reopen through the opener because their `pb-orca-git:` sides are stateless (P65-03). When Orca's store hydrates its persisted editor tabs, the mapper finds the already-open widget (one widget per resource, P65-02) and opens nothing twice.
- **P65-22 (Claude's pick): Orca's own resume offer for agents ended at quit is mounted in the bundle's hidden services root.** Orca mounts `NativeChatResumeOnRestartModal` at its app root (`app-shell/AppRootSurfaces.tsx:290`), the same level as the confirmation providers P64-11 mounts there. Reason: "connected" after a relaunch means the tabs show the new orcad's live state; resuming a stopped agent session is Orca's own step (D-06 item 3's floor, `--resume`), not a PB one. If research finds the modal needs Orca's app shell, it is recorded as not delivered and deferred.
- **P65-23 (Claude's pick): one offer scanner, `scripts/lib/orca-offer-scan.mjs`, shared with Phase 67's RUN-07.** It takes the live offer from the offer file in memory (never printed, never written elsewhere) and searches each sink for the full pairing URL, the device token, and their percent-encoded and base64 forms. Phase 65's sinks: `setups.json`, the profile's `powerbrowser-shell-state.json` (Theia layouts, the session snapshot, the P65-18 and P65-20 maps), and Gecko's per-origin storage for every `127.0.0.1` origin in the profile (`storage/default/http+++127.0.0.1+*`), where P65-17 requires the `orca.web.runtimeEnvironment.v1` key to be absent. Output names the sink and a match count only. Its `--self-test` plants the offer in a copy of each sink and requires each to go red naming the sink; a run that found zero sinks to read is red. Phase 67 adds history, session restore, logs, the address field and copyable text as further sinks of the same scanner (coordinator note).

### Egress
- **P65-24 (Claude's pick): no new host is expected; the egress row is re-run with the Orca side panels rendered, and any host Orca's renderer code contacts from the Theia document gets an allowlist row with its measured disposition.** Under Route A Orca's sidebar and right sidebar run in the Theia document, so any avatar, favicon or API fetch they make is PowerBrowser egress (`scripts/verify-endpoints.sh`, `powerbrowser/endpoint-allowlist.json`). A host contacted only after a user action takes `user-initiated` (the P62-15 precedent); a host contacted unattended at launch is recorded and needs an owner decision before it is allowlisted. Reason: the allowlist is derived from measurement, never guessed.

### Seams and overlay
- **P65-25 (Claude's pick): zero new seam patches.** Every Orca-side change is PB-added code in the overlay entry (new mount kinds, `subscribeOpenFiles`, `subscribeWorktrees`, `subscribeActiveView`, the session-only preset, the resume modal), compiled by Orca's toolchain with the `pb-overlay:` marker (P62-20). The overlay keeps 3 of 10 seams (010, 020, 030; 070 and 080 planned in Phase 68). `orca-overlay` and `orca-overlay-built` stay green.

### User-facing copy
- **P65-26 (Claude's pick): no new PB-authored copy beyond the two container labels and the view titles, which take Orca's own section names.** Container labels: "Orca" (left) and "Orca" with Orca's right-sidebar name where the source has one; view titles from Orca's own strings, derived at build time where they exist. Failure states in the side panel are log lines and diagnostics rows until Phase 67's page (P62-13's rule). `shell-error-copy-no-internals` stays unchanged.

### Checks (one registry, derive and compare)
- **P65-27 (Claude's pick): every check is one row plus a `-self-test` row in `scripts/verify-platform.sh`, expectations derived from the pinned Orca source or the tree and compared as sets.** Quick rows print a named SKIP and exit 0 when `orca/` or the build they read is absent (P62-10). Live rows run under `flock /home/chris/coding/Power-Browser/.git/pb-live.lock` with caches purged. New rows:
  - `orca-editor-routes` and its self-test (quick, criterion 1): parse `tab-types.ts`, `open-file.ts` and `editor-tab-view-types.ts` with `theia/node_modules/typescript` to derive the editor-type content types (members `toVisibleTabType` maps to `editor`), the `OpenFile.mode` members and the `DiffSource` members; compare each set with the keys of the orca-workspace handler table; require every value to be a Theia target kind (`theia-editor`, `theia-diff`, `theia-merge`) except the named `check-details` row; derive `TopLevelView` and compare with the page rows of P65-10. Plants: an added mode, an added diff source, an added top-level view, a handler naming `EditorPanel`, a zero-member parse.
  - `orca-pane-entry` (extended, Phase 64's row): the entry's import graph reaches no `components/editor/EditorPanel*.tsx` or `EditorContent.tsx` (D-01); plant: an `EditorPanel` import.
  - `orca-no-pb-add-project` and its self-test (quick, criterion 3): P65-15. Plants: a PB command labelled with an Orca Add-project string, a toolbar item, a chrome-bar button title, an empty vocabulary.
  - `orca-workspace-live` (live, criterion 1): an Orca open of a file becomes a Theia Monaco editor on that `file:` URI within 1 s; each diff source of P65-01 opens a Theia diff editor whose left text equals `git show` of the derived spec; a conflict opens the merge editor; no Orca Monaco DOM exists inside any Orca pane root (positive control first: the same selector finds Orca's editor on the standalone page); the PB-owned roots equal the store's non-archived local worktree paths as a set; a worktree created by `orca worktree create` adds a root, its deletion removes it, closes a clean editor under it and keeps a dirty one; a user-added root survives (plant).
  - `orca-side-panel-live` (live, criterion 2): the Orca mode shows both containers; each view mounts (sidebar rows equal `orca repo list`/`worktree list` as a set; a settings toggle round-trips to orcad; the Agents view appears and disappears with the experimental setting); a sidebar worktree click activates that worktree's PB tab; a sidebar page entry opens its `pb-orca:<word>` tab; the Phase 64 CSS row, extended with the side-panel and dialog probes, stays at 0 changed values with its controls registering.
  - `orca-add-project-live` (live, criterion 3): Orca's Add-project dialog adds a scratch repository and the sidebar remove removes it, in PB's side panel and on the standalone page, with equal `orca repo list` results; the root appears and goes.
  - `orca-offer-scan` and its self-test (quick self-test, live run, criterion 4): P65-23.
  - `orca-relaunch-restore-live` (live, criterion 4): in a scratch profile, open in Orca and Coding modes a hosted chat, an Orca terminal split into two `o<n>` tabs, an editor and a diff; save a Setup; quit normally; relaunch; restore the Setup. Required: the restored main-area dock equals the saved one node by node (tab URIs as sets per tab area, split orientation and order), each mode's tabs as saved, the chat pane hydrated from the new orcad, each `o<n>` echoing typed input on a new PTY under its old name, no Orca pairing UI DOM and no input event between relaunch and connection, and `orca-offer-scan` green over the profile.
  - Extended, not new: `verify-uri-roundtrip.mjs` gains the page and `checks` names; `verify-mode-toggle-commands.mjs` covers the changed Orca rules row unchanged; `verify-endpoints.sh` per P65-24; `gui04-registry-shape` and `verify-registry-shape.mjs` must stay green with the new factory-table rows.

### Mechanics and lane cut
- **P65-28 (Claude's pick): four wave-1 lanes with disjoint files, then a coordinator plan; the research gate (P65-04) runs first, inside plan-phase.** The bundle API additions are fixed in the plan's interfaces block, so lanes p65-02..04 build against fixtures while p65-01 builds the real API.
  - **p65-01 (Orca side):** `orca-overlay/files/**` (new mount kinds, `subscribeOpenFiles`, `subscribeWorktrees`, `subscribeActiveView`, the mention call, the session-only preset, the resume modal in the services root), the standalone-mount and CSS harness additions under `scripts/lib/`, the `orca-pane-entry` clause, and its `# NEW (65-01, …)` registry blocks.
  - **p65-02 (Theia editor, diff and roots):** a new extension `@powerbrowser/orca-workspace` (`theia/extensions/orca-workspace/**`: route handlers, root sync and the PB-owned root set, storage-key migration, close sync, the `pb-orca-git:` resolver and backend `git show` service), the four editor-type rows in orca-panes' route-table file, `docs/URI-SCHEMES.md` (`pb-orca-git:`), `theia/package.json` and `theia/applications/browser/package.json` for the new extension, `scripts/verify-orca-editor-routes.mjs`, `scripts/verify-orca-workspace-live.mjs`, and its registry blocks.
  - **p65-03 (side panel and modes):** new files under `theia/extensions/orca-panes/src/browser/side-panel/**` (containers, views, `activeView` reaction, sidebar activation, Agents view), the page rows in orca-panes' route table, `mode-descriptors.ts`, the Orca row in `mode-service.ts`, the two rows in `view-factory-table.ts`, `powerbrowser/endpoint-allowlist.json` rows if P65-24 measures any, `scripts/verify-orca-no-pb-add-project.mjs`, `scripts/verify-orca-side-panel-live.mjs`, `scripts/verify-orca-add-project-live.mjs`, and its registry blocks.
  - **p65-04 (restore and re-pair):** new files under `theia/extensions/orca-panes/src/browser/restore/**` (name map, tombstones, the opener's waiting path), the pane-key → `o<n>` map and its hand-off in `theia/extensions/orca-terminals` (frontend and bridge allocator), the setups reader export in `theia/extensions/modes`, `powerbrowser/shell/OrcaService.sys.mjs` only if P65-17's offer-row revoke is needed, `scripts/lib/orca-offer-scan.mjs`, `scripts/verify-orca-offer-scan.mjs`, `scripts/verify-orca-relaunch-restore-live.mjs`, and its registry blocks.
  - **p65-05 (coordinator):** merges 01, 02, 03 and 04 in that order, each by `refs/heads/<branch>`; resolves the expected textual conflicts (orca-panes' frontend module and route-table file, registry blocks, Theia `package.json`/`yarn.lock`); rebuilds Orca (the pane bundle), Theia (audited install, new workspace package) and PowerBrowser (chrome JS edits need `-purgecaches`); runs the extended CSS row first (P64-15's order), then the live rows; re-measures brand rows; updates tracking; records the Deferred Verification table.

  Only the coordinator edits `STATE.md`, `ROADMAP.md`, `REQUIREMENTS.md` tracking, `WINDOWS.md` and `inventory/brand-tokens.json`; nobody edits the ledger. Lanes stage their files and record their brand-scan report for the coordinator (the "Orca" token in new paths and strings is classified only in `brand-tokens.json`). Lanes that build Theia use the audited install from `docs/BUILD.md` (59-CONTEXT D-07). Each lane runs in its own worktree. No human checks (D-18).

### Claude's Discretion
- File layout inside `orca-workspace` and the side-panel and restore directories; the backend service name for `git show`; the fixed workspace file name in P65-06; the storage key names of P65-05, P65-18 and P65-20; the waiting widget's bound before it disposes; the tombstone pruning schedule; view ids inside the containers; the exact name words for the page tabs.

### Deferred Ideas (OUT OF SCOPE)

- Remote-host worktrees as workspace folders and their files in Theia's editor (needs a remote file system provider; P63-24 found no remote stack in the pinned orcad).
- Orca editor features with no Theia equivalent: inline diff comments and "send notes to agent", markdown rich mode and preview, CSV preview, a true multi-file combined diff (Theia 1.76 has no multi-diff editor).
- Known Settings divergences (P65-13): terminal appearance settings do not apply to Theia terminals; editor settings do not apply to Theia's editor; the telemetry toggle has no effect while `ORCA_TELEMETRY_DISABLED` is set.
- Orca's resume offer if research shows it needs Orca's app shell (P65-22).
- Phase 66 may add Orca browser tools as views in the containers created here (BRW-05).

### Owner decisions open (auto-mode picks Chris may override)
| Pick | What was decided | What an override changes |
|------|------------------|--------------------------|
| P65-01 | `check-details` stays Orca's own report component (without Orca's editor) in a `pb-orca:checks<n>` tab, read as an Orca-only view | A Theia read-only document of the check log, losing jobs, annotations and Orca's fix action |
| P65-06 | With no workspace open, PB creates a fixed workspace file and migrates the `_global_` keys once | Theia's untitled workspace with its random name and no key migration |
| P65-09 | Settings is a view in the left side panel; Orca's right sidebar is a right-area container | Settings as a main-area `pb-orca:settings` tab; no right sidebar (Theia's Explorer becomes the only file list) |
| P65-17 | The hosted client pairs session-only each launch through an Orca function named `...ForTests` | A declared seam making the storage choice an option (counts against the cap of 10) |

### Corrections for the coordinator
- P65-01 amends P64-01: `conflict-review` moves from a hosted `EditorPanel` to Theia's merge editor and `check-details` from `EditorPanel` to `CheckRunDetailsPanel` alone. If Phase 64 has merged hosted `EditorPanel` rows, Phase 65 removes them and the `orca-pane-entry` clause of P65-27 goes red until it does.
- P65-18 amends P64-16's minting rule (tombstones while referenced).
- P65-23: Phase 67's RUN-07 plan extends `scripts/lib/orca-offer-scan.mjs` with its sinks rather than writing a second scanner.
- Phase 67's RUN-06 failure state applies to the side-panel views as well as to `OrcaPaneWidget` tabs.

### Deferred Verification (59-CONTEXT D-18)
| Item | Why deferred | Runs in |
|------|--------------|---------|
| Orca's sidebar, settings, Agents view and right sidebar look and behave as in Orca at the side panel's default width | Computed-value counts prove isolation, not visual parity or usability | End-of-milestone pass |
| Orca's Add-project dialog is usable in the Theia document (typing, browsing, clone) | Interaction check | Same |
| A diff and a merge opened from Orca's source-control panel read correctly in Theia's diff and merge editors | Visual check | Same |
| After a real quit and relaunch, a restored Setup feels connected with no step (no flash of an empty pane) | Timing and appearance | Same |
| Owner items P65-01, P65-06, P65-09, P65-17 | Owner decisions | Same |

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TAB-05 | Files and diffs open in Theia's editor, with Orca worktrees opened as Theia workspace folders; Orca's own editor is not used | Q3, Q4 and Q2 below; Context amendments CA-01..CA-06; route rows in "Pattern 1"; `orca-editor-routes`, `orca-workspace-live` |
| TAB-07 | Orca's worktree sidebar, settings and orchestration panel live in a PB side panel and behave as in Orca | Q6; CA-10, CA-11; "Pattern 3"; `orca-side-panel-live` |
| TAB-08 | Setups restore re-pairs Orca tabs and never persists the pairing offer | Q1, Q5; CA-07..CA-09, CA-12; "Pattern 4"; `orca-offer-scan`, `orca-relaunch-restore-live` |
| TAB-09 | Orca's own Add-project flow and sidebar remove behave as in Orca; PB adds no Add-project control | CA-13 (browse branch); `orca-no-pb-add-project`, `orca-add-project-live` |
</phase_requirements>

## Summary

The six research questions all have answers in source, and four of them change a pick.

1. **P65-17 (pairing):** one offer can seed many session pairings, but rows do accumulate. The offer's token row stays a valid bearer credential after its first use. Each pairing forks a new keyed row, at most 32 per token row (`device-key-fork.ts:5`). orcad reuses a startup offer only while nobody has used it, so every launch in which PB paired leaves one used runtime token row in `<profile>/powerbrowser-orca/orca-devices.json`; Orca's own test asserts exactly this. Session-only keyed rows are written to that file too, and orcad drops them when it next loads the file. Headless orcad has no public command that revokes a runtime-scope row. `setWebDeviceKeySupportForTests` is a plain production export with no lint fence, and Orca has no public alternative to it. Gecko reports `persistent` on the Theia origin (spike 004), so without the preset every launch would also leave a never-pruned keyed row and an IndexedDB key in a dead origin. **The preset stays; the "revoke the previous row" clause is dropped (CA-07).**
2. **P65-06 (first workspace folder):** there is no reload. `spliceRoots` → `save()` → `setWorkspace()` changes only the URL fragment and fires `onWorkspaceLocationChanged`; Theia reloads only in `openWorkspace`/`close`. Copying the old prefix's keys is enough, because every workspace-scoped PB value is a `<prefix>:<key>` entry in `ProfileStorageService`'s one map. Two corrections: a single-folder workspace takes the same untitled path, and a basename starting `Untitled` triggers Theia's "save your workspace?" prompt on every quit. That prompt is the strongest reason for the fixed file name (CA-04, CA-05).
3. **P65-01 (editors):** `@theia/scm` 1.76 is installed and its merge editor is generic over URIs; it opens any `merge-editor:` URI at priority 1000. If the base cannot be read it falls back to an empty editor, but a side that cannot be read fails the whole editor. So only `both_modified` and `both_added` conflicts can use it (CA-02). Theia 1.76 has no multi-diff editor (confirmed). Corrections: a `conflict-review` tab's `filePath` names the worktree root, not a file; Orca's `branch` diff compares `mergeBase` with the `headOid` blob, not the working file (CA-01, CA-03). `CheckRunDetailsPanel` imports no Monaco and no `EditorPanel`, so "Orca's own editor is never mounted" holds for `check-details`. "Routes to Theia" holds only if a PB `ReactWidget` tab counts as Theia, so the owner item stays.
4. **P65-03 (`pb-orca-git:`):** read with `git cat-file blob -- <spec>`, which is how Orca itself reads blobs (`git-blob-read.ts:89-98`), not `git show`. `cat-file blob` refuses trees and runs no textconv or filter programs. Validate the spec with the regexes in "Pattern 2". Index-stage URIs (`:0:`..`:3:`) are not stable across a relaunch, so the "reopens to the same content" claim holds only for object-id URIs (CA-06).
5. **P65-20 (terminal re-attach):** yes. `TerminalWidgetImpl.start(id)` on the same widget re-attaches, and Theia's own `reconnectTerminalProcess` does exactly this. Phase 63's opener (branch `ServerDestroyer/p63-02`) returns early when a widget of that name exists, and its backend reserves restored names. Those two lines are what Phase 65 changes; the dispose-and-reopen fallback is not needed (CA-08).
6. **P65-09/P65-10 (side panel):** use Theia's own view-container pattern (`ViewContainer.Factory` + `addWidget` + one `AbstractViewContribution` per container). It needs no core edit, and `ensureInArea` docks any factory id. One gap: Orca's `terminal` view also shows worktree-creation progress and errors (`AppWorkspaceShell.tsx:101-106`), so "terminal does nothing" loses that surface (CA-11).

Also found: in a paired web client the orcad's worktrees are runtime-owned, so P65-02's "local host" test cannot be `hostId === 'local'` (CA-12). Add-project's Browse in PB's document takes the `server-path` step through orcad's `files.browseServerDir`, never a native picker (CA-13).

**Primary recommendation:** plan the four lanes as P65-28 cuts them, with the amendments below. Wave 0 of lane p65-01 runs the P65-04 mount gate under the live lock before the side-panel lane's live rows are trusted.

## Context amendments

Each amendment names the pick, what changes, and the evidence. Picks not listed stand as written.

**D-31 amendment (coordinator, 2026-11-10; owner ruling).** Q5 and CA-08 (re-attaching a restored Phase 63 `o<n>` widget, and the opener and allocator edits in `orca-terminals`) are moot: Orca terminals are hosted `TerminalPane` tabs (64-CONTEXT P64-30) and restore through the `pb-orca:` name map like every hosted pane. Every `pty-bridge` reference means lane p63-06's bridge folder. Picks: 65-CONTEXT P65-29..P65-32.

| # | Pick | Amendment | Evidence |
|---|------|-----------|----------|
| CA-01 | P65-01 `conflict-review` row | A conflict-review tab's `filePath` names the worktree root, not a file. The merge target is the file of `conflictReview.selectedFileId` if set, else `conflictReview.entries[0].path`, joined to the worktree path. | `open-file.ts:33` "conflict-review paths name roots, not files"; `ConflictReviewState` at `editor-tab-view-types.ts:63-68` `{ source, snapshotTimestamp, entries: ConflictReviewEntry[], selectedFileId?: string }` [VERIFIED: read] |
| CA-02 | P65-01 `conflict-review` row | Route by `conflictKind`: `both_modified` and `both_added` → Theia merge editor (`both_added` has no stage 1; the base falls back to empty). `added_by_us`, `added_by_them`, `deleted_by_us`, `deleted_by_them`, `both_deleted` → Theia editor on the working file if it exists, else one log line naming the content type and the kind (the P64-01 undelivered-route rule). Reason: `createMergeEditor` catches a failed base (`merge-editor-module.js`, "Base URI resolution failed, using empty fallback") but not a failed side. A missing stage 2 or 3 would fail the whole editor. | `GitConflictKind` = `'both_modified' \| 'both_added' \| 'both_deleted' \| 'added_by_us' \| 'added_by_them' \| 'deleted_by_us' \| 'deleted_by_them'` (`git-status-types.ts:3-10`) [VERIFIED: read] |
| CA-03 | P65-03 sources | `branch` = `mergeBase`:(`branchOldPath` ?? path) vs **`headOid`**:path. Orca never diffs a branch against the working file. A null `mergeBase`, `headOid` or `parentOid` is an empty side. `staged` = `HEAD`:(oldPath ?? path) vs `:0:`path. `unstaged` = `:0:`path vs the `file:` working file. | `branch-diff.ts:44-51` reads `readGitBlobAtOidPath(..., args.mergeBase, leftPath, ...)` and `(..., args.headOid, args.filePath, ...)`; `GitBranchCompareSummary` has `baseOid: string \| null`, `headOid: string \| null`, `mergeBase: string \| null` (`git-diff-compare-types.ts:14-25`) [VERIFIED: read] |
| CA-04 | P65-06 | The fixed-file path and the key copy apply whenever `!workspace \|\| workspace.isDirectory`, not only when no workspace is open. `spliceRoots` sends a single-folder workspace through the same untitled-file path, so its prefix (the folder URI) moves too. Copy every key that starts with `<current prefix>:` to `<fixed file URI>:`, then `save(fixedUri)`, then `spliceRoots`. `save()` keeps the folder as a root, because it writes `this._roots`. | `workspace-service.js:444-450` (`if (!this._workspace \|\| this._workspace.isDirectory) { const untitledWorkspace = await this.getUntitledWorkspace(); await this.save(untitledWorkspace); ...`), `:588-620` (save) [VERIFIED: read] |
| CA-05 | P65-06 | The fixed name is **required**, not just convenient. Theia's `onWillStop` shows "Do you want to save your workspace configuration as a file?" for any workspace whose basename starts with `Untitled`, which would block every PB quit. `powerbrowser.theia-workspace` is not untitled. The file sits under `<profile>/powerbrowser-theia/workspaces/` (`THEIA_CONFIG_DIR`). ProfileStorageService needs one public accessor that lists the map's keys by prefix: it keeps the map in `protected loadedMap`, so there is no way to enumerate it today. Lane p65-02 adds that accessor to `theia/extensions/tab-uris/src/browser/profile-storage.ts`; no other lane touches that file. | `workspace-frontend-contribution.js:479-501`; `untitled-workspace-service.js:30-36` (`if (!candidate.path.base.startsWith('Untitled')) { return false; }`); `TheiaService.sys.mjs:616-618` (`return \`${profileDir}/powerbrowser-theia\`;`), `:839` (`THEIA_CONFIG_DIR: this._configDir`) [VERIFIED: read] |
| CA-06 | P65-03 / P65-21 | Read with `git -c core.fsmonitor=false -C <root> cat-file blob -- <spec>` through `execFile`, not `git show`. Only object-id URIs reopen to identical content after a relaunch; index-stage URIs (`:0:`..`:3:`) show the index as it is at reopen. The URI shape is fixed in Pattern 2. | Orca: `gitExecFileAsyncBuffer(['cat-file', 'blob', '--', spec], readOptions)` with `spec = \`${oid ?? ''}:${gitPath}\`` (`git-blob-read.ts:89,98`) [VERIFIED: read]; fsmonitor on index read [ASSUMED] |
| CA-07 | P65-17 | Keep the session-only preset. Drop "if rows accumulate, `OrcaService` revokes the previous start's offer row by a research-named orcad command": no such command exists for headless orcad. The measured growth (one used runtime token row per launch that paired; keyed rows only while orcad runs) goes to Phase 67 as an owner item with two options: (a) accept it, since holder 5 is a same-user 0600 file; (b) before spawning orcad, chrome removes from `orca-devices.json` the rows PB minted earlier, an external edit that Orca's registry is designed to adopt. Correct "the device row ... is not persisted": the session-only keyed row is written to `orca-devices.json` and dropped when orcad next loads the file. The bootstrap asserts `readWebDeviceKeySupport() === 'session-no-ed25519'` and `readStoredWebRuntimeEnvironment()?.sessionOnly === true` before it connects, and refuses to pair otherwise. | See Q1 below |
| CA-08 | P65-20 | The restored `o<n>` widget re-attaches in place with `widget.start(newProcessId)`. The fallback (dispose, then `addWidget(..., { ref })`) is removed. Phase 63's opener and allocator change as described in Q5. | See Q5 |
| CA-09 | P65-23 | The scanner is the shared needle-and-sink library that Phase 67's `scripts/verify-orca-pairing-containment.mjs` (P67-10) imports. Its needle set is P67-10's (raw code, URL-encoded, `orca://pair?`, `#pairing=`, decoded `deviceToken`), not a smaller one. The localStorage key-absence probe reads the origin's `ls/data.sqlite` key column through `node:sqlite` on a copy. Its positive control is a marker key that the live run writes through the page first. Values are not scanned, because P67-11 says Gecko may compress them. | P67-10, P67-11 (67-CONTEXT); `node:sqlite` present on Node v24.22.1 [VERIFIED: probe]; Gecko LSNG schema [ASSUMED] |
| CA-10 | P65-09 | Each container is a `WidgetFactory` (id = container id) that builds a `ViewContainer` through `ViewContainer.Factory`, sets its title, and `addWidget`s its parts. Each container also gets one `AbstractViewContribution` whose `widgetId` is the container id, so `TabUriRegistry` finds it for `view:` URIs. Without that contribution, the new `view-factory-table.ts` rows make `tab-uri-registry.ts:64-71` log a startup error. The Agents part is added and removed with `ViewContainer.addWidget`/`removeWidget`. | `view-container.d.ts:86,99,102,151-171`; `view-contribution.d.ts:13-20`; `tab-uri-registry.ts:51-71`; `mode-service.ts:414-424` [VERIFIED: read] |
| CA-11 | P65-10 | `terminal` is not inert in Orca. While a worktree creation is pending it renders `WorktreeCreationPanel` (progress, error, dismiss) or `PendingNativeChatCreation` (a chat usable before its worktree exists). Add a hosted kind `page:creation` (singleton `pb-orca:creating`), opened while `activePendingCreationId` is set and closed when it clears. If the P65-04 gate cannot mount it, record "worktree-creation progress has no surface" in Deferred. | `AppWorkspaceShell.tsx:101-106`; `worktree-creation-surface.ts:9-15`; `WorktreeCreationPanel.tsx` header "Debounced in-frame creation placeholder" [VERIFIED: read] |
| CA-12 | P65-02, P65-05 | The local predicate is "owned by PB's paired orcad (`runtimeOwnerEnvironmentId` equals the paired environment id, or absent) and `hostId` does not parse to `ssh` or to another runtime". It is not `hostId === 'local'`. The web client stamps orcad's worktrees as runtime-owned. The exact `hostId` value orcad reports for its own worktrees must be read from a fixture (`orca worktree list --json`) in Wave 0. | `withRuntimeWorktreeOwner` sets `runtimeOwnerEnvironmentId` (`web-runtime-calls.ts:188-197`); `LOCAL_EXECUTION_HOST_ID = 'local'` (`execution-host.ts:5`) [VERIFIED: read]; orcad's `hostId` value [ASSUMED] |
| CA-13 | P65-14 | Answer for the research item: in PB's document, Browse goes to the `server-path` step (orcad-side directory listing over `files.browseServerDir`), because `installWebPreloadApi` sets `__ORCA_WEB_CLIENT__ = true`, which removes the `local` host from the Add-project host list. The native-picker stubs are never reached. The live row compares PB with the standalone page on this exact step. | `web-preload-api.ts:62-66`; `use-add-repo-host-selection.ts:67,77`; `AddRepoDialog.tsx:342-350`; `runtime-server-directory-browser.ts:17` [VERIFIED: read] |
| CA-14 | P65-22 | `NativeChatResumeOnRestartModal` is self-contained: two store hooks (`useNativeChatRestartOfferEnabled`, `useNativeChatRestartRuntimes`) and `useSyncExternalStore`, with no app-shell props. It mounts in the services root wrapped in Orca's `OverlayBoundary` as `AppRootSurfaces.tsx:289-291` does. Remaining risk: the live mount (P65-04). | `components/NativeChatResumeRuntimeModal.tsx:10-25` [VERIFIED: read] |
| CA-15 | P65-05 | A PB-owned root the user removes through Theia ("Remove Folder") is dropped from the PB-owned set and recorded as user-removed until its worktree leaves the store. Otherwise the next store event re-adds it, a loop against user intent. The sync applies differences of the wanted set between store events, not a full reconcile on every event. | `removeRoots` / `spliceRoots` fire `onWorkspaceChanged` through `updateWorkspace` (`workspace-service.js:434-470`) [VERIFIED: read]; behaviour choice is Claude's discretion |

## Answers to the six questions

### Q1. P65-17: offers, rows and the session-only preset (coordinate with RUN-07 / P67-08)

**Can one offer start more than one session pairing? Yes, up to 32 keyed forks per token row, and the token keeps working beyond that.**
- orcad's start offer is `createPairingOffer` → `getOrCreatePendingDevice(name, scope, reach, grants)` (`runtime-rpc-pairing.ts:195-197`), which writes the row's token into the offer (`deviceToken: device.token`, `:206`) [VERIFIED: read].
- A client authenticates with that token. On `onReady` the socket calls `this.deviceRegistry.updateLastSeenDeferred(device.deviceId)` (`mobile-socket-wiring.ts:245`). The first sighting is written at once: `if (!existing || existing.lastSeenAt === 0) { return existing ? this.updateLastSeen(deviceId) : undefined }` (`device-registry.ts:260-264`) [VERIFIED: read].
- The session-only client then registers an ephemeral key: `registerSocketDeviceKey` → `registry.forkDeviceKey(legacy.deviceId, ..., { ephemeral: params.ephemeral === true })` (`runtime-rpc-device-key-registration.ts:32-37`). The fork keeps the token row: "Fork one installation to a keyed row while retaining other token holders/sockets" (`device-key-fork.ts:22`). The token row therefore keeps authenticating, so a frontend reload within one orcad lifetime can re-pair from the same offer file [VERIFIED: read].
- Bound: `const MAX_FORKS_PER_TOKEN_ROW = 32` (`device-key-fork.ts:5`), checked by `devices.filter((device) => device.forkedFrom === legacyDeviceId).length >= MAX_FORKS_PER_TOKEN_ROW` → `too_many_device_keys` (`:53-58`). Ephemeral rows count until pruned: `EPHEMERAL_DEVICE_IDLE_MS = 12 * 60 * 60 * 1000`, and live sockets never expire (`ephemeral-device-rows.ts:4,11-28`). On the 33rd pairing in one orcad lifetime, registration fails and the client "stays on the pairing code" (`web-runtime-device-key-migration.ts:12,47-50`): it still connects, by token, held in memory. This is not fatal, and a plan needs no code for it [VERIFIED: read].

**Do rows accumulate on disk across launches? Yes: one used runtime token row per launch that paired.**
- `getOrCreatePendingDevice` reuses a row only if `isPendingTokenRow(d)`, defined as `device.lastSeenAt === 0 && device.token !== undefined && device.credentialKind === undefined` (`device-entry.ts:51-55`; `device-registry.ts:96-107`). After PB pairs, the row is no longer pending, so the next orcad start mints a new token row and keeps the old one [VERIFIED: read].
- Orca's own test states it: `"repeats while unused, and names a new device once a client has paired with it"`, with `expect(new DeviceRegistry(dir).getDevice(first.deviceId)).not.toBeNull()` (`device-registry-startup-offer.test.ts`) [VERIFIED: read].
- File: `DEVICE_REGISTRY_FILENAME = 'orca-devices.json'` (`mobile-pairing-files.ts:3`), at `join(userDataPath, DEVICE_REGISTRY_FILENAME)` (`device-registry.ts:54`). orcad's user data path is PB's data root: `ORCA_USER_DATA_PATH: dataRoot` (`OrcaEnv.sys.mjs:102`), with `ORCAD_DATA_ROOT_NAME = "powerbrowser-orca"` (`:62`) under the profile (`OrcaService.sys.mjs:107`) [VERIFIED: read].
- Ephemeral keyed rows: the writer does not filter them (`device-registry-disk-merge.ts:75-99` writes `merged` as is). They are dropped on the next load: `this.devices = withoutEphemeralRows(read.devices)` with the comment "Session-only browser keys died with the prior host; remove their registry rows." (`device-registry.ts:312-319`). So they sit on disk only while that orcad runs [VERIFIED: read].
- Without the preset, Gecko's probe gives `persistent`. Spike 004 recorded `readWebDeviceKeySupport()` = `persistent` on the Theia-origin route (`.planning/spikes/004-orca-pane-hosting/results.md:39,49`; `results-route-a.json:39`). The client then registers a non-ephemeral keyed row (`ephemeral: false`, `web-runtime-credential-source.ts:124`). That row is never pruned, and its private key stays in the dead origin's IndexedDB. One such row would be added per launch, on top of the token row [VERIFIED: read].

**Revoke path: none public for headless orcad.**
- `revokeRuntimeAccess(deviceId)` exists (`runtime-rpc-mobile-devices.ts:25-28`), but its only caller is Electron IPC `ipcMain.handle('mobile:revokeRuntimeAccess', ...)` (`ipc/mobile.ts:232-237`). The web client's version is a stub, `revokeRuntimeAccess: () => Promise.resolve({ revoked: false })` (`web-mobile-api.ts:16`). `src/cli` has no device-revoke command (grep over `src/cli`: the only `revoke` hits are emulator permissions) [VERIFIED: read and grep].
- Orca does support an external writer removing a row. The disk-merge header says "Another writer (an admin removing a device, the pairing CLI adding one) may have changed it since this process loaded it ... a row this process knew of that is gone from disk stays gone" (`device-registry-disk-merge.ts:6-13`), and `adoptExternalEdits` applies such removals (`device-registry.ts:303-309`). That is option (b) in CA-07. Editing the file wrongly makes orcad quarantine it and treat every row as doubtful (`device-registry-file-read.ts:28-35`). So option (b) is an owner call for Phase 67, not a Phase 65 lane item [VERIFIED: read].

**`setWebDeviceKeySupportForTests` outside tests: usable, and there is no public alternative.**
- `export function setWebDeviceKeySupportForTests(support: WebDeviceKeySupport | null): void { detected = support }` sits in a production module (`web-device-key-support.ts:20-22`). `initWebDeviceKeySupport` keeps a preset value (`detected ??= await detectWebDeviceKeySupport(...)`, `:7`). `WebDeviceKeySupport = 'persistent' | 'token-insecure-origin' | 'session-no-ed25519'` (`web-device-key.ts:10`) [VERIFIED: read].
- `.oxlintrc.json`'s `no-restricted-imports` patterns name only `web-session-tabs-sync-test-harness`, `web-runtime-browser-creation-placement-test-rig` and `*.fixture` modules. Nothing bans a `*ForTests` import [VERIFIED: read lines 120-150].
- Orca has no other public entry: `detectWebDeviceKeySupport` reads `window.isSecureContext`, `crypto.subtle` and `indexedDB` directly (`web-device-key.ts:22-40`).
- Re-pin risk: the name may change. Guard it in the `orca-pane-entry` clause by deriving the export's presence from the pinned source (red "source moved" when absent), and by the run-time assertion in CA-07.
- Effect chain verified: `isSessionOnlyBrowser()` reads the preset (`web-runtime-environment.ts:255-258`) and makes `createStoredWebRuntimeEnvironment` add `sessionOnly: true` (`:168`). `saveStoredWebRuntimeEnvironment` then keeps the environment in memory and calls `window.localStorage.removeItem(ENVIRONMENT_STORAGE_KEY)` (`:84-90`), where `ENVIRONMENT_STORAGE_KEY = 'orca.web.runtimeEnvironment.v1'` (`:34`). **Ordering constraint:** the preset must run before `createStoredWebRuntimeEnvironment`. The spike's `bootstrap` calls `initWebDeviceKeySupport()` first (`pb-pane-mount.tsx:90-100`), so the preset goes immediately before that call [VERIFIED: read].

**Smallest safe design (coordinated with P67-08's five places).**
1. The bundle's `bootstrap` presets `session-no-ed25519`, pairs from the P64-07 offer, and refuses to connect unless the environment is `sessionOnly`.
2. Holder 4 (Theia origin storage) shrinks to the in-memory store. The localStorage key is absent, which P65-23 proves with a planted-marker control (CA-09).
3. Holder 5 (`orca-devices.json`) grows by one used token row per paired launch; keyed rows exist only while orcad runs. `orca-relaunch-restore-live` asserts this growth by count: it reads row counts by `credentialKind`/`ephemeral`/`lastSeenAt`, never a token. A persisted keyed row (the "no preset" regression) goes red.
4. No revoke in Phase 65. Owner item to Phase 67 (CA-07).
5. P67-06's Reconnect calls the re-pairing function this phase exports (`repair(offer)` in the bundle API), as P67-06 already anticipates.

### Q2. P65-06: does the first workspace folder reload, and is the key copy enough?

- **No reload.** With no workspace or a folder workspace, `spliceRoots` calls `getUntitledWorkspace()` then `save(untitledWorkspace)` (`workspace-service.js:444-450`). `save()` writes the file, calls `setMostRecentlyUsedWorkspace`, `setWorkspace(stat)` and fires `onWorkspaceLocationChangedEmitter` (`:588-620`). `setWorkspace` only sets `window.location.hash` through `setURLFragment` (`:172-174, 211`) and updates the roots. `windowService.reload()` is called only from `reloadWindow` (`:543-547`), and that is reached from `openWindow` (`openWorkspace`, `:403-420, 528-541`) and `close()` (`:487-499`), never from `spliceRoots`/`save` [VERIFIED: read].
- **Re-keying is live.** `WorkspaceStorageService` subscribes `onWorkspaceLocationChanged(() => this.updatePrefix())`, with `getPrefix(workspaceStat) { return workspaceStat ? workspaceStat.resource.toString() : '_global_'; }` and keys `${this.prefix}:${originalKey}` (`workspace-storage-service.js:27-53`) [VERIFIED: read].
- **What lives under the prefix.** PB rebinds `LocalStorageService` to `ProfileStorageService` (`tab-uris-frontend-module.ts:192-197`). `ProfileStorageService.setData/getData` store the key as given, in one map (`profile-storage.ts` `map[key] = data`), so the map keys are exactly `<prefix>:<key>`. PB's modes read Theia's `'perspective-layouts'` (`mode-service.ts:661,690,703`; `PERSPECTIVE_LAYOUTS_STORAGE_KEY = 'perspective-layouts'`, `shell-layout-restorer.js:55`; legacy `storageKey = 'layout'`, `:66`). Setups and the group model inject `ProfileStorageService` directly, unprefixed (`setups-service.ts:463-464`, `group-model.ts:167-168`), so they are unaffected [VERIFIED: read].
- **Is the copy enough? Yes.** All prefixed values move. `storeLayout` would rewrite the perspective layouts under the new prefix at the next clean unload anyway (it deflates every saved perspective, `shell-layout-restorer.js:86-145`). The copy is what protects a crash or kill between the switch and the next unload, and it carries Theia's other prefixed keys (for example `mergeEditor/layoutMode`, `merge-editor.js` `LAYOUT_MODE`).
- **Order:** enumerate and copy `<old>:` → `<new>:`, then `save(fixedUri)`, then `spliceRoots`. A `setData` landing between the copy and the prefix change goes to the old prefix and is overwritten at the next store.
- **Side effect to record:** the Theia document URL gains `#<path to powerbrowser.theia-workspace>` (`setURLFragment`). It is an internal path, not a secret. Add it to Phase 67's list of copyable/addressable surfaces to check, so it never reaches user-facing text.
- Workspace trust prompts do not fire: `"security.workspace.trust.enabled": false` (`theia/applications/browser/package.json:22`) [VERIFIED: read].

### Q3. P65-01: which Theia 1.76 editor covers each Orca mode

- `@theia/scm` 1.76.0 is a dependency of the app (`applications/browser/package.json:86`) and binds the merge editor in `scm-frontend-module.js:139` (`bindMergeEditor(bind)`). `MergeEditorUri.encode({ baseUri, side1Uri, side2Uri, resultUri })` builds `merge-editor:` + JSON query (`merge-editor.js:31-56`, `const SCHEME = 'merge-editor'`). `MergeEditorOpenHandler.canHandle` returns `MergeEditorUri.isMergeEditorUri(uri) ? 1000 : 0` (`:554-556`). `MergeEditorFactory.createEditorWidget(uri)` is `this.editorManager.createByUri(uri)` for each side, so any scheme with a `ResourceResolver` works. A failed **base** falls back to an empty editor; a failed side rejects. If the result file has conflict markers, the merge editor recomputes the result (`resetResult: hasConflictMarkers`) [VERIFIED: read].
- There is no multi-diff editor: `_workbench.openMultiDiffEditor` is "Temporary workaround: opens a single diff editor for the revealed resource. TODO: GH-16280" (`plugin-vscode-commands-contribution.js:979-1000`) [VERIFIED: read]. For a combined diff, use the snapshot's first entry: `uncommittedEntriesSnapshot` (combined-uncommitted / combined-all), `branchEntriesSnapshot` (combined-branch) or `commitEntriesSnapshot` (combined-commit) (`open-file.ts` fields). `OpenFile` has no "revealed entry" field.
- `DiffUris.encode(left, right, label)` → `diff:<label>?["left","right"]` (`diff-uris.js:26-33`) [VERIFIED: read].
- Mode and source sets for the route check: `mode: 'edit' | 'diff' | 'conflict-review' | 'markdown-preview' | 'check-details'` (`open-file.ts:94`). `DiffSource = 'unstaged' | 'staged' | 'branch' | 'commit' | 'combined-all' | 'combined-uncommitted' | 'combined-branch' | 'combined-commit'` (`editor-tab-view-types.ts:18-26`). `TabContentType` has 8 members, and `toVisibleTabType` maps `editor`, `diff`, `conflict-review` and `check-details` to `'editor'` (`tab-types.ts:18-46`) [VERIFIED: read].
- **check-details and criterion 1:** `CheckRunDetailsPanel.tsx:1-16` imports React, lucide, sonner, `Button`, `CommentMarkdown`, check types, `SourceControlFixSplitButton`, i18n, the fix-with-AI hook, clipboard text, `CheckRunAnnotations`, `CheckRunJobs`, `CheckRunCopyButton`, `LoadingSpinner`, the reading-position hook and `openAppHttpLink`. It imports no Monaco view and no `EditorPanel`/`EditorContent` [VERIFIED: read]. So "Orca's own editor is never mounted" holds. "Routes every editor-type content type to Theia" holds only under the reading that a hosted PB `ReactWidget` tab is Theia's. The owner item stays, and the route check names the row explicitly rather than hiding it in a generic exemption.

### Q4. P65-03: the `pb-orca-git:` scheme

See Pattern 2 for the validator and the backend call. Key rules:
- Use `cat-file blob -- <spec>`, which is Orca's own method. It rejects a tree (`git show <oid>:<dir>` would print a listing), runs no textconv or filter driver, and `--` stops option parsing.
- `spec` grammar: `^([0-9a-f]{40}|[0-9a-f]{64}):(<rel>)$` or `^:([0-3]):(<rel>)$`. `<rel>` is non-empty, contains no NUL or newline, does not start with `/`, `./` or `../`, has no `..` segment and no backslash. **`./` and `../` are dangerous inside a git object name:** git resolves `<rev>:./path` relative to the process's working directory [ASSUMED from git rev-parse docs; refuse them either way]. Lower-case hex only. `HEAD` is resolved to an id at open with `git rev-parse --verify HEAD^{commit}` (unborn → empty side), so no ref name ever enters a URI.
- Root: an absolute path, `realpath`-equal to itself, equal to `git -C <root> rev-parse --show-toplevel`. The frontend resolver also requires membership in the PB-owned root set **as persisted in ProfileStorageService**, because at layout-restore time the live store has not hydrated yet and the live set is empty.
- Process: `execFile('git', ['-c', 'core.fsmonitor=false', '-C', root, 'cat-file', 'blob', '--', spec], { env: <process.env without GIT_*>, maxBuffer: <cap>, timeout })`. Strip the `GIT_*` variables: a `GIT_DIR` inherited by the Theia backend would redirect the read. Size cap: refuse beyond 50 MB, with one log line [ASSUMED value].
- Errors: a missing blob rejects the resource. Theia shows its own "cannot open" state in the diff side, except that the merge editor base falls back as above.

### Q5. P65-20: can a restored Phase 63 widget attach a second process?

Yes, through public API, with no Theia core change.
- `start(id)`: `this._terminalId = typeof id !== 'number' ? await this.createTerminal() : await this.attachTerminal(id); this.resizeTerminalProcess(); this.connectTerminalProcess();` (`terminal-widget-impl.js:672-683`). `attachTerminal` resets `this.exitStatus = undefined` on success; for a non-`user` kind, failure returns `-1` (`:684-697`). `connectTerminalProcess` first runs `this.toDisposeOnConnect.dispose()`, then listens on `${terminalsPath}/${this.terminalId}` (`:780-797`). The error and exit watchers compare against the live `this.terminalId` getter (`:229-249`). Theia's own `reconnectTerminalProcess` calls `this.start(this.terminalId)` again on the same widget (`:817-823`), and `storeState` saves the current `terminalId` (`:644-650`) [VERIFIED: read].
- What blocks it today is Phase 63's own code (branch `ServerDestroyer/p63-02`, not yet merged here):
  - `OrcaTerminalOpener.openEntry` returns early when `this.terminals.getById(name)` exists (`orca-terminals-frontend-module.ts:50-53`).
  - The backend reserves the restored names: `service.list(restored)`, "the backend reserves them, so a restored dead tab's name is never reused" (`:4-7, 36-40`). `mintName()` takes the lowest index not in `usedNames` (`orca-pty-bridge-core.ts:102-109`).
  - Phase 65 changes both. The opener calls `await widget.start(processId)` when the existing widget has `kind === 'orca'` and `!IBaseTerminalServer.validateId(widget.terminalId)`. The bridge mints the recorded name when a spawn's pane key is in the pane-key → `o<n>` map the frontend handed over. A reserved name is released to its own pane key only, so it is still never given to an unrelated PTY.
- **[P64 research: P64-22]** The respawn host call: Orca's renderer spawns through `window.api.pty.spawn({ cols, rows, cwd, env, ..., worktreeId, tabId, leafId, ... })` (`ipc-pty-spawn-request.ts:69-99`). This is the candidate the mapper issues once per persisted terminal leaf. The workspace session persists `terminalLayoutsByTabId: Record<string, TerminalLayoutSnapshot>` (`workspace-session-state-types.ts:44`) with `ptyIdsByLeafId` (`terminal-tab-types.ts:109`), which gives the leaf set [CITED: grep]. Whether tab ids survive an orcad restart unchanged is P65-18's live assertion, not yet observed.

### Q6. P65-09 / P65-10: side panel without core edits, and the mode-rule rows

- **Registration (no core edit):** follow Theia's navigator pattern. A `WidgetFactory` with `id: 'powerbrowser-orca-view-container'` creates `ViewContainer.Factory({ id })`, calls `setTitleOptions({ label, iconClass, closeable: true })` and `addWidget(part, { order, canHide, initiallyCollapsed })` for each part. The parts are `OrcaSideViewWidget extends ReactWidget`, each with its own factory id. The same applies to `powerbrowser-orca-right-view-container` (`view-container.d.ts:86,99,151-171`) [VERIFIED: read]. Bind one `AbstractViewContribution` per container (`ViewContributionOptions { widgetId, viewContainerId?, widgetName, defaultWidgetOptions, toggleCommandId?, toggleKeybinding? }`, `view-contribution.d.ts:13-20`), with `defaultWidgetOptions: { area: 'left' }` and `{ area: 'right' }`. Otherwise the `view-factory-table.ts` rows trip `tab-uri-registry.ts:64-71`'s "no AbstractViewContribution is registered under that id" startup error.
- **Docking:** `ensureInArea(viewId, area)` calls `this.widgetManager.getOrCreateWidget(viewId)`, then `shell.addWidget(widget, { area })` (`mode-service.ts:414-424`). Any factory id docks, and `activateMode` expands `rules.views.left[0]` / `rules.views.right[0]` (`:330-349`) [VERIFIED: read].
- **Rules row (P64-18's row, as amended by P65-09):** `orca: { left: 'open', right: 'open', bottom: 'closed', furniture: true, organising: false, views: { left: ['powerbrowser-orca-view-container'], right: ['powerbrowser-orca-right-view-container'], bottom: [] } }`, in the shape of the Coding row: `coding: { left: 'open', right: 'keep', bottom: 'open', furniture: true, organising: false, views: { left: ['explorer-view-container'], right: [], bottom: [] } }` (`mode-service.ts:113`) [VERIFIED: read]. The Orca descriptor gains `viewPlacements: new Map([['powerbrowser-orca-view-container', 'left'], ['powerbrowser-orca-right-view-container', 'right']])`, in the shape of Coding's (`mode-descriptors.ts:25-27`). P64-18's descriptor is not on this branch yet, and the field values for `bottom` and `furniture` are P64-18's [CITED: 64-CONTEXT]. `verify-mode-toggle-commands.mjs` already derives descriptor placements and rows (P64-18).
- **Leak between modes:** side-panel contents are per perspective (each perspective has its own saved layout, `shell-layout-restorer.js:99-145`), so docking the Orca containers in Orca mode does not add them to Coding's left bar. The extended `verify-mode-switch-tabs-live.mjs` should assert this [ASSUMED until measured].
- **`TopLevelView`:** `'terminal' | 'settings' | 'tasks' | 'activity' | 'automations' | 'space' | 'skills' | 'artifacts' | 'mobile'` (`ui-chrome-types.ts:120-129`). `ActivePage` mounts `Settings`, `SkillsPage`, `ArtifactsPage`, `TaskPage`, `AutomationsPage`, `ActivityPrototypePage`, `WorkspaceSpacePage`, `MobilePage`, plus the creation surfaces and `Landing` under `terminal` (`AppWorkspaceShell.tsx:88-110`) [VERIFIED: read]. Page rows: 7 hosted pages, `settings` → reveal the Settings view, `terminal` → `page:creation` while a creation is pending (CA-11), else nothing.
- **`RightSidebarTab`:** `'explorer' | 'search' | 'vault' | 'workspaces' | 'pr-checks' | 'source-control' | 'checks' | 'ports' | \`plugin:${string}\`` (`ui-chrome-types.ts:96-106`) [VERIFIED: read].

## Project Constraints (from CLAUDE.md)

- Never fork or patch Theia core; `@theia/*` stays an npm dependency; `scripts/diff-theia-core.sh` stays green. Everything above uses public classes (`ViewContainer`, `AbstractViewContribution`, `WorkspaceService`, `TerminalWidget.start`, `MergeEditorUri`, `DiffUris`, `ResourceResolver`).
- Never modify Gecko outside the patch stack; Firefox internals only through `PowerBrowserAPI.sys.mjs` with `INTERNAL-APIS.md` rows. This phase plans no chrome change; CA-07 removes the one conditional `OrcaService` edit.
- Design for the bridge: `TabUriRegistry`'s exported shape is unchanged (`verify-registry-shape.mjs`). `pb-orca-git:` is a content scheme, never a tab address.
- No space in the repo path (the worktree path qualifies).
- Theia is the default GUI; no custom browser chrome; the new controls are a view container and views, not chrome.
- Residual-brand scan stays green, and the "Orca" token is classified only in `inventory/brand-tokens.json`. **Stage new files before trusting a green scan.**
- Patches are regenerated, never text-edited (no seam patch is planned, P65-25).
- One verification driver, `scripts/verify-platform.sh`: one row plus a `-self-test` row per check. Derive and compare; never assert an absence before its detector is shown to see.
- User-facing copy: no internal identifier in user text. Container and view labels come from Orca's own strings (P65-26).
- Builds run in `nix develop .#theia` (yarn) and `.#firefox`. Chrome JS edits need `-purgecaches`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Orca store observation (open files, worktrees, active view) | Theia frontend (pane bundle, Orca's React) | — | the one `useAppStore` lives in the Theia document (P64-04) |
| Editor, diff and merge routing | Theia frontend (`@powerbrowser/orca-workspace`) | — | `EditorManager`/`OpenerService` are frontend services |
| `pb-orca-git:` content | Theia backend (git `cat-file`) | frontend resolver (PB-owned root gate) | only the backend runs processes; validation at the backend boundary, membership at the frontend |
| Workspace roots and key migration | Theia frontend (`WorkspaceService`, `ProfileStorageService`) | Theia backend (MRU file) | roots are frontend state persisted through Theia's own services |
| Side panel containers and views | Theia frontend (`orca-panes/side-panel`) | — | `ViewContainer`/`WidgetFactory` |
| Pairing (session-only) | Theia frontend (bundle bootstrap) | Theia backend (offer reply, P64-07) | the offer reaches the page over authenticated JSON-RPC only |
| Device rows | orcad (holder 5) | chrome (owner option b only) | orcad owns its registry |
| Relaunch restore | Theia frontend (Setups, opener, name map) | Theia backend bridge (name reuse by pane key) | names are minted in the backend (P63-06) |
| Offer scan | Node check scripts | — | reads profile files, prints sink names and counts only |

## Standard Stack

### Core (all already installed; nothing new from a registry)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@theia/workspace` | 1.76.0 [VERIFIED: node_modules/@theia/workspace/package.json] | roots, workspace file, storage prefix | Theia's own multi-root model |
| `@theia/editor`, `@theia/monaco`, `@theia/editor-preview` | 1.76.0 [VERIFIED: applications/browser/package.json:66-73] | `EditorManager.open`, preview tabs, diff editor | Theia's editor |
| `@theia/scm` | 1.76.0 [VERIFIED: :86, scm package.json] | `MergeEditorUri`, merge editor | 3-way merge, generic over URIs |
| `@theia/core` | 1.76.0 | `DiffUris`, `ResourceResolver`, `ViewContainer`, `AbstractViewContribution`, `ReactWidget` | Theia core API |
| `@theia/terminal` | 1.76.0 | `TerminalWidget.start` re-attach | Phase 63's widgets |
| git CLI | 2.54.0 [VERIFIED: probe] | blob reads | same reads Orca does |
| `node:sqlite` | built into Node v24.22.1 [VERIFIED: probe] | read Gecko's per-origin `ls/data.sqlite` copy in the scanner | no dependency |
| Orca at the pin | v1.4.248 (`965978bc`) [VERIFIED: git log] | overlay entry additions only | P65-25: no seam |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `git cat-file blob` | `git show <spec>` (as P65-03 wrote) | `show` prints a tree listing for a directory spec and has a different textconv behaviour; `cat-file blob` is what Orca uses |
| `pb-orca-git:` backend read | orcad `git.*` RPC | needs an orcad credential in the Theia backend (P63-24 ruled out) |
| session-only preset | a declared seam making storage an option | counts against the 10-seam cap; the owner item P65-17 already lists it |
| fixed workspace file | Theia's `Untitled-N` | quit prompt on every exit (CA-05) and a moving prefix |

**Installation:** none from a registry. The new workspace package `@powerbrowser/orca-workspace` is added to `theia/package.json` workspaces and `theia/applications/browser/package.json`, with an audited install per `docs/BUILD.md` (59-CONTEXT D-07).

## Package Legitimacy Audit

No external package is installed by this phase. Every dependency of the new extension (`@theia/core`, `@theia/editor`, `@theia/monaco`, `@theia/scm`, `@theia/workspace`, `@theia/terminal`) is already pinned at 1.76.0 in `theia/applications/browser/package.json` and present in `theia/node_modules`. The scanner uses only Node built-ins.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (none new) | — | — | — | — | — | — |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
 orcad (holder 5: orca-devices.json)          Theia backend                                  Theia frontend (one document)
 ───────────────────────────────────          ─────────────                                  ─────────────────────────────
 start offer ──(0600 offer file, P64-07)──▶ offer RPC ──(authenticated JSON-RPC)──▶ bundle.bootstrap: preset session-no-ed25519
                                                                                               │ pair (token → ephemeral key row)
 WebSocket ◀───────────────────────────────────────────────────────────────────────────────── │ useAppStore hydrates
                                                                                               ▼
                                         ┌──────────────── subscribeOpenFiles ─────────────── store ── subscribeWorktrees ──┐
                                         ▼                                                     │                            ▼
                         route by mode / diffSource / conflictKind                   subscribeActiveView          root sync (wanted set −
                          ├─ edit/markdown-preview ─▶ EditorManager.open(file:)            │                      PB-owned set, CA-15)
                          ├─ diff ─▶ DiffUris(pb-orca-git:…, file:|pb-orca-git:)           ▼                            │
                          ├─ conflict-review ─▶ MergeEditorUri(… stages 1/2/3 …)    page tabs pb-orca:<word>           ▼
                          ├─ check-details ─▶ hosted CheckRunDetailsPanel           (or Settings view reveal,   first root? copy <prefix>:* →
                          └─ remote host ─▶ log line                                 page:creation)              save(fixed file) → spliceRoots
                                         │
              pb-orca-git resolver ──RPC──▶ validate (root, spec) ─▶ execFile git cat-file blob
                                                                                               side panel: left container (Sidebar, Agents,
                                                                                               Settings), right container (RightSidebar)
 relaunch:  Setups restore ─▶ pb-orca: opener (name map, waiting widget) ─▶ attach after hydrate / dispose if gone
            o<n> widgets (dead) ◀── bridge mints recorded name for pane key ◀── respawn host call per leaf [P64-22]
                         └── widget.start(newProcessId)
```

### Recommended Project Structure
```
theia/extensions/orca-workspace/          # lane p65-02
├── src/common/orca-git-protocol.ts       # service path, spec grammar (shared by both halves)
├── src/node/orca-git-service.ts          # validate + execFile git cat-file
├── src/node/orca-workspace-backend-module.ts
├── src/browser/orca-git-resource.ts      # ResourceResolver for pb-orca-git:
├── src/browser/orca-editor-routes.ts     # the handler table keyed by mode/diffSource/kind
├── src/browser/orca-root-sync.ts         # wanted set, PB-owned set, key migration
└── src/browser/orca-workspace-frontend-module.ts
theia/extensions/orca-panes/src/browser/side-panel/   # lane p65-03
theia/extensions/orca-panes/src/browser/restore/      # lane p65-04
scripts/lib/orca-offer-scan.mjs                        # lane p65-04, imported by Phase 67
```

### Pattern 1: route table rows (lane p65-02, in orca-panes' route-table file)
| Key | Target kind | Notes |
|---|---|---|
| `edit` | `theia-editor` | `isPreview` → editor-preview's preview mode |
| `markdown-preview` | `theia-editor` | source file; one log line names the mode |
| `diff:unstaged` / `diff:staged` / `diff:branch` / `diff:commit` | `theia-diff` | sides per CA-03 |
| `diff:combined-*` (4) | `theia-diff` | first snapshot entry |
| `conflict-review` | `theia-merge` (`both_modified`, `both_added`), else `theia-editor` or log | CA-01, CA-02 |
| `check-details` | `hosted:CheckRunDetailsPanel` | named exception in the route check |
| any, non-local owner (CA-12) | `log` | "remote host" |

### Pattern 2: `pb-orca-git:` URI and backend read
```typescript
// URI: path = absolute file path (Monaco language and label come from it), query = object id or stage.
//   pb-orca-git:/home/u/repo/src/a.ts?3f2a…(40|64 hex)      pb-orca-git:/home/u/repo/src/a.ts?:2
// The backend recomputes root and relative path; the frontend passes { root, path, rev } explicitly.
const OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const STAGE = /^:[0-3]$/;
function relOk(rel: string): boolean {
    return rel.length > 0 && !rel.startsWith('/') && !rel.includes('\\') && !/[\0\n\r]/.test(rel)
        && !rel.split('/').some(seg => seg === '..' || seg === '.' || seg === '');
}
// spec = OID.test(rev) ? `${rev}:${rel}` : STAGE.test(rev) ? `${rev}:${rel}` : refuse
execFile('git', ['-c', 'core.fsmonitor=false', '-C', root, 'cat-file', 'blob', '--', spec],
         { env: withoutGitVars(process.env), maxBuffer: CAP, timeout: 10_000, encoding: 'buffer' }, cb);
// Source of the cat-file form: orca/src/main/git/source-control/git-blob-read.ts:89-98
```

### Pattern 3: one view container (lane p65-03)
```typescript
// Source: Theia view-container.d.ts:86,99,151-171; view-contribution.d.ts:13-20 (navigator pattern)
bind(WidgetFactory).toDynamicValue(ctx => ({
    id: ORCA_LEFT_CONTAINER_ID, // 'powerbrowser-orca-view-container'
    createWidget: async () => {
        const c = ctx.container.get<ViewContainer.Factory>(ViewContainer.Factory)({ id: ORCA_LEFT_CONTAINER_ID });
        c.setTitleOptions({ label: orcaLabel, iconClass: 'codicon codicon-…', closeable: true });
        const wm = ctx.container.get(WidgetManager);
        c.addWidget(await wm.getOrCreateWidget(ORCA_SIDEBAR_VIEW_ID), { order: 0, canHide: false });
        c.addWidget(await wm.getOrCreateWidget(ORCA_SETTINGS_VIEW_ID), { order: 2, initiallyCollapsed: true });
        return c; // the Agents part is added and removed at run time (P65-12)
    },
})).inSingletonScope();
bindViewContribution(bind, OrcaLeftContainerContribution); // widgetId = container id, area 'left'
```

### Pattern 4: restored terminal re-attach (lane p65-04, edits Phase 63's opener)
```typescript
// Source: terminal-widget-impl.js:672-697 (start/attach), :817-823 (Theia's own reconnect)
const existing = this.terminals.getById(name);
if (existing) {
    if (existing.kind === 'orca' && !IBaseTerminalServer.validateId(existing.terminalId)) {
        await existing.start(processId); // same widget, same dock position, same terminal:o<n> address
    }
    return;
}
```

### Anti-Patterns to Avoid
- **`hostId === 'local'` as the local test:** the web client marks the orcad's own worktrees as runtime-owned (CA-12).
- **Letting `spliceRoots` create the workspace:** it produces `Untitled-N` and a quit prompt (CA-05).
- **`git show` or `cat-file --textconv/--filters`:** these can run repository-configured programs and print trees.
- **Checking the live store for the PB-owned root at layout restore:** the store is empty then; use the persisted set.
- **Writing `orca-devices.json` from a lane:** this is holder 5; it is an owner decision for Phase 67 (CA-07).
- **Mounting a hosted `EditorPanel` for conflict-review:** contradicts D-01; `orca-pane-entry` goes red.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 3-way merge view | a custom merge widget | `MergeEditorUri` + `@theia/scm` merge editor | conflict navigation, result model, layout modes |
| two-pane diff | a diff widget | `DiffUris.encode` + `OpenerService` | Monaco diff editor, restore via layout |
| blob reading | parsing `.git` objects | `git cat-file blob` | packs, alternates, SHA-256 repos |
| side container | a custom sidebar | `ViewContainer.Factory` + `AbstractViewContribution` | toggle command, `view:` address, layout persistence |
| terminal re-attach | a new widget plus a dock move | `TerminalWidget.start(id)` | keeps position, address and Organising row |
| key enumeration | reading `powerbrowser-shell-state.json` from the page | an accessor on `ProfileStorageService` | one writer of the map |
| needle encodings | a second scanner | the shared lib (CA-09) | Phase 67 extends one tool |

## Runtime State Inventory

Phase 65 is not a rename, but it adds state that outlives the process. All of it is new state, so there is no migration of existing records except the one-time prefix copy.
| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | `ProfileStorageService` map: new keys (PB-owned roots, name map with tombstones, pane-key → `o<n>` map, user-removed roots), and the copied `<new prefix>:*` keys | code (p65-02, p65-04); one-time copy at the first root (CA-04) |
| Live service config | orcad `orca-devices.json`: one used token row per paired launch | none in 65; owner item to 67 (CA-07) |
| OS-registered state | None: verified, no service, task or unit is registered by this phase | none |
| Secrets/env vars | The offer: in memory only (session-only); no new env var | none |
| Build artifacts | the new `@powerbrowser/orca-workspace` package; the rebuilt pane bundle | audited install; Orca rebuild (coordinator) |

## Common Pitfalls

### Pitfall 1: Untitled workspace quit prompt
**What goes wrong:** every quit asks to save the workspace. **Why:** `onWillStop` matches `Untitled*`. **How to avoid:** use the fixed file, saved before roots are added (CA-04/05). **Warning signs:** an `Untitled-` file under `powerbrowser-theia/workspaces/`.

### Pitfall 2: Key copy after the prefix moved
**What goes wrong:** layouts are written under the new prefix and then overwritten by the copy, or lost. **How to avoid:** copy strictly before `save()`; never after `onWorkspaceLocationChanged`.

### Pitfall 3: Resolver fails at layout restore
**What goes wrong:** restored diff and merge tabs open as errors after a relaunch. **Why:** the PB-owned root check reads the live store, which has not hydrated. **How to avoid:** check against the persisted set.

### Pitfall 4: Merge editor on a one-sided conflict
**What goes wrong:** `deleted_by_*`/`added_by_*` conflicts throw, because stage 2 or 3 is missing. **How to avoid:** route by `conflictKind` (CA-02).

### Pitfall 5: Phase 63 opener skips the restored widget
**What goes wrong:** the new PTY is never shown, because a dead widget of that name exists and the backend reserved the name. **How to avoid:** the CA-08 edits in both halves; the relaunch row types into each `o<n>`.

### Pitfall 6: Preset ordering
**What goes wrong:** the environment is stored as persisted, and localStorage keeps the token. **Why:** `createStoredWebRuntimeEnvironment` ran before the preset. **How to avoid:** preset first, then the run-time assertion (CA-07).

### Pitfall 7: Orca's `branch` diff is not "vs working tree"
**What goes wrong:** the live row compares the wrong text and passes or fails for the wrong reason. **How to avoid:** use the CA-03 sides, and compare left and right texts with `git cat-file` output in the live row.

### Pitfall 8: Brand scan and unstaged files
New `orca-workspace` files are invisible to `scan-brand-residue.mjs` until staged.

### Pitfall 9: Root watchers on large worktrees
Each root gets a file watcher (`watchRoots`, `workspace-service.js:621-630`). Orca worktrees with `node_modules` add watcher load. Check that the existing `files.watcherExclude` defaults cover it before adding many roots [ASSUMED].

## Code Examples

### Key migration before the first root (p65-02)
```typescript
// Sources: workspace-service.js:444-450,588-620; workspace-storage-service.js:45-53
if (!ws.workspace || ws.workspace.isDirectory) {
    const oldPrefix = ws.workspace ? ws.workspace.resource.toString() : '_global_';
    const fixed = configDir.resolve('workspaces').resolve('powerbrowser.theia-workspace');
    for (const [k, v] of await profileStorage.entriesWithPrefix(`${oldPrefix}:`)) {   // new accessor (CA-05)
        await profileStorage.setData(`${fixed.toString()}:${k.slice(oldPrefix.length + 1)}`, v);
    }
    await ws.save(fixed);              // no reload; fires onWorkspaceLocationChanged
}
await ws.spliceRoots(ws.tryGetRoots().length, 0, ...toAdd);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| token pairing kept in web localStorage | device keys; session-only memory pairing where keys cannot persist | Orca at the pin (#17399 note in `web-runtime-environment.ts:36`) | PB chooses session-only by preset |
| VS Code multi-diff | Theia single-diff workaround (GH-16280) | Theia 1.76 | combined diffs show one entry |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Reading the index (`:<n>:path`) can run `core.fsmonitor`; `-c core.fsmonitor=false` blocks it | CA-06, Q4 | harmless if wrong (the flag is still inert) |
| A2 | git resolves `<rev>:./path` relative to the working directory | Q4 | none; the validator refuses these forms anyway |
| A3 | Gecko LSNG stores localStorage keys uncompressed in `ls/data.sqlite`, table `data`, column `key` | CA-09 | scanner reads the wrong column; the planted control goes red ("collector blind"), so a wrong layout cannot pass |
| A4 | orcad reports `hostId` `'local'` for its own worktrees in `worktree list` | CA-12 | the local predicate needs a different value; Wave 0 fixture decides |
| A5 | Side-panel contents stay per perspective, so Orca containers do not appear in Coding | Q6 | containers leak into other modes; the extended mode-switch live row catches it |
| A6 | 50 MB blob cap | Q4 | very large files show as unavailable in diffs |
| A7 | `files.watcherExclude` defaults suffice for worktree roots | Pitfall 9 | high watcher load; add excludes |
| A8 | Orca tab ids survive an orcad restart (P65-18) | Q5 | name map resolves to gone tabs; widgets dispose; relaunch row goes red |

## Open Questions

1. **Hosted mounts (P65-04 gate):** `Sidebar` (with its two scroll refs), `Settings`, `OrchestrationCrewPanel`, `RightSidebar`, the seven pages, `page:creation`, `CheckRunDetailsPanel` and the resume modal have not been mounted under Route A. Recommendation: the first task of lane p65-01 runs `build-pb-entry.sh` and `measure.mjs --route standalone` / `--route a` under the live lock for each kind, records providers and import counts, and applies P64-03's two-attempt rule. The narrowest usable Settings width is recorded there.
2. **P64-22 host call:** the candidate `window.api.pty.spawn` with `{ worktreeId, tabId, leafId }`. Recommendation: take Phase 64's research answer when it lands; lane p65-04 builds against the interface.
3. **Owner item CA-07 (holder-5 growth):** accept, or have chrome remove PB-minted rows before spawn. Recommendation: accept in 65 and decide in Phase 67's RUN-07/RUN-09 plan.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | checks, Theia backend | ✓ | v24.22.1 | — |
| git | `pb-orca-git:` reads, live rows | ✓ | 2.54.0 | — |
| `node:sqlite` | offer scanner (LS probe) | ✓ | built-in | — |
| `theia/node_modules/typescript` | P63-27 parser rule in route and Add-project checks | ✓ | present | — |
| `orca/` pin | derived sets | ✓ | v1.4.248 | quick rows print a named SKIP when absent |
| Phase 63 / 64 code | p65-04 (`orca-terminals`), all lanes (`orca-panes`) | ✗ on this branch | branches `ServerDestroyer/p63-0*`; Phase 64 not built | lanes branch after the Phase 64 coordinator merge (P65-28) |
| Live lock `/home/chris/coding/Power-Browser/.git/pb-live.lock` | live rows | shared with Phase 64/66 lanes | — | queue under `flock` |

**Missing dependencies with no fallback:** Phases 63 and 64 merged into the v1.7 branch (already the stated precondition).

## Validation Architecture

(`workflow.nyquist_validation` is `true` in `.planning/config.json`.) Everything is automated; no human check is created (D-18). Human items wait for the end-of-milestone pass, as listed in 65-CONTEXT's Deferred Verification table.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node 24 scripts under `scripts/verify-platform.sh` rows |
| Config file | none (registry rows) |
| Quick run command | `scripts/verify-platform.sh --quick` or `--only <label>` |
| Full suite command | `scripts/verify-platform.sh` (live rows under `flock /home/chris/coding/Power-Browser/.git/pb-live.lock`, caches purged) |

### Phase Requirements → Test Map
| Criterion / Req | Behavior | Row(s) | Tier | Self-test plants (each red, naming it) | File exists? |
|---|---|---|---|---|---|
| SC1 / TAB-05 (routes) | editor-type content types, `OpenFile.mode`, `DiffSource`, `GitConflictKind` and `TopLevelView` derived with TypeScript's parser and compared as sets with the handler table and page rows; each value a Theia kind except the named `check-details` row | `orca-editor-routes`, `orca-editor-routes-self-test` | quick | added mode; added diff source; added conflict kind; added top-level view; a handler naming `EditorPanel`; zero-member parse; `check-details` routed to a Theia kind without the row's name | ❌ Wave 0 |
| SC1 / TAB-05 (no Orca editor) | entry import graph reaches no `components/editor/EditorPanel*.tsx` / `EditorContent.tsx`; `setWebDeviceKeySupportForTests` export present at the pin | `orca-pane-entry` (Phase 64 row, extended) | quick | an `EditorPanel` import; the export renamed in a fixture | Phase 64 row |
| SC1 / TAB-05 (live) | Orca open → Monaco on `file:` within 1 s; each diff source's left and right text equal `git cat-file blob` of the CA-03 specs; `both_modified` → merge editor, `deleted_by_them` → editor; no Orca Monaco DOM in pane roots (standalone positive control first); PB-owned roots == store's local non-archived worktrees as a set; create, delete and clean/dirty close; user-added root survives; user-removed PB root stays removed (CA-15) | `orca-workspace-live` | full | pure comparators on fixtures: wrong revision text, missing root, extra root, dirty editor closed | ❌ |
| SC1 (no reload, key copy) | first root on a fresh profile: no `beforeunload`/reload event, `<fixed>:perspective-layouts` deep-equals the old `_global_:` value, no `Untitled-*` file, quit returns `exited` | part of `orca-workspace-live` | full | fixture map: key left behind; untitled file present | ❌ |
| SC1 (`pb-orca-git:` validator) | spec grammar and root rules | `orca-git-spec-self-test` | quick | `..` segment; leading `/`, `./`; `HEAD:` ref; upper-case hex; 39 hex; `:4:`; NUL; option-shaped `-x`; root not a toplevel | ❌ |
| SC2 / TAB-07 | both containers in Orca mode; sidebar rows == `orca repo list`/`worktree list`; settings toggle round-trips; Agents part follows the experimental setting; sidebar click activates the worktree's PB tab; page entry opens `pb-orca:<word>`; extended CSS row at 0 changed values with controls registering | `orca-side-panel-live` (+ Phase 64 CSS row extended) | full | comparators on fixtures | ❌ |
| SC2 (no leak) | Orca containers absent from Coding/Browsing layouts after a switch | `verify-mode-switch-tabs-live.mjs` (extended) | full | existing | existing |
| SC2 (gate) | overlay stays additive | `orca-overlay`, `orca-overlay-built` | quick/full | existing | existing |
| SC3 / TAB-09 | no PB contribution string ∩ Orca Add-project vocabulary; empty vocabulary red | `orca-no-pb-add-project`, `-self-test` | quick | command label, toolbar item, chrome-bar title, empty vocabulary | ❌ |
| SC3 (live) | Add-project via `server-path` step in PB and on the standalone page give equal `orca repo list`; remove removes; root appears and goes | `orca-add-project-live` | full | comparator fixtures | ❌ |
| SC4 / TAB-08 (scanner) | needles from the live offer (P67-10 set); sinks `setups.json`, `powerbrowser-shell-state.json`, per-origin LS key column; zero sinks read = red | `orca-offer-scan`, `-self-test` | self-test quick, run full | offer planted in a copy of each sink; LS marker absent ("collector blind"); zero sinks | ❌ |
| SC4 (relaunch) | dock equal node by node; modes as saved; chat hydrated; each `o<n>` echoes on a new PTY under its old name; no pairing UI DOM; `orca-devices.json` counts: +1 used token row, 0 persisted keyed rows after restart | `orca-relaunch-restore-live` | full | count comparator fixtures (a persisted keyed row; +2 token rows); a dock with a moved split | ❌ |
| Extended | `verify-uri-roundtrip.mjs` (page, `checks`, `creating` names); `verify-mode-toggle-commands.mjs`; `verify-endpoints.sh` (P65-24); `gui04-registry-shape`/`verify-registry-shape.mjs`; `diff-theia-core.sh` | existing rows | quick/full | existing | existing |

### Sampling Rate
- **Per task commit:** `scripts/verify-platform.sh --only <lane quick rows>`, and `node scripts/scan-brand-residue.mjs` after staging.
- **Per wave merge:** `scripts/verify-platform.sh --quick`.
- **Phase gate:** `--quick` green; then, under the live lock, the extended CSS row first (P64-15 order), then `orca-workspace-live`, `orca-side-panel-live`, `orca-add-project-live`, `orca-offer-scan`, `orca-relaunch-restore-live`; then `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] P65-04 mount gate (lane p65-01, first task, live lock): every new kind; record providers and imports; Settings width.
- [ ] Fixture: `orca worktree list --json` and `orca repo list --json` output from a scratch data root, to fix CA-12's `hostId` values.
- [ ] `scripts/verify-orca-editor-routes.mjs`, `scripts/verify-orca-no-pb-add-project.mjs`, `scripts/lib/orca-offer-scan.mjs` + `scripts/verify-orca-offer-scan.mjs`, `scripts/verify-orca-workspace-live.mjs`, `scripts/verify-orca-side-panel-live.mjs`, `scripts/verify-orca-add-project-live.mjs`, `scripts/verify-orca-relaunch-restore-live.mjs`, and the `orca-git-spec` self-test, each with `--self-test` and exit 2 plus a `Next step:` line on an unknown argument (house style).
- [ ] Rows appended at the quick anchor (after the Orca block ending near `verify-platform.sh:3890`) and the full anchor (after `orca-service-live` near `:6483`), one `# NEW (65-0N, …)` block per lane.

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (pairing) | Orca's device-key pairing; session-only so no persisted key (CA-07) |
| V3 Session Management | yes | ephemeral keyed row; token in memory only |
| V4 Access Control | yes | `pb-orca-git:` served only over Theia's token-gated RPC; root membership |
| V5 Input Validation | yes | spec grammar, root realpath and toplevel check, `execFile` with no shell, `--` (Pattern 2) |
| V6 Cryptography | no new crypto | Orca's own (tweetnacl session key) |
| V8 Data Protection | yes | offer scanner over Setups, shell state and origin storage (CA-09) |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal through the git spec | Information disclosure | grammar refuses `..`, `.`, leading `/`, backslash; root must be a PB-owned toplevel |
| Option or command injection into git | Elevation | `execFile` argv, `--`, spec begins with hex or `:`; no textconv or filters; `core.fsmonitor=false`; `GIT_*` stripped |
| Offer persisted in a dead origin | Information disclosure | session-only preset plus its run-time assertion; LS key-absence probe with a control |
| Dormant runtime token rows | Elevation (same user) | recorded growth; owner option in Phase 67 (CA-07) |
| Large blob DoS | Denial of service | `maxBuffer` cap and timeout |

## Sources

### Primary (HIGH confidence; read this session)
- Orca v1.4.248: `src/main/runtime/{device-registry.ts,device-entry.ts,device-key-fork.ts,ephemeral-device-rows.ts,device-registry-disk-merge.ts,device-registry-file-read.ts,device-registry-startup-offer.test.ts,mobile-pairing-files.ts}`, `runtime-rpc/{runtime-rpc-pairing.ts,runtime-rpc-device-key-registration.ts,runtime-rpc-mobile-devices.ts}`, `rpc/mobile-socket-wiring.ts`, `ipc/mobile.ts`, `server/serve-pairing-readiness.ts`; `src/renderer/src/web/{web-device-key-support.ts,web-device-key.ts,web-runtime-environment.ts,web-runtime-credential-source.ts,web-runtime-device-key-migration.ts,web-preload-api.ts,preload-api/*}`; `components/{editor/EditorContent.tsx,editor/CheckRunDetailsPanel.tsx,sidebar/*,NativeChatResumeRuntimeModal.tsx,terminal-pane/ipc-pty-spawn-request.ts}`; `app-shell/{AppWorkspaceShell.tsx,AppRootSurfaces.tsx}`; `shared/{tab-types.ts,editor-tab-view-types.ts,ui-chrome-types.ts,git-status-types.ts,git-diff-compare-types.ts,execution-host.ts}`; `main/git/source-control/{branch-diff.ts,file-diff.ts,git-blob-read.ts}`; `.oxlintrc.json`.
- Theia 1.76: `workspace/lib/{browser/workspace-service.js,browser/workspace-storage-service.js,browser/workspace-frontend-contribution.js,common/untitled-workspace-service.js}`, `core/lib/browser/{diff-uris.js,storage-service.js,shell/shell-layout-restorer.js,view-container.d.ts,shell/view-contribution.d.ts}`, `scm/lib/browser/merge-editor/{merge-editor.js,merge-editor-module.js}`, `terminal/lib/browser/terminal-widget-impl.js`, `plugin-ext-vscode/lib/browser/plugin-vscode-commands-contribution.js`.
- PB tree: `theia/extensions/{tab-uris,modes}/src/browser/*` (files cited above), `powerbrowser/shell/{OrcaEnv,OrcaService,TheiaService}.sys.mjs`, `theia/applications/browser/package.json`, `scripts/verify-platform.sh`, branch `ServerDestroyer/p63-02` (`orca-terminals`).
- Spike 004 results (`results.md`, `results-route-*.json`, `pb-pane-mount.tsx`).

### Secondary
- 62/63/64/67-CONTEXT, DECISIONS D-01/D-02/D-18, ROADMAP Phase 65, REQUIREMENTS TAB-05..09.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH (installed, versions read).
- Architecture: HIGH for APIs; MEDIUM for hosted mounts (gate not run).
- Pitfalls: HIGH (each traced to a line); A1-A8 are flagged.

**Research date:** 2026-11-10
**Valid until:** the next Orca re-pin (weekly, D-26) or a Theia version change
