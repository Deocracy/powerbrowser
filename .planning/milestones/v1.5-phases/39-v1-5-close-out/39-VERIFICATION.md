---
phase: 39-v1-5-close-out
verified: 2026-11-07T18:00:00Z
status: human_needed
score: 9/9 must-haves verified (3 by owner-accepted override)
covered_files: [".planning/phases/39-v1-5-close-out/39-01-PLAN.md",".planning/phases/39-v1-5-close-out/39-01-SUMMARY.md",".planning/phases/39-v1-5-close-out/39-02-PLAN.md",".planning/phases/39-v1-5-close-out/39-02-SUMMARY.md",".planning/phases/39-v1-5-close-out/39-03-PLAN.md",".planning/phases/39-v1-5-close-out/39-03-SUMMARY.md",".planning/phases/39-v1-5-close-out/39-04-PLAN.md",".planning/phases/39-v1-5-close-out/39-04-SUMMARY.md",".planning/phases/39-v1-5-close-out/39-05-PLAN.md",".planning/phases/39-v1-5-close-out/39-05-SUMMARY.md",".planning/phases/39-v1-5-close-out/39-06-PLAN.md",".planning/phases/39-v1-5-close-out/39-06-SUMMARY.md",".planning/phases/39-v1-5-close-out/39-07-PLAN.md",".planning/phases/39-v1-5-close-out/39-07-SUMMARY.md",".planning/phases/39-v1-5-close-out/39-08-PLAN.md",".planning/phases/39-v1-5-close-out/39-08-SUMMARY.md",".planning/phases/39-v1-5-close-out/39-09-PLAN.md",".planning/phases/39-v1-5-close-out/39-09-SUMMARY.md",".planning/phases/39-v1-5-close-out/39-10-PLAN.md",".planning/phases/39-v1-5-close-out/39-10-SUMMARY.md",".planning/phases/39-v1-5-close-out/39-11-PLAN.md",".planning/phases/39-v1-5-close-out/39-11-SUMMARY.md",".planning/phases/39-v1-5-close-out/39-12-PLAN.md",".planning/phases/39-v1-5-close-out/39-12-SUMMARY.md",".planning/phases/39-v1-5-close-out/39-13-FIXUPS-SUMMARY.md",".planning/phases/39-v1-5-close-out/39-13-PLAN.md",".planning/phases/39-v1-5-close-out/39-13-SUMMARY.md",".planning/phases/39-v1-5-close-out/39-14-PLAN.md",".planning/phases/39-v1-5-close-out/39-14-SUMMARY.md",".planning/phases/39-v1-5-close-out/39-15-PLAN.md",".planning/phases/39-v1-5-close-out/39-15-SUMMARY.md",".planning/phases/39-v1-5-close-out/39-16-PLAN.md",".planning/phases/39-v1-5-close-out/39-16-SUMMARY.md",".planning/phases/39-v1-5-close-out/39-17-PLAN.md",".planning/phases/39-v1-5-close-out/39-17-SUMMARY.md",".planning/phases/39-v1-5-close-out/39-18-PLAN.md",".planning/phases/39-v1-5-close-out/39-18-SUMMARY.md",".planning/phases/39-v1-5-close-out/39-19-PLAN.md",".planning/phases/39-v1-5-close-out/39-19-SUMMARY.md",".planning/phases/39-v1-5-close-out/39-20-PLAN.md",".planning/phases/39-v1-5-close-out/39-20-SUMMARY.md","patches/050-extension-tab-host.patch","powerbrowser/shell/PowerBrowserAPI.sys.mjs","scripts/verify-ext-tab-host-patch-guards.mjs","scripts/verify-page-furniture-live.mjs","scripts/verify-platform.sh","theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx","theia/extensions/chrome-bar/src/browser/page-context-menu.ts"]
covered_digest: "v3:sha256:4b354d246a9d30bab42016bca7589409e9553df23501e569f970e266a91fba33"
behavior_unverified: 0
overrides_applied: 3
overrides:
  - must_have: "scripts/verify-platform.sh and --gate green with page-furniture-live and its self-test included (scope item 3; goal clause: no green-by-exclusion rows)"
    reason: "--gate is PASS-WITH-EXCLUSIONS at 77e5d037 (456 PASS, 32 FAIL, all 32 excluded under open WINDOWS.md entries 25, 28-43, each with a ROADMAP backlog row). Documented deferral per scope item 7; the eight defect rows were carried to v1.6 by owner ruling 3 (39-20); the release-artifact, live-owner-state and macOS rows are owner/deploy steps. page-furniture-live and its self-test are in the gate and PASS in it."
    accepted_by: "Chris (39-20 ruling 3 for the defect rows; scope item 7 and the caller's brief for the rest)"
    accepted_at: "2026-11-07"
  - must_have: "Every backlog row 999.4-999.16 fixed, none deferred (999.13 leg: all four prompts self-test plants reach their own failure)"
    reason: "999.13 is ticked, but the allow-loads-frame-url plant went red for the wrong reason in 2 of 3 final runs (ledger 39, backlog 999.30). Carried to v1.6 by owner ruling 3."
    accepted_by: "Chris (39-20 ruling 3)"
    accepted_at: "2026-11-07"
  - must_have: "Bookkeeping: REQUIREMENTS.md v1.5 rows delivered ticked; the phase's own requirement list (PROMPT-04, PROMPT-06, PROMPT-08, EXT-05..EXT-10) complete"
    reason: "Chris deferred the 41-item human checklist ('Defer: record all as pending, continue'). 13 requirement rows stay unticked by the stated tick rule (12 re-tick after the checklist; PAGE-05 only after backlog 999.19). Of the phase's own list only EXT-05 is ticked."
    accepted_by: "Chris (39-20 rulings 1 and 2)"
    accepted_at: "2026-11-07"
