---
status: awaiting_human_verify
trigger: "Orca's usePrimarySelectionPaste runs in the Theia document (pb-pane-mount.tsx:173) and cancels middle-click paste into every Theia text field while orcad runs; owner ruling 2026-11-17: limit the hook to Orca panes"
created: 2026-11-17T13:00:00Z
updated: 2026-11-17T19:00:00Z
---

## Current Focus

hypothesis: confirmed (see reasoning_checkpoint and Evidence)
test: done -- tab-strip-live 5/5, tab-strip-live-self-test 5/5, orca-terminal-keys-live 3/3, orca-tabs-live, orca-pane-css-live, first-boot-surface-fresh green
expecting: n/a
next_action: owner: real middle-click into a Theia text field with Orca running; decide the hosted default of Orca's Middle-click Paste from Selection (off in its web client)
bug_class: Bohrbug (deterministic whenever the pane bundle boots)
reasoning_checkpoint:
  hypothesis: "usePrimarySelectionPaste (orca/src/renderer/src/hooks/usePrimarySelectionPaste.ts) adds document capture listeners that act on every editable in the document: with Orca's setting off (the web client's stored default in a browser) its Linux opt-out branch preventDefaults every middle mouseup and auxclick; with it on, it suppresses them on any editable and inserts Orca's buffer. The pane mount runs it in the Theia document through useAppShellServices"
  confirming_evidence:
    - "prior probe: with 26768 free (bundle booted) mouseup and auxclick on a Theia contenteditable are defaultPrevented and tab-strip-live middle is NOT SCORED; with 26768 held both pass"
    - "source: findEditablePrimarySelectionPasteTarget matches any input/textarea/contenteditable, no Orca-root check; listeners are on document"
  falsification_test: "tab-strip-live middle still NOT SCORED with the bundle booted after the services root stops calling the hook"
  fix_rationale: "the cancel/paste listeners act only on targets inside [data-pb-orca-pane-root]; setPrimarySelectionEnabled still runs so TerminalPane's own middle-click paste keeps working"
  blind_spots: "macOS (UA path) not run; Orca dialogs portalled to body are outside pane roots and get native paste; with the setting at its default (off) the Linux opt-out branch still blocks middle paste inside Orca panes, as stock Orca's web client does"
  candidate_causes:
    - "code: app-wide hook mounted by the overlay services root"
    - "config/data: Orca's web client stores primarySelectionMiddleClickPaste false in a browser (getDefaultPrimarySelectionMiddleClickPaste reads process.platform), selecting the opt-out branch that blocks every middle paste"
  and_gate: "yes: the hook mounted AND the bundle booted (orcad on a free port) AND middlemouse.paste on Linux"

## Symptoms

expected: middle-click into a Theia text field pastes the system PRIMARY selection while orcad runs
actual: nothing pasted, or Orca's captured selection pasted
errors: tab-strip-live / tab-strip-live-self-test "middle: NOT SCORED -- the Theia-frame detector caught no paste from a real middle-click into its editable"
reproduction: scripts/verify-platform.sh --only tab-strip-live with 26768 free
started: masked until ed0ecc33 freed 26768

## Eliminated

- hypothesis: a PB wrapper can filter Orca's own hook's document listeners by target without editing Orca
  evidence: the hook adds its listeners to the global document inside its effect and exposes no target parameter; filtering would need a runtime override of document.addEventListener (or a seam), and a window-capture pre-listener cannot hide an event from Orca's document listener without also hiding it from Theia
  timestamp: 2026-11-17T13:20Z

## Evidence

- timestamp: 2026-11-17T13:10Z
  checked: orca/src/renderer/src/hooks/usePrimarySelectionPaste.ts; app-shell/use-app-shell-services.ts; terminal-pane/use-terminal-pane-mobile-actions.ts; lib/primary-selection.ts
  found: enabled path listens on document (selectionchange, mouseup x2, keyup, mousedown, beforeinput, paste, auxclick, capture); disabled path on Linux preventDefaults every middle mouseup; TerminalPane's own middle-click paste (React capture on its container) depends only on the module flag setPrimarySelectionEnabled and Orca's buffer
  implication: scoping the listeners to pane roots and keeping setPrimarySelectionEnabled keeps hosted terminals at stock behaviour
- timestamp: 2026-11-17T16:55Z
  checked: build-orca.sh --panes-only; Orca's web typecheck (node config/scripts/run-typecheck-projects-in-parallel.mjs --project=config/tsconfig.tc.web.json), planted TS2322 in the copied entry first
  found: build PASS; typecheck red on the plant naming pb-pane-mount.tsx, exit 0 without it. Side note: a first attempt through `pnpm run typecheck:web` auto-ran pnpm install scripts (husky core.hooksPath, native/windows-* gyp builds, Electron download failed and rebuild-native-deps exited 0 before rebuilding); hooksPath unset and those outputs removed; lockfile unchanged
  implication: the overlay compiles under Orca's own program; never use pnpm run in orca/
