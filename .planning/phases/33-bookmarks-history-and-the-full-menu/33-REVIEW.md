---
phase: 33-bookmarks-history-and-the-full-menu
reviewed: 2026-11-01T07:01:20Z
depth: standard
files_reviewed: 26
files_reviewed_list:
  - powerbrowser/INTERNAL-APIS.md
  - powerbrowser/shell/GroupActorChild.sys.mjs
  - powerbrowser/shell/PowerBrowserAPI.sys.mjs
  - powerbrowser/shell/powerbrowser.js
  - scripts/verify-address-bar-live.mjs
  - scripts/verify-address-bar-modes.mjs
  - scripts/verify-chrome-bar-commands.mjs
  - scripts/verify-clear-history.mjs
  - scripts/verify-page-tools-edit.mjs
  - scripts/verify-platform.sh
  - scripts/verify-shell-error-copy.mjs
  - scripts/verify-shortcut-relay.mjs
  - scripts/verify-site-identity.mjs
  - scripts/verify-web-tab-bridge.mjs
  - theia/extensions/chrome-bar/src/browser/address-bar/address-bar.tsx
  - theia/extensions/chrome-bar/src/browser/chrome-bar-commands.ts
  - theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts
  - theia/extensions/chrome-bar/src/browser/chrome-bar-keybindings.ts
  - theia/extensions/chrome-bar/src/browser/chrome-bar-preferences.ts
  - theia/extensions/chrome-bar/src/browser/chrome-bar-shortcuts.ts
  - theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx
  - theia/extensions/chrome-bar/src/browser/chrome-bar.css
  - theia/extensions/chrome-bar/src/browser/site-identity/app-menu.ts
  - theia/extensions/chrome-bar/src/browser/site-identity/site-identity-table.ts
  - theia/extensions/tab-uris/src/browser/chrome-store-client.ts
  - theia/extensions/tab-uris/src/browser/web-tab.ts
findings:
  critical: 1
  warning: 8
  info: 6
  total: 15
status: issues_found
---

# Phase 33: Code Review Report

**Reviewed:** 2026-11-01
**Depth:** standard
**Files Reviewed:** 26
**Status:** issues_found

## Summary

Scope: the source files changed by `git log 23c08bb5..HEAD` on `workspace/p33` (the 33-01 to 33-05 commits; `.planning/` and config commits excluded). The review concentrated on the chrome-side Phase 33 section of `PowerBrowserAPI.sys.mjs`, the edit-state actor pair, the star and editor in `address-bar.tsx`, the toolbar, History submenu, clear-history picker and full menu in `chrome-bar-widget.tsx`, and the new gate `verify-clear-history.mjs`. Callees were read where a finding depends on them: the tab-store sweep (`sweepTabStoreFromSessionStore`, `parseSessionStoreClosedRows`, `writeClosedTabRow`), `webTabOpen`/`webTabClose`, `purgeSiteTabRows`, `openUrl`/`createWidget`, the store and web-tab request timeouts, upstream `ActorManagerParent` (Controllers) and `browser-sets.inc.xhtml` (`key_sanitize`), and the Theia 1.76 keybinding tables for Ctrl+Shift+T and Ctrl+Shift+B.

What holds up:

- Every Places write goes through `PlacesUtils.bookmarks`/`history`, and every input is checked: GUID shape, http(s) only, title cap, root-name allow-list.
- Every closed-row DELETE is fenced by `closed_at IS NOT NULL`, so open rows survive a clear.
- No target in the fan-out reaches a cookie.
- The kept closed-tab histories are capped at 25 and never written to disk.
- The four new keys collide with nothing installed. Theia binds reopen-closed-editor to Alt+Shift+T in the browser build, and nothing binds Ctrl+Shift+B or Ctrl+Shift+Del.
- All eight changed gates, their self-tests, `check-internals-boundary.sh` (with `--catalogue`) and the brand scan pass on this tree.

The main defect is that Clear Recent History does not stay cleared for tabs closed in a stock browser window. The tab-store sweep runs on every sessionstore write and re-imports SessionStore's closed tabs, which the clear never purges. The research assumed this merge ran "at startup only", but the code runs it every time sessionstore writes, and the gate does not model the projection.

Other problems:

