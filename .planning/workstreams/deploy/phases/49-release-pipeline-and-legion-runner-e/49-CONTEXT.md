# Phase 49: Release pipeline and legion runner (E) - Context

**Gathered:** 2026-10-23
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped; autonomous mode, no human present)

<domain>
## Phase Boundary

An owner-approved dispatch of `release.yml` builds on legion with no secrets, signs and publishes on a hosted runner, and releases the descriptor after the canary wait, with no credential stored on legion.

Requirements: SEC-08, SEC-10, DIST-02, AUTO-05, SEC-07, DIST-07, DIST-08, DIST-09, UPD-17, INF-04 (full text in `.planning/workstreams/deploy/REQUIREMENTS.md`).

**Depends on:** Phase 41 (fork approval, environments), Phase 44 (descriptor builder, `descriptor-monotonic`), Phase 45 (container build), Phase 47 (updates host).

</domain>

<decisions>
## Implementation Decisions

### Already decided (owner, 2026-10-20)
- All owner decisions in REQUIREMENTS.md "Owner Decisions" are binding (SEED-002 §12 recommended defaults plus the research additions): Apps only, no PATs; bot App without the Workflows permission; non-ephemeral legion runner (this phase); fork approval for all external contributors; tags created only by the bot App after `release` approval.
- Runner shape: non-ephemeral, one-time registration token, no credential on legion.

### Assumptions about unfinished dependencies (autonomous planning; Phase 41 waits on the owner)
- **Phase 41 (3/4 plans executed, owner checkpoint pending):** assume GH-07 environments (`release` with owner reviewer, `descriptor` with owner reviewer plus 1440-minute wait timer, `bot`, `fixer`, `triage`, all branch policy `main`), SEC-11 fork approval for all external contributors, GH-08 selected-actions with `sha_pinning_required`, GH-06 tag ruleset (tag creation only by `powerbrowser-bot`), and both Apps without the Workflows permission all land as specified in Phase 41's plans. Phase 49 plans assert them via `repo-controls` reads and the `workflows` row; they re-declare nothing.
- **Runner-group probe [informational] (unknown until the owner runs it):** plans handle both outcomes. The pre-job hook (SEC-10) and environment branch policies are built regardless; the probe result recorded in `docs/RELEASING.md` decides only whether the runner-group restriction sentence is also claimed.
- **Phase 44 (not yet planned):** assume `scripts/build-update-xml.mjs` exists and writes one descriptor per BUILD_TARGET with `detailsURL` idempotently from built artifacts, and the full-tier `descriptor-monotonic` row exists. This phase's `descriptor` job consumes both.
- **Phase 45 (not yet planned):** assume the container build produces the Linux tar.xz, the complete MAR and `release-manifest.json` (baked update URL, version, buildID, `OS_TARGET`, `TARGET_XPCOM_ABI`, `MOZ_UPDATE_CHANNEL`, joined BUILD_TARGET, on-disk asset filenames), and the packaged-launch and install-matrix rows run against the packaged tree. The `build-linux` job invokes that build and those rows; it does not re-derive them.
- **Phase 47 (not yet planned):** assume the `powerbrowser-updates` repo exists and deploys to updates.powerbrowser.org with the `_redirects` 11-segment rule, and that Cloudflare R2 is enabled (owner action). The `descriptor` commit target and the DIST-08 R2 copy target both assume these.
- Each assumption above is flagged in the owning plan's must_haves as an assumption, so a drift in the dependency phase surfaces at execute time rather than silently.

### Owner gates in this phase (stop points for autonomous execution)
- legion NixOS changes (runner user, `ACTIONS_RUNNER_HOOK_JOB_STARTED` hook) finished with `nrs` are an owner action on legion.
- Runner registration (one-time registration token) happens only after SEC-11, SEC-10 and GH-07 are in place; the token is an owner action.
- Cloudflare R2 enablement (a payment method may be required) is an owner action.
- Per-release `release` and `descriptor` environment approvals are owner actions at release time, not planning or build time.
- The cold hosted fallback build (INF-04) is measured, not run, by plans: plans add the procedure and record the measured duration and disk use in `docs/BUILD.md`. If no measurement exists yet, the plan records the measurement steps and leaves the values to the first execution.
- Artifact storage per release is measured against the 500 MB cap (research flag: public-repo exemption unconfirmed; `retention-days: 1` plus deletion of artifacts after sign-publish is the mitigation either way).
- Plans build everything locally — `release.yml`, scripts, registry rows with self-tests, docs — and end with exact owner commands for registration, approvals and dispatch. No plan pushes, dispatches, registers, approves, mints or reads signing material.

