---
phase: 39-v1-5-close-out
plan: 05
subsystem: shell-furniture
tags: [tooltip, clipboard, headless, harness, PROMPT-04, PROMPT-08]

requires:
  - phase: 39-v1-5-close-out
    provides: "39-01 PB_LIVE_HEADED=1 and the C24 inferred verdict; 39-02 --self-test --scenario"
provides:
  - "C22 fixed in the product: showTooltip treats a missing drag service as no drag session"
  - "C24 fixed in the instrument: menu-edit reads every image flavour Copy Image writes, headless and headed"
  - "plants tooltip-drag-lookup-throws and copy-image-html-only"
  - "tooltip-status exact non-ASCII label leg and title=\"\" leg"
  - "headed-overlay finding for 39-15: the overlay showed in 2 of 2 headed runs"
affects: [39-06, 39-15, 39-18]

actuals:
  tokens: 28000
  tasks: 2
  commits: 4
plan_head_before: bf06a8152402e188e1088e5b3d03edb3c8acef5e
plan_head_after: 34ad4ff362c5c6d65a5acf3430590f8bad290c5f

tech-stack:
  added: []
  patterns:
    - "Headless clipboard reads go through widget.clipboard.use-cached-data.enabled, which answers from the transferable Gecko was handed"

key-files:
  created: []
  modified:
    - powerbrowser/shell/PowerBrowserAPI.sys.mjs
    - powerbrowser/INTERNAL-APIS.md
    - scripts/verify-page-furniture-live.mjs
    - .planning/ROADMAP.md
    - .planning/phases/35-shell-furniture-and-page-context-menu/35-UAT.md

key-decisions:
  - "C22 cause: in a headless shell, getService on @mozilla.org/widget/dragservice;1 throws (gtk nsDragService::GetInstance returns null), so showTooltip threw before openPopupAtScreen. Stock browser.js has the same line. The product now treats the throw as no drag session"
  - "C24 verdict: the product writes an image flavour. The instrument was wrong. Headless Gecko keeps only text in the native clipboard, so menu-edit reads the clipboard cache, and when headed it also requires wl-paste to list image/*"
  - "PROMPT-04 and PROMPT-08 ticked: Copy Image passes headless and headed; tooltip and link status pass headless"

patterns-established:
  - "A headless-only failure of a stock code path is proven by a differential: the same probe in a stock window (window.open from Theia) fails the same way"

requirements-completed: [PROMPT-04, PROMPT-08]

duration: 40 min
completed: 2026-11-06
status: complete
---

# Phase 39 Plan 05: C24 Copy Image and C22 title tooltip Summary

**C22 was a product throw: the drag-session check in showTooltip throws in a headless shell, which has no drag service. C24 was an instrument defect: Copy Image does write an image flavour, observed headless through the clipboard cache and headed on the Wayland clipboard as image/png.**

## Performance

- Duration: 40 min
- Started: 2026-11-06T15:38Z
- Completed: 2026-11-06 (see frontmatter)
- Tasks: 2 of 2
- Live sessions: 16 headless (probes, red and green runs, self-tests, a mutation check, two full furniture runs) and 2 headed (one overlay probe, one menu-edit run). The headed menu-edit run replaced the desktop clipboard once.

## Execution order

I ran Task 2 (C22) before Task 1 (C24). The C22 probe needed one session, and its answer showed whether the headed-overlay blocker had to be cleared before any work started. The tasks touch no shared code, so the order does not change the result.

## C22: probes and cause (Task 2)

Probe session 1 (scratch script outside the repo, headless, shell focused, overlay visible). H1 and H2 were wrapped together on `window.XULBrowserWindow.showTooltip`:

```
H1 before   {"tip":"closed","active":true,"docActive":true,"focus":true,"calls":[]}
H3 single-move states ["closed|true|true"]  page moves [[190,240,true]]
H1/H2 after single move {"tip":"closed","active":true,"focus":true,"calls":[]}
H4 states ["closed|true|true"]  page moves [[190,240,true],[170,240,true],[190,240,true]]
H4 after    {"tip":"closed","calls":[{"call":"hide"}]}
prefs       {"tips":true,"delay":500}
```

- H1: the overlay is active (`browsingContext.isActive` true) and the page receives trusted mousemoves. The H4 `hide` call shows that content had already sent a show. So showTooltip was reached, but the wrapper recorded nothing.
- H3: the popup never reached `open` in any 50 ms sample.
- H4: two moves 20 px apart followed by a 700 ms rest changed nothing.

