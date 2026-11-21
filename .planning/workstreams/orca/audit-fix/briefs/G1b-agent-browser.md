# Fix brief: G1b-agent-browser

Lane: product. Items: 10. Files this group owns: `^theia/extensions/orca-browser/` (pattern), `^orca-overlay/files/src/renderer/src/pb/browser-host/` (pattern), `orca-overlay/files/vite.pb-browser-host.config.ts`.

Item IDs: T-66-04; 66-CR-02; 66-CR-03; 66-CR-04; 66-WR-01; 66-WR-02; 66-WR-03; 66-WR-04; 66-WR-07; 66-WR-05.

## T-66-04: setPlacement is not bound to the id the Theia host attached with (declared mitigation absent)

- **Severity:** medium (open declared threat)
- **Verdict:** OPEN
- **Location:** `orca-overlay/files/src/renderer/src/pb/browser-host/pb-browser-host-link.ts:61`

**Auditor evidence.** Declared PB-side half absent: pb-browser-host-link.ts:61-71 setPlacement accepts any non-empty string or null; it is not bound to the id the Theia host attached with, and the link object is reachable by any script in the document. Only caller orca-browser-frontend-module.ts:243,250 passes its own id, which is not a restriction. The orcad half is present in pinned third-party code (orca/src/main/runtime/browser-host/browser-host-client-page-creation.ts:47-48, browser_host_lease_stale). Open, below the high threshold, so non-blocking.

**Suggested fix.** Bind setPlacement to the first attached id, as the plan's mitigation states, and add a check that goes red when it accepts another id.

## 66-CR-02: Every pageMetadata call is refused by orcad's schema, and the failure is swallowed

- **Severity:** medium (reviewer label: critical)
- **Verdict:** CONFIRMED
- **Location:** `theia/extensions/orca-browser/src/browser/orca-browser-frontend-module.ts`

*Section CR-02 of `.planning/workstreams/orca/phases/66-powerbrowser-web-tabs-as-orca-s-browser/66-REVIEW.md`, verbatim:*

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

**Verifier (CONFIRMED, medium; scope: linux product (also every platform: Theia orca-browser extension plus the Orca thin host bundle talking to orcad)).** I traced every step from source on disk.
(1) reportMetadata (frontend-module.ts:446) builds only { url, title }. HostSession.pageMetadata at line 73 declares only those two fields. reportMetadata is the only caller of pageMetadata in theia/ or orca-overlay/; it is wired at line 205 from the channel's 'state' push. Line 450 swallows any rejection with .catch(() => undefined).
(2) The host bundle (pb-browser-host.ts:206-216) forwards metadata.loading, canGoBack and canGoForward unchanged. All three are undefined, so JSON.stringify in send() (line 163) drops them from the sealed frame. Its own BrowserHostPageMetadata type (lines 38-44) declares them as required booleans, but the Theia side calls it through its own narrower interface, so the type checker never sees the mismatch.
(3) Upstream schema: orca/src/shared/browser-client-page-metadata-protocol.ts:8-19 declares loading, canGoBack and canGoForward as bare z.boolean(). They are required, not optional and not defaulted. url and title are capped at max(8192) and max(4096). The method is declared with params: BrowserClientPageMetadataParams at orca/src/main/runtime/rpc/methods/browser-client-host.ts:195-198. dispatcher-request-parsing.ts:19 runs safeParse before the handler and returns invalidArgumentResponse on failure. getCompiledSchema uses zod 4.6.7's compile(), which only speeds up the runtime parser and does not loosen it. So every call fails: frame.ok is false, call() throws, and the catch swallows it.
(4) Effect: updatePageMetadata (runtime-browser-page-registry.ts:105) is the only path that writes page url and title after creation. The only other writers are creation/opening and recovery, through browser-client-page-opening.ts:113 and runtime-browser-client-page-recovery.ts:203. browser-tab-catalog.ts reads this registry for the tab list, so tabList, tabCurrent and tabShow keep reporting the creation URL and title.
(5) No recorded result contradicts this. The orca-browser-agent-live clauses do not read metadata from orcad's table. (b) and (f) check the title in the goto command's own result. (h) checks that the page is gone from tab list. (j) checks activation. None of them asserts a url or title that only pageMetadata could set. The project's own records match the defect: STATE.md:176 says "the store row's title stays 'New Tab' (page metadata does not update it)". 66-07-SUMMARY.md:224-226 claims "the host's pageMetadata updates orcad", and the schema shows that claim is wrong.
Severity: this is not a security issue. Agents driving tabs still work; the agent's tab list and current tab carry a stale URL and title, and the error is never logged. That is a user-visible defect under normal use, so medium rather than critical.

