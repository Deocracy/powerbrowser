# Phase 30 deferred items

## 30-03: a fresh web tab reports canGoBack after a PowerBrowser-mode round trip

- **Found during:** 30-03 Task 3, the live self-test's clean control.
- **What:** in a live session that ran `mode-lifetime` (Browsing, Organising, Browsing) before
  `local-modes`, a web tab opened directly on `localhost/lm-act` reported `canGoBack: true`, so
  the Back command was enabled on a tab with one page. In a session without `mode-lifetime` the
  same tab reported `canGoBack: false`. Reproduced twice (`search,mode-lifetime,local-modes`).
- **Not root-caused.** It is outside 30-03's scope (the state push's history flag, Phase 27). It
  may be pre-existing; the run did not compare against a pre-30-03 build.
- **Effect on checks:** the `local-modes` Actions step uses Forward as its disabled control, which
  a one-page tab cannot enable. Back is not asserted absent.
- **Next step:** open a tab after the perspective round trip and read the overlay browser's
  session history chrome-side (`browser.browsingContext.sessionHistory.count`) to see whether a
  second entry exists (an `about:blank` or empty-page entry before the URL) or the push is stale.
