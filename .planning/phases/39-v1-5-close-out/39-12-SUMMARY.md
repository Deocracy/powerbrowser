---
phase: 39-v1-5-close-out
plan: 12
subsystem: testing
tags: [new-window-adopt-live, harness, 999.11, PROMPT-05, GUI-01, 36-UAT, kwin, capture]

requires:
  - phase: 39-v1-5-close-out
    provides: "39-07 PB_CAPTURE_DIR capture-hook pattern; 39-01 pb-kwin captureShell"
provides:
  - "999.11: the opener-null plant expects 'window.opener is null' and is re-sited so that string is the failure it causes"
  - "self-test preflight: two plants on one target whose expects contain one another are refused before any session, with its own planted overlap"
  - "scenarios adopt-close (36 T13 WR-03), adopt-blank-write (36 T14 WR-04), adopt-late-ack (36 T15 WR-02), gui01-adopted (36 T12), stock-command-reprobe (36 T16 WR-07), one plant each (two for reprobe)"
  - "PB_CAPTURE_DIR hook in verify-new-window-adopt-live.mjs; captures/36-T17-adopted-tab.png"
  - "36-UAT rows 12-16 pass, row 9 evidence, row 17 capture"
affects: [39-15, 39-19, 39-20]

actuals:
  tokens: 34000
  tasks: 2
  commits: 4
plan_head_before: 3bdb55a0989ac9c8e618ec1f559296444b02ff59
plan_head_after: cc323cf5f897f9d1a89295e70553de4b3f36cac1

tech-stack:
  added: []
  patterns:
    - "A late reply is produced by swallowing the real reply (a window capture listener with stopImmediatePropagation on the response event), so the product's own deadline produces the timeout, not a harness timer"
    - "User-facing copy is checked with the shape regexes read out of verify-shell-error-copy.mjs at run time, plus the command id read from the tree"
    - "Plant expects are checked for overlap per target scenario, derived from the PLANTS table"

key-files:
  created:
    - .planning/phases/39-v1-5-close-out/captures/36-T17-adopted-tab.png
    - .planning/phases/39-v1-5-close-out/39-12-SUMMARY.md
  modified:
    - scripts/verify-new-window-adopt-live.mjs
    - .planning/phases/36-new-window-links-as-web-tabs/36-UAT.md
    - .planning/ROADMAP.md

key-decisions:
  - "999.11 was worse than an ambiguous expect: with 'window.opener is null' the old opener-null plant went red for another reason. Stripping openWindowInfo on the receiver broke the adopt itself ('no web tab attached'), and the 'opener' expect had scored that by accident. The plant is now a noopener open from the page: the adopt lands, and the scenario's own opener read goes red"
  - "The overlap preflight is per target scenario. Read globally it would refuse the existing table ('stock window' on adopt-popup and adopt-fallback; 'opener' within 'opener keeps focus'), whose plants are scored on different scenarios and cannot score each other. The plan forbids changing those expects"
  - "36 T14 has two legs. A literal w.document.write runs document.open, which sets the written document's URL to the opener's URL (HTML spec, Gecko follows it). That page therefore cannot read about:blank. The about:blank label, state none and opener-host identity are asserted on a DOM-written blank window, which is the case the WR-04 fix exists for. The document.write leg asserts it is shown once under the opener's principal and host"

requirements-completed: []  # PROMPT-05 rows are ticked at the milestone close, not per plan

duration: 150 min
completed: 2026-11-06
status: complete
---

# Phase 39 Plan 12: 999.11 and 36 T12-T16 adopt scenarios Summary

**999.11 is fixed: the opener-null plant now goes red on its own failure, and the self-test refuses overlapping plant expects. Five new adopt scenarios cover 36 T12-T16 live, with 14 plants red through the registry. 36-UAT rows 12-16 pass, and the T17 capture is committed for Chris.**

## Performance

- **Duration:** about 150 min
- **Completed:** 2026-11-06
- **Tasks:** 2
- **Files modified:** 4 (one PNG created)

## Accomplishments

