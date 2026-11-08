---
phase: 39-v1-5-close-out
plan: 10
subsystem: testing
tags: [prompts-live, PROMPT-03, OQ1, adopted-tabs, CR-01, CR-02, probe-1, harness]
status: complete

requires:
  - phase: 39-v1-5-close-out
    provides: "39-03 OQ1 ruling (derived scenario skip plus a ledger row); 39-09 kwinShot through captureShell, headed dialog-probe"
provides:
  - "prompts-live: derived PROMPT-03 skip, printed as 'SKIPPED (PROMPT-03 deferred, 999.3)', with static plants deferral-record-removed and deferral-row-removed"
  - "WINDOWS.md entry 26 (open, skipped-test) for the skip"
  - "live probe-1 evidence re-captured (verdict unchanged: stock-blocks-ide, relayFeasible false)"
  - "scenarios adopted-prompt, adopted-bar-navigate, adopted-parity, camera-then-geo, with one plant each"
affects: [39-11, 39-14, 39-18, 39-19]

tech-stack:
  added: []
  patterns:
    - "A skip derived from a requirements record carries a static plant per half of the record, and it goes red if the skip still applies after either half is removed"
    - "An adopted tab is made by the page's own window.open, evaluated through BiDi with userActivation: true, so Phase 36's adoption path runs with no blocked-popup bar involved"
    - "A plant re-creates a reviewed defect on the live chrome object it concerns (the prompt facade's selectedBrowser getter, a TabClose capture listener, the node's openerTab, gBrowser.updateBrowserSharing), then reads back that the change took before the scenario continues"

key-files:
  created:
    - .planning/phases/39-v1-5-close-out/39-10-SUMMARY.md
  modified:
    - scripts/verify-prompts-live.mjs
    - .planning/WINDOWS.md
    - .planning/probes/prompt-probe/dialog-{alert,confirm,prompt,leave,auth}.png
    - .planning/probes/prompt-probe/push-log.json
    - .planning/phases/37-permission-prompts-and-dialogs/37-UAT.md

key-decisions:
  - "OQ1 is implemented as Chris ruled it. The skip reads the same two REQUIREMENTS.md lines as verify-permission-prompts rule (p). That reader is not exported, and the module calls process.exit at load, so the two regexes are copied rather than imported. The deferral phase is read from the record, so the printed line names whatever phase the record names"
  - "The adopted-bar-navigate plant re-creates the close half of CR-01b, not the navigation half. The navigation cleanup is a listener in host.progressListeners, which chrome-scope code cannot reach. The close cleanup is the strip's TabClose listeners, which a capture listener on the window can stop"
  - "The stock TabClose handler fires each notification's removed callback but leaves the list on the closed browser. The close check therefore reads the pending:false push and the strip, not getNotificationsForBrowser"
  - "No requirement row was marked complete. PROMPT-01 and PROMPT-02 stay Pending until the milestone close, and the orchestrator owns requirement and STATE progress at merge"

requirements-completed: []

actuals:
  tokens: 26000
  tasks: 3
  commits: 3
plan_head_before: 3bdb55a0989ac9c8e618ec1f559296444b02ff59
plan_head_after: b8d5554d08b43e25e886e144fe9228ff8aea9fdb

duration: 95 min
completed: 2026-11-06
---

# Phase 39 Plan 10: OQ1 PROMPT-03 skip, live probe 1, and the adopted-tab and camera-then-geo scenarios Summary

**prompts-live now skips dialog and dialog-probe only while REQUIREMENTS.md records the PROMPT-03 deferral, and two static plants prove the skip stops when the record changes. Probe 1 was re-run live and headed, and its verdict is unchanged. Four new scenarios prove CR-01a, CR-01b, CR-01c and CR-02 live, and each has a plant that goes red.**

## Performance

- Duration: about 95 min (2026-11-06, lane A worktree)
- Tasks: 3 of 3
- **Headed runs: 1.** `flock /tmp/nix-shell.75PsxP/pb-headed.lock -c 'PB_LIVE_HEADED=1 node scripts/verify-prompts-live.mjs --scenario dialog-probe'`, sandbox off, 64 s.
- Headless sessions: about 20, for the scenario runs and the self-tests. No timing flake was hit, so no rerun was needed.

## Task 1: OQ1 ruling and probe 1 (0077dd5d)

- `deferredSkips(requirements)` returns the two PROMPT-03 scenarios with the reason `SKIPPED (PROMPT-03 deferred, <phase>)`, but only while both of these hold: the requirement line reads `(deferred to Phase X,` and the traceability row reads `| PROMPT-03 | Phase X | Deferred |`. `main()` applies it when no `--scenario` is given. `selfTest()` applies it to its live half when no `--scenario` is given. Both print one `<name>: SKIPPED (...)` line per scenario. An explicit `--scenario dialog` still runs the scenario.
- `staticAudit` covers the skip with a control and two plants:
  - The control: the skip must apply while the record exists.
  - `deferral-record-removed` and `deferral-row-removed`: each removes one half of the record, and the skip must stop applying. If it does not, the audit fails with `skip applied without a recorded deferral`.
  - RED evidence: I ran a copy whose derivation ignores the record. Both plants failed with that text, and the copy exited 1.
