---
phase: 39-v1-5-close-out
plan: 07
subsystem: shell-furniture
tags: [link-status, devtools-policy, page-menu, captures, harness, PROMPT-04, PROMPT-06, PROMPT-08]

requires:
  - phase: 39-v1-5-close-out
    provides: "39-02 --self-test --scenario; 39-01 captureShell in scripts/lib/pb-kwin.mjs; 39-05/39-06 a green page-furniture-live"
provides:
  - "scenarios link-status-clear (35 T19 WR-04) and inspect-policy (35 T20 WR-06)"
  - "plants status-clear-pointer-only and inspect-offered-unchecked"
  - "PB_CAPTURE_DIR capture hook (runs headed, captureShell at four states)"
  - "menu-spelling instrument fix: overlay focus before the spell check (the 39-05 flake)"
  - "35-UAT rows 1, 6, 8, 9, 19, 20 pass; rows 12-15 carry captures"
affects: [39-17, 39-18, 39-19]

actuals:
  tokens: 9200
  tasks: 2
  commits: 3
plan_head_before: 354692931116d60053702e291b46d0a5da55697d
plan_head_after: cf23025e767dc759d96d4d7eee11fb00d9309791

tech-stack:
  added: []
  patterns:
    - "Before a page-side focus() that must fire a focus event (the inline spell checker, a click needing activation), move chrome focus to the overlay with focusOverlay; after a scenario that ends with chrome focus on the Theia frame, a page focus() fires no focus event"
    - "A plant for a defect whose clears live in the boundary's private state drops the pushes at PowerBrowserGroupParent.prototype.sendAsyncMessage, keyed on what caused them"

key-files:
  created:
    - .planning/phases/39-v1-5-close-out/captures/35-T12-menu.png
    - .planning/phases/39-v1-5-close-out/captures/35-T13-tooltip-edge.png
    - .planning/phases/39-v1-5-close-out/captures/35-T14-fullscreen-warning.png
    - .planning/phases/39-v1-5-close-out/captures/35-T15-status-truncation.png
  modified:
    - scripts/verify-page-furniture-live.mjs
    - .planning/phases/35-shell-furniture-and-page-context-menu/35-UAT.md

key-decisions:
  - "35-UAT row 2 stays [pending] with a live line. Its expected line is the full driver and --gate, which 39-07 did not run; that run belongs to 39-19. The plan asked for pass here, and pass would claim a run that did not happen"
  - "inspect-policy's refused row is Inspect, offered with DevTools allowed and picked after devtools.policy.disabled came on. The WR-06 fix omits a blocked-scheme link and Reload Image on a non-http(s) image, or shows them as the disabled refusal row, so neither can be offered and then refused"
  - "The 39-05 menu-spelling flake was the instrument: chrome focus rested on the Theia frame after menu-page-tools, so the textarea's focus() fired no focus event and the inline spell checker never started"

requirements-completed: [PROMPT-04, PROMPT-06, PROMPT-08]

duration: 75 min
completed: 2026-11-06
status: complete
---

# Phase 39 Plan 07: 35 T19/T20 live scenarios, the page-furniture registry rows and the visual-row captures Summary

**WR-04 (status line cleared on a keyboard tab switch and on navigation) and WR-06 (no Inspect under the DevTools policy; a refused row says so) are now proven live, each with a plant. Both page-furniture registry rows pass at 0c6b3a85: 25 of 25 scenarios and 34 plants. The menu-spelling flake from 39-05 was the instrument and is fixed. Rows 12-15 now carry headed captures for Chris.**

## Performance

- Duration: about 75 min (16:53Z to 18:08Z), mostly live runs
- Tasks: 2 of 2
- Live sessions, all counted:
  - 2 Task 1 runs: a four-scenario green run, and a self-test of 3 sessions
  - 3 registry live runs
  - 2 registry self-test runs, 35 sessions each
  - 6 isolation and diagnostic runs
  - 1 sequence confirmation and 1 menu-spelling self-test
- **Headed runs: 1** (the PB_CAPTURE_DIR run)

## Task 1: scenarios and capture hook (51303699)

- **link-status-clear (35 T19 WR-04).** Opens /furniture and then /frame, so Ctrl+Tab from the page lands on the plain page. The pointer goes onto `#link` through chrome (`pointerOnto`) and the status line must show `/target`. Then:
  - Leg 1: chrome focus moves to the overlay and Ctrl+Tab is pressed. The status line must clear even though the pointer never moved.
  - Leg 2: back on the page, a click on the link loads /target. The line must clear and still be clear 500 ms later.