- Reopen Closed Tab is read-only, so a held key opens the same row twice, and a stock row is never used up.
- `bookmarkPage` is idempotent only for requests that do not overlap.
- The editor's Remove deletes bookmarks the panel never showed.
- A slow clear is reported as a failure.
- The hamburger now waits on the page before it opens.
- Full Screen cannot be left once no web tab is active.

## Critical Issues

### CR-01: Clear Recent History is undone within seconds for tabs closed in a stock window

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:7077-7083` (clear), `:3043-3057` (sweep re-insert), `:3190-3197` (sweep trigger), `:2814-2830` (projection)

**Issue:** `clearClosedTabRows` deletes `stock:*` closed rows in the range. The tab store does not own that history: it is a projection of SessionStore's per-window `_closedTabs`. `startTabStoreTriggers` registers `sweepTabStoreFromSessionStore` on `sessionstore-state-write-complete`, which fires every ~15 s while any stock window exists. On each run the sweep calls `parseSessionStoreClosedRows()` and `writeClosedTabRow()` (an `INSERT ... ON CONFLICT`) for every closed tab newer than the retention cutoff. The sequence:

1. The user closes tabs in a stock window (GUI-01) and then clears Last hour or Everything.
2. The clear deletes those rows and returns `cleared`, and the picker closes.
3. The next sessionstore write re-inserts every deleted row with its original URL, title and `closed_at`.
4. The History submenu, Ctrl+Shift+T and `listClosedTabs` list them again. SessionStore's own `_closedTabs`, with the full back/forward entries, was never touched, so the stock window's Ctrl+Shift+T restores them with history.

The footnote ("This also clears PowerBrowser's closed tabs ...") is therefore false for every stock-window tab. This is a privacy defect in the feature whose only purpose is removal. 33-RESEARCH D-06 says the sessionstore merge runs "at startup only via the existing sweep", but the sweep is live. `verify-clear-history.mjs` derives its targets from the DDL markers only, so it cannot see this path (WR-08).

**Fix:** Purge SessionStore's closed tabs for the range in the fan-out before deleting the rows, so the projection has nothing left to re-import. Add the call as a catalogued boundary touchpoint:

```js
// before clearClosedTabRows in CLEAR_HISTORY_FANOUT
["sessionstore._closedTabs", clearSessionStoreClosedTabs],

async function clearSessionStoreClosedTabs(span) {
  for (const win of Services.wm.getEnumerator("navigator:browser")) {
    const closed = lazy.SessionStore.getClosedTabDataForWindow(win);
    // newest first; forget from the end so indices stay valid
    for (let i = closed.length - 1; i >= 0; i--) {
      if (span.everything || (closed[i].closedAt >= span.begin && closed[i].closedAt <= span.end)) {
        lazy.SessionStore.forgetClosedTab(win, i);
      }
    }
  }
  // closed windows hold closed tabs too: forgetClosedWindow for windows closed in range
}
```

For Everything, `Services.obs.notifyObservers(null, "browser:purge-session-history")` is the stock equivalent. Extend `verify-clear-history.mjs` so that every projection the sweep imports (`parseSessionStoreClosedRows`) must have a fan-out target. Add a live variant: close a stock tab, clear, wait for one `sessionstore-state-write-complete`, and assert that the row is still gone.

## Warnings

### WR-01: A held or repeated Ctrl+Shift+T opens the same closed row twice, on the same row key

**File:** `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx:527-545`, `powerbrowser/shell/PowerBrowserAPI.sys.mjs:7027-7045`, `:3341-3345`

**Issue:** `reopenClosedTab` is a pure read: it returns the newest closed row and changes nothing. The row becomes open only when the later `webTabOpen` runs `writeTabRow`, which is not awaited. Key auto-repeat on a held Ctrl+Shift+T, a double press, or a double click on the History row sends a second `reopenClosedTab` before the first open has written. Both requests get the same row, and both call `openUrl(url, key)`. `createWidget` mints a fresh widget id each time and does not check whether the key is already open. The result is two overlays sharing one `rowKey`:

- The second open finds no armed history (`takeWebTabHistory` consumed it), so the duplicate loads URL-only.
- Closing either duplicate runs `closeTabRow(uri)`, which marks the row closed while the other tab is still open. Panorama then drops the open tab, and the next Ctrl+Shift+T can open a third copy.

**Fix:** Make reopen claim the row atomically on the chrome side, for example `UPDATE tabs SET closed_at = NULL WHERE uri = :uri AND closed_at IS NOT NULL RETURNING ...` (or a check of the affected-row count) inside `reopenClosedTab`, and return null when nothing was claimed. Also keep an in-flight guard in `reopenClosedTabRow`, and refuse `openUrl` with a key that is already open.

### WR-02: A closed stock tab is never used up, so Ctrl+Shift+T reopens it again and again

**File:** `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx:539-542`, `powerbrowser/shell/PowerBrowserAPI.sys.mjs:7042-7044`

**Issue:** For a `stock:*` row, `key` is null, so the frontend opens a new web tab with a fresh `web:<tabId>` key. Nothing ever reopens or deletes the stock row, so it stays the newest closed row. Each later Ctrl+Shift+T, and the History submenu's first row, opens the same page again instead of moving on to the next closed tab. Firefox removes an entry from the undo list once it has been restored.

**Fix:** When a stock row is reopened as a web tab, remove it from closed history in the same chrome call. For example, `reopenClosedTab` deletes the stock row (and its SessionStore entry, see CR-01) when it returns `key: null`, or it answers a fresh web key that the open then writes.

### WR-03: `bookmarkPage` is not idempotent under concurrency, so a held Ctrl+D makes duplicate bookmarks

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:6881-6891`, `theia/extensions/chrome-bar/src/browser/address-bar/address-bar.tsx:2675-2712`

