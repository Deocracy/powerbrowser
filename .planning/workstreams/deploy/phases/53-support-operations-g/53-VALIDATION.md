---
phase: "53"
slug: "support-operations-g"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-23"
---

# Phase 53 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `scripts/verify-platform.sh` registry plus per-script `--self-test` (node built-ins, bash) |
| **Config file** | none — rows are the `CHECKS=(` array in `scripts/verify-platform.sh` |
| **Quick run command** | `scripts/verify-platform.sh --only <label>` (new `triage-workflow`, `bug-report-affordance`, `codeberg-mirror`, `upptime-config`, `releasing-support-ops`, and their `-self-test` siblings) |
| **Full suite command** | `scripts/verify-platform.sh --quick`; after the owner checkpoint, full-tier live halves (`codeberg-mirror-live`, `upptime-sweep-live`, `repo-controls`) |
| **Estimated runtime** | ~70 seconds (`--quick`); full-tier rows a few seconds of read-only `gh api` / unauthenticated Codeberg GET |

---

## Sampling Rate

- **After every task commit:** `scripts/verify-platform.sh --quick` after `git add` of new files (the brand scan reads `git ls-files`)
- **After every plan wave:** `--quick` plus each new row's `--self-test`
- **Before `/gsd-verify-work`:** `--quick` green, owner checkpoint done, then the live halves green
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 53-01-01 | 01 | 1 | TEL-05 | T-53-01, T-53-02 | prefill params ⊆ bug.yml field ids; diagnostics never in URL; user-initiated github.com | quick (static) | `--only bug-report-affordance`; `--only bug-report-affordance-self-test`; `--only endpoint-dispositions-self-test` | ❌ new row + contribution | ⬜ pending |
| 53-01-02 | 01 | 1 | GH-03 | T-53-03, T-53-04, T-53-05 | triage shape asserted before first landing (fresh-derive green against fixture, not against unlanded file) | quick (static) | `--only triage-workflow` (fixture mode) + `--only triage-workflow-self-test` + `--only workflows` | ❌ new `scripts/verify-triage.mjs` + fixture | ⬜ pending |
| 53-02-01 | 02 | 2 | GH-03 | T-53-03 | triage.yml declared exactly (issues opened, triage env, Haiku, pins, no event text, never closes) | quick (static) | `--only triage-workflow` (tree mode) + `--only workflows` + `--only zizmor` | ❌ new `.github/workflows/triage.yml` | ⬜ pending |
| 53-02-02 | 02 | 2 | GH-03, GH-16 | T-53-06 | planted-instruction issue yields template comment only; Concert spend scope recorded | self-test + manual | `triage-workflow-self-test` plant run + `checkpoint:human-action` workspace attestation | ❌ same files | ⬜ pending |
| 53-03-01 | 03 | 2 | GH-04 | T-53-07, T-53-08 | timer unit valid; no secret in repo; SHA-compare fixture lag red | quick (fixture) + structural | `--only codeberg-mirror` + `--only codeberg-mirror-self-test` | ❌ new timer unit + row | ⬜ pending |
| 53-03-02 | 03 | 2 | MON-02 | T-53-09 | Upptime target set equals {updates host, website, /events}; sweep reports enabled + last-run age | quick (fixture) + full (network) | `--only upptime-config` + `--only upptime-config-self-test`; live `--only upptime-sweep-live` after checkpoint | ❌ new Upptime shape + row | ⬜ pending |
| 53-04-01 | 04 | 3 | GH-17 | T-53-10 | window text states acknowledgement window; private-reporting flag on; drill reaches phone | static + manual (owner) | negated grep for window text + `repo-controls` flags + `checkpoint:human-action` drill proof | ✅ `SECURITY.md` assumed (Phase 42) | ⬜ pending |
| 53-04-02 | 04 | 3 | DOC-07 | T-53-11 | support-operations section agrees with automation by derivation | quick (static) | `--only releasing-support-ops` + `--only releasing-support-ops-self-test` | ❌ edit `docs/RELEASING.md` | ⬜ pending |
| 53-04-03 | 04 | 3 | GH-03, GH-04, MON-02, TEL-05, GH-17, DOC-07, GH-16 | all | owner lands workflow, proves phone paths, fills RENEWALS; live halves green | manual (owner) + full | `checkpoint:human-action` twelve-field reply; `--only repo-controls` + `-live` rows green after | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky* — task IDs are filled in once plans exist.

---

## Wave 0 Requirements

- [ ] `scripts/verify-triage.mjs` (or widen `scripts/verify-workflows.mjs`) — `triage-workflow` row + `--self-test`: good-fixture green; plants for missing `issues: opened`, wrong/missing env, non-Haiku model, missing `allowed_non_write_users`, widened `issues: write`, missing concurrency group, tag-object pin, `show_full_output: true`, bare `Bash`, `ACTIONS_STEP_DEBUG`, event text in `prompt:`, close-issue step
- [ ] `bug-report-affordance` registry row — TEL-05: prefill param set ⊆ `bug.yml` field ids (read-and-fail-closed if Phase 42 forms absent), origin/path vs manifest, diagnostics-in-URL plant red
- [ ] `codeberg-mirror` + `codeberg-mirror-live` rows — GH-04: fixture lag red naming the mirror; live SHA compare
- [ ] `upptime-config` + `upptime-sweep-live` rows — MON-02: target-set equality over tracked Upptime shape; enabled/last-run-age live report
- [ ] `releasing-support-ops` row — DOC-07: derivation gate per `releasing-maintenance` precedent (removed trigger, renamed job, deleted template each red)
- [ ] Triage/Codeberg RENEWALS rows — GH-16/GH-04 dates in `docs/RENEWALS.md` structure, covered by DOC-04 `renewals` pattern

Existing infrastructure covers the rest: `workflows` + `-self-test`, `zizmor` + `-self-test`, `repo-controls` + `-self-test`, `endpoint-dispositions-self-test`, `allowlist-schema`, `scan-brand-residue`.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Triage workspace spend limit + key scoping/OIDC outcome | GH-16, FIX-12 | Anthropic Console has no CI-readable API from here | Owner creates the triage workspace with a monthly limit, records the limit + OIDC-or-key outcome in `docs/RELEASING.md`; RENEWALS row carries the key date |
| Private vulnerability report reaches the phone within the window | GH-17 | Phone delivery + GitHub private-reporting UI (carried-unresearched route) | Owner files one private report (or test equivalent) from the second account; confirms the push arrives; records timing vs the `SECURITY.md` window |
| security@ test message reaches the phone within the window | GH-17 | Mail routing (Phase 47) + phone delivery | Owner sends one test message to security@; confirms arrival; records timing |
| Codeberg account, mirror repo, deploy token; timer applied via `nrs` | GH-04 | Owner account + legion `/etc/nixos` | Owner creates account/repo/token, applies the timer unit, records the first push SHA |
| Upptime repo + `status` CNAME | MON-02 | Owner repo creation + Cloudflare DNS | Owner creates the repo from the Upptime template, adds the CNAME, records the live GET |
| Live mirror lag + Upptime liveness rows green | GH-04, MON-02 | Need the live mirror and status host | After the checkpoint: `--only codeberg-mirror-live`, `--only upptime-sweep-live` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
