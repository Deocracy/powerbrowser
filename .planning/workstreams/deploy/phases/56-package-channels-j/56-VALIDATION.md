---
phase: "56"
slug: "package-channels-j"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-23"
---

# Phase 56 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `scripts/verify-platform.sh` registry rows; each script carries its own `--self-test` |
| **Config file** | none — rows are appended to the CHECKS array (quick rows after `zizmor-self-test`, full rows after `repo-controls`) |
| **Quick run command** | `scripts/verify-platform.sh --only <label>` (`flake-repack`, `policies-update-split`, `binary-cache`, `flathub-manifest`, `winget-manifest`, `homebrew-cask`, `channel-release-jobs`, and their self-tests) |
| **Full suite command** | `scripts/verify-platform.sh --quick`; live listings + substitute proof at the owner checkpoint |
| **Estimated runtime** | ~70 seconds (`--quick`); new rows are static file reads, in-memory plants |

---

## Sampling Rate

- **After every task commit:** `scripts/verify-platform.sh --quick` after `git add` of new files (the brand scan reads `git ls-files`)
- **After every plan wave:** `--quick` plus each new row's `--self-test`
- **Before `/gsd-verify-work`:** `--quick` green, owner checkpoint done, then the live listing evidence pasted in the SUMMARY
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 56-01-01 | 01 | 1 | PKG-19 | T-56-01, T-56-02 | flake URL/hash derive from the release key + asset; nodejs_24; overlay; repack-only DisableAppUpdate | static, quick | `--only flake-repack` / `--only flake-repack-self-test` | ❌ `nix/pkg/powerbrowser-bin.nix`, `flake.nix` ext | ⬜ pending |
| 56-01-02 | 01 | 1 | PKG-19, PKG-20 | T-56-02 | tarball policies.json clean; both repacks carry the key; siblings byte-identical | static, quick | `--only policies-update-split` / `--only policies-update-split-self-test` | ❌ new `scripts/verify-policies-update-split.mjs` | ⬜ pending |
| 56-02-01 | 02 | 2 | INF-05 | T-56-03 | substituters + keys derive from one cache config; both backends share the interface; RENEWALS row present | static, quick | `--only binary-cache` / `--only binary-cache-self-test` | ❌ new `scripts/verify-binary-cache.mjs`, `nix/cache.json` | ⬜ pending |
| 56-02-02 | 02 | 2 | PKG-20 | T-56-04 | BaseApp ref, persist, Flatpak-only disable key, x-checker-data, TXT value derived | static, quick | `--only flathub-manifest` / `--only flathub-manifest-self-test` | ❌ new `scripts/verify-flathub-manifest.mjs`, `flatpak/*.json` | ⬜ pending |
| 56-03-01 | 03 | 3 | DIST-04 | T-56-05 | winget identifier, versioned URL, sha derivation, PAT-custody record | static, quick | `--only winget-manifest` / `--only winget-manifest-self-test` | ❌ new `scripts/verify-winget-manifest.mjs`, `winget/` manifests | ⬜ pending |
| 56-03-02 | 03 | 3 | DIST-11 | T-56-06 | cask token, version/sha derivation, auto_updates true, verified host, livecheck, darwin deferral | static, quick | `--only homebrew-cask` / `--only homebrew-cask-self-test` | ❌ new `scripts/verify-homebrew-cask.mjs`, `homebrew-tap/` cask | ⬜ pending |
| 56-04-01 | 04 | 4 | DIST-12 | T-56-07, T-56-08 | bot-PR hash payload, tap commit, wingetcreate shape, checker freshness, no direct commit | static, quick | `--only channel-release-jobs` / `--only channel-release-jobs-self-test` | ❌ new `scripts/verify-channel-release-jobs.mjs`, train stage | ⬜ pending |
| 56-05-01 | 05 | 5 | PKG-19, INF-05, PKG-20, DIST-04, DIST-11, DIST-12 | T-56-09 | owner submits listings, proves substitute, pastes verbatim evidence; no executor live write | manual (owner) | none: blocking-human checkpoint, fielded reply | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky* — task IDs are filled in once plans exist.

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements (the registry and self-test conventions exist; the new scripts and payloads are the deliverables).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cachix licence reply; R2 enablement if refused | INF-05 | account + possible payment method | Owner sends the licence email, records the reply; enables R2 with the fallback config if refused |
| Flathub exception reply; submission PR under owner identity | PKG-20 | account + written exception | Owner requests the exception, records the reply; opens the submission PR from the owner account |
| winget PR from the fork + WINGET_TOKEN custody | DIST-04, DIST-12 | PAT on a fork-owning account | Owner forks winget-pkgs, runs wingetcreate, opens the PR, stores the PAT as `WINGET_TOKEN` in `release` |
| Tap repo creation; bot App commit; DNS TXT | DIST-11, DIST-12, PKG-20 | repos + Apps + DNS (Phase 41/47 steps) | Owner creates the tap repo, installs the bot App, commits the tap update path, sets the TXT record |
| Clean-machine `nix build` substitutes from the cache | INF-05 | live token + network | Owner runs the build on a clean machine with the live config and pastes the substitute log |
| /download Nix + Flatpak rows | PKG-19, PKG-20 | site lives outside this tree | Owner pastes the two row texts into the Phase 47 site; rows asserted present by pasted URL fetch |
| Notarized cask + aarch64-darwin enablement | DIST-11, PKG-19 | Phase 55 notarization | Deferred: recorded as the darwin row naming assumption A3 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
