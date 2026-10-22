---
phase: 29-address-bar-search-and-fixup
plan: 09
subsystem: chrome-bar address bar / Places and clipboard boundary / live address-bar check
status: complete
tags: [BAR-09, BAR-10, privileged-store-kind, places-write, clipboard, context-menu, live-check]
requires: [29-08]
provides:
  - "removeHistoryEntry privileged store kind (PlacesUtils.history.remove, http(s) only); ChromeStoreClient.removeHistoryEntry(url)"
  - "readClipboardText privileged store kind (global clipboard text/plain, at most 8192 characters, never logged); ChromeStoreClient.readClipboardText()"
  - "Rule 12: the first two privileged store-kind classes; INTERNAL-APIS PlacesUtils row re-ruled read-write, three clipboard Touchpoints rows"
  - "Widget: removableRow (instance method), the Shift+Delete branch and failure notice; PILL_MENU_PATH, onPillContextMenu, openPillMenu (prototype method), cutSelection, pasteClipboard, pasteAndGo, focusPageWhenLoaded; textEdited (the shared edit path onInputChange now calls)"
  - "Copy: removeFailed, cut, copy, paste, pasteAndGo, selectAll, pasteFailed, all pinned"
  - "Live scenarios shift-del and context-menu; plants shift-del-bookmark and paste-reads-on-open"
affects: [29-10]
tech-stack:
  added: []
  patterns:
    - "A live ArrowDown loop waits for the highlight to move after each press before it reads, so a read taken before the re-render cannot cause an extra press"
    - "A clipboard read only inside a menu item's run handler; a counter on the client method is the observer, and the Paste & Go read is its positive control"
    - "Page focus after a pill-menu commit is sent once the load has finished, not straight after the navigation is acknowledged"
key-files:
  created: []
  modified:
    - powerbrowser/shell/PowerBrowserAPI.sys.mjs
    - powerbrowser/INTERNAL-APIS.md
    - theia/extensions/tab-uris/src/browser/chrome-store-client.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx
    - theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts
    - scripts/verify-shell-error-copy.mjs
    - scripts/verify-web-tab-bridge.mjs
    - scripts/verify-address-bar-live.mjs
    - .planning/phases/29-address-bar-search-and-fixup/deferred-items.md
decisions:
  - "Chrome does not re-check whether a url passed to removeHistoryEntry is bookmarked. The plan makes the frontend source gate plus the live check the protection (29-RESEARCH Pitfall 10), and a chrome refusal would keep the shift-del-bookmark plant from going red."
  - "Cut removes the selected text only after Theia's ClipboardService reports the write (onDidWriteText), so a failed clipboard write loses no text."
  - "Paste & Go moves focus to the page when the tab's state push reports the load finished, and only if the pill still has focus and no new edit. Focus sent straight after the navigation ack was lost twice: once to the overlay still being hidden behind the closing menu, and once to a content-process switch at commit."
  - "Paste & Go in the live check uses 127.0.0.1:<port>/pasted in the session tab instead of the plan's localhost:<port>/pasted. A 127.0.0.1 tab navigating to localhost changes site, which is the process switch the 29-07 and 29-08 carry-overs warn about."
  - "A keyboard-originated contextmenu (button not 2, or zero coordinates) anchors the menu at the input's bottom-left; a pointer one anchors at the pointer."
metrics:
  duration: 85m
  completed: 2026-10-21
  tasks: 2
  files: 8
commits: 2
plan_head_before: ee6264c143343f1635d2ded8679c8e3825dbbfe8
plan_head_after: e34934a8f1b0b93b12c275fcf9bd829bd97da7bf
actuals:
  tokens: 21000
  tasks: 2
  commits: 2
---

# Phase 29 Plan 09: Shift+Delete history removal and the pill context menu Summary

