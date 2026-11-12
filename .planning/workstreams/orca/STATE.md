---
gsd_state_version: "1.0"
milestone: v1.7
current_phase: 59
current_phase_name: Carry-forward from v1.5 and v1.6
status: executing
stopped_at: Completed 66-10-PLAN.md
last_updated: "2026-11-11T21:08:06.463Z"
last_activity: 2026-11-08
last_activity_desc: Phase 59 execution started
state_head: a625378d3323a73fe4e1b4cebedafa2ac8140d57
progress:
  total_phases: 10
  completed_phases: 4
  total_plans: 64
  completed_plans: 60
milestone_name: Orca integration
---

# Project State

## Project Reference

See: .planning/PROJECT.md (shared project file; its "Current Milestone" section is v1.5, not this milestone)
Scope: .planning/workstreams/orca/REQUIREMENTS.md. Owner decisions: .planning/workstreams/orca/DECISIONS.md (D-01..D-29). Roadmap: .planning/workstreams/orca/ROADMAP.md.

**Core value (this milestone):** Theia is the default GUI; Orca's agent workflow runs inside PowerBrowser as real PowerBrowser tabs, with PowerBrowser's own engine and chrome as the agents' browser.
**Current focus:** Phase 59 — Carry-forward from v1.5 and v1.6

## Current Position

Phase: 59 (Carry-forward from v1.5 and v1.6) — EXECUTING
Plan: 1 of 7
Status: Executing Phase 59
Last activity: 2026-11-08 — Phase 59 execution started

Progress: [░░░░░░░░░░] 0%

## Phases

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 59 | Carry-forward from v1.5 and v1.6 | CF-01..CF-19 (`.planning/CARRY-FORWARD-v1.7.md`) | Not started |
| 60 | Orca from source on Theia's Node | RUN-01, RUN-02, OVL-04, EXT-01 | Executed 4/5 (EXT-01 deferred) |
| 61 | Spikes for pane hosting, browser parity and live sharing | TAB-03, BRW-01, EXT-03 | Complete (human items deferred) |
| 62 | Overlay gate and PowerBrowser-run orcad | OVL-01, OVL-05, RUN-03, RUN-04, RUN-05 | Complete |
| 63 | Agent hooks on Orca's terminal engine (rescoped by D-31) | TERM-02, EXT-02 | Complete (human items deferred) |
| 64 | Orca panes as PowerBrowser tabs | TAB-01, TAB-02, TAB-04, TAB-06, TERM-01, TERM-04 | Executed (64-06 gap closure); TAB-04 pending on stage g3 (g2 PASS on the 65-05 tree); verification pending |
| 65 | Orca workspace in Theia | TAB-05, TAB-07, TAB-08, TAB-09 | Complete (verified 8/8, human items deferred) |
| 66 | PowerBrowser web tabs as Orca's browser | BRW-02, BRW-03, BRW-04, BRW-05 | Executed (66-06, 66-07, 66-08, 66-09, 66-10); BRW-02, BRW-03, BRW-04, BRW-05 complete |
| 67 | Hosting hardening | RUN-06, RUN-07, RUN-08, RUN-09, INJ-01 | Executed (67-01..67-07; 67-07 gap closure, D-36); RUN-06..RUN-09 and INJ-01 complete; verification pending |
| 68 | Three-OS artifacts, weekly re-pin and upstream seams | OVL-02, OVL-03, OVL-06, PLAT-01, PLAT-02 | Not started |

## Performance Metrics

**Velocity:**

- Total plans completed: 0

*Updated after each plan completion*

## Accumulated Context

### Decisions

Owner decisions are in DECISIONS.md. The ones that shape the phase order:

