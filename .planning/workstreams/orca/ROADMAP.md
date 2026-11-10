# Roadmap: Power Browser

## Overview

Milestone v1.7 "Orca integration" (workstream `orca`) makes Orca's agent workflow run inside PowerBrowser as real PowerBrowser tabs, with PowerBrowser's own engine and chrome as the agents' browser. PowerBrowser builds Orca from source at a pinned tag under an additive overlay (PB-added files plus a capped set of one-to-few-line regenerated seam patches), runs its own headless orcad slot-less on Theia's Node, shows Orca's terminals on Orca's own engine and terminal view as PowerBrowser tabs beside Theia's own terminals (D-31), mounts each Orca pane as one Lumino tab in PowerBrowser's dock, replaces Orca's Chromium browser panes with PowerBrowser web tabs, and re-pins to the newest Orca tag weekly.

Phase 59 is the carry-forward phase (Chris, 2026-11-07): every live item deferred from v1.5 and v1.6 is listed in `.planning/CARRY-FORWARD-v1.7.md` and runs first. The Orca work follows D-05. The source build and the slot-less start probe (60) and the three spikes (61) come first. The minimum hosting the remake builds on (62) comes next, then the tab remake (63-66). The remaining hosting basics (67) finish after the remake, and cross-OS artifacts and the re-pin job (68) close the milestone. Nothing is reported as done while Orca's client runs in a single tab.

Owner decisions D-01..D-31 (`DECISIONS.md`) and the adopted adversarial review (`ADVERSARIAL-orca-ownership.md`) win over `research/SUMMARY.md`. Its proposed phases 59-66 assumed a release-binary fetch, a second Node runtime, the one-client-tab design and an orcad layout owner, all of which the owner decisions replaced. Phase numbering continues from v1.6 (workstream `deploy`), which ends at Phase 58.

## Milestones

- **v1.7 Orca integration** — Phases 60–67 (planning; workstream `orca`; requirements in `.planning/workstreams/orca/REQUIREMENTS.md`)

## Hard constraints (every phase)

- CLAUDE.md hard rules: never fork or patch Theia core; never modify Gecko outside the patch stack, with every Firefox internal reached through `PowerBrowserAPI.sys.mjs` and catalogued in `INTERNAL-APIS.md`; keep the bridge landable (`TabUriRegistry` shape unchanged); repo path has no space; Theia is the default GUI and stock browser chrome stays reachable and unmodified.
- Additive overlay (D-04, D-16, D-29): PB-added files first, then at most about ten declared one-to-few-line seam patches, regenerated, never text-edited. Whole-file replacement of an upstream Orca path is forbidden. Anything deeper needs an owner decision.
- orcad's mobile-facing protocol (pairing relay, runtime RPC) is never modified (D-23).
- One verification driver: every new check is one row in `scripts/verify-platform.sh`, never a sibling driver. Rows derive their expectation from the tree (or the pinned Orca source) and compare as sets. Each carries a `--self-test` that plants each fault and must go red naming it. No check asserts the absence of a log line or marker unless the self-test first proves the detector sees it on the stock path (RUN-04 and RUN-07 are built this way).
- The brand scan is a permanent gate. Stage new files before trusting a green scan; the "Orca" token is classified only in `inventory/brand-tokens.json`.
- User-facing copy names "PowerBrowser", states the problem plainly and ends with a real on-screen next step. Every omitted identifier appears as a diagnostics row.
- No `schedule:` key in the product repo (D-77, v1.6): the weekly re-pin is dispatched by the release-train clock.
- Run mode is interactive per phase (D-25): Chris answers each phase's discuss step and execution runs between. This milestone does not use `/gsd-autonomous`. Live checks pass on Linux; macOS and Windows get smoke tests when a host is available (D-24).

## Phases

**Phase Numbering:**
- Integer phases (59, 60, ...): planned milestone work
- Decimal phases (59.1, ...): urgent insertions (marked INSERTED)

- [ ] **Phase 59: Carry-forward from v1.5 and v1.6** - Deferred live items CF-01..CF-19, the v1.5 human checklist and verify-work 29-31, gap-closure code, `--gate` green, v1.6 close-out
- [ ] **Phase 60: Orca from source on Theia's Node** - Pinned-tag source build in a Nix dev shell, slot-less orcad start probe, brand and licence classification, Claude Code extension check
- [x] **Phase 61: Spikes for pane hosting, browser parity and live sharing** - Measured answers to TAB-03, BRW-01 and EXT-03 before the remake is built
- [x] **Phase 62: Overlay gate and PowerBrowser-run orcad** - Seam check for the additive overlay; OrcaService spawns, supervises and stops orcad
- [ ] **Phase 63: Agent hooks on Orca's terminal engine** - Orca terminals on Orca's own engine beside Theia terminals (D-31), agent status hooks, extension sessions visible in Orca, agents end on quit; remote terminals (TERM-03) deferred to v2
- [ ] **Phase 64: Orca panes as PowerBrowser tabs** - Orca mode, `pb-orca:` URIs, one Orca pane equals one Lumino tab, Orca-only views as their own tabs, Orca terminals as hosted `TerminalPane` tabs with the key policy
- [ ] **Phase 65: Orca workspace in Theia** - Theia editor and workspace folders for worktrees, Orca side panel, Orca's Add-project flow, Setups restore
- [ ] **Phase 66: PowerBrowser web tabs as Orca's browser** - Browser pages as PB web tabs, chrome-side agent bridge, agent-control mark, Orca browser tools in PB chrome
- [ ] **Phase 67: Hosting hardening** - Failure page, pairing-offer containment, sidecar Origin check, credential-storage check, landing logo
- [ ] **Phase 68: Three-OS artifacts, weekly re-pin and upstream seams** - Linux, macOS and Windows artifacts, Linux live checks, weekly re-pin job, mobile pairing check, upstream pull requests

