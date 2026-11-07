---
phase: 39-v1-5-close-out
plan: 01
subsystem: verification
status: complete
tags: [baseline, kwin, ydotool, uat, verify-platform]
requires: []
provides:
  - 39-BASELINE.md (tree state, A1/A7/C24 probes, classified 40-row red list)
  - scripts/lib/pb-kwin.mjs (raiseShell, activeWindow, captureShell, osKeys, --self-test)
  - PB_LIVE_HEADED=1 headed launch in withFirefoxPage
  - registry row real-input-gate-self-test
  - 34-UAT.md in the parseable template shape
affects: [39-05, 39-06, 39-08, 39-09, 39-10, 39-15, 39-18]
tech-stack:
  added: []
  patterns:
    - "KWin script print() + journalctl --user read-back as the active-window gate"
key-files:
  created:
    - scripts/lib/pb-kwin.mjs
    - .planning/phases/39-v1-5-close-out/39-BASELINE.md
  modified:
    - scripts/lib/firefox-bidi.mjs
    - scripts/verify-platform.sh
    - .planning/phases/34-tab-strip/34-UAT.md
    - .planning/probes/prompt-probe-verdict.json
key-decisions:
  - "A1 holds: KWin print() read back from the user journal; the real-input gate is built and registered"
  - "Every harness session is --headless; PB_LIVE_HEADED=1 drops the flag so pb-kwin has a window"
  - "C24 verdict product-writes-image is inferred, not observed: the headless clipboard keeps text only and the headed run fails earlier on the overlay"
  - "A headed session never shows the web-tab overlay; 39-05 and 39-15 depend on fixing that"
  - "Baseline at 04938fcd: 448 PASS, 40 FAIL in 11550 s; --gate would fail with no label excused"
requirements-completed: [PROMPT-04, PROMPT-06, PROMPT-08]
duration: 293 min
completed: 2026-11-05
commits: 6
plan_head_before: e32a090f4152846aba0f2ddf8917c5ae7ec1079b
plan_head_after: 77d5810e
actuals:
  tokens: 12200
  tasks: 3
  commits: 6
coverage:
  - deliverable: "34-UAT.md parses as 15 rows, status partial"
    human_judgment: false
    verification:
      - kind: command
        ref: "node -e uat.completeUatSession check (plan Task 1 verify)"
        status: pass
  - deliverable: "Real-input gate refuses both plants and passes the clean control"
    human_judgment: false
    verification:
      - kind: command
        ref: "node scripts/lib/pb-kwin.mjs --self-test (also PASS inside the full run)"
        status: pass
  - deliverable: "C24 verdict"
    human_judgment: true
    rationale: "Inferred from source and the earlier text/html reading; the wl-paste observation could not be made on this harness"
  - deliverable: "Classified baseline red list"
    human_judgment: false
    verification:
      - kind: command
        ref: "plan Task 3 verify node script: baseline ok 40"
        status: pass
---

# Phase 39 Plan 01: Baseline before any fix Summary

Wave 0 measured the starting point and changed no product code. 34-UAT.md now parses as 15 rows. A KWin-gated ydotool/spectacle module is proven by its self-test. A7 is confirmed, so 999.15/16 need no compile. The full `verify-platform.sh` run at `04938fcd` gave 448 PASS and 40 FAIL, and all 40 reds are classified with owning plans.

## Timing

- Start 2026-11-05T18:13Z, end 2026-11-05T23:07Z (293 min). Most of it was the full run (3 h 12 min) and the 40 reruns (73 min).
- 3 tasks, 6 commits, 7 files written (plus 6 probe artifacts re-stamped).

## Accomplishments

- **Task 1:** STATE.md committed. 34-UAT.md is rewritten to the template: rows 3, 5, 9, 10, 11 and 12 pass with verbatim live evidence; rows 4 and 6-8 keep their `live:` line and stay pending on the by-hand part; rows 1-2 are pending on owner calls; rows 13-15 are pending. The parser reports `partial`, and the Summary reads 15/6/0/9.
- **Task 2:** `scripts/lib/pb-kwin.mjs`.
  - It reads the active window back through a KWin script's `print()` plus `journalctl --user` (A1).
  - `osKeys` and `captureShell` refuse with "refused: active window ..." unless the class contains `powerbrowser` in the same step.
  - Self-test results: clean control (Shift sent and a capture taken), `ok  class-mismatch -> refused`, `ok  readback-empty -> refused`, `pb-kwin --self-test: PASS`.
  - A mutation copy with the gate disabled went red, which proves the self-test can fail.
  - Registry row `real-input-gate-self-test` was added to the live block.
  - A7: both JS modules symlink into `upstream/`.
