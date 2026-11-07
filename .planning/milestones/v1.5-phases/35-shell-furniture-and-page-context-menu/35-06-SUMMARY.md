---
phase: 35-shell-furniture-and-page-context-menu
plan: "06"
subsystem: shell-furniture
tags: [PROMPT-06, D-03, D-14, D-15, W6, form-history, saved-logins, form-validation, clipboard-paste, furniture-gate, live-harness]
status: complete
requires:
  - phase: 35-shell-furniture-and-page-context-menu
    provides: 35-02's furniture block and gate rules 1-4, 35-03..35-05's rules 5-8 and the live harness
  - phase: 31.1
    provides: gBrowser.getTabForBrowser over the tab host, so AutoCompleteParent's selected-browser check and FormValidationParent's early return pass for the active overlay
provides:
  - upstream's PopupAutoComplete panel in the furniture block, and autocompletepopup="PopupAutoComplete" on every overlay set before appendChild
  - upstream's invalidFormTemplate (invalid-form-popup panel) in the furniture block for FormValidationParent
  - a textActions.ftl localization link in the shell head, so document.l10n exists for ClipboardContextMenu's paste popup
  - furniture rule 1 widened to ids looked up by ADOPTED_ACTORS parents (ContextMenuParent, FormValidationParent); rule 9 (overlay autocompletepopup == the autocomplete panel); rule 10 (localization links and the ids they must carry); plants (q)-(t)
  - bridge rule 4 requires autocompletepopup; self-test plant drops it
  - live scenarios autocomplete, saved-login, form-validation, paste-popup; plants autocomplete-element-removed, autocomplete-attr-removed, validation-template-removed, paste-l10n-removed
affects:
  - 35-07 (the furniture block now holds five ids; gate rules 1-10 and plants (a)-(t) are taken)
tech-stack:
  added: []
  patterns:
    - an upstream actor parent "adopted" by the gate contributes every element id it looks up to the wired set, derived from the actor source
    - a live scenario compares credential-adjacent values page-side and returns booleans only
key-files:
  created: []
  modified:
    - powerbrowser/shell/PowerBrowserAPI.sys.mjs
    - powerbrowser/INTERNAL-APIS.md
    - powerbrowser/shell/powerbrowser.xhtml
    - scripts/verify-shell-furniture.mjs
    - scripts/verify-web-tab-bridge.mjs
    - scripts/verify-page-furniture-live.mjs
key-decisions:
  - "Rule 1's actor wiring is scoped by an ADOPTED_ACTORS map (actor file -> reason), not applied to all 46 upstream *Parent.sys.mjs files. Applying it to all would mark 17 unrelated ids (WebRTC, SelectParent, AboutReader) as MISSING FURNITURE. The ids themselves are derived from the actor source."
  - "The validation template is written <template> in the shell's default XHTML namespace, not <html:template>: the shell declares no html: prefix, so the prefixed form would be an XML parse error. The gate's tokenizer drops xul:/html: prefixes, so parity with upstream's <html:template> holds."
  - "The ROADMAP clipboard-paste-popup research probe (12) is deferred: no built binary in this lane. Static answer recorded below."
patterns-established:
  - "A new stock element reached by an upstream actor parent: add the actor file to ADOPTED_ACTORS with its reason; its looked-up ids then must all be in the furniture block."
requirements-completed: []
duration: "approx. 35 min"
completed: "2026-10-31"
commits: 3
plan_head_before: 410e093b12b8eb6a92af8e1639ff838f0ea81284
plan_head_after: 33f24dd9897948fbf22741e7cc390b6a54263ca6
actuals:
  tokens: 41800
  tasks: 3
  commits: 3
---

# Phase 35 Plan 06: Form furniture (autocomplete, saved logins, validation bubble, paste popup) Summary

**The shell now hosts upstream's PopupAutoComplete panel, the form-validation template and a textActions.ftl localization, and every overlay names the autocomplete panel. The furniture gate derives all of it from upstream.**

- **Autocomplete (D-03, W6).** `webTabOpen` sets `autocompletepopup: "PopupAutoComplete"` on every overlay, the same value tabbrowser.js sets. `browser.autoCompletePopup` now resolves to upstream's own panel for FormHistory and LoginManager.
- **Validation bubble (D-14).** The `invalidFormTemplate` that FormValidationParent swaps in on first use is in the furniture block.
- **Paste popup (D-15).** The shell head links `toolkit/global/textActions.ftl`. Before this plan the shell had no `document.l10n`, so `aChromeDoc.l10n.setAttributes(menuitem, "text-action-paste")` at `ClipboardContextMenu.sys.mjs:162` threw inside the promise executor and every `navigator.clipboard.readText()` from a page rejected.

## Status

All three tasks are committed and the static scope is complete.

