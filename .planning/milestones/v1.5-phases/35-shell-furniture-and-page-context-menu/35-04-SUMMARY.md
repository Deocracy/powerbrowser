---
phase: 35-shell-furniture-and-page-context-menu
plan: "04"
subsystem: shell-furniture
tags: [PROMPT-04, D-12, D-13, page-context-menu, inspect, edit, spelling, downloads, save-dialog, furniture-gate, live-harness]
status: complete
requires:
  - phase: 35-shell-furniture-and-page-context-menu
    provides: 35-03's PAGE_MENU_ROWS, handlePageMenuAction, runPageMenuRow, page-context-menu.ts FRONTEND_ROWS, furniture rules 5-7 and the live harness
  - phase: 32-page-tools
    provides: webTabDevtoolsReply (32-07), WebTabWidget.edit and WEB_TAB_EDIT_CMDS (32-06), savePage and chooseSaveDestination (32-05), webTabViewSourceReply and viewSource (32-07/32-08), downloadsLazy and the downloads panel (32-04)
provides:
  - Inspect and Inspect Accessibility Properties rows (D-13) through webTabDevtoolsReply, awaiting entry.toolboxOpening, then DevToolsShim.inspectNode / inspectA11Y
  - Bookmark Page (Phase 33's command by id), Save Page As, View Page Source, View Frame Source rows
  - edit rows (Undo, Redo, Cut, Copy, Paste, Delete, Select All) and Copy Image through widget.edit(cmd); cmd_copyImage in the frozen edit set
  - Save Link/Image/Video/Audio As as a two-step pick (save-pick, Theia's save dialog, path reply) into Downloads.PUBLIC
  - spelling rows: one dynamic spell-suggestion row per dictionary word, No Spelling Suggestions, Add to Dictionary, Undo Add, Check Spelling
  - furniture gate: textActions.ftl strings, DYNAMIC_KINDS with reasons, spell-* dispatcher arms, plant (n)
  - live scenarios menu-page-tools, menu-edit, menu-spelling, menu-save and four plants
affects:
  - 35-05 (extension entries join the same table; the timing budget still has no measured line)
  - 35-07 (context-video-fullscreen joins the media group)
  - Phase 33 merge (powerbrowser.chrome-bar.bookmark-page must be registered for Bookmark Page to act)
tech-stack:
  added: []
  patterns:
    - a dynamic page menu row (no upstream id) expanded per label, ids <kind>-<index>, accepted by the gate only for a recorded kind
    - a two-step privileged pick whose second message carries the one frontend value (a path) for the pending row only
    - an in-place promise kept on the web-tab entry (toolboxOpening) so a second caller awaits the one devtools route
key-files:
  created: []
  modified:
    - powerbrowser/shell/PowerBrowserAPI.sys.mjs
    - powerbrowser/INTERNAL-APIS.md
    - theia/extensions/tab-uris/src/browser/web-tab.ts
    - theia/extensions/chrome-bar/src/browser/page-context-menu.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts
    - scripts/verify-shell-error-copy.mjs
    - scripts/verify-shell-furniture.mjs
    - scripts/verify-page-tools-edit.mjs
    - scripts/verify-page-furniture-live.mjs
key-decisions:
  - "Inspect reuses webTabDevtoolsReply and the one DevToolsShim import (webTabDevToolsShim). The 32-07 open line now stores its promise as entry.toolboxOpening (same line, no shift), so the arm awaits the window-hosted toolbox before inspectNode selects in it. No second DevToolsShim import was added."
  - "View Page Source and View Frame Source load in the same tab: Phase 32's view-source function refuses inNewTab (32-08: no view-source overlay is built). View Frame Source passes the captured frame document URL as a new optional fourth parameter of webTabViewSourceReply."
  - "Paste Without Formatting is omitted, and cmd_pasteNoFormatting stays out of the frozen set: the 32-06 edit-today probe recorded chrome-no-effect for it (scripts/lib/pb-probe-verdicts.json). Under D-12 a dead row is worse than an absent one."
  - "Save rows omit non-http(s) targets (a canvas image, a captureStream video) instead of upstream's disabled row, following 35-03's rule that a row which cannot run is omitted. Save Link As shows for onSaveableLink only; the plain-text-link case (onPlainTextLink) is not derived."
  - "The two-step save keeps the pending record after save-pick with pending.savePick; a path is accepted only when itemId equals it and PathUtils.isAbsolute holds (at most 4096 characters). The TTL stays the menu's 60 s."
  - "The spell checker is one InlineSpellChecker per shell window (state.spell), bound with initFromRemote for one action and released with uninit, so Undo Add's stack lasts across menus as InlineSpellCheckerUI's does."
  - "The save failure line is shown with Theia's MessageService.error; a cancelled dialog sends the dismiss and shows nothing."
patterns-established:
  - "A dynamic row is one line { dynamic: \"<kind>\", when, runs, group } in PAGE_MENU_ROWS, a PAGE_MENU_DYNAMIC entry returning the labels, a case \"<kind>\" arm, and a DYNAMIC_KINDS entry with its reason in verify-shell-furniture.mjs."
requirements-completed: []
duration: "approx. 70 min"
completed: "2026-10-31"
commits: 3
plan_head_before: 547d2954813b3a19cd3080768d0d87b8b35d20fd
plan_head_after: a281b754e9db3db38aea6eff95594bb58621d72d
actuals:
  tokens: 27600
  tasks: 3
  commits: 3
---

# Phase 35 Plan 04: Page-tool, edit, save and spelling page menu rows Summary

**The page menu's remaining PROMPT-04 rows now call mechanisms that already exist.**

- **Inspect** opens the tab's window-hosted toolbox through Phase 32's devtools function and selects the right-clicked node.
- **Edit rows and Copy Image** run Phase 32's `edit(cmd)`. Each row's enabled state comes from the page's own command state.
- **Save Page As and View Page/Frame Source** use Phase 32's routes.
- **The save rows** download the captured target with the page's referrer to a path chosen in Theia's save dialog. The download appears in the downloads panel.
- **Spelling rows** act through `InlineSpellChecker`.
- **Bookmark Page** executes Phase 33's command by id.

## Status

The static scope is complete and all three tasks are committed. `scripts/verify-platform.sh --quick` exited 0 after each task, the Theia typecheck reports no errors, and `yarn build` exits 0 with the page menu change in `bundle.js`.

None of the live checks has run: this lane has no objdir. The run printed `purgecaches: MOZ_PURGE_CACHES=1` and then `harness: ... objdir/dist/bin/powerbrowser does not exist`. Bookmark Page cannot act until Phase 33 is merged.

## Performance

- Tasks: 3/3
- Commits: 3 task commits plus this docs commit
- `--quick`: exit 0 after each task (about 4 minutes each)
- `yarn build`: exit 0

## Accomplishments

- **Inspect (Task 1, D-13).**
  - `context-inspect-a11y` and `context-inspect` are the last rows, in upstream order.
  - `pageToolFacts` reads upstream's prefs. An overlay tab-host node stands for `inTabBrowser`. The accessibility row also checks `devtools.everOpened` or `isDevToolsUser()`.
  - `pageMenuInspect` calls `webTabDevtoolsReply("webTabDevtools", tabId)` and awaits `entry.toolboxOpening`. A missing toolbox gives `where: "refused"`. It then calls `DevToolsShim.inspectNode` or `inspectA11Y` with the tab-host node and the actor's `targetIdentifier`.
- **Rows (Task 2, D-12).** 21 new table lines (20 id rows and one dynamic row), giving 55 id rows in all:
  - Navigation: Bookmark Page.
  - Spelling: No Spelling Suggestions, the suggestion rows, Add to Dictionary, Undo Add.
  - Link: Save Link As.
  - Image: Save Image/Video/Audio As, Copy Image.
  - Page: Save Page As.
  - Edit: Undo, Redo, Cut, Copy, Paste, Delete, Select All, with `textActions.ftl` labels.
  - Frame submenu: View Frame Source.
  - Check Spelling (checked from `enableRealTimeSpell`), then View Page Source.

  Every condition cites its `nsContextMenu.sys.mjs` lines. `pageMenuFormatLabels` adds `toolkit/global/textActions.ftl`.
- **Edit state.** `pageEditFacts` reads `isCommandEnabled` from the overlay's top window global for every frozen command. Each edit row's `off` predicate is `pageMenuCommandOff(cmd)`.
- **Save (T-35-14, T-35-15).**
  - Step one, `pageMenuSavePick`: applies the http(s) wall and `checkLoadURIStrWithPrincipal`, stores the URL and the upstream referrer choice, and replies `{ where: "save-pick", suggestedName }`. The name is `DownloadPaths.sanitize` of the last path segment, or "download".
  - The frontend shows `FileDialogService.showSaveDialog`, titled from `CHROME_BAR_COPY`. It then sends the same menu and row with `path`, or the dismiss.
  - Step two, `pageMenuSave`: `Downloads.createDownload` with the referrer, page principal and cookie jar, `isPrivate: false`. It adds the download to `Downloads.getList(Downloads.PUBLIC)` and starts it.
- **Frontend.**
  - `FRONTEND_ROWS` gains 11 rows. `run` now receives the contribution, and `keepsFocus` keeps the bookmark editor's focus.
  - `settle` awaits frontend rows and handles `save-pick`.
  - `send` carries an optional `path`.
  - `web-tab.ts` gains the union `path?` and `cmd_copyImage`.
- **Gates.**
  - Furniture rule 5 accepts `textActions.ftl` messages and `dynamic` rows of a `DYNAMIC_KINDS` kind (`spell-suggestion`, with its reason).
  - Rule 6 matches `case "context-..."` and `case "spell-..."` arms and keys dynamic rows by kind. Plant (n), an unknown dynamic kind, goes red.
  - The edit gate's self-test gains plant 5: a page menu row that names an unfrozen command. The surplus-literal plant now prepends at the declaration, so it does not depend on the set's tail.
  - The copy gate pins four save titles and the failure line.
- **Catalogue.** Nine new Touchpoints rows: three Inspect pref lines, `DevToolsShim.inspectNode`, the `pageToolsLazy` import, the Controllers read, `initFromRemote`, `PathUtils.isAbsolute` and `Downloads.createDownload`/`PUBLIC`. The `showToolboxForTab` row records the kept promise. References below each edit were remapped from `git diff -U0` hunks; `--fix` then made no change.
- **Live harness (Task 3).**
  - A `/tools` page. The asset server serves `/file.bin` and records Referer.
  - Four scenarios: `menu-page-tools`, `menu-edit`, `menu-spelling` and `menu-save`.
  - Four plants, each proven applied by reading the mutation back: `inspect-no-select`, `copy-row-unwired` (the contribution's `settle` swallows `context-copy`), `spellcheck-off` and `save-dialog-cancelled`.
  - The `context-menu` targets expect the new rows for each target.
  - The clipboard checks write a sentinel first, because the system clipboard outlives the session.

## Task Commits

| Task | Commit | Subject |
|------|--------|---------|
| 1 | 38d48b13 | feat(35-04): Inspect and Inspect Accessibility Properties through the devtools route (D-13) |
| 2 | fce2076d | feat(35-04): edit, bookmark, save-page, view-source, save-target and spelling page menu rows |
| 3 | a281b754 | feat(35-04): live menu-page-tools, menu-edit, menu-spelling and menu-save scenarios |

## Deviations from Plan

### Scope Deviations (recommended option taken at each choice point)

1. **View Page Source and View Frame Source load in the same tab, not a new one.**
   - **Why:** Phase 32's `webTabViewSourceReply` refuses `inNewTab` ("a view-source overlay is not built", 32-08), and the plan forbids a second view-source path.
   - **Change:** View Frame Source passes the captured `docLocation` through a new optional `frameUrl` parameter. That edit changes two lines in place.
   - **Live scenario:** `menu-page-tools` asserts the same-tab URL.
2. **Paste Without Formatting is omitted.** The edit-today verdict lists `cmd_pasteNoFormatting` as chrome-no-effect. Only `cmd_copyImage` joins the frozen set.
3. **`cmd_pasteNoFormatting` stays the surplus-literal plant.** The edit gate's original plants still use it, because it remains outside the set.
4. **Inspect uses `tabHostNodeOf(browser)`, not `window.gBrowser.getTabForBrowser`.** Both read the same 31.1 host map. It also uses the existing `webTabDevToolsShim()` instead of a new lazy-getter import. The acceptance grep `DevToolsShim.inspectNode` holds through a local `DevToolsShim` binding.
5. **Save rows are omitted for non-http(s) targets** rather than shown disabled. The canvas Save Image (blob through `#canvasToBlobURL`) is omitted, and the plain-text-link Save Link As is not derived.
6. **The Copy Image row has no command-state `off` predicate.** It is enabled whenever it is shown.

### Auto-fixed Issues

**1. [Rule 1 - Bug] Catalogue row token for `initFromRemote`**
- **Found during:** Task 2 (ng-040 stale-row failure)
- **Issue:** The row named `InlineSpellChecker.initFromRemote`, but the line reads `state.spell.initFromRemote(...)`.
- **Fix:** The row now names `initFromRemote`.
- **Commit:** fce2076d

## Deferred (live/human)

The owner ruling defers every item below to the end-of-milestone pass.

- **Not run:** `node scripts/verify-page-furniture-live.mjs --scenario context-menu,menu-page-tools,menu-edit,menu-spelling,menu-save`. There is no built binary; the harness printed `purgecaches:` and then the objdir error. This is the "Live check: every 35-04 row works from the page menu" truth.
- **Not run:** `node scripts/verify-page-furniture-live.mjs --self-test`. The four new plants are unproven live, and so are the earlier nine.
- **Tracer feedback gate (Task 1).** The automated `<verify>` passed end to end. The live right-click Inspect selection is not observed.
- **Live unknowns to confirm:**
  - The Theia save dialog's DOM drive in `acceptSaveDialog`: the location text input toggle, then the file name field, then Save. If those selectors drift, `menu-save` reports `BROKEN`.
  - Whether `cmd_copyImage` reaches the image after focus moves to the Theia frame. ContextMenuChild's `setCommandNode` should hold it.
  - Whether a remote `Downloads` source with `loadingPrincipal` and `cookieJarSettings` fetches as expected.
  - Whether the test profile's en-US dictionary offers "the" for "teh".
  - Whether the default tool of a freshly opened toolbox lets `inspectNode` select in an already-open toolbox.
- **Visual check:** the bookmark editor keeps focus after Bookmark Page; the save failure notification copy.
- **Timing:** still no `context-menu timing:` line. 35-05 must take its documented fallback.

## Cross-lane assumptions

- **Bookmark Page** executes `powerbrowser.chrome-bar.bookmark-page`, the exact id in `33-02-PLAN.md:109` and `33-UI-SPEC.md:166`. It is the `BOOKMARK_PAGE_COMMAND_ID` local const in `page-context-menu.ts`.
  - **Call site:** `bookmarkPage(widget)` activates the widget, then calls `CommandRegistry.executeCommand`.
  - **Until Phase 33 lands:** the registry rejects the unknown id, the pick's catch returns focus to the page, and nothing is bookmarked.
  - **Gates:** no gate in this tree requires the command to be registered. `verify-chrome-bar-commands.mjs` does not scan `page-context-menu.ts`.
  - **At merge:** replace the local const with Phase 33's exported `CHROME_BAR_*` id const if it adds one.
  - **Live check:** `menu-page-tools` expects `.pb-bookmark-editor` and a Places bookmark, so it stays red until Phase 33 is merged.
- No Phase 34 artifact is used.

## Known Stubs

- None. Every offered row has a dispatcher arm or a frontend handler (rule 6). Bookmark Page depends on another lane's command; it is not a stub here.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: profile-write | powerbrowser/shell/PowerBrowserAPI.sys.mjs | Add to Dictionary writes the profile's personal dictionary through the remote spell checker, as upstream does. It runs only on an explicit pick of the offered row, and the word is chrome's captured `spellInfo.misspelling`. Not in the plan's threat register. |

## Blockers

None.

## Next Plan Readiness (handoff facts for 35-05 onward)

- **Row table.** There are now 55 id rows and one dynamic row.
  - A dynamic row needs four things: a `{ dynamic: "<kind>", when, runs, group }` line, a `PAGE_MENU_DYNAMIC` entry, a `case "<kind>"` arm, and a `DYNAMIC_KINDS` entry with its reason in the furniture gate.
  - Dispatcher arms may be `context-*` or `spell-*`. Another prefix needs rule 6's arm regex widened.
- **New helpers** are appended after `copyFromPage`: `pageToolFacts`, then the `pageToolsLazy` block, `PAGE_MENU_DYNAMIC`, `pageMenuRowOf`, `pageEditFacts`, `pageMenuSpell`, `pageMenuSavePick`, `pageMenuSavePathOk` and `pageMenuSave`. The file now ends with `pageMenuSave`; append after it.
  - New context facts can go in `pageToolFacts` or `pageEditFacts`, both spread into `pageMenuFacts`.
- **Dispatcher.** `handlePageMenuAction` resolves rows through `pageMenuRowOf(itemId)` and calls `runPageMenuRow(row.id ?? row.dynamic, pending, state, itemId)`. A row whose arm returns `where: "save-pick"` keeps the pending record for one `path` reply.
- **Frontend.** A `FRONTEND_ROWS` entry is `{ run(widget, menu), enabled?, keepsFocus? }`. `run` is awaited before the page gets focus back.
  - The contribution now injects `CommandRegistry`, `FileDialogService` and `MessageService`.
  - `settle(widget, tabId, menuId, itemId, reply)` is the signature the `copy-row-unwired` plant wraps.
- **Catalogue.** The misplaced `Ci.nsIURI` setIcon row in "Deliberately not touched" is still `:6481`, untouched by this plan's edits. The remap script (scratchpad, not committed) maps references from `git diff -U0 HEAD` hunks; run it once per task, before the commit.
- **Live harness.**
  - `openTools(app, pages)` and `pickFromMenu(app, tools, selector, label, parent?)` drive the `/tools` page.
  - `ftlLabel` reads `textActions.ftl` for `text-action-*` ids.
  - `chromeBarCopy(key)` reads a `CHROME_BAR_COPY` literal.
  - `applyPageToolPlants` holds the 35-04 plants.
  - `context-menu`'s `pageNames` and per-target `when` lists must grow with any new row that shows on those targets.
- **Copy.** Any new frontend string goes in `CHROME_BAR_COPY` and `EXPECTED_NAV_COPY` in the same commit.

## Self-Check

- FOUND: `id: "context-inspect"` and `id: "context-inspect-a11y"`, one line each, in PowerBrowserAPI.sys.mjs
- FOUND: `DevToolsShim.inspectNode`, one line, in the Phase 35 section
- FOUND: `cmd_copyImage` in scripts/verify-page-tools-edit.mjs and in PowerBrowserAPI.sys.mjs
- FOUND: `Downloads.PUBLIC`, one line, in the Phase 35 section
- FOUND: the `spell-suggestion` DYNAMIC_KINDS entry with its reason in scripts/verify-shell-furniture.mjs
- FOUND: `showSaveDialog`, one line, in page-context-menu.ts
- FOUND: `menu-spelling` in scripts/verify-page-furniture-live.mjs
- FOUND: commits 38d48b13, fce2076d and a281b754 (ancestors of HEAD)
- `bash scripts/check-internals-boundary.sh` and `--catalogue`: PASS; `node scripts/verify-ng-040-internals-catalogue-lines.mjs`: PASS; `--fix`: no change
- `node scripts/verify-shell-furniture.mjs`: PASS; `--self-test`: PASS, plants (a) to (n)
- `node scripts/verify-page-tools-edit.mjs`: PASS; `--self-test`: PASS, 5 plants
- `node scripts/verify-shell-error-copy.mjs` and `--self-test`: PASS
- `node scripts/verify-web-tab-bridge.mjs` and `--self-test`: PASS
- `tsc -b theia/extensions/tab-uris` and `tsc --noEmit -p theia/extensions/chrome-bar`: no errors; `yarn build`: exit 0
- No literal bidi or control characters in the diff
- `scripts/verify-platform.sh --quick`: exit 0 (after Task 3)

## Self-Check: PASSED
