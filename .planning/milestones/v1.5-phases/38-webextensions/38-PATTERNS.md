# Phase 38: WebExtensions - Pattern Map

**Mapped:** 2026-10-22 (static read; no build, no live run — binary in use by another agent)
**Files analyzed:** 14 (5 new, 9 modified)
**Analogs found:** 14 / 14

Decisions recorded as locked: D-01 bar-row buttons + puzzle overflow; D-02 native XUL
popup panel; D-03 `extensionAction` push kind; D-06 chrome-first adoption; D-08
Pin/Manage/Remove semantics (38-CONTEXT.md).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `powerbrowser/shell/PowerBrowserAPI.sys.mjs` (end-of-file extension section) | service (boundary) | request-response + push fan-out | itself `webTabPush`/WEB_TAB_ACTION_KINDS (27-01, :4112-4260) | exact |
| `powerbrowser/INTERNAL-APIS.md` (appended rows) | doc | n/a | itself rows + append-only rule :26-45 | exact |
| `powerbrowser/shell/powerbrowser.xhtml` (popup panel host, only if 37 did not) | config (markup) | event-driven | Phase 37 furniture installer (planned) | role-match |
| `theia/extensions/chrome-bar/src/browser/extensions/extension-actions-widget.tsx` (new; or folded into widget per planner) | component | event-driven | `chrome-bar-widget.tsx` (menus, HISTORY_MENU_PATH, tooltips) + `tab-strip-widget.tsx` (second view pattern) | role-match |
| `theia/extensions/chrome-bar/src/browser/extensions/extension-popup-anchor.ts` (new, optional) | service | request-response | `chrome-bar-shortcuts.ts` (push subscription + relay) | role-match |
| `theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts` (EXT strings) | config | n/a | itself + `EXPECTED_NAV_COPY` discipline | exact |
| `theia/extensions/chrome-bar/src/browser/chrome-bar-frontend-module.ts` (binds) | config | n/a | itself :82-108 (D-50 static binds) | exact |
| `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx` (buttons slot, puzzle path) | component | event-driven | itself | exact |
| `powerbrowser/endpoint-allowlist.json` (AMO hosts) | config | n/a | itself `search_engines` legs 29-03 (`manifest` back-pointer) | exact |
| `.planning/ROADMAP.md` + `.planning/REQUIREMENTS.md` (AMO host naming) | doc | n/a | `allowlist-doc-consistency` existing rows | exact |
| `scripts/verify-extension-actions.mjs` (new, + `--self-test`) | test | transform | `scripts/verify-registry-shape.mjs` + `verify-web-tab-bridge.mjs` | exact |
| `scripts/verify-extension-actions-live.mjs` (new, + `--self-test`) | test (live) | event-driven | `scripts/verify-address-bar-live.mjs` (scenarios + PLANTS) | exact |
| `scripts/verify-extension-amo-live.mjs` (new, or scenarios in the above) | test (live) | event-driven | `scripts/verify-search-engines-packaged.mjs` (P-tier pattern) + live harness | role-match |
| `scripts/verify-platform.sh` (appended rows) | config (registry) | n/a | itself `extension-*`/quick rows :4595-4596 | exact |

## Pattern Assignments

### `PowerBrowserAPI.sys.mjs` extension section (boundary, request-response)

**Analog:** itself, end-of-file `webTab*` block (27-01 pattern: one `receiveMessage`
line → `handleWebTabAction` switch → per-kind validation → `webTabs.get`).

- New kinds go in the same end-of-file section (`extensionClick`, `extensionPin`,
  `tabsBridgeCreate/Remove/Activate`, `extensionInstall`, adopt/select pushes);
  sender wall (`groupSenderIsTheia`) + `webTabIdIsValid`-equivalent id checks first,
  exactly like :4132-4194.
- New `extensionAction` push fans out beside `webTabPush` (:3388), keyed by the
  requesting actor only; payloads carry chrome-chosen ids/titles/badge text, never
  raw `Extension` objects.
- Click path calls `triggerClickOrPopup(selectedTab)` on the 31.1 host's tab — the
  single sanctioned string; `verify-extension-actions.mjs` asserts its presence and
  the absence of `triggerAction(`.
- After edit: `node scripts/verify-ng-040-internals-catalogue-lines.mjs --fix`,
  `bash scripts/check-internals-boundary.sh --catalogue`, append rows at the END of
  the INTERNAL-APIS.md table (never insert).

### `extensions/extension-actions-widget.tsx` (component, event-driven)

**Analog:** `chrome-bar-widget.tsx` lines 40-50 (menu path pattern), 92-110
(injectable + `ReactWidget`), tooltip/copy discipline.

```tsx
// Menu path: per-request build, never registered (HISTORY_MENU_PATH pattern):
const EXTENSIONS_MENU_PATH: MenuPath = ['powerbrowser-chrome-bar-extensions'];
// Buttons render pushed state only; clicks send one actor kind per gesture.
// No command id names a state-changing kind (privileged-kind rule, research D7).
```

- Renders between the pill and New Tab (D-01); pinned set (max 3) inline, rest in
  the `.pb-chrome-bar-dropdown.pb-ext-menu` portal (layer policy, 27-UI-SPEC).
- Anchor rect: `getBoundingClientRect()` of the clicked button, reported with the
  click kind so chrome positions the XUL panel (UI-SPEC popup host contract).
- Pinned set persisted via `PreferenceService` (user scope — cf. 27-08 Home
  user-scope fix); Manage → `openStockPage {page:'addons'}` enum (never a URL).

