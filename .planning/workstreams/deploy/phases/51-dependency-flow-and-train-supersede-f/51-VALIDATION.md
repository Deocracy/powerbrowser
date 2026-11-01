---
phase: "51"
slug: "dependency-flow-and-train-supersede-f"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-23"
---

# Phase 51 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> 51-RESEARCH.md carries no `## Validation Architecture` section, so this file is
> seeded from the template + the Phase 41 precedent (workflow §5.5 warn-and-continue
> path). Plans must still satisfy the checker's Nyquist dimension.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `scripts/verify-platform.sh` registry rows; each script carries its own `--self-test` |
| **Config file** | none — rows are appended to the CHECKS array (quick rows before `if [ "$QUICK" -eq 0 ]`, full rows inside it) |
| **Quick run command** | `scripts/verify-platform.sh --only <label>` (`renovate-config` if added, `workflows`, `workflows-self-test`, `repo-controls-self-test`, and the assumed `release-train-logic-self-test`) |
| **Full suite command** | `scripts/verify-platform.sh --quick`; live read-backs (`repo-controls`, sweep rows) run only after the owner checkpoint |
| **Estimated runtime** | ~70 seconds (`--quick`); sweep/self-test rows seconds each; the Theia-regen measurement is a one-off timed run, not a gate |

---

## Sampling Rate

- **After every task commit:** `scripts/verify-platform.sh --quick` after `git add` of new files (the brand scan reads `git ls-files`)
- **After every plan wave:** `--quick` plus each new row's `--self-test`
- **Before `/gsd-verify-work`:** `--quick` green, owner checkpoint done, then live rows green
- **Max feedback latency:** 90 seconds (the regen measurement is recorded, not sampled)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 51-01-01 | 01 | 1 | AUTO-02 | T-51-01.. | one grouped `@theia/**` PR (monaco-editor-core separate), pinned, `theia_release` rewritten, `flake.lock` via nix, automerge off, licensing regen in-flow | static, quick | `--only renovate-config` / `--only renovate-config-self-test` (or `--only workflows` if folded in) | ❌ new `.github/renovate.json5` | ⬜ pending |
| 51-01-02 | 01 | 1 | AUTO-02 | T-51-01.. | `renovatebot/github-action` admitted exactly once, used exactly once; hosted-only, no `schedule:`, no cache, no workflow edits (bot App has no Workflows) | static, quick | `--only workflows` / `--only workflows-self-test` | ✅ `.github/settings/actions-selected.json` | ⬜ pending |
| 51-01-03 | 01 | 1 | AUTO-02 | T-51-01.. | Theia-regen wall/RAM/disk measured under `nix develop .#theia`; `runs-on` + `timeout-minutes` recorded from the measurement (flag F closure) | timed run | `nix develop .#theia --command bash -c 'cd theia && time yarn install --frozen-lockfile'` + `node scripts/generate-licensing.mjs` | ✅ `theia/yarn.lock` | ⬜ pending |
| 51-02-01 | 02 | 1 | AUTO-03 | T-51-10.. | weekly grouped actions PR keeps SHA pins with plain `# vX.Y.Z` comments; npm security-only on `/theia`, version updates off, no automerge | static, quick | `--only workflows` (dependabot.yml keeps the tree green) | ❌ new `.github/dependabot.yml` | ⬜ pending |
| 51-02-02 | 02 | 1 | AUTO-03 | T-51-10.. | alerts + default-setup desired state declared in new settings bodies, read back by new CONTROLS entries; self-test plants each go red naming the path | in-memory, quick | `--only repo-controls-self-test` | ❌ new `.github/settings/<code-security>.json` | ⬜ pending |
| 51-03-01 | 03 | 2 | TRAIN-04 | T-51-20.. | `SUPERSEDED` terminal, chemspill-first derive ordering, pending-`release`-deployment cancel, sign-job newer-Release exit; one fixture per new state, state list derived from the table, set equality | static (fixtures) | assumed `release-train-logic-self-test` over fixture JSON + `--only workflows` | ❌ assumed `scripts/release-train.mjs` (extend) | ⬜ pending |
| 51-04-01 | 04 | 3 | TRAIN-11 | T-51-30.. | six sweep rows render ok/red/no-data (Codeberg no-data until Phase 53); comment + mention + assign only on red transition; one red plant → exactly one comment | static (fixtures) | assumed sweep self-test | ❌ assumed sweep renderer (extend) | ⬜ pending |
| 51-04-02 | 04 | 3 | DIST-05, UPS-02 | T-51-30.. | RELEASING.md states two-week cadence + npm-advisory path/response (stale "four weeks" gone from all three surfaces); RENEWALS.md carries Node 24 Maintenance-end 2028-04-30 | static doc grep | `grep -q` positive + negated stale-text grep | ✅ `docs/RELEASING.md` / ❌ assumed `docs/RENEWALS.md` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky* — task IDs follow the plan files once they land.

---

## Wave 0 Requirements

- [ ] Assumed Phase 43 artifacts exist (`scripts/release-train.mjs` with DETECTED→BUMP_PR_GREEN, `release-train-logic-self-test`, `release-train.yml`, scheduler Worker) — else plans 51-01/51-03 stop with the missing premise recorded, never redefine.
- [ ] Assumed Phase 48 sweep renderer + TRAIN-07 pinned issue exist — else plan 51-04 stops with the missing premise recorded.
- [ ] Assumed Phase 50 states + `release.yml` sign-publish exist — else plan 51-03's guard has no target.
- [ ] Assumed Phase 42 `docs/RENEWALS.md` shape exists — else plan 51-04's UPS-02 row waits on it.
- [ ] Phase 41 bodies + `repo-controls`/`workflows`/`zizmor` rows exist as built in 41-01–41-03 — else plans 51-01/51-02 stop with the missing premise recorded.

*Existing infrastructure covers everything else (registry, self-test conventions, CONTROLS/admission patterns).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Re-resolve `renovatebot/github-action` SHA + dispatch Renovate on the first tick after a last-Thursday Theia release | AUTO-02 | live dispatch + first Theia-minor PR merge | Owner runs the exact `gh api` + dispatch commands the plan ends with; merges the grouped PR (automerge off) |
| Merge the first grouped Dependabot PR | AUTO-03 | weekly owner merge is the steady state | Owner merges; records any compound-comment staleness |
| Enable CodeQL default setup + Dependabot alerts; apply new settings bodies | AUTO-03 | live org/repo writes are owner actions | Owner applies at the checkpoint; then `--only repo-controls` |
| Supersede cancel + sign-exit on a real newer-ESR detection | TRAIN-04 | needs a real newer tag while a train is open | First real overlap after Phase 50: old train shows SUPERSEDED, pending deployment cancelled, new train starts |
| Sweep rows read live state (runner, alerts, Codeberg) | TRAIN-11 | network reads, owner-scoped tokens | After the checkpoint: sweep re-render names each row ok/red/no-data |
| Key rotation / credential rows if any new secret is added | UPS-02 | physical/secret custody | Default: none (bot App token reused) — any addition lands in `docs/RENEWALS.md` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