## 66-CR-03: Re-attach with any bound agent tab is refused by Orca's attach schema, so the browser host cannot recover

- **Severity:** medium (reviewer label: critical)
- **Verdict:** CONFIRMED
- **Location:** `theia/extensions/orca-browser/src/browser/orca-browser-frontend-module.ts`

*Section CR-03 of `.planning/workstreams/orca/phases/66-powerbrowser-web-tabs-as-orca-s-browser/66-REVIEW.md`, verbatim:*

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

**Verifier (CONFIRMED, medium; scope: linux product (all platforms running the Orca browser host)).** I traced every step from source.
(1) Each run() mints a new id `pb-host-${crypto.randomUUID()}` (line 232). onDetached (241-246) clears only this.session and the placement. this.bound and pages.table are not touched. The only code that drops table entries is onTabClosed (line 407) and the dispatcher's closePage (orca-browser-dispatch.ts:140). No detach path, Phase 67 path or chrome path closes bound agent tabs.
(2) inventory() (464-483) copies browserHostClientId from the stored createPage event. That event is built by orcad's BrowserHostCommandLedger (orca/src/main/runtime/browser-host/browser-host-command-ledger.ts:124-133) by spreading `...this.authority`. The authority is the lease's BrowserHostLeaseAuthority, which carries the browserHostClientId of the host that held the lease when the page was created. So after a detach, every entry carries the previous session's id.
(3) The host bundle sends `pageInventory: options.inventory?.() ?? []` with pageInventoryProtocolVersion 1 (pb-browser-host.ts:264-275). Orca's BrowserClientHostAttachParams.superRefine (orca/src/shared/browser-client-host-protocol.ts:166-174) adds an issue for each entry whose browserHostClientId differs from params.browserHostClientId.
(4) The attach method declares `params: BrowserClientHostAttachParams` (rpc/methods/browser-client-host.ts:21-23). dispatcher-request-parsing.ts:19-23 runs safeParse through getCompiledSchema and returns invalidArgumentResponse on failure. getCompiledSchema uses zod 4.6.7 compile(). In node_modules/zod/v4/core/compile.js:520-536, compile() keeps superRefine check functions; it does not drop them. The reply is therefore ok:false.
(5) onAttachFrame (pb-browser-host.ts:232) calls end('attach_refused:...'). That runs onDetached and rejects the promise. run() catches it and calls setState('failed').
(6) runReconnect (orca-hosting-status.ts:180-183) and its re-pair branch (208-210) call browserHost.attach(), which goes through the same path. closeEndedPages only handles pages the table no longer binds (line 416), and it runs only after a successful attach, so it cannot help.
No overlay patch changes the schema: orca-overlay/patches has only 010, 070 and 080, none touching browser-client-host.
Recorded evidence: the Phase 67 live runs (run6/8/9, 67-VERIFICATION.md:92) show recovery, but verify-orca-failure-page-live.mjs never opens agent tabs. Those runs do not cover this precondition and do not contradict the finding.
Severity is medium, not high. The failure needs at least one agent tab open when the detach happens. Two workarounds exist: close every agent tab (onTabClosed drops it from the table), or reload the frontend. Either way the user sees a browser-host failure page that Reconnect does not clear.

## 66-CR-04: Every automation call is capped at the bridge's 5 s acknowledgement timeout and reported as browser_error

- **Severity:** medium (reviewer label: critical)
- **Verdict:** CONFIRMED
- **Location:** `theia/extensions/orca-browser/src/browser/orca-browser-frontend-module.ts`

*Section CR-04 of `.planning/workstreams/orca/phases/66-powerbrowser-web-tabs-as-orca-s-browser/66-REVIEW.md`, verbatim:*

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

