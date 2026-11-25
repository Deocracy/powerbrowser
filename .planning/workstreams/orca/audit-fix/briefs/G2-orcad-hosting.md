# Fix brief: G2-orcad-hosting

Lane: product. Items: 13. Files this group owns: `^powerbrowser/shell/` (pattern).

Item IDs: orcad-hosting-01; orcad-hosting-02 = 62-WR-04; 62-WR-01; 62-WR-03; 62-WR-05; 62-WR-06; 62-WR-02; orcad-hosting-05; orcad-hosting-06; orcad-hosting-07; orcad-hosting-08; pairing-credentials-03; orcad-hosting-03.

## orcad-hosting-01: A PowerBrowser crash leaves orcad, its terminal daemon and every skip-permissions agent running with nothing to stop them

- **Severity:** medium
- **Verdict:** CONFIRMED
- **Location:** `powerbrowser/shell/OrcaService.sys.mjs:422`

**What is wrong.** OrcaService has only two ways to end orcad: the quit-granted observer (line 88) and the named AsyncShutdown blocker (line 96). Neither runs when the browser crashes, is OOM-killed or gets SIGKILL. orcad has no parent-death watchdog. 62-RESEARCH item 2 confirms this, and orca-service-live depends on it ('proves orcad survived'). The terminal daemon runs detached in its own systemd user scope (daemon-cgroup-scope.ts), so killing the browser's cgroup does not end it either. The only cleanup is _reapLeftover at the next launch on the same profile. Until then, orcad keeps listening on 127.0.0.1:26768 holding the persisted device rows, and agents launched with D-12's skip-permissions keep executing tool calls (including ones steered by prompt injection) with no visible UI. D-07 says agents end when PowerBrowser quits. A crash is not a quit, so this gap is not covered by any decision.

**Scenario.** An agent is mid-task in an Orca terminal. PowerBrowser segfaults or the kernel OOM-kills it. The user does not relaunch for hours. The agent keeps running shell commands and network calls with skip-permissions, and orcad stays bound on 26768. Nothing in the tree stops either one before the next PowerBrowser start on that profile.

**Preconditions.** PowerBrowser ends without a granted quit (crash, SIGKILL, OOM kill, power-loss-free session kill) while orcad is running.

**Evidence.** OrcaService.sys.mjs:88 `this._quitObserverOff = PowerBrowserAPI.onQuitGranted(() => this.stop());` and :96 `PowerBrowserProcesses.addNamedReapBlocker(OrcaEnv.ORCAD_REAP_BLOCKER_NAME, reapBlocker);` are the only stop paths. :422 `proc = await PowerBrowserProcesses.spawnProcessExact({ command: this._nodePath, args, environment, workdir: this._effectiveRoot });` passes no liveness channel. Upstream orcad/main.ts and orcad-entry.ts contain no stdin-EOF or ppid watch. orcad-daemon-supervision.ts:1 says 'Detached terminal daemons must outlive orcad'. Leftovers are reaped only at the next start: OrcaService.sys.mjs:113 `await this._reapLeftover({ includeDaemon: true });`.

