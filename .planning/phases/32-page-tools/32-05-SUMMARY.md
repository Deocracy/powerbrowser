---
phase: 32-page-tools
plan: "05"
subsystem: chrome-boundary
tags: [page-tools, save, picker-split, savePageCopy, file-dialog, save-half-gate, live-harness, packaged-run]
status: complete
requires:
  - phase: 32-page-tools (plan 01)
    provides: the web-tab arms and walls, the live skeleton, the static gate pattern
  - phase: 32-page-tools (plan 02)
    provides: the saveOpen (Ctrl+S) page-focus relay row, as a focusPage stub
  - phase: 32-page-tools (plan 03)
    provides: the print gate that the save half extends, and the print live scenario
provides:
  - webTabSavePick and webTabSaveExport arms in handleWebTabAction, with union members and KIND_CLASSES entries
  - WebTabWidget.savePage(choose) and the saveFailed notice
  - the Theia "Save page as" dialog wired from the saveOpen relay row through chrome-bar
  - the save half of verify-page-tools-print-save.mjs (routing, guards, no Theia-side writer), with planted faults
  - the live save scenario with a planted fault, and a /save fixture that carries a stylesheet
affects:
  - 33 (menu and palette entries for save consume savePage; no command is registered here)
  - end-of-milestone verification pass (the on-screen dialog and the private-tab refusal)
tech-stack:
  added: []
  patterns:
    - picker split: the Theia dialog chooses a path, chrome mints and writes the copy, the path crosses only as data
    - one-way setter for the Theia file dialog, the same shape as the find bar and Downloads openers
    - derive-and-compare gate extended by a family (print and save share one routing check)
key-files:
  created: []
  modified:
    - powerbrowser/shell/PowerBrowserAPI.sys.mjs
    - powerbrowser/INTERNAL-APIS.md
    - theia/extensions/tab-uris/src/browser/web-tab.ts
    - theia/extensions/chrome-bar/package.json
    - theia/extensions/chrome-bar/src/browser/chrome-bar-commands.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar-shortcuts.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx
    - scripts/verify-web-tab-bridge.mjs
    - scripts/verify-page-tools-print-save.mjs
    - scripts/verify-page-tools-live.mjs
    - scripts/verify-shell-error-copy.mjs
key-decisions:
  - "Pick writes nothing and returns a proposed file name (the page title, sanitized, with .html). The minted saved-pages directory is created by the export, through savePageCopy, so 'no write yet' holds at pick time."
  - "The export copies the minted page.html to the picked path and copies page_files to a sibling <stem>_files folder, rewriting the page_files/ links to match. The rewrite reads page.html as UTF-8 (a shortcut, recorded in the code comment)."
  - "The export refuses a uri that another tab shares (findTabBrowserForUri must resolve to this tab's browser), because savePageCopy copies the first browser that carries the uri."
  - "No Theia command or keybinding is registered for save, following the 32-02 precedent (Deviation 4 there). The saveOpen relay row calls savePage directly."
  - "The Theia dialog is reached through a one-way setter, so the command side never imports the widget. The chrome bar declares @theia/filesystem at the pinned 1.76.0, the version the modes and customize extensions already use."
  - "A save that cannot complete shows the contracted failure notice. A cancel or a success clears it. A missing picker fails closed: nothing is written."
  - "Both kinds are classified tab-navigation, as CONTEXT's class log records."
patterns-established:
  - "A relay row whose stub was added by an earlier plan is upgraded in place, with a one-line comment that cites the earlier plan."
  - "A save-path guard is checked by literal presence inside the function body, and each guard has a planted removal that goes red by name."
requirements-completed: [PAGE-08]
duration: "not measured"
completed: 2026-10-31
commits: 2
plan_head_before: cad65fdffc1757e88571db42e3ff49ff3e255324
plan_head_after: 7475eb7e79a2f5b6b34661344a3b347d9fe8bc53
actuals:
  tokens: 19326
  tasks: 2
  commits: 2
---

# Phase 32 Plan 05: Picker-split page save (PAGE-08) Summary

**Ctrl+S on a focused web page opens the Theia "Save page as" dialog, and chrome writes the page through the savePageCopy minted directory to the picked path; the Theia frame keeps Ctrl+S, and the copy is proven live on the dev tree and on the packaged binary.**

## Status

Complete for the build work and for every automated and live check the plan lists. The on-screen dialog (its look, the Save button driven through the real picker) and the private-tab refusal live are listed under the end-of-milestone pass below. The regression chain is green.

