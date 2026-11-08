---
phase: 29-address-bar-search-and-fixup
plan: 07
subsystem: chrome-bar address bar / live address-bar check
status: complete
tags: [BAR-06, BAR-08, switch-to-tab, new-tab-targets, live-check]
requires: [29-06]
provides:
  - "CHROME_BAR_COPY.switchToTab ('Switch to Tab'), pinned; rendered as .pb-chrome-bar-row-switch after an open-tab row's codicon-browser marker"
  - "liveTabFor(row), switchToTab(row) (prototype method), chooseRow(row): plain click and Enter share one choice path"
  - "urlForRow(row | undefined), openRowInNewTab(row | undefined, foreground)"
  - "runOneOff target 'foreground' (Alt+Enter on a highlighted one-off)"
  - "Live scenarios switch-to-tab and new-tab-targets; plant tab-row-navigates"
affects: [29-08, 29-09, 29-10]
tech-stack:
  added: []
  patterns:
    - "Before an activation, the pill's text is reset to the committed address so syncAddressFromWidget is not held off as an edit in progress"
    - "A no-load assertion keyed by tab id rather than URL: a navigating tab's first loading push still carries its old URL"
key-files:
  created: []
  modified:
    - theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx
    - theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar.css
    - scripts/verify-shell-error-copy.mjs
    - scripts/verify-address-bar-live.mjs
    - scripts/verify-chrome-bar-suggestions.mjs
decisions:
  - "Alt+Enter on a highlighted one-off opens that engine's search in a new foreground tab (runOneOff 'foreground'). 29-06 left it unhandled."
  - "With no current widget to open after, openRowInNewTab appends the tab with openUrl, so the tab is selected even for a background gesture. A non-http(s) address shows the commit-failure row and opens nothing."
  - "Alt+Enter reaches the pill with no Theia passthrough binding. The live gesture, synthesised at the parent through nsITextInputProcessor, opened the tab, so chrome-bar-keybindings.ts was not changed."
  - "'Joined to the active group' is checked by recording GroupModel.joinActiveGroup calls in the page realm. The harness profile has no active group, so the join itself is a no-op there."
metrics:
  duration: 40m
  completed: 2026-10-21
  tasks: 2
  files: 6
commits: 2
plan_head_before: d6a230a4a44f6eb9226e2c3d356554735efa4ec7
plan_head_after: 0582cede81d4d1ac3f98622f9f5a559d03e5e0e5
actuals:
  tokens: 7500
  tasks: 2
  commits: 2
---

# Phase 29 Plan 07: Switch to Tab and new-tab targets Summary

An open-tab row in the address bar now reads "Switch to Tab". Choosing it by click or Enter activates the existing tab, puts focus in its page and starts no load. Alt+Enter opens typed text, the highlighted row or a highlighted one-off in a new foreground tab directly after the current one. Ctrl+click and middle-click on any row open it in a new background tab after the current one, and that includes an open-tab row, which opens its address again instead of switching.

## What was built

- **Copy**: `switchToTab: 'Switch to Tab'` in `CHROME_BAR_COPY`, pinned in `EXPECTED_NAV_COPY`. It renders in a `.pb-chrome-bar-row-switch` span after the type marker, styled as a 12px muted caption (no accent).
- **Switching (BAR-06)**:
  - `liveTabFor(row)` returns the first page-bearing `WebTabWidget` in `main` whose `url` equals `row.url`. This is the same match `placeRowsOf` uses to keep tab rows.
  - `switchToTab(row)` resets the pill text to the committed address, closes the dropdown, then calls `shell.activateWidget(widget.id)` and `widget.focusPage()`. Nothing navigates. A tab that closed since the query falls back to `commitRow(row)`.
  - `chooseRow(row)` is now the only path for a plain click and for Enter: the heuristic row runs `commitText`, a tab row runs `switchToTab`, and every other row runs `commitRow`.
- **New-tab gestures (BAR-08)**:
  - `urlForRow(row)` uses `row.url` for tab, bookmark and history rows. For the typed text (no row, or the heuristic row) and for an engine row's title, it calls `resolveTypedAddress(text, engineNameForRequest())` and accepts only a `visit` or `search` reply.
  - `openRowInNewTab(row, foreground)` works in this order:
    - An address that is missing or not http(s) shows the commit-failure row.
    - Otherwise the pill reverts and the dropdown closes.
    - It calls `openInBackground(url, currentWebTab() ?? shell.currentWidget)`, then `joinActiveGroup`.
    - In the foreground case it then calls `activateWidget` and `focusPage`.
  - Alt+Enter (with no Ctrl, Meta or Shift) is handled in the Enter branch. A highlighted one-off runs `runOneOff(name, 'foreground')`. Otherwise the highlighted row, or the typed text, goes to `openRowInNewTab(.., true)`.
  - A row mousedown with `button === 1`, or the primary button with Ctrl or Meta, calls `openRowInNewTab(row, false)`. `preventDefault` stops middle-button autoscroll and keeps focus in the pill.
