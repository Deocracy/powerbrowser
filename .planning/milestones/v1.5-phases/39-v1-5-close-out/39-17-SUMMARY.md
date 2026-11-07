---
phase: 39-v1-5-close-out
plan: 17
subsystem: owner-decisions
tags: [uat, owner-rulings, batch-b, a4-probe, 27-t8, 31.1, 34, 35, 38]
status: complete
requires: [39-16, 39-03]
provides:
  - "A4 verdict: overlay error pages are not replaced by about:blank (31.1-UAT row 3)"
  - "Batch B owner rulings recorded verbatim in 27, 31.1, 34, 35 UAT files and the three extras in 38-UAT"
  - "Backlog row 999.17 and WINDOWS.md entry 29 for the private-window options page (38 T22 step 4)"
affects: [39-18, 27-UAT, 31.1-UAT, 34-UAT, 35-UAT, 38-UAT]
tech-stack:
  added: []
  patterns:
    - "an owner ruling is written as an owner line quoting the AskUserQuestion answer verbatim; a pure owner row also gets evidence: owner decision <date>"
key-files:
  created:
    - .planning/phases/39-v1-5-close-out/39-17-SUMMARY.md
  modified:
    - .planning/phases/27-groundwork-navigation-buttons-and-page-focus-keys/27-UAT.md
    - .planning/phases/31.1-extension-tab-host/31.1-UAT.md
    - .planning/phases/34-tab-strip/34-UAT.md
    - .planning/phases/35-shell-furniture-and-page-context-menu/35-UAT.md
    - .planning/phases/38-webextensions/38-UAT.md
    - .planning/ROADMAP.md
    - .planning/WINDOWS.md
decisions:
  - "31.1 T3 passes as intended: no error-page allow-list is built (the A4 probe showed error pages are not replaced)"
  - "34 T1 carve-out is ruled: plan 39-18 removes the strip from the window-drag handles"
  - "38 T22 step 4 (private window options page) is deferred to backlog 999.17, not fixed"
  - "STOCK_WINDOW_WRAPPERS exemption in verify-shell-gbrowser-standin.mjs ratified"
requirements-completed: [PROMPT-04, EXT-05]
plan_head_before: 1b67699e8d6a5756d2ceaf9e45715eff23ee5ae8
plan_head_after: 42cb39f731cb68d9427cf891464b7dd2990c10c5  # the last commit before this SUMMARY's own docs commit
actuals:
  tokens: 14000
  tasks: 3
  commits: 3
duration: "about 1 h (Task 3 and the SUMMARY; Tasks 1 and 2 earlier the same day)"
completed: 2026-11-06
---

# Phase 39 Plan 17: Batch B owner rulings Summary

Chris's batch B rulings (phases 27, 31.1, 34, 35) and three extra rulings (phase 38) are recorded verbatim in the UAT files; two rulings are handed to plan 39-18 (the 34 T1 drag-handle carve-out) or closed without work (the 31.1 T3 allow-list), and one defect is deferred to backlog 999.17 with WINDOWS.md entry 29.

## Task 1: evidence (commit dad05a3a, folded in here)

The scratch evidence file `39-17-EVIDENCE.md` was uncommitted; its content is folded into this section and the file is deleted (the A4 verdict itself is also committed in 31.1-UAT row 3).

### A4 verdict (31.1 T3)

Probe `/tmp/nix-shell.75PsxP/pb-39-17/a4-probe.mjs` (scratch, outside the repo), headless, `MOZ_PURGE_CACHES=1`, progress listener on the overlay browser, both a direct web-tab open and a chrome-initiated navigation of a live overlay.

| Target | onLocationChange top-level location | Flags | Overlay documentURI | Replaced by about:blank |
|---|---|---|---|---|
| http://127.0.0.1:&lt;closed port&gt;/ | http://127.0.0.1:&lt;port&gt;/ | LOCATION_CHANGE_ERROR_PAGE | about:neterror?e=connectionFailure&u=... | no |
| https://www.pb-fixture.test:&lt;port&gt;/ok (CA untrusted) | same https URL | LOCATION_CHANGE_ERROR_PAGE | about:certerror?e=nssBadCert&u=... | no |
| https://127.0.0.1:&lt;port&gt;/ok (CA trusted, name mismatch) | same https URL | LOCATION_CHANGE_ERROR_PAGE | about:certerror?e=nssBadCert&u=... | no |