gaps: []
deferred: []
human_verification:
  - test: "Work 39-HUMAN-CHECKLIST.md (41 items) with /gsd-verify-work 27, 31.1, 32 through 38"
    expected: "Each item answered pass, or described as a problem; verdicts recorded in the UAT rows; the 12 're-tick after' requirements go back to [x]"
    why_human: "Visual/legibility judgments, a KDE portal click, cross-application drags, and 13 backstop truths that only a person or a held-out test can confirm"
---

# Phase 39: v1.5 Close-out Verification Report

**Phase Goal:** Fix every open v1.5 defect and finish the end-of-milestone pass, so v1.5 Chrome Bar Firefox Parity closes with no green-by-exclusion rows (Chris, 2026-11-05).
**Verified:** 2026-11-07
**Status:** human_needed
**Re-verification:** No, initial verification
**Tree:** main at d5c26a9f. Last product/harness code change is 02570bcd (before the gate at 77e5d037); everything after is docs (one line in docs/RELEASING.md).

## Verdict in one paragraph

The work the phase set out to do is in the tree and holds under independent checks: the four product fixes, all 13 backlog rows 999.4-999.16 (one with a flaky leg), patch 050 with its guards and build stamp, the owner-decision rounds, the live UAT passes, and the documentation of everything left over. Two goal clauses are not literally met, and both are owner-accepted: (1) "no green-by-exclusion rows" is unmet, because the final `--gate` is PASS-WITH-EXCLUSIONS with 32 excluded reds; (2) the phase's own requirement list (PROMPT-04/06/08, EXT-06..10) is not ticked, because Chris deferred the human-only checklist. Neither is a hidden failure: both are recorded, keyed to open ledger entries and backlog rows, and ruled on by the owner. Status is `human_needed` because 28 UAT rows are `[pending]` and the checklist is open, not `passed`.

## Goal Achievement

### Observable Truths

