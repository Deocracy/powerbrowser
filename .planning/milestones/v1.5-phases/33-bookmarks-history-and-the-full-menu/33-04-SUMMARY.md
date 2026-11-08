---
phase: 33-bookmarks-history-and-the-full-menu
plan: "04"
subsystem: chrome-bar
tags: [clear-history, range-picker, destructive-panel, rule-12, key-ruling, live-harness]
status: complete
requires:
  - phase: 33-01
    provides: the privileged clearHistory store kind and its five-target fan-out, ChromeStoreClient.clearHistory(range), ClearHistoryRange, verify-clear-history
  - phase: 33-02
    provides: the star-editor portal pattern and its .pb-bookmark-editor-* rules, the danger token scoped to Remove, verify-shortcut-relay rule 12
  - phase: 33-03
    provides: the hamburger History submenu (historyMenuChildren), ALWAYS_ON_TWINS, the History submenu live helpers
  - phase: 31-site-identity-and-app-menu
    provides: the hamburger button (aria-label CHROME_BAR_COPY.appMenu), the picker's anchor
provides:
  - "Clear Recent History picker .pb-chrome-bar-dropdown.pb-clear-history: a portal anchored 4px under the hamburger, right edge on the button's; heading, five range radios (Last hour checked), fan-out footnote, Cancel and Clear (danger ink)"
  - "ChromeBarWidget.confirmClearHistory(): the only clearHistory(range) caller; success closes the panel, AddressBar.forgetHistoryRows() and refreshBookmarksToolbar(); a refusal shows the failure row in the panel and Enter retries"
  - "ChromeBarWidget.openClearHistoryPicker(opener?) and closeClearHistoryPicker(restoreFocus); appMenuButton (the hamburger element, via appMenuButtonRef)"
  - "Command powerbrowser.chrome-bar.clear-history (CHROME_BAR_CLEAR_HISTORY_COMMAND_ID, 'Clear Recent History…', Browser category, always enabled) whose execute opens the picker only"
  - "chrome-bar-commands.ts: setOpenClearHistory / openClearHistory (the module-level opener pair)"
  - "History submenu: a fourth group, the Clear Recent History… row with the command's key"
  - "Ctrl+Shift+Del on both focus paths: PAGE_SHORTCUTS / PAGE_KEYS row clearHistory (VK_DELETE, accel,shift, firefox key_sanitize, lands in Theia) and the Theia twin ctrlcmd+shift+delete"
  - "AddressBar.forgetHistoryRows(); DROPDOWN_MAX_HEIGHT now exported from address-bar.tsx"
  - "Live scenario clear-history with plants clear-drops-store and clear-takes-token"
affects:
  - 33-05 (the MENU-03 rows: a hamburger Clear Recent History entry, if any, runs CHROME_BAR_CLEAR_HISTORY_COMMAND_ID and opens the same picker; MENU_ORDER and the History submenu are unchanged by this plan)
  - 33-VALIDATION (the BMK-05 live row is written but not run)
tech-stack:
  added: []
  patterns:
    - "A destructive panel's primary button is never disabled while busy: disabling the focused button would blur the panel and close it. A busy flag guards repeat presses instead."
    - "Picker CSS joins the editor's selector lists rather than copying them, so the two panels cannot drift; the danger rule names exactly the two contracted buttons."
key-files:
  created: []
  modified:
    - theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx
    - theia/extensions/chrome-bar/src/browser/address-bar/address-bar.tsx
    - theia/extensions/chrome-bar/src/browser/chrome-bar-commands.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar.css
    - theia/extensions/chrome-bar/src/browser/chrome-bar-keybindings.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar-shortcuts.ts
    - powerbrowser/shell/powerbrowser.js
    - scripts/verify-chrome-bar-commands.mjs
    - scripts/verify-shell-error-copy.mjs
    - scripts/verify-shortcut-relay.mjs
    - scripts/verify-address-bar-live.mjs
