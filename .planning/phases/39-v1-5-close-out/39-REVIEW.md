---
phase: 39-v1-5-close-out
reviewed: 2026-11-07T16:57:06Z
depth: standard
files_reviewed: 28
files_reviewed_list:
  - patches/050-extension-tab-host.patch
  - powerbrowser/INTERNAL-APIS.md
  - powerbrowser/shell/PowerBrowserAPI.sys.mjs
  - scripts/lib/firefox-bidi.mjs
  - scripts/lib/pb-extension-fixtures.mjs
  - scripts/lib/pb-kwin.mjs
  - scripts/lib/pb-live-probe.mjs
  - scripts/verify-address-bar-live.mjs
  - scripts/verify-extension-actions-live.mjs
  - scripts/verify-extension-amo-live.mjs
  - scripts/verify-ext-tab-host-live.mjs
  - scripts/verify-ext-tab-host-patch-guards.mjs
  - scripts/verify-nav-keys-live.mjs
  - scripts/verify-new-window-adopt-live.mjs
  - scripts/verify-page-furniture-live.mjs
  - scripts/verify-page-tools-live.mjs
  - scripts/verify-platform.sh
  - scripts/verify-prompts-live.mjs
  - scripts/verify-release-shape.mjs
  - scripts/verify-shell-gbrowser-standin.mjs
  - scripts/verify-site-identity.mjs
  - scripts/verify-tab-strip-live.mjs
  - theia/extensions/chrome-bar/src/browser/chrome-bar.css
  - theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx
  - theia/extensions/chrome-bar/src/browser/extensions/extension-actions-widget.tsx
  - theia/extensions/chrome-bar/src/browser/page-context-menu.ts
  - inventory/brand-tokens.json
  - CLAUDE.md
findings:
  critical: 2
  warning: 9
  info: 8
  total: 19
status: issues_found
fix_report: 39-REVIEW-FIX.md
---

# Phase 39: Code Review Report

**Reviewed:** 2026-11-07T16:57:06Z
**Depth:** standard
**Files Reviewed:** 28
**Status:** issues_found

## Summary

Scope: the hunks changed in `e5593190^..HEAD` for the 28 listed files. The two large files (`PowerBrowserAPI.sys.mjs`, `verify-platform.sh`) were reviewed hunk by hunk with their surrounding code. The large live-harness diffs (`verify-page-furniture-live.mjs`, `verify-prompts-live.mjs`, `verify-page-tools-live.mjs`, `verify-new-window-adopt-live.mjs`) were spot-checked, not read line by line.

These static gates were run and pass on the current tree: `scan-brand-residue.mjs`, `verify-shell-gbrowser-standin.mjs`, `verify-ext-tab-host-patch-guards.mjs`, and `verify-extension-amo-live.mjs --static`.

Items checked that hold up:
- The private-jar token cookie stays out of extension reads. Patch 060's `extensions.cookies.hidden` filter keys on `name@host` and ignores the jar, so `{ privateBrowsingId: 1 }` is covered in `query`, `onChanged` and `set`.
- In the `switchToTabHavingURI` wrapper, the `STOCK_WINDOW_WRAPPERS` exemption covers only the body of `extensionSelectTabPage`. Plant m2 proves that a second definition anywhere else still counts.
- The `reuseSwitchWrapped` WeakSet is declared as a module-level `const` after the function that reads it. This is safe because the function only runs after the module has finished evaluating.
- The new `stale` save-path arm uses `<= state.nextMenuId`, which is correct because `nextMenuId` is pre-incremented.
- Vaultwarden binds `127.0.0.1` only (checked with `ss`, which has its own plants), is stopped in a `finally` on every in-process exit path, and the harness prints no credential.
- A suspected race in `syncSidebar` (a dismissed view being re-added once the shell is ready) does not happen. Theia's `BaseWidget.onCloseRequest` disposes the view, so the `isDisposed` check catches it.

The main problem is the new real-input gate in `pb-kwin.mjs`, the one safety mechanism between ydotool and the owner's live desktop:
- It identifies the target only by a class substring, so any PowerBrowser window passes, including one the owner has open.
- For pointer input it checks the active window, not the window that will actually receive the click.