- D-05: spikes and the tab remake come before the hosting basics finish. The order is: build and probe (60), spikes (61), minimum hosting (62), remake (63-66), hosting hardening (67), then ship and re-pin (68).
- D-04/D-16/D-29, after the adversarial review: an additive overlay. PB-added files come first, then about ten or fewer regenerated seam patches. Whole-file swaps are forbidden.
- D-15: one Orca pane equals one Lumino tab. Orca's in-tab splits and tab groups are flattened, and the renderer owns layout in shipped builds.
- D-14: orcad runs slot-less on Theia's Node 24.19.0, proven by Phase 60's probe. The fallback pin is 1.4.245.
- D-24: live checks pass on Linux only. D-25: the run mode is interactive per phase.
- P62-14: RUN-04 is the one declared seam, `orca-overlay/patches/010-installed-electron-switch.patch` in `src/main/orcad/orcad-browser-provider.ts`; `installedElectronCandidates` returns nothing when orcad's environment has `ORCA_DISABLE_INSTALLED_ELECTRON_BROWSER=1`, which OrcaEnv always sets.
- P62-16: orcad's fixed port is the pref `powerbrowser.orca.port`, default 26768 (Orca's own 6768 is taken by a desktop Orca); no manifest key.
- P62-19: the exact-environment spawn, the process-tree reader and the named reap blocker (`spawnProcessExact`, `listProcessTree`, `addNamedReapBlocker`) live in `PowerBrowserProcesses` at the end of `PowerBrowserAPI.sys.mjs`, with `//` comments only.
- D-31 (Chris, 2026-11-10): Orca terminals run on Orca's own engine (stock orcad PTY provider and terminal daemon) and Orca's own terminal view (`TerminalPane`) in PowerBrowser tabs, side by side with plain Theia terminals; supersedes D-01's terminal bullet and D-28 for Orca terminals. Phase 63's bridge is dropped (lanes p63-01, p63-02, p63-05 superseded, never merged); Phase 63 keeps lane p63-03 and adds lane p63-06 (bridge folder `POWERBROWSER_ORCA_BRIDGE_DIR`, `orcad-data-root`, `writePrivateFile` with no umask window); the overlay holds seam 010 only. TERM-01 (display) and TERM-04 (keys) move to Phase 64 as hosted `TerminalPane` tabs created through `terminal.create`; TERM-03 is v2 (headless orcad at 1.4.248 has no SSH stack or paired-server relay). D-07 holds through `OrcaService`'s stop path.
- Phase 63 outcome under D-31 (63-04, 2026-11-10): two lanes merged (p63-06 then p63-03; p63-01, p63-02, p63-05 superseded and never merged); the overlay holds one seam (010) and Orca's terminals run on Orca's own engine and terminal daemon; PowerBrowser's private bridge folder reaches the Theia backend as `POWERBROWSER_ORCA_BRIDGE_DIR` and holds `orcad-data-root` (written after ready, removed on stop) and the orca-agents `claude-wrapper` launcher; `PowerBrowserProcesses.writePrivateFile` makes the file 0600 before any byte is written (no umask window); a real claude in an Orca terminal read working, waiting and done through Orca's hooks, and D-07 is proven on Orca's engine (the agent, orcad and the terminal daemon end on quit).
- Phase 64 outcome (64-05, 2026-11-10): Route A hosted panes. Lanes p64-01..p64-04 merged into v1.7 after Phase 68 wave 1; @powerbrowser/orca-panes wired; every Orca pane is one Lumino tab mounting Orca's own component (TerminalPane per terminal leaf with isolatedPaneKey, P64-32 PASS; NativeChatView, EmulatorPane, EditorPanel), named pb-orca:<word><n>; an Orca mode with the IDE dress; chrome writes web-pairing and orca-panes-dir to the bridge folder after ready and removes them first on stop; no new seam (the overlay holds 3 seams after Phase 68). Orca's stylesheet proven isolated in a real hosted pane first (orca-pane-css-live real-widget PASS). The mirror freeze (64-MIRROR-FREEZE.md) is fixed seam-free in the entry. TAB-01 and TAB-02 complete; TAB-04, TAB-06, TERM-01, TERM-04 pending (64-05-SUMMARY.md Requirement outcomes).
- D-32 (Chris, 2026-11-10) and P64-37 (Claude's auto-mode pick, owner may override): in Orca and Theia terminals Ctrl+W and Ctrl+T go to the shell, Ctrl+Tab and Ctrl+PageUp/PageDown always switch PowerBrowser tabs, Ctrl+Shift+W closes the current tab, and hosted Orca terminals run Orca's own 'terminal-first' shortcut policy in memory only (plus Ctrl+[ and Ctrl+] released); New Orca Terminal/Chat with no active Orca worktree show a quick pick of Orca's worktrees in Orca's recency order, the first preselected.
- Phase 64 outcome (64-06, 2026-11-11): D-32 keys live (orca-terminal-keys-live PASS: shell keys to both PTYs, switch keys switch from both terminals and a web tab, the close key opens Orca's running-terminal confirmation); the P64-37 pick live (orca-tabs-live stages a and e2 PASS); chats on the real claude and the pre-installed SDK extension with no prompt spent (stage f PASS); OrcaService removes orcad-data-root, web-pairing and orca-panes-dir before orcad is signalled. TERM-01, TERM-04 and TAB-06 complete; TAB-04 pending on stage g2 (64-06-SUMMARY.md Requirement outcomes).
- [Phase 68]: P68-37: Phase 68 wave 1 (lanes p68-03, 04, 01, 10, 07, 09, 02) merged into v1.7 on 2026-11-10 by 68-06 Task 1; p68-08 and p68-05 stay coordinator-launched (08 not yet launched, 05 after Phase 67)
- [Phase 68]: A-P1: the Orca re-pin replay carries THIRD-PARTY-NOTICES.txt (plan 51-09 pattern); identity re-pin v1.4.248 PASS on the merged tree; Chris may revert
- [Phase 68]: Release guard: release.yml runs verify-licence-allowlist.mjs --rulings; no release is cut while ruling 68-B or the 68-A terms check is open (WINDOWS.md entry 44, orca-licence-rulings excluded under --gate keyed to 44)
- [Phase 68]: D-30 / P68-38 / P68-39: the Claude agent SDK ships in a pre-installed, removable Theia extension and is out of orcad's bundle (ORCA_CLAUDE_AGENT_SDK_DIR, seams 070 and 080, pb-only); uBlock Origin ships through distribution/extensions (lane p68-08, not yet merged)
- [Phase 68]: The re-pin replay's pnpm run passes --config.verify-deps-before-run=false: pnpm 12 otherwise re-installs orca/node_modules without build-orca.sh's store, virtual-store and --ignore-scripts knobs (fix 554c66d7)
- Phase 65 outcome (65-05, 2026-11-11): lanes p65-01..p65-04 merged in order; Orca files, diffs and conflicts open in Theia's editors with worktrees as workspace folders (orca-workspace-live PASS), Orca's sidebar, Settings, Agents panel and right sidebar live in the Orca mode's two view containers (orca-side-panel-live, orca-pane-css-live PASS), Orca's Add-project and remove work as on the stock page (orca-add-project-live PASS), and a relaunch restores a Setup's Orca tabs connected with no offer in any sink (orca-relaunch-restore-live, orca-offer-scan PASS). TAB-05, TAB-07, TAB-08, TAB-09 complete; TAB-04 still pending on g3.
- P65-06: the first Orca root moves Theia's workspace prefix to the fixed file `<profile>/powerbrowser-theia/workspaces/powerbrowser.theia-workspace`, copying the old prefix's keys first; moving it again later needs a second migration.
- P65-17: pairing is session-only (Orca's `setWebDeviceKeySupportForTests` preset to session-no-ed25519, then a refusing assertion); nothing connects unless it holds.
- P65-18: pb-orca names persist per profile (`powerbrowser.orca.paneNames`) with tombstones, and a restored widget is held until the store lists its worktree (reload renumbering fixed, P65-35).
- P65-09: the Orca mode holds two view containers (left: Orca's sidebar, Agents and Settings; right: Orca's right sidebar); Settings needs 660 px for no horizontal overflow.
- 65-05: research A5 was false; a mode switch now detaches side views another shipped mode's row alone docks (the Orca containers), as stock detaches strays. Setups address a diff editor by its diff: URI, and the orca-workspace router reveals an already-open editor or diff instead of opening a second. Orca's side panel loads favicons through www.google.com's s2 redirect to tN.gstatic.com: t1, t2, t3 allowlisted user-initiated as measured.
- Phase 66 outcome (66-06, 2026-11-11): lanes p66-01..p66-05 merged in order; an Orca agent drives PowerBrowser web tabs through the chrome-side bridge (orca-browser-agent-live: every clause green but (j); orca-agent-mark-live, orca-browser-snapshot-live, orca-browser-host-bundle, no-remote-agent-port-live PASS); BRW-04 and BRW-05 complete, BRW-02 and BRW-03 pending on the (j) blocker (66-06-SUMMARY.md). No new seam (the overlay holds 3).
- A1 (as built): unshown agent tabs are parked (laid out, occluded, inactive docshell) and chrome decides "shown to the user" with one predicate, `overlayShownToUser`; the parked box is the shown widget of the tab's own tab bar (Lumino has no per-area stacked panel).
- A2 (as built): the PowerBrowserAgent child may use `Cc[` and `Ci.` only on lines catalogued in INTERNAL-APIS.md (check-internals-boundary ACTOR_CHILD_PATTERNS); bridge rule 7 accepts `Ci.` only on such a line.
- A3 (as built, measured live): the browser host authenticates as the pane client's own paired device through the pane bundle's link; the renderer path used the device-key credential and a client placement (orca-browser-agent-live (g)). The host waits for the link's readiness event before reading its connection (fix 36efe6ea).
- A4 (as built): page alert, confirm and prompt are answered natively; HTTP auth and beforeunload are refused to the agent (browser_command_unavailable), proven live in clause (m); closing a web tab cancels its window-modal page prompt (fix 8684931d).
- A5 (as built): browser.snapshot reproduces agent-browser 0.39.4's grammar from the DOM in the agent child; references come from Orca's pinned agent-browser against Chromium (orca-snapshot-fixtures).
- P66-09 activation rule: the browser route never activates a tab at its own create; it reveals the bound web tab only on a later store activation of a page bound before it (createRevealTracker). Restated by D-34 (66-07): a creation mark ends at the page's first listed record, because the row is PowerBrowser's own, added in the background.
- D-34 (Chris, 2026-11-11, "Add them from PB's side now"): the pane entry adds each agent page to Orca's store when its web tab opens (addBrowserPage: Orca's record builders, browserTabOpenView, createUnifiedTab with activate: false, setRemoteBrowserPageHandle with the staged client-hosted handle stageWebRuntimeBrowserTab writes) and drops it with discardStagedWebRuntimeBrowserTab; createBrowserTab's own managed-browser gate refuses a paired web client without screencast, so it is not called. Measured in 66-07: orcad's session.tabs.list lists no client-hosted page, so no CLI tab switch reaches a client store.
- Phase 66 gap closed (66-07, 2026-11-11): orca-browser-agent-live PASS with clause (j) (reveal in 16 ms after Orca's own selection of the row); BRW-02 and BRW-03 complete.
- D-35 (coordinator ruling in auto mode, 2026-11-11; the owner may override): a new window, tab or popup whose opener is an agent overlay is refused on every path; the agent's own navigation in its tab is unaffected. Content wall: SANDBOXED_AUXILIARY_NAVIGATION on the agent overlay's browsing context from creation (the only wall a popup with features meets). Chrome wall: adoptLinkIn, adoptContentWindow and adoptInProcessWindow refuse an agent opener, the browserDOMWindow members throw NS_ERROR_ABORT. A chrome refusal logs once per tab and path without the URL and fails the command in flight with browser_command_unavailable (Orca's error union is closed, so no new code).
- 66-VERIFICATION gap (truth 8) closed (66-08, 2026-11-11): orca-browser-agent-live PASS with clause (n) (user: link 1 tab, window.open 1 tab, popup 1 window; agent: 0 tabs, 0 windows, 0 loads, window.open threw InvalidAccessError, middle-click and Control+Enter failed browser_command_unavailable); orca-browser-tab-scope derives 5 open paths and its self-test plants one per path; orca-agent-mark-live and new-window-adopt-live PASS.
- D-37 (66-09, coordinator ruling, 2026-11-11; the owner may override): agent-overlay downloads (SANDBOXED_DOWNLOADS) and external-protocol loads (an agent-aware content-dispatch chooser that passes every other load to the stock factory) are refused, and on an overlay's initial about:blank only browser.goto runs. Merged into the integration branch at 2c713811; on the merged tree orca-browser-agent-live PASS with every clause including (f), (n), (o), (p), (q); orca-agent-mark-live, orca-landing-logo-live, orca-failure-page-live and new-window-adopt-live PASS. WINDOWS 47 fixed (reload barrier, 6 of 6 counted runs).
- D-38 and D-39 (66-10, owner rulings 2026-11-11): agent tabs get no clipboard access; site permissions are kept per container. orca-browser-agent-live PASS with clauses (r) and (s).
- orca-hidden-electron "orcad exited during the switched run" (seen in the 66-09 lane) was not a regression: 17 of 17 runs green on the merged tree, and an outside SIGTERM 2 s into the switched run reproduces the message. The lane's runs overlapped the 68-06 PLAT-02 pass, whose untracked pass script stopped every orcad.js younger than a row's duration plus 5 s after the lock was released. The check now names orcad's exit status (238e65d2); orca-service compares OrcaService's packaged port fallback with the prefs default (ed7ef95b).
- P66-08 (as built): a frontend reload ends the previous frontend's pages: the host keeps its bound page ids in the Theia document's sessionStorage and closes them with browser.tabClose after the next attach (fix 5c60d6bd), because orcad recovers pages only for the same host client id.
- 66-02/66-05 split: the Theia lane exceeded the 15-file cap and became 66-02 (wave 1) and 66-05 (wave 2, on p66-02); the coordinator is 66-06.
- D-33 (Chris, 2026-11-11, 66-06 Task 2, option-g): a failed browser-host attach stays a frontend log line in Phase 66; Phase 67 adds the failure class browser-not-attached to its Orca failure page (P67-36, plans 67-01 and 67-03).
- Agent control mark copy (P66-23, for the owner's copy review): "Agent in control"; "An Orca agent you started is controlling this tab in ${subject}. Select Stop to end it."; "Stop"; "Stop the agent's control of this tab in ${subject}. The tab stays open."
- no-remote-agent-port-live: orcad's second loopback port is Orca's own agent-status hook server (AgentHookServer), accepted only when `<ORCA_USER_DATA>/agent-hooks[/<namespace>]/endpoint.env` names it (only its port line is read).
- P67-02: seven Orca failure classes, one copy table in orca-panes (orca-failure-copy.ts); chrome classifies through OrcaEnv. P67-04: three shell kinds (orcaStatus, orcaRestart, orcaShowDiagnostics); the reply carries the state and the class only.
- P67-16/P67-17: a temporary data root and the plaintext secret-store override are refused before orcad is spawned (RUN-09); no orcad process exists for a refused start.
- RUN-08: the sidecar Origin rule from the hotfix line covers Orca's request classes; headers re-recorded on the merged Phase 67 tree (67-06), no gate change.
- P67-21: live profiles are repo-local (.mozbuild/pb-live-profiles/), because OrcaService refuses a profile under a temporary folder. P67-23: the PowerBrowserOrcaLogo actor puts the PB mark on Orca's landing tile on orcad-origin documents only.
- D-36 (coordinator ruling in auto mode, 2026-11-11; the owner may override): the hosted Orca client keeps its environment id across an orcad restart. Each session-only pairing closes Orca's active clients and becomes Orca's active environment (as Orca's addFromPairingCode does); the last pairing, token blanked, stays in page memory as previousEnvironment. The pane observer holds every hosted tab through a re-pair (onWillRepair, rehold()). P65-17 unchanged: nothing in Theia-origin storage, a reload pairs under a new id.
- Phase 67 gaps closed (67-07, 2026-11-11): orca-failure-page-live PASS with every induction and the restart clause (same id, verified, no stranded-environment line, a CLI terminal becomes a tab); orca-landing-logo-live PASS with the remount leg (Orca's own tab close button); WINDOWS 45 and 46 fixed.
- [Phase 68]: 68-06 Task 2: the Linux package was built from the dev objdir (POWERBROWSER_OBJDIR=objdir, package-linux.sh in nix develop .#firefox) because the Safe Browsing key directory the release mozconfig needs is absent on this host; the packaged proofs ran on it and WINDOWS entry 30 stays open for the container release tarball
- [Phase 68]: 68-06: OrcaService falls back to port 26768 when powerbrowser.orca.port is unset, because a package carries no powerbrowser-sidecar.js (dev-tree prefs, not in the package manifest); without it every packaged Orca start failed (fix 21898a67)
- [Phase 68]: 68-05: seam 010 (ORCA_DISABLE_INSTALLED_ELECTRON_BROWSER) is the browser-provider upstream offer, exported with a new Orca test; no web-entry seam exists (WINDOWS 52), so orca-upstream-prs stays red naming web-entry until the owner rules on that class

### Pending Todos

None yet.

### Blockers/Concerns

- **Resumed 2026-11-07.** v1.5 is tagged (`v1.5`) and v1.6 is parked with its live items carried forward; main merged into this branch at 0c717487 (no conflicts, ESR pin unchanged at 153.5.1, legal name now "Deocracy Institute"). Chris ruled the carry-forward phase is Phase 59 and the Orca phases moved to 60-68.
- In this worktree `--quick` passes except `fixer-isolate-self-test`, which fails the same way on main (pre-existing; "PATH changed inside the isolation"). Run it inside `nix develop .#theia` after the audited Theia install in `docs/BUILD.md` (`--ignore-scripts`). A plain `yarn install` breaks `diff-theia-core`.
- The EXT-01 outcome (Phase 60) may reshape EXT-02 (Phase 63) before that phase is planned.
- Phase 61's spike results may split or descope Phases 64 and 66. The roadmap must name each chosen route before those phases are planned.
- The macOS half of PLAT-01 (Phase 68) needs a macOS PowerBrowser build, which v1.6 deferred (workstream `deploy`, Phase 55).
- The weekly re-pin (OVL-02) must be dispatched by the release-train clock. D-77 forbids a `schedule:` key, and the clock belongs to v1.6.
- OVL-06 has an open owner question: who opens the upstream pull requests. The GitHub org is moving to `deocracy`, so ask before writing org names.
- OVL-03's live pairing of the stock mobile app needs an Android device. Protocol skew between a newer stock app and the pinned orcad is a recorded risk (D-29).
- Pin lag: the first pin, 1.4.248, was already one release behind (1.4.249) on 2026-11-04. Orca ships about 5 releases a week.
- Phase 65 owner items for the end-of-milestone pass (65-05-SUMMARY.md "Deferred Verification"): P65-01 check-details read as an Orca-only view; P65-09 Settings in the left side panel at 660 px or a main-area pb-orca:settings tab; CA-07 one used runtime token row per paired launch (to Phase 67); P65-06 the fixed workspace file and its path in the Theia URL fragment (to Phase 67); P65-17 session-only pairing through Orca's plain test export or a declared seam; populated orchestration and creation surfaces unproven live; launching straight into the Orca mode may contact the favicon hosts without a click; leftover scratch worktree directories under the host's `~/orca/workspaces/repo/` from 65-05's first orca-workspace-live runs need removing by hand.
- **Resolved by D-34 and 66-07 (2026-11-11): orca-browser-agent-live passes with clause (j).** Former text: **Phase 66 blocker, owner decision needed (66-06): orca-browser-agent-live clause (j) cannot pass.** No PowerBrowser-hosted Orca page ever becomes an Orca store record in the pane client (measured: zero `browser` records in subscribePanes after CLI creates, a renderer-path create, an active worktree and `tab switch`), because Orca's web client materializes browser tabs through WebRuntimeClient, which the thin host replaces. P66-09's reveal on store activation therefore has no event source. BRW-02 and BRW-03 stay pending until the owner picks: offer an upstream export (option-a), a bundle export that materializes the store tab (pane entry change), or option-d (record (j) known-open in WINDOWS.md).
- O1 (A1): a parked agent page reports `visibilityState` hidden and runs with background timer throttling; `wait` polls at about 1 s there.
- O2 (A4): a page dialog in an agent tab opens a window-modal dialog over the IDE until the agent or the user answers it (HTTP auth and beforeunload stay the user's).
- P66-33's "browser host did not attach" diagnostics row: not built in Phase 66 (D-33); Phase 67 RUN-06 adds the failure class browser-not-attached (P67-36). Until then the frontend log line is the only record. The host also does not re-attach after orcad restarts (P67-36's Reconnect covers it).
- Agent-tab visits enter the user's Places history: the agent container scopes cookies and storage only.
- Phase 67 note: RUN-06 covers "browser host did not attach" (P67-36). Phase 68 note: add orca-browser-abilities, orca-browser-entry-points, orca-browser-host-bundle and orca-snapshot-fixtures to the weekly re-pin job; there is no browser-provider seam to offer upstream under S2 (D-27).
- **Resolved by D-36 and 67-07 (2026-11-11): orca-failure-page-live passes every induction, the restart clause included; WINDOWS 45 fixed.** Former text: Phase 67 (67-06 Task 2, owner decision): orca-failure-page-live criterion 1 not proven - after orcad is killed, Orca's client is refused after the automatic re-pair, clears its stored environment, and the pane bundle's repair() re-pairs under a new environment id that strands its sessions; root cause in orca-overlay pb-session-pairing.ts, outside Phase 67's files (WINDOWS 45). Options: a fix the Phase 65 repair at source, b record restart recovery as not delivered, c re-plan lane p67-03's recovery
- Phase 68 (68-06, WINDOWS entries): 48 macOS release artifact with Orca (Phase 55 items 8, 9); 49 macOS smoke test; 50 Windows smoke test (CF-10); 51 upstream issue and PR for seam 010; 52 no web-entry seam to export (owner ruling); 53 Windows claude-wrapper launcher; 54 packaged live rows ended by a signal leave orcad running; 55 orca-tabs-live g3 (TAB-04). Entry 44 (licence rulings) and entry 30 (container release tarball) stay open.

## Deferred Items

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| *(none)* | | | | |

## Session Continuity

Last session: 2026-11-11T20:00:55.183Z
Stopped at: Completed 66-10-PLAN.md
Resume file: None

## Deferred Verification

| Phase | State | Resume |
|-------|-------|--------|
| 59 | verification_deferred_human (59-06 checklist, verify-work 29/30/31; owner steps in p59-owner) | end-of-milestone pass (D-18): `/gsd-verify-work 59 --ws orca` |
| 60 | verification_deferred_human (60-05 EXT-01 live session) | end-of-milestone pass (D-18): resume 60-05 Task 2 |
| 61 | verification_deferred_human, 6/8 (61-VERIFICATION.md): EXT-03 extension half of the floor, with EXT-01; owner override for criterion 4 ordering (Phase 63 planned before the ROADMAP route line, route taken from the spike 006 record; YAML in 61-VERIFICATION.md); YELLOW conditions for Phases 64 and 66 to be copied into their CONTEXT | end-of-milestone pass (D-18): the steps under "Blocked on EXT-01" in .planning/spikes/006-orca-live-sharing/README.md |
| 62 | verified 5/5 (62-VERIFICATION.md); owner re-lock of scripts/verify-ng-027-reader-callers.mjs pending; browser-request clause of criterion 2 moves to Phase 66 | end-of-milestone pass (D-18): owner lock-checks; Phase 66 proves the browser request |
| 63 | verified 6/7, human_needed (63-VERIFICATION.md; 63-04-SUMMARY.md); TERM-02 complete on a live orca-agent-status-live PASS; EXT-02 extension half deferred | end-of-milestone pass (D-18): the Claude Code extension's claude through PowerBrowser's wrapper with the session live in Orca and spike 006 "Blocked on EXT-01" steps 1-4 (with 60-05 Task 2; research assumptions A3, A5); an owner look at the wrapper's placeholder pane as an Orca terminal tab once Phase 64 hosts terminals; the wrapper path in packaged builds and a Windows twin of the POSIX sh claude-wrapper launcher (Phase 68) |
| 64 | executed by 64-05 and 64-06; TAB-01, TAB-02, TERM-01, TERM-04, TAB-06 complete; TAB-04 pending (64-06-SUMMARY.md) | end-of-milestone pass (D-18): TAB-04 -- re-run orca-tabs-live stage (g2) tab-groups once the check drives a real Orca tab-group split (Orca's own web client's "Split Chat Right" opened a chat in the same group; its group split is a tab drag to a group edge); the hosted chat's look and behaviour against Orca's own; Orca's running-agent close confirmation readable with working buttons, and the busy-chat close (not exercised: no prompt keeps a chat busy); owner item T-61-04 (P64-07); auto-mode picks P64-05 (boot at frontend start), P64-18 (no activation hook), the Open Question 4 html-clause ruling, P64-37 (the worktree pick); the in-session key control replacing P63-25's (P64-33); the EXT-02 wrapper's placeholder pane as a hosted terminal tab (P64-36); a stored custom mode named "Orca" hidden by the shipped Orca mode; the Orca address-bar default (Address); a layout-restored pb-orca: tab's empty title until boot; OWNER REVIEW (64-06): the Orca chords still active in hosted terminals under terminal-first (terminal.paste Ctrl+V/Ctrl+Shift+V/Shift+Insert, terminal.copySelection Ctrl+Shift+C/Ctrl+C with a selection, terminal.expandPane Ctrl+Shift+Enter), of which Ctrl+V and Ctrl+C-with-selection capture control characters and cannot be released without a seam (Orca's xterm bypass policy hard-codes them); Ctrl+Shift+W from a focused web page goes to the page; the two quick-pick placeholders "Choose the Orca worktree for the new terminal" and "Choose the Orca worktree for the new chat"; OWNER DECISIONS ANSWERED: TERM-04 by D-32, the New Orca Terminal/Chat fallback by P64-37 |
| 65 | executed by 65-05; TAB-05, TAB-07, TAB-08, TAB-09 complete; orca-tabs-live g3 red (TAB-04); owner items P65-01, P65-09 (660 px), CA-07, P65-06, P65-17, populated orchestration/creation surfaces, launch-into-Orca-mode egress (65-05-SUMMARY.md) | end-of-milestone pass (D-18): `/gsd-verify-work 65 --ws orca`; the owner items; a g3 drive with a second client that receives host frames |
| 66 | executed by 66-06, 66-07, 66-08, 66-09 and 66-10 (D-38 no clipboard for agent tabs, D-39 permissions per container; owner item: Linux PRIMARY-selection autocopy from agent selections, accepted risk); BRW-02..BRW-05 complete (66-07: clause (j) PASS, D-34; 66-08: agent-opened windows refused, clause (n) PASS, D-35, owner item: popups an agent workflow needs, such as OAuth, as agent overlays; 66-09: agent downloads, external protocols and commands on the initial about:blank refused, clauses (o), (p), (q) PASS, D-37, owner item: whether agent workflows need a download or a mailto: hand-off); orca-tabs-live stage tab-groups-cross-client (g3) still red as before Phase 66; the store row's title stays "New Tab" (page metadata does not update it); owner items: copy review of the four mark/Stop strings, clause (f) decoy SKIP on a host with an installed Orca, CSP-strict pages refuse eval, parked-tab timer throttling (O1), agent-tab dialogs over the IDE (O2), same-origin iframes not walked by snapshot, the delta-size approximation, no host re-attach after orcad restarts (P67-36), agent history in Places, spike 005 owner note (S2 over S1), P66-08, P66-11, P66-22, P66-24, P66-26; visual mark check in light and dark themes, a real-worktree agent session with the user working in another tab, the privacy paragraph wording (66-CONTEXT Deferred Verification) | end-of-milestone pass (D-18): `/gsd-verify-work 66 --ws orca`; the owner items; re-run orca-browser-agent-live |
| 67 | executed by 67-06 and 67-07; RUN-06..RUN-09 and INJ-01 complete; orca-tabs-live g3 red as before; owner items P67-17, P67-18, P67-19, P67-21, CA-07, live rows on the real ~/.orca, P65-06, T-61-04, D-35 popups, the external-protocol dialog, the browser-host page class, the copy, D-36 (67-06-SUMMARY.md "Owner items") | end-of-milestone pass (D-18): `/gsd-verify-work 67 --ws orca`; the failure page in light and dark themes and its buttons, the PB mark on Orca's dark landing tile, the protection sentence and the two RUN-09 sentences |
| 68 | executed by 68-01..68-10 (68-06 coordinator); BEXT-01 and BEXT-02 complete; OVL-02, OVL-03, OVL-06, PLAT-01, PLAT-02 pending (PLAT-02 Linux pass 35/38: orca-tabs-live g3 red, WINDOWS 55); package built from the dev objdir, no container release tarball (WINDOWS 30) | end-of-milestone pass (D-18): pair the stock Android app beside the orca-mobile-skew output (P68-17); open the upstream issue and PR for seam 010 and record the URL, rule on the web-entry class (WINDOWS 51, 52); the first live weekly re-pin tick, the bump PR with auto-merge armed and the owner's approving review; a release.yml dispatch producing Linux and Windows artifacts with Orca (first real runs of windows-orca and the macOS jobs; container release tarball, WINDOWS 30); macOS and Windows smoke tests (WINDOWS 48, 49, 50); ruling 68-B and the 68-A terms check for the SDK extension (D-30) and the GPL-3.0 section 6 reading for uBlock Origin (P68-39) (WINDOWS 44); reinstalling the SDK extension after an uninstall (no affordance in v1.7, 68-09); A-P1 confirmation (the re-pin carries THIRD-PARTY-NOTICES.txt); the Windows claude-wrapper launcher (WINDOWS 53); packaged live rows that end PowerBrowser by a signal leave orcad running (WINDOWS 54) |
