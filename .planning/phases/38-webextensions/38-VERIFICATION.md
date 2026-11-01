---
phase: 38-webextensions
verified: 2026-11-01T00:00:00Z
status: human_needed
score: 10/25 must-haves verified
covered_files: [".planning/phases/38-webextensions/38-01-PLAN.md", ".planning/phases/38-webextensions/38-01-SUMMARY.md", ".planning/phases/38-webextensions/38-02-PLAN.md", ".planning/phases/38-webextensions/38-02-SUMMARY.md", ".planning/phases/38-webextensions/38-03-PLAN.md", ".planning/phases/38-webextensions/38-03-SUMMARY.md", ".planning/phases/38-webextensions/38-04-PLAN.md", ".planning/phases/38-webextensions/38-04-SUMMARY.md", ".planning/phases/38-webextensions/38-05-PLAN.md", ".planning/phases/38-webextensions/38-05-SUMMARY.md", "patches/050-extension-tab-host.patch", "powerbrowser/INTERNAL-APIS.md", "powerbrowser/endpoint-allowlist.json", "powerbrowser/shell/PowerBrowserAPI.sys.mjs", "powerbrowser/shell/powerbrowser.js", "scripts/check-internals-boundary.sh", "scripts/lib/pb-extension-fixtures.mjs", "scripts/verify-ext-tab-host-live.mjs", "scripts/verify-ext-tab-host-patch-guards.mjs", "scripts/verify-ext-tab-host-scope.mjs", "scripts/verify-extension-actions-live.mjs", "scripts/verify-extension-actions.mjs", "scripts/verify-extension-amo-live.mjs", "scripts/verify-new-window-adopt.mjs", "scripts/verify-platform.sh", "scripts/verify-shell-error-copy.mjs", "scripts/verify-shell-gbrowser-standin.mjs", "scripts/verify-web-tab-bridge.mjs", "scripts/verify-webextensions.mjs", "theia/extensions/chrome-bar/src/browser/address-bar/address-bar.tsx", "theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts", "theia/extensions/chrome-bar/src/browser/chrome-bar-frontend-module.ts", "theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx", "theia/extensions/chrome-bar/src/browser/chrome-bar.css", "theia/extensions/chrome-bar/src/browser/extensions/extension-actions-widget.tsx", "theia/extensions/chrome-bar/src/browser/extensions/extension-popup-anchor.ts", "theia/extensions/chrome-bar/src/browser/extensions/extension-sidebar-view.ts", "theia/extensions/tab-uris/src/browser/chrome-store-client.ts", "theia/extensions/tab-uris/src/browser/web-tab.ts"]
covered_digest: "v3:sha256:c85e7b5753fdd14ad4ff9bbaaf62b1f0db513cfd9c7e614dc5c3be064274960f"
behavior_unverified: 14
overrides_applied: 0
behavior_unverified_items:
  - truth: "An installed extension's tabs.query, tab events and active tab report the web tabs as they would in Firefox (SC1)"
    test: "Run verify-ext-tab-host-live.mjs --scenario query,events,active-tab,sender,adversarial-starts,gui01,refused-write on a build with the amended patch 050"
    expected: "Each scenario green; refused-write now exercises the highlighted refusal, not the active one"
    why_human: "Patch 050 was amended in this phase (tabContainer dispatch, tabs.update active, zero-tab create). Its effect exists only in a rebuilt Gecko; no build exists in this worktree"
  - truth: "Extension buttons show in the chrome bar and in a puzzle menu with icon, badge, Pin to Toolbar, Manage and Remove (SC2, EXT-06)"
    test: "Scenarios buttons and manage, then the visual geometry check by eye"
    expected: "The pushed set equals the installed set in both directions; the badge updates on setBadgeText; Pin persists across a relaunch; Manage opens the Add-ons Manager; Remove uninstalls behind its confirm row"
    why_human: "Rendering, badge position and the 300px menu are visual; the pin and uninstall effects need a running AddonManager"
  - truth: "Clicking a button opens its popup in the native panel or runs its action on the active web tab (SC2, EXT-07)"
    test: "Scenario popup-action"
    expected: "The popup opens in chrome's native panel at the button; the action runs on the host's selected tab and never the stock tab; Esc, second click, focus into the page and tab switch each close it with the pill focus the scenario expects"
    why_human: "Native XUL panel; focus and close ordering are runtime. CR-01 (tabContainer) hid a throw on every click from all static gates before the review found it"
  - truth: "Extension content scripts run in web tabs with sender.tab set and the background reaches the page by tab id (SC3, EXT-08)"
    test: "Scenario content (relaunch with the unsigned XPI)"
    expected: "The hello from /a carries a real sender.tab id; tabs.sendMessage(tabId) reaches the page; a zero-overlay startup throws nothing"
    why_human: "Needs the built shell and a profile-scope XPI install"
  - truth: "A page action enables only on matching web tabs and its pill icon shows and hides per tab (SC3, EXT-08)"
    test: "Scenario page-action"
    expected: "show_matches shows the icon on the matching page only, hides it on others and on the first-tab case; the click runs the action"
    why_human: "Runtime per-tab state; the icon placement in the pill is also an owner decision (UAT 32)"
  - truth: "Extension contextMenus entries appear in the page menu relay and run on the web tab, never in the IDE (SC3, EXT-08)"
    test: "node scripts/verify-page-furniture-live.mjs --scenario extension-entry"
    expected: "The entry arrives as an extension-entry row after the stock rows; picking it makes menus.onClicked fire with the web tab"
    why_human: "The wiring is Phase 35's relay (case extension-entry in the dispatcher); only a live right-click proves the join"
  - truth: "Installing an extension from addons.mozilla.org shows the stock install prompt and the extension then works (SC4, EXT-09)"
    test: "Scenario amo-install, then a real click on the site's install button in the stock window"
    expected: "The stock addon-webext-permissions prompt appears naming the add-on, Add installs it signed, its row arrives in the puzzle menu and its popup opens on /a"
    why_human: "Needs network and a built binary. Install from inside a web tab does not prompt (owner decision), so the route is the stock window"
  - truth: "An ad blocker blocks live in a web tab (SC5, EXT-10)"
    test: "Scenario fixtures"
    expected: "The tracker image that loaded before install fails on /ad and the pushed badge reads above zero"
    why_human: "Live signed install and page-side assertion; the blocker may need more than 60 s on a cold profile"
  - truth: "A dark-mode extension restyles a web tab live (SC5, EXT-10)"
    test: "Scenario fixtures"
    expected: "/plain's painted luminance falls below 0.3 after install"
    why_human: "Live signed install and page-side measurement"
  - truth: "tabs.create, tabs.remove and tabs.update from an extension mint, close or select a chrome overlay that Theia claims, without moving the host selection to a tab the frontend never showed (38-01, CR-03, WR-03)"
    test: "Scenario tabs-bridge, including the /d create-activate step and the extension-page step"
    expected: "Created tabs are adopted (no orphan overlay); /d ends current in the frontend and host.selected; tabs.remove resolves after the node and overlay are gone; the extension-page step opens a new stock window"
    why_human: "State transitions and ordering across chrome and the frontend, with the adoption ack in between. Presence of the code does not prove the order"
  - truth: "An extension sidebar page shows as a Theia side-panel view driven from the puzzle menu, with patch 050's shell sidebarAction skip intact (38-04, B5)"
    test: "Scenario sidebar, then the visual check that the page sits exactly over the view"
    expected: "Show Sidebar opens a view in the right side panel; the chrome panel browser tracks the view's rect, hides under a Theia menu and follows a splitter drag; Hide Sidebar closes it"
    why_human: "A chrome-privileged browser painted over a Theia-reported rect; geometry is visual"
  - truth: "Extension pages that open in a tab go to the stock window while web tabs still refuse moz-extension:// (38-04, B5)"
    test: "Scenario tab-pages"
    expected: "tabs.create and openOptionsPage of the extension's own pages open in the stock window; openOptionsPage switches to the open tab instead of adding a second one; a web tab refuses the same URL"
    why_human: "Needs a stock window and the fixture's options and dashboard pages"
  - truth: "Extension keyboard shortcuts fire while a web page has focus and Theia keeps its keys otherwise (38-04, B5)"
    test: "Scenario commands"
    expected: "pb-probe and _execute_sidebar_action fire with /a focused and do not fire with the IDE focused; the Theia-side recorder sees the key in the IDE case"
    why_human: "GlobalKeyListener, capture-phase ordering and focus tracking are runtime (the SUMMARY lists four live risks)"
