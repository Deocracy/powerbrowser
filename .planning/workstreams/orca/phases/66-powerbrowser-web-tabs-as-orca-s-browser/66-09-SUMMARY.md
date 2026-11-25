---
phase: 66-powerbrowser-web-tabs-as-orca-s-browser
plan: 09
subsystem: chrome agent bridge / Orca hosting checks
status: complete
tags: [security, agent-isolation, gap-closure, D-37, downloads, external-protocols, WINDOWS-47]
requires: [66-08, 67-07]
provides:
  - "D-37: agent-overlay downloads refused (SANDBOXED_DOWNLOADS), external-protocol loads refused (agent-aware dispatch chooser), commands refused on the initial about:blank"
  - "orca-browser-tab-scope wallsClause (download bits and chooser contract derived from the pin)"
  - "orca-browser-agent-live clauses (o), (p), (q)"
  - "logo gate requires Orca ready; failure-page-live reload barrier; shell-request-kinds sender-wall clause"
affects: [powerbrowser/shell/PowerBrowserAPI.sys.mjs, powerbrowser/shell/OrcaEnv.sys.mjs]
tech-stack:
  added: []
  patterns:
    - "SANDBOXED_DOWNLOADS on a chrome-created <browser>'s browsing context (as PageExtractorParent)"
    - "contract override of @mozilla.org/content-dispatch-chooser;1 that delegates to the stock factory (MockRegistrar's pattern)"
key-files:
  created:
    - .planning/workstreams/orca/phases/66-powerbrowser-web-tabs-as-orca-s-browser/66-09-PLAN.md
    - .planning/workstreams/orca/phases/66-powerbrowser-web-tabs-as-orca-s-browser/66-09-SUMMARY.md
  modified:
    - powerbrowser/shell/PowerBrowserAPI.sys.mjs
    - powerbrowser/shell/OrcaEnv.sys.mjs
    - powerbrowser/INTERNAL-APIS.md
    - scripts/verify-orca-browser-tab-scope.mjs
    - scripts/verify-orca-browser-agent-live.mjs
    - scripts/lib/orca-browser-live.mjs
    - scripts/lib/pb-live-probe.mjs
    - scripts/verify-orca-landing-selectors.mjs
    - scripts/verify-shell-request-kinds.mjs
    - scripts/verify-orca-failure-page-live.mjs
    - .planning/workstreams/orca/DECISIONS.md
decisions:
  - "D-37: agent-overlay downloads and external-protocol loads are refused; on the initial about:blank only browser.goto runs (coordinator ruling, owner may override)"
  - "The first-document gap is closed by refusing commands: Gecko gives the initial document InitialSandboxFlags, which has no chrome setter"
  - "Child-run agent commands settle (100 ms beat, then up to 3 s while a document loads) so a network-delayed refusal fails the command that caused it"
metrics:
  duration: "about 1 h 15 min"
  completed: 2026-11-11
estimate:
  tokens: 60000
  tasks: 3
actuals:
  tokens: 72000
  tasks: 3
  commits: 3
plan_head_before: 06059cf4393405497dea936dca16992625e89329
plan_head_after: f42a2cb499be6e8867384ff724ae2abcb1505d01
---

# Phase 66 Plan 09: downloads, external protocols and the first document (D-37) Summary

An agent page can no longer save a file, open a download viewer, raise an external-protocol dialog or launch an external application. Agent commands on an overlay's initial `about:blank` are refused. Each gap was first confirmed live on the unmodified tree, then shown closed by new live clauses (o), (p) and (q), which first prove their user-side detectors. Three Phase 67 follow-ups are closed as well.

(`commits: 3` was measured when this SUMMARY was written, before the docs commit that adds it.)

## Each path: mechanism and result

