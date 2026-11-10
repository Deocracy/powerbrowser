# Phase 61: Spikes for pane hosting, browser parity and live sharing - Context

**Gathered:** 2026-11-09
**Status:** Ready for planning
**Mode:** Smart discuss, auto mode (Chris 2026-11-09: "Claude takes the recommended answers, keeps going"). Every P61 decision below is Claude's recommended pick; Chris may override any of them in the end-of-milestone pass (59-CONTEXT D-18) or earlier.

<domain>
## Phase Boundary

Three spikes with measured answers and runnable prototypes, so Phases 63 (Theia terminals and agent hooks), 64 (Orca panes as PowerBrowser tabs) and 66 (PowerBrowser web tabs as Orca's browser) build a chosen route rather than an assumed one: (1) pane hosting, TAB-03; (2) browser parity, BRW-01; (3) live sharing, EXT-03. Success criteria are the four in ROADMAP Phase 61. Nothing production-shaped is built beyond the re-runnable parity derivation script; the spikes end in decision records and the roadmap names the chosen route per phase (criterion 4).

Out of scope: any seam patch or overlay code for the remake itself (Phases 62–66); the mobile fork; upstream pull requests (Phase 68).

</domain>

<decisions>
## Implementation Decisions

### Pane-hosting spike (TAB-03, criterion 1)
- **P61-01 (Claude's pick): prototype the same-document route first, iframe-per-pane second, and measure both.** Route A mounts one Orca pane component inside a Theia `ReactWidget` in PowerBrowser's dock from a PB-added web entry (the `vite.web.config.ts` seam named in D-16), with exactly one React 19.2.8 copy; Route B loads one Orca web page per pane in an iframe inside a Lumino widget. Both are measured on the same three numbers: cross-origin WebSocket to orcad from the Theia origin (works, needs a token/Origin change, or fails), CSS isolation (count of Orca global styles that leak into Theia and the reverse), and resident memory per added pane after three panes. The decision record names the winner and the seam patches it needs against the D-16 cap of about ten. — **Reversibility:** reversible — the record can be re-decided before Phase 64 is planned.
- **P61-02 (Claude's pick): the read-only layout observation (D-15) is prototyped as a listener on the client's persisted layout state (`orca.web.workspaceSession.v1` and the renderer's layout store events), not by patching Orca's layout code.** A pane opened in Orca's client must appear as a new Lumino tab within one second in the prototype; the record states the mechanism and its latency.
- **P61-03 (Claude's pick): the prototype is built from the pinned source already at `orca/` (Phase 60's `scripts/build-orca.sh`) and lives under `.planning/spikes/004-orca-pane-hosting/`; no tracked production file is added for it.** Scratch builds and web entries stay gitignored or under the spike directory.

### Browser-parity spike (BRW-01, criterion 2)
- **P61-04 (Claude's pick): a tracked script `scripts/orca-browser-parity.mjs` derives the ability list from the pinned Orca tree at check time** (the browser provider interface in `orcad/orcad-browser-provider.ts` and the agent/CLI browser tools that call it), prints each ability with the Orca component that uses it (agent, CLI, renderer or orcad), and fails when a hand-kept disposition row has no matching ability or an ability has no row — the derive-and-compare rule. Dispositions (WebDriver BiDi, BiDi plus PB code, chrome actor, native, impossible) live in a tracked table `.planning/spikes/005-orca-browser-parity/DISPOSITIONS.md` that the script reads.
- **P61-05 (Claude's pick): the provider seam is the browser provider kind in `orcad/orcad-browser-provider.ts` (D-16), implemented in Phase 66 as a PB provider that talks to Gecko through `PowerBrowserAPI.sys.mjs` and WebDriver BiDi; the spike proves one ability end to end (navigate + read title) through that seam to size it.** `research/FEATURES.md` questions 1–8 are answered in the record with evidence lines.

### Live-sharing spike (EXT-03, criterion 3)
- **P61-06 (Claude's pick): the floor is proven first and without Chris: a stopped Orca agent session (created by PB's orcad from Phase 60) resumed with `claude --resume <session>` on this host's Claude CLI login, with the run's transcript as evidence.** The live-share half (a running Orca agent shared inside the Claude Code extension) needs the EXT-01 session, which is deferred (D-18, P60-R5); the record states what was proven, what is blocked on EXT-01, and what the extension's source says about attaching to an external session (the research reads the extension's published package for that).
- **P61-07 (Claude's pick): if the live share proves impossible from source reading, the record recommends the Phase 63 fallback now (agent sessions as Theia terminals with `--resume` on demand) so Phase 63 is not blocked on the deferred check.**

### Spike mechanics and the roadmap hand-off (criterion 4)
- **P61-08 (Claude's pick): three Orca lanes, one per spike (`p61-01` pane hosting, `p61-02` browser parity, `p61-03` live sharing), disjoint files, merged by the coordinator in that order (D-07/D-08 mechanics from Phase 59).** The pane-hosting lane builds Orca itself with `scripts/build-orca.sh` in `.#orca` (about 20 minutes cold); the other two need only the fetched tree.
- **P61-09 (Claude's pick): each spike ends with a VERDICT section in its record (`GREEN`, `YELLOW` with conditions, or `RED` with the owner decision needed) and a "Route for Phase N" line; the coordinator copies those lines into ROADMAP Phases 63, 64 and 66 ("Route chosen by Phase 61: …") so criterion 4 is met before any of them is planned.** A RED verdict is an owner decision and is asked in the box before that phase is planned, not before the spike ends.
- **P61-10 (Claude's pick): spike records follow the existing `.planning/spikes/003-…` shape and are wrapped into `Skill("spike-findings-Power-Browser")` references at the end of the phase** (the skill's README names the wrap-up step), so Phases 62–66 load the findings automatically.

### Claude's Discretion
- Prototype code layout under each spike directory, measurement harness details, the exact BiDi commands for the parity proof, and the Claude CLI invocation for the resume floor.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Owner decisions and prior phases
- `.planning/workstreams/orca/DECISIONS.md` — D-04 pin, D-05 order, D-15 one pane = one Lumino tab with the renderer owning layout, D-16 bounded overlay and the named seams, D-26..D-29 re-pin and upstream seams.
- `.planning/workstreams/orca/NOTE-orca-tabs-as-pb-tabs-spike.md` — Chris's direction and the five questions the pane-hosting spike must answer.
- `.planning/workstreams/orca/NOTE-orca-tab-parity-direction.md` — the browser-parity direction (Orca's browser replaced by PB chrome, spike first).
- `.planning/workstreams/orca/ADVERSARIAL-orca-ownership.md` — the adopted ownership review (additive overlay; file counts).
- `.planning/workstreams/orca/research/FEATURES.md` (questions 1–8, the 8 tab content types), `research/ARCHITECTURE.md` (Q6 private RPC), `research/INPUTS.md` (dnd-kit vs Lumino split), `research/PITFALLS.md`.
- `.planning/workstreams/orca/phases/60-orca-from-source-on-theia-s-node/60-RESEARCH.md`, `60-02-SUMMARY.md`, `60-03-SUMMARY.md` — how Orca is built and started here (`scripts/build-orca.sh`, `scripts/lib/orca-run.mjs`, the probe Node, the `powerbrowser-orca` profile, the pairing redaction rule).
- `.planning/workstreams/orca/phases/59-carry-forward-from-v1-5-and-v1-6/59-CONTEXT.md` D-07/D-08 (lane mechanics), D-16 (owner child), D-18 (human checks deferred).

### Spike conventions
- `.planning/spikes/003-orca-headless-client-in-pb/` and `.planning/spikes/MANIFEST.md` — the record shape and manifest to extend.
- `.claude/skills/spike-findings-Power-Browser/SKILL.md` and `references/orca-client-hosting.md` — validated build steps and landmines; the wrap-up target.

### Project rules
- `CLAUDE.md` — hard rules (never fork Theia core; one verification registry; brand scan with the strict `orca` probe and exact counts from Phase 60; patches regenerated never edited; additive overlay).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/build-orca.sh`, `scripts/lib/orca-run.mjs`, `scripts/verify-orca-slotless-start.mjs` (Phase 60): build, start, pair and reap orcad on the probe Node; the web-tab pairing half already drives a PB web tab to Orca's client.
- `theia/extensions/tab-uris` (`WEB_TAB_FACTORY_ID`, `TabUriRegistry`), `theia/extensions/modes` (Lumino dock handling, `MainAreaExemption`), `theia/extensions/chrome-bar` — where a Lumino widget hosting an Orca pane would register.
- `powerbrowser/shell/PowerBrowserAPI.sys.mjs` and `powerbrowser/INTERNAL-APIS.md` — the only route to Gecko for the parity proof; `scripts/lib/firefox-bidi.mjs` — existing WebDriver BiDi harness.
- `.planning/spikes/003-…` harness — headless orcad with a gated PB web tab.

### Established Patterns
- Derive-and-compare checks with `--self-test`; the strict `orca` brand probe means every new tracked file mentioning Orca needs its `only_in`/`expected_count` rows updated in `inventory/brand-tokens.json` (Phase 60-04 rule); spike directories under `.planning/` are excluded from the scan.
- Live runs take `flock /home/chris/coding/Power-Browser/.git/pb-live.lock`; never headed or real-input in lanes.
- Lanes never edit STATE.md, ROADMAP.md, WINDOWS.md or the ledger.

### Integration Points
- The pane-hosting winner feeds Phase 64's plan; the parity dispositions feed Phase 66; the live-sharing verdict feeds Phase 63 and the EXT-02 reshaping note.

</code_context>

<specifics>
## Specific Ideas

- Chris's words (NOTE-orca-tabs-as-pb-tabs-spike.md): Orca views should run "the same way theia and browser run", laid out by Lumino, movable between modes. The pane-hosting record answers the five questions in that note.
- Measurements are numbers from runs on this host (legion), recorded with the command that produced them.

</specifics>

<deferred>
## Deferred Ideas

- The live-share half that needs the Claude Code extension session: proven in the end-of-milestone pass with EXT-01 (D-18).
- Upstream pull requests for the seams (Phase 68); renames and palette (post-v1.7).

</deferred>

---

*Phase: 61-spikes-for-pane-hosting-browser-parity-and-live-sharing*
*Context gathered: 2026-11-09 (auto mode)*
