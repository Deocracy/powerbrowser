---
phase: 29-address-bar-search-and-fixup
fixed_at: 2026-10-22T03:30:56Z
review_path: .planning/phases/29-address-bar-search-and-fixup/29-REVIEW.md
iteration: 2
findings_in_scope: 1
fixed: 1
skipped: 0
status: all_fixed
---

# Phase 29: Code Review Fix Report

**Fixed at:** 2026-10-22T02:54:15Z
**Source review:** .planning/phases/29-address-bar-search-and-fixup/29-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 12 (the 12 warnings; the 16 info findings are out of scope for this pass)
- Fixed: 12
- Skipped: 0

IDs are the 29-REVIEW.md IDs. The fixer task listed the area reviewers' IDs; the mapping is
WR-29-01 -> WR-01, frontend WR-02..WR-10 -> WR-02..WR-10, checks WR-01 -> WR-11,
checks WR-04 -> WR-12.

## Iteration 1

### Verification

All gates ran in the **main checkout** (`workflow.use_worktrees` is `false`, so no worktree was
created), so every result below can be reproduced from this tree.

- Per fix: `tsc --noEmit -p` on the touched extension (tab-uris rebuilt with `tsc -b` before
  chrome-bar picked up the new `resolveTypedAddress` signature), `node --check` on the touched
  `.mjs`/`.sys.mjs`.
- After each `PowerBrowserAPI.sys.mjs` edit: `verify-ng-040-internals-catalogue-lines.mjs --fix`,
  then a hand check of the same-name rows. WR-07 mapped both `getFixupURIInfo` rows to line 4412,
  and row 170 (the BAR-01 fixup) was corrected by hand to 4421. The `IOUtils.remove`/`savePageCopy`
  pair and the `searchLazy` row sit above the edits and did not move. Then
  `check-internals-boundary.sh` and `--catalogue`: PASS.
- Theia rebuilt (chrome-bar, tab-uris, browser app in development mode): 0 errors.
- `scripts/verify-platform.sh --quick`: PASS.
- `verify-chrome-bar-suggestions.mjs --self-test` and `verify-token-cookie-strip.mjs --self-test`:
  PASS, including the new plants.
- `verify-address-bar-live.mjs`, all 18 scenarios: the first run went red on `rows` because the
  new WR-12 sidecar-overlay tab stayed open and took a place-row slot. 9e79e15 closes that tab;
  after it, `token-cookie,rows` both PASS. Every other scenario passed on the first run.
- To prove WR-12's live load, the overlay branch was temporarily replaced with `return true`;
  `token-cookie` then failed with "carried POWERBROWSER_TOKEN: sidecar-overlay". The change was
  reverted with `git checkout`.
- `verify-address-bar-live.mjs --self-test`: the first run failed on two points.
  - `token-strip-off` was red, but its message listed sidecar-overlay first, so it did not match
    the plant's expected text. 63e8eda now reports sidecar-overlay after the four served-port
    loads.
  - The clean control's `context-menu` failed once with "after Paste & Go chrome's focus must be
    in the tab's page". None of these fixes touches that path, and it did not happen again.
  - The full suite run after that: 18 of 18 PASS. The self-test run after that: PASS, clean
    control green and all 13 plants red, including the new `pill-drag-navigates`.

### Fixed Issues

#### WR-01: autofillOrigin removes www. when the typed text is a prefix of www.