**Issue:** The check (`bookmarks.fetch({url})`) and the write (`bookmarks.insert`) are separate awaits. Two overlapping requests both see no bookmark and both insert. The frontend does not serialize requests: `openBookmarkStar` returns early only `if (this.bookmarkEditor)`, and the editor is set after the await. Ctrl+D auto-repeat (on both focus paths), or a click followed quickly by Ctrl+D, therefore sends overlapping `bookmarkPage` calls. The comment "a double click never makes two" does not hold, and the extra bookmark is invisible because the editor describes only one.

**Fix:** Add an in-flight flag in `openBookmarkStar`, set before the await and cleared in `finally`. In chrome, serialize `bookmarkPage` per URL, for example with a module-level `Map<url, Promise>` that a second call awaits and then re-fetches.

### WR-04: The editor's Remove deletes every bookmark of the URL, including ones the panel never showed

**File:** `theia/extensions/chrome-bar/src/browser/address-bar/address-bar.tsx:2768`, `powerbrowser/shell/PowerBrowserAPI.sys.mjs:6922-6937`

**Issue:** The editor edits one bookmark (`editor.guid`), and its button reads "Remove bookmark", singular. `removeFromBookmarkEditor` sends `editor.url`, and `removeBookmark` deletes every bookmark with that URL. Copies the user filed in other folders, including nested folders the panel cannot show (`folder: ''`), are deleted without warning, and nothing can undo it. Firefox's star does remove all of them, but its button names the count ("Remove 3 Bookmarks"), so the user knows. The toolbar item's Remove passes the GUID, so the same label means two different things in this phase.

**Fix:** Remove by `editor.guid`. If all copies should go, as in Firefox, fetch the count when the editor opens and render "Remove N bookmarks" when N > 1. That needs a copy row added to the UI-SPEC and to `verify-shell-error-copy`.

### WR-05: A slow clear is reported as a failure, and a real failure can disappear with the panel

**File:** `theia/extensions/tab-uris/src/browser/chrome-store-client.ts:303-309`, `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx:636-656`, `:223`

**Issue:** There are two cases.

- **Timeout:** `clearHistory` uses the default `STORE_ACK_TIMEOUT_MS` (8 s). Everything runs `removeVisitsByFilter` over the whole Places database, then deletes saved-page directories recursively, one after another. On a profile with years of history, that can take longer than 8 s. The client then resolves `{ok:false, reason:'timeout'}`, and the picker shows "couldn't clear that history". Chrome is still clearing and will finish. The prompt tells the user to press Enter, which starts a second clear while the first is still running.
- **Blur:** the panel's `onBlur` calls `onClose(false)` whenever focus leaves it, including while `busy`. If the user clicks elsewhere during the request and chrome then refuses, `confirmClearHistory` sets `picker.failed` on a picker that is no longer rendered. Nothing on screen says the clear failed, which matters most for this feature.

