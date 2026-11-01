---
phase: "54"
slug: "windows-h"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-23"
---

# Phase 54 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `scripts/verify-platform.sh` registry rows; each script carries its own `--self-test` |
| **Config file** | none — rows are appended to the CHECKS arrays (quick rows in the `--quick` array, full rows inside `if [ "$QUICK" -eq 0 ]`) |
| **Quick run command** | `scripts/verify-platform.sh --only <label>` (`windows-mozconfig`, `node-runtime-targets`, trademark/NSIS rows, and their self-tests) |
| **Full suite command** | `scripts/verify-platform.sh --quick`; after the owner checkpoint, `scripts/verify-platform.sh --only win-matrix-record` etc. |
| **Estimated runtime** | ~70 seconds (`--quick`); matrix/sign rows need the built package and the live guest (full tier) |

---

## Sampling Rate

- **After every task commit:** `scripts/verify-platform.sh --quick` after `git add` of new files (the brand scan reads `git ls-files`)
- **After every plan wave:** `--quick` plus each new row's `--self-test`
- **Before `/gsd-verify-work`:** `--quick` green, owner checkpoint done, then the full-tier Windows rows green on their fixtures/guest
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 54-01-01 | 01 | 1 | PKG-11 | T-54-01, T-54-02 | per-target Windows mozconfig derives from the generator with `--disable-maintenance-service`, no literals; re-emission byte-identical | quick + self-test | `scripts/verify-platform.sh --only windows-mozconfig && scripts/verify-platform.sh --only windows-mozconfig-self-test && node scripts/generate.mjs --check` | ❌ new `scripts/verify-windows-mozconfig.mjs` | ⬜ pending |
| 54-01-02 | 01 | 1 | PKG-13 | T-54-03 | `node-runtime.json` target set equals the expected per-target set; Windows entry carries SHASUMS pin; set-equality both directions | quick + self-test | `scripts/verify-platform.sh --only node-runtime-targets && scripts/verify-platform.sh --only node-runtime-targets-self-test` | ❌ new script or detector fold-in | ⬜ pending |
| 54-01-03 | 01 | 1 | PKG-10 | T-54-04 | `build-windows` job shape (legion-only, no secrets/environment, SHA-pinned admitted `uses:`, no `schedule:`, repackage + artifact handoff) derived from `release.yml` at check time; static determinism | quick + self-test | `scripts/verify-platform.sh --only build-windows-shape && scripts/verify-platform.sh --only build-windows-shape-self-test && scripts/verify-platform.sh --only workflows` | ❌ new `scripts/verify-build-windows-shape.mjs` or widened `workflows` row | ⬜ pending |
| 54-02-01 | 02 | 2 | PKG-12 | T-54-05, T-54-06 | regenerated 040 patch carries uninstall-ping removal, fork registry namespace, fork artwork; hand edit red | quick + full (regen) | `scripts/verify-platform.sh --only patches-regenerated && scripts/verify-platform.sh --only installer-build-proof` | ✅ `patches/040-powerbrowser-nsis.patch` (extend by regeneration) | ⬜ pending |
| 54-02-02 | 02 | 2 | LEG-01 | T-54-07 | NSIS/application.ini/Info.plist/MOZ_LAUNCHER_SUBKEY surfaces carry no Mozilla mark; each planted mark red naming surface; set-equality both directions; empty surface FAILs | quick + self-test | `scripts/verify-platform.sh --only trademark-nsis && scripts/verify-platform.sh --only trademark-nsis-self-test` | ✅ `scripts/verify-trademark-surface.mjs` (extend) | ⬜ pending |
| 54-02-03 | 02 | 2 | PKG-13 | T-54-08 | every `.node`/`rg`/`node` in the Windows package matches the package target (PE32+); a Linux `.node` plant red | self-test + full | `scripts/verify-platform.sh --only package-target-natives-self-test` then `--only package-target-natives` | ❌ new `scripts/verify-package-natives.mjs` | ⬜ pending |
| 54-03-01 | 03 | 3 | UPD-30 | T-54-08, T-54-09 | sidecar reap awaited on quit/restart before the updater rename; version flips with sidecar running, no `tobedeleted` residue | static quick + full matrix cell | static `sidecar-reap-blocker` row + `--only sidecar-reap-blocker-self-test`; matrix update cell | ❌ new shell code + row | ⬜ pending |
| 54-03-02 | 03 | 3 | UPD-31 | T-54-10 | background-task path verified live (task entry + `backgroundupdate.moz_log` + staged apply while closed) or deferred with the recorded REASON | full matrix cell or recorded deferral | `--only win-matrix-record` background cell or tracked deferral row | ✅ upstream `BackgroundUpdate` (verify, do not reimplement) | ⬜ pending |
| 54-03-03 | 03 | 3 | MTX-01 | T-54-11, T-54-12 | five matrix cells each carry verdict + verbatim evidence; BUILD_TARGET parses; registry diff names fork root, `Software\Mozilla` untouched | full | `scripts/verify-platform.sh --only win-matrix-record` (+ `--self-test` on fixtures) | ❌ new `scripts/verify-win-matrix-record.mjs` + harness | ⬜ pending |
| 54-04-01 | 04 | 4 | SEC-03, DIST-10 | T-54-13, T-54-14 | unsigned-first copy identical across matrix record, tracked doc, live /download source; Windows descriptor pair per BUILD_TARGET | full | `scripts/verify-platform.sh --only win-download-copy` + descriptor rows | ✅ `docs/RELEASING.md`, /download source (edit) | ⬜ pending |
| 54-04-02 | 04 | 4 | SEC-12, DIST-10 | T-54-15, T-54-16 | jsign inner → repackage → jsign setup → MAR → signmar order evidenced; Azure OIDC, no stored secret; /download flips status | full | `scripts/verify-platform.sh --only win-sign-chain` (+ `--self-test` on order fixtures) | ❌ per-OS sign job + row | ⬜ pending |
| 54-04-03 | 04 | 4 | GH-02..GH-12, FIX-11 | T-54-17 | every owner-side action behind one `checkpoint:human-action`; no live write from an executor; Azure/`nrs`/licence/dispatch commands exact | manual (owner) | none: blocking-human checkpoint, fielded reply | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky* — task IDs are filled in once plans exist.

