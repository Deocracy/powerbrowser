---
phase: 39-v1-5-close-out
fixed_at: 2026-11-07T17:27:54Z
review_path: .planning/phases/39-v1-5-close-out/39-REVIEW.md
iteration: 1
findings_in_scope: 11
fixed: 10
skipped: 0
accepted: 1
status: all_fixed
---

# Phase 39: Code Review Fix Report

**Fixed at:** 2026-11-07
**Source review:** .planning/phases/39-v1-5-close-out/39-REVIEW.md
**Iteration:** 1
**Base:** a9be78a6 on main (`workflow.use_worktrees` is false: edits and commits were made in the main checkout)

**Summary:**
- Findings in scope: 11 (CR-01, CR-02, WR-01 to WR-09). The eight Info findings are out of scope; none was a one-line fix in a file already touched.
- Fixed: 10
- Accepted with reason: 1 (WR-06, recorded as backlog 999.33)
- Skipped: 0

**Where verification ran:** every gate below ran in the main checkout `/home/chris/coding/Power-Browser`, so each result can be reproduced from this tree. The headed pb-kwin runs opened a PowerBrowser window on the owner's KDE Wayland desktop (sandbox off, under the `pb-headed.lock` flock). Headed runs: 3. The first had one red, explained under CR-01/WR-01.

## Fixed Issues

### CR-01: The real-input gate accepts any PowerBrowser window, including the owner's own instance

**Files modified:** `scripts/lib/firefox-bidi.mjs`, `scripts/lib/pb-kwin.mjs`, `scripts/lib/pb-live-probe.mjs`
**Commit:** dc44dd11
**Applied fix:** `withFirefoxPage` records each spawned browser pid in a module-level set, and the pid is removed when the process exits. The set is exported as `launchedBrowserPids()`. The spawn is `bash -c 'exec "$@"'` of the ELF `objdir/dist/bin/powerbrowser`, so the child pid is the browser's own. In pb-kwin, `activeWindow()` now reports KWin's `pid`. `gate()` refuses unless the class contains `powerbrowser` AND the pid is in that set, so the class check stays as a second condition. `raiseShell()` raises only a shell window owned by a launched pid. A new `isRunWindow(w)` export lets pb-live-probe's `shellActiveOnce` and `osClientPointer` use the same gate instead of a class-only check. New self-test plant `pid-mismatch`: the right class with another process's pid. Every plant must now refuse with its own message text, not just the shared prefix.
**Verification:** `node --check` on all three files. Headed run 2: `ok  pid-mismatch -> refused`, and the clean control reports `"pid":3510870` on the active shell.

### CR-02: osPointer checks the active window, but the click lands on whatever window is under the pointer

**Files modified:** `scripts/lib/pb-kwin.mjs`
**Commit:** 8be70f62
**Applied fix:** After the second gate and the pointer read-back, `osPointer` refuses the button event unless (x, y) lies inside the gated window's `frameGeometry`. New self-test plant `pointer-outside-frame`: the gated window's frame is shifted off the point, and the action is a left release at the shell's centre, the one event that does no harm if the check were missing. The reviewer's stronger `stackingOrder` check (the topmost window under the cursor) was not added. That check would also refuse clicks on Firefox's native popups, which are separate KWin windows with the same pid. The remaining gap is a `shortcut:` comment in the code: a window stacked over the shell inside its frame is not detected.
**Verification:** headed runs 2 and 3: `ok  pointer-outside-frame -> refused`.

### WR-01: The gate check and the input it guards are separate steps, but the comments say "in the same step"

**Files modified:** `scripts/lib/pb-kwin.mjs`
**Commit:** f2652bc2
**Applied fix:** `captureShell` and `captureActive` keep the pre-check and now run the gate (class and pid) again after spectacle returns, through `gateAfterGrab`. When that second check refuses, the PNG is deleted and the error says so. The header and the `osKeys` docstring now say "checked immediately before, as a separate step". `captureActive`'s `shortcut:` comment names the remaining gap: a window that takes focus and gives it back during the grab is not seen. New self-test plant `after-grab-refused`: the window passes before the grab and is foreign afterwards, and the plant requires both the refusal and a deleted PNG.
**Verification:** headed run 1 caught a real case. The owner's `orca` window became active during the ~25 s `clean-capture-active` grab. The output was `FAIL clean-capture-active -> refused: active window class "orca" does not contain "powerbrowser" once the grab returned; ... clean-active.png deleted`. Runs 2 and 3: `ok  clean-capture-active` and `ok  after-grab-refused -> refused, PNG deleted`.

