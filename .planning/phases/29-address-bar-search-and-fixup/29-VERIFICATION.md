---
phase: 29-address-bar-search-and-fixup
verified: 2026-10-22T03:58:17Z
status: human_needed
score: 74/81 must-haves verified
covered_files:
  - .planning/phases/29-address-bar-search-and-fixup/29-01-PLAN.md
  - .planning/phases/29-address-bar-search-and-fixup/29-01-SUMMARY.md
  - .planning/phases/29-address-bar-search-and-fixup/29-02-PLAN.md
  - .planning/phases/29-address-bar-search-and-fixup/29-02-SUMMARY.md
  - .planning/phases/29-address-bar-search-and-fixup/29-03-PLAN.md
  - .planning/phases/29-address-bar-search-and-fixup/29-03-SUMMARY.md
  - .planning/phases/29-address-bar-search-and-fixup/29-04-PLAN.md
  - .planning/phases/29-address-bar-search-and-fixup/29-04-SUMMARY.md
  - .planning/phases/29-address-bar-search-and-fixup/29-05-PLAN.md
  - .planning/phases/29-address-bar-search-and-fixup/29-05-SUMMARY.md
  - .planning/phases/29-address-bar-search-and-fixup/29-06-PLAN.md
  - .planning/phases/29-address-bar-search-and-fixup/29-06-SUMMARY.md
  - .planning/phases/29-address-bar-search-and-fixup/29-07-PLAN.md
  - .planning/phases/29-address-bar-search-and-fixup/29-07-SUMMARY.md
  - .planning/phases/29-address-bar-search-and-fixup/29-08-PLAN.md
  - .planning/phases/29-address-bar-search-and-fixup/29-08-SUMMARY.md
  - .planning/phases/29-address-bar-search-and-fixup/29-09-PLAN.md
  - .planning/phases/29-address-bar-search-and-fixup/29-09-SUMMARY.md
  - .planning/phases/29-address-bar-search-and-fixup/29-10-PLAN.md
  - .planning/phases/29-address-bar-search-and-fixup/29-10-SUMMARY.md
  - configuration.toml
  - docs/REBRANDING.md
  - powerbrowser/INTERNAL-APIS.md
  - powerbrowser/distribution/policies.json
  - powerbrowser/endpoint-allowlist.json
  - powerbrowser/shell/PowerBrowserAPI.sys.mjs
  - scripts/generate.mjs
  - scripts/lib/config-schema.json
  - scripts/lib/pb-live-probe.mjs
  - scripts/verify-address-bar-live.mjs
  - scripts/verify-address-bar-rows.mjs
  - scripts/verify-chrome-bar-suggestions.mjs
  - scripts/verify-nav-keys-live.mjs
  - scripts/verify-platform.sh
  - scripts/verify-search-engines-packaged.mjs
  - scripts/verify-search-engines.mjs
  - scripts/verify-shell-error-copy.mjs
  - scripts/verify-token-cookie-strip.mjs
  - scripts/verify-web-tab-bridge.mjs
  - theia/extensions/chrome-bar/src/browser/address-bar-rows.ts
  - theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts
  - theia/extensions/chrome-bar/src/browser/chrome-bar-places-suggestions.ts
  - theia/extensions/chrome-bar/src/browser/chrome-bar-preferences.ts
  - theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx
  - theia/extensions/chrome-bar/src/browser/chrome-bar.css
  - theia/extensions/tab-uris/src/browser/chrome-store-client.ts
