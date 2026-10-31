---
phase: 49-release-pipeline-and-legion-runner-e
plan: 02
subsystem: release-pipeline
status: partial
partial_reason: "Task 3 (checkpoint:human-action, legion runner registration and NixOS change) is owner-pending; see BLOCKED.md section 49-02 Task 3"
tags: [release, legion, runner, pre-job-hook, sec-10, sec-08]
requires:
  - 49-01 (release.yml build-linux gates, the release-shape row)
provides:
  - scripts/legion-pre-job-hook.sh: the tracked ACTIONS_RUNNER_HOOK_JOB_STARTED target (release triple only)
  - scripts/verify-hook-refusal.mjs: the hook-refusal row (refusal table plus legion-job placement)
  - hook-refusal and hook-refusal-self-test quick rows in scripts/verify-platform.sh
  - docs/RELEASING.md runner section: non-ephemeral shape, one-time registration token, pb-runner user, registration precondition, GH-11 rule
affects:
  - 49-02 Task 3 (owner): registration, NixOS change, live repo-controls read
  - 49-04, 49-05: unchanged by this plan
key-files:
  created:
    - scripts/legion-pre-job-hook.sh
    - scripts/verify-hook-refusal.mjs
  modified:
    - scripts/verify-platform.sh
    - docs/RELEASING.md
    - inventory/brand-tokens.json
    - .planning/workstreams/deploy/phases/49-release-pipeline-and-legion-runner-e/BLOCKED.md
decisions:
  - "The expected repo is derived from configuration.toml [urls] release_notes (https://github.com/<owner>/<repo>/releases), so no repo literal lives in the checker. The hook text carries the literal, and the row proves the two agree by running the hook."
  - "The release home is Deocracy/powerbrowser, per the owner ruling of 2026-10-29 recorded in inventory/brand-tokens.json. The plan and 49-RESEARCH.md name DeBIOS-Foundation/powerbrowser; that literal is not used. A DeBIOS-Foundation literal would be the wrong slug under the ruling and would disagree with configuration.toml."
  - "The hook literal is a brand-token occurrence of the owner-ruled release-home slug. Per the inventory rule for new files that name it, the hook is listed by name in that row (count 30 -> 35 across this plan)."
  - "The row executes the hook text under bash with only the three runner variables set, fed on stdin, so the refusal table is proven on the real text and nothing is written. The row is therefore a behavioural check, not a text match."
  - "Placement: the reviewed release.yml puts the main-and-dispatch refusal first, so the full-SHA check is required as the second step of every powerbrowser-release job, before the checkout. The plan wording said first step; the adaptation keeps the reviewed guard first."
  - "The runner shape is non-ephemeral with a one-time registration token. The PAT and the ephemeral setting are gone from every runner-related line of docs/RELEASING.md. The PAT rows for the powerbrowser-updates descriptor (owner-managed, out of this plan) remain."
  - "The runner user is pb-runner with work directory /var/lib/pb-runner (no space). The registration file is /var/lib/secrets/github-runner-registration. The hook is deployed read-only at /etc/pb-runner/legion-pre-job-hook.sh, a byte-identical copy of the tracked file."
metrics:
  tasks: 2
  commits: 2
  duration: "single session"
actuals:
  tokens: 60000
  tasks: 2
  commits: 2
plan_head_before: 69659b44
plan_head_after: 77a32099f25c103c6dade526eef560500b4fb308
---

# Phase 49 Plan 02: legion pre-job hook, hook-refusal row, non-ephemeral runner shape

Partial. Tasks 1 and 2 are committed and green under `scripts/verify-platform.sh --quick`. Task 3, the
owner registration and NixOS change, is recorded as owner steps in BLOCKED.md and has not run.

## Commits

- `37a9b295` feat(49-02): legion pre-job hook and hook-refusal row (SEC-10). Hook, row, self-test, registry rows, inventory row.
- `77a32099` docs(49-02): non-ephemeral runner shape with a one-time registration token (SEC-08). docs/RELEASING.md, inventory count.

## Task 1: hook and hook-refusal row