| # | Truth (ROADMAP scope item) | Status | Evidence |
|---|----------------------------|--------|----------|
| 1 | Product fixes: C22 tooltip, C23 saved-login popup, C24 Copy Image, C11 dismissal race | VERIFIED | C22: `showTooltip` wraps `getService(dragservice).getCurrentSession()` in try/catch (PowerBrowserAPI.sys.mjs:8274-8277), a real product fix. C23 and C24 were diagnosed as instrument defects (BiDi sets `signon.rememberSignons=false`; headless clipboard keeps only text), with the product proven correct; harness fixed (`rememberSignons` at verify-page-furniture-live.mjs:131, `use-cached-data` at :1813). C11: frontend guard `focusPageIfLatest`/`latestMenuId` (page-context-menu.ts:106-269) plus chrome guard returning `menu-pending` (PowerBrowserAPI.sys.mjs:4280). Plants `stale-dismiss-focus`, `stale-focus-unguarded`, `tooltip-drag-lookup-throws`, `copy-image-html-only`, `login-manager-disabled` all exist and went red in the final gate log (gate.log:5866, 5870; self-test "all 34 planted faults went red", :5960). `page-furniture-live` and `-self-test` PASS in the gate (gate.log:7928). C11 is a behaviour/ordering invariant: behavioural evidence is the live plant pair, read from the gate log, not re-run by me. |
| 2 | Every backlog row 999.4-999.16 fixed, none deferred | VERIFIED (999.13 leg by override) | All 13 rows are `[x]` in ROADMAP with fixing commits (39-02, 05, 06, 08, 09, 12, 04). 999.15/999.16: patch 050 gained the `extensions-late-startup` race in `ExtensionParent._resetStartupPromises` and the policies observer/case arm (patch lines 334-372); `git -C upstream apply --reverse --check` of patch 050 succeeds (tree carries it); `verify-ext-tab-host-patch-guards` PASS incl. G14/G15/G16, self-test PASS with 60 planted faults; `check-patch-surface.sh` PASS; stamp `objdir/.pb-050-build.sha256` = `ebae8968...` equals `sha256sum patches/050-extension-tab-host.patch`; `objdir/dist/bin/modules/ExtensionParent.sys.mjs` symlinks into `upstream/` (no compile needed, per 39-04). Final gate log shows `event-page-wake: PASS` (0 stock windows), `policies-shell-only: PASS`, and plants `startup-promises-rearmed` and `policy-default-prerecorded` red naming their own expect (gate.log:6776-6779, 6886-6892). **999.13 caveat:** ticked fixed, but `allow-loads-frame-url` still goes red on "popup not adopted next to its opener" in 2 of 3 final runs (ledger 39, backlog 999.30). This is the symptom 999.13 named. Owner-carried to v1.6 (override 2). |
| 3 | `verify-platform.sh` and `--gate` green with `page-furniture-live` and its self-test included | VERIFIED (by override 1) | Both rows are in the registry and PASS in the gate. `--gate` verdict (gate.log tail, read directly): `PASS-WITH-EXCLUSIONS -- commit 77e5d037 -- 32 named known-open exclusion(s)`. I counted unique summary lines in that log: 456 PASS, 32 FAIL, 32 `EXCLUDED (known-open)`. **This clause is not met as written** (see Gaps). |
| 4 | Every automatable pending UAT item in 27, 31.1, 32-38 run by Claude and recorded; 32-UAT page-tools PASS; 34-UAT in template shape | VERIFIED | UAT counts (pass/pending/issue): 27 5/2/0, 31.1 3/0/0, 32 4/6/1, 33 6/1/0, 34 13/2/0, 35 16/6/0, 36 17/1/0, 37 35/5/0 (+1 skipped), 38 41/5/0 (+1 skipped). 28 pending + 1 issue. The pending rows are visual/legibility, portal and cross-application items (listed by name above and in the checklist) with captures committed; one exception, 35 T2, is evidenced by the gate and should be closed (Warnings). 34-UAT.md has 15 `### N.` rows with `expected:`/`result:` and frontmatter `status: partial`. 32-UAT line 20 records `page-tools-live` PASS with 20 scenarios at 116ac682. |
| 5 | Owner-decision rows (32 T11; 36 T18; 37 T34-T41; 38 T31-T40) each put to Chris in the box | VERIFIED | I parsed the UAT files: all 20 rows (1 + 1 + 8 + 10) carry an `owner:` line "Chris 2026-11-05/06 via AskUserQuestion: box NN ...". CLAUDE.md rule 5 reads as the approved replacement text (36 T18). The 39-17 rulings (31.1, 34, 35, 27, STOCK_WINDOW_WRAPPERS, 38 T22 deferral) are recorded; `verify-shell-gbrowser-standin --self-test` PASS and `--only shell-gbrowser-standin` PASS with the exemption in place (verify-shell-gbrowser-standin.mjs:681). |
| 6 | Bookkeeping: REQUIREMENTS ticks, ROADMAP boxes 27-38, WINDOWS.md | VERIFIED (requirement completeness by override 3) | ROADMAP lines 123-134 all `[x]` for 27-38; progress rows read "Executed, verification deferred". REQUIREMENTS.md has 41 `[x]` and traceability in step (checked EXT-04/05 Complete, EXT-06..10 and PROMPT-01..09 Pending/Deferred). WINDOWS.md ledger holds 43 entries, 22 open. The Phase 39 box itself is `[ ]` and the plans line says 20/20; left to the orchestrator. |
| 7 | Anything unresolved is a backlog row plus a WINDOWS.md entry with repro, cause-so-far and source; human-only checks in one checklist | VERIFIED | Ledger entries 25, 26, 27, 28, 29, 30-43 each carry repro, cause (or first lead) and source UAT test/registry row in their description (checked by script). Backlog rows 999.17-999.32 exist (ROADMAP lines 847-978); 999.30/999.31 carry `Target: v1.6`. Every one of the 35 `GATE_KNOWN_OPEN_EXCLUSIONS` entries is keyed to a ledger id that is `open` (ledger status read from the JSON block). `39-HUMAN-CHECKLIST.md` exists with 41 `- [ ]` items, derived from the 28 pending rows plus portal, backstop and finding items; header records the deferral. |
| 8 | Goal clause: "no green-by-exclusion rows" | VERIFIED (by override 1), clause unmet | See Gaps, first entry. |
| 9 | Project hard rules not broken by the phase | VERIFIED | `git -C upstream diff` is empty (unstaged); upstream carries only the staged patch stack. Only one file under `powerbrowser/shell/` changed in the phase (`PowerBrowserAPI.sys.mjs`, the boundary file). `check-internals-boundary.sh` PASS and `--catalogue` PASS; `scan-brand-residue` PASS (678 files); `verify-registry-shape` PASS (bridge contract); `check-patch-surface` PASS; no `verify-phase-0N.sh` or sibling driver reintroduced; theia changes are 4 files under `extensions/chrome-bar` (no Theia core). `diff-theia-core.sh` could not run (needs `yarn`, absent outside `nix develop .#theia`), so the Theia-core rule rests on the path list, not on that check. |

