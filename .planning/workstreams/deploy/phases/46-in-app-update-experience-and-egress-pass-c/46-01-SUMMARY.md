---
phase: 46-in-app-update-experience-and-egress-pass-c
plan: 01
subsystem: browser-chrome
tags: [gecko-update, shell-request-kinds, internals-boundary, verify-row]

requires:
  - phase: 40-release-identity-esr-pin-and-patch-regeneration-a
    provides: update channel constant, user-initiated disposition, About-dialog link prefs, update-prefs row
provides:
  - Update observer through the boundary file with appUpdate push
  - Three new shell request kinds with eRestart path
  - shell-request-kinds set-equality row with stray-kind self-test
affects: [46-02 (client dispatches the three kinds), 46-03 (hop asserts the strings this enables)]

actuals:
  tokens: 17000
  tasks: 2
  commits: 1

tech-stack:
  added: []
  patterns: [derive-and-compare set equality, out-of-scope derived from unions, pending-client interim removed before commit]

key-files:
  created: [scripts/verify-shell-request-kinds.mjs]
  modified: [powerbrowser/shell/PowerBrowserAPI.sys.mjs, powerbrowser/INTERNAL-APIS.md, scripts/verify-platform.sh, inventory/brand-tokens.json]

key-decisions:
  - "Observer registers chrome-side (parent process) next to startTabStoreTriggers; push rides PowerBrowserWebTabState, no new channel"
  - "checkForUpdates is accepted-not-awaited (result arrives as appUpdate push); restartToUpdate copies requestRestart exactly"
  - "Row derives out-of-scope kinds from GroupMutation/WebTab/Store unions at check time, never a hand list"
  - "Brand-token count moved -PLAN.md 51 to 58 for the seven new catalogue rows (COUNT MOVED discipline)"

patterns-established:
  - "Shell-request contract: accepted (handleShellMessage cases + SHELL_MESSAGE_KINDS) vs dispatched (channel clients + ShellStateMessage union) as set equality"

requirements-completed: [UPD-18, UPD-19]

coverage:
  - id: D1
    description: "Shell observes the four update topics, pushes appUpdate, answers the three kinds, restarts through eRestart with the flush"
    requirement: "UPD-18"
    verification:
      - kind: other
        ref: "bash scripts/check-internals-boundary.sh && bash scripts/check-internals-boundary.sh --catalogue"
        status: pass
      - kind: other
        ref: "node scripts/verify-shell-request-kinds.mjs --self-test"
        status: pass
    human_judgment: false
  - id: D2
    description: "shell-request-kinds row compares accepted vs dispatched kinds as set equality with stray-kind self-test"
    requirement: "UPD-19"
    verification:
      - kind: other
        ref: "node scripts/verify-shell-request-kinds.mjs --self-test"
        status: pass
      - kind: other
        ref: "scripts/verify-platform.sh --only shell-request-kinds"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-10-26
status: complete
---

# Phase 46 Plan 01: Shell update observer and request kinds Summary

**The shell observes the Gecko update service and answers the three update request kinds, with a set-equality row proving the chrome/frontend kind contract.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-10-26T02:30:00Z
- **Completed:** 2026-10-26T02:55:00Z
- **Tasks:** 2 completed
- **Files modified:** 5

## Accomplishments
- UPD-18: one `Services.obs` observer for update-available/staged/downloaded/error with null-guard before QueryInterface, total status mapping, and `{kind:'appUpdate',status,version}` push over the existing `PowerBrowserWebTabState` path.
- UPD-19: `appUpdateState` (currentState read), `checkForUpdates` (background check, accepted-not-awaited), `restartToUpdate` (announce quit-application-requested with "restart", then `eAttemptQuit|eRestart` so `runQuitFlushSync` still runs).
- `scripts/verify-shell-request-kinds.mjs` + two registry rows (quick tier): derives accepted kinds from `handleShellMessage` cases + `SHELL_MESSAGE_KINDS` and dispatched kinds from channel clients + `ShellStateMessage` union; set equality both ways; default case must return `{ok:false}`.
- Boundary green and catalogued (8 new INTERNAL-APIS.md rows); residual-brand scan green after COUNT MOVED 51 to 58.

## Task Commits

Each task was committed atomically:

1. **Task 1: UPD-18/19 end to end** - `8c60514` (feat)
2. **Task 2: shell-request-kinds row** - `8c60514` (feat, same commit: row co-developed with the kinds it proves)

**Plan metadata:** `8c60514` (feat: observe update service and accept shell request kinds)

## Files Created/Modified
- `powerbrowser/shell/PowerBrowserAPI.sys.mjs` - update observer, currentState read, appUpdate push, three new handleShellMessage cases, eRestart path.
- `powerbrowser/INTERNAL-APIS.md` - eight catalogue rows (updateService, nsIUpdate, add/removeObserver, PRBool, notifyObservers, startup quit).
- `scripts/verify-shell-request-kinds.mjs` - set-equality row + `--self-test` (5 plants: stray accepted/dispatched, removed each side, throwing default).
- `scripts/verify-platform.sh` - two registry rows after zizmor-self-test.
- `inventory/brand-tokens.json` - `-PLAN.md` 51 to 58.

## Decisions Made
- Observer lives chrome-side next to `startTabStoreTriggers` (Pitfall 1: wrong process observes nothing).
- `mapUpdateNotification` is total: staged/downloaded to ready, cant-apply to cant-apply, error to error, everything else to checking.
- `updateVersionFromSubject` null-guards before QueryInterface (Pitfall 3: cant-apply subject is null).
- Row excludes other-dispatch kinds (web-tab, group, store) and chrome-to-frontend pushes (flushShellState, appUpdate) by derivation, not exemption list.

## Deviations from Plan

**[Rule 3 - Missing critical] Interim pending-client leniency removed before commit** — Found during: Task 2 | Issue: the row initially counted a chrome-only new kind as pending-client green until the 46-02 client landed | Fix: staged the client in the same run and restored strict set equality; appUpdate push excluded by construction | Verification: `node scripts/verify-shell-request-kinds.mjs --self-test` PASS, `--only shell-request-kinds` PASS | Commit `8c60514`

**Total deviations:** 1 auto-fixed (Rule 3). **Impact:** none; final contract is strict set equality as planned.

## Self-Check: PASSED

- `grep -c 'appUpdateState\|checkForUpdates\|restartToUpdate' powerbrowser/shell/PowerBrowserAPI.sys.mjs` prints `8` (>= 6).
- `grep -c 'eRestart' powerbrowser/shell/PowerBrowserAPI.sys.mjs` prints `2` (>= 1).
- `grep -c 'PowerBrowserWebTabState.*appUpdate\|appUpdate.*PowerBrowserWebTabState'` prints `1` (>= 1).
- `bash scripts/check-internals-boundary.sh --catalogue` exits 0.
- `node scripts/verify-shell-request-kinds.mjs --self-test` exits 0 with 5 ok lines.
- `node scripts/verify-shell-request-kinds.mjs` exits 0 (7 vs 7 after 46-02 staging).
- `node scripts/scan-brand-residue.mjs` exits 0 (staged).
