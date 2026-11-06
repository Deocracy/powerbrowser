---
status: partial
phase: 38-webextensions
source: [38-VERIFICATION.md, 38-REVIEW.md, 38-01-SUMMARY.md, 38-02-SUMMARY.md, 38-03-SUMMARY.md, 38-04-SUMMARY.md, 38-05-SUMMARY.md, 38-CONTEXT.md, 38-VALIDATION.md]
started: 2026-11-01T00:00:00Z
updated: 2026-11-06T14:54:18.000Z
---

Deferred to the one end-of-milestone pass covering Phases 32-38 (Chris, 2026-10-31). Nothing in this file has been run: the Phase 38 worktree has no objdir, and live runs are forbidden there.

## Prerequisites (before item 1)

Patch 050 was amended in this phase (38-01, then again in 38-03) and has never been applied to a tree or built. Main's `upstream/` still carries the earlier patch. Every live item below needs this first. Run from `/home/chris/coding/Power-Browser` (the main checkout), not the p38 worktree.

1. Re-patch `upstream/` with the amended 050: `cd /home/chris/coding/Power-Browser/upstream && git checkout HEAD -- $(grep '^+++ b/' ../patches/050-extension-tab-host.patch | sed 's#^+++ b/##') && git apply --3way ../patches/050-extension-tab-host.patch`. Merge `workspace/p38` into main first so `patches/050-extension-tab-host.patch` is the amended one.
2. Rebuild Gecko: `cd /home/chris/coding/Power-Browser && nix develop .#firefox --command bash -c 'cd upstream && MOZCONFIG=../.mozconfig ./mach build'` (about 47-54 minutes).
3. Stamp the build: `cd /home/chris/coding/Power-Browser && sha256sum patches/050-extension-tab-host.patch > objdir/.pb-050-build.sha256`.
4. Build Theia: `cd /home/chris/coding/Power-Browser && nix develop .#theia --command bash -c 'cd theia && yarn build'`.
5. Static baseline: `cd /home/chris/coding/Power-Browser && nix develop .#theia --command scripts/verify-platform.sh --quick` must be green first.

Run the binary with `-purgecaches` after any change to `powerbrowser/shell/*.js` or `*.sys.mjs`. Spectacle and the KWin raise script need the session DBus, so run the visual items with the sandbox off. The scenarios are `node scripts/verify-extension-actions-live.mjs --scenario <name>` and `node scripts/verify-extension-amo-live.mjs --scenario <name>`. Items 11 and 12 and 24 need network access to addons.mozilla.org.

Items 1-13 are the live scenarios and the live self-tests. Items 14-17 are the neighbour suites 38-05 names as the phase-close regression set. Items 18-24 are visual and manual checks. Items 25-30 are the review fixes that have no live row. Item 31 is the EXT-10 password-manager decision. Items 32-40 are owner decisions. Items 41-45 are the plan 38-06 gap closure (UF-31.1-01, UF-31.1-02); they need the full-stack build and both stamps (`objdir/.pb-050-build.sha256`, `objdir/.pb-060-build.sha256`, see `.planning/v1.5-LIVE-PASS.md` "## Build"). 45 items in all.

## Current Test

[testing complete]

## Tests

### 1. Scenario `buttons`
command: `cd /home/chris/coding/Power-Browser && node scripts/verify-extension-actions-live.mjs --scenario buttons`
expected: With the `action` and `popup` fixtures installed, the pinned ones render as 28x28 buttons in the chrome-bar row and the rest in the puzzle menu; the set equals the installed set in both directions; `setBadgeText` and `setIcon` reach the button through the amended 050 signal (`TabHostActionUpdate`). Plant `buttons-stale` goes red naming the stale badge
result: pass
evidence: "v1.5 end-of-milestone live pass 2026-11-04, main: buttons PASS"

### 2. Scenario `popup-action`
command: `cd /home/chris/coding/Power-Browser && node scripts/verify-extension-actions-live.mjs --scenario popup-action`
expected: A real click on a button with a popup opens it in chrome's native panel at the button; a click on an action-only button runs it on the host's selected web tab, never on the stock tab; the badge `ok` is pushed; the four closes (Esc, second click, focus into the page, tab switch) each close the panel and leave focus where the scenario expects (pill for Esc and second click; not the pill for page focus and tab switch, 38-REVIEW WR-02). This is the first run of the click path on a real build (CR-01). Plants `wrong-page` and `popup-native-blocked` go red. Watch: whether `pressKey` Escape reaches the popup browser, and whether the outside-click rollup consumes the second click
result: pass
evidence: "v1.5 end-of-milestone live pass 2026-11-04, main: popup-action PASS"

