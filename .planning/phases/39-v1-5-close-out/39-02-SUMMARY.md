---
phase: 39-v1-5-close-out
plan: 02
subsystem: page-context-menu
status: complete
tags: [c11, tracer, page-context-menu, focus, live-harness, plants]
requires:
  - phase: 39-01
    provides: baseline red list (C11 not red there; this plan's plant decides)
provides:
  - PageContextMenuContribution.latestMenuId and focusPageIfLatest (frontend guard)
  - PowerBrowserAPI.webTabFocus drops a page focus while a page menu is pending (chrome guard)
  - stale-dismissal leg, run first in scenario context-menu
  - plants stale-dismiss-focus and stale-focus-unguarded
  - verify-page-furniture-live.mjs --self-test --scenario a,b
  - closeMenu with no Theia-frame pre-focus
  - backlog 999.10 ticked, 35-UAT row 6 C11 evidence
affects: [39-05, 39-06, 39-18]
actuals:
  tokens: 5900
  tasks: 2
  commits: 2
plan_head_before: 31b2bf60ef4fa936fc23d89e92158ba5360a12d4
plan_head_after: 00f0f34ac3ec247779623cb852aea0cf59235d1d
commits: 2
tech-stack:
  added: []
  patterns:
    - "Harness-only reply hold: wrap send on the DI singleton, let the request leave, delay only the frontend's reaction; restore in finally"
    - "Deferred render: wrap open on the singleton once, so a stale reply lands after chrome focused the Theia frame but before the frontend shows the menu"
key-files:
  created: []
  modified:
    - theia/extensions/chrome-bar/src/browser/page-context-menu.ts
    - powerbrowser/shell/PowerBrowserAPI.sys.mjs
    - scripts/verify-page-furniture-live.mjs
    - .planning/phases/35-shell-furniture-and-page-context-menu/35-UAT.md
    - .planning/ROADMAP.md
key-decisions:
  - "C11 needs two guards. The frontend guard alone left a window open: a stale reply that settles before the new menu's push reaches Theia still sends webTabFocus, and chrome handles it after it focused the Theia frame for the new menu. That made context-menu fail about 1 run in 3 once closeMenu stopped pre-focusing"
  - "Chrome guard: webTabFocus returns menu-pending while pageMenus.pending is set for that window and is younger than PAGE_MENU_TTL_MS; the edit changes no line count, so INTERNAL-APIS.md line references stay valid"
  - "The stale-dismiss-focus plant is detected through widget.focusWanted (a page focus the stale dismissal queued while menu B is open), because the chrome guard otherwise hides the frontend guard's absence"
  - "The stale-dismissal leg runs before the target loop, so a plant goes red there and not by chance in the loop's own menu changes"
requirements-completed: [PROMPT-04]
duration: 34 min
completed: 2026-11-05
---

# Phase 39 Plan 02: C11 stale page-menu dismissal Summary

A dismissed page menu no longer takes focus from a newer one. The frontend guard (`focusPageIfLatest`) and a chrome guard (`webTabFocus` does nothing while a page menu is pending) each have a plant that goes red. The harness's closeMenu pre-focus workaround is removed.

## Performance

- Duration: about 34 min (2026-11-05T23:12Z to 23:46Z)
- Tasks: 2 of 2
- Files modified: 5

## Accomplishments

- `page-context-menu.ts`: `latestMenuId` is set in `open()` after the unknown-tab early return. The send catch and the end of `settle()` call `focusPageIfLatest(widget, menuId)`. The `pageMenuRowRefused` toast still shows unconditionally, and the `keepsFocus` and grant early returns are unchanged.
- `PowerBrowserAPI.webTabFocus`: if a page menu is pending in that shell window, the request returns `menu-pending` and does not focus the overlay. This is a deviation, explained below.
- `verify-page-furniture-live.mjs`:
  - Added a stale-dismissal leg to `context-menu`. Parts A/B hold menu A's dismissal reply 800 ms, open B inside it, and check that B is still open and keyboard focused 600 ms after the reply lands, with no page focus queued. B's own dismissal is then held 1500 ms, and Escape (no pre-focus) closes B. The page may take focus only after B's reply lands. Parts C/D hold C's reply until D's push arrives and render D 400 ms later. D must still be open and focused.
  - Added two plants and a `--self-test --scenario a,b` filter, and removed the closeMenu pre-focus.

## Task Commits

1. Task 1: C11 end to end (fix, plants, workaround removed): `a72d906b`
2. Task 2: UAT row 6 evidence and backlog 999.10 tick: `00f0f34a`

## Verification (real output)

The first leg version (parts A/B only, frontend guard not yet written) failed before the fix:
```
context-menu: FAIL -- a stale dismissal moved focus off the open menu (the page took focus when menu B closed, before menu B's own dismissal landed)
```
With the frontend guard in place and before the chrome guard, the C/D leg failed:
```
context-menu: FAIL -- a stale dismissal moved focus off the open menu (menu D is closed or unfocused after menu C's dismissal landed before D rendered)
```
With the frontend guard only, the target loop also hit the same race about 1 run in 3: `context-menu: FAIL -- no pageContextMenu push for wt-... after a right-click on the video`. Instrumented, it showed chrome focus on `body`, the image menu still open, and pushes `pageContextMenu, pageFocus, pageFocus`. The Escape never reached the menu.

After both guards:
```
context-menu timing: p50 98 p95 115 n=7
context-menu: PASS
menu-not-in-ide: PASS
background-menu: PASS
```
```
  ok  clean control (no plant) -> green
  ok  stub-removed -> red on context-menu, naming 'no pageContextMenu push'
  ok  referrer-dropped -> red on context-menu, naming 'new tab request carried no Referer'
  ok  stale-dismiss-focus -> red on context-menu, naming 'a stale dismissal moved focus off the open menu'
      context-menu: FAIL -- a stale dismissal moved focus off the open menu (menu A's dismissal queued a page focus while menu B is open)
  ok  stale-focus-unguarded -> red on context-menu, naming 'a stale dismissal moved focus off the open menu'
      context-menu: FAIL -- a stale dismissal moved focus off the open menu (menu D is closed or unfocused after menu C's dismissal landed before D rendered)
verify-page-furniture-live --self-test: PASS -- the clean control is green and all 4 planted faults went red: stub-removed, referrer-dropped, stale-dismiss-focus, stale-focus-unguarded (limited by --scenario; 22 plant(s) not run)
```
Other checks:
- `context-menu` alone passed 3 times in a row after the fixes.
- The full furniture run (every scenario uses the changed closeMenu) failed only on the three known baseline defects: tooltip-status (C22), menu-edit Copy Image (C24) and saved-login (C23). theia-hover-silent was not scored because tooltip-status failed.
- `tsc --noEmit -p theia/extensions/chrome-bar`: clean. `yarn build`: exit 0, and the bundle contains `focusPageIfLatest`.
- `diff-theia-core.sh` (inside `.#theia`): PASS. `check-internals-boundary.sh` and `--catalogue`: PASS. `verify-ng-040-internals-catalogue-lines.mjs`: PASS.
- `verify-platform.sh --quick`: PASS after Task 1 and after Task 2.
- `grep -c 'this.focusPageIfLatest(widget, menuId)'` prints 2, and `grep -c 'this.latestMenuId = menuId'` prints 1.

## Deviations from Plan

**1. [Rule 1 - Bug] The frontend guard alone does not fix C11; added a chrome-side guard**
- Found during: Task 1, the first green run after the frontend fix.
- Issue: `latestMenuId` is assigned in `open()`, and Theia only learns about a menu when its push arrives. A stale reply can settle before that, and its `webTabFocus` reaches chrome after chrome already ran `theiaBrowser.focus()` for the new menu. The overlay takes focus and is then hidden, focus drops to `body`, and the Escape is lost. Removing the pre-focus, as the plan requires, made this show in about 1 of 3 runs.
- Fix: in `PowerBrowserAPI.webTabFocus`, return `menu-pending` while `pageMenus.get(window).pending` is set and younger than `PAGE_MENU_TTL_MS`. Chrome sets `pending` synchronously at the right-click and clears it when the menu's action or dismissal arrives. The edit keeps the line count the same (4 lines in, 4 out), so the INTERNAL-APIS.md line references hold.
- Files modified: `powerbrowser/shell/PowerBrowserAPI.sys.mjs`, which was not in the plan's files list.
- Commit: `a72d906b`

**2. [Rule 2 - Missing check] Leg parts C/D and plant `stale-focus-unguarded`**
- Why: the plan's leg cannot reach the pre-render window, so the chrome guard needed its own deterministic case. Parts C/D defer the new menu's render 400 ms after its push and release the held reply at that push. The plant puts back an unconditional `webTabFocus` by wrapping the exported `PowerBrowserGroupParent.prototype.receiveMessage`, in the harness only.

**3. [Rule 1 - Bug] The planned leg check alone could not catch a missing frontend guard**
- Issue: `WebTabWidget.focusPage` holds focus while a blocking layer (`.lm-Menu`) is open. A stale `focusPage` that runs after B rendered therefore leaves B focused, and the plan's "B open and focused 600 ms later" check passed before the fix. The real effect is that page focus is still queued and fires when B hides. With the chrome guard in place, the real-focus symptom of that case was hidden too, so `stale-dismiss-focus` stayed green.
- Fix: the leg also fails when `widget.focusWanted === true` while B is open, which is the page focus the stale dismissal queued. It also keeps the real-focus check that the page takes focus only after B's own reply lands.

**4. [Rule 1 - Bug] The leg runs first in context-menu, and menu A failing to open reads as a product failure**
- Why: with the leg after the target loop, `stale-focus-unguarded` went red by chance in the loop and named the wrong failure. With the leg first, `stub-removed` hit the leg's broken-instrument line instead of `no pageContextMenu push`. The leg now uses the loop's own wording for a menu that does not open.

## Known Stubs

None.

## Threat Flags

None. The chrome change only returns early in an existing handler, and no new message kind or endpoint is added. T-39-04 holds: the hold, the deferred render and both plants live only in the harness and are restored in `finally` or confined to their own session. Nothing diagnostic is left in `theia/extensions/` or `powerbrowser/shell/`.

## Notes for 39-03 onward

- `closeMenu` no longer pre-focuses. If a later scenario's menu Escape fails, suspect a new focus path before suspecting the harness.
- `--self-test --scenario a,b` now exists in verify-page-furniture-live.mjs (plants whose target is listed, plus a clean control over the scenarios they run). 39-05 and 39-06 can use it for the C22, C23 and C24 plants.
- A web-tab `webTabFocus` reply can now be `menu-pending`. No caller reads the reply (it is a `send`).
- The registry rows `page-furniture-live` and `page-furniture-live-self-test` are unchanged. The full live self-test now has 26 plants.
- REQUIREMENTS.md PROMPT-04 is not ticked. `requirements.mark-complete` ticked it, and I reverted that because 35-UAT row 6 is still skipped on C24 (999.9). Tick it in 39-05 or in the bookkeeping plan once Copy Image passes. The `roadmap.update-plan-progress` run also added about 40 blank lines across ROADMAP.md. I reverted those too and kept only the Phase 39 count (2/20) and the 39-02 checkbox.

## Self-Check: PASSED

- FOUND: theia/extensions/chrome-bar/src/browser/page-context-menu.ts (focusPageIfLatest)
- FOUND: scripts/verify-page-furniture-live.mjs (stale-dismiss-focus)
- FOUND: a72d906b and 00f0f34a are ancestors of HEAD
