---
phase: 27-groundwork-navigation-buttons-and-page-focus-keys
plan: 03
subsystem: static gates (gBrowser stand-in, internals boundary)
tags: [gbrowser-standin, deliberately-absent, forbidden-patterns, shim-globals, groundwork]
status: complete

requires:
  - phase: 27-02
    provides: serialised ordering only; no code dependency
provides:
  - "verify-shell-gbrowser-standin derives its upstream file list: browser-custom-element.mjs plus every *Parent.sys.mjs under upstream/browser/actors and upstream/toolkit/actors (47 files at the pinned tag)"
  - "DELIBERATELY_ABSENT: getNotificationBox, getTabDialogBox, refreshBlocked, removeTab, setTabLabelForAuthPrompts, each with its verified reason"
  - "Four named failure kinds: UNIMPLEMENTED, STALE ABSENCE, CONTRADICTION, DEAD SURFACE; plants for new caller file, stale absence and contradiction"
  - "FORBIDDEN_PATTERNS: PopupNotifications, nsContextMenu, browserDOMWindow, openLinkIn, FullScreen, XULBrowserWindow, each with a self-test plant"
affects: [27-04, 27-05, 27-06, 27-07, 27-08, Phase 37 (notification bars), every v1.5 phase that adds a browser.xhtml shim]

actuals:
  tokens: 6071
  tasks: 2
  commits: 2
plan_head_before: 84f9cba1610cbca5403891640c48400242428936
plan_head_after: d79101cee700d00edf5beee86e37d4580acb37a5

tech-stack:
  added: []
  patterns:
    - "Gate scope declared as directories plus files with one-line reasons; the file list is derived with readdirSync at check time"
    - "Required set == implemented methods ∪ reasoned absences, compared both ways"

key-files:
  created: []
  modified:
    - scripts/verify-shell-gbrowser-standin.mjs
    - scripts/check-internals-boundary.sh
    - powerbrowser/shell/powerbrowser.js

key-decisions:
  - "The stand-in implements no new member: the five newly derived calls are recorded as deliberate absences, because implementing them would fabricate a tab or tabbrowser for a privileged actor"
  - "A CONTRADICTION plant was added beyond the two the plan named, so each of the four failure kinds is proven red"
  - "The upstream read-only invariant was checked as a before/after snapshot of git -C upstream status and the staged diff hash, because upstream/ carries the applied patch stack as staged changes (status is not empty on a clean tree)"

requirements-completed: [NAV-06]

coverage:
  - id: D1
    description: "Stand-in gate derives its call-site files and passes with 5 reasoned absences"
    requirement: NAV-06
    verification:
      - kind: static
        ref: "node scripts/verify-shell-gbrowser-standin.mjs"
        status: pass
  - id: D2
    description: "Every failure kind goes red by name on a planted fault"
    verification:
      - kind: self-test
        ref: "node scripts/verify-shell-gbrowser-standin.mjs --self-test"
        status: pass
  - id: D3
    description: "Six shim globals are rejected outside the boundary file"
    verification:
      - kind: self-test
        ref: "bash scripts/check-internals-boundary.sh --self-test"
        status: pass

duration: 5min
completed: 2026-10-20
---

# Phase 27 Plan 03: gBrowser Stand-in Policy and Shim-Global Boundary Summary

