---
phase: 51-dependency-flow-and-train-supersede-f
plan: 01
reviewed: 2026-10-31
depth: deep
files_reviewed: 3
files_reviewed_list:
  - .github/renovate.json5
  - scripts/verify-renovate-config.mjs
  - scripts/verify-platform.sh
findings:
  blocker: 1
  warning: 5
  info: 3
  total: 9
status: issues_found
---

# Plan 51-01 code review (AUTO-02, Renovate Theia inflow)

Change set: `git diff 69659b44..HEAD` (5 files; 3 source files reviewed, SUMMARY and BLOCKED.md read as context).

Method: read the config, the verifier and the registry rows. Ran `--self-test` (30 plants, green). Ran the pinned Renovate 44.198.3
from the executor's scratch install (`/tmp/claude-1000/scratch-51/rv`) against a `git archive HEAD` copy of the **whole** tree
(extract and lookup dry runs, local platform, no push). Mutated the config in a scratch root to see which faults the verifier
misses. Ran `scripts/verify-platform.sh --quick` in the clone (exit 0, no phase-54 path in the output).

## BLOCKER

### BL-01: the theia_release regex manager matches nine archived fixture files, so Renovate opens a Theia PR on the current tree

**File:** `.github/renovate.json5:64` (`managerFilePatterns: ["/(^|/)configuration\\.toml$/"]`)

**Failure scenario (reproduced).** The pattern matches any `configuration.toml` at any depth. The tree tracks nine more, all with
`theia_release = "1.74.1"`:
`.planning/milestones/v1.0-phases/07-sourcerer-as-downstream/fixtures/{canonical-name,late-sort-name,missing-required-key,non-square-logo,sourcerer-equivalent,spaced-name}/configuration.toml`
and `.planning/milestones/v1.1-phases/09-extensions-crash-pipeline/fixtures/{local-path-kind,npm-kind,openvsx-pinned}/configuration.toml`.
Renovate 44.198.3, `dry-run=lookup`, whole tree, repo config only, with the live pins already at 1.76.0:

```
DEBUG: Matched 10 file(s) for manager regex
DEBUG: 9 flattened updates found: @theia/core, @theia/core, ...
DEBUG: Returning 1 branch(es)
DEBUG: Branch is not pending, removing pending upgrades (branch=chore/theia-theia)
```

Each fixture is an update `1.74.1 -> 1.76.0` in the `theia` group. Consequences:

1. The first dispatch opens a grouped Theia PR when no Theia release exists. That PR only rewrites archived fixtures.
2. After every real Theia release the one grouped PR also rewrites nine archived `.planning/milestones/**` files. AUTO-02 says
   `theia_release` in `configuration.toml`, singular. The fixtures are deliberately frozen inputs of the downstream-fixture proof.
3. The executor's dry run said "Current pins (no Theia update exists yet): no branch". That run used a scratch repo seeded with only
   `theia/package.json`, `theia/yarn.lock`, `configuration.toml`, `flake.nix`, `flake.lock`, so it could not see this.

**Fix.** Anchor the pattern to the repository root file, and (belt and braces) ignore the archive:

```json5
"managerFilePatterns": ["/^configuration\\.toml$/"],
...
"ignorePaths": [".planning/**"],
```

Then re-run the whole-tree lookup dry run and require `Returning 0 branch(es)` at the current pins. Add a verifier rule that derives
`git ls-files` entries named `configuration.toml` and requires the manager patterns to match exactly the root one (see WR-03; the
present `patternTest(p, 'configuration.toml')` only proves the root file is covered, never that nothing else is). Add a plant for it.

## WARNING

### WR-01: AUTO-02 requires `flake.lock` updates through the nix manager; the config disables the only flake input, and the verifier locks that in

**File:** `.github/renovate.json5:21-27` (comment), `:36` (`nix.enabled`), `:41-45` (scope rule), `:97` (`flake.lock` in fileFilters);
`scripts/verify-renovate-config.mjs:262-265, 297-305`

