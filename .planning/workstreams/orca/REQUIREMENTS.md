# Requirements: Power Browser — milestone v1.7 Orca integration

**Defined:** 2026-11-04
**Core Value:** Theia is the default GUI; Orca's agent workflow runs inside PowerBrowser as real
PowerBrowser tabs, with PowerBrowser's own engine and chrome as the agents' browser.

Owner decisions are in `DECISIONS.md` (D-01..D-31) and win over `research/`. Research feature ids
(T-n, D-n in `research/FEATURES.md`) are cited where a requirement comes from them.

## v1 Requirements

### Orca runtime (RUN)

- [x] **RUN-01**: PowerBrowser builds orcad and the Orca web client from source at a pinned Orca
  tag (first pin 1.4.248, fallback 1.4.245) with Orca's own `build:orcad` and `build:web` from a
  Nix dev shell carrying pnpm 12.14.0; the pin lives in `configuration.toml` and a `--quick`
  check proves it. (D-04)
- [x] **RUN-02**: orcad runs slot-less on Theia's Node 24.19.0; no second Node runtime is
  shipped. (D-14)
- [x] **RUN-03**: PowerBrowser spawns orcad through an `OrcaService` consumer of the
  `PowerBrowserAPI` boundary and a supervisor: loopback bind, fixed port, data root
  `powerbrowser-orca` set through both `ORCA_USER_DATA` and `ORCA_USER_DATA_PATH`, an
  allowlisted environment that scrubs inherited `ORCA_*`, telemetry off, and `*.onorca.dev` on
  the egress allowlist. (T-2, T-10, D-08)
- [x] **RUN-04**: PowerBrowser's orcad never finds and launches an installed Orca desktop as a
  hidden Electron browser engine. (D-10)
- [x] **RUN-05**: Quitting PowerBrowser stops orcad and every agent it started; stale state is
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

- [x] **OVL-01**: Orca changes are an additive overlay: new PowerBrowser files plus
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
- [x] **OVL-04**: "Orca" is classified only in `inventory/brand-tokens.json`; Orca's licence has a
  row in the licence allow-list; the brand scan stays green over the overlay.
- [x] **OVL-05**: The PowerBrowser pane entry and the PTY and browser providers are new files
  only, compiled by Orca's own `build:web` and `build:orcad`. (D-04)
- [ ] **OVL-06**: The browser provider and extra web entry seams are offered to Orca upstream as
  pull requests once each works in PowerBrowser; the terminal provider seam was dropped with the
  Phase 63 bridge (D-31). (D-27)

### Terminals (TERM)

Orca terminals and Theia terminals are two kinds, side by side (D-31, Chris 2026-11-10).

- [x] **TERM-01**: Every Orca terminal runs on Orca's own engine (orcad's stock local PTY
  provider and its terminal daemon, with no PowerBrowser PTY provider and no terminal seam patch)
  and is shown as a PowerBrowser tab with Orca's own terminal view (`TerminalPane`, xterm.js)
  hosted through Route A; it accepts input and shows output. Theia terminals stay plain Theia
  terminals beside them; neither replaces the other. (D-31)
- [x] **TERM-02**: Agent sessions Orca starts run in Orca terminals with Orca's `ORCA_*` hook
  environment, so agent status hooks report working, waiting and done, and every agent and Orca's
  terminal daemon end when PowerBrowser quits. (D-06, D-07, D-13, D-31)
- [x] **TERM-04**: In Orca terminal tabs and Theia terminals, Ctrl+W and Ctrl+T go to the shell, as
  in a normal terminal. Ctrl+Tab and Ctrl+PageUp/PageDown always switch PowerBrowser tabs, from
  terminals too. Orca's window shortcuts are turned off inside hosted Orca terminals. A tab is
  closed with the mouse or Ctrl+Shift+W. (D-31, D-32)

TERM-03 (remote terminals) moved to v2; see "Terminals (TERM)" under v2 Requirements.

### Tabs and modes (TAB)

- [x] **TAB-01**: An "Orca" mode appears beside Coding in `SHIPPED_MODES` and the chrome bar.
  (T-1)
- [x] **TAB-02**: `pb-orca:` URIs follow `docs/URI-SCHEMES.md`, round-trip in
  `verify-uri-roundtrip.mjs`, and leave `TabUriRegistry`'s exported shape unchanged. (T-4)
- [x] **TAB-03**: A spike shows how PowerBrowser's dock observes the client's layout state
  (the renderer owns it in shipped builds) and how Orca's pane components mount inside Lumino
  widgets. (D-15)