- **999.11:** the opener-null expect is `window.opener is null`. The first self-test with that expect exposed the real defect: the plant's adopt never attached, and the plant had only ever passed on incidental "opener" text. The plant was re-sited, and it now goes red with `the adopted tab's window.opener is null`.
- **Overlap preflight:** the self-test checks, per target, that no plant's expect is contained in another's. It also plants an overlap ('opener' on adopt-opener) and requires the check to refuse it.
- **Five scenarios, each with a plant that goes red:**
  - `adopt-close`: `window.close()` removes the tab and its overlay, the opener is reselected, and `w.closed` is true.
  - `adopt-blank-write`: tested in two legs (see decisions).
  - `adopt-late-ack`: the reply is swallowed and the frontend times out. In leg A chrome holds the page and the tab is kept. In leg B the page is in the stock window once and the widget is dropped.
  - `gui01-adopted`: the palette command and a popup window each reach a stock window, the adopted tab stays intact, and the app survives closing them.
  - `stock-command-reprobe`: the command re-probes after a failed first probe. With the channel dead, the copy obeys the no-internals rule. This scenario has two plants.
- **Capture:** `36-T17-adopted-tab.png` was taken in a headed run under the capture lock. It shows only the PowerBrowser window: the adopted tab is current, directly after the strip-opened opener, beside tab B.

## Verification (real output)

- `node scripts/verify-new-window-adopt-live.mjs --scenario adopt-opener,adopt-close,adopt-blank-write,adopt-late-ack`: all four PASS, exit 0.
- `scripts/verify-platform.sh --only new-window-adopt-live`: 12 of 12 scenarios PASS (`new-window-adopt-live: PASS`).
- `scripts/verify-platform.sh --only new-window-adopt-live-self-test`: `PASS -- the clean control is green and all 14 planted faults went red: adopt-append-at-end, reselect-opener-off, opener-null, popup-becomes-tab, background-activates, fallback-off, adopt-javascript, unknown-key-keeps-widget, close-ignored, blank-hidden, late-ack-closes, stock-command-dead, reprobe-off, reprobe-copy-leak`. No "plant expects overlap" line was printed.
- `scripts/verify-platform.sh --quick`: `PASS -- all checks passed`, run before each harness commit.
- The plan's 36-UAT node check printed `36-UAT ok`.

## Task Commits

1. **Task 1:** `7fcde822` test(39-12): 999.11 anchored opener-null expect; adopt-close, adopt-blank-write, adopt-late-ack with plants. Then `77a332d8` docs(39-12): tick backlog 999.11.
2. **Task 2:** `35f344f3` test(39-12): gui01-adopted and stock-command-reprobe with plants; 36-T17 capture. Then `cc323cf5` docs(39-12): 36-UAT rows 12-16 pass from live scenarios, row 9 evidence, row 17 capture.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The opener-null plant did not cause the failure its expect names**
- **Found during:** Task 1, the first self-test after the anchor
- **Issue:** after the expect was anchored, the plant went red on "no web tab attached", because the openWindowInfo strip breaks the adopt.
- **Fix:** the plant now makes a noopener open from the page and returns a stand-in window object. The dead chrome-side strip was removed from the receiver recorder.
- **Commit:** 7fcde822

**2. [Rule 1 - Harness expectation] 36 T14's about:blank label cannot hold for document.write**
- **Issue:** document.open moves the written page to the opener's URL.
- **Fix:** two legs, as recorded in key-decisions. The 36-UAT row 14 evidence states this.
- **Commit:** 7fcde822

**3. [Rule 3] Overlap preflight scoped per target**
- **Issue:** read globally, the check would refuse the existing table, which the plan forbids changing.
- **Fix:** the check is scoped per target scenario, as recorded in key-decisions.

**4. Extra plant `reprobe-copy-leak`**
- The plan asked for one plant per scenario. This second plant on stock-command-reprobe makes the copy check (T-39-31) prove that it goes red.

**Total deviations:** 4. No product code was touched.

## Product fix deferred to main

None from this plan.

## Threat Flags

None. The harness touches the product only in the running session.

## Notes for later plans

- 36 T5 (real middle-click) stays with 39-15. 36 T17 stays `[pending]` for Chris with its capture.
- One headed run was made in this plan (the adopt-order capture, under `/tmp/nix-shell.75PsxP/pb-headed.lock`).
- The ROADMAP 999.11 tick commit (77a332d8) ran the brand scan only, not the full `--quick`. It is a one-line docs change.

## Self-Check: PASSED

- FOUND: scripts/verify-new-window-adopt-live.mjs, .planning/phases/39-v1-5-close-out/captures/36-T17-adopted-tab.png, 36-UAT.md records
- FOUND commits: 7fcde822, 77a332d8, 35f344f3, cc323cf5 (all ancestors of HEAD)
