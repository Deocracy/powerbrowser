---
phase: 30-address-bar-modes-and-command-centre
reviewed: 2026-10-22T23:00:54Z
depth: standard
files_reviewed: 24
files_reviewed_list:
  - powerbrowser/INTERNAL-APIS.md
  - powerbrowser/shell/PowerBrowserAPI.sys.mjs
  - scripts/verify-address-bar-live.mjs
  - scripts/verify-address-bar-modes.mjs
  - scripts/verify-address-bar-rows.mjs
  - scripts/verify-chrome-bar-commands.mjs
  - scripts/verify-chrome-bar-suggestions.mjs
  - scripts/verify-nav-keys-live.mjs
  - scripts/verify-platform.sh
  - scripts/verify-shell-error-copy.mjs
  - scripts/verify-web-tab-bridge.mjs
  - scripts/verify-web-tab-live.mjs
  - theia/extensions/chrome-bar/src/browser/address-bar/address-bar-mode-table.ts
  - theia/extensions/chrome-bar/src/browser/address-bar/address-bar-modes.ts
  - theia/extensions/chrome-bar/src/browser/address-bar/address-bar-rows.ts
  - theia/extensions/chrome-bar/src/browser/address-bar/address-bar.tsx
  - theia/extensions/chrome-bar/src/browser/address-bar/command-centre.ts
  - theia/extensions/chrome-bar/src/browser/chrome-bar-commands.ts
  - theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts
  - theia/extensions/chrome-bar/src/browser/chrome-bar-frontend-module.ts
  - theia/extensions/chrome-bar/src/browser/chrome-bar-keybindings.ts
  - theia/extensions/chrome-bar/src/browser/chrome-bar-shortcuts.ts
  - theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx
  - theia/extensions/tab-uris/src/browser/chrome-store-client.ts
findings:
  critical: 1
  warning: 6
  info: 5
  total: 12
status: issues_found
---

# Phase 30: Code Review Report

**Reviewed:** 2026-10-22T23:00:54Z
**Depth:** standard
**Files Reviewed:** 24
**Status:** issues_found

## Summary

Scope: `git diff ae63acb..HEAD` (HEAD `d911f55`), excluding `.planning/`. I read the six 30-0N
summaries and `deferred-items.md` first. I read every source file in scope in full, with two
exceptions. `chrome-bar.css` was left out because it is styling only. `verify-address-bar-live.mjs`
(1941 added lines) was read for the Phase 30 scenarios, its recorders and their plants (modes,
local modes, Command centre, privacy, go-to, address keys); the Phase 29 scenarios that were only
re-pointed were not re-read. I checked each finding against the source and its callers, and I
checked Theia's own quick-access registry and keybindings in `node_modules`.

What holds up:
- `MODE_SENDS` controls every request inside `runQuery`.
- The mode switches I traced (pick, cycle, token, focusAddress, tab change) all bump `querySeq`
  or close the dropdown, so late replies are dropped.
- The new Places reader keeps the walls of `searchPlaces`.
- `searchPlaces` is not in `TAB_STORE_RELAY_KINDS`, so the backend cannot ask for the new
  empty-text lists.
- The privacy recorder wraps the singleton `ChromeStoreClient.request` and has a working positive
  control.
- I found no internal identifier in the new copy.

The main gap: D-26 was enforced, and proved, only for typing and plain Enter. Ctrl+Enter in
Command centre still sends the typed text to chrome's resolve and loads `www.<text>.com`, and
no static or live check covers that path. The classifier also sends two common file-search
shapes in Command centre (`Makefile:12`, `src/`) to a highlighted Go-to row. The deferred
canGoBack item is assessed in WR-05.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: Ctrl+Enter in Command centre sends the typed text to chrome's resolve and navigates

**File:** `theia/extensions/chrome-bar/src/browser/address-bar/address-bar.tsx:1609-1615` (the D-26 guard it bypasses is at 1636-1646)
**Issue:** In `onInputKeyDown`'s Enter branch, the Ctrl/Cmd+Enter canonize branch runs before the
Command centre guard. Every single-word text that `isCanonizable` accepts (no dot, colon or
space: `readme`, `utils`, `main`) goes to `commitText(typed, { canonize: true })`.
`commitText` then calls `store.resolveTypedAddress(text, …, true, false)`. Chrome canonizes the
text to `https://www.readme.com/`, and `openCommittedUrl` loads it. In Coding the current
widget is usually an editor, so `navigateWebTab` opens a new web tab on that site.

Failure scenario: in Coding the pill starts in Command centre. The user types `readme` and
presses Ctrl+Enter, which is VS Code's "open to the side" habit in quick open. The typed word
goes to chrome, a DNS lookup and an HTTPS request go out for `www.readme.com`, and the
highlighted README.md pick is ignored.

