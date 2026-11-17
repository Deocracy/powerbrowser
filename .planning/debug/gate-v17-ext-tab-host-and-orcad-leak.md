---
status: awaiting_human_verify
trigger: "gate 2026-11-16 at 4a7308ba: ext-tab-host-live(+self-test) red not excluded (options-page-switch control: 2 options tabs while stock window starting); leaked orcad pid 1290561 port 26768 started 12:13:56 PST, survived the gate"
created: 2026-11-16T20:20:00Z
updated: 2026-11-17T05:10:00Z
---

## Current Focus

hypothesis: confirmed for both findings (see Resolution)
test: done -- tel06-error-delivery-live 5/5, ext-tab-host-live 5/5, ext-tab-host-live-self-test 5/5, static rows, brand scan
expecting: next full gate shows neither red and no orcad from this worktree after the run
next_action: owner re-runs the gate; pid 2111873 (foreign pb-relaunch leftover, not from these runs) is still running

## Symptoms

expected: ext-tab-host-live green; no orcad survives a live row
actual: self-test control options-page-switch FAIL (2 options tabs, window still starting: true); orcad pid 1290561 alive 4h after its row
errors: gate log line 7396
reproduction: scripts/verify-platform.sh --only ext-tab-host-live-self-test; --only tel06-error-delivery-live
started: 2026-11-16 gates (both runs)

## Eliminated

## Evidence

- timestamp: 2026-11-16T20:18Z
  checked: gate log pids and row order
  found: tel06-error-delivery-live node pid 1290158 (line 6116), leaked orcad pid 1290561, smoke-theia yarn pid 1291030 (line 6150); smoke-theia Theia log starts 20:14:30Z, after orcad start 20:13:56Z
  implication: orcad was spawned during tel06-error-delivery-live
- timestamp: 2026-11-16T20:19Z
  checked: /proc/1290561 (environ keys, cwd)
  found: HOME=.mozbuild/pb-live-profiles/pb-home-6GbxoD, cwd=.mozbuild/pb-live-profiles/powerbrowser-firefox-bidi-MHnXBO/powerbrowser-orca (deleted), ppid 2308
  implication: launched by scripts/lib/firefox-bidi.mjs profile; the profile was deleted while orcad lived

- timestamp: 2026-11-17T00:22Z
  checked: scratch experiment withFirefoxPage('') on dev objdir, hold 15 s, return; and a bare spawn + SIGTERM
  found: orcad (and its terminal daemon + scope watcher, own sessions) survive; PB parent exits by signal SIGTERM 54 ms after the harness SIGTERM, with no OrcaService stop log; SigCgt bit 15 set (a handler is installed) yet the exit is by signal
  implication: the harness's SIGTERM is a crash for PB (no quit blockers run); the product's design reaps a leftover only on the next launch of the SAME profile (_reapLeftover), which a throwaway live profile never gets
- timestamp: 2026-11-17T00:24Z
  checked: process tree under the live profile before/after SIGTERM
  found: orcad keeps the row's session id; daemon and watcher are setsid'd; all three have cwd under <profileDir>/powerbrowser-orca; argv names only shared paths (upstream/../orca/out/orcad/orcad.js)
  implication: the WINDOWS 54 fix (0ea32a1a) matches argv under a pb-pkg-* extraction root only, so dev-objdir runs are never cleaned; identity for dev runs must be cwd under the run's profileDir
- timestamp: 2026-11-17T00:40Z
  checked: options-page-switch scenario alone, 15 runs, no concurrent load
  found: 3/15 FAIL (runs 1, 11, 12) with the gate's exact message; wasStarting true in passes too
  implication: not load-only; a timing race reproducible alone

