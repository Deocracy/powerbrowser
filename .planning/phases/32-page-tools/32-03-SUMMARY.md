---
phase: 32-page-tools
plan: "03"
subsystem: chrome-boundary
tags: [page-tools, print, system-dialog, print-today-probe, printOpen, live-harness, catalogue]
status: complete
requires:
  - phase: 32-page-tools (plan 01)
    provides: the web-tab arms and walls, the live skeleton, the downloads-today verdict
  - phase: 32-page-tools (plan 02)
    provides: the printOpen (Ctrl+P) page-focus relay row as a focusPage stub, the nine relay rows, the copy pins
provides:
  - webTabPrint arm in handleWebTabAction (system-dialog branch only), with its union member and KIND_CLASSES entry
  - print-today verdict recorded in scripts/lib/pb-probe-verdicts.json
  - print() widget method; printOpen relay row upgraded from the stub to print()
  - print failure notice in the chrome bar (contracted copy)
  - verify-page-tools-print-save.mjs static gate with --self-test
  - live print scenario (headless part) with a tab-modal plant
affects:
  - 32-05 (upgrades the saveOpen stub to savePage(), the same way)
  - 32-06 (edit-today probe; the print-today verdict is recorded here)
  - end-of-milestone verification pass (on-screen print dialog and its cancel)
tech-stack:
  added: []
  patterns:
    - module-level print helper after the frozen PowerBrowserAPI literal, the same shape as the zoom and downloads helpers
    - probe verdict written by the live harness and read as a gate by the print build
key-files:
  created:
    - scripts/verify-page-tools-print-save.mjs
  modified:
    - powerbrowser/shell/PowerBrowserAPI.sys.mjs
    - powerbrowser/INTERNAL-APIS.md
    - theia/extensions/tab-uris/src/browser/web-tab.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar-shortcuts.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx
    - theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar.css
    - scripts/verify-web-tab-bridge.mjs
    - scripts/verify-page-tools-live.mjs
    - scripts/verify-platform.sh
    - scripts/verify-shell-error-copy.mjs
    - scripts/verify-page-tools-zoom-mute.mjs
    - scripts/lib/pb-probe-verdicts.json
key-decisions:
  - "The print-today probe runs the completion half on the overlay's browsing context: a silent PDF print through BrowsingContext.print, plus an instantiation check of the print-dialog service. No dialog window is opened, because an OS window cannot be closed headlessly."
  - "The verdict string is completes-silent-pdf-dialog-service-present. It records what was measured. It does not claim the on-screen system dialog was exercised."
  - "The arm takes selectionOnly only. frameOnly is not applied by the system path (stock applies it in the preview path, which is never built), so it is not in the union."
  - "The printUtils.js behaviour is reproduced inside the boundary (getPrintSettings, checkForSelection, handleSystemPrintDialog, BrowsingContext.print). printUtils.js itself is never loaded."
  - "Print settings are persisted (last printer, persist-settings mask) only after the dialog confirms, as stock does. A cancel writes nothing."
  - "The print gate reads the recorded verdict. A missing or non-completing print-today verdict is a red gate and a blocker (D-08a). No stock-window fallback is built."
  - "The live print scenario drives only the headless parts. Ctrl+P is not pressed live, because the press opens the OS dialog."
patterns-established:
  - "A probe verdict is recorded by the live harness, and the build gate reads it from the verdict file."
  - "Failure copy for a print uses the bar's existing role=status notice, cleared by the next print."
requirements-completed: [PAGE-03]
duration: "not measured"
completed: 2026-10-31
commits: 1
plan_head_before: 2247b6a6678918defc7dc60199cdefed46048a72
plan_head_after: 68547992a5ca1d7f4a139a91c63afa91d184d484
actuals:
  tokens: 23431
  tasks: 2
  commits: 1
---

# Phase 32 Plan 03: System-dialog print (PAGE-03) Summary

