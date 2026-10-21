---
phase: 27-groundwork-navigation-buttons-and-page-focus-keys
verified: 2026-10-21T06:50:10Z
status: human_needed
score: 70/71 must-haves verified
covered_files:
  - .planning/phases/27-groundwork-navigation-buttons-and-page-focus-keys/27-01-PLAN.md
  - .planning/phases/27-groundwork-navigation-buttons-and-page-focus-keys/27-01-SUMMARY.md
  - .planning/phases/27-groundwork-navigation-buttons-and-page-focus-keys/27-02-PLAN.md
  - .planning/phases/27-groundwork-navigation-buttons-and-page-focus-keys/27-02-SUMMARY.md
  - .planning/phases/27-groundwork-navigation-buttons-and-page-focus-keys/27-03-PLAN.md
  - .planning/phases/27-groundwork-navigation-buttons-and-page-focus-keys/27-03-SUMMARY.md
  - .planning/phases/27-groundwork-navigation-buttons-and-page-focus-keys/27-04-PLAN.md
  - .planning/phases/27-groundwork-navigation-buttons-and-page-focus-keys/27-04-SUMMARY.md
  - .planning/phases/27-groundwork-navigation-buttons-and-page-focus-keys/27-05-PLAN.md
  - .planning/phases/27-groundwork-navigation-buttons-and-page-focus-keys/27-05-SUMMARY.md
  - .planning/phases/27-groundwork-navigation-buttons-and-page-focus-keys/27-06-PLAN.md
  - .planning/phases/27-groundwork-navigation-buttons-and-page-focus-keys/27-06-SUMMARY.md
  - .planning/phases/27-groundwork-navigation-buttons-and-page-focus-keys/27-07-PLAN.md
  - .planning/phases/27-groundwork-navigation-buttons-and-page-focus-keys/27-07-SUMMARY.md
  - .planning/phases/27-groundwork-navigation-buttons-and-page-focus-keys/27-08-PLAN.md
  - .planning/phases/27-groundwork-navigation-buttons-and-page-focus-keys/27-08-SUMMARY.md
  - powerbrowser/INTERNAL-APIS.md
  - powerbrowser/shell/PowerBrowserAPI.sys.mjs
  - powerbrowser/shell/powerbrowser.js
  - scripts/check-internals-boundary.sh
  - scripts/lib/pb-live-probe.mjs
  - scripts/verify-nav-keys-live.mjs
  - scripts/verify-platform.sh
  - scripts/verify-shell-error-contract.mjs
  - scripts/verify-shell-error-copy.mjs
  - scripts/verify-shell-gbrowser-standin.mjs
  - scripts/verify-shortcut-relay.mjs
  - scripts/verify-web-tab-bridge.mjs
  - theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts
  - theia/extensions/chrome-bar/src/browser/chrome-bar-frontend-module.ts
  - theia/extensions/chrome-bar/src/browser/chrome-bar-keybindings.ts
  - theia/extensions/chrome-bar/src/browser/chrome-bar-preferences.ts
  - theia/extensions/chrome-bar/src/browser/chrome-bar-shortcuts.ts
  - theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx
  - theia/extensions/chrome-bar/src/browser/chrome-bar.css
  - theia/extensions/chrome-bar/src/browser/tab-strip-widget.tsx
  - theia/extensions/tab-uris/src/browser/profile-storage.ts
  - theia/extensions/tab-uris/src/browser/tab-uris-frontend-module.ts
  - theia/extensions/tab-uris/src/browser/web-tab.ts
covered_digest: "v3:sha256:4f7505a21861505ca57f512fb34ee036a2860f10fea587eb664e9887830102ed"
behavior_unverified: 1
overrides_applied: 0
deferred:
  - truth: "A rebase that adds a gBrowser call in an actor parent outside browser/actors and toolkit/actors (for example ProfilesParent addTrustedTab) fails the stand-in gate (T-27-11, REVIEW IN-15)"
    addressed_in: "Phase 35"
    evidence: "27-SECURITY.md Open Items: T-27-11 carried to Phase 35 (Shell Furniture), which changes the gBrowser stand-in"
