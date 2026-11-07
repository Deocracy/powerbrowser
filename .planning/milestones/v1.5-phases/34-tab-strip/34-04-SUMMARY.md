---
phase: 34-tab-strip
plan: "04"
subsystem: chrome-bar
tags: [tab-strip, preview, attention, occlusion, state-push, static-gate, live-harness]
requires:
  - phase: 34-tab-strip (plans 01-03)
    provides: the strip's renderTab, the tabKey/keyOf identity, showMenu and List All Tabs, pinned rendering, verify-tab-strip.mjs and the live harness runner
  - phase: 14.1.1 (GUI-08)
    provides: settle-capture thumbnails in tabs.thumbnail, surfaced through GroupModel's cards (projectSessionStoreTabs rows plus rememberThumbnail memory)
  - phase: 27
    provides: BLOCKING_LAYER_SELECTOR with the body MutationObserver republish, the pageFocus push, WebTabWidget.focusPage
provides:
  - TabStripWidget.previewImage / schedulePreview / openPreview / closePreview / renderPreview and the .pb-tab-preview card
  - .pb-tab-preview in web-tab.ts BLOCKING_LAYER_SELECTOR
  - titleChanged on webTabPush's state literal, minted by webTabTitleChanged (seenTitleByOverlay), cleared by the webTabActivated arm's push
  - WebTabState.titleChanged / WebTabWidget.titleChanged (read-only from the push), onDidChangeTabStatus fires on its change
  - TabStripWidget.isUpdated, the .pb-tab-attention dot, CHROME_BAR_COPY.updatedTabTooltip / updatedTabLabel
  - verify-tab-strip.mjs checks 11-14 and seven plants
  - live scenarios preview and attention, each with a --self-test plant
affects:
  - 34-05 (bookmark-all and modes scenarios run with the preview handlers and the attention dot present)
tech-stack:
  added: []
  patterns:
    - a chrome-minted boolean rides the existing state push as one more primitive field; the frame only reads it
    - a hover card is position fixed at the hovered tab's own rect, because the scrolling row clips its children
key-files:
  created: []
  modified:
    - theia/extensions/chrome-bar/src/browser/tab-strip-widget.tsx
    - theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar.css
    - theia/extensions/tab-uris/src/browser/web-tab.ts
    - powerbrowser/shell/PowerBrowserAPI.sys.mjs
    - powerbrowser/INTERNAL-APIS.md
    - scripts/verify-tab-strip.mjs
    - scripts/verify-tab-strip-live.mjs
    - scripts/verify-shell-error-copy.mjs
    - scripts/verify-platform.sh
key-decisions:
  - "The preview image comes from GroupModel's public card lists (listUngrouped plus getTabs per group), whose thumbnail field already merges the tabs.thumbnail column and rememberThumbnail's session memory. No GroupModel edit and no new accessor."
  - "A web tab on the empty page returns null from previewImage (it is never captured), so it gets the text card at once. A tab with no loaded card returns undefined: the card shows the skeleton, runs one GroupModel.scheduleReload, then shows the image or the text card."
  - "The card never opens for a tab with widget.isVisible. That covers the current tab and a tab visible in another split pane. It is a superset of 'the active tab while its overlay is visible'."
  - "The card is position fixed at the tab rect's bottom plus 4px, clamped to the window. The UI-SPEC's top: calc(100% + 4px) would be clipped by the strip row's horizontal scroll container."
  - "Focus rule: the strip tracks the pageFocus push. When the card opens while the current tab's page had focus, closing the card calls that tab's focusPage. A tab switch or a press closes the card without refocusing, because the switched-to tab takes focus."
  - "titleChanged baseline: seenTitleByOverlay[browser] follows the title while the tab is active, while its page is loading (the loading argument of the push), and on the first push. So an initial background load, including Phase 36's adopted new-window tabs, never marks. Only a title change in a settled background page marks."
  - "Clearing on activation: the webTabActivated arm calls the existing webTabPagePush for the activated tab. That push rebases the baseline (the tab is now active) and carries titleChanged false. The push goes to the overlay's own frame (webTabPageState.frame), never to a frame named by the message."
  - "The strip hides the dot at once on activation through isUpdated(widget, active), a render condition, not a write. The flag itself clears only through chrome's push."
  - "List All Tabs rows for a marked tab carry the Updated addition in their label ('{label} — Updated'). A stock .lm-Menu row has an icon slot and a label, not a dot slot."
  - "Accessible name: '{label}, updated', or '{label}, pinned, updated' on a pinned tab (UI-SPEC: attention adds ', updated')."
