---
phase: 32-page-tools
reviewed: 2026-10-31T00:00:00Z
depth: standard
files_reviewed: 33
files_reviewed_list:
  - powerbrowser/INTERNAL-APIS.md
  - powerbrowser/shell/PowerBrowserAPI.sys.mjs
  - powerbrowser/shell/powerbrowser.js
  - patches/050-extension-tab-host.patch
  - scripts/lib/pb-probe-verdicts.json
  - scripts/lib/firefox-bidi.mjs
  - scripts/check-internals-boundary.sh
  - scripts/verify-chrome-bar-commands.mjs
  - scripts/verify-page-tools-downloads.mjs
  - scripts/verify-page-tools-edit.mjs
  - scripts/verify-page-tools-find.mjs
  - scripts/verify-page-tools-live.mjs
  - scripts/verify-page-tools-print-save.mjs
  - scripts/verify-page-tools-zoom-mute.mjs
  - scripts/verify-page-tools-reader-crash.mjs
  - scripts/verify-platform.sh
  - scripts/verify-shell-error-copy.mjs
  - scripts/verify-shortcut-relay.mjs
  - scripts/verify-web-tab-bridge.mjs
  - scripts/verify-ext-tab-host-live.mjs
  - scripts/verify-ext-tab-host-patch-guards.mjs
  - scripts/verify-ext-tab-host-scope.mjs
  - scripts/verify-shell-gbrowser-standin.mjs
  - theia/extensions/chrome-bar/package.json
  - theia/extensions/chrome-bar/src/browser/chrome-bar-commands.ts
  - theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts
  - theia/extensions/chrome-bar/src/browser/chrome-bar-shortcuts.ts
  - theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx
  - theia/extensions/chrome-bar/src/browser/chrome-bar.css
  - theia/extensions/chrome-bar/src/browser/tab-strip-widget.tsx
  - theia/extensions/chrome-bar/src/browser/address-bar/address-bar-modes.ts
  - theia/extensions/tab-uris/src/browser/web-tab.ts
  - theia/extensions/tab-uris/src/browser/web-tab.css
findings:
  critical: 1
  warning: 11
  info: 7
  total: 19
status: issues_found
---

# Phase 32: Code Review Report

**Reviewed:** 2026-10-31
**Depth:** standard
**Files Reviewed:** 33
**Status:** issues_found

## Summary

Scope: the Phase 32 hunks only (`git log --grep='(32-' e8062d82..HEAD`, 42 commits). The review concentrated on the chrome-side page-tool helpers in `PowerBrowserAPI.sys.mjs`, the widget methods in `web-tab.ts`, the chrome-bar composition and the live harness. Upstream callees were read where a finding depends on them: `AboutReaderParent`/`AboutReaderChild`, `DevToolsShim`, `TabDescriptorFront`, and `ext-browser.js`.

The arms check their inputs well. Every new kind validates `tabId` and option types, the frame never sends a URL for a privileged-scheme load, the favicon is bounded on both sides, and the token-cookie strip still covers the system-principal view-source channel, because the overlay's browsing context is checked first.

The main defect comes from the D-05 amendment. It admits `about:reader?url=` and `view-source:` into overlays, but three other places still assume an overlay only ever holds http(s):

- the open-time scheme wall;
- the NG-034 history wall;
- the push-side redaction, which covers view-source only.

Because of that, a tab that crashes in reader view cannot be recovered. A tab that has visited reader view or view source also loses its whole back/forward history on crash recovery and on restart.

Other problems:

- favicon pushes are missing a trigger;
- a crash that lands during a process switch is never pushed;
- highlight-all cannot be turned off;
- the live checks for find steps and audio cannot catch the failures they are meant to catch.

## Fix outcome (2026-10-31, fix run paused before close-out)

Scope: CR-01 and WR-01 to WR-11. Info findings were not in scope. Every live row below ran on `objdir/dist/bin/powerbrowser` through `scripts/verify-page-tools-live.mjs`. Every "red pre-fix" result came from running the same row against the HEAD module or the HEAD frontend before the fix.