## Performance

- **Tasks:** 2 of 2 executed, one production commit each.
- **Commits:** 2 production commits (`5bf05518`, `7475eb7e`), then this SUMMARY and the state commit.
- **Realized diff:** 457 insertions and 69 deletions over 12 files, about 19,326 tokens by the chars/4 scale over the changed lines. The plan estimate was 45,000.

## Accomplishments

- **Chrome save arms (PAGE-08).** `webTabSavePick{tabId}` validates the tab and the scheme and privacy, then replies with a proposed file name. `webTabSaveExport{tabId,path}` re-checks all of that, mints the copy through `savePageCopy` (the unchanged byte path), and copies `page.html` and `page_files` to the picked destination. The path must be absolute, at most 4096 characters, with an `.html` or `.htm` name, and it is checked before any write.
- **Union and routing.** Both kinds are in `WEB_TAB_ACTION_KINDS`, the case arms, the `WebTabMessage` union and `KIND_CLASSES` (`tab-navigation`), in the same commit.
- **Widget and dialog.** `WebTabWidget.savePage(choose)` runs pick, the dialog, then export, and folds the outcome into `saveFailed`. The chrome bar registers the Theia file dialog through a one-way setter. The dialog title is "Save page as", and the save filter is "Web page" with `html` and `htm`.
- **Relay row.** The `saveOpen` row (Ctrl+S, page-focus scope) calls `savePage` in place of the 32-02 focus stub.
- **Copy.** The dialog title and the failure notice ("{App} couldn't save that page. Choose a different place and try again.") are in `CHROME_BAR_COPY`, with pins in the same commit.
- **Gate (save half).** `verify-page-tools-print-save.mjs` now derives the print and save families together. It checks the save routing as set equality, the export's use of `savePageCopy`, the same-tab check, the private and scheme refusals, the absolute-path requirement, the savePageCopy guards and the minted-directory check, the cookie-jar flag, and that no browser-side Theia source names a file-write call. Its self-test has eleven planted faults, and all go red naming their drift.
- **Live scenario.** `verify-page-tools-live.mjs --scenario save`: Ctrl+S from a focused page relays the `saveOpen` row and opens the "Save page as" dialog; Cancel closes it; the Theia frame keeps Ctrl+S (the row is disabled there, with the positive control enabled while the page has focus); pick proposes a name; export writes a file that carries the page text and links its stylesheet from the copied `saved-page_files` folder; a relative path, a non-html name and an oversized path are refused with `validation` and write nothing; an unknown tab replies `unknown-tab`.

## Task Commits

1. **Task 1: chrome save arms, union, bridge classification, boundary catalogue and the save half of the gate**: `5bf05518`
2. **Task 2: savePage, the dialog wiring, the relay row upgrade, copy and pins, the live save scenario**: `7475eb7e`

## Files Created or Modified

- `powerbrowser/shell/PowerBrowserAPI.sys.mjs`: the two kinds in `WEB_TAB_ACTION_KINDS`, the two case arms, and the module-level save helpers after the print helper (`webTabSaveRefusal`, `webTabSaveSuggestedName`, `webTabSaveDestinationIsValid`, `webTabSavePickReply`, `webTabSaveExportReply`, `webTabSaveCopyOut`).
- `powerbrowser/INTERNAL-APIS.md`: four rows for the copy-out IOUtils lines, and the committed rows remapped to the shifted line numbers.
- `theia/extensions/tab-uris/src/browser/web-tab.ts`: the union members, `suggestedName` on the reply, the `saveFailed` field, `savePage` and `settleSave`.
- `theia/extensions/chrome-bar/package.json`: `@theia/filesystem` at 1.76.0.
- `theia/extensions/chrome-bar/src/browser/chrome-bar-commands.ts`: the one-way chooser setter and `chooseSaveDestination`, which fails closed.
- `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx`: the injected `FileDialogService`, the dialog wrapper, the save notice and its render call.
- `theia/extensions/chrome-bar/src/browser/chrome-bar-shortcuts.ts`: the `saveOpen` row calls `savePage`.
- `theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts`: the dialog title and the failure notice.
- `scripts/verify-web-tab-bridge.mjs`: `KIND_CLASSES` entries for the two kinds.
- `scripts/verify-page-tools-print-save.mjs`: the save half, with planted faults.
- `scripts/verify-page-tools-live.mjs`: the `save` scenario, the `/save` and `/save.css` fixtures, and the `save-export-skipped` plant.
- `scripts/verify-shell-error-copy.mjs`: pins for the two new strings.

