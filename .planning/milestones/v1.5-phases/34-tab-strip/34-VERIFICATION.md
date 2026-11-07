---
phase: 34-tab-strip
verified: 2026-11-01T00:00:00Z
status: human_needed
score: 3/15 must-haves verified
covered_files: [".planning/phases/34-tab-strip/34-01-PLAN.md", ".planning/phases/34-tab-strip/34-01-SUMMARY.md", ".planning/phases/34-tab-strip/34-02-PLAN.md", ".planning/phases/34-tab-strip/34-02-SUMMARY.md", ".planning/phases/34-tab-strip/34-03-PLAN.md", ".planning/phases/34-tab-strip/34-03-SUMMARY.md", ".planning/phases/34-tab-strip/34-04-PLAN.md", ".planning/phases/34-tab-strip/34-04-SUMMARY.md", ".planning/phases/34-tab-strip/34-05-PLAN.md", ".planning/phases/34-tab-strip/34-05-SUMMARY.md", "powerbrowser/shell/PowerBrowserAPI.sys.mjs", "scripts/verify-platform.sh", "scripts/verify-tab-strip-live.mjs", "scripts/verify-tab-strip.mjs", "theia/extensions/chrome-bar/src/browser/chrome-bar-commands.ts", "theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts", "theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx", "theia/extensions/chrome-bar/src/browser/chrome-bar.css", "theia/extensions/chrome-bar/src/browser/tab-strip-widget.tsx", "theia/extensions/modes/src/browser/setups-service.ts", "theia/extensions/tab-uris/src/browser/profile-storage.ts", "theia/extensions/tab-uris/src/browser/web-tab.ts"]
covered_digest: "v3:sha256:c88e75275a11f172bad8a30ae5e406819a7bb92b013d7b5bb12b5fdf607e36c1"
behavior_unverified: 11
overrides_applied: 0
behavior_unverified_items:
  - truth: "Right-clicking a tab offers the eleven contracted rows and each does what it says (ROADMAP SC1, TAB-01)"
    test: "Right-click a web tab among several, and run each row: Reload, Duplicate, Pin, Mute, Bookmark, Bookmark All Tabs, Move to Start/End, Close Others, Close Tabs to the Left, Close Tabs to the Right, Close Duplicates"
    expected: "Each row acts on the right-clicked tab (not the current one) and enabled/greyed state follows the tab"
    why_human: "Row set, command wiring and the 'never falls back to the current widget' rule are gate-derived, but no menu has been opened and no row executed (no live run)"
  - truth: "Bookmark Tab and Bookmark All Tabs bookmark through Phase 33's bookmarkPage (BMK-07)"
    test: "Run LIVE(bookmark-all) now that Phase 33 is merged, then Bookmark All Tabs by hand and check the toolbar"
    expected: "Every http(s) tab reads back through readBookmarkByUrl with its own title and URL; the failure case shows the strip's bookmarkTabFailed sentence"
    why_human: "tabBookmarker() calls this.store.bookmarkPage per tab (chrome-bar-widget.tsx:1127) and the store method exists (chrome-store-client.ts:267), but the scenario has never been scoreable until now and has not run"
  - truth: "Dragging a tab reorders the strip (TAB-02), confined to its pinned/unpinned block"
    test: "Drag tabs within the strip, across the pinned boundary, and while the row is scrolled"
    expected: "The 2px indicator shows only for a move that will happen; the order sticks; a drag across the pin boundary clamps to the dragged tab's block"
    why_human: "Pointer-driven gesture; clampDrop (tab-strip-widget.tsx:1372) is gate-checked but no drag has run"
  - truth: "Middle-click closes a tab (TAB-03)"
    test: "Middle-click a tab, and one holding a text selection on Linux"
    expected: "The tab closes through its close row; no paste runs in the page behind"
    why_human: "onTabAuxClick (tab-strip-widget.tsx:1089) consumes the event, but the Gecko paste path is only observable live"
  - truth: "Double-clicking the empty strip opens a new tab (TAB-03)"
    test: "Double-click empty strip space in Browsing mode"
    expected: "A new-tab focuses the pill and the window does not maximize or restore"
    why_human: "Owner decision. onStripDoubleClick (tab-strip-widget.tsx:1102) runs the New Tab command, but publishDragRegions (chrome-bar-widget.tsx:2210-2260) marks the same empty strip space as a window-drag handle in Browsing mode. Whether Gecko's native drag region swallows or acts on the double-click is not statically decidable"
  - truth: "A link dropped on the strip opens as a tab (TAB-08)"
    test: "Drag a link from a web page, and a URL from outside the browser, onto the strip; also drop plain text and a javascript: link"
    expected: "http(s) opens a background tab at the drop position; text searches via the pill; javascript:/file: is refused with the strip sentence"
    why_human: "onStripDrop (:1121) routes by type; a drag out of a Gecko overlay into the Theia frame crosses two documents and is live-only"
  - truth: "An overflowing strip scrolls and List All Tabs picks any tab (TAB-04)"
    test: "Open enough tabs to overflow, scroll, use the chevron menu, pick an off-screen tab"
    expected: "The chevron appears only while overflowing; the picked tab becomes current and scrolls into view"
    why_human: "measureOverflow (:1043) and the chevron (:1567) are in place; geometry needs a layout engine (D-02/TAB-04 DOM measure is deferred)"
  - truth: "A pinned tab shrinks to its icon and is still pinned after a restart (TAB-05)"
    test: "Pin two tabs, quit and relaunch, check pins and order; pin a tab that plays sound"
    expected: "Pins lead the strip as icon-only tabs in stored order; the current tab is unchanged; the audio mark shows as a corner badge"
    why_human: "Persistence is wired (savePins :927, restorePins :942, PINNED_TABS_STORAGE_KEY profile-storage.ts:53, sessionRestored ordering) but a restart has never been exercised (LIVE(pin-restore)); the 10px badge fit in the 32px tab is visual"
  - truth: "Several tabs can be selected and closed, moved, muted or bookmarked together (TAB-06)"
    test: "Ctrl-click and Shift-click tabs, right-click one, run each N-Tabs row"
    expected: "Each row runs the single-tab row per selected tab; pinned tabs outside the selection stay open"
    why_human: "bulkMenuRows (:727) delegates through runOnEach to tabMenuRows rows (gate-checked); selection feel and the IN-05 anchor edge cases need a person"
  - truth: "Hovering a tab shows a preview card (TAB-07)"
    test: "Rest the pointer on a background tab for 400 ms; then close that tab while its card is open; then drag-reorder past other tabs"
    expected: "Card with image or skeleton, title and URL; the page is hidden only while the card is open; no card during a drag; no card outlives its tab"
    why_human: "Occlusion through the blocking-layer selector and the thumbnail source are gate-checked; readability and the hidden-page behaviour are live"
  - truth: "A background tab whose title changes shows an attention mark (TAB-09)"
    test: "Open a page that changes its title on a timer in a background tab; separately load a fast localhost page in the background"
    expected: "The timer page shows the mark within a frame; activating the tab clears it; the fast load shows no mark (WR-01)"
    why_human: "The chrome-side minter (PowerBrowserAPI.sys.mjs:3584, :5241-5249) has never executed against a live overlay; the WR-01 sticky-rebase fix is proven only by plants"
  - truth: "The strip is visible outside Browsing mode (34-05 plan text), against D-02 'follows the mode-service contract'"
    test: "Switch Browsing, Coding, Organising and back"
    expected: "Owner states which is intended: today the strip is hidden outside Browsing (chrome-bar-widget.tsx:2055)"
    why_human: "Owner decision, listed as an UNCERTAIN truth below"
