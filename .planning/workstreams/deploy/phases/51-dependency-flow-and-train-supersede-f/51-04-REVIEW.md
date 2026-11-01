---
phase: 51-dependency-flow-and-train-supersede-f
plan: 04
reviewed: 2026-10-31T00:00:00Z
depth: deep
range: 2df051e4..b8e668b9
files_reviewed: 6
files_reviewed_list:
  - .github/workflows/release-train.yml
  - scripts/release-train.mjs
  - scripts/verify-platform.sh
  - docs/RELEASING.md
  - docs/RENEWALS.md
  - README.md
findings:
  blocker: 2
  warning: 7
  info: 5
  total: 14
status: issues_found
---

# Plan 51-04 Code Review (TRAIN-11 sweep rows, DIST-05 text)

Baseline checks run: `node scripts/release-train.mjs --self-test` PASS (90 maintenance cases),
`verify-platform.sh --only workflows` PASS, `--only renewals` PASS. The row logic (boundaries 30/31 days,
7 days, 150 days, strict ISO parse, 40-hex compare, byte-stable render, row-level transition comment) is sound
and the Phase 48 hardening did not regress: the probe token is still one repo and read only, the new rows keep
Dependabot PR titles and alert text out of the facts (only numbers and booleans cross the job boundary), the
probe is still gated on `!inputs.dry-run` and the sweep tick, and `maintenance` still runs on a failed probe.

The defects are in the live reads that the self-test never touches: the shell that builds the facts is untested,
and it is where the plan's headline rule ("a failed read is no-data, never green") breaks.

## BLOCKERS

### CR-01: the security reads turn a failed read into GREEN (transport error) or a false RED "3 alerts" (API error)

**File:** `.github/workflows/release-train.yml:673-676` (the `PRS`, `DALERTS`, `CALERTS` lines of step `security-reads`)

**Issue:** each read is `gh api ... --paginate 2>/dev/null | jq -s 'add // [] | length' 2>/dev/null || true`,
followed by a numeric / `[`-prefix guard. `pipefail` plus `|| true` discards gh's exit status but keeps jq's stdout,
and the guard only checks the SHAPE of that stdout, not whether gh succeeded. Two reproduced failure modes
(run locally with the same pipeline):

1. gh prints nothing on stdout (DNS failure, timeout, 5xx with a non-JSON body, proxy error). `jq -s` over empty
   input gives `[]`, then `add` gives null, `// []` gives `[]`, `length` gives `0`. Reproduced: with
   `HTTPS_PROXY` pointing at a dead port, `DALERTS=0`. `dependabot-alerts=0`, `codeql-alerts=0` and
   `dependabot-prs=[]` are written, and the rows render **green** ("0 open Dependabot alert(s)",
   "0 open Dependabot PR(s)"). A transient outage reports a clean bill of health, which is the Phase 48 WR-05
   class this plan was told not to repeat.
2. gh gets an HTTP 4xx and prints the JSON error body to stdout (confirmed against gh 2.103.3: a 401 prints
   `{"message":"Bad credentials","documentation_url":...,"status":"401"}`). `add` of the one-element slurp is that
   object, and `length` of an object is its key count: **3**. Reproduced: `DALERTS=3`, `CALERTS=3`, and the guard
   `[[ $DALERTS =~ ^[0-9]+$ ]]` accepts it. With `dependabot-alerts`/`codeql-alerts` limit 0 this renders RED
   "3 open Dependabot alert(s) against a limit of 0" and posts an owner-mentioning comment. This fires whenever
   the token is empty or short a grant (BLOCKED item 13 expects exactly that state, and CR-02 guarantees it), when
   Dependabot alerts are disabled on the repository (403), or when code scanning has no analysis yet (404). With an
   empty `GH_TOKEN` gh falls back to an unauthenticated request; reproduced: both endpoints answer 401/403 and the
   pipeline yields `3`.

BLOCKED.md item 13 states "dependabot-prs, dependabot-alerts and codeql-alerts render no-data. Nothing turns red
silently." That is false for the shipped shell. The `PRS` read is protected only by accident (jq errors on string
values of the error object); it still goes green on mode 1.

