# Phase 63: Theia terminals and agent hooks for Orca - Research

**Researched:** 2026-11-09
**Domain:** A third-party Node daemon's (orcad's) PTY layer re-hosted in Eclipse Theia's backend through a node-pty-compatible facade; Theia terminal widgets and key policy; Orca's agent-hook plumbing for an out-of-PTY process (the Claude Code extension).
**Confidence:** HIGH on every Orca and Theia fact below (read at the pin this session; the required-member count was parsed with a TypeScript parser). MEDIUM on the integrated behaviour (nothing was built or run, per instruction). Five picks are amended, and one (P63-11, TERM-03) needs an owner decision because the pinned orcad cannot serve what the pick assumes.

<user_constraints>
## User Constraints (from 63-CONTEXT.md, copied verbatim)

### Locked Decisions

#### Theia-backed PTY provider (TERM-01, criterion 1)
- **P63-01 (Claude's pick): PB's provider is a new overlay class `PowerBrowserTheiaPtyProvider extends LocalPtyProvider`; only the node-pty module beneath it is replaced, by a node-pty-compatible facade whose PTYs live in Theia's backend.** Reasons from the pinned source: `configureLocalPtyProvider` configures the provider only when `localProvider instanceof LocalPtyProvider` (`orca/src/main/ipc/pty/provider/local-configure.ts:40`), and that call is where `buildPtyHostEnv` adds the hook environment, terminal handle and runtime stamps (`local-configure.ts:43-150`); `LocalPtyProvider` and its helpers (`orca/src/main/providers/local-pty/`, about 10.4k lines) carry env finalisation, shell-ready wrappers, foreground inspection and termination that a from-scratch provider would have to copy. A subclass has every required `IPtyProvider` member by inheritance, gets the hook env for free (P63-14), and moves the re-pin exposure from `IPtyProvider` (changed in 9 of 21 releases, D-28) to node-pty's `IPty`, a published third-party interface. This keeps D-28's intent (all required members, not five operations) and amends D-01's wording "a fifth implementation beside Local..." to "a subclass of Local with a Theia-backed PTY layer". — **Reversibility:** costly; Chris may prefer a from-scratch `implements IPtyProvider` class, which keeps the same seams, bridge and checks.
- **P63-02 (Claude's pick): two new declared seams, both in the PTY-provider category, each a short env-switched branch; the overlay then carries 3 of the 10-seam cap (S1 is Phase 62's).** S2 in `src/main/orcad/orcad-daemon-supervision.ts` (`startOrcadDaemon`): when the switch is set, import the PB provider file, call `setLocalPtyProvider(new PowerBrowserTheiaPtyProvider())` and return without starting the daemon. S3 in `src/main/providers/local-pty/local-pty-runtime-spawn.ts` (`loadLocalPtyRuntimeSpawn`): when the switch is set, import the PB facade instead of `node-pty`. Reasons: orcad starts the daemon at `orcad-entry.ts:75` through `startOrcadDaemon` → `initDaemonPtyProvider` → `replaceDaemonProvider` → `setLocalPtyProvider` (`daemon/daemon-provider-state.ts:99-101`), so a seam in `registry.ts` or `daemon-provider-state.ts` (the files D-16 names) would come after the daemon process already exists; no existing switch disables the daemon (grep of `process.env.ORCA_*DAEMON*` at the pin); node-pty is loaded for the local provider only at `local-pty-runtime-spawn.ts:15`. Neither file is part of the mobile-facing protocol (D-23, D-29). The switch is one fixed name set by `OrcaEnv`, `ORCA_PB_THEIA_PTY_ENDPOINT` (the endpoint-file path, P63-03), following P62-14's `ORCA_DISABLE_INSTALLED_ELECTRON_BROWSER`. — **Owner-visible:** the two seam files are not the examples D-16 lists; each stays within P62-17's 20-line bound.
- **P63-03 (Claude's pick): the transport between orcad and Theia is a Unix domain socket served by the Theia backend, found through an endpoint file, with no secret in any process environment.** The pattern copies Orca's own `ORCA_AGENT_HOOK_ENDPOINT` file design, and the rule copies `theia/extensions/token-gate/src/node/powerbrowser-env.ts` and `TheiaService.sys.mjs:820-836` (environ is readable by same-uid processes for the life of the process, so no credential goes there). Chrome picks the directory `<short runtime dir>/pty-bridge/` (mode 0700, same location rules as P62-19's alias: `$XDG_RUNTIME_DIR` first, never `/tmp`) and passes only the path: to Theia as `POWERBROWSER_ORCA_PTY_DIR` (captured and deleted at module load like every `POWERBROWSER_*` key) and to orcad as `ORCA_PB_THEIA_PTY_ENDPOINT=<dir>/endpoint.json`. The Theia backend creates the socket (0600) and writes `endpoint.json` (0600: socket path, a 256-bit token, protocol version) at start; the orcad side reads the file at each connect and reconnects after a Theia restart. Framing is newline-delimited JSON control frames plus data frames. The message set is defined once in the Theia extension (`src/common/`) and once in the overlay; a check compares the two sets (P63-17). Windows named pipes and macOS socket paths are Phase 68.
- **P63-04 (Claude's pick): the Theia side is one new extension `@powerbrowser/orca-terminals` (`theia/extensions/orca-terminals`), and its bridge server core is a plain Node module with no Theia DI.** A thin `BackendApplicationContribution` wraps the core and spawns each PTY through `@theia/process`'s `TerminalProcessFactory`, so every PTY is in Theia's `ProcessManager` and a frontend `TerminalWidget` attaches with `start(id)` (`theia/node_modules/@theia/terminal/lib/browser/base/terminal-widget.d.ts:68`). The PTY gets exactly the environment orcad's provider sends (the env `LocalPtyProvider` built); the bridge adds and removes nothing. The plain core lets checks host the bridge under Node with node-pty and no Theia. No Theia core file is edited (hard rule 1; `scripts/diff-theia-core.sh` stays green).
- **P63-05 (Claude's pick): orcad's node-pty startup probe keeps running unchanged and must pass, so `build-orca.sh` keeps building node-pty for Node 24 (Phase 60) even though the provider no longer spawns through it.** The probe runs before `main()` (`orca/src/main/orcad/main.ts:96-110`, `node-pty-precondition.ts:181-250`); the criterion-1 row runs orcad with `--orcad-native-preflight` (name derived from `src/shared/orcad-native-preflight-report.ts:3`) and requires status `ok`. With the switch, `health.terminalDaemon.state` must read `absent` (`orcad-health.ts:94-122`); without it, `live`.

#### Terminal identity and tabs
- **P63-06 (Claude's pick): the bridge mints the Theia identity `o<n>` (lowest unused index, as `allocateName` does for `t<n>` in `theia/extensions/tab-uris/src/browser/terminal-naming-contribution.ts`), keeps the map `o<n>` ↔ Orca PTY id ↔ Orca terminal handle ↔ Theia process id in the backend so it survives a frontend reload, and opens the widget with `terminalIdentityOptions('o<n>')`, addressable as `terminal:o<n>`.** `TERMINAL_NAME_PATTERN` (`/^t(\d+)$/`) is untouched, so user terminals and Orca terminals never share a name. `TerminalUriOpenHandler`'s stale-name rule (D-48: create a fresh shell under that name) is exempted for `o<n>`: a stale Orca name opens nothing and logs, because a plain shell must not pose as an Orca terminal. `TabUriRegistry`'s exported shape is unchanged (`verify-registry-shape.mjs`); `docs/URI-SCHEMES.md` gains the `o<n>` row. Phase 64 maps `pb-orca:` panes onto these widgets.
- **P63-07 (Claude's pick): every PTY spawned through the bridge opens one Theia terminal tab in the main area (D-01: Orca tabs are dock tabs), without taking focus, titled from Orca's pane title or the terminal's OSC title.** A PTY Orca marks hidden at spawn (the field is a research item; `orca/src/main/ipc/pty/pty-hidden-at-spawn-mark.test.ts` names the concept) is mapped and addressable but not opened. Until Phase 64 removes Orca's own terminal view, the Orca client and the Theia tab can both resize the same PTY; the last request wins, and this is recorded as a known limit, not fixed here.
- **P63-08 (Claude's pick): input and output take two paths.** Keystrokes in the Theia tab go straight to the Theia process; writes from orcad (`terminal.send` from Orca clients and the CLI, agent startup commands) go over the bridge. PTY output is delivered to both: to the widget through `ProcessManager`, and to orcad as bridge data frames, with Orca's `acknowledgeDataEvent` flow control mapped to the facade's pause/resume. Which `IPty` internals `LocalPtyProvider` reads beyond the public typings (for example `getForegroundProcessGroup`, read defensively in `orca/src/main/pty/process-retirement/pty-master-foreground-observation.ts:20-40`, and the pts name) is a research item; a missing one must degrade to Orca's existing "older native image" path, not fail.

#### Lifecycle (D-07 revised)
- **P63-09 (Claude's pick): Theia's backend owns every Orca PTY, so agents end when PowerBrowser quits through the existing paths:** `TheiaService` stops the sidecar, Theia's `ProcessManager` kills its processes on stop, and `OrcaService` stops orcad. Phase 62's `stop()` and its reap must accept `health.terminalDaemon.pid === null` (no daemon exists with the switch set). The RUN-05 quit and SIGKILL checks (62's `orca-service-live`) are extended to the Orca PTYs under the Theia backend: before quit, record each provider-created PTY's process and its descendants; after quit, none alive. After a SIGKILL of PowerBrowser the Theia parent-death watchdog ends the backend and the PTY masters close; the relaunch check requires those pids gone.
- **P63-10 (Claude's pick): when orcad's bridge connection drops while Theia lives (an orcad crash or respawn), the bridge kills that connection's PTYs after a short grace period, and the Theia tabs stay open showing the exit.** orcad cannot re-adopt in-process PTYs: `canRecoverPersistentLocalPtys` reads `daemonOwnsFreshPersistentPtys()` (`orcad-entry.ts:211`), which is false with no daemon. When Theia restarts, the provider reports an exit for every PTY with `hostLost` (`pty-provider-contract.ts:236`).

#### Remote hosts (TERM-03, D-20)
- **P63-11 (Claude's pick): SSH and paired-server PTYs stay on their own paths (`registry.ts:73-78` throws for any non-local host), and their Theia tabs are pseudo-terminals in `@powerbrowser/orca-terminals` fed by orcad's runtime RPC (`terminal.subscribe`, `terminal.send`, `terminal.resizeForClient`), with the Theia backend acting as a paired client of PB's own orcad.** Streaming methods are served only on orcad's WebSocket and are authorised by per-device tokens (`orca/src/main/runtime/runtime-rpc/runtime-rpc-websocket-dispatch.ts:103`); the CLI's Unix socket is request/response (`orca/src/cli/runtime/transport.ts`). The Theia backend therefore pairs once per orcad start and keeps its device credential in memory, or in a 0600 file in the 0700 data root, never in an environment variable or a log (RUN-07 floor). The pairing step and the remote-handle naming are research items; remote tabs use the same `o<n>` identity map (P63-06). — **Reversibility:** costly; the alternative is to wait for Phase 64's hosted client and render remote panes from its connection.
- **P63-12 (Claude's pick): the SSH live check runs against a throwaway user-mode `sshd` on a loopback high port** (OpenSSH from the Nix dev shell, scratch host key and authorized key, no system configuration change; this host has no running `sshd`). The paired-server check runs a second PB-run orcad with a scratch data root and a free port, paired as a runtime host of the first (PB-to-PB, allowed by D-20). Both are live rows under the live lock, Linux only (D-24).

#### Keys (TERM-04, D-09)
- **P63-13 (Claude's pick): `@powerbrowser/orca-terminals` registers `KeybindingRegistry.PASSTHROUGH_PSEUDO_COMMAND` for `ctrl+w`, `ctrl+t`, `ctrl+tab`, `ctrl+shift+tab`, `ctrl+pageup` and `ctrl+pagedown`, with the `when` clause `powerbrowser.orcaTerminalFocus`, a context key that only Orca terminal widgets set.** This is the mechanism `chrome-bar-keybindings.ts:85-89` already uses for the address pill. It is needed because Theia core binds `ctrl+tab` to `NEXT_TAB` with no `when` clause (`theia/node_modules/@theia/core/lib/browser/common-frontend-contribution.js:794-796`). No chrome change: with the Theia frame focused, chrome's page-key rows are disabled (`powerbrowser/shell/powerbrowser.js:494-503`), so the keys already reach Theia. The bindings use literal `ctrl`, not `ctrlcmd`, so on macOS Cmd keeps PowerBrowser's tab commands and Ctrl reaches the terminal. Ctrl+Shift+Tab is included as the reverse of Ctrl+Tab; D-09 names only Ctrl+Tab. User `t<n>` terminals keep their current bindings.

#### Agent hooks (TERM-02, EXT-02)
- **P63-14 (Claude's pick): TERM-02 holds by construction.** The subclass receives `buildSpawnEnv` from `configureLocalPtyProvider`, which runs `buildPtyHostEnv` with the hook settings (`local-configure.ts:100-150`; hook names in `orca/src/main/ipc/pty/host-env/spawn-env-keys.ts:4-13`). The provider forwards that env unchanged, and the provider module deletes the transport name `ORCA_PB_THEIA_PTY_ENDPOINT` from orcad's `process.env` when it loads, before the first spawn. Status flows through Orca's managed Claude hooks, with OSC 7501 as the fallback (`orca/src/main/agent-hooks/README.md`). Orca answers the OSC 7501 probe by writing to the PTY through the provider, so the answer travels over the bridge. Whether Theia's xterm also answers that probe is a research item.
- **P63-15 (Claude's pick): EXT-02 uses the extension's `claudeCode.claudeProcessWrapper` setting.** It points at a PB wrapper. For each session the wrapper asks PB's orcad, through its local CLI socket, to create an agent pane in the session's worktree, exports that pane's identity (`ORCA_PANE_KEY`, `ORCA_TAB_ID`, `ORCA_WORKTREE_ID`, `ORCA_TERMINAL_HANDLE`) and `ORCA_AGENT_HOOK_ENDPOINT`, then execs the extension's `claude` with its original arguments, and closes the pane when `claude` exits. `claudeCode.environmentVariables` is static, so it cannot carry a per-session pane key; the spike names both settings (spike 006 README, "Note for EXT-02"). Research picks the RPC that creates the pane (`terminal.create` or `terminal.createAgentSession`, `orca/src/main/runtime/rpc/methods/agent-session.ts`) and checks that Orca's agent-presence evidence accepts a pane whose foreground process is not `claude`. The wrapper finds the data root through a one-line 0600 file the `OrcaService` writes under the profile, not an environment variable. PB contributes the setting's value at Theia's default preference scope and never writes the user's or a workspace's settings file. **Independent of EXT-01:** the hermetic row runs the wrapper exactly as the extension would, with a stub `claude` that runs Orca's own managed hook script on synthetic events. Wiring inside the real extension is a deferred item. If EXT-01 fails, the owner decides at that point (spike 006 README).
- **P63-16 (Claude's pick): a session id for resume comes from Claude's side** (`claude agents --json` `sessionId`, or the session file name), because `orca terminal list --json` does not expose it (spike 006 finding A7). The hermetic hook row also records whether Orca's hook relay keeps the provider session id it receives. No live share and no `--bg`/`attach` launch is built (spike 006 VERDICT conditions 2 and 3).

#### Checks (one registry, derive and compare)
- **P63-17 (Claude's pick): every check is one row plus a `-self-test` row in `scripts/verify-platform.sh`, with expectations derived from the pinned Orca source or the tree and compared as sets.** Quick rows print a named SKIP and exit 0 when `orca/` is absent (P62-10 convention). Live rows run under `flock /home/chris/coding/Power-Browser/.git/pb-live.lock` with caches purged.
  - `orca-pty-contract` and its self-test (quick) derive the required `IPtyProvider` members by parsing `orca/src/main/providers/pty-provider-contract.ts` with a TypeScript parser (members without `?`). A line grep is not enough: at v1.4.248 a reading of the type gives 22 required members, where a naive grep finds 21 because `listProcesses(opts?: …)` hides behind its `?`. The row compares that set with the effective member set of the PB class chain (overlay subclass plus `LocalPtyProvider`) and goes red naming each missing member. It also checks: PB overrides ⊆ contract ∪ `LocalPtyProvider` members (a stale override after a re-pin goes red); the facade's members ⊇ node-pty's required `IPty` members from the installed node-pty typings; and the bridge message set is equal on the Theia and overlay sides. Plants: an added required member, a stale override, a facade missing `resize`, a message on one side only, and a parse yielding zero members ("source moved").
  - `orca-terminal-keys` and its self-test (quick) derive the D-09 key set from the `PAGE_KEYS` rows `newTab`, `closeTab`, `nextTab`, `prevTab`, `nextTabPage` and `prevTabPage` (`powerbrowser.js:433-449`). They compare it with the passthrough rows and their `when` clause, and require the bindings of user `t<n>` terminals to be unchanged. Plants: a missing key, a wrong `when`, a `ctrlcmd` spelling, and an extra key.
  - `orca-pty-provider-live` (full): the preflight is `ok`; with the switch set, the daemon state is `absent` and the process tree under orcad, derived at check time, contains no process running the daemon entry (the entry path is derived from `orca/out`); a terminal created through orcad's CLI has a parent chain that reaches the Theia backend pid; tab `o<n>` exists (BiDi DOM read) and a marker typed into it round-trips. **Detector proof first** (criterion 1): the same built orcad run without the switch shows the daemon to the same detector, or the row fails "detector blind". This part runs on `orca/out` alone, with the bridge core hosted under Node for the switched run.
  - `orca-agent-hooks` (full, hermetic, no model turn): read the `/proc/<pid>/environ` of a provider-spawned PTY. Its hook names must equal the set derived from `spawn-env-keys.ts` plus the pane identity names. The transport name must be absent; the control is that the same name is present in orcad's own environ. Then run Orca's managed Claude hook script on synthetic events into PB's orcad and read the status back as working, waiting and done; then run the EXT-02 wrapper with a stub `claude` and read back a pane with live status.
  - `orca-agent-status-live` (full): a real `claude`, started with `orca agent launch --agent claude --surface terminal`, uses at most two model turns on the owner's login. The row compares record counts before and after, never against a constant (spike 006 finding 5).
  - `orca-remote-terminals-live` (full): the SSH and paired-server sessions of P63-12 each show in a tab and echo typed input.
  - `orca-terminal-keys-live` (full): in an Orca tab, BiDi key dispatch makes the PTY receive `^W`, `^T` and the Tab and PageUp/PageDown sequences, read from a `cat -v` marker, and the tab count does not change; in a web tab and in a non-Orca Theia tab, Ctrl+T still opens a tab.
- **P63-18 (Claude's pick): no user-facing copy beyond terminal titles taken from Orca.** Bridge failures are log lines and diagnostics rows (P62-13's rule continues); `shell-error-copy-no-internals` stays unchanged.

#### Mechanics and lane cut
- **P63-19 (Claude's pick): three wave-1 lanes with disjoint files, one wave-2 lane, and a coordinator plan.**
  - **p63-01 (orcad side):** `orca-overlay/files/**` (provider subclass, node-pty facade, bridge client, the overlay copy of the message set), patches S2 and S3 (regenerated by `regenerate-patches.sh`, never typed), new `seams.json` rows, `scripts/verify-orca-pty-contract.mjs`, and its own `# NEW (63-01, …)` registry blocks.
  - **p63-02 (Theia and chrome side):** `theia/extensions/orca-terminals/**` (bridge server core, backend contribution, tab opener, identity map, key policy), the `o<n>` exemption in `tab-uris/src/browser/terminal-open-handler.ts`, `docs/URI-SCHEMES.md`, `OrcaEnv` fixed name and `pty-bridge` directory, `TheiaService` passing `POWERBROWSER_ORCA_PTY_DIR`, `scripts/verify-orca-terminal-keys.mjs`, and its registry blocks.
  - **p63-03 (agent hooks, EXT-02):** the wrapper, a separate `theia/extensions/orca-agents` package for the preference default, `scripts/verify-orca-agent-hooks.mjs`, and its registry blocks.
  - **p63-04 (wave 2, after the wave-1 merges):** remote hosts (P63-11, P63-12) inside `orca-terminals`, plus the remote live row.
  - **p63-05 (coordinator):** merges 01, 02 and 03 in that order, then 04, each by `refs/heads/<branch>`; it rebuilds Orca (the seams apply), Theia (audited install, new workspace packages) and PowerBrowser (`./mach build faster`); then it runs the live rows, extends `orca-service-live` (P63-09), re-measures the brand rows and updates tracking.

  The conflicts the coordinator expects are textual only: the lanes' registry blocks, and `theia/applications/browser/package.json` plus `yarn.lock` (one dependency line each from p63-02 and p63-03). Only the coordinator edits `STATE.md`, `ROADMAP.md`, `REQUIREMENTS.md` tracking, `WINDOWS.md`, `inventory/brand-tokens.json` and the ledger. Lanes record their scan report for the coordinator. Lanes that build Theia need the audited install from `docs/BUILD.md` (59-CONTEXT D-07). If two lanes at once is the practical ceiling, p63-03 starts when p63-01 finishes. No human checks (D-18).

### Claude's Discretion
- Wire framing details, the facade's internal buffering, the bridge's grace period (P63-10), file layout inside the two new extensions, the wrapper's language (shell or Node on PB's Node), and test harness layout.

### Deferred Ideas (OUT OF SCOPE)
- EXT-02 inside the real Claude Code extension, and spike 006's extension half (resume by id in the extension): with the EXT-01 session in the end-of-milestone pass.
- The `claude --bg` plus `claude attach` live-share option (spike 006 condition 3): not built.
- `pb-orca:` URIs, one Orca pane per Lumino tab, and removing Orca's own terminal view, which also ends the two-resizer limit of P63-07 (Phase 64).
- Windows named-pipe and macOS transport paths, and key smoke tests on macOS and Windows (Phase 68, D-24).
- Offering S2 and S3 upstream (OVL-06, Phase 68).

Deferred verification (59-CONTEXT D-18): the extension's `claude` running through PB's wrapper with the session visible in Orca, and spike 006 "Blocked on EXT-01" steps 1-4, both in the end-of-milestone pass with 60-05 Task 2.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TERM-01 | All terminals are Theia terminals; orcad gets a Theia-backed `IPtyProvider` for the local host implementing every required member and satisfying the node-pty startup probe; the daemon is not used | Items 1, 5, 6, 7; seam diffs S2/S3; facade member table; `orca-pty-contract` and `orca-pty-provider-live` rows. The required count is **22** by parse, not 21 (Amendment A8) |
| TERM-02 | Agent sessions Orca starts run in Theia terminal tabs with the `ORCA_*` hook environment passed through | Env path (`buildLocalPtySpawnEnvironment` → `buildSpawnEnv`) is untouched by the seams; item 2 (probe answers); `orca-agent-hooks`, `orca-agent-status-live` |
| TERM-03 | SSH and paired-server hosts keep working through orcad and display in Theia terminal tabs | Item 3: the pinned orcad has **no SSH stack** and **no paired-server relay**; owner decision required (Amendment A5) |
| TERM-04 | Ctrl+W, Ctrl+T, Ctrl+Tab, Ctrl+PageUp/PageDown reach the program in an Orca tab; PB's tab shortcuts elsewhere | Theia's own terminal passthrough precedent; only Ctrl+Tab and Ctrl+Shift+Tab are intercepted today (Amendment A6); `orca-terminal-keys` rows |
| EXT-02 | Extension sessions visible in Orca through a PB-registered pane and the hook variables | Item 4: `terminal.create`, hook identity names, endpoint path, presence rule; wrapper shape (Amendment A7); `orca-agent-hooks` wrapper stage |
</phase_requirements>

## Summary

The local-terminal half of this phase is smaller than the picks assume. orcad already installs a plain `LocalPtyProvider` at module load (`export let localProvider: IPtyProvider = new LocalPtyProvider()`, `orca/src/main/ipc/pty/provider/registry.ts:15`) and only replaces it when the daemon starts. If seam S2 makes `startOrcadDaemon` return before it starts the daemon, that default instance stays installed, `configureLocalPtyProvider` configures it with the full hook environment (its `instanceof LocalPtyProvider` check, `local-configure.ts:39`, holds without any subclass), and every one of the 22 required `IPtyProvider` members is Orca's own code. The only PB code on the orcad side is the node-pty layer that seam S3 swaps in: a bridge client plus an `IPty`-shaped object per PTY. No provider class is needed (Amendment A1).

The facade's contract is fully derivable. node-pty's published `IPty` has 13 required members (`pid cols rows process handleFlowControl onData onExit resize clear write kill pause resume`, parsed from `orca/node_modules/node-pty/typings/node-pty.d.ts`). Orca reads six more members that are not in the typings, each defensively: `ptsName`, `fd`, `getForegroundProcessGroup` (an Orca node-pty patch), `processNameIsSpawnFile`, `signalProcess`, `destroy`. Orca also ships a capability flag made for this case: an `IPty` that sets `processNameIsSpawnFile: true` makes Orca read the foreground process from the process table by pid instead of from `proc.process` (`orca/src/main/daemon/pty-subprocess/spawn-file-foreground-process.ts:41-43, 102-140`). Because the PTYs are on the same host and owned by the same user, every pid-based inspection and kill Orca performs (`/proc`, `ps`, process-group signals) works unchanged on processes the Theia backend spawned.

**Findings the planner must act on (ordered by consequence):**

1. **TERM-03 cannot be met as P63-11/P63-12 describe it at this pin.** orcad has no SSH stack: `"orcad has no SSH stack yet still advertises ssh.target-management.v1 (D3), so clients show this."` (`orca/src/main/ssh/targets/ssh-target-registry.ts:13`), and `orca serve` falls back to Electron for any profile with SSH targets (`'this profile has SSH targets, which orcad cannot serve yet'`, `orca/src/main/orcad/orcad-local-serve-selection.ts:122`). The only call that installs a real SSH connect handler is in Electron main (`src/main/ipc/ssh/ssh-connection-handlers.ts:22`). Paired-server (`runtime:`) terminals run on the remote orcad, and only Electron main relays to them (`runtimeRpc.setMobileDesktopRelayHosts(...)`, `src/main/startup/main-process-runtime-launch.ts:122`); a client reaches a paired server by connecting to it directly. A Theia backend paired to **PB's own** orcad would therefore receive no remote terminal stream at all. This needs an owner decision (Amendment A5; recommended: move TERM-03's display to Phase 64's hosted client, keep a regression row here).
2. **The hidden-at-spawn mark does not exist at the provider or node-pty layer, and using it would hide every Orca terminal.** `initiallyHidden` is a runtime-controller flag meaning "no Orca renderer view exists at spawn" (`orca/src/main/runtime/runtime-pty-controller-contract.ts:99-100`), and every runtime-created terminal sets it (`BACKGROUND_TERMINAL_SPAWN_FLAGS = { initiallyHidden: true, persistHostSessionBinding: true }`, `orca/src/main/runtime/orca-runtime-create-terminal-dependencies.ts:41-44`, spread at `runtime/terminal/launch/terminal-create.ts:171`). `PtySpawnOptions` has no such field. Open a tab for every fresh spawn (Amendment A3).
3. **node-pty's `spawn` is synchronous; the bridge is not.** `spawnShellWithFallback` calls `ptySpawn(...)` and uses the returned object at once (`local-pty-executable-spawn.ts:179-189, 210-226`), and `activateLocalPtySession` reads `proc.pid` before it returns (`local-pty-session-activation.ts:237-238`). The `LocalPtySpawn` type already allows a `Promise` result (`local-pty-runtime-spawn.ts:9-11`) and `spawnLocalPty` awaits it (`local-pty-spawn.ts:116-133`). So S3 should return PB's own async `LocalPtySpawn`, which runs Orca's `spawnShellWithFallback` with the facade's synchronous spawn and then awaits the Theia-side spawn acknowledgement (pid, pts name) before returning. A plain module swap (the pick's S3) would leave `pid` at 0 when Orca first reads it (Amendment A2).
4. **S3 cannot read the switch from `process.env`.** P63-14 deletes `ORCA_PB_THEIA_PTY_ENDPOINT` from orcad's `process.env` before the first spawn (needed: the PTY base environment is `stripInheritedBuildModeEnv(process.env)`, `local-pty-spawn-environment.ts:59`). S2 runs first (`await daemonStartup` at `orcad-entry.ts:169` precedes `registerHeadlessPtyRuntime` at `:263`), so S2 captures and deletes the name into module state and S3 asks that module.
5. **Two answerers for terminal queries.** orcad's own headless emulator answers terminal queries for every runtime PTY by writing through the provider (`this.ptyController?.write(ptyId, reply, 'query-reply')`, `orca/src/main/runtime/terminal/output/headless-terminal-state.ts:53-60`), and its responder includes OSC 7501 (`installProgramStatusQueryResponder(...)`, `orca/src/main/daemon/terminal-view-attribute-responder.ts:103`). Theia's xterm 5.3.0 has no OSC 7501 handler (zero occurrences of `7501` in `theia/node_modules/xterm/lib/xterm.js`) but does answer DA1 (`?1;2c` present) and colour queries (`_handleColorEvent` present). So the 7501 probe is answered once, by orcad, over the bridge (item 2); DA1, DSR and OSC 10/11 can be answered twice while a Theia tab is attached. The live row must measure this (Pitfall 3).
6. **The required member count is 22.** Parsed with TypeScript 5.9.3: `spawn attach write writeWithSettlement resize shutdown sendSignal getCwd getInitialCwd clearBuffer resetInputModes acknowledgeDataEvent hasChildProcesses getForegroundProcess serialize revive listProcesses getDefaultShell getProfiles onData onReplay onExit`; 28 optional. TERM-01, D-28 and ROADMAP criterion 1 say 21. Orca's own TypeScript at the pin is 7.0.2 and exposes no compiler API (`require('orca/node_modules/typescript')` fails), so the check parses with `theia/node_modules/typescript` (Amendment A8).
7. **TERM-04 needs a passthrough only for keys Theia already binds.** In Theia 1.76's browser build only `ctrl+tab` (NEXT_TAB) and `ctrl+shift+tab` (PREVIOUS_TAB) are bound among the six (`common-frontend-contribution.js:794-803`); `ctrl+w`, `ctrl+t`, `ctrl+pageup` and `ctrl+pagedown` have no binding anywhere in `@theia/*/lib/browser` or PB's extensions, so they already reach xterm. Theia itself ships the exact mechanism: a terminal passthrough with `when: 'terminalFocus'` that wins over a global binding through the widget's local context (`terminal-frontend-contribution.js:809-818`). The live row's "in a non-Orca Theia tab Ctrl+T still opens a tab" has no binding to stand on; replace it with an unchanged-from-control comparison (Amendment A6).

**Primary recommendation:** keep Orca's own `LocalPtyProvider`; S2 returns early without a daemon, S3 hands `spawnLocalPty` an async PB spawn that runs Orca's shell-fallback logic over a bridge-backed `IPty` with `processNameIsSpawnFile: true`; serve the PTYs from a `TerminalProcess` subclass in `@powerbrowser/orca-terminals`; take the TERM-03 decision to the owner before p63-04 is planned.

## Answers to the seven open items

1. **Hidden-at-spawn field and `IPty` internals.** No hidden field reaches the provider (`PtySpawnOptions` has none; `initiallyHidden` is a controller flag set on every runtime-created terminal), so every fresh spawn opens a tab. The facade must provide node-pty's 13 required `IPty` members plus `destroy()`, `ptsName` and `processNameIsSpawnFile: true`; it must omit `getForegroundProcessGroup`, `fd`, `signalProcess`, `_pty` and `jobRootProcessIsWrapper`/`shellProcessId`, each of which Orca reads defensively and degrades without.
2. **Does a Theia terminal answer Claude Code's probes?** Theia's xterm 5.3.0 does not answer OSC 7501 (no handler), so orcad's headless emulator is the only answerer and its reply reaches Claude over the bridge; Theia's xterm does answer DA1, DSR and OSC 10/11, which orcad also answers, so duplicates and a DA1-before-7501 ordering race are possible while a tab is attached (hooks still carry status; measure it live).
3. **Remote pairing for P63-11.** PB's own orcad serves no SSH and relays no paired-server terminals, so pairing the Theia backend to it gains nothing; a device credential can only come from a pairing offer (`createPairingOffer` → `encodePairingOffer({... deviceToken ...})`, `runtime-rpc-pairing.ts:148-216`), which is exactly the credential RUN-07 (Phase 67) contains. Smallest variant that keeps secrets out of logs and env: no new credential holder in Phase 63; remote panes display through Phase 64's hosted client, which already holds its own pairing; Phase 63 keeps one hermetic regression row.
4. **Which RPC creates the EXT-02 pane, and presence rules.** `terminal.create` (CLI `orca terminal create --worktree path:<dir> --command <cmd> --title <t> --json`), not `terminal.createAgentSession`, which launches an Orca agent preset itself (`agent: z.string().refine(isTuiAgent, ...)`, `shared/rpc-contract/agent-session-params.ts:169-195`). Presence is proven by the hook sender's parent process (`ORCA_HOOK_AGENT_PID="${PPID:-}"` plus `/proc/<pid>/stat` start time, `agent-hooks/hook-process-capture.ts:1-25`; checked by `probeAgentProcessPresence`, `server/server-agent-presence.ts:125-145`), not by the pane's foreground process, so a pane whose foreground is not `claude` is accepted; whether Orca's terminal-side status inference clears a hook status when the pane shows a shell prompt is not traced and is decided by the hermetic row.
5. **Required member count.** 22, by TypeScript parse of `IPtyProvider` at the pin (blob `45ab217709f10f8c7a6a9b3985c7a03bed987384`); TERM-01/D-28/criterion 1 text should say "derived at the pin (22 at v1.4.248)".
6. **Are S2/S3 the minimal places?** Yes. S2: `orcad-daemon-supervision.ts` (blob `bb10cf6a3fef69bae68477f41aecca1184597c27`, 59 lines), +4 lines after line 21 and +1 import after line 9. S3: `local-pty-runtime-spawn.ts` (blob `baa546bc13fb8f3d218231a5b6ed315666314dbb`, 24 lines), +4 lines after line 14 and +1 import after line 7. Each is 5 added lines, under the 20-line bound; the overlay then holds 3 of 10 seams. No other daemon start path exists (`restartDaemon` throws `'restartDaemon called before initDaemonPtyProvider'` without init, `daemon/daemon-provider-restart.ts:66-70`).
7. **P63-01 vs D-01/D-28.** No conflict with D-28 under either variant if the contract row passes; the subclass (or no class at all) inherits all 22 members and the hook env, while a from-scratch `implements IPtyProvider` class fails `configureLocalPtyProvider`'s `instanceof` check and loses the whole hook environment (TERM-02) unless a third seam is added, and must reimplement about 10.4k lines. D-01's sentence "forwards spawn, write, resize, kill and data to Theia's backend" holds at the node-pty layer, so only its "fifth implementation" wording changes.

## Context amendments

These replace or narrow picks in 63-CONTEXT.md. The coordinator can paste them under `<decisions>` as "Research amendments (2026-11-09)".

- **A1 (amends P63-01): no PB provider class.** orcad keeps its own default `LocalPtyProvider` instance (`registry.ts:15`). S2 returns before the daemon starts, so `setLocalPtyProvider` is never called and `configureLocalPtyProvider` configures that instance (`register-handlers.ts:169`, reached from `orcad-entry.ts:263` after `await daemonStartup` at `:169`). Zero overrides were identified as necessary. If the owner wants a named class for diagnostics, a three-line `class PowerBrowserTheiaPtyProvider extends LocalPtyProvider {}` installed with `setLocalPtyProvider` inside S2 behaves identically. D-01's wording becomes: "orcad's local provider is Orca's own `LocalPtyProvider` over a Theia-backed node-pty layer; spawn, write, resize, kill and data are forwarded at the `IPty` level."
- **A2 (amends P63-02): S2 and S3 shapes.** S2: `if (installPbTheiaPtyBridge()) { return { state: 'unavailable', reason: 'PowerBrowser Theia PTY bridge' } }`; `installPbTheiaPtyBridge()` reads `ORCA_PB_THEIA_PTY_ENDPOINT`, keeps it in module state, deletes it from `process.env`, and returns whether it was set. S3: `const pb = pbTheiaPtyRuntimeSpawn(); if (pb) { return pb }` before the `import('node-pty')`; it returns an async `LocalPtySpawn` (finding 3), not a swapped module. Exact diffs are under "Seam S2" and "Seam S3".
- **A3 (amends P63-07): no hidden-at-spawn exception; title source.** Every fresh spawn (each call of the facade's `spawn`) opens one tab; reattaches never reach node-pty (`reattachLocalPty`, `local-pty-spawn.ts:37-47`). Title: Theia's own OSC-title behaviour (`useServerTitle`, `terminal-widget-impl.js:209-223`) starting from `o<n>`; Orca's pane title is not visible at the PTY layer and arrives with Phase 64.
- **A4 (amends P63-08): flow control and facade members.** Orca's local flow control is `pauseProducer`/`resumeProducer` → `IPty.pause()/resume()` (`local-pty-session-operations.ts:47-61`, called from `ipc/pty/session.ts:222-223`); `LocalPtyProvider.acknowledgeDataEvent` is a no-op (`local-pty-provider.ts:131-133`). The facade forwards `pause`/`resume` to the Theia-side node-pty. The facade sets `processNameIsSpawnFile: true`, provides `ptsName` from the Theia side, and omits `getForegroundProcessGroup` and `fd`. It queues data and exit events until the first `onData`/`onExit` listener subscribes.
- **A5 (amends P63-11, P63-12 and lane p63-04; owner decision): TERM-03.** The pinned orcad has no SSH stack and no paired-server relay (finding 1). Options: **(a, recommended)** display remote panes in Phase 64 through the hosted Orca client (it already holds its own pairing; no new credential holder), re-scope SSH to "an Orca server on the SSH host, reached as a `runtime:` host" (the route Orca itself names: `"ssh: identifies a target this process cannot serve; managed servers route through runtime:"`, `providers/ssh-host-not-served-error.ts:1`) or defer SSH until an upstream orcad serves it, and keep in Phase 63 only a hermetic regression row that a paired-server terminal still works with the switch set; **(b)** the Theia backend pairs to the *remote* server with that server's pairing offer (RUN-07 credential, new user copy, and Orca's end-to-end-encrypted client protocol reimplemented or bundled into Theia); **(c)** port Electron main's SSH stack into orcad (far beyond D-16's seam cap). Lane p63-04 is removed under (a) and its regression row moves to the coordinator.
- **A6 (amends P63-13 and the `orca-terminal-keys-live` row).** Keep all six passthrough rows (they also guard against a plugin binding one of the keys), but use `when: 'terminalFocus && powerbrowser.orcaTerminalActive'`, where `powerbrowser.orcaTerminalActive` is a global context key set from `ApplicationShell` active-widget changes (true when the active widget id matches `/^o\d+$/`). This follows Theia's own `ctrlcmd+v` terminal passthrough. Do not create a second scoped context on the widget node: `TerminalWidgetImpl.init` already owns one for `terminalFocus` (`terminal-widget-impl.js:158-160`). Live row: replace "in a non-Orca Theia tab, Ctrl+T still opens a tab" with "in a `t<n>` tab and a web tab, each key's effect equals a control measurement taken before the Orca extension is loaded".
- **A7 (amends P63-15): RPC, identity names, wrapper shape.** Use `terminal.create` (item 4). Export `ORCA_PANE_KEY`, `ORCA_TAB_ID`, `ORCA_WORKTREE_ID` (the names the hook script reads, `agent-hooks/hook-stdin-contract.ts:102, 113`) and `ORCA_AGENT_HOOK_ENDPOINT=<dataRoot>/agent-hooks/endpoint.env`; `ORCA_TERMINAL_HANDLE` is harmless but not read by the hook. The wrapper cannot both `exec` claude and close the pane afterwards: it spawns `claude` as a child with inherited stdio, forwards SIGINT/SIGTERM/SIGHUP, waits, runs `orca terminal close`, and exits with claude's code. The data-root file lives in the bridge directory (`<pty-bridge dir>/orcad-data-root`, 0600, written by `OrcaService`), so the wrapper finds it relative to itself.
- **A8 (amends P63-17 and the requirement text).** `orca-pty-contract` parses with `theia/node_modules/typescript` (5.9.3) and prints a named SKIP when it is absent; the "22 by reading, 21 by grep" remark is replaced by "22 by parse". With A1 the "PB overrides" clause compares an empty override set (it still runs, so a future override is checked). The facade clause compares against the parsed `IPty` (13 required) and additionally against the derived list of undeclared members Orca reads (see "Derived internals list").
- **A9 (amends P63-04 and P63-06): a `TerminalProcess` subclass and `kind: 'orca'`.** Spawn through an `OrcaTerminalProcess extends TerminalProcess` bound with the same child-container factory Theia uses for `TaskTerminalProcess` (`process-backend-module.js:36-49`), so the bridge can reach the protected node-pty `terminal` for `pause()`, `resume()` and `ptsName`, and can tap output with `terminal.onData` instead of the 1 MB ring buffer (`MultiRingBufferOptions { size: 1048576 }`, `process-backend-module.js:50`). Open Orca widgets with `kind: 'orca'`: a failed attach of a non-`user` widget returns -1 instead of starting a fresh shell (`terminal-widget-impl.js:684-697`), which covers layout restore after a Theia restart. The open-handler exemption alone does not cover that path.

## Project Constraints (from CLAUDE.md)

- Never fork or patch Theia core; consume `@theia/*` as dependencies; `scripts/diff-theia-core.sh` is the check. All Theia work here is new `@powerbrowser/*` extensions and subclasses in them.
- Never modify Gecko outside the patch stack; Firefox internals only through `PowerBrowserAPI.sys.mjs` with `INTERNAL-APIS.md` rows (`check-internals-boundary.sh`). The chrome changes here are `OrcaEnv` (pure) and one environment key in `TheiaService`; no new internal is needed (the Theia backend creates the bridge directory itself, so no `PowerBrowserAPI` permission method is required).
- Design for the bridge: `TabUriRegistry`'s exported shape stays as asserted by `verify-registry-shape.mjs`.
- The repo path contains no space; builds in `nix develop .#firefox|.#theia|.#orca`.
- Theia is the default GUI; no custom browser chrome is authored.
- The residual-brand scan is a permanent gate; stage new files before trusting it; token rows only in `inventory/brand-tokens.json` (coordinator re-measures).
- Patches are regenerated, never text-edited (`regenerate-patches.sh --upstream orca --patches orca-overlay/patches`).
- One driver, one registry (`scripts/verify-platform.sh`); never assert an absence before proving the detector; derive and compare as sets; every check has a `--self-test` that plants faults.
- No internal identifier in user-facing copy (P63-18 adds none).
- Live runs: `flock /home/chris/coding/Power-Browser/.git/pb-live.lock`; chrome JS edits need `-purgecaches`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Terminal model, env assembly, shell-ready, foreground, termination | orcad (Orca's `LocalPtyProvider`, unchanged) | — | All 22 contract members stay Orca's code |
| Daemon suppression | orcad seam S2 | `OrcaEnv` sets the switch | Only place before the daemon process exists |
| node-pty replacement (bridge client, `IPty` facade, async spawn) | orcad overlay files (seam S3) | — | node-pty is loaded for the local provider only at `local-pty-runtime-spawn.ts:15` |
| Physical PTYs | Theia backend (`OrcaTerminalProcess` in `ProcessManager`) | node-pty 1.2.0-beta.12 in `theia/node_modules` | D-07: PTYs die with the backend |
| Bridge server (socket, endpoint file, identity map) | Theia backend, plain Node core | `BackendApplicationContribution` wrapper | Hostable under Node in checks (P63-04) |
| Opening and naming Orca tabs | Theia frontend (`@powerbrowser/orca-terminals`) | backend → frontend RPC notification | Widgets are frontend objects |
| Key policy | Theia frontend keybindings | — | Chrome page keys are already disabled while Theia has focus |
| Bridge directory path, switch name | Chrome pure module `OrcaEnv.sys.mjs` | `TheiaService`, `OrcaService` | One constant both services and checks read |
| EXT-02 wrapper | Node script run on PB's Node, launched by the extension host | orcad CLI (`terminal create/close`) | Outside any PTY by construction |

## Standard Stack

No external package is added. Everything is in the tree.

### Core (reuse, do not rebuild)
| Asset | Where | Purpose |
|-------|-------|---------|
| `LocalPtyProvider` + `configureLocalPtyProvider` | `orca/src/main/providers/local-pty/`, `ipc/pty/provider/local-configure.ts` | The whole provider and its hook env |
| `spawnShellWithFallback` | `local-pty-executable-spawn.ts:191-291` | Shell validation and fallback, reused inside PB's async spawn |
| `TerminalProcess` / `ProcessManager` / `TerminalBackendContribution` | `theia/node_modules/@theia/process` and `@theia/terminal` 1.76.0 | Physical PTY, process registry, the `/services/terminals/:id` channel any `instanceof TerminalProcess` gets for free |
| `TaskTerminalProcess` pattern | `@theia/process/lib/node/task-terminal-process.js` | Precedent for subclassing `TerminalProcess` and writing to `this.ringBuffer` |
| `terminalIdentityOptions`, `PowerBrowserTerminalWidget` | `theia/extensions/tab-uris/src/browser/terminal-naming-contribution.ts` | `{ created, id, title }` identity; `terminal:` URI |
| Passthrough keybinding with a local-context `when` | `@theia/terminal/lib/browser/terminal-frontend-contribution.js:809-818` | TERM-04 mechanism |
| `powerbrowser-env.ts` capture-and-delete | `theia/extensions/token-gate/src/node/powerbrowser-env.ts:66-72` | Receives `POWERBROWSER_ORCA_PTY_DIR` |
| `OrcaEnv.aliasPathFor` | `powerbrowser/shell/OrcaEnv.sys.mjs:185-191` | `$XDG_RUNTIME_DIR/pb-orca-<12 hex>` rule reused for the bridge directory |
| Orca CLI launcher | `<dataRoot>/cli/bin/orca` (62-RESEARCH, Don't Hand-Roll) | `terminal create/close/list`, `agent launch` in rows and the wrapper |
| TypeScript 5.9.3 | `theia/node_modules/typescript` | Parser for `orca-pty-contract` (Orca's TS 7.0.2 has no JS API) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| No provider class (A1) | P63-01 subclass with zero overrides | Same behaviour, one more overlay file and a `setLocalPtyProvider` call in S2; only gains a class name |
| From-scratch `implements IPtyProvider` | — | Fails `instanceof` in `configureLocalPtyProvider` (no hook env), needs a third seam or deep imports, reimplements ~10.4k lines |
| Async PB `LocalPtySpawn` (A2) | Module swap of `node-pty` | Swap returns an `IPty` whose `pid` is 0 when `activateLocalPtySession` reads it (`:237`); memory and inspection see no pid until later |
| `OrcaTerminalProcess` subclass (A9) | `TerminalProcessFactory` as P63-04 says | Factory gives no access to `pause/resume/ptsName` and only the lossy ring-buffer stream |
| `processNameIsSpawnFile: true` | Implement `getForegroundProcessGroup` from `/proc/<pid>/stat` field `tpgid` | The flag is Orca's own designed path; the `/proc` version is Linux-only extra code. `shortcut:` take the flag; upgrade only if the live row shows wrong foreground names |
| Token in `endpoint.json` (P63-03) | Rely on the 0700 directory alone | The token costs a few lines and Phase 68's Windows named pipe needs it; keep it |

**Installation:** none. **Package Legitimacy Audit:** not applicable; no package is added. `node-pty` used by the hermetic bridge-core row is Theia's installed `node-pty@1.2.0-beta.12`.

## Architecture Patterns

### System Architecture Diagram

```
 PowerBrowser launch
   TheiaService.start ── env POWERBROWSER_ORCA_PTY_DIR=<bridge dir> ──> Theia backend
                                                                          │ module load: capture+delete POWERBROWSER_*
                                                                          │ onStart: mkdir 0700, listen <dir>/bridge.sock (0600),
                                                                          │          write <dir>/endpoint.json (0600: socket, token, version)
   OrcaService.start  ── env ORCA_PB_THEIA_PTY_ENDPOINT=<dir>/endpoint.json ──> orcad
                                                                          │ S2: startOrcadDaemon → installPbTheiaPtyBridge() → return 'unavailable'
                                                                          │     (no daemon; registry keeps default LocalPtyProvider)
                                                                          │ configureLocalPtyProvider → buildSpawnEnv with ORCA_* hook env
 Orca client / CLI / agent launch ── terminal.create ──> runtime ──> LocalPtyProvider.spawn
                                                                          │ spawnLocalPty → env → S3: pbTheiaPtyRuntimeSpawn()
                                                                          │   spawnShellWithFallback(ptySpawn = facade.spawn)
                                                                          │   facade.spawn ─(spawn frame: file,args,cwd,cols,rows,env)──┐
                                                                          │   await ack {pid, ptsName} <────────────────────────────────┤
                                                                          v                                                              v
                                          activateLocalPtySession(proc = facade IPty)          Theia bridge core: new OrcaTerminalProcess
                                                                                                 │ node-pty spawn with exactly that env
   orcad writes (terminal.send, startup cmd, query replies) ── write frame ──────────────────────>│ terminal.write
   PTY output <── data frame ─────────────────────────────────────────── terminal.onData ────────┤
                                                                                                 │ ring buffer → /services/terminals/<pid-id>
                                                                                                 v
                                                Theia frontend: open widget o<n> (kind 'orca', no focus), start(processId)
                                                keystrokes → channel → OrcaTerminalProcess.write (not via orcad)
   orcad's pid-based inspection/kill (ps, /proc, process groups) acts directly on the Theia-spawned pids (same host, same uid)
   bridge drop: Theia kills that connection's PTYs after grace (P63-10); Theia stop: ProcessManager.onStop kills all
```

### Recommended file layout

```
orca-overlay/
  seams.json                                              + 2 rows (S2, S3)
  patches/020-pb-theia-pty-daemon-skip.patch              S2 (regenerated)
  patches/030-pb-theia-pty-runtime-spawn.patch            S3 (regenerated)
  files/src/main/providers/local-pty/pb-theia-pty-bridge.ts     install/capture, client, facade, async LocalPtySpawn
  files/src/main/providers/local-pty/pb-theia-pty-protocol.ts   message-name set (overlay copy)
theia/extensions/orca-terminals/                           @powerbrowser/orca-terminals
  package.json                                             deps: @theia/core, @theia/process, @theia/terminal 1.76.0, @powerbrowser/tab-uris
  src/common/orca-pty-protocol.ts                          message-name set (Theia copy) + RPC service path
  src/node/orca-pty-bridge-core.ts                         plain Node: socket server, framing, identity map, grace kill
  src/node/orca-terminal-process.ts                        OrcaTerminalProcess extends TerminalProcess (+ factory)
  src/node/orca-terminals-backend-module.ts                BackendApplicationContribution + RPC server
  src/browser/orca-terminals-frontend-module.ts            tab opener, o<n> minting display, context key, keybindings
theia/extensions/orca-agents/                              @powerbrowser/orca-agents (preference default; see Open Question 2)
  bin/claude-wrapper.mjs                                   EXT-02 wrapper (Node on PB's Node)
powerbrowser/shell/OrcaEnv.sys.mjs                         + ORCA_PB_THEIA_PTY_ENDPOINT in ORCAD_FIXED_ENV_NAMES, + ptyBridgeDirFor()
powerbrowser/shell/TheiaService.sys.mjs                    + POWERBROWSER_ORCA_PTY_DIR in the environment object
powerbrowser/shell/OrcaService.sys.mjs                     + endpoint env, + <dir>/orcad-data-root (0600) for the wrapper
theia/extensions/tab-uris/src/browser/terminal-open-handler.ts   o<n> stale-name exemption
docs/URI-SCHEMES.md                                        + o<n> row
scripts/verify-orca-pty-contract.mjs, verify-orca-terminal-keys.mjs, verify-orca-agent-hooks.mjs,
scripts/verify-orca-pty-provider-live.mjs, verify-orca-terminal-keys-live.mjs   (new)
```
Every overlay source file carries the literal `pb-overlay:<path relative to the Orca root>` in reachable code (`MARKER = /pb-overlay:([A-Za-z0-9._/-]+)/g`, `scripts/verify-orca-overlay.mjs:57`), or `orca-overlay` goes red. These are the first `files/` entries, so they are also the first real proof of the marker method (62-RESEARCH A6).

### Seam S2 (pre-image `src/main/orcad/orcad-daemon-supervision.ts`, blob `bb10cf6a3fef69bae68477f41aecca1184597c27`)

Pre-image lines 7-9 and 18-22 [VERIFIED: read this session]:
```ts
import { initDaemonPtyProvider } from '../daemon/daemon-provider-init'
import { resolveTerminalSpawnAdmissionMode } from '../daemon/terminal-spawn-gate'
import { errorMessage } from '../../shared/error-message'
...
/** Continue serving without a daemon on failure, but never claim terminal persistence. */
export async function startOrcadDaemon(
  platform: NodeJS.Platform = process.platform
): Promise<OrcadDaemonStartup> {
  // Daemons must survive SSH logout; macOS GUI-session retirement would kill their terminals.
```
Post-image (5 added lines; `OrcadDaemonStartup` already has `| { state: 'unavailable'; reason: string }`, lines 13-16):
```ts
import { errorMessage } from '../../shared/error-message'
import { installPbTheiaPtyBridge } from '../providers/local-pty/pb-theia-pty-bridge'
...
): Promise<OrcadDaemonStartup> {
  if (installPbTheiaPtyBridge()) {
    return { state: 'unavailable', reason: 'PowerBrowser Theia PTY bridge' }
  }
  // Daemons must survive SSH logout; macOS GUI-session retirement would kill their terminals.
```
Effects [VERIFIED]: the return value is not read (`daemonStartup` is only awaited, `orcad-entry.ts:75, 169`); `getDaemonEndpointFacts()` returns null with no adapter (`daemon-provider-state.ts:53-56`), so health reports `state: 'absent', pid: null` (`orcad-health.ts:100-110`); `canRecoverPersistentLocalPtys` is false (`orcad-entry.ts:211`).

### Seam S3 (pre-image `src/main/providers/local-pty/local-pty-runtime-spawn.ts`, blob `baa546bc13fb8f3d218231a5b6ed315666314dbb`)

Pre-image lines 7 and 13-15 [VERIFIED: read this session]:
```ts
import { reportNodePtyLoadFailure } from '../node-pty-load-failure'
...
/** Degraded daemon routing loads node-pty lazily, as the daemon does. */
export async function loadLocalPtyRuntimeSpawn(): Promise<LocalPtySpawn> {
  const pty = await import('node-pty').catch((error: unknown) => {
```
Post-image (5 added lines):
```ts
import { reportNodePtyLoadFailure } from '../node-pty-load-failure'
import { pbTheiaPtyRuntimeSpawn } from './pb-theia-pty-bridge'
...
export async function loadLocalPtyRuntimeSpawn(): Promise<LocalPtySpawn> {
  const pb = pbTheiaPtyRuntimeSpawn()
  if (pb) {
    return pb
  }
  const pty = await import('node-pty').catch((error: unknown) => {
```
`LocalPtySpawn` is a non-exported local type (lines 9-11); the overlay file types its return as `Awaited<ReturnType<typeof loadLocalPtyRuntimeSpawn>>` through a type-only import, which creates no runtime cycle. With the switch unset `pbTheiaPtyRuntimeSpawn()` returns null and the stock path runs, so one built orcad is both the control and the PB run (the P62-14 pattern).

### The facade's member table (what `IPty` the S3 spawn returns)

| Member | Source of the requirement | Facade behaviour |
|---|---|---|
| `pid` | `IPty` required; read at `local-pty-session-activation.ts:237`, termination, inspection | Real pid from the Theia spawn ack (async spawn awaits it) |
| `cols`, `rows` | `IPty`; `getLocalPtyAppliedSize` (`session-operations.ts:64-72`) | Updated on every `resize` and on Theia-side resizes reported by the bridge |
| `process` | `IPty`; `listLocalPtyProcesses` title (`:133`) | Basename of the spawn file (static) |
| `processNameIsSpawnFile` | undeclared; `spawn-file-foreground-process.ts:41-43` | `true`: Orca resolves foreground from the process table by pid |
| `handleFlowControl` | `IPty` | `false` |
| `onData`, `onExit` | `IPty`; `session-activation.ts:140, 153` | Events; queued until the first listener; `onExit` maps Theia's signal name to a number |
| `write`, `resize`, `kill`, `clear`, `pause`, `resume` | `IPty` | Frames over the bridge; `clear` no-op (node-pty's is Windows-only); `kill` must be an assignable property (Orca overwrites it, `session-activation.ts:164-167`) |
| `destroy` | undeclared; `local-pty-termination.ts:110-122` | Close the bridge handle; Theia kills the process if still alive |
| `ptsName` | undeclared; `node-pty-pts-name.ts:2-5` (SIGWINCH path) | From Theia's `terminal.ptsName` (`node-pty/lib/unixTerminal.js:164-165`) in the ack |
| `getForegroundProcessGroup` | Orca node-pty patch (`config/patches/node-pty@1.1.0.patch` lines 2162-2202) | Omitted → `readPtyForegroundGroup` returns `undefined` → root-pid path (`pty-master-foreground-observation.ts:20-43`) |
| `fd` | undeclared; `node-pty-master-fd-retirement.ts:3-9` | Omitted → "not retired" |
| `signalProcess`, `_pty`, `jobRootProcessIsWrapper`, `shellProcessId` | Windows-only reads (`session-operations.ts:79`, `windows/windows-pty-job.ts:26-29, 60`) | Omitted |

**Derived internals list (for `orca-pty-contract`).** At check time grep `orca/src/main/providers/local-pty/*.ts`, `orca/src/main/pty/process-retirement/*.ts`, `orca/src/main/daemon/pty-subprocess/spawn-file-foreground-process.ts` and `orca/src/main/windows/windows-pty-job.ts` (non-test) for `'<name>' in proc`, `(proc as { <name>` and `(proc as unknown as { <name>`; the set today is `{ptsName, fd, getForegroundProcessGroup, processNameIsSpawnFile, signalProcess, kill, destroy, _pty}`. The row compares it with a tracked disposition table in the script (provided / omitted-with-degrade), so a new undeclared read after a re-pin goes red naming it. This is the one place the subclass variant moves re-pin exposure; it replaces the `IPtyProvider` exposure D-28 counted.

### Theia side

- **`OrcaTerminalProcess extends TerminalProcess`**, `@injectable()`, no constructor (the `TaskTerminalProcess` shape). After `super(...)` the constructor body can read `this.terminal` (protected) and subscribe `this.terminal.onData` for the bridge sink; it exposes `pause()`, `resume()`, `ptsName`. Bind `OrcaTerminalProcessFactory` with a child container exactly as `TerminalProcessFactory` is bound (`process-backend-module.js:36-42`), so it gets a fresh `MultiRingBuffer`. `TerminalBackendContribution` attaches any `instanceof TerminalProcess` (`terminal-backend-contribution.js`, channel handler), and `BaseTerminalServer.attach` accepts it (`base-terminal-server.js:39-48`).
- **Environment is exact.** `createPseudoTerminal` passes `options.options` straight to node-pty (`terminal-process.js:118-119`); node-pty uses `env` as given. Pass `options: { name: <TERM>, cols, rows, cwd, env }`.
- **Backpressure.** When the bridge socket's `write()` returns false, call `terminal.pause()` and resume on `'drain'`; the same pause serves Orca's `pauseProducer`. This stalls the widget too, which is node-pty's own semantics for a single slow consumer.
- **Frontend.** On a backend notification `{ name: 'o<n>', processId }`, call `terminalContribution.newTerminal({ ...terminalIdentityOptions(name), kind: 'orca', useServerTitle: true })`, `await widget.start(processId)`, then open in the main area with an open mode that does not activate. On connect, ask the backend for the live map and open only names not already restored (`TerminalFrontendContribution.getById(name)`).
- **Lifecycle.** `ProcessManager.onStop` unregisters and kills every process (`process-manager.js:61-90`). Closing an `o<n>` tab kills its process (`dispose` → `shellTerminalServer.close`, `terminal-widget-impl.js:918-925`), which Orca sees as an exit; that is the intended D-01 behaviour.

### Anti-Patterns to Avoid
- **Keeping the hidden-at-spawn skip.** It would hide every runtime-created terminal (finding 2).
- **Reading `ORCA_PB_THEIA_PTY_ENDPOINT` from `process.env` in S3.** It is deleted before the first spawn.
- **Logging bridge frames or spawn options.** The spawn env carries `ORCA_AGENT_HOOK_TOKEN` (`server-runtime-env.ts:15-19`); bridge logs name message types and ids only.
- **`createScoped(widget.node)` a second time** for a new context key: it competes with the widget's own scoped context.
- **Re-pairing the Theia backend to PB's own orcad for remote tabs** (finding 1).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| A provider for orcad | A from-scratch `IPtyProvider` | Orca's `LocalPtyProvider` | 22 members, hook env, shell-ready, termination already correct |
| Shell validation and fallback | PB spawn logic | `spawnShellWithFallback` inside PB's async spawn | Same behaviour as stock, macOS TCC wrap included |
| Foreground process detection | `/proc` tpgid reader | `processNameIsSpawnFile: true` | Orca's designed path for a static-name `IPty` |
| A PTY in Theia | Raw node-pty + own channel | `OrcaTerminalProcess` in `ProcessManager` + `TerminalBackendContribution` | Widget attach, reload, kill-on-stop are free |
| Pane identity for EXT-02 | Hand-written RPC client | Orca CLI launcher `terminal create/close --json` | Handles socket discovery and auth |
| Required-member derivation | Line grep | TypeScript parser (`ts.createSourceFile`) | Grep miscounts optional and multi-line members |
| Key passthrough | DOM key listeners | `KeybindingRegistry.PASSTHROUGH_PSEUDO_COMMAND` with a `terminalFocus` clause | Theia's own terminal uses it |

## Common Pitfalls

### Pitfall 1: The spawn acknowledgement arrives after Orca subscribed
**What goes wrong:** output or an early exit (a shell that fails at once) is lost between the ack and `proc.onData`/`proc.onExit` subscription.
**How to avoid:** the facade queues data and exit until the first listener of each, then flushes in order. Self-test: a fixture bridge that sends data and exit before the ack.

### Pitfall 2: Endpoint not written yet when orcad restores terminals
orcad may spawn restored panes right after start; Theia's `onStart` timing relative to the ready sentinel was not traced. The facade's first spawn retries reading `endpoint.json` and connecting for a bounded time (for example 10 s) before failing the spawn with a clear error; it never falls back to real node-pty (that would put a PTY outside Theia silently).

### Pitfall 3: Duplicate terminal-query replies
orcad's headless emulator answers DA1, DSR, colour queries and OSC 7501 for every PTY; Theia's xterm answers DA1, DSR and OSC 10/11 while a tab is attached. Effects: a stray `^[[r;cR` in a program that sends DSR, and a DA1 reply that can overtake orcad's 7501 reply, so Claude may decide no 7501 support (hooks still carry status). orcad's emulator also keeps its spawn size when only Theia resizes. **How to handle:** the live row sends `printf '\e[6n'` in an `o<n>` tab and counts replies; if more than one arrives, the planned fix is in `PowerBrowserTerminalWidget` for `o<n>` widgets: register xterm parser handlers that swallow DA1/DA2/DSR and OSC 10/11/12 queries so orcad is the single reply owner (Orca's own rule for a view that is not an Orca renderer), and report Theia-side resizes to the facade.

### Pitfall 4: A restored `o<n>` widget becomes a plain shell
After a Theia restart, layout restore calls `start(terminalId)`; a failed attach on a `user`-kind widget creates a fresh shell (`terminal-widget-impl.js:692-694`). Use `kind: 'orca'` (A9).

### Pitfall 5: Kill semantics differ from the daemon
Theia's `kill()` sends node-pty's default signal to the shell only; Orca's own termination also signals process groups by pid (`forceKillPosixPtyProcessGroupsSync(proc.pid, ...)`, `local-pty-termination.ts:69, 90`). Processes that left the session (`setsid`, `nohup`) survive both, as in stock Orca. The P63-09 quit row must walk descendants, not trust group kills.

### Pitfall 6: The agent-hook script and Claude settings are user-wide
`getSharedManagedScriptPath` returns `join(homedir(), '.orca', 'agent-hooks', scriptFileName)` ("Parallel Orca instances must share one user-wide script path", `agent-hooks/installer-utils.ts:112-114`), and Claude's hooks go into the user's Claude settings. PB's orcad shares both with an installed Orca desktop on this host. Routing is per pane through `ORCA_AGENT_HOOK_ENDPOINT`, so status reaches the right server; hermetic rows must run orcad with a scratch `HOME` so they never edit the user's files.

### Pitfall 7: Non-PTY agent sessions are not terminals
Chat-mode and structured agent sessions (`viewMode: 'chat'`, ACP) run as orcad children without a PTY; they are not Theia tabs and are covered by orcad's own stop, not by TERM-01. State this in the plan so the criterion-1 row does not chase them.

### Pitfall 8: The env allowlist row from Phase 62
`orca-service-live` compares orcad's environ with `ORCAD_FIXED_ENV_NAMES ∪ allowlist`. Add `ORCA_PB_THEIA_PTY_ENDPOINT` to `ORCAD_FIXED_ENV_NAMES` (`OrcaEnv.sys.mjs:19-26`) in the same change, or that row goes red.

### Pitfall 9: Brand rows and markers
New overlay files spell `ORCA_` and patches quote Orca source; counts in `inventory/brand-tokens.json` churn and are re-measured once by the coordinator on the staged tree.

## Code Examples

### The orcad-side module (shape; values verified above)
```ts
// files/src/main/providers/local-pty/pb-theia-pty-bridge.ts
import type { loadLocalPtyRuntimeSpawn } from './local-pty-runtime-spawn'
import { spawnShellWithFallback } from './local-pty-executable-spawn'
type LocalPtySpawn = Awaited<ReturnType<typeof loadLocalPtyRuntimeSpawn>>
const MARKER = 'pb-overlay:src/main/providers/local-pty/pb-theia-pty-bridge.ts'
let endpointFile: string | null = null

export function installPbTheiaPtyBridge(): boolean {
  endpointFile = process.env.ORCA_PB_THEIA_PTY_ENDPOINT ?? null
  delete process.env.ORCA_PB_THEIA_PTY_ENDPOINT // PTY base env is read from process.env at spawn
  return endpointFile !== null
}

export function pbTheiaPtyRuntimeSpawn(): LocalPtySpawn | null {
  if (!endpointFile) return null
  return async (params) => {
    const result = spawnShellWithFallback({ ...params, ptySpawn: bridgeSpawn })
    await (result.process as BridgePty).started // pid and ptsName known before Orca reads them
    return result
  }
}
```

### Required-member derivation (Node, run this session)
```js
const ts = require(`${repo}/theia/node_modules/typescript`)
const sf = ts.createSourceFile(f, readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true)
// IPtyProvider is a type alias to a type literal; required = members without questionToken
// Result at 965978bc: 22 required, 28 optional.
```

### Keybinding (frontend)
```ts
for (const keybinding of ['ctrl+w', 'ctrl+t', 'ctrl+tab', 'ctrl+shift+tab', 'ctrl+pageup', 'ctrl+pagedown']) {
  keybindings.registerKeybinding({
    command: KeybindingRegistry.PASSTHROUGH_PSEUDO_COMMAND,
    keybinding,
    when: 'terminalFocus && powerbrowser.orcaTerminalActive',
  })
}
```

### EXT-02 wrapper (Node, shape)
```js
// argv: [claudePath, ...args] as the extension passes them (ASSUMED shape, see Assumptions A3)
const dataRoot = readFileSync(join(dirname(realpathSync(process.argv[1])), 'orcad-data-root'), 'utf8').trim()
const cli = join(dataRoot, 'cli', 'bin', 'orca')
const env = { ...process.env, ORCA_USER_DATA_PATH: dataRoot }   // CLI only; never exported to claude
const pane = JSON.parse(execFileSync(cli, ['terminal', 'create', '--worktree', `path:${process.cwd()}`,
  '--title', 'Claude (extension)', '--command', 'cat', '--json'], { env }))
const child = spawn(process.argv[2], process.argv.slice(3), { stdio: 'inherit', env: { ...process.env,
  ORCA_PANE_KEY: pane.paneKey, ORCA_TAB_ID: pane.tabId, ORCA_WORKTREE_ID: pane.worktreeId,
  ORCA_AGENT_HOOK_ENDPOINT: join(dataRoot, 'agent-hooks', 'endpoint.env') } })
// forward signals; on exit: execFileSync(cli, ['terminal', 'close', ...]); process.exit(code)
```
The placeholder `--command` and the JSON field names of the CLI result (`RuntimeTerminalCreate`: `handle`, `tabId?`, `paneKey?`, `ptyId?`, `worktreeId`, `shared/runtime-terminal-create-contract.ts:5-27`) are verified; whether `paneKey` is non-null for a headless orcad create is checked by the hermetic row.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| orcad PTYs in a detached terminal daemon (Phase 62 reaps it) | PTYs in Theia's backend, no daemon | This phase | Agents end with PowerBrowser by construction (D-07); Phase 62's daemon reap becomes a no-op path |
| P63-01 subclass | Orca's default `LocalPtyProvider` instance | This research | One fewer overlay file; contract row compares Orca's class |
| D-28 "21 required members" | 22, derived at check time | This research | Requirement text changes; the check never hard-codes a number |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | xterm 5.3.0 answers DSR/CPR and OSC 10/11 in the frontend (inferred from `_handleColorEvent` and the DA1 string in the bundle; DSR not grepped) | Pitfall 3 | If it answers fewer, duplicates are fewer; the live row measures it either way |
| A2 | Theia's `onStart` may complete after the backend-ready sentinel | Pitfall 2 | The bounded retry covers both orders |
| A3 | `claudeCode.claudeProcessWrapper` is invoked as `<wrapper> <claude path> <args...>` and the extension runs `claude` without a TTY | Code Examples | The wrapper's argv handling changes; verified only with EXT-01 (deferred) |
| A4 | Orca's terminal-side status inference does not clear a hook-reported status when the pane's foreground is a placeholder (`cat`) | Item 4 | EXT-02 status flickers or clears; the hermetic row decides and the pane command can change |
| A5 | A Theia preference default can override a plugin-contributed property's default at runtime | Open Question 2 | The wrapper path must reach the extension another way |
| A6 | `paneKey` is present in `terminal create --json` output from a headless orcad | Code Examples | The wrapper cannot set `ORCA_PANE_KEY`; the hermetic row goes red naming it |

## Open Questions

1. **TERM-03 (owner decision, blocks p63-04).** See A5. Recommended option (a).
2. **How the wrapper path reaches the extension.** The app-level default mechanism exists (`theia.frontend.config.preferences` in `theia/applications/browser/package.json:21-24`) but takes static values, and the wrapper's absolute path differs between the dev tree, packaged builds and profiles. Options: the `orca-agents` frontend registers a default-scope value at runtime from a path its backend reports (needs A5); or a stable per-profile path in the bridge directory. Unverifiable until EXT-01; the hermetic row runs the wrapper directly, so this does not block the phase.
3. **Duplicate query replies.** Decide after the live measurement (Pitfall 3).
4. **Does the Theia backend start the bridge before or after its ready sentinel?** Settled by the bounded retry; the live row logs the order once.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Built `orca/out` at 965978bc | live rows | yes (S1 applied) | `out/orcad/orcad.js`, `daemon-entry.js` | rebuild after S2/S3: `nix develop .#orca --command bash scripts/build-orca.sh` |
| PB Node | orcad, wrapper, hermetic rows | yes | `.mozbuild/orca-probe-node/node` v24.19.0 | `ensurePbNode()` |
| Theia `typescript` | `orca-pty-contract` | yes | 5.9.3 | named SKIP |
| Theia `node-pty` | bridge core under Node | yes | 1.2.0-beta.12 | none |
| Theia `xterm` | Pitfall 3 analysis | yes | 5.3.0 | — |
| Built PowerBrowser | live rows | yes, stale | `objdir/dist/bin/powerbrowser` | `./mach build faster` after the chrome edits |
| `claude` CLI | `orca-agent-status-live` | yes | 2.1.321 (OSC 7501 since 2.1.295 per Orca README) | none; row SKIPs naming it |
| `sshd` | only if A5 (b)/(c) is chosen | yes | system OpenSSH | — |
| `flock` | live rows | yes | util-linux | none |

**Missing with no fallback:** none.

## Validation Architecture

(`workflow.nyquist_validation` is `true`.) All rows are automated; no human check is created (D-18). Rows go after `orca-service-live-self-test` (`scripts/verify-platform.sh:3883`, quick) and after `orca-service-live` (`:6466`, full), each lane in its own `# NEW (63-0N, ...)` block.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node 24 scripts under the `verify-platform.sh` registry |
| Config file | none |
| Quick run command | `scripts/verify-platform.sh --only <label>` / `--quick` |
| Full suite command | `flock /home/chris/coding/Power-Browser/.git/pb-live.lock scripts/verify-platform.sh --only <live label>` |

### Phase Requirements → Test Map
| Criterion / Req | Behavior | Row(s) | Tier | Self-test plants (each must go red naming it) | Needs |
|---|---|---|---|---|---|
| SC1 / TERM-01 (contract) | parsed required `IPtyProvider` set ⊆ members of the installed provider class (Orca's `LocalPtyProvider`, parsed from `local-pty-provider.ts`); PB override set ⊆ contract ∪ class; facade ⊇ parsed `IPty` required set; derived undeclared-read set equals the disposition table; Theia and overlay message sets equal | `orca-pty-contract`, `orca-pty-contract-self-test` | quick (SKIP when `orca/` or Theia `typescript` absent) | added required member; stale override; facade missing `resize`; new undeclared read (`'foo' in proc`); message on one side only; zero members parsed ("source moved") | `orca/`, `theia/node_modules/typescript` |
| SC1 / TERM-01 (seams) | S2/S3 rows in `seams.json`, blobs, ≤20 lines, 3 ≤ cap 10, marker literals | existing `orca-overlay`, `-self-test`, `orca-overlay-built` | quick / full | existing plants | `orca/`, built `orca/out` |
| SC1 / TERM-01 (live) | preflight `ok`; switch set: `health.terminalDaemon.state` `absent`, no process whose argv contains the daemon entry (path derived from `orca/out`), a CLI-created terminal's parent chain reaches the bridge host pid; **control first**: same orcad without the switch shows the daemon to the same detector, else "detector blind" | `orca-pty-provider-live` (bridge core hosted under Node, no PowerBrowser) | full | pure verdicts: detector blind; daemon present with switch; parent chain ends at orcad; preflight not ok | built `orca/out`, PB Node |
| SC1 / TERM-01 (tab) | in PowerBrowser, the terminal appears as `o<n>` (BiDi DOM read) and a typed marker round-trips; DSR reply count recorded (Pitfall 3) | `orca-pty-provider-live` second stage | full | — | built PB after `faster`, Theia rebuilt |
| SC2 / TERM-02 | provider-spawned PTY environ: hook names equal `AGENT_HOOK_RUNTIME_ENV_KEYS` minus `ORCA_CLAUDE_AGENT_STATUS_SETTINGS` (it is a deletion key) plus pane identity names, derived from `spawn-env-keys.ts:4-13`; transport name absent, **control** present in orcad's environ; managed hook script on synthetic events reads back working, waiting, done | `orca-agent-hooks`, `-self-test` | full, hermetic, scratch `HOME` | transport name present in PTY; hook name missing; control absent (instrument blind); status sequence out of order | built `orca/out` |
| SC2 / TERM-02 (real agent) | `orca agent launch --agent claude --surface terminal`, ≤2 model turns, record counts before/after | `orca-agent-status-live` | full | — | owner's `claude` login |
| SC3 / TERM-03 | per A5 (a): a paired second orcad, created through the CLI's `environment add` with the offer held in memory (never argv-logged), `terminal create/send/read --environment` still works with the switch set on the first | `orca-remote-regression` (coordinator) | full | — | two orcads, scratch roots |
| SC4 / TERM-04 (static) | key set derived from `PAGE_KEYS` ids `newTab closeTab nextTab prevTab nextTabPage prevTabPage` (`powerbrowser.js:437-452`) mapped to Theia key strings with literal `ctrl`; equals the passthrough set; every row's `when` is the declared clause; `t<n>` bindings unchanged | `orca-terminal-keys`, `-self-test` | quick | missing key; wrong `when`; `ctrlcmd` spelling; extra key | tree only |
| SC4 / TERM-04 (live) | in `o<n>`: PTY receives `^W`, `^T`, Tab/PageUp/PageDown sequences (`cat -v` marker), tab count unchanged; in `t<n>` and a web tab: each key's effect equals the control run without `orca-terminals` | `orca-terminal-keys-live` | full | — | built PB |
| SC5 / EXT-02 | wrapper with stub `claude` (runs the managed hook script with `$PPID` = stub pid): pane created, status read back live by `paneKey`, pane closed on exit, wrapper exit code = stub's | `orca-agent-hooks` third stage | full, hermetic | pane not closed; wrong exit code; `ORCA_PANE_KEY` missing from stub env | built `orca/out` |
| RUN-05 carry (P63-09) | quit and SIGKILL rows include provider-created PTYs and descendants under the Theia backend | `orca-service-live` (extended) | full | existing fixtures + "no PTY recorded" (vacuous) | built PB |

### Sampling Rate
- **Per task commit:** the lane's quick rows plus `node scripts/scan-brand-residue.mjs` after staging.
- **Per wave merge:** `scripts/verify-platform.sh --quick`.
- **Phase gate:** `--quick` green, then under the live lock: `orca-overlay-built`, `orca-pty-provider-live`, `orca-agent-hooks`, `orca-terminal-keys-live`, `orca-service-live`, `orca-agent-status-live`.

### Wave 0 Gaps
- [ ] The five new `scripts/verify-orca-*.mjs` files, each with `--self-test`.
- [ ] `OrcaEnv.sys.mjs` additions before any row that imports them.
- [ ] `diff-theia-core`, `registry-shape`, `internals-boundary`, `shell-error-copy-no-internals` re-run because the lanes touch their inputs.

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Bridge: 0600 socket in a 0700 directory plus the token in a 0600 `endpoint.json`; no device credential added (A5 a) |
| V4 Access Control | yes | Theia side refuses a socket directory whose mode grants group/other; orcad side refuses an endpoint file with such a mode |
| V5 Input Validation | yes | Frame schema check on both sides; spawn `cwd`/`file` must be absolute; unknown message types dropped and counted |
| V8 Data Protection | yes | The spawn env carries `ORCA_AGENT_HOOK_TOKEN`; never log env or frame payloads; the transport path is deleted from orcad's `process.env` before the first spawn |
| V6 Cryptography | no | none added (token from `crypto.randomBytes(32)`) |

| Pattern | STRIDE | Mitigation |
|---------|--------|------------|
| Same-uid process connects to the bridge and spawns PTYs | Elevation (within uid) | Token check; same uid can already run anything, so this is defence against path confusion, not a boundary |
| Bridge log leaks hook token | Information disclosure | Log types and ids only; self-test plants a sentinel token and requires it absent from the log |
| Plain shell posing as an Orca terminal | Spoofing | `o<n>` exemption in the open handler and `kind: 'orca'` on restore |
| Stale PTYs after orcad crash | DoS / resource | Grace kill per connection (P63-10) |

## Sources

### Primary (HIGH; read or run this session)
- Orca at 965978bc: `src/main/providers/pty-provider-contract.ts` (parsed), `providers/local-pty/{local-pty-provider.ts, local-pty-spawn.ts, local-pty-runtime-spawn.ts, local-pty-executable-spawn.ts, local-pty-session-activation.ts, local-pty-session-operations.ts, local-pty-termination.ts, local-pty-foreground-inspection.ts, local-pty-provider-types.ts}`, `pty/process-retirement/{node-pty-pts-name.ts, node-pty-master-fd-retirement.ts, pty-master-foreground-observation.ts}`, `daemon/pty-subprocess/spawn-file-foreground-process.ts`, `windows/windows-pty-job.ts`, `ipc/pty/provider/{registry.ts, local-configure.ts}`, `ipc/pty/register-handlers.ts`, `orcad/{orcad-daemon-supervision.ts, orcad-entry.ts, orcad-health.ts, orcad-local-serve-selection.ts, main.ts, orcad-managed-agent-hooks.ts}`, `daemon/{daemon-provider-state.ts, daemon-provider-restart.ts, headless-emulator.ts, terminal-view-attribute-responder.ts}`, `runtime/{orca-runtime-create-terminal-dependencies.ts, runtime-pty-controller-contract.ts, terminal/launch/terminal-create.ts, terminal/output/headless-terminal-state.ts, headless-terminal-query-reply-policy.ts, rpc/methods/agent-session.ts, rpc/methods/ssh.ts, runtime-rpc/{runtime-rpc-websocket-dispatch.ts, runtime-rpc-pairing.ts, runtime-rpc-pairing-types.ts, runtime-rpc-mobile-pairing.ts, runtime-rpc-long-poll.ts}}`, `ssh/targets/ssh-target-registry.ts`, `startup/{main-process-runtime-launch.ts, headless-serve-ssh-registration.ts}`, `agent-hooks/{README.md, hook-script-outside-orca.test.ts, hook-process-capture.ts, hook-stdin-contract.ts, installer-utils.ts, server/server-runtime-env.ts, server/server-agent-presence.ts, server/agent-exit-evidence.ts}`, `ipc/pty/host-env/spawn-env-keys.ts`, `shared/{program-status/query-responder.ts, program-status/protocol.ts, rpc-contract/agent-session-params.ts, runtime-terminal-create-contract.ts, execution-host.ts, orcad-native-preflight-report.ts, agent-hook-listener/endpoint-publication.ts}`, `cli/specs/{core.ts, environment.ts, serve.ts}`, `config/patches/node-pty@1.1.0.patch`, `node_modules/node-pty/typings/node-pty.d.ts` (parsed).
- Theia 1.76.0: `@theia/process/lib/node/{terminal-process.js/.d.ts, process.d.ts, process-backend-module.js, process-manager.js, pseudo-pty.js, task-terminal-process.js}`, `@theia/terminal/lib/{node/terminal-backend-contribution.js, node/base-terminal-server.js, browser/terminal-widget-impl.js, browser/base/terminal-widget.d.ts, browser/terminal-frontend-contribution.js}`, `@theia/core/lib/browser/{common-frontend-contribution.js, keybinding.js}`, `node-pty/lib/unixTerminal.js`, `xterm/lib/xterm.js` (grepped), `typescript` 5.9.3 (used).
- PB tree: `theia/extensions/{tab-uris/src/browser/{terminal-naming-contribution.ts, terminal-open-handler.ts}, chrome-bar/src/browser/{chrome-bar-keybindings.ts, chrome-bar-shortcuts.ts}, token-gate/src/node/powerbrowser-env.ts}`, `theia/applications/browser/package.json`, `powerbrowser/shell/{OrcaEnv.sys.mjs, OrcaService.sys.mjs, TheiaService.sys.mjs, powerbrowser.js}`, `orca-overlay/{seams.json, patches/010-installed-electron-switch.patch}`, `scripts/{verify-orca-overlay.mjs, verify-platform.sh}`, `configuration.toml [orca]`, spike 006 notes on `refs/heads/ServerDestroyer/p61-03`.

### Secondary / Tertiary
- None. Items not read are in the Assumptions Log.

## Metadata

**Confidence breakdown:**
- Seams, facade contract, member count: HIGH (read and parsed at the pin).
- Theia-side mechanics: HIGH on the APIs read; MEDIUM on the integration until built.
- TERM-03 finding: HIGH (three independent source sites agree).
- EXT-02 presence and wrapper: MEDIUM (presence rule read; terminal-side inference not traced; extension argv assumed).

**Research date:** 2026-11-09
**Valid until:** the Orca pin moves; `orca-pty-contract`'s derived checks re-prove the contract, the facade surface and the undeclared reads at each re-pin.