Shift+Delete on a highlighted history row now removes that page from history through `PlacesUtils.history.remove`. This is the chrome bar's first Places write. A bookmark, open-tab, engine or heuristic row is never removed. Right-click, the context-menu key or Shift+F10 on the pill opens a stock `.lm-Menu` with Cut, Copy, Paste, Paste & Go, a separator and Select All. The clipboard is read chrome-side, so Firefox's native paste popup never opens. The read happens only when Paste or Paste & Go is chosen.

## What was built

- **Boundary (`PowerBrowserAPI.sys.mjs`, end of file)**
  - `removeHistoryEntry(url)`:
    - checks the url with `storeUrlArg`, refuses anything that is not http(s) (`removeHistoryEntry: refusing a non-http(s) url`), and returns `Boolean(await lazy.PlacesUtils.history.remove(url))`;
    - replies `{ removed }`;
    - Places errors are withheld by `handleStoreRequest`'s existing catch.
  - `readClipboardText()`:
    - reads `text/plain` from `kGlobalClipboard` only, through an `nsITransferable` with no window context;
    - cuts the text to 8192 characters and returns `""` when the clipboard holds no text;
    - replies `{ text }`. No log line carries the text.
  - Both kinds have a `STORE_REQUEST_KINDS` member and a case arm.
- **INTERNAL-APIS.md**
  - The PlacesUtils row (line 57) is re-ruled in place to read-write. It names `History.remove` for BAR-09 under the 2026-10-20 ruling and the privileged-kind rule.
  - Three Touchpoints rows are appended for the clipboard lines: `Cc[...transferable]`/`Ci.nsITransferable`, `Services.clipboard.getData`, and `Ci.nsISupportsString`.
- **Rule 12 (`verify-web-tab-bridge.mjs`):** `['removeHistoryEntry', 'privileged']` and `['readClipboardText', 'privileged']`. These are the first privileged store kinds.
- **Client:** `removeHistoryEntry(url): Promise<boolean>` and `readClipboardText(): Promise<string>`. A reply that is not ok throws.
- **Widget**
  - Shift+Delete:
    - `removableRow(row)` returns true only for `source === 'history'`. It is an instance method, so the live plant can replace it.
    - Shift+Delete with no Ctrl, Alt or Meta, on a removable highlighted row, calls `preventDefault` and then `removeHighlightedRow()`, the only caller of `removeHistoryEntry`.
    - On success, the row is dropped from `placeRows`, the rows are rebuilt, and the highlight moves to the row that followed it, else the one before.
    - On failure, a `removeFailed` notice shows directly under the row until the next query or close.
    - Every other case falls through without consuming the key.
  - Context menu:
    - `onPillContextMenu` on the input calls `preventDefault`, then `openPillMenu(anchor)`.
    - `openPillMenu` builds a `CompoundMenuNode` per request with two child groups, so Theia draws the separator. Cut and Copy are enabled only with a selection, Select All only when the input is not empty, and Paste and Paste & Go always.
    - Cut and Copy write through Theia's `ClipboardService`. Paste and Paste & Go read through `readClipboardText`; those two run handlers are its only callers.
    - Paste inserts with `setRangeText(text, start, end, 'end')` and goes through `textEdited(value, false)`, so it never autofills.
    - Paste & Go ignores blank text. Otherwise it calls `commitText(text)`, then `focusPageWhenLoaded(tab)`.
    - A read error opens the dropdown with one `pasteFailed` row.
    - `onHide` puts focus back on the input unless Paste & Go ran.
    - `onInputChange` now delegates to `textEdited(value, autofillWanted, composing)`, the one edit path for keystrokes, Cut and Paste.
