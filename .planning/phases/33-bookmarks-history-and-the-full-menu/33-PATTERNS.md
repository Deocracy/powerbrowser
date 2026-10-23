# Phase 33: Bookmarks, History and the Full Menu - Pattern Map

**Mapped:** 2026-10-22
**Files analyzed:** 24 (from 33-CONTEXT.md decisions + code reads)
**Analogs found:** 24 / 24

File list is derived from CONTEXT D-01..D-15 and the Phase 27/29/30 precedents.
All anchors below are git-tracked and grep-verified on 2026-10-22.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `powerbrowser/shell/PowerBrowserAPI.sys.mjs` (new store kinds + bookmark observer push + clearHistory fan-out) | service (privileged boundary) | request-response + event-driven (observer push) | same file, store section `STORE_REQUEST_KINDS` :3697-3713 + `handleStoreRequest` :3743-3814 + 29-09 `removeHistoryEntry` :4623-4629 + 30 `searchPlacesRestricted` :4668-4701 | exact |
| `powerbrowser/INTERNAL-APIS.md` (append-only rows) | doc/catalogue | n/a | same file, append-only rule :26-30, privileged-kind rule :32-45, Phase 29 Places read-write row | exact |
| `theia/extensions/tab-uris/src/browser/chrome-store-client.ts` (same-named methods) | client | request-response | itself :199-207 (`removeHistoryEntry`, `readClipboardText` privileged pair) | exact |
| `theia/extensions/tab-uris/src/browser/tab-store-access-protocol.ts` (DO NOT EDIT) | protocol | n/a | itself :58-65 (`TAB_STORE_RELAY_KINDS` read-only fenced) | exact (fence) |
| `theia/extensions/chrome-bar/src/browser/address-bar/address-bar.tsx` (star button, editor portal, clear-history panel, key branches) | component (injectable) | event-driven | itself (pill, dropdown portal `pb-chrome-bar-dropdown`, `PILL_MENU_PATH` paste-menu pattern; 29-09 Shift+Delete branch `removableRow` + `removeHistoryEntry(`) | exact |
| `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx` (History submenu, bookmarks toolbar row, hamburger entries passthrough) | component | event-driven | itself :231-399 (`openHistoryMenu`, `HISTORY_MENU_PATH`, `onHistoryContextMenu`, hold-to-open, `onHide` focus restore) | exact |
| `theia/extensions/chrome-bar/src/browser/chrome-bar-commands.ts` (new Browser-category commands) | config (commands) | n/a | itself :25-54 (`CHROME_BAR_COMMAND_CATEGORY='Browser'`, `*_COMMAND_ID` consts, `chromeBarHasNavigableTab` enablement) | exact |
| `theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts` (new strings) | config (copy) | n/a | itself (`CHROME_BAR_COPY` frozen + `appSubject()`, `historyLabel`) | exact |
| `theia/extensions/chrome-bar/src/browser/chrome-bar.css` (star, editor, toolbar, panel) | style | n/a | itself (pill/dropdown/chip rules; 30 chip + group-header precedent) | exact |
| `theia/extensions/chrome-bar/src/browser/chrome-bar-preferences.ts` (`browser.showBookmarksToolbar`) | config | n/a | itself :13-33 (`SHOW_HOME_BUTTON_PREFERENCE`, User scope, `CHROME_BAR_COPY` description) | exact |
| `theia/extensions/chrome-bar/src/browser/chrome-bar-frontend-module.ts` (binds) | config (DI) | n/a | itself :83-98 (D-50 static binds, contribution provider) | exact |
| `theia/extensions/chrome-bar/src/browser/chrome-bar-shortcuts.ts` (page-focus relay rows) | utility + contribution | event-driven | itself :36-64 (`PAGE_SHORTCUTS`), :130-155 (`actions` map, tab-only actions, no privileged kinds) | exact |
| `theia/extensions/chrome-bar/src/browser/chrome-bar-keybindings.ts` (Theia-focus rows) | config | event-driven | itself (focus-address `ctrlcmd+l` + ADDRESS_FOCUSED passthrough loop) | exact |
| `powerbrowser/shell/powerbrowser.js` (page-scoped `<key>` rows) | config/bootstrap | event-driven | same file keyset block + 27-PATTERNS "Chrome `<key>` row" idiom (`createXULElement`, `disabled="true"`, focus-tracker clears) | exact |
| `scripts/verify-web-tab-bridge.mjs` (rule 12 new classes) | test (static gate) | transform | itself :434-501 (`checkStoreKinds`, `STORE_KIND_CLASSES`, privileged caller fence, `--self-test` plants :540-569) | exact |
| `scripts/verify-chrome-bar-commands.mjs` (EXPECTED grows) | test (static gate) | derive-compare | itself :60-69 (`EXPECTED_IDS`/`EXPECTED_LABELS` set equality, derived ids :80-96) | exact |
| `scripts/verify-shell-error-copy.mjs` (new copy pins) | test (static gate) | derive-compare | itself :552-594 (`EXPECTED_WIDGET_COPY`, `EXPECTED_NAV_COPY` sets + `appSubject` rule) | exact |
| `scripts/verify-shortcut-relay.mjs` (new rows + parity) | test (static gate) | transform | itself + 27 rule 10 (rows/aria held to table) | exact |
| `scripts/verify-address-bar-live.mjs` (new scenarios) | test (live BiDi) | event-driven | itself (`SCENARIOS` map + `PLANTS` `{plant,target,run,expect}`, `--scenario a,b`, clean-control self-test; 29-09 `shift-del` + `context-menu` scenarios) | exact |
| `scripts/verify-clear-history.mjs` NEW (static gate) | test (static gate) | derive-compare | `scripts/verify-token-cookie-strip.mjs` (literal-equality + install-site + `--self-test` plants) | role-match |
| `scripts/verify-platform.sh` (registry rows) | config (registry) | n/a | itself :3677-3688 (quick pairs), :5042-5043 (live pairs) | exact |

