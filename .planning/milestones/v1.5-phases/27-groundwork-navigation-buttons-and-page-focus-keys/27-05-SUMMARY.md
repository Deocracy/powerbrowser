---
phase: 27-groundwork-navigation-buttons-and-page-focus-keys
plan: 05
subsystem: chrome-bar (Home button, preferences), copy gate, live harness
tags: [home-button, preferences, settings, home-failure-row, nav-04]
status: complete

requires:
  - phase: 27-04
    provides: "chrome-bar-copy.ts (CHROME_BAR_COPY, appSubject), EXPECTED_NAV_COPY pin, live harness helpers (clickOn, settle, navButtonExpr)"
provides:
  - "chrome-bar-preferences.ts: SHOW_HOME_BUTTON_PREFERENCE (browser.showHomeButton, default false), HOME_PAGE_PREFERENCE (browser.homePage, default ''), bindChromeBarPreferences"
  - "ChromeBarWidget.goHome(tab): public, returns 'opened' | 'empty' | 'failed'; 27-06's Alt+Home relay calls it with the pushed tab"
  - "Home button after Reload, live on the preference change event; the Home-failure row with its Settings affordance"
  - "navigateWebTab(url, tab = currentWebTab()) takes an explicit tab"
  - "live scenarios home, home-empty, home-failure, home-no-tab"
