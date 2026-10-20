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