## Pattern Assignments

### `PowerBrowserAPI.sys.mjs` new store kinds (service, request-response + observer push)

**Analog:** the store section :3697-3814 and the 29-09 / Phase 30 end-of-file functions.

- Edit `STORE_REQUEST_KINDS` in place (one member per kind) and add one `case` arm
  per kind in `handleStoreRequest` calling a function defined in a new end-of-file
  `// Phase 33: bookmarks and clear-history` section, so no catalogued line moves:
```js
case "removeHistoryEntry": {
  return { ok: true, kind, removed: await removeHistoryEntry(data.url) };
}
```
- Argument validation copies `storeUrlArg(value)` (non-string/empty/>8192 refused)
  plus kind-specific refusals with `"<function>: refusing ..."` fixed text that never
  echoes a URL, title, guid or path. Bookmark guids keep the 12-char
  `^[A-Za-z0-9_-]{12}$` wall from `listBookmarkFolder` (:4020 — grep-current; the tree moved since RESEARCH cited :3761-3767). Replies carry
  plain strings only (`String(entry.url)` — URL objects do not survive structured
  clone). The catch withholds Places/IOUtils text (29-09 precedent).
- Bookmark writes use only `PlacesUtils.bookmarks.insert/remove/update` and
  `PlacesUtils.history` removals — never raw SQL, never a second writer (ROADMAP
  notes; 29-CONTEXT Places ruling). Bookmark reads reuse `readBookmarkByUrl` /
  `listBookmarkFolder` shapes (`{guid,title,url}`).
- The toolbar refresh is a Places bookmark observer installed once chrome-side
  (next to `installTokenCookieStrip` / `startTabStoreTriggers`) that pushes a
  `bookmarks-changed` state update through the existing push channel; the Theia
  side re-reads `listBookmarkFolder('toolbar')`. No polling loop.
- `clearHistory` is ONE kind fanning out chrome-side to Places history
  (range-bounded), `tabs.sqlite` closed rows (`closed_at` in range; open rows with
  `closed_at IS NULL` never deleted, `pruneClosedTabRows` semantics), thumbnails,
  saved pages and web-tab history — the token cookie exempt by construction (it is
  never enumerated by the fan-out). Time ranges mirror Firefox's set minus
  site-specific rows (last hour / 2 hours / 4 hours / today / everything).
- After every boundary edit run
  `node scripts/verify-ng-040-internals-catalogue-lines.mjs --fix`, then
  `bash scripts/check-internals-boundary.sh --catalogue`, appending Touchpoints rows
  at the END.

### `chrome-store-client.ts` (client)

