---
phase: "41"
slug: "repository-controls-and-github-apps-a"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-21"
---

# Phase 41 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `scripts/verify-platform.sh` registry rows; each script carries its own `--self-test` |
| **Config file** | none — rows are appended to the CHECKS array (quick rows before `if [ "$QUICK" -eq 0 ]`, full rows inside it) |
| **Quick run command** | `scripts/verify-platform.sh --only <label>` (`workflows`, `zizmor`, `repo-controls-self-test`, and their self-tests) |
| **Full suite command** | `scripts/verify-platform.sh --quick`; after the owner checkpoint, `scripts/verify-platform.sh --only repo-controls` |
| **Estimated runtime** | ~70 seconds (`--quick`); `repo-controls` a few seconds of read-only `gh api` |

---

## Sampling Rate

- **After every task commit:** `scripts/verify-platform.sh --quick` after `git add` of new files (the brand scan reads `git ls-files`)
- **After every plan wave:** `--quick` plus each new row's `--self-test`
- **Before `/gsd-verify-work`:** `--quick` green, owner checkpoint done, then `--only repo-controls` green
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 41-01-01 | 01 | 1 | GH-02 | T-41-01, T-41-02 | one control flows body → CONTROLS → live read → dry-run → rows; `--yes` refuses without a terminal | in-memory quick + live read-only | `--only repo-controls-self-test`; dry-run grep; live run names the control with no unreadable line | ❌ new `scripts/verify-repo-controls.mjs`, `scripts/apply-repo-controls.mjs` | ⬜ pending |
| 41-01-02 | 01 | 1 | GH-08, SEC-11, GH-09 | T-41-06, T-41-07 | Actions policy, fork approval, repo flags and zero secrets declared and read back; zero-Releases guard; apply order | in-memory, quick | `--only repo-controls-self-test`; dry-run order (awk) | ❌ same files | ⬜ pending |
| 41-01-03 | 01 | 1 | GH-05, GH-06 | T-41-03, T-41-04, T-41-05 | missing ruleset, approving count, App bypass, owner bypass and installation-id actor go red; tag pattern covers the derived keys and no milestone tag | in-memory, quick | `--only repo-controls-self-test`; dry-run BLOCKED line | ❌ same files | ⬜ pending |
| 41-02-01 | 02 | 2 | GH-07 | T-41-09 | null branch policy on any environment, auto-created environment, missing environment go red; POST not duplicated | in-memory, quick | `--only repo-controls-self-test`; dry-run plans five policy POSTs | ❌ same files | ⬜ pending |
| 41-02-02 | 02 | 2 | GH-10, SEC-06 | T-41-10, T-41-11, T-41-12, T-41-14 | App with Workflows, undeclared App, refused repo-list read, 2FA and owner drift go red | in-memory, quick | `--only repo-controls-self-test`; dry-run owner UI steps | ❌ same files | ⬜ pending |
| 41-02-03 | 02 | 2 | GH-06, GH-02 | T-41-13 | RELEASING.md carries no signature-bound tag claim and names the declared controls | static doc grep | negated grep plus `--only update-channel` | ✅ `docs/RELEASING.md` | ⬜ pending |
| 41-03-01 | 03 | 3 | GH-12, GH-08 | T-41-19, T-41-20 | every `uses:` is a 40-hex SHA admitted by actions-selected.json; admission set equals use | static, quick | `--only workflows` / `--only workflows-self-test` | ❌ new `scripts/verify-workflows.mjs` | ⬜ pending |
| 41-03-02 | 03 | 3 | GH-12 | T-41-15, T-41-16, T-41-17, T-41-18 | event text in run:/prompt:, legion label placement, workflow_run guard, write trio, cache, PR triggers go red | static, quick | `--only workflows-self-test` | ❌ same file | ⬜ pending |
| 41-03-03 | 03 | 3 | AUTO-09, GH-18 | T-41-15, T-41-21 | zizmor offline green on three workflows; planted injection and unpinned uses red; drill workflow under both rows, added in a commit of its own | static, quick | `--only zizmor` / `--only zizmor-self-test` / `--only workflows`; drill commit `git diff-tree --name-status` is one A line | ❌ new `scripts/verify-zizmor.mjs`, `.github/workflows/notify-drill.yml` | ⬜ pending |
| 41-04-01 | 04 | 4 | GH-02 | T-41-22, T-41-31 | every endpoint readable with the owner token before apply; one BLOCKED line (bot App); drill commit adds only notify-drill.yml and origin/main lacks it | live read-only | dry-run BLOCKED count; live run exits 1 with no unreadable line; single-path drill commit and `git cat-file -e origin/main:...` | ✅ | ⬜ pending |
| 41-04-02 | 04 | 4 | GH-02, GH-05..GH-11, SEC-06, SEC-11, GH-18 | T-41-22..T-41-28 | owner applies, probes and drills; names the tap repository; picks DEVICE-FLOW, FALLBACK or KEEP-RED if a list read is refused | manual (owner) | none: blocking-human checkpoint, twelve-field reply | — | ⬜ pending |
| 41-04-03 | 04 | 4 | GH-02, GH-05..GH-10, SEC-06, SEC-11, GH-11, GH-18 | T-41-22, T-41-24, T-41-29, T-41-30 | live state equals declared bodies (DEVICE-FLOW: red only on token-less list reads); self-test green with every remaining plant red after a branch edit; FALLBACK deferral GH10LIST-1 filed in stream deploy or listed unfiled; probes and drills recorded | full (network) | `--only repo-controls-self-test` then `--only repo-controls` | ✅ | ⬜ pending |
| 41-04-04 | 04 | 4 | GH-10 | T-41-29 | DEVICE-FLOW only: owner's run with per-App device-flow user tokens is `repo-controls: PASS`; tokens unset and authorizations revoked | manual (owner) + full (network) | owner runs `--only repo-controls` with the token variables; skipped under 200, FALLBACK or KEEP-RED | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky* — task IDs are filled in once plans exist.

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements (the registry and self-test conventions exist; the new scripts are the deliverables).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Runner-group "selected workflows" probe on Free | GH-11 | needs `admin:org` as org owner | Owner probes as org admin; result recorded in `docs/RELEASING.md` |
| Test assignment and pending deployment reach the phone | GH-18 | phone delivery | Second owner account creates the assignment and dispatches the test deployment; owner records receipt in `docs/RELEASING.md` |
| Recovery codes stored offline for both owners | SEC-06 | physical storage | Owner attests in `docs/RELEASING.md` |
| Live settings applied | GH-02, GH-05..GH-10, SEC-11, SEC-06 | writes to the live org/repo are owner actions | Owner runs the apply script at the checkpoint; then `--only repo-controls` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
