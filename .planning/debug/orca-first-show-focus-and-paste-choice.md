---
status: awaiting_human_verify
trigger: "Job 1 (owner ruling 2026-11-17, 'Fix now'): a hosted Orca terminal focuses itself when its terminal is first created (first show), taking keyboard focus from a visible Theia editor; it must take focus only on user activation or a click inside. Job 2 ('Remember my off'): the Linux in-memory preset of Middle-click Paste from Selection returns after every restart; PowerBrowser must remember that the user made a choice, per profile"
created: 2026-11-17T12:00:00Z
updated: 2026-11-18T01:10:00Z
audit_acknowledged:
  milestone: v1.7
  at: 2026-11-25
  status: awaiting_human_verify
---

## Current Focus

hypothesis: Job 1: HostedPaneBody mounts TerminalPane with isActive hard-wired true; Orca's isActive is its focused-group flag and gates replayTerminalLayout's createInitialPane({focus}), setActivePane({focus}) in layout restore and reconciliation, queueResizeAll(focusActive); NativeChatView's isFocusedGroup gates the composer reveal claim the same way. Job 2: userChosePrimarySelectionPaste is a module variable, and Orca's own stored value lives in the Theia origin's localStorage, which changes at every launch
test: done -- orca-terminal-keys-live 5/5 and orca-relaunch-restore-live 5/5 on the fixed bundle; each new leg red on a control bundle
expecting: n/a
next_action: owner: in a real session, type in an editor while an agent opens an Orca terminal beside it; switch Middle-click Paste from Selection off, quit and relaunch
bug_class: Bohrbug
reasoning_checkpoint:
  hypothesis: "a hosted terminal takes focus on first show because PowerBrowser passes TerminalPane isActive=true, and Orca focuses its first pane (createInitialPane/setActivePane in terminal-pane-layout-restore.ts) whenever isActive holds; the off returns after a restart because nothing PowerBrowser keeps records it and Orca's localStorage is per launch origin (TheiaService spawns on port 0)"
  confirming_evidence:
    - "previous record Evidence 2026-11-17T23:20Z: focus() stack at first reveal is TerminalPane's createInitialPane/setActivePane on its own mount"
    - "terminal-pane-layout-restore.ts:32 replayTerminalLayout(manager, layout, isActive) and :90 setActivePane(id, { focus: isActive }); TerminalPaneOverlayLayer.tsx:155 Orca's own isActive = visible && in the active group"
    - "web-preload-api settings: primarySelectionMiddleClickPaste is local-only (syncRuntimeBackedSettings sends it nowhere); web-storage.ts writes window.localStorage; TheiaService.sys.mjs requests port 0 until a swap completes, so each launch is a new origin"
  falsification_test: "with the fix, keys typed in an editor still reach the CLI-created terminal shown beside it (2d background/restore), or the switch reads on after the relaunch (paste-choice)"
  fix_rationale: "the widget's Theia activity is Orca's focused-group concept, so every Orca focus path (mount, reveal, layout reconcile, resize) is gated at its source without touching Orca; the remembered value is restored as the preset because Orca cannot keep it across launches"
  blind_spots: "Orca's own isActive-gated UI (process-exit overlay, error toast, keyboard hook) now follows Theia activity, as for Orca's non-focused split group; Orca's portalled menus move Theia's active widget to none while open"
  candidate_causes:
    - "code: isActive/isFocusedGroup hard-wired in HostedPaneBody"
    - "environment: per-launch Theia origin drops Orca's localStorage (Job 2)"
  and_gate: "no for Job 1 (one prop); yes for Job 2 (no PowerBrowser record AND a per-launch origin for Orca's own storage)"

## Symptoms

expected: a hosted Orca terminal takes keyboard focus only on user activation of its tab or a click inside it; the user's Middle-click Paste from Selection choice survives a restart
actual: first show of a hosted terminal focuses its xterm (TerminalPane mounted with isActive); the preset re-applies after every restart
errors: none
reproduction: orca-terminal-keys-live 2c run 1 at 6729ce22 (editor keys reached the terminal after its first reveal); restart after turning the switch off
started: Phase 64 (isActive hard-wired); 8d2530b2 (preset in memory)

## Eliminated

## Evidence

- timestamp: 2026-11-17T12:00:00Z
  checked: orca/src/renderer/src/components/terminal-pane (terminal-pane-layout-restore.ts:32,90; layout-serialization.ts:188; use-terminal-pane-reconciliation.ts:127; terminal-pane-mount-events.ts:116; TerminalPaneOverlayLayer.tsx:155)
  found: every mount/reconcile focus is focus: isActive; Orca computes isActive as isVisible && the tab's group is the active group, i.e. its focused-group flag; PowerBrowser passes isActive always
  implication: the hosted widget's Theia activity is the faithful value for isActive
- timestamp: 2026-11-17T12:00:00Z
  checked: native-chat/use-native-chat-composer-reveal-focus.ts; emulator-pane; editor/CheckRunDetailsPanel.tsx
  found: chat claims composer focus on reveal (isVisible && isFocusedGroup) for six frames unless an editable holds focus; emulator focuses only on its own pointerdown (isActive there means visible: showStream); check details has no focus call
  implication: chat gets the same gate (isFocusedGroup); emulator and check details need none
