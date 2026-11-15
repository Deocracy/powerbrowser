---
phase: "64"
slug: "orca-panes-as-powerbrowser-tabs"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-11-10"
---

# Phase 64 — Validation Strategy

> Per-phase validation contract. Derived from 64-RESEARCH.md "Validation Architecture", amended by the D-31 picks P64-30..P64-36 and the lane cut of the plans (64-01..64-04 lanes, 64-05 coordinator). Nothing here needs a human (D-18); the visual and owner items are in 64-CONTEXT "Deferred Verification" and 64-05's deferred list.
>
> Rows of the research map that are not built after D-31: the `paneKey` clause of `verify-orca-pty-bridge` (no Phase 63 bridge), the `o<n>` seed of the mode-switch walk (Orca terminals are hosted `pb-orca:term<n>` tabs), the remote-terminal clause (TERM-03 is v2, A1).
>
> Auto-mode ruling recorded here (Open Question 4): `orca-pane-css-live` keeps "0 changed" strict for every element property value in both directions and replaces the raw `html|class` and `html|style-attribute-length` keys with the derived clause of 64-01 Task 3 (classes added to `<html>` and inline properties added or changed on it are custom properties read by no Theia rule, after a planted Theia reader is detected in the same session). Chris may override it in the end-of-milestone pass.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node 24 scripts registered as rows in `scripts/verify-platform.sh` |
| **Config file** | none (registry rows; quick anchor after the Phase 63 rows that follow `orca-service-live-self-test`; full anchor after the Phase 63 rows that follow `orca-service-live`; one `# NEW (64-0N, …)` block per lane per anchor it uses, in the order 64-01, 64-02, 64-04, after any `# NEW (68-0N, …)` block at the same anchor; 64-03 adds no row; files shared with Phase 68 merge function by function, 64-05 merge rule (6) and 68-06 merge rule (2d)) |
| **Quick run command** | `scripts/verify-platform.sh --only <label>` |
| **Full suite command** | `scripts/verify-platform.sh --quick` (about 7 minutes); live rows as `flock /home/chris/coding/Power-Browser/.git/pb-live.lock env $(env \| sed -n 's/^\(ORCA_[A-Za-z0-9_]*\)=.*/-u \1/p') MOZ_PURGE_CACHES=1 scripts/verify-platform.sh --only <live label>` |
| **Estimated runtime** | ~420 seconds for `--quick`; the Orca pane build ~2-4 minutes on a warm store; each live row 1-5 minutes |

---

## Sampling Rate