patterns-established:
  - "verify-tab-strip's stripComments keeps block-comment newlines, so every file:line it reports is the file's line."
requirements-completed: [TAB-07, TAB-09]
duration: "about 40 minutes of execution"
completed: 2026-11-01
status: complete
commits: 3
plan_head_before: 1a073abb1d785a5cec305d35c0f89a19553cc033
plan_head_after: e9edf5bfabd0e9a0fe1788f67a9b08fa83db058a
actuals:
  tokens: 43000
  tasks: 3
  commits: 3
---

# Phase 34 Plan 04: Hover preview card and background-title attention mark Summary

**Hovering a background tab for 400 ms opens a 280px aria-hidden card fixed 4px below the tab. The card shows the settled GUI-08 thumbnail from GroupModel's cards, or a text card with title and URL. It is listed in BLOCKING_LAYER_SELECTOR, so the page hides while it is open. A background tab whose settled page changes its title shows a 6px accent dot, the "— Updated" tooltip and the ", updated" accessible name. The flag behind the dot is one primitive field on the existing webTabPush state literal, minted chrome-side and cleared through the webTabActivated arm's push. The frame never writes it. No kind, no store kind and no catalogue row were added.**

## Status

Complete for build work and every static check. Both live scenarios are written and parse, but were not run: the lane ruling is no Gecko build and no live browser. The chrome-side half (PowerBrowserAPI.sys.mjs) is proven by the static gates only until the end-of-milestone pass.

## Performance

- **Tasks:** 3 of 3 executed.
- **Commits:** 3 production commits (`cf1c3383`, `6fbeea13`, `e9edf5bf`), then the SUMMARY commit.
- **Realized diff:** 709 insertions and 123 deletions over 10 files, 171,166 diff characters, so about 43,000 tokens by chars/4. Of that, about 29,000 tokens are the 105 INTERNAL-APIS.md rows whose line numbers shifted. The rest is about 13,700. The plan estimate was 90,000 on the same scale.

## Accomplishments

- **Preview card (TAB-07, D-10/D-11).**
  - Each strip tab has `onPointerEnter` (starts a 400 ms `PREVIEW_DWELL_MS` timer) and `onPointerLeave` (closes). A press, a row scroll and a tab switch also close it.
  - `openPreview` reads the tab's `getBoundingClientRect()` and places the fixed card at `left` (clamped to the window) and `top: box.bottom + 4`.
  - Content:
    - The image is `previewImage(widget)`: a `data:image/` thumbnail from the GroupModel card whose `uri` equals `tabKey(widget)`, else null.
    - While the image is resolving, a skeleton block reuses the existing `pb-chrome-bar-shimmer` keyframes. The shimmer is off under reduced motion.
    - Then the title (13px/600), then the URL (12px muted). A tab with no page, and a non-web tab, show no URL line.
  - The preview path makes no capture call, no screenshot and no chrome request. TabPlacesRow is never read.
  - `.pb-tab-preview` joined `BLOCKING_LAYER_SELECTOR` (web-tab.ts). The existing body MutationObserver republishes on the card's mount and unmount, so the overlay hides and returns with no new code.
  - All card styles are inside `@layer powerbrowser-chrome-bar`. None has an unlayered competitor.
