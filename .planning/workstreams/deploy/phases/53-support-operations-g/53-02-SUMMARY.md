# Phase 53 Plan 02: Triage workflow declaration and GH-16 scaffolding - Summary

**The GH-03 triage workflow is declared exactly to the researched shape, its action is admitted by one star pattern, the triage row now reads the declared file, and the Console workspace is recorded as a dated, owner-filled RENEWALS row. Nothing is landed on main.**

## Performance

- **Tasks:** 2 of 2 complete
- **Commits:** `4d24d66` (Task 1: declaration, admission, tree mode, lockfile), `db8c532` (Task 2: RENEWALS row)
- **Gate:** `scripts/verify-platform.sh --quick` exit 0 after both tasks ("verify-platform: PASS -- all checks passed")

## What was built

- **`.github/workflows/triage.yml`** (`4d24d66`): name `Triage new issues`; trigger `issues: [opened]` only; `permissions: contents: read, issues: write`; `concurrency.group: triage`; one job `triage` on `ubuntu-latest` in environment `triage` with `timeout-minutes: 10`.
  - Steps: checkout at `11d5960a326750d5838078e36cf38b85af677262` (v4.4.0) with `persist-credentials: false`; a pinned Claude Code install from a committed lockfile with `npm ci`; `anthropics/claude-code-action@db77d4d3c98f3f6380e7cd45ffba2342a3dbde3c` with `show_full_output: false`, `display_report: false`, `allowed_non_write_users: "*"`, `path_to_claude_code_executable` pointing at the installed binary, `claude_args` carrying `--model claude-haiku-5-5`, `--max-turns 2`, `--tools ""` and a JSON schema (`labels`, `template_id`); and a non-AI post step.
  - The post step reads `structured_output` only through `env:`, drops every label outside the `type/`, `os/`, `format/`, `area/` set in `.github/settings/labels.json`, picks one of three fixed comments by template id, and calls `gh issue edit` and `gh issue comment`. It contains no close operation and no `${{ }}` in its run body.
- **`.github/settings/actions-selected.json`** (`4d24d66`): admission diff is exactly one added line, `"anthropics/claude-code-action@*"`, after the existing cachix entry. Nothing else changed.
- **`.github/triage/claude-code/package.json` and `package-lock.json`** (`4d24d66`): Claude Code pinned at `2.1.304` with integrity hashes. The lockfile is what let the workflow drop an ad-hoc `npm install`, which zizmor's `adhoc-packages` rule flags.
- **`scripts/verify-triage.mjs`** (`4d24d66`): default mode is now `tree`, reading `.github/workflows/triage.yml`. The good fixture stays as the self-test green control.
- **`scripts/verify-workflows.mjs`** (`4d24d66`): one self-test control adjusted. The `issues write on triage.yml` control replaces `triage.yml` and now sets the claude admission aside, because the real admission would otherwise read as unused. No rule was weakened.
- **`docs/RENEWALS.md`** (`db8c532`): one dated row, `Anthropic Console workspace, triage (monthly spend limit)`, last checked `2026-10-31`, expiry `unknown`, action `Confirm ... at the 53-04 checkpoint`. The limit itself is owner-filled and not asserted.

## Verification results

- `node scripts/verify-triage.mjs`: PASS, naming `.github/workflows/triage.yml`, with the planted-instruction proof: a stub `gh` receives only allow-listed label edits and one literal comment, and no close.
- `node scripts/verify-triage.mjs --self-test`: green control, then 21 planted faults, each red naming the file, job and rule. Planted-instruction ok lines: `label filter removed (planted instruction) -> red ... 'close-as-fixed'`, `raw model template id posted (planted instruction) -> red ... 'attacker-template'`, and `control: planted instruction issue -> only the fixed comment and allow-listed labels, no close`. The close-step plant is `close-issue step -> red ... 'closes an issue'`.
- `--only workflows`, `--only workflows-self-test`, `--only zizmor`, `--only zizmor-self-test`, `--only labels`, `--only labels-self-test`, `--only renewals`, `--only renewals-self-test`: each exit 0.
- Full `--quick`: exit 0 after Task 1 and again after Task 2.

## Verification of the carried pins (plan-time re-verification)

- Action commit `db77d4d3c98f3f6380e7cd45ffba2342a3dbde3c` (read-only `gh api`): its commit title is "bump Claude Code to 2.1.304 and Agent SDK to 0.3.304". Its `action.yml` declares every input the workflow uses (`claude_args`, `path_to_claude_code_executable`, `show_full_output`, `display_report`, `allowed_non_write_users`, `github_token`, `anthropic_api_key`, `prompt`) and a `structured_output` output. The action has no `model` input, so the model rides in `claude_args`.
- Claude Code `2.1.304` exists on npm (read-only `npm view`).
- Model id `claude-haiku-5-5` is carried, not checked against the Anthropic model table in this run. It is the first thing the owner's checkpoint drill confirms.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The planted-instruction control could not run under the NixOS login profile**
- Found in the first Task 1 run of the triage row. Fixed in `53-01` (`--noprofile --norc`); recorded here because it bears on the same proof.

**2. [Rule 2 - Missing critical] Ad-hoc package install flagged by zizmor**
- **Found during:** the Task 1 zizmor run: `adhoc-packages` on `npm install ... @anthropic-ai/claude-code@2.1.304`.
- **Fix:** committed a lockfile and changed the step to `npm ci` from it. No suppression was added.

**3. [Rule 1 - Bug] `workflows-self-test` control went red on the real admission**
- **Found during:** the Task 1 workflows self-test run. The control that replaces `triage.yml` kept the claude admission, which then looked unused.
- **Fix:** that one control sets the admission aside. The rule itself is unchanged.

### Gaps against the plan (recorded, not hidden)

- **The Console workspace and its limit are not verified.** The RENEWALS row is dated; the limit and the OIDC-or-key outcome are owner-filled at the 53-04 checkpoint. See the BLOCKED entry for that owner action.
- **Federation is not implemented.** The workflow declares the key branch (`anthropic_api_key` from the triage environment). The OIDC branch needs `id-token: write`, which the triage permission rule forbids; the owner records the chosen branch at the checkpoint.
- **`--tools ""` and the JSON-schema shape in `claude_args`** are the carried structured-output form. They are proven by the owner's live planted-issue drill, not by this row.
- **The workflow is not landed on main.** The header says so. Until the owner lands it, no issue is triaged.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model. The triage job holds `issues: write` and `contents: read` only, and no step passes issue text into a shell or a prompt.

## Self-Check: PASSED

- `.github/workflows/triage.yml`, `.github/triage/claude-code/package-lock.json` and `docs/RENEWALS.md` exist in the tree.
- Commits `4d24d66` and `db8c532` are on `dsh/phase-53`.
- The quick gate passed after both commits.
