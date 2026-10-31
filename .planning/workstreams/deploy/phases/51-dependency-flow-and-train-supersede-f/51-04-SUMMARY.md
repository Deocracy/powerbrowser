---
phase: 51-dependency-flow-and-train-supersede-f
plan: 04
subsystem: infra
tags: [release-train, maintenance-sweep, renewals, dependabot, codeql, codeberg, dist-05, ups-02]

requires:
  - phase: 48-maintenance-sweep
    provides: scripts/release-train.mjs maintenance half (six rows, transition comment, pinned issue), the sweep job in release-train.yml
  - phase: 42-renewals-register
    provides: docs/RENEWALS.md table (Item, Expiry, Last checked, Owner action, Source)
  - phase: 51-02, 51-03
    provides: dependabot.yml and the security settings bodies; the SUPERSEDED state and the chemspill sentence
provides:
  - seven TRAIN-11 sweep rows (renewals-due, repo-controls, dependabot-prs, dependabot-alerts, codeql-alerts, codeql-push-age, codeberg-mirror)
  - renewals parser (strict YYYY-MM-DD Expiry, UTC day, 30-day red window) and the sweep threshold parser (one RELEASING.md paragraph)
  - sweep self-test controls and red plants for every new boundary, with one-comment and no-data-no-comment cases
  - read-only facts wiring for the sweep (security reads and Codeberg SHA read) with tolerant fallbacks
  - docs/RELEASING.md DIST-05 cadence, revision-bump path, npm-advisory path and single-sourced thresholds
affects: [owner items 13-17 in BLOCKED.md, 51 verification, Phase 53 mirror]

key-files:
  modified:
    - scripts/release-train.mjs
    - scripts/verify-platform.sh
    - .github/workflows/release-train.yml
    - docs/RELEASING.md
    - README.md
    - .planning/workstreams/deploy/phases/51-dependency-flow-and-train-supersede-f/BLOCKED.md

key-decisions:
  - "The sweep's row shape is {name, status, evidence} with green, red and no-data, as the Phase 48 renderer defines it. The plan's {key, state, evidence, since} and ok state were not adopted: renaming would change the six existing rows and the state artifact."
  - "since is not rendered. The state artifact stores statuses only; a since timestamp needs a state-schema change, which no owner ruling asked for. Recorded as an adaptation, not a silent drop."
  - "The maintenance issue comments with an @-mention on a transition into red and never assigns. TRAIN-07 says comment only on red; assignment belongs to the TRAIN-02 release-key issues."
  - "renewals-due reads the Expiry column strictly. A blank cell and unknown are documented absences, not red. Any other non-ISO cell is red and names its line. A second format is a red line, not a second parser."
  - "The thresholds are read from the one RELEASING.md paragraph at run time. No number is copied into the rows or the workflow."
  - "The Codeberg row compares full 40-hex lowercase SHAs only. Any other pair, or an unset vars.CODEBERG_MIRROR, is no-data. The plan's green-with-note is the no-data row: never red, never a comment, with a note naming the Phase 53 mirror."
  - "repo-controls is built and self-tested but not wired to a live read. The read needs Administration read, which BLOCKED.md item 2 did not request. The owner grant is BLOCKED item 13."
  - "UPS-02 was already landed. docs/RENEWALS.md carries a Node 24 end of life row dated 2028-04-30 in the Phase 42 table shape, so no row was appended. A second row would name the item twice and fail the renewals quick row."
  - "The plan's README fix is applied. The rebase-upstream.yml header carries no cadence text and is unchanged."
  - "The chemspill sentence is not duplicated. 51-03's sentence (RELEASING.md, out-of-band section) states the same rule with different wording; 51-04 references it and does not reword it."

requirements-completed: [DIST-05, UPS-02]
requirements-partial: [TRAIN-11]  # rows, boundaries, thresholds and facts wiring land; repo-controls read and Codeberg mirror pending (BLOCKED 13, 16)

duration: not recorded (start-time capture was skipped at executor start)
completed: 2026-10-31
status: partial

commits: 5
plan_head_before: 2df051e4
plan_head_after: 97a9427e010046e37b069e40cdf79005621d52a1

actuals:
  tokens: 60000
  tasks: 2
  commits: 5
---

