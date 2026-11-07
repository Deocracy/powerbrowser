---
phase: 35-shell-furniture-and-page-context-menu
plan: "07"
subsystem: shell-furniture
tags: [PAGE-07, D-05, D-07, D-19, KEY-04, element-fullscreen, fullscreen-warning, F11, furniture-gate, shortcut-relay, live-harness]
status: complete
requires:
  - phase: 35-shell-furniture-and-page-context-menu
    provides: 35-01's stand-in gate shim comparison, 35-02's installer section and XULBrowserWindow shim, 35-03..35-05's page menu rows and dispatcher, 35-06's furniture gate rules 1-10 and the live harness
  - phase: 31
    provides: PowerBrowserAPI.webTabIdentity securityState, used for the warning's data-identity
  - phase: 33
    provides: (cross-lane, not in this tree) the powerbrowser.chrome-bar.full-screen command that the F11 row runs
provides:
  - window.FullScreen {enterDomFullscreen, cleanupDomFullscreen} and window.PointerlockFsWarning {showFullScreen, close}, ported from browser-fullScreenAndPointerLock.js into the Phase 35 section
  - upstream's #fullscreen-warning markup in the furniture block, the browser/browser.ftl localization link and the stock fullscreen-and-pointerlock.css
  - webTabGeometry's visible-to-hidden branch exits element fullscreen (upstream's TabSelect rule)
  - the context-video-fullscreen page menu row; no page menu capture while the shell is in element fullscreen (D-19)
  - a page-scoped, unreserved F11 row (PAGE_KEYS and PAGE_SHORTCUTS) that runs Phase 33's full-screen command
  - furniture rules 11 (inDOMFullscreen set and removed) and 12 (F11 row equals upstream's Linux key_enterFullScreen, unreserved), plants (u)-(w); relay rule 6 narrowed for F11 with a reserved-F11 plant; F11 in EXPECTED_SHORTCUT_COPY
  - live scenarios element-fullscreen, fullscreen-key, f11-keeps-debug; plants warning-removed, fullscreen-standin-missing, f11-row-enabled-under-theia, tab-switch-stays-fullscreen
affects:
  - Phase 35 verification (the last plan of the phase)
  - Phase 33 merge (the F11 relay action's local command-id constant should become 33-05's exported CHROME_BAR_FULL_SCREEN_COMMAND)
tech-stack:
  added: []
  patterns:
    - a Phase 27 shim whose upstream object carries state keeps that state in an installer closure, so the literal holds only the members the actor calls
    - a chrome-run page menu row that needs a page user gesture wraps the actor call in E10SUtils.wrapHandlingUserInput
key-files:
  created: []
  modified:
    - powerbrowser/shell/PowerBrowserAPI.sys.mjs
    - powerbrowser/INTERNAL-APIS.md
    - powerbrowser/shell/powerbrowser.xhtml
    - powerbrowser/shell/powerbrowser.js
    - theia/extensions/chrome-bar/src/browser/chrome-bar-shortcuts.ts
    - scripts/verify-shell-furniture.mjs
    - scripts/verify-shell-gbrowser-standin.mjs
    - scripts/verify-shortcut-relay.mjs
    - scripts/verify-shell-error-copy.mjs
    - scripts/verify-page-furniture-live.mjs
key-decisions:
  - "The F11 relay action executes `powerbrowser.chrome-bar.full-screen`, the exact id in 33-05-PLAN.md and 33-UI-SPEC.md, through one local constant (FULL_SCREEN_COMMAND_ID in chrome-bar-shortcuts.ts). Full-screen toggling and the fullScreen store kind are not implemented here."
  - "The warning markup is written in the shell's default XHTML namespace (<div>, <span>, <button>), not with the html: prefix: the shell declares no html: prefix, so the prefixed form would be an XML parse error. The gate tokenizer drops prefixes, so parity with upstream holds (35-06 precedent)."
  - "The video Full Screen row wraps actor.mediaCommand in E10SUtils.wrapHandlingUserInput(window, true, ...). The pick arrives as an actor message, not as chrome user input, so without the wrap ContextMenuChild would run requestFullscreen() without user activation and Gecko would deny it."
  - "Tab-switch exit is a separate one-statement branch beside the GUI-08 settle-capture branch, because that branch also requires entry.uri."
patterns-established:
  - "Stand-in self-test plants that append a staged definition must rename the real definition away once the boundary file defines that shim (plant (j) now does)."
requirements-completed: []
duration: "approx. 70 min"
completed: "2026-11-01"
commits: 3
plan_head_before: 78c7592bcdd9475a5b0a1f376a613fa3cfee940b
plan_head_after: 0c31f058b8152282cf8954782c031fa58bae3759
actuals:
  tokens: 24600
  tasks: 3
  commits: 3
---

# Phase 35 Plan 07: Element fullscreen, the stock warning and F11 Summary

**A page's element fullscreen now completes in the shell with Firefox's own fullscreen warning, through FullScreen and PointerlockFsWarning stand-ins ported from upstream. F11 on a page runs Phase 33's full-screen command, and the IDE keeps F11.**

- **Stand-ins (D-05).** `installFullscreen(window)` in the Phase 35 section defines `window.FullScreen` and `window.PointerlockFsWarning` with exactly the members DOMFullscreenParent calls. `verify-shell-gbrowser-standin` reports both compared and equal. Entry aborts unless the browser is a visible overlay of the active window (T-35-25). The root `inDOMFullscreen` attribute is set on entry and removed on cleanup.
- **Warning.** Upstream's `#fullscreen-warning` subtree is in the furniture block, with `browser/browser.ftl` and `chrome://browser/skin/tabbrowser/fullscreen-and-pointerlock.css` linked from the head. On every entry the warning names the top level's base domain, carries upstream's `verifiedDomain`/`unknownIdentity` from `webTabIdentity`, and has the Exit Full Screen (Esc) button. Nothing suppresses it (T-35-24).
- **Exits.** Esc is Gecko's own. The warning's exit button calls `document.exitFullscreen()`. A tab switch exits through webTabGeometry's hide branch.
- **Page menu.** The `context-video-fullscreen` row enters element fullscreen on a video. While the shell is in element fullscreen, the `nsContextMenu` setter keeps no capture, so the actor hears `hiding()` and no Theia menu opens (D-19).
- **F11 (D-07, KEY-04).** A page-scoped, unreserved `fullscreen` row in `PAGE_KEYS` and `PAGE_SHORTCUTS`. It is created disabled and is enabled only while an overlay has focus.

## Status

All three tasks are committed and the static scope is complete.

- `scripts/verify-platform.sh --quick` exited 0 after each task. The last run was after Task 3.
- `verify-shell-furniture` and its self-test pass, with plants (a)-(w).
- `verify-shell-gbrowser-standin` and its self-test pass.
- `verify-shortcut-relay` and its self-test pass, with 20 plants.
- `verify-shell-error-copy` passes.
- `check-internals-boundary`, `--catalogue` and `verify-ng-040-internals-catalogue-lines` pass.
- `tsc --noEmit -p theia/extensions/chrome-bar` is clean. `yarn build:extensions` and the full `yarn build` exited 0.
- The live run is deferred because this lane has no objdir (see Deferred). `node scripts/verify-page-furniture-live.mjs --scenario element-fullscreen` printed the `purgecaches:` line, then `harness: ... objdir/dist/bin/powerbrowser does not exist`.

## Performance

- Tasks: 3/3
- Commits: 3 task commits plus this docs commit
- `--quick`: exit 0 after each task (about 4 minutes each)

## Task Commits

| Task | Commit | Subject |
|------|--------|---------|
| 1 | 2fbd617b | feat(35-07): element fullscreen -- FullScreen and PointerlockFsWarning stand-ins with the stock warning (D-05) |
| 2 | 98b728c5 | feat(35-07): F11 on a page, the tab-switch fullscreen exit and the video Full Screen row (D-07, D-19) |
| 3 | 0c31f058 | feat(35-07): live element-fullscreen, fullscreen-key and f11-keeps-debug scenarios |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The video Full Screen row would have been denied by Gecko**
- **Found during:** Task 2
- **Issue:** `ContextMenuParent.mediaCommand` forwards `windowUtils.isHandlingUserInput`, and ContextMenuChild runs the command under that flag (`E10SUtils.wrapHandlingUserInput`). The pick reaches chrome as an actor message from the Theia frame, not as chrome user input, so the flag was false and `media.requestFullscreen()` would run without user activation and be denied.
- **Fix:** The `context-video-fullscreen` arm calls `mediaCommand` inside `furnitureLazy.E10SUtils.wrapHandlingUserInput(window, true, ...)`. The pick is the user's click on the row and is already walled (single-use menu, offered row, at most 60 s old, T-35-09). A page cannot reach this path by itself.
- **Files modified:** powerbrowser/shell/PowerBrowserAPI.sys.mjs
- **Commit:** 98b728c5

**2. [Rule 3 - Blocking] Stand-in self-test plant (j) assumed no FullScreen definition existed**
- **Found during:** Task 1 (`--quick` red)
- **Issue:** Plant (j) appended a staged `window.FullScreen` to the boundary copy. With the real definition present, that made two definitions, a broken instrument, so the plant never parsed.
- **Fix:** The plant now renames the real definition away in the staged copy before appending, as plant (k) edits the real nsContextMenu.
- **Files modified:** scripts/verify-shell-gbrowser-standin.mjs
- **Commit:** 2fbd617b

### Scope Deviations (recommended option taken at each choice point)

1. **No `html:` prefix on the warning markup.** The plan says to keep upstream's `html:` prefix, but the shell declares only `xul:`. The 35-06 template precedent was followed.
2. **The furniture preprocessor accepts `#define` and `#expand` for rule 12 only.** browser-sets.inc.xhtml uses them. They are passed as dropped directives to that one call, so other files keep failing on an unknown directive.
3. **Catalogue rows are one line reference each.** `catalogue_has_row` matches a cell holding exactly one reference, so the two-line rows (prefs, PointerlockFsWarning with showFullScreen) are split into one row per line.
4. **INTERNAL-APIS.md line references were remapped** with the p35 helper, which was confirmed to target /home/chris/gsd-workspaces/p35. `--fix` was a no-op both times. The misplaced setIcon row moved from `:6482` to `:6486` (the four webTabGeometry lines sit above it).
5. **The theia build ran as `yarn build:extensions` plus the full `yarn build`.** Both exited 0. Logs are in the session scratchpad.

## Deferred (live/human)

The owner ruling defers every item below to the end-of-milestone pass.

- **Not run:** `node scripts/verify-page-furniture-live.mjs --scenario tooltip-status,...,paste-popup,element-fullscreen,fullscreen-key,f11-keeps-debug`, the full phase run. There is no built binary. This covers the truth "Live check: F11 and video fullscreen enter and exit, the warning shows, and the IDE keeps F11", and the plan's "every Phase 35 success criterion has passed in one full run".
- **Not run:** `node scripts/verify-page-furniture-live.mjs --self-test` and `scripts/verify-platform.sh --only page-furniture-live`. The four new plants and all earlier plants are unproven live.
- **No `context-menu timing:` or `freeze-frame timing:` line** was measured (35-03 and 35-05 deferrals stand).
- **Live unknowns to confirm:**
  - Whether the overlay `<browser>` covers the window through the UA `:fullscreen` rules while webTabGeometry keeps writing inline styles. It should, because the UA rules are `!important`.
  - Whether `#fullscreen-warning` shows above the fullscreen overlay as a manual popover in the top layer, and whether its stylesheet's design tokens (`--border-radius-medium`, `--font-weight-bold`) resolve in the shell. If they do not, the warning renders with square corners and normal weight.
  - Whether the overlay is visible again by the time `MozDOMFullscreen:Entered` fires after a page menu pick, which hides the overlay under the menu. If not, the entry aborts.
  - Whether chrome-scope Esc and Ctrl+Tab synthesis through nsITextInputProcessor exits fullscreen and switches tabs while the page is in element fullscreen.
  - Whether the warning's domain text, read as `textContent`, contains the served host inside Fluent's isolation marks. The check uses `includes`.
- **Visual check:** the warning slides in at the top centre with the lock or broken-lock icon, and the exit button is clickable.
- **Tracer feedback gate (Task 1).** The automated `<verify>` passed end to end. A live entry has not been observed.

## Cross-lane assumptions

- **F11** executes `powerbrowser.chrome-bar.full-screen`, the exact id in `33-05-PLAN.md:110` and `33-UI-SPEC.md:336`. It is the `FULL_SCREEN_COMMAND_ID` local const in `chrome-bar-shortcuts.ts`, run by the `fullscreen` relay action through `this.commands.executeCommand`, the same way `newTab` runs its command.
  - **Not implemented here:** full-screen toggling (`window.fullScreen`), the `fullScreen` store kind and its `window-chrome` class.
  - **Until Phase 33 lands:** the registry rejects the unknown id. The relay's catch logs `shortcut failed: fullscreen <ErrorName>` and nothing toggles.
  - **Gates:** no gate in this tree requires the command to be registered. `verify-chrome-bar-commands.mjs` does not scan `chrome-bar-shortcuts.ts`, and `verify-shortcut-relay.mjs` checks only that the action exists.
  - **At merge:** replace the local const with 33-05's exported `CHROME_BAR_FULL_SCREEN_COMMAND` from `chrome-bar-commands.ts`.
  - **Live check:** `fullscreen-key` expects `window.fullScreen` to flip, so it stays red until Phase 33 is merged. `f11-keeps-debug` is NOT SCORED until then, because its control is `fullscreen-key`.
- No Phase 34 artifact is used.

## Known Stubs

None. The F11 action depends on another lane's command. It is not a stub here.

## Threat Flags

None beyond the plan's register:

- T-35-24: the stock warning shows on every entry, with the domain and no suppression path. The live `warning-removed` plant covers it.
- T-35-25: entry aborts unless the browser is a visible overlay of the active window, and message recipients are walked as upstream does.
- T-35-26: Esc, the exit button, the tab-switch exit, and the actor's destroy cleanup through `inDOMFullscreen` (furniture rule 11).
- T-35-27: the F11 row is non-reserved and created disabled, guarded by relay rule 6, furniture rule 12 and the live `f11-keeps-debug` plant.
- The user-input wrap on the video row (deviation 1) is limited to a pick that passed the T-35-09 walls.

## Blockers

None.

## Self-Check: PASSED

- FOUND: `id="fullscreen-warning"`, one line inside the furniture block (`powerbrowser.xhtml:82`)
- FOUND: the `fullscreen-and-pointerlock.css` stylesheet link (`powerbrowser.xhtml:37`) and `href="browser/browser.ftl"` (`powerbrowser.xhtml:36`)
- FOUND: `window.PointerlockFsWarning = {` (`PowerBrowserAPI.sys.mjs:7986`) and `id: "context-video-fullscreen"` (`PowerBrowserAPI.sys.mjs:6963`)
- FOUND: `VK_F11`, one row each in `powerbrowser.js:440` and `chrome-bar-shortcuts.ts:81`
- FOUND: `f11-keeps-debug` in `scripts/verify-page-furniture-live.mjs`
- FOUND: commits 2fbd617b, 98b728c5, 0c31f058 are ancestors of HEAD; `git rev-list --count 78c7592b..HEAD` = 3
