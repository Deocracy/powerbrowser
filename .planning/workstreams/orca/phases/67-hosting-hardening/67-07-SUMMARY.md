---
phase: 67-hosting-hardening
plan: 07
subsystem: orca-overlay pairing, orca-panes frontend, live checks, tracking
status: complete
tags: [orca, gap-closure, D-36, RUN-06, INJ-01, WINDOWS-45, WINDOWS-46]
requires: [67-06 (merged Phase 67 tree, Task 2 reached)]
provides:
  - "the hosted Orca client keeps its environment id across an orcad restart (D-36)"
  - "hosted tabs keep their widgets and names through a re-pair"
  - "orca-failure-page-live restart clause; orca-landing-logo-live remount leg through Orca's own close path"
  - "67-06's Task 3 remainder: seam and egress rows, FEATURES T-8, ROADMAP, REQUIREMENTS, STATE, WINDOWS"
affects: [Phase 68 p68-05 (waits on Phase 67), /gsd-verify-work 67]
tech-stack:
  added: []
  patterns: ["a session-only re-pair hands Orca's preload its active environment, as Orca's addFromPairingCode does"]
key-files:
  created:
    - .planning/workstreams/orca/phases/67-hosting-hardening/67-07-PLAN.md
    - .planning/workstreams/orca/phases/67-hosting-hardening/67-07-SUMMARY.md
  modified:
    - orca-overlay/files/src/renderer/src/pb/pb-session-pairing.ts
    - theia/extensions/orca-panes/src/browser/failure/orca-hosting-status.ts
    - theia/extensions/orca-panes/src/browser/orca-pane-observer.ts
    - scripts/verify-orca-failure-page-live.mjs
    - scripts/verify-orca-landing-logo-live.mjs
    - inventory/brand-tokens.json
    - .planning/WINDOWS.md
    - .planning/workstreams/orca/DECISIONS.md
    - .planning/workstreams/orca/ROADMAP.md
    - .planning/workstreams/orca/REQUIREMENTS.md
    - .planning/workstreams/orca/STATE.md
    - .planning/workstreams/orca/research/FEATURES.md
    - .planning/workstreams/orca/phases/67-hosting-hardening/67-06-SUMMARY.md
decisions:
  - "D-36 (coordinator ruling, option-a): each session-only pairing closes Orca's active clients and becomes Orca's active environment; the last pairing, token blanked, stays in page memory as previousEnvironment"
  - "A re-pair holds every hosted tab like P65-35's reload hold (onWillRepair event, OrcaPaneObserver.rehold()); an event, because importing the observer into the status module is a module cycle with orca-pane-widget.tsx"
  - "The landing remount uses Orca's data-tab-close-button (its own E2E hook), the page-side close path that deselects an emptied worktree"
metrics:
  started: 2026-11-11T19:05Z
  completed: 2026-11-11T20:40Z
actuals:
  tokens: 24000
  tasks: 3
  commits: 5
plan_head_before: 59c15f6ded986c4091af9d720137d52e76182397
plan_head_after: b85fa06c87e329671b0b28191d86b21833517fd7
---

# Phase 67 Plan 07: Restart re-pair keeps Orca's environment id; landing remount leg

After an orcad restart, the hosted Orca client now re-pairs under the same environment id and keeps every hosted
tab. The landing remount leg drives Orca's own tab close path. Both Phase 67 blockers (WINDOWS 45 and 46) are closed
on live PASS lines, and 67-06's Task 3 tracking is done.

## Root causes

**WINDOWS 45 (RUN-06, restart recovery).** The overlay's `pairSessionOnly` (called by `repair()`) saved the new
pairing only through `saveStoredWebRuntimeEnvironment`. Orca's web preload keeps two more things in memory:
`webRuntimeState.activeEnvironment` and `webRuntimeState.activeClient` (`web/preload-api/web-runtime-session.ts`).
After `repair()`, both still referred to the replaced pairing. The sequence after a `kill -9`:

1. The old client still held the killed orcad's ephemeral session device key (`web-runtime-credential-source.ts`
   `sessionPlan`). That key's row died with the old orcad (P65-17).
2. The client reconnected, and the restarted orcad refused the key. `deviceRevoked` then called `forgetPairing`.
3. `credentialFor`'s `forgetPairing` checks `isActivePairing`. That check compared against the stale active
   environment, so it returned true and ran `clearStoredWebRuntimeEnvironment()`. This cleared the new session
   pairing as well. This is the refusal at 6-10 s that 67-06 saw (`verification: 'blocked'`,
   `blockedReason: 'access-revoked'`).
