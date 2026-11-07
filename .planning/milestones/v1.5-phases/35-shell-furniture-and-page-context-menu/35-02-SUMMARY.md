---
phase: 35-shell-furniture-and-page-context-menu
plan: "02"
subsystem: shell-furniture
tags: [PROMPT-08, XULBrowserWindow, remoteBrowserTooltip, overLink, furniture-gate, live-harness, D-01, D-04]
status: complete
requires:
  - phase: 35-shell-furniture-and-page-context-menu
    provides: 35-01's Phase 27 shim-global comparison (IDL_SHIMS for XULBrowserWindow, SHIM_DATA_MEMBERS QueryInterface) and gBrowser.shouldActivateDocShell
provides:
  - PowerBrowserAPI.installShellFurniture(window), the last member of the frozen literal, delegating to installShellFurnitureReceivers in the end-of-file "// Phase 35: shell furniture." section
  - window.XULBrowserWindow {QueryInterface, setOverLink, showTooltip, hideTooltip}, registered on the AppWindow as browser-init.js:255-258
  - the furniture block in powerbrowser.xhtml (comments "shell furniture: begin" / "shell furniture: end") holding the stock remoteBrowserTooltip
  - overLink push kind and the in-bar .pb-page-status line
  - scripts/verify-shell-furniture.mjs (quick, with --self-test plants a-h)
  - scripts/verify-page-furniture-live.mjs (live; SCENARIOS, CONTROL_OF, PLANTS for 35-03..35-07 to grow)
affects:
  - 35-03 (nsContextMenu shim: same section, same gate, furniture ids it wires go in the block)
  - 35-05/35-06 (fullscreen-warning, pointerlock-warning, PopupAutoComplete join the block; autocompletepopup is already read by furniture rule 1)
tech-stack:
  added: []
  patterns:
    - furniture block between XML comments; ids wired by literal getElementById in the Phase 35 section; each element compared with upstream's
    - overLink coalesced to one push per animation frame, latest wins
key-files:
  created:
    - scripts/verify-shell-furniture.mjs
    - scripts/verify-page-furniture-live.mjs
  modified:
    - powerbrowser/shell/PowerBrowserAPI.sys.mjs
    - powerbrowser/INTERNAL-APIS.md
    - powerbrowser/shell/powerbrowser.js
    - powerbrowser/shell/powerbrowser.xhtml
    - theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx
    - theia/extensions/chrome-bar/src/browser/chrome-bar.css
    - scripts/verify-shell-gbrowser-standin.mjs
    - scripts/verify-shell-error-contract.mjs
    - scripts/verify-web-tab-bridge.mjs
    - scripts/verify-platform.sh
key-decisions:
  - "The status line is an in-flow sibling right after the pill (flex 0 1 auto, max-width 40%). The bar is one widget in all three modes, so Organising's slot is the same position. The pill narrows while a link is hovered."
  - "The frontend keeps one status string: the latest overLink push for a tab the frontend still has wins. Chrome sends the clear for the tab that last set a status."
  - "Empty B is a broken instrument only when A is empty too. With a wired A, an empty block is MISSING FURNITURE, which plan plant (a) requires."
  - "Catalogue renumbering after the 5-line insert in the frozen literal was a deterministic +5 on every PowerBrowserAPI.sys.mjs reference above line 3970, not --fix (see Deviations)."
patterns-established:
  - "A furniture element nested inside another (for example #fullscreen-exit-button inside #fullscreen-warning) is in set B too, so the Phase 35 section must wire it by literal getElementById or the gate reports it as DEAD FURNITURE."
requirements-completed: []
duration: "approx. 60 min (start time not recorded)"
completed: "2026-10-31"
commits: 3
plan_head_before: a436a86d57c1b33944e6c52a756f3ca4b3672694
plan_head_after: a41e4e022a621aaf744139ffb1259828070d2033
actuals:
  tokens: 39000
  tasks: 3
  commits: 3
---

# Phase 35 Plan 02: Tooltips, link status and the furniture installer Summary

**Remote page tooltips and link-hover status now reach the shell through an AppWindow-registered `window.XULBrowserWindow`. Tooltips use the stock `remoteBrowserTooltip`; link status is an `overLink` push to a truncated in-bar `.pb-page-status` line. Both serve overlays only. The furniture gate and the live harness that later Phase 35 plans extend now exist.**

## Status

Complete for the static scope. All three tasks are committed, `scripts/verify-platform.sh --quick` exits 0 after each task, and the Theia build succeeds. Every live run (`tooltip-status`, `theia-hover-silent`, `pip-close`, and the live self-test) is deferred: this lane has no objdir and no built binary.

