# Phase 35: Shell Furniture and Page Context Menu - Pattern Map

**Mapped:** 2026-10-22
**Files analyzed:** 22 (new 2 scripts + 1 frontend file, modified 19)
**Analogs found:** 22 / 22 (three receivers use upstream as the analog, listed under No Analog Found)

All analogs below are git-tracked. The file list is the union of the seven plans'
`files_modified` (35-RESEARCH.md "Recommended Project Structure").

## File Classification

Revised 2026-10-22 (planner revision). Line numbers are at commit `3e8d991`; executors grep by
symbol, because Phase 31 is being executed in the working tree at the same time.

| New/Modified File | Plans | Role | Closest Analog | Match Quality |
|---|---|---|---|---|
| `powerbrowser/shell/PowerBrowserAPI.sys.mjs` (installer member, end-of-file Phase 35 section; in place: `webTabOpen`, `webTabGeometry`, `WEB_TAB_ACTION_KINDS`, `handleWebTabAction`) | 02-07 | service (privileged boundary) | the Phase 27 web-tab action section (`:4141-4350`) and the Phase 29 section with its own lazy block (`:4352`) | exact |
| `powerbrowser/shell/powerbrowser.js` (installer call; F11 `PAGE_KEYS` row; stand-in comment) | 01, 02, 07 | bootstrap | itself: `PAGE_KEYS` (`:335-365`), the hovered tracker (`:441-442`), `powerbrowserGetBrowser` (`:114-116`) | exact |
| `powerbrowser/shell/powerbrowser.xhtml` (furniture block, localization and stylesheet links, `disablecontextmenu`) | 02, 03, 06, 07 | markup | upstream `main-popupset.inc.xhtml` and `fullscreen-and-pointerlock.inc.xhtml` (the elements are copied, not imitated) | exact (upstream) |
| `powerbrowser/INTERNAL-APIS.md` | 02-07 | catalogue | existing Touchpoints rows; `--fix` workflow | exact |
| `theia/extensions/chrome-bar/src/browser/page-context-menu.ts` NEW | 03-05 | frontend contribution + menu builder | `openHistoryMenu` (`chrome-bar-widget.tsx:334`, called at `:253` and `:389`): `CompoundMenuNode` of `CommandMenu` children with `run` and no command id, `menus.render({ menuPath, menu, anchor, context, includeAnchorArg, onHide })` | exact |
| `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx` (status line) | 02 | component | itself; the contribution class at `:653-681` already injects `WebTabChannel` | exact (self) |
| `theia/extensions/chrome-bar/src/browser/chrome-bar-shortcuts.ts` (F11 row and action) | 07 | relay | the `newTab` action executing a command (`:131`) | exact (self) |
| `theia/extensions/chrome-bar/src/browser/chrome-bar-frontend-module.ts` | 03 | DI | static binds (D-50) | exact |
| `theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts`, `chrome-bar.css` | 02-04 | copy, style | `CHROME_BAR_COPY.historyReadFailed(appSubject())` (`chrome-bar-copy.ts:14`) | exact |
| `theia/extensions/tab-uris/src/browser/web-tab.ts`, `web-tab.css` | 03-05 | channel, widget | `WebTabMessage` union (`:172-184`), `onPush`/`widgetOf` (`:263-274`), `openInBackground` (`:800-808`) | exact (self) |
| `scripts/verify-shell-furniture.mjs` NEW | 02-07 | static gate | `scripts/verify-shell-gbrowser-standin.mjs` (derive, compare as sets, broken-instrument outcomes, plants) | exact |
| `scripts/verify-page-furniture-live.mjs` NEW | 02-07 | live BiDi | `scripts/verify-nav-keys-live.mjs` (`SCENARIOS` `:1928`, `CONTROL_OF` `:1963`, `PLANTS` `:2029`) on `scripts/lib/pb-live-probe.mjs` | exact |
| `scripts/verify-shell-gbrowser-standin.mjs` | 01 | static gate | itself (`UPSTREAM_SCOPE` `:87`, `deriveCallSiteFiles` `:110`, `objectLiteralMembers` `:218`) | exact (self) |
| `scripts/check-internals-boundary.sh` | 01 | static gate | its Phase 27 shim line (`:81-82`) and plant loop (`:322-342`) | exact (self) |
| `scripts/verify-web-tab-bridge.mjs` | 02, 03, 05, 06 | static gate | rule 9 push parity, rule 4 overlay contract, rule 11 classification | exact (self) |
| `scripts/verify-shell-error-copy.mjs`, `verify-shortcut-relay.mjs`, `verify-page-tools-edit.mjs` | 03, 04, 07 | static gates | `EXPECTED_NAV_COPY` (`:570`), `EXPECTED_SHORTCUT_COPY` (`:639`); relay rule 6 (`:470-482`); Phase 32-06's edit gate | exact (self) |
| `scripts/verify-platform.sh` | 02 | registry | rows `shell-gbrowser-standin` (`:3713`), `nav-keys-live` (`:5031`) | exact |

