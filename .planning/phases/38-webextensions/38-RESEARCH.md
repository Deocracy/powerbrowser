# Phase 38: WebExtensions - Research

**Researched:** 2026-10-22
**Domain:** Firefox WebExtension action/popup/content-script/context-menu/AMO-install
surfaces against chrome-owned overlay `<xul:browser>` web tabs, driven from a
Theia-hosted chrome bar in `powerbrowser.xhtml` (`windowtype powerbrowser:main`)
**Confidence:** HIGH for every pinned-source claim re-read this session (upstream at
`FIREFOX_153_5_0esr_BUILD1`, tree at HEAD); MEDIUM for runtime behaviour — nothing
below was run live (binary in use by another agent). Every runtime claim a plan
depends on is a live probe in the Validation Architecture.

## Summary

Phase 38 is the top of a stack that does not exist yet: it reads tab identity from
the Phase 31.1 tab host, notification furniture from Phase 37, and the context-menu
relay from Phase 35, and renders Firefox's extension toolbar surface in Theia. The
spike record (28-SPIKE-DECISION) already settled the only architectural question:
Theia renders buttons/puzzle and calls `triggerClickOrPopup(selectedTab)`; a native
XUL popup panel hosts popups because CustomizableUI refuses non-`browser.xhtml`
documents; badge/popup state is read chrome-side through the 050 `updateWindow`
skip; `tabs.create/remove/update({active})` go through `addTab`/`removeTab` and a
`selectedTab` setter routed to Theia.

The research below pins down the eight integration seams the plans must implement:
(1) which upstream action modules run against the tab host and what `selectedTab`
shape they need; (2) the popup-host contract; (3) the icon/badge data path; (4) the
content-script/page-action/`contextMenus` path on top of 31.1 + 35; (5) the AMO
install path with the stock `PopupNotification`; (6) the pinned-set/management
model; (7) the `tabs.create/remove/update` bridge; (8) the EXT-10 fixtures and their
distinct live assertions.

**Primary recommendation:** build 38 on the 31.1 host API exactly as signed off —
no new identity plumbing, no CustomizableUI, no DOM popup. Five plans: (38-01)
chrome-side action state + push and the `triggerClickOrPopup`/`addTab` bridge;
(38-02) Theia buttons + puzzle menu + popup anchor contract; (38-03) EXT-08 proof
(content scripts, page actions incl. the pill icon, `contextMenus` relay) and the
management rows; (38-04) the B5-ruling surfaces (sidebar view, tab-opened
pages in the stock window, commands shortcuts) on the same bridge; (38-05) AMO
install + allowlist, the EXT-10 live checks and the phase close.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Signed-off route (a)+(c), no GUI-05; EXT-05..10 stay in v1.5 (Chris 2026-10-21).
- Sub-ruling 1 (Chris): last web tab stays active while the IDE has focus.
- Sub-rulings 2-3 (taken): no `moz-extension://` navigation of overlays; Theia frame
  never in the tracker (derived gate).
- D-74 amended for patch 050 only; getTabForBrowser-null ruling reversed for the host.
- Phase 38 scope consequence: `triggerClickOrPopup(selectedTab)`; native popup host;
  chrome-side badge/popup state; `addTab`/`removeTab` + `selectedTab` setter to Theia;
  AMO hosts into `endpoint-allowlist.json` with doc-consistency in the same change.
- Copy reads the configured app name; stock toolkit popups are shell furniture.
- D-01 buttons in the bar row with puzzle overflow; D-02 native XUL popup panel;
  D-03 push (new `extensionAction` kind) not poll; D-04 stock install prompt;
  D-05 no new actor plumbing for EXT-08; D-06 chrome-first adopt for created tabs;
  D-07 uBlock Origin / Bitwarden / Dark Reader; D-08 Pin/Manage/Remove semantics.

### Claude's Discretion
Check names, plant lists, wave split after 38-01, badge backstop interval, overflow
threshold (3). Popup pixel geometry beyond the UI-SPEC anchor contract.

### Chris's ruling on B5 (2026-10-22, locked — recorded verbatim in 38-CONTEXT.md)
- Sidebars (sidebarAction, which patch 050 turns off for the shell window): show an extension's sidebar page as a view in Theia's left or right side panel. Add a task and a live check to Phase 38.
- Extension pages that open in a tab (options_ui open_in_tab, welcome/onboarding pages, dashboards such as uBlock Origin's and Bitwarden's): open them in the stock browser window. Web tabs still never load moz-extension:// pages (the Phase 28 sub-ruling stands). Add a task and a live check.
- Extension keyboard shortcuts (the commands API): include them. They fire while a web page has focus, matching the 2026-10-20 ruling on Firefox keys; Theia keeps its keys otherwise. Add a task and a live check.

