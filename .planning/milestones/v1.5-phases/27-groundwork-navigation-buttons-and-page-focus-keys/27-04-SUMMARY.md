---
phase: 27-groundwork-navigation-buttons-and-page-focus-keys
plan: 04
subsystem: chrome-bar (nav buttons, New Tab), copy gate, live harness
tags: [session-history-menu, press-and-hold, reload-guard, hard-reload, middle-click, drop-on-new-tab, configured-app-name]
status: complete

requires:
  - phase: 27-02
    provides: "WebTabWidget.history(), gotoIndex(), reload(bypassCache); WebTabOpenHandler.openInBackground; .lm-Menu in BLOCKING_LAYER_SELECTOR"
  - phase: 27-01
    provides: "single Reload/Stop element, pb-live-probe harness, verify-nav-keys-live"
provides:
  - "chrome-bar-copy.ts: CHROME_BAR_COPY, appSubject(), historyLabel(); NEW_TAB_LABEL exported from web-tab.ts"
  - "Back/Forward history menu (right-click, context-menu key, Shift+F10, 500 ms hold) through ContextMenuRenderer"
  - "650 ms post-Stop Reload guard; Shift+click hard reload; middle-click and Ctrl+click into a background tab"
  - "Drop of an http(s) link or plain-text URL on New Tab opens a focused foreground tab"
  - "verify-shell-error-copy: chrome-bar-copy.ts surface pinned by EXPECTED_NAV_COPY, brand-literal ban, 3 plants"
  - "live scenarios history, long-press, history-error, hard-reload-click, stop-guard, middle-click, drop"
affects: [27-05, 27-06, 27-07, 27-08, Phase 29 (dropped-text search), any later plan editing chrome-bar copy]

actuals:
  tokens: 13973
  tasks: 3
  commits: 3
plan_head_before: 52bb8f30b89b6b17009e5dfa4eda1bf4cbeed6ea
plan_head_after: d3798011b865c2da07e18aa452b7d8c264fd5347

tech-stack:
  added: []
  patterns:
    - "Per-request CompoundMenuNode passed to ContextMenuRenderer.render({ menu }), never registered in the menu model"
    - "Chrome-bar copy in one frozen object; the product named by FrontendApplicationConfigProvider.applicationName, never a literal"
    - "Live scenarios run in registry order regardless of the --scenario order given"

key-files:
  created:
    - theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts
  modified:
    - theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx
    - theia/extensions/chrome-bar/src/browser/chrome-bar.css
    - theia/extensions/tab-uris/src/browser/web-tab.ts
    - scripts/verify-shell-error-copy.mjs
    - scripts/verify-nav-keys-live.mjs
    - scripts/lib/pb-live-probe.mjs
    - .planning/phases/27-groundwork-navigation-buttons-and-page-focus-keys/27-UI-SPEC.md

key-decisions:
  - "Assumption A9 held: Theia renders isToggled as the stock check mark (lm-mod-toggled, codicon check \\eab2 in core menus.css); the live history scenario asserts the class on the current entry only"
  - "The drop handler stops propagation for accepted drags, because Theia's document-level dragover listener forces dropEffect 'none' on every drag; without it no drop on New Tab could ever fire"
  - "Link data that is readable at dragover and not http(s) is refused there (no ring); in a real drag the data is hidden until drop, so the ring shows by type and the drop handler validates"
  - "Live checks interact with each page (a trusted key) before navigating, because browser.navigation.requireUserInteraction makes canGoBack skip uninteracted entries, as in Firefox"

requirements-completed: [NAV-01, NAV-02, NAV-03, NAV-06]