human_verification:
  - test: "Run the twelve-scenario live chain on a clean tree with a current Gecko build (commands under Deferred Live Items)"
    expected: "All twelve scenarios pass; bookmark-all is scored, not NOT SCORED"
    why_human: "Owner rule: one end-of-milestone live pass. No live run exists for this phase"
  - test: "Sidecar DOM measure and screenshots (tab menu, pinned strip, preview card, attention dot)"
    expected: "One strip node in every mode, 33px in Browsing, zero height otherwise, order kept, chevron true only while overflowing"
    why_human: "Layout and visual reads"
  - test: "Decide the two owner questions: window-drag handle vs double-click new tab, and strip visibility outside Browsing"
    expected: "A ruling for each, recorded in 34-UAT.md"
    why_human: "Owner decisions, see UAT items 1 and 2"
---

# Phase 34: Tab Strip Verification Report

**Phase Goal:** The tab strip handles tabs the way Firefox's does: tab menu, drag, pin, overflow, multiselect, preview and attention
**Verified:** 2026-11-01 (HEAD `9e054572`)
**Status:** human_needed
**Re-verification:** No, initial verification

No gap was found. Every statically checkable claim holds in the merged tree, and the phase's behaviour is wired end to end. The phase has no live run, so each criterion that needs a browser is PRESENT_BEHAVIOR_UNVERIFIED by the owner's one-live-pass rule, not a gap.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1/TAB-01: right-click offers Reload, Duplicate, Pin, Mute, Bookmark, Bookmark All Tabs, Move, Close Others/Left/Right/Duplicates, each doing what it says | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `tabMenuRows` (tab-strip-widget.tsx:625-720) holds all eleven contracted rows plus Close; `contract:` names match ROADMAP and `verify-tab-strip` check 1 derives the row set from the ROADMAP list (PASS). Reload/Mute/Duplicate/Close go through Phase 32's `reload`/`setMuted` and the shell close path; commands in chrome-bar-commands.ts are disabled without a `Widget` argument; `openTabMenu` (:982) is wired from `onContextMenu` (:1646). Never opened live |
| 2 | BMK-07: Bookmark Tab / Bookmark All Tabs from the tab menu | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Rows `bookmark`/`bookmark-all` (:658-668) run `bookmarkTabs`, set from `tabBookmarker()` (chrome-bar-widget.tsx:2272, :1127) which calls `this.store.bookmarkPage(tab.url, tab.title.label)` per tab. Phase 33 is now merged: `bookmarkPage` exists at chrome-store-client.ts:267. verify-web-tab-bridge PASS (rule 12 fence). No kind added to the bridge sets. `LIVE(bookmark-all)` is scoreable for the first time and has not run |
| 3 | SC2a/TAB-02: dragging a tab reorders the strip | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Pointer reorder with `aimReorder`/`reorderTo`/`clampDrop` (:1342-1402), writer is the home TabBar order only; `verify-tab-strip` 33 plants include `drop-not-clamped` (PASS). WR-02 fix `cae2fef0` is in the tree. Never dragged live |
| 4 | SC2b/TAB-03: middle-click closes a tab | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `onTabAuxClick` (:1089-1099) consumes button 1 on `auxclick` and `mousedown` and runs the tab's close row. Paste-fallthrough is Gecko-side, live only |
| 5 | SC2c/TAB-03: double-clicking the empty strip opens a new tab | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `onStripDoubleClick` (:1102-1107) excludes `.pb-tab` and the notice, then runs `CHROME_BAR_NEW_TAB_COMMAND_ID`. The same empty space is a window-drag handle in Browsing (chrome-bar-widget.tsx:2210-2260, rows.push of `tabStrip.node`). Owner decision, UAT item 1 |
| 6 | SC2d/TAB-08: a link dropped on the strip opens as a tab | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `onStripDragOver`/`onStripDrop` (:1111-1160), `LINK_DRAG_TYPES`/`droppedTextOf` shared with the pill from address-bar-rows.ts; `javascript:`/`file:` refused before load. Cross-document drag is live only |
| 7 | SC3a/TAB-04: an overflowing strip scrolls and List All Tabs picks any tab | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `overflow-x: auto` (chrome-bar.css:1242), `measureOverflow` (:1043) with a `ResizeObserver` (:199), chevron button (:1567-1570) opening the per-request list menu (:1053-1080) that scrolls the picked tab into view (:1074). Geometry is a DOM-measure item |
| 8 | SC3b/TAB-05: a pinned tab shrinks to its icon and is still pinned after a restart | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `.pb-tab.is-pinned` icon-only (chrome-bar.css:1310-1330); `togglePin` (:911), `savePins` (:927, guarded by `pinsRestored`), `restorePins` (:942, after `setups.sessionRestored`, :273), store key `powerbrowser.tab-strip.pinnedIds` (profile-storage.ts:53, :192-204), flush on `onWillFlush` (:274), keyed by `keyOf` only. WR-03 (pinned duplicates stay open) and WR-06 (audio badge) fixes are in. No restart has run |
| 9 | SC4a/TAB-06: several tabs selected, closed, moved, muted or bookmarked together | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `onTabClick` (:815-830) Ctrl/Shift selection; `bulkMenuRows` (:727-770) runs each selected tab's own single-tab row through `runOnEach` (:776), no second close path. Gate check 9 PASS. IN-05 anchor edges remain open |
| 10 | SC4b/TAB-07: hovering a tab shows a preview card | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `schedulePreview` (:1197, 400 ms dwell, skipped during a drag), `openPreview` (:1211), `renderPreview` (:1250); the card is in `BLOCKING_LAYER_SELECTOR` (web-tab.ts) so the overlay hides. Image source is the settled thumbnail row (gate: preview source, PASS). WR-05 fix in. Live only |
| 11 | SC4c/TAB-09: a background tab whose title changes shows an attention mark | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Chrome mints `titleChanged` from overlay state (PowerBrowserAPI.sys.mjs:3584, `webTabTitleChanged` :5244, rebase on activation :4851) → `applyState` (web-tab.ts:1447) → `isUpdated` (tab-strip-widget.tsx:1594) → `.pb-tab-attention` (:1655). The frame cannot write it (gate: no frame write, 4-entry allowlist). WR-01 sticky rebase in; never executed against a live overlay |
| 12 | The tab commands, menus and bulk rows act only on the tab they are given; no Firefox internals outside the boundary; GUI-04 shape intact | ✓ VERIFIED | verify-tab-strip PASS (checks 1-15); verify-web-tab-bridge PASS (35 kinds); verify-registry-shape PASS (5 names, 4 members); check-internals-boundary `--catalogue` PASS; verify-shell-error-copy PASS; verify-chrome-bar-commands PASS (38 ids); `tsc -p theia/extensions/chrome-bar --noEmit` exit 0; scan-brand-residue PASS (416 files) |
| 13 | Both tab-strip gates are registered once, in their own block, gate before self-test, with no sibling driver | ✓ VERIFIED | verify-platform.sh:3894-3895 (quick) and :5192-5193 (live); check 15 derives this from the script and its four plants went red in `--self-test` (33 plants, PASS) |
| 14 | The six 34-REVIEW warnings (WR-01..06) are fixed in the tree and gate-enforced | ✓ VERIFIED | `--self-test` plants `title-rebase-at-flush`, `title-rebase-not-sticky`, `drop-not-clamped`, `duplicates-close-pinned`, `tab-not-focusable`, `keyboard-menu-at-origin`, `preview-dwell-during-drag`, `preview-outlives-tab`, `pinned-audio-hidden` each go red; fixes present at tab-strip-widget.tsx:633/641 (WR-03), :1372 (WR-02), :1642-1648 (WR-04, WR-05), PowerBrowserAPI.sys.mjs:3455-3457/:5241 (WR-01), chrome-bar.css:1329 (WR-06). Proof is structural; each fix's live check is pending |
| 15 | D-02: one strip serves every mode, visible per the mode-service contract | ? UNCERTAIN | One `TabStripWidget` (`this.tabStrip`), hidden by `setHidden(modeId !== 'browsing')` (chrome-bar-widget.tsx:2055). 34-CONTEXT D-02 says visibility follows that contract; 34-05's plan text said the strip renders in Coding and Organising. Owner decision, UAT item 2 |

