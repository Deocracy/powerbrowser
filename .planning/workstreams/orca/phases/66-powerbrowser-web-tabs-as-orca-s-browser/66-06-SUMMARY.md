---
phase: 66-powerbrowser-web-tabs-as-orca-s-browser
plan: 06
subsystem: coordinator (merge, builds, live proofs, brand rows, tracking)
tags: [orca, coordinator, brw-02, brw-03, brw-04, brw-05, merge, live]
status: complete
requires:
  - Phases 64 and 65 merged in that order (precondition held: p64- and p65-04 merges, 65-05-SUMMARY.md)
  - lane SUMMARYs committed on refs/heads/ServerDestroyer/p66-01..05
provides:
  - the five Phase 66 lanes merged into ServerDestroyer/v1.7-Orca-integration in order
  - Orca, the Orca CLI, Theia and PowerBrowser rebuilt from the merged tree
  - live proofs of criteria 1-4 except orca-browser-agent-live clause (j) (owner decision)
  - Orca-family brand rows re-measured; D-33 recorded and folded into Phase 67 (P67-36)
affects: [Phase 67 (P67-36 failure class, 67-01 and 67-03 amended), Phase 68 (re-pin job rows)]
key-files:
  modified:
    - scripts/verify-platform.sh (five merges, registry blocks)
    - scripts/verify-orca-pane-routes.mjs (p66-02's prepared plants patch)
    - scripts/verify-web-tab-bridge.mjs, scripts/verify-orca-browser-tools.mjs, scripts/orca-browser-parity.mjs
    - scripts/verify-no-remote-agent-port-live.mjs, scripts/verify-orca-browser-agent-live.mjs, scripts/verify-orca-agent-mark-live.mjs, scripts/lib/orca-browser-live.mjs
    - theia/extensions/orca-browser/src/browser/orca-browser-frontend-module.ts, theia/extensions/orca-browser/src/common/orca-browser-tools.ts, theia/extensions/tab-uris/src/browser/web-tab.ts
    - powerbrowser/shell/PowerBrowserAPI.sys.mjs, powerbrowser/INTERNAL-APIS.md
    - docs/BUILD.md, inventory/brand-tokens.json, .claude/skills/spike-findings-Power-Browser/references/orca-browser-parity.md
    - .planning/workstreams/orca/DECISIONS.md (D-33), 67-CONTEXT.md, 67-01-PLAN.md, 67-03-PLAN.md
    - .planning/workstreams/orca/STATE.md, ROADMAP.md, REQUIREMENTS.md
decisions:
  - "D-33 (Chris 2026-11-11, option-g): a failed browser-host attach stays a log line in Phase 66; Phase 67 adds the failure class browser-not-attached (P67-36)"
  - "orcad's second loopback listener is Orca's agent-status hook server; it is accepted only from Orca's own endpoint.env port line"
  - "Agent documents are read in live checks through the bridge's browser.eval: agent tabs are not WebDriver BiDi contexts"
  - "A frontend reload ends the previous frontend's pages by browser.tabClose after the next attach (P66-08 as built)"
  - "BRW-02 and BRW-03 stay pending: orca-browser-agent-live is red on clause (j) alone, an owner decision"
metrics:
  completed: 2026-11-11
estimate:
  tokens: 170000
  tasks: 3
actuals:
  tokens: 21000   # chars/4 over the coordinator's own diff (merges excluded), about 84,000 chars
  tasks: 3
  commits: 36    # git rev-list --count aba9f691..HEAD with this file's commit: 19 on the first-parent line, 17 lane commits brought by the merges
plan_head_before: aba9f691
plan_head_after: "the commit that adds this file"
requirements-completed: [BRW-04, BRW-05]
---

# Phase 66 Plan 06: coordinator, Phase 66 merged, built and proven live (one owner blocker) Summary

The five Phase 66 lanes are merged in order. Orca, its CLI, Theia and PowerBrowser are rebuilt
from the merged tree. An Orca agent drives PowerBrowser web tabs end to end through the
chrome-side bridge: tab create, goto, click, type and screenshot at DPR 1 and 2, refusals, the
agent container, saved logins kept out, HTTP auth refused, focus kept, the renderer path over the
device-key credential, user close and reload. The mark and Stop work, no remote-agent port
listens, and snapshots match agent-browser's references. Ten fix(66-06) commits corrected
three product defects and seven check, harness or build defects. One clause cannot pass:
orca-browser-agent-live (j), because no PowerBrowser-hosted page ever becomes an Orca store
record (owner decision below).

## Lanes

| Lane | Branch (refs/heads/...) | Worktree | Tip | SUMMARY | BLOCKER line |
|------|------------------------|----------|-----|---------|--------------|
| p66-01 | ServerDestroyer/p66-01 | /home/chris/orca/workspaces/Power-Browser/p66-01 | 6cbead2c | committed | none |
| p66-02 | ServerDestroyer/p66-02 | /home/chris/orca/workspaces/Power-Browser/p66-02 | 7256c82b | committed | none |
| p66-03 | ServerDestroyer/p66-03 | /home/chris/orca/workspaces/Power-Browser/p66-03 | 7ba51cf4 | committed | none |
| p66-04 (on p66-03) | ServerDestroyer/p66-04 | /home/chris/orca/workspaces/Power-Browser/p66-04 | 9818284b | committed | none |
| p66-05 (on p66-02) | ServerDestroyer/p66-05 | /home/chris/orca/workspaces/Power-Browser/p66-05 | 6bfd8081 | committed | none |

## Pre-merge baseline

`nix develop .#theia --command scripts/verify-platform.sh --quick` on aba9f691 (ORCA_* unset):
385 rows PASS, **0 red rows** (`.mozbuild/p66-06/baseline-quick.txt`).

## Merge record

| Order | Merge commit | Conflicts | Resolution |
|-------|--------------|-----------|------------|
| p66-01 | d9eaa894 | none | - |
| p66-02 | eb1c3885 (`--no-ff --no-commit`) | scripts/verify-platform.sh quick anchor | both blocks kept, 66-01 then 66-02; p66-02's prepared `verify-orca-pane-routes.plants.patch` applied in the merge |
| p66-03 | d74352a4 | verify-platform.sh, both anchors | blocks kept in lane order |
| p66-04 | 34f792bc | none | - |
| p66-05 | 94b8329a | verify-platform.sh, both anchors | blocks kept in lane order |

- Registry: `# NEW (66-0` blocks at the quick anchor 66-01, 66-02, 66-02, 66-03, 66-04, 66-05 (lines 4028-4067); at the full anchor 66-01, 66-03, 66-04, 66-05 (lines 6756-6774). 10 blocks in all.
- build:extensions already read modes, orca-browser, orca-panes, orca-workspace; nothing was moved.
- Scope check (merge rule 2, derived from each plan's files_modified):
  ```
  scope p66-01: base 5a13abab changed 10 planned 10 outside: none
  scope p66-02: base 5a13abab changed 15 planned 15 outside: none
  scope p66-03: base 5a13abab changed 11 planned 10 outside: scripts/verify-ext-tab-host-scope.mjs
  scope p66-04: base refs/heads/ServerDestroyer/p66-03 changed 11 planned 11 outside: none
  scope p66-05: base refs/heads/ServerDestroyer/p66-02 changed 11 planned 10 outside: scripts/verify-shell-error-copy.mjs
  ```
  The two outside paths are the accepted ones (66-03 deviation 1, 66-05 deviation 1). Neither is named in the ledger (a grep of the ledger's REQUIREMENTS.json for both names matched nothing).
- Merge rule (6): P = 29e2021e (first parent of f4e050cc, the merge naming p65-01), Q = 5a13abab (last commit touching 65-05-SUMMARY.md). For p66-01 and p66-02, every line Phase 65 added to each of the six shared files is present: pb-pane-mount.tsx 257/257, orca-pane-routes.ts 63/63, orca-pane-observer.ts 72/72, orca-panes/package.json 1/1, applications/browser/package.json 1/1; theia/package.json's one line is build:extensions, checked by order. Kept.
- After p66-01: orca-overlay, orca-pane-entry-self-test, orca-browser-host-bundle-self-test PASS. After p66-02: orca-pane-routes, orca-pane-routes-self-test, orca-editor-routes, theia-build-order, both 66-02 self-tests PASS; gui02 showed exactly the two recorded cross-lane lines (merge rule 4). After p66-03: gui02-web-tab-bridge PASS, its self-test red (fixed, below), internals-boundary (+self-test), internals-catalogue, ng-040, orca-browser-tab-scope (+self-test), page-tools-reader-crash (+self-test) PASS. After p66-04: the same boundary rows PASS.
- Commit `commandResult`: lane p66-01 maps the client's `result` to Orca's wire field `value` (`pb-browser-host.ts:168-175`: `result === undefined ? rest : { ...rest, value: result }`). Confirmed.

## Cross-lane clauses on the merged tree (no SKIP)

- `orca-browser-abilities: PASS -- ... 40 tier-1 automation methods equal the 40-method served set; chrome AGENT_METHODS compared`
- `orca-browser-entry-points: PASS -- ... served prefix equals the orca-panes route; cross-lane clauses compared`
- `orca-browser-tab-scope: PASS -- 40 methods (15 native, 25 actor): every one refused before page work ...` (page-table clause compared, no SKIP)
- `verify-web-tab-bridge: PASS -- 37 webTab kinds ... agree across 50 sources` (agent contract compared)

## fix(66-06) commits

| Commit | File(s) | Failing line quoted |
|--------|---------|---------------------|
| a8edcbca | scripts/verify-web-tab-bridge.mjs | `'orca-browser present but web-tab.ts lacking the webTabAgent union member' did not go red ... got: (no failures at all)`: on the merged tree the plants removed only the simulated text, not p66-02's real line |
| b177ea87 | orca-browser-tools.ts, verify-orca-browser-tools.mjs | `classification: the privileged webTab kind webTabContextMenuAction is sent from theia/extensions/orca-browser/src/common/orca-browser-tools.ts`: the map's `kind:` key read as a sender; renamed `webTabKind` |
| 932dc91e | scripts/verify-no-remote-agent-port-live.mjs | `the shipped build listens on 127.0.0.1:<port>, owned by pid <orcad> (MainThread), which is not a port PowerBrowser accounts for`: orcad's agent-hook listener, now derived from Orca's endpoint.env |
| 36efe6ea | orca-browser-frontend-module.ts | product: in about half of the sessions the host never attached, and `tab create` answered `browser_unavailable`. The link answers `link_not_ready` until its readiness event, and the host read the link before that and gave up |
| 5c60d6bd | orca-browser-frontend-module.ts | product: `(i) old pages are still listed after the reload (4)`. orcad recovers pages only for the same host client id; the host now closes the previous frontend's pages after the next attach |
| 8684931d | PowerBrowserAPI.sys.mjs, INTERNAL-APIS.md | product: an HTTP auth commonDialog outlived its closed agent tab. It took the user's keys (`(c2) ... ("")`) and broke the next agent goto (`(f) ... (runtime_error)`). webTabClose now cancels it; catalogue rows were renumbered by a line-diff remap (ng-040 --fix mis-assigned rows) |
| 4b4359e1 | verify-orca-browser-agent-live.mjs, lib/orca-browser-live.mjs | `(b) click left the counter at null`: agent tabs are not BiDi contexts, so they are now read through `browser.eval`. The security clauses (e2), (l), (m), (c2) were added, (i) counts only a true attach, and one line is printed per clause |
| e01e5f69 | verify-orca-agent-mark-live.mjs | `harness: timed out after 20000 ms waiting for a stock browser window on the fixture page`: GUI-01 reuses the stock window |
| 0f3e6434 | scripts/orca-browser-parity.mjs | `row browser.clientHost.attach lists users [main], the Orca tree gives [main, renderer]`: PB's overlay copy was counted as an Orca renderer user |
| e6d3fcdc | web-tab.ts, docs/BUILD.md | `'showable gets its own adopted test' did not go red naming 'showable does not read hasPage alone'` (parked duplicated showable); `licensing: FAIL -- shipped but missing from the notices: entities@7.0.1` (the documented CLI build re-installed orca/node_modules) |

Out-of-lane files edited by these fixes, all as root causes, none ledger-named: verify-web-tab-bridge.mjs (p66-03's), orca-browser-parity.mjs (Phase 61), verify-no-remote-agent-port-live.mjs (p66-03's), docs/BUILD.md (p66-01's section). No check was weakened: each change keeps or adds plants.

## Build record

- `nix develop .#theia --command node scripts/generate.mjs`: `generate: PASS -- 72 file(s) written`.
- `nix develop .#orca --command bash scripts/build-orca.sh`: the newest log, `.mozbuild/orca-build/build-20261111T084125Z.log`, has `build-orca: overlay copied` lines for pb-browser-host-link.ts, pb-browser-host.ts and vite.pb-browser-host.config.ts. It reports `build-orca-browser-host: PASS -- 307953 bytes` and `build-orca: PASS -- built v1.4.248 (965978bc...)`. build-orca.sh was re-run after the first CLI build re-installed node_modules.
- Orca CLI: the docs/BUILD.md command with `--config.verify-deps-before-run=false`. `orca/out/cli/index.js` was rebuilt, and node_modules kept build-orca.sh's layout.
- Theia: the audited install (`yarn install --ignore-scripts --frozen-lockfile`, drivelist node-gyp rebuild), then `yarn build` (`[build/browser] Finished with 0 errors`). `theia/yarn.lock` is unchanged. It was rebuilt after each frontend fix.
- PowerBrowser: `./mach build faster` exited 0 (22 s). The chrome modules in objdir are symlinks to the source (`PowerBrowserAPI.sys.mjs`, `GroupActorChild.sys.mjs` carry `AGENT_METHODS` and `agentSnapshot`), so no tier-3 build was needed. Live rows run with `MOZ_PURGE_CACHES=1`.
- `git ls-files -- orca` prints nothing, and `orca-overlay` reports 3 seams (unchanged, P66-31).

## Live and full proofs

Every live row ran under `flock /home/chris/coding/Power-Browser/.git/pb-live.lock` with every inherited `ORCA_*` removed.

### orca-browser-agent-live (final run, `.mozbuild/p66-06/agent-live-final.txt`): FAIL on (j) alone

A confirmation run on the final build (after e6d3fcdc, `.mozbuild/p66-06/confirm-*.txt`) gave the same clause lines ((k) 133 ms, (a) 117 ms, (j) the only FAIL). orca-agent-mark-live passed again on that build.

```
orca-browser-agent-live: clause (k) ok (119 ms)
orca-browser-agent-live: clause (a) ok (127 ms)
orca-browser-agent-live: clause (b) ok
orca-browser-agent-live: clause (b1) ok (DPR 1, 1280x695 px)
orca-browser-agent-live: clause (b2) ok (DPR 2, 1280x622 px)
orca-browser-agent-live: clause (c) ok
orca-browser-agent-live: clause (d) ok
orca-browser-agent-live: clause (e) ok
orca-browser-agent-live: clause (e2) ok (userContextId 6)
orca-browser-agent-live: clause (l) ok
orca-browser-agent-live: clause (m) ok (promptUserAndPass)
orca-browser-agent-live: clause (c2) ok
orca-browser-agent-live: clause (f) ok
orca-browser-agent-live: clause (g) ok (credential device-key, placement client)
orca-browser-agent-live: clause (h) ok
orca-browser-agent-live: clause (j) FAIL
orca-browser-agent-live: clause (i) ok
orca-browser-agent-live: FAIL -- (j) detector blind: store activation not observed
```

- A3 credential path: **device-key** (66-RESEARCH Open Question 1). The renderer path's placement is client, the create arrived as createPage, and there was no `browser_host_lease_stale`. The device check passed: (b1) and (b2) read the page's devicePixelRatio as 1 and 2 before judging pixels.
- Reload (Open Question 3): after the frontend reload the host re-attaches, no agent widget survives, and `tab list` lists none of the old pages. This holds after fix 5c60d6bd; before it, orcad kept them.
- Activation clause (j): the activation detector never fires (see Task 2). The no-pane clause (k) passes: no Orca-pane widget, the bundle booted, and the link was present.
- (f) decoy: the stock half proved both detectors on this host, so the clause is compared, not SKIP.
- Security proofs from 66-03 O-66-03-b, each after its positive read:
  - (c2): the user's keys stay in the user tab while the parked agent page calls focus().
  - (l): a scratch saved login autofills the user tab, and the user tab has the LoginManager actor. The agent tab stays empty, has no LoginManager actor and stores nothing on submit. The live session's WebDriver prefs turn signon off, so the clause restores the defaults first.
  - (m): the HTTP auth prompt is refused to dialogAccept with `browser_command_unavailable`, stays open, and closes with its tab.
  - (e2): the agent overlay's userContextId equals the agent container.

### Other rows

| Row | Result line |
|-----|-------------|
| orca-agent-mark-live | `PASS -- mark and title class while driving, cleared after 21000 ms idle, Stop ended control (browser_owner_unavailable in error.message), stock window unmarked with chrome equal to the baseline (286 nodes)` |
| orca-browser-host-bundle | `PASS -- attach accepted, createPage in 148 ms, user close reported, 307953 bytes; static clauses green over 124 modules and 1157 Orca assets (redaction 0 matches)` |
| orca-browser-snapshot-live | `PASS -- 2 fixture(s), 28 ref'd nodes matched; 7 click(s) on refs landed on their nodes; a removed node's ref answered browser_stale_ref` |
| no-remote-agent-port-live | `PASS -- the control launch's Remote Agent socket was seen on the main process, and the shipped launch listens only on the sidecar's port 34265, orcad's port 21696, orcad's agent-hook endpoint port 45855 and the tab-store endpoint's port 34947 (4 listening socket(s))` |
| no-remote-agent-port-live-self-test | `PASS -- verdict plants each went red naming the drift, and the live Remote Agent control went red naming its socket` |
| orca-overlay | `PASS -- 3 seam(s) ...` (pre-merge 3, unchanged) |
| orca-overlay-built | `PASS -- 9 overlay file(s), each with its marker literal` |
| orca-browser-parity | PASS after fix 0f3e6434 (DISPOSITIONS.md unchanged, P66-19) |
| orca-pane-routes, orca-browser-tools, orca-snapshot-fixtures, privacy-hosts, shell-error-copy-no-internals | PASS |
| verify-endpoints, verify-branding-identity-dev | PASS |
| orca-pane-css-live (first), orca-service-live, orca-hidden-electron | PASS |
| orca-tabs-live | FAIL, stage `tab-groups-cross-client` (g3) only: `the second client shows no tab for T`. This red was recorded before Phase 66 (STATE.md Phase 65 row, TAB-04); every other stage passed, including route and reload |
| orca-workspace-live, orca-relaunch-restore-live, verify-uri-roundtrip, gui07-mode-switch-tabs-live, orca-terminal-keys-live, bundled-extensions-live | PASS |

no-remote-agent-port-live, every socket line of the final run:
```
no-remote-agent-port-live: socket control 127.0.0.1:36851 pid 188786 powerbrowser unaccounted
no-remote-agent-port-live: socket control 127.0.0.1:44247 pid 188980 MainThread sidecar
no-remote-agent-port-live: socket control 127.0.0.1:42119 pid 188980 MainThread tab-store
no-remote-agent-port-live: socket control 127.0.0.1:38799 pid 189014 MainThread orcad-agent-hooks
no-remote-agent-port-live: socket control 127.0.0.1:30559 pid 189014 MainThread orcad
no-remote-agent-port-live: socket shipped 127.0.0.1:34947 pid 189603 MainThread tab-store
no-remote-agent-port-live: socket shipped 127.0.0.1:34265 pid 189603 MainThread sidecar
no-remote-agent-port-live: socket shipped 127.0.0.1:45855 pid 189646 MainThread orcad-agent-hooks
no-remote-agent-port-live: socket shipped 127.0.0.1:21696 pid 189646 MainThread orcad
```
orcad's second port is Orca's agent-status hook server (`AgentHookServer`, 127.0.0.1, ephemeral). Orca documents it in `<ORCA_USER_DATA>/agent-hooks[/<namespace>]/endpoint.env`, whose names come from `server-runtime-env.ts` and `endpoint-publication.ts` at the pin. The check reads only the `ORCA_AGENT_HOOK_PORT` line, never the token. The socket is accepted only when that file names its port. Four plants cover this.

Real Claude: only orca-tabs-live's own stages ran the real claude, as Phase 64 defines them. No prompt was added by this plan.

## P66-33 channel and Task 2

P66-33 channel: none. Chrome's diagnostics rows are written only by `TheiaService.getFailureDetails()` and `OrcaService.getDiagnosticRows()` (powerbrowser.js:312-313, OrcaService.sys.mjs:633). The frontend-to-chrome kinds are `SHELL_MESSAGE_KINDS` (:304), `STORE_REQUEST_KINDS` (:4574) and `WEB_TAB_ACTION_KINDS` (:5047, now with webTabAgent and webTabAgentStop). None of them sets a diagnostics row.

Task 2: P66-33 is answered with **option-g**. Chris, 2026-11-11: "Fold into Phase 67". The answer is recorded as D-33 in DECISIONS.md and routed to Phase 67: 67-CONTEXT P67-36 adds the eighth failure class `browser-not-attached`. That class has the client reason `browser-host-attach-failed`, a sender in `@powerbrowser/orca-browser`, a Reconnect that re-attaches, the diagnostics row "Orca browser host" and live induction 5. 67-01 and 67-03 carry it in their interfaces, task text and checks (commit e383f588).

Task 2, blocker: **orca-browser-agent-live clause (j) cannot pass on the merged tree. It needs an owner decision, which was not asked here.**
- What was measured: no PowerBrowser-hosted page ever becomes an Orca store record in the pane client.
  - With the scratch worktree listed and active in the store, `subscribePanes` lists one terminal record and zero `browser` records.
  - That holds after two CLI `tab create`s, a renderer-path `browser.tabCreate` with client placement, and `tab switch --page`, read 3, 6 and 12 s later.
- Why: Orca's web client materializes browser tabs into its store through WebRuntimeClient's host path (`web-runtime-browser-materialization.ts`), and PB's thin host replaces that path (spike 005 condition 1). P66-09's reveal on a store activation therefore has no event source. The route code and its trace are correct; the event never happens.
- Options for the owner, recommended first:
  - (a) Offer Orca an upstream export that materializes a client-hosted page as a store tab (D-27), and use it once accepted.
  - (b) Have the pane entry export a store action that materializes the tab. This is a Phase 64 entry change, no seam.
  - (d) Record (j) as known-open in WINDOWS.md with its owner reason, which leaves BRW-02 pending.
- Until then BRW-02 and BRW-03 stay pending. Every other clause of their row is green.

## Brand rows changed

Measured with the scanner's own matcher, on the staged merged tree, with each Orca-family coincidental row's only_in lifted. No exclude entry and no new literal row was added. The one in-word join the scan reported was a `\nORCA_` in my own test string, which was rewritten as an array join.

| Row | Old count | New count | Files |
|-----|-----------|-----------|-------|
| Orca | 2108 | 2305 | 137 -> 163 (+26: the lane files, GroupActorChild.sys.mjs, privacy.html, verify-ext-tab-host-scope.mjs, verify-shell-error-copy.mjs, chrome-bar-copy.ts, web-tab.ts) |
| orca | 4199 | 4740 | 142 -> 166 (+24) |
| ORCA | 846 | 942 | 94 -> 107 (+13) |
| orcad | 1218 | 1327 | 87 -> 99 (+12) |
| ORCAD | 190 | 192 | 19 -> 21 (orca-browser-live.mjs, verify-no-remote-agent-port-live.mjs) |
| Orcad | 97 | 102 | 18 -> 19 (verify-orca-browser-host-bundle.mjs) |
| withOrca | 27 | 33 | 14 -> 16 (orca-browser-live.mjs, verify-web-tab-bridge.mjs) |

`scan-brand-residue: PASS -- no residual brand occurrence in 817 scanned file(s)`, and its `--self-test` passes.

## --quick against the baseline

Final gate: `nix develop .#theia --command scripts/verify-platform.sh --quick` on 0abc1e7a gave `verify-platform: PASS -- all checks passed`, 398 rows PASS and 0 red (the baseline had 385 rows and 0 red; the 13 new rows are Phase 66's). Between the merges and the final gate, two rows went red and were fixed in e6d3fcdc: new-window-adopt-self-test and licensing. None is red now.

## Tracking

- ROADMAP: `roadmap.update-plan-progress 66 --ws orca`.
- REQUIREMENTS: BRW-04 (orca-agent-mark-live PASS) and BRW-05 (orca-browser-tools PASS) are complete. BRW-02 and BRW-03 stay pending on clause (j). No WINDOWS.md entry was written, because option-d is not chosen.
- STATE.md:
  - Decisions: the Phase 66 outcome; A1-A5 as built; the P66-09 rule; P66-08 as built; the 66-02/66-05 split; D-33; the mark copy; the port identity.
  - Blockers/Concerns: the (j) blocker; O1; O2; the P66-33 row going to Phase 67 RUN-06 (P67-36); Places history; the Phase 67 and Phase 68 notes.
  - The Phase 66 row of the Phases table and of the Deferred Verification table.
- Nothing was pushed, the ledger was not edited, and `phase complete` was not run.

## Deferred Verification (end-of-milestone pass, D-18)

| Item | Why deferred |
|------|--------------|
| Copy review of the four mark/Stop strings ("Agent in control"; "An Orca agent you started is controlling this tab in ${subject}. Select Stop to end it."; "Stop"; "Stop the agent's control of this tab in ${subject}. The tab stays open.") | Owner copy review |
| The mark and Stop readable and placed in the chrome bar; the title mark in light and dark themes | Visual check |
| An Orca agent session in a real worktree browses, fills a form and screenshots while the user works in another tab | Interaction with a live agent login |
| The privacy paragraph's wording | Owner copy review |
| Clause (f) decoy SKIPs on a host with an installed Orca at an absolute path (it compared here) | Host-dependent |
| CSP-strict pages refuse the agent's eval (`browser_eval_error`) | Known limit |
| Parked agent tabs run with timer throttling (O1) | Owner item |
| Agent-tab page dialogs block the IDE while open (O2) | Owner item |
| Snapshot does not walk same-origin iframes; the delta-size rule approximates agent-browser's | Known limits (66-04) |
| The host does not re-attach after orcad restarts | Phase 67 Reconnect (P67-36) |
| Agent-tab visits enter the user's Places history | Owner item |
| Owner table: spike 005 owner note (S2 over S1), P66-08, P66-11, P66-22, P66-24, P66-26 | Auto-mode picks Chris may override |
| orca-browser-agent-live (j) | Owner decision (Task 2 above) |

## Deviations from Plan

1. [Rule 1/3] Ten fix(66-06) commits, listed above. Three are product defects: the attach race, reload page release and the orphaned prompt. The rest are check, harness or build defects (the parked/showable change is behaviour-neutral).
2. [Rule 3] p66-02's plants patch was applied inside the p66-02 merge commit, not as its own fix commit, so that merge rule (6) holds at that merge.
3. [Rule 2] The four security clauses were added to orca-browser-agent-live, as instructed (66-03 O-66-03-b).
4. Task 1's draft SUMMARY commit was folded into this one SUMMARY.
5. Process: two runs of `no-remote-agent-port-live --self-test` ran outside the live lock. In both I meant to run only its hermetic plants, but the self-test runs its live half when a build exists. The second overlapped the locked live batch, whose rows all passed or failed as recorded above. No stray process or profile was left.
6. Process: the first Orca CLI build used docs/BUILD.md's command, and pnpm re-installed orca/node_modules into its global virtual store. build-orca.sh was re-run, the stale shipped-set cache was set aside under `.mozbuild/p66-06/`, and the doc now carries the flag.
7. Process: one mistyped `git checkout aba9f691 -- .` was refused by the permission layer before it ran. The tree was verified unchanged.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register. The port check reads one line of Orca's endpoint file and never the token. The login clause's password exists only in memory and is compared by length.

## Self-Check: PASSED

- Files: verify-orca-browser-tab-scope.mjs, verify-no-remote-agent-port-live.mjs, orca-browser-frontend-module.ts, references/orca-browser-parity.md FOUND.
- Commits: the five merges (d9eaa894, eb1c3885, d74352a4, 34f792bc, 94b8329a), the ten fixes, e383f588, 7b5c112f and 0abc1e7a are ancestors of HEAD.
