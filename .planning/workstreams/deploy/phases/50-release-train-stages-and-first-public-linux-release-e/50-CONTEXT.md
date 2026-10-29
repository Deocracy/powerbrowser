# Phase 50: Release train stages and first public Linux release (E) - Context

**Gathered:** 2026-10-22
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

The train carries a release from a merged bump PR to a live descriptor by itself, a bad release can be withdrawn without deleting it, and the first public Linux release is live.

Requirements: TRAIN-10, REL-02, GH-15, UPD-16, REL-03 (full text in `.planning/workstreams/deploy/REQUIREMENTS.md`).

Depends on: Phase 43 (train skeleton: DETECTED/BUMPING/CONFLICT/BUMP_RED/BUMP_PR_GREEN, `scripts/release-train.mjs`, `release-train-logic-self-test`, `detect-upstreams.mjs`), Phase 46 (update experience, `mar-update-hop`, allowlist rows), Phase 48 (maintenance sweep rows: runner-online, channel-liveness, download-count), Phase 49 (release pipeline `release.yml`: secretless legion `build-linux`, hosted `sign-publish`, `descriptor` job, `channel-live`). Also reads Phase 44 (`build-update-xml.mjs`, `descriptor-monotonic`) and Phase 47 (`/download`, `powerbrowser-updates` static host).

</domain>

<decisions>
## Implementation Decisions

### Already decided (owner, 2026-10-20)
- All owner decisions in REQUIREMENTS.md "Owner Decisions" are binding: Apps only, no PATs; bot App without the Workflows permission; non-ephemeral legion runner (Phase 49); fork approval for all external contributors; tags created only by the bot App after `release` approval; one release per ESR point release plus out-of-band revision bumps; 24-hour canary wait plus owner-as-reviewer on `descriptor` (decision 18); Releases are never deleted, the fix is a new revision; immutable releases on with zero Releases (GH-09).
- Decision 13: no `release.json`, no version facts on the home page. The tracking issue is a view rendered from GitHub facts, never read back as state (TRAIN-02).

### Owner gates in this phase (stop points for autonomous execution)
- Every live GitHub action is an owner action: merging the bump PR, approving the `release` environment, running the N-to-N+1 hop on legion, approving the `descriptor` environment after the owner's own N-1 to N hop, publishing /download, and the immutable-release pre-release-flag probe (REL-02). Plans build everything locally — `release-train.mjs` state extensions, `release.yml` SHA validation, the withdraw job, the `served: release` hop extension, the pinned KNOWN-ISSUES issue — and end with `checkpoint:human-action` / `checkpoint:human-approval` steps listing the exact commands; no executor task merges, approves, pushes to `powerbrowser-updates`, or marks a Release.
- Read-only `gh api` calls against the live org/repo are allowed for research and for deriving train states.
- The ESR 153 calendar decides which point release becomes the first public release (External gate). The plan records the calendar rule; the executor does not pick a date.

### Assumptions on unfinished dependencies (recorded per autonomous rules)
- Phase 41 is In Progress (3/4 plans; 41-04 owner checkpoint pending) and Phases 42–49 are Not Started. This plan is written against ROADMAP.md and REQUIREMENTS.md as written, not against landed code:
  - A1: `scripts/release-train.mjs` with `derive`/`next`/`render` pure functions, one state table, `release-train-logic-self-test` comparing fixture state list to table as set equality, plus `scripts/detect-upstreams.mjs` (Phase 43) — assumed present with the Phase A states DETECTED, BUMPING, CONFLICT, BUMP_RED, BUMP_PR_GREEN.
  - A2: `release.yml` with `build-linux` (legion, `contents: read`, no secrets, no environment), `sign-publish` (ubuntu-latest, env `release`, SHA/recency/exit checks, draft asset-set check, single publish with bot App token), `descriptor` (env `descriptor`, 1440-minute wait + owner reviewer, App token scoped to `powerbrowser-updates`), `channel-live` (byte-equal descriptor, MAR HEAD 200, offered version equals latest Release) — assumed present per Phase 49.
  - A3: `scripts/build-update-xml.mjs` importing `buildUpdateXml` from `verify-mar-update-hop.mjs`, `descriptor-monotonic` row (Phase 44) — assumed present.
  - A4: portable Linux tarball + complete MAR from the Phase 45 container build, packaged-launch/identity rows green — assumed present as the hop inputs.
  - A5: `mar-update-hop` fork drill (`served: fork`), `shell-request-kinds`, update copy rows (Phase 46) — assumed present; this phase adds only the `served: release` real-release extension.
  - A6: `powerbrowser-updates` repo on Cloudflare Pages at updates.powerbrowser.org with per-target `update.xml` + `_redirects`, full-tier `updates-repo-static` row (Phase 47) — assumed present; /download live is its page.
  - A7: pinned `release-train: maintenance` sweep issue with runner-online, channel-liveness, download-count rows (Phase 48) — assumed present; this phase only observes their live values at the first public release (criterion 5), it does not build the sweep.
- If any assumed file or row differs when Phases 43–49 land, the executor follows the landed tree and records the delta in the SUMMARY; the plan's derivation rules (derive-from-tree, set equality, byte-identity) already require that.

### Claude's Discretion
All other implementation choices are at Claude's discretion — discuss phase was skipped per user setting. Use the ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

</decisions>

<code_context>
## Existing Code Insights