## Performance

- Tasks: 3/3
- Commits: 3 task commits plus this docs commit
- `--quick`: exit 0 after each task, about 4 minutes each
- `yarn build` (Theia extensions and browser app): exit 0

## Accomplishments

- **Installer (D-01).** `installShellFurniture(window)` is the last member of the frozen `PowerBrowserAPI` literal. Its body is one call to `installShellFurnitureReceivers(window)`. That function lives in the new end-of-file `// Phase 35: shell furniture.` section, which has its own `furnitureLazy` block for `BrowserUIUtils`. powerbrowser.js calls the installer once, right after `window.powerbrowserGetBrowser` and before `TheiaService.start`.
- **XULBrowserWindow (D-04).** It is an object literal with `QueryInterface: ChromeUtils.generateQI(["nsIXULBrowserWindow"])` and the three IDL methods, registered through `docShell.treeOwner` → `nsIAppWindow.XULBrowserWindow`.
  - `showTooltip` returns early during a drag session, when the shell window lacks focus, or when `tabIdOfBrowser(browser)` is null (the Theia frame). Otherwise it sets the label and `style.direction`, then calls `openPopupAtScreen` scaled by `devicePixelRatio`.
  - `hideTooltip` calls `hidePopup()`.
  - `setOverLink` resolves its source from a capturing `mouseover` tracker: the hovered overlay, else the focused one. It transforms the URL as browser.js:1985-2005 does (`unEscapeURIForUI`, bidi controls percent-encoded, `trimURLs`). Pushes are coalesced to one `sendWebTabPush(theiaBrowser, { kind: "overLink", ... })` per animation frame. An empty url clears the tab that last set a status, and so does `mouseover` reaching a non-overlay.
  - No log line carries a URL.
- **Markup.** The furniture block holds exactly `<xul:tooltip id="remoteBrowserTooltip"/>`. There is no `page="true"` tooltip.
- **Frontend.** `ChromeBarWidget` subscribes with `onPush('overLink', ...)` on its existing `WebTabChannel` and ignores pushes for unknown tab ids. It renders `<span className='pb-page-status' aria-label={url}>{url}</span>` after the pill, and nothing for an empty url. `.pb-page-status` is one 13px line with ellipsis truncation, a transparent background and theme tokens only. There is no `title` attribute and no `BLOCKING_LAYER_SELECTOR` change.
- **Catalogue.** Seven new Touchpoints rows at the end of the table: `:6804` defineESModuleGetters, `:6815` textToSubURI, `:6816` prefs, `:6868` `window.XULBrowserWindow`, `:6869` generateQI, `:6882` dragservice, `:6897` the AppWindow registration.
- **Furniture gate (Task 2).** `scripts/verify-shell-furniture.mjs` checks four rules:
  1. The block's id set equals the set the Phase 35 section wires, including webTabOpen's `autocompletepopup` once 35-06 adds it.
  2. Each element's start tag equals upstream's, and so do its children unless the upstream body holds an `#include`. Upstream is read after evaluating `#ifdef`/`#ifndef`/`#else`/`#endif` for a Linux build; other `#` lines are dropped.
  3. The installer member, the receivers function and the call each appear exactly once.
  4. Policy: `windowtype` appears once; the section has no `window.PopupNotifications` definition and no `tabContainer`; `.pb-page-status` is defined in the CSS and absent from `BLOCKING_LAYER_SELECTOR`.

  `--self-test` plants (a) through (h); each lands and goes red naming its drift. A side smoke test pasted upstream's `#fullscreen-warning` markup verbatim and got no parity failure; changing one child attribute went red on children.
- **Bridge plant.** `verify-web-tab-bridge.mjs --self-test` has a new case, "planted overLink subscription removed", which goes red with `chrome pushes kinds no frontend source subscribes to: overLink` (33 plants in total).
- **Live harness (Task 3).** `scripts/verify-page-furniture-live.mjs` follows the shape of `verify-nav-keys-live.mjs`.
  - Scenarios: `tooltip-status`, `theia-hover-silent` (absence, with CONTROL_OF → `tooltip-status`) and `pip-close`.
  - Five runtime plants: `tooltip-element-removed`, `overlink-unregistered`, `theia-tooltip-leak`, `status-over-page`, `pip-shouldactivate-missing`. Each notes `PLANT <name> applied` only after reading the mutation back.
  - Registry rows sit in the live block next to nav-keys-live.

