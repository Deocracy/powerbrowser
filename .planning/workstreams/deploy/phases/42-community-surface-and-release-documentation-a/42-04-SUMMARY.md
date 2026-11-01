---
phase: 42-community-surface-and-release-documentation-a
plan: 04
subsystem: docs
tags: [releasing, secrets-inventory, runner, esr-calendar, runbook]
requires:
  - phase: 42-01..42-03
    provides: labels.json, repo-controls labels row, issue forms, health files, RENEWALS.md, reconciliation record
provides:
  - docs/RELEASING.md secrets inventory with App keys per environment and no descriptor PAT
  - ESR 175 and 153 dates in the schedule posture, 24-hour queued-job cancellation at the offline-runner note
  - legion rebuild runbook (four objdirs of about 14 GB each)
affects: [owner checkpoint (Task 2), Task 3 live-result record]
status: partial
actuals:
  tokens: 1400
  tasks: 1
  commits: 2
plan_head_before: a5f93b418e0632bbdb044f9341588594232facf6
plan_head_after: bef856820adc57e62d60204365e667644e1d177a
key-files:
  modified: [docs/RELEASING.md]
key-decisions:
  - "Phase 42 prose anchors that earlier phases already corrected were verified and left alone, not rewritten."
requirements-completed: []
---

# Phase 42 Plan 04: release documentation corrections (Task 1 only) Summary

Task 1 (DOC-03 and DOC-05 prose by content anchor) is done and committed. Task 2 (owner checkpoint) and Task 3 (record the owner's live results) are NOT executed. The plan is therefore partial; its requirements are not marked complete.

## Task 1: what changed and what was already correct

Located by content anchor, not line number. Several anchors had already been corrected by Phases 41 to 58, so only the gaps were edited.

| Anchor | State found | Action |
|---|---|---|
| Maintenance, Cadence ("One release per ESR point release") | already "roughly every two weeks"; no four-week text anywhere | verified, kept |
| README "ESR rebases" line | already "roughly every two weeks" | verified, kept (README.md not modified) |
| `rebase-upstream.yml` D-77 note | not touched (workflow files out of scope); Schedule posture still states D-77 holds | confirmed holds |
| Schedule posture (ESR 175 dates) | no dates in that section | added nightly 2027-05-27, beta 2027-06-10, release 2027-06-29, 153.27 on 2027-09-07, and the 153 point-release dates, matching the External Gates calendar and `docs/RENEWALS.md` |
| Troubleshooting, "The runner is offline" | "queues forever" | now states GitHub cancels a queued self-hosted job after 24 hours |
| Secrets inventory | descriptor-repository PAT row | replaced by per-environment bot App key rows (`bot`, `release`, `descriptor`), a row stating the descriptor PAT is replaced by the scoped App token, `fixer`/`triage` and Cloudflare Worker rows, and "no PAT, no App key" on the `legion` row; names holders only, no values |
| One-time setup operator table | step to create a fine-grained descriptor PAT | replaced by the App-key and App-id storage step |
| Runner sections (non-ephemeral, registration token, no PAT file) | already the non-ephemeral shape; no `github-runner-pat` or `ephemeral = true` | verified, kept |
| Rulesets and environments (release policy) | already `main`-only branch policy | verified, kept, not changed |
| Runner upkeep | no rebuild procedure | added "Rebuilding legion" runbook: four objdirs of about 14 GB each (about 56 GB plus the 5.6 GB `upstream/` checkout), re-register with a fresh token, no stored PAT or App key, MAR key store restored only from the offline backup |

The live GitHub organisation named in the prose is Deocracy (`Deocracy/powerbrowser`); no `DeBIOS-Foundation` text was introduced in Task 1.

## Commits

- 57a4b351 `docs(42-04): correct release docs secrets inventory, ESR dates, queue cancellation, rebuild runbook`
- bef85682 `docs(42-04): keep the runbook off the MAR channel-id spelling the update-channel row reads`

## Evidence

- Plan's automated greps: `every two weeks` present in both files; no `roughly every four weeks`; `24-hour`, descriptor/App-token line present; no `github-runner-pat`, no `ephemeral = true`, no `four weeks`: all pass.
- `node scripts/scan-brand-residue.mjs`: PASS, no residual brand occurrence in 553 scanned files.
- `scripts/verify-platform.sh --quick`: see Verification below.

## Deviations from Plan

**1. [Rule 1 - Bug] Runbook wording tripped the `update-channel` row**
- **Found during:** first `--quick` run after the first commit.
- **Issue:** my runbook step named the runner label as `powerbrowser-release`, which the `update-channel` row reads as a MAR channel id and compared to the derived `powerbrowser-default`.
- **Fix:** reworded to refer to the runner label without that spelling.
- **Files modified:** docs/RELEASING.md
- **Commit:** bef85682

The plan's own wording says "do not commit"; the orchestrator instruction overrode that and asked for explicit-path `docs(42-04):` commits.

## Not executed

- **Task 2 (blocking-human checkpoint) and Task 3 (record live results): NOT executed.** No live write, no `gh` write, and nothing recorded in RELEASING.md about a `repo-controls: PASS` line, because none exists. The Task 3 acceptance criterion (`grep -q 'repo-controls: PASS' docs/RELEASING.md`) therefore stays open; it must not be satisfied by a paraphrase.

### Owner steps for Task 2 (from the plan), run from a terminal at the worktree root

0. Ordering gate: publish SECURITY.md, CODE_OF_CONDUCT.md and the `org-github/*` bodies only after Phase 47 mail routing has delivered a test message to security@powerbrowser.org and contact@powerbrowser.org, and the 41-04 apply has run so private vulnerability reporting is live. Steps 1, 2, 4, 5 and 6 may run earlier; step 3 may not.
1. Repos (only if Phase 41 has not; record which were skipped): `gh repo create DeBIOS-Foundation/powerbrowser-updates --public` and `gh repo create DeBIOS-Foundation/homebrew-tap --public`, both empty with no README. Note: the plan text names the `DeBIOS-Foundation` organisation, but the settled live organisation is Deocracy (`Deocracy/powerbrowser`, per `configuration.toml`); confirm the owner/org for these two repos before running, since the plan commands predate that.
2. Label set: paste the create-or-update loop from `node scripts/apply-repo-controls.mjs`, then run the printed delete lines, so the live set equals `labels.json`.
3. Org community repo (after the step 0 gate): `gh repo create <org>/.github --public`, open one PR adding `org-github/SECURITY.md`, `CONTRIBUTING.md` and `CODE_OF_CONDUCT.md` as the root files, merge after review. The same org caveat as step 1 applies.
4. Discussions: confirm enabled on the repo; enable in settings if off, before the `config.yml` link ships.
5. Live read: `scripts/verify-platform.sh --only repo-controls`; expect PASS naming the labels control. Quote the line with its date.
6. Form previews: open the new-issue preview URLs for `bug.yml` and `feature.yml` with a sample `version`, `os`, `install_format` triple; confirm prefill and that only the two forms are offered.

Resume signal: "done" with the quoted PASS line, created-versus-skipped repo list and both preview confirmations. Never paste a token into any reply, file or issue.

## Known Stubs

None.

## Threat Flags

None.

## Self-Check: PASSED

- docs/RELEASING.md modified and committed: FOUND
- 57a4b351 and bef85682 are ancestors of HEAD: FOUND
