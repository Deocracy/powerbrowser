---
phase: "30"
slug: "address-bar-modes-and-command-centre"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-21"
---

# Phase 30 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `30-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Plain-node derive-and-compare scripts plus BiDi live scripts on `scripts/lib/pb-live-probe.mjs`, one driver: `scripts/verify-platform.sh` |
| **Config file** | The registry inside `scripts/verify-platform.sh` (quick block for `--quick`; the live block for full runs) |
| **Quick run command** | `scripts/verify-platform.sh --quick` |
| **Full suite command** | `scripts/verify-platform.sh` (needs the built binary and the last Theia app build) |
| **Estimated runtime** | ~90 seconds quick; live rows add minutes (one probe-shell session takes about 40 s) |

Proof tiers: **S** is a static gate (`--quick`, with `--self-test`). **L** is the live built shell with `-purgecaches` (`withProbeShell`, `MOZ_PURGE_CACHES=1`), page-realm `probe()`, and a temp workspace fixture for file search.

---

## Sampling Rate

- **After every task commit:** `scripts/verify-platform.sh --quick`.
  - Stage new `address-bar/` files first: the brand scan reads `git ls-files`.
  - After any `PowerBrowserAPI.sys.mjs` edit, run `node scripts/verify-ng-040-internals-catalogue-lines.mjs --fix`, then `bash scripts/check-internals-boundary.sh --catalogue`.
- **After every plan wave:** `--quick`, then a Theia build, then `node scripts/verify-address-bar-live.mjs --scenario <that plan's scenarios>`.
- **Before `/gsd-verify-work`:** the full `scripts/verify-platform.sh` and `node scripts/verify-address-bar-live.mjs --self-test` must be green.
- **Max feedback latency:** ~90 seconds (quick).

---

## Per-Task Verification Map

This map is at requirement level. Plans bind task IDs to these rows.

