---
phase: "39"
slug: "v1-5-close-out"
status: validated
nyquist_compliant: false
wave_0_complete: true
created: "2026-11-05"
---

# Phase 39 — Validation Strategy

> Phase 39 added no new test framework. Its checks are registry rows in `scripts/verify-platform.sh`, each with a `--self-test` that plants faults and must go red. This audit maps each plan task to those rows.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `scripts/verify-platform.sh` check registry; rows with `--self-test` variants that plant faults and must go red. No jest/pytest. |
| **Config file** | none; registry is the array in `scripts/verify-platform.sh`; open exclusions in `GATE_KNOWN_OPEN_EXCLUSIONS` keyed to `.planning/WINDOWS.md` |
| **Quick run command** | `scripts/verify-platform.sh --quick` (static gate, no build/browser/display) |
| **Single check** | `scripts/verify-platform.sh --only <label>` |
| **Full suite command** | `scripts/verify-platform.sh`; `--gate` adds the WINDOWS.md known-open exclusions |
| **Estimated runtime** | `--quick` ~180 s; full ~13400 s (~3.7 h). Last run 2026-11-06/07 at 77e5d037: 456 PASS, 32 FAIL, all excluded under open ledger entries |

Live rows run the built binary headless over BiDi. Some headed rows need the KWin gate (`real-input-gate-self-test`, `PB_LIVE_HEADED=1`, `PB_REAL_INPUT=1`).

---

## Sampling Rate

- **After every task commit:** `scripts/verify-platform.sh --quick`
- **After every plan wave:** `--only <label>` for each live row the plan touched, plus its `-self-test`
- **Before `/gsd-verify-work`:** `scripts/verify-platform.sh --gate` is PASS or PASS-WITH-EXCLUSIONS
- **Max feedback latency:** ~180 s (quick); live rows minutes each

---

## Per-Task Verification Map

Status: COVERED = row plus plant exists and SUMMARY shows green. PARTIAL = row exists but is excluded or flaky (ledger id cited), or the headed branch has no row. MANUAL = documentation, owner decision or human-only item, listed in Manual-Only below.

