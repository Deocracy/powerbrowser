---
phase: 62-overlay-gate-and-powerbrowser-run-orcad
reviewed: 2026-11-20T00:00:00Z
depth: deep
files_reviewed: 8
files_reviewed_list:
  - orca-overlay/patches/010-installed-electron-switch.patch
  - orca-overlay/seams.json
  - powerbrowser/endpoint-allowlist.json
  - powerbrowser/shell/OrcaEnv.sys.mjs
  - powerbrowser/shell/OrcaService.sys.mjs
  - powerbrowser/shell/jar.mn
  - powerbrowser/shell/powerbrowser-sidecar.js
  - powerbrowser/shell/powerbrowser.js
findings:
  critical: 0
  warning: 6
  info: 3
  total: 9
  necessity: 0
status: issues_found
---

# Phase 62: Code Review Report

**Reviewed:** 2026-11-20
**Depth:** deep
**Files Reviewed:** 8
**Status:** issues_found

## Summary

All eight files were reviewed in their state at HEAD (e0c19c54), including the Phase 63, 64, 67 and 68 changes made to OrcaService and OrcaEnv. The cross-file trace covered OrcaService's calls into PowerBrowserAPI (`spawnProcessExact`, `listProcessTree`, `addNamedReapBlocker`, `signalBarePid`, `readProcessStartTicks`, `writePrivateFile`, `PowerBrowserOrcaHosting`), the bootstrap ordering in powerbrowser.js against `TheiaService.start`/`_restart`, the Orca shell kinds in `handleOrcaShellMessage`, and the pinned upstream Orca and Gecko sources: the orcad lock schema, the browser provider, the RPC socket paths, Subprocess shutdown and AsyncShutdown late registration.

The overlay seam (patch 010, seams.json blob `90b79e50…`) matches the pinned file. The browser provider's other launch route, `ORCA_BROWSER_EXECUTABLE`, cannot reach orcad because that name is not in `ORCAD_ENV_ALLOWLIST`. The ready-line parse, the redaction and the lock field names (`pid`, `linuxStartTicks`) agree with upstream. The remaining defects are in process lifecycle edges, where the design goal "agents end when PowerBrowser quits" (D-07, RUN-05) does not hold:

- Failed start attempts do not end orcad's terminal daemon.
- A start that begins after quit has no stop path.
- Writes after the ready line ignore a stop that is already running.
- The failure page's Restart kills the daemon that a crash respawn kept on purpose.
- Bridge hand-off files outlive an orcad exit.
- Off Linux, the short-path alias step stops Orca from starting.

Not raised, because a decision ratifies them:
- Refusing on `ORCA_HEADLESS_SECRET_STORE=plaintext` even though the name never reaches orcad (P67-17, written with that knowledge).
- Starting Orca after Theia's start settles whatever its outcome (P62-02 as implemented, P62-13).
- The SIGTERM-ends-browser leak (WINDOWS.md entry 65, re-dated).
- Off-Linux daemon reaping (signalBarePid is Linux-only; D-24 and D-40).

## Warnings

### WR-01: Failed start attempts end orcad by its handle only, so its terminal daemon outlives the browser

**File:** `powerbrowser/shell/OrcaService.sys.mjs:473-499` (with `:638-644` and `:359-377`)
**Issue:** On the timeout path (`:473-476`) and the two post-ready refusals (loopback `:492-495`, Node major `:496-499`), `endOwn()` calls `killProcess(proc)`, which signals orcad alone. The exit-without-ready path (`:477-488`) signals nothing. As the file header says (`:14-16`), a signal to orcad alone leaves its terminal daemon and every process under it running. On these paths `_daemonPid` is never set and no state file is written, so nothing reaches that daemon later:
- At quit, `_stopTree` computes `proc = null` (exitCode is set) and `daemonRoot = []`, so `roots` is empty and nothing is listed or killed (`:638-644`).
- The next launch's `_reapLeftover` finds no own record, so `own` is null and `_endDaemon` is skipped (`:369`).
- After the last attempt gives up (`_launch` `:395-397`), the daemon is orphaned for the rest of the session and past quit. orcad itself refuses Node below 24 (`orca/src/main/orcad/orcad-bundled-runtime.ts:64-65`), so the reachable cases are a slow or hung start that hits `startupTimeoutMs` and an orcad that exits after starting its daemon.
**Fix:** Snapshot the tree under the spawned pid before ending it, and end that snapshot the way stop does:
```js
const endOwnTree = async () => {
  const rows = await PowerBrowserProcesses.listProcessTree([proc.pid]);
  await endOwn();
  await this._endDaemon(null, null, rows.filter(row => row.pid !== proc.pid));
};
```
Use `endOwnTree()` on the timeout and post-ready refusal paths. On the exit-without-ready path, also write a minimal state file (orcad pid and ticks) right after spawn, so the next launch's reap has a record.