| Requirement | Behavior | Threat Ref | Tier | Automated Command | File Exists | Status |
|-------------|----------|------------|------|-------------------|-------------|--------|
| D-04 move | Pill in `address-bar/`; every Phase 29 gate green; `verify-chrome-bar-suggestions` and `verify-web-tab-bridge` scans recursive (a planted privileged call under `address-bar/` goes red); copy gate reads the address-bar sources | T-30-01 | S | `scripts/verify-platform.sh --quick` (+ each re-pointed script's `--self-test`) | ✅ re-pointed | ⬜ pending |
| D-04 move | Every live plant re-pointed to `get('AddressBar')`; each still goes red | — | L | `node scripts/verify-address-bar-live.mjs --self-test` | ✅ re-pointed | ⬜ pending |
| SMODE-01 | Dropdown entries equal the set derived from the built-in contributions and the engine list (heading, Command centre, engines, Bookmarks, Tabs, History, Actions, Search Settings); Search Settings opens the default-engine setting | — | S + L | `node scripts/verify-address-bar-modes.mjs` (+ `--self-test`); `verify-address-bar-live.mjs --scenario modes-dropdown` | ❌ W0 | ⬜ pending |
| SMODE-02 | Coding → Command centre, Browsing → Address, Organising → Tabs, custom → Address, all read from `DEFAULT_MODE_BY_UI_MODE` | — | S + L | `verify-address-bar-modes.mjs`; `--scenario mode-defaults` | ❌ W0 | ⬜ pending |
| SMODE-03 | Address shows icon only; other modes show the chip; x only off-default; x and Backspace at caret 0 reset; the mode returns to default after Enter, the second Esc, a tab switch, and a PowerBrowser-mode switch | — | L | `--scenario mode-chip,mode-lifetime` | ❌ W0 | ⬜ pending |
| SMODE-04 | `* `, `% `, `^ `, `> ` and `@one ` consumed into the chip (pure planted cases plus a live run with the hermetic engine's alias); a token without a space stays text; Ctrl+Up/Down cycle in table order; Alt+Up/Down open the menu; Ctrl/Alt+Up in an editor still reach Monaco | — | S + L | `verify-address-bar-modes.mjs` (tokenise and cycle cases); `--scenario mode-tokens,mode-keys` | ❌ W0 | ⬜ pending |
| SMODE-05 | For each prefix from `getQuickAccessProviders()`, picks render under the pill (positive control: at least one "file results" pick in the workspace fixture); `execute()` runs (a view opens, a command toggles); no `.quick-input-widget` rect; a `?` row sets the pill text and does not open the widget; the placeholder equals the descriptor's at check time | T-30-03 | L | `--scenario command-centre` | ❌ W0 | ⬜ pending |
| SMODE-05 | `@` and `:` (no Theia descriptor, derived) open the stock widget with the pill's text; the pill keeps its text | — | L | `--scenario command-centre-handoff` | ❌ W0 | ⬜ pending |
| SMODE-05 / D-26 | The `MODE_SENDS` Command-centre row is all false, and every chrome call in the query path sits behind it (a plant flips it and goes red); live, typing `hello`, `README` and `localhost:4000` in Command centre sends zero `resolveTypedAddress`/`searchSuggestions`/`autofillOrigin`/`searchPlaces` requests, while the same text in Address mode sends at least one (positive control) | T-30-02 | S + L | `verify-address-bar-modes.mjs` (+ `--self-test`); `--scenario command-centre-privacy` | ❌ W0 | ⬜ pending |
| SMODE-06 | `classifyAddress` planted cases (url / ambiguous / text, per 30-RESEARCH Wave 0 list) | — | S | `node scripts/verify-address-bar-rows.mjs` (+ `--self-test`) | ✅ grows | ⬜ pending |
| SMODE-06 | Go-to row first and highlighted for `localhost:<served port>/dev`, Enter loads it; `README.md` shows file results first, then an unhighlighted Go-to; Ctrl+L, Alt+D and F6 in Command centre switch to Address with the URL selected | T-30-04 | L | `--scenario go-to,address-keys` | ❌ W0 | ⬜ pending |
| SMODE-01 (local lists) | Tabs lists open shell tabs except the active one; Bookmarks and History zero-query lists come through `searchPlaces` `restrict`; Actions lists the "Browser" commands; the catalogue is current | T-30-05 | S + L | `bash scripts/check-internals-boundary.sh --catalogue`; `--scenario local-modes` | ✅ / ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

Threat refs:

- **T-30-01:** a privileged store kind called from moved code that no gate sees.
- **T-30-02:** Command centre sends typed text to chrome or an engine.
- **T-30-03:** a pick label rendered as markup.
- **T-30-04:** a Go-to commit bypasses the http(s) wall, or resolves to a search from Command centre (`visitOnly`).
- **T-30-05:** the `restrict` field is not validated chrome-side.

---

## Wave 0 Requirements

- [ ] `scripts/verify-address-bar-modes.mjs` (+ `--self-test`): mode table, defaults, `tokenise`, cycle order, the D-26 `MODE_SENDS` row and its call-site guard, and dropdown entries derived from the contributions, compared as set equality
- [ ] `scripts/verify-address-bar-rows.mjs`: `classifyAddress` planted cases
- [ ] `scripts/verify-address-bar-live.mjs`:
  - a workspace fixture: a temp folder with `README.md`, `src/main.py` and `.theia/launch.json`, opened by `location.hash` and a reload, then waiting for `ready && WorkspaceService.opened`
  - a hermetic engine alias (`@one`)
  - a `ChromeStoreClient.request` recorder
  - the scenarios `modes-dropdown`, `mode-defaults`, `mode-chip`, `mode-lifetime`, `mode-tokens`, `mode-keys`, `command-centre`, `command-centre-handoff`, `command-centre-privacy`, `go-to`, `address-keys`, `local-modes`, each with a planted fault in `--self-test`
- [ ] `scripts/verify-platform.sh`: quick-block rows for `verify-address-bar-modes.mjs` and its self-test (the live rows already exist as `address-bar-live` and its self-test)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Chip, menu and row visuals match 30-UI-SPEC (geometry, colours, no accent chip) | SMODE-01, SMODE-03, SMODE-05 | Pixel appearance on KDE Wayland; the gates read DOM and strings, not rendering | Launch the shell, open each mode's menu and results, and screenshot with the KWin raise and spectacle (memory: screenshot-pb-on-kde-wayland). Compare against `30-MOCKUPS.html`. |
| The file-provider placeholder suffix "(Press Ctrl+P to show/hide excluded files)" is acceptable in the pill | SMODE-05 (D-25) | A copy judgement for Chris (30-RESEARCH Open Question 1) | In Coding, focus the pill and read the placeholder. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