**Score:** 3/15 truths verified (11 present, behavior-unverified; 1 uncertain; 0 failed)

### Deferred Items

None. Later phases do not own any Phase 34 behaviour.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `theia/extensions/chrome-bar/src/browser/tab-strip-widget.tsx` (1725 lines) | menu, reorder, middle/double/drop, overflow, pin, multiselect, preview, attention | ✓ VERIFIED | Every behaviour above has a substantive implementation, no stub markers |
| `theia/extensions/chrome-bar/src/browser/chrome-bar.css` | pin, preview, attention, chevron, selected styles | ✓ VERIFIED | rules at :1032-1130, :1310-1340 |
| `theia/extensions/tab-uris/src/browser/profile-storage.ts` | pin store | ✓ VERIFIED | `readPinnedIds`/`writePinnedIds` bounded by `PINNED_TABS_MAX` |
| `powerbrowser/shell/PowerBrowserAPI.sys.mjs` | `titleChanged` push field, activation rebase | ✓ VERIFIED | :3584, :4851, :5241-5249; catalogue PASS |
| `theia/extensions/modes/src/browser/setups-service.ts` | `sessionRestored` | ✓ VERIFIED | Settles on failure (IN-04 notes the rejection stays unhandled) |
| `scripts/verify-tab-strip.mjs` | static gate, 15 checks, 33 plants | ✓ VERIFIED | PASS, `--self-test` PASS |
| `scripts/verify-tab-strip-live.mjs` | twelve live scenarios | ✓ EXISTS, NOT RUN | `--scenario nope` exits 2 listing: menu, reorder, middle, double, drop, overflow, pin-restore, multi, preview, attention, bookmark-all, modes |
| `.planning/phases/34-tab-strip/34-VALIDATION.md` | mapped, live rows deferred | ✓ VERIFIED | `status: static-green-live-deferred`; no unrun row marked green |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| tab `onContextMenu` | `openTabMenu` → `tabMenuRows(widget)` | per-request menu | ✓ WIRED | tab-strip-widget.tsx:1646, :982; commands rebuild rows for the widget argument (:264-266) |
| menu Bookmark rows | `ChromeStoreClient.bookmarkPage` | `bookmarkTabs` → `tabBookmarker()` | ✓ WIRED | chrome-bar-widget.tsx:2272, :1127; chrome-store-client.ts:267 |
| bulk rows | single-tab rows | `runOnEach` | ✓ WIRED | :776-785 |
| pin toggle | shell-state map | `savePins` → `writePinnedIds` | ✓ WIRED | :927; restore :942 after `sessionRestored` (:273) |
| overlay title/load listeners | strip attention mark | `scheduleWebTabState` → `titleChanged` push → `applyState` → `isUpdated` | ✓ WIRED | PowerBrowserAPI.sys.mjs:3457/3584; web-tab.ts:1447; tab-strip-widget.tsx:1594/1655 |
| chevron | List All Tabs menu | `measureOverflow` → render → menu | ✓ WIRED | :1043, :1567 |
| strip drop | pill search / tab open | `searchDropped` → `addressBar.openDropped` | ✓ WIRED | chrome-bar-widget.tsx:2274 |
| strip hide | mode service | `setHidden(modeId !== 'browsing')` | ✓ WIRED | chrome-bar-widget.tsx:2055 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| attention mark | `widget.titleChanged` | chrome-side `webTabTitleChanged` from `browser.contentTitle` | Yes by construction (not run) | ✓ FLOWING (static) |
| pinned tabs | `pinnedIds`, stored list | shell-state map via `ProfileStorageService` | Yes by construction (not restarted) | ✓ FLOWING (static) |
| preview image | `previewImage(widget)` | settled GUI-08 thumbnail row via `groups.scheduleReload` | Yes by construction | ✓ FLOWING (static) |
| bookmark rows | `tab.url`, `tab.title.label` | WebTabWidget state push | Yes | ✓ FLOWING (static) |
| audio mark on pinned tabs | `soundPlaying` | Phase 32 push | Yes | ✓ FLOWING (static) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Tab-strip static gate | `node scripts/verify-tab-strip.mjs` | `PASS` (15 checks) | ✓ PASS |
| Gate self-test | `node scripts/verify-tab-strip.mjs --self-test` | `PASS -- 33 plants each went red naming their drift` | ✓ PASS |
| Bridge contract | `node scripts/verify-web-tab-bridge.mjs` | PASS, 35 webTab kinds | ✓ PASS |
| Registry shape (GUI-04) | `node scripts/verify-registry-shape.mjs` | PASS | ✓ PASS |
| Error-copy leak | `node scripts/verify-shell-error-copy.mjs` | PASS | ✓ PASS |
| Internals catalogue | `bash scripts/check-internals-boundary.sh --catalogue` | PASS | ✓ PASS |
| Command ids | `node scripts/verify-chrome-bar-commands.mjs` | PASS (38 ids) | ✓ PASS |
| Brand residue | `node scripts/scan-brand-residue.mjs` | PASS (416 files) | ✓ PASS |
| Typecheck | `tsc -p theia/extensions/chrome-bar --noEmit` | exit 0 | ✓ PASS |
| Live harness arg guard | `node scripts/verify-tab-strip-live.mjs --scenario nope` | exit 2 listing the twelve names, launches nothing | ✓ PASS |
| Twelve live scenarios | see Deferred Live Items | not run | ? SKIP (owner rule) |

