---
phase: "31"
slug: "site-identity-permissions-and-app-menu"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 2
block_on: high
created: "2026-10-29"
re_audited: "2026-10-29"
audited_head: "6f663a7"
---

# Phase 31 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> First audit at HEAD 58465e6 (SECURED, 12/12). Re-audited at HEAD 6f663a7 after the review-fix commits
> 32bff7c..3b9c443 (diff base 3e8d991 for the register, 58465e6..6f663a7 for the delta). Source was read only;
> nothing was patched.
> `.planning/config.json` sets neither `asvs_level` nor `security_block_on`. The audit used ASVS L2 depth
> (a mitigation must sit at the correct boundary, not only exist) and traced the four high-severity
> threats end to end (L3). `block_on` is the default, `high`.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Served web page (overlay) to the actor channel | An overlay can load the group actor child when its page is on the loopback host, and can fire `PowerBrowserGroupRequest`; the parent wall must refuse it | Any request kind |
| Theia frame to chrome | The only admitted sender: the shell window's own `powerbrowser-content` browser, primary, on the sidecar's live port | tabId, permission id/state, panel-echoed origin, page enum, `{}` for quit |
| Overlay securityUI to Theia pill | Chrome decodes the connection into an enum and pushes it with `url`; Theia never recomputes from text | `securityState`, `displaySpec`, `baseDomain`, counts, permission ids/labels, `shieldExcepted` |
| Chrome site-data clear to the cookie jar and site storage | The IDE token cookie lives in the same jar as the site's cookies on `127.0.0.1`. Since CR-03 the scope is the registrable domain of the page's host (cookies and storage alike), not the exact host | Cookie name, host, site (base domain) |
| Theia menu to stock pages | Names an enum value; chrome holds the URLs and uses trusted entry points | `{page}` |
| Theia menu / reserved key to quit | One quit path, `quitApplication()`, that announces `quit-application-requested` first | none |
| Quit observer to page code (new at 3b9c443) | The `quit-application-requested` observer calls `permitUnload()` on every `<browser>` in a `powerbrowser:main` window: the Theia frame and every web-tab overlay. A served page's `beforeunload` handler therefore runs during a quit | A boolean cancel flag; a leave prompt shown to the user |
| Committed TLS fixture to a product profile | A test CA certificate is in the repo; its trust must stay inside a throwaway probe profile | CA certificate, leaf certificate and key |

---

## Threat Register

IDs T-31-02 and T-31-06 are each used by two plans for different threats. They are split here as
T-31-02/P01, T-31-02/P02, T-31-06/P04 and T-31-06/P05. T-31-SC is repeated in all five plans and is one row.
Line numbers are at HEAD 6f663a7. The fix commits moved most of them from the 58465e6 audit.

