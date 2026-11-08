---
phase: 32-page-tools
plan: "04"
subsystem: chrome-boundary
tags: [page-tools, downloads, downloads-view, row-actions, panel, live-harness, catalogue]
status: partial
requires:
  - phase: 32-page-tools (plan 01)
    provides: the webTab page-tools arms and walls, the live skeleton, pb-probe-verdicts.json with the downloads-today verdict
provides:
  - webTabDownloadsSubscribe and webTabDownloadsAction arms, one chrome-side Downloads view
  - downloadsChanged push carrying serialized rows (no path, no error text, no Download object)
  - Downloads button with badge, panel with rows, Downloads command, copy and copy pins
  - verify-page-tools-downloads.mjs static gate with --self-test
  - live downloads scenario in verify-page-tools-live.mjs
affects:
  - 32-02, 32-03, 32-05, 32-06, 32-08 (run downloads as regression, per the plan)
tech-stack:
  added: []
  patterns:
    - one view per session on Downloads.getList(Downloads.ALL), installed once and re-pointed at the sending frame
    - row ids assigned chrome-side, never a path from the frame
key-files:
  created:
    - scripts/verify-page-tools-downloads.mjs
  modified:
    - powerbrowser/shell/PowerBrowserAPI.sys.mjs
    - powerbrowser/INTERNAL-APIS.md
    - theia/extensions/tab-uris/src/browser/web-tab.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx
    - theia/extensions/chrome-bar/src/browser/chrome-bar-commands.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar.css
    - scripts/verify-web-tab-bridge.mjs
    - scripts/verify-page-tools-live.mjs
    - scripts/verify-shell-error-copy.mjs
    - scripts/verify-chrome-bar-commands.mjs
    - scripts/verify-platform.sh
key-decisions:
  - "The Download object never crosses to the frame. Each row is a primitive object with a chrome-assigned id, the url, the filename, byte counts, a state word and three flags. The path and the error text stay in chrome."
  - "Cancel runs removePartialData after cancel(), as the stock panel does. Without it a retry resumes a partial file and fails with NS_ERROR_NOT_RESUMABLE on a server without byte ranges (found live)."
  - "Retry is fire-and-forget (start().catch), as the stock panel calls it. Awaiting start() blocks the reply until the whole transfer ends."
  - "The unread count is frontend state: finished rows seen when the panel opens are recorded in the widget. No downloadsUnread field is added to WebTabState."
  - "The view is subscribed on every web-tab activation (setCurrentWebTab path) and by the panel, so a live session always holds the view."
  - "The channel owns the downloadsChanged subscription (WebTabChannel.onDidChangeDownloads); the widget consumes it. This keeps the bridge push-kind parity gate green in the first commit."
  - "The Downloads command is a visible Browser command. The command contract gate gained it by deliberate edit (contract grows from four to five labels)."
  - "Pushes are bounded to the newest 50 rows (T-32-07d)."
patterns-established:
  - "Download rows are serialized inside the view callbacks and the push is the whole bounded row list; a batch (addView replay) pushes once at its end."
requirements-completed: []
duration: "not measured (live-run iteration)"
completed: "2026-10-31"
commits: 2
plan_head_before: 4ac3143f65e306d2f39d1f0b51fb31a0cf7e9066
plan_head_after: 74e904705f009a2286a29807fa648705cfce58d0
actuals:
  tokens: 25412
  tasks: 2
  commits: 2