4. The next `repair()` found no previous environment. `createStoredWebRuntimeEnvironment`
   (`web-runtime-environment.ts:131-149`) therefore minted a new `web-<uuid>`, and the subscriptions logged
   "Unknown Orca runtime environment".

Orca's own in-browser pairing path, `addFromPairingCode`, closes the active clients and sets the active environment.
`repair()` did neither.

**Second effect, found live in this plan.** Once the client really changes pairing, Orca's store hydrates again. Its
pane list was empty for about 10 s, with the same keys before and after (trace in `.mozbuild/p67-07/dbg2.log`).
`OrcaPaneObserver` disposed every hosted widget on the empty list and re-created them under new names (`term1` became
`term2`, `chat1` became `chat2`). This is the case P65-35 already holds after a document reload.

**WINDOWS 46 (INJ-01, remount).** `AppWorkspaceShell.tsx` renders Landing only while `activeView` is `'terminal'`,
no creation is pending and `activeWorktreeId` is null. The page sets it to null itself when the last tab of the
active worktree closes (`terminal-tab-actions.ts`, `workspace-emptied-reaction.ts`), on workspace sleep, and on
folder or WSL removal. The CLI's host-side `terminal close` does not clear the page's selection. Removing the worktree
activates the main worktree instead (67-06). Landing can remount without a reload.

## Fixes

| Commit | What |
|---|---|
| a2c31b0f | docs: 67-07-PLAN.md; DECISIONS.md D-36 |
| c195f98b | fix: `pairSessionOnly` uses Orca's stored environment as `previousEnvironment`, or else the last pairing this document made (page memory, device token blanked). After creating the pairing it calls `closeActiveRuntimeClients()`, saves the pairing session-only, sets `webRuntimeState.activeEnvironment` and clears `manuallyDisconnectedEnvironmentIds`. `OrcaHostingStatus` fires `onWillRepair` immediately before `repair(offer)`, and `OrcaPaneObserver.rehold()` returns every tracked widget to the restored set and restarts the hold timer, with a generation guard |
| 8127f72c | test: orca-failure-page-live restart clause (`strandVerdict`, `strandMessages`, seven self-test cases); orca-landing-logo-live remount through `[data-tab-close-button="true"]` (a running-process confirmation is answered with "Stop and Close") |
| b6552490 | chore: brand rows Orca 2830 -> 2841 and orca 5327 -> 5330, no file added; one observer comment reworded so no unclaimed lower-case form enters a file outside its row |
| b85fa06c | docs: tracking (requirements, ROADMAP, FEATURES T-8, STATE, WINDOWS 45, 46 fixed, 47 recorded) |

P65-17 is unchanged. Nothing is written to Theia-origin storage. A document reload still pairs under a new id,
because page memory does not survive the reload; the offer-refusal induction reloads, and that path still passes.

A first attempt imported `OrcaPaneObserver` into `orca-hosting-status.ts`. That import is a module cycle
(observer -> widget -> status -> observer), so the frontend never created `window.theia.container` (two harness
timeouts). The event form replaced it before any commit.

## Builds

- `nix develop .#orca --command bash scripts/build-orca.sh --panes-only`: "build-orca-browser-host: PASS -- 308690
  bytes", "build-orca: PASS -- panes only in 9s"; the copied overlay file is byte-identical to the source.
- Audited Theia build, three times (yarn install --ignore-scripts --frozen-lockfile, the drivelist node-gyp rebuild,
  yarn build) inside `nix develop .#theia`, 0 errors. The last commit to `orca-pane-observer.ts` (b6552490) changed
  a comment only and was not rebuilt.
- No chrome JS changed, so there was no mach build. ORCA_* was unset in every build and run (13 were set in the host
  session).

## Live rows (each under flock /home/chris/coding/Power-Browser/.git/pb-live.lock, PB_LIVE_LOCK_HELD=1, MOZ_PURGE_CACHES=1)

| Row | Result |
|---|---|
| orca-failure-page-live | `orca-failure-page-live: PASS -- every hosted view showed the PowerBrowser page for each induced class and recovered; after the restart the client kept its environment id, logged no stranded-environment line and a CLI terminal became a hosted tab` (run6, run8 and run9 with every induction achieved, auth refusal included; run2 the same before the PASS text named the clause; run5 PASS with the note "auth-refusal induction not achieved at the pin ... (rows removed: 1)") |
| orca-failure-page-live (intermittent) | run4 FAIL: `harness: timed out after 60000 ms waiting for hosted views after the reload (last error: timed out after 180000 ms waiting for the page probe to finish)` in the offer-refusal reload. 1 of 6 runs. Cause not found. Recorded as WINDOWS 47 |
| orca-landing-logo-live | `orca-landing-logo-live: PASS -- Orca's own logo on another port; the PB mark and its alt on orcad's origin in a web tab and a stock window, never in the Theia document, and again after Landing remounts`; legs: proxy control (1 element, src not the mark), orcad web tab, stock window, Theia document 0, `remount: Landing unmounted on activation and mounted again carrying the PB mark`; gh called 1 time (stub) |
| orca-relaunch-restore-live | `orca-relaunch-restore-live: PASS -- dock, modes, chat, terminals, identity, pairing-ui, not-gone, devices, offer-scan` |
| orca-tabs-live | FAIL only on `tab-groups-cross-client` ("the second client shows no tab for T"), the known g3 red; the other 15 stages PASS |
| orca-pairing-containment-live | `orca-pairing-containment: PASS -- 9 sinks read, each control found, no needle of the launch's offer outside its five holders` (re-run because the pairing code changed) |

