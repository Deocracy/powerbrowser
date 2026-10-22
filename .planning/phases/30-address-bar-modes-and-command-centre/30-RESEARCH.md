# Phase 30: Address-Bar Modes and Command Centre - Research

**Researched:** 2026-10-21
**Domain:** Theia 1.76 quick access (`QuickAccessRegistry`, `QuickInputService`) driven from the chrome-bar pill; address-bar modes on the Phase 29 pill and chrome store kinds
**Confidence:** HIGH for the probe-7 call shape (run live this session against the built shell) and every cited source line; MEDIUM for the plan split and the UX refinements marked as recommendations

## Summary

Research probe 7 passed live in this session. From the pill's own focus, outside the quick-input
widget, `QuickAccessRegistry.getQuickAccessProvider(text)` returned a Theia descriptor for `''`,
`>`, `#`, `?`, `edt `, `term `, `task `, `debug ` and `view `. Each `getInstance().getPicks(filter,
token)` returned a plain array. Calling a pick's `execute()` ran the action (a view opened, a
command ran) and no centred quick input appeared. `@`, `@foo`, `:` and `:12` returned no Theia
descriptor. With a workspace open, file search returned `README.md` and `main.py` under a "file
results" separator. The D-22 fallback is therefore needed for no Theia prefix. The `@`/`:` hand-off
condition can be derived: hand off when the registry returns `undefined`. No prefix list needs to
be kept by hand.

The live run and the source reads found five things the plan must handle: (1) `?` help rows'
`execute()` calls `quickInputService.open(prefix)`, which opens the centred widget, so the pill must
handle help rows itself. (2) `>` command rows capture `document.activeElement` when `getPicks` runs
and refocus it before running the command. (3) The file provider's live placeholder carries a
suffix the UI spec does not quote: " (Press Ctrl+P to show/hide excluded files)". (4) Labels can
carry `$(icon)` syntax ("$(plus) Configure a Task"). (5) A `#` pick with no `execute` is an
informational row.

Three parts of the scope need chrome-side or gate work the CONTEXT did not name:

- **`searchPlaces` cannot serve Bookmarks or History mode.** It has no restrict field and returns
  `[]` for empty text, so the zero-query lists need an additive `restrict` field.
- **`@alias` has no aliases to read.** `listSearchEngines` replies with names and icons only.
  Gecko's `engine.aliases` exists, but nothing reads it.
- **Two Phase 29 gates scan only the top level of `chrome-bar/src/browser`.** Moving the pill
  into `address-bar/` would silently remove the moved code from the privileged-caller check and
  the activation-routing check. These are the gates the D-04 move relies on.

**Primary recommendation:** Do the D-04 move first, as its own plan. In that plan, make every
directory scan recursive and re-point every live plant from `get('ChromeBarWidget')` to the new
injectable. Then build Command centre on `getQuickAccessProvider(text)`, with the hand-off decided
by an `undefined` descriptor. Handle help rows in the pill. Classify Go-to rows locally. Never call
`runQuery` while the mode is Command centre.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Recorded rulings that apply (REQUIREMENTS.md header, ROADMAP Phase 30, research picks)**
- Coding default = Command centre. Decided by Chris 2026-10-20; not re-opened here.
- Browsing and Organising defaults are chosen by Chris from visual mockups in the UI spec (D-01, D-02 below).
- Research D1: Command centre renders `QuickAccessRegistry` picks inline in the pill's dropdown and hands only `@` and `:` to Theia's stock quick input. Fallback if probe 7 fails: `QuickInputService.open`, accepting that the page hides.
- Research D7: actions that open UI are commands; actions that change state run only from that UI's event handlers, never as command ids (Phase 27 privileged-kind rule).
- Firefox keys that clash with Theia take the browser meaning only while a web page has focus (KEY ruling 2026-10-20); KEY-04 keeps Theia's Ctrl+K in non-web tabs.
- Chrome-bar copy reads the configured application name, never a hard-coded brand (BAR-14 carries forward).
- Hard rule 1: no Theia core patch; `@theia/*` consumed as dependencies only (`scripts/diff-theia-core.sh`).

**Chris's decisions (2026-10-21, chosen from 30-MOCKUPS.html)**
- **D-01: Browsing default mode = Address and search (option A).** Chris, 2026-10-21, from the mockups.
- **D-02: Organising default mode = Tabs (option A).** Chris, 2026-10-21, from the mockups.
- **D-03:** The per-PowerBrowser-mode default lives in one table keyed by mode id, so Chris's answer is a one-row change and nothing is hard-coded before he answers. Reason: lets planning and the split proceed without guessing the two values.

**Pill split and contribution point**
- **D-04:** The pill moves into `theia/extensions/chrome-bar/src/browser/address-bar/` as the first plan, behaviour-preserving, with every Phase 29 gate (`verify-address-bar-rows`, `verify-chrome-bar-suggestions`, `verify-address-bar-live`, `verify-web-tab-bridge`, `verify-shell-error-copy`, `verify-chrome-bar-placement`) green before any mode code lands. Reason: ROADMAP note puts the split first; a pure move is verifiable by the existing gates. — **Reversibility:** costly — every script that reads widget or rows paths (11 files under `scripts/`) is re-pointed.
- **D-05:** `address-bar-rows.ts` keeps its pure, import-free shape (Node type-stripping) when it moves; scripts that read it are re-pointed in the same commit. Reason: `verify-address-bar-rows.mjs` imports it directly.
- **D-06:** `AddressBarModeContribution` is a Theia contribution-provider symbol bound statically at module load, with the `AddressBarMode` shape from ARCHITECTURE.md §2 (id, label, iconClass, restrictToken?, provide?), minus `delegate: 'quick-input'` (D1 replaced it). Reason: D-50 rule (a contribution bound after first enumeration is invisible) and research D1.
- **D-07:** Engines are one mode each, generated from Phase 29's `listSearchEngines` reply; no second engine source. Reason: one engine set from `configuration.toml`.

**Dropdown (SMODE-01)**
- **D-08:** Entries, top to bottom, as FEATURES SMODE-01: heading "This time search with:", Command centre (own group), separator, one row per engine, separator, Bookmarks, Tabs, History, Actions, separator, Search Settings; first-letter access keys. Reason: Firefox order plus the Coding default on top.
- **D-09:** Search Settings opens Theia's preferences editor on `browser.defaultSearchEngine` (Phase 29's setting), not `about:preferences#search`. Reason: needs no `openStockPage` enum (Phase 31) and no URL across the scheme wall.
- **D-10:** The dropdown is a `.pb-chrome-bar-dropdown`-class layer, so it stays under layer-policy rule (a) with no new `BLOCKING_LAYER_SELECTOR` entry. Reason: Phase 27 overlay layer policy.
- **D-11:** Actions mode in this phase lists Theia commands in a "Browser" category that already exist (new tab, focus address, the navigation commands); Phase 33 fills the rest. Reason: SMODE-07 is Phase 33, but the mode row is SMODE-01.

**Chip and lifetime (SMODE-03)**
- **D-12:** The mode button is the pill's leftmost element, before the lock; codicons only. Reason: FEATURES SMODE-03; 29-UI-SPEC reserved that slot.
- **D-13:** Address mode shows the default engine's icon with no label; every other mode shows icon plus label chip. In Coding the "Command centre" chip is always shown. Reason: FEATURES SMODE-03, so the Coding pill is not mistaken for an address box.
- **D-14:** The x / one click on the chip, and Backspace at caret 0 with no selection, return to the PowerBrowser mode's default; x shows only when the active mode differs from that default. Reason: SMODE-03 and Firefox behaviour.
- **D-15:** A picked mode lasts until Enter commits, Escape reverts, the active tab changes or the PowerBrowser mode changes, then returns to the default. Reason: Firefox `persistSearchMode = false`; per-tab mode memory is not needed.
- **D-16:** Coding with a web tab active keeps Command centre. Reason: research assumption (SUMMARY Q3); Ctrl+L, Alt+D and F6 are the explicit address keys.
- **D-17:** Custom modes default to Address. Reason: FEATURES SMODE-02; custom modes are not data-driven here.

**Tokens and keys (SMODE-04)**
- **D-18:** `* `, `% `, `^ `, `> ` and `@alias ` enter their mode and the token is consumed into the chip; a token without a following space stays text. In Command centre, `>` is Theia commands (text kept) and `@` is the symbol hand-off, per the FEATURES SMODE-06 prefix table; `* `, `% `, `^ ` switch mode in every mode. Reason: Firefox tokens are consumed, Theia prefixes stay, as each product does.
- **D-19:** Accel+Up/Down cycles engines then local modes (Command centre included) and re-runs the query; Alt+Up/Down opens the dropdown; both stop propagation so Theia never sees them. Reason: FEATURES SMODE-05.
- **D-20:** Mode keys are bound only while the pill has focus (`ADDRESS_FOCUSED_CONTEXT_KEY`), so Monaco's Ctrl/Alt+Up/Down are untouched. Reason: KEY-04 and the 2026-10-20 clash ruling.

