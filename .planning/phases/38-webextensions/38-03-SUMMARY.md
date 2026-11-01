---
phase: 38-webextensions
plan: "03"
subsystem: chrome-bar
tags: [webextensions, content-scripts, page-action, context-menus, patch-050, static-gate, live-harness]
status: complete
live_proof: deferred
requires:
  - phase: 38-webextensions plan 02
    provides: ExtensionActionsWidget.run(row, anchor), the native popup panel, ExtensionActionRow + extensionActionRowsOf
  - phase: 38-webextensions plan 01
    provides: the extensionAction push, the extensionClick store kind, the one triggerClickOrPopup(selectedTab), patch 050's TabHostActionUpdate signal
  - phase: 31.1-extension-tab-host
    provides: tab-host identity (sender.tab, tabs.sendMessage routing, webRequest tab ids), patch 050's ext-pageAction.js guards G1/G2 and the TabOpen guard G3
  - phase: 35-shell-furniture-and-page-context-menu
    provides: the contentAreaContextMenu stub, pageMenuExtensionEntries (on-build-contextmenu), the pageContextMenu push and page-context-menu.ts, and the extension-entry live scenario
provides:
  - pageActionShown on ExtensionActionRow, and page-action rows in the extensionAction push (only while shown on the selected tab)
  - extensionClick with pageAction true runs the page action through the same triggerClickOrPopup(selectedTab)
  - the pill page-action icon (ExtensionActionsWidget.renderPageActions, rendered in the address pill's leading slot)
  - patch 050 updateButton skip now signals TabHostActionUpdate (guard G2 requires it)
  - the content fixture (MV3 content script, page_action show_matches, webRequest), installed as an XPI across a relaunch
  - live scenarios content and page-action (3 live plants); verify-extension-actions rules 9 (page action) and 10 (menus relay)
affects:
  - 38-04 (sidebar fields join ExtensionActionRow and its validator; the gear menu is openRowMenu; _execute_page_action and pageAction.openPopup still go through ext-pageAction.js handleClick)
  - 38-05 (the phase-close neighbour regression re-runs the extension-entry scenario this plan cites)
tech-stack:
  added: []
  patterns:
    - a relaunch live session (install with zero overlays, quit, run on the same profile) for startup-path proofs
    - a console-reader positive control (a planted throw of the same text) before an absence assertion
key-files:
  created: []
  modified:
    - powerbrowser/shell/PowerBrowserAPI.sys.mjs
    - powerbrowser/INTERNAL-APIS.md
    - patches/050-extension-tab-host.patch
    - theia/extensions/tab-uris/src/browser/web-tab.ts
    - theia/extensions/tab-uris/src/browser/chrome-store-client.ts
    - theia/extensions/chrome-bar/src/browser/extensions/extension-actions-widget.tsx
    - theia/extensions/chrome-bar/src/browser/address-bar/address-bar.tsx
    - theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx
    - theia/extensions/chrome-bar/src/browser/chrome-bar.css
    - scripts/lib/pb-extension-fixtures.mjs
    - scripts/verify-extension-actions.mjs
    - scripts/verify-extension-actions-live.mjs
    - scripts/verify-ext-tab-host-patch-guards.mjs
key-decisions:
  - "Page actions ride the existing extensionAction push as their own rows, marked pageActionShown, sent only while action.isShownForTab(host.selected) is true. Hidden page actions are absent, so the pill shows exactly what chrome sent. A page-action-only extension never shows up as a toolbar button or puzzle row."
  - "The pill icon reuses ExtensionActionsWidget.run(row, anchor). extensionClick gained an optional pageAction flag that picks pageActionFor over browserActionFor in extensionNamed, so the source still holds one triggerClickOrPopup(selectedTab). Popup tracking is keyed by action object, so an extension with both a browser and a page action presses only the one whose popup is open."
  - "Patch 050's ext-pageAction.js updateButton skip now dispatches TabHostActionUpdate, the same event 38-01 added to updateWindow. Without it, pageAction.show()/hide() and a same-tab navigation would not reach the pill until the next tab event."
  - "The content fixture installs as an XPI (AddonManager.getInstallForFile, unsigned under xpinstall.signatures.required=false, the route verify-webextensions.mjs documents), because the zero-overlay startup case needs the extension to survive a relaunch. A temporary add-on would not."
  - "IN-06 is not fixed. menus.overrideContext only works in extension documents, and overlays hold only http(s) pages (T-31.1-20), so showDefaults:false cannot happen in a web tab. menus.refresh() rebuilding the stub after the push is still a known gap."
patterns-established:
  - "Startup-path live proofs run on a relaunched shell: install with zero overlays, quit, then score on the same profile."
requirements-completed: []
duration: "not measured"
completed: "2026-11-01"
commits: 3
plan_head_before: 0aaf7ec0016cf0e234b274e997f6711e0719c8c6
plan_head_after: 759bfc87aebee6ee25eb460ff250bfe862f2c1e6
actuals:
  tokens: 17984
  tasks: 3
  commits: 3
---

# Phase 38 Plan 03: Content scripts, page actions and context-menu entries in web tabs Summary

**Page actions now have a pill icon. Chrome pushes a page-action row only while `isShownForTab` is true on the 31.1 host's selected tab, and the address pill's leading slot draws exactly those rows. A click runs the page action through the toolbar buttons' path: `run(row, anchor)`, then `extensionClick`, then the one `triggerClickOrPopup(selectedTab)`, then the native panel. Patch 050's page-action skip now signals a re-push on `show()`, `hide()` and navigation. Two relaunch live scenarios are written: `content` covers content scripts, `sender.tab`, `tabs.sendMessage`, webRequest tab ids, `show_matches` and the zero-overlay startup, and `page-action` covers the pill icon. The static gate shows that extension menu entries reach the menu only through the Phase 35 relay. All static gates pass. Every live run is deferred.**

## Status

Every static criterion is met. `nix develop .#theia --command scripts/verify-platform.sh --quick` exited 0 after each task, and on the final HEAD before this SUMMARY. `cd theia && nix develop ..#theia --command yarn build` passed after Task 2, the only task that changed `theia/`. **The live proof is deferred** to the end-of-milestone live pass. There is no objdir, and patch 050 changed again in this plan, so a Gecko rebuild is needed before any live run (see below). EXT-08 is not marked complete because its live truths are unproven.

## Accomplishments

- **Content scripts and messaging (Task 1, tracer).** The new `content` fixture (MV3) has a content script on `http://127.0.0.1/*`, a `page_action` with `show_matches` on the same origin, and a non-blocking `webRequest` observer. The `content` scenario runs on a relaunched shell. The XPI is installed with zero overlays open, the shell quits, and the extension starts at app startup with no web tab. The scenario then checks:
  - (f) the boot has zero host tabs and the IDE has focus. The console reader first sees a planted `tab is null` throw (the positive control). The boot itself shows no such throw, and opening the first overlay while `selectedTab` is null adds none.
  - (a) the content script retitles `/a` and `/b`.
  - (b) each page's hello carries `sender.tab.id` equal to its overlay's id in the extension tab tracker.
  - (c) the background's `tabs.sendMessage(id)` is answered by that page.
  - (d) webRequest reports `/a`'s image request with `/a`'s tab id. The observer sees the request before the tab id is compared.
  - (e) `pageAction.isShown` is true on `/a` and false on the localhost page `/n`.

  The two plants are `sender-tab-null` (the background records each hello's tab as -1) and `pageaction-zero-tab` (upstream's unguarded `show_matches` loop runs at the zero-overlay boot).
- **Patch 050 adversarial review.** The guards from 31.1 already cover the zero-tab cases. G1 is `tab &&` in `onManifestEntry`'s `show_matches` loop (`:171`). G2 is the tab-host skip in `updateButton` (`:200`). G3/G11 null-guard the frame loader for a TabOpen or `tabs.create` with no selected tab. `:113` (`auxclick`) and `:297` (`handleClick`) run only from a PageActions button placed in a tabbrowser window, and none is placed in the shell. Chrome itself calls `isShownForTab` only with a non-null selected tab. No new zero-tab guard was needed. The only patch change is the signal below.
- **Pill page-action icon (Task 2, B2, EXT-08 SC3).** `pushExtensionActions` adds a row for each running page action while `action.isShownForTab(host.selected)` is true. The row has `pageActionShown: true` and `pinned: false`, and its title and icon come from the page action's own context data. `extensionActionRowsOf` requires the field. `ExtensionActionsWidget.renderPageActions()` draws one `.pb-chrome-bar-button.pb-page-action` (28×28, a 16px `<img src>` icon, tooltip and accessible name equal to the pushed title, pressed while its popup is open) for each such row. `AddressBar` renders it first in the pill through a `pageActions` hook that the chrome bar widget sets. The hook exists because `address-bar.tsx` cannot import the widget module, which already imports it. The puzzle menu now leaves out page-action rows. A click calls `run(row, anchor)` with `pageAction: true`. Chrome resolves the extension's page action in `extensionNamed` and runs the same `triggerClickOrPopup(selectedTab)`, and a popup opens in the 38-02 native panel.
- **Patch 050 signal.** The `updateButton` tab-host skip now dispatches `TabHostActionUpdate` on `gBrowser.tabContainer`, the host strip that `EXTENSION_TAB_EVENTS` already listens on. `handleLocationChange` and `show()`/`hide()` both call `updateOnChange`, then `updateButton`, so they now re-push. G2's regexes require the dispatch line, and the new plant `G2 page-action signal dropped` goes red as WEAKENED. The patch was regenerated with the brief's method: a scratch repo of pristine files from `git -C upstream show HEAD:<path>`, the current 050 applied and confirmed byte-identical, then the edit, `git diff --abbrev=10`, and `git apply --check` on a fresh pristine copy. The patch stays at 24 hunks and grows from 387 to 389 lines.
- **Gate rule 9 (page action).** The extension section must read `action.isShownForTab(host.selected)`. `web-tab.ts`'s validator must require `pageActionShown`. `renderPageActions` must filter on `.filter(row => row.pageActionShown)` and read no URL, href, location or pattern. No other chrome-bar source may draw `pb-page-action`. The plant `pill-icon-local-match` filters on `window.location.href` and goes red naming the widget file.
- **Live `page-action` scenario.** It runs on the same relaunch:
  - The subscribe at the zero-overlay boot pushes no page-action row, and the pill draws no icon. This is scored only after the icon reader has seen an icon on `/a`.
  - `/a`'s push carries the row, and the pill shows it with the pushed title.
  - On `/n`, chrome reports the action hidden and the icon goes.
  - Back on `/a`, the icon returns. A real click runs in `/a`: the content script retitles the page to `pb-page-acted /a`, and `onClicked` names `/a`'s tab id.

  The plant `pageaction-pill-stale` freezes the frame's pushes once the icon is drawn, and must go red naming the stale icon.
- **contextMenus through the relay (Task 3, D-05).** I re-checked the Phase 35 contract at build time, and it has landed as planned. `pageMenuExtensionEntries` builds the `on-build-contextmenu` subject with `menu = #contentAreaContextMenu` and `tab = gBrowser.getTabForBrowser(browser)`. It notifies once, then forwards the built items as `extension-entry-<n>` rows. Its only caller is `openPageMenu`, which runs only from the stub's `popupshowing` listener. Gate rule 10 derives that chain from the tree, and requires `page-context-menu.ts` to be the only Theia source that names the `pageContextMenu` push or an `extension-entry` id. The plant `menus-bypass` (a staged IDE menu contribution) goes red naming `ide-extension-menus.ts:1` and `extension-entry`. A second plant adds another notify site. Delta from the plan: the relay forwards ids with the prefix `extension-entry-`, not a literal `extension-entry` kind. Theia treats the ids as opaque, so the consumer rule matches on the push name and the id prefix together. **The EXT-08 menus live proof is Phase 35 plan 35-05's `node scripts/verify-page-furniture-live.mjs --scenario extension-entry`.** This plan cites it and adds no second live run.

## Verification results (this lane)

| Check | Result |
|---|---|
| `node scripts/verify-extension-actions.mjs` (+ `--self-test`) | PASS (97 sources, 3 fixtures; 13 plants red, 3 new: pill-icon-local-match, menus-bypass, second on-build-contextmenu notify) |
| `node scripts/verify-extension-actions-live.mjs --self-test` / `--static` | PASS (8 live plants audited, 3 new: sender-tab-null, pageaction-zero-tab, pageaction-pill-stale; XPI writer round-trip) |
| `node scripts/verify-ext-tab-host-patch-guards.mjs` (+ `--self-test`) | PASS (45 plants, 1 new: G2 page-action signal dropped) |
| `bash scripts/check-patch-surface.sh`, `bash scripts/apply-patches.sh --self-test` | PASS / PASS |
| `node scripts/verify-ext-tab-host-scope.mjs`, `verify-shell-gbrowser-standin.mjs`, `verify-shell-furniture.mjs`, `verify-web-tab-bridge.mjs`, `verify-shell-error-copy.mjs` | PASS |
| `node scripts/verify-ng-040-internals-catalogue-lines.mjs` (normal mode; `--fix` never run) | PASS |
| `bash scripts/check-internals-boundary.sh` / `--catalogue` | PASS / PASS |
| `theia/node_modules/.bin/tsc --noEmit -p theia/extensions/chrome-bar` | PASS |
| `cd theia && nix develop ..#theia --command yarn build` | PASS after Task 2 |
| `nix develop .#theia --command scripts/verify-platform.sh --quick` | PASS after Tasks 1, 2 and 3 |
| `node scripts/verify-extension-actions-live.mjs --scenario content,page-action` / `--self-test --live` | NOT RUN: no built binary (deferred) |

`grep -c "triggerClickOrPopup(selectedTab)" powerbrowser/shell/PowerBrowserAPI.sys.mjs` still prints 1. No `messagemanagergroup` was added (rule 4 still green). No actor plumbing was added.

## Task Commits

1. **Task 1: content scripts, messaging and page-action gating live scenario** — `980bbbf4` (test)
2. **Task 2: page-action pill icon with per-tab show/hide and the toolbar click path** — `33bc3ec4` (feat)
3. **Task 3: extension menu entries reach the menu only through the Phase 35 relay** — `759bfc87` (test)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing functionality] Page-action changes never reached chrome**
- **Found during:** Task 2
- **Issue:** Patch 050's `updateButton` skip returned without telling anyone. `pageAction.show()`/`hide()` and a `show_matches` result changed by navigation would not reach the pill until the next tab event. MV2 page-action extensions usually call `show()` from `tabs.onUpdated`.
- **Fix:** The skip dispatches `TabHostActionUpdate`, the event 38-01 added for `updateWindow`. Patch 050 was regenerated, G2 now requires the line, and a plant was added. Rule 7 of `verify-extension-actions.mjs` already requires `EXTENSION_TAB_EVENTS` to hear every dispatched event, and it still passes.
- **Commit:** `33bc3ec4`