The forwarder's `OVERLAY_LOCATION` test sees the requested http(s) URL, not an about:neterror/about:certerror location, so error pages are not replaced; the overlay shows the stock error page. Not probed: error pages reached via redirect, and about:neterror reached by a non-http(s) scheme. The error document's text could not be read over BiDi, so "what the overlay displays" rests on `documentURI`, not rendered text or a screenshot.

### 27 T8 contradictions

None. The 14 judgment-tier verdicts all read "holds" in 27-VERIFICATION.md. The 39-15 real-input results (27-UAT rows 1-4) are consistent with the prohibitions they touch: 9/10 (real Ctrl+T, Ctrl+W, Ctrl+Tab family pass; no key outside the action map), 1/11/13 (row 2: no page-key row fires under Theia focus), 12 (row 3: a real back button over the Theia frame changed nothing). Row 4 carries one finding that contradicts no prohibition: after releasing a held Back off the button, focus is in the pill, so a real Escape is the pill's and leaves the history menu open (WINDOWS.md entry 27, product fix deferred).

### 34 T1 real-input result (34-UAT row 1, 39-15)

Verify-tab-strip-live `double`, three runs, same result: a real double-click on the empty strip right of /a (the gap is a chrome drag handle) MAXIMIZED the window (KWin frame 384,226 1280x800 to 0,0 2048x1252) and opened NO new tab. The native drag region consumes the double-click, so TAB-03's second clause fails on a real pointer while the DOM-event scenario stays green.

## Task 2: owner answers (AskUserQuestion, 2026-11-06), verbatim

