---
phase: 36-new-window-links-as-web-tabs
plan: "03"
subsystem: live-verification
tags: [new-window, adopt, web-tabs, live-harness, bidi, self-test, gui-01]
status: partial
requires:
  - phase: 36-new-window-links-as-web-tabs
    provides: 36-01 receivers, pending overlay, adoptTab/dropAdoptedTab pushes, webTabAdopt arm, 5 s openStockTab fallback, PowerBrowserAPI.openAdoptedWebTab; 36-02 adopt subscription and the openStockTab-only GUI-01 command (Post-merge correction (2026-11-01): PowerBrowserAPI.openAdoptedWebTab was removed; Phase 37 uses the unblockPopup replay.)
  - phase: 27-groundwork-navigation-buttons-and-page-focus-keys
    provides: scripts/lib/pb-live-probe.mjs (withProbeShell, push recorder, serveNavPages, inChrome) and the verify-nav-keys-live.mjs runner shape
provides:
  - scripts/verify-new-window-adopt-live.mjs -- seven live scenarios (adopt-order, adopt-opener, adopt-popup, adopt-focus, adopt-fallback, adopt-scheme, adopt-unknown-key), --scenario select, --self-test with eight plants
  - registry rows new-window-adopt-live and new-window-adopt-live-self-test in the non-quick live block, after gui01-command-registered
affects:
  - end-of-milestone live pass (every live check for Phase 36 runs there, listed under Deferred live verification)
  - /gsd-verify-work for Phase 36 (PROMPT-05 stays unproven live until that pass)
tech-stack:
  added: []
  patterns:
    - shell-window count read from the BiDi chrome-context tree (contexts on the shell document), stock windows as the other chrome contexts that hold a gBrowser
    - a recorder wrapped around the receiver's two InFrame members in the running shell window, which also hosts the opener-null plant
key-files:
  created:
    - scripts/verify-new-window-adopt-live.mjs
  modified:
    - scripts/verify-platform.sh
key-decisions:
  - "Shell-window count comes from the chrome-context tree, not the POWERBROWSER_SHELL_READY sentinel: withProbeShell launches without a stdout tee, and the plan forbids a new harness."
  - "The fallback waits on the context tree for a stock window holding the URL, bounded by chrome's ADOPT_ACK_TIMEOUT_MS (derived from the tree) plus a 10 s margin. firefox-bidi.mjs drops BiDi events, so 'event-waited' means a deadline poll on the condition, never a fixed sleep."
  - "The background leg calls window.openLinkIn(url, 'tab', { openerBrowser, inBackground: true }) in chrome, the call stock middle-click makes. ClickHandler is not registered in the shell (36-01 deferred item 5), so a real middle-click cannot reach it."
  - "The opener round trip uses the window.open button, not the _blank link: target=_blank implies noopener, so a _blank page has a null window.opener by design."
  - "The refused-scheme outcome is read from window.openLinkIn, the only path that returns the word. The InFrame path returns null to Gecko for a refused scheme (36-01 decision), so the page-link leg asserts outcomes only: no adoptTab push, no javascript: web tab, no new stock window, the opener still on its page."
  - "Absence legs (adopt-popup, adopt-fallback, adopt-scheme) are scored only when adopt-order passed earlier in the same session. --scenario pulls adopt-order in automatically, and a not-scored scenario fails the run."
patterns-established:
  - "A plant marks window.__pbPlantRan where it runs (Theia frame or shell window). The scenario notes PLANT only when the mark is set, so a plant whose code path never ran fails the self-test as not applied."
requirements-completed: []
duration: "about 25 min"
completed: "2026-11-01"
commits: 2
plan_head_before: 820d0383a735989899ad6e7d649ba3f42a5fa9d2
plan_head_after: 10ee1263af8bbc9cd4adf22ef40fc8c12dda9c20
actuals:
  tokens: 11075
  tasks: 2
  commits: 2
---

# Phase 36 Plan 03: Live adopt check and registry rows Summary