coverage:
  - id: D1
    description: "Every page-started download appears as a row with its bytes (no silent save visible to the panel)"
    requirement: PAGE-06
    verification:
      - kind: e2e
        ref: "scripts/verify-page-tools-live.mjs#downloads"
        status: pass
    human_judgment: false
  - id: D2
    description: "Cancel stops the transfer and Retry restarts it to a finished row"
    requirement: PAGE-06
    verification:
      - kind: e2e
        ref: "scripts/verify-page-tools-live.mjs#downloads"
        status: pass
    human_judgment: false
  - id: D3
    description: "Open and Show in folder call through chrome to the OS"
    verification: []
    human_judgment: true
    rationale: "Not driven live: both launch OS applications in the test session. The static gate checks the action set only."
  - id: D4
    description: "The Downloads button, badge and panel render, keyboard-navigate and close as contracted"
    verification: []
    human_judgment: true
    rationale: "No UI scenario was added and no visual check was run. The panel code typechecks and is built; its look and keyboard behaviour are unverified."
  - id: D5
    description: "Static contract: routing, frozen action set, row fields and view lifecycle agree across shell, union and gate"
    requirement: PAGE-06
    verification:
      - kind: unit
        ref: "scripts/verify-page-tools-downloads.mjs#self-test"
        status: pass
    human_judgment: false
---

# Phase 32 Plan 04: Downloads view push, row actions and panel Summary

**Chrome serves one Downloads view and pushes serialized rows; the live downloads scenario proves a page-started download becomes a row that Cancel stops and Retry finishes, while Open, Show in folder and the panel's on-screen behaviour are not yet verified.**

## Status

This plan is **partial**. PAGE-06 is not marked complete in REQUIREMENTS.md or ROADMAP.md.

1. Proven live: a page-started download appears as a row with bytes, Cancel moves it to canceled, Retry restarts it to a finished row (`downloads: PASS`).
2. Not proven live: Open and Show in folder (they launch OS applications, so the scenario does not call them).
3. Not proven: the panel on screen. No UI scenario or visual check was run after the build.
4. Not run: the `audio` scenario, which is the known 32-01 failure and is outside this plan.

## Live results (rebuilt Theia app, binary with patch 050 verified by sha256)

| Check | Result | Evidence |
|---|---|---|
| `page-tools-live --scenario downloads` | PASS | row with 196608-byte target, Cancel to canceled, Retry to finished (succeeded true) |
| `page-tools-live --self-test` | PASS | clean controls for find and downloads green; `find-kind-dropped` red naming `no findMatches push` |
| `scripts/lib/pb-probe-verdicts.json` | unchanged | `git diff --exit-code` clean; the downloads-today verdict stays the pre-fix evidence |
| `verify-platform.sh --quick` | PASS | run after both commits' gates were green |

The planted `silent-download` fault from the plan was removed (see Deviations, item 7). The static gate's dropped-`addView` plant covers the silent-save path.

## Performance

- **Tasks:** 2 of 2 executed.
- **Commits:** 2 task commits (`f9c9da0`, `74e9047`), plus this SUMMARY commit.

## Accomplishments

- **Downloads view (PAGE-06, chrome side).** `webTabDownloadsSubscribe` installs one view on `Downloads.getList(Downloads.ALL)` on first use and re-points the push at the sending frame on later calls. `onDownloadBatchEnded` pushes the replayed list once. Quit removes the view.
- **Row actions.** `webTabDownloadsAction` runs cancel (with `removePartialData`), launch, showContainingDirectory, retry and remove by chrome-assigned row id. An unknown id returns `unknown-download`.
- **Serialized rows.** `{id, url, filename, bytesTotal, bytesReceived, state, succeeded, canceled, error}`. The path and the error text never leave chrome. The frame-side validator drops malformed rows.
- **Panel and button.** Downloads button with a badge (in-progress plus unread finished), a `.pb-chrome-bar-dropdown` panel with 32px rows, per-state actions, Enter runs the default action, ArrowUp/Down move focus, Esc closes and returns focus to the page. Opening the panel marks finished rows read.
- **Gates.** `verify-page-tools-downloads.mjs` derives the routed set, the arms and the union, and compares the frozen action set across the TS type, the frozen array and the switch. It compares the serialized keys with `WebTabDownloadRow`, and checks the view lifecycle and the push shape. Its self-test plants five faults, each red naming its drift.
- **Catalogue.** Two new `PowerBrowserAPI.sys.mjs` touchpoint rows (`Downloads` lazy import and `Services.obs.addObserver` for quit). The `--fix` repair and the manual row repair are described under Deviations.

