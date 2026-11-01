---
phase: "55"
slug: "macos-i"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-23"
---

# Phase 55 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `scripts/verify-platform.sh` registry rows; each script carries its own `--self-test` |
| **Config file** | none — quick rows appended to the `CHECKS` array before `if [ "$QUICK" -eq 0 ]`, full rows inside it |
| **Quick run command** | `scripts/verify-platform.sh --only <label>` (`mac-entitlements`, `macos-package-payload-self-test`, `macos-download-copy`, `macos-install-matrix-self-test`, and their twins) |
| **Full suite command** | `scripts/verify-platform.sh --quick`, then `--only macos-package-payload`, `--only macos-install-matrix`, `--only macos-download-copy` |
| **Estimated runtime** | ~90 seconds (`--quick`); full-tier rows need the built universal tree plus evidence dir |

---

## Sampling Rate

- **After every task commit:** `scripts/verify-platform.sh --quick` after `git add` of new files (the brand scan reads `git ls-files`)
- **After every plan wave:** `--quick` plus each new row's `--self-test`
- **Before the owner checkpoint:** `--quick` green, SEC-13 memo complete, payload self-test green, record gates green on plants
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 55-01-01 | 01 | 1 | SEC-13, PKG-24 | T-55-01, T-55-02, T-55-03 | SEC-13 memo with sources plus dates; entitlements gate plus self-test; one TARGETS row byte-identical | static quick + in-memory self-test | `--only mac-entitlements` / `--only mac-entitlements-self-test`; `generate.mjs --check` | ❌ new `scripts/verify-mac-entitlements.mjs`, `powerbrowser/packaging/mozconfig-macos-aarch64` | ⬜ pending |
| 55-01-02 | 01 | 1 | PKG-24 | T-55-01 | Both entitlement sets derived at check time; set equality both ways; added plus removed file red | static, quick | `--only mac-entitlements-self-test` | ❌ same file | ⬜ pending |
| 55-01-03 | 01 | 1 | SEC-13 | T-55-02 | Memo complete with owner-read sections explicit; RELEASING.md points at it; generator plus brand plus upstream-clean | static quick | `--only generated-byte-identity`; `scan-brand-residue.mjs`; `git -C upstream diff --quiet` | ✅ `docs/RELEASING.md` | ⬜ pending |
| 55-02-01 | 02 | 2 | PKG-14 | T-55-04 | Both mozconfigs from one shared tail; forbidden spellings asserted absent; comparands byte-identical | static quick | `generate.mjs --check`; `--only generated-byte-identity` | ❌ `powerbrowser/packaging/mozconfig-macos-x86_64` | ⬜ pending |
| 55-02-02 | 02 | 2 | PKG-14, PKG-15 | T-55-05 | firefox-macos shell evaluable; darwin pins hash-enforced via runnable node-runtime.json assertion; package-macos.sh via bash -n; no Linux native under darwin name | static quick | `nix flake check`; runnable pin assertion (darwin-arm64/darwin-x64 version + nodejs.org URL + 64-hex sha256); `bash -n package-macos.sh`; `--quick` | ❌ `flake.nix` shell, `package-macos.sh`, `node-runtime.json` pins | ⬜ pending |
| 55-02-03 | 02 | 2 | PKG-14 | T-55-06 | Five branding inputs emitted per variant; placeholders honest; icon structure green; no brand input | static quick | `--only icon-ihdr`; `--only generated-byte-identity` | ❌ `scripts/generate.mjs` emitters | ⬜ pending |
| 55-03-01 | 03 | 3 | PKG-14, PKG-15 | T-55-07, T-55-08 | Payload gate plus quick twin; shared BuildID; slices; ad-hoc signature; MAR re-emit; descriptor pair; each plant red | full + quick twin | `--only macos-package-payload-self-test` then `--only macos-package-payload` | ❌ new `scripts/verify-macos-package-payload.mjs` | ⬜ pending |
| 55-03-02 | 03 | 3 | SEC-04 | T-55-09 | Hook-only Team-ID patch regenerated; surface clean; inside-out order plus rcodesign plus verify plus notarize wiring asserted; release.yml build-macos + matrix-macos legs (legion, contents: read, no secrets., no schedule, SHA-pinned uses) idempotent per A2 | static + full | `check-patch-surface.sh`; `--only mac-entitlements`; payload self-test; grep build-macos + matrix-macos + contents: read, no secrets. ref | ❌ new `patches/050-powerbrowser-macos-team-id.patch` | ⬜ pending |
| 55-03-03 | 03 | 3 | PKG-15 | T-55-05, T-55-09 | lipo merge plus Mach-O assertion; UPD-21 macOS copy source string in powerbrowser-welcome-widget.tsx plus shape test | full + quick | `--only macos-package-payload-self-test`; copy shape plants; ls branding copy source | ❌ `package-macos.sh` merge; branding copy source | ⬜ pending |
| 55-04-01 | 04 | 4 | PKG-16 | T-55-10, T-55-12 | Matrix-record gate plus download-copy gate (en-US scope + complete-MAR size derived, set equality; dropped scope/size plants red) plus four registry rows; draft record UNVERIFIED where unobserved | static quick + in-memory self-test | `--only macos-install-matrix-self-test` / `--only macos-download-copy` + twins | ❌ new `scripts/verify-macos-install-matrix.mjs`, `scripts/verify-macos-download-copy.mjs` | ⬜ pending |
| 55-04-02 | 04 | 4 | PKG-16, SEC-04, PKG-14 | T-55-10, T-55-11, T-55-13 | Owner credentials, hosted runs, Mac session, Gatekeeper observation, release-gate flip; exact copy-paste command block per step (gh dispatch, shasum, codesign, notarytool, update-hop, uninstall/residue, approvals) | manual (owner) | none: blocking-human checkpoint, eight-field reply | — | ⬜ pending |
| 55-04-03 | 04 | 4 | PKG-16, SEC-04, PKG-14 | T-55-10, T-55-12, T-55-13 | Record complete with zero UNVERIFIED; payload plus matrix plus copy rows green live; deferred halves filled | full (built tree) | `--only macos-package-payload` then `--only macos-install-matrix` then `--only macos-download-copy` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements (the registry, TARGETS byte-identity, `--self-test`, and check surfaces exist; the new scripts are the deliverables).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| D-U-N-S request, enrolment, fee-waiver outcome | SEC-04 gate | Apple portal plus Dun and Bradstreet | Owner requests, enrols, records dates and outcome in the checkpoint reply |
| Developer ID certificate plus App Store Connect API key | SEC-04 | Apple portal plus Keychain | Owner creates, holds only as release secrets, attests yes with no values |
| SEC-13 live re-check of licence, rcodesign, CA date | SEC-13 | live Apple plus crates plus PKI reads | Owner re-reads, records version plus dates plus excerpts in the reply |
| Hosted build, sign, notarize, matrix runs | PKG-14, PKG-16, SEC-04 | workflow dispatch plus environment approval | Owner dispatches on main, approves release, records run identities and fallback choice |
| Real-Mac install, launch, update, uninstall, Gatekeeper | PKG-16 | human observation on hardware | Owner runs the session, fills every matrix cell with verdict plus evidence and the verbatim Gatekeeper path |
| Release plus descriptor approvals after canary | PKG-14 | per-release owner approvals | Owner approves release, waits 24 hours, approves descriptor after the own-install hop |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
