---
phase: "49"
slug: "release-pipeline-and-legion-runner-e"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-23"
---

# Phase 49 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `scripts/verify-platform.sh` CHECKS registry; each new script carries its own `--self-test` (node built-ins, bash) |
| **Config file** | none — rows are the `CHECKS=(` array in `scripts/verify-platform.sh` |
| **Quick run command** | `scripts/verify-platform.sh --only <label>` (`release-shape`, `hook-refusal`, `mar-channel-gate`, `release-asset-set` + `-self-test` siblings) |
| **Full suite command** | `scripts/verify-platform.sh --quick`; after the owner checkpoint, `scripts/verify-platform.sh --only channel-live` + `--only repo-controls` |
| **Single-row command** | `scripts/verify-platform.sh --only <label>` |
| **Estimated runtime** | ~70 seconds (`--quick`); `channel-live` a few seconds of live Release + Pages reads |

---

## Sampling Rate

- **After every task commit:** `scripts/verify-platform.sh --quick` after `git add` of new files (the brand scan reads `git ls-files`)
- **After every plan wave:** `--quick` plus each new row's `--self-test`
- **Before `/gsd-verify-work`:** `--quick` green, owner checkpoint done, then `--only channel-live` green
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 49-01-T1 | 01 | 1 | DIST-02 | T-49-01, T-49-02 | `release.yml` exists with `workflow_dispatch`/sha only; build-linux on legion, no env, no secrets, exit-0-without-build gate present | quick + self-test | `scripts/verify-platform.sh --only release-shape && scripts/verify-platform.sh --only release-shape-self-test` | ❌ W0 new `scripts/verify-release-shape.mjs` + `.github/workflows/release.yml` skeleton | ⬜ pending |
| 49-01-T2 | 01 | 1 | DIST-02 | T-49-01 | Trust boundary holds: `workflows` row green on the extended tree; GOOD_RELEASE fixture extended to the 4-job shape | quick | `scripts/verify-platform.sh --only workflows && scripts/verify-platform.sh --only workflows-self-test` | ✅ (extend fixture) | ⬜ pending |
| 49-02-T1 | 02 | 2 | SEC-10 | T-49-03, T-49-04 | Pre-job hook refuses a foreign-branch job before any step; every legion job carries the SHA check first | quick + self-test | `scripts/verify-platform.sh --only hook-refusal && scripts/verify-platform.sh --only hook-refusal-self-test` | ❌ W0 new hook script + `scripts/verify-hook-refusal.mjs` | ⬜ pending |
| 49-02-T2 | 02 | 2 | SEC-08 | T-49-05 | Runner shape declared non-ephemeral with registration token, own user, spaceless work dir; labels only in `build-*` | quick + docs grep | `scripts/verify-platform.sh --only release-shape && grep -q 'non-ephemeral' docs/RELEASING.md` | ✅ (docs rewrite) | ⬜ pending |
| 49-03-T1 | 03 | 3 | SEC-07 | T-49-06 | MAR product-info channel equals `ACCEPTED_MAR_CHANNEL_IDS` before `signmar -s`; signed output verifies with `signmar -v` against the tracked DER | quick + self-test | `scripts/verify-platform.sh --only mar-channel-gate && scripts/verify-platform.sh --only mar-channel-gate-self-test` | ❌ W0 new `scripts/verify-mar-channel-gate.mjs` | ⬜ pending |
| 49-03-T2 | 03 | 3 | DIST-07 | T-49-07, T-49-08 | Draft asset set equals manifest-derived set before the single publish; tag `v<ESR>-<revision>` by the bot App; write trio only on `sign-publish` | quick + self-test | `scripts/verify-platform.sh --only release-asset-set && scripts/verify-platform.sh --only release-asset-set-self-test` | ❌ W0 new `scripts/verify-release-asset-set.mjs` | ⬜ pending |
| 49-04-T1 | 04 | 4 | DIST-09 | T-49-09 | `descriptor` commits one `update.xml` per BUILD_TARGET after `descriptor-monotonic`, with the scoped App token | quick (static) | `scripts/verify-platform.sh --only release-shape && grep -q 'powerbrowser-updates' .github/workflows/release.yml` | ✅ (workflow text) | ⬜ pending |
| 49-04-T2 | 04 | 4 | UPD-17 | T-49-10 | Public descriptor byte-equals repo copy, MAR URLs HEAD 200, offered version equals latest Release | full (network) + quick self-test | `scripts/verify-platform.sh --only channel-live` (live) and `scripts/verify-platform.sh --only channel-live-self-test` (mkdtemp) | ❌ W0 new `scripts/verify-channel-live.mjs` | ⬜ pending |
| 49-05-T1 | 05 | 5 | DIST-08 | T-49-11 | MAR copied to R2 with the token from `release` env only; no Cloudflare token in the sweep | static quick + grep | `! grep -rn 'CLOUDFLARE_' .github/workflows/release.yml; grep -q 'wrangler r2 object put' .github/workflows/release.yml` | ✅ (workflow text) | ⬜ pending |
| 49-05-T2 | 05 | 5 | AUTO-05 | T-49-12 | Container bootstrap toolchain pinned; drift fails the build | quick (static) + in-container diff at build | `node scripts/verify-toolchain-container.mjs 2>/dev/null \|\| scripts/verify-platform.sh --only toolchain-container` + `diff <(nix develop .#firefox --command bash scripts/toolchain-baseline.sh) toolchain-baseline.txt` | ❌ W0 new/extended row | ⬜ pending |
| 49-05-T3 | 05 | 5 | INF-04 | — | Cold hosted fallback procedure + artifact-size measurement recorded in `docs/BUILD.md` | docs grep (measured at first run) | `grep -q 'INF-04' docs/BUILD.md && grep -q '500 MB' docs/BUILD.md` | ✅ (docs rows) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky* — task IDs, plans and waves are filled in once plans exist.