key-decisions:
  - "The picker anchors to the Phase 31 hamburger element itself (a stable ref on the existing button), not a new bar button or a slot. There is no exported hamburger const in the tree; the button rendered with aria-label CHROME_BAR_COPY.appMenu is the Phase 31 hamburger."
  - "Focus returns to the opener: the History row passes the hamburger; a key or command records the focused element; with the page focused (Theia's activeElement is the body) focus returns to the current web tab's page."
  - "Focus leaving the panel closes it without moving focus back, so a click elsewhere is not undone. Esc and Cancel close it and restore focus."
  - "Ctrl+Shift+Del's Theia twin has no when-clause, admitted through ALWAYS_ON_TWINS with its reason: no Theia or Monaco binding uses Ctrl+Shift+Delete (Monaco binds only Shift+Delete, to cut). Checked in node_modules at execution time."
  - "Success re-reads what the clear can have changed: the History submenu is rebuilt on every open already, the toolbar re-reads, and the pill drops its history rows and cached favicons."
  - "The live plants inject the observable fault from outside the boundary, because CLEAR_HISTORY_FANOUT is module-private (the 33-03 reopen-no-history precedent): clear-drops-store re-plants the saved_pages in-range row right after the clear; clear-takes-token removes the token cookie right after it."
patterns-established:
  - "verify-shortcut-relay maps Del: KEY_NAMES VK_DELETE ['Del', '⌦'] and theiaRowOf('…+delete') -> VK_DELETE."
requirements-completed: [BMK-05]
duration: "approx. 60 min"
completed: "2026-10-31"
commits: 3
plan_head_before: 9062613f3a426a1c6d7551bdf4b4ff78cac90e9d
plan_head_after: 9e518768f590ea306d050905012d30bcd5c6a766
actuals:
  tokens: 15863
  tasks: 3
  commits: 3
---

# Phase 33 Plan 04: Clear Recent History picker and Ctrl+Shift+Del Summary

**A 320px Clear Recent History panel opens 4px under the hamburger, from the History submenu row, Ctrl+Shift+Del (pill or page focused) or the `Clear Recent History…` command. It offers five ranges with Last hour checked, the fan-out footnote, and Cancel and Clear (danger ink). Clear or Enter sends `clearHistory(range)` from the widget's confirm handler, the only caller. No command, key or relay row clears. A live scenario plants markers in every store and checks, for each range, that in-range rows go, out-of-range and open rows stay, and the token cookie stays.**

## Status

Complete for the static scope. The Theia app was rebuilt (chrome-bar, tab-uris, browser app: 0 errors), `tsc --noEmit` on chrome-bar is clean, and every touched gate and its self-test passes. The `clear-history` live scenario and its two plants exist. Running them needs `objdir/dist/bin/powerbrowser`, which this worktree does not have; the attempt stopped at `harness: firefox-bidi: .../objdir/dist/bin/powerbrowser does not exist`. That run is under "Deferred to end-of-milestone live pass".

## Performance

- Tasks: 3/3
- Commits: 3 (measured from the plan ledger)
- Files: 12 modified, 0 created

## Accomplishments

- **Picker** (`ClearHistoryPicker` function component, a portal into `document.body`):
  - Geometry: fixed, `top` = hamburger bottom + 4px, right edge on the hamburger's, 320px wide, 16px padding, height capped at the shared `DROPDOWN_MAX_HEIGHT` or the viewport bottom less 8px.
  - Contents: 24px heading, five 32px radio rows in a radiogroup (Last hour checked by default), the Caption-size footnote naming the fan-out, the footer with Cancel and Clear.
  - Keys: on mount the checked radio takes focus, so arrows move between ranges. Enter (anywhere but on a button) clears and Esc cancels. Focus leaving the panel closes it.
  - The panel is the confirmation. There is no second dialog.
