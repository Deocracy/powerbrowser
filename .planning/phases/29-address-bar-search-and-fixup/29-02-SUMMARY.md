---
phase: 29-address-bar-search-and-fixup
plan: 02
subsystem: PowerBrowserAPI search area / token cookie / bridge gate
status: complete
tags: [BAR-02, token-cookie, uri-fixup, store-kind, live-check]
requires: [29-01]
provides:
  - "Token-cookie strip in the search area: TOKEN_COOKIE_NAME, TOKEN_STRIP_TOPIC, tokenCookieAllowed, tokenCookieStrip, installTokenCookieStrip, export PowerBrowserTokenCookie; setGroupSenderPort installs it"
  - "scripts/verify-token-cookie-strip.mjs (static, --quick, four plants); registry rows token-cookie-strip, token-cookie-strip-self-test"
  - "verify-address-bar-live.mjs scenarios token-cookie (first in registry order) and dev-addresses; plant token-strip-off; PASS lines can carry a note"
  - "verify-web-tab-bridge.mjs rule 12: STORE_KIND_CLASSES (read, store-write, network, privileged), store-kind routing parity, relay and caller fences, six plants"
affects: [29-03, 29-09]
tech-stack:
  added: []
  patterns:
    - "http-on-modify-request observer that edits only the Cookie request header, keyed by port first and fail-closed"
    - "Live absence check paired with a probe cookie positive control on every request, plus a plant that turns every load red"
key-files:
  created:
    - scripts/verify-token-cookie-strip.mjs
  modified:
    - powerbrowser/shell/PowerBrowserAPI.sys.mjs
    - powerbrowser/INTERNAL-APIS.md
    - scripts/verify-address-bar-live.mjs
    - scripts/verify-web-tab-bridge.mjs
    - scripts/verify-platform.sh
decisions:
  - "token-cookie is the first scenario in registry order, so in a full run its stock-window load also comes before any web tab"
  - "Theia app rebuild skipped before the live runs: this plan edits no frontend source (boundary and scripts only; the boundary is symlinked into the objdir and MOZ_PURGE_CACHES=1 makes the edit run)"
metrics:
  duration: 9m
  completed: 2026-10-21
  tasks: 3
  files: 6
commits: 3
plan_head_before: ee30e0a47b9256d93266400d5a08c181ef6676cc
plan_head_after: 84199c2332fed5142f3a13120e71473d29240db6
actuals:
  tokens: 28000
  tasks: 3
  commits: 3
---

# Phase 29 Plan 02: Development addresses and the token-cookie strip Summary

Development addresses now open as addresses, and the change that makes that safe ships with them. An `http-on-modify-request` observer removes `POWERBROWSER_TOKEN` from every `127.0.0.1` request except one to the sidecar's own port from the Theia frame, chrome or a Theia-origin worker. `setGroupSenderPort` installs the observer synchronously after the cookie is minted, so it is active before any web tab opens. Every store kind is now classified, and network and privileged kinds are gated before the first one lands.

## What was built

- **Boundary (search area):**
  - `tokenCookieAllowed(channel)` fails closed when no sidecar port is recorded. If the request port is not the sidecar's, it returns false.
  - When the request has a browsing context, the token is kept only if the top embedder is not an overlay. Without a browsing context, it is kept only for a system principal or a `127.0.0.1:<sidecar port>` principal.
  - `tokenCookieStrip` drops only the token's entry from the `Cookie` header and writes the header back only if something was dropped. It logs nothing, and the cookie store is never edited.
  - `installTokenCookieStrip` is idempotent.
  - `PowerBrowserTokenCookie` is exported so the live plant can remove the observer.
  - `setGroupSenderPort` has one new line, `if (groupSenderPort !== null) installTokenCookieStrip();`, and its doc comment was extended.
  - Two Touchpoints rows were added: `Ci.nsIHttpChannel` at :4422 and `Services.obs.addObserver` at :4448.
- **Static gate (`verify-token-cookie-strip.mjs`):** it checks that:
  - the cookie name matches the token gate's `POWERBROWSER_TOKEN_COOKIE_NAME` and the name in probeHealth's header template;
  - the topic is exactly `http-on-modify-request`;
  - the install function adds the observer on that topic;
  - `setGroupSenderPort`'s body calls `installTokenCookieStrip()`;
  - `tokenCookieAllowed` compares the request port against `groupSenderPort`.

  It has four plants. Two quick rows sit next to the bridge rows.
- **Live `token-cookie`:**
  - A probe cookie `pbprobe=1` is added for `127.0.0.1` as the positive control.
  - It covers four loads: a GUI-01 stock window opened with `window.open` before any web tab, an overlay page, its `<img>`, and a Blob dedicated worker's fetch.
  - Each load must carry `pbprobe=1` and must not carry the token.
  - The store must still hold the token. The Theia frame's credentialed `/powerbrowser/health` fetch must return 200, and the uncredentialed fetch must not.
  - The plant `token-strip-off` removes the observer.