Not run by instruction: any live harness, `--self-test` of the live script, the full `verify-platform.sh`. `verify-tab-strip-live.mjs` has no `--static` mode; invoked with it, it stops at `assertCleanTree` (ng-a-live.mjs:63) because the working tree has uncommitted files. The live pass must start on a clean tree.

### Probe Execution

No `scripts/*/tests/probe-*.sh` probes are declared for this phase.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| TAB-01 | 34-01 | Right-click tab menu | ? NEEDS HUMAN | Truth 1 |
| TAB-02 | 34-02 | Drag to reorder | ? NEEDS HUMAN | Truth 3 |
| TAB-03 | 34-02 | Middle-click close, double-click new tab | ? NEEDS HUMAN | Truths 4, 5 (owner decision on the drag handle) |
| TAB-04 | 34-02 | Overflow scroll, List All Tabs | ? NEEDS HUMAN | Truth 7 |
| TAB-05 | 34-03 | Pin, icon-only, survives restart | ? NEEDS HUMAN | Truth 8 |
| TAB-06 | 34-03 | Multiselect | ? NEEDS HUMAN | Truth 9 |
| TAB-07 | 34-04 | Hover preview card | ? NEEDS HUMAN | Truth 10 |
| TAB-08 | 34-02 | Drop link onto strip | ? NEEDS HUMAN | Truth 6 |
| TAB-09 | 34-04 | Attention mark | ? NEEDS HUMAN | Truth 11 |
| BMK-07 | 34-01, 34-05 | Bookmark one or all tabs | ? NEEDS HUMAN | Truth 2; the Phase 33 dependency is now met |

