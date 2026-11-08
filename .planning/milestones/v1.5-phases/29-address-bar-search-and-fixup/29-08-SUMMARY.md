---
phase: 29-address-bar-search-and-fixup
plan: 08
subsystem: chrome-bar address bar / Places boundary / live address-bar check
status: complete
tags: [BAR-07, BAR-13, autofill, canonize, drop, live-check]
requires: [29-07]
provides:
  - "autofillOrigin read store kind: one bound SELECT on moz_origins over the read-only Places connection; ChromeStoreClient.autofillOrigin(text)"
  - "resolveTypedAddress(text, engineName, canonize): the canonize branch (urlFixupSuffix, FIXUP_FLAGS_MAKE_ALTERNATE_URI); client argument canonize = false"
  - "address-bar-rows: autofillSplice(typed, completion), isCanonizable(text), with Node cases and a self-test plant"
  - "Pill autofill (autofillEligible instance method, requestAutofill, autofillSelected, commitTyped), Ctrl+Enter, pill drop (onPillDrop) and the item-7 ring .pb-chrome-bar-pill.is-drop-target"
  - "Live scenarios autofill and canonize-drop; plant autofill-on-paste"
affects: [29-09, 29-10]
tech-stack:
  added: []
  patterns:
    - "Sqlite.sys.mjs refuses any LIKE not followed by a binding, and a parameter named like counts as not bound: every LIKE pattern is bound, and no parameter is named like"
    - "An autofill completion is written to the input element and selected in the same tick it is accepted, then mirrored in React state, so no keystroke can land between the value and the selection"
    - "Drag feedback is one shared handler (onDropTargetDragOver/Leave) for New Tab and the pill"
key-files:
  created:
    - .planning/phases/29-address-bar-search-and-fixup/deferred-items.md
  modified:
    - powerbrowser/shell/PowerBrowserAPI.sys.mjs
    - powerbrowser/INTERNAL-APIS.md
    - theia/extensions/tab-uris/src/browser/chrome-store-client.ts
    - theia/extensions/chrome-bar/src/browser/address-bar-rows.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx
    - theia/extensions/chrome-bar/src/browser/chrome-bar.css
    - scripts/verify-address-bar-rows.mjs
    - scripts/verify-web-tab-bridge.mjs
    - scripts/verify-address-bar-live.mjs
decisions:
  - "The autofill SQL binds both patterns (:hostPattern and :wwwPattern). The researched form `'www.' || :like` and the parameter name :like are both refused by Sqlite.sys.mjs's LIKE check."
  - "The completion is set on the input element and selected synchronously, rather than after a requestAnimationFrame. React's render then sees the same value and leaves the selection alone."
  - "The autofill live scenario opens its own tab on localhost /af and presses Enter there. The navigation to / stays on the same site, so it causes no process switch (Phase 27's reload defect)."
  - "A dropped payload longer than 2048 characters shows the commit-failure row. The plan said to cap it at 2048, but cutting a URL short would load a different address."
  - "New Tab and the pill share one dragover/dragleave handler (renamed onDropTargetDragOver/onDropTargetDragLeave). The plan's separate onPillDragOver would have been a copy of it."
metrics:
  duration: 42m
  completed: 2026-10-21
  tasks: 3
  files: 9
commits: 3
plan_head_before: c4a40be5404dee6982bb46c4da7a6b6a82b23e72
plan_head_after: 9fff14d51fe96a14e595b8b2754bc674a110b8c8
actuals:
  tokens: 18000
  tasks: 3
  commits: 3
---

# Phase 29 Plan 08: Autofill, Ctrl+Enter and drop on the pill Summary

Typing in the address bar now completes the text inline to the best visited origin. The completion comes from a read-only, parameter-bound `moz_origins` query on the Places reader connection. Enter opens that origin and Tab accepts the completion. Backspace removes it, and a paste is never completed. Ctrl+Enter turns a bare name such as `example` into `https://www.example.com/`, as Firefox does. A link or text dropped on the pill loads, or is searched, in the current tab, through the same resolve wall as typed text.

## What was built

