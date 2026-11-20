---
phase: 66-powerbrowser-web-tabs-as-orca-s-browser
reviewed: 2026-11-20T00:00:00Z
depth: deep
files_reviewed: 16
files_reviewed_list:
  - orca-overlay/files/src/renderer/src/pb/browser-host/pb-browser-host-link.ts
  - orca-overlay/files/src/renderer/src/pb/browser-host/pb-browser-host.ts
  - orca-overlay/files/vite.pb-browser-host.config.ts
  - powerbrowser/branding/dev/pref/firefox-branding.js
  - powerbrowser/branding/release/pref/firefox-branding.js
  - scripts/build-orca-browser-host.sh
  - scripts/check-internals-boundary.sh
  - scripts/gen-orca-snapshot-fixtures.mjs
  - theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts
  - theia/extensions/orca-browser/package.json
  - theia/extensions/orca-browser/src/browser/orca-browser-frontend-module.ts
  - theia/extensions/orca-browser/src/common/orca-browser-abilities.ts
  - theia/extensions/orca-browser/src/common/orca-browser-dispatch.ts
  - theia/extensions/orca-browser/src/common/orca-browser-tools.ts
  - theia/extensions/orca-browser/tsconfig.json
  - theia/extensions/tab-uris/src/browser/web-tab.ts
findings:
  critical: 4
  warning: 7
  info: 7
  total: 18
  necessity: 1
status: issues_found
---

# Phase 66: Code Review Report

**Reviewed:** 2026-11-20T00:00:00Z
**Depth:** deep
**Files Reviewed:** 16
**Status:** issues_found

## Summary

I reviewed every file in scope at HEAD (e0c19c54). For pre-existing files I concentrated on the v1.7 diff from
2b5f4609. I traced these call chains across modules:

- The Theia host (`orca-browser-frontend-module.ts`) into the thin host bundle (`pb-browser-host.ts`).
- The thin host into the pinned Orca schemas that orcad validates with: `browser-client-host-protocol.ts`,
  `browser-client-page-metadata-protocol.ts` and `browser-client-automation-protocol.ts`.
- The dispatcher into `WebTabChannel.request` and on into chrome (`PowerBrowserAPI.sys.mjs` `webTabOpen`,
  `GroupActorChild.sys.mjs` agent methods).
- The link into Orca's credential cache (`web-runtime-credentials.ts`, `web-runtime-credential-source.ts`).

Four defects block shipping:

1. An agent web tab that is recreated (after a crash, or after a failed first open) is rebuilt in the user's
   container with no agent walls. Orca's `navigate` command still reaches that tab.
2. Every `browser.clientHost.pageMetadata` call fails orcad's schema, because three required booleans are never sent.
   The failure is swallowed.
3. A re-attach while any agent tab is bound sends page inventory under the old host id. Orca's attach schema refuses
   that, so Phase 67's Reconnect cannot recover the browser host.
4. Every automation call is cut off by the bridge's 5 s acknowledgement timeout, although chrome's `browser.wait`
   and `eval` run for up to 30 s.

Owner decisions relied on:

- D-39 ratifies the `permissions.isolateBy.userContext` pref in both branding files. It matches `scripts/generate.mjs`.
- D-33 ratifies the attach-failure log line plus the Phase 67 status message.
- D-34 ratifies the store row added from PowerBrowser's side (`followRow`).
- D-35, D-37 and D-38 define the agent walls that CR-01 bypasses.

