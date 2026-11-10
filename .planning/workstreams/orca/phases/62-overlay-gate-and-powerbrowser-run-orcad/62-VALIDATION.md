---
phase: "62"
slug: "overlay-gate-and-powerbrowser-run-orcad"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-09"
---

# Phase 62 — Validation Strategy

> Per-phase validation contract. Derived from 62-RESEARCH.md "Validation Architecture". Nothing here needs a human (D-18).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node 24 scripts registered as rows in `scripts/verify-platform.sh` |
| **Config file** | none (registry rows; quick anchor after line 3863, full anchor after line 6432) |
| **Quick run command** | `scripts/verify-platform.sh --only <label>` |
| **Full suite command** | `scripts/verify-platform.sh --quick` (about 7 minutes); live rows under `flock /home/chris/coding/Power-Browser/.git/pb-live.lock` |
| **Estimated runtime** | ~420 seconds for `--quick` |

---

## Sampling Rate

- **After every task commit:** the lane's quick rows via `--only`, plus `node scripts/scan-brand-residue.mjs` after staging
- **After every plan wave:** `scripts/verify-platform.sh --quick` at each lane merge
- **Before `/gsd-verify-work`:** `--quick` green; after `./mach build faster`: `--only orca-service-live`, `--only orca-hidden-electron`, `--only orca-overlay-built`, `--only orca-build-shape` under the live lock
- **Max feedback latency:** 420 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 62-svc-static | 02 | 1 | RUN-03 | T-62-xx | exact environment from one constant; loopback bind only; no stdout logging of the ready line | quick | `--only orca-service`, `--only orca-service-self-test`; `bash scripts/check-internals-boundary.sh` and `--catalogue`; `node scripts/verify-ng-040-internals-catalogue-lines.mjs` | ❌ W0 | ⬜ pending |
| 62-svc-live-env | 02 | 1 | RUN-03 | T-62-xx | no inherited `ORCA_*` (planted `ORCA_PLANT_62` control); both data-root variables equal; telemetry off | full (live) | `--only orca-service-live` (phase 1: `/proc/<pid>/environ` names equal fixed ∪ (allowlist ∩ PB env)) | ❌ W0 | ⬜ pending |
| 62-electron | 02 | 1 | RUN-04 | T-62-xx | installed Orca desktop never launched | full + quick self-test | `--only orca-hidden-electron` (stock run launches the ELF decoy first, then the switched run does not); `--only orca-hidden-electron-self-test` | ❌ W0 | ⬜ pending |
| 62-quit | 02 | 1 | RUN-05 | T-62-xx | no orphaned agent or PTY after quit | full (live) | `--only orca-service-live` (phase 2: real terminal session, tree recorded before `app.quit()`, all pids dead after) | ❌ W0 | ⬜ pending |
| 62-reap | 02 | 1 | RUN-05 | — | stale orcad reaped by pid + start ticks; orcad's own lock never deleted | full (live) | `--only orca-service-live` (phase 3: SIGKILL PowerBrowser, relaunch, ready orcad on the same port, new lock pid) | ❌ W0 | ⬜ pending |
| 62-overlay | 01 | 1 | OVL-01 | T-62-xx | no whole-file replacement; no undeclared seam | quick | `--only orca-overlay`, `--only orca-overlay-self-test` (plants: whole-file replacement, undeclared seam, row without patch, count over cap, blob drift, pre-image mismatch, over the 20-line bound) | ❌ W0 | ⬜ pending |
| 62-shadow | 01 | 1 | OVL-05 | — | N/A | quick | same rows (plants: exact shadow, case-only collision, file under an upstream file path, file equal to an upstream directory) | ❌ W0 | ⬜ pending |
| 62-compiled | 01 | 1 | OVL-05 | — | N/A | full | `--only orca-overlay-built` (SKIP line when `orca/out` is absent; marker literal per overlay file in `out/web` or `out/orcad`) | ❌ W0 | ⬜ pending |
| 62-shape | 01 | 1 | OVL-01 | — | N/A | full + quick | `--only orca-build-shape`, `--only orca-build-shape-self-test` (modified tracked set equals the declared seams) | ✅ (edit) | ⬜ pending |
| 62-egress | 02 | 1 | RUN-03 | — | `.onorca.dev` is `user-initiated` | quick | `--only theia-endpoints`, `--only privacy-hosts`, `--only generated-byte-identity` | ✅ | ⬜ pending |
| 62-coord | 03 | 2 | all | — | N/A | quick + live | `--quick`; `./mach build faster`; the four live/full rows; brand rows re-measured | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `scripts/verify-orca-overlay.mjs`, `scripts/verify-orca-service.mjs`, `scripts/verify-orca-hidden-electron.mjs`, `scripts/verify-orca-service-live.mjs`, each with `--self-test`
- [ ] `powerbrowser/shell/OrcaEnv.sys.mjs` (the one environment constant) before any check that imports it
- [ ] Rows appended at the two registry anchors; the `orca-build-shape` rule and its self-test edited for seam coexistence
- [ ] Brand rows re-measured by the coordinator after the lanes merge
- [ ] Re-run after the `powerbrowser.js` edit: `shell-error-copy-no-internals`, `internals-boundary`, `internals-catalogue`, `sidecar-reap-blocker`, `start-path-recovery`, `privacy-hosts`, `theia-endpoints`, `generated-byte-identity`

---

## Manual-Only Verifications

All phase behaviors have automated verification. Overrides of the auto-mode picks P62-01..P62-20 are Chris's at any time.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 420s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
