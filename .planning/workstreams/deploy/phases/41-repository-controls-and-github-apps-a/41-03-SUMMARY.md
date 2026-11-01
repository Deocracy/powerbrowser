---
phase: 41-repository-controls-and-github-apps-a
plan: 03
subsystem: workflow-trust-boundary
status: complete
tags: [github-actions, workflows, zizmor, sha-pinning, gh-12, gh-08, auto-09, gh-18]
requires:
  - "41-01: .github/settings/actions-selected.json and workflow-permissions.json, the quick registry tail repo-controls-self-test"
  - "41-02: environment-release.json (the drill's environment)"
provides:
  - "scripts/verify-workflows.mjs: quick rows workflows and workflows-self-test (GH-12 rules, GH-08 admission set equality)"
  - "scripts/verify-zizmor.mjs: quick rows zizmor and zizmor-self-test (AUTO-09)"
  - "pkgs.zizmor (1.29.0) in devShells.theia"
  - ".github/workflows/notify-drill.yml in commit ac6c7a2, which adds only that file"
affects: [41-04, 43, 49, 52]
tech-stack:
  added: ["zizmor 1.29.0 (locked nixpkgs, theia shell)"]
  patterns:
    - "workflow rules run over an in-memory file map; every plant mutates YAML text, never the tree"
    - "failures are {file, job, rule, msg} records sorted by all four, so output is deterministic"
    - "zizmor resolved once (PATH, else nix develop <repo>#theia sh -c 'command -v zizmor'), never a SKIP"
key-files:
  created:
    - scripts/verify-workflows.mjs
    - scripts/verify-zizmor.mjs
    - .github/workflows/notify-drill.yml
  modified:
    - scripts/verify-platform.sh
    - flake.nix
decisions:
  - "Workflow-level failures carry job '(workflow)'; settings-file failures carry file .github/settings/actions-selected.json"
  - "The repository default token scope maps 'read' to read-all and 'write' to write-all for effective permissions"
  - "zizmor fixtures live at <mkdtemp>/.github/workflows/<name>.yml: zizmor 1.29.0 collects nothing from a bare directory of YAML files"
  - "The zizmor binary is resolved once per row run through nix develop rather than wrapping each zizmor call, so the self-test enters the shell once"
metrics:
  duration: 9min
  completed: 2026-10-22
  tasks: 3
  files: 5
estimate:
  tokens: 120000
  tasks: 3
actuals:
  tokens: 11097
  tasks: 3
  commits: 4
plan_head_before: 400b906de9e880ed229a86b5e43f8f5fe3709968
plan_head_after: edc58f7e73c566b55830346d9dcfe571b469890a
---

# Phase 41 Plan 03: Workflows and zizmor quick rows, GH-18 drill workflow Summary

The workflow trust boundary is now a commit-time gate. The `workflows` row enforces every GH-12 rule plus GH-08's pinning, admission and set equality against `actions-selected.json`. The `zizmor` row runs zizmor 1.29.0 `--offline` from the theia shell. Both rows are quick, offline and self-tested. The GH-18 drill workflow is in the tree, in a commit that adds only that file, ready for 41-04 to cherry-pick onto `main`.

## What was built

- **`scripts/verify-workflows.mjs`** (rows `workflows`, `workflows-self-test`). It loads js-yaml 4.3.2 from `theia/` through `createRequire`, and reads `.github/workflows/*.y{a,}ml` with readdir. Rules enforced: uses-pinned, uses-admitted, admission-used, no-schedule, runner, legion, claude-code-action, issues-write, workflow-run-guard, workflow-run-chain, write-trio, no-pr-trigger, no-cache and event-text. Effective permissions resolve in this order: job, then workflow, then `workflow-permissions.json`. `write-all`, `read-all` and `{}` are all handled.
  - Tree: `workflows: PASS -- 3 workflow(s), 4 uses: line(s) pinned and admitted, ...`
  - Self-test: 38 plants go red, each naming file, job and rule: 10 for GH-08 and 28 for GH-12. Six green controls pass: the good `release.yml` fixture (build-linux on legion, sign-publish with the write trio), issues write on release-train.yml `report` and on triage.yml, a guarded workflow_run, a hosted read-only claude-code-action, and `read-all` over a write default. The self-test prints 45 `ok` lines.
  - Two consecutive runs print byte-identical output.