### WR-02: OrcaService.start() can run after quit is granted and spawn an orcad with no stop path

**File:** `powerbrowser/shell/powerbrowser.js:392`, `powerbrowser/shell/OrcaService.sys.mjs:77-103`
**Issue:** Orca starts in `.finally()` after `TheiaService.start()` settles. When quit is granted during Theia's start, `TheiaService.stop()` sets `_shuttingDown`, `_restart` returns (`TheiaService.sys.mjs:1225-1227`, `:1237-1239`), `start()` resolves, and `OrcaService.start()` runs in the middle of shutdown. `start()` never checks whether the application is quitting:
- `onQuitGranted` (`:88`) registers after `quit-application-granted` has already fired, so it never calls `stop()`.
- `addNamedReapBlocker` (`:96`) throws once the `quit-application` phase has finished (`upstream/toolkit/components/asyncshutdown/AsyncShutdown.sys.mjs:735-739`). That error is caught and logged (`:97-99`).
- `_shuttingDown` stays false, so `_launch` spawns orcad.
- Gecko's Subprocess does not kill children at shutdown (its blocker only closes the worker, `subprocess_unix.worker.js:588-598`), so orcad and its daemon outlive the browser.
**Fix:** Add a boundary method such as `PowerBrowserAPI.isQuitting()` that returns `Services.startup.shuttingDown`. Check it at the top of `start()` and again in `_launch` before every `_spawnAndGate`. Alternatively, have powerbrowser.js skip `OrcaService.start()` when Theia's start ended because of a stop.

### WR-03: Writes after the ready line ignore a stop already in progress, so the pairing and data-root files are left behind

**File:** `powerbrowser/shell/OrcaService.sys.mjs:501-538` (with `:630-636`)
**Issue:** `_spawnAndGate` checks `_shuttingDown` only right after the spawn (`:434`). When `stop()` runs while orcad is starting, `_stopTree` first removes the three bridge files (`:630-636`), then ends orcad. If the ready line resolves during that window, `_spawnAndGate` runs `:501-538` unconditionally. It writes the state file, `orcad-data-root` and `web-pairing` (a reusable credential, P64-07) back into the bridge folder after they were removed, and it sets `_state = "ready"` over the `"stopped"` that `_stopTree` writes. The files then stay on disk after quit. The data-root file names a root no orcad serves, which is the exact case the P63-26 comment at `:520` exists to prevent.
**Fix:** Return early after the ready gate when a stop has begun, and remove the hand-off files again at the end of `_stopTree`:
```js
if (this._shuttingDown) {
  await endOwn();
  return { ok: false, recoverable: false, step: "stopping", rows: [] };
}
```
Put this check after the readiness checks at `:492-499` and again before `_writeHandOff` (`:529`).

### WR-04: "Restart Orca" kills the terminal daemon and agents that the crash respawn kept on purpose

**File:** `powerbrowser/shell/OrcaService.sys.mjs:156-167`, `:113`
**Issue:** After an unexpected orcad exit, `_supervise` deliberately reaps with `includeDaemon: false` (`:590`), so the surviving daemon and its agents are adopted. The comment at `:356-357` says "only a quit ends agents (D-07)". When those respawns give up, the state becomes `failed`. Port-in-use is one such case, and it renders a Restart button (P67-06). `restart()` then runs `_startSequence`, which calls `_reapLeftover({ includeDaemon: true })` (`:113`). Because `_spawnAndGate` rewrote the own state file with the daemon's identity at the last ready line (`:508-515`), `_endDaemon` sends SIGTERM to the daemon and SIGKILL to everything under it. The user's agents end on a Restart, not on a quit. P67-06 ("reaps as the launch path does") is a Claude's-pick plan item, not an owner ruling, and it contradicts the D-07 comment in the same file.
**Fix:** Give `restart()` its own sequence that keeps the daemon: `_resolve()`, `_preflight()`, `_reapLeftover({ includeDaemon: false })`, `_launch()`. If ending agents on Restart is intended, get an owner ruling and correct the comment at `:356-357`.

### WR-05: Bridge hand-off files outlive an unexpected orcad exit