behavior_unverified_items:
  - truth: "The post-hold click suppression on Back/Forward is cleared however the hold ends, so a later keyboard Enter or Space is never swallowed (WR-01 off-button release, IN-25 pointercancel)"
    test: "Hold Back for over 500 ms until the history menu opens, drag the pointer off the button and release (and separately: end a hold with a pointercancel, e.g. a touch/pen hold interrupted by the compositor); press Esc, focus Back and press Enter"
    expected: "Enter goes back one page; the release that ended the hold did not navigate"
    why_human: "The live long-press scenario releases on the button only; no scenario drives an off-button release or a pointercancel (27-REVIEW-FIX.md marks both 'requires human verification')"
human_verification:
  - test: "Real keyboard on KDE Wayland, a web page focused: Ctrl+T, Ctrl+W, Ctrl+R, F5, Ctrl+Shift+R, Ctrl+F5, Alt+Left, Alt+Right, Alt+Home (Home on), Alt+D, Ctrl+L, F6, Shift+F6, Ctrl+Tab, Ctrl+Shift+Tab, Ctrl+PageUp, Ctrl+PageDown, Alt+1..Alt+9, Esc on a loading page"
    expected: "Each does what Firefox does; F6/Shift+F6 in the pill return focus to the page"
    why_human: "The live check synthesises keys at the parent through nsITextInputProcessor (keys: tip); PROJECT.md counts that as evidence, not UAT"
  - test: "Real keyboard in an untitled editor and a terminal: F5, F6, F11, Ctrl+P, Ctrl+K, Ctrl+Tab, Alt+Left, Ctrl+R, Ctrl+L, Ctrl+W"
    expected: "Theia's own meaning runs (Ctrl+P opens Quick Open, F11 toggles full screen, Ctrl+L stays in the editor/terminal, Ctrl+R in a terminal reaches the shell); no browser action runs"
    why_human: "theia-keeps-keys proves each key reached the Theia frame and no page-key row fired; it does not assert that Theia's command actually executed"
  - test: "Physical mouse back/forward buttons (buttons 4/5, GTK AppCommand) over a web page, and over the Theia frame"
    expected: "Over the page: back/forward in that page; over Theia: nothing chrome-side"
    why_human: "mouse-buttons dispatches a chrome-side CommandEvent('AppCommand'); a real button press through GTK on Wayland is not exercised"
  - test: "Post-hold suppression cleanup (WR-01, IN-25): see behavior_unverified_items"
    expected: "Enter on Back after an off-button release or a pointercancel goes back one page"
    why_human: "No automated scenario covers either path"
  - test: "Raise the window with a KWin script and capture with spectacle: nav-button tooltips in Coding, Browsing and Organising; hold Back about 500 ms; narrow the window with Home shown"
    expected: "One-line tooltips above the bar (Coding, Browsing) and on the toolbar row below the bar (Organising), never over the page; the hold feels like Firefox; the pill shrinks to 120px before any button wraps or clips"
    why_human: "Visual and timing quality; the live check reads geometry and computed min-width only, and never shrinks the window"
  - test: "Drag a link from another application (and plain text containing an http URL) onto New Tab"
    expected: "Ring shows for a link during the drag; drop opens one focused web tab; a javascript: or file: drop opens nothing"
    why_human: "The drop scenario uses a synthesised DataTransfer whose data is readable at dragover; in a real OS drag the data is hidden until drop (P10)"
  - test: "DECISION (escalation): the pre-existing shared-process blank defect (deferred-items.md 'From 27-02' and 'From 27-08') has no owner"
    expected: "Chris assigns it to a phase or records it in WINDOWS.md; until then, Reload of the fifth or later same-site web tab can replace the page with about:blank"
    why_human: "Not caused by Phase 27 and outside its must-haves, but it degrades NAV-01/NAV-02 in real use and is tracked only in a phase-local file and one STATE.md line (gsd-tools windows append refused)"
  - test: "Autonomous judgment-tier prohibitions (14, listed in the report): unverified-prohibition, human review recommended"
    expected: "Each LLM-judge verdict below is confirmed or rejected"
    why_human: "Judgment-tier prohibitions get a non-authoritative LLM verdict only in an autonomous run"
