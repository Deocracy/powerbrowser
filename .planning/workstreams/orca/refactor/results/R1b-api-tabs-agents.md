# Result: R1b-api-tabs-agents

Branch: worktree-agent-a19b5860cc768ee55   Base: 08e6f64393f5cc8e54319341079da22657e99bd2   Final: the commit that adds this record (last code commit 75e48a84)

| # | Type | Commit | Files | What and why it is safe |
|---|---|---|---|---|
| 1 | perf | 56545385 | powerbrowser/shell/PowerBrowserAPI.sys.mjs | `PowerBrowserProcesses.listProcessTree` issues its `/proc/<pid>/stat` reads together (`Promise.all`) instead of awaiting each in turn. OrcaService polls it every 250 ms while orcad starts, and calls it again at stop and reap. Each read keeps its own catch, and the table is filled in the listing's order, so the returned rows are the same. |
| 2 | refactor | 1f18380a | powerbrowser/shell/PowerBrowserAPI.sys.mjs | `adoptFallback` and `tabsBridgeRemove` repeated the same pending-overlay teardown: purge prompt records, `hideBars`, `tabHostDropTab`, `remove`. Both now call `dropPendingOverlay(win, browser)` with the window each one passed before, so the steps and their order are unchanged. The helper sits inside the adopt-section markers, so the `node:vm` slice in `verify-orca-browser-tab-scope` still evaluates it. |
| 3 | refactor | 75e48a84 | powerbrowser/shell/PowerBrowserAPI.sys.mjs | Removed two record fields that are written and never read: the prompt record's `window` and the open-popup record's `extension`. `git grep` finds no reader for either in powerbrowser/, theia/ or scripts/. |

## Bugs fixed
None.

## Registry requests
None.

## Red by design
- internals-catalogue, ng-039-internals-detects-waivers, ng-040-internals-catalogue-lines, agent-tab-walls (its catalogue clause), site-identity and site-identity-self-test (each one re-runs internals-catalogue): these go red because catalogue line numbers in `powerbrowser/INTERNAL-APIS.md` shifted. Every failing occurrence is at `PowerBrowserAPI.sys.mjs:7704` or later, all in this half. No touchpoint was added, removed or moved to a different function. Integration fix: re-stamp the catalogue's line numbers for PowerBrowserAPI.sys.mjs once both R1 lanes are merged.

## Blocked by check
- verify-permission-prompts (rule ab, `checkSharingBehaviour`): this check evaluates only the four sharing function bodies. That blocks folding the webRTC `{ camera, microphone, screen }` boolean literal, which is written twice (`updateWebTabSharing` and `resendWebTabSharing`, base :7889 and :7906), into one helper.
- verify-page-tools-edit (the `webTabEditEnabled` body pin) and verify-orca-browser-tab-scope :1100-1102 (`sendQuery` must be in each function): together these block folding the edit-state query race shared by `webTabEditEnabled` and `pageEditTargetCommands` (base :10141 and :11076) into one helper.
- verify-site-identity :1478 (plant text `async function webTabClearSiteData(browser, principal) {`): blocks dropping the unused `browser` parameter of `webTabClearSiteData` (base :6589). The caller is also in R1a's half (:5374).
- verify-permission-prompts :837 (reads `const PROTOCOL_REGISTRAR_CONTRACT = "..."`): blocks removing that constant (base :8240). No product code reads it.

## Handoffs
None. No Firefox touchpoint was added, removed or moved. Only line numbers changed in `listProcessTree` (`IOUtils.getChildren` and `IOUtils.read`), `installPermissionPromptFurniture` and every row below base :7600.

## Needs owner
None.

## Not done
- Agent idle mark: `agentArmIdle` does not count native rows (for example `browser.goto`, up to 30 s) in `control.inFlight`. If two calls overlap, the idle timer can clear the mark while a native call is still running. Orca appears to send one call at a time per page. A fix would change the agent bridge's in-flight set, which the stop path also reads, so I did not make it.
- `searchSuggestions` resolves the bar engine twice per keystroke, and `pushExtensionActions` runs once for every host tab event. Both are constant-factor costs with deduplication already in place; I did not change them.
- `purgeSiteTabRows` and `listSearchEngines` await in sequence, but each runs once per user action, so I did not change them.

## Quick gate
450 PASS, 6 FAIL, 0 SKIP (base: 456 PASS). All 6 FAIL rows are Red by design (catalogue line numbers, listed above). I re-ran site-identity and agent-tab-walls alone and confirmed that their only failing clause is the catalogue.
