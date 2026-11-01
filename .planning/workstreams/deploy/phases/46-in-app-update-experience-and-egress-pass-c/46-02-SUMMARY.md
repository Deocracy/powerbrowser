---
phase: 46-in-app-update-experience-and-egress-pass-c
plan: 02
subsystem: theia-frontend
tags: [update-copy, branding-contribution, palette-commands, verify-row]

requires:
  - phase: 46-01 (same phase, wave 1)
    provides: three shell request kinds the client dispatches
provides:
  - Single-site contracted update copy in @powerbrowser/branding
  - Theia update client with notifications, status-bar item, two palette commands
  - update-copy shape row with pref-key self-test and once-per-session fixture
affects: [46-03 (hop asserts the contracted strings by value), shell-request-kinds (client closes the strict equality)]

actuals:
  tokens: 16000
  tasks: 3
  commits: 1

tech-stack:
  added: []
  patterns: [single-site copy contribution, pure transition unit under row self-test]

key-files:
  created: [theia/extensions/branding/src/browser/powerbrowser-update-copy.ts, theia/extensions/tab-uris/src/browser/update-client.ts, scripts/verify-update-copy.mjs]
  modified: [theia/extensions/tab-uris/src/browser/tab-uris-frontend-module.ts, scripts/verify-platform.sh, scripts/verify-shell-request-kinds.mjs]

key-decisions:
  - "All six contracted sentences live once in POWERBROWSER_UPDATE_COPY; the client imports them, never quotes bodies"
  - "Bodies wire affordances in the client (buttons + status bar), not sentence text; the row asserts the wiring"
  - "Once-per-session flag is a pure exported transition, proven by the row's in-memory double-failure fixture"

patterns-established:
  - "Update-copy shape row: derive strings from the contribution, assert naming + no-internals + affordance wiring + enumeration completeness + single-site import"

requirements-completed: [UPD-20, UPD-21, UPD-22, UPD-23, UPD-32]

coverage:
  - id: D1
    description: "Staged update shows the contracted ready string with Restart now/Later plus status-bar item; Restart now restarts into the new version (client half; restart proven in 46-01, landing proven in 46-03)"
    requirement: "UPD-20"
    verification:
      - kind: other
        ref: "node scripts/verify-update-copy.mjs"
        status: pass
      - kind: other
        ref: "theia/node_modules/.bin/tsc -b theia/extensions/tab-uris"
        status: pass
    human_judgment: true
    rationale: "The notification render path needs a live Theia frame to paint; automation proves the strings, wiring and kind dispatch, not the pixels."
  - id: D2
    description: "Read-only app dir shows the contracted cannot-update string (macOS variant present) with Open download page"
    requirement: "UPD-21"
    verification:
      - kind: other
        ref: "node scripts/verify-update-copy.mjs"
        status: pass
    human_judgment: true
    rationale: "The read-only plant is exercised by the 46-03 hop row evidence, not by this row; this row proves the string contract."
  - id: D3
    description: "Failed check shows the contracted could-not-check string with Check again at most once per session"
    requirement: "UPD-22"
    verification:
      - kind: other
        ref: "node scripts/verify-update-copy.mjs --self-test (once-per-session fixture: true/false/true)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Command palette offers PowerBrowser: Restart to Update and PowerBrowser: Check for Updates"
    requirement: "UPD-23"
    verification:
      - kind: other
        ref: "grep registerCommand update-client.ts (2 calls)"
        status: pass
    human_judgment: true
    rationale: "Palette presence needs a live Theia registry read; automation proves registration code, not the palette pixels."
  - id: D5
    description: "update-copy shape row derives the strings and applies the no-internal-identifier shape test with pref-key self-test"
    requirement: "UPD-32"
    verification:
      - kind: other
        ref: "node scripts/verify-update-copy.mjs --self-test"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-10-26
status: complete
---

# Phase 46 Plan 02: Update copy and Theia client Summary

**The contracted update strings live once in branding and the Theia client renders them with notifications, a status-bar item and two palette commands.**

## Performance

- **Duration:** 20 min
- **Started:** 2026-10-26T02:55:00Z
- **Completed:** 2026-10-26T03:15:00Z
- **Tasks:** 3 completed
- **Files modified:** 6