human_verification:
  - test: "Run the 11 Phase 38 live scenarios and the two live self-tests (38-UAT.md items 1-13)"
    expected: "All green; each live plant goes red naming its drift"
    why_human: "No built binary exists; the owner rule defers every live run to the one end-of-milestone pass covering Phases 32-38"
  - test: "Re-patch main's upstream/ with the amended patch 050 and rebuild Gecko (38-UAT.md prerequisites)"
    expected: "The amended 050 applies with --3way, the build succeeds, the stamp is rewritten, Theia builds"
    why_human: "The amended patch has never been applied to a tree or compiled; main's upstream/ is not touched from this worktree"
  - test: "Run the neighbour live suites and the visual and manual checks (38-UAT.md items 14-24)"
    expected: "No regression in Phases 31.1, 27, 35 and the web tab suite; geometry, private-browsing and install click-through behave as the SUMMARYs state"
    why_human: "Live, visual or manual"
  - test: "Check the review fixes that have no live row (38-UAT.md items 25-30)"
    expected: "Each behaves as 38-REVIEW's Outcome paragraph states"
    why_human: "Fixed by static plants only; CR-02, WR-05 and WR-06 have no scenario"
  - test: "Decide the EXT-10 password-manager fill under D-09 (38-UAT.md item 31)"
    expected: "Option (a), (b) or (c) chosen; (b) local Vaultwarden is recommended"
    why_human: "Owner decision; until it is taken EXT-10 is incomplete as written"
  - test: "Owner decisions 32-40 (placement, AMO from a web tab, tabs.create with no stock window, extension-initiated sidebar/popup, containers, getTabSharingState, Info findings, principal mismatch, install footer)"
    expected: "Accept or reopen each"
    why_human: "Owner decisions; none is a code defect against the roadmap contract"