| Threat ID | Category | Component | Severity | Disposition | Mitigation (verified in code) | Status |
|-----------|----------|-----------|----------|-------------|-------------------------------|--------|
| T-31-01 | Spoofing | lock derived from typed text or stale push | medium | mitigate | The enum is decoded in chrome from `browser.securityUI.state` (`webTabIdentity`, PowerBrowserAPI.sys.mjs:3518-3551) and pushed in the same `sendAsyncMessage` as `url` (`webTabPush`, 3474-3498); the push is flushed once per animation frame and reads URL and identity live (`scheduleWebTabState`, 4861+). `secure` needs STATE_IS_SECURE with neither BROKEN nor INSECURE **and, since CR-01, not STATE_CERT_USER_OVERRIDDEN** (3541-3544); an overridden certificate takes the `broken` or `mixed-passive` bucket. The constant is real (`upstream/uriloader/base/nsIWebProgressListener.idl:252`, 0x04000000), so the mask is not `& undefined`. Everything unreadable falls to `insecure` or `none`. The count resets on a non-same-document location change (3334-3345) and `onSecurityChange` re-pushes (3376-3380, NOTIFY_SECURITY at 3397). Theia: the state router maps every pushed field with a type check, `shieldExcepted` included (web-tab.ts:309-327), and `applyState` sets `url` and `securityState` in one call (831-858); `identityState()` reads only the pushed field (address-bar.tsx:268); the one scheme test left on typed text is the cosmetic `https://` trim, which needs `inputValue === committedAddress` and a pushed `secure` (2218-2220). Gate `verify-site-identity.mjs` green (43 cases); its self-test plants a restored typed-text lock and a secure arm that stops excluding an override, both red. | CLOSED |
| T-31-02/P01 | Spoofing | site-info for another site | medium | mitigate | `webTabSiteInfo` is `tabId` only (web-tab.ts:199, 770); chrome validates the id (PowerBrowserAPI.sys.mjs:4686, `webTabIdIsValid` 392), looks up its own `webTabs` entry (4689) and derives everything from `entry.browser` (4693, body 3682-3752). No sender field is read. WR-01 added a page-change guard: the origin and host are captured before the only await (3687-3688, await at 3717), re-read after it, and a mismatch returns `where: "site-changed"` (3724-3726). The spread at 4693 puts that value over `"done"`, and the panel opens only on `where === 'done'` (address-bar.tsx:443), so a reply cannot pair page A's rows with page B's origin. | CLOSED |
| T-31-02/P02 | Tampering (principal confusion) | permission write for another site | high | mitigate | `webTabSetPermission` (4702-4735): id must be in the six-ID list and the state must map to a capability (`webTabPermissionCapability`, 4507-4527; an unknown or non-string state returns `undefined`), else refused before any lookup (4706-4709); principal is `entry.browser.contentPrincipal` (4714); refused unless `webTabPermissionPrincipalOk` (content principal, scheme http or https; 4550-4552) and `principal.origin === data.origin` (4715). There is no `await` between the compare and `removeFromPrincipal`/`setForPrincipal` (4725-4727), so the compared principal is the written principal. `data.origin` is compared only, never used as a key. WR-05 changed the panel side only: the cycle runs over effective states from the reply (site-identity-table.ts `permissionOrder`, `nextPermissionState`), the `defaultState` field is informational, and chrome re-validates every id and state. Panel side origin: `sitePanelInfo.origin` from the open-time reply, kept across permission replies (address-bar.tsx:443, 531-548). | CLOSED |
| T-31-07 | Tampering | permission label rendered as markup (stored XSS via site label) | medium | mitigate | No `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval` or `new Function` anywhere under theia/extensions/chrome-bar/src or tab-uris/src (grep, no hit, re-run at HEAD). Labels, host and certificate fields render as React text nodes or attribute strings. Labels come from `SitePermissions.getPermissionLabel` (PowerBrowserAPI.sys.mjs:4588), not from the page. New at CR-03: the clear dialog puts the site (base domain, derived from a page's host) into both `title` and `msg` (address-bar.tsx:499-504). Theia sets a string `msg` with `textContent` (node_modules/@theia/core/lib/browser/dialogs.js:365-370) and the title with `textContent` (dialogs.js:147), so the host is text. | CLOSED |
| T-31-03 | Tampering (session kill) | clear removes the IDE token cookie | high | mitigate | Re-traced after CR-03 widened the scope. Exemption is `cookie.name === TOKEN_COOKIE_NAME && cookie.host === TOKEN_COOKIE_HOST` (PowerBrowserAPI.sys.mjs:5350-5352); the name (5178) is pinned to the token gate by `verify-token-cookie-strip.mjs` (green); the host (5348) matches the mint site (TheiaService.sys.mjs:921-925, `127.0.0.1`, name `POWERBROWSER_TOKEN`; file unchanged since 58465e6). The cookie pass reads `getCookiesFromHost(site, attrs)` for the registrable domain and removes each non-token cookie one by one (5373-5379). The storage pass is `deleteDataFromSite(schemeless, attrs, true, flags)` with `flags = CLEAR_COOKIES_AND_SITE_DATA & ~CLEAR_COOKIES` (5380-5382). Re-checked in upstream for the site-based method: `CookieCleaner` is the only cleaner that removes cookies (ClearDataService.sys.mjs:248-333, the sole `removeCookiesFromExactHost`/`removeAll`/`removeAllSince` callers) and it is bound to `CLEAR_COOKIES` alone (2351; `grep CookieCleaner` finds only the definition and that row), so `deleteBySite` for the other flags never touches the jar. The token is not in web storage either (the backend reads it from the cookie header, token-gate-backend-contribution.ts:163, and no frontend source names it). After the clear the token count is re-read and `tokensAfter < tokensBefore` returns `token-cookie`, which the arm turns into a refusal (5383-5384, 4754-4758). A page on `localhost` or any non-IP host reads a different site and cannot see the `127.0.0.1` token. A page on `127.0.0.1` at any port reaches the token's jar, and the exemption and the count are what protect it. The arm is behind the sender wall and the origin echo (4606, 4749). Gate plants `token-cleared`, `token-name-drift`, `clear-cookies-flag` and `cookie-scope-drift` are present (verify-site-identity.mjs:1332-1360) and red in the self-test. | CLOSED |
| T-31-04 | Tampering (leak) | shield exception applies to another site | medium | mitigate | `webTabShieldToggle` (4778-4803) applies the same wall and origin echo (4787), then `ContentBlockingAllowList.add/remove(entry.browser)` (4793, 4795) on the entry found by the validated tabId. Upstream `add` writes the permission for that browser's own `contentBlockingAllowListPrincipal` (upstream/toolkit/components/antitracking/ContentBlockingAllowList.sys.mjs:67-77), so the write is browser-scoped. No `await` between compare and write. CR-02 added `shieldExcepted` to the pushed state and the router (web-tab.ts:324), as a boolean-typed field that falls back to the widget value. Gate plant `shield-leak` is present (verify-site-identity.mjs:1367) and a live `shield-leak` plant exists (verify-site-identity-live.mjs:1066). | CLOSED |
| T-31-06/P04 | Elevation | stock page URL loads in a web tab (null-principal to system-principal confusion) | high | mitigate | `openStockPage` is in `STORE_REQUEST_KINDS` (4064), so `handleStoreRequest` runs `groupSenderIsTheia` and `storeSenderInShellWindow` first (4097). The case passes only `data.page` (4167-4168). `openStockPageFromMenu` allow-lists five names with a strict `switch` and throws on anything else before a window is touched (5475-5485). The two URL-less pages call `win.openPreferences()` and `win.BrowserAddonUI.openAddonsMgr()` with no argument (5494-5497); the other three index a frozen map of three fixed `about:` literals (5448-5452) with `addTrustedTab` (5499). `openStockTab(` has only its definition (1127) and the pre-existing `case "openStockTab"` (2467), whose scheme wall refuses anything but `about:newtab`/`http(s)`. The web-tab scheme walls are unchanged by the fixes. WR-07 changed only the startup poll (5455-5467). Gate plants `stock-url` and `openStockTab('about:preferences')` present. | CLOSED |
| T-31-09 | Tampering | unclassified store kind bypasses the privileged-kind rule | medium | mitigate | `openStockPage` is classed `store-write` (scripts/verify-web-tab-bridge.mjs:107-135, STORE_KIND_CLASSES) and listed in `MENU_ONLY_STORE_KINDS`, so it must stay out of `TAB_STORE_RELAY_KINDS`; the relay list (tab-store-access-protocol.ts:58-65, file unchanged since 58465e6) is five read kinds plus `TAB_STORE_WRITE_OPS` (the keys of `TAB_STORE_WRITE_FIELDS`, tab-store ops only) and holds no menu kind. Plants `planted unclassified openStockPage` and `planted openStockPage in the backend relay` are present; `verify-web-tab-bridge.mjs --self-test` passed (32 plants). | CLOSED |
| T-31-08 | Spoofing | hamburger order mimics Firefox but routes to attacker content | low | mitigate | Rows come from `MENU_ORDER` filtered by `minPhase` (app-menu.ts:45-49); a row not in `WIRED_MENU_IDS` (app-menu.ts:25) is disabled and its `run` is a no-op. Enabled rows dispatch to the new-tab command, the `openStockPage` enum, or `quitRequest` (chrome-bar-widget.tsx:457-476); labels are `CHROME_BAR_COPY` constants. No row carries a URL. app-menu.ts and chrome-bar-widget.tsx are unchanged in 58465e6..6f663a7; site-identity-table.ts changed only in the WR-05 permission-cycle functions (hunk at line 98), not in `MENU_ORDER`. | CLOSED |
| T-31-06/P05 | Elevation | second quit implementation bypasses the flush observer | high | mitigate | `Services.startup.quit` appears exactly once in the shipped tree, inside `quitApplication()` (PowerBrowserAPI.sys.mjs:729), after the function notifies `quit-application-requested` (708-711); grep over powerbrowser, theia/extensions/*/src and patches finds no other `startup.quit`, `eAttemptQuit`, `eForceQuit` or `eRestart`. Three callers, all to that function: the reserved Ctrl+Q `<key>` (powerbrowser.js:327-336), the window-close handler (501) and the `quitRequest` arm (4173-4178). The arm reads no argument. WR-04 changed the function body only: the full-shutdown pref is set before `quit()` and restored when `attemptingQuit` stays false (720-733); it still ends in the same single call. The Theia side holds no quit code: one call, `this.store.quitRequest()` (chrome-bar-widget.tsx:467), reached only from the Quit row. `quitRequest` and `openStockPage` are not in the backend relay list. Gate plant `quit-second-path` present and red; the shortcut-relay gate pins the key's command body. | CLOSED |
| T-31-10 | Tampering | unclassified store kind bypasses the privileged-kind rule | medium | mitigate | `quitRequest` is classed `lifecycle` in STORE_KIND_CLASSES (verify-web-tab-bridge.mjs:128); the gate fails if it is relayed, if its client method is missing, if it is called outside chrome-bar-widget.tsx, or if a command or keybinding file names it (plants at verify-web-tab-bridge.mjs:669-692). Independent grep: the only callers are chrome-bar-widget.tsx:467 and its client method (chrome-store-client.ts). | CLOSED |
| T-31-SC | Tampering | npm/pip/cargo installs | low | accept | See AR-31-01. `git diff 3e8d991..HEAD` and `git diff 58465e6..HEAD` show no change to any package.json, lockfile, Cargo file, requirements file or flake file. | CLOSED |

Counts: 12 register entries (T-31-SC once), 12 CLOSED, 0 OPEN. The re-audit changed no status.

---

## Checks Requested For This Audit

**Who can send the privileged kinds.** Every kind in the table below reaches chrome through `PowerBrowserGroupParent.receiveMessage`
(PowerBrowserAPI.sys.mjs:4013-4022), which routes `openStockPage`/`quitRequest` to `handleStoreRequest` (4020) and the four `webTab*` Phase 31
kinds to `handleWebTabAction` (4021). A kind in neither set falls to `handleGroupMutation`, which has no Phase 31 kind. Both handlers begin
with a sender wall (4097 and 4606). `groupSenderIsTheia` (317-348) requires all of: the top-level embedder has `primary="true"`; its id
is `powerbrowser-content` and its owner document is the shell document; the sender document is on the sidecar's live port
(`groupSenderPort`, null refuses everyone); and the host is loopback. `handleStoreRequest` adds `windowtype === "powerbrowser:main"`
(`storeSenderInShellWindow`, 4079-4087). None of this changed in 58465e6..6f663a7, and the fixes added no new message kind: the delta is
arm bodies, the quit function and one module-level observer.

| Sender | Admitted? | Why |
|--------|-----------|-----|
| A served web page in an overlay | No | The actor child can load there if the page is on the loopback host, but the overlay `<browser>` has no `primary` and no id, so `embeddedByPrimary` and `embeddedByShell` are false. A page on any other host never loads the child (`matches` pin). |
| An overlay (chrome-created browser) | No | Same reason. |
| A stock browser tab | No | Its embedder is in `browser.xhtml`, not the shell document (NG-038 wall, 332-335); store kinds also fail the `windowtype` check. |
| The backend relay / agent endpoint | No | `TAB_STORE_RELAY_KINDS` (tab-store-access-protocol.ts:58-65) holds none of the Phase 31 kinds; the relay refuses kinds outside it. |
| The Theia frame | Yes | This is the trust root of the design. A compromised frame is bounded by the arm validation: six permission ids, http(s) content principals only, no cookie named as the token, five page names, quit with no argument. Since CR-03 its clear reaches the registrable domain of an overlay's page instead of the exact host; the token stays exempt. |

**Message direction into Theia.** The state push reaches the frontend as a `PowerBrowserWebTabState` DOM event dispatched by the actor child
(GroupActorChild.sys.mjs:127-136). Overlay pages run in other documents and cannot dispatch on the Theia window. The router type-checks each
field it forwards (web-tab.ts:309-327), so the new `shieldExcepted` is a boolean or ignored. No new sender or listener was added.

**Origin echo on every write arm.** Three arms write site state: `webTabSetPermission` (4715), `webTabClearSiteData` (4749),
`webTabShieldToggle` (4787). Each compares `entry.browser.contentPrincipal.origin` with the echoed `data.origin` at write time and
refuses with `site-changed`. In the permission and shield arms nothing awaits between the compare and the write. In the clear arm the
helper receives the compared principal object, and the site, host and attributes are all read from it (5358-5360, 5370-5373,
4762-4766), so a navigation during the await cannot change what is cleared. The compare is on the full origin, so moving from
`a.example.com` to `b.example.com` refuses even though both are in one registrable domain. The Theia side captures `origin` before the
confirm dialog opens and sends that value (address-bar.tsx:489, 514).

**Non-content principals.** `webTabPermissionPrincipalOk` (4550-4552) requires `isContentPrincipal === true` and scheme `http` or `https`.
It guards all three arms, and `webTabPermissionOrigin` returns `null` for anything else (4556-4559), which makes the panel render the
unavailable copy. A sandboxed document (null principal) and `about:`/`file:` pages are refused.

**Token-cookie exemption and the widened clear.** See T-31-03. The pre-filter is name plus host; the post-check is a count. The
scope is `getBaseDomainFromHost(principal.asciiHost)`, which falls back to the host for an IP literal or a single-label host
(SiteDataManager.sys.mjs:79-97), so a `127.0.0.1` page is its own site and a `localhost` page is another. The cookie reads and the
storage clear use the same `site` and the same `attrs` (the overlay principal's origin attributes, narrower than upstream's `{}`), so
the two halves cannot disagree (plant `cookie-scope-drift`).

**Stock pages.** See T-31-06/P04. `page` is interpolated into a log line only after it passed the enum (5493).

**Quit.** See T-31-06/P05 and the next three paragraphs. Ctrl+Q is a XUL `<key>` with `reserved="true"` in the chrome document.
`GlobalKeyListener` drops untrusted key events (upstream/dom/events/GlobalKeyListener.cpp:96) and treats `reserved="true"` as always
reserved (470-477), so a page can neither intercept the key nor synthesize it.

**Quit veto: can content remove or bypass it (WR-04, 3b9c443).** The veto is `shellQuitVeto`, registered at module load with
`Services.obs.addObserver(shellQuitVeto, "quit-application-requested")` (PowerBrowserAPI.sys.mjs:5509-5540). It is a strong,
parent-process observer created by chrome code. Web content has no `Services` and no path to `removeObserver`, and a content-process
import of the module would build a separate instance with its own observer service. The parent module is reachable only as
`chrome://powerbrowser/content/PowerBrowserAPI.sys.mjs`, a package registered with no content-accessible flag (powerbrowser/shell/jar.mn:5-12;
only the branding package carries `contentaccessible=yes`), plus a `resource://powerbrowser/` alias that jar.mn documents as not
web-reachable. Every Power Browser quit route goes through `quitApplication()`, which notifies the topic first (710), so the veto sees
Ctrl+Q, the Quit row, the core window close and `quitRequest`; a quit started from a stock window also notifies the topic and reaches
the veto. The observer returns early when the subject is missing, not a boolean, or already cancelled (5511-5513), so it cannot clear
another observer's cancel. No product code calls `removeObserver` on it (grep over powerbrowser, theia/extensions/*/src and patches;
INTERNAL-APIS.md:224 records the same). `check-internals-boundary.sh --catalogue` passes with the new `addObserver` row.