- **`scripts/verify-zizmor.mjs`** (rows `zizmor`, `zizmor-self-test`).
  - Tree: `zizmor: PASS -- zizmor 1.29.0 --offline over .github/workflows/: No findings to report. Good job! (8 suppressed)`. The count was 6 suppressed before the drill workflow. The 2 added are auditor-persona findings in notify-drill.yml, below the `regular` persona the row gates on.
  - Self-test: bad.yml exits 14 and names template-injection and unpinned-uses. clean.yml exits 0.
  - With no PATH zizmor and no nix: `zizmor: FAIL -- zizmor is not on PATH and could not be run through nix develop .#theia. Next step: run nix develop .#theia, or install nix` (exit 1).
- **`flake.nix`**: `pkgs.zizmor` in `devShells.theia.nativeBuildInputs`. `nix develop .#theia --command zizmor --version` prints `zizmor 1.29.0`. `flake.lock` is unchanged.
- **`.github/workflows/notify-drill.yml`**: `workflow_dispatch` only, `permissions: {}`, and one `pending-deployment` job on `ubuntu-latest` with `environment: release`, `timeout-minutes: 5` and one echo step. It is green under both rows.

## Drill commit (for 41-04's cherry-pick)

- SHA: `ac6c7a295208933e91d3e40beb4185cb92418b1e`
- `git diff-tree --no-commit-id --name-status -r ac6c7a2`:
  ```
  A	.github/workflows/notify-drill.yml
  ```
- `git rev-list --count HEAD -- .github/workflows/notify-drill.yml` prints `1`. No later commit touches the file.

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | bc80506 | feat(41-03): workflows row with SHA pinning, admission and set equality against actions-selected.json |
| 2 | 223550d | feat(41-03): GH-12 trust rules with effective permissions and a good release.yml fixture |
| 3a | ac6c7a2 | feat(41-03): GH-18 pending-deployment drill workflow |
| 3b | edc58f7 | feat(41-03): zizmor --offline row and self-test, zizmor 1.29.0 in the theia shell |

## Verification

- `scripts/verify-platform.sh --only workflows`, `--only workflows-self-test`, `--only zizmor` and `--only zizmor-self-test` each exit 0.
- `scripts/verify-platform.sh --quick` exits 0 (`verify-platform: PASS -- all checks passed`). That covers verify-upstream-pins and the other workflow sweeps over the new drill file.
- `node scripts/scan-brand-residue.mjs` passes over 402 files with the new files staged. `inventory/brand-tokens.json` is unchanged.

## Deviations from Plan

1. **[Rule 3 - Blocking] The zizmor self-test fixtures sit at `<mkdtemp>/.github/workflows/`.** zizmor 1.29.0 given a bare temp directory holding `bad.yml` exits 3 with "no inputs collected". Each fixture therefore lives at `<mkdtemp>/.github/workflows/<name>.yml`, and the row audits that directory, which is the same input shape as the tree row. The temp roots are still under `os.tmpdir()` and are removed afterwards. Commit edc58f7.
2. **The zizmor binary is resolved once, not wrapped per call.** On ENOENT the plan runs `nix develop ... --command zizmor --offline <dir>` for each audit. The script instead runs `nix develop <repo>#theia --command sh -c 'command -v zizmor'` once and calls the store path directly, so the self-test enters the shell once instead of three times. The fail-closed posture and the message match the plan. Commit edc58f7.
3. **Extra plants beyond the plan's list.** Added a 39-character SHA, `on: schedule` as a string, `on: [push, schedule]` as an array, a `build-x` legion job outside release.yml, `review_comment` event text, issues write through `write-all`, issues write through a write repository default, and `pull_request_target` on release-train.yml. These cover the must_haves edge truths (precision, empty, adjacency, encoding) directly.

No rule was softened or excluded, and the real tree was green under every rule without any workflow change.

## Known Stubs

None.

## Threat Flags

None. The only new trust surface is notify-drill.yml, which is covered by T-41-21.

## Notes for 41-04

- Cherry-pick `ac6c7a2` onto `main`. It adds only `.github/workflows/notify-drill.yml`. The drill needs the `release` environment to exist with its reviewer and `main` branch policy, and those come from the owner's apply.
- `main` will not have the `workflows` or `zizmor` rows until the phase merges. The drill passes both rows here, and adds no `uses:`, so `patterns_allowed` stays `cachix/install-nix-action@*` only.
- Plain `nix develop .#theia` now builds a new shell env (zizmor added). The first `--quick` on a host without zizmor in its store fetches it from cache.nixos.org once. This is the same one-time fetch posture as makensis.

## Requirements

- Marked complete: **GH-12** and **AUTO-09**. Both are fully delivered offline and green on the tree.
- Not marked: **GH-08**. The admission half is delivered, but the requirement also needs the live Actions policy, a read-only default token and zero repo secrets, all applied at 41-04. **GH-18** is also not marked: the drill workflow exists, but the notifications and the phone drill are 41-04's owner checkpoint.

## Self-Check: PASSED