- **Attention mark (TAB-09, D-12).**
  - Chrome side (end-of-file-adjacent web-tab section):
    - A `seenTitleByOverlay` WeakMap keyed by the overlay `<browser>`.
    - `webTabTitleChanged(frame, tabId, browser, loading)`, which compares `browser.contentTitle` with that baseline. It reads no message field.
    - `titleChanged: webTabTitleChanged(theiaBrowser, tabId, browser, loading)` in the `webTabPush` state literal.
    - In the `webTabActivated` arm, `webTabPagePush(activated.browser)`.
  - Frontend:
    - `WebTabState.titleChanged`, read as `detail.titleChanged === true` in the `state` handler.
    - `applyState` copies the value. `onDidChangeTabStatus` fires when it changes, which repaints the strip.
    - `TabStripWidget.isUpdated(widget, active)` gates the dot, the tooltip addition and the accessible-name addition.
- **Copy (D-15).** `updatedTabTooltip` (`{label} — Updated`) and `updatedTabLabel` (`{label}, updated`) are pinned in `EXPECTED_NAV_COPY` in the same commit. The preview adds no copy row, because UI-SPEC specifies the text card as title and URL only ("no 'No preview' sentence").
- **Static gate (`verify-tab-strip.mjs`, checks 11-14).**
  - **11:** BLOCKING_LAYER_SELECTOR members are derived and must include `.lm-Menu` and the card class read from renderPreview's root. openPreview must anchor at the tab rect's bottom plus 4px. schedulePreview and openPreview must refuse `widget.isVisible`.
  - **12:** the five preview methods must make no capture, screenshot, `toDataURL`, `getContext`, channel request or kind. previewImage must read `listUngrouped()` and `.thumbnail`.
  - **13:** the keys of webTabPush's state literal are derived and must include `titleChanged`, valued by `webTabTitleChanged(...)`. webTabTitleChanged must read no `data.`/`detail.`/`msg.`/`message.`. Any other `titleChanged:` in the boundary file goes red naming the nearest `case`/`kind:`. The webTabActivated arm must call `webTabPagePush`.
  - **14:** every `.ts`/`.tsx` under `theia/extensions/*/src` (tests and `.d.ts` excluded) plus `GroupActorChild.sys.mjs` is scanned for a `titleChanged` assignment or object key. Only web-tab.ts's two declarations, its push read and applyState's copy are allowed, and the push read must appear exactly once.
- **Live harness.** Scenarios `preview` (plant `preview-never-opens`) and `attention` (plant `attention-flag-dropped`) were added to SCENARIOS. Both run on withProbeShell. `copyRow` now reads a copy function of any one parameter name.

## Dwell and fallback observations

- Dwell is 400 ms (Firefox parity) with no tuning: nothing ran live. The preview scenario records the hover-to-card time and fails below 380 ms.
- Thumbnail-absent fallback: a web tab on the empty page is never captured (settle capture runs on http(s) network STOP only), so it gets the text card at once with no skeleton. A tab newer than the loaded cards shows the skeleton for one debounced reload (120 ms debounce plus the store read). A GUI-08 thumbnail lands only after `TAB_THUMBNAIL_SETTLE_MS` following load or hide, so a tab hovered within that window shows the text card. That is specified behaviour, not a gap.

## Cross-lane names assumed

None in this plan. Phase 33 (`bookmarkPage`) is not touched. No `STORE_REQUEST_KINDS` or `WEB_TAB_ACTION_KINDS` entry was added. `verify-web-tab-bridge.mjs` was not modified, and it and its `--self-test` stay green.

## Task Commits

1. **Task 1 (tracer): preview card with dwell, fallback, anchor and occlusion.** Commit `cf1c3383`. Tracer gate in auto mode: the automated half (Theia build with 0 `error TS`, verify-tab-strip and `--self-test`, copy gate, registry shape, `--quick` after staging) was re-run green before expanding. The live half is deferred.
2. **Task 2: chrome-computed titleChanged field and attention dot.** Commit `6fbeea13`.
3. **Task 3: occlusion, anchor, capture-free, push-field and no-frame-write guards.** Commit `e9edf5bf`.

## Gate results