---

# Phase 38: WebExtensions Verification Report

**Phase Goal:** Installed Firefox extensions work in web tabs as they do in Firefox, driven from toolbar buttons and a puzzle menu in the chrome bar
**Verified:** 2026-11-01 (HEAD `5528bf56`; phase work is the 45 commits of `git log ead9bf16..HEAD`)
**Status:** human_needed
**Re-verification:** No. Initial verification. No previous VERIFICATION.md existed.

No objdir or Gecko build exists in this worktree, and live runs are forbidden here. By the owner's rule, criteria that need a browser are `human_needed`, not gaps. A gap would be something the static tree shows missing or wrong. I found none. Every code path the roadmap names exists and is wired from the Theia widget through `ChromeStoreClient` and the store kinds to the Phase 38 section of `PowerBrowserAPI.sys.mjs` and the 31.1 tab host. The phase also amended patch 050, and that amendment has never been applied to a tree or compiled, which is why so much of the score is "present, behavior unverified".

One fact weighs on how much the green static gates mean. 38-REVIEW CR-01 found that patch 050's new dispatch read `gBrowser.tabContainer`, which the shell did not define, so every click, badge update and page-action update would have thrown. Every static gate that existed at that point was green. The gates now derive the required members from 050's `+` lines (WR-09), but the live pass is the first run of the click path on a real build.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1: `tabs.query`, tab events and active tab report the web tabs as they would in Firefox | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | The capability is Phase 31.1's tab host. Phase 38 amended patch 050 (`12118720`, `de1dd0e5`): `TabHostActionUpdate` dispatch on `window.gBrowser.tabContainer`, `tabs.update` select, zero-tab `create` guard (G11). `verify-ext-tab-host-patch-guards` PASS, 45 plants red. Shell `gBrowser.tabContainer` getter present (`verify-shell-gbrowser-standin` PASS, plant s2 red). Live regression set not run |
| 2 | SC2: buttons in the chrome bar and a puzzle menu with icon, badge, Pin to Toolbar, Manage, Remove | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `ExtensionActionsWidget` bound (chrome-bar-frontend-module.ts:88), injected and rendered (chrome-bar-widget.tsx:442, 504, 1863). Rows come only from the `extensionAction` push (`web-tab.ts:606` -> `extensionActionRowsOf`). Copy rows `pinToToolbarRow`, `manageExtensionRow`, `removeExtensionRow` exist; badge capped at four characters (`pb-ext-badge`). Scenarios `buttons`, `manage` not run |
| 3 | SC2: a click opens the popup or runs the action on the active web tab | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `extensionClick` (PowerBrowserAPI.sys.mjs:10014) calls `named.action.triggerClickOrPopup(selectedTab)` (:10033) where `selectedTab = tabHosts.get(win)?.selected`. Popup opens in a native panel (`extensionOpenPopup`). Scenario `popup-action` not run |
| 4 | SC3: content scripts run in web tabs with `sender.tab`, background reaches the page by tab id | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Identity is the 31.1 host (D-05, no new path). Scenario `content` and its `sender-tab-null` plant exist and are audited (`--static` PASS). Not run |
| 5 | SC3: page actions enable per tab with `show_matches`, pill icon shows and hides, click works | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `pageActionShown` is a row field (:9773-9784), validated in `extensionActionRowsOf`, rendered by `renderPageActions` into the address bar (`address-bar.tsx:2532`, `chrome-bar-widget.tsx:505`). Click sends `extensionClick(..., pageAction=true)`. Scenarios `content`, `page-action` not run |
| 6 | SC3: context-menu entries appear in the page menu and run on the web tab | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Rides Phase 35's relay: dispatcher arm `extension-entry` calls `pending.extensionItems.get(itemId).doCommand()` (:8467). `verify-extension-actions` derives that no new relay exists (PASS). The live join is Phase 35's `extension-entry` scenario, not run |
| 7 | SC4: install from addons.mozilla.org shows the stock install prompt and the extension then works | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Install footer -> `extensionInstallSite` (:10482) reads upstream's `extensions.getAddons.link.url`, refuses non-https, opens the stock window via `openStockTab`. No prompt is authored (D-04). Scenario `amo-install` not run. In a web tab the install does not prompt (owner decision, UAT 33) |
| 8 | SC5: an ad blocker is checked working live in a web tab | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Scenario `fixtures`: uBlock Origin from its listing, signed install, `/ad` tracker image fails and badge > 0. Slug names only; ids, versions, XPI URLs are read at check time (`AMO_FIXTURES` :70; the static audit rejects a hand-kept id). Not run |
| 9 | SC5: a dark-mode extension is checked working live in a web tab | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Scenario `fixtures`: Dark Reader, `/plain` luminance < 0.3. Not run |
| 10 | SC5: a password manager is checked working live in a web tab | ? UNCERTAIN | The manager sub-case proves only that Bitwarden's popup opens on `/login`. Bitwarden keeps no login without a vault account and D-09 forbids both an account and a committed secret, so "offers and fills" cannot be proved as written. Owner decision (a)/(b)/(c), recommended (b) a local Vaultwarden. Recorded, not a code gap: the fill needs infrastructure that does not exist, and no must-have code is missing |
| 11 | 38-01: one sanctioned click path; no code can trigger an action on the shell window or the stock tab | ✓ VERIFIED | `triggerClickOrPopup(selectedTab)` occurs once (:10033); `triggerAction(` occurs zero times. `verify-extension-actions` rule 1/2 and plants `triggerAction(shell)`, `click path re...` red (43 plants) |
| 12 | 38-01: `tabs.create/remove/update` mint, close, select a chrome overlay that Theia claims, refuse non-http(s) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `tabsBridgeCreate/Remove/Activate` exist (:10083 area); rule 6 requires activation to wait for the ack (CR-03), rule 12/12b require close-before-resolve (WR-03) and the container refusal (CR-02). Behavior is an ordering invariant across chrome and the frontend. Scenario `tabs-bridge` (with `/d create-activate`) not run |
| 13 | 38-01/04/05: every new touchpoint is an appended INTERNAL-APIS.md row, and the gate derives its expectations and goes red on each plant | ✓ VERIFIED | `check-internals-boundary.sh --catalogue` PASS; `verify-ng-040-internals-catalogue-lines` PASS (in `--quick`); `verify-extension-actions` PASS (99 sources, 4 fixtures derived) and `--self-test` PASS (43 plants) |
| 14 | 38-01/02/04/08: extension kinds are privileged and callable only from the extension widget's event handlers; no command id or keybinding row | ✓ VERIFIED | `verify-web-tab-bridge` PASS (35 kinds) and `--self-test` PASS (67 plants), including WR-08 plants `readClipboardText` in the extension widget, `extensionRemove` in the pill, `extensionClick` in the chrome bar widget. `PRIVILEGED_CALLERS` and `EXTENSION_CALLERS` are separate fences |
| 15 | 38-02: the popup renders in the native XUL panel, not Theia DOM, and no CustomizableUI is wired | ✓ VERIFIED | No `CustomizableUI` and no `getTabForBrowser` after the Phase 38 section start (:9660). Plant `popup-native-blocked` (live) and rule 8 forbid `<iframe`, `dangerouslySetInnerHTML` and an extension-scheme string in the widget. Static: PASS |
| 16 | 38-02: every new user-facing string is in `CHROME_BAR_COPY`, copy gate green, pinned set persists | ✓ VERIFIED | `verify-shell-error-copy` PASS and `--self-test` PASS (15 plants); `extensionSetPinnedIds` writes the pref `powerbrowser.extensions.pinned` (:9705-9707). That the pin survives a relaunch is scenario `manage` (UAT 3) |
| 17 | 38-04: an extension sidebar page shows as a Theia side-panel view; patch 050's shell `sidebarAction` skip stays intact | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `extension-sidebar-view.ts`, `extensionSidebarOpen/Geometry/Close`, `extensionFrontendGone` (WR-05) exist and are wired through `extensionSidebar` / `extensionSidebarGeometry` store kinds (:4352). 050's `ext-sidebarAction.js` skip is untouched (guards PASS). Scenario `sidebar` not run |
| 18 | 38-04: extension tab pages open in the stock window; web tabs still refuse `moz-extension://` | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `extensionOpenTabPage` (WR-01, WR-06 fixes), no extension URL passed through `openBrowserWindow(url...)` (rule 12). Scenario `tab-pages` not run |
| 19 | 38-04: extension shortcuts fire with page focus; Theia keeps its keys otherwise | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `extensionExecute` and the per-window keyset with a capture `command` listener; every extension key is disabled while no page has focus. Scenario `commands` and its plants `commands-always-fire`, `commands-never-fire` not run |
| 20 | 38-04: extensions not allowed in private windows reach no sidebar, row, click, popup or stock-tab page there | ✓ VERIFIED | `extension.canAccessWindow(win)` at the derived guarded set (rule 14; `extensionClick` :10015 checks first). 7 derived plants plus one red. `tabsBridgeRemove/Activate` are deliberately unguarded at the bridge (the stand-in receives no extension; upstream guards before the call) per 38-04-SUMMARY. The manual private-window check is UAT 22 |
| 21 | 38-05: the add-ons site hosts are allowlisted and named in ROADMAP.md and REQUIREMENTS.md in the same change; `allowlist-doc-consistency` green | ✓ VERIFIED | `endpoint-allowlist.json` allows `addons.mozilla.org`, `versioncheck.addons.mozilla.org`, `versioncheck-bg.addons.mozilla.org`; `services.addons.mozilla.org` stays `deny`. Named at ROADMAP.md:522 and REQUIREMENTS.md:193-196. `allowlist-doc-consistency`, its self-test (3 planted hosts) and `allowlist-schema` PASS in `--quick`; `verify-webextensions` PASS and `--self-test` PASS (9 plants) |
| 22 | 38-01 amendment: patch 050 signals badge/icon updates, lets `tabs.update` select, guards zero-tab `create`; the shell listens | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Patch text and the chrome listener agree (`EXTENSION_TAB_EVENTS` lists `TabHostActionUpdate`, rule 7 derives it from the patch; guards G10, G11). The patch has not been applied to a tree or built. Re-patch and rebuild are the first live prerequisite |
| 23 | 38-REVIEW CR-01..CR-03 and WR-01..WR-09 fixes are in the tree | ✓ VERIFIED | Commits `de1dd0e5`, `defbc088`, `4bc15671`/`99005488`, `d573e26a`/`8e12c60f`, `e599d419`, `150bfbbd`, `02887332`, `ac325805`, `541ae2ea`, `37cd1110`, `b839c76e`, `bcea29df` are in the log; each Outcome names a rule and plants, all in the green gates above. Live behavior is UAT 25-30 |
| 24 | The static gates for this phase are green, their plants go red, and `--quick` passes | ✓ VERIFIED | See Behavioral Spot-Checks. `verify-platform.sh --quick`: `verify-platform: PASS -- all checks passed`, exit 0 |
| 25 | The CLAUDE.md hard rules hold: no Theia core edit, no Gecko change outside the patch stack, one boundary file | ✓ VERIFIED | `internals-boundary` and its self-test PASS, `check-patch-surface` PASS (5 patches), `scan-brand-residue` PASS, `apply-patches` self-test in `--quick`. The only Gecko-side change is the regenerated `patches/050-extension-tab-host.patch`; the Theia change is `@powerbrowser/*` extensions only |

