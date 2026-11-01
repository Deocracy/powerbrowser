---
phase: "52"
slug: "claude-fixer-f"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-23"
---

# Phase 52 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `scripts/verify-platform.sh` registry plus per-script `--self-test` (node built-ins, bash) |
| **Config file** | none — rows are the `CHECKS=(` array in `scripts/verify-platform.sh` |
| **Quick run command** | `scripts/verify-platform.sh --only <label>` (and `<label>-self-test`) |
| **Full suite command** | `scripts/verify-platform.sh --quick` |
| **Estimated runtime** | ~60 seconds (`--quick`) |

---

## Sampling Rate

- **After every task commit:** `scripts/verify-platform.sh --only <new label>` and its `-self-test`; `node scripts/scan-brand-residue.mjs` after `git add`
- **After every plan wave:** `scripts/verify-platform.sh --quick`
- **Before `/gsd-verify-work`:** `--quick` green, plus the staged red-branch drill green and the owner `checkpoint:human-action` recorded
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 52-01-T1 | 01 | 1 | FIX-11 | T-52-02 | Deny list is one tracked JSON; registry-derived set derived at gate time | quick | `node scripts/verify-fix-gate.mjs --self-test` | ❌ created in task | ⬜ pending |
| 52-01-T2 | 01 | 1 | FIX-07, FIX-11 | T-52-02 | Green control; every deny entry + hand-edited hunk red naming path | self-test | `scripts/verify-platform.sh --only fix-gate-self-test` | ❌ (row) / ✅ (script) | ⬜ pending |
| 52-01-T3 | 01 | 1 | FIX-02 | T-52-02 | Hand-edited hunk red; write mode never truncates | self-test | `scripts/verify-platform.sh --only patches-regenerated-self-test` | ✅ (extend) | ⬜ pending |
| 52-02-T1 | 02 | 2 | FIX-08 | T-52-01 | Pin commit + Claude Code version + flags asserted; debug var refused | quick + self-test | `scripts/verify-platform.sh --only workflows && scripts/verify-platform.sh --only workflows-self-test` | ✅ (extend) | ⬜ pending |
| 52-02-T2 | 02 | 2 | FIX-09 | T-52-01 | No bare Bash; WebFetch/WebSearch denied; head/actor/bot guards; event text red | self-test | `scripts/verify-platform.sh --only workflows-self-test` | ✅ (extend) | ⬜ pending |
| 52-02-T3 | 02 | 2 | FIX-04 | T-52-03 | Hosted-only fixer jobs; legion label elsewhere red | self-test | `scripts/verify-platform.sh --only workflows-self-test` | ✅ (extend) | ⬜ pending |
| 52-03-T1 | 03 | 3 | TRAIN-06, FIX-01 | T-52-03 | Three classes dispatch; release.yml/folk/external do not; NEEDS_OWNER on 3rd | unit (fixtures) | `node scripts/release-train.mjs derive --self-test` (contract + fixtures land here; full self-test row lands Phase 43/50) | ❌ created in task | ⬜ pending |
| 52-03-T2 | 03 | 3 | FIX-05 | T-52-03 | Gate-rejected attempt counted; spend caps present; concurrency group present | unit (fixtures) + static | `node scripts/release-train.mjs derive --self-test && scripts/verify-platform.sh --only workflows-self-test` | ❌ / ✅ (extend) | ⬜ pending |
| 52-03-T3 | 03 | 3 | FIX-12 | T-52-01 | WIF path recorded; id-token on fix only; fallback key confined to fixer env | static + doc | `scripts/verify-platform.sh --only workflows-self-test && grep -n 'Workload identity federation' docs/RELEASING.md` | ✅ (docs edit) | ⬜ pending |
| 52-04-T1 | 04 | 4 | FIX-03, FIX-06 | T-52-01 | Three jobs; no App token in fix; secretless gate; fix-pr in bot env only; base-branch rules | quick + self-test | `scripts/verify-platform.sh --only workflows && scripts/verify-platform.sh --only workflows-self-test` | ❌ (workflow file) | ⬜ pending |
| 52-04-T2 | 04 | 4 | FIX-03, FIX-09 | T-52-01 | Templated body; labels; assignee; prompt from trusted fields; data-framed untrusted text | unit + static | `node scripts/fix-open-pr.mjs --self-test && scripts/verify-platform.sh --only workflows-self-test` | ❌ created in task | ⬜ pending |
| 52-04-T3 | 04 | 4 | TRAIN-06, FIX-10 | T-52-03 | Staged red branch: chain shape green on fixtures; owner checkpoint lists exact commands | manual (staged drill) + checkpoint | `git checkout -b <staged-red> && <drill per SUMMARY>` (no push, no dispatch) | — | ⬜ pending |
| 52-05-T1 | 05 | 5 | FIX-10, FIX-01..12, TRAIN-06 | — | Live owner proof recorded; real red PR passes fix-gate, owner merges before 2027-05-27 | manual (owner) | `gh run watch <id> --exit-status` + owner reply APPROVE | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `.github/fix-gate-deny.json` — FIX-11 (before the gate script and the workflow file)
- [ ] `scripts/verify-fix-gate.mjs` — FIX-07, FIX-11 (before the registry row and the workflow)
- [ ] `scripts/verify-platform.sh` registry rows — `fix-gate-self-test` (+ `workflows` rule extensions, same commit as the workflow file)
- [ ] `scripts/release-train.mjs` contract + fixtures — TRAIN-06, FIX-01, FIX-05 (NEEDS_OWNER row + dispatch rule + attempt counter; before wiring)
- [ ] `scripts/fixer-prepare.sh` + `scripts/fix-open-pr.mjs` — FIX-06, FIX-09, FIX-03 (before the fixer workflow file references them)
- [ ] `docs/RENEWALS.md` rows — fixer + triage Console workspaces, OIDC/fallback credential, MAR-deadline-adjacent dates (before the live proof)

*Wave 0 order: deny file → gate script → registry row → workflows extensions → fixer workflow; train contract + fixtures → dispatch wiring; owner `checkpoint:human-action` → any live dispatch.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Staged red-branch drill: `fix`→`fix-gate`→`fix-pr` shape on a local red branch | FIX-03, TRAIN-06 | No train exists yet (CONTEXT A2); proves shape without network writes | Plan 52-04 Task 3: staged branch, fixture red, no push, no dispatch; SUMMARY holds the diff + verdicts |
| Live proof on a real red PR, owner merges | FIX-10 | Owner-gated by definition; expected Theia 1.77 red does not exist yet (CONTEXT A3) | Plan 52-05: owner dispatches fixer on the real red PR, fixer PR passes `fix-gate`, owner replies APPROVE + merge SHA before 2027-05-27 |
| Anthropic Console workspace + federation/key, Apps, settings apply | FIX-05, FIX-12, GH-10 | Owner-only account actions | Plan 52-05 `checkpoint:human-action`: exact commands; no agent writes |

*All other phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
