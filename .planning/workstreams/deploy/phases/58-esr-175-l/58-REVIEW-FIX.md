---
phase: 58-esr-175-l
fixed_at: 2026-10-31
review_path: .planning/workstreams/deploy/phases/58-esr-175-l/58-REVIEW.md
iteration: 1
findings_in_scope: 11
fixed: 10
skipped: 1
status: partial
---

# Phase 58: Code Review Fix Report

Source review: `58-REVIEW.md`. Branch `dsh/phase-58`, clone `/home/chris/gsd-workspaces/deploy/dsh/phase-58` (main checkout of the clone). One commit per finding.

## Findings

- WR-01 FIXED 5b9a5a76: `branchTagFailure` and its plant removed (no caller outside the self-test); 58-01-SUMMARY carries the corrected count.
- WR-02 FIXED b11e7372: the uptake view judges the replay job result (`success` for a candidate, `skipped` for none, any other result red whatever stage line it printed); plants for the reviewer's reproduction, `cancelled` and `skipped`.
- WR-03 FIXED 8e7bcda2: `decideUptake` takes the pinned major and turns the lane off when the uptake major is not newer than the pin; plant for the 175-pin case with a newer 175 tag.
- WR-04 FIXED 0db591d5: pin sweep step 8 requires the detector's `uptake-candidate=` print, the Decide allowlist entry and the detect job's output mapping; a plant per link, each red naming its file.
- WR-05 FIXED 84650c83: RELEASING.md states the lane starts on the first 175 `*esr_RELEASE` tag (release day 2027-06-29); the beta start is BLOCKED.md item 3.
- WR-06 FIXED 588a766a: RELEASING.md states the tracking writer is unwired (BLOCKED.md item 1), the view carries only the stage line, and the diff is empty.
- WR-07 FIXED 2f42ff6e: `--upstream` and `--patches` resolve to absolute paths before any `cd`; refusals exit 2 with a named cause; six refusal plants and a relative-path control in `--self-test`; defaults unchanged.
- IN-01 FIXED 8a37d9af: the `uptake-lane` rule forbids a `secrets` key on `uptake-replay`; plant with `secrets: inherit`.
- IN-02 FIXED 66a84517: green control on the real uptake conflict view: it writes nothing under `patches/` and its only failure is the replay's red result.
- IN-03 FIXED d8397eaa: the detect result reaches the view, a failed detect reads as detection failed (never idle), and the uptake step runs under `always()`; plant added.
- IN-04 NOT FIXED owner decision, recorded only in BLOCKED.md item 5 (037f47a3), with the item 1 writer decision.

## Self-test counts after the fixes

- `release-train-logic-self-test`: 9 states set-equal to 9 fixtures, 20 planted faults, 12 controls (was 17 planted, 10 controls).
- `detect-upstreams-self-test`: 12 planted faults, 4 controls (was 11 planted).
- `verify-upstream-pins-self-test`: 14 planted faults (8 pin, 3 uptake-source, 3 uptake-link).
- `apply-patches-self-test`: the three existing PASS lines, then six refusal plants and one relative-path control.
- `workflows-self-test`: one added plant (`uptake-replay` with `secrets: inherit`).

## Verification

Run in the clone's main checkout (not an isolated worktree), so the numbers are reproducible from that tree.

- `workflows`, `workflows-self-test`, `zizmor`, `release-train-logic-self-test`, `detect-upstreams-self-test`, `apply-patches-self-test`, `patches-regenerated-self-test`, `verify-upstream-pins`, `verify-upstream-pins-self-test`: all exit 0, each PASS.
- `scripts/verify-platform.sh --quick`: exit 0, `verify-platform: PASS -- all checks passed`.
- `node scripts/scan-brand-residue.mjs`: exit 0.

## Residual risks (not changed by these fixes)

- WR-03: once the pin is 175, the 153.x tags are refused by the pinned guard and the uptake lane is off, so 153.x security trains have no lane. The dual-major design assumed the pin keeps 153 while the uptake lane runs 175. This needs an owner decision before the flip. The uptake major is still a literal that moves by hand for the next ESR.
- WR-02 and IN-04: a 175 patch conflict now fails the uptake job, so the run turns red each tick until the writer is approved (BLOCKED.md item 5).