### 3. Scenario `manage`
command: `cd /home/chris/coding/Power-Browser && node scripts/verify-extension-actions-live.mjs --scenario manage`
expected: Pin to Toolbar moves a row to the button row and the pref `powerbrowser.extensions.pinned` holds it across a relaunch; Manage Extension opens the Add-ons Manager by enum; Remove Extension asks first and uninstalls only after the confirm row; the confirm copy reads that the extension and its data are removed. Plant `pin-lost` goes red naming the lost pin. Watch: whether Lumino's mouseup activation works for the gear-menu rows
result: pass
evidence: "v1.5 end-of-milestone live pass 2026-11-04, main: manage PASS"

### 4. Scenario `tabs-bridge`
command: `cd /home/chris/coding/Power-Browser && node scripts/verify-extension-actions-live.mjs --scenario tabs-bridge`
expected: `tabs.create` mints an overlay that Theia adopts (no orphan overlay); `tabs.update(id, {active: true})` selects a tab through the amended 050; `tabs.remove` resolves only after the node and overlay are gone (WR-03); the `/d` step (`create-activate`) ends with `/d` both current in the frontend and `host.selected` (CR-03); non-http(s) targets are refused; the extension-page step opens a new stock window. Plant `create-unadopted` goes red naming the orphan overlay
result: pass
evidence: "v1.5 end-of-milestone live pass 2026-11-04, main: tabs-bridge PASS (gBrowser documentGlobal product fix in 1642f2d7)"

### 5. Scenario `content`
command: `cd /home/chris/coding/Power-Browser && node scripts/verify-extension-actions-live.mjs --scenario content`
expected: The content fixture installs as an unsigned XPI (profile scope) and survives a relaunch; the hello from `/a` carries a real `sender.tab` id; `tabs.sendMessage(tabId)` reaches the page; a zero-overlay startup throws no `tab is null`. Plant `sender-tab-null` and `pageaction-zero-tab` go red. Watch: whether `getInstallForFile` is refused for signing, and whether the console reports an async startup rejection with the `tab is null` text
result: pass
evidence: "v1.5 end-of-milestone live pass 2026-11-04, main: content PASS with the startup product fix (1642f2d7: extensions-late-startup resolves browserStartupPromise) and the onStartup fixture (4bdc5751). An event page woken by an event still waits for a stock window (deferred below)"
live: "39-04 2026-11-06, main 735dc25b: event-page-wake PASS with no runtime.onStartup listener and zero stock windows; policies-shell-only PASS; plants startup-promises-rearmed and policy-default-prerecorded red"

### 6. Scenario `page-action`
command: `cd /home/chris/coding/Power-Browser && node scripts/verify-extension-actions-live.mjs --scenario page-action`
expected: A page action with `show_matches` shows on the matching 127.0.0.1 page only, is hidden on other pages and on the first-tab case, its icon appears in the address pill, and a click runs the action on that tab. Plant `pageaction-pill-stale` goes red naming the stale icon
result: pass
evidence: "v1.5 end-of-milestone live pass 2026-11-04, main: page-action PASS"

### 7. Scenario `sidebar`
command: `cd /home/chris/coding/Power-Browser && node scripts/verify-extension-actions-live.mjs --scenario sidebar`
expected: Show Sidebar in the gear menu opens the extension's sidebar page as a view in Theia's right side panel; the chrome panel browser follows the view's rect; Hide Sidebar closes it; `_execute_sidebar_action` toggles it while a page has focus; nothing opens in the shell window itself. Plants `sidebar-in-shell` and `sidebar-as-tab` go red. Watch: whether the `load` capture listener fires for the webext-panels document, and whether `contentTitle` reports the page title
result: pass
evidence: "v1.5 end-of-milestone live pass 2026-11-04, main: sidebar PASS"

### 8. Scenario `tab-pages`
command: `cd /home/chris/coding/Power-Browser && node scripts/verify-extension-actions-live.mjs --scenario tab-pages`
expected: `runtime.openOptionsPage` (`open_in_tab`) and `tabs.create` of the dashboard page open in the stock browser window; a second `openOptionsPage` switches to the open tab instead of adding one (WR-06); a web tab given the same `moz-extension://` URL refuses it. Plant `tabpage-in-overlay` goes red
result: pass
evidence: "v1.5 end-of-milestone live pass 2026-11-04, main: tab-pages PASS"

