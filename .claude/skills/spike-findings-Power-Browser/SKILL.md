---
name: spike-findings-Power-Browser
description: Implementation blueprint from spike experiments. Requirements, proven patterns, and verified knowledge for building Power-Browser — WebExtension tab visibility (extension tab host, patch 050) and hosting Orca's web client via a PB-spawned headless orcad. Auto-loaded during implementation work.
---

<context>
## Project: Power-Browser

**webext-tab-visibility.** How PowerBrowser web tabs become tabs that Firefox WebExtensions can
see. Web tabs are chrome-owned `<xul:browser>` overlays in the `powerbrowser:main` shell window,
driven from Theia. This is Phase 28, EXT-04. Decision record:
`.planning/phases/28-webextension-tab-route-spike/28-SPIKE-DECISION.md`. It was built in
Phase 31.1.

**orca-client-in-pb.** Hosting Orca's web client (github.com/stablyai/orca) inside
PowerBrowser, with PB spawning its own headless orcad daemon. This was decided in the
2026-11-03 /gsd-explore session. Seed: `.planning/seeds/SEED-261103-o1g-orca-mode-milestone.md`.

Spike sessions wrapped: 2026-10-21 (001, 002a-c) and 2026-11-03 (003).
</context>

<requirements>
## Requirements

**webext-tab-visibility**
- The Theia frame never enters the extension tab tracker and has no `messagemanagergroup`.
  Otherwise all-sites content scripts would run inside the authenticated IDE.
- Gecko changes go through the patch stack only (hard rule 2). Private upstream members are
  never overridden at runtime.
- The GUI-01 stock window stays reachable.

**orca-client-in-pb**
- Orca is a third pinned upstream. It is consumed by version and never patched or vendored,
  the same rule as Theia.
- PB spawns orcad itself as a second token-gated sidecar. No Orca desktop install may be
  required.
- Pairing must be automatic: the user never types a pairing code.
- The first GUI slice is an "Orca" mode next to Coding, hosting the stock web client.
- Nothing edits Theia core, Gecko outside the patch stack, or the TabUriRegistry shape.
</requirements>

<findings_index>
## Feature Areas

| Area | Reference | Key Finding |
|------|-----------|-------------|
| WebExtension tab visibility | references/webextension-tab-visibility.md | Patch-stack tracker gate (050) plus a tabbrowser-shaped host behind PowerBrowserAPI. Hidden twin tabs are invalidated, and runtime overrides are a patch with no patch file. |
| Orca client hosting | references/orca-client-hosting.md | Headless orcad pairs automatically and runs an agent inside a gated PB web tab. Spawn orcad directly on 127.0.0.1 with a PB-owned `ORCA_USER_DATA_PATH`, and treat `webClientUrl` as a bearer credential. |

## Source Files

Reference copies of the spike scripts, test extensions and patches are in `sources/`. Their
relative imports (`../../../scripts/lib/…`) only resolve from the originals in
`.planning/spikes/`, so run them from there. Results JSON and screenshots stay in
`.planning/spikes/`.
</findings_index>

<metadata>
## Processed Spikes

- 001-ext-visibility-today
- 002a-ext-route-patch
- 002b-ext-route-gui04-bridge
- 002c-ext-route-chrome-tab-model
- 003-orca-headless-client-in-pb
</metadata>
