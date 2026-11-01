---
phase: 35-shell-furniture-and-page-context-menu
plan: "05"
subsystem: shell-furniture
tags: [PROMPT-04, D-16, D-08, EXT-08, G4b, page-context-menu, extension-menus, freeze-frame, furniture-gate, live-harness]
status: complete
requires:
  - phase: 35-shell-furniture-and-page-context-menu
    provides: 35-03's stub popupshowing path, pending record and handlePageMenuAction; 35-04's dynamic row kinds, PAGE_MENU_DYNAMIC and the live harness helpers
  - phase: 31.1
    provides: the shell's gBrowser.getTabForBrowser over the tab host, so the subject's tab is a tab node extensions know
provides:
  - on-build-contextmenu notified with upstream's subject (menu = the #contentAreaContextMenu stub), so ext-menus builds extension entries into it
  - extension entries forwarded as extension-entry rows after the stock rows (label-only, their own groups, submenus kept); a pick runs the element's doCommand
  - popuphidden dispatched on the stub on every page menu close (pick, dismiss, replacement, empty menu, error), so ext-menus removes its items
  - the G4b freeze-frame -- a JPEG still of the right-clicked overlay's viewport (at most 640 px wide) pushed as pageStill when the capture beats a 50 ms deadline
  - WebTabChannel pageStill subscriber and WebTabWidget.showStill, painting img.pb-web-tab-still until the menu's blocking layer closes
  - furniture rule 8 (subject keys == upstream's) with plants (o) and (p); extension-entry in DYNAMIC_KINDS; rule 6 arm regex widened to extension-*
  - bridge self-test plant for the pageStill subscription
  - live scenarios extension-entry and freeze-frame, plants ext-cleanup-skipped, ext-command-dropped, still-not-painted
affects:
  - 35-06 and 35-07 (the boundary file now ends with pageMenuStill; pageMenuClose is the one close path)
  - Phase 38 (toolbar buttons, the puzzle menu and extension popups stay there)
tech-stack:
  added: []
  patterns:
    - a dynamic row whose PAGE_MENU_DYNAMIC entry returns built items (ids, groups, children) instead of labels; pageMenuItems pushes them as they are
    - a capture raced against a deadline with Promise.race; the loser is dropped when it settles, never pushed late
    - one close helper (pageMenuClose) for every exit of a page menu, so cleanup cannot be skipped on one path
key-files:
  created: []
  modified:
    - powerbrowser/shell/PowerBrowserAPI.sys.mjs
    - powerbrowser/INTERNAL-APIS.md
    - theia/extensions/chrome-bar/src/browser/page-context-menu.ts
    - theia/extensions/tab-uris/src/browser/web-tab.ts
    - theia/extensions/tab-uris/src/browser/web-tab.css
    - scripts/verify-shell-furniture.mjs
    - scripts/verify-web-tab-bridge.mjs
    - scripts/verify-page-furniture-live.mjs
    - .planning/phases/35-shell-furniture-and-page-context-menu/35-VALIDATION.md
key-decisions:
  - "Extension rows use ids extension-entry-<n>, not the plan's ext-<n>: the existing dynamic-row convention is <kind>-<index>, and pageMenuRowOf resolves a row by that prefix, so no second lookup was needed."
  - "The subject is built after the facts are computed, before the stock rows are built: facts.contentSelected, facts.selected and facts.mediaURL are upstream's derivations already, so the subject reuses them."
  - "Every page menu exit now goes through pageMenuClose(data), which fires popuphidden on the stub and then actor.hiding(). The one exception is a right-click on a hidden overlay (no notify happened); dispatching there would strip the open menu's extension items."
  - "drawSnapshot passes fullViewport = true, so a scrolled page's still is the view the user sees, not the document's top. The plan's (0, 0, w, h) rectangle is document-relative."
  - "The still's 50 ms timer starts when openPageMenu starts, in parallel with the facts and label formatting. The menu therefore waits at most 50 ms minus the facts time for the still, never more than 50 ms."
  - "A still is removed on the first publish after the blocking layer has shown and closed. The pageStill push precedes the menu's, so a publish in between keeps it; a still whose menu never shows goes on the first publish after one second."
  - "The frontend needed no rendering change: page-context-menu.ts already renders any chrome-run row with groups, children and checked state. It gained a doc paragraph only."
patterns-established:
  - "pageMenuClose(data) is the only way a page menu ends; a new exit path must call it."
requirements-completed: []
duration: "approx. 55 min"
completed: "2026-10-31"
commits: 3
plan_head_before: f33b4fcd6f9a4cbd647cb106571d851056b0d428
plan_head_after: 795a95ac3715796dcf11f6e2c4e129eebcf8c305
actuals:
  tokens: 17000
  tasks: 3
  commits: 3
---

# Phase 35 Plan 05: Extension entries and the G4b freeze-frame Summary

**Extension context-menu entries now reach the page menu, and the page shows a still under the menu when the capture makes 50 ms.**

- **Extension entries (D-16).** Chrome notifies `on-build-contextmenu` with upstream's subject, and the subject's `menu` is the stub. ext-menus builds its items there. Chrome forwards them after the stock rows, runs `doCommand` on a pick, and fires `popuphidden` when the menu closes.
- **Freeze-frame (D-08).** Chrome draws the right-clicked overlay and races the draw against 50 ms. An on-time still is pushed before the menu and painted on the placeholder. A late one is dropped.

## Status

The static scope is complete and all three tasks are committed.

- `scripts/verify-platform.sh --quick` exited 0 after each task.
- Both Theia typechecks report no errors.
- `yarn build` exits 0, and `bundle.js` contains `pb-web-tab-still`.

None of the live checks has run: this lane has no objdir. The run printed `purgecaches: MOZ_PURGE_CACHES=1` and then `harness: ... objdir/dist/bin/powerbrowser does not exist`. The ROADMAP research probes are deferred (see Deferred):

- right-click in an overlay
- freeze-frame latency

## G4b verdict

**Deferred.** No `freeze-frame timing:` line exists. 35-03's `context-menu timing:` line was never measured either, so the plan's documented fallback applies: the budgets are enforced in code and measured live later.

- **50 ms capture deadline:** enforced in code by `PAGE_STILL_DEADLINE_MS`. A late capture is never pushed.
- **200 ms p95 right-click to menu:** a FAIL condition in `freeze-frame`. Not measured.
- **On-time fraction and still-arrival p50/p95:** printed by `freeze-frame`. Not measured.

35-VALIDATION.md's G4b record states the same.

## Performance

- Tasks: 3/3
- Commits: 3 task commits plus this docs commit
- `--quick`: exit 0 after each task (about 4 minutes each)
- `yarn build`: exit 0

## Accomplishments

- **Subject (Task 1).** `pageMenuExtensionEntries` builds the 26-key subject literal from the captured data, as `setContext` derives each field:
  - `tab` comes from `window.gBrowser?.getTabForBrowser`.
  - `linkURI` comes from `Services.io.newURI` (null on a parse failure).
  - `webExtBrowserType` comes from the overlay's `webextension-view-type` attribute.
  - `selectionText` is set only when text is selected.

  It sets `wrappedJSObject` and notifies.
- **Forwarding.** `pageMenuExtensionItems` walks the stub's children:
  - A separator starts a new `extension-<n>` group.
  - A `menu` becomes a submenu of its `menupopup`. An empty submenu is dropped.
  - A checkbox or radio item carries `checked`. A disabled item is shown disabled and never offered.
  - Each element is kept in `pending.extensionItems`.

  The new row line `{ dynamic: "extension-entry", when: "extensionEntries", runs: "chrome", group: "extension" }` is the table's last line.
- **Pick and cleanup.** The `case "extension-entry"` arm calls `doCommand()` on the recorded element.
  - `pageMenuClose` replaced every `actor.hiding()` call on a captured menu: the action's `finally`, the replaced pending menu, the empty-menu return and the error catch.
- **Freeze-frame (Task 2).** `pageMenuStill` starts as `openPageMenu` starts.
  - It draws the overlay's viewport at most 640 px wide, white background, into a canvas, and encodes JPEG at quality 0.8.
  - The draw races a 50 ms timer.
  - `openPageMenu` awaits it after the rows are built and pushes `pageStill` before `pageContextMenu` when a data URL won.
  - A capture error is logged as `[web-tab] pageStill capture failed: <message>`.
- **Placeholder.**
  - `WebTabChannel` subscribes `onPush('pageStill', ...)` and accepts only a `data:image/jpeg;base64,` string for a known tab.
  - `showStill(menuId, dataUrl)` replaces any earlier still with `img.pb-web-tab-still` (empty alt, `data-menu-id`).
  - `settleStill()` runs in each `publish()` frame.
  - The CSS is absolute and `inset: 0`, with `object-fit: fill` and `pointer-events: none`. It sets no colour.
- **Gates.**
  - Furniture rule 8 reads the keys of upstream's `let subject = {` literal and the section's `const subject = {` literal and compares them as set equality.
    - Plant (o), a dropped `frameId`, goes red as missing.
    - Plant (p), an invented key, goes red as surplus.
  - `extension-entry` joins `DYNAMIC_KINDS` with its reason.
  - Rule 6 matches `case "extension-..."` arms.
  - The bridge self-test plants a `web-tab.ts` without the `pageStill` subscription; it goes red naming `pageStill` (38 plants).
- **Catalogue.** Five new Touchpoints rows:
  - Task 1: `Services.io.newURI`, `gBrowser`, `wrappedJSObject` and `Services.obs.notifyObservers` (`on-build-contextmenu`)
  - Task 2: `drawSnapshot`

  References below each edit were remapped from `git diff -U0 HEAD` hunks, and then `--fix` made no change. The misplaced setIcon row is still `:6481`.
- **Live harness (Task 3).**
  - **`extension-entry`** writes a two-file MV2 extension into a fresh temp directory and installs it over BiDi.
    - It polls up to ten right-clicks for the row, because the background script may register after the first menu.
    - It checks that the row is after every stock row, then picks it.
    - It requires `/ext-clicked?page=<url>&tab=<n>` within 5 s, then exactly one row in the next menu.
    - It uninstalls the extension and removes the directory in `finally`.
  - **`freeze-frame`** runs 20 timed cycles on `/still`, using a Theia-frame recorder for pushes and `.lm-Menu` visibility.
    - It checks the painted still while the overlay is hidden, then checks the still is gone after Escape.
    - It prints the timing line and a still-arrival note.
  - **Plants:** `ext-cleanup-skipped`, `ext-command-dropped` and `still-not-painted`. Each reads its mutation back before it notes `applied`. `still-not-painted` notes `applied` only once an on-time still arrived in its session.

## Task Commits

| Task | Commit | Subject |
|------|--------|---------|
| 1 | 8d3d4494 | feat(35-05): extension entries in the page menu -- on-build-contextmenu, forwarding, pick and cleanup (D-16) |
| 2 | 199adc60 | feat(35-05): G4b freeze-frame -- a page still under the page menu within a 50 ms deadline (D-08) |
| 3 | 795a95ac | feat(35-05): live extension-entry and freeze-frame scenarios with the G4b measurement |

## Deviations from Plan

### Scope Deviations (recommended option taken at each choice point)

1. **Row ids are `extension-entry-<n>`, not `ext-<n>`.** This follows the `<kind>-<index>` convention that `pageMenuRowOf` already resolves. `pending.offered` stays a Set, and a separate `pending.extensionItems` Map holds the elements.
2. **The notify happens after the facts and before the stock rows are built**, not after the rows. The order has no effect on the result, and the facts supply upstream's derived values.
3. **`drawSnapshot(..., fullViewport = true)`.** It captures the visible viewport, not the document rectangle at (0, 0).
4. **The still's deadline runs in parallel with the facts.** The timer starts with `openPageMenu`, so the menu never waits more than 50 ms in total for a still.
5. **A one-second orphan guard** removes a still whose menu never showed. The plan had no rule for that case.
6. **Furniture plant (p)** (an invented subject key) was added beside the required (o), so the rule is proven red in both directions.
7. **`page-context-menu.ts` gained documentation only.** It already renders chrome-run rows of any shape.
8. **`freeze-frame` uses a MutationObserver** for menu visibility, not a poll. It records the visible `.lm-Menu` at the mutation that attaches it, which is more precise than a poll interval.

### Auto-fixed Issues

None.

## Deferred (live/human)

The owner ruling defers every item below to the end-of-milestone pass.

- **Not run:** `node scripts/verify-page-furniture-live.mjs --scenario context-menu,extension-entry,freeze-frame`. There is no built binary. This covers the "Live check: an installed test extension's entry works from the page menu, and the freeze-frame timing is measured against its budgets" truth.
- **Not run:** `node scripts/verify-page-furniture-live.mjs --self-test`. The three new plants are unproven live, as are the earlier thirteen.
- **ROADMAP research probe: right-click in an overlay.** Deferred. There is no measured `context-menu timing:` line from 35-03 either.
- **ROADMAP research probe: freeze-frame latency (G4b).** Deferred. The verdict above is recorded as deferred in this SUMMARY and in 35-VALIDATION.md.
- **Tracer feedback gate (Task 1).** The automated `<verify>` passed end to end. A live extension pick has not been observed.
- **Live unknowns to confirm:**
  - Whether BiDi `webExtension.install` with `type: "path"` accepts an unpacked directory in this build.
  - Whether ext-menus' tracker is registered for a temporarily installed extension before the first right-click. The scenario polls up to ten menus to allow for it.
  - Whether `tabTracker` gives the tab-host node a non-negative id. This is the 31.1 dependency behind `menus.onClicked`'s `tab`.
  - Whether `doCommand()` on a menuitem of a never-opened menupopup dispatches `command`.
  - The real capture time of `drawSnapshot` on a remote overlay, and so the on-time fraction.
- **Visual check:** the still under the menu matches the page and fills the placeholder without distortion at the window's aspect ratio.

## Cross-lane assumptions

- No Phase 33 or Phase 34 artifact is used.
- The subject's `tab` relies on Phase 31.1's tab host (`window.gBrowser.getTabForBrowser`). That code is already in this tree at `PowerBrowserAPI.sys.mjs:6468`.

## Known Stubs

None. The extension row has a dispatcher arm (rule 6), and the still has a subscriber (bridge rule 9).

## Threat Flags

None beyond the plan's register:

- T-35-18: extension labels render as plain text in their own groups after the stock rows, and a pick dispatches only to an element this menu recorded.
- T-35-19: the still goes only to the same window's Theia frame and is never logged or stored.
- T-35-20: the 50 ms deadline is in code, and the 200 ms p95 budget is a live FAIL condition.

The subject hands extensions the page URL, link, frame URL and selection text. That matches upstream exactly, and rule 8 pins it.

## Not in scope (Phase 38)

Toolbar buttons, the puzzle menu and extension popups. `menus.refresh()` while the Theia menu is open is also not carried: the rows are a snapshot taken at open.

## Blockers

None.

## Next Plan Readiness (handoff facts for 35-06 onward)

- **Boundary file.**
  - The file now ends with `pageMenuExtensionEntries`, then `pageMenuExtensionItems`, then `pageMenuClose`, then the `PAGE_STILL_*` constants and `pageMenuStill`. Append after `pageMenuStill`.
  - The setIcon row is still `:6481`.
  - Remap catalogue references from `git diff -U0 HEAD` hunks once per task, then confirm that `--fix` is a no-op.
- **Closing a page menu.** Every exit calls `pageMenuClose(data)`. A new exit path must call it too, or ext-menus' items stay in the stub and the next menu duplicates them.
- **Dynamic rows** may now return built items from `PAGE_MENU_DYNAMIC` (objects with `id`, `label`, `enabled`, `group`, and optional `children` or `checked`). Such items must add their own enabled ids to `pending.offered`.
- **Dispatcher arms** may start `context-`, `spell-` or `extension-`. Any other prefix needs furniture rule 6's regex widened again.
- **Furniture gate.**
  - Rules 1-8 are taken. The next free rule is 9.
  - Plants (a)-(p) are taken. The next is (q).
  - `FILES.nsContextMenu` is available for upstream reads.
- **Push kinds.** `pageStill` is pushed before `pageContextMenu` for the same `menuId`.
  - `WebTabWidget.showStill` and `settleStill` own the still.
  - Bridge self-test plants number 38.
- **Live harness.**
  - New scenarios go at the end of `SCENARIOS`. `extension-entry` and `freeze-frame` are last, and `extension-entry` uninstalls its extension in `finally`, so later scenarios see stock menus.
  - `serveAssets` now records `search` per request and answers `/ext-clicked` with 204.
  - The `/still` page is 1280x720 of colour.
  - Helpers: `installFreezeRecorder`, `freezeState`, `stillPainted`, `stillShown`, `applyExtensionPlants`.

## Self-Check: PASSED

- FOUND: `"on-build-contextmenu"`, one line (`PowerBrowserAPI.sys.mjs:7657`), in the Phase 35 section (header at :6798)
- FOUND: the `extension-entry` DYNAMIC_KINDS entry with its reason (`verify-shell-furniture.mjs:88`)
- FOUND: `onPush('pageStill'`, one line (`web-tab.ts:448`)
- FOUND: `.pb-web-tab-still` (`web-tab.css:76`)
- FOUND: commits 8d3d4494, 199adc60 and 795a95ac (ancestors of HEAD)
- `node scripts/verify-shell-furniture.mjs --self-test`: PASS, plants (a) to (p), and (o) names the dropped `frameId`
- `node scripts/verify-web-tab-bridge.mjs --self-test`: PASS, 38 plants, and the pageStill plant goes red naming `pageStill`
- `bash scripts/check-internals-boundary.sh` and `--catalogue`: PASS; `node scripts/verify-ng-040-internals-catalogue-lines.mjs`: PASS
- `tsc -b theia/extensions/tab-uris` and `tsc --noEmit -p theia/extensions/chrome-bar`: no `error TS`
- `scripts/verify-platform.sh --quick`: exit 0 after Task 3