- **Copy:** seven entries, all pinned in `EXPECTED_NAV_COPY`.
- **Live harness (`verify-address-bar-live.mjs`)**
  - `shift-del`:
    - Visits to `/del-me`, `/keep-me` (also bookmarked) and `/del-fail` are seeded and read back first, as the positive control.
    - Shift+Delete on the history row removes the row, moves the highlight to the next row, and `history.fetch` for the page returns null. Re-typing shows no row for it.
    - Shift+Delete on the bookmark row keeps the row and the page's visits.
    - With `removeHistoryEntry` stubbed to reject, the failure notice appears under the row and starts with the configured application name.
  - `context-menu`:
    - It counts `readClipboardText` calls and checks the menu's labels, the separator and each item's enablement, with 0 reads on open. Esc closes the menu and focus returns to the pill.
    - Paste & Go reads once (the positive control), loads `/pasted` and puts chrome's focus in the page.
    - Paste gives `abxyz`. Copy and Cut put `cd` on the global clipboard, read chrome-side.
    - An empty clipboard loads nothing. A rejected read shows the failure row.
    - The user's clipboard text is saved first and put back afterwards.
  - Plants: `shift-del-bookmark` widens `removableRow` to bookmark rows, and `paste-reads-on-open` reads the clipboard before the menu opens.

## Verification (all run this session)

- **Static checks, all PASS:**
  - `verify-ng-040-internals-catalogue-lines` and `check-internals-boundary.sh --catalogue`, after each boundary edit.
  - `verify-web-tab-bridge`, and its `--self-test` (20 plants red).
  - `verify-ng-027-reader-callers` (28 readers).
  - `verify-shell-error-copy` and its `--self-test`.
  - `verify-chrome-bar-suggestions` and `scan-brand-residue` (380 files, new work staged first).
  - `tsc -b extensions/tab-uris` and `tsc --noEmit -p extensions/chrome-bar`.
- **Acceptance greps:**
  - One `['removeHistoryEntry', 'privileged']` line and one `['readClipboardText', 'privileged']` line.
  - `removeHistoryEntry(` and `readClipboardText(` appear only in `chrome-bar-widget.tsx` and `chrome-store-client.ts`.
  - `PILL_MENU_PATH` appears twice in the widget.
- **Theia build:** `yarn build` exited 0 after each widget change, and the bundle contains `removeHighlightedRow`, `openPillMenu` and `focusPageWhenLoaded`.
- **Live runs:**
  - `--scenario search,shift-del` and `--scenario search,context-menu`: PASS.
  - The final two full runs on the committed tree: 16 of 16 scenarios PASS each time.
  - `--self-test`: PASS. The clean control was green and all 10 plants went red as named, including `shift-del-bookmark` ("removed the visits of a bookmarked page") and `paste-reads-on-open` ("clipboard read before a click").
  - `verify-nav-keys-live.mjs --scenario history,history-error`: both PASS.
- **Quick gate:** `scripts/verify-platform.sh --quick` PASS after Task 1, during Task 2 and before the Task 2 commit.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The live ArrowDown loops could press one key too many**
- **Found during:** Task 2, the first runs of `search,canonize-drop,shift-del`.
- **Issue:** the loop read the dropdown straight after each ArrowDown, before the re-render. A stale read caused an extra press. In one run, Shift+Delete then removed `/del-fail` instead of `/del-me`; the instrumented keydown recorded `highlightKey` on `/del-fail` while the DOM read showed `/del-me`. The pre-existing one-off loop has the same race. It explains 29-08's intermittent "no GET on /two/search ... after Enter on the highlighted one-off" and showed up in this plan's first full run as "never highlighted the Probe Engine Two one-off".
- **Fix:** `highlightRow`, `chooseMenuItem` and the one-off loop now wait, after each press, for the highlight to change. After the fix, `search,one-off` passed 3 of 3 runs.
- **Files modified:** scripts/verify-address-bar-live.mjs
- **Commit:** e34934a

**2. [Rule 1 - Bug] Paste & Go's page focus was lost when sent right after the navigation ack**
- **Found during:** Task 2, live.
- **Issue:** the plan's order (commit, then focus) sends `webTabFocus` within a few milliseconds of the menu closing. At that point the overlay is still hidden: its re-show is published on the next animation frame. A second cause was a content-process switch at commit, which dropped a focus already given (instrumented: focus in, then out with no related target 32 ms later).
- **Fix:** `focusPageWhenLoaded(tab)` focuses the page when the tab's state push reports that the load has finished, and only while the pill still has focus and no new edit. A 30 s cap keeps it from waiting forever.
- **Files modified:** theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx
- **Commit:** e34934a

