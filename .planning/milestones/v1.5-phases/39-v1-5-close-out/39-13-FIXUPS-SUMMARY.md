---
phase: 39-v1-5-close-out
plan: 13-fixups
subsystem: shell, chrome-bar, testing
tags: [webextensions, permission-prompts, private-browsing, token-cookie, options-page, sidebar, 38-UAT, deviation-follow-up]

requires:
  - phase: 39-v1-5-close-out
    provides: "39-11 and 39-13 'Product fix deferred to main' findings; the prompts, ext-tab-host and extension-actions live harnesses"
provides:
  - "window.gReduceMotion shim: the notification post-prompt no longer throws in the shell (39-11 fix 1)"
  - "token cookie in the private jar under browser.privatebrowsing.autostart: the IDE loads in a private shell window (39-13 fix 2, 38 T22 steps 1-3)"
  - "a second openOptionsPage during stock-window startup adds no second tab (39-13 fix 4, 38 T30)"
  - "the extension sidebar view returns after a frontend reload (39-13 fix 1, 38 T29)"
  - "38-UAT rows 29 and 30 pass; row 22 evidence for steps 1-3, step 4 still pending"
affects: [39-14, 39-19, 39-20]

actuals:
  tokens: 96000
  tasks: 5
  commits: 4
plan_head_before: 732a51552c49718135a7f5e15d06eef30b30ad2c
plan_head_after: fad221db38b521b61fafc345405b145b6a9fcc65

tech-stack:
  added: []
  patterns:
    - "Before trusting a planned fix for a race, instrument which code path the second call takes; here it was the stock window's own function, not the shell receiver the plan targeted"
    - "A static gate's one-definition rule gets a narrow, named exemption (one function, one shim) plus a plant proving a definition anywhere else stays red"

key-files:
  created:
    - .planning/phases/39-v1-5-close-out/39-13-FIXUPS-SUMMARY.md
  modified:
    - powerbrowser/shell/PowerBrowserAPI.sys.mjs
    - powerbrowser/INTERNAL-APIS.md
    - theia/extensions/chrome-bar/src/browser/extensions/extension-actions-widget.tsx
    - scripts/verify-extension-actions-live.mjs
    - scripts/verify-shell-gbrowser-standin.mjs
    - scripts/verify-site-identity.mjs
    - .planning/phases/38-webextensions/38-UAT.md

key-decisions:
  - "The private-jar cookie is added only under permanent private browsing (PrivateBrowsingUtils.permanentPrivateBrowsing), so outside autostart the private jar never holds the token"
  - "38 T30: the planned WeakMap<win, Set<url>> in the shell receiver was tried first and went 5/5 red. Instrumentation showed the second call goes to the started stock window's own switchToTabHavingURI. The fix wraps that function once per stock window that got a reuse tab, and reuses a tab still on about:blank whose userTypedValue is the URL"
  - "syncSidebar waits for reachedState('ready'), the hook setups-service already uses, rather than 'initialized_layout'"
  - "38-UAT row 22 keeps result [pending] with a partial line, because the file's summary has no partial category and step 4 is still open"
  - "No EXT-05..EXT-09 ticked: each still has an open human or owner row (Open Question 5 rule)"

requirements-completed: []

duration: 330 min
completed: 2026-11-06
status: complete
---

# Phase 39 Plan 13-fixups: four deferred product fixes on main Summary

**All four fixes are on main, each with live evidence. Only 38 T22 step 4 is still red, which is deferred item 3 (a patch 050 owner call).**

## Fixes

### 1. 39-11 fix 1: the notification post-prompt threw in the shell (commit 70391678)
- **Change:** `installPermissionPromptFurniture` sets `window.gReduceMotion = true`. `PermissionUI.postPrompt` (`:661-669`) skips the anchor-icon animation, and the shell has no such icon. One INTERNAL-APIS row was added. Every PowerBrowserAPI line reference after 7649 was shifted by 2.
- **Evidence:** a temporary debug copy of `verify-prompts-live.mjs` (deleted afterwards). It used the dismissed-no-mark page set, `dom.webnotifications.requireuserinteraction` true, and a gesture-less `Notification.requestPermission()` on a background tab.
  - Control, with `gReduceMotion` forced false: `console lines matching anchor is null|PermissionUI: ["[JavaScript Error: \"TypeError: can't access property \"addEventListener\", anchor is null\" {file: \"resource:///modules/PermissionUI.sys.mjs\" line: 664}] ..."]` and `debug-notify: FAIL -- anchor is null TypeError logged`
  - Fixed: `gReduceMotion before: true`, `console lines matching anchor is null|PermissionUI: []`, `debug-notify: PASS`
