# Phase 38: WebExtensions - Context

**Gathered:** 2026-10-22
**Status:** Ready for planning
**Mode:** `--auto` (Chris's standing autonomous rule: every gray area takes the recommended option, recorded with a one-line reason)

<domain>
## Phase Boundary

Installed Firefox extensions work in web tabs as they do in Firefox, driven from toolbar
buttons and a puzzle menu in the chrome bar (ROADMAP.md Phase 38; requirements EXT-06..EXT-10).

In scope: Theia-rendered toolbar buttons and puzzle (extensions) menu with icon, badge,
Pin to Toolbar, Manage and Remove (EXT-06); button activation that opens the extension
popup or runs its action against the active web tab (EXT-07); content scripts, page
actions and context-menu entries working in web tabs on top of the Phase 31.1 tab host
(EXT-08); AMO install with the stock install prompt (EXT-09); live checks of an ad
blocker, a password manager and a dark-mode extension in web tabs (EXT-10).

Not in scope: EXT-05 (Phase 31.1 tab host: query/events/active-tab identity); EXT-04
(spike, signed off); any GUI-05 unified tab strip; any new Gecko logic patch beyond
patch 050 (D-74 allows exactly that one); Customize TabStrip / CustomizableUI authoring.

Depends on: Phase 37 (doorhanger/popup-notification furniture hosts the AMO install
prompt), Phase 31.1 (tab host), Phase 35 (context-menu relay carries extension menus
entries), Phase 31 (`openStockPage` enum opens Add-ons Manager), Phase 28 signed-off
route (no planning without it — satisfied 2026-10-21).
</domain>

<decisions>
## Implementation Decisions

### Recorded rulings that apply (REQUIREMENTS header, ROADMAP Phase 38, 28-SPIKE-DECISION sign-off)
- Signed-off route is (a)+(c): patch-050 tracker gate plus a product tab host behind
  PowerBrowserAPI; no GUI-05; EXT-05..10 stay in v1.5 (Chris sign-off 2026-10-21).
- Sub-ruling 1 (Chris): while the IDE (editor/terminal) has focus, the last web tab
  stays the active tab for extensions (not "no active tab").
- Sub-rulings 2-3 (recommended defaults, taken with the route): extensions may not
  navigate an overlay to `moz-extension://` pages (the http(s) rule holds); the Theia
  frame never enters the tracker, enforced by a derived gate.
- Policy changes carried: D-74 amended for this one logic patch; the 2026-10-20 ruling
  "getTabForBrowser keeps returning null" and the "never synthesise a tab" rule are
  reversed for the tab host.
- Phase 28 scope consequence for Phase 38 (binding): Theia-rendered buttons/puzzle call
  `triggerClickOrPopup(selectedTab)`, never `triggerAction(shell)`; popup host exists
  because CustomizableUI refuses any document other than `browser.xhtml`; badge/popup
  state is read chrome-side through the 050 `updateWindow` skip; `tabs.create/remove/
  update({active})` go through `addTab`/`removeTab` and a `selectedTab` setter routed
  to Theia; EXT-09 adds AMO hosts to `endpoint-allowlist.json` with `allowlist-doc-
  consistency` naming each in ROADMAP + REQUIREMENTS in the same change.
- Chrome-bar copy reads the configured app name, never a hard-coded brand.
- Stock Firefox toolkit popups with stock strings in `powerbrowser.xhtml` are shell
  furniture (rule 5 clarified), not authored chrome.
- Firefox keys that clash with Theia take the browser meaning only while a web page
  has focus.

### Gray areas (autonomous, recommended option taken)
- **D-01: Buttons live in the chrome-bar top row with a puzzle-menu overflow, not in a
  second row.** Reason: Firefox puts actions in the nav-bar overflow; a second row
  would be authored browser chrome beyond the chrome-bar boundary.
- **D-02: The popup is a native XUL panel hosting the extension popup browser,
  anchored to a rect Theia reports — not a Theia DOM popup.** Reason: overlays sit
  above the Theia frame (z-order pitfall), so a DOM popup cannot draw over a page;
  CustomizableUI/panel infrastructure refuses non-`browser.xhtml` documents.
- **D-03: Badge text/background, button icon and enabled state are pushed chrome →
  Theia on the existing push channel as a new `extensionAction` kind, not polled.**
  Reason: the widened push from Phase 27 already fans tab state; polling would add a
  timer and still miss `updateWindow` timing.
- **D-04: AMO install uses the stock `PopupNotifications` install prompt supplied by
  Phase 37 furniture; Phase 38 adds only the allowlist rows and the install trigger.**
  Reason: avoids a second install UI and the Phase 37 probe already sizes the stock
  notification host.
- **D-05: EXT-08 needs no new actor plumbing — it is proven on the tab host plus the
  Phase 35 context-menu relay.** Reason: spike 001 shows content scripts already run
  in overlays; the missing piece was tab identity, which 31.1 supplies.
- **D-06: `tabs.create`/`remove`/`update({active})` are chrome-first: chrome mints or
  selects the overlay, pushes `{kind:'adopt'|'select'}`, Theia claims it — same
  adoption shape as Phase 36.** Reason: Theia mints tabIds elsewhere; a page/extension-
  created tab has no owner actor until adopted, or it leaks on reload.
- **D-07: EXT-10 fixed set is uBlock Origin (blocker), Bitwarden (password manager),
  Dark Reader (dark mode).** Reason: each exercises a distinct surface (webRequest
  blocking, autofill/password-save interplay, content-script CSS rewrite) and each has
  an AMO listing for the EXT-09 path.
- **D-08: Pin to Toolbar toggles a persisted pinned set; Manage opens Add-ons Manager
  via `openStockPage {page:'addons'}`; Remove calls uninstall behind a confirm row.**
  Reason: matches Firefox's three menu items with the enum-only privileged-page rule
  (no URL ever crosses the bridge).
- **D-09 (B4, recommended option taken): the EXT-10 password-manager proof uses a
  self-hosted login form on the harness origin (`127.0.0.1`, served by
  `scripts/lib/pb-live-probe.mjs:337-338`) with throwaway credentials the live
  scenario invents at runtime — never a Bitwarden vault account, never committed
  secrets.** Reason: Bitwarden autofill needs no server or account to prove (the
  extension offers and fills whatever is in the local vault the scenario seeds via
  the extension's own test affordance or a locally stored login); a vault server
  host plus an allowlist row plus a credential-distribution story would add egress
  and secret-handling scope the requirement ("checked working live in web tabs",
  REQUIREMENTS.md:135) does not ask for. The scenario first shows the unfilled
  baseline in the same session (positive control), then the filled outcome.
- **D-10 (W1, kept): task `type="tracer"` is valid.** Reason: it is the GSD plan
  vocabulary for the end-to-end proof task, as in the existing 38-01 T2 / 38-02 T2
  / 38-03 T1 / 38-05 T2 tasks.
- **D-11 (W4, stated): `extensionClick`, `extensionPin` and `extensionRemove` are
  store kinds (STORE_REQUEST_KINDS routed to `handleStoreRequest`), not `webTab*`
  action kinds.** Reason: they carry no tabId and mutate cross-tab chrome state
  (click dispatch / pinned set / installed set), so they route with the
  Phase-29 store discipline (same-named `ChromeStoreClient` method, widget-handler
  callers only) and are classified in `STORE_KIND_CLASSES` (click/pin/remove are
  `privileged`; install-trigger is `network` — it sends the user off-machine to
  AMO). The `tabsBridge*` arms stay `webTab*` action kinds (`tab-lifecycle`).

### Chris's ruling on B5 (2026-10-22). Recorded verbatim as locked decisions.
- Sidebars (sidebarAction, which patch 050 turns off for the shell window): show an extension's sidebar page as a view in Theia's left or right side panel. Add a task and a live check to Phase 38.
- Extension pages that open in a tab (options_ui open_in_tab, welcome/onboarding pages, dashboards such as uBlock Origin's and Bitwarden's): open them in the stock browser window. Web tabs still never load moz-extension:// pages (the Phase 28 sub-ruling stands). Add a task and a live check.
- Extension keyboard shortcuts (the commands API): include them. They fire while a web page has focus, matching the 2026-10-20 ruling on Firefox keys; Theia keeps its keys otherwise. Add a task and a live check.

### Claude's Discretion
- Exact check names (`extension-actions`, `extension-popup-live`, `extension-amo-live`),
  plant lists, wave split after 38-01, badge-poll backstop interval if the push is
  unavailable in a test fixture, and puzzle-menu overflow threshold (default: buttons
  beyond 3 pinned collapse into the menu).
- Popup panel pixel geometry beyond the UI-SPEC anchor contract.

</decisions>

<code_context>
## Existing Code Insights

Codebase context gathered by reading the tree 2026-10-22 (no build, no live run).

### Reusable Assets
- `powerbrowser/shell/PowerBrowserAPI.sys.mjs` — the ONE boundary; new `webTab*` /
  `extension*` kinds go in the end-of-file section beside `WEB_TAB_ACTION_KINDS`
  (`handleGroupMutation`/`handleStoreRequest`, `webTabs` map, `webTabPush` fan-out).
  New internals need one appended INTERNAL-APIS.md row each (append-only rule).
- `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx` — nav buttons,
  pill slot, menu/menu-path patterns (`HISTORY_MENU_PATH`), tooltip/copy discipline
  via `CHROME_BAR_COPY`; toolbar buttons extend this row, they do not fork it.
- `address-bar/address-bar.tsx` + `chrome-store-client.ts` — request/push pattern
  (`WebTabChannel.onPush`, `ChromeStoreClient.request`) the extension-state push
  copies; privileged-callers gate in `verify-web-tab-bridge.mjs` constrains callers.
- `tab-strip-widget.tsx` / `chrome-bar-frontend-module.ts` — static-at-load binds
  (D-50); new widgets/contributions bind the same way.
- `scripts/verify-web-tab-bridge.mjs`, `verify-shell-error-copy.mjs`,
  `verify-chrome-bar-suggestions.mjs`, `verify-shell-gbrowser-standin.mjs` — gates
  the new checks copy (derive-and-compare + `--self-test` with planted faults).
- `scripts/verify-webextensions.mjs` — EXT-03 declaration gate; EXT-09 extends its
  allowlist leg, it does not replace it.
- `powerbrowser/endpoint-allowlist.json` + `allowlist-doc-consistency` — every new
  allow-dispositioned Mozilla host must be named in ROADMAP.md and REQUIREMENTS.md
  in the same change.

### Established Patterns
- Derive-from-the-tree-and-compare, never hand-keep a list (CLAUDE.md); every new
  check has `--self-test` planting faults that must go red naming the drift.
- One registry row per check in `scripts/verify-platform.sh`; no sibling driver.
- `openStockPage {page}` enum for privileged pages, never a URL across the bridge.
- Privileged-kind rule: state-changing kinds run only from widget event handlers,
  never get a command id or key-relay row; classified in `verify-web-tab-bridge.mjs`.
- Layer policy: new dropdowns are `.pb-chrome-bar-dropdown` portals; nothing draws
  over a page from Theia DOM.

### Integration Points
- Phase 31.1 tab host: `selectedTab`/`selectedBrowser`, `getTabForBrowser`,
  `browserWindows()` set, TabOpen/Select/Close/AttrModified fan-out — the identity
  EXT-06..08 read; Phase 38 never re-derives identity itself.
- Phase 37 furniture: `PopupNotifications` host + `getTabDialogBox` — the AMO
  install prompt and any auth/dialog the popup flow triggers.
- Phase 35 relay: `contentAreaContextMenu` stub — the carrier for extension
  `contextMenus` entries.
- Phase 31 site panel + `openStockPage`: Manage entry target; permission badges.
</code_context>

<specifics>
## Specific Ideas

None beyond the ROADMAP success criteria and the spike record. No mockups requested
beyond the 38-UI-SPEC contract; visual reference is Firefox's toolbar overflow
(puzzle icon, pinned actions, badge) rendered in Theia theme tokens.
</specifics>

<canonical_refs>
## Canonical References

Downstream agents MUST read these before planning or implementing.

### Phase scope and requirements
- `.planning/ROADMAP.md` Phase 38 entry (goal, depends, notes, success criteria 1-5)
- `.planning/REQUIREMENTS.md` § WebExtensions EXT-04..EXT-10 + Inherited network egress footer
- `.planning/PROJECT.md` Key Decisions (boundary rule, bridge rule, rule 5, generator/copy rules)

### Decisive prior art
- `.planning/phases/28-webextension-tab-route-spike/28-SPIKE-DECISION.md` — the signed-off
  route, adversarial-check guards, per-phase adjustments §§ Phase 38 / 31.1 / 35 / 37, sub-rulings
- `.planning/research/SUMMARY.md` — shell-furniture model, Pitfalls 2/7/12, probe harness
- `.planning/research/STACK.md` — `messagemanagergroup="browsers"` actor inventory, extension APIs
- `.planning/research/ARCHITECTURE.md` — shell-window diagram, furniture installer, popup host
- `.planning/research/FEATURES.md` — EXT category, requirement split rationale
- `.planning/research/PITFALLS.md` — Pitfalls 1 (browserDOMWindow/GUI-01), 2 (gBrowser growth),
  7 (privileged kinds), 12 (WebExtensions/wrong-page bug)
- `.planning/research/chrome-bar-firefox-gap.md` — "To add" extension rows

### Completed-phase contracts this phase builds on
- `.planning/phases/27-groundwork-navigation-buttons-and-page-focus-keys/27-CONTEXT.md`,
  `27-RESEARCH.md`, `27-PATTERNS.md`, `27-VALIDATION.md`, `27-SECURITY.md` (open T-27-11
  carried to 31.1/35 — do not re-close here), `27-0*-SUMMARY.md` risks
- `.planning/phases/29-address-bar-search-and-fixup/29-CONTEXT.md`, `29-RESEARCH.md`,
  `29-PATTERNS.md`, `29-VALIDATION.md`, `29-SECURITY.md`
- `.planning/phases/30-address-bar-modes-and-command-centre/30-CONTEXT.md`,
  `30-UI-SPEC.md`, `30-RESEARCH.md`, `30-PATTERNS.md`, `30-VALIDATION.md`

### Current code (read 2026-10-22; tree state, not a build)
- `powerbrowser/shell/PowerBrowserAPI.sys.mjs` — `webTabs` map, `handleGroupMutation`,
  `handleStoreRequest`, `webTabPush`, `WEB_TAB_ACTION_KINDS` + privileged-kind rule
- `powerbrowser/INTERNAL-APIS.md` — append-only catalogue + privileged-kind rule §32-45
- `powerbrowser/endpoint-allowlist.json` — hosts/prefs schema, `allowlist-doc-consistency`
- `powerbrowser/shell/powerbrowser.js` — gBrowser stand-in (`getTabForBrowser→null`
  pre-31.1), `browserDOMWindow` absence (GUI-01), focus tracker
- `powerbrowser/shell/powerbrowser.xhtml` — `windowtype="powerbrowser:main"`, CSP
- `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx` — bar row, menus, copy
- `theia/extensions/chrome-bar/src/browser/address-bar/address-bar.tsx`,
  `address-bar-modes.ts`, `command-centre.ts`, `chrome-bar-copy.ts`,
  `chrome-bar-frontend-module.ts`, `tab-strip-widget.tsx`
- `scripts/verify-platform.sh` — the one driver/registry (`--quick`, `--only`, `--self-test` rows)
- `scripts/verify-webextensions.mjs`, `scripts/verify-web-tab-bridge.mjs`,
  `scripts/verify-shell-gbrowser-standin.mjs`, `scripts/verify-shell-error-copy.mjs`
</canonical_refs>

<deferred>
## Deferred Ideas

- Tier-1 fallback (stock-window-only actions) — rejected with the route; not planned.
- GUI-05 unified tab strip — out of scope (spike consequence §120).
- `tabs.create` with `moz-extension://` targets — refused by the http(s) rule (sub-ruling 2).
- Per-extension per-site permission UI beyond the Phase 31 site panel — later milestone.
- Extension keyboard shortcuts *settings page* — later milestone (keybinding surface
  is Phase 27's). The commands API itself (shortcuts firing while a page has focus)
  is IN scope per the B5 ruling above; only the settings UI defers.
- sessions API (`sessions` in patch-050's off list) — NOT restored in Phase 38. Locked
  out of scope by the B5 ruling above: the ruling restores sidebars, tab-pages and
  the commands API only. `sessions` stays off under patch 050 (like the rest of
  050's `isTabHostWindow` skips); a later milestone may revisit it.
</deferred>

---

*Phase: 38-webextensions*
*Context gathered: 2026-10-22*
