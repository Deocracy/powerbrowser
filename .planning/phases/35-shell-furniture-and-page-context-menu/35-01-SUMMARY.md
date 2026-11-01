---
phase: 35-shell-furniture-and-page-context-menu
plan: "01"
subsystem: chrome-boundary
tags: [gbrowser-stand-in, shim-globals, actor-registries, internals-boundary, T-27-11, D-17]
status: complete
requires:
  - phase: 31.1-extension-tab-host
    provides: the grown window.gBrowser literal, the PowerBrowserTabHost accessors, the gBrowserInit shim and the widened-receiver gate
  - phase: 32-page-tools
    provides: the zoom shims and their separate FORBIDDEN_PATTERNS line and comparison (32-09)
provides:
  - verify-shell-gbrowser-standin.mjs actor scope derived from DesktopActorRegistry.sys.mjs and ActorManagerParent.sys.mjs as well as the two actor directories
  - UNCOVERED CALL SITE failure kind (an absence reason must name every call-site file of its member)
  - Phase 27 shim-global member comparison (names read from the Phase 27 FORBIDDEN_PATTERNS line; XULBrowserWindow from nsIXULBrowserWindow.idl)
  - gBrowser.shouldActivateDocShell through the tab host (Picture-in-Picture close)
  - PointerlockFsWarning in FORBIDDEN_PATTERNS with a self-test plant
affects:
  - 35-02 (window.XULBrowserWindow is compared from the commit that defines it; QueryInterface required)
  - 35-03 (window.nsContextMenu compared; required {contentData})
  - 35-05/35-06 (window.FullScreen {cleanupDomFullscreen, enterDomFullscreen}, window.PointerlockFsWarning {close, showFullScreen})
