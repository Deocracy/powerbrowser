---
phase: 51-dependency-flow-and-train-supersede-f
plan: 04
review: 51-04-REVIEW.md
fixed_at: 2026-10-31
iteration: 1
findings_in_scope: 14
fixed: 13
not_fixed: 1
status: partial
---

# Plan 51-04 Review Fix Report

Source: `51-04-REVIEW.md` (2 blockers, 7 warnings, 5 info). Commits are on `dsh/phase-51`, in finding order.
Where several findings touched the same workflow region or the same function they share a commit; each commit message lists
the ids it covers.

## Findings

| Finding | Result |
| --- | --- |
| CR-01 | FIXED ddd2238f (BLOCKED item 13 corrected in c11be101) |
| CR-02 | FIXED c59f1b0e (BLOCKED item 13 grants named in c11be101) |
| WR-01 | FIXED 65776c37 |
| WR-02 | FIXED 65776c37 |
| WR-03 | FIXED 1f377cfa |
| WR-04 | FIXED c11be101 (mint scope dropped in ddd2238f) |
| WR-05 | FIXED 304492d8 |
| WR-06 | FIXED 028469a2 |
| WR-07 | FIXED 193d0483 |
| IN-01 | FIXED ddd2238f |
| IN-02 | FIXED ddd2238f |
| IN-03 | FIXED ddd2238f |
| IN-04 | NOT FIXED: owner-set number with an unknown steady state; recorded in BLOCKED item 17 (193d0483) |
| IN-05 | FIXED 1f377cfa (a, b, c) |

## Fixed

### CR-01: a failed security read turned into green or a false red

**Commit:** ddd2238f. **Files:** `.github/workflows/release-train.yml`, `scripts/verify-sweep-reads.mjs` (new),
`scripts/verify-platform.sh`, `scripts/release-train.mjs`.

Each count is now written only when `gh` exited 0 and the slurped body is an array of pages of objects
(`gh api ... --paginate --slurp > file || return 1`, then `jq -e` on the shape). Empty output, a 4xx/5xx and an API error
object write nothing, the facts carry `null`, and the row renders no-data. A successful `[[]]` is a real 0. The shell is
the shipped step text: the new `sweep-reads` row runs the `repo-facts`, `security-reads` and `codeberg` steps under
`bash -e` with a stub `gh` and `curl`, with plants for empty output, a 403 error body, a 5xx page, a failing `gh` that still
prints `[[]]`, an error object with exit 0, non-object pages, and a PR without a date; it also asserts `--paginate --slurp`.
`--self-test` plants 10 faults over the real text (status ignored, shape unchecked or loose, `--slurp` dropped, `main`
hard-coded, unset mirror reported declared, a renamed probe output, an undeclared render env, a removed deferral marker); each
goes red naming its drift. BLOCKED item 13 no longer claims what the old shell did not do.

The harness found one wiring bug in my own first draft (the `codeql-push-ms` job output pointed at the wrong step); the
static output-wiring check caught it before commit.

### CR-02: undeclared `permission-dependabot-alerts`

**Commit:** c59f1b0e. **Files:** `.github/workflows/release-train.yml`, `.github/app-token-inputs.json` (new),
`scripts/verify-workflows.mjs`.

The mint now requests `permission-vulnerability-alerts`. Source of the input names: the `action.yml` of each pinned commit
(`64ab729a...` v3.3.0 used by release.yml, `fee1f7d6...` v2 used by release-train.yml), fetched read-only with
`gh api repos/actions/create-github-app-token/contents/action.yml?ref=<sha>` on 2026-10-31 and recorded per sha, with the fetch
command, in `.github/app-token-inputs.json` (not under `.github/settings/`, where an unreferenced file is refused as an
orphan). New workflows rule `app-token-inputs`: every `permission-*` key of an App-token step must be in its pin's recorded list,
and a pin with no record that requests a permission is red. Two plants (the old wrong name; a pin with no entry). The record is
per sha, so re-pinning the action forces a re-fetch.

### WR-01, WR-02: renewals-due grammar and counts

**Commit:** 65776c37. **Files:** `scripts/verify-renewals.mjs`, `scripts/release-train.mjs`, `docs/RENEWALS.md` (one sentence).

One Expiry grammar: `verify-renewals.mjs` now exports `expiryProblem` and `expiryStartMs` and only rejects arguments when it is
the entry point; the sweep parses with the same function. A bare year or Month YYYY is dated at the start of the period (the
earlier, fail-safe reading, stated in the code and in the RENEWALS preamble), so the 2046 cell is green and a year already
begun is overdue (red). The green evidence reads `N dated item(s) (P known to a year or month only...), none within 30 days or
overdue; U unknown (not date-checked); B with no expiry`. Unknown stays green with the count visible: the plan does not require
dates for `unknown`. The tracked-file control now asserts no bad cell and that the register check reports no Expiry problem.
Plants: a year already begun, a Month YYYY exactly 30 days away.

### WR-03: thresholds in a tracked data file

**Commit:** 1f377cfa. **Files:** `.github/sweep-thresholds.json` (new), `.github/workflows/release-train.yml`,
`scripts/release-train.mjs`, `docs/RELEASING.md`.