- No scenario leg was added.

### 2. 39-13 fix 2: the token cookie was missing from the private jar (commit 2942d39b)
- **Change:** under `browser.privatebrowsing.autostart`, `setSessionCookie` also adds `POWERBROWSER_TOKEN` with `{ privateBrowsingId: 1 }`. The cookie rows were re-pointed, and a `permanentPrivateBrowsing` row was added.
- **Walls:** `ext-network-wall` PASS, `token-cookie-strip` PASS, `token-gate-webview` PASS. Patch 060's `isHiddenCookie` and the port strip both match by name and host, not by jar.
- **Evidence:** `node scripts/verify-extension-actions-live.mjs --scenario private-access`
  - Session 1 passes: `the permanent-private leg passed (shell private true: denied has no button, puzzle row or sidebar key, its options page refused ('PowerBrowser refused to open that page: this extension is not allowed in private windows.'); allowed shows all and its options page opened)`
  - Control with the fix reverted: `with browser.privatebrowsing.autostart the shell's IDE never loaded ... (waitFor timed out after 120000ms waiting for truthy: window.theia && window.theia.container ? true : false)`
  - Session 2 is still red. That is deferred item 3; see "Left red".

### 3. 39-13 fix 4: a duplicate options tab during stock-window startup (commit 7dc0e61c)
- **First attempt (not committed):** the planned `WeakMap<win, Set<url>>` in the shell receiver. 5 of 5 runs went red.
- **Instrumented cause:** once the window has started, the second call reaches the stock window's own `switchToTabHavingURI`, not the shell receiver. At that moment the shell's options tab is still uncommitted: `STOCK call, started=true tabs=[["about:blank",null],["about:blank","moz-extension://.../options.html"]]`. Upstream `switchIfURIInWindow` matches committed URLs only, so it added a second tab.
- **Change:**
  - `extensionSelectTabPage` also reuses an uncommitted tab (`uncommittedStockTab`: on about:blank, with `userTypedValue` equal to the URL).
  - It wraps that stock window's `switchToTabHavingURI` once, so a call for an uncommitted tab selects that tab. Every other call goes to the stock function unchanged.
  - Five INTERNAL-APIS rows were added.
  - `verify-shell-gbrowser-standin.mjs` got a `STOCK_WINDOW_WRAPPERS` exemption scoped to this one function, plus plant (m2): a definition anywhere else still goes red. Its self-test passes.
- **Evidence:** `node scripts/verify-ext-tab-host-live.mjs --scenario options-page-switch` was run 5 times, and all 5 passed: `options-page-switch: PASS -- a second call while the stock window was starting (still starting at the call: true) gave one stock window and one options tab; a third call switched to it and added none`

### 4. 39-13 fix 1: the sidebar view did not return after a frontend reload (commit fad221db)
- **Change:** `syncSidebar` waits for `stateService.reachedState('ready')` before `addWidget` and `revealWidget`. It also reveals a newly opened sidebar when the view is attached but hidden. `FrontendApplicationStateService` is injected.
- **Build:** `yarn --cwd extensions/chrome-bar build && yarn --cwd applications/browser build` (bundle.js contains `sidebarRevealed`). No Gecko rebuild was needed.
- **Evidence:** 2 of 2 runs: `frontend-reload: PASS -- the reload closed the popup (popuphidden) and hid the sidebar browser; after the re-subscribe the view returned with its page, and a second subscribe left it shown`

## Close-out verification (verbatim)

`scripts/verify-platform.sh --only extension-actions-live`: FAIL, on private-access only.
- popup-action, buttons, manage, tabs-bridge, content, page-action, sidebar, tab-pages, commands, event-page-wake, policies-shell-only, remove-copy and frontend-reload all PASS.
- The one red line:
  ```
  private-access: FAIL -- private access rule not applied: with only a private stock window open the denied options page is in [{"ctx":"f2a25bff-301b-40af-a00f-ab72382d9d95","private":true}], want a new non-private window; the permanent-private leg passed (shell private true: denied has no button, puzzle row or sidebar key, its options page refused ('PowerBrowser refused to open that page: this extension is not allowed in private windows.'); allowed shows all and its options page opened)
  ```