The `check-internals-boundary.sh` allowance change (Cc[ and Ci. in `GroupActorChild.sys.mjs`, each line catalogued)
and its planted self-tests are sound. `orca-browser-abilities.ts` lists exactly 40 served methods, matching its doc
comment.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: A recreated agent tab is reopened as a user tab in the user's container, with every agent wall gone

**File:** `theia/extensions/tab-uris/src/browser/web-tab.ts:773-774, 984-986, 1294-1305`

**Issue:** The `agent` flag is sent only on the first `webTabOpen` (`agentOpenSent`). Later opens never carry it:

- `reopen()` (line 1305) sends `{ kind: 'webTabOpen', tabId, url, key }`. It is reached through `recreate()` from
  `navigate`, `back`, `forward` and `reload` on a crashed tab (lines 1217, 1226, 1233, 1256, 1273).
- Any later `onAfterAttach` also sends it without the flag, for example after the tab is moved to another dock area.

`recreate()` first sends `webTabClose`, so chrome's `webTabOpen` (`PowerBrowserAPI.sys.mjs:3582-3591, 3653-3657`) no
longer finds the tab and creates a new overlay. Because `agent` is false, that overlay gets `userContextId` 0 (the
user's cookie jar), the default message manager group and no `agentTabCreated()`. That means:

- no D-35 auxiliary-navigation sandbox and no D-37 download wall;
- no D-38 clipboard pair and no mark;
- no coverage by Stop.

NG-034 also restores the agent tab's history into it by row key. The Orca page binding survives. The dispatcher sends
Orca's `navigate` command through `widget.navigate()` (`orca-browser-frontend-module.ts:385`), not through the
agent-checked `webTabAgent` path, so the agent can still load any URL in that tab under the user's cookies.

The same thing happens when the first open fails. Chrome returns `unavailable` when the agent container cannot be
created (`PowerBrowserAPI.sys.mjs:3589-3591`, "no container, no tab"). The next open of the widget then creates a
user overlay.

The comment at line 181-183 says chrome honours the flag only at creation. That makes it safe, and required, to send
the flag on every open of an agent widget.

**Fix:**
```ts
// web-tab.ts: drop agentOpenSent; every open of an agent widget carries the flag (chrome ignores it on an open tab).
const agentFlag = (): { agent?: true } => (this.agent ? { agent: true as const } : {});
// onAfterAttach
void this.channel.request({ kind: 'webTabOpen', tabId: this.tabId, url: this.url, key: this.rowKey, ...(grant ? { grant } : {}), ...agentFlag() })
// reopen()
const reply = await this.channel.request({ kind: 'webTabOpen', tabId: this.tabId, url: this.url, key: this.rowKey, ...agentFlag() });
```
Also send Orca's `navigate` for a bound page through a chrome path that checks `entry.agent`, or refuse it when
chrome reports `not-agent-tab`, so a tab that is not an agent tab can never be driven by the dispatcher.

### CR-02: Every pageMetadata call is refused by orcad's schema, and the failure is swallowed

**File:** `theia/extensions/orca-browser/src/browser/orca-browser-frontend-module.ts:73, 441-452`;
`orca-overlay/files/src/renderer/src/pb/browser-host/pb-browser-host.ts:201-217`

**Issue:** `reportMetadata` calls `session.pageMetadata(pageId, { url, title })`. The frontend's own `HostSession`
interface (line 73) declares only those two fields. The host bundle then forwards `metadata.loading`,
`metadata.canGoBack` and `metadata.canGoForward`, which are `undefined`, and `JSON.stringify` drops them.

orcad validates the method with `BrowserClientPageMetadataParams`
(`orca/src/shared/browser-client-page-metadata-protocol.ts:8-19`, used at
`orca/src/main/runtime/rpc/methods/browser-client-host.ts:198`). That schema requires all three as `z.boolean()`. It
also caps `url` at 8192 characters and `title` at 4096; neither cap is enforced here.

So every call fails with invalid params, and line 450 swallows the rejection. orcad's client-page table never learns
an agent page's URL or title. `browser.tabList`, `tabCurrent` and `tabShow` are served by that table (mechanism
`orcad` in `orca-browser-abilities.ts:122-130`), so they report the creation state forever. 66-07-SUMMARY's
"the host's pageMetadata updates orcad" is contradicted by the schema.

**Fix:**
```ts
// orca-browser-frontend-module.ts reportMetadata
const url = typeof detail.url === 'string' ? detail.url.slice(0, 8192) : '';
const metadata = {
    url,
    title: (typeof detail.title === 'string' ? detail.title : '').slice(0, 4096),
    loading: detail.loading === true,
    canGoBack: detail.canGoBack === true,
    canGoForward: detail.canGoForward === true,
};
```
Update `HostSession.pageMetadata`'s parameter type to the host's `BrowserHostPageMetadata`. Log one line, with no
value, when the call is refused, rather than `.catch(() => undefined)`.

### CR-03: Re-attach with any bound agent tab is refused by Orca's attach schema, so the browser host cannot recover

**File:** `theia/extensions/orca-browser/src/browser/orca-browser-frontend-module.ts:232, 239-246, 464-483`

**Issue:** Each `run()` mints a new `browserHostClientId` (line 232). `onDetached` (lines 241-246) clears only
`this.session`; `this.bound` and the page table keep every bound agent tab. On the next `attach()`, `inventory()`
returns one entry per bound page with `browserHostClientId: event.browserHostClientId`, which is the previous
session's id.

`BrowserClientHostAttachParams.superRefine` (`orca/src/shared/browser-client-host-protocol.ts:159-167`) adds an issue
for every inventory entry whose `browserHostClientId` differs from the attaching one. orcad therefore answers the
attach `ok: false`, and `onAttachFrame` ends with `attach_refused:...`.

Phase 67's Reconnect (`orca-panes/src/browser/failure/orca-hosting-status.ts:180-183`) and its re-pair path (line 208)
call exactly this. While even one agent tab is open after a detach (an orcad restart, a socket drop), every
re-attach fails, and the failure page cannot be cleared. `closeEndedPages` does not help either, because it skips
pages the table still binds.

**Fix:** Either keep one `browserHostClientId` per frontend (mint it once, reuse it on every `run()`), so inventory
entries match and Orca's reconciliation can reclaim them. Or, on `onDetached`, end every bound page: drop it from the
table and `bound`, close its tab, and keep its sessionStorage entry so `closeEndedPages` sends the close after the
next attach. At minimum, filter `inventory()` to entries whose `browserHostClientId` equals the attaching id.

### CR-04: Every automation call is capped at the bridge's 5 s acknowledgement timeout and reported as browser_error

**File:** `theia/extensions/orca-browser/src/browser/orca-browser-frontend-module.ts:386`;
`theia/extensions/tab-uris/src/browser/web-tab.ts:702-725`

**Issue:** `agentCall` uses `WebTabChannel.request`, which settles `{ ok: false, reason: 'timeout' }` after
`WEB_TAB_ACK_TIMEOUT_MS` (5000 ms, line 721). `outcomeOf` maps that to `failed('browser_error')`. Chrome's own agent
methods run much longer:

- `browser.wait` defaults to 30 s and honours `params.timeout` (`GroupActorChild.sys.mjs:612`);
- `agentPageEval` defaults to 30 s (line 393);
- D-37 adds up to 3 s of settle time after the child replies (`PowerBrowserAPI.sys.mjs:11737-11742`);
- `fullScreenshot` and `pdf` of a large page can exceed 5 s.

Any of these that runs past 5 s is answered `browser_error` to Orca while chrome keeps executing. For example, a
`wait` for a selector that appears after 6 s fails, and an `eval` that resolves after 6 s fails. The late reply is
discarded, and the agent cannot tell a timeout from a broken browser (`browser_timeout` is never produced).

**Fix:** Give `request` a per-call timeout and use one longer than chrome's deadline for `webTabAgent`:
```ts
request(msg: ShellMessage, timeoutMs = WEB_TAB_ACK_TIMEOUT_MS): Promise<WebTabReply> { /* ...setTimeout(..., timeoutMs) */ }
// orca-browser-frontend-module.ts
agentCall: (tabId, method, params) => this.channel.request(
    { kind: 'webTabAgent', tabId, method, params },
    Math.max(35_000, (typeof params.timeout === 'number' ? params.timeout : 0) + 5_000)),
```
Map a local timeout to `browser_timeout` rather than `browser_error`.

## Warnings

### WR-01: The link can create and cache Orca's shared credential source with no-op callbacks, disabling the pane client's token cleanup and revocation handling

**File:** `orca-overlay/files/src/renderer/src/pb/browser-host/pb-browser-host-link.ts:46-50`

**Issue:** `webRuntimeCredentialFor` caches one source per environment id, pairing revision and host key
(`orca/src/renderer/src/web/preload-api/web-runtime-credentials.ts:28-32, 56`). It binds the callbacks of whichever
caller misses first. `ready` is set once and never reset (line 84). Suppose a D-36 re-pair bumps `pairingRevision`,
and `connection()` runs (Phase 67's re-attach after `repair()`) before the pane client's first call under the new
revision. The link then creates and caches the source with `forgetStoredToken: () => {}` and `forgetPairing: () => {}`.

From then on the pane client gets that same source. `storedKeyPlan` sets `tokenForgotten = true` and calls the no-op
`forgetStoredToken` once (`web-runtime-credential-source.ts:100-104`), so the stored token is never removed.
`deviceRevoked` calls the no-op `forgetPairing` (lines 167-179), so a revoked device never drops its pairing. The
comment "the callbacks are used only on a cache miss" names exactly the case that is not prevented.

**Fix:** Do not create the source from the link. Re-arm readiness per pairing revision (reset `ready` when
`readStoredWebRuntimeEnvironment()`'s `pairingRevision` changes, and wait for the pane client's next successful
`getStatus`). Or have the pane entry export the source it created and read that instead of calling
`webRuntimeCredentialFor`.

### WR-02: The first attach can wait forever with no log line and no failure state

**File:** `theia/extensions/orca-browser/src/browser/orca-browser-frontend-module.ts:217-225, 288-305`

**Issue:** `waitForLink()` has no deadline. If the pane bundle never evaluates `pb-browser-host-link.ts` (pane bundle
load failure, or the pane route not served), `run()` never settles. `hostState` stays `'attaching'`, so
`orca-hosting-status.ts:152` never shows `browser-not-attached`, and no log line names the step. That contradicts the
file header's "Failures are one log line naming the step", and Reconnect never re-runs, because its condition needs
`'failed'`.

**Fix:** Race `waitForLink()` (and `connectionWhenReady()`) against a deadline, for example 60 s. On expiry, throw so
the existing catch logs `at the link step` and `setState('failed')` runs. A later Reconnect then retries.

### WR-03: A user close while the host is detached is lost permanently

**File:** `theia/extensions/orca-browser/src/browser/orca-browser-frontend-module.ts:398-412`

**Issue:** `onTabClosed` deletes the page's sessionStorage entry and the table pair first. It then calls
`this.session?.userClosedPage(...)`. With no session (detached, re-attaching), nothing is sent, and the only record
that could replay the close (the sessionStorage entry that `closeEndedPages` reads) has already been removed. orcad
keeps the page, and Orca's tab list shows a page with no tab that nothing will ever close.

**Fix:** When `this.session` is undefined, keep the entry (or move it to a pending-close set) and let
`closeEndedPages` send it after the next successful attach. Delete it only once `userClosedPage` resolves.

### WR-04: A refused commandResult leaves orcad's command unanswered

**File:** `theia/extensions/orca-browser/src/browser/orca-browser-frontend-module.ts:362-369`

**Issue:** `serve()` only logs when `session.commandResult` rejects. orcad validates the result with
`BrowserClientAutomationResult`, whose value is capped at 768 KiB (`BROWSER_CLIENT_AUTOMATION_RESULT_MAX_BYTES`,
`orca/src/shared/browser-client-automation-protocol.ts:8, 91-100`). A `fullScreenshot`, `pdf`, `snapshot` or
`network` result above that is refused. The command then gets no answer until orcad's own timeout, and the agent
sees a stall rather than an error.

**Fix:** On a `commandResult` rejection whose outcome was `completed`, retry once with
`{ status: 'failed', errorCode: 'browser_error' }`. Better, check the serialized size before sending, and answer
`failed` when it exceeds the budget.

### WR-05: A losing duplicate createPage tab erases the winning page's binding records

**File:** `theia/extensions/orca-browser/src/common/orca-browser-dispatch.ts:127-131`;
`theia/extensions/orca-browser/src/browser/orca-browser-frontend-module.ts:374-382, 398-406`

**Issue:** `openAgentTab` writes `this.bound.set(pageId, event)`, writes the sessionStorage entry and connects
`disposed` before `table.bind` runs. When `bind` returns `duplicate-page`, the dispatcher closes the new tab. Its
`onTabClosed(pageId, newTabId)` then:

- deletes `pageId`'s sessionStorage entry, which belongs to the bound first tab;
- falls into the `tabOf(pageId) !== tabId` branch and deletes `this.bound`'s entry for that page. `bound` had already
  been overwritten with the second event.

The bound page then has no inventory entry, its user close sends no worktree selector, and a reload never closes it.

**Fix:** Bind first and record afterwards. Have `openAgentTab` return the widget only, and do the `bound`,
sessionStorage, tracker and `disposed` wiring in the caller after `table.bind(...) === 'bound'`. Alternatively, make
`onTabClosed` a no-op unless the table bound that exact tab.

### WR-06: createPage reports completed before, and regardless of, chrome creating the agent overlay

**File:** `theia/extensions/tab-uris/src/browser/web-tab.ts:1817-1821`;
`theia/extensions/orca-browser/src/browser/orca-browser-frontend-module.ts:374-382`

**Issue:** `openAgentTab` returns once the widget is added. The `webTabOpen` reply is consumed inside `onAfterAttach`
and only feeds `setLostView`. When chrome answers `unavailable` (no agent container,
`PowerBrowserAPI.sys.mjs:3589-3591`), `refused-scheme`, or times out, orcad is still told the page was created.
Every later command then fails `browser_tab_not_found` (`unknown-tab`). Combined with CR-01, the next open of that
widget creates a user overlay.

**Fix:** Expose the first open's reply on the widget (for example `readonly opened: Promise<WebTabReply>`). Have
`openAgentTab` await it, and fail createPage (`browser_error`) and close the widget unless `where` is `opened` or
`loading`.

### WR-07: closeStaleAgentTabs guards a state that cannot occur

**File:** `theia/extensions/orca-browser/src/browser/orca-browser-frontend-module.ts:204, 431-438`
**Category:** necessity

**Issue:** The method closes agent web tabs "restored with the layout" from a previous frontend. Web tabs are never
restored into a new document: ids embed `WEB_TAB_SESSION`, which is regenerated on every module evaluation
(`web-tab.ts:1668`), and the factory admits only `isCurrentSessionTabId` ids (`web-tab.ts:1670-1673`; header at
lines 24-36). It also runs in `prepare()` before the first attach, when this frontend has opened no agent tab. Its
loop therefore can never find a matching widget. Its presence implies a restore path that does not exist, and it
would mislead a later change that does persist agent tabs.

**Fix:** Remove `closeStaleAgentTabs` and its call. Keep `closeEndedPages`, which handles the real reload case
(orcad's host-absent rows). If agent tabs are ever made restorable, add the guard together with that change.

## Info

### IN-01: WebTabSharing lost its doc comment to the inserted agent types

**File:** `theia/extensions/tab-uris/src/browser/web-tab.ts:264-275`
**Issue:** The Phase 37 JSDoc ("whether a tab shares each kind now...") now sits above `WebTabAgentControl`, which
therefore has two doc blocks. `WebTabSharing` has none.
**Fix:** Move the Phase 66 declarations above line 264, or move the Phase 37 comment back down to `WebTabSharing`.

### IN-02: A refused attach is reported twice, once as a "detach"

**File:** `orca-overlay/files/src/renderer/src/pb/browser-host/pb-browser-host.ts:154-158`;
`theia/extensions/orca-browser/src/browser/orca-browser-frontend-module.ts:241-246, 254-257`
**Issue:** `end()` both rejects the pending attach and calls `onDetached` (`notify` defaults true). A host that never
attached therefore logs "the browser host detached" and "did not attach at the attach step", fires `setState('failed')`
twice and sends two `orcaStatus` requests. It also calls `setPlacement(null)` for a placement it never set.
**Fix:** In `end()`, call `onDetached` only when `settled` was already true before this call (a real detach).

### IN-03: The fixture generator's failure text reports "exited undefined"

**File:** `scripts/gen-orca-snapshot-fixtures.mjs:99`
**Issue:** A promisified `execFile` error carries the exit code in `err.code`; `err.status` exists only on the sync
APIs.
**Fix:** Use `${err.code ?? err.signal}`.

### IN-04: closePage drops the store row by the event's page id while the dispatcher closes the target's

**File:** `orca-overlay/files/src/renderer/src/pb/browser-host/pb-browser-host.ts:86-87`;
`theia/extensions/orca-browser/src/common/orca-browser-dispatch.ts:135`
**Issue:** The dispatcher closes `command.targetAuthority.browserPageId ?? pageId`, but `followRow` removes the row
for `event.browserPageId`. Orca's schema checks only the client id of `targetAuthority`. If the two ids ever differ,
the closed page's row stays.
**Fix:** Use the same expression in `followRow`.

### IN-05: An exception inside attach() becomes an unhandled rejection and a 15 s wait

**File:** `orca-overlay/files/src/renderer/src/pb/browser-host/pb-browser-host.ts:256-277, 306`
**Issue:** `void attach()` discards the rejection when `ws.send` throws (socket closing). The host then waits for
`handshake_timeout` instead of ending with a code at once.
**Fix:** `attach().catch(() => end('attach_unsendable'))`.

### IN-06: A parked agent tab's geometry goes stale when its tab area resizes

**File:** `theia/extensions/tab-uris/src/browser/web-tab.ts:991-993, 1068-1071`
**Issue:** The parked box comes from `tabAreaBox()`, but `publish()` is triggered by a `ResizeObserver` on the agent
tab's own node, which is hidden and does not resize. A splitter drag or panel toggle therefore leaves the parked
overlay at its old size until another trigger runs (only a window resize is also observed).
**Fix:** For agent tabs, also republish when the shown widget of its tab area resizes, or when the dock's layout
changes.

### IN-07: setPlacement(null) installs a constant instead of restoring Orca's original placement function

**File:** `orca-overlay/files/src/renderer/src/pb/browser-host/pb-browser-host-link.ts:61-71`
**Issue:** The first call overwrites `prepareBrowserClientHostPlacement`, and `null` then pins `{ kind: 'server' }`.
Orca's own eligibility logic is never consulted again for the life of the document.
**Fix:** Save the original function on first override and reinstate it for `null`.

---

_Reviewed: 2026-11-20T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