Start from `.planning/research/v1.6-deploy/SUMMARY.md` Phase E and Architecture Approach §§2–3 (reconciler shape, three wake-ups, concurrency, `release.yml` four-job shape, withdraw without deleting), plus:
- `scripts/verify-mar-update-hop.mjs` (exports `buildUpdateXml`; evidence-half asserts distinct versions/buildIDs, byte-identical served descriptor, hash-pinned sha512 + size, fork-server access log, resolver log with zero `*.mozilla.org`/`*.mozilla.net` while naming the serving host; `--self-test` is `--quick`-honest, no build/browser/network).
- `scripts/verify-workflows.mjs` (the trust boundary this phase must not break: no `schedule:` key; legion label only in `release.yml` jobs named `build-*`/`matrix-*` with no `secrets.` and no `environment:`; `claude-code-action` only on hosted runners; `issues: write` only on `release-train.yml` job `report` and `triage.yml`; every `workflow_run` job guards `head_repository.full_name == github.repository` and no `workflow_run`-triggered workflow is itself a source; every `uses:` is a 40-hex SHA admitted by `.github/settings/actions-selected.json`; `contents`/`id-token`/`attestations` write trio only on `sign-publish`; no `pull_request`/`pull_request_target` on `release.yml`/`release-train.yml`; no cache step in the release path; no `github.event.*` text inside `run:`/`prompt:` — plus in-file good `release.yml` fixture).
- `docs/RELEASING.md` (existing release-procedure text, environment policy, runner shape, per-release approval steps; REL-02 probe result and GH-18-style drill records land here).
- `configuration.toml` (`[product].revision`, `[upstreams]` pin, `[urls]` update/homepage/release-notes — the release key `v<ESR>-<revision>` source).
- `scripts/verify-release-identity.mjs` / `verify-update-channel.mjs` (release-key and channel derivation the SHA check and drill reuse).
- `.github/workflows/verify.yml`, `rebase-upstream.yml`, `notify-drill.yml` (workflow precedents; `release.yml`/`release-train.yml` do not exist yet — assumed from Phase 43/49 specs).
- `.planning/drafts/distribution/S5-linux-release-pipeline-and-update-channel-PLAN.md` (predecessor procedure the `channel-live` and hop steps refine).

</code_context>

<specifics>
## Specific Ideas

- TRAIN-10 is a pure state-table extension: add BUILDING, AWAITING_APPROVAL, PUBLISHED, DESCRIPTOR_WAIT, DESCRIPTOR_LIVE, LIVE_RED, WITHDRAWN, DONE to the Phase 43 table; derive each from GitHub facts only (release.yml run conclusion, pending deployments for `release`/`descriptor`, Release draft/published/pre-release flags, `powerbrowser-updates` descriptor bytes). Dispatch `release.yml` with the merge SHA, link the exact run, one transition per release per run, stop at the owner merge gate. `release.yml` refuses a SHA that is neither `main`'s tip nor a `configuration.toml`-changing ancestor and exits before building.
- `release-train-logic-self-test` stays set-equality: the state list is derived from `release-train.mjs`'s own table, so a state without a fixture (or a fixture without a state) goes red; add one fixture per new state plus the SHA-validation plants (non-tip SHA, non-manifest ancestor SHA).
- UPD-16 is a `served: release` mode on the existing hop script, not a second script: same assertions (hosts, hash, version, signature, allowed channels, attestation) against the real Release assets and the public descriptor, run from a clean non-Nix container/VM on legion, with each fault plant red. Fault plants follow the existing self-test pattern (one plant per property, each naming the drift).
- REL-02 withdraw lives in `powerbrowser-updates` (a `workflow_dispatch` job there, bot App token installed on both repos per GH-10): commit the no-update descriptor for every target (or repoint at the R2 MAR copy), rerun `channel-live`, then mark the product Release per the pre-recorded immutable-release probe (pre-release flag if allowed, else withdrawal note in the Release notes). Never delete a Release, never reuse a tag.
- GH-15 is one report-job step: when the train derives PUBLISHED, copy `docs/KNOWN-ISSUES.md` bytes into one pinned issue (create once, update by exact-bytes compare like the tracking-issue PATCH rule). Criterion 5 is observation-only at the first public release: layer-3 observation of the two asset hosts plus recording the sweep's three live rows — no new rows built here.

</specifics>

<constraints>
## Inherited constraint: update download host (Phase 46 owner ruling 2026-10-25, amended 2026-10-29)

- The descriptor's `patchURL` (and `servedMarUrl`) names `https://downloads.powerbrowser.org/<tag>/<asset>`: the R2 bucket, served on its own custom domain, is the primary MAR origin (owner ruling 2026-10-29). It is never a `github.com/.../releases/download/` URL (github.com is `user-initiated`; an unattended fetch fails `scripts/lib/endpoint-verdict.mjs`).
- Why not `release-assets.githubusercontent.com`: GitHub's redirect target is a signed URL that expires about one hour after issue (`se=` one hour after `skt=`, observed 2026-10-29), so a static descriptor cannot name it. Why not the updates host: Pages caps a single file at 25 MiB.
- Consequences: `endpoint-allowlist.json` gains an `allow` row for `downloads.powerbrowser.org`; the `release-assets.githubusercontent.com` row loses its updater justification (Phase 50 criterion 5 observes the R2 host instead). R2 keys are `<tag>/<asset>` and write-once (the copy refuses to overwrite), which replaces the immutable-Release-URL argument of T-49-14. The GitHub Release keeps the same signed bytes as the archival copy. REL-02's R2-repoint withdraw mode is removed: withdraw is no-update only.
- Owner steps added to the R2 checkpoint (49-05 Task 3): attach `downloads.powerbrowser.org` as the bucket's custom domain with public read; no `r2.dev` URL.
- Guard: `scripts/verify-update-download-host.mjs` (quick row).
</constraints>

<deferred>
## Deferred Ideas

None — discuss phase skipped.

</deferred>
