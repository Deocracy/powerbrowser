# Phase 43 BLOCKED items

Items that need the owner. Each names what is blocked, why, the owner steps, and what
the executor did instead. Plans continue around them where the plan allows.

## 1. The workflow_run wake of the release train is held out

**Plan:** 43-02, Task 1 (the `on:` block of `.github/workflows/release-train.yml`).

**Blocked piece:** the trigger `workflow_run: { workflows: ['Verify static layers'], types: [completed] }`.

**Why:** `zizmor --offline` reports `dangerous-triggers` (high severity, medium confidence) on
any `workflow_run` trigger. The zizmor row fails on exit 14, and the row's own failure text
says never to suppress a finding to make it green. The commit gate (`scripts/verify-platform.sh
--quick`) must stay green, so the trigger cannot be committed as the plan wrote it.

**What was done instead:** the trigger is not in the file. The train starts from
`workflow_dispatch` only (`reason: tick` from the scheduler clock, or `owner`, or `self`). The
guard `github.event.workflow_run.head_repository.full_name == github.repository` and the
conclusion check are already in every job's `if:`, so re-adding the trigger changes nothing
else. The phase goal is "started by the hourly clock, with no owner dispatch", which the clock
path meets. Merges are seen on the next tick instead of immediately.

**Owner decision (one of):**

- **A. Re-add the wake with a reviewed suppression.** Review that the workflow checks out only
  the default ref (`actions/checkout` with no `ref:`, which resolves to the default branch for
  a `workflow_run` event) and that the guard admits same-repository runs only. If you accept
  that, add this to the `on:` block of `.github/workflows/release-train.yml`, above the
  trigger, and keep the rest of the file unchanged:

  ```yaml
    # zizmor: ignore[dangerous-triggers] -- reviewed: same-repository guard, default-ref checkout only
    workflow_run:
      workflows: ['Verify static layers']
      types: [completed]
  ```

  Then run `scripts/verify-platform.sh --only zizmor` and `--only workflows`. Both must stay
  green. Commit with the owner's sign-off recorded in the message.
- **B. Keep the clock-only wake.** Record in REQUIREMENTS.md that TRAIN-01's merge wake is out
  of scope for v1.6. No file change is needed.

**Who decides:** the owner. Nothing in plans 43-03 or 43-04 depends on the choice.
