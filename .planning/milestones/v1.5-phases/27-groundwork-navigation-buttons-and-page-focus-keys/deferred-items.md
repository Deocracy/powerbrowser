# Phase 27 deferred items

## From 27-02

### Reload of a web tab that shares a content process blanks the page (GUI-02, pre-existing)

- **Found during:** 27-02 Task 3, running `node scripts/verify-nav-keys-live.mjs` in full.
- **Symptom:** with four same-site web tabs already open, the fifth one shares a
  content process with the first (Firefox's `dom.ipc.processCount.webIsolated` is 4).
  Reloading that fifth tab switches its overlay to remoteType `web` at `about:blank`.
  The browsing context id stays the same (14), the frameloader childID changes (7 to 15),
  `docShellIsActive` reads false, and the server sees no GET. The pushes show
  `/cache loading:true canGoBack:true`, then `about:blank` twice.
- **Not caused by this plan:** a plain `reload()` does the same thing, and plain reload's
  path is unchanged by 27-02: the same `webTabReload` message goes to `entry.browser.reload()`.
  It reproduced in 3 of 4 runs of a scratch script that opens N tabs and then reloads
  the next one (N=4). With N=0 it never reproduced.
- **User impact:** Reload, and probably any navigation that triggers a process switch, can
  blank the fifth or later same-site tab.
- **Where to look:** how the overlay `<browser>` (`remoteType: "web"`,
  `maychangeremoteness`, `manualactiveness`) in `PowerBrowserAPI.webTabOpen` handles a
  remoteness change on reload.
- **What 27-02 did:** `hard-reload-channel` runs first in `verify-nav-keys-live.mjs`, on the
  session's first tab, so it scores only the bypass-cache flag. The defect is not fixed.

## history-channel title race in the live self-test (found in 27-05) -- RESOLVED in 27-07

- **Resolved:** 27-07 (commit 4936517). It reproduced in 27-07's first self-test clean control.
  `historyChannel` now waits for a state push that carries each page's served title before the next
  navigation. Three solo runs and the next self-test clean control passed.

- **Seen:** `node scripts/verify-nav-keys-live.mjs --self-test`, clean control, 1 of 2 runs.
  `history()` replied index 2 and the three entries, but entry 0's title was its URL
  (`http://127.0.0.1:…/h1`) instead of "History One". The full run just before and the
  re-run both passed.
- **Likely cause:** the scenario navigates to /h2 on /h1's loaded push, before the title of
  the /h1 session-history entry is recorded. A timing defect in the check, not in a path
  27-05 changed (27-05 touched no history or navigation code).
- **Where to look:** `historyChannel` in `scripts/verify-nav-keys-live.mjs`: wait for a state
  push carrying the served title before each navigation.

## Dead accel+L focus path after the A13 row was retired (found in 27-06) -- RESOLVED in 27-07

- **Resolved:** 27-07 (commit 4936517) removed the method, the push kind, the channel emitter and
  event, and the chrome-bar subscriber. It also rewrote the web-tab.ts placeholder comment and the
  WebTabChannel inject comment. `verify-web-tab-bridge.mjs` (and `--self-test`),
  `check-internals-boundary.sh --catalogue` and `verify-ng-040-internals-catalogue-lines.mjs` pass.

- **Seen:** 27-06 deleted the always-reserved accel+L `<key>` in `powerbrowser.js`, its only
  caller. `PowerBrowserAPI.webTabFocusAddress` (PowerBrowserAPI.sys.mjs:3562), the
  `focusAddress` push kind, `WebTabChannel.onDidRequestFocusAddress` (web-tab.ts:240-245) and
  its listener in chrome-bar-widget.tsx:1543 now have no sender. The comment at web-tab.ts:405
  still says leaving a page is "chrome's reserved accel+L".
- **Why not fixed here:** outside 27-06's files; removing a push kind touches
  `verify-web-tab-bridge.mjs`'s push-kind parity and the boundary catalogue. All gates pass
  with the dead path in place.
- **Where to look:** remove the method, the push kind and the listener together, then re-run
  `verify-web-tab-bridge.mjs` and `check-internals-boundary.sh --catalogue`.

## verify-ng-040 --fix swaps rows that share an internal name (found in 27-07)

- **Seen:** 27-07 Task 3 deleted 18 lines above the saved-page section of `PowerBrowserAPI.sys.mjs`.
  `node scripts/verify-ng-040-internals-catalogue-lines.mjs --fix` then re-pointed the two
  `IOUtils.remove` rows of `savePageCopy`, but in table order rather than by shift. The
  "persist fails" row (was 4072) got 4050 and the "replaced copy" row (was 4068) got 4054, which
  swapped their descriptions. The check still passed afterwards, because it only checks that the
  internal named on each row appears at that line.
- **What 27-07 did:** corrected both rows by hand (4050 = replaced copy, 4054 = persist failure).
- **Where to look:** `--fix` should apply each stale reference's own shift (or match by nearest
  line), not reassign rows that share an internal in table order. The check cannot see this, so
  after any `--fix`, read the diff of rows that name the same internal.

## Intermittent live failures not reproduced (seen in 27-07)

- In 27-07's first full live run, `hard-reload-click` failed once ("Shift+click on Reload must send a
  GET carrying no-cache; got null"). It passed in two reruns and in the self-test clean control.
  The shared-process blank-reload defect above is the likely cause (it was the 22nd-or-later tab of
  the session).
- In one `--scenario page-keys,page-prevented` run, `page-keys` failed with "after Alt+Home focus
  must stay in the page; chrome's active overlay is undefined". `undefined` means the chrome-scope
  evaluate returned no value. It did not recur in four later runs.

## From 27-08

### The shared-process blank defect also hits activation, not only reload (seen in 27-08)

- **Found during:** 27-08 Task 2, `tooltips-all`. In Organising, the fifth 127.0.0.1 tab of the
  scenario showed Back enabled on a tab that had just loaded. Its history read
  `[/tip-organising, about:blank]` at index 1, so the page was replaced by `about:blank` after it
  loaded, between the loaded push and `shell.activateWidget` making it current. Nothing reloaded it.
- **What 27-08 did:** `tooltips-all` closes every web tab before each mode, so no tab shares a
  content process with an earlier one. The defect is not fixed. It is the same entry as the 27-02
  one above, with a second trigger (activation of a tab opened behind the Organising widget).

### UI-SPEC rule (c) assumes a row above the bar in Organising (seen in 27-08)

- 27-UI-SPEC "Tooltips (NAV-05)" says the hover sits over "the toolbar in Organising" above the bar.
  Measured live: in Organising the chrome bar is at the window's top edge (0-40 px), and the toolbar
  row is below it (40-73 px), then the page (from 73 px). `HoverService` flips the `top` request to
  `bottom`, and the tooltip lands on the toolbar row (45-69 px), clear of the page.
- Rule (c) (never over the page) holds. "Above the bar" does not hold in Organising, and there is
  no room for it to hold. `tooltips-all` requires "above" only where the bar has room above it.
  If Organising's layout changes so the toolbar row goes, a below-bar hover would cover the page and
  `tooltips-all` would go red ("intersects").
