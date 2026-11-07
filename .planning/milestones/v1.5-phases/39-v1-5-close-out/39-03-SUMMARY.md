---
phase: 39-v1-5-close-out
plan: 03
subsystem: owner-decisions
status: complete
tags: [owner-decisions, uat, oq1, ui-spec, claude-md, batch-a]
requires:
  - phase: 39-01
    provides: baseline and the owner-row list in 39-RESEARCH
provides:
  - OQ1 ruling on 37-UAT rows 8 and 9 (owner line starting OQ1:) for plan 39-10
  - owner lines on 32 T3/T8-T11, 33 T7, 36 T18, 37 T34-T41, 38 T31-T40
  - 33-UI-SPEC amended to the shipped values (300 ms submenu delay, failure copy, Settings, Reset Zoom)
  - 37-UI-SPEC bar copy rows set to the shipped copy
  - CLAUDE.md hard rule 5 route span replaced with the 36-02-SUMMARY Deferred item 1 text
  - Deferred Follow-Ups entries in 32, 37 and 38 UAT for plan 39-18
affects: [39-10, 39-14, 39-16, 39-17, 39-18, 39-19]
actuals:
  tokens: 3300
  tasks: 3
  commits: 2
plan_head_before: 95eb2e9efd3f33d589472d661f400981b612a294
plan_head_after: ab61e2a9c30124d3e96ede5b714cb5c2706125f5
commits: 2
tech-stack:
  added: []
  patterns:
    - "Owner rulings recorded as owner: \"Chris <date> via AskUserQuestion: <box>, <answer>. <row ruling>\" under each row"
key-files:
  created: []
  modified:
    - .planning/phases/32-page-tools/32-UAT.md
    - .planning/phases/33-bookmarks-history-and-the-full-menu/33-UAT.md
    - .planning/phases/33-bookmarks-history-and-the-full-menu/33-UI-SPEC.md
    - .planning/phases/36-new-window-links-as-web-tabs/36-UAT.md
    - .planning/phases/37-permission-prompts-and-dialogs/37-UAT.md
    - .planning/phases/37-permission-prompts-and-dialogs/37-UI-SPEC.md
    - .planning/phases/38-webextensions/38-UAT.md
    - CLAUDE.md
key-decisions:
  - "OQ1 (Chris 2026-11-05): prompts-live expresses dialog and dialog-probe as a derived scenario skip printed SKIPPED (PROMPT-03 deferred, 999.3), derived from the REQUIREMENTS.md deferral record, plus a WINDOWS.md ledger row; plan 39-10 implements it"
  - "38 T31 keeps result [pending] with its owner line: plan 39-14 records that row's result (pass with ext10-fill evidence, or pending on the A5-fail path)"
  - "Requirements EXT-05..EXT-10 in the plan frontmatter are not ticked: this plan records decisions, not live evidence (39-RESEARCH OQ5 ticking rule)"
requirements-completed: []
duration: 10 min
completed: 2026-11-06
---

# Phase 39 Plan 03: Owner-decision batch A Summary

Chris's batch A answers (OQ1 plus boxes 32, 33, 36 on 2026-11-05; boxes 37 and 38 on 2026-11-06) are recorded verbatim on 26 UAT rows. 33-UI-SPEC and 37-UI-SPEC now match the shipped values, and CLAUDE.md hard rule 5's route span carries the approved 36-02-SUMMARY text.

## Performance

