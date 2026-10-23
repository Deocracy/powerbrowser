---
title: Chrome focus sometimes does not land on the web-page overlay
created: 2026-10-23
resolves_phase: 31
priority: high
source: 29 deferred-items (Paste & Go flake), 30-REVIEW-FIX and 30-VERIFICATION (address-keys focusOverlay)
---

After an action that should give the page focus (Paste & Go from the pill context menu; the live harness's focusOverlay before F6, scripts/lib/pb-live-probe.mjs:147), chrome's focus is sometimes not on the overlay's page. Rate: 3 of 5 full verify-address-bar-live runs on 2026-10-22, up from about 2 in 5 in Phase 29. No product check failed in those runs, but the full live suite is now unreliable, and every later phase's live checks drive page focus.

Do: reproduce with verify-address-bar-live --scenario context-menu,address-keys in a loop. Find where focus is handed from the Theia frame to the overlay browser (Phase 27 relay, powerbrowser.js focus handling, PowerBrowserAPI focus path). Fix the race in product code rather than adding harness retries, and keep a scenario that fails on the old behaviour.

Also fold in: PowerBrowserAPI.sys.mjs firstWebTabLoad is not awaited and has no .catch in webTabOpen (30-SECURITY UF-30-01 note); add a .catch that logs without the URL.
