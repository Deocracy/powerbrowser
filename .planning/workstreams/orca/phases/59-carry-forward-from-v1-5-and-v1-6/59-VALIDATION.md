---
phase: "59"
slug: "carry-forward-from-v1-5-and-v1-6"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-08"
audited: "2026-11-14"
---

# Phase 59 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | the single registry `scripts/verify-platform.sh` (bash driver over `node` scripts, each row with a `--self-test`) |
| **Config file** | none; the registry array inside `scripts/verify-platform.sh` |
| **Quick run command** | `scripts/verify-platform.sh --only <label>` (seconds to minutes per row) |
| **Full suite command** | `scripts/verify-platform.sh --quick` (about 7 minutes here, 328 PASS on 2026-11-08); `--build` and `--gate` need a dev objdir |
| **Estimated runtime** | ~400 seconds for `--quick` |

---

## Sampling Rate

- **After every task commit:** Run the touched `--only <label>` rows and their `<label>-self-test` siblings
- **After every plan wave:** Run `scripts/verify-platform.sh --quick` on the merged tree (after each lane merge)
- **Before `/gsd-verify-work`:** `--build` then `--gate` must be green on the merged tree with a dev objdir
- **Max feedback latency:** 420 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 59-01-* | 01 | 1 | CF-14 | — | N/A | docs grep | `grep -q 'Live state' <summary>`; `node scripts/scan-brand-residue.mjs` after `git add` | ✅ | ✅ green |
| 59-02-01 | 02 | 1 | CF-15 (DEVICE-FLOW token input) | T-59-01 / — | token never logged or committed | self-test | `scripts/verify-platform.sh --only repo-controls-self-test`; `node scripts/verify-repo-controls.mjs --self-test` | ✅ | ✅ green |
| 59-02-02 | 02 | 1 | CF-15 (plan 57-08 `clearEnv`) | T-59-02 / — | `MOZ_CRASHREPORTER_AUTO_SUBMIT` cleared at the boundary | static gate | `bash scripts/check-internals-boundary.sh && bash scripts/check-internals-boundary.sh --catalogue && bash scripts/check-internals-boundary.sh --self-test`; `node scripts/verify-ng-040-internals-catalogue-lines.mjs`; `node scripts/verify-crash-autosubmit-env.mjs && node scripts/verify-crash-autosubmit-env.mjs --self-test` | ❌ W0 (new script + 2 rows) | ✅ green |
| 59-02-03 | 02 | 1 | CF-15 (`/etc/nixos` snippet) | — | N/A | manual (owner) | option names checked with the nixos MCP; owner runs `nixos-rebuild dry-build` | ✅ (new file) | manual (owner) |
| 59-03-* | 03 | 1 | 999.28–999.31 (WINDOWS.md 27, 28, 34, 36–43) | — | N/A | live per row | `scripts/verify-platform.sh --only <label>` three times for flake rows, plus `<label>-self-test` where present; row labels per 59-RESEARCH.md §59-03 table | ✅ | live, recorded (59-03/59-09 SUMMARY); not re-run |
| 59-04-* | 04 | 1 | CF-01, CF-02, CF-03, CF-04, CF-12 | — | secrets stay in GitHub environments | live + owner | `--only repo-controls`, `updates-repo-static`, `events-worker`, `watchdog`, `tel06-error-delivery-live`, `upptime-sweep-live`, `codeberg-mirror-live`, `ng065-mar-signature-enforced`; `python3 scripts/ledger-report.py` | ✅ | ⬜ pending (plan in progress) |
| 59-05-* | 05 | 2 | CF-05..CF-09, CF-11 | — | release secrets only in `release`/`descriptor` environments | live + owner | `--only portable-elf`, `sidecar-no-symlinks`, `package-target-natives`, `ng063-packaged-launch`, `packaged-identity`, `install-matrix`, `channel-live`, `mar-update-hop`, `fixer-prepare-self-test`, `triage-workflow` | ✅ | ⬜ pending (not executed) |
| 59-06-* | 06 | 2 | CF-17 | — | N/A | human | automated halves from `.planning/v1.5-LIVE-PASS.md`; verdicts by Chris in the box | ✅ | ⬜ pending (not executed) |
| 59-07-* | 07 | 3 | CF-16, CF-13, CF-19 | — | N/A | full | `scripts/verify-platform.sh --build`; `scripts/verify-platform.sh --gate`; `git ls-remote --tags origin 'v1.*'` | ✅ | ⬜ pending (prep only) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `scripts/verify-crash-autosubmit-env.mjs` plus its two registry rows (from 57-08 Task 2) — plan 59-02
- [ ] A dev `objdir/` in the coordinating tree before any live row of 59-03, 59-06 and 59-07 (one `./mach build`, started at the start of wave 1)
- [ ] A coordinator script for re-dating WINDOWS.md entries, dry-run before use — plan 59-07

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| GitHub UI steps (Apps, notifications, phone pushes, second-account drills) | CF-01, CF-02, CF-07 | dashboard-only | OWNER-PASS §1, §8 commands; Claude probes with `gh api` after "done" |
| Cloudflare dashboard, payment method, Anthropic Console caps | CF-01, CF-06 | account-owner only | OWNER-PASS §2, §3, §7 |
| MAR key ceremony media custody | CF-03 | physical media | OWNER-PASS §4; Claude verifies `ng065-mar-signature-enforced` |
| `pkexec` runs on legion (`/etc/nixos` change, runner) | CF-04 | sandbox blocks pkexec | OWNER-PASS §5; Claude probes the runner with `gh api .../runners` |
| First-release approvals (`release`, `descriptor` environments), hop drill | CF-08 | human approval gates | OWNER-PASS §9; Claude verifies `channel-live`, `mar-update-hop` |
| 41-item checklist, verify-work 29/30/31 | CF-17 | look-and-feel and real-input judgement | Claude drives via gsd-browser and `scripts/lib/pb-kwin.mjs`; Chris judges each item in the box |
| Single push asks (D-12 before 59-05, D-11 at 59-07) | CF-19 | owner's word | the box; Claude confirms with `git ls-remote` after |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 420s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** partial — live and owner rows outstanding (2026-11-14)

## Validation Audit 2026-11-14

Static rows re-run on f6e2cab5 (no live row, no build): `crash-autosubmit-env` and its self-test, `repo-controls-self-test` (79 plants), `internals-boundary`, `internals-boundary-self-test`, `internals-catalogue` all PASS; CF-14 `Live state at parking` present in the five deploy SUMMARYs. `repo-controls-self-test` fails closed without `theia/node_modules` (js-yaml) and `crash-autosubmit-env` without `upstream/`; both are environment, not gaps.

No gap needs a new check: every automatable item already has a registry row. The phase is **not compliant**: 59-04 is in progress, 59-05 and 59-06 have not executed, 59-07 is prep only, and those rows are live or owner work (Manual-Only table). 59-03 live rows have recorded run evidence in the 59-03 and 59-09 SUMMARYs; they were not re-run here (live lock held).
