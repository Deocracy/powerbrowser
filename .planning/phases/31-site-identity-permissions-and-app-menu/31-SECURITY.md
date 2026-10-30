---
phase: "31"
slug: "site-identity-permissions-and-app-menu"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 2
block_on: high
created: "2026-10-29"
---

# Phase 31 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Audited at HEAD 58465e6 (diff base 3e8d991). Source was read only; nothing was patched.
> `.planning/config.json` sets neither `asvs_level` nor `security_block_on`. The audit used ASVS L2 depth
> (a mitigation must sit at the correct boundary, not only exist) and traced the four high-severity
> threats end to end (L3). `block_on` is the default, `high`.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Served web page (overlay) to the actor channel | An overlay can load the group actor child when its page is on the loopback host, and can fire `PowerBrowserGroupRequest`; the parent wall must refuse it | Any request kind |
| Theia frame to chrome | The only admitted sender: the shell window's own `powerbrowser-content` browser, primary, on the sidecar's live port | tabId, permission id/state, panel-echoed origin, page enum, `{}` for quit |
| Overlay securityUI to Theia pill | Chrome decodes the connection into an enum and pushes it with `url`; Theia never recomputes from text | `securityState`, `displaySpec`, `baseDomain`, counts, permission ids/labels |
| Chrome site-data clear to the cookie jar | The IDE token cookie lives in the same jar as the site's cookies on `127.0.0.1` | Cookie name, host |
| Theia menu to stock pages | Names an enum value; chrome holds the URLs and uses trusted entry points | `{page}` |
| Theia menu / reserved key to quit | One quit path, `quitApplication()`, that announces `quit-application-requested` first | none |
| Committed TLS fixture to a product profile | A test CA certificate is in the repo; its trust must stay inside a throwaway probe profile | CA certificate, leaf certificate and key |

---

## Threat Register

IDs T-31-02 and T-31-06 are each used by two plans for different threats. They are split here as
T-31-02/P01, T-31-02/P02, T-31-06/P04 and T-31-06/P05. T-31-SC is repeated in all five plans and is one row.

