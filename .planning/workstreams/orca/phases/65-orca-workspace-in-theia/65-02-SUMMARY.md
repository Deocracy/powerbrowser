---
phase: 65-orca-workspace-in-theia
plan: 02
subsystem: theia/orca-workspace
status: complete
tags: [TAB-05, orca, theia, editor, diff, merge-editor, workspace-roots, pb-orca-git]
requires:
  - "C64-1 boot handle and OrcaPaneBundle.ready() (orca-panes)"
  - "C64-2 @powerbrowser/orca-panes, C64-3 route table, C64-7 live harness rows"
  - "B-2 subscribeOpenFiles, B-3 subscribeWorktrees, B-10 openPane JSON details (lane p65-01, for the live row)"
provides:
  - "@powerbrowser/orca-workspace (frontend + backend), wired into build:extensions and the browser app"
  - "ORCA_EDITOR_ROUTES handler table, pure routeOpenFile, OrcaEditorRouter with close sync"
  - "pb-orca-git: read-only content scheme (OrcaGitService at /services/powerbrowser-orca-git)"
  - "OrcaRootSync: PB-owned roots, user-removed roots, prefix migration to powerbrowser.theia-workspace"
  - "ProfileStorageService.keysWithPrefix"
  - "rows orca-editor-routes, orca-editor-routes-self-test, orca-git-spec-self-test, orca-workspace-live-self-test (quick), orca-workspace-live (full)"
affects: [65-04, 65-05, 66, 67]
tech-stack:
  added: []
  patterns:
    - "derive-and-compare handler table against the pinned Orca source (typescript AST)"
    - "trust-boundary grammar in a dependency-free common module shared by frontend, backend and the check"
    - "difference-based root sync with persisted owned and user-removed sets (CA-15)"
key-files:
  created:
    - theia/extensions/orca-workspace/package.json
    - theia/extensions/orca-workspace/tsconfig.json
    - theia/extensions/orca-workspace/src/common/orca-git-protocol.ts
    - theia/extensions/orca-workspace/src/node/orca-workspace-backend-module.ts
    - theia/extensions/orca-workspace/src/browser/orca-workspace-frontend-module.ts
    - theia/extensions/orca-workspace/src/browser/orca-editor-routes.ts
    - theia/extensions/orca-workspace/src/browser/orca-git-resource.ts
    - theia/extensions/orca-workspace/src/browser/orca-root-sync.ts
    - scripts/verify-orca-editor-routes.mjs
    - scripts/verify-orca-workspace-live.mjs
  modified:
    - theia/extensions/tab-uris/src/browser/profile-storage.ts
    - theia/package.json
    - theia/applications/browser/package.json
    - scripts/verify-platform.sh
decisions:
  - "both_added conflicts open the merge editor with an empty base side instead of relying on Theia's base-read fallback"
  - "the pb-orca-git resolver trusts the persisted PB-owned roots plus the live store's local roots once the store has reported"
  - "root sync waits 750 ms of store quiet and ignores an empty list before any worktree was reported (no hydration signal in B-3)"
  - "orca-workspace-live's clause (c) positive control is the Monaco root selector inside the Theia editor of clause (a)"
metrics:
  duration: "about 35 minutes"
  completed: 2026-11-10
estimate:
  tokens: 240000
  tasks: 3
actuals:
  tokens: 31000
  tasks: 3
  commits: 3
plan_head_before: fd1062aae244299164874d87ad0a76d7c7ed02c1
plan_head_after: 1a44ee37aea98f801dcd060c689f3067b7f86fa0
---

# Phase 65 Plan 02: Orca files and diffs in Theia's editor, worktrees as workspace folders Summary

@powerbrowser/orca-workspace opens Orca's editor-type tabs in Theia's editor, diff editor and merge editor through a validated read-only `pb-orca-git:` blob scheme. It also keeps every local Orca worktree as a Theia workspace folder through difference-based root sync, and moves the workspace prefix to the fixed `powerbrowser.theia-workspace` file before the first root.

## Setup

- Step 0 (Phase 64 contract), on base fd1062aa:
  - C64-2: `theia/extensions/orca-panes` is present, with `OrcaPaneBundleApi`, `ORCA_PANES_SERVICE_PATH`, `OrcaPaneBundle.ready()`, and `OrcaTerminalKeybindings` as the last bind.
  - C64-3: `ORCA_PANE_ROUTES`, `mintName` and `planPanes` are present.
  - C64-7: `scripts/lib/orca-pane-harness.mjs`, `scripts/lib/orca-tabs-live.mjs` and the rows `orca-pane-entry`, `orca-pane-routes`, `orca-tabs-live` and `orca-tabs-live-self-test` are present.
  - The base has 4 `p64-0` merges. No BLOCKER.
  - No path substitution: every planned path exists under its planned name.
