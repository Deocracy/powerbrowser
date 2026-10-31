# Phase 52 owner items (plans 52-03 and 52-04)

Written by the unattended executor run on 2026-10-31. Everything below needs an owner
action that the executor cannot take: a live GitHub or Anthropic setting, a credential,
or a live dispatch. Nothing here was run, and no live write was made.

## 1. Anthropic Console fixer workspace and monthly limit (FIX-05)

- **What.** A dedicated Anthropic Console workspace for the fixer, separate from triage,
  with a monthly spend limit.
- **Why blocked.** Creating a workspace and setting a payment limit are account actions.
- **Owner steps.** In the Anthropic Console, create the workspace, set the monthly limit,
  and record the limit in `docs/RELEASING.md` under "Fixer spend limits (FIX-05)". Then enter
  the review date in the `docs/RENEWALS.md` row "Anthropic Console fixer workspace".

## 2. Federation rule and repository variables (FIX-12)

- **What.** A GitHub-to-Anthropic workload identity federation rule for the `fixer` path, and
  two repository variables the `fix` job reads.
- **Why blocked.** The rule is created in the Anthropic Console, and the variables need an
  owner's repository settings.
- **Owner steps.** Create the federation rule for `ServerDestroyer/powerbrowser` on the
  `fix` job's identity. Then set the repository variables `ANTHROPIC_FEDERATION_RULE_ID` and
  `ANTHROPIC_ORGANIZATION_ID`. They are variables, not secrets. Until both exist, the `fix`
  job's Claude step cannot authenticate and a live fix run fails there.
- **Fallback.** Only if federation is blocked: an `ANTHROPIC_API_KEY` secret in the `fixer`
  environment, with no `id-token` anywhere. See `docs/RELEASING.md`, "Fixer authentication (FIX-12)".

## 3. Confirm the pinned Claude Code CLI (FIX-08)

- **What.** The `fix` job installs `@anthropic-ai/claude-code` at the exact version 2.1.314
  from a committed lockfile, `.github/fixer/claude-cli/package-lock.json`, with sha512 integrity
  hashes. The version was chosen as the CLI this repository already runs. The lockfile was
  generated from the npm registry's metadata, and the tarballs were not downloaded here.
- **Why an owner check.** The package-install rule requires a human to confirm a package
  before it is trusted. The executor verified the name and version exist and that the
  lockfile pins them, but did not verify the package's contents.
- **Owner steps.** Confirm `@anthropic-ai/claude-code@2.1.314` is the package you intend, and
  that the claude-code-action at `db77d4d3c98f3f6380e7cd45ffba2342a3dbde3c` accepts that CLI.
  The `fix` job's banner check fails closed if the installed version differs.

## 4. Live proof of the chain (FIX-10)

- **What.** A real red `chore/esr-*` PR, dispatched through the fixer, reviewed and merged
  by the owner before the ESR 175 nightly date (2027-05-27).
- **Why blocked.** It needs items 1 and 2, and a live dispatch. No live dispatch was made.
- **Owner steps.** After items 1 and 2: dispatch the release train with `reason=fix` and the
  seven fixer inputs for a real red branch, then confirm the `fix`, `fix-gate` and `fix-pr`
  jobs, the `claude-fix/*` branch and the PR with its labels and assignee.

## 5. Gate stage 7 rejects a clean diff in the gate's worktree (engineering, blocks item 4)

- **What.** In the drill, a docs-only control diff passed stages 1 to 6 and stopped at
  stage 7, `diff-theia-core.sh --quick`, with `yarn check --integrity` reporting an integrity
  mismatch. The same script passes on unmodified HEAD in the checkout it was installed in. The
  gate runs it in the patched worktree that `verify-fix-gate.mjs` builds from a copy of
  `theia/node_modules`. So the real fix-gate job would refuse every diff, which is fail-closed,
  but no fix could ever land.
- **Diagnosis so far.** The copied tree has no absolute symlinks (58 relative ones). Reproducing
  with only `package.json` and `yarn.lock` copied failed for a different reason (no workspace
  packages), so it is not the cause. The cause is still open.
- **Not changed in this run.** The gate's stage 7 and the copy logic are the reviewed 52-01 and
  52-02 surfaces. Changing them needs a reproduction in a worktree that carries the workspace tree.
- **Owner or next-plan step.** Reproduce with `scripts/verify-fix-gate.mjs --diff=<docs-only diff> --tag=<pin>`
  inside `nix develop .#theia`, read the `yarn check` output in the worktree, and fix the copy or
  the stage. Then rerun the drill; the control must pass stage 7 before item 4 can run.

## What was not run

- No `git push`, no workflow dispatch, no `gh api` write, no App token minted, and no
  environment approval. The staged red-branch drill is local and does not push.
- The real `fix-gate` run in CI, which fetches upstream and installs the theia dependencies.
  Its verdict depends on that run.
