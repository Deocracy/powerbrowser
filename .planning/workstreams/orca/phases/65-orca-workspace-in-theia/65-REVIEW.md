---
phase: 65-orca-workspace-in-theia
reviewed: 2026-11-20T00:00:00Z
depth: deep
files_reviewed: 21
files_reviewed_list:
  - orca-overlay/files/src/renderer/src/pb/pb-session-pairing.ts
  - orca-overlay/files/src/renderer/src/pb/pb-side-mounts.tsx
  - orca-overlay/files/src/renderer/src/pb/pb-workspace-api.ts
  - theia/extensions/chrome-bar/package.json
  - theia/extensions/modes/src/browser/setups-service.ts
  - theia/extensions/orca-panes/src/browser/restore/orca-pane-name-map.ts
  - theia/extensions/orca-panes/src/browser/side-panel/orca-right-sidebar-toggle.ts
  - theia/extensions/orca-panes/src/browser/side-panel/orca-side-panel-module.ts
  - theia/extensions/orca-panes/src/browser/side-panel/orca-side-panel-sync.ts
  - theia/extensions/orca-panes/src/browser/side-panel/orca-side-view-widget.tsx
  - theia/extensions/orca-panes/src/browser/side-panel/orca-side-view.css
  - theia/extensions/orca-workspace/package.json
  - theia/extensions/orca-workspace/src/browser/orca-editor-routes.ts
  - theia/extensions/orca-workspace/src/browser/orca-git-resource.ts
  - theia/extensions/orca-workspace/src/browser/orca-root-sync.ts
  - theia/extensions/orca-workspace/src/browser/orca-workspace-frontend-module.ts
  - theia/extensions/orca-workspace/src/common/orca-git-protocol.ts
  - theia/extensions/orca-workspace/src/node/orca-workspace-backend-module.ts
  - theia/extensions/orca-workspace/tsconfig.json
  - theia/extensions/tab-uris/src/browser/profile-storage.ts
  - theia/extensions/tab-uris/src/browser/view-factory-table.ts
findings:
  critical: 1
  warning: 5
  info: 7
  total: 13
  necessity: 1
status: issues_found
---

# Phase 65: Code Review Report

**Reviewed:** 2026-11-20
**Depth:** deep
**Files Reviewed:** 21
**Status:** issues_found

## Summary

I reviewed the 21 scoped files at HEAD (e0c19c54). For the four pre-existing files I concentrated on the v1.7 diff from 2b5f4609. I traced these call chains across modules:

- the overlay's store projections (`pb-workspace-api.ts`) into `OrcaEditorRouter` and `OrcaRootSync`;
- the router into the `pb-orca-git:` resolver and its JSON-RPC backend;
- the side-panel sync into Orca's `activeView` and right-sidebar actions.

I checked behaviour against the pinned Orca source under `orca/` (context only) and against Theia 1.76 under `theia/node_modules`.

The trust boundary in the git backend is sound. It refuses bad roots, paths and revs, runs through `execFile` with `--`, strips `GIT_*`, and applies the size cap and timeout.

The serious defect is in the diff routing. A side whose path does not exist at its rev becomes a git failure, and the whole diff then fails to open. That happens for every added, deleted or untracked file, which are common clicks in Orca's source-control list. Because Orca's own editor is never mounted (D-01), the user sees nothing.

Two more defects come from timing and lose tabs or editors:

- the router's first snapshot races the root sync;
- the root sync guesses hydration with a 750 ms timer.

The local/remote predicate in the overlay fails open. Today that is latent, because D-20/D-31 record that headless orcad has no SSH stack.

## Critical Issues

### CR-01: A diff side whose path is absent at its rev fails the whole diff (added, deleted and untracked files never open)

**File:** `theia/extensions/orca-workspace/src/browser/orca-editor-routes.ts:139-154`, `theia/extensions/orca-workspace/src/node/orca-workspace-backend-module.ts:55-65`, `theia/extensions/orca-workspace/src/browser/orca-git-resource.ts:28-34`

**Issue:** `diffSides` treats only a *null object id* as an empty side (`blob()`, line 136). A valid rev whose tree or index lacks the path is still sent to the backend as `<rev>:<path>`. `git cat-file blob` then exits 128, `runGit` returns `git-failed`, and `OrcaGitResource.readContents` throws a plain `Error`. Theia's `MonacoEditorModel.readContents` (`@theia/monaco/lib/browser/monaco-editor-model.js:371-376`) turns only `ResourceError.NotFound` into an empty model and rethrows anything else. The diff editor therefore fails to open, `openRecord` rejects, and `apply` (line 297-301) records the failure under the record's signature, so the tab is never retried. Concrete cases:

