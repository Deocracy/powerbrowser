---
phase: "65"
slug: "orca-workspace-in-theia"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-10"
---

# Phase 65 — Validation Strategy

> Per-phase validation contract. Derived from 65-RESEARCH.md "Validation Architecture" and the five plans. Nothing here needs a human (D-18); human items wait for the end-of-milestone pass (65-CONTEXT "Deferred Verification").
> Phase 65 executes after Phase 64 merges. The Phase 64 rows named below (`orca-pane-*`, `orca-tabs-live`) are those of the Phase 64 plans committed at 545ad293 (contract C12), reconciled on the merged tree by 65-05's prelaunch step; a lane that finds a Phase 64 file under another name records a path substitution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node 24 scripts registered as rows in `scripts/verify-platform.sh` (each with a `--self-test` row) |
| **Config file** | none (registry rows; quick anchor = immediately before `"allowlist-schema|check_allowlist_schema"`, full anchor = immediately before the `)` closing the full-tier array after the last Orca row; lane order 65-02, 65-03, 65-04) |
| **Quick run command** | `scripts/verify-platform.sh --only <label>` |
| **Full suite command** | `scripts/verify-platform.sh --quick`; live rows as `env $(compgen -e \| grep '^ORCA_' \| sed 's/^/-u /') flock /home/chris/coding/Power-Browser/.git/pb-live.lock scripts/verify-platform.sh --only <label>` |
| **Estimated runtime** | ~420 seconds for `--quick`; each live row 1-4 minutes |

---

## Sampling Rate