**Score:** 10/25 truths verified (14 present but behavior-unverified, 1 uncertain, 0 failed)

### Deferred Items

None. Step 9b: Phase 38 is the last phase of the milestone (`ROADMAP.md` lists 27 -> 38, strictly serial), so no later phase can own an open item. The owner decisions below carry to the owner or to a later milestone by their own words, not by roadmap criteria.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `powerbrowser/shell/PowerBrowserAPI.sys.mjs` | Phase 38 section (from :9660), store arms (:4352), `extensionStoreRequest` (:10095) | ✓ VERIFIED | Substantive and wired; `triggerClickOrPopup(selectedTab)` once |
| `powerbrowser/shell/powerbrowser.js` | stand-in `tabContainer` getter (CR-01) | ✓ VERIFIED | Gate s2 plant red when removed |
| `patches/050-extension-tab-host.patch` | amended: update signal, `active` select, zero-tab create | ⚠️ UNBUILT | Guards PASS; never applied or compiled |
| `powerbrowser/INTERNAL-APIS.md` | rows for every new touchpoint | ✓ VERIFIED | `--catalogue` PASS |
| `powerbrowser/endpoint-allowlist.json` | three AMO allow rows, one deny | ✓ VERIFIED | Consistency gate PASS |
| `theia/.../extensions/extension-actions-widget.tsx` | buttons, puzzle menu, rows, sidebar toggle, install footer | ✓ VERIFIED | 428 lines; imports `ChromeStoreClient` only |
| `theia/.../extensions/extension-popup-anchor.ts` | anchor rect | ✓ VERIFIED | 12 lines |
| `theia/.../extensions/extension-sidebar-view.ts` | side-panel view | ✓ VERIFIED | 117 lines |
| `theia/.../tab-uris/src/browser/chrome-store-client.ts` | extension store methods | ✓ VERIFIED | 6 methods (`extensionActionsSubscribe`, `Click`, `Pin`, `Remove`, `InstallSite`, `Sidebar`, `SidebarGeometry`) |
| `theia/.../tab-uris/src/browser/web-tab.ts` | `extensionAction` subscriber, row validator | ✓ VERIFIED | :322, :606 |
| `scripts/verify-extension-actions.mjs` | 14 rules, 43 plants | ✓ VERIFIED | PASS |
| `scripts/verify-extension-actions-live.mjs` | 9 scenarios, 13 plants | ✓ VERIFIED (static) | `--static` PASS; live half not run |
| `scripts/verify-extension-amo-live.mjs` | `amo-install`, `fixtures`, 2 plants | ✓ VERIFIED (static) | `--static` PASS; live half not run |
| `scripts/verify-webextensions.mjs` | derived AMO host leg | ✓ VERIFIED | PASS, 9 plants |
| `scripts/lib/pb-extension-fixtures.mjs` | 4 temporary-add-on fixtures | ✓ VERIFIED | Every fixture installed by a scenario (rule 1) |
| `scripts/verify-platform.sh` | registry rows | ✓ VERIFIED | `extension-actions`, `-self-test`, `extension-actions-live-static`, `extension-amo-live-static` in `--quick`; `extension-actions-live`, `-self-test`, `extension-amo-live`, `-self-test` in the full set (:5235-5243) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `ExtensionActionsWidget` button | `triggerClickOrPopup(selectedTab)` | `store.extensionClick` -> `handleStoreRequest` arm (:4352) -> `extensionStoreRequest` -> `extensionClick` | ✓ WIRED | Single sanctioned call; privileged fence |
| `extensionAction` push | buttons render | `web-tab.ts onPush('extensionAction')` -> `onDidChangeExtensionActions` -> `render()` | ✓ WIRED | Malformed rows dropped |
| patch 050 `TabHostActionUpdate` | `pushExtensionActions` | `EXTENSION_TAB_EVENTS` on the host strip (`gBrowser.tabContainer`) | ⚠️ WIRED (unbuilt) | Rule 7 derives the event from the patch; stand-in getter present |
| `tabs.create` | Theia overlay | `tabsBridgeCreate` -> `createPendingOverlay` -> `adoptTab` push -> ack -> `adoptPendingOverlay` | ⚠️ WIRED (unrun) | Statically sound; `tabs-bridge` is the first run |
| `contextMenus` entry | page menu | Phase 35 `extension-entry` row and dispatcher arm | ⚠️ WIRED (unrun) | No new relay (derived) |
| sidebar row | side-panel view | `extensionSidebar` kind -> `extensionSidebarOpen`; view rect -> `extensionSidebarGeometry` | ⚠️ WIRED (unrun) | Panel browser is chrome-privileged, rect clamped to the Theia frame |
| tab page | stock window | `extensionOpenTabPage` -> `getMostRecentWindow` / `canAccessWindow` filter | ⚠️ WIRED (unrun) | Never an overlay |
| shortcut | page focus | per-window keyset + capture `command` listener | ⚠️ WIRED (unrun) | `installExtensionReceivers` called once (rule 13) |
| install footer | add-ons site | `extensionInstallSite` -> `openStockTab(https url)` | ✓ WIRED | The prompt itself is stock and unrun |
| AMO hosts | ROADMAP.md / REQUIREMENTS.md | `allowlist-doc-consistency` | ✓ WIRED | Gate PASS |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| Toolbar buttons | `extensionActions` | `pushExtensionActions` re-reads each extension's action API (`extensionActionRow`) | Yes by construction; no live extension | ✓ FLOWING (static) |
| Badge and icon | `badgeText`, `icon` | action API through `TabHostActionUpdate`; icons as `data:image/` only | Yes by construction; the signal exists only in the amended, unbuilt 050 | ⚠️ STATIC until the rebuild |
| Page-action icon | `pageActionShown` rows | `pageActionFor(extension).isShownForTab(selectedTab)` | Yes by construction | ✓ FLOWING (static) |
| Sidebar view | rect | Theia view geometry -> `extensionSidebarGeometry` | Yes by construction | ✓ FLOWING (static) |
| Puzzle footer | add-ons URL | upstream pref `extensions.getAddons.link.url` | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