### WR-02: The real long-press can leave the mouse button held on the owner's desktop

**Files modified:** `scripts/lib/pb-kwin.mjs`, `scripts/verify-nav-keys-live.mjs`
**Commit:** 9f714896
**Applied fix:** pb-kwin exports `releaseButton(button)`, a raw ydotool release with no gate. A release needs no gate because it goes to the surface that took the press (the pointer's implicit grab). In `realLongPress`'s `finally`, the gated `up` through `osClientPointer` still runs first, so a normal release still lands on the pill. When that gated `up` throws, the catch logs a note and calls `releaseButton('left')`. Whether the press happens is still decided by the gated path.
**Verification:** `node --check` on both files. No live long-press run (the review's rules exclude long live rows).

### WR-03: The Vaultwarden child has no `error` listener and no signal cleanup

**Files modified:** `scripts/verify-extension-amo-live.mjs`
**Commit:** 0345f32e
**Applied fix:**
- The child now has an `error` listener. `exited` also resolves on `error`, and a spawn error ends the `/alive` poll early as `BROKEN INSTRUMENT: vaultwarden did not start: <code>`.
- `exit`, `SIGINT` and `SIGTERM` handlers SIGKILL the server and remove its data folder, and `stopVaultwarden` removes the handlers. SIGINT sets `exitCode = 130` and calls `process.exit` only when no other SIGINT listener remains, so withFirefoxPage's own SIGINT cleanup of the browser still runs. SIGTERM exits with 143.
- `nix build nixpkgs#vaultwarden` has a 10-minute timeout, and its failure message names either the timeout or nix's last stderr line.

**Verification:** `scripts/verify-platform.sh --only extension-amo-live-static`: `extension-amo-live-static: PASS`.

### WR-04: A failed `openPageMenu` leaves `state.pending` set, so C11's guard refuses page focus for up to 60 s

**Files modified:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs`, `powerbrowser/INTERNAL-APIS.md`
**Commit:** 0d36abaf
**Applied fix:** The `openPageMenu(...).catch` in `installPageContextMenu` now clears `state.pending` when it still belongs to this menu (`state.pending?.data === data`), then closes the native menu as before. The edit inserted four lines after line 8614. All 107 `PowerBrowserAPI.sys.mjs:N` references in INTERNAL-APIS.md with N >= 8615 were shifted by +4, based on the `git diff -U0` hunk header `@@ -8614,0 +8615,4 @@`. `verify-ng-040 --fix` was not used. Not changed, because the direction asked only for the catch: the `page-context-menu.ts` dismiss for a malformed detail, and clearing `pending` on a frontend re-subscribe after a reload.
**Verification:** `scripts/check-internals-boundary.sh --catalogue`: both files PASS. `node scripts/verify-ng-040-internals-catalogue-lines.mjs`: `PASS -- every INTERNAL-APIS.md line reference points at the internal it names, and every occurrence has a row`. No live run, because the reject path cannot be triggered by a scenario.

### WR-05: The `extensions-late-startup` catalogue row is now wrong about its observers and capability

**Files modified:** `powerbrowser/INTERNAL-APIS.md`
**Commit:** d9108dc1
**Applied fix:** The row's rationale and safety cells were rewritten. They name both observers in the patched tree. The first is ExtensionParent's `browserStartupPromise` and `browserPaintedPromise` (`ExtensionParent.sys.mjs:2515-2522`). The second is EnterprisePoliciesManager's `onAllWindowsRestored` (`EnterprisePoliciesParent.sys.mjs:86`, G15; `:369-371`, G16). The cells state the capability: the topic now applies every enterprise policy's `onAllWindowsRestored` callback with no stock window. They also state that the callbacks run once, at the first of the two topics, because `_runPoliciesCallbacks` drains its list with `shift()` (`:285-288`), and they cite plan 39-04 and 999.16. The line numbers were read from the patched `upstream/` tree.
**Verification:** `check-internals-boundary.sh --catalogue` PASS, `verify-ng-040-internals-catalogue-lines.mjs` PASS, `scan-brand-residue.mjs`: `PASS -- no residual brand occurrence in 678 scanned file(s)`.

### WR-07: The private-access plant passes on any failure, and harness errors are reported as product failures

**Files modified:** `scripts/verify-extension-actions-live.mjs`
**Commit:** 225494ab
**Applied fix:** An `ideLoaded` flag is set when the session callback starts. The catch turns an error into the private-access rule failure only while the IDE has not loaded. After that, every error is rethrown with its own message, which the runner then reports as a FAIL with that text (or as BROKEN when the message has that prefix). The `shell-not-private` plant now expects the assertion's own text, `the denied extension shows a button`.
**Verification:**
- `node scripts/verify-extension-actions-live.mjs --self-test --static`: `PASS -- 19 plant(s) each target a scenario, name text it emits and are read by it; every scenario has a plant`.
- One headless run of `--scenario private-access`: session 1 passed (`the permanent-private leg passed (shell private true: denied has no button, puzzle row or sidebar key, its options page refused ...)`). Session 2 is red, which is the known-open ledger 29 / 999.17 entry (`with a private stock window open last the denied options page is in [{..."private":true}], want the one non-private window`).

### WR-08: Leg 1 of options-page-switch can pass without testing the "window still starting" state

**Files modified:** `scripts/verify-ext-tab-host-live.mjs`
**Commit:** 29715e3c
**Applied fix:** Leg 1 runs up to three attempts. After an attempt whose second call met an already-started window, the stock window is closed and the leg runs again. If the state is never reached, the PASS detail starts with `leg 1 SKIPPED: the stock window had finished starting at the second call in N attempt(s) ([...])` and does not claim the leg. A second window, or a second options tab, on any attempt still fails, and leg 2 and the `options-no-reuse` plant are unchanged.
**Verification:** one headless run of `--scenario options-page-switch`: `options-page-switch: PASS -- a second call while the stock window was starting (attempt 1) gave one stock window and one options tab; a third call switched to it and added none`. The window was starting on the first attempt, so the retry path was not exercised live.

### WR-09: The site-identity catalogue plant is pinned to a boundary line number

**Files modified:** `scripts/verify-site-identity.mjs`
**Commit:** d09fb233
**Applied fix:** `catalogueAnchor()` reads INTERNAL-APIS.md when the check runs. It takes the File:Line cell of the first `webTabClearSiteData` row whose line no other row cites, because a shared line would stay covered after the plant drops one row. That cell becomes the plant's `from` and `treePlant`. Today the anchor resolves to `PowerBrowserAPI.sys.mjs:6482`. If no such row exists, the plant fails loudly on a missing anchor.
**Verification:** `scripts/verify-platform.sh --only site-identity-self-test`: `verify-site-identity --self-test: PASS -- the clean tree is green and all 56 planted faults went red` / `site-identity-self-test: PASS`.

## Accepted Issues

### WR-06: `--gate` exclusions cover whole labels for single-scenario reds in the suites this phase extended

**File:** `scripts/verify-platform.sh:6499-6539`, `:6585-6606`
**Decision:** accepted for the v1.5 close-out, not redesigned (direction from the orchestrator).
**Reason:** Each exclusion is bound to an open WINDOWS.md ledger id (25, 28, 29, 39, 40, 43). `--gate` checks `ledger_entry_is_open` for each match. Once the entry closes, a still-red label prints `FAIL (exclusion no longer applies)` and the gate fails, so an exclusion cannot outlive its ledger entry. The remaining exposure is the one the review names: a new red in another scenario of an excluded label is hidden while that entry stays open.
**Recorded:** ROADMAP backlog `Phase 999.33: Scenario-scoped gate exclusions (BACKLOG)`, commit 6ba9a12b.

## Gate runs on the final tree

- `flock .../pb-headed.lock -c 'PB_LIVE_HEADED=1 node scripts/lib/pb-kwin.mjs --self-test'` (headed run 2): `pb-kwin --self-test: PASS`
- `scripts/verify-platform.sh --only real-input-gate-self-test` (headed run 3): `real-input-gate-self-test: PASS`
- `scripts/verify-platform.sh --only extension-amo-live-static`: `extension-amo-live-static: PASS`
- `scripts/verify-platform.sh --only site-identity-self-test`: `site-identity-self-test: PASS`
- `node scripts/verify-extension-actions-live.mjs --self-test --static`: `PASS -- 19 plant(s) ...`
- `scripts/check-internals-boundary.sh --catalogue`: `internals-catalogue: PASS` (both files)
- `nix develop .#theia --command scripts/verify-platform.sh --quick`: `verify-platform: PASS -- all checks passed` (328 rows PASS, none red)

---

_Fixed: 2026-11-07_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
