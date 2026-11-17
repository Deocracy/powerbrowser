---
status: awaiting_human_verify
trigger: "gate at 2788eb05 (gate-v17-run2.log): orca-service-live FAIL vacuous nothing to reap after 'firefox-bidi: stopped 3 process(es)'; first-boot-surface-fresh FAIL 169 boot errors {type undefined, message undefined}; both green at 4a7308ba"
created: 2026-11-17T08:00:00Z
updated: 2026-11-17T12:00:00Z
---

## Current Focus

hypothesis: confirmed for both (see Resolution)
test: done -- orca-service-live 6/6, first-boot-surface-fresh 6/6 (orcad and the pane bundle up each run), tel06-error-delivery-live, ext-tab-host-live, orcad-leak-self-test, static rows, brand scan
expecting: next full gate shows neither red
next_action: owner rules on the Orca middle-click hijack (Evidence 12:50Z; tab-strip-live red until then), then re-runs the gate
bug_class: Bohrbug (both deterministic)
reasoning_checkpoint:
  hypothesis: "R1: withFirefoxPage's teardown stops launch 2's orphaned orcad before launch 3 runs, because ed0ecc33 stops every process working under the kept profile. R2: Vite's preload helper in the pane bundle links deps the entry already imported, and Gecko fires 'error' on a modulepreload whose module is in the module map; the row's capture-phase counter records each"
  confirming_evidence:
    - "R1: gate line order (two launches, stopped 3, vacuous); HEAD row 2/2 red with the same line; keepStrays on launch 2 6/6 green"
    - "R2: probe shows 169 plain Events on LINK rel=modulepreload /orca-panes/assets/*.js; live control: a new modulepreload for an imported module -> error, unimported -> load; PreloadService.cpp NotifyNodeEvent(false) when no preloader"
  falsification_test: "R1: green without the opt-out; R2: errors persisting with modulePreload false, or row green with the old bundle and orcad up"
  fix_rationale: "R1: the row needs the orphan alive; a named opt-out keeps every other row's stop. R2: no preload links, so nothing for Gecko to error; loopback serving makes preloading worthless"
  blind_spots: "agent-status-live and packaged-live opt-outs not run live (model prompt; no packaged tarball); R2 standalone bundle (.mozbuild) not rebuilt"
  candidate_causes:
    - "code: harness teardown (R1); pane bundle build config (R2)"
    - "environment: port 26768 held by a leaked orcad masked R2 at 4a7308ba"
    - "code (eliminated): 0b1ff185, Theia 68-11 frontend"
  and_gate: "R2 yes: the preload links AND Gecko's non-conforming 'error' AND a free 26768 (pane bundle boots) were all needed for the red"

## Symptoms

expected: orca-service-live green (orcad outlives SIGKILL, launch 3 reaps it); first-boot-surface-fresh 0 boot errors
actual: orca-service-live "vacuous: nothing to reap"; first-boot-surface-fresh 169 records {"type":"undefined","message":"undefined"}
errors: gate-v17-run2.log lines 9340, 9844-9845
reproduction: scripts/verify-platform.sh --only orca-service-live; --only first-boot-surface-fresh
started: gate at 2788eb05 (green at 4a7308ba)

## Eliminated

- hypothesis: R2 is 0b1ff185 (stockWindowStarted races delayedStartupPromise)
  evidence: the code runs only when a stock window opens; first boot opens none; the errors are link events of the pane bundle, and the row is green on the same product with 26768 held or with the rebuilt bundle
  timestamp: 2026-11-17T08:45Z
- hypothesis: R2 is the Theia 68-11 frontend (Help-row isVisible, bundled-extensions module, 0a7d9a72, 9018e1e5)
  evidence: no Theia source change between the gates (both smoke-theia builds from the same tree); every record targets /orca-panes/assets
  timestamp: 2026-11-17T08:45Z
- hypothesis: R2 is load or flakiness
  evidence: 5/5 alone, exactly 169 each run
  timestamp: 2026-11-17T08:20Z

## Evidence

