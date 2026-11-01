---
phase: "42"
slug: "community-surface-and-release-documentation-a"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-22"
---

# Phase 42 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `scripts/verify-platform.sh` registry rows; each script carries its own `--self-test` |
| **Config file** | none — rows are appended to the CHECKS array (quick rows before `if [ "$QUICK" -eq 0 ]`, full rows inside it) |
| **Quick run command** | `scripts/verify-platform.sh --only <label>` (`labels`, `renewals`, and their self-tests) |
| **Full suite command** | `scripts/verify-platform.sh --quick`; after the owner checkpoint, `scripts/verify-platform.sh --only repo-controls` |
| **Estimated runtime** | ~70 seconds (`--quick`); `repo-controls` a few seconds of read-only `gh api` |

---

## Sampling Rate

- **After every task commit:** `scripts/verify-platform.sh --only <new label>` and its `-self-test`; `node scripts/scan-brand-residue.mjs` after `git add`
- **After every plan wave:** `scripts/verify-platform.sh --quick`
- **Before `/gsd-verify-work`:** `--quick` green, owner checkpoint done, then `--only repo-controls` green
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

*Seeded by plan-phase §5.5. Task rows are filled after the planner writes the PLAN.md files (plan numbers, threat refs and exact automated commands come from the plans). Requirement → row mapping (from 42-RESEARCH.md §Validation Architecture):*

