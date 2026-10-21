---
phase: 28-webextension-tab-route-spike
verified: 2026-10-21T00:00:00Z
status: passed
score: 3/3 success criteria
covered_files:
  - .planning/phases/28-webextension-tab-route-spike/28-SPIKE-DECISION.md
  - .planning/spikes/001-ext-visibility-today/README.md
  - .planning/spikes/002a-ext-route-patch/README.md
  - .planning/spikes/002b-ext-route-gui04-bridge/README.md
  - .planning/spikes/002c-ext-route-chrome-tab-model/README.md
covered_digest: "v3:sha256:dbcdad64836ef3ad05d7a49c718e0e9422383a07396ea6b6815a97bfb82474a8"
---

# Phase 28: WebExtension Tab Route Spike — Verification

**Goal:** Chris has signed off the route by which web tabs become tabs that WebExtensions can see, before Phase 38 is planned and before later phases fix how web tabs are presented to Firefox code.
**Requirement:** EXT-04 — satisfied.
**Nature:** a `/gsd-spike` phase; spike code is throwaway under `.planning/spikes/` and no product file changed (phase commits 05aa6cf, f14fda5 touch only `.planning/`).

| # | Success criterion | Status | Evidence |
|---|-------------------|--------|----------|
| 1 | A live probe records what an installed extension's `tabs.query`, tab events and content scripts see while a web tab is active today | ✓ VERIFIED | Spike 001 ran live twice (MV2 and MV3) against `objdir/dist/bin/powerbrowser`; recorded runs `.planning/spikes/001-ext-visibility-today/results.json` and `results-mv3.json` (20 steps, 86 log entries each) with chrome-side ground truth and cited upstream lines |
| 2 | The spike record compares the three routes (patch, GUI-04 bridge, chrome-side tab model): Gecko patch?, GUI-05?, which v1.5 phases change | ✓ VERIFIED | Spikes 002a (PARTIAL), 002b (INVALIDATED, live evidence of double loads and hidden-copy actions), 002c (PARTIAL); comparison table, judge recommendation and two adversarial checks in `28-SPIKE-DECISION.md`; the skeptics' correction (page_action/TabOpen null guards) is recorded and carried into Phase 31.1's scope |
| 3 | Chris's sign-off on one route is recorded, with the scope consequence | ✓ VERIFIED | `28-SPIKE-DECISION.md` § Sign-off: option 1 (patch 050 + tab host, new Phase 31.1, no GUI-05), sub-ruling "last web tab stays active while the IDE has focus", 2026-10-21; PROJECT.md Key Decisions rows added; Phase 31.1 inserted with EXT-05 moved to it |

## Not verified here

- The recommended route was proven by runtime emulation in the spikes, not by a rebuilt binary with patch 050 applied. Phase 31.1's success criteria 1, 3 and 5 require that rebuild-verified proof.