| Finding | Outcome | Commit | Proof |
|---|---|---|---|
| CR-01 | fixed | `23c08bb5` | New live row `crash-reader`: crash in reader view, then Reload tab, and the page comes back. Red pre-fix ("Theia holds about:reader?url=..."). Plant `crash-reader-url-held` goes red. |
| WR-01 | fixed (with CR-01) | `23c08bb5` | `crash-reader` history check: 3 entries before, 3 after. Red with only the wall reverted (3 entries, then 1). |
| WR-02 | fixed (defensive) | `644033fd` | The `source` row now also reads `webTabHistory`. Plant `source-history-title` goes red. Live read: on this build a view-source entry's title is already the page URL, so the row was green before the fix and no leak was observable. |
| WR-03 | fixed | `c2a9261b` | The `favicon` row's `/icon` page now adds its icon from a timer after load. Red pre-fix (no favicon push), green after. |
| WR-04 | fixed (inference confirmed) | `c0386506` | New row `crash-switching` dispatches `DidChangeBrowserRemoteness`, then crashes the tab. Red pre-fix (no crashed push in 30 s), green after. |
| WR-05 | fixed | `f580f7e4` | The `find` row listens for FinderParent `onHighlightFinished` and requires an explicit `highlight:false` after the toggle is turned off. Red pre-fix, green after. |
| WR-06 | fixed | `18b825d1` | The `find` row navigates, then steps from the widget, and must see `findTotal` 3. Red on the pre-fix frontend, green after the rebuild. |
| WR-07 | skipped | none | The stand-in cannot satisfy `updateReaderButton` with a no-op. The method belongs to the AboutReaderParent actor. It returns early only when `browser.getTabBrowser()` is null or the overlay is not `selectedBrowser`, and getting either result means changing `getTabForBrowser` or `selectedBrowser` for every consumer (tabs.*). Hidden stub elements in the shell document would then reach `doc.l10n.setAttributes` and `PageActions.sendPlacedInUrlbarTrigger`. That needs its own Pitfall-2 record. Follow-up. |
| WR-08 | fixed, needs human verification | `0cbb77b6` | New row `crash-navigate`: Back and Forward are disabled while crashed; navigating loads the new URL with the kept history behind it. Red pre-fix, green 3 times in a row in single-scenario runs. In the final combined run it hit a harness BiDi WebSocket error; this is not a product verdict, but it should be re-run. The fix also changes chrome: `webTabOpen` loads the requested URL after restoring a history it kept at a crash (`crashKept`), and only then. |
| WR-09 | fixed | `1bdbfdf8` | FindNext and F3 now require `findCurrent` to change. Plant `find-step-noop` (the Finder's `findAgain` stubbed out) goes red; `--self-test --only find` passes. |
| WR-10 | skipped | none | Release packaging must put libpulse on the loader path; tracked as a follow-up. |
| WR-11 | fixed | `1cf10615` | The `audio` row focuses the muted tab's mark and presses Enter; the tab must unmute. Red with the pre-fix strip ("cannot take keyboard focus"). Also fixed: the strip did not re-render on mute or playback changes, so the mark did not appear. |

Verification so far:

- Live, last combined run: `find`, `reader`, `source`, `crash`, `crash-reader`, `crash-switching`, `favicon` and `audio` passed. `crash-navigate` hit a harness BiDi WebSocket error.
- Self-tests: `--self-test --only crash-reader`, `--only source` and `--only find` all passed.
- `ng-040-internals-catalogue-lines` is green after each module edit. Catalogue rows were remapped by git hunk, not with `--fix`.
- `scripts/verify-platform.sh --quick` exit 0 inside `nix develop .#theia` at `23c08bb5` only. It has not been re-run on the later commits.

## Critical Issues

### CR-01: Reload tab cannot recover a tab that crashed in reader view

**File:** `theia/extensions/tab-uris/src/browser/web-tab.ts:894-906`, `powerbrowser/shell/PowerBrowserAPI.sys.mjs:3272-3274`, `powerbrowser/shell/PowerBrowserAPI.sys.mjs:3504`, `powerbrowser/shell/PowerBrowserAPI.sys.mjs:6757-6759`

**Issue:** The push sends `url: webTabPushedSpec(pageSpec)`. `webTabPushedSpec` strips only a `view-source:` prefix, so in reader view Theia's `widget.url` becomes `about:reader?url=https%3A...` (applyState, `web-tab.ts:1143`). The crashed-tab Reload path is `recreate()`:

1. It sends `webTabClose`, which removes the overlay and arms the crashed history.
2. It then sends `webTabOpen` with `this.url`.
3. `webTabOpen` refuses every URL that is not http(s) or `about:blank` and returns `refused-scheme`.
4. `lostReply()` marks the view lost. The crash UI stays, because `renderState` checks `crashed` first.

Every later click on Reload tab runs `reopen()` with the same `about:reader` URL and gets the same refusal. The result:

- The tab has no overlay and cannot be recovered. The user has to close it.
- The history armed by `keepCrashedWebTabHistory` is never taken, because `webTabOpen` returns before `takeWebTabHistory`, so it stays in memory.

The live `crash` row crashes a plain http page, so it cannot see this. PAGE-11's promise ("Reload tab ... never a blank page") does not hold for reader view, which this same phase delivers.

**Fix:** Send Theia the page URL, not the reader URL, the same way view source already does. Then `widget.url` stays http(s) and the reopen succeeds:

```js
function webTabPushedSpec(spec) {
  if (typeof spec !== "string") return spec;
  if (spec.startsWith("view-source:")) return spec.slice("view-source:".length);
  if (spec.startsWith("about:reader?")) {
    try {
      const inner = new URLSearchParams(spec.slice("about:reader?".length)).get("url");
      if (inner && /^https?:\/\//i.test(inner)) return inner;
    } catch {}
  }
  return spec;
}
```

`isReaderMode` already tells Theia that the overlay is in reader view, so the toggle does not need the raw URL. Add a `crash` live variant that crashes a tab in reader view, and a plant that removes the reader branch.

## Warnings

### WR-01: Reader or view-source history entries make the NG-034 wall drop all of a tab's history

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:839-842` (wall), `:806-818` (crash keep), `:783-795` (quit save)

**Issue:** `takeWebTabHistory` returns null unless every entry is `^https?://`. Before Phase 32, `OVERLAY_LOCATION` kept other schemes out of overlay history. Since `0b63fe28`, `about:reader?url=...` and `view-source:http...` entries commit into session history. The live `reader` scenario itself leaves one: after leaving reader view, `forward === true`. Both the crash keep and the quit-time save collect those entries. The open then returns null and falls back to `firstWebTabLoad`. The effect: any tab that ever visited reader view or view source loses all its back/forward history on Reload tab after a crash and at the next launch, with no log line.

**Fix:** In `entryUrlOk`, admit `about:reader?url=<http(s)>` and `view-source:<http(s)>` entries after checking the inner URL. Alternatively, rewrite those entries to the inner URL in `keepCrashedWebTabHistory` and `saveWebTabHistories`. Add a `crash` live variant that visits reader view before the crash and asserts the entry count.

### WR-02: View-source titles reach Theia through the history reply

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:4685`

**Issue:** The push redacts both `url` and `title` with `webTabPushedSpec`. The title is redacted because a view-source document's title is its `view-source:` URL. The `webTabHistory` reply redacts only `url`: `title: String(e.title || "")`. A view-source entry's title therefore reaches Theia's history menu, which breaks D-22 ("Theia never holds a `view-source:` URL across the scheme wall"). The live `source` check reads only pushes and `widget.url`, never a history reply, so it cannot catch this.

**Fix:** Use `title: webTabPushedSpec(String(e.title || ""))`, and make `scenarioSource` also request `webTabHistory` and assert that no reply field contains `view-source:`.

### WR-03: A favicon that arrives after the last state push never reaches Theia

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:6454-6470`

**Issue:** `setIcon` writes `tab.image` and fires `TabAttrModified` but does not schedule a state push. `webTabFaviconOf` is read only when some other event pushes. LinkHandlerParent icons are loaded asynchronously and often land after the top-level network STOP push, so the tab and strip keep the globe until an unrelated title or security push happens. The live `favicon` row uses an inline `data:` icon that resolves before the load settles, so it cannot catch this race.

**Fix:** Push after the icon changes:

```js
tab.image = spec || null;
fireTabEvent(tab, "TabAttrModified", { changed: ["image"] });
webTabPagePush(tab.linkedBrowser);
```

Make the scenario page set its `<link rel=icon>` from a timer after `load`.

### WR-04: A crash during a process switch is never pushed

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:5186-5190`, `:3429`, `:5107`

**Issue:** `DidChangeBrowserRemoteness` adds the overlay to `switchingOverlays`. The flush then drops every push until a top-level location change or network STOP passes `settled = true`. The crash listener calls `webTabPagePush`, which calls `scheduleWebTabState(..., settled=false)`. If the new process crashes before the overlay settles (a page that crashes on load after a cross-site switch), no settle event ever arrives from a dead process, and `crashed: true` is never pushed. The tab stays on the previous push with no crash UI. That is the "blank page" PAGE-11 forbids.

**Fix:** In the crash listener, schedule with `settled = true`, or call `switchingOverlays.delete(browser)` before the push. A crashed overlay has nothing left to settle.

### WR-05: Highlight-all cannot be turned off while the find bar is open

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:4868-4870`, `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx:719-726`

**Issue:** `toggleFindOption` runs the query again with `highlightAll: false`. The arm only ever calls `finder.highlight(true, ...)` and never `highlight(false)`, so the highlights stay after the user turns the toggle off.

**Fix:** Call `finder.highlight(data.highlightAll === true, data.query, false);` on every find. The Finder clears highlights when given false.

### WR-06: After a navigation, Enter and F3 in the find bar do nothing

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:4880-4885`, `:5361` (`resetWebTabPage`), `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx:705-716`

**Issue:** A new page resets the chrome-side `findQuery` to null. Theia keeps `tab.findQuery`, and the input still shows it (`defaultValue`). Enter, F3 and the step buttons send `webTabFindNext`, which answers `no-query`. The widget ignores that answer, so the bar looks live but does nothing until the user edits the text.

**Fix:** When `findNext` gets `where: 'no-query'` and `tab.findQuery` is not empty, call `tab.find(tab.findQuery, this.findOptions)`. Alternatively, let `webTabFindNext` take an optional bounded `query` and use it when the stored query is null.

### WR-07: The AboutReaderParent throw stops extensions from receiving `isArticle` updates

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:5191-5204`; upstream `browser/actors/AboutReaderParent.sys.mjs:120-130`, `:160-170`

**Issue:** The closure SUMMARY calls the console throw "harmless noise". It is not harmless. In `Reader:UpdateReaderButton`, the parent calls `this.updateReaderButton(browser)` before `this.callListeners(message)`. For the selected overlay, `browser.getTabBrowser()` returns the stand-in, because the stand-in's `getTabForBrowser` returns the host node. `doc.getElementById("reader-mode-button")` is then null, so `button.setAttribute` throws, and `callListeners` never runs. `ext-browser.js:365/625` uses that listener to emit `tab-isarticle`, so `tabs.onUpdated` with the `isArticle` property never fires for the active tab. This is a Pitfall-2 behaviour change that no SUMMARY records.

**Fix:** In this branch, the real fix is to stop the throw. A stand-in `getTabBrowser` change would need its own Pitfall-2 record. The simpler option is to define hidden stub elements `#reader-mode-button`, `#menu_readerModeItem` and `#key_toggleReaderMode` in the shell document. Either way, record the change and add an `ext-tab-host-live` row that checks `tabs.onUpdated` `isArticle` on the active tab.

### WR-08: Navigating a crashed tab fails silently

**File:** `theia/extensions/tab-uris/src/browser/web-tab.ts:824-845`, `:871-874`

**Issue:** Only `reload()` checks `crashed` and recreates the overlay. `navigate()`, `back()`, `forward()` and `gotoIndex()` still send their kinds to the dead remote tab. 32-08 Deviation 3 recorded the results: a fresh load throws in chrome, and `gotoIndex` is refused (`remoteTab is null`). The Back and Forward buttons stay enabled from the last push. A URL typed into the pill of a crashed tab, or a Back click, does nothing visible. If the throw reaches `settle()`, the view is marked lost, so the next Reload only reopens (`already-open`) and a second click is needed to recreate.

**Fix:** While `crashed` is set, send navigations through `recreate()`. For `navigate`, update `this.url` and then recreate. Disable Back and Forward while crashed.

### WR-09: The live find-step checks pass when the step does nothing

**File:** `scripts/verify-page-tools-live.mjs:316-327`

**Issue:** The FindNext and F3 waits accept any later state push with `findTotal >= 3 && findCurrent >= 1 && findStatus !== null`. The `webTabFindNext` arm always calls `requestMatchesCount`, so it pushes the same counts even when `findAgain` does nothing. If `findAgain` were deleted, both checks would stay green. CLAUDE.md treats this as a check that cannot go red.

**Fix:** Record `findCurrent` from the `hit` push and require the step push to carry a different `findCurrent`, or the wrapped value. Add a plant that turns `findAgain` into a no-op and require it to go red.

### WR-10: The audio fix covers the harness only; the product binary still plays no sound

**File:** `scripts/lib/firefox-bidi.mjs` (`pulseLibDir`, spawn `env`)

**Issue:** The live shell is started with `LD_LIBRARY_PATH` pointing at libpulse, which is read from `config.status`. The 32-01 SUMMARY states that `objdir/dist/bin/powerbrowser` started by hand, the path CLAUDE.md documents, "produces no sound". The PAGE-05 live row therefore proves audio only under a loader path that no user has, and PAGE-05 is marked complete. No check can go red for the shipped launch path.

**Fix:** Fix the product launch, for example the launcher/wrapper or the Nix package `wrapProgram --prefix LD_LIBRARY_PATH` for libpulse. Remove the harness-only environment so that the audio row tests the real launch. Or keep it and add a row that starts the binary without it and expects sound. At minimum, record the open item in the WINDOWS ledger and do not mark PAGE-05 complete.

### WR-11: The tab audio mark cannot be reached from the keyboard

**File:** `theia/extensions/chrome-bar/src/browser/tab-strip-widget.tsx:664-676`

**Issue:** The mute affordance is a `<span role='button'>` with no `tabIndex` and no key handler, so keyboard and assistive-technology users cannot operate the tab's "one tab mute affordance". Ctrl+M works only while a web page has focus.

**Fix:** Use a `<button type="button">`, or add `tabIndex={0}` and an Enter/Space `onKeyDown` handler that calls the same `setMuted`.

## Info

### IN-01: `webTabCloseToolbox` duplicates the stock TabClose handling

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:6743-6754`, `:3895`

**Issue:** `TabDescriptorFront.setLocalTab(node)` listens for `TabClose` on the host node (upstream `devtools/client/fronts/descriptors/tab.js:130-131, 300-309`), and that handler already destroys a window-host toolbox. `tabHostDropTab` fires `TabClose` before `webTabCloseToolbox` runs. The D-23 amendment says "stock TabClose wiring is local-tab only", but the host node is the local tab. The live `devtools` row cannot tell which path closed the toolbox.

**Fix:** Keep the explicit destroy only as a fallback, and correct the D-23 rationale. Alternatively, plant a fault that suppresses the node's `TabClose` to prove the fallback is needed.

### IN-02: `webTabDevtoolsReply` answers "opened" before it knows, and a synchronous shim throw escapes

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:6725-6740`

**Issue:** The `DevToolsShim` forwarding wrapper calls `initDevTools()` synchronously. A throw there is not caught by `.catch`, and the arm rejects. A failed async open still replies `where: "opened"`.

**Fix:** Wrap the call in `try`, and either await it with a timeout or reply `"opening"`.

### IN-03: The `file:` branch of view source is dead code

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:6708`

**Issue:** Overlays can only hold http(s) (`webTabOpen`, `OVERLAY_LOCATION`), and `OVERLAY_LOCATION` would replace `view-source:file:` with `about:blank` anyway.

**Fix:** Narrow the check to `^https?:`.

### IN-04: Unused copy and hard-coded Ctrl labels

**File:** `theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts` (`viewSourceTooltip`, `zoomIn`, `zoomOut`, `zoomReset`)

**Issue:** These keys have no reader, but they are admitted in the reviewed copy register (`verify-shell-error-copy.mjs`). Copy such as `Press Ctrl+P`, `(Ctrl+U)` and `(Ctrl++)` hard-codes Ctrl, while `PAGE_SHORTCUTS` carries a `macLabel`.

**Fix:** Delete the unused keys, or build the labels from `PAGE_SHORTCUTS` with the platform formatter.

### IN-05: Stale contract text and hand-kept lists in the reader-crash gate

**File:** `scripts/verify-page-tools-reader-crash.mjs:9`, `:168-171`, `:29-30`

**Issue:** The gate text says "a crashed tab reloads through webTabReload". It does not: it recreates through close and open with the kept history. `NEW_KINDS` and `STATE_FIELDS` are hand-kept lists, so a field that is added and not pushed goes unnoticed here. `verify-site-identity` partly covers that case.

**Fix:** Update the text, and derive the new-kind and field sets (for example from the `Phase 32` comment blocks or the `WebTabState` diff against the push literal).

### IN-06: Zoom can skip a step

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:5297-5321`

**Issue:** Each step starts from the nearest rung, not from the next rung above or below the current zoom. From 1.08 (an extension or wheel zoom), zoom in goes to 1.2 and skips 1.1.

**Fix:** Pick the first rung strictly above (or below) `current`, as `ZoomManager.enlarge` and `reduce` do.

### IN-07: Closing a crashed tab keeps its history in memory

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:3866-3868`

**Issue:** The keep runs on every `webTabClose` of a crashed overlay, including a user close (`onCloseRequest`). The entry stays in `savedWebTabHistories` and `armedWebTabHistories` under the row key until a later open with that key takes it. A reopen from closed-tab history then restores the crashed session's history unasked. Also, the 32-08 threat flag says the system triggering principal "gives the view-source document chrome privileges". That is inaccurate: the document principal comes from the URL. The flag should be corrected so that later reviews do not act on it.

**Fix:** Keep the history only when the frontend asks for a recreate, for example with a `keepHistory: true` flag on `webTabClose` that is valid only for a crashed overlay.

---

_Reviewed: 2026-10-31_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
