---
phase: 39-v1-5-close-out
plan: 18
subsystem: tab-strip
tags: [tab-strip, window-drag, real-input, 34-t1, tab-03, owner-batch-b]
status: complete
requires: [39-17, 39-15, 39-16]
provides:
  - "34 T1 carve-out: in Browsing, publishDragRegions keeps the whole tab strip clear of window-drag handles"
  - "tab-strip-live double reads chrome's .powerbrowser-drag handles and requires none over the strip's empty space; plant strip-drag-handle"
  - "34-UAT row 1 pass on three headed PB_REAL_INPUT runs"
  - "v1.5-LIVE-PASS EXT-10 fill ticked (39-14, f6237e4d)"
affects: [34-UAT, v1.5-LIVE-PASS]
tech-stack:
  added: []
  patterns:
    - "a chrome-side handle check reads .powerbrowser-drag in chrome and compares against the frame's measured rect, so a headless run sees what BiDi input cannot"
key-files:
  created:
    - .planning/phases/39-v1-5-close-out/39-18-SUMMARY.md
  modified:
    - theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx
    - scripts/verify-tab-strip-live.mjs
    - .planning/phases/34-tab-strip/34-UAT.md
    - .planning/v1.5-LIVE-PASS.md
key-decisions:
  - "Task 1 (31.1 T3 error-page allow-list) not ruled: owner accepted current behaviour in 39-17; PowerBrowserAPI.sys.mjs, INTERNAL-APIS.md, verify-web-tab-live.mjs and 31.1-UAT untouched"
  - "Task 2 carve-out removes the whole strip, not only the tail right of the last tab: onStripDoubleClick opens a new tab for any non-tab target, so every empty strip pixel must reach it"
  - "The carve-out is a frontend change only (publishDragRegions); no shell JS, no INTERNAL-APIS row, no Gecko rebuild"
requirements-completed: [EXT-05]
plan_head_before: 87ea20b29136dcceb0e6e66b95ad04a2894ac924
plan_head_after: 8902bd98  # the last commit before this SUMMARY's own docs commit
actuals:
  tokens: 4100
  tasks: 2
  commits: 2
duration: "about 1 h 15 min"
completed: 2026-11-07
---

# Phase 39 Plan 18: Batch B changes Summary

The tab strip is no longer a window-drag handle in Browsing. A real double-click on its empty space now opens a new tab and leaves the window frame unchanged (3 of 3 headed real-input runs). The 31.1 T3 allow-list was not ruled and was not built.

## Task 1: 31.1 T3 error-page allow-list: not ruled, no change

39-17 recorded Chris's answer "Accept both (Recommended)": T3 passes as intended, with no allow-list work for 39-18. 31.1-UAT row 3 already reads `result: pass` and has the owner line "no allow-list work for 39-18". No file in Task 1's list was edited: `git log 87ea20b2..HEAD -- powerbrowser/shell/PowerBrowserAPI.sys.mjs powerbrowser/INTERNAL-APIS.md scripts/verify-web-tab-live.mjs .planning/phases/31.1-extension-tab-host/31.1-UAT.md` prints nothing.

## Task 2: 34 T1 drag-handle carve-out (f45bb359)

- **Product:** in `publishDragRegions`, the Browsing row is now `{ row: this.tabStrip.node, items: [this.tabStrip.node] }`. The whole strip counts as one control, so no handle falls inside it. Only space beside the strip (none at full width) would still be a handle. The menubar row (Coding), the toolbar row (Organising) and the URL row in every mode keep their handles unchanged. The docstring now says Browsing moves the window by the URL row.
- **Why the whole strip, not just the tail:** `onStripDoubleClick` opens a new tab for any target that is not a `.pb-tab` or `.pb-tab-strip-notice`. A gap between tabs left as a handle would still maximize on a real double-click.
- **Harness:** the `double` scenario republishes, reads chrome's `.powerbrowser-drag` handles and requires none to cover the strip's empty span. Before, BiDi input could not see chrome's handles, so the headless run could not catch this. The new plant `strip-drag-handle` wraps `webTabs.send` and re-adds the pre-39-18 tail handle, which turns the check red. `double` now has plants `double-noop` and `strip-drag-handle`.
- **Build:** `yarn --cwd extensions/chrome-bar build && yarn --cwd applications/browser build` in `nix develop .#theia`, which is how 39-13-FIXUPS built. bundle.js contains the new publish. No Gecko rebuild.

### Verification output (verbatim, trimmed to result lines)

`theia/node_modules/.bin/tsc --noEmit -p theia/extensions/chrome-bar` printed nothing, exit 0.

`nix develop .#theia --command scripts/verify-platform.sh --quick` (staged): `verify-platform: PASS -- all checks passed`