**Failure scenario:** first live tick, the App lacks (or CR-02 never grants) the alerts permission: owner gets a
comment "dependabot-alerts: 3 open Dependabot alert(s)" and "codeql-alerts: 3 open CodeQL alert(s)" for a repo
with none. Later, a GitHub 502 on the daily tick flips a genuinely red alerts row to green and the next real tick
comments again.

**Fix:** require gh success and an array-of-arrays shape before a value is emitted, and let every other case emit
nothing:
```bash
count_of() {  # prints a count only when gh succeeded and every page was an array
  local raw
  raw=$(gh api "$1" --paginate 2>/dev/null) || return 1
  printf '%s' "$raw" | jq -s 'if length > 0 and all(.[]; type == "array") then (map(length) | add) else empty end'
}
DALERTS=$(count_of "repos/${REPO}/dependabot/alerts?state=open&per_page=100" || true)
CALERTS=$(count_of "repos/${REPO}/code-scanning/alerts?state=open&per_page=100" || true)
```
and the same `|| return 1` plus `all(.[]; type=="array")` gate for `PRS` (an empty `[]` must come from a successful
200 page, not from empty stdout). Add a self-test that runs the real step script (extract it, or move it to a
`scripts/` helper) against a stub `gh` that (a) exits 1 with empty stdout, (b) exits 1 with an error JSON object,
(c) succeeds with `[]`, and requires no-data, no-data, 0.

### CR-02: the Dependabot alerts permission is requested under a name the App-token action does not define

**File:** `.github/workflows/release-train.yml:667` (`permission-dependabot-alerts: read`)

**Issue:** `actions/create-github-app-token@fee1f7d6...` declares `permission-vulnerability-alerts`, not
`permission-dependabot-alerts` (checked against that SHA's `action.yml`; the only Dependabot input it declares is
`permission-dependabot-secrets`). The action does not validate input names: `getPermissionsFromInputs` turns every
`INPUT_PERMISSION-*` env var into an installation-token permission key, so it POSTs `dependabot_alerts: read`. The
REST permission key for Dependabot alerts is `vulnerability_alerts`, so GitHub rejects the request (or, if it
ignored the unknown key, issues a token with no alerts read). Either way the token this step mints can never read
`/dependabot/alerts`, no matter what the owner grants in the App settings, and the mint (continue-on-error) fails
silently. The workflows row and zizmor do not look at `permission-*` names. Combined with CR-01 the visible
outcome is a false RED on both alert rows on day one.

**Fix:** use the declared input and pin it with a verifier rule:
```yaml
          permission-vulnerability-alerts: read
          permission-security-events: read
```
and extend `scripts/verify-workflows.mjs` so every `permission-*` key under a `create-github-app-token` step must
appear in that action's `action.yml` input list (or at least in a committed allowlist), so a typo goes red.
BLOCKED.md item 13 must name "Dependabot alerts: Read-only" as the App grant (the UI label), since the owner
cannot find a permission called `dependabot-alerts`.

## WARNINGS

### WR-01: `renewals-due` is red on the first live tick from tracked data, and its own register and quick check call that data valid

**File:** `scripts/release-train.mjs:967-969` (`parseRenewals` bad branch), `docs/RENEWALS.md:31` (`2046`), `scripts/verify-renewals.mjs:40-50` (grammar)

**Issue:** reproduced: `deriveMaintenance` over the tracked files gives
`renewals-due red: docs/RENEWALS.md line 31: MAR signing certificate expiry "2046" is not YYYY-MM-DD`.
The same file's preamble and `verify-renewals.mjs` define a bare year and `Month YYYY` as legitimate Expiry forms,
so the commit gate accepts a cell the sweep then calls malformed. The owner can add such a cell again at any time and
`--quick` stays green while the sweep goes red. The self-test control "the tracked RENEWALS.md parses"
(`release-train.mjs`, control after `renewalsOf`) only looks for the Node 24 row in `dated`; it never asserts
`parsed.bad` is empty, so it cannot go red on this cell. BLOCKED item 14 records the decision; the defect is that
two checks of one file disagree and the control hides it.