The four numbers live in `.github/sweep-thresholds.json`; the render step passes it as `facts.thresholds`. RELEASING.md quotes it
("Sweep red thresholds (the sweep reads them from ..."), and `sweepThresholdDocDrift` compares the quotation to the file: exactly
one paragraph begins with the lead phrase, it cites the file, and its four numbers equal the file's. The hand-kept 5/7/0/150
pin is gone; every boundary control and plant derives its number from the file. Plants: a drifted number, a dropped citation, a
second paragraph with the phrase, a deleted sentence, a missing or negative number in the fact.

### WR-04: repo-controls and the mint scopes

**Commits:** ddd2238f (mint), c11be101 (deferral, BLOCKED). I took the smaller option: `repo-controls` stays no-data with a
named deferral. The row evidence says so, the facts step marks `repoControls: null` with `deferred: repo-controls-live-read
(BLOCKED.md item 13)`, and `sweep-reads` asserts the marker and the null together (and the row evidence is a control). `contents`
is dropped from the App mint (the default branch, last push and Codeberg reads use `github.token`); the three remaining scopes
each carry a comment in the workflow and a row in BLOCKED item 13 with the App-settings label and whether
`app-powerbrowser-bot.json` already declares it. `security_events: read` is not declared there, which is a new owner grant
(recorded; the declaration file was not changed, as the plan forbids widening permissions). The SUMMARY's "partly met" status
for TRAIN-11 stands.

### WR-05: no second comment after a no-data day

**Commit:** 304492d8. `nextMaintenance` stores `red` for a row that reads no-data when the prior stored status was red, so red,
no-data, red posts one comment; an observed green resets it (red, green, red posts two). A control proves both; a plant shows
the lost carry re-commenting.

### WR-06: facts keys equal the keys the rows read

**Commit:** 028469a2. `workflowFactKeys` runs the workflow's jq literal with every variable null (jq decides the keys),
`factKeysRead` records `deriveMaintenance` reads through a Proxy over three fact sets, and `factKeyDrift` compares them as
set equality (21 keys today). Plants: a mistyped key in the workflow, a dead fact, a missing literal. The `PROBE_*` and job
output wiring, the Codeberg step and the reads are covered by the `sweep-reads` row (CR-01).

### WR-07: Cadence paragraph order and the ESR pointer

**Commit:** 193d0483. The new paragraphs now follow the "Each costs one rebase drill" paragraphs, so "Each" refers to releases
again. The ESR calendar sentence points at the ESR rows of `docs/RENEWALS.md` (ships in `docs/`, checked by the sweep). BLOCKED
item 15 records the exact text placed and the one remaining owner choice (a dedicated dated table).

### IN-01, IN-02, IN-03, IN-05

**IN-01 (ddd2238f):** the default branch is read from the repository (`default_branch`), validated, and used by the activity and
Codeberg reads; a rename moves the requests (scenario with `trunk` and `master`).

**IN-02 (ddd2238f):** the last push is the newest push, force push, PR merge or merge-queue merge on that branch from the
repository Activity API (a read-only endpoint, shape checked against a public repository before use), not the head commit's
committer date. The row text says "default branch". A failed or empty activity read writes no push time (no-data).

**IN-03 (ddd2238f):** an unset `vars.CODEBERG_MIRROR` writes nothing (no-data, "no mirror declared"); a declared one always writes
`{configured, codeberg, github}` with a null for a side that could not be read as a full SHA. A declared mirror that did not
answer is red; an unreadable GitHub side is no-data. Plants for both.

**IN-05 (1f377cfa):** (a) a control that PR and alert facts with the thresholds not read are no-data naming the file; (b) a control
that a non-security Dependabot PR far older than the security limit stays green; (c) the facts step reads RENEWALS.md and the
thresholds file through a guarded `jq ... || echo null`, so a missing document is null (its rows no-data) rather than a failed
render that removes the sweep.

## Not fixed

### IN-04: Dependabot alerts at limit 0 may stay red on the Theia lockfile

**Reason:** the limit is an owner-set number and the steady state is unknown until a first live read; changing it, or counting only
alerts with a patch, is a policy decision. Recorded in BLOCKED item 17 for review after the first live tick. No code change.

## Verification

Run in the main clone `/home/chris/gsd-workspaces/deploy/dsh/phase-51` (not a separate worktree): `node scripts/release-train.mjs
--self-test` PASS (110 maintenance cases); `--only workflows`, `workflows-self-test` (128 plants), `zizmor`, `renewals`,
`renewals-self-test`, `release-train-maintenance-self-test`, and the new `sweep-reads` and `sweep-reads-self-test` PASS. The
render step was also executed end to end against the real files (13 rows, `renewals-due` green with the 2046 cell). The full
`scripts/verify-platform.sh --quick` exited 0 (`verify-platform: PASS -- all checks passed`) on the commit before this report.

## Limits

- The Activity API read was shape-checked against a public repository and against the powerbrowser repository's own history;
  no live probe-job run happened (no network writes, no dispatch).
- Logic findings (WR-01 grammar reading, WR-03 threshold flow, WR-05 carry rule) are covered by controls and plants but are
  semantic changes: they warrant a human look at the intended reading before the first live tick.

---

_Fixed: 2026-10-31_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