## Phase Details

### Phase 59: Carry-forward from v1.5 and v1.6

**Goal**: Every live item deferred from v1.5 and v1.6 is done or re-dated with an owner date, the full gate is green, and v1.6 is closed, so the Orca work starts on a shipped, verified tree.
**Depends on**: Nothing in this milestone (first phase by owner ruling, 2026-11-07)
**Requirements**: `.planning/CARRY-FORWARD-v1.7.md` CF-01..CF-19 (§4), the v1.5 rows (§1), the unexecuted v1.6 plans (§2) and the deferrals indexed in §5. No v1.7 requirement id maps here.
**Success Criteria** (what must be TRUE):
  1. Each owner row (the 41-item checklist, `/gsd-verify-work 29/30/31`, OWNER-PASS §1-§13) has one plan and a recorded outcome: done, or re-dated in WINDOWS.md with an owner date. Owner rulings R1-R16 are not re-asked.
  2. Each Claude row (backlog 999.28-999.31, plan 57-08, CF-14, CF-15, CF-16) has one gap-closure plan, is landed, and its gate row is green. The live work already done by 2026-11-07 is recorded in the 41-04, 42-04, 43-05, 47-04 and 48-05 SUMMARYs, not redone.
  3. `scripts/verify-platform.sh --gate` passes with no exclusions, or every remaining `GATE_KNOWN_OPEN_EXCLUSIONS` id is re-dated in WINDOWS.md. An open WINDOWS.md entry closes only with its fix.
  4. v1.6 is closed on workstream `deploy` (R1/R16 override closeout, tag `v1.6`) once the owner pass is done; every push waits on Chris's word (CF-19).

**Plans**: 5/8 plans executed

Plans:
- [x] 59-08-PLAN.md

**Wave 1**
- [x] 59-01-PLAN.md — lane: record the 2026-11-07 live state in five deploy SUMMARYs (CF-14)
- [x] 59-02-PLAN.md — lane: device-flow token input, plan 57-08 clearEnv and gate, the /etc/nixos module (CF-15)
- [x] 59-03-PLAN.md — lane: the 11 close-out defects, WINDOWS.md 27-43 (999.28-999.31)
- [x] 59-04-PLAN.md — dev build, lane launch and merges, OWNER-PASS sections 1-5 and 13 (CF-01..CF-04, CF-12)

**Wave 2** *(blocked on Wave 1 completion)*
- [ ] 59-05-PLAN.md — D-12 push, OWNER-PASS sections 6-10 and 12, first Linux release, TEL-13 for Linux (CF-05..CF-09, CF-11)
- [ ] 59-06-PLAN.md — 41-item v1.5 checklist and verify-work 29/30/31 (CF-17)

**Wave 3** *(blocked on Wave 2 completion)*
- [ ] 59-07-PLAN.md — Stage F, --gate, D-09 re-dating, CF-13, v1.6 close-out and tag, final push (CF-10, CF-13, CF-16, CF-18, CF-19)

### Phase 60: Orca from source on Theia's Node