# Phase 51 Plan 04: TRAIN-11 sweep rows, DIST-05 cadence, UPS-02 row Summary

Seven TRAIN-11 rows land in the Phase 48 sweep with their boundaries and self-test controls. The cadence and advisory text land in the operator manual with the sweep thresholds stated once. The UPS-02 row was already in the register. Two rows are not live: repo-controls waits on an owner grant, and codeberg-mirror waits on Phase 53.

## Missing-premise record

Assertions run against the tree at `2df051e4`:

- `.github/workflows/release-train.yml` and the sweep renderer (`scripts/release-train.mjs`, maintenance half): present. The renderer has six rows, named `name/status/evidence`, with `green` (not `ok`). The plan's `{key, state, evidence, since}` shape is not the tree's shape. The seven rows were added in the tree's shape. See key decisions.
- TRAIN-07 pinned-issue shape: present (`selectPinned`, `nextMaintenance`, one comment per transition into red).
- `docs/RENEWALS.md` in the Phase 42 (DOC-04) shape: present. The file is a five-column table with an Expiry column, and the quick row `renewals` passes on it.
- UPS-02 row: already present as `Node 24 end of life | 2028-04-30` (owner action "Decide the successor Node line before this date", source UPS-02). The plan's verbatim row text (`Node 24 Maintenance end`, three columns) was not appended. Appending would name the item twice.
- `docs/RELEASING.md`: the stale sentence sits at line 1035, not 728 (the file has grown). It read "roughly every four weeks". Replaced.
- `README.md:47` read "roughly every four weeks". Changed to "roughly every two weeks".
- `.github/workflows/rebase-upstream.yml`: header read, no cadence text. Unchanged.
- The chemspill sentence from 51-03 is at RELEASING.md line 1062 with different wording. Referenced, not duplicated.

No premise was missing, so no subtask was stopped.

## Tasks and commits

| Task | Result | Commit |
|---|---|---|
| 1. Premise gate, seven rows, self-test, tri-check | Done, with the shape and `since` adaptations recorded above | `a89a2712` (rows and self-test), `17cfb2a3` (workflow facts), `908fe434` (README part) |
| 2. RELEASING DIST-05 text and thresholds; RENEWALS UPS-02 | DIST-05 done. RENEWALS row already present, not appended | `908fe434` |
| Owner items | BLOCKED.md items 13 to 17 | `377512ec`, `97a9427e` (wording fix) |

## The seven rows

Each row is derived from facts in `deriveMaintenance` (pure). Facts that the sweep does not read are `null`, which renders no-data.

- `renewals-due`: strict `YYYY-MM-DD` Expiry cells at UTC day granularity. Red when `days <= 30`, so exactly 30 is red and 31 is green. Overdue is red. A non-ISO, non-blank, non-`unknown` cell is red and names its line. A table without an Expiry column is red.
- `repo-controls`: `{ok, drift}` facts. No-data today (BLOCKED 13). Red names the drifting control. Never run under `--quick`.
- `dependabot-prs`: red when more than 5 Dependabot PRs are open, or a security PR is more than 7 days old (exactly 7 is green).
- `dependabot-alerts`, `codeql-alerts`: red when the open count is above the RELEASING limit (0).
- `codeql-push-age`: red when the last push to `main` is more than 150 days old (exactly 150 is green). The push time is the committer date of the `main` tip, which is the closest read without an events feed.
- `codeberg-mirror`: full 40-hex SHAs only. Equal is green. Unequal is red. Anything else, including an unset `vars.CODEBERG_MIRROR`, is no-data.

Thresholds are read from the paragraph that begins `Sweep red thresholds:` in `docs/RELEASING.md`. A missing or unreadable number turns every threshold row red (fail closed).

## Workflow wiring

- `maintenance-probe` (bot environment, live tick only) gains a mint scoped to this repository with contents, pull-requests, dependabot-alerts and security-events read. A mint failure leaves its reads empty. The reads: open Dependabot PRs, Dependabot and code-scanning alert counts, the `main` tip date. The Codeberg read runs only when `vars.CODEBERG_MIRROR` is a valid slug.
- `maintenance` (render, no writes) passes `RENEWALS.md` and `RELEASING.md` as `--rawfile` text and the probe outputs into the facts.
- `workflows` and `zizmor` rows pass. The new steps carry the same `!inputs.dry-run` gate as the existing probe steps.
- The render step was run locally against fixture reads. It produced thirteen rows and a valid body, and the `--maintenance` CLI accepted the facts.