**File:** `powerbrowser/shell/OrcaService.sys.mjs:574-595`
**Issue:** `_supervise` handles an unexpected exit without removing `orcad-data-root`, `web-pairing` or `orca-panes-dir`. When the respawns give up (`_launch` → `_fail`), the bridge folder keeps naming a data root that no orcad serves for the rest of the session. It also keeps a pairing offer for an orcad that is gone (its session-only device row died with it, P65-17). The EXT-02 wrapper and the Theia backend then act on dead hand-offs. This contradicts the P63-26 invariant stated at `:520`.
**Fix:** Move the removal loop from `_stopTree` (`:630-636`) into a `_removeHandOff()` helper. Call it at the top of `_supervise`'s unexpected-exit branch, after the `_shuttingDown`/`_proc` guard, as well as from `_stopTree`.

### WR-06: Off Linux the short-path alias step stops Orca from starting

**File:** `powerbrowser/shell/OrcaService.sys.mjs:185-191`, `:251-278`; `powerbrowser/shell/OrcaEnv.sys.mjs:262-274`, `:37-63`
**Issue:** `socketPathFits` applies the 84-byte budget on every platform, so common profile paths take the alias route:
- **macOS:** a path such as `~/Library/Application Support/PowerBrowser/Profiles/<salt>.default-release/powerbrowser-orca` is about 105 bytes. `_makeAlias` runs `ln -sfnT` (`:266`), and BSD `ln` has no `-T` option, so the start fails with "linking a short path" (could-not-start).
- **Windows:** `aliasPathFor` accepts only a POSIX `XDG_RUNTIME_DIR` or `HOME`, so it returns null, and there is no `ln`. Orca's RPC endpoint there is a named pipe (`orca/src/main/runtime/runtime-rpc/runtime-rpc-socket-metadata.ts:55`), so the alias is not needed at all.
- **Windows environment:** `ORCAD_ENV_ALLOWLIST` also has no Windows names (`SystemRoot`, `USERPROFILE`, `LOCALAPPDATA`, `ComSpec`, `PATHEXT`, `TEMP`), which the 62-RESEARCH assumption assigned to Phase 68. Phase 68 did not add them.

D-40 limits v1.7 shipping to Linux, so this does not block the release. The defect is still unrecorded: no WINDOWS.md row names it, while the Windows and macOS smoke-test rows (entries 49 and 50) assume orcad starts.
**Fix:** On win32, skip the socket-path budget. On darwin, use `ln -sfn` after checking that the alias is not a real directory, or create the link through IOUtils. Add the Windows allowlist names. Record all three in WINDOWS.md against the next version.

## Info

### IN-01: The stopAndReap overrun comment says orcad is killed first, but the row order puts the daemon first

**File:** `powerbrowser/shell/OrcaService.sys.mjs:689-691`
**Issue:** `listProcessTree` pops its roots last-in-first-out (`PowerBrowserAPI.sys.mjs`, the `stack.pop()` walk in `PowerBrowserProcesses.listProcessTree`). With roots `[orcadPid, daemonPid]` (`:643`), the daemon subtree comes first and orcad later. The comment "orcad, the first row, goes first" is false. A still-live orcad can restart its daemon between the two SIGKILLs.
**Fix:** In `_killSnapshot`'s overrun call, sort `_stopRows` so the orcad pid comes first, or kill the roots in order before the descendants.

### IN-02: An OrcaService load failure blocks Theia's start and the diagnostics layer

**File:** `powerbrowser/shell/powerbrowser.js:375`, `:313`
**Issue:** The `OrcaService` import runs before `TheiaService.start` (`:392`), and `getDiagnosticRows()` is called without a guard inside `powerbrowserShowDiagnostics`. If OrcaService.sys.mjs or OrcaEnv.sys.mjs fails to load (a packaging or syntax defect), the bootstrap throws before Theia starts. That contradicts P62-13: an Orca failure never holds Theia back.
**Fix:** Import OrcaService inside try/catch with a null fallback, and spread `OrcaService?.getDiagnosticRows?.() ?? []`.

### IN-03: The files-missing row shows a misleading path when the Orca root pref is empty

**File:** `powerbrowser/shell/OrcaService.sys.mjs:218-228`
**Issue:** A package carries no powerbrowser-sidecar.js, so a package without staged Orca has `orcaRoot = ""`. The diagnostics row then reads "Orca entry file: /out/orcad/orcad.js", a root-relative path that names nothing on disk.
**Fix:** When `orcaRoot` is empty, report a row such as `["Orca root", "not set"]` instead of the joined path.

---

_Reviewed: 2026-11-20_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
