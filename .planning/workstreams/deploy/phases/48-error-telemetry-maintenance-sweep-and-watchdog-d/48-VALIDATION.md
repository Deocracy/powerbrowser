---
phase: "48"
slug: "error-telemetry-maintenance-sweep-and-watchdog-d"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-23"
---

# Phase 48 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `scripts/verify-platform.sh` registry rows; each script carries its own `--self-test` |
| **Config file** | none — rows are appended to the CHECKS array (quick rows before `if [ "$QUICK" -eq 0 ]`, full rows inside it) |
| **Quick run command** | `scripts/verify-platform.sh --only <label>` (`telemetry`, `events-worker`, `release-train-maintenance-self-test`, `watchdog-self-test`, and their self-tests) |
| **Full suite command** | `scripts/verify-platform.sh --quick`; full-tier rows (`tel06-error-delivery-live`, sweep live render, watchdog live drill) after the owner checkpoint |
| **Estimated runtime** | ~70 seconds (`--quick`); live rows need a built binary, a deployed Worker, and owner-run GitHub/network |

---

## Sampling Rate

- **After every task commit:** `scripts/verify-platform.sh --only <new label>` and its `-self-test`; `node scripts/scan-brand-residue.mjs` after `git add` (brand scan iterates `git ls-files`)
- **After every plan wave:** `--quick` plus each new row's `--self-test`
- **Before `/gsd-verify-work`:** `--quick` green, owner checkpoint done (`checkpoint:human-action` with D1 id, Worker deploy, rate-limit record, pinned-issue creation, watchdog file applied), then the owner-run live rows green
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 48-01-T1 | 01 | 1 | TEL-06 | T-48-01, T-48-02, T-48-07 | Enrichment module is the one site for version/buildID/OS; admitted set ⊆ allowed; exact TEL-06 description; sender compiles, suite green | static + unit, quick | `scripts/verify-platform.sh --only telemetry && scripts/verify-platform.sh --only telemetry-self-test` | ❌ new `telemetry-enrichment.ts`, edits | ⬜ pending |
| 48-01-T2 | 01 | 1 | TEL-06 | T-48-01, T-48-02 | Stated endpoint + level off; Gecko server pref blank; allowlist `manifest: telemetry.endpoint` row present; `/privacy` strings handed identical to TEL-08 | static, quick | `scripts/verify-platform.sh --only theia-endpoints && scripts/verify-platform.sh --only allowlist-schema` | ✅ (edits) | ⬜ pending |
| 48-02-T1 | 02 | 2 | TEL-10 | T-48-04, T-48-05, T-48-06, T-48-10 | Worker importable under plain node; accepted POST writes one D1 row per admitted event, no client id, no unadmitted prop; caps/retention derived both sides | contract gate, quick | `scripts/verify-platform.sh --only events-worker && scripts/verify-platform.sh --only events-worker-self-test` | ❌ new `worker/events-worker.mjs`, `worker/wrangler.toml`, `scripts/verify-events-worker.mjs` | ⬜ pending |
| 48-02-T2 | 02 | 2 | TEL-11 | T-48-10 | Authed route: unauthenticated POST → 401, valid POST → D1 upsert; sweep holds no Cloudflare token | contract + static, quick | same `events-worker` gate (authed half) + sweep-job token scan | ❌ same Worker + gate | ⬜ pending |
| 48-03-T1 | 03 | 3 | TRAIN-07 | T-48-09, T-48-11, T-48-14 | Sweep `derive/next/render` over fixtures incl. all six rows + no-data branches; red-row plant → exactly one comment; staying-red → zero new comments | logic self-test, quick | `scripts/verify-platform.sh --only release-train-maintenance-self-test` | ❌ extend `scripts/release-train.mjs` (Phase 43 file) | ⬜ pending |
| 48-03-T2 | 03 | 3 | TRAIN-07 | T-48-11, T-48-12 | Sweep jobs keep trust boundary: no `schedule:`, hosted labels, `issues: write` only on `report`, SHA-pinned admitted `uses:`, guarded `workflow_run`, no event text | static, quick | `scripts/verify-platform.sh --only workflows && scripts/verify-platform.sh --only workflows-self-test && scripts/verify-platform.sh --only zizmor` | ✅ (Phase 43 file edits) | ⬜ pending |
| 48-04-T1 | 04 | 4 | TEL-06 | T-48-16, T-48-17 | Loopback live delivery: one POST from running sidecar with `{type, basename, line, column, version, buildID, OS}`, no message/stack/path/URL; zero requests at off in same run; source + bundle restored | full (build+browser) + quick (analyzer) | `scripts/verify-platform.sh --only tel06-error-delivery-live && scripts/verify-platform.sh --only tel06-error-delivery-live-self-test` | ❌ new `scripts/verify-telemetry-live-delivery.mjs` | ⬜ pending |
| 48-04-T2 | 04 | 4 | MON-01 | T-48-13, T-48-18 | Watchdog fixture: 25 h → no issue, 27 h → one issue in own repo with run link; product repo gains no `schedule:` | fixture + static, quick | watchdog self-test + `scripts/verify-platform.sh --only workflows` | ❌ watchdog source built here | ⬜ pending |
| 48-05-T1 | 05 | 5 | TEL-06, TEL-10, TEL-11, TRAIN-07, MON-01 | T-48-19, T-48-20, T-48-21, T-48-22 | Owner checkpoint: D1 created, schema applied, Worker deployed, rate-limit rule recorded verbatim, pinned issue created, watchdog applied; live rows run green | manual (owner) + live | owner-record greps + live `events-worker`, sweep render, synthetic POST, 26-h drill | — (owner state) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky* — task IDs are filled in once plans exist.

