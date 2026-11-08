---
phase: 29-address-bar-search-and-fixup
reviewed: 2026-10-21
depth: standard
files_reviewed: 12
files_reviewed_list:
  - powerbrowser/shell/PowerBrowserAPI.sys.mjs
  - theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx
  - theia/extensions/chrome-bar/src/browser/address-bar-rows.ts
  - theia/extensions/chrome-bar/src/browser/chrome-bar-places-suggestions.ts
  - scripts/verify-chrome-bar-suggestions.mjs
  - scripts/verify-address-bar-live.mjs
  - scripts/verify-token-cookie-strip.mjs
  - scripts/verify-web-tab-bridge.mjs
  - scripts/verify-search-engines-packaged.mjs
  - scripts/verify-search-engines.mjs
  - scripts/verify-platform.sh
  - scripts/verify-shell-error-copy.mjs
findings:
  critical: 0
  warning: 12
  info: 16
  total: 28
status: issues_found
---

# Phase 29: Code Review Report

**Depth:** standard
**Status:** issues_found (12 warnings, 16 info, no critical)

## Summary

Three areas were reviewed: chrome (PowerBrowserAPI.sys.mjs), frontend (chrome-bar extension) and checks (scripts/). Every finding below was confirmed against source in a verification pass; some were regraded there, and the grade shown is the verified one.

IDs are renumbered for this report because the area reviewers' IDs collided (two WR-01s, for example). Each finding names its reviewer ID. Two reviewer findings described the same hole in the privileged store-kind fence (chrome WR-29-02 and checks WR-06) and are merged into IN-02, so the total is 28, not 29.

Pre-triaged SEC-29-A (in 29-REVIEW-INPUT.md) is refuted: the SearchSuggestEnabled policy is already honoured upstream. See IN-01.

## Critical

None.

## Warning

### WR-01: autofillOrigin removes www. when the typed text is a prefix of www., so "w", "ww" and "www" never autofill