- timestamp: 2026-11-17T08:00Z
  checked: gate-v17-run2.log 9841-9845; scripts/lib/firefox-bidi.mjs cleanup (ed0ecc33); scripts/verify-orca-service-live.mjs launch 2
  found: two launches logged, then "stopped 3 process(es) left running under .../orca-service-live/profile-...", then vacuous; launch 2's withShell returns after the SIGKILL and its cleanup stops strays whose cwd is under the kept profile, before the row's 2 s survival check
  implication: R1 is the harness cleanup, not the product
- timestamp: 2026-11-17T08:00Z
  checked: git log 4a7308ba..2788eb05 -- theia; both gates' smoke-theia rebuilt the frontend
  found: no Theia source change between the gates
  implication: 0a7d9a72/9018e1e5/68-11 were already in the green gate's bundle; not a differential
- timestamp: 2026-11-17T08:20Z
  checked: first-boot-surface-fresh alone, 5 runs at fafb672d
  found: 5/5 FAIL, exactly 169 records each run
  implication: deterministic (Bohrbug), not load
- timestamp: 2026-11-17T08:30Z
  checked: scratch probe (fb-probe.mjs) recording target/class of each capture-phase error event
  found: all 169 are plain Event on LINK rel=modulepreload crossorigin as=script, href /orca-panes/assets/*.js, fired within 4 ms at ~4.8 s; 179 such links; fetch() of one is 200 application/javascript; the pane bundle module loaded (Symbol.for powerbrowser.orca-panes.module set)
  implication: the records are resource 'error' events on the Orca pane bundle's Vite preload links, not script errors
- timestamp: 2026-11-17T08:35Z
  checked: upstream/uriloader/preload/PreloadService.cpp PreloadLinkElement -> PreloadOrCoalesce -> ScriptLoader::PreloadURI; js/loader/ModuleLoaderBase.cpp StartOrRestartModuleLoad (WaitForModuleFetch when the module map holds the URL); live: a new modulepreload link for pb-panes.js and for pb-pane-mount (already imported) -> error, for an unimported asset -> load, a missing asset -> error
  found: Gecko registers no preloader for a module already in the module map, so PreloadLinkElement gets no preloader and NotifyNodeEvent fires 'error' (spec: load)
  implication: 169 of 179 deps were statically imported before the dynamic import's helper added their links
- timestamp: 2026-11-17T08:40Z
  checked: first-boot-surface-fresh with 127.0.0.1:26768 held by a dummy listener
  found: PASS, 0 boot errors, no stray stop line (no orcad, no pane bundle)
  implication: gate at 4a7308ba was green because tel06's leaked orcad held 26768 (prior debug: pid 1290561, port 26768, alive across the gate); ed0ecc33 freed the port and unmasked the pane bundle's preload links
- timestamp: 2026-11-17T08:50Z
  checked: orca-service-live with HEAD's row code (2 runs) and with keepStrays on launches 1 and 2 (6 runs)
  found: before 2/2 FAIL vacuous, "stopped 3 process(es)" each; after 6/6 PASS, no stray line, nothing left
  implication: R1 fixed by the opt-out
- timestamp: 2026-11-17T08:55Z
  checked: orcad-leak-self-test with the keepStrays plant; mutants: stopRunStrays ignoring keepStrays, stopRunStrays never stopping
  found: PASS; each mutant MISSes exactly one case (vacuous plant / teardown left pid running)
  implication: the plant discriminates both directions
- timestamp: 2026-11-17T11:10Z
  checked: build-orca.sh --panes-only with build.modulePreload false; first-boot-surface-fresh 6 runs; probe
  found: no chunk carries the modulepreload helper (1 before); 6/6 PASS, each with "stopped 3 process(es)" (orcad up); probe: 0 links, 0 events, pane module loaded
  implication: R2 fixed at the source; orca-pane-css-live, orca-tabs-live, orca-side-panel-live green on the rebuilt bundle
- timestamp: 2026-11-17T12:30Z
  checked: the 17 ledger-blocked rows at 41229f23, one at a time
  found: 14 PASS first run; ng-011-settings-table-read red once (harness: BiDi WebSocket closed mid-run), then 3/3 PASS; tab-strip-live and tab-strip-live-self-test red: "middle: NOT SCORED -- the Theia-frame detector caught no paste from a real middle-click into its editable"
  implication: ng-011 transient; tab-strip red needs a cause
- timestamp: 2026-11-17T12:50Z
  checked: verify-tab-strip-live.mjs --scenario middle with 26768 free vs held; probe dispatching button-1 mousedown/mouseup/auxclick on a Theia-document contenteditable
  found: free (orcad up, pane bundle booted): FAIL, mouseup and auxclick defaultPrevented true; held (no orcad): PASS, nothing prevented
  implication: NEW, not fixed here -- the pane mount's Services() (orca-overlay pb-pane-mount.tsx:173) runs Orca's useAppShellServices in the Theia document, including usePrimarySelectionPaste (orca/src/renderer/src/hooks/usePrimarySelectionPaste.ts:192-210), whose document capture listeners cancel the native middle-click paste into every editable and paste Orca's own captured selection instead. On Linux (and macOS by user agent) with Orca running, middle-click into a Theia text field no longer pastes the system primary selection. Masked at 4a7308ba by the same leaked orcad on 26768. Needs an owner call on which Orca shell services run in the Theia document.

## Resolution

root_cause: R1 -- ed0ecc33's withFirefoxPage teardown stops every process working under the kept profile once the browser exits, so orca-service-live's deliberately orphaned orcad (launch 2, SIGKILL) was stopped by the harness before launch 3 could exercise OrcaService._reapLeftover; the same teardown made the quit verdicts of orca-service-live launch 1, orca-agent-status-live and orca-packaged-live vacuous (a survivor is stopped before the verdict reads it). R2 -- the Orca pane bundle (orca-overlay vite.pb-panes.config.ts) is imported from an inline module script, so Vite's preload helper linked deps the entry had already imported (179 links); Gecko fires 'error' on a modulepreload whose module is already in the module map (PreloadService::PreloadLinkElement, NotifyNodeEvent), 169 at every boot where orcad pairs; first-boot-surface-fresh's capture-phase counter records them. Masked at 4a7308ba by tel06's leaked orcad holding 26768 (first boot's orcad never started).
fix: R1 8d1db795 (withFirefoxPage/withShell keepStrays, stopRunStrays; orca-service-live launches 1-2, orca-agent-status-live, orca-packaged-live opt out and stop their own strays; orcad-leak-self-test plant). R2 41229f23 (build.modulePreload false; pane bundle rebuilt with build-orca.sh --panes-only).
verification: orca-service-live 2/2 red before, 6/6 green after; first-boot-surface-fresh 5/5 red before, 6/6 green after with orcad and the bundle up; tel06-error-delivery-live, ext-tab-host-live, orcad-leak-self-test green; orcad-leak-self-test mutants each killed; static rows orca-overlay(+self-test, built), orca-pane-entry(+self-test), orca-pane-css(+self-test), orca-pane-routes(+self-test), orca-browser-host-bundle(+self-test), orca-service-live-self-test, orca-agent-status-live-self-test, orca-packaged-live-self-test, live-scratch-home(+self-test), bidi-remote-value(+self-test), first-boot-surface-self-test; scan-brand-residue PASS
user_visible: none -- the modules load and the panes boot; the product's telemetry listener (telemetry-error-capture.ts:23, bubble phase) never receives a non-bubbling link event; the only effect was 179 dead link elements in the Theia document head
why_not_caught: R1 -- ed0ecc33 was verified on the rows that leaked, not on rows that judge survivors after the launch; R2 -- first-boot-surface-fresh covers the pane bundle only when orcad can bind 26768, and nothing records whether it booted
recurrence_guard: orcad-leak-self-test keepStrays plant (scripts/verify-orcad-leak.mjs); orca-service-live's vacuous verdict; first-boot-surface-fresh (red on any preload-link event), kept unmasked by the leak leg (9fd3891c) and ed0ecc33
files_changed: [scripts/lib/firefox-bidi.mjs, scripts/lib/pb-relaunch.mjs, scripts/verify-orca-service-live.mjs, scripts/verify-orca-agent-status-live.mjs, scripts/verify-orca-packaged-live.mjs, scripts/verify-orcad-leak.mjs, scripts/verify-platform.sh, inventory/brand-tokens.json, orca-overlay/files/vite.pb-panes.config.ts]
