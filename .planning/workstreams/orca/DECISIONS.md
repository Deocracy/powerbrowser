# v1.7 Orca integration — owner decisions

All decisions by Chris, 2026-11-04, during `/gsd-new-milestone --ws orca`. Where an entry
conflicts with the seed (SEED-261103-o1g), research/INPUTS.md, research/SUMMARY.md or the
rebrand survey, **this file wins**.

## Direction (supersedes seed decision 1 and the release-only fetch)

**D-01 — Orca's tabs become real PB tabs.** Every Orca tab is a Lumino tab in PB's dock: it
moves between modes and is organisable like Theia and browser tabs.
- Terminals and agent sessions become Theia terminal tabs attached to orcad's PTY sessions
  ("same terminals").
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
4. Same terminals. Rated medium to hard: Theia terminal tabs attach to orcad PTYs over Orca's
   runtime RPC (see D-01).

## Runtime behaviour

- **D-07 — Quit:** agents and the terminal daemon **keep running** after PB quits. PB
  re-adopts them on the next launch. Per-OS reaping and re-adopt are needed.
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

## Spikes this direction needs

1. Browser parity: what an Orca browser tab can do, and how PB chrome provides it
   (`NOTE-orca-tab-parity-direction.md`).
2. Orca tabs as PB tabs: routes, size and re-pin cost (`NOTE-orca-tabs-as-pb-tabs-spike.md`).
   It now works under D-04, so the question is how, not whether.
3. Claude extension: whether it runs on Theia 1.76, the pane registration for D-06 item 2, and
   live sharing (D-06 item 3).
4. Same terminals: whether a Theia terminal can attach to an orcad PTY over the runtime RPC.