**Reviewer ID:** WR-29-01 (chrome)
**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:4533`
**Issue:** hostPattern `${typed}%` matches www.example.com directly for "w"/"ww"/"www", but the strip rule `host.startsWith("www.") && !typed.startsWith("www.")` still fires, so the completion becomes "example.com/". autofillSplice (address-bar-rows.ts:104) returns null because the completion does not start with the typed text. LIMIT 1 discards other candidates such as wikipedia.org.
**Scenario:** Type "ww" with www.example.com as the top-frecency w* origin: nothing autofills. Firefox completes to "www.example.com/".
**Fix:** `const shown = host.startsWith(typed) ? host : host.slice(4);`

### WR-02: current() guard does not reject replies for an older prefix after a new keystroke

**Reviewer ID:** WR-02 (frontend)
**File:** `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx:845`
**Issue:** current() is `dropdownArmed && querySeq === seq`. textEdited() (1093) clears rows and re-arms but does not bump querySeq; only runQuery does, after the 150 ms debounce.
**Scenario:** Type "ab", then "c" 100 ms later. The "ab" resolve/places/suggest replies land in the debounce window, pass current(), and refill the emptied dropdown with "ab" rows under a pill reading "abc". The user can commit a stale engine row. A stale reply can also reopen the dropdown during an open IME composition.
**Fix:** Add `this.querySeq += 1;` in textEdited before the early returns and before scheduling debouncedQuery.

### WR-03: closeDropdown keeps stale rows, which come back when a failure flag clears

**Reviewer ID:** WR-03 (frontend)
**File:** `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx:820`
**Issue:** closeDropdown clears engineRows but not rows, heuristic or placeRows; only textEdited resets them.
**Scenario:** (1) Enter on "javascript:x" shows the failure row; a later state push runs syncAddressFromWidget, clears commitFailed/noSearch without closing, and dropdownBody renders the old rows under the page URL (a blocking layer over the overlay). (2) Type "git", Esc, then a failed Paste opens the dropdown; ArrowDown passes the `rows.length === 0` guard on hidden stale rows and Enter (not caught for pasteFailed) navigates to a history row the user never saw. Alt+Enter is affected the same way.
**Fix:** In closeDropdown also set `this.rows = []; this.heuristic = null; this.placeRows = [];`. In syncAddressFromWidget, close the dropdown when it clears commitFailed or noSearch.

### WR-04: Shift+Delete success reopens the dropdown after the user closed it or committed

**Reviewer ID:** WR-04 (frontend)
**File:** `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx:1527`
**Issue:** removeHighlightedRow awaits removeHistoryEntry, then calls showComposedRows(this.querySeq) with no armed/sequence check; the seq is read after the await, so it always matches. showComposedRows sets dropdownOpen=true.
**Scenario:** Shift+Delete a history row, then Enter, Esc or click into the page before the removal resolves: the dropdown reopens over the committed page (the 14.1-03 blocking-layer bug).
**Fix:** `const seq = this.querySeq;` before the await; afterwards return when `!this.dropdownArmed || this.querySeq !== seq`.

### WR-05: "Press Enter to try again" retries the current page, not the failed drop or new-tab open

**Reviewer ID:** WR-05 (frontend)
**File:** `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx:1449`
**Issue:** The retry runs commitText(this.inputValue), but openRowInNewTab (1328-1346) and the late onPillDrop failure (578) reset inputValue to committedAddress before failing. runOneOff's no-ref openCommittedUrl path has the same shape.
**Scenario:** Alt+Enter a row, openInBackground throws, the failure row appears; Enter navigates the current tab to its own URL, losing page state, and never retries the requested address. With committedAddress '' Enter does nothing.
**Fix:** Store the failed action (e.g. `this.retry = () => this.openRowInNewTab(row, foreground)` or the drop's resolved URL) and have the Enter branch call it when set; fall back to commitText(inputValue) only for typed commits.

### WR-06: Store tab rows fill the 5-row cap and are then dropped, hiding history and bookmark matches

**Reviewer ID:** WR-06 (frontend)
**File:** `theia/extensions/chrome-bar/src/browser/chrome-bar-places-suggestions.ts:46`
**Issue:** searchByPrefix puts tab rows first (including stock-window tabs from tab-query-service.ts:238), dedups places rows against them, then caps at 5. placeRowsOf (chrome-bar-widget.tsx:1004-1011) later drops tab rows with no live in-shell WebTabWidget, and nothing refills the slots.
**Scenario:** Three stock-window tabs match "git": three of five slots vanish, only two history/bookmark rows show, and any history row sharing a URL with one of those tabs is lost entirely.
**Fix:** Filter tab rows to the live in-shell set before dedup and cap, or have the widget request CHROME_SUGGESTION_LIMIT rows and apply PLACE_ROW_LIMIT after placeRowsOf.

### WR-07: One-off engine refuses URL-shaped text with a misleading "can't search right now" row

**Reviewer ID:** WR-07 (frontend)
**File:** `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx:1579`
**Issue:** The strip shows for any non-empty text (oneOffEngines, 1539), but runOneOff sends it through resolveTypedAddress, which returns kind 'visit' for URL-shaped text and ignores the engine. runOneOff then shows CHROME_BAR_COPY.noSearch. 29-UI-SPEC BAR-05 says a click searches the text with that engine.
**Scenario:** Type "github.com", click a one-off: "PowerBrowser can't search right now..." although the engine works. With target 'current', Enter then visits github.com with the default path instead of searching.
**Fix:** Add a chrome-side `forceSearch` option to resolveTypedAddress that skips fixup and calls engine.getSubmission(text) after the existing http(s)/postData checks; update the INTERNAL-APIS.md row. Otherwise hide or disable the strip when the heuristic is a visit.

### WR-08: Dragging selected text inside the pill navigates the current tab

**Reviewer ID:** WR-08 (frontend)
**File:** `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx:553`
**Issue:** Drag events from the input bubble to the pill's onDropTargetDragOver/onPillDrop (2062-2067). An in-field selection drag carries text/plain, is accepted, preventDefault cancels the native move, and the fragment is resolved and opened.
**Scenario:** Type "best pizza near me", drag "pizza" to reorder: the tab navigates to a search for "pizza" and the edit is lost.
**Fix:** Set a flag on the input's dragstart, clear it on dragend; while set, the pill handlers return without preventDefault.

### WR-09: Right-click and other mouse buttons on a suggestion row commit it

**Reviewer ID:** WR-09 (frontend)
**File:** `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx:1965`
**Issue:** onMouseDown routes button 1 and Ctrl/Meta+button 0 to openRowInNewTab; every other button falls to `else chooseRow(row)`. The behaviour predates Phase 29, but Phase 29 rewrote this handler.
**Scenario:** Right-click (button 2) or a side button (3/4) on a history row navigates the current tab; on an open-tab row it switches tabs.
**Fix:** `else if (e.button === 0) void this.chooseRow(row);` and ignore other buttons.

### WR-10: Ctrl+Enter cannot canonize a bare name that autofill has completed

**Reviewer ID:** WR-10 (frontend)
**File:** `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx:1444`
**Issue:** isCanonizable tests this.inputValue, which holds the autofilled value; the dot fails the regex (address-bar-rows.ts:118) and control falls through to commitTyped.
**Scenario:** With example.com visited, type "exam", Ctrl+Enter: opens https://example.com/ instead of BAR-13's https://www.exam.com/.
**Fix:** When `this.autofill && this.inputValue === this.autofill.value`, use `this.inputValue.slice(0, input.selectionStart ?? undefined)` for both the canonize test and the committed text.

### WR-11: The engine-host ban is a hand-kept list that omits the configured engines, and its pattern misses the shipped Wikipedia template

**Reviewer ID:** WR-01 (checks)
**File:** `scripts/verify-chrome-bar-suggestions.mjs:394`
**Issue:** ENGINE_HOSTS (394-405) is frozen and lacks wikipedia.org, the second engine in configuration.toml. SEARCH_QUERY_PATTERN `/[?&](q|query)=|search\?/` is case-sensitive and returns false for `https://en.wikipedia.org/wiki/Special:Search?search=${text}`. The ban messages (449, 453) still say search dispatch is deferred to GUI-02, which Phase 29 made false. The hand-kept list breaks the CLAUDE.md "derive from the tree" rule.
**Scenario:** Hardcoding the Wikipedia template in chrome-bar-widget.tsx, bypassing resolveTypedAddress and the policy engine, keeps the check green.
**Fix:** Derive banned hosts at check time from resolveConfig().config.search_engines (url and suggest_url hosts) plus upstream search-config-v2.json when present; use `/[?&](q|query|search)=|search\?/i`; add a self-test plant that hardcodes the first configured engine's template; update the messages to name resolveTypedAddress.