Run from `/home/chris/gsd-workspaces/p38/Power-Browser`; none starts a browser.

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Extension bridge gate | `node scripts/verify-extension-actions.mjs` and `--self-test` | exit 0; 99 sources, 4 fixtures derived; 43 plants red | ✓ PASS |
| Live harness, offline half | `node scripts/verify-extension-actions-live.mjs --static` and `--self-test` | exit 0; 13 plants each target a scenario, name an emitted failure | ✓ PASS |
| AMO live harness, offline half | `node scripts/verify-extension-amo-live.mjs --static` and `--self-test` | exit 0; 2 plants audited, no hand-kept id | ✓ PASS |
| AMO host consistency | `node scripts/verify-webextensions.mjs` and `--self-test` | exit 0; 9 plants red | ✓ PASS |
| Web tab bridge | `node scripts/verify-web-tab-bridge.mjs` and `--self-test` | exit 0; 35 kinds; 67 plants red | ✓ PASS |
| gBrowser stand-in | `node scripts/verify-shell-gbrowser-standin.mjs` and `--self-test` | exit 0; plants red naming drift | ✓ PASS |
| Patch 050 guards | `node scripts/verify-ext-tab-host-patch-guards.mjs` and `--self-test` | exit 0; 45 plants red | ✓ PASS |
| Shell error copy | `node scripts/verify-shell-error-copy.mjs` and `--self-test` | exit 0; 15 plants red | ✓ PASS |
| Full static suite | `nix develop .#theia --command scripts/verify-platform.sh --quick` | exit 0; `verify-platform: PASS -- all checks passed`; 340 PASS lines, no check failed. The `FAIL` strings in the log are plants going red | ✓ PASS |
| Any live scenario | not run, per ruling | n/a | ? SKIP |
| `git -C upstream diff` | not meaningful here | `upstream` is an untracked symlink to the main checkout and was not touched | ? SKIP |