Orphaned requirements: none. REQUIREMENTS.md maps TAB-01..09 and BMK-07 to Phase 34 and every ID appears in a plan.

### Prohibitions

Each plan's `must_haves.prohibitions` is `resolved`. Judgment-tier items below are non-authoritative and flagged `unverified-prohibition, human review recommended`; backstop items are confirmed only where a gate covers them.

| Prohibition (plan) | Tier | Static read |
|--------------------|------|-------------|
| Act on no tab but the event's own (34-01) | judgment | Held: `setTabActions` rebuilds rows per widget, commands disabled without a `Widget`; gate check 6 (target) PASS. IN-08: the gate scans three method bodies and does not follow `runTabRow` or the command `execute` |
| No URL/title/id/key in logs or user-facing strings (34-01, 34-04) | judgment | Gate `verify-shell-error-copy` PASS; log lines on the new paths carry error names only. Human review recommended |
| No `STORE_REQUEST_KINDS`/`WEB_TAB_ACTION_KINDS` entry (34-01) | backstop | Held: bridge gate PASS at 35 kinds, no tab-strip kind |
| Reorder writes TabBar order only (34-02) | judgment | Held by read: `reorderTo` uses the TabBar; no layout JSON write. Human review recommended |
| Middle-click must not paste (34-02) | backstop | Consumed on `mousedown` and `auxclick`; the Gecko effect is live-only, so unproven |
| Pin/selection keyed by `keyOf` only (34-03) | backstop | Held: `tabKey` is `GroupModel.keyOf`; `PinnedTab.url` is a reopen hint, not the identity |
| One path for bulk actions (34-03) | judgment | Held: `runOnEach` only |
| Preview uses the settled thumbnail only (34-04) | backstop | Gate "preview source" PASS |
| No title polling or frame sniffing (34-04) | judgment | Held: minted in PowerBrowserAPI.sys.mjs from overlay state; gate `no frame write` PASS |
| No absence-of-log assertions; no hand-kept expectation list (34-05) | judgment | Held: `verify-tab-strip.mjs` derives its expectations and carries plants for each check. Human review recommended |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (phase files) | n/a | TBD/FIXME/XXX/TODO/placeholder in touched source | None found by gate checks or read | None |
| tab-strip-widget.tsx | :685-704, :991 | Close family rows disabled, not hidden, for a lone tab (IN-12) | ℹ️ Info | UI-SPEC "Zero-one-many" says hide; cosmetic |
| tab-strip-widget.tsx | :807-831 | Multiselect anchor edges (IN-05) | ℹ️ Info | Single Ctrl-click does not include the current tab |
| tab-strip-widget.tsx | :74, :1123 | Colon text is refused, not searched (IN-06) | ℹ️ Info | Dropped text such as "re:invent" shows the refusal |
| chrome-bar-widget.tsx | :1127-1133 | Bookmark All Tabs stops at the first failure; no pre-read for an existing bookmark (IN-02, partly resolved by the Phase 33 merge) | ℹ️ Info | Duplicate bookmark risk; failure sentence names one tab |
| 34-REVIEW.md | IN-01..IN-12 | Twelve info findings explicitly left open | ℹ️ Info | None block a success criterion |