Secondary problems:
- A page-menu failure path now blocks keyboard entry into the page for up to a minute.
- The `extensions-late-startup` catalogue row is stale now that patch 050 adds a second observer.
- `--gate` exclusions are granular to whole labels and cover the suites this phase extended.
- Several plants and legs can pass without testing what they name.

## Critical Issues

### CR-01: The real-input gate accepts any PowerBrowser window, including the owner's own instance

**File:** `scripts/lib/pb-kwin.mjs:113-120` (gate), `:82-92` (raiseShell), `:166-179` (osKeys); `scripts/lib/pb-live-probe.mjs` `shellActiveOnce`, `osClientPointer`
**Fix status:** fixed in dc44dd11 (gate, raiseShell and pb-live-probe require a launched pid; plant pid-mismatch).
**Issue:** `gate()` passes when `resourceClass.toLowerCase().includes('powerbrowser')`. Every window of every PowerBrowser process has that class:
- the probe's stock browser windows;
- its DevTools and print dialogs (`captureActive`'s docstring relies on exactly this);
- any PowerBrowser the owner is running for daily use under another profile.

The osKeys docstring (line 167) says "the send is refused unless it is the shell", but nothing distinguishes the shell. Nothing binds the gate to the process the harness launched either. `raiseShell()` activates every window whose class matches and whose caption is exactly `PowerBrowser`, and the last match wins. With the owner's own PowerBrowser open, that is as likely to be the owner's window as the probe's. After that, osKeys, osPointer and captureShell all pass the gate against the owner's window. Real keys (Enter, Escape, Tab, Alt+Shift+I/O, Ctrl+Shift+L, F10) and real clicks (middle-click on a tab closes it) then reach the owner's browsing session, and screenshots of it are written to the evidence directory.

`verify-prompts-live.mjs:896` already acknowledges the hazard ("the raise must not pick up a PowerBrowser the owner has open"), but only by skipping the capture when the run is headless. Headed runs, which are the only runs where this code sends anything, are unprotected. A stock window that takes focus mid-scenario also passes, so keys meant for the shell land in the stock window without any refusal.
**Fix:** Bind the gate to the launched process. The launch through `firefox-bidi.mjs` already preserves the pid (`exec "$@"`). KWin 6's `Window.pid` is readable from the script:
```js
// activeWindow(): add pid: w.pid to the printed JSON
function gate({ expectClass = SHELL_CLASS, expectPid, shellOnly = true, readActive = activeWindow } = {}) {
    const w = readActive();
    const cls = String(w?.resourceClass ?? '');
    if (!cls.toLowerCase().includes(expectClass) || w.pid !== expectPid || (shellOnly && w.caption !== SHELL_CAPTION)) {
        throw new Error(`refused: active window ${JSON.stringify({ cls, pid: w?.pid, caption: w?.caption })} is not this run's shell (pid ${expectPid})`);
    }
    return w;
}
```
Also filter `raiseShell` on `w.pid === expectPid`. Pass the child pid through `app`, which `withFirefoxPage` can expose. Add a plant that sets `readActive` to return a window with the right class but a foreign pid.

### CR-02: osPointer checks the active window, but the click lands on whatever window is under the pointer

**File:** `scripts/lib/pb-kwin.mjs:240-272`
**Fix status:** fixed in 8be70f62 (frameGeometry check before the button event; plant pointer-outside-frame); the stackingOrder read is not done, see 39-REVIEW-FIX.md.
**Issue:** Before the button event, `osPointer` checks two things: that the *active* window's class matches, and that the pointer reads back at `(x, y)`. It never checks that `(x, y)` lies inside the gated window's `frameGeometry`, or that the topmost window at `(x, y)` is that window. A real button event goes to the surface under the cursor, not to the focused window. The coordinates come from `osClientPointer`'s calibration, which uses cached `pointerOrigins` and, for `calibrateAt`, a different point. Any of the following then receives the click while the shell is still active and the gate passes:
- a notification popup or OSD;
- a stock PowerBrowser window (see CR-01);
- an always-on-top window;
- a desktop panel over the computed point.

This is exactly the "input goes to whatever is there" hazard that 39-RESEARCH Pitfall 5 describes. The gate covers it for keys but not for the pointer.
**Fix:** In the same KWin script that reads the cursor, report the window under the cursor and require it to be the gated one:
```js
// KWin script
const pos = workspace.cursorPos;
const under = workspace.stackingOrder.slice().reverse().find(w => w.onCurrentDesktop && !w.minimized
    && pos.x >= w.frameGeometry.x && pos.x < w.frameGeometry.x + w.frameGeometry.width
    && pos.y >= w.frameGeometry.y && pos.y < w.frameGeometry.y + w.frameGeometry.height);
