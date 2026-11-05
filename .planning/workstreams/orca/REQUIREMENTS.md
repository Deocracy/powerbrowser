# Requirements: Power Browser — milestone v1.7 Orca integration

**Defined:** 2026-11-04
**Core Value:** Theia is the default GUI; Orca's agent workflow runs inside PowerBrowser as real
PowerBrowser tabs, with PowerBrowser's own engine and chrome as the agents' browser.

Owner decisions are in `DECISIONS.md` (D-01..D-25) and win over `research/`. Research feature ids
(T-n, D-n in `research/FEATURES.md`) are cited where a requirement comes from them.

## v1 Requirements

### Orca runtime (RUN)

- [ ] **RUN-01**: PowerBrowser builds orcad and the Orca web client from source at a pinned Orca
  tag (first pin 1.4.248, fallback 1.4.245) with Orca's own `build:orcad` and `build:web` from a
  Nix dev shell carrying pnpm 12.14.0; the pin lives in `configuration.toml` and a `--quick`
  check proves it. (D-04)
- [ ] **RUN-02**: orcad runs slot-less on Theia's Node 24.19.0; no second Node runtime is
  shipped. (D-14)
- [ ] **RUN-03**: PowerBrowser spawns orcad through an `OrcaService` consumer of the
  `PowerBrowserAPI` boundary and a supervisor: loopback bind, fixed port, data root
  `powerbrowser-orca` set through both `ORCA_USER_DATA` and `ORCA_USER_DATA_PATH`, an
  allowlisted environment that scrubs inherited `ORCA_*`, telemetry off, and `*.onorca.dev` on
  the egress allowlist. (T-2, T-10, D-08)
- [ ] **RUN-04**: PowerBrowser's orcad never finds and launches an installed Orca desktop as a
  hidden Electron browser engine. (D-10)
- [ ] **RUN-05**: Quitting PowerBrowser stops orcad and every agent it started; stale state is
  reaped on the next launch. (D-07 revised)
- [ ] **RUN-06**: When orcad dies, its port is taken or pairing is lost, the user sees a
  PowerBrowser page in PowerBrowser copy with a real next step; every identifier the message
  omits appears as a diagnostics row. (T-6)
- [ ] **RUN-07**: The pairing offer never appears in history, session restore, logs, the
  address field or copyable text. (T-3, spike 003)
- [ ] **RUN-08**: The Theia token gate rejects sidecar requests whose Origin is not one of
  PowerBrowser's own pages. (D-17)
- [ ] **RUN-09**: A credential-storage check refuses a temp-directory data root and the
  plaintext secret-store override, and PowerBrowser copy states that protection is a same-user
  key file, not an OS keyring. (T-8)

### Overlay and re-pin (OVL)

- [ ] **OVL-01**: Orca changes are an additive overlay: new PowerBrowser files plus
  one-to-few-line regenerated patches at declared seams. A check records each seam's upstream
  blob and goes red on a whole-file replacement of an upstream path, an undeclared seam, or a
  seam count over the cap. (D-04, D-16)
- [ ] **OVL-02**: An automated weekly rebase job re-pins to the newest Orca tag, the same
  shape as `rebase-upstream`: it re-applies the seam patches, runs Orca's `typecheck:web` and
  `typecheck:node` over PowerBrowser's added files, and the brand scan; green re-pins by itself,
  a conflict stops for a human. (D-04, D-26)
- [ ] **OVL-03**: orcad's mobile-facing protocol (pairing relay, runtime RPC) is unmodified, and a
  check proves the stock Orca mobile app pairs with PowerBrowser's orcad and reports the pin lag
  against the current stock app. (D-23)
- [ ] **OVL-04**: "Orca" is classified only in `inventory/brand-tokens.json`; Orca's licence has a
  row in the licence allow-list; the brand scan stays green over the overlay.
- [ ] **OVL-05**: The PowerBrowser pane entry and the PTY and browser providers are new files
  only, compiled by Orca's own `build:web` and `build:orcad`. (D-04)
- [ ] **OVL-06**: The terminal provider, browser provider and extra web entry seams are offered
  to Orca upstream as pull requests once each works in PowerBrowser. (D-27)

### Terminals (TERM)

- [ ] **TERM-01**: All terminals are Theia terminals. orcad gets a Theia-backed `IPtyProvider`
  for the local execution host implementing all 21 required members (spawn, write, resize, kill,
  data, serialize/revive, buffer snapshots, foreground-process queries, listProcesses and the
  rest) and satisfying orcad's node-pty startup probe; Orca's terminal daemon is not used.
  (D-01, D-28)