### WR-12: Neither the static nor the live token-cookie check covers the overlay branch or the header filter

**Reviewer ID:** WR-04 (checks)
**File:** `scripts/verify-token-cookie-strip.mjs:103`
**Issue:** The static gate matches only `channel.URI.port !== groupSenderPort`; it never inspects the browsing-context branch (PowerBrowserAPI.sys.mjs:4561), the principal branch (4564) or the `${TOKEN_COOKIE_NAME}=` filter (4584). All four live COOKIE_LOADS (verify-address-bar-live.mjs:401-406) target the served port, where tokenCookieAllowed returns false before the overlay branch runs.
**Scenario:** Replacing line 4561 with `return true` keeps both checks green; a web tab opened on `http://127.0.0.1:<sidecarPort>/` would then receive the token cookie. A filter matching nothing is caught only by the live plant, not by `--quick`.
**Fix:** Static: require `tabIdOfBrowser(` compared `=== null` in the browsing-context branch and the `${TOKEN_COOKIE_NAME}=` filter in observe, each with a self-test plant. Live: add a web-tab load of `http://127.0.0.1:<sidecarPort>/powerbrowser/health` that must arrive without the token (token gate 401/403), with the Theia frame's credentialed 200 as control.

## Info

### IN-01: Pre-triaged SEC-29-A is not present: the SearchSuggestEnabled policy is already honoured

