---
phase: 36-new-window-links-as-web-tabs
plan: "02"
subsystem: theia-frontend
tags: [new-window, adopt, web-tabs, gui-01, openStockTab, static-gate]
status: complete
requires:
  - phase: 36-new-window-links-as-web-tabs
    provides: 36-01 chrome half (adoptTab and dropAdoptedTab pushes, the webTabAdopt arm, the 5 s openStockTab fallback) and the frontend adopt half in 049fe84f
  - phase: 01-platform-extraction-and-rename
    provides: GUI-01 command id and label, the openStockTab actor kind
provides:
  - WebTabOpenHandler adoptTab subscription that catches and logs (kind only) an async adopt() rejection
  - powerbrowser.open-browser-window sends only the openStockTab actor kind; the window.open popup branch is deleted
  - verify-web-tab-bridge.mjs no-stock-escape rule re-pointed (browser-window-command.ts is the one allow-listed openStockTab sender), a dead-channel rule, and 4 new plants (36 total)
affects:
  - 36-03 (live adopt scenarios, close-reselect, GUI-01 rows with the popup branch gone, the dead-channel throw path)
  - CLAUDE.md hard rule 5 (owner wording change deferred, below)
tech-stack:
  added: []
  patterns:
    - the stock window is reached only through the openStockTab actor kind from one allow-listed sender
key-files:
  created: []
  modified:
    - theia/extensions/tab-uris/src/browser/web-tab.ts
    - theia/extensions/tab-uris/src/browser/browser-window-command.ts
    - scripts/verify-web-tab-bridge.mjs
key-decisions:
  - "Task 1 delivered in 049fe84f, verified. The ack-before-addWidget order from 36-01 is kept: the plan's add-then-ack order would make the widget's own webTabOpen build a second overlay."
  - "With the actor channel not known alive, or a non-web target, the stock-window command throws its existing actionable error verbatim. It no longer falls back to window.open (accepted D-36 reduction)."
  - "The dead-channel rule checks that the non-alive branch throws an error naming the command id and the command palette. It does not compare the whole string, so the copy can be reworded without a gate edit."
  - "The openStockTab ban covers chrome-bar sources only, as the plan scopes it."
  - "CLAUDE.md is not edited by an agent. The rule-5 route sentence is an owner item."
patterns-established:
  - "A ban-only gate rule keeps a positive control on the allow-listed sender, plus a plant that adds a second sender."
requirements-completed: []
duration: "about 15 min"
completed: "2026-11-01"
commits: 3
plan_head_before: da06126d742a23aa4c3d962ba3b0d9803738477c
plan_head_after: 34ddf2c61eeece0ba226b29fb02528c9f0c37793
actuals:
  tokens: 3441
  tasks: 3
  commits: 3
---

# Phase 36 Plan 02: Frontend adopt verification and GUI-01 onto openStockTab Summary

**The frontend adopt half from 36-01 is verified, and its push subscription now catches async failures. The stock-window command now reaches stock chrome only through the openStockTab actor kind, with no popup branch. The bridge gate allows that one sender and goes red on a second sender or a popup in the dead-channel branch.**

## Status

Complete for static scope. Nothing was run live (owner ruling: no `./mach build`, no live browser). Live proof belongs to 36-03 and is listed under Deferred Items.

## Performance

- **Tasks:** 3 of 3. Task 1 was a verification plus a one-line fix.
- **Commits:** 3 code commits (`93da6b93`, `2cd01c82`, `34ddf2c6`), plus this SUMMARY commit.
- **Realized diff:** about 3,441 tokens by the chars/4 estimate (plan estimate 60,000, which included the Task 1 code that landed in 36-01). 3 files, 76 insertions, 43 deletions.

## Accomplishments

- **Task 1 verified (049fe84f).** All acceptance greps hold: `kind: 'webTabAdopt'` is a union member and is sent, there is one `onPush('adoptTab'` and one `onPush('dropAdoptedTab'`, the `unknown-tab` sweep line is present, `mode: 'tab-after'` appears twice (openInBackground and adopt), and `pcKey` reaches no title, tooltip or user error. The must-haves were checked one by one:
  - *Adjacency:* the tab is added `tab-after` the opener widget. If the opener has closed or is unknown, the tab is added at the end of the main area, so the navigation is never dropped.
  - *Background-aware focus:* `activateWidget` runs only when `background` is false, so a background adopt leaves the opener focused.
  - *Unknown-tab reply:* any reply that is not ok, including `unknown-tab` and a timeout, sends `webTabClose` for the widget id and disposes the unattached widget. This covers the late-ack edge.
  - *dropAdoptedTab:* disposes the named widget if this frontend still has it.
  - *Malformed push:* dropped, and logged as `adopt dropped: adoptTab` (kind only).
  - *Close-reselect:* no new code. Theia's `ApplicationShell` handles it, and 36-03 asserts it live.