**Analog:** itself :199-207. One same-named method per privileged kind; `field` for a
single-field read, `request` + `ok` check when refused:
```ts
removeHistoryEntry(url: string): Promise<boolean> {
    return this.field<boolean>({ kind: 'removeHistoryEntry', url }, 'removed');
}
```
Privileged methods are called only from widget event handlers (rule 12 fence checks
`CHROME_BAR_WIDGET` as the one sanctioned caller file — note 30-01 re-pointed the
fence to `address-bar/address-bar.tsx`; this phase's methods live in the pill for
the star/editor and in the widget for the History submenu, so the fence's caller
set must cover exactly those two files and no command/key file).

### `address-bar.tsx` star + editor + clear panel (component, event-driven)

**Analog:** itself — the pill context menu (`PILL_MENU_PATH`), the 29-09 Shift+Delete
branch, the `.pb-chrome-bar-dropdown` portal, dropdown sequence/`dropdownArmed` guards.

- Star: a button at the pill's right end inside the pill, after the input, outline
  `codicon-star-empty` / filled `codicon-star-full`, `aria-label` from copy. Rendered
  from the `readBookmarkByUrl` point-read for the active tab's URL; refreshed on nav
  pushes. Click and Ctrl+D call the toggle kind from the click/keydown handler only.
- Editor: a `.pb-chrome-bar-dropdown` portal anchored to the star (name field, folder
  picker, Remove, Done), same `menus.render`-free inline portal as the pill dropdown
  (not a Theia dialog — overlay layer policy). Focus restore on close mirrors
  `openHistoryMenu`'s `onHide` (`setTimeout` + refocus star).
- Clear-history panel: the same portal primitive, opened from the History submenu row
  and from Ctrl+Shift+Del, with the five range rows; confirm calls `clearHistory`
  from the confirm handler only.
- Privileged calls never get command ids; Ctrl+D / Ctrl+Shift+T / Ctrl+Shift+B /
  Ctrl+Shift+Del Theia-focus bindings invoke the widget/pill handler path (or a
  command whose execute only focuses/opens the UI that owns the handler), never the
  store kind directly — research D7.

### `chrome-bar-widget.tsx` History submenu + toolbar row (component)

**Analog:** itself :231-399. Build a `CompoundMenuNode` per request, `menus.render`
with a module-level `MenuPath` const next to `HISTORY_MENU_PATH`, anchor
`{x:left, y:bottom}`, `onHide` focus restore; `contextmenu` covers right-click,
context-menu key, Shift+F10.

- History submenu: sections Recent pages + Recently closed tabs, fed by
  `searchPlaces` history-restrict rows and closed `tabs.sqlite` rows respectively;
  per-request build (Phase 27 history-menu pattern), never registered. Reopen rows
  run the reopen handler (restore via `shellArmWebTabHistory` path), not a command.
- Toolbar: a collapsible row in the top panel below the pill row, shown in every
  PowerBrowser mode when `browser.showBookmarksToolbar` is true; rows from
  `listBookmarkFolder('toolbar')`, refreshed on the bookmark-observer push.
- Hamburger/MENU-03: entries are filled into the Phase 31 button skeleton in Firefox
  order; each entry runs the same `Browser`-category command id the Actions mode
  lists (single implementation, two surfaces). No new Theia menu contribution beyond
  filling the skeleton.

### `chrome-bar-commands.ts` (Browser-category commands)

**Analog:** itself :25-54. Each MENU-03/Actions entry is one exported
`*_COMMAND_ID` const + `Command` block with `category: CHROME_BAR_COMMAND_CATEGORY`
(`'Browser'`); enablement reads the shared tab predicate
(`chromeBarHasNavigableTab` narrowed by the active tab push) so buttons, menu rows
and Actions rows never disagree. The focus-only command stays labelless; every new
visible command gets a contracted label in `EXPECTED_LABELS` in the same commit.
Call sites import the const, never re-spell the string
(`verify-chrome-bar-commands.mjs` fails a re-spelled literal).

### `chrome-bar-copy.ts` / `chrome-bar.css` / `chrome-bar-preferences.ts`

**Analog:** each file itself.
- Copy: every new sentence in the frozen `CHROME_BAR_COPY` object; subject via
  `appSubject()`; function-valued strings for interpolation. `EXPECTED_NAV_COPY`
  moves in the same commit.
- CSS: structural hooks beside the pill rules (`.pb-chrome-bar-*` + portal class);
  star filled state by class swap, never inline style; no accent chip (30-UI-SPEC).