## Decisions Made

- Pick proposes a file name and writes nothing. The minted directory is created by the export, through `savePageCopy`, so the plan's "no write yet" holds at pick time. The plan's wording ("returns the minted-dir proposal") is read this way.
- The copy-out names its files folder `<stem>_files` and rewrites the `page_files/` links to match. This keeps a saved page's stylesheets and images linked after the rename.
- A uri that another tab shares is refused at export, because `savePageCopy` copies the first browser that carries the uri.
- No Theia command or keybinding is added. The palette and menu entries belong to Phase 33 (MENU-03), and the 32-02 precedent applies.
- A cancel is a clean no-op that clears the notice. A missing picker writes nothing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The catalogue `--fix` left existing touchpoints unmapped**
- **Found during:** Task 1, after the boundary edit shifted every catalogued line below the arms.
- **Issue:** `verify-ng-040-internals-catalogue-lines.mjs --fix` renumbered most rows but left 14 existing occurrences without a row. The same pattern occurred in 32-03.
- **Fix:** every committed row of `INTERNAL-APIS.md` was remapped through the difflib line mapping of the committed boundary file to the edited one (6437 lines mapped, none unmapped). Four rows were then added for the new `IOUtils` lines. Both catalogue gates pass.
- **Commit:** `5bf05518`

**2. [Rule 1 - Bug] Stale plant anchor in the print-save gate**
- **Found during:** Task 1, the first self-test run.
- **Issue:** the `webTabPrint` union member lost its trailing semicolon when the save members were appended, so the stale-union plant no longer matched.
- **Fix:** the plant anchor matches the line without the semicolon. The self-test passes with eleven plants.
- **Commit:** `5bf05518`

**3. [Rule 3 - Blocking] `@theia/filesystem` was not declared by the chrome bar**
- **Found during:** Task 2, the typecheck and the first quick gate.
- **Issue:** the chrome bar needs `FileDialogService`, and its `package.json` did not declare `@theia/filesystem`. Adding the declaration then made `yarn check --integrity` report "Top level patterns don't match", and the core-diff instrument reads that as a red Theia-core check.
- **Fix:** the dependency is declared at the pinned 1.76.0, and `yarn install --ignore-scripts --frozen-lockfile` was run in `theia/` in the Theia dev shell, the documented install sequence. The frozen flag made yarn fail rather than rewrite the lockfile, and `theia/yarn.lock` is unchanged.
- **Commit:** `7475eb7e`

### Scope Deviations

**4. The live save plant is `save-export-skipped`, not `save-guard-removed`.** The plan's live plant expected a red `refused`. A runtime harness cannot remove a chrome guard, and a plant that sends a request the guard should accept would test nothing. The guard plants live in the static gate instead, as `save guard removed (savePageCopy no longer refuses a private tab)` and `save refusal removed (both save kinds accept a private tab)`, and both go red by name. The live plant skips the export, so no file lands, and the scenario must go red naming `was not written`.

**5. No Theia command and no palette entries.** The plan asked for a command per save action. None is registered, following 32-02 Deviation 4: a labelled command adds palette rows that UI-SPEC assigns to Phase 33, and a labelless one is unreachable. The relay row calls `savePage` directly.

**6. The relay id is camelCase and the call takes the chooser.** The row is `saveOpen`, not `save-open`, because the chrome side refuses hyphenated relay ids (32-02 Deviation 1). The plan's grep pattern `\.savePage()` therefore reads `.savePage(chooseSaveDestination)`.

**7. The export does not cap the page size.** The plan's threat T-32-02s asks for oversized input to be refused before any write. The input is capped: the destination path at 4096 characters, and the uri at the 8192 that `savePageCopy` already enforces. The page bytes themselves are not capped. A page large enough to matter is written to the minted directory and then copied. This is a residual, recorded here rather than built.

**8. A page persisted in a non-UTF-8 charset fails the export.** The `page_files/` link rewrite reads `page.html` as UTF-8. The export then returns `write-failed` and writes nothing for that page. A code comment records this as a shortcut, with the upgrade path (a byte-level rewrite).

**9. The P-tier run needed a repackage.** The packaged archive on disk was built on 2026-10-21 and carried no save arm (see 31.1-01 Issue 4). `powerbrowser/packaging/package-linux.sh` was run in the Firefox dev shell. It took about a minute and did not rebuild Gecko. The archive in `objdir/dist` was replaced, so it is now current. The save scenario was then run against the extracted binary, selected with `PB_FIREFOX_BIN`.

