---
phase: 29-address-bar-search-and-fixup
plan: 10
subsystem: chrome-bar address bar / live address-bar check
status: complete
tags: [BAR-11, BAR-12, ime, select-all, drafts, live-check, phase-close]
requires: [29-09]
provides:
  - "composing(e) (instance method: isComposing or keyCode 229) gating every onInputKeyDown branch and onInputChange's query skip"
  - "onCompositionEnd: one query for the composed text, never autofilled"
  - "onInputMouseDown / onInputMouseUp: a primary press that gives the pill focus selects all unless it dragged a range"
  - "renderNow(): textEdited renders inside the handler, so React's controlled-value restore cannot end an IME composition"
  - "drafts (WeakMap<Widget, string>), draftOwner, saveDraft (instance method); onCurrentWidgetChanged saves, closes the dropdown and restores; syncAddressFromWidget(widget, keepEdit)"
  - "Live scenarios select-ime (control: suggestions) and drafts; plants ime-guard-off and draft-lost"
affects: []
tech-stack:
  added: []
  patterns:
    - "IME at the parent through one nsITextInputProcessor kept on the shell window across evaluate calls, so a composition and the Enter pressed during it share one transaction"
    - "Trusted pointer input on the Theia frame through BiDi input.performActions on the Theia context, with text x positions from canvas measureText on the input's font"
    - "Real focus in a nested frame is document.hasFocus() && activeElement === input; activeElement alone is stale once chrome focus is in a page"
key-files:
  created: []
  modified:
    - theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx
    - scripts/verify-address-bar-live.mjs
    - .planning/phases/29-address-bar-search-and-fixup/deferred-items.md
decisions:
  - "Every pill edit renders synchronously (MessageLoop.sendMessage UpdateRequest), not only edits during a composition. React 19 puts a controlled input's old value back after onChange unless the root re-rendered during the handler, and Theia's update() renders a frame later. Mid-composition that write ended the composition (measured: compositionend straight after the first input event, the pill back on the old address). Limiting the fix to the composition branch would have left the ime-guard-off plant unable to reach the Enter step."
  - "The field formerly called composing is now compositionOpen, so the plan's composing(e) method can carry the name the plant replaces."
  - "Select-all reads document.hasFocus() as well as activeElement at the press. After a page click, the Theia document's activeElement can still be the pill, and without hasFocus the first click would not select."
  - "Drafts hold only the tabs not on screen. The current tab's typed text lives in inputValue, and its entry is deleted when it is restored. saveDraft is the only writer and keeps nothing when the value equals the committed address. So every commit path and Esc's restore step clear the draft without a separate delete on each path."
  - "The drafts live check records the Enter commit (openCommittedUrl wrapped, as canonize-drop does) instead of loading the engine page. A localhost tab navigating to the 127.0.0.1 engine would change site and add a fifth tab on the served 127.0.0.1 origin."
metrics:
  duration: 3h05m
  completed: 2026-10-21
  tasks: 2
  files: 3
commits: 2
plan_head_before: 8c5ccccf282d6ca2d1aec56b5e78e56622b32c28
plan_head_after: d9677fa47bd311ac51ed7a6237f3fc7ef57a7811
actuals:
  tokens: 6600
  tasks: 2
  commits: 2
---

# Phase 29 Plan 10: First-click select-all, IME guard and per-tab drafts Summary

A primary press that gives the pill focus selects the whole address. A drag that starts on that press keeps its own range, and later clicks are stock. While an IME composition is open, the pill handles no key: Enter, Tab, the arrows, Esc and Shift+Delete do nothing, and nothing is queried or autofilled. Composition end runs one query, and only an Enter after it commits. Text typed but not submitted is kept per tab, in memory only. It survives the tab's own navigations, and a commit, Esc's restore step or closing the tab clears it. This plan closes the phase: all 18 live scenarios pass together, and so do the self-test's 12 plants and the Phase 27 and GUI-02 live checks.

## What was built