**Fix:** Pass an explicit long timeout, as `savePageCopy` does with `SAVE_PAGE_ACK_TIMEOUT_MS`. Ignore blur while `picker.busy`, or reopen the panel with the failure row when a clear fails after the panel has closed.

### WR-06: The hamburger waits on the page and the store before it opens

**File:** `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx:1100-1105`, `:1133-1140`, `powerbrowser/shell/PowerBrowserAPI.sys.mjs:7216-7223`

**Issue:** `openAppMenu` now awaits three things before it draws anything:

- `readHistoryMenu()`: two store reads, 8 s timeout each;
- the bookmarks read;
- `readEditState()`: six `webTabEdit` checkOnly requests, 5 s timeout each.

Chrome answers each edit check through `actor.sendQuery` to the page's content process, with no timeout. A hung page (a script loop, a stalled content process) therefore delays the whole menu by 5 s, and a slow tab store by 8 s. That includes the Quit row, which is the obvious way out of a hung page. Each queued query also stays pending in chrome until the content process answers or dies. Because the click handler is now asynchronous, a second click during the wait draws a second menu.

**Fix:** Open the menu at once and fill the Edit submenu from a bounded race, for example `Promise.race([query, timeout(250)])`. Rows that do not answer in time fall back to the cached flag that `webTabEditReply` already has. Ignore clicks while an open is pending.

### WR-07: Once in full screen with no web tab active, the user cannot leave it

**File:** `theia/extensions/chrome-bar/src/browser/chrome-bar-commands.ts:448-452`

**Issue:** `CHROME_BAR_FULL_SCREEN` is `isEnabled: () => !!currentWebTab()`, and the menu row dims from that predicate (`APP_MENU_COMMANDS`). The command toggles the shell window (`toggleShellFullscreen`), not a page, so a web tab is not needed. The other exits do not work:

- The shell has no F11 row (`verify-shortcut-relay` asserts "no F11 row").
- Escape does not leave window full screen.

A user who enters full screen and then activates an editor, a terminal or Panorama has a dimmed Full Screen row and no other way out. 33-UI-SPEC lists Full Screen among the rows that need a web tab, but that grouping does not fit a window toggle.

**Fix:** Drop the `isEnabled` predicate, or enable the command whenever the window is in full screen. Record the spec deviation. Phase 35 keeps the same command id.

### WR-08: `verify-clear-history` cannot detect a delete that ignores the range, or the sessionstore re-import

**File:** `scripts/verify-clear-history.mjs:165-180`

**Issue:** For `tabs.closed_at`, the gate checks only that each DELETE contains `closed_at IS NOT NULL`. `DELETE FROM tabs WHERE closed_at IS NOT NULL` would delete all closed history on Last hour, and it passes. The thumbnail rule likewise checks `SET thumbnail = NULL` without a range bound, and `saved_pages` needs only some `DELETE FROM saved_pages`. Every plant tests the "missed a target" direction. None tests a target that deletes too much, which is the data-loss direction in the focus area. The expected-target derivation reads only the DDL markers and the `*_FILE_NAME` constants, so a store re-filled from another source (CR-01) can never make the gate fail.

**Fix:** Require each closed-row and saved-page statement to bind both `:begin` and `:end`, and the thumbnail statement to bind `:begin`. Plant a range-dropping DELETE and require the gate to fail on it. Add a derivation rule: every `parseSessionStore*Rows` projection that `sweepTabStoreFromSessionStore` writes needs a matching fan-out target.

## Info

### IN-01: Clear deletes closed rows that are still group members; forget-site keeps them

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:7077-7083` (compare `:6046`)

**Issue:** `purgeSiteTabRows` (31-REVIEW CR-03) deletes a closed row only when `group_id IS NULL` ("Group members are kept, so no group loses a tab"). `clearClosedTabRows` deletes closed grouped rows too. A closed grouped web tab revives into its group on reopen (`trackShellTab` comment), so the two removal paths treat group membership differently.

**Fix:** Decide which rule applies and state it in `docs/TAB-STORE.md`. If clear should match forget-site, add `AND group_id IS NULL` and clear `x`/`y`/`ord` on the kept rows.

### IN-02: Everything is a range delete up to the moment the clear started, not a full clear

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:7054`, `:7071-7073`, `:7154-7155`

