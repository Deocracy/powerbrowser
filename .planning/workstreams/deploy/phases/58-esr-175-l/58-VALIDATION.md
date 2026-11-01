---
phase: "58"
slug: "esr-175-l"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-23"
---

# Phase 58 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `scripts/verify-platform.sh` registry plus per-script `--self-test` (node built-ins, bash) |
| **Config file** | none — rows are the `CHECKS=(` array in `scripts/verify-platform.sh` |
| **Quick run command** | `scripts/verify-platform.sh --only <label>` (and `<label>-self-test`) |
| **Full suite command** | `scripts/verify-platform.sh --quick` |
| **Estimated runtime** | ~60 seconds (`--quick`); tier-3 dual-objdir measurement at execution only (~40-60 min per build, calendar-gated) |

---

## Sampling Rate

- **After every task commit:** `scripts/verify-platform.sh --only <new label>` and its `-self-test`; `node scripts/scan-brand-residue.mjs` after `git add`
- **After every plan wave:** `scripts/verify-platform.sh --quick`
- **Before `/gsd-verify-work`:** `--quick` green; calendar-gated live evidence (175 replay from the beta, dual-objdir `du`/`df`, ship approvals) recorded in docs
- **Max feedback latency:** 90 seconds (quick); tier-3 at execution only

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 58-01-01 | 01 | 1 | TRAIN-05 | T-58-02, T-58-04 | 175 tags list under their own guard; 175-under-153-guard and 153-under-175-guard fixtures red naming the drift; `175.0esr`+153.23 tag still dispatches 153.23 | quick + self-test | `scripts/verify-platform.sh --only detect-upstreams-self-test` (extended) | ❌ Wave 0 (Phase 43 file; `test -f scripts/detect-upstreams.mjs`) | ⬜ pending |
| 58-01-02 | 01 | 1 | TRAIN-05 | T-58-02, T-58-08 | two-major state list derived from `release-train.mjs`, set-equal to fixtures; 175 states covered; per-key issues `release-train: v<ESR>-<rev>` | quick + self-test | `scripts/verify-platform.sh --only release-train-logic-self-test` (extended) | ❌ Wave 0 (Phase 43 file; `test -f scripts/release-train.mjs`) | ⬜ pending |
| 58-01-03 | 01 | 1 | UPS-01 | T-58-01, T-58-05 | replay-only job: no `schedule:`, `contents: read`, no App token, no environment; conflict opens exactly one `ESR <tag>: patch <NNN> did not apply` issue; `dry-run` writes nothing | static quick | `scripts/verify-platform.sh --only workflows` + `--only workflows-self-test` (existing rows, 175 job covered) | ✅ (extend) | ⬜ pending |
| 58-02-01 | 02 | 2 | UPS-01 | T-58-03 | rebased patches equal their 175 regeneration; hand edit red naming the patch; moved-file `NOTE` + PASS | quick + self-test | `scripts/verify-platform.sh --only patches-regenerated` / `--only patches-regenerated-self-test` (existing rows, 175 run recorded) | ✅ (extend at execution) | ⬜ pending |
| 58-02-02 | 02 | 2 | UPS-01 | T-58-06 | no second tag literal: manifest/train-input derivation only; `FIREFOX_[0-9]` sweep green; planted literal in the new position red | quick + self-test | `scripts/verify-platform.sh --only verify-upstream-pins` / `--only verify-upstream-pins-self-test` (extended) | ✅ (extend) | ⬜ pending |
| 58-02-03 | 02 | 2 | UPS-01 | T-58-03 | toolchain file equals the 175 container bootstrap set; drift fails the build | quick + full (build job at execution) | `--only toolchain-baseline` (AUTO-05 row; `test -f` Phase 49 row) + `build-linux` run | ❌ Wave 0 (Phase 49 row) | ⬜ pending |
| 58-03-01 | 03 | 3 | UPS-03 | T-58-07, T-58-09 | two ~14 GB objdirs side by side on legion (`objdir-175`, live 153 untouched); `du`/`df` + wall times recorded per D-73; fallback verdict | full (legion at execution) + doc grep | `du -sh objdir*` + `grep -n 'objdir-175' docs/BUILD.md` | ✅ (docs edit) | ⬜ pending |
| 58-03-02 | 03 | 3 | UPS-01 | T-58-08 | ship 175.x before 153.27: descriptor + channel-live per 175 BUILD_TARGET; same owner approvals; `descriptor-monotonic` + `channel-live` green | full (at execution) | `scripts/verify-platform.sh --only channel-live` (Phase 49 row; `test -f`) | ❌ Wave 0 (Phase 49 row) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky* — task IDs are filled in once plans exist.

---

## Wave 0 Requirements

- [ ] `scripts/detect-upstreams.mjs` + `detect-upstreams-self-test` row — TRAIN-05, UPS-01 (Phase 43 delivers; Phase 58 extends; precondition `test -f` per plan)
- [ ] `scripts/release-train.mjs` + `release-train-logic-self-test` row — TRAIN-05 (Phase 43 delivers; Phase 58 extends)
- [ ] `scripts/toolchain-baseline.sh` container-set extension + `toolchain-baseline` row — UPS-01 (Phase 49/AUTO-05 delivers; Phase 58 re-records)
- [ ] `channel-live` / `release.yml` SHA path — UPS-01 ship (Phase 49 delivers; Phase 58 reuses with 175 SHAs)

*Wave 0 here means "delivered by an earlier phase": every 58 plan carries the `test -f` precondition so execution waits for Phases 43/49/52 rather than colliding with them.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| First replay-only 175 run green (or first conflict issue well-formed) | UPS-01 criterion 1 | No 175 tag exists until the beta (2027-06-10) | At the beta: dispatched replay run; `gh run watch <id>`; issue names patch, tags, files, verbatim logs |
| Dual-objdir disk measurement on legion | UPS-03 criterion 4 | Needs two tier-3 builds on legion (~40-60 min each) | `du -sh objdir*`, `df -h` before-after; record D-73 tuple in `docs/BUILD.md` |
| Ship 175.x before 153.27 | UPS-01 criterion 3 | Owner per-release `release` + `descriptor` approvals; calendar decision | Same `release.yml` with 175 SHAs; `channel-live` green; approvals recorded |

*If none: "All phase behaviors have automated verification."* — not the case here: the three rows above are calendar/hardware/owner-gated by design.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