**The live check for PROMPT-05 is written and registered: seven scenarios on the Phase 27 probe harness and eight in-session plants, with two rows after the GUI-01 rows. None of it has run. This tree has no objdir, and the live runs are deferred by owner ruling to the end-of-milestone pass.**

## Status

Complete for the static scope. The live proof is not done.
- The script passes `node --check` and the acceptance greps.
- With no built binary, every mode prints one `harness:` line and exits 1. It does not crash.
- `--quick` exits 0.
- Every live acceptance criterion in the plan is listed under Deferred live verification. That includes all seven scenarios PASS, the self-test naming all eight plants, and the GUI-01 rows green.

## Performance

- **Tasks:** 2 of 2 (static halves).
- **Commits:** 2 code commits (`d9861749`, `10ee1263`), plus this SUMMARY commit.
- **Realized diff:** about 11,075 tokens by the chars/4 estimate (plan estimate 50,000). 2 files, one new.

## Accomplishments

- **Task 1 (`d9861749`).** `scripts/verify-new-window-adopt-live.mjs` uses Node built-ins and `scripts/lib` only, in the shape of `verify-nav-keys-live.mjs`:
  - **Runner:** one session per run and `--scenario a,b` selection. Output is `<scenario>: PASS` or `<scenario>: FAIL -- <reason>`, and a thrown error becomes `harness: <message>`.
  - **Pages and clicks:** served pages `/opener` (a `_blank` link, a `window.open` button, a popup-features button, a `javascript:` `_blank` link and a postMessage responder) and `/target`. Clicks are trusted BiDi pointer input on the opener's own content context.
  - **Self-test:** a clean control, then one session per plant, each scored only on its target scenario.
  - The `purgecaches: MOZ_PURGE_CACHES=1` line comes from `withProbeShell`.
- **Task 2 (`10ee1263`).** Two registry rows, `new-window-adopt-live` and `new-window-adopt-live-self-test`, follow `gui01-command-registered` inside `if [ "$QUICK" -eq 0 ]`, with a comment block in the registry's voice. The gui01 rows and scripts are unchanged: `git status --porcelain` on both gui01 scripts prints nothing, and the diff touches only the 16 added lines.

## Instrument per scenario

| Scenario | Proved by |
|---|---|
| adopt-order | push recorder (one `adoptTab`, `openerTabId` = A); Theia strip order (directly after A); chrome-context tree (shell windows = 1, no new stock window); Theia current title after close (reselects A) |
| adopt-opener | push recorder + attached web tab; adopted page's content context (`window.opener` non-null); postMessage round trip read in both page contexts |
| adopt-popup | chrome-context tree + gBrowser read (a new stock window holds the URL); push recorder and Theia web tabs (no adopt for it) |
| adopt-focus | push recorder (`background` flag); Theia current title; chrome `activeTabIdOf` and active element |
| adopt-fallback | push recorder (the push arrived, the ack was dropped); chrome-context tree waited to `ADOPT_ACK_TIMEOUT_MS` + 10 s (stock window holds the URL); Theia web tabs and shell overlays (none keep it) |
| adopt-scheme | `window.openLinkIn` return value (`refused-scheme`); InFrame receiver recorder (noted); push recorder, Theia web tabs, chrome-context tree and the opener's `location.href` for the link leg |
| adopt-unknown-key | `webTabAdopt` reply (`unknown-tab`); push recorder (`dropAdoptedTab` for the widget); widget `isDisposed` and channel registration |

## Self-test plants

| Plant | Target | Fault, applied in the running session | Expected red text |
|---|---|---|---|
| adopt-append-at-end | adopt-order | frontend `adopt` gets an unknown `openerTabId`, so the tab lands at the end | `directly after` |
| reselect-opener-off | adopt-order | the tab bar's `_previousTitle` cleared before close | `opener` |
| opener-null | adopt-opener | the receiver recorder passes `openWindowInfo: null` | `opener` |
| popup-becomes-tab | adopt-popup | pref `browser.link.open_newwindow.restriction` = 0 | `stock window` |
| background-activates | adopt-focus | frontend `adopt` forced to `background: false` | `opener keeps focus` |
| fallback-off | adopt-fallback | the dropped adopt acks the pending key for a widget that never attaches, which disarms chrome's fallback | `stock window` |
| adopt-javascript | adopt-scheme | `window.openLinkIn` hands a `javascript:` URL on as `about:blank` (wall bypassed) | `refused` |
| unknown-key-keeps-widget | adopt-unknown-key | frontend `dropAdopted` made a no-op | `dropped` |