- [ ] **TERM-02**: Agent sessions Orca starts run in Theia terminal tabs with Orca's
  `ORCA_*` hook environment passed through, so agent status hooks keep working. (D-06, D-13)
- [ ] **TERM-03**: Orca's SSH and paired-server execution hosts keep working through orcad and
  display in Theia terminal tabs. (D-20)
- [ ] **TERM-04**: Inside an Orca terminal tab, Ctrl+W, Ctrl+T, Ctrl+Tab and
  Ctrl+PageUp/PageDown go to the terminal; PowerBrowser's tab shortcuts work everywhere else.
  (D-09)

### Tabs and modes (TAB)

- [ ] **TAB-01**: An "Orca" mode appears beside Coding in `SHIPPED_MODES` and the chrome bar.
  (T-1)
- [ ] **TAB-02**: `pb-orca:` URIs follow `docs/URI-SCHEMES.md`, round-trip in
  `verify-uri-roundtrip.mjs`, and leave `TabUriRegistry`'s exported shape unchanged. (T-4)
- [ ] **TAB-03**: A spike shows how PowerBrowser's dock observes the client's layout state
  (the renderer owns it in shipped builds) and how Orca's pane components mount inside Lumino
  widgets. (D-15)
- [ ] **TAB-04**: One Orca pane equals one Lumino tab: every Orca pane (terminal, agent
  session, editor, diff, browser page, chat and other Orca-only views) is a tab in PowerBrowser's
  dock, moves between all modes and appears as an Organising row; Orca's in-tab splits and tab
  groups are flattened into Lumino splits. (D-01, D-15, T-5)
- [ ] **TAB-05**: Files and diffs open in Theia's editor, with Orca worktrees opened as Theia
  workspace folders; Orca's own editor is not used. (D-01)
- [ ] **TAB-06**: Chat and the other Orca-only views each open as their own PowerBrowser tab.
  (D-01)
- [ ] **TAB-07**: Orca's worktree sidebar, settings and orchestration panel live in a
  PowerBrowser side panel; modifications are additive only. (D-02, D-16)
- [ ] **TAB-08**: Setups restore re-pairs Orca tabs and never persists the pairing offer. (T-5)
- [ ] **TAB-09**: Orca's own Add-project flow and sidebar remove behave as in Orca; PowerBrowser
  adds no separate Add-project button. (D-18, T-7)

### Browser replacement (BRW)

- [ ] **BRW-01**: A browser-parity spike reconciles Orca's browser inventory against Gecko,
  chooses the seam, and answers `research/FEATURES.md` questions 1-8. (direction note)
- [ ] **BRW-02**: Each Orca browser page is a PowerBrowser web tab with PowerBrowser chrome; the
  stock screencast pane and its dead entry points are never shown. (T-9, D-1)
- [ ] **BRW-03**: Orca agents drive PowerBrowser web tabs through a chrome-side bridge that can
  reach only Orca-created tabs; no WebDriver BiDi TCP port in shipped PowerBrowser. (D-11)
- [ ] **BRW-04**: While an agent drives a tab, PowerBrowser's Theia chrome bar shows an
  "agent is controlling this tab" mark with a Stop button; stock browser windows are unchanged.
  (D-19, D-2)
- [ ] **BRW-05**: The user-facing tools Orca's browser offers, as the spike inventories them,
  are added to PowerBrowser's chrome bar or Theia side panels.

### Claude Code extension (EXT)

- [ ] **EXT-01**: The Claude Code VS Code extension runs on Theia 1.76 on Orca worktrees;
  checked in the first build phase. (D-06.1)
- [ ] **EXT-02**: Extension sessions are visible in Orca: PowerBrowser registers a pane per
  session and passes the `ORCA_AGENT_HOOK_*` variables. (D-06.2)
- [ ] **EXT-03**: A spike researches live sharing of a running Orca agent inside the extension;
  resuming a stopped session is the floor. (D-06.3)

### Injection (INJ)

- [ ] **INJ-01**: The landing logo becomes the PowerBrowser logo through a JSWindowActor gated on
  the orcad origin, with a catalogue row in `INTERNAL-APIS.md` and a selector list per Orca
  version. (T-11)

### Platforms (PLAT)

- [ ] **PLAT-01**: Linux, macOS and Windows artifacts build orcad and the overlaid client, with
  the node-pty prebuild built per target on that target's own runner; Flatpak gets
  `--filesystem=home`; each check is a `verify-platform.sh` row. (T-12)