**3. [Rule 2 - Data loss] Cut keeps the text when the clipboard write fails**
- **Issue:** `BrowserClipboardService.writeText` swallows its errors. Removing the selection unconditionally would delete text that never reached the clipboard.
- **Fix:** Cut removes the selection only after `onDidWriteText` fires.
- **Commit:** e34934a

**4. [Rule 3 - Blocking] Paste & Go live target stays on 127.0.0.1**
- **Issue:** the plan's `localhost:<port>/pasted` would navigate the 127.0.0.1 session tab to another site, which is the process switch the carry-over warns about.
- **Fix:** the clipboard holds `127.0.0.1:<port>/pasted`.
- **Commit:** e34934a

**5. [Rule 1 - Bug] ng-040 `--fix` mis-assigned rows again**
- **Issue:** after each boundary edit, `--fix` swapped the two `savePageCopy` `IOUtils.remove` rows. It also pointed the `searchLazy` getter row at `const searchLazy = {};` and the `controller.fetch` row at a neighbouring line.
- **Fix:** each row was set back by hand. ng-040 and the catalogue PASS in both directions.
- **Commits:** 8843936, e34934a

## Deferred Issues

- **context-menu: focus after Paste & Go is intermittent in sessions that ran `token-cookie` first.** The `/pasted` load always happened, but chrome's focus sometimes did not end in the page.
  - Rates: about 2 of 5 full runs while the fix was in progress, and 2 of 4 runs of `token-cookie,search,context-menu`. It never failed in 8 runs without `token-cookie`. The final two full runs and the self-test clean control were green.
  - Instrumented evidence with the final widget: the pushes were `about:blank` loading, then `/pasted` loaded, then `webTabFocus` was sent, and chrome logged no focus event.
  - The `about:blank` push points to a content-process switch. That matches the Phase 27 deferred GUI-02 remoteness defect, which is outside this plan's files.
  - The check was not weakened. Details are in `deferred-items.md`.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register.
- T-29-32: both kinds are classed privileged, never relayed from the backend, and called only from widget handlers. Rule 12 enforces this, with plants.
- T-29-33: the text is never logged, pushed or stored.
- T-29-34: no probe enables a menu item; the read counter and the `paste-reads-on-open` plant check this.
- T-29-35: `storeUrlArg` plus the http(s) check, the history-only gate in the frontend, and the live bookmark check.
- T-29-36: Paste & Go goes through `commitText`, the resolve wall.

## Risks for later plans

- **IME (29-10):** `onInputKeyDown` now has a Shift+Delete branch, which UI-SPEC's IME guard must cover. `onInputChange` delegates to `textEdited(value, autofillWanted, composing)`, and the composition flag arrives as its third argument. Cut and Paste call `textEdited(value, false)`.
- **Tab count:** a full run is unchanged in tabs. `shift-del` and `context-menu` use the session tab, and `context-menu` navigates it to `/pasted`.
- **Clipboard:** `context-menu` writes the global clipboard and restores only its text. Non-text clipboard content (an image) is lost during a run.
- **Focus flake:** see Deferred Issues. A red `context-menu` focus step in a full run or self-test may need a rerun until the Phase 27 remoteness defect is fixed.
- **ng-040 `--fix`:** it still mis-assigns the `IOUtils.remove` pair and rows whose tokens appear on nearby lines. Check those rows after every boundary edit.
- **Unstaged:** `.planning/state.json` was left unstaged.

## Self-Check: PASSED

- FOUND: 8843936 (task 1), e34934a (task 2), both ancestors of HEAD
- FOUND: every modified file listed in key-files