- timestamp: 2026-11-17T17:05Z
  checked: --quick (licensing red: entities@7.0.1 shipped but not in the notices); .mozbuild/orca-shipped caches for the HEAD-era key and the new key
  found: the new derivation resolves web modules through ~/.local/share/pnpm/store/v11/links (pnpm's global virtual store); the HEAD-era set resolves them under node_modules/.pnpm. The accidental `pnpm run` installed without build-orca.sh's ORCA_PNPM_GLOBAL_VIRTUAL_STORE=0 and --store-dir, so it relinked orca/node_modules (.modules.yaml 08:51:31)
  implication: the licensing red is my environment side effect, not the fix; full build-orca.sh (its own install knobs) restores the layout and every output
- timestamp: 2026-11-17T17:30Z
  checked: full build-orca.sh (35 s); .modules.yaml; licensing, orca-pane-entry(+self-test), orca-overlay(+self-test, built), orca-pane-css(+self-test), orca-pane-routes, orca-pane-groups, orca-terminal-keys, orca-terminal-keys-live-self-test, rebase-orca-coverage via --only
  found: virtualStoreDir .pnpm and storeDir .mozbuild/pnpm-store restored; licensing PASS (Orca 1272 packages, as before); every listed row PASS
  implication: environment restored; committed e50bd945
- timestamp: 2026-11-17T17:45Z
  checked: orca-terminal-keys-live run 1 at e50bd945; scratch probe recording mouse events and defaultPrevented in the Theia frame
  found: run 1 red "pasted it 0 time(s)" (Theia editable got the sentinel). Probe: the drag selected the token (helper textarea value and selection), the middle mousedown/mouseup/auxclick on .xterm-screen all defaultPrevented, PTY unchanged. Orca's web client builds its settings from getDefaultSettings in the browser, where getDefaultPrimarySelectionMiddleClickPaste reads process.platform (absent) and stores false; resolvePrimarySelectionMiddleClickPaste(false) is false, so the hook runs its Linux opt-out branch (blocks middle paste) and isPrimarySelectionEnabled stays false
  implication: the original Theia red was the opt-out branch (block), not Orca text; hosted terminals never pasted their selection before the fix either, because of an upstream web-client default (InputPane says "Enabled by default on Linux and macOS")
- timestamp: 2026-11-17T18:00Z
  checked: probe of the revised leg (default, then Orca's switch on via hosted Settings); same probe with the unscoped useAppShellServices rebuilt in
  found: fixed: switch before false, Theia default and on = sentinel, token pasted once. Unscoped: Theia default "" (blocked), Theia on = Orca's token; terminal leg green either way
  implication: the leg discriminates both hook branches; committed a772ea83
- timestamp: 2026-11-17T18:10Z
  checked: orca-terminal-keys-live x3 (green), then tab-strip-live run 1 (red "inserted \"\""); diagnostic copy of the middle scenario recording paste/beforeinput/input on the frame editable
  found: with /b's overlay holding chrome focus, Gecko fired only 'paste' on the frame editable and inserted nothing; with focusTheiaFrame first: paste, beforeinput, input and the sentinel
  implication: the old control was event-only; the frame is focused before the control (57fed2a0)
- timestamp: 2026-11-17T18:57Z
  checked: one at a time via --only, ORCA_* unset: tab-strip-live, tab-strip-live-self-test x5 each alternating, orca-tabs-live, orca-pane-css-live, first-boot-surface-fresh
  found: all rc 0; middle PASS in each tab-strip-live; middle-foreign-paste red in each self-test; no PowerBrowser or orcad process left after any run
  implication: verified

## Resolution

root_cause: the overlay services root called Orca's useAppShellServices, which mounts usePrimarySelectionPaste's document-wide middle-click listeners in the Theia document; with the web client's stored default (off, process.platform absent in a browser) its Linux opt-out branch preventDefaulted every middle mouseup and auxclick (Theia fields pasted nothing); with the setting on it would insert Orca's buffer instead
fix: e50bd945 -- useHostedAppShellServices (Orca's list with usePrimarySelectionPaste swapped for usePanePrimarySelectionPaste: same listeners, cancel/paste only for targets inside [data-pb-orca-pane-root], setPrimarySelectionEnabled kept); orca-pane-entry clause l; live legs a772ea83 (orca-terminal-keys-live 2b, both setting states) and 57fed2a0 (tab-strip-live middle focuses the frame so its control inserts real text)
verification: orca-terminal-keys-live mutation (unscoped hook rebuilt in): Theia default "" and Theia on = Orca token, red; fixed: green 3/3. tab-strip-live 5/5, tab-strip-live-self-test 5/5 (middle-foreign-paste plant red each run), orca-tabs-live, orca-pane-css-live, first-boot-surface-fresh green; static rows and self-tests green; brand scan PASS; nothing left running after any run
oracle_type: specified (exact sentinel text in the Theia editable; token count printed + 1 in orcad's read)
files_changed: [orca-overlay/files/src/renderer/src/pb/pb-pane-mount.tsx, scripts/verify-orca-pane-entry.mjs, scripts/verify-orca-terminal-keys-live.mjs, scripts/verify-tab-strip-live.mjs, scripts/verify-platform.sh, inventory/brand-tokens.json]
why_not_caught: tab-strip-live's control counted a paste event, not pasted text, and ran unmasked only once 26768 was free; no check asked which Orca hooks the pane mount installs in the Theia document
recurrence_guard: orca-pane-entry clause l (scripts/verify-orca-pane-entry.mjs, 10 plants); tab-strip-live middle sentinel equality + boot precondition (plant middle-foreign-paste); orca-terminal-keys-live stage 2b