- **Box 27** (27 T8, confirm the 14 judgment-tier prohibition verdicts): "Accept all (Recommended)".
- **Box 31.1** (T2 page focus moves Theia's current widget; T3 error pages, A4 probe showed error pages are NOT replaced by about:blank, stock about:neterror/about:certerror shown): "Accept both (Recommended)" -> T2 pass as designed; T3 pass as intended, NO allow-list work for 39-18.
- **Box 34** (T1 real double-click maximizes the window, 3/3; T2 strip hidden in Coding and Organising; T15 IN-01..IN-12): "Carve-out + accept T2, T15 (Recommended)" -> 39-18 removes the strip from the window-drag handles (shell JS, with a plant); T1 stays [pending] with the owner line; T2 and T15 pass; IN items logged as follow-ups.
- **Box 35** (T21 Edit submenu fallback while the hamburger holds focus; T22 first stale pick gives no message): "Accept both (Recommended)" -> both pass; T21 limitation to Deferred Follow-Ups. The 35 T14 fullscreen capture (banner over an empty main area) is a human-checklist item, not a ruling.
- **Extra 1** (38 T22 step 4, options page of a not-allowed extension opens in a private stock window; needs a patch-050 hunk and a Gecko rebuild): "Defer to backlog (Recommended)" -> backlog row in ROADMAP's backlog section plus a WINDOWS.md ledger entry; 38-UAT row 22 stays pending citing that row; matches stock behaviour.
- **Extra 2** (the one-entry STOCK_WINDOW_WRAPPERS exemption in scripts/verify-shell-gbrowser-standin.mjs from 7dc0e61c): "Ratify (Recommended)" -> recorded here and as an owner line on 38-UAT row 30.
- **Extra 3** (38 T32 second question, is a signed fixture of our own still required now the AMO route works): "Not required (Recommended)" -> owner line on 38-UAT row 32 closing the question; the "still needs an owner answer" note is removed.

## Task 3: what was recorded

| File | Row | Result | Notes |
|---|---|---|---|
| 27-UAT | 8 | pass | owner line + `evidence: owner decision 2026-11-06`; summary 5 passed, 2 pending |
| 31.1-UAT | 2 | pass | owner line (documented deviation 6) |
| 31.1-UAT | 3 | pass | owner line; evidence cites the A4 line directly above it; file now 3/3 passed, status complete |
| 34-UAT | 1 | [pending] | owner line replaces the open question; 39-18 applies the carve-out and records the result; Gaps and Deferred Follow-Ups updated |
| 34-UAT | 2 | pass | owner line replaces the open question |
| 34-UAT | 15 | pass | IN-01..IN-12 stay open as follow-ups under Deferred Follow-Ups; summary 12 passed, 3 pending |
| 35-UAT | 21 | pass | limitation added to Deferred Follow-Ups |
| 35-UAT | 22 | pass | summary 16 passed, 6 pending |
| 38-UAT | 22 | [pending] | owner line citing ROADMAP 999.17 and WINDOWS.md 29; follow-up entry added |
| 38-UAT | 30 | pass (unchanged) | owner line: STOCK_WINDOW_WRAPPERS exemption ratified |
| 38-UAT | 32 | pass (unchanged) | existing owner line extended with Extra 3; stale "still needs an owner answer" follow-up removed |

Backlog row: `.planning/ROADMAP.md` Phase 999.17 (next free id after 999.16). Ledger entry: `.planning/WINDOWS.md` id 29 (kind deviation, phase 39, file patches/050-extension-tab-host.patch). Extra 2 (the ratification) needs no code change.

## For 39-18

- **34 T1 carve-out is ruled.** Remove the empty tab-strip space from the window-drag handles (`publishDragRegions`, chrome-bar-widget.tsx; shell JS), with a plant, then re-run the real-input `double` scenario and record 34-UAT row 1 (it is `[pending]` with the owner line until then).
- **31.1 T3 allow-list is NOT ruled.** No error-page allow-list work: the A4 probe showed overlay error pages are not replaced by about:blank, and Chris ruled T3 pass as intended.
- **The private-window options-page item is deferred, not fixed.** Backlog 999.17 / WINDOWS.md 29; it needs a patch 050 hunk and a Gecko rebuild. Do not pick it up in 39-18.
- 35 T14 (fullscreen banner over an empty main area) is a human-checklist item for the end-of-phase checklist, not a ruling.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `windows append` dropped the milestone field**
- **Found during:** Task 3, WINDOWS.md entry 29
- **Fix:** added `"milestone": "v1.5"` to entry 29 by hand. The tool also stripped `milestone` from entries 24 (v1.6), 26 (v1.5) and 27 (v1.5) when it rewrote the JSON block; those three were restored by hand and the final diff of WINDOWS.md is the entry-29 addition plus the header counts only.
- **Files modified:** .planning/WINDOWS.md

**2. [Plan scope] Task 3's file list names four UAT files; five were edited**
- 38-UAT, ROADMAP.md and WINDOWS.md were edited because the three extra rulings in the dispatch require it.

## Commits

- dad05a3a: docs(39-17): record A4 verdict under 31.1-UAT row 3 (Task 1)
- 42cb39f7: docs(39-17): record owner batch B rulings in the 27, 31.1, 34, 35 and 38 UAT files (Task 3)
- the SUMMARY commit (this file, with the evidence file removed)

`commits: 3` is `git rev-list --count 1b67699e..HEAD` after the SUMMARY commit; the ledger was created at Task 3 with 1b67699e (the parent of Task 1's commit) as its base so that Task 1's commit is counted.

## Verification

- Four-file owner-line and UAT parse loop: `ok 27-UAT.md 8 8`, `ok 31.1-UAT.md 3 3`, `ok 34-UAT.md 15 15`, `ok 35-UAT.md 22 22`, `LOOP-OK`; 38-UAT parses.
- `nix develop .#theia --command scripts/verify-platform.sh --quick`: exit 0, last line `verify-platform: PASS -- all checks passed`.

## Known Stubs

None.

## Self-Check: PASSED

- 39-17-SUMMARY.md, the five UAT files, ROADMAP.md (999.17) and WINDOWS.md (29) exist and are committed.
- Commits dad05a3a and 42cb39f7 are ancestors of HEAD.
