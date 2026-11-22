# Result: R1a-api-core

Branch: worktree-agent-a2024c5d9a5d87ab8   Base: 08e6f64393f5cc8e54319341079da22657e99bd2   Final: (the commit that adds this record)

| # | Type | Commit | Files | What and why it is safe |
|---|---|---|---|---|
| 1 | fix | e4e51817 | powerbrowser/shell/PowerBrowserAPI.sys.mjs, scripts/verify-api-try-return-await.mjs | `return await` for four async results returned inside a try, so the try's catch applies; success values are unchanged |
| 2 | refactor | 76ffcecc | powerbrowser/shell/PowerBrowserAPI.sys.mjs | moveGroup, resizeGroup and renameGroup share one arm; each kind takes the same fields from the message as before, the rest from the read row, with the same unknown-group text |
| 3 | refactor | 566ee7c1 | powerbrowser/shell/PowerBrowserAPI.sys.mjs | `ddlStatements` / `ddlStatement` replace six copies of the DDL split chain and two identical statement finders; the statements and the error text ("<migration>: DDL marker content missing a required statement") are unchanged |
| 4 | refactor | 58e808bb | powerbrowser/shell/PowerBrowserAPI.sys.mjs | webTabKeyIsValid uses WEB_TAB_ROW_KEY_RE (same pattern, no flags); takeWebTabHistory's top-level check calls treeOk (the same predicate, and entries is already known to be an array) |
| 5 | refactor | 219f2e18 | powerbrowser/shell/PowerBrowserAPI.sys.mjs | lastSelectedTabByWin stores `{ uri }` only; `tab` was never read and kept a closed tab element alive until the next selection |
| 6 | fix | c540c361 | scripts/verify-api-try-return-await.mjs | the new check's self-test finds the delegated shell handler by its shape, so the file spells no brand-scanned token (the brand-scan row was red on it) |

## Bugs fixed
- PowerBrowserAPI.sys.mjs:4787 at base (handleStoreRequest): `return extensionStoreRequest(...)` and `return extensionInstallSite()` without await inside the try, so a rejection (AddonManager, addon.uninstall, a pref write) skipped the catch that keeps raw error text out of the log and the reply. It crossed back raw through GroupActorChild's error path, and nothing was logged. e4e51817, scripts/verify-api-try-return-await.mjs::unawaited return inside a try
- PowerBrowserAPI.sys.mjs:2098 at base (captureTabThumbnail): `return PowerBrowserAPI.writeThumbnail(uri, dataUrl)` without await, so a writeThumbnail rejection (unknown row, store failure) rejected a method documented "Never throws" instead of resolving "capture-failed". e4e51817, same check
- PowerBrowserAPI.sys.mjs:2334 at base (handleShellMessage): the same shape for handleOrcaShellMessage. It is latent, because that handler catches everything itself. The await was added so the check's rule holds without an exception. e4e51817, same check

User-visible effect: none. The chrome-bar widget shows its fixed copy for any failed extension request (extension-actions-widget.tsx `failed()`), and a thumbnail failure already fell back to the text card.

## Registry requests
- scripts/verify-api-try-return-await.mjs: `"api-try-return-await|node $REPO_ROOT/scripts/verify-api-try-return-await.mjs"` (quick tier; it needs theia/node_modules/acorn, as verify-orca-browser-tab-scope.mjs does)
- scripts/verify-api-try-return-await.mjs --self-test: `"api-try-return-await-self-test|node $REPO_ROOT/scripts/verify-api-try-return-await.mjs --self-test"` (quick tier)

The check reads the whole file, both halves. At base it named exactly the four returns above, all in this half. A return of the same shape that R1b adds in its half would turn it red.

## Red by design
All eight rows are red only because the INTERNAL-APIS.md File:Line stamps no longer match the shifted lines; no touchpoint was added or removed. The change integration must make: re-stamp INTERNAL-APIS.md against the merged file (the ng-040 `--fix` mode, which its self-test shows repairs a shift) and re-run these rows.
- internals-catalogue: 326 occurrences whose stamped line moved (first: PowerBrowserAPI.sys.mjs:293).
- ng-040-internals-catalogue-lines: wraps internals-catalogue; same cause.
- ng-039-internals-detects-waivers: drawSnapshot and wrappedJSObject rows at :2180, :9232, :9303 and :11587 (each is its base line plus the shift).
- agent-tab-walls: catalogue clause; disableglobalhistory, channel.suspend/resume, channel.loadInfo.originAttributes and Components.isSuccessCode rows are no longer at their stamped lines.
- site-identity and site-identity-self-test: their clause "every new boundary internal keeps its catalogue row" runs internals-catalogue.
- sidecar-reap-blocker and sidecar-reap-blocker-self-test: the "reap sidecar" row is stamped at the base line; the call is now PowerBrowserAPI.sys.mjs:748.

## Blocked by check
- verify-sql-store-absence (`source.indexOf('parseSessionStoreTabRows()')`): sweepTabStoreFromSessionStore calls parseSessionStoreTabRows() and sessionStoreStockKeys() one after the other with no await between them, so on every sessionstore-state-write-complete it serializes and parses SessionStore.getBrowserState() twice for one snapshot (PowerBrowserAPI.sys.mjs:3359 and :3362 at base). Passing one parsed state to both functions needs a parameter on parseSessionStoreTabRows, which changes the text that check anchors on. It would also move the getBrowserState touchpoint into the sweep.

## Handoffs
- R1b / integration: no Firefox touchpoint was added, removed or moved into a different function. Line shifts relative to base: +14 after the V6 DDL constant, -4 after the migrations, and -32 from the group arms (about base line 2697) to the end of the file, which includes R1b's half. Every INTERNAL-APIS.md line stamp after line 134 therefore has to be re-stamped at integration.

## Needs owner
None.

## Not done
- The per-arm `webTabIdIsValid(data.tabId)` walls in handleGroupMutation (7 arms) and handleWebTabAction (about 25 arms) were not folded into one pre-check. Each arm's wall is a reviewed security property, and verify-new-window-adopt pins it inside the webTabAdopt arm.
- handleWebTabAction has no try/catch, so a throw inside an arm reaches the frontend as GroupActorChild's raw "store" nack. No comment or decision states a fixed-text contract for this handler, unlike handleGroupMutation (M4) and handleStoreRequest, so it is not reported as a bug.
- startTabStoreTriggers upserts a row on every TabAttrModified. Skipping events whose changed attributes cannot touch url or title would stop last_active from moving on those events, which changes store contents.
- queryTabsWithPlaces runs one Places query per tab row (up to 5000, in sequence). Batching them changes the SQL that ng-024 checks, and its only caller is the tab-store access endpoint, not a UI path.
- runQuitFlushSync starts the history save only after the frontend's ack, so a frontend that never acks leaves no time for the save before the deadline. The whole chain is bounded by design, so this was left as is.
- webTabIdentity spreads webTabs into an array once per push to find the entry. That is a constant factor over a handful of tabs.

## Quick gate
`scripts/verify-platform.sh --quick` inside `nix develop .#theia`, run at 219f2e18: 446 PASS, 10 FAIL, 0 SKIP (456 rows, the same row count as the base). The two new rows are not registered, so they are not in that count.
- scan-brand-residue and scan-brand-residue-self-test: FAIL, caused by this lane and wrong. The new check spelled a handler name that contains a third-party token. Fixed in c540c361, then both rows were re-run alone with `--only`: PASS.
- The other eight are red by design (see above).

The new check was run directly and passes in both modes; at base it is red and names the four returns.