---

## Wave 0 Requirements

- [ ] `scripts/verify-release-shape.mjs` — DIST-02 (`release.yml` dispatch validation, legion placement, exit-without-build gate)
- [ ] `scripts/verify-hook-refusal.mjs` + tracked pre-job hook script — SEC-10
- [ ] `scripts/verify-mar-channel-gate.mjs` — SEC-07
- [ ] `scripts/verify-release-asset-set.mjs` — DIST-07
- [ ] `scripts/verify-channel-live.mjs` — UPD-17 (full live + quick mkdtemp self-test)
- [ ] `scripts/verify-toolchain-container.mjs` (or AUTO-05 extension row) — AUTO-05
- [ ] `docs/RELEASING.md` runner-shape rewrite + `docs/BUILD.md` INF-04/artifact rows — SEC-08, DIST-08, INF-04

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Runner registered after SEC-11/SEC-10/GH-07; one-time token; `nrs` applied | SEC-08, SEC-10 | Owner action on legion + live GitHub registration | 49-02 checkpoint block (owner `pkexec … nrs`, one-time `gh api -X POST repos/{o}/{r}/actions/runners/registration-token`), then `scripts/verify-platform.sh --only repo-controls` |
| R2 enabled (payment if asked); token holder map | DIST-08 | Cloudflare dashboard, owner account | 49-05 checkpoint: owner enables R2, stores object-write token as `release` secret only, records holder + RENEWALS row |
| First real `release.yml` dispatch green; per-release `release` + `descriptor` approvals | DIST-02, DIST-09 | Owner dispatch + approvals on GitHub | Owner dispatches with SHA, approves `release` after reviewing asset list + descriptor diff, approves `descriptor` after own N-1→N hop; train observes BUILDING→DONE |
| Cold hosted fallback measured | INF-04 | Needs a real hosted run | First execution records duration + disk in `docs/BUILD.md`; plans leave the steps and values pending |

*If none beyond the table: "All phase behaviors have automated verification." — not the case here; the four rows above are the owner/network boundary.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