- **Live `dev-addresses`:** `localhost`, `localhost:4000`, `devbox:3000`, `192.168.1.10:8080` and `[::1]:8080` must resolve to an http visit of exactly that host and port. `example.com` must resolve to `https://example.com/` and `hello` to a search on the served engine. Then typing `127.0.0.1:<served port>/dev` and pressing Enter must produce a GET on `/dev` and a loaded push for the tab. The scenario is scored only after `search` passes.
- **Rule 12 (`verify-web-tab-bridge.mjs`):**
  - `STORE_REQUEST_KINDS` must equal `handleStoreRequest`'s arms, and both must equal the `STORE_KIND_CLASSES` keys. An empty derivation is reported as a broken instrument.
  - `TAB_STORE_RELAY_KINDS` is derived with `...TAB_STORE_WRITE_OPS` expanded from `TAB_STORE_WRITE_FIELDS`. A network or privileged kind in it fails.
  - A privileged kind needs a client method of the same name. A `.kind(` call outside the client and widget fails, and so does a command or keybinding file that names the kind.
  - The INTERNAL-APIS.md privileged-kind paragraph was rewritten in place to cover store kinds.

## Verification (all run this session)

- `verify-ng-040-internals-catalogue-lines.mjs`, `check-internals-boundary.sh` and `--catalogue`: PASS.
- `verify-token-cookie-strip.mjs`: PASS. Its `--self-test` PASS covers four plants: renamed literal, `-before-cookies` topic, install moved to `webTabOpen`, and port comparison removed.
- `node scripts/verify-address-bar-live.mjs --scenario token-cookie`: `token-cookie: PASS (stock window before any web tab)`.
- `node scripts/verify-address-bar-live.mjs --scenario search,dev-addresses`: both PASS.
- `node scripts/verify-address-bar-live.mjs`, all five scenarios: every one PASS, with token-cookie again carrying `stock window before any web tab`. This run is a superset of the plan's `search,token-cookie,dev-addresses`.
- `node scripts/verify-address-bar-live.mjs --self-test`: PASS. The clean control is green. `resolve-bypassed` went red, and `token-strip-off` went red with exactly `carried POWERBROWSER_TOKEN: stock-window, overlay, subresource, worker`.
- `verify-web-tab-bridge.mjs`: PASS, with store-kind classification. Its `--self-test` reports 20 planted faults all red, six of them new.
- `scripts/verify-platform.sh --quick`: PASS after Task 1 and again after Task 3.
- Gecko fixup outcomes matched the plan's list exactly, so no measured-behaviour note is needed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `verify-ng-040-internals-catalogue-lines.mjs --fix` moved the `searchLazy` row to the wrong line**
- **Found during:** Task 1 catalogue step
- **Issue:** The row's line should have moved from 4293 to 4296. `--fix` moved it to 4295 (`const searchLazy = {};`) instead, then `--catalogue` reported 4296 as having no row. `--fix` seems to accept any line that contains one of the row's code-span tokens (`searchLazy`), and it picks the nearest such line.
- **Fix:** Hand-set the row to 4296. ng-040 and the catalogue both PASS. The `IOUtils.remove`/`savePageCopy` pair was checked and is correct: 4057 is the replaced copy and 4061 is the failed-persist cleanup.
- **Commit:** b1d9798

### Plan adjustments
- The plan's `<verify>` commands rebuild Theia (`yarn build`) before the live runs. This plan changes no frontend source, so the rebuild was skipped and the existing app build was used. The boundary file is symlinked into the objdir and runs fresh under `MOZ_PURGE_CACHES=1`.
- `token-cookie` is first in `SCENARIOS`, which is the run order. That way a full run and `--scenario search,token-cookie,dev-addresses` both open the stock window before any web tab.
- The report prints optional notes on a PASS line (`token-cookie: PASS (stock window before any web tab)`). The plan required that marker.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register. T-29-06 through T-29-10 are mitigated as planned. The observer is a new process-wide network hook and is catalogued.

## Risks for later plans

- ng-040 `--fix` can pick the wrong line when another nearby line contains one of the row's code-span tokens (seen with `searchLazy`), and it still cannot tell apart rows with the same pattern and function (the `IOUtils.remove` pair). After each boundary edit, check the rows `--catalogue` reports and that pair.
- `verify-address-bar-live.mjs` now opens two web tabs per full session: `/cookie-page` and the shared `/start` tab. Two tabs are left under the four-tab limit.
- The strip keys on host `127.0.0.1` only. The token cookie is host-only on `127.0.0.1`, so `localhost` requests never carry it. If the cookie host ever changes, the strip must change with it.
- Stock browser windows keep the token on the sidecar's own port, because their top embedder is not an overlay. This matches the plan's rule, which strips by overlay, not by window.

## Self-Check: PASSED

- FOUND: scripts/verify-token-cookie-strip.mjs
- FOUND: b1d9798 (task 1), 38d3051 (task 2), 84199c2 (task 3), all ancestors of HEAD
