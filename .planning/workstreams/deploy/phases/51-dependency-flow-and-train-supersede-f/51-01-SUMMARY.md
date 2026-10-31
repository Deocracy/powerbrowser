---
phase: 51-dependency-flow-and-train-supersede-f
plan: 01
subsystem: infra
tags: [renovate, theia, dependency-flow, config-check, quick-row, declarative, dispatch-gated]

requires:
  - phase: 43-release-train-skeleton-and-upstream-bump-automation-a
    provides: .github/workflows/release-train.yml (dispatch inputs reason and dry-run), scripts/release-train.mjs
provides:
  - .github/renovate.json5: declarative Theia inflow config (one grouped theia PR, monaco-editor-core separate, theia_release regex manager, automerge off, licensing post-upgrade hook, scope rule)
  - scripts/verify-renovate-config.mjs: renovate-config quick row with a 30-plant self-test
  - registry rows renovate-config and renovate-config-self-test in scripts/verify-platform.sh
affects: [51-02 to 51-04 (depend on this config and on the chore/theia- prefix), phase-52 FIX-01 fixer class, phase-48 maintenance sweep (dispatch premise)]

actuals:
  tokens: 8998
  tasks: 3
  commits: 1

tech-stack:
  added: []
  patterns:
    - "Config checked as text at quick tier: JSON5 comment stripping with a string-aware scanner, no new dependency"
    - "Theia member set derived from theia/package.json resolutions and matched through the config's own matchers, compared as set equality"
    - "Live theia_release captured by the config's own regex and compared with configuration.toml"

key-files:
  created:
    - .github/renovate.json5
    - scripts/verify-renovate-config.mjs
    - .planning/workstreams/deploy/phases/51-dependency-flow-and-train-supersede-f/BLOCKED.md
    - .planning/workstreams/deploy/phases/51-dependency-flow-and-train-supersede-f/51-01-SUMMARY.md
  modified:
    - scripts/verify-platform.sh

key-decisions:
  - "The dispatch job and the renovatebot admission are not applied: the sweep tick they depend on (Phase 48 plan 03) is not built, and an admission with no using workflow is red under the workflows row"
  - "Non-Theia dependencies are disabled by a scope rule, because branchPrefix is global and Renovate otherwise opens chore/theia-* branches for typescript, react, yarn, node and the nixpkgs input"
  - "nixpkgs is disabled in Renovate, so the Theia PR does not change flake.lock; movement of nixpkgs stays an owner follow-up (research decision 19)"
  - "The group branch renders as chore/theia-theia, and monaco as chore/theia-theia-monaco-editor-core (verified by a local dry run); the version is in the PR title and body, not the branch name"
  - "The verifier is a new script, not an extension of the workflows row, because the workflows row reads workflow YAML only"
  - "Repository config uses managerFilePatterns (slash-regex) and matchPackageNames (regex), because the current Renovate validator migrates fileMatch and rejects executionOrder"

patterns-established:
  - "Renovate config semantics asserted by a quick row, validated against the real validator in a scratch run"

requirements-completed: [AUTO-02]  # declarative half only; dispatch job and live first PR remain owner-gated (BLOCKED.md)

duration: not recorded (start-time capture was skipped at executor start)
completed: 2026-10-31
status: complete
commits: 1
plan_head_before: 69659b446e1c91aa2654dbc59f5b5123f30b9e07
plan_head_after: c50023c8d2f7eacd8deb5728ab8e1a36e8039d21
---

# Phase 51 Plan 01: Renovate Theia inflow, declarative half Summary

Renovate Theia config (one grouped theia PR, monaco-editor-core separate, automerge off) with a derived quick check and two registry rows; the dispatch job and the actions admission are held behind the missing Phase 48 sweep tick.

## Outcome

- Done: `.github/renovate.json5`, `scripts/verify-renovate-config.mjs`, two registry rows, and the research flag F measurement recorded in the config header. Commit `c50023c8` holds the config, the verifier and the rows. This SUMMARY and BLOCKED.md are committed separately.
- Not done (missing premise, see BLOCKED.md item 1): the `renovate-theia` job in `.github/workflows/release-train.yml`, and the `renovatebot/github-action@*` entry in `.github/settings/actions-selected.json`.
- Not done (owner, BLOCKED.md items 2 to 4): Renovate action SHA re-resolution, first live dispatch, merge review. Nothing was pushed, dispatched or applied live.