- **Boundary (`PowerBrowserAPI.sys.mjs`, search area)**
  - `autofillOrigin(text)` lowercases the text first. It returns null when the text is not a string, is empty, is over 253 characters, or contains whitespace, `/`, `:`, `?` or `#`.
    - It escapes `\`, `%` and `_`, then runs one `SELECT prefix, host FROM moz_origins` through `lazy.PlacesUtils.promiseDBConnection()` and `executeCached`, with both LIKE patterns bound. The query keeps http(s) rows with frecency > 0, orders by frecency and takes the first row.
    - It replies `{ text: <host, without a leading www. unless typed>/, url: prefix + host + "/" }`.
    - It has a STORE_REQUEST_KINDS member, a `case "autofillOrigin"` arm and a rule-12 class `read`.
  - `resolveTypedAddress(text, engineName, canonize = false)` has a new canonize branch. It runs only when `canonize === true` and the text matches `_maybeCanonizeURL`'s pattern.
    - It takes `Services.locale.urlFixupSuffix` and adds a trailing `/` when missing. The suffix goes before the first slash, or at the end.
    - It then applies `FIXUP_FLAGS_MAKE_ALTERNATE_URI`. If that throws, the text stays as typed.
    - The arm passes `data.canonize === true`.
  - INTERNAL-APIS.md has three new Touchpoints rows: the `moz_origins` read, `urlFixupSuffix` and the alternate-URI fixup.
- **Client**: `autofillOrigin(text)` was added, and `resolveTypedAddress` gained `canonize = false`.
- **Rows module**:
  - `autofillSplice(typed, completion)` returns `{ value, start, end }` or null. It matches case-insensitively and keeps the typed case.
  - `isCanonizable(text)` uses the same regex as Firefox.
- **Widget**:
  - Autofill:
    - `onInputChange` clears `autofill` on every input. An `insertText` input lifts the Backspace suppression. Each input records whether it may autofill (`autofillEligible(e)`: insertText, caret at the end, no space, not composing, not suppressed).
    - When it may, `runQuery` also calls `requestAutofill(prefix, current)`. That call checks the query's guards, the suppression flag, the input still equalling `prefix`, and an http(s) url. It then writes the completion to the input, selects the completed part and rebuilds the heuristic row as a "Visit" of the origin. `setHeuristic` keeps that row when the resolve answers later.
  - Keys:
    - Enter, or choosing the heuristic row, goes through `commitTyped()`. An autofilled value opens `autofill.url` through `commitRow`; any other text goes to `commitText`.
    - Tab with the completion selected collapses the selection to the end and calls `preventDefault`.
    - Backspace or Delete with the completion selected sets `autofillSuppressed`, and the default action deletes the selected part.
    - Ctrl+Enter (Ctrl or Meta, no Alt, no Shift) on `isCanonizable` text calls `commitText(text, { canonize: true })`. Any other text is handled as Enter.
  - Drop:
    - The pill div's dragenter, dragover and dragleave go to the handler New Tab already used, now `onDropTargetDragOver`/`onDropTargetDragLeave`. A link shows the ring, text gets the copy cursor, and a readable link that is not http(s) gets `none`.
    - `onPillDrop` takes the first non-comment uri-list line, else the first x-moz-url line, else the plain text (`droppedTextOf`, which `droppedUrlOf` now uses too). It resolves that text through `resolveTypedAddress`.
    - A visit or search reply reverts the pill to the committed address and opens the URL in the current tab. Anything else shows the commit-failure row.
  - CSS: `.pb-chrome-bar-pill.is-drop-target` is accent item 7, the same inset ring as items 5 and 6.
- **Live harness** (`verify-address-bar-live.mjs`):
  - `autofill`: the seed calls `PlacesUtils.history.insert`, then `recalculateAnyOutdatedFrecencies()`. It then polls `moz_origins` on the read-only connection for frecency > 0, and otherwise fails as a broken instrument. The steps, in order:
    - With a tab on localhost /af current, it types `loc` key by key at the parent through nsITextInputProcessor, which sends trusted `insertText` input.
    - It checks the value `localhost:<port>/` with the selection from 3 to the end, and a "Visit" heuristic row for `http://localhost:<port>/`.
    - Tab: the selection collapses, focus stays and the dropdown stays open.
    - Enter: a GET on `/` and a push of the origin.
    - It types `loc` again (the positive control), then presses Backspace. The value must be `loc` with no selection, and still `loc` 1.2 s later.
    - It types `a`, and the completion returns.
    - A paste-shaped `insertFromPaste` input must not be completed. The positive control here is the heuristic row answering for `loc`.
  - `canonize-drop`:
    - It checks the replies for canonize true and false.
    - With `openCommittedUrl` wrapped so it records the URL and loads nothing, it checks Ctrl+Enter on `example` (`https://www.example.com/`) and on `example.org` (`https://example.org/`).
    - It then synthesises drags on the pill. A uri-list drag must show the ring with copy, then load /dropped in the session tab. The pill is sampled every frame until the push and must never hold the payload. A text drag must get copy with no ring and search `dropped words`. A javascript: link must get no ring and `none`. Dropped javascript: text must show the failure row and load nothing.
  - Plant `autofill-on-paste` replaces the instance's `autofillEligible` with one that ignores `inputType`.

## Verification (all run this session)

