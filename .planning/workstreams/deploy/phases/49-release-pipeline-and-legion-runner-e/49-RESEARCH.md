# Phase 49: Release pipeline and legion runner (E) — Research

**Researched:** 2026-10-23
**Domain:** `release.yml` dispatch validation, secretless legion build, hosted sign-publish, delayed descriptor, channel liveness
**Confidence:** HIGH for in-tree shapes and REST shapes (all re-read this session); MEDIUM for three platform behaviours that need a live run to close (artifact cap, approval timeout, runner-version lag). No web search was available (DeepSeek search has no API key in this session); all platform facts below are from the tree, the v1.6 research dir, and the GitHub/Cloudflare docs those already cite — not from fresh fetches.

## Summary

Phase 49 can be built entirely from tree-derived facts plus the owner actions 49-CONTEXT already names. The pipeline shape is:

```
workflow_dispatch (SHA input, owner or train)
  → build-linux  [self-hosted, powerbrowser-release]  contents:read, no env, no secrets
      validates SHA (= main tip or configuration.toml-changing ancestor, TRAIN-10)
      exits 0 without building when release key ≤ latest Release tag (DIST-02)
      container build (Phase 45) + toolchain-baseline.sh (AUTO-05)
      packaged-launch + install-matrix rows against the packaged tree
      uploads tarball + complete MAR + release-manifest.json, retention-days: 1
  → sign-publish  ubuntu-latest, env `release` (owner reviewer, admin bypass OFF)
      contents:write + id-token:write + attestations:write (only job with the trio)
      SEC-07 channel gate → signmar -s → signmar -v → SHA256SUMS → attest
      draft → asset-set equality check → single publish
      bot-App tag v<ESR>-<revision> (GH-06 bypass) + R2 MAR copy (DIST-08)
      deletes artifacts after publish (cap mitigation)
  → descriptor  ubuntu-latest, env `descriptor` (owner reviewer + 1440-min wait, admin bypass ON)
      descriptor-monotonic (Phase 44) → commit one update.xml per BUILD_TARGET
      to powerbrowser-updates with a repo-scoped App token (DIST-09)
  → channel-live  ubuntu-latest, contents:read — byte-equal, HEAD 200, version = latest Release (UPD-17)
```

The legion runner is **non-ephemeral, registration-token, no credential on legion** (owner decision 2; 49-CONTEXT). It is registered only after SEC-11 + SEC-10 + GH-07 are green. The pre-job hook `ACTIONS_RUNNER_HOOK_JOB_STARTED` is the only runner-bound control (repo-scoped runners are in no runner group — 41-RESEARCH Pitfall 3). Every other control is workflow text + environments + App permissions, all already declared in `.github/settings/` and read back by `repo-controls`.

The S5 draft (`.planning/drafts/distribution/S5-…-PLAN.md`) **must not be copied verbatim**. It predates owner decisions 2, 3, 6, 11, 12 and corrections 2, 6, 12, 14, 17. Concrete divergences are listed under Pitfalls. The authoritative shapes are SUMMARY Phase E (lines 282-294), ARCHITECTURE §§5.3/7/8, and the Phase 41 `verify-workflows.mjs` + `verify-repo-controls.mjs` pair.

Project skills checked: `.claude/skills/` holds only `sketch-findings-Power-Browser` (UI design); `.agents/skills/` does not exist. Neither applies to this phase.

## Phase Requirements table (ID | research support)