- **Theia build:** `nix develop .#theia --command bash -c 'cd theia && yarn build'` exited 0 with 0 `error TS` after Task 1 and after Task 2. Task 3 changed no Theia source.
- **`node scripts/verify-tab-strip.mjs`:** PASS, checks 1-14.
- **`node scripts/verify-tab-strip.mjs --self-test`:** PASS. The unmodified tree was green first, then 20 plants each went red naming their drift. The seven new ones:
  - `occlusion-selector-dropped-34-04`: red naming `.pb-tab-preview`
  - `preview-anchor-over-page`: red naming `anchor`
  - `preview-on-active-tab`: red naming `active`
  - `live-capture-call`: red naming `capture` in previewImage
  - `push-field-missing`: red naming "lacks titleChanged"
  - `push-field-moved`: red naming kind `webTabAttention` at its file line
  - `frame-write-titleChanged`: red naming `tab-strip-widget.tsx` and its line
- **`node scripts/verify-web-tab-bridge.mjs` and `--self-test`:** PASS. The classification maps were not touched.
- **`node scripts/verify-shell-error-copy.mjs` and `--self-test`:** PASS. Two new strings are pinned.
- **`node scripts/verify-ng-040-internals-catalogue-lines.mjs`** (without `--fix`) and **`bash scripts/check-internals-boundary.sh --catalogue`:** PASS. The INTERNAL-APIS.md diff is 105 rows removed and 105 added. Those rows are identical once line numbers are masked, so there are zero new rows. `check-internals-boundary.sh` itself is also PASS.
- **`node scripts/verify-registry-shape.mjs`:** PASS (GUI-04 shape unchanged).
- **`node --check scripts/verify-tab-strip-live.mjs`:** OK after each task.
- **`scripts/verify-platform.sh --quick`**, run inside `nix develop .#theia` after staging: exit 0 after each task.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] INTERNAL-APIS.md line rewrite by exact insertion map, not by `--fix`**
- **Found during:** Task 2.
- **Issue:** `verify-ng-040-internals-catalogue-lines.mjs --fix` rewrote 97 rows. Afterwards, 10 occurrences (PowerBrowserAPI.sys.mjs:5540, 5641, 6269, 6278, 6292, 6298, 6299, 6316, 6451, 6485) had no row. It re-pointed some rows for repeated patterns to an occurrence already claimed by another row.
- **Fix:**
  - Reverted the file.
  - Mapped every `PowerBrowserAPI.sys.mjs:N` reference through the three pure-insertion hunks of this commit's diff (+2 after 3531, +5 after 4717, +15 after 5080). That rewrote 105 references.
  - The catalogue-lines check and `--catalogue`, both run without `--fix`, are green, and the diff is line numbers only.
- **The N1 rule still holds:** the repair happened in the action step, and verification ran without any repair.
- **Not fixed (out of scope):** the `--fix` mis-mapping.

**2. [Rule 3 - Blocking] Copy gate and live harness grown in Tasks 1 and 2, not only Task 3**
- **Issue:** `EXPECTED_NAV_COPY` compares by set equality, so `--quick` would be red at the Task 2 commit. The plan's Task 1 and Task 2 verify lines also name their own live scenarios.
- **Fix:** the copy rows were pinned in the Task 2 commit. Each scenario was written in the task whose verify line names it.

**3. [Rule 1 - Bug] verify-tab-strip's stripComments kept block-comment newlines**
- **Issue:** the new checks report `file:line`. Deleting block comments shifted every line number reported after a doc comment (a plant at line 5306 was reported as 4473).
- **Fix:** block comments are replaced by their newlines. All 20 plants and the green tree are unchanged.

**4. [Design] Card position fixed at the tab rect instead of absolute `top: calc(100% + 4px)`**
- **Reason:** the strip row is a horizontal scroll container (34-02), so an absolutely positioned child of the tab would be clipped. The gate asserts the equivalent anchor: the tab rect's bottom plus 4px.

**5. [Design] List All Tabs shows the Updated addition in the row label, not a dot**
- **Reason:** a stock `.lm-Menu` row cannot render a dot (see key-decisions). This resolves 34-02's stub in text form.