**Command centre (SMODE-05)**
- **D-21:** Picks come from `QuickAccessRegistry.getQuickAccessProvider(prefix).getInstance().getPicks(filter, token)` called from the address-bar mode, with `execute()`/`accept` on Enter or click. Research probe 7 runs first as a spike-free live check (picks for `''`, `>`, `#`, `?`, `edt`, `term`, `task`, `debug`, `view`; `execute()` works). Reason: research D1; calls the providers rather than reimplementing them, so Anti-Pattern 6's drift concern does not apply.
- **D-22:** If probe 7 fails for a prefix, that prefix alone falls back to `QuickInputService.open(text)`. Reason: D1 fallback, scoped to the failing prefix so the rest stays inline.
- **D-23:** `@` and `:` always hand off to `quickInputService.open(text)` (monaco-native, no Theia descriptor). Reason: research D1; they preview inside the editor.
- **D-24:** Command-centre rows show the `QuickPickItem` label, description, detail and keybinding and keep provider separators; the row cap becomes per mode and Command centre scrolls. Reason: FEATURES SMODE-08; the stock quick input scrolls.
- **D-25:** Command centre's placeholder is the active provider's own `placeholder` read from the registry descriptor. Reason: never a hand-kept copy.
- **D-26:** Command centre never calls `searchSuggestions`, never autofills, and shows no engine row and no "Search {engine}" one-off row; a gate asserts the suggestion kind is not sent while the mode is Command centre, derived from the mode table (not a hand-kept list) with a `--self-test` plant. Reason: Pitfall 9 privacy, criterion 4 ("no engine suggestion row"), and it lands SMODE-07's never-search rule early so Phase 33 does not redo it. The SMODE-07 requirement row stays Phase 33's.
- **D-27:** Success criterion 4's "page stays visible" is read as: no centred stock quick-input, the pill keeps text, caret and IME state, and results appear under the pill. The dropdown itself hides the page under layer rule (a) exactly as Phase 29's does (29-UI-SPEC line 249). The UI spec must state this reading; the verifier checks against it. Reason: `.pb-chrome-bar-dropdown` is already in `BLOCKING_LAYER_SELECTOR`, so a literally visible page would need a rule-(a) exception nobody has ratified.

**Address from Command centre (SMODE-06)**
- **D-28:** Ctrl+L and Alt+D focus the pill in Address mode with the current URL selected, in every PowerBrowser mode. F6 from outside the pill does the same. F6 inside the pill in Command centre switches to Address mode; in Address mode it keeps Phase 27's pass-to-page meaning. Reason: criterion 5 plus the WR-02 F6 passthrough already bound in `chrome-bar-keybindings.ts`.
- **D-29:** "Go to {url}" is the first, selected row only for unambiguous URLs: a scheme, `localhost[:port]`, `host:port`, an IP, a leading `www.`, or a trailing `/`. The check is a pure function beside `isCanonizable` in the rows module, with a planted-case self-test. Reason: FEATURES SMODE-07 (research numbering); pure so Node can test it, and local so typing in Command centre sends nothing to chrome.
- **D-30:** A bare dotted name (`README.md`, `main.py`) is not a URL in Command centre: file results come first, then a "Go to {text}" row. Reason: `.md` and `.py` are real TLDs and these are file names.
- **D-31:** Enter on a Go-to row commits through the existing `commitText` path (`resolveTypedAddress`), so the http(s) wall and fixup are Phase 29's. Reason: one commit path.

**Verification**
- **D-32:** New checks are rows in `scripts/verify-platform.sh`; live behaviour extends `verify-address-bar-live.mjs` scenarios (modes, tokens, command-centre, go-to) on the Phase 27 live-probe harness. Reason: one driver, one registry (CLAUDE.md).
- **D-33:** The prefix table and dropdown entries are checked by deriving them from the mode contributions and the registry at check time, compared as set equality. Reason: CLAUDE.md "derive from the tree, do not hand-keep".

### Claude's Discretion
Row markup, chip CSS, codicon choice per mode, scrolling list implementation, plan split
and wave order after the D-04 move. The UI spec fixes visual details; plan-phase research
fixes the probe-7 call shape.