**Verifier (CONFIRMED, medium; scope: linux product (all platforms that run the Orca browser host: Theia frontend to chrome bridge)).** I traced the whole path from source.

1. The cited code exists and does what the finding says. `agentCall` at orca-browser-frontend-module.ts:386 calls `this.channel.request({ kind: 'webTabAgent', ... })` with no timeout argument. `WebTabChannel.request` (web-tab.ts:702-725) arms `window.setTimeout(() => settle({ ok: false, reason: 'timeout' }), WEB_TAB_ACK_TIMEOUT_MS)`, and that constant is 5000 (web-tab.ts:44). `settle` removes the GROUP_RESPONSE_EVENT listener, so a later reply is dropped. `outcomeOf` (orca-browser-dispatch.ts:79-81) maps any `ok !== true` reply, timeout included, to `failed('browser_error')`. `dispatchCommand` (:160) sends that outcome back to Orca through `session.commandResult`.

2. There is no separate long-running path and no early acknowledgement. GroupActorChild.sys.mjs:46-79 forwards the request with a single `sendQuery("PowerBrowserGroupMutation", msg)` and calls `sendResponse` only when that query's promise settles. On the parent side, PowerBrowserAPI.sys.mjs:4556 routes the message to `handleWebTabAction`, which goes to `handleWebTabAgent` (:5591, :11746-11795). That function awaits the full method before it returns: the native row, or `agentRunInChild` (`actor.sendQuery(AGENT_RUN_MESSAGE)` raced only against a tab-close or Stop abort). For child rows it then waits in `agentSettleOpens`, a 100 ms beat and up to 3000 ms more while a document loads. So one reply arrives only after the whole command finishes.

Chrome's own deadlines are longer than 5 s:
- `browser.wait` uses `params.timeout`, or 30000 ms when none is given (GroupActorChild.sys.mjs:612).
- `agentPageEval` defaults to 30000 ms (:393).

Orca expects long waits on this hop. orca/src/shared/browser-wait-timeout.ts sets `BROWSER_WAIT_DEFAULT_TIMEOUT_MS = 25_000` and gives forwarding hops `max(60_000, timeout + 30_000)`. So any `orca wait` whose condition is met after 5 s, or an eval whose promise resolves after 5 s, is answered `browser_error` while chrome keeps running the command.

3. No other path prevents the failure. There is no subclass or override of `request`, and no per-call timeout parameter. `agentCall` is the only route for automation methods.

4. No recorded result contradicts this. The live harness drives the same `WebTabChannel.request` (scripts/lib/orca-browser-live.mjs:208, `agentRaw`), but every agent-live clause in scripts/verify-orca-browser-agent-live.mjs is a short call: evals of `location.pathname` or `window.open`, clicks, and the like. None waits past 5 s. The PASS results in 66-VERIFICATION.md, coord-6609, do not exercise this case.

One part of the finding is inaccurate: "browser_timeout is never produced". When chrome's own deadline is under 5 s (for example `wait` with `timeout: 2000`), the child throws `AgentRowError("browser_timeout")` (GroupActorChild.sys.mjs:380), and that code passes through `outcomeOf`'s 'failed' branch. The local 5 s timeout itself does map to `browser_error`, and the core defect stands.

Severity is medium, not high. Short commands work, and long waits, slow evals and large screenshots or PDFs fail with the wrong error code.

## 66-WR-01: The link can create and cache Orca's shared credential source with no-op callbacks, disabling the pane client's token cleanup and revocation handling

- **Severity:** warning (not refutation-checked)
- **Verdict:** REPORTED
- **Location:** `orca-overlay/files/src/renderer/src/pb/browser-host/pb-browser-host-link.ts`

*Section WR-01 of `.planning/workstreams/orca/phases/66-powerbrowser-web-tabs-as-orca-s-browser/66-REVIEW.md`, verbatim:*

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

## 66-WR-02: The first attach can wait forever with no log line and no failure state

- **Severity:** warning (not refutation-checked)
- **Verdict:** REPORTED
- **Location:** `theia/extensions/orca-browser/src/browser/orca-browser-frontend-module.ts`