### Claude's Discretion
All other implementation choices are at Claude's discretion — discuss phase was skipped per setting. Use the ROADMAP phase goal, success criteria, codebase conventions, `.planning/research/v1.6-deploy/SUMMARY.md` Phase E (§Phase E, §§5.3, pitfalls 2-5) and the S5 draft as guidance, not as verbatim instructions (S5 predates owner decisions 2, 3, 6, 11, 12 and corrections 2, 6, 12, 14, 17).

</decisions>

<code_context>
## Existing Code Insights

Start from `.planning/research/v1.6-deploy/SUMMARY.md` ("Phase E" lines 282-294, shape items 3-5, pitfalls 2-5) and `ARCHITECTURE.md` §§5.3, 7, 8 (release.yml job table, runner controls, `_redirects`, state table BUILDING→DONE), plus:
- `.github/workflows/verify.yml` (pinned checkout/Nix action SHAs, `nix develop .#theia --command` step shape, `contents: read` + `persist-credentials: false` posture)
- `.github/workflows/rebase-upstream.yml` (callable Nix workflow precedent for `workflow_call` + `workflow_dispatch` inputs)
- `.github/workflows/notify-drill.yml` (GH-18 drill workflow: the good fixture the `workflows` row already covers)
- `scripts/verify-workflows.mjs` (the trust-boundary rules this phase's `release.yml` must satisfy: no `schedule:`, legion label only in `release.yml` jobs named `build-*`/`matrix-*` with no `environment:` and no `secrets.`, write-trio only on `sign-publish`, no `pull_request`/`pull_request_target` on `release.yml`, no cache steps, guarded `workflow_run`, SHA-pinned admitted `uses:`)
- `scripts/verify-release-identity.mjs` (release-key derivation precedent: derive-and-compare with mkdtemp self-test)
- `scripts/verify-mar-update-hop.mjs` (hop-drill instrument; Phase 50 extends it, this phase only ensures the build produces what it needs)
- `scripts/toolchain-baseline.sh` + `toolchain-baseline.txt` (AUTO-05 extends the baseline to the container's Mozilla bootstrap toolchain)
- `docs/RELEASING.md` (current release-asset, runner-shape and procedure text this phase rewrites with values derived from the built tree)
- `docs/BUILD.md` (where INF-04 duration/disk measurements are recorded)

</code_context>

<specifics>
## Specific Ideas

- `release.yml` runs on `workflow_dispatch` only, with a SHA input validated as `main`'s tip or a `configuration.toml`-changing ancestor (TRAIN-10), and exits without building when the derived release key is not greater than the latest Release tag (DIST-02). The SHA check runs as the first step of every legion job (SEC-10 doubles as TRAIN-10 enforcement).
- SEC-10 pre-job hook (`ACTIONS_RUNNER_HOOK_JOB_STARTED`) rejects every job unless `GITHUB_WORKFLOW_REF` is `.../release.yml@refs/heads/main` and the event is `workflow_dispatch`; a planted job from another branch is the self-test fault that must go red before any step runs.
- `sign-publish` (ubuntu-latest, env `release`) is the only job carrying `contents: write` + `id-token: write` + `attestations: write`; it refuses a MAR whose embedded channel differs from `ACCEPTED_MAR_CHANNEL_IDS` (SEC-07), signs and verifies with `signmar -v` against the tracked DER, checks the draft's asset set against the manifest before the single publish, creates tag `v<ESR>-<revision>` with the bot App token, and copies the MAR to R2 with the R2 object-write token from the `release` environment.
- `descriptor` (env `descriptor`, 24-hour wait + owner approval) commits one `update.xml` per BUILD_TARGET to `powerbrowser-updates` with an App token scoped to that repo, after `descriptor-monotonic` passes; `channel-live` runs last and daily in the sweep (UPD-17).
- New checks land as registry rows in `scripts/verify-platform.sh` with `--self-test` siblings that plant each named fault (CLAUDE.md): static `release.yml` shape (extends the `workflows` row's release.yml fixture rather than duplicating it), hook refusal, channel-gate, asset-set equality, `channel-live`.
- Research flag E must be settled by research: the Actions artifact storage cap; the environment approval timeout; the github-runner 30-day update rule against nixpkgs lag.

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