## Task Commits

| Task | Commit | Subject |
|------|--------|---------|
| 1 | 5fac4505 | feat(35-02): XULBrowserWindow, remoteBrowserTooltip and the overLink status line |
| 2 | b85b01cc | feat(35-02): shell furniture gate, overLink bridge plant and registry rows |
| 3 | a41e4e02 | feat(35-02): page furniture live harness with tooltip-status, theia-hover-silent and pip-close |

## Files Created or Modified

- `powerbrowser/shell/PowerBrowserAPI.sys.mjs`: installer member; Phase 35 section with `linkStatusText` and `installTooltipsAndLinkStatus`
- `powerbrowser/INTERNAL-APIS.md`: +5 renumber of 87 references, seven new rows
- `powerbrowser/shell/powerbrowser.js`: one installer call
- `powerbrowser/shell/powerbrowser.xhtml`: furniture block with `remoteBrowserTooltip`
- `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx`, `chrome-bar.css`: overLink subscription and `.pb-page-status`
- `scripts/verify-shell-furniture.mjs` (new), `scripts/verify-page-furniture-live.mjs` (new)
- `scripts/verify-shell-gbrowser-standin.mjs`: literal-member parser fix; plants (l) and (n) now use the real definition
- `scripts/verify-shell-error-contract.mjs`: harness stub for the installer
- `scripts/verify-web-tab-bridge.mjs`: overLink plant
- `scripts/verify-platform.sh`: two quick rows, two live rows

## Decisions Made

See `key-decisions` in the frontmatter. Each choice point took the recommended option (D-00).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The stand-in gate read `generateQI` as a shim member**
- **Found during:** Task 1
- **Issue:** `objectLiteralMembers` treated any identifier followed by `(` at depth 1 as a method shorthand. In `QueryInterface: ChromeUtils.generateQI([...])`, `generateQI` was taken as a member, so the gate reported `XULBrowserWindow.generateQI` as DEAD SURFACE.
- **Fix:** The parser now accepts a key only in key position: right after the opening brace or a depth-1 comma, with `get`/`set`/`async` carrying that position to the following name. The clean-tree run of the gate and of its self-test is the regression check.
- **Files modified:** scripts/verify-shell-gbrowser-standin.mjs
- **Commit:** 5fac4505

**2. [Rule 3 - Blocking] Two stand-in self-test plants assumed XULBrowserWindow was undefined**
- **Found during:** Task 1
- **Issue:** Plants (l) and (n) appended a second `window.XULBrowserWindow = {` to the real boundary text, which now fails as a broken instrument (two definitions).
- **Fix:** (l) runs the staged IDL against the boundary file's own definition. (n) removes the real `QueryInterface` line from a staged copy and requires the copy to differ before scoring.
- **Commit:** 5fac4505

**3. [Rule 3 - Blocking] The shell-error harness threw on the new installer**
- **Found during:** Task 1 (`shell-error-contract-self-test` red in `--quick`)
- **Issue:** The harness's PowerBrowserAPI proxy throws on any unstubbed member, and powerbrowser.js now calls `installShellFurniture`.
- **Fix:** Added a no-op `installShellFurniture` stub beside the other chrome-bootstrap stubs.
- **Files modified:** scripts/verify-shell-error-contract.mjs
- **Commit:** 5fac4505

**4. [Rule 1 - Bug] `verify-ng-040-internals-catalogue-lines.mjs --fix` mis-renumbered rows**
- **Found during:** Task 1
- **Issue:** After the 5-line insert in the frozen literal, the nearest-line heuristic moved some rows to the wrong line. For example, the `searchLazy` defineESModuleGetters row went to `:5522` (`const searchLazy = {};`, which carries the `searchLazy` token) instead of `:5523`. Ten rows ended up uncatalogued.
- **Fix:** Restored INTERNAL-APIS.md from HEAD and added 5 to every `PowerBrowserAPI.sys.mjs:N` reference with N > 3970 (87 references). This includes the misplaced `setIcon` row in "Deliberately not touched", now at `:6471`. A follow-up `--fix` then made no changes, and the catalogue and ng-040 checks pass. The `--fix` heuristic itself was not changed (out of scope).
- **Files modified:** powerbrowser/INTERNAL-APIS.md
- **Commit:** 5fac4505

