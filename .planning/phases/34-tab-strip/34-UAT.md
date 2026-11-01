---
phase: 34-tab-strip
status: pending
created: 2026-11-01
items: 15
source: 34-VERIFICATION.md (human_needed)
note: No live run exists for this phase. Items run in the one end-of-milestone live pass. Start from a clean working tree with a current Gecko build (verify-tab-strip-live.mjs stops at assertCleanTree otherwise).
---

# Phase 34: Tab Strip, Human Verification

Exact live commands are in 34-VERIFICATION.md under "Deferred Live Items" and in 34-05-SUMMARY.md. "Live" below means a scenario in `node scripts/verify-tab-strip-live.mjs`.

## Owner decisions

### 1. Double-click on empty strip space against the window-drag handles (TAB-03)

**Test:** In Browsing mode, double-click empty space on the tab strip (right of the last tab), on a build with the window drag regions active.
**Expected:** A new tab opens (the pill takes focus) and the window does not maximize or restore.
**Why human:** `onStripDoubleClick` (tab-strip-widget.tsx:1102) runs the New Tab command, but `publishDragRegions` (chrome-bar-widget.tsx:2210-2260) lists the strip row as a window-drag row and sends every gap between tabs as a handle. If Gecko consumes the double-click in the drag region (native maximize toggle), TAB-03's second clause fails. Decide: keep both (if it works), carve the empty strip out of the drag handles, or drop the double-click clause. Live scenario `double` covers the DOM event, not the native drag region.

### 2. Strip visibility outside Browsing against the 34-05 plan text (D-02)

**Test:** Switch Browsing, Coding, Organising and back.
**Expected:** Owner states which is intended. Today `setHidden(modeId !== 'browsing')` (chrome-bar-widget.tsx:2055) hides the strip in Coding and Organising, where the Theia tab bar and the canvas cards serve as tabs. 34-CONTEXT D-02 says visibility follows the mode-service contract. The 34-05 plan truth said the strip renders in all three modes.
**Why human:** Product decision. If the strip should paint in Coding or Organising, that is a behaviour change for a new plan; the `modes` scenario derives its expectation from the source and follows it.

## Live checks (ROADMAP criteria)

### 3. Tab menu rows (TAB-01, SC1)

**Test:** Right-click a background web tab with several tabs open (one muted, one duplicate URL, one pinned). Run Reload, Duplicate, Pin/Unpin, Mute/Unmute, Bookmark, Bookmark All Tabs, Move to Start/End, Close Others, Close Tabs to the Left/Right, Close Duplicates, Close. Live: `menu`.
**Expected:** Each row acts on the right-clicked tab, not the current one. Rows grey correctly. Pinned tabs survive the range closes.
**Why human:** Menu has never been opened.

### 4. Bookmark Tab and Bookmark All Tabs (BMK-07)