## Task Commits

1. **Task 1: chrome downloads arms, view, gate, live scenario**: `f9c9da0`
2. **Task 2: panel, command, copy and copy pins, live proof**: `74e9047`

## Files Created or Modified

- `powerbrowser/shell/PowerBrowserAPI.sys.mjs`: two kind routings, two arms, the module-level Downloads section at the end of the file.
- `powerbrowser/INTERNAL-APIS.md`: two touchpoint rows; corrected line references for rows the arms moved.
- `theia/extensions/tab-uris/src/browser/web-tab.ts`: union members, `DownloadAction`, `WebTabDownloadRow`, `downloadRowsOf`, the `downloadsChanged` subscription, `downloadsSubscribe` and `downloadAction` on the widget.
- `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx`: the downloads button, panel, keyboard handling and the current-tab subscribe.
- `theia/extensions/chrome-bar/src/browser/chrome-bar-commands.ts`: the Downloads command and the panel-opener setter.
- `theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts`: ten copy keys and `downloadBytes`.
- `theia/extensions/chrome-bar/src/browser/chrome-bar.css`: panel and badge rules, token colours only.
- `scripts/verify-page-tools-downloads.mjs`: new static gate.
- `scripts/verify-page-tools-live.mjs`: `downloads` scenario and its served slow fixture.
- `scripts/verify-web-tab-bridge.mjs`, `scripts/verify-shell-error-copy.mjs`, `scripts/verify-chrome-bar-commands.mjs`, `scripts/verify-platform.sh`: classification, copy pins, command contract, registry rows.

## Decisions Made

- The `Download` object never crosses to the frame. Rows carry a chrome counter as their id, not a path.
- `downloadsUnread` is not added to `WebTabState`. The unread count is frontend state in the widget.
- `webTabDownloadsSubscribe` takes a required `tabId`. The plan listed it as optional, but the arm's validity wall requires one on every arm, and the panel only runs on a web tab (UI-SPEC: controls disabled on non-web tabs).
- Rows are capped at the newest 50 per push (T-32-07d).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Cancel left partial data; retry failed with NS_ERROR_NOT_RESUMABLE**
- **Found during:** live `downloads` run (retry row `failed`, `error` true, zero bytes).
- **Issue:** `cancel()` kept the partial file, so `start()` tried to resume it. The fixture serves no byte ranges.
- **Fix:** cancel now calls `removePartialData()` after `cancel()`, as the stock `downloadsCmd_cancel` does.
- **Commit:** `f9c9da0`

**2. [Rule 1 - Bug] Retry awaited the whole transfer**
- **Found during:** live run.
- **Issue:** `await download.start()` held the reply until the attempt ended, and a failing attempt reported as a failed action.
- **Fix:** `start().catch(...)` without await, as the stock `downloadsCmd_retry` does. The outcome arrives as a row push.
- **Commit:** `f9c9da0`

**3. [Rule 1 - Bug] Harness indexed the wrong push**
- **Found during:** first live run.
- **Issue:** `waitForPush` already returns the matched index, and the scenario subtracted one more.
- **Fix:** index `at` directly. The scenario also reports the last row state on timeout, which made item 1 diagnosable.
- **Commit:** `f9c9da0`

**4. [Rule 3 - Blocking] Catalogue rows after the arms moved**
- **Found during:** `verify-ng-040-internals-catalogue-lines.mjs`.
- **Issue:** the arms are inserted above the catalogued helpers, so every later row moved by 24 lines. `--fix` mapped two rows to the same line, and did not renumber the "Deliberately not touched" section.
- **Fix:** `--fix` run, then manual renumbering of the mis-mapped and unrenumbered rows, then two new rows for the new lines. Both catalogue gates pass.
- **Commit:** `f9c9da0`