### Deferred Ideas (OUT OF SCOPE)
Tier-1 fallback; GUI-05; `moz-extension://` tab targets; per-site extension
permission UI; extension shortcuts page.
</user_constraints>

<architectural_responsibility_map>
## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Action state (icon/badge/enabled), click/popup dispatch | Shell chrome (`PowerBrowserAPI.sys.mjs`, patch-050 host) | — | Only chrome can call `ExtensionActions`/`tabTracker` on the real tab |
| Popup panel host | Shell XUL (`powerbrowser.xhtml` + furniture installer) | — | DOM cannot draw over overlays; CustomizableUI refuses this document |
| Buttons row, puzzle menu, anchor rect, pinned set | Theia frontend (`@powerbrowser/chrome-bar`) | — | Chrome-bar UI is Theia-rendered by hard rule 3 |
| Content scripts / page actions / `contextMenus` entries | Upstream actors (already running) + 31.1 host + 35 relay | Theia menu contribution | Identity was the missing piece; relay carries entries |
| AMO fetch + install prompt | Upstream `AddonManager` + Phase 37 `PopupNotifications` host | Allowlist (policy) | Stock mechanism; allowlist is the deliberate-egress gate |
| `tabs.create/remove/update` | Chrome-first overlay lifecycle, Theia adopts | — | Same adoption shape as Phase 36 (no ownerless overlays) |
</architectural_responsibility_map>

<standard_stack>
## Standard Stack

### Core (pinned, no version moves)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Gecko / Firefox ESR | `FIREFOX_153_5_0esr_BUILD1` (153.5.0) | Every extension capability below | Pinned and built in v1.4; all paths re-checked at this tag |
| Eclipse Theia | 1.76.0 (`@theia/core` menus, preferences editor, ReactWidget) | Buttons, puzzle menu, anchor rect, pinned set | Already composed; no new npm dependency |
| `PowerBrowserAPI.sys.mjs` end-of-file section | in tree | The only route to Firefox internals (rules 2/D-96) | Append-only catalogue rule; `--fix` renumbers rows |
| Phase 31.1 tab host (planned) | — | `selectedTab`/`selectedBrowser`, `getTabForBrowser`, `browserWindows()`, TabOpen/Select/Close/AttrModified fan-out | Signed-off route; Phase 38 reads identity, never derives it |
| Phase 37 `PopupNotifications` host (planned) | — | AMO install prompt, auth/dialog fallback | Stock strings; rule-5 furniture |
| Phase 35 `contentAreaContextMenu` relay (planned) | — | Carries extension `contextMenus` entries | One relay for page + extension items |

### Supporting

