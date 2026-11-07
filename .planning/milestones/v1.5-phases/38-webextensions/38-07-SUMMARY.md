---
phase: 38-webextensions
plan: "07"
subsystem: extensions-security
tags: [webviews, token-gate, websocket, hidden-origins, gap-closure, uf-31.1-02]
status: complete
live_proof: deferred
requires:
  - phase: 38-webextensions plan 06
    provides: the hidden-origins pref, worker-wall, and the finding that Theia's webview origin does not resolve
provides:
  - webview origins on <uuid>.webview.localhost:<port> (WebviewLoopbackEnvironment, rebound in tab-uris)
  - THEIA_WEBVIEW_EXTERNAL_ENDPOINT pinned to Theia's default in TheiaService
  - the token gate answering webview-host requests itself, and requiring the token cookie on every WebSocket upgrade
  - scripts/verify-token-gate-webview.mjs (5 rules, 10 plants); verify-ext-network-wall.mjs origins family (27 plants)
  - backend checks side02-index-gated (extended) and side02-ws-token (new)
  - live scenario webview-render with plant webview-wall-off
key-files:
  created:
    - theia/extensions/token-gate/src/common/webview-host.ts
    - theia/extensions/tab-uris/src/browser/webview-loopback-environment.ts
    - scripts/verify-token-gate-webview.mjs
  modified:
    - theia/extensions/token-gate/src/node/token-gate-backend-contribution.ts
    - theia/extensions/token-gate/src/node/token-gate-backend-module.ts
    - theia/extensions/tab-uris/src/browser/tab-uris-frontend-module.ts
    - powerbrowser/shell/TheiaService.sys.mjs
    - powerbrowser/shell/PowerBrowserAPI.sys.mjs
    - powerbrowser/shell/powerbrowser-sidecar.js
    - powerbrowser/endpoint-allowlist.json
    - scripts/verify-privacy-hosts.mjs
    - scripts/verify-ext-network-wall.mjs
    - scripts/verify-ext-tab-host-live.mjs
    - scripts/verify-platform.sh
---

# 38-07 Summary: Theia webviews load

## What changed

- **Endpoint.** Webviews use `http://<uuid>.webview.localhost:<port>`. The frontend swaps `localhost` for
  `127.0.0.1` in the hostname it substitutes into Theia's unchanged default pattern `{{uuid}}.webview.{{hostname}}`
  (`WebviewLoopbackEnvironment.doInit`, rebound over `WebviewEnvironment` in the tab-uris frontend module). Gecko
  resolves `*.localhost` to loopback itself (`nsHostResolver` `IsLoopbackHostname`), and `*.localhost` counts as a
  secure context, so the webview service worker can register.
