---
phase: 36-new-window-links-as-web-tabs
verified: 2026-11-01T00:00:00Z
status: human_needed
score: 10/19 must-haves verified (0 by override)
covered_files: [".planning/phases/36-new-window-links-as-web-tabs/36-01-PLAN.md", ".planning/phases/36-new-window-links-as-web-tabs/36-01-SUMMARY.md", ".planning/phases/36-new-window-links-as-web-tabs/36-02-PLAN.md", ".planning/phases/36-new-window-links-as-web-tabs/36-02-SUMMARY.md", ".planning/phases/36-new-window-links-as-web-tabs/36-03-PLAN.md", ".planning/phases/36-new-window-links-as-web-tabs/36-03-SUMMARY.md", "powerbrowser/INTERNAL-APIS.md", "powerbrowser/shell/PowerBrowserAPI.sys.mjs", "powerbrowser/shell/powerbrowser.js", "scripts/verify-new-window-adopt-live.mjs", "scripts/verify-new-window-adopt.mjs", "scripts/verify-platform.sh", "scripts/verify-shell-gbrowser-standin.mjs", "scripts/verify-web-tab-bridge.mjs", "theia/extensions/tab-uris/src/browser/browser-window-command.ts", "theia/extensions/tab-uris/src/browser/web-tab.ts"]
covered_digest: "v3:sha256:92c252a0870e5b43c341db8a86b0459b6470837c6821413bb20d155a9432a0c5"
behavior_unverified: 9
overrides_applied: 0
behavior_unverified_items:
  - truth: "SC1: a target=_blank link or a page window.open opens a web tab directly after the opener"
    test: "In a built shell with two web tabs, click a target=_blank link and press a window.open button on the first tab"
    expected: "Each opens a web tab directly after the opener in the Theia tab bar, the shell-window count stays 1, and no stock window opens. The adopted tab looks like a normal web tab (36-UI-SPEC VB-01)"
    why_human: "Everything here is wired and gated statically, but whether Gecko accepts the returned pending element (remote frameloader, no double load) is a runtime fact. No live run has happened (adopt-order)"
  - truth: "SC1: closing the adopted tab reselects the opener"
    test: "Close the adopted tab from the tab bar"
    expected: "The opener tab becomes current"
    why_human: "No new reselect code exists. It relies on Theia's ApplicationShell tab-after previous-title behaviour, which only a live run exercises (adopt-order reselect leg)"
  - truth: "SC2: the opened tab has a working window.opener, so a sign-in popup flow returns to the opener"
    test: "From the opener's window.open button, postMessage between the adopted page and the opener in both directions"
    expected: "The round trip completes in both page contexts"
    why_human: "Depends on openWindowInfo being kept on the pending overlay (tabbrowser.js:2801 idiom) and on Gecko linking the two browsing contexts. Static gate asserts the attribute, not the link (adopt-opener)"
  - truth: "SC3a: a window.open with popup features still opens a popup window"
    test: "Press a window.open(url, '', 'width=300,height=300') button on a web tab"
    expected: "A stock popup window holds the URL; no web tab is adopted and no push arrives"
    why_human: "Reading ContentParent.cpp:5444-5522 shows OPEN_NEWWINDOW never reaches CreateContentWindowInFrame, but the preference-driven location choice is only provable live (adopt-popup)"
  - truth: "SC3b: the IDE's open-browser-window command still opens the stock browser window (GUI-01)"
    test: "Run 'Open Browser Window' from the palette, with and without a URL, then close the stock window"
    expected: "A stock browser window or tab opens through openStockTab and closing it leaves the application running. A bare window.open from the Theia frame also still opens one (gui01-browser-close-does-not-quit)"
    why_human: "Static: the command sends only openStockTab, and a Theia-frame opener gets null from the receiver. No run has confirmed either route in the built shell. See the GUI-01 note in Behavioral Spot-Checks about which row covers which route"
  - truth: "Background adopt leaves the opener focused; foreground adopt activates the new tab"
    test: "Open a link in the background (openLinkIn inBackground) and in the foreground"
    expected: "Background keeps the opener current and focused; foreground shows the new tab"
    why_human: "State transition on activation; the guard is `if (!background) activateWidget`, but the focus outcome needs a live run (adopt-focus)"
  - truth: "With no frontend ack in 5 s the page opens in the stock window and nothing is swallowed"
    test: "Drop the adopt ack and wait past ADOPT_ACK_TIMEOUT_MS"
    expected: "A stock window holds the URL; the pending overlay and its prompt records are gone; no tab was left behind"
    why_human: "Timer-driven cleanup path (adopt-fallback). Also see the late-ack-after-timeout item"
  - truth: "An ack for a key chrome no longer holds replies unknown-tab and the orphan widget is dropped"
    test: "Send webTabAdopt with an unknown pc key"
    expected: "Reply unknown-tab, a dropAdoptedTab push, and the widget disposed"
    why_human: "Cleanup invariant across the actor boundary (adopt-unknown-key)"
  - truth: "The 36-REVIEW fixes behave as written: window.close() closes the tab (WR-03), a blank window.open shows about:blank with the opener's host in the identity box (WR-04), a late ack after timeout keeps the tab (WR-02), the stock-window command works after a failed startup probe (WR-07)"
    test: "See the four dedicated items in 36-UAT.md"
    expected: "As each item states"
    why_human: "36-REVIEW marks WR-02 and WR-04 'needs human check'; WR-03 and WR-07 have no live scenario in verify-new-window-adopt-live.mjs"