## Pattern Assignments

### The installer (D-01)
One member appended to the frozen `PowerBrowserAPI` literal (`:389`), `installShellFurniture(window)`,
whose body calls `installShellFurnitureReceivers(window)` at the end of the file. The section header
says why it sits at the end (no catalogued line above it moves), and it has its own lazy-getter
block, as the Phase 29 section does. The Theia frame is `window.powerbrowserGetBrowser()`; pushes use
`sendWebTabPush(theiaBrowser, { kind: "...", ... })` spelled literally (bridge rule 9 parses it).

### Shim globals (D-17)
`window.<Name> = { ... }` object literals in the section, members exactly what upstream calls; the
stand-in gate parses them with `objectLiteralMembers`. Registration of `XULBrowserWindow` copies
`browser-init.js:255-258`. Upstream analogs for the members' bodies: `browser.js:1979-2044`
(XULBrowserWindow), `browser-fullScreenAndPointerLock.js:5-310, 574-849` (fullscreen),
`ContextMenuParent.sys.mjs:190-219` (what the `contentData` accessor must accept).

### Furniture markup
Upstream elements copied with the `xul:`/`html:` prefix the shell's HTML root needs, inside
the `shell furniture: begin` / `shell furniture: end` XML comments:
`<xul:tooltip id="remoteBrowserTooltip"/>`;
`<xul:menupopup id="contentAreaContextMenu" showservicesmenu="true"/>` (no children);
`<xul:panel is="autocomplete-richlistbox-popup" type="autocomplete-richlistbox" id="PopupAutoComplete" role="group" noautofocus="true" hidden="true" overflowpadding="4" norolluponanchor="true" nomaxresults="true" locationspecific="true"/>`
(W6: never a `popup` element); the `invalidFormTemplate` template with its `invalid-form-popup`
panel; the `#fullscreen-warning` subtree. No `<tooltip page="true">` (it serves non-remote browsers
only).

### Page menu (D-02, D-09)
Rows are a frozen `PAGE_MENU_ROWS` table (`id`, `l10n` or `bundle`, `when`, `runs`, or `dynamic`);
labels through `Localization` over `browser/browserContext.ftl` and `toolkit/global/textActions.ftl`.
Picks travel as `webTabContextMenuAction`, routed like every Phase 27 action kind (a Set member and
a `case` arm in `handleWebTabAction`, both in place). The frontend copies `openHistoryMenu`'s render
call; frontend-run rows call existing widget methods (`back`, `forward`, `reload`, `stop`, Phase
32's `edit`, `savePage`, the view-source method) or existing commands (Phase 33's bookmark and
full-screen commands), never a new command id.

### Live checks
Every scenario prints `<name>: PASS|FAIL -- <reason>`; absence scenarios have a `CONTROL_OF` entry;
plants are runtime mutations in their own session (chrome-scope evaluate, Theia-frame evaluate
through `get('<Class>')`, or a pref), each proven applied before its scenario runs. The built
binary reads `powerbrowser/shell/*` through symlinks, so a plant must never edit the tree.

## Shared Patterns

- **One driver:** new checks are appended registry rows; no sibling driver.
- **Derive and compare as sets;** never hand-keep expectation lists; the few hand-kept maps
  (`IDL_SHIMS`, `SHIM_DATA_MEMBERS`, dynamic row kinds, privileged kinds) each carry their reason.
- **Sender walls first** (`groupSenderIsTheia`, `webTabIdIsValid`); tab resolution via
  `widgetOf(tabId)` / `tabIdOfBrowser`; unknown tab dropped.
- **Log discipline:** kind + error text only; no URL, title, selection, clipboard, field value or
  credential in any log line or reply.
- **Copy discipline:** no internal identifier; product name from `appSubject()`; Firefox's own
  strings rendered verbatim.

## No Analog Found

| Item | Reason | Contract used instead |
|------|--------|----------------------|
| `XULBrowserWindow` on a non-browser.xhtml AppWindow | Nothing in the tree registers one | `browser-init.js:255-258` and `browser.js:1979-2044` |
| `FullScreen` / `PointerlockFsWarning` stand-ins | Nothing in the tree | `browser-fullScreenAndPointerLock.js` (ported, with the omissions D-05 lists) |
| `on-build-contextmenu` notify | Nothing in the tree | `nsContextMenu.sys.mjs:140-180` and `ext-menus.js:51-60, 560-572` |

## Metadata

**Analog search scope:** powerbrowser/shell, powerbrowser/INTERNAL-APIS.md, theia/extensions/{chrome-bar,tab-uris}/src, scripts/, scripts/lib, upstream/ at the pinned tag
**Pattern extraction date:** 2026-10-22 (revised the same day)
