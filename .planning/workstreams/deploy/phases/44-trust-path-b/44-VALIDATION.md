---
phase: "44"
slug: "trust-path-b"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-22"
---

# Phase 44 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `scripts/verify-platform.sh` registry plus per-script `--self-test` (node built-ins, bash) |
| **Config file** | none — rows are the `CHECKS=(` array in `scripts/verify-platform.sh` (quick `:3573`, full `:4733`) |
| **Quick run command** | `scripts/verify-platform.sh --only <label>` (and `<label>-self-test`) |
| **Full suite command** | `scripts/verify-platform.sh --quick` then full `scripts/verify-platform.sh` |
| **Estimated runtime** | ~70 seconds (`--quick`); `ng065` a few minutes (builds + signs + drives the packaged updater) |

---

## Sampling Rate

- **After every task commit:** `scripts/verify-platform.sh --only <new label>` and its `-self-test`; `node scripts/scan-brand-residue.mjs` after `git add` (the scan reads `git ls-files`, so stage first)
- **After every plan wave:** `scripts/verify-platform.sh --quick`
- **Before `/gsd-verify-work`:** `--quick` green, plus `ng065-mar-signature-enforced` with both key DBs present and one `build-update-xml --check` against the built `objdir/`
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 44-01-01 | 01 | 1 | SEC-05 | T-44-01, T-44-02 | Owner ceremony in a new NSS dir with a distinct nickname; two `.p12` copies recorded | manual (owner checkpoint) | owner's twelve-field-equivalent reply (DER SHA256, date, machine, NSS paths, nicknames, media labels) | — (owner step) | ⬜ pending |
| 44-01-02 | 01 | 1 | SEC-05 | T-44-03, T-44-04 | Regenerated patch 030 equals its regeneration; secondary slot points at the new DER | quick | `scripts/verify-platform.sh --only patches-regenerated && scripts/verify-platform.sh --only patches-regenerated-self-test` | ❌ DER + regenerated patch | ⬜ pending |
| 44-01-03 | 01 | 1 | SEC-05 | T-44-05, T-44-06 | Secondary-only MAR applies (`succeeded`); unsigned/foreign still refused | full (needs both key DBs) | `scripts/verify-platform.sh --only ng065-mar-signature-enforced` | ✅ (extend in place) | ⬜ pending |
| 44-02-01 | 02 | 2 | UPD-14 | T-44-07, T-44-08 | `buildUpdateXml` carries `detailsURL` with no format drift; hop idempotency holds | quick + self-test | `scripts/verify-platform.sh --only mar-update-hop-self-test` | ✅ (extend emitter) | ⬜ pending |
| 44-02-02 | 02 | 2 | UPD-14 | T-44-09, T-44-10 | One descriptor per BUILD_TARGET from the built tree, byte-identical on re-emission, `detailsURL` present | quick self-test | `scripts/verify-platform.sh --only build-update-xml-self-test` | ❌ new CLI | ⬜ pending |
| 44-02-03 | 02 | 2 | UPD-14 | T-44-09 | Emitted descriptors equal a fresh emission from `objdir/`; missing `objdir/` FAILs naming it | full | `scripts/verify-platform.sh --only build-update-xml` | ❌ same CLI | ⬜ pending |
| 44-03-01 | 03 | 3 | UPD-26 | T-44-11, T-44-12 | Same-version older buildID refused naming descriptor + both buildIDs; malformed manifest refused | quick self-test | `scripts/verify-platform.sh --only descriptor-monotonic-self-test` | ❌ new row | ⬜ pending |
| 44-03-02 | 03 | 3 | UPD-26 | T-44-11 | Live: every offered buildID strictly above every published buildID for that appVersion; zero Releases green with a named count | full (needs `gh`) | `scripts/verify-platform.sh --only descriptor-monotonic` | ❌ same row | ⬜ pending |
| 44-03-03 | 03 | 3 | UPD-26 | T-44-13 | No `MOZ_BUILD_DATE` pin in the emitter, `.mozconfig`, or release path | static grep | `! grep -rn 'MOZ_BUILD_DATE' scripts/generate.mjs scripts/build-update-xml.mjs .mozconfig powerbrowser/` | ✅ tree | ⬜ pending |
| 44-04-01 | 04 | 4 | SEC-09 | T-44-14 | Ceremony/rotation/secrets prose matches the tree (two `.p12` copies mandatory, no "no runbook" sentence) | static + doc gate | `scripts/verify-platform.sh --only releasing-maintenance` + named greps | ✅ `docs/RELEASING.md` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky* — task IDs are filled in once plans exist.

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements (the registry and self-test conventions exist; the new scripts are the deliverables):

- `patches-regenerated` row + self-test: SEC-05 patch gate (extend with the secondary plant, not a new row)
- `ng065-mar-signature-enforced` full row: SEC-05 live proof (extend in place with the fifth case)
- `mar-update-hop-self-test` quick row: UPD-14 emitter idempotency baseline
- `release-identity` / `update-channel` row shapes: UPD-14/UPD-26 new rows copy these

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Secondary MAR key ceremony (generate key, export DER, two `.p12` copies) | SEC-05 | Private key custody is the owner's offline step; the executor never touches keys | Owner on `legion`: new NSS dir, `certutil -N/-S`, `certutil -L -r` to the DER, two `pk12util -o` copies; reply with DER SHA256, date, machine, NSS paths, nicknames, media labels (never secrets) |
| Live `ng065` fifth case against the rebuilt updater | SEC-05 | Needs the rebuilt updater embedding both DERs plus both key DBs | Owner step with `PB_MAR_SECONDARY_DB` set; `scripts/verify-platform.sh --only ng065-mar-signature-enforced` must print PASS |
| Owner `--rollback-to` boundary review | UPD-26 | The flag is a Phase 49/50 boundary, not a Phase 44 build | Owner confirms the recorded boundary stands: Phase 44 builds only the refusal |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