| Threat ID | Category | Component | Severity | Disposition | Mitigation (verified in code) | Status |
|-----------|----------|-----------|----------|-------------|-------------------------------|--------|
| T-31-01 | Spoofing | lock derived from typed text or stale push | medium | mitigate | The enum is decoded in chrome from `browser.securityUI.state` and pushed in the same `sendAsyncMessage` as `url` (PowerBrowserAPI.sys.mjs:3461-3489, decode 3505-3551); the push is flushed once per animation frame and reads URL and identity live (scheduleWebTabState, 4818-4837). Only STATE_IS_SECURE with neither BROKEN nor INSECURE yields `secure` (3517-3530); everything unreadable falls to `insecure` or `none`. The upstream default state is STATE_IS_INSECURE (upstream/security/manager/ssl/nsSecureBrowserUI.cpp:57). The count is reset on a non-same-document location change (3332) and `onSecurityChange` re-pushes (3363, NOTIFY_SECURITY at 3384). Theia: `applyState` sets `url` and `securityState` in one call (web-tab.ts:827-850); `identityState()` reads only the pushed field (address-bar.tsx:268-284); the one scheme test left on typed text is the cosmetic `https://` trim, which needs `inputValue === committedAddress` and a pushed `secure` (address-bar.tsx:2212-2215). Static gate `verify-site-identity.mjs` green, including the plant that restores a typed-text lock. | CLOSED |
| T-31-02/P01 | Spoofing | site-info for another site | medium | mitigate | `webTabSiteInfo` is `tabId` only (web-tab.ts:199, 765); chrome validates the id (PowerBrowserAPI.sys.mjs:4650, `webTabIdIsValid` 392), looks up its own `webTabs` entry (4653) and derives everything from `entry.browser` (`webTabSiteInfo(entry.browser)` 4657, body 3658-3726). No sender field is read. | CLOSED |
| T-31-02/P02 | Tampering (principal confusion) | permission write for another site | high | mitigate | `webTabSetPermission` (4666-4698): id must be in the six-ID list and the state must map to a capability, else refused before any lookup (4670-4673); principal is `entry.browser.contentPrincipal` (4678); refused unless `webTabPermissionPrincipalOk` (content principal, scheme http or https; 4517-4519) and `principal.origin === data.origin` (4679). There is no `await` between the compare and `removeFromPrincipal`/`setForPrincipal` (4689-4692), so the compared principal is the written principal. `data.origin` is compared only, never used as a key. Panel side: the origin is `sitePanelInfo.origin` from the open-time reply and is kept across permission replies (address-bar.tsx:436, 525-543). | CLOSED |
| T-31-07 | Tampering | permission label rendered as markup (stored XSS via site label) | medium | mitigate | No `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval` or `new Function` anywhere under theia/extensions/chrome-bar/src (grep, no hit). Labels, host and certificate fields render as React text nodes (site-panel.tsx:107, 114-116, 136-137) or attribute strings (131). Hover content is a string, which Theia sets with `textContent` (@theia/core/lib/browser/hover-service.js:168-169); the confirm title is set with `textContent` (dialogs.js:147). Labels come from `SitePermissions.getPermissionLabel` (PowerBrowserAPI.sys.mjs:4538-4567), not from the page. | CLOSED |
| T-31-03 | Tampering (session kill) | clear removes the IDE token cookie | high | mitigate | Exemption is `cookie.name === TOKEN_COOKIE_NAME && cookie.host === TOKEN_COOKIE_HOST` (PowerBrowserAPI.sys.mjs:5293-5295). `TOKEN_COOKIE_NAME` (5135) is the strip's constant and `verify-token-cookie-strip.mjs` pins it to the token gate; the host matches the mint site (TheiaService.sys.mjs:921-925, host `127.0.0.1`). Cookies are removed one by one only when not the token (5310-5314). The storage pass passes `CLEAR_COOKIES_AND_SITE_DATA & ~CLEAR_COOKIES` (5315); in upstream only `CookieCleaner` removes cookies and it is bound to `CLEAR_COOKIES` alone (upstream/toolkit/components/cleardata/ClearDataService.sys.mjs:2351), so no other flag in the group reaches the jar. `SiteDataManager.remove` (which re-deletes every cookie) is not called. After the clear the token count is re-read and `tokensAfter < tokensBefore` returns `token-cookie`, which the arm turns into a refusal (5316-5318, 4717-4720). A `localhost` tab reads a different host and cannot see the `127.0.0.1` token. The arm itself is behind the sender wall and the origin echo (4703-4715). Gate plant `token-cleared` is present and the self-test is green. | CLOSED |
| T-31-04 | Tampering (leak) | shield exception applies to another site | medium | mitigate | `webTabShieldToggle` (4735-4760) applies the same wall and origin echo (4744), then `ContentBlockingAllowList.add/remove(entry.browser)` (4750, 4752) on the entry found by the validated tabId. Upstream `add` writes the permission for that browser's own `contentBlockingAllowListPrincipal` (upstream/toolkit/components/antitracking/ContentBlockingAllowList.sys.mjs:67-77), so the write is browser-scoped. No `await` between compare and write. Gate plant `shield-leak` is present (verify-site-identity.mjs:1112) and a live `shield-leak` plant exists (verify-site-identity-live.mjs:900, 1387). | CLOSED |
| T-31-06/P04 | Elevation | stock page URL loads in a web tab (null-principal to system-principal confusion) | high | mitigate | `openStockPage` is in `STORE_REQUEST_KINDS` (4031), so `handleStoreRequest` runs `groupSenderIsTheia` and `storeSenderInShellWindow` first (4064). The case passes only `data.page` (4134-4135). `openStockPageFromMenu` allow-lists five names with a strict `switch` and throws on anything else before a window is touched (5406-5416). The two URL-less pages call `win.openPreferences()` and `win.BrowserAddonUI.openAddonsMgr()` with no argument (5426-5428); the other three index a frozen map of three fixed `about:` literals (5380-5384) with `addTrustedTab` (5430). No `openStockTab(` call carries an `about:` URL (only its own definition and the pre-existing `case "openStockTab"` at 2453, whose scheme wall refuses anything but `about:newtab`/`http(s)`, 1115-1118). The web-tab scheme walls (1117, 3244, 3730) are unchanged by Phase 31. Gate plants `stock-url` and `openStockTab('about:preferences')` present. | CLOSED |
| T-31-09 | Tampering | unclassified store kind bypasses the privileged-kind rule | medium | mitigate | `openStockPage` is classed `store-write` (scripts/verify-web-tab-bridge.mjs, STORE_KIND_CLASSES) and listed in `MENU_ONLY_STORE_KINDS`, so it must stay out of `TAB_STORE_RELAY_KINDS`; the relay list is read-only here and holds no menu kind (tab-store-access-protocol.ts:58-65). Plants `planted unclassified openStockPage` and `planted openStockPage in the backend relay` are present; `verify-web-tab-bridge.mjs --self-test` passed (32 plants). | CLOSED |
| T-31-08 | Spoofing | hamburger order mimics Firefox but routes to attacker content | low | mitigate | Rows come from `MENU_ORDER` filtered by `minPhase` (app-menu.ts:45-49); a row not in `WIRED_MENU_IDS` is disabled and its `run` is a no-op (app-menu.ts:95-100). Enabled rows dispatch to the new-tab command, the `openStockPage` enum, or `quitRequest` (chrome-bar-widget.tsx:447-459); labels are `CHROME_BAR_COPY` constants. No row carries a URL. | CLOSED |
| T-31-06/P05 | Elevation | second quit implementation bypasses the flush observer | high | mitigate | `Services.startup.quit` appears exactly once in the shipped tree, inside `quitApplication()` after it notifies `quit-application-requested` (PowerBrowserAPI.sys.mjs:708-721; grep over theia, powerbrowser and patches finds no other `startup.quit`, `eAttemptQuit` or `eForceQuit`). Three callers, all to that function: the reserved Ctrl+Q `<key>` (powerbrowser.js:327-336), the window-close handler (powerbrowser.js:501) and the `quitRequest` arm (PowerBrowserAPI.sys.mjs:4140-4145). The arm reads no argument. The Theia side holds no quit code: one call, `this.store.quitRequest()` (chrome-bar-widget.tsx:467), reached only from the Quit row. `quitRequest` and `openStockPage` are not in the backend relay list. Gate plant `quit-second-path` present; the shortcut-relay gate pins the key's command body. | CLOSED |
| T-31-10 | Tampering | unclassified store kind bypasses the privileged-kind rule | medium | mitigate | `quitRequest` is classed `lifecycle` in STORE_KIND_CLASSES; the gate fails if it is relayed, if its client method is missing, if it is called outside chrome-bar-widget.tsx, or if a command or keybinding file names it (plants at verify-web-tab-bridge.mjs:669-692). Independent grep: the only callers are chrome-bar-widget.tsx:467 and its client method (chrome-store-client.ts:223). | CLOSED |
| T-31-SC | Tampering | npm/pip/cargo installs | low | accept | See AR-31-01. `git diff 3e8d991..HEAD` shows no change to any package.json, lockfile, Cargo file, requirements file or flake file. | CLOSED |