---

# Phase 27: Groundwork, Navigation Buttons and Page-Focus Keys Verification Report

**Phase Goal:** The navigation buttons and Firefox's browser keys work while a web page has focus, built on the shared channel every later v1.5 phase extends
**Verified:** 2026-10-21T06:50:10Z
**Status:** human_needed
**Re-verification:** No (initial verification)

## Evidence I produced myself (not taken from summaries)

- The Theia bundle `theia/applications/browser/lib/frontend/bundle.js` (23:15:43) is newer than every file under `chrome-bar/src` and `tab-uris/src` (last edit 23:13:21). It contains the IN-25 `pointercancel` code, so I did not rebuild. The chrome files in `objdir/dist/bin/browser/chrome/browser/content/powerbrowser/` are symlinks through `upstream/powerbrowser -> ../powerbrowser`, so the live run executed the committed `powerbrowser.js` and `PowerBrowserAPI.sys.mjs` (the harness sets `MOZ_PURGE_CACHES=1`).
- `scripts/verify-platform.sh --quick`: **PASS**, "all checks passed", 262 PASS rows. Every phase-relevant row is green: shortcut-relay (+self-test), chrome-bar-typecheck, tab-uris-typecheck, gui02-web-tab-bridge (+self-test), shell-gbrowser-standin (+self-test), internals-boundary (+self-test), internals-catalogue, ng-040-internals-catalogue-lines (+self-test), gui04-registry-shape (+self-test), shell-error-copy-no-internals (+self-test), shell-error-contract (+self-test), scan-brand-residue (+self-test).
- `node scripts/verify-nav-keys-live.mjs` against `objdir/dist/bin/powerbrowser`: **exit 0, all 31 scenarios PASS**, every key on the TIP route.
- `node scripts/verify-nav-keys-live.mjs --self-test`: **exit 0**. The clean control is green and all 11 planted faults went red on their target scenario, each naming the expected text: second-stop-element, row-enabled-under-theia, rows-enabled-in-editor, reply-listener-ungated, relay-row-removed, tab-order-reversed, hover-elsewhere, guard-disabled, close-fallback-removed, pill-scope-removed, hover-below.
- `gsd-tools verify.artifacts` / `verify.key-links` over all 8 plans: 27/27 artifacts pass, 19/19 key links verified.
- `git -C upstream diff` (unstaged) is empty. The phase diff (24a7ba0..HEAD) touches only `.planning/`, `powerbrowser/`, `theia/extensions/` and `scripts/`: no Theia core, no Gecko outside the patch stack.
- No PowerBrowser was running before I started. Every instance was launched by the harness and had exited when it finished.

**Absence-assertion rule (CLAUDE.md).** Every "no key fired" check in the Theia-focus scenarios reads a `command` listener on the product's own `powerbrowser-page-key-*` `<key>` elements (WR-05), or, for F6, a chrome keydown that chrome prevented (WR-07). Each has a positive control in the same session: esc-stop must see the stop row fire, and focus-keys must see `focusAddressF6`/`focusAddressShiftF6`. Plants row-enabled-under-theia, rows-enabled-in-editor and reply-listener-ungated turned these checks red in my run. They are not absence assertions over an emitter the check wrote.

## Goal Achievement

