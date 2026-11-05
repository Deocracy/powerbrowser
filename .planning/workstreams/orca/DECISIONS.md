# v1.7 Orca integration — owner decisions

All decisions by Chris, 2026-11-04, during `/gsd-new-milestone --ws orca`. Where an entry
conflicts with the seed (SEED-261103-o1g), research/INPUTS.md, research/SUMMARY.md or the
rebrand survey, **this file wins**.

## Direction (supersedes seed decision 1 and the release-only fetch)

**D-01 — Orca's tabs become real PB tabs.** Every Orca tab is a Lumino tab in PB's dock: it
moves between modes and is organisable like Theia and browser tabs.
- Terminals are **Theia terminals only** (Chris, 2026-11-04, second session). Orca uses them:
  orcad gets a Theia-backed `IPtyProvider` (a fifth implementation beside Local, DaemonPtyAdapter,
  DaemonPtyRouter and Degraded) that forwards spawn, write, resize, kill and data to Theia's
  backend. Orca's terminal daemon is not used. Agent hook env vars pass through at spawn.
- Files and diffs open in Theia's editor, with Orca worktrees opened as Theia workspace
  folders. Orca's own editor is not used.
- Browser panes become PB web tabs (see `NOTE-orca-tab-parity-direction.md`).
- Chat and the other Orca-only views each open as their own PB tab.

**D-02 — The rest of Orca's GUI stays Orca's**, with small modifications: the worktree
sidebar, settings and the orchestration panel. They live in a PB side panel.

**D-03 — PB-native UI is allowed.** Orca's React tab system may be replaced by PB/Theia
widgets, as long as Orca's features and orcad keep working and new Orca releases can still be
taken.

**D-04 — Orca is built from source at a pinned tag**, using Orca's own `build:web` and
`build:orcad` (pnpm). Changes go in as a **build-time overlay first** (whole files swapped by
PB build config) and **small regenerated patches only where a file cannot be swapped**. An
automated rebase job runs for each Orca release, the same idea as `rebase-upstream`.
- PB does not rely on Orca accepting upstream changes. Generic changes may be offered upstream
  later, to shrink the stack.
- This replaces seed decision 1 ("consumed by version, never patched or vendored") and the
  earlier "pinned release fetch". Node 24.22.1 for orcad still comes pinned by version and hash.
- First pin: **Orca 1.4.248**. Fall back to 1.4.245, the build proven live, if the spike probe
  fails on 1.4.248.

**D-05 — Order: the remake comes first.** The spikes and the tab remake come before the
hosting basics are finished. Nothing ships as "done" with Orca's client in one tab.

## VS Code Claude extension (new goal)

**D-06 — The Claude Code VS Code extension works alongside Orca tabs, beside the other Theia tabs:**
1. It runs on Orca worktrees. Rated easy: PB ships `@theia/plugin-ext-vscode` 1.76. That the
   extension runs fully on Theia 1.76 is unverified and is checked early.
2. Its sessions are visible in Orca. Rated medium: Orca's hooks stay silent without an Orca
   pane (`src/main/agent-hooks/hook-script-outside-orca.test.ts:51-84`), so PB creates a pane
   per extension session and passes the `ORCA_AGENT_HOOK_*` variables.
3. Orca agents can be used in the extension. Rated very hard while the agent is running.
   **Research live sharing** in a spike, with no promise made. Resuming a stopped session
   (`--resume`) is the realistic floor.
4. Same terminals. Now easy: all terminals are Theia terminals (D-01), so the extension and
   Orca already share them.

## Runtime behaviour

- **D-07 — Quit (revised 2026-11-04): agents end when PB quits.** Theia's backend owns the
  PTYs and dies with PB; Orca's detached daemon is not used. Supersedes the earlier "keep running
  and re-adopt" rule, which existed only because Orca's daemon made it possible.
- **D-08 — Telemetry off:** set `ORCA_TELEMETRY_DISABLED=1` and `DO_NOT_TRACK=1`. The Orca
  cloud hosts (`*.onorca.dev`: push, login, relay, share, feedback) go on the egress allowlist
  so those features keep working.
- **D-09 — Keys:** inside an Orca tab, Orca's terminal gets Ctrl+W, Ctrl+T, Ctrl+Tab and
  Ctrl+PageUp/PageDown (a per-tab key policy). PB's tab shortcuts work everywhere else.
- **D-10 — Hidden Electron is prevented:** PB's orcad must never find and launch an
  installed Orca desktop as a hidden browser engine.
- **D-11 — No Remote Agent in shipped PB:** WebDriver BiDi is only for tests and the spike.
  Production uses a chrome-side bridge that can reach only Orca-created tabs.