**Issue:** `end` is `Date.now()`, taken before the fan-out runs. Visits stamped later survive: visits recorded while the clear runs, and visits with a future timestamp after a clock change. Firefox's Everything calls `PlacesUtils.history.clear()`.

**Fix:** For `span.everything`, call `lazy.PlacesUtils.history.clear()`, and let `verify-clear-history` accept that call for Everything.

### IN-03: The star editor's heading and the bookmarkPage comment can be wrong

**File:** `theia/extensions/chrome-bar/src/browser/address-bar/address-bar.tsx:2687-2709`, `powerbrowser/shell/PowerBrowserAPI.sys.mjs:6879-6886`

**Issue:** There are three small problems.

- If the star's read has not arrived yet, a click sends `bookmarkPage`, chrome returns the existing bookmark, and the panel says "Bookmark this page" (`created = true`) for a page bookmarked long ago.
- The comment says `bookmarkPage` answers "its first bookmark". `bookmarks.fetch({url})` returns the most recently modified one.
- A page with no title creates a bookmark with an empty name, and Done is then disabled until the user types one.

**Fix:** Have chrome return `created: boolean`, and set the heading from it. Correct the comment. Fall back to the URL as the default name.

### IN-04: The About row opens a stock browser window when none exists

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:6106-6111`, `:6119`

**Issue:** `openStockPageFromMenu('about')` uses the shared path, which opens `about:newtab` in a new stock window only to call `openAboutDialog()` from it. The user gets a stray browser window behind the About dialog.

**Fix:** Call `openAboutDialog` from the shell window if `utilityOverlay.js` is loaded there, or open `chrome://browser/content/aboutDialog.xhtml` directly with `Services.ww.openWindow`.

### IN-05: The closed-tab history store also captures tabs dropped by a reload or quit

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:3877-3881`, `:6976-6995`

**Issue:** `webTabClose` calls `keepClosedWebTabHistory` for every drop, including a frontend reload and the quit path (`webTabDropOwnedBy`). Those rows stay open, by NG-005. The comment "a closed overlay's back/forward history" is therefore inaccurate. On a frontend reload with many tabs open, the 25 slots fill with open tabs' histories and evict real closed ones. The stale entries in `keptClosedWebTabHistories` are left behind after `takeWebTabHistory` deletes the data, which is harmless.

**Fix:** Keep the history only on a user close. For example, `closeTab` passes a flag to `webTabClose`, or the keep moves to the `closeTabRow` path. This is the same shape as 32-REVIEW IN-07.

### IN-06: The edit-state gate does not pin the parent export or the browsers group

**File:** `scripts/verify-page-tools-edit.mjs:244`

**Issue:** Check 7 requires the registration call and the child class, but not `export class PowerBrowserEditStateParent` or `messageManagerGroups: ["browsers"]`. If the parent is renamed, `getActor` throws, and `webTabEditEnabled` silently falls back to the cached flag, which is the stale-after-collapse behaviour PAGE-09 fixes. The gate stays green.

**Fix:** Derive `${actorName}Parent` from the actor name and require it as an export of `PowerBrowserAPI.sys.mjs`. Plant a rename and require the gate to fail.

---

_Reviewed: 2026-11-01T07:01:20Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

## Fixes applied (CR-01, WR-08)

Applied 2026-11-01 on `workspace/p33` by gsd-code-fixer. The other findings are handled separately and are not covered here.

### CR-01: fixed, live confirmation deferred (commit `c61ed0d6`)

- New fan-out target `sessionstore._closedTabs` → `clearSessionStoreClosedTabs`, placed before `tabs.closed_at` in `CLEAR_HISTORY_FANOUT`. It reads `SessionStore.getClosedTabData({closedTabsFromAllWindows: true, private: false})` and calls `SessionStore.forgetClosedTabById(closedId, {includePrivate: false})` for each closed tab whose `closedAt` is in range (every one, for Everything). Signatures were confirmed in `upstream/browser/components/sessionstore/SessionStore.sys.mjs` (`:440`, `:590`). `forgetClosedTabById` was used instead of the review's `forgetClosedTab(win, i)`: `getClosedTabDataForWindow` returns the merged list of closed tabs and closed-group tabs, so its indices do not match `_closedTabs`.
- Scope matches the projection: the closed tabs of open non-private windows, which is exactly what `parseSessionStoreClosedRows` reads. Closed windows (`_closedWindows`) are not projected into the tab store and are not forgotten. `browser:purge-session-history` was not used for Everything because it purges far more than history.
- Both calls are catalogued in `powerbrowser/INTERNAL-APIS.md` at the end of the Touchpoints table (`:7233`, `:7236`). The one-line insertion shifted six catalogue rows. `verify-ng-040 --fix` moved only `:7206→7207`; `:7072, 7110, 7139, 7145, 7186` were shifted by hand and each one was checked against its target line. Those five rows sit in the table under `## Deliberately not touched`, not under `## Touchpoints`, so ng-040's direction-2 parser never reads them. This misplacement predates this fix and is left for a separate cleanup.
- Residual race: a sweep that started *before* the clear holds a pre-forget snapshot. If its `writeClosedTabRow` calls land after the DELETE, they can re-insert rows once. Later sweeps see nothing, but the row stays until the next clear. The window is a few milliseconds.
- **Deferred live check:** in a stock window, close a tab, run Clear Recent History (Last hour), wait for one `sessionstore-state-write-complete`, then assert that the `stock:*` row is still absent from `tabs.sqlite`, the History submenu and `listClosedTabs`, and that the stock window's Ctrl+Shift+T no longer restores it. The natural home is the clear-history scenario in `scripts/verify-address-bar-live.mjs`.