## Missing premise record

- Present: `.github/workflows/release-train.yml` (Phase 43), `scripts/release-train.mjs`, `scripts/verify-platform.sh` rows `workflows` and `zizmor`.
- Absent: the maintenance sweep renderer (Phase 48 plan 03). `48-03-PLAN.md` exists, there is no `48-03-SUMMARY.md`, and `scripts/` has no sweep or maintenance script. The sweep tick is the dispatch trigger the plan names.
- `release-train.yml` has no `renovate-theia` input and no job. Its dispatch inputs are `reason` (tick, owner, self) and `dry-run`.
- Result: the dispatch job is not applied. The declarative half lands, because it touches no assumed file.

## Measurements (research flag F)

Run under `nix develop .#theia`, on a 16-core host, timed by a sampler that polls `/proc` for peak RSS across the process tree.

| Step | Wall | Peak tree RSS | Disk |
|---|---|---|---|
| Cold `yarn install --ignore-scripts --frozen-lockfile`, empty yarn cache, scratch copy of `theia/` | 26.7 s | 487.9 MiB | `node_modules` 688 MiB, yarn cache 1.24 GiB |
| Warm `yarn install --frozen-lockfile` over the existing `theia/node_modules` | 2.7 s | 394.9 MiB | no change |
| `node scripts/generate-licensing.mjs` (write mode) | 2.1 s | 186.2 MiB | output byte-identical to the tree; `git status` clean |
| `node scripts/generate.mjs --check` | 1.9 s | 158.1 MiB | none; 68 generated files match |

- Chosen values: `runs-on: ubuntu-latest`, `timeout-minutes: 60` (the default). The cold wall is far below the 20-minute threshold that would raise it.
- Flags follow `scripts/smoke-theia.sh`: `--ignore-scripts` and `PUPPETEER_SKIP_DOWNLOAD=1`. The `drivelist` node-gyp rebuild and the browser download are outside the cold figure.
- The first cold attempt used the bare `yarn install --frozen-lockfile` and failed in the puppeteer postinstall, which downloads a Chrome binary from a host this sandbox blocks. That was an environment limit, not a yarn result. The rerun used the project flags above.
- The sampler's filesystem delta (884 MiB cold) is not reliable on a shared disk and is not used.
- The Node archive (31.6 MB) is cached in the tree at `.mozbuild/node-dist`. A fresh runner downloads it once; that cost is not in the figures.
- Scratch artifacts (not in the repo): `/tmp/claude-1000/scratch-51/`.

## Verification

- Baseline, before any edit: `scripts/verify-platform.sh --quick` exit 0, "all checks passed".
- `scripts/verify-platform.sh --only renovate-config`: PASS. Line: `renovate-config: PASS -- .github/renovate.json5: the theia group selects 49 @theia/* pins with @theia/monaco-editor-core in its own pinned group; theia_release 1.76.0 is captured by one regex manager; automerge and platformAutomerge off; nix enabled; branchPrefix chore/theia-; no clock key; every non-Theia dependency disabled (6); 2 post-upgrade commands and 5 file filters`.
- `scripts/verify-platform.sh --only renovate-config-self-test`: PASS, 30 planted faults each red on its named rule, plus the unmodified-tree control and a minimal clean fixture, 32 ok lines. Two consecutive runs of `renovate-config` are byte-identical.
- `--only workflows`, `--only workflows-self-test`, `--only zizmor`: PASS, unchanged by this plan.
- `nix develop .#theia --command zizmor --version`: `zizmor 1.29.0`.
- Renovate's own validator: `renovate-config-validator` 44.198.3, `--no-global --strict` on `.github/renovate.json5`: "Config validated successfully". A negative control (`executionOrder`, `allowedPostUpgradeCommands` added to a copy) produced errors and warnings, so the validator is not vacuous here.
- Renovate 44.198.3 local platform, `dry-run=lookup`, in a scratch git repo with the same config and the tree's `theia/package.json`, `theia/yarn.lock`, `configuration.toml`, `flake.nix`, `flake.lock`:
  - Current pins (no Theia update exists yet): no branch. The regex manager extracts `@theia/core` from `configuration.toml` (`replaceString` `theia_release = "1.76.0"`); npm extracts the 50 resolutions under the `resolutions` dep type.
  - Seeded Theia pins at 1.75.0: 50 upgrades to 1.76.0, all on `chore/theia-theia`, "Returning 1 branch(es)".
  - Seeded monaco at 1.100.0 with a matching `yarn.lock`: one more branch, `chore/theia-theia-monaco-editor-core`, to 1.108.201; "Returning 2 branch(es)".
  - Before the scope rule, the same dry run opened `chore/theia-typescript-7.x`, `chore/theia-react-19.x`, `chore/theia-react-dom-19.x` and `chore/theia-pin-dependencies` for non-Theia packages. After the scope rule: none.