### 9. Scenario `commands`
command: `cd /home/chris/coding/Power-Browser && node scripts/verify-extension-actions-live.mjs --scenario commands`
expected: The `pb-probe` command (Alt+Shift+U) and `_execute_sidebar_action` (Alt+Shift+I) fire with web page `/a` focused and do not fire with the IDE focused, where the Theia-frame keydown recorder proves the key reached Theia. Plants `commands-always-fire` and `commands-never-fire` go red. Watch: whether GlobalKeyListener honours `disabled` toggled on an `ExtensionShortcuts` keyset, and whether the capture `command` listener runs before the key's own listener
result: pass
evidence: "v1.5 end-of-milestone live pass 2026-11-04, main: commands PASS"

### 10. `node scripts/verify-extension-actions-live.mjs --self-test --live`
command: `cd /home/chris/coding/Power-Browser && node scripts/verify-extension-actions-live.mjs --self-test --live`
expected: A clean control session per scenario is green, then all 13 plants each go red naming their drift (`wrong-page`, `popup-native-blocked`, `create-unadopted`, `buttons-stale`, `pin-lost`, `sender-tab-null`, `pageaction-zero-tab`, `pageaction-pill-stale`, `sidebar-in-shell`, `sidebar-as-tab`, `tabpage-in-overlay`, `commands-always-fire`, `commands-never-fire`). The static half already passes (`--static` and the default `--self-test`)
result: pass
evidence: "v1.5 end-of-milestone live pass 2026-11-04, main: verify-extension-actions-live --self-test --live PASS: every control green and all 13 plants red naming their drift, buttons-stale included after its plant fix (4bdc5751)"

### 11. Scenario `amo-install`
command: `cd /home/chris/coding/Power-Browser && node scripts/verify-extension-amo-live.mjs --scenario amo-install`
expected: With web tab `/a` on screen and no extension installed, the puzzle menu's install footer opens the add-ons site in the stock browser window, never in a web tab. The smallest D-07 listing installs through `AddonManager.installAddonFromWebpage`; the stock `addon-webext-permissions` prompt opens in the stock window naming the add-on, the scenario presses its Add button, the add-on installs signed and active, its row reaches the puzzle menu under its installed name and its popup opens on `/a`. Plant `prompt-bypassed` goes red naming the prompt. Watch: whether the site serves its bot challenge page to the harness
result: pass
evidence: "v1.5 end-of-milestone live pass 2026-11-04, main: amo-install PASS"

### 12. Scenario `fixtures`
command: `cd /home/chris/coding/Power-Browser && node scripts/verify-extension-amo-live.mjs --scenario fixtures`
expected: Before any install the baselines hold (tracker image on `/ad` loads, `/login` form empty, `/plain` light). After the signed installs: uBlock Origin makes the image fail and its pushed badge reads above zero; Bitwarden's popup opens on `/login` (the fill is not scored, see item 31); Dark Reader drops `/plain`'s painted luminance below 0.3. Plant `fixtures-no-op` goes red naming each missing effect. Watch: the blocker may need more than the 60 s retry window to compile its lists on a cold profile, and Dark Reader may skip 127.0.0.1 pages
result: pass
evidence: "v1.5 end-of-milestone live pass 2026-11-04, main: fixtures PASS"

### 13. `node scripts/verify-extension-amo-live.mjs --self-test --live`
command: `cd /home/chris/coding/Power-Browser && node scripts/verify-extension-amo-live.mjs --self-test --live`
expected: A clean control per scenario is green, then `prompt-bypassed` and `fixtures-no-op` each go red naming their drift. The static half already passes (`--static`)
result: pass
evidence: "v1.5 end-of-milestone live pass 2026-11-04, main: verify-extension-amo-live --self-test --live PASS"

### 14. Neighbour suite: navigation keys
command: `cd /home/chris/coding/Power-Browser && node scripts/verify-nav-keys-live.mjs && node scripts/verify-nav-keys-live.mjs --self-test`
expected: Green; the Phase 38 shortcut keyset (item 9) did not take over the Phase 27 page-focus keys
result: pass
evidence: "v1.5 end-of-milestone live pass 2026-11-04, main: verify-nav-keys-live PASS, re-run after the narrowed AB-4 fix (1642f2d7)"