### WR-08: fixed (commit `42252cbd`)

- `scripts/verify-clear-history.mjs` derives `sessionstore.<list>` targets from the tree: every `win._closed*` list that a `parseSessionStore*Rows` projection called by `sweepTabStoreFromSessionStore` iterates. It requires the forget evidence for that target and requires it to run before any `<table>.closed_at` target. These checks landed with CR-01 so the gate stayed set-equal.
- Range binding, which covers the data-loss direction: every closed-row statement (the DELETE and the SELECT that feeds the deleted keys onward) binds `:begin` and `:end`. The thumbnail reset binds `:begin`. Every `saved_pages` statement binds the range or a chosen row's `= :uri` key, and at least one binds the range. The sessionstore forget compares `closedAt` to `span.begin` and `span.end`.
- Six new `--self-test` plants, each red naming its drift: closed-row DELETE ignores the range, saved-page SELECT ignores the range, thumbnail reset ignores the range, fan-out missing the sessionstore target, sessionstore forget ignores the range, and sessionstore target after the closed-row target. 16/16 plants go red.

Verification ran in the `workspace/p33` worktree (no separate fixer worktree): `nix develop .#theia --command scripts/verify-platform.sh --quick` exited 0 after each fix, with changes staged. No Gecko build or live run is available here.

## Fixes applied (WR-01..WR-07)

Applied 2026-11-01 on `workspace/p33` by gsd-code-fixer, in the worktree (no separate fixer worktree). Each fix is one commit; WR-01 and WR-02 share one because one function claims the row for both. INFO findings were not in scope. Gates ran in the `workspace/p33` worktree with changes staged: `nix develop .#theia --command scripts/verify-platform.sh --quick`. The chrome-bar and tab-uris extensions were rebuilt with `yarn build` (`tsc -b`) after each frontend change. No Gecko build or live run was available.

### WR-01, WR-02: fixed (commit `cbbb7eaa`), live confirmation deferred

