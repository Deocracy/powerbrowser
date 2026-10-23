# Phase 36: New Window Links as Web Tabs - Context

**Gathered:** 2026-10-22
**Status:** Ready for planning
**Mode:** Autonomous (`--auto` — all open choices take the recommended option with a one-line reason recorded below as `[auto]`)

<domain>
## Phase Boundary

`PROMPT-05` only: a user clicking a `target=_blank` link or a page calling `window.open` gets a new web tab next to the opener, while the stock browser window stays reachable (GUI-01). No other PROMPT requirement, no tab-strip or address-bar work, no prompt/dialog work (Phase 37).

</domain>

<decisions>
## Implementation Decisions

### Recorded rulings that apply (REQUIREMENTS.md header, PROJECT.md Key Decisions, ROADMAP Phase 36, Phase 28 sign-off)
- Firefox internals only through `powerbrowser/shell/PowerBrowserAPI.sys.mjs`; every touch catalogued in `powerbrowser/INTERNAL-APIS.md` (append-only rule, privileged-kind rule, `check-internals-boundary.sh` must stay green).
- No Theia core fork, no Gecko edit outside the patch stack (patch 050 tab host from Phase 31.1 is the only logic patch; this phase adds no new patch).
- Web tabs are chrome-owned overlays (`<xul:browser messagemanagergroup="browsers" remoteType="web">`) plus Theia placeholder widgets; frontend owns identity/geometry/strip, chrome owns docshell/navigation/store row.
- Adopted overlays enter the Phase 31.1 tab host as TabOpen with `openerTab` set; `gBrowserInit.getTabToAdopt` stays null (28-SPIKE-DECISION Phase 36 adjustment).
- Adopted overlays fire no `webTabActivated` on the adopt handshake: activation state travels exclusively through the existing `activateWidget` (foreground) / no-activation (background) path, so the 31.1 host observes exactly one TabSelect per user-visible activation.
- `openWindowInfo` is kept on the adopted overlay (`b.openWindowInfo = openWindowInfo`, the tabbrowser pattern at `upstream/browser/components/tabbrowser/content/tabbrowser.js:2801`): Gecko reads it for the opener chain, remote-type selection and `hasValidUserGestureActivation` (`tabbrowser.js:3515-3518`, `tabbrowser.js:4249-4251`), which is what makes `window.opener` work in the adopted tab.
- Adopted tabs keep a working `window.opener`: the pending overlay is created synchronously inside the `CreateContentWindowInFrame`/`OpenURIInFrame` call (`ContentParent.cpp:5490` returns the element; the frameloader parents the new browsing context under the opener's group, `tabbrowser.js:3468-3469` `crossGroupOpener`), so a sign-in popup's `postMessage`/return completes against the opener tab.
- `tabs.create` reuses the chrome-first overlay creation built here (forward-compat, not built here).

### Shim shape
- **D-01 [auto]:** One installer owns the Phase 36 receivers: `PowerBrowserAPI.installNewWindowReceivers(win)` (one delegating member appended to the frozen literal at `PowerBrowserAPI.sys.mjs:396`, per the Phase 35 lesson — the literal admits no member added from the end of the file), called once from `powerbrowser.js` right after `window.powerbrowserGetBrowser`. The installer defines the `nsIBrowserDOMWindow` shim object via `ChromeUtils.generateQI` and assigns it to `window.browserDOMWindow`, and defines the `window.openLinkIn` closure function. Reason: recommended option — keeps the one-boundary rule; `PowerBrowserAPI.sys.mjs` is exempt from `FORBIDDEN_PATTERNS` as a file, so no per-line exemption is needed for the definitions (the `window.gBrowser = {` one-line exemption is the only per-line carve-out and stays for `powerbrowser.js` only). Boundary definitions carry catalogue rows through `--catalogue` (Phase 27 policy).
- **D-02 [auto]:** The shim implements the full `nsIBrowserDOMWindow` IDL member set (`createContentWindow`/`createContentWindowInFrame`/`openURI`/`openURIInFrame` + `canClose` + `tabCount`, per `upstream/dom/interfaces/base/nsIBrowserDOMWindow.idl:139,153,171,186,196,202`): the two `InFrame` members carry the adopt path, `createContentWindow`/`openURI` return null, `canClose` returns true, `tabCount` returns 1. `window.openLinkIn` (NOT an IDL member — `utilityOverlay.js:123` delegates to `URILoadingHelper.sys.mjs:465`, called by `ClickHandlerParent.sys.mjs:85,146` and `nsContextMenu.sys.mjs:1503-1530`) is the middle/Ctrl+click + context-menu companion. Reason: a `generateQI` shim missing IDL members throws on Gecko call; minimal surface that still satisfies the interface.
- **D-02b [auto]:** `openLinkIn` loads through the overlay's own docshell (`browser.loadURI(url, { triggeringPrincipal })`), exactly the stock contract (`URILoadingHelper.sys.mjs:465` → `w.gBrowser.addTab/openTrustedLinkIn` path loads into the new tab; `ClickHandlerParent.sys.mjs:146` expects `window.openLinkIn(href, where, params)` to open AND load). The InFrame members return the pending overlay WITHOUT navigating (Gecko's frameloader performs the `window.open`/`_blank` load into the returned element, per `ContentParent.cpp:5490-5522` + tabbrowser `nodefaultsrc`/`skipLoad` at `tabbrowser.js:2835`). Separate static assertions: the adopt path asserts no load call; the `openLinkIn` path asserts a `browser.loadURI` call with the triggering principal from params. Reason: checker B2 — one no-load rule for both paths blanks middle-click tabs.