- `scripts/verify-platform.sh --quick` exited 0 after each task.
- `verify-shell-furniture` and its self-test pass, with plants (a)-(t).
- `verify-web-tab-bridge` and its self-test pass, with 39 plants.
- `check-internals-boundary`, `--catalogue` and `verify-ng-040-internals-catalogue-lines` pass.

No Theia source changed, so no Theia build was needed for the static gates. The live run is deferred because this lane has no objdir (see Deferred).

## Research probe 12 (page clipboard paste popup)

**Deferred live. Static answer:** before this plan, the shell failed on the first `readText()`. `ClipboardContextMenu._createMenupopup` calls `aChromeDoc.l10n.setAttributes(menuitem, "text-action-paste")` (`ClipboardContextMenu.sys.mjs:162`), and the shell document had no `<link rel="localization">`, so `document.l10n` was null. The resulting TypeError is thrown inside `confirmUserPaste`'s promise executor, so the page's promise rejected and no popup opened.

With the link added, `document.l10n` exists. The popup goes into the document element, because the shell has no `popupset`. The `paste-popup` scenario checks the label against upstream's en-US `text-action-paste` ("Paste"), waits out `security.dialog_enable_delay`, runs `doCommand()` and expects the page title to report 15. That run is deferred.

## Performance

- Tasks: 3/3
- Commits: 3 task commits plus this docs commit
- `--quick`: exit 0 after each task (about 4 minutes each)

## Task Commits

| Task | Commit | Subject |
|------|--------|---------|
| 1 | 8a34ae72 | feat(35-06): PopupAutoComplete furniture and autocompletepopup on every overlay (D-03, W6) |
| 2 | 8da225ec | feat(35-06): validation-bubble template, textActions.ftl localization and form-furniture gate rules (D-14, D-15) |
| 3 | 33f24dd9 | feat(35-06): live autocomplete, saved-login, form-validation and paste-popup scenarios |

## Deviations from Plan

### Scope Deviations (recommended option taken at each choice point)

1. **Rule 1 widening is scoped to `ADOPTED_ACTORS`.** The plan derives from every `*Parent.sys.mjs`, but taken literally, every id any actor looks up would join the wired set. That would produce 17 MISSING FURNITURE failures (WebRTC, SelectParent, AboutReader) and would make plant (t), the template removed, unprovable in the other reading. The adopted actors are a declared policy with reasons, like `DYNAMIC_KINDS`. The ids are derived from the actor source. A missing adopted actor, or one that looks up no id, is a BROKEN INSTRUMENT.
2. **`<template>`, not `<html:template>`.** The shell has no `html:` namespace prefix. Parity holds because the tokenizer drops prefixes.
3. **Rule 2 needed no change for the template's children.** It already compares the children of every furniture element. The nested `invalid-form-popup` is also compared on its own.
4. **The autocomplete Escape check retypes rather than reopening with ArrowDown.** It clears the field and types the three characters again. After a commit the field holds the whole entry, and whether the controller shows a popup whose only match equals the input is not certain. "Value unchanged" is compared page-side against a page variable saved just before Escape.
5. **saved-login sets `signon.autofillForms` and `security.insecure_field_warning.contextual.enabled` to false** in chrome scope, within the disposable profile. Otherwise the login can be autofilled on load, which suppresses the popup on focus (`#isLoginAlreadyFilled`), or a warning row can come first and take ArrowDown. The synthetic password is generated in chrome scope with `Services.uuid` and never leaves it.
6. **`openTools` was generalised to `openPage(app, pages, path)`.** `openTools` is now a one-line wrapper.
7. **INTERNAL-APIS.md line references were remapped** from the `git diff -U0` hunks with a p35 copy of the scratchpad helper. The copy in the scratchpad pointed at the p37 worktree. `--fix` was then a no-op, as the brief requires. The remap moved the misplaced setIcon row to `:6482`.

### Auto-fixed Issues

None.

## Deferred (live/human)

The owner ruling defers every item below to the end-of-milestone pass.

- **Not run:** the Theia `yarn build` followed by `node scripts/verify-page-furniture-live.mjs --scenario autocomplete,saved-login,form-validation,paste-popup`. There is no built binary. This covers the truth "Live check: form history and saved-login suggestions appear under the field and commit or dismiss from the keyboard, the validation bubble shows, and the paste popup works".
- **Not run:** `node scripts/verify-page-furniture-live.mjs --self-test`. The four new plants are unproven live, as are the earlier sixteen.
- **ROADMAP research probe 12 (clipboard paste popup).** Deferred live. The static answer is recorded above.
- **Tracer feedback gate (Task 1).** The automated `<verify>` passed end to end. A live autocomplete popup has not been observed.
- **Live unknowns to confirm:**
  - Whether BiDi key actions in the page context reach `nsFormFillController`, so typing opens the popup and ArrowDown and Enter commit.
  - Whether `#PopupAutoComplete`'s `getOuterScreenRect()` top-left lands inside the overlay's screen rect. This is the anchor check.
  - Whether a focus-only username field opens the login popup at 127.0.0.1 (`#onUsernameFocus` -> `showPopup`).
  - Whether FormValidationParent shows the bubble now that 31.1's `getTabForBrowser` is in the tree (`FormValidationParent.sys.mjs:82-100`).
  - Whether `doCommand()` on `#clipboardReadPasteMenuItem` resolves `confirmUserPaste`, and whether the spam guard tolerates the BiDi click.
