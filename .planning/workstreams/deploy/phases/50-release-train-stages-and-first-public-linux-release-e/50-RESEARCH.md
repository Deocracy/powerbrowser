# Phase 50: Release train stages and first public Linux release (E) - Research

**Researched:** 2026-10-23
**Domain:** Release-train state derivation from GitHub facts, `release.yml` dispatch + SHA validation, withdraw-without-delete, KNOWN-ISSUES pinned issue, real-release (`served: release`) MAR hop drill, first public Linux release procedure
**Confidence:** HIGH for REST shapes and in-tree analogues; MEDIUM for three platform behaviours that need a live probe (immutable-release pre-release-flag edit, issue pinning via API, `gh attestation verify` auth inside a clean container); LOW for the ESR calendar pick (external gate, not researchable)

## Summary

Phase 50 closes the Linux loop: the train carries one release from a merged bump PR to a live descriptor by itself, a bad release can be withdrawn without deleting it, and the first public Linux release is live. All five requirements are extensions of mechanisms earlier phases own — Phase 50 builds no new framework and installs no package.

The work splits cleanly. The executor builds locally, against the SPEC text of the unlanded phases (43, 44, 46, 47, 48, 49) as written in ROADMAP/REQUIREMENTS/SUMMARY:

- **TRAIN-10:** extend the Phase 43 `scripts/release-train.mjs` state table with eight states (BUILDING, AWAITING_APPROVAL, PUBLISHED, DESCRIPTOR_WAIT, DESCRIPTOR_LIVE, LIVE_RED, WITHDRAWN, DONE), derived from the `release.yml` run, pending deployments, the Release, and the `powerbrowser-updates` contents; add the dispatch-`release.yml`-with-merge-SHA step plus the exact-run link; add the SHA-validation first step to `release.yml` (the only `release.yml` edit this phase owns); extend `release-train-logic-self-test` with one fixture per new state plus SHA plants, still set-equality.
- **REL-02:** add a `workflow_dispatch` withdraw workflow in `powerbrowser-updates` (bot App token, installed on both repos per GH-10) that commits the no-update descriptor per target, reruns `channel-live`, and marks the product Release per the pre-recorded immutable-release probe; never delete.
- **GH-15:** add one report-job step that copies `docs/KNOWN-ISSUES.md` bytes into one pinned issue (create once, update by exact-bytes compare).
- **UPD-16:** add a `served: release` mode to the existing hop script (not a second script) with the release assertion set, run from a clean non-Nix container/VM on legion, with one fault plant per property.
- **REL-03:** execute the first public Linux release as owner checkpoints (bump PR merge, `release` approval, hop passed, /download live, `descriptor` approval after the owner's own N-1 to N hop), ending with `checkpoint:human-action` / `checkpoint:human-approval` steps; the executor merges, approves, pushes, or marks nothing.

Live baseline this session (read-only `gh api`, token scopes `read:org, repo, workflow`): **0 Releases**, immutable releases currently **disabled** (`enabled: false`), the `powerbrowser-updates` repo **absent (404)**, 2 active workflows (`verify.yml`, `rebase-upstream.yml`), 16 total runs, 1 unrelated open issue, `release-train.mjs` / `detect-upstreams.mjs` / `build-update-xml.mjs` / `docs/KNOWN-ISSUES.md` all absent (Phases 42/43/44), allowlist at 29 hosts with `github.com` present as `user-initiated` but `release-assets.githubusercontent.com` and `crash-reports.mozilla.com` absent (UPD-15/UPD-05 work remains), `signmar` present at `objdir/dist/bin/signmar`, `gh attestation` available.

Four facts change the plan's shape:

1. **The bot App cannot create a Release from a SHA whose `.github/workflows/` differs from `main`'s.** GitHub refuses the create call (404/403) when the target commit adds or modifies workflow files relative to the default branch unless the token holds Workflows (41-RESEARCH Pitfall 2, HIGH). TRAIN-10's "tip of `main` or a `configuration.toml`-changing ancestor" rule therefore needs one extra conjunct: the dispatched SHA's `.github/workflows/` tree must be identical to `main`'s, or the SHA must be the tip. The SHA-validation step asserts this.
2. **The train cannot dispatch `release.yml` with the bot App token.** The bot App holds Contents/PRs/Issues read-write only (GH-10); dispatching a workflow needs Actions write. The dispatch step must use a token with `actions: write` — the clock App token (Actions read/write, installed on `powerbrowser`) or an explicit `permissions: actions: write` on the dispatch job's `GITHUB_TOKEN`. The `workflows` row must admit whichever path the planner picks. This is a Phase 43/49 interface the Phase 50 plan must pin down, not invent.
3. **`channel-live` as specified (UPD-17) goes red on a withdrawn release by construction.** It requires the offered version to equal the latest Release; after a withdraw the offered descriptor is no-update while the (never deleted) latest Release is still the bad tag. The withdraw job must therefore rerun `channel-live` in a no-update-expecting mode (or assert the no-update shape directly) — running the unmodified gate and expecting green is a contradiction.
4. **Issue pinning has no REST endpoint.** Pinning is a GraphQL `pinIssue` mutation (max 3 pinned per repo) or a manual owner click. The report job creates/updates the issue body through REST (which it already has via `issues: write` on the `report` job) and pins once via GraphQL with the bot App token; if the mutation is unavailable to the App token, pinning becomes a one-time owner click recorded in `docs/RELEASING.md` and the job only maintains the body.

**Primary recommendation:** model every new train state as one row in the Phase 43 state table with a named derivation (exact endpoint + projection + which field decides), keep `derive`/`next`/`render` pure, and extend the self-test by fixture-per-state with the state list derived from the table itself. Put the SHA check as the first `run:` step of the legion `build-linux` job (and every legion job per SEC-10), failing red with the SHA, the tip, and the `configuration.toml` verdict. Put the withdraw job in `powerbrowser-updates`, not the product repo. Give the hop script a `served` selector (`loopback` keeps today's behaviour byte-for-byte; `release` takes the release assertion set and never demands an access log).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Release state truth | GitHub facts (runs, pending deployments, Releases, updates-repo contents) | — | TRAIN-02/03: no stored state; the tracking issue is a view, never read back |
| State derivation | `scripts/release-train.mjs` `derive`/`next`/`render` pure functions + one state table | — | Phase 43 skeleton; Phase 50 only adds rows |
| Release actuation | `release.yml` (Phase 49: build-linux, sign-publish, descriptor, channel-live) | Train dispatch + SHA-validation step (Phase 50 edit) | One pipeline, one caller |
| Withdrawal | `powerbrowser-updates` `workflow_dispatch` withdraw workflow | Product Release `prerelease` flag or notes edit | REL-02 lives where its Contents write applies; never delete |
| Known-issues surface | `docs/KNOWN-ISSUES.md` (Phase 42 source) | One pinned issue maintained by the train report job | GH-15: bytes flow one way, file → issue |
| Update proof | `scripts/verify-mar-update-hop.mjs` `served: release` mode | `channel-live` job + sweep observation (criterion 5) | Same script, selected assertion set (S5 precedent) |
| Drift detection | `release-train-logic-self-test` (quick) + live train runs + `channel-live` (full) | Maintenance sweep rows (Phase 48, observed only) | Network needed, so live halves are never `--quick` |
| Workflow trust boundary | `workflows` + `zizmor` quick rows (static, Phase 41) | — | Must hold on every commit, offline; Phase 50 adds workflows but no new rule |

## User Constraints (from CONTEXT.md)

<user_constraints>
### Locked Decisions
#### Already decided (owner, 2026-10-20)
- All owner decisions in REQUIREMENTS.md "Owner Decisions" are binding: Apps only, no PATs; bot App without the Workflows permission; non-ephemeral legion runner (Phase 49); fork approval for all external contributors; tags created only by the bot App after `release` approval; one release per ESR point release plus out-of-band revision bumps; 24-hour canary wait plus owner-as-reviewer on `descriptor` (decision 18); Releases are never deleted, the fix is a new revision; immutable releases on with zero Releases (GH-09).
- Decision 13: no `release.json`, no version facts on the home page. The tracking issue is a view rendered from GitHub facts, never read back as state (TRAIN-02).

#### Owner gates in this phase (stop points for autonomous execution)
- Every live GitHub action is an owner action: merging the bump PR, approving the `release` environment, running the N-to-N+1 hop on legion, approving the `descriptor` environment after the owner's own N-1 to N hop, publishing /download, and the immutable-release pre-release-flag probe (REL-02). Plans build everything locally — `release-train.mjs` state extensions, `release.yml` SHA validation, the withdraw job, the `served: release` hop extension, the pinned KNOWN-ISSUES issue — and end with `checkpoint:human-action` / `checkpoint:human-approval` steps listing the exact commands; no executor task merges, approves, pushes to `powerbrowser-updates`, or marks a Release.
- Read-only `gh api` calls against the live org/repo are allowed for research and for deriving train states.
- The ESR 153 calendar decides which point release becomes the first public release (External gate). The plan records the calendar rule; the executor does not pick a date.

### Claude's Discretion
All other implementation choices are at Claude's discretion — discuss phase was skipped per user setting. Use the ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Full text (from REQUIREMENTS.md) | Research Support |
|----|-------------|------------------|
| TRAIN-10 | The train adds the states BUILDING, AWAITING_APPROVAL, PUBLISHED, DESCRIPTOR_WAIT, DESCRIPTOR_LIVE, LIVE_RED, WITHDRAWN and DONE, derived from the `release.yml` run, pending deployments, the Release and the `powerbrowser-updates` contents. It dispatches `release.yml` with the merge SHA after the bump PR merges, and links the exact run in the tracking issue. Before building, `release.yml` validates that the dispatched SHA is the tip of `main`, or an ancestor of it whose commit changes `configuration.toml`, and exits otherwise. (E) | §Pattern 1 (per-state REST shapes + derivation table), §Pattern 2 (SHA-validation placement + the workflows-tree conjunct), §Pattern 6 (self-test extension: fixture per state, set-equality, SHA plants), §Validation |
| REL-02 | A `workflow_dispatch` withdraw job in `powerbrowser-updates` commits the no-update descriptor for every target and reruns `channel-live`. It marks the product repo's Release as a pre-release with a bot App token (the App is installed on both repos, GH-10). A probe, run before the first public release and recorded in `docs/RELEASING.md`, shows whether immutable releases still allow the pre-release flag change; if not, the withdraw job marks the withdrawal in the Release notes instead. Releases are never deleted, and the fix is a new revision. (E) | §Pattern 3 (where it lives, token scope, no-update bytes, R2 alternative, channel-live rerun mode, probe procedure, never-delete), §Validation |
| GH-15 | Once a train reaches PUBLISHED, the train's report job copies `docs/KNOWN-ISSUES.md` into one pinned issue. (E) | §Pattern 4 (create-once/update-by-bytes rule, pin via GraphQL with manual fallback, source-at-merge-SHA), §Validation |
| UPD-16 | The real-release hop drill (`served: release`) runs N to N+1 from a clean non-Nix Linux container or VM on legion. It proves hosts, hash, version, signature, allowed channels and attestation, with fault plants. (E) | §Pattern 5 (`served` selector, inputs, six-property assertion list, plant list, clean non-Nix procedure, auth handling for attestation), §Validation |
| REL-03 | The first public Linux release is published: the bump PR merged, `release` approved, the hop drill passed, /download live, and the descriptor released after the owner's `descriptor` approval. (E) | §Release procedure (owner checkpoint sequence, calendar rule, criterion-5 observation), §What Phase 50 Must NOT Build, §Validation |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **One driver, one registry.** Every new check is one row appended to `scripts/verify-platform.sh` CHECKS. No sibling driver. The new quick rows are `release-train-logic-self-test` extensions (same row, more fixtures — no new row needed for TRAIN-10 logic) and the hop self-test extensions (same row); any genuinely new gate (e.g. a withdraw-shape check, if the planner adds one) is one row with its `--self-test`.
- **Self-test.** Every new or extended check plants each fault and requires it to go red naming the drift. Phase 50 extends two existing self-tests; each new plant names the file/field/value.
- **Derive and compare.** Derive the expectation from the tree (state list from the table, consumer sets from `git ls-files`, asset sets from the manifest) and compare as set equality, red on both addition and removal. Never hand-keep a state list, a target list, or an asset list.
- **Absence-of-log assertions.** Never assert the absence of a log line emitted by the planner's own instrumentation. The hop's zero-Mozilla-host assertion is over the client's own `Resolving host [...]` lines (code under test), with the capture-broken detectors (empty extract fails; serving host must appear unless literal IP) — the existing pattern, kept.
- **Quick tier.** `--quick` rows use no build, no browser, no display and no network. `release-train-logic-self-test` extensions stay in-memory fixture JSON (quick-honest). The `served: release` hop self-test plants stay mkdtemp + `node:crypto` + loopback server (quick-honest, S5 precedent); the live drill is full-tier.
- **Residual-brand scan.** `node scripts/scan-brand-residue.mjs` must stay at exit 0. It iterates `git ls-files`, so **stage new files before trusting a green scan**. The originating product's name may appear only in `inventory/brand-tokens.json`.
- **Rebrand inputs.** Derive owner/repo from `configuration.toml [urls].release_notes`, never from a literal in the scripts (the `verify-repo-controls.mjs` `repoSlug` precedent).
- **No internal identifiers in user-facing copy.** The pinned KNOWN-ISSUES issue body is user-facing: it names "PowerBrowser", states each issue in plain language, and ends with an on-screen next step. No pref key, SHA, run id, or exception text in that body; identifiers live in the tracking issue (operator surface), not the pinned issue.
- **Builds in Nix dev shells; no `ledger/` edits.** `ledger/` paths are hook-blocked. v1.6 ledger rows carry `"stream": "deploy"` and are due per `plan-gate.py`, not hand-edited here.

## Live baseline (read-only, 2026-10-23)

All [VERIFIED: `gh api` GET this session, token scopes `read:org, repo, workflow`] unless marked [CITED] (docs) or [ASSUMED]:

| Probe | Response (verbatim / précis) |
|---|---|
| `GET repos/DeBIOS-Foundation/powerbrowser/releases` | `[]` — zero Releases, so GH-09's immutable-releases guard still can be enabled before any Release exists |
| `GET repos/DeBIOS-Foundation/powerbrowser/immutable-releases` | `{"enabled":false,"enforced_by_owner":false}` — the REL-02 probe has a clean surface to run against |
| `GET repos/DeBIOS-Foundation/powerbrowser/actions/workflows` | 2 active: `Rebase upstream` (`.github/workflows/rebase-upstream.yml`), `Verify static layers` (`.github/workflows/verify.yml`) — `release.yml` and `release-train.yml` absent, as expected (Phases 43/49) |
| `GET repos/.../actions/runs?per_page=3` | Sample: Rebase run `39812661550` (`workflow_dispatch` on `workspace/deploy`, `head_sha b179d7f…`, `status completed`, `conclusion success`); Verify run `39812648941` (`push`, same SHA, success). Shape confirms the fields `derive` needs: `id, head_sha, head_branch, event, status, conclusion, html_url` |
| `GET repos/.../actions/runs/39812661550/pending_deployments` | `[]` on a completed run — the AWAITING_APPROVAL/DESCRIPTOR_WAIT derivation reads non-empty here on a waiting run |
| `GET repos/.../actions/runs/39812661550/jobs` | `[{name: rebase, status: completed, conclusion: success}]` — per-job shape for BUILDING-vs-red derivation |
| `GET repos/DeBIOS-Foundation/powerbrowser/deployments?per_page=3` | `[]` — no deployments yet; environment-gated jobs will create them |
| `GET search/issues?q=repo:…+label:release-train` | `{"total_count":0}` — no tracking issues yet (Phase 43) |
| `GET repos/.../issues?state=all&per_page=5` | 1 open, unrelated (`Chrome bar must fill the top-panel row`), unlocked — no KNOWN-ISSUES pinned issue yet |
| `GET repos/DeBIOS-Foundation/powerbrowser-updates` | **404 Not Found** — the updates repo, the withdraw workflow home, and the Pages project do not exist (Phase 47) |
| `git rev-parse HEAD` (worktree) | `f470e0fcd44a17c4be07d26aab1117417a9cc5dc` — SHA-validation fixtures use this shape (40-hex) |
| `objdir/dist/bin/signmar` | present — the hop's `signmar -v` assertion has its binary today |
| `gh attestation --help` | available (`Download and verify artifact attestations`) — the hop's attestation assertion has its CLI today |
| `powerbrowser/endpoint-allowlist.json` | 29 hosts; `github.com` present (`user-initiated`, `manifest: urls.release_notes`); `release-assets.githubusercontent.com` **absent**; `crash-reports.mozilla.com` **absent**; `aus5.mozilla.org` `deny`; `updates.powerbrowser.org` `allow` |
| `docs/KNOWN-ISSUES.md` | **absent** — Phase 42 (GH-14) owns its creation; GH-15 only copies it |
| `scripts/release-train.mjs`, `scripts/detect-upstreams.mjs`, `scripts/build-update-xml.mjs` | **absent** — Phases 43/44 own them; Phase 50 extends, never creates the skeleton |
| `scripts/verify-platform.sh` registry | `mar-update-hop` (full) + `mar-update-hop-self-test` (quick) present; `release-identity`, `update-channel`, `repo-controls`, `workflows` rows present; no `release-train-logic`, `channel-live`, `descriptor-monotonic`, `updates-repo-static` rows yet |

`R=DeBIOS-Foundation/powerbrowser`. Pin `X-GitHub-Api-Version: 2022-11-28` on every call in the train and withdraw scripts (the 41-RESEARCH precedent), so a default-version change cannot reshape responses silently.

## Standard Stack

No new package, no new framework. Everything reuses what the tree or the platform already provides.

| Tool | Version (verified) | Purpose | Note |
|------|--------------------|---------|------|
| `gh` CLI (`gh api`, `gh release`, `gh attestation`) | 2.102.0 (nixpkgs, on PATH) | All REST reads; Release download/view; attestation verify; withdraw marking | Already the documented operator path; no token handling in our code (tokens arrive as `GITHUB_TOKEN` or a just-minted App token) |
| GitHub REST API | `2022-11-28` (pinned header) | Runs, jobs, pending deployments, Releases, issues, updates-repo contents | Schemas checked against `github/rest-api-description` main @ `755ee33b` (41-RESEARCH precedent); new endpoints needed here are listed in Pattern 1 |
| GitHub GraphQL `pinIssue` | current | Pinning the one KNOWN-ISSUES issue (max 3 pinned) | REST has no pin endpoint; GraphQL mutation or one owner click as fallback |
| `actions/create-github-app-token` | v3.3.0 SHA (STACK/SUMMARY; admitted via `actions-selected.json`) | Minting the bot App token just before use (dispatch, withdraw, report) | Per-step `permission-*` inputs; token revoked at job end; 1-hour expiry means mint-just-before-use |
| `actions/attest-build-provenance` | v4.2.2 SHA (SUMMARY) | Build provenance attestation in `sign-publish` (Phase 49); verified by the hop | Hop runs `gh attestation verify`, plus the offline `--bundle` alternative noted for /download |
| Node | v24.21.0 | `release-train.mjs`, hop script, withdraw helpers | Matches flake `nodejs_24` |
| `signmar` (container-built) | from the Phase 45 container build | MAR sign (Phase 49) and `signmar -v` in the hop | Same binary both halves; no Nix in the sign/hop path |
| podman + Debian bookworm image | already on legion (SUMMARY) | Clean non-Nix hop container (UPD-16) | Same image family as the PKG-17 release container; proves the portable-elf claim |
| js-yaml via createRequire from `theia/` | 4.3.2 (already locked) | Only if a new static row parses YAML | No new dependency; the `verify-workflows.mjs` precedent |

**Installation:** none. If the planner adds a static row that parses YAML, reuse the `verify-workflows.mjs` instrument; do not add a dependency.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Withdraw workflow in `powerbrowser-updates` | A withdraw job in the product repo's `release.yml` | Product-repo job would need a cross-repo Contents write, widening `release.yml`'s token and complicating the `workflows` trust map; the updates repo is where the descriptor write applies, so the token stays scoped there. Reject — REL-02 names `powerbrowser-updates` |
| `served: release` selector on the hop script | A second hop script for releases | Two scripts drift apart (descriptor shape, sift, verdicts); S5 already decided the selector, and `buildUpdateXml` stays the single source via import. Reject |
| Train dispatches `release.yml` with the bot App token | Clock App token or `GITHUB_TOKEN` with `actions: write` on the dispatch job | Bot App lacks Actions scope, so dispatch 403s; the clock App holds Actions read/write (GH-10) and is installed on `powerbrowser`. Use the clock token (or an explicit `actions: write` permission) — planner pins one down |
| Pinned-issue update by delete-and-recreate | PATCH only when bytes differ (TRAIN-02 rule) | Delete-and-recreate loses pinning, comments, and subscribers, and spams notifications. Reject — create once, PATCH on diff |
| SHA validation as a `github-script` expression | A `run:` step with `git` plumbing | Expressions cannot do `merge-base --is-ancestor` + `diff-tree --name-only` + workflows-tree comparison readably, and inline `${{ inputs.* }}` in scripts risks the GH-12 event-text rule. Use `env:`-passed values + a `run:` step (the rebase-upstream.yml precedent) |
| Attestation verify inside the clean container via `gh` login | `--bundle` offline form with a bundle fetched on the host | Container login needs a credential inside the clean room, which weakens the "clean" claim; the bundle form keeps the container credential-free. Prefer bundle; document both |

## Package Legitimacy Audit

No npm, PyPI, crates, or container package is installed by this phase.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| *(none)* | — | — | — | — | — | No new install; the Debian bookworm image for the hop container is the same family PKG-17 (Phase 45) already pulls |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
  bump PR merged (owner)
        │
        ▼
  release-train.yml (Phase 43 skeleton: derive/detect/bump/bump-pr/report)
        │  derive(facts) → state   [Phase 50 adds 8 rows to the ONE table]
        │  next(state)   → action  [dispatch-release with merge SHA; wait; report]
        │  render(state) → issue body (PATCH only on diff; link exact run)
        ▼
  release.yml (Phase 49: build-linux → sign-publish → descriptor → channel-live)
        │  first step: SHA validation (Phase 50's ONLY release.yml edit)
        │  dispatch input: merge_sha (required string) + run linkage by head_sha
        ▼
  Release (draft → published, bot App token; tag v<ESR>-<revision>, GH-06)
        │  24h wait + owner descriptor approval (decision 18)
        ▼
  powerbrowser-updates contents (Phase 47 host; Phase 44 builder)
        │  descriptor per BUILD_TARGET; channel-live byte-equality + HEAD 200
        ▼
  DESCRIPTOR_LIVE → DONE (issue closed) | LIVE_RED (issue + fix-by-new-revision)
        │
  withdraw path (REL-02, separate workflow in powerbrowser-updates)
        │  no-update descriptor per target → channel-live rerun
        └──► Release marked (prerelease flag per probe, else notes) → WITHDRAWN
                → tracking issue reopened; fix is a NEW revision (never delete)

  PUBLISHED ──► report job copies docs/KNOWN-ISSUES.md → ONE pinned issue (GH-15)
  Release assets + public descriptor ──► served:release hop on clean non-Nix
        legion container (UPD-16) ──► hosts/hash/version/signature/channels/attestation
```

### Recommended Project Structure

```
scripts/
├── release-train.mjs              # Phase 43 skeleton; Phase 50 EXTENDS the state table + derive/next/render (no new file)
├── detect-upstreams.mjs           # Phase 43; read-only input to derive (pin vs tags)
├── build-update-xml.mjs           # Phase 44; imports buildUpdateXml from verify-mar-update-hop.mjs (unchanged)
└── verify-mar-update-hop.mjs      # EXTEND: served selector (loopback | release) + release assertion set + plants
.github/workflows/
├── release-train.yml              # Phase 43; Phase 50 EXTENDS report job (run link, KNOWN-ISSUES step) + dispatch-release job
└── release.yml                    # Phase 49; Phase 50's ONLY edit: SHA-validation first step (+ merge_sha input if absent)
powerbrowser-updates/             # separate repo (Phase 47 creates; 404 today)
└── .github/workflows/
    └── withdraw.yml               # NEW (REL-02): workflow_dispatch withdraw job
docs/
├── KNOWN-ISSUES.md                # Phase 42 (GH-14) creates; Phase 50 only reads it
└── RELEASING.md                   # EXTEND: immutable-release probe result, withdraw runbook, hop record, GH-15 pin link
```

The state list, the BUILD_TARGET set, and the asset set are all derived at check time and compared as set equality. Nothing is hand-kept.

### Pattern 1: The eight new train states — one row each, derived from GitHub facts only

`derive(facts) → state` stays pure and synchronous over fixture JSON (the Phase 43 contract, TRAIN-09). Facts are gathered by one collector that issues only read-only GETs. Every endpoint below is [VERIFIED: probed this session or schema-cited in 41-RESEARCH] except where marked [ASSUMED] (same-shape as a verified sibling).

**Collector inputs (all pinned `X-GitHub-Api-Version: 2022-11-28`):**

| Fact | Endpoint | Deciding fields |
|---|---|---|
| `releaseYmlRun` | `GET repos/{o}/{r}/actions/workflows/release.yml/runs?head_sha={mergeSHA}&event=workflow_dispatch&per_page=10` then `GET repos/{o}/{r}/actions/runs/{run_id}` + `.../jobs` | `status` (`queued`/`in_progress`/`waiting`/`completed`), `conclusion`, `html_url`, `head_sha`, per-job `{name, status, conclusion}` |
| `pendingDeployments` | `GET repos/{o}/{r}/actions/runs/{run_id}/pending_deployments` | `[]` vs `[{environment: {name: release\|descriptor}, ...}]` ([VERIFIED]: `[]` on a completed run this session) |
| `release` | `GET repos/{o}/{r}/releases/tags/{tag}` | `draft: bool`, `prerelease: bool`, `tag_name`, `assets: [{name, browser_download_url}]`, `body` (withdrawal marker) |
| `descriptors` | `GET repos/{o}/{updates}/contents/{channel}/{target}/update.xml?ref=main` per BUILD_TARGET (targets from `release-manifest.json` artifact / `build-update-xml` target table) | `content` (base64 → bytes), `sha`; byte-compare with the served public bytes |
| `channelLive` | `channel-live` job conclusion (a job in the run) + the UPD-17 checks (byte-equal, MAR HEAD 200, offered version == latest Release) | green / red + which subcheck |
| `trackingIssue` | `GET search/issues?q=repo:{o}/{r}+label:release-train+{key}` then `GET repos/{o}/{r}/issues/{n}` | `state` (open/closed), `locked`, body bytes (for PATCH-on-diff) |

**State table extension (append to the Phase 43 table; order is evaluation priority, first match wins):**

| State | Derives from (all must hold) | `next(state)` action |
|---|---|---|
| BUILDING | `releaseYmlRun` exists and `status ∈ {queued, in_progress}` (or `waiting` with no pending-deployment entry yet); `release` absent or still draft without full asset set | wait (no-op; report renders progress + run link) |
| AWAITING_APPROVAL | run `status == waiting` (or `completed` with a pending step) **and** `pendingDeployments` names environment `release` | notify owner (@-mention + assignment, TRAIN-02: only on entering a needs-owner state); wait |
| PUBLISHED | `release.draft == false`, `prerelease == false`, asset set equals manifest-derived set (DIST-07 check already ran in `sign-publish`); descriptors still no-update or absent | trigger GH-15 copy (§Pattern 4); wait for descriptor window |
| DESCRIPTOR_WAIT | PUBLISHED **and** (`pendingDeployments` names `descriptor` **or** run waiting on the 1440-min timer) **and** updates contents not yet the release descriptor | notify owner (descriptor approval after own N-1→N hop, decision 18); wait |
| DESCRIPTOR_LIVE | updates contents byte-equal the served public descriptor **and** `channelLive` green (byte-equal repo copy, MAR HEAD 200, offered version == latest Release) | close tracking issue (TRAIN-02), move to DONE |
| LIVE_RED | descriptors present but `channelLive` red (byte mismatch / MAR 404 / version drift) | label `train:blocked`, assign owner, link failing log (TRAIN-06 Phase F owns the fixer routing; Phase 50 only opens/links, never starts the fixer for `release.yml` failures — SUMMARY correction 2) |
| WITHDRAWN | `release.prerelease == true` (probe-allowed branch) **or** `release.body` carries the withdrawal marker (notes branch) **and** descriptors are no-update | reopen tracking issue (TRAIN-02); report renders the new-revision instruction |
| DONE | DESCRIPTOR_LIVE **and** tracking issue closed | terminal; no action |

Disambiguation rules the planner must encode (all follow the "derive from tree, compare" discipline):

- DONE vs DESCRIPTOR_LIVE: DESCRIPTOR_LIVE is the fact state; DONE is the bookkeeping state (issue closed + locked per TRAIN-02). `derive` returns DONE only when the issue is already closed; `next(DESCRIPTOR_LIVE)` closes it. This keeps `derive` a pure function of facts including the issue's own `state` (which is a GitHub fact, not stored train state — reading it is allowed; using it as a transition memory is not).
- PUBLISHED vs DESCRIPTOR_WAIT: PUBLISHED means the Release is out but the descriptor gate has not engaged; DESCRIPTOR_WAIT means the gate has engaged (pending deployment or timer). The pending-deployments read is what separates them.
- LIVE_RED is sticky until the next green `channel-live` (re-run daily in the sweep per UPD-17, plus the release's own final job). Do not auto-clear on a new train run without a fresh green.
- WITHDRAWN outranks DESCRIPTOR_LIVE/LIVE_RED when the Release carries the withdrawal mark, even if bytes momentarily agree — the mark is authoritative.
- One transition per release per run (TRAIN-03, unchanged). The run ends at owner gates (merge, `release` approval, `descriptor` approval).

**Dispatch + run link (TRAIN-10, second sentence).** After the bump PR merges (`BUMP_PR_GREEN` + merge event on `chore/esr-<tag>`), the `dispatch-release` job (token with `actions: write` — §Alternatives Considered) issues:

```
POST repos/{o}/{r}/actions/workflows/release.yml/dispatches
  { "ref": "main", "inputs": { "merge_sha": "<merge commit SHA>" } }
```

then resolves the exact run (eventual consistency: poll up to N minutes):

```
GET repos/{o}/{r}/actions/workflows/release.yml/runs?head_sha={mergeSHA}&event=workflow_dispatch
→ take the newest run with head_sha == mergeSHA → html_url
```

and the report job renders `Release run: <html_url> (SHA <mergeSHA>)` into the tracking issue body. The run lookup matches on `head_sha` equality, never on "latest run", so two trains cannot cross-link. If no run appears within the poll window, the issue links the workflow page + the SHA and stays in BUILDING-waiting (never fabricate a run id).

### Pattern 2: SHA validation — placement, exact logic, and the workflows-tree conjunct

**Placement (TRAIN-10, third sentence; SEC-10).** As the **first `run:` step of the legion `build-linux` job**, before any build step, and (per SEC-10) as the first step of **every** legion job. It runs after checkout with `fetch-depth: 0` (ancestry + tip comparison need history; `verify.yml:46` already sets `fetch-depth: 0` for the same reason). Inputs arrive via `env:` (never inline `${{ }}` in `run:`, the GH-12 event-text precedent):

```yaml
on:
  workflow_dispatch:
    inputs:
      merge_sha:
        description: "Bump-PR merge commit SHA the train dispatches"
        required: true
        type: string
jobs:
  build-linux:
    runs-on: [self-hosted, legion]
    permissions:
      contents: read
    # NO environment:, NO secrets.* anywhere in this job (workflows row enforces)
    steps:
      - uses: actions/checkout@<40-hex> # vX.Y.Z
        with:
          persist-credentials: false
          fetch-depth: 0
      - name: Validate the dispatched SHA
        env:
          MERGE_SHA: ${{ inputs.merge_sha }}
        run: |
          set -eu
          TIP=$(git rev-parse main)
          if [ "$MERGE_SHA" = "$TIP" ]; then exit 0; fi
          git merge-base --is-ancestor "$MERGE_SHA" main || {
            echo "release.yml: FAIL -- dispatched SHA $MERGE_SHA is neither main tip ($TIP) nor an ancestor. Next step: dispatch the merge SHA of a merged bump PR." >&2
            exit 1
          }
          git diff-tree --no-commit-id --name-only -r "$MERGE_SHA" | grep -qx 'configuration.toml' || {
            echo "release.yml: FAIL -- dispatched ancestor $MERGE_SHA does not itself change configuration.toml. Next step: dispatch a SHA whose own commit changes configuration.toml." >&2
            exit 1
          }
          # 41-RESEARCH Pitfall 2 conjunct: the bot App (no Workflows) cannot
          # create the Release when the target diverges in .github/workflows/.
          if [ -n "$(git diff "$MERGE_SHA" main -- .github/workflows/)" ]; then
            echo "release.yml: FAIL -- $MERGE_SHA diverges from main in .github/workflows/; the bot App token cannot publish from it. Next step: rebase the bump onto the tip." >&2
            exit 1
          fi
```

Semantics, each load-bearing:

- **Tip passes unconditionally.** The normal case (train dispatches right after merge) is one string compare.
- **Ancestor passes only when its own commit touches `configuration.toml`.** `git diff-tree --name-only -r <SHA>` lists that commit's own files (merge commits included — the bump merge touches the pin + `revision`). A random old ancestor (docs typo, Theia bump) exits 1. "Whose commit changes `configuration.toml`" is read as the commit's own diff, not the range diff, because the range reading would admit any SHA after the last manifest change.
- **Workflows-tree identity is required.** Without it the later `sign-publish` create-Release call 404s/403s against the bot token and the failure surfaces far from its cause. Failing fast here names the fix (rebase onto tip).
- **Failure exits 1 (red), never 0-skip.** An invalid SHA is a dispatch bug or an attack, not an empty queue; a green exit would let the train derive BUILDING-forever. The message names the SHA, the tip, and the next step, and carries no secret.
- **No secret, no environment on this job.** The step uses only `git` + the input. The `workflows` row's `legion` rule (no `environment:`, no `secrets.`, no `secrets: inherit`) covers it; the self-test gains one plant (a `secrets.` reference in the validation step) if the planner wants it, though the existing legion plants already cover the shape.

DIST-02's separate "exits without building when the derived release key is not greater than the latest Release tag" check stays where Phase 49 puts it (later in the job, after identity derivation); the two checks are conjunctive and ordered SHA-first (identity comparison is meaningless for a SHA that should never build).

### Pattern 3: Withdraw without deleting (REL-02)

**Where it lives.** A standalone workflow `withdraw.yml` in the **`powerbrowser-updates`** repo (404 today; created empty in Phase 41 per GH-10, filled by Phase 47). Rationale: the descriptor write is a Contents write on the updates repo; placing the job there keeps the product repo's `release.yml` trust map untouched and gives the withdraw token the narrowest scope. Trigger `workflow_dispatch` only, with required inputs `{ tag, reason } (withdraw is no-update only)`. Hosted runner (`ubuntu-latest`), pinned SHA `uses:`, no cache, no `pull_request` trigger — the `workflows`-row equivalent the planner writes for the updates repo (or an explicit cross-repo note, since the Phase 41 `workflows` row covers the product repo only).

**Token scope (GH-10).** The bot App is installed on `powerbrowser`, `powerbrowser-updates`, and the tap repo, with Contents/PRs/Issues read-write (no Workflows). The withdraw job mints the bot App token just before use via `actions/create-github-app-token` with the App id + private key held as an **updates-repo secret** (owner action; the key itself was created in Phase 43 as the first consumer — 41-RESEARCH A5). Per-step `permission-contents: write` minimum; the same token PATCHes the product Release (cross-repo, same installation — allowed because the App is installed on both). Token lifetime is 1 hour (SUMMARY Pitfall 5); mint-then-use in adjacent steps, never at job start for a 24h-spanning job (this job is minutes long, so one mint suffices).

**No-update descriptor format.** One file per BUILD_TARGET at `<channel>/<BUILD_TARGET>/update.xml`, bytes exactly:

```
<?xml version="1.0" encoding="UTF-8"?>
<updates></updates>
```

(with trailing newline; the S5 "two-line no-update document"). The withdraw job writes these bytes identically for every target in the manifest-derived target set (derived from the Release's `release-manifest.json` asset / the Phase 44 target table — never a hand-kept list), commits with message `Withdraw <tag>: no-update descriptors (<reason>)`, and pushes to `powerbrowser-updates` `main`. Byte-identity across targets is asserted by re-reading the commit and comparing as a set.

**No R2 repoint mode.** Superseded by the owner ruling of 2026-10-29: R2 at `downloads.powerbrowser.org` is the primary MAR origin, so there is no second origin to repoint to. Withdraw is no-update only.

**Channel-live rerun.** After the commit, the job reruns the UPD-17 checks in withdrawn mode:

- Assert each public `update.xml` serves the no-update bytes (HTTP 200 with `<updates></updates>` and no `<patch>`), i.e. expect-empty rather than expect-release. Running the unmodified `channel-live` (which requires offered version == latest Release) would go red by design — the plan must not call that a failure.

Recommend implementing this as `verify-update-channel-live.mjs --withdrawn <tag>` (or a `--mode` flag Phase 49's script owns and Phase 50 extends) so the expectation flip is explicit and self-tested, rather than forking a second script.

**Marking the Release.** After the descriptor commit lands:

- Probe-allowed branch: `PATCH repos/{o}/{r}/releases/{id} {"prerelease": true}` with the bot App token. Notes that the Release is withdrawn in `body` as well (append, never rewrite history: `body + "\n\nWithdrawn: <reason>. Fixed by <new-revision-key> when shipped."`).
- Notes-only branch: append the same withdrawal block to `body` only.

Both branches keep assets, tag, and `draft: false` untouched. **Never `DELETE repos/{o}/{r}/releases/{id}`, never `DELETE git/refs/tags/<tag>`** — immutable releases forbid tag reuse, so a deleted tag name can never ship again (SUMMARY Must-have; Out of Scope table).

**Immutable-release probe procedure (owner action, before the first public release, recorded in `docs/RELEASING.md`).** On a throwaway pre-release cycle (or the first real Release candidate before announcement — planner picks, owner executes):

```sh
R=DeBIOS-Foundation/powerbrowser
TAG=<probe tag, e.g. a test tag the train will supersede>
ID=$(gh api repos/$R/releases/tags/$TAG --jq .id)
# 1. bot-token branch
gh api -X PATCH repos/$R/releases/$ID -f prerelease=true   # with the bot App token
gh api repos/$R/releases/$ID --jq '{prerelease, draft}'    # did it stick?
# 2. notes branch (always allowed?)
gh api -X PATCH repos/$R/releases/$ID -f body="$(gh api repos/$R/releases/$ID --jq .body)
Withdrawn: probe."
```

Record in RELEASING.md: date, tag, which branch stuck, the exact error (422/403 text) if the flag was refused, and therefore which branch `withdraw.yml` implements. The withdraw job reads this record as its configuration (a checked-in verdict, not a runtime probe).

**Fix is a new revision.** Bump `[product].revision`, regenerate, new bump PR, new train, new tag `v<ESR>-<revision+1>`. The withdrawn tag stays published-but-marked forever as the audit trail. Tracking issue for the bad key moves to WITHDRAWN and reopens (TRAIN-02); the new key gets its own tracking issue.

### Pattern 4: KNOWN-ISSUES pinned issue (GH-15)

**Source.** `docs/KNOWN-ISSUES.md` in the product repo, created by Phase 42 (GH-14) — absent today. Phase 50 never authors its content; it only copies bytes.

**Trigger.** The train's `report` job, on entering PUBLISHED (first derivation of PUBLISHED for that key — edge-triggered, not every run, so the issue is written once per release, not spammed per tick).

**Create-vs-update rule (the TRAIN-02 PATCH rule, reused).**

1. Find: `GET search/issues?q=repo:{o}/{r}+<title>` (title e.g. `Known issues` — planner fixes the exact title; one title, one issue). Expect 0 or 1; 2+ is red naming the duplicates (same treatment as TRAIN-09's duplicate-tracking-issue plant).
2. Zero → `POST repos/{o}/{r}/issues {title, body, labels: [...]}` with body = rendered bytes (header + file bytes), then pin (§below).
3. One → GET the issue body; PATCH only when the rendered bytes differ byte-for-byte; otherwise no-op (no comment, no edit, no notification).
4. Rendered bytes = header block (release key, merge SHA, date, source path + a "discuss in …" pointer) + `\n\n` + file bytes verbatim. The file bytes are read at the **merge SHA** (the released tree), not at the train run's checkout tip, so a later docs edit does not rewrite what a shipped release pointed at. Subsequent releases update the same issue (it is "one pinned issue", singular, not per-release).

**Pinning.** REST has no pin endpoint. Primary: GraphQL mutation with the bot App token (which holds Issues write):

```graphql
mutation { pinIssue(input: { issueId: "<node id of the issue>" }) { issue { id } } }
```

(max 3 pinned issues per repo; this consumes one — record that budget in RELEASING.md). Fallback [ASSUMED, needs executor probe]: if the App token cannot pin, the report job maintains the body and a one-time owner click pins it; RELEASING.md records date + who. Either way the job is idempotent across runs (pin when unpinned, no-op when pinned).

**Permissions.** The `report` job already holds `issues: write` (GH-12 admits it only on `release-train.yml` job `report` and `triage.yml`). No new permission; the `workflows` row stays green. The KNOWN-ISSUES step needs `contents: read` (to read the file at the merge SHA) — effective-contents read is already the default posture; do not add `contents: write` to the report job.

**User-facing copy rule.** The pinned issue is user-facing: product named "PowerBrowser", plain-language problem statements, each entry ending with an on-screen next step. No SHAs, run ids, pref keys, or exception text in the body (identifiers live in the tracking issue). Phase 42 owns the file's wording; Phase 50's copy step must not reword — byte copy only — so the UPD-32-style shape test (if extended) tests the file, not the job.

### Pattern 5: Real-release hop drill (`served: release`, UPD-16)

**Not a second script.** Extend `scripts/verify-mar-update-hop.mjs` with a `served` selector recorded in `hop.json` (S5 design, already specified in the draft plan §7). `served: "loopback"` keeps today's behaviour byte-for-byte (four evidence files incl. `server-access.log`, two GET assertions, distinct-versions rule). `served: "release"` takes the release set below and **never demands an access log** (Cloudflare Pages + GitHub asset hosts produce none). Absent or unknown `served` fails naming the key rather than defaulting.

**Inputs (Release assets + public descriptor).**

- `hop.json` with `served: "release"` + existing keys (`n`, `nplus1`, `mar`, `descriptor`, `servedUrl`, `servedMarUrl`, `result`, `postHop`). `n` = installed published tarball (N), `nplus1` = Release MAR under test. `servedUrl` = the baked 11-segment public descriptor URL (exercises `_redirects`, not the file path); `servedMarUrl` = the write-once `https://downloads.powerbrowser.org/<tag>/<asset>` URL (DIST-08 primary MAR origin; never a `github.com` `/releases/download/` URL, never a `release-assets` URL, never a latest-download key — an unattended fetch of github.com fails `endpoint-verdict`).
- `update.xml` = the public descriptor bytes as served.
- The downloaded MAR bytes (via `gh release download <tag>` on the host, copied into the container, or `curl -fsSL` inside — planner picks; the bytes are what matters).
- `client-resolver.log` = `MOZ_LOG=nsHostResolver:5` capture across the whole check→download→stage→apply cycle, plus `app.update.log=true`.
- Attestation bundle for the MAR (see Auth below).

**Assertion list (release set; each names file + values on failure).**

1. **Hosts:** the descriptor host **and** the MAR host both present in the sifted resolver hosts (anchored `Resolving host [...]` sift, the existing `siftResolverHosts`). Expected: `updates.powerbrowser.org` + `downloads.powerbrowser.org` (the UPD-15 layer-3 hosts per criterion 5); `github.com` and `release-assets.githubusercontent.com` must be absent, and either one present is red naming the host (absence judged over the client's own Resolving lines with the capture-broken detectors, as for the Mozilla check). Zero `*.mozilla.org` / `*.mozilla.net`. Capture-broken detectors kept: empty extract fails; serving host must appear unless literal IP.
2. **Hash:** downloaded MAR `sha512` == descriptor `hashValue`; byte `size` == descriptor `size` (recompute from bytes with `marDigest`, never trust the descriptor's own claim alone).
3. **Version:** distinct `buildID`s with `appVersion` not older (`nplus1.appVersion >= n.appVersion` in ESR-version ordering). This **replaces** the loopback distinct-versions rule — not a relaxation: the ratified version scheme keeps `appVersion` at the ESR version and `UpdateService.sys.mjs:1954-1962` (`updateIsAtLeastAsOldAs`) refuses an offer only when versions compare equal **and** buildIDs match, so same-appVersion/distinct-buildID is exactly what the client treats as an upgrade (S5 context, [VERIFIED] upstream read).
4. **Signature:** `signmar -v` against the tracked DER(s) passes on the downloaded MAR (primary DER; Phase 44's secondary slot accepted — the `ng065` "secondary key only accepted" precedent). Which DER set is derived from `brand/` + `patches/030-*` at check time, never a literal.
5. **Allowed channels:** the MAR's embedded product-info channel equals `ACCEPTED_MAR_CHANNEL_IDS` (SEC-07 enforcement, re-proven on the served bytes — the sign-time check is not re-trusted blindly). Channel ids derive from `updateChannel(config)` (`powerbrowser-default`), compared with the `update-channel` row's vocabulary.
6. **Attestation:** `gh attestation verify <mar> --repo <owner>/<repo>` passes (online form), or the offline `--bundle` form verifies against a bundle fetched on the host. Either way the attestation covers the upload (WEB-02 states this honestly on /download: "the attestation covers the upload rather than the legion build").

**Fault-plant list (self-test; control green first, each plant red naming the drift — the existing `expectRed` pattern).** Minimum: unsigned MAR; wrong-channel MAR; tampered MAR byte (hash mismatch); `http://` patch URL; resolver log missing the MAR host; same-buildID hop (N == N+1 buildID); Mozilla host in the resolver log (`aus5.mozilla.org`); attestation failure (tampered MAR or wrong `--repo`); latest-download patch URL; forbidden-origin servedMarUrl (github.com `/releases/download/` or `release-assets.githubusercontent.com`); github.com or release-assets line in the resolver log; descriptor not byte-identical to a fresh `buildUpdateXml` emission from the MAR bytes (hand-edit detector, kept from loopback). Each plant names the file and the values.

**Clean non-Nix container/VM procedure on legion.** Why: the release tarball must run with no Nix present (`portable-elf`: no `/nix/store` interpreter/RUNPATH, glibc ≤ the 2.28 floor in `powerbrowser/packaging/portability-floor.json`) — a Nix host would mask exactly the failure the drill exists to catch; and a dirty profile would mask residue bugs. Procedure (owner executes per CONTEXT; executor scripts it):

```sh
# on legion, fresh room, no Nix mount, network on (must reach updates + downloads)
podman run --rm -it --network=host \
  -v /path/to/N.tar.xz:/in/N.tar.xz:ro -v /path/to/Nplus1.mar:/in/Nplus1.mar:ro \
  -v /path/to/evidence:/out \
  debian:bookworm-slim bash -c '
    tar -xf /in/N.tar.xz -C /tmp && /tmp/powerbrowser/powerbrowser --headless? # per BUILD.md hop drive
    MOZ_LOG=nsHostResolver:5 ... # capture across the full cycle per docs/BUILD.md
  '
```

Image: the Debian bookworm family (same as the PKG-17 release container — consistency, not a new image). Fresh profile per run (`--profile /tmp/fresh-$RANDOM` or equivalent; never the operator's profile). Nothing from the host's Nix store mounted. Evidence (`hop.json` with `served: "release"`, `update.xml`, MAR, `client-resolver.log`) written to `/out` and verified on the host with `node scripts/verify-mar-update-hop.mjs` + the registry row.

**Attestation auth handling.** `gh attestation verify` needs a GitHub login (SUMMARY resolved: anonymous fails; /download offers `--bundle` + offline alternative). Inside the credential-free container, use the offline form: fetch `<mar>.sigstore.json` (bundle) on the host with the owner's `gh auth`, copy it in read-only, verify with `gh attestation verify <mar> --bundle <bundle>` (no login inside). If the bundle form proves unavailable, fall back to verifying on the host (networked, logged in) and record which path the drill took — the hop's signature assertion never silently skips.

### Pattern 6: `release-train-logic-self-test` extension (TRAIN-09 + TRAIN-10)

The TRAIN-09 contract is unchanged and already constrains the design: `derive`/`next`/`render` run over fixture API JSON; **the state list is derived from `release-train.mjs`'s own state table and compared as set equality**, so a state without a fixture — or a fixture without a state — goes red. Phase 50 therefore:

1. Adds **one fixture per new state** (8 fixtures: BUILDING, AWAITING_APPROVAL, PUBLISHED, DESCRIPTOR_WAIT, DESCRIPTOR_LIVE, LIVE_RED, WITHDRAWN, DONE), each in the live response shape (runs objects with `status`/`conclusion`/`head_sha`/`html_url`, pending-deployments arrays, Release objects with `draft`/`prerelease`/`assets`, contents objects with base64 `content`, issues objects with `state`) so the normalisers are exercised — the `verify-repo-controls.mjs` self-test precedent (build fakes in live shape, not in internal shape).
2. Keeps the five Phase A plants (merged PR with unchanged pin, draft Release, fork-head `workflow_run`, duplicate tracking issue, 175.x ESR under the 153 guard) green-compatible, and adds the release-stage plants:
   - non-tip dispatched SHA (neither tip nor ancestor) → red naming the SHA;
   - ancestor SHA that does not itself change `configuration.toml` → red naming the file;
   - ancestor SHA whose `.github/workflows/` diverges from `main`'s → red naming the directory (Pitfall 2);
   - `LIVE_RED` fixture (byte-mismatched descriptor) → red naming the subcheck;
   - WITHDRAWN via notes-marker when the probe forbids the flag (both mark shapes covered).
3. Asserts the one-transition-per-run rule in at least one fixture (a fact set that could advance twice must advance once and report the remainder pending).
4. Asserts the dispatch linkage: the BUILDING→AWAITING_APPROVAL fixture's rendered body contains the exact `html_url` for the `head_sha`, matched by equality, not substring-of-any-run.

The row stays quick (in-memory fixtures, no network, no `gh`) and keeps its registry name — no new row, just more fixtures. The supersede fixtures (TRAIN-04, Phase 51) and fixer states (Phase 52) land later per TRAIN-09's "release-stage fixtures land with E and the fixer and supersede fixtures with F" note; Phase 50 must not pre-build them (§What Phase 50 Must NOT Build) but must leave the set-equality mechanism able to absorb them without edits to the harness (only table + fixtures change).

### Anti-Patterns to Avoid

- **Reading the tracking issue body as state.** It is a view (TRAIN-02). `derive` may read the issue's `state`/`locked` (GitHub facts for DONE/WITHDRAWN bookkeeping) but never parse its body for a state string.
- **Dispatching by "latest run".** Always resolve the run by `head_sha` equality. Latest-run linkage crosses trains under concurrency.
- **SHA validation that compares only the tip.** Without the ancestor + manifest-touch + workflows-identity conjuncts, a stale-but-ancestor SHA builds unreleasable bytes (bot cannot publish) or a non-bump commit ships a "release" with no identity change.
- **Withdraw by delete.** `DELETE release` + `DELETE tag` destroys the audit trail and (under immutable releases) burns the tag name forever. The fix is always a new revision.
- **A second hop script, a second descriptor builder, a second state table.** One of each; Phase 50 extends.
- **Hand-kept target/asset/state lists.** Derive BUILD_TARGETs from the manifest/builder, assets from the Release + manifest, states from the table. Compare as sets.
- **Putting secrets or an `environment:` on any legion job.** The `workflows` row already forbids it; the SHA step needs neither.
- **Event text (`github.event.*`) inside the new workflows' `run:`/`prompt:`.** Pass SHAs/tags through `env:`/`inputs:`; the `workflows` row's event-text rule applies to `release.yml` and `release-train.yml` edits and should be extended to `withdraw.yml` by inspection even though that file lives in another repo.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| GitHub auth, pagination, version header | fetch + token plumbing | `gh api -H 'X-GitHub-Api-Version: 2022-11-28' [--paginate]` | `gh` already holds the token; no secret reaches our code; truncation guard (`total_count` vs returned, the repo-controls precedent) refuses partial lists rather than deriving from them |
| Release download/upload | curl against `browser_download_url` by hand | `gh release download/upload/view` | Handles the 302 to `release-assets.githubusercontent.com`, auth, and immutable-release refusal messages |
| Attestation verify | sigstore plumbing | `gh attestation verify [--bundle]` | Already the documented /download instruction (with the login note + offline alternative) |
| Descriptor bytes | Hand-written `update.xml` | `buildUpdateXml` imported from `verify-mar-update-hop.mjs` (UPD-14) | Single source; byte-identity is the hand-edit detector |
| Release identity in new code | Ad-hoc tag parsing | `releaseIdentity()` from `generate.mjs` (REL-01) | Same resolver as the generator and the `release-identity` row, so gates cannot disagree |
| Channel ids in new code | Literals (`default`, `powerbrowser-default`) | `UPDATE_CHANNEL` / `updateChannel(config)` from `generate.mjs` (UPD-11) | One source; the `update-channel` row proves agreement |
| Issue body rendering | String concat without a diff gate | Render-then-PATCH-only-on-bytes-differ (TRAIN-02 rule) | Idempotent runs; no notification spam |
| App token minting | Long-lived token in env | `actions/create-github-app-token` per-step mint, just before use | 1-hour expiry; revocation at job end; least scope via `permission-*` |

**Key insight:** every new state is a projection of GitHub facts that already exist. The value Phase 50 adds is the derivation table being exact (named endpoint + named field + named comparator) and the self-test proving each row discriminates.

## Common Pitfalls

### Pitfall 1: The dispatched SHA builds but cannot publish (bot token vs workflows tree)
**What goes wrong:** train dispatches an ancestor SHA; `build-linux` succeeds; `sign-publish`'s `POST /releases` returns 404/403 because the target's `.github/workflows/` differs from `main`'s and the bot token lacks Workflows (41-RESEARCH Pitfall 2, [CITED] GitHub docs).
**How to avoid:** the workflows-identity conjunct in the SHA step (§Pattern 2). The self-test plants a diverging ancestor and requires red naming `.github/workflows/`.
**Warning signs:** a green build followed by a 404 on Release creation mentioning workflows.

### Pitfall 2: `channel-live` red after a correct withdraw is misread as a regression
**What goes wrong:** the withdraw job reruns the unmodified gate, which demands offered-version == latest-Release; the no-update descriptor can never satisfy it, so the job "fails" on a correct withdraw.
**How to avoid:** the `--withdrawn` expectation flip (§Pattern 3). The withdraw runbook states the expected post-withdraw gate output verbatim.

### Pitfall 3: Two trains, one run link
**What goes wrong:** a chemspill revision train dispatches while the scheduled train is in flight; resolving "the latest release.yml run" links the wrong run into both issues.
**How to avoid:** resolve by `head_sha` equality (§Pattern 1), never by recency. (Full chemspill priority is TRAIN-04, Phase 51 — Phase 50 only guarantees non-crossing links.)

### Pitfall 4: The descriptor timer outlives the App token
**What goes wrong:** minting the descriptor-commit token at job start, then waiting 24h; the token expired 23h ago and the commit fails.
**How to avoid:** mint just before use (SUMMARY Pitfall 5). The `descriptor` job mints its updates-repo token after the wait + approval, in the commit step's immediate predecessor. Same for withdraw (minutes-long job, single mint adjacent to use).

### Pitfall 5: Pinned-issue spam (a comment or edit per tick)
**What goes wrong:** the report job PATCHes or comments every hourly run; subscribers mute the issue and miss the real withdrawal notice.
**How to avoid:** edge-triggered + bytes-differ PATCH (§Pattern 4). No-op runs touch nothing. The sweep's "comments only when a row turns red" (TRAIN-07) is the same discipline.

### Pitfall 6: Same-appVersion hop misread as "not an upgrade"
**What goes wrong:** a reviewer rejects the hop evidence because N and N+1 share `appVersion` (the version scheme keeps it at the ESR version by design).
**How to avoid:** cite `updateIsAtLeastAsOldAs` (equal version + different buildID = offered) in the hop record and in RELEASING.md; the release set asserts distinct-buildID + not-older-appVersion (§Pattern 5). The loopback distinct-versions rule is untouched.

### Pitfall 7: Container with Nix mounted (or host-network DNS) proves nothing
**What goes wrong:** the "clean non-Nix" drill mounts `/nix` or inherits the host resolver, so a `/nix/store` RUNPATH or a hardcoded host passes.
**How to avoid:** `podman run` with no Nix mount, fresh profile, and the resolver-log serving-host assertion (§Pattern 5). The procedure lists the exact mounts (inputs read-only, evidence out) so a reviewer can audit cleanliness.

### Pitfall 8: Attestation verify skipped for lack of login inside the container
**What goes wrong:** `gh attestation verify` fails anonymously; the drill records SKIP and the attestation half is unproven.
**How to avoid:** the `--bundle` offline form with a host-fetched bundle (§Pattern 5). Absent bundle + absent login is red naming attestation, never SKIP-green.

### Pitfall 9: Immutable releases already on with a Release present blocks the probe design
**What goes wrong:** the probe plan assumes zero Releases, but the first public release already shipped; enabling/flag-flipping probes now risk the live Release.
**How to avoid:** the probe runs **before** the first public release (REL-02 ordering) on a throwaway tag if needed. If the window is missed, the probe runs against a `-probe` suffixed test Release that is immediately withdrawn through the same job — never against the live key. [VERIFIED: zero Releases today, so the clean path is still available.]

### Pitfall 10: Building Phase 48/47/49 deliverables inside Phase 50
**What goes wrong:** the plan re-builds the sweep rows, /download, or the `release.yml` skeleton because the dependencies have not landed, then conflicts with those phases when they land.
**How to avoid:** §What Phase 50 Must NOT Build. Research against SPEC text; execute against the landed tree with deltas recorded in the SUMMARY (CONTEXT A-assumptions).

## Code Examples

### Deriving one new state (shape of the `derive` input collector)

```js
// scripts/release-train.mjs (Phase 50 extension sketch — planner owns names)
const API = 'X-GitHub-Api-Version: 2022-11-28';
export function collectFacts({ owner, repo, updatesRepo, tag, mergeSha, gh = ghGet }) {
  const run = gh(`repos/${owner}/${repo}/actions/workflows/release.yml/runs?head_sha=${mergeSha}&event=workflow_dispatch&per_page=10`);
  const runId = newestRunWithHeadSha(run, mergeSha)?.id ?? null;   // equality, never recency
  return {
    run: runId ? gh(`repos/${owner}/${repo}/actions/runs/${runId}`) : null,
    pending: runId ? gh(`repos/${owner}/${repo}/actions/runs/${runId}/pending_deployments`) : [],
    release: tryGet(gh, `repos/${owner}/${repo}/releases/tags/${tag}`),   // 404 → null, not red
    descriptors: targets.map(t => tryGet(gh, `repos/${owner}/${updatesRepo}/contents/${channel}/${t}/update.xml?ref=main`)),
    issue: searchTrackingIssue(owner, repo, tag),
  };
}
// Every getter goes through the fail-closed helper (the repo-controls precedent):
// non-2xx (other than Release/contents 404-meaning-absent), missing gh, or
// unparseable JSON is a FAIL naming the endpoint — never a SKIP, never a PASS.
```

### SHA-validation step (copy-pasteable; see Pattern 2 for the full YAML context)

```sh
set -eu
TIP=$(git rev-parse main)
if [ "$MERGE_SHA" = "$TIP" ]; then exit 0; fi
git merge-base --is-ancestor "$MERGE_SHA" main || { echo "FAIL -- $MERGE_SHA is not main tip nor ancestor" >&2; exit 1; }
git diff-tree --no-commit-id --name-only -r "$MERGE_SHA" | grep -qx 'configuration.toml' || { echo "FAIL -- ancestor $MERGE_SHA touches no configuration.toml" >&2; exit 1; }
[ -z "$(git diff "$MERGE_SHA" main -- .github/workflows/)" ] || { echo "FAIL -- $MERGE_SHA diverges in .github/workflows/" >&2; exit 1; }
```

### Withdraw workflow skeleton (powerbrowser-updates repo)

```yaml
name: Withdraw a release
on:
  workflow_dispatch:
    inputs:
      tag: { description: "Release tag to withdraw (v<ESR>-<revision>)", required: true, type: string }
            reason: { description: "Why (recorded in the commit + Release notes)", required: true, type: string }
permissions:
  contents: read
jobs:
  withdraw:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@<40-hex> # vX.Y.Z
        with: { persist-credentials: false }
      # mint JUST before use; permission-contents: write via create-github-app-token
      - uses: actions/create-github-app-token@<40-hex> # v3.3.0
        id: app
        with:
          app-id: ${{ secrets.BOT_APP_ID }}
          private-key: ${{ secrets.BOT_APP_KEY }}
          owner: DeBIOS-Foundation
          repositories: powerbrowser-updates,powerbrowser
          permission-contents: write
      - name: Commit no-update descriptors per target
        env:
          GH_TOKEN: ${{ steps.app.outputs.token }}
          TAG: ${{ inputs.tag }}
          REASON: ${{ inputs.reason }}
        run: |
          set -eu
          # targets derived from the Release manifest, never a literal list
          # write identical no-update bytes, commit, push
      - name: Rerun channel-live in withdrawn mode
        run: node scripts/verify-update-channel-live.mjs --withdrawn "$TAG"  # or the updates-repo equivalent
      - name: Mark the Release (flag per probe, else notes)
        env:
          GH_TOKEN: ${{ steps.app.outputs.token }}
        run: |
          set -eu
          # PATCH prerelease:true iff the RELEASING.md probe verdict allows; always append the notes block
          # NEVER delete the Release or the tag
```

Owner/repo literals above follow the file's own repo context; the product-side scripts derive them from `configuration.toml` (no literal rule applies inside the updates repo, which has no manifest — state this in the commit).

### `served: release` hop.json (minimal)

```json
{
  "served": "release",
  "n": { "version": "153.5.1", "buildID": "20261110000000" },
  "nplus1": { "version": "153.5.1", "buildID": "20261124000000", "platformVersion": "153.5.1", "displayVersion": "153.5.1-2" },
  "mar": "powerbrowser-153.5.1-2.linux-x86_64.mar",
  "descriptor": "update.xml",
  "servedUrl": "https://updates.powerbrowser.org/update/6/powerbrowser/153.5.1/20261124000000/Linux_x86_64-gcc3/en-US/default/Linux%206.18.49%20(GTK%203.24.49)/ISET%3ASSE4_2%2CMEM%3A63456/default/default/update.xml",
  "servedMarUrl": "https://downloads.powerbrowser.org/v153.5.1-2/powerbrowser-153.5.1-2.linux-x86_64.mar",
  "result": "applied",
  "postHop": { "version": "153.5.1", "buildID": "20261124000000" }
}
```

Note the same-appVersion/distinct-buildID shape (Pitfall 6) and the write-once `<tag>/<asset>` key on `downloads.powerbrowser.org` (never a latest-download form, never `github.com`).

### Self-test fixture sketch (one per state; live response shape)

```js
// BUILDING fixture: run in_progress, no Release, pending []
{ run: { head_sha: MERGE, status: 'in_progress', conclusion: null, html_url: 'https://…' },
  pending: [], release: null, descriptors: [], issue: { state: 'open' } }
// AWAITING_APPROVAL fixture: run waiting + pending [{environment:{name:'release'}}]
{ run: { head_sha: MERGE, status: 'waiting', conclusion: null, html_url: 'https://…' },
  pending: [{ environment: { name: 'release' } }], release: { draft: true }, … }
// PUBLISHED fixture: release draft:false, prerelease:false, full assets; descriptors still no-update
// DESCRIPTOR_WAIT: + pending [{environment:{name:'descriptor'}}]
// DESCRIPTOR_LIVE: descriptors byte-equal + channelLive green
// LIVE_RED: descriptors present + channelLive {green:false, subcheck:'size'}
// WITHDRAWN: release {prerelease:true} (or body marker) + descriptors no-update
// DONE: DESCRIPTOR_LIVE facts + issue {state:'closed'}
```

## What Phase 50 Must NOT Build

(Observation-only at criterion 5; built by the owning phase. If an assumed file differs when that phase lands, the executor follows the landed tree and records the delta in the SUMMARY — CONTEXT assumption A7.)

| Item | Owning phase | Phase 50 posture |
|---|---|---|
| `release.yml` four-job skeleton (build-linux, sign-publish, descriptor, channel-live) | 49 (DIST-02/07/08/09, UPD-17, SEC-07/08/10, AUTO-05, INF-04) | **Do not (re)build.** Sole edit: the SHA-validation first step (+ `merge_sha` input if the landed file lacks it). All other interaction is dispatch + derive + observe |
| `scripts/release-train.mjs` skeleton, `detect-upstreams.mjs`, TRAIN-01/02/03/08/09 base states + bump automation | 43 (INF-03, TRAIN-01/02/03/08/09, AUTO-01/04/06/07) | **Extend only** (8 state rows + fixtures). Do not redesign derive/next/render or the clock |
| `scripts/build-update-xml.mjs`, `descriptor-monotonic` row | 44 (UPD-14, UPD-26, SEC-05/09) | **Assume present.** The descriptor job's monotonic gate is a precondition, not a deliverable |
| Portable tarball + complete MAR, container build, `portable-elf`/`sidecar-no-symlinks`/`package-target-natives` rows | 45 (PKG-17/22/18/23/04/05/06/07/21, UPD-29) | **Assume present as hop inputs.** Do not rebuild the container |
| `mar-update-hop` fork mode, update UI/copy rows, allowlist release pass rows | 46 (UPD-18..24/27/32/15/28) | **Extend only** (`served: release` mode). The `github.com` allowlist row exists (`user-initiated`); `downloads.powerbrowser.org` + `crash-reports.mozilla.com` rows arrive via the drill observation per S5/UPD-05 — add exactly what the drill resolves, nothing more; the `release-assets.githubusercontent.com` row loses its updater justification and the drill does not add it |
| `powerbrowser-updates` Pages host, `_redirects`, `/download`, `/privacy`, `/legal`, mail | 47 (INF-01/02/06, DIST-03, WEB-01..05, TEL-08) | **Observe only** (REL-03 "/download live", criterion-5 probes). Do not build pages or redirects |
| Maintenance sweep issue + rows (`runner-online`, `channel-liveness`, `download-count`, TRAIN-07), watchdog (MON-01), telemetry Worker | 48 (TEL-06/10/11, TRAIN-07, MON-01) | **Observe only at criterion 5**: record the three rows' live values at the first public release. Do not add rows |
| Supersede/chemspill (TRAIN-04), red-stage routing + fixer start (TRAIN-06), sweep extension (TRAIN-11), second major (TRAIN-05) | 51/52 (F) | **Do not pre-build.** Leave the table + set-equality harness able to absorb them |
| Sweep rows for renewals/Dependabot/CodeQL/Codeberg, fixer, triage, mirror, status page | 51/52/53 | Out of scope entirely |

Criterion 5 (ROADMAP Phase 50 §5) is **observation-only**: layer-3 observation of the downloads host (`downloads.powerbrowser.org`, with `updates.powerbrowser.org`) during the real hop, with `github.com` and `release-assets.githubusercontent.com` absent from the updater's resolver log, plus recording the sweep's `runner-online`, `channel-liveness`, and `download-count` live values at the first public release. No new rows are built here.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Assumed Phase 43 `release-train.mjs` exposes `derive`/`next`/`render` + one state table + set-equality self-test (CONTEXT A1) | Pattern 1, 6 | If the landed skeleton differs, port the 8 rows + fixtures to its shape; the derivation table (endpoint→field→comparator) is shape-independent |
| A2 | Assumed Phase 49 `release.yml` has the four-job shape with the named jobs/envs (CONTEXT A2) | Pattern 2 | If job names differ, retarget the SHA step + run-link queries; record the delta in the SUMMARY |
| A3 | Assumed `scripts/build-update-xml.mjs` imports `buildUpdateXml` (CONTEXT A3) and the hop reuses it | Pattern 5 | If the import differs, the byte-identity assertion adapts to whatever the landed builder emits — still byte-compare served vs fresh emission |
| A4 | `pending_deployments` GET returns `[]` vs `[{environment:{name}}]` on waiting runs (same shape family as the verified completed-run `[]`) | Pattern 1 | If the shape differs (e.g. nested `environments`), adjust the projection; the state semantics are unchanged |
| A5 | Bot App token can PATCH `prerelease` and `body` on Releases in the product repo (flag half subject to the probe) | Pattern 3 | If both are refused under immutable releases, the fallback is notes-only via a different actor (owner token) — but that breaks Apps-only, so the probe verdict may force a design change owned by the owner |
| A6 | GraphQL `pinIssue` accepts the bot App token (Issues write) | Pattern 4 | Fallback is one owner click; the job still maintains the body |
| A7 | `gh attestation verify --bundle` works offline in the clean container with a host-fetched bundle | Pattern 5 | Fallback is host-side verification with the login; record which path was taken |
| A8 | The first public release is a 153.x point release on the ESR calendar (153.7 on 2026-11-10, else 153.8 on 2026-11-24, …) | REL-03 | If the calendar slips, the plan's calendar rule still selects correctly; the executor never picks a date |
| A9 | `powerbrowser-updates` default branch is `main` and descriptors live at `<channel>/<BUILD_TARGET>/update.xml` (S5 + DIST-03 SPEC) | Patterns 1, 3 | If the landed layout differs, derive from the landed tree; the set-equality comparisons absorb renames |
| A10 | Non-tip SHA rule reads "the commit's own diff touches `configuration.toml`" (not the range diff) | Pattern 2 | If the owner rules range-diff instead, the check widens (any SHA after the last manifest change passes) — record the ruling and adjust the plant |

## Open Questions

### Owner probes (need a human, an account, or live infrastructure — answers recorded in `docs/RELEASING.md`)

1. **Immutable-release pre-release-flag probe (REL-02).** Does PATCH `prerelease:true` stick once immutable releases are on? Run before the first public release per §Pattern 3; record date, tag, verdict, and the exact error if refused. Determines the withdraw job's flag-vs-notes branch. *(Blocks the withdraw job's finalisation; nothing else.)*
2. **Which ESR point release becomes the first public release.** External calendar gate (153.7 on 2026-11-10, else 153.8, …). The plan records the rule; the owner picks by merging/approving. *(Blocks REL-03 execution, not planning.)*
3. **Per-release approvals (`release`; `descriptor` after the owner's own N-1→N hop).** Owner actions at execution time; the plan ends with the exact commands/gates. *(Blocks DONE; plans build everything short of it.)*
4. **GraphQL `pinIssue` with the bot App token (GH-15 fallback).** If refused, one owner click pins the issue; record date + who. *(Does not block the body-maintenance job.)*
5. **R2 repoint withdraw mode:** removed by the owner ruling of 2026-10-29 (R2 is the primary origin); withdraw is no-update only.
6. **Second owner account for notification-independent approval.** Per 41-RESEARCH Pitfall 7, self-triggered deployment approvals may not push; the descriptor approval should be reachable. *(Advisory; GH-18 drill precedent.)*

### Executor probes (the planner's executor answers locally before claiming green)

1. **Pending-deployments shape on a waiting run.** Collector assumes `[{environment:{name}}]`; confirm against the first real waiting run (or a drill `notify-drill.yml` wait) and adjust the projection. No owner needed.
2. **Run-resolution latency after dispatch.** Measure poll window for `head_sha`-equality lookup; encode the timeout + fallback link (workflow page + SHA) in the report job.
3. **`gh attestation verify --bundle` offline path.** Prove it in the hop self-test fixture (tampered MAR red, bundle-missing red, wrong-repo red) and in one legion container run.
4. **`channel-live --withdrawn` expectation flip.** Prove both modes in the self-test (release-green, withdrawn-green, cross-mode red) so the flip cannot silently pass everything.
5. **SHA-step plants.** Non-tip SHA, non-manifest ancestor, workflows-divergent ancestor, `secrets.` in the step — each red naming the value; tip + manifest-touching ancestor green.
6. **State-table set-equality.** Remove one fixture and one table row in turn; each direction goes red (the TRAIN-09 contract, extended to 8 new states).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `scripts/verify-platform.sh` registry rows. Each script carries its own `--self-test` |
| Config file | none. Extended rows keep their names; any genuinely new row is appended (quick rows before the `if [ "$QUICK" -eq 0 ]` line ≈ 4733, full rows inside the `CHECKS+=` block) |
| Quick run command | `scripts/verify-platform.sh --quick` (includes the extended `release-train-logic-self-test` fixtures + hop self-test plants) |
| Full suite command | `scripts/verify-platform.sh` (full), plus the live drill evidence (`node scripts/verify-mar-update-hop.mjs` against `.mozbuild/mar-hop/` with `served: release`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TRAIN-10 (states) | 8 states derived from runs/pending/Releases/contents; one transition/run; exact run linked | static, quick (fixtures, set-equality) | `scripts/verify-platform.sh --only release-train-logic-self-test` | ❌ new in Phase 43 (`scripts/release-train.mjs`); Phase 50 extends fixtures |
| TRAIN-10 (dispatch+SHA) | dispatch with merge SHA; SHA==tip or manifest-touching ancestor + workflows-identity, else exit | static plant (quick) + live run observation | self-test plants (non-tip, non-manifest ancestor, workflows-divergent) + first real dispatch green | ❌ `release.yml` is Phase 49; SHA step added here |
| REL-02 | no-update descriptors per target; channel-live rerun in withdrawn mode; Release marked per probe; never delete | static shape (quick, if planner adds a row) + live withdraw drill (full, owner) | `--only <withdraw-row>-self-test` (if added) + owner-executed withdraw on a probe tag | ❌ new `withdraw.yml` in `powerbrowser-updates` |
| GH-15 | KNOWN-ISSUES bytes in one pinned issue; create-once/PATCH-on-diff | static bytes-compare plant (quick) + live PUBLISHED observation | self-test: differing bytes → PATCH, identical → no-op, duplicates → red | ❌ report-job step (Phase 43 job, Phase 50 step) |
| UPD-16 | `served: release` N→N+1 from clean non-Nix room proves hosts/hash/version/signature/channels/attestation | static plants (quick) + live drill (full, owner on legion) | `node scripts/verify-mar-update-hop.mjs --self-test` (11 plants) + `scripts/verify-platform.sh --only mar-update-hop` against real evidence | ◐ script exists; `served` selector + plants new |
| REL-03 | bump merged, `release` approved, hop passed, /download live, descriptor after `descriptor` approval | manual-only (owner checkpoints) + observation | exact `gh` commands in `checkpoint:human-action`/`approval` steps; criterion-5 sweep/allowlist values recorded | — (procedure, not a row) |
| Criterion 5 | asset hosts at layer 3; sweep runner/channel/download rows live | observation (full, live) | `bash scripts/verify-endpoints.sh --layer 3` facility + sweep issue values pasted into the release record | — (no new rows) |

### Sampling Rate
- **Per task commit:** `scripts/verify-platform.sh --quick`, after `git add` of the new files (the residual-brand scan reads `git ls-files`).
- **Per wave merge:** `--quick` plus each extended row's `--self-test`.
- **Phase gate:** `--quick` green, then the owner checkpoints in order (probe → bump merge → `release` approval → hop → /download → `descriptor` approval → DONE), then the release record (probe verdict, hop evidence path, sweep values, pin link) lands in `docs/RELEASING.md`.

### Wave 0 Gaps
The registry and the self-test conventions exist (`mar-update-hop`, `release-identity`, `update-channel`, `repo-controls`, `workflows` rows all present with plants). The gaps are exactly the unlanded dependencies (train skeleton, `release.yml`, updates repo, KNOWN-ISSUES file, sweep) — researched here against SPEC text, built by their owning phases.

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Owner approvals on `release` + `descriptor` (required reviewers, branch policy `main`); second owner for recovery (SEC-06) |
| V4 Access Control | yes | Bot App without Workflows; SHA validation + pre-job hook (SEC-10) bind legion to `release.yml@main` + `workflow_dispatch`; no secret/`environment:` on legion jobs; withdraw token scoped to two repos, minted just before use |
| V5 Input Validation | yes (workflows) | No `github.event.*` in `run:`/`prompt:` (GH-12 rule covers the new steps); `merge_sha` validated as 40-hex + ancestry before any use |
| V6 Cryptography | yes | MAR channel check before `signmar -s` (SEC-07, Phase 49); `signmar -v` + `gh attestation verify` re-proven on served bytes in the hop |
| V10 Malicious Code / supply chain | yes | SHA-pinned admitted `uses:` (server policy + `workflows` row); no cache in the release path; draft-then-publish under immutable releases; versioned immutable asset URLs |
| V14 Configuration | yes | Declared environments/branch policies (GH-07, read back by `repo-controls`); withdraw/descriptor commits derived from manifest target sets |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Stale/malicious SHA dispatched to legion | Elevation / Tampering | SHA validation (tip-or-manifest-ancestor + workflows-identity) as the first step; pre-job hook rejects non-`release.yml@main` before any step |
| Same-repo branch reaching legion via workflow edit | Elevation | No App holds `workflows`; `workflows` row (legion only in `build-*`/`matrix-*`, no secrets/env); runner-group restriction if the GH-11 probe allows |
| Release created from a SHA the bot cannot publish | Denial of service (stuck train) | Fail fast in SHA validation with the rebase instruction; run link by `head_sha` so the stuck run is diagnosable |
| Forged descriptor steering updaters | Spoofing / Tampering | Signature + channel + hash checks at sign time; byte-identity + hash-recompute + attestation in the hop; `channel-live` as the pipeline's final job |
| Asset replaced after publication | Tampering | Immutable releases + draft-carrying-all-assets + single publish; versioned URLs only (latest-download red) |
| Withdrawn-but-still-offered MAR | Tampering | No-update descriptors + withdrawn-mode channel-live rerun + Release marking + reopened tracking issue; fix always a new revision |
| Prompt injection reaching a write token via issue/PR text | Tampering | GH-12 event-text rule on all new steps; report job builds prompts/bodies from trusted fields only (run URLs, SHAs, file bytes it fetched itself) |
| History rewrite / tag forgery | Tampering / Repudiation | `main-integrity` (no bypass) + `release-tags` (bot-only bypass); owner `current_user_can_bypass: never` asserted by `repo-controls` |

## Sources

### Primary (HIGH confidence)
- **Live `gh api` GETs this session.** Releases (`[]`), immutable-releases (`enabled: false`), workflows (2 active), runs sample (fields `head_sha/head_branch/event/status/conclusion/html_url`), pending_deployments (`[]` on completed), jobs (`name/status/conclusion`), deployments (`[]`), issue search (`release-train: 0`), updates repo (404), auth scopes (`read:org, repo, workflow`).
- **Tree (read this session).** `scripts/verify-mar-update-hop.mjs` (full: `buildUpdateXml`, evidence-half assertions, self-test pattern); `scripts/verify-workflows.mjs` (trust-boundary rules + good-`release.yml` fixture); `scripts/verify-release-identity.mjs` (tag shape `RELEASE_TAG`, set-equality style); `scripts/verify-update-channel.mjs` (channel derivation, structured-mention sweep); `scripts/verify-repo-controls.mjs` + `apply-repo-controls.mjs` (control-table pattern, in-memory self-test, fail-closed reads); `scripts/plan-gate.py` (stream gate); `scripts/verify-platform.sh` (registry quick/full split, `mar-update-hop` pair); `docs/RELEASING.md` (procedure, asset names, hop record shape, channel-live description); `configuration.toml` (`[product].revision`, `[upstreams]` pin, `[urls]`); `.github/workflows/verify.yml`, `rebase-upstream.yml`, `notify-drill.yml` (workflow precedents); `powerbrowser/endpoint-allowlist.json` (29 hosts, dispositions); `scripts/generate.mjs` (`UPDATE_CHANNEL`, `updateChannel`, `releaseIdentity`); `objdir/dist/bin/signmar` + `gh attestation` presence.
- **Planning record.** REQUIREMENTS.md (TRAIN-10, REL-02, GH-15, UPD-16, REL-03 full text + Owner Decisions 1–22 + External Gates); ROADMAP.md Phase 50 section (goal, criteria 1–5, dependencies); 50-CONTEXT.md (boundary, gates, A1–A7 assumptions); 40/41-CONTEXT + 40/41-RESEARCH + 41-COVERAGE (shape precedent, REST bodies, pitfalls incl. Pitfall 2 Workflows-permission finding); v1.6 SUMMARY.md (Phase E + Architecture Approach §§2–3, confidence table, research flags); S5 draft plan (four-job pipeline shape, `served` selector rationale, live-gate designs — superseded where it contradicts REQUIREMENTS, e.g. ephemeral runner, PAT usage, tag-triggered releases).

### Secondary (MEDIUM)
- 41-RESEARCH's GitHub docs citations (releases Workflows note, App permissions tables, runner groups, notifications, environments) — reused, not re-fetched; re-verify if the plan slips past 2026-11-20.
- Upstream `UpdateService.sys.mjs:1954-1962` (`updateIsAtLeastAsOldAs`) via S5's read — the same-appVersion upgrade semantics.
- The `update.xml` no-update byte shape and the 11-segment path + `_redirects` ten-placeholder rule via S5/RELEASING.md reads (live probe belongs to Phase 47).

### Tertiary (LOW — flagged, not relied on)
- GraphQL `pinIssue` availability to an App token ([ASSUMED]; executor/owner probe decides; manual fallback recorded).
- Whether PATCH `prerelease` sticks under immutable releases ([ASSUMED] false-or-true; the REL-02 probe decides before the first public release).
- The ESR calendar pick for the first public release (external gate; the plan encodes the rule, the owner picks the date).

## Metadata

**Confidence breakdown:**
- Train-state REST shapes + derivation table: HIGH (probed live shapes + schema-backed siblings; one [ASSUMED] nesting detail on waiting-run pending deployments, executor-probed).
- SHA-validation logic + placement: HIGH (git plumbing is standard; workflows-tree conjunct is HIGH per 41-RESEARCH Pitfall 2 citation).
- Withdraw design (location, token, bytes, rerun, probe): HIGH for shape, MEDIUM for the flag-vs-notes branch (needs the owner probe).
- KNOWN-ISSUES create-vs-update: HIGH for the REST half, MEDIUM for pinning (GraphQL vs owner click).
- `served: release` hop (assertions, plants, container procedure): HIGH for the script extension (analogue exists in-tree), MEDIUM for attestation-inside-container auth (bundle form assumed, executor-probed).
- Release procedure + criterion-5 observation: HIGH (checkpoints are procedural; calendar is external).
- Dispatch-token scope (bot vs clock vs `GITHUB_TOKEN`): MEDIUM — the constraint (bot lacks Actions) is HIGH, but which token Phase 43's `dispatch-release` job adopts must be pinned by the planner against the landed skeleton.

**Research date:** 2026-10-23
**Valid until:** 2026-11-23. The GitHub REST surface moves; re-check the pending-deployments shape and the API version header if the plan slips. Re-run the live baseline (Releases count, updates-repo existence, immutable-releases flag) at plan time — all three change under the plan's feet by design.

## RESEARCH COMPLETE