- **Confirm** (`confirmClearHistory`): sends `this.store.clearHistory(range)` once (a busy flag drops repeat presses). On success it closes the panel with focus restored, calls `AddressBar.forgetHistoryRows()` and re-reads the bookmarks toolbar. On refusal the panel stays with "{App} couldn't clear that history. Press Enter to try again." and Enter retries. The log line carries the error name only.
- **Openers**: the History submenu's fourth group (the `Clear Recent History…` row with its key), the command, the Theia keybinding and the page relay row all reach `openClearHistoryPicker`. None of them clears.
- **Keys**:
  - Page row `clearHistory`: `VK_DELETE`, `accel,shift`, mirrors Firefox's `key_sanitize`, `landsInTheia: true` (the picker takes focus in Theia), created disabled like every page key.
  - Theia twin: `ctrlcmd+shift+delete` on `CHROME_BAR_CLEAR_HISTORY_COMMAND_ID`, no when-clause.
- **CSS**: the picker joins the editor's selector lists (panel, heading, failure row, radio rows and hover, footer, spacer, buttons). The danger rule is `.pb-bookmark-editor-remove, .pb-clear-history-clear` and nothing else. A new rule covers the footnote (12px, muted ink).
- **Gates**:
  - verify-chrome-bar-commands: 16 ids and 13 labels (`clear-history`, `Clear Recent History…`).
  - verify-shell-error-copy: 9 new nav-copy strings ("Clear" and "Cancel" were already pinned) and the `Ctrl+Shift+Del` shortcut label.
  - verify-shortcut-relay: the Del key name, `theiaRowOf` for `delete`, an `ALWAYS_ON_TWINS` entry, and 3 plants (30 in total, 6 pairs).
  - verify-clear-history: unchanged and green (the registry is unchanged, as the plan requires).
- **Live** (`clear-history` in `verify-address-bar-live.mjs`):
  - Planting: for each derived range, marker rows go into Places (a visit in range, one 30 minutes before the range begins), tabs.sqlite (a closed row in range, a closed row out of range with a thumbnail, and a row closed out of range but seen in range with a thumbnail), saved_pages (an in-range copy, a copy of the in-range closed row, an out-of-range copy) and the web-tab history file (keys of the in-range and out-of-range closed rows).
  - Reads: every store is read back chrome-side before the clear (the positive control) and after it.
  - Entry paths: the five ranges open the picker by the History row, the pill key, the page key (the `clearHistory` row must fire), the command and the pill key again. The picker's shape is checked against `CHROME_BAR_COPY` each time. Clear and Enter alternate.
  - After each clear: the open rows (`closed_at IS NULL`) are unchanged, the `POWERBROWSER_TOKEN` cookie is still in the 127.0.0.1 jar, and a same-origin frame request still returns 200.
  - Also covered: Esc clears nothing and returns focus to the pill; a stubbed refusal shows the failure row, and Enter after the stub is removed closes the panel; after the first range, the History submenu and the pill's history rows stop listing the cleared page (each listed it before the clear).
  - Plants: `clear-drops-store` must go red naming `saved_pages`; `clear-takes-token` must go red on "the IDE was signed out by the clear".

## Names 33-05 must know

- Command id, never re-spelled: `CHROME_BAR_CLEAR_HISTORY_COMMAND_ID` = `powerbrowser.chrome-bar.clear-history`. The command object is `CHROME_BAR_CLEAR_HISTORY`, label `Clear Recent History…`, Browser category, always enabled.
- Opener in `chrome-bar-commands.ts`: `openClearHistory()` and its setter `setOpenClearHistory()`. **Never name the store kind in a command or keybinding file**: verify-web-tab-bridge rule 12 matches the bare word in any file that registers a command or keybinding. `openClearHistory` does not match.
- Widget methods: `openClearHistoryPicker(opener?)`, `closeClearHistoryPicker(restoreFocus)`, `confirmClearHistory()`, `renderClearHistoryPicker()`. Field `appMenuButton` holds the hamburger element.
- `historyMenuChildren(reads)` now returns `[reopen leaf, closed group, recent group, clear group]`. The live helper `historySections(items)[3]` is the clear section.
- `AddressBar.forgetHistoryRows()`; `DROPDOWN_MAX_HEIGHT` is exported from `address-bar/address-bar.tsx`.
- Copy keys: `clearRecentHistoryRow`, `clearHistoryHeading`, `clearHistoryLastHour`, `clearHistoryLast2Hours`, `clearHistoryLast4Hours`, `clearHistoryToday`, `clearHistoryEverything`, `clearHistoryFootnote(subject)`, `clearHistoryConfirm`, `clearHistoryCancel`, `clearHistoryFailed(subject)`.
- CSS: `.pb-clear-history` plus `-heading`, `-failure`, `-ranges`, `-range`, `-footnote`, `-footer`, `-spacer`, `-button`, `-clear` (the danger button).
- Keys: page row id `clearHistory`; `ALWAYS_ON_TWINS` now has `reopenClosedTab` and `clearHistory`.
- Live: `CLEAR_RANGES`, `readPicker`, `openClearPicker(app, how, tabId)` with `how` one of `menu`, `pill`, `page`, `command`.