### Probe Execution

No `scripts/*/tests/probe-*.sh` is declared by any Phase 38 plan. The live scenarios are the probes and are listed in 38-UAT.md.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| EXT-06 | 38-01, 38-02, 38-04 | Extension toolbar buttons and a puzzle menu with icon, badge, Pin to Toolbar, Manage and Remove | ? NEEDS HUMAN | Truths 2, 22. Static wiring complete; `buttons`, `manage` unrun |
| EXT-07 | 38-01, 38-02, 38-04 | A click opens the popup or runs the action on the active web tab | ? NEEDS HUMAN | Truths 3, 11, 12. `popup-action`, `tabs-bridge` unrun |
| EXT-08 | 38-03, 38-04 | Content scripts, page actions and context-menu entries work in web tabs | ? NEEDS HUMAN | Truths 4, 5, 6. `content`, `page-action`, `extension-entry` unrun |
| EXT-09 | 38-05 | Install from addons.mozilla.org with the stock install prompt | ? NEEDS HUMAN | Truth 7. `amo-install` unrun; web-tab route is an owner decision |
| EXT-10 | 38-05 | An ad blocker, a password manager and a dark-mode extension are checked working live in web tabs | ? NEEDS HUMAN | Truths 8, 9, 10. `fixtures` unrun; password-manager fill needs an owner decision |

