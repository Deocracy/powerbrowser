---
phase: 59-carry-forward-from-v1-5-and-v1-6
plan: 09
subsystem: page-context-menu
tags: [verify-platform, live-harness, page-menu, focus, flake, gap-closure]
requires:
  - phase: 59-04
    provides: "Gap closure item 3: page-furniture-live-self-test (WINDOWS 43) red 1 of 3 on the merged tree"
provides:
  - "Page menu edit rows on a text field run on, and read their state from, the right-clicked field rather than the page's focused element"
  - "menu-edit names the menu and focus state on a Paste or Undo miss"
  - "edit-rows-top-document plant reaches the new edit-state route"
affects: [59-04 merge of lane p59-08/p59-09, WINDOWS.md 43, backlog 999.30]
actuals:
  tasks: 1 of 1
  commits: 4 (2 fix, 2 test) + this docs commit
key-files:
  created:
    - .planning/workstreams/orca/phases/59-carry-forward-from-v1-5-and-v1-6/59-09-PLAN.md
    - .planning/workstreams/orca/phases/59-carry-forward-from-v1-5-and-v1-6/59-09-SUMMARY.md
  modified:
    - powerbrowser/shell/PowerBrowserAPI.sys.mjs
    - powerbrowser/shell/GroupActorChild.sys.mjs
    - scripts/verify-page-furniture-live.mjs
key-decisions:
  - "Product defect, not harness drift: the page's focused element is cleared at the overlay's hide/show around a page menu, and the edit rows depended on it"
  - "Fixed on the right-clicked field (ContextMenu actor target, the field's own controllers), not by waiting or retrying in the harness"
  - "Non-text rows (Copy Image) keep the Controllers route; a target without controllers keeps the docShell route and the cached state"
requirements-completed: [999.30]
coverage:
  - id: D1
    description: "page-furniture-live-self-test green three runs of three on this lane's tree"
    requirement: "999.30"
    verification:
      - kind: e2e
        ref: "scripts/verify-platform.sh --only page-furniture-live-self-test (x3)"
        status: pass
    human_judgment: false
  - id: D2
    description: "page-furniture-live green"
    requirement: "999.30"
    verification:
      - kind: e2e
        ref: "scripts/verify-platform.sh --only page-furniture-live"
        status: pass
    human_judgment: false
duration: ~5h
completed: 2026-11-09
status: complete
---

# 59-09 Summary: page-furniture-live-self-test Undo flake (WINDOWS 43), lane p59-09

**The page menu's text-field edit rows depended on the page's focused element, which the overlay's hide and
show around the menu can clear. They now run on, and read their state from, the right-clicked field.
page-furniture-live-self-test is green 3 of 3 and page-furniture-live is green.**

## Closes

| id | fix commits | lane proof | coordinator proof command | status |
|----|-------------|------------|---------------------------|--------|
| WINDOWS.md 43 | beab4276, f51a345a (product); 8ac2e703, 80154cb5 (harness) | `scripts/verify-platform.sh --only page-furniture-live-self-test` PASS 3 of 3 (clean control green, 34 of 34 plants red); `scripts/verify-platform.sh --only page-furniture-live` PASS 1 of 1; `--quick` 330 PASS | `scripts/verify-platform.sh --only page-furniture-live-self-test` three times, then `--only page-furniture-live`, on the merged tree with the v1.7 dev binary and `-purgecaches` (the harness sets it) | fixed |

Lane logs: $HOME/.cache/powerbrowser-59/p59-09/proof4/ (self-test-1..3.log, live-1.log).

## Cause

Evidence first. Logs are in $HOME/.cache/powerbrowser-59/p59-09/.

