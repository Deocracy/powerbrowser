---
phase: 30-address-bar-modes-and-command-centre
verified: 2026-10-23T01:47:48Z
status: human_needed
score: 52/55 must-haves verified
covered_files:
  - .planning/phases/30-address-bar-modes-and-command-centre/30-01-PLAN.md
  - .planning/phases/30-address-bar-modes-and-command-centre/30-01-SUMMARY.md
  - .planning/phases/30-address-bar-modes-and-command-centre/30-02-PLAN.md
  - .planning/phases/30-address-bar-modes-and-command-centre/30-02-SUMMARY.md
  - .planning/phases/30-address-bar-modes-and-command-centre/30-03-PLAN.md
  - .planning/phases/30-address-bar-modes-and-command-centre/30-03-SUMMARY.md
  - .planning/phases/30-address-bar-modes-and-command-centre/30-04-PLAN.md
  - .planning/phases/30-address-bar-modes-and-command-centre/30-04-SUMMARY.md
  - .planning/phases/30-address-bar-modes-and-command-centre/30-05-PLAN.md
  - .planning/phases/30-address-bar-modes-and-command-centre/30-05-SUMMARY.md
  - .planning/phases/30-address-bar-modes-and-command-centre/30-06-PLAN.md
  - .planning/phases/30-address-bar-modes-and-command-centre/30-06-SUMMARY.md
  - powerbrowser/INTERNAL-APIS.md
  - powerbrowser/shell/PowerBrowserAPI.sys.mjs
  - scripts/verify-address-bar-live.mjs
  - scripts/verify-address-bar-modes.mjs
  - scripts/verify-address-bar-rows.mjs
  - scripts/verify-chrome-bar-commands.mjs
  - scripts/verify-chrome-bar-suggestions.mjs
  - scripts/verify-nav-keys-live.mjs
  - scripts/verify-platform.sh
  - scripts/verify-shell-error-copy.mjs
  - scripts/verify-web-tab-bridge.mjs
  - scripts/verify-web-tab-live.mjs
  - theia/extensions/chrome-bar/src/browser/address-bar/address-bar-mode-table.ts
  - theia/extensions/chrome-bar/src/browser/address-bar/address-bar-modes.ts
  - theia/extensions/chrome-bar/src/browser/address-bar/address-bar-rows.ts
  - theia/extensions/chrome-bar/src/browser/address-bar/address-bar.tsx
  - theia/extensions/chrome-bar/src/browser/address-bar/command-centre.ts
  - theia/extensions/chrome-bar/src/browser/chrome-bar-commands.ts
  - theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts
  - theia/extensions/chrome-bar/src/browser/chrome-bar-frontend-module.ts
  - theia/extensions/chrome-bar/src/browser/chrome-bar-keybindings.ts
  - theia/extensions/chrome-bar/src/browser/chrome-bar-shortcuts.ts
  - theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx
  - theia/extensions/chrome-bar/src/browser/chrome-bar.css
  - theia/extensions/tab-uris/src/browser/chrome-store-client.ts
covered_digest: "v3:sha256:208e20d9011c393bf3a94b17db0406a1b8fcb7b548b571175f08deb501815000"
behavior_unverified: 1
overrides_applied: 0
behavior_unverified_items:
  - truth: "Enter, Alt+Enter and Ctrl+Enter with typed text in Bookmarks or History, pressed inside the debounce, settle the list and act on its first actionable row, never on the typed text (REVIEW WR-02, 2e3cdbd)"
    test: "In Browsing, pick Bookmarks (then History), type a word that matches a seeded bookmark (visit) and press Enter within 150 ms; repeat with Alt+Enter and Ctrl+Enter; then type a word that matches nothing and press Enter"
    expected: "Each key opens the matching row (Alt+Enter in a new tab); with no match, the highlighted 'Search with {engine}' row runs; the typed text is never sent to chrome's resolve as an address and Ctrl+Enter never canonizes it"
    why_human: "command-centre-privacy drives the debounce Enter only in the all-false MODE_SENDS modes (Command centre, Tabs, Actions). Bookmarks and History send searchPlaces, so they are outside that loop. The static guard (verify-address-bar-modes, plant 'guard narrowed to Command centre') proves the code shape, not the runtime path. 30-REVIEW-FIX.md marks WR-02 'requires human verification'"
