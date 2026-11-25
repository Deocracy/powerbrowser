# Fix brief: G4-workspace-agents

Lane: product. Items: 13. Files this group owns: `^theia/extensions/` (pattern), `^bundled-extensions/` (pattern).

Item IDs: 65-CR-01; 68-WR-04; 63-WR-01; 63-WR-02; 63-WR-03; 65-WR-02; 65-WR-05; 65-WR-03; agents-extensions-01; agents-extensions-02; agents-extensions-03; sidecar-gate-backends-02; sidecar-gate-backends-03.

## 65-CR-01: A diff side whose path is absent at its rev fails the whole diff (added, deleted and untracked files never open)

- **Severity:** medium (reviewer label: critical)
- **Verdict:** CONFIRMED
- **Location:** `theia/extensions/orca-workspace/src/browser/orca-editor-routes.ts`

*Section CR-01 of `.planning/workstreams/orca/phases/65-orca-workspace-in-theia/65-REVIEW.md`, verbatim:*

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

**Verifier (CONFIRMED, medium; scope: linux product (the Theia frontend's Orca editor routing and the pb-orca-git backend; the same code ships on every OS)).** I traced every step from source on disk.

1. Routing. diffSides (orca-editor-routes.ts:136-153) turns only a null object id into an empty side. The staged rule sends left = HEAD oid and right = ':0'. The branch rule sends mergeBase and headOid, and the commit rule sends parentOid and commitOid. Every one of these is a commit or index spec that has nothing to do with the individual file. The unstaged default sends left = ':0' unless area === 'untracked'. That area is passed only for combined diffs (line 189 passes `undefined` for a single diff).

2. Orca's inputs. openUncommittedEntry (orca/.../open-uncommitted-entry.ts:21-35) sends every untracked or added file that is not markdown to openDiff(..., staged=false). open-unstaged-diff.ts:34 then sets diffSource 'unstaged'. The overlay's openFileRecords (orca-overlay/.../pb-workspace-api.ts:104-140) copies diffSource and the commit-level branchCompare/commitCompare oids. For a single diff it carries no area, no file status and no per-file blob id. Orca does not send a null oid for an added or deleted path. It sends null only for an unborn HEAD, a missing merge base or a root commit. So the counter-evidence named in the task does not hold.

3. Backend. readBlob short-circuits only rev === ''. Otherwise it runs `git cat-file blob -- <rev>:<path>` through execFile. When the path is absent at that tree or index, git exits 128, runGit resolves {reason:'git-failed'}, and readBlob returns {ok:false}. OrcaGitResource.readContents then throws a plain Error.

4. Theia. node_modules/@theia/monaco/lib/browser/monaco-editor-model.js:371-376 converts only ResourceError.NotFound and rethrows anything else. resolveModel is created at line 83, so a rethrow rejects it, which rejects load() in monaco-text-model-service.js:83 and createModelReference. MonacoEditorProvider.getModel (monaco-editor-provider.js:71-82), used for both diff sides at lines 208 and 371, therefore rejects, and the open rejects. A NotFound would not rescue this either: it leaves the model invalid, and getModel then throws MODEL_IS_INVALID at line 79. The proposed fix as written would therefore probably not work. An empty-string side, which readBlob already supports, would.

5. Router. openRecord rejects. apply (lines 297-301) catches the rejection, logs it once and stores {signature, uri: undefined}. The signature does not change, so the record is never retried.

6. Other paths. Nothing else prevents the failure. The resolver passes the spec unchanged, and no wrapper maps git failures to an empty side. Per D-01, Orca's own editor is not mounted.

7. Recorded evidence. Nothing contradicts the finding. verify-orca-editor-routes.mjs (lines 346-359) tests only the null-oid empty sides (unborn HEAD, null merge base, root commit), combined untracked and both_added. It has no single-diff case for an added, deleted or untracked file. The fixture in verify-orca-workspace-live.mjs (buildFixtureRepo, lines 194-209) creates only modified files: a.txt and s.txt in the working tree and index, b.txt on the branch, conflict.txt in the commit. The 65-VERIFICATION and STATE records mention no such case.

Severity: medium, not high. Diffs of modified files work. Added, deleted and untracked files fail visibly: nothing opens, and the path cannot be retried for the rest of the session.

## 68-WR-04: A crash during a seeded upgrade turns the extension into a permanent "user uninstall"

- **Severity:** warning (not refutation-checked)
- **Verdict:** REPORTED
- **Location:** `theia/extensions/bundled-extensions/src/node/bundled-extensions-seed.ts`

*Section WR-04 of `.planning/workstreams/orca/phases/68-three-os-artifacts-weekly-re-pin-and-upstream-seams/68-REVIEW.md`, verbatim:*

**File:** `theia/extensions/bundled-extensions/src/node/bundled-extensions-seed.ts:58-63,149-161`
**Issue:** `copyInto` runs `fs.rm(deploymentDir/<id>)` and then `fs.rename(tmp, deploymentDir/<id>)`. If the backend dies between the two, the profile is left with no `<id>` folder and the record still at the old version. Possible causes are a quit, a crash, or the sidecar being killed by `TheiaService` during startup. The record is written only after the whole seed returns (`:197`). On the next start, rule 2 (`record[id] !== undefined && !exists(...)`, `:60`) reads that state as the user's uninstall and skips the extension for good.

orcad then reports `ERR_MODULE_NOT_FOUND` for every Claude chat session. The only recovery is the reinstall command, and the user has no reason to know about it because they never removed anything. The window is short, but it is on the first start after every PowerBrowser update that bumps the SDK, which is exactly when the sidecar start is slowest.
**Fix:** Keep the old copy until the new one is in place, so no state ever shows an absent folder:
```ts
const dest = path.join(deploymentDir, id);
const old = await fs.mkdtemp(path.join(deploymentDir, `.${id}-old-`));
await fs.rm(old, { recursive: true, force: true });
if (await exists(fs, dest)) await fs.rename(dest, old);   // atomic: dest -> hidden sibling
await fs.rename(tmp, dest);                                // atomic: new copy in place
await fs.rm(old, { recursive: true, force: true });
```
At the start of `seedBundledExtensions`, restore any `.<id>-old-*` sibling as `<id>` when `<id>` is absent, before the rules run.

## Info

## 63-WR-01: A pane created by `terminal create` leaks when the `terminal list` fallback fails

- **Severity:** warning (not refutation-checked)
- **Verdict:** REPORTED
- **Location:** `theia/extensions/orca-agents/bin/claude-wrapper.mjs`

*Section WR-01 of `.planning/workstreams/orca/phases/63-theia-terminals-and-agent-hooks-for-orca/63-REVIEW.md`, verbatim:*

**File:** `theia/extensions/orca-agents/bin/claude-wrapper.mjs:151-158`, `189-194`
**Issue:** `createPane` calls `terminal create` first, so the pane already exists in orcad. When create omits `paneKey` (its type is `paneKey?: string | null`, `orca/src/shared/runtime-terminal-create-contract.ts:11`) and `show` fails, the `list` call at line 152 is not guarded. A CLI error, timeout or `JSON.parse` failure there throws an error with no `pane` property. The cleanup in `main` (line 192) closes only when `e?.pane?.handle` is set, so this path never runs `terminal close`. The wrapper then runs claude unwrapped, and a "Claude Code" pane running `cat` stays in Orca until orcad stops. Only the `pane identity incomplete` path (line 159) attaches the pane.
**Fix:** Attach the known handle to every error thrown after create succeeds:
```js
if (!pane.paneKey) {
    let listed;
    try { listed = runCli(dataRoot, ['terminal', 'list'], env); }
    catch (e) { throw Object.assign(e ?? refuse('list failed'), { pane }); }
    ...
}
```
Or wrap the whole post-create body in one `try { ... } catch (e) { e.pane ??= pane; throw e; }`.

## 63-WR-02: Synchronous CLI calls can delay claude's start by up to 60 s, and a timed-out create leaves an orphan pane

- **Severity:** warning (not refutation-checked)
- **Verdict:** REPORTED
- **Location:** `theia/extensions/orca-agents/bin/claude-wrapper.mjs`

*Section WR-02 of `.planning/workstreams/orca/phases/63-theia-terminals-and-agent-hooks-for-orca/63-REVIEW.md`, verbatim:*

**File:** `theia/extensions/orca-agents/bin/claude-wrapper.mjs:46`, `118-121`, `133-158`, `190`
**Issue:** `runCli` uses `execFileSync` with a 20 s timeout, and `createPane` can make three calls in sequence (create, show, list) before `spawn(claude, ...)` runs at line 203. If orcad is wedged (the socket accepts but does not reply), or busy after a restart, claude's start is held for 20 s on a create timeout and up to 60 s when create succeeds and both lookups stall. The Claude Code extension waits for claude's protocol stream during that time, and its own startup handling can report the session as failed. A timed-out `terminal create` may also have created the pane on the server, but the wrapper has no handle for it, so that pane is never closed. Stopping on timeout is correct, but the budget is far above the cost of a local socket RPC.
**Fix:** Use a short total budget, for example 3 s for create and 2 s for each lookup, tracked as one deadline. After a create timeout, run a `terminal list` filtered by `title === PANE_TITLE` and the worktree, and close any pane created within that window. Alternatively, start claude first and attach the pane asynchronously, which would require the ORCA_* names to be known before spawn and so the current ordering.

## 63-WR-03: The wrapper chain is POSIX-only in three places, and only one of them is tracked

- **Severity:** warning (not refutation-checked)
- **Verdict:** REPORTED
- **Location:** `theia/extensions/orca-agents/src/node/claude-wrapper-launcher.ts`

*Section WR-03 of `.planning/workstreams/orca/phases/63-theia-terminals-and-agent-hooks-for-orca/63-REVIEW.md`, verbatim:*

**File:** `theia/extensions/orca-agents/src/node/claude-wrapper-launcher.ts:21`; `theia/extensions/orca-agents/bin/claude-wrapper.mjs:90`, `102`, `119`; `theia/extensions/orca-agents/src/node/orca-agents-backend-module.ts:40`
**Issue:** The backend comment at line 40 handles win32 explicitly (P63-30), and TheiaService passes a `LOCALAPPDATA` bridge folder on Windows (`OrcaEnv.bridgeDirFor`, win32 branch). On Windows that leads to three failures. (1) The launcher is a `#!/bin/sh` script with no extension, so the extension cannot run it, and every Claude Code session fails to start rather than falling back. WINDOWS.md 53 tracks this one. (2) The wrapper requires `cli/bin/orca` (line 90) and executes it (line 119), but orcad writes `cli/bin/orca.exe` on win32 (`orca/src/main/orcad/orcad-cli-launcher.ts`, `prepareWindowsLauncher`). (3) The hook endpoint is hard-coded to `endpoint.env` (line 102), but Orca publishes `endpoint.cmd` on win32 (`orca/src/shared/agent-hook-listener/endpoint-publication.ts:9`). D-40 defers Windows, so this is not a blocker. However, (1) makes the default actively harmful rather than inert on Windows, and (2) and (3) are not recorded anywhere, so a fix for WINDOWS 53 alone would still leave EXT-02 broken.
**Fix:** Until a Windows twin exists, have the backend stay inert on win32 (`if (!POSIX) { console.info(...); return; }` before `writeLauncher`), so no broken default is registered. Extend WINDOWS 53, or add entries, for the `orca.exe` CLI path and the `endpoint.cmd` endpoint name, and make the wrapper choose both by `process.platform`.

## Info

## 65-WR-02: The router's first snapshot races the root sync, and a refused diff is never retried

- **Severity:** warning (not refutation-checked)
- **Verdict:** REPORTED
- **Location:** `theia/extensions/orca-workspace/src/browser/orca-editor-routes.ts`

*Section WR-02 of `.planning/workstreams/orca/phases/65-orca-workspace-in-theia/65-REVIEW.md`, verbatim:*

**File:** `theia/extensions/orca-workspace/src/browser/orca-editor-routes.ts:257-266`, `:297-301`; `theia/extensions/orca-workspace/src/browser/orca-git-resource.ts:55-59`; `theia/extensions/orca-workspace/src/browser/orca-root-sync.ts:131-133`, `:151-156`

**Issue:** `OrcaEditorRouter` subscribes as soon as `bundle.ready()` and `sessionRestored` resolve, and it opens every record of the first snapshot at once. The `pb-orca-git:` resolver trusts the persisted owned roots plus `OrcaRootSync.liveRootPaths()`. That second list is `previousWanted`, which is set only after the 750 ms settle timer and a completed `sync()`. So at the router's first snapshot, every diff or merge record whose worktree is not already in `powerbrowser.orca.ownedRoots` is refused (`'pb-orca-git URI outside the Orca worktree roots'`). That covers every worktree on a first launch with an empty owned set, and any worktree that was already a user root and so is never PB-owned. `apply` then stores `{ signature, uri: undefined }`. Because the signature does not change when the roots arrive, those Orca tabs never open in Theia for the rest of the session.

**Fix:** Either make the router wait for the root sync's first applied snapshot (expose a `firstSync` promise from `OrcaRootSync` and await it beside `sessionRestored`), or make the resolver trust the live snapshot's local roots as soon as the store reports them (not only after `sync()`). Also, do not cache a failed open under its signature: keep failed record ids in a retry set and retry them on the next root change.

## 65-WR-05: The diff tab title shows Orca's internal diff-source identifiers

- **Severity:** warning (not refutation-checked)
- **Verdict:** REPORTED
- **Location:** `theia/extensions/orca-workspace/src/browser/orca-editor-routes.ts`

*Section WR-05 of `.planning/workstreams/orca/phases/65-orca-workspace-in-theia/65-REVIEW.md`, verbatim:*

**File:** `theia/extensions/orca-workspace/src/browser/orca-editor-routes.ts:190`

**Issue:** The diff label is `` `${rel.split('/').pop()} (${source})` ``, so tabs read `app.ts (combined-uncommitted)`, `app.ts (combined-all)` or `app.ts (unstaged)`. `DiffUris.encode` stores the label as the URI path, and Theia's diff label provider shows it as the tab title (`@theia/core/lib/browser/diff-uris.js:33,60-62`). CLAUDE.md "User-facing copy": "no internal identifier may appear in user-facing text". The label is also part of the `diff:` URI that Setups persist (`setups-service.ts:947-951`), so the identifier spreads into saved state.

**Fix:** Map each rule to plain words, preferably Orca's own translated strings where it has them, for example `{ unstaged: 'Working Tree', staged: 'Index', branch: 'Branch', commit: 'Commit' }`. Do not print the combined source name; the label then names the entry's own rule. Keep the mapping in `ORCA_EDITOR_ROUTES`' module, so `verify-orca-editor-routes` can assert every key has a label.

## Info

## 65-WR-03: Hydration is guessed with a 750 ms timer; a slow repo's roots are removed and their restored editors closed

- **Severity:** warning (not refutation-checked)
- **Verdict:** REPORTED
- **Location:** `theia/extensions/orca-workspace/src/browser/orca-root-sync.ts`

*Section WR-03 of `.planning/workstreams/orca/phases/65-orca-workspace-in-theia/65-REVIEW.md`, verbatim:*

**File:** `theia/extensions/orca-workspace/src/browser/orca-root-sync.ts:38-42`, `:178-210`; `theia/extensions/orca-workspace/src/browser/orca-editor-routes.ts:366-392`

**Issue:** Orca fills `worktreesByRepo` one repo at a time: `fetchAllWorktrees` merges each repo's result separately through a pool (`orca/src/renderer/src/store/slices/worktrees/listing/fetch-all-worktrees.ts:37-75`). At relaunch, `previousWanted` is all the persisted owned roots still in the workspace (line 190). If two repo merges are more than `SETTLE_MS` apart, the first `sync()` sees a partial wanted set and does the following:

1. It treats the other repos' worktrees as dropped and removes those roots (line 200).
2. It calls `router.closeCleanUnder`, which disposes every clean editor that Theia's layout restore reopened under them (line 205-207).
3. It re-adds the roots on the next snapshot, but the closed editors stay closed. `OrcaEditorRouter.known` still holds their records with an unchanged signature, so even Orca-backed ones are not reopened.

The code comment records the timer as a shortcut. The store has a real signal: `hasHydratedWorktreePurge`, which `fetch-all-worktrees.ts:35` reads.

**Fix:** Expose a hydration flag from the bundle (for example `hydrated: state.hasHydratedWorktreePurge` in the B-3 projection). Apply drops only once it is true. Before then, apply only additions. When `closeCleanUnder` disposes a widget, also clear the matching `known` entries, so a returning worktree's records reopen.

## agents-extensions-01: Wrapper leaks an Orca pane when the pane-key lookup fails after the pane was created, or when a signal arrives during the synchronous CLI phase

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `theia/extensions/orca-agents/bin/claude-wrapper.mjs:152`

**What is wrong.** createPane creates the terminal first, then may call `terminal show` (errors swallowed) and `terminal list`. The `list` call is not inside a try block, so a timeout, non-zero exit or non-JSON output throws a raw execFileSync/JSON error that has no `.pane` property. main() closes a half-created pane only when `e?.pane?.handle` is set (line 192), so in this path the pane is never closed. The same happens when `terminal create` times out after orcad has already created the terminal, or when its output does not parse. Separately, the SIGINT/SIGTERM/SIGHUP handlers are installed only after spawn (line 205). A SIGTERM during the up-to-60 s synchronous CLI phase therefore kills the wrapper with the default action, and a pane that was already created is left behind. Each leaked pane is a 'Claude Code' Orca terminal tab running `cat` with no agent in it, and it stays until orcad restarts.

**Scenario.** orcad is under load. `terminal create` returns a handle but no paneKey, `terminal show` fails, and `terminal list` exceeds the 20 s timeout. The ETIMEDOUT error reaches main() without `.pane`. The wrapper logs 'terminal create failed' and runs claude unwrapped. The created pane is never closed, and the user sees an orphan 'Claude Code' tab in Orca. A user who cancels the extension session during that window (SIGTERM to the wrapper) gets the same orphan pane.

**Preconditions.** orcad slow or failing between create and list, or the extension terminating a session during wrapper start-up.

**Evidence.** claude-wrapper.mjs:151-152 `if (!pane.paneKey) { const listed = runCli(dataRoot, ['terminal', 'list'], env);` (no try, no pane attached to the thrown error); :190-193 `try { pane = createPane(...) } catch (e) { if (e?.pane?.handle) closePane(dataRoot, e.pane, cli, bridgeDir); throw e; }`; :205 `for (const sig of FORWARDED_SIGNALS) process.on(sig, forward);` runs only after the synchronous createPane.

**Suggested fix.** Inside createPane, wrap everything after a handle is known in try/catch and rethrow with `{ pane: { handle } }` attached, so main() always closes it. Install the signal handlers before the CLI phase: on a signal before spawn, close the pane if one exists and exit 128+n.

**Verifier (CONFIRMED, low).** claude-wrapper.mjs:151-152 calls runCli for 'terminal list' outside any try. runCli (118-124) uses execFileSync and JSON.parse, so a timeout (ETIMEDOUT), a non-zero exit, or output that is not JSON throws a raw error with no .pane property. The local 'pane' object holding the handle is lost. main() at 191-192 closes a pane only when e?.pane?.handle is set, so in this path the pane is never closed. Only the wrapper's own refuse() errors carry pane (lines 136 and 159). The 'create timed out after orcad already made the terminal' variant follows the same path, since execFileSync kills only the CLI client and has no handle to give back. That orcad finishes the create after the client is killed is runtime behaviour, but the list-failure path alone is enough to confirm the finding. The signal case is also correct: process.on(sig, forward) is installed only at line 205, after the synchronous createPane. A SIGTERM during the CLI phase takes the default action, kills the wrapper, and leaves a created pane in place. Installing the handlers earlier would not help either, because JS handlers cannot run while execFileSync blocks the loop. No guard elsewhere closes the pane. The impact is an orphan 'Claude Code' tab running cat: a user-visible correctness issue with no security effect. *Checked at:* theia/extensions/orca-agents/bin/claude-wrapper.mjs:151-158 (list call has no try and attaches no pane), :191-193 (close only when e.pane.handle exists), :205 (signal handlers installed after createPane)

## agents-extensions-02: Claude start-up blocks on up to three synchronous 20 s Orca CLI calls before claude is spawned

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `theia/extensions/orca-agents/bin/claude-wrapper.mjs:119`

**What is wrong.** runCli uses execFileSync with CLI_TIMEOUT_MS = 20000. createPane can make three sequential calls (create, show, list) before claude is spawned, so a wedged but reachable orcad delays every Claude Code session by up to 60 s. During that time the event loop is blocked and nothing is forwarded. The orcad-data-root file is removed only when OrcaService stops orcad cleanly, so after a crash or hang the wrapper still trusts the stale file and pays the full timeouts on every session.

**Scenario.** orcad hangs: its process is alive and the socket accepts connections, but nothing answers. Every Claude Code chat the user opens waits about 40-60 s before claude starts, then runs unwrapped. The extension may report its own start-up timeout first.

**Preconditions.** orcad alive but unresponsive while orcad-data-root still exists.

**Evidence.** claude-wrapper.mjs:46 `const CLI_TIMEOUT_MS = 20000;` :119-121 `execFileSync(join(dataRoot, 'cli', 'bin', 'orca'), [...args, '--json'], { env, stdio: [...], timeout, encoding: 'utf8' })`; :134, :146, :152 three sequential calls.

**Suggested fix.** Use one overall deadline for the pane phase (for example 3-5 s in total) instead of 20 s per call, or spawn claude at once and attach the pane identity only when it is ready within a short budget.

**Verifier (CONFIRMED, low).** CLI_TIMEOUT_MS = 20000 (line 46), and runCli uses execFileSync (119-121). createPane can make three calls in sequence (134 create, 146 show, 152 list), all before spawn at 203, so the event loop is blocked for up to 60 s. Upstream's CLI client defaults to a 60 s request timeout (orca/src/cli/runtime/client.ts:80), so the wrapper's 20 s limit is the one that applies. orcad-data-root is removed only in OrcaService._stopTree (OrcaService.sys.mjs:630-633); the unexpected-exit/restart path (line 588) does not remove it. Two corrections to the claim: (a) the full 60 s needs create to succeed without a paneKey and then show and list to hang. A fully hung orcad times out at create, which costs about 20 s per session. (b) After a crash where the socket is gone, the CLI most likely fails fast with a connection error rather than paying the timeouts. The hang case stands as described. This is a latency correctness issue only. *Checked at:* claude-wrapper.mjs:46, :118-124, :134/:146/:152; OrcaService.sys.mjs:588 (restart does not remove the file) vs :630-633 (only clean stop removes it); orca/src/cli/runtime/client.ts:80 (CLI default 60 s)

## agents-extensions-03: On Windows the backend still registers a POSIX sh launcher as the Claude Code process wrapper default

- **Severity:** low
- **Verdict:** PLAUSIBLE
- **Location:** `theia/extensions/orca-agents/src/node/orca-agents-backend-module.ts:48`
- **Owner decision cited:** D-40

**What is wrong.** TheiaService passes POWERBROWSER_ORCA_BRIDGE_DIR on win32 (bridgeDirFor returns a LOCALAPPDATA path), and onStart skips the POSIX mode checks there. It then writes the `#!/bin/sh` launcher with no extension and the frontend registers that path as the claudeCode.claudeProcessWrapper default. Windows cannot execute an extensionless sh script, so if the extension honours the default, Claude Code fails to start rather than running unwrapped. The wrapper is also inert on Windows even if it were reached, because readDataRoot requires `cli/bin/orca` while orcad writes `cli/bin/orca.exe` on win32. WINDOWS entry 53 tracks the missing Windows launcher, but the backend is not made inert on win32 meanwhile.

**Scenario.** A Windows build of PowerBrowser (deferred, but the code path exists) starts with a bridge folder. The frontend sets claudeCode.claudeProcessWrapper to %LOCALAPPDATA%\pb-orca-<hex>-bridge\claude-wrapper. Every Claude Code session then fails at spawn.

**Preconditions.** A Windows build; the Claude Code extension honours the default-scope override (research assumption A5).

**Evidence.** claude-wrapper-launcher.ts:21 `return `#!/bin/sh\nexec ${shQuote(nodePath)} ...`;` orca-agents-backend-module.ts:40-48 (win32 skips the mode check and still calls writeLauncher); orca-agents-frontend-module.ts:33 registerOverride with that path; claude-wrapper.mjs:90 `existsSync(join(dataRoot, 'cli', 'bin', 'orca'))` against upstream orcad-cli-launcher.ts:72 `join(binDir, 'orca.exe')`.

**Suggested fix.** Return undefined from getClaudeWrapperPath on win32 until a Windows launcher exists (for example an .exe shim), so the extension's own spawn stays untouched there.

**Verifier (PLAUSIBLE, low).** The code path exists as described. TheiaService._orcaBridgeDir (TheiaService.sys.mjs:792) calls OrcaEnv.bridgeDirFor with the node platform, which returns a LOCALAPPDATA path on win32 (OrcaEnv.sys.mjs:297-303), and passes it as POWERBROWSER_ORCA_BRIDGE_DIR (line 911). The backend onStart skips the uid/mode check only when POSIX (orca-agents-backend-module.ts:41) and still calls writeLauncher (48). writeLauncher always writes '#!/bin/sh' text with no extension (claude-wrapper-launcher.ts:21, 26). The frontend registers that path as the claudeCode.claudeProcessWrapper default (orca-agents-frontend-module.ts:33). readDataRoot requires cli/bin/orca (claude-wrapper.mjs:90), while upstream writes orca.exe on Windows (orcad-cli-launcher.ts:72), so the wrapper would be inert even if reached. The step that cannot be settled statically is whether the Claude Code extension honours the default-scope override (research assumption A5) and how its spawn on Windows treats an extensionless sh file: a hard spawn failure or something else. WINDOWS.md entry 53 is open for the missing Windows launcher, and D-40 ships v1.7 Linux-only, so no shipped build reaches this path. That owner deferral does not refute the observation that the backend is not made inert on win32. *Checked at:* orca-agents-backend-module.ts:40-48; claude-wrapper-launcher.ts:21; orca-agents-frontend-module.ts:33; TheiaService.sys.mjs:792,911; .planning/WINDOWS.md:70 (entry 53 open, D-40 Linux only)

## sidecar-gate-backends-02: pb-orca-git git reads do not disable lazy fetch or prompts, and a timeout kills only git and leaves its fetch children running

- **Severity:** low
- **Verdict:** PLAUSIBLE
- **Location:** `theia/extensions/orca-workspace/src/node/orca-workspace-backend-module.ts:27`

**What is wrong.** runGit removes GIT_* from the environment and passes only `-c core.fsmonitor=false`. It does not set GIT_NO_LAZY_FETCH=1, GIT_TERMINAL_PROMPT=0 or protocol.allow restrictions, and it does not drop SSH_ASKPASS. In a partial-clone (promisor) worktree, `git cat-file blob -- <oid>:<path>` for a missing tree or blob starts a lazy `git fetch` against the repository's configured remote. That fetch uses repository-level `core.sshCommand`, `remote.<n>.uploadpack` (which runs locally for a file/local remote), credential helpers and askpass. execFile's 10 s timeout sends SIGTERM to the git process only, so the spawned fetch, ssh or remote-helper children keep running. The header comment says the read has 'no textconv or filter, fsmonitor off' and every GIT_* name removed, but lazy fetch is not covered.

**Scenario.** The user adds an extracted project archive that contains a .git directory as an Orca folder workspace (same owner, so safe.directory passes). Its .git/config sets `extensions.partialClone=origin`, `remote.origin.promisor=true`, `remote.origin.url=/tmp/x` and `remote.origin.uploadpack=sh -c 'payload' #`. Orca shows a commit diff, and PowerBrowser's router opens it as a Theia diff. readBlob runs cat-file, the missing object starts a fetch, and the uploadpack command runs. In an ordinary blob:none clone, opening a historical diff instead makes a network fetch that can show a KDE askpass dialog and leaves orphaned fetch processes after the timeout.

**Preconditions.** A repository whose .git/config the attacker controls (archive or shared directory, not an ordinary clone), or a partial clone for the network and leak variant. Orca's own git status and diff calls on the same repository do not disable fsmonitor either, so PowerBrowser adds little new exposure for a hostile config.

**Evidence.** orca-workspace-backend-module.ts:27-33 `execFile('git', args, { env: withoutGitVars(process.env), encoding: 'buffer', maxBuffer: ORCA_GIT_MAX_BYTES, timeout: ORCA_GIT_TIMEOUT_MS, windowsHide: true }` ; orca-git-protocol.ts:46 `return ['-c', 'core.fsmonitor=false', '-C', root, 'cat-file', 'blob', '--', `${rev}:${relativePath}`];` Source: OrcaEditorRouter.uriOfRoute -> OrcaGitResourceResolver.resolve -> OrcaGitService.readBlob -> runGit.

**Suggested fix.** Set GIT_NO_LAZY_FETCH=1, GIT_TERMINAL_PROMPT=0 and GIT_ASKPASS/SSH_ASKPASS to empty or `true` in the child env. Add `-c protocol.allow=never` (as Orca's own plugin-git-arguments.ts does). Spawn git detached in its own process group and kill the group on timeout.

**Verifier (PLAUSIBLE, low).** The code is as described. runGit (orca-workspace-backend-module.ts:25-42) removes GIT_* through withoutGitVars (orca-git-protocol.ts:50-52). It adds only -c core.fsmonitor=false (orca-git-protocol.ts:46). It does not set GIT_NO_LAZY_FETCH or GIT_TERMINAL_PROMPT, which the GIT_* filter would strip anyway, and it keeps SSH_ASKPASS. The 10 s execFile timeout signals only the direct git child. Inputs come from Orca records through OrcaEditorRouter and OrcaGitResourceResolver. Git triggers a promisor lazy fetch for a missing blob in a partial clone, and protocol.file.allow=user permits it because GIT_PROTOCOL_FROM_USER is unset. The hostile-config RCE variant needs an attacker-controlled .git/config in a user-owned repository, and Orca's own git status/diff calls in that worktree already run any hostile core.fsmonitor, so it is close to equivalent to holding the capability. The finding concedes this. The remaining effect is real but minor: an unwanted network fetch, an askpass dialog, and possibly orphaned processes. One runtime step cannot be settled statically: whether git's lazy-fetch child (promisor-remote fetch_objects, spawned without clean_on_exit as I read it) survives SIGTERM to the parent cat-file. That step decides the orphan claim. *Checked at:* Unsettled step: whether the lazy-fetch child survives SIGTERM to the parent cat-file. Code: orca-workspace-backend-module.ts:27-33 and orca-git-protocol.ts:46,50-52. Partial mitigation of the RCE variant: Orca itself runs git in the same worktree without disabling fsmonitor, so a hostile config already executes there.

## sidecar-gate-backends-03: A planted POWERBROWSER_TOKEN cookie with a longer path shadows the real token, and the gate reads only the first match

- **Severity:** low
- **Verdict:** PLAUSIBLE
- **Location:** `theia/extensions/token-gate/src/node/token-gate-backend-contribution.ts:214`

**What is wrong.** Cookies are not port-isolated. Any script on any http://127.0.0.1:<port> origin, including orcad's own web client (which v1.7 loads in stock windows and web tabs), can set a non-HttpOnly cookie named POWERBROWSER_TOKEN with a more specific path such as /socket.io/ or /orca-panes/. HttpOnly on the real cookie prevents overwriting it but not adding a distinct-path cookie. Browsers list longer-path cookies first. getTokenFromCookie returns the first POWERBROWSER_TOKEN entry, so the gate checks the planted value and returns 403 for every request under that path. The chrome's strip observer removes POWERBROWSER_TOKEN entries only on requests it does not allow; it leaves sidecar-origin requests unchanged. The impact is availability only: a valid token cannot be fixed or learned this way.

**Scenario.** Script on a page at 127.0.0.1:26768 (orcad's client, through an Orca XSS) or on another local server the user visits runs `document.cookie = 'POWERBROWSER_TOKEN=x; path=/socket.io/'`. The next Theia WebSocket handshake carries `POWERBROWSER_TOKEN=x; POWERBROWSER_TOKEN=<real>`. allowWsUpgrade reads `x` and refuses, the Theia frontend cannot connect, and this lasts until the cookie is cleared.

**Preconditions.** Script execution on some http://127.0.0.1:<port> origin in the user's profile (orcad's page, or any local server the user browses to in a stock window).

**Evidence.** token-gate-backend-contribution.ts:214-221 `for (const part of header.split(';')) { ... if (name === POWERBROWSER_TOKEN_COOKIE_NAME) { return part.slice(eq + 1).trim(); } }` ; PowerBrowserAPI.sys.mjs:6359 `if (channel.URI.host !== "127.0.0.1" || tokenCookieAllowed(channel)) { return; }` (allowed requests are passed through unchanged).

**Suggested fix.** Accept the request if any POWERBROWSER_TOKEN value in the header validates, comparing each value in constant time. Alternatively, in the http-on-modify-request observer, rewrite the Cookie header on allowed sidecar requests to carry only the chrome-set token.

**Verifier (PLAUSIBLE, low).** The real cookie is set non-Secure, HttpOnly, host 127.0.0.1, path / (TheiaService.sys.mjs:1092-1097 → PowerBrowserAPI.sys.mjs:555-568). Because it is not Secure, the 'leave secure cookies alone' rule does not stop a shadowing cookie. Gecko's HttpOnly overwrite refusal applies only to an exact name/host/path match, so a script-set POWERBROWSER_TOKEN with path=/socket.io/ is a distinct cookie. Cookies are not port-scoped, so any 127.0.0.1:<port> page in the same jar can plant it. Gecko orders longer paths first. getTokenFromCookie (token-gate-backend-contribution.ts:214-223) returns the first match, and allowWsUpgrade (198-207) and gate (163-171) then refuse with 403. The strip observer (PowerBrowserAPI.sys.mjs:6359) returns early for allowed sidecar requests and leaves both entries in place. The impact is availability only. One step depends on Gecko runtime cookie-store behaviour that I cannot settle statically: whether the script-set non-HttpOnly cookie with a longer path is accepted alongside the HttpOnly one and sent first. Precondition: script on some loopback origin (an Orca XSS or a local server the user browses). *Checked at:* Unsettled step: Gecko's acceptance and ordering of a same-name, longer-path, non-HttpOnly cookie next to the HttpOnly path=/ cookie. First-match read: token-gate-backend-contribution.ts:214-223. Real cookie attributes: PowerBrowserAPI.sys.mjs:555-568 (aIsSecure false), TheiaService.sys.mjs:1092-1097 (path '/').