### Deferred Ideas (OUT OF SCOPE)
- SMODE-07 browser actions in Actions mode — Phase 33.
- Ctrl+P, F1, Ctrl+Shift+P, Ctrl+O routed into the pill — later milestone (SUMMARY.md).
- Ctrl+K entering default-engine search mode from a web page — not in SMODE-01..06; KEY-04 keeps Theia's Ctrl+K elsewhere. Revisit with Phase 33's menu work if wanted.
- OpenSearch "Add engine" rows; per-tab mode memory; data-driven custom-mode defaults.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SMODE-01 | Modes dropdown at the pill's left end listing Command centre, each engine, Bookmarks, Tabs, History, Actions, plus Search Settings | Pattern 2 (mode table + `AddressBarModeContribution`), Pattern 6 (local-mode sources: Tabs from shell widgets, Bookmarks/History via the `searchPlaces` `restrict` field, Actions from a "Browser" category); Search Settings = `CommonCommands.OPEN_PREFERENCES` with `DEFAULT_SEARCH_ENGINE_PREFERENCE` (precedent `openHomeSettings`) |
| SMODE-02 | Coding starts in Command centre; Browsing and Organising in the UI-spec defaults | `DEFAULT_MODE_BY_UI_MODE` table keyed by the lowercased mode ids the widget already uses (`ChromeBarWidget.MODES` + `syncModeFromPerspective`), custom → `address` |
| SMODE-03 | Icon and label chip; one click or Backspace at start returns to the default | Pattern 2; reset hooks are the existing `onCurrentWidgetChanged`, `syncModeFromPerspective`, commit and the Esc restore step |
| SMODE-04 | Tokens `* % ^ > @alias` + space; Accel+Up/Down cycles; Alt+Up/Down opens the dropdown | Pattern 4 (pure token parser; aliases from `listSearchEngines` once it returns `engine.aliases`); passthrough keybindings under `ADDRESS_FOCUSED_CONTEXT_KEY` (F6 precedent) |
| SMODE-05 | Command centre: files, `>`, `#`, `?`, `edt`, `term`, `task`, `debug`, `view` under the pill; `@`/`:` open Theia's pickers | Pattern 3 (probe 7 VERIFIED live; hand-off when the descriptor is undefined; help-row handling; `LabelParser`; keybinding badges via `acceleratorForSequence`) |
| SMODE-06 | Ctrl+L, Alt+D, F6 switch to Address; unambiguous URLs get a "Go to" first row | Pattern 5 (pure `classifyAddress` beside `isCanonizable`; `focusAddressPill` becomes mode-aware; Alt+D handled in the pill keydown since Theia binds no `alt+d`) |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Rule 1:** never fork or patch Theia core. Consume `@theia/*` as dependencies. `scripts/diff-theia-core.sh` is the check. Everything below uses public exports: `QuickAccessRegistry`, `QuickInputService`, `QuickHelpService.PREFIX`, `LabelParser`, `KeybindingRegistry`, `CommonCommands`.
- **Rule 2:** Firefox internals only through `powerbrowser/shell/PowerBrowserAPI.sys.mjs`, with every touchpoint catalogued in `powerbrowser/INTERNAL-APIS.md` (append-only rows). New boundary code goes in an end-of-file section; an existing line changes in place. Run `node scripts/verify-ng-040-internals-catalogue-lines.mjs --fix` after every edit of the boundary file, then `bash scripts/check-internals-boundary.sh --catalogue`.
- **Rule 3:** design for the bridge. `TabUriRegistry`'s exported shape is asserted; this phase does not touch it.
- **Rule 5:** no custom browser chrome beyond the chrome bar. The modes dropdown is inside the chrome bar, which is allowed.
- **Residual-brand scan:** `node scripts/scan-brand-residue.mjs` iterates `git ls-files`, so **stage new `address-bar/` files before trusting a green scan**.
- **Patches are regenerated, never text-edited.** This phase has no patch work.
- **One driver, one registry:** new checks are rows in `scripts/verify-platform.sh`. No sibling driver.
- **Never assert on the absence of a log line** unless a positive control proves the emitter. **Derive expectations from the tree** and compare as set equality, with a `--self-test` that plants faults.
- **User-facing copy:** no internal identifier, product named by `appSubject()`, and every new string goes in `CHROME_BAR_COPY` (pinned by `verify-shell-error-copy.mjs` `EXPECTED_NAV_COPY`).
- **Builds** run in `nix develop .#theia`. Edits to `powerbrowser/shell/*.js` need `-purgecaches`; `withProbeShell` sets `MOZ_PURGE_CACHES=1`. `--quick` is the commit gate.
- **Concurrent sessions on main (memory):** commit by explicit path only. Never `-a`, `--amend`, `git add -A` or stash. Never stage `.planning/state.json`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Mode button, chip, modes dropdown, mode lifetime | Theia frontend (chrome-bar `address-bar/`) | — | Pure UI state inside the pill; no chrome round-trip |
| Mode table and per-PowerBrowser-mode default | Theia frontend (pure module) | — | D-03; Node-testable without a browser |
| Command-centre picks | Theia frontend (`QuickAccessRegistry` providers) | Theia backend (file search over the sidecar's own RPC, as stock Ctrl+P) | Providers are Theia's; the pill only renders and calls `execute()` |
| `@` / `:` pickers | Theia frontend (stock `QuickInputService`) | — | Monaco-native; no Theia descriptor (verified) |
| Go-to classification | Theia frontend (pure `classifyAddress`) | — | Local so Command centre sends nothing to chrome while typing (D-29) |
| Go-to commit, engine-mode search | Chrome (`resolveTypedAddress`, existing kind) | — | One commit path, http(s) wall (D-31) |
| Tabs mode list | Theia frontend (shell `WebTabWidget`s) | — | Open-in-shell tabs, no RPC clamp (backend tab RPC clamps to 8) |
| Bookmarks / History lists | Chrome (`searchPlaces` + `restrict`) | Theia frontend renders | Places lives in chrome; the existing kind returns `[]` for empty text |
| Engine aliases for `@alias` | Chrome (`listSearchEngines` reply) | Theia frontend parses tokens | `engine.aliases` is a Gecko property; frame cannot read it |
| Actions list | Theia frontend (`CommandRegistry`, "Browser" category) | — | D-7/D-11: UI-opening and navigation commands only |
| Search Settings | Theia frontend (`CommonCommands.OPEN_PREFERENCES`) | — | D-09; existing `openHomeSettings` pattern |

## Verified In-Repo Values (verbatim, read this session)

| Value | Source | Verbatim |
|-------|--------|----------|
| Registry interface | `theia/node_modules/@theia/core/lib/browser/quick-input/quick-access.d.ts` (QuickAccessProvider, QuickAccessRegistry) | `getPicks(filter: string, token: CancellationToken): QuickPicks \| Promise<QuickPicks>;` · `getQuickAccessProviders(): QuickAccessProviderDescriptor[];` · `getQuickAccessProvider(prefix: string): QuickAccessProviderDescriptor \| undefined;` · `readonly placeholder?: string;` · `readonly helpEntries: QuickAccessProviderHelp[];` |
| Monaco registry lookup | `theia/node_modules/@theia/monaco/lib/browser/monaco-quick-access-registry.js:74-77` | `getQuickAccessProvider(prefix) { const monacoDescriptor = this.monacoRegistry.getQuickAccessProvider(prefix); return monacoDescriptor ? monacoDescriptor.theiaDescriptor : undefined; }` |
| Monaco prefix match | `theia/node_modules/@theia/monaco-editor-core/esm/vs/platform/quickinput/common/quickAccess.js:48-50` | `const result = prefix ? (this.providers.find(provider => prefix.startsWith(provider.prefix)) \|\| undefined) : undefined;` · `return result \|\| this.defaultProvider;` (providers sorted by decreasing prefix length, :37) |
| Filter derivation (stock) | `.../monaco-editor-core/esm/vs/platform/quickinput/browser/pickerQuickAccess.js:61-63` | `let picksFilter = picker.value.substring(this.prefix.length);` · `picksFilter = picksFilter.trim();` |
| Registry binding | `theia/node_modules/@theia/monaco/lib/browser/monaco-frontend-module.js:149-150` | `bind(quick_access_1.QuickAccessRegistry).toService(monaco_quick_access_registry_1.MonacoQuickAccessRegistry);` |
| QuickPickItem shape | `theia/node_modules/@theia/core/lib/common/quick-pick-service.d.ts:36-50,51-54` | `label: string;` `description?: string;` `detail?: string;` `keySequence?: KeySequence;` `iconClasses?: string[];` `alwaysShow?: boolean;` `highlights?: QuickPickItemHighlights;` `execute?: () => void;` · separator `type: 'separator'; label?: string;` |
| Help rows | `theia/node_modules/@theia/core/lib/browser/quick-input/quick-help-service.js:26,53,58` | `static { this.PREFIX = '?'; }` · `const label = prefix \|\| '…' /* ... */;` · `execute: () => this.quickInputService.open(prefix)` |
| Command rows refocus | `theia/node_modules/@theia/core/lib/browser/quick-input/quick-command-service.js:86,100-101` | `const activeElement = window.document.activeElement;` · `activeElement.focus({ preventScroll: true });` · `this.commandRegistry.executeCommand(command.id);` |
| File placeholder | `theia/node_modules/@theia/file-search/lib/browser/quick-file-open.js:136` | `nls.localizeByDefault('Search files by name (append {0} to go to line or {1} to go to symbol)', ':', '@')` plus the toggle suffix when a keybinding exists |
| File line syntax | `.../file-search/lib/browser/quick-file-open.js:36` | `const LINE_COLON_PATTERN = /\s?[#:\(](?:line )?(\d*)(?:[#:,](\d*))?\)?\s*$/;` |
| Theia keydown phase | `theia/node_modules/@theia/core/lib/browser/keybinding.js:528` | `win.document.addEventListener('keydown', keydown, true);` |
| Top panel not tracked | `theia/node_modules/@theia/core/lib/browser/shell/application-shell.js:833-835` | `case 'top': this.topPanel.addWidget(widget); break;` |
| Layer selector | `theia/extensions/tab-uris/src/browser/web-tab.ts:108` | `const BLOCKING_LAYER_SELECTOR = '.pb-chrome-bar-dropdown, .quick-input-widget, .lm-Widget.dialogOverlay, .lm-Menu, .lm-mod-drag-image';` |
| Pill context key | `theia/extensions/chrome-bar/src/browser/chrome-bar-keybindings.ts:97` | `export const ADDRESS_FOCUSED_CONTEXT_KEY = 'powerbrowser.addressFocused';` |
| Ctrl+L binding | `.../chrome-bar-keybindings.ts:117-122` | `keybinding: 'ctrlcmd+l',` `when: '!editorFocus && !terminalFocus',` |
| F6 passthrough | `.../chrome-bar-keybindings.ts:129-135` | `for (const keybinding of ['f6', 'shift+f6'])` · `command: KeybindingRegistry.PASSTHROUGH_PSEUDO_COMMAND,` · `when: ADDRESS_FOCUSED_CONTEXT_KEY,` |
| Preferences | `theia/extensions/chrome-bar/src/browser/chrome-bar-preferences.ts:16-17` | `export const DEFAULT_SEARCH_ENGINE_PREFERENCE = 'browser.defaultSearchEngine';` · `export const SEARCH_SUGGESTIONS_PREFERENCE = 'browser.searchSuggestions';` |
| Settings opener | `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx:1256` | `await this.commands.executeCommand(CommonCommands.OPEN_PREFERENCES.id, HOME_PAGE_PREFERENCE);` |
| PowerBrowser modes | `.../chrome-bar-widget.tsx:161` and `:1916` | `static readonly MODES = ['Coding', 'Browsing', 'Organising'];` · `ChromeBarWidget.MODES.find(candidate => candidate.toLowerCase() === id)` |
| Mode-change hook | `.../chrome-bar-widget.tsx:2585-2587` | `this.perspectives.onDidChangePerspective(id => { this.barWidget.syncModeFromPerspective(id); });` |
| One-off heading copy | `theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts:27` | `oneOffLabel: 'This time, search with:',` |
| Rows module | `theia/extensions/chrome-bar/src/browser/address-bar-rows.ts:13,26-28,117-119` | `export type RowSource = 'heuristic' \| 'search' \| 'history' \| 'bookmark' \| 'tab';` · `ENGINE_ROW_LIMIT = 4;` `PLACE_ROW_LIMIT = 5;` `ROW_LIMIT = 10;` · `return /^\s*[^.:\/\s]+(?:\/.*\|\s*)$/i.test(text);` |
| Engine info | `theia/extensions/tab-uris/src/browser/chrome-store-client.ts:87-90` | `export interface SearchEngineInfo { name: string; icon: string \| null; }` |
| Store client calls | `.../chrome-store-client.ts:159-166` | `{ kind: 'searchPlaces', text, limit }` · `resolveTypedAddress(text: string, engineName = '', canonize = false, forceSearch = false)` |
| `searchPlaces` empty text | `powerbrowser/shell/PowerBrowserAPI.sys.mjs:3903-3907` | `async function searchPlaces(text, limit) {` … `if (!needle.trim()) { return []; }` |
| `listSearchEngines` reply | `powerbrowser/shell/PowerBrowserAPI.sys.mjs:4439-4447` | `engines.push({ name: String(engine.name), icon });` · `return { engines, defaultName: def ? String(def.name) : "" };` |
| Gecko aliases | `upstream/toolkit/components/search/SearchEngine.sys.mjs:1210-1215` | `get aliases() { return [ ...(this.getAttr("alias") ? [this.getAttr("alias")] : []), ...this._definedAliases, ]; }` |
| Policy Alias | `upstream/browser/components/enterprisepolicies/schemas/policies-schema.json:1724` | `"Alias": {` |
| Backend tab clamp | `theia/extensions/chrome-bar/src/browser/chrome-bar-suggestion-service.ts:18` | `export const CHROME_SUGGESTION_LIMIT = 8;` |
| Non-recursive gate scans | `scripts/verify-chrome-bar-suggestions.mjs:533,666`; `scripts/verify-web-tab-bridge.mjs:506` | `readdirSync(join(REPO_ROOT, CHROME_BAR_BROWSER_DIR))` · `for (const name of readdirSync(join(REPO_ROOT, dir))) {` |
| Copy gate widget path | `scripts/verify-shell-error-copy.mjs:525` | `const MODES_WIDGET_REL = "theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx";` |
| Commands with no category | `theia/extensions/chrome-bar/src/browser/chrome-bar-commands.ts:25-44` | `label: 'Back',` `label: 'Forward',` `label: 'Reload',` `label: 'New Tab',` (no `category` field anywhere under `theia/extensions/*/src`, grep) |

## Research Probe 7 — Live Result (2026-10-21)

Run against `objdir/dist/bin/powerbrowser` (built 2026-10-18) with the Theia app built 2026-10-21 20:28. It used `withProbeShell` (`MOZ_PURGE_CACHES=1`) and `probe()` from `scripts/lib/pb-relaunch.mjs`, on a fresh profile. The pill `<input>` was focused first. Scripts: `/tmp/nix-shell.C5t9EV/.../scratchpad/probe7.mjs` and `probe7b.mjs`. They are not committed; the planner turns them into the `command-centre` live scenario. [VERIFIED: live run, output quoted]

| Text | Descriptor prefix | Picks (count, separators, sample) |
|------|-------------------|-----------------------------------|
| `''` (no workspace) | `''` | 0 |
| `READ` (workspace open) | `''` | `--file results`, `README.md` (icon `book-icon medium-blue theia-file-icons-js file-icon`, `execute` = function) |
| `main.py` | `''` | `--file results`, `main.py \| src` |
| `README.md:1` | `''` | `--file results`, `README.md` (line syntax accepted) |
| `''` after opening README.md | `''` | 0 (recently-opened comes from navigation history, empty right after one open) |
| `>` | `>` | 168 commands, `execute` = function |
| `>toggle` | `>` | 27, e.g. "Toggle Hidden Files" key `ctrl+i`, "Terminal: Toggle Terminal" key ``ctrl+` `` |
| `#` | `#` | 1: "Type to search for symbols", **no `execute`** |
| `?` | `?` | 8: labels `…`, `#`, `>`, … with descriptions ("Open File", …) |
| `edt ` | `edt ` | `--Main` README.md, `--Bottom` t1 |
| `term ` | `term ` | "bash", "Create New Terminal" (icon `codicon codicon-add`) |
| `task ` | `task ` | separators "configured tasks", "contributed"; label "$(plus) Configure a Task" |
| `debug ` | `debug ` | 0 (no launch configuration) |
| `view ` / `view exp` | `view ` | 19 / "Explorer", "Test Explorer" |
| `edt` (no space) | `''` | file provider (prefix needs its space) |
| `@`, `@foo`, `:`, `:12` | **undefined** | `NO_THEIA_DESCRIPTOR` |

Other observations from the same run:

- `focusAfterPicks: true` and `quickInputVisibleAfterPicks: false`. Calling `getPicks` never moved focus out of the pill and never opened the stock widget.
- The "Explorer" view pick's `execute()` opened the left panel (`leftHiddenBefore: true` → `leftHiddenAfter: false`) and focused the file tree.
- The "View: Toggle Bottom Panel" pick's `execute()` toggled the bottom panel (`true` → `false`). The quick input stayed hidden.
- The help pick `…` `execute()` → `quickInputVisibleAfterHelp: true`. The centred widget opened.
- `QuickInputService.open('@')` → widget visible, its input value `"@"`.
- File-provider placeholder at runtime: `"Search files by name (append : to go to line or @ to go to symbol) (Press Ctrl+P to show/hide excluded files)"`.
- Registered prefixes (from `getQuickAccessProviders()`): `''`, `debug `, `view `, `term `, `task `, `edt `, `>`, `?`, `#`. Only these are reachable inline.
- A fresh profile has no workspace (`workspaceOpened: false`). Setting `location.hash` to a folder and reloading opened it (`WorkspaceService.opened` true after `ready`). The live check needs this step for the file scenarios.

**Conclusion:** D1 inline rendering holds for every Theia prefix. D-22 applies to no prefix today. Keep D-22 as the derived rule "no descriptor → hand off", not as a list of failed prefixes.

## Standard Stack

### Core (all already installed; no new packages)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@theia/core` | 1.76.0 | `QuickAccessRegistry`, `QuickInputService`, `QuickHelpService`, `LabelParser`, `KeybindingRegistry.acceleratorForSequence`, `ContributionProvider`, `CommonCommands.OPEN_PREFERENCES`, `CancellationTokenSource` | The pinned framework; public exports only [VERIFIED: `require` of package.json version and the d.ts files above] |
| `@theia/monaco` | 1.76.0 | Supplies `MonacoQuickAccessRegistry` behind the `QuickAccessRegistry` symbol | Bound by `toService` (monaco-frontend-module.js:150) [VERIFIED] |
| `@theia/monaco-editor-core` | 1.108.201 | The registry's prefix-matching rule | [VERIFIED: package.json] |
| `@theia/file-search` | 1.76.0 | The `''` provider (files, "recently opened", "file results") | Composed in `theia/applications/browser/package.json` [VERIFIED] |
| `@vscode/codicons` | 0.0.45 | Mode glyphs (`compass`, `star-full`, `browser`, `history`, `zap`, `settings-gear`, `chevron-down`, `close`, `search`, `globe`) | Presence checked by the UI spec, 2026-10-21 [CITED: 30-UI-SPEC.md Design System] |
| `p-debounce` | ^2.1.0 (existing pin) | The pill's 150ms debounce, reused for Command-centre queries | In-tree precedent `debouncedQuery` [VERIFIED: chrome-bar package.json] |

Import paths with in-tree precedent:

- `QuickInputService` from `@theia/core/lib/common/quick-pick-service` (as in `modes/src/browser/mode-service.ts:12`).
- `QuickAccessRegistry` and `QuickHelpService` from `@theia/core/lib/browser`. `browser/index.d.ts:17` re-exports `./quick-input`, which exports `quick-access` and `quick-help-service`.
- `CancellationTokenSource` from `@theia/core/lib/common` (`common/index.d.ts:3`).
- `LabelParser` from `@theia/core/lib/browser/label-parser`, bound singleton in `frontend-application-module.js:266`.

[VERIFIED: files read]

`@theia/core` is already a chrome-bar dependency, so the chrome-bar package needs no new dependency. Do not add `@theia/file-search`, `@theia/monaco` or `@theia/preferences` to `chrome-bar/package.json`: the registry symbol and the preferences command id both come from `@theia/core`.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `getQuickAccessProvider(text)` (registry does the prefix match) | Parse the prefix in the pill against a prefix list | A hand-kept list drifts; the registry's longest-prefix rule is the stock one. Rejected. |
| `QuickInputService.open(text)` for all of Command centre | — | Hides the page and leaves the pill (D1 rejected it). Used only for the undefined-descriptor case. |
| Tabs mode via `ChromeBarTabSuggestions` RPC | Shell `WebTabWidget`s, filtered client-side | The RPC clamps to 8 (`CHROME_SUGGESTION_LIMIT`) and reads the store, not the shell. The shell list is exact and unbounded. Use the shell. |
| A new store kind for bookmark/history lists | An optional `restrict` field on the existing `searchPlaces` kind | A new kind needs classification in `verify-web-tab-bridge.mjs` and a new `STORE_REQUEST_KINDS` entry. A field on a read kind does not. Use the field. |

**Installation:** none. No package is added.

## Package Legitimacy Audit

No external package is installed by this phase. Every library above is an existing pin in `theia/yarn.lock`.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (none new) | — | — | — | — | — | — |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
 keystroke in pill <input>
        │
        ▼
 tokenise(text, mode, aliases)  ── "* "/"% "/"^ " ─────────────► set mode Bookmarks/Tabs/History, strip token
        │                         "> " (not CC) / "@alias " ───► set mode Actions / Engine, strip token
        ▼
 active mode? ──────────────────────────────────────────────────────────────────────────────┐
   │ Address / Engine                 │ Tabs / Bookmarks / History / Actions       │ Command centre
   ▼                                  ▼                                            ▼
 Phase 29 runQuery                  local source                       registry.getQuickAccessProvider(text)
 (resolveTypedAddress,              Tabs: shell WebTabWidgets (MRU)       │ undefined ──► quickInputService.open(text)
  searchSuggestions,                Bookmarks/History: searchPlaces       │                (pill keeps text; centred widget)
  autofillOrigin, searchPlaces)       {restrict} (chrome)                 ▼
 engine mode: forceSearch=true      Actions: CommandRegistry "Browser"  getInstance().getPicks(text.slice(prefix.length).trim(), token)
        │                           + classifyAddress → Go-to row         │ (token cancelled on next keystroke)
        │                           + trailing "Search with" row          ▼
        │                                  │                           classifyAddress(text) → Go-to row first / after files
        ▼                                  ▼                              ▼
 ───────────────────── one result dropdown (.pb-chrome-bar-dropdown portal, layer rule a) ─────────────────────
        │ Enter / click
        ├─ Address/Engine/Bookmarks/History/Go-to ─► commitText → resolveTypedAddress (chrome) → web tab
        ├─ Tabs ─► switchToTab (Phase 29)
        ├─ Actions ─► commands.executeCommand(id)
        └─ Command centre ─► help row? set pill text = prefix : pick.execute()
 then: mode returns to DEFAULT_MODE_BY_UI_MODE[current PowerBrowser mode]  (also on Esc-restore, tab change, mode change)
```

### Recommended Project Structure

```
theia/extensions/chrome-bar/src/browser/
├── chrome-bar-widget.tsx          # nav buttons, mode toggle, layout; renders the address bar in the pill slot
├── chrome-bar-keybindings.ts      # + ctrlcmd+up/down, alt+up/down passthrough under ADDRESS_FOCUSED_CONTEXT_KEY
├── chrome-bar-copy.ts             # + every new Phase 30 string (one object, pinned)
└── address-bar/
    ├── address-bar.tsx            # the moved pill (state, query, commit, keys, dropdown) as an injectable
    ├── address-bar-rows.ts        # moved, still import-free; + classifyAddress
    ├── address-bar-mode-table.ts  # import-free: mode ids, DEFAULT_MODE_BY_UI_MODE, tokenise, cycle order
    ├── address-bar-modes.ts       # AddressBarMode + AddressBarModeContribution symbol + built-in contributions
    └── command-centre.ts          # registry calls, pick → row mapping, help-row handling, hand-off
```

### Pattern 1: The D-04 move as one injectable, rendered by the widget

**What:** Move the pill's fields and methods out of `ChromeBarWidget` into an `@injectable() class AddressBar`, bound `toSelf().inSingletonScope()` in `chrome-bar-frontend-module.ts`. `ChromeBarWidget` injects it and renders `this.addressBar.render()` where the pill `<div>` is today, between the Home button and New Tab. The address bar gets its host's `update()` and `renderNow()` through one `attach(host)` call. `renderNow` must stay a synchronous `MessageLoop.sendMessage(host, Widget.Msg.UpdateRequest)`, because the IME guard depends on it (`chrome-bar-widget.tsx` `renderNow` comment).

**What moves:**

- The pill fields: `inputValue`, `rows`, `highlightKey`, drafts, autofill, the failure flags.
- The pill methods: `runQuery`, `textEdited`, `commitText`, `onInputKeyDown`, `renderDropdown`, `renderRow`, one-offs, paste/context menu, the drop handlers, `refreshEngines`, `engineList`.
- `onCurrentWidgetChanged`'s address and draft half.

**What stays in `ChromeBarWidget`:** the nav buttons, the mode toggle (`MODES`, `selectMode`, `syncModeFromPerspective`), and the layout. These are pinned by `verify-mode-toggle-commands.mjs` and `verify-mode-switch-tabs-invariant.mjs` at the widget path.

**Gates re-pointed in the same commit:**

| Script | Change |
|--------|--------|
| `verify-address-bar-rows.mjs:35` | `MODULE_REL` → `address-bar/address-bar-rows.ts` |
| `verify-chrome-bar-suggestions.mjs:390,533,666` | widget file → `address-bar/address-bar.tsx`; **make both `readdirSync` scans recursive** |
| `verify-web-tab-bridge.mjs:107,493,506,536,567` | privileged caller → the new file; **make `readSources` recursive**; reword the failure text |
| `verify-shell-error-copy.mjs:525` | add the `address-bar/` sources to `deriveWidgetCopy`'s inputs |
| `verify-chrome-bar-commands.mjs:35,126,143` | add the address-bar file to the id-const discipline list |
| `verify-chrome-bar-placement.mjs:31` | pill geometry/wiring now in the new file; re-point what it reads |
| `verify-web-tab-live.mjs:119` | re-point |
| `powerbrowser/INTERNAL-APIS.md:40` | prose names the caller file; change in place |

**Live plants:** about 20 plants in `verify-address-bar-live.mjs` re-point from `get('ChromeBarWidget')` to `get('AddressBar')`. They live at lines 791, 861, 922, 1025, 1032, 1112, 1206, 1529, 1579, 1598, 1685, 1698, 1783, 1965, 2086, 2192, 2248, 2300, 2344, 2363 and 2405. `verify-nav-keys-live.mjs:1517` (`addressScope`) re-points too. `:779` (`reloadGuardUntil`, a nav-button field) stays.

`__getByName` finds a class binding by `key.name === 'AddressBar'` (`pb-relaunch.mjs:51-60`), so the class name is the probe name. Keep it stable.

**When to use:** plan 30-01 only. No behaviour change. Its proof is the full Phase 29 gate set: `--quick` plus `address-bar-live` plus its `--self-test`, where every plant must still go red.

### Pattern 2: Mode table + contribution point (D-03, D-06)

```typescript
// address-bar/address-bar-mode-table.ts — import-free (Node type-stripping), like address-bar-rows.ts
export type LocalModeId = 'address' | 'command-centre' | 'bookmarks' | 'tabs' | 'history' | 'actions';
export type ModeId = LocalModeId | `engine:${string}`;
/** D-03: one row per PowerBrowser mode id; custom modes fall back to 'address' (D-17). */
export const DEFAULT_MODE_BY_UI_MODE: { [uiMode: string]: LocalModeId } = {
    coding: 'command-centre',   // Chris 2026-10-20
    browsing: 'address',        // D-01, Chris 2026-10-21
    organising: 'tabs',         // D-02, Chris 2026-10-21
};
export function defaultModeFor(uiMode: string): LocalModeId {
    return DEFAULT_MODE_BY_UI_MODE[uiMode] ?? 'address';
}
/** What a mode may send to chrome while typing; the D-26 gate derives from this. */
export const MODE_SENDS: { [id: string]: { resolve: boolean; suggestions: boolean; autofill: boolean; places: boolean } } = { /* … */ };
```

The keys are the lowercased labels the widget already sends as mode ids. The live run read `body[data-pb-mode]` as `"browsing"` at startup, and `syncModeFromPerspective` lowercases. [VERIFIED: chrome-bar-widget.tsx:1916, live `mode: "browsing"`]

```typescript
// address-bar/address-bar-modes.ts
export interface AddressBarMode {
    id: string;                 // 'engine:<name>' | 'bookmarks' | 'tabs' | 'history' | 'actions' | 'command-centre'
    label: string;
    iconClass: string;
    restrictToken?: string;     // '*' '%' '^' '>'
    provide?(text: string, token: CancellationToken): Promise<Row[]>;
}
export const AddressBarModeContribution = Symbol('AddressBarModeContribution');
// frontend module, at load (D-50):
// bindContributionProvider(bind, AddressBarModeContribution);
// bind(AddressBarModeContribution).toService(BuiltInAddressBarModes);
```

`bindContributionProvider` is the stock helper: `export declare function bindContributionProvider(bindable: Bindable, id: symbol): void;` [VERIFIED: `@theia/core/lib/common/contribution-provider.d.ts:28`]. Engines are not contributions. They are generated per `engineList` reply (D-07).

**Lifetime hooks, all existing:**

- `onCurrentWidgetChanged`: tab change.
- `syncModeFromPerspective`: PowerBrowser mode change. There is no ModeService event. The perspective subscription at `chrome-bar-widget.tsx:2585` is the signal. CONTEXT's pointer to `mode-service.ts` is a mis-reference.
- `commitText` / `chooseRow`: Enter.
- The Esc restore branch in `onInputKeyDown`.

### Pattern 3: Command centre on the registry (probe 7 shape)

```typescript
// address-bar/command-centre.ts (sketch; names are the recommended ones)
const descriptor = this.registry.getQuickAccessProvider(text);
if (!descriptor) {                       // '@' and ':' today — derived, never a list (D-22, D-23)
    this.quickInput.open(text);          // pill keeps its text; centred stock widget
    return;
}
this.cts?.cancel();
const cts = this.cts = new CancellationTokenSource();
const filter = text.substring(descriptor.prefix.length).trim();   // the stock rule, pickerQuickAccess.js:61-63
const picks = await descriptor.getInstance().getPicks(filter, cts.token);
if (cts.token.isCancellationRequested) { return; }
// map: separator → 24px group header; item → row {label, description, detail, keySequence, iconClasses, execute}
// placeholder (D-25): descriptor.placeholder || registry.getQuickAccessProvider('')?.placeholder
```

**Accept rules:**

- **Help rows.** When `descriptor.prefix === QuickHelpService.PREFIX`, the help pick's `label` is the provider prefix, or `'…'` for the empty prefix. Enter sets the pill text to `label === '…' ? '' : label` and re-runs the query. Do not call `execute()`: it opens the centred widget (verified live). The labels come from the registry's own `helpEntries`, so nothing is hand-kept.
- **Rows without `execute`** (the `#` "Type to search for symbols" row) render as message rows. They cannot be highlighted.
- **Every other row:** close the dropdown, reset the mode (D-15), then `pick.execute()`.
- **`>` commands refocus the pill.** A `>` command row refocuses the element that was active when `getPicks` ran, which is the pill (quick-command-service.js:86,100). Commands that move focus themselves (views, terminal) take focus as usual. Recommended: after `execute()`, on the next task, if `document.activeElement` is still the pill input, blur it and activate the shell's `currentWidget`, as VS Code returns to the editor. Top-panel widgets are not tracked, so `shell.currentWidget` and `EditorManager.currentEditor` stay on the editor while the pill has focus (application-shell.js:833-835; in-tree comment chrome-bar-widget.tsx:2251-2252).

**Rendering:**

- Labels go through `LabelParser.parse()`. `LabelIcon` parts become `codicon codicon-<name>` spans, so `"$(plus) Configure a Task"` renders as an icon and text.
- Keybinding badges come from `keybindingRegistry.acceleratorForSequence(pick.keySequence, '+')`.
- `iconClasses` are applied as given. The file-icon theme classes are global CSS, so they work inside the body portal.

**Call discipline:** call `getPicks` only from the debounced Command-centre query, never from `runQuery`. `runQuery` sends `resolveTypedAddress`, `autofillOrigin` and `searchPlaces` to chrome. Command centre must send none of them (D-26).

### Pattern 4: Tokens and keys

- **`tokenise(text, mode, aliases)`** is a pure function in the mode table module. It returns `{ mode, text }` or `null`.
  - `* `, `% ` and `^ ` switch in every mode.
  - `> ` switches to Actions only outside Command centre.
  - `? ` outside Command centre switches to the default-engine mode.
  - `@alias ` switches to that engine outside Command centre.
  - In Command centre every Theia prefix stays in the text.
  - A token without a following space returns `null`.
- **Aliases** need the `listSearchEngines` reply to carry `aliases: engine.aliases` (Gecko `SearchEngine.aliases`, SearchEngine.sys.mjs:1210). `SearchEngineInfo` gains `aliases: string[]`. This tree configures none, so `@alias` stays text in practice. The live check sets `engine.alias = '@one'` on its hermetic engine chrome-side. Adding an `alias` key to `configuration.toml` is **deferred**: it would widen the Phase 29 `SearchEngines` policy emission, whose policy schema does accept `Alias` (policies-schema.json:1724).
- **Keys.** Register `ctrlcmd+up`, `ctrlcmd+down`, `alt+up` and `alt+down` as `KeybindingRegistry.PASSTHROUGH_PSEUDO_COMMAND` with `when: ADDRESS_FOCUSED_CONTEXT_KEY`. This is the WR-02 F6 pattern: it keeps any present or future global Theia binding from firing first in the capture phase (keybinding.js:528), so the pill's React `onKeyDown` gets the key. Handle the keys there with `preventDefault()`. `stopPropagation()` in React alone does not keep Theia from seeing the key, because Theia listens at document capture, before React.
- **Clashes.** The only installed global `ctrlcmd+up`/`ctrlcmd+down` bindings are `ai-chat-ui`'s, scoped `chatInputFocus` / `chatResponseFocus`. No `alt+up`, `alt+down` or `alt+d` binding exists outside Monaco's editor-scoped ones. [VERIFIED: grep over `theia/node_modules/@theia/*/lib`]

### Pattern 5: Go-to classifier and the address keys

```typescript
// address-bar-rows.ts, beside isCanonizable — import-free
export type AddressClass = 'url' | 'ambiguous' | 'text';
export function classifyAddress(raw: string): AddressClass {
    const t = raw.trim();
    if (!t || /\s/.test(t)) return 'text';
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) return 'url';                          // scheme
    if (/^localhost(:\d{1,5})?(\/.*)?$/i.test(t)) return 'url';                     // localhost[:port]
    if (/^\d{1,3}(\.\d{1,3}){3}(:\d{1,5})?(\/.*)?$/.test(t)) return 'url';          // IPv4[:port]
    if (/^\[[0-9a-f:.]+\](:\d{1,5})?(\/.*)?$/i.test(t)) return 'url';               // [IPv6][:port]
    if (/^www\.[^/]+\.[^/]+/i.test(t)) return 'url';                                // leading www.
    if (/^[^./:]+:\d{1,5}(\/.*)?$/.test(t)) return 'url';                           // undotted host:port (devbox:3000)
    if (/\/$/.test(t)) return 'url';                                                // trailing /
    if (/^[^/:]+\.[^/:]+(:\d+)?$/.test(t)) return 'ambiguous';                      // README.md, main.py, main.py:12, example.com:8080
    return 'text';
}
```

- **Command centre:** `url` puts a highlighted "Go to {text}" first. `ambiguous` puts file results first, then an unhighlighted Go-to row (D-30). `text` adds no Go-to row.
- **Tabs, Bookmarks and History** use the same function.
- **Why dotted `host:port` is `ambiguous`:** the file provider reads `main.py:12` as file plus line (`LINE_COLON_PATTERN`, quick-file-open.js:36). If every `host:port` were `url`, `main.py:12` would get a highlighted Go-to row first. This applies D-29's `host:port` to undotted hosts and IPs, and D-30 to dotted names with a port. **[Recommendation, recorded: A3]**
- **Commit:** Enter on a Go-to row calls `commitText(text)` (D-31). In Command centre, pass a `visitOnly` flag so that a `search` reply is treated as `refused` (the commit-failure row). That keeps "Command centre never sends typed text to a search engine" true even if fixup turns odd text into a search. [Recommendation: A4]
- **Address keys:**
  - `focusAddressPill()` (chrome-bar-commands.ts:92) is a DOM-only free function. It is used by the focus command, New Tab, and the four relay rows in `chrome-bar-shortcuts.ts:141-144`. It cannot change mode. Route all of these to one `AddressBar.focusAddress()`: set Address mode, select all, focus. The focus command's `execute` and the relay map call it through DI.
  - **Alt+D in the pill:** no Theia binding exists, so handle it in `onInputKeyDown`.
  - **F6 in the pill:** in a non-Address mode, switch to Address and keep focus. In Address mode, keep the Phase 27 page-focus branch.
  - **Ctrl+L in the pill** already reaches the command, because the pill is not `editorFocus`.

### Pattern 6: Local-mode sources

| Mode | Source | Notes |
|------|--------|-------|
| Tabs | `shell.getWidgets('main')` `WebTabWidget && hasPage`, minus the active one, filtered on title/url | MRU order from an in-memory list updated in the existing `onCurrentWidgetChanged`. The backend RPC clamps to 8 and is store-based, so do not use it here. |
| Bookmarks / History | `store.searchPlaces(text, limit, restrict)` with `restrict: 'bookmark' \| 'history'` | Chrome-side: an end-of-file `searchPlacesRestricted(text, limit, restrict)`. It validates `restrict` against the two literals, allows empty text **only** when restricted, and orders bookmarks by `MAX(b.dateAdded) DESC` and history by `h.last_visit_date DESC` when the text is empty. Keep `SELECT`-only, bound parameters, http(s) only, and the cap. The `case "searchPlaces"` arm changes in place to dispatch on `data.restrict`. Amend INTERNAL-APIS row 57's prose in place: `moz_bookmarks.dateAdded` becomes a new schema dependency. |
| Actions | `commands.commands.filter(c => c.category === BROWSER_CATEGORY && commands.isVisible(c.id) && commands.isEnabled(c.id))` | Add `category: 'Browser'` to `CHROME_BAR_BACK/FORWARD/RELOAD/NEW_TAB`. This changes their palette labels to "Browser: Back" and so on (quick-command-service.js:84), so update `verify-chrome-bar-commands.mjs` `EXPECTED_LABELS` in the same commit. `CHROME_BAR_FOCUS_ADDRESS` stays labelless and out of Actions. |
| Engine | `resolveTypedAddress(text, engine, false, true)` (forceSearch, BAR-05 precedent) and `searchSuggestions(text, engine)` | Existing kinds. The engine mode is the only non-Address mode that sends suggestions. |

### Anti-Patterns to Avoid

- **Keeping a prefix list in the pill.** The registry's longest-prefix match decides, and `undefined` means hand off.
- **Calling `pick.execute()` on `?` help rows.** It opens the centred widget.
- **Running `runQuery` in Command centre.** It sends the typed text to chrome (`resolveTypedAddress`, `autofillOrigin`, `searchPlaces`).
- **Relying on React `stopPropagation` to hide keys from Theia.** Theia dispatches in the capture phase; use passthrough bindings.
- **Leaving gate scans non-recursive after the move.** The privileged-kind and activation checks would pass while seeing no pill code.
- **Hard-coding the file placeholder string from the UI spec.** D-25 reads the descriptor at run time, and the runtime string differs (Pitfall 3).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| File, command, symbol, view, terminal, task and debug search | Own providers | `QuickAccessRegistry` descriptors' `getPicks` | Theia owns them; any extension's provider appears automatically |
| Prefix detection | Regex/prefix table | `getQuickAccessProvider(text)` | Stock longest-prefix rule |
| `@` / `:` symbol and line pickers | Inline symbol list | `QuickInputService.open(text)` | Monaco-native, previews in the editor |
| `$(icon)` label parsing | Regex | `LabelParser.parse` | Stock parser, animation suffix handled |
| Keybinding labels | String formatting | `KeybindingRegistry.acceleratorForSequence` | Platform-correct (Ctrl vs Cmd) |
| Settings editor on one setting | Own panel | `CommonCommands.OPEN_PREFERENCES` + preference id | Existing `openHomeSettings` precedent |
| Cancellation | Sequence counters only | `CancellationTokenSource` per keystroke (plus the existing `querySeq` guard) | File search honours the token server-side |

**Key insight:** every Command-centre behaviour the user sees already exists in a Theia provider. The pill's only own work is rendering, the Go-to row and the hand-off decision.

## Common Pitfalls

### Pitfall 1: Help rows open the centred widget
**What goes wrong:** Enter on a `?` row opens the stock quick input over the page.
**Why it happens:** `execute: () => this.quickInputService.open(prefix)` (quick-help-service.js:58). Verified live: `quickInputVisibleAfterHelp: true`.
**How to avoid:** for the `QuickHelpService.PREFIX` provider, set the pill text to the row's prefix label instead.
**Warning signs:** a `.quick-input-widget` with a non-zero rect after a help-row Enter in the live scenario.

### Pitfall 2: Moved code invisible to the gates
**What goes wrong:** after D-04 the privileged-caller check (`verify-web-tab-bridge.mjs`) and the commit-routing check (`verify-chrome-bar-suggestions.mjs`) stay green while reading no pill code.
**Why it happens:** `readdirSync` without `recursive` at `verify-chrome-bar-suggestions.mjs:533,666` and `verify-web-tab-bridge.mjs:506`.
**How to avoid:** make the scans recursive. Add a self-test plant that puts a privileged call in a file under `address-bar/`; it must go red.
**Warning signs:** a "derived N sources" count that does not grow after the move.

### Pitfall 3: Placeholder literal mismatch
**What goes wrong:** a check or copy line quotes the UI-spec placeholder "Search files by name (append : to go to line or @ to go to symbol)". At run time the descriptor reads `… (Press Ctrl+P to show/hide excluded files)`.
**Why it happens:** `getPlaceHolder()` appends the toggle hint when `quickFileOpen` has a keybinding (quick-file-open.js:135-142). In the pill, Ctrl+P opens the stock widget rather than toggling excluded files.
**How to avoid:** the live check compares the input's placeholder with `registry.getQuickAccessProvider('').placeholder` read at check time, never with a literal. Record the UI-SPEC line-190 discrepancy (Open Question 1).

### Pitfall 4: Focus after a `>` command
**What goes wrong:** after "Format Document" or a similar command, focus sits in the pill rather than the editor.
**Why it happens:** quick-command-service.js:86,100 refocuses the element that was active when `getPicks` ran (the pill).
**How to avoid:** restore `shell.currentWidget` focus after `execute()` when focus did not move (Pattern 3).
**Warning signs:** the live check's `activeElement` after a command is the pill input.

### Pitfall 5: Live plants left on `ChromeBarWidget`
**What goes wrong:** after D-04 a plant like `get('ChromeBarWidget').composing = () => false` patches an object that no longer runs the code, so the scenario stays green under its fault.
**Why it happens:** about 20 instance-replaceable plants in `verify-address-bar-live.mjs` target the widget by name.
**How to avoid:** re-point every one to `get('AddressBar')` in plan 30-01, and run `address-bar-live --self-test`. Every plant must still go red.

### Pitfall 6: Command centre leaks typed text
**What goes wrong:** typing in Command centre sends `resolveTypedAddress`, `autofillOrigin` or `searchPlaces` to chrome, or suggestions to the engine.
**Why it happens:** the Phase 29 `textEdited` → `debouncedQuery` → `runQuery` path runs for every keystroke.
**How to avoid:** dispatch in `textEdited` on the active mode's `MODE_SENDS` row. The D-26 static gate checks two things: the Command-centre row is all-false, and every chrome call in `runQuery` sits behind that row's flag. A `--self-test` plants a `true`. A live scenario wraps `ChromeStoreClient.request` in the page realm, with Address mode as the positive control, and requires zero `resolveTypedAddress`/`searchSuggestions`/`autofillOrigin`/`searchPlaces` requests while typing `hello`, `README` and `localhost:4000` in Command centre.

### Pitfall 7: No workspace in the live profile
**What goes wrong:** file-search scenarios get zero picks and either fail or pass vacuously.
**Why it happens:** a fresh profile opens no workspace (live: `workspaceOpened: false`).
**How to avoid:** before the file scenarios, set `location.hash` to a temp folder holding `README.md` and `src/main.py`, reload, and wait for `ready && WorkspaceService.opened`. This was verified this session. Require at least one "file results" pick as the positive control.

### Pitfall 8: Bookmark and History zero-query lists are impossible today
**What goes wrong:** Bookmarks and History modes open empty on focus.
**Why it happens:** `searchPlaces` returns `[]` for empty text (PowerBrowserAPI.sys.mjs:3906-3907) and has no restrict field.
**How to avoid:** add the `restrict` field (Pattern 6) with `-purgecaches` live proof, then run the catalogue line fix and `--catalogue`.

### Pitfall 9: Catalogue line drift
**What goes wrong:** editing `searchPlaces` or `listSearchEngines` mid-file moves every catalogued line below it.
**How to avoid:** put new code in an end-of-file section. Change existing lines in place (the `case` arm, the `engines.push` line). Run `verify-ng-040-internals-catalogue-lines.mjs --fix`, then `check-internals-boundary.sh --catalogue`.

### Pitfall 10: Copy gate covers only the widget file
**What goes wrong:** placeholders and aria-labels written in `address-bar/*.tsx` escape `deriveWidgetCopy`, which reads only `MODES_WIDGET_REL`.
**How to avoid:** extend its inputs to the address-bar sources in plan 30-01. Every new string goes in `CHROME_BAR_COPY` and in `EXPECTED_NAV_COPY` in the same commit.

### Pitfall 11: Unstaged new files
**What goes wrong:** the brand scan, and any gate that walks `git ls-files`, do not see new `address-bar/` files.
**How to avoid:** stage before running `--quick` (CLAUDE.md).

## Code Examples

### Hand-off decision and filter (from the installed sources)
```typescript
// Source: monaco-quick-access-registry.js:74-77; pickerQuickAccess.js:61-63 (installed)
const d = registry.getQuickAccessProvider(text);       // undefined for '@', ':' (live)
if (!d) { quickInput.open(text); return; }
const picks = await d.getInstance().getPicks(text.substring(d.prefix.length).trim(), cts.token);
```

### Search Settings (D-09)
```typescript
// Source: chrome-bar-widget.tsx:1256 precedent; chrome-bar-preferences.ts:16
await this.commands.executeCommand(CommonCommands.OPEN_PREFERENCES.id, DEFAULT_SEARCH_ENGINE_PREFERENCE);
```

### Pill-scoped mode keys
```typescript
// Source: chrome-bar-keybindings.ts:129-135 (F6 precedent)
for (const keybinding of ['ctrlcmd+up', 'ctrlcmd+down', 'alt+up', 'alt+down']) {
    keybindings.registerKeybinding({ command: KeybindingRegistry.PASSTHROUGH_PSEUDO_COMMAND, keybinding, when: ADDRESS_FOCUSED_CONTEXT_KEY });
}
```

### Live probe body (seed for the `command-centre` scenario)
```javascript
// Source: this session's probe7.mjs, run through probe() from scripts/lib/pb-relaunch.mjs
const reg = get('QuickAccessRegistry');
const d = reg.getQuickAccessProvider('view ');
const picks = await d.getInstance().getPicks('exp', token);
picks.find(p => /Explorer/.test(p.label)).execute();   // left panel opens; no .quick-input-widget rect
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| ARCHITECTURE §2: Command centre = `QuickInputService.open(text)` on the first non-URL keystroke | Inline `getPicks`, hand-off only on an undefined descriptor | Research D1 (2026-10-20), proved by probe 7 (2026-10-21) | Page-hiding stock widget only for `@`/`:` |
| STACK.md: `QuickAccessRegistry` "not for inline rendering" | Usable inline for every Theia descriptor | Probe 7 | STACK row 115 is superseded for rendering |
| CONTEXT code_context: ModeService as the mode-change signal | `PerspectiveService.onDidChangePerspective` → `syncModeFromPerspective` | Read this session | Reset hook is in the widget contribution |

**Deprecated/outdated:** `AddressBarMode.delegate: 'quick-input'` (ARCHITECTURE §2), dropped by D-06.

## Runtime State Inventory

D-04 is a move/refactor, so this section applies to that plan.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None. Pill drafts are a `WeakMap` in memory only ("never stored, pushed or logged", widget field comment). The mode is not persisted (D-15). | None |
| Live service config | None. No external service names the widget or its files. | None |
| OS-registered state | None. | None |
| Secrets/env vars | None. `POWERBROWSER_TOKEN_DISABLE` and `MOZ_PURGE_CACHES` are unaffected. | None |
| Build artifacts | `theia/extensions/chrome-bar/lib/browser/*.js` and the app bundle hold the old module layout until rebuilt; a stale `lib/browser/chrome-bar-widget.js` stays harmless but misleading | `yarn --cwd extensions/chrome-bar build` (tsc -b) and the app `theia build` before any live run; `clean` removes the old `lib/` |
| DI probe names | Live scripts resolve bindings by class name (`__getByName`) | Re-point the plants (Pitfall 5) |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A2 | New Tab should focus the pill in Address mode (it shares `focusAddressPill`) | Pattern 5 | In Coding a new empty tab would show Command centre if Chris wants the default; one-line change |
| A3 | A dotted host with a port (`example.com:8080`) is `ambiguous`, not `url`, so `main.py:12` is never a first-row Go-to | Pattern 5 | Dev URLs on dotted hosts need one ArrowDown in Command centre; the user can confirm or flip one regex line |
| A4 | Command-centre Go-to commits refuse a `search` resolve (`visitOnly`) | Pattern 5 | Without it a fixup-turned-search would send text to the engine from Command centre |
| A5 | After a `>` command that leaves focus in the pill, focus returns to `shell.currentWidget` | Pattern 3 | Cosmetic; VS Code-like either way |
| A6 | Engine aliases come only from Gecko (`engine.aliases`); no `configuration.toml` alias key this phase | Pattern 4 | `@alias` inert in the shipped tree until a downstream configures one |
| A7 | Tabs MRU is an in-memory list fed by `onCurrentWidgetChanged`; tabs never activated this session sort after the rest in tab order | Pattern 6 | Order differs from the store's `last_active` after a restart |

## Open Questions (RESOLVED)

All three are resolved in 30-04-PLAN.md `<objective>` ("Decided (autonomous, recommended; recorded)").

1. **UI-SPEC line 190 quotes the file placeholder without the toggle suffix.**
   - What we know: the runtime placeholder ends "(Press Ctrl+P to show/hide excluded files)". D-25 requires the descriptor's own text.
   - What's unclear: whether Chris wants the suffix shown in the pill, where Ctrl+P opens the stock widget.
   - Recommendation: follow D-25 verbatim (show the descriptor's text). The verifier reads the runtime value. Flag at verify-work; stripping the suffix would be a hand-kept edit that D-25 forbids.
   - RESOLVED (30-04): the placeholder is shown verbatim, suffix included, per D-25; flagged for Chris at verify-work.
2. **`debug ` with no launch configuration returns 0 picks.**
   - What we know: the provider works; the probe profile had no configuration.
   - Recommendation: the live scenario asserts a descriptor exists for `debug ` and that the no-match copy shows. A positive pick needs a `.theia/launch.json` in the temp workspace; add one.
   - RESOLVED (30-04): the live workspace fixture carries `.theia/launch.json`, so `debug ` has a pick.
3. **"Recently opened" zero-query list depends on navigation history.**
   - What we know: after one file open with no cursor move, `''` returned 0 picks.
   - Recommendation: the scenario opens a file, moves the cursor (or opens two files), then asserts a "recently opened" separator. Otherwise it asserts the zero-query empty copy.
   - RESOLVED (30-04): the zero-query list is compared with the provider's own picks for empty text; no "recently opened" header is asserted.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | static gates, live scripts | ✓ | v24.19.0 | — |
| Nix | `nix develop .#theia` / `.#firefox` | ✓ | 2.34.9 | — |
| Built shell `objdir/dist/bin/powerbrowser` | L-tier live rows | ✓ | built 2026-10-18 | needed only if `PowerBrowserAPI.sys.mjs` changes require a repackage; shell JS runs with purgecaches |
| Theia app build (`theia/applications/browser/lib/frontend`) | live rows | ✓ | built 2026-10-21 20:28 (after the last chrome-bar src commit) | rebuild loop in memory `live-gui-debug-loop` |
| Display (KDE Wayland) | live rows open a window | ✓ (probe 7 ran) | — | — |

**Missing dependencies with no fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Plain-node derive-and-compare scripts, plus BiDi live scripts on `scripts/lib/pb-live-probe.mjs`; one driver: `scripts/verify-platform.sh` |
| Config file | The registry inside `scripts/verify-platform.sh` (quick rows around lines 3744-3790; live rows around 5032) |
| Quick run command | `scripts/verify-platform.sh --quick` |
| Full suite command | `scripts/verify-platform.sh` |

Proof tiers (Phase 29 convention): **S** static gate with `--self-test`; **L** live built shell with `-purgecaches`.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| (D-04) | Pill moved; every Phase 29 gate green; scans recursive; plants re-pointed | S + L | `scripts/verify-platform.sh --quick` and `node scripts/verify-address-bar-live.mjs --self-test` | ✅ (re-pointed) |
| SMODE-01 | Dropdown entries derived from contributions + engine list equal the rendered menu (set equality); Search Settings opens the setting | S + L | `node scripts/verify-address-bar-modes.mjs` (+ `--self-test`); `verify-address-bar-live.mjs --scenario modes-dropdown` | ❌ W0 |
| SMODE-02 | Defaults per mode from the table; switching Coding/Browsing/Organising sets Command centre/Address/Tabs | S + L | `verify-address-bar-modes.mjs`; `--scenario mode-defaults` | ❌ W0 |
| SMODE-03 | Chip visibility, x and Backspace reset; lifetime resets on Enter, Esc, tab change, mode change | L | `--scenario mode-chip,mode-lifetime` | ❌ W0 |
| SMODE-04 | Tokens consumed (planted pure cases), `@one ` with the hermetic alias; Ctrl+Up/Down cycle; Alt+Up/Down open; Monaco unaffected | S + L | `verify-address-bar-modes.mjs` (tokenise cases); `--scenario mode-tokens,mode-keys` | ❌ W0 |
| SMODE-05 | Picks under the pill for each registered prefix (derived from `getQuickAccessProviders()`), `execute()` runs, no `.quick-input-widget` rect; `@`/`:` open it; zero chrome requests while typing (positive control in Address) | L + S | `--scenario command-centre,command-centre-handoff,command-centre-privacy`; static D-26 row in `verify-address-bar-modes.mjs` | ❌ W0 |
| SMODE-06 | `classifyAddress` planted cases; Go-to first row and commit; Ctrl+L, Alt+D, F6 to Address from Command centre | S + L | `node scripts/verify-address-bar-rows.mjs` (+ `--self-test`); `--scenario go-to,address-keys` | ✅ rows / ❌ scenarios |
| (chrome) | `searchPlaces` `restrict` and `listSearchEngines` aliases; catalogue current | S + L | `bash scripts/check-internals-boundary.sh --catalogue`; `--scenario local-modes` | ✅ / ❌ |

### Sampling Rate
- **Per task commit:** `scripts/verify-platform.sh --quick`. Stage new files first. After any `PowerBrowserAPI.sys.mjs` edit, run `node scripts/verify-ng-040-internals-catalogue-lines.mjs --fix`, then `bash scripts/check-internals-boundary.sh --catalogue`.
- **Per wave merge:** `--quick`, then a Theia build, then `node scripts/verify-address-bar-live.mjs --scenario <this plan's scenarios>`.
- **Phase gate:** full `scripts/verify-platform.sh` plus `verify-address-bar-live.mjs --self-test` green before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `scripts/verify-address-bar-modes.mjs` (+ `--self-test`) — mode table, defaults, tokenise, cycle order, D-26 `MODE_SENDS` row and call-site guard, dropdown entries derived from the built-in contributions
- [ ] `verify-address-bar-rows.mjs` — `classifyAddress` cases: `https://x`, `localhost`, `localhost:4000`, `devbox:3000`, `127.0.0.1`, `[::1]:8080`, `www.x.com`, `x/` → url; `README.md`, `main.py`, `main.py:12`, `example.com:8080` → ambiguous; `hello`, `hello world` → text
- [ ] `verify-address-bar-live.mjs` scenarios: `modes-dropdown`, `mode-defaults`, `mode-chip`, `mode-lifetime`, `mode-tokens`, `mode-keys`, `command-centre`, `command-centre-handoff`, `command-centre-privacy`, `go-to`, `address-keys`, `local-modes`, plus a workspace fixture (temp folder with `README.md`, `src/main.py`, `.theia/launch.json`)
- [ ] Registry rows in `scripts/verify-platform.sh` for the new script and its self-test (quick block)

## Security Domain

`security_enforcement` is absent from `.planning/config.json`, so it is treated as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Token gate unchanged |
| V3 Session Management | no | — |
| V4 Access Control | yes | Privileged-kind rule: no new privileged store kind. Actions run only UI-opening/navigation commands (D-7). The modes dropdown never calls `removeHistoryEntry` or `readClipboardText`. |
| V5 Input Validation | yes | Chrome validates `restrict` against two literals; text sliced to 256 and bound as a parameter. Aliases cross as bounded strings. Go-to commits keep the http(s) wall. |
| V6 Cryptography | no | — |
| V8 Data Protection | yes | Command centre sends no typed text to chrome or an engine (D-26, gate + live recorder). Typed text reaches only the sidecar's own file search, as stock Ctrl+P does. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Typed file names or commands leaked to a search engine | Information disclosure | `MODE_SENDS` dispatch, static gate with plant, live recorder with positive control |
| A pick label containing markup | Tampering | Render labels as React text nodes and `LabelParser` icon spans only; never `dangerouslySetInnerHTML` (T-29-18 precedent) |
| Widening a Places read into enumeration from an overlay | Information disclosure | `searchPlaces` keeps `storeSenderInShellWindow` and `groupSenderIsTheia`; `restrict` adds no new kind |
| Command execution from Command centre | Elevation | Same commands and enablement as the stock palette; no new command ids; no state-changing kind as a command |

## Sources

### Primary (HIGH confidence)
- Live probe 7 run (this session) on the built shell via `withProbeShell` + `probe()`
- `theia/node_modules/@theia/{core,monaco,monaco-editor-core,file-search,ai-chat-ui,preferences}/lib` — files and lines cited above
- `theia/extensions/{chrome-bar,tab-uris,modes}/src` — files and lines cited above
- `powerbrowser/shell/PowerBrowserAPI.sys.mjs`, `powerbrowser/INTERNAL-APIS.md`
- `upstream/toolkit/components/search/SearchEngine.sys.mjs`, `upstream/browser/components/enterprisepolicies/schemas/policies-schema.json`
- `scripts/verify-*.mjs`, `scripts/lib/pb-live-probe.mjs`, `scripts/lib/pb-relaunch.mjs`, `scripts/verify-platform.sh`

### Secondary (MEDIUM confidence)
- `.planning/research/{SUMMARY,ARCHITECTURE,FEATURES,STACK}.md`; `30-CONTEXT.md`; `30-UI-SPEC.md`; Phase 29 artifacts

### Tertiary (LOW confidence)
- None. No web sources were needed; every API claim was read from the installed tree.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH. No new packages; every export was read in the installed d.ts or js.
- Architecture: HIGH for the probe-7 call shape and the hook points; MEDIUM for the plan split and the recommendations A2-A7 (A1 was verified and removed).
- Pitfalls: HIGH. Each one is tied to a cited line or a live observation.

**Research date:** 2026-10-21
**Valid until:** the next `theia_release` re-pin (re-run probe 7 then); otherwise 30 days

### Suggested plan split (Claude's discretion; strictly sequential waves — every plan edits the same address-bar files and `--quick` reads the whole tree)

1. **30-01:** D-04 move. Gates re-pointed and made recursive; plants re-pointed; copy-gate inputs widened. No behaviour change.
2. **30-02:** Mode table, `AddressBarModeContribution`, mode button and chip, modes dropdown, Search Settings, defaults, lifetime, Backspace/x, mode keys and passthroughs, copy (SMODE-01/02/03, keys of SMODE-04). Adds `verify-address-bar-modes.mjs`.
3. **30-03:** Local and engine modes. Tabs (shell MRU), Bookmarks/History (`restrict`, chrome-side), Actions ("Browser" category), engine modes (forceSearch), tokens, `listSearchEngines` aliases (SMODE-01/04).
4. **30-04:** Command centre. Registry picks, rows, help rows, focus restore, hand-off, placeholder, D-26 gate and live recorder (SMODE-05).
5. **30-05:** `classifyAddress` and the Go-to row in every mode; `focusAddress()` for Ctrl+L, Alt+D, F6 and New Tab; `visitOnly` commit (SMODE-06).