AUTO-02 (REQUIREMENTS.md:106) says "`flake.lock` updates through the nix manager". The lockfile has exactly one input, `nixpkgs`
(`flake.lock` nodes: `nixpkgs`, `root`). The scope rule `"/^(?!@theia\\/)/"` disables it (extract log: `Dependency: nixpkgs, is disabled`),
so the nix manager runs and never produces an update. Result: `nix.enabled: true` and the `flake.lock` fileFilter are dead
configuration, and the `[nix]` verifier rule ("so flake.lock is a managed file") asserts something false. Worse, the `[scope]` rule
adds `flakeInputs` to the must-be-disabled set, so putting the nixpkgs input back to satisfy the requirement turns the row red.

The SUMMARY records this as adaptation 8 and "owner decision", and 51-RESEARCH (decision 19, open question 6) says the nixpkgs input
must not move inside the Theia PR. That reasoning is sound for the Theia group. It does not make the requirement met: the text says
the nix manager updates `flake.lock`, and `requirements-completed: [AUTO-02]` is claimed. Two honest resolutions:

- Keep the separation but satisfy the text: a third rule for `nixpkgs` with its own `groupName`/`groupSlug` (so it is never in the Theia
  branch), `automerge: false`, and `additionalBranchPrefix` or a distinct branch, plus the verifier's `[scope]` rule changed to
  "nixpkgs is in its own group, never in the theia group". Re-open research question 6 before enabling it.
- Or amend AUTO-02 and ROADMAP criterion 1 to say "`flake.lock` is not moved by the Theia PR", drop `nix` and the `flake.lock` filter,
  and do not mark the requirement complete on this plan.

### WR-02: Renovate vulnerability alerts are left at their defaults; remediations bypass both the scope rule and the Theia group

**File:** `.github/renovate.json5` (no `vulnerabilityAlerts` key); Renovate source
`workers/repository/init/vulnerability.js` (early return only when `vulnerabilityAlerts.enabled === false`) and
`workers/repository/updates/flatten.js:118-127` (remediation updates set `updateConfig.enabled = true` after the rules ran).

**Failure scenario.** `vulnerabilityAlerts` defaults to active on GitHub: `groupName: null`, `branchTopic: {{datasource}}-{{depName}}-vulnerability`,
`prConcurrentLimit: 0` (no cap), `commitMessageSuffix: [SECURITY]`. If the bot App token is ever granted Dependabot-alert read (the
AUTO-03 phase enables Dependabot alerts on this repo), Renovate opens `chore/theia-*-vulnerability` PRs for vulnerable `theia/yarn.lock`
entries. Remediation updates are force-enabled, so the "disable every non-@theia dependency" rule does not stop them, and they are
outside the single Theia group. They duplicate AUTO-03's Dependabot security-only updates for the same lockfile. This run saw
`No vulnerability alerts found` only because a local-platform run has no alerts. AUTO-02's "nothing more" is not enforced.

**Fix.** Add at top level: `"vulnerabilityAlerts": { "enabled": false }, "osvVulnerabilityAlerts": false` and a verifier rule for both.

### WR-03: the quick row cannot see "nothing more"; nine configuration faults that violate AUTO-02 stay green

**File:** `scripts/verify-renovate-config.mjs:176-330` (`runChecks`)

The row checks the presence of required keys and a few top-level scalars. It has no allow-list of keys and no negative scan. I mutated a
copy of the live config in a scratch root and ran the row. All of these printed `PASS`:

| Mutation | Why it should be red |
|---|---|
| `packageRules[1].automerge = true` | `automerge` is read at `cfg.automerge` only, never inside a packageRule |
| `extends: ["config:recommended"]` | turns on dashboard, pinDigests, other defaults |
| `lockFileMaintenance: { enabled: true }` | AUTO-02 scope |
| `dependencyDashboard: true` | dashboard side effect |
| second customManager with `managerFilePatterns: ["/.*/"]` | regex over every file; only the first covering manager is examined |
| appended `{ matchPackageNames: ["/.*/"], enabled: true }` | rule order is never simulated, so it re-enables everything the scope rule disabled |
| `matchUpdateTypes: ["patch"]` on the theia group | narrows the group; matchers other than `matchPackageNames` are ignored |
| `vulnerabilityAlerts: { enabled: true }` | WR-02 |
| `enabledManagers`, `managerFilePatterns: ["/configuration\\.toml$/"]` | the latter lets the fixtures (BL-01) through |

Only the commands list was caught (mutation `commands.push("curl x|sh")` went red). The self-test reports 30/30 because every plant
removes a required property; no plant adds an unwanted one.

**Fix.** Treat the file as an allow-list. Required: exact top-level key set (`$schema, automerge, platformAutomerge, rangeStrategy,
branchPrefix, nix, packageRules, customManagers, postUpgradeTasks, vulnerabilityAlerts, ignorePaths`), exact key set per packageRule,
`customManagers.length === 1`, `automerge` and `platformAutomerge` false at any depth (reuse `findClockKeys` as a generic walker),
and a simulation of rule order (apply rules in sequence to every probe name and require final `enabled === false` for non-@theia and
`enabled !== false` for @theia). Add one plant per row above.

### WR-04: `licensing-inputs` has no plant, so "each rule goes red" is untested for it

**File:** `scripts/verify-renovate-config.mjs:340-344` (rule), `:372-` (plants)

The 30 plants name 15 of the 16 rules (`grep -o "naming '...'"` over the self-test output). `licensing-inputs` never appears, because
`runChecks` has no override for the tree and every plant passes `REPO_ROOT`. Deleting `scripts/generate-licensing.mjs` or
`THIRD-PARTY-NOTICES.txt` is the exact drift this rule exists for, and no test proves it fires. CLAUDE.md requires each new check
to have a `--self-test` that plants a fault for each rule.

**Fix.** Give `runChecks` a `root` override that points at a scratch directory copy lacking one named file (the function already takes
`root`), and add a plant per missing input. Three plants cover the rule.

### WR-05: the post-upgrade hook is unverified, and it silently becomes a no-op if the job environment omits the allow-list

**File:** `.github/renovate.json5:90-95`; `scripts/generate-licensing.mjs:158-164, 239, 266`

Facts from the code: Renovate's executor (`execute-post-upgrade-commands.js:123`) only warns when a command is not on
`allowedPostUpgradeCommands` and skips it. The repository file cannot carry that option, and the only job that would carry it is
the BLOCKED dispatch job. With no `RENOVATE_ALLOWED_POST_UPGRADE_COMMANDS`, the Theia PR is opened with `theia/yarn.lock` and package pins
changed and `THIRD-PARTY-NOTICES.txt` stale, which turns the `licensing` row red on the first PR (the exact outcome the hook exists to prevent).
Nothing in this plan can detect that, and the verifier's `[allowed-post-upgrade]` rule only checks the key is absent.

The generator also needs inputs a fresh runner may not have: `theia/node_modules` ("absent node_modules" is a hard `Fail`, line 158),
`python3`, `git rev-parse --git-common-dir`, and the Node archive from `.mozbuild/node-dist` (downloaded once per runner). Renovate's
own yarn run supplies `node_modules` only if it leaves it behind, and it runs yarn with `--ignore-platform`, which can change the
optional-dependency closure the generator walks. The executor's measurements ran in a populated tree and the SUMMARY lists this as open.
`generate.mjs --check` writes nothing, so it only produces an artifact error comment on the PR if it fails; it does not repair drift.

