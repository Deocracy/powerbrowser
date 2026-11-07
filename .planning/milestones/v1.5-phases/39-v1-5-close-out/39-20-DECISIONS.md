# 39-20 requirement tick decisions

Internal record, to be folded into 39-20-SUMMARY.md. Written 2026-11-07 by plan 39-20 Task 1.

## Rule applied

A v1.5 requirement row is ticked, and its traceability Status is `Complete`, only when all of these hold:

1. At least one UAT row in phases 27, 31.1 and 32-38 that tests the row's behaviour is `result: pass` with live evidence.
2. No UAT row that tests that behaviour is `[pending]` or `issue`, and none carries an unanswered `owner:` call.
3. The row's live check is not red under a gate exclusion keyed to an open WINDOWS.md entry (39-BASELINE.md `## Final run`).
4. No backstop truth for the row is still open on 39-HUMAN-CHECKLIST.md.

A UAT row "tests the behaviour" when it names the id, or when its heading or `expected:` text covers the requirement's
stated behaviour. Matching on behaviour is stricter than the plan verify's literal id match. Most UAT rows do not name an
id, so a literal-only match would leave BMK-04 and PROMPT-04/06/08 counted as passing while a visual row for them is still open.

The rule was applied to every row of phases 27, 31.1 and 32-38, including rows that were ticked before phase 39 ("apply
the rule, not the history"). Rows of phases 28, 29, 30 and 31 are unchanged: phase 28 is the signed-off spike, and 29,
30 and 31 are outside this live pass (resume with /gsd-verify-work 29, 30, 31).

**After Task 3:** a row marked `re-tick after` below goes back to `[x]` / `Complete` once Chris passes every checklist
item it lists and no ledger entry is named. A row with a ledger entry stays unticked until that entry is fixed.

## Phase 27-38 rows (55)

| id | before | after | decision | blocking UAT row / ledger entry |
|----|--------|-------|----------|---------------------------------|
| NAV-01 | x | x | ticked | none (27 T1 pass: Esc on a loading page) |
| NAV-02 | x | x | ticked | none (27 T1 pass) |
| NAV-03 | x | - | unticked, re-tick after | 27 T5 [pending] (~500 ms hold opens the history menu); ledger 27 (open deviation: focus left in the pill after a real release, not excluded) |
| NAV-04 | x | - | unticked, re-tick after | 27 T5 [pending] (narrowing with Home shown) |
| NAV-05 | x | - | unticked, re-tick after | 27 T5 [pending] (one-line tooltips) |
| NAV-06 | x | - | unticked, re-tick after | 27 T6 [pending] (real drag onto New Tab) |
| KEY-01 | x | x | ticked | none (27 T1 pass) |
| KEY-02 | x | x | ticked | none (27 T1 pass) |
| KEY-03 | x | x | ticked | none (27 T1 pass) |
| KEY-04 | x | x | ticked | none (27 T2 pass) |
| KEY-05 | x | x | ticked | none (27 T3 pass) |
| EXT-05 | - | x | **newly ticked** | none (31.1 T1 pass, 31.1 T2/T3 owner answered, 38 T4 and T17 pass; ext-tab-host-live and its self-test PASS in the 77e5d037 gate) |
| PAGE-01 | x | - | unticked, re-tick after | 32 T6 [pending] (find strip layout, toggles) |
| PAGE-02 | x | x | ticked | none (page-tools-live zoom PASS; no open row) |
| PAGE-03 | x | x | ticked | none (32 T7 pass) |
| PAGE-04 | x | - | unticked, re-tick after | 32 T3 [pending] (16px crispness) |
| PAGE-05 | x | - | unticked | 32 T8 `issue` (libpulse not loaded on a hand-started binary; packaging follow-up 999.19). Chris ruled on 2026-11-05 that PAGE-05 stands with the follow-up open. The rule and the plan verify both refuse a tick while a row naming PAGE-05 is `issue`. Re-tick needs that row resolved or Chris confirming the override |
| PAGE-06 | - | - | unchanged (plan: leave) | 32 T5 [pending] (Downloads Open and Show in folder) |
| PAGE-08 | x | x | ticked | none (page-tools-live save PASS) |
| PAGE-09 | x | x | ticked | none (32 T11 owner pass, 33 T6 pass) |
| PAGE-10 | x | - | unticked, re-tick after | 32 T2 [pending] (reader view legible in both themes), 32 T4 [pending] (DevTools toolbox look) |
| PAGE-11 | x | - | unticked, re-tick after | 32 T1 [pending] (crash UI look); ledger 28 (page-tools-live crash-navigate flake, pre-emptive exclusion; the row passed in both final runs, so 28 alone would not block) |
| SMODE-07 | - | - | not ticked | 33 T7 [pending] (visual and copy pass, includes the Actions label) |
| MENU-03 | - | - | not ticked | 33 T7 [pending] (280px hamburger geometry); ledger 40 (site-identity-live app-menu red, excluded) |
| BMK-01 | - | - | not ticked | 33 T7 [pending] (star inset, editor anchor); ledger 25 (address-bar-live-self-test plant ctrl-d-everywhere does not bite on bookmark-keys, excluded) |
| BMK-02 | - | - | not ticked | 33 T7 [pending] (finding: the "Remove bookmark" label overflows its button) |
| BMK-03 | - | x | **newly ticked** | none (33 T2 pass; address-bar-live PASS in the gate) |
| BMK-04 | x | - | unticked (flipped early by `requirements.mark-complete` in 39-08), re-tick after | 33 T7 [pending] (28px toolbar row) |
| BMK-05 | - | - | not ticked | 33 T7 [pending] (320px clear panel, danger ink) |
| BMK-06 | - | - | not ticked | 33 T7 [pending] (32px History rows; finding: duplicate Recent pages row) |
| BMK-07 | - | x | **newly ticked** | none (34 T4 pass; tab-strip-live PASS in the gate) |
| TAB-01 | - | x | **newly ticked** | none (34 T3 pass) |
| TAB-02 | - | x | **newly ticked** | none (34 T5 pass) |
| TAB-03 | - | x | **newly ticked** | none (34 T1 owner pass, 34 T6 pass) |
| TAB-04 | - | x | **newly ticked** | none (34 T8 pass) |
| TAB-05 | - | - | not ticked | 34 T14 [pending] (pinned-tab corner badge fit) |
| TAB-06 | - | - | not ticked | 34 T14 [pending] (active-in-selection styling, hover feedback IN-01) |
| TAB-07 | - | x | **newly ticked** | none (34 T11 pass) |
| TAB-08 | - | - | not ticked | 34 T7 [pending] (drops from outside the browser and of a file) |
| TAB-09 | - | x | **newly ticked** | none (34 T12 pass) |
| PAGE-07 | - | - | not ticked | 35 T14 [pending] (fullscreen warning banner; finding: the capture shows the banner over the IDE, not over the video) |
| PROMPT-04 | x | - | unticked (flipped in 39-05/39-06), re-tick after | 35 T12 [pending] (menu look and order against the stock window), 35 T4 [pending] (freeze-frame still under a notification bar, IN-05). Ledger 43 (Copy Image Link self-test flake) passed in the gate, so it does not block |
| PROMPT-06 | x | - | unticked (flipped in 39-05/39-06), re-tick after | checklist backstops E2 autocomplete overflow and long-text (39-UI-SPEC UI Considerations) |
| PROMPT-08 | x | - | unticked (flipped in 39-05/39-06), re-tick after | 35 T13 [pending] (tooltip at the window edge), 35 T15 [pending] (status-line truncation), backstops E1 tooltip overflow and long-text |
| PROMPT-05 | - | - | not ticked | 36 T17 [pending] (VB-01 adopted tab look); ledger 39 (prompts-live-self-test plant allow-loads-frame-url red for the wrong reason, "popup not adopted next to its opener", excluded) |
| PROMPT-01 | - | - | not ticked (left unticked by the lane plan) | 37 T28 [pending] (doorhanger placement and keyboard), 37 T29 [pending] (pending-prompt mark), 37 T39 backstop (no BiDi DOM assertion on #notification-popup) |
| PROMPT-02 | - | - | not ticked (left unticked by the lane plan) | 37 T30 [pending] (sharing indicator); 37 T6 human half (KDE portal click, default Wayland session) |
| PROMPT-03 | - | - | unchanged (plan: leave) | deferred to 999.3; ledger 26 |
| PROMPT-07 | - | - | not ticked | 37 T31 [pending] (password doorhanger) |
| PROMPT-09 | - | - | not ticked | 37 T32 [pending] (notification bars), 37 T39 backstop (bars never cover page content); ledger 39 (prompts-live-self-test, excluded) |
| EXT-06 | - | - | not ticked (left unticked by the lane plan) | 38 T18 [pending] (buttons, badge, puzzle menu), 38 T22 [pending] (private-browsing access step 4); ledger 29 (extension-actions-live private-access session 2, excluded) |
| EXT-07 | - | - | not ticked (lane plan); 38 T2 and T23 pass (39-15) | 38 T18 [pending] (popup arrow under the clicked button); ledger 29 (extension-actions-live, which runs popup-action, excluded) |
| EXT-08 | - | - | not ticked (lane plan) | 38 T19 [pending] (page-action icon and pill text); ledger 29 (extension-actions-live, which runs content and page-action, excluded) |
| EXT-09 | - | - | not ticked (lane plan) | 38 T21 [pending] (a real install click-through, SC4 by hand) |
| EXT-10 | - | - | not ticked (lane plan); 38 T31 pass (39-14) | checklist backstops EXT-10 adjacency, empty vault, ordering (39-14 must_haves). extension-amo-live PASS in the gate |

## Unchanged rows outside the pass (32)

- EXT-04 (Phase 28): ticked, unchanged. The spike was signed off; 39-20 adds no check.
- BAR-01..BAR-14 (Phase 29), SMODE-01..SMODE-06 (Phase 30): ticked, unchanged. Outside this live pass; /gsd-verify-work 29, /gsd-verify-work 30.
- SITE-01..SITE-08, MENU-01, MENU-02, MENU-04 (Phase 31): unticked, unchanged. Outside this live pass (/gsd-verify-work 31); site-identity-live is also red under ledger 40.

## Totals

- Ticked before: 45. Ticked after: 41.
- Newly ticked: 9 (EXT-05, BMK-03, BMK-07, TAB-01, TAB-02, TAB-03, TAB-04, TAB-07, TAB-09).
- Unticked: 13 (NAV-03, NAV-04, NAV-05, NAV-06, PAGE-01, PAGE-04, PAGE-05, PAGE-10, PAGE-11, BMK-04, PROMPT-04, PROMPT-06, PROMPT-08). Twelve can be re-ticked after Task 3 if their checklist items pass. PAGE-05 needs its `issue` row settled first.
- Plan frontmatter ids: PROMPT-04, PROMPT-06, PROMPT-08, EXT-05..EXT-10 are not complete at this point, except EXT-05 (ticked) and EXT-04 (already ticked). Do not run `requirements.mark-complete` on the plan's list without this table.

## ROADMAP

- Phase checkboxes 27 and 29-38 ticked (28 was already ticked). The Phase 39 entry is left to the orchestrator.
- `roadmap update-plan-progress` was run for 27, 29, 30, 31 and 32. It changed only row 31 (0/TBD to 5/5) and the phase 31 `**Plans**:` line, and it removed one blank line before 999.17, which was restored.
- Progress rows 27 and 29-38 were set by hand. None is `Complete`, because every phase in the pass still has [pending] checklist rows. 27 and 32-38 read `Executed, verification deferred (39-HUMAN-CHECKLIST.md)`. 29, 30 and 31 read `Executed, verification deferred (outside the 39 live pass; /gsd-verify-work N)`. Row 38's count was 5/5 and is now 7/7 (38-06 and 38-07 summarised).
- Phase 31.1 has no progress row and no phase checkbox in the v1.5 list, so none was added. Its four plan checkboxes are still `[ ]`; they were not touched.

## Task 3 rulings (Chris, 2026-11-07, via AskUserQuestion)

1. Checklist: "Defer: record all as pending, continue". Every item in 39-HUMAN-CHECKLIST.md stays open and the 28 pending UAT
   rows stay `[pending]`. Requirements blocked only by checklist items stay unticked.
2. PAGE-05: "Keep unticked until 999.19 (Recommended)". Recorded as the `owner:` line of 32-UAT row 8. This supersedes the
   2026-11-05 ruling ("keep PAGE-05 standing and log the packaging follow-up", box 32, Accept all) quoted in the PAGE-05
   row above: PAGE-05 stays unticked until backlog 999.19 (libpulse load for a hand-started binary) is resolved.
3. The eight new defects from 39-19 (ledger 34 and 36-41; backlog 999.30 and 999.31): "Carry to v1.6 (Recommended)".

## Re-tick after the checklist

The checklist is deferred, so these twelve rows stay unticked (`[ ]`, traceability Pending). Each goes back to `[x]` /
`Complete` once Chris passes every checklist item named in the table above and no ledger entry blocks it:

- NAV-03, NAV-04, NAV-05, NAV-06 (27 T5, 27 T6; NAV-03 also needs ledger 27 fixed)
- PAGE-01 (32 T6), PAGE-04 (32 T3), PAGE-10 (32 T2, T4), PAGE-11 (32 T1)
- BMK-04 (33 T7)
- PROMPT-04 (35 T12, T4), PROMPT-06 (E2 backstops), PROMPT-08 (35 T13, T15, E1 backstops)

PAGE-05 is not in this list: it re-ticks when backlog 999.19 is fixed, not on a checklist pass.
