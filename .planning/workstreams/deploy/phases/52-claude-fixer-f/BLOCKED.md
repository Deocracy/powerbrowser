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

## 5. Gate stage 7 rejects a clean diff in the gate's worktree (RESOLVED in the 52-03/04 review fix)

- **Cause.** `theia/node_modules/.yarn-integrity` records `modulesFolders` that include
  `applications/browser/node_modules`, which is git-ignored, so the gate's `git worktree add` did not create it and
  `yarn check --integrity` failed. Stage 8 would then have failed on the git-ignored build output the `--quick` rows read.
- **Fix.** The gate derives every git-ignored input from the trusted checkout (`git status --ignored`, minus the Gecko build
  outputs `--quick` never reads) and the module folders from `.yarn-integrity`, and copies them into the worktree. The
  fix-gate job prepares the trusted tree the way `verify.yml` does, including `yarn build`. See commit 25ef9364.
- **Proof.** The real gate on a docs-only control passes all eight stages in this clone, with and without `--tag`, and through
  `scripts/fixer-isolate.sh`; a `CLAUDE.md` plant is rejected at `[path]`.

## 6. Live proof of the fixer isolation on ubuntu-latest (owner or next run, after item 4's prerequisites)

- **What.** The fix-gate job runs the gate through `scripts/fixer-isolate.sh`: an unprivileged user namespace when the runner
  allows it, otherwise `sudo -n unshare --net` and `setpriv` back to the runner uid with no_new_privs. Only the first form was
  exercised here (this host allows `unshare -rn`). The sudo form, and the CI preparation step (`generate`, fetch,
  `yarn install`, the drivelist rebuild, `yarn build`), are written from `verify.yml` and the review's guidance but have not run
  on a GitHub-hosted runner.
- **Owner step.** On the first live dispatch, read the fix-gate log: the gate must reach stage 8, and the
  `fixer-isolate-self-test` row inside stage 8 must pass by checking the ambient state (it cannot make a second namespace there). If the runner offers neither namespace form the gate fails closed and says so.
- **Also unverified live.** The derive job's run listing (`gh api .../actions/workflows/release-train.yml/runs`) and the
  author lookup for the guard, the `gh run list --workflow <check>.yml --commit` log selection, and `npm ci` plus
  `install.cjs` for the pinned Claude Code CLI. Each was checked against the reviewer's reproduction or by shape only.

## What was not run

- No `git push`, no workflow dispatch, no `gh api` write, no App token minted, and no
  environment approval. The staged red-branch drill is local and does not push.
- The real `fix-gate` run in CI, which fetches upstream and installs the theia dependencies.
  Its verdict depends on that run.