**Fix:** pick one grammar for both checks. Cheapest: the sweep treats a bare year and Month YYYY as precision-only
items (counted and named in the green evidence as "N year-precision item(s) not date-checked", or evaluated at their
last day) and keeps red for everything else; or tighten `verify-renewals.mjs` to ISO / blank / `unknown` and fix the
2046 row. Then make the tracked-file control assert `parsed.bad.length === 0`.

### WR-02: `renewals-due` reports green with 12 of 26 items undated, and says nothing about them

**File:** `scripts/release-train.mjs:983` (the green evidence string)

**Issue:** the tracked register has 12 `unknown` expiries (domain, Apple membership, Developer ID certificate, Azure
validation, Cachix, wrangler, R2, Codeberg token, both Anthropic keys, winget, triage workspace) and 7 blank. Once
the 2046 cell is resolved the row reads "6 dated item(s); none within 30 days or overdue", which a reader takes as
"renewals are fine" while the items most likely to lapse are unchecked.

**Fix:** include the count: `${dated} dated, ${unknown} unknown (not date-checked), ${blank} no expiry`. Keep it
green, but make the gap visible in the pinned body.

### WR-03: the thresholds are parsed from a prose paragraph; the "one place" claim is not true and the guard is a hand-kept list

**File:** `scripts/release-train.mjs:978-994` (`parseSweepThresholds`), `docs/RELEASING.md:1039`

**Issue:** (a) A docs edit changes live sweep behaviour with no code review of the sweep: "more than 5" to "more
than 50" loosens `dependabot-prs` the next morning. The only brake is the self-test control that pins the tracked
paragraph to 5/7/0/150, so the numbers now live in three places (the doc, the control, and the plant `expect`
strings such as "limit of 5"), and a legitimate change needs edits in all of them. CLAUDE.md rule "derive from the
tree and compare, do not hand-keep an expectation list" cuts against that control. (b) `find` takes the first
paragraph in a 1,000-line file that contains `Sweep red thresholds:`; a second paragraph earlier in the file quoting
the phrase silently wins. (c) A reword that keeps the numbers but changes a phrase turns four rows red (fail
closed, acceptable, but noisy). The Cadence section also reads worse (see WR-07). No CODEOWNERS covers docs.

**Fix:** move the four numbers to a tracked data file (for example `inventory/sweep-thresholds.json`:
`{"dependabotPrMax":5,"securityPrDays":7,"alertMax":0,"pushAgeDays":150}`), read it with `--rawfile`/`--slurpfile`
in the render step, and have the RELEASING paragraph cite the file (or have `verify-*` assert that the numbers in
the paragraph equal the file, derived at check time, set-equality style). The control then compares doc to file
instead of doc to a literal in code.

### WR-04: `repo-controls` is fixture-only, and the new token goes beyond the plan's "widens no permission"

**File:** `.github/workflows/release-train.yml:817` (`repoControls: null`), plan `51-04-PLAN.md` prohibition 3

**Issue:** the facts field is a hard-coded `null`, so `repo-controls` renders no-data every day in production. It
can only go green or red in the self-test. The plan's must-have is a daily full-tier read-back; BLOCKED 13 records
the missing Administration grant, which is honest, but this means one of the seven TRAIN-11 rows delivers no real
read and TRAIN-11 is not met. Separately, the plan prohibits widening any permission, yet the step adds a second
App-token mint requesting four scopes (contents, pull-requests, vulnerability-alerts, security-events) that the bot
App does not hold today; that is a new owner grant that the plan said this work would not need. Flag it in the
summary as a deviation rather than "also owner-visible, not a blocker".

**Fix:** keep it honest in the SUMMARY (requirement partially met, row inert) and track the follow-up plan that
runs `verify-repo-controls.mjs`. If the least-privilege goal matters, drop `contents: read` from the mint: both
`commits/main` and `git/ref/heads/main` already work with the job's `github.token` (`contents: read`).

### WR-05: a read that flaps to no-data re-comments the same red

**File:** `scripts/release-train.mjs:1264-1267` (`nextMaintenance`)

**Issue:** a comment is posted for any row red now whose stored previous status is not `red`, which includes
`no-data`. With reads that fail transiently (and, after CR-01, correctly become no-data), a genuinely red
`dependabot-alerts` row goes red, no-data, red on consecutive days and the owner is mentioned twice for one
unresolved condition. The mint failure mode (red alerts, then a day of mint failure, then red again) does the same.