- **Untracked file, unstaged diff.** Orca's `openUncommittedEntry` (`orca/src/renderer/src/components/right-sidebar/source-control/listing/open-uncommitted-entry.ts:33`) opens every untracked non-markdown file with `openDiff(..., staged=false)`, which gives `diffSource: 'unstaged'`. A single diff record carries no `area` (`pb-workspace-api.ts:122`), so the left side is always `:0` (line 152), and there is no stage 0 for an untracked path. The combined branch handles `area === 'untracked'`, which shows the case was known but not covered for single diffs.
- **Staged added file.** The left side is `<HEAD>:path`, and HEAD does not contain the path.
- **Staged deleted file.** The right side is `:0:path`, and the index does not contain it.
- **Branch and commit diffs** of added or deleted files. The merge base, parent or head commit lacks the path.

Every such Orca click opens nothing in Theia, and Orca's own editor is never mounted (D-01), so the file cannot be viewed from Orca at all.

**Fix:** Tell "path absent at this rev" apart from a failed read. Report it as an empty side or as NotFound:
```ts
// backend: probe before reading
const exists = await runGit(['-c', 'core.fsmonitor=false', '-C', root, 'cat-file', '-e', '--', `${rev}:${relativePath}`]);
if (!('out' in exists)) { return { ok: false, reason: 'missing' }; }

// orca-git-resource.ts
if (!r.ok) {
    if (r.reason === 'missing') {
        throw ResourceError.NotFound({ message: 'pb-orca-git side absent', data: { uri: this.uri } });
    }
    throw new Error(`pb-orca-git read refused: ${r.reason}`);
}
```
Also carry the status entry's `area` into single unstaged diff records (or probe `:0` first), so an untracked file's left side is `''`. Add plants for the added, deleted and untracked cases to `orca-workspace-live`.

## Warnings

### WR-01: The overlay's local predicate fails open: an unknown worktree, a folder workspace or a host-less worktree counts as local

**File:** `orca-overlay/files/src/renderer/src/pb/pb-workspace-api.ts:55-58`, `:104-120`

**Issue:**

- `worktreeIsLocal(undefined)` returns `true`. `openFileRecords` looks a file's worktree up only in `worktreesByRepo` (line 106). Folder workspaces live in `state.folderWorkspaces`, not in `worktreesByRepo`: Orca synthesises their worktree rows separately (`orca/src/shared/folder-workspace-worktree.ts:83-150`). So every folder-workspace file is classified `local: true` whatever the folder's `connectionId` or `executionHostId`, and it gets `worktreePath: ''`. Its diff and conflict routes then join paths against `''` (`orca-editor-routes.ts:135`), which gives `/<relativePath>` at the filesystem root.
- A worktree with no `hostId` is classified local. Orca itself falls back to the repo row's host in that case (`orca/src/shared/worktree-execution-host-resolution.ts:47-75`, `ai-vault-session-worktree.ts:219-221`). The type comment calls `hostId` optional "for pre-project-host metadata". Orca's own rule is "Unresolved ownership never authorizes a local read of a remote path" (same file, line 1-2).

If a remote row slips through, PB opens a `file:` editor at the remote path on the local disk and can save into a different file that happens to share the path. It also adds that path as a workspace root. Today this is latent for SSH, because D-20/D-31 record that headless orcad has no SSH stack. It becomes live on the weekly re-pin (D-26).

**Fix:** Resolve the owner the way Orca does, and fail closed:
```ts
const worktree = worktrees.get(file.worktreeId) ?? folderWorktrees.get(file.worktreeId); // from folderWorkspaceToWorktree
const host = worktree ? resolveWorktreeExecutionHost(createRepoRowExecutionHostLookup(state.repos), worktree) : undefined;
local: !!worktree && host?.kind === 'resolved' && hostIsPaired(host.hostId, paired) && ownerIsPaired(...)
```
Apply the same rule in `subscribeWorktrees` (line 162).

### WR-02: The router's first snapshot races the root sync, and a refused diff is never retried

**File:** `theia/extensions/orca-workspace/src/browser/orca-editor-routes.ts:257-266`, `:297-301`; `theia/extensions/orca-workspace/src/browser/orca-git-resource.ts:55-59`; `theia/extensions/orca-workspace/src/browser/orca-root-sync.ts:131-133`, `:151-156`