### 15. Neighbour suite: web tab
command: `cd /home/chris/coding/Power-Browser && node scripts/verify-web-tab-live.mjs && node scripts/verify-web-tab-live.mjs --self-test`
expected: Green; the sidebar panel browser, the popup panel and the bridge changes did not alter web-tab geometry or the blocking-layer rules
result: pass
evidence: "v1.5 end-of-milestone live pass 2026-11-04, main: verify-web-tab-live and its --self-test PASS (12 plants red), after the AB-4 product fix stopped marking the overlay initial about:blank (1642f2d7)"

### 16. Menus proof for EXT-08 (cited from 35-05)
command: `cd /home/chris/coding/Power-Browser && node scripts/verify-page-furniture-live.mjs --scenario extension-entry`
expected: A test extension's context-menu entry arrives as an `extension-entry` row after the stock rows; picking it makes its `menus.onClicked` fire with the web tab, and nothing runs in the IDE
result: pass
evidence: "v1.5 end-of-milestone live pass 2026-11-04, main: page-furniture extension-entry PASS"

### 17. SC1 regression: the 31.1 tab host with the amended patch 050
command: `cd /home/chris/coding/Power-Browser && node scripts/verify-ext-tab-host-live.mjs --scenario query,events,active-tab,sender,adversarial-starts,gui01,refused-write`
expected: All green on the amended 050. `refused-write` now checks the highlighted refusal where it used to check `active`. Then run `node scripts/verify-ext-tab-host-live.mjs` (all scenarios) and `node scripts/verify-ext-tab-host-live.mjs --self-test` for the full 31.1 set
result: pass
evidence: "v1.5 end-of-milestone live pass 2026-11-04, main: verify-ext-tab-host-live (all scenarios, refused-write included) and its --self-test PASS (ea7bcec7)"

### 18. Visual: buttons, badge, puzzle menu, popup arrow (KDE Wayland)
command: `cd /home/chris/coding/Power-Browser && objdir/dist/bin/powerbrowser -purgecaches` with an extension that has a popup and a badge installed; raise it with the KWin script via qdbus, then `spectacle`, sandbox off
expected: 28x28 buttons, the badge at the button's corner capped at four characters, the 300px puzzle menu with icon, name, Pin to Toolbar, Manage Extension and Remove Extension rows, and the native panel's arrow under the clicked button; legible in both themes
result: [pending]

### 19. Visual: page-action icon and pill text
command: as item 18, with the `content` fixture installed and a matching page open
expected: The 28x28 page-action icon sits in the pill's leading slot; record whether the pill's text shifts (the owner decision in item 32); the panel arrow sits under the icon
result: [pending]

### 20. Visual: sidebar view placement
command: as item 18, with the `surfaces` fixture, after Show Sidebar
expected: The sidebar page sits exactly over the right side-panel view, hides under an open Theia menu, and follows a splitter drag
result: [pending]

### 21. Manual: a real install click-through
command: `cd /home/chris/coding/Power-Browser && objdir/dist/bin/powerbrowser -purgecaches`, open the puzzle menu's install footer, press the site's own Add to Firefox button in the stock window
expected: The stock install prompt appears, accepting installs the extension, its button appears in the chrome bar and it works in a web tab. This is SC4 by hand
result: [pending]

### 22. Manual: private-browsing access (38-04)
command: |
  1. Fresh profile with `user_pref("browser.privatebrowsing.autostart", true);` in `user.js`. Copy the `surfaces` fixture from `scripts/lib/pb-extension-fixtures.mjs`, add `"incognito": "not_allowed"` and a `browser_action` to its manifest, install it from about:debugging.
  2. `cd /home/chris/coding/Power-Browser && objdir/dist/bin/powerbrowser -purgecaches -profile <that profile>`
  3. Remove `incognito`, reinstall, turn on "Run in Private Windows" in about:addons.
  4. Without autostart, open a private stock window last, then trigger the options page.
expected: Step 2: no puzzle row, no button, no Show Sidebar row; Alt+Shift+I with a page focused does nothing; the options page is refused with "PowerBrowser refused to open that page: this extension is not allowed in private windows." Step 3: the row, the sidebar and the options tab return. Step 4: the options page opens in a non-private stock window, or a new one if none is open
result: [pending]

### 23. Manual: a real keyboard and pointer on the popup
command: as item 18, click a popup button with the mouse, then operate its controls with Tab and Enter, then Esc
expected: The popup takes focus and keys, Esc closes it and returns focus to the address pill, a click on the page closes it and leaves focus in the page
result: [pending]