## Task Commits

1. **Task 1: live adopt check, seven scenarios, eight plants:** `d9861749` (`test(36-03): live adopt check with seven scenarios and eight self-test plants`)
2. **Task 2: registry rows:** `10ee1263` (`test(36-03): register the live adopt rows beside the GUI-01 rows`)

## Files Created or Modified

- `scripts/verify-new-window-adopt-live.mjs`: new live check.
- `scripts/verify-platform.sh`: two rows plus a comment block, appended after `gui01-command-registered`.

## Decisions Made

See `key-decisions` in the frontmatter.

## Deviations from Plan

### Instrument substitutions (no product code touched)

**1. Shell-window count from the chrome-context tree, not the SHELL_READY sentinel.** `withProbeShell` → `withShell` → `withFirefoxPage` passes no `stdoutPath`, so the sentinel stream does not reach this session. Adding a tee would mean editing the harness lib, which the plan rules out ("no new harness"). The chrome-context tree is the same session and reads windows directly: a second shell window is a second chrome context on `SHELL_DOCUMENT_URL`.

**2. "Event-waited" fallback is a deadline poll, not a BiDi event subscription.** `firefox-bidi.mjs`'s `BiDiClient` drops every message without an id, so `browsingContext.contextCreated` cannot reach a caller without a lib edit. The wait polls the context tree until a stock window holds the URL, with a deadline of `ADOPT_ACK_TIMEOUT_MS` (read from `PowerBrowserAPI.sys.mjs`) plus 10 s. The script has no fixed sleep. Its only timer is a 4 s ceiling on a postMessage reply inside the page.

**3. The background adopt goes through `window.openLinkIn`, not a real middle-click.** See 36-01 deferred item 5: ClickHandler is not registered, so a middle-click on an overlay link does not reach openLinkIn.

**4. The refused-scheme outcome comes from the openLinkIn path.** A `javascript:` link click reaches only the InFrame path, which returns null to Gecko and so surfaces no outcome word.

### Assumption A-06

A-06 says the probe harness works for popup-spawning pages. **Not tested.** No live run was possible. The script relies on these unverified points, each of which the live pass will confirm or correct:
- (a) Reading `window.browserDOMWindow` back in chrome returns the JS object the boundary assigned, so the recorder can wrap its members in place. If it does not, the recorder throws `harness: the receiver recorder could not be installed`.
- (b) A popup's stock window appears as a chrome context holding a `gBrowser`.
- (c) Trusted BiDi pointer input on an overlay context carries user activation for `window.open`.
- (d) Gecko's handling of a `javascript:` `_blank` link. The scenario requires no adopt, no new stock window and no navigation of the opener. If Gecko instead asks the receiver for `about:blank`, the scenario goes red, and the receiver calls it noted show why.

## Deferred live verification

Run all of these in the end-of-milestone live pass, from a tree with a built `objdir/`, in this order:

1. `nix develop .#theia --command bash -c 'cd theia && yarn build'`
2. `node scripts/verify-new-window-adopt-live.mjs --scenario adopt-order,adopt-opener,adopt-popup,adopt-focus,adopt-fallback,adopt-scheme,adopt-unknown-key`. All seven `: PASS` lines are required, plus `purgecaches: MOZ_PURGE_CACHES=1`.
3. `node scripts/verify-new-window-adopt-live.mjs --self-test`. It must exit 0 and name all eight plants as red.
4. `node scripts/verify-gui01-window.mjs` and `node scripts/verify-gui01-command.mjs`. Both must stay green with the receiver installed and the popup branch gone.
5. `scripts/verify-platform.sh --only new-window-adopt-live` and `scripts/verify-platform.sh --only new-window-adopt-live-self-test`.