- **Task 3:** `## Full run` in 39-BASELINE.md has one row per FAIL label: listed 5, prompt-03-deferred 1, gate-exclusion-stale 1, environment 23, new 10. `flaky: ng-018-scheduled-integrity-check`.

## Task Commits

- e5593190 docs(39-01): record phase 39 execution start in STATE.md
- 2c730f40 docs(39-01): rewrite 34-UAT.md in the parseable UAT template shape
- 3fd36bb5 feat(39-01): KWin real-input gate pb-kwin.mjs with self-test row
- 04938fcd docs(39-01): baseline tree state and probes (A1, A7, C24)
- 1bf81c89 docs(39-01): classified baseline red list from the full verify-platform run
- 77d5810e chore(39-01): dialog-probe artifacts re-stamped by the baseline run

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Harness sessions are headless, so KWin had no window to gate**
- **Found during:** Task 2
- **Issue:** `withFirefoxPage` always passes `--headless`, so the self-test's clean control could never raise a PowerBrowser window.
- **Fix:** `PB_LIVE_HEADED=1` drops `--headless` (one spread line). pb-kwin's self-test sets it.
- **Files modified:** scripts/lib/firefox-bidi.mjs
- **Commit:** 3fd36bb5

**2. [Rule 2 - Missing check] The clean control also takes one real capture**
- **Found during:** Task 2
- **Issue:** The plan's clean control exercised only `osKeys`, which left `captureShell` (needed by 999.14 in 39-09) unproven on its success path.
- **Fix:** Added an `ok  clean-capture` leg. spectacle takes about 25 s per capture on this host, so its timeout is 60 s.
- **Commit:** 3fd36bb5

**3. [Deviation] C24 bisect could not decide by wl-paste**
- **Found during:** Task 2
- **Issue:** A headless Gecko uses `HeadlessClipboard`, which never reaches Wayland and keeps only text/plain and text/html (`upstream/widget/headless/HeadlessClipboard.cpp:44-47`). All three headed runs failed earlier with `broken instrument: the /tools page is not shown`, with and without the polling loop.
- **Result:** The verdict line reads `product-writes-image (inferred; not observed through wl-paste)`, and the evidence and the confirmation 39-05 owes are written out in 39-BASELINE.md.

**4. [Orchestrator override] `.planning/state.json` not committed in Task 1**
- The plan asked for it to be committed. The orchestrator marked it as another writer's file, so it was left dirty. The dirty-tree rule allows `.planning/` paths, so nothing was blocked.

**5. [Run side effect] Probe artifacts committed**
- The full run's `dialog-probe` rewrote `.planning/probes/prompt-probe-verdict.json` and its PNG/JSON evidence. The verdict is unchanged; the build stamp is now the 2026-11-05 binary. Committed as 77d5810e so the tree matches the measured state.

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing check), 3 documented. **Impact:** the gate works as planned. C24 has a verdict, but 39-05 must confirm it headed.

## Issues Encountered

- **The overlay never shows in a headed session.** `overlayVisibility` never reaches `visible` in `openPage`, even with the shell raised and active. 39-05 (C24 headed confirmation) and 39-15 (real-input rows on a page) need this fixed first.
- **The full run rebuilt or re-stamped the binary.** `binaryMtime` moved to 2026-11-05T18:50Z during the run, so a row in the registry rebuilds `objdir`.
- **10 `new` reds go to 39-18:**
  - site-identity app-menu (2 rows)
  - verify-customize-inert
  - ng089-uat-sheets
  - shell01 (`tabbrowser` in powerbrowser.xhtml)
  - start-failure-shows-error
  - pan04 (g)
  - ng-018 (flaky)
  - ng-023
  - first-boot-surface-fresh

## Next Phase Readiness

The baseline is recorded before any fix plan, so 39-02 (C11 tracer) can start. C11 and 999.5/6/11/13/14/15/16 were not red in the full run, and each owning plan must prove its own scenario.

## Self-Check: PASSED

- FOUND: scripts/lib/pb-kwin.mjs, .planning/phases/39-v1-5-close-out/39-BASELINE.md, .planning/phases/34-tab-strip/34-UAT.md
- FOUND commits: e5593190, 2c730f40, 3fd36bb5, 04938fcd, 1bf81c89, 77d5810e (all ancestors of HEAD)
- Task 1 verify: `34-UAT ok 15 partial`; tracked-dirt check passes
- Task 2 verify: self-test PASS, `--quick` PASS, registry row present, `C24 verdict:` line present, brand scan PASS
- Task 3 verify: `baseline ok 40`; no file under `${TMPDIR}/pb-39-baseline/` is tracked