tech-stack:
  added: []
  patterns:
    - registry-derived call-site scope (parent esModuleURI/moduleURI resolved against the pinned tree's file list)
    - shim definitions matched as `window.<Name> =` or `win.<Name> =` in the boundary file; a function value compares as an empty set
key-files:
  created:
    - .planning/todos/completed/2026-10-21-gbrowser-standin-callsite-scope.md (moved from pending/)
  modified:
    - scripts/verify-shell-gbrowser-standin.mjs
    - scripts/check-internals-boundary.sh
    - powerbrowser/shell/powerbrowser.js
    - powerbrowser/shell/PowerBrowserAPI.sys.mjs
    - powerbrowser/INTERNAL-APIS.md
    - .planning/phases/27-groundwork-navigation-buttons-and-page-focus-keys/27-03-SUMMARY.md
    - .planning/phases/27-groundwork-navigation-buttons-and-page-focus-keys/27-SECURITY.md
key-decisions:
  - "Absence-reason coverage is checked per call-site file (basename stem), not per line: line numbers drift on every rebase. A new call inside an already-named file is not caught by this check (shortcut comment in the gate)."
  - "Registry URIs resolve against the same pinned file list the extension scope already reads (git ls-tree -r HEAD, read once per run), not a second git ls-files call."
  - "Shim definitions are matched as either `window.<Name> =` or `win.<Name> =`: the plans spell `window.`, while the existing host install writes `win.`."
  - "A registry-resolved file that is also in the extension scope (ConduitsParent.sys.mjs) is in both lists; the actor pass counts calls only, a subset of the extension pass, so REQUIRED is unchanged."
patterns-established:
  - "Every new Phase 35 shim lands under the Phase 27 line of FORBIDDEN_PATTERNS and is compared by the stand-in gate in the same commit."
requirements-completed: []
duration: "approx. 40 min (start time not recorded)"
completed: "2026-10-31"
commits: 2
plan_head_before: 23c08bb5dd176949f619cf8781cf34fb54c74f6d
plan_head_after: 843ea0c429158fb4696e9285bba2fcf97ca8cea2
actuals:
  tokens: 16500
  tasks: 2
  commits: 2
---

# Phase 35 Plan 01: Registry-derived stand-in scope and shim-global comparison Summary

**The gBrowser stand-in gate now derives its actor scope from both actor registries (84 parent entries, 78 URIs, 36 modules outside the two actor directories, 83 actor files), records verified reasons for the four members that adds, implements shouldActivateDocShell through the tab host, and compares every Phase 27 shim global the boundary file defines against what upstream calls on it.**

## Status

Complete. Both tasks are committed, every static gate is green, and `scripts/verify-platform.sh --quick` exits 0. One live case (a Picture-in-Picture window opened from a web tab closes) is deferred to the Phase 35 close.

## Performance

- Tasks: 2/2
- Commits: 2 task commits plus this docs commit
- `--quick`: exit 0 after each task (about 4 minutes each)

## Accomplishments

- **Registry derivation (Task 1, T-27-11).** `UPSTREAM_SCOPE.registries` names `upstream/browser/components/DesktopActorRegistry.sys.mjs` and `upstream/toolkit/modules/ActorManagerParent.sys.mjs`. A parser takes each `parent:` object's `esModuleURI`/`moduleURI` (comment lines stripped): 42 + 42 = **84 entries, 78 distinct URIs**. A resolver maps `moz-src:///X` to `upstream/X` and any other URI to its unique non-test basename. **All 78 resolve; 36 are outside the two scanned directories** (for example ProfilesParent, ScreenshotsUtils, PdfjsParent, LoginManagerParent, TranslationsParent, PictureInPicture). The PASS line reports **83 actor files** (46 directory-scan parents, the widget, 36 registry-only modules). The directory scan stays. Zero URIs from a registry, an unreadable registry and an unresolvable URI are each a broken instrument named in the output.
- **New members, re-measured at FIREFOX_153_5_0esr_BUILD1.** The derivation produced exactly the five the plan predicted and nothing else:
  - `addTrustedTab` (ProfilesParent :95, :258): absent. The Profiles actor matches only about:editprofile, about:deleteprofile and about:newprofile in privilegedabout. Overlays load only http(s) or the empty page, and those about modules lack MAKE_LINKABLE (AboutRedirector.cpp:152-169, nsAboutProtocolHandler.cpp:66-72). Its `removeTab` (:97, :260) is the stand-in refusal.
  - `getPanel` (ScreenshotsUtils :882): absent. It is reached only from Screenshots:ShowPanel after ScreenshotsUtils.start, and the shell has no screenshot entry point.
  - `getFindBar` (PdfjsParent :601 `_updateControlState`, :670 `_updateMatchesCount`): absent. The outcome is the same TypeError as before the host. The shell has no find bar (32 D-07).
  - `getCachedFindBar` (PdfjsParent :772 `_hookupEventListeners`; TranslationsParent :1575, :3763): absent, with the same reasoning.
  - `shouldActivateDocShell` (PictureInPicture :380): **implemented** (see below).
- **Existing reasons re-checked (e0).** Two existing reasons gained call sites, and both are amended:
  - `getTabDialogBox` gains ScreenshotsUtils :803 (`openPreviewDialog`, reached from `takeScreenshot` :1185, inside a screenshot session only).
  - `getNotificationBox` gains AboutLoginsParent :713 and :746, called on `gBrowser` directly. That actor serves only about:logins, which the scheme walls refuse and web content cannot link to (AboutRedirector.cpp:71-75 has no MAKE_LINKABLE).
  - No other 31.1 reason gained a site (`swapBrowsers`, `updateBrowserSharing`, the tab-write list).
  - A new **UNCOVERED CALL SITE** failure kind enforces this from now on: every absence reason must name every file its member is used in.
- **shouldActivateDocShell (e1, T-35-28).** The host accessor returns `host.byBrowser.has(browser) && browser.style.visibility === "visible"`, the visibility `webTabGeometry` writes together with `docShellIsActive`. The `window.gBrowser` literal delegates to it. This mirrors stock tabbrowser.js:8031-8041. Without it, `PictureInPicture.removePiPBrowserFromWeakMap` threw a TypeError on the host's non-null `getTabBrowser()`, so `closeSinglePipWindow` failed before `closePipWindow`.
- **Shim-global comparison (Task 2, D-17).** Shim names are parsed from the Phase 27 line of `FORBIDDEN_PATTERNS`: PopupNotifications, nsContextMenu, browserDOMWindow, openLinkIn, FullScreen, XULBrowserWindow and PointerlockFsWarning. `gBrowserInit` and the zoom shims stay on their own lines with their own comparisons. For each name:
  - REQUIRED is every member called or assigned on that receiver. `IDL_SHIMS` adds the method declarations of nsIXULBrowserWindow.idl.
  - IMPLEMENTED is the literal after `window.<Name> =` / `win.<Name> =`.
  - `SHIM_DATA_MEMBERS` holds `XULBrowserWindow.QueryInterface`, and `SHIM_ABSENT` is empty.
  - The failure kinds are UNIMPLEMENTED, STALE ABSENCE, CONTRADICTION, DEAD SURFACE and MISSING DATA MEMBER. A second definition is a broken instrument.
  - Today's PASS line lists every shim as not yet defined, with what upstream uses: nsContextMenu {contentData}, FullScreen {cleanupDomFullscreen, enterDomFullscreen}, PointerlockFsWarning {close, showFullScreen}, XULBrowserWindow {hideTooltip, setOverLink, showTooltip}, PopupNotifications {_swapBrowserNotifications, getNotification, show}, browserDOMWindow {}, openLinkIn {}.
- **PointerlockFsWarning** was appended to the Phase 27 `FORBIDDEN_PATTERNS` line and to the self-test plant loop. `--self-test` prints "planted PointerlockFsWarning was correctly rejected".
- **Records.** 27-03-SUMMARY's two overstated scope claims now state the true pre-35 scope and point here. `grep -c "any actor parent"` returns 0. In 27-SECURITY.md, the T-27-11 row is closed (naming 35-01 and plant (h)), the Open Items entry is marked closed, and the approval line is annotated. The todo moved to `todos/completed/` with `git mv`, plus a resolution note.

## Task Commits

| Task | Commit | Subject |
|------|--------|---------|
| 1 | 9db907a8 | feat(35-01): stand-in gate scope derived from the actor registries (T-27-11) |
| 2 | 843ea0c4 | feat(35-01): Phase 27 shim-global member comparison, PointerlockFsWarning pattern, T-27-11 closed |

## Files Created or Modified

- `scripts/verify-shell-gbrowser-standin.mjs`: registry scope, resolver, UNCOVERED CALL SITE, the Phase 27 shim comparison, and plants (h), (i), (o), (j)-(n)
- `scripts/check-internals-boundary.sh`: PointerlockFsWarning pattern and plant
- `powerbrowser/shell/powerbrowser.js`: `shouldActivateDocShell` member; the stand-in comment names the scope
- `powerbrowser/shell/PowerBrowserAPI.sys.mjs`: `shouldActivateDocShell` host accessor (Phase 31.1 section, in place)
- `powerbrowser/INTERNAL-APIS.md`: line renumbering from `verify-ng-040-internals-catalogue-lines.mjs --fix`, plus one manual renumber (see Deviations)
- `.planning/phases/27-.../27-03-SUMMARY.md`, `27-SECURITY.md`: T-27-11 records
- `.planning/todos/pending/...` moved to `.planning/todos/completed/2026-10-21-gbrowser-standin-callsite-scope.md`

## Decisions Made

See `key-decisions` in the frontmatter. Each choice point took the recommended option (D-00).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] A catalogue row outside the Touchpoints table was not renumbered by `--fix`**
- **Found during:** Task 1
- **Issue:** The `Ci.nsIURI` row for `setIcon` (WR-08) sits in INTERNAL-APIS.md's "Deliberately not touched" section rather than the Touchpoints table. `verify-ng-040-internals-catalogue-lines.mjs --fix` therefore left it at `:6463` after the three-line insert, and the catalogue check went red on `:6466`.
- **Fix:** Renumbered that row in place to `:6466`. The row was not moved; that misplacement predates this phase.
- **Files modified:** powerbrowser/INTERNAL-APIS.md
- **Commit:** 9db907a8