### `chrome-bar-copy.ts` + `EXPECTED_NAV_COPY` (config)

**Analog:** itself + 30-04 pattern (four strings pinned in `EXPECTED_NAV_COPY`,
moved in the same commit as the copy).

- Add the 38-UI-SPEC rows verbatim-shaped (`extensionsMenuEmpty`, `pinToToolbar`,
  `removeConfirm…`); subject via `appSubject()`; no extension/tab id in any string.

### `verify-extension-actions.mjs` (test, transform)

**Analog:** `verify-registry-shape.mjs` lines 18-44 (derive-at-check-time, set
equality, both directions red) + `verify-web-tab-bridge.mjs` privileged-caller loop.

- Derives the expected button/menu set from the installed fixture extensions at
  check time (ids + versions read from the fixtures, not literals); compares with
  the chrome-read action state as set equality.
- `--self-test` plants: (1) drifted fixture (extra id), (2) `triggerAction(shell)`
  string, (3) new `messagemanagergroup` outside the allowlist, (4) unclassified
  kind, (5) hand-kept id literal. Each must go red naming the drift.
- Prints the count of sources read (recursive scan incl. `extensions/`), so a count
  that does not grow after 38-02 is visible (30-01 Task-1 pattern).

### `verify-extension-actions-live.mjs` / `verify-extension-amo-live.mjs` (live)

**Analog:** `verify-address-bar-live.mjs` (registry shape: `withProbeShell`,
`MOZ_PURGE_CACHES=1`, `PLANTS` table :2499, per-scenario functions, positive-control
first, no absence assertions).

- Scenarios: `buttons`, `popup-action` (+ `wrong-page` plant: effect lands in the
  stock tab), `page-action` (pill icon show/hide per tab + click path, B2),
  `content` (`sender.tab`, `sendMessage`, `show_matches`, menus relay),
  `manage` (enum opens Add-ons Manager; Remove uninstalls), `regression`
  (zero-overlay restart, IDE-focus active-tab, GUI-01, token-cookie clear,
  `moz-extension://` refused), `amo-install` (stock prompt page-side), `fixtures`
  (uBO count>0, password-manager fill of a harness-local form with runtime
  throwaway credentials per D-09, Dark Reader CSS — positive assertions only),
  `sidebar` + `tab-pages` + `commands` (B5 ruling, 38-04).
- Fixtures install from signed AMO XPIs end to end (EXT-09 path); where the live
  shell cannot reach AMO, the scenario reports pending — never
  `installTemporaryAddon` as a substitute proof (unsigned local install proves
  nothing about the signed end-to-end path).

### `verify-platform.sh` (registry)

**Analog:** itself quick/live append blocks (30-PATTERNS § registry).

```sh
"extension-actions|node $REPO_ROOT/scripts/verify-extension-actions.mjs"
"extension-actions-self-test|node $REPO_ROOT/scripts/verify-extension-actions.mjs --self-test"
```

- One row per new check; live rows in the live block. No sibling driver (CLAUDE.md).

## Shared Patterns

- **Static binds (D-50):** every new widget/contribution binds at module load in
  `chrome-bar-frontend-module.ts` — copy the :82-108 voice verbatim.
- **Privileged-kind discipline:** state-changing kinds run only from widget event
  handlers; no command id, no key row; classified in `verify-web-tab-bridge.mjs`
  in the same commit (INTERNAL-APIS.md:32-45). `extensionClick`/`extensionPin`/
  `extensionRemove` are STORE kinds (`STORE_KIND_CLASSES`: click/pin/remove
  `privileged`, install-trigger `network` — D-11); `tabsBridge*` arms are
  `webTab*` action kinds (`KIND_CLASSES` `tab-lifecycle`).
- **Copy discipline:** `CHROME_BAR_COPY` + `appSubject()`; `EXPECTED_*` pins move
  in the same commit; `shell-error-copy-no-internals` stays green.
- **Layer policy:** every new menu is a `.pb-chrome-bar-dropdown` portal; no new
  `BLOCKING_LAYER_SELECTOR` entry (overlay z-order pitfall).
- **Brand scan:** stage every new file by explicit path before trusting `--quick`.

## No Analog Found

- `ExtensionPopups` panel anchoring against a Theia-reported rect: no in-tree
  caller; the Phase 37 `PopupNotifications` host is the analog (planned, not landed
  — 38-02 re-checks its contract at execution time).
- AMO web-install trigger from Theia: no in-tree caller; upstream `AddonManager`
  web-install path (`installAddonFromWebpage`, `AddonManager.sys.mjs:2443`) is the
  reference (probe in 38-05 before building on it).
- Sidebar view hosting an extension panel page in Theia: no in-tree caller; the
  `SidePanelHandler` rebind (`chrome-bar-frontend-module.ts:66-67`,
  `side-panel-top-tabs.ts:21-25`) is the extension point (38-04 probes it).
- Per-window extension-command keysets in the shell window: no in-tree caller;
  `ExtensionShortcuts.registerKeysToDocument` (`ExtensionShortcuts.sys.mjs:393-436`)
  is the reference; page-focus scoping follows the Phase 27 key table
  (`powerbrowser.js:304-399`) and the 2026-10-20 Firefox-keys ruling (38-04).

## Metadata

**Analog search scope:** `powerbrowser/shell`, `theia/extensions/chrome-bar/src/browser`,
`theia/extensions/tab-uris/src/browser`, `scripts/verify-*.mjs`
**Files scanned:** ~30
