---
status: partial
phase: 34-tab-strip
source: [34-VERIFICATION.md]
started: 2026-11-01T00:00:00Z
updated: 2026-11-05T18:14:14.000Z
---

Deferred to the one end-of-milestone pass (Chris, 2026-10-31). Exact live commands are in 34-VERIFICATION.md under "Deferred Live Items" and in 34-05-SUMMARY.md. A scenario name below is a scenario of `node scripts/verify-tab-strip-live.mjs`. Start from a clean working tree with a current Gecko build (the harness stops at assertCleanTree otherwise).

## Current Test

[testing complete]

## Tests

### 1. Double-click on empty strip space against the window-drag handles (TAB-03)
expected: In Browsing mode, on a build with the window drag regions active, double-click empty space on the tab strip (right of the last tab): a new tab opens (the pill takes focus) and the window does not maximize or restore. Live scenario `double` covers the DOM event only; the native drag-region double-click is the open part
result: [pending]
real-input: "39-15 2026-11-06, objdir/dist/bin/powerbrowser headed on the owner KDE Wayland desktop, harness commit 6fc1161a: PB_REAL_INPUT=1, pointer os -- real uinput buttons through ydotool behind the pb-kwin gate (the active window read back before the move and again before the button, the pointer read back on target, the owner's mouse idle 750 ms first); the screen point calibrated by a trusted-mousemove read-back in the target document, within 2 px. verify-tab-strip-live double, run three times with the same result: a real double-click on the empty strip right of /a (calibrated on /a's tab: the gap is a chrome drag handle and raises no mousemove in the Theia frame) MAXIMIZED the window (KWin frame 384,226 1280x800 -> 0,0 2048x1252) and opened NO new tab. The native drag region consumes the double-click, so TAB-03's second clause fails on a real pointer; the DOM-event scenario stays green. Owner batch B decides"
live: "v1.5 end-of-milestone pass, 2026-11-04, main: double PASS (the DOM event only; the native drag-region double-click is still the owner check)"
owner: "Decide: keep both (if the native double-click works), carve the empty strip out of the drag handles, or drop the double-click clause of TAB-03"
why: "onStripDoubleClick (tab-strip-widget.tsx:1102) runs the New Tab command, but publishDragRegions (chrome-bar-widget.tsx:2210-2260) lists the strip row as a window-drag row and sends every gap between tabs as a handle. If Gecko consumes the double-click in the drag region (native maximize toggle), TAB-03's second clause fails"

### 2. Strip visibility outside Browsing against the 34-05 plan text (D-02)
expected: Switch Browsing, Coding, Organising and back; the owner states which behaviour is intended. Today setHidden(modeId !== 'browsing') (chrome-bar-widget.tsx:2055) hides the strip in Coding and Organising, where the Theia tab bar and the canvas cards serve as tabs; 34-CONTEXT D-02 says visibility follows the mode-service contract; the 34-05 plan truth said the strip renders in all three modes. Live scenario `modes`
result: [pending]
live: "v1.5 end-of-milestone pass, 2026-11-04, main: modes PASS against the source-derived expectation (strip hidden outside Browsing); the intended behaviour is still the owner decision"
owner: "State whether the strip should paint in Coding and Organising; if it should, that is a behaviour change for a new plan"
why: "Product decision. The modes scenario derives its expectation from the source and follows it"

### 3. Tab menu rows (TAB-01, SC1)
expected: Scenario `menu`: right-click a background web tab with several tabs open (one muted, one duplicate URL, one pinned) and run Reload, Duplicate, Pin/Unpin, Mute/Unmute, Bookmark, Bookmark All Tabs, Move to Start/End, Close Others, Close Tabs to the Left/Right, Close Duplicates, Close. Each row acts on the right-clicked tab, not the current one; rows grey correctly; pinned tabs survive the range closes
result: pass
evidence: "end-of-milestone live pass 2026-11-04, main: menu PASS (separator rows skipped, harness fix e3a8f5f1)"
why: "Menu had never been opened"