| ID | Requirement (short) | Research support — what the planner can rely on |
|---|---|---|
| SEC-08 | Non-ephemeral legion runner, registration token, own user, no secret, work dir without spaces, label only in `build-*`/`matrix-*` | Owner decision 2 + 49-CONTEXT runner shape. STACK `services.github-runners.<name>` option list (`enable, url, tokenFile/tokenType or githubApp, ephemeral, replace, name, extraLabels, extraPackages, user, workDir`, `options.nix:61-200,392-412`, `svcName = "github-runner-${name}"`, `tokenFile` on `InaccessiblePaths`, `count` defaults 1). `verify-workflows.mjs` `legion` + `runner` rules already enforce label/environment/secrets placement. `repo-controls` enforces fork approval + branch policies. Registration is an owner `pkexec … nrs` action after SEC-11/SEC-10/GH-07. |
| SEC-10 | `ACTIONS_RUNNER_HOOK_JOB_STARTED` rejects unless `GITHUB_WORKFLOW_REF` is `…/release.yml@refs/heads/main` and event is `workflow_dispatch`; SHA check first step of every legion job | PITFALLS Pitfall 4 + ARCHITECTURE §5.3: hook exits non-zero → job fails before any step; hook sees default variables + `GITHUB_EVENT_PATH` (`docs.github.com …/run-scripts`). 49-CONTEXT narrows the S5/PITFALLS `push`-or-dispatch wording to `workflow_dispatch` only (release.yml has no `push`, no `pull_request` — GH-12). TRAIN-10 SHA rule (`main` tip or `configuration.toml`-changing ancestor) doubles as the in-job check. Self-test fault: planted job from another branch must go red before any step runs. |
| DIST-02 | `release.yml` on `workflow_dispatch` only; `build-linux` on `[self-hosted, powerbrowser-release]`, `contents: read`, no env/secrets; exits when key ≤ latest tag; packaged rows; artifacts `retention-days: 1`; storage measured vs 500 MB cap, deleted after sign-publish | Owner decisions 2, 11 (artifacts hand-off, legion keeps `contents: read`). ARCHITECTURE §6 job table + §11 (about 260 MB/release, retention 1 day, delete after `sign-publish`). STACK `upload-artifact v7.0.2 cf430e0…` / `download-artifact v8.0.2 9000827…`, `retention-days: 1`. `verify-workflows.mjs` enforces `no-pr-trigger`, `legion`, `no-cache`, `uses-pinned/admitted`. Release-key derivation precedent: `releaseIdentity()` in `scripts/generate.mjs:2796-2808` + `verify-release-identity.mjs` (derive-and-compare, mkdtemp self-test). Latest-tag read: `GET /repos/{owner}/{repo}/releases?per_page=1` or `gh release view --json tagName` (see Code Examples). |
| AUTO-05 | Release build runs `toolchain-baseline.sh` against `toolchain-baseline.txt` pinning the container's Mozilla bootstrap toolchain; drift fails the build | Owner decision 19. Current baseline (`toolchain-baseline.txt`: `rustc 1.97.1, cargo 1.97.0, cbindgen 0.29.4`) pins the **flake** toolchain; Phase 45/49 extends it to the **container bootstrap** toolchain (Mozilla clang, rust, cbindgen, jessie sysroot glibc 2.19, container image digest). STACK: base `debian:bookworm`, `--enable-bootstrap`, `build-sysroot.sh:19-22`, `bootstrap.configure:188-250`. `docs/BUILD.md` Toolchain-baseline section gives the diff/regen commands. PITFALLS debt table: never pin `MOZ_BUILD_DATE` to the ESR tag. |
| SEC-07 | Before `signmar -s`, require MAR product-info channel == `ACCEPTED_MAR_CHANNEL_IDS`; sign with container-built `signmar` on `ubuntu-latest`; verify with `signmar -v` against tracked DER | PITFALLS Integration Gotchas (MAR product info) + `docs/RELEASING.md` troubleshooting (`failed: 22` = `MAR_CHANNEL_MISMATCH_ERROR`). `updateChannel()` in `scripts/generate.mjs:1393-1396` derives `powerbrowser-default` (`UPDATE_CHANNEL='default'`, `.mozconfig:8-10`). `verify-ng-065-mar-signature.mjs` is the enforcement precedent (four outcomes, error codes read from `updatererrors.h` at check time, `signmar -d … -s/-v`, `certutil -A` of `powerbrowser/packaging/mar/mar-primary.der`). STACK: container-built `signmar` + Ubuntu `libnss3-tools`, `LD_LIBRARY_PATH=dist/bin`, no Nix in sign job. |
| DIST-07 | `sign-publish` (ubuntu-latest, env `release`): signs, `SHA256SUMS`, versioned+stable names, source tarball, `attest-build-provenance`; derived notes (no `--generate-notes`); draft → asset-set equality → single publish; bot-App token mints tag `v<ESR>-<revision>` + publish | Owner decisions 3 (App creates tag after approval; no signatures rule), 11, 13 (no `release.json`, no `--generate-notes`). ARCHITECTURE §6 + PITFALLS Pitfall 8 (draft → upload → verify asset set → publish once; sign job exits if newer Release exists; mint token immediately before use — App tokens expire after 1 h). `ruleset-release-tags.json` (bot-only bypass, `app:powerbrowser-bot` resolved to `app_id` at apply). 41-RESEARCH Pitfall 2: release only from tip of `main` or a SHA whose `.github/workflows/` is identical to `main`'s, else the bot's create-release call 403/404s. `attest-build-provenance v4.2.2 4d10147…` (STACK). Asset table source: `docs/RELEASING.md` `## Release asset names` + `release-manifest.json` (Phase 45). |
| DIST-08 | `sign-publish` copies each MAR to R2 with the R2 object-write token from `release` env | INF-06 (Phase 47): wrangler deploy token in scheduler/telemetry repos only; R2 object-write token scoped to the MAR fallback bucket, held **only** as a `release` environment secret; sweep holds no Cloudflare token. STACK: `wrangler r2 object put` from the sign job; R2 10 GB free. External gate: R2 enablement (payment method may be required) is an owner action. Each token gets a `docs/RENEWALS.md` row (DOC-04). |
| DIST-09 | `descriptor` job (env `descriptor`, 24-h wait + owner approval after own N-1→N hop) commits one `update.xml` per BUILD_TARGET to `powerbrowser-updates` with a repo-scoped App token, after `descriptor-monotonic` | Owner decisions 12 (24-h canary), 18 (`descriptor` has owner reviewer **plus** 1440-min wait, `can_admins_bypass: true` so the owner can publish sooner after the own-install hop). `environment-descriptor.json` already declares `{wait_timer: 1440, reviewers: [{type: User, id: 51835244}], can_admins_bypass: true}` + `environment-branch-policy-main.json` (`{name: main, type: branch}`). ARCHITECTURE §6: descriptor uses `{}` GITHUB_TOKEN + bot App `contents:write` scoped `repositories: powerbrowser-updates` (replaces the S5 descriptor PAT — one fewer RENEWALS row). Phase 44 supplies `scripts/build-update-xml.mjs` (imports `buildUpdateXml` from `verify-mar-update-hop.mjs:114`) + full-tier `descriptor-monotonic` (buildID strictly increases per appVersion). |
| UPD-17 | `channel-live` last in `release.yml` + daily in sweep: each public `update.xml` byte-equals its repo copy, each MAR URL HEADs 200, offered version == latest Release | SUMMARY must-have (channel-live as Floorp does) + ARCHITECTURE §4.4 sweep item 7. S5 `verify-update-channel-live.mjs` design survives with new inputs: derive host/path/channel/BUILD_TARGET set from the build job's `release-manifest.json` (never literals, never an objdir the hosted runner lacks); fetch through the baked 11-segment path (exercises `_redirects`, not the file path); parse with imported `parseUpdateXml` (`verify-mar-update-hop.mjs:125`); HEAD Content-Length == descriptor size; GET MAR sha512 == hashValue; require `https` + immutable `/releases/download/<tag>/` form (latest-download URL is red); compare appVersion/buildID vs `GET /releases/tags/v<key>` (`draft:false`). |
| INF-04 | One cold hosted fallback Linux build measured (no Actions cache, sccache off); duration + disk in `docs/BUILD.md` | PITFALLS Pitfall 5 (no cache in release path; INF-04 runs cold — amends SEED-002 checklist item 22) + Out of Scope (`Actions cache in the release path`, `Nix in the sign job`). `verify-workflows.mjs` `no-cache` rule enforces it. `docs/BUILD.md` attribution rule (tree + host + toolchain per figure) governs the recorded row. Phase 58 reuses the fallback during the ESR-175 dual-build window (UPS-03). Plans measure, not run, the build if no value exists yet (49-CONTEXT). |

> Superseded by the 2026-10-29 owner ruling: see 49-CONTEXT.md, "Inherited constraint: update download host (Phase 46 owner ruling 2026-10-25, amended 2026-10-29)". The patch URL is `<MAR origin>/<tag>/<asset>`, not a `/releases/download/` URL, and the R2 key is `<tag>/<asset>`.

## Architecture Responsibility Map

