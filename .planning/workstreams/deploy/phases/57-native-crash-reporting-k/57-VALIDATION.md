---
phase: "57"
slug: "native-crash-reporting-k"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-23"
---

# Phase 57 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `scripts/verify-platform.sh` registry plus per-script `--self-test` (node built-ins, bash) |
| **Config file** | none — rows are the CHECKS array in `scripts/verify-platform.sh` |
| **Quick run command** | `scripts/verify-platform.sh --only <label>` (and `<label>-self-test`) |
| **Full suite command** | `scripts/verify-platform.sh --quick` |
| **Live run command** | `bash scripts/verify-endpoints.sh --layer 3` (reporter-enabled build, owner-observed; full tier only) |
| **Estimated runtime** | ~60 seconds (`--quick`); layer-3 live capture 35 s + build time (tier-3 reporter-enabled build, owner machine) |

---

## Sampling Rate

- **After every task commit:** `scripts/verify-platform.sh --only <new label>` and its `-self-test`; `node scripts/scan-brand-residue.mjs` after `git add`
- **After every plan wave:** `scripts/verify-platform.sh --quick`
- **Before `/gsd-verify-work`:** `--quick` green, plus the owner-observed layer-3 reporter-enabled run recorded in the SUMMARY
- **Max feedback latency:** 60 seconds (`--quick`); the live layer-3 run is owner-scheduled, not per-commit

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 57-01-T1 | 01 | 1 | TEL-09 | T-57-01, T-57-02 | Glean crash-ping consent defaults fail closed (four default-true inputs → false); explicit true path intact | quick (static patch-content + self-test) | `scripts/verify-platform.sh --only crash-ping-consent && scripts/verify-platform.sh --only crash-ping-consent-self-test` | ❌ created in task | ⬜ pending |
| 57-01-T2 | 01 | 1 | TEL-09 | T-57-03 | Layer-3 reporter-enabled run shows zero requests to `incoming.telemetry.mozilla.org` before consent; positive control (consent true / patch reverted) goes red naming the host | full (live, owner-observed) + quick (verdict fixtures) | `bash scripts/verify-endpoints.sh --layer 3` (reporter build) + `bash scripts/verify-endpoints.sh --disposition-self-test` | ✅ (extend layer 3) | ⬜ pending |
| 57-02-T1 | 02 | 2 | TEL-07 | T-57-04 | `--with-crashreporter-url` origin derived from `[urls].crash_report`; literal `--disable-crashreporter` while unset; comparand + byte-identity green | quick + self-test | `scripts/verify-platform.sh --only generated-byte-identity && scripts/verify-platform.sh --only crash-submit-origin-self-test` | ❌ created in task (helper + row) | ⬜ pending |
| 57-02-T2 | 02 | 2 | TEL-07 | T-57-05, T-57-06 | Crash host `allow` + `manifest` allowlist row; `breakpad.reportURL` expect equals the stated value; theia-endpoints green; stale/unattended plants red | quick + self-test | `scripts/verify-platform.sh --only theia-endpoints && scripts/verify-platform.sh --only theia-endpoints-self-test` | ✅ (extend allowlist) | ⬜ pending |
| 57-02-T3 | 02 | 2 | TEL-07 | T-57-07, T-57-08 | Worker `POST /submit` speaks the collector contract (CrashID/Discarded vocabulary, caps, allowlist, 30-day R2 lifecycle); synthetic-Request gate green; Gecko-shaped `extra` plant stored allowlist-filtered | quick | `scripts/verify-platform.sh --only crash-submit && scripts/verify-platform.sh --only crash-submit-self-test` | ❌ created in task | ⬜ pending |
| 57-03-T1 | 03 | 3 | TEL-12 | T-57-09 | `mach buildsymbols` per BUILD_TARGET produces `*.crashreporter-symbols.zip`; manifest `symbols_zip` entry; draft asset-equality extension; SHA256SUMS covers symbols | full (build, owner machine) + quick (manifest derivation) | `nix develop .#firefox --command mach buildsymbols` per target + `scripts/verify-platform.sh --only release-symbols-self-test` | ❌ created in task | ⬜ pending |
| 57-03-T2 | 03 | 3 | TEL-12 | T-57-10 | `docs/CRASH-POLICY.md` rewritten (public-by-necessity, bounded-by-construction; symbols + stackwalk runbook); collector + Worker gates pin every shared literal | quick | `scripts/verify-platform.sh --only crash-collector && scripts/verify-platform.sh --only crash-submit` | ✅ (rewrite) | ⬜ pending |
| 57-04-T1 | 04 | 4 | TEL-13 | T-57-11, T-57-12 | Retirement flip staged as gated commit: literal removed, ServerURL live, --quick green on reporter-enabled tree; flip executes ONLY at owner checkpoint after Windows ships | quick + manual (owner) | `scripts/verify-platform.sh --quick` (staged tree) then `checkpoint:human-action` | ✅ (gated) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky* — task IDs are filled in once plans exist.

---

## Wave 0 Requirements

- [ ] `scripts/verify-crash-ping-consent.mjs` (or layer-3 extension + consent-pref row) — TEL-09
- [ ] `crashReporterOrigin()` in `scripts/generate.mjs` + `crash-submit-origin` row — TEL-07 derivation
- [ ] `worker/` `POST /submit` handler + `scripts/verify-worker-submit.mjs` (Phase 48 `verify-events-worker.mjs` idiom) — TEL-07 receiver
- [ ] `scripts/verify-release-symbols.mjs` (manifest `symbols_zip` derivation + asset-equality extension) — TEL-12
- [ ] R2 lifecycle configuration (owner dashboard; recorded, not committed as a secret)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Layer-3 reporter-enabled run shows no crash-ping host before consent | TEL-09 | Needs a `--enable-crashreporter` build + 35 s live capture + crash induction | 57-01-T2: reporter-enabled build on the owner machine, fresh profile (no `prefs.js`), trigger a crash, `bash scripts/verify-endpoints.sh --layer 3`; record extracted host set in SUMMARY |
| First Windows release shipped | TEL-13 | Phase 54 artifact + owner decision 9 | Owner confirms the Phase 54 shipped release; then authorizes the 57-04 flip at the checkpoint |
| Worker deploy + R2 lifecycle + rate-limit rule | TEL-07 | Cloudflare dashboard, R2, wrangler deploy are owner actions | Owner runs the wrangler deploy, creates the lifecycle rule (30-day expiry) and the rate-limit rule; pastes the three probe responses (200 / 413 / blocked burst) into the operator record |
| Reporter retirement flip | TEL-13 | Tier-3 rebuild + first-public-release coupling; owner decision 9 | 57-04-T1 checkpoint: owner writes RETIRED, applies the staged flip, rebuilds, re-runs `--quick` + layer-3, records the build |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s (`--quick` rows)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
