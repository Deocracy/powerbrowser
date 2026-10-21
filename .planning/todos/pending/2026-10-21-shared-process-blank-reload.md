---
created: 2026-10-21
title: Fifth same-site web tab blanks on reload/activation (shared content process, GUI-02)
area: web-tabs
resolves_phase: 32
files:
  - powerbrowser/shell/PowerBrowserAPI.sys.mjs
  - theia/extensions/tab-uris/src/browser/web-tab.ts
---

## Problem

Pre-existing (GUI-02): with four same-site web tabs open, reloading or
activating a fifth can switch its overlay to remoteType `web` at `about:blank`,
so the page goes blank. Found during Phase 27 live runs; details in
.planning/phases/27-groundwork-navigation-buttons-and-page-focus-keys/deferred-items.md.
It weakens NAV-01/NAV-02 (Reload) in real use. Phase 27 verifier flagged it as
having no owner (27-VERIFICATION.md human item 7).

## Solution

Owned by Phase 32 (Page Tools, which covers reload/crash recovery): reproduce
with a live scenario first, then fix the remoteness switch for overlays sharing
a process; keep the scenario as a regression row.