| Library | Version | When to Use |
|---------|---------|-------------|
| `ExtensionActions.sys.mjs` (toolkit) | pinned tag | `updateWindow` skip drives `triggerClickOrPopup` |
| `ext-browserAction.js` / `ext-pageAction.js` / `ext-menus.js` (browser parent) | pinned tag | Action click vs popup decision; `show_matches` gating; menu entries |
| `ExtensionPopups.sys.mjs` | pinned tag | Popup panel open/close contract (anchor, sizing, close) |
| `AddonManager.sys.mjs` (`installTemporaryAddon` for fixtures, AMO `installAddonFromWebpage`-equivalent path) | pinned tag | EXT-10 sideload in tests; EXT-09 stock web install |
| `tabs.create/remove/update({active})` → `addTab`/`removeTab`/`selectedTab` setter | planned (31.1) + Phases 34/36 | Tabs the extension creates are adopted like page-opened tabs |
| Extension sidebar page → Theia side-panel view | B5 ruling (Chris 2026-10-22) | Patch 050 turns sidebarAction off for the shell window; Theia view is the only host |
| Extension tab pages (`options_ui open_in_tab`, welcome, dashboards) → stock window | B5 ruling + GUI-01 (`window.open _blank` → `BROWSER_CHROME_URL`) | Web tabs never load `moz-extension://` (Phase 28 sub-ruling 2 stands) |
| Extension commands shortcuts → per-window XUL keyset | B5 ruling + 2026-10-20 Firefox-keys ruling | `ExtensionShortcuts.registerKeysToDocument` per browser window; page-focus scoping per the keys ruling |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native XUL popup panel | Theia DOM popup under the pill | Rejected: overlays (z=1, position:fixed) cover the Theia frame; D-02 |
| CustomizableUI toolbar wiring | Direct `triggerClickOrPopup(tab)` calls | Rejected: CustomizableUI refuses non-`browser.xhtml` documents — `CustomizableUI.sys.mjs:54` pins `kExpectedWindowURL = AppConstants.BROWSER_CHROME_URL`, enforced at `:2510-2511` (`buildWidget was called for a non-browser window!`); the shell window is `powerbrowser:main` (`powerbrowser.xhtml:21`), so the exception always fires |
| Polling action state | Push `extensionAction` kind | Rejected: timer + missed `updateWindow` timing; push reuses Phase 27 fan-out |
| Theia-side popup `<browser>` | Chrome XUL popup browser | Rejected: extension popup needs chrome privileges and `messageManager` of the tab host |
| Stock-window sidebar box for sidebarAction | Theia side-panel view | Rejected by the B5 ruling: the ruling locks the Theia side panel as the sidebar host |
| `execute_browser_action` via keyset for button clicks | Direct `extensionClick` kind → `triggerClickOrPopup` | Rejected: keysets are the commands-API path (38-05); button clicks stay on the actor kind so the privileged-kind rule (widget-handler callers) applies |
</standard_stack>

<architecture_patterns>
## Architecture Patterns

### System Architecture Diagram

```
AMO page (overlay tab) ──install trigger──▶ AddonManager ──stock PopupNotification (37)──▶ user accepts
         │                                                                          │
         │ new extension starts                                                      │ allowlist: addons.mozilla.org hosts
         ▼                                                                          ▼
tab host (31.1): TabOpen/Select/Close/AttrModified ──tabs-progress fan-out──▶ PowerBrowserAPI.webTabPush
         │                                                                          │
         │ selectedTab/selectedBrowser/getTabForBrowser                              │ + extensionAction push kind (38-01)
         ▼                                                                          ▼
ExtensionActions.updateWindow(window) ──badge/icon/enabled──▶ Theia buttons row + puzzle menu (38-02)
         │                                                                          │
click on Theia button ──{kind:'extensionClick', id}──▶ triggerClickOrPopup(selectedTab) ↵ (never shell)
         │                                                                          │
         ├── action (no popup) ── runs against selectedTab (fixes Pitfall-12 wrong-page bug)
         └── popup ── native XUL panel anchored to Theia rect (38-02) ── Esc/focus-out/tab-switch closes
content scripts ── messagemanagergroup=browsers (already inject, spike 001) + real tabId (31.1) ── sender.tab ✓
pageAction show_matches ── isShownForTab(selectedTab) (050 guard, adversarial fix) ── per-tab enable
contextMenus entries ── ext-menus ── Phase-35 contentAreaContextMenu relay ── Theia menu rows (38-03)
tabs.create/remove/update({active}) ── addTab/removeTab/selectedTab setter ── adopt push ── Theia claims (38-01/02)
```

### Recommended Project Structure

```
powerbrowser/shell/PowerBrowserAPI.sys.mjs     # end-of-file: extensionAction push, triggerClickOrPopup,
                                               # addTab/removeTab bridge, install trigger (existing sections untouched)
powerbrowser/shell/powerbrowser.xhtml          # popup panel host element (Phase 37 furniture installer owns it;
                                               # 38 adds the extension-popup wiring only if 37 did not)
theia/extensions/chrome-bar/src/browser/
  extensions/extension-actions-widget.tsx      # NEW: buttons row + puzzle menu (or folded into widget per planner)
  extensions/extension-popup-anchor.ts         # NEW (optional): anchor-rect reporting
  chrome-bar-copy.ts                           # + EXT-06/07/09/10 strings (EXPECTED pins move together)
scripts/verify-extension-actions.mjs           # NEW: static derive-and-compare + --self-test
scripts/verify-extension-actions-live.mjs      # NEW: live buttons/popup proof + --self-test (plants)
scripts/verify-extension-amo-live.mjs          # NEW (or scenarios in the live file): install + EXT-10 set
scripts/verify-platform.sh                     # one appended row per new check (registry rule)
```

### Component Responsibilities