| Capability | Owner (this phase) | Tree / CI | GitHub server | legion (NixOS) | External hosts |
|---|---|---|---|---|---|
| Runner identity + hook | Registers once with one-time token; writes `/etc/nixos/configuration.nix` runner user + `ACTIONS_RUNNER_HOOK_JOB_STARTED`, finishes `nrs`; holds no PAT/App key afterwards | Hook script tracked in tree (reviewed), deployed to legion path by the NixOS change | Fork approval (`all_external_contributors`), `release-tags` ruleset, env branch policies `main` | Runner user (own uid, `autoSubUidGidRange` for rootless podman), work dir without spaces (e.g. `/var/lib/pb-runner`), `tokenFile` root-owned `0600` on `InaccessiblePaths` | — |
| Dispatch validation | Dispatches with SHA; approves `release` + `descriptor` per release | `release.yml` validates SHA (tip-or-`configuration.toml`-ancestor) + key>tag before any compile; `workflows` + new static rows gate the text | `release` env (reviewer owner, `can_admins_bypass: false`), `descriptor` env (reviewer + 1440 wait, bypass true) | Builds only — no env, no secrets, `contents: read` | — |
| Build bytes | — | Container build (Phase 45) + `toolchain-baseline.sh` + packaged rows; `release-manifest.json` is the bridge | Artifacts (`retention-days: 1`, deleted after publish) | Podman + `--enable-bootstrap` (Mozilla clang/rust/cbindgen, jessie sysroot); `package-linux.sh` staging; `mach repackage` + `make_full_update.sh` MAR emit | nodejs.org tarball (hash-pinned in `node-runtime.json`), Mozilla bootstrap fetch |
| Sign + publish | Approves `release` after reviewing artifact list + descriptor diff | SEC-07 gate → `signmar -s/-v` → `SHA256SUMS` → attest → draft → asset-set equality → publish; derived notes | Bot App (no Workflows) creates tag + Release; immutable releases lock them | Nothing — sign never touches legion | R2 MAR copy (writes only); Sigstore (attestation) |
| Descriptor | Approves `descriptor` after own N-1→N hop (may bypass wait) | `descriptor-monotonic` → one `update.xml` per BUILD_TARGET via `build-update-xml.mjs` | Scoped App token (`powerbrowser-updates` only) commits descriptors | Nothing | Cloudflare Pages serves `updates.powerbrowser.org` (`_redirects` 11-segment rule, Phase 47) |
| Liveness | Reads the pinned maintenance issue (Phase 48) | `channel-live` in `release.yml` + daily sweep row; `repo-controls` re-reads controls | Releases API + Pages as facts; train derives BUILDING→DONE from run/pending-deployments/Release/Pages | Hop drill host (Phase 50, `served: release`) | `github.com` → `release-assets.githubusercontent.com` (302) for MAR bytes |
| Fallback + storage | Enables R2 (payment if asked) | INF-04 cold-build procedure + row in `docs/BUILD.md`; artifact-size measurement vs 500 MB cap | Artifact quota + `DELETE …/actions/artifacts/{id}` cleanup | Disk headroom: four objdirs ≈ 14 GB each (RELEASING legion-rebuild runbook) | — |

Job / environment names (frozen by GH-12 + GH-07 — do not rename without updating both rows):

