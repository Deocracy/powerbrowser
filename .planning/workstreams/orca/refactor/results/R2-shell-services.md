# Result: R2-shell-services

Branch: worktree-agent-a186fb1c606c58afd   Base: 08e6f64393f5cc8e54319341079da22657e99bd2   Final: see the commit that adds this record

| # | Type | Commit | Files | What and why it is safe |
|---|---|---|---|---|
| 1 | refactor | 12711379 | powerbrowser/shell/OrcaEnv.sys.mjs | parseReadyLine, readyLineOffer and readyLineOfferUnavailableReason each found and parsed the first ready line with the same split, find and JSON.parse; a private readyRecordOf does it once. A line that starts with `{` parses to an object or throws, so each caller still returns null for no line or a bad line and the same fields otherwise. |
| 2 | refactor | 50fffd20 | powerbrowser/shell/OrcaEnv.sys.mjs | orcadAcceptedLine and orcadAdoptedLine differed only in `kind`; a private daemonLine builds both with the same key order and null rules, so every stdin line to orcad and the keeper is byte-identical. Undefined and null arguments behave as before. |
| 3 | refactor | 04fc6cd5 | powerbrowser/shell/TheiaService.sys.mjs | _resolveConfigDir's no-profile fallback and _legacyStateFilePath built the same XDG_CONFIG_HOME-else-HOME/.config `powerbrowser` directory; _xdgConfigDir builds it once, with the same getEnv calls in the same order, so both paths are unchanged. |

## Bugs fixed
None.

## Registry requests
None.

## Red by design
None.

## Blocked by check
- orcad-lifecycle-self-test (scripts/verify-orcad-lifecycle.mjs:1044): folding the four identical `if (this._shuttingDown) { await endOwn(); return { ok: false, recoverable: false, step: "stopping", rows: [] }; }` blocks in OrcaService._spawnAndGate (OrcaService.sys.mjs:519-523, 625-628, 658-661, 675-678) into one helper. The self-test removes those blocks with a regex over that exact text, so the plant would no longer apply.

## Handoffs
None. No Firefox touchpoint was added, removed or moved; GroupActorChild.sys.mjs is unchanged.

## Needs owner
- powerbrowser/shell/TheiaService.sys.mjs:1193-1225 (_healthLoop) at base: the steady-state health loop keeps running while the error layer is up, and after two failed probes it calls `_restart()`, which runs a full give-up budget (up to `giveUpAttempts` spawns over `giveUpWallclockMs`). Evidence: after a completed swap, `_restart()`'s unrecoverable give-up (`_showError(..., false, ...)`, :1303) deliberately starts no recovery probe (01-12, :1470-1486, D-113 "no retry at all") and hides Retry, yet the health loop respawns the backend about every 10 s plus the budget, for the rest of the session. After a recoverable give-up the loop also runs beside the recovery probe, which powerbrowser-sidecar.js:37-40 says is "deliberately slow ... not to be a second health loop". Proposed fix: in `_healthLoop`, skip the probe and the restart while `this._errorShown` is true (`continue` after the sleep), so recovery in the error state belongs to the probe and Retry only. Needs the owner because it changes what the user sees: an unrecoverable error that today can clear itself when a respawn happens to succeed would stay until PowerBrowser is reopened, as its own message says.

## Not done
- One shared staged-Node resolver for TheiaService._resolveSidecar (:593-599) and OrcaService._resolve (:261-268): the only module both import besides the boundary is OrcaEnv, and scripts/verify-shell-error-contract.mjs:382 loads TheiaService with an import stub that returns `{ PowerBrowserAPI }` for every URL, so a new OrcaEnv function would throw there.
- Running TheiaService.start()'s independent awaits (`_reapLeftover`, `_clearStaleOrcaHandOff`, `ensureTabStore`, `loadWebTabHistories`) concurrently: the gain on a normal launch is a few file reads, it reorders the ring-buffer and stdout lines the live checks read, and several checks derive start()'s structure.
- Pruning dead WeakRef entries from GroupActorChild's per-page snapshot ref table: a pruned ref would answer browser_ref_not_found where it answers browser_stale_ref today.
- Caching the log-buffer pref in TheiaService._pushLog and OrcaService._pushLog: it would stop a pref change taking effect mid-session.

## Quick gate
456 PASS, 0 FAIL, 0 SKIP (`scripts/verify-platform.sh --quick` inside `nix develop .#theia`, at 04fc6cd5). No non-PASS row.