Counts: 12 register entries (T-31-SC once), 12 CLOSED, 0 OPEN.

---

## Checks Requested For This Audit

**Who can send the privileged kinds.** Every kind in the table below reaches chrome through `PowerBrowserGroupParent.receiveMessage`
(PowerBrowserAPI.sys.mjs:3976-3990), which routes `openStockPage`/`quitRequest` to `handleStoreRequest` and the four `webTab*` Phase 31
kinds to `handleWebTabAction`. Both begin with a sender wall (4064 and 4570). `groupSenderIsTheia` (317-348) requires all of: the
top-level embedder has `primary="true"`; its id is `powerbrowser-content` and its owner document is the shell document; the sender
document is on the sidecar's live port (`groupSenderPort`, null refuses everyone); and the host is loopback. `handleStoreRequest`
adds `windowtype === "powerbrowser:main"` (4046-4054).

| Sender | Admitted? | Why |
|--------|-----------|-----|
| A served web page in an overlay | No | The actor child can load there if the page is on the loopback host, but the overlay `<browser>` has no `primary` and no id (attribute set at 3263-3273), so `embeddedByPrimary` and `embeddedByShell` are false. A page on any other host never loads the child (`matches` pin, 2206). |
| An overlay (chrome-created browser) | No | Same reason. |
| A stock browser tab | No | Its embedder is in `browser.xhtml`, not the shell document (NG-038 wall, 332-335); store kinds also fail the `windowtype` check. |
| The backend relay / agent endpoint | No | `TAB_STORE_RELAY_KINDS` (tab-store-access-protocol.ts:58-65) holds none of the Phase 31 kinds; the relay refuses kinds outside it (tab-store-relay-contribution.ts:27). |
| The Theia frame | Yes | This is the trust root of the design. A compromised frame is bounded by the arm validation: six permission ids, http(s) content principals only, no cookie named as the token, five page names, quit with no argument. |