| Path | Before (live probe, unmodified tree) | Mechanism | After (live) |
|------|--------------------------------------|-----------|--------------|
| Download from an agent page (click on a PDF attachment link, `browser.goto` of an attachment) | `probe-1.txt`: the file was saved to the download folder and its viewer opened a new stock window (`chrome://browser/content/browser.xhtml`) | `SANDBOXED_DOWNLOADS` (0x10000) joins `SANDBOXED_AUXILIARY_NAVIGATION` in `agentTabCreated`'s single write. Gecko's `ClassifyDownload` then returns `DOWNLOAD_FORBIDDEN` and cancels the channel with `NS_ERROR_ABORT` before a file, a download row or a viewer exists. Frames inherit the flag. The detector is a new `http-on-stop-request` arm in `agentNetworkObserver`: an agent overlay's document channel that stopped with `NS_ERROR_ABORT` counts as a refused "download" | (o): no file, no download row, no window; the click and the goto each answer `failed browser_command_unavailable` |
| External protocol from an agent page (`mailto:`, a granted scheme, a scheme that asks) | `probe-1.txt`: a custom scheme raised `permissionDialog.xhtml` as a standalone window | `agentProtocolWallInstall` (run with the first agent tab) points `@mozilla.org/content-dispatch-chooser;1` at a chooser. That chooser refuses a browsing context whose top embedder is an agent overlay and passes every other load to Gecko's own factory, which it keeps through `getClassObject`. A sandbox flag cannot do this job, because `ExternalProtocolIsBlockedBySandbox` exempts top-level contexts | (p): no launch and no dialog, including the granted scheme in the agent container; each click answers `failed browser_command_unavailable` |
| Commands on the initial `about:blank` (Gap 2) | `probe-2.txt`: a tab created with `--url` for a held first load was on its initial document (`isInitialDocument` true). There, `mouseClick` and then `eval window.open(..., 'width=..')` opened a stock popup window and loaded its page. A tab created without a URL is not exposed: its navigated `about:blank` is not initial and carries the flags (`window.open` threw) | In `handleWebTabAgent`, every method except `browser.goto` answers `failed browser_command_unavailable` while `currentWindowGlobal.isInitialDocument === true`. The flags cannot be moved earlier: nsDocShell builds the initial document from `InitialSandboxFlags` (nsDocShell.cpp:6619-6622), which has no webidl setter | (q): both commands refused, 0 windows, 0 loads; after the first load commits, `eval` answers `done /slow` |
| Refusal reaching the command | `opq-1.txt`: the download click answered `done`, because the cancel arrives a network round trip after the child's reply | `agentSettleOpens`: after a child-run command, wait one 100 ms beat, then keep waiting while the overlay loads a document, until a refusal lands or 3 s pass | (o) and (p) replies are refused (`opq-2.txt`, `agent-live-1.txt`) |

Refusals use D-35's `agentOpenRefused`. Each is logged once per tab and path ("download", "protocol launch") without the URL.

## Phase 67 follow-ups

- **(a) Logo gate.** `OrcaEnv.logoAnswerFor` now takes `orcaState` and answers only `"ready"`, and the logo parent passes `OrcaService.getState().state`. `orca-landing-selectors` derives every state from OrcaService's `_state` literals (idle, starting, ready, stopped, failed) and requires each non-ready state to be refused. It has a new plant, a gate that ignores the state, which goes red naming "answered Orca failed on orcad's port". Live `orca-landing-logo-live` still passes.
- **(b) WINDOWS 47.** `orca-failure-page-live` records `performance.timeOrigin` before `location.reload()` and waits for a different value before the ready probe. Results are in the WINDOWS 47 section below.
- **(c) Sender wall.** `shell-request-kinds` clause 3 checks three things: `groupSenderIsTheia` is `handleShellMessage`'s first statement and returns `{ ok: false }`; every case label comes after it; and every handler a case returns into (derived; today `handleOrcaShellMessage`) is called nowhere else in the file. It has three new plants, all red: a routed kind dispatched ahead of the wall, a second caller outside the switch, and the wall removed. The routed kind and handler are derived at self-test time, so the file names no brand token.

## Tasks