**2. [Rule 1 - Bug] Both rows pressed when one extension has both kinds of action**
- **Found during:** Task 2
- **Issue:** `popupOpen` compared extensions. With a browser action and a page action from one extension, both rows would draw pressed, and a click on either would close the other's popup as "closed".
- **Fix:** `extensionPopups` records the action object, and `popupOpen` and the second-click check compare actions.
- **Commit:** `33bc3ec4`

### Scope and structure deviations

- **The plan's `PowerBrowserAPI` note does not hold.** The plan said this plan edits no file under `powerbrowser/shell/` and no patch. Task 2 needed both: the push field, and the 050 signal. A Gecko rebuild is therefore needed before the live runs.
- **No new copy row.** The plan asked for a `{name}` tooltip row in `CHROME_BAR_COPY`. The toolbar buttons, whose voice the plan says to match, use the pushed title directly with no copy entry. A row that returns its argument unchanged adds nothing, so `chrome-bar-copy.ts`, `EXPECTED_*` and `verify-shell-error-copy.mjs` are unchanged. The copy gate reads `extensions/*.tsx`, and the new TSX carries no literal.
- **Page actions as rows, not a field on toolbar rows.** `pageActionShown` marks a separate row instead of a flag on the browser-action row, because most page-action extensions have no browser action. The plan's "visible only when pushed shown is true" is met by chrome sending the row only while shown.
- **Pill placement.** The icon is the pill's first child. When shown, it takes a 28px flex slot and shifts the pill text. When hidden, the slot is absent with no gap. 38-UI-SPEC says the icon "never shifts pill text (icon overlays the slot padding)", but the 4px pill padding cannot hold a 28px hit area. This needs the deferred visual check below.
- **Fixture route.** The plan asks for a signed XPI. No signing route exists in this execution (AMO is 38-05's work). The content fixture installs as an unsigned XPI through `getInstallForFile`, under `xpinstall.signatures.required=false`, the route `verify-webextensions.mjs` documents, and never as a temporary add-on. The signed-XPI proof is pending 38-05's AMO install route. The fixture is MV3 as planned. `extensions.background.idle.timeout` is raised in the session prefs so the event page is not suspended between the harness's commands.
- **Catalogue `--fix` not run.** The brief forbids it. 12 rows were renumbered by mapping `git diff -U0` hunks, and one modified line (the `browserActionFor` row) was checked by hand. Two rows were appended: `apiManager.global.pageActionFor` and `action.isShownForTab`.
- **Single `extensionActionsById(page)`.** Page actions are read by the same function with a flag, on the line already catalogued for `browserActionFor`, so there is no second loop.

## Deferred to the end-of-milestone live pass

Prerequisites: re-patch main's `upstream/` with the amended 050. This plan changed it again after 38-01. From `/home/chris/coding/Power-Browser`, run `cd upstream && git checkout HEAD -- $(grep '^+++ b/' ../patches/050-extension-tab-host.patch | sed 's#^+++ b/##') && git apply --3way ../patches/050-extension-tab-host.patch`. Then rebuild with `nix develop .#firefox --command bash -c 'cd upstream && MOZCONFIG=../.mozconfig ./mach build'`, stamp with `sha256sum patches/050-extension-tab-host.patch > objdir/.pb-050-build.sha256`, and build Theia with `nix develop .#theia --command bash -c 'cd theia && yarn build'`.

1. `node scripts/verify-extension-actions-live.mjs --scenario content` (needs the unsigned XPI to install in this build; if `getInstallForFile` is refused for signing, that is the signed-XPI route left pending for 38-05)
2. `node scripts/verify-extension-actions-live.mjs --scenario page-action`
3. `node scripts/verify-extension-actions-live.mjs --self-test --live` (a clean control, then sender-tab-null, pageaction-zero-tab and pageaction-pill-stale must each go red naming their text, alongside the 38-01/38-02 plants)
4. The EXT-08 menus live proof (cited, from 35-05): `node scripts/verify-page-furniture-live.mjs --scenario extension-entry`
5. Visual: raise the shell with a KWin script and capture it with spectacle. Check the 28×28 page-action icon in the pill's leading slot, whether the pill text shifts (see Pill placement), and the panel arrow under the icon.

Live risks to watch:
- Whether `Services.console.getMessageArray()` reports an async startup rejection with the `tab is null` text. The positive control proves the reader, not the upstream reporting path.
- Whether the relaunch keeps the XPI enabled (profile-scope install, unsigned).
- Whether the page's `<img>` request reaches webRequest before the scenario reads it. It is polled for 15s.

## Owner decisions

None taken. Two open items are for the owner or the orchestrator. One is the pill placement (shift versus overlay, recommended: keep the shift, or move the icon to the trailing slot beside the star as Firefox does). The other is whether a signed fixture is required once 38-05's AMO route exists.

## For 38-04 (sidebars, extension tab pages, commands shortcuts)

- **Row shape now:** `{extensionId, title, icon, badgeText, enabled, hasPopup, pinned, popupOpen, pageActionShown}`. Any new field (for example a sidebar flag) must go into `ExtensionActionRow` and into `extensionActionRowsOf`'s validator in `web-tab.ts`, or the row is dropped. Toolbar rows have `pageActionShown: false`, and the puzzle menu filters on it.
- **`extensionActionsById(page)`** reads `browserActionFor` or `pageActionFor`. A sidebar reader can follow the same shape (`sidebarActionFor`) or take its own function. Keep the catalogue rows' tokens literally on their lines: ng-040 matches each backticked token as a substring of the line.
- **`extensionClick` data** is `{extensionId, anchorRect, pageAction?}`, and `extensionNamed(data)` picks the action. A new click source should add a flag there instead of a new store kind.
- **Commands shortcuts:** `_execute_page_action` and `pageAction.openPopup()` still reach upstream `ext-pageAction.js` `handleClick(window)`. In the shell that reads `gBrowser.selectedTab` (null with zero overlays, so `isShownForTab(null)` throws for a `show_matches` action), then builds a stock `PanelPopup` (`#mainPopupSet` is absent) and calls `window.BrowserPageActions` (also absent). `_execute_browser_action` has the same shape through the browser action's `triggerAction(window)`. 38-04's commands work should route both to `extensionClick`'s path (or a 050 hunk that hands off to the embedder) instead of letting `triggerAction` run. `verify-extension-actions.mjs` rule 3 fails any product source that spells the stock trigger.
- **Gear menu:** it is `openRowMenu`; the Show/Hide Sidebar row belongs there. Page-action rows have no gear menu.
- **Patch 050 changes** use the brief's scratch-repo method. Each new guard needs a GUARDS row and plants in `verify-ext-tab-host-patch-guards.mjs`. Rule 7 requires `EXTENSION_TAB_EVENTS` to list every event the patch dispatches.
- **Relaunch sessions:** `RELAUNCH_SCENARIOS` and `runRelaunchSession` in the live file run a scenario on a relaunched shell after the content XPI install. Add the scenario name to the set to reuse it. `XPI_FIXTURES` lists the fixtures that install permanently.

## Known Stubs

None. The pill icon renders pushed rows only. The 38-02 install-footer stub (Add-ons Manager until 38-05) is unchanged.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: store-kind-field | powerbrowser/shell/PowerBrowserAPI.sys.mjs | `extensionClick` accepts an optional `pageAction` flag. Only a strict `true` selects the page action. The extension must still be running with that action, and the click runs only on the host's selected tab, through the privileged store kind (D-11). |
| threat_flag: patch-signal | patches/050-extension-tab-host.patch | `updateButton` dispatches `TabHostActionUpdate` on the shell's tab strip. Its only listener re-reads chrome-side state, and the event carries no data. |

## Self-Check: PASSED

- FOUND: scripts/verify-extension-actions-live.mjs (`--scenario content` and `page-action` defined), scripts/lib/pb-extension-fixtures.mjs (content fixture)
- FOUND: commits 980bbbf4, 33bc3ec4, 759bfc87 (ancestors of HEAD)