- timestamp: 2026-11-17T23:10Z
  checked: Orca web settings path (web-settings-api.ts set, web-preferences-store.ts syncRuntimeBackedSettings, web-storage.ts) and TheiaService.sys.mjs port choice
  found: primarySelectionMiddleClickPaste is written only to localStorage key orca.web.settings.v1 of the Theia document; the sidecar is spawned on port 0 at each launch, so the origin and Orca's stored settings are new at every launch
  implication: "PowerBrowser stops presetting and Orca's stored value rules" would read off after a relaunch even for a user who chose on; the record keeps the user's value and the preset uses it (rememberedPrimarySelectionPaste ?? true)
- timestamp: 2026-11-17T23:40Z
  checked: build-orca.sh --panes-only, theia yarn build (tsc -b, 0 errors), orca-pane-entry and self-test, orca-terminal-keys (clause f extended, clause g new) and self-test (44 plants), orca-terminal-keys-live-self-test (58), orca-relaunch-restore-live-self-test (19), orca-tabs-live-self-test, brand scan after reconciling four held-back Orca counts
  found: all green
  implication: static legs in place; live legs next
- timestamp: 2026-11-18T00:20Z
  checked: control bundle with TerminalPane isActive and NativeChatView isFocusedGroup hard-wired true again (built, overlay source restored, tree clean), orca-terminal-keys-live once
  found: 2d red: background and restore both "abc" in the editor, "xyz" in the terminal's PTY, focus out of the editor; click and New Orca Terminal green
  implication: the background and restore legs detect the first-show steal; the fixed bundle turns them green (run before the control, and 5/5 after)
- timestamp: 2026-11-18T00:58Z
  checked: control bundle whose settings.set observer never calls remember (no profile record), orca-relaunch-restore-live once
  found: paste-choice red: after the relaunch the switch reads on and a terminal selection pastes once (the reported bug); fixed bundle 5/5 green
  implication: the relaunch clause detects a forgotten off; the fresh-profile read (on) and the turned-on paste (once) are its detectors
- timestamp: 2026-11-18T01:05Z
  checked: one at a time via --only, ORCA_* unset, tree clean before each: orca-terminal-keys-live x5, orca-relaunch-restore-live x5, tab-strip-live, orca-tabs-live, orca-pane-css-live, first-boot-surface-fresh, orca-service-live; orca-terminal-keys, its self-test, orca-terminal-keys-live-self-test, orca-relaunch-restore-live-self-test x5; --quick
  found: all rc 0; no PowerBrowser or orcad process left after any run
  implication: verified

## Resolution

root_cause: Job 1: HostedPaneBody mounted TerminalPane with isActive and NativeChatView with isFocusedGroup hard-wired true; those props are Orca's focused-group flag and gate the first pane's focus (terminal-pane-layout-restore.ts:32,90) and the composer's reveal claim, so a pane first shown in the background took keyboard focus. Job 2: the user's switch write was kept only in a module variable, and Orca's own stored value lives in a per-launch localStorage origin
fix: mountPane takes the hosting widget's activity (OrcaPaneWidget.activity: ApplicationShell.activeWidget === this, onDidChangeActiveWidget) and HostedPaneBody passes it as isActive / isFocusedGroup; the profile record powerbrowser.orca.primarySelectionPaste (ProfileStorageService, as powerbrowser.orca.paneNames) is read by OrcaPaneBundle before bootstrap and written by the settings.set observer; the Linux preset is rememberedPrimarySelectionPaste ?? true
verification: control bundles reproduce both symptoms in the new legs (Evidence 00:20Z, 00:58Z); fixed: orca-terminal-keys-live 5/5, orca-relaunch-restore-live 5/5, the five once-each rows green, extended static rows 5/5, --quick green, brand scan PASS
oracle_type: specified (exact typed text in the editor model, keyboard focus owner, PTY read by orcad, the switch's aria-checked, exact token counts)
why_not_caught: no live leg showed a hosted pane for the first time while the user typed elsewhere; no row crossed a relaunch with an Orca setting changed
recurrence_guard: orca-terminal-keys clause g (6 plants) and clause f's remembered-choice plants (6); orca-terminal-keys-live 2d; orca-relaunch-restore-live paste-choice
deviation: the owner asked that PowerBrowser stop presetting once the user chose and let Orca's stored value rule; Orca stores it in a per-launch origin, so the record keeps the user's value and the preset uses it
files_changed: [orca-overlay/files/src/renderer/src/pb/pb-pane-mount.tsx, theia/extensions/orca-panes/src/browser/orca-pane-widget.tsx, theia/extensions/orca-panes/src/browser/orca-pane-bundle.ts, theia/extensions/orca-panes/src/common/orca-panes-protocol.ts, scripts/verify-orca-terminal-keys.mjs, scripts/verify-orca-terminal-keys-live.mjs, scripts/verify-orca-relaunch-restore-live.mjs, scripts/verify-platform.sh, inventory/brand-tokens.json]