Follow-up session 2 resolved this. The wrapper had thrown at its own drag-service read, and so does the product:

```
overlay after two moves  {"calls":[{"call":"show","text":"Furniture tooltip","focus":true},{"threw":"NS_ERROR_XPC_GS_RETURNED_FAILURE ... PowerBrowserAPI.sys.mjs :: showTooltip :: line 8263"}]}
direct call              same throw at line 8263
stock window (window.open from Theia), same page  {"calls":[{"call":"show","text":"Furniture tooltip","focus":true}],"tip":"closed"}
```

**Cause (H2 family, product guard):** `Cc["@mozilla.org/widget/dragservice;1"].getService(Ci.nsIDragService)` throws `NS_ERROR_XPC_GS_RETURNED_FAILURE` in a headless shell, because `upstream/widget/gtk/nsDragService.cpp:639-642` returns null when headless. Stock `browser.js:2017-2022` has the same line and fails the same way in a stock window. A headed shell has a drag service, so this cause does not apply there.

**Fix (22317895):** the lookup is now in a try block. A throw counts as no drag session. The rest of showTooltip is unchanged: the focus guard, the tab guard, `tooltip.label` set as text, and stock placement. INTERNAL-APIS.md: every row after the edit moved by +6, and the drag-service row is now at 8267 with a note about the headless case.

**Edge legs (1cfb75e6):** `#tip`'s title is now `Furniture tooltip — café`, compared exactly. A `#tip-empty` span with `title=""` must open nothing for 1500 ms after the pointer reaches it, with the `#tip` leg as its positive control. Mutation check: with `#tip-empty`'s title set to `leak`, the scenario printed `tooltip-status: FAIL -- an empty title opened the page tooltip`.

Red before the fix (product reverted, test committed): `tooltip-status: FAIL -- page tooltip did not open with "Furniture tooltip — café" within 3 s; saw {"state":"closed","label":""}`.

## C24: verdict and fix (Task 1)

Branch taken: **product-writes-image (the instrument was wrong)**. No product edit.

Deciding evidence:

- Headless, with `widget.clipboard.use-cached-data.enabled` (default false on Linux), `hasDataMatchingFlavors` answers from the transferable Gecko was handed (`nsBaseClipboard.cpp` `GetFlavorsFromClipboardCache`). Result: `image flavours after Copy Image: application/x-moz-nativeimage`.
- Headed (`PB_LIVE_HEADED=1`): `image flavours after Copy Image: application/x-moz-nativeimage image/png image/jpeg`, and `desktop clipboard types after Copy Image: text/html text/_moz_htmlinfo text/_moz_htmlcontext image/png image/bmp image/x-bmp image/x-MS-bmp image/x-icon ... image/tiff image/jpeg SAVE_TARGETS`. menu-edit PASS.

Fix (6f6c39da): the single-flavour `image/png` check is gone (`grep -c "hasDataMatchingFlavors(\['image/png'\]"` prints 0). menuEdit asks for `application/x-moz-nativeimage`, `image/png`, `image/jpeg` and `image/gif` through the cache. When `PB_LIVE_HEADED=1` and `WAYLAND_DISPLAY` are both set, it also requires `wl-paste --list-types` to list an `image/` type. Plant `copy-image-html-only` changes `cmd_copyImage` to `cmd_copyImageLocation` in `ControllersParent.prototype.doCommand`.

## Headed-overlay finding (for 39-15)

The 39-01 blocker ("the /tools page is not shown" headed, three times out of three) **did not reproduce** at this tree: the overlay was shown in 2 of 2 headed runs. The probe read every input to the frontend's geometry publish (`web-tab.ts` `publish`):

```
chrome {"focus":true,"vis":"visible","w":1280,"h":800,"sizemode":3,"active":true}
overlay {"vis":"visible","l":"0px","t":"73px","w":"1280px","h":"727px","active":true}
theia {"attached":true,"visible":true,"hasPage":true,"crashed":false,"lastSent":"{...\"visible\":true}","blocking":[],"raf":"fired","vis":"visible","hidden":false,"focus":false}
```

The trees differ by 39-02 (closeMenu no longer pre-focuses; webTabFocus answers `menu-pending`), 39-03 and 39-04 (the patch 050 startup change). Unlike 39-01, these runs had no KWin raise loop and no wl-paste polling loop. The cause of the 39-01 failure is therefore unknown. If it comes back, check the same fields in this order: `isAttached`, `isVisible`, `hasPage`, `crashed`, any element matching `BLOCKING_LAYER_SELECTOR` with client rects, whether rAF fires in the Theia frame, and `lastSent`.

