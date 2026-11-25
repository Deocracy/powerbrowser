---
phase: "67"
slug: "hosting-hardening"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-11-10"
---

# Phase 67 — Validation Strategy

> Per-phase validation contract. Derived from 67-RESEARCH.md "Validation Architecture", adjusted for the token-gate hotfix (ServerDestroyer/hotfix-sidecar-origin) that already carries RUN-08's rule and its two rows. Nothing here needs a human (D-18); visual and copy review sit in 67-06's Deferred Verification table.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node 24 scripts registered as rows in `scripts/verify-platform.sh` |
| **Config file** | none (registry rows; quick blocks above `"allowlist-schema|check_allowlist_schema"`, full blocks above the line closing the full-tier array) |
| **Quick run command** | `scripts/verify-platform.sh --only <label>` |
| **Full suite command** | `nix develop .#theia --command scripts/verify-platform.sh --quick`; live rows under `flock /home/chris/coding/Power-Browser/.git/pb-live.lock` with every inherited `ORCA_*` removed and `MOZ_PURGE_CACHES=1` |
| **Estimated runtime** | ~450 seconds for `--quick`; each live row 2-6 minutes |

---

## Sampling Rate

- **After every task commit:** the lane's quick rows via `--only`, then `node scripts/scan-brand-residue.mjs` after staging
- **After every plan wave:** `scripts/verify-platform.sh --quick` at each lane merge (67-06 merge_rules)
- **Before `/gsd-verify-work`:** `--quick` green against the recorded baseline; after the Theia rebuild and `./mach build faster`: the header re-record, `sidecar-origin-gate-live`, every live row using `makeProfile` or the firefox-bidi defaults, then the five Phase 67 live rows
- **Max feedback latency:** 450 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 67-01-T1 | 01 | 1 | RUN-06 | T-67-01 | orcaStatus replies state and class only | quick | `--only orca-service` (scenario G), `--only orca-service-self-test`; `check-internals-boundary.sh` and `--catalogue`; `verify-ng-040-internals-catalogue-lines.mjs` | ✅ (extend) | ✅ green |
| 67-01-T2 | 01 | 1 | RUN-06 | T-67-02, T-67-03, T-67-07 | closed client-reason set; restart only in failed; offer removed on stop (delivered by Phase 64 C5, not re-implemented) | quick | `--only orca-failure-classes`, `--only orca-failure-classes-self-test`, `--only orca-service` (H, at its Setup 5 letter; 64-03's scenario I for the offer removal) | ❌ W0 | ✅ green |
| 67-01-T3 | 01 | 1 | RUN-09 | T-67-04, T-67-05, T-67-06 | refusal before spawn; override never reaches orcad; statement tied to the pin | quick + full | `--only orca-credential-store`, `--only orca-credential-store-self-test`, `--only orca-credential-store-live-self-test`; live: `--only orca-credential-store-live` (coordinator) | ❌ W0 | ⚠️ static green; live row not re-run here (last PASS 67-06/67-07) |
| 67-02-T1 | 02 | 1 | RUN-08 | T-67-08, T-67-09 | orcad's origin refused; Orca routes behind gate() | quick | `--only sidecar-origin-gate`, `--only sidecar-origin-gate-self-test` (hotfix rows, extended) | ✅ (hotfix) | ✅ green |
| 67-02-T2 | 02 | 1 | RUN-08 | T-67-10, T-67-11 | PB's pane bundle still served; orcad page 403 with cookie present | full | `--only sidecar-origin-gate-live` (coordinator); probe `record-sidecar-headers.mjs` re-record | ✅ (hotfix) | ⚠️ static green; live row not re-run here (last PASS 67-06/67-07) |
| 67-03-T1 | 03 | 1 | RUN-06 | T-67-15 | no identifier on the page; buttons match sentences | quick | `--only shell-error-copy-no-internals`, `node scripts/verify-shell-error-copy.mjs --self-test`; orca-panes build | ✅ (extend) | ✅ green |
| 67-03-T2 | 03 | 1 | RUN-07 | T-67-12, T-67-13, T-67-14 | lstat, own uid, no group/other bits, loopback endpoint; refusal by code only | quick | `--only orca-offer-file`, `--only orca-offer-file-self-test` | ❌ W0 | ✅ green |
| 67-03-T3 | 03 | 1 | RUN-06 | T-67-16 | positive control before each induction; registry edit keeps the offer row | quick + full | `--only orca-failure-page-live-self-test`; live: `--only orca-failure-page-live` (coordinator) | ❌ W0 | ⚠️ static green; live row not re-run here (last PASS 67-06/67-07) |
| 67-04-T1 | 04 | 1 | RUN-07 | T-67-17, T-67-21 | collector proves it can see before an absence | quick | `node scripts/verify-orca-pairing-containment.mjs --self-test`; `node scripts/verify-orca-offer-scan.mjs --self-test` | ❌ W0 | ✅ green |
| 67-04-T2 | 04 | 1 | RUN-07 | T-67-17..T-67-20 | every sink planted and red by name | quick | `--only orca-pairing-containment-self-test` | ❌ W0 | ✅ green |
| 67-04-T3 | 04 | 1 | RUN-07, RUN-09 | T-67-22 | live profiles outside temp roots; alias and bridge folder removed | quick + full | makeProfile assertion (plan verify); live: `--only orca-pairing-containment-live` (coordinator) | ❌ W0 | ⚠️ static green; live row not re-run here (last PASS 67-06/67-07) |
| 67-05-T1 | 05 | 2 | INJ-01 | T-67-23, T-67-24 | parent answers orcad's port only; child unprivileged | quick | boundary chain; `logoAnswerFor` gate cases (plan verify) | ❌ W0 | ✅ green |
| 67-05-T2 | 05 | 2 | INJ-01 | — | selector tied to the built client | quick (SKIP without build) | `--only orca-landing-selectors`, `--only orca-landing-selectors-self-test` | ❌ W0 | ✅ green |
| 67-05-T3 | 05 | 2 | INJ-01 | T-67-26, T-67-27 | proxy control first; offer only in the form field | quick + full | `--only orca-landing-logo-live-self-test`; live: `--only orca-landing-logo-live` (coordinator) | ❌ W0 | ⚠️ static green; live row not re-run here (last PASS 67-06/67-07) |
| 67-06-T1 | 06 | 3 | RUN-06, RUN-08 | T-67-28, T-67-29 | PB pages still served after the rule | full (live) | probe re-record; `--only sidecar-origin-gate-live`; derived makeProfile/firefox-bidi rows; `--only orca-failure-page-live` | n/a | ⚠️ static green; live row not re-run here (last PASS 67-06/67-07) |
| 67-06-T3 | 06 | 3 | all | T-67-30..T-67-32 | N/A | full + quick | the four other live rows, `orca-service-live`, `orca-overlay`, `orca-overlay-built`, `privacy-hosts`, brand scan, `--quick` | n/a | ⚠️ static green; live row not re-run here (last PASS 67-06/67-07) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `powerbrowser/shell/OrcaEnv.sys.mjs` classification, temp-root, override and logo exports before any check imports them (67-01 T1/T3, 67-05 T1)
- [x] `theia/extensions/orca-panes/src/browser/failure/orca-failure-copy.ts` and `src/node/offer-file-policy.ts` before the cross-lane clauses of `orca-failure-classes` and `orca-credential-store` run without SKIP (merged in 67-06 T1)
- [x] `scripts/lib/mozlz4.mjs` and the extended `scripts/lib/orca-offer-scan.mjs` before the containment self-test (67-04)
- [x] The repo-local profile base in `pb-relaunch.mjs` and `firefox-bidi.mjs`, with alias and bridge-folder removal in dispose, merged before any Phase 67 live row runs (67-04 T3, A-6)
- [x] The hotfix merged into the branch before lane p67-02 starts and before 67-06 runs any live row
- [x] Re-run after the merges: `shell-error-copy-no-internals`, `shell-error-contract`, `start-path-recovery`, `internals-boundary`, `internals-catalogue`, `ng-040-internals-catalogue-lines`, `privacy-hosts`, `theia-endpoints`, `generated-byte-identity`, `branding-preflight`, `gui04-registry-shape`

---

## Manual-Only Verifications

All phase behaviors have automated verification. Visual and copy review (the page in light and dark themes, the PB mark on Orca's dark tile, the wording of the protection and RUN-09 sentences) and the owner picks P67-17, P67-18, P67-19, P67-21, CA-07 and the live-row HOME question are owner items for the end-of-milestone pass (D-18), listed in 67-06-SUMMARY.md.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 450s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-11-14 (static audit, see Validation Audit)

---

## Validation Audit 2026-11-14

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

Static audit at f6e2cab5, run in a worktree with read-only links to orca/, upstream/, theia/node_modules. Every requirement (RUN-06, RUN-07, RUN-08, RUN-09, INJ-01) maps to a registry row with a planted-fault self-test; no new check was needed. PASS here: orca-service (+self-test), orca-failure-classes (+self-test), orca-credential-store (+self-test, live-self-test), sidecar-origin-gate (+self-test), shell-error-copy-no-internals, orca-offer-file (+self-test), orca-failure-page-live-self-test, orca-pairing-containment-self-test, orca-offer-scan-self-test, orca-landing-selectors (+self-test, after `node scripts/generate.mjs` wrote the gitignored generated/), orca-landing-logo-live-self-test, internals-boundary, internals-catalogue, shell-request-kinds, orca-overlay.

Not re-run here (static-only audit; the live lock is held): the five Phase 67 live rows, sidecar-origin-gate-live and the header re-record (last PASS in 67-06/67-07 per 67-VERIFICATION), and diff-theia-core, which needs the Theia app on :3939 (port occupied; last PASS in 67-VERIFICATION).

Manual-only: the visual/copy review and owner picks listed above (D-18).