## Task Commits

1. Task 1: `c9b3c4b1` feat(33-04): Clear Recent History picker, its opening command and copy
2. Task 2: `5045a1d1` feat(33-04): Ctrl+Shift+Del opens the clear-history picker on both focus paths
3. Task 3: `9e518768` test(33-04): live clear-history scenario with token survival and two plants

## Files Created or Modified

- `chrome-bar-widget.tsx`: the picker component, range table, state, open/close/confirm/render methods, the History submenu's fourth group, the hamburger ref
- `address-bar/address-bar.tsx`: `forgetHistoryRows()`, `DROPDOWN_MAX_HEIGHT` exported
- `chrome-bar-commands.ts`: the id, the command, the opener pair, the registration
- `chrome-bar-copy.ts`: 11 strings
- `chrome-bar.css`: the picker joins the editor rules; the footnote rule
- `chrome-bar-keybindings.ts`: the Ctrl+Shift+Del twin
- `chrome-bar-shortcuts.ts`: the `clearHistory` row and its relay action
- `powerbrowser/shell/powerbrowser.js`: the `clearHistory` `PAGE_KEYS` row
- `scripts/verify-chrome-bar-commands.mjs`, `scripts/verify-shell-error-copy.mjs`: pins
- `scripts/verify-shortcut-relay.mjs`: Del mapping, `ALWAYS_ON_TWINS` entry, 3 plants
- `scripts/verify-address-bar-live.mjs`: the scenario, its helpers, 2 plants, the header entry

## Decisions Made

