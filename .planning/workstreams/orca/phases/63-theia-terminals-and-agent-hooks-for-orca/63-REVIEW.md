---
phase: 63-theia-terminals-and-agent-hooks-for-orca
reviewed: 2026-11-20T22:40:13Z
depth: deep
files_reviewed: 10
files_reviewed_list:
  - powerbrowser/shell/TheiaService.sys.mjs
  - theia/applications/browser/package.json
  - theia/extensions/orca-agents/bin/claude-wrapper.mjs
  - theia/extensions/orca-agents/package.json
  - theia/extensions/orca-agents/src/browser/orca-agents-frontend-module.ts
  - theia/extensions/orca-agents/src/common/orca-agents-protocol.ts
  - theia/extensions/orca-agents/src/node/claude-wrapper-launcher.ts
  - theia/extensions/orca-agents/src/node/orca-agents-backend-module.ts
  - theia/extensions/orca-agents/tsconfig.json
  - theia/package.json
findings:
  critical: 1
  warning: 3
  info: 6
  total: 10
  necessity: 1
status: issues_found
---

# Phase 63: Code Review Report

**Reviewed:** 2026-11-20T22:40:13Z
**Depth:** deep
**Files Reviewed:** 10
**Status:** issues_found

## Summary

Scope: the new `@powerbrowser/orca-agents` extension (backend launcher writer, frontend default-preference registration, shared protocol, the `bin/claude-wrapper.mjs` process wrapper), its wiring in `theia/package.json` and `theia/applications/browser/package.json`, and the v1.7 changes to `TheiaService.sys.mjs` (bridge folder passed as `POWERBROWSER_ORCA_BRIDGE_DIR`, Windows staged-Node fallback). The review traced the call chains across modules: `TheiaService._orcaBridgeDir` -> `OrcaEnv.bridgeDirFor`, `OrcaService._resolve`/`_launch`/`_stopTree` (the writer and remover of `orcad-data-root`), `PowerBrowserAPI.writePrivateFile`, token-gate's `powerbrowser-env.ts`, the Theia 1.76 `PreferenceSchemaService.registerOverride` and `BackendApplication.start` implementations, the esbuild backend bundle config, `powerbrowser/packaging/package-linux.sh`, and the upstream Orca CLI (`terminal create` result type, `orcad-cli-launcher.ts`, hook endpoint publication).

The chrome-side halves are consistent. OrcaService and TheiaService derive the same bridge folder from the same real data root. `orcad-data-root` carries the effective root, which is the same path orcad's CLI launcher and hook endpoint use. The wrapper's `<dataRoot>/agent-hooks/endpoint.env` matches Orca's POSIX endpoint publication. Behaviours ratified by owner decisions are not counted as defects: the `cat` placeholder pane and the presence-by-parent-process rule (P63-26), the default-scope override (P63-15), the extension-side assumptions A3 and A5 deferred to the end-of-milestone pass, and Linux-only shipping (D-40).

The main problem is packaging. The wrapper script is resolved through `node_modules` at runtime, but no packaging script stages it, so EXT-02 does nothing in every packaged build, and the item that carried this was dropped without a tracking entry. The wrapper itself has a pane leak on one error path and blocks for a long time on synchronous CLI calls.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: The claude wrapper is never staged in packaged builds, so EXT-02 is silently inert in every shipped artifact