Hook (`scripts/legion-pre-job-hook.sh`, mode 0755): `set -euo pipefail`, reads `GITHUB_REPOSITORY`,
`GITHUB_WORKFLOW_REF` and `GITHUB_EVENT_NAME` with `${VAR:-}`, three one-line refusals, `exit 0`. No
network, no credential, no write, no `eval`. Each refusal names the expected value on stderr.

Row (`scripts/verify-hook-refusal.mjs`, `hook-refusal`):

1. Derives the expected repo from `configuration.toml` `[urls] release_notes`, giving `Deocracy/powerbrowser`.
2. Runs the hook text under `bash -s` with only the variables of each triple set. The release triple must
   exit 0. A foreign-branch workflow ref, a push event, a wrong repo and an empty triple must each exit
   non-zero and name the expected value.
3. Checks every `powerbrowser-release` job in release.yml: step 1 is the main-and-dispatch refusal, step 2
   is the full-SHA check (`^[0-9a-f]{40}$` with `exit 1`).
4. Requires at least one legion job.

Drill outputs (run in the clone, this session):

```
$ env -i PATH=... GITHUB_REPOSITORY=Deocracy/powerbrowser GITHUB_WORKFLOW_REF='Deocracy/powerbrowser/.github/workflows/release.yml@refs/heads/main' GITHUB_EVENT_NAME=workflow_dispatch bash scripts/legion-pre-job-hook.sh; echo exit=$?
exit=0
$ env -i ... GITHUB_WORKFLOW_REF='Deocracy/powerbrowser/.github/workflows/release.yml@refs/heads/feature' ... bash scripts/legion-pre-job-hook.sh; echo exit=$?
legion pre-job hook: refused, GITHUB_WORKFLOW_REF must be 'Deocracy/powerbrowser/.github/workflows/release.yml@refs/heads/main'
exit=1
$ node scripts/verify-hook-refusal.mjs
hook-refusal: PASS -- scripts/legion-pre-job-hook.sh accepts only the release triple for Deocracy/powerbrowser and refuses a foreign branch ref, a push event, a wrong repo and an empty triple, naming the expected value; 1 powerbrowser-release job(s) start with the main-and-dispatch refusal and carry the full-SHA check second, before any checkout.
$ node scripts/verify-hook-refusal.mjs --self-test
  ok  baseline -> green
  ok  foreign-branch GITHUB_WORKFLOW_REF accepted -> red, naming 'scripts/legion-pre-job-hook.sh', 'GITHUB_WORKFLOW_REF' and 'Deocracy/powerbrowser/.github/workflows/release.yml@refs/heads/feature-branch'
  ok  push event accepted -> red, naming 'scripts/legion-pre-job-hook.sh', 'GITHUB_EVENT_NAME' and 'GITHUB_EVENT_NAME='push''
  ok  wrong repo accepted -> red, naming 'scripts/legion-pre-job-hook.sh', 'GITHUB_REPOSITORY' and 'example/unrelated-repo'
  ok  legion job without the SHA step -> red, naming '.github/workflows/release.yml', 'build-linux' and 'full-SHA'
hook-refusal: --self-test PASS -- the unmodified hook and release.yml are green and 4 planted faults went red naming the file, the variable or job, and the value. It writes nothing: the hook runs on stdin.
```

The four plants are in-memory: the hook text has one refusal line dropped, and the workflow object has the
SHA step removed. Each anchor must match exactly one line, or the self-test errors instead of passing.

## Task 2: runner-shape docs

`docs/RELEASING.md` now declares the non-ephemeral shape everywhere the ephemeral or runner-PAT text
appeared (the plan named one range; the edit covered every runner-related line):

- The build runner is non-ephemeral with label powerbrowser-release; the `build-linux` description is updated.
- The credential is a one-time registration token, minted with `gh api ... registration-token` and written once
  to `/var/lib/secrets/github-runner-registration`, removed once the runner is online.
- The registration precondition: SEC-11, SEC-10 and GH-07, read back by `repo-controls`.
- Runner user `pb-runner` with no read access to `~/.config/powerbrowser-release/` or the registration file,
  work directory `/var/lib/pb-runner`, hook at `/etc/pb-runner/legion-pre-job-hook.sh`.