- **D-12 — Agent permissions:** keep Orca's default (skip-permissions on).
- **D-13 — Agent status hooks stay on.**

## Earlier decisions in this session (unchanged)

- Mode named "Orca"; renames and logos beyond the landing logo are cosmetic and deferred.
- The landing logo becomes the PB logo, by injection (JSWindowActor).
- orcad profile directory `powerbrowser-orca`. Set **both** `ORCA_USER_DATA` (orcad) and
  `ORCA_USER_DATA_PATH` (Orca CLI) to it. The research proved that setting only the first lets
  the CLI reach the user's real Orca desktop.
- Tab URI scheme `pb-orca:`. The requirement is that Orca tabs work in every mode and move
  between any modes.
- Platforms: Linux, macOS and Windows. Flatpak gets `--filesystem=home`.
- In scope: the Add-project UI and the credential-storage check.
- Deferred: palette, About-dialog credit, renames.

## Second-session decisions (2026-11-04, after the difficulty review)

- **D-14 — Node:** orcad runs **slot-less on Theia's Node 24.19.0**. The exact-24.22.1 check in
  `orcad-bundled-runtime.ts:19-33,63-76` fires only when the slot's runtime marker files exist;
  without them orcad needs Node 24 or newer. No second runtime is shipped. Supersedes the
  "Node 24.22.1 pinned by version and hash" line in D-04. Phase 59's spike proves the start.
- **D-15 — Tab layout ownership: spike first.** orcad owns the tab/pane layout (240 files under
  `src/main/runtime`; the client sends layout commands and applies frames). Read that protocol
  and size "PB dock as orcad layout client" against "PB owns the layout" before choosing.
- **D-16 — Bounded overlay.** The Orca overlay may touch only leaf files and a documented list
  of seams; anything deeper needs an owner decision. Goal: rebases per Orca release stay mostly
  automatic.
- **D-17 — Origin check:** the Theia token gate also rejects sidecar requests whose Origin is
  not PB's own pages. Closes the shared-loopback-cookie hole for every local page.
- **D-18 — Add project:** keep Orca's own Add-project flow and sidebar remove unchanged. PB adds
  no separate Add-project button. (Replaces the "Add-project UI in scope" line above.)
- **D-19 — Agent mark:** when an Orca agent drives a PB web tab, PB's Theia chrome bar shows an
  "agent is controlling this tab" mark with a Stop button. Stock browser windows unchanged.

- **D-20 — Remote hosts stay in.** orcad routes only the `local` host through the swappable PTY
  provider (`ipc/pty/provider/registry.ts:73-78`); SSH and paired-server (`runtime:`) hosts have
  their own paths that never touch the local daemon, so the Theia-only terminal rule costs them
  nothing. Remote may be PB-to-PB only if that is what works.
- **D-21 — Orca mobile is forked too.** Its source is in the Orca repo (`mobile/`, Expo, iOS and
  Android, ~2,200 source files) and is overlaid under D-04/D-16 like the client. Mobile is a remote
  control over orcad's runtime (sessions, terminals, files, browser, automations), not a layout
  mirror; PB-specific views are added to it.
- **D-22 — Mobile distribution: Android now, iOS later.** v1.7 builds and releases the Android
  APK on GitHub Releases. iOS waits for a signing decision; the 2026-11-01 no-store rule is
  unchanged for now.

- **D-23 — Mobile fork is its own milestone after v1.7.** v1.7 keeps orcad's mobile-facing
  protocol (pairing relay, runtime RPC) unmodified so the stock Orca mobile app pairs with PB's
  orcad meanwhile. Capture the fork as a seed for the next milestone.

- **D-24 — Live checks pass on Linux only.** All three OSes are built; macOS and Windows get a
  smoke test when a machine is available, as in v1.6.

- **D-25 — Run mode: interactive per phase.** Chris answers each phase's discuss step; execution
  runs between. Not `/gsd-autonomous` for this milestone.

## Spikes this direction needs

1. Browser parity: what an Orca browser tab can do, and how PB chrome provides it
   (`NOTE-orca-tab-parity-direction.md`).
2. Orca tabs as PB tabs: routes, size and re-pin cost (`NOTE-orca-tabs-as-pb-tabs-spike.md`).
   It now works under D-04, so the question is how, not whether.
3. Claude extension: whether it runs on Theia 1.76, the pane registration for D-06 item 2, and
   live sharing (D-06 item 3).
4. Theia-backed PTY provider for orcad (D-01), and the layout-ownership spike (D-15).
