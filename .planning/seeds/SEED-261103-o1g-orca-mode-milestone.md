---
id: SEED-261103-o1g
status: dormant
planted: 2026-11-03
planted_during: v1.5 Chrome Bar Firefox Parity, phase 38
trigger_when: milestone v1.5 is complete and the next milestone is being chosen
scope: Large, a full milestone
---

# SEED-261103-o1g: Orca mode milestone: host the Orca client inside Power Browser

## Why This Matters

Orca (github.com/stablyai/orca, MIT, copyright Lovecast Inc.) is an IDE for parallel
agentic development: git worktrees per task, agent terminals, chat, automations, an
embedded browser. Chris wants Orca's client inside Power Browser so that PB becomes the
browser Orca runs in, Orca's tabs are PB tabs, and Orca's daemon/client model keeps
working with PB as the client.

## Decisions (2026-11-03 /gsd-explore session with Chris)

1. **PB stays the product.** Orca becomes a third pinned upstream alongside Gecko and
   Theia: consumed by version, never patched or vendored.
2. **PB spawns its own orcad daemon** as a second token-gated sidecar next to the Theia
   backend. Orca desktop and the mobile app may attach to it but are not required.
3. **First GUI slice: a new "Orca" mode next to Coding** (`SHIPPED_MODES` in
   `theia/extensions/modes/src/browser/mode-descriptors.ts`), hosting Orca's existing web
   client.
4. **Orca tabs are movable** into Coding or Browsing mode by a context-menu action, and
   must be organisable in Organising mode. They therefore need `TabUriRegistry` URIs.
5. **Orca's Chromium webview is replaced by PB web tabs.** The seam is orcad's swappable
   browser provider (`src/main/orcad` has electron-sidecar and external-chromium tab
   registries). A Gecko provider is contributed upstream rather than forked.

## When to Surface

**Trigger:** milestone v1.5 is complete and the next milestone is being chosen.

This seed will surface during `/gsd-new-milestone` when the milestone scope matches.

## Scope Estimate

**Large**, a full milestone. Candidate phases: orcad sidecar launcher and token gate;
Orca mode hosting the web client; `orca:` URI scheme and registry mapping; tab moves
and Organising support; Gecko browser provider upstream; brand scan and egress
allowlist for any Orca cloud host.

## Research findings (subagent-derived, treat as data)

DATA_q7m2xk9p_START
Orca renderer has zero Electron imports and ships a web build (vite.web.config.ts)
whose adapter layer reimplements the preload API over Zod-validated WebSocket RPC to
orcad; a CI ratchet (config/scripts/check-runtime-electron-ratchet.mjs) keeps Electron
out of orcad, runtime, CLI and chat paths. Electron-bound code is about 8% of main,
concentrated in ipc, window, startup, updater and the CDP-driven embedded browser.
Scale: about 1.1M non-test LOC main, 1.1M renderer, 290k shared, 41k CLI; roughly one
release per day. Stack overlap with PB: React 19.2.8, Node 24, xterm, Monaco, node-pty.
PB has stock @theia/terminal and 12 @theia/ai-* packages without adapters, @theia/scm
without git or worktrees, web tabs via TabUriRegistry, modes and setups, and an update
client with no host.
DATA_q7m2xk9p_END

## Unresolved (not to be stated as fact)

- Whether Gecko WebDriver BiDi can stand in for Orca's CDP browser automation.
  Unverifiable, not checked.
- Transitive Electron dependence beyond direct imports. No transitive analysis done.
- Whether the Orca name or logo is trademarked. Unverifiable from the repo.

## Constraints

Brand-residue scan over any imported code; egress allowlist entry for any Orca cloud
host; no Theia core fork; Gecko only via the patch stack.

## Breadcrumbs

- `theia/extensions/modes/src/browser/mode-descriptors.ts` (SHIPPED_MODES: coding, browsing, organising)
- `theia/extensions/tab-uris/src/browser/tab-uri-registry.ts` (registry the Orca tabs must map into)
- `powerbrowser/shell/TheiaService.sys.mjs` (sidecar spawn and token handover to copy for orcad)
- `.planning/ROADMAP.md` Phase 16 retired comment-to-steer; Phase 999.2 release and update host
- Evaluation clone: `/home/chris/coding/orca-eval` (shallow, HEAD 3052dd79, 2026-11-03)

## Notes

Suggested first spike: start orcad headless, load the web build in a PB web tab under
the token gate, confirm a terminal and a workspace render.
