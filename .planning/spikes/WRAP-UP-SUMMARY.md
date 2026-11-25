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

---

# Spike Wrap-Up Summary

**Date:** 2026-11-10
**Spikes processed:** 3 (Phase 61, plan 61-04)
**Feature areas:** Orca pane hosting; Orca browser parity; Orca live sharing
**Skill output:** `./.claude/skills/spike-findings-Power-Browser/`

## Processed Spikes
| # | Name | Type | Verdict | Feature Area |
|---|------|------|---------|--------------|
| 004 | orca-pane-hosting | comparison | YELLOW | Orca pane hosting |
| 005 | orca-browser-parity | standard | VALIDATED (VERDICT YELLOW) | Orca browser parity |
| 006 | orca-live-sharing | standard | PARTIAL (VERDICT YELLOW) | Orca live sharing |

## Key Findings

**Orca pane hosting (Phase 64).**
- Route A is chosen: Orca pane components in a Theia `ReactWidget` on Theia's own React, from a
  PB-added Vite entry with zero Orca edits and zero seam patches.
- Route A costs 6.1 MB for a third pane, against 75.8 MB (iframe, Route B) and 177.4 MB (PB web
  tab per pane page, Route B'). Observation through `useAppStore.subscribe` takes 91 ms.
- Unscoped, Orca's stylesheet changes 84 Theia computed values and Theia changes 24 of the
  pane's; scoping to the pane root is the first Phase 64 task.
- Route B' is the fallback and the route for browser panes. Only the terminal pane was mounted;
  the chat pane must be mounted before the Phase 64 plan is fixed.

**Orca browser parity (Phase 66).**
- 92 browser abilities are derived from the pin and gated both ways against `DISPOSITIONS.md`
  by the `orca-browser-parity` row; 85 dispositions are still `[ASSUMED]`.
- S2 is chosen: a PB runtime client attaches through `browser.clientHost.attach` with no Orca
  patch; `goto` from the Orca CLI reached a PB web tab through orcad in 162 ms. S1 (a 13-line
  provider-kind patch) is the fallback. This reverses P61-05.
- Before building rows: probes for background input (Q3) and prompts on overlays (Q5), a decision
  on the in-process route for BiDi rows (Q4), and `snapshot` planned as its own work (Q2).

**Orca live sharing (Phase 63).**
- The floor is proven on the CLI: a Claude session started by PB's orcad was stopped and resumed
  with `claude --resume`, marker echoed, session file 57 -> 86 lines.
- The Claude Code extension (2.1.321) resumes by id through three entry points and has no attach,
  so no extension live share is planned. `--bg` plus `claude attach` is not built.
- The session id comes from Claude's side (`claude agents --json` or the session file name);
  `orca terminal list --json` does not expose it.
- The extension half of the floor waits for the EXT-01 session (D-18).