| Task | Commit | Files |
|------|--------|-------|
| D-37 and plan | 889dddeb | DECISIONS.md, 66-09-PLAN.md |
| 1: walls, tab-scope and agent-live clauses | 2b906af1 | PowerBrowserAPI.sys.mjs, INTERNAL-APIS.md, verify-orca-browser-tab-scope.mjs, verify-orca-browser-agent-live.mjs, lib/orca-browser-live.mjs, lib/pb-live-probe.mjs |
| 2: Phase 67 follow-ups | f42a2cb4 | OrcaEnv.sys.mjs, PowerBrowserAPI.sys.mjs (logo state), INTERNAL-APIS.md (logo row text), verify-orca-landing-selectors.mjs, verify-shell-request-kinds.mjs, verify-orca-failure-page-live.mjs |
| 3: SUMMARY | (docs commit) | 66-09-SUMMARY.md |

## Checks

- **orca-browser-tab-scope** gains `wallsClause`. It derives the download bits from the pinned `ClassifyDownload` and `nsSandboxFlags.h`, and the chooser contract from the pinned `LoadURI`. It drives every network observer the section registers with every topic, and covers the initial-document guard. Self-test: 40 plants, all red (30 before). The 10 new ones: download bit dropped, download bit on the wrong value, observer unregistered, every cancelled channel counted, settle dropped, chooser not installed, chooser passing agent loads, chooser refusing every load, guard dropped, guard refusing goto. The fake world now records observers and factories, and its `sleep` resolves short beats only. The adopt fallback's 5 s timeout still never fires.
- **orca-browser-agent-live** gains (o), (p) and (q), with fixtures `/dlpage`, three PDF attachments, `/proto` and `/slow` (held headers), plus a `raw` page option in `serveNavPages`. Self-test: 75 plants (56 before).
- **INTERNAL-APIS:** 8 new rows: registrar, `getClassObject`, `registerFactory`/`generateUUID`, the stock `createInstance`, two `generateQI`, the stop-request observer, and the `NS_ERROR_ABORT` read. The sandboxFlags and logo rows were amended. Existing rows were renumbered by exact old-to-new mapping, which was cross-checked against `difflib` over the HEAD version (407 rows, 0 mismatches). `ng-040 --fix` moved the two `handleOrcaShellMessage` rows onto the module-URL constants, so I corrected them by hand. `internals-boundary`, `internals-catalogue` and `ng-040` all pass.

## Live results (`.mozbuild/p66-09/`, under the lock, ORCA_* unset, MOZ_PURGE_CACHES=1)

The lane has no objdir. `.mozbuild/p66-09-bin` is a hard-link copy of the integration objdir's `dist/bin`, with its eight shell symlinks pointed at this worktree. `PB_BACKEND_MAIN` points at the integration Theia build, and the untracked `orca` points at the integration Orca build. The changes are chrome JS only, so no build was needed.

- `agent-live-1.txt` (full row, Task 1 tree): every clause ok except (f). In detail: (n) ok with `sandboxFlags 65538`; (o) ok (user saved, 1 row, 0 windows; agent 2 requests, folder 1 -> 1 file, rows 1 -> 1, 0 windows, click and goto `failed browser_command_unavailable`); (p) ok (user: mailto and pbrun launched, pbask 1 dialog; agent: 0 launches, 0 windows, all three refused); (q) ok (initial true, mouseClick and popup refused, 0 windows, 0 loads, `done /slow` after); (j) reveal 11 ms; (k) 128 ms; (a) 120 ms. **(f) FAIL:** "orcad exited during the switched run". It is not caused by this lane: `verify-orca-hidden-electron.mjs` fails the same way standalone, and twice from the integration worktree's own copy, with no browser involved and no file of this lane in its path.
- `opq-2.txt`: (o), (p) and (q) in one session, all ok.
- `orca-agent-mark-live.txt`: PASS (cleared after 21000 ms idle, Stop ended control, stock window unmarked, 286 nodes).
- `orca-landing-logo-live.txt`: PASS.
- Gap evidence on the unmodified tree: `probe-1.txt` and `probe-2.txt`.