- **Static checks, all passing:**
  - `verify-ng-040-internals-catalogue-lines` and `check-internals-boundary.sh --catalogue`.
  - `verify-web-tab-bridge`, which includes rule 12 with `autofillOrigin` classed `read`.
  - `verify-address-bar-rows`: 20 cases, one `ok` line per canonize case. Its `--self-test` passes, with 5 plants including `autofillSplice case-sensitive`.
  - `verify-chrome-bar-suggestions`.
  - `tsc -b theia/extensions/tab-uris` and `tsc --noEmit -p theia/extensions/chrome-bar`: no errors.
- **Region checks:** `case "autofillOrigin"`, `FROM moz_origins` and `urlFixupSuffix` each appear once. The `autofillOrigin` region contains 0 INSERT, UPDATE or DELETE statements.
- **Theia build:** `yarn build` exited 0 after each task, and the bundle contains `autofillOrigin`.
- **Live runs:**
  - `--scenario search,autofill` and `--scenario search,canonize-drop`: both PASS.
  - Full `node scripts/verify-address-bar-live.mjs`: 13 of 14 scenarios PASS. `one-off` failed once, on its Enter step (see Deferred Issues).
  - `--self-test`, first run: the clean control was green. 7 of 8 plants went red as named. `tab-row-navigates` went red, but with an early return before its `loading: true` line. Run again on its own, it went red naming `loading: true`.
  - `--self-test`, second run: PASS. The clean control (all 14 scenarios) was green and all 8 plants went red, including `autofill-on-paste`, which failed with "autofilled a paste: the pill reads {"value":"localhost:<port>/",...}".
  - `node scripts/verify-nav-keys-live.mjs --scenario drop`: PASS.
- **Quick gate:** `scripts/verify-platform.sh --quick` PASS after Task 1 and after Task 3.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The researched autofill SQL is refused by Sqlite.sys.mjs**
- **Found during:** Task 1, live (`autofillOrigin failed in the store`; in chrome scope, "Please enter a LIKE clause with bindings").
- **Cause:** `likeSqlRegex = /\bLIKE\b\s(?![@:?])/i` flags `LIKE 'www.' || :like`, and it also flags the parameter name `:like` followed by a space.
- **Fix:** both patterns are bound, as `:hostPattern` and `:wwwPattern = 'www.' + pattern`. The query keeps the same semantics.
- **Commit:** 7da3e4d

**2. [Rule 1 - Bug] A rows-module case could not go red**
- **Issue:** the new autofill cases returned `got`. When `got` was `null`, the harness read that as a pass, so the case-sensitivity plant stayed green.
- **Fix:** a failing case now returns `{ got }`.
- **Commit:** 7da3e4d

**3. [Rule 1 - Bug] ng-040 `--fix` assigned two pairs of rows to the wrong lines**
- **Issue:** after the inserts, `--fix` swapped the two `savePageCopy` `IOUtils.remove` rows. It also pointed the `searchLazy` getter row and the `controller.fetch` row at neighbouring lines that carry the same token.
- **Fix:** each row was set back to its own line by hand. Both directions of the check pass.
- **Commits:** 7da3e4d, ab3a9c4

**4. [Rule 1 - Correctness] A dropped payload is not truncated to 2048 characters**
- **Issue:** cutting a URL short would load a different address.
- **Fix:** an oversized payload shows the commit-failure row.
- **Commit:** 9fff14d

**5. [Rule 3 - Blocking] The autofill scenario uses its own localhost tab**
- **Issue:** the plan's Enter would have navigated the 127.0.0.1 session tab to localhost. That is the process switch the 29-07 carry-over warns about.
- **Fix:** the scenario opens a tab on localhost /af and presses Enter there, which keeps the navigation on the same site.
- **Commit:** 7da3e4d

### Notes

- The completion is set and selected synchronously instead of in a `requestAnimationFrame` (see decisions). Live runs showed the selection holding after React's render.
- One shared dragover/dragleave handler serves New Tab and the pill. NAV-06's `drop` live scenario still passes after the rename.
- The one-off Enter failure message now includes the requests since the mark, the pill and the one-off strip.

## Deferred Issues

- `one-off`'s Enter-on-highlighted-one-off step is intermittent. It failed 2 times in 12 runs this session, and passed in both self-test clean controls. 29-08 did not touch that path. The details are in `deferred-items.md`.

## Known Stubs

None.

## Threat Flags

None. Both new surfaces are in the plan's threat model:
- T-29-29: bound parameters, LIKE escapes, the read-only connection, SELECT only, and the input shape refused before the query.
- T-29-30: dropEffect `none` for a readable link that is not http(s), every drop through the resolve wall, and refused text showing the failure row. This was checked live with javascript: payloads.

## Self-Check: PASSED

- All 9 modified files and `deferred-items.md` exist.
- Commits 7da3e4d, ab3a9c4 and 9fff14d are ancestors of HEAD.
- `git rev-list --count c4a40be..HEAD` is 3.