---

## Wave 0 Requirements

Existing infrastructure covers the conventions (the registry and self-test contracts exist; derivation/set-equality/fail-closed patterns are proven in Phase 40/41 rows). The deliverables are the new rows:

- [ ] `scripts/verify-windows-mozconfig.mjs` — PKG-11 per-target Windows mozconfig
- [ ] `scripts/verify-build-windows-shape.mjs` (or a widened `verify-workflows.mjs`) — PKG-10 `build-windows` static shape
- [ ] `scripts/verify-node-runtime-targets.mjs` (or Phase 43 detector fold-in) — PKG-13 target set
- [ ] `scripts/verify-package-natives.mjs` — PKG-13 / PKG-23-shape PE assertion
- [ ] `scripts/verify-sidecar-reap-blocker.mjs` (static half) — UPD-30 blocker presence
- [ ] `scripts/verify-win-matrix-record.mjs` — MTX-01 five-cell record
- [ ] `scripts/verify-win-download-copy.mjs` — SEC-03 verbatim copy
- [ ] `scripts/verify-win-sign-chain.mjs` — SEC-12 order evidence
- [ ] Extended `scripts/verify-trademark-surface.mjs` — LEG-01 surfaces + plants
- [ ] Extended `patches/040-powerbrowser-nsis.patch` by regeneration — PKG-12
- [ ] Extended `scripts/verify-mar-update-hop.mjs` builder — DIST-10 Windows descriptors (Phase 44 shape)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Azure Artifact Signing account + identity validation | SEC-12 | account creation + 1–20 business-day validation, billed from creation; no API | Owner creates the account 3–4 weeks before the matrix is ready; records the validation date in `docs/RELEASING.md` |
| legion `/etc/nixos` libvirt access for the runner user | MTX-01 | root on legion, finished with `nrs` under `pkexec` | Owner adds the runner user to libvirt access per the plan's exact block; records the `nrs` run |
| Windows VM licence + Windows Update handling | MTX-01 | media + licence custody | Owner provisions `pkg-win11` per the plan; records media hash and update-freeze method |
| Live matrix run (install/launch/update/uninstall/no-residue) | MTX-01, UPD-30, UPD-31 | guest interaction + verbatim dialog capture | Owner runs the five cells from `clean-baseline` and pastes verbatim evidence into the record |
| Live `release.yml` dispatch + `release`/`descriptor` approvals | DIST-10, SEC-12 | approvals are the only point signing keys are used | Owner dispatches and approves; records run links and descriptor commit |
| SmartScreen wording on the live page | SEC-03 | rendered page capture | Owner opens /download, captures the warning block verbatim; `win-download-copy` compares |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