- [ ] **TAB-04**: One Orca pane equals one Lumino tab: every Orca pane (terminal, agent
  session, editor, diff, browser page, chat and other Orca-only views) is a tab in PowerBrowser's
  dock, moves between all modes and appears as an Organising row; Orca's in-tab splits, and Orca
  tab groups held in PowerBrowser's hosted Orca client, are flattened into Lumino splits at a
  pane's first appearance, in the direction Orca records: a group made in PowerBrowser (a hosted
  chat's Split Chat Right) at once, and a group another paired client made when PowerBrowser's
  client next adopts orcad's layout (start or frontend reload). Later regrouping of panes
  PowerBrowser already shows is not mirrored (D-15, P64-12). (D-01, D-15, T-5; re-worded per
  64-TAB-GROUPS.md, 65-CONTEXT P65-37)
- [x] **TAB-05**: Files and diffs open in Theia's editor, with Orca worktrees opened as Theia
  workspace folders; Orca's own editor is not used. (D-01)
- [x] **TAB-06**: Chat and the other Orca-only views each open as their own PowerBrowser tab.
  (D-01)
- [x] **TAB-07**: Orca's worktree sidebar, settings and orchestration panel live in a
  PowerBrowser side panel; modifications are additive only. (D-02, D-16)
- [x] **TAB-08**: Setups restore re-pairs Orca tabs and never persists the pairing offer. (T-5)
- [x] **TAB-09**: Orca's own Add-project flow and sidebar remove behave as in Orca; PowerBrowser
  adds no separate Add-project button. (D-18, T-7)

### Browser replacement (BRW)

- [x] **BRW-01**: A browser-parity spike reconciles Orca's browser inventory against Gecko,
  chooses the seam, and answers `research/FEATURES.md` questions 1-8. (direction note)
- [x] **BRW-02**: Each Orca browser page is a PowerBrowser web tab with PowerBrowser chrome; the
  stock screencast pane and its dead entry points are never shown. (T-9, D-1)
- [x] **BRW-03**: Orca agents drive PowerBrowser web tabs through a chrome-side bridge that can
  reach only Orca-created tabs; no WebDriver BiDi TCP port in shipped PowerBrowser. (D-11)
- [x] **BRW-04**: While an agent drives a tab, PowerBrowser's Theia chrome bar shows an
  "agent is controlling this tab" mark with a Stop button; stock browser windows are unchanged.
  (D-19, D-2)
- [x] **BRW-05**: The user-facing tools Orca's browser offers, as the spike inventories them,
  are added to PowerBrowser's chrome bar or Theia side panels.

### Claude Code extension (EXT)

- [ ] **EXT-01**: The Claude Code VS Code extension runs on Theia 1.76 on Orca worktrees;
  checked in the first build phase. (D-06.1)
- [ ] **EXT-02**: Extension sessions are visible in Orca: PowerBrowser registers a pane per
  session and passes the `ORCA_AGENT_HOOK_*` variables. (D-06.2)
- [x] **EXT-03**: A spike researches live sharing of a running Orca agent inside the extension;
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

### Bundled extensions (BEXT)

Third-party parts that carry their own terms ship as pre-installed extensions the user can
switch off or uninstall (Chris 2026-11-10, D-30).

- [ ] **BEXT-01**: Anthropic's Claude agent SDK is not bundled into orcad. It ships inside a
  pre-installed PowerBrowser Theia extension that carries Anthropic's terms; the user can switch
  it off or uninstall it. When it is on, Claude's chat-style Orca session loads the SDK from it;
  when it is off or removed, that session reports the package missing, and Claude terminal
  panes and every other agent keep working. (ruling 68-A, D-30)
- [ ] **BEXT-02**: uBlock Origin ships pre-installed and enabled as a browser (Gecko)
  WebExtension at a pinned version and sha256, unmodified; the user can switch it off or remove
  it, and its GPL-3.0 licence is listed in the third-party notices. (Chris 2026-11-10)

## v2 Requirements

Deferred; tracked, not in this roadmap.

### Terminals (TERM) — deferred to a future Orca re-pin (D-31)