covered_digest: "v3:sha256:b499ec8194977b6669e67b8dccd490add44746acaccd85cd4e6c21705991cc24"
behavior_unverified: 6
overrides_applied: 0
behavior_unverified_items:
  - truth: "Autofill keeps www. when the typed text is a prefix of www.: typing w, ww or www completes to www.example.com/ (REVIEW WR-01, ba7d676)"
    test: "Visit https://www.example.com/ so it is the top w* origin, then type w, then ww, then www in the pill"
    expected: "Each completes inline to www.example.com/ with the completed part selected"
    why_human: "No live scenario seeds a www. origin; 29-REVIEW-FIX.md marks the fix 'requires human verification'. The fix line is present at PowerBrowserAPI.sys.mjs:4543"
  - truth: "A reply for an older prefix never refills the dropdown after a new keystroke (REVIEW WR-02, b0f7b45)"
    test: "Type ab, then c within 150 ms, on a slow engine (or throttle the suggest host)"
    expected: "Only rows for abc appear; no ab row shows under a pill reading abc, and no row reopens the dropdown during an IME composition"
    why_human: "Ordering invariant; the live check does not drive the debounce window. textEdited bumps querySeq first (chrome-bar-widget.tsx:1121)"
  - truth: "Closing the dropdown discards its rows, so a later failure, paste or no-search row never brings stale rows back (REVIEW WR-03, 5bbf53b)"
    test: "Type text so rows show, press Esc, then trigger a failure row (for example Paste & Go with the clipboard read failing)"
    expected: "Only the failure row shows; none of the earlier rows reappear"
    why_human: "Cleanup invariant with no scenario; closeDropdown clears rows, heuristic and placeRows (chrome-bar-widget.tsx:845-857)"
  - truth: "A Shift+Delete that completes after the user closed the dropdown or committed does not reopen it (REVIEW WR-04, 1e714fe)"
    test: "Highlight a history row, press Shift+Delete and immediately press Esc (or Enter) before the removal returns"
    expected: "The dropdown stays closed; the committed page loads undisturbed"
    why_human: "Race between the Places write and the close; the shift-del scenario passes but does not drive the race"
  - truth: "Enter on a failure row repeats the action that failed (dropped link, new-tab open of a row or URL, in-place one-off, foreground and current one-off), not a re-commit of the current page (REVIEW WR-05, b168c92; NEW-01, 8587866)"
    test: "Make each opener fail once (drop, Ctrl+click on a row, Alt+Enter on a one-off, click on a one-off with resolve failing), then press Enter on the failure or no-search row"
    expected: "Enter retries that exact action; the current tab is never reloaded"
    why_human: "Only the background one-off retry is driven live (one-off scenario, plant oneoff-retry-recommits red). The other targets are named 'requires human verification' in 29-REVIEW-FIX.md"
  - truth: "Ctrl+Enter on a bare name that autofill has completed canonizes the typed part (REVIEW WR-10, 2ee0e61)"
    test: "With a visited origin starting 'exa', type exa so autofill completes it, then press Ctrl+Enter"
    expected: "https://www.exa.com/ (the typed part canonized) opens, not the autofilled origin"
    why_human: "canonize-drop does not combine Ctrl+Enter with autofill; the slice is at chrome-bar-widget.tsx:1481"
human_verification:
  - test: "BAR-14 rebrand run (29-VALIDATION Manual-Only): set [identity] display_name in a scratch copy, node scripts/generate.mjs, copy the frontend-config fragment, theia build, run the sidecar on :4000, type javascript:x and Enter; also trigger the no-search and couldn't-load-suggestions rows"
    expected: "Every chrome-bar row names the scratch display name, never PowerBrowser"
    why_human: "applicationName is compiled into the bundle; the live check compares the row with the runtime applicationName of the one build that exists, and the backstop truth needs a second build"
  - test: "Real IME (fcitx or ibus) on KDE Wayland: compose CJK text in the pill, press Enter while composing, then commit and press Enter"
    expected: "No navigation while composing; one search after the commit; Tab, arrows, Esc and Shift+Delete do nothing while composing"
    why_human: "select-ime composes through nsITextInputProcessor at the parent; PROJECT.md counts that as evidence, not UAT. 29-10 also changed textEdited to render synchronously because React's restore ended TIP compositions, so a real IME is the real test of that fix"
  - test: "Real keyboard and mouse in the pill: first click selects all, second places the caret, double-click selects a word; Alt+Enter, Ctrl+Enter, Ctrl+click and middle-click on rows; Shift+Delete on a history row; right-click, the context-menu key and Shift+F10 open the pill menu"
    expected: "Each behaves as the UI-SPEC says and as Firefox does"
    why_human: "Live scenarios use trusted BiDi pointer input and TIP keys at the parent; the context-menu key and Shift+F10 are not driven, and double-click is not checked"
  - test: "Visual: KWin raise + spectacle in Coding, Browsing and Organising: rows (32px, favicon, type marker, Switch to Tab caption), one-off strip wrap with many engines, drop ring on the pill, a long engine name in the placeholder, a short window capping the panel, the shimmer row after 150 ms"
    expected: "Matches 29-UI-SPEC; the caption truncates before the title; the panel scrolls inside the viewport minus 8px"
    why_human: "Visual quality; the live check reads geometry numbers only"
  - test: "Real OS drag onto the pill: a link and plain text from another application, and a selected part of the pill's own text dragged within the field"
    expected: "Link loads, text searches, javascript: shows the failure row, an in-field drag moves text and loads nothing"
    why_human: "canonize-drop synthesises DataTransfer whose data is readable at dragover; a real OS drag hides it until drop"
  - test: "Packaged build after the last commit: run powerbrowser/packaging/package-linux.sh, open Settings, Browser, Default Search Engine; type a word with suggestions on, on the real network"
    expected: "Exactly DuckDuckGo Lite and Wikipedia (plus empty), DuckDuckGo Lite the default; real suggestions from ac.duckduckgo.com appear; choosing Wikipedia renames the placeholder and searches en.wikipedia.org"
    why_human: "search-engines-packaged passed in this session, but against the 15:01 package (before 29-05..29-10 and the review fixes; the engine-list code is unchanged since). Real-network suggestions are never automated"
  - test: "Review fixes marked 'requires human verification' (WR-01, WR-02, WR-03, WR-04, WR-05, WR-10, NEW-01): see behavior_unverified_items"
    expected: "Each expected result holds"
    why_human: "No automated scenario covers them"
  - test: "Autonomous judgment-tier prohibitions (14, listed in the report): unverified-prohibition, human review recommended"
    expected: "Each LLM-judge verdict is confirmed or rejected"
    why_human: "Judgment-tier prohibitions get a non-authoritative LLM verdict only in an autonomous run"