**Suggested fix.** Give orcad a liveness tie to the browser. Two options: a small launcher seam that exits orcad, and has the daemon tree reaped, when its stdin pipe from PowerBrowser reaches EOF (the pattern the Theia backend's parent-death watchdog already uses); or a PB-owned watchdog process that holds the pipe and ends the recorded identities when it closes. Add a live row that SIGKILLs PowerBrowser and requires the agent identities to be gone within a bound, not merely reaped at the next launch.

**Verifier (CONFIRMED, medium).** OrcaService has two stop paths and both run only on a granted quit: onQuitGranted (OrcaService.sys.mjs:88) and the AsyncShutdown appShutdownConfirmed blocker (:96, PowerBrowserAPI.sys.mjs:11052-11057). spawnProcessExact (PowerBrowserAPI.sys.mjs:10995) is a plain Subprocess.call with no IPC channel, so orcad's 'launcher disconnect' shutdown (orcad-lifecycle.ts:89-93) needs bundledLauncherChannel plus process.send and is never armed. orcad ignores SIGHUP (orcad-lifecycle.ts:85). It also ignores EPIPE/EIO from a closed output pipe (orcad-process-error-guards.ts:55-60), so losing the parent's stdout/stderr does not end it either. Idle exit does not apply: orcad-managed-idle-exit.ts:1,22 says user-started servers never idle out and live terminals block idle exit. The daemon is detached by design (orcad-daemon-supervision.ts:1). The only cleanup is _reapLeftover at the next start (:113). D-07 covers quit only, so no decision accepts the crash case. Severity stays medium: it is a gap in process lifetime, and the agents running unattended are the user's own agents with D-12 permissions; an attacker gains no new boundary crossing from it. *Checked at:* No guard. OrcaService.sys.mjs:88,96 are quit-only. orcad-process-error-guards.ts:55-60 ignores EPIPE. orcad-lifecycle.ts:85 ignores SIGHUP. orcad-managed-idle-exit.ts:22 says paired servers never idle out.

## orcad-hosting-02 = 62-WR-04: Restart Orca from the failure page kills the adopted terminal daemon and the agents that survived an orcad crash

- **Severity:** medium
- **Verdict:** CONFIRMED
- **Location:** `powerbrowser/shell/OrcaService.sys.mjs:165`

**What is wrong.** After an unexpected orcad exit, _supervise keeps _daemonPid and reaps with includeDaemon:false, so the daemon and its agent terminals stay alive for the next orcad to adopt (the comment at line 356: 'only a quit ends agents (D-07)'). If every respawn attempt fails, the state becomes failed and the failure page offers Restart. restart() runs _startSequence, which calls _reapLeftover({ includeDaemon: true }). That reads the state file, which still names the adopted daemon, and _endDaemon SIGTERMs and then SIGKILLs the daemon and every descendant. A user who presses Restart to get Orca back loses every running agent session and terminal that the crash path had kept alive on purpose.

**Scenario.** An agent runs a long task. orcad crashes, and during the backoff another process takes port 26768, or orcad crashes again before ready five times, so the state is failed. The user frees the port and clicks Restart Orca. _reapLeftover({includeDaemon:true}) kills the daemon from pb-orca-state.json along with its 'sleep 900' / agent descendants, and the user's in-progress agent work is gone.

**Preconditions.** orcad exits unexpectedly while agents run, every respawn attempt then fails, and the user presses Restart Orca.

**Evidence.** OrcaService.sys.mjs:165 `this._restartRun = this._startSequence().catch(err => this.reportUnexpectedFailure(err));` -> :113 `await this._reapLeftover({ includeDaemon: true });` -> :369-370 `if (own && includeDaemon) { await this._endDaemon(own.daemonPid, own.daemonTicks);`. The crash path is the opposite: :590 `await this._reapLeftover({ includeDaemon: false });`.

**Suggested fix.** Have restart() reap with includeDaemon:false when this._daemonPid still matches its recorded identity (an adopted daemon exists). Reserve the daemon reap for a cold start, where the record comes from a previous browser session.

**Verifier (CONFIRMED, medium).** _supervise (:574-595) leaves _daemonPid in place and reaps with includeDaemon:false (:590). _launch retries also reap with includeDaemon:false (:402). A failed _spawnAndGate never rewrites pb-orca-state.json, because writeStateFile at :508 runs only after a ready line. The state file therefore still names the adopted daemon. When the attempts run out or a port/lock code is non-recoverable (:395-396, :480-485), _fail sets the state to failed. restart() (:156-166) is allowed in that state and runs _startSequence, which calls _reapLeftover({includeDaemon:true}) (:113). That reaches _endDaemon(own.daemonPid, own.daemonTicks) (:369-370), which takes a snapshot of listProcessTree([pid]) (:335), SIGTERMs, and SIGKILLs every remaining row (:349). The ticks match, so the identity check passes. P67-06 says restart 'reaps as the launch path does', but it does not address the adopted daemon, and this contradicts the intent stated at :356-357. *Checked at:* No guard. Path: OrcaService.sys.mjs:165 -> :113 -> :369-370 -> :333-349. The crash path deliberately uses includeDaemon:false at :590 and :402.

---

**Per-phase review report of the same defect (62-WR-04).**

*Section WR-04 of `.planning/workstreams/orca/phases/62-overlay-gate-and-powerbrowser-run-orcad/62-REVIEW.md`, verbatim:*

**File:** `powerbrowser/shell/OrcaService.sys.mjs:156-167`, `:113`
**Issue:** After an unexpected orcad exit, `_supervise` deliberately reaps with `includeDaemon: false` (`:590`), so the surviving daemon and its agents are adopted. The comment at `:356-357` says "only a quit ends agents (D-07)". When those respawns give up, the state becomes `failed`. Port-in-use is one such case, and it renders a Restart button (P67-06). `restart()` then runs `_startSequence`, which calls `_reapLeftover({ includeDaemon: true })` (`:113`). Because `_spawnAndGate` rewrote the own state file with the daemon's identity at the last ready line (`:508-515`), `_endDaemon` sends SIGTERM to the daemon and SIGKILL to everything under it. The user's agents end on a Restart, not on a quit. P67-06 ("reaps as the launch path does") is a Claude's-pick plan item, not an owner ruling, and it contradicts the D-07 comment in the same file.
**Fix:** Give `restart()` its own sequence that keeps the daemon: `_resolve()`, `_preflight()`, `_reapLeftover({ includeDaemon: false })`, `_launch()`. If ending agents on Restart is intended, get an owner ruling and correct the comment at `:356-357`.

## 62-WR-01: Failed start attempts end orcad by its handle only, so its terminal daemon outlives the browser

- **Severity:** warning (not refutation-checked)
- **Verdict:** REPORTED
- **Location:** `powerbrowser/shell/OrcaService.sys.mjs`

*Section WR-01 of `.planning/workstreams/orca/phases/62-overlay-gate-and-powerbrowser-run-orcad/62-REVIEW.md`, verbatim:*

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

## 62-WR-03: Writes after the ready line ignore a stop already in progress, so the pairing and data-root files are left behind

- **Severity:** warning (not refutation-checked)
- **Verdict:** REPORTED
- **Location:** `powerbrowser/shell/OrcaService.sys.mjs`

*Section WR-03 of `.planning/workstreams/orca/phases/62-overlay-gate-and-powerbrowser-run-orcad/62-REVIEW.md`, verbatim:*

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

## 62-WR-05: Bridge hand-off files outlive an unexpected orcad exit

- **Severity:** warning (not refutation-checked)
- **Verdict:** REPORTED
- **Location:** `powerbrowser/shell/OrcaService.sys.mjs`

*Section WR-05 of `.planning/workstreams/orca/phases/62-overlay-gate-and-powerbrowser-run-orcad/62-REVIEW.md`, verbatim:*

**File:** `powerbrowser/shell/OrcaService.sys.mjs:574-595`
**Issue:** `_supervise` handles an unexpected exit without removing `orcad-data-root`, `web-pairing` or `orca-panes-dir`. When the respawns give up (`_launch` → `_fail`), the bridge folder keeps naming a data root that no orcad serves for the rest of the session. It also keeps a pairing offer for an orcad that is gone (its session-only device row died with it, P65-17). The EXT-02 wrapper and the Theia backend then act on dead hand-offs. This contradicts the P63-26 invariant stated at `:520`.
**Fix:** Move the removal loop from `_stopTree` (`:630-636`) into a `_removeHandOff()` helper. Call it at the top of `_supervise`'s unexpected-exit branch, after the `_shuttingDown`/`_proc` guard, as well as from `_stopTree`.

## 62-WR-06: Off Linux the short-path alias step stops Orca from starting

- **Severity:** warning (not refutation-checked)
- **Verdict:** REPORTED
- **Location:** `powerbrowser/shell/OrcaService.sys.mjs`

*Section WR-06 of `.planning/workstreams/orca/phases/62-overlay-gate-and-powerbrowser-run-orcad/62-REVIEW.md`, verbatim:*

**File:** `powerbrowser/shell/OrcaService.sys.mjs:185-191`, `:251-278`; `powerbrowser/shell/OrcaEnv.sys.mjs:262-274`, `:37-63`
**Issue:** `socketPathFits` applies the 84-byte budget on every platform, so common profile paths take the alias route:
- **macOS:** a path such as `~/Library/Application Support/PowerBrowser/Profiles/<salt>.default-release/powerbrowser-orca` is about 105 bytes. `_makeAlias` runs `ln -sfnT` (`:266`), and BSD `ln` has no `-T` option, so the start fails with "linking a short path" (could-not-start).
- **Windows:** `aliasPathFor` accepts only a POSIX `XDG_RUNTIME_DIR` or `HOME`, so it returns null, and there is no `ln`. Orca's RPC endpoint there is a named pipe (`orca/src/main/runtime/runtime-rpc/runtime-rpc-socket-metadata.ts:55`), so the alias is not needed at all.
- **Windows environment:** `ORCAD_ENV_ALLOWLIST` also has no Windows names (`SystemRoot`, `USERPROFILE`, `LOCALAPPDATA`, `ComSpec`, `PATHEXT`, `TEMP`), which the 62-RESEARCH assumption assigned to Phase 68. Phase 68 did not add them.

D-40 limits v1.7 shipping to Linux, so this does not block the release. The defect is still unrecorded: no WINDOWS.md row names it, while the Windows and macOS smoke-test rows (entries 49 and 50) assume orcad starts.
**Fix:** On win32, skip the socket-path budget. On darwin, use `ln -sfn` after checking that the alias is not a real directory, or create the link through IOUtils. Add the Windows allowlist names. Record all three in WINDOWS.md against the next version.

## Info

## 62-WR-02: OrcaService.start() can run after quit is granted and spawn an orcad with no stop path

- **Severity:** warning (not refutation-checked)
- **Verdict:** REPORTED
- **Location:** `powerbrowser/shell/powerbrowser.js`

*Section WR-02 of `.planning/workstreams/orca/phases/62-overlay-gate-and-powerbrowser-run-orcad/62-REVIEW.md`, verbatim:*

**File:** `powerbrowser/shell/powerbrowser.js:392`, `powerbrowser/shell/OrcaService.sys.mjs:77-103`
**Issue:** Orca starts in `.finally()` after `TheiaService.start()` settles. When quit is granted during Theia's start, `TheiaService.stop()` sets `_shuttingDown`, `_restart` returns (`TheiaService.sys.mjs:1225-1227`, `:1237-1239`), `start()` resolves, and `OrcaService.start()` runs in the middle of shutdown. `start()` never checks whether the application is quitting:
- `onQuitGranted` (`:88`) registers after `quit-application-granted` has already fired, so it never calls `stop()`.
- `addNamedReapBlocker` (`:96`) throws once the `quit-application` phase has finished (`upstream/toolkit/components/asyncshutdown/AsyncShutdown.sys.mjs:735-739`). That error is caught and logged (`:97-99`).
- `_shuttingDown` stays false, so `_launch` spawns orcad.
- Gecko's Subprocess does not kill children at shutdown (its blocker only closes the worker, `subprocess_unix.worker.js:588-598`), so orcad and its daemon outlive the browser.
**Fix:** Add a boundary method such as `PowerBrowserAPI.isQuitting()` that returns `Services.startup.shuttingDown`. Check it at the top of `start()` and again in `_launch` before every `_spawnAndGate`. Alternatively, have powerbrowser.js skip `OrcaService.start()` when Theia's start ended because of a stop.

## orcad-hosting-05: A quit that lands just after orcad's ready line can leave the pairing credential file behind after exit

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `powerbrowser/shell/OrcaService.sys.mjs:529`

**What is wrong.** _stopTree removes the three bridge files first (lines 630-636) and then ends orcad. _spawnAndGate does not check _shuttingDown again after outcome.ready resolves. It goes on to await readProcessStartTicks, writeStateFile and writePrivateFile(orcad-data-root), then _writeHandOff writes web-pairing and orca-panes-dir, and finally sets _state = 'ready'. If stop() starts during those awaits, the removal can run before the writes, so the web-pairing file (a reusable credential) and the other hand-off files remain in the bridge folder after the browser exits. The state can also report 'ready' after 'stopped'. The file is 0600 in a 0700 folder, so exposure is limited to the same user. The next session then consumes it as a stale offer (see the stale hand-off finding).

**Scenario.** The user quits within a second of launch while orcad is printing its ready line. _stopTree deletes web-pairing, then _writeHandOff recreates it. PowerBrowser exits with <alias>-bridge/web-pairing still on disk.

**Preconditions.** stop() begins in the short window between orcad's ready line and the end of _writeHandOff.

**Evidence.** OrcaService.sys.mjs:490-531 has no `_shuttingDown` check between `const ready = outcome.ready;` and `await this._writeHandOff(offer); ... this._state = "ready";`, while :630-636 `for (const name of this._bridgeDir ? [OrcaEnv.ORCAD_DATA_ROOT_FILE, OrcaEnv.ORCA_WEB_PAIRING_FILE, OrcaEnv.ORCA_PANES_DIR_FILE] : []) { ... removeStateFile(...) }` runs first in _stopTree.

**Suggested fix.** Re-check this._shuttingDown after each await between ready and _writeHandOff, and skip the writes (and endOwn) when set. Alternatively, have _stopTree remove the bridge files again after the process is gone.

**Verifier (CONFIRMED, low).** stop() sets _shuttingDown and _stopTree first awaits removal of the three bridge files (:630-636). In parallel, _spawnAndGate continues after outcome.ready with no _shuttingDown check: readProcessStartTicks x2 (:502,:504), writeStateFile (:508), writePrivateFile(orcad-data-root) (:523), then _writeHandOff writes web-pairing and orca-panes-dir (:552,:567). Its last check is at :434, before the race. _stopTree does not remove the bridge files a second time; it removes only the state file (:658-664). It also waits up to graceMs+500 for orcad to exit (:652), so the late writes finish before the process ends. Those files remain after exit. _state='ready' set at :531 is later overwritten by 'stopped' at :665, because _stopTree's waits are long, so the claim that the state can end as ready is unlikely. The file-leftover part holds. Exposure is limited to the same user (0600 file), and the offer is dead once that orcad is gone, because the device row is session-only. *Checked at:* No guard between OrcaService.sys.mjs:490 and :531. The only _shuttingDown checks in _spawnAndGate are at :434 and in _launch (:388,:392).

## orcad-hosting-06: Hand-off files from a crashed session are not cleared at start and are served to Theia before OrcaService runs

- **Severity:** low
- **Verdict:** PLAUSIBLE
- **Location:** `powerbrowser/shell/OrcaService.sys.mjs:106`

**What is wrong.** Only _stopTree removes the bridge files web-pairing, orca-panes-dir and orcad-data-root. Nothing in _startSequence or _resolve clears them, and a crash skips the stop. powerbrowser.js starts OrcaService only after TheiaService.start settles, so the Theia frontend boots first. orca-pane-bundle.ts waitForPairing() takes the first offer handOff() returns, and handOff() does not check orcad's state. The frontend therefore boots its memoized pane bundle with the previous session's offer and bundle path. Per 67-03 (P65-17, A-7) the device row is session-only, so that offer is dead once the new orcad replaces the leftover. Before that happens, it authenticates to the leftover orcad that survived the crash, which OrcaService then kills. Expected result: Orca tabs come up in a pairing-lost state after every crash until the user presses Reconnect.

**Scenario.** PowerBrowser crashes. On relaunch the Theia frontend reads the old <bridge>/web-pairing at boot, bootstraps against the old orcad (still alive), and then OrcaService reaps that orcad and starts a new one whose device rows do not hold the old token. The Orca tabs show an unauthorized or pairing-lost state.

**Preconditions.** A previous session ended without a granted quit.

**Evidence.** powerbrowser.js:392 `TheiaService.start(browserElement)...finally(() => OrcaService.start()...)`; OrcaService.sys.mjs:106-115 `_startSequence` (resolve, preflight, reap, launch) has no bridge-file removal; theia/extensions/orca-panes/src/node/orca-panes-backend-module.ts:154-198 `handOff()` reads WEB_PAIRING_FILE with no orcad-state check; orca-pane-bundle.ts:102-108 `waitForPairing` returns the first offer, and `ready()` memoizes `this.booting ??= this.boot()`.

**Suggested fix.** Remove the three bridge files at the start of _resolve, once _bridgeDir is known and before any spawn. Better, have handOff() refuse unless the offer was written after the current orcad's ready (for example, by a start nonce written beside it).

**Verifier (PLAUSIBLE, low).** Nothing clears bridge files at start: _startSequence (:106-115), _resolve and TheiaService (_orcaBridgeDir, TheiaService.sys.mjs:789-797) never remove web-pairing. The bridge folder is the alias path plus '-bridge' (OrcaEnv.sys.mjs:292-296), which survives a crash. The frontend boots in onStart (orca-pane-bundle.ts:62-65), and its first waitForPairing poll is immediate (:102-108). The backend's handOff checks folder and file owner, mode, decoding and port (orca-panes-backend-module.ts:153-198) but not freshness, and the stale offer names the same port, so it passes. OrcaService starts only after TheiaService.start settles (powerbrowser.js:392), and the new offer appears only after the reap (up to killGraceMs) and a new ready line. At cold start the chrome state is 'starting' with restarting=false, so failureClassOf returns null (OrcaEnv.sys.mjs:504-518). The auto re-pair in orca-hosting-status.ts:288-296 fires only after 'restarting', 'could-not-start' or 'port-in-use' (:43), so it does not fire here. The step I cannot settle statically: whether the stale-offer client ends in a held unauthorized/pairing-lost state, or whether Orca's own client recovers. That depends on the frontend poll winning the race against the new writePrivateFile and on Orca's reconnect behaviour against the replacement orcad. *Checked at:* No freshness guard in handOff (orca-panes-backend-module.ts:153-198). Auto re-pair is limited to REPAIR_AFTER (orca-hosting-status.ts:43,288). The runtime step is the Orca client's behaviour after the replaced orcad refuses the old token.

## orcad-hosting-07: orcad crashes after ready are restarted without limit or backoff

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `powerbrowser/shell/OrcaService.sys.mjs:583`

**What is wrong.** giveUpAttempts and the backoff apply only to consecutive failures inside one _launch call. Every successful ready ends that loop, so an orcad that reaches ready and then exits, from a crash bug, an agent-triggered fault or a bad restored session, is restarted by _supervise right away (attempt 1 has no sleep), indefinitely. _restartCount only grows. The state alternates between starting/restarting and ready and never reaches failed, so the failure page and Restart button never appear, and each cycle also kills and respawns orcad's subsystems.

**Scenario.** A restored session makes orcad throw 5 s after its ready line on every start. PowerBrowser spawns, gates and loses orcad about every 6-10 s for the whole session, burning CPU, and the user only sees a permanent 'restarting' state.

**Preconditions.** orcad repeatedly exits soon after printing its ready line.

**Evidence.** OrcaService.sys.mjs:583-591 `this._restartCount += 1; ... await this._reapLeftover({ includeDaemon: false }); await this._launch();` with no limit; :387-392 `for (let attempt = 1; ; attempt += 1) { ... const result = await this._spawnAndGate(); if (result.ok || this._shuttingDown) { return; }` resets the attempt count on every ready.

**Suggested fix.** Track exits within a time window (for example, N post-ready exits in M minutes) and switch to the failed state with a 'crashing repeatedly' row. Carry the backoff across supervise cycles instead of resetting it on ready.

**Verifier (CONFIRMED, low).** _launch's attempt counter and backoff are local to one call (:385-403) and it returns on the first ok (:392). _supervise (:574-595) has no cap or delay: it increments _restartCount, reaps and calls _launch again, and attempt 1 runs without a sleep. An orcad that reaches ready and then exits is therefore respawned indefinitely, and the state alternates between restarting and ready, never reaching failed. No pref or guard bounds _restartCount. The effect is CPU use and a permanent restarting state, which makes this a correctness or robustness issue rather than a security one. *Checked at:* No guard. OrcaService.sys.mjs:583-591 is unbounded, and :387-393 resets per call.

## orcad-hosting-08: A start rejected after orcad has started its detached daemon leaves that daemon untracked through quit

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `powerbrowser/shell/OrcaService.sys.mjs:493`

**What is wrong.** orcad starts the detached terminal daemon early (orcad-entry.ts:75), well before it binds the WebSocket port and prints ready, and its own shutdown only disconnects from the daemon. Three OrcaService paths kill orcad through its process handle alone: the startup timeout (line 474), the loopback check (493) and the Node-version check (497). In none of them is the daemon recorded in _daemonPid or the state file. A port-in-use exit after daemon start does the same. At quit, _stopTree sees no live proc and _daemonPid is null, so the daemon is never ended. It lingers until its own idle shutdown, or indefinitely if it adopted or restored sessions. This breaks the RUN-05 goal that quit leaves nothing behind.

**Scenario.** orcad starts the daemon, then takes longer than 60 s to print ready on a slow first start. OrcaService SIGTERMs orcad, retries, and finally fails. The user quits PowerBrowser, and the orca-daemon-<nonce>.scope process is still running afterwards.

**Preconditions.** An orcad start fails after the daemon is spawned (timeout, loopback mismatch, Node below 24, or busy port).

**Evidence.** OrcaService.sys.mjs:473-475 `if (outcome.timeout) { await endOwn(); return {...} }`, :492-499 `await endOwn(); return { ok: false, recoverable: false, ...}` before :503 `this._daemonPid = ready.daemonPid;`. endOwn (:427-433) is `PowerBrowserAPI.killProcess(proc, graceMs)` only. orca/src/main/orcad/orcad-daemon-supervision.ts:57-58 `stopOrcadDaemon() { await disconnectDaemon() }`.

**Suggested fix.** Before endOwn on any failed gate, snapshot listProcessTree([proc.pid]) and kill the daemon rows the same way _endDaemon does. On the loopback and Node-version paths, also record ready.daemonPid so quit can reap it.

**Verifier (CONFIRMED, low).** orcad-entry.ts:72-81 starts the daemon early, in parallel with imports, and registers a cleanup that only disconnects (stopOrcadDaemon -> disconnectDaemon, orcad-daemon-supervision.ts:57-59). The pinned-port bind error comes from runtime/rpc/ws-transport.ts, which is reached after daemon start, whereas the instance lock is taken earlier in startOrcadWithHost. OrcaService's timeout (:473-475), loopback (:492-494) and Node-version (:496-498) rejections call endOwn, which is killProcess(proc) only (:427-433), before _daemonPid is set at :503. The port-code exit path (:477-486) also never records it. Retries reap with includeDaemon:false (:402). If every attempt fails, _stopTree finds the proc already exited and _daemonPid null, so _sameIdentity is false (:642) and the daemon is not in the tree (:643-644). _endDaemon(null, null, []) then does nothing. The state file was removed by the cold-start reap (:371-372) and never rewritten, so the next session's reap has no record of it either; that orcad simply adopts the daemon. *Checked at:* No guard. OrcaService.sys.mjs:474, :493, :497 and :485 return before :503-515 record the daemon. orcad-daemon-supervision.ts:57-59 is disconnect-only.

## pairing-credentials-03: Stale web-pairing and orca-panes-dir files are never cleared at start, on an unexpected orcad exit, on a failed launch, or when the new ready line has no offer, and handOff serves them as current

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `powerbrowser/shell/OrcaService.sys.mjs:546`

**What is wrong.** The bridge files are removed only in _stopTree. A browser crash or kill leaves web-pairing behind. On Linux the bridge folder is under XDG_RUNTIME_DIR; on hosts without it, it falls back to HOME/.cache and survives reboots. Nothing removes the file at the next start or in _supervise. When a new ready line reports pairing.available false, _writeHandOff logs a line and leaves the previous start's offer in place. The backend has no generation or orcad-identity check, so it hands that stale credential to the frontend as this start's offer. Because orcad's token rows persist (see the next finding), the stale file is still a working runtime-scope credential, not dead data. This contradicts the OrcaEnv contract 'removed on stop' as a statement of the offer's lifetime.

**Scenario.** PowerBrowser is killed (OOM or SIGKILL), so _stopTree never runs. On the next launch, before orcad is ready, handOff returns the previous session's offer and the frontend pairs with it. Separately, an orcad restart whose ready line has pairing.available false (device_registry_unavailable) keeps serving the previous offer. Meanwhile the file holds a valid runtime token on disk for as long as the folder exists.

**Preconditions.** A crash, kill, or a ready line with no offer. Reading the file requires the same uid.

**Evidence.** OrcaService.sys.mjs:550-558: `if (offer) { ... writePrivateFile(... ORCA_WEB_PAIRING_FILE ...) } else { this._pushLog("orcad reported no pairing offer; Orca tabs cannot open."); }`, with no removal on the else branch. OrcaService.sys.mjs:630-632: the bridge files are removed only in _stopTree. _resolve, _reapLeftover, _supervise (574-595) and restart() (156-167) never remove them. OrcaEnv.sys.mjs:72-73: 'Written 0600 for the Theia backend only and removed on stop.'

**Suggested fix.** Remove web-pairing and orca-panes-dir in _startSequence before the spawn, at the start of _supervise's relaunch, and on the no-offer branch of _writeHandOff. Optionally have the backend refuse an offer file whose mtime predates a chrome-written orcad-start marker.

**Verifier (CONFIRMED, low).** The bridge files are removed only in _stopTree (OrcaService.sys.mjs:630-636). _resolve (:170-245), _reapLeftover (:359-377), _launch (:380-404), _supervise (:574-595) and restart() (:156-167) never remove web-pairing or orca-panes-dir. The else branch of _writeHandOff (:556-558) only logs, so a ready line with no offer leaves the previous offer in place. handOff has no generation or orcad-identity check (orca-panes-backend-module.ts:154-198), so it serves whatever file is there. On Linux without XDG_RUNTIME_DIR the folder falls back to $HOME/.cache/pb-orca-<hex>-bridge (OrcaEnv.sys.mjs:270-271, 292-295), which survives reboot. As traced under pairing-credentials-04, the token row the offer names is not revoked, so a stale file is still a usable credential and not dead data. Two things limit the impact. Reading the file requires the same uid. A frontend pairing with a stale offer mostly ends up connected to the same profile's orcad, which is a correctness and lifetime problem rather than an escalation. Low is defensible. *Checked at:* No removal path exists outside _stopTree (OrcaService.sys.mjs:630-636). The else branch at :556-558 has no unlink. OrcaEnv.sys.mjs:72-73 states 'removed on stop'.

## orcad-hosting-03: Fixed loopback port 26768 lets any local user deny Orca to PowerBrowser by binding it first

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `powerbrowser/shell/powerbrowser-sidecar.js:69`

**What is wrong.** The orcad port is a fixed, published constant, and a busy port is deliberately non-recoverable: no retry, no other port. TCP ports on 127.0.0.1 are not per-user, so another local user or any same-user process can bind 127.0.0.1:26768 before PowerBrowser starts, and Orca then never starts for that session. This is fail-closed: PowerBrowser does not adopt the squatter (T-62-09), and the client's E2EE pinned key means a stale offer sent to a squatter does not reveal the device token. Availability is still lost, and the only recovery is editing a pref by hand. The squat also works in the gap between an orcad crash and its respawn, which sends a running session to the failed state.

**Scenario.** A second local account runs `nc -l 127.0.0.1 26768`. Every PowerBrowser launch by the victim shows the port-in-use failure page, and the Orca tabs never open.

**Preconditions.** Another local process binds 127.0.0.1:26768 before orcad, at startup or during a respawn.

**Evidence.** powerbrowser-sidecar.js:69 `pref("powerbrowser.orca.port", 26768);`; OrcaService.sys.mjs:238 `this._port = PowerBrowserAPI.getIntPref("powerbrowser.orca.port", 26768);`; :480-486 `const code = [OrcaEnv.ORCAD_PINNED_PORT_CODE, OrcaEnv.ORCAD_LOCK_HELD_CODE].find(c => text.includes(c)); ... return { ok: false, recoverable: false, ...`

**Suggested fix.** When the pinned port is busy at a cold start, fall back to a port PowerBrowser picks from its own range and records in the state file and the hand-off. Keep refusing adoption. At minimum, show the holder's uid (from /proc/net/tcp) in the diagnostics rows so the user can tell a squatter from a leftover.

**Verifier (CONFIRMED, low).** powerbrowser-sidecar.js:69 pins 26768, and OrcaService reads the same default (:238). The bind failure surfaces as pinned_port_unavailable from orcad's ws-transport. _spawnAndGate classifies it as non-recoverable (:480-485), so there is one attempt and no other port. Any local account can bind an unprivileged loopback port first. The failure is fail-closed: the squatter is never adopted, and the offer is written only after a verified ready line from PB's own child. Recovery is wider than the finding says. port-in-use is in REPAIR_AFTER (orca-hosting-status.ts:43), and its failure page renders Restart, so a same-user squatter can be stopped and Restart pressed. A different user's squatter still requires the pref change. The effect is availability only. *Checked at:* Fail-closed by design (OrcaService.sys.mjs:483-485 comment). Only availability is lost. Restart is offered for port-in-use (orca-hosting-status.ts:43; 67-CONTEXT P67-06).