`scripts/verify-platform.sh --only extension-actions-live-self-test`: FAIL, on the private-access control only.
- Every other control was green, and every plant went red naming its drift. That includes `frontend-gone-ignored -> red, naming 'a reloaded frontend left the popup or sidebar up'`.
- The one red line:
  ```
  verify-extension-actions-live --self-test: control private-access FAIL -- private access rule not applied: with a private stock window open last the denied options page is in [{"ctx":"9d185fea-...","private":true}], want the one non-private window; the permanent-private leg passed (...)
  ```
- Because that control is red, the plant `shell-not-private` is unscored.

`scripts/verify-platform.sh --quick` was green before commits 70391678, 7dc0e61c and fad221db.
- Before 2942d39b, its only red was `site-identity-self-test`, on a hand-pinned plant anchor (`PowerBrowserAPI.sys.mjs:753`).
- The fix was re-pointed to 759 in the same commit, and `node scripts/verify-site-identity.mjs --self-test` then passed.

## Left red

- **38 T22 step 4 (deferred item 3, owner batch).** Both session-2 assertions of private-access fail, depending on the run:
  - "with a private stock window open last ... want the one non-private window"
  - "with only a private stock window open ... want a new non-private window"
- Its fix is patch 050's `openOptionsPage` window choice. That is an owner call, and it is not in this plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Harness] private-access session 1 waited for a background page upstream never starts**
- **Found during:** Task 2
- **Issue:** under permanent private browsing, `ext-backgroundPage.js` `onManifestEntry` starts no background for an extension not allowed in private windows. Session 1 therefore broke on `no private-denied-started record` as soon as the IDE loaded. Its denied `openOptionsPage` leg was driven from that background.
- **Fix:**
  - `privateSession` takes the list of start records to await, and session 1 waits for none.
  - The denied `openOptionsPage` is sent as stock `ext-browser.js` sends it: the top window's `switchToTabHavingURI` with the options URL.
  - A failing run also reports a passing permanent-private leg.
- **Files modified:** scripts/verify-extension-actions-live.mjs
- **Commit:** 2942d39b

**2. [Rule 3 - Gate] the site-identity self-test plant anchor was hand-pinned to a line number**
- **Fix:** re-pointed 753 -> 759 after the cookie edit moved the quit row. It is still a literal, and the next edit above line 759 moves it again.
- **Commit:** 2942d39b

**3. [Rule 1 - Bug] 38 T30 needed a different fix than the one planned**
- The planned shell-receiver pending set went 5/5 red. Fix 3 above has the instrumented cause, the stock-window wrapper and the static-gate exemption it needed.
- **Commit:** 7dc0e61c

**4. 38-UAT row 22 is `[pending]` plus a `partial:` line, not `partial`**
- The UAT summary block has no partial category. Counts are now passed 39, pending 7, skipped 1.

**Total deviations:** 4. All are harness or gate fixes, except T30's root cause.

## Requirements

None of EXT-05..EXT-09 were ticked. Under the Open Question 5 rule, each still has an open human or owner row:
- EXT-05: 31.1 UAT decisions 2 and 3
- EXT-06: 38 T18, T20, T22
- EXT-07: T18, T23
- EXT-08: T19
- EXT-09: T21

STATE.md progress and the ROADMAP checkboxes were not changed.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: stock-window-wrapper | powerbrowser/shell/PowerBrowserAPI.sys.mjs | `extensionSelectTabPage` replaces a stock window's `switchToTabHavingURI` with a wrapper. The wrapper only short-circuits for a URL whose tab this boundary added and that has not committed, and it opens nothing. Every other caller gets stock behavior. Catalogued, gate-exempted by name, plant (m2). |
| threat_flag: token-in-private-jar | powerbrowser/shell/PowerBrowserAPI.sys.mjs | The token cookie is now also in the private jar, under autostart only. The 060 cookie wall and the loopback-port strip match by name and host, and both stay green. |

## Self-Check: PASSED

- FOUND commits 70391678, 2942d39b, 7dc0e61c, fad221db (ancestors of HEAD)
- FOUND: this SUMMARY; the 38-UAT rows 22, 29 and 30 edits