---

# Phase 29: Address Bar Search and Fixup Verification Report

**Phase Goal:** The pill searches typed text, opens development addresses, and handles typing, picking and editing results the way Firefox's address bar does
**Verified:** 2026-10-22T03:58:17Z
**Status:** human_needed
**Re-verification:** No (initial verification)

## Evidence I produced myself (not taken from summaries)

- The Theia bundle `theia/applications/browser/lib/frontend/bundle.js` (20:28:17 local) is newer than every file under `chrome-bar/src` and `tab-uris/src` (last edit 20:26:44, `chrome-bar-widget.tsx`). It contains the NEW-01 code (`showNoSearch(()`), so I did not rebuild. The chrome files reach the objdir through `upstream/powerbrowser -> ../powerbrowser`, and the harness sets `MOZ_PURGE_CACHES=1`, so the live runs executed the committed `PowerBrowserAPI.sys.mjs`.
- `scripts/verify-platform.sh --quick`: **exit 0**, "all checks passed", 146 summary rows PASS, none FAIL or SKIP. Phase rows all green: address-bar-rows (+self-test, 5 plants), gui02-web-tab-bridge (+self-test, 20 plants, store-kind classes and the privileged-kind fences), token-cookie-strip (+self-test, 6 plants), search-engines (+self-test, 4 plants), theia-endpoints (+self-test), shell-error-copy-no-internals (+self-test, including the derived chrome-bar brand ban), gui06-chrome-bar-suggestions (+self-test), internals-boundary, internals-catalogue, ng-040-internals-catalogue-lines, verify-rebranding-docs (43/43 fields), scan-brand-residue (380 files), chrome-bar-typecheck, tab-uris-typecheck.
- `node scripts/verify-address-bar-live.mjs`: **exit 0, 18/18 scenarios PASS** (token-cookie, search, refused, no-engine, dev-addresses, default-engine, rows, failure-rows, suggestions, one-off, switch-to-tab, new-tab-targets, autofill, canonize-drop, shift-del, context-menu, select-ime, drafts), 03:35-03:37Z.
- `node scripts/verify-address-bar-live.mjs --self-test`: **exit 0**. The clean control was green and all **14** plants went red on their target scenario with the expected text: resolve-bypassed, engine-name-dropped, token-strip-off, dedupe-off, setting-ignored, oneoff-default, oneoff-retry-recommits, tab-row-navigates, autofill-on-paste, shift-del-bookmark, paste-reads-on-open, ime-guard-off, draft-lost, pill-drag-navigates. This is the first full self-test after iteration 2 (29-REVIEW-FIX.md says only the new plant was driven then).
- `node scripts/verify-search-engines-packaged.mjs`: **exit 0**, "the packaged bar offers exactly the 2 configured engines, the first as default". The package is `objdir/dist/powerbrowser-153.5.0.en-US.linux-x86_64.tar.xz` from 15:01 local; its `policies.json` is byte-equal to the tracked one (the check's step 1), and `git diff 596cdf9..HEAD` shows no change to `barEngines`, `barEngine` or `listSearchEngines`.
- Regression checks named by 29-01's truths: `node scripts/verify-web-tab-live.mjs` exit 0 (two typed commits including `HTTP://127.0.0.1:.../b` navigated one overlay context). `node scripts/verify-nav-keys-live.mjs`: the first full run was **exit 1** on `hard-reload-click` ("Shift+click on Reload must send a GET carrying no-cache; got null"); that scenario alone passed 3 of 3, and a second full run was **exit 0, 31/31 PASS** (home, home-failure and pill-esc included). The message is the same flake recorded in Phase 27's deferred-items.md ("Intermittent live failures not reproduced (seen in 27-07)"), and Phase 29 changed no Reload code (no `onReloadClick` or `reload(` lines in the phase diff of the widget).
- `gsd-tools verify.artifacts` over all 10 plans: 26/26 artifacts pass. `verify.key-links`: 15/24 pass; the other 9 have a symbol in `from:` and the tool cannot parse them, so I checked each by grep: `setGroupSenderPort` calls `installTokenCookieStrip()` (PowerBrowserAPI.sys.mjs:2212); `manifestEndpointSources` takes `search_engines[i].url` and `.suggest_url` (generate.mjs:2801-2803) and the allowlist carries the three marked rows; `searchSuggestions` calls `resolveTypedAddress` first and returns `[]` unless the kind is search (:4490-4492); the canonize branch reads `Services.locale.urlFixupSuffix` (:4405); `removeHistoryEntry` is called from the Shift+Delete path (widget :1567); `readClipboardText` only from `pasteClipboard` and `pasteAndGo` (:764, :780); `onCurrentWidgetChanged` uses `drafts` (:1787-1809); `onInputKeyDown` returns on `composing(e)` (:1444). All 9 are WIRED.
- `git -C upstream diff` is empty. The phase diff (a57ed5e..HEAD, 26 files outside `.planning/`) touches only `configuration.toml`, `docs/`, `powerbrowser/`, `scripts/` and `theia/extensions/`: no Theia core, no Gecko outside the patch stack.
- No PowerBrowser was running before I started; every instance was launched by a harness and exited.

**Absence-assertion rule (CLAUDE.md).** Every "no request" or "no load" assertion in the scenarios I relied on has a positive control in the same session that the same observer sees: token-cookie requires the probe cookie on every load and the Theia frame's credentialed 200; suggestions requires a GET on /one/suggest for "hel" first; select-ime requires one suggest GET after the composition ends and a push after the post-composition Enter; switch-to-tab requires A's loaded push. The plants token-strip-off, setting-ignored, ime-guard-off and tab-row-navigates turned those checks red in my run, so they are not absence assertions over an emitter the check wrote.

## Goal Achievement

### Roadmap Success Criteria (the contract)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC1 | Words + Enter search the default engine; `localhost`, `localhost:4000`, a `host:port` and an IP open as addresses; Ctrl+Enter completes `name` to `www.name.com`; a dropped link loads and dropped text searches | ✓ VERIFIED | Live: search (one GET on /one/search with q "hello world" plus a push; plant resolve-bypassed red), dev-addresses (localhost, localhost:4000, devbox:3000, 192.168.1.10:8080, [::1]:8080 resolve to http visits of that host and port; 127.0.0.1:port/dev loads), canonize-drop (example to https://www.example.com/; uri-list drop loads /dropped; plain text drop GETs /one/search). Code: `resolveTypedAddress` at PowerBrowserAPI.sys.mjs:4392, fixup then `engineSearch`, then the `^https?$` wall on the result |
| SC2 | Suggestions while typing (on by default, off by a setting); a typed origin autofills and Enter or Tab accepts it; rows show favicons and type icons; a row runs a one-off search with another engine; the default engine can be changed among the configuration.toml engines | ✓ VERIFIED | Live: suggestions (plant setting-ignored red), autofill (plant autofill-on-paste red), rows (data:image favicon, history/bookmark/tab markers; plant dedupe-off red), one-off (plants oneoff-default and oneoff-retry-recommits red), default-engine (plant engine-name-dropped red). Packaged: search-engines-packaged lists exactly DuckDuckGo Lite and Wikipedia, DuckDuckGo Lite first |
| SC3 | Choosing an open-tab result switches without reloading; Alt+Enter, Ctrl+click and middle-click open in a new tab; Shift+Del removes a history row; right-click on the pill offers Cut, Copy, Paste and Paste & Go | ✓ VERIFIED | Live: switch-to-tab (no loading push for A or B, no new GET; plant tab-row-navigates red), new-tab-targets (Alt+Enter foreground, Ctrl+mousedown and middle-button background, each directly after the current tab), shift-del (history.fetch null; bookmark row keeps its visits; plant shift-del-bookmark red), context-menu (Cut, Copy, Paste, Paste & Go, separator, Select All; plant paste-reads-on-open red) |
| SC4 | The first click selects the whole address, IME composition never commits early, and unsubmitted text survives a switch to another tab and back | ✓ VERIFIED (synthesised input) | Live: select-ime (trusted BiDi click selects all, second click collapses, drag selects 0..middle; TIP composition of かな: Enter gives no push and no GET in 1500 ms; plant ime-guard-off red), drafts (restored with caret at end, no dropdown, pill not focused; survives the tab's own navigation; plant draft-lost red). Real IME and real mouse are human items |
| SC5 | Every chrome-bar message names the configured application name: a sidecar run with a different configured name shows that name, and no chrome-bar source carries a brand literal | ⚠️ PARTIAL, human needed (not counted) | Brand-literal half ✓: shell-error-copy-no-internals derives `identity.display_name` through `resolveConfig` and bans it from every chrome-bar .ts/.tsx/.css (self-test plants "spells the product name as a literal" and "configured name inside a string" red). Mechanism ✓: `appSubject()` reads `FrontendApplicationConfigProvider.get().applicationName` (chrome-bar-copy.ts:40-42); failure-rows, no-engine, shift-del and context-menu compare each row with the runtime `applicationName` (`appNameExpr`). The different-name run is a `verification: backstop` truth (29-05) and needs a second Theia build; it has not been done, so this abstains (insufficient_spec) |

### Plan must-have truths (merged; roadmap wording kept where a plan truth restates an SC)

| Plan | Truths | Status | Evidence |
|------|--------|--------|----------|
| 29-01 | 7 (search end to end, one resolve kind, no scheme regression, refused schemes, no-engine row, home failure unchanged, registry rows) | 7/7 ✓ | search, refused, no-engine; verify-web-tab-live green (HTTP:// upper-case commit); nav-keys-live home, home-failure, pill-esc green in the second full run; rows address-bar-live and address-bar-live-self-test at verify-platform.sh:5032-5033; --quick green |
| 29-02 | 6 (dev addresses, token stripped for other loopback ports on all four load kinds, Theia frame keeps its token, static pin, store-kind classes, backstop live dev addresses) | 6/6 ✓ | dev-addresses; token-cookie (stock window first, overlay, subresource, worker, plus the sidecar-overlay load added by WR-12; plant token-strip-off red); token-cookie-strip 6 plants; gui02-web-tab-bridge rule 12. The backstop is VERIFIED because I observed the GETs and pushes in my own run |
| 29-03 | 6 ([[search_engines]], emitted fragment, policies key, malformed engine refused, allowlist rows, REBRANDING docs) | 6/6 ✓ | search-engines (+4 plants), theia-endpoints, verify-rebranding-docs 43/43; configuration.toml carries DuckDuckGo Lite then Wikipedia; endpoint-allowlist.json rows marked search_engines[0].url, [0].suggest_url, [1].url |
| 29-04 | 6 (setting filled at runtime, choosing renames placeholder with no reload, unknown name ignored, one/no-engine fallbacks, packaged engine list, read-class listSearchEngines) | 6/6 ✓ | default-engine (options "", One, Two; placeholder renames; "No Such Engine" ignored); search-engines-packaged PASS; `addressLabel = engine ? searchPlaceholder(engine) : searchOrEnterAddress` read in the widget. Long-name clipping is in the visual human item |
| 29-05 | 9 (heuristic row first and highlighted, late rows keep the highlight, couldn't-load row, composition and caps, icons and markers, data-only favicons, 32px rows and 432px panel, combobox ARIA, brand ban) | 9/9 ✓ | rows, failure-rows; address-bar-rows 20 Node cases (+5 plants). The 10th 29-05 truth (backstop, different applicationName) restates SC5 and is merged there. The shimmer row and the short-window cap are in the visual human item |
| 29-06 | 8 (suggestions captioned and committable, setting off, address text fenced chrome-side, silent failure, strip shown and hidden, one-off targets keep the default, ArrowDown onto buttons and HoverService tooltip, backstop allowlist and request log) | 8/8 ✓ | suggestions (chrome's fence answers `searchSuggestions('localhost:4000')` with [] and no GET; a 500 leaves only the heuristic row), one-off (Gecko default still One, setting still ""; strip hidden with one engine). Backstop: theia-endpoints plus the request log I observed |
| 29-07 | 6 (Switch to Tab caption, switch without load, Alt+Enter foreground, Ctrl+click and middle-click background, no keybinding intercepts Alt+Enter, backstop no load) | 6/6 ✓ | switch-to-tab, new-tab-targets (join recorded; the harness profile has no active group, so the join itself is a no-op there) |
| 29-08 | 7 (inline completion, Enter and Tab accept, Backspace and paste suppress, Ctrl+Enter canonize, drag feedback, drop rules, read-only autofillOrigin) | 7/7 ✓ | autofill, canonize-drop (plant pill-drag-navigates red); `autofillOrigin` runs a bound `SELECT prefix, host FROM moz_origins` on `promiseDBConnection()`; read class in rule 12 |
| 29-09 | 9 (Shift+Delete removes and moves the highlight, other rows keep default, failure notice, pill menu, enablement without a clipboard read, Paste and Paste & Go, Esc focus, privileged classes, backstop live) | 9/9 ✓ | shift-del, context-menu (clipboard read counted: none on open, once per Paste & Go; read stubbed to reject shows the named row). The context-menu key and Shift+F10 are not driven; they are in the real-input human item |
| 29-10 | 6 (select-all on the focusing press, IME guard, drafts per tab, draft lifecycle, never persisted, backstop IME live) | 6/6 ✓ | select-ime, drafts; `drafts = new WeakMap<Widget, string>()`, no write to settings, store or log. The guard returns at the top of `onInputKeyDown` for every key; only Enter is driven live |
| derived | Review fixes WR-01, WR-02, WR-03, WR-04, WR-05 + NEW-01 (all but the background one-off), WR-10 | 6 × ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Each fix is present (lines cited in behavior_unverified_items); 29-REVIEW-FIX.md marks each "requires human verification" and no scenario drives it |

**Score:** 74/81 truths verified (6 present, behavior-unverified; 1 roadmap criterion, SC5, partial with its backstop half awaiting a human run).

Total = 5 roadmap criteria + 70 plan truths (71 less the 29-05 backstop merged into SC5) + 6 derived.

**Backstop truths** (29-02, 29-06, 29-07, 29-09, 29-10). Each is VERIFIED because I observed the behaviour in my own run of the live check against the real binary: GETs seen by the served engine, state pushes, Places reads, chrome-scope focus. That is not symbol presence. The scenarios were written by the executor, not held out; the 14 plants going red is what shows they discriminate. The 29-05 backstop (different applicationName) had no such run and abstains.

### Deferred Items

None. No gap was found, so there was nothing to match against later phases. Two Info findings point at later work: IN-09 (lock icon follows the pill text) belongs to Phase 31's "Real lock and Not Secure", and the brand literals outside chrome-bar (`save-page-copy-command.ts`, `web-tab.ts`, `organising-widget.ts`, `dependent-windows.ts`) are outside BAR-14's chrome-bar scope (recorded as debt in 29-10-SUMMARY).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `powerbrowser/shell/PowerBrowserAPI.sys.mjs` | search area: barEngines, engineSearch, resolveTypedAddress, listSearchEngines, placesFavicons, searchSuggestions, autofillOrigin, token-cookie strip | ✓ VERIFIED | :4338-4610; store kinds routed at :3802 |
| `theia/extensions/tab-uris/src/browser/chrome-store-client.ts` | resolveTypedAddress (canonize, forceSearch), listSearchEngines, placesFavicons, searchSuggestions, autofillOrigin, removeHistoryEntry, readClipboardText | ✓ VERIFIED | +58 lines; tab-uris-typecheck green |
| `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx` | commit path, rows, one-offs, switch, new-tab targets, autofill, Ctrl+Enter, drop, Shift+Delete, menu, select-all, IME guard, drafts | ✓ VERIFIED | all live scenarios exercise it |
| `theia/extensions/chrome-bar/src/browser/address-bar-rows.ts` | pure rows module | ✓ VERIFIED | address-bar-rows 20 cases, 5 plants |
| `theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts` | appSubject, copy rows | ✓ VERIFIED | no brand literal (derived ban) |
| `theia/extensions/chrome-bar/src/browser/chrome-bar-preferences.ts` | browser.defaultSearchEngine, browser.searchSuggestions, User scope | ✓ VERIFIED | scope PreferenceScope.User at :28, :54 |
| `theia/extensions/chrome-bar/src/browser/chrome-bar-places-suggestions.ts` | SourcedRow, live-tab filter before the cap (WR-06) | ✓ VERIFIED | rows and switch-to-tab pass |
| `configuration.toml`, `scripts/generate.mjs`, `scripts/lib/config-schema.json`, `powerbrowser/distribution/policies.json`, `powerbrowser/endpoint-allowlist.json`, `docs/REBRANDING.md` | engines from the manifest into policies and the allowlist | ✓ VERIFIED | search-engines, theia-endpoints, verify-rebranding-docs |
| `scripts/verify-address-bar-live.mjs`, `scripts/verify-token-cookie-strip.mjs`, `scripts/verify-search-engines.mjs`, `scripts/verify-search-engines-packaged.mjs`, `scripts/verify-address-bar-rows.mjs`, `scripts/verify-web-tab-bridge.mjs`, `scripts/verify-shell-error-copy.mjs`, `scripts/verify-chrome-bar-suggestions.mjs` | gates with self-tests | ✓ VERIFIED | run by me (packaged check has no self-test, IN-13) |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| pill Enter / commitText | resolveTypedAddress | ChromeStoreClient store kind | ✓ WIRED (live: search; plant resolve-bypassed) |
| resolveTypedAddress | engine submission and http(s) wall | `engineSearch`, `^https?$` on preferredURI | ✓ WIRED (live: refused) |
| setGroupSenderPort | installTokenCookieStrip | direct call, :2212 | ✓ WIRED (live: token-cookie) |
| configuration.toml [[search_engines]] | policies.json SearchEngines, endpoint-allowlist rows | emitSearchEngines, manifestEndpointSources | ✓ WIRED (search-engines, theia-endpoints) |
| browser.defaultSearchEngine | resolveTypedAddress engineName | `engineNameForRequest()` on every request | ✓ WIRED (live: default-engine) |
| searchSuggestions | resolveTypedAddress | kind must be search, else [] | ✓ WIRED (live: suggestions fence) |
| Shift+Delete / pill menu | removeHistoryEntry / readClipboardText | widget handlers only (bridge fence) | ✓ WIRED (live: shift-del, context-menu) |
| onCurrentWidgetChanged | drafts WeakMap | saveDraft, restore | ✓ WIRED (live: drafts) |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|----------|------|--------|-----------|--------|
| Heuristic row and search URL | `resolved.url` | Gecko URI fixup + SearchService submission | yes (served engine saw the GET) | ✓ FLOWING |
| Engine rows | `searchSuggestions` | SearchSuggestionController.fetch | yes (served /one/suggest) | ✓ FLOWING |
| Place rows and favicons | places search, `placesFavicons` | Places DB, favicon cache | yes (seeded visits, data: icon) | ✓ FLOWING |
| Autofill completion | `autofillOrigin` | moz_origins SELECT | yes (frecency read back above 0) | ✓ FLOWING |
| Default Search Engine options and placeholder | `listSearchEngines` | SearchService engines filtered by loadPath | yes (live and packaged) | ✓ FLOWING |
| App name in rows | `appSubject()` | FrontendApplicationConfigProvider | yes (compared with runtime value) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Static gate | `scripts/verify-platform.sh --quick` | exit 0, all checks passed | ✓ PASS |
| All BAR scenarios | `node scripts/verify-address-bar-live.mjs` | exit 0, 18/18 PASS | ✓ PASS |
| Live check discriminates | `node scripts/verify-address-bar-live.mjs --self-test` | exit 0, clean green, 14/14 plants red | ✓ PASS |
| Packaged engine set | `node scripts/verify-search-engines-packaged.mjs` | exit 0 (package from 15:01) | ✓ PASS |
| GUI-02 regression | `node scripts/verify-web-tab-live.mjs` | exit 0 | ✓ PASS |
| NAV/KEY regression | `node scripts/verify-nav-keys-live.mjs` | run 1 exit 1 (hard-reload-click, known flake); run 2 exit 0, 31/31; scenario alone 3/3 | ✓ PASS (flake noted) |

### Probe Execution

No `scripts/*/tests/probe-*.sh` is declared by this phase. The live checks above are the phase's runnable checks, and I ran them in my own process.

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|----------------|-------------|--------|----------|
| BAR-01 | 01 | Non-URL text + Enter searches the default engine | ✓ SATISFIED | search, refused, no-engine |
| BAR-02 | 02 | localhost, localhost:4000, host:port, IP open | ✓ SATISFIED | dev-addresses, token-cookie |
| BAR-03 | 03, 06 | Engine suggestions, on by default, setting to turn off | ✓ SATISFIED (served engine) | suggestions; real network is a human item |
| BAR-04 | 03, 04 | Pick the default engine from the configuration.toml set | ✓ SATISFIED | default-engine, search-engines, search-engines-packaged |
| BAR-05 | 06 | One-off search from the result list | ✓ SATISFIED | one-off |
| BAR-06 | 07 | Open-tab suggestion switches, no reload | ✓ SATISFIED | switch-to-tab |
| BAR-07 | 08 | Inline origin autofill, Enter or Tab accepts | ✓ SATISFIED | autofill (www. case is a human item, WR-01) |
| BAR-08 | 07 | Alt+Enter, Ctrl+click, middle-click open a new tab | ✓ SATISFIED | new-tab-targets |
| BAR-09 | 09 | Shift+Del removes a history row | ✓ SATISFIED | shift-del |
| BAR-10 | 09 | Right-click Cut, Copy, Paste, Paste & Go | ✓ SATISFIED | context-menu |
| BAR-11 | 05, 10 | Favicons and type icons, first click selects all, IME never commits early | ✓ SATISFIED (synthesised IME) | rows, select-ime; real IME is a human item |
| BAR-12 | 10 | Unsubmitted text kept per tab | ✓ SATISFIED | drafts |
| BAR-13 | 08 | Ctrl+Enter www.name.com; drop link or text | ✓ SATISFIED | canonize-drop |
| BAR-14 | 05 | Every chrome-bar message names the configured app name | ? NEEDS HUMAN for the different-name run; ban and mechanism ✓ | shell-error-copy brand ban, failure-rows |

All 14 IDs appear in plan frontmatter, and REQUIREMENTS.md maps no other ID to Phase 29. No requirement is orphaned.

### Prohibitions (all `verification: judgment`; autonomous run: LLM-judge verdicts are NON-AUTHORITATIVE, each flagged `unverified-prohibition — human review recommended`)

| # | Plan | Prohibition | LLM verdict | Basis |
|---|------|-------------|-------------|-------|
| 1 | 01 | No typed text to an engine when chrome resolved it as an address | holds | the visit branch returns before any engine call; suggestions refuses non-search kinds chrome-side (live fence check) |
| 2 | 01 | No scheme but http(s) from typed text, wall on the result | holds | `^https?$` on preferredURI and on the submission URI; refused live |
| 3 | 02 | No token cookie to another loopback port; cookie never removed from the store | holds | token-cookie five loads, Theia frame credentialed 200; plant red |
| 4 | 03 | No partner, affiliate or tracking parameter in shipped templates | holds | templates carry only q / search and `type=list` / `action=opensearch` |
| 5 | 04 | A workspace file cannot choose the engine | holds | PreferenceScope.User; chrome accepts only a name in barEngines |
| 6 | 05 | No network fetch for a row or engine icon | holds | data:image/ only, chrome-side; rows checks no other img src |
| 7 | 05 | No product name in chrome-bar copy | holds | derived brand ban green with plants; IN-16 notes the comment blanker can hide a `" //"` string |
| 8 | 06 | Nothing to an engine for address text, during IME, or with suggestions off | holds | suggestions, select-ime (no suggest GET while composing), setting-ignored plant |
| 9 | 06 | A one-off never changes the default engine or the setting | holds | one-off reads both back; forceSearch rides one request |
| 10 | 07 | Choosing an open-tab row never reloads or navigates it | holds | switch-to-tab; plant tab-row-navigates red |
| 11 | 08 | Autofill never writes Places | holds | bound SELECT on promiseDBConnection (read-only) |
| 12 | 09 | Clipboard read only in Paste and Paste & Go handlers; never logged, pushed or stored | holds | two call sites; plant paste-reads-on-open red; no console call carries text |
| 13 | 09 | Shift+Delete never removes a bookmark or its page's visits | holds | shift-del; plant shift-del-bookmark red |
| 14 | 10 | Drafts only in widget memory | holds | WeakMap; no settings, store, push or log write |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (phase diff, 26 files) | — | TBD/FIXME/XXX/TODO/HACK added | none found | "placeholder" hits are the input's placeholder attribute |
| chrome-bar-widget.tsx | engineNameForRequest | IN-05: a transiently missing engine list sends text to Gecko's default engine | ℹ️ Info | a chosen non-default engine can be skipped after a failed focus-time refresh |
| chrome-bar-widget.tsx | placeRowsOf | IN-07: Switch to Tab offered for the current tab | ℹ️ Info | differs from Firefox; harmless |
| chrome-bar-widget.tsx | listbox | IN-08: one-off buttons inside role=listbox; aria-activedescendant can name a button | ℹ️ Info | screen-reader announcement of a highlighted one-off |
| chrome-bar-widget.tsx | runOneOff catch | IN-10: a failed background open gives no row | ℹ️ Info | typed text is lost on that failure |
| verify-address-bar-live.mjs | report | IN-11 (six scenarios without a plant), IN-12 (NOT SCORED exits 0 under --scenario) | ℹ️ Info | the registered full rows are unaffected |
| verify-search-engines-packaged.mjs | — | IN-13: no --self-test | ℹ️ Info | equality checks are direct |
| verify-nav-keys-live.mjs | hard-reload-click | intermittent red in a full run (Phase 27 known flake) | ℹ️ Info | rerun before treating as a regression |
| 29-VALIDATION.md | frontmatter | still `status: draft`, `nyquist_compliant: false` | ℹ️ Info | /gsd-validate-phase has not been run |

The 16 Info findings of 29-REVIEW.md were out of scope for the fix pass and remain open; none contradicts a must-have.

### Human Verification Required

Chris's standing instruction defers these to the end-of-milestone checks.

1. **BAR-14 rebrand run.** Build the sidecar with a scratch `display_name` and trigger the failure, no-search and couldn't-load rows. Expected: each names the scratch name.
2. **Real IME (fcitx or ibus) on KDE Wayland.** Expected: no navigation while composing, one search after the commit. The live run composed through nsITextInputProcessor, and 29-10's synchronous render fix was found under that route.
3. **Real keyboard and mouse in the pill.** Select-all and double-click, Alt+Enter, Ctrl+Enter, Ctrl+click and middle-click on rows, Shift+Delete, and the pill menu from right-click, the context-menu key and Shift+F10.
4. **Visual (KWin raise + spectacle).** Rows, one-off wrap, drop ring, a long engine name in the placeholder, the short-window panel cap and the shimmer row, against 29-UI-SPEC.
5. **Real OS drag onto the pill.** A link, plain text and an in-field drag of the pill's own text.
6. **Packaged build after HEAD.** Repackage, check the Default Search Engine options and real-network suggestions from the configured hosts.
7. **Review fixes marked "requires human verification"** (WR-01, WR-02, WR-03, WR-04, WR-05 + NEW-01 beyond the background one-off, WR-10): see behavior_unverified_items.
8. **Prohibitions 1-14** above (non-authoritative LLM verdicts).

### Gaps Summary

No must-have truth failed. Every artifact exists, has real content and is wired, and every key link holds. Four of the five roadmap criteria and 13 of the 14 requirement IDs have code evidence and passing live evidence, and I produced that evidence in this session: `--quick` green, 18/18 live scenarios, 14/14 self-test plants red, the packaged engine check, and the GUI-02 and NAV/KEY regression checks. The status is `human_needed`, not `passed`, for four reasons:

- SC5's different-name run (BAR-14) needs a second Theia build, and its backstop truth abstains without it.
- Six review fixes are present but no test exercises them; the fixer marked each for human verification.
- Real-input UAT (IME, keyboard, mouse, OS drag), visuals and real-network suggestions remain. Synthesised input is evidence, not UAT.
- The 14 judgment-tier prohibitions carry only non-authoritative verdicts in this autonomous run.

Two items for later runs, neither a Phase 29 gap: the Phase 27 shared-process flake also showed here once (`hard-reload-click`, then 31/31 on rerun), and the `context-menu` Paste & Go focus step is recorded as intermittent in deferred-items.md (it passed in both of my runs).

---

_Verified: 2026-10-22T03:58:17Z_
_Verifier: Claude (gsd-verifier)_
