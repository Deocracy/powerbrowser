---
phase: "50"
slug: "release-train-stages-and-first-public-linux-release-e"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-23"
---

# Phase 50 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `scripts/verify-platform.sh` registry rows; each script carries its own `--self-test` (node built-ins, bash) |
| **Config file** | none — rows live in the `CHECKS=(` array in `scripts/verify-platform.sh` (quick rows before the full-tier `CHECKS+=(` line ≈4734) |
| **Quick run command** | `scripts/verify-platform.sh --only <label>` (and `<label>-self-test`); `scripts/verify-platform.sh --quick` |
| **Full suite command** | `scripts/verify-platform.sh --only repo-controls` (after owner checkpoint); live drill = `node scripts/verify-mar-update-hop.mjs` against `.mozbuild/mar-hop/` with `served: release` |
| **Estimated runtime** | ~70 seconds (`--quick`); hop drill is legion wall-clock (container build + N→N+1 hop) |

---

## Sampling Rate

- **After every task commit:** `scripts/verify-platform.sh --only <extended label>` and its `-self-test`; `node scripts/scan-brand-residue.mjs` after `git add` (the residual-brand scan reads `git ls-files`, so stage before trusting green)
- **After every plan wave:** `scripts/verify-platform.sh --quick`
- **Before `/gsd-verify-work`:** `--quick` green, owner checkpoints done in order (probe → bump merge → `release` approval → hop → /download → `descriptor` approval → DONE), release record in `docs/RELEASING.md`
- **Max feedback latency:** 90 seconds for static rows; the live drill is the only long pole

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 50-01-01 | 01 | 1 | TRAIN-10 | T-50-01 | 8 states derived from GitHub facts only; one transition per release per run; exact run linked by head_sha | static quick (fixtures, set-equality) | `scripts/verify-platform.sh --only release-train-logic-self-test` | ❌ new in Phase 43 (`scripts/release-train.mjs`); Phase 50 extends fixtures | ⬜ pending |
| 50-01-02 | 01 | 1 | TRAIN-10 | T-50-02 | SHA == tip of main, or manifest-touching ancestor with identical workflows tree; else exit before building | static plant (quick) + live run observation | self-test plants (non-tip, non-manifest ancestor, workflows-divergent) + `--only release-train-logic-self-test` | ❌ `release.yml` is Phase 49; SHA step added here | ⬜ pending |
| 50-02-01 | 02 | 2 | UPD-16 | T-50-03 | `served: release` N→N+1 proves hosts, hash, distinct version/buildID, signature, allowed channels, attestation | static plants (quick) + live drill (full, owner on legion) | `scripts/verify-platform.sh --only mar-update-hop-self-test` (11 plants) + `node scripts/verify-mar-update-hop.mjs` against real evidence | ◐ script exists; `served` selector + plants new | ⬜ pending |
| 50-02-02 | 02 | 2 | UPD-16 | T-50-03 | Each fault plant goes red naming the property (hosts/hash/version/signature/channels/attestation) | self-test | `scripts/verify-platform.sh --only mar-update-hop-self-test` | ◐ same file | ⬜ pending |
| 50-03-01 | 03 | 3 | REL-02 | T-50-04 | No-update descriptors per target; withdrawn-mode channel-live rerun; Release marked per probe; never delete, never reuse tag | static shape (quick, if row added) + live withdraw drill (full, owner) | `--only <withdraw-row>-self-test` (if added) + owner-executed withdraw on a probe tag; probe verdict in `docs/RELEASING.md` | ❌ new `withdraw.yml` in `powerbrowser-updates` (Phase 47 repo) | ⬜ pending |
| 50-03-02 | 03 | 3 | REL-02 | T-50-04 | REL-02 probe: immutable-release pre-release-flag edit allowed or not; branch (flag vs notes) recorded before first public release | manual (owner) | probe commands in `checkpoint:human-action`; verdict recorded | — (procedure) | ⬜ pending |
| 50-04-01 | 04 | 4 | GH-15, REL-03 | T-50-05 | KNOWN-ISSUES bytes in one pinned issue; create-once/PATCH-on-bytes-differ; duplicates red | static bytes-compare plant (quick) + live PUBLISHED observation | self-test: differing bytes → PATCH, identical → no-op, duplicates → red | ❌ report-job step (Phase 43 job, Phase 50 step) | ⬜ pending |
| 50-04-02 | 04 | 4 | REL-03 | — | Bump merged, `release` approved, hop passed, /download live, descriptor after owner's own N-1 to N hop + `descriptor` approval; criterion-5 values recorded | manual-only (owner checkpoints) | exact `gh` commands in `checkpoint:human-action` / `checkpoint:human-approval`; sweep/allowlist values pasted into release record | — (procedure) | ⬜ pending |
| 50-04-03 | 04 | 4 | REL-03 (crit. 5) | — | Asset hosts observed at layer 3; sweep runner/channel/download rows report live values | observation (full, live) | `bash scripts/verify-endpoints.sh --layer 3` facility + sweep issue values | — (no new rows) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky* — task IDs are filled in once plans exist.

---

## Wave 0 Requirements

The registry and the self-test conventions exist (`mar-update-hop`, `release-identity`, `update-channel`, `repo-controls`, `workflows` rows all present with plants). The gaps are exactly the unlanded dependencies (train skeleton, `release.yml`, updates repo, KNOWN-ISSUES file, sweep) — researched against SPEC text, built by their owning phases:

- [ ] `scripts/release-train.mjs` — TRAIN-10 state table + `derive`/`next`/`render` + `release-train-logic-self-test` (Phase 43 builds; Phase 50 extends fixtures)
- [ ] `.github/workflows/release.yml` + SHA-validation first step — TRAIN-10 (Phase 49 builds; Phase 50 adds the step)
- [ ] `withdraw.yml` in `powerbrowser-updates` — REL-02 (new here; repo itself is Phase 47)
- [ ] `served: release` selector + 11 plants in `scripts/verify-mar-update-hop.mjs` — UPD-16 (extends existing script)
- [ ] Report-job KNOWN-ISSUES step — GH-15 (Phase 43 job; Phase 50 step)

*If none: "Existing infrastructure covers all phase requirements."* — not the case here; the list above is the Wave 0 contract.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Immutable-release pre-release-flag probe | REL-02 | Needs a live Release on the immutable-releases repo | Owner creates a probe tag/Release, attempts the pre-release-flag PATCH with the bot App token, records flag-vs-notes branch in `docs/RELEASING.md` before the first public release |
| Bump PR merge | REL-03 | Owner-only merge | `checkpoint:human-approval` with the exact `gh pr merge` / UI steps; ESR calendar decides which point release |
| `release` approval | REL-03 | Owner-only environment approval | Approve the pending `release` deployment; train links the exact run |
| N→N+1 hop on legion | UPD-16 | Needs the packaged tarball + clean non-Nix room on legion | Run the `served: release` drill per `docs/BUILD.md` procedure from a bookworm container/VM; evidence lands in `.mozbuild/mar-hop/` |
| /download live | REL-03 | Needs the published Release + Phase 47 site | Owner confirms stable-name links, SHA256SUMS, attestation note, signing status |
| `descriptor` approval after own N-1 to N hop | REL-03 | Owner-only; the owner's own install is the gate | Owner runs their own N-1→N hop, then approves `descriptor`; public `update.xml` byte-equals the repo copy |
| Criterion-5 observation | REL-03 | Live values only exist at the first public release | Paste `verify-endpoints.sh --layer 3` asset-host lines + sweep runner/channel/download rows into the release record |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s (static rows)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