**File:** `theia/extensions/orca-agents/src/node/orca-agents-backend-module.ts:44` (with `powerbrowser/packaging/package-linux.sh:104-117`)
**Issue:** The backend finds the wrapper with `require.resolve('@powerbrowser/orca-agents/bin/claude-wrapper.mjs')`. esbuild does not bundle `require.resolve` (the backend bundle config, `theia/applications/browser/gen-esbuild.node.mjs:43` and `esbuild.mjs:28`, externalizes only `electron` and `better-sqlite3`). At runtime the call therefore walks up from `<GreD>/theia/lib/backend/` looking for `node_modules/@powerbrowser/orca-agents`. `package-linux.sh` stages only `lib/`, `package.json`, `plugins/` and `node_modules/better-sqlite3` under `$STAGE/theia`. The Flatpak repacks that tarball, and `release.yml:339-341` and `package-macos.sh` do the same. No staging line names `orca-agents` or `claude-wrapper.mjs` (`git grep claude-wrapper` outside `.planning` finds only verify scripts and the brand inventory). In every packaged build, Linux included, `require.resolve` throws `MODULE_NOT_FOUND`. The catch at line 49 turns that into one console warning, `launcherPath` stays undefined, the frontend registers no `claudeCode.claudeProcessWrapper` default, and no Claude Code session ever gets an Orca pane or hook status. Linux packaging is the v1.7 deliverable (D-40). 63-04-SUMMARY:247 and 68-CONTEXT P68-42 carried "the wrapper path in packaged builds" forward to Phase 68, but Phase 68 never landed it. The only WINDOWS.md entry (53) covers the Windows launcher twin, not this, so the gap is untracked. Both live rows run the dev tree, so neither can detect it.
**Fix:** Stage the wrapper beside the backend and resolve it there, so the packaged and dev trees use one rule:
```sh
# package-linux.sh (and package-macos.sh, release.yml's windows staging)
mkdir -p "$STAGE/theia/node_modules/@powerbrowser/orca-agents/bin"
cp "$ROOT/theia/extensions/orca-agents/bin/claude-wrapper.mjs" "$STAGE/theia/node_modules/@powerbrowser/orca-agents/bin/"
cp "$ROOT/theia/extensions/orca-agents/package.json" "$STAGE/theia/node_modules/@powerbrowser/orca-agents/"
```
Also add a packaged-tree assertion (an `orca-packaged-tree` clause) that the file is present and resolvable from `theia/lib/backend`. Until both exist, record the gap as an open ledger/WINDOWS entry so the milestone does not close with it unmarked.

## Warnings

### WR-01: A pane created by `terminal create` leaks when the `terminal list` fallback fails

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

### WR-02: Synchronous CLI calls can delay claude's start by up to 60 s, and a timed-out create leaves an orphan pane

**File:** `theia/extensions/orca-agents/bin/claude-wrapper.mjs:46`, `118-121`, `133-158`, `190`
**Issue:** `runCli` uses `execFileSync` with a 20 s timeout, and `createPane` can make three calls in sequence (create, show, list) before `spawn(claude, ...)` runs at line 203. If orcad is wedged (the socket accepts but does not reply), or busy after a restart, claude's start is held for 20 s on a create timeout and up to 60 s when create succeeds and both lookups stall. The Claude Code extension waits for claude's protocol stream during that time, and its own startup handling can report the session as failed. A timed-out `terminal create` may also have created the pane on the server, but the wrapper has no handle for it, so that pane is never closed. Stopping on timeout is correct, but the budget is far above the cost of a local socket RPC.
**Fix:** Use a short total budget, for example 3 s for create and 2 s for each lookup, tracked as one deadline. After a create timeout, run a `terminal list` filtered by `title === PANE_TITLE` and the worktree, and close any pane created within that window. Alternatively, start claude first and attach the pane asynchronously, which would require the ORCA_* names to be known before spawn and so the current ordering.

### WR-03: The wrapper chain is POSIX-only in three places, and only one of them is tracked

**File:** `theia/extensions/orca-agents/src/node/claude-wrapper-launcher.ts:21`; `theia/extensions/orca-agents/bin/claude-wrapper.mjs:90`, `102`, `119`; `theia/extensions/orca-agents/src/node/orca-agents-backend-module.ts:40`
**Issue:** The backend comment at line 40 handles win32 explicitly (P63-30), and TheiaService passes a `LOCALAPPDATA` bridge folder on Windows (`OrcaEnv.bridgeDirFor`, win32 branch). On Windows that leads to three failures. (1) The launcher is a `#!/bin/sh` script with no extension, so the extension cannot run it, and every Claude Code session fails to start rather than falling back. WINDOWS.md 53 tracks this one. (2) The wrapper requires `cli/bin/orca` (line 90) and executes it (line 119), but orcad writes `cli/bin/orca.exe` on win32 (`orca/src/main/orcad/orcad-cli-launcher.ts`, `prepareWindowsLauncher`). (3) The hook endpoint is hard-coded to `endpoint.env` (line 102), but Orca publishes `endpoint.cmd` on win32 (`orca/src/shared/agent-hook-listener/endpoint-publication.ts:9`). D-40 defers Windows, so this is not a blocker. However, (1) makes the default actively harmful rather than inert on Windows, and (2) and (3) are not recorded anywhere, so a fix for WINDOWS 53 alone would still leave EXT-02 broken.
**Fix:** Until a Windows twin exists, have the backend stay inert on win32 (`if (!POSIX) { console.info(...); return; }` before `writeLauncher`), so no broken default is registered. Extend WINDOWS 53, or add entries, for the `orca.exe` CLI path and the `endpoint.cmd` endpoint name, and make the wrapper choose both by `process.platform`.

