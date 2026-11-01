---
phase: 34-tab-strip
reviewed: 2026-10-31T00:00:00Z
depth: standard
files_reviewed: 17
files_reviewed_list:
  - powerbrowser/INTERNAL-APIS.md
  - powerbrowser/shell/PowerBrowserAPI.sys.mjs
  - scripts/verify-chrome-bar-commands.mjs
  - scripts/verify-platform.sh
  - scripts/verify-shell-error-copy.mjs
  - scripts/verify-tab-strip-live.mjs
  - scripts/verify-tab-strip.mjs
  - theia/extensions/chrome-bar/src/browser/address-bar/address-bar-rows.ts
  - theia/extensions/chrome-bar/src/browser/address-bar/address-bar.tsx
  - theia/extensions/chrome-bar/src/browser/chrome-bar-commands.ts
  - theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts
  - theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx
  - theia/extensions/chrome-bar/src/browser/chrome-bar.css
  - theia/extensions/chrome-bar/src/browser/tab-strip-widget.tsx
  - theia/extensions/modes/src/browser/setups-service.ts
  - theia/extensions/tab-uris/src/browser/profile-storage.ts
  - theia/extensions/tab-uris/src/browser/web-tab.ts
findings:
  critical: 0
  warning: 6
  info: 12
  total: 18
status: issues_found
---

# Phase 34: Code Review Report

**Reviewed:** 2026-10-31
**Depth:** standard
**Files Reviewed:** 17
**Status:** issues_found

## Summary

Scope: the source files changed by the lane commits `75add5ad..8561d0a1` (`git diff --name-only 23c08bb5 8561d0a1 -- powerbrowser scripts theia`), read as they now stand on main at `8143fedd`. The merge added only the 32-REVIEW WR-11 audio-mark keyboard handler to `tab-strip-widget.tsx`; the Phase 36 changes to `web-tab.ts` that arrived in the same merge are out of scope. The `INTERNAL-APIS.md` diff is line-number churn only. Callees were read where a finding depends on them: `scheduleWebTabState` and the title listener in `PowerBrowserAPI.sys.mjs`, `GroupModel.keyOf`/`tabKeyOf`, `WebTabOpenHandler.openUrl`/`openInBackground`, `SetupsService.applyLastSession`, `ProfileStorageService.setData`/`getData`/`fireWillFlush`, and `blockingLayerOpen`.

Static gates re-run on main: `verify-tab-strip` PASS, `verify-tab-strip --self-test` PASS (24 plants), `check-internals-boundary` PASS, `verify-shell-error-copy` PASS, `scan-brand-residue` PASS. The live harness was not run; its live checks are deferred to the end-of-milestone pass.

What holds:

- Every tab-menu row and every tab command acts on the tab it is given. `setTabActions` rebuilds the rows for the widget argument. The registered commands are disabled without a `Widget` argument. Nothing in the menu path falls back to the current widget.
- Bulk rows go through `runOnEach` to each tab's own single-tab row, rebuilt per tab.
- Middle-click is consumed on both `mousedown` and `auxclick`, which covers the Gecko middle-click paste path.
- `LINK_DRAG_TYPES`/`droppedTextOf` moved to `address-bar-rows.ts` without a behaviour change. `javascript:` and `file:` drops are refused before anything loads.
- Pin persistence and the quit-time save do not race. `savePins` does nothing until `pinsRestored`, so a quit before the pin restore finishes keeps the stored list. `sessionRestored` settles after `applyLastSession` has awaited every `restoreWebTab`. `keyOf` of a web tab is its `rowKey`, so `openUrl(url, key)` gives the stored key back.
- The Bookmark rows' `typeof bookmarkPage` guard is sound, and store methods reject on `!ok`, so a failure reaches the strip's sentence.
- The frame cannot mint `titleChanged`.
- `verify-tab-strip.mjs` derives its expectations from the tree. The only fixed list is the four-entry frame-write allowlist, which is a contract rather than an expectation list.

Problems:

- The chrome-side attention code, which has never executed, reads `loading` from a coalesced record where the last call wins. A background tab whose title and load completion land in the same frame gets a false "Updated" mark.
- Drag reorder and its drop indicator do not respect the pinned block. A drag across that boundary shows an indicator, writes the TabBar order, and then the render puts the tab back where it was.
- Close Duplicate Tabs closes pinned tabs and drops their pins. Every other multi-close row protects pinned tabs.
- The tabs cannot take keyboard focus, so the UI-SPEC's Shift+F10 / context-menu-key path does not exist.
- The preview card can open during a reorder drag. It can also stay open after its tab is removed, which leaves the page hidden.
- Pinned tabs hide their audio mark.

