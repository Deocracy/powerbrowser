# Result: R6-tab-uris

Branch: worktree-agent-a374e0c196f1723cb   Base: 08e6f64393f5cc8e54319341079da22657e99bd2   Final: 4ba3dd01 (last code commit; this record is committed on top)

| # | Type | Commit | Files | What and why it is safe |
|---|---|---|---|---|
| 1 | fix | e9af0a22 | theia/extensions/tab-uris/src/browser/web-tab.ts | reopen() sends no webTabOpen for a disposed widget and answers chrome's own `{ ok: true, where: 'unknown-tab' }`; a live widget takes the unchanged path, agent flag included |
| 2 | refactor | f3cdfcc6 | theia/extensions/tab-uris/src/browser/chrome-store-client.ts | 13 copies of request-then-throw fold into okReply()/field(); each literal method name equals its kind, so the Error text, kind literals, timeouts, method names and return values are unchanged; quitRequest keeps its cancelled arm |
| 3 | refactor | 2618e314 | theia/extensions/tab-uris/src/node/tab-store-access-endpoint.ts | chrome() and the tab_store_write arm reuse chromeReply(); the write arm's `${op}` is the msg.kind it sets, so tool error text and the returned reply object are unchanged; the three walls are untouched |
| 4 | refactor | 4ba3dd01 | theia/extensions/tab-uris/src/browser/update-client.ts | removes initRequestSeq(), a postConstruct that set seq to the 0 its field initializer already holds on a singleton; the update-copy harness stubs postConstruct and never called it |

## Bugs fixed
- web-tab.ts:1324 (reopen) at base: reload() (after the webTabReload reply) and recreate() (after the webTabClose reply) reach reopen() after an await with no dispose check. A user close inside that round trip (up to the 5 s ack timeout) made chrome build a hidden overlay for the closed tab (PowerBrowserAPI.webTabOpen:3599) and write its tab row again (webTabAttach:3747), with no widget left to close either. e9af0a22. no-check: the fault needs a close landing during a pending reply; a static check could only pin the guard's spelling, and gui02-web-tab-live is the runtime row for this path.

## Registry requests
None.

## Red by design
None.

## Blocked by check
- group-channel (and update-copy): folding the five copies of the PowerBrowserGroupRequest/Response request-and-timeout block (WebTabChannel.request web-tab.ts:706, ChromeStoreClient.request chrome-store-client.ts:147, ProfileStorageService.request profile-storage.ts:271, UpdateClientContribution.request update-client.ts:277, BrowserWindowCommandContribution.probeChannel browser-window-command.ts:146) into one helper. group-channel's self-test plants faults in each file's own dispatch (cases 4, 5, 7, 10, 13), and update-copy's harness replaces `instance.request` and stubs every import of update-client.ts.
- gui02-web-tab-bridge: rewriting setPermission (web-tab.ts:1517) and shieldToggle (web-tab.ts:1560) from `.then` chains to async/await. The classification clause requires the privileged methods to be declared as `^\s+<method>\(`, which an `async` prefix fails.

## Handoffs
None.

## Needs owner
None.

## Not done
- Caching prepared statements in tab-query-service.ts (searchByPrefix runs per keystroke): the gain is microseconds per prepare, and chrome-bar-suggestions, ng-087 and ng-088 read the prepare literals.
- Skipping publish() for hidden widgets on body mutations: a parked agent tab's rect follows its tab area while hidden, so the skip cannot be proven behaviour-preserving without a browser.
- A helper for the repeated `typeof detail.tabId === 'string' ? widgets.get(...)` lookups in the push handlers: style only.

## Quick gate
`scripts/verify-platform.sh --quick` inside `nix develop .#theia`: 456 rows run, "verify-platform: PASS -- all checks passed" (456 PASS, 0 FAIL, 0 SKIP). `yarn build:extensions` exit 0.