- timestamp: 2026-11-17T00:58Z
  checked: instrumented copy of the scenario (scratchpad trace-opt.mjs) wrapping ext-browser openOptionsPage, the stock window's switchToTabHavingURI and gBrowser.addTab; 18 traced runs
  found: second call lands (a) after the deferred select ran and wrapped the stock switch -> pass; (b) before delayed startup finished -> pass (startup reloads the selected tab, NG-009); (c) after delayedStartupFinished but before the deferred select (9 ms gaps: 768/777, 756/765, 749/758) -> FAIL every time (3/3): stock URILoadingHelper.switchToTabHavingURI loads into the empty initial tab ("current", no userTypedValue), then the select adds a second tab
  implication: (a) real product race; the gap is stockWindowStarted's 50 ms poll (PowerBrowserAPI.sys.mjs:6610-6618) between the flag flipping and the select; harness commits and load are not the cause

- timestamp: 2026-11-17T01:40Z
  checked: tel06-error-delivery-live via verify-platform.sh with the leak leg (9fd3891c) and without the harness fix
  found: row FAIL, "left orcad pid 2602131 running after it exited (session 2601607)", orcad stopped, nothing left under the live profile base
  implication: the leg goes red on the real leak; negative control for ed0ecc33

- timestamp: 2026-11-17T02:10Z
  checked: options-page-switch alone after 0b1ff185, 20 runs; traced 12 runs
  found: 20/20 PASS; traced second calls land only before startup (started false) or after the select wrapped the switch (prodWrapped true), never in the gap
  implication: the gap is closed structurally, not by timing luck
- timestamp: 2026-11-17T02:30Z
  checked: tel06-error-delivery-live via verify-platform.sh, 5 runs on a clean tree (after 3824e0c4)
  found: 5/5 PASS, each run "stopped 3 process(es) left running under <profile>" (orcad, daemon, watcher), leak leg silent, nothing left
  implication: F2 fixed for the row
- timestamp: 2026-11-17T02:45Z
  checked: site-identity WR-07 leg after 0b1ff185
  found: red (it spelled `await PowerBrowserAPI.sleep(`); updated in 3824e0c4 plus a new delayedStartupPromise leg; self-test 57/57
  implication: static recurrence guard for F1

## Resolution

root_cause: F1 -- stockWindowStarted polled delayedStartupFinished every 50 ms; a second openOptionsPage landing in the gap reached the started window's unwrapped stock switchToTabHavingURI, which loaded the page into the empty initial tab, then the deferred select added a second tab (product race). F2 -- the harness SIGTERM kills PB outright (no quit blockers), and withFirefoxPage stopped strays only for packaged runs (argv under pb-pkg-*); dev-run orcad/daemon/watcher (cwd under <profile>/powerbrowser-orca) survived; first row to start orcad on 26768 in the gate was tel06-error-delivery-live
fix: 0b1ff185 (race the poll with win.delayedStartupPromise) and 3824e0c4 (site-identity WR-07 + promise leg); 9fd3891c (driver leak leg + orcad-leak-self-test); ed0ecc33 (withFirefoxPage stops strays by cwd under the profile)
verification: options-page-switch alone 3/15 red before, 20/20 after; traced gap state never reached after the fix; ext-tab-host-live 5/5 and its self-test 5/5 green (every session stopped its strays, 29 and 60 per run); tel06 negative control red via the leg, then 5/5 green with 3 strays stopped per run; static rows internals-boundary, internals-catalogue, ng-040 (+self-test), site-identity (+self-test 57/57), orca-packaged-live-self-test (cwd-clause mutant killed), live-scratch-home (+self-test), bidi-remote-value (+self-test), shell-gbrowser-standin, orcad-leak-self-test; scan-brand-residue PASS
files_changed: [scripts/verify-site-identity.mjs, powerbrowser/shell/PowerBrowserAPI.sys.mjs, powerbrowser/INTERNAL-APIS.md, scripts/verify-orcad-leak.mjs, scripts/verify-platform.sh, scripts/lib/firefox-bidi.mjs, scripts/verify-orca-packaged-live.mjs, inventory/brand-tokens.json]