- **Visual check:** the autocomplete popup sits directly under the field and the validation bubble's arrow points at the invalid field.

## Cross-lane assumptions

- No Phase 33 or Phase 34 artifact is used.
- Phase 31.1's tab host (`gBrowser.getTabForBrowser`) is already in this tree. It is the dependency behind AutoCompleteParent's selected-browser check and FormValidationParent's early return.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register:

- T-35-21: popups are chrome-side stock XUL. There is no push and no log. Live output carries booleans and counts only, the synthetic login lives in the disposable profile, and its password never leaves chrome scope.
- T-35-22: the real popup is chrome XUL, and nothing Theia-rendered imitates it.
- T-35-23: ClipboardContextMenu is stock, with its enable delay and spam guard. The page gets text only after Paste.

## Blockers

None.

## Next Plan Readiness (handoff facts for 35-07)

- **Furniture block.** It holds five ids: `remoteBrowserTooltip`, `contentAreaContextMenu`, `PopupAutoComplete`, `invalidFormTemplate` and the nested `invalid-form-popup`.
  - An element may now be wired three ways: a literal `getElementById` in the Phase 35 section, webTabOpen's `autocompletepopup:` value, or an actor file listed in `ADOPTED_ACTORS` in `verify-shell-furniture.mjs`, which is derived from `upstream/browser/actors` and `upstream/toolkit/actors`.
  - Use `<template>` (default namespace) for upstream `<html:template>`. The shell declares only the `xul:` prefix.
- **Furniture gate.**
  - Rules 1-10 are taken. The next free rule is 11.
  - Plants (a)-(t) are taken. The next is (u).
  - `FILES.clipboardMenu` is available.
  - Rule 10 requires every `data-l10n-id` in the furniture block to be a message in a linked localization file. A new `data-l10n-id` needs its upstream `.ftl` linked in the shell head, as a path relative to `browser/locales/en-US/` or `toolkit/locales/en-US/`.
- **Boundary file.**
  - It still ends with `pageMenuStill` (`:7719`). Append after it.
  - The Phase 35 header is at `:6799`.
  - The setIcon row is now `:6482`.
  - webTabOpen's attribute map is inside the frozen literal. Any further line added there needs the catalogue remap. The p35 helper is at /tmp/nix-shell.75PsxP/claude-1000/-home-chris-coding-Power-Browser/0bfefc30-234b-4e0f-94f5-823b1d79b31b/scratchpad/p35/remap-p35.mjs. The shared `remap.mjs` points at p37.
- **Bridge gate.** Rule 4's attribute list is `type, remote, remoteType, maychangeremoteness, manualactiveness, autocompletepopup`. There are 39 self-test plants.
- **Live harness.**
  - New scenarios go after `paste-popup`.
  - Helpers: `openPage(app, pages, path)` (which `openTools` wraps), `keysIn(app, context, values)`, `KEY` (WebDriver ArrowDown, Enter and Escape as escapes), `autocompleteState(app, tabId, needle)`, and `applyFormPlants(app, plant, note, tabId)`, which runs after the tab opens so an overlay plant can reach the overlay.
  - `saved-login` turns off `signon.autofillForms` for the rest of its session.
  - Pages added: `/form`, `/login`, `/validate`, `/paste`.

## Self-Check: PASSED

- FOUND: `id="PopupAutoComplete"` with `type="autocomplete-richlistbox"`, one line inside the furniture block (`powerbrowser.xhtml:69`)
- FOUND: `autocompletepopup: "PopupAutoComplete"`, one line in webTabOpen (`PowerBrowserAPI.sys.mjs:3307`)
- FOUND: `id="invalidFormTemplate"` (`:72`) and `id="invalid-form-popup"`, one line each inside the block
- FOUND: `href="toolkit/global/textActions.ftl"`, one line in the head (`:34`)
- FOUND: `saved-login` in `scripts/verify-page-furniture-live.mjs`
- FOUND: the bridge self-test names "planted overlay without autocompletepopup" red, and the furniture self-test names (q), (r), (s) and (t) red
- FOUND: commits 8a34ae72, 8da225ec and 33f24dd9 are ancestors of HEAD