- **IME guard (`chrome-bar-widget.tsx`)**
  - `composing(e)` returns `nativeEvent.isComposing === true || keyCode === 229`. It is an instance method, so the plant can replace it.
  - `onInputKeyDown` returns at its top while composing, before every branch, the 29-09 Shift+Delete branch included.
  - `onInputChange` passes `composing(e)` to `textEdited` (this replaces 29-06's inline check). `textEdited`'s flag is now the field `compositionOpen`, which `fetchEngineRows` also reads.
  - `onCompositionEnd` calls `textEdited(value, false)`. That is one debounced query, never autofilled.
  - `renderNow()`: `textEdited` renders inside the handler. See Deviations 1.
- **Select-all:** `onInputMouseDown` records `focusedAtPress = document.hasFocus() && activeElement === input`. `onInputMouseUp` (button 0) calls `input.select()` when the press did not find the pill focused and the selection is collapsed. Keyboard focus keeps its inherited select-all.
- **Drafts (BAR-12)**
  - The state is `drafts = new WeakMap<Widget, string>()` and `draftOwner`.
  - `onCurrentWidgetChanged` runs `saveDraft()`, then `closeDropdown()`, then sets `draftOwner`. If the incoming widget has a draft, the committed address becomes `addressOf(widget)` and the value becomes the draft. Its entry is deleted, and setting the value puts the caret at its end without moving focus. If it has none, `syncAddressFromWidget(widget, false)` syncs unconditionally.
  - `syncAddressFromWidget(widget, keepEdit = true)`: while the value differs from the committed address, focused or not, a push updates only `committedAddress`. The focus-based guard is gone.
  - `saveDraft()` skips a disposed owner. Nothing is written to settings, the tab store, a push or a log.
- **Live harness (`verify-address-bar-live.mjs`)**
  - `select-ime`, scored only after `suggestions` passes:
    - A trusted BiDi click on the Theia context, with the page focused, selects everything. A second click leaves a collapsed caret. A press at the start dragged to the middle selects from 0 to the middle.
    - IME: "かな" is composed through one nsITextInputProcessor kept on the shell window. Enter while composing gives no loading push, no GET on /one/search and no GET on /one/suggest in 1500 ms.
    - Committing the composition gives exactly one suggest GET for かな, the positive control. Enter then gives a GET on /one/search with q かな and a push for the tab.
  - `drafts`, on localhost tabs /dr-a, /dr-b and /dr-c:
    - Switching away shows B's address. Switching back restores the draft with the caret at its end and no dropdown, and the switch does not focus the pill or move the Theia frame's active element.
    - The draft survives A's own `location.href` navigation to /dr-a2.
    - Enter commits it as a search on /one/search with q "draft text" (recorded), and switching away and back then shows /dr-a2.
    - After Esc twice in B, switching away and back shows B's address.
    - Closing C with "gone" typed leaves the pill on the next current tab's own address.
  - Plants: `ime-guard-off` (composing returns false) goes red with "committed during composition", and `draft-lost` (saveDraft does nothing) with "expected the draft text".

## Verification (all run this session)

- **Static checks:**
  - `verify-chrome-bar-suggestions`: PASS.
  - `tsc --noEmit -p extensions/chrome-bar`: clean.
  - `scan-brand-residue`: PASS on 380 files, with the new work staged first.
  - `scripts/verify-platform.sh --quick`: PASS before each commit and at the end.
- **Acceptance greps:**
  - `onCompositionEnd`: the handler (line 1070) and the binding (2054).
  - `keyCode === 229`: one line.
  - `new WeakMap<Widget, string>()`: one line.
- **Theia build:** chrome-bar build plus `theia build`, exit 0 after each change. The bundle contains `saveDraft`.
- **Live runs:**
  - `--scenario search,suggestions,select-ime`: PASS.
  - `--scenario search,drafts`: PASS.
  - **Full run:** all 18 scenarios PASS, `select-ime` and `drafts` included.
  - **`--self-test`:** the second run is PASS. Its clean control was green, and all 12 plants went red as named, `ime-guard-off` and `draft-lost` included.
  - The first `--self-test` run had all 12 plants red as named, but its clean control was red on the deferred `context-menu` focus step. See Deferred Issues.
  - **`verify-nav-keys-live.mjs`** (all 31 scenarios): PASS, exit 0.
  - **`verify-web-tab-live.mjs`:** PASS, exit 0.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] React's controlled-value restore ended every IME composition**
- **Found during:** Task 1, live.
- **Issue:** the first composition never reached the pill. Instrumented events: `compositionstart`, `compositionupdate`, `input` (isComposing true), and then `compositionend` at once, with the value back on the old address. React 19 puts a controlled input's previous value back after `onChange` unless the root re-rendered during the handler. Theia's `update()` posts the render to a later frame, so the restore wrote the old value, and that ends a composition. A real fcitx/ibus composition would be hit the same way.
- **Fix:** `textEdited` now ends with `renderNow()` (`MessageLoop.sendMessage(this, Widget.Msg.UpdateRequest)`), which renders during the handler, so React flushes it before the restore. This applies to every edit, not only edits during a composition. Otherwise the `ime-guard-off` plant would have brought the restore back and gone red as a broken instrument rather than on the guard.
- **Files modified:** theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx
- **Commit:** 47a4199

