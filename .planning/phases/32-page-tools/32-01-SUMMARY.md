---
phase: 32-page-tools
plan: "01"
subsystem: chrome-boundary
tags: [page-tools, find, zoom, mute, finder, fullZoom, live-harness, probes]
status: partial
requires:
  - phase: 31.1-extension-tab-host
    provides: the per-overlay tab node, the 050 patch and its build stamp
provides:
  - webTabFind, webTabFindNext, webTabFindClose, webTabZoomIn, webTabZoomOut, webTabZoomReset, webTabMute arms in handleWebTabAction
  - WebTabState fields zoom, findCurrent, findTotal, findStatus, audioMuted, soundPlaying (pushed with url)
  - verify-page-tools-find.mjs and verify-page-tools-zoom-mute.mjs static gates with --self-test
  - verify-page-tools-live.mjs live skeleton (find, zoom, audio, downloads-today probe)
  - scripts/lib/pb-probe-verdicts.json with the downloads-today verdict
affects:
  - 32-02 (relay rows and copy build on these arms)
  - 32-03, 32-04, 32-06 (read pb-probe-verdicts.json; print-today and edit-today verdicts are missing)
tech-stack:
  added: []
  patterns:
    - module-level page-tools helpers at the end of PowerBrowserAPI.sys.mjs, because the frozen API object cannot grow
    - derive-and-compare static gates with planted faults, one family per gate
key-files:
  created:
    - scripts/verify-page-tools-find.mjs
    - scripts/verify-page-tools-zoom-mute.mjs
    - scripts/verify-page-tools-live.mjs
    - scripts/lib/pb-probe-verdicts.json
  modified:
    - powerbrowser/shell/PowerBrowserAPI.sys.mjs
    - powerbrowser/INTERNAL-APIS.md
    - theia/extensions/tab-uris/src/browser/web-tab.ts
    - scripts/verify-web-tab-bridge.mjs
    - scripts/verify-platform.sh
key-decisions:
  - "Find, zoom and mute helpers are module-level functions after the frozen PowerBrowserAPI literal, not members of it (the object is frozen; the boundary grows downward)."
  - "Find counts, zoom and audio state ride the flat state push as primitives (findCurrent, findTotal, findStatus, zoom, audioMuted, soundPlaying), not as nested objects."
  - "soundPlaying is event-driven (DOMAudioPlaybackStarted sets it, Stopped clears it) and is cleared on a new page, as upstream's tab soundPlaying is."
  - "Zoom steps the overlay's fullZoom along the live toolkit.zoomManager.zoomValues ladder; no pref is written (D-07, gated)."
  - "Find and zoom classify as tab-navigation, mute as selection (bridge KIND_CLASSES, per the CONTEXT choice log)."
  - "The live skeleton drives the arms through the Theia frame's WebTabChannel, because the page-focus key relay is plan 32-02's; no scenario depends on a key."
patterns-established:
  - "Each new webTab kind lands in one commit with its WEB_TAB_ACTION_KINDS member, case arm, union member and KIND_CLASSES entry."
requirements-completed: []
duration: "not measured (interrupted by live-run investigation)"
completed: "2026-10-31"
commits: 2
plan_head_before: 357df6224b2d6da45bcaaeb1b3dde45574649856
plan_head_after: 54d1e44723a44e19aab8f122249af0814a97998d
actuals:
  tokens: 43132
  tasks: 2
  commits: 2
---

# Phase 32 Plan 01: Page-tools chrome arms (find, zoom, mute) and live skeleton Summary

**Chrome serves find, zoom and mute arms with primitive state pushes and two static gates; live find, zoom and the mute round trip pass, while the audio playback push and the print-today and edit-today probes are not proven.**

## Status

This plan is **partial**. Two success criteria are not met:

1. **Audio playback is unproven live.** The `soundPlaying` push never arrives. Mute and unmute round-trip live (`audioMuted` true, then false). See Blockers.
2. **Two of three research probes are not recorded.** `print-today` and `edit-today` are not in `verify-page-tools-live.mjs` and have no verdict in `scripts/lib/pb-probe-verdicts.json`. Plans 32-04 and 32-06 will report a blocker until those verdicts exist.

## Performance

- **Tasks:** 2 of 2 executed. Task 2 is only partly proven (see Status).
- **Commits:** 2 task commits (`6ef566f`, `54d1e44`), plus this SUMMARY commit.
- **Realized diff:** about 43,132 tokens by the chars/4 estimate (plan estimate 55,000).

## Accomplishments

- **Find (PAGE-01).** `webTabFind`, `webTabFindNext` and `webTabFindClose` drive the overlay's own Finder through a per-overlay result listener. Counts and status return in the state push (`findCurrent`, `findTotal`, `findStatus`). A query is capped at 1024 characters, is never logged, and is never echoed in a refusal.
- **Zoom (PAGE-02).** `webTabZoomIn`, `webTabZoomOut` and `webTabZoomReset` step `fullZoom` along the live zoom ladder, clamped to its ends. Reset sets 1. The `zoom` field rides the same push as the URL. Nothing writes a pref, and no `browser-fullZoom` script is loaded.
- **Mute (PAGE-05).** `webTabMute` takes an explicit boolean (never a toggle), calls the overlay's own `mute()`/`unmute()`, and reads `audioMuted` back. Audio events set and clear `soundPlaying`. The address-bar sources are gated to carry no mute literal.
- **Gates.** `verify-page-tools-find.mjs` and `verify-page-tools-zoom-mute.mjs` derive the arms, the union, the routed set and the state fields, and compare them as set equality. Each has a `--self-test` with planted faults, and each planted fault goes red naming the drift. `verify-web-tab-bridge.mjs` classifies the new kinds.
- **Catalogue.** New boundary lines have `INTERNAL-APIS.md` rows. The check and the NG-040 line-reference gate both pass.
- **Live harness.** `verify-page-tools-live.mjs` runs find, zoom and audio, plus the `downloads-today` probe. Its self-test runs a clean find control and a planted dropped find kind, which goes red naming `no findMatches push`.

## Live results (this tree, built Theia app, binary with patch 050 verified)

| Scenario | Result | Evidence |
|---|---|---|
| find | PASS | findTotal 3 with a current index in a push; FindNext and FindClose verified |
| zoom | PASS | zoom above 1 after ZoomIn; back to 1 after ZoomReset |
| audio | FAIL (partial) | mute and unmute round-trip in pushes; no `soundPlaying` push within 20 s |
| downloads-today (probe) | recorded | `saved-to-download-dir-without-prompt` |
| live self-test | PASS | clean find control green; `find-kind-dropped` red naming `no findMatches push` |

## Task Commits

1. **Task 1: find and zoom chrome arms, union, state and gates**: `6ef566f`
2. **Task 2: mute arm, audio state and live skeleton**: `54d1e44`

## Files Created or Modified

- `powerbrowser/shell/PowerBrowserAPI.sys.mjs`: the seven arms, the Finder and audio listeners, the state push fields, and the module-level page-tools helpers at the end of the file.
- `powerbrowser/INTERNAL-APIS.md`: catalogue rows for the new `Ci.nsITypeAheadFind` lines, and corrected line references for rows the boundary edits moved.
- `theia/extensions/tab-uris/src/browser/web-tab.ts`: the union members, the `WebTabState` fields, the widget fields, and the type-guarded state mapping.
- `scripts/verify-web-tab-bridge.mjs`: `KIND_CLASSES` for the seven kinds.
- `scripts/verify-platform.sh`: quick rows for both static gates; live rows for `page-tools-live` and its self-test.
- `scripts/verify-page-tools-find.mjs`, `scripts/verify-page-tools-zoom-mute.mjs`: new static gates.
- `scripts/verify-page-tools-live.mjs`: new live harness.
- `scripts/lib/pb-probe-verdicts.json`: holds the `downloads-today` verdict only.