### Roadmap Success Criteria (the contract)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC1 | While a page loads, Reload shows as Stop, and the button or Esc stops the load; Shift+click on Reload, Ctrl+Shift+R and Ctrl+F5 reload without the cache | ✓ VERIFIED | Live: stop-button (one node flips Reload to Stop to Reload; plant second-stop-element red), esc-stop (plant relay-row-removed red), hard-reload-click (server sees no-cache on Shift+click, none on a plain click), page-keys (Ctrl+Shift+R and Ctrl+F5 each add one no-cache GET; Ctrl+R and F5 add one without it). Code: `onReloadClick` in chrome-bar-widget.tsx; `reloadWithFlags(LOAD_FLAGS_BYPASS_PROXY \| LOAD_FLAGS_BYPASS_CACHE)` at PowerBrowserAPI.sys.mjs:3538 |
| SC2 | Right-click or long-press on Back/Forward lists session history and choosing an entry goes to it; middle-click on Back/Forward/Reload opens the result in a new tab; a link dropped on New Tab opens; every button's tooltip names its shortcut | ✓ VERIFIED | Live: history, long-press, history-error, history-channel, middle-click, background-open, drop, tooltips, tooltips-all (all three modes, disabled buttons included; plant hover-below red). Code: `openHistoryMenu` uses `ContextMenuRenderer.render`; `webTabHistory` reproduces Firefox's FillHistoryMenu 15-entry window exactly; `tooltipFor` reads `PAGE_SHORTCUTS` |
| SC3 | With the Home button turned on in settings, the button and Alt+Home load the home page set in settings | ✓ VERIFIED | Live: home, home-empty, home-failure, home-no-tab, page-keys (Alt+Home loads `browser.homePage` with focus left in the page). Code: `chrome-bar-preferences.ts` defaults are false and '' at user scope; relay `home` calls `bar.goHome(tab)` |
| SC4 | With focus inside a web page, Ctrl+T, Ctrl+W, Ctrl+R, F5, Alt+Left, Alt+Right, Alt+D, Ctrl+L, F6, Shift+F6, Ctrl+Tab, Ctrl+Shift+Tab, Ctrl+PageUp, Ctrl+PageDown, Alt+1..9 and mouse buttons 4 and 5 do what they do in Firefox | ✓ VERIFIED (synthesised input) | Live: page-keys, page-prevented, tab-keys (plant tab-order-reversed red), close-split (plant close-fallback-removed red), focus-keys, focus-keys-prevented, focus-keys-debug (plant pill-scope-removed red), mouse-buttons (plant hover-elsewhere red). All 27 rows sit in both tables (powerbrowser.js:335-364, chrome-bar-shortcuts.ts PAGE_SHORTCUTS); shortcut-relay compares them with Firefox's Linux key rows. Real keyboard and real mouse buttons are human items |
| SC5 | In an editor, a terminal or any other non-web tab, F5, F6, F11, Ctrl+P, Ctrl+K and the other clashing keys keep Theia's meaning | ✓ VERIFIED (sampled) | Live: theia-keeps-keys (9 keys in an editor, Ctrl+R and Ctrl+W in a terminal, each reaching the Theia frame with zero row firings; Ctrl+L leaves the pill unfocused, with a positive control), theia-keeps-esc. Mechanism: every `<key>` row is created `disabled` and enabled only while `tabIdOfBrowser(document.activeElement)` is non-null; the F6 listener returns for any non-overlay target; Ctrl+L has the binding `!editorFocus && !terminalFocus`. Whether Theia's command actually ran is a human item |

### Plan must-have truths (merged; roadmap wording kept where a plan truth restates an SC)