### Opener branch
- **D-03:** Branch on the opener: an overlay opener adopts into a pending overlay next to the opener tab; a Theia-frame opener (e.g. GUI-01 command probe path) returns null so the call falls through to the new-window path. Reason: preserves GUI-01 by construction — the stock window stays the fall-through, never a special case bolted on later.

### Pending overlay + adopt lifecycle
- **D-04 [auto]:** Chrome-first pending overlay: `pc-<n>` placeholder, `openWindowInfo` set (the `window.opener` truth, per the ruling above), `remoteType` copied from the opener (`tabbrowser.js:4249-4251` falls back to the opener's remote type when no preferred type exists). Load rule split (checker B2): the InFrame path issues NO load (Gecko performs it into the returned browser); the `openLinkIn` path loads through the new overlay's docshell with the params triggering principal (stock contract). Reason: recommended option — double-load was the known defect class; blank tabs were the symmetric defect.
- **D-05 [auto]:** After creating the pending overlay, chrome pushes `{kind:'adoptTab'}` over the existing `PowerBrowserGroupRequest` / `PowerBrowserWebTabState` actor pair; frontend `WebTabOpenHandler.adopt` mints `wt-<session>-<n>` directly after the opener and replies `webTabAdopt`. Reason: reuses the Phase 27 push helpers (same pair, same origin wall, D-96) instead of a second actor pair — `webTabActivated` is NOT fired on adopt (see recorded ruling above). The bridge push-parity rule (`verify-web-tab-bridge.mjs:362-392`) compares pushed vs subscribed kinds as set equality: `adoptTab` is pushed in plan 36-01 and subscribed in plan 36-02, so the 36-01 gate asserts the chrome-side send only and the parity assertion turns green in 36-02 — never a conditional "if not landed" fallback.
- **D-06 [auto]:** 5 s adopt-ack timeout with fallback to stock window via `openStockTab`. Reason: recommended option — a lost frontend (reload, quit) must never swallow a user-initiated navigation; the fallback is the already-landed GUI-01 path, not new code. Fallback path detail: `openStockTab` resolves its target window asynchronously (delayed-startup wait) — the adopted URL must route through that same wait, so a fallback racing a cold start still lands. The live script waits on the stock-window BiDi context event, not on a fixed sleep longer than the timer (checker W5).
- **D-06b [auto]:** Unknown-`pcKey` reply path: a `webTabAdopt` ack naming a `pcKey` chrome no longer holds (timeout already fired, overlay swept) replies `unknown-tab` AND sweeps the orphan frontend widget via a `dropAdoptedTab` push carrying the `tabId` (primitives only). Reason: checker W4 — without it the frontend keeps a widget whose overlay is gone.
- **D-07 [auto]:** `where==OPEN_PRINT_BROWSER` or a Theia opener returns null from the shim. Reason: print preview and IDE-initiated opens keep today's fall-through behaviour; no new window type is invented.

### GUI-01 preservation
- **D-08:** `theia/extensions/tab-uris/src/browser/browser-window-command.ts` moves onto the `openStockTab` actor kind in this same phase (not deferred). Reason: ROADMAP notes flag Phase 36 alone can break GUI-01; moving the command here closes the hole in the same landing.
- **D-09 [auto]:** The GUI-01 live rows (`verify-gui01-window.mjs`, `verify-gui01-command.mjs`) stay green unmodified in assertion; only the command's transport changes. Reason: the stock-window contract is behaviour, not transport — changing assertions would hide a regression.

### Frontend adopt + reselect (checker W3 decided)
- **D-05b [auto]:** Reselect-on-close holds already: Theia's `ApplicationShell` re-activates the previously-active title on close (`theia/node_modules/@theia/core/lib/browser/shell/application-shell.js:1071-1085`: `onCloseRequest` wrapper reads `currentTabBar['_previousTitle']` and re-activates it; an adopted tab inserted `tab-after` the opener leaves the opener as the previous title). Plan 36-02 asserts this live (close-adopted reselects opener) and adds no reselect code unless the live leg fails — a failure is a 36-02 revision note, not a conditional "only if not, add" branch in the plan. Reason: checker W3 — the plan must decide, and the tree shows the mechanism exists.

### Channel and kinds
- **D-10:** New group-channel kinds ride `handleGroupMutation` + `handleWebTabAction` with `WEB_TAB_ACTION_KINDS`, `sendWebTabPush`, and the `onPush` router; no new actor pair. Reason: Phase 27 established the pattern and the privileged-kind rule governs classification.
- **D-11 [auto]:** Adopted-tab ids use the existing `wt-<session>-<n>` mint; pending chrome keys use `pc-<n>` and never leak into user-facing copy or the tab store. Reason: keeps NG-001/NG-010 key walls intact; `pc-*` is an internal placeholder by construction.

### Verification shape
- **D-12:** Every new check is one row in `scripts/verify-platform.sh`, derives expectations from the tree and compares (never a hand-kept list), and carries `--self-test` with planted faults that each go red naming the drift. Reason: CLAUDE.md verification rules 1–2; never assert absence of a log line.
- **D-13 [auto]:** Static gates assert: shim QI members equal the `nsIBrowserDOMWindow` members the pinned upstream calls; the single definition-site rule (no second `browserDOMWindow`/`openLinkIn` assignment outside the boundary file — enforced by `FORBIDDEN_PATTERNS` at `check-internals-boundary.sh:83`, whose self-test loop at `:364-379` already plants both names as one-line assignments and requires rejection naming file and pattern); adopt kinds are classified under the privileged-kind rule; `browser-window-command.ts` has no `window.open` fallback left on the command path. Reason: each is the set-equality restatement of a real regression (rebase adds a call, copy-paste second shim, unclassified kind, double-window).
- **D-14 [auto]:** Phase 35's shim-global gate (`verify-shell-gbrowser-standin.mjs` Task 2 comparison: shim names derived from the Phase 27 `FORBIDDEN_PATTERNS` line, REQUIRED from IDL + call sites, IMPLEMENTED from the boundary literal) gains a `browserDOMWindow` IDL_SHIMS entry reading `upstream/dom/interfaces/base/nsIBrowserDOMWindow.idl` (members `createContentWindow`, `createContentWindowInFrame`, `openURI`, `openURIInFrame`, `canClose`, `tabCount` at `:139,153,171,186,196,202`), with a plant. `openLinkIn` is a function-valued receiver (35-01 Task 2 rule (c): no members, compares as an empty set). Plans assume Phase 35 lands the gate first; if it has not landed, the executor reports the missing gate as a blocker and stops — it is not re-implemented here. Reason: checker X1 (cross-phase gate ownership).

### Claude's Discretion
- Exact pending-overlay table shape, ack correlator id format, and fallback timer plumbing.
- Exact live-probe scenario split (adopt-next-to-opener, opener-reselect on close, popup-features window, GUI-01 rows) within the one live script.
- Copy wording for the adopted-tab title/tooltip (must read the configured application name, never a hard-coded brand; no internal ids in copy).

</decisions>

<specifics>
## Specific Ideas

- Firefox behaviour is the reference: `target=_blank` opens next to the opener, opener keeps focus history, closing the child reselects the opener.
- Popup-features windows (`window.open` with width/height, or any non-default chrome flags) open a real popup window: `nsWindowWatcher::GetWindowOpenLocation` (`upstream/toolkit/components/windowwatcher/nsWindowWatcher.cpp:2658-2669`) returns `OPEN_NEWWINDOW` when `uiChromeFlags != CHROME_ALL`, so the remote path (`ContentParent.cpp:5505-5508` null/failed-El fall-through) and the in-process path (`nsContentTreeOwner.cpp:505-511`, `nsWindowWatcher.cpp:1030-1035`) both fall through to `AppWindow::CreateNewContentWindow` — the GUI-01 stock window, reachable in v1.5. No custom browser chrome is authored.
- The stock window remains the explicit escape hatch (GUI-01 command + 5 s adopt fallback), never removed.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements and roadmap
- `.planning/REQUIREMENTS.md` — PROMPT-05 verbatim + traceability row (Phase 36 Pending) + rulings header
- `.planning/ROADMAP.md` Phase 36 entry — goal, depends (Phase 35), notes (opener branch, pending+adopt+5 s fallback, browser-window-command move, GUI-01 live row), success criteria 1–3
- `.planning/PROJECT.md` — Key Decisions table (boundary, patch-stack, no Theia fork), Gecko ESR / Theia versions

### Research
- `.planning/research/ARCHITECTURE.md` §5a — `window.open` flow (`ContentParent.cpp`, `nsFrameLoader.cpp`, `nsWindowWatcher.cpp`), shim table, pending-overlay pseudo-code
- `.planning/research/PITFALLS.md` Pitfalls 1–2 — `browserDOMWindow` vs GUI-01, gBrowser stand-in limits
- `.planning/research/chrome-bar-firefox-gap.md` — PROMPT-05 gap statement
- `.planning/research/SUMMARY.md` Phase 6 section — shell furniture order, `installShellFurniture` context
- `.planning/phases/28-webextension-tab-route-spike/28-SPIKE-DECISION.md` — chrome-tab-model route, Phase 36 adjustment (TabOpen with openerTab, `getTabToAdopt` null, `tabs.create` reuse)

### Codebase contracts
- `powerbrowser/shell/PowerBrowserAPI.sys.mjs` — boundary file; `webTabOpen`/`webTabNavigate`/`webTabClose`/`handleGroupMutation`/`handleWebTabAction`/`openStockTab` patterns to extend
- `powerbrowser/INTERNAL-APIS.md` — append-only catalogue + privileged-kind rule
- `powerbrowser/shell/powerbrowser.js` — gBrowser stand-in, page-key rows, `PowerBrowserWebTabs.relayShortcut` pattern
- `powerbrowser/shell/GroupActorChild.sys.mjs` — zero-privileged-reach actor child (do not widen)
- `powerbrowser/shell/powerbrowser.xhtml` — shell window (`windowtype powerbrowser:main`), overlay insertion point
- `theia/extensions/tab-uris/src/browser/web-tab.ts` — `WebTabOpenHandler`, `WebTabChannel.onPush`, `webTabActivated`, geometry/navigate/close paths to extend with `adopt`
- `theia/extensions/tab-uris/src/browser/browser-window-command.ts` — GUI-01 command to move onto `openStockTab`
- `scripts/verify-platform.sh` — the one registry to append rows to
- `scripts/verify-web-tab-bridge.mjs` — kind classification + overlay-attribute contract to extend
- `scripts/verify-shell-gbrowser-standin.mjs` — stand-in set-equality gate (Phase 31.1 rewrites; do not fight it)
- `scripts/check-internals-boundary.sh` — `FORBIDDEN_PATTERNS` incl. `browserDOMWindow`/`openLinkIn` second-boundary guard
- `scripts/verify-gui01-window.mjs` + `scripts/verify-gui01-command.mjs` — GUI-01 contract that must stay green

### Prior-phase patterns to reuse
- `.planning/phases/27-groundwork-navigation-buttons-and-page-focus-keys/27-RESEARCH.md` — push router, relay, live-probe harness (`scripts/lib/pb-live-probe.mjs`, `verify-nav-keys-live.mjs`)
- `.planning/phases/27-groundwork-navigation-buttons-and-page-focus-keys/27-PATTERNS.md` — end-of-file section, push-kind, key-row patterns
- `.planning/phases/29-address-bar-search-and-fixup/29-CONTEXT.md` — scope discipline (discuss-skipped precedent)
- `.planning/phases/30-address-bar-modes-and-command-centre/30-VALIDATION.md` — validation frontmatter + sampling-rate shape

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `PowerBrowserAPI.webTabOpen` overlay factory (attributes, append order, progress/title listeners, scheme wall, store row): clone the attribute/append half for pending overlays, skip the navigate half (Gecko loads).
- `PowerBrowserGroupParent.receiveMessage` + `handleGroupMutation`/`handleWebTabAction` routing, `webTabIdIsValid`/`webTabKeyIsValid`/`groupSenderIsTheia` walls: new `adoptTab`/`webTabAdopt` kinds ride the same walls.
- `WebTabOpenHandler.openUrl`/`openInBackground` + `WebTabChannel.onPush`: `adopt` is a third open path that inserts `tab-after` the opener instead of append/activate.
- `openStockTab` + `browser-window-command.ts` probe/off-click-path pattern: the adopt fallback and the GUI-01 move reuse both.
- `scripts/lib/pb-live-probe.mjs` + `verify-nav-keys-live.mjs --scenario/--self-test` shape: the adopt live check copies this harness, not a new driver.

### Established Patterns
- End-of-file boundary sections (G11 append rule); catalogue-line fix (`verify-ng-040-internals-catalogue-lines.mjs --fix`) after every boundary edit.
- Derive-from-tree-and-compare + `--self-test` planted faults for every gate; one registry row per check in `verify-platform.sh`.
- Live checks: `withProbeShell`, `-purgecaches`, page-realm `probe()`, never assert absence of a log line.

### Integration Points
- Shell window `powerbrowser.xhtml` + `powerbrowser.js` (shim assignment site, focus tracker) → `PowerBrowserAPI` (shim factory, pending table, push) → actor pair → `web-tab.ts` (adopt, reselect) → tab host (Phase 31.1 TabOpen with openerTab) → `verify-platform.sh` rows.

</code_context>

<deferred>
## Deferred Ideas

- `tabs.create` reusing chrome-first creation — Phase 38 (EXT path), not this phase.
- beforeunload / prompt / permission relays on adopted tabs — Phase 37 (PROMPT-06..09).
- Tab-strip drag/reorder/pin UX around adopted tabs — Phase 34; adopted tabs just carry opener adjacency.
- Extension tab-host details beyond TabOpen-with-opener — Phase 31.1 owns the host.
- Sized-popup-as-tab (an earlier draft's Deferred entry) — REMOVED: superseded by B3. The ROADMAP governs: popup-features `window.open` opens a popup window (`GetWindowOpenLocation` restriction-pref path, `nsWindowWatcher.cpp:2658-2669`), proven live by the `adopt-popup` scenario.

</deferred>

---

*Phase: 36-new-window-links-as-web-tabs*
*Context gathered: 2026-10-22*
