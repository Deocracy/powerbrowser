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

### orca-tabs-as-pb-tabs
How Orca's panes become PowerBrowser dock tabs, each its own Lumino widget, with PB observing
Orca's layout read-only (TAB-03, D-15). Phase 61 spike for Phase 64. Note:
`.planning/workstreams/orca/NOTE-orca-tabs-as-pb-tabs-spike.md`. Spike 004 compares three routes
(A same document, B iframe, B' PB web tab per pane page) in one directory, not as
`004a`/`004b`/`004c`, because the routes share one build and one harness.

**Requirements:**
- Route A mounts one Orca pane in a Theia `ReactWidget` from a PB-added web entry with exactly one React 19.2.8 copy; Route B loads one Orca web page per pane in an iframe in a Lumino widget; both are measured on cross-origin WebSocket to orcad, CSS leak counts both ways and memory per pane after three panes, and the record names the winner and its seam patches against the D-16 cap of about ten (P61-01).
- The prototype is built from the pinned `orca/` source and lives under `.planning/spikes/004-orca-pane-hosting/`; no tracked production file is added (P61-03).
- The read-only observation uses `useAppStore.subscribe` (A), a PB page script posting to the Theia parent (B/B') or the read-only orcad RPC, never `orca.web.workspaceSession.v1`; one-second clock (P61-11).
- Route B' (one PB web tab per pane page) is a third measured column; the extra web entry is a PB-added Vite config that `mergeConfig`s Orca's with zero Orca edits (A1), and one React copy is attempted through externals mapped to Theia's instance (A4) (P61-12).
- Hard rules: no Theia core edit, no Gecko change outside the patch stack, no `TabUriRegistry` shape change, no tracked edit under `orca/`.

### orca-browser-parity
How PowerBrowser web tabs become Orca's browser: every Orca browser ability derived from the pin
with a Gecko disposition, and the provider seam Phase 66 builds (BRW-01, D-11, D-16). Phase 61
spike for Phase 66. Inventory gate: `scripts/orca-browser-parity.mjs` with
`.planning/spikes/005-orca-browser-parity/DISPOSITIONS.md`.

**Requirements:**
- A tracked `scripts/orca-browser-parity.mjs` derives the ability list from the pinned Orca tree at check time, prints each ability with the component that uses it (agent, CLI, renderer or orcad), and fails both ways against the hand-kept disposition table (BiDi, BiDi plus PB code, chrome actor, native, impossible) (P61-04).
- One ability (navigate plus read title) runs end to end through the chosen seam; `research/FEATURES.md` questions 1-8 are answered with evidence lines (P61-05).
- S2 (`browser.clientHost.attach` from a PB runtime client, capability `browser.clientHost.v1`, no Orca patch) is proven first; S1 (the provider-kind union) is the fallback, carried only as a spike-directory `.patch`; a RED on both is an owner decision (P61-13).
- Hard rules: no Orca tracked edit, no `PowerBrowserAPI` or Gecko change, no BiDi port in a shipped build (D-11).

### orca-live-sharing
Whether a running Orca agent can be shared live inside the Claude Code extension, and the floor:
a stopped Orca agent session resumed with `claude --resume` (EXT-03, D-06.3). Phase 61 spike for
Phase 63; the extension half waits for the EXT-01 session (D-18).

**Requirements:**
- The floor is proven first and without the owner: a stopped agent session created by PB's own orcad, resumed with `claude --resume <session>` on this host's Claude CLI login, with the run as evidence (P61-06).
- If the live share proves impossible from source reading, the record recommends the Phase 63 fallback now: agent sessions as Theia terminals with `--resume` on demand (P61-07).
- The CLI's `--bg`, `claude attach <id>` and `claude agents` launch modes are covered as the candidate live-share mechanism, unproven until run (P61-14).
- No transcript text, pairing value or token in any tracked file; no call reaches the owner's running Orca.

## Spikes

| # | Idea | Name | Type | Validates | Verdict | Tags |
|---|------|------|------|-----------|---------|------|
| 001 | webext-tab-visibility | ext-visibility-today | standard | Given a test extension, when a web tab is active, then record what tabs.query, tab events and content scripts see | VALIDATED | webextensions, tabs, baseline |
| 002a | webext-tab-visibility | ext-route-patch | comparison | Given patch 050 opening the tracker gate plus a tab host, then overlays are extension tabs | PARTIAL | webextensions, patch-stack |
| 002b | webext-tab-visibility | ext-route-gui04-bridge | comparison | Given hidden twin tabs mirroring overlays, then extensions see them | INVALIDATED | webextensions, gui-04, gui-05 |
| 002c | webext-tab-visibility | ext-route-chrome-tab-model | comparison | Given a chrome-side tab model registered at runtime, then overlays are extension tabs without a patch | PARTIAL | webextensions, tab-model |
| 003 | orca-client-in-pb | orca-headless-client-in-pb | standard | Given `orca serve` with no desktop app, when its web client is loaded in a PB web tab with the pairing offer injected, then a workspace and an agent terminal render and the agent can run a command | VALIDATED | orca, orcad, sidecar, token-gate, pairing |
| 004 | orca-tabs-as-pb-tabs | orca-pane-hosting | comparison | Given one Orca pane component built from the pinned source by a PB-added Vite entry, when it is hosted in PowerBrowser's dock by Route A (same document, Theia ReactWidget), Route B (iframe in a Lumino widget) and Route B' (one PB web tab per pane page), then the cross-origin WebSocket result, the CSS leak counts, the memory per pane and the layout-observation latency decide the route Phase 64 builds (routes A, B and B' share one directory) | YELLOW | orca, lumino, react, panes |
| 005 | orca-browser-parity | orca-browser-parity | standard | Given the pinned Orca tree, when the parity script derives every browser ability with its users, then each ability has a Gecko disposition and one ability (navigate plus read title) runs from the Orca CLI through orcad to a PowerBrowser web tab | VALIDATED (VERDICT YELLOW) | orca, orcad, browser, provider, client-host, bidi, parity |
| 006 | orca-live-sharing | orca-live-sharing | standard | Given a Claude agent session started by PowerBrowser's orcad and then stopped, when it is resumed with claude --resume <id>, then the conversation continues in the same session file; and the Claude Code extension's capability to attach to a running external session is recorded from its published package | PARTIAL (VERDICT YELLOW) | orca, orcad, claude-code, extension, resume, live-sharing |