- Step 1: `nix develop .#theia --command node scripts/generate.mjs` gave PASS (72 files).
- Step 2: `bash scripts/fetch-orca.sh` cloned v1.4.248 (965978bc).
- Step 3: the audited install (`yarn install --ignore-scripts --frozen-lockfile`, then the drivelist rebuild) ran, followed by the tab-uris, token-gate and orca-panes builds. `theia/yarn.lock` is unchanged.

## Commits

| Task | Commit | Files |
|------|--------|-------|
| 1 tracer: router, wiring, orca-editor-routes | 33260d45 | orca-workspace package.json, tsconfig.json, frontend module, orca-editor-routes.ts; theia/package.json; app package.json; verify-orca-editor-routes.mjs; verify-platform.sh |
| 2 pb-orca-git scheme, backend reader, diff and merge routes | 13055820 | orca-git-protocol.ts, orca-workspace-backend-module.ts, orca-git-resource.ts, orca-editor-routes.ts, frontend module, package.json (backend key), verify-orca-editor-routes.mjs, verify-platform.sh |
| 3 roots, prefix migration, close sync, orca-workspace-live | 1a44ee37 | orca-root-sync.ts, orca-editor-routes.ts, orca-git-resource.ts, frontend module, profile-storage.ts, verify-orca-workspace-live.mjs, verify-platform.sh |

Task 1's tracer gate re-ran its automated verify end to end and passed before Task 2 started. That verify is the extension build, `src-gen/frontend/index.js` naming orca-workspace, `yarn.lock` unchanged, and both rows.

## Check results (lane worktree)