See the `key-decisions` frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] No hamburger "const" exists; the picker anchors to the Phase 31 button element**
- Found during: Task 1 (the plan's grep-first step)
- Issue: the plan says to grep for "the Phase 31 hamburger button const" and treat a missing const as blocked. The tree has `APP_MENU_ID` (the menu id) and the hamburger `<button>` rendered inline in `render()`, with no exported button const. The Phase 31 skeleton itself is present, so the precondition the step protects (no stand-in anchor, no new bar button) holds.
- Fix: a stable `ref` on the existing hamburger button (`appMenuButtonRef`), used as the picker's anchor and as the History row's focus return. No new button and no slot.
- Commit: c9b3c4b1

**2. [Rule 2 - Correctness] The address bar needed a method to drop history rows**
- Found during: Task 1
- Issue: "address-bar history rows reflect the clear at once" had no entry point. The pill holds its last place rows and a favicon cache.
- Fix: `AddressBar.forgetHistoryRows()` drops `history` rows and the favicon cache and recomposes an open dropdown. The next query re-reads both.
- Commit: c9b3c4b1

**3. Live plants simulate the fan-out fault from outside**
- The plan's plants are "a store dropped from the fan-out and a token-enumerating fan-out". `CLEAR_HISTORY_FANOUT` is module-private and frozen, so the harness cannot edit it. `clear-drops-store` re-plants the saved_pages in-range row right after the clear (what a fan-out without that target leaves). `clear-takes-token` removes the token cookie right after the clear (what a cookie-enumerating target does). Each produces the same observable fault, and each assertion names its store. This follows the 33-03 `reopen-no-history` precedent.

**4. Thumbnail coverage uses a row closed out of range but seen in range**
- A closed in-range row is deleted outright, so its thumbnail cannot show the thumbnail target separately. The scenario plants a row with `closed_at` out of range and `last_accessed` in range: the row must stay and its thumbnail must go. Open-tab thumbnails are not asserted, because a live tab may capture a new card at any time.

## Known Stubs

None.

## Threat Flags

None beyond the register.
- T-33-04: the static fan-out and exemption gate (verify-clear-history, 33-01) is green. The live scenario checks every range against every store, the open rows, the token cookie and the signed-in frame, and has a plant each for a dropped store and the token. The live run is deferred.
- Rule 12: `.clearHistory(` appears only in `chrome-bar-widget.tsx` (`confirmClearHistory`), and the bare name `clearHistory` appears in no file that registers a command or keybinding. verify-web-tab-bridge is green.

## Deferred to end-of-milestone live pass

- `node scripts/verify-address-bar-live.mjs --scenario clear-history` and `node scripts/verify-address-bar-live.mjs --self-test` (it now includes the `clear-drops-store` and `clear-takes-token` plants), against a rebuilt binary. `powerbrowser.js` changed, so `-purgecaches` is needed; the harness sets `MOZ_PURGE_CACHES=1`. Points to watch:
  - Ctrl+Shift+Del through the text-input processor: the page row (`keycode VK_DELETE`) with the page focused, and the Theia twin with the pill focused.
  - Planted SQL rows: `INSERT OR REPLACE` into `tabs` with only the listed columns (`group`, position and order stay NULL), and `saved_pages` with a non-minted `dir`, so `clearSavedPages` removes the database row and no file.
  - `PlacesUtils.history.fetch(url, { includeVisits: true })` returning null for a page whose only visit was removed (an orphan page with no bookmark is dropped).
  - The History submenu check after the first range: with `inAt` = now − 1s, the planted visit and closed row are the newest, so both are within the 10-row sections before the clear.
  - React's controlled radio: `input.click()` changes the range before Enter or Clear.
  - The Esc step: Theia's capture-phase keybinding dispatch must not consume Esc before the panel's handler (the bookmark editor precedent).
  - The refused-clear step: whether focus stays inside the panel after the failure row renders (Enter retries only while focus is inside it).
- Visual check against 33-UI-SPEC: the 320px panel under the hamburger, 24px heading, 32px radio rows, Caption footnote, 32px buttons, and danger ink on Clear only.
- Copy judgement for Chris: the failure row "{App} couldn't clear that history. Press Enter to try again." is verbatim from 33-UI-SPEC. The command label uses the ellipsis character (`…`), as the UI-SPEC command table does.

## Issues Encountered

None beyond the deviations.

## Next Phase Readiness

- 33-05 can add a hamburger Clear Recent History entry (if MENU-03 lists one) on `CHROME_BAR_CLEAR_HISTORY_COMMAND_ID`. It opens the same picker. The Actions mode already lists the command, because it is in the Browser category.

Final `nix develop .#theia --command scripts/verify-platform.sh --quick`: exit 0, "verify-platform: PASS -- all checks passed".

## Self-Check: PASSED

- FOUND: c9b3c4b1, 5045a1d1, 9e518768 (ancestors of HEAD)
- `node scripts/verify-shortcut-relay.mjs --self-test`: PASS (30 plants)
- `node scripts/verify-chrome-bar-commands.mjs --self-test`: PASS (7 plants)
- `node scripts/verify-shell-error-copy.mjs --self-test`: PASS
- `node scripts/verify-clear-history.mjs --self-test`: PASS (10 plants)
- `node scripts/verify-web-tab-bridge.mjs --self-test`: PASS (40 plants)
- `node scripts/verify-site-identity.mjs --self-test`: PASS (53 plants)
- `theia/node_modules/.bin/tsc --noEmit -p theia/extensions/chrome-bar`: clean
