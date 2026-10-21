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

## history-channel title race in the live self-test (found in 27-05)

- **Seen:** `node scripts/verify-nav-keys-live.mjs --self-test`, clean control, 1 of 2 runs.
  `history()` replied index 2 and the three entries, but entry 0's title was its URL
  (`http://127.0.0.1:…/h1`) instead of "History One". The full run just before and the
  re-run both passed.
- **Likely cause:** the scenario navigates to /h2 on /h1's loaded push, before the title of
  the /h1 session-history entry is recorded. A timing defect in the check, not in a path
  27-05 changed (27-05 touched no history or navigation code).
- **Where to look:** `historyChannel` in `scripts/verify-nav-keys-live.mjs`: wait for a state
  push carrying the served title before each navigation.

## Dead accel+L focus path after the A13 row was retired (found in 27-06)

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