### 4. Bookmark Tab and Bookmark All Tabs (BMK-07)
expected: Scenario `bookmark-all`, then by hand: Bookmark Tab on one page, Bookmark All Tabs with three http(s) tabs, repeat on an already-bookmarked page, force a failure. Each tab reads back through readBookmarkByUrl with its own title and URL; the failure shows the bookmarkTabFailed sentence naming the application; no second bookmark appears for a repeated URL (IN-02: no pre-read exists today; judge whether Phase 33's idempotent queue covers it). Open: the by-hand Bookmark Tab steps and IN-02
result: pass
evidence: "39-16 (2026-11-06), main, 331ed734: `scripts/verify-platform.sh --only tab-strip-live` PASS, all 13 scenarios. bookmark-all now covers the by-hand steps. Bookmark Tab on /c bookmarks /c alone, with its title and URL, and leaves /a unbookmarked. Bookmark All Tabs over /a, /b (localhost) and /c bookmarks each with its own title and URL; /c is a repeat. Bookmark Tab on /a is then repeated. Places counts afterwards: /a 1 and /c 1. That answers IN-02: Phase 33's queued, idempotent bookmarkPage makes no second entry. A refused bookmarkPage shows the bookmarkTabFailed sentence, and that sentence contains the configured application name. `--only tab-strip-live-self-test` PASS: plant bookmark-all-drops-tab is red with 'was not bookmarked'; bookmark-repeat-duplicates (a second Places entry for /a) is red with 'a repeated bookmark created a second entry: /a has 2 Places bookmarks for its URL'; bookmark-failure-silent (the strip's callback swallows the rejection) is red with 'a failed bookmark was silent'"

### 5. Drag reorder and the pinned boundary (TAB-02, WR-02)
expected: Scenario `reorder`: drag a tab within the strip; drag an unpinned tab over the pinned block and a pinned tab into the unpinned run; drag while the row is scrolled and the left edge-zone scrolls. The 2px indicator appears only for a move that will happen; the order sticks and matches the home TabBar order; a cross-boundary drop clamps to the dragged tab's block
result: pass
evidence: "end-of-milestone live pass 2026-11-04, main: reorder PASS"
why: "Pointer gesture; clampDrop was proven by plant only"

### 6. Middle-click close (TAB-03)
expected: Scenario `middle`: middle-click a tab; it closes through its close row and nothing is pasted into the page. Open: on Linux, with text selected in the page behind, the primary-selection middle-click by hand
result: pass
evidence: "39-15 2026-11-06, objdir/dist/bin/powerbrowser headed on the owner KDE Wayland desktop, harness commit 6fc1161a: PB_REAL_INPUT=1, pointer os -- real uinput buttons through ydotool behind the pb-kwin gate (the active window read back before the move and again before the button, the pointer read back on target, the owner's mouse idle 750 ms first); the screen point calibrated by a trusted-mousemove read-back in the target document, within 2 px. verify-tab-strip-live middle PASS with every middle-click real: the positive controls caught real primary-selection pastes into a Theia-frame editable and a page editable (2 events each); then with text selected in page /b and the selection clipboard set, a real middle-click on /a's strip tab closed /a, pasted nowhere, and the page text was unchanged"
live: "v1.5 end-of-milestone pass, 2026-11-04, main: middle PASS; the Linux primary-selection middle-click remains by hand"
why: "The Gecko paste fall-through is observable only live"

### 7. Link dropped on the strip (TAB-08)
expected: Scenario `drop`: drag a link out of a web page onto the strip, then a URL from outside the browser, then plain text, then a javascript: link and a file. http(s) opens a background tab at the drop position; text searches through the pill; javascript:, file: and other schemes show the strip's refusal sentence and load nothing. Open: the drops from outside the browser and of a file, by hand
result: [pending]
live: "v1.5 end-of-milestone pass, 2026-11-04, main: drop PASS; drops from outside the browser and of a file remain by hand"
why: "A drag from a Gecko overlay into the Theia frame crosses two documents"
human: "drops from outside the browser and of a file (cross-application drag). 39-16: no harness can start a drag in another application, so this stays on Chris's checklist"

### 8. Overflow and List All Tabs (TAB-04)
expected: Scenario `overflow`: open enough tabs to overflow; scroll the row; open the chevron menu and pick an off-screen tab. The chevron shows only while the row overflows; the picked tab becomes current and scrolls into view; scrolling does not leave the window-drag handles stale. Open: the sidecar DOM measure
result: pass
evidence: "39-16 (2026-11-06), main, 331ed734: overflow PASS inside `scripts/verify-platform.sh --only tab-strip-live`. The DOM was measured in the built shell's Theia frame (Gecko layout) over BiDi; see the deviation in 39-16-SUMMARY. Strip narrowed to 300px: row scrollWidth 590, clientWidth 268, so it overflows. The List All Tabs chevron is at {left 272, right 296, top 4, bottom 28} and is absent at full width (the same session's control). The off-screen tab picked in List All Tabs becomes current and is drawn at {left 126, right 268} inside the row {left 0, right 268}. After a scroll to scrollLeft 322, chrome holds 13 .powerbrowser-drag handles: [[260,0,12,33],[296,0,984,33],[0,33,8,40],[40,33,8,40],[80,33,8,40],[120,33,8,40],[768,33,8,40],[808,33,8,40],[848,33,8,40],[888,33,8,40],[928,33,8,40],[968,33,8,40],[1272,33,8,40]]. None overlaps a visible tab, and they equal a fresh publishDragRegions() byte for byte, so the scroll left no stale handles"

### 9. Pin, icon-only, and restart persistence (TAB-05)
expected: Scenario `pin-restore`: pin two tabs (one playing sound), quit, relaunch. The pins lead the strip as icon-only tabs in stored order; the previously current tab stays current; unpinning returns the tab after the block; the pinned tab's audio mark shows as a corner badge that fits the 32px tab (WR-06)
result: pass
evidence: "end-of-milestone live pass 2026-11-04, main: pin-restore PASS: a pinned tab now paints 32px (product fix 1642f2d7; it painted 34px)"
why: "Restart had never run. IN-03 (pin restore activates every reopened tab and may re-activate a stale current tab) and IN-11 (pins on id-keyed widgets) are open"

### 10. Multiselect and bulk rows (TAB-06)
expected: Scenario `multi`: Ctrl-click and Shift-click several tabs, right-click one, run each N-Tabs row (close, move to start/end, mute, bookmark); try a single Ctrl-click, and Shift-click with a stack pane current. Each row runs per selected tab through the single-tab row; pinned tabs outside the selection stay open on Close
result: pass
evidence: "end-of-milestone live pass 2026-11-04, main: multi PASS (paint-lag race, harness fix e3a8f5f1)"
why: "IN-05 edge cases and selection feel"

### 11. Preview card (TAB-07, WR-05)
expected: Scenario `preview`: rest the pointer on a background tab; close that tab (from the page or another route) while its card is open; drag a tab past others holding the button down. Card with image or skeleton, title and URL after about 400 ms; the page is hidden only while the card is open; no card during a drag; the card disappears with its tab, and the page returns
result: pass
evidence: "end-of-milestone live pass 2026-11-04, main: preview PASS"
why: "Readability and the occlusion are visual"

### 12. Attention mark (TAB-09, WR-01)
expected: Scenario `attention`: in a background tab, load a page that changes its title on a timer; then load a fast localhost page and a cached page in a background tab; then activate the marked tab. The timer page shows the dot; fast and cached loads show no dot (the sticky-rebase fix); activating the tab clears it; the dot is visible against both themes
result: pass
evidence: "end-of-milestone live pass 2026-11-04, main: attention PASS"
why: "Live-pass risk. The chrome-side minter (PowerBrowserAPI.sys.mjs:5241-5249) and the WR-01 fix had never executed against a real overlay; they were proven by plants only"

### 13. Keyboard context-menu detection (WR-04)
expected: Tab to the strip; use Left/Right to move between tabs; press Shift+F10 and the context-menu key on a focused tab; press Enter and Space. The menu opens anchored at the focused tab's bottom-left, not at the window origin; Enter/Space activate the tab; focus-visible shows; a real right-click is still anchored at the pointer
result: pass
evidence: "39-15 2026-11-06, objdir/dist/bin/powerbrowser headed on the owner KDE Wayland desktop, PB_REAL_INPUT=1 behind the pb-kwin gate (active window read back before every move and button, pointer read back on target, calibrated by a trusted-mousemove read-back within 2 px). Harness 2f42a1ed: verify-tab-strip-live keyboard-menu PASS in two real runs, keys os and pointer os: ArrowRight moved keyboard focus between tabs; real Shift+F10 and the real context-menu key (raised by GTK nsGtkKeyUtils MaybeDispatchContextMenuEvent, button 0) opened the tab menu 0 px from the focused tab's bottom-left; real Enter and Space activated the focused tab; a real right-click opened the menu 0-1 px from the pointer. focus-visible was not inspected (a look). Plant keyboard-menu-pointer-origin went red"
live: "39-15 2026-11-06, harness 2f42a1ed: PB_REAL_INPUT=1 verify-tab-strip-live keyboard-menu PASS, keys os: ArrowRight moved keyboard focus /a -> /b; real Shift+F10 and the real context-menu key (GTK MaybeDispatchContextMenuEvent) each opened the tab menu 0px from /b's bottom-left; Enter and Space activated the focused tab. Pointer half: Task 3 of 39-15"
why: "openTabMenu (tab-strip-widget.tsx:1022-1024) decides keyboard origin with event.button !== 2 || (clientX === 0 && clientY === 0). Different Linux/Gecko builds report a keyboard-raised contextmenu differently (button value, coordinates), so the heuristic can misfire in either direction"

### 14. Pinned-tab corner badge fit and selected-tab styling (WR-06, IN-01)
expected: Pin a tab that plays sound; select several tabs including the active one; hover selected tabs. The 10px audio badge sits inside the 32px tab and stays clickable; the active tab inside a selection remains distinguishable; selected tabs show hover feedback (IN-01 is open, so it may not)
result: [pending]
why: "Visual"
capture: "39-16 headed (331ed734, `PB_CAPTURE_DIR=... node scripts/verify-tab-strip-live.mjs --scenario badge-capture`): .planning/phases/39-v1-5-close-out/captures/34-T14-badge-and-selection.png. /a is pinned, and its widget is marked soundPlaying by the harness because the fixture pages are silent. /b is current and /c and /d are selected (DOM is-selected on c and d), with a real BiDi pointer resting on /c, so /c's preview card is open in the capture. The badge fit, the active-in-selection styling and the hover feedback (IN-01) are for Chris"

### 15. Judgment-tier prohibitions and open info findings
expected: Review the Prohibitions table in 34-VERIFICATION.md (the judgment-tier rows) and 34-REVIEW IN-01..IN-12, still open. Owner confirms or rejects each non-authoritative verdict and decides whether any IN item (IN-12 lone-tab Close rows disabled rather than hidden; IN-06 colon text refused; IN-08 gate does not follow the command execute) must close before Phase 34 requirements turn complete
result: [pending]
why: "unverified-prohibition, human review recommended"

## Summary

total: 15
passed: 10
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps

None recorded. Rows 1-2 wait on owner calls. Row 7 keeps a human-only remainder (drops from outside the browser). Row 14 has a capture waiting on Chris's verdict. Row 15 waits on the owner (39-16).

## Deferred Follow-Ups

- Row 4: IN-02 is answered by 39-16. A repeated Bookmark Tab and a Bookmark All Tabs over an already-bookmarked page each leave one Places bookmark per URL (bookmark-all, 331ed734).
- Row 9: IN-03 (pin restore may re-activate a stale current tab) and IN-11 (pins on id-keyed widgets) are open.
- Row 14: IN-01 (selected tabs show no hover feedback) is open.
- Row 15: 34-REVIEW IN-01..IN-12 await the owner's verdict.