### 24. IN-06: the add-ons listing page's own hosts
command: `cd /home/chris/coding/Power-Browser && bash scripts/verify-endpoints.sh` after one live visit to the add-ons listing page and one install (read the script's header for the MOZ_LOG layer it needs)
expected: Every host contacted is in `powerbrowser/endpoint-allowlist.json`. A new static-asset or CDN host means a fourth row, which `verify-webextensions` and `allowlist-doc-consistency` must then be extended to name in the same change
result: [pending]

### 25. Review fix CR-02: container tabs are refused
command: Install a fixture with the `cookies` permission and containers enabled (`privacy.userContext.enabled`), then in its background call `browser.tabs.create({url: "http://127.0.0.1:<port>/a", cookieStoreId: "firefox-container-1"})` and `firefox-default`
expected: The container call rejects with "PowerBrowser refused to open that page: container tabs are not supported in this window." and opens nothing; `firefox-default` still opens a tab (`defbc088`; no live row exists)
result: [pending]

### 26. Review fix CR-03: activation waits for the adoption ack
command: Scenario `tabs-bridge` item 4's `/d` step, then by hand: an extension creates a tab in the background and activates it at once
expected: The host selection never lands on a tab the frontend has not shown; `tabs.update` returns the tab with `active: false` until the attach, then `selectTab` is pushed and `/d` becomes current (`4bc15671`)
result: [pending]

### 27. Review fix WR-01: no foreign extension page, no system principal
command: From one extension call `tabs.create({url: <another extension's moz-extension page>})`; then with no stock window open call `tabs.create` of the extension's own page
expected: The foreign page is refused (a URL no extension owns is refused; a started stock window gets `addTab` with the caller's principal); the no-window case opens an empty window, waits for it, then adds the tab with the caller's principal (`d573e26a`)
result: [pending]

### 28. Review fix WR-04: Remove copy
command: Open the puzzle menu, choose Remove Extension on an extension, read the confirm row, confirm, then reinstall it
expected: The confirm reads "The extension and its data are removed from this profile."; after the reinstall its storage is empty, as the copy says (`02887332`)
result: [pending]

### 29. Review fix WR-05: a reloaded frontend takes its popup and sidebar down
command: With an extension popup open and a sidebar view shown, reload the Theia frontend (Ctrl+R in the IDE)
expected: The popup panel closes and the chrome sidebar browser hides; after the frontend re-subscribes, the sidebar view returns with its page, and a frontend that has already re-subscribed is left alone (`ac325805`; no live row, "reload behaviour needs a built binary")
result: [pending]

### 30. Review fix WR-06: `openOptionsPage` switches to the open tab
command: Call `browser.runtime.openOptionsPage()` twice from the `surfaces` fixture, once with a started stock window and once with the stock window still starting
expected: The second call switches to the stock tab already showing the page and adds none; while the stock window is starting it waits for that window instead of opening a second one; no error is reported for a page that opened (`541ae2ea`)
result: [pending]

### 31. Owner decision: EXT-10 password-manager fill under D-09
expected: |
  Decide how the fill is proved. Bitwarden keeps no login without an account on a vault server, and D-09 forbids both an account and a committed secret, so "offers and fills runtime-invented credentials" cannot be proved as written. The `fixtures` scenario proves only that the manager's popup opens on `/login`.
  - (a) A throwaway Bitwarden account, credentials supplied at run time from the environment, its vault hosts allowlisted. Adds egress and a credential story.
  - (b) A local Vaultwarden on 127.0.0.1 with the extension's self-hosted server URL pointed at it. No egress, adds a server to the harness. Recommended.
  - (c) Accept the offer-only proof and leave the fill to the manual backstop.
  Until a decision is made EXT-10 stays incomplete as written.
  Decided 2026-11-01 (Chris): option (b). The fill is tested against a local Vaultwarden server on 127.0.0.1 with a test vault, driven by the Bitwarden extension. D-09's no-vault-account rule stays satisfied: no external account and no committed secret. The `fixtures` scenario needs a Vaultwarden mode added before the live run (.planning/v1.5-LIVE-PASS.md, Phase 38).
result: [pending]
owner: "Chris 2026-11-06 via AskUserQuestion: box 38, Accept all (Recommended). T31: already decided (b), build the Vaultwarden mode (plan 39-14)."

### 32. Owner decision: page-action icon placement
expected: The icon sits in the pill's leading slot and shifts the address-bar text. Keep the shift (recommended by 38-03), move the icon to the trailing slot beside the star as Firefox does, or overlay it. Also decide whether a signed fixture is required now that the AMO route exists
result: pass
evidence: "owner decision 2026-11-06; trailing-slot move listed under Deferred Follow-Ups"
owner: "Chris 2026-11-06 via AskUserQuestion: box 38, Accept all (Recommended). T32: keep the leading slot with pill-text shift; log the trailing-slot move as a backlog row."

### 33. Owner decision: AMO install from a web tab does not prompt
expected: A user who navigates a web tab to the add-ons site and presses its install button gets no prompt (the prompt code throws on the missing `gUnifiedExtensions` and the install waits). The stock window route (the footer) is supported. Decide whether the stock add-on prompt host (`gUnifiedExtensions.getPopupAnchorID`, the `addon-webext-permissions-notification` element, its popupnotification) joins the shell furniture. 38-05 recommends deferring to the bridge milestone
result: pass
evidence: "owner decision 2026-11-06; deferral listed under Deferred Follow-Ups"
owner: "Chris 2026-11-06 via AskUserQuestion: box 38, Accept all (Recommended). T33: defer to the bridge milestone (38-05)."

### 34. Owner decision: `tabs.create` of an extension page with no stock window
expected: It opens a stock window on the page, then rejects with "PowerBrowser opened that page in a new browser window." (38-REVIEW WR-06 remainder). Returning a tab needs a wait on the new window's delayed startup before `tabs.create` resolves. An install-time welcome page usually ignores the result, but an EXT-10 fixture that awaits its welcome tab will see the rejection. Decide whether it must return a tab
result: pass
evidence: "owner decision 2026-11-06"
owner: "Chris 2026-11-06 via AskUserQuestion: box 38, Accept all (Recommended). T34: accept the rejection."

### 35. Owner decision: extension-initiated `sidebarAction.open/close/toggle` and `openPopup()`
expected: Only the B5 surfaces (the gear row and the shortcuts) are routed. Extension code calling `sidebarAction.open()`, `close()`, `toggle()`, or `browserAction.openPopup()` / `pageAction.openPopup()` still reaches upstream and does nothing in the shell. Routing them needs a patch 050 hand-off. Also: `sidebarAction.setPanel()` while open does not reload the open panel. Decide whether to route them
result: pass
evidence: "owner decision 2026-11-06"
owner: "Chris 2026-11-06 via AskUserQuestion: box 38, Accept all (Recommended). T35: accept."

### 36. Owner decision: container tabs are refused rather than honoured (CR-02)
expected: `tabs.create` with a non-default `cookieStoreId` is refused with a clear error. Neither the overlay path nor the stock-window tab page can carry a container, so honouring it is not a small change. Accept the refusal, or schedule container support
result: pass
evidence: "owner decision 2026-11-06"
owner: "Chris 2026-11-06 via AskUserQuestion: box 38, Accept all (Recommended). T36: accept the refusal."

### 37. Owner decision: `getTabSharingState` on the tab host still reports no sharing
expected: Carried from Phase 37 (37-UAT 36). Phase 38 did not change `getTabSharingState` (PowerBrowserAPI.sys.mjs:6681 still returns camera, microphone and screen `undefined`), so an extension reading tab sharing state sees none even while a track is live. Phase 38's roadmap criteria do not name it. Decide whether a follow-up owns it
result: pass
evidence: "owner decision 2026-11-06; one follow-up with 37-UAT test 36"
owner: "Chris 2026-11-06 via AskUserQuestion: box 37, Accept all (Recommended). T36 and 38 T37: one ruling for both, accept as follow-up."

### 38. Owner decision: 38-REVIEW info findings left unfixed
expected: IN-01 icon cache never evicts, IN-02 `tabs.create` ignores `pinned`, `discarded`, `title` and `index`, IN-03 `extensionShortcutOf` dereferences a stopped extension, IN-04 a sidebar page's `window.close()` throws and the sidebar stays open, IN-05 an install-site failure shows the "restart" copy and the https check accepts any host, IN-06 the listing page's assets were never probed (item 24), IN-07 a popup created before any subscribe leaks its panel, IN-08 the pinned-ids pref is never pruned. Accept all eight as follow-ups or schedule any
result: pass
evidence: "owner decision 2026-11-06; IN-01..IN-08 listed under Deferred Follow-Ups"
owner: "Chris 2026-11-06 via AskUserQuestion: box 37, Accept all (Recommended). T41 and 38 T38: accept all info findings as follow-ups."

### 39. Owner decision: principal mismatch for private-window-allowed extensions (38-04 follow-up)
expected: For a `moz-extension:` page, upstream builds the triggering principal with the shell window's `privateBrowsingId`, so `extensionOpenTabPage` may add that tab to a stock window whose private state differs. It can occur only for an extension allowed in private windows and is a load-correctness question, not an access leak. Accept, or rebuild the principal for the chosen window
result: pass
evidence: "owner decision 2026-11-06"
owner: "Chris 2026-11-06 via AskUserQuestion: box 38, Accept all (Recommended). T39: accept."

### 40. Owner decision: the install footer exists only in the empty state
expected: Once any extension is installed the route to the add-ons site is Manage Extension, then the Add-ons Manager's "Find more add-ons". SC4 is met through the footer only on a profile with no extensions. Accept this, or add a persistent route to the site
result: pass
evidence: "owner decision 2026-11-06"
owner: "Chris 2026-11-06 via AskUserQuestion: box 38, Accept all (Recommended). T40: accept."

### 41. Scenario `network-wall` (UF-31.1-02, plan 38-06)
command: `cd /home/chris/coding/Power-Browser && node scripts/verify-ext-tab-host-live.mjs --scenario network-wall`
expected: After the probe (webRequest, webRequestBlocking, cookies, `<all_urls>`) is installed, the Theia frame reloads and chrome scope sees it open at least one channel; the probe records no onBeforeRequest or onBeforeSendHeaders event naming the Theia origin and no Cookie header carrying the token; web tab /a reaches both listeners with its tab id in the same session (positive control); `cookies.getAll({ domain: '127.0.0.1' })` lists the probe's own `pbprobe` cookie and not POWERBROWSER_TOKEN; `cookies.set` of the token on the Theia origin is refused and the stored token is unchanged; `cookies.onChanged` reports `pbprobe` and not the token
result: pass
evidence: "v1.5 end-of-milestone live pass 2026-11-04, main: network-wall PASS"

### 42. Scenario `theia-never` without the known-gap exemption (UF-31.1-02, plan 38-06)
command: `cd /home/chris/coding/Power-Browser && node scripts/verify-ext-tab-host-live.mjs --scenario theia-never`
expected: The reloaded Theia frame opens channels seen in chrome scope (the new positive control, replacing the webRequest record that used to be the control), and no record of any kind names the Theia origin across four web tabs, activation, a navigation and a close; the old allowance for the frame's own tabId -1 webRequest records is gone
result: pass
evidence: "v1.5 end-of-milestone live pass 2026-11-04, main: theia-never PASS"

### 43. Scenario `windows-refusal` (UF-31.1-01, plan 38-06)
command: `cd /home/chris/coding/Power-Browser && node scripts/verify-ext-tab-host-live.mjs --scenario windows-refusal`
expected: On the shell window id from `windows.getCurrent`, `windows.update` with `state: 'minimized'` and with `width` both reject "This window cannot be changed by an extension.", and `windows.remove` rejects "This window cannot be closed by an extension."; the window stays open with its width and state unchanged and WebDriver still reaches the Theia frame; `windows.update({ focused: true })`, `windows.getCurrent` and `tabs.get` still work
result: pass
evidence: "v1.5 end-of-milestone live pass 2026-11-04, main: windows-refusal PASS"

### 44. Plants for items 41-43 and 45
command: `cd /home/chris/coding/Power-Browser && node scripts/verify-ext-tab-host-live.mjs --scenario network-wall,windows-refusal,theia-never,worker-wall --self-test`
expected: Each control is green first; `network-wall-off` (the frame loses `extensionnetworkhidden`) goes red naming "Theia frame visible to network observers"; `windows-guard-off` (the tracker stops treating the shell as a tab host window) goes red naming "not the tab host refusal"; `theia-in-tabs-late` still goes red naming "Theia frame visible to extensions"; `worker-wall-off` (the shell's hidden-origins pref emptied) goes red naming "Theia worker visible to network observers"
result: pass
evidence: "v1.5 end-of-milestone live pass 2026-11-04, main: ext-tab-host --self-test: network-wall-off, windows-guard-off and worker-wall-off each went red naming their drift"

### 45. Scenario `worker-wall` (UF-31.1-02 worker branch, plan 38-06)
command: `cd /home/chris/coding/Power-Browser && node scripts/verify-ext-tab-host-live.mjs --scenario worker-wall`
expected: A harness page `/sw` registers `/pb-probe-sw.js`, and the probe records that script load with tab id -1 (positive control: a browserless load reaches the recorder). The Theia frame then registers the same path on the sidecar origin; chrome scope sees that load, and the probe records nothing naming the Theia origin. Theia's own webview service worker would sit on `{{uuid}}.webview.127.0.0.1:<port>`, which does not resolve on this host, so the scenario uses a worker on the sidecar origin, which takes the same browserless branch. If the positive control reports a tab id other than -1, the scenario does not exercise the worker branch; record that as a finding
result: pass
evidence: "v1.5 end-of-milestone live pass 2026-11-04, main: worker-wall PASS"

### 46. Scenario `webview-render` (webview origins on localhost, plan 38-07)
command: `cd /home/chris/coding/Power-Browser && node scripts/verify-ext-tab-host-live.mjs --scenario webview-render`
expected: A plugin-webview widget opened from the Theia frame has its endpoint on `http://<uuid>.webview.localhost:<port>/webview` (the sidecar's port), and its script posts back the text "PB webview probe rendered" with that origin within 30 s, so the frame and the content load past the token gate. Chrome scope sees the webview's `/webview/service-worker.js` load at least once without a browsing context (positive control), and the probe records no request naming the webview origin. Since 38-07 Theia's own webview worker resolves, so item 45's note that it does not is superseded. The Theia frame reaching 'ready' at all is the evidence that its own WebSocket upgrade still carries the token cookie past the new WebSocket validator. The unauthenticated side is the backend checks `scripts/verify-platform.sh --only side02-index-gated` (the webview host gets `/webview/index.html` with no Set-Cookie and nothing else) and `--only side02-ws-token` (an RPC handshake without the token cookie is refused); both passed on 2026-11-01
result: pass
evidence: "v1.5 end-of-milestone live pass 2026-11-04, main: webview-render PASS (eth-2 harness fix ea7bcec7)"

### 47. Plant for item 46
command: `cd /home/chris/coding/Power-Browser && node scripts/verify-ext-tab-host-live.mjs --scenario webview-render --self-test`
expected: The control is green first; `webview-wall-off` (the shell's hidden-origins pref loses its `*.webview.localhost` entry) goes red naming "Theia webview visible to network observers"
result: pass
evidence: "v1.5 end-of-milestone live pass 2026-11-04, main: webview-wall-off went red naming 'Theia webview visible to network observers'"

## Summary

total: 47
passed: 33
issues: 0
pending: 14
skipped: 0
blocked: 0

## Gaps

[none yet]

## Deferred Follow-Ups

```yaml
- test: 5
  idea: "ext-event-page-wake: browserPaintedPromise resolves only on browser-delayed-startup-finished, which only a stock window sends, so an event page woken by an event never runs with no stock window open. The candidate fix edits upstream ExtensionParent.sys.mjs and must land as a regenerated patch 050"
  deferred_at: 2026-11-04
- test: none
  idea: "enterprise policies (for example SearchEngines Default) are applied only when the first stock window fires sessionstore-windows-restored (EnterprisePoliciesParent.sys.mjs:368-369); a shell-only session never applies them. Same root cause as the event-page wake"
  deferred_at: 2026-11-04
- test: 32
  idea: "move the page-action icon to the trailing slot beside the star as Firefox does; owner kept the leading slot with the pill-text shift on 2026-11-06 and asked for a backlog row (source: 38-UAT test 32)"
  deferred_at: 2026-11-06
- test: 32
  idea: "row 32's second question, whether a signed fixture is required now that the AMO route exists, was not in the 2026-11-06 box; it still needs an owner answer (source: 38-UAT test 32)"
  deferred_at: 2026-11-06
- test: 33
  idea: "AMO install from a web tab gives no prompt (the stock add-on prompt host is not shell furniture); deferred to the bridge milestone, owner 2026-11-06 (source: 38-UAT test 33)"
  deferred_at: 2026-11-06
- test: 37
  idea: "getTabSharingState reports no sharing; same follow-up as 37-UAT test 36, one backlog row for both (source: 38-UAT test 37)"
  deferred_at: 2026-11-06
- test: 38
  idea: "38-REVIEW info findings IN-01..IN-08 (icon cache never evicts; tabs.create ignores pinned, discarded, title, index; extensionShortcutOf dereferences a stopped extension; sidebar window.close() throws; install-site failure copy and https host check; listing assets never probed; popup created before subscribe leaks its panel; pinned-ids pref never pruned); accepted as follow-ups 2026-11-06 (source: 38-UAT test 38)"
  deferred_at: 2026-11-06
```
