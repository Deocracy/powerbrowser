# Phase 39 — UI Review

**Audited:** 2026-11-07
**Baseline:** 39-UI-SPEC.md (inheritance-only contract: no new tokens, components, copy) plus the 01-UI-SPEC.md copy rule (no internal identifier in user-facing text)
**Screenshots:** not captured (static review requested; committed captures under `captures/` were read as evidence)
**Interaction captures:** off (static review; no driver launched)

Scope: the hunks of `git diff e5593190^..HEAD` in chrome-bar.css, chrome-bar-widget.tsx, extension-actions-widget.tsx, page-context-menu.ts. PowerBrowserAPI.sys.mjs added no user-facing string in the range; the "PowerBrowser refused to open that page: this extension is not allowed in private windows." text (lines 10522, 10717) is not in the diff and is an `ExtensionError` returned to the extension, not shown on screen.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | Phase added no copy; no identifier leak found. "Remove bookmark" overflow and the prompt text over the strip are copy-adjacent defects; the private-window refusal has no next step. |
| 2. Visuals | 2/4 | Find strip docking is correct; unstyled prompt text over the tab strip, duplicate History row, empty fullscreen banner state and a button that cannot hold its label remain. |
| 3. Color | 2/4 | Chrome bar stays dark under the light Theia theme (32 T2); sidebar view shows a light body under a dark tab bar. |
| 4. Typography | 3/4 | No new sizes or weights in the diff; the find strip reuses 13px. "Remove bookmark" wraps and clips in a fixed-height button. |
| 5. Spacing | 3/4 | `--pb-find-strip-height` follows the existing `--pb-bookmarks-toolbar-height` pattern; the 32px strip is added in five places by hand. |
| 6. Experience Design | 2/4 | Focus guard and sidebar reveal fix real races; the whole tab strip is now a no-drag zone and the reveal promise has no failure path. |

**Overall: 15/24**

---

## Top 3 Priority Fixes

1. **Chrome bar ignores the light Theia theme (32 T2, BLOCKER for theme support)** — bar, tab strip, find strip and popups stay dark over light Theia panels; contrast and identity break on any light-theme user. Fix: resolve the bar's colours from `--theia-*` variables (the find strip already falls back to `var(--color-bg, #1c1b22)` hex literals, chrome-bar.css ~1599) and drop the hard-coded fallbacks.
2. **Tab strip is no longer draggable (WARNING, 34 T1 fix side effect)** — `publishDragRegions` now passes `items: [this.tabStrip.node]` (chrome-bar-widget.tsx ~2246), and the strip is a `flex: 0 0 100%` row, so every pixel of it is carved out; the window moves only by the URL row's empty space, unlike Firefox, where the empty tab-strip area drags the window. Fix: carve out only the strip's inner tab-list and its empty-space element (the double-click target), leaving the padding area beside it as drag region, or confirm in the UI-SPEC that the URL row is the sole drag handle.
3. **"Remove bookmark" overflows its button (33 T7)** — in `33-T7-star-editor.png` the label wraps to two lines and the second line crosses the button border. Fix: `white-space: nowrap` with `min-width: max-content` (or `min-height` instead of `height`) on that button, and give the footer row `flex-wrap`.

Further fixes (not in the top 3):