**5. [Rule 2 - Missing] Push-kind parity gate needs a frontend subscriber in the same commit**
- **Found during:** bridge gate after Task 1 shell changes.
- **Fix:** the channel subscribes `downloadsChanged` in `WebTabChannel.init` and exposes the rows through `onDidChangeDownloads`. The widget consumes that emitter in Task 2.
- **Commit:** `f9c9da0`

**6. [Rule 1 - Bug] Two earlier gate failures from my own edits**
- `verify-site-identity` rejected `err.message` in a web-tab arm (O-31-B). Fixed: the subscribe arm logs a fixed string.
- `verify-page-tools-zoom-mute --self-test` lost its plant anchor when the union changed. Fixed: the new union members sit above the `webTabMute` member, so that line is unchanged.
- **Commit:** `f9c9da0`

### Scope Deviations

**7. Silent-download live plant removed.** The plan's `silent-download` plant (view unsubscribed, expect `row missing`) went green on the rebuilt app: the widget now subscribes on every tab activation, so skipping the scenario's own subscribe call does not remove the view. A faithful plant needs a chrome test hook, which this plan does not build. The plant and its `subscribe` switch were removed, and the static gate's dropped-`addView` plant covers the silent-save path. **Commit:** `74e9047`

**8. Open and Show in folder not driven live.** Both launch OS applications. The shell arms and the static gate check the action set; the live scenario does not call them.

**9. Panel UI not verified on screen.** No UI scenario was added and no visual or keyboard check was run. The panel typechecks and is in the rebuilt bundle.

**10. Command contract grew.** The Downloads command is visible in the palette, so `verify-chrome-bar-commands.mjs` gained its id and label by deliberate edit (four labels became five).

**11. `remove` is in the frozen action set but has no UI.** The plan's set includes it; the UI spec excludes a destructive binding, so the panel never sends it.

**12. `CONTROL_OF downloads-today → downloads` not added.** It has no behaviour in the harness and was not needed for the proof.

**Total deviations:** 6 auto-fixed (4 bugs, 1 blocking, 1 missing), 6 scope items.
**Impact on plan:** The downloads view and row actions work and are proven for cancel and retry. The unproven items are Open, Show in folder and the panel's on-screen behaviour, and the status stays `partial` until they are.

## Issues Encountered

- The first retry failure hid its cause behind a boolean error field. A temporary diagnostic field found the NS_ERROR_NOT_RESUMABLE message, and it was removed before the commit.
- The Theia build ran twice: once before the CSS and command edits, and once after. The live proof ran on the second build.

## Next Phase Readiness

- Plans 32-02, 32-03, 32-05, 32-06 and 32-08 can run `--scenario downloads` as regression. The scenario is green on this tree.
- The `audio` scenario remains the known 32-01 failure and was not run here.
- Before this plan can be marked complete: drive Open and Show in folder in a live session, and check the panel on screen.

## Self-Check

- `[ -f scripts/verify-page-tools-downloads.mjs ]`, `[ -f powerbrowser/shell/PowerBrowserAPI.sys.mjs ]`: present.
- `git merge-base --is-ancestor f9c9da0 HEAD` and `git merge-base --is-ancestor 74e9047 HEAD`: both are ancestors of HEAD.
- `grep -rn 'DownloadsPanel\|DownloadsCommon' powerbrowser/shell/`: no matches.

## Self-Check: PASSED (files, commits, gates) / PARTIAL (Open, Show in folder and on-screen panel not proven live)

---
*Phase: 32-page-tools*
*Completed: 2026-10-31*

## Deferred to the end-of-milestone verification pass

Per the owner's 2026-10-31 rule (all verification at the end of v1.5), the two unproven items are checks, not build work, and are queued for the final pass:
- Open and Show in folder driven live (they launch OS applications).
- Downloads panel on screen: button, badge, rows, keyboard, Esc.