- **Task 1 gap fixed (93da6b93).** `adopt()` is async. The push router's synchronous try/catch could not see its rejection (for example, `createWidget` or `activateWidget` failing), so the rejection surfaced as an unhandled promise rejection carrying the raw error. The subscription now catches it and logs `adopt failed: adoptTab` (kind only), as the plan's "each in try/catch logging kind only" requires.
- **Task 2 (2cd01c82).** `openBrowserWindow` sends `requestStockTab` (the `OPEN_STOCK_TAB_KIND` actor kind) when `channelAlive === true` and the target is empty or http(s). Otherwise it throws the existing error verbatim, which names the command and points to the command palette. The `window.open(target, '_blank')` call and its null branch are deleted. `probeChannel` stays off the click path, and `requestStockTab` keeps its cancelable, bubbling `document.dispatchEvent` shape and its scheme pre-check. The class note records the Phase 36 route and the accepted reduction.
- **Task 3 (34ddf2c6).** In `verify-web-tab-bridge.mjs`, rule 6 now:
  - bans `OPEN_BROWSER_WINDOW_COMMAND_ID`, `window.open(` and `openStockTab` / `OPEN_STOCK_TAB_KIND` in every chrome-bar source;
  - requires `browser-window-command.ts` to define `OPEN_STOCK_TAB_KIND = 'openStockTab'`, to send `kind: OPEN_STOCK_TAB_KIND`, and to contain no `window.open(` (the positive control);
  - parses `openBrowserWindow`, finds the `this.channelAlive === true` gate, and requires the branch after it to throw an error naming the command id and the command palette, with no `window.open(` (the dead-channel rule).
  - New plants: lost send (the positive control), a second chrome-bar sender (`planted-sender.ts`, named in the failure), `dead-channel-opens`, and a dead branch that stops throwing. The `webTabAdopt` KIND_CLASSES entry from 36-01 was verified and not re-added. `dropAdoptedTab` correctly has no KIND_CLASSES entry, because it is a push kind.

## Task Commits

1. **Task 1: verify the frontend adopt half, catch the async rejection:** `93da6b93` (`fix(36-02): catch an adoptTab rejection the push router cannot see`). The rest of Task 1 is in `049fe84f` (36-01).
2. **Task 2: command onto openStockTab, popup branch deleted:** `2cd01c82` (`feat(36-02): the stock-window command speaks only openStockTab`)
3. **Task 3: re-pointed no-stock-escape rule, dead-channel rule, plants:** `34ddf2c6` (`test(36-02): re-point the no-stock-escape rule to the one openStockTab sender`)

## Files Created or Modified

- `theia/extensions/tab-uris/src/browser/web-tab.ts`: the `adoptTab` subscription catches a rejection and logs the kind only.
- `theia/extensions/tab-uris/src/browser/browser-window-command.ts`: openStockTab-only `openBrowserWindow`, with comments updated to match.
- `scripts/verify-web-tab-bridge.mjs`: re-pointed rule 6, the dead-channel rule, 4 new plants, and an updated header.

## GUI-01 surface

The command id `powerbrowser.open-browser-window` (`OPEN_BROWSER_WINDOW_COMMAND_ID`) and the label `Open Browser Window` are unchanged. The registration is unchanged. `verify-gui01-command.mjs`, `verify-ng-037-core-close-quits.mjs` and `verify-ng-038-actor-sender-wall.mjs` read only the id constant. `verify-group-channel.mjs` plant 5 still finds `return !document.dispatchEvent(request);`. All of them stay in assertion unchanged, and the GUI-01 live rows run in 36-03.

## Decisions Made

See `key-decisions` in the frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] adoptTab subscription did not catch an async rejection**
- **Found during:** Task 1 verification
- **Issue:** `onPush('adoptTab', detail => void this.adopt(detail))` relied on the router's synchronous try/catch, which cannot see a rejected promise. A failing `createWidget` or `activateWidget` would surface as an unhandled rejection with the raw error.
- **Fix:** `.catch(() => console.error('[@powerbrowser/tab-uris] adopt failed:', 'adoptTab'))`. If adopt fails before the ack, chrome's 5 s fallback still opens the page in the stock window.
- **Files modified:** `theia/extensions/tab-uris/src/browser/web-tab.ts`
- **Commit:** `93da6b93`