**Fix.** Record in BLOCKED.md item 1 that the dispatch job must set the allow-list and must run `yarn install --ignore-scripts
--frozen-lockfile` in `theia/` and provide `python3` before Renovate runs; add a `workflows`-row assertion for the env var when the job
lands. Do not mark AUTO-02 complete until one real PR shows `licensing` green.

## INFO

### IN-01: no hard-coded absolute path found; the `dsh/phase-54` baseline line is not reproducible here

Investigated per the request. `git grep` over non-`.planning` tracked files for `/home/chris` and `gsd-workspaces` finds only
`CLAUDE.md`, `inventory/brand-tokens.json`, `ledger/history/log.jsonl` and two comments in `scripts/rename-brand.mjs` and
`scripts/scan-brand-residue.mjs` (the retired sourcerer repo path). No `phase-54` string exists in any script, `.github` file,
`powerbrowser/`, `theia/` (excluding the lockfile) or in the ignored build outputs (`generated/`, `powerbrowser/branding-generated`,
`theia/applications/browser/src-gen`, `theia/extensions/*/lib`). `verify-platform.sh` derives `REPO_ROOT` from `BASH_SOURCE` (line 58);
the fixture roots are globbed off it (lines 285-300); `verify-downstream-fixture.mjs` derives its root from `import.meta.url` (line 75).
A full `scripts/verify-platform.sh --quick` in this clone exits 0 and prints
`.../dsh/phase-51/.planning/milestones/v1.1-phases/09-extensions-crash-pipeline/fixtures/openvsx-pinned (80 assertions)`.
`openvsx-pinned` is a fixture directory printed by `verify-downstream-fixtures`, not a registry label (`--only openvsx-pinned` is an
unknown label). Most likely the executor's baseline was run through a `verify-platform.sh` file located in the phase-54 clone, or its
output was copied from a sibling session. Not a defect in the change set.

### IN-02: the executor's `yarn install` restore left no tracked change

`git status` is clean apart from the pre-existing untracked `.planning/workstreams/deploy/config.json`. `theia/yarn.lock` and every
`package.json` are unchanged versus `69659b44`. `theia/node_modules` is git-ignored; its `@powerbrowser/*` symlinks resolve inside
`phase-51`, and no symlink points at another clone.

### IN-03: SUMMARY and the verifier row text overstate what was proven

`51-01-SUMMARY.md` records `requirements-completed: [AUTO-02]` although the dispatch job, the action admission, the bot-token
run and the first live PR are all BLOCKED, and the proof "current pins: no branch" is wrong on the real tree (BL-01). The `renovate-config`
PASS line says "nix enabled", which implies a working `flake.lock` path (WR-01). Keep AUTO-02 pending in REQUIREMENTS.md traceability
until BL-01 and WR-01 are closed and one live PR is reviewed.

## Checked and found sound

- No postUpgradeTasks injection surface: no template variables in `commands`; the verifier pins the two commands as a set; repository-level
  `allowedPostUpgradeCommands` is correctly absent. The regex customManager reads only a repo-owned file and has fixed
  `depNameTemplate`/`datasourceTemplate`; the capture group is a version string with no execution path (blocked by BL-01 only in breadth).
- Monaco is separate and pinned: `Matched` branches in the executor's run and the group regex both exclude `@theia/monaco-editor-core`
  by lookahead; the verifier derives the member set from `theia/package.json` and compares set equality.
- Renovate defaults not overridden but confirmed off in this version: `lockFileMaintenance.enabled: false`, `dependencyDashboard: false`,
  `osvVulnerabilityAlerts: false`; no `extends`, so no dashboard, no pin-digest PRs, no onboarding PR (`repoIsOnboarded=true`).
- Non-@theia dependencies across all managers in the whole tree (`dockerfile`, `github-actions`, `html`, `nix`, `npm` including
  `.github/triage/claude-code/package.json`, `bun`) are all `skipReason: disabled` in the whole-tree lookup.
- No clock key, no automerge key at the top level, no workflow path in `fileFilters`.