- Prefs: `browser.showBookmarksToolbar` boolean, default per Firefox (visible),
  `PreferenceScope.User`, description from `CHROME_BAR_COPY`.

### Shortcut relay + keybindings + `powerbrowser.js` key rows

**Analog:** `chrome-bar-shortcuts.ts` + 27-PATTERNS key idioms.
- `PAGE_SHORTCUTS` gains `bookmarkPage` (Ctrl+D), `reopenClosedTab` (Ctrl+Shift+T),
  `toggleBookmarksToolbar` (Ctrl+Shift+B), `clearHistory` (Ctrl+Shift+Del) rows with
  label/macLabel; `actions` maps each id to a tab-scoped or UI-opening closure only
  (no privileged kind, no palette command — T-27-19). `BUTTON_SHORTCUTS` gains the
  star/toolbar rows so tooltips name only bound keys.
- Theia-focus twins in `chrome-bar-keybindings.ts` follow the `ctrlcmd+l` entry
  (imported command const, `ctrlcmd` spelling, `when: '!editorFocus && !terminalFocus'`
  or the address-focused passthrough where the pill owns the key). Page-focus rows
  stay disabled while a Theia widget has focus and vice versa (KEY ruling).
- `powerbrowser.js` page-scoped `<key>` rows copy the 27 idiom (generated from one
  array literal, `disabled="true"` until the overlay focus tracker clears it).

### Gates

**Analog:** each script itself (section above).
- `verify-web-tab-bridge.mjs` rule 12: one `STORE_KIND_CLASSES` entry per new kind
  (`bookmarkPage`/`updateBookmark`/`removeBookmark`/`clearHistory`: `privileged`;
  `listClosedTabs`/`reopenClosedTab`: `read`; `fullScreen`: `window-chrome` per D-14b —
  the command-reachable class for window chrome state (no Places write, no clipboard
  read, no off-machine send), recorded in the gate's rule text and INTERNAL-APIS.md,
  because the `full-screen` command id Actions also runs would trip the privileged
  command-named fence at `:495-497` while `chrome-bar-commands.ts:145-196` is nothing
  but `registerCommand(` calls; `window-chrome` joins `STORE_KIND_CLASS_NAMES` so the
  unknown-class check at `:458-462` accepts it; `verify-shell-gbrowser-standin.mjs`
  needs no edit — verified this session it enumerates only `gBrowser`-receiver members;
  `window.fullScreen` needs no `FORBIDDEN_PATTERNS` exemption — the Phase 27 policy at
  `scripts/check-internals-boundary.sh:61-62` covers only stock-shell shim globals and
  no new global is defined); all of `fullScreen`'s kind+arm+class+method+plant land in
  33-05 — 33-05 `files_modified` therefore carries `chrome-store-client.ts` +
  `verify-web-tab-bridge.mjs` — (the stale rule at `:455-456` fails 33-01's own verify
  otherwise); plants for unclassified / stale / relayed-privileged /
  called-outside / command-named, following :540-569. Push-kind parity: the
  `bookmarks-changed` push's chrome `sendAsyncMessage("PowerBrowserWebTabState")`
  site (shell window's own Theia frame via `findShellWindow()` at
  `PowerBrowserAPI.sys.mjs:1003-1004` → `#powerbrowser-content` at
  `powerbrowser.xhtml:58` / `SHELL_CONTENT_BROWSER_ID` at `:287-288`, because the
  observer fires chrome-side with no actor sender and no
  `actorRef.browsingContext.top.embedderElement` exists to push back through)
  vs the `WebTabChannel.onPush('bookmarks-changed')` subscriber, derived both sides;
  plants for chrome-only-push / missing-subscription.
- `verify-chrome-bar-commands.mjs`: `EXPECTED_IDS`/`EXPECTED_LABELS` grow in the
  same commit as the commands; derivation stays set-equality with the empty-derivation
  failure.
- `verify-shell-error-copy.mjs`: new copy pinned in `EXPECTED_NAV_COPY`; brand-ban
  and interpolation-identifier checks keep covering the new sources (address-bar/
  recursive).
- `verify-shortcut-relay.mjs`: new rows held to the PAGE_SHORTCUTS table; parity
  between `powerbrowser.js` rows and the relay table.