- **inspect-policy (35 T20 WR-06).**
  - Control: with DevTools allowed, the element menu on `#inspect-me` offers Inspect.
  - `devtools.policy.disabled=true` is set and read back. This is the pref the DisableDeveloperTools policy locks. The element menu must then have no Inspect row.
  - With the policy off, a menu that offers Inspect is opened. The policy is turned on, then Inspect is picked. Chrome refuses it, and `CHROME_BAR_COPY.pageMenuRowRefused`, read from the tree through `subjectCopy`, must appear as a notification.
  - The pref is restored in `finally`.
- **Plants.**
  - `status-clear-pointer-only` drops, at `PowerBrowserGroupParent.prototype.sendAsyncMessage`, every overLink clear that no pointer event caused (`setOverLink('')`, or a chrome mouseover off every overlay). That is the pre-WR-04 behaviour. Red: `status line kept a link after a tab switch`.
  - `inspect-offered-unchecked` puts back, at `PageContextMenuContribution.open`, the Inspect row seen earlier in the session into any menu that lacks it. Red: `Inspect row shown under the DevTools policy`.
  - Both plants read back before `note('PLANT ... applied')`.
- **Capture hook.** When `PB_CAPTURE_DIR` is set, the session runs headed (`PB_LIVE_HEADED=1`), and `capture()` calls `captureShell` at four points:
  - context-menu, with the blank-area menu open
  - tooltip-status in Browsing: a long link in the status line, then the `#tip-edge` title tooltip in the page's bottom-right corner
  - element-fullscreen, with the warning shown

  When `PB_CAPTURE_DIR` is unset, the extra legs do not run and nothing is captured. The `/furniture` page gained `#longlink` and a fixed `#tip-edge` at the end of its body. The existing scenarios do not use them.

## Task 2: registry rows, captures, 35-UAT

| Run | Commit | Result |
|---|---|---|
| `--only page-furniture-live` #1 | 51303699 | FAIL: iframe-edit-rows (Undo did not restore the frame's second field), menu-spelling (/tools page not shown) |
| `--only page-furniture-live` #2 | 51303699 | FAIL: menu-spelling (no pageContextMenu push for the misspelt textarea) |
| `--only page-furniture-live` #3 | 0c6b3a85 | **PASS**, 25 of 25; `context-menu timing: p50 98 p95 99 n=7`; `freeze-frame timing: menu p50 7 p95 9, still 20/20 within 50 ms` |
| `--only page-furniture-live-self-test` #1 | 0c6b3a85 | FAIL: 33 of 34. copy-image-html-only went red on "Paste did not set the second field" (the 39-05 menu-edit Paste flake) |
| `--only page-furniture-live-self-test` #2 | 0c6b3a85 | **PASS**: clean control green, all 34 plants red |

Captures (headed run at 0c6b3a85, sandbox off): I opened all four PNGs, and each shows only the PowerBrowser window.
- 35-T12: the blank-area page menu.
- 35-T13: the tooltip clamped inside the window. The page's corner is 0 px from the window's right and bottom edges.
- 35-T14: the warning `127.0.0.1:<port> is now full screen` with Exit Full Screen (Esc).
- 35-T15: the long URL on one line with an ellipsis.

35-UAT changes:
- Rows 1, 6, 8, 9, 19 and 20 are `result: pass`, each with evidence naming the scenarios, the plants and 0c6b3a85 (19 and 20 also name 51303699).
- Row 2 is `[pending]` with a `live:` line (see Deviations).
- Row 4's `live:` line has the 0c6b3a85 timing and stays pending for the IN-05 look.
- Rows 12-15 have `capture:` lines and `live:` notes.
- Summary: total 22, passed 14, pending 8, skipped 0.

## Finding for Chris (row 14)

35-T14 shows the fullscreen warning over the **IDE layout with an empty main area, not over the video**. element-fullscreen had just read `overlayFull` and `windowFull` as true and passed. This could be the overlay not painting over the Theia frame in a headed fullscreen window, or a capture artefact. I did not investigate; the verdict is Chris's, and if it is a defect it belongs to 39-17/39-18.

## Verification

