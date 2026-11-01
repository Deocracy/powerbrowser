---
phase: 33-bookmarks-history-and-the-full-menu
plan: "02"
subsystem: chrome-bar
tags: [bookmarks, star, editor-portal, ctrl-d, key-ruling, rule-12, live-harness]
status: complete
requires:
  - phase: 33-01
    provides: bookmarkPage/updateBookmark/removeBookmark kinds and client methods, the bookmarks-changed push (WebTabChannel.onDidChangeBookmarks), the rule-12 two-file privileged fence
  - phase: 27-nav-keys
    provides: PAGE_SHORTCUTS / PAGE_KEYS relay table and the disabled-until-page-focus idiom
  - phase: 30-address-bar-modes-and-command-centre
    provides: the Browser command category the Actions mode lists, the pill composition rules
provides:
  - "Star button .pb-address-star (last in the pill) and the .pb-chrome-bar-dropdown.pb-bookmark-editor portal in address-bar.tsx"
  - "Command powerbrowser.chrome-bar.bookmark-page (CHROME_BAR_BOOKMARK_PAGE_COMMAND_ID, label 'Bookmark This Page', Browser category)"
  - "chrome-bar-commands.ts exports bookmarkablePageUrl(tab?), setOpenBookmarkStar(fn), openBookmarkStar()"
  - "AddressBar.openBookmarkStar() (public), AddressBar.starShortcut (public, set by the relay), BookmarkEditorState type"
  - "Ctrl+D on both focus paths: PAGE_SHORTCUTS/PAGE_KEYS row bookmarkPage (mirrors Firefox addBookmarkAsKb) + Theia ctrlcmd+d keybinding with !editorFocus && !terminalFocus"
  - "BookmarkEntry.folder ('toolbar' | 'menu' | 'unfiled' | '') on readBookmarkByUrl, bookmarkPage and updateBookmark replies"
  - "verify-shortcut-relay rule 12 (both focus paths) with 4 plants"
  - "Live scenarios bookmark-star, bookmark-editor, bookmark-keys with plants star-ignores-push, remove-needs-confirm, ctrl-d-everywhere"