Items carried forward from 36-01 and 36-02 that this pass covers:
- Gecko accepts the returned pending element: a remote frameloader, and no double load (36-01 deferred 2). Covered by adopt-order and adopt-opener.
- A working `window.opener` (postMessage round trip). Covered by adopt-opener.
- Popup-features windows stay stock windows. Covered by adopt-popup.
- Background versus foreground focus. Covered by adopt-focus.
- The 5 s fallback. Covered by adopt-fallback.
- The unknown-key sweep and the dropAdoptedTab sweep (36-01 deferred 2, 36-02 deferred 2). Covered by adopt-unknown-key.
- Close-adopted-reselects-opener (36-02 deferred 2). Covered by the adopt-order reselect leg.
- The GUI-01 rows with the receiver installed and the popup branch gone, where a palette invocation opens the stock window through openStockTab (36-01 deferred 2, 36-02 deferred 2). Covered by step 4. Post-merge correction (2026-11-01): not covered by step 4. The GUI-01 rows drive a bare `window.open` and cover only the receiver's null fall-through, not a palette invocation of the command.

Carried forward but **not** covered by this script:
- The dead-channel throw path of the stock-window command (36-02 deferred 2). No scenario kills the actor channel.
- An adopt attach failure after a successful ack (36-02 deferred 4). Post-merge correction (2026-11-01): fixed in code (36-REVIEW WR-01); the live leg is still missing.
- The late-ack edge (36-01 deferred 6). Post-merge correction (2026-11-01): fixed in code (36-REVIEW WR-02); the live leg is still missing.
- Adopted overlays entering the 31.1 tab host (36-01 deferred 4). Post-merge correction (2026-11-01): now in code (`tabHostAddTab` in `adoptPendingOverlay`, 37-REVIEW CR-01); the live leg is still missing.
- The Phase 35 `IDL_SHIMS` merge item (36-01 deferred 1). Post-merge correction (2026-11-01): closed by the "Merge into main" section in 36-02-SUMMARY.
- The CLAUDE.md rule-5 owner wording (36-02 deferred 1).
- The VALIDATION manual rows: VB-01 visual parity, and the stock window opening and closing cleanly.

## Known Stubs

None.

## Threat Flags

None. The script is a test harness. Its patches live only in the probe session's profile and memory.

## Verification

- `node --check scripts/verify-new-window-adopt-live.mjs`: clean.
- With no objdir: `--scenario adopt-order`, `--scenario adopt-scheme` and `--self-test` each print the purgecaches line, then one `harness: firefox-bidi: …/objdir/dist/bin/powerbrowser does not exist. Run the Phase 1 Firefox build first …` line (for `--self-test`: `--self-test: FAIL -- harness: the clean control could not be driven: …`), and exit 1. `--scenario bogus` prints `harness: unknown or empty --scenario list …` and exits 1.
- Acceptance greps:
  - `grep -c 'FAIL --'` = 17 (at least 9 required);
  - `xwininfo`: 0 matches;
  - Marionette, any case: 0 matches;
  - `.planning/`: 0 matches;
  - the only `setTimeout` is the 4 s in-page reply ceiling, and there is no `sleep(`.
- `grep -n '"new-window-adopt-live|node'` (line 4970) and `'"new-window-adopt-live-self-test|node'` (line 4971) each print one line inside the live block opened at line 4762.
- `bash -n scripts/verify-platform.sh`: clean.
- `scripts/verify-platform.sh --quick` (with the new script staged): exit 0, `verify-platform: PASS -- all checks passed`.

## Self-Check: PASSED

- Files: `scripts/verify-new-window-adopt-live.mjs` exists, and `scripts/verify-platform.sh` carries both rows.
- Commits: `d9861749` and `10ee1263` are each an ancestor of HEAD (`git merge-base --is-ancestor`).
- Live proof: deferred (see Status), not claimed.