All five requirement IDs appear in a plan's `requirements` field (38-01: EXT-06, EXT-07; 38-02: EXT-06, EXT-07; 38-03: EXT-08; 38-04: EXT-06, EXT-07, EXT-08; 38-05: EXT-09, EXT-10). No orphans: REQUIREMENTS.md maps EXT-06..EXT-10 to Phase 38 and nothing else. REQUIREMENTS.md still lists all five as Pending, and ROADMAP.md still shows Phase 38 as "0/TBD Not started" with unchecked plan boxes, which is correct until the live pass and is bookkeeping for the orchestrator.

### Prohibitions

| Plan | Prohibition | Tier | Disposition |
|------|-------------|------|-------------|
| 38-01 | No tab identity derived here; `getTabForBrowser` never re-implemented (D-05) | judgment | grep of the Phase 38 section (:9660 on) finds no `getTabForBrowser`; identity is `tabHosts.get(win)`. Non-authoritative pass, flagged |
| 38-01 | No command id, keybinding row or second caller for a state-changing extension kind | backstop | Fence gate and WR-08 plants cover callers; no command id exists. A held-out test is the plants themselves. Flagged for human |
| 38-02 | No popup in Theia DOM, no CustomizableUI (D-02) | backstop | Rule 8 and the live `popup-native-blocked` plant; no `CustomizableUI` in the section. Static pass, live plant unrun. Flagged |
| 38-02 | No privileged kind except from button and menu event handlers | backstop | Rule and plants as above. Flagged |
| 38-03 | No actor plumbing, `messagemanagergroup` bits or second identity path (D-05) | judgment | The gate states "messagemanagergroup only at th..." (the existing site) and finds no new plumbing. Non-authoritative pass, flagged |
| 38-03 | No absence assertion without a positive control | judgment | The `content` scenario reads a log for the startup rejection with a positive control; the control proves the reader, not the reporting path (SUMMARY live risk). Flagged |
| 38-04 | Patch 050's shell `sidebarAction` skips stay intact | backstop | Guards G1-G11 PASS; no change to those hunks. Flagged until `sidebar` runs |
| 38-04 | No `moz-extension://` URL loaded in a web tab | backstop | Rule 12; live plant `tabpage-in-overlay` unrun. Flagged |
| 38-05 | No authored install dialog or second prompt (D-04) | judgment | No prompt furniture added; the shell cannot show the prompt (no `gUnifiedExtensions`), so the install runs from the stock window. Non-authoritative pass, flagged |
| 38-05 | No hand-kept fixture id or version in any check (Pitfall 7) | backstop | `verify-extension-amo-live --static` plants a hand-kept id and goes red; rule 1 of `verify-extension-actions` does the same for the temporary fixtures. Static pass |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (Phase 38 files) | n/a | `TBD`, `FIXME`, `XXX`, `TODO`, `HACK`, `PLACEHOLDER` on added lines | none | `git diff ead9bf16..HEAD` over all non-planning files finds none |
| PowerBrowserAPI.sys.mjs | 9680, 9759 | Icon cache never evicts (38-REVIEW IN-01, unfixed) | ℹ️ Info | Memory growth with an animating icon |
| PowerBrowserAPI.sys.mjs | 10083-10107 | `tabs.create` ignores `pinned`, `discarded`, `title`, `index` (IN-02) | ℹ️ Info | Differs from Firefox silently |
| PowerBrowserAPI.sys.mjs | 10393 | `extensionShortcutOf` dereferences a possibly stopped extension (IN-03) | ℹ️ Info | A whole push is logged as a read failure |
| PowerBrowserAPI.sys.mjs | 10169-10188 | A sidebar page's `window.close()` throws and the sidebar stays open (IN-04) | ⚠️ Warning | Hide Sidebar still works |
| PowerBrowserAPI.sys.mjs, extension-actions-widget.tsx | 10407, 401 | Install-site failure shows the "restart" copy; https check accepts any host (IN-05) | ⚠️ Warning | Wrong next step for a bad pref |
| endpoint-allowlist.json | 128 | AMO listing page's own assets not probed (IN-06) | ℹ️ Info | Possible fourth host on a live visit |
| PowerBrowserAPI.sys.mjs | 9944 | A popup created before any subscribe leaks its panel (IN-07) | ℹ️ Info | Rare ordering |
| PowerBrowserAPI.sys.mjs | 9676, 10030 | Pinned-ids pref never pruned (IN-08) | ℹ️ Info | A reinstall shows the button pinned again |

