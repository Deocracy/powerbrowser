---
phase: 40-release-identity-esr-pin-and-patch-regeneration-a
plan: 06
subsystem: infra
tags: [update-prefs, langpack, branding-prefs, generate, verify-platform]
status: complete

requires:
  - phase: 40-05
    provides: "exported releaseLinkPrefs(config) and RELEASE_LINK_ANCHOR; endpoint-dispositions-self-test row (the new rows append after it)"
provides:
  - "pref(\"app.update.langpack.enabled\", false); in FIREFOX_BRANDING_BASE_LINES and both tracked branding pref files"
  - "scripts/verify-update-prefs.mjs: exported FORBIDDEN_UPDATE_PREFS, runChecks with rows/textFor overrides, --self-test"
  - "quick rows update-prefs and update-prefs-self-test"
affects: [40-07, 40-08, About dialog click check]

actuals:
  tokens: 5063
  tasks: 2
  commits: 2
plan_head_before: d7771388d065f9e9aad8fe9b34a712a99d50a3bd
plan_head_after: 6dab83939413ebd635da38d980b99518024ccb8b

tech-stack:
  added: []
  patterns:
    - "A gate derives the checked set from the generator's TARGETS rows emitted in memory, never from a hand-kept list or the tracked copies"

key-files:
  created:
    - scripts/verify-update-prefs.mjs
  modified:
    - scripts/generate.mjs
    - powerbrowser/branding/dev/pref/firefox-branding.js
    - powerbrowser/branding/release/pref/firefox-branding.js
    - scripts/verify-platform.sh
    - inventory/brand-tokens.json

key-decisions:
  - "Language-pack updates are off in both variants (app.update.langpack.enabled=false as a base line); the release is en-US only (PKG-09) (UPD-25)"
  - "The five update cadence/prompting prefs are forbidden in branding output by exact name, so they fall through to Gecko's code and manifest defaults (UPD-25)"

patterns-established:
  - "Forbidden-pref rules match the full pref name, never a prefix; the self-test carries an adjacent-name control"

requirements-completed: [UPD-25]

duration: 8min
completed: 2026-10-21
---

# Phase 40 Plan 06: language-pack updates off and update-cadence prefs gated Summary

**`app.update.langpack.enabled=false` ships in both branding variants from the generator. A new quick row emits both `pref/firefox-branding.js` targets in memory and fails if either sets one of the five update cadence/prompting prefs, turns langpack updates back on, or drifts from `releaseLinkPrefs`.**

## Performance

- Duration: about 8 min
- Completed: 2026-10-21
- Tasks: 2 of 2
- Files: 1 created, 5 modified

## Accomplishments

- `FIREFOX_BRANDING_BASE_LINES` gains a one-line UPD-25 reason comment and `pref("app.update.langpack.enabled", false);`, directly after the `RELEASE_LINK_ANCHOR` block. Both tracked branding files were regenerated and copied from `generated/`. `generated-byte-identity` and `generate --check` pass.
- `scripts/verify-update-prefs.mjs` (row `update-prefs`):
  - selects every `TARGETS` row whose `generated` ends in `pref/firefox-branding.js` and emits it with the resolved manifest and its variant
  - fails naming the instrument when no row is found, or when a declared variant has no row
  - prints each variant's update-pref set (`app.update.*`, `app.releaseNotesURL*`) in emission order. Two runs gave byte-identical output.
  - fails naming variant and pref for any exact match in `FORBIDDEN_UPDATE_PREFS` (`app.update.auto`, `app.update.staging.enabled`, `app.update.interval`, `app.update.promptWaitTime`, `app.update.badgeWaitTime`)
  - requires langpack `false`, the four link prefs equal to `releaseLinkPrefs(config)`, and every link value other than `""` and `about:blank` to parse with `new URL()`
  - writes no file
- `--self-test` (row `update-prefs-self-test`) checks a green baseline, then runs 9 plants:
  - each of the five forbidden prefs: `app.update.auto` in dev, `app.update.staging.enabled` in release, the other three alternating
  - langpack set to true in release
  - `app.update.url.manual` set to "not a url"
  - zero emitter rows
  - no release row

  Each plant goes red naming the pref or instrument and the variant, and no failure message contains the checkout path. The control (an added `extensions.update.autoUpdateDefault` line) stays green.

## Task Commits

1. **Task 1: langpack updates off, update-prefs row derived from the generator** -- `06ef248` (feat)
2. **Task 2: update-prefs --self-test** -- `6dab839` (test)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] scan-brand-residue held-back `pref("` count**
- Found during: Task 1 `--quick`
- Issue: the frozen row in `inventory/brand-tokens.json` expected 73 occurrences. The new line adds one per variant, so the scan observed 75.
- Fix: count moved 73 -> 75, with a COUNT MOVED reason naming the upstream key. This follows the 40-05 precedent.
- Files modified: `inventory/brand-tokens.json` (a sixth path in the Task 1 commit)
- Commit: `06ef248`

**Total deviations:** 1 auto-fixed (Rule 3). **Impact:** none on scope. The inventory row exists to count these pref statements.

## Issues Encountered

- At session start the LEDGER hook reported that `scripts/verify-ng-064-update-url.mjs` differs from its locked checksum. This plan only read that file's `PREF` regex and did not modify it. Plan 40-05's SUMMARY attributes the change to plan 40-04. The owner needs to re-lock it.
- Observation, no change made: leaving the cadence prefs unset gives Gecko's code defaults, not the values in upstream's `browser/branding/official/pref/firefox-branding.js`.
  - `app.update.interval` falls back to 21600 (`nsUpdateService.manifest`), which equals official.
  - `app.update.badgeWaitTime` falls back to 345600 (`UpdateListener.sys.mjs:69`), which equals official.
  - `app.update.promptWaitTime` falls back to 43200, i.e. 12 h (`UpdateService.sys.mjs:2337-2340`). Official sets 691200, i.e. 8 days.

  The UPD-25 text and this plan forbid setting the pref, so the gate enforces that. If the owner wants official's 8-day prompt wait, UPD-25 would have to change.

## Verification

- `node scripts/generate.mjs --check`: PASS (55 files).
- `--only generated-byte-identity`, `--only update-prefs`, `--only update-prefs-self-test`: PASS.
- `scripts/verify-platform.sh --quick`: PASS after each task.
- Acceptance greps: the langpack line occurs once in each branding file, and each registry row occurs once (`grep -F`).

## Next Phase Readiness

The second half of ROADMAP Phase 40 criterion 4 is met: a planted `app.update.auto` in generator output turns the update-prefs row red. Ready for 40-07.

## Self-Check: PASSED

- FOUND: scripts/verify-update-prefs.mjs
- FOUND: powerbrowser/branding/dev/pref/firefox-branding.js (langpack line)
- FOUND: powerbrowser/branding/release/pref/firefox-branding.js (langpack line)
- FOUND: 06ef248
- FOUND: 6dab839
