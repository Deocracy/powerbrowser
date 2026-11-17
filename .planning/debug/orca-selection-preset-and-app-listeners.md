---
status: investigating
trigger: "Job 1 (owner ruling 2026-11-17, 'Preset it ON on Linux, in memory'): hosted Orca terminals on Linux paste their selection on middle-click out of the box, in memory only like D-32, user's explicit choice wins. Job 2 ('Test and scope if needed'): test useLargeTextControlPaste, session-persistence beforeunload, workspace-activation focus helper live against non-Orca Theia UI; scope any that affects it"
created: 2026-11-17T19:30:00Z
updated: 2026-11-17T19:30:00Z
---

## Current Focus

hypothesis: (a) and (b) affect Theia UI (confirmed live at e324130a); (c) does not in the measured paths
test: fix (a) with a pane-scoped large-paste listener, (b) with a hosted session persistence whose beforeunload never cancels; Job 1 preset in hostedTerminalKeysPatch with a pass-through observer of window.api.settings.set
expecting: orca-terminal-keys-live 2b/2c green; permitUnload true with Orca's checkpoint failing; paste event reaches Theia targets
next_action: edit orca-overlay/files/src/renderer/src/pb/pb-pane-mount.tsx, then build-orca.sh --panes-only
bug_class: Bohrbug (deterministic once the pane bundle boots)
reasoning_checkpoint:
  hypothesis: "(a) useLargeTextControlPaste's document capture listener claims every >64 KiB paste into any input/textarea of the Theia document (stopPropagation, chunked setRangeText), so Theia's own handlers never see it and single-line inputs lose Gecko's newline-to-space conversion; (b) useAppSessionPersistence's beforeunload handler cancels the unload whenever Orca's checkpoint throws, and PowerBrowser's quit veto (shellBrowsersPermitUnload) and a Theia reload honour it"
  confirming_evidence:
    - "(a) live: paste via chrome cmd_paste into Monaco and Theia's quick input: window-capture saw a trusted paste, the target's own listener never fired; 100 KiB multi-line into the quick input lost every newline (Orca path) while 2 KiB went native (newlines to spaces)"
    - "(b) live: Orca's localStorage writes made to throw: the Theia browser's asyncPermitUnload('dontUnload') false twice; the synthetic beforeunload's preventDefault stack is the pane bundle (pb-pane-mount chunk); healthy: true"
  falsification_test: "after the fix the paste event still never reaches Theia's target, or permitUnload stays false with the failing checkpoint"
  fix_rationale: "(a) the same claim acts only on targets inside [data-pb-orca-pane-root]; (b) Orca's checkpoint still runs at every unload, its failure only reported, never a cancel"
  blind_spots: "Orca's portalled dialogs (outside pane roots) get native large paste; the checkpoint latch (persisted) means only the first unload after a success is skipped, as in Orca"
  candidate_causes:
    - "code: app-wide hooks mounted by the overlay services root (useHostedAppShellServices, Services)"
    - "data/environment: localStorage quota or a snapshot builder throw (the only triggers of (b))"
  and_gate: "yes for (b): the hook mounted AND the checkpoint throws AND the Theia document has user activation"

## Symptoms

expected: Linux hosted Orca terminal pastes its selection on middle-click at PowerBrowser's default; Theia UI unaffected by Orca's document listeners
actual: web client stores primarySelectionMiddleClickPaste false (process.platform absent); three app-wide listeners untested against Theia UI
errors: none
reproduction: orca-terminal-keys-live stage 2b at Orca's default (switch off): terminal does not paste
started: always (upstream web-client default)

## Eliminated

## Evidence

- timestamp: 2026-11-17T19:45Z
  checked: Orca web settings flow (web-settings-api.ts, web-preferences-store.ts, store/slices/settings.ts, worktree-visibility-settings-write.ts); D-32 preset (pb-pane-mount.tsx hostedTerminalKeys, 64-06-SUMMARY)
  found: settings live in localStorage merged over getDefaultSettings (primarySelectionMiddleClickPaste false: process.platform absent); every write stores the full object, so a stored false is the same whether the user chose it or not; writes reach window.api.settings.set with explicit updates only (no full-object write-back in the renderer); the store gets the persisted object back with no optimistic update
  implication: the preset can be store-only like D-32; the user's choice is observable only at window.api.settings.set; after a reload or restart the preset applies again
- timestamp: 2026-11-17T20:10Z
  checked: scratch inventory of document/window listeners reachable from the services root (AST walk through imported calls)
  found: useIpcEvents (focusin, pointerdown, keydown, composition/input capture), useRemoteRuntimeRecoveryTriggers (window online), useVisibleHostedReviewRefresh (visibilitychange), useTerminalViewerColorPublication (window focus), useLargeTextControlPaste (paste), usePanePrimarySelectionPaste, useAppSessionPersistence (beforeunload + five Orca restart/abort events); the activation focus helper is queued only by the worktree palette and worktree creation
  implication: the classification table for clause l
- timestamp: 2026-11-17T20:40Z
  checked: live (scratch, HEAD build) (a): 100 KiB via chrome cmd_paste into an untitled Monaco editor, into Theia's quick input; Ctrl+V in Monaco
  found: Monaco and quick input: paste event at window capture, never at the target (Orca stopPropagation), text equal (Orca's chunked insert); Ctrl+V in Monaco goes through Theia's paste command (no DOM paste event); 100 KiB multi-line into the quick input: newlines removed ("logline"), 2 KiB native: newlines to spaces
  implication: (a) takes over Theia's paste and modifies multi-line text in a single-line input: affects Theia UI
- timestamp: 2026-11-17T20:55Z
  checked: live (b): trusted click for activation, Orca's 'orca.web.' localStorage writes throwing, chrome asyncPermitUnload('dontUnload') on the Theia browser; synthetic beforeunload with preventDefault attribution
  found: permit false (twice) while failing, true when healthy; preventDefault from the pane bundle chunk. Order matters: a successful checkpoint latches (persisted) and later failures do not veto
  implication: (b) can hold PowerBrowser's quit (shellQuitVeto asks the same permitUnload) and a Theia reload: affects
- timestamp: 2026-11-17T21:20Z
  checked: live (c): real helper via Orca's hosted sidebar palette (worktree selected, T hidden behind another tab), then keyboard focus into a Theia editor and type, reveal T; same with a web tab; and a focus() call in the Theia document while a web tab holds focus
  found: palette then editor: keys stay in the editor, T gets none (Orca's focusin guard cancels); web tab: keys stay in the page, chrome focus stays on the overlay even when the Theia document focuses an element; the one control steal traced to the test revealing T in the focused editor's own tab bar (focus dropped to body, then the pane reclaimed it), not the helper
  implication: (c) does not take focus from a Theia editor or a web tab in the measured paths; untested: worktree-creation completion (Orca's in-view check cannot see Theia UI)

## Resolution

root_cause:
fix:
verification:
files_changed: []