`nix develop .#theia --command bash scripts/diff-theia-core.sh`: `diff-theia-core: PASS -- zero changes inside @theia/*`

Headless `node scripts/verify-tab-strip-live.mjs --scenario double`:
```
  double: empty strip {"left":294,"right":1280,"top":0,"bottom":32}; 11 drag handle(s) [[0,33,8,40],[40,33,8,40],[80,33,8,40],[120,33,8,40],[768,33,8,40],[808,33,8,40],[848,33,8,40],[888,33,8,40],[928,33,8,40],[968,33,8,40],[1272,33,8,40]]
tab-strip-live: double: PASS
verify-tab-strip-live: PASS
```

`--scenario double --self-test`:
```
tab-strip-live: double: plant double-noop went red: double: a double-click on the empty strip opened no new tab on the empty page ({"grew":false,"emptyPage":false,"pillFocused":false})
tab-strip-live: double: plant strip-drag-handle went red: double: a window-drag handle covers the empty strip: [[294,0,986,32]]
verify-tab-strip-live --self-test: PASS
```

Headed real input, `flock /tmp/nix-shell.75PsxP/pb-headed.lock -c 'PB_REAL_INPUT=1 PB_LIVE_HEADED=1 node scripts/verify-tab-strip-live.mjs --scenario double'`, sandbox off, 3 runs, all identical:
```
  double: empty strip {"left":293.1999969482422,"right":1226.5,"top":0.100006103515625,"bottom":32.100006103515625}; 11 drag handle(s) [[0,33,8,40],...,[1272,33,8,40]]
  double: pointer os [0,0] after 1 attempt(s); window 384,226 1280x800 -> 384,226 1280x800
tab-strip-live: double: PASS
verify-tab-strip-live: PASS
```

Default headless `node scripts/verify-tab-strip-live.mjs`: all 13 scenarios PASS, `verify-tab-strip-live: PASS`. Its `--self-test`: all 16 plants went red, `verify-tab-strip-live --self-test: PASS`. `scripts/verify-platform.sh --only tab-strip-live`: `verify-platform: PASS -- all checks passed`.

34 T8 (overflow) still passes, and its derived expectation now differs from 39-16's 13 handles. After scrollLeft 322 there are 12 handles, `[[300,0,980,33],[0,33,8,40],...,[1272,33,8,40]]`, equal to a fresh publish. The old in-strip `[260,0,12,33]` is gone. `[300,0,980,33]` is the panel space right of the strip, which the scenario narrows to 300 px. It is not strip space.

## Small extra

v1.5-LIVE-PASS.md: the EXT-10 fill checkbox is ticked and cites 39-14, f6237e4d (8902bd98).

## Deviations from Plan

1. **Carve-out scope (Rule 1, correctness):** the plan said to exclude "the empty strip span (right of the last tab)". The whole strip was excluded instead, because `onStripDoubleClick` treats every non-tab pixel as empty strip. A smaller change would leave the gaps between tabs maximizing the window.
2. **Not shell JS:** the 39-17 owner line and 34-UAT say "shell JS, with a plant". The frontend already decides which rects are handles, so the change is one line in `publishDragRegions`. powerbrowser.js and PowerBrowserAPI.sys.mjs are unchanged, so no catalogue remap was needed.
3. **Live runs used `PB_NG_ALLOW_DIRTY=1`:** the only tracked dirty files were the foreign `.claude/settings.json` and `.planning/state.json`, and neither is code under test. All code under test was committed (f45bb359) before every live run.
4. **Plan verify used `yarn build` (whole tree):** I ran the two-package build that 39-13-FIXUPS used. It is the same output for this change.
5. A read-only `git stash list` was run once by mistake while checking a script's history. Nothing was pushed, popped or applied.

## Commits

- f45bb359 fix(39-18): keep the tab strip clear of window-drag handles (34 T1)
- 8902bd98 docs(39-18): 34-UAT row 1 passes on real input; tick EXT-10 fill

## Known Stubs

None.

## Not done

- No headed real-input run with the `strip-drag-handle` plant. That run would maximize the test window. The headless plant proves the handle check goes red, and 39-15's three runs already showed the maximize under the old handles.
- In Browsing the window now moves only by the URL row's empty parts. This follows the ruling and is recorded in 34-UAT Deferred Follow-Ups.

## Self-Check: PASSED

- FOUND: theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx (contains `items: [this.tabStrip.node]`)
- FOUND: scripts/verify-tab-strip-live.mjs (plant `strip-drag-handle`)
- FOUND: f45bb359, 8902bd98 (ancestors of HEAD)
- 34-UAT row 1 `result: pass`