- `reopenClosedTab` now claims the row it answers through `claimClosedTabRow` (appended at the end of `PowerBrowserAPI.sys.mjs`). The claim takes an in-memory per-uri guard with no await between check and add, then re-checks `closed_at IS NOT NULL` in the store, so an overlapping call and a later call both answer null. A web row is marked open (`closed_at = NULL`, which `webTabOpen`'s own write would also do). A stock row is used up: its SessionStore record is forgotten by `closedId` (found by recomputing its `stock:*` key with the new shared `stockClosedTabUri`, which `parseSessionStoreClosedRows` now also uses) and its `tabs` row is deleted, so the sweep does not re-import it and the next Ctrl+Shift+T moves on to the next closed tab.
- `reopenClosedTab` is now classed `store-write` in `verify-web-tab-bridge.mjs` (it was `read`) and the section comment says so. It stays reachable from the Ctrl+Shift+T command, so it is not `privileged`.
- Two catalogue rows added to `INTERNAL-APIS.md` for the new `SessionStore.getClosedTabData` and `SessionStore.forgetClosedTabById` call sites.
- Not done: a frontend in-flight guard in `reopenClosedTabRow`, and refusing `openUrl` with a key that is already open. The chrome-side claim removes the cause, and a held key now opens successive closed tabs, as Firefox does.
- Residual: if the frontend's open fails after the claim, a claimed web row stays marked open with no tab (it restores at the next start, like any open row).
- **Deferred live check:** hold or double-press Ctrl+Shift+T with two closed tabs and assert two distinct tabs open and the History submenu loses both rows. Close a stock-window tab, press Ctrl+Shift+T from the shell, and assert it opens once and that a second press does not reopen it.

### WR-03: fixed (commit `813ac7fd`)

- Chrome runs `bookmarkPage` calls for one url through a per-url promise queue (`bookmarkPageQueue`), so the fetch and the insert of two overlapping calls no longer interleave. The comment now says it answers the most recently modified bookmark (IN-03's second point).
- `openBookmarkStar` sets `bookmarkStarPending` before the await and clears it in `finally`, and returns early while it is set.
- **Deferred live check:** hold Ctrl+D on an unbookmarked page and count the page's bookmarks in Places (expect one).

### WR-04: fixed (commit `d7c7fd07`)

- `removeFromBookmarkEditor` sends `editor.guid`, so Remove deletes only the bookmark the panel shows. Copies filed in other folders stay, and the star re-reads and stays filled while one remains. The REVIEW's alternative (a "Remove N bookmarks" label) needs a new copy row and an owner decision, so the recommended minimal option was taken.
- **Deferred live check:** bookmark one page into two folders, open the editor on one, press Remove, and assert the other survives and the star stays filled.

### WR-05: fixed (commit `1d9ff773`)

- `ChromeStoreClient.clearHistory` waits `CLEAR_HISTORY_ACK_TIMEOUT_MS` (120 s, as `savePageCopy` does) instead of 8 s.
- The picker ignores Esc, Cancel and blur while `busy`, so a refusal always lands on the failure row. On success, focus is restored to the opener only when focus is still in the panel or on the body.
- **Deferred live check:** Clear Everything on a large profile and confirm no failure row appears while it runs; click elsewhere during a clear and confirm the panel stays until the answer.

### WR-06: fixed (commit `953a7cf4`)

- Chrome's `webTabEditEnabled` races the content-process query against 250 ms (`EDIT_STATE_BUDGET_MS`) and falls back to the cached flag. A hung page no longer holds the hamburger for 5 s. The abandoned query stays pending in chrome until the content process answers or dies; that cannot be cancelled.
- The hamburger's store reads (History, Bookmarks) and the edit-state read each give up after 1 s (`withinBudget`, `MENU_READ_BUDGET_MS`) and draw the existing failure row or disabled Edit rows. `openAppMenu` ignores a click while its reads are pending (`appMenuOpening`).
- The REVIEW suggested a frontend race to 250 ms for the edit rows; the timeout lives in chrome instead because only chrome holds the cached flag to fall back to.
- **Deferred live check:** hang a page with a script loop, open the hamburger, and confirm it opens within about 300 ms with the Quit row usable; double-click the hamburger and confirm one menu.

### WR-07: fixed (commit `c3f5675b`)

- `CHROME_BAR_FULL_SCREEN` has no `isEnabled` predicate, so the row is never dimmed. This is a deviation from 33-UI-SPEC line 212, which lists Full Screen among the rows that need a web tab; the toggle acts on the shell window, and the shell has no other exit (no F11 row, Escape does not leave window full screen). `33-UI-SPEC.md` was not edited. Phase 35 keeps the same command id.
- **Deferred live check:** enter full screen, activate a non-web editor, open the hamburger, and confirm Full Screen is enabled and leaves full screen.

### Catalogue note

The WR-03 and WR-06 insertions shifted catalogue rows. `verify-ng-040 --fix` moved the `## Touchpoints` rows. The five rows under `## Deliberately not touched` (`removeVisitsByFilter`, `IOUtils.remove`, `IOUtils.readJSON`, `IOUtils.writeJSON`, `win.fullScreen`) were moved by hand and each was checked against its target line (now `:7085, :7123, :7152, :7158, :7199`).
