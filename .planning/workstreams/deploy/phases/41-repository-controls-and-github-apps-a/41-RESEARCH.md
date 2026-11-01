# Phase 41: Repository controls and GitHub Apps (A) - Research

**Researched:** 2026-10-21
**Domain:** GitHub org/repo governance as code (REST settings bodies, rulesets, environments, Actions policy, GitHub Apps), static workflow trust-boundary checks, zizmor
**Confidence:** HIGH for REST shapes and the live baseline; MEDIUM for two platform behaviours that need an owner probe (installation repository list readable with the owner token; Free-plan runner-group restriction)

## Summary

Every live setting this phase needs has a REST endpoint, except four that are UI-only: the org 2FA requirement, the GitHub App creation, Actions email/Mobile push notification settings, and recovery-code custody. The live repo today is a clean baseline: 0 rulesets, 0 environments, `allowed_actions: all`, `sha_pinning_required: false`, fork approval `first_time_contributors`, immutable releases off, private vulnerability reporting off, Discussions off, auto-merge off, 0 repository secrets, 0 Releases, 0 App installations, org on the `free` plan with 2FA not required and one owner (`ServerDestroyer`, id 51835244). Read-only `gh api` calls this session confirmed all of these.

The work splits cleanly. Claude builds three local artifacts:
- the declared `.github/settings/*.json` bodies;
- `scripts/apply-repo-controls.mjs`, which prints the exact `gh api` writes by default and executes them only with `--yes`;
- `scripts/verify-repo-controls.mjs`, the read-only full-tier row `repo-controls`, plus an in-memory `--self-test` that runs at the quick tier.

Claude also writes two static quick rows, `workflows` (`scripts/verify-workflows.mjs`) and `zizmor`, each with a self-test. The owner performs every live write at one `checkpoint:human-action`. The live `repo-controls` row then runs once and goes green.

Both research flags are now answered as far as they can be without the owner.
- **Workflows permission (resolved, HIGH).** An App without the Workflows permission cannot create or modify workflow files. The rule covers a git push, the contents API, and also creating a release when the target commit differs in `.github/workflows/` from the default branch. GitHub's own docs say so.
- **Runner-group "selected workflows" on Free (unresolved).** It cannot be settled from docs: runner groups are documented as a Team-plan feature, every org has one default group, and nothing documents the `restricted_to_workflows` flag for Free. It also does not apply at all to the runner as `docs/RELEASING.md` currently designs it, because that runner is registered at repository level, and repository runners are not in any runner group. The probe is an owner action that needs the `admin:org` scope, which the current `gh` token lacks.

**Primary recommendation:** model each REST call as one tracked JSON body. One shared table in `verify-repo-controls.mjs` maps each body to its write and read endpoints, and the apply script imports that table. Compare the live state against the declared bodies by projection and set equality, and fail closed on any unreadable endpoint. Split the `main` ruleset in two:
- an integrity ruleset (deletion and non-fast-forward) with **no** bypass actors, so a force-push is refused even for the owner (success criterion 2);
- a review ruleset (the `verify` check and one approval) with the owner (`OrganizationAdmin`) as the only bypass.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Declared settings (rulesets, environments, Actions policy, repo flags, App permission sets) | Repo tree (`.github/settings/*.json`) | — | GH-02: declaration is tracked, reviewed, diffed |
| Applying settings | Owner workstation (`gh api` writes, owner token) | GitHub web UI (2FA, App creation, notifications) | CONTEXT: every live change is an owner action |
| Enforcement of refs (force-push, deletion, tag creation, required check/review) | GitHub server (rulesets) | — | Only server-side rules bind every actor |
| Secret scoping for jobs | GitHub server (environments + branch policies) | — | A `null` branch policy hands env secrets to any branch |
| Action supply-chain policy | GitHub server (`allowed_actions: selected`, `sha_pinning_required`) | Repo tree (`workflows` row, zizmor) | Server enforces at run time; static rows catch it at commit time |
| Drift detection | `repo-controls` full row (network, read-only) | Later: maintenance sweep job (Phase 48) | Network needed, so never `--quick` |
| Workflow trust boundary | `workflows` + `zizmor` quick rows (static) | — | Must hold on every commit, offline |

## User Constraints (from CONTEXT.md)

<user_constraints>
### Locked Decisions
#### Already decided (owner, 2026-10-20)
- All owner decisions in REQUIREMENTS.md "Owner Decisions" are binding (SEED-002 §12 recommended defaults plus the research additions): Apps only, no PATs; bot App without the Workflows permission; non-ephemeral legion runner later (Phase 49); fork approval for all external contributors; tags created only by the bot App after `release` approval.

#### Owner gates in this phase (stop points for autonomous execution)
- Every change to the LIVE GitHub org or repo (applying rulesets, environments, Actions policy, repo settings, org 2FA), creating and installing the two GitHub Apps, creating the empty `powerbrowser-updates` and Homebrew tap repos, adding the second org owner and storing recovery codes, the runner-group probe as org admin, and the phone-notification test are owner actions. Plans build everything locally — declared settings under `.github/settings/`, an apply script that reads them, the `repo-controls` full-tier row and its self-test, the `workflows` and zizmor quick rows — and end with one `checkpoint:human-action` listing the exact commands, after which the live `repo-controls` row is run.
- Read-only `gh api` calls against the live org/repo are allowed for research and for the read-back row.

### Claude's Discretion
All other implementation choices are at Claude's discretion — discuss phase was skipped per user setting. Use the ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