## Info

### IN-01: TheiaService does not refuse an empty profile folder, unlike OrcaService

**File:** `powerbrowser/shell/TheiaService.sys.mjs:791`
**Issue:** `getProfileDir()` returns `""` on failure. `OrcaService._resolve` refuses that case ("never a home-directory fallback", `OrcaService.sys.mjs:171-175`). `_orcaBridgeDir` instead passes it to `dataRootFor("")`, which yields `/powerbrowser-orca`, and then makes the backend create a bridge folder named after that bogus root. No writer ever serves that folder. The effect is harmless but needless.
**Fix:** `const profileDir = PowerBrowserAPI.getProfileDir(); if (!profileDir) { this._pushLog("Orca bridge folder not chosen: no profile folder"); return null; }`.

### IN-02: `claude-wrapper.log` grows without bound

**File:** `theia/extensions/orca-agents/bin/claude-wrapper.mjs:163-166`
**Issue:** The default override applies to every Claude Code session. Each session whose cwd is not an Orca worktree, or that starts while orcad is not ready, appends one line, and nothing rotates or truncates the file. The file lives in `XDG_RUNTIME_DIR` (tmpfs) in the common case, so it costs memory.
**Fix:** Truncate when the file exceeds a small cap (for example 64 KiB) before appending, or keep only the last N lines.

### IN-03: Unused protocol constants duplicate literals the wrapper defines again

**File:** `theia/extensions/orca-agents/src/common/orca-agents-protocol.ts:24-25`; `theia/extensions/orca-agents/bin/claude-wrapper.mjs:41-42`
**Issue:** `CLAUDE_WRAPPER_LOG_FILE` is imported nowhere. `ORCAD_DATA_ROOT_FILE` is read only by `verify-orca-bridge-dir.mjs` as a text literal. The wrapper redeclares both names as its own `DATA_ROOT_FILE` and `LOG_FILE`. The `orca-bridge-dir` check compares the data-root literal, but nothing compares the log name.
**Fix:** Drop `CLAUDE_WRAPPER_LOG_FILE`, or add it to the literal comparison the check already does.

### IN-04: Already-defended-elsewhere — existence checks that the following call already performs

**File:** `theia/extensions/orca-agents/src/node/orca-agents-backend-module.ts:33-35`, `44-47`
**Category:** necessity
**Issue:** `require.resolve` returns only a path to an existing file and otherwise throws `MODULE_NOT_FOUND`, so `fs.existsSync(wrapper)` cannot be false right after it (lines 45-47). `fs.mkdirSync(dir, { recursive: true })` is a no-op on an existing directory, so the `existsSync(dir)` test (line 33) adds nothing. Neither guards a trust boundary. This rests on Node's documented semantics rather than on repository evidence, hence Info.
**Fix:** Remove both `existsSync` guards. The `catch` at line 49 already reports a missing script.

### IN-05: The staged-Node rule is copied between TheiaService and OrcaService rather than shared

**File:** `powerbrowser/shell/TheiaService.sys.mjs:573-578`; `powerbrowser/shell/OrcaService.sys.mjs:203-210`
**Issue:** OrcaService's comment says the two use "the same Node rule ... so the two cannot diverge (D-14)", but the rule (including the new `node.exe` fallback) exists as two hand-kept copies. A future edit to one copy will not reach the other.
**Fix:** Move the rule into a pure `OrcaEnv` helper (or a PowerBrowserAPI method), for example `stagedNodeCandidates(appDir)`, and call it from both.

### IN-06: A synchronous `spawn` throw skips pane cleanup and rejects the top-level await

**File:** `theia/extensions/orca-agents/bin/claude-wrapper.mjs:202-203`, `221`
**Issue:** `spawn` throws synchronously for invalid arguments (for example a NUL byte in an argument). The throw happens inside the Promise executor, so `finish` never runs: the created pane is not closed, and `await main(...)` rejects, so the wrapper exits through an uncaught rejection rather than a chosen code.
**Fix:** Wrap the `spawn` call in `try { ... } catch { logStep(bridgeDir, 'spawn claude failed'); finish(127); return; }`, with `finish` declared before it.

---

_Reviewed: 2026-11-20T22:40:13Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