- **After every task commit:** the lane's quick rows via `--only`, plus `node scripts/scan-brand-residue.mjs` after staging
- **After every lane merge (65-05):** that lane's quick rows; `--quick` after the last merge against the pre-merge baseline
- **Before `/gsd-verify-work`:** `--quick` green; then under the live lock, in order: `orca-pane-css-live` (P64-15: first), `orca-pane-standalone-live`, `orca-workspace-live`, `orca-side-panel-live`, `orca-add-project-live`, `orca-offer-scan`, `orca-relaunch-restore-live`, `verify-uri-roundtrip`, `gui07-mode-switch-tabs-live`, `orca-tabs-live`; full rows `orca-pane-entry`, `orca-overlay-built`, `orca-build-shape`, `diff-theia-core`, `verify-endpoints`
- **Max feedback latency:** 420 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 65-01-T1 | 01 | 1 | TAB-07, TAB-05 | T-65-03 | new kinds are overlay files only; check-details without Orca's editor | full (live gate) | `build-orca.sh` log lines; `node scripts/verify-orca-pane-standalone-live.mjs --report .mozbuild/p65-01/mount-gate.json --width-probe settings` under the lock | ✅ (Phase 64 row, extended) | ⬜ pending |
| 65-01-T2 | 01 | 1 | TAB-08, TAB-05 | T-65-01, T-65-02 | session-only preset before init; refuses to connect otherwise; LS runtime key absent after a marker control | full (live) | `--only orca-pane-standalone-live` (API, session-only and resume-modal clauses) | ✅ (extended) | ⬜ pending |
| 65-01-T3 | 01 | 1 | TAB-05, TAB-07 | T-65-03 | no EditorPanel/EditorContent in the bundle; preset export present at the pin; consumer API ⊆ entry exports | full + quick self-test | `--only orca-pane-entry`, `--only orca-pane-entry-self-test`, `--only orca-pane-css-live-self-test`, `--only orca-overlay`, `--only orca-overlay-built` | ✅ (extended) | ⬜ pending |
| 65-02-T1 | 02 | 1 | TAB-05 | — | N/A | quick | `--only orca-editor-routes`, `--only orca-editor-routes-self-test` (plants: added mode, diff source, conflict kind, top-level view; EditorPanel value; check-details as a Theia kind; zero-member parse) | ❌ W0 | ⬜ pending |
| 65-02-T2 | 02 | 1 | TAB-05 | T-65-04, T-65-05, T-65-06 | spec grammar, toplevel root, execFile argv with `--`, no textconv, fsmonitor off, GIT_* stripped, size cap | quick | `--only orca-git-spec-self-test` (plants: `..`, `.`, empty segment, leading `/` and `./`, backslash, NUL, `HEAD`, upper-case hex, 39 hex, `:4`, `-x`, subdirectory root; hermetic bytes equal `git cat-file blob`) | ❌ W0 | ⬜ pending |
| 65-02-T3 | 02 | 1 | TAB-05 | T-65-07, T-65-08 | dirty editors never closed; only PB-owned roots removed; user removal honoured | quick self-test + full | `--only orca-workspace-live-self-test`; `--only orca-workspace-live` (coordinator) | ❌ W0 | ⬜ pending |
| 65-03-T1 | 03 | 1 | TAB-07 | — | N/A | quick | `--only gui07-mode-toggle-commands`, `--only gui04-registry-shape` | ✅ | ⬜ pending |
| 65-03-T2 | 03 | 1 | TAB-09, TAB-07 | T-65-10 | no PB Add-project control | quick | `--only orca-no-pb-add-project`, `--only orca-no-pb-add-project-self-test` (plants: command label, toolbar item, chrome-bar title, empty vocabulary; control: at least one orca-panes command label parsed) | ❌ W0 | ⬜ pending |
| 65-03-T3 | 03 | 1 | TAB-07, TAB-09 | T-65-09, T-65-11 | unlisted egress red after a `.invalid` resolution control; Add-project equal to the stock standalone page | quick self-test + full | `--only orca-side-panel-live-self-test`, `--only orca-add-project-live-self-test`; `--only orca-side-panel-live`, `--only orca-add-project-live`, `--only verify-uri-roundtrip` (coordinator) | ❌ W0 | ⬜ pending |
| 65-04-T1 | 04 | 1 | TAB-08 | T-65-13 | names never reissued while referenced | quick | `--only gui04-registry-shape`, `--only orca-pane-routes-self-test`; builds of modes and orca-panes | ✅ | ⬜ pending |
| 65-04-T2 | 04 | 1 | TAB-05 | — | N/A | quick | `--only orca-pane-routes`, `--only orca-pane-routes-self-test` (route table ↔ pinned content types; words ↔ docs/URI-SCHEMES.md) | ✅ (Phase 64 row) | ⬜ pending |
| 65-04-T3 | 04 | 1 | TAB-08 | T-65-12, T-65-14, T-65-15 | offer in no sink; needles never printed; device rows counted, never read | quick self-test + full | `--only orca-offer-scan-self-test`, `--only orca-relaunch-restore-live-self-test`; `--only orca-offer-scan`, `--only orca-relaunch-restore-live` (coordinator) | ❌ W0 | ⬜ pending |
| 65-05-T1 | 05 | 2 | all | T-65-16, T-65-17 | merge scope derived from plan frontmatter | full (live) | `--only orca-pane-css-live`, `--only orca-pane-standalone-live`, `--only orca-workspace-live` under the lock | n/a | ⬜ pending |
| 65-05-T3 | 05 | 2 | all | T-65-18 | brand and allowlist values only from measurement | quick + full (live) | the remaining live rows; `scan-brand-residue` and its self-test; `--quick` | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Phase 64 merged and its contract rows C64-1..C64-8 reconciled (65-05 prelaunch)
- [ ] P65-04 mount gate: every new kind on the standalone page and under Route A, two attempts, providers and imports, Settings width (65-01 Task 1, the first live task)
- [ ] CA-12 fixture: `orca worktree list --json` hostId values from a scratch data root (65-01 Task 1)
- [ ] `scripts/verify-orca-editor-routes.mjs` (with `--git-spec-self-test`), `scripts/verify-orca-workspace-live.mjs`, `scripts/verify-orca-no-pb-add-project.mjs`, `scripts/verify-orca-side-panel-live.mjs`, `scripts/verify-orca-add-project-live.mjs`, `scripts/lib/orca-offer-scan.mjs` + `scripts/verify-orca-offer-scan.mjs`, `scripts/verify-orca-relaunch-restore-live.mjs`, each with `--self-test` and exit 2 plus a `Next step:` line on an unknown argument
- [ ] Registry blocks `# NEW (65-02, …)`, `# NEW (65-03, …)`, `# NEW (65-04, …)` at both anchors
- [ ] Brand rows re-measured by the coordinator on the staged merged tree

---

## Manual-Only Verifications

All phase behaviors have automated verification. The items below are deferred to the end-of-milestone pass by D-18 and run no check here:

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Orca's sidebar, Settings, Agents view and right sidebar look and behave as in Orca at the side panel's default width | TAB-07 | Computed-value counts prove isolation, not visual parity | End-of-milestone pass; Settings width measured by 65-01 |
| Orca's Add-project dialog is usable in the Theia document (typing, browsing, clone) | TAB-09 | Interaction check | End-of-milestone pass |
| A diff and a merge opened from Orca's source-control panel read correctly in Theia's diff and merge editors | TAB-05 | Visual check | End-of-milestone pass |
| After a real quit and relaunch, a restored Setup feels connected with no step | TAB-08 | Timing and appearance | End-of-milestone pass |
| Owner items P65-01, P65-06, P65-09, P65-17, CA-07 | all | Owner decisions | End-of-milestone pass (CA-07 to Phase 67) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 420s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