**Files modified:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs`, `powerbrowser/INTERNAL-APIS.md` (line refs)
**Commit:** ba7d676
**Status:** fixed: requires human verification (no live scenario seeds a www. origin)
**Applied fix:** `shown = host.startsWith(typed) ? host : host.slice(4)`. A host that itself starts with the typed text keeps its `www.`; only a wwwPattern match drops it.

#### WR-02: current() guard does not reject replies for an older prefix after a new keystroke

**Files modified:** `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx`
**Commit:** b0f7b45
**Status:** fixed: requires human verification (the timing window is not driven live)
**Applied fix:** `textEdited` bumps `querySeq` first, before its composition and empty-text early returns, so replies still in flight for the old text fail `current()`.

#### WR-03: closeDropdown keeps stale rows, which come back when a failure flag clears

**Files modified:** `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx`
**Commit:** 5bbf53b
**Status:** fixed: requires human verification
**Applied fix:** `closeDropdown` also clears `rows`, `heuristic` and `placeRows`. `syncAddressFromWidget` closes the dropdown when it clears `commitFailed` or `noSearch`.

#### WR-04: Shift+Delete success reopens the dropdown after the user closed it or committed

**Files modified:** `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx`
**Commit:** 1e714fe
**Status:** fixed: requires human verification (shift-del live scenario passes; the close-during-write race is not driven)
**Applied fix:** `removeHighlightedRow` reads `querySeq` before the await. Both the success path and the failure path return unless `dropdownArmed && querySeq === seq`, and the rows are recomposed under that seq.

#### WR-05: "Press Enter to try again" retries the current page, not the failed drop or new-tab open

**Files modified:** `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx`
**Commit:** b168c92
**Status:** fixed: requires human verification (opener failures are not driven live)
**Applied fix:** `showCommitFailure(retry?)` records what to repeat. The drop path (now `openDropped(payload)`) retries the same payload. `openRowInNewTab` retries the row when it has no URL, and the new `openUrlInNewTab(url, foreground)` retries the same URL. The one-off in-place search (`openSearchUrl`) retries the same search URL. Enter on the failure row runs the recorded retry, and falls back to `commitText(inputValue)` only for a typed commit. `closeDropdown` and `textEdited` clear the recorded retry.

#### WR-06: Store tab rows fill the 5-row cap and are then dropped, hiding history and bookmark matches

**Files modified:** `theia/extensions/chrome-bar/src/browser/chrome-bar-places-suggestions.ts`, `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx`
**Commit:** b9bdc70
**Applied fix:** The live-shell-tab filter moved from the widget's `placeRowsOf` into `ChromeBarPlacesSuggestions.searchByPrefix`, which injects `ApplicationShell`. It now runs before the tab/place dedup and the cap, so stock-window and closed-tab store rows can no longer take a slot or hide a same-URL history row. The rows and switch-to-tab live scenarios pass.

#### WR-07: One-off engine refuses URL-shaped text with a misleading "can't search right now" row

**Files modified:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs`, `powerbrowser/INTERNAL-APIS.md`, `theia/extensions/tab-uris/src/browser/chrome-store-client.ts`, `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx`
**Commit:** a52a3fe
**Applied fix:** `resolveTypedAddress` gained a fourth argument, `forceSearch`. The store field `forceSearch === true` is the only accepted value. It skips fixup and takes the named engine's submission through the shared `engineSearch` helper, which keeps the postData and http(s) wall. `runOneOff` sends it. The INTERNAL-APIS.md fixup row names the new field. The one-off live scenario passes.

#### WR-08: Dragging selected text inside the pill navigates the current tab

**Files modified:** `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx`, `scripts/verify-address-bar-live.mjs`
**Commit:** e3f30fb
**Applied fix:** The input's `onDragStart`/`onDragEnd` set `pillDragActive`. While it is set, the pill's dragenter/dragover (`onPillDragOver`) and drop handlers only stop propagation, which keeps Theia's document-level `dropEffect = 'none'`/preventDefault away, and they never prevent the native in-field move or load anything. The New Tab button's drop is unchanged. canonize-drop now drags "own words" with a dragstart on the input: neither dragover nor drop may be prevented, and no GET may follow. The plain-text drop just before it is the positive control. The new `pill-drag-navigates` plant neuters the flag.

#### WR-09: Right-click and other mouse buttons on a suggestion row commit it

**Files modified:** `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx`
**Commit:** fab2092
**Applied fix:** The row's `onMouseDown` else-branch is `else if (e.button === 0)`. Buttons 2, 3 and 4 do nothing.

#### WR-10: Ctrl+Enter cannot canonize a bare name that autofill has completed

**Files modified:** `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx`
**Commit:** 2ee0e61
**Status:** fixed: requires human verification (canonize-drop does not combine Ctrl+Enter with autofill)
**Applied fix:** While the completion is still selected (`autofillSelected`), Ctrl+Enter tests and commits `inputValue.slice(0, selectionStart)`, which is the typed part. A completion accepted with Tab (selection collapsed) still commits as plain Enter.

#### WR-11: The engine-host ban is a hand-kept list that omits the configured engines

