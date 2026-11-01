# Phase 43 BLOCKED items

Items that need the owner. Each names what is blocked, why, the owner steps, and what
the executor did instead. Plans continue around them where the plan allows.

## 1. The workflow_run wake of the release train is held out

**Settled: B** (clock-only wake stays). Settled by the autonomous run on 2026-10-31 under the
owner's instruction to decide items not needing owner input. REQUIREMENTS.md TRAIN-01 marks the
`workflow_run` clause out of scope for v1.6. No workflow file changes.

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

## 2. Owner prerequisites for the first live bot PR

**Plan:** 43-04 (bump-pr), and the owner checkpoint in 43-05 (not executed in this run).

**What is blocked:** a live `bump-pr` run cannot mint the App token until the owner creates and
installs the bot App and stores its credentials. The workflow reads these, and nothing in the repo
creates them:

- the App installed on the `powerbrowser` repository only, with contents and pull-requests write
  (the App settings file is `.github/settings/app-powerbrowser-bot.json`);
- repository variable `BOT_APP_ID` (the App's numeric id);
- environment secret `BOT_APP_PRIVATE_KEY` in the `bot` environment (the App's PKCS#8 key);
- the `bot` environment itself (`.github/settings/environment-bot.json`), with its reviewer rule.

**Why it matters:** the dry-run path needs none of these and was proven statically. The first live
ESR or Node PR is the calendar exit test in 43-05.

**Owner steps:** create and install the App, set the variable and the secret as above, then dispatch
the train with `dry-run: true` and read the printed would-write lines before a live dispatch.

## 3. Live tracking-issue writer is not wired (skipped piece)

**Plan:** 43-02 Task 1 described the `report` job's find, render, PATCH and comment steps; 43-03
delivered the pure protocol (`findExactlyOne`, `render`, `renderConflict`) with its self-test.

**What is skipped:** the `report` job's live write. It refuses with a candidate and a live run,
rather than leaving the release without a tracking view. Wiring it needs a live state
derivation: the open chore/esr-<tag> PR, its check runs, and the latest published Release. `derive`
is fixture-backed in the workflow, so the writer has no live facts to render from.

**Owner or next-plan decision:** approve the live facts source (read-only `gh` calls in `derive`,
per the workstream's read-only rule), then the writer can be wired to the pure module. Until then,
a live candidate run ends red at `report`, which is the intended failure mode.