## Fix outcome

Scope: the six warnings. The twelve info findings are out of scope and stay open.

| Finding | Outcome | Commit | Proof |
|---------|---------|--------|-------|
| WR-01 | Fixed. `scheduleWebTabState` decides a sticky `rebase` per call (loading, or the active tab at schedule time); `webTabTitleChanged` no longer reads either at flush. | a61e8bb1 | `verify-tab-strip` checks the scheduler and the minter; plants `title-rebase-at-flush`, `title-rebase-not-sticky`. INTERNAL-APIS.md line count unchanged. Live: background localhost load shows no mark (pending). |
| WR-02 | Fixed. `clampDrop` clamps a drop to the dragged tab's block (Firefox); the aim, the drop and Move share it. | cae2fef0 | `verify-tab-strip` requires the clamp in `aimReorder` and `reorderTo`; plant `drop-not-clamped`. Live: pending. |
| WR-03 | Fixed. The duplicates selection goes through `ranged`, so pinned duplicates stay open and keep their pins. | cb0906fc | `verify-tab-strip` fails any `tabMenuRows` selection built through `closable`; plant `duplicates-close-pinned`. |
| WR-04 | Fixed. One roving tab stop, Left/Right, Enter/Space; a keyboard-raised `contextmenu` anchors at the tab's bottom-left. | baed9295 | `verify-tab-strip` checks the tab root and the anchor; plants `tab-not-focusable`, `keyboard-menu-at-origin`. Live: Shift+F10 on a focused tab (pending). |
| WR-05 | Fixed. No dwell while a button is down or a reorder is in flight; `onDidRemoveWidget` closes the card of a disposed or hidden tab. | 1f2c733c | `verify-tab-strip` checks both; plants `preview-dwell-during-drag`, `preview-outlives-tab`. Live: pending. |
| WR-06 | Fixed. A pinned tab keeps its audio mark as a 10px corner badge, out of the flow. | eed26cad | `verify-tab-strip` derives the sheet's rules and fails one that hides the mark on a pinned tab; plant `pinned-audio-hidden`. Live: badge fit in the 32px tab (pending). |

Gates after the last fix: `verify-tab-strip` PASS, `--self-test` PASS (33 plants), `verify-ng-040-internals-catalogue-lines` PASS, `check-internals-boundary` PASS, `tsc -b` on chrome-bar clean, `yarn build` 0 errors. Run in the main checkout.

## Warnings

