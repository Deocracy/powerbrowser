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

## Resolution (2026-10-31, Phase 32 gap closure)

Closed as obsolete: the defect does not reproduce on the current tree, and its cause was fixed on 2026-10-22.

- **Cause:** the first-load race. A fresh overlay commits its initial `about:blank` into session history a few ms after
  creation; a first load that committed before it left a phantom `about:blank` entry at the current index, so a Reload (or an
  activation that reloaded) read `about:blank`, remoteType `web`. Fixed by `afda7df1` (WR-05): `firstWebTabLoad` waits for the
  initial commit and loads with `LOAD_FLAGS_REPLACE_HISTORY`; `c423f1a9` added `switchingOverlays`.
- **Evidence:** `node scripts/verify-page-tools-live.mjs --scenario remoteness-repro` records `not-reproduced R 0/4 A 0/4` with
  the isolation capture now working (`MOZ_LOG=sync,ProcessIsolation:5`; at least five `CheckIsolationForNavigation` lines before
  every trigger, else NOT SCORED). Its legacy-open control (the pre-fix open order: `about:blank`, then at once a plain
  navigation) reads `reproduced`: the phantom `about:blank` entry (`history=about:blank,http@1`). The product order reads
  `history=http@0`. The earlier 8/8 `isolation=none` was a capture failure (buffered log, no `sync`), not an absence of switches.
- **Activeness:** the record-only cross-site probe (`--scenario remoteness-activeness-probe`) read `active-after-switch`
  (`didChange=1 active=1 renderLayers=1 bcActive=1 visible=1`), so the one-line `docShellIsActive` fix was not built.
- **Guard:** the `remoteness-regression` row (five same-site tabs, reload and activation) stays in the registry.