human_verification:
  - test: "Run the seven live adopt scenarios and the self-test (adopt-order, adopt-opener, adopt-popup, adopt-focus, adopt-fallback, adopt-scheme, adopt-unknown-key)"
    expected: "Seven PASS lines plus the purgecaches line; the self-test names all eight plants red"
    why_human: "Owner rule: browser-dependent criteria wait for the end-of-milestone live pass. Nothing has run, and the script has not been touched since d9861749, before the 36-REVIEW fixes and Phase 37's tab-host change"
  - test: "Run the GUI-01 live rows and a palette invocation of the stock-window command"
    expected: "gui01-single-shell-window, gui01-browser-close-does-not-quit and gui01-command-registered stay green; the palette command opens a stock window"
    why_human: "Live. Note that gui01-browser-close-does-not-quit drives a bare window.open, not the command (doc drift)"
  - test: "Read window.browserDOMWindow back in chrome and compare it to the object the boundary assigned"
    expected: "The same object, so the live recorder can wrap its members in place"
    why_human: "Biggest unproven assumption (A-06 (a)). If it fails, the recorder throws 'the receiver recorder could not be installed' and every scenario goes red for the harness, not for the product"
  - test: "CLAUDE.md hard rule 5 wording"
    expected: "Owner accepts or rewrites the proposed replacement in 36-02-SUMMARY Deferred item 1"
    why_human: "Owner decision. The sentence 'The shell window carries no nsIBrowserDOMWindow' is false since 36-01 installed the receiver; the rule also names window.open as the command's route"
---

# Phase 36: New-Window Links as Web Tabs Verification Report

**Phase Goal:** Links and scripts that open a new window open a web tab next to the opener, and the stock browser window stays reachable (GUI-01)
**Verified:** 2026-11-01 (HEAD `9e054572`)
**Status:** human_needed
**Re-verification:** No. Initial verification, against the tree as it is after Phase 37's fixes

## Goal Achievement