**Goal**: PowerBrowser builds orcad and Orca's web client from source at the pinned Orca tag, orcad starts slot-less on Theia's Node 24.19.0 with no second runtime, and the Claude Code extension is proven or disproven on Theia 1.76 against an Orca worktree.
**Depends on**: Phase 59 by execution order only (first Orca phase; builds on main's tree)
**Requirements**: RUN-01, RUN-02, OVL-04, EXT-01
**Success Criteria** (what must be TRUE):
  1. From a Nix dev shell carrying pnpm 12.14.0, one script fetches Orca at the tag pinned in `configuration.toml` and runs Orca's own `build:orcad` and `build:web`. A `--quick` row derives the pin from `configuration.toml` and goes red when the fetched tree or the generated files name a different tag; its `--self-test` plants a mismatched tag.
  2. The built orcad starts with no slot runtime marker files on Theia's Node 24.19.0, prints its ready line and answers on loopback, and a check derives the Node runtimes in the build output and finds exactly one. If 1.4.248 fails this probe, the pin falls back to 1.4.245 (D-04) and the result is recorded.
  3. `node scripts/scan-brand-residue.mjs` exits 0 over the staged tree including every Orca-related file, with the "Orca" token classified only in `inventory/brand-tokens.json`, and Orca's MIT licence has a row in the licence allow-list.
  4. The user opens a folder orcad created as an Orca worktree in PowerBrowser's Theia, and the Claude Code VS Code extension starts a session there, answers a prompt and edits a file. The outcome and the extension version are recorded; a failure reshapes EXT-02 (Phase 63) before that phase is planned.

**Plans**: 4/5 plans executed

Plans:
**Wave 1**
- [x] 60-01-PLAN.md — pin in configuration.toml through the generator, fetch-orca.sh, .#orca shell, orca-pin rows, pnpm legitimacy checkpoint (RUN-01)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 60-02-PLAN.md — first real build (Wave 0), build-orca.sh with de-slot, orca-build-shape rows, docs/BUILD.md Orca half (RUN-01, RUN-02)

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 60-03-PLAN.md — slot-less orcad on Node 24.19.0 with web-tab pairing, orca-slotless-start rows, D-04 fallback decision (RUN-02)

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 60-04-PLAN.md — licence allow-list row and check, strict orca brand probe on the tracked tree (OVL-04)
- [ ] 60-05-PLAN.md — Claude Code extension on an Orca worktree in Theia 1.76, Chris's live check and record (EXT-01)

### Phase 61: Spikes for pane hosting, browser parity and live sharing

**Goal**: The three design questions the remake depends on have measured answers backed by runnable prototypes, so Phases 63, 64 and 66 build a chosen route rather than an assumed one.
**Depends on**: Phase 60 (the pane-hosting spike needs the source build; the browser-parity and live-sharing spikes can start at once on spike 003's harness)
**Requirements**: TAB-03, BRW-01, EXT-03
**Success Criteria** (what must be TRUE):
  1. A prototype mounts at least one Orca pane component inside a Lumino widget in PowerBrowser's dock with a single React 19.2.8 copy. A pane opened in Orca's client appears as a new Lumino tab because PB observes the client's layout state read-only (the renderer owns layout in shipped builds, D-15). The decision record names:
     - the route: Orca's client in Theia's document, or one iframe per pane;
     - the measured answers on cross-origin WebSocket to orcad, CSS isolation and memory per pane;
     - the seam patches the route needs, which must fit the D-16 cap.
  2. The browser-parity record lists every ability an Orca browser tab has, derived from Orca's source at the pin by a script that a re-pin can re-run. For each ability it names the Orca component that uses it (agent, CLI, renderer or orcad) and gives a Gecko disposition (WebDriver BiDi, BiDi plus PB code, chrome actor, native, or impossible). It chooses the provider seam and answers `research/FEATURES.md` questions 1-8.
  3. The live-sharing record states, with evidence from a run, whether a running Orca agent can be shared live inside the Claude Code extension. It also shows the floor working: a stopped Orca agent session resumed in the extension with `--resume`.
  4. Before any of Phases 63, 64 and 66 is planned, this roadmap names the route each spike chose for it, or that phase is split or descoped by an owner decision.

**Plans**: 4/4 plans executed

- [x] 61-01-PLAN.md — lane: spike 004, pane hosting (Routes A, B, B'), VERDICT YELLOW
- [x] 61-02-PLAN.md — lane: spike 005, browser parity (S2, parity row), VERDICT YELLOW
- [x] 61-03-PLAN.md — lane: spike 006, live sharing (the --resume floor), VERDICT YELLOW
- [x] 61-04-PLAN.md — coordinator: merges, route lines for Phases 63, 64, 66, MANIFEST, skill wrap-up

### Phase 62: Overlay gate and PowerBrowser-run orcad

**Goal**: PowerBrowser starts, supervises and stops its own orcad with its own profile and a scrubbed environment, and every change PB makes to Orca is held to the additive overlay by a check.
**Depends on**: Phase 60 (can run beside Phase 61)
**Requirements**: OVL-01, OVL-05, RUN-03, RUN-04, RUN-05
**Success Criteria** (what must be TRUE):
  1. Launching PowerBrowser starts orcad through `OrcaService`, a consumer of the `PowerBrowserAPI` boundary whose touchpoints are catalogued in `INTERNAL-APIS.md`. orcad binds loopback on the fixed port, with data root `powerbrowser-orca` in both `ORCA_USER_DATA` and `ORCA_USER_DATA_PATH`, telemetry off, and `*.onorca.dev` on the egress allowlist. A check reads the running orcad's environment and compares it to the allowlist as a set, so an inherited `ORCA_*` variable or a missing profile variable goes red.
  2. A decoy Orca desktop is installed where stock orcad looks for one. The self-test first proves that stock orcad launches the decoy, then PB's orcad completes a browser request without launching it.
  3. Quitting PowerBrowser stops orcad and every agent process it started: the check records the process tree before quit and finds none of those PIDs after. After PowerBrowser is killed, the next launch reaps the stale lock and state and starts orcad on the same port.
  4. A `verify-platform.sh` row records each declared seam's upstream blob. It goes red on a whole-file replacement of an upstream Orca path, on an undeclared seam, or on a seam count over the cap; its `--self-test` plants each fault and requires each to go red naming it.
  5. The same gate derives the list of PB-added overlay files from the tree. It goes red on any file that shadows an upstream path at the pin, or that Orca's `build:web` or `build:orcad` does not compile.

**Plans**: 3/3 plans executed

Plans:
**Wave 1**
- [x] 62-01-PLAN.md — lane p62-01: orca-overlay/ with the one RUN-04 seam, build-orca.sh hook, overlay gate with self-test and three rows, build-shape seam coexistence, [orca] seam_cap (OVL-01, OVL-05, RUN-04)
- [x] 62-02-PLAN.md — lane p62-02: OrcaService on a pure OrcaEnv, PowerBrowserProcesses boundary methods, launch wiring, .onorca.dev row, orca-service / hidden-Electron / live checks (RUN-03, RUN-04, RUN-05)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 62-03-PLAN.md — coordinator: merge 62-01 then 62-02, rebuild Orca and PowerBrowser, live proofs of criteria 1-5, brand rows re-measured, tracking

### Phase 63: Agent hooks on Orca's terminal engine

**Goal**: Orca's terminals run on Orca's own engine beside Theia's own terminals, agents started by Orca or by the Claude Code extension report live status in Orca, and agents and Orca's terminal daemon end when PowerBrowser quits.
**Depends on**: Phase 62 (supervised orcad and its stop path); Phase 60 (EXT-01 outcome); Phase 61 (live-sharing record)
**Requirements**: TERM-02, EXT-02
**Rescoped by D-31 (Chris, 2026-11-10)**: Orca terminals use Orca's own engine (orcad's stock PTY provider and terminal daemon) and Orca's own terminal view, side by side with Theia terminals. The Phase 63 bridge that ran Orca on Theia's terminal engine (seams 020 and 030, the external PTY bridge, `@powerbrowser/orca-terminals`, `o<n>` tabs) is dropped. The display of Orca terminals (TERM-01) and their key policy (TERM-04) move to Phase 64. TERM-03 (SSH and paired-server terminals) is deferred to v2: headless orcad at 1.4.248 has no SSH stack and no paired-server relay (Electron main only, 64-RESEARCH A1).
Route chosen by Phase 61: agent sessions run the plain `claude` CLI in a terminal (an Orca terminal after D-31), reopened on demand with `claude --resume <session id>` (the P61-07 fallback), with the session id taken from Claude's side (`claude agents --json` or the session file name; `orca terminal list --json` does not expose it); no live share inside the extension and no `--bg`/`claude attach` launch is built, as 63-CONTEXT P63-16 adopted (spike 006, verdict YELLOW)
**Success Criteria** (what must be TRUE):
  1. PowerBrowser's orcad runs Orca's own terminal engine: the overlay carries only seam 010 and no terminal seam (`orca-overlay`, `orca-build-shape`), orcad reports its terminal daemon live, and a terminal created through Orca's CLI runs under that daemon. Theia's own terminals are unchanged.
  2. An agent Orca starts (Claude Code at least) runs in an Orca terminal with Orca's `ORCA_*` hook environment, whose names a check derives from the pinned source and reads from the PTY's environment, and Orca's status for it moves through working, waiting and done as the agent runs.
  3. A Claude Code extension session on an Orca worktree appears in Orca with live hook status, through a pane PB's wrapper creates with `terminal.create` and the `ORCA_AGENT_HOOK_*` variables it passes. The wrapper finds orcad's data root through `orcad-data-root`, a file that is 0600 from creation in PowerBrowser's 0700 bridge folder. The extension half runs with EXT-01 in the end-of-milestone pass.
  4. Quitting PowerBrowser ends every agent, orcad and Orca's terminal daemon: the checks record those processes before the quit and find none of them after (D-07; Phase 62's stop path).

**Plans**: 3/3 plans executed (3 more superseded by D-31)

Plans:
**Wave 1**
- [x] 63-06-PLAN.md — lane p63-06: the bridge folder rebuilt from p63-05's kept parts (OrcaEnv bridgeDirFor, writePrivateFile with no umask window, platform(), orcad-data-root, TheiaService's POWERBROWSER_ORCA_BRIDGE_DIR), orca-bridge-dir, orca-service clauses (EXT-02)
- [x] 63-03-PLAN.md — lane p63-03 (amended by D-31): @powerbrowser/orca-agents (claude wrapper, launcher, preference default), orca-agent-hooks and orca-agent-status-live on Orca's engine with a quit stage (TERM-02, EXT-02)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 63-04-PLAN.md — coordinator (replaced by D-31): merge p63-06 then p63-03, wire orca-agents, rebuild Theia, Orca and PowerBrowser, hook and real-agent live proofs, orca-service-live (D-07), brand rows, superseded stubs, tracking (TERM-02 complete only on a live PASS)