### Human Verification Required

38-UAT.md holds 40 items. In order: the prerequisites (re-patch 050, rebuild, stamp, Theia build) are in its header; the 11 live scenarios and 2 live self-tests (1-13); the neighbour suites, visual and manual checks (14-24); the review-fix checks with no live row (25-30); the EXT-10 password-manager decision (31); owner decisions (32-40).

### Gaps Summary

**No gaps.** Nothing the static tree shows missing or wrong against ROADMAP's five criteria or the five plans' must-haves. The status is `human_needed` because 14 truths are present and wired but unexercised (the amended patch 050 has never been built, and no scenario has run) and one (the password-manager fill) is blocked on an owner decision rather than on code.

Owner decisions recorded and not taken. None is counted as a gap:

- **EXT-10 password-manager fill under D-09.** Bitwarden needs a vault account; D-09 forbids an account and a committed secret. (a) throwaway account with runtime-supplied credentials and allowlisted vault hosts (adds egress), (b) a local Vaultwarden on 127.0.0.1 (recommended: no egress, no committed secret), (c) accept the offer-only proof and leave the fill to the manual backstop. Until chosen, EXT-10 stays incomplete as written.
- **Page-action icon placement.** The icon sits in the pill's leading slot and shifts the address-bar text. Keep the shift, or move it to the trailing slot beside the star as Firefox does.
- **AMO install from a web tab does not prompt.** The stock prompt code throws on the missing `gUnifiedExtensions` and the install waits on a prompt that never resolves. The stock window route (install footer) is supported. Bringing the prompt host into the shell is deferred to the bridge milestone by recommendation.
- **`tabs.create` of an extension page with no started stock window** opens the page and then rejects (WR-06 remainder). Needs a wait on the new window's delayed startup to return a tab.
- **Extension-initiated `sidebarAction.open/close/toggle` and `browserAction/pageAction.openPopup()`** still reach upstream and do nothing in the shell. Routing them needs a patch 050 hand-off.
- **CR-02: container tabs are refused, not honoured.** `tabs.create({cookieStoreId})` with a non-default container throws a refusal.
- **`getTabSharingState` on the tab host still reports no sharing.** It is the Phase 37 verifier's carry-over (37-UAT 36). Phase 38 did not change it: `git diff ead9bf16..HEAD` shows the line only as hunk context, and it still returns `{camera: undefined, microphone: undefined, screen: undefined}` (PowerBrowserAPI.sys.mjs:6681). Phase 38's roadmap criteria do not name it, so it is not a Phase 38 gap. An extension reading tab sharing state sees none, and the owner decides whether a follow-up owns it.
- **The Info findings IN-01..IN-08** above, left unfixed by the review, and the **principal mismatch** for extensions allowed in private windows (38-04 follow-up: the triggering principal carries the shell window's private id, which may differ from the stock window chosen).
- **The install footer shows only in the empty state.** With any extension installed the route to the site is Manage Extension, then the Add-ons Manager's "Find more add-ons".

Items to carry into the live pass because their coverage is thin: CR-02 has no live row (needs a fixture with the `cookies` permission and containers enabled), WR-05 (frontend reload with a popup and sidebar open) and WR-06's switch-to-open-tab have no scenario, and the private-browsing behavior has only a manual script.

---

_Verified: 2026-11-01_
_Verifier: Claude (gsd-verifier)_