- [ ] **PLAT-02**: Live checks pass on Linux; macOS and Windows get a smoke test when a host is
  available. (D-24)

## v2 Requirements

Deferred; tracked, not in this roadmap.

### Mobile (MOB) — next milestone (D-21, D-22, D-23)

- **MOB-01**: Orca mobile is forked under the overlay with PowerBrowser-specific views.
- **MOB-02**: An Android APK ships on GitHub Releases.
- **MOB-03**: iOS waits on a signing decision.

### Browser extras (BRW)

- **BRW-06**: Grab and annotate from PowerBrowser chrome into an agent prompt. (D-3)
- **BRW-07**: Markup on screenshots. (D-4)
- **BRW-08**: Local dev-server tiles on the new-tab page. (D-6)
- **BRW-09**: Agents share the user's browsing profile, with consent. (D-9)

### Cosmetic (COS)

- **COS-01**: Renames, palette and About-dialog credit.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Patching Theia core | Hard rule 1; PowerBrowser code is `@powerbrowser/*` extensions |
| Custom browser chrome in the stock window | Hard rule 5; agent mark lives in the Theia chrome bar only |
| Orca's terminal daemon and agents surviving quit | D-07 revised: Theia owns the PTYs; the daemon's only purpose was survival |
| A second Node runtime for orcad | D-14: slot-less orcad needs only Node 24 |
| CDP emulation in Gecko | CDP is gone from Gecko; the bridge is native |
| Stock remote screencast browser pane | Replaced by PowerBrowser web tabs |
| Remote Agent (WebDriver BiDi port) in shipped PowerBrowser | D-11: tests and spikes only |
| Hidden Electron via installed Orca desktop | D-10 |
| Running orcad on the user's real Orca profile | Profile lock and shared hook files |
| Store publishing or Apple/Microsoft signing | 2026-11-01 rule; unchanged |
| Modifying orcad's mobile-facing protocol | D-23: the stock mobile app must keep pairing until the mobile fork |
| Overlay beyond leaf files and listed seams | D-16; deeper changes need an owner decision |

## Traceability

Filled by the roadmap.

| Requirement | Phase | Status |
|-------------|-------|--------|
| RUN-01 | Phase 59 | Pending |
| RUN-02 | Phase 59 | Pending |
| RUN-03 | Phase 61 | Pending |
| RUN-04 | Phase 61 | Pending |
| RUN-05 | Phase 61 | Pending |
| RUN-06 | Phase 66 | Pending |
| RUN-07 | Phase 66 | Pending |
| RUN-08 | Phase 66 | Pending |
| RUN-09 | Phase 66 | Pending |
| OVL-01 | Phase 61 | Pending |
| OVL-02 | Phase 67 | Pending |
| OVL-03 | Phase 67 | Pending |
| OVL-04 | Phase 59 | Pending |
| OVL-05 | Phase 61 | Pending |
| OVL-06 | Phase 67 | Pending |
| TERM-01 | Phase 62 | Pending |
| TERM-02 | Phase 62 | Pending |
| TERM-03 | Phase 62 | Pending |
| TERM-04 | Phase 62 | Pending |
| TAB-01 | Phase 63 | Pending |
| TAB-02 | Phase 63 | Pending |
| TAB-03 | Phase 60 | Pending |
| TAB-04 | Phase 63 | Pending |
| TAB-05 | Phase 64 | Pending |
| TAB-06 | Phase 63 | Pending |
| TAB-07 | Phase 64 | Pending |
| TAB-08 | Phase 64 | Pending |
| TAB-09 | Phase 64 | Pending |
| BRW-01 | Phase 60 | Pending |
| BRW-02 | Phase 65 | Pending |
| BRW-03 | Phase 65 | Pending |
| BRW-04 | Phase 65 | Pending |
| BRW-05 | Phase 65 | Pending |
| EXT-01 | Phase 59 | Pending |
| EXT-02 | Phase 62 | Pending |
| EXT-03 | Phase 60 | Pending |
| INJ-01 | Phase 66 | Pending |
| PLAT-01 | Phase 67 | Pending |
| PLAT-02 | Phase 67 | Pending |

**Coverage:**
- v1 requirements: 39 total
- Mapped to phases: 39
- Unmapped: 0

---
*Requirements defined: 2026-11-04*
*Last updated: 2026-11-04 after owner decisions D-01..D-29, the adversarial ownership review and roadmap creation (phases 59-67)*