**Test:** Run live `bookmark-all` (first time scoreable, Phase 33 is merged), then by hand: Bookmark Tab on one page, Bookmark All Tabs with three http(s) tabs, repeat on an already-bookmarked page, force a failure.
**Expected:** Each tab reads back through `readBookmarkByUrl` with its own title and URL. The failure shows the `bookmarkTabFailed` sentence naming the application. No second bookmark appears for a repeated URL (IN-02: no pre-read exists today; judge whether Phase 33's idempotent queue covers it).
**Why human:** Never ran; IN-02 is open.

### 5. Drag reorder and the pinned boundary (TAB-02, WR-02)

**Test:** Drag a tab within the strip; drag an unpinned tab over the pinned block and a pinned tab into the unpinned run; drag while the row is scrolled and the left edge-zone scrolls. Live: `reorder`.
**Expected:** The 2px indicator appears only for a move that will happen. The order sticks and matches the home TabBar order. A cross-boundary drop clamps to the dragged tab's block.
**Why human:** Pointer gesture; `clampDrop` is proven by plant only.

### 6. Middle-click close (TAB-03)

**Test:** Middle-click a tab; on Linux, with text selected in the page behind, middle-click again. Live: `middle`.
**Expected:** The tab closes through its close row and nothing is pasted into the page.
**Why human:** The Gecko paste fall-through is observable only live.

### 7. Link dropped on the strip (TAB-08)

**Test:** Drag a link out of a web page onto the strip, then a URL from outside the browser, then plain text, then a `javascript:` link and a file. Live: `drop`.
**Expected:** http(s) opens a background tab at the drop position. Text searches through the pill. `javascript:`, `file:` and other schemes show the strip's refusal sentence and load nothing.
**Why human:** A drag from a Gecko overlay into the Theia frame crosses two documents.

### 8. Overflow and List All Tabs (TAB-04)

**Test:** Open enough tabs to overflow; scroll the row; open the chevron menu and pick an off-screen tab. Run the sidecar DOM measure. Live: `overflow`.
**Expected:** The chevron shows only while the row overflows. The picked tab becomes current and scrolls into view. Scrolling does not leave the window-drag handles stale.
**Why human:** Geometry needs a layout engine.

### 9. Pin, icon-only, and restart persistence (TAB-05)

**Test:** Pin two tabs (one playing sound), quit, relaunch. Live: `pin-restore`.
**Expected:** The pins lead the strip as icon-only tabs in stored order; the previously current tab stays current; unpinning returns the tab after the block. The pinned tab's audio mark shows as a corner badge that fits the 32px tab (WR-06).
**Why human:** Restart has never run. IN-03 (pin restore activates every reopened tab and may re-activate a stale current tab) and IN-11 (pins on id-keyed widgets) are open.

### 10. Multiselect and bulk rows (TAB-06)

**Test:** Ctrl-click and Shift-click several tabs, right-click one, run each N-Tabs row (close, move to start/end, mute, bookmark). Try a single Ctrl-click, and Shift-click with a stack pane current. Live: `multi`.
**Expected:** Each row runs per selected tab through the single-tab row. Pinned tabs outside the selection stay open on Close.
**Why human:** IN-05 edge cases and selection feel.

### 11. Preview card (TAB-07, WR-05)

**Test:** Rest the pointer on a background tab; close that tab (from the page or another route) while its card is open; drag a tab past others holding the button down. Live: `preview`.
**Expected:** Card with image or skeleton, title and URL after about 400 ms; the page is hidden only while the card is open. No card during a drag. The card disappears with its tab, and the page returns.
**Why human:** Readability and the occlusion are visual.

### 12. Attention mark (TAB-09, WR-01)

**Test:** In a background tab, load a page that changes its title on a timer; then load a fast localhost page and a cached page in a background tab; then activate the marked tab. Live: `attention`.
**Expected:** The timer page shows the dot; fast and cached loads show no dot (the sticky-rebase fix); activating the tab clears it. The dot is visible against both themes.
**Why human:** Live-pass risk. The chrome-side minter (PowerBrowserAPI.sys.mjs:5241-5249) and the WR-01 fix have never executed against a real overlay; they are proven by plants only.

## Live-pass risks from the 34-REVIEW fixes

### 13. Keyboard context-menu detection (WR-04)

**Test:** Tab to the strip; use Left/Right to move between tabs; press Shift+F10 and the context-menu key on a focused tab; press Enter and Space.
**Expected:** The menu opens anchored at the focused tab's bottom-left, not at the window origin; Enter/Space activate the tab; focus-visible shows.
**Why human:** `openTabMenu` (tab-strip-widget.tsx:1022-1024) decides keyboard origin with `event.button !== 2 || (clientX === 0 && clientY === 0)`. Different Linux/Gecko builds report a keyboard-raised `contextmenu` differently (button value, coordinates), so the heuristic can misfire in either direction. Check a real right-click is still anchored at the pointer.

### 14. Pinned-tab corner badge fit and selected-tab styling (WR-06, IN-01)

**Test:** Pin a tab that plays sound; select several tabs including the active one; hover selected tabs.
**Expected:** The 10px audio badge sits inside the 32px tab and stays clickable. The active tab inside a selection remains distinguishable; selected tabs show hover feedback (IN-01 is open, so it may not).
**Why human:** Visual.

## Judgment items

### 15. Judgment-tier prohibitions and open info findings

**Test:** Review the Prohibitions table in 34-VERIFICATION.md (the judgment-tier rows) and 34-REVIEW IN-01..IN-12, still open.
**Expected:** Owner confirms or rejects each non-authoritative verdict and decides whether any IN item (IN-12 lone-tab Close rows disabled rather than hidden; IN-06 colon text refused; IN-08 gate does not follow the command `execute`) must close before Phase 34 requirements turn complete.
**Why human:** unverified-prohibition, human review recommended.