**Files modified:** `scripts/verify-chrome-bar-suggestions.mjs`
**Commit:** 9215bb1
**Applied fix:** `engineHosts()` derives the banned hosts at check time from three sources: every `[[search_engines]]` url and suggest_url host (through `resolveConfig`), every `base` host in upstream's `search-config-v2.json` when it is present, and the old list kept as a floor (`ENGINE_HOSTS_FLOOR`). A configured template with no host is a broken instrument. `SEARCH_QUERY_PATTERN` is `/[?&](q|query|search)=|search\?/i`. The self-test plants each configured template hardcoded in the widget (each goes red naming its derived host) and a `Special:Search?search=` template on an unlisted host (red on the pattern). The configured plants were also run with upstream's search config moved aside, and they stay red, so the hosts come from configuration.toml. The file was restored unchanged. The ban messages now say a search URL is minted only by chrome's `resolveTypedAddress`.

#### WR-12: Neither the static nor the live token-cookie check covers the overlay branch or the header filter

**Files modified:** `scripts/verify-token-cookie-strip.mjs`, `scripts/verify-address-bar-live.mjs`
**Commits:** 101b203, 9e79e15, 63e8eda
**Applied fix:** The static check adds two pins. `overlay:` requires `if (bc) { return tabIdOfBrowser(bc.top.embedderElement) === null; }` in `tokenCookieAllowed`. `filter:` requires the `${TOKEN_COOKIE_NAME}=` filter in `tokenCookieStrip`. Each has a plant (`return true`; a filter on another name), and the self-test has 6 of 6 red. In the live check, token-cookie gains a fifth load: a web tab on `<sidecar origin>/powerbrowser/health?pb-overlay`, observed chrome-side at `http-on-examine-response`. It must carry no `POWERBROWSER_TOKEN` and must not get 200. The Theia frame's credentialed 200 is the control. The tab is closed afterwards (9e79e15), and sidecar-overlay is reported after the four served-port labels (63e8eda).

## Iteration 2

**Fixed at:** 2026-10-22T03:30:56Z
**Findings in scope:** 1 (NEW-01, the re-review's one warning). Fixed: 1. Skipped: 0. The
frontmatter counts are for this iteration; iteration 1's counts (12 of 12) are above.

### Verification

All gates ran in the **main checkout** (`workflow.use_worktrees` is `false`), so every result can
be reproduced from this tree. `PowerBrowserAPI.sys.mjs` was not edited, so the catalogue and
boundary steps were not needed.

- `node --check scripts/verify-address-bar-live.mjs`: PASS.
- Theia rebuilt (chrome-bar, tab-uris, browser app in development mode): 0 errors.
- `node scripts/verify-address-bar-live.mjs --scenario one-off`: PASS.
- The one-off scenario run with the new plant `oneoff-retry-recommits` (showNoSearch drops the
  retry, which restores the defect): red, naming "Enter after a failed background one-off opened
  no new tab on /two/search". The pill held the page URL `/two/search?q=hello`, which is the
  re-commit WR-05 removed.
- `scripts/verify-platform.sh --quick`: PASS.
- The full `verify-address-bar-live.mjs --self-test` was not run. Only the new plant was driven.

### Fixed Issues

#### NEW-01: After a failed one-off search in a new tab, Enter still reloads the current page

**Files modified:** `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx`, `scripts/verify-address-bar-live.mjs`
**Commit:** 8587866
**Status:** fixed: requires human verification (the live check covers the background target; the
foreground and current targets use the same retry, but no scenario drives them)
**Applied fix:** `showNoSearch(retry?)` records its retry the same way `showCommitFailure` does.
`runOneOff` takes an optional `text` (default `inputValue.trim()`), and its failure branch calls
`showNoSearch(() => this.runOneOff(name, target, text))`, so the retry uses the text captured
before a new-tab target resets the pill. The Enter branch uses `const retry = this.retry;` for
both failure rows. With no retry, as for a no-engine reply on typed text, Enter still re-commits
the typed text. The one-off live scenario adds a check: one resolve stubbed to reply no-engine, a
middle-click on the Probe Engine Two one-off, then the no-search row, then Enter, which must open
/two/search in a tab not seen before. The self-test gets the plant `oneoff-retry-recommits`.

---

_Fixed: 2026-10-22T03:30:56Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 2_