- **Why not a literal THEIA_WEBVIEW_EXTERNAL_ENDPOINT** (the brief's step 1). Theia has only `{{uuid}}` and
  `{{hostname}}`; the port is never appended, it comes in through `{{hostname}}`. TheiaService spawns on `--port 0`,
  so the port is unknown when the environment is built. Theia's backend serves `/webview/*` through `vhost`, which
  strips the port before matching, so a literal port never matches. A portless literal stops `allowWsUpgrade`
  refusing webview-origin websockets. Any non-default pattern makes the frontend show a warning toast that prints
  the raw pattern. TheiaService therefore pins the variable to the default value, so an inherited value cannot
  move the origin.
- **Hidden origins.** `setGroupSenderPort` writes `http://127.0.0.1:<port>,http://*.webview.localhost:<port>`. Patch
  060's matcher (`scheme://*` plus a suffix) needs no change. PowerBrowserAPI's line count is unchanged, so the
  INTERNAL-APIS.md rows keep their numbers.
- **Allowlist.** A `.webview.localhost` suffix row beside `127.0.0.1`. verify-privacy-hosts now treats `localhost`
  and `*.localhost` as loopback.

## How webview requests authenticate

- The webview origin's HTTP requests are only Theia's static shell: `index.html`, `host.js`, `main.js`,
  `service-worker.js`, `fake.html`. Content resources (`/webview/theia-resource/...`) are intercepted by the
  service worker, passed to the main frame, and loaded over the main frame's authenticated RPC. They never go
  over HTTP to the backend.
- The token cookie stays host-only on `127.0.0.1` with SameSite=Lax. It is not widened, it is never sent to
  `*.webview.localhost`, and it is not attached to a webview's cross-site subresource requests to `127.0.0.1`.

## Security fix

A security review rated the first version of the gate change critical. That version let a webview-host GET of a
shell file pass the gate with `next()`. Further down the chain, Theia's `BrowserConnectionTokenBackendContribution`
bootstrap issues `Set-Cookie: theia-connection-token` to any request without a valid one. Any local process or web
page could send a `*.webview.localhost` Host header and receive that cookie. Separately, Socket.IO answers
`/socket.io/` before express, so Theia's RPC handshake had never passed our token gate. It was guarded only by
Theia's connection token and origin check.

Fixed in commit b81f674e:

- `gate()` now handles a webview host first and ends the request there in `serveWebviewShell`. Only GET and HEAD
  are allowed, only for the five shell files by exact name, sent with `sendFile` from the fixed root
  `<app>/lib/webview/pre`. Everything else gets 403. No `next()` and no cookie.
- The gate is also a `WsRequestValidatorContribution` (in our token-gate extension, not Theia core). It requires a
  valid `POWERBROWSER_TOKEN` cookie on every upgrade and handshake, and admits only under the named dev bypass.
  The Theia frame's own handshake goes to `127.0.0.1:<port>`, which is same-site, so the Lax cookie is sent. The
  shell's token-cookie strip allows the Theia frame's channels.
- Run against a real backend on 2026-11-01: the webview host got `index.html` 200 with no Set-Cookie and
  `service-worker.js` 200. A `/webview/../` traversal, a POST, `/` and `/powerbrowser/health` all got 403. A Socket.IO
  handshake carrying a valid theia-connection-token and a same-origin Origin, but no token cookie, got 403. The
  same handshake with the token cookie got 200.
- Gates: `verify-token-gate-webview.mjs` (--quick). Its rules are order, branch, serve, files and ws. WEBVIEW_SHELL_FILES
  is compared as a set with the files Theia ships in `@theia/plugin-ext/src/main/browser/webview/pre`. Its 10
  plants cover `next()` in the branch, `next()` in serveWebviewShell, `res.cookie`, a `Set-Cookie` header, the
  branch moved after the token check, the gate pushed behind Theia's bootstrap, any file served, an extra
  allow-list entry, the WS binding removed, and the WS validator admitting everything. Full tier:
  `side02-index-gated` now also requires no Set-Cookie on the shell response, and the new `side02-ws-token`
  covers the handshake.

## Gates

- `verify-ext-network-wall.mjs` origins: the pattern is derived from TheiaService's pinned value, which must equal
  the installed default. The loopback name comes from `webview-host.ts` and must be `localhost` or under
  `.localhost`. The frontend swap and its rebind must be present. 27 plants, 24 before. New: endpoint removed from
  TheiaService, frontend rebind removed, endpoint not under .localhost, pref webview entry not matching. The old
  "endpoint override" plant was replaced. "Theia's pattern changed upstream" now goes red as ENDPOINT NOT DEFAULT.
- Live, not run here: `node scripts/verify-ext-tab-host-live.mjs --scenario webview-render` and its plant via
  `--scenario webview-render --self-test` (`webview-wall-off`). 38-UAT 46-47, v1.5-LIVE-PASS Phase 38.

## Deviations

- The endpoint is set in the frontend, not as a literal environment value in TheiaService (reasons above).
  TheiaService still sets `THEIA_WEBVIEW_EXTERNAL_ENDPOINT`, pinned to the default.
- No patch change: patch 060 already matches `*.webview.localhost:<port>`.

## Owner sign-off

- 2026-11-01, Chris: approved the frontend `WebviewEnvironment` rebind (localhost substitution) in place of a literal `THEIA_WEBVIEW_EXTERNAL_ENDPOINT` value in TheiaService.
- `@theia/mini-browser` is not in the app, so `THEIA_MINI_BROWSER_HOST_PATTERN` needs no change.