**Quit veto fails open on a throw.** `permitUnload()` is wrapped per browser (5527-5531): a throw logs the error name only and leaves
`permitted = true`, and the loop goes on to the next browser, so one failing browser does not skip the others. The direction is
availability over unsaved-work protection. A throw requires a failure inside the browser's own `permitUnload`; I found no input a served
page controls that reaches the catch (a page can only make `permitUnload` return false, through a user-activated `beforeunload` prompt
that the user answers). The Theia frame is the trust root and is not page-controlled. Recorded as O-31-H, not a threat.

**Exported `PowerBrowserQuitVeto` (5543).** A frozen wrapper around the live observer object and its topic, exported for the live
self-test plant `quit-no-veto`. The wrapper is frozen, the observer inside it is not, so any chrome-privileged importer can both remove
and mutate the observer. The only consumer is the live harness (scripts/verify-site-identity-live.mjs:1532), which runs inside a probe
shell launched with `--remote-allow-system-access` (scripts/lib/firefox-bidi.mjs:345) in a throwaway profile. Reaching the export needs
chrome privilege, and chrome code can already do what the export allows by other means (quit with `eForceQuit`, edit prefs, register
its own observer). It adds no content-reachable surface. Recorded as O-31-J.

**Logs.** Every Phase 31 log line (`grep` of the diff): the three refusal lines are fixed text (4717, 4750, 4788); the clear refusal
logs the outcome word only (4756); the stock-page failure logs the enum name and `err.name` (5493); the quit veto logs `err.name` only
(5530); Theia logs `error.name` or the type (chrome-bar-widget.tsx:469, 478). The three failure lines that interpolated `err.message`
(permission write, clear, shield change) are now fixed text (4731, 4768, 4798, fix 2e57534); see O-31-B. The tab-store purge failure is
a fixed line (4764).