- **After every task commit:** the task's `<verify>` commands (the lane's quick rows via `--only`, the lane's in-lane live rows under the lock), plus `node scripts/scan-brand-residue.mjs` after staging
- **At each lane's wrap-up (64-01 T3, 64-02 T3, 64-03 T2, 64-04 T3):** the lane diff against `git merge-base HEAD ServerDestroyer/v1.7-Orca-integration` lists only that plan's `files_modified`, and `scan-brand-residue.mjs --report .mozbuild/p64-0N/brand-report.md` is copied into the SUMMARY without editing `inventory/brand-tokens.json`
- **After every plan wave:** `scripts/verify-platform.sh --quick` against the pre-merge baseline recorded in 64-05-SUMMARY.md, and the per-merge `--only` lists of 64-05 Task 1 step (4)
- **Before `/gsd-verify-work`:** `--quick` green against the baseline; after the wiring, the Orca rebuild (pane bundle), the Theia audited install and rebuild and `./mach build faster`, under the live lock with inherited `ORCA_*` unset and caches purged, in this order: `orca-pane-css-live` (real-widget mode, P64-15), `orca-pane-entry`, `orca-pane-css`, `orca-overlay-built`, `orca-build-shape`, `orca-pane-standalone-live`, `orca-tabs-live`, `orca-terminal-keys-live`, `verify-uri-roundtrip.mjs --scheme pb-orca`, `gui07-mode-switch-tabs-live`, `orca-service-live`
- **Max feedback latency:** 420 seconds for quick rows; live rows are per task, not per edit

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 64-bundle | 01 | 1 | TAB-04, TAB-06, TERM-01 | T-64-02, T-64-03 | no tracked Orca edit; no React copy in the bundle; no seam; no Theia dependency in the Orca build | full | `nix develop .#orca --command bash scripts/build-orca.sh` with `theia/node_modules` moved aside (log: overlay copied ×2, `build-orca-panes: PASS`); `build-orca-panes.sh --standalone` React marker ≥ 1 before the `pb-panes/` count of 0; `build-orca-panes.sh` with no nested Nix shell and no GNU find format option; `--only orca-overlay`, `--only orca-overlay-built` | ✅ | ✅ green (live record, not re-run: static-only audit) |
| 64-typecheck | 01 | 1 | TAB-04 | — | overlay sources typed against Orca's own types | full | `pnpm run typecheck:web` in `orca/` inside `nix develop .#orca`, once in-lane (64-01 T3) | n/a | ✅ green (live record, not re-run: static-only audit) |
| 64-isolated | 01 | 1 | TERM-01 (D-15, P64-32) | — | N/A | full (live) | `orca-pane-standalone-live` stage 0, run first: two leaves of one split tab, one root each, one xterm each, input reaches only its own PTY, handle count unchanged; on failure an `OWNER-ITEM: P64-32` line | ✅ | ✅ green (live record, not re-run: static-only audit) |
| 64-standalone | 01 | 1 | TAB-06 (criterion 3) | — | N/A | full (live) + quick self-test | `--only orca-pane-standalone-live` (planted throwing child first, then every hosted kind), `--only orca-pane-standalone-live-self-test` | ✅ | self-test ✅ green (static re-run 2026-11-14); live ✅ green (live record, not re-run: static-only audit) |
| 64-entry | 01 | 1 | TAB-04 (spike conditions 3, 4) | T-64-02, T-64-03 | React identity; no inlined assets; no tab-bar import | full + quick self-test | `--only orca-pane-entry` (tracked status, marker 0 after the standalone variant's ≥ 1, React major.minor against Theia's when Theia is installed (a named SKIP for that clause otherwise), inlined asset names, entry imports, C3 exports), `--only orca-pane-entry-self-test` | ✅ | ✅ green (static re-run 2026-11-14) |
| 64-css-static | 01 | 1 | TAB-04 (condition 1) | T-64-01 | no Orca rule outside the scope; no keyframe or root property collision | full + quick self-test | `--only orca-pane-css` (built sheet against Theia's built CSS), `--only orca-pane-css-self-test` (fixtures) | ✅ | self-test ✅ green (static re-run 2026-11-14); check SKIP here (no built Theia CSS in the main tree) |
| 64-css-live | 01, 05 | 1, 2 | TAB-04 (condition 1, P64-15) | T-64-01 | Theia and pane values unchanged; html writes unread by Theia | full (live) + quick self-test | `--only orca-pane-css-live` (lane-build mode in 64-01; real-widget mode first on the merged tree in 64-05), `--only orca-pane-css-live-self-test` | ✅ | self-test ✅ green (static re-run 2026-11-14); live ✅ green (live record, not re-run: static-only audit) |
| 64-handoff | 02 | 1 | TAB-04 (P64-06, P64-07) | T-64-06, T-64-07, T-64-08, T-64-09 | private-file reads; path containment; route behind the token gate | quick (inline) | `yarn --cwd extensions/orca-panes build` + the Node run of `privateDirVerdict`, `privateFileVerdict`, `resolveInside` (64-02 T1 verify); `bash scripts/diff-theia-core.sh` | ✅ | ✅ green (live record, not re-run: static-only audit) |
| 64-widgets | 02 | 1 | TAB-02, TAB-04, TAB-06 | T-64-10 | close goes through Orca's confirmation | quick (inline) | the Node run of `planPanes`, `mintName`, `placementFor`, `orcaPaneUriOf` (64-02 T2 verify); `--only gui04-registry-shape` | ✅ | ✅ green (static re-run 2026-11-14) |
| 64-routes | 02 | 1 | TAB-02, TAB-04 (criterion 4) | T-64-11 | no client-side terminal creation (A4) | quick | `--only orca-pane-routes`, `--only orca-pane-routes-self-test` (plants: added and removed content type, unknown target, pending without requirement, doc word drift both ways, bundle API member missing, hand-off key mismatch, table kind without observer branch, creation-module import, C3 module key differing from orca-tabs-live.mjs, empty union) | ✅ | ✅ green (static re-run 2026-11-14) |
| 64-mode | 03 | 1 | TAB-01 (criterion 1) | T-64-15 | no activation hook on the switch path | quick + full (live) | `--only gui07-mode-toggle-commands` (with the dress clause), `--only gui07-mode-toggle-commands-self-test`, `--only gui07-mode-switch-tabs-invariant`; `verify-mode-switch-tabs-live.mjs` with the Orca hop derived | ✅ (edit) | ✅ green (static re-run 2026-11-14) |
| 64-offer | 03 | 1 | TAB-04 (P64-07) | T-64-13, T-64-14 | offer only in the 0600 file; never in log, state or diagnostics | quick | `--only orca-service` (scenarios I (hand-off files) and I-b named in its PASS line without asserting the full list, cross-lane literal clauses), `--only orca-service-self-test` (plants: offer in log, before ready, in state, bundle folder absent, not removed) | ✅ (edit) | ✅ green (static re-run 2026-11-14) |
| 64-keys | 04 | 1 | TERM-04 (criterion 7) | — | Theia terminals keep PowerBrowser's bindings | quick | `--only orca-terminal-keys`, `--only orca-terminal-keys-self-test` (fixture orca-panes tree) | ✅ | ✅ green (static re-run 2026-11-14) |
| 64-keys-live | 04, 05 | 1, 2 | TERM-04 (criterion 7) | T-64-17 | N/A | full (live) + quick self-test | `--only orca-terminal-keys-live` (control in t<n> and a web tab first; hosted Orca terminal stage on the merged tree), `--only orca-terminal-keys-live-self-test` | ✅ | self-test ✅ green (static re-run 2026-11-14); live ✅ green (live record, not re-run: static-only audit) |
| 64-tabs-live | 04, 05 | 1, 2 | TAB-04, TAB-06, TERM-01 (criteria 2, 3, 6) | T-64-06, T-64-07, T-64-08, T-64-16 | route refuses without the cookie and outside the folder; offer contained; Orca's close confirmation honoured | full (live) + quick self-test | `--only orca-tabs-live` (stages a-m, including e2 PB-side split and g2 Orca tab groups as Lumino splits), `--only orca-tabs-live-self-test` | ✅ | self-test ✅ green (static re-run 2026-11-14); live green except stage g2/g3 (WINDOWS 55, owner pass) |
| 64-roundtrip | 04, 05 | 1, 2 | TAB-02 (criterion 5) | — | N/A | full (live) | `node scripts/verify-uri-roundtrip.mjs --scheme pb-orca` (uriOf equals the input; one widget per name; empty path; stale name) | ✅ (edit) | ✅ green (live record, not re-run: static-only audit) |
| 64-mode-seeds | 04, 05 | 1, 2 | TAB-04 (criterion 2: moves between modes) | — | N/A | full (live) + quick self-test | `--only gui07-mode-switch-tabs-live` (a hosted chat and a hosted terminal seeded after the snapshots), `--only gui07-mode-switch-tabs-live-self-test` | ✅ (edit) | ✅ green (live record, not re-run: static-only audit) |
| 64-coord | 05 | 2 | all | T-64-19..T-64-22 | merged by full ref, scope-checked; brand rows measured | quick + live | `--quick` against the baseline; the builds; the live order above; `node scripts/scan-brand-residue.mjs` and `--self-test` | n/a | ✅ green (live record, not re-run: static-only audit) |
| 64-groups | validation | — | TAB-04 (criterion 2: tab groups as Lumino splits) | — | N/A | quick + self-test | `--only orca-pane-groups`, `--only orca-pane-groups-self-test` (paneRecords' group branch taken from pb-pane-mount.tsx by AST on four two-group layouts, fed to planPanes; plants: group branch dropped, row direction swapped, split side inverted, same group as split, paneRecords renamed, placement ignored) | ✅ | ✅ green (added 2026-11-14) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] The overlay entry, Vite config and scoping pass compiled by `scripts/build-orca-panes.sh` (64-01 T1, T3) before any row that reads the bundle
- [x] `scripts/lib/orca-pane-harness.mjs` (from the spike's `measure.mjs`, `page-routes.mjs` and `p64-probe/probe-64.mjs`, with A9's scope-aware rule counter and the control planted on a property that differs nowhere in the baseline) and the standalone variant of the bundle (`build-orca-panes.sh --standalone`, React bundled; also the two-copy control)
- [x] The lane-build React hand-off for 64-01's in-lane CSS measure (one line appended to the git-ignored `src-gen/frontend/index.js`, `git diff --name-only -- theia` empty)
- [x] `scripts/lib/orca-tabs-live.mjs` with the stub agent written into a scratch directory at run time (Open Question 3)
- [x] The portal probe (an Orca tooltip and an Orca dialog opened in the pane) and the derived html clause's probe sheet in `verify-orca-pane-css-live.mjs`
- [x] New scripts each with `--self-test`: `verify-orca-pane-entry.mjs`, `verify-orca-pane-standalone-live.mjs`, `verify-orca-pane-css.mjs`, `verify-orca-pane-css-live.mjs`, `verify-orca-pane-routes.mjs`, `verify-orca-terminal-keys.mjs`, `verify-orca-terminal-keys-live.mjs`, `verify-orca-tabs-live.mjs`
- [x] Extended: `verify-mode-toggle-commands.mjs` (dress clause, anchors derived from the clean sources), `verify-orca-service.mjs` (scenario I), `verify-uri-roundtrip.mjs` (pb-orca rows), `verify-mode-switch-tabs-live.mjs` (Orca seeds)
- [x] orca-panes wired into `theia/package.json` and the browser app by the coordinator (64-05 T1), before any merged-tree live row
- [x] Brand rows re-measured by the coordinator after the lanes merge
- [x] Re-run after the chrome edits: `shell-error-copy-no-internals`, `internals-boundary`, `internals-catalogue`, `ng-040-internals-catalogue-lines`, `start-path-recovery`, `orca-bridge-dir`, `orca-service-live`

---

## Manual-Only Verifications

Every behavior has an automated row except the TAB-04 cross-client group stage (orca-tabs-live g2/g3, WINDOWS 55), which is red and owner-routed (see the audit section). The items that need eyes (the hosted chat's look against Orca's own, Orca's close confirmation readable with working buttons, the EXT-02 placeholder pane's look) and the owner items (T-61-04, P64-05, P64-18, the Open Question 4 ruling, the in-session key control of P64-33, any `OWNER-ITEM: P64-32` line) run in the end-of-milestone pass (59-CONTEXT D-18) and do not gate this phase's automated rows. Overrides of the auto-mode picks P64-01..P64-29 are Chris's at any time.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 420s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-11-14 by the Nyquist audit (static rows re-run; live rows taken from their recorded runs, see the audit section).

---

## Validation Audit 2026-11-14

| Metric | Count |
|--------|-------|
| Gaps found | 2 |
| Resolved | 1 |
| Escalated | 1 (known red, owner/manual) |

Gap 1 (resolved): 64-VERIFICATION asked for "a pure fixture test for paneRecords' group branch plus planPanes/placementFor". orca-pane-routes already held seven planPanes placement fixtures (P65-36). Before this audit nothing exercised the overlay's group branch. The new `scripts/verify-orca-pane-groups.mjs` (rows `orca-pane-groups`, `orca-pane-groups-self-test`) takes leavesOf, groupLeavesOf, neighboursIn and paneRecords out of `pb-pane-mount.tsx` by name, runs them on four two-group layouts (horizontal and vertical, each group order) and feeds the records to planPanes. The second group's new pane must be planned as the Lumino split the layout gives. The self-test has 6 plants, each red naming the drift. PASS.

Gap 2 (escalated, not papered over): orca-tabs-live stage g2/g3 (tab-groups-cross-client) is red on every tree since Phase 64 (WINDOWS 55). The open question is whether the pinned orcad publishes one client's group layout to another client's store. Only a live two-client run can answer it, so it stays manual/owner in the end-of-milestone pass. The new static check proves only PB's side of the mapping. TAB-04 remains Pending.

Static rows re-run at f6e2cab5: orca-pane-entry, orca-pane-entry-self-test, orca-pane-standalone-live-self-test, orca-pane-css-self-test, orca-pane-css-live-self-test, orca-pane-routes(-self-test), orca-terminal-keys(-self-test), orca-terminal-keys-live-self-test, orca-tabs-live-self-test, gui07-mode-toggle-commands(-self-test), gui07-mode-switch-tabs-invariant, gui04-registry-shape, orca-service(-self-test), orca-overlay: all PASS. orca-pane-css: SKIP (no built Theia frontend CSS in the main tree). Live rows were not re-run, because the live lock was held.

Manual-only, with reasons:
- orca-tabs-live g2/g3: needs two live web clients on the pinned orcad (WINDOWS 55; owner may override the group clause)
- the hosted chat's look against Orca's own, and Orca's close confirmation (readable, working buttons): both need a person to look
- busy-chat close confirmation: needs a running agent turn
- the EXT-02 wrapper pane as a hosted tab: needs EXT-01 (the extension running on Theia)
- the owner items T-61-04, P64-05, P64-18, Open Question 4, P64-33's in-session key control, any `OWNER-ITEM: P64-32`, and the 64-06 key-policy items: owner rulings, not checks