**Score:** 9/9 truths verified; 3 of them by owner-accepted override (truths 2, 3/8 and 6). 0 present-but-behaviour-unverified.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `patches/050-extension-tab-host.patch` | 999.15/16 hunks | VERIFIED | Hunks present, reverse-applies to `upstream/`, stamped |
| `scripts/verify-ext-tab-host-patch-guards.mjs` | G14/G15/G16 | VERIFIED | PASS, 60 plants red |
| `scripts/verify-page-furniture-live.mjs` | C11/C22/C23/C24 scenarios + plants | VERIFIED | 34 plants red in gate |
| `scripts/lib/pb-kwin.mjs` | KWin real-input gate | PRESENT | `real-input-gate-self-test` PASS in the full run (not re-run: headed) |
| `39-BASELINE.md` | red list + Final run | VERIFIED | Matches gate.log counts |
| `39-HUMAN-CHECKLIST.md` | single checklist | VERIFIED | 41 items |
| `WINDOWS.md` entries 25-43, ROADMAP 999.17-999.32 | documented residuals | VERIFIED | See truth 7 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `GATE_KNOWN_OPEN_EXCLUSIONS` | WINDOWS.md JSON ledger | `ledger_entry_is_open` | WIRED | All 35 rows resolve to open entries; a fixed entry would turn the row into a gate FAIL |
| patch 050 | objdir stamp | sha256 | WIRED | Equal |
| ExtensionParent / EnterprisePoliciesParent modules | `upstream/` | objdir symlink | WIRED | Why no compile was needed |
| Frontend `focusPageIfLatest` | chrome `webTabFocus` guard | `menu-pending` | WIRED | Two independent guards, each with a plant |