### Human Verification Required

See `34-UAT.md` (15 items) and the frontmatter list. Summary: the twelve-scenario live pass, the sidecar DOM measure, two owner decisions, and the live-pass risks from the 34-REVIEW fixes.

### Gaps Summary

No gaps. Nothing the static tree shows is missing or wrong. The code for TAB-01..TAB-09 and BMK-07 exists, is wired from event to effect, and is held by a 15-check gate with 33 failing plants. The Phase 33 dependency named in the 34-05 SUMMARY is now met in the tree, so `bookmark-all` will score instead of reporting NOT SCORED.

What blocks `passed` is the absence of any live run, plus two owner decisions (double-click on a window-drag handle; strip visibility outside Browsing). Phase 34 requirements stay Pending until the live pass runs.

## Deferred Live Items

All from 34-05-SUMMARY. None has run. Run from the repo root on a clean tree, with a current Gecko build, inside `nix develop .#theia` (so `yarn` is on PATH):

- Full twelve-scenario chain (scenarios `menu, reorder, middle, double, drop, overflow, pin-restore, multi, preview, attention, bookmark-all, modes`):

      nix develop .#theia --command bash -c 'cd theia && yarn build' > "${TMPDIR:-/tmp}/pb-34-05-t2-build.log" 2>&1 && node scripts/verify-tab-strip.mjs && node scripts/verify-tab-strip.mjs --self-test && node scripts/verify-tab-strip-live.mjs && node scripts/verify-tab-strip-live.mjs --self-test && node scripts/verify-web-tab-bridge.mjs --self-test && node scripts/verify-shell-error-copy.mjs --self-test && node scripts/verify-registry-shape.mjs && scripts/verify-platform.sh

