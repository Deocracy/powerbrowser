---
phase: 30-address-bar-modes-and-command-centre
fixed_at: 2026-10-22
review_path: .planning/phases/30-address-bar-modes-and-command-centre/30-REVIEW.md
iteration: 1
findings_in_scope: 7
fixed: 7
skipped: 0
status: all_fixed
---

# Phase 30: Code Review Fix Report

**Fixed at:** 2026-10-22
**Source review:** .planning/phases/30-address-bar-modes-and-command-centre/30-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 7 (CR-01, WR-01..WR-06; IN-03 folded into CR-01 as instructed)
- Fixed: 7
- Skipped: 0
- Left as info: IN-01, IN-02, IN-04, IN-05 (IN-05 is Chris's call at verify-work)

Every fix was made in the main checkout (`workflow.use_worktrees` is false), and every gate
below ran there.

## Fixed Issues

### CR-01: Ctrl+Enter in Command centre sends the typed text to chrome's resolve and navigates

**Files modified:** `theia/extensions/chrome-bar/src/browser/address-bar/address-bar.tsx`
**Commit:** 6ca3a79
**Applied fix:** The Enter branch of `onInputKeyDown` now starts, after the Home-failure row,
with a guard: in Command centre with typed text, Enter, Alt+Enter and Ctrl+Enter go to
`enterLocalRow`. That method chooses the highlighted row, or opens it in a new tab for
Alt+Enter. When Enter lands inside the debounce, the list is settled first, so its default row
wins. With no row, Enter does nothing. The Ctrl+Enter canonize branch also requires that no
local mode is active. IN-03: `cycleMode` leaving Command centre for a mode that resolves keeps
the text and leaves the list closed, so the text is not re-sent.
**Status:** fixed: requires human verification (key-handling logic; proven live and statically,
see WR-04).

### WR-01: `classifyAddress` makes `Makefile:12` and `src/` a highlighted first-row Go-to in Command centre

**Files modified:** `address-bar/address-bar-rows.ts`, `address-bar/address-bar.tsx`,
`scripts/verify-address-bar-rows.mjs`, `30-CONTEXT.md`
**Commits:** 3acb9fc, 87083c3 (the option is renamed `files`, because `fileSearch?` matched the
suggestions gate's `search\?` pattern)
**Applied fix:** `classifyAddress(text, { files })`. When `files` is set (Command centre), an
undotted `host:port` and a trailing `/` are classed `ambiguous`: picks first, then an
unhighlighted Go-to row. A scheme, `localhost[:port]`, an IP and a leading `www.` still lead and
are highlighted. Tabs, Bookmarks and History keep D-29. Ten file-search cases and the
`file search ignored` plant were added to the rows gate. The rule is recorded as **D-34**
(refines D-29; orchestrator ruling 2026-10-22, reversible by Chris).
**Status:** fixed: requires human verification (classification rule; Chris may revert D-34).

### WR-02: Enter in a local mode commits the typed text when no row is highlighted

**Files modified:** `address-bar/address-bar.tsx`
**Commit:** 2e3cdbd
**Applied fix:** The CR-01 guard now covers every local mode (`localMode()`): Command centre,
Tabs, Bookmarks, History and Actions. Enter with typed text settles a pending list and acts on
its first actionable row, as the UI-SPEC requires ("With typed text, the first actionable row is
highlighted by default"; with no match in Tabs, Bookmarks and History, the search row is
highlighted). In Actions with no match, Enter does nothing. The unedited zero-query Enter still
reloads the page.
**Status:** fixed: requires human verification (Enter semantics).

### WR-03: The chip's x or Backspace in an empty pill leaves the old mode's list open

**Files modified:** `address-bar/address-bar.tsx`, `scripts/verify-address-bar-live.mjs`
**Commit:** 6ad0f42
**Applied fix:** `requery()` always calls `textEdited(this.inputValue, false)`. That closes the
list for empty text in a resolving mode and bumps `querySeq`, so a late list cannot land on
top. `mode-defaults` gained a Browsing step: pick History with an empty pill, require its
zero-query list to be open (the positive), press Backspace, then require the default mode with
the list closed. Plant `requery-repaints` goes red.

### WR-04: The D-26 proof covers typing only, so CR-01 passes every gate

**Files modified:** `scripts/verify-address-bar-modes.mjs`, `scripts/verify-address-bar-live.mjs`
**Commit:** 22c0854
**Applied fix:**
- Static: three new cases read `onInputKeyDown`'s Enter branch, which handles Enter, Alt+Enter
  and Ctrl+Enter, from the source with comments stripped:
  - A guard on a `this.localMode()` variable and on `this.queryText()` returns through
    `enterLocalRow`. No typed-text commit (`commitText`, `commitTyped`, `urlForRow`,
    `resolveTypedAddress`, `runOneOff`, `openRowInNewTab`) comes before or inside that guard.
    The positive control is that commits do follow it.
  - The canonize condition negates the guard variable.
  - `enterLocalRow` commits only a row.
  - Four new plants go red: CR-01's canonize branch moved above the guard, the guard narrowed
    to Command centre, canonize without the local test, and `enterLocalRow` falling back to
    `commitTyped`.
- Live: `command-centre-privacy` opens the fixture workspace. In every all-false `modeSends()`
  mode (Command centre, Tabs, Actions), it types `readme` and presses Enter, Alt+Enter or
  Ctrl+Enter inside the debounce:
  - Row choices and address opens are recorded instead of run. A rowless Alt+Enter still runs
    the real path.
  - It requires no typed-text kind, no engine GET and no address open.
  - In Command centre each key must choose the highlighted README.md pick (the positive).
  - Then Ctrl+Down out of Command centre with the list open must change the mode, keep
    `readme` and send nothing.
  - The existing Address-mode "hello" positive control is kept.
  - Plants `cc-canonize` (CR-01 reintroduced), `local-enter-commits` (WR-02 reintroduced) and
    `cc-cycle-requery` (IN-03 reintroduced) each go red.

### WR-05: A fresh tab reports canGoBack after Browsing, Organising, Browsing

**Files modified:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs`, `powerbrowser/INTERNAL-APIS.md`,
`scripts/verify-address-bar-live.mjs`, `deferred-items.md`
**Commits:** afda7df, f707a79 (the new catalogue row moved to the table end, per the append-only
rule)
**Confirmed live** before the fix, with `search,mode-lifetime,local-modes`. Read chrome-side, the
fresh `/lm-act` overlay had `sessionHistory.count` 2 and `index` 1. Its entries were
`[http://localhost:…/lm-act (hasUserInteraction true), about:blank]`; `currentURI` was the
page, and `canGoBack` was true. Entry 0 was the page, not `about:blank`. The `about:blank` was
appended after the page, at the current index. That fits the mechanism the review named: the
overlay's initial `about:blank` committed after the first load. `search,mode-lifetime` alone
did not reproduce it.
**Applied fix:** `webTabOpen` hands the first load to `firstWebTabLoad`. That method waits for
the initial commit (`sessionHistory.count > 0`, polled every 25ms, bounded at 3000ms, as
`restoreWebTabHistory` does; measured at 25 to 55ms). It then loads with
`LOAD_FLAGS_REPLACE_HISTORY`. Any `webTabNavigate` or close during the wait supersedes it.
`webTabOpen` still returns `"opened"`. After the fix the same session shows `count` 1,
`canGoBack` false. `local-modes` again asserts Back disabled and `canGoBack === false` on the
one-page tab, next to Forward. The `phantom-history` plant appends an `about:blank` entry
chrome-side and pushes state; it goes red with "a tab opened on one page reports canGoBack".
The INTERNAL-APIS line references were re-pointed with `--fix`. The `searchLazy` row and the
BAR-01 `getFixupURIInfo` row were corrected by hand (`--fix` had mapped them to the wrong
lines). A `Ci.nsIWebNavigation` row was added for the new flag. The deferred item is closed.
**Status:** fixed: requires human verification (chrome-side load timing).

### WR-06: The alias read in `listSearchEngines` has no INTERNAL-APIS row

**Files modified:** `powerbrowser/INTERNAL-APIS.md`
**Commit:** e88ebca
**Applied fix:** Two rows were appended:
- `engine.aliases` at `PowerBrowserAPI.sys.mjs:4474`: at most 8 aliases, each at most 64
  characters. A renamed or reshaped `aliases` yields `[]` through the `Array.isArray` fallback.
- The Phase 29 `engine.getIconURL` read at `:4472`: a `data:image/` string of at most 65536
  characters, else `null`.

`verify-ng-040-internals-catalogue-lines.mjs --fix` found nothing stale. Rows that share a
pattern and a function were checked by hand against the source:
- `IOUtils.remove` 4108 is the replaced copy and 4112 is the failure cleanup.
- `searchLazy` is at 4347.
- `getFixupURIInfo` is at 4448 for BAR-01 and 4439 for BAR-13.

`check-internals-boundary.sh` passes plain and with `--catalogue`.

## Verification

All runs were in the main checkout, after the Theia rebuild given in the task.

- `scripts/verify-platform.sh --quick`: PASS. This includes `verify-address-bar-modes`
  (21 cases, 17 plants), `verify-address-bar-rows` (49 cases, 9 plants), the suggestions gate,
  the brand scan and the catalogue checks.
- `node scripts/verify-address-bar-live.mjs` (all 30 scenarios): PASS.
- `node scripts/verify-address-bar-live.mjs --self-test`: all 34 plants went red as named,
  including the five new ones (`requery-repaints`, `cc-canonize`, `local-enter-commits`,
  `cc-cycle-requery`, `phantom-history`). The run still exits 1 (FAIL), because the clean
  control was red on one step in both runs: "context-menu: after Paste & Go chrome's focus must
  be in the tab's page". That is the known flake recorded in
  `29-address-bar-search-and-fixup/deferred-items.md` (about 2 in 5 full runs, suspected Phase 27
  GUI-02 remoteness defect). The standalone full run above passed `context-menu`. No other
  clean-control step was red.
- `node scripts/verify-nav-keys-live.mjs`: PASS (31 checks).
- `node scripts/verify-web-tab-live.mjs`: PASS.

---

_Fixed: 2026-10-22_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