- `orca-editor-routes: PASS -- 5 modes (edit, diff, conflict-review, markdown-preview, check-details), 8 diff sources and 7 conflict kinds equal ORCA_EDITOR_ROUTES' keys; editor-type content types editor, diff, conflict-review, check-details each covered; every value a Theia kind except the named row check-details; (f) TopLevelView SKIP (lane p65-04 restore directory absent)`
- `orca-editor-routes self-test: PASS -- 8 planted faults each went red naming the drift; the control re-ran green after each undo`, then `orca-editor-routes route self-test: PASS -- 21 routes match CA-01..CA-03`
- `orca-git-spec self-test: PASS -- the argv, 17 planted refusals, the toplevel root rule and the hermetic bytes` (29 `ok` lines)
- `orca-workspace-live self-test: PASS -- every comparator plant went red naming its drift and its control stayed green; planRoots, noteUserRemovals and planMigration match the behaviour list`
- `orca-workspace-live: SKIP -- no built PowerBrowser (.../p65-02/objdir/dist/bin/powerbrowser missing; ...)` exits 0. `--nope` exits 2 on both scripts.
- `gui04-registry-shape` and `gui04-registry-shape-self-test` PASS (TabUriRegistry's shape is unchanged).
- `diff-theia-core: PASS -- zero changes inside @theia/*`. This ran after the backend booted with the orca-workspace module loaded.
- `--quick` in the lane worktree has two lane-caused reds, listed under "Merge note". Every other red is environmental and comes from this lane worktree having no fetched `upstream/` and no pnpm-installed `orca/`: group-channel, ext-tab-host-*, crash-*, shell-*, shortcut-relay, permission-prompts, installer-schema, gui07-strip-spike-verdict, and orca-mobile-skew-self-test (cannot find zod). Each failure line names a missing `upstream/` file or package.

## Wiring and yarn.lock

- `theia/package.json` build:extensions has `yarn --cwd extensions/orca-workspace build` immediately after orca-panes and before bundled-extensions. No other entry moved.
- `theia/applications/browser/package.json` has `"@powerbrowser/orca-workspace": "0.1.0"` after orca-panes.
- The audited install ran again after the wiring: `theia/yarn.lock` is unchanged and every dependency was already pinned at 1.76.0. The rerun removed drivelist's compiled `.node`, so the drivelist rebuild was run again.
- The app build is green. `src-gen/frontend/index.js` and `src-gen/backend/server.js` both name orca-workspace, and the frontend bundle carries the root-sync keys.
- ProfileStorageService accessor: added in PB's own tab-uris file, no @theia/* edit (CA-05).

## Brand report (lane counts; inventory/brand-tokens.json untouched)

`node scripts/scan-brand-residue.mjs --report .mozbuild/p65-02/brand-report.md`, run after staging:
- Held-back rows: `Orca` 1593 (expected 1591, +2), `orca` 3602 (expected 3582, +20), `ORCA` 682 to 685 (+3).
- Condition-4 hits, which are files no row claims yet (359 in total):
  - verify-orca-workspace-live.mjs: 89
  - orca-editor-routes.ts: 84
  - verify-orca-editor-routes.mjs: 67
  - orca-root-sync.ts: 32
  - orca-git-resource.ts: 23
  - orca-workspace-frontend-module.ts: 21
  - orca-workspace-backend-module.ts: 20
  - orca-git-protocol.ts: 19
  - orca-workspace/package.json: 4
- No new in-word join: only `withOrcaTabsSession` and `needOrca` occur, and both already have literal rows.
- profile-storage.ts carries no brand token.

## Coordinator proof commands

On the merged tree (lanes p65-01, p65-03 and p65-04 in):
1. Inside `nix develop .#theia`, in `theia/`: `yarn install --ignore-scripts --frozen-lockfile`, then `(cd node_modules/drivelist && node-gyp rebuild)`, then `yarn build`. Check that `git diff --quiet -- theia/yarn.lock` passes.
2. `scripts/verify-platform.sh --only orca-editor-routes`. Once p65-04's `restore/` directory exists, clause (f) compares TopLevelView with ORCA_PAGE_ROUTES instead of SKIP.
3. `scripts/verify-platform.sh --only orca-editor-routes-self-test`, `--only orca-git-spec-self-test` and `--only orca-workspace-live-self-test`.
4. Under the lock with ORCA_* unset, and after `orca-pane-css-live`:
   `env $(compgen -e | grep '^ORCA_' | sed 's/^/-u /') PB_FIREFOX_BIN=/home/chris/orca/workspaces/Power-Browser/v1.7-Orca-integration/objdir/dist/bin/powerbrowser flock /home/chris/coding/Power-Browser/.git/pb-live.lock scripts/verify-platform.sh --only orca-workspace-live`

## Owner items for the deferred list

- P65-06: the fixed workspace file `<profile>/powerbrowser-theia/workspaces/powerbrowser.theia-workspace`.
  - The first Orca root moves the workspace prefix there, and every `_global_:` key, or a folder workspace's keys, is copied first.
  - Moving the prefix again later needs a second migration, so the cost of changing this rises after release.
  - The Theia document URL gains `#<path to that file>`. It is internal and not secret. It belongs on Phase 67's list of addressable surfaces.

## Merge note for the coordinator

- Registry: this lane's blocks are first at both anchors. The quick block (`# NEW (65-02, ...)` with orca-editor-routes, orca-editor-routes-self-test, orca-git-spec-self-test and orca-workspace-live-self-test) sits directly before `"allowlist-schema|check_allowlist_schema"`. The full block (orca-workspace-live) sits directly before the `)` after `orca-tabs-live`. p65-03 and p65-04 append after them.
- `backend-env-readers` and `backend-env-readers-self-test` are red because of this lane. `orca-workspace-backend-module.ts` copies the live environment minus every GIT_* name for its git child (T-65-05). That makes it an environment toucher, and it reads no product-prefixed key. The allowlist `EXPECTED_ENV_TOUCHERS` lives in `scripts/verify-backend-env-readers.mjs`, which is outside this lane's files_modified, so the lane did not edit it. The coordinator adds one row:
  `['theia/extensions/orca-workspace/src/node/orca-workspace-backend-module.ts', 'copies the environment minus every GIT_* name for the pb-orca-git git child (T-65-05); reads no prefixed key']`
  Dodging the regex with a destructured read was rejected because it would defeat the gate.
- The TopLevelView clause of orca-editor-routes changes from SKIP to a real comparison once p65-04 merges. A red there means ORCA_PAGE_ROUTES is missing or does not match the TopLevelView members.
- Brand rows for every orca-workspace file and both new scripts belong to the coordinator (counts above). No WINDOWS.md ids were written.
- orca-workspace-live needs p65-01's `subscribeOpenFiles` and `subscribeWorktrees`, `state().pairing.sessionOnly`, and `openPane('diff' | 'conflict-review', id, JSON)`. Until the entry exports the first two it prints a named SKIP. It also needs a built PowerBrowser.

## Deviations from Plan

### Auto-fixed Issues

1. **[Rule 1 - Bug] both_added conflicts use an empty base side.**
   - Found during: Task 2.
   - Issue: a both_added conflict has no stage 1. The plan relied on Theia's base-read fallback.
   - Fix: the route now gives the base rev `''`, so nothing fails and nothing is read. The route self-test covers it.
   - Commit: 13055820.
2. **[Rule 2 - Correctness] Untracked combined entries.**
   - Found during: Task 2.
   - Issue: a combined entry with area `untracked` has no `:0`.
   - Fix: its left side is empty. The route self-test covers it.
   - Commit: 13055820.
3. **[Rule 2 - Correctness] Resolver trust set.**
   - Found during: Task 3.
   - Issue: a worktree that was already a user root when PB first saw it is not PB-owned (PB never removes it). Trusting only the persisted owned set would refuse every diff under it.
   - Fix: the resolver trusts the persisted owned roots plus the live store's local roots, and the latter only after the store has reported. The persisted set still covers layout restore (Pitfall 3), and the backend validates every root again.
   - Commit: 1a44ee37.
4. **[Rule 1 - Bug] previousWanted at session start.**
   - Found during: Task 3.
   - Issue: with previousWanted set to the persisted owned set, a relaunch into a workspace the user switched to would never re-add the Orca roots.
   - Fix: at session start it is the owned roots still present in the workspace.
   - Commit: 1a44ee37.
5. **[Rule 1 - Bug] Store hydration.**
   - Found during: Task 3.
   - Issue: B-3 carries no hydration signal. A store hydrating repository by repository would look like worktrees leaving, which would remove roots and close editors.
   - Fix: sync runs after 750 ms of store quiet, and an empty list before any worktree was ever reported is ignored. The code has a `shortcut:` comment.
   - Commit: 1a44ee37.
6. **[Rule 1 - Bug] One failed record stopped the snapshot.**
   - Found during: Task 3.
   - Issue: a record whose open throws, such as a refused read, stopped the rest of the snapshot.
   - Fix: each record is isolated and logs one line.
   - Commit: 1a44ee37.
7. **[Rule 1 - Bug] Closed records reopened.**
   - Found during: Task 3.
   - Issue: after a Theia-side close, the record could be reopened while Orca was still closing its tab.
   - Fix: such a record stays known with nothing open.
   - Commit: 1a44ee37.

### Live-row design adjustments (orca-workspace-live, not run in the lane)

- **Own session.** The row does not use `withOrcaTabsSession`, which adds its repository before calling fn. The row builds the same session with the same helpers, prefs, CLI environment and teardown, and adds the repository itself after the reload marker is set, because clause (e) measures that first add.
- **Positive control for clause (c).** Monaco's root selector (`.monaco-editor`; Orca's MonacoEditor.tsx imports `@monaco-editor/react`, and the row checks that import in the source) is first required inside the Theia editor of clause (a), then required absent from every `[data-pb-orca-pane]` root. The plan named the standalone page as the control, but after C3-65 no hosted kind mounts Orca's EditorPanel, so that page has no Orca editor to read.
- **Diff and merge sides.** Expected sides are derived from each subscribeOpenFiles record by CA-03. The row does not assume what Orca computes for branch and commit compares.

### Not done here, by design

- orca-workspace-live was written and self-tested but not run. It is coordinator-run on the merged tree (65-05).

## Known Stubs

None. The `log` routes (remote host, markdown-preview note, a one-sided conflict with no working file) are the specified behaviour, not placeholders.

## Threat Flags

None beyond the plan's register. T-65-04 through T-65-08 are mitigated as specified, with T-65-04, T-65-05 and T-65-07/T-65-08 covered by self-test plants and the live row's clauses.

## TDD Gate Compliance

- Task 2: the route and git-spec self-tests were written first. They ran red because `orca-git-protocol.ts` was absent, then went green after the implementation. Both are in commit 13055820.
- Task 3: the orca-workspace-live behaviour checks ran red because `orca-root-sync.ts` was absent, then went green. Both are in commit 1a44ee37.

## Self-Check: PASSED

- Files: all 14 lane files exist on the branch, and this SUMMARY is the 15th.
- Commits 33260d45, 13055820 and 1a44ee37 are ancestors of HEAD.
- `git rev-list --count fd1062aa..1a44ee37` gives 3.
