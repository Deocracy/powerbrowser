---
phase: 34-tab-strip
plan: "02"
subsystem: chrome-bar
tags: [tab-strip, drag-reorder, middle-click, drop, overflow, list-all-tabs, static-gate, live-harness]
requires:
  - phase: 34-tab-strip (plan 01)
    provides: TabStripWidget.moveInBar (the TabBar order helper), tabMenuRows (the close row middle-click runs), verify-tab-strip.mjs, verify-tab-strip-live.mjs scaffold, tab-strip-live registry rows
  - phase: 29/30 (address bar)
    provides: AddressBar.openDropped (BAR-13 drop path), the text drops' search route
  - phase: 27 (NAV-06)
    provides: WebTabOpenHandler.openInBackground http(s)-only wall, the New Tab command that focuses the pill
provides:
  - TabStripWidget in-strip reorder (beginDrag reorder phase, dropBefore midpoint rule, reorderTo bar-index mapping)
  - TabStripWidget middle-click close, empty-strip double-click, link/text/file drop handling
  - TabStripWidget.measureOverflow, the List All Tabs chevron and menu, the shared showMenu helper
  - TabStripWidget.searchDropped callback, wired to AddressBar.openDropped in ChromeBarContribution.onStart
  - LINK_DRAG_TYPES and droppedTextOf exported from address-bar-rows.ts
  - verify-tab-strip.mjs check 7 (overflow) and plants uncatalogued-kind-added-34-02, chevron-without-overflow
  - live scenarios reorder, middle, double, drop, overflow, each with a --self-test plant
affects:
  - 34-03 (pin: pinned tabs lead the TabBar order, so List All Tabs and reorder inherit pinned-first)
  - 34-04 (attention dot joins the List All Tabs rows; the shortcut comment marks the spot)
  - 34-05 (modes scenario re-reads the order that reorder writes)