human_verification:
  - test: "Real typing and a real IME (fcitx or ibus) on KDE Wayland: type each token (* % ^ > ? @alias followed by a space), Backspace at the start of a non-default mode, Ctrl+Up/Down and Alt+Up/Down in the pill and in an editor, and compose CJK text in Command centre and in Tabs; also press Ctrl+L and Alt+D in Organising (Tabs mode) and from the Explorer"
    expected: "Each behaves as the 30-UI-SPEC keyboard summary says; no mode change or commit while composing; Ctrl+L and Alt+D from Organising and from the Explorer put the pill in Address mode with the address selected"
    why_human: "Live scenarios press keys through nsITextInputProcessor and BiDi at the parent. address-keys drives the address keys in Coding only, and nav-keys-live's 'Ctrl+L outside an editor' checks focus, not the mode. focusAddress() sets Address with no mode branch, so the path is the same, but no test drives Organising or a non-editor widget"
  - test: "Visual: KWin raise + spectacle in Coding, Browsing and Organising: the mode button and chevron, each chip (Command centre, an engine, Tabs) with and without the x, the modes menu, Command-centre rows with icons, descriptions, detail lines, keybinding badges and group headers, and the Tabs zero-query list; compare with 30-MOCKUPS.html"
    expected: "Matches 30-UI-SPEC and the mockups Chris chose (D-01 option A, D-02 option A)"
    why_human: "30-VALIDATION Manual-Only row 1; the gates read DOM and strings, not pixels"
  - test: "Placeholder copy (30-VALIDATION Manual-Only row 2, REVIEW IN-05): in Coding, focus the pill and read the placeholder"
    expected: "Chris decides whether the suffix '(Press Ctrl+P to show/hide excluded files)' may stay. In the pill Ctrl+P opens Theia's stock picker, so the suffix names an affordance the pill does not have"
    why_human: "Copy judgement for Chris; the placeholder is read from the file provider at run time (D-25)"
  - test: "Confirm or revert D-34 (orchestrator ruling 2026-10-22, refines D-29): in Command centre, type devbox:3000, example.com:8080, Makefile:12 and src/"
    expected: "Under D-34 each lists file picks first and then an unhighlighted 'Go to' row. localhost[:port], an IP, a scheme and a leading www. still lead with a highlighted Go-to row. Roadmap SC5 and SMODE-06 name 'host:port' as unambiguous; D-34 narrows that clause in Command centre to localhost and IP forms. Reverting is one argument in gotoRowFor (classifyAddress(text, { files }))"
    why_human: "A ruling made by the orchestrator, not Chris; it narrows a roadmap criterion. Measured: classifyAddress('devbox:3000', { files: true }) is 'ambiguous', without files it is 'url'"
  - test: "Review fixes not driven live (WR-02 in Bookmarks and History): see behavior_unverified_items"
    expected: "Each expected result holds"
    why_human: "No automated scenario covers them"
  - test: "@alias in the shipped tree (30-RESEARCH A6, REVIEW IN-01): in a packaged build, type @ and then @<alias> x"
    expected: "Chris accepts that @alias does nothing out of the box (the configuration.toml engines carry no Gecko alias, and no alias key was added), and that a user keyword without a leading @ (such as g) can never be typed as a token"
    why_human: "SC3's @alias works live with an alias set chrome-side on a hermetic engine (mode-tokens); the shipped engine set has none, which A6 records as intended. That is a product decision, not a code check"
  - test: "Judgment-tier prohibitions (3, listed in the report): non-authoritative LLM verdicts, human review recommended"
    expected: "Each verdict is confirmed or rejected"
    why_human: "Judgment-tier prohibitions get a non-authoritative verdict only"
---

# Phase 30: Address-Bar Modes and Command Centre Verification Report

**Phase Goal:** The pill has a modes dropdown, and in Coding it is Theia's command centre without losing the address bar
**Verified:** 2026-10-23T01:47:48Z
**Status:** human_needed
**Re-verification:** No (initial verification)

## Evidence I produced myself (not taken from summaries)

- The Theia bundle `theia/applications/browser/lib/frontend/bundle.js` (16:45:48 local) is newer than every file under `theia/extensions/*/src` (the last extension commit, 87083c3, is 16:45:06). No extension source was modified in the working tree. I did not rebuild. The harness sets `MOZ_PURGE_CACHES=1`, so the live runs executed the committed `PowerBrowserAPI.sys.mjs`.
- HEAD moved during the run from 87538fb to 38586fc. That commit, from another session, adds only `30-SECURITY.md`. No code changed under my runs.
- `scripts/verify-platform.sh --quick`: **exit 0**, "all checks passed", 148 summary rows PASS, none FAIL or SKIP. The phase rows are all green: address-bar-modes (21 cases) and its self-test, address-bar-rows (49 cases over the moved `address-bar/address-bar-rows.ts`) and its self-test, gui06-chrome-bar-suggestions, gui06-chrome-bar-commands and gui06-chrome-bar-placement (each with a self-test), gui02-web-tab-bridge and its self-test, shell-error-copy-no-internals and its self-test, internals-boundary, internals-catalogue, ng-040-internals-catalogue-lines, gui04-registry-shape, scan-brand-residue (385 files), chrome-bar-typecheck and tab-uris-typecheck.
- `node scripts/verify-address-bar-modes.mjs --self-test`: **exit 0**. The clean tree is green (21 cases) and all **17** plants went red as named. They include `browsing set to history` (the D-01 value), `organising row removed`, `command-centre suggestions flag set true`, `the runQuery guard removed`, the four CR-01/WR-02 Enter-guard plants and `a resolve call added to command-centre.ts`.
- `node scripts/verify-address-bar-live.mjs` (all 30 scenarios), five full runs between 00:53Z and 01:18Z:
  - Run 1: 29/30. address-keys was red with "broken instrument: the page could not be focused before F6". Ctrl+L and Alt+D from the page had passed before that step.
  - Runs 2 and 3: 29/30. Both were red on the known context-menu step "after Paste & Go chrome's focus must be in the tab's page".
  - Runs 4 and 5: **exit 0, 30/30 PASS**.

  `--scenario search,address-keys` alone went red once (the same broken-instrument step) and passed twice.