- **Live harness** (`verify-address-bar-live.mjs`). Both scenarios open their tabs on `localhost`, which is a second site, so they stay inside the four-tab budget for 127.0.0.1.
  - `switch-to-tab`:
    - Opens /sw-a and /sw-b. A's loaded push is the positive control.
    - With B current it types "Switch Alpha". It requires the open-tab row with codicon-browser and "Switch to Tab".
    - It chooses the row by click, and then again by ArrowDown and Enter. Each time it requires: A becomes current, chrome's active element is A's overlay, the pill shows A's URL, no `loading: true` push arrives for A or B, and there is no new GET on /sw-a.
  - `new-tab-targets`:
    - Alt+Enter at the parent on `localhost:<port>/nt-fg` must open a new tab at the old index + 1 that is current, joined and focused.
    - Ctrl+mousedown on the heuristic row for /nt-bg must open a background tab after the current one, joined. /nt-fg stays current, the dropdown closes and the pill shows /nt-fg's address.
    - A middle mousedown on a seeded /nt-mid history row must do the same.
    - A Ctrl+mousedown on /nt-fg's own open-tab row must leave two tabs on /nt-fg.
  - Plant `tab-row-navigates` replaces the instance's `switchToTab` with `commitRow`.

## Verification (all run this session)

- **Static**: `verify-shell-error-copy` PASS. `verify-chrome-bar-suggestions` PASS, and its `--self-test` PASS after the re-anchor below. `tsc --noEmit -p theia/extensions/chrome-bar` reported no errors. `scan-brand-residue` PASS (the files were staged first).
- **Theia build**: `yarn build` exited 0 after each task. The bundle contains `pb-chrome-bar-row-switch` and `openRowInNewTab`.
- **Live**:
  - `--scenario search,switch-to-tab`: both PASS.
  - `--scenario search,new-tab-targets`: both PASS.
  - Full `node scripts/verify-address-bar-live.mjs`: all 12 scenarios PASS.
  - `--self-test`: PASS. The clean control is green and all 7 plants went red. `tab-row-navigates` failed with: "click: a state push with loading: true arrived after choosing the open-tab row (switching must not load): [["B","/sw-b"],["B","/sw-a"]]".
  - `node scripts/verify-nav-keys-live.mjs --scenario background-open,middle-click`: both PASS.
- **Quick gate**: `scripts/verify-platform.sh --quick` PASS at the end.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The `row-key-fed commit` plant in verify-chrome-bar-suggestions lost its anchor**
- **Found during:** Task 2, the `--quick` gate (`gui06-chrome-bar-suggestions-self-test` FAIL: "did not modify the source; the anchor it edits has drifted").
- **Cause:** `chooseRow` replaced the two `void this.commitRow(row);` call sites.
- **Fix:** The plant now rewrites `: this.commitRow(row);` (the tail of `chooseRow`) to `row.uri`. It goes red naming `row.uri` again.
- **Files:** `scripts/verify-chrome-bar-suggestions.mjs`, which is not in the plan's `files_modified`.
- **Commit:** 0582ced

**2. [Rule 2 - Missing functionality] Alt+Enter on a highlighted one-off**
- **Issue:** The 29-06 carry-over noted it was not handled. Without handling it would have fallen through to the typed text and the default engine.
- **Fix:** It now runs `runOneOff(name, 'foreground')`. The live check does not cover this path.
- **Commit:** 0582ced

### Notes

- The no-load assertion is keyed by tab id rather than by URL. The plant run showed why: the navigating tab's first `loading: true` push still carried its old URL (/sw-b).
- No `alt+enter` passthrough was needed in `chrome-bar-keybindings.ts`.

## Known Stubs

None. The footer's "Alt+Enter opens in a new tab", carried since 29-05, is now true.

## Threat Flags

None. Both new surfaces are in the plan's threat model:
- T-29-27: `openInBackground` refuses non-http(s), and `openRowInNewTab` refuses before calling either opener.
- T-29-28: the exact-url match against live widgets, a fallback to commit, and no `row.uri`.

## Self-Check: PASSED

- All 6 modified files exist.
- Commits de47133 and 0582ced are ancestors of HEAD.
- `git rev-list --count d6a230a..HEAD` is 2.