| Requirement | Row(s) | Type |
|-------------|--------|------|
| GH-13 (live set) | `repo-controls` + `repo-controls-self-test` (extended `labels` control) | full-tier read-back + in-memory self-test |
| GH-13 (agreement) | `labels` + `labels-self-test` | static quick |
| GH-01 | `labels` agreement + form-shape assertion + owner form preview | static quick + manual |
| GH-14 | presence + copy-rule assertion (full UPD-32 shape test deferred to Phase 46) | static quick |
| DOC-03 | doc greps (no "four weeks" remains; ESR 175 dates present; 24h queued-job text present) | static quick |
| DOC-04 | `renewals` + `renewals-self-test` | static quick |
| DOC-05 | doc greps (no ephemeral-runner/PAT text; non-ephemeral shape + App-key inventory + `main` policy + runbook present) | static quick |
| DOC-06 | reconciliation record (S2/S3/S8 SUPERSEDED-or-CURRENT) | review artifact |

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 42-01-01 | 01 | 1 | GH-13 | T-42-01, T-42-04 | one label control flows body → CONTROLS → live read → dry-run owner steps → both rows; threshold `gh auth status` lists `repo` + `read:org`; colors never decide | full-tier read-only + in-memory quick | `scripts/verify-platform.sh --only repo-controls-self-test && node scripts/apply-repo-controls.mjs \| grep -F 'PUT repos/DeBIOS-Foundation/powerbrowser/actions/permissions' && { out="$(node scripts/verify-repo-controls.mjs 2>&1)"; printf '%s\n' "$out"; printf '%s\n' "$out" \| grep -q 'labels' && ! printf '%s\n' "$out" \| grep -q 'could not be read'; } && scripts/verify-platform.sh --quick` | ❌ new `.github/settings/labels.json`, MOD `scripts/verify-repo-controls.mjs` | ⬜ pending |
| 42-01-02 | 01 | 1 | GH-13 | T-42-01, T-42-02, T-42-03 | extra/missing label red naming it, color-only drift green, case-duplicate red, empty array red, throwing getter red; dry-run create-before-delete order | in-memory quick | `scripts/verify-platform.sh --only repo-controls-self-test && node scripts/apply-repo-controls.mjs \| tee /dev/stderr \| awk '/gh label create/{c=NR} /gh label delete/{d=NR} END{exit !(c && d && c<d)}' && scripts/verify-platform.sh --quick` | ❌ same files | ⬜ pending |
| 42-02-01 | 02 | 2 | GH-13, GH-01 | T-42-05, T-42-06, T-42-08 | every form + workflow writer label ∈ declared set; `blank_issues_enabled:false` + contact-links presence; vacuity guard; runner labels never satisfy | static quick | `scripts/verify-platform.sh --only labels && scripts/verify-platform.sh --only labels-self-test && scripts/verify-platform.sh --quick` | ❌ new `scripts/verify-labels.mjs`, MOD `scripts/verify-platform.sh` | ⬜ pending |
| 42-02-02 | 02 | 2 | GH-01 | T-42-07 | bug.yml labels + frozen ids version/os/install_format; feature.yml parallel; config.yml blank-off + Discussions + security links; no internal identifiers | static quick + brand scan | `scripts/verify-platform.sh --only labels && scripts/verify-platform.sh --only labels-self-test && scripts/verify-platform.sh --quick` | ❌ new `.github/ISSUE_TEMPLATE/bug.yml`, `feature.yml`, `config.yml` | ⬜ pending |
| 42-03-01 | 03 | 3 | DOC-04 | T-42-10 | every RENEWALS row carries date + owner action; no `Date.now`, no fetch; dateless/actionless/unparseable plants red; duplicates collide red | static quick | `scripts/verify-platform.sh --only renewals && scripts/verify-platform.sh --only renewals-self-test && scripts/verify-platform.sh --quick` | ❌ new `docs/RENEWALS.md`, `scripts/verify-renewals.mjs`, MOD `scripts/verify-platform.sh` | ⬜ pending |
| 42-03-02 | 03 | 3 | GH-14 | T-42-09, T-42-11 | six health files exist; SECURITY.md names private-first + security@ + latest-only + window; copy-rule gate rejects pref/host-port/sentinel tokens; brand scan green | static quick + brand scan | `test -f SECURITY.md && test -f SUPPORT.md && test -f docs/KNOWN-ISSUES.md && test -f org-github/SECURITY.md && test -f org-github/CONTRIBUTING.md && test -f org-github/CODE_OF_CONDUCT.md && grep -q 'security@powerbrowser.org' SECURITY.md && grep -q 'PowerBrowser' SUPPORT.md && node scripts/scan-brand-residue.mjs && scripts/verify-platform.sh --quick` | ❌ new `SECURITY.md`, `SUPPORT.md`, `docs/KNOWN-ISSUES.md`, `org-github/` × 3 | ⬜ pending |
| 42-03-03 | 03 | 3 | DOC-06 | T-42-10 | S2/S3/S8 each SUPERSEDED-or-CURRENT with landed fact or surviving action; drafts directory untouched | review artifact | `test -f 42-RECONCILIATION.md && grep -q SUPERSEDED && grep -q CURRENT && git status --porcelain .planning/drafts/distribution/` empty | ❌ new `42-RECONCILIATION.md` | ⬜ pending |
| 42-04-01 | 04 | 4 | DOC-03, DOC-05 | T-42-12 | two-week cadence in RELEASING + README with stale four-week gone; ESR 175 dates current; 24h cancellation; no PAT-file/ephemeral text; descriptor App-token present; main policy kept | static doc grep | `grep -q 'every two weeks' docs/RELEASING.md && grep -q 'every two weeks' README.md && ! grep -q 'roughly every four weeks' docs/RELEASING.md README.md && grep -q '24-hour' docs/RELEASING.md && ! grep -q 'github-runner-pat' docs/RELEASING.md && ! grep -q 'ephemeral = true' docs/RELEASING.md` | ✅ `docs/RELEASING.md`, `README.md` | ⬜ pending |
| 42-04-02 | 04 | 4 | GH-13, GH-01, GH-14, DOC-04, DOC-06 | T-42-13, T-42-14 | owner applies labels, creates repos, verifies Discussions, runs live read-back, previews forms; executor performs no live write | manual (owner) | none: blocking-human checkpoint, quoted PASS line + repo list + preview confirmations in SUMMARY | — | ⬜ pending |
| 42-04-03 | 04 | 4 | DOC-03, DOC-05 | T-42-12 | checkpoint outcome recorded in RELEASING.md; full quick suite green after owner steps; no stale literal remains | static + quick | `scripts/verify-platform.sh --only labels && scripts/verify-platform.sh --only labels-self-test && scripts/verify-platform.sh --only renewals && scripts/verify-platform.sh --only renewals-self-test && scripts/verify-platform.sh --quick` | ✅ `docs/RELEASING.md` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements (the registry and self-test conventions exist; the CONTROLS/`planWrites` table, js-yaml reach-in, and `gh` auth all exist). The new rows/scripts are the deliverables.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Label apply (`gh label create --force` loop + deletions) | GH-13 | writes to the live org/repo are owner actions | Owner runs the loop at the checkpoint; then `--only repo-controls` |
| Org `.github` repo creation if absent | GH-14 | repo creation is an owner action | `gh repo create DeBIOS-Foundation/.github --public` (empty), content by PR |
| Discussions enabled check | GH-01 | UI/org setting | Verify `has_discussions` live before landing `config.yml` links |
| `powerbrowser-updates`/tap creation if Phase 41 has not | GH-10 | repo creation is an owner action | Create per Phase 41 checkpoint; verify live |
| Form preview URLs render | GH-01 | visual preview | Owner opens each form preview at the checkpoint |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