coverage:
  - id: D1
    description: "Right-click on Back opens one .lm-Menu with the served titles newest first, current checked, overlay hidden; choosing /h1 navigates, closes the menu, shows and focuses the page"
    requirement: NAV-03
    verification:
      - kind: e2e
        ref: "node scripts/verify-nav-keys-live.mjs --scenario history"
        status: pass
  - id: D2
    description: "A 600 ms press opens the menu, the release does not navigate, Escape closes it and focuses Back"
    requirement: NAV-03
    verification:
      - kind: e2e
        ref: "node scripts/verify-nav-keys-live.mjs --scenario long-press"
        status: pass
  - id: D3
    description: "A failed history read shows one disabled item starting with the configured application name"
    requirement: NAV-03
    verification:
      - kind: e2e
        ref: "node scripts/verify-nav-keys-live.mjs --scenario history-error"
        status: pass
      - kind: other
        ref: "node scripts/verify-shell-error-copy.mjs --self-test (3 new nav-copy plants)"
        status: pass
  - id: D4
    description: "Shift+click on Reload sends no-cache; a plain click does not"
    requirement: NAV-02
    verification:
      - kind: e2e
        ref: "node scripts/verify-nav-keys-live.mjs --scenario hard-reload-click"
        status: pass
  - id: D5
    description: "A Reload click on the first loaded push is ignored; one 700 ms later reloads (exactly one extra GET, after the late click)"
    requirement: NAV-01
    verification:
      - kind: e2e
        ref: "node scripts/verify-nav-keys-live.mjs --scenario stop-guard"
        status: pass
  - id: D6
    description: "Middle-click on Back and Ctrl+click on Reload each add a tab directly after the current one, which stays current"
    requirement: NAV-06
    verification:
      - kind: e2e
        ref: "node scripts/verify-nav-keys-live.mjs --scenario middle-click"
        status: pass
  - id: D7
    description: "A uri-list drop opens a focused current tab with the ring during the drag; javascript: is refused; a plain-text URL opens without the ring"
    requirement: NAV-06
    verification:
      - kind: e2e
        ref: "node scripts/verify-nav-keys-live.mjs --scenario drop"
        status: pass

duration: 21min
completed: 2026-10-21
---

# Phase 27 Plan 04: Back/Forward history menu, button gestures and New Tab drop Summary

**Back and Forward now open the tab's session history as a stock Theia `.lm-Menu` (right-click, the context-menu key, Shift+F10, or a 500 ms hold), with copy that names the configured application name. Reload ignores clicks for 650 ms after Stop, Shift+click hard-reloads, middle-click and Ctrl+click open a background tab, and an http(s) link dropped on New Tab opens in a focused tab. Every gesture is proven live.**

## Performance

- **Duration:** about 21 min
- **Completed:** 2026-10-21T00:02Z
- **Tasks:** 3 of 3
- **Files:** 1 created, 7 modified

## Accomplishments

- NAV-03: `openHistoryMenu` builds a `CompoundMenuNode` per request from the `history()` reply: newest entry at the top, the current one toggled, other entries `gotoIndex` and then `focusPage`. A failed read shows one disabled item. `onHide` returns focus to the button unless an entry ran. The page overlay hides while the menu is open through the existing `.lm-Menu` layer rule.
- Copy: `chrome-bar-copy.ts` holds every new sentence in one frozen object. `appSubject()` reads `applicationName` and falls back to "The browser". `historyLabel()` handles New Tab, title, URL and "Untitled page", and cuts at 60 characters. The copy gate derives the object's literals and pins them as a set, bans the brand literal, and applies the shared internal-identifier rules, now factored into `leakFailures()`.
- NAV-01/NAV-02: the 650 ms guard starts on a `loading` true-to-false flip in the state subscription. Shift+click on Reload calls `reload(true)`.
- NAV-06: `openInNewTab` opens the adjacent history entry or the current URL through `openInBackground`, and joins the active group if one is set (errors log their name only). New Tab accepts link and plain-text drags and opens only `^https?://`.

## Task Commits

1. **Task 1 (tracer): history menu, copy module, copy gate surface, `history` scenario**: `aef57b8` (feat). The tracer gate re-ran `<verify>` end to end and it passed before any expansion.
2. **Task 2: hold, guard, Shift+click, middle-click and Ctrl+click, five scenarios**: `a5d0b95` (feat)
3. **Task 3: drop on New Tab, CSS ring, UI-SPEC sentence, `drop` scenario**: `d379801` (feat)

## Assumption A9 (requested by the plan's output section)

Theia renders `isToggled: true` as the stock check mark. `DynamicMenuWidget` passes it to Lumino, which adds `lm-mod-toggled`, and core `menus.css` draws codicon `\eab2` (check) for `.lm-Menu-item.lm-mod-toggled > .lm-Menu-itemIcon::before`. The live `history` scenario requires the class on the `/h3` entry and on no other entry. It does not read the computed pseudo-element, and no screenshot was taken.

## Verification run