- `node scripts/verify-address-bar-live.mjs --self-test` (01:18Z to 01:43Z): **all 34 plants went red** on their target scenario with the named text. The 20 plants added in Phase 30 are among them: `engine-mode-ignored`, `reset-ignored`, `mode-sticks`, `tabs-lists-active`, `restrict-dropped`, `phantom-history`, `actions-unfiltered`, `picks-dropped`, `help-row-executes`, `cc-sends`, `cc-canonize`, `local-enter-commits`, `cc-cycle-requery`, `default-ignored`, `requery-repaints`, `token-kept`, `cycle-off`, `visit-only-off`, `focus-keeps-mode` and `handoff-off`. The run exits 1 for one reason: the clean control was red on the known context-menu Paste & Go focus step, which the task excludes as a gap. No other clean-control step was red.
- Regressions named by 30-06's last truth: `node scripts/verify-nav-keys-live.mjs` **exit 0, 31/31**; `node scripts/verify-web-tab-live.mjs` **exit 0** (5 mode hops with the tab attached, max alignment delta 0.48 CSS px).
- `gsd-tools verify.artifacts` over all 6 plans: **12/12** artifacts pass. `verify.key-links`: 6/15 pass. In the other 9 the `from:` field names a symbol, which the tool cannot parse, so I checked each one by grep. All 9 are WIRED:
  - `this.addressBar.render()` is at chrome-bar-widget.tsx:606.
  - `syncModeFromPerspective` calls `this.addressBar.uiModeChanged(id)` (:526, :538).
  - The searchPlaces arm dispatches on `data.restrict` to `searchPlacesRestricted` (PowerBrowserAPI.sys.mjs:3807, :4719).
  - `runQuery` and `textEdited` return on `!this.modeSends().resolve` (address-bar.tsx:807, :1106).
  - `textEdited` calls `tokenise(` (:1146).
  - `listSearchEngines` pushes `aliases`, at most 8, each at most 64 characters (:4474).
  - `setAddressFocus(() => this.focusAddress())` (address-bar.tsx:235) feeds `focusAddressPill` (chrome-bar-commands.ts:105-125).
  - The Go-to row runs `this.commitText(text, { visitOnly: true })` (address-bar.tsx:507), and `refusesSearch` rejects a search reply (:1546).
- `git -C upstream diff` is empty. The phase diff (f66e2e7~1..HEAD, 25 files outside `.planning/`) touches only `powerbrowser/`, `scripts/` and `theia/extensions/`. No Theia core file is touched, no `@theia/*` package is vendored, and no Gecko file outside the patch stack is touched.
- `classifyAddress`, imported under Node type stripping, returns:

  | Input | Command centre (`files: true`) | Tabs |
  |-------|--------------------------------|------|
  | `localhost:4000` | url | url |
  | `192.168.1.10:8080` | url | url |
  | `[::1]:8080` | url | url |
  | `www.example.com` | url | url |
  | `devbox:3000` | ambiguous | url |
  | `src/` | ambiguous | url |
  | `Makefile:12` | ambiguous | url |
  | `example.com:8080` | ambiguous | ambiguous |
  | `README.md` | ambiguous | ambiguous |
  | `hello` | text | text |
- No PowerBrowser was running before I started. Every instance was launched by a harness and exited.

**Absence-assertion rule (CLAUDE.md).** I relied on these "nothing sent" assertions: command-centre-privacy (no resolve, suggest, autofill or Places kind, no engine GET), mode-keys (Theia does not see the key) and go-to (no GET on /one/search). Each has a positive control that the same observer sees in the same session:
- command-centre-privacy: in Address mode, "hello" records a resolveTypedAddress and the served engine sees a suggest GET. In Command centre each Enter must choose the README.md pick.
- mode-keys: Alt+Up in the README.md editor swaps two lines.
- go-to: Enter on localhost:<port>/dev GETs /dev and pushes state.