- Jobs in `.github/workflows/release.yml`: `build-linux` (`[self-hosted, powerbrowser-release]`), `sign-publish` (`ubuntu-latest`, `environment: release`), `descriptor` (`ubuntu-latest`, `environment: descriptor`), `channel-live` (`ubuntu-latest`, no environment). No `matrix-*` jobs until Phase 54; the `workflows` row already admits the `matrix-*` prefix.
- Environments: `release` (`environment-release.json`: `wait_timer 0`, reviewer `User 51835244`, `can_admins_bypass false`), `descriptor` (`environment-descriptor.json`: `wait_timer 1440`, same reviewer, `can_admins_bypass true`), both with `environment-branch-policy-main.json` (`{name: main, type: branch}`).
- GITHUB_TOKEN trio `contents:write + id-token:write + attestations:write` appears on exactly one job (`sign-publish`) — asserted by `write-trio`.
- `release.yml` triggers: `workflow_dispatch` **only** (with a required `sha` string input). No `push`, no `pull_request`, no `schedule`, no tag trigger (S5's tag trigger is superseded by decision 3 — the tag is a post-approval product).

## User Constraints (locked decisions + owner gates + discretion)

Locked (REQUIREMENTS.md Owner Decisions + 49-CONTEXT — binding, do not re-litigate):

1. Apps only, no PATs; bot App **without** Workflows; clock App Actions-write only (decisions 1, 15, 20). Consequence (41-RESEARCH Pitfall 2): `sign-publish` releases only from tip of `main` or a SHA whose `.github/workflows/` equals `main`'s.
2. Non-ephemeral legion runner, one-time registration token, no credential on legion (decision 2). The S5 ephemeral + PAT shape and STACK's `githubApp`-ephemeral shape are both superseded.
3. Fork approval for all external contributors before registration (decision 2, SEC-11). Already declared in `fork-pr-approval.json` (`all_external_contributors`).
4. Tags created only by the bot App after `release` approval; no signatures rule (decisions 3, GH-06). `ruleset-release-tags.json` pattern `refs/tags/v[0-9]*.[0-9]*-[0-9]*`, bypass `app:powerbrowser-bot`.
5. Artifacts between legion build and hosted sign; legion keeps `contents: read` (decision 11).
6. 24-h canary between publish and descriptor; `descriptor` has owner reviewer + 1440-min wait, owner may bypass after the own-install hop (decisions 12, 18).
7. No `release.json`; no `--generate-notes`; notes derived from the tree (decisions 13 + Out of Scope).
8. `toolchain-baseline.txt` pins the release container's Mozilla bootstrap toolchain (decision 19).
9. R2 object-write token held only as a `release` secret; sweep holds no Cloudflare token (INF-06, decision 8).
10. GH-11 runner-group probe outcome decides only whether a restriction sentence is claimed in `docs/RELEASING.md` — the hook + branch policies are built regardless (49-CONTEXT).

Owner gates in this phase (plans end with exact commands; no plan pushes, dispatches, registers, approves, mints or reads signing material):

- legion NixOS changes (runner user, hook, work dir) finished with `nrs` — owner on legion.
- Runner registration (one-time token) only after SEC-11 + SEC-10 + GH-07 are green — owner action.
- Cloudflare R2 enablement (payment method may be required) — owner action.
- Per-release `release` + `descriptor` approvals — owner actions at release time.
- INF-04 cold-build measurement + per-release artifact-size measurement — plans add the procedure and record values in `docs/BUILD.md`; if unmeasured, plans leave the steps and the values to the first execution.
- `retention-days: 1` + post-publish artifact deletion is the mitigation either way for the cap flag.

Claude's discretion (everything else): release.yml step order, script factoring, row names/splits, manifest field order, note-derivation template, R2 key layout under the bucket, hook implementation language — guided by SUMMARY Phase E, ARCHITECTURE §§5.3/7/8, and the S5 draft as guidance, never verbatim.

## Project Constraints (CLAUDE.md — every plan obeys)

- One driver `scripts/verify-platform.sh`; new check = one appended registry row + `--self-test` that plants each named fault (red naming the drift). No sibling driver. Cite labels, not line numbers (ARCHITECTURE §3.4: S5's line numbers are stale).
- Derive-from-tree + set equality; never hand-keep an expectation list; never assert absence of a self-emitted log line.
- Quick rows: no build/browser/display/network. `repo-controls`, `channel-live` (live half), `descriptor-monotonic` (release-manifest reads), `toolchain-baseline` in-container are full-tier; their self-tests are quick (mkdtemp/fixtures/loopback only).
- Stage new files before the brand scan (`scan-brand-residue.mjs` iterates `git ls-files`); the originating product may be named only in `inventory/brand-tokens.json`.
- Builds in `nix develop .#firefox` (Gecko) / `.#theia` (Node/yarn); `node` works outside, `yarn` does not; repo path has no space.
- Patches regenerated via `scripts/regenerate-patches.sh`, never text-edited; never touch `upstream/` or Theia core; never touch `ledger/` or `scripts/verify-ng-NNN-*.mjs` (hash-locked).
- User copy (UPD-20..23 strings, /download deltas) names "PowerBrowser", carries no internal identifier — enforced by the existing copy-shape rows, not by new prose.

## Code Examples / File inventory

Existing files this phase consumes (all re-read; paths exact):

- `.github/workflows/verify.yml` — SHA-pinned `actions/checkout@11d5960a…` (`persist-credentials: false`, `contents: read`) + `cachix/install-nix-action@13d8dd58…` + `nix develop .#theia --command` step shape. `release.yml` copies this posture.
- `.github/workflows/rebase-upstream.yml` — callable precedent (`workflow_dispatch` + `workflow_call`, required `tag` with **no default**, `verify-upstream-pins.mjs` asserts the absence). `release.yml` needs no `workflow_call`, but copies the no-default-input discipline for its `sha` input.
- `.github/workflows/notify-drill.yml` — minimal `environment: release` drill (`permissions: {}`, `ubuntu-latest`, 5-min timeout). Proves a pending-deployment approval reaches the phone; `release.yml`'s approval path is the same mechanism.
- `scripts/verify-workflows.mjs` — trust-boundary rules `release.yml` must satisfy: `no-schedule`; legion only in `release.yml` jobs `build-*`/`matrix-*` with no `environment:`, no `secrets.`, no `secrets: inherit`; `write-trio` only on `sign-publish`; no `pull_request`/`pull_request_target` on `release.yml`; no `actions/cache` or `cache:` input in release path; guarded single-level `workflow_run` (not used by `release.yml`); all `uses:` 40-hex SHA admitted by `actions-selected.json` (`github_owned_allowed: true` + `patterns_allowed: ["cachix/install-nix-action@*"]` — Phase 49 extends the admission set, never widens `allowed_actions` from `selected`); no `github.event.(issue|comment|pull_request|head_commit|review)` text in `run:`/`prompt:`. Its `--self-test` already carries a `GOOD_RELEASE` fixture (`build-linux` on legion + `sign-publish` with the trio) — **extend that fixture, do not write a second parser**.
- `scripts/verify-release-identity.mjs` — derive-and-compare precedent (`releaseIdentity()` → `v<ESR>-<revision>`, version files, milestone, tracked `update.xml`, `git tag --merged HEAD` ordering; mkdtemp self-test; "key-is-newer checked where the tag is created, never in `--quick`"). DIST-02's key>tag gate and TRAIN-10's SHA gate follow the same split: static derivation quick, network comparison in the workflow.
- `scripts/toolchain-baseline.sh` + `toolchain-baseline.txt` (`rustc 1.97.1 / cargo 1.97.0 / cbindgen 0.29.4`) + `docs/BUILD.md` Toolchain-baseline section (`diff <(nix develop .#firefox --command bash scripts/toolchain-baseline.sh) toolchain-baseline.txt`; regen only deliberately). AUTO-05 extends the *meaning* to the container bootstrap (decision 19), not the mechanism.
- `docs/RELEASING.md` — sections Phase 49 rewrites with derived values: secrets inventory (App keys per env; descriptor PAT → scoped App token), non-ephemeral runner shape (replaces `:258-288, :476-478, :917-920` ephemeral text), `release` policy `main` (`:320-321` tag-pattern text is already corrected per ARCHITECTURE R4 — verify at plan time), legion-rebuild runbook (four objdirs ≈ 14 GB each), runner-group probe result, GH-18 drill results, per-release procedure (watch/approve/confirm/liveness/hop). Also the `## Release asset names` table (Linux row pending → filled from this tree) and `## Verification map` (new rows appended).
- `docs/BUILD.md` — INF-04 + artifact-size rows land here under the attribution rule (tree + host + toolchain per figure); packaging-timings table already carries `54m40s` release-build, `54m` N+1, `33m44s` incremental, `≈2 min` MAR emit, `≈8 min` check→apply cycle.
- `scripts/verify-mar-update-hop.mjs` — `buildUpdateXml` (lines 114-122, the single source `build-update-xml.mjs` imports) + `parseUpdateXml` (125-150) + `siftResolverHosts` (anchored `Resolving host […]`) + `marDigest` (sha512+size). Phase 50 extends the hop drill; Phase 49 only ensures the build produces what it needs (MAR + manifest + descriptors).
- `scripts/generate.mjs` — `UPDATE_CHANNEL='default'` (1387), `updateChannel()` (1393-1396, `{channel, marChannelId: <basename>-<channel>}`), `releaseIdentity()` (2796-2808, `v${esrVersion}-${revision}`, `_BUILDn` refused), mozconfig emission (`MAR_CHANNEL_ID`/`ACCEPTED_MAR_CHANNEL_IDS`, 1483-1484), `MOZ_APPUPDATE_HOST` emission (1608). Tracked comparands: `.mozconfig:8-10` (`--enable-update-channel=default`, `MAR_CHANNEL_ID=powerbrowser-default`, `ACCEPTED_MAR_CHANNEL_IDS=powerbrowser-default`), `powerbrowser/packaging/version/version.txt` (`153.5.1`), `release.txt` (`v153.5.1-1`).
- `.github/settings/` — `environment-release.json`, `environment-descriptor.json` (+ `environment-branch-policy-main.json`), `actions-selected.json`, `actions-permissions.json` (`selected` + `sha_pinning_required: true`), `workflow-permissions.json` (`read`), `fork-pr-approval.json` (`all_external_contributors`), `ruleset-release-tags.json` (bot-only bypass), `app-powerbrowser-bot.json` (Contents/PRs/Issues write, Administration read, Dependabot-alerts read, **no Workflows**; repos `powerbrowser, powerbrowser-updates, homebrew-tap`). `repo-controls` reads all of them back; Phase 49 asserts them, re-declares nothing.

Key shapes (copy the posture, not the S5 text):

Dispatch validation (DIST-02 + TRAIN-10, first steps of `build-linux`, before any compile):

```yaml
on:
  workflow_dispatch:
    inputs:
      sha:
        description: "main commit to release"
        required: true
        type: string
```

```bash
# 1. SHA is main tip or a configuration.toml-changing ancestor, else exit 1
git fetch origin main --quiet
test "$(git rev-parse HEAD)" = "${{ inputs.sha }}" || git merge-base --is-ancestor "${{ inputs.sha }}" origin/main
git diff --name-only "${{ inputs.sha }}"^! | grep -qx 'configuration.toml' || test "${{ inputs.sha }}" = "$(git rev-parse origin/main)"
# 2. key strictly greater than latest Release tag, else exit 0 without building
KEY="$(node -p "require('./scripts/generate.mjs').releaseIdentity(require('./scripts/generate.mjs').resolveConfig('configuration.toml').config).releaseKey")"
LATEST="$(gh release view --repo DeBIOS-Foundation/powerbrowser --json tagName --jq .tagName 2>/dev/null || echo none)"
# compare as (major, minor, patch, revision) tuples; equal-or-lower exits 0
# 3. .github/workflows/ identical to main's (41-RESEARCH Pitfall 2), else exit 1
git diff --quiet "${{ inputs.sha }}" origin/main -- .github/workflows/ || test "${{ inputs.sha }}" = "$(git rev-parse origin/main)"
```

Relevant endpoints: `GET /repos/{owner}/{repo}/releases?per_page=1` (latest tag; `draft:false` check for TRAIN-10 PUBLISHED), `GET /repos/{owner}/{repo}/commits/{sha}` (existence), `GET /repos/{owner}/{repo}/actions/runs/{id}/pending_deployments` (train AWAITING_APPROVAL). All with `X-GitHub-Api-Version: 2022-11-28` (41-RESEARCH live baseline).

Pre-job hook (SEC-10, on legion, tracked script deployed by the NixOS change):

```bash
#!/usr/bin/env bash
# $ACTIONS_RUNNER_HOOK_JOB_STARTED target. Any non-zero exit fails the job before any step runs.
set -euo pipefail
test "${GITHUB_REPOSITORY:-}" = 'DeBIOS-Foundation/powerbrowser' || exit 1
test "${GITHUB_WORKFLOW_REF:-}" = 'DeBIOS-Foundation/powerbrowser/.github/workflows/release.yml@refs/heads/main' || exit 1
test "${GITHUB_EVENT_NAME:-}" = 'workflow_dispatch' || exit 1
```

NixOS wiring (owner action; verify option names against the pinned `nixos/modules/services/continuous-integration/github-runner/options.nix` — STACK cites `:61-200,392-412`):

```nix
services.github-runners.powerbrowser-release = {
  enable = true;
  url = "https://github.com/DeBIOS-Foundation/powerbrowser";
  tokenFile = "/var/lib/secrets/github-runner-registration";
  user = "pb-runner";
  workDir = "/var/lib/pb-runner";   # no space anywhere in the path (hard rule 4)
  replace = true;
  name = "legion";
  extraLabels = [ "powerbrowser-release" ];
  extraPackages = with pkgs; [ git gh nix podman ];
};
users.users.pb-runner.autoSubUidGidRange = true;  # rootless podman
# hook: ACTIONS_RUNNER_HOOK_JOB_STARTED=<tracked hook path> in the unit's environment
# (systemd.services.github-runner-powerbrowser-release.environment), plus
# runner user has no read access to ~/.config/powerbrowser-release (SEC-08).
```

Note: `runs-on` in `release.yml` is `[self-hosted, powerbrowser-release]` (the label the `workflows` `legion` rule keys on is the `powerbrowser-release` element; `self-hosted` is the default the runner also carries — a bare `self-hosted` elsewhere is red by design). Registration uses a one-time registration token (`tokenType` registration / `gh api -X POST repos/{o}/{r}/actions/runners/registration-token`), never a PAT, never an App key.

Channel gate (SEC-07, first steps of `sign-publish`, before `signmar -s`):

```bash
# read the MAR product-info channel and require it to equal the accepted id
MAR_CHANNEL="$(LD_LIBRARY_PATH=dist/bin dist/bin/signmar -T "$MAR" | sed -n 's/.*channel[^A-Za-z]*//p')"
# comparand below is derived from config.status / .mozconfig at check time, never typed:
test "$MAR_CHANNEL" = "$(grep -m1 ACCEPTED_MAR_CHANNEL_IDS objdir/config.status | tr -d ",'\" " | cut -d: -f2)"
# sign, then verify against the TRACKED der before any upload:
printf '%s' "$MAR_SIGNING_P12_B64" | base64 -d > "$RUNNER_TEMP/mar.p12"
printf '%s' "$MAR_SIGNING_P12_PASSWORD" > "$RUNNER_TEMP/pw"
pk12util -i "$RUNNER_TEMP/mar.p12" -d "sql:$RUNNER_TEMP/db" -k "$RUNNER_TEMP/pw" -w "$RUNNER_TEMP/pw"
dist/bin/signmar -d "$RUNNER_TEMP/db" -n powerbrowser-mar -s "$MAR" "$SIGNED"
V="$(mktemp -d)"; certutil -N -d "sql:$V" --empty-password
certutil -A -d "sql:$V" -n powerbrowser-mar -t ",," -i powerbrowser/packaging/mar/mar-primary.der
LD_LIBRARY_PATH=dist/bin dist/bin/signmar -d "$V" -n powerbrowser-mar -v "$SIGNED"
```

Precedent: `docs/BUILD.md` Key-custody rung + `verify-ng-065-mar-signature.mjs:52-91` (error codes `CERT_VERIFY_ERROR` / `MAR_CHANNEL_MISMATCH_ERROR` read from `upstream/toolkit/mozapps/update/common/updatererrors.h` at check time). Container supplies `signmar`; job installs `libnss3-tools` (`certutil`, `pk12util`) via apt. No Nix in the sign job (Out of Scope).

Asset-set equality + single publish (DIST-07, in `sign-publish` after attest, before publish):

```bash
# derive the expected set from this run's release-manifest.json + tracked notices/source names (set equality)
node scripts/derive-release-asset-set.mjs --manifest "$MANIFEST" > /tmp/want.txt   # or inline in the new row's lib
gh release view "$TAG" --repo DeBIOS-Foundation/powerbrowser --json assets --jq '.assets[].name' | sort > /tmp/draft.txt
diff -u /tmp/want.txt /tmp/draft.txt   # any delta fails the run before the single publish
gh release edit "$TAG" --repo DeBIOS-Foundation/powerbrowser --draft=false   # the single publish
```

Draft creation carries every asset in one call (`gh release create "$TAG" --draft <assets…>`); immutable releases forbid post-publish attach. Tag creation and publish both use the bot-App token minted **immediately before use** (`actions/create-github-app-token v3.3.0 64ab729a…`, `permission-contents: write`, revoked at job end — ARCHITECTURE §6). The sign job's first step exits when a newer Release already exists (stale-approval guard, PITFALLS Pitfall 8). Notes are derived (MFSA link, ESR, Theia/Node versions, `KNOWN-ISSUES` excerpt, en-US scope) — never `--generate-notes`, never `.github/release.yml` categories (Out of Scope).

R2 copy (DIST-08, in `sign-publish`, same env):

> Superseded by the 2026-10-29 owner ruling (49-CONTEXT.md, "Inherited constraint: update download host"): the R2 key is `<tag>/<asset>`, not `mar-fallback/`.

```bash
wrangler r2 object put "mar-fallback/$BUILD_TARGET/$TAG.mar" --file "$SIGNED" --remote
# token: R2 object-write, scoped to the MAR fallback bucket only, from the `release` env
# (INF-06). One RENEWALS row per token (DOC-04). The sweep holds no Cloudflare token.
```

Descriptor commit (DIST-09, in `descriptor` after `descriptor-monotonic`):

```bash
# App token scoped repositories: powerbrowser-updates (minted in this job, immediately before use)
# one update.xml per BUILD_TARGET at <channel>/<BUILD_TARGET>/update.xml, via the Contents API
# PUT /repos/{owner}/powerbrowser-updates/contents/{path}  {message, content(base64), branch: main, sha?}
# or a git push with the token as the credential — either is fine; the token scope is what matters.
node scripts/build-update-xml.mjs --emit --channel "$(node -p …MOZ_UPDATE_CHANNEL…)" --manifest "$MANIFEST"
```

Channel-live (UPD-17, `channel-live` job + sweep row; live half full-tier, self-test quick over mkdtemp + loopback):

- Inputs: `--manifest <release-manifest.json>` (baked `[AppUpdate]` URL, `[App]` Version/BuildID, `OS_TARGET`, `TARGET_XPCOM_ABI`, `MOZ_UPDATE_CHANNEL`, joined BUILD_TARGET, on-disk asset filenames). No objdir reads on the hosted runner.
- Per target: fetch `update.xml` through the baked 11-segment path (exercises `_redirects`); `parseUpdateXml`; `HEAD <patch URL>` Content-Length == descriptor `size`; `GET` MAR sha512 == `hashValue`; URL is `https` + `/releases/download/<tag>/` (latest-download form is red); `appVersion`/`buildID` vs `GET /releases/tags/v<key>`; offered version == latest Release tag's version.
- Self-test plants (S5 list, still correct): wrong `hashValue`, missing target file, 404 MAR, size mismatch, latest-download URL — each red naming target + value.

> Superseded by the 2026-10-29 owner ruling (49-CONTEXT.md, "Inherited constraint: update download host"): the `/releases/download/` form and the latest-download plant in the two bullets above are replaced by the MAR-origin form and the nine plants in plan 49-04 Task 2.

Toolchain baseline in container (AUTO-05):

```bash
# inside the release container, after bootstrap, before the build:
bash scripts/toolchain-baseline.sh > /tmp/got.txt; diff -u toolchain-baseline.txt /tmp/got.txt
# baseline pins: Mozilla clang, rust, cbindgen, jessie sysroot (glibc 2.19),
# container image digest (podman inspect --format '{{.Digest}}' pb-gecko-build)
```

Current `toolchain-baseline.sh` emits only `rustc/cargo/cbindgen` (flake shape). Phase 45 extends the emitter to the bootstrap tools + sysroot + digest; Phase 49 invokes it in `build-linux` and fails the build on drift. Never pin `MOZ_BUILD_DATE` (Pitfall 7 — same-ESR revisions would share a buildID and never be offered).

Cold fallback (INF-04, procedure recorded in `docs/BUILD.md`, measured not run by plans):

```bash
# ubuntu-latest, no actions/cache, no setup-node cache:, sccache off, no legion label
# container build cold (podman pull, no layer cache) → duration (date +%s around) + disk (df -h, du -sh objdir upstream)
```

`release-manifest.json` (Phase 45 produces; Phase 49 reads — fields frozen by S5 + RELEASING procedure half): `bakedUpdateUrl, version, buildID, osTarget, targetX Abi (TARGET_XPCOM_ABI), mozUpdateChannel, buildTarget (joined), assets {tarball, mar, applicationIni}, marChannelId, imageDigest`. Written out of the built tree, never literals — the reason the hosted jobs need no objdir.

## Recommended Project Structure

New tracked files (all staged before any brand scan):

```
.github/workflows/release.yml            # the pipeline (workflow_dispatch/sha only; 4 jobs above)
scripts/build-update-xml.mjs             # Phase 44 — imported, not re-planned here
scripts/verify-release-shape.mjs         # NEW quick: static release.yml shape BEYOND workflows
scripts/verify-hook-refusal.mjs          # NEW quick: hook script + its refusal table
scripts/verify-mar-channel-gate.mjs      # NEW quick: product-info vs ACCEPTED_MAR_CHANNEL_IDS
scripts/verify-release-asset-set.mjs     # NEW quick: draft set == manifest-derived set
scripts/verify-channel-live.mjs          # NEW full live + quick self-test (UPD-17)
scripts/verify-toolchain-container.mjs   # EXTENDS baseline: container-toolchain derivation (AUTO-05)
scripts/verify-platform.sh               # 5 appended row pairs (below), no sibling driver
powerbrowser/packaging/Containerfile     # Phase 45 — consumed, not re-planned here
docs/RELEASING.md                        # rewritten runner/procedure/asset/probe sections
docs/BUILD.md                            # INF-04 + artifact-size rows
inventory/brand-tokens.json              # untouched (only place the old name may appear)
```

Registry rows (labels proposed; planner may rename, but one row + self-test per behaviour, no duplication of `workflows`):

| Label | Tier | Derives from | Self-test plants (each red naming file/job/value) |
|---|---|---|---|
| `release-shape` | quick | `release.yml` + `configuration.toml` + `release-manifest.json` schema | `pull_request` trigger added; tag trigger added; `sha` input missing/not-required; legion job with `environment:`; legion job with `secrets.`; `retention-days` ≠ 1; `actions/cache` or `cache:` in path; key≤tag gate absent; SHA-ancestor gate absent |
| `hook-refusal` | quick | Tracked hook script + `release.yml` job ids | `GITHUB_WORKFLOW_REF` from another branch accepted; event `push` accepted; wrong repo accepted; SHA-step missing from a legion job |
| `mar-channel-gate` | quick | `.mozconfig` emission + fixture MAR product-info blocks | fixture MAR with foreign channel accepted; gate reading `--channel` as MAR id; `signmar -v` against non-tracked DER; sign-before-verify order swapped |
| `release-asset-set` | quick | `release-manifest.json` fixture + tree (notices, source-tarball rule, tag shape) | dropped asset; extra asset; stable-name drift; versioned-name drift; publish-before-equality step order swapped |
| `channel-live` / `channel-live-self-test` | full / quick | Manifest + live Release + Pages (live); mkdtemp manifest/tree/server (self-test) | wrong `hashValue`; missing target; 404 MAR; size mismatch; latest-download URL (S5's five, still the right five) |

> Superseded by the 2026-10-29 owner ruling (49-CONTEXT.md, "Inherited constraint: update download host"): the latest-download plant and the `/releases/download/` form in the `channel-live` row above are replaced by the nine plants in plan 49-04 Task 2.

`workflows` row: extend its `GOOD_RELEASE` fixture to the 4-job shape (add `descriptor` + `channel-live` jobs, `sha` input, `retention-days: 1`) rather than duplicating its parser. `repo-controls` row: unchanged (asserts SEC-11/GH-07/GH-08/App-sets; Phase 49 consumes its green). `descriptor-monotonic`, `packaged-launch`, `install-matrix`, `portable-elf`, `sidecar-no-symlinks`, `package-target-natives` rows: consumed from Phases 44/45, not re-declared.

`actions-selected.json` gains exactly the actions `release.yml` uses (all `actions/*` GitHub-owned + `attest-build-provenance`; `create-github-app-token` needs a `patterns_allowed` entry `actions/create-github-app-token@*` if used — added + applied + committed together, or the `uses-admitted`/`admission-used` set-equality goes red). `sha_pinning_required: true` stays; every `uses:` is a 40-hex SHA with the version in a trailing comment (resolved at authoring time via `gh api repos/<owner>/<action>/git/ref/tags/<tag>` — invent no SHA).

## Pitfalls

1. **Copying S5 verbatim.** S5 triggers on tags, registers an **ephemeral** runner with a PAT at `/var/lib/secrets/github-runner-pat`, signs-and-uploads in one `sign-upload` job that also commits descriptors with `--generate-notes`, and runs generate outside Nix. Every one of those is superseded: `workflow_dispatch`-only (decision 3), non-ephemeral + registration token + no PAT on legion (decision 2), `sign-publish` + separate `descriptor` + derived notes (decisions 11/12/13), generate inside `nix develop .#theia` (R1). Plans that copy S5 inherit four red `workflows` rules on arrival.
2. **Releasing from a stale SHA.** The bot without Workflows cannot create a Release whose target's `.github/workflows/` differs from `main`'s (41-RESEARCH Pitfall 2 — 403/404 on create-release). The SHA gate needs **both** halves: tip-or-`configuration.toml`-ancestor **and** workflows-identical-to-`main`. TRAIN-10's wording alone is insufficient.
3. **Stale approvals publishing old bytes.** Release N waits at `release` while N+1 arrives; approving N afterwards publishes the older build. Mitigations (all required): train cancels superseded pending deployments (TRAIN-04, Phase 51 wiring noted here), sign job exits when a newer Release exists, asset-set equality runs after attest and before the single publish, immutable releases make a bad publish permanent (fix = new revision, never delete/reuse the tag).
4. **Token lifetime vs build length.** App tokens expire after 1 h; the legion build runs ~47-54 min plus queue. Mint the bot token in `sign-publish`/`descriptor` **immediately before use**, never in `build-linux`, never across jobs (`create-github-app-token` revokes at job end — ARCHITECTURE §6). `build-linux` holds no token at all.
5. **Cache into release bytes.** No `actions/cache`, no `setup-node cache:`, no sccache-GHA backend anywhere in `release.yml`; legion sccache is local disk owned by the runner user; INF-04 runs cold with sccache off. The `no-cache` rule is the gate (Pitfall 5; TanStack precedent).
6. **MAR channel vs update channel conflation.** `default` (update channel, `%CHANNEL%` path segment, `--channel` to `build-update-xml.mjs`) vs `powerbrowser-default` (MAR channel id, `MAR_CHANNEL_ID`/`ACCEPTED_MAR_CHANNEL_IDS`, `--mar-channel-id` at MAR emit). The `update-channel` row already holds every consumer to both values; SEC-07's gate cross-checks `--channel` against `MOZ_UPDATE_CHANNEL` in `config.status` and fails naming both. A `--generate-notes` or latest-download URL anywhere is red.
7. **Rollback within one ESR.** The client accepts an older buildID at the same appVersion (`UpdateService.sys.mjs:1954-1962`; `archivereader.cpp:160-165` only refuses a *newer* installed appVersion). `descriptor-monotonic` (strictly greater buildID per appVersion, rollback only via owner-dispatched `--rollback-to`) + `channel-live` (offered version == latest Release) close it. Withdrawing by repointing at an older revision without the explicit input is the attack, not the fix.
8. **Hook-never-tested.** A hook that is installed but never exercised is decoration. The `hook-refusal` self-test plants a foreign-branch job and requires rejection **before any step runs**; the legion-rebuild runbook records the hook path so a NixOS change that drops it goes red in `update-channel`'s runner-unit-name control (the MAR-key-store/runner-unit names stay green fixtures there — do not re-assert them elsewhere).
9. **Artifact-cap arithmetic.** Tarball ~130 MB (129,529,524 bytes, 2026-10-17 listing) + complete MAR ~130 MB (Gecko-only MAR was 78,654,141 bytes; with sidecar+Node expect ~130 MB — PKG-21 measures) + source tarball + notices ≈ 260-300 MB per Linux release. One release with `retention-days: 1` + post-publish deletion fits any reading of the cap; three OS targets retained together do not. The mitigation (retention 1 + delete after `sign-publish` via `DELETE …/actions/artifacts/{id}`) is load-bearing, not hygiene.
10. **Waiting on the wrong clock.** The 1440-min `descriptor` wait is wait-timer semantics (max 43,200 min, unbilled, admin-bypassable — ARCHITECTURE §8), not queue semantics. The 24-h **queued-job** cancellation (Actions limits — DOC-03) binds jobs waiting for the runner, not deployments waiting for approval. Conflating them either panics about a timer that is working or sleeps through a runner outage. The sweep's runner-online row watches the runner; the train's supersede rule watches stale approvals.

## Open Questions (only what truly needs owner or network to settle)

1. **Artifact-cap live reading.** Docs say 500 MB storage for Free (limits page) while billing says Actions are free on public repos with caps described for private repos (STACK). The tree treats it as unmetered-but-measured. Settles with one number from the first real run: peak `GET …/actions/runs/{id}/artifacts` bytes + billing-storage readout, recorded in `docs/BUILD.md`. Mitigation (`retention-days: 1` + deletion) ships regardless.
2. **Pending-deployment timeout.** The 24-h queued-job cancellation is documented (limits page; `docs/RELEASING.md:909-910` must state it — DOC-03). How long a deployment waits on reviewer + wait timer before GitHub fails it is **not stated** on the environments page (PITFALLS still-open). Settles by observing the first `descriptor` wait (or a drill wait) and recording the behaviour in `docs/RELEASING.md`. Design does not depend on the answer: the train re-derives state every run and the sign job refuses stale approvals.
3. **github-runner version at registration time.** Runners with `--disableupdate` must be refreshed within 30 days of a new release or jobs queue forever (STACK, secondary source). nixpkgs lags upstream (2.336.0 locked vs 2.338.0 upstream 2026-10-06). Settles at registration: `nix eval` the locked `github-runner.version` vs `actions/runner` latest; override from nixpkgs-unstable if lagging, and let the sweep's runner-online + pin-age rows watch it thereafter. The non-ephemeral shape keeps auto-update on (unlike S5's ephemeral sketch) — record the choice in `docs/RELEASING.md`.
4. **R2 enablement.** Whether R2 needs a payment method on file even on the free tier (External Gates table). Owner probes at Phase 47; DIST-08 only consumes the token. If R2 is unavailable, the MAR stays Release-only and the withdraw-repoint-at-R2 branch of REL-02 is recorded as deferred — the pipeline still ships.
5. **jessie-built `signmar` on `ubuntu-latest`.** Designed (STACK) but unmeasured (SUMMARY A5/C flags). Settles on the first `sign-publish` dry path: `LD_LIBRARY_PATH=dist/bin dist/bin/signmar -v` against the tracked DER on `ubuntu-latest` (24.04, glibc 2.39). Fallback recorded in advance: Ubuntu `libnss3-tools` + container `certutil` parity, never Nix in the sign job.

Not open (settled in-tree, do not re-probe): runner-group restriction for a repo-scoped runner (41-RESEARCH Pitfall 3 — repo runners are in no group; the hook is the control); App-without-Workflows push refusal (41-RESEARCH, HIGH — GitHub docs); `FIREFOX_ESR153`-style detector keys (Phase 43 owns the detector); `_redirects` 11-segment rule (Phase 47 live probe owns it); Safe Browsing keyfile, Codeberg mirror, Apple/Azure gates (other phases own them).

## Assumptions about unfinished dependencies (recorded, not re-planned)

- **Phase 41 (3/4 plans executed, owner checkpoint pending).** Consumes: GH-07 five environments with branch policy `main` (`release` reviewer-only + `can_admins_bypass false`; `descriptor` reviewer + 1440 wait + bypass true); SEC-11 fork approval `all_external_contributors`; GH-08 `selected` + `sha_pinning_required` + zero repo secrets + read-only default token; GH-06 bot-only tag ruleset; GH-10 both Apps without Workflows (bot on `powerbrowser, powerbrowser-updates, homebrew-tap`); GH-12 `workflows` + AUTO-09 `zizmor` rows; GH-11 probe result recorded. Phase 49 asserts all of these via `repo-controls` + `workflows`; it re-declares nothing. If 41-04 changes a body, Phase 49's rows go red at execute time by design.
- **Phase 44 (not yet planned).** Consumes: `scripts/build-update-xml.mjs` (imports `buildUpdateXml`, one descriptor per BUILD_TARGET with `detailsURL`, idempotent), full-tier `descriptor-monotonic` (offered buildID strictly greater per appVersion, `--rollback-to` the only backward path), secondary-key ceremony record (patch 030 carries primary + secondary DER; `ng065` accepts secondary-only). The `descriptor` job calls both; the `channel-live` row assumes their green.
- **Phase 45 (not yet planned).** Consumes: Debian-bookworm podman container with `--enable-bootstrap` producing the Linux tar.xz + complete MAR + container-built `signmar`; `release-manifest.json` with the frozen field set above; `portable-elf` / `sidecar-no-symlinks` / `package-target-natives` rows green; `packaged-launch` + install-matrix rows passing on the container tarball; MAR-size measurement (PKG-21) feeding the cap arithmetic and /download. `build-linux` invokes that build and those rows; it re-derives none of them.
- **Phase 47 (not yet planned).** Consumes: `powerbrowser-updates` repo + Pages project at `updates.powerbrowser.org` with the `_redirects` 10-placeholder 200 rule (or recorded `_worker.js` fallback) probed live with escaped `OS_VERSION`/`SYSTEM_CAPABILITIES` segments; `updates-repo-static` row (no `functions/`, no `_worker.js`); Cloudflare account + 2FA + R2 enablement; INF-06 token holder map + RENEWALS rows. The `descriptor` commit target and DIST-08 copy target assume both exist.

Each assumption is flagged in the owning plan's must_haves as an assumption, so drift surfaces at execute time rather than silently.

## RESEARCH COMPLETE