**6. [Design] No preview copy row**
- **Reason:** UI-SPEC's text card is the tab's own title and URL, with no sentence. The plan's "preview plus Updated rows" therefore adds only the two Updated rows.

**7. [Scope] verify-platform.sh: comment only**
- **Reason:** `tab-strip-live` runs every SCENARIOS entry by default, and `tab-strip` is already a quick row. Only that row's comment changed.

**8. [Scope] web-tab-bridge and group-model untouched**
- **Reason:** the field-only mechanism needs no classification. The preview reads GroupModel's existing public lists.

## Deferred (end-of-milestone live pass)

These live checks were written but not run, because the lane has no objdir. Each runs after a Theia build:

- `node scripts/verify-tab-strip-live.mjs --scenario preview`. Self-test plant: `preview-never-opens`.
- `node scripts/verify-tab-strip-live.mjs --scenario attention`. Self-test plant: `attention-flag-dropped`.
- `node scripts/verify-tab-strip-live.mjs --scenario preview,attention` and `node scripts/verify-tab-strip-live.mjs --self-test`.
- The plan's Task 3 verify chain end to end, with only the two live steps skipped: `node scripts/verify-tab-strip.mjs && node scripts/verify-tab-strip.mjs --self-test && node scripts/verify-web-tab-bridge.mjs && node scripts/verify-web-tab-bridge.mjs --self-test && node scripts/verify-shell-error-copy.mjs --self-test && nix develop .#theia --command bash -c 'cd theia && yarn build' > "${TMPDIR:-/tmp}/pb-34-04-t3-build.log" 2>&1 && node scripts/verify-tab-strip-live.mjs --scenario preview,attention && node scripts/verify-tab-strip-live.mjs --self-test && node scripts/verify-registry-shape.mjs && scripts/verify-platform.sh --quick`
- The Task 1 and Task 2 verify lines were skipped on their live halves for the same reason.

Live and owner checks:

- **Chrome-side behaviour has never run.** The titleChanged push field, the webTabActivated re-push and the baseline rules need a Gecko build. That includes the case where a background page retitles during load: by design it does not mark.
- **Preview harness timing.** The preview scenario depends on GUI-08 having captured /a within 30 s and on BiDi pointer moves producing `pointerenter` on the strip. If either fails, the scenario reports NOT SCORED or a harness error, not a pass.
- **Overlay flicker.** The card hides the page for as long as it is open (D-11 by design). Whether that reads well on a real hover sweep across the strip is an owner check.
- **Visual and feel checks:**
  - card readability (thumbnail crop, ellipsis, skeleton) across light and dark themes;
  - the dot on muted, unmuted and pinned tabs, where a pinned tab is 32px with the dot beside its icon;
  - the card clamped at the right window edge.
- **Screen reader:** "…, updated" and "…, pinned, updated", and the preview being aria-hidden (34-VALIDATION manual rows).

## Known Stubs

None added. 34-02's List All Tabs attention stub is resolved as text (deviation 5).

The broken-windows ledger (`.planning/WINDOWS.md`) was not appended. The lane brief keeps shared planning files with the orchestrator.

## Threat Flags

None beyond the plan's register:

- **T-34-04 (no live capture, no URL or title in logs):** enforced by check 12. The preview and attention paths add no log line.
- **T-34-07 (the flag is minted chrome-side only):** enforced by checks 13 and 14.
- **Activation re-push:** the push for the webTabActivated arm reaches only the overlay's own frame.

## Self-Check: PASSED

- FOUND: theia/extensions/chrome-bar/src/browser/tab-strip-widget.tsx, theia/extensions/tab-uris/src/browser/web-tab.ts, powerbrowser/shell/PowerBrowserAPI.sys.mjs, powerbrowser/INTERNAL-APIS.md, scripts/verify-tab-strip.mjs, scripts/verify-tab-strip-live.mjs
- FOUND commits: cf1c3383, 6fbeea13, e9edf5bf (all ancestors of HEAD)
