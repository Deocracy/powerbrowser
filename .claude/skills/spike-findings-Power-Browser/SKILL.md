---
name: spike-findings-Power-Browser
description: Implementation blueprint from spike experiments. Requirements, proven patterns, and verified knowledge for building Power-Browser — WebExtension tab visibility (extension tab host, patch 050), hosting Orca's web client via a PB-spawned headless orcad, Orca pane hosting in the Lumino dock, Orca browser parity on Gecko, and live sharing of Orca agent sessions. Auto-loaded during implementation work.
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

**orca-tabs-as-pb-tabs.** How Orca's panes become PowerBrowser dock tabs, each its own Lumino
widget, with PB observing Orca's layout read-only (TAB-03, D-15). Spike 004 (Phase 61) compared
Route A (same document, Theia `ReactWidget`), Route B (iframe) and Route B' (PB web tab per pane
page) and chose Route A for Phase 64. Note: `.planning/workstreams/orca/NOTE-orca-tabs-as-pb-tabs-spike.md`.

**orca-browser-parity.** How PowerBrowser web tabs become Orca's browser (BRW-01, D-11, D-16).
Spike 005 (Phase 61) derived every Orca browser ability from the pin with a Gecko disposition
(`scripts/orca-browser-parity.mjs`, `.planning/spikes/005-orca-browser-parity/DISPOSITIONS.md`)
and chose seam S2, a PB runtime client on `browser.clientHost.attach`, for Phase 66.

**orca-live-sharing.** Whether a running Orca agent can be shared live inside the Claude Code
extension, and the `claude --resume` floor (EXT-03). Spike 006 (Phase 61) proved the floor on
the CLI and routed Phase 63 to Theia terminals with `--resume` on demand; the extension half
waits for the EXT-01 session (D-18).

Spike sessions wrapped: 2026-10-21 (001, 002a-c), 2026-11-03 (003) and 2026-11-10 (004-006).
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
- Orca is a third pinned upstream, built from source at a pinned tag (D-04). Changes go in as
  an additive overlay: files PB adds first, then one-to-few-line regenerated seam patches at
  declared seams, capped at about ten (D-16). Whole-file swaps of upstream paths are forbidden,
  and anything deeper needs an owner decision. Orca is never vendored.
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
| Orca pane hosting | references/orca-pane-hosting.md | Route A: Orca pane components in a Theia ReactWidget on Theia's React, observed through `useAppStore.subscribe` (91 ms), 6.1 MB for a third pane, 0 seam patches; Orca's stylesheet must be scoped to the pane root first (84 Theia values changed unscoped). Route B' is the fallback and the route for browser panes. |
| Orca browser parity | references/orca-browser-parity.md | Seam S2: a PB runtime client attaches through `browser.clientHost.attach` with no Orca patch; `goto` from the Orca CLI reached a PB web tab in 162 ms. 92 abilities derived and gated both ways by the `orca-browser-parity` row; tier 1 is 50, 85 dispositions still assumed. S1 (13-line patch) is the fallback. |
| Orca live sharing | references/orca-live-sharing.md | Floor proven on the CLI: an Orca-started Claude session stopped and resumed with `claude --resume`. The extension (2.1.321) resumes by id and has no attach, so Phase 63 builds Theia terminals with `--resume` on demand, session id from Claude's side; no live share, no `--bg`/`attach`. |

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
- 004-orca-pane-hosting
- 005-orca-browser-parity
- 006-orca-live-sharing
</metadata>
