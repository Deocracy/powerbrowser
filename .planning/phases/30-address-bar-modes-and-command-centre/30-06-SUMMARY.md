---
phase: 30-address-bar-modes-and-command-centre
plan: 06
subsystem: ui
tags: [theia, chrome-bar, address-bar, command-centre, keybindings, verification]
status: complete

requires:
  - phase: 30-address-bar-modes-and-command-centre
    provides: 30-04's Command centre and its Enter guard, 30-05's pill key handler (Ctrl/Alt+Up/Down before the F6 branch), the workspace fixture
provides:
  - "address-bar-rows.ts: AddressClass and classifyAddress(raw), pure and import-free beside isCanonizable; RowSource 'goto'"
  - "AddressBar: gotoRowFor(mode, typed), refusesSearch(resolved, visitOnly), focusAddress(); commitText's visitOnly option"
  - "chrome-bar-commands.ts: setAddressFocus(fn); focusAddressPill() calls the registered focus path"
  - "chrome-bar-keybindings.ts: alt+d on the focus command with Ctrl+L's when clause"
  - "copy: goTo(address)"
  - "verify-address-bar-rows: 16 classifyAddress cases, a Go-to icon case, plants 'dotted host:port classed as url' and 'IPv6 rule removed'"
  - "verify-address-bar-live: scenarios go-to and address-keys, plants visit-only-off and focus-keeps-mode"
affects: [33]

tech-stack:
  added: []
  patterns:
    - "A row that commits typed text carries its own run (commitText visit-only), so Command centre's Enter guard never falls through to commitTyped"
    - "The command side reaches the address bar through a module-level setter, the same one-way pattern as the current web tab"

key-files:
  created: []
  modified:
    - theia/extensions/chrome-bar/src/browser/address-bar/address-bar-rows.ts
    - theia/extensions/chrome-bar/src/browser/address-bar/address-bar.tsx
    - theia/extensions/chrome-bar/src/browser/chrome-bar-commands.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar-keybindings.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts
    - scripts/verify-address-bar-rows.mjs
    - scripts/verify-shell-error-copy.mjs
    - scripts/verify-address-bar-live.mjs

key-decisions:
  - "A dotted host with a port (example.com:8080, main.py:12) is ambiguous, not a URL (30-RESEARCH A3)"
  - "Every Go-to commit is visit-only: a search reply shows the commit-failure row and loads nothing (A4)"
  - "New Tab shares the focus path, so it ends in Address mode (A2)"
  - "In Command centre, Enter with no highlighted row commits only an unambiguous address, and only through the Go-to row's own run"
  - "The Home-failure path focuses the pill by DOM only, so the address keys' path cannot close the Home-failure row it just showed"
  - "No 'No matching results' message shows when the only row is a Go-to row"

requirements-completed: [SMODE-06]

duration: ~70m
completed: 2026-10-22

actuals:
  tokens: 5900
  tasks: 2
  commits: 2
plan_head_before: 0ddaa0866e6beed78687422bf2f8954f1e5b85ec
plan_head_after: fdec14b5af9d7da6c2ef2886cc0e2b74be24ba75
---

# Phase 30 Plan 06: Address from Command centre Summary

The address bar can be reached again from Command centre. Text that a local, pure classifier calls an unambiguous address gets a highlighted "Go to {address}" first row, and Enter loads it through chrome's resolve. A dotted name such as README.md lists files first and then an unhighlighted Go-to row. Ctrl+L, Alt+D and F6 from a page, Ctrl+L and F6 in the pill, and New Tab all put the pill in Address mode with the address selected. Tabs, Bookmarks and History show the same Go-to row. Every Phase 29 and Phase 30 live scenario passes in one session.

## What was done