**Reviewer ID:** SEC-29-A (chrome)
**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:4498`
**Issue:** SEC-29-A claims searchSuggestions() bypasses SearchSuggestEnabled:false. upstream SearchSuggestionController.sys.mjs:23 defines lazy.suggestionsEnabled as a live getter on browser.search.suggest.enabled, and fetch() (337-344) calls #fetchRemote only when it is true. The policy (Policies.sys.mjs:3191-3195) locks that pref. No patch touches the controller.
**Scenario:** With the policy false, controller.fetch makes no remote request and searchSuggestions returns [] whatever the Theia setting says.
**Fix:** No product change. Close SEC-29-A in 29-REVIEW-INPUT.md as refuted, citing SearchSuggestionController.sys.mjs:339. Optional: a live plant that locks the pref false and requires zero suggest requests, to catch an upstream rebase that drops the gate.

### IN-02: The privileged store-kind caller fence scans two directories and only matches `.kind(` calls

**Reviewer IDs:** WR-29-02 (chrome), WR-06 (checks), merged
**File:** `scripts/verify-web-tab-bridge.mjs:492` (readSources at 503)
**Issue:** readSources reads six named files plus top-level .ts/.tsx in chrome-bar/src/browser and tab-uris/src/browser; modes, customize, branding, telemetry and subdirectories are never read. checkStoreKinds matches only `.readClipboardText(` / `.removeHistoryEntry(`. ChromeStoreClient.request(msg) is public (chrome-store-client.ts:109), and GROUP_REQUEST_EVENT can be dispatched directly. INTERNAL-APIS.md (39-41) says privileged kinds run only from chrome-bar-widget.tsx.
**Scenario:** `store.request({ kind: 'readClipboardText' })` in any chrome-bar file, or a direct client call from theia/extensions/modes, passes the gate. No current code does this.
**Fix:** Scan `theia/extensions/*/src/**/*.ts(x)` recursively; fail on any `'<privilegedKind>'` / `"<privilegedKind>"` literal outside chrome-store-client.ts; add one self-test plant per hole, each required to go red naming the file.

### IN-03: The token-cookie strip keeps the token for any non-overlay context on the sidecar port, wider than its comment says

**Reviewer ID:** IN-29-01 (chrome)
**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:4561`
**Issue:** The comment (4541-4543) says the token is kept only for the Theia frame, chrome or a Theia-origin worker. The code keeps it whenever `tabIdOfBrowser(bc.top.embedderElement) === null`, which includes GUI-01 stock-window tabs and overlay-opened popups, and never checks the triggering principal's hostPort when a browsing context exists.
**Scenario:** A page from 127.0.0.1:5173 in a stock window sends requests to 127.0.0.1:<sidecar> with the token attached. WsOriginValidator and the upload connectionValidator reject a cross-port Origin, so no exploit route was found.
**Fix:** Narrow to the shell content browser (compare embedderElement.id with SHELL_CONTENT_BROWSER_ID, as groupSenderIsTheia does) and require the triggering principal's hostPort to be the sidecar's, with a live plant; or correct the comment to the overlay-only rule.

### IN-04: "Typed text is never logged" holds only while browser.search.log is off

**Reviewer ID:** IN-29-02 (chrome)
**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:4477`
**Issue:** Upstream SearchSuggestionController.fetch (290-292) debug-logs the searchString when SearchUtils.loggingEnabled (browser.search.log, default false) is true. Nothing in the tree locks that pref.
**Scenario:** A user turns on search logging in about:config; every typed search string appears in the local browser console.
**Fix:** Reword the comment to cover only this module's own log lines, or lock browser.search.log false and pin it with a check row.

### IN-05: Typed text goes to the default engine while the engine list is missing

**Reviewer ID:** WR-01 (frontend), regraded from warning
**File:** `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx:358`
**Issue:** engineNameForRequest() returns the chosen engine only when this.engineList contains it. engineList is undefined until the first listSearchEngines reply, and refreshEngines' catch (339-344) sets it to undefined on any failure; refresh runs on every pill focus (1659). The fallback for an unlisted name is deliberate (29-04-PLAN line 116), but a transiently missing list was not intended.
**Scenario:** User chose DuckDuckGo; a focus-time refresh times out; typed text and suggest keystrokes go to the Gecko default engine.
**Fix:** Keep the last good engineList in the catch. Send the chosen name whenever it is set; chrome already answers no-engine for an unknown name (barEngine, PowerBrowserAPI.sys.mjs:4353). Keep the list check only for the placeholder and the one-off strip.

### IN-06: nextHighlight skips the first row when no highlight is set

**Reviewer ID:** IN-01 (frontend)
**File:** `theia/extensions/chrome-bar/src/browser/address-bar-rows.ts:66`
**Issue:** `Math.max(current === undefined ? -1 : keys.indexOf(current), 0)` maps absent and unknown keys to 0, so step +1 lands on keys[1].
**Scenario:** Places rows arrive before the resolve; showComposedRows sets highlightKey to HEURISTIC_KEY, which is not in the list; ArrowDown skips the first places row until the heuristic arrives.
**Fix:** `const at = current === undefined ? -1 : keys.indexOf(current); const from = at < 0 ? (step === 1 ? -1 : 0) : at;` and update the verify-address-bar-rows.mjs case that expects the current behaviour.

### IN-07: Switch to Tab is offered for the tab that is already current

**Reviewer ID:** IN-02 (frontend)
**File:** `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx:1009`
**Issue:** placeRowsOf keeps any live web tab with a matching URL, including currentWebTab(); the matching history row was already deduped away. liveTabFor's find() can also return the current tab when another tab shares the URL.
**Scenario:** Typing part of the current page's address shows "Switch to Tab"; choosing it discards the text and only focuses the page. Firefox excludes the current tab.
**Fix:** Exclude currentWebTab() from the `open` set in placeRowsOf and from liveTabFor.

### IN-08: The listbox contains buttons and unlabelled message divs, and aria-activedescendant can point at a button

**Reviewer ID:** IN-03 (frontend)
**File:** `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx:1893`
**Issue:** role='listbox' wraps the one-off `<button>`s (1614-1644), the footer and the message rows. With a one-off highlighted, aria-activedescendant (2078) names a button id.
**Scenario:** Screen readers announce the highlighted one-off inconsistently or not at all.
**Fix:** Move the strip and footer outside the listbox (siblings in the portal container), or give one-offs role='option' inside role='group'; give message rows role='status' outside the listbox.

### IN-09: The lock icon follows the pill text, so autofill and drafts can show it for an http page

**Reviewer ID:** IN-04 (frontend)
**File:** `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx:1998`
**Issue:** `secure` tests inputValue.startsWith('https://'). Older than Phase 29, but drafts, keepEdit and autofill now put non-page text in the pill.
**Scenario:** Type "https://bank.example" on an http:// tab, switch tabs and back: the restored draft shows the lock while the page is http.
**Fix:** Derive the lock from committedAddress (or the tab's pushed security state, which Phase 30's identity area owns).

### IN-10: A failed one-off background open gives no feedback and loses the typed text

**Reviewer ID:** IN-05 (frontend)
**File:** `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx:1596`
**Issue:** runOneOff resets inputValue before opening; if openInBackground throws, the catch (1596-1599) only calls console.error. openRowInNewTab shows showCommitFailure in the same case.
**Scenario:** A one-off background open fails: no row appears and the typed text is gone.
**Fix:** Call this.showCommitFailure() in that catch, with WR-05's retry target; restoring the typed text also needs that target or an inputValue restore.

### IN-11: Six live scenarios have no planted fault, including the scheme wall and the address-shaped suggestion fence

**Reviewer ID:** WR-02 (checks), regraded from warning
**File:** `scripts/verify-address-bar-live.mjs:2395`
**Issue:** SCENARIOS has 18 entries, PLANTS 12. refused, no-engine, dev-addresses, failure-rows, new-tab-targets and canonize-drop have no plant; the suggestions plant does not exercise the address fence (886-898). Most of these assertions are positive and the absence checks share a mechanism the setting-ignored plant already proves, so the gap is modest.
**Scenario:** A regression in the scheme wall or the chrome-side fence is not proven red by any self-test.
**Fix:** Add plants at least for 'scheme-wall-off' (resolve returns a visit to about:config), 'suggest-fence-off' (frame sends address-shaped text), canonize-drop and new-tab-targets.

### IN-12: A selected scenario that is NOT SCORED exits 0

**Reviewer ID:** WR-03 (checks), regraded from warning
**File:** `scripts/verify-address-bar-live.mjs:2367`
**Issue:** selectedScenarios (2381-2393) does not add CONTROL_OF[n]; report() (2361-2378) does not count NOT SCORED as a failure. The registered gate rows (verify-platform.sh:5032-5033) run without --scenario and are unaffected.
**Scenario:** `node scripts/verify-address-bar-live.mjs --scenario refused` (or no-engine, dev-addresses, select-ime) always exits 0, printing only a NOT SCORED line.
**Fix:** Add CONTROL_OF[n] for every requested n in selectedScenarios; count NOT SCORED as nonzero in report().

### IN-13: The packaged engine check has no --self-test

**Reviewer ID:** IN-01 (checks)
**File:** `scripts/verify-search-engines-packaged.mjs:1`
**Issue:** Registered (verify-platform.sh:4817) with no self-test row, unlike its static sibling. Its assertions are direct equality and prefix comparisons, and neighbouring live packaged checks follow the same no-self-test pattern.
**Scenario:** Nothing proves the check goes red on a leaked Firefox engine, a wrong default or a reply on another host.
**Fix:** Move the comparisons into a pure function and add --self-test over synthetic list/reply fixtures (extra 'Google' engine, wrong defaultName, reply url on another host), each required red.

### IN-14: The PASS line claims fragment and collision agreement when those steps were skipped

**Reviewer ID:** IN-02 (checks)
**File:** `scripts/verify-search-engines.mjs:241`
**Issue:** runChecks skips at 144 (generated/ absent) and 188 (upstream dump absent), but main() always prints the full PASS text, contradicting the header's "never a pass claim" (line 27). Exit code is correct.
**Scenario:** On a fresh clone the check prints two SKIP lines and then "PASS -- tracked key, derived fragment, shipped-name collision and templates agree".
**Fix:** Build the PASS text from the steps that ran, or print `PASS (n step(s) skipped)`.

### IN-15: The address-bar-live registry comment lists 5 scenarios; the script has 18

**Reviewer ID:** IN-06 (checks)
**File:** `scripts/verify-platform.sh:5028`
**Issue:** The comment says "(token-cookie, search, refused, no-engine, dev-addresses so far)". SCENARIOS has 18 keys, PLANTS 12. Documentation only.
**Scenario:** A reader of the registry gets a wrong picture of what the row covers.
**Fix:** Replace the list with a pointer to the script header.

### IN-16: The brand ban's comment blanker also removes string and JSX text after " //"

**Reviewer ID:** IN-07 (checks)
**File:** `scripts/verify-shell-error-copy.mjs:644`
**Issue:** blankComments `/(^|\s)\/\/.*$/gm` strips everything after a whitespace-preceded `//`, including inside strings and JSX text; checkChromeBarBrand (661) tests only the blanked text. No current violation exists.
**Scenario:** `"Help // PowerBrowser"` in chrome-bar copy passes the BAR-14 ban.
**Fix:** Use a tokenizer that skips string, template and JSX text, or test raw lines and exclude only lines starting with `//` or `*`.

## Rejected in verification

- IN-06 (frontend) "Empty engine name produces blank labels and a dangling 'Search with '": kind:'search' always carries String(engine.name) from a non-null engine, and an empty default needs an empty search service; not reachable.
- WR-05 (checks) "No check covers the SearchSuggestEnabled policy, so SEC-29-A is unguarded": the upstream controller already gates the remote fetch on the locked pref (SearchSuggestionController.sys.mjs:23, 336-344); the bypass does not exist (see IN-01).
- IN-03 (checks) "Default-engine setting options checked with includes(), not set equality": the options are built from listSearchEngines(), the same chrome-side source the filter feeds, so the proposed set equality could not catch the described regression; the packaged check already compares exactly.
- IN-04 (checks) "Context-menu scenario overwrites the developer's real clipboard": the live harness runs Gecko --headless, which uses HeadlessClipboard (nsWidgetFactory.cpp:39-40); the system clipboard is never touched. Only the header wording is inaccurate.
- IN-05 (checks) "Row cap, row height and panel cap are hand-kept numbers": they are UI-SPEC contract values acting as the oracle (29-UI-SPEC.md:86, 93, 222, 435), already self-tested; deriving them from the module would compare ROW_LIMIT to itself.