affects: [27-06 (Alt+Home calls goHome), 27-08 (Home's title= moves to the hover service), any later plan editing chrome-bar copy]

actuals:
  tokens: 7076
  tasks: 2
  commits: 2
plan_head_before: 219f612a3790851de56f1ef20a9d84446520a062
plan_head_after: 5a2676321bbc8d97e25e6f0fbeb6fc6adca2d745

tech-stack:
  added: []
  patterns:
    - "A PreferenceContribution with a static schema, bound at module load, when no installed package registers the key"
    - "Widget re-renders on PreferenceService.onPreferenceChanged filtered by key, disposed with the widget"

key-files:
  created:
    - theia/extensions/chrome-bar/src/browser/chrome-bar-preferences.ts
  modified:
    - theia/extensions/chrome-bar/src/browser/chrome-bar-frontend-module.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx
    - theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts
    - scripts/verify-shell-error-copy.mjs
    - scripts/verify-nav-keys-live.mjs

key-decisions:
  - "The Home settings use a static PreferenceContribution schema, not the telemetry initSchema pattern: no installed @theia package registers browser.showHomeButton or browser.homePage (grep over node_modules/@theia/*/lib)"
  - "No origin exemption was needed in the copy gate: example.com has two segments, and DOTTED_KEY flags three or more"
  - "Home closes the failure row on blur, Escape and typing by clearing homeFailed inside closeDropdown and onInputChange, so every existing dismissal path covers the new row"

requirements-completed: []  # NAV-04 button half only; Alt+Home and the checkbox land in 27-06

coverage:
  - id: D1
    description: "Default settings show no Home; turning browser.showHomeButton on shows it directly after Reload with no reload, enabled, on one row with every button and the toggle, the pill min-width 120px; a click loads browser.homePage in the current tab"
    requirement: NAV-04
    verification:
      - kind: e2e
        ref: "node scripts/verify-nav-keys-live.mjs --scenario home"
        status: pass
  - id: D2
    description: "An empty home page leaves the current tab on about:blank (read from the overlay's currentURI in chrome), opens no tab, and focuses the pill with its text selected"
    requirement: NAV-04
    verification:
      - kind: e2e
        ref: "node scripts/verify-nav-keys-live.mjs --scenario home-empty"
        status: pass
  - id: D3
    description: "'not an address' shows one row starting with the configured application name, no footer, no key or value in the text, pill focused; Enter opens settings_widget with #preference-searchbar = browser.homePage; a second failure and Escape leave no row"
    requirement: NAV-04
    verification:
      - kind: e2e
        ref: "node scripts/verify-nav-keys-live.mjs --scenario home-failure"
        status: pass
      - kind: other
        ref: "node scripts/verify-shell-error-copy.mjs and --self-test"
        status: pass
  - id: D4
    description: "With Settings current, Home opens one new current web tab that pushes /home"
    requirement: NAV-04
    verification:
      - kind: e2e
        ref: "node scripts/verify-nav-keys-live.mjs --scenario home-no-tab"
        status: pass

duration: 15min
completed: 2026-10-21
---

# Phase 27 Plan 05: Home button and its two settings Summary

**Two settings, `browser.showHomeButton` (off by default) and `browser.homePage` (empty by default), control an optional Home button after Reload. The button appears and disappears live. A click opens the home page through the pill's own address routing. An empty value opens the empty page and focuses the pill. A rejected value shows one Home-failure row whose Enter or click opens Settings filtered to `browser.homePage`. All four branches pass live.**

## Performance

- **Duration:** about 15 min
- **Completed:** 2026-10-21T00:20Z
- **Tasks:** 2 of 2
- **Files:** 1 created, 5 modified

## Accomplishments

- **Settings:** `chrome-bar-preferences.ts` holds a boolean and a string schema. Their descriptions are the two `CHROME_BAR_COPY` sentences. It is bound in `chrome-bar-frontend-module.ts` at module load (D-50).
- **Button:** Home uses `pb-chrome-bar-button` and `codicon codicon-home`, and it is never disabled. It renders only while the setting is true. A `@postConstruct` subscription to `onPreferenceChanged` on either key re-renders the bar.
- **`goHome(tab)`:** a non-empty value goes through `typedAddressTargetOf`, then `navigateWebTab(target, tab)`. That function now takes an explicit tab, so 27-06 can pass the pushed tab. With a tab it navigates the tab. Without one it uses the opener route. An empty value navigates the tab to `EMPTY_PAGE_URL`, or runs New Tab when there is no tab, and then calls `focusAddressPill()`.
- **Failure row:** a rejected value, a navigation reply that is not ok, or an opener throw sets `homeFailed`. The dropdown then shows one `pb-chrome-bar-row is-highlighted` row with `CHROME_BAR_COPY.homeFailed(appSubject())` and no footer, and focus moves to the pill. Enter, or a mousedown on the row, runs `CommonCommands.OPEN_PREFERENCES` with `HOME_PAGE_PREFERENCE`. The existing commit-failure row and its retry are unchanged.
- **Threat model:** T-27-16 is mitigated by `typedAddressTargetOf`, which admits http(s) and bare dotted hosts only, plus chrome's `webTabNavigate` scheme wall. T-27-17 is mitigated because the row carries no key and no value: the live check requires that, and the copy gate pins the sentence.

## Task Commits

1. **Task 1 (tracer): settings, Home button, `goHome` opened branch, copy pins, `home` scenario**: `7b669db` (feat). The tracer gate re-ran the whole `<verify>` chain (copy gate and self-test, command contract, tsc, `yarn build`, `--scenario home`). It passed before Task 2 started.
2. **Task 2: empty and failed branches, the Settings affordance, three scenarios**: `5a26763` (feat)

## Verification run

- `scripts/verify-platform.sh --quick`: PASS.
- `node scripts/verify-nav-keys-live.mjs` (full): all 18 scenarios PASS, including the 4 new ones.
- `node scripts/verify-nav-keys-live.mjs --self-test`: PASS on the second run. On the first run the clean control was red on `history-channel`, a scenario this plan did not change: entry 0's title read as its URL, a title-recording race. The full run just before and the re-run both passed. Recorded in `deferred-items.md`.
- `node scripts/verify-shell-error-copy.mjs` and `--self-test`: PASS (8 plants).
- `node scripts/verify-chrome-bar-commands.mjs`, `tsc --noEmit -p theia/extensions/chrome-bar`, `yarn build` (0 `error TS`): PASS.
- `node scripts/scan-brand-residue.mjs` with the new file staged: PASS.

## Deviations from Plan

None that change behaviour. Points worth recording:

- **No copy-gate exemption.** The plan allowed one if the internals pattern flagged the example origin. It did not: `DOTTED_KEY` needs three segments. No exemption or plant was added.
- **`navigateWebTab` gained a `tab` parameter** that defaults to `currentWebTab()`. `goHome` can then reuse the pill's route for a given tab without a second copy of the opener branch. Existing callers are unchanged.
- **NAV-04 is left unchecked in REQUIREMENTS.md.** `requirements.mark-complete NAV-04` ran and was reverted: the requirement includes Alt+Home, which 27-06 builds, and 27-06 also lists NAV-04.
- **Carry-over item 1 was not done here.** It said 27-05 removes the native `title=` tooltips. This plan's own text gives Home `title='Home'` and leaves tooltips to 27-08 (NAV-05), so all five nav buttons still carry `title=`.

## Known Stubs

None.

## Threat Flags

None. The settings to Home navigation boundary is the plan's threat model, and both mitigations are in place.

## Notes for later plans

- 27-06: call `this.barWidget.goHome(pushedTab)` (or the widget from DI). It returns `'empty'` after it focuses the pill, so the Alt+Home focus target needs no extra logic.
- 27-08: Back, Forward, Reload, Home and New Tab all still carry `title=`. Removing them means editing the `EXPECTED_WIDGET_COPY` rows: "Home" stays, through `aria-label`.
- Home does not join the active group when it opens a new tab. It follows the pill commit's route, which does not join either. New Tab does join.
- Not checked: a physical display or screenshot of the button and row, a real mouse click on the row (only the Enter path was driven live; the mousedown handler is the same call), a narrow window (only the computed `min-width` was read, and the pill was not shrunk), and the Settings editor rendering the two descriptions.

## Self-Check: PASSED

- FOUND: theia/extensions/chrome-bar/src/browser/chrome-bar-preferences.ts, chrome-bar-widget.tsx, chrome-bar-copy.ts, chrome-bar-frontend-module.ts, scripts/verify-shell-error-copy.mjs, scripts/verify-nav-keys-live.mjs
- FOUND commits: 7b669db, 5a26763 (ancestors of HEAD)