**Fix:** carry the last non-no-data status forward in the stored state for the security rows (store `red` when the
row is no-data and the prior was red), or only treat green to red as a transition. Add a plant: red, no-data, red
posts exactly one comment.

### WR-06: nothing ties the facts the workflow builds to the facts the rows read, and nothing tests the shell reads

**File:** `.github/workflows/release-train.yml:803-825`, `scripts/release-train.mjs` self-test

**Issue:** the eight new fact keys are spelled in the workflow's `jq` and again in `deriveMaintenance`. A typo on
either side (`codeqlLastPushMs`, `dependabotPrs`) leaves the row no-data, forever, with a green self-test, because
the self-test passes fixtures straight to `deriveMaintenance`. Likewise `PROBE_*` output names, the `[[ ... ]]`
guards, the Codeberg step and the token wiring have no check at all, which is how CR-01 and CR-02 shipped. The summary
shows a local render only; no live read of any of the five new outputs was ever executed.

**Fix:** add one verifier that (1) parses the keys of the `jq` object in the `Build the facts` step and requires them
to be a superset of the keys `deriveMaintenance` reads (derive the latter by running it over a Proxy that records
property reads), and (2) runs the `security-reads` script body against a stub `gh` as described in CR-01. Register it
as a row, per CLAUDE.md.

### WR-07: the DIST-05 text breaks its own paragraph and points at a heading operators cannot reach

**File:** `docs/RELEASING.md:1035-1048`

**Issue:** the insertion splits the original paragraph. "Each costs one rebase drill ... plus one build per target"
now follows the thresholds paragraph, so "Each" refers to the sweep thresholds, not to releases. "The ESR calendar in
External Gates is authoritative for dates" names a heading that exists only in a planning file (BLOCKED item 15); no
operator can follow it. Both ship in the operator manual.

**Fix:** put the new paragraphs after the existing "Each costs ..." paragraph (or start it "Each release costs"), and
replace "External Gates" with a section that exists in `docs/` (a dated ESR table in RELEASING.md, or the Mozilla
calendar URL) before merge.

## INFO

### IN-01: `main` is hard-coded in the push-age and Codeberg reads
`release-train.yml:677,704`. The `prev` step already resolves the default branch. Read `default_branch` once and use it,
so a default-branch rename does not make `codeql-push-age` and `codeberg-mirror` silently no-data.

### IN-02: "last push" is read as the head commit's committer date
`release-train.yml:677`. A fast-forward of old commits to main leaves an old committer date and trips `codeql-push-age`
red though a push just happened. Use the Events/`pushed_at` of the ref if the six-month rule is about pushes, or word the
row as "head commit age".

### IN-03: a declared Codeberg mirror that stops answering is indistinguishable from "not yet declared"
`release-train.yml:700-707`, `release-train.mjs` `codebergRow`. When `vars.CODEBERG_MIRROR` is set and the read fails, the
row is still no-data with the "until the Phase 53 mirror exists" note. After Phase 53 a deleted or renamed mirror then
hides forever. Emit a distinct note (or red) when the slug is set and the pair is missing.

### IN-04: Dependabot alerts at limit 0 will likely stay red on the Theia lockfile
`docs/RELEASING.md:1039`. Alerts with no available patch cannot be cleared by merging a PR, so `dependabot-alerts` can sit
red indefinitely and train the owner to ignore the comment. Owner-set number; consider counting only alerts with a
patched version, or recording the expected steady state.

### IN-05: smaller test gaps
(a) The `RELEASING_NOT_READ` branch (PR/alert facts present, `releasingText` null) has no case: the `NO_PHASE51` fixture
nulls the counts too, so `NOT_PROBED` fires first. (b) No control that a non-security Dependabot PR older than 7 days
stays green. (c) A missing `docs/RENEWALS.md` or `docs/RELEASING.md` makes `jq --rawfile` fail the whole render step and
removes the sweep, against the Phase 48 WR-03 rule; both files are tracked, so only a rename triggers it, but
`--rawfile` could be replaced by a guarded `cat` that yields null.

---

_Reviewed: 2026-10-31_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