**Origin echo on every write arm.** Three arms write site state: `webTabSetPermission` (4679), `webTabClearSiteData` (4712),
`webTabShieldToggle` (4744). Each compares `entry.browser.contentPrincipal.origin` with the echoed `data.origin` at write time and
refuses with `site-changed`. In the permission and shield arms nothing awaits between the compare and the write. In the clear arm the
helper receives the compared principal object, so the host and the storage clear target the origin the user confirmed even if the tab
navigates during the await. The Theia side captures `origin` before the confirm dialog opens and sends that value (address-bar.tsx:485, 508).

**Non-content principals.** `webTabPermissionPrincipalOk` (4517-4519) requires `isContentPrincipal === true` and scheme `http` or `https`.
It guards all three arms, and `webTabPermissionOrigin` returns `null` for anything else (4523-4525), which makes the panel render the
unavailable copy (address-bar.tsx:436, site-panel.tsx:79). A sandboxed document (null principal) and `about:`/`file:` pages are refused.

**Token-cookie exemption.** See T-31-03. The pre-filter is name plus host; the post-check is a count.

**Stock pages.** See T-31-06/P04. `page` is interpolated into a log line only after it passed the enum (5424).

**Quit.** See T-31-06/P05. Ctrl+Q is a XUL `<key>` with `reserved="true"` in the chrome document. `GlobalKeyListener` drops
untrusted key events (upstream/dom/events/GlobalKeyListener.cpp:96) and treats `reserved="true"` as always reserved (470-477), so a
page can neither intercept the key nor synthesize it. Content cannot reach the chrome `command` listener.

**Logs.** Every Phase 31 log line (`grep` of the diff): the three refusal lines are fixed text (4681, 4713, 4745); the clear refusal
logs the outcome word only (4719); the stock-page failure logs the enum name and `err.name` (5424); Theia logs `error.name` or the type
(chrome-bar-widget.tsx:469, 478). Three failure lines interpolate `err.message` (permission write, clear, shield change: 4694, 4725,
4755); see O-31-B.

**TLS fixture.** `scripts/fixtures/tls/test-ca.pem` is a self-issued CA (`CN=PB Fixture CA`). `pb-fixture.key` is the leaf key: its
public key equals the leaf certificate's and differs from the CA's (checked with node:crypto), and the leaf verifies under the CA. The
CA private key is in neither the working tree (the only `PRIVATE KEY` file is `pb-fixture.key`) nor git history (`git log --all -S`).
The CA is trusted only by `trustFixtureCA` (scripts/lib/pb-live-probe.mjs:74-87), called solely when a scenario passes
`trustFixtureCA: tls` (verify-site-identity-live.mjs:1335) inside `withProbeShell`, whose profile is a `mkdtemp` directory disposed in
`finally` (pb-relaunch.mjs:250-263, pb-live-probe.mjs:42-59) and whose browser is launched with that `profileDir` (pb-relaunch.mjs:326).
`network.dns.localDomains` is written only into that profile's `user.js`. No file under powerbrowser/, patches/, flake.nix,
`moz.build`, `jar.mn` or the workflows references the fixture directory.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-31-01 | T-31-SC | No package.json, lockfile, Cargo, pip or flake file changed between 3e8d991 and 58465e6; no install surface was added by any of the five plans. | plan disposition, all five plans (autonomous run) | 2026-10-29 |