- **Task 1 (d8bf2b5, tracer): Go to an address from Command centre.**
  - `classifyAddress` returns `url` for a scheme, `localhost[:port]`, IPv4 or bracketed IPv6 with an optional port, a leading `www.`, an undotted `host:port` and a trailing `/`. It returns `ambiguous` for a single dotted token with an optional port, and `text` for everything else, including text with whitespace.
  - Rows gate: the 16 planted cases from the research Wave 0 list (plus whitespace-only text), a Go-to icon case (globe, no type marker), and two new plants, each red by name.
  - `gotoRowFor(mode, typed)`: in Command centre the row is offered only when the registry's descriptor for the text has the empty prefix. `runLocalQuery` puts a `url` Go-to first and highlighted. An `ambiguous` Go-to goes after the provider's rows and never takes the default highlight.
  - The Go-to row's `run` is `commitText(text, { visitOnly: true })`. `refusesSearch` (the plant site) refuses a `search` reply under `visitOnly`. The commit-failure row shows and nothing opens. Its retry keeps `visitOnly`.
  - Command centre's Enter guard: with no highlighted row, it chooses the Go-to row only when the class is `url`, and otherwise does nothing. It never reaches `commitTyped`.
  - Copy `goTo` is pinned in `EXPECTED_NAV_COPY`.
  - Live `go-to` runs on its own localhost tab in the fixture workspace:
    - `localhost:<port>/dev` gets a first, highlighted Go-to row, and Enter produces a GET and a loaded push.
    - README.md lists the file first and highlighted, with the Go-to row after it.
    - "hello" gets no Go-to row.
    - With the resolve stubbed to reply a search, Enter shows the commit-failure row and the engine sees no GET.
  - Plant: `visit-only-off`.
- **Task 2 (fdec14b): the address keys and the local modes.**
  - `setAddressFocus` / `focusAddressPill`: once the address bar's `attach` registers `() => this.focusAddress()`, every existing caller enters Address mode. Those callers are the focus command, New Tab, the four relay rows and Home with an empty home page.
  - `focusAddress()` closes the modes menu and the dropdown, sets `address`, renders now (`renderNow`), focuses the input and selects all of it.
  - `alt+d` is bound to the focus command with `when: '!editorFocus && !terminalFocus'`.
  - F6 in the pill in a non-Address mode calls `focusAddress()`. The Address-mode branch, which focuses the page, is unchanged.
  - The local modes with a trailing search row (Tabs, Bookmarks, History) get the same Go-to row. An ambiguous Go-to sits between the mode's rows and the search row.
  - Live `address-keys` runs in Coding with the pill in Command centre and a localhost tab current:
    - Ctrl+L, Alt+D and F6 in the page each focus the pill in Address mode with the tab's URL selected.
    - In the pill, F6 in Command centre goes to Address and keeps focus, and a second F6 focuses the page.
    - Ctrl+L in the pill goes to Address.
    - New Tab leaves a new tab current with the pill focused in Address. This confirms the order: the tab change's reset runs before the focus.
    - In Tabs mode, `localhost:<port>/sw-a` gets a first Go-to row.
    - Editor control: in the README.md editor, Ctrl+L and Alt+D leave the pill unfocused and the mode unchanged.
  - Plant: `focus-keeps-mode`.

## Verification

- `scripts/verify-platform.sh --quick`: PASS after each task and at the end.
- Static gates, all PASS:
  - `verify-address-bar-rows` (39 cases) and its `--self-test` (8 plants)
  - `verify-shell-error-copy`
  - `verify-chrome-bar-suggestions`
  - `verify-chrome-bar-commands` and its `--self-test`
  - `verify-shortcut-relay`
- `tsc --noEmit -p theia/extensions/chrome-bar` is clean. Theia was rebuilt (0 errors) before each live run.
- Task 1 live: `--scenario search,command-centre,command-centre-privacy,go-to`, all four PASS. Privacy still holds with the Go-to row present.
- Task 2 live: `--scenario search,address-keys` PASS.
- Before the full self-test, a scratch runner applied each new plant on its own. `visit-only-off` went red with "Command centre opened a search". `focus-keeps-mode` went red with "Ctrl+L left the pill in Command centre".
- Phase close, on the final build:
  - `verify-address-bar-live.mjs`: all 30 scenarios PASS, including all twelve Phase 30 scenarios.
  - `verify-address-bar-live.mjs --self-test`: on the first run every plant was red, but the clean control failed on the known context-menu Paste & Go focus defect (29 `deferred-items.md`). The re-run passed: clean control green and all 29 plants red.
  - `verify-nav-keys-live.mjs`: 31/31 PASS.
  - `verify-nav-keys-live.mjs --self-test`: on the first run every plant was red, but the clean control failed once on `stop-guard`. That check asserts reload clicks inside and outside a 650 ms window after a load; this plan touched neither the reload button nor its guard. The re-run passed: clean control green and all 11 plants red.
  - `verify-web-tab-live.mjs` and its `--self-test` (12 plants): PASS.
