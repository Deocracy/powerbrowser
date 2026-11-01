---
phase: "45"
slug: "portable-linux-release-build-c"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-22"
---

# Phase 45 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Derived from 45-RESEARCH.md "## Validation Architecture" (existence-verified this session via grep).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `scripts/verify-platform.sh` registry plus per-script `--self-test` (node built-ins, bash) |
| **Config file** | none — rows are the `CHECKS=(` array in `scripts/verify-platform.sh` |
| **Quick run command** | `scripts/verify-platform.sh --only <label>` (and `<label>-self-test`) |
| **Full suite command** | `scripts/verify-platform.sh --quick` |
| **Estimated runtime** | ~60 seconds (`--quick`; full rows need the built tree, a stage/tarball, a launch, or the network) |

---

## Sampling Rate

- **After every task commit:** `scripts/verify-platform.sh --only <new label>` and its `-self-test`; `node scripts/scan-brand-residue.mjs` after `git add`
- **After every plan wave:** `scripts/verify-platform.sh --quick`
- **Before `/gsd-verify-work`:** `--quick` green, plus every runnable full row against the container-built tarball
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD by planner | 01+ | 1 | PKG-06 | — | Theia state file lives under the ProfD profile path, not under `XDG_CONFIG_HOME`/`HOME` | full (launch) + static | launch two profiles, state-file paths differ and sit under ProfD; `ng063` XDG isolation re-pointed | ✅ (extend) | ⬜ pending |
| TBD by planner | 01+ | 1 | PKG-17 | — | Containerfile derived from `upstream/taskcluster/docker/debian-build/Dockerfile`; bootstrap emits clang/rust/cbindgen + jessie sysroot; release `.mozconfig` variant from the generator (no Nix-only lines, `--enable-bootstrap`) | quick (derivation) | `scripts/verify-platform.sh --only generated-byte-identity` | ❌ created in task | ⬜ pending |
| TBD by planner | 02+ | 2 | PKG-22 | — | No `/nix/store` INTERP/RUNPATH in any tarball ELF incl. natives; max GLIBC ≤ declared floor 2.28 (portability-floor.json, owner ruling 2026-10-22); measured sysroot glibc (2.19) ≤ floor | full (tarball tree) + self-test | `scripts/verify-platform.sh --only portable-elf && scripts/verify-platform.sh --only portable-elf-self-test` | ❌ created in task | ⬜ pending |
| TBD by planner | 02+ | 2 | PKG-23 | — | Every `.node`/`rg`/`node` in a staged package matches the package's target (ELF x86-64) | full (staged tree) + self-test | `scripts/verify-platform.sh --only package-target-natives && scripts/verify-platform.sh --only package-target-natives-self-test` | ❌ created in task | ⬜ pending |
| TBD by planner | 02+ | 2 | PKG-18 | — | `find <stage> -type l` is empty | full (staged tree) + self-test | `scripts/verify-platform.sh --only sidecar-no-symlinks && scripts/verify-platform.sh --only sidecar-no-symlinks-self-test` | ❌ created in task | ⬜ pending |
| TBD by planner | 03+ | 3 | PKG-04 | — | Container tarball reaches a ready workbench; backend entry + exe inside prefix; node == pin, no `/nix/store` bytes | full (launch) | `scripts/verify-platform.sh --only ng063-packaged-launch` (container tarball) | ✅ (extend) | ⬜ pending |
| TBD by planner | 03+ | 3 | PKG-04/PKG-05 | — | Staged `application.ini` + `theia/package.json` branding == release-variant derivation; About dialog carries release legal notices | full (tarball; derivation static) | new `packaged-identity` row `--only packaged-identity` (+ `-self-test` plant: dev suffix in staged notice) | ❌ created in task | ⬜ pending |
| TBD by planner | 03+ | 3 | PKG-07 | — | A URL on the command line opens in the stock browser window | full (launch w/ URL arg) | container tarball launch with URL; `check-internals-boundary.sh` green with the new touchpoint catalogued in `INTERNAL-APIS.md` | ✅ (new catalogue rows) | ⬜ pending |
| TBD by planner | 04+ | 4 | UPD-29 | — | Lists update over `safebrowsing.googleapis.com` (200s) with refreshed classifiers; keyfile path outside the repo; `RENEWALS.md` row present | full + network (live check) | live list-update transaction + `docs/RENEWALS.md` row read | ✅ `docs/RENEWALS.md` (extend) | ⬜ pending |
| TBD by planner | 04+ | 4 | PKG-21 | — | Complete MAR `wc -c` recorded with producing tree/host/toolchain attribution; partial-MAR decision recorded (complete-only unless too large) | full (MAR output) | `make_full_update.sh` output measured | — (decision text) | ⬜ pending |
| TBD by planner | all | all | all | — | `generated-byte-identity`, `release-identity`, `update-channel`, brand scan, `check-patch-surface`, `diff-theia-core.sh`, `check-internals-boundary.sh` stay green | quick | `scripts/verify-platform.sh --quick` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky* — task IDs are filled in once plans exist; the planner binds each row to its tasks.

---

## Wave 0 Requirements

- [ ] `scripts/verify-portable-elf.mjs` (or sibling) — PKG-22 row + `--self-test` (Nix RUNPATH + newer-GLIBC plants)
- [ ] `scripts/verify-sidecar-no-symlinks.mjs` (or inline row) — PKG-18 row + `--self-test` (planted symlink)
- [ ] `scripts/verify-package-target-natives.mjs` (or sibling) — PKG-23 row + `--self-test` (Linux `.node` in Windows fixture)
- [ ] `scripts/verify-packaged-identity.mjs` (or sibling) — PKG-04/05 derivation-vs-staged row + `--self-test`
- [ ] `powerbrowser/packaging/Containerfile` — PKG-17 (new file; author from the upstream `debian-build` package list)
- [ ] release `.mozconfig` variant via the generator (new TARGETS row, `generated-byte-identity` green)

*If none beyond these: "Existing infrastructure (`ng063`, `generate.mjs`, `package-linux.sh`, registry) covers the rest."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Container bootstrap build on legion (owner/local run): tar.xz + complete MAR produced | PKG-17 | Owner gate: no podman/tier-3 build runs in planning or unattended execution | Plans end with the exact `podman build` / `mach build` / `package-linux.sh` / `make_full_update.sh` commands; executor or owner runs them and records versions, sizes, host |
| Theia About dialog shows the release-variant legal notices on the container-built tarball | PKG-05 | Needs the rebuilt tarball plus a display | Launch the container-built tarball, open the About dialog, compare each notice with the release-variant derivation |
| Safe Browsing lists visibly update on the release build | UPD-29 | Needs the keyfile + network on the release build | Trigger a list update, observe `safebrowsing.googleapis.com` 200s and refreshed classifier files |
| Partial-MAR decision recorded | PKG-21 | Judgment over the measured size | Record complete-MARs-only unless the measurement shows complete MARs are too large for a two-week cadence |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