| Plan | Truths | Status | Evidence |
|------|--------|--------|----------|
| 27-01 | 7 (Esc stop chain, row disabled under Theia, one Reload/Stop element, Reload disabled with no tab, webTabStop validation, registry rows, backstop live Esc stop) | 7/7 ✓ | esc-stop, theia-keeps-esc, stop-button; `handleWebTabAction` checks `groupSenderIsTheia` and then `webTabIdIsValid`; rows chrome-bar-typecheck (quick, line 4619), nav-keys-live and nav-keys-live-self-test (full, lines 4978-4979) |
| 27-02 | 8 (history window, gotoIndex validation, webTabActivated + activeTabIdOf, rAF coalescer, bypass cache, openInBackground, bridge parity, INTERNAL-APIS rules) | 8/8 ✓ | history-channel (gotoIndex(99) refused), activation, hard-reload-channel, background-open; `scheduleWebTabState` is the only caller of `webTabPush` (3 call sites); gui02-web-tab-bridge and its self-test are green; the rules sit at INTERNAL-APIS.md:26 and :32 |
| 27-03 | 5 (derived call sites, DELIBERATELY_ABSENT, refreshBlocked known gap, six shim globals forbidden, --quick green) | 5/5 ✓ | shell-gbrowser-standin and internals-boundary are green, each with a self-test. Scope limit T-27-11 is deferred to Phase 35 (below) |
| 27-04 | 17 (menu gestures, no spinner, error item, label rules, 15-entry window, overlay hidden while the menu is open, Esc focus return, 650 ms guard, Shift+click, middle-click and Ctrl+click, drop rules, plain-text assumption, backstop entry loads) | 17/17 ✓ | history, long-press, history-error, stop-guard (plant guard-disabled red), hard-reload-click, middle-click, drop. `historyLabel` (cut to 57 plus '…', New Tab, Untitled page) and the 15-entry window were checked by reading the code against Firefox's algorithm; more than 15 entries were not exercised live |
| 27-05 | 8 (settings schema, live show and hide, click opens home, empty value, failure row, long value only in Settings, pill 120px minimum, Home never disabled) | 8/8 ✓ | home, home-empty, home-failure, home-no-tab. The 120px minimum was read as computed min-width only; a narrow-window check is a human item |
| 27-06 | 8 (key actions, tab switching order and wrap, reserved set, Theia-focus rows disabled, no F11/Ctrl+P/Ctrl+K row, Ctrl+L reply-path row, gate registered, backstop page preventDefault) | 8/8 ✓ | page-keys, page-prevented, tab-keys, theia-keeps-keys; shortcut-relay (6 reserved rows, reservation rule checked in both directions after WR-06) |
| 27-07 | 6 (F6 both ways, F6 reply path, mouse 4/5 hovered page only, pill Esc ladder, Theia keeps its keys, old focus-address path gone) | 6/6 ✓ | focus-keys, focus-keys-prevented, mouse-buttons, pill-esc, theia-keeps-keys; no `webTabFocusAddress` or `onDidRequestFocusAddress` remains (acceptance greps; gui02-web-tab-bridge push-kind parity is green) |
| 27-08 | 6 (tooltip text from the table, HoverService at top with pb-chrome-bar-hover and no title, disabled buttons keep tooltips, 26 characters or fewer, aria-keyshortcuts, backstop never over the page) | 6/6 ✓ | tooltips, tooltips-all (Back and Forward disabled in all three modes); shortcut-relay rule (10); `onPointerEnter` so a disabled button keeps its hover |
| derived | Post-hold suppression is cleared however the hold ends (WR-01, IN-25) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | The `done` handler for pointerup and pointercancel is present at chrome-bar-widget.tsx:349-360. No scenario drives an off-button release or a pointercancel |

**Score:** 70/71 truths verified (1 present, behavior-unverified).