- `node scripts/verify-page-furniture-live.mjs --scenario tooltip-status,link-status-clear,menu-page-tools,inspect-policy`: all 4 PASS
- `--self-test --scenario link-status-clear,inspect-policy`: PASS, both plants red with their first failure text
- `--self-test --scenario menu-spelling` after the fix: PASS (spellcheck-off still red)
- Registry rows: see the table above. Both PASS at 0c6b3a85
- `scripts/verify-platform.sh --quick`: PASS before the Task 1 commit, and PASS with the Task 2 files staged
- `nix develop .#theia --command bash scripts/diff-theia-core.sh`: `PASS -- zero changes inside @theia/*`. No Theia code changed, so no `yarn build`
- `scripts/check-internals-boundary.sh`: PASS. The boundary file was not touched
- Plan UAT parser check: passes for rows 1, 6, 8, 9, 19, 20 and captures 12-15. **It fails on row 2 by design** (see Deviations)

## Deviations from Plan

**1. [Rule 1 - Bug, instrument] menu-spelling's flake was a focus gap in the harness**
- Found during: Task 2, registry runs 1 and 2 (menu-spelling red both times)
- Isolation:
  - It failed without inspect-policy too (`menu-page-tools,menu-edit,iframe-edit-rows,menu-spelling`, 3 of 3 runs red), and passed alone. So 39-07's new scenario did not cause it.
  - A diagnostic ruled out a lost window focus and a wrong /tools context.
  - The picked page had `hasFocus() false` while chrome focus was on the Theia frame.
- Fix: `suggestionsAt` calls `focusOverlay` before the textarea's `focus()`. The same sequence then went green 2 of 2, and the full row 25 of 25.
- Files: scripts/verify-page-furniture-live.mjs. Commit 0c6b3a85

**2. [Transparency] 35-UAT row 2 is not marked pass**
- The plan asked for `result: pass` naming both registry rows. Row 2's expected line is the whole `verify-platform.sh` and `--gate`, and 39-07 ran only the two rows. The row keeps `[pending]` with a `live:` line saying the blocker is gone and the full run is 39-19's. Because of this, the plan's automated UAT check stops at row 2.

**3. [Scope] No stock-window menu in 35-T12**
- No scenario opens the stock window's page menu. The plan's "beside the same menu in the stock window when the scenario has both" does not apply, so the side-by-side comparison in row 12 is by hand.

**4. [Instrument] The plants work at the boundary's edges, not inside it**
- WR-04's clears and WR-06's facts are module-private state in PowerBrowserAPI.sys.mjs. So `status-clear-pointer-only` acts at the push send, and `inspect-offered-unchecked` acts at the frontend's menu open. This is the same pattern as 39-06's save-reply-ttl.
- Before the fix, the facts already read `devtools.policy.disabled` directly. `DevToolsShim.isEnabled()` reads the same pref. So inspect-policy's leg 1 is a regression guard. The WR-06 defect it proves live is the silent refusal (leg 2). Leg 2 has no plant of its own, and neither does link-status-clear's navigation leg, because the plan asks for one plant per scenario.

## Flake count (for 39-18)

- menu-spelling: fixed (cause found, see Deviation 1).
- menu-edit Paste ("Paste did not set the second field"): hit 1 of 2 registry self-test runs in this plan, in the copy-image-html-only session where menu-edit runs alone. Not fixed here. The same focus pattern (a page `focus()` with chrome focus elsewhere) is the first thing to try.
- iframe-edit-rows: red in 2 of the 10 plain runs that included it (Undo in live #1; Paste in an `iframe-edit-rows,menu-spelling` isolation run). Not fixed here.

## Known Stubs

None.

## Threat Flags

None. The captures are the only new trust-boundary output; T-39-18's mitigation ran: captureShell gated on the active window, and each PNG was opened and checked before commit.

## Next Phase Readiness

- page-furniture-live is 25 scenarios and the self-test has 34 plants. Both PASS at 0c6b3a85.
- The capture command is `PB_CAPTURE_DIR=<dir> node scripts/verify-page-furniture-live.mjs --scenario context-menu,tooltip-status,element-fullscreen`. It needs the Bash sandbox off and opens one headed window.
- 39-19: row 2 waits on your full and `--gate` run. Name page-furniture-live and its self-test in the evidence.
- 39-17/39-18: the row 14 fullscreen-capture finding, and the menu-edit Paste and iframe-edit-rows flakes above.

## Commits

- 51303699 test(39-07): scenarios link-status-clear and inspect-policy with plants; PB_CAPTURE_DIR capture hook
- 0c6b3a85 fix(39-07): menu-spelling focuses the overlay before the spell check (the 39-05 flake)
- cf23025e docs(39-07): 35-UAT rows 1, 6, 8, 9, 19, 20 pass from registry runs; captures for rows 12-15

## Self-Check: PASSED

All five created or modified files exist; commits 51303699, 0c6b3a85 and cf23025e are ancestors of HEAD.