### Behavioral Spot-Checks (run by me, static only)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Patch 050 guards | `scripts/verify-platform.sh --only ext-tab-host-patch-guards` and the script's `--self-test` | PASS; 60 plants red | PASS |
| Gbrowser stand-in incl. STOCK_WINDOW_WRAPPERS | `--only shell-gbrowser-standin`, `node scripts/verify-shell-gbrowser-standin.mjs --self-test` | PASS | PASS |
| Release shape | `--only release-shape` | PASS | PASS |
| Boundary | `check-internals-boundary.sh`, `--catalogue` | PASS | PASS |
| Brand residue / registry shape / patch surface | the three scripts | PASS | PASS |
| Patch applied to upstream | `git -C upstream apply --reverse --check ../patches/050...` | exit 0 | PASS |
| 050 stamp | `cat objdir/.pb-050-build.sha256` vs `sha256sum` | equal | PASS |

I did not re-run the 3.7 h registry or any headed row. Live results (C11, 999.15/16, page-furniture-live, gate counts) are read from `/tmp/nix-shell.75PsxP/pb-39-19/gate.log`, which is outside the repo and will not survive a tmp cleanup; `39-BASELINE.md` quotes the same numbers.

### Requirements Coverage

| Requirement | Source | Status | Evidence |
|-------------|--------|--------|----------|
| EXT-01, EXT-02, EXT-03 (v1.4, in phase header) | 39-19 | SATISFIED | Rows (`extension-pins`, `verify-downstream-fixtures`, `webextensions`, `ng073-declared-extension-loads` and self-tests) PASS in both full runs |
| EXT-04, EXT-05 | 28, 31.1, 39-18 | SATISFIED | Ticked / Complete |
| EXT-06, EXT-07, EXT-08 | 38 | NEEDS HUMAN | 38 T18, T19, T22 pending; ledger 29 keeps `extension-actions-live` red (excluded) |
| EXT-09 | 38 | NEEDS HUMAN | 38 T21 real install click-through pending |
| EXT-10 | 38 | NEEDS HUMAN | Fill proven live on local Vaultwarden (38 T31 pass, `ext10-fill`, `extension-amo-live` PASS); three backstop truths open on the checklist |
| PROMPT-04, PROMPT-06, PROMPT-08 | 35 | NEEDS HUMAN | Live halves pass (C22-C24 fixed or diagnosed); visual rows 35 T4/T12/T13/T15 and backstops E1/E2 open; unticked on purpose |
| PROMPT-01, 02, 05, 07, 09 | 36, 37 | NEEDS HUMAN | Visual rows 36 T17, 37 T28-T32 pending; ledger 39 touches PROMPT-05/09 |
| PROMPT-03 | 999.3 | DEFERRED | Ledger 26; OQ1 ruling; dialog rows skip by derivation |
| PAGE-05 | 32 | BLOCKED (owner-held) | 32 T8 `issue` (libpulse), unticked until 999.19 per Chris 2026-11-07 |
| Orphaned requirements | n/a | none found | |

### Anti-Patterns Found

No debt markers examined in the changed code beyond what the executors already scanned; the phase touched test harnesses and two product files. No blockers found in the product files read (PowerBrowserAPI.sys.mjs guards, page-context-menu.ts guard).

### Human Verification Required

See `39-HUMAN-CHECKLIST.md` (41 items; deferred by Chris 2026-11-07). In summary:

1. **Visual passes** (27 T5, 32 T1-T6, 33 T7, 34 T14, 35 T4/T12-T15, 36 T17, 37 T28-T32, 38 T18-T20): judge captures and the live window on KDE Wayland.
2. **Cross-application and portal** (27 T6, 34 T7, 37 T6): drag from another app; pick the screen in the KDE portal chooser.
3. **Manual flows** (38 T21 install click-through, 38 T22 step 4 known defect).
4. **Backstop truths** (E1/E2 overflow and long text, EXT-10 adjacency/empty/ordering, 37 T39 backstops): only a person or held-out test can confirm.
5. **35 T2**: confirm from the record that the full driver and `--gate` include and pass `page-furniture-live` and its self-test (gate.log:7928), then mark pass.

