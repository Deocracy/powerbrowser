# Spike Wrap-Up Summary

**Date:** 2026-11-03
**Spikes processed:** 5
**Feature areas:** WebExtension tab visibility; Orca client hosting
**Skill output:** `./.claude/skills/spike-findings-Power-Browser/`

## Processed Spikes
| # | Name | Type | Verdict | Feature Area |
|---|------|------|---------|--------------|
| 001 | ext-visibility-today | standard | VALIDATED | WebExtension tab visibility |
| 002a | ext-route-patch | comparison | PARTIAL | WebExtension tab visibility |
| 002b | ext-route-gui04-bridge | comparison | INVALIDATED | WebExtension tab visibility |
| 002c | ext-route-chrome-tab-model | comparison | PARTIAL | WebExtension tab visibility |
| 003 | orca-headless-client-in-pb | standard | VALIDATED | Orca client hosting |

## Key Findings

**WebExtension tab visibility.**
- Before the route, extensions could not see overlays at all: `tabs.query` returned `[]`,
  tabId was -1, and no tab events fired.
- The chosen route is patch 050's tracker gate plus a tabbrowser-shaped host behind
  PowerBrowserAPI. Chris signed it off on 2026-10-21 and it was built in Phase 31.1. Patch 050
  is now 11 files.
- Hidden twin tabs were rejected: they load pages twice and let extensions act on a hidden copy.
- Runtime `windowTracker` overrides were rejected: they amount to a patch with no patch file.

**Orca client hosting.**
- Headless orcad (Node, no Electron) serves the stock web client.
- `pairing.webClientUrl` pairs a fresh PB web tab with no prompt, and the token gate needs no
  exemption.
- A Claude Code agent started in the tab ran commands typed into it from the web tab.
- What the build must do:
  - Spawn orcad directly with `--bind 127.0.0.1`, because `orca serve` hardcodes `0.0.0.0`.
  - Select the profile with `ORCA_USER_DATA_PATH`, because `--data-root` does not scope serve.
  - Treat the pairing URL as a reusable bearer credential.
  - Tear down the terminal daemon on quit, because it outlives serve.