## Verification

- `node scripts/release-train.mjs --self-test`: PASS. 18 states set-equal to 18 fixtures, 29 planted faults red naming their drift, 37 controls green. The maintenance half proves 90 cases.
- `scripts/verify-platform.sh --only release-train-maintenance-self-test`: PASS. `--only release-train-logic-self-test`: PASS.
- `--only workflows`: PASS. `--only zizmor`: PASS. `--only renewals`: PASS (the RENEWALS table is unchanged, so no item is named twice).
- Local render of the sweep facts: `renewals-due` red on the MAR `2046` cell (BLOCKED 14), the other six TRAIN-11 rows green or no-data as their inputs dictate.
- Self-test controls cover the boundaries: 30 red and 31 green, overdue red, a bad line named, 7 and 150 exact green, one red row gives exactly one comment, a Codeberg no-data gives no comment, two renders are byte-identical.
- Baseline `--quick` before the plan: `verify-platform: PASS -- all checks passed`, exit 0. Recorded in the session scratchpad at `/home/chris/.claude/projects/-home-chris-gsd-workspaces-deploy-Power-Browser/e2bf9e5f-fe47-474d-9de3-015593d6e72c/scratchpad/baseline-quick.txt`.
- Final `--quick` after this SUMMARY commit: reported in the completion message (exit code and PASS line).

## Owner merge commands

No push, dispatch or apply was run. The owner runs these on the phase branch:

```sh
# One-time reads (no writes): the first daily tick renders the thirteen rows.
gh issue list --label release-train --state open --search 'in:title "release-train: maintenance"'
# Weekly: the one grouped Dependabot PR (security PRs within 7 days of opening).
gh pr list --label dependabot --state open
gh pr merge <dependabot-number> --merge
# Monthly: review, then merge the Renovate Theia group PR (automerge stays off).
gh pr list --search "chore/theia- in:title" --state open
gh pr merge <theia-number> --merge
```

Expect `renewals-due` red on the first tick because of the MAR cell (BLOCKED 14). That is the plan's fail-closed rule, not a sweep fault.

## Deviations from Plan

- Row shape: `{name, status, evidence}` with `green`, not `{key, state, evidence, since}` with `ok`. The existing six rows and the state artifact keep their shape.
- `since` is not rendered (see key decisions).
- No assignment on the maintenance issue (TRAIN-07 comments only).
- `repo-controls` is not wired to a live read (BLOCKED 13).
- UPS-02 row not appended (already present; see missing-premise record).
- The plan's `grep` for `key: 'renewals-due'` and `Node 24 Maintenance end` do not match the tree. The rows are present as `MAINTENANCE_ROW_NAMES` entries and the existing Node 24 row.
- The plan's RELEASING line 728 is line 1035 in this tree.

## Known Stubs

- `scripts/release-train.mjs` `repoControlsRow`: no-data until the owner grant (BLOCKED 13).
- `.github/workflows/release-train.yml` `codeberg` step: no-data until `vars.CODEBERG_MIRROR` is set in Phase 53 (BLOCKED 16).
- `docs/RELEASING.md` sentence "The ESR calendar in External Gates is authoritative for dates." points at a planning heading the operator cannot reach (BLOCKED 15).

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: new read scopes | .github/workflows/release-train.yml | The probe's bot App mint requests dependabot-alerts, security-events, pull-requests and contents read on this repository. The App must hold each grant; no write scope is requested. Covered by BLOCKED 13. |
| threat_flag: new repository variable read | .github/workflows/release-train.yml | `vars.CODEBERG_MIRROR` is read into a public Codeberg URL, validated as `owner/repo` before use. |

## Self-Check

- Commits exist on `dsh/phase-51`: `908fe434`, `a89a2712`, `17cfb2a3`, `377512ec`, `97a9427e`.
- Files exist: `scripts/release-train.mjs`, `scripts/verify-platform.sh`, `.github/workflows/release-train.yml`, `docs/RELEASING.md`, `README.md`, `BLOCKED.md`, this SUMMARY.
- Self-test and the rows named above passed at the commit state recorded above.

## Self-Check: PASSED