Every static claim holds in the tree, and every gate and self-test I ran is green. The phase has no live evidence at all, and that cannot be waived for three of its criteria: it is the one v1.5 phase that can break GUI-01, and its two headline behaviours (adopted tab placement, a working `window.opener`) depend on runtime acceptance of the returned pending element. No gap was found, so the status is `human_needed`, not `gaps_found`.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1a | ROADMAP SC1: `target=_blank` and `window.open` open a web tab next to the opener | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `installNewWindowReceivers` (PowerBrowserAPI.sys.mjs:4046) assigns `win.browserDOMWindow` with the full six-member IDL set; `createContentWindowInFrame`/`openURIInFrame` call `adoptContentWindow` (:7065), which builds a pending overlay via `webTabOpen` and pushes `adoptTab`. Frontend `adopt()` (web-tab.ts:1573) adds the widget with `mode: 'tab-after'` on the opener. Gate green; `adopt-order` has not run |
| 1b | ROADMAP SC1: closing that tab reselects the opener | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | No code of its own by design (Theia ApplicationShell, application-shell.js:1071-1085). `adopt-order` has a reselect leg and a `reselect-opener-off` plant. Not run |
| 2 | ROADMAP SC2: the opened tab has a working `window.opener` | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `createPendingOverlay` passes `params.openWindowInfo` through `webTabOpen`'s options; the InFrame path issues no load (gate rule, plants). The postMessage round trip is `adopt-opener`; not run |
| 3a | ROADMAP SC3: `window.open` with popup features still opens a popup window | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Read in `upstream/dom/ipc/ContentParent.cpp:5444-5522`: only `OPEN_NEWTAB*`/`OPEN_PRINT_BROWSER` reach `CreateContentWindowInFrame`; `OPEN_NEWWINDOW` goes straight to `OpenWindowWithRemoteTab`. `createContentWindow`/`openURI` return null. `adopt-popup` not run |
| 3b | ROADMAP SC3: the IDE's open-browser-window command still opens the stock window (GUI-01) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Command (browser-window-command.ts) sends only `openStockTab` (sole allow-listed sender, bridge gate rule 6 plus 4 plants). `openStockTab` (PowerBrowserAPI.sys.mjs:1154) does `getMostRecentWindow("navigator:browser")`; the shell is `powerbrowser:main` (powerbrowser.xhtml:21), so it never picks itself. A Theia-frame opener is not in `webTabs`, so `adoptContentWindow` returns null and Gecko opens its own window. Live rows not run |
| 4 | Theia-frame openers, unknown openers and `OPEN_PRINT_BROWSER` get null before any element exists | ✓ VERIFIED | `tabIdOfBrowser(opener) === null \|\| aWhere === OPEN_PRINT_BROWSER` (:7068-7070); `tabIdOfBrowser` walks `webTabs` only (:5215). `verify-new-window-adopt.mjs` PASS, `--self-test` 22 plants red |
| 5 | A `javascript:` (or any non-http(s)) URL is refused before any element exists | ✓ VERIFIED | `createPendingOverlay` returns `"refused-scheme"` first (:7080-7082); `adoptContentWindow` maps it to null (Gecko's own window). `adoptLinkIn` logs by kind |
| 6 | InFrame path never loads; `openLinkIn` loads with the caller's principal (null principal substituted for system) | ✓ VERIFIED | `adoptContentWindow` has no load call; `adoptLinkIn` calls `loadURI` with the substituted principal (:7054-7059). Gate "split load rule" with plants |
| 7 | The adopt ack names the tab id Chrome admits (CR-01) | ✓ VERIFIED | web-tab.ts:1586 and the failure branch send `widget.tabId`, not `widget.id`. Gate rule (g) derives both ends; two planted `widget.id` sends go red. The live harness uses `w.tabId` too |
| 8 | `webTabAdopt`, `dropAdoptedTab`, `closeAdoptedTab` are classified and in push/subscription parity | ✓ VERIFIED | `verify-web-tab-bridge.mjs` PASS (35 kinds), `--self-test` 62 plants red |
| 9 | The receiver implements exactly the pinned `nsIBrowserDOMWindow` member set | ✓ VERIFIED | `verify-new-window-adopt.mjs` and `verify-shell-gbrowser-standin.mjs` PASS (the IDL shim entry for `browserDOMWindow`, added after the Phase 35 merge) |
| 10 | The stock-window command routes only through `openStockTab`; no `window.open`; one allow-listed sender; dead channel re-probes then throws copy that names PowerBrowser with an on-screen next step | ✓ VERIFIED | Source read (browser-window-command.ts openBrowserWindow); bridge gate rule 6 and its plants. Command id and cause go to the console only (WR-07) |
| 11 | No page URL, title or `pc-*` key reaches a log line, a title or the store | ✓ VERIFIED | `pc-<n>` enters only `pendingContent`; the ack attaches via `webTabAttach(..., key = null)`. Adopt log lines carry the kind only (gate rule f, 5 plants). Quoted: `adopt dropped: adoptTab` |
| 12 | Adopted tabs are tab-host nodes (post-37 CR-01), with the opener as `openerTab` | ✓ VERIFIED | `adoptPendingOverlay` calls `tabHostAddTab(win, tabId, pending.browser, pending.opener)` (:7144). `verify-ext-tab-host-scope.mjs` PASS: exactly two call sites, the adopt one passes the `pendingContent` record's browser. `--self-test` 26 plants red |
| 13 | Single definition site and catalogue for the new internals | ✓ VERIFIED | `check-internals-boundary.sh` PASS; `--catalogue` PASS for PowerBrowserAPI.sys.mjs and GroupActorChild.sys.mjs. `powerbrowser.js:169` carries only `installNewWindowReceivers(window)` |
| 14 | The live check exists, parses, and is registered in the non-quick block with a self-test row | ✓ VERIFIED | `node --check` clean; `verify-platform.sh:5010-5011`; static half `new-window-adopt` rows at :3843-3844 in `--quick`. Registration only: no live run |
| 15 | Background adopt keeps the opener focused; foreground activates the new tab | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `if (!background) await this.shell.activateWidget(widget.id)` (web-tab.ts:1608); chrome computes `background` with the `tabshifted` inversion. `adopt-focus` not run |
| 16 | A missing ack in 5 s falls back to the stock window and swallows nothing | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `createPendingOverlay` arms `sleep(ADOPT_ACK_TIMEOUT_MS).then(adoptFallback)`; `adoptFallback` removes the overlay, prompt records and bars, then `openStockTab`. `adopt-fallback` not run |
| 17 | An unknown pending key replies `unknown-tab` and the orphan widget is dropped | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `adoptPendingOverlay` pushes `dropAdoptedTab` and replies `unknown-tab` (:7137-7139); frontend `dropAdopted` disposes. `adopt-unknown-key` not run |
| 18 | The 36-REVIEW fixes work: WR-01 attach-failure release, WR-02 late-ack query, WR-03 `window.close()`, WR-04 blank about:blank shown with the opener's host, WR-07 re-probe | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | All present and gated (`DOMWindowClose` listener :7149, `closeAdopted`, `markAdopted`/`hasPage`, `webTabIdentityURI`, re-probe in `openBrowserWindow`). 36-REVIEW says WR-02 and WR-04 need a human check; WR-01, WR-03 and WR-07 have no live leg |
| 19 | GUI-04 not welded: no `@powerbrowser/*` or Theia core edit, no Gecko edit outside the patch stack | ✓ VERIFIED | `git -C upstream diff --quiet` exit 0; no new patch; the receiver and all internals sit in `PowerBrowserAPI.sys.mjs` behind the boundary (`check-internals-boundary.sh` PASS) |

**Score:** 10/19 truths verified (9 present and wired, behavior-unverified; 0 failed; 0 by override)

### Deferred Items

None. Everything open is live evidence the owner scheduled for the end-of-milestone pass, not a gap that a later phase owns.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `powerbrowser/shell/PowerBrowserAPI.sys.mjs` | `installNewWindowReceivers`, adopt section, `webTabAdopt` arm, `DOMWindowClose` listener | ✓ VERIFIED | :4046, :6985-7155, :5179; substantive, no stubs |
| `powerbrowser/shell/powerbrowser.js` | one installer call | ✓ VERIFIED | :169; no `browserDOMWindow`/`openLinkIn` spelling |
| `theia/extensions/tab-uris/src/browser/web-tab.ts` | `WebTabOpenHandler.adopt`, `dropAdopted`, `closeAdopted`, `markAdopted` | ✓ VERIFIED | :1559-1625, :761; `tsc --noEmit -p theia/extensions/tab-uris` clean |
| `theia/extensions/tab-uris/src/browser/browser-window-command.ts` | `openStockTab`-only command | ✓ VERIFIED | no `window.open(` |
| `scripts/verify-new-window-adopt.mjs` | static gate with `--self-test` | ✓ VERIFIED | PASS; 22 plants red |
| `scripts/verify-new-window-adopt-live.mjs` | seven scenarios, eight plants | ✓ VERIFIED (exists, parses, registered; never run) | Unchanged since `d9861749`, so it predates the 36-REVIEW fixes |
| `scripts/verify-shell-gbrowser-standin.mjs` | `browserDOMWindow` IDL shim entry | ✓ VERIFIED | PASS |
| `scripts/verify-web-tab-bridge.mjs` | re-pointed rule 6, dead-channel rule | ✓ VERIFIED | PASS; 62 plants |
| `scripts/verify-platform.sh` | four registry rows | ✓ VERIFIED | :3843-3844, :5010-5011 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `powerbrowser.js` | `PowerBrowserAPI.installNewWindowReceivers` | one call | ✓ WIRED | :169 |
| chrome `adoptTab` push | frontend `adopt()` | `onPush('adoptTab')` | ✓ WIRED | push-parity gate green |
| frontend `webTabAdopt` ack | chrome `adoptPendingOverlay` | `WebTabChannel.request`, `tabId: widget.tabId` | ✓ WIRED | gate rule (g) |
| `adoptPendingOverlay` | tab host | `tabHostAddTab(..., pending.opener)` | ✓ WIRED | scope gate |
| overlay `DOMWindowClose` | frontend `closeAdopted` | `closeAdoptedTab` push | ✓ WIRED | parity gate |
| command | `openStockTab` arm | `OPEN_STOCK_TAB_KIND` actor kind | ✓ WIRED | bridge gate |
| blocked-popup Allow (Phase 37) | receivers | `popupAndRedirectBlocker.unblockPopup` replays the page's own `window.open` (:7655-7660) | ✓ WIRED | `openAdoptedWebTab` no longer exists; see doc drift |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| adopted tab URL/title | `pending.url`, live `currentURI` | Gecko's own load into the returned element | Yes by construction; unproven live | ⚠️ unverified live |
| identity box on a blank adopted tab | `webTabIdentityURI` | `documentPrincipal` of the overlay | Unproven at push time (36-REVIEW WR-04) | ⚠️ unverified live |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Adopt static gate | `node scripts/verify-new-window-adopt.mjs` and `--self-test` | exit 0; 22 planted faults red | ✓ PASS |
| Bridge gate | `node scripts/verify-web-tab-bridge.mjs` and `--self-test` | exit 0; 35 kinds, 62 plants red | ✓ PASS |
| Tab-host scope | `node scripts/verify-ext-tab-host-scope.mjs` and `--self-test` | exit 0; 26 plants red | ✓ PASS |
| IDL shim | `node scripts/verify-shell-gbrowser-standin.mjs` | exit 0 | ✓ PASS |
| Boundary and catalogue | `bash scripts/check-internals-boundary.sh` and `--catalogue` | exit 0 | ✓ PASS |
| Error contract, print/save | `verify-shell-error-contract.mjs`, `verify-page-tools-print-save.mjs` | exit 0 | ✓ PASS |
| Typecheck | `tsc --noEmit -p theia/extensions/tab-uris` | no output | ✓ PASS |
| Brand residue, upstream untouched | `scan-brand-residue.mjs`, `git -C upstream diff --quiet` | exit 0 | ✓ PASS |
| Live adopt scenarios | not run | n/a | ? SKIP (owner rule: end-of-milestone live pass) |
| GUI-01 live rows | not run (`verify-gui01-window.mjs` launches the browser) | n/a | ? SKIP |

GUI-01 coverage note: `verify-gui01-window.mjs` has not changed since `40749306` (plan 01-05). It drives a bare `window.open` from the Theia frame, so it now covers only the receiver's null fall-through, not the command's `openStockTab` route. The route through the palette command is exercised by `verify-ext-tab-host-live.mjs` (:928, :969) and `verify-address-bar-live.mjs`, which are also unrun. 36-03 SUMMARY's claim that step 4 covers "a palette invocation opening the stock window" is not accurate.

### Probe Execution

No `scripts/*/tests/probe-*.sh` probes are declared by this phase.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| PROMPT-05 | 36-01, 36-02, 36-03 | `target=_blank` and `window.open` give a new web tab next to the opener; stock window stays reachable (GUI-01) | ? NEEDS HUMAN | Statically complete (truths 4-14, 19); live-unproven (truths 1a-3b). REQUIREMENTS.md row still reads Pending, which is correct until the live pass |

The plans' frontmatter lists `requirements-completed: []`, consistent with this. No orphaned requirements: GUI-01 and GUI-04 are Phase 1 requirements preserved here, not claimed by a Phase 36 plan.

### Prohibitions

| Plan | Prohibition | Tier | Disposition |
|------|-------------|------|-------------|
| 36-01 | No navigation on the InFrame path | judgment | Gate "split load rule" plants. Verified by test |
| 36-01 | `openLinkIn` loads with the params principal | judgment | Source read; gate. Verified by test |
| 36-01 | `browserDOMWindow`/`openLinkIn` defined only in `PowerBrowserAPI.sys.mjs` | judgment | Boundary guard plants. Verified by test |
| 36-01 | No page URL, title or `pc-*` key in the shell log | judgment | Gate rule (f) plants. Verified by test. Not covered: later Phase 37 log lines near the adopt section, which this gate does not scope |
| 36-02 | No `dispatchEvent` return value as a chrome-took-it signal | judgment | The ack is `channel.request` only; the command's `requestStockTab` still reads the dispatch boolean for its own cancel shape, and that is the existing contract. Non-authoritative pass, flagged |
| 36-02 | No pc-/wt-/kind/port/timeout/raw error in user-visible text | judgment | Source read: the dead-channel copy was reworked (WR-07) and moves the id and cause to the console. Non-authoritative pass, flagged for the look-and-copy human check |
| 36-02 | No second `openStockTab`/`window.open` sender in chrome-bar | judgment | Bridge rule 6 plants. Verified by test |
| 36-03 | No assertion on the absence of a log line | judgment | The live script reads the BiDi tree, the push recorder and the shell-window count. Non-authoritative pass: it has not run, so no instrument has been shown to see its own event |
| 36-03 | No system principal or `browser.src` on an adopted load | judgment | `adoptLinkIn` substitutes a null principal; InFrame loads nothing. Verified by test |
| 36-03 | Every absence assertion pairs with a positive control | judgment | The script gates absence legs on `adopt-order` passing in the same session. Non-authoritative pass, flagged |
| 36-01 | Live backstop deferred to 36-03 | backstop | `insufficient_spec`. Human item, per the owner rule |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| scripts/verify-gui01-window.mjs | header, `--help` | Still describes the command's route as "the ratified window.open channel" | ℹ️ Info | Comment drift; its assertions remain valid for the fall-through |
| scripts/verify-new-window-adopt-live.mjs | whole file | Not updated after 36-REVIEW (WR-01..07) or Phase 37 (tab-host membership); no scenario for `window.close()`, blank `window.open`, late ack, or the stock command after a failed probe | ⚠️ Warning | Four REVIEW fixes have no live leg; added to 36-UAT.md |
| powerbrowser/shell/PowerBrowserAPI.sys.mjs | 7065-7077, 7027 | IN-01..IN-04 left open by review: fallback reloads (one-time URLs run twice, wrong private/normal window possible), malformed http(s) URL leaves a blank adopted tab, `openURIInFrame` does not load, `referrerInfo`/`policyContainer`/`forceForeground` ignored | ℹ️ Info | Out of review fix scope; none blocks the criteria |

No unreferenced `TBD`, `FIXME` or `XXX` markers in the lines the phase added.

### Doc Drift (stale statements, not gaps)

1. **36-01-SUMMARY, `provides`, `affects` and the scope deviation** say adopted overlays do not enter the tab host and that `PowerBrowserAPI.openAdoptedWebTab(...)` is the public API Phase 37 calls. Both are stale: `tabHostAddTab(..., pending.opener)` runs in `adoptPendingOverlay` (37-REVIEW CR-01), and `openAdoptedWebTab` is gone, replaced by `unblockPopup` replay. Deferred item 4 (tab-host adoption) is closed. 36-02-SUMMARY already records the first; 36-01-SUMMARY does not.
2. **36-REVIEW WR-05 outcome and WR-06 outcome** still say tab-host adoption is a follow-up and that `openAdoptedWebTab`'s JSDoc tells its caller what to do. Superseded the same way.
3. **36-03-SUMMARY, Deferred live verification step 4 and the "GUI-01 rows" bullet** claim the GUI-01 rows cover the palette command's `openStockTab` route. They do not (see the coverage note above).
4. **36-03-SUMMARY, "not covered by this script" list** still carries three items as open that the review fixed in code: the attach failure after a successful ack (WR-01), the late-ack edge (WR-02), and adopted overlays entering the tab host (Phase 37). The code exists; the live legs still do not.
5. **36-02-SUMMARY, Task 1 text** ("any reply that is not ok, including a timeout, sends `webTabClose`... covers the late-ack edge") and Deferred item 4 describe the pre-fix `adopt()`. WR-01 and WR-02 changed both. Gate figures are also stale: the adopt gate now has 22 plants (SUMMARY: 16), and the bridge gate 62 (SUMMARY: 36).
6. **36-01-SUMMARY Deferred item 1 and the IDL_SHIMS "skipped" statement** are closed by the "Merge into main" section in 36-02-SUMMARY.
7. **CLAUDE.md rule 5** (owner item, not a gap): "The shell window carries no `nsIBrowserDOMWindow`" is false, and "It opens via `window.open(url, '_blank')` from the Theia frontend" is no longer the command's route. The proposed wording in 36-02-SUMMARY Deferred item 1 matches the code I read (`openStockTab` route; Theia opener gets null). One word to check when applying it: it says "`PowerBrowserAPI.openStockTab`", which is correct, and no claim in it is contradicted by the tree.

### Human Verification Required

1. **Seven live adopt scenarios and the self-test.** In a built tree, run `verify-new-window-adopt-live.mjs`. Expect seven PASS lines and all eight plants red.
2. **GUI-01 rows and the palette command.** The three `gui01-*` rows plus a palette run of "Open Browser Window".
3. **The biggest unproven assumption.** Reading `window.browserDOMWindow` back in chrome returns the shell's object (A-06 (a)). The live recorder depends on it.
4. **Four 36-REVIEW live items.** `window.close()` closes the tab; a blank `window.open` shows about:blank with the opener's host in the identity box; a late ack after the timeout keeps the tab; the stock-window command works after a failed startup probe.
5. **VB-01 visual parity** of an adopted tab (no pending flash, spinner and title parity).
6. **CLAUDE.md rule 5 wording**, an owner decision.

All six are written out in `36-UAT.md`.

### Gaps Summary

No gaps. PROMPT-05's code is complete and wired, including the review fixes and the Phase 37 changes, and every static gate passes with its planted faults going red. What is missing is evidence of behavior: nothing in this phase has been run in a built shell. The three ROADMAP criteria, plus focus, fallback, unknown-key sweep and the four review fixes, depend on runtime facts (Gecko accepting the returned pending element, the opener link, Theia's reselect-on-close, timer cleanup) that grep cannot show. The unmodified live script is also older than the code it must now exercise, so the first live run may need harness edits as well as product fixes.

---

_Verified: 2026-11-01_
_Verifier: Claude (gsd-verifier)_