tech-stack:
  added: []
  patterns:
    - in-strip reorder phase before the dock drag, decided by whether the pointer stays inside the row (Lumino's own tab-bar shape)
    - per-render measurement through a function component's useLayoutEffect (AfterRender) inside a class ReactWidget
    - cross-module callbacks set at onStart (searchDropped beside bookmarkTabs) to avoid an address-bar import cycle
key-files:
  created: []
  modified:
    - theia/extensions/chrome-bar/src/browser/tab-strip-widget.tsx
    - theia/extensions/chrome-bar/src/browser/chrome-bar.css
    - theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx
    - theia/extensions/chrome-bar/src/browser/address-bar/address-bar.tsx
    - theia/extensions/chrome-bar/src/browser/address-bar/address-bar-rows.ts
    - scripts/verify-tab-strip.mjs
    - scripts/verify-tab-strip-live.mjs
    - scripts/verify-shell-error-copy.mjs
key-decisions:
  - "Reorder and dock drag share one gesture: past the 5px start, a press on a strip tab reorders while the pointer stays inside the row's box; leaving the row hands the same gesture to the unchanged Lumino dock drag. Stacked tabs (the pill items) go straight to the dock drag as before."
  - "The drop index is computed over the tabs the strip shows and mapped to the home pane TabBar index, because the strip hides some of that bar's titles (PAN-03 group membership, the stack). Lumino's insertTab moves a title to exactly the given index, so the index shifts by one when the title moves rightward."
  - "Middle-click closes through the close row of tabMenuRows, so it uses the shell's close path and the close failure sentence; mousedown and auxclick button 1 are both preventDefault-ed."
  - "Text drops reach the pill through a searchDropped callback set in ChromeBarContribution.onStart, not an AddressBar injection: address-bar.tsx already imports tab-strip-widget.tsx, and the reverse import would put an undefined class in an @inject decorator."
  - "A file drop is refused like any non-http(s) link: openInBackground is http(s)-only (the NAV-06 wall), so a file:// URL cannot open as a strip tab."
  - "Plain text counts as a link when it is one token with a scheme (javascript:, mailto:, file:); host:port text such as localhost:3000 is not a scheme and goes to the pill."
  - "The List All Tabs chevron is excluded from chrome's window-drag handles and a row scroll republishes them, or the chevron would sit under a handle in the live shell."
  - "The existing unlayered .pb-tab.is-dragging rule changed from 0.4 to 0.6 instead of adding a layered 0.6, which the unlayered rule would override."
patterns-established:
  - "A strip menu = a CompoundMenuNode passed to showMenu(menu, anchor, context, marks); the gate checks every strip menu goes through showMenu and showMenu through ContextMenuRenderer."
  - "A strip tab node carries data-pb-tab=<widget id>; tabNode(widget) and the live scripts find tabs by it."
requirements-completed: [TAB-02, TAB-03, TAB-04, TAB-08]
duration: "about 40 minutes of execution"
completed: 2026-11-01
status: complete
commits: 3
plan_head_before: 8672283e9032a3ceb34406315a3e17a60fef5c0c
plan_head_after: 2908da003f4c77d59ce6df95a0700fd296cae7d1
actuals:
  tokens: 13900
  tasks: 3
  commits: 3
---

# Phase 34 Plan 02: Drag reorder, middle/double/drop and overflow Summary

**Strip tabs reorder by a midpoint-rule drag that moves the title in the home pane TabBar (insertTab), with a 2px drop indicator and 8px edge auto-scroll; middle-click closes a tab and is consumed so Gecko never pastes; a double-click on the empty strip opens a new tab with the pill focused; dropped http(s) links open in the background at the drop position, text searches through the pill, and javascript:, other schemes and files are refused with a sentence; an overflowing row gets a List All Tabs chevron whose menu activates a tab and scrolls it into view. No new kind is added.**

## Status

Complete for build work and every static check. All five live scenarios are written and parse, but were not run. The lane ruling is no Gecko build and no live browser. One finding about the live shell needs the end-of-milestone pass: chrome's window-drag handles cover the empty strip (see Deferred).

## Performance

- **Tasks:** 3 of 3 executed.
- **Commits:** 3 production commits (`7d19ccee`, `17840901`, `2908da00`), then the SUMMARY commit.
- **Realized diff:** 889 insertions and 54 deletions over 9 files, about 13,900 tokens by chars/4 over the diff. The plan estimate was 95,000 on the same scale.

## Accomplishments

- **Reorder (TAB-02, D-05).** `beginDrag` gains a reorder phase. After the 5px start, a press on a strip tab tracks the pointer while it stays inside `.pb-tab-strip-row`'s box. `dropBefore(x)` applies the midpoint rule: the drop lands before the first shown tab whose horizontal midpoint is past the pointer, or after the last tab. `aimReorder` repaints the dragged tab (`is-dragging`, opacity 0.6) and the 2px accent indicator (`is-drop-before` on the target, or `is-drop-after` on the last tab). It shows no indicator where the drop would change nothing. A pointer resting in the row's 8px edge zones scrolls the row 8px per frame and re-aims the drop. On release, `reorderTo` maps the drop to the home pane TabBar index and calls 34-01's `moveInBar` (`TabBar.insertTab`, then `update`). If the pointer leaves the row, the same gesture goes to `startWidgetDrag`, unchanged. A one-shot capture click swallow stops the release from activating the tab under it. The order is read live from the TabBar; the strip keeps no copy of it (A-01).
- **Middle-click (TAB-03, D-06).** Each strip tab gets `onMouseDown` (button 1: preventDefault) and `onAuxClick` (`onTabAuxClick`: preventDefault, stopPropagation, then the close row through `runRow`). The click is consumed, so `EventStateManager::PostHandleMouseUp` never reaches `HandleMiddleClickPaste`.
- **Double-click (TAB-03).** `onStripDoubleClick` on the row runs `CHROME_BAR_NEW_TAB_COMMAND_ID` unless the target is inside a tab or the notice. The New Tab command focuses the pill. The row's tooltip is `CHROME_BAR_COPY.emptyStripTooltip` ("Double-click to open a new tab"). Tabs override it with their own `title`.
- **Drop (TAB-08, D-06).** `onStripDragOver` takes link, file and text types and stops Theia's document listener. `onStripDrop` reads the payload with `droppedTextOf`, then:
  - An http(s) payload goes to `openDroppedLink`: `openInBackground(url, ref)`, `joinActiveGroup`, then `reorderTo` to the midpoint-rule position.
  - Plain text that is not a scheme address goes to `searchDropped`, which is `AddressBar.openDropped`.
  - Anything else (a file, a non-http(s) link type, or a scheme address in plain text) shows `CHROME_BAR_COPY.dropTabFailed`: "{App} can't open that link in a tab. Drop a link to a web page instead."
- **Overflow and List All Tabs (TAB-04, D-07).** The row is `flex: 1; min-width: 0`, scrolls horizontally, and hides its scrollbar until hover (`scrollbar-width`). `measureOverflow` sets `overflowing = scrollWidth > clientWidth` and runs:
  - after every render commit, through the `AfterRender` component's `useLayoutEffect`;
  - on every strip resize, through a `ResizeObserver` on the strip node.
  The 24x24 `.pb-tab-strip-chevron` (`codicon-list-selection`, tooltip and label "List All Tabs") renders only under `this.overflowing`, outside the row. It opens `openListAllMenu`, a per-request `CompoundMenuNode` of every strip tab in strip order with the current tab checked. A web tab row shows the globe icon, or the crash mark for a crashed tab. Picking a row calls `activateTab`, then `scrollIntoView({ inline: 'nearest' })` on the tab node.
- **Shared menu path.** `showMenu(menu, anchor, context, marks)` now holds 34-01's render-and-mark block. The tab menu and List All Tabs both go through it. The List All Tabs menu carries `pb-tab-menu pb-tab-list-menu`, so it has 32px rows and the live script can find it.
- **Static gate.** `verify-tab-strip.mjs` changes:
  - The occlusion check now requires `showMenu` to call `this.menus.render`, and both menu openers to call `showMenu`.
  - Check 7 (overflow) requires three things: `measureOverflow` derives `x.scrollWidth > x.clientWidth`, it is the only writer of `this.overflowing`, and `render` guards the chevron with `{this.overflowing && <button className='pb-tab-strip-chevron`.
  - The kinds check already derives both kind-union literals from `PowerBrowserAPI.sys.mjs` at check time. It now has a second plant, on `STORE_REQUEST_KINDS`.

## Drop-index edge cases (measured statically, from the code paths)

- **Before itself, or before its right neighbour:** the drop changes nothing. `moves` is false, so no indicator shows and release does not move the tab.
- **Past every midpoint:** the drop lands after the strip's last tab. When the dragged tab is already last, `moves` is false.
- **Rightward move:** the TabBar index is `target - 1`, because Lumino `ArrayExt.move` puts the title at exactly the given index after removing it.
- **Leftward move:** the index is `target`.
- **End drop:** the index is the last strip tab's bar index, plus one if the dragged title sits to its right.
- **Hidden titles:** the bar index skips titles the strip hides (other groups' tabs in Browsing, stacked tabs), because it is computed from the anchor's position in `primaryBar().titles`.
- **Link drop with no strip tabs:** there is no `ref`, so the drop falls back to `openUrl` (a foreground tab). This cannot happen in a normal session, because the shell always holds at least one main-area widget.

## Overflow threshold

No tuning. The chevron rule is exactly `scrollWidth > clientWidth`, with no slack. Showing the chevron narrows the row by 32px (24 plus 4px margins each side), so a row that overflows still overflows afterwards. A row that does not overflow does not change width. The rule cannot oscillate.

## Task Commits

1. **Task 1 (tracer): in-strip drag reorder.** Commit `7d19ccee`. Tracer gate in auto mode: the automated half (Theia build, `verify-tab-strip` and `--self-test`, `verify-registry-shape`, `--quick`) was re-run green before expanding. The live half is deferred.
2. **Task 2: middle-click close, double-click new tab, drop-to-open.** Commit `17840901`.
3. **Task 3: overflow, List All Tabs, gate growth.** Commit `2908da00`.

## Gate results

- **Theia build:** `nix develop .#theia --command bash -c 'cd theia && yarn build'` exited 0 with 0 `error TS` after each task. The compiled `lib/browser/tab-strip-widget.js` carries `reorderTo`, `measureOverflow` and `openListAllMenu`.
- **`node scripts/verify-tab-strip.mjs`:** PASS (menu, copy, occlusion, kinds, codicons, target, overflow).
- **`node scripts/verify-tab-strip.mjs --self-test`:** PASS. The unmodified tree was green first, then 8 plants each went red naming their drift. The two new ones:
  - `uncatalogued-kind-added-34-02`: red naming `storeTabReorder`
  - `chevron-without-overflow`: red naming the `pb-tab-strip-chevron` rule
  The six from 34-01 are still red.
- **`node scripts/verify-shell-error-copy.mjs` and `--self-test`:** PASS. Three new strings are pinned in `EXPECTED_NAV_COPY`.
- **`node scripts/verify-chrome-bar-commands.mjs`:** PASS (22 ids; no command added).
- **`node scripts/verify-registry-shape.mjs`:** PASS (GUI-04 shape unchanged).
- **`node --check scripts/verify-tab-strip-live.mjs`:** OK after each task. The script's `copyRow` derivation was also smoke-tested offline against `chrome-bar-copy.ts`.
- **`scripts/verify-platform.sh --quick`**, run inside `nix develop .#theia` after staging: exit 0 after each task commit.
- **No dock layout write:** a grep of the staged diff for `saveLayout`/`restoreLayout` additions found none (T-34-02).

## Decisions Made

See `key-decisions` in the frontmatter. Two need a second look in the live pass: the reorder/dock split by row bounds, and the drag-handle finding below.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] address-bar.tsx and address-bar-rows.ts edited (not in the plan's file list)**
- **Issue:** the strip needs `droppedTextOf` and `LINK_DRAG_TYPES`, and needs to call the pill's `openDropped`. Importing `address-bar.tsx` from the strip would create an import cycle, because `address-bar.tsx` already imports `tab-strip-widget.tsx`.
- **Fix:** both helpers moved, unchanged, into the pure `address-bar-rows.ts` and are imported back. `openDropped` became public. The strip reaches it through a `searchDropped` callback.
- **Commit:** `17840901`

**2. [Rule 3 - Blocking] chrome-bar-widget.tsx edited (not in the plan's file list)**
- **Issue:** the `searchDropped` wiring lives in `ChromeBarContribution.onStart`. Also, `publishDragRegions` laid a window-drag handle over every non-`.pb-tab` part of the strip, which would have put a handle over the chevron.
- **Fix:** the drag-region items now include `.pb-tab-strip-chevron`, and a capture `scroll` listener on the strip republishes the regions when the row scrolls.
- **Commit:** `17840901`, `2908da00`

**3. [Rule 3 - Blocking] verify-shell-error-copy.mjs grown (not in the plan's file list)**
- **Issue:** `EXPECTED_NAV_COPY` pins `CHROME_BAR_COPY` by set equality.
- **Fix:** three strings added in the same commits as the copy.

**4. [Rule 1 - Bug] The is-dragging opacity edited outside the layer**
- **Issue:** UI-SPEC's 0.6 placed in the layer would lose to the existing unlayered `opacity: 0.4` rule.
- **Fix:** that rule's value changed to 0.6. Every new selector is inside `@layer powerbrowser-chrome-bar`.

**5. [Plan inconsistency] The 34-02 live scenarios use withProbeShell; menu keeps ng-a-live**
- **Issue:** the plan's key link names `withProbeShell` (pb-live-probe.mjs), but 34-01's scaffold runs `menu` on ng-a-live's `withShell`.
- **Fix:** the runner picks per scenario. A `probe: true` scenario launches through `withProbeShell` with its own prefs. It gets the purged startup cache, the push recorder and the chrome context the selection clipboard needs. `menu` is unchanged.

**6. [Plan inconsistency] The page-realm paste detector sits in the visible page, not the middle-clicked one**
- **Issue:** the plan says to seed the editable in the middle-clicked page. That page closes on the click, so its detector could not be read afterwards.
- **Fix:** the page-realm detector is seeded in the visible tab's page (`/b`), and `/a`'s strip tab is middle-clicked. A second detector is seeded in the Theia frame, the document the strip click lands in, and focused before the click. Each detector has its own positive control: a real middle-click paste in the same session. If a control stays silent, the scenario is NOT SCORED.

**7. [Plan inconsistency] Text-drop spy**
- **Issue:** a real search from the text drop would leave the fixture host.
- **Fix:** the drop scenario replaces `AddressBar.openDropped` on the instance with a recorder. This proves the strip's wiring to the pill path. The pill's own load path is covered by BAR-13's checks.

**8. [Scope] verify-platform.sh unchanged**
- **Reason:** the `tab-strip-live` row runs every entry in SCENARIOS by default, so the Wave 2 scenarios are already under it, as the plan expects.

## Deferred (end-of-milestone live pass)

These live checks were written but not run, because the lane has no objdir. Each runs after a Theia build:

- `node scripts/verify-tab-strip-live.mjs --scenario reorder` (self-test plant `reorder-noop`)
- `node scripts/verify-tab-strip-live.mjs --scenario middle,double,drop` (plants `middle-not-closing`, `double-noop`, `drop-link-noop`)
- `node scripts/verify-tab-strip-live.mjs --scenario overflow` (plant `overflow-unmeasured`)
- `node scripts/verify-tab-strip-live.mjs --scenario reorder,middle,double,drop,overflow --self-test`
- The plan's Task 3 verify chain end to end: `node scripts/verify-tab-strip.mjs && node scripts/verify-tab-strip.mjs --self-test && nix develop .#theia --command bash -c 'cd theia && yarn build' > "${TMPDIR:-/tmp}/pb-34-02-t3-build.log" 2>&1 && node scripts/verify-tab-strip-live.mjs --scenario overflow && node scripts/verify-registry-shape.mjs && scripts/verify-platform.sh --quick`. Only the live step was skipped.

Live and owner checks:

- **Drag handles cover the empty strip (needs a live check and an owner look).** In Browsing, `ChromeBarContribution.publishDragRegions` lays chrome-side `-moz-window-dragging` handles (powerbrowser.js custom title bar) over every part of the strip that is not a tab. powerbrowser.js says "Double-click and right-click on a handle are the widget's own titlebar actions". So a real double-click on the empty strip maximizes or restores the window (per the desktop's settings) and never reaches `onStripDoubleClick`. A link dropped on empty strip space also lands on a handle; drops on tabs reach the strip. Firefox behaves the same way when tabs are in the title bar: tabs.js skips its new-tab double-click so the title-bar action runs.
  The BiDi `double` and `drop` scenarios dispatch inside the Theia frame, so they cannot see the handles. The live pass must check a real double-click by hand.
  The recommended option was taken: Firefox parity, handles kept, the handler in place for the frame. If the owner wants double-click to open a tab, the handles would need to leave part of the strip uncovered.
- Selection-clipboard availability in the live profile. The `middle` scenario goes NOT SCORED, never green, if `kSelectionClipboard` cannot be written or the positive-control paste is not caught.
- Drag feel against Firefox: the midpoint rule, the edge-zone speed (8px per frame), and the drag image after the hand-off to the dock (34-VALIDATION manual row).
- Visual check of the 2px indicator, the chevron at the strip's end beside the window controls, and the hover-only scrollbar.

## Known Stubs

| File | Item | Reason | Resolved by |
|------|------|--------|-------------|
| theia/extensions/chrome-bar/src/browser/tab-strip-widget.tsx | List All Tabs rows carry no attention dot (`shortcut:` comment in `openListAllMenu`) | the attention state (TAB-09) does not exist yet | 34-04 |
| theia/extensions/chrome-bar/src/browser/tab-strip-widget.tsx | pinned-first order in List All Tabs and reorder is the TabBar order, with no pin state yet | pins land in 34-03, which puts pinned titles first in the bar | 34-03 |

The broken-windows ledger (`.planning/WINDOWS.md`) was not appended. The lane brief keeps shared planning files with the orchestrator, and both stubs close within this phase.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: drop-surface | theia/extensions/chrome-bar/src/browser/tab-strip-widget.tsx | The strip row is a new HTML5 drop target. Untrusted dropped text reaches three paths: `openInBackground` (http(s) only, plus its own throw), the pill's `openDropped` (chrome's resolve wall), or the refusal sentence. No payload text is logged or shown; the log carries the error name only. |

## Self-Check: PASSED

- FOUND: theia/extensions/chrome-bar/src/browser/tab-strip-widget.tsx, scripts/verify-tab-strip.mjs, scripts/verify-tab-strip-live.mjs, .planning/phases/34-tab-strip/34-02-SUMMARY.md
- FOUND commits: 7d19ccee, 17840901, 2908da00 (all ancestors of HEAD)