## Accomplishments
- Seven contracted strings in `POWERBROWSER_UPDATE_COPY` (readyTitle/readyBody, cannotUpdateBody, cannotUpdateMacBody, couldNotCheckBody, two command titles), each naming PowerBrowser with no internal identifier.
- `update-client.ts`: `appUpdate` push listener, ready/cannot-update/could-not-check notifications, status-bar item, `appUpdateState` seed, `checkForUpdates`/`restartToUpdate` requests, two palette commands with labels imported from the copy.
- Once-per-session Check again as pure `shouldShowCheckAgain`/`resetCheckAgainOnSuccess`, proven by the row's in-memory double-failure fixture (show, suppress, show-after-success).
- `scripts/verify-update-copy.mjs` + two registry rows: derived strings, naming + no-internals + affordance-wiring assertions, enumeration completeness, single-site import rule, 7-plant self-test.

## Task Commits

Each task was committed atomically:

1. **Task 1: copy + client + wiring** - `ecfb291` (feat)
2. **Task 2: update-copy shape row** - `ecfb291` (feat, same commit)
3. **Task 3: once-per-session proof** - `ecfb291` (feat, via the row's self-test fixture)

**Plan metadata:** `ecfb291` (feat: contracted update copy and Theia update client)

## Files Created/Modified
- `theia/extensions/branding/src/browser/powerbrowser-update-copy.ts` - the single copy site (7 strings, frozen).
- `theia/extensions/tab-uris/src/browser/update-client.ts` - push handling, notifications, status-bar, three-kind requests, two commands, session flag.
- `theia/extensions/tab-uris/src/browser/tab-uris-frontend-module.ts` - static binding of the contribution (D-50).
- `scripts/verify-update-copy.mjs` - shape row + `--self-test` (7 plants + once-per-session fixture).
- `scripts/verify-platform.sh` - two registry rows after shell-request-kinds-self-test.
- `scripts/verify-shell-request-kinds.mjs` - appUpdate push excluded by construction; strict equality restored.

## Decisions Made
- Status-bar fallbacks reworded off body quotes (`this copy cannot update`, `update check failed`) so the plan's no-literal-sentence grep stays 0 while the row's single-site rule stays green.
- Affordance test asserts client wiring (button/status-bar next to the string's use), not sentence-ending text, because the contracted bodies end with plain sentences and the affordances are separate buttons.
- Titles excluded from the literal-slice rule (they necessarily appear via the label import); bodies must never be quoted.

## Deviations from Plan

**[Rule 3 - Missing critical] Brace-matched extraction in the once-per-session fixture** — Found during: Task 3 | Issue: the non-greedy `\{([\s\S]*?)\n\}` regex stopped at the first inner close brace and yielded an unbalanced body (`Unexpected token '{'`) | Fix: brace-matched extraction from the export header | Verification: self-test prints the true/false/true ok line | Commit `ecfb291`

**[Rule 3 - Missing critical] Return-type brace in the extractor** — Found during: Task 3 | Issue: `:\s*{ show... }` return-type annotation captured the type's own brace as the body open (`boolean is not defined`) | Fix: anchor the body open on the last `{` of the header line | Verification: self-test PASS with 7 plants | Commit `ecfb291`

**[Rule 3 - Missing critical] Undeclared @powerbrowser/branding edge in tab-uris manifest** — Found during: post-commit `--quick` sweep | Issue: `theia-build-order` went red: update-client.ts imports `@powerbrowser/branding/...` but tab-uris/package.json declared no such dependency | Fix: declared `@powerbrowser/branding: 0.1.0` (branding already builds before tab-uris in the chain, so the edge points backwards) | Verification: `--only theia-build-order` + self-test PASS, `tsc -b` clean | Commit `f6e4dbc`

**Total deviations:** 3 auto-fixed (Rule 3). **Impact:** none; two are test-harness extraction bugs and one is a missing manifest declaration, all caught by existing gates.

## Self-Check: PASSED

- `grep -c 'is ready to install'` copy = `1`; macOS variant = `1`.
- `grep -c 'registerCommand'` client lines = `2` calls (3 token hits incl. the method definition line).
- Literal-sentence grep in client = `0` (after status-bar reword).
- `update-client` in frontend module >= `1`.
- `node scripts/verify-update-copy.mjs --self-test` PASS (7 plants); row PASS.
- `tsc -b` both extensions exit 0.