| Component | Responsibility |
|-----------|----------------|
| `PowerBrowserAPI` extension section | Read badge/icon/enabled chrome-side; fan `extensionAction` pushes on `updateWindow`; serve `extensionClick`, `extensionPin`, `extensionRemove`, `tabsBridge` kinds behind sender+tabId validation; never let a frame call `triggerAction(shell)` |
| XUL popup panel | Host the extension popup `<browser>`; anchor from Theia rect; Esc/focus-out/tab-switch close; focus returns to pill |
| Theia buttons/menu | Render pushed state; report anchor rect; pinned set (persisted); Pin/Manage/Remove rows; Manage → `openStockPage {page:'addons'}` |
| Live checks | Positive page-side assertions (popup opened on the ACTIVE tab, badge text, blocked request count, filled login, dark CSS applied) — never absence assertions (CLAUDE.md rule) |
</architecture_patterns>

<dle>
## Don't Hand-Roll

- **Tab identity.** Read it from the 31.1 host. Re-deriving `tabId`/`windowId` in
  Phase 38 recreates spike-001's `{-1,-1}` world and the wrong-page bug.
- **Popup infrastructure.** `ExtensionPopups` + a XUL panel. A Theia DOM popup or a
  hand-rolled CustomizableUI shim cannot draw over overlays (D-02).
- **Install UI.** The stock `PopupNotifications` prompt (Phase 37). An authored
  dialog duplicates strings the rule-5 furniture already owns.
- **Icon/badge pipeline.** The action API's own icon data read chrome-side. A
  Theia-side fetch of `moz-extension://` URLs cannot resolve there.
- **Expectation lists.** Derive button/menu/badge expectations from the installed
  fixture extensions at check time (set equality), exactly like
  `verify-registry-shape.mjs` — hand-kept id lists go stale on the first AMO update.
</dle>

<code_examples>
## Code Examples

Authoritative shapes the plans copy (all re-read at the pinned tag / HEAD this session):

```js
// The ONLY sanctioned click path (28-SPIKE-DECISION §Phase 38):
// Theia sends { kind: 'extensionClick', extensionId }, chrome resolves the
// action and calls triggerClickOrPopup(selectedTab) — never triggerAction(shell).
// selectedTab is the 31.1 host's tab for the last-active overlay (sub-ruling 1),
// so Pitfall 12's wrong-page grant cannot recur.
```

```js
// Append-only boundary rule (INTERNAL-APIS.md:26-30):
// new touchpoint = new row appended at the END of the Touchpoints table;
// new boundary code in the end-of-file section; existing lines change in place;
// then `node scripts/verify-ng-040-internals-catalogue-lines.mjs --fix`
// and `bash scripts/check-internals-boundary.sh --catalogue`.
```

```sh
# One registry row per check, with --self-test (CLAUDE.md):
"extension-actions|node $REPO_ROOT/scripts/verify-extension-actions.mjs"
"extension-actions-self-test|node $REPO_ROOT/scripts/verify-extension-actions.mjs --self-test"
```

```ts
// Static binds (chrome-bar-frontend-module.ts:84-106, D-50):
bind(NewWidget).toSelf().inSingletonScope();
```

### Reused patterns (analog implementations in-tree)
- Push fan-out + `onPush` subscription: `webTabPush` → `WebTabChannel.onPush`
  (`web-tab.ts`); the `extensionAction` kind copies this shape.
- Derived set-equality gates with plants: `verify-registry-shape.mjs`,
  `verify-shell-gbrowser-standin.mjs` (rewritten in 31.1), `verify-web-tab-bridge.mjs`.
- Allowlist + doc-consistency: `verify-webextensions.mjs` §3 (install-origin leg);
  `allowlist-doc-consistency` requires ROADMAP.md + REQUIREMENTS.md naming.
- Live probe harness: `scripts/lib/pb-live-probe.mjs` (`withProbeShell`,
  `MOZ_PURGE_CACHES=1`, page-realm `probe()`, push recorder, plants that must go red).
</code_examples>

<pitfalls>
## Common Pitfalls

1. **Wrong-page action (Pitfall 12, observed live in spike 001 §6).** A click that
   resolves against the stock window's tab grants `activeTab` on a page the user did
   not pick and runs there. *Avoid:* only `triggerClickOrPopup(selectedTab)` exists;
   no kind, command or key row reaches `triggerAction(shell)`; live probe clicks the
   Theia button with an overlay on screen and asserts the effect in THAT overlay.