## Verification

- `node scripts/verify-page-furniture-live.mjs --scenario menu-edit,tooltip-status,theia-hover-silent`: tooltip-status PASS, theia-hover-silent PASS, menu-edit PASS.
- `--self-test --scenario tooltip-status,theia-hover-silent`: PASS. The clean control is green, and tooltip-element-removed, tooltip-drag-lookup-throws, overlink-unregistered, theia-tooltip-leak and status-over-page all went red.
- `--self-test --scenario menu-edit`: PASS. copy-row-unwired went red with "copy did not reach the clipboard", and copy-image-html-only went red with "Copy Image left no image flavour on the clipboard".
- Full furniture run, twice. Run 2: only saved-login (C23, 39-06) failed. Run 1 also failed `menu-edit: Paste did not set the second field` and `menu-spelling: no suggestion row "the" for "teh" (suggestions [])`. Both steps run before any code this plan changed, and neither failure appeared in run 2. I logged them as a flake (see below).
- `verify-ng-040-internals-catalogue-lines.mjs` PASS; `check-internals-boundary.sh --catalogue` PASS for both boundary files.
- `nix develop .#theia --command bash scripts/diff-theia-core.sh`: PASS, zero changes inside @theia/*. No Theia code changed, so no `yarn build` was needed.
- No commit in this plan touches theia/extensions/chrome-bar (`git log --name-only --format= 1cfb75e6^..HEAD -- theia/extensions/chrome-bar` prints nothing).
- `scripts/verify-platform.sh --quick` (after staging): `verify-platform: PASS -- all checks passed` (8 min 13 s)

## Deviations from Plan

**1. [Rule 3 - Blocking] `verify-ng-040 --fix` mis-mapped rows after a uniform shift**
- Found during: Task 2
- Issue: the C22 edit added 6 lines at 8263. `--fix` matched several rows to the nearest unclaimed line, not the shifted one (for example `getMostRecentNonPBWindow` went to 10691, not 10694), and 8 occurrences were left without a row.
- Fix: I reverted INTERNAL-APIS.md, shifted every `PowerBrowserAPI.sys.mjs:N` with N > 8263 by +6, and moved the drag row to 8267 by hand. After that, `--fix` makes no change and both checks pass.
- Commit: 22317895

**2. [Rule 1 - Instrument] C22's fix is in the product, but the failure only happens headless**
- The product's showTooltip was identical to stock, and stock fails the same way headless. I changed the product rather than skip the leg, because the harness runs headless and cannot provide a drag service: a JS stub would break `static_cast<nsBaseDragService*>` callers such as `nsBaseDragService.cpp:70-77`. The guard is two lines and does not change headed behaviour.

**3. [Order] Task 2 before Task 1** (see Execution order).

None of the time boxes ended without a verdict, so no WINDOWS.md entry was needed.

## Flake observed (for 39-06 / 39-18)

In 1 of 2 full furniture runs, `menu-edit` failed at Paste and `menu-spelling` got no suggestions in the same session. Both come right after `menu-page-tools`, which opens and closes a devtools toolbox window. Its own comment says that window "keeps the OS focus, which later scenarios need on the shell". A focus hand-back that sometimes loses the race explains both failures.

## Next Phase Readiness

- 39-06 (C23 saved-login) is the only red scenario left in page-furniture-live.
- 39-15 can run headed sessions. The overlay shows, and the probe fields above are the checklist if it stops showing.
- The headed tooltip was not observed in this plan. It needs no fix, because a headed shell has a drag service, and the end-of-milestone visual row 13 (tooltip placement) will show it.

## Commits

- 1cfb75e6 test(39-05): C22 tooltip legs and drag-lookup plant, red before the fix
- 22317895 fix(39-05): C22 page tooltip opens when the shell has no drag service
- 6f6c39da fix(39-05): C24 menu-edit reads every image flavour Copy Image writes
- 34ad4ff3 docs(39-05): C22 and C24 fixed live; 35-UAT rows 6 and 9 live lines

## Self-Check: PASSED

All four commits are ancestors of HEAD. The modified files exist. `copy-image-html-only` is in the PLANTS table. No stubs, TODOs or diagnostic wrappers were left in powerbrowser/ (the probes stayed in scratch scripts outside the repo).
