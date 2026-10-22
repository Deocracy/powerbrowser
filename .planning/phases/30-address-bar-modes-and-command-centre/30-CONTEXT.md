# Phase 30: Address-Bar Modes and Command Centre - Context

**Gathered:** 2026-10-21
**Status:** Ready for UI spec (`/gsd-ui-phase 30`); both defaults decided by Chris 2026-10-21 (D-01, D-02)
**Mode:** `--auto` (Chris's standing autonomous rule: every gray area takes the recommended option, recorded with a one-line reason)

<domain>
## Phase Boundary

The pill gets a modes dropdown at its left end, a mode chip, Firefox's mode tokens and
mode keys, and in Coding it becomes Theia's command centre without losing the address bar
(ROADMAP.md Phase 30; requirements SMODE-01..06).

In scope: the pill's move out of `chrome-bar-widget.tsx` into `address-bar/` with an
`AddressBarModeContribution` point; the dropdown (Command centre, each engine, Bookmarks,
Tabs, History, Actions, Search Settings); the chip and its reset; tokens, Accel+Up/Down,
Alt+Up/Down; Command centre results rendered under the pill from `QuickAccessRegistry`;
the `@`/`:` hand-off; address entry from Command centre.

Not in scope: SMODE-07 (browser actions in Actions mode, and the requirement row "Command
centre never sends typed text to a search engine") is Phase 33, where the actions exist.
Routing Ctrl+P, F1, Ctrl+Shift+P and Ctrl+O into the pill is deferred (SUMMARY.md).
Data-driven custom modes are out of scope (FEATURES.md header).

</domain>

<decisions>
## Implementation Decisions

### Recorded rulings that apply (REQUIREMENTS.md header, ROADMAP Phase 30, research picks)
- Coding default = Command centre. Decided by Chris 2026-10-20; not re-opened here.
- Browsing and Organising defaults are chosen by Chris from visual mockups in the UI spec (D-01, D-02 below).
- Research D1: Command centre renders `QuickAccessRegistry` picks inline in the pill's dropdown and hands only `@` and `:` to Theia's stock quick input. Fallback if probe 7 fails: `QuickInputService.open`, accepting that the page hides.
- Research D7: actions that open UI are commands; actions that change state run only from that UI's event handlers, never as command ids (Phase 27 privileged-kind rule).
- Firefox keys that clash with Theia take the browser meaning only while a web page has focus (KEY ruling 2026-10-20); KEY-04 keeps Theia's Ctrl+K in non-web tabs.
- Chrome-bar copy reads the configured application name, never a hard-coded brand (BAR-14 carries forward).
- Hard rule 1: no Theia core patch; `@theia/*` consumed as dependencies only (`scripts/diff-theia-core.sh`).

### Chris's decisions (2026-10-21, chosen from 30-MOCKUPS.html)
- **D-01: Browsing default mode = Address and search (option A).** Chris, 2026-10-21, from the mockups.
- **D-02: Organising default mode = Tabs (option A).** Chris, 2026-10-21, from the mockups.
- **D-03:** The per-PowerBrowser-mode default lives in one table keyed by mode id, so Chris's answer is a one-row change and nothing is hard-coded before he answers. Reason: lets planning and the split proceed without guessing the two values.

### Pill split and contribution point
- **D-04:** The pill moves into `theia/extensions/chrome-bar/src/browser/address-bar/` as the first plan, behaviour-preserving, with every Phase 29 gate (`verify-address-bar-rows`, `verify-chrome-bar-suggestions`, `verify-address-bar-live`, `verify-web-tab-bridge`, `verify-shell-error-copy`, `verify-chrome-bar-placement`) green before any mode code lands. Reason: ROADMAP note puts the split first; a pure move is verifiable by the existing gates. — **Reversibility:** costly — every script that reads widget or rows paths (11 files under `scripts/`) is re-pointed.
- **D-05:** `address-bar-rows.ts` keeps its pure, import-free shape (Node type-stripping) when it moves; scripts that read it are re-pointed in the same commit. Reason: `verify-address-bar-rows.mjs` imports it directly.
- **D-06:** `AddressBarModeContribution` is a Theia contribution-provider symbol bound statically at module load, with the `AddressBarMode` shape from ARCHITECTURE.md §2 (id, label, iconClass, restrictToken?, provide?), minus `delegate: 'quick-input'` (D1 replaced it). Reason: D-50 rule (a contribution bound after first enumeration is invisible) and research D1.
- **D-07:** Engines are one mode each, generated from Phase 29's `listSearchEngines` reply; no second engine source. Reason: one engine set from `configuration.toml`.

### Dropdown (SMODE-01)
- **D-08:** Entries, top to bottom, as FEATURES SMODE-01: heading "This time search with:", Command centre (own group), separator, one row per engine, separator, Bookmarks, Tabs, History, Actions, separator, Search Settings; first-letter access keys. Reason: Firefox order plus the Coding default on top.
- **D-09:** Search Settings opens Theia's preferences editor on `browser.defaultSearchEngine` (Phase 29's setting), not `about:preferences#search`. Reason: needs no `openStockPage` enum (Phase 31) and no URL across the scheme wall.
- **D-10:** The dropdown is a `.pb-chrome-bar-dropdown`-class layer, so it stays under layer-policy rule (a) with no new `BLOCKING_LAYER_SELECTOR` entry. Reason: Phase 27 overlay layer policy.
- **D-11:** Actions mode in this phase lists Theia commands in a "Browser" category that already exist (new tab, focus address, the navigation commands); Phase 33 fills the rest. Reason: SMODE-07 is Phase 33, but the mode row is SMODE-01.

### Chip and lifetime (SMODE-03)
- **D-12:** The mode button is the pill's leftmost element, before the lock; codicons only. Reason: FEATURES SMODE-03; 29-UI-SPEC reserved that slot.
- **D-13:** Address mode shows the default engine's icon with no label; every other mode shows icon plus label chip. In Coding the "Command centre" chip is always shown. Reason: FEATURES SMODE-03, so the Coding pill is not mistaken for an address box.
- **D-14:** The x / one click on the chip, and Backspace at caret 0 with no selection, return to the PowerBrowser mode's default; x shows only when the active mode differs from that default. Reason: SMODE-03 and Firefox behaviour.
- **D-15:** A picked mode lasts until Enter commits, Escape reverts, the active tab changes or the PowerBrowser mode changes, then returns to the default. Reason: Firefox `persistSearchMode = false`; per-tab mode memory is not needed.
- **D-16:** Coding with a web tab active keeps Command centre. Reason: research assumption (SUMMARY Q3); Ctrl+L, Alt+D and F6 are the explicit address keys.
- **D-17:** Custom modes default to Address. Reason: FEATURES SMODE-02; custom modes are not data-driven here.

### Tokens and keys (SMODE-04)
- **D-18:** `* `, `% `, `^ `, `> ` and `@alias ` enter their mode and the token is consumed into the chip; a token without a following space stays text. In Command centre, `>` is Theia commands (text kept) and `@` is the symbol hand-off, per the FEATURES SMODE-06 prefix table; `* `, `% `, `^ ` switch mode in every mode. Reason: Firefox tokens are consumed, Theia prefixes stay, as each product does.
- **D-19:** Accel+Up/Down cycles engines then local modes (Command centre included) and re-runs the query; Alt+Up/Down opens the dropdown; both stop propagation so Theia never sees them. Reason: FEATURES SMODE-05.
- **D-20:** Mode keys are bound only while the pill has focus (`ADDRESS_FOCUSED_CONTEXT_KEY`), so Monaco's Ctrl/Alt+Up/Down are untouched. Reason: KEY-04 and the 2026-10-20 clash ruling.

### Command centre (SMODE-05)
- **D-21:** Picks come from `QuickAccessRegistry.getQuickAccessProvider(prefix).getInstance().getPicks(filter, token)` called from the address-bar mode, with `execute()`/`accept` on Enter or click. Research probe 7 runs first as a spike-free live check (picks for `''`, `>`, `#`, `?`, `edt`, `term`, `task`, `debug`, `view`; `execute()` works). Reason: research D1; calls the providers rather than reimplementing them, so Anti-Pattern 6's drift concern does not apply.
- **D-22:** If probe 7 fails for a prefix, that prefix alone falls back to `QuickInputService.open(text)`. Reason: D1 fallback, scoped to the failing prefix so the rest stays inline.
- **D-23:** `@` and `:` always hand off to `quickInputService.open(text)` (monaco-native, no Theia descriptor). Reason: research D1; they preview inside the editor.
- **D-24:** Command-centre rows show the `QuickPickItem` label, description, detail and keybinding and keep provider separators; the row cap becomes per mode and Command centre scrolls. Reason: FEATURES SMODE-08; the stock quick input scrolls.
- **D-25:** Command centre's placeholder is the active provider's own `placeholder` read from the registry descriptor. Reason: never a hand-kept copy.
- **D-26:** Command centre never calls `searchSuggestions`, never autofills, and shows no engine row and no "Search {engine}" one-off row; a gate asserts the suggestion kind is not sent while the mode is Command centre, derived from the mode table (not a hand-kept list) with a `--self-test` plant. Reason: Pitfall 9 privacy, criterion 4 ("no engine suggestion row"), and it lands SMODE-07's never-search rule early so Phase 33 does not redo it. The SMODE-07 requirement row stays Phase 33's.
- **D-27:** Success criterion 4's "page stays visible" is read as: no centred stock quick-input, the pill keeps text, caret and IME state, and results appear under the pill. The dropdown itself hides the page under layer rule (a) exactly as Phase 29's does (29-UI-SPEC line 249). The UI spec must state this reading; the verifier checks against it. Reason: `.pb-chrome-bar-dropdown` is already in `BLOCKING_LAYER_SELECTOR`, so a literally visible page would need a rule-(a) exception nobody has ratified.

### Address from Command centre (SMODE-06)
- **D-28:** Ctrl+L and Alt+D focus the pill in Address mode with the current URL selected, in every PowerBrowser mode. F6 from outside the pill does the same. F6 inside the pill in Command centre switches to Address mode; in Address mode it keeps Phase 27's pass-to-page meaning. Reason: criterion 5 plus the WR-02 F6 passthrough already bound in `chrome-bar-keybindings.ts`.
- **D-29:** "Go to {url}" is the first, selected row only for unambiguous URLs: a scheme, `localhost[:port]`, `host:port`, an IP, a leading `www.`, or a trailing `/`. The check is a pure function beside `isCanonizable` in the rows module, with a planted-case self-test. Reason: FEATURES SMODE-07 (research numbering); pure so Node can test it, and local so typing in Command centre sends nothing to chrome.
- **D-30:** A bare dotted name (`README.md`, `main.py`) is not a URL in Command centre: file results come first, then a "Go to {text}" row. Reason: `.md` and `.py` are real TLDs and these are file names.
- **D-34 (refines D-29; orchestrator ruling 2026-10-22, reversible by Chris):** In Command centre an undotted `host:port` and a trailing `/` with no scheme are ambiguous, not unambiguous URLs: `Makefile:12` is a file plus line and `src/` is a folder filter. They list the file picks first, then an unhighlighted "Go to {text}" row, as D-30's dotted names do. A scheme, `localhost[:port]`, an IP and a leading `www.` still lead and are highlighted. Tabs, Bookmarks and History keep D-29 unchanged (`devbox:3000` and `x/` are URLs there). Reason: code review WR-01; Enter on `Makefile:12` opened `http://makefile:12/` and sent a DNS lookup for a file name. Reverting is one argument in `gotoRowFor` (`classifyAddress(text, { fileSearch })`).
- **D-31:** Enter on a Go-to row commits through the existing `commitText` path (`resolveTypedAddress`), so the http(s) wall and fixup are Phase 29's. Reason: one commit path.

### Verification
- **D-32:** New checks are rows in `scripts/verify-platform.sh`; live behaviour extends `verify-address-bar-live.mjs` scenarios (modes, tokens, command-centre, go-to) on the Phase 27 live-probe harness. Reason: one driver, one registry (CLAUDE.md).
- **D-33:** The prefix table and dropdown entries are checked by deriving them from the mode contributions and the registry at check time, compared as set equality. Reason: CLAUDE.md "derive from the tree, do not hand-keep".

### Claude's Discretion
Row markup, chip CSS, codicon choice per mode, scrolling list implementation, plan split
and wave order after the D-04 move. The UI spec fixes visual details; plan-phase research
fixes the probe-7 call shape.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope and requirements
- `.planning/ROADMAP.md` Phase 30 — goal, Needs Chris, UI spec, Research, Notes, success criteria 1-5
- `.planning/REQUIREMENTS.md` — SMODE-01..06 (this phase), SMODE-07 (Phase 33), rulings header, KEY-04, Out of Scope rows

### Research
- `.planning/research/SUMMARY.md` — D1 (command centre pick and fallback), D7 (actions split), Phase 3 section, probe 7, Open Question 3 (mode defaults)
- `.planning/research/FEATURES.md` §"The address-bar modes dropdown (SMODE)" — Firefox's switcher at FIREFOX_153_5_0esr and the PowerBrowser spec SMODE-01..08 (research numbering differs from REQUIREMENTS numbering), prefix table
- `.planning/research/ARCHITECTURE.md` §2 "Address bar, modes and search" (`AddressBarMode` shape) and Anti-Pattern 6 (superseded by D1 for rendering)
- `.planning/research/PITFALLS.md` Pitfall 8 (layer policy rules a-d) and Pitfall 9 (command centre hides the page, leaks to the engine)
- `.planning/research/STACK.md` — Theia QuickInput / QuickAccess at the pinned version

### Phase 29 (the pill this phase builds on)
- `.planning/phases/29-address-bar-search-and-fixup/29-CONTEXT.md`
- `.planning/phases/29-address-bar-search-and-fixup/29-UI-SPEC.md` — "Phase 30 boundary" (line 46), layer rule note (line 249), deferred list (line 436)
- `.planning/phases/29-address-bar-search-and-fixup/29-04-SUMMARY.md` — `listSearchEngines`, `browser.defaultSearchEngine`
- `.planning/phases/29-address-bar-search-and-fixup/29-06-SUMMARY.md` — suggestions and one-off strip
- `.planning/phases/29-address-bar-search-and-fixup/29-10-SUMMARY.md` — per-tab drafts, IME guard
- `.planning/phases/29-address-bar-search-and-fixup/deferred-items.md` — live-check flakes (GUI-02 remoteness)

### Design contract
- `.planning/milestones/v1.0-phases/01-platform-extraction-and-rename/01-UI-SPEC.md` — no internal identifier in user-facing copy

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx` (2619 lines): pill render at ~2121 (lock then input; mode button goes before the lock), `renderDropdown()` at ~1951, one-off strip `oneOffEngines()` ~1587, `commitText` ~1412, `engineList`/`listSearchEngines` ~343, `searchSuggestions` call ~996, `ModeService` injected ~189, `MODES` literal ~161.
- `address-bar-rows.ts`: pure `Row`, `composeRows`, `nextHighlight`, `iconFor`, `isCanonizable`, `ROW_LIMIT` — extend for mode rows and the Go-to classifier.
- `chrome-bar-keybindings.ts`: `ADDRESS_FOCUSED_CONTEXT_KEY`, Ctrl+L binding (`!editorFocus && !terminalFocus`), F6 passthrough in the pill.
- `chrome-bar-preferences.ts`: `browser.defaultSearchEngine`, `browser.searchSuggestions`.
- `@theia/core/lib/browser/quick-input/quick-access.d.ts`: `QuickAccessRegistry.getQuickAccessProvider(prefix)`, provider `getPicks(filter, token)`; `@theia/monaco` `MonacoQuickAccessRegistry` filters monaco-native `@`/`:` out.
- `theia/extensions/modes/src/browser/mode-service.ts`: `activateMode`, the mode-change signal for D-15 resets.

### Established Patterns
- Overlay layer policy and `BLOCKING_LAYER_SELECTOR` in `theia/extensions/tab-uris/src/browser/web-tab.ts:108` (dropdown and quick input both hide the page).
- Static contribution binding at module load (D-50); privileged kinds only from widget event handlers.
- Live checks on `scripts/lib/pb-live-probe.mjs`; edits to `powerbrowser/shell/*.js` need `-purgecaches`.

### Integration Points
- `chrome-bar-frontend-module.ts` binds the new contribution point and the built-in modes.
- `scripts/verify-platform.sh` registry rows; 11 scripts read widget/rows paths and move with D-04.

</code_context>

<specifics>
## Specific Ideas

- Chris asked to see examples: the UI spec carries visual mockups of each Browsing and Organising candidate default before planning.
- Typing `?` in Command centre lists the prefixes through Theia's own help provider, so the prefix list is never hand-kept.

</specifics>

<deferred>
## Deferred Ideas

- SMODE-07 browser actions in Actions mode — Phase 33.
- Ctrl+P, F1, Ctrl+Shift+P, Ctrl+O routed into the pill — later milestone (SUMMARY.md).
- Ctrl+K entering default-engine search mode from a web page — not in SMODE-01..06; KEY-04 keeps Theia's Ctrl+K elsewhere. Revisit with Phase 33's menu work if wanted.
- OpenSearch "Add engine" rows; per-tab mode memory; data-driven custom-mode defaults.

</deferred>

---

*Phase: 30-address-bar-modes-and-command-centre*