- `verify-address-bar-live.mjs`: new scenarios `bookmark-star`, `bookmark-editor`,
  `bookmark-keys` (created in 33-02 T3's action, W3 — the KEY-ruling both-focus-paths
  row: Ctrl+D Theia-focused + page-focused), `bookmarks-toolbar`, `reopen-closed`,
  `history-menu`, `clear-history` (each with a `PLANTS` fault that must go red naming
  its expect); EXTENDED scenario `command-centre-privacy` (already exists at `:3729`/
  `4560`/`4667` with the Address-mode "hello" control at `:3744-3750` and the `cc-sends`
  plant at `:3751-3755` — extend it in place, never a second scenario); new scenarios
  `app-menu` (with the W4 ROADMAP-parsed entry check), `actions-list` (its "no store
  kind fired" absence needs the same recorder catching a store kind from an action that
  does send one, in the same session, B3-leftover); `-purgecaches`, positive controls,
  no absence assertion without one. Every live task first rebuilds Theia (30-06
  precedent: `yarn --cwd extensions/chrome-bar build && yarn --cwd extensions/tab-uris
  build && theia build --app-target=browser --mode development` under
  `nix develop .#theia`), then `tsc --noEmit -p theia/extensions/chrome-bar`, then the
  `--scenario` run, then `--self-test` — the phase never finishes with success criteria
  unproven live (finding 6).
- NEW `scripts/verify-clear-history.mjs`: static gate deriving the `clearHistory`
  fan-out targets (Places range clear via `PlacesUtils.history.removeVisitsByFilter`
  (`History.sys.mjs:429-448` beginDate/endDate shape) — never `Sanitizer` at all
  (`Sanitizer.sys.mjs:124-133` needs `gDialogBox`, absent in the shell) — + closed-row delete + thumbnails + saved pages
  + web-tab history) from `PowerBrowserAPI.sys.mjs` and the token-cookie exemption
  (fan-out never enumerates the token host); `--self-test` plants a dropped target
  and a token-enumerating fan-out, each going red naming the drift. One registry row
  + self-test twin. Carries the BMK-04 observer-install check (install site beside
  `startTabStoreTriggers`/`installTokenCookieStrip`, `PlacesUtils.observers`-derived
  event names `bookmark-added|removed|moved|url-changed`, single install).
- `verify-platform.sh`: append quick rows for the new gate (+ self-test twin);
  live scenarios ride the existing `address-bar-live` rows.

## Shared Patterns

- **Append-only boundary:** new code at end of file; INTERNAL-APIS rows appended;
  `--fix` after every edit (27 rule).
- **Privileged-kind rule:** state-changing kinds run only from the sanctioned widget/pill
  handler files — `theia/.../address-bar/address-bar.tsx` (pill star/editor/keys) and
  `theia/.../chrome-bar-widget.tsx` (History submenu/toolbar/picker confirm) — through
  same-named client methods; never a command id, key row, or relay entry (27/29 rule;
  29-02 § rule 12; 30-01-T2 named the pill file as the one sanctioned caller).
- **Derive-and-compare + self-test:** every gate derives at check time, compares as
  set equality, fails on empty derivation, and plants faults naming the drift.
- **Copy discipline:** `CHROME_BAR_COPY` + `appSubject()`; no brand or internal
  identifier in text.
- **Recursive scans:** every `chrome-bar/src/browser` scan recurses into
  `address-bar/` (30-01), or the gate is blind.
- **Static binds (D-50):** every bind at module load.
- **Stage before scanning:** `git add` new files before `scan-brand-residue.mjs`.

## No Analog Found

| File | Role | Reason |
|---|---|---|
| Bookmarks toolbar widget/row container | component | No toolbar row exists yet (new surface); build from the strip-home top-panel pattern in `chrome-bar-widget.tsx` + portal/pref patterns above. |
| `clearHistory` range fan-out | boundary | No `removeVisitsByFilter` call exists in-tree; use the upstream `History.sys.mjs:429-448` filter shape per D-09b, fenced behind the one kind. |
| Hamburger skeleton (Phase 31) | component | Assumed from Phase 31; this phase only fills MENU-03 entries into it (see Assumes). |

## Metadata

**Analog search scope:** `powerbrowser/shell`, `powerbrowser/INTERNAL-APIS.md`, `theia/extensions/{chrome-bar,tab-uris}/src/browser`, `theia/extensions/chrome-bar/src/browser/address-bar`, `scripts/`
**Files scanned:** ~24
