---
status: awaiting_human_verify
trigger: "Job 1 (owner ruling 2026-11-17, 'Preset it ON on Linux, in memory'): hosted Orca terminals on Linux paste their selection on middle-click out of the box, in memory only like D-32, user's explicit choice wins. Job 2 ('Test and scope if needed'): test useLargeTextControlPaste, session-persistence beforeunload, workspace-activation focus helper live against non-Orca Theia UI; scope any that affects it"
created: 2026-11-17T19:30:00Z
updated: 2026-11-18T00:40:00Z
---

## Current Focus

hypothesis: confirmed: (a) and (b) affected Theia UI and are scoped; (c) does not take focus in the measured paths
test: done -- orca-terminal-keys-live 5/5, tab-strip-live 3/3, tab-strip-live-self-test 3/3, extended static rows 3/3, orca-tabs-live, orca-pane-css-live, first-boot-surface-fresh, orca-service-live green
expecting: n/a
next_action: owner: middle-click paste in a real hosted terminal on Linux at the default, then Settings off; owner item: TerminalPane's first-show focus (see Evidence 2026-11-17T23:20Z)
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

- hypothesis: the editor-leg steal in orca-terminal-keys-live run 1 at 6729ce22 was the workspace-activation focus helper
  evidence: focus() stack capture: the helper's rAF calls (workspace-activation-terminal-focus chunk) hit the hidden terminal and Orca's focusin guard cancelled it when focus entered the editor; the steal was TerminalPane's createInitialPane/setActivePane focus on the terminal's first reveal
  timestamp: 2026-11-17T23:20Z

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

- timestamp: 2026-11-17T22:10Z
  checked: build-orca.sh --panes-only (10 s); the entry type-checked alone with Orca's TypeScript 7.0.2 over orca/config/tsconfig.web.json from a scratch tsconfig (program proven live by a planted TS2322); orca-pane-entry, orca-terminal-keys and their self-tests; --quick
  found: all green; clause f 8 plants and clause l 8 new plants red naming their drift; 16 app-wide listeners of the services root derived and classified
  implication: committed 8d2530b2 (fix and static legs), 45eca9fb (live legs)
- timestamp: 2026-11-17T22:40Z
  checked: orca-terminal-keys-live run 1 at 6729ce22
  found: 2b green (switch on at the default, user's off held, token pasted once then not at all, Theia sentinel all three times); leave check green (failed 1, permit true); quick input past the document listeners and equal to Gecko's single-line paste (102401 characters); red: editor paste not seen by a listener on its target although the text was equal, and keys typed in the editor reached the Orca terminal after it was revealed
  implication: the two reds needed attribution before any change
- timestamp: 2026-11-17T23:20Z
  checked: scratch run recording the paste path at window, document and body (capture and bubble), and every focus() on an xterm helper textarea with its stack
  found: post-fix the Monaco paste passes body capture, and Monaco stops it at its textarea (no bubble), so the target listener was the wrong detector; revealing a hosted terminal for the first time focuses it from TerminalPane's createInitialPane/setActivePane (its own mount: PowerBrowser mounts every hosted terminal with isActive), taking focus from a visible Theia editor; with the first pane already created, the palette-queued helper's focus calls failed on the hidden terminal and its focusin guard cancelled it
  implication: the leg detects the paste at body capture and spends the terminal's first-pane focus before the palette (21cfdc81); the first-show focus is a separate owner item, not one of the three listeners
- timestamp: 2026-11-18T00:30Z
  checked: one at a time via --only, ORCA_* unset: orca-terminal-keys-live x5 (after one stage-1 harness timeout on the t<n> recorder file, before any Orca leg); tab-strip-live and its self-test x3 alternating; orca-terminal-keys, its self-test, orca-terminal-keys-live-self-test, orca-pane-entry and its self-test x3; orca-tabs-live, orca-pane-css-live, first-boot-surface-fresh, orca-service-live
  found: all rc 0; no PowerBrowser or orcad process left after any run
  implication: verified

## Resolution

root_cause: (a) the services root ran Orca's useLargeTextControlPaste, whose document capture listener claimed every paste above 64 KiB into any input or textarea of the Theia document (Theia's own handlers never saw it; a single-line field lost Gecko's newline handling); (b) it ran Orca's useAppSessionPersistence, whose beforeunload handler cancels the unload when Orca's checkpoint throws, and PowerBrowser's quit veto and a Theia reload ask that same leave check; (c) the workspace-activation focus helper takes no focus from a Theia editor (Orca's own focusin guard) or a web tab (a focus call in the Theia document does not move keyboard focus out of an overlay); Job 1: Orca's web client stores Middle-click Paste from Selection off because its default reads process.platform
fix: 8d2530b2 -- usePaneLargeTextControlPaste (Orca's claim, only inside [data-pb-orca-pane-root]); useHostedAppSessionPersistence (Orca's hook with the checkpoint run at every unload and a failure only reported); the Linux preset in hostedTerminalKeysPatch (store only, until a pass-through window.api.settings.set wrapper sees the user write the switch); orca-terminal-keys clause f, orca-pane-entry clause l extended with the listener classification; live legs 45eca9fb and 21cfdc81
verification: pre-fix evidence at e324130a (Evidence 20:40Z and 20:55Z: paste stopped at document capture, multi-line text lost its newlines, leave check false); post-fix the same detectors green in orca-terminal-keys-live 5/5; tab-strip-live 3/3 and its self-test 3/3; extended static rows and self-tests 3/3; orca-tabs-live, orca-pane-css-live, first-boot-surface-fresh, orca-service-live green; --quick green; brand scan PASS; nothing left running
restart_behaviour: in memory only; a reload or restart presets the switch on again, because the off Orca stores is indistinguishable from its own default off (it writes the whole settings object on any write) and PowerBrowser keeps nothing of its own
oracle_type: specified (exact sentinel and token counts; Gecko's documented single-line paste under editor.singleLine.pasteNewlines 2; the browser's own leave check)
files_changed: [orca-overlay/files/src/renderer/src/pb/pb-pane-mount.tsx, scripts/verify-orca-pane-entry.mjs, scripts/verify-orca-terminal-keys.mjs, scripts/verify-orca-terminal-keys-live.mjs, scripts/verify-platform.sh, inventory/brand-tokens.json]
why_not_caught: no check asked what Orca's app-shell services install in the Theia document beyond the selection hook; orca-pane-entry clause l now derives and classifies them
recurrence_guard: orca-pane-entry clause l (APP_WIDE_LISTENERS, both ways, 8 new plants); orca-terminal-keys clause f (8 plants); orca-terminal-keys-live 2b and 2c
owner_item: Orca's TerminalPane focuses its terminal when its first pane is created, which in PowerBrowser happens the first time a hosted terminal widget is shown; shown without the user activating it (a reveal, or a new hosted pane becoming the current tab of another tab bar) it takes keyboard focus from a Theia editor the user is typing in. Not changed here