**The gBrowser stand-in gate now derives its scope from the browser widget plus the `*Parent.sys.mjs` files of two directories (upstream/browser/actors and upstream/toolkit/actors; component-directory parents such as ProfilesParent were not scanned until 35-01-SUMMARY's registry widening), records five reasoned absences (refreshBlocked as a known gap), and the internals boundary forbids six browser.xhtml shim globals outside PowerBrowserAPI.sys.mjs.**

## Performance

- Duration: about 5 minutes
- Tasks: 2 of 2
- Files modified: 3

## Accomplishments

- `UPSTREAM_CALL_SITES` (three hand-kept files) is replaced by `UPSTREAM_SCOPE` (one widget file, two actor directories, each with a reason) and `deriveCallSiteFiles()`. An unreadable directory is a distinct broken-instrument failure, as an empty list already was.
- The derived required set is {getBrowserForTab, getNotificationBox, getTabDialogBox, getTabForBrowser, refreshBlocked, removeTab, setIcon, setTabLabelForAuthPrompts}. It equals implemented {getBrowserForTab, getTabForBrowser, setIcon} plus `DELIBERATELY_ABSENT`.
- Each absence reason was checked against the pinned tag:
  - getTabDialogBox: PromptParent.sys.mjs:221 feature-detects it before calling it.
  - setTabLabelForAuthPrompts: called only inside that branch.
  - getNotificationBox: BlockedSiteParent calls it on `browser.getTabBrowser()`, which returns null for overlays (browser-custom-element.mjs:950).
  - removeTab: AboutTabCrashedParent calls it on the same null receiver.
  - refreshBlocked: RefreshBlockerParent calls it on the stand-in itself. DesktopActorRegistry gates that actor on `enablePreference: "accessibility.blockautorefresh"`.
- Self-test: 8 plants, each asserted landed and red by name. They cover a missing member, a new call in a copy of a derived file, a surplus member, an empty list, a new caller file in a copy of `upstream/browser/actors`, a stale absence, a contradiction, and a missing `tabs`.
- `FORBIDDEN_PATTERNS` gains six names on one line with the policy comment. The NG-039 plant loop plants `window.<name> = {};` for each, and each rejection names `planted-<name>.sys.mjs:<line>: <name>`.
- In `powerbrowser.js` only the stand-in comment changed. The saved diff of that file has no non-`//` changed line.

## Task Commits

1. **Task 1: Derive the gBrowser call-site set and record deliberate absences** - `a66563a` (feat)
2. **Task 2: Forbid the shell shim globals outside the boundary file** - `d79101c` (feat)

## Files Created/Modified

- `scripts/verify-shell-gbrowser-standin.mjs`: derived scope, DELIBERATELY_ABSENT, four failure kinds, three new plants
- `scripts/check-internals-boundary.sh`: six FORBIDDEN_PATTERNS entries, six plants in the NG-039 loop
- `powerbrowser/shell/powerbrowser.js`: stand-in comment paragraph only

## Known gaps

- **refreshBlocked**: with `accessibility.blockautorefresh` on, RefreshBlockerParent calls `gBrowser.refreshBlocked(...)` on the shell stand-in and throws a TypeError. No refresh-blocked notification is shown. Phase 37 owns notification bars. Recorded in `DELIBERATELY_ABSENT` and in the stand-in comment (threat T-27-12, disposition accept).

## Deviations from Plan

**1. [Rule 3 - Blocking] Upstream read-only check run as a snapshot comparison**
- **Found during:** Task 1 verify
- **Issue:** The plan's `test -z "$(git -C upstream status --porcelain)"` cannot pass on this tree. `upstream/` holds the applied patch stack (patches 010-040) as five staged modifications, so status is not empty before any edit.
- **Fix:** I recorded `git -C upstream status --porcelain` and the sha256 of `git -C upstream diff --cached` (90dc4726...) before Task 1. Both were identical after each task and at the end, so nothing was written to `upstream/`.
- **Files modified:** none

**2. [Rule 2 - Completeness] Added a CONTRADICTION plant**
- The plan named plants for a new caller file and a stale absence. I also added a plant for a member that is both implemented and listed absent, so all four failure kinds the plan defines are proven red.
- **Commit:** a66563a

## Live checks

The plan has no live check. Both tasks are static gates, and their `<verify>` commands are the checks:
- `node scripts/verify-shell-gbrowser-standin.mjs`: PASS (47 files)
- `node scripts/verify-shell-gbrowser-standin.mjs --self-test`: PASS (8 plants)
- `bash scripts/check-internals-boundary.sh`, `--catalogue`, `--self-test`: PASS (all six new plants PASS)
- `node scripts/scan-brand-residue.mjs`: PASS (371 files)
- `scripts/verify-platform.sh --quick`: PASS, all checks passed. The `FAIL` text in the log is planted-fault output from self-tests.

## Issues Encountered

None.

## Next Phase Readiness

- A rebase that adds a gBrowser call in a `*Parent.sys.mjs` under upstream/browser/actors or upstream/toolkit/actors (or the browser widget) now fails `--quick` as UNIMPLEMENTED. Parents registered from component directories were outside this scope until Phase 35 plan 01 derived the scope from the actor registries (see 35-01-SUMMARY). Fix it either by implementing the member or by adding a reasoned `DELIBERATELY_ABSENT` entry.
- A later phase that shims PopupNotifications or a context menu must define the shim through `PowerBrowserAPI.sys.mjs` and catalogue it. Anywhere else, `internals-boundary` fails by name.
- If a later phase adds one of the six names to `PowerBrowserAPI.sys.mjs`, it needs an `INTERNAL-APIS.md` row, or `internals-catalogue` goes red.

## Self-Check: PASSED

- FOUND: scripts/verify-shell-gbrowser-standin.mjs, scripts/check-internals-boundary.sh, powerbrowser/shell/powerbrowser.js
- FOUND: a66563a, d79101c (ancestors of HEAD)