This breaks the D-26 rule the phase states ("Command centre never sends its text to chrome's
resolve", 30-04 decision 4 and summary). No gate catches it (see WR-04). Theia binds
`ctrlcmd+enter` only under `scmFocus` and chat contexts, so the key reaches the pill. The Phase
29 BAR-13 live test already proves the same path works in Address mode.
**Fix:** Check for Command centre before the canonize branch, and let a highlighted row win:
```tsx
const highlighted = this.dropdownOpen ? this.rows.find(row => row.key === this.highlightKey) : undefined;
const centre = this.commandCentre();
if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && !centre && isCanonizable(typed.trim())) {
    void this.commitText(typed, { canonize: true });
    return;
}
```
Then add Ctrl+Enter, with `readme` as the text, to the `command-centre-privacy` live scenario
and to static case 7 (see WR-04).

## Warnings

### WR-01: `classifyAddress` makes `Makefile:12` and `src/` a highlighted first-row Go-to in Command centre

**File:** `theia/extensions/chrome-bar/src/browser/address-bar/address-bar-rows.ts:160-161`, used at `address-bar.tsx:473-481`
**Issue:** Two rules return `url` for common file-search text:
- The undotted `host:port` rule `/^[^./:]+:\d{1,5}(\/.*)?$/` also matches extensionless files
  with a line number: `Makefile:12`, `Dockerfile:3`, `LICENSE:1`. That is the same `file:line`
  form 30-RESEARCH A3 cited as the reason dotted names are ambiguous.
- The trailing-slash rule `/\/$/` matches folder filters such as `src/` and `theia/extensions/`.

`runLocalQuery` puts a `url` Go-to row first and highlights it, above the file picks. Enter then
runs `commitText(text, { visitOnly: true })`, and chrome's fixup turns `makefile:12` or `src/`
into an `http://` visit.

Failure scenario: in Coding the user types `Makefile:12` and presses Enter. A web tab opens on
`http://makefile:12/`, which sends a DNS lookup for the file name, and the file is not opened.
The rows gate pins `devbox:3000` and `x/` as `url`, so this behaviour is locked in.
**Fix:** In Command centre, class these shapes as `ambiguous`: picks first, Go-to after them, no
default highlight. Either pass the mode into the classifier, or demote a `url` result in
`gotoRowFor` when the mode is Command centre and the text matches
`/^[^./:]+:\d+$/` or `/^[^:]*\/$/` with no scheme. Add `Makefile:12` and `src/` cases to
`verify-address-bar-rows.mjs`. D-29 lists `host:port` and the trailing `/` without this
exception, so Chris needs to rule on the change.

### WR-02: Enter in a local mode commits the typed text when no row is highlighted, including a web search from Actions

**File:** `theia/extensions/chrome-bar/src/browser/address-bar/address-bar.tsx:1636-1647`
**Issue:** Only Command centre has a guard for "no highlighted row". In Tabs, Bookmarks, History
and Actions, Enter with no highlighted row reaches `commitTyped()`, which calls
`commitText(inputValue)` and so `resolveTypedAddress` with the default engine. That happens in
two cases:
1. The text was typed, and Enter pressed, inside the 150ms `debouncedLocalQuery` window.
2. In Actions, the list matched nothing. Actions has no search row and no Go-to row, so
   `highlightKey` stays undefined.

Failure scenarios:
- In Tabs, the user types `gmail` quickly and presses Enter. The current tab loads a web search
  for "gmail" instead of switching to the open Gmail tab.
- In Actions, the user types `relaod`. The list shows "No matching actions. Press Esc to go
  back.", and Enter searches the web for `relaod`.

Both cases contradict `MODE_SENDS` (`resolve: false` for these modes) and the UI-SPEC's
"Actions has no search row".
**Fix:** In the Enter branch, when `this.localMode()` is set and `this.queryText()` is not
empty, never fall through to `commitTyped`. Choose the locally computed default row instead:
`gotoRowFor(local, text)` when its `first` is true, else `searchRowFor(text)` for modes with
`searchRow`, else do nothing (Actions). Keep `commitTyped` for the unedited zero-query case,
which reloads the page. Add a live step: in Actions, type no-match text, press Enter, and
require no GET on the engine paths.

### WR-03: The chip's x or Backspace in an empty pill leaves the old mode's list open in Address mode

**File:** `theia/extensions/chrome-bar/src/browser/address-bar/address-bar.tsx:2481-2487` (via `onModeReset` 2274-2278 and the Backspace branch 1657-1662)
**Issue:** `requery()` calls `textEdited` only when there is text or the new mode is a local
mode. Otherwise it calls only `update()`. `pickMode` clears the text when it equals the page
address. So in Browsing, a picked Bookmarks or History mode usually has an empty pill showing
its zero-query list. The x (or Backspace at caret 0) then sets the mode to `address`, and
`requery()` leaves `dropdownOpen`, `rows` and `localMessage` unchanged.

Failure scenario: Browsing, pick Bookmarks from the menu, then click the x. The mode button
shows Address, but the dropdown still lists bookmarks with "No bookmarks yet…" or the bookmark
rows. A local query still in flight (`provide` pending) also lands, because nothing bumped
`querySeq`. The D-14 live check passes only because it runs in Coding, where the default
(Command centre) is a local mode and is re-listed.
**Fix:**
```ts
protected requery(): void {
    this.textEdited(this.inputValue, false);
}
```
`textEdited` already closes the dropdown for empty text in a resolving mode, and it bumps
`querySeq`. Add a Browsing variant of the D-14 Backspace step to `mode-defaults`.

### WR-04: The D-26 proof covers typing only, so CR-01 passes every gate

**File:** `scripts/verify-address-bar-modes.mjs:218-230`, `scripts/verify-address-bar-live.mjs:3589-3605`
**Issue:** The static and live checks do not cover the commit paths:
- Static case 8 checks that `command-centre.ts` names no store client. That file never handled
  keys. Every route from Command centre text to chrome is in `address-bar.tsx`
  (`onInputKeyDown` → `commitText`, `urlForRow`, `openRowInNewTab`).
- Case 7 pins only the first statement of `runQuery`.
- The live `command-centre-privacy` scenario types three strings and waits. It never presses
  Enter, Alt+Enter or Ctrl+Enter.

So the static gate certifies a file that was never the risk, and the commit-time leak in CR-01
stays green on `--quick` and on the full live run. This is the "check that cannot fail" pattern
for the path that matters.
**Fix:**
- Live: after typing in each silent mode, press Enter, Alt+Enter and Ctrl+Enter with plain-word
  text (`readme`). Assert that the recorder records no `resolveTypedAddress` and that the engine
  paths see no GET.
- Static: assert that every `commitText(`/`urlForRow(` call reachable from `onInputKeyDown`
  comes after the `commandCentre()` check (derive this from the method body), with a plant that
  moves the canonize branch above the guard.

### WR-05: Deferred item — a fresh tab reports canGoBack after Browsing → Organising → Browsing (product defect, chrome-side, now unchecked)

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:3364-3372` (first load), `:3398` (the flag pushed); test adaptation at `scripts/verify-address-bar-live.mjs:3041-3045`
**Issue:** This is a product defect, not an instrument artifact:
- The probe in `categoryLabels` reads `owner.canGoBack` on the current title's own
  `WebTabWidget`.
- That field is set only by `applyState` from a chrome push routed by `tabId`
  (`web-tab.ts:670`, `:245`).
- Tab ids are unique per session (`wt-<session>-<++n>`, `web-tab.ts:791`), and the probe does
  not use the module-level `currentWebTab()`.

So chrome's `browser.canGoBack` for that overlay is true, meaning its session history has an
entry before `/lm-act`. No Phase 30 code navigates or touches history. `uiModeChanged` only
resets the pill mode, and the mode round trip changes only timing. The likely locus is
`webTabOpen`: it appends the overlay and calls `webTabNavigate` synchronously
(`fixupAndLoadURIString`). `restoreWebTabHistory`'s own comment (around 822-830) records that a
fresh overlay commits its initial `about:blank` into session history "a few ms after it is
created". If that commit lands as a real entry before the first load commits, the page becomes
entry 2.

User-visible effect:
- Back is enabled on a one-page tab, and Back goes to `about:blank`, the empty "New Tab" state.
- The NAV-03 history menu lists an extra entry.
- NG-034 saves a two-entry history.

**Not confirmed live.** I did not run the browser. Phase 30 also removed the only assertion
that would catch this: Back was replaced by Forward as the disabled control, so the defect has
no red check anywhere.
**Fix:** Run the next step recorded in `deferred-items.md`. After `search,mode-lifetime`, open a
tab and read `overlayOf(tabId).browsingContext.sessionHistory.count` and entry 0's URL in chrome
scope. If entry 0 is `about:blank`, issue the first load with
`LOAD_FLAGS_REPLACE_HISTORY` (or wait for the initial commit, as `restoreWebTabHistory` does)
in `webTabOpen`. Then restore a live assertion that a freshly opened one-page tab has
`canGoBack === false`, in the web-tab suite where it belongs.

### WR-06: The alias read in `listSearchEngines` has no INTERNAL-APIS row

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:4447`; catalogue `powerbrowser/INTERNAL-APIS.md:167`
**Issue:** 30-05 adds a read of Gecko's `engine.aliases` (nsISearchEngine), sent to the frame
with the 8 × 64 limits. INTERNAL-APIS has no row or prose for `listSearchEngines`, `aliases`
or those limits. The `searchLazy` row at :167 names `barEngines`, `barEngine`,
`resolveTypedAddress` and `searchSuggestions` only. The commit message and the summary say the
"catalogue lines [were] re-pointed", but that was only line renumbering by `--fix`.

CLAUDE.md rule 2 requires every Firefox touchpoint to be catalogued. The boundary script cannot
see this read because `engine.aliases` matches no `FORBIDDEN_PATTERNS` entry. An ESR rebase that
reshapes `aliases` (Gecko had a singular `alias` before) would silently empty the
`@alias`/token feature through the `Array.isArray` fallback, with no catalogue row to point at
the dependency. The same gap already exists for `engine.name`/`getIconURL` (Phase 29).
**Fix:** Add a row for `listSearchEngines` (`engine.getIconURL`, `engine.aliases`) under the
`searchLazy` block. Name the bounds (at most 8 aliases of at most 64 characters, icon
`data:image/` of at most 65536 characters), and state that a missing or renamed `aliases`
yields `[]`.

## Info

### IN-01: A user keyword alias without `@` can never be typed as a token

**File:** `theia/extensions/chrome-bar/src/browser/address-bar/address-bar-mode-table.ts:128-131`
**Issue:** `tokenise` needs the token to start with `@` and compares it, `@` included, with the
stored alias. Gecko's internal aliases include the `@` (`@google`). A user-set keyword
(`_metaData.alias`, such as `g`) does not, so `@g x` never matches. That engine is reachable only
through the bare `@` list.
**Fix:** Also compare `folded.slice(1)` with aliases that do not start with `@`, or record the
limitation in the UI-SPEC.

### IN-02: The restricted Places SQL counts tag entries as bookmarks and lists hidden history pages

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:4670-4690`
**Issue:**
- Tag entries are `moz_bookmarks` rows with an `fk` and are not filtered. A page that is only
  tagged counts as a bookmark, and tagging an old bookmark moves it to the top through
  `MAX(b.dateAdded)`.
- History does not filter `h.hidden = 0`, so redirect-source URLs appear.

`searchPlaces` has the same behaviour, so the two are consistent.
**Fix:** Join out tag folders (`b.parent NOT IN (SELECT id FROM moz_bookmarks WHERE parent = <tags root>)`) and add `AND h.hidden = 0` to the history arm. Update the INTERNAL-APIS prose to match.

### IN-03: Ctrl+Down from Command centre re-sends the typed text to the resolve, suggestions and autofill

**File:** `theia/extensions/chrome-bar/src/browser/address-bar/address-bar.tsx:2468-2478`
**Issue:** Command centre is last in `cycleOrder`, so one Ctrl+Down wraps to Address. With the
list open, `requery()` then sends the Command-centre text (a file or symbol name) to chrome and
to the engine's suggest endpoint. This follows Firefox's re-query on a search-mode change and is
an explicit mode change. It is still a one-keystroke route from Command-centre text to an
engine.
**Fix:** When leaving Command centre by cycling, keep the text but leave the list closed (do not
requery). Alternatively, ask Chris to record this as accepted under D-26.

### IN-04: The `address-keys` editor control has no positive that the key reached the editor

**File:** `scripts/verify-address-bar-live.mjs:4220-4228`
**Issue:** The check asserts only that the pill did not take focus or change mode after Ctrl+L
or Alt+D in the README.md editor. A press that reached nothing would also pass. `mode-keys` does
this better: its line swap is a positive.
**Fix:** Also assert Monaco's effect of Ctrl+L, which expands the selection to the whole line,
on the editor's selection.

### IN-05: The Command centre placeholder names a key that does something else in the pill

**File:** `theia/extensions/chrome-bar/src/browser/address-bar/command-centre.ts:373-375`
**Issue:** The file provider's placeholder includes "(Press Ctrl+P to show/hide excluded
files)". In the pill, Ctrl+P opens Theia's stock picker instead, so the text names an
affordance that does not exist on screen. This is already flagged for Chris at verify-work
(30-06 summary). It is listed here because it falls under the user-facing copy rule.
**Fix:** Strip the runtime suffix from the placeholder in `placeholder()`, or bind the toggle
in the pill.

---

_Reviewed: 2026-10-22T23:00:54Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