- `scripts/verify-platform.sh --quick`: PASS after each task and at the end.
- `node scripts/verify-nav-keys-live.mjs` (full): all 14 scenarios PASS, the 7 new ones included.
- `node scripts/verify-nav-keys-live.mjs --self-test`: PASS. The clean control over all 14 scenarios is green, and the 3 existing plants go red on their targets.
- `node scripts/verify-shell-error-copy.mjs` and `--self-test`: PASS, with 8 modes-copy plants, 3 of them new.
- `verify-web-tab-bridge`, `verify-chrome-bar-commands`, `tsc -b tab-uris`, `tsc --noEmit -p chrome-bar`: PASS.
- `scripts/verify-platform.sh --only gui02-web-tab-live`: PASS. Back and Forward now route through `onNavClick`, and that path did not regress.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Theia's document-level drag listener would have made every New Tab drop impossible**
- **Found during:** Task 3, live `drop`
- **Issue:** `@theia/core` `frontend-application.js` sets `dropEffect = 'none'` and calls `preventDefault()` on every `dragenter` and `dragover` at the document. It runs after React's root listener, so the copy effect was overwritten and a real drop would never be delivered.
- **Fix:** accepted drags call `stopPropagation()` in the New Tab handler, with a one-line reason. Refused drags still reach Theia's listener and end with `dropEffect: 'none'`. The `drop` scenario therefore judges a refusal by `dropEffect`, not by `defaultPrevented`.
- **Commit:** d379801

**2. [Rule 3 - Blocking] Scripted navigation left Back disabled**
- **Found during:** Task 1, live `history`
- **Issue:** `RemoteWebNavigation.canGoBack` is `sessionHistory.canGoBackFromEntryAtIndex`, and `browser.navigation.requireUserInteraction` defaults to true, so entries no user interacted with are skipped. Firefox behaves the same way. This was a defect in the check, not in the product.
- **Fix:** `interactWith()` focuses the overlay and presses a trusted key at the parent before each navigation in the multi-step scenarios.
- **Commit:** aef57b8

**3. [Rule 1 - Bug] Copy gate false positive on a TypeScript generic**
- **Found during:** Task 2
- **Issue:** the widget-copy text pattern `[^=]>…<` read `HTMLButtonElement>): Promise<` as text content.
- **Fix:** the widget uses `type ButtonEvent` / `ButtonDragEvent` aliases. The gate is unchanged.
- **Commit:** a5d0b95

**4. [Rule 2 - Correctness] A javascript: link is refused at dragover when its data is readable**
- The plan's `drop` scenario requires no ring for a `javascript:` drag, but the planned type-only classification would show one. `dropKindOf()` refuses link data that is readable and not http(s). In a real OS drag the data is hidden until drop (P10), so the ring shows by type and the drop handler's `^https?://` check is the wall.
- **Commit:** d379801

### Harness changes outside the plan's file list

- `scripts/lib/pb-live-probe.mjs`: the page server gained `delayMs`, so `stop-guard` gets separate loading and loaded pushes, and it now records an `at` timestamp per GET. `stop-guard` uses the timestamp to require the one extra GET to come after the late click.
- `verify-nav-keys-live.mjs` now runs the chosen scenarios in registry order. This keeps the reload scenarios on the session's first tabs, away from the deferred shared-process reload defect, and keeps `theia-keeps-esc` after its control.

## Known Stubs

None. The error item's `run` does nothing on purpose: the item is disabled.

## Threat Flags

None. The drop (T-27-13), history labels (T-27-14) and background open (T-27-15) are the surfaces in the plan's threat model. Each mitigation is in place: the `^https?://` check plus the chrome scheme wall, plain-string Lumino labels cut at 60 characters, and `openInBackground`'s http(s) throw.

## Notes for later plans

- Back, Forward, Reload and New Tab still carry native `title=`. 27-05 (tooltips, NAV-05) removes them. The copy gate's widget pin will then need its `title` rows edited.
- Ctrl+click on Reload inside the 650 ms guard is ignored like a plain click.
- Back/Forward middle-click takes `index ± 1`, not Firefox's user-interaction-skipping target.

## Self-Check: PASSED

- FOUND: theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts, chrome-bar-widget.tsx, chrome-bar.css, tab-uris web-tab.ts, scripts/verify-shell-error-copy.mjs, scripts/verify-nav-keys-live.mjs, scripts/lib/pb-live-probe.mjs, 27-UI-SPEC.md
- FOUND commits: aef57b8, a5d0b95, d379801 (ancestors of HEAD)