**Chrome serves the system-dialog print branch behind a webTabPrint arm, the print-today probe is recorded as completing, and a Ctrl+P relay row now calls print(); the on-screen dialog and its cancel are deferred to the end-of-milestone pass.**

## Status

Complete for the build work and for every automated and live check the plan lists that a headless harness can run. The on-screen half (the OS print dialog opening for a focused page, the clean cancel, and window.print() from page content) needs a human-visible window and is listed under the end-of-milestone pass below.

## Performance

- **Tasks:** 2 of 2 executed, as one production commit (see Deviations).
- **Commits:** 1 production commit (`68547992`), then this SUMMARY and the state commit.
- **Realized diff:** about 23,431 tokens by the chars/4 scale over the changed lines. The plan estimate was 45,000.

## Accomplishments

- **Probe first (the plan's first step).** The print-today probe was not recorded by 32-01. It now runs as `print-today` in the live harness: the overlay's browsing context prints silently to a PDF file, and the print-dialog service is instantiated without opening a window. Verdict: `completes-silent-pdf-dialog-service-present`.
- **Chrome arm (PAGE-03).** `webTabPrint{tabId,selectionOnly?}` is routed in `WEB_TAB_ACTION_KINDS`, has one case arm, one union member and a KIND_CLASSES entry (`tab-navigation`), all in the same commit. The arm refuses a non-boolean option and replies `unknown-tab` for an unknown tab. The reply carries `where`, `cancelled` and `ok`, and no print data.
- **System path only.** The helper reads the printsettings service, applies saved prefs, opens the print-dialog service with the overlay's top chrome window, and calls `BrowsingContext.print(settings)` only after the user confirms. A cancel (NS_ERROR_ABORT) is a clean no-op that writes nothing.
- **Relay and widget.** `print()` is a widget method on the web-tab widget. The `printOpen` (Ctrl+P) row, which was a `focusPage` stub, now calls `tab.print()`. The row stays page-scoped and mirrored between `PAGE_SHORTCUTS` and `PAGE_KEYS`.
- **Failure notice.** A print whose dialog did not open shows `{App} couldn't open the print dialog. Press Ctrl+P to try again.` in a `role=status` line of the bar. The next print clears it. The copy is pinned in the copy gate.
- **Gate.** `verify-page-tools-print-save.mjs` derives the print family and compares routing as set equality. It requires the system dialog and `BrowsingContext.print`, refuses the tab-modal names and the browserDOMWindow shim in every chrome source (comments excluded), and requires a completing print-today verdict. Its `--self-test` plants six faults; each goes red naming its drift.
- **Live harness.** The `print` scenario (headless part) passes: refusal, unknown-tab, the printOpen row enabled while the page has focus, and no tab-modal box in chrome. Its `print-tab-modal` plant goes red naming `tab-modal box is in chrome`.

## Live results (this tree, rebuilt Theia app, patch 050 stamp verified)

| Check | Result | Evidence |
|---|---|---|
| `sha256sum -c --status objdir/.pb-050-build.sha256` | pass | stamp matches |
| `theia yarn build` | exit 0, 12.2 s | `scratchpad/pb-32-03-t2-build.log` |
| `--scenario print-today` | verdict recorded | `completes-silent-pdf-dialog-service-present` in `scripts/lib/pb-probe-verdicts.json` |
| `--scenario print` | PASS | headless part only |
| `--self-test` | PASS | 4 clean controls green (find, audio, print, keys-theia); 4 plants red (find-kind-dropped, audio-page-silent, print-tab-modal, row-enabled-while-theia-focused) |
| `--scenario find,zoom,audio,downloads,keys-theia,print` | all PASS | regression |
| `verify-page-tools-print-save.mjs` and `--self-test` | PASS | 6 plants red |
| `verify-web-tab-bridge.mjs` and `--self-test` | PASS | 26 kinds, 32 plants |
| `verify-shell-error-copy.mjs` | PASS | print notice pinned |
| `verify-shortcut-relay.mjs` | PASS | 37 rows, printOpen Ctrl+P only on the page-scoped row |
| `verify-page-tools-zoom-mute.mjs` and `--self-test` | PASS | 8 plants red after the plant anchor fix |
| `tsc -b theia/extensions/tab-uris`, `tsc --noEmit -p theia/extensions/chrome-bar` | pass | |
| `check-internals-boundary.sh --catalogue`, `verify-ng-040-internals-catalogue-lines.mjs` | PASS | seven new rows |
| `scripts/verify-platform.sh --quick` | PASS, exit 0 | |

## Task Commits

1. **Task 1 and Task 2 (combined): print arm, probe verdict, print() and printOpen upgrade, gates and live scenario**: `68547992`

## Files Created or Modified

- `powerbrowser/shell/PowerBrowserAPI.sys.mjs`: the `webTabPrint` case arm, the `WEB_TAB_ACTION_KINDS` member, and the module-level `webTabPrintReply` and `webTabPrintHasSelection` helpers after the zoom helper.
- `powerbrowser/INTERNAL-APIS.md`: seven new Touchpoints rows, one per print-helper line, and the existing rows remapped to the new line numbers.
- `theia/extensions/tab-uris/src/browser/web-tab.ts`: the union member, the `print()` method and the `printFailed` flag.
- `theia/extensions/chrome-bar/src/browser/chrome-bar-shortcuts.ts`: the `printOpen` row calls `tab.print()`.
- `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx` and `chrome-bar.css`: the print notice render and its style.
- `theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts`: the `printFailed` copy.
- `scripts/verify-page-tools-print-save.mjs`: new static gate with `--self-test`.
- `scripts/verify-page-tools-live.mjs`: the `print-today` probe, the `print` scenario and the `print-tab-modal` plant.
- `scripts/verify-web-tab-bridge.mjs`: KIND_CLASSES entry for `webTabPrint`.
- `scripts/verify-shell-error-copy.mjs`: pin for the print notice.
- `scripts/verify-page-tools-zoom-mute.mjs`: the stale-union plant anchor follows the union edit.
- `scripts/verify-platform.sh`: quick rows for the print gate and its self-test; the live row comment.
- `scripts/lib/pb-probe-verdicts.json`: the `print-today` key.

## Decisions Made

- The probe measures the completion half and the service's presence. It does not open the on-screen dialog. The verdict string says exactly that.
- `frameOnly` is not in the union. The system path does not apply it; stock applies it only in the preview path that is not built here.
- Print settings are persisted only after a confirmed dialog, as stock does.
- A print-today failure is a blocker, and the gate says so. No stock-window fallback is built (D-08a).
- The live scenario does not press Ctrl+P, because that press opens the OS dialog.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The catalogue `--fix` mis-remapped existing rows**
- **Found during:** the catalogue check after the boundary edit.
- **Issue:** `verify-ng-040-internals-catalogue-lines.mjs --fix` assigned several existing Touchpoints rows to the wrong occurrence (for example, `searchLazy` moved one line off, and two `Services.uriFixup` rows collided).
- **Fix:** the committed catalogue was restored, every HEAD row was remapped through the difflib line mapping of the boundary file (226 rows, none unmapped), and seven rows were appended for the new print-helper lines. Both catalogue gates pass.
- **Commit:** `68547992`

**2. [Rule 1 - Bug] Stale plant anchor in the zoom-mute gate**
- **Found during:** the quick gate run.
- **Issue:** the union edit moved the terminal `;` of the `webTabMute` union line, so the gate's stale-union plant no longer matched its anchor and the self-test went red.
- **Fix:** the plant anchor now matches the line without the `;`. The self-test passes with 8 plants.
- **Commit:** `68547992`

**3. [Rule 1 - Bug] printUtils line references in the catalogue were wrong**
- **Found during:** a check of the cited line ranges against the pinned upstream file.
- **Fix:** the catalogue rows and the helper's header comment cite the verified lines (`getPrintSettings :485-530`, `handleSystemPrintDialog :542-567`, the cancel at `:551`, the persist mask at `:562-565`, `kInitSaveAll` at `:528`).
- **Commit:** `68547992`

### Scope Deviations

**4. One production commit for both tasks.** The plan split the work into two commits. The chrome arm, the union, the bridge, the boundary catalogue, the live harness and the copy all share files that cannot be split cleanly by path (`web-tab.ts`, `PowerBrowserAPI.sys.mjs`, `verify-page-tools-live.mjs`, `INTERNAL-APIS.md`). The two tasks are therefore one commit, with the task boundary recorded here.

**5. The plan's `browserDOMWindow` count check cannot read 0.** The acceptance line asks `grep -n browserDOMWindow PowerBrowserAPI.sys.mjs` to print 0. The file already names `nsIBrowserDOMWindow` in comments from earlier phases, and the plan's own Task 1 action asks for a D-09a comment that names it. The print-save gate strips comments before it checks for the literal, which is what the rule intends.

**6. No print command handler in `chrome-bar-commands.ts`.** The plan named a print command handler to upgrade. 32-02 registered no Theia command for these keys (its Deviation 4), so the only handler is the `printOpen` row in `chrome-bar-shortcuts.ts`, which is what was upgraded.

**7. Print-to-file default not reproduced.** Stock sets a default `mozilla.pdf` file name when the destination is a file and no name is set. The system dialog returns the chosen file on the confirmed path, so the default is not applied here. If a saved setting carries a file destination with no name, the dialog must supply one; this is not checked live.

**8. Print-today probe scope.** The probe proves that `BrowsingContext.print` on the overlay completes with a PDF written, and that the dialog service exists. It does not prove that the on-screen dialog opens, or that a user's confirmation prints through it.

## Deferred to the end-of-milestone verification pass

These need a visible OS window. The harness cannot close a GTK print dialog headlessly. A KWin-based close via `qdbus` is available on this host, but was not adopted, because it drives the desktop and risks leaving a dialog open.

- **Ctrl+P on a focused page opens the system print dialog** for that overlay (not the tab-modal preview), and Cancel closes it with no print job.
- **Confirm prints** through the dialog and produces output (printer or PDF).
- **window.print() from page content** is absent-with-reason (D-09a). Live, it is not run, because it would open the dialog if the stock path reached the overlay. The static gate covers the absence of any shim.
- **Print failure notice:** its placement in the bar, its look, and the copy review.

## Issues Encountered

- The first live probe run returned `fails-undefined-unknown`. The cause was a BiDi-serialized object. The helper now returns a JSON string and parses it in node, as the other helpers do. The second run recorded the verdict.
- The live `print` plant, the self-test and the regression chain each took several minutes, because the dropped-kind cases wait out their timeouts.

## Next Phase Readiness

- 32-05 (save) can upgrade `saveOpen` to `savePage()` in the same way.
- 32-06 records the edit-today verdict. The print-today verdict is already in the file, and the print gate reads it.
- The end-of-milestone pass must cover the on-screen items above.

## Self-Check

Files and commits, checked against disk and git after the commit:

- `[ -f scripts/verify-page-tools-print-save.mjs ]`, `[ -f .planning/phases/32-page-tools/32-03-SUMMARY.md ]`: both present.
- `git merge-base --is-ancestor 68547992 HEAD`: ancestor of HEAD.
- `node scripts/verify-page-tools-print-save.mjs` and `--self-test`: PASS.

## Self-Check: PASSED (files, commit and gates) / DEFERRED (on-screen items, listed above)

---
*Phase: 32-page-tools*
*Completed: 2026-10-31*