- **TERM-03**: Orca's SSH and paired-server terminals open as Orca terminal tabs in
  PowerBrowser. Deferred: headless orcad at the pin (1.4.248) has no SSH stack and no
  paired-server relay; only Electron main has them (64-RESEARCH A1, 63-RESEARCH finding 1). It is
  re-examined at the first re-pin whose orcad serves remote terminals. (D-20, D-31)

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
| Agents surviving quit | D-07: `OrcaService` ends orcad, its terminal daemon and the daemon's descendants on quit (D-31 keeps the daemon as Orca's terminal engine, not for survival) |
| A PowerBrowser PTY provider for orcad (Orca terminals on Theia's engine) | D-31: Orca terminals use Orca's own engine and view; Theia terminals stay Theia's |
| Remote (SSH, paired-server) Orca terminals | D-31: headless orcad at the pin has no SSH stack or relay; TERM-03 is v2 |
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

Phase 59 (carry-forward from v1.5 and v1.6, Chris 2026-11-07) carries CF-01..CF-19 from `.planning/CARRY-FORWARD-v1.7.md` and maps no v1.7 requirement id.

Filled by the roadmap.

| Requirement | Phase | Status |
|-------------|-------|--------|
| RUN-01 | Phase 60 | Complete |
| RUN-02 | Phase 60 | Complete |
| RUN-03 | Phase 62 | Complete |
| RUN-04 | Phase 62 | Complete |
| RUN-05 | Phase 62 | Complete |
| RUN-06 | Phase 67 | Pending |
| RUN-07 | Phase 67 | Pending |
| RUN-08 | Phase 67 | Pending |
| RUN-09 | Phase 67 | Pending |
| OVL-01 | Phase 62 | Complete |
| OVL-02 | Phase 68 | Pending |
| OVL-03 | Phase 68 | Pending |
| OVL-04 | Phase 60 | Complete |
| OVL-05 | Phase 62 | Complete |
| OVL-06 | Phase 68 | Pending |
| TERM-01 | Phase 64 | Complete |
| TERM-02 | Phase 63 | Complete |
| TERM-04 | Phase 64 | Complete |
| TAB-01 | Phase 64 | Complete |
| TAB-02 | Phase 64 | Complete |
| TAB-03 | Phase 61 | Complete |
| TAB-04 | Phase 64 | Pending: on the merged Phase 65 tree (65-05) orca-tabs-live stage (g2) tab-groups PASS (the hosted chat's own Split Chat Right places the new chat's widget in a tab bar to the right of its reference), and stages (a)-(e2), (g), (h)-(k) and gui07-mode-switch-tabs-live PASS; sub-stage (g3) tab-groups-cross-client is red: Orca's pinned web client, opened as the second client at stage (f), never shows the CLI terminal T created later (likely the pinned host's navigation-echo freeze, 64-MIRROR-FREEZE.md, which only PowerBrowser's own client works around). Requirement re-worded per 64-TAB-GROUPS.md (P65-37). Next: a g3 drive with a second client that receives host frames; end-of-milestone pass (65-05-SUMMARY.md "Still red") |
| TAB-05 | Phase 65 | Complete |
| TAB-06 | Phase 64 | Complete |
| TAB-07 | Phase 65 | Complete |
| TAB-08 | Phase 65 | Complete |
| TAB-09 | Phase 65 | Complete |
| BRW-01 | Phase 61 | Complete |
| BRW-02 | Phase 66 | Complete |
| BRW-03 | Phase 66 | Complete |
| BRW-04 | Phase 66 | Complete |
| BRW-05 | Phase 66 | Complete |
| EXT-01 | Phase 60 | Pending |
| EXT-02 | Phase 63 | Pending: PowerBrowser half proven (63-03, 63-06); extension half with EXT-01 in the end-of-milestone pass |
| EXT-03 | Phase 61 | Complete |
| INJ-01 | Phase 67 | Pending |
| PLAT-01 | Phase 68 | Pending |
| PLAT-02 | Phase 68 | Pending |
| BEXT-01 | Phase 68 | Pending |
| BEXT-02 | Phase 68 | Pending |

**Coverage:**
- v1 requirements: 40 total (TERM-03 moved to v2 by D-31)
- Mapped to phases: 40
- Unmapped: 0

---
*Requirements defined: 2026-11-04*
*Last updated: 2026-11-04 after owner decisions D-01..D-29, the adversarial ownership review and roadmap creation (phases 59-68); BEXT-01/02 added 2026-11-10 (Chris); TERM-01..04 rewritten and re-mapped, TERM-03 moved to v2, OVL-06 narrowed 2026-11-10 (D-31); TERM-04 restated 2026-11-10 (D-32); TERM-01, TERM-04 and TAB-06 complete 2026-11-11 on 64-06's recorded PASS lines*