**Issue:** `OrcaEditorRouter` subscribes as soon as `bundle.ready()` and `sessionRestored` resolve, and it opens every record of the first snapshot at once. The `pb-orca-git:` resolver trusts the persisted owned roots plus `OrcaRootSync.liveRootPaths()`. That second list is `previousWanted`, which is set only after the 750 ms settle timer and a completed `sync()`. So at the router's first snapshot, every diff or merge record whose worktree is not already in `powerbrowser.orca.ownedRoots` is refused (`'pb-orca-git URI outside the Orca worktree roots'`). That covers every worktree on a first launch with an empty owned set, and any worktree that was already a user root and so is never PB-owned. `apply` then stores `{ signature, uri: undefined }`. Because the signature does not change when the roots arrive, those Orca tabs never open in Theia for the rest of the session.

**Fix:** Either make the router wait for the root sync's first applied snapshot (expose a `firstSync` promise from `OrcaRootSync` and await it beside `sessionRestored`), or make the resolver trust the live snapshot's local roots as soon as the store reports them (not only after `sync()`). Also, do not cache a failed open under its signature: keep failed record ids in a retry set and retry them on the next root change.

### WR-03: Hydration is guessed with a 750 ms timer; a slow repo's roots are removed and their restored editors closed

**File:** `theia/extensions/orca-workspace/src/browser/orca-root-sync.ts:38-42`, `:178-210`; `theia/extensions/orca-workspace/src/browser/orca-editor-routes.ts:366-392`

**Issue:** Orca fills `worktreesByRepo` one repo at a time: `fetchAllWorktrees` merges each repo's result separately through a pool (`orca/src/renderer/src/store/slices/worktrees/listing/fetch-all-worktrees.ts:37-75`). At relaunch, `previousWanted` is all the persisted owned roots still in the workspace (line 190). If two repo merges are more than `SETTLE_MS` apart, the first `sync()` sees a partial wanted set and does the following:

1. It treats the other repos' worktrees as dropped and removes those roots (line 200).
2. It calls `router.closeCleanUnder`, which disposes every clean editor that Theia's layout restore reopened under them (line 205-207).
3. It re-adds the roots on the next snapshot, but the closed editors stay closed. `OrcaEditorRouter.known` still holds their records with an unchanged signature, so even Orca-backed ones are not reopened.

The code comment records the timer as a shortcut. The store has a real signal: `hasHydratedWorktreePurge`, which `fetch-all-worktrees.ts:35` reads.

**Fix:** Expose a hydration flag from the bundle (for example `hydrated: state.hasHydratedWorktreePurge` in the B-3 projection). Apply drops only once it is true. Before then, apply only additions. When `closeCleanUnder` disposes a widget, also clear the matching `known` entries, so a returning worktree's records reopen.

### WR-04: Re-selecting the same Orca page or Settings does nothing after focus moved elsewhere

**File:** `theia/extensions/orca-panes/src/browser/side-panel/orca-side-panel-sync.ts:219-238`, `:258-289`; `orca-overlay/files/src/renderer/src/pb/pb-workspace-api.ts:22-32`

**Issue:** The store's `activeView` is written back from PB only when a page tab activates or when the page tab of the current view closes. Two ordinary sequences break:

- **A page.** The user opens Tasks (activeView is `tasks`, and the `pb-orca:tasks` tab opens). They click an editor or terminal tab, which writes nothing, and then click Tasks again in Orca's sidebar. Orca writes `tasks` again. `subscribeProjection` suppresses the unchanged JSON, so `onActiveView` never runs and the Tasks tab is not brought forward.
- **Settings.** Collapsing the Settings part, or switching the left panel away, never writes back. A second Settings click is likewise swallowed, and `revealSettings` never runs.

**Fix:** In `onActiveWidget`, when a main-area widget that is not a page activates while `this.activeView` is a page view or `settings`, write `'terminal'` (as `watchPage` already does on close). Write `'terminal'` too when the Settings part is collapsed or hidden (`ViewContainer` part `onDidChangeVisibility`/collapse). Alternatively, project a request counter from the overlay so that a repeated `setActiveView` with the same value is still reported.

### WR-05: The diff tab title shows Orca's internal diff-source identifiers

**File:** `theia/extensions/orca-workspace/src/browser/orca-editor-routes.ts:190`

**Issue:** The diff label is `` `${rel.split('/').pop()} (${source})` ``, so tabs read `app.ts (combined-uncommitted)`, `app.ts (combined-all)` or `app.ts (unstaged)`. `DiffUris.encode` stores the label as the URI path, and Theia's diff label provider shows it as the tab title (`@theia/core/lib/browser/diff-uris.js:33,60-62`). CLAUDE.md "User-facing copy": "no internal identifier may appear in user-facing text". The label is also part of the `diff:` URI that Setups persist (`setups-service.ts:947-951`), so the identifier spreads into saved state.

