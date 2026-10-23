---
title: Chrome focus sometimes does not land on the web-page overlay
created: 2026-10-23
completed: 2026-10-22
resolves_phase: 31
priority: high
source: 29 deferred-items (Paste & Go flake), 30-REVIEW-FIX and 30-VERIFICATION (address-keys focusOverlay)
---

After an action that should give the page focus (Paste & Go from the pill context menu; the live harness's focusOverlay before F6, scripts/lib/pb-live-probe.mjs:147), chrome's focus is sometimes not on the overlay's page. Rate: 3 of 5 full verify-address-bar-live runs on 2026-10-22, up from about 2 in 5 in Phase 29. No product check failed in those runs, but the full live suite is now unreliable, and every later phase's live checks drive page focus.

Do: reproduce with verify-address-bar-live --scenario context-menu,address-keys in a loop. Find where focus is handed from the Theia frame to the overlay browser (Phase 27 relay, powerbrowser.js focus handling, PowerBrowserAPI focus path). Fix the race in product code rather than adding harness retries, and keep a scenario that fails on the old behaviour.

Also fold in: PowerBrowserAPI.sys.mjs firstWebTabLoad is not awaited and has no .catch in webTabOpen (30-SECURITY UF-30-01 note); add a .catch that logs without the URL.

## Resolution (2026-10-22)

Fixed in c423f1a (product) and 5b725e1 (live check). Debug record: `.planning/debug/overlay-focus-intermittent.md`.

The root cause is one Gecko rule that three defects run into. A hidden `<browser>` cannot take focus (`nsIFrame::IsFocusable`), and a focused one that becomes hidden loses focus at the next refresh tick (the focus fixup rule, `Document.cpp`). The defects:

1. **Placeholder push (chrome).** A browsing-context switch (a process change, or the BFCache keeping the old page) rebuilds the overlay's web navigation, which reads `about:blank` until the new page's location change. `webTabPush` read it live, so the frontend saw "no page" and hid the overlay for a frame. Overlays are now held in `switchingOverlays` from `DidChangeBrowserRemoteness` until a top-level location change or network stop, and the flush skips them. This was also the Phase 29 "page took focus, then lost it 32 ms later" and the "content-process switch" suspect.
2. **Focus ahead of the show (frontend).** `WebTabWidget.focusPage` sent `webTabFocus` before the rAF-coalesced geometry publish that shows the overlay after a menu or dropdown closes. The focus now rides that publish and is sent after its geometry. This also covers F6 from the pill with suggestions open, which failed every time and had no test.
3. **Lost load signal (Paste & Go).** `focusPageWhenLoaded` waited for a `loading: true` push that chrome's per-frame coalescer drops for a fast load. Paste & Go now focuses the page at commit, as 29-09 specified. Gecko keeps the focus across the frameloader swap.

The address-keys failure ("the page could not be focused before F6") was the harness. `focusOverlay` called `o.focus()` before chrome applied the dropdown-close restore. It now waits until chrome shows the overlay, a real precondition.

The `firstWebTabLoad` `.catch` (UF-30-01) is in c423f1a and logs `err.name` only.

Rates on `--scenario search,context-menu,address-keys`: 6 of 15 red before the fix, 0 of 15 after. Full `verify-address-bar-live` passed 31/31. `--self-test` exited 0: its clean control was green, and all 36 plants went red, including the new `focus-before-show` and `placeholder-push`. `verify-nav-keys-live` passed 31/31 and `verify-web-tab-live` passed. The new `page-focus` scenario fails on the old code in 18 of 18 runs (F6) and 4 of 4 (navigation).