print("__MARKER__ " + JSON.stringify({ x: pos.x, y: pos.y, underId: under ? String(under.internalId) : null, activeId: String(workspace.activeWindow?.internalId) }));
```
Refuse the button event unless `underId === activeId`. Add a plant in which the read-back reports a different `underId`.

## Warnings

### WR-01: The gate check and the input it guards are separate steps, but the comments say "in the same step"

**File:** `scripts/lib/pb-kwin.mjs:5-8`, `:166-179`, `:127-148`
**Fix status:** fixed in f2652bc2 (captures gated again after spectacle, PNG deleted on refusal; plant after-grab-refused; comments corrected).
**Issue:** The header says "no ydotool key and no capture is sent unless KWin reports, in the same step, that the active window...". The osKeys docstring repeats that claim. In fact:
- `gate()` loads a KWin script and then polls the journal for up to 3 s.
- `ydotool key` runs afterwards as a separate process, so focus can move in between.
- `captureShell` gates once and then runs `spectacle -a`, which this host measures at about 25 s, with no check after the capture. Whatever window is active when spectacle grabs is what gets written.

`captureActive` admits this ("the gate is read before the grab"). `captureShell`, and every `capture()` helper in the live harnesses that relies on it, does not. Only `kwinShot` in `verify-prompts-live.mjs` adds a size check after the capture.
**Fix:** After each send and each capture, read the active window again. Fail the step if its identity changed, and delete the PNG. Correct the header and docstring so they say "checked immediately before" instead of "in the same step".

### WR-02: The real long-press can leave the mouse button held on the owner's desktop

**File:** `scripts/verify-nav-keys-live.mjs:749-765`; `scripts/lib/pb-kwin.mjs:261-264`
**Fix status:** fixed in 9f714896 (ungated releaseButton in realLongPress's finally when the gated up throws).
**Issue:** `realLongPress` presses with `osClientPointer({ action: 'down' })` and releases in a `finally` with another `osClientPointer({ action: 'up' })`. The release goes back through `shellActiveOnce`, `waitPointerIdle` (up to 60 s), calibration moves, and two gates. Any of these can throw: the history menu or another window takes activation, "pointer busy", "calibration failed", or "refused". The `.catch` only records a note, and no raw release is ever sent, so the left button stays logically pressed on the shared desktop. Because the calibration moves also run with the button down, the owner's desktop sees drag gestures. `osPointer`'s own `hold` action does release in a `finally`, but the separate `down` and `up` actions have no such guard.
**Fix:** Sending a release is always safe, so do not gate it. Track buttons that are held down in pb-kwin and release them without a gate:
```js
const held = new Set();
// in 'down': held.add(b);   in 'up': held.delete(b);
export function releaseAll() { for (const b of held) { ydotool(['click', `0x${(0x80 | b).toString(16)}`]); } held.clear(); }
process.once('exit', releaseAll);
```
In `realLongPress`, call `releaseAll()` in the `finally` if the gated `up` throws.

### WR-03: The Vaultwarden child has no `error` listener and no signal cleanup

**File:** `scripts/verify-extension-amo-live.mjs:527-565`
**Fix status:** fixed in 0345f32e (error listener, exit/SIGINT/SIGTERM reap, 10 min nix build timeout).
**Issue:**
- If `spawn` fails (ENOENT or EACCES on `bin/vaultwarden`, for example after a garbage-collected store path), the ChildProcess emits `error`. With no listener that is an uncaught exception, and the process dies before the `finally` in `scenarioExt10Fill` or the shell session cleanup can run.
- The harness installs no `SIGINT`/`SIGTERM` handler. If it is killed (Ctrl-C, a registry timeout, the owner stopping a run), the server keeps running with `SIGNUPS_ALLOWED=true` on `127.0.0.1`, and the `pb-vaultwarden-*` data folder (holding the registered account and vault) stays in `/tmp`. "Stops on every exit path" is true only for exit paths inside the process.
- `nix build` runs with no timeout.
**Fix:**
```js
const vault = { proc, data, origin, exited: new Promise(r => proc.once('exit', r)), spawnError: null };
proc.once('error', e => { vault.spawnError = e; });
const reap = () => { try { proc.kill('SIGKILL'); } catch {} rmSync(data, { recursive: true, force: true }); };
process.once('exit', reap); process.once('SIGINT', () => { reap(); process.exit(130); }); process.once('SIGTERM', () => { reap(); process.exit(143); });
// in the alive poll: if (vault.spawnError) throw new Error(`BROKEN INSTRUMENT: vaultwarden did not start: ${vault.spawnError.code}`);
```
Remove the handlers in `stopVaultwarden`, and give `execFileSync('nix', ...)` a `timeout`.

### WR-04: A failed `openPageMenu` leaves `state.pending` set, so C11's guard refuses page focus for up to 60 s

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:8613-8616`, `:8624-8629`, `:4276-4282`
**Fix status:** fixed in 0d36abaf (catch clears state.pending; catalogue remapped +4 from line 8615); the page-context-menu.ts dismiss and reload paths are not changed.
**Issue:**
- `openPageMenu` sets `state.pending` synchronously and then awaits `pageMenuFacts` and `pageMenuFormatLabels`.
- If either rejects, the caller's `.catch` logs and calls `pageMenuClose(data)` but never clears `state.pending`.
- With the new C11 guard, `webTabFocus` then returns `menu-pending` until `PAGE_MENU_TTL_MS` (60 s) runs out.
- During that time, keyboard entry into the page (UI-SPEC A14) does nothing. No caller reads the reply, so nothing is reported (39-02-SUMMARY: "No caller reads the reply (it is a `send`)").