**2. [Rule 3 - Blocking] Field and method name collision**
- **Issue:** the plan names the method `composing(e)`, but 29-06's boolean field already used that name.
- **Fix:** the field is now `compositionOpen`.
- **Commit:** 47a4199

**3. [Rule 1 - Bug] Select-all would not fire after a page click**
- **Issue:** with chrome's focus in a page, the Theia document's `activeElement` can still be the pill, so a check on `activeElement` alone reads it as already focused.
- **Fix:** the press also requires `document.hasFocus()`.
- **Commit:** 47a4199

**4. [Plan detail] Drafts are cleared without a delete on each commit path**
- `saveDraft` is the only writer, and it keeps nothing when the value equals the committed address. Every commit path (`commitText`, `commitRow`, `switchToTab`, `openRowInNewTab`, Paste & Go) and Esc's restore step leave the value equal to it.
- The current tab's entry is deleted when it is restored, so no stale copy of the text stays in memory after a commit. The result is the plan's behaviour, with one rule in place of five call-site deletes.
- **Commit:** d9677fa

**5. [Rule 3 - Blocking] The drafts check records the Enter commit instead of loading it**
- **Issue:** the commit would load the 127.0.0.1 engine page in a localhost tab. That is a site change (the process-switch hazard the 29-09 carry-over warns about) and a fifth tab on the served 127.0.0.1 origin.
- **Fix:** `openCommittedUrl` is wrapped to record the URL, as `canonize-drop` does. The check requires one commit on /one/search with q "draft text", and that switching away and back then shows A's address.
- **Commit:** d9677fa

**6. [Harness] `select-ime` types its own text before the select-all clicks**
- **Issue:** the full run leaves the pill empty after `context-menu`, and select-all on an empty value cannot be told apart from a caret.
- **Fix:** the scenario types "select all of this" first.
- **Commit:** 47a4199

## Deferred Issues

- **context-menu: focus after Paste & Go is still intermittent, and this plan did not cause it.**
  - On the 29-10 widget it failed in 1 of 3 runs of `--scenario search,context-menu` and in the first self-test's clean control.
  - On the 29-09 widget, rebuilt from `8c5cccc`, the same harness failed 2 of 4 runs of `--scenario search,context-menu`.
  - So token-cookie is not a precondition, contrary to 29-09's note. The suspected cause is still the Phase 27 GUI-02 remoteness defect. The full run and the second self-test were green.
  - Recorded in `deferred-items.md`.

## Phase-close records

- **New endpoint-allowlist hosts (29-03):** lite.duckduckgo.com, ac.duckduckgo.com and en.wikipedia.org. Each is a marked row derived from `configuration.toml` `[[search_engines]]`.
- **Brand literals outside chrome-bar (29-RESEARCH Open Question 5), debt for a later phase:** `mode-service.ts`, `web-tab.ts` and `save-page-copy-command.ts` still carry brand literals. BAR-14's scope was chrome-bar source only.
- **Manual checks deferred to Chris (29-VALIDATION "Manual-Only"):**
  - a sidecar built with a different `applicationName` shows that name in the failure rows (BAR-14);
  - a real fcitx/ibus IME on KDE Wayland: Enter during a composition must not navigate (BAR-11; the TIP route is evidence, not UAT);
  - visuals: row look, one-off strip wrap and drop ring (KWin raise plus spectacle);
  - real-network engine suggestions in the packaged build (BAR-03).
- **Before `/gsd-verify-work`:** the full `scripts/verify-platform.sh` (with 29-04's packaged row) is still to run. This plan ran `--quick` and the three live checks.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register.
- T-29-37: drafts are a WeakMap in the widget only. They are never logged, pushed or stored, and are cleared by commit, Esc's restore and close.
- T-29-38: `composing(e)` gates every key and every query. The live check has a positive control and the `ime-guard-off` plant.
- T-29-39: drafts are keyed by widget identity, and a tab switch always re-syncs. Checked live across three tabs.

## Risks for later plans

- `syncAddressFromWidget` no longer depends on focus. An unfocused pill with an edit in it keeps that edit through pushes. Any later code that sets `inputValue` without `committedAddress` creates an edit that pushes will not overwrite.
- `textEdited` renders synchronously. A later caller in a hot loop (bulk paste, programmatic edits) pays one React render per call.
- The `context-menu` focus flake (see Deferred Issues) can redden a full run or a self-test's clean control. Rerun before treating it as a regression.
- `.planning/state.json` was left unstaged, as in 29-09.

## Self-Check: PASSED

- FOUND: 47a4199 (task 1), d9677fa (task 2), both ancestors of HEAD
- FOUND: theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx, scripts/verify-address-bar-live.mjs, deferred-items.md