| Task | Requirement | Behavior | Type | Row / command / plant | Status |
|------|-------------|----------|------|-----------------------|--------|
| 01-1 | PROMPT-04/06/08 | Known tree state, 34-UAT.md template shape | doc | inline `node -e` shape check, no registry row | MANUAL |
| 01-2 | PROMPT-04/06/08 | Real-input gate refuses wrong window class and empty read-back; C24 bisect | self-test | `--only real-input-gate-self-test` (plants class-mismatch, readback-empty) | COVERED |
| 01-3 | PROMPT-04/06/08 | Baseline full run, classified red list | doc | inline `node -e` check of 39-BASELINE.md | MANUAL |
| 02-1 | PROMPT-04 | C11 stale dismissal never moves focus | live | `--scenario context-menu` + `page-furniture-live`; plant: deferred stale render. `--only page-furniture-live` (PASS) + `-self-test` (plants; flaky, ledger 43) | PARTIAL (ledger 43) |
| 02-2 | PROMPT-04 | C11 UAT evidence and backlog tick | doc | inline grep/`uat.cjs` check | MANUAL |
| 03-1 | EXT-05..10 | Batch A1 owner rulings (checkpoint) | owner | none (blocking-human decision) | MANUAL |
| 03-2 | EXT-05..10 | Batch A2 owner rulings (checkpoint) | owner | none (blocking-human decision) | MANUAL |
| 03-3 | EXT-05..10 | Rulings recorded in UAT files | doc | inline loop check over 32/33/36/37/38-UAT.md | MANUAL |
| 04-1 | EXT-03/05/08 | Event pages wake with no stock window; policies shell-only | live | `verify-extension-actions-live.mjs --scenario event-page-wake,policies-shell-only` (red-first, then green); `extension-actions-live` excluded, ledger 29 (private-access, other scenario) | PARTIAL (ledger 29) |
| 04-2 | EXT-03/05/08 | Patch 050 sections, guard rows | static | `--quick`: `regenerate-patches.sh --check`, `check-patch-surface.sh`, `apply-patches.sh --self-test`, `verify-ext-tab-host-patch-guards.mjs` + `--self-test` | COVERED |
| 04-3 | EXT-03/05/08 | No-compile go-live, green scenarios | live | symlink/sha gate + `extension-actions-live`; ledger 29 | PARTIAL (ledger 29) |
| 05-1 | PROMPT-04/08 | C24 Copy Image | live | `--scenario menu-edit`; plant in `-self-test`; catalogue lines `--fix` + `check-internals-boundary.sh --catalogue`. `--only page-furniture-live` (PASS) + `-self-test` (plants; flaky, ledger 43) | PARTIAL (ledger 43) |
| 05-2 | PROMPT-04/08 | C22 title tooltip | live | `--scenario tooltip-status,theia-hover-silent`; plants tooltip-element-removed, tooltip-drag-lookup-throws, overlink-unregistered, theia-tooltip-leak, status-over-page. `--only page-furniture-live` (PASS) + `-self-test` (plants; flaky, ledger 43) | PARTIAL (ledger 43) |
| 06-1 | PROMPT-04/06 | C23 saved-login popup | live | `--scenario autocomplete,saved-login`; `--only page-furniture-live` (PASS) + `-self-test` (plants; flaky, ledger 43) | PARTIAL (ledger 43) |
| 06-2 | PROMPT-04/06 | 35 T16 CR-01, T17 CR-02, T18 WR-03 (save, edit rows, fullscreen, pointer lock) | live | `--scenario menu-save,save-as-late,menu-edit,iframe-edit-rows,element-fullscreen,pointer-lock-warning`; plants in `-self-test`. `--only page-furniture-live` (PASS) + `-self-test` (plants; flaky, ledger 43) | PARTIAL (ledger 43) |
| 07-1 | PROMPT-04/06/08 | 35 T19 WR-04 link-status clear, T20 WR-06 inspect policy | live | `--scenario tooltip-status,link-status-clear,menu-page-tools,inspect-policy`; `--only page-furniture-live` (PASS) + `-self-test` (plants; flaky, ledger 43) | PARTIAL (ledger 43) |
| 07-2 | PROMPT-04/06/08 | Full page-furniture rows via registry, captures | live | `--only page-furniture-live` PASS in both final runs; self-test red once in 6ac27ac2 run, green in gate run | PARTIAL (ledger 43) |
| 08-1 | BMK-04 | 999.4 bookmarks-toolbar order independence | live | 3x `verify-address-bar-live.mjs`; `address-bar-live` PASS; `-self-test` excluded, ledger 25 (plant ctrl-d-everywhere, different target) | PARTIAL (ledger 25) |
| 08-2 | SMODE-04 | 999.6 mode-tokens `*x` flake | live | 20x `--scenario search,mode-tokens`; `address-bar-live` PASS; self-test ledger 25 | PARTIAL (ledger 25) |
| 08-3 | NAV-03 | 999.5 Back leg, no page interaction | live+self-test | `--only nav-keys-live` / `nav-keys-live-self-test` (plant history-entry-unmarked); both PASS in gate | COVERED |
| 09-1 | PROMPT-01/02 | 999.14 kwinShot via captureShell; 999.13 plants re-sited | self-test | `verify-prompts-live.mjs --self-test --static` (quick) + plants queue-shown-early etc.; `prompts-live-self-test` excluded, ledger 39 (plant allow-loads-frame-url) | PARTIAL (ledger 39) |
| 09-2 | PROMPT-01/02 | 999.12 screen sharing without portal chooser | live | `--scenario sharing`; `prompts-live` PASS; self-test ledger 39 | PARTIAL (ledger 39) |
| 10-1 | PROMPT-01/02/05/09 | OQ1 derived PROMPT-03 skip; dialog-probe verdict | live+static | `--self-test --static` plants deferral-record-removed, deferral-row-removed (quick); `--only prompt-probe-verdict-live`; dialog scenarios skipped, ledger 26; self-test ledger 39 | PARTIAL (ledger 26, 39) |
| 10-2 | PROMPT-01/02/05/09 | 37 T18 CR-01a, T19 CR-01b adopted-tab prompts and bars | live | `--scenario adopted-prompt,adopted-bar-navigate`; self-test ledger 39 | PARTIAL (ledger 39) |
| 10-3 | PROMPT-01/02/05/09 | 37 T20 CR-01c parity, T21 CR-02 camera then location | live | `--scenario adopted-parity,camera-doorhanger,camera-then-geo`; self-test ledger 39 | PARTIAL (ledger 39) |
| 11-1 | PROMPT | 37 T22 WR-01, T23 WR-02 | live | `--scenario pending-window-reports,nav-resets-sharing`; ledger 39 | PARTIAL (ledger 39) |
| 11-2 | PROMPT | 37 T24 WR-03, T25 WR-04 | live | `--scenario dismissed-no-mark,popup-allow-opener`; ledger 39 | PARTIAL (ledger 39) |
| 11-3 | PROMPT | Full prompts-live rows (23 scenarios, 27 plants) | live | `--only prompts-live` PASS; `prompts-live-self-test` red in gate run, ledger 39 | PARTIAL (ledger 39) |
| 12-1 | 36 rows | 999.11 anchored expect; adopt-opener/close/blank-write/late-ack | live+self-test | `--scenario ...`; `--self-test` (plant opener-null; overlap preflight plant) | COVERED |
| 12-2 | 36 rows | adopt T12/T16, full rows | live+self-test | `--only new-window-adopt-live` / `-self-test` (14 plants red); PASS in gate | COVERED |
| 13-1 | 38 rows | Tab host: query, container-refused, activate-after-ack, foreign-page-refused, options-page-switch | live+self-test | `--only ext-tab-host-live` / `-self-test` (30 plants red); PASS in gate | COVERED |
| 13-2 | 38 rows | manage, remove-copy, sidebar, frontend-reload, private-access | live | `--scenario ...` ; `extension-actions-live` + self-test excluded, ledger 29 (38 T22 step 4, 999.17) | PARTIAL (ledger 29) |
| 13-3 | 38 rows | Full extension rows, captures | live | `--only extension-actions-live[-self-test]`; ledger 29 | PARTIAL (ledger 29) |
| 13-fix | 38/37/35 | Four deferred product fixes on main | live | walls `ext-network-wall`, `token-cookie-strip`, `token-gate-webview` PASS; 38 T22 step 4 red, ledger 29 / 999.17; prompts ledger 39 | PARTIAL (ledger 29, 39) |
| 14-1 | EXT-10 | Vaultwarden lifecycle, A5 probe, loopback-only bind | static | `--only extension-amo-live-static`; `verify-extension-amo-live.mjs --self-test` (3 ss-listing plants) | COVERED |
| 14-2 | EXT-10 | ext10-fill scenario | live+self-test | `--only extension-amo-live` / `-self-test` (plant vault-uri-mismatch); PASS in gate | COVERED |
| 15-1 | 27/34/38 keys | Real keyboard through ydotool | live (headed) | headless branch in `nav-keys-live`, `tab-strip-live`, `extension-actions-live` (ledger 29); `PB_REAL_INPUT=1` runs are hand-started, no registry row beyond `real-input-gate-self-test` | PARTIAL (no row for real-input branch; ledger 29) |
| 15-2 | 27/34 pointer | Real pointer, calibrated | live (headed) | same: headless rows plus hand-run `PB_REAL_INPUT=1` | PARTIAL (no row for real-input branch) |
| 15-3 | 36 T5, 38 T23 | Real pointer adopt-focus, popup click | live (headed) | `new-window-adopt-live` covers headless; real branch hand-run; ledger 29 for extension half | PARTIAL (no row for real-input branch; ledger 29) |
| 16-1 | 33 T6 | Edit-greying; page-tools rows | live+self-test | `--only page-tools-live` (flaky: crash-navigate red 1 of 3, ledger 28) / `page-tools-live-self-test` PASS | PARTIAL (ledger 28) |
| 16-2 | 32 rows | Captures and hand-started runs; pb-kwin captureActive | self-test | `--only real-input-gate-self-test` (clean-capture-active leg + refusal plants); captures are visual (see Manual-Only) | COVERED |
| 16-3 | 34 T4/T8/T14 | Tab-strip remainders | live+self-test | `--only tab-strip-live` / `-self-test`; PASS in gate | COVERED |
| 17-1 | 31.1 | Evidence for batch B (A4 probe) | doc | inline `grep '^A4: '` | MANUAL |
| 17-2 | 27/31.1/34/35 | Batch B owner rulings (checkpoint) | owner | none (blocking-human decision) | MANUAL |
| 17-3 | 27/31.1/34/35 | Batch B rulings recorded | doc | inline loop check over UAT files | MANUAL |
| 18-1 | 31.1 T3 | Error-page allow-list, ruled as no work | live+self-test | `--only gui02-web-tab-live` / `-self-test`; PASS in gate | COVERED |
| 18-2 | 34 T1 | Drag-handle carve-out | live | `--scenario double` x3 headed; `tab-strip-live` + self-test PASS | COVERED |
| 19-1 | close-out | Full run and `--gate`, triage every red | gate | `verify-platform.sh --gate`: PASS-WITH-EXCLUSIONS at 77e5d037 (456 PASS, 32 excluded, all keyed to open WINDOWS.md entries) | COVERED |
| 19-2 | close-out | Follow-ups to backlog rows and ledger entries | doc | inline `node -e` check of ROADMAP/WINDOWS.md | MANUAL |
| 20-1 | close-out | REQUIREMENTS ticks, ROADMAP progress | doc | inline `node -e` tick-rule check | MANUAL |
| 20-2 | close-out | Human-only checklist (set equality with `[pending]` UAT rows) | doc | inline `node -e` set-equality check | MANUAL |
| 20-3 | close-out | Chris works the human checklist | owner | none; deferred 2026-11-07 | MANUAL |

