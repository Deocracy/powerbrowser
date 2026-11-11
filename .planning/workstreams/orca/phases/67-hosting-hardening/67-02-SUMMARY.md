---
phase: 67-hosting-hardening
plan: 02
subsystem: token-gate checks (RUN-08 for Orca's traffic)
tags: [run-08, origin-gate, orca, live-check, header-record]
status: complete
requires:
  - "hotfix-sidecar-origin merged (abca6309 merge: main 2b5f4609 (sidecar Origin gate hotfix) into v1.7)"
  - "Phases 64-66 merged (p66-01..p66-05 merges in the base)"
provides:
  - "sidecar-origin-gate: orcad-origin and orca-routes rules, 14 self-test plants"
  - "sidecar-origin-gate-live: pane-bundle positive control, orcad-origin legs in a stock window and a web tab"
  - "sidecar-status-recorder PB_SIDECAR_STATUS_PATHS"
  - "record-sidecar-headers.mjs Orca classes (pane-bundle, host-bundle, orcad-stock, orcad-overlay, agent)"
affects: [67-06]
tech-stack:
  added: []
  patterns: ["derive orcad origin from OrcaEnv + pref default", "orcad on freePort in live runs"]
key-files:
  created: []
  modified:
    - scripts/verify-sidecar-origin-gate.mjs
    - scripts/verify-sidecar-origin-gate-live.mjs
    - scripts/lib/sidecar-status-recorder.cjs
    - .planning/workstreams/orca/phases/67-hosting-hardening/probes/record-sidecar-headers.mjs
decisions:
  - "Live row and probe start orcad on a free port (the freePort pattern of orca-tabs-live), so an orcad already on the default port 26768 cannot block the run or answer in its place"
  - "Agent overlays are driven as Orca drives them, through webTabAgent browser.goto and browser.eval; BiDi does not list agent-container overlays"
metrics:
  duration: "about 75 min"
  completed: 2026-11-11
actuals:
  tokens: 9000
  tasks: 2
  commits: 2
plan_head_before: 85c7895d20e076a830f53fed348acd4c87296aa7
plan_head_after: 3f81880d12f30b1ab11bac76d69c8bef4662a04a
---

# Phase 67 Plan 02: Sidecar Origin gate checks extended to Orca's request classes Summary

The merged hotfix rule was not changed. It refuses orcad's origin, every Orca sidecar route sits behind it, and the
live row and the header re-record show PowerBrowser's Orca bundles admitted (200, same-origin) while orcad's page
and agent overlays get 403 with the token cookie present.

## Base and setup

- Hotfix in base: merge commit `abca6309` "merge: main 2b5f4609 (sidecar Origin gate hotfix) into v1.7". The
  precondition passed (origin-policy.ts, isOwnOrigin, both registry rows, the recorder, orca-panes and the p66-* merges).
  No path substitutions.
- Setup 1 and 2 ran: `node scripts/generate.mjs` and the audited Theia install (`yarn install --ignore-scripts
  --frozen-lockfile` and the drivelist rebuild) both exited 0.
- Setup 3: the pane-bundle route prefix is `/orca-panes/` (`ORCA_PANES_ROUTE_PREFIX`,
  theia/extensions/orca-panes/src/common/orca-panes-protocol.ts, registered by `app.use` in `configure(app)` of
  orca-panes-backend-module.ts). The served directory is `orca/out/web/assets/pb-panes/` (scripts/build-orca-panes.sh `OUT`),
  and the Phase 66 host bundle `pb-browser-host.js` is written into the same directory.
- Derived Orca route list: `/orca-panes/` only. orca-agents and orca-workspace register no HTTP route.
  orca-agents' `onStart()` attaches no listener.

## Task results

| Task | Commit | Result |
|------|--------|--------|
| 1 quick rules + plants | af002471 | `--only sidecar-origin-gate` PASS, `--only sidecar-origin-gate-self-test` PASS (14 plants: 8 hotfix + 6 lane) |
| 2 live legs, recorder, probe | 3f81880d | node --check x2, recorder require, quick row PASS; live row PASS; probe re-record done |

Quick pass lines:
- `orcad-origin PASS -- http://127.0.0.1:26768 (ORCAD_BIND_HOST, powerbrowser.orca.port default) is refused for Sec-Fetch-Site none, same-origin, same-site, cross-site, same-everything, absent, and its Origin-less same-site and cross-site requests too`
- `orca-routes PASS -- /orca-panes/ registered in configure(), behind gate(); no Orca early-middleware handler or raw request/upgrade listener`

The 6 lane plants: originVerdict admits the orcad port, an earlyMiddleware.handlers unshift, `server.on('request')`,
a file set with no route, the bundle route registered in onStart, and the bundle route moved off its prefix. Each
goes red naming its rule.

## Live runs (in the lane, against the coordinating workspace's built tree)

The lane has no objdir and no orca/out, so both live runs used the built tree of
/home/chris/orca/workspaces/Power-Browser/v1.7-Orca-integration (same commit as this lane's base, 85c7895d):
`PB_FIREFOX_BIN=<v1.7>/objdir/dist/bin/powerbrowser PB_BACKEND_MAIN=<v1.7>/theia/applications/browser/lib/backend/main.js`.
Both ran under `flock /home/chris/coding/Power-Browser/.git/pb-live.lock` with every ORCA_* unset.

The first live run went red with `orcad not ready`. Another process's orcad already held the default port 26768
(a 32-hour-old orcad from the v1.7 tree; it was left running). The fix is the freePort pref the other Orca live
checks already use. After that fix, `sidecar-origin-gate-live` returned PASS (exit 0):

```
ok  theia-{nocors,cors,img}: GET Sec-Fetch-Site=same-origin token=true -> 200; theia-upload POST own Origin -> 200
ok  stock-{nocors,cors,img,upload,nav}: Sec-Fetch-Site=same-site token=true -> 403
ok  pane bundle under /orca-panes/: 467 request(s); classes: style same-origin Origin=absent -> 200; script same-origin Origin=absent -> 200; font same-origin Origin=absent -> 200
ok  orcad's own page loaded in a stock window (root element present: true)
ok  orcad-stock-{nocors,cors,img,upload,nav}: Sec-Fetch-Site=same-site token=true -> 403 (cors/upload Origin=http://127.0.0.1:<orcad port>)
ok  orcad's own page loaded in a web tab (root element present: true)
ok  orcad-overlay-{nocors,cors,img,upload,nav}: Sec-Fetch-Site=same-site token=false -> 403
ok  theia-after: same-origin -> 200
sidecar-origin-gate-live: PASS
```

## Header record per class (probe re-record, 2026-11-11)

Command: `flock /home/chris/coding/Power-Browser/.git/pb-live.lock node .planning/workstreams/orca/phases/67-hosting-hardening/probes/record-sidecar-headers.mjs .mozbuild/p67-02/headers`
(with the two PB_* variables above). Columns are kind | method | origin | sec-fetch-site | mode | dest | user | pbCookie | theiaCookie | status.
The run used origin ports 44389 (sidecar), 41599 (foreign page) and 31525 (orcad).

PowerBrowser's own classes, all admitted:
```
host-bundle :: http | GET |  | same-origin | cors | script |  | true | true | 200  (1; /orca-panes/pb-browser-host.js)
pane-bundle :: http | GET |  | same-origin | cors | font |  | true | true | 200  (1; /orca-panes/assets/codicon-*.ttf)
pane-bundle :: http | GET |  | same-origin | cors | script |  | true | true | 200  (464; /orca-panes/pb-panes.js, /orca-panes/assets/*.js)
pane-bundle :: http | GET |  | same-origin | no-cors | style |  | true | true | 200  (1; /orca-panes/pb-panes.css)
theia :: http | GET |  |  |  |  |  | true | false | 200  (6; /powerbrowser/health, chrome probe)
theia :: http | GET |  | none | navigate | document |  | true | false | 200  (1; /)
theia :: http | GET |  | same-origin | cors | empty |  | true | true | 200  (4; /socket.io/)
theia :: http | GET |  | same-origin | cors | script |  | true | true | 200  (1; /editor.worker.js)
theia :: http | GET |  | same-origin | no-cors | image |  | true | true | 404  (1; /favicon.ico, no such file; past the gate)
theia :: http | GET |  | same-origin | no-cors | script |  | true | true | 200  (1; /bundle.js)
theia :: http | GET |  | same-origin | no-cors | style |  | true | true | 200  (1; /bundle.css)
theia :: http | POST | http://127.0.0.1:44389 | same-origin | cors | empty |  | true | true | 200  (3; /socket.io/)
theia :: ws | GET | http://127.0.0.1:44389 | same-origin | websocket | empty |  | true | true | 101  (1; /socket.io/)
probe=theia-{nocors,cors,img,worker} :: GET | same-origin | true | true | 200; theia-upload POST own Origin 200; theia-ws 101
```

Foreign classes, all refused:
```
probe=orcad-stock-{nocors,img,worker}  :: GET  (no Origin) | same-site | pbCookie true (worker false) | 403
probe=orcad-stock-cors                 :: GET  http://127.0.0.1:31525 | same-site | true | 403
probe=orcad-stock-upload               :: POST http://127.0.0.1:31525 | same-site | true | 403
probe=orcad-stock-ws                   :: ws   http://127.0.0.1:31525 | same-site | true | 400
probe=orcad-overlay-{nocors,cors,img,upload,worker} :: same-site | pbCookie false | 403; orcad-overlay-ws 400
probe=agent-{nocors,cors,img,upload,worker}         :: same-site | pbCookie false | theiaCookie false | 403; agent-ws 400
probe=stock-{nocors,cors,img,upload,worker,samesite-nav} :: same-site | 403; stock-ws 400
probe=overlay-{nocors,cors,img,upload,worker}       :: same-site | pbCookie false | 403; overlay-ws 400
probe=xsite-nav :: GET | cross-site | navigate | document | 403
```
- Agent overlay: `agentContainer: true`, meaning the overlay's userContextId is not 0. Neither cookie arrives,
  because the container keeps its own cookie jar.
- Upload files written by the sidecar: theia only. stock, overlay, orcad-stock, orcad-overlay and agent wrote
  nothing. Every upload uri pointed into the probe's output folder `.mozbuild/p67-02/headers` (git-ignored).
- Compared with the research record, `stock-*` and `xsite-nav` moved from 200 to 403. That is the hotfix's intended
  change (A-1).
- No 304 rows appeared, because each run used a fresh profile. The pane-bundle script and font rows are `cors` mode
  with no Origin, and the rule admits them as same-origin.

## Coordinator proof commands

Run these in order on the merged, built tree (after the Theia rebuild and the faster build):
1. The existing Theia-loading live rows the coordinator re-runs first, for example `scripts/verify-platform.sh --only` for each of the
   makeProfile/firefox-bidi rows named in 67-VALIDATION 67-06-T1.
2. `flock /home/chris/coding/Power-Browser/.git/pb-live.lock node .planning/workstreams/orca/phases/67-hosting-hardening/probes/record-sidecar-headers.mjs .mozbuild/p67-06/headers`
3. `scripts/verify-platform.sh --only sidecar-origin-gate-live`. The script takes the live lock itself. Set
   `PB_LIVE_LOCK_HELD=1` when the lock is already held.

## Merge note for the coordinator

- This lane changes no registry entry. It does not edit origin-policy.ts, token-gate-backend-contribution.ts,
  theia/ or scripts/verify-platform.sh, and the lane diff stays within files_modified.
- If a later re-record shows a class of PowerBrowser's own document refused (Sec-Fetch-Site other than same-origin or
  none, or a foreign Origin), that is a gate change for the hotfix line and an owner item (67-06 Task 2). It is never
  fixed by an edit in this lane. This run showed no such class.
- Brand rows to re-measure, because the lane cannot edit inventory/brand-tokens.json. Source:
  `node scripts/scan-brand-residue.mjs --report .mozbuild/p67-02/brand-report.md` on the staged lane tree, which
  FAILs only on these:
  - `Orca` row: +19 in scripts/verify-sidecar-origin-gate.mjs and +13 in scripts/verify-sidecar-origin-gate-live.mjs. Both files are new to the row.
  - `orca` row: +68 in scripts/verify-sidecar-origin-gate.mjs and +70 in scripts/verify-sidecar-origin-gate-live.mjs. Both files are new to the row.
  - `ORCA` row: 942 -> 948 from scripts/verify-sidecar-origin-gate-live.mjs, which is already in the row, plus 13 in
    scripts/verify-sidecar-origin-gate.mjs, which is new to the row. The total after re-measure is 961.
  - The probe under .planning is outside the scan scope.

## Deviations from Plan

1. **[Rule 3 - Blocking] orcad on a free port in the live row and the probe.** An orcad already holding the default
   port 26768 left OrcaService not ready (first run red). Both scripts now pass `powerbrowser.orca.port` from
   `freePort(OrcaEnv)` through `withProbeShell`'s extraPrefs, plus `powerbrowser.orca.root` when this tree has a
   built orca/. The pattern comes from orca-tabs-live. Commit 3f81880d.
2. **[Rule 2] One extra plant** (6 rather than 5): "the bundle route moved off its prefix" covers the plan's
   "pane-bundle route not found" failure text, which the other plants cannot reach.
3. **orcad-origin also checks Origin-less same-site, cross-site and unknown requests from orcad's page.** These are
   the no-cors GET, img and navigation shapes, beyond the Origin-set cases the plan lists.
4. **Agent-overlay class added to the probe** at the caller's request ("agent overlays in the agent container").
   BiDi does not list agent-container contexts, so the probe drives the page through webTabAgent `browser.goto` and
   `browser.eval`.
5. **Live row and probe were run in the lane** against the coordinating workspace's built tree at the same commit,
   not deferred to 67-06. 67-06 still re-runs them on its own merged build.
6. The SUMMARY is a separate commit from Task 2's code, because the caller asked for per-task commits and then a
   summary commit.

## Known Stubs

None.

## Threat Flags

None. No new endpoint or listener. The recorder logs only booleans and the Origin, Sec-Fetch-Site and Sec-Fetch-Dest
values.

## Self-Check: PASSED

- FOUND: scripts/verify-sidecar-origin-gate.mjs, scripts/verify-sidecar-origin-gate-live.mjs, scripts/lib/sidecar-status-recorder.cjs, probes/record-sidecar-headers.mjs
- FOUND: af002471, 3f81880d (ancestors of HEAD)