---

## Observations (not on the register; none blocks)

| ID | Severity | Observation | Location |
|----|----------|-------------|----------|
| O-31-A | low | The pushed `shieldExcepted` is dropped by the Theia state router. `WebTabChannel`'s `onPush('state')` mapping forwards every other Phase 31 field but not `shieldExcepted` (web-tab.ts:310-320), so `applyState`'s branch at 851-853 never runs from a push. The widget value changes only on a shield-toggle reply and is never reset on navigation. The identity-box shield can therefore show an exception for a site that has none (after navigating away from an excepted site), or omit it for an excepted site (after a restart). A page cannot cause this and it does not weaken protection, but it misstates the protection state. Fix: add `shieldExcepted: typeof detail.shieldExcepted === 'boolean' ? ... : widget.shieldExcepted` to the mapping. | tab-uris/src/browser/web-tab.ts:310-320 |
| O-31-B | low | Three failure paths log `err.message` unfiltered, unlike `handleStoreRequest`, which withholds non-validation messages. The upstream messages reachable here are fixed strings (SitePermissions.sys.mjs throws only fixed text; XPCOM permission errors carry no argument), so no URL, host or title is logged today, but nothing in the code guarantees it. | PowerBrowserAPI.sys.mjs:4694, 4725, 4755 |
| O-31-C | info | The re-verification in the clear is detective: it refuses the reply when a token cookie disappeared but does not restore it. The name-and-host pre-filter is what protects the token. | PowerBrowserAPI.sys.mjs:5316-5318 |
| O-31-D | info | If a user navigates an overlay to the sidecar's own origin (`http://127.0.0.1:<sidecar port>`) and confirms a clear, the non-cookie storage clear targets that origin and so also removes the Theia frame's own local storage and IndexedDB. The token and the session survive. User-initiated and confirmed; no mitigation planned. | PowerBrowserAPI.sys.mjs:5315-5316 |
| O-31-E | info | `openStockPage` is classed `store-write`, whose rule forbids relay but does not restrict the calling file; the bridge gate enforces the caller restriction only for `lifecycle` and `privileged` kinds. Independent grep shows the sole caller is chrome-bar-widget.tsx:476. | scripts/verify-web-tab-bridge.mjs |
| O-31-F | info | `pb-fixture.key` is a real private key in the tree and will trip secret scanners. It is the leaf key for a CA that is trusted nowhere outside a probe profile, and the CA key is not committed, so it cannot sign anything new. Consider a scanner allowlist entry. | scripts/fixtures/tls/pb-fixture.key |
| O-31-G | info | Threat IDs T-31-02 and T-31-06 are reused for different threats in plans 01/02 and 04/05. Traceability only. | 31-0[1-5]-PLAN.md |

Unregistered threat flags from the SUMMARY files: none. The five SUMMARY files carry no `## Threat Flags` section.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-29 | 12 | 12 | 0 | gsd-security-auditor (ASVS L2, L3 trace on high threats, block_on high) |

Gates re-run at audit on 58465e6, all exit 0: `verify-site-identity.mjs` (31 cases) and its `--self-test` (40 planted faults),
`verify-web-tab-bridge.mjs` (16 webTab kinds) and its `--self-test` (32 plants), `verify-shortcut-relay.mjs`,
`verify-token-cookie-strip.mjs`, `check-internals-boundary.sh` (clean, `--catalogue`, `--self-test`). The self-tests left the working
tree unchanged.

Not verified by this audit: the live scenarios (`identity-tls`, `site-panel`, `clear-data`, `shield`, `app-menu`, `quit-key`,
`quit-row`) were not re-run; they need the built browser and a display. Their PASS lines in the LIVE-HANDOFF files are the executors'
claims, not evidence used here. Every closure above rests on source and the static gates. The compiled Theia bundle under `lib/` was
not inspected; the source was.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-29 (autonomous run)
