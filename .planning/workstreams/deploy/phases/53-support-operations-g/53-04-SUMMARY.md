---
phase: 53-support-operations-g
plan: 04
subsystem: docs
tags: [releasing, support-operations, derivation-gate, triage, codeql, fork-approval]
requires:
  - phase: 53-support-operations-g
    provides: triage.yml (53-02), the Codeberg and Upptime rows (53-03), the bug-report row (53-01)
provides:
  - docs/RELEASING.md Support operations section with five DOC-07 subsections and the owner record fields
  - releasing-support-ops and releasing-support-ops-self-test quick rows
affects: [53-04 Task 2 owner checkpoint, 53-04 Task 3 live proof]
actuals:
  tokens: 7790
  tasks: 1
  commits: 1
plan_head_before: a5f93b418e0632bbdb044f9341588594232facf6
plan_head_after: b48941385ba4ebb84fba49c6ca321b2759e0af5b
tech-stack:
  added: []
  patterns: [derive-from-tree doc gate with set equality over workflow files, settings bodies and SECURITY.md]
key-files:
  created: [scripts/verify-releasing-support-ops.mjs]
  modified: [docs/RELEASING.md, scripts/verify-platform.sh]
key-decisions:
  - "The section describes each workflow as one bullet line whose clauses (trigger, job ids, environment, model, template ids) are compared by set equality with the workflow file; the set of workflows that must be described is derived from the issue and discussion triggers plus every workflow the section names."
  - "The section names the repository through urls.release_notes rather than writing the owner out, because the brand inventory pins the literal's occurrence count."
requirements-completed: []
status: partial
---

# Phase 53 Plan 04: Support operations section and derivation row (Task 1 only) Summary

**Task 1 is complete: the DOC-07 support-operations section of `docs/RELEASING.md` and the `releasing-support-ops` row that derives every documented trigger, job id, environment, model and template id from the workflow files. Task 2 (owner checkpoint) and Task 3 (live-green proof) were not executed, so no requirement in this plan is marked complete.**

## Performance

- **Tasks:** 1 of 3 executed. Task 2 and Task 3 are not executed, by instruction.
- **Commit:** `b4894138` feat(53-04): support-operations section and the releasing-support-ops row
- **Date:** 2026-10-31

## What was built

