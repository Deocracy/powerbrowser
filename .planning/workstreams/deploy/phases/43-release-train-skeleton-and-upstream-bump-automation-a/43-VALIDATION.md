---
phase: "43"
slug: "release-train-skeleton-and-upstream-bump-automation-a"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-22"
---

# Phase 43 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `scripts/verify-platform.sh` registry rows; each script carries its own `--self-test` |
| **Config file** | none — rows are appended to the CHECKS array (quick rows after `zizmor-self-test`, full rows untouched) |
| **Quick run command** | `scripts/verify-platform.sh --only <label>` (`detect-upstreams-self-test`, `release-train-logic-self-test`, `workflows`, `workflows-self-test`) |
| **Full suite command** | `scripts/verify-platform.sh --quick`; the calendar exit test closes TRAIN-03/AUTO-06 |
| **Estimated runtime** | ~70 seconds (`--quick`); the calendar exit test is date-bound, not time-bound |

---

## Sampling Rate

- **After every task commit:** `scripts/verify-platform.sh --quick` after `git add` of new files (the brand scan reads `git ls-files`)
- **After every plan wave:** `--quick` plus each new row's `--self-test`
- **Before `/gsd-verify-work`:** `--quick` green, owner checkpoint done, then the calendar exit test (153.7 on 2026-11-10, else 153.8 on 2026-11-24) closes the train
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 43-01-01 | 01 | 1 | AUTO-01 | T-43-01, T-43-02 | tag mapping + pinned-major guard from fixtures incl. 175→153.23; no network | fixture, quick | `--only detect-upstreams-self-test` (ESR half) | ❌ new `scripts/detect-upstreams.mjs` | ⬜ pending |
| 43-01-02 | 01 | 1 | TRAIN-03, TRAIN-09 | T-43-03 | 5 Phase-A states exported; one fixture per state, set-equal; no network | fixture, quick | `--only release-train-logic-self-test` (state half) | ❌ new `scripts/release-train.mjs` | ⬜ pending |
| 43-01-03 | 01 | 1 | AUTO-01, TRAIN-09 | T-43-03 | both rows registered after `zizmor-self-test`; green baseline then plants | quick | `--only detect-upstreams-self-test && --only release-train-logic-self-test && --quick` | ❌ `scripts/verify-platform.sh` rows | ⬜ pending |
| 43-02-01 | 02 | 2 | TRAIN-01 | T-43-04, T-43-05, T-43-06 | triggers/concurrency/guards/input validation/dry-run threading on the skeleton | static, quick | `--only workflows` / `--only workflows-self-test` | ❌ new `.github/workflows/release-train.yml` | ⬜ pending |
| 43-02-02 | 02 | 2 | TRAIN-08 | T-43-06 | every write step gated by `dry-run`; ungated write red naming job+step | static, quick | `--only workflows-self-test` (dry-run plants) | ❌ `scripts/verify-workflows.mjs` rule | ⬜ pending |
| 43-02-03 | 02 | 2 | AUTO-06 | T-43-08 | `outputs.stage` added to rebase workflow; no tag default; Nix-wrapped steps | static, quick | `--only verify-upstream-pins` + `--only workflows` | ✅ `.github/workflows/rebase-upstream.yml` (edit) | ⬜ pending |
| 43-03-01 | 03 | 3 | TRAIN-02, AUTO-07 | T-43-09, T-43-10 | exactly-one tracking issue; PATCH-iff-differ; lock/close/reopen; gate-only mention | fixture, quick | `--only release-train-logic-self-test` (render plants) | ❌ `scripts/release-train.mjs` (extend) | ⬜ pending |
| 43-03-02 | 03 | 3 | TRAIN-09 | T-43-09, T-43-11 | 5 plants red naming drift: unchanged-pin merge, draft Release, fork-head run, duplicate issue, 175.x guard | fixture, quick | `--only release-train-logic-self-test` (full) | ❌ same file | ⬜ pending |
| 43-03-03 | 03 | 3 | AUTO-07 | T-43-12 | conflict issue exactly-one with log+diff, assigned owner, never edits patch | fixture, quick | `--only release-train-logic-self-test` (conflict plants) | ❌ same file | ⬜ pending |
| 43-04-01 | 04 | 4 | AUTO-06 | T-43-19 | bump via `workflow_call` read-only; `bump-pr` App-token PR without click; never touches workflows | static + calendar | `--only workflows` now; exit test on calendar | ❌ workflow wiring | ⬜ pending |
| 43-04-02 | 04 | 4 | AUTO-04 | T-43-13 | Node 24 selection + SHASUMS parse from fixtures; in-job gpgv path | fixture, quick | `--only detect-upstreams-self-test` (Node half) | ❌ `scripts/detect-upstreams.mjs` (extend) | ⬜ pending |
| 43-04-03 | 04 | 4 | AUTO-04 | T-43-13 | manual gpg paragraph removed; `sha256sum -c` stays; Node-major agreement green | static, quick | `--only node-major-agreement` + grep | ✅ `docs/BUILD.md` (edit) | ⬜ pending |
| 43-05-01 | 05 | 5 | INF-03 | T-43-14, T-43-15 | clock-only scaffold (~40 lines); JWT CPU measured + recorded; contract in workflow | scaffold + docs | docs grep + scaffold review | ❌ scaffold (own repo) | ⬜ pending |
| 43-05-02 | 05 | 5 | INF-03, TRAIN-01..09, AUTO-01..07, AUTO-04 | T-43-16 | owner checkpoint lists every account/repo/App/secret/calendar step; dry-run proven | manual (owner) | none: blocking-human checkpoint, resume reply | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky* — task IDs are filled in once plans exist.

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements (the registry, the self-test conventions, and the analog harnesses `verify-release-identity.mjs`, `verify-upstream-pins.mjs`, `verify-workflows.mjs` exist; the new scripts and the new workflow are the deliverables).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| RS256 JWT-mint CPU vs 10 ms Free limit | INF-03 | Needs a deployed workers.dev tick with the real key | Plan 43-05: deploy scaffold to workers.dev, read the mint timing, record median/p95 + verdict + fallback in `docs/RELEASING.md` |
| `chore/esr-<tag>` bot PR runs `verify.yml` without an approval click | AUTO-06 | Needs a real App-token PR | Calendar exit test: first post-landing 153 point release (153.7 on 2026-11-10, else 153.8) arrives as a bot PR; record the run link |
| Exactly one tracking issue per release key, owner dispatched nothing | TRAIN-02, TRAIN-03 | Needs the calendar release + GitHub facts | Same run: tick-only dispatches, `return_run_details` linkage, locked issue rendered from facts |
| Cloudflare account + scheduler repo + clock-App key secret | INF-03 | Owner UI / secret storage | Owner creates the account (2FA), the repo, the App, and stores the PKCS#8 key as a Worker secret at the checkpoint |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
