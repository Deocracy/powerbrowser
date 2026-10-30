---
phase: 42-community-surface-and-release-documentation-a
fixed_at: 2026-10-29
review_path: .planning/workstreams/deploy/phases/42-community-surface-and-release-documentation-a/42-REVIEW.md
iteration: 1
findings_in_scope: 13
fixed: 13
skipped: 0
status: all_fixed
---

# Phase 42: Code Review Fix Report

**Fixed at:** 2026-10-29
**Source review:** .planning/workstreams/deploy/phases/42-community-surface-and-release-documentation-a/42-REVIEW.md
**Iteration:** 1
**Scope:** all (CR/BL/WR and IN), plus the owner decisions recorded in the fix request

**Summary:**
- Findings in scope: 13
- Fixed: 13
- Skipped: 0

Verification: `scripts/verify-platform.sh --quick` exited 0 in the phase-42 clone (the main checkout of branch `dsh/phase-42`, no worktree). Every changed self-test passed in that run: `repo-controls-self-test`, `labels-self-test`, `renewals-self-test`, `community-files-self-test`. `node scripts/scan-brand-residue.mjs` exited 0. The live `repo-controls` gate was run read-only and is red until the owner applies the label set at the 42-04 checkpoint: eight live default labels not declared in labels.json (accessibility, bug, documentation, enhancement, good first issue, help wanted, invalid, question) are extra.

## Fixed Issues

Commits are on `dsh/phase-42`. Each commit lists only the files it changed.

| Finding | Status | Commit | Files |
| --- | --- | --- | --- |
| Owner decision: declare the five gsd:* labels | fixed | 9042a83 | .github/settings/labels.json |
| WR-01: declared label differing only in case gets created then deleted | fixed: requires human verification | 944aeb8 | scripts/verify-repo-controls.mjs |
| WR-02: delete lines are static and fail on rerun | fixed: requires human verification | ab50ddc | scripts/verify-repo-controls.mjs |
| WR-03: label writer scan misses continuations, -l, gh api, github-script | fixed: requires human verification | 1d8131a | scripts/verify-labels.mjs |
| WR-04: GH-14 has no persistent gate | fixed | 166e79e | scripts/verify-community-files.mjs (new), scripts/verify-platform.sh |
| WR-05: addresses and reporting route not live | fixed | 534596e | .planning/workstreams/deploy/phases/42-community-surface-and-release-documentation-a/42-04-PLAN.md, SECURITY.md |
| WR-06: org defaults promise forms and a Security tab | fixed | bd2d790 | org-github/CONTRIBUTING.md, org-github/SECURITY.md |
| WR-07: renewals gate stops at the first non-pipe line, weak dates, no row floor | fixed: requires human verification | 080a6c5 | scripts/verify-renewals.mjs |
| WR-08: RENEWALS says "MAR fallback bucket" | fixed | 90c8180 | docs/RENEWALS.md |
| IN-01: config.yml link check is a substring test | fixed | 230594d | scripts/verify-labels.mjs |
| IN-02: frozen lists have no stated source | fixed | 3081f84 | scripts/verify-labels.mjs |
| IN-03: no GitHub length limits on labels | fixed | 10b631e | scripts/verify-repo-controls.mjs |
| IN-04: public label descriptions name internal automation | fixed | d3f443a | .github/settings/labels.json |
| IN-05: date column mixes expiry and check date; merged App-keys row | fixed | 04fced0 | docs/RENEWALS.md, scripts/verify-renewals.mjs |

WR-01 and WR-02 are two commits because they are two defects in the same plan. The gsd:* declaration (9042a83) is a separate commit that precedes WR-02, so the live-derived delete plan never proposes deleting those labels.

## Applied fixes, by finding

**WR-01.** Label names are compared case-insensitively in the delete filter and in the extra check. Self-test plant: a declared `Bug` over a live `bug` gets no delete line and no "is extra" failure.

**WR-02.** The static delete list and its false comment are removed. `planWrites` reads the live label list through `liveOwnerSteps`, and `labelOwnerSteps` prints `gh label delete` only for live labels that labels.json does not declare. The generic "delete any other live label" line is removed because the derived list covers it. A failed or non-list live read is reported as a plan error, so a dry-run exits 1. Self-test plants: an extra live default gets one delete line, and a label already deleted (absent live) gets none.