2. **Zero-tab startup (adversarial check §§76-79).** `page_action show_matches`
   fails at startup with zero overlays; the TabOpen handler reads
   `selectedTab.linkedBrowser` unguarded. *Avoid:* 31.1 lands the `ext-pageAction.js`
   + TabOpen null guards; 38's live set re-runs the zero-overlay install/restart
   case as a regression (it is the state the shell boots in every time).
3. **IDE focus clears the active tab.** The rejected sub-ruling ("no active tab while
   the IDE has focus") widens hazard 2. *Avoid:* sub-ruling 1 (Chris) — the last web
   tab stays active; the live check focuses the editor and re-asserts `tabs.query
   {active:true}`.
4. **`moz-extension://` navigation (sub-ruling 2).** An extension navigating an
   overlay to its own pages breaks the http(s) wall. *Avoid:* the 31.1 http(s)-only
   guard; 38's bridge rejects non-http(s) `tabs.create/update` URLs with a `refused`
   live assertion.
5. **Theia frame in the tracker (sub-ruling 3).** `messagemanagergroup="browsers"`
   on the frame would run every all-sites content script inside the authenticated
   Theia UI (spike 001 §5, SECURITY). *Avoid:* the derived not-in-tracker gate from
   31.1 stays green; 38 adds no `messagemanagergroup` anywhere.
6. **Popup over the page from Theia DOM.** Impossible (z-order); silently "works" in
   the sidecar and fails in the shell. *Avoid:* native panel only; live asserts the
   popup browser's URL bar-side effect in the ACTIVE overlay.
7. **Hand-kept extension lists.** Fixture ids/versions drift on AMO update; a static
   expected list agrees only with the tree it was copied from. *Avoid:* derive from
   the installed fixtures at check time; compare as set equality (both directions red).
8. **Absence assertions.** "No request left the machine" over an observer the check
   itself installed can never go red (CLAUDE.md rule 1). *Avoid:* positive page-side
   outcomes only (blocked count > 0, badge text set, CSS rewritten, login filled).
9. **Stale live test (cache not purged).** The chrome JS startup cache hides shell
   edits. *Avoid:* every live run records `-purgecaches` (probe harness does it);
   wave-close re-runs the 31.1 zero-tab regression.
10. **GUI-01 regression.** Any `browserDOMWindow`/`openStockPage` change can divert
    Theia's `window.open` into tabs. *Avoid:* 38 registers no `browserDOMWindow`,
    moves no `window.open` caller; the GUI-01 live row runs in the wave-close set.
11. **Privileged kinds callable by frames/extensions/AI (Pitfall 7).** A state-changing
    kind with a command id or key row is reachable from any frame. *Avoid:*
    privileged-kind rule — widget-event-handler callers only, classified in
    `verify-web-tab-bridge.mjs`; new kinds classified in the same commit.
12. **Token-cookie / clear-data interplay (Pitfall 6, Phases 29/31).** AMO install and
    clear-site-data tests must not delete the `127.0.0.1` credential. *Avoid:* the
    planted-clear regression stays in the wave-close set.
</pitfalls>

<assumptions>
## Assumes from Earlier Phases

Phase 38 plans against the outputs the ROADMAP entries for Phases 30–37 promise.
Their code does not exist yet (planned/parallel); refresh this plan before it runs.
Numbers are ROADMAP success-criteria references.

- **Phase 30 (Address-Bar Modes, in progress — 30-01..30-04 summaries landed):**
  the pill lives in `address-bar/address-bar.tsx` with `AddressBarModeContribution`;
  `DEFAULT_MODE_BY_UI_MODE` (Coding=Command centre, Browsing=Address,
  Organising=Tabs); Command centre `MODE_SENDS` row all-false (never sends typed
  text to a search engine). 38 assumes the pill slot and the mode-chip row it
  extends, not any mode behaviour.
- **Phase 31 (Site Identity + App Menu):** security state pushed chrome-side with
  `url`; `openStockPage` enum (Settings/Passwords/Add-ons); permission reads/writes
  keyed by overlay principal; `127.0.0.1` cookie exempt from clear-data; hamburger
  menu in Firefox order incl. Quit. 38 assumes `openStockPage {page:'addons'}` and
  the cookie exemption.
- **Phase 31.1 (Extension Tab Host — THE load-bearing assumption):** patch 050
  regenerated (incl. `ext-pageAction.js` + TabOpen null guards); tab host behind
  PowerBrowserAPI with `selectedTab`/`selectedBrowser`, `getTabForBrowser`,
  TabOpen/Select/Close/AttrModified + tabs-progress fan-out, CHROME_TOOLBAR
  window-type fix; derived gates (browserWindows consumers set-equality, Theia
  frame never in tracker, http(s)-only navigation guard); rewritten
  `verify-shell-gbrowser-standin.mjs`; zero-overlay + IDE-focus + first-tab
  rebuild-verified cases green. If 31.1 lands differently, re-derive 38-01/02.
- **Phase 32 (Page Tools):** mute/soundPlaying/zoom as tab-host members; favicons
  via LinkHandlerParent → host + Places. 38 assumes badge/state reads reuse the
  same host-member pattern (no second identity path).
- **Phase 33 (Bookmarks/History/Full Menu):** Downloads/Print/Save/Find/Zoom exist
  for menu + Actions mode; `clearHistory` fan-out; SMODE-07 actions. 38 assumes no
  menu-path collisions (`powerbrowser-chrome-bar-*` paths stay distinct).
- **Phase 34 (Tab Strip):** `_tPos`/pinned/multiselect mirror + TabMove/Pinned/
  MultiSelect; chrome→Theia `tabs.move/update({pinned})/highlight` requests. 34
  owns NO `selectedTab` setter (verified: `selectedTab|setter` greps under
  `34-tab-strip/` hit only assumption lines `34-RESEARCH.md:14` and
  `34-01-PLAN.md:89`, both pointing at 31.1's host). 38 assumes the
  `tabs.update({active})` → `selectedTab`-setter half of the 31.1 host bridge
  (31.1-02-PLAN.md:116: `selectedTab=` refused-traced setter; 38-01 serves
  `tabsBridgeActivate` through the host's `tabHostSelectTab`, never by adding a
  setter — no fallback builds it here).
- **Phase 35 (Furniture + Context Menu):** `installShellFurniture(window)` installer
  + derived `verify-shell-furniture.mjs`; `contentAreaContextMenu` relay stub that
  extension `contextMenus` entries ride; form/tooltip/fullscreen furniture. 38
  assumes the relay carries extension items (38-03 proves it; no new relay).
- **Phase 36 (New-Window Tabs):** chrome-first adoption (`adopt` push, openerTab,
  `openWindowInfo`); GUI-01 kept. 38 assumes `tabs.create` reuses that adoption
  shape (D-06); records the GUI-01 live row in wave-close.
- **Phase 37 (Prompts + Dialogs):** `getTabDialogBox` + stock `PopupNotifications`
  on a native panel anchored to a Theia rect; sharing indicator; notification bars
  (Allow-on-blocked-popup opens via the Phase 36 path). 38 assumes the install
  prompt host exists and adds only the trigger + allowlist (D-04). NOTE (verified
  2026-10-23): 37 routes add-on install prompts to the STOCK window, not the shell
  (`37-CONTEXT.md:130,158` — "sent to the stock window (bridge+chrome M), not this
  phase"). 38-05's `amo-install` scenario therefore drives the install from an
  overlay on the AMO page and asserts the stock prompt page-side per the 37 panel
  contract; if 37's verdict leaves no shell-window prompt host, absence at
  execution time is a blocker the executor reports — 38 builds no second prompt.
- **Phase 31 (Site Identity), Phase 36 (New-Window Tabs), Phase 28 sign-off:**
  unchanged (see RESEARCH.md rev 2026-10-22 text for the full rows).
</assumptions>

<validation_arch>
## Validation Architecture

Proof tiers: **S** static gate (`--quick`, `--self-test`); **L** live built shell
(`withProbeShell`, `MOZ_PURGE_CACHES=1`, page-realm `probe()`, push recorder);
**A** allowlist/registry consistency (static, same commit).

| Requirement | Static (S/A) gate | Live (L) proof |
|-------------|-------------------|----------------|
| EXT-06 buttons+puzzle | `verify-extension-actions.mjs`: buttons/menu derived from installed fixtures (set equality); badge/icon/enabled derived chrome-side; pinned set persisted; `--self-test` plants | `verify-extension-actions-live.mjs --scenario buttons`: install 2 fixtures, assert buttons + puzzle rows + badge text; plant `buttons-stale` |
| EXT-07 click/popup | same gate: no `triggerAction(shell)` string; only `triggerClickOrPopup(selectedTab)`; kind classified privileged | `--scenario popup-action`: click Theia button with overlay on screen → popup opens / action runs IN that overlay (wrong-page plant); Esc/focus-out closes; focus returns to pill |
| EXT-08 content/pageAction/menus | `verify-shell-furniture`-adjacent: no new `messagemanagergroup`; `contextMenus` entries ride the 35 relay (derived) | `--scenario content`: `sender.tab` set; `sendMessage(tabId)` reaches page; `show_matches` page-action enables per tab; menu entry runs on web tab, not in IDE |
| EXT-09 AMO install | `verify-webextensions.mjs` (install-origin leg) + `allowlist-doc-consistency` (ROADMAP+REQUIREMENTS name the hosts, same commit) | `--scenario amo-install`: stock prompt appears (page-side), accept → extension works; plant `prompt-bypassed` |
| EXT-10 fixtures | S: fixture pins (ids + versions) derived, not hand-kept | `--scenario fixtures`: uBO blocks (count>0), Bitwarden fills, Dark Reader rewrites CSS — each a positive page-side assertion |
| Regression (every wave-close) | `--quick` + all `--self-test`s green | 31.1 zero-tab install/restart; IDE-focus active-tab; GUI-01 row; token-cookie planted clear; `moz-extension://` create refused |

Sampling: `--quick` after every task commit (stage new files first — brand scan
reads `git ls-files`); live scenarios after each Theia build; full `--quick` +
live self-tests before verify-work. Max feedback latency ~90 s (quick).

Wave 0 (new files the plans create): `scripts/verify-extension-actions.mjs`,
`scripts/verify-extension-actions-live.mjs` (+ AMO/fixtures scenarios, possibly one
file), `extension-actions-widget` sources, popup-panel wiring, registry rows in
`verify-platform.sh`, INTERNAL-APIS.md appended rows + `--fix`/catalogue steps.
</validation_arch>

<sources>
## Sources

Tree (HIGH — read at HEAD this session):
- `powerbrowser/shell/PowerBrowserAPI.sys.mjs` (`webTabs`, `WEB_TAB_ACTION_KINDS:4124`,
  `handleGroupMutation`, `handleStoreRequest`, `webTabPush`, `webTabOpen:3234`)
- `powerbrowser/INTERNAL-APIS.md:23-45` (append-only + privileged-kind rules)
- `powerbrowser/shell/powerbrowser.js:56-99` (gBrowser stand-in, no-synthesis rule
  pre-31.1), `powerbrowser.xhtml` (`windowtype`, CSP, single content browser)
- `theia/extensions/chrome-bar/src/browser/` (`chrome-bar-widget.tsx` menus/tooltips,
  `address-bar/*` pill + modes + command-centre, `chrome-bar-copy.ts`,
  `chrome-bar-frontend-module.ts` static binds, `tab-strip-widget.tsx`)
- `powerbrowser/endpoint-allowlist.json` (schema, deliberate-egress legs)
- `scripts/verify-platform.sh` (registry shape), `verify-webextensions.mjs`
  (EXT-03 gate + install-origin leg), `verify-web-tab-bridge.mjs`,
  `verify-shell-gbrowser-standin.mjs`, `verify-shell-error-copy.mjs`

Pinned upstream (HIGH — re-read at `FIREFOX_153_5_0esr_BUILD1` via prior research;
MEDIUM for 38-specific call sites until 31.1 lands and probes run):
- Extension parent actors, `ExtensionActions`/`ExtensionPopups`, `AddonManager`,
  `PopupNotifications`, `TabManager`/`tabTracker`/`windowTracker` — see
  28-SPIKE-DECISION spikes 001/002a/002c for paths and lines.
- 38-specific call sites re-verified against upstream/ this revision (all at the
  pinned tag; current-tree absence noted where it binds a plan):
  - `triggerClickOrPopup(tab, clickInfo)` — `upstream/toolkit/components/extensions/ExtensionActions.sys.mjs:240`
    (null when hidden `:241-243`; grants activeTab + activates scripts `:246-248`; popup URL or click dispatch `:250-258`).
  - Delegate `updateWindow(window)` (there is NO `ExtensionActions.updateWindow` in the
    toolkit file — its stub is `updateOnChange` at `:347`) — `upstream/browser/components/extensions/parent/ext-browserAction.js:981`
    (reads `window.gBrowser.selectedTab` at `:984`, pushes `getContextData(tab)` at `:992`;
    dispatched from `updateOnChange` at `:60-72`). Patch 050 adds the
    `isTabHostWindow` early-return skip (`.planning/spikes/002a-ext-route-patch/050-extension-tab-host.patch:52-58`).
  - `triggerAction(window)` (the string plans must NEVER contain outside a gate plant) —
    `ext-browserAction.js:555` (resolves `window.gBrowser.selectedTab` at `:561`, calls
    `triggerClickOrPopup(tab)` at `:564`, opens via `openPopup(window)` at `:566`) and
    `ext-pageAction.js:240` (via `handleClick` at `:240-243`, `triggerClickOrPopup` at `:298`).
    38 calls `action.triggerClickOrPopup(selectedTab)` directly on the host tab and never
    calls `delegate.triggerAction(window)` — that path re-resolves the selected tab through
    the stock window and is the wrong-page vector (Pitfall 12).
  - Page-action `show_matches` gating — `ExtensionActions.sys.mjs:439-457` (empty
    `show_matches` ⇒ `enabled=false`; else `MatchPatternSet` show/hide) and
    `isShownForTab(tab)` at `:484-499` (pattern-match cached per tab against
    `tab.linkedBrowser.currentURI`); consumed at `ext-pageAction.js:171`.
  - `PanelPopup` host contract — `upstream/browser/components/extensions/ExtensionPopups.sys.mjs:484`
    (`document.createXULElement("panel")`, appended to `#mainPopupSet`; NOT the toolkit path).
  - Sidebar hosting — `ext-sidebarAction.js:149-160` (`SidebarController.registerExtension` +
    `browser.contentWindow.loadPanel(panel)`); every entry guarded by `canAccessWindow`
    (`:144,217,350,362,385`); patch 050 turns the whole surface off for the shell window
    (skip at `createMenuItem :150` + `updateWindow :226`, `isOpen` null-guard). The B5 ruling
    therefore hosts the panel page in a Theia side-panel view, never in a shell sidebar box
    (which does not exist — `powerbrowser.xhtml` is 60 lines with zero popup/panel/keyset
    elements; only script is `powerbrowser.js:33`, only chrome element is `#powerbrowser-content:58`).
  - Commands shortcuts — `ext-commands.js:1-87` delegates to `ExtensionShortcuts.sys.mjs`;
    `registerKeysToDocument(window, commands)` at `:393-436` builds a per-window XUL
    `<keyset id="ext-keyset-id-…">` (`createXULElement("keyset") :402`, appended to the
    document element `:431`); the `command` listener at `:455-476` fires `onCommand` or
    `_execute_*` via `browserActionFor/pageActionFor/sidebarActionFor` + `triggerAction(win)`
    (`:462-474`). Keysets are per-browser-window chrome: they fire while the shell window
    handles the key, which under the 2026-10-20 Firefox-keys ruling + Phase 27 key table
    (`powerbrowser.js:304-399`) means page-focus scoping is the tracker's job, not the keyset's.
  - `tabs.create/remove/update` — `ext-tabs.js:691` → `window.gBrowser.addTab :809` (+`selectedTab= :813`);
    `:831` → `gBrowser.removeTab :835`; `:870` → `selectedTab= :910` for `active:true`.
  - `contentAreaContextMenu` stub shape — `upstream/browser/base/content/main-popupset.inc.xhtml:603`
    (`<menupopup id="contentAreaContextMenu" showservicesmenu="true">`, includes
    `browser-context.inc.xhtml :606`; pulled in via `browser.xhtml:112`).
  - `installTemporaryAddon(aFile)` — `upstream/toolkit/mozapps/extensions/AddonManager.sys.mjs:2772`
    (public wrapper `:4504-4506`); AMO web-install `installAddonFromWebpage` at `:2443`
    (public wrapper `:4480-4494`).

Prior planning (HIGH for process, MEDIUM for forward assumptions):
- 27/29/30 CONTEXT + RESEARCH + PATTERNS + VALIDATION + SECURITY + SUMMARYs
- `.planning/research/{SUMMARY,STACK,FEATURES,ARCHITECTURE,PITFALLS,
  chrome-bar-firefox-gap}.md`
</sources>

---
*Research completed: 2026-10-22*
*Ready for planning: yes. Blocks: Phase 31.1 host API (assumption, not a re-plan trigger until it lands).*