**Dependencies and install surface.** Nothing changed in package.json, lockfiles, Cargo, requirements or flake files between 58465e6
and HEAD, nor in TheiaService.sys.mjs, powerbrowser.js, GroupActorChild.sys.mjs or patches/.

**TLS fixture.** `scripts/fixtures/tls/test-ca.pem` is a self-issued CA (`CN=PB Fixture CA`). `pb-fixture.key` is the leaf key: its
public key equals the leaf certificate's and differs from the CA's (checked with node:crypto at the first audit), and the leaf verifies
under the CA. Nothing under scripts/fixtures changed in 58465e6..6f663a7. The CA private key is in neither the working tree (the only
`PRIVATE KEY` file in `git ls-files` is `pb-fixture.key`; two other hits are prose) nor git history (`git log --all -S`, first audit). The
CA is trusted only by `trustFixtureCA` (scripts/lib/pb-live-probe.mjs), called solely when a scenario passes `trustFixtureCA: tls`
(verify-site-identity-live.mjs:1651) inside `withProbeShell`, whose profile is a `mkdtemp` directory disposed in `finally` and whose
browser is launched with that `profileDir`. `network.dns.localDomains` (verify-site-identity-live.mjs:112) is written only into that
profile's `user.js` through `extraPrefs`. The fixture hosts (`pb-fixture.test`, `www.pb-fixture.test`) appear only under scripts/;
no file under powerbrowser/, patches/ or flake.nix references them.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-31-01 | T-31-SC | No package.json, lockfile, Cargo, pip or flake file changed between 3e8d991 and 6f663a7; no install surface was added by any of the five plans or the review fixes. | plan disposition, all five plans (autonomous run) | 2026-10-29 |