### Deferred Ideas (OUT OF SCOPE)
None — discuss phase skipped.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| GH-02 | Every setting declared in `.github/settings/*.json`, applied with `gh api`, read back by full row `repo-controls` (`scripts/verify-repo-controls.mjs`); self-test plants missing ruleset, `null` env branch policy, App with Workflows | §Settings bodies, §Pattern 1 (control table), §Pattern 2 (read-back), §Validation |
| SEC-06 | Org requires 2FA; second owner; offline recovery codes | `two_factor_requirement_enabled` is readable with `read:org`; it can be set only in the UI (no PATCH key). The owner set is readable via `members?role=admin`. Recovery codes are an owner attestation in RELEASING.md |
| SEC-11 | Fork PR approval = all external contributors, read back | `PUT .../actions/permissions/fork-pr-contributor-approval` `{"approval_policy":"all_external_contributors"}` |
| GH-05 | `main` ruleset: no force-push, no deletion, `verify` required, 1 approving review, owner only bypass; no App bypass; count 1 asserted | Two-ruleset split (§Pitfall 1). `verify` is check-run name `verify` from app id 15368 |
| GH-06 | Tag ruleset: creation only by `powerbrowser-bot`; no required-signatures; remove the signed-tag claim in RELEASING.md | Tag ruleset with `Integration` bypass actor; App id is resolved from the installation at apply time. The claim is now at RELEASING.md:932-935, plus related text (§Doc edits) |
| GH-07 | Envs `release` (owner reviewer, admin bypass off), `descriptor` (owner + 1440 min), `bot`, `fixer`, `triage`, all branch policy `main`; fail on any `null` policy | Environment PUT body plus a deployment-branch-policy POST. `can_admins_bypass` is live but absent from the OpenAPI description (§Pitfall 4) |
| GH-08 | `selected` + `sha_pinning_required: true`; `actions-selected.json` admits every used action; default token read-only; repo secrets = 0 | Three PUT bodies plus a secrets count. The `workflows` row derives admission from `actions-selected.json` |
| GH-09 | Immutable releases (with zero Releases), Discussions, PVR, auto-merge on | Bodiless PUTs plus a repo PATCH. The apply script asserts `GET releases == []` before enabling immutable releases |
| GH-10 | Two Apps, exact permission sets, installation repo lists, read back | `GET /orgs/{org}/installations` gives `app_slug`, `permissions` and `repository_selection`. The repo-list read is an open probe (§Open Question 1) |
| GH-11 | Runner-group "selected workflows" probe on Free; record in RELEASING.md | Probe recipe (§Code Examples). The probe needs the `admin:org` scope. A repo-level runner has no group |
| GH-12 | `workflows` quick row with every listed assertion; self-test plants each | §Pattern 3: rules made precise, parser choice, plant list |
| AUTO-09 | `zizmor --offline` quick row, green on tree | zizmor 1.29.0 in the locked nixpkgs. It exits 0 on today's tree ("No findings… (6 suppressed)") |
| GH-18 | Actions email failed-only; Mobile push for deployment approvals, assignments, mentions; one test of each reaches the phone; recorded | No REST API exists for notification settings. The drill must be triggered by the **second owner account** (§Pitfall 7) |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **One driver, one registry.** Every new check is one row appended to `scripts/verify-platform.sh` CHECKS. No sibling driver.
- **Self-test.** Every new check has a `--self-test` that plants faults, and each fault must go red naming the drift.
- **Derive and compare.** Derive the expectation from the tree and compare as set equality, red on both addition and removal. Never hand-keep an expectation list.
- **Absence-of-log assertions.** Never assert the absence of a log line emitted by your own instrumentation.
- **Quick tier.** `--quick` rows use no build, no browser, no display and no network. `repo-controls` is a full-tier row; its self-test is in-memory and runs at the quick tier.
- **Residual-brand scan.** `node scripts/scan-brand-residue.mjs` must stay at exit 0. It iterates `git ls-files`, so **stage new files before trusting a green scan**. The originating product's name may appear only in `inventory/brand-tokens.json`.
- **Rebrand inputs.** A rebrand must not require editing a second file. Derive the repo slug from `configuration.toml [urls].release_notes` (`https://github.com/DeBIOS-Foundation/powerbrowser/releases`, read at configuration.toml:93), not from a literal in the scripts.
- **Repo path.** The repo path must contain no space. Builds run in Nix dev shells. `node` works outside a shell; `yarn` does not.
- **Upstream and Theia.** Never edit Theia core or `upstream/`. Not touched by this phase.
- **User-facing copy.** Not applicable: these are developer and operator messages. Every failure line still ends with a concrete "Next step:", following the existing rows' convention.
- **Hash-locked files.** The BAK kit hash-locks `scripts/verify-ng-NNN-*.mjs`. Do not create or edit files with that prefix. Shell commands containing the substring `ledger/` are blocked by a hook.
- **Plan gate.** The plan gate for this workstream is `python3 scripts/plan-gate.py --root . --phase 41 --plans <dir> --stream deploy`. Any v1.6 ledger row carries `"stream": "deploy"`.
- **Quick baseline.** `docs/non-gui/quick-baseline.txt` is empty (0 lines), so a new quick row must be green on the tree when it lands.

## Live baseline (read-only, 2026-10-21)

All [VERIFIED: gh api GET this session, token scopes `read:org, repo, workflow`]:

| Endpoint | Response (verbatim) |
|---|---|
| `GET repos/$R/rulesets` | `[]` |
| `GET repos/$R/environments` | `{"total_count":0,"environments":[]}` |
| `GET repos/$R/actions/permissions` | `{"enabled":true,"allowed_actions":"all","sha_pinning_required":false}` |
| `GET repos/$R/actions/permissions/workflow` | `{"default_workflow_permissions":"read","can_approve_pull_request_reviews":false}` |
| `GET repos/$R/actions/permissions/fork-pr-contributor-approval` | `{"approval_policy":"first_time_contributors"}` |
| `GET repos/$R/immutable-releases` | `{"enabled":false,"enforced_by_owner":false}` |
| `GET repos/$R/private-vulnerability-reporting` | `{"enabled":false}` |
| `GET repos/$R/actions/secrets` | `{"total_count":0,"secrets":[]}` |
| `GET repos/$R/releases` | `[]` |
| `GET repos/$R` (selected) | `"allow_auto_merge":false … "has_discussions":false … "visibility":"public"`, `default_branch: main`, `owner_id 319979324` |
| `GET orgs/DeBIOS-Foundation` (selected) | `"plan":{"filled_seats":1,"name":"free",…},"two_factor_requirement_enabled":false` |
| `GET orgs/DeBIOS-Foundation/members?role=admin` | `ServerDestroyer` (only) |
| `GET orgs/DeBIOS-Foundation/installations` | `{"total_count":0,"installations":[]}` (works with `read:org`) |
| `GET users/ServerDestroyer` | `{"id":51835244,"login":"ServerDestroyer"}` |
| `GET repos/$R/commits/main/check-runs` | `{"app":"github-actions","app_id":15368,"conclusion":"success","name":"verify"}` |
| `GET orgs/DeBIOS-Foundation/actions/runner-groups` | **403**, "This API operation needs the "admin:org" scope" |
| `GET orgs/DeBIOS-Foundation/actions/permissions` | **403**, same scope message |
| `GET repos/$R/installation` | **401**, "A JSON web token could not be decoded" (App JWT only) |
| `GET user/installations` | **403**, "You must authenticate with an access token authorized to a GitHub App in order to list installations" |
| `GET apps/powerbrowser-bot`, `apps/powerbrowser-clock` | 404 (the slugs appear free; a private App would also 404) |
| `GET repos/DeBIOS-Foundation/{powerbrowser-updates,homebrew-tap,homebrew-powerbrowser}` | 404 (not yet created) |

`R=DeBIOS-Foundation/powerbrowser`. The response header `X-Github-Api-Version-Selected: 2022-11-28` was observed. A newer version, `2026-03-10`, exists [VERIFIED: github/rest-api-description descriptions dir]. Pin `X-GitHub-Api-Version: 2022-11-28` on every call in both scripts, so that a change of default version cannot reshape responses without anyone noticing.

## Standard Stack

### Core
| Tool | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `gh` CLI (`gh api`) | 2.102.0 (nixpkgs, on PATH) | All REST reads and writes; carries auth | Already the documented apply path in RELEASING.md:428-468; no token handling in our code |
| GitHub REST API | `2022-11-28` (pinned header) | Rulesets, environments, Actions policy, repo flags, org reads, App installations | Schemas were checked against `github/rest-api-description` main @ `755ee33b` (2026-10-18) |
| zizmor | **1.29.0** (locked nixpkgs `ffb3c9b7`) | `zizmor --offline` quick row | [VERIFIED: `nix eval` of `inputs.nixpkgs…zizmor.version` = `1.29.0`; built from cache.nixos.org]. Upstream is at v1.31.1 (STACK.md); the lock wins |
| js-yaml | 4.3.2 (already in `theia/yarn.lock`, hoisted at `theia/node_modules/js-yaml`) | YAML parsing for `workflows` row | No new dependency. It is reached through `createRequire(join(REPO_ROOT,'theia','package.json'))`, the same mechanism `verify-ng-070` (typescript) and `verify-ng-086` (semver) use |
| Node | v24.21.0 | Script runtime | Matches flake `nodejs_24` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| js-yaml through createRequire | Vendor `js-yaml/dist/js-yaml.mjs` (104,118 bytes, MIT) into `scripts/lib/` with a provenance header like `toml.cjs` | Removes the dependency on a `theia` install. It costs a 104 KB file, and `verify-vendored-parser.mjs` would have to be extended to it. Choose this only if the planner wants the `workflows` row runnable on an uninstalled clone |
| js-yaml | Indentation-aware line scan (the `verify-upstream-pins.mjs` precedent) | Too fragile for permissions inheritance, multi-line `run:` blocks and `runs-on` arrays or objects. Reject |
| `yaml` 2.9.0 (also present, via patch-package) | — | Equivalent. js-yaml has more direct dependents (`@theia/ai-*`, mocha) and is less likely to disappear on a bump |
| Manual App creation in the UI | App manifest flow (`POST /app-manifests/{code}/conversions`) | The manifest flow **forces** a private key (`pem`) into the conversion response, so a key would land on legion in Phase 41. Manual creation lets the owner defer key generation to Phase 43, when a consumer exists |
| Two `main` rulesets | One ruleset as GH-05 words it | With one ruleset the owner bypass also bypasses deletion and non-fast-forward, so success criterion 2 ("a force-push … on `main` is refused") is false for the owner. See Pitfall 1 |