affects:
  - 33-03 (toolbar re-reads on the same onDidChangeBookmarks; the editor's folder radios are how a bookmark reaches the toolbar; the hamburger Bookmarks submenu's Bookmark This Page row runs CHROME_BAR_BOOKMARK_PAGE_COMMAND_ID)
  - 33-04 (Ctrl+Shift+T/B/Del rows follow the rule-12 pattern verify-shortcut-relay now enforces: a page row whose action is a command's bare execute function needs a same-key Theia twin)
  - 33-05 (Actions mode lists Bookmark This Page automatically through the Browser category)
  - 34 (BMK-07 tab-menu bookmarking reuses bookmarkPage from a sanctioned handler)
tech-stack:
  added: []
  patterns:
    - "Module-level opener registration (setOpenBookmarkStar) so the command and the relay reach the pill without importing it, the setAddressFocus precedent"
    - "Store writes only in AddressBar methods; the editor is a callback-only function component (rule 12)"
    - "In-place line edits plus an end-of-file helper in PowerBrowserAPI.sys.mjs so no catalogued line moves"
key-files:
  created: []
  modified:
    - theia/extensions/chrome-bar/src/browser/address-bar/address-bar.tsx
    - theia/extensions/chrome-bar/src/browser/chrome-bar-commands.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar.css
    - theia/extensions/chrome-bar/src/browser/chrome-bar-shortcuts.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar-keybindings.ts
    - theia/extensions/tab-uris/src/browser/chrome-store-client.ts
    - powerbrowser/shell/PowerBrowserAPI.sys.mjs
    - powerbrowser/shell/powerbrowser.js
    - scripts/verify-chrome-bar-commands.mjs
    - scripts/verify-shell-error-copy.mjs
    - scripts/verify-shortcut-relay.mjs
    - scripts/verify-address-bar-live.mjs
key-decisions:
  - "Bookmark replies carry a folder root name so the editor's radios show where the bookmark is; done by in-place line edits plus an end-of-file bookmarkFolderName that reuses BOOKMARK_FOLDER_ROOTS/resolveBookmarkFolder (no new Firefox touchpoint, no catalogue row, ng-040 green)."
  - "The star's tooltip key comes from the PAGE_SHORTCUTS bookmarkPage row, pushed into AddressBar.starShortcut by ChromeBarShortcutRelay.onStart, because address-bar.tsx must not import chrome-bar-shortcuts.ts at runtime (that module imports AddressBar). With no row bound the tooltip falls back to the bare heading copy, so it names only a bound key. No BUTTON_SHORTCUTS entry: the star's tooltip is state-dependent copy, not a verb."
  - "Ctrl+D from any path runs openBookmarkStar(): an unbookmarked page is bookmarked in Firefox's default folder (bookmarkPage without folderGuid) and the editor opens; a bookmarked page opens the editor. A failed one-click bookmark opens the editor in its new state with the failure row; Enter/Done retries bookmarkPage with the chosen name and folder."
  - "Done sends updateBookmark with only the changed fields; nothing changed means no write. Remove calls removeBookmark(url), removing every bookmark of the page as Firefox's star does, so the star always unfills."
  - "The pill's right padding went from 12px to 4px so the 24px star sits 4px from the pill edge, mirroring the mode button (33-UI-SPEC)."
  - "The editor closes on a tab change, on Esc, on Cancel and on focus leaving the panel (the site-panel pattern); a store write in flight keeps focus inside, so the panel does not close under it."
patterns-established:
  - "verify-shortcut-relay rule 12: a PAGE_SHORTCUTS row whose relay action calls the bare function of a chrome-bar command's `execute: () => fn()` must have a Theia keybinding on that command with the same key and a when-clause excluding editorFocus and terminalFocus; every literal chrome-bar Theia keybinding must have a page row on the same key. Derived from the tree, no hand-kept pair list."
requirements-completed: [BMK-01, BMK-02]
duration: "approx. 70 min"
completed: "2026-10-31"
commits: 3
plan_head_before: 93315523f49b5a13cc392a1b7453d59b2c6b9535
plan_head_after: 3e07677fa44f7843948fb2eb1a9607d837a90a86
actuals:
  tokens: 20600
  tasks: 3
  commits: 3
---

# Phase 33 Plan 02: Bookmark star, editor popover and Ctrl+D Summary

**The pill ends in a 24px star (outline muted, or filled in text ink when bookmarked). It follows the `readBookmarkByUrl` point-read and the `bookmarks-changed` push. A click, or Ctrl+D on either focus path, bookmarks the page through `bookmarkPage` and opens a 320px `.pb-chrome-bar-dropdown` editor with Name, three root-folder radios, Remove (runs at once), Cancel and Done. All writes run from `address-bar.tsx` handlers. The new `bookmark-page` command only opens the star path.**

## Status

Complete for the static scope. The Theia app was rebuilt and `tsc --noEmit` on chrome-bar is clean. The three live scenarios exist with their plants. Running them needs `objdir/dist/bin/powerbrowser`, which this worktree does not have; the attempt stopped at `harness: ... objdir/dist/bin/powerbrowser does not exist`. That run is listed under "Deferred to end-of-milestone live pass".

## Performance

- Tasks: 3/3
- Commits: 3 (measured from the plan ledger)
- Files: 13 modified, 0 created

## Accomplishments

- **Star** (`renderStar`): it is the last child of `.pb-chrome-bar-pill` in every mode. It is `disabled`, with "You can't bookmark this page", whenever `bookmarkablePageUrl()` is empty (no web tab, no page, or a non-http(s) scheme), so the button is never removed. The tooltip and `aria-label` read "Bookmark this page (Ctrl+D)" or "Edit this bookmark (Ctrl+D)" depending on state. The hover uses `top` and works on the disabled button.
- **Bookmarkedness**: `refreshStar(force)` re-reads only when the page URL changes (it is hooked into `syncAddressFromWidget` and `onCurrentWidgetChanged`) or when forced by `onDidChangeBookmarks`. A sequence guard drops stale replies. The pill never touches Places directly.
- **Editor** (`BookmarkEditor` function component plus `AddressBar` handlers):
  - Layout: a fixed portal 4px under the pill, with its right edge on the star's. Contents are the heading (Bookmark this page / Edit bookmark), the failure row, the Name input (focused and selected on mount, maxLength 512), the Toolbar/Menu/Other radios, and the footer: Remove (danger token), then Cancel and Done (Done is disabled while Name is empty).
  - Keys: Enter is Done, or retries the failed action. Esc and blur close without saving, and focus returns to the star.
- **Command**: `CHROME_BAR_BOOKMARK_PAGE` runs `openBookmarkStar()` and is enabled when `bookmarkablePageUrl() !== ''`.
- **Keys**: one `PAGE_SHORTCUTS` row and its `PAGE_KEYS` twin (`firefox: "addBookmarkAsKb"`, `landsInTheia: true`). The relay action is `() => openBookmarkStar()`. The Theia twin is `ctrlcmd+d` with `!editorFocus && !terminalFocus`.
- **Gates**:
  - commands: id and label pinned, plus a re-spelled bookmark-page id plant (7 plants).
  - copy: 14 new strings plus "Ctrl+D" pinned, plus a star-tooltip-in-pill plant (14 plants).
  - relay: rule 12 with 4 plants (23 plants).
  - rule 12 of verify-web-tab-bridge stays green: no command or keybinding file names a privileged kind.
- **Live**: three scenarios, three live plants, a `CONTROL_OF` entry (bookmark-keys is scored only after bookmark-star passes), and three served pages. The star, editor and key labels are derived from the source, and Places is read back chrome-side as the independent observer.

## Names later plans must know

- `CHROME_BAR_BOOKMARK_PAGE_COMMAND_ID` = `powerbrowser.chrome-bar.bookmark-page`. The hamburger Bookmarks submenu row (33-03/05) and the Actions row run this id. Do not re-spell it.
- `bookmarkablePageUrl(tab?)`, `openBookmarkStar()` and `setOpenBookmarkStar()` live in `chrome-bar-commands.ts`.
- `AddressBar.openBookmarkStar()`, `AddressBar.closeBookmarkEditor(restoreFocus = true)` and `AddressBar.starShortcut`.
- `BookmarkEntry.folder` is an optional root name. `listBookmarkFolder` rows do not carry it.
- Copy keys: `bookmarkStarTip`, `editBookmarkTip`, `cantBookmark`, `editBookmarkHeading`, `bookmarkPageHeading`, `bookmarkName`, `bookmarkFolder`, `bookmarkFolderToolbar`, `bookmarkFolderMenu`, `bookmarkFolderOther`, `removeBookmark`, `bookmarkCancel`, `bookmarkDone`, `bookmarkSaveFailed`, `bookmarkRemoveFailed`.
- CSS: `.pb-address-star` (`.is-bookmarked`) and `.pb-bookmark-editor-*`. The clear-history picker (33-04) can reuse `.pb-bookmark-editor-button`, or copy the `.pb-bookmark-editor-remove` danger rule for its Clear button. The danger token is scoped to those two buttons.
- 33-04's Ctrl+Shift+T/B/Del rows: verify-shortcut-relay rule 12 requires a same-key Theia twin, with the editor/terminal exclusion, for any page row whose action is a command's bare `execute: () => fn()` function. Every literal chrome-bar Theia keybinding also needs a page row on the same key. A Theia binding with no page twin goes red.

## Task Commits

1. Task 1: `56d0ad75` feat(33-02): bookmark star, editor portal and bookmark-page command
2. Task 2: `2a525b9b` feat(33-02): Ctrl+D on both focus paths
3. Task 3: `3e07677f` test(33-02): live bookmark-star, bookmark-editor and bookmark-keys scenarios

## Decisions Made

See the `key-decisions` frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] Bookmark replies carry their folder**
- Found during: Task 1
- Issue: `BookmarkEntry` was `{guid, title, url}`, so the editor could not show which folder radio is current. Without it, Done would either move the bookmark by accident or show a wrong selection.
- Fix: three in-place line edits in `PowerBrowserAPI.sys.mjs` (the `readBookmarkByUrl` return, its arm, `bookmarkReply`) and an end-of-file `bookmarkFolderName(parentGuid)`. Also `folder?: string` on `BookmarkEntry`. No catalogued line moved. `verify-ng-040` and `check-internals-boundary` PASS.
- Files: `powerbrowser/shell/PowerBrowserAPI.sys.mjs`, `theia/extensions/tab-uris/src/browser/chrome-store-client.ts` (both outside the plan's file list)
- Commit: 56d0ad75

**2. [Rule 3 - Blocking] The star's key label is pushed in by the relay**
- Found during: Task 1
- Issue: `address-bar.tsx` documents that it must not import `chrome-bar-shortcuts.ts` at runtime, because that module imports `AddressBar`.
- Fix: a public `AddressBar.starShortcut`, set in `ChromeBarShortcutRelay.onStart` from the `bookmarkPage` row. With no row, the tooltip falls back to the bare heading.
- Commits: 56d0ad75, 2a525b9b

**3. [Rule 3 - Blocking] The "Ctrl+D" shortcut label was pinned in `verify-shell-error-copy.mjs` in Task 2**
- Issue: a new `PAGE_SHORTCUTS` label is shortcut copy and must be pinned in the same commit. The plan listed the copy gate only under Task 1.
- Commit: 2a525b9b

**4. Live plant choice**
- The plan's example plant "star reads Places directly" cannot be observed from outside: a direct read and the point-read give the same answer. It was replaced by `star-ignores-push`, which drops forced re-reads. It goes red when a chrome-side remove does not unfill the star. That proves bookmarkedness follows the push and the point-read. Shift+Delete on a bookmark row stays covered by the existing `shift-del` scenario and its `shift-del-bookmark` plant (D-03), which this plan did not change.

## Known Stubs

None.

## Threat Flags

None beyond the register.
- T-33-01 (privileged calls only from pill/widget handlers): mitigated. `bookmarkPage`, `updateBookmark` and `removeBookmark` are called only in `address-bar.tsx`. The command and the relay call `openBookmarkStar()`. Rule 12 of `verify-web-tab-bridge` stays green.
- T-33-01b (Name field): mitigated. The name is an input value, never markup. It is capped at 512 characters in the frontend and chrome-side. A failure shows fixed copy, never an exception message.

## Deferred to end-of-milestone live pass

- `node scripts/verify-address-bar-live.mjs --scenario bookmark-star,bookmark-editor,bookmark-keys` and `node scripts/verify-address-bar-live.mjs --self-test`, against a rebuilt binary with `-purgecaches` (the harness sets `MOZ_PURGE_CACHES=1`). In particular:
  - Organising mode: the scenario makes the session tab current after switching. If Organising keeps its mode surface current, `bookmarkablePageUrl()` is empty and the star is dimmed there. The live run decides whether that matches "filled in all three modes".
  - `ctrl-d-everywhere` plant: confirm that an unconditioned Theia `ctrlcmd+d` binding outranks Monaco's in the README.md editor, so the plant goes red.
  - The page-focused Ctrl+D path: `relayShortcut` with `landsInTheia: true` focuses the Theia frame before the editor mounts. Confirm that the Name field takes focus.
- Visual check against 33-UI-SPEC: the star's 3px vertical inset, the editor's anchor under the star, and the danger ink only on Remove.

## Issues Encountered

None beyond the deviations.

## Next Phase Readiness

33-03 can subscribe the toolbar to `onDidChangeBookmarks` and reach the star path through `CHROME_BAR_BOOKMARK_PAGE_COMMAND_ID`. 33-04 must add its three key rows to both sides. The relay gate now enforces both focus paths.

Final `nix develop .#theia --command scripts/verify-platform.sh --quick`: exit 0, "verify-platform: PASS -- all checks passed".

## Self-Check: PASSED

- FOUND: 56d0ad75, 2a525b9b, 3e07677f (ancestors of HEAD)
- `node scripts/verify-chrome-bar-commands.mjs --self-test`: PASS (7 plants)
- `node scripts/verify-shell-error-copy.mjs --self-test`: PASS (14 modes-copy plants)
- `node scripts/verify-shortcut-relay.mjs --self-test`: PASS (23 plants)
- `theia/node_modules/.bin/tsc --noEmit -p theia/extensions/chrome-bar`: clean