Totals: 52 tasks. COVERED 13, PARTIAL 26, MANUAL 13, MISSING 0.

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No test framework is added, per repo rule.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Planning-file edits (01-1, 01-3, 02-2, 03-3, 17-1, 17-3, 19-2, 20-1, 20-2) | close-out records | Documents, not product behavior; each plan ran a one-shot inline `node -e` check | Re-run the `<automated>` block in the plan |
| Owner decisions (03-1, 03-2, 17-2) | EXT-05..10, 27/31.1/34/35 rows | Rulings are the owner's call | Recorded verbatim in the UAT files |
| 41 human-only UAT rows (20-3) | phases 27, 31.1, 32-38 | Look, feel, other applications, OS handlers; Chris deferred all on 2026-11-07 | Work `39-HUMAN-CHECKLIST.md` |
| Visual captures (16-2, 07-2, 11-3, 13-3) | 32, 33, 35, 37, 38 | PNG judged by eye | Open `captures/` per checklist item |
| Real-input headed runs (15-1..3) | 27 T1-T4, 34 T1/T6/T13, 36 T5, 38 T23 | Need the owner's KDE Wayland session and ydotoold; only the gate is a registry row | `PB_REAL_INPUT=1 PB_LIVE_HEADED=1` per 39-15-SUMMARY |
| Cross-application drag, portal items | 27 T6, 34 T7 | Another application is the drag source | 39-HUMAN-CHECKLIST.md, Portal section |