**WR-03.** `run:` text has backslash continuations joined before matching. The scan reads `--label x`, `--label=x`, `-l x`, `--add-label x`, `gh api .../labels` with a `labels[]` or `labels` body field, and github-script `addLabels` or `labels: [ ... ]` arrays. The header states what is not read: a label held in a variable. Self-test plants: one per form (8 new plants, plus the existing `--add-label` plant).

**WR-04.** New check `scripts/verify-community-files.mjs`. The set is derived from the tree (root SECURITY.md, CONTRIBUTING.md and CODE_OF_CONDUCT.md when present, every file in `.github/ISSUE_TEMPLATE/` and `org-github/`). It is compared as a set with a committed list in the script header. The header explains why the list is committed: a glob cannot see a deleted file. Each derived file is scanned with the two shape patterns from verify-shell-error-copy.mjs (ALL_CAPS_TOKEN and DOTTED_KEY). That file does not export them, so the patterns are repeated, and the header says so. Two registry rows were added: `community-files` and `community-files-self-test`. The self-test removes one required file in memory, plants one identifier, and adds one unlisted file. All three go red naming the file.

**WR-05.** The 42-04 owner checkpoint has a new step 0. It orders the publish of SECURITY.md, CODE_OF_CONDUCT.md and the org bodies after Phase 47 mail routing delivers a test message to security@ and contact@, and after the 41-04 apply. Steps 1, 2, 4, 5 and 6 may run before the gate. Step 3 may not. Step 2 now describes the delete lines as live-derived. SECURITY.md has one added sentence: "No public release has shipped yet, so there is no older version to report against." The addresses and the five-business-day window are unchanged.

**WR-06.** The org CONTRIBUTING bug and feature steps say to use the form where the repository has one and to open an issue otherwise. The org SECURITY route is the Security tab where the repository provides private vulnerability reporting, and otherwise the address.

**WR-07.** The renewals gate now:
- fails on any line that carries a pipe after the table ends (a blank line inside the table, or a row without its leading pipe);
- fails a separator whose column count differs from the header;
- validates Expiry as blank, `unknown`, a whole bare year, a whole Month YYYY, or a whole ISO date that is a real calendar date;
- validates Last checked as a whole, real ISO date;
- requires every key in a committed REQUIRED_ITEMS list (the DOC-04 family plus every row present when the list was written) to match a row, by case-insensitive prefix. The list is a floor, not a ceiling.

Self-test plants: a blank line inside the table, a row without its leading pipe, 2026-13-45, 2026-02-31, "soon, see the 2026 plan", a non-real last-checked date, a deleted row, and a separator with 3 columns. Two green controls: a Month YYYY expiry and a blank expiry.

**WR-08.** The row reads "Cloudflare R2 object-write token, MAR download bucket (primary origin)". A search of docs, scripts, .github, README and SECURITY found no other "MAR fallback" wording. The DIST-08 text in `.planning` was not changed.

**IN-01.** The security and Discussions contact links must equal exact URLs built from configuration.toml through `repoSlug`. `verify-labels.mjs` now imports `repoSlug` from `verify-repo-controls.mjs`. Self-test plants: a security link on another host and a Discussions link to another repository.

**IN-02.** A comment above the form list names the Phase 42 CONTEXT GH-01 contract as the source of the frozen lists and the TEL-05 prefill that depends on the ids.

**IN-03.** `labelSetFailures` rejects a name over 50 characters or a description over 100, with a plant for each.

**IN-04.** The descriptions of `claude-fix`, `release-train` and `train:blocked` are reworded. The names are unchanged.

**IN-05.** The RENEWALS table has the columns Item, Expiry, Last checked, Owner action, Source. Expiry is blank for no expiry, `unknown` where the tree records none, or a date. The App-keys row is one row per App. The ESR 175 row is one row per train (nightly, beta, release), because each date needs its own Expiry cell under the strict check. The renewals gate reads the new columns. The intro text explains the columns.

## Judgment calls for the owner

- **ESR 175 row.** Split into three rows so each date sits in its own Expiry cell. The row count is 21, up from 18.
- **Root CODE_OF_CONDUCT.md.** Listed as OPTIONAL in verify-community-files.mjs because the file is absent from the tree today. It is published at the 42-04 checkpoint, after the WR-05 gate. Once present it is checked like the other files.
- **SECURITY.md sentence.** It is true today. It becomes stale at the first public release, and the owner should update it then.
- **Community-files self-test.** The deletion is simulated in memory, not on disk, which matches the other self-tests in the registry and writes nothing.
- **Last checked.** Set to 2026-10-29 on every row, the date this register was reconciled.

## Skipped Issues

None.

---

_Fixed: 2026-10-29_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