- **`docs/RELEASING.md`, "Support operations"** (before the Verification map): one subsection each for Issue triage, Discussions moderation, Private vulnerability reports, CodeQL alerts after each rebase and Fork pull request approval, plus a "Support operations owner record" whose five fields are TODO for the owner. Two workflow bullets (`triage.yml`, `notify-drill.yml`) carry the trigger, job ids, environment, model and template ids as inline code. The private-reports subsection quotes the SECURITY.md acknowledgement sentence ("We acknowledge your report within 5 business days.") verbatim. A `releasing-support-ops` row was added to the Verification map.
- **`scripts/verify-releasing-support-ops.mjs`**: derives, at check time, from `.github/workflows/*.yml` (js-yaml from `theia/`; template ids from the workflow's fixed-comment table, model from its `--model` argument), `.github/settings/` (private-reporting flag, Discussions flag, code-scanning state and languages, fork approval policy) and SECURITY.md (the window sentence), and compares each with the section as set equality both ways. SECURITY.md absent fails closed naming the file. Failure lines name the drift and end in a next step with no internal identifier.
- **`scripts/verify-platform.sh`**: quick rows `releasing-support-ops` and `releasing-support-ops-self-test` with the Phase 53 comment convention (text reads and js-yaml only; no network, gh or build).

## Verification results

- `node scripts/verify-releasing-support-ops.mjs`: PASS, 26 derived facts agree.
- `node scripts/verify-releasing-support-ops.mjs --self-test`: PASS, 18 `ok` lines: the green control, 16 planted faults each red naming the drift (removed trigger `issues.opened`, renamed job `classify`, deleted template `feature-request`, added template `escalate`, changed environment, changed model, workflow file removed from the tree, missing window sentence, missing moderation rule, missing CodeQL-after-rebase rule, missing fork approval rule, private-reporting flag off while the section says on, changed fork policy, added scanned language, absent SECURITY.md, removed fork subsection), and one control (job ids in another order) that stays green.
- `scripts/verify-platform.sh --only` for `releasing-support-ops`, `releasing-support-ops-self-test`, `repo-controls-self-test` and `workflows`: each PASS. The `workflows` row passing is the FIX-08 debug-posture check on `triage.yml`; no new assertion was added.
- `scripts/verify-platform.sh --quick`, final run on the committed tree: 258 PASS, 6 FAIL. The six reds are the known worktree-environment rows only: `single-copy-deps`, `ng086-theia-react-node`, `gui07-strip-spike-verdict` and its self-test, `gui09-dependent-window-content` and its self-test. `fixer-isolate-self-test` passed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The first draft of the section failed the residual-brand reconciliation**
- **Found during:** the first `--quick` run (`scan-brand-residue` and its self-test red: held-back row `Deocracy/powerbrowser` expected 36, observed 37).
- **Issue:** the intro sentence wrote the owner and repository literal, which the brand inventory counts per occurrence.
- **Fix:** the section now says the repository is the one `urls.release_notes` names in `configuration.toml`. No inventory count was edited.
- **Files modified:** docs/RELEASING.md. Folded into the task commit before it was made.

### Plan items not needing a change

- **`docs/RENEWALS.md` was not edited.** The rows the plan names (Codeberg deploy token, legion mirror; Anthropic key, triage; Anthropic Console workspace, triage) already exist with `unknown` expiry. Their dates are set in Task 3 from the owner reply.
- **No new FIX-08 assertion.** Verified through the existing `workflows` row, as the plan says.

## Not executed

- **Task 2, owner checkpoint (`checkpoint:human-action`, blocking-human):** not executed. The twelve-field reply does not exist. Owner steps, in order:
  1. Land `.github/workflows/triage.yml` on `main` (with the `actions-selected.json` admission); record the main SHA (field 1).
  2. Create the Anthropic triage Console workspace with its own monthly limit; record name, limit, date (field 2). Choose OIDC or a static key stored in the `triage` environment only; record outcome and credential home (field 3).
  3. Create the Upptime status repository from the template, enable Pages, add the `status` CNAME in Cloudflare; record repo, template head, Pages URL (field 4), CNAME target and the live GET status for the updates host, the website and `/events` (field 5). The `/events` target is a named deferral until `[telemetry] endpoint` is declared (BLOCKED.md item 4).
  4. Create the Codeberg account and mirror repository, store the push-only deploy token on legion only (mode 0600, outside the repository); record names and date (field 6). Apply the timer through `/etc/nixos` with `nrs` under `pkexec`; record the apply date, the timer-active line and the equal GitHub and Codeberg main SHAs (field 7).
  5. Phone proofs: configure GitHub Mobile push, then from the second account file one private-report-equivalent (field 8) and send one message to the security mailbox (field 9); record received times and whether each is inside the SECURITY.md window.
  6. Open a test issue from the second account (field 10) and a planted-instruction issue (field 11); record numbers, that only the fixed template comment appeared, that nothing was closed. Record the first mirror push SHA and the three live status GET codes (field 12).
- **Task 3, live-green proof:** not executed. It requires the Task 2 reply. It will fill the TODO fields in RELEASING.md, set the RENEWALS dates, add the checkpoint record subsection, and run `--only repo-controls`, `--only codeberg-mirror-live`, `--only upptime-sweep-live` and `--quick`. Until then GH-16, GH-17, GH-03 (live), GH-04, MON-02 and the live half of TEL-05 are open, and the live rows stay red.

## Known Stubs

None. The five TODO fields in the RELEASING.md owner record are deliberate owner-filled fields for Task 2 and Task 3, not stubs in code.

## Threat Flags

None. The new script reads text files only and adds no endpoint, auth path or trust-boundary file access.

## Self-Check: PASSED

- scripts/verify-releasing-support-ops.mjs: FOUND
- Commit b4894138: FOUND in HEAD history
- docs/RELEASING.md Support operations section: FOUND