---

## Gaps (nyquist_compliant: false)

26 PARTIAL tasks, none MISSING. Causes:

- `prompts-live-self-test` excluded, ledger 39 (plant allow-loads-frame-url): 09-1, 09-2, 10-1..3, 11-1..3, 13-fix
- `page-furniture-live-self-test` flaky, ledger 43: 02-1, 05-1, 05-2, 06-1, 06-2, 07-1, 07-2
- `extension-actions-live` and self-test excluded, ledger 29 (999.17): 04-1, 04-3, 13-2, 13-3, 13-fix, 15-1, 15-3
- `address-bar-live-self-test` excluded, ledger 25 (999.27): 08-1, 08-2
- `page-tools-live` flaky, ledger 28: 16-1
- Dialog scenarios skipped by derivation, ledger 26 (999.3): 10-1
- Headed `PB_REAL_INPUT=1` branches have no registry row: 15-1, 15-2, 15-3

No implementation bug was found or fixed by this audit; every gap is an already-open ledger entry.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or a documented Manual-Only entry
- [x] Sampling continuity: no 3 consecutive tasks without automated verify, except plan 03 and 17 owner/doc tasks
- [x] Wave 0 covers all MISSING references (none)
- [x] No watch-mode flags
- [x] Feedback latency: quick ~180 s
- [ ] `nyquist_compliant: true` (blocked by the 26 PARTIAL tasks above)

**Approval:** audited 2026-11-07, not approved; re-audit when ledger 25, 28, 29, 39, 43 close.

## Validation Audit 2026-11-07

| Metric | Count |
|---|---|
| Gaps found | 26 |
| Resolved | 0 |
| Escalated | 0 |