No new accepted-risk entry is written by this re-audit. O-31-D below is recorded as an observation because no plan or owner
approval of it exists in the repository (the instruction that called it accepted came from the orchestrating agent, which is not an
approval). If it should be a formal accepted risk, that needs the owner's recorded decision.

---

## Observations (not on the register; none blocks)

| ID | Severity | Observation | Location |
|----|----------|-------------|----------|
| O-31-A | low | **FIXED at 86df510 (CR-02), verified at HEAD.** The Theia state router now forwards `shieldExcepted` as a boolean with a widget-value fallback, so a navigation resets it with the page. The static case derives the pushed keys and the router keys and compares them; the runtime plant `router-drops-shield` is in the live harness (verify-site-identity-live.mjs:1020). | tab-uris/src/browser/web-tab.ts:324 |
| O-31-B | low | **FIXED for the three Phase 31 arms at 2e57534, verified at HEAD.** The permission, clear and shield failure paths log fixed text (4731, 4768, 4798); the static self-test has a plant returning `err.message` to a web-tab arm. The remaining `err.message` interpolations in this region are pre-Phase-31 lines (`writeTabRow` x3, `removeTabRow`, `webTabPush` 3500, `sendWebTabPush` 4817, from commits 92e5491 and 5cd5772) and are not Phase 31 changes. | PowerBrowserAPI.sys.mjs:4731, 4768, 4798 |
| O-31-C | info | The re-verification in the clear is detective: it refuses the reply when a token cookie disappeared but does not restore it. The name-and-host pre-filter is what protects the token. | PowerBrowserAPI.sys.mjs:5383-5384 |
| O-31-D | info | **Scope widened by CR-03.** If a user confirms a clear on an overlay at `127.0.0.1` on any port (before: only the sidecar's exact origin), the non-cookie storage clear targets the site `127.0.0.1` and so also removes the Theia frame's own local storage, IndexedDB, service workers and caches at `http://127.0.0.1:<sidecar port>` (`hasSite` matches every port of the host). Upstream does the same for any site and its subdomains. The token and the session survive: the token is a host-only cookie, exempt by name and host, and no other cleaner removes cookies (T-31-03). Theia's profile is kept in the profile's shell state file, and the frontend origin changes on nearly every launch (profile-storage.ts header), so the loss is the current session's web-storage state and caches. It is user-initiated, behind the sender wall and the origin echo, and the dialog names the site and "all of its subdomains". Recorded for the owner. | PowerBrowserAPI.sys.mjs:5380-5382 |
| O-31-E | info | `openStockPage` is classed `store-write`, whose rule forbids relay but does not restrict the calling file; the bridge gate enforces the caller restriction only for `lifecycle` and `privileged` kinds. Independent grep shows the sole caller is chrome-bar-widget.tsx:476. | scripts/verify-web-tab-bridge.mjs |
| O-31-F | info | `pb-fixture.key` is a real private key in the tree and will trip secret scanners. It is the leaf key for a CA that is trusted nowhere outside a probe profile, and the CA key is not committed, so it cannot sign anything new. Consider a scanner allowlist entry. | scripts/fixtures/tls/pb-fixture.key |
| O-31-G | info | Threat IDs T-31-02 and T-31-06 are reused for different threats in plans 01/02 and 04/05. Traceability only. | 31-0[1-5]-PLAN.md |
| O-31-H | info | The quit veto fails open: a `permitUnload()` throw is logged by name and treated as permitted, so a failure there loses the unsaved-work prompt rather than blocking the quit. No page-controlled input reaches the catch. The per-browser catch keeps the other browsers checked. | PowerBrowserAPI.sys.mjs:5526-5531 |
| O-31-I | info | The veto asks every `<browser>` in a `powerbrowser:main` window, so a web-tab overlay's page runs its `beforeunload` handler during a quit and can raise Firefox's leave prompt (Firefox requires user activation for it). That can delay a quit until the user answers the prompt, as in stock Firefox, whose `CanCloseWindow` asks every tab the same way. The user can always choose Leave. Not a lockout. | PowerBrowserAPI.sys.mjs:5520-5538 |
| O-31-J | info | `PowerBrowserQuitVeto` is a test-only hook exported from a shipped module. Reaching it needs chrome privilege, which can already do the same by other means; the only consumer is the live harness in a throwaway profile. If it is ever to be removed from release builds, gate the export on a test pref; no change is needed for this phase. | PowerBrowserAPI.sys.mjs:5543, scripts/verify-site-identity-live.mjs:1532 |
| O-31-K | info | Product decision, not a security finding: the registrable-domain clear scope (D-31-12 as revised by CR-03) has not been re-approved by the owner (31-VERIFICATION W-2). The confirm dialog discloses the domain, the subdomains and the closed-tab removal (`clearDataScope`, `clearDataClosedTabs`, chrome-bar-copy.ts). | address-bar.tsx:491-504 |

Unregistered threat flags from the SUMMARY files: none. The five SUMMARY files carry no `## Threat Flags` section. The review-fix
commits introduced no attack surface that lacks a register row: the widened clear is T-31-03, the quit observer is T-31-06/P05 plus
O-31-H and O-31-I, and the site-changed reply is T-31-02/P01.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-29 | 12 | 12 | 0 | gsd-security-auditor (ASVS L2, L3 trace on high threats, block_on high), HEAD 58465e6 |
| 2026-10-29 | 12 | 12 | 0 | gsd-security-auditor re-audit on the review fixes (ASVS L2, L3 trace on high threats, block_on high), HEAD 6f663a7 |

Gates re-run at the re-audit on 6f663a7, all exit 0: `verify-site-identity.mjs` (43 cases) and its `--self-test` (52 planted faults, all
red), `verify-web-tab-bridge.mjs` (16 webTab kinds) and its `--self-test` (32 plants), `verify-shortcut-relay.mjs`,
`verify-token-cookie-strip.mjs`, `check-internals-boundary.sh` (clean, `--catalogue`, `--self-test`). The self-tests left the working
tree unchanged (`git status` shows only the pre-existing `.planning/state.json` change).

Upstream sources re-read for this audit: `ClearDataService.sys.mjs` (cleaner and flag map, `deleteBySite`, `hasSite`),
`SiteDataManager.sys.mjs` (`getBaseDomainFromHost`, `remove`), `nsIWebProgressListener.idl` (the override constant),
`nsIClearDataService.idl` (`CLEAR_COOKIES_AND_SITE_DATA`), and `StaticPrefList.yaml` (`toolkit.shutdown.fastShutdownStage` exists, so
`getIntPref` on the default branch does not throw).

Not verified by this audit: the live scenarios (`identity-tls`, `identity-override`, `site-panel`, `clear-data`, `clear-scope`, `shield`,
`app-menu`, `quit-key`, `quit-row`, `quit-typed`) were not re-run; they need the built browser and a display. Their PASS lines in
31-VERIFICATION.md and 31-REVIEW.md are cited claims, not evidence used here. Every closure above rests on source and the static
gates. The C++ citations in the WR-04 comments (`nsAppStartup.cpp` 394-396 and 440-441, `nsGlobalWindowOuter.cpp:5975`) and the
claim that `permitUnload()` is what upstream's `CanCloseWindow` calls were not re-read; they bear on the correctness of the quit reply,
not on a registered threat. The Leave branch of an unsaved-editor quit and an OS session-end quit have no live run (31-VERIFICATION).
The compiled Theia bundle under `lib/` was not inspected; the source was.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-29 (autonomous run); re-verified 2026-10-29 at 6f663a7 after the review fixes