## Live Results

| Check | Result | Evidence |
|---|---|---|
| `sha256sum -c --status objdir/.pb-050-build.sha256` | pass | stamp matches |
| `theia yarn build` | exit 0, 13.2 s | the Theia dev shell |
| `tsc -b theia/extensions/tab-uris`, `tsc --noEmit -p theia/extensions/chrome-bar` | pass | |
| `verify-page-tools-print-save.mjs`, `--self-test` | PASS, 11 plants red | |
| `verify-web-tab-bridge.mjs`, `--self-test` | PASS, 28 kinds, 32 plants red | |
| `verify-shell-error-copy.mjs`, `--self-test` | PASS, 13 planted modes-copy faults red | |
| `verify-shortcut-relay.mjs`, `--self-test` | PASS, 37 rows, 19 plants red | |
| `check-internals-boundary.sh --catalogue`, `verify-ng-040-internals-catalogue-lines.mjs` | PASS | |
| `verify-page-tools-zoom-mute.mjs`, `verify-page-tools-find.mjs` | PASS | |
| `verify-page-tools-live.mjs --scenario save` (dev tree, `objdir/dist/bin`) | PASS | |
| `verify-page-tools-live.mjs --self-test` | PASS, 5 clean controls green, 5 plants red | `save-export-skipped` names `was not written` |
| `verify-page-tools-live.mjs --scenario find,zoom,audio,downloads,keys-theia,print` | all PASS | regression chain |
| `verify-nav-keys-live.mjs` (`theia-keeps-keys`) | PASS | no key regression |
| `package-linux.sh` then `verify-page-tools-live.mjs --scenario save` on the packaged binary | PASS | P tier; `browser/omni.ja` carries the save arm |
| `scripts/verify-platform.sh --quick` (in `nix develop .#theia`) | PASS, all checks | the final tree |

Note on the gate environment: the core-diff instrument calls `yarn`, which resolves only inside `nix develop .#theia`. Run from the host shell, the quick gate reports the strip-spike verdict red. That is an environment fault, not a code fault, and the quick gate passes in the Theia shell.

## Deferred to the end-of-milestone verification pass

These need a visible screen or an OS dialog, or a case the harness cannot create headlessly.

- **The "Save page as" dialog on screen:** its layout, focus order, and the Save button driven through the real Theia picker. The live scenario opens and cancels the dialog, and drives pick and export separately.
- **Private-tab refusal live:** the harness has no private window. The guards are checked by the static gate, and no live run covers a private page.
- **Non-http(s) refusal live:** the wall is checked by the static gate. The harness does not open a non-web page.
- **Non-UTF-8 export:** see Deviation 8. No live page of that kind was tried.
- **Copy review:** "Save page as" and the failure notice are pinned, and their look and placement in the bar are not reviewed on screen.

## Issues Encountered

- The first live run failed on the stylesheet check, because the persisted stylesheet keeps a unique name (`save_<suffix>.css`). The export was correct: the link was rewritten to `saved-page_files/`, and the folder existed. The check was changed to follow the stylesheet `href` and confirm that file exists.
- The quick gate first went red in the host shell, on the strip-spike verdict. The cause was the `yarn check --integrity` mismatch from Deviation 3, and the host shell had no `yarn`. After the frozen reinstall, the quick gate passes in the Theia dev shell.

## Next Phase Readiness

- Phase 33 (MENU-03, SMODE-07) can add menu and palette entries for save by calling `savePage` on the pushed tab. No command id or keybinding is reserved for it.
- The on-screen items above go to the end-of-milestone pass.

## Requirements

PAGE-08 is complete for the build and for the automated and live checks. The on-screen items are deferred and listed above.

## Self-Check

Files and commits, checked against disk and git after the commits:

- `powerbrowser/shell/PowerBrowserAPI.sys.mjs`, `scripts/verify-page-tools-print-save.mjs`, `scripts/verify-page-tools-live.mjs`, `theia/extensions/tab-uris/src/browser/web-tab.ts`, `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx`: all present.
- `git merge-base --is-ancestor` for `5bf05518` and `7475eb7e`: both are ancestors of HEAD.
- `node scripts/verify-page-tools-print-save.mjs --self-test`: PASS.

## Self-Check: PASSED (files, commits, gates, live and packaged runs) / DEFERRED (on-screen items and the live private-tab refusal, listed above)

---
*Phase: 32-page-tools*
*Completed: 2026-10-31*