- `PowerBrowserAPI.sys.mjs` was not edited, so the catalogue and boundary steps did not apply.

## Deviations from Plan

1. **[Rule 1 - Bug] The Home-failure path keeps its DOM-only focus.** `goHome`'s failure branch called `focusAddressPill()` after opening the Home-failure row. Routed through `focusAddress()`, that call would close the row it had just opened. It now focuses and selects the input directly. The empty-home branch still uses the shared path, as New Tab does.
2. **No "no matching results" message when a Go-to row is the list.** A typed address in Command centre usually matches no files. Without this change, the message row would sit above a highlighted Go-to row.
3. **Ambiguous text with no file results.** The Go-to row is still never the default highlight, so Enter with no row chosen does nothing in Command centre. It is a choice only by ArrowDown or a click (D-30).
4. **Alt+Enter on a Go-to row** runs the row, committing in the current tab, as any row with a `run` does. A new-tab Go-to was not specified.
5. **Shift+F6 in the pill** in a non-Address mode switches to Address too, because the F6 branch covers both, as it did in Phase 27.

**Total deviations:** 1 auto-fixed (Rule 1), 4 recorded readings. **Impact:** limited to the address bar.

## Recommendations taken (30-RESEARCH Assumptions Log)

- A2: New Tab focuses the pill in Address mode. It shares the focus path, and the live check proves the order.
- A3: A dotted `host:port` is ambiguous, so `main.py:12` never gets a first-row Go-to.
- A4: Every Go-to commit is visit-only.
- A5 (30-04): after a `>` command that leaves focus in the pill, focus returns to `shell.currentWidget`.
- A6 (30-05): engine aliases come only from Gecko. **`@alias` does nothing in the shipped tree until a downstream configures an alias.**
- A7 (30-03): Tabs MRU is in memory. Tabs never activated this session sort after the rest, in tab order.

## For Chris at verify-work

- **Placeholder suffix (30-RESEARCH Open Question 1):** in Coding the pill shows the file provider's placeholder verbatim, including "(Press Ctrl+P to show/hide excluded files)". In the pill, Ctrl+P opens the stock widget instead. Keep the suffix or strip it?
- **Manual-only checks (30-VALIDATION):** the visuals of the chip, the modes menu and the rows (24px headers, 48px detail rows, the Go-to globe) have not been compared against `30-MOCKUPS.html`. Capture them with the KWin raise and spectacle. No screenshot was taken in this plan.

## Requirements

- **SMODE-06: Complete.** The `go-to` and `address-keys` scenarios, their plants and the full live run prove it.

## Known Stubs

None.

## Threat surface

No surface beyond the plan's threat model.

- T-30-04: one commit path through `resolveTypedAddress`, plus `visitOnly` and the `visit-only-off` plant.
- T-30-21: `classifyAddress` is pure, and `command-centre-privacy` passed with Go-to rows present in Command centre and Tabs.
- T-30-22: the `when` clause and the editor control.

## Risks for later plans

- **Phase 33 (SMODE-07):** a Go-to commit can never search, but Command centre's Enter still does nothing for ambiguous text. If Actions mode gains browser actions, its Go-to rule (none today, because Actions has no search row) needs a decision.
- **The focus path closes the dropdown.** Any future caller of `focusAddressPill()` that has just opened a dropdown row must focus by DOM, as Home's failure path now does.
- **Live flakes seen this run:** the context-menu Paste & Go focus defect (known), and one `stop-guard` timing miss in the nav-keys clean control. Each passed on its re-run.

## Self-Check: PASSED

- FOUND: `export function classifyAddress(` in address-bar-rows.ts
- FOUND: `visitOnly: true` in address-bar.tsx
- FOUND: `export function setAddressFocus` in chrome-bar-commands.ts
- FOUND: `'alt+d'` in chrome-bar-keybindings.ts
- FOUND: d8bf2b5, fdec14b (ancestors of HEAD)