## Decisions Made

- Module-level helpers instead of `PowerBrowserAPI` members, because the frozen object cannot grow. The plan named `PowerBrowserAPI.webTabFind(...)`; the helpers are `webTabPageStateOf`, `ensureWebTabFinderListener`, `webTabZoomReply` and the rest, and are reached from the arms directly.
- Flat primitive push fields instead of the plan's `findMatches{current,total}` object. The union and state fields in the plan's own text use the flat names, and the push parity gate requires named literal keys.
- Live scenarios drive the arms through `WebTabChannel` rather than keys, because the page-focus key relay is plan 32-02's. The plan's `key-while-theia-focused` plant depends on that relay and is not added here.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Find arms never received match counts**
- **Found during:** live preparation, reading upstream `FinderParent.doFind`
- **Issue:** a remote finder counts matches only when `requestMatchesCount` is called. The findbar calls it; `doFind` does not. Without the call the `findTotal` push never arrives.
- **Fix:** `webTabFind` and `webTabFindNext` call `finder.requestMatchesCount(query, {linksOnly: false})` after the find.
- **Verification:** the find scenario passes live (findTotal 3).
- **Commit:** `54d1e44`

**2. [Rule 1 - Bug] Find reset inside the shield-reset block broke a sibling gate**
- **Found during:** quick gate run
- **Issue:** the find-state reset call sat inside `if (!sameDocument) { entry.blockedTrackers = 0; }`, which `verify-site-identity.mjs` matches as a contiguous block.
- **Fix:** the reset is a separate one-line guard after that block.
- **Commit:** `6ef566f`

**3. [Rule 1 - Bug] State push used a spread that the parity gate cannot read**
- **Found during:** quick gate run
- **Issue:** `...webTabPageFields(browser)` hides the keys from the state-router parity check.
- **Fix:** the push writes each key explicitly from a `pageFields` value.
- **Commit:** `6ef566f`

**4. [Rule 3 - Blocking] Catalogue rows could not be repaired by `--fix` alone**
- **Found during:** catalogue checks after each boundary edit
- **Issue:** `verify-ng-040-internals-catalogue-lines.mjs --fix` does not renumber rows in the "Deliberately not touched" section, and it reassigned several Touchpoints rows to unrelated lines when a token recurs.
- **Fix:** rows were remapped from the committed catalogue through the boundary diff hunks, then each row was checked to hold its token. Both catalogue gates pass.
- **Commits:** `6ef566f`, `54d1e44`

**5. [Rule 3 - Blocking] TypeScript state literal**
- **Found during:** `tsc -b`
- **Issue:** the state mapping in `web-tab.ts` builds a `WebTabState` without the new fields.
- **Fix:** the mapping reads each field with a type guard and falls back to the widget's value, and the widget carries matching fields.
- **Commit:** `6ef566f`

### Scope Deviations

- **No `matchDiacritics` setter.** The union does not carry it, and no UI input supplies it. Not built.
- **Live find, zoom and audio drive the arms directly** through `WebTabChannel` (see Decisions).
- **`print-today` and `edit-today` are not implemented.** Each needs a command route owned by a later plan. They record no verdict (see Blockers).

## Blockers

1. **`soundPlaying` is never pushed.** The tone plays in content: the page's `play()` resolves and the element's title updates. No `DOMAudioPlaybackStarted` reaches the overlay element in 20 s, with or without the overlay geometry set. The audio sink exists (PipeWire `alsa_output` analog stereo), and the chrome-side listener is attached (diagnostic). Next step: determine whether `AudioPlaybackChild` observes `audio-playback` for this overlay's browsing context (the overlay is created with `docShellIsActive = false`, and its actor registration may not apply to it). That is an investigation of upstream and the 050 patch, not a change in this plan's files.
2. **`print-today` and `edit-today` have no verdicts.** Plans 32-04 and 32-06 read these keys and must report a blocker until they exist. Needed: a page-initiated print observer and a command-route observer, both outside this plan's files.