- Duration: about 10 min of execution (2026-11-06T14:53Z to 15:03Z); the answers were collected earlier by the orchestrator
- Tasks: 3 of 3 (Tasks 1 and 2 were resolved by the orchestrator's AskUserQuestion boxes; Task 3 recorded them)
- Files modified: 8

## Owner answers, verbatim

Each box offered "Accept all (Recommended)" against an override option. Chris chose the recommended option in every box.

**Batch A1, 2026-11-05**

- **Box OQ1** (prompts-live while PROMPT-03 stays deferred to 999.3): "Derived scenario skip (Recommended)". A scenario-level skip printed as `SKIPPED (PROMPT-03 deferred, 999.3)`, derived from the REQUIREMENTS.md deferral record so it stops applying the moment the deferral is removed, plus a WINDOWS.md ledger row; `--gate` goes green by a recorded exclusion. Plan 39-10 implements it.
- **Box 32** (rows T9/T10, T11, T3, T8): "Accept all (Recommended)". T9/T10: accept both verifier overrides and the judgment verdicts. T11: close, delivered by 33-05, PAGE-09 already ticked. T3: keep dock-bar scope as is and log a backlog row. T8: keep PAGE-05 standing and log the packaging follow-up.
- **Box 33** (row T7): "Accept shipped values (Recommended)": accept the shipped values (300 ms submenu delay, Edit placement, Settings command, copy strings) and amend 33-UI-SPEC to match.
- **Box 36** (row T18): "Accept replacement text (Recommended)": replace CLAUDE.md hard rule 5 with the text in 36-02-SUMMARY.md Deferred item 1, verbatim.

**Batch A2, 2026-11-06**

- **Box 37** (rows T34..T41): "Accept all (Recommended)". T34: mark resolved, decided 2026-11-03 (defer PROMPT-03 to 999.3). T35: accept as follow-up. T36 and 38 T37: one ruling for both, accept as follow-up. T37: confirm intended. T38: accept the shipped copy; amend 37-UI-SPEC. T39: accept; keep the two backstops on the human checklist. T40: satisfies the rule (cannot answer a pending prompt; origin echo checked). T41 and 38 T38: accept all info findings as follow-ups.
- **Box 38** (rows T31..T40 except T37/T38): "Accept all (Recommended)". T31: already decided (b), build the Vaultwarden mode (plan 39-14). T32: keep the leading slot with pill-text shift; log the trailing-slot move as a backlog row. T33: defer to the bridge milestone (38-05). T34: accept the rejection. T35: accept. T36: accept the refusal. T39: accept. T40: accept.

## Accomplishments

- **Rows recorded.** Each answered row has an `owner: "Chris <date> via AskUserQuestion: ..."` line.
  - 32: T9, T10 and T11 are pass. T3 and T8 stay `[pending]` for their visual and hand-started-audio halves (plan 39-16).
  - 33: T7 stays `[pending]` for its visual half.
  - 36: T18 is pass.
  - 37: T34 to T41 are pass. T34's evidence reads "resolved 2026-11-03". T39 notes that its two backstops stay on the human checklist (plan 39-19).
  - 38: T32 to T40 are pass. T31 stays `[pending]` (see Deviations).
- **OQ1** is on 37-UAT rows 8 and 9 as an owner line whose ruling starts `OQ1:`. Both rows keep `result: skipped`; plan 39-10 records their outcome.
- **Summary counts** recomputed from the rows:

  | UAT | Passed | Pending | Skipped | Total |
  |-----|--------|---------|---------|-------|
  | 32 | 3 | 8 | 0 | 11 |
  | 33 | 5 | 2 | 0 | 7 |
  | 36 | 11 | 7 | 0 | 18 |
  | 37 | 21 | 15 | 5 | 41 |
  | 38 | 33 | 14 | 0 | 47 |

- **33-UI-SPEC** now matches the shipped values:
  - The submenu hover delay is 300 ms, stock Lumino; 200 ms would need an edit to `@lumino/widgets`, which hard rule 1 forbids. This changes the behaviour paragraph, the zero-one-many row and the decisions row.
  - New copy rows for the toolbar read failure ("Press Ctrl+Shift+B twice to try again.") and the History read failure ("Open this menu again to try again.").
  - The Actions rows add Settings and name "Reset Zoom" as the Actions and palette label.
  - Edit placement after Zoom was already in the spec (33-05), so it did not change.
- **37-UI-SPEC** bar rows now carry the shipped copy:
  - Blocked popup: Allow / Dismiss, plus a plural form.
  - A new redirect-only row: "{App} stopped this page from sending you to another page." with Dismiss.
  - Protocol handler: "Allow {host} to open {scheme} links?" with Add / Don't allow.
  - Source: `theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts:77-86,360`.
- **CLAUDE.md hard rule 5.** The span "It opens via `window.open(url, '_blank')` ... so `BROWSER_CHROME_URL` is stock upstream chrome." is replaced with the 36-02-SUMMARY Deferred item 1 text, verbatim. The bold "No chrome-side command is registered ..." sentence and the rest of rule 5 are unchanged. Nothing else in CLAUDE.md changed.
- **Deferred Follow-Ups** for plan 39-18 to turn into backlog rows:
  - 32 T3: dock-bar favicon and audio mark.
  - 32 T8: libpulse packaging.
  - 37 T35: the sharing indicator opens the site panel.
  - 37 T36 with 38 T37: one getTabSharingState row.
  - 37 T41: IN-01..IN-04.
  - 38 T32: trailing slot.
  - 38 T32: the signed-fixture question.
  - 38 T33: AMO prompt, deferred to the bridge milestone.
  - 38 T38: IN-01..IN-08.

## Task Commits

1. **Task 1: Batch A1** - no commit (checkpoint:decision, answered 2026-11-05 through the orchestrator)
2. **Task 2: Batch A2** - no commit (checkpoint:decision, answered 2026-11-06 through the orchestrator)
3. **Task 3: Record rulings and apply the approved edits**
   - `2c2c8e67` - the 32, 33, 37 and 38 UAT rulings, plus the 33-UI-SPEC and 37-UI-SPEC amendments
   - `ab61e2a9` - CLAUDE.md rule 5, plus 36-UAT row 18

## Deviations from Plan

**1. [Rule 1 - Bug] 38 T31 kept `[pending]` rather than pass**
- **Found during:** Task 3
- **Issue:** The plan lists 38 T31 among the pure owner rows that turn pass on an accepting ruling. But plan 39-14 Task 2 records row 31: pass with ext10-fill evidence, or `[pending]` on its A5-fail path. Its verify fails unless row 31 is pass with ext10-fill evidence. A pass written here would claim the EXT-10 fill before it is proven.
- **Fix:** Row 31 gets the owner line and keeps `result: [pending]`.
- **Commit:** 2c2c8e67

**2. [Rule 2 - Missing] 38 T32's signed-fixture question was not in the box**
- **Issue:** Row 32 also asks whether a signed fixture is required now that the AMO route exists. The batch A recommendation, and therefore the box, covered only the icon placement.
- **Fix:** Row 32 is pass on the placement ruling. The unanswered sub-question is a Deferred Follow-Up naming 38-UAT test 32, so it still reaches an owner.
- **Commit:** 2c2c8e67

**3. Task 3 split into two commits.** The CLAUDE.md edit is its own commit, together with 36-UAT row 18, which records the approval. That lets the rule change be reverted on its own.

**4. Requirements not ticked.** The plan frontmatter lists EXT-05..EXT-10, but this plan adds no live evidence, so `requirements.mark-complete` was not run (39-RESEARCH Open Question 5 ticking rule).

## Known Stubs

None.

## Next Phase Readiness

- **39-10:** read the OQ1 owner line on 37-UAT rows 8 and 9. The ruling is the derived skip plus a WINDOWS.md ledger row.
- **39-14:** row 31 is still `[pending]` with its owner line, ready for the ext10-fill result.
- **39-16:** 32 T3, 32 T8 and 33 T7 keep their visual or audio half `[pending]`.
- **39-17 (batch B) or 39-18:** the 38 T32 signed-fixture question needs an owner answer.
- **39-18:** turn the Deferred Follow-Ups entries in 32, 37 and 38 UAT into backlog rows. No ROADMAP.md or WINDOWS.md edit was made here.
- **39-19:** the human checklist keeps the two 37 T39 backstops (no BiDi DOM assertion on #notification-popup; bars never cover page content).

## Verification

- The plan's automated verify passed:
  - All five UAT files parse (`completeUatSession`), and each one's row count equals its result-line count.
  - The `owner: "Chris .*OQ1:` line is present in 37-UAT.
  - `scripts/verify-platform.sh --quick` reports "PASS -- all checks passed".
- `git show --name-only` on both task commits lists no ROADMAP.md and no WINDOWS.md.
- No gate parses 33-UI-SPEC or 37-UI-SPEC: the scripts/ grep for UI-SPEC readers names 13, 14, 15 and 31 only.

## Self-Check: PASSED