---

## Wave 0 Requirements

- [ ] `theia/extensions/telemetry/src/browser/telemetry-enrichment.ts` — TEL-06 (admitted keys + version/buildID/OS derivation, one site)
- [ ] `worker/events-worker.mjs` + `worker/wrangler.toml` — TEL-10/TEL-11 (zero-dep Worker + D1 binding + deploy runbook)
- [ ] `scripts/verify-events-worker.mjs` — TEL-10/TEL-11 (contract gate + `--self-test`, one fault per rule)
- [ ] `scripts/verify-telemetry-live-delivery.mjs` — TEL-06 (loopback drill + analyzer `--self-test`)
- [ ] `scripts/release-train.mjs` maintenance extension — TRAIN-07 (Phase 43 file; plans pin assumed names and re-verify)
- [ ] `powerbrowser-updates` watchdog workflow source — MON-01 (built here, applied there by owner)
- [ ] `docs/RENEWALS.md` rows (bot-env secret + Worker secret) + `docs/PRIVACY.md` strings (Phase 47-owned; Phase 48 hands exact text) — TEL-08/TEL-11 agreement
- [ ] Existing infrastructure covers everything else (registry convention, `workflows`/`zizmor`/`theia-endpoints`/`telemetry` rows, `scan-brand-residue`, crash-collector idiom)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cloudflare writes (D1 create, schema apply, Worker deploy, rate-limit rule) recorded verbatim | TEL-10, TEL-11 | Wrangler deploy + dashboard rule need the owner account | 48-05-T1 `checkpoint:human-action`: owner runs the exact commands, pastes D1 id, wrangler version, rule threshold + period, synthetic POST/413/burst responses into the operator record |
| Live synthetic `/events` POST returns 2xx and lands one D1 row; over-cap → 413; burst → blocked | TEL-10 | Needs the deployed Worker + network from outside the account | Same checkpoint: owner probes from a machine outside the Cloudflare account and pastes all three responses verbatim |
| Stopping the Worker cron for 26 h opens an issue in `powerbrowser-updates` | MON-01 | 26-hour wait + owner cron control | Owner disables scheduler dispatches, waits 26 h, observes the watchdog issue, re-enables; record dates in SUMMARY |
| First live sweep values (runner-online, channel-liveness, download-count) | TRAIN-07 | Needs legion runner + first Release (Phases 49/50) | Deferred by design: rows render no-data now; live values are Phase 50 criterion 5, not a Phase 48 gate |
| Pinned maintenance issue created + daily render observed | TRAIN-07 | Needs App/owner token on GitHub | Owner creates/pins the issue at the checkpoint; report job PATCHes it; body-equals-render + comment-only-on-red proven by self-test before the checkpoint |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