## Issues Encountered

- Catalogue renumbering took several rounds (see Deviation 4).
- A first live run of the audio scenario reported no playback; the diagnostic that followed showed the chrome listener itself was fine (see Blockers 1).

## Next Phase Readiness

- Plan 32-02 can build the relay rows and copy on the find, zoom and mute arms. It depends on the Task 1 arms and union, which are committed and gated.
- Plans 32-03, 32-04 and 32-06 must not proceed on probe-gated work until `print-today` and `edit-today` verdicts exist in `scripts/lib/pb-probe-verdicts.json`.

## Self-Check

Files and commits, checked against disk and git:

- `[ -f scripts/verify-page-tools-find.mjs ]`, `[ -f scripts/verify-page-tools-zoom-mute.mjs ]`, `[ -f scripts/verify-page-tools-live.mjs ]`, `[ -f scripts/lib/pb-probe-verdicts.json ]`: all present.
- `git merge-base --is-ancestor 6ef566f HEAD` and `git merge-base --is-ancestor 54d1e44 HEAD`: both are ancestors of HEAD.

## Self-Check: PASSED (files and commits) / PARTIAL (live proof, see Status)

## Audio fix

Supersedes Blocker 1 and the `audio` row above. The defect was in the launch environment, not the chrome arms, the actor registration or the 050 patch.

- **Cause.** Gecko dlopens `libpulse.so.0` by bare name, and libxul's RUNPATH lists alsa-lib but not libpulseaudio. Run outside a Nix wrapper, the audio server in the parent process logged `E/cubeb context.rs:55: libpulse not found` (`MOZ_LOG=sync,cubeb:5`), no backend opened, and the content process's `CubebStreamInit` was shut down at once. The media element then failed with `NS_ERROR_DOM_MEDIA_MEDIASINK_ERR` (`audio.error.code` 3), the audio-playback observer never reported `active`, and `DOMAudioPlaybackStarted` never fired. The earlier note that the tone "plays in content" was wrong: `play()` resolves and `currentTime` advances, but no sound reaches a sink.
- **Discriminating evidence.** The parent half was fine: calling `overlayOf(id).audioPlaybackStarted()` from chrome produced a `soundPlaying: true` push. With `LD_LIBRARY_PATH` set to the libpulse directory and nothing else changed, the same page reported `err=0` and the natural push arrived (index 5, one push after the loaded push).
- **Fix.** `scripts/lib/firefox-bidi.mjs` reads the libpulse directory from `MOZ_PULSEAUDIO_LIBS` in the `config.status` beside the binary and prepends it to `LD_LIBRARY_PATH` for the spawned shell only (the harness process's own environment is unchanged). A binary with no `config.status` beside it launches as before.
- **Self-test.** `verify-page-tools-live.mjs` gained an audio clean control and the `audio-page-silent` plant (the audio scenario on a page that plays nothing), which goes red naming `no soundPlaying push`. The scenario's failure text now names the `libpulse not found` log line.
- **Instrument check.** The suspected off-by-one in the audio wait was not a defect: `waitForPush`'s `from` is inclusive, so `from: unmuted` already scans the unmute push itself. It was left as is.
- **Commit.** `16c7875`.
- **Live result (this tree).** `--scenario audio` PASS three runs in a row; `--scenario find,zoom,audio,downloads` all PASS; `--self-test` PASS (two clean controls, two planted faults red). With the fix disabled (the binary launched from a path with no `config.status`), `audio` FAILs again.
- **Open risk.** The dev binary at `objdir/dist/bin/powerbrowser` produces no sound when started by hand outside a dev wrapper, for the same reason. This commit fixes the harness only; a release package must put libpulse on the loader path (not addressed here).