1. **The flake is the page's focus, not the clipboard or the click.** `menu-edit` alone, 40 runs on the
   merged tree (loop1): 35 green, 5 red, all "Paste did not set the second field". The 59-04 red ("Undo did
   not restore") is the same leg one step later. With diagnostics added (loop2), the reds stopped (40 of 40)
   because the extra reads changed the timing. They also showed the page's `document.activeElement`
   dropping to `body` right after a pick, while chrome's focus was still on the Theia frame.
2. **Who clears it.** A run with `MOZ_LOG=Focus:5` (focuslog/run5) shows `<<ClearFocus>>` in the page's
   content process about 5 ms after each pick. It comes with no parent or Theia focus action, and the next
   "Raised Window" then reports "(none) has been focused". A mousedown recorder in the page saw no stray
   clicks.
3. **Why.** While a page menu is open, the overlay `<browser>` is `visibility: hidden` (the blocking-layer
   rule plus the D-08 freeze-frame), and it is shown again at the pick. `nsIFrame::IsFocusable` returns
   false under `PresShell::IsUnderHiddenEmbedderElement()`. `PresShell::FixUpFocus` (HTML's focus fix-up,
   run in the rendering update) then clears a focused element that is no longer focusable. Holding the
   menu open for 1 s did not clear focus (hold/), so the clear lands on the hide-to-show transition at the
   pick, unordered against the edit command.
4. **Two consequences, both product-visible.** (a) `pageMenuEdit` sent the command through ControllersChild,
   which runs it on whatever the page has focused when it arrives. A clear that landed first made Paste or
   Undo do nothing (loop1). (b) The rows' enabled state came from ControllersParent's cache, which follows
   the same focused element, so a right-click landing while the field was unfocusable greyed Undo. A pick
   on a disabled row does nothing, and the menu stays open. This was self-test clean control red twice
   (proof, proof2), the second time with this lane's new failure text: rows `"Undo (off)" ... "Cut",
   "Copy"`, focused `body`. In that case `iframe-edit-rows` then could not see its page, because the
   menu was still open.

## Fix

- **beab4276** `pageMenuEdit`: a text-input row (`data.context.onTextInput`) goes to the
  PowerBrowserEditState child as `PowerBrowserEditState:Do`. The child runs it on the ContextMenu actor's
  target through the field's own `controllers`, which do not depend on focus. Chrome sends Hiding after
  this message, so the target is still held. A target without controllers (contenteditable) keeps the
  docShell route behind the same `isCommandEnabled` guard. Non-text rows (Copy Image) keep the Controllers
  route. One line changed, so no catalogued line moves.
- **f51a345a** `pageMenuFacts`: for a text input, the edit facts come from
  `PowerBrowserEditState:Target` (that field's own command states). The query has the existing
  `EDIT_STATE_BUDGET_MS` budget and keeps the cached state on no answer, a null answer or a timeout. The
  helper is appended at the end of the file.
- **8ac2e703** harness: a Paste or Undo miss now names the value seen, the open menu's rows with their off
  flags, and the page's focused element. These are read only after the miss.
- **80154cb5** harness: the `edit-rows-top-document` plant (CR-02's defect) also sends
  PowerBrowserEditStateParent's `sendQuery` and `sendAsyncMessage` to the top document's actor. After
  f51a345a, the text-field rows no longer use ControllersParent, and the plant stayed green 3 of 3
  ("Copy Image ignore"). It goes red again on its own reason.

Sanity plants, each run once and reverted. A no-op `Do` turned menu-edit red at Copy, and an all-off
`Target` turned it red at Copy. That proves both new routes are the ones that ran.

## Proof runs

| run | result |
|-----|--------|
| `menu-edit` x40, merged tree, before the fix (loop1) | 35 of 40 green; 5 reds at Paste |
| `menu-edit,iframe-edit-rows` x40, after beab4276 (loopfix) | 40 of 40 green |
| self-test x3 + live, after beab4276 (proof, proof2) | self-test run 1 red twice: clean control Undo, row disabled (cause 4b) |
| self-test x3 + live, after f51a345a (proof3) | self-test red 3 of 3: plant `edit-rows-top-document` drift; live PASS |
| `--self-test --scenario iframe-edit-rows,menu-edit` after 80154cb5 | PASS, 3 of 3 plants red |
| **self-test x3 + live, final tree 80154cb5 (proof4)** | **PASS 3 of 3, live PASS** |
| `scripts/verify-platform.sh --quick`, final tree | PASS, 330 |

## Deviations from Plan

- **Proof binary.** The brief names `PB_FIREFOX_BIN=.../v1.7-Orca-integration/objdir/dist/bin/powerbrowser`.
  That dist symlinks `powerbrowser/shell/*` into the v1.7 tree, so it cannot load this lane's product
  change. A full `mach build` here would take about 50 minutes. The lane proofs instead used a lane-local
  copy of that dist at $HOME/.cache/powerbrowser-59/p59-09/dist-bin. It holds hardlinks to the same
  compiled files, absolute links for its relative symlinks, and the six `powerbrowser/shell` links pointed
  at this worktree. `git diff` showed this tree's shell equal to v1.7's apart from the fix. After the merge,
  the plain v1.7 binary picks the change up through its own symlinks, because the harness purges caches.
  The coordinator command in Closes is that re-proof. The dist-bin copy can be deleted at any time.
- **Two attempts.** Attempt 1 (beab4276) fixed where the command runs. Attempt 2 (f51a345a, with the plant
  update 80154cb5) fixed where the rows read their state. The row is green after attempt 2.
- `PB_BACKEND_MAIN` was this worktree's `theia/applications/browser/lib/backend/main.js`, built by the
  audited install. Every live run took the shared `pb-live.lock` and none was headed or real-input.

## Remaining (not in this plan's scope)

- After any page menu pick, the page still loses its focused element on the show (cause 3), so the caret
  is not back in the field after the menu closes. Edit rows are no longer affected. Restoring focus means
  hiding the overlay without `visibility: hidden` (for example opacity with pointer-events off). That
  touches every blocking layer and every `style.visibility === "visible"` check, so it is left for a
  planned change, not a lane fix.
- WINDOWS.md 43 and the ledger are not edited here (lane rule). The coordinator closes 43 after the merged
  re-proof.