**Backstop truths** (27-01, 27-04, 27-06 and 27-08, `verification: backstop`). Each is VERIFIED because I observed the behaviour in my own run of the live check against the real binary: GETs seen by the page server, state pushes, chrome-scope focus, DOM geometry. That is not symbol presence. The scenarios were written by the executor, not held out. The 11 plants going red is what shows they can discriminate.

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | gBrowser call-site derivation misses actor parents outside browser/actors and toolkit/actors (T-27-11, IN-15) | Phase 35 | 27-SECURITY.md Open Items: carried to Phase 35 (Shell Furniture), which changes the gBrowser stand-in |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `powerbrowser/shell/PowerBrowserAPI.sys.mjs` | end-of-file web-tab action section, arms, coalescer, PowerBrowserWebTabs | ✓ VERIFIED | WEB_TAB_ACTION_KINDS at :4093, one routing line at :3667, frozen export at :4234 |
| `powerbrowser/shell/powerbrowser.js` | PAGE_KEYS (27 rows), disabled rows, focus tracker, F6 reply listener, AppCommand | ✓ VERIFIED | :335-454 |
| `theia/extensions/tab-uris/src/browser/web-tab.ts` | onPush router, widgetOf, stop/history/gotoIndex/reload(bypass), openInBackground, WebTabActivationContribution | ✓ VERIFIED | :178-184 union, :263, :271, :581-663, :691, :782 |
| `theia/extensions/chrome-bar/src/browser/chrome-bar-shortcuts.ts` | PAGE_SHORTCUTS, BUTTON_SHORTCUTS, tooltipFor, relay | ✓ VERIFIED | relay resolves `widgetOf(tabId)` and returns when it is missing (no fallback) |
| `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx` | Reload/Stop, history menu, hold, guard, gestures, drop, Home, tooltips, pill F6/Esc | ✓ VERIFIED | |
| `theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts` | CHROME_BAR_COPY, appSubject, historyLabel | ✓ VERIFIED | no brand literal; "The browser" fallback |
| `theia/extensions/chrome-bar/src/browser/chrome-bar-preferences.ts` | browser.showHomeButton / browser.homePage | ✓ VERIFIED | defaults false and '', user scope |
| `theia/extensions/chrome-bar/src/browser/chrome-bar-keybindings.ts` | Ctrl+L when-clause, pill F6 passthrough | ✓ VERIFIED | |
| `theia/extensions/chrome-bar/src/browser/tab-strip-widget.tsx` | switchOrder(anchor) | ✓ VERIFIED | |
| `theia/extensions/tab-uris/src/browser/profile-storage.ts` | quit flush on onPush(SHELL_FLUSH_KIND) | ✓ VERIFIED | |
| `scripts/lib/pb-live-probe.mjs`, `scripts/verify-nav-keys-live.mjs` | harness, 31 scenarios, 11 plants | ✓ VERIFIED | run by me |
| `scripts/verify-shortcut-relay.mjs`, `scripts/verify-web-tab-bridge.mjs`, `scripts/verify-shell-gbrowser-standin.mjs`, `scripts/check-internals-boundary.sh`, `scripts/verify-shell-error-copy.mjs` | derive-and-compare gates with self-tests | ✓ VERIFIED | all green in --quick |

### Key Link Verification

All 19 plan key links were verified by `gsd-tools verify.key-links`. I also traced the ones that matter most:

| From | To | Via | Status |
|------|----|-----|--------|
| powerbrowser.js `<key>` command / F6 reply / AppCommand | PowerBrowserWebTabs.relayShortcut | direct call | ✓ WIRED |
| relayShortcut | ChromeBarShortcutRelay | `shortcut` push, `channel.onPush('shortcut')` | ✓ WIRED (live) |
| relay actions | WebTabWidget stop/reload/back/forward, goHome, switchOrder | action map | ✓ WIRED (live) |
| WebTabWidget.stop/history/gotoIndex | handleWebTabAction | `PowerBrowserGroupMutation`, `WEB_TAB_ACTION_KINDS.has` | ✓ WIRED (live) |
| webTabOpen progress sites | webTabPush | `scheduleWebTabState` (rAF) | ✓ WIRED (live: activation, stop-button) |
| nav buttons | HoverService | `onPointerEnter` → `requestHover({content: tooltipFor(...)})` | ✓ WIRED (live) |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|----------|------|--------|-----------|--------|
| History menu entries | `reply.entries` | `browsingContext.sessionHistory.getEntryAtIndex` in chrome | yes (live titles /h1../h3) | ✓ FLOWING |
| Reload/Stop state | `tab.loading` | coalesced `state` push from webProgress | yes | ✓ FLOWING |
| Tooltip text | `tooltipFor(button)` | PAGE_SHORTCUTS rows (the same rows PAGE_KEYS creates keys from; shortcut-relay set equality) | yes | ✓ FLOWING |
| Home target | `browser.homePage` | PreferenceService, user scope | yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Static gate | `scripts/verify-platform.sh --quick` | exit 0, all checks passed | ✓ PASS |
| Live behaviour, all NAV and KEY scenarios | `node scripts/verify-nav-keys-live.mjs` | exit 0, 31/31 PASS | ✓ PASS |
| Live check discriminates | `node scripts/verify-nav-keys-live.mjs --self-test` | exit 0, clean green, 11/11 plants red | ✓ PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` is declared by this phase. The live check above is the phase's runnable check, and I ran it in my own process.

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|----------------|-------------|--------|----------|
| NAV-01 | 01, 04, 07 | Reload turns into Stop; stop with the button or Esc | ✓ SATISFIED | stop-button, esc-stop, stop-guard, pill-esc |
| NAV-02 | 02, 04, 06 | Bypass cache with Shift+click, Ctrl+Shift+R, Ctrl+F5 | ✓ SATISFIED | hard-reload-channel, hard-reload-click, page-keys |
| NAV-03 | 02, 04 | Right-click or long-press history menu; jump to an entry | ✓ SATISFIED | history, long-press, history-error, history-channel |
| NAV-04 | 05, 06 | Home button and Alt+Home; home page is a setting | ✓ SATISFIED | home*, page-keys Alt+Home |
| NAV-05 | 08 | Tooltip shows the shortcut | ✓ SATISFIED | tooltips, tooltips-all, shortcut-relay rule (10) |
| NAV-06 | 02, 03, 04 | Middle-click opens a new tab; drop a link on New Tab | ✓ SATISFIED | middle-click, background-open, drop |
| KEY-01 | 06 | Ctrl+T/W, Ctrl+R/F5, Alt+Left/Right in a page | ✓ SATISFIED (synthesised) | page-keys, page-prevented |
| KEY-02 | 07 | Alt+D, Ctrl+L, F6/Shift+F6 between pill and page | ✓ SATISFIED (synthesised) | page-keys, focus-keys, focus-keys-prevented, focus-keys-debug |
| KEY-03 | 06 | Ctrl+Tab family and Alt+1..9 | ✓ SATISFIED (synthesised) | tab-keys, close-split |
| KEY-04 | 01, 06, 07 | Theia keeps clashing keys in editors and terminals | ✓ SATISFIED (sampled) | theia-keeps-keys, theia-keeps-esc, shortcut-relay |
| KEY-05 | 07 | Mouse buttons 4 and 5 over a page | ? NEEDS HUMAN for the real button press; mechanism ✓ | mouse-buttons (chrome-dispatched AppCommand) |

All 11 IDs appear in plan frontmatter, and REQUIREMENTS.md maps no other ID to Phase 27. No requirement is orphaned.

### Prohibitions (all `verification: judgment`; autonomous run: LLM-judge verdicts are NON-AUTHORITATIVE, each flagged `unverified-prohibition — human review recommended`)

| # | Plan | Prohibition | LLM verdict | Basis |
|---|------|-------------|-------------|-------|
| 1 | 01 | Shortcut push acts only on the pushed tab; no current-widget fallback | holds | relay `widgetOf(tabId)`; returns when it is missing |
| 2 | 01 | No page URL or title in the shell log from the shortcut, page-focus and webTabStop paths | holds | `sendWebTabPush` logs the kind and err.message; `handleWebTabAction` logs nothing |
| 3 | 02 | History titles and URLs only go back to the requesting frame | holds | returned as the request's actor reply; not pushed |
| 4 | 02 | No history URL or title, or navigated URL, logged by the new arms | holds | no log call in the arms |
| 5 | 02 | No privileged kind through a command id or a key relay | holds | KIND_CLASSES privileged class empty; bridge gate green |
| 6 | 03 | The stand-in fabricates no tab or tabbrowser | holds | no member added; set equality in the gate |
| 7 | 04 | No hard-coded product name or internal identifier in the history menu or its error | holds | `appSubject()`; copy gate pins and its brand-literal ban |
| 8 | 05 | No default home page that contacts an unconfigured host | holds | default '' opens the empty page |
| 9 | 06 | A page cannot trap the user | holds; live proof covers Ctrl+T and Ctrl+W, the Ctrl+Tab family is proven reserved by the gate only (T-27-18 "proof partial") | page-prevented; RESERVED rows |
| 10 | 06 | A key runs no action beyond the tab's own navigation, New Tab, close, switch, pill focus | holds | fixed action map; New Tab runs the fixed `CHROME_BAR_NEW_TAB_COMMAND_ID`, never a pushed id |
| 11 | 06 | Key relay acts only on the pushed tab | holds | same as 1 |
| 12 | 07 | Mouse 4/5 never navigates a page the pointer is known not to be over | holds | a non-overlay hover is a no-op; plant hover-elsewhere red |
| 13 | 07 | Key relay acts only on the pushed tab | holds | same as 1 |
| 14 | 08 | A tooltip never shows a shortcut the relay does not bind | holds | `tooltipFor` reads PAGE_SHORTCUTS; rules (3) and (10) |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (phase diff, 23 files) | — | TBD/FIXME/XXX/TODO/HACK/placeholder added | none found | — |
| chrome-bar-widget.tsx | 349-360 | hold clear does not filter on pointerId (REVIEW IN-27) | ℹ️ Info | a second pointer can end the suppression early |
| verify-nav-keys-live.mjs | CONTROL_OF | theia-keeps-keys is gated on page-keys only, not on focus-keys (IN-26, IN-19) | ℹ️ Info | a `--scenario` subset can score the F6 check without its control; the full run and the registry row are unaffected |
| PowerBrowserAPI.sys.mjs | handleWebTabAction | no try/catch, so raw XPCOM text could reach the frontend reply (IN-02) | ℹ️ Info | the frontend logs it and shows no copy |
| 27-VALIDATION.md | frontmatter | still `status: draft`, `nyquist_compliant: false` | ℹ️ Info | /gsd-validate-phase has not been run |

### Human Verification Required

Chris's standing instruction defers these to the end-of-milestone checks.

1. **Real keyboard, page focused (KEY-01..03, NAV-01/02/04).** Press every key in the UI-SPEC key table in a focused web page on KDE Wayland. Expected: the Firefox action for each. The live run synthesised keys through nsITextInputProcessor.
2. **Real keyboard, editor and terminal (KEY-04).** F5, F6, F11, Ctrl+P, Ctrl+K, Ctrl+Tab, Alt+Left, Ctrl+R, Ctrl+L, Ctrl+W. Expected: Theia's command runs (Quick Open, full screen, and so on). The live check proves the key reached Theia and no browser row fired. It does not prove Theia's command ran.
3. **Physical mouse buttons 4/5 (KEY-05).** Expected: navigation over a page, nothing over Theia. The live run dispatched a chrome-side AppCommand event, not a GTK press.
4. **Hold-suppression cleanup (WR-01, IN-25).** Hold Back to open the menu, then release off the button (and separately end a hold with a pointercancel). Press Esc, then press Enter on Back. Expected: it goes back one page.
5. **Visual and timing (NAV-03, NAV-05, NAV-04).** KWin raise and spectacle in all three modes: one-line tooltips clear of the page, the 500 ms hold feel, and the pill shrinking to 120px in a narrow window with Home shown.
6. **Real OS drag onto New Tab (NAV-06).** A link and a plain-text URL from another app. Expected: one focused tab; javascript: and file: open nothing.
7. **Decision: owner for the shared-process blank defect.** It is pre-existing (GUI-02), so it is not counted as a Phase 27 gap. With four same-site web tabs open, Reload or activation of the fifth can replace its page with about:blank. Only `deferred-items.md` and one STATE.md line record it, so it needs a phase or a WINDOWS.md row.
8. **Prohibitions 1-14** above (non-authoritative LLM verdicts).

### Gaps Summary

No must-have truth failed. Every artifact exists, has real content and is wired, and every key link holds. The five roadmap success criteria and all 11 requirement IDs have code evidence and passing live evidence, and I produced that evidence in this session: `--quick` green, 31/31 live scenarios, and 11/11 self-test plants red. The status is `human_needed`, not `passed`, for three reasons:

- One cleanup invariant (hold suppression after an off-button release or a pointercancel) is present but no test exercises it.
- Real-input UAT (keyboard, mouse buttons 4/5, OS drag) and visual checks remain. Synthesised input is evidence, not UAT.
- The 14 judgment-tier prohibitions carry only non-authoritative verdicts in this autonomous run.

One escalation sits outside the gaps: the pre-existing shared-process reload and activation blank defect has no owner.

---

_Verified: 2026-10-21T06:50:10Z_
_Verifier: Claude (gsd-verifier)_