- The NixOS block is non-ephemeral, with `ACTIONS_RUNNER_HOOK_JOB_STARTED` wired to the hook path and
  the option names flagged for verification before the rebuild.
- The GH-11 rule: the probe outcome decides only whether a runner-group restriction sentence is claimed.
- The host-filesystem table row, the owner-action row and the runner-upkeep and troubleshooting paragraphs
  no longer describe a PAT or an ephemeral runner.

Remaining PAT mentions are the `powerbrowser-updates` descriptor credential (owner-managed, out of this plan).

## Verification

- Baseline before any change: `scripts/verify-platform.sh --quick` exit 0 (PASS).
- After Task 1: `--quick` exit 0 after the inventory row was listed (the brand scan first flagged the hook, see adaptations).
- After Task 2: `--quick` exit 0 (`verify-platform: PASS -- all checks passed`). The `update-channel` row first
  flagged a backticked runner label; the label is plain text now.
- `node scripts/scan-brand-residue.mjs`: PASS over 482 scanned files.
- Live `repo-controls` line: NOT run (Task 3, owner-pending).

## Adaptations and deviations

1. **Release-home slug.** The plan and 49-RESEARCH.md use `DeBIOS-Foundation/powerbrowser`. The owner ruling in
   `inventory/brand-tokens.json` (2026-10-29) and `configuration.toml` name `Deocracy/powerbrowser`. The hook
   and the docs follow the ruling. Both repos exist publicly (read-only `gh repo view`); BLOCKED.md asks the
   owner to confirm the ruling before the registration.
2. **Brand inventory.** The hook names the release-home slug, so the scan required the file in the owner-ruled
   row. The row lists it by name, count 30 -> 34 for the hook, then 34 -> 35 for the registration-token command.
   No new brand row or exclusion was added.
3. **SHA placement.** The plan wording puts the SHA check first. The reviewed release.yml puts the main-and-dispatch
   refusal first, so the row requires the full-SHA check second, before the checkout. The guard is not moved.
4. **Behavioural row.** The plan described a text-and-table check. The row runs the hook under bash (stdin, no file),
   so the refusal table is proven on the deployed text.
5. **Docs scope.** The plan named one line range. The edit covered every runner-related PAT and ephemeral line, so
   the runbook does not contradict itself.
6. **Label in backticks.** A backticked `powerbrowser-release` reads as a MAR channel id to `update-channel`, so
   the label is plain text in the docs.

## Flagged assumptions and open items

- **SEC-10 live half:** the refusal of a live foreign-branch job is proven at the owner's drill (BLOCKED.md step 10),
  not here. The local half is proven by the row.
- **NixOS option names unverified:** no nixpkgs source was on NIX_PATH and the nixos MCP was not reachable from
  this executor. `tokenFile`, `user`, `workDir`, `autoSubUidGidRange`, `environment.etc` mode, and any token-type
  option must be checked before the owner's `nrs`.
- **Token file after registration:** the plan's model assumes the module reads the registration token only at
  configure time. If the unit needs it on a later restart, the owner mints a new one-time token (BLOCKED.md step 9).
- **GH-11 probe outcome:** not recorded in docs/RELEASING.md at this commit (the plan assumed it was). BLOCKED.md step 1.
- **Runner version pair (Open Question 3):** not observed (owner step 11).
- **Hook install path:** `/etc/pb-runner/legion-pre-job-hook.sh` is this plan's choice; the plan did not name it.
  The owner copies the tracked file into `/etc/nixos/pb-runner/` for the `environment.etc` source.

## Self-Check

- Files exist: `scripts/legion-pre-job-hook.sh`, `scripts/verify-hook-refusal.mjs`, `docs/RELEASING.md`,
  `inventory/brand-tokens.json`, `scripts/verify-platform.sh`, `BLOCKED.md` (appended section).
- Commits exist: `37a9b295`, `77a32099` (ancestors of HEAD).
- Status: PASSED for Tasks 1 and 2; Task 3 owner-pending, so the plan is `partial`.