- Acceptance greps on `.github/renovate.json5`: `MEASURED` 1, `timeout-minutes` 1, `ubuntu-latest` 1, `postUpgradeTasks` 1, `chore/theia-` 7, `schedule` 0, `timezone` 0, `monaco-editor-core` 7, `theia_release` 2.
- Admission grep `grep -c 'renovatebot/github-action@' .github/settings/actions-selected.json`: 0. This is deliberate; see adaptation 2.

## Adaptations to the plan

1. **Dispatch job not applied (missing premise).** The plan's gate stops the job while the sweep renderer is absent. The job spec is kept below, not applied.
2. **Admission not applied.** `scripts/verify-workflows.mjs` rule `admission-used` makes an admitted-but-unused owner/repo red. With no using workflow, the admission would turn the `workflows` row red. The admission lands with the job. The plan's `github_owned_allowed: true` already admits `actions/create-github-app-token`, so no second admission is needed there.
3. **Scope rule added (not in the plan).** `branchPrefix` is global. Without a rule disabling non-Theia dependencies, Renovate opened `chore/theia-*` branches for typescript, react, react-dom, yarn, node and the nixpkgs input (shown in the dry run). The rule `matchPackageNames: ["/^(?!@theia\\/)/"]` with `enabled: false` covers them. The verifier's `scope` rule derives the non-Theia probe set from `theia/package.json` (dependencies, devDependencies, engines) and the `flake.lock` root inputs, and requires that no `@theia/*` resolution is disabled.
4. **Schema keys replaced.** The current Renovate schema has no `matchPackagePatterns` or `excludePackageNames`. The Theia group uses `matchPackageNames` with a regex and a negative lookahead for the monaco exception.
5. **`executionOrder` removed.** The validator rejects `postUpgradeTasks.executionOrder`. The hook uses `executionMode: "branch"`, so it runs once per branch after every upgrade in the group.
6. **`allowedPostUpgradeCommands` moved out of the repository config.** The validator reports it as global-only in a repository config. The dispatch job must set `RENOVATE_ALLOWED_POST_UPGRADE_COMMANDS` in its environment. The verifier's `allowed-post-upgrade` rule fails if the key appears in the repository file.
7. **`fileMatch` replaced by `managerFilePatterns`.** The validator migrates `fileMatch` to `managerFilePatterns` in slash-regex form. The verifier's `theia-release-manager` rule also rejects `fileMatch`, so the file stays migration-free.
8. **`flake.lock` not changed by the Theia PR.** The plan assumed the Theia PR updates `flake.lock`. It does not: `flake.lock` pins nixpkgs, and no Theia change touches a flake input. The nix manager is enabled as the plan requires, and the nixpkgs input is disabled by the scope rule (adaptation 3). This is an owner decision and is recorded in the config header.
9. **Branch names.** The plan said `chore/theia-<version>`. A group branch is named by its slug, so the rendered names are `chore/theia-theia` and `chore/theia-theia-monaco-editor-core`. The version is in the PR title and body. FIX-01 matches on the prefix, which holds. The first live run confirms the names (BLOCKED.md item 3).
10. **Admission row placement.** The plan's behavior list put the admission set-equality in the `renovate-config` row. That check is in the `workflows` row's `admission-used` and `uses-admitted` rules, which cover the whole tree. The `renovate-config` row does not repeat it.
11. **Measurement flags.** Cold figures use the project's install flags (adaptation in the Measurements section), not the bare command in the plan.
12. **Commit shape.** The config, verifier and rows form one commit (`c50023c8`), because the row is red without the config and each commit must stay green. The header measurement was filled before that commit, so the plan's separate Task 3 commit is folded into it. This SUMMARY and BLOCKED.md form the second commit.