**Fix:** Map each rule to plain words, preferably Orca's own translated strings where it has them, for example `{ unstaged: 'Working Tree', staged: 'Index', branch: 'Branch', commit: 'Commit' }`. Do not print the combined source name; the label then names the entry's own rule. Keep the mapping in `ORCA_EDITOR_ROUTES`' module, so `verify-orca-editor-routes` can assert every key has a label.

## Info

### IN-01: Closing an Orca tab disposes a Theia editor the user had opened independently

**File:** `theia/extensions/orca-workspace/src/browser/orca-editor-routes.ts:331-341`, `:443-446`
**Issue:** `openCounterOf` and `EditorManager.open` adopt any existing editor of the same URI into `byUri`. When the Orca record goes away, `releaseIfOrphan` disposes it, even though the user opened it from Theia before Orca named the file. Only clean widgets are disposed, so no text is lost.
**Fix:** Record whether the router created the widget (it was absent from `editorManager.all` before the open), and dispose only those.

### IN-02: The orchestration focus is never cleared when the focused chat or terminal closes

**File:** `theia/extensions/orca-panes/src/browser/side-panel/orca-side-panel-sync.ts:270-273`
**Issue:** `setOrchestrationFocus` is called on activation only. After the focused pane is disposed, the Agents part keeps following a gone tab. `ChatCrew` renders nothing, and `TerminalCrew` resolves identity with a null pty.
**Fix:** On the focused widget's `disposed`, call `api.setOrchestrationFocus(null)` (or move focus to the next active orchestration kind).

### IN-03: The tombstone prune fails open when setups.json cannot be parsed

**File:** `theia/extensions/modes/src/browser/setups-service.ts:1419-1433`; `theia/extensions/orca-panes/src/browser/restore/orca-pane-name-map.ts:125-134`
**Issue:** `referencedTabUris` counts an unreadable or corrupt setups store as empty, so `prune` drops every tombstone it references. If the file is later repaired, those names can already have been reminted, and the restore then opens a different pane. A missing file (a fresh profile) legitimately means empty.
**Fix:** Return `undefined` on a read or parse error other than not-found, and skip the prune for that launch.

### IN-04: A merge editor saved in a Setup restores as a plain editor of the result file

**File:** `theia/extensions/modes/src/browser/setups-service.ts:944-957`
**Issue:** The 65-05 fallback keeps a diff editor's `diff:` URI. A `MergeEditor` has no `diff:` editor URI, and its `getResourceUri()` is `resultUri` (`@theia/scm/lib/browser/merge-editor/merge-editor.js:325-327`), so it reopens as a file editor rather than a merge.
**Fix:** If `MergeEditorUri` can be built from the widget (`baseUri`, `side1Uri`, `side2Uri`, `resultUri`), store `MergeEditorUri.encode(...)`.

### IN-05: Phantom requirement: the narrowing guard for an unmerged lane

**File:** `theia/extensions/orca-workspace/src/browser/orca-editor-routes.ts:83-89`
**Category:** necessity
**Issue:** `narrowWorkspaceApi` returns undefined "when an export is missing (lane p65-01 not merged)". Lane p65-01 is merged: `pb-workspace-api.ts` exports `subscribeOpenFiles` and `subscribeWorktrees`, and the `orca-pane-entry` consumer clause compares these members with the entry's exports at build time. The state rests on judgment (a future bundle could drop an export), so this is Info. The side panel casts the same bundle without narrowing (`orca-side-view-widget.tsx:47-49`), which is inconsistent.
**Fix:** Keep one narrowing helper for both consumers, or drop the lane wording and treat a missing export as a build defect caught by the consumer clause.

### IN-06: Blob text is always decoded as UTF-8

**File:** `theia/extensions/orca-workspace/src/node/orca-workspace-backend-module.ts:64`
**Issue:** `r.out.toString('utf8')` garbles Latin-1 or UTF-16 files and binary blobs, while the working-file side is decoded with Theia's encoding detection. The two sides of the diff then disagree on every non-ASCII byte.
**Fix:** Return base64 and decode with the editor's encoding on the frontend, or at least detect a NUL byte and refuse with a `binary` reason.

### IN-07: A restored Orca page view opens its tab at launch in any mode

**File:** `theia/extensions/orca-panes/src/browser/side-panel/orca-side-panel-sync.ts:219-238`
**Issue:** The first `subscribeActiveView` value always counts as a change (`this.activeView` starts undefined). A persisted `activeView` of a page (Orca saves `ui.activeView`) therefore opens or activates `pb-orca:<page>` on every launch. That takes focus from the restored active tab, and it happens in Browsing or Coding as well as in the Orca mode.
**Fix:** Seed `this.activeView` from the first callback without acting on it, as `subscribeWorktreeChanges` does with `primed`.

---

_Reviewed: 2026-11-20_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