- **Ledger:** WINDOWS.md entry **26** (open, skipped-test, phase 39), with the plan's description. The diff shows only the new row, the counts and the timestamp; no `milestone` field was dropped.
- **Probe 1, headed, under the lock:** `dialog-probe: wrote .planning/probes/prompt-probe-verdict.json (outcome stock-blocks-ide)`.
  - The verdict file is byte-identical to the 39-09 one: same date, same bundle hash, same binary mtime. The source is `live probe 1 (verify-prompts-live.mjs --scenario dialog-probe)` and `provisional` is false.
  - The five PNGs were re-captured. I opened each one, and each shows only the PowerBrowser window.
  - The scenario line itself is `FAIL -- stock dialog blocks the IDE: ...`. That is the measured verdict, and the skip covers it in the default run.
- `scripts/verify-platform.sh --only prompt-probe-verdict-live` → `prompt-probe-verdict-live: PASS`. The `verdict live` check passes.

## Task 2: adopted-prompt and adopted-bar-navigate (022badb6)

```
  ok  clean control for adopted-prompt -> green
  ok  clean control for adopted-bar-navigate -> green
  ok  adopted-selection-stale -> red, naming 'adopted tab prompt hidden while it is current'
  ok  adopted-close-cleanup-skipped -> red, naming 'closing the adopted tab left a pending mark'
prompts-live --self-test: PASS -- clean controls green, 2 planted faults went red
```
The plain `--scenario adopted-prompt,adopted-bar-navigate` run passed both.

## Task 3: adopted-parity and camera-then-geo (b8d5554d)

```
adopted-parity: PASS
camera-doorhanger: PASS
camera-then-geo: PASS
  ok  opener-kept-on-close -> red, naming 'opener not cleared on close'
  ok  geo-report-clears-camera -> red, naming 'the location grant cleared the camera mark'
prompts-live --self-test: PASS -- clean controls green, 2 planted faults went red
```
- The tracker read goes through `ExtensionParent.apiManager.global.tabTracker`, from chrome scope. I checked in a scratch session that the tracker exists without an extension installed. WebDriver's view of the adopted tab was not read separately.
- **`geo-report-clears-camera` going red also proves that the shell's `gBrowser.updateBrowserSharing` really receives PermissionUI's `{ geo }` report on a grant.** Without that, the green result would be vacuous.

## Verification

- `scripts/verify-platform.sh --quick`, inside `nix develop .#theia`, was run after staging and before each of the three task commits. All three printed `verify-platform: PASS -- all checks passed`. Each run took 7 to 10 minutes on this host while lane B ran alongside.
- `node scripts/verify-prompts-live.mjs --self-test --static`: 25 plants plus the two deferral plants, PASS.
- 37-UAT:
  - Row 8: pass, from the live probe.
  - Row 9: skipped, with the reason "PROMPT-03 deferred to 999.3 (OQ1 ruling 2026-11-05, ledger 26)".
  - Row 26: pass, from prompt-probe-verdict-live.
  - Rows 18 to 21: pass. The evidence names the scenario, the plant and the commit.
  - Summary counts: passed 29, pending 10, skipped 2.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The first close check read the stock notification list on the closed browser**
- **Found during:** Task 2, the first adopted-bar-navigate run
- **Issue:** The stock TabClose handler (`PopupNotifications.sys.mjs:373-389`) fires `removed` for each notification but never empties the closed browser's list. So "kept 1" was stock behaviour, not a leak.
- **Fix:** The check now reads the pending:false push and the strip mark. A positive control, run before the close, requires that the mark is present.
- **Commit:** 022badb6

**2. [Scope] The plan's verify command `node scripts/verify-prompts-live.mjs --scenario dialog-probe` exits 1 by construction**
- Run headless, it reports BROKEN, because no KWin capture happens (39-09).
- Run headed, it reports `FAIL -- stock dialog blocks the IDE`, which is the measured verdict.
- The live evidence is the verdict file plus `prompt-probe-verdict-live: PASS`. I recorded it that way and did not weaken the scenario.

## Product fix deferred to main

None from this plan.

## Known Stubs

None.

## Threat Flags

None.
- T-39-24 is mitigated by the derivation and its two plants, and ledger 26 carries the repro, cause and source.
- T-39-25: the verdict is written only by the explicit headed run, and the PNGs were checked.
- T-39-26 is mitigated by adopted-prompt and its plant.

## Notes for later plans

- **The orchestrator owns the merge:** WINDOWS.md entry id 26 was taken on this branch. If lane B appended a ledger row too, the ids collide at the merge. Renumber one of them and update the 37-UAT row 9 text that cites "ledger 26".
- **For 39-11:** row 17 (the full self-test) and row 27 still belong to 39-11. The four new scenarios join the default `prompts-live` row automatically.

## Self-Check: PASSED

- FOUND: scripts/verify-prompts-live.mjs, .planning/WINDOWS.md entry 26, .planning/probes/prompt-probe-verdict.json
- FOUND commits: 0077dd5d, 022badb6, b8d5554d (ancestors of HEAD)