Measured in the restart trace (`.mozbuild/p67-07/dbg5.log`, an instrumented copy, deleted afterwards): the same
environment id throughout. The client read `checking` for about 10 s, then `verified`. The pane list was empty from
about 5 s to 15 s after the kill, and `orca-pane:term1` and `orca-pane:chat1` stayed open throughout. No line
carried the stranded-environment messages.

sidecar-origin-gate-live (RUN-08) and orca-credential-store-live (RUN-09) are not re-run. Their PASS lines are
recorded in 67-06 on the merged tree, and 67-07 touched no gate, chrome or credential code.

## Seams and egress (67-06 Task 3 item 3)

`--only` PASS: orca-overlay (3 seams, 9 overlay files), orca-overlay-self-test (29 plants), orca-overlay-built
(9 markers), orca-build-shape, privacy-hosts (22 hosts), theia-endpoints, generated-byte-identity (40 files),
orca-pane-entry, orca-pane-routes, both live rows' self-tests. `git diff --name-only a2607ccb HEAD -- orca-overlay
powerbrowser/endpoint-allowlist.json` prints only `orca-overlay/files/src/renderer/src/pb/pb-session-pairing.ts`,
the overlay file this gap authorised. No new seam; `git -C orca` status unchanged (the three declared seams).

## Gates

- `node scripts/scan-brand-residue.mjs`: `PASS -- no residual brand occurrence in 830 scanned file(s)`; `--self-test`
  exit 0.
- `nix develop .#theia --command scripts/verify-platform.sh --quick`: `verify-platform: PASS -- all checks passed`,
  410 rows PASS (the 67-06 count), no red, no SKIP.

## Tracking

- REQUIREMENTS: RUN-06, RUN-07, RUN-08, RUN-09 and INJ-01 are complete, each on a recorded PASS (the rows above, and
  67-06's sidecar-origin-gate-live and orca-credential-store-live).
- ROADMAP: the Phase 67 plan list in four waves, 7/7; progress row "In Progress (67-07 gap closure executed;
  verify-work pending)". Criterion 5 already reads "gated on the orcad origin", so no clause was added.
- FEATURES.md T-8: the correction from P67-20.
- STATE: decisions P67-02, P67-04, P67-16/P67-17, RUN-08, P67-21, P67-23 and D-36; the 67-06 Task 2 blocker marked
  resolved; a Phase 67 row under Deferred Verification.
- WINDOWS: 45 and 46 fixed through `gsd-tools windows fixed`; 47 recorded (the intermittent row above).
- Not run: `phase complete` (verify-work follows). Nothing pushed. The ledger is untouched.

## Deviations from Plan

1. [Rule 1 - Bug] The tab hold (`rehold()`) was not in the ruling's scope. It was found live: without it the first
   fixed run went red with "no recovery within 60000 ms" and every later control was "collector blind", because the
   tabs were re-created under new names.
2. [Rule 3 - Blocking] The first form of the hold was an import cycle (above). It was replaced by an event before
   commit.
3. Orphan orcad: one orcad process (pid 2141040) started by a failed diagnostic run in this plan, at 11:30:21 local
   time, was left running. Ending it was refused by the session's permission classifier. Seven older orcad
   processes from earlier sessions are also still running. Nothing was signalled.

## Known Stubs

None.

## Owner items

- D-36 (this ruling; the owner may override it).
- 67-06-SUMMARY.md "Owner items (end-of-milestone pass)" is unchanged.

## Self-Check: PASSED

The changed files exist. Commits a2c31b0f, c195f98b, 8127f72c, b6552490 and b85fa06c are ancestors of HEAD. No
`pairing=` value of 20 or more characters appears in the phase directory. `git status --porcelain
--untracked-files=no` lists only this commit's two SUMMARY files. The untracked milestone.lock and state.json were
left alone. Nothing was pushed.