## Dispatch job spec (not applied; gated on the sweep tick)

Target: `.github/workflows/release-train.yml`, new job `renovate-theia`, applied only after Phase 48 plan 03 lands and the admission is in the same commit.

- `runs-on: ubuntu-latest`, `timeout-minutes: 60`, `environment: bot`, `permissions: { contents: read }`, `if:` gated on `inputs.renovate-theia == true`, with a negated `inputs.dry-run` on every writing step (the `bot-job-gate` and `dry-run-gate` rules).
- No `schedule` key, no cache step, no workflow file writes.
- Dispatch inputs: `reason` (existing, tick|owner|self) and `renovate-theia` (boolean, validated by an allow-list regex before use). Owner dispatch: `gh workflow run release-train.yml --ref main -f reason=owner -f renovate-theia=true`.
- Steps, in order: checkout with `persist-credentials: false`; mint the bot App token with `actions/create-github-app-token` at the SHA already pinned in `release-train.yml` (`fee1f7d63c2ff003460e3d139729b119787bc349`, `# v2`), with `permission-contents: write` and `permission-pull-requests: write`; run `renovatebot/github-action` pinned to a SHA the owner re-resolves (BLOCKED.md item 1, step 2), with `RENOVATE_PLATFORM: github`, `RENOVATE_REPOSITORIES` set to the repository, `RENOVATE_ALLOWED_POST_UPGRADE_COMMANDS` set to `["^node scripts/generate-licensing\\.mjs$", "^node scripts/generate\\.mjs --check$"]`, and the config file `.github/renovate.json5`. The action's input names must be checked against its `action.yml` at the pinned SHA; this was not done offline.
- Every value from `inputs` or `github.event` goes through `env:`, never directly into `run:` (template-injection rule).
- Admission: add `renovatebot/github-action@*` to `patterns_allowed` in `.github/settings/actions-selected.json` in the same commit, so `admission-used` holds.

## Assumptions still open

- Datasource anchor: `@theia/core` stands for the whole group. Not proven; one mismatch report from a live run settles it (51-RESEARCH 15.4).
- The post-upgrade hook (`executionMode: branch`, `fileFilters`) has not run in Renovate. The dry run had no update to run it against. The hook's regenerated outputs are unverified until the first live PR.
- `RENOVATE_ALLOWED_POST_UPGRADE_COMMANDS` is taken from the validator's global-only warning, not from a run that applied it.
- The renovatebot action SHA and its input names are not resolved (owner step, BLOCKED.md item 1).

## Deviations and observations outside the plan's scope

- `scripts/verify-platform.sh --quick` baseline printed a fixture path under `dsh/phase-54` for `openvsx-pinned`, although the fixture exists in this clone. The row only reads. Cause not investigated; no change made.
- `.planning/workstreams/deploy/config.json` was already untracked at start and is not part of this plan. It was not staged or committed.

## Self-Check

- Created files: `.github/renovate.json5`, `scripts/verify-renovate-config.mjs`, `BLOCKED.md`, and this file exist in the tree.
- Commit `c50023c8` exists on `dsh/phase-51` with the three code paths.
- `commits` measured from the ledger at write time: `git rev-list --count 69659b446e1c91aa2654dbc59f5b5123f30b9e07..HEAD` = 1.

## Self-Check: PASSED

## Known Stubs

None.

## Threat Flags

None. The config and the verifier add no endpoint, credential, schema or workflow.