In my self-test, the plants `cc-sends`, `cc-canonize`, `local-enter-commits` and `cc-cycle-requery` each turned the privacy scenario red.

## Goal Achievement

### Roadmap Success Criteria (the contract)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC1 | Dropdown at the pill's left end lists Command centre, each engine, Bookmarks, Tabs, History, Actions and Search Settings; the active mode shows as an icon and label chip; one click on the chip or Backspace at the start returns to the default | ✓ VERIFIED | Live: modes-dropdown (the mode button is the pill's first child; the heading and item order are derived at check time from the contributions, `listSearchEngines` and Search Settings; picking Probe Engine Two GETs /two/search only), mode-chip (the x with "hello" typed returns to Address with the text kept and the query re-run; Search Settings opens Settings on the default-engine preference), mode-defaults (Backspace at the start returns to the default with the old list closed, WR-03). Plants `engine-mode-ignored`, `reset-ignored` and `requery-repaints` went red |
| SC2 | Coding starts in Command centre; Browsing and Organising start in the UI-spec defaults | ✓ VERIFIED | `DEFAULT_MODE_BY_UI_MODE = { coding: 'command-centre', browsing: 'address', organising: 'tabs' }` (address-bar-mode-table.ts:43-47) matches D-01 and D-02. `defaultModeFor` is the only reader (key link). Live mode-defaults imports the table and clicks each toggle segment: Coding shows the Command centre chip with no x and the provider placeholder, Browsing shows Address with no chip, and Organising shows the Tabs chip with an empty pill and "Search tabs". A custom mode resolves to Address, and Coding keeps Command centre with a web tab current (D-16). The live plant `default-ignored` and the modes-gate plant `browsing set to history` went red |
| SC3 | `*`, `%`, `^`, `>` or `@alias` followed by a space enters that mode; Accel+Up/Down cycles; Alt+Up/Down opens the dropdown | ✓ VERIFIED | Live mode-tokens: `* `, `% al`, `^ `, `> ` and `? x` enter their modes with the token consumed, `*x` stays text, and `@two hello` enters Probe Engine Two and Enter GETs /two/search. In Command centre `> ` stays as text and `% ` enters Tabs. Live mode-keys: Ctrl+Down steps through the derived `cycleOrder` and wraps, Ctrl+Up steps back, Alt+Down opens the menu, and in the editor Monaco still swaps lines on Alt+Up/Down. The shipped engines carry no alias (A6), so `@alias` is inert out of the box. That is a human decision item |
| SC4 | In Command centre, file search, `>` commands and the `#`, `?`, `edt`, `term`, `task`, `debug`, `view` prefixes show Theia's results under the pill while the page stays visible, with no engine suggestion row; `@` and `:` open Theia's pickers | ✓ VERIFIED (against the D-27 reading, 30-UI-SPEC line 424) | Live command-centre: for every prefix the page realm's registry lists (derived), the rows equal the provider's own `getPicks`. "READ" lists README.md, and `view exp` opens Explorer with no centred quick input. The `?` help row puts its prefix in the pill, and `debug` lists the fixture launch config. command-centre-handoff: `@` and `:12` open the centred quick input and the pill keeps its text. command-centre-privacy: no engine row and no suggest GET. Code: `command-centre.ts` calls `registry.getQuickAccessProvider(text)` and then `getInstance().getPicks(filter, token)`. It imports no store client |
| SC5 | From Command centre, Ctrl+L, Alt+D and F6 switch to address mode; an unambiguous URL (scheme, localhost, host:port, IP) gets a "Go to" first row | ? UNCERTAIN, human decision (not counted) | Keys ✓: address-keys (from the page, Ctrl+L, Alt+D and F6 each give Address with the address selected; in the pill F6 switches to Address and a second F6 focuses the page; in the editor the keys keep Theia's meaning; plant `focus-keeps-mode` red). Go-to ✓ for scheme, localhost and IP: go-to (localhost:<port>/dev gets a first, highlighted row and loads; a resolve stubbed to a search shows the failure row and sends no GET). **host:port ✗ by design:** under D-34 an undotted `host:port` (`devbox:3000`) in Command centre gets an unhighlighted Go-to row after the picks, and a dotted one (`example.com:8080`) was never first under D-30. D-34 is an orchestrator ruling that narrows this criterion, so it needs Chris's confirmation |

### Plan must-have truths (merged; roadmap wording kept where a plan truth restates an SC)

| Plan | Truths | Status | Evidence |
|------|--------|--------|----------|
| 30-01 | 6 (pill moved as injectable `AddressBar`, rows module moved import-free, recursive gate scans with nested plants, copy and command-id gates read address-bar/, live plants re-pointed, nothing visible changes) | 6/6 ✓ | `export class AddressBar` at address-bar/address-bar.tsx. `bind(AddressBar).toSelf().inSingletonScope()` (frontend module :84). The rows gate imports the new path (49 cases). The suggestions and bridge self-tests (nested plants) are green in --quick. All 18 Phase 29 scenarios pass in runs 4 and 5, and nav-keys-live and web-tab-live pass |
| 30-02 | 9 (mode button first, dropdown order and empty groups, engine modes, x reset, lifetime, Search Settings, one default table, `.pb-chrome-bar-dropdown` portal, --quick rows) | 9/9 ✓ | modes-dropdown, mode-chip, mode-lifetime (after Enter, after the second Esc, on a tab change, on Organising and on Browsing, plant `mode-sticks` red), mode-defaults. `address-bar-modes` and `address-bar-modes-self-test` are registered and green. `bindContributionProvider(bind, AddressBarModeContribution)` (:86) |
| 30-03 | 8 (Tabs MRU without the active tab, Bookmarks and History through restricted searchPlaces, Shift+Delete in History, trailing search row, Places failure row, Actions Browser category, MODE_SENDS, Organising starts in Tabs) | 8/8 ✓ | local-modes (plants `tabs-lists-active`, `restrict-dropped`, `actions-unfiltered` and `phantom-history` red). Chrome accepts `restrict` only as `bookmark` or `history` (`searchPlacesRestricted`, :4719). Four `bind(AddressBarModeContribution).toService(...)` lines (:89-95) |
| 30-04 | 9 (registry-selected provider picks, execute with no centred input, registry-derived hand-off, ? help row, row anatomy and scroll, runtime placeholder, D-26 nothing to chrome, focus return, Coding default contributed) | 9/9 ✓ | command-centre, command-centre-handoff, command-centre-privacy. `handsOff(text)` is `descriptorFor(text) === undefined`, with no prefix list. `placeholder()` reads the descriptor. Pill IME state in Command centre is covered only in the real-IME human item |
| 30-05 | 8 (defaults per PowerBrowser mode, D-16, Backspace reset, tokens, Command-centre tokens derived from the registry, Ctrl/Alt+Up/Down, pill-scoped keys, aliases from Gecko only) | 8/8 ✓ | mode-defaults, mode-tokens, mode-keys. `tokenise` and `cycleOrder` are pure (the modes gate imports them). The passthrough for `ctrlcmd+up/down` and `alt+up/down` is in the pill-scoped loop (chrome-bar-keybindings.ts:53). Aliases are bounded on the push line (:4474) |
| 30-06 | 9 (D-29 classifier first row, D-30 dotted names, visit-only commit, pure classifier, same classifier in Tabs/Bookmarks/History, Ctrl+L/Alt+D/F6/New Tab, F6 in the pill, KEY-04 in the editor, everything green together) | 8/9 ✓, 1 ? | go-to, address-keys (Tabs mode `localhost:<port>/sw-a` gets the first Go-to row), rows gate (classifier cases and the `file search ignored` plant). Truth 1 reads "an undotted host:port ... or a trailing /" as unambiguous in Command centre. D-34 reverses that, so the truth is ? UNCERTAIN and merged with SC5's human decision. Truth 9: --quick green, runs 4 and 5 30/30, nav-keys-live 31/31, web-tab-live PASS, 34/34 plants red. The live flakes are recorded below |
| derived | Review fix WR-02 in Bookmarks and History (Enter during the debounce) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | The guard covers every `localMode()`, and the static plant 'guard narrowed to Command centre' is red. The live privacy loop covers only the all-false modes. See behavior_unverified_items |

The other review fixes were driven live and are counted inside the plan truths above:
- CR-01 and IN-03: command-centre-privacy, with `cc-canonize` and `cc-cycle-requery` red.
- WR-02 in Command centre, Tabs and Actions: `local-enter-commits` red.
- WR-03: `requery-repaints` red.
- WR-05: local-modes, with `phantom-history` red.
- WR-01: rows gate cases and the `file search ignored` plant.
- WR-06: internals-catalogue green.

**Score:** 52/55 truths verified (1 present, behavior-unverified; 2 uncertain pending Chris's D-34 decision: SC5 and 30-06 truth 1).

Total = 5 roadmap criteria + 49 plan truths + 1 derived.

**Backstop truths and prohibitions** (30-01, 30-02, 30-03, 30-04, 30-05, 30-06). I count each as VERIFIED because I watched the behaviour in my own runs against the real binary, and a plant aimed at it went red. The scenarios were written by the executor, not held out. The 34 red plants are the evidence that they discriminate.

**This looks intentional.** If Chris accepts D-34, add to this file's frontmatter:

```yaml
overrides:
  - must_have: "From Command centre, Ctrl+L, Alt+D and F6 switch the pill to address mode, and an unambiguous URL (scheme, localhost, host:port, IP) gets a Go to first row"
    reason: "D-34: in Command centre an undotted host:port and a trailing / are file-shaped (Makefile:12, src/), so they list picks first and an unhighlighted Go-to row; localhost and IP host:port still lead"
    accepted_by: "Chris"
    accepted_at: "<ISO timestamp>"
```

### Deferred Items

None. No truth FAILED, so nothing needed matching against later phases. SMODE-07 (Actions-mode browser actions, and the requirement row "Command centre never sends typed text to a search engine") is mapped to Phase 33 and was not in scope. D-26 already enforces the never-search half live.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `theia/extensions/chrome-bar/src/browser/address-bar/address-bar.tsx` | the moved pill as an injectable | ✓ VERIFIED | 2594 lines; every Phase 29 and Phase 30 scenario drives it |
| `theia/extensions/chrome-bar/src/browser/address-bar/address-bar-rows.ts` | pure rows module, `isCanonizable`, `classifyAddress` | ✓ VERIFIED | import-free; rows gate 49 cases, 9 plants |
| `theia/extensions/chrome-bar/src/browser/address-bar/address-bar-mode-table.ts` | ids, LOCAL_MODES, DEFAULT_MODE_BY_UI_MODE, MODE_SENDS, tokenise, cycleOrder | ✓ VERIFIED | modes gate 21 cases, 17 plants |
| `theia/extensions/chrome-bar/src/browser/address-bar/address-bar-modes.ts` | `AddressBarModeContribution` symbol, four built-in modes | ✓ VERIFIED | bound statically at module load |
| `theia/extensions/chrome-bar/src/browser/address-bar/command-centre.ts` | QuickAccessRegistry mode with the hand-off | ✓ VERIFIED | `getQuickAccessProvider(`, `getInstance().getPicks(` |
| `theia/extensions/chrome-bar/src/browser/chrome-bar-keybindings.ts` | pill-scoped mode keys, Alt+D | ✓ VERIFIED | mode-keys, address-keys |
| `theia/extensions/chrome-bar/src/browser/chrome-bar-commands.ts` | `setAddressFocus` | ✓ VERIFIED | address-keys plant `focus-keeps-mode` red |
| `powerbrowser/shell/PowerBrowserAPI.sys.mjs` | `searchPlacesRestricted`, aliases, `firstWebTabLoad` (WR-05) | ✓ VERIFIED | local-modes; boundary and catalogue green |
| `scripts/verify-address-bar-modes.mjs` | static gate with --self-test | ✓ VERIFIED | run by me |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| chrome-bar-widget render | `AddressBar.render` | pill slot | ✓ WIRED (:606) |
| frontend module | `AddressBar`, `AddressBarModeContribution`, five modes | static binds at module load | ✓ WIRED (:84-98) |
| verify-web-tab-bridge | address-bar.tsx | sanctioned privileged caller | ✓ WIRED (tool) |
| `syncModeFromPerspective` | `AddressBar.uiModeChanged` | every PowerBrowser-mode change | ✓ WIRED (live mode-lifetime) |
| address-bar.tsx | `defaultModeFor` | sole default source | ✓ WIRED (tool) |
| chrome-store-client `searchPlaces` | `searchPlacesRestricted` | `data.restrict` dispatch | ✓ WIRED (live local-modes) |
| command-centre.ts | QuickAccessRegistry | `getInstance().getPicks(` | ✓ WIRED (live command-centre) |
| `runQuery` / `textEdited` | MODE_SENDS | `modeSends().resolve` guard | ✓ WIRED (live privacy; plant red) |
| `textEdited` | `tokenise` | leading-token check | ✓ WIRED (live mode-tokens) |
| `listSearchEngines` | `aliases` | bounded push | ✓ WIRED (live mode-tokens reads back @two) |
| `focusAddressPill` | `AddressBar.focusAddress` | `setAddressFocus` setter | ✓ WIRED (live address-keys) |
| Go-to row | `commitText` | `visitOnly` | ✓ WIRED (live go-to stubbed-search step) |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|----------|------|--------|-----------|--------|
| Engine rows in the modes menu | `engineList.engines` | chrome `listSearchEngines` (re-read on menu open) | yes (hermetic engines listed live) | ✓ FLOWING |
| Command-centre rows and placeholder | provider picks, `descriptor.placeholder` | QuickAccessRegistry providers | yes (rows equal `getPicks` per prefix; README.md from the fixture workspace) | ✓ FLOWING |
| Tabs rows | open web tabs, MRU | `shell.mainPanel.onDidChangeCurrent` | yes (live order and the own-tab switch) | ✓ FLOWING |
| Bookmarks and History rows | `searchPlaces` + `restrict` | Places DB | yes (seeded bookmarks and visits, newest first) | ✓ FLOWING |
| Actions rows | Browser-category commands | CommandRegistry | yes (enabled set read live; Back disabled on a one-page tab) | ✓ FLOWING |
| Default mode | `defaultModeFor(uiMode)` | DEFAULT_MODE_BY_UI_MODE | yes (the live check imports the table, no typed default) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Static gate | `scripts/verify-platform.sh --quick` | exit 0, 148/148 PASS | ✓ PASS |
| Modes gate discriminates | `node scripts/verify-address-bar-modes.mjs --self-test` | exit 0, clean green, 17/17 plants red | ✓ PASS |
| All 30 scenarios | `node scripts/verify-address-bar-live.mjs` | runs 4 and 5 exit 0, 30/30; runs 1-3 29/30 (focus flakes, below) | ✓ PASS (flakes noted) |
| Live check discriminates | `node scripts/verify-address-bar-live.mjs --self-test` | 34/34 plants red; clean control red only on the known context-menu Paste & Go step | ✓ PASS (known flake) |
| address-keys alone | `--scenario search,address-keys` ×3 | red once (page-focus precondition), green twice | ⚠️ intermittent instrument |
| NAV/KEY regression | `node scripts/verify-nav-keys-live.mjs` | exit 0, 31/31 | ✓ PASS |
| GUI-02 regression | `node scripts/verify-web-tab-live.mjs` | exit 0 | ✓ PASS |

### Probe Execution

This phase declares no `scripts/*/tests/probe-*.sh`. Research probe 7 (the QuickAccessRegistry call from the pill) is exercised by the command-centre scenario, which I ran in my own process.

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|----------------|-------------|--------|----------|
| SMODE-01 | 01, 02, 03 | Modes dropdown with Command centre, each engine, Bookmarks, Tabs, History, Actions, Search Settings | ✓ SATISFIED | modes-dropdown, local-modes, mode-chip |
| SMODE-02 | 02, 05 | Coding starts in Command centre; Browsing and Organising in the UI-spec defaults | ✓ SATISFIED | mode-defaults; table = D-01 / D-02 |
| SMODE-03 | 02, 05 | Icon and label chip; one click or Backspace at the start returns to the default | ✓ SATISFIED | mode-chip, mode-defaults |
| SMODE-04 | 05 | Tokens and a space; Accel+Up/Down cycle; Alt+Up/Down dropdown | ✓ SATISFIED (mechanism) | mode-tokens, mode-keys; `@alias` inert in the shipped tree is a human decision (A6) |
| SMODE-05 | 04 | Command centre: files, `>`, `#`, `?`, `edt`, `term`, `task`, `debug`, `view` under the pill; `@` and `:` hand off | ✓ SATISFIED | command-centre, command-centre-handoff, command-centre-privacy |
| SMODE-06 | 06 | Ctrl+L, Alt+D, F6 to address mode; Go-to first row for scheme, localhost, host:port, IP | ? NEEDS HUMAN (D-34) | keys and scheme/localhost/IP ✓; host:port narrowed by D-34 |

All six IDs appear in plan frontmatter. REQUIREMENTS.md maps SMODE-07 to Phase 33 and no other ID to Phase 30, so no requirement is orphaned.

### Prohibitions

| # | Plan | Prohibition | Tier | Verdict | Basis |
|---|------|-------------|------|---------|-------|
| 1 | 01 | No behaviour change in the move (D-04) | judgment | holds (LLM, non-authoritative) | all 18 Phase 29 scenarios green after the move and at HEAD |
| 2 | 01 | No gate left scanning only the top level | backstop | ✓ verified | suggestions and bridge self-tests plant in nested files and go red |
| 3 | 02 | No default outside DEFAULT_MODE_BY_UI_MODE | backstop | ✓ verified | `defaultModeFor` is the sole reader; mode-defaults imports the table |
| 4 | 02 | No second engine list | judgment | holds (LLM, non-authoritative) | engine modes are built from `this.engineList` (`listSearchEngines`) only; no engine name literal under address-bar/ |
| 5 | 03 | No new store kind; no state-changing kind as a command | backstop | ✓ verified | `restrict` rides searchPlaces; gui02-web-tab-bridge green |
| 6 | 04 | No prefix list in the pill | judgment | holds (LLM, non-authoritative) | `handsOff` = no descriptor; the only `'@'` literal (address-bar.tsx:1176) is the engine-alias list outside Command centre |
| 7 | 04 | Never call a ? help pick's execute() | backstop | ✓ verified | plant `help-row-executes` red ("a help row opened the centred quick input") |
| 8 | 05 | No global Ctrl/Alt+Up/Down binding | backstop | ✓ verified | mode-keys: Monaco swaps lines on Alt+Up/Down in the editor |
| 9 | 06 | No typed text to chrome to decide a Go-to row | backstop | ✓ verified | command-centre-privacy types `localhost:4000` and records no kind |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (phase diff, 25 files) | — | TBD/FIXME/XXX/TODO/HACK added | none found | — |
| verify-address-bar-live.mjs / pb-live-probe.mjs | address-keys, `focusOverlay` (pb-live-probe.mjs:147) | one unretried `o.focus()` check right after the pill's Esc-Esc; red as "broken instrument" in 2 of 8 runs that included the scenario | ⚠️ Warning | the registered full live row can go red with no product assertion failing; same family as the known Paste & Go focus defect (chrome focus not landing on the overlay) |
| verify-address-bar-live.mjs | context-menu | Paste & Go focus step red in 2 of 5 full runs and in the self-test clean control | ℹ️ Info (known, 29 deferred-items.md) | excluded as a Phase 30 gap per the task |
| address-bar-mode-table.ts | `tokenise` | IN-01: a user keyword without `@` can never be a token | ℹ️ Info | see the A6 human item |
| PowerBrowserAPI.sys.mjs | `searchPlacesRestricted` | IN-02: tag entries count as bookmarks; hidden history pages listed | ℹ️ Info | same as Phase 29's `searchPlaces` |
| verify-address-bar-live.mjs | address-keys editor step | IN-04: no positive that Ctrl+L reached Monaco | ℹ️ Info | nav-keys-live's theia-keeps-keys covers the editor key separately |
| command-centre.ts | `placeholder()` | IN-05: the file-provider suffix names Ctrl+P | ℹ️ Info | human copy item |
| 30-VALIDATION.md | frontmatter | still `status: draft`, `nyquist_compliant: false` | ℹ️ Info | /gsd-validate-phase has not been run |

### Human Verification Required

1. **Real typing and IME.** Tokens, Backspace reset, Ctrl/Alt+Up/Down in the pill and the editor, CJK composition in Command centre and Tabs, and Ctrl+L and Alt+D from Organising and from the Explorer.
2. **Visuals against 30-MOCKUPS.html.** Mode button, chips with and without x, the modes menu, Command-centre rows, badges and group headers, and the Tabs zero-query list, in all three PowerBrowser modes.
3. **Placeholder suffix** "(Press Ctrl+P to show/hide excluded files)" in the Coding pill (IN-05): keep or strip.
4. **Confirm D-34.** In Command centre, `devbox:3000` and `src/` list picks first with an unhighlighted Go-to row, which narrows SC5 and SMODE-06's "host:port". Add the override above, or revert one argument in `gotoRowFor`.
5. **WR-02 in Bookmarks and History.** Enter, Alt+Enter and Ctrl+Enter during the debounce act on a row, never on the typed text. See behavior_unverified_items.
6. **`@alias` out of the box (A6, IN-01).** The shipped engines have no alias, so `@alias` does nothing until an alias exists in Gecko.
7. **Judgment-tier prohibitions 1, 4 and 6** above (non-authoritative LLM verdicts).

### Gaps Summary

No must-have truth failed. Every artifact exists, has real content and is wired, and every key link holds. I produced the evidence in this session:
- --quick green;
- the modes gate self-test with 17/17 plants red;
- two full 30/30 live runs;
- the live self-test with 34/34 plants red;
- nav-keys-live 31/31 and web-tab-live PASS.

The status is `human_needed`, not `passed`, for these reasons:
- D-34 narrows the roadmap's "host:port" clause in Command centre. It is an orchestrator ruling, so SC5 and 30-06 truth 1 wait for Chris.
- WR-02's Bookmarks and History path is present and statically guarded, but no live scenario drives it.
- Real typing and IME, the visuals, the placeholder copy and the `@alias` default are human checks or decisions.
- Three judgment-tier prohibitions carry only non-authoritative verdicts.

One item for a later run is not a Phase 30 gap, but it is new. The address-keys scenario's page-focus precondition (`focusOverlay` before F6) went red in 2 of 8 runs that included it, as "broken instrument". The product assertions in those runs (Ctrl+L and Alt+D from the page) had passed. The failure is the same chrome-focus-on-overlay symptom as the known context-menu Paste & Go flake, which was red in 2 of 5 full runs and in the self-test clean control. Together they made 3 of 5 full runs exit 1. A retry in `focusOverlay`, or a fix to the underlying Phase 27 remoteness defect, would make the registered full row reliable.

---

_Verified: 2026-10-23T01:47:48Z_
_Verifier: Claude (gsd-verifier)_