**Installation:** add `pkgs.zizmor` to `devShells.theia.nativeBuildInputs` in `flake.nix`. `flake.lock` does not change, because the package comes from the same nixpkgs rev. No npm install.

## Package Legitimacy Audit

No npm, PyPI or crates package is installed by this phase.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| zizmor 1.29.0 | nixpkgs (locked rev `ffb3c9b700e7`) | long-lived | — | github.com/zizmorcore/zizmor | not run through the seam (nixpkgs, not npm) | Approved: comes from the already-trusted flake input |
| js-yaml 4.3.2 | npm, already locked in `theia/yarn.lock` with integrity `sha512-SFNOvSJ…` | — | — | github.com/nodeca/js-yaml | already installed | No new install |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                 (tree, reviewed in git)
 .github/settings/*.json ──────────────┬───────────────────────────┐
        │                              │                           │
        ▼                              ▼                           ▼
 scripts/apply-repo-controls.mjs   scripts/verify-repo-controls.mjs   scripts/verify-workflows.mjs
  default: print gh api writes      CONTROLS table (shared)            reads actions-selected.json
  --yes: owner executes ──► GitHub   │  read-only gh api GETs            + .github/workflows/*.yml
        (owner token)       REST     │  normalise live → declared        (js-yaml from theia/)
                              │      │  projection + set equality              │
                              ▼      ▼                                         ▼
                         live org/repo state ──► repo-controls (FULL row)   workflows (QUICK row)
                                                 red: missing ruleset,      red: schedule, legion
                                                 null env policy, App         label, non-SHA uses…
                                                 with workflows, any        zizmor --offline (QUICK)
                                                 unreadable endpoint          over .github/workflows
 UI-only owner steps: org 2FA, App creation+install, notification prefs, recovery codes
      └──► recorded as attestations in docs/RELEASING.md (GH-11 probe, GH-18 drill, SEC-06)
```

### Recommended Project Structure
```
.github/settings/
├── ruleset-main-integrity.json     # deletion + non_fast_forward, bypass []
├── ruleset-main-review.json        # required_status_checks verify + pull_request(1), bypass OrganizationAdmin
├── ruleset-release-tags.json       # tag ruleset, bypass Integration = powerbrowser-bot (resolved by slug)
├── environment-release.json        # PUT body (one file per environment)
├── environment-descriptor.json
├── environment-bot.json
├── environment-fixer.json
├── environment-triage.json
├── environment-branch-policy-main.json   # {"name":"main","type":"branch"}, POSTed to every environment
├── actions-permissions.json
├── actions-selected.json
├── workflow-permissions.json
├── fork-pr-approval.json
├── repo.json                       # PATCH /repos/{o}/{r}: has_discussions, allow_auto_merge
├── immutable-releases.json         # expectation for a bodiless PUT: {"enabled": true}
├── private-vulnerability-reporting.json  # expectation for a bodiless PUT: {"enabled": true}
├── org.json                        # read-back only: two_factor_requirement_enabled, owners set
├── app-powerbrowser-bot.json       # slug, permissions, repositories (read-back + UI creation guide)
└── app-powerbrowser-clock.json
scripts/
├── verify-repo-controls.mjs        # exports CONTROLS; full row; --self-test (in-memory)
├── apply-repo-controls.mjs         # imports CONTROLS; dry-run default; --yes writes
├── verify-workflows.mjs            # quick row; --self-test
└── verify-zizmor.mjs               # quick row (zizmor --offline); --self-test plants a bad workflow in mkdtemp
```
Keeping one file per REST call keeps apply a loop of `gh api -X <M> <path> --input <file>`, which RELEASING.md already documents. The `CONTROLS` table must also assert that the set of files under `.github/settings/` equals the set it knows. An orphan body or a missing body then goes red.

### Pattern 1: One control table drives both apply and read-back
**What:** each `CONTROLS` entry holds `{file, write: {method, path} | null, read: path, compare: fn}`. Paths are templates over `{owner}`, `{repo}` and `{org}`, derived from `configuration.toml [urls].release_notes`. The apply script and the row import the same table, so the endpoint a body is applied through and the one it is read back from cannot drift apart.
**Apply order (required):**
1. `actions-permissions` PUT, then `actions-selected` PUT. The second call 409s while `allowed_actions` is `all` [CITED: OpenAPI, "the repository permission policy for `allowed_actions` must be configured to `selected`"; RELEASING.md:466].
2. `workflow-permissions`, then `fork-pr-approval`.
3. Each environment PUT (with `custom_branch_policies: true`), then the `main` branch policy, POSTed only if `GET …/deployment-branch-policies` lacks it. The POST is not idempotent.
4. Rulesets: find by `name` in `GET rulesets`, then `PUT rulesets/{id}` if found, else `POST`. `release-tags` needs the bot App id, so apply it after the App is installed.
5. Immutable releases: `PUT`, only after asserting `GET releases` returns `[]` (GH-09). Then `PUT private-vulnerability-reporting`, then `PATCH repos/{o}/{r}` with `repo.json`.

**Idempotent:** a second `--yes` run must make no change. The live row green after one run proves it.

### Pattern 2: Read-back by projection plus set equality, fail closed
- **Unreadable state is red.** Every GET goes through one helper that turns any non-2xx, a missing `gh`, an unauthenticated `gh`, or a JSON parse error into a FAIL naming the endpoint and the next step (`gh auth login`, `gh auth refresh -h github.com -s read:org`). An unreadable API is never a SKIP.
- **Sets:** live ruleset names equal the declared names; live environment names equal the declared names (an auto-created `copilot` or `github-pages` environment then goes red, which is wanted, see Pitfall 5); installed App slugs ⊇ declared slugs, and each declared App's installation `permissions` deep-equals the declared map; admin logins equal `org.json.owners`.
- **Projection:** for each declared key, the live value must be equal. Do not compare keys GitHub adds (`_links`, `node_id`, `created_at`, defaulted rule params). For rulesets, the set of rule `type`s must be equal, and each declared rule's declared `parameters` must equal the live ones. Compare bypass actors as a set of `(actor_type, actor_id-or-null-for-OrganizationAdmin, bypass_mode)`.
- **Named assertions on top:**
  - every live environment's `deployment_branch_policy !== null`;
  - no `Integration` bypass actor on either branch ruleset;
  - `required_approving_review_count === 1`;
  - no installation `permissions` has a `workflows` key;
  - `actions/secrets.total_count === 0`;
  - `current_user_can_bypass === "never"` on `main-integrity` and `release-tags`, which is a read-only proof that the owner's force-push or tag push would be refused.
- **Self-test:** inject a getter. The real one shells out to `gh api`. The self-test builds a fake live state **in the live response shape** from the declared bodies (protection_rules array, `reviewer` objects, `branch_policies`, installation objects), so the normalisers are exercised. Then:
  1. control: green;
  2. delete `main-review`: red, naming it;
  3. set an environment's `deployment_branch_policy` to `null`: red, naming the environment;
  4. add `workflows: "write"` to the bot installation: red, naming the App;
  5. extra plants (cheap): approving count 2, an Integration bypass on `main-review`, a repo secret count of 1, `first_time_contributors`, `sha_pinning_required: false`, an extra auto-created environment, a getter that throws (must go red, never green).

  It writes nothing, which is the existing convention.

### Pattern 3: `workflows` row: rules made precise
Parse every `.github/workflows/*.yml` and `*.yaml` with js-yaml `load`. YAML 1.2 keeps `on` as a string key; [VERIFIED: parsed both workflows this session, keys `name,on,jobs`]. Duplicate keys throw, so a second `on:` cannot hide a `schedule:`. Fail distinctly when zero files parse. Then:

| Rule (GH-12) | Precise check |
|---|---|
| no `schedule:` | `on` normalised (string, array, object): no `schedule` event, in any file |
| legion label placement | Labels come from `runs-on` (string, array, or `{group, labels}`). Any `${{` in `runs-on` is red. A job is *hosted* iff it has exactly one label matching `^(ubuntu\|windows\|macos)-[\w.-]+$`. A job is *legion* iff the labels include `legion`. **Any other runs-on is red**, including a bare `self-hosted`: legion carries the default `self-hosted`, `linux` and `x64` labels, so such a job would reach it. A legion job is allowed only when file = `release.yml` and job id matches `^(build\|matrix)-`, and then: no `environment` key, no `secrets.` substring in the serialised job or the workflow-level `env`, no `secrets: inherit` |
| claude-code-action | Any step `uses` starting `anthropics/claude-code-action@` requires: the job is hosted, no step in the job uses `actions/create-github-app-token@`, and effective `contents` is not `write` |
| `issues: write` | Effective permissions with `issues: write` only on (`release-train.yml`, job `report`) or any job in `triage.yml` |
| `workflow_run` guard | In every workflow with `on.workflow_run`, every job's `if` (whitespace-normalised, `${{ }}` stripped) contains `github.event.workflow_run.head_repository.full_name == github.repository`. A workflow named in any `on.workflow_run.workflows` list must not itself have `on.workflow_run`. Match workflow identity by `name:` |
| `uses:` pinned and admitted | Every step or job `uses` that is not local (`./…`) must match `^([^/@]+)/([^@]+)@[0-9a-f]{40}$`. `docker://` is red. Admitted means owner ∈ {`actions`,`github`} when `github_owned_allowed` is true, else the `owner/repo` matches a `patterns_allowed` entry of the form `owner/repo@*`. **Set equality:** the `owner/repo` set from `patterns_allowed` equals the set of non-GitHub-owned `owner/repo` actually used, so an unused admission goes red too |
| write trio | A job whose effective permissions hold `contents: write` + `id-token: write` + `attestations: write` must be `release.yml` job `sign-publish` |
| PR triggers | `release.yml` and `release-train.yml` have no `pull_request` or `pull_request_target` |
| no cache in release path | In `release.yml` jobs: no step `uses` `actions/cache` (any subpath), and no step `with` holding a `cache` key |
| event text | No `run` string and no `with.prompt` string matches `/\$\{\{[^}]*\bgithub\.event\.(issue\|comment\|pull_request\|head_commit\|review)\b/` |

Effective permissions: job `permissions`, else workflow `permissions`, else repository default (`read`, per `workflow-permissions.json`). `write-all` means every scope is `write`; `{}` means none.

Self-test: start from the real tree as the green control, plus one in-memory **good** `release.yml` fixture (a `build-linux` job on `[self-hosted, legion]` and a `sign-publish` job with the write trio) so the positive cases are exercised. Then plant each fault as an in-memory mutation; each must go red naming file and job:
- `schedule:`;
- legion in `release.yml` `publish`;
- legion in `verify.yml`;
- a bare `self-hosted`;
- `secrets.X` in a build job;
- `environment:` in a build job;
- `actions/checkout@v4`;
- an unadmitted `foo/bar@<sha>`;
- an unused pattern;
- `workflow_run` without the guard;
- a chained `workflow_run` source;
- event text in `run:`;
- event text in `prompt:`;
- `issues: write` elsewhere;
- the write trio elsewhere;
- `pull_request` on `release.yml`;
- `actions/cache` in `release.yml`;
- claude-code-action with an App-token step;
- zero workflows.

### Anti-Patterns to Avoid
- **One `main` ruleset with owner bypass.** It bypasses the deletion and force-push rules as well (Pitfall 1).
- **`deployment_branch_policy: {"protected_branches": true}`.** That means "branches with protection rules". Whether ruleset-only protection counts is undocumented. Use `custom_branch_policies: true` plus a `main` branch policy.
- **Hard-coding the bot App id in the tracked tag ruleset.** It does not exist yet. Declare `"actor_id": "app:powerbrowser-bot"` and resolve it from `GET /orgs/{org}/installations` (`app_slug` → `app_id`) at apply and read-back time.
- **Pinning `patterns_allowed` to SHAs.** `sha_pinning_required` already forces SHAs, so every bump would also need a settings re-apply. Use `owner/repo@*`.
- **Treating a 403 or 404 as "setting absent" or a SKIP.** Absence evidence is not a setting value. Fail closed.
- **Generating App private keys in Phase 41.** Nothing consumes them until Phase 43, and SEC-08 forbids keys on legion.

## Settings bodies (prescriptive)

Values marked [VERIFIED] were read this session; field names come from the OpenAPI description at rest-api-description@755ee33b.

```jsonc
// ruleset-main-integrity.json — binds everyone, including the owner (SC2)
{"name":"main-integrity","target":"branch","enforcement":"active",
 "conditions":{"ref_name":{"include":["refs/heads/main"],"exclude":[]}},
 "bypass_actors":[],
 "rules":[{"type":"deletion"},{"type":"non_fast_forward"}]}

// ruleset-main-review.json — GH-05; owner (org owners) only bypass, mode always so direct owner commits still work
{"name":"main-review","target":"branch","enforcement":"active",
 "conditions":{"ref_name":{"include":["refs/heads/main"],"exclude":[]}},
 "bypass_actors":[{"actor_id":null,"actor_type":"OrganizationAdmin","bypass_mode":"always"}],
 "rules":[
  {"type":"required_status_checks","parameters":{"strict_required_status_checks_policy":false,"do_not_enforce_on_create":false,
    "required_status_checks":[{"context":"verify","integration_id":15368}]}},
  {"type":"pull_request","parameters":{"required_approving_review_count":1,"dismiss_stale_reviews_on_push":true,
    "require_code_owner_review":false,"require_last_push_approval":false,"required_review_thread_resolution":false,
    "allowed_merge_methods":["merge","squash","rebase"]}}]}

// ruleset-release-tags.json — GH-06; only the bot App may create/move/delete release tags; no required_signatures
{"name":"release-tags","target":"tag","enforcement":"active",
 "conditions":{"ref_name":{"include":["refs/tags/v[0-9]*.[0-9]*-[0-9]*"],"exclude":[]}},
 "bypass_actors":[{"actor_id":"app:powerbrowser-bot","actor_type":"Integration","bypass_mode":"always"}],
 "rules":[{"type":"creation"},{"type":"update","parameters":{"update_allows_fetch_and_merge":false}},
          {"type":"deletion"},{"type":"non_fast_forward"}]}

// environment-release.json (PUT /repos/{o}/{r}/environments/release)
{"wait_timer":0,"prevent_self_review":false,"reviewers":[{"type":"User","id":51835244}],
 "deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true},"can_admins_bypass":false}
// environment-descriptor.json
{"wait_timer":1440,"prevent_self_review":false,"reviewers":[{"type":"User","id":51835244}],
 "deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true},"can_admins_bypass":true}
// environment-bot.json / environment-fixer.json / environment-triage.json
{"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}
// environment-branch-policy-main.json (POST …/environments/{env}/deployment-branch-policies, for each env)
{"name":"main","type":"branch"}

// actions-permissions.json
{"enabled":true,"allowed_actions":"selected","sha_pinning_required":true}
// actions-selected.json
{"github_owned_allowed":true,"verified_allowed":false,"patterns_allowed":["cachix/install-nix-action@*"]}
// workflow-permissions.json
{"default_workflow_permissions":"read","can_approve_pull_request_reviews":false}
// fork-pr-approval.json
{"approval_policy":"all_external_contributors"}
// repo.json (PATCH /repos/{o}/{r})
{"has_discussions":true,"allow_auto_merge":true}
// immutable-releases.json / private-vulnerability-reporting.json (read-back expectation; apply = bodiless PUT)
{"enabled":true}
// org.json (read-back only)
{"two_factor_requirement_enabled":true,"owners":["ServerDestroyer","<second-owner-login>"]}
// app-powerbrowser-bot.json
{"slug":"powerbrowser-bot","permissions":{"contents":"write","pull_requests":"write","issues":"write",
 "administration":"read","vulnerability_alerts":"read","metadata":"read"},
 "repository_selection":"selected","repositories":["powerbrowser","powerbrowser-updates","homebrew-tap"]}
// app-powerbrowser-clock.json
{"slug":"powerbrowser-clock","permissions":{"actions":"write","metadata":"read"},
 "repository_selection":"selected","repositories":["powerbrowser"]}
```

Notes on these values:
- `15368` is the GitHub Actions app id [VERIFIED: `gh api apps/github-actions` → `{"id":15368,…"slug":"github-actions"}`]. The check-run name is `verify` [VERIFIED: check-runs on main]. It comes from `.github/workflows/verify.yml:28-29`: `jobs:` / `  verify:` (no `name:` key) [VERIFIED: read this session].
- `51835244` is the owner's id [VERIFIED: `gh api users/ServerDestroyer`].
- Enum values are quoted from the OpenAPI description [VERIFIED: rest-api-description@755ee33b]:
  - `approval_policy`: `"first_time_contributors_new_to_github","first_time_contributors","all_external_contributors"`
  - `allowed_actions`: `"all","local_only","selected"`
  - `actor_type`: `"Integration","OrganizationAdmin","RepositoryRole","Team","DeployKey","User"`
  - `bypass_mode`: `"always","pull_request","exempt"`
  - `current_user_can_bypass`: `"always","pull_requests_only","never","exempt"`
  - reviewer `type`: `"User","Team"`
- Permission keys come from the OpenAPI `app-permissions` schema: `vulnerability_alerts` ("manage Dependabot alerts"); `workflows` with enum `["write"]` only; `actions` ("GitHub Actions workflows, workflow runs, and artifacts").
- The `metadata: read` permission is granted to every App automatically. Declare it so the comparison is a deep equality.
- The tag pattern covers both `v153.5.1-1` and the two-part `v175.0-1`. It does **not** match the GSD milestone tags `v1.0`…`v1.4` that already exist on the remote, because those have no `-`. Ruleset patterns are fnmatch, and `*` does not cross `/` [CITED: OpenAPI deployment-branch-policy description, "Wildcard characters will not match `/`"]. It is broader than the `RELEASE_TAG` regex at `scripts/verify-release-identity.mjs:53`, `/^v(\d+)\.(\d+)(?:\.(\d+))?-(\d+)$/` [VERIFIED: Read], which is the safe direction for a protection rule.
- `descriptor` has `can_admins_bypass: true` because ARCHITECTURE.md:355 has the owner bypassing the 24-hour wait timer after the own-install hop. That flow needs admin bypass. `release` has `can_admins_bypass: false` (GH-07).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| GitHub auth, pagination, rate-limit headers | fetch + token plumbing | `gh api [--paginate] -H 'X-GitHub-Api-Version: 2022-11-28'` | gh already holds the owner token; no secret reaches our code |
| YAML parsing | regex/indent scanner | js-yaml 4.3.2 via createRequire from `theia/` | Multi-line `run:`, flow sequences, anchors |
| Template-injection, unpinned-uses, excessive-permissions audit | our own taint analysis | zizmor `--offline` | It covers more contexts than the GH-12 regex. The `workflows` row stays the project-specific trust map |
| App permission introspection | App JWT signing | `GET /orgs/{org}/installations` with the owner token | No private key needed. It returns `app_slug`, `app_id`, `permissions`, `repository_selection` [VERIFIED: OpenAPI `installation` schema fields] |
| Proving "owner force-push refused" | a destructive live push to `main` | `current_user_can_bypass: "never"` on `main-integrity` plus `GET /repos/{o}/{r}/rules/branches/main` | Read-only. A misconfigured live probe would rewrite `main` |

**Key insight:** every control here is a server-side setting whose truth lives at GitHub. The tree can only declare intent, so the value is in the read-back being exact (projection plus set equality) and fail-closed.

## Common Pitfalls

### Pitfall 1: Owner bypass on the `main` ruleset also bypasses force-push and deletion
**What goes wrong:** with one ruleset holding deletion, non_fast_forward, the required check and the review, plus `OrganizationAdmin` bypass `always`, the owner's `git push --force` to `main` succeeds. Success criterion 2 then fails.
**Why:** bypass applies per ruleset, to all its rules. RELEASING.md:305-322 already relied on this per-ruleset behaviour: "ruleset bypass is per-ruleset".
**How to avoid:** use `main-integrity` (bypass `[]`) and `main-review` (owner bypass). The read-back asserts `current_user_can_bypass === "never"` on `main-integrity`.
**Warning signs:** `GET rulesets/{id}` returns `current_user_can_bypass: "always"` for the integrity ruleset.

### Pitfall 2: The bot App cannot touch workflow files, and also cannot create a release whose target diverges in `.github/workflows/` from the default branch
**What goes wrong:** in Phase 49, `sign-publish` creates the Release and tag with the bot token for SHA X. If `main` gained a workflow change after X, the create call returns 404 or 403.
**Evidence:** [CITED: docs.github.com/en/rest/releases/releases] "If the commit identified by target_commitish … adds or modifies any file under .github/workflows/ relative to the repository's default branch, the authenticating token must be authorized to modify workflows. Otherwise, this endpoint returns 404 Not Found; some authentication paths surface 403 Resource not accessible by integration instead." The permissions table lists `PUT/DELETE contents`, `POST/PATCH git/refs` and `POST/PATCH releases` under "Workflows" with "Additional permissions ✓" [CITED: permissions-required-for-github-apps]. The git-push rejection text is "refusing to allow a GitHub App to create or update workflow `.github/workflows/…` without `workflows` permission" [CITED: actions/create-github-app-token#301].
**How to avoid:** this phase only records the finding in RELEASING.md and keeps `workflows` out of the App, asserted by the row. Phase 49 must release only from the tip of `main`, or from a SHA whose `.github/workflows/` is identical to main's. TRAIN-10's "tip of main or ancestor changing configuration.toml" rule needs this extra condition.

### Pitfall 3: Runner groups do not apply to a repository-level runner
**What goes wrong:** the probe "succeeds" on the org Default group, but RELEASING.md:269-277 registers the runner with `url = "https://github.com/DeBIOS-Foundation/powerbrowser"`, which is repository scope [VERIFIED: Read RELEASING.md:269-277]. A repo-scoped runner is in no group, so the restriction protects nothing.
**Why:** runner groups are an org and enterprise construct. "To control access to runners at the organization level, organizations using the GitHub Team plan can use runner groups." "All organizations have a single default runner group." [CITED: docs.github.com/en/actions/concepts/runners/runner-groups; …/manage-access]. Org groups also serve "only private repositories" by default ("you can override this").
**How to avoid:** record the probe result as a decision for Phase 49:
- If PATCHing the Default group to `restricted_to_workflows: true` sticks on Free, and so do `visibility: "selected"` and `allows_public_repositories: true`, then Phase 49 registers legion at **org** scope in that group.
- Otherwise it stays repo-scoped, and the `ACTIONS_RUNNER_HOOK_JOB_STARTED` hook is the only runner-bound control (SUMMARY Pitfall 3).

### Pitfall 4: `can_admins_bypass` is real but missing from the OpenAPI description
**What:** the PUT environment schema in rest-api-description@755ee33b has `additionalProperties: false` and no `can_admins_bypass`. Live GETs do return it: astral-sh/uv `automations` → `"can_admins_bypass":false`; cli/cli `copilot` → `true` [VERIFIED: gh api, public repos].
**How to avoid:**
- The apply script sends it, which is [ASSUMED] accepted; the Terraform and Pulumi providers expose it as an argument [CITED: pulumi.com github RepositoryEnvironment].
- The read-back asserts it.
- If the PUT rejects the key, the owner unticks "Allow administrators to bypass configured protection rules" in the UI, and the read-back still asserts it.

### Pitfall 5: Auto-created environments with a `null` branch policy
**What:** GitHub creates environments by itself. Public repos carry `copilot` with `deployment_branch_policy: null` [VERIFIED: zizmorcore/zizmor, cli/cli, pypa/gh-action-pypi-publish].
**How to avoid:** the null-policy check runs over **all** live environments, not only the declared ones, and environment names are compared as a set. A red here is correct: the owner then declares the environment or deletes it.

### Pitfall 6: The owner token lacks `admin:org`
**What:** `GET orgs/{org}/actions/runner-groups` and `GET orgs/{org}/actions/permissions` return 403 [VERIFIED].
**How to avoid:** keep `repo-controls` within `repo` + `read:org`. It reads no runner group in Phase 41; GH-11 is a recorded probe. The checkpoint runs `gh auth refresh -h github.com -s admin:org` for the probe only, and may remove the scope afterwards with `gh auth refresh -h github.com --remove-scopes admin:org`.

### Pitfall 7: Self-triggered events do not notify you
**What:** an assignment the owner makes to himself, or a pending deployment on a run the owner dispatched, may produce no push notification. GitHub treats "Your own updates" as an opt-in email category [CITED: docs.github.com configuring-notifications]. Mobile push covers "Direct mentions", "Assignments to issues or pull requests", "Requests to review a pull request" and "Requests to approve a deployment" [CITED: same page].
**How to avoid:** the **second owner account** created for SEC-06 runs both drills. It creates an issue assigned to the owner, and it dispatches a drill workflow whose job uses `environment: release`. Whether self-triggered events push at all is [ASSUMED]; the second-account route works either way.

### Pitfall 8: `selected-actions` before `actions-permissions` returns 409; patterns apply only to public repos
**How to avoid:** apply in the order given in Pattern 1. The repo is public [VERIFIED], so `patterns_allowed` applies [CITED: OpenAPI note "The `patterns_allowed` setting only applies to public repositories"].

### Pitfall 9: The drill workflow must be on `main`
**What:** `workflow_dispatch` needs the file on the default branch, and the `release` branch policy admits only `main`. Phase 40-08 (the push) has not run yet, and `workspace/deploy` is not pushed.
**How to avoid:** the Phase 41 checkpoint comes after the 40-08 push and pushes Phase 41's commits first. The owner pushes directly through the `main-review` bypass. `main-integrity` does not block a fast-forward push.

### Pitfall 10: The App installation repository list is not readable with an ordinary user token
**What:** `GET /repos/{o}/{r}/installation` needs an App JWT [VERIFIED 401]. `GET /user/installations` rejects the gh OAuth token [VERIFIED 403]. `GET /user/installations/{id}/repositories` answered `404 Not Found` for a fake id rather than the token-type 403, so it may accept the owner token for a real id [VERIFIED for the fake id only].
**How to avoid:** this is Open Question 1. The checkpoint probes it before the row's App half is finalised.

## Code Examples

### Read helper (fail closed, pinned API version)
```js
// verify-repo-controls.mjs: every live read goes through this
import { execFileSync } from 'node:child_process';
export function ghGet(path) {
  try {
    const out = execFileSync('gh', ['api', '-H', 'X-GitHub-Api-Version: 2022-11-28', path],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, body: JSON.parse(out) };
  } catch (e) {
    return { ok: false, why: `GET ${path} could not be read (${(e.stderr || e.message).toString().trim().split('\n')[0]}). `
      + 'Next step: run `gh auth status`; the row needs scopes repo and read:org.' };
  }
}
```

### Normalising an environment GET to the declared shape
```js
// live shape: protection_rules[{type:'wait_timer',wait_timer}|{type:'required_reviewers',prevent_self_review,reviewers:[{type,reviewer:{id}}]}|{type:'branch_policy'}]
function envProjection(live) {
  const r = live.protection_rules ?? [];
  const rev = r.find(x => x.type === 'required_reviewers');
  return {
    wait_timer: r.find(x => x.type === 'wait_timer')?.wait_timer ?? 0,
    prevent_self_review: rev?.prevent_self_review ?? false,
    reviewers: (rev?.reviewers ?? []).map(x => ({ type: x.type, id: x.reviewer.id })),
    deployment_branch_policy: live.deployment_branch_policy,   // null => red, always
    can_admins_bypass: live.can_admins_bypass,
  };
}
```
Shape source: OpenAPI `environment.protection_rules` anyOf, with `type` examples `wait_timer`, `required_reviewers` and `branch_policy` [VERIFIED: rest-api-description@755ee33b]. `can_admins_bypass` comes from live public-repo responses [VERIFIED].

### Owner checkpoint (exact commands, printed by `apply-repo-controls.mjs` without `--yes`)
```sh
# 0. after 40-08: main carries the Phase 41 commits
gh repo create DeBIOS-Foundation/powerbrowser-updates --public    # empty: no --add-readme
gh repo create DeBIOS-Foundation/homebrew-tap --public            # name: Open Question 3
# 1. UI: org Settings > Developer settings > GitHub Apps > New (twice), per app-*.json:
#    webhook "Active" unticked; "Only on this account"; NO private key generated (Phase 43 does that)
#    install powerbrowser-bot on powerbrowser, powerbrowser-updates, homebrew-tap; powerbrowser-clock on powerbrowser
# 2. UI: org Settings > Authentication security > Require two-factor authentication
#    invite the second owner (must already have 2FA); store both recovery-code sets offline
# 3. settings
node scripts/apply-repo-controls.mjs          # prints every gh api write it would make
node scripts/apply-repo-controls.mjs --yes    # executes them, in the Pattern 1 order
# 4. runner-group probe (GH-11)
gh auth refresh -h github.com -s admin:org
gh api orgs/DeBIOS-Foundation/actions/runner-groups
gh api -X PATCH orgs/DeBIOS-Foundation/actions/runner-groups/<default-id> \
  -f name=Default -F restricted_to_workflows=true \
  -f 'selected_workflows[]=DeBIOS-Foundation/powerbrowser/.github/workflows/release.yml@refs/heads/main'
gh api orgs/DeBIOS-Foundation/actions/runner-groups/<default-id>   # did restricted_to_workflows stick?
# 5. App repo-list probe (Open Question 1)
gh api orgs/DeBIOS-Foundation/installations --jq '.installations[] | {app_slug, id, repository_selection}'
gh api /user/installations/<id>/repositories --jq '[.repositories[].name]'
# 6. notifications (UI, owner account) then drills from the SECOND account
#    gh issue create -R DeBIOS-Foundation/powerbrowser --assignee ServerDestroyer -t "Notification drill" -b "..."
#    gh workflow run notify-drill.yml -R DeBIOS-Foundation/powerbrowser --ref main ; owner rejects it on the phone
# 7. read back
scripts/verify-platform.sh --only repo-controls
```
`PATCH runner-groups` field names are verbatim from the OpenAPI description: `name` (required), `visibility` enum `"selected","all","private"`, `allows_public_repositories`, `restricted_to_workflows`, and `selected_workflows` ("Note that a ref, tag, or long SHA is required") [VERIFIED]. The probe is a live write, so the owner runs it. If `selected_workflows` is accepted but has no effect on Free, the GET afterwards shows it.

### zizmor row on the current tree
```
$ zizmor --offline .github/workflows        # zizmor 1.29.0, locked nixpkgs
No findings to report. Good job! (6 suppressed)     exit 0
# planted fixture: on: issues; uses actions/checkout@v4; run: echo "${{ github.event.issue.title }}"
error[template-injection]  error[unpinned-uses]     exit 14
```
[VERIFIED: run this session.] The 6 suppressed findings show at `--persona=auditor`: `excessive-permissions` and `anonymous-definition` on both workflows, and `concurrency-limits` (help). They are below the default `regular` persona. Self-test: a mkdtemp `bad.yml` must exit non-zero naming `template-injection` and `unpinned-uses`, and a clean fixture must exit 0. Resolve the binary from `PATH`, else run `nix develop "$REPO_ROOT#theia" --command zizmor …`. Absent tooling fails naming the shell and never skips, following the existing `nsis` precedent at verify-platform.sh:4485-4489.

### Notification drill workflow (if the planner keeps one)
```yaml
name: Notification drill
on:
  workflow_dispatch:
permissions: {}
jobs:
  pending-deployment:
    runs-on: ubuntu-latest
    environment: release
    timeout-minutes: 5
    steps:
      - run: echo "Deployment approval reached the reviewer."
```
It passes every GH-12 rule (hosted runner, no `uses`, no secrets, no event text). Delete it after the drill or keep it as a re-runnable drill; see Open Question 4.

## Doc edits this phase owns (docs/RELEASING.md)

Locate by content; Phase 40 shifted the line numbers [VERIFIED: Read and grep this session].
- **`### The release environment and the rulesets`** (heading at :305). Rewrite it to the three rulesets and five environments above. This drops `release-tag-signatures` and the tag-pattern deployment policy.
- **`## Repository controls`** table (:428-453). One row per settings file and the apply script. Drop the "UI only" note for nothing that the API can do. Keep org 2FA as UI-only: `PATCH /orgs/{org}` has no `two_factor*` key [VERIFIED: OpenAPI].
- **`## Actions policy`** (:455-467). Keep it, and add the set-equality rule for `patterns_allowed`.
- **GH-06 removal.** Remove the signature-bound tag claim, now at :932-935: "An unsigned release-pattern tag is refused at push time by the bypass-free ruleset". Also correct the dependent statements that describe signed release tags:
  - :43, :193-194, :207, :413-426, :485-505 (`## Signing setup`), :580.
  - Phase 42 owns the full documentation rewrite (DOC-03..06). This phase must at least leave no statement claiming tags are signature-bound.
- **New subsections:**
  - the runner-group probe result (GH-11) and its Phase 49 consequence (Pitfall 3);
  - the notification setup and both drill outcomes with dates (GH-18);
  - SEC-06: 2FA date, second owner login, and "recovery codes stored offline: yes/date" (no location detail);
  - the Workflows-permission finding (Pitfall 2).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Classic branch protection | Repository rulesets (work on Free public repos; live `GET rulesets` returns `[]` and not an error) | — | STACK.md correction 4. The fallback is not needed |
| SHA pinning by convention only | `sha_pinning_required` repo setting | live field present [VERIFIED] | Server-side refusal of unpinned uses |
| Signed release tags (`required_signatures`) | Tag creation restricted to the bot App; immutable releases | SEED-002 §6 / decision 3 | `required_signatures` binds commits, not tag objects |
| Repo-level runner + label hygiene | Org runner group with selected workflows (Team), else the pre-job hook | — | Probe decides (GH-11) |

**Deprecated/outdated in the tree:**
- RELEASING.md's `release-tag-signatures` ruleset and its tag-pattern deployment policy.
- The descriptor-repository PAT row at :476 (superseded by App tokens; Phase 42 or 49 rewrites it).
- `tokenType = "access"` PAT runner registration at :272 (superseded by decision 2).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `PUT environments/{env}` accepts `can_admins_bypass` despite the OpenAPI schema omitting it | Pitfall 4 | Apply 422s. The owner unticks the box in the UI; read-back unchanged |
| A2 | `PATCH /repos/{o}/{r}` accepts `has_discussions` (absent from the OpenAPI PATCH schema; `gh repo edit --enable-discussions` exists [VERIFIED: gh 2.102.0 help]) | Settings bodies | Fall back to `gh repo edit --enable-discussions --enable-auto-merge` |
| A3 | "Tag created by anyone but powerbrowser-bot" means **release-shaped** tags. Milestone tags (`v1.x`, pushed by GSD `create_tag: true`) stay owner-creatable | Settings bodies | If the owner wants `~ALL`, GSD milestone tag pushes are refused from then on |
| A4 | A ruleset `Integration` bypass actor takes the App id (not the installation id), and tag creation through `POST /releases` is subject to tag rulesets and to that bypass | Settings bodies | `sign-publish` (Phase 49) cannot create its tag. Verify in Phase 49 |
| A5 | A GitHub App can be created and installed with no private key generated | Owner checkpoint | The owner generates one and must handle it (shred after `gh secret set`) |
| A6 | Self-triggered assignment and deployment-review events do not push to the actor's phone | Pitfall 7 | None if the second account runs the drills |
| A7 | GitHub-owned actions (`github_owned_allowed: true`) cover `actions/*` and `github/*` only | Settings bodies | An action from another GitHub org would need a pattern |
| A8 | `GET /orgs/{org}/installations` returns installed Apps with the `read:org` scope (OpenAPI says `admin:read`; the call returned 200 with zero installations) | Pattern 2 | Row red until the scope is added; it fails closed, never false-green |

## Open Questions (RESOLVED)

1. **Can the owner's gh token read an installation's repository list?**
   - What we know: `/user/installations` rejects the OAuth token; `/user/installations/{id}/repositories` returned 404 (not 403) for a fake id; every other route needs an App JWT or an installation token.
   - Recommendation: probe at the checkpoint (step 5).
     - If it returns 200, the row uses it.
     - If not, the row's App half asserts `repository_selection == "selected"` and permissions now. The repository-list set equality then moves to the Phase 43 `bot` job (`GET /installation/repositories` with the minted token). The fallback alternative is a device-flow App user token, which needs only the client id, no key and no stored secret. Record whichever path is taken.
   - RESOLVED: deferred to the 41-04 owner probe with stated branches (200 → row reads the list; refused → the owner chooses the device-flow App user token, or FALLBACK with a ledger deferral request for GH-10's list half).
2. **Runner-group "selected workflows" on Free (GH-11).**
   - RESOLVED: deferred to the 41-04 owner probe (step 4 records the result; Pitfall 3 states the Phase 49 consequence).
3. **Homebrew tap repo name.**
   - Recommendation: `homebrew-tap`, so that `brew tap DeBIOS-Foundation/tap` resolves to it, following the Homebrew `homebrew-<name>` convention [ASSUMED]. `homebrew-powerbrowser` is the alternative.
   - RESOLVED: `homebrew-tap` (orchestrator, recommended option); the 41-04 resume reply confirms the created name. The name appears once, in `app-powerbrowser-bot.json`.
4. **Keep or delete the notification drill workflow after GH-18?**
   - RESOLVED (recommendation): keep it. It is harmless (no secrets, needs approval, `main` only), it lets GH-18 be re-run after a phone change, and the `workflows` row covers it.
5. **One `main` ruleset (GH-05 wording) or two?**
   - RESOLVED: two (Pitfall 1). This is the only way success criterion 2 holds for the owner. The row asserts both. GH-05's "owner as the only bypass actor" holds for `main-review`, and `main-integrity` has none.
6. **Does an App without Workflows block pushes that touch workflow files?**
   - RESOLVED, HIGH: yes, for git push, the contents API, and Release or ref creation whose target differs in `.github/workflows/` from the default branch (Pitfall 2).
7. **Pre-existing ledger state.**
   - At session start the BAK hook reported the completion gate failing on `scripts/verify-ng-064-update-url.mjs` lock drift. That comes from Phase 40 UPD-12 changing the ng064 comparand.
   - Status: not Phase 41 scope, but it will block any phase-completion claim until the owner approves the lock change.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| gh CLI | apply, repo-controls | ✓ | 2.102.0; scopes `read:org, repo, workflow` | — |
| gh `admin:org` scope | GH-11 probe only | ✗ | — | `gh auth refresh -s admin:org` (owner, checkpoint) |
| node | all rows | ✓ | v24.21.0 | — |
| js-yaml | workflows row | ✓ (theia/node_modules) | 4.3.2 | Vendor into scripts/lib |
| zizmor | zizmor row | ✗ on PATH; ✓ via locked nixpkgs | 1.29.0 | `nix develop .#theia --command zizmor` once added to the shell |
| nix | zizmor provisioning | ✓ | — | — |
| `powerbrowser-updates`, tap repo, both Apps, second owner | GH-10, SEC-06 | ✗ | — | Owner creates at the checkpoint (no fallback) |

**Missing dependencies with no fallback:** the owner-created GitHub objects. They are the planned checkpoint and do not block the local work.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `scripts/verify-platform.sh` registry rows. Each script carries its own `--self-test` |
| Config file | none. Rows are appended to the CHECKS array: quick rows before `if [ "$QUICK" -eq 0 ]` (≈ line 4700), full rows inside it |
| Quick run command | `scripts/verify-platform.sh --only workflows` (likewise `workflows-self-test`, `zizmor`, `zizmor-self-test`, `repo-controls-self-test`) |
| Full suite command | `scripts/verify-platform.sh --quick`, then, after the checkpoint, `scripts/verify-platform.sh --only repo-controls` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GH-12 | workflow trust rules over the tree | static, quick | `scripts/verify-platform.sh --only workflows` / `--only workflows-self-test` | ❌ new `scripts/verify-workflows.mjs` |
| AUTO-09 | zizmor offline green; planted injection red | static, quick | `--only zizmor` / `--only zizmor-self-test` | ❌ new `scripts/verify-zizmor.mjs` |
| GH-02, GH-05..GH-10, SEC-11, SEC-06 (2FA, owners) | live state equals declared bodies | full (network) | `--only repo-controls` | ❌ new `scripts/verify-repo-controls.mjs` |
| GH-02 (self-test) | missing ruleset, null env policy, App with workflows, unreadable API go red | in-memory, quick | `--only repo-controls-self-test` | ❌ same file |
| GH-08 | settings file set equals the CONTROLS table | in-memory, quick | covered by `repo-controls-self-test` plus a tree check inside `repo-controls` | ❌ |
| GH-11, GH-18, SEC-06 (recovery codes) | probe and drills recorded | manual-only (owner UI or phone) | none: attestation in `docs/RELEASING.md` | — |

### Sampling Rate
- **Per task commit:** `scripts/verify-platform.sh --quick`, after `git add` of the new files (the residual-brand scan reads `git ls-files`).
- **Per wave merge:** `--quick` plus each new row's `--self-test`.
- **Phase gate:** `--quick` green, then the owner checkpoint, then `--only repo-controls` green.

### Wave 0 Gaps
None. The registry and the self-test conventions exist. The new scripts are the deliverables.

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (org) | Org 2FA requirement plus a second owner with offline recovery codes |
| V4 Access Control | yes | Rulesets (refs), environments with reviewers and branch policies (secrets), least-privilege Apps (no `workflows`), read-only default token, fork approval |
| V5 Input Validation | yes (workflows) | No event text interpolated into `run:` or `prompt:` (`workflows` row plus zizmor `template-injection`) |
| V6 Cryptography | no | — (MAR signing is Phase 44 and 49) |
| V10 Malicious Code / supply chain | yes | `allowed_actions: selected`, `sha_pinning_required`, set-equal admission, zizmor `unpinned-uses` |
| V14 Configuration | yes | Declared settings, a drift row, fail-closed reads |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Same-repo branch adds a workflow targeting legion | Elevation | No App holds `workflows`; `workflows` row (no `self-hosted`/`legion` outside release build jobs); Phase 49 pre-job hook; runner group if available |
| Environment secrets taken by a non-main branch | Information disclosure | Branch policy `main` on every environment; null-policy check over all live envs |
| Fork PR runs code on the self-hosted runner | Elevation | `all_external_contributors` approval before registration (SEC-11) |
| Bot or fixer self-merges via auto-merge | Tampering | `main-review` needs 1 approval; App not a bypass actor; `dismiss_stale_reviews_on_push: true`; `can_approve_pull_request_reviews: false` |
| Forged release tag | Spoofing | `release-tags` ruleset with bot-only bypass; owner `current_user_can_bypass: never` |
| Compromised third-party action tag | Tampering | SHA pins enforced server-side; admission list |
| Script injection from issue or PR text | Tampering | GH-12 event-text rule plus zizmor |
| History rewrite on `main` | Tampering/Repudiation | `main-integrity` with empty bypass |

## Sources

### Primary (HIGH confidence)
- **Live `gh api` GETs this session.** Repo, org, rulesets, environments, Actions permissions, fork approval, immutable releases, PVR, secrets, releases, installations, members, check-runs, app ids, public-repo environments.
- **github/rest-api-description@755ee33b (2026-10-18), `api.github.com.json`.** Request and response schemas for: PUT environment, deployment-branch-policies, Actions permissions, selected-actions, workflow permissions, fork-pr-contributor-approval, immutable-releases, PVR, rulesets (bypass actors, `current_user_can_bypass`), runner-groups PATCH, the installation schema, app-permissions, the PATCH repo keys and the org schema.
- **docs.github.com (fetched as article markdown).**
  - rest/releases/releases: the Workflows note on POST and PATCH releases.
  - rest/authentication/permissions-required-for-github-apps: the Workflows, Actions and Administration tables.
  - rest/repos/contents: the workflow scope.
  - apps/sharing-github-apps/registering-a-github-app-from-a-manifest.
  - actions/concepts/runners/runner-groups and how-tos/manage-runners/self-hosted-runners/manage-access.
  - subscriptions-and-notifications/get-started/configuring-notifications.
  - rest/deployments/environments.
- **Tree.** Files read this session:
  - `.github/workflows/verify.yml`, `.github/workflows/rebase-upstream.yml`
  - `scripts/verify-platform.sh` header and registry
  - `scripts/verify-release-identity.mjs:50-55`, `scripts/verify-upstream-pins.mjs` header, `scripts/lib/toml.cjs` header, `scripts/verify-vendored-parser.mjs` header
  - `flake.nix:1-60`, `configuration.toml:86-97`
  - `docs/RELEASING.md` :220-240, :268-281, :295-330, :413-505, :918-935
  - `theia/yarn.lock` js-yaml and yaml entries
- **Nix and tool runs.** `nix eval` of the locked nixpkgs zizmor version (1.29.0); zizmor run over the tree and over a planted fixture.

### Secondary (MEDIUM)
- actions/create-github-app-token#301: the push-rejection text.
- github.blog changelog 2023-03-01: admins can bypass environment protection rules.
- Pulumi github `RepositoryEnvironment` docs: `can_admins_bypass`.

### Tertiary (LOW)
- Homebrew tap naming convention (A, Open Question 3).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH. Versions were evaluated and run locally.
- REST bodies and read-back shapes: HIGH for schema-backed fields; MEDIUM for `can_admins_bypass` and `has_discussions` writes.
- Platform behaviours: HIGH for Workflows-permission blocking; LOW (needs a probe) for the Free runner-group restriction and the owner-token repo-list read.
- Pitfalls: HIGH. Most were reproduced against live responses or the tree.

**Research date:** 2026-10-21
**Valid until:** 2026-11-20. The GitHub REST surface moves; re-check `can_admins_bypass` and the API version header if the plan slips.