Other paths that leave `pending` set the same way:
- the frontend's early return in `page-context-menu.ts` `open()` when the detail is malformed (no dismiss is sent);
- a frontend reload while a menu is open.
**Fix:**
```js
openPageMenu(window, theiaBrowser, state, data).catch(err => {
  PowerBrowserAPI.log("error", `[web-tab] pageContextMenu failed: ${err && err.message ? err.message : err}`);
  if (state.pending?.data === data) {
    state.pending = null;
  }
  pageMenuClose(data);
});
```
In `page-context-menu.ts` `open()`, also send the dismiss (`this.send(tabId, menuId, null)`) when `menuId` is a number but another field is malformed. Clear `pending` when the frontend re-subscribes after a reload.

### WR-05: The `extensions-late-startup` catalogue row is now wrong about its observers and capability

**File:** `powerbrowser/INTERNAL-APIS.md:401`; `patches/050-extension-tab-host.patch` (EnterprisePoliciesParent hunks, guards G15/G16)
**Fix status:** fixed in d9108dc1 (row names both observers and the policy-callback capability).
**Issue:** The `extensionLateStartup` row's safety column says "ExtensionParent is the topic's only non-test observer upstream ... grants no capability." Patch 050 now registers `EnterprisePoliciesManager` for this topic and maps it to `_runPoliciesCallbacks("onAllWindowsRestored")`. So the shell's `notifyObservers(win, "extensions-late-startup")` now also applies every enterprise policy's `onAllWindowsRestored` callback, with no stock window. That is a capability, and its rationale (999.16, and draining with `shift` so callbacks do not run twice) belongs in the catalogue. CLAUDE.md requires every touchpoint to be catalogued, and a safety column that is now false makes the catalogue wrong rather than merely incomplete.
**Fix:** Rewrite the row's last two cells. Name both observers in the patched tree (ExtensionParent's `browserStartupPromise` and `browserPaintedPromise`, and EnterprisePoliciesManager's `onAllWindowsRestored`). State that the policy callbacks run once, at the first of `extensions-late-startup` or `sessionstore-windows-restored`, and cite plan 39-04.

### WR-06: `--gate` exclusions cover whole labels for single-scenario reds in the suites this phase extended