- The two new scenarios alone:

      nix develop .#theia --command bash -c 'cd theia && yarn build' > "${TMPDIR:-/tmp}/pb-34-05-t1-build.log" 2>&1 && node scripts/verify-tab-strip-live.mjs --scenario bookmark-all,modes && node scripts/verify-registry-shape.mjs

- Self-test plants for the new scenarios, `bookmark-all-drops-tab` and `modes-order-lost`: `node scripts/verify-tab-strip-live.mjs --self-test`. The first can run now that `bookmarkPage` exists.
- Sidecar DOM measure (D-02, TAB-04):

      cd theia/applications/browser && POWERBROWSER_TOKEN_DISABLE=1 THEIA_CONFIG_DIR="$HOME/.config/powerbrowser" PATH="$PWD/node_modules/.bin:$PWD/../../node_modules/.bin:$PATH" theia start --port 4000 --hostname 127.0.0.1

  then, in Browsing, Coding, Organising and Browsing again, `browser_eval`:

      JSON.stringify({ mode: document.body.dataset.pbMode, strips: document.querySelectorAll('.pb-tab-strip').length, box: (r => [r.width, r.height])(document.querySelector('.pb-tab-strip').getBoundingClientRect()), chevron: !!document.querySelector('.pb-tab-strip-chevron'), tabs: [...document.querySelectorAll('.pb-tab-strip .pb-tab[data-pb-tab]')].map(n => n.dataset.pbTab) })

  Pass: one strip node per mode; 33px painted row in Browsing, zero height in Coding and Organising; same `tabs` order after the round trip; `chevron` true while the narrowed row overflows and false once widened.
- Screenshots (spectacle on KDE Wayland): tab menu, pinned strip, preview card, attention dot.
- Manual rows in 34-VALIDATION.md: drag feel, preview readability, dot visibility, screen-reader pass.

---

_Verified: 2026-11-01_
_Verifier: Claude (gsd-verifier)_