4. Unstyled location prompt text over the tab strip on adopted tabs (37 T28/T30/T32): the capture `37-T28-doorhanger.png` shows no doorhanger at all, only a tab bell and body text "prompt page a" with dotted artefacts, so the capture does not evidence the prompt UI it is named for. Style the prompt or replace the capture.
5. Duplicate History recent-page row (33 T7): dedupe by URL in the history list builder.
6. Fullscreen warning banner over an empty main area (35 T14): give the banner a visible page or dismiss state so the empty area is not the whole window.
7. `stateService.reachedState('ready').then(...)` in `syncSidebar` (extension-actions-widget.tsx ~269) has no `.catch`; a rejected `addWidget`/`revealWidget` leaves the sidebar silently absent. Add a catch that logs and clears `sidebarRevealed`.
8. The 32px strip height is typed in the CSS comment, the CSS rule and the widget; derive the rows from one custom property list to avoid drift.

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)
- The diff adds no strings. `CHROME_BAR_COPY.pageMenuRowRefused(appSubject())` (page-context-menu.ts ~130) is reused, not new. Scan of the added lines for pref keys, ports, timeouts and raw exception text: none.
- WARNING: "PowerBrowser refused to open that page: this extension is not allowed in private windows." names the product and the problem, but states no next step, which the 01-UI-SPEC rule requires ("ends with a next step that is a real affordance"). It is thrown as an `ExtensionError`, so the extension decides whether a user ever sees it; if it surfaces, it needs an ending such as "Turn on Allow in Private Windows for it in Extensions." (pre-existing, not part of this phase's hunks).
- Known: unstyled prompt text over the tab strip on adopted tabs (37 T28/T30/T32); "Remove bookmark" is clipped (33 T7), which makes a destructive label hard to read.

### Pillar 2: Visuals (2/4)
- PASS: `32-T6-find-strip.png` shows the strip docked under the bar with the page starting below it (match highlights visible, count "3 of 3", prev/next/close icons); the page is shifted, not covered, which is the contract's intent.
- `33-T7-bookmarks-toolbar.png`: toolbar row readable, single favicon plus title.
- `38-T20-sidebar-view.png`: the sidebar view appears beside the page with three view tabs, but they are three bare icons with no visible title or close affordance, and the "sidebar" body is unstyled fixture text.
- Known, scored: duplicate History recent-page row (33 T7); fullscreen warning banner over an empty main area (35 T14); unstyled prompt text over the tab strip (37 T28/T30/T32).
- Icon-only controls in the find strip (previous, next, close) were not confirmed to carry `aria-label` in this diff; they are unchanged from Phase 32 and were not re-audited.

### Pillar 3: Color (2/4)
- Known BLOCKER-level: the bar stays dark under the light Theia theme (32 T2). Captures `32-T2-reader-dark.png` and `32-T2-reader-light.png` are the evidence.
- The find strip uses `var(--color-bg, #1c1b22)`, `var(--color-text, #fbfbfe)`, `var(--color-border, #3f3e4a)` (chrome-bar.css ~1599-1611): hex fallbacks are the dark theme baked in, so the light theme never reaches it.
- `38-T20-sidebar-view.png`: white body under a near-black tab bar inside one panel is a visible mix of two palettes.
- Accent: the active mode ("Browsing") and the tab outline use the same blue; consistent with earlier phases, no new accent use in the diff.

### Pillar 4: Typography (3/4)
- No font-size or weight added; the strip reuses `font-size: 13px`, within the inherited scale.
- `33-T7-star-editor.png`: "Remove bookmark" wraps onto two lines inside a fixed-height button and the second line sits on the border; a label that cannot fit its control is a typography failure.

### Pillar 5: Spacing (3/4)
- The new variable is the same mechanism as `--pb-bookmarks-toolbar-height`: five `min-height` calc rules plus the host `height` (chrome-bar.css 1166, 1186, 1190, 1195, 1225) now all include `--pb-find-strip-height`. All six were updated; none missed in the diff.
- The captures show the page content starting directly under the strip with no overlap, consistent with 32px at the capture scale.
- Minor: the value 32px is repeated by hand in the CSS comment, `.pb-chrome-bar-find { height: 32px }` and the variable.

### Pillar 6: Experience Design (2/4)
- PASS (page-context-menu.ts): `latestMenuId` plus `focusPageIfLatest` stops an older menu's late dismissal from stealing focus from a newer menu. It is set before `pick` is defined and compared at both focus sites. No gap found.
- PASS (chrome-bar-widget.tsx): `setFindOpen` toggles the body attribute only when the state changes and calls `shell.fit()`; the tab-change path now also resets it, so a find strip does not linger after switching tabs.
- WARNING: tab-strip drag carve-out covers the whole strip; the strip is full-width, so there is no empty strip area left to move the window (see fix 2). This trades the native empty-strip drag for the 34 T1 double-click fix without a stated decision in the UI-SPEC.
- WARNING: `syncSidebar` waits on `reachedState('ready')` but a view-visible check uses `view.isVisible` only for newly opened extensions; if the user closes the right panel by hand and the same extension pushes again, the view stays hidden (`reveal` is false). Acceptable but unconfirmed.
- WARNING: no `.catch` on the ready promise (fix 7).
- No loading or empty state exists for the sidebar view while the extension page loads (the capture shows the title bar before content).

---

## Files Audited
- /home/chris/coding/Power-Browser/theia/extensions/chrome-bar/src/browser/chrome-bar.css
- /home/chris/coding/Power-Browser/theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx
- /home/chris/coding/Power-Browser/theia/extensions/chrome-bar/src/browser/extensions/extension-actions-widget.tsx
- /home/chris/coding/Power-Browser/theia/extensions/chrome-bar/src/browser/page-context-menu.ts
- /home/chris/coding/Power-Browser/powerbrowser/shell/PowerBrowserAPI.sys.mjs (strings only)
- Captures read: 32-T6-find-strip, 33-T7-bookmarks-toolbar, 33-T7-star-editor, 37-T28-doorhanger, 38-T20-sidebar-view (the other captures were not opened; the known findings for them are scored from the task brief)