**File:** `scripts/verify-platform.sh:6499-6539`, `:6585-6606`
**Fix status:** accepted, not redesigned: each exclusion is bound to an open ledger id and goes red (FAIL, exclusion no longer applies) once that entry closes; scenario-scoped exclusions recorded as backlog 999.33 (6ba9a12b).
**Issue:** Exclusions match on the label only (`[ "$label" = "$excl_label" ]`). The new rows excuse these labels in full:
- `extension-actions-live` and `extension-actions-live-self-test` (ledger 29, one leg of `private-access`);
- `page-tools-live` (28, `crash-navigate` flake);
- `site-identity-live` and its self-test (40, app-menu);
- `prompts-live-self-test` (39, one plant);
- `page-furniture-live-self-test` (43, one clean-control read);
- `address-bar-live-self-test` (25, one plant).

These are the suites Phase 39 grew by hundreds of lines. While those ledger entries stay open, a new regression in *any other* scenario of these labels is printed as `EXCLUDED (known-open)` and `--gate` passes.
**Fix:** Key each exclusion on the label plus the failing scenario or plant name. Store `label|ledger|scenario|reason` and match the scenario against the check's own `FAIL -- <scenario>` lines in the run log. Alternatively, register the known-red scenario as its own row (for example `extension-actions-live-private-access`) and exclude only that row.

### WR-07: The private-access plant passes on any failure, and harness errors are reported as product failures

**File:** `scripts/verify-extension-actions-live.mjs:1052-1055`, `:1134`
**Fix status:** fixed in 225494ab (catch applies only before the IDE loads; plant expects the assertion text).
**Issue:** The `.catch` on session 1 turns every error that is not `BROKEN INSTRUMENT` into `private access rule not applied: with browser.privatebrowsing.autostart the shell's IDE never loaded ...`. That includes `timed out waiting for the url answer` from `command()`, BiDi failures, and `JSON.parse` errors. Plant `shell-not-private` expects only the prefix `private access rule not applied`, which every failing verdict in this scenario starts with, including the catch-all. So the plant goes red for any reason, among them a harness timeout, and does not prove the denied-extension assertion. This is the plant-specificity problem 999.11 fixed in `verify-new-window-adopt-live.mjs`.
**Fix:** Limit the catch to the IDE-load step (the `privateSession` launch and its first `openTab`) and rethrow everything else. Point the plant's `expect` at the text it should actually produce, for example `the denied extension shows a button`.

### WR-08: Leg 1 of options-page-switch can pass without testing the "window still starting" state

**File:** `scripts/verify-ext-tab-host-live.mjs:1883-1898`
**Fix status:** fixed in 29715e3c (leg 1 retried up to 3 times for the starting state, else reported SKIPPED).
**Issue:** `wasStarting` is measured and printed but never required. If the stock window has finished delayed startup before the second `openOptions` call, leg 1 checks only the started-window route. That route is the one leg 2 tests, so the `startingFail` check passes without testing what it names: the WR-06 state where the window exists and has not finished starting.
**Fix:** When `wasStarting !== true`, return a `NOT SCORED`/`BROKEN INSTRUMENT` verdict, or make the state deterministic, for example by holding `gBrowserInit` delayed startup in the plant-free instrument, as `activate-after-ack` holds the ack.

### WR-09: The site-identity catalogue plant is pinned to a boundary line number

**File:** `scripts/verify-site-identity.mjs:1353-1357`
**Fix status:** fixed in d09fb233 (anchor derived from the first webTabClearSiteData row with a line of its own).
**Issue:** The plant's `from` and `treePlant` are the literal `PowerBrowserAPI.sys.mjs:759`. That is the `quitApplication` row, which has nothing to do with site identity, and its line number shifts with every boundary edit above it. It moved from 753 to 759 this phase because of the cookie-jar hunk. The self-test fails loudly when the anchor drifts, so this cannot give a false green. It is still a hand-kept expectation that needs a manual edit for unrelated boundary changes, which goes against the CLAUDE.md rule "derive from the tree and compare". The same line-count pressure produced the compressed one-line `if` blocks in `webTabFocus` (see IN-02).
**Fix:** Derive the anchor when the check runs. Read INTERNAL-APIS.md, find a named row (for example the first row whose Function cell is `` `webTabIdentity` ``), and take its File:Line cell as `from`/`treePlant`.