**5. [Rule 1 - Bug] The editing tool turned `\uXXXX` escapes into literal bidi characters**
- **Found during:** Task 1
- **Issue:** The bidi regex in `linkStatusText` was written with escapes but saved with the literal U+061C/U+200E/... characters, which would put invisible bidi controls in the source.
- **Fix:** Rewrote that span with the escapes generated by code points, then checked the bytes (`\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069` as ASCII).
- **Commit:** 5fac4505

### Scope Deviations

- Furniture rule 1: an empty block is a broken instrument only when the wired set is also empty. The plan's own plant (a) needs MISSING FURNITURE in that case.
- The live harness has five plants. `pip-shouldactivate-missing` was added because the plan's Task 3 also asks for the `pip-close` scenario.
- Self-test plants for the static gate mutate in-memory copies of the inputs, and each must differ from the original before it is scored.

## Deferred (live/human)

- `node scripts/verify-page-furniture-live.mjs --scenario tooltip-status,theia-hover-silent,pip-close`: not run (no built binary). This is the PROMPT-08 live proof: link hover shows and clears the in-bar line clear of the page rect in all three modes, `title=` hover opens the stock tooltip, and the IDE gets neither.
- `node scripts/verify-page-furniture-live.mjs --self-test`: not run. The plant mechanics (the AppWindow `XULBrowserWindow = null` read-back, deleting a member of the `gBrowser` literal, the PiP close button `#close`) are unproven live.
- Picture-in-Picture close from a web tab (T-35-28, carried from 35-01): now a written scenario (`pip-close`), still unrun.
- Visual check of the status line beside the pill with Phase 31/32/33 bar items present (layout coexistence).

## Cross-lane assumptions

- None. Nothing from Phases 33, 34, 36 or 37 is called. The status line sits after the pill; the Phase 33 star and the Phase 32 zoom chip (already in the tree) render after it.

## Blockers

None.

## Issues Encountered

None beyond the deviations above.

## Next Phase Readiness

Handoff facts for 35-03 onward:

- **Section.** New boundary code goes after `installTooltipsAndLinkStatus` at the end of PowerBrowserAPI.sys.mjs. Add receivers to `installShellFurnitureReceivers(window)`. Do not add members to the frozen literal: each line added there shifts every catalogued line below it, and `--fix` cannot be trusted to renumber them. If a literal edit is unavoidable, shift the references by the exact count.
- **Furniture ids.** Every element added between `<!-- shell furniture: begin -->` and `<!-- shell furniture: end -->`, nested ones included, must be wired by a literal `getElementById("<id>")` in the Phase 35 section, or by webTabOpen's `autocompletepopup:` value. Its start tag (and children, unless upstream's body has an `#include`) must equal upstream's element in main-popupset.inc.xhtml or fullscreen-and-pointerlock.inc.xhtml.
- **Live harness.** Add a scenario to `SCENARIOS`, an absence scenario's control to `CONTROL_OF`, and a plant to `PLANTS` with an anchored `expect` string and a `PLANT <name> applied` note after read-back.
- **Stand-in gate.** XULBrowserWindow is now compared and equal. The literal parser reads keys only in key position, so a call inside a value is no longer a phantom member.
- **INTERNAL-APIS.** The misplaced `setIcon` row is at `:6471`. If lines above it move, it must be renumbered by hand.

## Self-Check

- FOUND: scripts/verify-shell-furniture.mjs, scripts/verify-page-furniture-live.mjs (both tracked)
- FOUND: `PowerBrowserAPI.installShellFurniture(window);` once in powerbrowser.js
- FOUND: `// Phase 35: shell furniture.` at PowerBrowserAPI.sys.mjs:6787, after every pre-existing catalogued line
- FOUND: `id="remoteBrowserTooltip"` between the furniture comments; `onPush('overLink'` in chrome-bar-widget.tsx; `.pb-page-status` in chrome-bar.css
- FOUND: 5fac4505, b85b01cc, a41e4e02 (ancestors of HEAD)
- `node scripts/verify-shell-gbrowser-standin.mjs`: PASS, "Phase 27 shims XULBrowserWindow {hideTooltip, setOverLink, showTooltip}"; `--self-test` PASS
- `node scripts/verify-shell-furniture.mjs` and `--self-test`: PASS (plants a-h red)
- `node scripts/verify-web-tab-bridge.mjs` and `--self-test`: PASS (overLink case red)
- `bash scripts/check-internals-boundary.sh`, `--catalogue`, `node scripts/verify-ng-040-internals-catalogue-lines.mjs`: PASS
- `git -C upstream diff --quiet`: clean
- `scripts/verify-platform.sh --quick`: exit 0 (after Task 3)

## Self-Check: PASSED