**2. [Rule 2 - Missing check] The plan's (e0) plant needed a mechanism**
- **Found during:** Task 1
- **Issue:** The plan asks for an absence reason that names one of two call sites to go red. The gate had no reason-coverage check.
- **Fix:** Added per-member call-site tracking in `deriveRequired` and the UNCOVERED CALL SITE kind (file-level, documented shortcut), with plant (o).
- **Commit:** 9db907a8

### Scope Deviations

- The plant letters follow the plan: (h), (i), and (j)-(n). The (e0) plant is lettered (o) because (p)-(w) are already taken by 31.1 and 32-09.
- The resolver's file list is the pinned tree's `git ls-tree -r HEAD` listing that the extension scope already reads, read once per run. The plan says `git ls-files`; the non-test file set is the same.

## Deferred (live/human)

- **Picture-in-Picture close from a web tab (T-35-28):** live proof that a PiP window opened from an overlay closes cleanly now that `shouldActivateDocShell` answers. No objdir or live browser exists in this lane. Recorded for the Phase 35 close.

## Cross-lane assumptions

- None. This plan uses nothing from Phases 33, 34, 36 or 37. Phase 31.1 and 32-09 artifacts are present in the tree.

## Blockers

None.

## Issues Encountered

None beyond the deviations above.

## Next Phase Readiness

Plans 35-02 to 35-07 can define `XULBrowserWindow`, `nsContextMenu`, `FullScreen` and `PointerlockFsWarning` in `PowerBrowserAPI.sys.mjs`. Each is compared from the commit that defines it, and a definition must carry exactly the members listed above (XULBrowserWindow also needs `QueryInterface`). A definition with a surplus member goes red as DEAD SURFACE.

## Self-Check

- FOUND: scripts/verify-shell-gbrowser-standin.mjs (contains DesktopActorRegistry.sys.mjs, ActorManagerParent.sys.mjs, esModuleURI, 'addTrustedTab', 'getPanel', 'getFindBar', 'getCachedFindBar')
- FOUND: scripts/check-internals-boundary.sh (PointerlockFsWarning on the FORBIDDEN_PATTERNS line and the plant loop)
- FOUND: shouldActivateDocShell in powerbrowser.js and PowerBrowserAPI.sys.mjs; listed as implemented on the gate's PASS line
- FOUND: .planning/todos/completed/2026-10-21-gbrowser-standin-callsite-scope.md; pending/ copy absent
- FOUND: 9db907a8, 843ea0c4 (ancestors of HEAD)
- `git -C upstream diff --quiet`: clean
- `node scripts/verify-shell-gbrowser-standin.mjs --self-test`: PASS (plants h, i, o, j, k, l, m, n landed and red)
- `bash scripts/check-internals-boundary.sh --self-test`: PASS
- `scripts/verify-platform.sh --quick`: exit 0

## Self-Check: PASSED