## Gaps Summary

No unaccepted gaps. Items below are classified; none is a failed truth.

| # | Item | Goal clause unmet | Classification |
|---|------|-------------------|----------------|
| G1 | `--gate` is PASS-WITH-EXCLUSIONS, not PASS: 32 reds excluded (ledger 25, 28-43). Breakdown: 10 release-artifact rows (ledger 30) and 7 live-owner-state rows (31) and 2 macOS rows (32) are owner/deploy steps; `tel06` (33) and `ng089` (35) are environment/owner; 8 defect rows (34, 36-41 and 39) are product-or-harness faults red at every run; 3 are flakes carrying pre-emptive exclusions (28, 42, 43) | "no green-by-exclusion rows"; scope item 3 "--gate green" | **Accepted by owner**: documented per scope item 7; defect rows carried to v1.6 by ruling 3 |
| G2 | 999.13 ticked while its fourth plant (`allow-loads-frame-url`) still reaches the wrong failure 2 of 3 runs | scope item 2 "none deferred" | **Accepted by owner** (ruling 3, ledger 39 / 999.30) |
| G3 | 13 requirement rows unticked, 12 awaiting the human checklist; of the phase's own list (PROMPT-04/06/08, EXT-05..10) only EXT-05 is ticked | phase requirement list | **Accepted by owner** (ruling 1, "Defer"); PAGE-05 held to 999.19 (ruling 2) |
| G4 | 28 UAT rows `[pending]`, 1 `issue` | scope item 4/7 | Human-only by design; this is the `human_needed` status |

### Warnings (not blockers)

- **W1 Bookkeeping contradiction (999.13).** The `[x]` tick overstates the fix. Suggest annotating the 999.13 row with "plant allow-loads-frame-url flaky, see 999.30 / ledger 39".
- **W2 35-UAT T2 left `[pending]`.** The evidence (gate at 77e5d037) exists; the row text itself says the run "is 39-19's". Closing it is a one-line edit and removes one false pending.
- **W3 Exclusion scope is broader than the red.** `extension-actions-live` and its self-test are excluded as whole rows for one failing scenario (`private-access` session 2), so a regression in the row's other scenarios (popup-action, content, page-action: EXT-06..08) would also be excused. In the final gate the other scenarios passed and the 999.15/16 plants went red as expected, but the exclusion would not have caught a regression. The same applies to the three pre-emptive flake exclusions (`page-tools-live`, `ng067-...`, `page-furniture-live-self-test`), which passed in the gate yet are excusable. This is a weakening of the `--gate` against regressions of the very rows the phase fixed.
- **W4 Regressions found, not fixed.** `first-boot-surface-fresh` (TypeError after the side-panel tabs moved to the top, e9569e81), `ng-023` ranking, MIG-04 `start-failure-shows-error`, PAN-04 `pan04-undo-close-group-live`, CUST-01 `verify-customize-inert` and the `site-identity-live` app-menu are red at every run. They belong to earlier milestones' requirements; the owner carried them to v1.6. Worth flagging in the v1.5 release notes.
- **W5 Foreign files in the phase directory.** While I verified, `39-VALIDATION.md` showed as modified and `39-UI-REVIEW.md` as untracked. They are not mine and I did not touch them; the orchestrator should decide whether they belong in the phase commit.
- **W6 I started `page-furniture-live` headless by mistake** (a `--only` run in a command batched with the stand-in self-test). It was killed at once and its stray `powerbrowser` process was terminated; no tracked file changed.
- **W7 Evidence outside the repo.** The gate log and per-row logs live in `/tmp` and are not committed; `39-BASELINE.md` is the durable record.

## Re-tick / resume path

`/gsd-verify-work 27`, `31.1`, `32` through `38` against the checklist; then re-tick the 12 listed requirements (39-20-DECISIONS.md "Re-tick after the checklist"). PAGE-05 re-ticks after 999.19. 999.30 and 999.31 (8 defects) are targeted at v1.6.

---

_Verified: 2026-11-07_
_Verifier: Claude (gsd-verifier)_