## WINDOWS 47 repeat results (orca-failure-page-live with the reload barrier)

| Run | Result | Time | Counted |
|-----|--------|------|---------|
| w47-run1 | PASS | 210 s | yes |
| w47-run2 | PASS | 173 s | no: it ran 13:36:32-13:39:25, the window in which the Phase 68 coordinator's cleanup stopped an orcad (coordinator note) |
| w47-run3 | PASS | 168 s | yes |
| w47-run4 | PASS | 174 s | yes |
| w47-run5 | PASS | 173 s | yes |
| w47-run6 | PASS | 173 s | yes |
| w47-run7 (replacement) | PASS | 174 s | yes |

That is 6 of 6 counted runs green, and 7 of 7 overall. The 67-07 rate before the barrier was 1 red in 6.

## Quick gate

`nix develop .#theia --command scripts/verify-platform.sh --quick` (`quick-1.txt`): 412 rows, 13 red. None of the reds is in a row this plan touched. Their causes:
- No `theia/node_modules` install in the lane (it is a symlink): `single-copy-deps`, `ng086-theia-react-node`, `gui07-strip-spike-verdict`(+self-test, through the core-diff integrity), `gui09-dependent-window-content`(+self-test).
- No `.mozbuild/corepack`: `licence-allowlist`, `licensing`.
- The untracked `orca` symlink, which `/orca/` does not match: `orca-pin`(+self-test).
- The sandbox's socket: `fixer-isolate-self-test`.
- Already red at the base 06059cf4: `scan-brand-residue`(+self-test). Brand rows are listed below.

The rows this plan touched or depends on all pass: orca-browser-tab-scope(+self-test), orca-browser-agent-live-self-test, orca-landing-selectors(+self-test), shell-request-kinds(+self-test), orca-failure-page-live-self-test, new-window-adopt(+self-test), gui02-web-tab-bridge(+self-test), internals-boundary, internals-catalogue, ng-040, orca-overlay, orca-service(+self-test), orca-failure-classes, privacy-hosts, shell-error-copy-no-internals, orca-browser-abilities, orca-browser-entry-points, orca-browser-tools, orca-agent-mark-live-self-test, orca-landing-logo-live-self-test.

## Brand rows for the coordinator (inventory/brand-tokens.json not edited)

`node scripts/scan-brand-residue.mjs`, counts before this SUMMARY's commit:

| Row | Expected (json) | Base 06059cf4 | This branch | Lane delta |
|-----|-----------------|---------------|-------------|------------|
| Orca | 2841 | 2847 | 2862 | +15 |
| orca | 5330 | 5340 | 5356 | +16 |
| orcad | 1639 | 1639 | 1643 | +4 |
| ORCA / renderOrcaSection / runOrca( | 1220 / 5 / 4 | 1221 / 6 / 5 | 1221 / 6 / 5 | 0 |

The condition-4 lines are the base's 15 (`orca-overlay/upstream/010-...`); this lane adds none. The occurrences are in DECISIONS.md, 66-09-PLAN.md, OrcaEnv.sys.mjs, INTERNAL-APIS.md, PowerBrowserAPI.sys.mjs, verify-orca-browser-agent-live.mjs and verify-orca-landing-selectors.mjs. This SUMMARY adds more, so re-measure after the merge.

## Privacy paragraph

I re-read `website-staging/privacy.html:86-87`. It still says "An agent never reaches your other tabs or your browser windows", and that holds now: an agent download no longer opens a stock window, and a protocol dialog no longer opens as a window. Downloads are refused rather than kept, so no sentence about agent files is needed. I did not edit the page.

## Deviations from Plan

- **[Rule 1] Settle beat added.** Live, the download click answered `done`: the wall's cancel arrives after the page child replies. `agentSettleOpens` was added, with a tab-scope scenario and a plant. This is a latency change: every child-run agent command now takes at least 100 ms, and up to 3 s while a document it started is loading. T-66-09-06 accepts it, and the code carries a `shortcut:` comment with the upgrade path (a per-channel wait).
- **[Rule 1] `Components.classesByID` is undefined in this Gecko.** The first live run showed no launch and no dialog for the user either, because the chooser could not create the stock instance. It now keeps the stock factory through `Components.manager.getClassObject`.
- **Ruling interpretation:** "refuse every agent command until the first real load has committed" exempts `browser.goto`. Without that exemption, a tab whose first URL is held could never be navigated away, and goto replaces the initial document with one that carries the flags.
- **Staging:** the Task 1 commit holds the API and catalogue content minus the two logo-state lines. That content was written to the index with `git hash-object`/`update-index`, so each commit is self-consistent (ng-040 holds at both commits).
- **Branch:** commits are on `ServerDestroyer/gap-66-09` as the coordinator assigned, not on an `agent-*` branch.

## Known Stubs

None.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: component-override | powerbrowser/shell/PowerBrowserAPI.sys.mjs | The process-wide `@mozilla.org/content-dispatch-chooser;1` contract is re-pointed at a PB chooser once the first agent tab exists. Non-agent loads go to the stock factory unchanged. A Gecko re-pin that renames the contract turns tab-scope red, because the contract is derived from the pinned LoadURI |

## Owner items

- D-37 is a coordinator ruling. One open question is whether real agent workflows need a download (an agent fetching a report) or a `mailto:` hand-off. Options: an agent-only download folder plus a privacy sentence, or a per-scheme allow list.
- T-66-09-04: a compromised content process could clear its own `SANDBOXED_DOWNLOADS`, as with D-35. The protocol refusal is parent-side and does not depend on that flag.

## Merge note for the coordinator

1. Merge `refs/heads/ServerDestroyer/gap-66-09` (4 commits on 06059cf4). It is chrome JS and checks only: no Gecko patch, no `upstream/`, no tracked `orca/`, no seam, no Theia edit. `./mach build faster` plus `-purgecaches` loads it. In a dev objdir the shell modules are symlinks, so a restart with `MOZ_PURGE_CACHES=1` is enough.
2. `PowerBrowserAPI.sys.mjs` changes in the agent section (`agentTabCreated`, the new constants and `agentProtocolWallInstall` after `agentOpenGuard`, `agentNetworkInstall`/`agentNetworkObserver`, and `agentSettleOpens` plus the guard in `handleWebTabAgent`) and in two logo-parent lines. If the integration branch has moved this file, run `node scripts/verify-ng-040-internals-catalogue-lines.mjs --fix` and then check the two `handleOrcaShellMessage` importESModule rows by hand: `--fix` puts them on the `ORCA_*_MODULE` const lines.
3. Re-measure `scan-brand-residue` after the merge and update the brand rows (table above), which this lane did not edit.
4. After the merge, re-run under the lock: orca-browser-agent-live (expect (f) red until the orca-hidden-electron "orcad exited during the switched run" failure is fixed; it fails on the integration tree too), orca-browser-tab-scope(+self-test), orca-failure-page-live, orca-landing-logo-live.
5. WINDOWS 47: 6 of 6 counted runs green with the barrier. The coordinator decides whether to close the row (this lane does not edit WINDOWS.md).
6. Untracked lane-only items (`orca` symlink, `upstream`, `theia/node_modules`, `generated/`, `.mozbuild/p66-09-bin`) are not committed. The `orca` symlink is removed at the end of this lane.

## Self-Check: PASSED

- FOUND: 66-09-PLAN.md, 66-09-SUMMARY.md, .mozbuild/p66-09/agent-live-1.txt, w47-run1..7.txt, probe-1.txt, probe-2.txt
- FOUND: 889dddeb, 2b906af1, f42a2cb4 (ancestors of HEAD)