**Superseded by D-31** *(not executed, not merged; lane branches kept as the record)*
- 63-01-PLAN.md — lane p63-01: seams 020/030 and the external PTY bridge client
- 63-02-PLAN.md — lane p63-02: @powerbrowser/orca-terminals, o<n> tabs, key passthrough
- 63-05-PLAN.md — lane p63-05: the chrome half of the PTY bridge (its kept parts are 63-06)

### Phase 64: Orca panes as PowerBrowser tabs

**Goal**: The Orca mode shows Orca's work as PowerBrowser tabs. Each Orca pane is one Lumino tab that moves between modes and can be organised like any Theia or browser tab.
**Depends on**: Phase 61 (pane-hosting route); Phase 63 (the bridge folder, `writePrivateFile` and orca-agents from the 63-04 merge)
**Requirements**: TAB-01, TAB-02, TAB-04, TAB-06, TERM-01, TERM-04
**Terminals after D-31 (Chris, 2026-11-10)**: every Orca terminal is a hosted pane mounting Orca's own `TerminalPane` (xterm.js) on Orca's engine, the route research already mounted for a local terminal; terminals are created only through orcad's `terminal.create`, never the client's `createNewTerminalTab` (64-RESEARCH A4). Theia terminals stay plain Theia terminals beside them. The remote terminal route stays dropped (TERM-03 is v2). Picks: 64-CONTEXT P64-30..P64-36.
Route chosen by Phase 61: Route A, Orca pane components in a Theia ReactWidget on Theia's own React with Orca's stylesheet scoped to the pane root; observation channel useAppStore.subscribe in the Theia document (read-only, close by the store's closeTerminalTab); seam patches 0 of about ten; fallback Route B' (one PB web tab per pane page), which is also the route for browser panes. (spike 004, verdict YELLOW)
**Success Criteria** (what must be TRUE):
  1. An "Orca" mode appears beside Coding in `SHIPPED_MODES` and the chrome bar, and selecting it shows Orca's work.
  2. Each Orca pane opened by the user or an agent appears as its own tab in PowerBrowser's dock and appears as an Organising row. It can be split, and dragged to any other mode and back. Orca's in-tab splits and tab groups appear as Lumino splits; Orca's own tab bar and tab groups are not rendered.
  3. Chat, and every other Orca-only view inventoried by the Phase 61 spike, opens as its own PowerBrowser tab.
  4. A check derives Orca's tab content types from the pinned source and compares them as a set to PB's pane-to-tab mapping (hosted Orca pane, Theia editor or PB web tab), so a content type added upstream goes red naming it.
  5. `pb-orca:` URIs are documented in `docs/URI-SCHEMES.md` and round-trip in `verify-uri-roundtrip.mjs`, and `verify-registry-shape.mjs` passes with `TabUriRegistry`'s exported shape unchanged.
  6. Every Orca terminal, whether opened by the user, an agent, Orca's CLI or the EXT-02 wrapper, is a PowerBrowser tab showing Orca's own terminal view (`TerminalPane`, xterm.js) on Orca's engine; it accepts input and shows output, and an Orca in-tab split appears as Lumino splits. Theia's own terminals stay plain Theia terminals beside them (TERM-01).
  7. In an Orca terminal tab, Ctrl+W, Ctrl+T, Ctrl+Tab and Ctrl+PageUp/PageDown reach the terminal program; in a Theia terminal, a web tab and every other tab the same keys run PowerBrowser's tab commands, each effect equal to a control measured in the same session. A check derives the key set from the chrome's reserved page keys and compares it with the passthrough rows as a set (TERM-04).

**Plans**: 5 plans (4 lanes and a coordinator; lanes branch after the 63-04 merge)

Plans:
**Wave 1**
- [ ] 64-01-PLAN.md — lane p64-01: the Orca pane bundle (overlay entry, app-mode ES build on Theia's React, build-orca-panes.sh), the isolated per-leaf terminal mount measured first, standalone mounts, CSS scoping with the derived html clause (TAB-04, TAB-06, TERM-01)
- [ ] 64-02-PLAN.md — lane p64-02: @powerbrowser/orca-panes (gated bundle route and offer RPC, loader, OrcaPaneWidget, route table, observer and placement, Orca's close, pb-orca: opener and reverse lookup, two commands, terminal key rows), URI doc, orca-pane-routes (TAB-02, TAB-04, TAB-06, TERM-01, TERM-04)
- [ ] 64-03-PLAN.md — lane p64-03: the Orca mode with the IDE dress, the offer and bundle-folder files in the bridge folder (TAB-01, TAB-04)
- [ ] 64-04-PLAN.md — lane p64-04: hosted-tab live proofs (orca-tabs-live, orca-terminal-keys and -live ported, pb-orca: round trip, Orca seeds in the mode-switch walk) (TAB-02, TAB-04, TAB-06, TERM-01, TERM-04)

**Wave 2** *(blocked on Wave 1 completion)*
- [ ] 64-05-PLAN.md — coordinator: merge p64-01..p64-04, wire orca-panes, rebuild, CSS isolation proven first on the merged tree, live proofs, brand rows, tracking by requirement outcome
**UI hint**: yes

Editor, diff and browser-page panes reach the dock through this phase's mapping. Their targets are delivered by TAB-05 (Phase 65) and BRW-02 (Phase 66).

### Phase 65: Orca workspace in Theia

**Goal**: Orca's workspace works inside PowerBrowser's Theia: files and diffs open in Theia's editor with worktrees as workspace folders, Orca's sidebar, settings and orchestration panel live in a side panel, Orca's own Add-project flow is kept, and a restored Setup brings Orca tabs back connected.
**Depends on**: Phase 64
**Requirements**: TAB-05, TAB-07, TAB-08, TAB-09
**Success Criteria** (what must be TRUE):
  1. Opening a file or a diff from Orca opens it in Theia's editor or diff editor, and each Orca worktree is a Theia workspace folder. The pane-to-tab mapping routes every editor-type content type to Theia, so Orca's own editor is never mounted.
  2. Orca's worktree sidebar, settings and orchestration panel open in a PowerBrowser side panel and behave as in Orca. The overlay gate stays green, and every modification is additive.
  3. Orca's Add-project flow adds a project and the sidebar remove removes it, as in stock Orca. A check over PB's contributed commands and toolbar items finds no PB Add-project control.
  4. After quitting and relaunching, restoring a Setup reopens its Orca tabs in their modes and splits, connected to the new orcad pairing with no user step. The stored Setup is scanned for the live offer and holds none; the scan's self-test plants the offer and goes red.

**Plans**: TBD
**UI hint**: yes

### Phase 66: PowerBrowser web tabs as Orca's browser

**Goal**: Orca's agents and the user browse in PowerBrowser web tabs with PowerBrowser chrome. Agent control reaches only Orca-created tabs, and the user can see it and stop it.
**Depends on**: Phase 61 (browser-parity route and seam); Phase 64; Phase 65 (lanes launch after the 65-05 coordinator merge; execution order 64 → 65 → 66)
**Requirements**: BRW-02, BRW-03, BRW-04, BRW-05
Route chosen by Phase 61: S2, a PB runtime client that attaches through browser.clientHost.attach with no Orca patch, building the tier-1 set of 50 abilities (25 BiDi, 9 BiDi+, 14 native, 1 actor for snapshot, exec as a documented subset); S1 (a 13-line provider-kind patch) stays the fallback. (spike 005, verdict YELLOW)
**Success Criteria** (what must be TRUE):
  1. A browser page Orca or an agent opens is a PowerBrowser web tab with PB's chrome bar, address field and history. A check derives Orca's browser-pane entry points from the pinned source and proves each routes to a PB web tab, so the stock screencast pane is never shown.
  2. An Orca agent navigates, clicks, types and takes a screenshot in a PB web tab through the chrome-side bridge, and a request naming a tab Orca did not create is refused. A check lists the shipped build's listening sockets and finds no WebDriver BiDi port; its self-test enables the Remote Agent and goes red.
  3. While an agent drives a tab, PB's Theia chrome bar shows an "agent is controlling this tab" mark with a Stop button, and Stop ends that control. A stock browser window shows no mark.
  4. Each user-facing tool in the Phase 61 browser inventory is reachable from PB's chrome bar or a Theia side panel. A check compares the inventory's user-facing rows to PB's contributions as a set.

**Plans**: 6 plans (executes only after Phase 64 is merged)

Plans:
**Wave 1**
- [ ] 66-01-PLAN.md — lane p66-01: thin browser host built by Orca's Vite from overlay files, pane-bundle link for one device and client placement (A3), orca-browser-host-bundle (BRW-02, BRW-03)
- [ ] 66-02-PLAN.md — lane p66-02: @powerbrowser/orca-browser (client host, page table, dispatcher, 92-row ability table), orca-panes browser row, web-tab.ts agent option, push and parking box, orca-browser-abilities / orca-browser-entry-points (BRW-02, BRW-03)
- [ ] 66-03-PLAN.md — lane p66-03: chrome-side agent bridge (flag, wall, 40 methods native or PowerBrowserAgent child, parking, container, dialogs, mark state and Stop), A2 allowance, orca-browser-tab-scope, no-remote-agent-port-live, privacy paragraph (BRW-03, BRW-04)

**Wave 2** *(each lane builds on its wave-1 parent lane's branch)*
- [ ] 66-04-PLAN.md — lane p66-04 on p66-03: snapshot in the agent child, refs and delta, agent-browser 0.39.4 fixtures, orca-browser-snapshot-live / orca-snapshot-fixtures (BRW-03)
- [ ] 66-05-PLAN.md — lane p66-05 on p66-02: chrome-bar mark and Stop, copy rows, tools map with orca-browser-tools, live rows orca-browser-agent-live and orca-agent-mark-live (BRW-02..BRW-05)

**Wave 3** *(blocked on Waves 1-2)*
- [ ] 66-06-PLAN.md — coordinator: merge 01..05 in order, rebuild Orca, Theia and PowerBrowser, cross-lane clauses compared, live proofs of criteria 1-4, brand rows, tracking and owner items

**UI hint**: yes

The Phase 61 parity result may split or descope this phase. Any such change is an owner decision recorded in `DECISIONS.md`.

### Phase 67: Hosting hardening

**Goal**: Orca hosting fails in PowerBrowser's own words and keeps its secrets. Failures show a PB page, the pairing offer stays contained, the sidecar is Origin-gated, an insecure credential store is refused, and the landing page shows the PB logo.
**Depends on**: Phase 64 (real Orca tabs to fail, contain and inject into); ordered after Phase 66 by D-05
**Requirements**: RUN-06, RUN-07, RUN-08, RUN-09, INJ-01
**Success Criteria** (what must be TRUE):
  1. When orcad dies, its port is taken or pairing is lost, each open Orca tab shows a page that names PowerBrowser, states the problem plainly and offers a next step that works on screen. Every identifier the page omits appears as a diagnostics row, and `shell-error-copy-no-internals` stays green.
  2. A check reads the pairing offer orcad issued and scans history, session restore, logs, the address field and copyable text for it, and finds none. Its `--self-test` plants the offer in each sink and goes red naming that sink.
  3. A request to the Theia sidecar from a page whose Origin is not one of PowerBrowser's own (orcad's or any other loopback page) is rejected, and PB's own pages are still served. The self-test sends a foreign Origin and a PB Origin and requires the opposite outcome for each.
  4. Starting Orca with a temp-directory data root, or with the plaintext secret-store override, is refused with a PowerBrowser message. PB copy states that protection is a same-user key file, not an OS keyring.
  5. Orca's landing page shows the PowerBrowser logo through a JSWindowActor gated on the orcad origin and catalogued in `INTERNAL-APIS.md`. The selector list for the pinned Orca version is checked against the built client, so a selector that no longer matches goes red.

**Plans**: TBD
**UI hint**: yes

### Phase 68: Three-OS artifacts, weekly re-pin and upstream seams

**Goal**: The Orca integration ships in Linux, macOS and Windows artifacts and passes live checks on Linux. An automated weekly re-pin keeps it current with Orca releases, and the stock mobile app still pairs.
**Depends on**: Phases 64 and 66 (each generic seam works before it is offered upstream; Phase 63 lands no seam after D-31); all earlier phases for the artifacts
**Requirements**: OVL-02, OVL-03, OVL-06, PLAT-01, PLAT-02, BEXT-01, BEXT-02
**Success Criteria** (what must be TRUE):
  1. The release-train clock dispatches the re-pin job weekly (no `schedule:` key, D-77). The job:
     - moves the pin to the newest Orca tag and re-applies the seam patches;
     - runs Orca's `typecheck:web` and `typecheck:node` over PB's added files, and the brand scan;
     - re-pins by itself when green, and stops with a report for a human on a conflict.

     A planted conflict and a planted type error each stop it.
  2. A check confirms the overlay touches none of orcad's mobile-facing protocol files (pairing relay, runtime RPC). The stock Orca mobile app pairs with PB's orcad, and the report states the pin lag against the current stock app.
  3. The browser provider and extra web entry seams each have a pull request open against Orca upstream, linked from the seam table (the terminal provider seam was dropped by D-31). PB's build does not depend on their acceptance.
  4. Linux, macOS and Windows artifacts contain orcad and the overlaid client, with the node-pty prebuild built per target on that target's own runner. The Flatpak manifest grants `--filesystem=home`. Each of these checks is one `verify-platform.sh` row.
  5. The live checks pass on Linux. macOS and Windows smoke results are recorded when a host is available (D-24).

**Plans**: 10 plans

Plans:
**Wave 1** *(executable now; seven lanes in parallel)*
- [ ] 68-01-PLAN.md — lane p68-01: Orca in the Linux and macOS artifacts (build-linux Orca step, macos-orca-arm64/x64/universal, package-linux.sh and package-macos.sh <GreD>/orca staging, host-root grep), portable build-orca.sh, orca-packaged-tree, magic natives, Flatpak --filesystem=home, build-linux --rulings guard, release-shape (no Linux job needs a Windows job with this lane alone), packaged-live check written (PLAT-01, PLAT-02)
- [ ] 68-10-PLAN.md — lane p68-10: Orca in the Windows artifact (windows-orca, build-windows needs, --rulings guard and admission, package-windows.sh staging), win-sign-list and the @ zip filter, win-sign-chain, build-windows-shape over the producer list, staged-Node path in OrcaService and TheiaService, INTERNAL-APIS lines; shares release.yml with 68-01 (other jobs) and OrcaService.sys.mjs with 68-07 (_resolve only) (PLAT-01)
- [ ] 68-02-PLAN.md — lane p68-02: weekly re-pin: rebase-orca.yml and rebase-orca.sh (--replay-only, fixture self-test), orcaDue, --orca-select, detect-orca, bump-pr-orca with auto-merge, tracking issue, orca-slotless-start --orcad-only (OVL-02)
- [ ] 68-03-PLAN.md — lane p68-03: orca-mobile-protocol and orca-mobile-skew, seams.json upstream key and --upstream-prs, export-orca-seam-pr.mjs (OVL-03, OVL-06)
- [ ] 68-04-PLAN.md — lane p68-04: bundle-derived Orca licence notices, per-package rule, agent SDK as ruling 68-A status extension (D-30; red until 68-07 and 68-09 merge) with the owner terms check pending, permissive set pending 68-B, orca-licence-rulings (PLAT-01)
- [ ] 68-07-PLAN.md — lane p68-07: Claude agent SDK out of orcad (externals seam), loadClaudeAgentSdk reads ORCA_CLAUDE_AGENT_SDK_DIR, OrcaService points it at the extension unless Theia has it disabled, orca-claude-sdk rows; shares OrcaService.sys.mjs with 68-10 (_spawnAndGate only) (BEXT-01)
- [ ] 68-09-PLAN.md — lane p68-09: the pre-installed, removable Claude Agent SDK Theia extension: bundled-extensions/claude-agent-sdk, download-plugins assembly into plugins/.user, @powerbrowser/bundled-extensions seed participant, bundled-extensions rows (BEXT-01)

**Wave 2** *(coordinator-launched lanes: launched_by: coordinator in each plan's frontmatter; never started by an executor on its own; 68-06 launches each and waits for its SUMMARY)*
- [ ] 68-08-PLAN.md — lane p68-08, launched by 68-06 Task 1 after the 68-01, 68-10, 68-04 and 68-09 merges (Phase 67 not needed): uBlock Origin pre-installed through distribution/extensions (pinned AMO-signed XPI, staging in the three package scripts), filter-list hosts allowlisted, live install/filter/relaunch/disable/remove proof, Bundled extensions notices and inventory rows (BEXT-02)
- [ ] 68-05-PLAN.md — lane p68-05, launched by 68-06 Task 2 after Phase 67 and Task 1's last commit: final seam classes, upstream tests and descriptions, one export per D-27 class, orca-upstream-prs, owner hand-off (OVL-06)

**Wave 3** *(coordinator; starts when the seven wave-1 SUMMARYs exist, finishes after 68-08 and 68-05 merge)*
- [ ] 68-06-PLAN.md — coordinator: merge 03, 04, 01, 10, 07, 09, 02, then launch and merge 08 (Task 1), then after Phase 67 launch and merge 05 (Task 2; seams.json and verify-platform.sh ordering by its merge rule (7)), identity re-pin, brand rows, container package, orca-packaged-live, PLAT-02 Linux pass, WINDOWS.md entries, tracking

Open items for this phase:
- The macOS half of PLAT-01 needs a macOS PowerBrowser build. v1.6 deferred macOS packaging (workstream `deploy`, Phase 55).
- Who opens the upstream pull requests, and under which GitHub org, is an owner question. The org is moving to `deocracy`.
- Pairing the stock mobile app needs an Android device. Protocol skew between a newer stock app and the pinned orcad is a recorded risk (D-29).
- Windows signing never blocks Linux.
- The owner confirms that Anthropic's terms permit redistributing the Claude Agent SDK extension (D-30); until then the release guard stays closed. The owner's reading of GPL-3.0 section 6 for the bundled uBlock Origin XPI is also open (P68-39).

## Progress

**Execution Order:**
Phases execute in numeric order: 59 → 60 → 61 → 62 → 63 → 64 → 65 → 66 → 67 → 68. Phase 62 can run beside Phase 61, and Phase 67 depends only on Phase 64, but it follows Phase 66 by D-05.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 59. Carry-forward from v1.5 and v1.6 | 5/8 | In Progress | - |
| 60. Orca from source on Theia's Node | 4/5 | In Progress | - |
| 61. Spikes for pane hosting, browser parity and live sharing | 4/4 | Complete (human items deferred) | 2026-11-10 |
| 62. Overlay gate and PowerBrowser-run orcad | 3/3 | Complete | 2026-11-09 |
| 63. Agent hooks on Orca's terminal engine | 3/3 | Executed, verify-work pending (rescoped by D-31; 3 plans superseded) | - |
| 64. Orca panes as PowerBrowser tabs | 0/5 | Planned (lanes after the 63-04 merge) | - |
| 65. Orca workspace in Theia | 0/TBD | Not started | - |
| 66. PowerBrowser web tabs as Orca's browser | 0/6 | Planned | - |
| 67. Hosting hardening | 0/TBD | Not started | - |
| 68. Three-OS artifacts, weekly re-pin and upstream seams | 0/TBD | Not started | - |