*Section WR-02 of `.planning/workstreams/orca/phases/66-powerbrowser-web-tabs-as-orca-s-browser/66-REVIEW.md`, verbatim:*

**File:** `theia/extensions/orca-browser/src/browser/orca-browser-frontend-module.ts:217-225, 288-305`

**Issue:** `waitForLink()` has no deadline. If the pane bundle never evaluates `pb-browser-host-link.ts` (pane bundle
load failure, or the pane route not served), `run()` never settles. `hostState` stays `'attaching'`, so
`orca-hosting-status.ts:152` never shows `browser-not-attached`, and no log line names the step. That contradicts the
file header's "Failures are one log line naming the step", and Reconnect never re-runs, because its condition needs
`'failed'`.

**Fix:** Race `waitForLink()` (and `connectionWhenReady()`) against a deadline, for example 60 s. On expiry, throw so
the existing catch logs `at the link step` and `setState('failed')` runs. A later Reconnect then retries.

## 66-WR-03: A user close while the host is detached is lost permanently

- **Severity:** warning (not refutation-checked)
- **Verdict:** REPORTED
- **Location:** `theia/extensions/orca-browser/src/browser/orca-browser-frontend-module.ts`

*Section WR-03 of `.planning/workstreams/orca/phases/66-powerbrowser-web-tabs-as-orca-s-browser/66-REVIEW.md`, verbatim:*

**File:** `theia/extensions/orca-browser/src/browser/orca-browser-frontend-module.ts:398-412`

**Issue:** `onTabClosed` deletes the page's sessionStorage entry and the table pair first. It then calls
`this.session?.userClosedPage(...)`. With no session (detached, re-attaching), nothing is sent, and the only record
that could replay the close (the sessionStorage entry that `closeEndedPages` reads) has already been removed. orcad
keeps the page, and Orca's tab list shows a page with no tab that nothing will ever close.

**Fix:** When `this.session` is undefined, keep the entry (or move it to a pending-close set) and let
`closeEndedPages` send it after the next successful attach. Delete it only once `userClosedPage` resolves.

## 66-WR-04: A refused commandResult leaves orcad's command unanswered

- **Severity:** warning (not refutation-checked)
- **Verdict:** REPORTED
- **Location:** `theia/extensions/orca-browser/src/browser/orca-browser-frontend-module.ts`

*Section WR-04 of `.planning/workstreams/orca/phases/66-powerbrowser-web-tabs-as-orca-s-browser/66-REVIEW.md`, verbatim:*

**File:** `theia/extensions/orca-browser/src/browser/orca-browser-frontend-module.ts:362-369`

**Issue:** `serve()` only logs when `session.commandResult` rejects. orcad validates the result with
`BrowserClientAutomationResult`, whose value is capped at 768 KiB (`BROWSER_CLIENT_AUTOMATION_RESULT_MAX_BYTES`,
`orca/src/shared/browser-client-automation-protocol.ts:8, 91-100`). A `fullScreenshot`, `pdf`, `snapshot` or
`network` result above that is refused. The command then gets no answer until orcad's own timeout, and the agent
sees a stall rather than an error.

**Fix:** On a `commandResult` rejection whose outcome was `completed`, retry once with
`{ status: 'failed', errorCode: 'browser_error' }`. Better, check the serialized size before sending, and answer
`failed` when it exceeds the budget.

## 66-WR-07: closeStaleAgentTabs guards a state that cannot occur

- **Severity:** warning (not refutation-checked)
- **Verdict:** REPORTED
- **Location:** `theia/extensions/orca-browser/src/browser/orca-browser-frontend-module.ts`

*Section WR-07 of `.planning/workstreams/orca/phases/66-powerbrowser-web-tabs-as-orca-s-browser/66-REVIEW.md`, verbatim:*

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

## 66-WR-05: A losing duplicate createPage tab erases the winning page's binding records

- **Severity:** warning (not refutation-checked)
- **Verdict:** REPORTED
- **Location:** `theia/extensions/orca-browser/src/common/orca-browser-dispatch.ts`

*Section WR-05 of `.planning/workstreams/orca/phases/66-powerbrowser-web-tabs-as-orca-s-browser/66-REVIEW.md`, verbatim:*

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