### WR-01: A background tab that finishes loading within one frame of its title change gets a false "Updated" mark

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:5187-5193`, `:5230`, `:3471-3479`

**Issue:** `webTabTitleChanged` rebases the seen title only when the push's `loading` is true. That `loading` is not read at title time. It is the value of the last `scheduleWebTabState` call before the animation-frame flush (`pending.set(tabId, { ..., loading })` overwrites the earlier record).

Take a background tab that commits a new document. The location push flushes first, with `loading` true, and rebases the seen title to the empty title of the new document. If the `pagetitlechanged` call (`isLoadingDocument` true) and the STATE_STOP call (`loading` false) then land in the same frame, the flush sees `loading` false. The page's first title differs from `""`, so `titleChanged` is true. That breaks the documented intent ("the title each overlay showed ... while its page loaded").

Fast pages hit this path: cached pages, small pages and localhost pages, including Duplicate Tab and dropped links opened in the background. So does every tab that loads while the shell window is occluded, because rAF stops and all calls collapse into one flush.

The same timing gap applies to `activeTabByFrame`, which is read at flush time rather than at schedule time. A title change on the active tab that flushes after the user has switched away marks the tab that was just left.

**Fix:** Rebase at the event, not at the flush. Do it in the title listener and on the state-stop path, while the document is still loading:
```js
entry.titleListener = () => {
  if (browser.webProgress.isLoadingDocument || activeTabByFrame.get(theiaBrowser) === tabId) {
    seenTitleByOverlay.set(browser, browser.contentTitle);
  }
  // ...existing writeTabRow + scheduleWebTabState
};
```
Alternatively, make the pending record's flag sticky: `loading: (pending.get(tabId)?.loading ?? false) || loading`, used only for the attention computation. Add a live attention row that loads a localhost page in a background tab and requires no mark.

### WR-02: A reorder drag across the pinned boundary shows a drop indicator, then nothing moves on screen

**File:** `theia/extensions/chrome-bar/src/browser/tab-strip-widget.tsx:1356-1366`, `:1373-1384`, `:1444-1448`

**Issue:** `aimReorder` takes `before` from `dropBefore` over all shown tabs, and `reorderTo` moves the title in the home-pane TabBar. `stripTabs`, however, always re-sorts the pinned block first ("whatever a drag did to the bar order").

Dragging an unpinned tab over the pinned block, or a pinned tab into the unpinned run, leads to this:

- `moves` is true and the 2px indicator paints at a position the strip will never show;
- on release, the TabBar order changes;
- the render puts the tab back.

The bar order is now interleaved, so it no longer matches the strip. KEY-03's `switchOrder` fallback and the Coding-mode bar read the bar order. While the row is scrolled, the left edge-zone auto-scroll sits over the sticky pinned block, so it always aims across the boundary.

**Fix:** Clamp the aim to the dragged tab's block before computing `moves`:
```ts
const pinned = this.isPinned(widget);
const block = tabs.filter(tab => this.isPinned(tab) === pinned);
let target = this.dropBefore(x);
if (target && this.isPinned(target) !== pinned) {
    target = pinned ? undefined : block[0];
}
if (!target && pinned) {
    target = tabs.find(tab => !this.isPinned(tab));   // end of the pinned block
}
```
Apply the same clamp in `reorderTo` so Move and drop share it.

### WR-03: Close Duplicate Tabs closes pinned tabs and erases their pins

**File:** `theia/extensions/chrome-bar/src/browser/tab-strip-widget.tsx:633`, `:700-704`

**Issue:** `others`, `left` and `right` go through `ranged`, which leaves pinned tabs open unless the user selected them (D-08). `duplicates` uses `closable` only. Running Close Duplicate Tabs on an unpinned tab therefore closes a pinned tab on the same URL, and `forgetTab` then removes that tab's pin from the store. The pin is lost, with no confirm, and Phase 33's reopen does not restore pin state.

**Fix:** `const duplicates = ranged(tabs.filter(tab => tab !== widget && tab instanceof WebTabWidget && tab.url === web?.url));`, and add a plant to the gate's pin checks.

### WR-04: Tabs cannot take keyboard focus, so the menu has no keyboard path

**File:** `theia/extensions/chrome-bar/src/browser/tab-strip-widget.tsx:1579-1594`, `:1014`

**Issue:** 34-UI-SPEC interaction contract 1 says "Right-click (or Shift+F10 / context-menu key) on a tab opens the menu". The `.pb-tab` element has `role='tab'` but no `tabIndex`, so it can never be focused, and `contextmenu` from the keyboard never reaches `openTabMenu`.

The audio mark inside the tab is now tabbable (WR-11), which makes the gap stranger: a keyboard user can reach a tab's mute button but not the tab. If the tab were focusable, `openTabMenu` would still anchor at `event.clientX/clientY`, which a keyboard-raised `contextmenu` reports as 0,0. Pin, Move, Close Others, Duplicate and multiselect have no keyboard route at all. The `.pb-tab:focus-visible` rule is dead.

**Fix:** Use a roving `tabIndex={active ? 0 : -1}` with ArrowLeft/ArrowRight between tabs. In `openTabMenu`, anchor at the tab's rect when the event did not come from a pointer:
```ts
const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
const keyboard = event.clientX === 0 && event.clientY === 0;
this.showMenu(menu, keyboard ? { x: box.left, y: box.bottom } : { x: event.clientX, y: event.clientY }, ...);
```

### WR-05: The preview card opens during a reorder drag and can outlive its tab, which leaves the page hidden

**File:** `theia/extensions/chrome-bar/src/browser/tab-strip-widget.tsx:1186-1192`, `:1199-1219`, `:1545`, `:1589`

**Issue:** The reorder gesture uses window listeners without pointer capture. While a tab is dragged across the row, `onPointerEnter` fires on each tab passed and `schedulePreview` arms the dwell. Resting for 400 ms, which is normal when aiming or while the edge zone auto-scrolls, opens a card for the tab under the pointer. Because the card is a blocking layer, the page disappears mid-drag.

Separately, `pointerleave` never fires on a node that React removes. If the previewed background tab is closed while its card is open (the page calls `window.close()`, an extension closes it, or the group closes), the strip re-renders, but `this.preview` still holds the disposed widget. The card stays drawn and the overlay stays hidden until the pointer enters another tab or the current tab changes. Neither `onDidRemoveWidget` nor `render` closes it.

**Fix:** Skip `schedulePreview` while a button is down or a reorder is in flight (`if (this.reorder || event.buttons) return;`, passing the event through). Close the card when its widget is gone, for example in the `onDidRemoveWidget` subscription or at the top of `render`:
```ts
if (this.preview && (this.preview.widget.isDisposed || !tabs.includes(this.preview.widget))) {
    this.preview = undefined;
}
```

### WR-06: A pinned tab that plays sound shows no audio mark and cannot be muted by click

**File:** `theia/extensions/chrome-bar/src/browser/chrome-bar.css:1149-1152`

**Issue:** `.pb-tab.is-pinned .pb-tab-audio { display: none; }` hides the Phase 32 audio mark on every pinned tab. Phase 32 made that mark "the one tab mute affordance", and 32-REVIEW WR-11 made it the keyboard path. A pinned tab, which is the tab most likely to hold a long-running audio page (music, calls), now gives no sign that it is playing sound. It can be muted only from the menu. The UI-SPEC pinned row asks for "label hidden, icon centered" and does not ask for the audio mark to be hidden.

**Fix:** Keep the mark on pinned tabs as a small badge over the icon instead of hiding it. For example, give `.pb-tab.is-pinned` `position: relative` and give `.pb-tab.is-pinned .pb-tab-audio` `position: absolute; right: 0; bottom: 2px` at 10px. That fits the 32px width.

## Info

### IN-01: A selected tab loses the active tab's background and the hover wash

**File:** `theia/extensions/chrome-bar/src/browser/chrome-bar.css:1156-1159`

**Issue:** `.pb-tab.is-selected` has the same specificity as `.pb-tab.is-active` (`:1103`) and `.pb-tab:hover` (`:1099`) and comes later, so its background wins over both. The active tab inside a selection is told apart only by its border, and selected tabs get no hover feedback. The unlayered placement is correct, and the comment's reasoning about layers holds.

**Fix:** Add `.pb-tab.is-active.is-selected { background: var(--color-surface, #2b2a33); }`, or move the selected wash to an inset `box-shadow` so the active background stays.

### IN-02: The Bookmark path casts away the store type and writes blindly

**File:** `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx:460-471`

**Issue:** `this.store as unknown as Partial<TabBookmarkStore>` means tsc will not notice when Phase 33's `bookmarkPage` signature differs from the local interface. The guard checks only that the method exists, not its argument shape.

Other problems with the same path:

- Bookmark Tab on a page that is already bookmarked adds a second bookmark, because there is no `readBookmarkByUrl` check.
- Bookmark All Tabs puts every page loose in the default folder, where Firefox puts them in a new folder.
- One failure stops the loop with the rest unbookmarked, and the message names a single tab.

**Fix:** Once Phase 33 lands, drop the cast and call `this.store.bookmarkPage` with its real type. Read back by URL before inserting. Decide on the folder behaviour for Bookmark All Tabs.

### IN-03: The pin restore activates every reopened tab and then re-activates a stale current tab

**File:** `theia/extensions/chrome-bar/src/browser/tab-strip-widget.tsx:934-960`

**Issue:** `openUrl` activates each reopened pinned tab, which records an NG-034 access for each one and sends `webTabActivated` for each one. `current` is read before the awaits, so if the user picks a tab during the restore, the strip switches back to the old one.

Two other gaps:

- A throw after some pins are restored (from `moveInBar` or `activateWidget`) reaches `finally`, which saves only the pins restored so far. The rest are lost from the store.
- A transient failure in `openUrl` also drops that pin permanently.

**Fix:** Open the missing pins in the background: `addWidget` without `activateWidget`, or `openInBackground` with a key parameter. Re-read the current tab after the loop and re-activate only if nothing else was activated meanwhile. On a caught error, leave the stored list as it was rather than calling `savePins`.

### IN-04: `sessionRestored` settles on failure, but the rejection is still unhandled

**File:** `theia/extensions/modes/src/browser/setups-service.ts:521`

**Issue:** `.finally(() => this.lastSessionApplied.resolve())` is right for the strip, but the chain is still `void`. A rejection from `applyLastSession` therefore becomes an unhandled rejection, as it did before this phase.

**Fix:** `.catch(err => console.error('[@powerbrowser/modes] launch restore failed:', err instanceof Error ? err.name : typeof err)).finally(...)`.

### IN-05: Multiselect anchor edge cases

**File:** `theia/extensions/chrome-bar/src/browser/tab-strip-widget.tsx:807-831`

**Issue:** Two cases:

- Ctrl-click on one tab selects only that tab. Firefox also adds the current tab, so a single Ctrl-click followed by a right-click offers no N-Tabs rows here.
- Shift-click with no anchor while the current widget is not in the strip (a stack pane is current) gives `indexOf` -1. `Math.max(0, -1)` then anchors the range at the first strip tab.

**Fix:** On the first Ctrl-click into an empty selection, also add the current tab if it is shown. When the current tab is not shown, select only the clicked tab.

### IN-06: Plain text with a colon is refused instead of searched

**File:** `theia/extensions/chrome-bar/src/browser/tab-strip-widget.tsx:74`, `:1123`

**Issue:** `SCHEME_ADDRESS` matches any single word of the form `word:rest`, so dropping text such as "re:invent" or "todo:fix" shows "can't open that link in a tab" and does not search.

**Fix:** Treat the text as a link only when its scheme is a registered or known one (`javascript`, `data`, `file`, `blob`, `about`, `chrome`, `resource`, `moz-extension`, `view-source`, `mailto` ...). Send other text to `searchDropped`.

### IN-07: `widget.id` can reach new user-facing surfaces

**File:** `theia/extensions/chrome-bar/src/browser/tab-strip-widget.tsx:1054-1055`, `:1245`, `:1570`

**Issue:** The List All Tabs label, the preview title and the "Updated" tooltip fall back to `widget.id` when a title has no label. Web tabs always carry a label (`web-tab.ts:710`), but other main-area widgets may not. The fallback pattern existed before this phase; the phase adds three more surfaces where an internal identifier can appear.

**Fix:** Fall back to a fixed copy string (for example `CHROME_BAR_COPY.untitledTab`) rather than the id.

### IN-08: Gate check 6 scans three method bodies and does not follow their callees

**File:** `scripts/verify-tab-strip.mjs:260-266`

**Issue:** The target check runs a regex over the bodies of `tabMenuRows`, `openTabMenu` and `bulkMenuRows`. It does not follow `runTabRow`, `runRow`, `setTabActions` or the registered command `execute` in `chrome-bar-commands.ts:310-316`. A `?? currentWebTab()` added to that `execute` would keep the gate green.

**Fix:** Add `runTabRow`, `runRow`, the `setTabActions` literal and the tab-command registration loop to the scanned bodies, with a plant for the command `execute`.

### IN-09: `ChromeBarWidget`'s doc comment now documents `TabBookmarkStore`

**File:** `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx:119-128`

**Issue:** The interface was inserted between the class's long JSDoc block and `@injectable() export class ChromeBarWidget`, so tooling attaches that block to the wrong declaration.

**Fix:** Move `TabBookmarkStore` above the class's comment.

### IN-10: The failure notice can be off-screen and never clears on its own

**File:** `theia/extensions/chrome-bar/src/browser/tab-strip-widget.tsx:1535`, `chrome-bar.css:817-824`

**Issue:** The notice is a child of the scrolling row with `margin-left: auto`. In an overflowing row it sits past the last tab, out of view. It also stays until the next tab menu or drop.

Separately, `openPreview` clamps with a literal 288, which is the CSS card width of 280 plus 8 and is not tied to it.

**Fix:** Render the notice outside `.pb-tab-strip-row` (beside the chevron), or clear it after a timeout. Derive the clamp from the card's measured width or from a shared constant.

### IN-11: Pins on widgets without a URI are keyed by widget id and do not survive a restart reliably

**File:** `theia/extensions/chrome-bar/src/browser/tab-strip-widget.tsx:864-866`; `theia/extensions/modes/src/browser/group-model.ts:124-126`

**Issue:** `tabKeyOf` falls back to `widget:${widget.id}` for a widget with no registry URI and no resource URI, such as a terminal. Those ids are not stable across sessions and can be reused, so after a restart a different widget that takes the same id comes back pinned.

**Fix:** Persist pins only for keys with a stable shape (web row keys and resource URIs), or document that the restore does not cover these widgets.

### IN-12: For a lone tab, the Close family is disabled rather than hidden

**File:** `theia/extensions/chrome-bar/src/browser/tab-strip-widget.tsx:685-704`, `:991`

**Issue:** 34-UI-SPEC "Zero-one-many" says "single tab hides Close family except Close Tab". Every row is `isVisible: () => true` with `enabled: false`, so a single tab shows four greyed Close rows.

**Fix:** Set `isVisible` to the row's `enabled` for the Close family when `tabs.length === 1`, or amend the UI-SPEC.

---

_Reviewed: 2026-10-31_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