## Info

### IN-01: The switchToTabHavingURI wrapper intercepts every caller in that stock window

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:10741-10754`
**Issue:** After one reuse request, every `switchToTabHavingURI` call in that stock window goes through the wrapper, not just calls from `openOptionsPage`. Callers include preferences, about:addons, and the window's own commands. On an exact `userTypedValue` match, the wrapper returns `true` without the stock function's `aOpenParams` handling (`ignoreFragment`, `replaceQueryString`, `adoptIntoActiveWindow`) and without focusing the window. Today that is harmless, but it is wider than the `options_ui` case it was written for.
**Fix:** Short-circuit only for `moz-extension:` URIs, and focus `win` as the stock function does.

### IN-02: webTabFocus is formatted to keep the line count unchanged

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:4276-4282`
**Issue:** `if (!entry) { return "unknown-tab"; }` and the guard line were compressed onto single lines so that INTERNAL-APIS line references would not move (39-02-SUMMARY). The catalogue was renumbered later anyway, with 707 lines changed. This is code formatting adapted to suit line-pinned documents.
**Fix:** Restore the house formatting. Renumber with the existing `--fix` tool.

### IN-03: The drag-service probe swallows every error

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:8274-8276`
**Issue:** `catch {}` treats every failure as "not dragging", not only the headless case where `getService` is missing. This is acceptable for a tooltip, but a narrower check states the intent better.
**Fix:** `const svc = Cc["@mozilla.org/widget/dragservice;1"]; dragging = !!svc && !!svc.getService(Ci.nsIDragService).getCurrentSession();` (keep the try only if `getService` itself throws).

### IN-04: `window.gReduceMotion = true` turns motion off for every reader in the shell

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:7657`
**Issue:** Stock `browser.js` defines `gReduceMotion` as a getter on `prefers-reduced-motion`. The shell now reports reduce-motion to every reader, not only `PermissionUI.postPrompt`.
**Fix:** If the only goal is to skip the missing anchor icon's animation, document that every reader is affected, or define a getter that returns `true` and note why.

### IN-05: The strip comment describes window-drag space that browsing mode does not have

**File:** `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx:2246-2248`
**Issue:** "only space beside it moves the window". In browsing mode `.pb-tab-strip` is `flex: 0 0 100%`, so nothing is beside it, and the strip row now has no window-drag area at all. Only the URL row moves the window.
**Fix:** Say so in the comment ("browsing mode moves the window only by the URL row").

### IN-06: The real-input-gate registry comment does not match the self-test, and the full run drives the owner's devices

**File:** `scripts/verify-platform.sh:6194-6199`
**Issue:**
- The comment says the plants "must each refuse both osKeys and captureShell". The self-test also checks `osPointer` and `captureActive`.
- A full `verify-platform.sh` run now moves the real pointer and sends a real Shift press on the owner's desktop.
- On any host without KWin, ydotoold, or journald user logs, the row is red, with no exclusion and no skip classification.
**Fix:** Correct the comment. Consider an explicit environment precondition that prints `SKIP` with a reason instead of failing on hosts other than the owner's KDE session.

### IN-07: The Vaultwarden build is not pinned

**File:** `scripts/verify-extension-amo-live.mjs:528`
**Issue:** `nixpkgs#vaultwarden` resolves through the user's flake registry. The server version changes with that registry, and the first run needs the network. Together with the live AMO Bitwarden build, the `ext10-fill` result is not reproducible across days.
**Fix:** Resolve against the flake's own pinned nixpkgs (`.#` input or `--inputs-from .`) and print the resolved version in the verdict.

### IN-08: Headed Copy Image checks overwrite the owner's desktop clipboard

**File:** `scripts/verify-page-furniture-live.mjs:1807-1826`
**Issue:** In a headed run, `copyString('pb-sentinel')` and Copy Image write to the real Wayland clipboard and never restore it.
**Fix:** Save `wl-paste` output before the leg and restore it with `wl-copy` afterwards, or note this in the PB_LIVE_HEADED documentation.

---

_Reviewed: 2026-11-07T16:57:06Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