### Scope Deviations

- **Task 1 not re-implemented.** It landed in `049fe84f` as a recorded 36-01 deviation, with the ack sent before `addWidget`. That order is kept on purpose. The plan's order (addWidget, then activate, then request webTabAdopt) would make the widget's own `webTabOpen` build a second overlay.
- **CLAUDE.md not edited (caller instruction).** Task 2 asks for a rule-5 wording change. Changing the project's CLAUDE.md needs the owner's own approval, so the proposed text is a deferred owner item (below).
- **`yarn build` not run.** `theia/node_modules/.bin/tsc --noEmit -p theia/extensions/tab-uris` is clean, and the `tab-uris-typecheck` row in `--quick` passes. No full sidecar build was run, because nothing outside tab-uris changed.

## Deferred Items

1. **Owner item: CLAUDE.md hard rule 5, route sentence.** This replaces the span from "It opens via `window.open(url, '_blank')` from the Theia frontend" through "so `BROWSER_CHROME_URL` is stock upstream chrome." (CLAUDE.md lines 69-74). That span includes "The shell window carries no `nsIBrowserDOMWindow`", which stopped being true when 36-01 installed the receiver. Every other sentence of rule 5 stays, including "No chrome-side command is registered, and that absence is the ratified design, not an omission." Proposed replacement:

   > It opens from the Theia frontend through the `openStockTab` actor kind (`theia/extensions/tab-uris/src/browser/browser-window-command.ts` → `PowerBrowserAPI.openStockTab`), which puts the page in the stock browser window. A bare `window.open(url, '_blank')` from the Theia frame still falls through to `BROWSER_CHROME_URL`, because the shell's `browserDOMWindow` returns null for a Theia opener, so `nsWindowWatcher` opens a stock window through `AppWindow::CreateNewContentWindow`. Patch `020` no longer overrides that define, so `BROWSER_CHROME_URL` is stock upstream chrome.

   The substance of rule 5 still holds without this edit. A bare `window.open(url,'_blank')` from the Theia frame still falls through to stock chrome, because the 36-01 shim returns null for a Theia opener. No chrome-side command is registered: `openStockTab` is a store kind the frame sends, not a registered chrome command. The current text is out of date only in naming `window.open` as the command's route.

2. **Live proof (plan 36-03).** None of the following has been run:
   - an adopted tab landing after its opener, foreground and background;
   - close-adopted-reselects-opener;
   - the unknown-tab self-sweep and the dropAdoptedTab sweep;
   - the GUI-01 rows with the popup branch gone (a palette invocation opening the stock window through openStockTab);
   - the dead-channel throw path, if the channel is dead when that leg runs.

3. **Recorded reduction (D-36, accepted).** With the actor channel down (no chrome host, as in plain Theia in a dev browser, or a probe that timed out), the command now shows its actionable error instead of opening a stock window by `window.open`.

4. **Adopt attach failure after a successful ack.** If `addWidget` threw after chrome had moved the overlay to the widget's id, the overlay would stay with no widget. Only the kind is logged, and no sweep runs. This is not observed and is very unlikely, because `addWidget` is synchronous Lumino layout. It is recorded for 36-03.

## Known Stubs

None.

## Threat Flags

None. No new endpoint, kind or trust boundary. The change removes a route (the popup) and narrows the set of allowed senders.

## Verification

- `theia/node_modules/.bin/tsc --noEmit -p theia/extensions/tab-uris`: clean.
- `node scripts/verify-new-window-adopt.mjs`: PASS. `--self-test`: PASS, 16 plants. Push-versus-subscription parity holds with both halves present.
- `node scripts/verify-web-tab-bridge.mjs`: PASS (33 webTab kinds, 39 sources). `--self-test`: PASS, 36 plants, including the new second-sender and `dead-channel-opens` plants, each going red and naming its drift.
- `grep -n "window.open(" theia/extensions/tab-uris/src/browser/browser-window-command.ts`: nothing.
- `scripts/verify-platform.sh --quick`: exit 0, 168 rows PASS, 0 FAIL ("verify-platform: PASS -- all checks passed"). This includes `gui07-strip-spike-verdict` and its self-test, which were red at the end of 36-01. No registry row changed.


## Self-Check: PASSED

- Commits `93da6b93`, `2cd01c82`, `34ddf2c6` (and 36-01's `049fe84f`) are each an ancestor of HEAD (`git merge-base --is-ancestor`).
- All three modified files are present; no file was created.
