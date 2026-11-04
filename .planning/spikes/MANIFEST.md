# Spike Manifest

## Ideas

### webext-tab-visibility
How PowerBrowser web tabs (chrome-owned `<xul:browser>` overlays in the `powerbrowser:main` shell window, driven from Theia) become tabs that Firefox WebExtensions can see (Phase 28, EXT-04). Decision record: `.planning/phases/28-webextension-tab-route-spike/28-SPIKE-DECISION.md`.

**Requirements:**
- The Theia frame never enters the extension tab tracker and keeps no `messagemanagergroup` (otherwise all-sites content scripts run inside the authenticated IDE).
- Gecko changes go through the patch stack only (hard rule 2); no runtime overrides of private upstream members.
- The GUI-01 stock window stays reachable.

### orca-client-in-pb
Hosting Orca's web client (github.com/stablyai/orca) inside PowerBrowser with PB spawning its own
headless orcad daemon, as decided in the 2026-11-03 /gsd-explore session. Seed:
`.planning/seeds/SEED-261103-o1g-orca-mode-milestone.md`. Evaluation clone: `/home/chris/coding/orca-eval`.

**Requirements:**
- Orca is a third pinned upstream: consumed by version, never patched or vendored (same rule as Theia).
- PB spawns orcad itself as a second token-gated sidecar; no Orca desktop install may be required.
- Pairing must be automatic: the user never types a pairing code.
- First GUI slice is an "Orca" mode next to Coding, hosting the stock web client.
- Nothing in the spike edits Theia core, Gecko outside the patch stack, or the TabUriRegistry shape.

## Spikes

| # | Idea | Name | Type | Validates | Verdict | Tags |
|---|------|------|------|-----------|---------|------|
| 001 | webext-tab-visibility | ext-visibility-today | standard | Given a test extension, when a web tab is active, then record what tabs.query, tab events and content scripts see | VALIDATED | webextensions, tabs, baseline |
| 002a | webext-tab-visibility | ext-route-patch | comparison | Given patch 050 opening the tracker gate plus a tab host, then overlays are extension tabs | PARTIAL | webextensions, patch-stack |
| 002b | webext-tab-visibility | ext-route-gui04-bridge | comparison | Given hidden twin tabs mirroring overlays, then extensions see them | INVALIDATED | webextensions, gui-04, gui-05 |
| 002c | webext-tab-visibility | ext-route-chrome-tab-model | comparison | Given a chrome-side tab model registered at runtime, then overlays are extension tabs without a patch | PARTIAL | webextensions, tab-model |
| 003 | orca-client-in-pb | orca-headless-client-in-pb | standard | Given `orca serve` with no desktop app, when its web client is loaded in a PB web tab with the pairing offer injected, then a workspace and an agent terminal render and the agent can run a command | PENDING | orca, orcad, sidecar, token-gate, pairing |
